import { normalizeStoryText } from "./story-writing.ts";
import { storyKey, type Story } from "./stories.ts";

export type GeneratedStory = {
 title: string;
 subtitle: string;
 titleEn: string;
 subtitleEn: string;
 bodyUr: string;
 bodyEn: string;
 sourceUr: string;
 sourceEn: string;
 supportingUr: string;
 supportingEn: string;
 sourceSummaryUr: string;
 sourceSummaryEn: string;
 sourceCount: number;
};

const generatedStringFields:(keyof Omit<GeneratedStory,"sourceCount">)[]=["title","subtitle","titleEn","subtitleEn","bodyUr","bodyEn","sourceUr","sourceEn","supportingUr","supportingEn","sourceSummaryUr","sourceSummaryEn"];
const colors=["green","blue","purple","sand"];

export const generatedStorySchema={
 type:"object",
 properties:{
  title:{type:"string",description:"Accurate, natural Urdu title without Markdown"},
  subtitle:{type:"string",description:"One-line Urdu promise describing the complete narrative arc"},
  titleEn:{type:"string",description:"Accurate, natural English title without Markdown"},
  subtitleEn:{type:"string",description:"One-line English promise describing the complete narrative arc"},
  bodyUr:{type:"string",description:"Complete chronological spoken Urdu story, 8-14 substantial paragraphs and normally 800-1400 words"},
  bodyEn:{type:"string",description:"Equivalent complete chronological English story, 8-14 substantial paragraphs and normally 800-1400 words"},
  sourceUr:{type:"string",description:"Primary Qur'an or authentic hadith references in Urdu"},
  sourceEn:{type:"string",description:"Primary Qur'an or authentic hadith references in English"},
  supportingUr:{type:"string",description:"Supporting tafsir or historical sources in Urdu, with reliability labels"},
  supportingEn:{type:"string",description:"Supporting tafsir or historical sources in English, with reliability labels"},
  sourceSummaryUr:{type:"string",description:"Urdu explanation of what the cited sources establish and which details come from tafsir"},
  sourceSummaryEn:{type:"string",description:"Equivalent English source and authenticity explanation"},
  sourceCount:{type:"integer",minimum:2,maximum:8},
 },
 required:["title","subtitle","titleEn","subtitleEn","bodyUr","bodyEn","sourceUr","sourceEn","supportingUr","supportingEn","sourceSummaryUr","sourceSummaryEn","sourceCount"],
 additionalProperties:false,
} as const;

function paragraphs(text:string){return text.split(/\n\s*\n/).map(part=>part.trim()).filter(Boolean)}
function words(text:string){return text.split(/\s+/).filter(Boolean).length}
function duration(text:string){const seconds=Math.max(1,Math.ceil(words(text)/2.2));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`}

export function responseOutputText(value:unknown){
 if(!value||typeof value!=="object")return "";
 const response=value as {output_text?:unknown;output?:unknown};
 if(typeof response.output_text==="string")return response.output_text;
 if(!Array.isArray(response.output))return "";
 for(const item of response.output){
  if(!item||typeof item!=="object"||!Array.isArray((item as {content?:unknown}).content))continue;
  for(const content of (item as {content:Array<unknown>}).content){
   if(content&&typeof content==="object"&&typeof (content as {text?:unknown}).text==="string")return (content as {text:string}).text;
  }
 }
 return "";
}

export function generatedStoryRecord(value:unknown,existing:Story[]):Story{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("The provider did not return a story object.");
 const draft=value as Partial<GeneratedStory>;
 for(const field of generatedStringFields){
  if(typeof draft[field]!=="string"||!draft[field]!.trim())throw new Error(`The generated story is missing ${field}.`);
 }
 if(!Number.isInteger(draft.sourceCount)||draft.sourceCount!<2||draft.sourceCount!>8)throw new Error("The generated story needs two to eight traceable sources.");
 const cleaned=Object.fromEntries(generatedStringFields.map(field=>[field,normalizeStoryText(draft[field] as string).replace(/\*\*/g,"")])) as Record<keyof Omit<GeneratedStory,"sourceCount">,string>;
 if(cleaned.title.length>180||cleaned.titleEn.length>180||cleaned.subtitle.length>300||cleaned.subtitleEn.length>300)throw new Error("The generated title or subtitle is too long.");
 if(cleaned.bodyUr.length>50000||cleaned.bodyEn.length>50000)throw new Error("The generated story is too long.");
 if(paragraphs(cleaned.bodyUr).length<8||paragraphs(cleaned.bodyEn).length<8||words(cleaned.bodyUr)<500||words(cleaned.bodyEn)<500)throw new Error("The generated story is still a summary instead of a complete narrative.");
 if(/&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(cleaned.bodyUr+cleaned.bodyEn))throw new Error("The generated story contains an HTML formatting artifact.");
 const candidateKey=storyKey({titleEn:cleaned.titleEn});
 if(existing.some(story=>storyKey(story)===candidateKey))throw new Error("The provider selected a topic already in the queue.");
 return{id:Date.now(),title:cleaned.title,subtitle:cleaned.subtitle,titleEn:cleaned.titleEn,subtitleEn:cleaned.subtitleEn,status:"Needs review",duration:duration(cleaned.bodyEn),sources:draft.sourceCount!,progress:68,color:colors[existing.length%colors.length],bodyUr:cleaned.bodyUr,bodyEn:cleaned.bodyEn,sourceUr:cleaned.sourceUr,sourceEn:cleaned.sourceEn,supportingUr:cleaned.supportingUr,supportingEn:cleaned.supportingEn,sourceSummaryUr:cleaned.sourceSummaryUr,sourceSummaryEn:cleaned.sourceSummaryEn};
}
