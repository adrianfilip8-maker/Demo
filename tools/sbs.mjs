/* Side-by-side + amplified difference, because viewing two dark frames SERIALLY is not a
   comparison — I read night-before and night-fix one after the other and called them identical
   while 11.95% of pixels differed by up to 66 levels. The mandate says side-by-side for exactly
   this reason. Third panel is |A-B| x GAIN so the change's SHAPE is visible, not just its size. */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import zlib from 'node:zlib'; import { writeFileSync } from 'node:fs';
const [A,B,OUT,G] = process.argv.slice(2); const GAIN = +(G||6);
const a=readPNG(A), b=readPNG(B), ch=a.data.length/(a.w*a.h);
const W=a.w*3, H=a.h, out=Buffer.alloc(W*H*3);
for(let y=0;y<H;y++)for(let x=0;x<a.w;x++){
  const i=(y*a.w+x)*ch;
  for(let c=0;c<3;c++){
    out[(y*W+x)*3+c]=a.data[i+c];
    out[(y*W+x+a.w)*3+c]=b.data[i+c];
    out[(y*W+x+2*a.w)*3+c]=Math.min(255,Math.abs(a.data[i+c]-b.data[i+c])*GAIN);
  }
}
const raw=Buffer.alloc(H*(W*3+1));
for(let y=0;y<H;y++){raw[y*(W*3+1)]=0;out.copy(raw,y*(W*3+1)+1,y*W*3,(y+1)*W*3);}
const crcT=[...Array(256)].map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0;});
const crc=b2=>{let c=0xFFFFFFFF;for(const v of b2)c=crcT[(c^v)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
const chunk=(t,d)=>{const L=Buffer.alloc(4);L.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);
  const C=Buffer.alloc(4);C.writeUInt32BE(crc(td));return Buffer.concat([L,td,C]);};
const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=2;
writeFileSync(OUT,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),
  chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
console.log(`${OUT}  ${W}x${H}  [A | B | |A-B| x${GAIN}]`);
