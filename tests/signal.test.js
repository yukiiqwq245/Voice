const assert = require('node:assert/strict');
const { estimatePitch, toWav } = require('../web/signal.js');
for (const frequency of [90, 125, 175, 220, 300, 440]) {
  const samples = Float32Array.from({length: 4096}, (_, i) => .45 * Math.sin(2 * Math.PI * frequency * i / 48000));
  const result = estimatePitch(samples, 48000);
  assert(result && Math.abs(result.hz - frequency) < 2, `Expected ${frequency} Hz, got ${result?.hz}`);
}
assert.equal(estimatePitch(new Float32Array(4096), 48000), null);
const channels = [Float32Array.from([0, .5, -.5, 1]), Float32Array.from([0, .5, -.5, -1])];
const wav = toWav({numberOfChannels: 2, length: 4, sampleRate: 16000, getChannelData: i => channels[i]});
const v = new DataView(wav);
assert.equal(String.fromCharCode(...new Uint8Array(wav, 0, 4)), 'RIFF');
assert.equal(v.getUint32(24, true), 16000);
assert.equal(v.getUint16(22, true), 1);
assert.equal(v.getInt16(46, true), 16383);
assert.equal(v.getInt16(50, true), 0);
console.log('Pitch and WAV checks passed.');
