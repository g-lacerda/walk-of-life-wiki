// Locates method entries by the first RIP-relative global each method touches, falling back to its own flag check.
// Usage: node findaddr2.js <dll> <isilRoot> <File::regex>... prints "addr name" lines.
const fs = require('fs');
const path = require('path');
const [dll, root, ...reqs] = process.argv.slice(2);
const b = fs.readFileSync(dll);
const pe = b.readUInt32LE(0x3c), n = b.readUInt16LE(pe + 6), opt = b.readUInt16LE(pe + 20);
const base = BigInt.asUintN(64, b.readBigUInt64LE(pe + 48));
const secs = [];
for (let i = 0; i < n; i++) { const o = pe + 24 + opt + 40 * i; secs.push({ name: b.toString('latin1', o, o + 8).replace(/\0.*/, ''), va: b.readUInt32LE(o + 12), raw: b.readUInt32LE(o + 20), size: b.readUInt32LE(o + 16) }); }
const code = secs.filter(s => /text|il2cpp/.test(s.name) && s.size > 1e6);
// Index every cmp byte ptr [rip+d],0 by target once, so many lookups stay fast.
const index = new Map();
for (const s of code) for (let i = s.raw; i < s.raw + s.size - 7; i++) {
  if (b[i] !== 0x80 || b[i + 1] !== 0x3D || b[i + 6] !== 0) continue;
  const rva = i - s.raw + s.va, target = rva + 7 + b.readInt32LE(i + 2);
  if (!index.has(target)) index.set(target, []);
  index.get(target).push({ s, i });
}
for (const req of reqs) {
  const [file, re] = req.split('::');
  const t = fs.readFileSync(path.join(root, file + '.txt'), 'utf8');
  for (const m of t.split(/\n(?=Method: )/).filter(x => x.startsWith('Method:') && new RegExp(re).test(x.split('\n')[0]))) {
    const name = file.split('/').pop() + '.' + (/([A-Za-z_]+)\(/.exec(m.split('\n')[0]) || [])[1];
    const f = /Compare \[0x(184[0-9A-F]+)\], 0/.exec(m.slice(m.indexOf('ISIL:')));
    if (!f) { console.log('SEMFLAG', name); continue; }
    const hits = index.get(Number(BigInt('0x' + f[1]) - base)) || [];
    for (const { s, i } of hits.slice(0, 1)) {
      let j = i; while (j > s.raw && !(b[j - 1] === 0xCC && b[j - 2] === 0xCC)) j--;
      console.log((base + BigInt(j - s.raw + s.va)).toString(16), name);
    }
  }
}
