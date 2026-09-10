import { createDataService, dateUtils } from "./data-service.js";
import { computeLeaderboard, rankLeaderboard, totalClassXp, getMonthRecords } from "./stats.js";
const $=(id)=>document.getElementById(id);
const esc=(v="")=>String(v).replace(/[&<>'"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
let service,state,unsubscribe;
function msg(el,text,type="ok"){el.innerHTML=text?`<div class="notice ${type}">${esc(text)}</div>`:"";}

service=await createDataService();
$("modeBadge").textContent=service.mode==="demo"?"● DEMO":"● LIVE";
$("modeBadge").className=`badge ${service.mode==="demo"?"demo":"live"}`;
if(service.mode==="demo"){$("demoCredentials").classList.remove("hidden");$("resetDemoBtn").classList.remove("hidden");$("recoveryAdminCard").classList.add("hidden");$("email").value="lehrer@demo.de";$("password").value="leseliga";}
$("entryDate").value=dateUtils.yyyyMmDd();

function dayNumber(date){
  const [y,m,d]=String(date).split("-").map(Number);
  return Math.floor(Date.UTC(y,m-1,d)/86400000);
}

function plausibilityFlags(currentState){
  const result=new Map();
  const records=getMonthRecords(currentState,currentState.config.activeMonth);
  const byUid={};
  records.forEach(r=>{(byUid[r.uid]||=[]).push(r);});
  const today=dateUtils.yyyyMmDd();

  Object.entries(byUid).forEach(([uid,userRows])=>{
    const reasons=[];
    const sorted=[...userRows].sort((a,b)=>a.date.localeCompare(b.date));
    const future=sorted.filter(r=>r.date>today);
    if(future.length) reasons.push(`${future.length} Eintrag${future.length===1?"":"e"} mit zukünftigem Datum`);

    const twoXp=sorted.filter(r=>Number(r.xp)===2);
    if(sorted.length>=10 && twoXp.length/sorted.length>=0.9){
      reasons.push(`${twoXp.length} von ${sorted.length} Lesetagen mit jeweils 2 XP`);
    }

    let maxRun=0,run=0,lastDay=null;
    sorted.filter(r=>Number(r.xp)===2).forEach(r=>{
      const n=dayNumber(r.date);
      run=(lastDay!==null && n===lastDay+1)?run+1:1;
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
  $("plausibilitySummary").textContent=flagged.length
    ? `${flagged.length} von ${rows.length} Teilnehmer${rows.length===1?"":"n"} mit Hinweis`
    : "Keine auffälligen Muster in der aktiven Runde";

  if(!flagged.length){
    $("plausibilityList").innerHTML='<div class="empty"><span class="flag-ok">✓</span> Aktuell keine Plausibilitäts-Hinweise.</div>';
    return;
  }

  $("plausibilityList").innerHTML=flagged.map(r=>{
    const reasons=flags.get(r.uid)||[];
    return `<div class="flag-item"><b>⚠️ ${esc(r.nickname)} · ${r.xp} XP</b><small>${reasons.map(esc).join(" · ")}<br>Empfehlung: bei Gelegenheit kurzer Buchcheck – nicht automatisch werten oder sanktionieren.</small></div>`;
  }).join("");
}

function render(){
  if(!state)return;
  const rows=rankLeaderboard(computeLeaderboard(state)), total=totalClassXp(state), raffle=Number(state.config.raffleXp||8);
  const flags=plausibilityFlags(state);
  $("adminTitle").textContent=state.config.className; $("adminSeason").textContent=state.config.seasonLabel;
  $("metricStudents").textContent=rows.length; $("metricXp").textContent=total; $("metricRaffle").textContent=rows.filter(r=>r.xp>=raffle).length;
  $("className").value=state.config.className||""; $("seasonLabel").value=state.config.seasonLabel||""; $("activeMonth").value=state.config.activeMonth||""; $("goalXp").value=state.config.goalXp||180; $("raffleXp").value=raffle;
  const options=rows.map(r=>`<option value="${esc(r.uid)}">${esc(r.nickname)} · ${r.xp} XP</option>`).join("");
  $("studentSelect").innerHTML=options;
  $("recoveryStudentSelect").innerHTML=options;
  $("generateRecoveryBtn").disabled=rows.length===0;
  renderPlausibility(rows,flags);
  $("studentsBody").innerHTML=rows.map(r=>`<tr><td>${r.rank}</td><td><b>${esc(r.nickname)}</b></td><td>${r.xp}</td><td>${r.xp>=raffle?"✅":"–"}</td><td>${flags.has(r.uid)?'<span class="flag-badge">⚠️ prüfen</span>':'–'}</td></tr>`).join("");
  const activity=getMonthRecords(state,state.config.activeMonth).sort((a,b)=>b.date.localeCompare(a.date)||(b.updatedAt||0)-(a.updatedAt||0));
  $("activityBody").innerHTML=activity.slice(0,80).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(state.profiles?.[r.uid]?.nickname||"?")}</td><td>+${r.xp}</td><td><b>${esc(r.book)}</b><br><small>${esc(r.section)}</small></td><td><button class="btn danger delete-entry" data-uid="${esc(r.uid)}" data-date="${esc(r.date)}">Löschen</button></td></tr>`).join("")||'<tr><td colspan="5">Noch keine Einträge.</td></tr>';
  document.querySelectorAll(".delete-entry").forEach(btn=>btn.addEventListener("click",async()=>{if(confirm(`Eintrag vom ${btn.dataset.date} wirklich löschen?`))await service.adminDeleteDay(btn.dataset.uid,btn.dataset.date);}));
}

$("loginForm").addEventListener("submit",async(e)=>{e.preventDefault();msg($("loginMessage"),"");try{await service.adminSignIn($("email").value,$("password").value);$("loginCard").classList.add("hidden");$("adminView").classList.remove("hidden");unsubscribe=service.subscribeState((s)=>{state=s;render();});}catch(err){msg($("loginMessage"),err.message||"Anmeldung fehlgeschlagen.","error");}});

$("configForm").addEventListener("submit",async(e)=>{e.preventDefault();try{await service.adminSaveConfig({className:$("className").value.trim(),seasonLabel:$("seasonLabel").value.trim(),activeMonth:$("activeMonth").value,goalXp:Number($("goalXp").value),raffleXp:Number($("raffleXp").value),maxDailyXp:2,minutesPerXp:20});msg($("configMessage"),"Einstellungen gespeichert.");}catch(err){msg($("configMessage"),err.message||"Speichern fehlgeschlagen.","error");}});

$("correctionForm").addEventListener("submit",async(e)=>{e.preventDefault();try{await service.adminUpsertDay($("studentSelect").value,$("entryDate").value,{xp:Number($("entryXp").value),book:$("entryBook").value.trim(),section:$("entrySection").value.trim()});msg($("correctionMessage"),"Eintrag gespeichert.");$("entryBook").value="";$("entrySection").value="";}catch(err){msg($("correctionMessage"),err.message||"Korrektur fehlgeschlagen.","error");}});

$("generateRecoveryBtn").addEventListener("click",async()=>{
  const uid=$("recoveryStudentSelect").value;
  const label=$("recoveryStudentSelect").selectedOptions[0]?.textContent||"diese Person";
  if(!uid)return;
  if(!confirm(`Neuen Wiederherstellungscode für ${label} erzeugen? Der bisherige Code wird ungültig.`))return;
  msg($("recoveryAdminMessage"),"");
  $("recoveryAdminResult").classList.add("hidden");
  try{
    const code=await service.adminCreateRecoveryCode(uid);
    $("adminRecoveryCode").textContent=code;
    $("recoveryAdminResult").classList.remove("hidden");
  }catch(err){msg($("recoveryAdminMessage"),err.message||"Code konnte nicht erzeugt werden.","error");}
});

$("copyAdminRecoveryBtn").addEventListener("click",async()=>{
  const code=$("adminRecoveryCode").textContent.trim();
  try{await navigator.clipboard.writeText(code);msg($("recoveryAdminMessage"),"Code kopiert.");}
  catch{msg($("recoveryAdminMessage"),"Bitte den Code markieren und manuell kopieren.","error");}
});

$("csvBtn").addEventListener("click",()=>{if(!state)return;const rows=rankLeaderboard(computeLeaderboard(state));const flags=plausibilityFlags(state);const lines=[["Platz","Nickname","XP","Plausibilitaets-Hinweis"],...rows.map(r=>[r.rank,r.nickname,r.xp,(flags.get(r.uid)||[]).join(" | ")])].map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\n");const blob=new Blob(["\ufeff"+lines],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`leseliga_${state.config.activeMonth}.csv`;a.click();URL.revokeObjectURL(a.href);});

$("resetDemoBtn").addEventListener("click",async()=>{if(confirm("Demo-Rangliste auf Ausgangsdaten zurücksetzen?"))await service.resetDemoData();});
$("logoutBtn").addEventListener("click",async()=>{unsubscribe?.();await service.adminSignOut();location.reload();});
