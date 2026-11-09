// Decodes the sprites referenced by the game data and writes them as PNG files.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FORMATS = { RGB24: 3, RGBA32: 4, DXT1: 10, DXT5: 12, BC7: 25 };

// ---------------------------------------------------------------- PNG
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- Block decoders
function colorBlock(src, o, out, hasFourColors) {
  const c0 = src.readUInt16LE(o), c1 = src.readUInt16LE(o + 2);
  const expand = c => [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];
  const a = expand(c0), b = expand(c1);
  const pal = [a, b];
  if (hasFourColors || c0 > c1) {
    pal.push(a.map((v, i) => (2 * v + b[i]) / 3), a.map((v, i) => (v + 2 * b[i]) / 3));
  } else {
    pal.push(a.map((v, i) => (v + b[i]) / 2), [0, 0, 0]);
  }
  const bits = src.readUInt32LE(o + 4);
  for (let i = 0; i < 16; i++) {
    const idx = (bits >>> (2 * i)) & 3;
    out[i * 4] = pal[idx][0]; out[i * 4 + 1] = pal[idx][1]; out[i * 4 + 2] = pal[idx][2];
    out[i * 4 + 3] = !hasFourColors && c0 <= c1 && idx === 3 ? 0 : 255;
  }
}
function alphaBlock(src, o, out) {
  const a0 = src[o], a1 = src[o + 1];
  const pal = [a0, a1];
  if (a0 > a1) for (let i = 1; i < 7; i++) pal.push(((7 - i) * a0 + i * a1) / 7);
  else { for (let i = 1; i < 5; i++) pal.push(((5 - i) * a0 + i * a1) / 5); pal.push(0, 255); }
  let bits = 0n;
  for (let i = 0; i < 6; i++) bits |= BigInt(src[o + 2 + i]) << BigInt(8 * i);
  for (let i = 0; i < 16; i++) out[i * 4 + 3] = pal[Number((bits >> BigInt(3 * i)) & 7n)];
}

