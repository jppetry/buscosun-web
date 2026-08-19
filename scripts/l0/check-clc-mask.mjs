import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { landcoverAt } from '../../src/fire/clcMask.ts';
const buf = readFileSync(new URL('../../public/fire/clc-industry-mask.png', import.meta.url));
let p = 8, w=0,h=0; const idat=[];
while (p < buf.length) { const len=buf.readUInt32BE(p); const type=buf.toString('ascii',p+4,p+8); const d=buf.subarray(p+8,p+8+len);
  if (type==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);} if(type==='IDAT') idat.push(d); p+=12+len; }
const raw = inflateSync(Buffer.concat(idat)); const data=new Uint8Array(w*h);
for (let r=0;r<h;r++){ if(raw[r*(w+1)]!==0) throw new Error('filter'); data.set(raw.subarray(r*(w+1)+1,(r+1)*(w+1)), r*w); }
const mask={width:w,height:h,data};
const cases=[['ThyssenKrupp Duisburg',51.48,6.72],['voestalpine Linz',48.2746,14.3363],['Varallo (Waldbrand IT)',45.81,8.26],['Salzgitter',52.14,10.40],['Dillingen',49.36,6.72],['Eisenhüttenstadt',52.15,14.63],['Hürtgenwald (Waldbrand)',50.72,6.36],['Weisweiler KW',50.84,6.32],['Nationalpark Bayer. Wald',48.95,13.40]];
for (const [n,la,lo] of cases) console.log(n.padEnd(26), landcoverAt(mask,la,lo));
let set=0; for(const v of data) if(v>127) set++; console.log('cells set', set, 'of', w*h);
