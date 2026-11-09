#!/usr/bin/env node
// Extracts ScriptableObject data and localization from a Walk of Life install into JSON.
// Usage: node --max-old-space-size=6144 tools/extract.js "<...>/Walk of Life_Data" data
// Only reads the game folder; everything is written under the output directory.
const fs = require('fs');
const path = require('path');

const [gameData, outDir] = process.argv.slice(2);
if (!gameData || !outDir) {
  console.error('usage: extract.js <Walk of Life_Data> <outDir>');
  process.exit(2);
}

// ---------------------------------------------------------------- UnityFS container
function lz4Into(src, dst, at, expected) {
  let s = 0, d = at;
  const end = at + expected;
  while (s < src.length) {
    const token = src[s++];
    let lit = token >> 4;
    if (lit === 15) { let b; do { b = src[s++]; lit += b; } while (b === 255); }
    src.copy(dst, d, s, s + lit); s += lit; d += lit;
    if (s >= src.length) break;
    const off = src[s] | (src[s + 1] << 8); s += 2;
    let len = token & 15;
    if (len === 15) { let b; do { b = src[s++]; len += b; } while (b === 255); }
    len += 4;
    if (off >= len) { dst.copy(dst, d, d - off, d - off + len); d += len; }
    else { for (let i = 0; i < len; i++, d++) dst[d] = dst[d - off]; }
  }
  if (d !== end) throw new Error(`lz4 size mismatch ${d - at} != ${expected}`);
}

const cstrAt = (b, o) => { let e = o; while (b[e]) e++; return [b.toString('utf8', o, e), e + 1]; };
const align16 = o => (o + 15) & ~15;

function unpackBundle(file) {
  const b = fs.readFileSync(file);
  let o, sig, ver, rev;
  [sig, o] = cstrAt(b, 0);
  if (sig !== 'UnityFS') throw new Error('not UnityFS: ' + sig);
  const format = b.readUInt32BE(o); o += 4;
  [ver, o] = cstrAt(b, o);
  [rev, o] = cstrAt(b, o);
  o += 8;
  const cInfo = b.readUInt32BE(o); o += 4;
  const uInfo = b.readUInt32BE(o); o += 4;
  const flags = b.readUInt32BE(o); o += 4;
  if (format >= 7) o = align16(o);
  const atEnd = (flags & 0x80) !== 0;
  const rawInfo = atEnd ? b.subarray(b.length - cInfo) : b.subarray(o, o + cInfo);
  if (!atEnd) o += cInfo;
  if (flags & 0x200) o = align16(o);
  const mode = flags & 0x3f;
  let info;
  if (mode === 0) info = rawInfo;
  else if (mode === 2 || mode === 3) { info = Buffer.allocUnsafe(uInfo); lz4Into(rawInfo, info, 0, uInfo); }
  else throw new Error('unsupported info compression ' + mode);
  let p = 16;
  const nBlocks = info.readInt32BE(p); p += 4;
  const blocks = [];
  for (let i = 0; i < nBlocks; i++, p += 10) {
    blocks.push({ u: info.readUInt32BE(p), c: info.readUInt32BE(p + 4), f: info.readUInt16BE(p + 8) });
  }
  const nNodes = info.readInt32BE(p); p += 4;
  const nodes = [];
  for (let i = 0; i < nNodes; i++) {
    const offset = Number(info.readBigInt64BE(p));
    const size = Number(info.readBigInt64BE(p + 8));
    const nflags = info.readUInt32BE(p + 16); p += 20;
    let name; [name, p] = cstrAt(info, p);
    nodes.push({ offset, size, flags: nflags, name });
  }
  const data = Buffer.allocUnsafe(blocks.reduce((a, x) => a + x.u, 0));
  let at = 0;
  for (const bl of blocks) {
    const raw = b.subarray(o, o + bl.c); o += bl.c;
    const m = bl.f & 0x3f;
    if (m === 0) raw.copy(data, at);
    else if (m === 2 || m === 3) lz4Into(raw, data, at, bl.u);
    else throw new Error('unsupported block compression ' + m);
    at += bl.u;
  }
  return { nodes, data };
}

