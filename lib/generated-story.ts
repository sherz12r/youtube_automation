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

export type StoryFormat = "full" | "short";

const generatedStringFields:(keyof Omit<GeneratedStory,"sourceCount">)[]=["title","subtitle","titleEn","subtitleEn","bodyUr","bodyEn","sourceUr","sourceEn","supportingUr","supportingEn","sourceSummaryUr","sourceSummaryEn"];
const colors=["green","blue","purple","sand"];

function storySchema(bodyUrDescription:string,bodyEnDescription:string){return {
 type:"object",
 properties:{
  title:{type:"string",description:"Accurate, natural Urdu title without Markdown"},
  subtitle:{type:"string",description:"One-line Urdu promise describing the complete narrative arc"},
  titleEn:{type:"string",description:"Accurate, natural English title without Markdown"},
  subtitleEn:{type:"string",description:"One-line English promise describing the complete narrative arc"},
  bodyUr:{type:"string",description:bodyUrDescription},
  bodyEn:{type:"string",description:bodyEnDescription},
  sourceUr:{type:"string",description:"Primary reputable, traceable source references described in Urdu"},
  sourceEn:{type:"string",description:"Primary reputable, traceable source references described in English"},
  supportingUr:{type:"string",description:"Supporting sources in Urdu, including reliability or evidence labels"},
  supportingEn:{type:"string",description:"Supporting sources in English, including reliability or evidence labels"},
  sourceSummaryUr:{type:"string",description:"Urdu explanation of what the cited sources establish and any uncertainty"},
  sourceSummaryEn:{type:"string",description:"Equivalent English explanation of sources, evidence, and uncertainty"},
  sourceCount:{type:"integer",minimum:2,maximum:8},
 },
 required:["title","subtitle","titleEn","subtitleEn","bodyUr","bodyEn","sourceUr","sourceEn","supportingUr","supportingEn","sourceSummaryUr","sourceSummaryEn","sourceCount"],
 additionalProperties:false,
} as const}

export function generatedStorySchemaFor(format:StoryFormat){
 return format==="short"
  ?storySchema("Complete 30-60 second spoken Urdu Prophet story, 2-5 compact paragraphs and 65-130 words","Equivalent complete 30-60 second spoken English Prophet story, 2-5 compact paragraphs and 65-130 words")
  :storySchema("Complete chronological spoken Urdu story, 8-14 substantial paragraphs and normally 800-1400 words","Equivalent complete chronological English story, 8-14 substantial paragraphs and normally 800-1400 words");
}

export const generatedStorySchema=generatedStorySchemaFor("full");

function paragraphs(text:string){return text.split(/\n\s*\n/).map(part=>part.trim()).filter(Boolean)}
function words(text:string){return text.split(/\s+/).filter(Boolean).length}
function duration(text:string){const seconds=Math.max(1,Math.ceil(words(text)/2.2));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`}
function announcesStory(text:string,language:"ur"|"en"){
 const opening=text.trim().replace(/\s+/g," ").slice(0,240);
 return language==="en"
  ?/^(?:hello|welcome|assalamu alaikum|today\b.{0,90}\b(?:tell|share|story)|in (?:today(?:'s)?|this) (?:video|story)|this is the story of|let(?:'s| us) (?:tell|share|hear|learn)|we (?:will|are going to|'re going to) (?:tell|share))/i.test(opening)
  :/^(?:السلام علیکم|آج\s+ہم\s+آپ\s+کو|آئیے\s+(?:ہم\s+)?آپ\s+کو|ہم\s+آپ\s+کو.{0,80}(?:کہانی|قصہ).{0,40}(?:سنائیں|بتائیں)|آج\s+کی\s+(?:اس\s+)?کہانی)/u.test(opening);
}

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

export function generatedStoryRecord(value:unknown,existing:Story[],format:StoryFormat="full"):Story{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("The provider did not return a story object.");
 const draft=value as Partial<GeneratedStory>;
 for(const field of generatedStringFields){
  if(typeof draft[field]!=="string"||!draft[field]!.trim())throw new Error(`The generated story is missing ${field}.`);
 }
 if(!Number.isInteger(draft.sourceCount)||draft.sourceCount!<2||draft.sourceCount!>8)throw new Error("The generated story needs two to eight traceable sources.");
 const cleaned=Object.fromEntries(generatedStringFields.map(field=>[field,normalizeStoryText(draft[field] as string).replace(/\*\*/g,"")])) as Record<keyof Omit<GeneratedStory,"sourceCount">,string>;
 if(cleaned.title.length>180||cleaned.titleEn.length>180||cleaned.subtitle.length>300||cleaned.subtitleEn.length>300)throw new Error("The generated title or subtitle is too long.");
 if(cleaned.bodyUr.length>50000||cleaned.bodyEn.length>50000)throw new Error("The generated story is too long.");
 const urParagraphs=paragraphs(cleaned.bodyUr).length,enParagraphs=paragraphs(cleaned.bodyEn).length,urWords=words(cleaned.bodyUr),enWords=words(cleaned.bodyEn);
 if(format==="short"){
  if(urParagraphs<2||enParagraphs<2||urParagraphs>5||enParagraphs>5||urWords<65||enWords<65||urWords>130||enWords>130)throw new Error("The short story must be a complete 30-60 second narrative of 65-130 words in each language.");
  if(announcesStory(cleaned.bodyUr,"ur")||announcesStory(cleaned.bodyEn,"en"))throw new Error("The short story must begin directly inside the event, without announcing or introducing the story.");
 }else if(urParagraphs<8||enParagraphs<8||urWords<500||enWords<500)throw new Error("The generated story is still a summary instead of a complete narrative.");
 if(/&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(cleaned.bodyUr+cleaned.bodyEn))throw new Error("The generated story contains an HTML formatting artifact.");
 const candidateKey=storyKey({titleEn:cleaned.titleEn});
 if(existing.some(story=>storyKey(story)===candidateKey))throw new Error("The provider selected a topic already in the queue.");
 const createdAt=Date.now();
 return{id:createdAt,createdAt,title:cleaned.title,subtitle:cleaned.subtitle,titleEn:cleaned.titleEn,subtitleEn:cleaned.subtitleEn,status:"Needs review",duration:duration(cleaned.bodyEn),sources:draft.sourceCount!,progress:68,color:colors[existing.length%colors.length],bodyUr:cleaned.bodyUr,bodyEn:cleaned.bodyEn,sourceUr:cleaned.sourceUr,sourceEn:cleaned.sourceEn,supportingUr:cleaned.supportingUr,supportingEn:cleaned.supportingEn,sourceSummaryUr:cleaned.sourceSummaryUr,sourceSummaryEn:cleaned.sourceSummaryEn};
}
