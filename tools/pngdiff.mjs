import { readPNG } from '/home/user/Demo/tools/png.mjs';
const [A,B] = process.argv.slice(2);
const a = readPNG(A), b = readPNG(B);
if (a.w!==b.w||a.h!==b.h) { console.log('SIZE MISMATCH'); process.exit(1); }
const ch = a.data.length/(a.w*a.h);
let n=0, maxd=0, sum=0;
// bounding box of change, so "where" is answered as well as "how much"
let x0=1e9,y0=1e9,x1=-1,y1=-1;
for (let y=0;y<a.h;y++) for (let x=0;x<a.w;x++){
  const i=(y*a.w+x)*ch;
  const d=Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2]));
  if(d>0){n++;sum+=d;if(d>maxd)maxd=d;
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;}
}
const tot=a.w*a.h;
console.log(`${A.split('/').pop()} vs ${B.split('/').pop()}  ${a.w}x${a.h}`);
console.log(`  differing px : ${n} of ${tot}  (${(100*n/tot).toFixed(3)}%)`);
console.log(`  max channel Δ: ${maxd}   mean Δ over changed px: ${n?(sum/n).toFixed(2):0}`);
console.log(`  change bbox  : ${x1<0?'(none)':`x ${x0}..${x1}  y ${y0}..${y1}  (${x1-x0+1}x${y1-y0+1})`}`);
