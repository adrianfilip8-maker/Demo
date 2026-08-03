/* Where does `compose` actually change the night frame? Independent spatial check on §133.2's
   claim that the movement is "localised to shaded architecture only - moon, torch and the cool
   palette untouched". Colour-codes the SIGNED b-r change so warm-ward and cool-ward are
   distinguishable, and does NOT go through any tonemap: this writes straight to a PPM.
   Bypass proven on a known input below before any frame is read. */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
const F = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/pnight1/frames';

/* known-input proof of the writer: a 4x1 strip of pure red, green, blue, black must come back
   exactly those bytes. If the encoder mangles anything, the map below is not readable. */
{
  const t = Buffer.from([255,0,0, 0,255,0, 0,0,255, 0,0,0]);
  writeFileSync('/tmp/_enc.ppm', Buffer.concat([Buffer.from('P6\n4 1\n255\n'), t]));
  const back = readFileSync('/tmp/_enc.ppm').subarray(-12);
  console.log('encoder self-test:', back.equals(t) ? 'PASS' : 'FAIL');
}
const base = readPNG(`${F}/night-base.png`), comp = readPNG(`${F}/night-compose.png`);
const W = base.w, H = base.h, o = Buffer.alloc(W*H*3);
let warm=0, cool=0, none=0, maxd=0;
for (let y=0;y<H;y++) for (let x=0;x<W;x++){
  const [r0,g0,b0]=px(base,x,y), [r1,g1,b1]=px(comp,x,y);
  const d=((b1-r1)-(b0-r0));            // negative = warm-ward
  if (Math.abs(d)>maxd) maxd=Math.abs(d);
  const i=(y*W+x)*3;
  const grey=(0.2126*r0+0.7152*g0+0.0722*b0)*0.30;
  if (d<=-2){ warm++;  o[i]=Math.min(255,120+18*-d); o[i+1]=60; o[i+2]=40; }        // red = warm-ward
  else if (d>=2){ cool++; o[i]=40; o[i+1]=90; o[i+2]=Math.min(255,120+18*d); }      // blue = cool-ward
  else { none++; o[i]=grey; o[i+1]=grey; o[i+2]=grey; }
}
writeFileSync('/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/pnight1/compose-map.ppm',
  Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), o]));
console.log(`warm-ward >=2: ${warm} px (${(100*warm/(W*H)).toFixed(2)}%)`);
console.log(`cool-ward >=2: ${cool} px (${(100*cool/(W*H)).toFixed(2)}%)`);
console.log(`|d(b-r)| < 2 : ${none} px (${(100*none/(W*H)).toFixed(2)}%)   max |d| = ${maxd}`);
