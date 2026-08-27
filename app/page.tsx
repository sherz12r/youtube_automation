"use client";
import { useEffect, useMemo, useState } from "react";

type Story = { id:number; title:string; subtitle:string; status:"Needs review"|"Approved"|"Ready"; duration:string; sources:number; progress:number; color:string };
const initialStories:Story[]=[
 {id:1,title:"The Patience of Prophet Ayyub",subtitle:"A story of faith through hardship",status:"Needs review",duration:"3:42",sources:4,progress:72,color:"sand"},
 {id:2,title:"Prophet Yusuf and the Power of Forgiveness",subtitle:"Choosing mercy when you have power",status:"Approved",duration:"4:18",sources:6,progress:100,color:"blue"},
 {id:3,title:"The Justice of Umar ibn Al-Khattab",subtitle:"A leader who held himself accountable",status:"Ready",duration:"3:56",sources:5,progress:100,color:"green"}
];
const storyText=`Prophet Ayyub, peace be upon him, was blessed with health, family, and provision. Then he was tested with a long period of hardship. Yet his trust in Allah never left him. He called upon his Lord with humility: Indeed, adversity has touched me, and You are the Most Merciful of the merciful. Allah answered his prayer, restored his health, and returned his family to him. His story teaches us that patience is carrying pain while keeping faith, asking Allah for help, and trusting His wisdom.`;
const steps=["Research","Verify","Script","Voice","Video","YouTube"];

