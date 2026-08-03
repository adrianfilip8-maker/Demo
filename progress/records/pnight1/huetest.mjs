/* Self-test of pnighthue's hue arithmetic against hand-computed values, and of the circular
   dHue against a wrap case. If this fails, nothing pnighthue prints is worth reading. */
const hueOf=(r,g,b)=>{const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;
 let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;return h<0?h+360:h;};
const dHue=(h,ref)=>{let d=h-ref;while(d>180)d-=360;while(d<=-180)d+=360;return d;};
const cases=[
 ['pure red',255,0,0,0],['pure green',0,255,0,120],['pure blue',0,0,255,240],
 ['cyan',0,255,255,180],['magenta',255,0,255,300],
 /* a night shadow-side violet like the ones §8/task16 report: B max, R > G */
 ['violet B-max R>G',60,40,90,264],
 /* the palette shadow tint #2a3f66 */
 ['#2a3f66',0x2a,0x3f,0x66,219.0],
 /* palette rim #7fd4ff */
 ['#7fd4ff',0x7f,0xd4,0xff,200.156],
];
let ok=true;
for(const [n,r,g,b,exp] of cases){const h=hueOf(r,g,b);const good=Math.abs(h-exp)<0.6;
 if(!good)ok=false;console.log(`${n.padEnd(20)} rgb(${r},${g},${b}) -> ${h.toFixed(2)}  expect ${exp}  ${good?'ok':'FAIL'}`);}
console.log('\ncircular dHue:');
const dc=[[350,10,-20],[10,350,20],[264,262,2],[179,-179,-2]];
for(const [a,b,exp] of dc){const d=dHue(a,b);const good=Math.abs(d-exp)<1e-9;if(!good)ok=false;
 console.log(`  dHue(${a},${b}) = ${d}  expect ${exp}  ${good?'ok':'FAIL'}`);}
console.log(`\nSELF-TEST ${ok?'PASS':'FAIL'}`);
