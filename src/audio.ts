const TARGET_SAMPLE_RATE = 16000;
const INPUT_PLAYBACK_SAMPLE_RATE = 24000;
const RECORDER_BUFFER_SIZE = 2048;
const PLAYBACK_SCHEDULE_LEAD_SECONDS = 0.03;

function resampleBuffer(input: Float32Array, inputRate: number, outputRate: number) {
  if (!input.length) {
    return new Float32Array(0);
  }

  if (inputRate === outputRate) {
    return input;
  }

  const sampleRateRatio = outputRate / inputRate;
  const newLength = Math.max(1, Math.round(input.length * sampleRateRatio));
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i += 1) {
    const sourceIndex = (i * inputRate) / outputRate;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(leftIndex + 1, input.length - 1);
    const interpolation = sourceIndex - leftIndex;

    result[i] = input[leftIndex] + (input[rightIndex] - input[leftIndex]) * interpolation;
  }

  return result;
}

function floatTo16BitPCM(input: Float32Array) {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Uint8Array(buffer);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export interface RecorderHandle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  dispose: () => Promise<void>;
}

export interface AudioPlayerHandle {
  enqueue: (base64Chunk: string) => Promise<void>;
  getBufferedMs: () => number;
  prepare: () => Promise<void>;
  reset: () => void;
  dispose: () => Promise<void>;
}

export function createPcmRecorder(onChunk: (base64Chunk: string) => void): RecorderHandle {
  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  let mutedNode: GainNode | null = null;
  let recorderGeneration = 0;
  let startPromise: Promise<void> | null = null;

  async function cleanupRecorderResources() {
    processorNode?.disconnect();
    sourceNode?.disconnect();
    mutedNode?.disconnect();
    processorNode = null;
    sourceNode = null;
    mutedNode = null;

    stream?.getTracks().forEach((track) => track.stop());
    stream = null;

    if (audioContext) {
      const contextToClose = audioContext;
      audioContext = null;

      if (contextToClose.state !== 'closed') {
        await contextToClose.close();
      }
    }
  }

  async function start() {
    if (stream && audioContext && processorNode && sourceNode) {
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      return;
    }

    if (startPromise) {
      return startPromise;
    }

    const generation = ++recorderGeneration;

    startPromise = (async () => {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const nextContext = new AudioContext({ latencyHint: 'interactive' });
      const nextSourceNode = nextContext.createMediaStreamSource(nextStream);
      const nextProcessorNode = nextContext.createScriptProcessor(RECORDER_BUFFER_SIZE, 1, 1);
      const nextMutedNode = nextContext.createGain();
      nextMutedNode.gain.value = 0;

      nextProcessorNode.onaudioprocess = (event) => {
        if (generation !== recorderGeneration) {
          return;
        }

        const input = event.inputBuffer.getChannelData(0);
        if (!input.length) {
          return;
        }

        const downsampled = resampleBuffer(
          input,
          event.inputBuffer.sampleRate,
          TARGET_SAMPLE_RATE,
        );
        if (!downsampled.length) {
          return;
        }

        const pcm = floatTo16BitPCM(downsampled);
        onChunk(bytesToBase64(pcm));
      };

      try {
        await nextContext.resume();
        nextSourceNode.connect(nextProcessorNode);
        nextProcessorNode.connect(nextMutedNode);
        nextMutedNode.connect(nextContext.destination);

        if (generation !== recorderGeneration) {
          nextProcessorNode.disconnect();
          nextSourceNode.disconnect();
          nextMutedNode.disconnect();
          nextStream.getTracks().forEach((track) => track.stop());
          await nextContext.close();
          return;
        }

        stream = nextStream;
        audioContext = nextContext;
        sourceNode = nextSourceNode;
        processorNode = nextProcessorNode;
        mutedNode = nextMutedNode;
      } catch (error) {
        nextProcessorNode.disconnect();
        nextSourceNode.disconnect();
        nextMutedNode.disconnect();
        nextStream.getTracks().forEach((track) => track.stop());

        if (nextContext.state !== 'closed') {
          await nextContext.close();
        }

        throw error;
      }
    })().finally(() => {
      startPromise = null;
    });

    return startPromise;
  }

  async function stop() {
    recorderGeneration += 1;

    if (startPromise) {
      try {
        await startPromise;
      } catch {
        // Propagate the original start error to the caller, but still run cleanup.
      }
    }

    await cleanupRecorderResources();
  }

  async function dispose() {
    await stop();
  }

  return { start, stop, dispose };
}

