import { NextRequest, NextResponse } from "next/server";

type SceneInput={kind?:string;label?:string;caption?:string;prophetPresent?:boolean;visualHint?:string;sequence?:number;totalScenes?:number};

const imageModel=process.env.OPENAI_IMAGE_MODEL?.trim()||"gpt-image-2.5-flare";
const configuredQuality=process.env.OPENAI_IMAGE_QUALITY?.trim().toLowerCase();
const imageQuality=configuredQuality&&["low","medium","high"].includes(configuredQuality)?configuredQuality:"low";

export async function GET(){
 return NextResponse.json({ready:Boolean(process.env.OPENAI_API_KEY),model:imageModel,quality:imageQuality},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:NextRequest){
 try{
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey)return NextResponse.json({error:"Realistic scene generation is not configured. Add OPENAI_API_KEY in cPanel Application Manager, save, and restart the Node.js application."},{status:503});
  const body=await request.json() as {title?:string;scenes?:SceneInput[]};
  const title=String(body.title||"Historical Islamic story").slice(0,180);
  const scenes=(Array.isArray(body.scenes)?body.scenes:[]).slice(0,6);
  if(!scenes.length)return NextResponse.json({error:"No visual scenes were provided."},{status:400});
  const images:string[]=[];
  for(const [index,scene] of scenes.entries()){
   const sacredRule=scene.prophetPresent?"A prophet is part of this event. The prophet may appear only as a respectful distant or rear-view robed figure. Fully conceal the face with camera angle, deep shadow, or soft natural light; never show facial features and never use a halo.":"Use historically appropriate ordinary people only; avoid recognizable modern people.";
   const label=String(scene.label||scene.kind||"Story moment").slice(0,100),caption=String(scene.caption||"").slice(0,700),visualHint=String(scene.visualHint||caption||label).slice(0,900);
   const sequence=Number.isInteger(scene.sequence)&&Number(scene.sequence)>0?Number(scene.sequence):index+1;
   const totalScenes=Number.isInteger(scene.totalScenes)&&Number(scene.totalScenes)>=sequence?Number(scene.totalScenes):scenes.length;
   const prompt=[
    "Create one cinematic photorealistic live-action historical documentary frame for a narrated Islamic story. It must look like a frame from a serious period film, never an illustration, animation, 2D art, cartoon, CGI render, poster, collage, or thumbnail.",
    "Use realistic people and anatomy, weathered fabric, stone, dust, practical period props, atmospheric depth, realistic camera optics, subtle film grain, believable lighting, and restrained cinematic color grading.",
    "Compose for 16:9 widescreen with the important action center-safe. No text, captions, subtitles, borders, logos, watermarks, UI, or modern objects.",
    "Respectful Islamic treatment: no divine beings, angels, icons, religious caricatures, presenter, or talking head. Keep this frame specific to this narrative moment.",
    sacredRule,
    `Selected story: ${title}. Sequence frame ${sequence} of ${totalScenes}: ${label}. Scene-specific visual brief: ${visualHint}. Narrative event: ${caption}`,
   ].join(" ");
   const response=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:imageModel,prompt,size:"1280x720",quality:imageQuality,output_format:"jpeg",output_compression:80}),signal:AbortSignal.timeout(120000)});
   const result=await response.json() as {data?:Array<{b64_json?:string}>;error?:{message?:string;code?:string}};
   const encoded=result.data?.[0]?.b64_json;
   if(!response.ok||!encoded)throw new Error(`Scene ${sequence}/${totalScenes} failed: ${result.error?.message||"The image API did not return a scene."}`);
   images.push(`data:image/jpeg;base64,${encoded}`);
  }
  return NextResponse.json({images,model:imageModel,quality:imageQuality},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Realistic visuals could not be generated."},{status:500})}
}
