import { NextRequest, NextResponse } from "next/server";
import { createYoutubeUploadSession, deleteYoutubeUploadSession, getYoutubeUploadSession } from "../../../../db/youtube-upload-store";
import { buildSeoMetadata, rankTrendVideos, type TrendVideo } from "../../../../lib/youtube-seo";

type GoogleError={error?:string|{code?:number;message?:string;status?:string;errors?:Array<{message?:string;reason?:string}>};error_description?:string;access_token?:string;expires_in?:number};
let cachedAccessToken:{value:string;expiresAt:number}|undefined;

function parseGoogleError(text:string,status:number,operation:string){let result:GoogleError={};try{result=JSON.parse(text) as GoogleError}catch{/* Use the safe status fallback below. */}const code=typeof result.error==="string"?result.error:"",detail=typeof result.error==="object"?result.error:undefined,reason=detail?.errors?.[0]?.reason,message=detail?.message||result.error_description;if(code==="invalid_grant")return"YouTube authorization expired or was revoked. Create a new refresh token using the same Google OAuth client with offline access and the youtube.upload scope, update YOUTUBE_REFRESH_TOKEN, then restart the app.";if(code==="invalid_client")return"YouTube OAuth client credentials were rejected. Verify YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET belong to the client that issued the refresh token.";if(status===401)return"YouTube authorization is no longer valid. Reconnect the Google account and replace YOUTUBE_REFRESH_TOKEN.";if(status===403&&reason==="insufficientPermissions")return"The Google authorization is missing the youtube.upload scope. Create a new refresh token with YouTube upload permission.";if(status===403&&/quota/i.test(`${reason} ${message}`))return"The YouTube API upload quota is exhausted. Check Google Cloud quota and retry after it resets.";if(message)return`YouTube ${operation} failed: ${message}${reason?` (${reason})`:""}.`;return`YouTube ${operation} failed (HTTP ${status})${/^\s*bad request\s*$/i.test(text)?". Google rejected the request before returning details.":"."}`}

async function getAccessToken() {
  if(cachedAccessToken&&cachedAccessToken.expiresAt>Date.now()+60000)return cachedAccessToken.value;
  const clientId=process.env.YOUTUBE_CLIENT_ID, clientSecret=process.env.YOUTUBE_CLIENT_SECRET, refreshToken=process.env.YOUTUBE_REFRESH_TOKEN;
  if(!clientId||!clientSecret||!refreshToken)throw new Error("YouTube is not connected. Add YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN.");
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"})});
  const text=await response.text();let result:GoogleError={};try{result=JSON.parse(text) as GoogleError}catch{/* Report a safe provider error below. */}
  if(!response.ok||!result.access_token)throw new Error(parseGoogleError(text,response.status,"authorization"));
  cachedAccessToken={value:result.access_token,expiresAt:Date.now()+Math.max(60,result.expires_in||3600)*1000};
  return cachedAccessToken.value;
}

function videoMimeType(value:unknown){const mime=String(value||"video/webm").split(";",1)[0].trim().toLowerCase();return mime.startsWith("video/")?mime:"video/webm"}

export async function GET(){try{await getAccessToken();return NextResponse.json({connected:true},{headers:{"Cache-Control":"no-store"}})}catch(error){return NextResponse.json({connected:false,error:error instanceof Error?error.message:"YouTube authorization failed."},{status:503,headers:{"Cache-Control":"no-store"}})}}

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
  if(!Number.isSafeInteger(fileSize)||Number(fileSize)<1)return NextResponse.json({error:"A generated video is required."},{status:400});
  const accessToken=await getAccessToken();
  const uploadMimeType=videoMimeType(mimeType);
  const cleanTitle=mediaText(String(title||"Islamic story")).slice(0,100),baseDescription=cleanMediaText(String(description||""));
  const baseTags=cleanMediaText(String(tags||"")).split(",").map(tag=>tag.trim()).filter(Boolean);
  const trendResearch=await findRecentTrendVideos(accessToken,cleanTitle),seo=buildSeoMetadata(cleanTitle,baseDescription,baseTags,trendResearch.videos);
  const metadata={snippet:{title:seo.title,description:seo.description,tags:seo.tags,categoryId:"22"},status:{privacyStatus:"public",selfDeclaredMadeForKids:false,containsSyntheticMedia:true}};
  const response=await fetch("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable",{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Length":String(fileSize),"X-Upload-Content-Type":uploadMimeType},body:JSON.stringify(metadata)});
  if(!response.ok){const text=await response.text();return NextResponse.json({error:parseGoogleError(text,response.status,"session creation")},{status:502})}
  const uploadUrl=response.headers.get("location");
  if(!uploadUrl)return NextResponse.json({error:"YouTube did not return an upload session."},{status:502});
  const uploadSession=await createYoutubeUploadSession(uploadUrl,Number(fileSize),uploadMimeType);
  return NextResponse.json({sessionId:uploadSession.id,optimizedTitle:seo.title,optimizedDescription:seo.description,optimizedKeywords:seo.keywords,trendWindowDays:trendResearch.windowDays,analyzedVideos:trendResearch.videos.length});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"YouTube upload could not start."},{status:500})}
}

export async function PUT(request:NextRequest){
 try{
  const sessionId=request.headers.get("x-youtube-upload-session")||"",contentRange=request.headers.get("content-range");
  if(!sessionId||!contentRange)return NextResponse.json({error:"Upload session details are missing."},{status:400});
  const uploadSession=await getYoutubeUploadSession(sessionId);
  if(!uploadSession)return NextResponse.json({error:"The YouTube upload session expired. Start the upload again."},{status:410});
  const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
  if(!range||Number(range[3])!==uploadSession.fileSize)return NextResponse.json({error:"The YouTube upload byte range is invalid."},{status:400});
  const bytes=await request.arrayBuffer();
  if(bytes.byteLength!==Number(range[2])-Number(range[1])+1)return NextResponse.json({error:"The YouTube upload chunk is incomplete."},{status:400});
  const accessToken=await getAccessToken();
  const response=await fetch(uploadSession.uploadUrl,{method:"PUT",redirect:"manual",headers:{Authorization:`Bearer ${accessToken}`,"Content-Length":String(bytes.byteLength),"Content-Type":uploadSession.mimeType,"Content-Range":contentRange},body:bytes});
  const text=await response.text();
  if(response.status===308)return NextResponse.json({complete:false,range:response.headers.get("range")});
  if(!response.ok){if(response.status===404)await deleteYoutubeUploadSession(sessionId);return NextResponse.json({error:parseGoogleError(text,response.status,"video upload")},{status:502})}
  const result=JSON.parse(text) as {id?:string};
  await deleteYoutubeUploadSession(sessionId);
  return NextResponse.json({complete:true,id:result.id,url:result.id?`https://youtu.be/${result.id}`:null,privacyStatus:"public"});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"YouTube upload failed."},{status:500})}
}