// BC7 tables (per the BPTC specification).
const P2 = [0xCCCC, 0x8888, 0xEEEE, 0xECC8, 0xC880, 0xFEEC, 0xFEC8, 0xEC80, 0xC800, 0xFFEC, 0xFE80, 0xE800, 0xFFE8, 0xFF00, 0xFFF0, 0xF000, 0xF710, 0x008E, 0x7100, 0x08CE, 0x008C, 0x7310, 0x3100, 0x8CCE, 0x088C, 0x3110, 0x6666, 0x366C, 0x17E8, 0x0FF0, 0x718E, 0x399C, 0xAAAA, 0xF0F0, 0x5A5A, 0x33CC, 0x3C3C, 0x55AA, 0x9696, 0xA5A5, 0x73CE, 0x13C8, 0x324C, 0x3BDC, 0x6996, 0xC33C, 0x9966, 0x0660, 0x0272, 0x04E4, 0x4E40, 0x2720, 0xC936, 0x936C, 0x39C6, 0x639C, 0x9336, 0x9CC6, 0x817E, 0xE718, 0xCCF0, 0x0FCC, 0x7744, 0xEE22];
const WEIGHTS = { 2: [0, 21, 43, 64], 3: [0, 9, 18, 27, 37, 46, 55, 64], 4: [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64] };
const ANCHOR2 = [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 2, 8, 2, 2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2, 15, 15, 6, 8, 2, 8, 15, 15, 2, 8, 2, 2, 2, 15, 15, 6, 6, 2, 6, 8, 15, 15, 2, 2, 15, 15, 15, 15, 15, 2, 2, 15];
const MODES = [
  { sub: 3, pb: 4, rb: 0, ib: 0, cb: 4, ab: 0, ep: 1, sp: 0, i1: 3, i2: 0 },
  { sub: 2, pb: 6, rb: 0, ib: 0, cb: 6, ab: 0, ep: 0, sp: 1, i1: 3, i2: 0 },
  { sub: 3, pb: 6, rb: 0, ib: 0, cb: 5, ab: 0, ep: 0, sp: 0, i1: 2, i2: 0 },
  { sub: 2, pb: 6, rb: 0, ib: 0, cb: 7, ab: 0, ep: 1, sp: 0, i1: 2, i2: 0 },
  { sub: 1, pb: 0, rb: 2, ib: 1, cb: 5, ab: 6, ep: 0, sp: 0, i1: 2, i2: 3 },
  { sub: 1, pb: 0, rb: 2, ib: 0, cb: 7, ab: 8, ep: 0, sp: 0, i1: 2, i2: 2 },
  { sub: 1, pb: 0, rb: 0, ib: 0, cb: 7, ab: 7, ep: 1, sp: 0, i1: 4, i2: 0 },
  { sub: 2, pb: 6, rb: 0, ib: 0, cb: 5, ab: 5, ep: 1, sp: 0, i1: 2, i2: 0 },
];
function bc7Block(src, o, out) {
  let bit = 0n;
  const block = src.readBigUInt64LE(o) | (src.readBigUInt64LE(o + 8) << 64n);
  const take = n => { const v = Number((block >> bit) & ((1n << BigInt(n)) - 1n)); bit += BigInt(n); return v; };
  let mode = 0;
  while (mode < 8 && take(1) === 0) mode++;
  if (mode === 8) { out.fill(0); return false; }
  const m = MODES[mode];
  const partition = take(m.pb);
  if (m.sub === 3) return null; // three-subset modes need the full partition table
  const rotation = take(m.rb);
  const indexSel = take(m.ib);
  const ep = [];
  for (let i = 0; i < m.sub * 2; i++) ep.push([0, 0, 0, 255]);
  for (let c = 0; c < 3; c++) for (let i = 0; i < m.sub * 2; i++) ep[i][c] = take(m.cb);
  if (m.ab) for (let i = 0; i < m.sub * 2; i++) ep[i][3] = take(m.ab);
  const pbits = [];
  if (m.ep) for (let i = 0; i < m.sub * 2; i++) pbits.push(take(1));
  if (m.sp) for (let i = 0; i < m.sub; i++) pbits.push(take(1));
  const cbits = m.cb + (m.ep || m.sp ? 1 : 0);
  const abits = m.ab ? m.ab + (m.ep || m.sp ? 1 : 0) : 0;
  for (let i = 0; i < m.sub * 2; i++) {
    const p = m.ep ? pbits[i] : m.sp ? pbits[i >> 1] : -1;
    for (let c = 0; c < 4; c++) {
      if (c === 3 && !m.ab) continue;
      let v = ep[i][c];
      const b = c === 3 ? abits : cbits;
      if (p >= 0) v = (v << 1) | p;
      v <<= 8 - b;
      ep[i][c] = v | (v >> b);
    }
  }
  const subsetOf = i => (m.sub === 2 ? (P2[partition] >> i) & 1 : 0);
  const anchor = s => (s === 0 ? 0 : ANCHOR2[partition]);
  const readIdx = bits => {
    const idx = [];
    for (let i = 0; i < 16; i++) {
      const isAnchor = i === anchor(subsetOf(i));
      idx.push(take(isAnchor ? bits - 1 : bits));
    }
    return idx;
  };
  const i1 = readIdx(m.i1);
  const i2 = m.i2 ? (() => { const a = []; for (let i = 0; i < 16; i++) a.push(take(i === 0 ? m.i2 - 1 : m.i2)); return a; })() : null;
  const lerp = (a, b, w) => ((64 - w) * a + w * b + 32) >> 6;
  for (let i = 0; i < 16; i++) {
    const s = subsetOf(i);
    const a = ep[s * 2], b = ep[s * 2 + 1];
    const cIdx = i2 && indexSel ? i2[i] : i1[i];
    const cBits = i2 && indexSel ? m.i2 : m.i1;
    const aIdx = i2 && !indexSel ? i2[i] : i1[i];
    const aBits = i2 && !indexSel ? m.i2 : m.i1;
    const px = [0, 1, 2].map(c => lerp(a[c], b[c], WEIGHTS[cBits][cIdx]));
    px.push(lerp(a[3], b[3], WEIGHTS[aBits][aIdx]));
    if (rotation) { const t = px[3]; px[3] = px[rotation - 1]; px[rotation - 1] = t; }
    out.set(px, i * 4);
  }
  return true;
}

