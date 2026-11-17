class VoiceCapture {
  async start(onLimit) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio:{channelCount:1, echoCancellation:false, noiseSuppression:false},
        video:false,
      });
      this.context = new AudioContext();
      await this.context.resume();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.samples = new Float32Array(this.analyser.fftSize);
      this.context.createMediaStreamSource(this.stream).connect(this.analyser);
      const mutedOutput = this.context.createGain();
      mutedOutput.gain.value = 0;
      this.analyser.connect(mutedOutput).connect(this.context.destination);
      this.chunks = [];
      this.recorder = new MediaRecorder(this.stream);
      this.recorder.addEventListener('dataavailable', ({data}) => { if (data.size) this.chunks.push(data); });
      this.finished = new Promise(resolve => this.recorder.addEventListener('stop', resolve, {once:true}));
      this.recorder.start();
      this.limit = setTimeout(onLimit, 89000);
    } catch (error) {
      this.release();
      throw error;
    }
  }

  level() {
    this.analyser.getFloatTimeDomainData(this.samples);
    const volume = Math.sqrt(this.samples.reduce((sum, value) => sum + value * value, 0) / this.samples.length);
    return Math.min(1, Math.max(0, (volume - .013) * 7.5));
  }

  release() {
    clearTimeout(this.limit);
    this.stream?.getTracks().forEach(track => track.stop());
    this.context?.close().catch(() => {});
  }

  async stop() {
    clearTimeout(this.limit);
    try {
      if (this.recorder.state === 'recording') this.recorder.stop();
      await this.finished;
      this.stream.getTracks().forEach(track => track.stop());
      const recording = new Blob(this.chunks, {type:this.recorder.mimeType});
      if (!recording.size) return null;
      const sound = await this.context.decodeAudioData(await recording.arrayBuffer());
      const frames = Math.min(90 * 16000, Math.ceil(sound.duration * 16000));
      if (frames < 2400) return null;
      const resampler = new OfflineAudioContext(1, frames, 16000);
      const source = resampler.createBufferSource();
      source.buffer = sound;
      source.connect(resampler.destination);
      source.start();
      return pcmWav((await resampler.startRendering()).getChannelData(0));
    } finally {
      this.release();
    }
  }
}

function pcmWav(samples) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => bytes.set(new TextEncoder().encode(value), offset);
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, bytes.length - 44, true);
  for (let index = 0; index < samples.length; index++) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, value * (value < 0 ? 32768 : 32767), true);
  }
  return bytes;
}
