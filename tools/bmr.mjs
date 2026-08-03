import { readPNG } from '/home/user/Demo/tools/png.mjs';
for (const f of process.argv.slice(2)) {
  const im = readPNG(f), ch = im.data.length/(im.w*im.h), N = im.w*im.h;
  let L=0,bmr=0;
  for (let i=0,p=0;i<N;i++,p+=ch){
    L += (0.2126*im.data[p]+0.7152*im.data[p+1]+0.0722*im.data[p+2])/255;
    bmr += (im.data[p+2]-im.data[p])/255;
  }
  console.log(`${f.padEnd(42)} luma ${(L/N).toFixed(4)}   mean b-r ${(bmr/N>=0?'+':'')}${(bmr/N).toFixed(4)}`);
}