function decode(tex, bytes) {
  const { w, h, fmt } = tex;
  const rgba = Buffer.alloc(w * h * 4);
  if (fmt === FORMATS.RGBA32) { bytes.copy(rgba, 0, 0, w * h * 4); return { rgba, bad: 0 }; }
  if (fmt === FORMATS.RGB24) {
    for (let i = 0; i < w * h; i++) { rgba[i * 4] = bytes[i * 3]; rgba[i * 4 + 1] = bytes[i * 3 + 1]; rgba[i * 4 + 2] = bytes[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
    return { rgba, bad: 0 };
  }
  const blockSize = fmt === FORMATS.DXT1 ? 8 : 16;
  const px = new Uint8Array(64);
  let o = 0, bad = 0;
  for (let by = 0; by < Math.ceil(h / 4); by++) {
    for (let bx = 0; bx < Math.ceil(w / 4); bx++, o += blockSize) {
      if (fmt === FORMATS.DXT1) colorBlock(bytes, o, px, false);
      else if (fmt === FORMATS.DXT5) { colorBlock(bytes, o + 8, px, true); alphaBlock(bytes, o, px); }
      else if (bc7Block(bytes, o, px) === null) { bad++; px.fill(0); }
      for (let y = 0; y < 4; y++) {
        const ty = by * 4 + y;
        if (ty >= h) continue;
        for (let x = 0; x < 4; x++) {
          const tx = bx * 4 + x;
          if (tx >= w) continue;
          for (let c = 0; c < 4; c++) rgba[(ty * w + tx) * 4 + c] = px[(y * 4 + x) * 4 + c];
        }
      }
    }
  }
  return { rgba, bad };
}

// Crops a rect, flips it upright (Unity textures are bottom-up) and shrinks by whole factors.
function cut(rgba, texW, rect, limit) {
  const x0 = Math.round(rect.x), y0 = Math.round(rect.y), w = Math.round(rect.width), h = Math.round(rect.height);
  const factor = Math.max(1, Math.floor(Math.max(w, h) / limit));
  const dw = Math.max(1, Math.floor(w / factor)), dh = Math.max(1, Math.floor(h / factor));
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const srcY = y0 + (h - 1 - (y * factor + sy));
          const p = (srcY * texW + x0 + x * factor + sx) * 4;
          const al = rgba[p + 3];
          r += rgba[p] * al; g += rgba[p + 1] * al; b += rgba[p + 2] * al; a += al;
        }
      }
      const q = (y * dw + x) * 4;
      if (a) { out[q] = r / a; out[q + 1] = g / a; out[q + 2] = b / a; out[q + 3] = a / (factor * factor); }
    }
  }
  return { w: dw, h: dh, data: out };
}

