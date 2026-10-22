import assert from "node:assert/strict";
import test from "node:test";
import { generatedStoryRecord, responseOutputText } from "../lib/generated-story.ts";

const paragraph=Array.from({length:70},(_,index)=>`word${index}`).join(" ");
const completeBody=Array.from({length:8},(_,index)=>`Paragraph ${index+1} ${paragraph}`).join("\n\n");
const shortParagraph=Array.from({length:30},(_,index)=>`short${index}`).join(" ");
const shortBody=Array.from({length:3},(_,index)=>`Scene ${index+1} ${shortParagraph}`).join("\n\n");
const draft={
 title:"ایک نئی مکمل کہانی",
 subtitle:"پس منظر سے انجام تک ایک مستند واقعہ",
 titleEn:"A New Complete Story",
 subtitleEn:"A sourced account from background to resolution",
 bodyUr:`${completeBody} &#x20;`,
 bodyEn:completeBody,
 sourceUr:"سورۃ مثال 1:1-10",
 sourceEn:"Surah Example 1:1-10",
 supportingUr:"کلاسیکی تفسیر، واضح نسبت کے ساتھ",
 supportingEn:"Classical tafsir, explicitly attributed",
 sourceSummaryUr:"بنیادی واقعہ قرآن سے اور اضافی پس منظر تفسیر سے ہے۔",
 sourceSummaryEn:"The main event is Quranic and extra context is attributed to tafsir.",
 sourceCount:2,
};
const shortDraft={...draft,title:"مختصر نبی کی کہانی",titleEn:"A Complete Prophet Short",bodyUr:shortBody,bodyEn:shortBody};

test("complete generated stories are normalized and stored with their scripts",()=>{
 const story=generatedStoryRecord(draft,[]);
 assert.equal(story.titleEn,draft.titleEn);
 assert.equal(story.bodyUr.includes("&#x20;"),false);
 assert.equal(story.status,"Needs review");
 assert.equal(story.sources,2);
 assert.equal(story.createdAt,story.id);
 assert.match(story.duration,/^\d+:\d{2}$/);
});

test("short summaries and duplicate topics fail the generation quality gate",()=>{
 assert.throws(()=>generatedStoryRecord({...draft,bodyEn:"Too short."},[]),/complete narrative/);
 const existing=generatedStoryRecord(draft,[]);
 assert.throws(()=>generatedStoryRecord(draft,[existing]),/already in the queue/);
});

test("Prophet shorts are complete and constrained to a 30-60 second script",()=>{
 const story=generatedStoryRecord(shortDraft,[],"short");
 assert.match(story.duration,/^0:[3-5]\d$/);
 assert.throws(()=>generatedStoryRecord({...shortDraft,bodyEn:"Too short."},[],"short"),/30-60 second narrative/);
 assert.throws(()=>generatedStoryRecord(shortDraft,[],"full"),/complete narrative/);
});

test("Prophet shorts start inside the event instead of announcing the story",()=>{
 const announcedEn=`Today we will tell you the story of a Prophet. ${shortBody}`;
 const announcedUr=`آج ہم آپ کو کہانی سنائیں گے۔ ${shortBody}`;
 assert.throws(()=>generatedStoryRecord({...shortDraft,bodyEn:announcedEn},[],"short"),/begin directly inside the event/);
 assert.throws(()=>generatedStoryRecord({...shortDraft,bodyUr:announcedUr},[],"short"),/begin directly inside the event/);
});

test("Responses API output text is extracted from the REST envelope",()=>{
 assert.equal(responseOutputText({output:[{content:[{type:"output_text",text:"structured"}]}]}),"structured");
 assert.equal(responseOutputText({output_text:"direct"}),"direct");
});
