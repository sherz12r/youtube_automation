import { NextRequest, NextResponse } from "next/server";

type SceneInput={kind?:string;label?:string;caption?:string;prophetPresent?:boolean;visualHint?:string};

export async function POST(request:NextRequest){
 try{
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey)return NextResponse.json({error:"OPENAI_API_KEY is required for realistic visuals."},{status:500});
  const body=await request.json() as {title?:string;scenes?:SceneInput[]};
  const title=String(body.title||"Historical Islamic story").slice(0,180);
  const scenes=(Array.isArray(body.scenes)?body.scenes:[]).slice(0,6);
  if(!scenes.length)return NextResponse.json({error:"No visual scenes were provided."},{status:400});
  const images:string[]=[];
  for(const [index,scene] of scenes.entries()){
   const sacredRule=scene.prophetPresent?"A prophet is part of this event. Do not depict the prophet's face or identifiable body. Tell the event through the environment, objects, distant silhouettes from behind, and ordinary witnesses only.":"Use historically appropriate ordinary people only; avoid recognizable modern people.";
   const label=String(scene.label||scene.kind||"Story moment").slice(0,100),caption=String(scene.caption||"").slice(0,700),visualHint=String(scene.visualHint||caption||label).slice(0,900);
   const prompt=["Create a cinematic photorealistic live-action historical documentary still, like one shot from a narrated story video. Do not make an illustration, animation, 2D art, cartoon, CGI, poster, or thumbnail.","Natural skin, fabric, stone, dust, fire, water and atmospheric lighting; realistic camera optics and film color grading; 16:9 widescreen crop-safe composition; no text, captions, subtitles, logos or watermarks.","Respectful Islamic visual treatment. No divine beings, angels, halos, glowing faces, icons, religious caricatures, host, presenter, talking head, or modern reference footage.","Generate this shot for the selected story only. Do not copy or reuse the user's example video, its people, its location, or another story's visual setting.",sacredRule,`Selected story: ${title}. Shot ${index+1} of ${scenes.length}: ${label}. Scene-specific visual brief: ${visualHint}. Narrative event: ${caption}`].join(" ");
   const response=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-image-2",prompt,size:"1536x1024",quality:"medium",output_format:"jpeg",output_compression:82})});
   const result=await response.json() as {data?:Array<{b64_json?:string}>;error?:{message?:string}};
   const encoded=result.data?.[0]?.b64_json;
   if(!response.ok||!encoded)throw new Error(result.error?.message||"A realistic scene could not be generated.");
   images.push(`data:image/jpeg;base64,${encoded}`);
  }
  return NextResponse.json({images});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Realistic visuals could not be generated."},{status:500})}
}
