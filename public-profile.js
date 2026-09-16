import { SEASON_PLAN } from "./stats.js?v=20260916-privacy2";

function dayNumber(date){
  const [y,m,d]=String(date).split("-").map(Number);
  return Math.floor(Date.UTC(y,m-1,d)/86400000);
}

function monday(date){
  const d=new Date(`${date}T12:00:00`);
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function normalizeBook(value=""){
  return String(value).trim().toLocaleLowerCase("de-DE").replace(/\s+/g," ");
}

function longestStreak(records){
  const dates=[...new Set(records.filter(r=>Number(r.xp)>0).map(r=>r.date))].sort();
  let best=0,run=0,last=null;
  dates.forEach(date=>{
    const n=dayNumber(date);
    run=last!==null&&n===last+1?run+1:1;
    best=Math.max(best,run);
    last=n;
  });
  return best;
}

export function buildPublicStats(days={}){
  const entries=Object.entries(days||{}).map(([date,entry])=>({date,...(entry||{})}));
  const result={};
  SEASON_PLAN.forEach(season=>{
    const records=entries.filter(r=>r.date>=season.start&&r.date<=season.end);
    const weeks={};
    records.forEach(r=>{
      const key=monday(r.date);
      weeks[key]=(weeks[key]||0)+Number(r.xp||0);
    });
    const weekValues=Object.values(weeks).map(Number);
    result[season.id]={
      xp:records.reduce((sum,r)=>sum+Number(r.xp||0),0),
      books:records.filter(r=>r.finished===true).length,
      readingDays:new Set(records.filter(r=>Number(r.xp)>0).map(r=>r.date)).size,
      longestStreak:longestStreak(records),
      bestWeekXp:weekValues.length?Math.max(...weekValues):0,
      weeks
    };
  });
  return result;
}

export function buildPublicRatings(days={}){
  const latest=new Map();
  Object.entries(days||{})
    .map(([date,entry])=>({date,...(entry||{})}))
    .filter(r=>r.date>="2026-09-01"&&r.date<="2027-06-27"&&r.finished===true&&Number(r.rating)>=1&&Number(r.rating)<=5&&normalizeBook(r.book))
    .sort((a,b)=>a.date.localeCompare(b.date))
    .forEach(r=>latest.set(normalizeBook(r.book),{book:String(r.book).trim(),rating:Number(r.rating)}));
  const out={};
  [...latest.values()].slice(-30).forEach((item,index)=>{out[`r${index}`]=item;});
  return out;
}

export function getPublicSeasonStats(profile,seasonId){
  const value=profile?.publicStats?.[seasonId];
  return value&&typeof value==="object"?value:null;
}