function exportIcons({ pending, gfx, atlasMap, targetKey, unpackBundle, outDir }) {
  const wanted = new Set();
  const walk = (rec, v) => {
    if (Array.isArray(v)) v.forEach(x => walk(rec, x));
    else if (v && typeof v === 'object') {
      if (v.$ptr) { if (v.$t.replace('$', '') === 'Sprite') wanted.add(targetKey(rec, v.$ptr[0], v.$ptr[1])); return; }
      Object.values(v).forEach(x => walk(rec, x));
    }
  };
  for (const rec of pending) walk(rec, rec.v);
  // Sprites the data never points at but the site uses as related or stand-in art.
  const EXTRA = /^(Icon-Job-|Map Preview|Icon-Quest-(Easy|Medium|Hard)$|Furniture_Bed_CardboardBox$|Furniture_Relax_Chair_Plastic$|Icon-Item-Scrap-|Icon-Attribute-Cash$|Icon-Bag-Gems$|Icon-Location-Bank$|Icon-Trait-Cat$|Icon-Role-Adventurer$|Event-Bank$)/;
  for (const g of gfx) if (g.kind === 'spr' && EXTRA.test(g.name)) wanted.add(g.k);

  const textures = new Map(gfx.filter(g => g.kind === 'tex').map(t => [t.k, t]));
  const jobs = new Map(); // texture key -> [{sprite, rect}]
  const stats = { wanted: wanted.size, written: 0, missing: 0, rotated: 0, unsupported: {}, bc7BadBlocks: 0 };
  for (const s of gfx.filter(g => g.kind === 'spr' && wanted.has(g.k))) {
    let texKey = s.tex, rect = s.trect, settings = s.packed;
    if (s.atlas) {
      const hit = atlasMap.get(`${s.atlas}|${s.renderKey}`);
      if (!hit) { stats.missing++; continue; }
      texKey = hit.tex; rect = hit.rect; settings = hit.settings;
    }
    if ((settings >> 2) & 15) stats.rotated++;
    if (!textures.has(texKey)) { stats.missing++; continue; }
    if (!jobs.has(texKey)) jobs.set(texKey, []);
    jobs.get(texKey).push({ sprite: s, rect });
  }

  const byContainer = new Map();
  for (const texKey of jobs.keys()) {
    const c = textures.get(texKey).c;
    if (!byContainer.has(c)) byContainer.set(c, []);
    byContainer.get(c).push(texKey);
  }

  const iconDir = path.join(outDir, 'icons');
  fs.rmSync(iconDir, { recursive: true, force: true });
  fs.mkdirSync(iconDir, { recursive: true });
  const index = {};
  const used = new Set();
  for (const [container, texKeys] of byContainer) {
    const { nodes, data } = unpackBundle(container);
    for (const texKey of texKeys) {
      const tex = textures.get(texKey);
      if (!Object.values(FORMATS).includes(tex.fmt)) { stats.unsupported[tex.fmt] = (stats.unsupported[tex.fmt] || 0) + jobs.get(texKey).length; continue; }
      const res = nodes.find(n => n.name.toLowerCase() === tex.stream.path.split('/').pop().toLowerCase());
      if (!res) { stats.missing += jobs.get(texKey).length; continue; }
      const start = res.offset + Number(tex.stream.offset);
      const { rgba, bad } = decode(tex, data.subarray(start, start + Number(tex.stream.size)));
      stats.bc7BadBlocks += bad;
      for (const { sprite, rect } of jobs.get(texKey)) {
        const limit = /^Map Preview/i.test(sprite.name) ? 640 : /^(Event|GlobalEvent)/i.test(sprite.name) ? 320 : 128;
        const img = cut(rgba, tex.w, rect, limit);
        let name = sprite.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'icon';
        for (let n = 2; used.has(name); n++) name = `${sprite.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${n}`;
        used.add(name);
        fs.writeFileSync(path.join(iconDir, name + '.png'), encodePng(img.w, img.h, img.data));
        index[sprite.k] = { file: name + '.png', w: img.w, h: img.h };
        stats.written++;
      }
    }
  }
  fs.writeFileSync(path.join(outDir, 'icons.json'), JSON.stringify(index));
  const size = fs.readdirSync(iconDir).reduce((a, f) => a + fs.statSync(path.join(iconDir, f)).size, 0);
  stats.megabytes = Number((size / 1048576).toFixed(1));
  return stats;
}

module.exports = { exportIcons };
