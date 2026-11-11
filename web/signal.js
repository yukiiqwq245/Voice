(function (root) {
  'use strict';

  // A lightweight YIN-style estimator for browser-side practice. This is
  // intentionally separate from the original Pitchee SwiftF0 model.
  function estimatePitch(input, sampleRate, options = {}) {
    const minHz = options.minHz || 70;
    const maxHz = options.maxHz || 600;
    const decimation = Math.max(1, Math.floor(sampleRate / 12000));
    const rate = sampleRate / decimation;
    const n = Math.floor(input.length / decimation);
    if (n < 128) return null;
    const x = new Float32Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) { x[i] = input[i * decimation]; mean += x[i]; }
    mean /= n;
    let energy = 0;
    for (let i = 0; i < n; i++) { x[i] -= mean; energy += x[i] * x[i]; }
    const rms = Math.sqrt(energy / n);
    if (rms < (options.minRms || 0.008)) return null;
    const maxLag = Math.min(Math.floor(rate / minHz), Math.floor(n / 2));
    const minLag = Math.max(2, Math.floor(rate / maxHz));
    if (maxLag <= minLag) return null;
    const diff = new Float64Array(maxLag + 1);
    const cmnd = new Float64Array(maxLag + 1);
    cmnd[0] = 1;
    let cumulative = 0;
    const length = n - maxLag;
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < length; i++) {
        const delta = x[i] - x[i + lag];
        sum += delta * delta;
      }
      diff[lag] = sum;
      cumulative += sum;
      cmnd[lag] = cumulative > 1e-12 ? sum * lag / cumulative : 1;
    }
    let selected = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (cmnd[lag] < (options.threshold || 0.15)) {
        while (lag < maxLag && cmnd[lag + 1] < cmnd[lag]) lag++;
        selected = lag;
        break;
      }
    }
    if (selected < 0) return null;
    let refined = selected;
    if (selected > 1 && selected < maxLag) {
      const left = cmnd[selected - 1], middle = cmnd[selected], right = cmnd[selected + 1];
      const denominator = 2 * (2 * middle - right - left);
      if (Math.abs(denominator) > 1e-9) refined += (right - left) / denominator;
    }
    const hz = rate / refined;
    return hz >= minHz && hz <= maxHz
      ? { hz, confidence: Math.max(0, 1 - cmnd[selected]), rms }
      : null;
  }

  function toWav(audioBuffer) {
    const channels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    function write(offset, text) { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); }
    write(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); write(8, 'WAVE');
    write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, length * 2, true);
    const data = Array.from({length: channels}, (_, index) => audioBuffer.getChannelData(index));
    for (let i = 0; i < length; i++) {
      let value = 0;
      for (let c = 0; c < channels; c++) value += data[c][i] / channels;
      value = Math.max(-1, Math.min(1, value));
      view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
    }
    return buffer;
  }
  const api = { estimatePitch, toWav };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PitcheeSignal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