export default function Home(){
 const [stories,setStories]=useState(initialStories),[selectedId,setSelectedId]=useState(1),[tab,setTab]=useState("Story queue"),[listening,setListening]=useState(false),[notice,setNotice]=useState(""),[generating,setGenerating]=useState(false),[query,setQuery]=useState("");
 const [scheduleOpen,setScheduleOpen]=useState(false),[scheduleEnabled,setScheduleEnabled]=useState(true),[frequency,setFrequency]=useState("Daily"),[scheduleTime,setScheduleTime]=useState("10:00"),[timezone,setTimezone]=useState("Asia/Dubai"),[days,setDays]=useState(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]);
 const selected=stories.find(s=>s.id===selectedId)??stories[0];
 const filtered=useMemo(()=>stories.filter(s=>s.title.toLowerCase().includes(query.toLowerCase())),[stories,query]);
 useEffect(()=>{const saved=localStorage.getItem("noor-schedule");if(saved){try{const s=JSON.parse(saved);setScheduleEnabled(s.enabled);setFrequency(s.frequency);setScheduleTime(s.time);setTimezone(s.timezone);setDays(s.days)}catch{}}return()=>window.speechSynthesis?.cancel()},[]);
 function speak(){if(!("speechSynthesis" in window)){setNotice("Speech is not supported in this browser.");return}if(listening){speechSynthesis.cancel();setListening(false);return}const u=new SpeechSynthesisUtterance(`${selected.title}. ${storyText}`);u.rate=.92;u.onend=()=>setListening(false);speechSynthesis.speak(u);setListening(true)}
 function approve(){setStories(c=>c.map(s=>s.id===selected.id?{...s,status:"Approved",progress:100}:s));setNotice("Story approved. Video creation has been added to the queue.")}
 function generate(){setGenerating(true);setNotice("Searching approved Islamic sources and preparing a draft…");setTimeout(()=>{const s:Story={id:Date.now(),title:"The Courage of Musa Before Pharaoh",subtitle:"Speaking truth with trust in Allah",status:"Needs review",duration:"4:05",sources:5,progress:68,color:"purple"};setStories(c=>[s,...c]);setSelectedId(s.id);setGenerating(false);setNotice("New researched draft is ready for your review.")},1200)}
 function saveSchedule(){localStorage.setItem("noor-schedule",JSON.stringify({enabled:scheduleEnabled,frequency,time:scheduleTime,timezone,days}));setScheduleOpen(false);setNotice(scheduleEnabled?`Schedule saved. The next story draft will be created ${frequency.toLowerCase()} at ${scheduleTime}.`:"Automatic story creation is paused.")}
 function toggleDay(day:string){setDays(current=>current.includes(day)?current.filter(d=>d!==day):[...current,day])}
 return <main className="app-shell">
  <aside className="sidebar"><div className="brand"><span className="brand-mark">ن</span><div><strong>Noor Studio</strong><small>Stories with purpose</small></div></div>
   <nav aria-label="Main navigation">{["Overview","Story queue","Source library","Video studio","Publishing"].map((item,i)=><button key={item} className={tab===item?"active":""} onClick={()=>setTab(item)}><span>{["⌂","▤","◇","▶","↗"][i]}</span>{item}{item==="Story queue"&&<b>{stories.filter(s=>s.status==="Needs review").length}</b>}</button>)}</nav>
   <div className="sidebar-bottom"><button onClick={()=>setNotice("Settings are ready for your API keys and channel preferences.")}><span>⚙</span>Settings</button><div className="profile"><span>MA</span><div><strong>Mohamed Ali</strong><small>Channel owner</small></div><i>⌄</i></div></div>
  </aside>
  <section className="workspace">
   <header><div><p>THURSDAY, AUGUST 27</p><h1>Your story studio</h1><span>Create meaningful stories, grounded in authentic sources.</span></div><div className="header-actions"><button className="icon-btn" aria-label="Notifications">♢<i/></button><button className="primary" onClick={generate} disabled={generating}><span>＋</span>{generating?"Researching…":"Create new story"}</button></div></header>
   {notice&&<div className="notice" role="status"><span>✓</span>{notice}<button onClick={()=>setNotice("")}>×</button></div>}
   <section className="stats-grid">
    <article><div className="stat-icon peach">✦</div><div><p>Stories this month</p><strong>12</strong><small><em>↑ 20%</em> from last month</small></div></article>
    <article><div className="stat-icon mint">✓</div><div><p>Awaiting your review</p><strong>{stories.filter(s=>s.status==="Needs review").length}</strong><small>Accuracy check needed</small></div></article>
    <article><div className="stat-icon lilac">▶</div><div><p>Videos published</p><strong>8</strong><small>4 scheduled this week</small></div></article>
    <article><div className="stat-icon sky">◴</div><div><p>Time saved</p><strong>18.5h</strong><small>This month</small></div></article>
   </section>
   <section className="content-grid"><div className="queue-card">
    <div className="section-title"><div><h2>Story queue</h2><p>Review the research before anything is produced.</p></div><label className="search">⌕<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search stories"/></label></div>
    <div className="story-list">{filtered.map(s=><button key={s.id} className={`story-row ${selected.id===s.id?"selected":""}`} onClick={()=>setSelectedId(s.id)}><span className={`story-art ${s.color}`}><i>☾</i></span><span className="story-main"><strong>{s.title}</strong><small>{s.subtitle}</small><span className="meta">◷ {s.duration}　◇ {s.sources} verified sources</span></span><span className="story-state"><i className={s.status.replace(" ","-").toLowerCase()}>{s.status}</i><small>{s.progress}% complete</small><span className="progress"><b style={{width:`${s.progress}%`}}/></span></span><span className="chevron">›</span></button>)}</div>
    <button className="view-all" onClick={()=>setQuery("")}>View all stories <span>→</span></button>
   </div><aside className="review-card"><div className="review-head"><span>REVIEW REQUIRED</span><small>Human approval protects accuracy</small></div><div className={`review-art ${selected.color}`}><span>☾</span><i>✦</i><b>✦</b></div><div className="review-body"><h2>{selected.title}</h2><p>{selected.subtitle}</p>
    <button className={`listen ${listening?"playing":""}`} onClick={speak}><span>{listening?"Ⅱ":"▶"}</span><strong>{listening?"Stop listening":"Listen to full story"}</strong><small>Browser voice · {selected.duration}</small></button>
    <div className="source-check"><div className="source-title"><span>✓</span><div><strong>Source verification</strong><small>{selected.sources} references checked</small></div><button onClick={()=>setNotice("Sources: Qur’an 21:83–84, Tafsir Ibn Kathir, and cross-checked commentary.")}>View sources</button></div><ul><li><span>Qur’an</span><b>21:83–84</b><i>Verified</i></li><li><span>Translation</span><b>Sahih International</b><i>Verified</i></li><li><span>Claims</span><b>No unsupported details</b><i>Checked</i></li></ul></div>
    <button className="approve" onClick={approve} disabled={selected.status!=="Needs review"}>✓ {selected.status==="Needs review"?"Approve & create video":"Approved"}</button><button className="edit" onClick={()=>setNotice("Story editor opened. You can revise any line before approval.")}>Edit story first</button>
   </div></aside></section>
   <section className="pipeline"><div><h2>Today’s automation</h2><p>The bot pauses at verification and waits for you.</p></div><div className="steps">{steps.map((s,i)=><div key={s} className={i<2?"done":i===2?"current":""}><span>{i<2?"✓":i+1}</span><small>{s}</small>{i<steps.length-1&&<i/>}</div>)}</div><button className={scheduleEnabled?"schedule-on":""} onClick={()=>setScheduleOpen(true)}>{scheduleEnabled?`${frequency} · ${scheduleTime}`:"Schedule off"}　⌄</button></section>
   {scheduleOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setScheduleOpen(false)}}><section className="schedule-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
    <button className="modal-close" aria-label="Close schedule" onClick={()=>setScheduleOpen(false)}>×</button><span className="eyebrow">AUTOMATION SCHEDULE</span><h2 id="schedule-title">Create stories automatically</h2><p>No story will become a video until you review its sources and approve it.</p>
    <label className="switch-row"><div><strong>Scheduled story creation</strong><small>Research and prepare a new draft automatically</small></div><input type="checkbox" checked={scheduleEnabled} onChange={e=>setScheduleEnabled(e.target.checked)}/><i/></label>
    <div className="schedule-form"><label><span>Frequency</span><select value={frequency} onChange={e=>setFrequency(e.target.value)}><option>Daily</option><option>Weekly</option><option>Custom days</option></select></label><label><span>Creation time</span><input type="time" value={scheduleTime} onChange={e=>setScheduleTime(e.target.value)}/></label><label className="wide"><span>Timezone</span><select value={timezone} onChange={e=>setTimezone(e.target.value)}><option>Asia/Dubai</option><option>Asia/Riyadh</option><option>Europe/London</option><option>America/New_York</option><option>UTC</option></select></label></div>
    {frequency!=="Daily"&&<div className="day-picker"><span>Run on</span><div>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day=><button key={day} className={days.includes(day)?"selected":""} onClick={()=>toggleDay(day)}>{day.slice(0,1)}</button>)}</div></div>}
    <div className="schedule-summary"><span>◷</span><div><strong>Next scheduled draft</strong><small>{scheduleEnabled?`${frequency} at ${scheduleTime} · ${timezone}`:"Scheduling is currently paused"}</small></div></div>
    <div className="modal-actions"><button onClick={()=>setScheduleOpen(false)}>Cancel</button><button onClick={saveSchedule}>Save schedule</button></div>
   </section></div>}
  </section>
 </main>
}
