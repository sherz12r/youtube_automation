import { NextRequest, NextResponse } from "next/server";

async function getAccessToken() {
  const clientId=process.env.YOUTUBE_CLIENT_ID, clientSecret=process.env.YOUTUBE_CLIENT_SECRET, refreshToken=process.env.YOUTUBE_REFRESH_TOKEN;
  if(!clientId||!clientSecret||!refreshToken)throw new Error("YouTube is not connected. Add YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN.");
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"})});
  const result=await response.json() as {access_token?:string;error_description?:string};
  if(!response.ok||!result.access_token)throw new Error(result.error_description||"YouTube authorization failed.");
  return result.access_token;
}

const blockedMediaPhrases=[/\bNoor\s*Studio\b/gi,/نور\s*اسٹوڈیو/g];
function cleanMediaText(value:string){return blockedMediaPhrases.reduce((text,pattern)=>text.replace(pattern,""),value).replace(/[ \t]{2,}/g," ").replace(/\s+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim()}
function mediaText(value:string,fallback="Islamic story"){return cleanMediaText(value)||fallback}

const seoStopWords=new Set(["about","after","again","allah","also","and","are","before","best","for","from","had","has","have","how","into","islamic","its","our","story","that","the","their","this","through","video","was","were","what","when","with","you","your","ایک","اور","اس","سے","کا","کی","کے","کو","میں","نے","یہ","وہ"]);
function relatedPhrases(items:Array<{snippet?:{title?:string;description?:string}}>) {
 const counts=new Map<string,number>();
 for(const item of items){
  const text=`${item.snippet?.title||""} ${item.snippet?.description||""}`.toLowerCase();
  const words=(text.match(/[\p{L}\p{N}]+/gu)||[]).filter(word=>word.length>2&&!seoStopWords.has(word));
  const phrases=new Set<string>();
  words.forEach(word=>phrases.add(word));
  for(let index=0;index<words.length-1;index+=1)phrases.add(`${words[index]} ${words[index+1]}`);
  phrases.forEach(phrase=>counts.set(phrase,(counts.get(phrase)||0)+1));
 }
 return [...counts.entries()].filter(([,count])=>count>=2).sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length).map(([phrase])=>phrase).slice(0,8);
}
async function findRelatedTrendingPhrases(accessToken:string,title:string){
 try{
  const publishedAfter=new Date(Date.now()-365*24*60*60*1000).toISOString();
  const language=/[\u0600-\u06ff]/.test(title)?"ur":"en";
  const params=new URLSearchParams({part:"snippet",type:"video",q:title,order:"viewCount",publishedAfter,maxResults:"12",relevanceLanguage:language,safeSearch:"strict"});
  const apiKey=process.env.YOUTUBE_API_KEY;if(apiKey)params.set("key",apiKey);
  const response=await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`,apiKey?{}:{headers:{Authorization:`Bearer ${accessToken}`}});
  if(!response.ok)return [];
  const result=await response.json() as {items?:Array<{snippet?:{title?:string;description?:string}}>};
  return relatedPhrases(result.items||[]);
 }catch{return []}
}

export async function POST(request:NextRequest){
 try{
  const {title,description,tags,fileSize,mimeType}=await request.json() as {title?:string;description?:string;tags?:string;fileSize?:number;mimeType?:string};
  if(!fileSize||fileSize<1)return NextResponse.json({error:"A generated video is required."},{status:400});
  const accessToken=await getAccessToken();
  const cleanTitle=mediaText(String(title||"Islamic story")).slice(0,100),trendPhrases=await findRelatedTrendingPhrases(accessToken,cleanTitle);
  const baseDescription=cleanMediaText(String(description||"")),topicLabel=/[\u0600-\u06ff]/.test(cleanTitle)?"متعلقہ موضوعات":"Related topics";
  const optimizedDescription=trendPhrases.length?`${baseDescription}\n\n${topicLabel}: ${trendPhrases.join(", ")}`:baseDescription;
  const baseTags=cleanMediaText(String(tags||"")).split(",").map(tag=>tag.trim()).filter(Boolean),optimizedTags=[...new Set([...baseTags,...trendPhrases])].slice(0,30);
  const metadata={snippet:{title:cleanTitle,description:optimizedDescription.slice(0,5000),tags:optimizedTags,categoryId:"22"},status:{privacyStatus:"public",selfDeclaredMadeForKids:false}};
  const response=await fetch("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable",{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Length":String(fileSize),"X-Upload-Content-Type":mimeType||"video/webm"},body:JSON.stringify(metadata)});
  if(!response.ok)return NextResponse.json({error:await response.text()||"YouTube could not start the upload."},{status:response.status});
  const uploadUrl=response.headers.get("location");
  if(!uploadUrl)return NextResponse.json({error:"YouTube did not return an upload session."},{status:502});
  return NextResponse.json({uploadUrl,optimizedKeywords:trendPhrases});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"YouTube upload could not start."},{status:500})}
}

export async function PUT(request:NextRequest){
 try{
  const uploadUrl=request.headers.get("x-youtube-upload-url"), contentRange=request.headers.get("content-range"), contentType=request.headers.get("x-video-content-type")||"video/webm";
  if(!uploadUrl||!contentRange)return NextResponse.json({error:"Upload session details are missing."},{status:400});
  const url=new URL(uploadUrl);
  const googleUploadHost=url.hostname==="www.googleapis.com"||url.hostname.endsWith(".googleapis.com")||url.hostname.endsWith(".googleusercontent.com");
  if(url.protocol!=="https:"||!googleUploadHost)return NextResponse.json({error:"Invalid YouTube upload destination."},{status:400});
  const accessToken=await getAccessToken();
  const response=await fetch(uploadUrl,{method:"PUT",redirect:"manual",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":contentType,"Content-Range":contentRange},body:await request.arrayBuffer()});
  const text=await response.text();
  if(response.status===308)return NextResponse.json({complete:false,range:response.headers.get("range")});
  if(!response.ok)return NextResponse.json({error:text||"YouTube rejected an upload chunk."},{status:response.status});
  const result=JSON.parse(text) as {id?:string};
  return NextResponse.json({complete:true,id:result.id,url:result.id?`https://youtu.be/${result.id}`:null,privacyStatus:"public"});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"YouTube upload failed."},{status:500})}
}
