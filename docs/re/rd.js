// Prints raw ISIL of methods, resolving [0x18...] memory operands to the float/int stored in GameAssembly.dll.
const fs=require('fs'),path=require('path');
const [dll,root,...reqs]=process.argv.slice(2);
const b=fs.readFileSync(dll);const pe=b.readUInt32LE(0x3c);const n=b.readUInt16LE(pe+6);const opt=b.readUInt16LE(pe+20);
const base=Number(b.readBigUInt64LE(pe+24+24));const secs=[];
for(let i=0;i<n;i++){const o=pe+24+opt+40*i;secs.push({va:b.readUInt32LE(o+12),size:b.readUInt32LE(o+8),raw:b.readUInt32LE(o+20)});}
const at=a=>{const r=a-base;const s=secs.find(x=>r>=x.va&&r<x.va+x.size);return s?r-s.va+s.raw:-1};
const res=l=>l.replace(/\[0x([0-9A-Fa-f]{9,})\]/g,(m,h)=>{const o=at(parseInt(h,16));if(o<0)return m;const f=b.readFloatLE(o),d=b.readDoubleLE(o),i=b.readInt32LE(o);const ok=v=>Math.abs(v)>1e-4&&Math.abs(v)<1e7;return m+(ok(f)?`{f=${+f.toFixed(5)}}`:'')+(ok(d)?`{d=${+d.toFixed(5)}}`:'')+`{i=${i}}`});
for(const q of reqs){const [file,re,from,to]=q.split('::');const t=fs.readFileSync(path.join(root,file+'.txt'),'utf8');
for(const p of t.split(/\n(?=Method: )/).filter(x=>x.startsWith('Method:')&&new RegExp(re).test(x.split('\n')[0]))){console.log('\n### '+p.split('\n')[0].slice(8,140));const i=p.indexOf('ISIL:');const ls=p.slice(i).split('\n').slice(1).slice(+from||0,+to||400);console.log(ls.map(l=>res(l.trim()).slice(0,130)).join('\n'));}}