// ---------------------------------------------------------------- SerializedFile
const COMMON = ['AABB', 'AnimationClip', 'AnimationCurve', 'AnimationState', 'Array', 'Base', 'BitField', 'bitset', 'bool', 'char', 'ColorRGBA', 'Component', 'data', 'deque', 'double', 'dynamic_array', 'FastPropertyName', 'first', 'float', 'Font', 'GameObject', 'Generic Mono', 'GradientNEW', 'GUID', 'GUIStyle', 'int', 'list', 'long long', 'map', 'Matrix4x4f', 'MdFour', 'MonoBehaviour', 'MonoScript', 'm_ByteSize', 'm_Curve', 'm_EditorClassIdentifier', 'm_EditorHideFlags', 'm_Enabled', 'm_ExtensionPtr', 'm_GameObject', 'm_Index', 'm_IsArray', 'm_IsStatic', 'm_MetaFlag', 'm_Name', 'm_ObjectHideFlags', 'm_PrefabInternal', 'm_PrefabParentObject', 'm_Script', 'm_StaticEditorFlags', 'm_Type', 'm_Version', 'Object', 'pair', 'PPtr<Component>', 'PPtr<GameObject>', 'PPtr<Material>', 'PPtr<MonoBehaviour>', 'PPtr<MonoScript>', 'PPtr<Object>', 'PPtr<Prefab>', 'PPtr<Sprite>', 'PPtr<TextAsset>', 'PPtr<Texture>', 'PPtr<Texture2D>', 'PPtr<Transform>', 'Prefab', 'Quaternionf', 'Rectf', 'RectInt', 'RectOffset', 'second', 'set', 'short', 'size', 'SInt16', 'SInt32', 'SInt64', 'SInt8', 'staticvector', 'string', 'TextAsset', 'TextMesh', 'Texture', 'Texture2D', 'Transform', 'TypelessData', 'UInt16', 'UInt32', 'UInt64', 'UInt8', 'unsigned int', 'unsigned long long', 'unsigned short', 'vector', 'Vector2f', 'Vector3f', 'Vector4f', 'm_ScriptingClassIdentifier', 'Gradient', 'Type*', 'int2_storage', 'int3_storage', 'BoundsInt', 'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset', 'FileSize', 'Hash128'];
const COMMON_AT = new Map();
{ let at = 0; for (const s of COMMON) { COMMON_AT.set(at, s); at += s.length + 1; } }

class Reader {
  constructor(buf, pos, little) { this.b = buf; this.p = pos; this.le = little; }
  align(n = 4) { const r = this.p % n; if (r) this.p += n - r; }
  u8() { return this.b[this.p++]; }
  i8() { return this.b.readInt8(this.p++); }
  u16() { const v = this.le ? this.b.readUInt16LE(this.p) : this.b.readUInt16BE(this.p); this.p += 2; return v; }
  i16() { const v = this.le ? this.b.readInt16LE(this.p) : this.b.readInt16BE(this.p); this.p += 2; return v; }
  u32() { const v = this.le ? this.b.readUInt32LE(this.p) : this.b.readUInt32BE(this.p); this.p += 4; return v; }
  i32() { const v = this.le ? this.b.readInt32LE(this.p) : this.b.readInt32BE(this.p); this.p += 4; return v; }
  i64() { const v = this.le ? this.b.readBigInt64LE(this.p) : this.b.readBigInt64BE(this.p); this.p += 8; return v; }
  u64() { const v = this.le ? this.b.readBigUInt64LE(this.p) : this.b.readBigUInt64BE(this.p); this.p += 8; return v; }
  f32() { const v = this.le ? this.b.readFloatLE(this.p) : this.b.readFloatBE(this.p); this.p += 4; return v; }
  f64() { const v = this.le ? this.b.readDoubleLE(this.p) : this.b.readDoubleBE(this.p); this.p += 8; return v; }
  cstr() { const [s, n] = cstrAt(this.b, this.p); this.p = n; return s; }
  str() {
    const n = this.i32();
    if (n < 0 || this.p + n > this.b.length) throw new Error('bad string length ' + n);
    const s = this.b.toString('utf8', this.p, this.p + n);
    this.p += n;
    return s;
  }
}
const num = v => (v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : String(v));

