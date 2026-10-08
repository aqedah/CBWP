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
  const PROJ=["festival"]; /* 프로젝트: 어느 팀 비밀번호로든 들어가요 */
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
  /* 비밀번호 종류: 팀(인도자·리더용, 콘티 쓰기) · 팀_member(팀원용, 보기와 참여 응답) · 팀_lead · admin
     any = 어느 팀이든 쓰기 비밀번호로 열린 기기 (곡·악보 고치기), anyread = 팀원 비밀번호로 열린 기기 (곡·악보 보기) */
  const TEAM_IDS=["worship","shema","gideon","kairos"];
  async function mk(key,data){if(unlocked.has(key))return true;
    try{await fs.doc(`unlocks/${uid}_${key}`).set({...data,team:key});unlocked.add(key);return true;}
    catch(e){const d=await fs.doc(`unlocks/${uid}_${key}`).get().catch(()=>null);if(d&&d.exists){unlocked.add(key);return true;}return false;}}
  async function unlock(team,code,name){await init();code=String(code||"").trim();if(!code)throw new Error("empty");
    const base={uid,code,name:name||"",at:Date.now()};let ok=false;
    if(PROJ.includes(team)){for(const t of TEAM_IDS){if(await mk("any",{...base,src:t})){ok=true;break;}}
      if(!ok)for(const t of TEAM_IDS){if(await mk("anyread",{...base,src:t+"_member"})){ok=true;break;}}}
    else if(/_member$/.test(team)){ok=await mk(team,base);if(ok)await mk("anyread",{...base,src:team});}
    else{ok=await mk(team,base);if(ok&&team!=="admin")await mk("any",{...base,src:team});}
    ls.set(LS,[...unlocked]);if(!ok)throw new Error("wrong");
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
    canWrite:team=>unlocked.has(team)||unlocked.has("admin")||(PROJ.includes(team)&&unlocked.has("any")),
    canRead:team=>unlocked.has(team)||unlocked.has("admin")||unlocked.has(team+"_member")||(PROJ.includes(team)&&(unlocked.has("any")||unlocked.has("anyread"))),
    isAdmin:()=>unlocked.has("admin"),
    myName:()=>ls.get(NAME,""),
    async setName(name){name=String(name||"").trim();if(!name)return;ls.set(NAME,name);try{await init();await fs.doc(`users/${uid}`).set({name,at:Date.now()},{merge:true});}catch(e){}},
    unlock,
    lock(team){unlocked.delete(team);ls.set(LS,[...unlocked]);},
    /* log out: the unlock marks live on this device's sign-in, so start a fresh sign-in and re-open only what should stay open */
    async logoutKeys(drop,all){await init();const name=ls.get(NAME,"");const keep=[];
      if(!all)for(const k of [...unlocked]){if(k==="any"||k==="anyread"||drop.includes(k))continue;try{const d=await fs.doc(`unlocks/${uid}_${k}`).get();if(d.exists&&d.data().code)keep.push([k,d.data().code]);}catch(e){}}
      await auth.signOut();uid=null;unlocked.clear();ls.set(LS,[]);if(all){try{localStorage.removeItem(NAME);}catch(e){}}
      await new Promise((res,rej)=>{const off=auth.onAuthStateChanged(u=>{if(u){uid=u.uid;off();res();}});auth.signInAnonymously().catch(rej);});
      for(const [k,code] of keep){try{await unlock(k,code,name);}catch(e){}}
      return keep.map(x=>x[0]);},
    logoutAdmin(){return this.logoutKeys(["admin"]);},
    /* 다른 기기 연결: 이 기기에서 연 비밀번호들 [[종류, 비밀번호], …] (any · anyread는 저절로 따라와요) */
    async exportKeys(){await init();const out=[];for(const k of [...unlocked]){if(k==="any"||k==="anyread")continue;try{const d=await fs.doc(`unlocks/${uid}_${k}`).get();if(d.exists&&d.data().code)out.push([k,d.data().code]);}catch(e){}}return out;}
  };
  /* service worker (offline + home-screen install) */
  if("serviceWorker" in navigator&&location.protocol==="https:")window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
})();
