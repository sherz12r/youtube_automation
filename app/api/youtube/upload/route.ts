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

export async function POST(request:NextRequest){
 try{
  const {title,description,tags,fileSize,mimeType}=await request.json() as {title?:string;description?:string;tags?:string;fileSize?:number;mimeType?:string};
  if(!fileSize||fileSize<1)return NextResponse.json({error:"A generated video is required."},{status:400});
  const accessToken=await getAccessToken();
  const metadata={snippet:{title:mediaText(String(title||"Islamic story")).slice(0,100),description:cleanMediaText(String(description||"")).slice(0,5000),tags:cleanMediaText(String(tags||"")).split(",").map(tag=>tag.trim()).filter(Boolean).slice(0,30),categoryId:"22"},status:{privacyStatus:"private",selfDeclaredMadeForKids:false}};
  const response=await fetch("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable",{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Length":String(fileSize),"X-Upload-Content-Type":mimeType||"video/webm"},body:JSON.stringify(metadata)});
  if(!response.ok)return NextResponse.json({error:await response.text()||"YouTube could not start the upload."},{status:response.status});
  const uploadUrl=response.headers.get("location");
  if(!uploadUrl)return NextResponse.json({error:"YouTube did not return an upload session."},{status:502});
  return NextResponse.json({uploadUrl});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"YouTube upload could not start."},{status:500})}
}

export async function PUT(request:NextRequest){
 try{
  const uploadUrl=request.headers.get("x-youtube-upload-url"), contentRange=request.headers.get("content-range"), contentType=request.headers.get("x-video-content-type")||"video/webm";
  if(!uploadUrl||!contentRange)return NextResponse.json({error:"Upload session details are missing."},{status:400});
  const url=new URL(uploadUrl);
  if(url.protocol!=="https:"||!(url.hostname==="www.googleapis.com"||url.hostname.endsWith(".googleapis.com")))return NextResponse.json({error:"Invalid YouTube upload destination."},{status:400});
  const accessToken=await getAccessToken();
  const response=await fetch(uploadUrl,{method:"PUT",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":contentType,"Content-Range":contentRange},body:await request.arrayBuffer()});
  const text=await response.text();
  if(response.status===308)return NextResponse.json({complete:false,range:response.headers.get("range")});
  if(!response.ok)return NextResponse.json({error:text||"YouTube rejected an upload chunk."},{status:response.status});
  const result=JSON.parse(text) as {id?:string};
  return NextResponse.json({complete:true,id:result.id,url:result.id?`https://youtu.be/${result.id}`:null,privacyStatus:"private"});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"YouTube upload failed."},{status:500})}
}