function base64ToBytes(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function pcm16ToFloat32(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleCount = bytes.byteLength / 2;
  const samples = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i += 1) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000;
  }

  return samples;
}

export function createPcmPlayer(): AudioPlayerHandle {
  let audioContext: AudioContext | null = null;
  let outputNode: GainNode | null = null;
  let nextStartTime = 0;
  let enqueueChain = Promise.resolve();
  let queueGeneration = 0;
  const activeSources = new Map<AudioBufferSourceNode, number>();

  function pruneFinishedSources(currentTime: number) {
    for (const [source, endTime] of activeSources) {
      if (endTime <= currentTime) {
        activeSources.delete(source);
      }
    }
  }

  async function ensureContext() {
    if (!audioContext) {
      audioContext = new AudioContext({
        latencyHint: 'interactive',
        sampleRate: INPUT_PLAYBACK_SAMPLE_RATE,
      });
      outputNode = audioContext.createGain();
      outputNode.connect(audioContext.destination);
    }

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    pruneFinishedSources(audioContext.currentTime);

    if (nextStartTime < audioContext.currentTime + PLAYBACK_SCHEDULE_LEAD_SECONDS) {
      nextStartTime = audioContext.currentTime + PLAYBACK_SCHEDULE_LEAD_SECONDS;
    }

    return audioContext;
  }

  async function enqueue(base64Chunk: string) {
    const generation = queueGeneration;

    const task = enqueueChain.then(async () => {
      if (generation !== queueGeneration) {
        return;
      }

      const context = await ensureContext();
      if (generation !== queueGeneration) {
        return;
      }

      const inputSamples = pcm16ToFloat32(base64ToBytes(base64Chunk));
      if (!inputSamples.length) {
        return;
      }

      const playbackSamples = resampleBuffer(
        inputSamples,
        INPUT_PLAYBACK_SAMPLE_RATE,
        context.sampleRate,
      );
      if (!playbackSamples.length) {
        return;
      }

      const buffer = context.createBuffer(1, playbackSamples.length, context.sampleRate);
      buffer.getChannelData(0).set(playbackSamples);

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(outputNode ?? context.destination);

      const startTime = Math.max(nextStartTime, context.currentTime + PLAYBACK_SCHEDULE_LEAD_SECONDS);
      const endTime = startTime + buffer.duration;

      source.onended = () => {
        activeSources.delete(source);
      };

      activeSources.set(source, endTime);
      source.start(startTime);
      nextStartTime = endTime;
    });

    enqueueChain = task.catch(() => undefined);
    return task;
  }

  async function prepare() {
    const context = await ensureContext();
    const buffer = context.createBuffer(1, 1, context.sampleRate);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(outputNode ?? context.destination);
    source.start(context.currentTime);
  }

  function reset() {
    queueGeneration += 1;
    enqueueChain = Promise.resolve();

    for (const source of activeSources.keys()) {
      try {
        source.stop();
      } catch {
        // Ignore already-ended sources.
      }
    }
    activeSources.clear();

    if (audioContext) {
      nextStartTime = audioContext.currentTime;
    } else {
      nextStartTime = 0;
    }
  }

  function getBufferedMs() {
    if (!audioContext) {
      return 0;
    }

    pruneFinishedSources(audioContext.currentTime);

    if (!activeSources.size && nextStartTime < audioContext.currentTime) {
      nextStartTime = audioContext.currentTime;
    }

    return Math.max(0, nextStartTime - audioContext.currentTime) * 1000;
  }

  async function dispose() {
    reset();

    if (audioContext) {
      outputNode?.disconnect();
      outputNode = null;

      const contextToClose = audioContext;
      audioContext = null;

      if (contextToClose.state !== 'closed') {
        await contextToClose.close();
      }
    }
  }

  return { enqueue, getBufferedMs, prepare, reset, dispose };
}
