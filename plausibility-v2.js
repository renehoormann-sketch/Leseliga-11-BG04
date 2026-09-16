import { FIREBASE_CONFIG } from "./config.js";
import { getActiveSeason } from "./stats.js?v=20260915-seasons1";

const SDK_VERSION = "12.18.0";
const [{ initializeApp, getApps, getApp }, authMod, dbMod] = await Promise.all([
  import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
  import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
  import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-database.js`)
]);

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = authMod.getAuth(app);
const db = dbMod.getDatabase(app);
const state = { config: null, profiles: null, days: null, reviews: {} };
let reviewsAvailable = true;
let unsubs = [];

const esc = (value = "") => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const dayNo = value => { const [y,m,d] = String(value).split("-").map(Number); return Math.floor(Date.UTC(y,m-1,d)/86400000); };
const localDate = timestamp => { const d = new Date(Number(timestamp)); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const monday = value => { const d = new Date(`${value}T12:00:00`); d.setDate(d.getDate()-((d.getDay()+6)%7)); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const normalize = value => String(value||"").trim().toLowerCase().replace(/\s+/g," ");

function activeRecords(uid){
  const season = getActiveSeason({config:state.config||{}});
  return Object.entries(state.days?.[uid]||{})
    .filter(([date]) => date >= season.start && date <= season.end)
    .map(([date,entry]) => ({date,...entry}))
    .sort((a,b) => a.date.localeCompare(b.date));
}

function progress(section){
  const text = normalize(section);
  const nums = [...text.matchAll(/\d+/g)].map(m=>Number(m[0])).filter(Number.isFinite);
  if(!nums.length) return null;
  const value = Math.max(...nums);
  if(/kap(?:itel)?/.test(text)) return {type:"chapter",value};
  if(/(?:s\.?|seite|seiten)\s*\d/.test(text)) return {type:"page",value};
  return null;
}

function longestTwoXpRun(records){
  const dates = records.filter(r=>Number(r.xp)===2).map(r=>r.date).sort();
  let best=0,run=0,last=null;
  for(const date of dates){const n=dayNo(date);run=last!==null&&n===last+1?run+1:1;best=Math.max(best,run);last=n;}
  return best;
}

function maxFinishedInWindow(records, windowDays=7){
  const days = records.filter(r=>r.finished===true).map(r=>dayNo(r.date)).sort((a,b)=>a-b);
  let best=0,left=0;
  for(let right=0;right<days.length;right+=1){while(days[right]-days[left]>=windowDays)left+=1;best=Math.max(best,right-left+1);}
  return best;
}

function weeklyTotals(records){
  const map = new Map();
  records.forEach(r=>{const key=monday(r.date);map.set(key,(map.get(key)||0)+Number(r.xp||0));});
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}

function vagueSection(value){
  const text=normalize(value).replace(/[.!?]/g,"");
  if(text.length<3) return true;
  return /^(weiter|gelesen|lesen|buch|kapitel|seiten?|ein paar seiten|ca ?\d+ seiten?|\d+ seiten?)$/.test(text);
}

function analyze(uid){
  const records = activeRecords(uid);
  const signals=[];
  const add=(points,text,code)=>signals.push({points,text,code});
  if(!records.length) return {uid,records,signals,score:0,level:"green",latestActivity:0};
  const today=localDate(Date.now());

  const future=records.filter(r=>r.date>today).length;
  if(future) add(5,`${future} Eintrag${future===1?"":"e"} mit zukünftigem Datum`,"future");

  const twos=records.filter(r=>Number(r.xp)===2).length;
  if(records.length>=8&&twos/records.length>=0.9) add(2,`${twos} von ${records.length} Lesetagen mit 2 XP`,"two-ratio");
  else if(records.length>=10&&twos/records.length>=0.8) add(1,`sehr hoher Anteil an 2-XP-Tagen (${twos}/${records.length})`,"two-ratio-soft");

  const run=longestTwoXpRun(records);
  if(run>=7) add(3,`${run} Tage in Folge jeweils 2 XP`,"two-streak");
  else if(run>=5) add(2,`${run} Tage in Folge jeweils 2 XP`,"two-streak-soft");

  const repetitions=new Map();
  records.forEach(r=>{const key=`${normalize(r.book)}|||${normalize(r.section)}`;if(key!=="|||")repetitions.set(key,(repetitions.get(key)||0)+1);});
  const maxRepeat=Math.max(0,...repetitions.values());
  if(maxRepeat>=5) add(3,`derselbe Buch-/Abschnitt-Eintrag an ${maxRepeat} Tagen`,"repeat");
  else if(maxRepeat>=3) add(2,`derselbe Buch-/Abschnitt-Eintrag an ${maxRepeat} Tagen`,"repeat-soft");

  const vague=records.filter(r=>vagueSection(r.section)).length;
  if(records.length>=5&&vague>=4) add(2,`${vague} sehr ungenaue Abschnittsangaben`,"vague");
  else if(records.length>=5&&vague>=3) add(1,`${vague} eher ungenaue Abschnittsangaben`,"vague-soft");

  let regressions=0;
  const byBook=new Map();
  records.forEach(r=>{const book=normalize(r.book);if(!book)return;const p=progress(r.section);if(!p)return;const prev=byBook.get(book);if(prev&&prev.type===p.type&&p.value<prev.value-(p.type==="page"?5:1))regressions+=1;byBook.set(book,p);});
  if(regressions>=2) add(1,`${regressions} auffällige Rücksprünge bei Seiten/Kapiteln`,"progress");

  const delayed=records.filter(r=>{
    if(!Number(r.updatedAt)||r.lastEditedBy==="teacher")return false;
    return dayNo(localDate(r.updatedAt))-dayNo(r.date)>=2;
  }).length;
  if(delayed>=5) add(2,`${delayed} Einträge erst deutlich später gespeichert/geändert`,"delayed");
  else if(delayed>=3) add(1,`${delayed} Einträge erst deutlich später gespeichert/geändert`,"delayed-soft");

  const editCounts=records.map(r=>Number(r.editCount||0));
  const totalEdits=editCounts.reduce((a,b)=>a+b,0),maxEdits=Math.max(0,...editCounts);
  if(maxEdits>=4||totalEdits>=8) add(2,`ungewöhnlich viele nachträgliche Änderungen (${totalEdits})`,"edits");
  else if(maxEdits>=2||totalEdits>=4) add(1,`mehrere nachträgliche Änderungen (${totalEdits})`,"edits-soft");

  const finished7=maxFinishedInWindow(records,7);
  if(finished7>=6) add(2,`${finished7} als beendet markierte Bücher innerhalb von 7 Tagen`,"finished");
  else if(finished7>=4) add(1,`${finished7} als beendet markierte Bücher innerhalb von 7 Tagen`,"finished-soft");

  const weeks=weeklyTotals(records);
  if(weeks.length>=4){
    const previous=weeks.slice(0,-1).map(([,xp])=>xp).sort((a,b)=>a-b);
    const baseline=previous[Math.floor(previous.length/2)]||0;
    const latest=weeks.at(-1)?.[1]||0;
    if(baseline>=1&&latest>=6&&latest>=baseline*2.5) add(1,`deutlicher Sprung gegenüber der eigenen bisherigen Wochenleistung`,"surge");
  }

  const score=signals.reduce((sum,s)=>sum+s.points,0);
  const level=score>=5?"orange":score>=2?"yellow":"green";
  const latestActivity=Math.max(0,...records.map(r=>Number(r.updatedAt||r.createdAt||0)));
  return {uid,records,signals,score,level,latestActivity};
}

function reviewFor(result){
  const season=getActiveSeason({config:state.config||{}}),review=state.reviews?.[season.id]?.[result.uid]||null;
  if(!review)return {review:null,stale:false};
  const stale=Number(result.latestActivity||0)>Number(review.reviewedAt||0)+1000;
  return {review,stale};
}

function levelMeta(level){
  if(level==="orange")return {icon:"🟠",label:"Buchcheck empfohlen",className:"pa-orange"};
  if(level==="yellow")return {icon:"🟡",label:"bei Gelegenheit nachfragen",className:"pa-yellow"};
  return {icon:"🟢",label:"unauffällig",className:"pa-green"};
}

function hashString(value){let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}

function weeklyChecks(results){
  const today=localDate(Date.now()),week=monday(today),hidden=state.config?.hiddenStudents||{};
  const eligible=results.filter(r=>!hidden[r.uid]&&state.profiles?.[r.uid]);
  const active=eligible.filter(r=>{const {review,stale}=reviewFor(r);return !(review?.status==="cleared"&&!stale);});
  const picked=[];
  active.filter(r=>r.score>0).sort((a,b)=>{
    const ar=reviewFor(a).review,br=reviewFor(b).review;
    return Number(br?.status==="watch")-Number(ar?.status==="watch")||b.score-a.score||b.latestActivity-a.latestActivity;
  }).slice(0,2).forEach(r=>picked.push({...r,kind:"Hinweischeck"}));
  const remaining=eligible.filter(r=>!picked.some(p=>p.uid===r.uid)&&!(reviewFor(r).review?.status==="cleared"&&!reviewFor(r).stale));
  if(remaining.length){const control=[...remaining].sort((a,b)=>hashString(`${week}:${a.uid}`)-hashString(`${week}:${b.uid}`))[0];picked.push({...control,kind:"Routinecheck"});}
  return {week,picked:picked.slice(0,3)};
}

function ensureUi(){
  if(document.getElementById("plausibilityV2Card"))return;
  const old=document.getElementById("plausibilityList")?.closest("section.card");
  if(old)old.style.display="none";
  const card=document.createElement("section");
  card.id="plausibilityV2Card";card.className="card";
  card.innerHTML=`<div class="section-head"><div><h3>🛡️ Plausibilitätsassistent 2.0</h3><p>Priorisiert kurze Buchchecks – keine automatische Sanktion</p></div><span class="badge">nur Lehrkraft</span></div>
  <div class="notice" style="margin-bottom:14px">Hinweispunkte sind <b>keine Betrugswahrscheinlichkeit</b>. Viel Lesen allein erzeugt keine orange Stufe. Entscheidend sind mehrere voneinander unabhängige Muster.</div>
  <div id="paRulesWarning" class="notice hidden" style="margin-bottom:14px"></div>
  <div class="flag-item" style="margin-bottom:14px"><b>🎯 Buchchecks dieser Woche</b><small id="paChecks">Wird berechnet …</small></div>
  <div id="paSummary" style="margin-bottom:12px"></div><div id="paList" class="flag-list"></div>
  <details style="margin-top:14px"><summary>Bereits geprüfte Profile</summary><div id="paReviewed" class="flag-list" style="margin-top:10px"></div></details>`;
  (old||document.querySelector("#adminView .admin-grid .stack:last-child")?.firstElementChild)?.insertAdjacentElement("beforebegin",card);
  const style=document.createElement("style");style.textContent=`#plausibilityV2Card .pa-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:5px}#plausibilityV2Card .pa-score{font-size:11px;padding:3px 7px;border-radius:999px;border:1px solid var(--line)}#plausibilityV2Card .pa-orange{border-color:rgba(255,150,80,.55);background:rgba(255,150,80,.08)}#plausibilityV2Card .pa-yellow{border-color:rgba(255,209,102,.4);background:rgba(255,209,102,.06)}#plausibilityV2Card .pa-green{border-color:rgba(126,231,135,.32);background:rgba(126,231,135,.04)}#plausibilityV2Card .pa-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}#plausibilityV2Card .pa-actions .btn{padding:6px 9px;font-size:11px}`;document.head.appendChild(style);
  card.addEventListener("click",async event=>{const btn=event.target.closest("[data-pa-action]");if(!btn)return;await saveReview(btn.dataset.uid,btn.dataset.paAction);});
}

function render(){
  if(!state.config||!state.profiles||!state.days)return;
  ensureUi();
  const hidden=state.config?.hiddenStudents||{};
  const results=Object.keys(state.profiles).filter(uid=>!hidden[uid]).map(analyze);
  const active=[],reviewed=[];
  results.forEach(result=>{const info=reviewFor(result);if(info.review?.status==="cleared"&&!info.stale)reviewed.push({...result,...info});else active.push({...result,...info});});
  active.sort((a,b)=>b.score-a.score||b.latestActivity-a.latestActivity);
  const orange=active.filter(r=>r.level==="orange").length,yellow=active.filter(r=>r.level==="yellow").length;
  document.getElementById("paSummary").innerHTML=`<b>${orange} 🟠 · ${yellow} 🟡</b> <span style="color:var(--muted)">von ${results.length} aktiven Profilen</span>`;
  const checks=weeklyChecks(results);
  document.getElementById("paChecks").innerHTML=checks.picked.length?checks.picked.map(r=>{const name=esc(state.profiles?.[r.uid]?.nickname||"Ohne Namen"),meta=levelMeta(r.level);return `${r.kind==="Routinecheck"?"🔎":"📖"} <b>${name}</b> · ${r.kind}${r.kind!=="Routinecheck"?` (${meta.icon} ${r.score} P.)`:""}`;}).join("<br>"):"Noch keine Profile für einen Check verfügbar.";
  const warn=document.getElementById("paRulesWarning");warn.classList.toggle("hidden",reviewsAvailable);warn.textContent=reviewsAvailable?"":"Die Auswertung funktioniert bereits. Für „geprüft/beobachten“ müssen noch die aktuellen Firebase-Regeln veröffentlicht werden.";
  const list=document.getElementById("paList");
  const relevant=active.filter(r=>r.score>0||r.review?.status==="watch");
  list.innerHTML=relevant.length?relevant.map(r=>{
    const meta=levelMeta(r.level),name=esc(state.profiles?.[r.uid]?.nickname||"Ohne Namen"),watch=r.review?.status==="watch"&&!r.stale,stale=r.stale;
    const reasons=r.signals.length?r.signals.map(s=>`• ${esc(s.text)} <span style="color:var(--muted)">(+${s.points})</span>`).join("<br>"):"Keine aktuellen automatischen Hinweise.";
    return `<div class="flag-item ${meta.className}"><div class="pa-head"><b>${meta.icon} ${name}</b><span class="pa-score">${r.score} Hinweispunkte</span>${watch?'<span class="flag-badge">👀 beobachten</span>':""}${stale?'<span class="flag-badge">neu seit Prüfung</span>':""}</div><small><b>${meta.label}</b><br>${reasons}</small><div class="pa-actions"><button class="btn" data-pa-action="cleared" data-uid="${esc(r.uid)}">✓ geprüft – plausibel</button><button class="btn secondary" data-pa-action="watch" data-uid="${esc(r.uid)}">👀 beobachten</button>${r.review?`<button class="btn ghost" data-pa-action="reset" data-uid="${esc(r.uid)}">Status zurücksetzen</button>`:""}</div></div>`;
  }).join(""):'<div class="empty">🟢 Aktuell keine Muster, die einen zusätzlichen Buchcheck nahelegen.</div>';
  document.getElementById("paReviewed").innerHTML=reviewed.length?reviewed.map(r=>`<div class="flag-item pa-green"><b>✓ ${esc(state.profiles?.[r.uid]?.nickname||"Ohne Namen")}</b><small>geprüft und aktuell ohne neue Einträge seit der Prüfung</small><div class="pa-actions"><button class="btn ghost" data-pa-action="reset" data-uid="${esc(r.uid)}">Status zurücksetzen</button></div></div>`).join(""):'<div class="empty">Noch keine Profile als geprüft markiert.</div>';
}

async function saveReview(uid,action){
  const season=getActiveSeason({config:state.config||{}}),ref=dbMod.ref(db,`adminReviews/${season.id}/${uid}`);
  try{
    if(action==="reset")await dbMod.remove(ref);
    else await dbMod.set(ref,{status:action,reviewedAt:dbMod.serverTimestamp()});
  }catch(err){reviewsAvailable=false;render();alert("Der Prüfstatus konnte noch nicht gespeichert werden. Bitte zuerst die aktualisierten Firebase-Regeln veröffentlichen.");}
}

function stop(){unsubs.forEach(u=>u?.());unsubs=[];}
function start(){
  stop();reviewsAvailable=true;
  const subscribe=(path,key,onError)=>dbMod.onValue(dbMod.ref(db,path),snap=>{state[key]=snap.val()||{};render();},onError);
  unsubs.push(subscribe("config","config"));
  unsubs.push(subscribe("profiles","profiles"));
  unsubs.push(subscribe("days","days"));
  unsubs.push(subscribe("adminReviews","reviews",()=>{state.reviews={};reviewsAvailable=false;render();}));
}

authMod.onAuthStateChanged(auth,async user=>{
  stop();
  if(!user)return;
  try{const admin=await dbMod.get(dbMod.ref(db,`admins/${user.uid}`));if(admin.exists()&&admin.val()===true)start();}catch{/* Lehrerbereich übernimmt die Login-Fehlermeldung. */}
});
