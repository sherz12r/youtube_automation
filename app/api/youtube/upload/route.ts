import { NextRequest, NextResponse } from "next/server";
import { buildSeoMetadata, rankTrendVideos, type TrendVideo } from "../../../../lib/youtube-seo";

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

async function youtubeGet<T>(path:string,params:URLSearchParams,accessToken:string,apiKey?:string){
 if(apiKey)params.set("key",apiKey);
 const response=await fetch(`https://www.googleapis.com/youtube/v3/${path}?${params}`,apiKey?{}:{headers:{Authorization:`Bearer ${accessToken}`}});
 if(!response.ok)throw new Error(`YouTube trend lookup failed (${response.status}).`);
 return await response.json() as T;
}

async function searchRecentVideoIds(accessToken:string,title:string,days:number){
 const language=/[\u0600-\u06ff]/.test(title)?"ur":"en",publishedAfter=new Date(Date.now()-days*24*60*60*1000).toISOString();
 const params=new URLSearchParams({part:"snippet",type:"video",q:title.split("|")[0].trim(),order:"viewCount",publishedAfter,maxResults:"25",relevanceLanguage:language,regionCode:process.env.YOUTUBE_REGION_CODE||(language==="ur"?"PK":"US"),safeSearch:"strict"});
 const result=await youtubeGet<{items?:Array<{id?:{videoId?:string}}>} >("search",params,accessToken,process.env.YOUTUBE_API_KEY);
 return [...new Set((result.items||[]).map(item=>item.id?.videoId).filter((id):id is string=>Boolean(id)))];
}

async function findRecentTrendVideos(accessToken:string,title:string){
 try{
  let windowDays=180,ids=await searchRecentVideoIds(accessToken,title,windowDays);
  if(ids.length<8){windowDays=365;ids=await searchRecentVideoIds(accessToken,title,windowDays)}
  if(!ids.length)return{videos:[] as TrendVideo[],windowDays};
  const params=new URLSearchParams({part:"snippet,statistics",id:ids.join(","),maxResults:"25"});
  const result=await youtubeGet<{items?:Array<{snippet?:{title?:string;description?:string;tags?:string[];publishedAt?:string};statistics?:{viewCount?:string}}>} >("videos",params,accessToken,process.env.YOUTUBE_API_KEY);
  const videos=(result.items||[]).map(item=>({title:item.snippet?.title||"",description:item.snippet?.description||"",tags:item.snippet?.tags||[],publishedAt:item.snippet?.publishedAt||new Date(0).toISOString(),viewCount:Number(item.statistics?.viewCount||0)})).filter(video=>video.title&&video.viewCount>0);
  return{videos:rankTrendVideos(videos),windowDays};
 }catch{return{videos:[] as TrendVideo[],windowDays:0}}
}

export async function POST(request:NextRequest){
 try{
  const {title,description,tags,fileSize,mimeType}=await request.json() as {title?:string;description?:string;tags?:string;fileSize?:number;mimeType?:string};
  if(!fileSize||fileSize<1)return NextResponse.json({error:"A generated video is required."},{status:400});
  const accessToken=await getAccessToken();
  const cleanTitle=mediaText(String(title||"Islamic story")).slice(0,100),baseDescription=cleanMediaText(String(description||""));
  const baseTags=cleanMediaText(String(tags||"")).split(",").map(tag=>tag.trim()).filter(Boolean);
  const trendResearch=await findRecentTrendVideos(accessToken,cleanTitle),seo=buildSeoMetadata(cleanTitle,baseDescription,baseTags,trendResearch.videos);
  const metadata={snippet:{title:seo.title,description:seo.description,tags:seo.tags,categoryId:"22"},status:{privacyStatus:"public",selfDeclaredMadeForKids:false,containsSyntheticMedia:true}};
  const response=await fetch("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable",{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Length":String(fileSize),"X-Upload-Content-Type":mimeType||"video/webm"},body:JSON.stringify(metadata)});
  if(!response.ok)return NextResponse.json({error:await response.text()||"YouTube could not start the upload."},{status:response.status});
  const uploadUrl=response.headers.get("location");
  if(!uploadUrl)return NextResponse.json({error:"YouTube did not return an upload session."},{status:502});
  return NextResponse.json({uploadUrl,optimizedTitle:seo.title,optimizedDescription:seo.description,optimizedKeywords:seo.keywords,trendWindowDays:trendResearch.windowDays,analyzedVideos:trendResearch.videos.length});
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
