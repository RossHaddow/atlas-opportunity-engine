const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const root = process.cwd();
const pkgPath = path.join(root, 'package.json');

function readVersion() {
  try { return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version; }
  catch { return null; }
}

if (readVersion() !== '1.54.0') {
  const parts = fs.readdirSync(root)
    .filter(n => /^atlas85\.safe\.part\.\d+$/.test(n))
    .sort();
  if (!parts.length) throw new Error('Atlas Build 85 safe patch parts not found');
  const encoded = parts.map(n => fs.readFileSync(path.join(root, n), 'utf8')).join('');
  const patchText = zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
  const lines = patchText.split('\n');
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('--- ')) { i++; continue; }
    i++;
    const newFile = lines[i].slice(4).trim();
    i++;
    const target = path.join(root, newFile);
    const src = fs.readFileSync(target, 'utf8').split('\n');
    const out = [];
    let srcPos = 0;
    while (i < lines.length && !lines[i].startsWith('--- ')) {
      const m = lines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!m) { i++; continue; }
      const oldStart = Number(m[1]) - 1;
      while (srcPos < oldStart) out.push(src[srcPos++]);
      i++;
      while (i < lines.length && !lines[i].startsWith('@@ ') && !lines[i].startsWith('--- ')) {
        const line = lines[i];
        if (line.startsWith(' ')) {
          if (src[srcPos] !== line.slice(1)) throw new Error(`Patch context mismatch in ${newFile} at line ${srcPos + 1}`);
          out.push(src[srcPos++]);
        } else if (line.startsWith('-')) {
          if (src[srcPos] !== line.slice(1)) throw new Error(`Patch removal mismatch in ${newFile} at line ${srcPos + 1}`);
          srcPos++;
        } else if (line.startsWith('+')) {
          out.push(line.slice(1));
        }
        i++;
      }
    }
    while (srcPos < src.length) out.push(src[srcPos++]);
    fs.writeFileSync(target, out.join('\n'));
  }
  if (readVersion() !== '1.54.0') throw new Error(`Atlas Build 85 patch verification failed; version=${readVersion()}`);
}
