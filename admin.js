import { createDataService, dateUtils } from "./data-service.js";
import {
  computeLeaderboard,
  computeLeaderboardForSeason,
  rankLeaderboard,
  totalClassXp,
  getMonthRecords,
  completedBooksCount,
  completedBooksCountForSeason,
  getActiveSeason,
  getNextSeason,
  getSeasonGoal
} from "./stats.js?v=20260915-seasons1";

const $=(id)=>document.getElementById(id);
const esc=(v="")=>String(v).replace(/[&<>'"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
let service,state,unsubscribe;
function msg(el,text,type="ok"){el.innerHTML=text?`<div class="notice ${type}">${esc(text)}</div>`:"";}
function fmtFullDate(date){return new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(`${date}T12:00:00`));}

service=await createDataService();
$("modeBadge").textContent=service.mode==="demo"?"● DEMO":"● LIVE";
$("modeBadge").className=`badge ${service.mode==="demo"?"demo":"live"}`;
if(service.mode==="demo"){$("demoCredentials").classList.remove("hidden");$("resetDemoBtn").classList.remove("hidden");$("recoveryAdminCard").classList.add("hidden");$("email").value="lehrer@demo.de";$("password").value="leseliga";}
$("entryDate").value=dateUtils.yyyyMmDd();

const restoreHiddenBtn=document.createElement("button");
restoreHiddenBtn.id="restoreHiddenBtn";
restoreHiddenBtn.className="btn ghost";
restoreHiddenBtn.type="button";
restoreHiddenBtn.textContent="Ausgeblendete";
$("csvBtn").insertAdjacentElement("beforebegin",restoreHiddenBtn);

function ensureSeasonCard(){
  if($("seasonControlCard"))return;
  const card=document.createElement("section");
  card.id="seasonControlCard";
  card.className="card";
  card.innerHTML=`
    <div class="section-head"><div><h3>Season-Steuerung</h3><p>Quartalswertung & Zwischensieger</p></div><span id="seasonNumberBadge" class="badge">Season</span></div>
    <div class="notice" style="margin-bottom:14px"><b id="seasonControlName">–</b><br><span id="seasonControlDates">–</span></div>
    <button id="closeSeasonBtn" class="btn primary full" type="button">Season abschließen</button>
    <div id="seasonControlMessage" style="margin-top:12px"></div>
    <div style="margin-top:18px"><b>Season-Archiv</b><div id="seasonArchiveAdmin" class="flag-list" style="margin-top:10px"></div></div>`;
  $("recoveryAdminCard").insertAdjacentElement("beforebegin",card);
  $("closeSeasonBtn").addEventListener("click",closeCurrentSeason);
}

function hiddenStudents(){return state?.config?.hiddenStudents||{};}

function dayNumber(date){
  const [y,m,d]=String(date).split("-").map(Number);
  return Math.floor(Date.UTC(y,m-1,d)/86400000);
}

function plausibilityFlags(currentState){
  const result=new Map();
  const records=getMonthRecords(currentState);
  const byUid={};
  records.forEach(r=>{(byUid[r.uid]||=[]).push(r);});
  const today=dateUtils.yyyyMmDd();

  Object.entries(byUid).forEach(([uid,userRows])=>{
    const reasons=[];
    const sorted=[...userRows].sort((a,b)=>a.date.localeCompare(b.date));
    const future=sorted.filter(r=>r.date>today);
    if(future.length) reasons.push(`${future.length} Eintrag${future.length===1?"":"e"} mit zukünftigem Datum`);
    const twoXp=sorted.filter(r=>Number(r.xp)===2);
    if(sorted.length>=10&&twoXp.length/sorted.length>=0.9) reasons.push(`${twoXp.length} von ${sorted.length} Lesetagen mit jeweils 2 XP`);
    let maxRun=0,run=0,lastDay=null;
    sorted.filter(r=>Number(r.xp)===2).forEach(r=>{
      const n=dayNumber(r.date);
      run=(lastDay!==null&&n===lastDay+1)?run+1:1;
      maxRun=Math.max(maxRun,run);
      lastDay=n;
    });
    if(maxRun>=7) reasons.push(`${maxRun} Tage in Folge jeweils 2 XP`);
    const repeated=new Map();
    sorted.forEach(r=>{
      const key=`${String(r.book||"").trim().toLowerCase()}|||${String(r.section||"").trim().toLowerCase()}`;
      if(key!=="|||") repeated.set(key,(repeated.get(key)||0)+1);
    });
    const repeatMax=Math.max(0,...repeated.values());
    if(repeatMax>=3) reasons.push(`derselbe Buch-/Abschnitt-Eintrag an ${repeatMax} Tagen`);
    if(reasons.length) result.set(uid,reasons);
  });
  return result;
}

function renderPlausibility(rows,flags){
  const flagged=rows.filter(r=>flags.has(r.uid));
  $("plausibilitySummary").textContent=flagged.length?`${flagged.length} von ${rows.length} Teilnehmer${rows.length===1?"":"n"} mit Hinweis`:"Keine auffälligen Muster in der aktiven Season";
  if(!flagged.length){$("plausibilityList").innerHTML='<div class="empty"><span class="flag-ok">✓</span> Aktuell keine Plausibilitäts-Hinweise.</div>';return;}
  $("plausibilityList").innerHTML=flagged.map(r=>`<div class="flag-item"><b>⚠️ ${esc(r.nickname)} · ${r.xp} XP</b><small>${(flags.get(r.uid)||[]).map(esc).join(" · ")}<br>Empfehlung: bei Gelegenheit kurzer Buchcheck – nicht automatisch werten oder sanktionieren.</small></div>`).join("");
}

function renderSeasonArchive(){
  ensureSeasonCard();
  const archives=Object.values(state.config?.seasonArchives||{}).filter(Boolean).sort((a,b)=>String(b.start||"").localeCompare(String(a.start||"")));
  $("seasonArchiveAdmin").innerHTML=archives.length?archives.map(a=>{
    const podium=(a.rows||[]).slice(0,3).map(r=>`#${r.rank} ${esc(r.nickname)} (${r.xp} XP · 📚 ${r.books||0})`).join(" · ");
    return `<div class="flag-item"><b>🏆 ${esc(a.label||"Season")}</b><small>${esc(fmtFullDate(a.start))} – ${esc(fmtFullDate(a.end))}<br>${podium||"Keine Ergebnisse"}<br>Klasse: ${a.classXp||0} XP · ${a.totalBooks||0} Bücher</small></div>`;
  }).join(""):'<div class="empty">Noch keine Season abgeschlossen.</div>';
}

async function closeCurrentSeason(){
  if(!state)return;
  const season=getActiveSeason(state);
  const next=getNextSeason(state);
  const rows=rankLeaderboard(computeLeaderboardForSeason(state,season.id)).map(r=>({...r,books:completedBooksCountForSeason(state,r.uid,season.id)}));
  const today=dateUtils.yyyyMmDd();
  let text=`${season.label} wirklich abschließen?\n\nDie Endergebnisse werden archiviert. Alte Einträge bleiben vollständig erhalten.`;
  if(next) text+=`\n\nAnschließend startet ${next.label} mit einer neuen Rangliste bei 0 XP.`;
  else text+="\n\nDies ist die letzte Season vor den Sommerferien.";
  if(!confirm(text))return;
  if(today<season.end&&!confirm(`Die Season endet planmäßig erst am ${fmtFullDate(season.end)}. Trotzdem vorzeitig abschließen?`))return;

  const archives={...(state.config?.seasonArchives||{})};
  archives[season.id]={
    id:season.id,label:season.label,start:season.start,end:season.end,closedAt:Date.now(),
    classXp:rows.reduce((sum,r)=>sum+Number(r.xp||0),0),
    totalBooks:rows.reduce((sum,r)=>sum+Number(r.books||0),0),
    rows:rows.map(r=>({uid:r.uid,nickname:r.nickname,rank:r.rank,xp:r.xp,books:r.books||0}))
  };
  const patch={seasonArchives:archives};
  if(next){
    patch.activeSeasonId=next.id;
    patch.seasonLabel=next.label;
    patch.activeMonth=next.start.slice(0,7);
    patch.schoolYearFinished=false;
  }else{
    patch.schoolYearFinished=true;
  }
  try{
    await service.adminSaveConfig(patch);
    const winners=rows.slice(0,3).map(r=>`#${r.rank} ${r.nickname}`).join(" · ");
    msg($("seasonControlMessage"),next?`${season.label} archiviert. ${winners||"Keine Wertung"}. ${next.label} ist jetzt aktiv.`:`${season.label} archiviert. Schuljahr abgeschlossen.`);
  }catch(err){msg($("seasonControlMessage"),err.message||"Season konnte nicht abgeschlossen werden.","error");}
}

async function hideStudent(uid,nickname){
  if(!confirm(`${nickname} wirklich aus der Leseliga-Wertung entfernen?\n\nDas Profil und die Einträge bleiben gespeichert, zählen aber nicht mehr für Rangliste, Klassenziel oder Auswertungen.`))return;
  const next={...hiddenStudents(),[uid]:true};
  try{await service.adminSaveConfig({hiddenStudents:next});}catch(err){alert(err.message||"Profil konnte nicht ausgeblendet werden.");}
}

restoreHiddenBtn.addEventListener("click",async()=>{
  if(!state)return;
  const hidden=Object.entries(hiddenStudents()).filter(([,v])=>v===true);
  if(!hidden.length){alert("Aktuell sind keine Teilnehmer ausgeblendet.");return;}
  const choices=hidden.map(([uid],i)=>`${i+1}. ${state.profiles?.[uid]?.nickname||"Ohne Namen"}`);
  const answer=prompt(`Welches Profil soll wieder eingeblendet werden?\n\n${choices.join("\n")}\n\nNummer eingeben:`);
  if(answer===null)return;
  const index=Number(answer)-1;
  if(!Number.isInteger(index)||index<0||index>=hidden.length){alert("Bitte eine gültige Nummer eingeben.");return;}
  const uid=hidden[index][0];
  const next={...hiddenStudents()};delete next[uid];
  try{await service.adminSaveConfig({hiddenStudents:next});}catch(err){alert(err.message||"Profil konnte nicht wieder eingeblendet werden.");}
});

function render(){
  if(!state)return;
  ensureSeasonCard();
  const season=getActiveSeason(state);
  const next=getNextSeason(state);
  const rows=rankLeaderboard(computeLeaderboard(state)),total=totalClassXp(state),raffle=Number(state.config.raffleXp||8);
  const flags=plausibilityFlags(state);
  const hiddenCount=Object.values(hiddenStudents()).filter(v=>v===true).length;
  restoreHiddenBtn.textContent=hiddenCount?`Ausgeblendete (${hiddenCount})`:"Ausgeblendete";

  $("adminTitle").textContent=state.config.className||"LESELIGA 11";
  $("adminSeason").textContent=season.label;
  $("metricStudents").textContent=rows.length;
  $("metricXp").textContent=total;
  $("metricRaffle").textContent=rows.filter(r=>r.xp>=raffle).length;

  $("className").value=state.config.className||"";
  $("seasonLabel").value=season.label;
  $("seasonLabel").readOnly=true;
  $("activeMonth").value=season.start.slice(0,7);
  $("activeMonth").readOnly=true;
  $("goalXp").value=getSeasonGoal(state);
  $("raffleXp").value=raffle;

  $("seasonControlName").textContent=season.label;
  $("seasonControlDates").textContent=`${fmtFullDate(season.start)} – ${fmtFullDate(season.end)}`;
  $("seasonNumberBadge").textContent=`Season ${season.number}`;
  $("closeSeasonBtn").disabled=Boolean(state.config?.schoolYearFinished&&!next);
  $("closeSeasonBtn").textContent=next?`Season ${season.number} abschließen → Season ${next.number}`:"Finale Season abschließen";
  renderSeasonArchive();

  const options=rows.map(r=>`<option value="${esc(r.uid)}">${esc(r.nickname)} · ${r.xp} XP</option>`).join("");
  $("studentSelect").innerHTML=options;
  $("recoveryStudentSelect").innerHTML=options;
  $("generateRecoveryBtn").disabled=rows.length===0;
  renderPlausibility(rows,flags);

  $("studentsBody").innerHTML=rows.map(r=>`<tr><td>${r.rank}</td><td><b>${esc(r.nickname)}</b><br><button class="btn danger hide-student" style="margin-top:6px;padding:6px 8px;font-size:11px" data-uid="${esc(r.uid)}" data-name="${esc(r.nickname)}">Aus Rangliste entfernen</button></td><td>${r.xp}</td><td>${completedBooksCount(state,r.uid)}</td><td>${r.xp>=raffle?"✅":"–"}</td><td>${flags.has(r.uid)?'<span class="flag-badge">⚠️ prüfen</span>':'–'}</td></tr>`).join("");
  document.querySelectorAll(".hide-student").forEach(btn=>btn.addEventListener("click",()=>hideStudent(btn.dataset.uid,btn.dataset.name)));

  const activity=getMonthRecords(state).sort((a,b)=>b.date.localeCompare(a.date)||(b.updatedAt||0)-(a.updatedAt||0));
  $("activityBody").innerHTML=activity.slice(0,100).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(state.profiles?.[r.uid]?.nickname||"?")}</td><td>+${r.xp}</td><td><b>${esc(r.book)}</b><br><small>${esc(r.section)}</small>${r.finished===true?'<br><small>📚 Buch beendet</small>':''}</td><td><button class="btn danger delete-entry" data-uid="${esc(r.uid)}" data-date="${esc(r.date)}">Löschen</button></td></tr>`).join("")||'<tr><td colspan="5">Noch keine Einträge.</td></tr>';
  document.querySelectorAll(".delete-entry").forEach(btn=>btn.addEventListener("click",async()=>{if(confirm(`Eintrag vom ${btn.dataset.date} wirklich löschen?`))await service.adminDeleteDay(btn.dataset.uid,btn.dataset.date);}));
}

$("loginForm").addEventListener("submit",async(e)=>{e.preventDefault();msg($("loginMessage"),"");try{await service.adminSignIn($("email").value,$("password").value);$("loginCard").classList.add("hidden");$("adminView").classList.remove("hidden");unsubscribe=service.subscribeState((s)=>{state=s;render();});}catch(err){msg($("loginMessage"),err.message||"Anmeldung fehlgeschlagen.","error");}});

$("configForm").addEventListener("submit",async(e)=>{
  e.preventDefault();
  const season=getActiveSeason(state);
  const seasonGoals={...(state.config?.seasonGoals||{}),[season.id]:Number($("goalXp").value)};
  try{
    await service.adminSaveConfig({className:$("className").value.trim(),seasonLabel:season.label,activeMonth:season.start.slice(0,7),activeSeasonId:season.id,seasonGoals,raffleXp:Number($("raffleXp").value),maxDailyXp:2,minutesPerXp:20});
    msg($("configMessage"),"Einstellungen für die aktuelle Season gespeichert.");
  }catch(err){msg($("configMessage"),err.message||"Speichern fehlgeschlagen.","error");}
});

$("correctionForm").addEventListener("submit",async(e)=>{e.preventDefault();try{await service.adminUpsertDay($("studentSelect").value,$("entryDate").value,{xp:Number($("entryXp").value),book:$("entryBook").value.trim(),section:$("entrySection").value.trim(),finished:$("entryFinished").checked});msg($("correctionMessage"),"Eintrag gespeichert.");$("entryBook").value="";$("entrySection").value="";$("entryFinished").checked=false;}catch(err){msg($("correctionMessage"),err.message||"Korrektur fehlgeschlagen.","error");}});

$("generateRecoveryBtn").addEventListener("click",async()=>{
  const uid=$("recoveryStudentSelect").value;
  const label=$("recoveryStudentSelect").selectedOptions[0]?.textContent||"diese Person";
  if(!uid)return;
  if(!confirm(`Neuen Wiederherstellungscode für ${label} erzeugen? Der bisherige Code wird ungültig.`))return;
  msg($("recoveryAdminMessage"),"");$("recoveryAdminResult").classList.add("hidden");
  try{const code=await service.adminCreateRecoveryCode(uid);$("adminRecoveryCode").textContent=code;$("recoveryAdminResult").classList.remove("hidden");}catch(err){msg($("recoveryAdminMessage"),err.message||"Code konnte nicht erzeugt werden.","error");}
});

$("copyAdminRecoveryBtn").addEventListener("click",async()=>{const code=$("adminRecoveryCode").textContent.trim();try{await navigator.clipboard.writeText(code);msg($("recoveryAdminMessage"),"Code kopiert.");}catch{msg($("recoveryAdminMessage"),"Bitte den Code markieren und manuell kopieren.","error");}});

$("csvBtn").addEventListener("click",()=>{if(!state)return;const season=getActiveSeason(state);const rows=rankLeaderboard(computeLeaderboard(state));const flags=plausibilityFlags(state);const lines=[["Season","Platz","Nickname","XP","Buecher beendet","Plausibilitaets-Hinweis"],...rows.map(r=>[season.label,r.rank,r.nickname,r.xp,completedBooksCount(state,r.uid),(flags.get(r.uid)||[]).join(" | ")])].map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\n");const blob=new Blob(["\ufeff"+lines],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`leseliga_${season.id}.csv`;a.click();URL.revokeObjectURL(a.href);});

$("resetDemoBtn").addEventListener("click",async()=>{if(confirm("Demo-Rangliste auf Ausgangsdaten zurücksetzen?"))await service.resetDemoData();});
$("logoutBtn").addEventListener("click",async()=>{unsubscribe?.();await service.adminSignOut();location.reload();});
