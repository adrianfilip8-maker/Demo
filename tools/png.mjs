import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
export function readPNG(file){
  const buf=readFileSync(file);let p=8,w=0,h=0,bd=0,ct=0;const idat=[];
  while(p<buf.length){const len=buf.readUInt32BE(p);const type=buf.toString('ascii',p+4,p+8);
    const body=buf.subarray(p+8,p+8+len);
    if(type==='IHDR'){w=body.readUInt32BE(0);h=body.readUInt32BE(4);bd=body[8];ct=body[9];}
    else if(type==='IDAT')idat.push(body);else if(type==='IEND')break;p+=12+len;}
  if(bd!==8)throw new Error('bitdepth');
  const ch={0:1,2:3,4:2,6:4}[ct];const raw=zlib.inflateSync(Buffer.concat(idat));
  const stride=w*ch;const out=Buffer.alloc(h*stride);let q=0;
  for(let y=0;y<h;y++){const f=raw[q++];const line=raw.subarray(q,q+stride);q+=stride;
    const cur=out.subarray(y*stride,(y+1)*stride);const prev=y?out.subarray((y-1)*stride,y*stride):null;
    for(let i=0;i<stride;i++){const a=i>=ch?cur[i-ch]:0;const b=prev?prev[i]:0;const c=prev&&i>=ch?prev[i-ch]:0;
      let v=line[i];
      if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;
      else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);
        v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);}
      cur[i]=v&255;}}
  return {w,h,ch,data:out};
}
export const px=(im,x,y)=>{const i=(y*im.w+x)*im.ch;return [im.data[i],im.data[i+1],im.data[i+2]];};
