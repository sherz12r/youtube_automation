export type TrendVideo={
 title:string;
 description:string;
 tags:string[];
 publishedAt:string;
 viewCount:number;
};

export type SeoMetadata={
 title:string;
 description:string;
 tags:string[];
 keywords:string[];
};

const stopWords=new Set(["about","after","again","allah","also","and","are","before","best","for","from","had","has","have","how","into","islamic","its","our","story","that","the","their","this","through","video","was","were","what","when","with","you","your","ایک","اور","اس","سے","کا","کی","کے","کو","میں","نے","یہ","وہ","اللہ","کہانی"]);

const clean=(value:string)=>value.replace(/[ \t]{2,}/g," ").replace(/\s+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
const words=(value:string)=>(value.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(word=>word.length>2&&!stopWords.has(word));
const titleCase=(value:string)=>value.replace(/\b[a-z]/g,letter=>letter.toUpperCase());

export function rankTrendVideos(videos:TrendVideo[],now=Date.now()){
 return [...videos].sort((a,b)=>{
  const ageA=Math.max(7,(now-Date.parse(a.publishedAt))/(24*60*60*1000));
  const ageB=Math.max(7,(now-Date.parse(b.publishedAt))/(24*60*60*1000));
  const scoreA=Math.log1p(a.viewCount)+Math.log1p(a.viewCount/ageA)*1.8;
  const scoreB=Math.log1p(b.viewCount)+Math.log1p(b.viewCount/ageB)*1.8;
  return scoreB-scoreA;
 });
}

export function extractTrendPhrases(videos:TrendVideo[]){
 const counts=new Map<string,number>(),ranked=rankTrendVideos(videos);
 ranked.forEach((video,index)=>{
  const tokens=words(`${video.title} ${video.description.slice(0,700)} ${video.tags.join(" ")}`);
  const phrases=new Set(tokens);
  for(let word=0;word<tokens.length-1;word+=1)phrases.add(`${tokens[word]} ${tokens[word+1]}`);
  const weight=Math.max(1,ranked.length-index);
  phrases.forEach(phrase=>counts.set(phrase,(counts.get(phrase)||0)+weight));
 });
 return [...counts.entries()]
  .filter(([phrase,count])=>count>=Math.max(2,videos.length)&&phrase.length<=55)
  .sort((a,b)=>b[1]-a[1]||b[0].split(" ").length-a[0].split(" ").length)
  .map(([phrase])=>phrase)
  .slice(0,12);
}

function hashtag(value:string){
 const compact=value.replace(/[^\p{L}\p{N}]+/gu,"");
 return compact.length>=3?`#${compact}`:"";
}

export function buildSeoMetadata(baseTitle:string,baseDescription:string,baseTags:string[],videos:TrendVideo[]):SeoMetadata{
 const language=/[\u0600-\u06ff]/.test(baseTitle)?"ur":"en",core=clean(baseTitle.split("|")[0]||baseTitle);
 const keywords=extractTrendPhrases(videos),secondary=keywords.find(keyword=>!core.toLowerCase().includes(keyword.toLowerCase())&&keyword.includes(" "))||keywords[0]||"";
 const suffix=secondary?(language==="ur"?secondary:titleCase(secondary)):(language==="ur"?"ایمان اور صبر کا سبق":"A Powerful Lesson of Faith");
 const title=clean(`${core} | ${suffix}`).slice(0,100);
 const themes=keywords.slice(0,6),topicText=themes.join(language==="ur"?"، ":", ");
 const cta=language==="ur"
  ?"اگر آپ نے ابھی تک ہمارے چینل کو سبسکرائب نہیں کیا تو سبسکرائب کریں اور بیل آئیکن دبائیں تاکہ نئی اسلامی ویڈیوز کی اطلاع آپ کو فوراً ملے۔"
  :"If you have not subscribed to our channel yet, please subscribe and click the bell icon so you receive updates for every new video.";
 const seoSection=language==="ur"
  ?`اس ویڈیو میں ${core} کے مستند واقعے، اس کے تاریخی پس منظر، اہم فیصلوں، آزمائشوں اور آج کی زندگی کے لیے سبق کو آسان اردو میں بیان کیا گیا ہے۔ ناظرین کی حالیہ دلچسپی سے متعلق موضوعات میں ${topicText||"اسلامی تاریخ، ایمان، صبر اور توکل"} شامل ہیں؛ اس ویڈیو میں انہی موضوعات کو صرف اصل کہانی سے متعلق مقام پر واضح کیا گیا ہے۔\n\nآپ اس ویڈیو میں واقعے کی ترتیب، اہم کرداروں کا کردار، قرآنی یا معتبر تاریخی حوالہ، اور عملی روحانی سبق جانیں گے۔`
  :`This video explains ${core} with its authentic narrative, historical setting, key decisions, trials, and practical lessons for life today. Recent viewer interest around this subject includes ${topicText||"Islamic history, faith, patience, and trust in Allah"}; these themes are discussed only where they genuinely relate to the story.\n\nYou will discover the sequence of events, the role of the main figures, the Qur'anic or verified historical context, and the spiritual lessons viewers can apply today.`;
 const hashes=[...(language==="ur"?["#اسلامی_کہانیاں","#قرآن","#اردو"] :["#IslamicStories","#Quran","#MuslimReminder"]),...themes.slice(0,2).map(hashtag)].filter(Boolean);
 const description=clean(`${baseDescription}\n\n${seoSection}\n\n${cta}\n\n${[...new Set(hashes)].slice(0,5).join(" ")}`).slice(0,5000);
 const tags=[...new Set([...baseTags,...keywords])].filter(Boolean).slice(0,30);
 return{title,description,tags,keywords};
}
