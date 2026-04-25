class MicPcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) {
      return true;
    }

    const pcm = new Int16Array(input.length);
    let energy = 0;

    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i] || 0));
      energy += sample * sample;
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    this.port.postMessage(
      {
        pcm: pcm.buffer,
        energy: Math.sqrt(energy / input.length),
      },
      [pcm.buffer],
    );

    return true;
  }
}

registerProcessor("mic-pcm-processor", MicPcmProcessor);
