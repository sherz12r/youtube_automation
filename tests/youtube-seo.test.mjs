import test from "node:test";
import assert from "node:assert/strict";
import { buildSeoMetadata, rankTrendVideos } from "../lib/youtube-seo.ts";

const now=Date.parse("2026-09-26T00:00:00Z");
const videos=[
 {title:"Prophet Musa and Pharaoh Explained",description:"The courage of Musa, the staff, and the court of Pharaoh.",tags:["prophet musa","pharaoh"],publishedAt:"2026-08-20T00:00:00Z",viewCount:420000},
 {title:"The Story of Prophet Musa",description:"Faith and courage before Pharaoh with lessons from the Quran.",tags:["prophet musa","quran story"],publishedAt:"2026-07-12T00:00:00Z",viewCount:510000},
 {title:"Musa Before Pharaoh",description:"A powerful reminder about faith, patience, and trust in Allah.",tags:["musa before pharaoh"],publishedAt:"2026-05-01T00:00:00Z",viewCount:610000},
];

test("recent YouTube performance signals create original, bounded SEO metadata",()=>{
 const ranked=rankTrendVideos(videos,now);
 assert.equal(ranked.length,3);
 const seo=buildSeoMetadata("The Courage of Musa Before Pharaoh | A Powerful Islamic Story","A sourced account of Musa and Pharaoh.",["Islamic stories"],ranked);
 assert.ok(seo.title.length<=100);
 assert.notEqual(seo.title,videos[0].title);
 assert.match(seo.description,/Recent viewer interest/);
 assert.match(seo.description,/subscribe/i);
 assert.ok(seo.description.length>400);
 assert.ok(seo.description.length<=5000);
 assert.ok(seo.keywords.length>0);
 assert.ok(seo.tags.length<=30);
});

test("Urdu metadata keeps the subscription call to action in Urdu",()=>{
 const seo=buildSeoMetadata("حضرت موسیٰ علیہ السلام اور فرعون","قرآن کی روشنی میں مستند واقعہ۔",["اسلامی کہانیاں"],videos);
 assert.match(seo.description,/سبسکرائب/);
 assert.match(seo.description,/بیل آئیکن/);
 assert.ok(seo.title.length<=100);
});
