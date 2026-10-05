/* Central Bible Worship Planner — stand-alone (PWA) platform layer.
   Gives the app the same small interface it uses inside claude.ai (window.claude.use("db"|"user"|"downloads")),
   backed by Firebase (Firestore + anonymous sign-in) and team passwords. */
(function(){
  "use strict";
  const cfg=window.CBWP_FIREBASE_CONFIG;
  const LS="cbwp-unlocks-v1",NAME="cbwp-myname";
  const ls={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
  let app=null,auth=null,fs=null,uid=null,ready=null;
  const unlocked=new Set(ls.get(LS,[]));
  const names={};
  function init(){if(ready)return ready;
    ready=(async()=>{
      if(!cfg||!cfg.apiKey||!window.firebase)throw new Error("firebase-config");
      app=firebase.initializeApp(cfg);auth=firebase.auth();fs=firebase.firestore();
      try{await fs.enablePersistence({synchronizeTabs:true});}catch(e){}
      await new Promise((res,rej)=>{const off=auth.onAuthStateChanged(u=>{if(u){uid=u.uid;off();res();}});auth.signInAnonymously().catch(rej);});
      /* re-check remembered unlocks (they live in Firestore, so a cleared device just asks again) */
      for(const k of [...unlocked]){try{const d=await fs.doc(`unlocks/${uid}_${k}`).get();if(!d.exists)unlocked.delete(k);}catch(e){}}
      ls.set(LS,[...unlocked]);
    })();return ready;}
  async function unlock(team,code,name){await init();code=String(code||"").trim();if(!code)throw new Error("empty");
    const base={uid,code,name:name||"",at:Date.now()};
    try{
      if(!unlocked.has(team))await fs.doc(`unlocks/${uid}_${team}`).set({...base,team});
      if(!unlocked.has("any"))await fs.doc(`unlocks/${uid}_any`).set({...base,team:"any"}).catch(()=>{});
    }catch(e){const d=await fs.doc(`unlocks/${uid}_${team}`).get().catch(()=>null);if(!(d&&d.exists))throw new Error("wrong");}
    unlocked.add(team);unlocked.add("any");ls.set(LS,[...unlocked]);
    if(name){ls.set(NAME,name);try{await fs.doc(`users/${uid}`).set({name,at:Date.now()},{merge:true});}catch(e){}}
    return true;}
  const db={collection:c=>fsProxy().collection(c),doc:p=>fsProxy().doc(p)};
  function fsProxy(){return fs;}
  const user={
    id:async()=>{await init();return uid;},
    me:async()=>({id:uid,name:ls.get(NAME,"")}),
    isOwner:async()=>unlocked.has("admin"),
    canEdit:async()=>unlocked.has("admin"),
    can:async()=>null,
    profiles:async ids=>{await init();const out={};
      await Promise.all(ids.map(async id=>{if(names[id]==null){try{const d=await fs.doc(`users/${id}`).get();names[id]=d.exists?(d.data().name||""):"";}catch(e){names[id]="";}}out[id]={name:names[id]};}));return out;}};
  const downloads={save:async({filename,data})=>{const blob=data instanceof Blob?data:new Blob([data],{type:/\.csv$/i.test(filename)?"text/csv;charset=utf-8":"application/octet-stream"});
    const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);return true;}};
  window.claude={use:async n=>{try{await init();}catch(e){console.error(e);return null;}return n==="db"?db:n==="user"?user:n==="downloads"?downloads:null;}};
  /* hooks the app calls when it runs outside claude.ai */
  window.CBWP={
    standalone:true,
    canWrite:team=>unlocked.has(team)||unlocked.has("admin"),
    isAdmin:()=>unlocked.has("admin"),
    myName:()=>ls.get(NAME,""),
    unlock,
    lock(team){unlocked.delete(team);ls.set(LS,[...unlocked]);}
  };
  /* service worker (offline + home-screen install) */
  if("serviceWorker" in navigator&&location.protocol==="https:")window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
})();