function readTree(r) {
  const nNodes = r.i32();
  const strSize = r.i32();
  const start = r.p;
  const strBase = start + nNodes * 32;
  const name = off => {
    if (off & 0x80000000) return COMMON_AT.get(off & 0x7fffffff) || `?common${off & 0x7fffffff}`;
    return cstrAt(r.b, strBase + off)[0];
  };
  const flat = [];
  for (let i = 0; i < nNodes; i++) {
    r.u16();
    const level = r.u8();
    r.u8();
    const type = name(r.u32());
    const nm = name(r.u32());
    r.i32(); r.i32();
    const meta = r.i32();
    r.u64();
    flat.push({ level, type, name: nm, meta, children: [] });
  }
  r.p = strBase + strSize;
  const stack = [];
  for (const n of flat) {
    while (stack.length && stack[stack.length - 1].level >= n.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(n);
    stack.push(n);
  }
  return flat[0];
}

function parseSerialized(buf, fileName) {
  const h = new Reader(buf, 0, false);
  h.u32(); h.u32();
  const version = h.u32();
  let dataOffset = h.u32();
  if (version < 9 || version > 40) throw new Error('not a serialized file, version ' + version);
  const endian = h.u8(); h.p += 3;
  if (version >= 22) { h.u32(); h.i64(); dataOffset = Number(h.i64()); h.i64(); }
  const r = new Reader(buf, h.p, endian === 0);
  r.cstr(); r.i32();
  const hasTree = r.u8() !== 0;
  const readType = isRef => {
    const t = { classId: r.i32(), stripped: r.u8() !== 0, scriptIndex: r.i16() };
    if ((isRef && t.scriptIndex >= 0) || t.classId === 114) { t.scriptId = buf.toString('hex', r.p, r.p + 16); r.p += 16; }
    r.p += 16;
    if (hasTree) {
      t.tree = readTree(r);
      if (isRef) { t.className = r.cstr(); t.ns = r.cstr(); t.asm = r.cstr(); }
      else { const d = r.i32(); r.p += d * 4; }
    }
    return t;
  };
  const types = [];
  for (let i = 0, n = r.i32(); i < n; i++) types.push(readType(false));
  const objects = [];
  for (let i = 0, n = r.i32(); i < n; i++) {
    r.align(4);
    const pathId = r.i64();
    const start = Number(r.i64());
    const size = r.u32();
    objects.push({ pathId, start: start + dataOffset, size, type: types[r.i32()] });
  }
  for (let i = 0, n = r.i32(); i < n; i++) { r.i32(); r.align(4); r.i64(); }
  const externals = [];
  for (let i = 0, n = r.i32(); i < n; i++) { r.cstr(); r.p += 20; externals.push(r.cstr()); }
  const refTypes = new Map();
  for (let i = 0, n = r.i32(); i < n; i++) {
    const t = readType(true);
    if (t.className !== undefined) refTypes.set(`${t.ns}|${t.className}`, t);
  }
  return { fileName, version, hasTree, little: endian === 0, objects, externals, refTypes, buf };
}

// ---------------------------------------------------------------- Field decoding
const PRIM = {
  SInt8: r => r.i8(), UInt8: r => r.u8(), char: r => r.u8(),
  SInt16: r => r.i16(), short: r => r.i16(), UInt16: r => r.u16(), 'unsigned short': r => r.u16(),
  SInt32: r => r.i32(), int: r => r.i32(), UInt32: r => r.u32(), 'unsigned int': r => r.u32(), 'Type*': r => r.u32(),
  SInt64: r => num(r.i64()), 'long long': r => num(r.i64()), UInt64: r => num(r.u64()), 'unsigned long long': r => num(r.u64()), FileSize: r => num(r.u64()),
  float: r => r.f32(), double: r => r.f64(), bool: r => r.u8() !== 0,
};

function readManagedRegistry(ctx, r) {
  const version = r.i32();
  const out = {};
  const readOne = rid => {
    const cls = (() => { const s = r.str(); r.align(); return s; })();
    const ns = (() => { const s = r.str(); r.align(); return s; })();
    const asm = (() => { const s = r.str(); r.align(); return s; })();
    if (!cls) return false;
    const t = ctx.refTypes.get(`${ns}|${cls}`);
    if (!t || !t.tree) throw new Error(`unknown managed ref type ${ns}.${cls}`);
    const v = readObj(ctx, t.tree, r);
    out[String(rid)] = { $type: cls, $asm: asm, ...v };
    return true;
  };
  if (version === 1) {
    for (let rid = 0; readOne(rid); rid++);
  } else {
    const count = r.i32();
    for (let i = 0; i < count; i++) { const rid = num(r.i64()); readOne(rid); }
  }
  return out;
}

function readObj(ctx, node, r) {
  const o = {};
  for (const c of node.children) o[c.name] = readNode(ctx, c, r);
  return o;
}

function readNode(ctx, n, r) {
  let v;
  let align = (n.meta & 0x4000) !== 0;
  const prim = PRIM[n.type];
  if (prim && n.children.length === 0) {
    v = prim(r);
  } else if (n.type === 'string') {
    v = r.str();
    if (n.children[0] && n.children[0].meta & 0x4000) align = true;
  } else if (n.type === 'TypelessData') {
    const len = r.i32(); r.p += len;
    v = { $bytes: len };
  } else if (n.type === 'ManagedReferencesRegistry') {
    v = readManagedRegistry(ctx, r);
  } else if (n.type.startsWith('PPtr<')) {
    const file = r.i32();
    const pid = r.i64();
    v = pid === 0n ? null : { $ptr: [file, String(pid)], $t: n.type.slice(5, -1) };
  } else {
    const arr = n.type === 'Array' ? n : (n.children.length === 1 && n.children[0].type === 'Array' ? n.children[0] : null);
    if (arr) {
      const size = r.i32();
      if (size < 0 || size > 5e7) throw new Error('bad array size ' + size);
      const el = arr.children[1];
      if (el.type === 'UInt8' && size > 512) { r.p += size; v = { $bytes: size }; }
      else { v = new Array(size); for (let i = 0; i < size; i++) v[i] = readNode(ctx, el, r); }
      if (arr.meta & 0x4000) align = true;
    } else {
      v = readObj(ctx, n, r);
    }
  }
  if (align) r.align();
  return v;
}

function nameOnly(ctx, tree, r) {
  for (const c of tree.children) {
    const v = readNode(ctx, c, r);
    if (c.name === 'm_Name') return v;
  }
  return null;
}

// ---------------------------------------------------------------- Main
const key = (file, pid) => `${file.toLowerCase()}#${pid}`;
const base = s => s.split('/').pop().toLowerCase();
const stats = { files: 0, noTree: [], objects: 0, scriptable: 0, onComponents: 0, sizeMismatch: 0, failed: 0, errors: {}, containers: [] };
const index = new Map();   // key -> { cls, name }
const pending = [];        // ScriptableObject records awaiting pointer resolution
const gfx = [];            // Texture2D and Sprite metadata
const components = new Map(); // prefab MonoBehaviours, kept in case data tables point at them
const atlasMap = new Map(); // "atlasKey|renderKey" -> where a packed sprite sits
let currentContainer = '';

const NAMED = new Set([1, 28, 49, 83, 213, 115]);
function ingest(sf) {
  stats.files++;
  if (!sf.hasTree) { stats.noTree.push(sf.fileName); return; }
  const ctx = { refTypes: sf.refTypes };
  for (const ob of sf.objects) {
    stats.objects++;
    const pid = String(ob.pathId);
    const k = key(sf.fileName, pid);
    if (!ob.type || !ob.type.tree) continue;
    const r = new Reader(sf.buf, ob.start, sf.little);
    try {
      if (ob.type.classId === 115) {
        const v = readObj(ctx, ob.type.tree, r);
        index.set(k, { cls: 'MonoScript', name: v.m_ClassName, ns: v.m_Namespace });
      } else if (ob.type.classId === 114) {
        const v = readObj(ctx, ob.type.tree, r);
        if (r.p - ob.start !== ob.size) stats.sizeMismatch++;
        if (v.m_GameObject) {
          stats.onComponents++;
          index.set(k, { cls: 'Component', name: '' });
          components.set(k, { k, file: sf.fileName, externals: sf.externals, pid, v });
          continue;
        }
        stats.scriptable++;
        index.set(k, { cls: '?', name: v.m_Name });
        pending.push({ k, file: sf.fileName, externals: sf.externals, pid, v });
      } else if (ob.type.classId === 28 || ob.type.classId === 213) {
        const v = readObj(ctx, ob.type.tree, r);
        index.set(k, { cls: ob.type.tree.type, name: v.m_Name });
        const where = p => (p && p.$ptr ? (p.$ptr[0] === 0 ? key(sf.fileName, p.$ptr[1]) : key(base(sf.externals[p.$ptr[0] - 1] || ''), p.$ptr[1])) : null);
        if (ob.type.classId === 28) {
          gfx.push({ k, c: currentContainer, kind: 'tex', name: v.m_Name, w: v.m_Width, h: v.m_Height, fmt: v.m_TextureFormat, mips: v.m_MipCount, inline: v['image data'] ? v['image data'].$bytes : 0, stream: v.m_StreamData });
        } else {
          gfx.push({ k, kind: 'spr', name: v.m_Name, rect: v.m_Rect, tex: where(v.m_RD && v.m_RD.texture), trect: v.m_RD && v.m_RD.textureRect, atlas: where(v.m_SpriteAtlas), renderKey: JSON.stringify(v.m_RenderDataKey), packed: v.m_RD && v.m_RD.settingsRaw });
        }
      } else if (ob.type.classId === 687078895) {
        const v = readObj(ctx, ob.type.tree, r);
        const where = p => (p && p.$ptr ? (p.$ptr[0] === 0 ? key(sf.fileName, p.$ptr[1]) : key(base(sf.externals[p.$ptr[0] - 1] || ''), p.$ptr[1])) : null);
        for (const p of v.m_RenderDataMap || []) {
          atlasMap.set(`${k}|${JSON.stringify(p.first)}`, { tex: where(p.second.texture), rect: p.second.textureRect, settings: p.second.settingsRaw });
        }
      } else if (NAMED.has(ob.type.classId)) {
        index.set(k, { cls: ob.type.tree.type, name: nameOnly(ctx, ob.type.tree, r) });
      }
    } catch (e) {
      stats.failed++;
      const msg = e.message.slice(0, 80);
      stats.errors[msg] = (stats.errors[msg] || 0) + 1;
    }
  }
}

function ingestContainer(file) {
  const label = path.basename(file);
  currentContainer = file;
  try {
    const { nodes, data } = unpackBundle(file);
    let serialized = 0;
    for (const n of nodes) {
      if (/\.(resS|resource)$/i.test(n.name)) continue;
      try { ingest(parseSerialized(data.subarray(n.offset, n.offset + n.size), n.name)); serialized++; }
      catch (e) { if (!/not a serialized file/.test(e.message)) throw e; }
    }
    stats.containers.push({ label, serialized });
  } catch (e) {
    stats.containers.push({ label, error: e.message });
  }
}

const aa = path.join(gameData, 'StreamingAssets', 'aa', 'StandaloneWindows64');
for (const f of fs.readdirSync(aa).filter(x => x.endsWith('.bundle')).sort((a, b) => /monoscripts/.test(b) - /monoscripts/.test(a))) {
  ingestContainer(path.join(aa, f));
}
ingestContainer(path.join(gameData, 'data.unity3d'));

function targetKey(rec, file, pid) {
  if (file === 0) return key(rec.file, pid);
  const ext = rec.externals[file - 1];
  return ext ? key(base(ext), pid) : null;
}

function resolve(rec, v, unresolved) {
  if (Array.isArray(v)) return v.map(x => resolve(rec, x, unresolved));
  if (v && typeof v === 'object') {
    if (v.$ptr) {
      const tk = targetKey(rec, v.$ptr[0], v.$ptr[1]);
      const t = tk && index.get(tk);
      if (!t) { unresolved.n++; return { $ref: `${v.$t}/?`, id: tk }; }
      return { $ref: `${t.cls}/${t.name}`, id: tk };
    }
    const o = {};
    for (const k of Object.keys(v)) o[k] = resolve(rec, v[k], unresolved);
    return o;
  }
  return v;
}

// Roles are prefab components listed by RoleStorage; everything else on prefabs stays out.
for (const store of pending.filter(r => r.v.m_Name === 'RoleStorage')) {
  for (const p of store.v.Roles || []) {
    const comp = p && p.$ptr ? components.get(targetKey(store, p.$ptr[0], p.$ptr[1])) : null;
    if (comp) { comp.v.m_Name = comp.v.m_Name || `Role ${pending.length}`; pending.push(comp); }
  }
}

// Game systems also live on prefabs, and hold rule values that no data table has.
for (const store of pending.filter(r => r.v.m_Name === 'GameSystemStorage')) {
  const seen = new Set();
  const visit = v => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      if (v.$ptr) {
        const comp = components.get(targetKey(store, v.$ptr[0], v.$ptr[1]));
        if (comp && !seen.has(comp.k)) { seen.add(comp.k); comp.v.m_Name = comp.v.m_Name || `System ${pending.length}`; pending.push(comp); }
      } else Object.values(v).forEach(visit);
    }
  };
  visit(store.v);
}

