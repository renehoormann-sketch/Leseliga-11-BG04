import { createDataService } from "./data-service.js";
import { computeLeaderboard, rankLeaderboard, totalClassXp } from "./stats.js";
const $ = (id) => document.getElementById(id);
const esc = (v="") => String(v).replace(/[&<>'"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function renderPodium(rows) {
  const medals = ["🥈","🥇","🥉"], order=[rows[1],rows[0],rows[2]];
  $("podium").innerHTML = order.map((r,i)=>r?`<div class="podium-card ${i===1?"first":""}"><div class="podium-place">${medals[i]}</div><b>${esc(r.nickname)}</b><span>${r.xp} XP</span></div>`:"<div></div>").join("");
}

const service = await createDataService();
await service.initStudentSession();
$("modeBadge").textContent = service.mode === "demo" ? "● DEMO" : "● LIVE";
$("modeBadge").className = `badge ${service.mode === "demo" ? "demo" : "live"}`;
service.subscribeState((state)=>{
  const rows=rankLeaderboard(computeLeaderboard(state)), total=totalClassXp(state), goal=Math.max(1,Number(state.config.goalXp||180));
  const percent=Math.min(100,Math.round(total/goal*100));
  $("title").textContent=state.config.className||"LESELIGA 11";
  $("season").textContent=state.config.seasonLabel||state.config.activeMonth;
  $("totalXp").textContent=total; $("goalXp").textContent=goal; $("goalBar").style.width=`${percent}%`;
  $("goalText").textContent= total>=goal ? "🎉 Klassenziel erreicht – jetzt geht es um Bonus-XP!" : `Noch ${goal-total} XP bis zum Klassenziel.`;
  $("count").textContent=`${rows.length} Teilnehmer · Top 10`;
  $("updated").textContent=`Live · ${new Intl.DateTimeFormat("de-DE",{hour:"2-digit",minute:"2-digit"}).format(new Date())}`;
  renderPodium(rows);
  $("leaderboard").innerHTML=rows.slice(0,10).map(r=>`<div class="rank-row"><div class="rank">${r.rank}</div><div class="player"><b>${esc(r.nickname)}</b></div><div class="score">${r.xp} XP</div></div>`).join("") || '<div class="empty">Noch keine Teilnehmer.</div>';
});
