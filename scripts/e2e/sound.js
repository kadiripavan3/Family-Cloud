// A sound file for the walk-through: where the screens have a microphone, a browser picks a sound file
// instead. This writes a short, quiet tone as a WAV file (the simplest sound file there is) and returns
// where it is.
const fs = require('fs');
const path = require('path');

/** Writes `seconds` of a soft tone to `<dir>/<name>.wav` and returns the file's path. */
function soundFile(dir, name = 'recording', seconds = 2) {
  const rate = 8000;
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 2000), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); // the size of what describes the sound
  head.writeUInt16LE(1, 20); // plain samples
  head.writeUInt16LE(1, 22); // one channel
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.wav`);
  fs.writeFileSync(file, Buffer.concat([head, data]));
  return file;
}

module.exports = { soundFile };
