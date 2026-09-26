const encodedSpace=/&#x20;|&#32;|&nbsp;/gi;
const invisibleFormatting=/[\u200B-\u200D\uFEFF]/g;

export function normalizeStoryText(value:string){
 return value
  .replace(encodedSpace," ")
  .replace(/\u00a0/g," ")
  .replace(invisibleFormatting,"")
  .replace(/[ \t]+\n/g,"\n")
  .replace(/\n[ \t]+/g,"\n")
  .replace(/[ \t]{2,}/g," ")
  .replace(/\n{3,}/g,"\n\n")
  .trim();
}
