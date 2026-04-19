const TARGET_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

function downsampleBuffer(input: Float32Array, inputRate: number, outputRate: number) {
  if (outputRate >= inputRate) {
    return input;
  }

  const sampleRateRatio = inputRate / outputRate;
  const newLength = Math.round(input.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accumulator = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i += 1) {
      accumulator += input[i];
      count += 1;
    }

    result[offsetResult] = accumulator / count;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
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
  reset: () => void;
  dispose: () => Promise<void>;
}

export function createPcmRecorder(onChunk: (base64Chunk: string) => void): RecorderHandle {
  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let processorNode: ScriptProcessorNode | null = null;

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    audioContext = new AudioContext();
    sourceNode = audioContext.createMediaStreamSource(stream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);

    processorNode.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const downsampled = downsampleBuffer(input, audioContext!.sampleRate, TARGET_SAMPLE_RATE);
      const pcm = floatTo16BitPCM(downsampled);
      onChunk(bytesToBase64(pcm));
    };

    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);
  }

  async function stop() {
    processorNode?.disconnect();
    sourceNode?.disconnect();
    processorNode = null;
    sourceNode = null;

    stream?.getTracks().forEach((track) => track.stop());
    stream = null;

    if (audioContext) {
      await audioContext.close();
      audioContext = null;
    }
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
  let nextStartTime = 0;
  const activeSources = new Set<AudioBufferSourceNode>();

  async function ensureContext() {
    if (!audioContext) {
      audioContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    }

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (nextStartTime < audioContext.currentTime) {
      nextStartTime = audioContext.currentTime;
    }

    return audioContext;
  }

  async function enqueue(base64Chunk: string) {
    const context = await ensureContext();
    const samples = pcm16ToFloat32(base64ToBytes(base64Chunk));
    if (!samples.length) {
      return;
    }

    const buffer = context.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => {
      activeSources.delete(source);
    };

    activeSources.add(source);
    source.start(nextStartTime);
    nextStartTime += buffer.duration;
  }

  function reset() {
    for (const source of activeSources) {
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

    return Math.max(0, nextStartTime - audioContext.currentTime) * 1000;
  }

  async function dispose() {
    reset();

    if (audioContext) {
      await audioContext.close();
      audioContext = null;
    }
  }

  return { enqueue, getBufferedMs, reset, dispose };
}
