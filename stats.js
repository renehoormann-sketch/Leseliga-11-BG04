export const SEASON_PLAN = [
  { id: "season1", number: 1, label: "Season 1 · September–November 2026", start: "2026-09-01", end: "2026-11-30", goalXp: 540 },
  { id: "season2", number: 2, label: "Season 2 · Dezember 2026–Februar 2027", start: "2026-12-01", end: "2027-02-28", goalXp: 540 },
  { id: "season3", number: 3, label: "Season 3 · März–Mai 2027", start: "2027-03-01", end: "2027-05-31", goalXp: 540 },
  { id: "season4", number: 4, label: "Season 4 · Juni-Finale 2027", start: "2027-06-01", end: "2027-06-27", goalXp: 180 }
];

function isHidden(state, uid) { return state.config?.hiddenStudents?.[uid] === true; }
function seasonById(state, seasonId = null) { return seasonId ? (SEASON_PLAN.find(item=>item.id===seasonId)||getActiveSeason(state)) : getActiveSeason(state); }
function hasPrivateDays(state, uid) { return Object.prototype.hasOwnProperty.call(state.days||{},uid); }
function hasPublicDays(state, uid) { return Object.prototype.hasOwnProperty.call(state.publicDays||{},uid); }
function dayNo(date){const [y,m,d]=String(date).split("-").map(Number);return Math.floor(Date.UTC(y,m-1,d)/86400000);}
function monday(date){const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()-((d.getDay()+6)%7));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function privateSeasonRecords(state,uid,season){return Object.entries(state.days?.[uid]||{}).filter(([date])=>date>=season.start&&date<=season.end).map(([date,entry])=>({uid,date,...entry}));}
function publicDayRecords(state,uid,season){return Object.entries(state.publicDays?.[uid]||{}).filter(([date])=>date>=season.start&&date<=season.end).map(([date,entry])=>({uid,date,...entry}));}
function aggregatePublicDays(records){const weeks={},dates=[...new Set(records.filter(r=>Number(r.xp)>0).map(r=>r.date))].sort();records.forEach(r=>{const w=monday(r.date);weeks[w]=(weeks[w]||0)+Number(r.xp||0);});let bestStreak=0,run=0,last=null;dates.forEach(date=>{const n=dayNo(date);run=last!==null&&n===last+1?run+1:1;bestStreak=Math.max(bestStreak,run);last=n;});const values=Object.values(weeks).map(Number);return {xp:records.reduce((sum,r)=>sum+Number(r.xp||0),0),books:records.filter(r=>r.finished===true).length,readingDays:dates.length,longestStreak:bestStreak,bestWeekXp:values.length?Math.max(...values):0,weeks};}
function storedPublicStats(state,uid,seasonId){const value=state.profiles?.[uid]?.publicStats?.[seasonId];return value&&typeof value==="object"?value:null;}
function publicSeasonStats(state,uid,season){if(hasPublicDays(state,uid))return aggregatePublicDays(publicDayRecords(state,uid,season));return storedPublicStats(state,uid,season.id);}

export function getActiveSeason(state){const id=state.config?.activeSeasonId||"season1";return SEASON_PLAN.find(season=>season.id===id)||SEASON_PLAN[0];}
export function getNextSeason(state){const active=getActiveSeason(state),index=SEASON_PLAN.findIndex(season=>season.id===active.id);return index>=0?SEASON_PLAN[index+1]||null:null;}
export function getSeasonRecords(state,seasonId=null){const season=seasonById(state,seasonId),records=[];Object.entries(state.days||{}).forEach(([uid,dates])=>{if(isHidden(state,uid))return;Object.entries(dates||{}).forEach(([date,entry])=>{if(date>=season.start&&date<=season.end)records.push({uid,date,...entry});});});return records;}
export function getMonthRecords(state){return getSeasonRecords(state);}
export function computeLeaderboardForSeason(state,seasonId=null){const season=seasonById(state,seasonId);return Object.entries(state.profiles||{}).filter(([uid])=>!isHidden(state,uid)).map(([uid,profile])=>{let xp=0;if(hasPrivateDays(state,uid))xp=privateSeasonRecords(state,uid,season).reduce((sum,r)=>sum+Number(r.xp||0),0);else xp=Number(publicSeasonStats(state,uid,season)?.xp||0);return {uid,nickname:profile.nickname||"Ohne Namen",xp};}).sort((a,b)=>b.xp-a.xp||a.nickname.localeCompare(b.nickname,"de"));}
export function computeLeaderboard(state){return computeLeaderboardForSeason(state);}
export function rankLeaderboard(rows){let lastXp=null,lastRank=0;return rows.map((row,index)=>{if(row.xp!==lastXp)lastRank=index+1;lastXp=row.xp;return {...row,rank:lastRank};});}
export function totalClassXp(state){return computeLeaderboard(state).reduce((sum,row)=>sum+row.xp,0);}
export function userRecordsForSeason(state,uid,seasonId=null){const season=seasonById(state,seasonId);return privateSeasonRecords(state,uid,season).map(({uid:_uid,...record})=>record).sort((a,b)=>b.date.localeCompare(a.date));}
export function userRecords(state,uid){return userRecordsForSeason(state,uid);}
export function userTotalXp(state,uid){const season=getActiveSeason(state);if(hasPrivateDays(state,uid))return userRecords(state,uid).reduce((sum,r)=>sum+Number(r.xp||0),0);return Number(publicSeasonStats(state,uid,season)?.xp||0);}
export function completedBooksCountForSeason(state,uid,seasonId=null){const season=seasonById(state,seasonId);if(hasPrivateDays(state,uid))return userRecordsForSeason(state,uid,season.id).filter(r=>r.finished===true).length;return Number(publicSeasonStats(state,uid,season)?.books||0);}
export function completedBooksCount(state,uid){return completedBooksCountForSeason(state,uid);}
export function currentStreak(state,uid){const set=new Set(userRecords(state,uid).filter(r=>Number(r.xp)>0).map(r=>r.date));if(!set.size)return 0;let cursor=new Date();const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;if(!set.has(fmt(cursor))){cursor.setDate(cursor.getDate()-1);if(!set.has(fmt(cursor)))return 0;}let count=0;while(set.has(fmt(cursor))){count+=1;cursor.setDate(cursor.getDate()-1);}return count;}
export function getPublicSeasonStats(state,uid,seasonId=null){const season=seasonById(state,seasonId);return publicSeasonStats(state,uid,season)||{xp:0,books:0,readingDays:0,longestStreak:0,bestWeekXp:0,weeks:{}};}
export function activeSeasonMatchesToday(state){const season=getActiveSeason(state),d=new Date(),today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;return today>=season.start&&today<=season.end;}
export function getSeasonGoal(state){const season=getActiveSeason(state),custom=Number(state.config?.seasonGoals?.[season.id]);return Number.isFinite(custom)&&custom>0?custom:season.goalXp;}
export function activeMonthMatchesToday(activeMonth){const season=SEASON_PLAN.find(item=>item.start.startsWith(activeMonth));if(!season)return false;const d=new Date(),today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;return today>=season.start&&today<=season.end;}