// Prefab components whose scripts carry market, rent, hunger or round rules; the rest stay out.
{
  const classes = {};
  for (const comp of components.values()) {
    const p = comp.v.m_Script && comp.v.m_Script.$ptr;
    const script = p ? index.get(targetKey(comp, p[0], p[1])) : null;
    if (!script) continue;
    classes[script.name] = (classes[script.name] || 0) + 1;
    if (/Stock|Market|Rent|Hunger|Eviction|RoundManager|TurnManager/i.test(script.name) && !comp.v.m_Name) {
      comp.v.m_Name = `Component ${pending.length}`;
      pending.push(comp);
    }
  }
  fs.writeFileSync(path.join(outDir, 'component-classes.json'), JSON.stringify(classes, null, 1));
}

// First pass: learn each record's class so references can print "Class/Name".
for (const rec of pending) {
  const s = rec.v.m_Script && rec.v.m_Script.$ptr ? index.get(targetKey(rec, rec.v.m_Script.$ptr[0], rec.v.m_Script.$ptr[1])) : null;
  rec.cls = s ? (s.ns ? `${s.ns}.${s.name}` : s.name) : '(unknown-script)';
  index.get(rec.k).cls = rec.cls;
}

const byClass = {};
const unresolved = { n: 0 };
const DROP = new Set(['m_GameObject', 'm_Enabled', 'm_Script', 'm_ObjectHideFlags', 'm_EditorHideFlags', 'm_EditorClassIdentifier']);
for (const rec of pending) {
  const out = { _id: rec.k };
  for (const k of Object.keys(rec.v)) if (!DROP.has(k)) out[k] = resolve(rec, rec.v[k], unresolved);
  (byClass[rec.cls] = byClass[rec.cls] || []).push(out);
}

