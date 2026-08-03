/* Per-arm stats in a FIXED box, same box every arm, so whatever the box admits is common to
 * all arms and cancels in the differences. Shows nothing about populations outside it. */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
const DIR='/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/drift/frames';
const [shot,X,Y,W2,H2]=[process.argv[2],+process.argv[3],+process.argv[4],+process.argv[5],+process.argv[6]];
const hue=(r,g,b)=>{const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;
 let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;return h<0?h+360:h;};
const medn=a=>{const s=[...a].sort((x,y)=>x-y);return s[s.length>>1];};
console.log(`${shot} box (${X},${Y}) ${W2}x${H2}`);
console.log('arm          hueP50  satP50   medL    R/G     b-r     G-darkest%');
for(const arm of process.argv.slice(7)){
  let im; try{im=readPNG(`${DIR}/${shot}-${arm}.png`);}catch{continue;}
  const hs=[],ss=[],ls=[];let R=0,G=0,B=0,c=0,gd=0;
  for(let y=Y;y<Y+H2;y++)for(let x=X;x<X+W2;x++){
    const [r,g,b]=px(im,x,y);hs.push(hue(r,g,b));
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);ss.push(mx?(mx-mn)/mx:0);
    ls.push(0.2126*r+0.7152*g+0.0722*b);R+=r;G+=g;B+=b;c++;if(g<r&&g<b)gd++;
  }
  console.log(`${arm.padEnd(12)} ${medn(hs).toFixed(0).padStart(5)}   ${medn(ss).toFixed(3)}   ${medn(ls).toFixed(1).padStart(5)}  ${(R/G).toFixed(3)}  ${((B-R)/c/255).toFixed(4).padStart(7)}  ${(100*gd/c).toFixed(1)}%`);
}
