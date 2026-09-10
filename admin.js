import { createDataService, dateUtils } from "./data-service.js";
import { computeLeaderboard, rankLeaderboard, totalClassXp, getMonthRecords } from "./stats.js";
const $=(id)=>document.getElementById(id);
const esc=(v="")=>String(v).replace(/[&<>'"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
let service,state,unsubscribe;
function msg(el,text,type="ok"){el.innerHTML=text?`<div class="notice ${type}">${esc(text)}</div>`:"";}

service=await createDataService();
$("modeBadge").textContent=service.mode==="demo"?"● DEMO":"● LIVE";
$("modeBadge").className=`badge ${service.mode==="demo"?"demo":"live"}`;
if(service.mode==="demo"){$("demoCredentials").classList.remove("hidden");$("resetDemoBtn").classList.remove("hidden");$("email").value="lehrer@demo.de";$("password").value="leseliga";}
$("entryDate").value=dateUtils.yyyyMmDd();

function render(){
  if(!state)return;
  const rows=rankLeaderboard(computeLeaderboard(state)), total=totalClassXp(state), raffle=Number(state.config.raffleXp||8);
  $("adminTitle").textContent=state.config.className; $("adminSeason").textContent=state.config.seasonLabel;
  $("metricStudents").textContent=rows.length; $("metricXp").textContent=total; $("metricRaffle").textContent=rows.filter(r=>r.xp>=raffle).length;
  $("className").value=state.config.className||""; $("seasonLabel").value=state.config.seasonLabel||""; $("activeMonth").value=state.config.activeMonth||""; $("goalXp").value=state.config.goalXp||180; $("raffleXp").value=raffle;
  $("studentSelect").innerHTML=rows.map(r=>`<option value="${esc(r.uid)}">${esc(r.nickname)} · ${r.xp} XP</option>`).join("");
  $("studentsBody").innerHTML=rows.map(r=>`<tr><td>${r.rank}</td><td><b>${esc(r.nickname)}</b></td><td>${r.xp}</td><td>${r.xp>=raffle?"✅":"–"}</td></tr>`).join("");
  const activity=getMonthRecords(state,state.config.activeMonth).sort((a,b)=>b.date.localeCompare(a.date)||(b.updatedAt||0)-(a.updatedAt||0));
  $("activityBody").innerHTML=activity.slice(0,80).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(state.profiles?.[r.uid]?.nickname||"?")}</td><td>+${r.xp}</td><td><b>${esc(r.book)}</b><br><small>${esc(r.section)}</small></td><td><button class="btn danger delete-entry" data-uid="${esc(r.uid)}" data-date="${esc(r.date)}">Löschen</button></td></tr>`).join("")||'<tr><td colspan="5">Noch keine Einträge.</td></tr>';
  document.querySelectorAll(".delete-entry").forEach(btn=>btn.addEventListener("click",async()=>{if(confirm(`Eintrag vom ${btn.dataset.date} wirklich löschen?`))await service.adminDeleteDay(btn.dataset.uid,btn.dataset.date);}));
}

$("loginForm").addEventListener("submit",async(e)=>{e.preventDefault();msg($("loginMessage"),"");try{await service.adminSignIn($("email").value,$("password").value);$("loginCard").classList.add("hidden");$("adminView").classList.remove("hidden");unsubscribe=service.subscribeState((s)=>{state=s;render();});}catch(err){msg($("loginMessage"),err.message||"Anmeldung fehlgeschlagen.","error");}});

$("configForm").addEventListener("submit",async(e)=>{e.preventDefault();try{await service.adminSaveConfig({className:$("className").value.trim(),seasonLabel:$("seasonLabel").value.trim(),activeMonth:$("activeMonth").value,goalXp:Number($("goalXp").value),raffleXp:Number($("raffleXp").value),maxDailyXp:2,minutesPerXp:20});msg($("configMessage"),"Einstellungen gespeichert.");}catch(err){msg($("configMessage"),err.message||"Speichern fehlgeschlagen.","error");}});

$("correctionForm").addEventListener("submit",async(e)=>{e.preventDefault();try{await service.adminUpsertDay($("studentSelect").value,$("entryDate").value,{xp:Number($("entryXp").value),book:$("entryBook").value.trim(),section:$("entrySection").value.trim()});msg($("correctionMessage"),"Eintrag gespeichert.");$("entryBook").value="";$("entrySection").value="";}catch(err){msg($("correctionMessage"),err.message||"Korrektur fehlgeschlagen.","error");}});

$("csvBtn").addEventListener("click",()=>{if(!state)return;const rows=rankLeaderboard(computeLeaderboard(state));const lines=[["Platz","Nickname","XP"],...rows.map(r=>[r.rank,r.nickname,r.xp])].map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\n");const blob=new Blob(["\ufeff"+lines],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`leseliga_${state.config.activeMonth}.csv`;a.click();URL.revokeObjectURL(a.href);});

$("resetDemoBtn").addEventListener("click",async()=>{if(confirm("Demo-Rangliste auf Ausgangsdaten zurücksetzen?"))await service.resetDemoData();});
$("logoutBtn").addEventListener("click",async()=>{unsubscribe?.();await service.adminSignOut();location.reload();});
