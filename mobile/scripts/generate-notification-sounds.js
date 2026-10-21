/* global __dirname, Buffer */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;
const DURATION_SECONDS = 0.3;

/** Generate deterministic PCM tones without storing binary patches in Git. */
function generateNotificationSounds() {
  const outputDirectory = path.join(__dirname, '..', 'assets', 'sounds');
  fs.mkdirSync(outputDirectory, { recursive: true });

  for (const [name, frequency] of [['booking', 660], ['urgent', 880]]) {
    const sampleCount = Math.floor(SAMPLE_RATE * DURATION_SECONDS);
    const dataSize = sampleCount * 2;
    const wav = Buffer.alloc(44 + dataSize);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataSize, 4);
    wav.write('WAVE', 8);
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(SAMPLE_RATE, 24);
    wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(dataSize, 40);

    for (let sample = 0; sample < sampleCount; sample += 1) {
      const progress = sample / sampleCount;
      const envelope = Math.sin(Math.PI * progress) ** 2;
      const value = Math.round(5000 * envelope * Math.sin(2 * Math.PI * frequency * sample / SAMPLE_RATE));
      wav.writeInt16LE(value, 44 + sample * 2);
    }
    fs.writeFileSync(path.join(outputDirectory, `${name}.wav`), wav);
  }
}

if (require.main === module) generateNotificationSounds();
module.exports = { generateNotificationSounds };