const rawDir = path.join(outDir, 'raw');
fs.mkdirSync(rawDir, { recursive: true });
const seen = new Set();
const summary = {};
for (const [cls, recs] of Object.entries(byClass)) {
  let safe = cls.replace(/[^\w.-]/g, '_');
  while (seen.has(safe.toLowerCase())) safe += '_';
  seen.add(safe.toLowerCase());
  recs.sort((a, b) => String(a.m_Name).localeCompare(String(b.m_Name)));
  fs.writeFileSync(path.join(rawDir, safe + '.json'), JSON.stringify(recs, null, 1));
  summary[cls] = recs.length;
}

// Localization: join SharedTableData keys with each language's StringTable.
const sharedRecs = Object.entries(byClass).filter(([c]) => /SharedTableData$/.test(c)).flatMap(([, r]) => r);
const keyOf = new Map();
for (const s of sharedRecs) for (const e of s.m_Entries || []) keyOf.set(String(e.m_Id), e.m_Key);
const langs = {};
for (const [c, recs] of Object.entries(byClass)) {
  if (!/\.StringTable$/.test(c)) continue;
  for (const t of recs) {
    const code = (t.m_LocaleId && t.m_LocaleId.m_Code) || String(t.m_Name).split('_').pop();
    const table = langs[code] = langs[code] || {};
    for (const e of t.m_TableData || []) table[String(e.m_Id)] = { key: keyOf.get(String(e.m_Id)) || '', text: e.m_Localized };
  }
}
const locDir = path.join(outDir, 'localization');
fs.mkdirSync(locDir, { recursive: true });
const locCounts = {};
for (const [code, t] of Object.entries(langs)) {
  fs.writeFileSync(path.join(locDir, code.replace(/[^\w-]/g, '_') + '.json'), JSON.stringify(t, null, 1));
  locCounts[code] = Object.keys(t).length;
}

fs.writeFileSync(path.join(outDir, 'gfx-index.json'), JSON.stringify(gfx));
const iconStats = require('./icons').exportIcons({ pending, gfx, atlasMap, targetKey, unpackBundle, outDir });
stats.icons = iconStats;
console.log('icons:', JSON.stringify(iconStats));
const report = { ...stats, unresolvedRefs: unresolved.n, classes: summary, languages: locCounts };
fs.writeFileSync(path.join(outDir, 'extract-report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({
  files: stats.files, objects: stats.objects, scriptable: stats.scriptable, onComponents: stats.onComponents,
  sizeMismatch: stats.sizeMismatch, failed: stats.failed, errors: stats.errors,
  filesWithoutTypeTree: stats.noTree.length, noTreeSample: stats.noTree.slice(0, 8),
  containerErrors: stats.containers.filter(c => c.error), unresolvedRefs: unresolved.n,
  classCount: Object.keys(summary).length, languages: locCounts,
}, null, 1));
