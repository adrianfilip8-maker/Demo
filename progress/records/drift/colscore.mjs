/* Per-arm stats on a FIXED, SHOWN crop of temple's near column shaft — the surface where the
 * drift was first sized (hue 26 -> 214, satP50 0.336 -> 0.125, medL 122.7 -> 80.9 between
 * tx7 and today). Same box in every arm, so whatever the box admits is common to all of them
 * and cancels in the differences. The box is written out as a crop; look at it. */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
const DIR='/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/drift/frames';
const [X,Y,W2,H2]=[1040,90,200,380];
const hue=(r,g,b)=>{const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;
 let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;return h<0?h+360:h;};
const medn=a=>{const s=[...a].sort((x,y)=>x-y);return s[s.length>>1];};
console.log(`temple near-column crop (${X},${Y}) ${W2}x${H2}`);
console.log('arm          hueP50  satP50   medL    R/G     b-r');
for(const arm of process.argv.slice(2)){
  let im; try{im=readPNG(`${DIR}/temple-${arm}.png`);}catch{continue;}
  const hs=[],ss=[],ls=[];let R=0,G=0,B=0,c=0;
  for(let y=Y;y<Y+H2;y++)for(let x=X;x<X+W2;x++){
    const [r,g,b]=px(im,x,y);hs.push(hue(r,g,b));
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);ss.push(mx?(mx-mn)/mx:0);
    ls.push(0.2126*r+0.7152*g+0.0722*b);R+=r;G+=g;B+=b;c++;
  }
  console.log(`${arm.padEnd(12)} ${medn(hs).toFixed(0).padStart(5)}   ${medn(ss).toFixed(3)}   ${medn(ls).toFixed(1).padStart(5)}  ${(R/G).toFixed(3)}  ${((B-R)/c/255).toFixed(4)}`);
}
