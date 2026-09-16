import { FIREBASE_CONFIG } from "./config.js";
import { buildPublicStats, buildPublicRatings } from "./public-profile.js?v=20260916-privacy1";

const SDK_VERSION="12.18.0";
const [{initializeApp,getApps,getApp},authMod,dbMod]=await Promise.all([
  import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
  import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
  import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-database.js`)
]);
const app=getApps().length?getApp():initializeApp(FIREBASE_CONFIG);
const auth=authMod.getAuth(app),db=dbMod.getDatabase(app);
let firstSyncDone=false;

function status(text,type="ok"){
  let box=document.getElementById("privacySyncStatus");
  if(!box){
    box=document.createElement("div");
    box.id="privacySyncStatus";
    box.className="notice";
    box.style.marginTop="14px";
    document.querySelector("#adminView .hero")?.appendChild(box);
  }
  box.className=`notice ${type}`;
  box.textContent=text;
}

async function syncOne(uid,days=null){
  if(!uid||!auth.currentUser)return;
  const ownDays=days||(await dbMod.get(dbMod.ref(db,`days/${uid}`))).val()||{};
  await dbMod.update(dbMod.ref(db,`profiles/${uid}`),{
    publicStats:buildPublicStats(ownDays),
    publicRatings:buildPublicRatings(ownDays)
  });
}

async function syncAll(){
  if(!auth.currentUser)return;
  status("🔒 Öffentliche Wertungen werden für den Datenschutz synchronisiert …");
  try{
    const [profilesSnap,daysSnap]=await Promise.all([
      dbMod.get(dbMod.ref(db,"profiles")),
      dbMod.get(dbMod.ref(db,"days"))
    ]);
    const profiles=profilesSnap.val()||{},days=daysSnap.val()||{},updates={};
    Object.keys(profiles).forEach(uid=>{
      updates[`profiles/${uid}/publicStats`]=buildPublicStats(days[uid]||{});
      updates[`profiles/${uid}/publicRatings`]=buildPublicRatings(days[uid]||{});
    });
    if(Object.keys(updates).length)await dbMod.update(dbMod.ref(db),updates);
    status("🔒 Datenschutz-Wertungen synchronisiert. Rangliste und Klassenstatistik funktionieren ohne Einsicht in fremde Detail-Einträge.");
  }catch(err){
    status(`Synchronisierung nicht möglich: ${err.message||err}`,"error");
  }
}

const adminView=document.getElementById("adminView");
if(adminView){
  const observer=new MutationObserver(()=>{
    if(!adminView.classList.contains("hidden")&&!firstSyncDone){firstSyncDone=true;setTimeout(syncAll,250);}
  });
  observer.observe(adminView,{attributes:true,attributeFilter:["class"]});
}

document.getElementById("correctionForm")?.addEventListener("submit",()=>{
  const uid=document.getElementById("studentSelect")?.value;
  if(uid)setTimeout(()=>syncOne(uid).catch(()=>{}),1000);
});

document.getElementById("activityBody")?.addEventListener("click",event=>{
  const btn=event.target.closest?.(".delete-entry");
  const uid=btn?.dataset?.uid;
  if(uid)setTimeout(()=>syncOne(uid).catch(()=>{}),1200);
});
