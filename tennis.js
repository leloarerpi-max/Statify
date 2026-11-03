/* ================= TENNIS (ESPN) =================
   Écrans : Aujourd'hui · Tableau · Classement · Mes joueurs (+ Diagnostic ESPN).
   Tout ce qui dépend du format d'ESPN est regroupé dans les deux premières parties (adresses, lecture des données) :
   si ESPN change ou si un champ est différent de ce que j'ai supposé, c'est ICI qu'on ajuste (le reste de l'appli n'y touche pas).
   Le bouton « Diagnostic ESPN » de l'écran Aujourd'hui permet de copier le JSON brut ou de coller un JSON pour le tester. */
(function(){
'use strict';

/* ---------- 1. Adresses ESPN (non officielles) ---------- */
const SRC={
  board:(tour,ymd8)=>`https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/scoreboard${ymd8?`?dates=${ymd8}`:''}`,
  rank:tour=>[`https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/rankings`,`https://site.web.api.espn.com/apis/v2/sports/tennis/${tour}/rankings`]
};

/* ---------- 2. Lecture des données ESPN (fonctions pures, tolérantes) ---------- */
const num=v=>{ const n=parseFloat(v); return isNaN(n)?null:n; };
const first=(...a)=>{ for(const x of a) if(x!=null&&x!=='') return x; return null; };
// code pays à 3 lettres : tiré de l'adresse du drapeau (…/countries/500/fra.png), sinon du nom du pays
function ccOf(a){ a=a||{}; const f=a.flag||{}, h=f.href||f.url||'', m=/\/([a-z]{2,3})\.(?:png|svg|gif|jpe?g)/i.exec(h); if(m) return m[1].toUpperCase();
  const x=first(a.citizenshipCountry&&a.citizenshipCountry.abbreviation,a.country&&a.country.abbreviation,a.countryCode,f.alt); return x?String(x).slice(0,3).toUpperCase():''; }
function shortN(a,full){ const s=a&&(a.shortName||a.shortDisplayName); if(s&&/^[A-ZÀ-Ý]\.\s/.test(s)) return s; const p=String(full||'').trim().split(/\s+/); return p.length>1?p[0][0]+'. '+p.slice(1).join(' '):String(full||'?'); }
function roundIdx(t){ t=String(t||'').toLowerCase();
  if(/semi/.test(t)) return 6; if(/quarter/.test(t)) return 5; if(/qualif/.test(t)) return 0; if(/\bfinal\b/.test(t)) return 7;
  let m=/round of (\d+)/.exec(t); if(m) return Math.max(1,Math.round(Math.log2(128/+m[1]))+1);
  m=/(\d+)(?:st|nd|rd|th)\s*round/.exec(t); if(m) return +m[1]; return 3; }
function roundFr(t){ const i=roundIdx(t), s=String(t||'').toLowerCase(), m=/round of (\d+)/.exec(s);
  if(/qualif/.test(s)) return 'Qualifications'; if(i===7) return 'Finale'; if(i===6) return 'Demi-finales'; if(i===5) return 'Quarts de finale';
  if(m) return {16:'8es de finale',32:'16es de finale',64:'32es de finale',128:'64es de finale'}[+m[1]]||t; if(!t) return 'Tour'; return i===1?'1er tour':i+'e tour'; }
function pPlayer(c){ const a=c.athlete||c.player||{}, full=first(a.displayName,a.fullName,c.displayName,c.name,a.shortName)||'?';
  const ls=(c.linescores||c.sets||[]).map(l=>({g:num(first(l&&l.value,l&&l.score,l&&l.games,l)),tb:num(first(l&&l.tiebreak,l&&l.tieBreak,l&&l.tiebreakScore,l&&l.tb))})).filter(l=>l.g!=null);
  return {id:String(first(a.id,c.id,full)),n:full,s:shortN(a,full),cc:ccOf(a),rk:num(first(c.curatedRank&&c.curatedRank.current,c.rank,a.rank,c.ranking,c.currentRank,a.ranking)),
    sd:num(first(c.seed,c.tournamentSeed,a.seed)),w:!!c.winner,sv:!!(c.possession||c.serving||c.isServing||c.hasPossession),gm:first(c.gameScore,c.currentGame,c.points),sets:ls}; }
function pMatch(co,grp,ev){
  const gname=String(first(grp&&grp.displayName,grp&&grp.slug,grp&&grp.name,co.type&&co.type.text,co.type&&co.type.name)||'');
  if(/doubl/i.test(gname)) return null;
  const cs=(co.competitors||[]).filter(c=>c&&(c.athlete||c.player||c.displayName)); if(cs.length!==2) return null;
  const [a,b]=cs.slice().sort((x,y)=>(x.order||0)-(y.order||0)).map(pPlayer);
  const tt=(co.status&&co.status.type)||{}; let st=tt.state; if(!st) st=tt.completed?'post':/progress/i.test(tt.name||tt.description||'')?'in':'pre';
  const rd=String(first(co.round&&(co.round.displayName||co.round.name),co.notes&&co.notes[0]&&co.notes[0].text)||'');
  return {id:String(first(co.id,co.uid)||(ev.id+':'+a.id+'-'+b.id)),ev:ev.id,en:ev.sn,rd,rdf:roundFr(rd),ri:roundIdx(rd),st,t:String(first(co.date,co.startDate,co.startTime,ev.start)||''),
    ct:String(first(co.venue&&co.venue.court,co.venue&&co.venue.fullName,co.court)||''),dsc:String(first(tt.detail,tt.description,tt.shortDetail)||''),a,b}; }
function parseBoard(js){ const out=[];
  const evs=(js&&(js.events||(js.leagues&&js.leagues[0]&&js.leagues[0].events)||js.items))||[];
  for(const ev of evs){ const e={id:String(ev.id),n:ev.name||ev.shortName||'',sn:ev.shortName||ev.name||'',start:ev.date||'',end:ev.endDate||'',ms:[]};
    const groups=(ev.groupings&&ev.groupings.length)?ev.groupings:[{grouping:null,competitions:ev.competitions||[]}];
    for(const g of groups) for(const co of (g.competitions||[])){ try{ const m=pMatch(co,g.grouping||g,e); if(m) e.ms.push(m); }catch(x){} }
    out.push(e); }
  return out; }
function findRanks(o,d){ d=d||0; if(!o||d>7) return null;
  if(Array.isArray(o)){ const f=o[0]; if(f&&typeof f==='object'&&(f.athlete||f.player)&&(f.current!=null||f.rank!=null||f.ranking!=null)) return o; for(const x of o){ const r=findRanks(x,d+1); if(r) return r; } return null; }
  if(typeof o==='object'){ for(const k of Object.keys(o)){ const r=findRanks(o[k],d+1); if(r) return r; } } return null; }
function parseRank(js){ return (findRanks(js)||[]).map(r=>{ const a=r.athlete||r.player||{}, full=first(a.displayName,a.fullName,a.shortName)||'?';
  return {id:String(first(a.id,full)),n:full,s:shortN(a,full),cc:ccOf(a),rk:num(first(r.current,r.rank,r.ranking)),pv:num(first(r.previous,r.prev,r.lastRank)),pts:num(first(r.points,r.score,r.rankingPoints))}; })
  .filter(r=>r.rk!=null).sort((x,y)=>x.rk-y.rk); }

/* ---------- 3. État, mémoire locale ---------- */
const K={fav:'suivi-tennis-fav',pref:'suivi-tennis-pref',cache:'suivi-tennis-cache',draw:'suivi-tennis-draw'};
const jl=(k,d)=>{ try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; }catch(e){ return d; } };
const js_=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
const P0=jl(K.pref,{});
const S={errT:{},tab:['today','draw','rank','mine'].includes(P0.tab)?P0.tab:'today',tour:P0.tour==='wta'?'wta':'atp',day:0,mine:!!P0.mine,rankN:P0.rankN||50,more:0,
  fav:jl(K.fav,{}),cache:jl(K.cache,{board:{},rank:{}}),draw:jl(K.draw,{}),busy:{},err:{},open:{},evSel:'',diag:null,pasteT:0};
S.cache.board=S.cache.board||{}; S.cache.rank=S.cache.rank||{};
const savePref=()=>js_(K.pref,{tab:S.tab,tour:S.tour,mine:S.mine,rankN:S.rankN});
const saveFav=()=>js_(K.fav,S.fav);
function saveCache(){ const ks=Object.keys(S.cache.board).sort((a,b)=>S.cache.board[b].t-S.cache.board[a].t); for(const k of ks.slice(6)) delete S.cache.board[k]; js_(K.cache,S.cache); }
function saveDraw(){ const ks=Object.keys(S.draw).sort((a,b)=>(S.draw[b].t||0)-(S.draw[a].t||0)); for(const k of ks.slice(3)) delete S.draw[k]; js_(K.draw,S.draw); }
const dayKey=off=>parisDK(new Date(Date.now()+off*864e5).toISOString());
const bKey=(tour,off)=>tour+':'+dayKey(off);
const myTour=()=>S.tour;

/* ---------- 4. Chargement ---------- */
async function jget(u){ const c=new AbortController(), t=setTimeout(()=>c.abort(),12000);
  try{ const r=await fetch(u,{cache:'no-store',signal:c.signal}); if(!r.ok){ const e=new Error('HTTP '+r.status); e.status=r.status; throw e; } return await r.json(); } finally{ clearTimeout(t); } }
function redraw(){ if(ui.sport!=='tennis') return; const a=document.activeElement; if(a&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)&&a.closest&&a.closest('#view')) return; render(); }
async function loadBoard(tour,off,force){ const k=bKey(tour,off), c=S.cache.board[k];
  if(S.busy[k]) return; if(!force&&c&&Date.now()-c.t<25e3) return; if(Date.now()-S.pasteT<6e5&&off===0) return; if(!force&&S.errT[k]&&Date.now()-S.errT[k]<30e3) return;
  S.busy[k]=1; try{ const js=await jget(SRC.board(tour,off===0?'':dayKey(off).replace(/-/g,''))); S.cache.board[k]={t:Date.now(),ev:parseBoard(js)}; S.err[k]=''; saveCache(); }
  catch(e){ S.err[k]=e.name==='AbortError'?'délai dépassé':(e.message||String(e)); S.errT[k]=Date.now(); } finally{ S.busy[k]=0; redraw(); } }
async function loadRank(tour,force){ const c=S.cache.rank[tour]; if(S.busy['r'+tour]) return; if(!force&&c&&Date.now()-c.t<6*36e5) return; if(!force&&S.errT['r'+tour]&&Date.now()-S.errT['r'+tour]<30e3) return;
  S.busy['r'+tour]=1; let last='';
  for(const u of SRC.rank(tour)){ try{ const rows=parseRank(await jget(u)); if(rows.length){ S.cache.rank[tour]={t:Date.now(),rows:rows.slice(0,200)}; S.err['r'+tour]=''; saveCache(); last=''; break; } last='format inattendu (aucun joueur classé trouvé)'; }catch(e){ last=e.name==='AbortError'?'délai dépassé':(e.message||String(e)); } }
  if(last){ S.err['r'+tour]=last; S.errT['r'+tour]=Date.now(); } S.busy['r'+tour]=0; redraw(); }
// tableau : on relit chaque jour du tournoi (les jours terminés sont gardés une fois pour toutes)
async function loadDraw(tour,ev,force){ const key=tour+':'+ev.id; if(S.busy['d'+key]) return; if(!force&&S.errT['d'+key]&&Date.now()-S.errT['d'+key]<30e3) return; S.busy['d'+key]=1;
  const D=S.draw[key]||(S.draw[key]={days:{},n:ev.sn,start:ev.start,end:ev.end,t:0}); D.n=ev.sn; D.start=ev.start||D.start; D.end=ev.end||D.end; D.t=Date.now();
  const days=[]; const s=Date.parse(D.start)||Date.now(), e=Math.min(Date.parse(D.end)||Date.now(),Date.now()+864e5);
  for(let t=s;t<=e+864e5/2&&days.length<18;t+=864e5){ const y=new Date(t).toISOString().slice(0,10); if(!days.includes(y)) days.push(y); }
  const old=parisDK(new Date(Date.now()-864e5).toISOString()), todo=days.filter(y=>{ const c=D.days[y]; return !c||(force&&y>=old)||(y>=old&&Date.now()-c.t>40e3); });
  const run=async y=>{ try{ const evs=parseBoard(await jget(SRC.board(tour,y.replace(/-/g,'')))), me=evs.find(x=>x.id===ev.id); D.days[y]={t:Date.now(),ms:me?me.ms:[]}; }catch(x){ S.err['d'+key]=x.message||String(x); S.errT['d'+key]=Date.now(); } };
  if(!todo.length){ S.busy['d'+key]=0; return; }   // rien à relire : surtout ne pas redessiner (ça relancerait cette fonction en boucle)
  for(let i=0;i<todo.length;i+=3) await Promise.all(todo.slice(i,i+3).map(run));
  saveDraw(); S.busy['d'+key]=0; redraw(); }
function tennisRefresh(manual){ const t=myTour();
  if(S.tab==='rank') loadRank(t,true); else { S.pasteT=0; loadBoard(t,S.day,true); if(S.tab==='draw'){ const e=currentEvent(); if(e) loadDraw(t,e,true); } }
  if(manual&&typeof say==='function') say('🎾 Actualisation du tennis…','warn'); }
function ensure(){ const t=myTour();
  if(S.tab==='today'||S.tab==='mine') loadBoard(t,S.tab==='mine'?0:S.day);
  if(S.tab==='draw'){ loadBoard(t,0); const e=currentEvent(); if(e) loadDraw(t,e); }
  if(S.tab==='rank'||S.tab==='mine') loadRank(t); }
// mise à jour automatique : toutes les 30 s s'il y a du direct ou un match imminent (le scoreboard pèse ~200 Ko), sinon toutes les 3 min
function hasLive(){ const c=S.cache.board[bKey(myTour(),0)]; return !!c&&c.ev.some(e=>e.ms.some(m=>m.st==='in'||(m.st==='pre'&&Date.parse(m.t)-Date.now()<20*6e4&&Date.parse(m.t)-Date.now()>-3*36e5))); }
setInterval(()=>{ if(ui.sport!=='tennis'||document.hidden||S.tab==='rank') return; const c=S.cache.board[bKey(myTour(),S.tab==='today'?S.day:0)], age=Date.now()-((c&&c.t)||0), live=hasLive();
  if((live&&age>30e3)||(!live&&age>18e4)) tennisRefresh(false); },10000);

/* ---------- 5. Données utiles aux écrans ---------- */
const boardEvents=(tour,off)=>((S.cache.board[bKey(tour,off)]||{}).ev)||[];
function allMatches(tour){ const M=new Map(); const add=m=>{ if(!M.has(m.id)||m.st!=='pre') M.set(m.id,m); };
  for(const k of Object.keys(S.cache.board)) if(k.startsWith(tour+':')) for(const e of S.cache.board[k].ev) e.ms.forEach(add);
  for(const k of Object.keys(S.draw)) if(k.startsWith(tour+':')) for(const d of Object.values(S.draw[k].days)) (d.ms||[]).forEach(add);
  return [...M.values()]; }
function currentEvent(){ const evs=boardEvents(myTour(),0).filter(e=>e.ms.length||true); if(!evs.length) return null; return evs.find(e=>e.id===S.evSel)||evs.slice().sort((a,b)=>b.ms.length-a.ms.length)[0]; }
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]/g,'');
const rankOf=(tour,p)=>{ const rows=(S.cache.rank[tour]||{}).rows||[]; return rows.find(r=>r.id===p.id)||rows.find(r=>norm(r.n)===norm(p.n))||null; };
const isFav=p=>!!S.fav[p.id];
const ini=n=>String(n||'?').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();

/* ---------- 6. Affichage : éléments communs ---------- */
const star=p=>`<span class="tnst${isFav(p)?' on':''}" data-tn="fav" data-id="${esc(p.id)}" data-n="${esc(p.n)}" data-cc="${esc(p.cc)}" title="${isFav(p)?'Retirer de mes joueurs':'Ajouter à mes joueurs'}">${isFav(p)?'★':'☆'}</span>`;
function setLabel(m){ if(/suspend|delay|rain|interrupt/i.test(m.dsc)) return 'Interrompu'; const n=Math.max(m.a.sets.length,m.b.sets.length)||1; return n===1?'1er set':n+'e set'; }
function endNote(m){ return /retir|abandon/i.test(m.dsc)?' · abandon':/walkover|w\/o|forfait/i.test(m.dsc)?' · forfait':''; }
function setsHtml(m,p,q){ const live=m.st==='in', n=Math.max(p.sets.length,q.sets.length); let h='';
  for(let i=0;i<n;i++){ const x=p.sets[i], y=q.sets[i]; if(!x){ h+='<span></span>'; continue; } const cur=live&&i===n-1, won=y?x.g>y.g:true;
    h+=`<span class="${cur?'cur':won?'w':''}">${x.g}${x.tb!=null?`<sup>${x.tb}</sup>`:''}</span>`; }
  if(live&&p.gm!=null) h+=`<span class="gm">${esc(p.gm)}</span>`; return h; }
function row(m,p,q){ const win=m.st==='post'&&p.w, live=m.st==='in';
  return `<div class="tnp"><div class="tnn${win?' win':''}"><span class="tnav">${esc(ini(p.n))}</span><b>${esc(p.s)}</b>${p.cc?`<span class="tncc">${esc(p.cc)}</span>`:''}${p.rk?`<span class="tnrk">#${p.rk}</span>`:p.sd?`<span class="tnrk">(${p.sd})</span>`:''}${live&&p.sv?'<span class="tnsv" title="Au service"></span>':''}${star(p)}</div><div class="tns">${setsHtml(m,p,q)}</div></div>`; }
function card(m){ const fv=isFav(m.a)||isFav(m.b), head=`${esc(m.en||'')}${m.en&&m.rdf?' · ':''}${esc(m.rdf)}${m.ct?' · '+esc(m.ct):''}`;
  const pill=m.st==='in'?`<span class="tnpill"><i></i>${esc(setLabel(m))}</span>`:m.st==='post'?`<span class="tnpill fin">Terminé${esc(endNote(m))}</span>`:'';
  return `<div class="tnc${fv?' fv':''}"><div class="tnh"><span>${head}</span>${pill}</div>${row(m,m.a,m.b)}${row(m,m.b,m.a)}</div>`; }
function hero(title,sub,live,extra){ const t=myTour();
  return `<div class="mxhero"><div class="row between" style="gap:10px;align-items:center;flex-wrap:wrap"><div style="min-width:0"><h2 style="margin:0">${live?'<span class="livedot"></span>':''}${title}</h2><div class="mut" style="font-size:12px;margin-top:2px">${sub}</div></div>
    <div class="row" style="gap:6px;flex-wrap:nowrap"><button class="${t==='atp'?'':'sec '}fbtn" data-tn="tour" data-v="atp">ATP</button><button class="${t==='wta'?'':'sec '}fbtn" data-tn="tour" data-v="wta">WTA</button></div></div>${extra||''}</div>`; }
function status(k){ if(S.busy[k]&&!S.cache.board[k]) return '<div class="card"><p class="mut" style="margin:0">⏳ Chargement…</p></div>';
  if(S.err[k]&&!(S.cache.board[k])) return `<div class="card"><p class="err" style="margin:0 0 6px">⚠️ ESPN ne répond pas (${esc(S.err[k])}).</p><button class="sec" data-tn="refresh">Réessayer</button> <button class="sec" data-tn="diag">🔧 Diagnostic ESPN</button></div>`; return ''; }

/* ---------- 7. Écran « Aujourd'hui » ---------- */
function vToday(){ const t=myTour(), k=bKey(t,S.day), evs=boardEvents(t,S.day);
  let ms=evs.flatMap(e=>e.ms); if(S.mine) ms=ms.filter(m=>isFav(m.a)||isFav(m.b));
  const fvScore=m=>(isFav(m.a)||isFav(m.b))?0:1, byT=(a,b)=>fvScore(a)-fvScore(b)||(Date.parse(a.t)||0)-(Date.parse(b.t)||0);
  const live=ms.filter(m=>m.st==='in').sort(byT), pre=ms.filter(m=>m.st==='pre').sort((a,b)=>(Date.parse(a.t)||0)-(Date.parse(b.t)||0)||fvScore(a)-fvScore(b)), done=ms.filter(m=>m.st==='post').sort((a,b)=>fvScore(a)-fvScore(b)||(Date.parse(b.t)||0)-(Date.parse(a.t)||0));
  const dl=['Hier',"Aujourd'hui",'Demain'], dn=new Date(Date.now()+S.day*864e5).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'});
  const ex=`<div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap">${[-1,0,1].map(d=>`<button class="${S.day===d?'':'sec '}fbtn" data-tn="day" data-v="${d}">${dl[d+1]}</button>`).join('')}<button class="${S.mine?'':'sec '}fbtn" data-tn="mine">⭐ Mes joueurs</button><span class="mut" style="margin-left:auto;font-size:12px">${(S.cache.board[k]&&S.cache.board[k].t)?'mis à jour '+new Date(S.cache.board[k].t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):''} · <span class="link" data-tn="diag">🔧 Diagnostic ESPN</span></span></div>`;
  let h=hero('🎾 Tennis '+(S.day===0?'du jour':dl[S.day+1].toLowerCase()),esc(dn)+' · heure de Paris',live.length>0,ex)+(S.diag?diagHtml():'')+status(k);
  if(!ms.length&&!status(k)&&!S.busy[k]) h+=`<div class="card"><p class="mut" style="margin:0">${S.mine?'Aucun match de tes joueurs ce jour-là. Touche ☆ à côté d\'un joueur pour le suivre.':'Aucun match de simple ce jour-là. Pas de tournoi ou pas de données reçues : ouvre le <span class="link" data-tn="diag">diagnostic ESPN</span> pour vérifier.'}</p></div>`;
  if(live.length) h+=`<div class="mxl">🔴 En cours</div>`+live.map(card).join('');
  if(pre.length){ const g=new Map(); for(const m of pre){ const key=m.t||'?'; if(!g.has(key)) g.set(key,[]); g.get(key).push(m); }
    h+=`<div class="mxl">⏰ À venir</div>`+[...g].map(([t,L])=>{ const ts=Date.parse(t); return `<div class="mxgh"><span class="mut" style="font-size:12px">à partir de</span><span class="t">${ts?esc(parisT(t)):'—'}</span>${ts?`<span class="c${ts-Date.now()<=15*6e4?' soon':''}" data-cd="${ts}">${esc(mxCd(ts))}</span>`:''}<span class="n">${L.length} match${L.length>1?'s':''}</span></div>`+L.map(card).join(''); }).join(''); }
  if(done.length){ const lim=10+S.more*10; h+=`<div class="mxl">🏁 Terminés</div>`+done.slice(0,lim).map(card).join('')+(done.length>lim?`<div style="text-align:center"><button class="sec" data-tn="more">Afficher plus (${done.length-lim})</button></div>`:''); }
  return h; }

/* ---------- 8. Écran « Tableau » ---------- */
function vDraw(){ const t=myTour(); let ev=currentEvent(), key=ev?t+':'+ev.id:'', D=key&&S.draw[key], past=false;
  if(!ev){ const ks=Object.keys(S.draw).filter(k=>k.startsWith(t+':')).sort((a,b)=>(S.draw[b].t||0)-(S.draw[a].t||0)); if(ks.length){ key=ks[0]; D=S.draw[key]; ev={id:key.split(':')[1],sn:D.n,start:D.start,end:D.end}; past=true; } }
  if(!ev) return hero('🏆 Tableau du tournoi','',false)+status(bKey(t,0))+(S.busy[bKey(t,0)]?'':'<div class="card"><p class="mut" style="margin:0">Aucun tournoi en cours aujourd\'hui. Le tableau apparaît dès qu\'ESPN annonce un tournoi.</p></div>');
  const evs=boardEvents(t,0), sel=evs.length>1?`<select data-tn-sel="ev" style="margin-top:10px">${evs.map(e=>`<option value="${esc(e.id)}" ${e.id===ev.id?'selected':''}>${esc(e.sn)}</option>`).join('')}</select>`:'';
  const ms=[]; if(D) for(const d of Object.values(D.days)) ms.push(...(d.ms||[])); const seen=new Map(); ms.forEach(m=>{ if(!seen.has(m.id)||m.st!=='pre') seen.set(m.id,m); });
  const all=[...seen.values()], by={}; all.forEach(m=>{ (by[m.ri]||(by[m.ri]=[])).push(m); });
  const ris=Object.keys(by).map(Number).sort((a,b)=>a-b);
  const dateTxt=(ev.start?new Date(ev.start).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):'')+(ev.end?' – '+new Date(ev.end).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):'');
  let h=hero('🏆 '+esc(ev.sn||'Tournoi'),(past?'Dernier tournoi enregistré · ':'')+esc(dateTxt),all.some(m=>m.st==='in'),sel)+status(bKey(t,0));
  if(!all.length) return h+(S.busy['d'+key]?'<div class="card"><p class="mut" style="margin:0">⏳ Chargement du tableau…</p></div>':'<div class="card"><p class="mut" style="margin:0">Aucun match de simple trouvé pour ce tournoi (voir le diagnostic ESPN dans l\'onglet Aujourd\'hui).</p></div>');
  // parcours d'un joueur favori engagé dans le tournoi
  const fp=all.flatMap(m=>[m.a,m.b]).find(isFav);
  if(fp){ const rds=[...new Set(all.filter(m=>m.a.id===fp.id||m.b.id===fp.id).map(m=>m.ri))].sort((a,b)=>a-b), cell=r=>{ const mm=all.find(m=>m.ri===r&&(m.a.id===fp.id||m.b.id===fp.id)), nm=roundFr(mm?mm.rd:'')||'';
      const state=!mm?'':mm.st==='in'?' cur':mm.st==='post'?((mm.a.id===fp.id?mm.a:mm.b).w?' ok':' ko'):'';
      const sh=mm?({5:'Quart',6:'Demi',7:'Finale'}[mm.ri]||mm.rdf.replace(/ de finale$/,'')):nm;
      return `<span class="pc${state}">${esc(sh)}${state===' ok'?' ✓':state===' ko'?' ✗':state===' cur'?' · en cours':''}</span>`; };
    h+=`<div class="mxl">⭐ Parcours de ${esc(fp.s)}</div><div class="card" style="padding:10px 14px"><div class="tnparc">${rds.map(cell).join('')}</div></div>`; }
  // tours : en cours d'abord, puis les suivants, puis les tours passés (repliés)
  const curRi=ris.find(r=>by[r].some(m=>m.st!=='post'))??ris[ris.length-1], later=ris.filter(r=>r>curRi), earlier=ris.filter(r=>r<curRi).reverse();
  const futureMissing=[]; for(let r=Math.max(...ris)+1;r<=7;r++) futureMissing.push(r);
  const FR={5:'Quarts de finale',6:'Demi-finales',7:'Finale'};
  const open=r=>S.open[key+':'+r]!==undefined?S.open[key+':'+r]:(r===curRi||r===later[0]);
  const sec=r=>{ const L=(by[r]||[]).slice().sort((a,b)=>(a.st==='in'?0:a.st==='pre'?1:2)-(b.st==='in'?0:b.st==='pre'?1:2)||(Date.parse(a.t)||0)-(Date.parse(b.t)||0)), n=L.length, nl=L.filter(m=>m.st==='in').length, nd=L.filter(m=>m.st==='post').length;
    const bdg=nl?`<span class="st live">${nl} en cours</span>`:nd===n?`<span class="st">${n} match${n>1?'s':''} · terminé${n>1?'s':''}</span>`:`<span class="st">${n-nd} à jouer</span>`, o=open(r);
    return `<div class="tnrd" data-tn="rd" data-v="${key}:${r}"><b>${esc(L[0]?L[0].rdf:'Tour')}</b>${bdg}<i>${o?'▾':'▸'}</i></div>`+(o?`<div class="tng">${L.map(mini).join('')}</div>`:''); };
  h+=[curRi,...later,...futureMissing.map(r=>'F'+r),...earlier].map(r=>typeof r==='string'?`<div class="tnrd"><b>${FR[+r.slice(1)]||'Tour'}</b><span class="st">à venir</span></div>`:sec(r)).join('');
  return h; }
function mini(m){ const fv=isFav(m.a)||isFav(m.b), L=(p,q)=>`<div class="ln"><span class="nm${m.st==='post'&&p.w?' w':''}">${esc(p.s)}${p.rk?`<small>(${p.rk})</small>`:p.sd?`<small>(${p.sd})</small>`:''}${isFav(p)?' <span class="tnstar">★</span>':''}</span><span class="sc">${setsHtml(m,p,q)}</span></div>`;
  const ft=m.st==='in'?`<span>${esc(m.ct||m.en||'')}</span><span style="color:#e8412f;font-weight:800">● ${esc(setLabel(m))}</span>`:m.st==='post'?`<span>Terminé${esc(endNote(m))}</span><span></span>`:`<span>${Date.parse(m.t)?esc(parisDK(m.t)===dayKey(0)?'':new Date(m.t).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'short',day:'numeric'})+' · ')+esc(parisT(m.t)):''}${m.ct?' · '+esc(m.ct):''}</span><span></span>`;
  return `<div class="tnmm${fv?' fv':''}"><div class="ft">${ft}</div>${L(m.a,m.b)}${L(m.b,m.a)}</div>`; }

/* ---------- 9. Écran « Classement » ---------- */
function vRank(){ const t=myTour(), R=S.cache.rank[t], k='r'+t; let h=hero('📊 Classement '+t.toUpperCase(),R&&R.t?'Mis à jour '+new Date(R.t).toLocaleString('fr-FR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}):'',false);
  if(!R){ if(S.busy[k]) return h+'<div class="card"><p class="mut" style="margin:0">⏳ Chargement…</p></div>'; return h+`<div class="card"><p class="mut" style="margin:0 0 6px">Classement indisponible${S.err[k]?' ('+esc(S.err[k])+')':''}.</p><button class="sec" data-tn="refresh">Réessayer</button> <button class="sec" data-tn="diag">🔧 Diagnostic ESPN</button></div>${S.diag?diagHtml():''}`; }
  const mv=r=>r.pv==null?'<span class="mv eq">·</span>':r.pv>r.rk?`<span class="mv up">▲${r.pv-r.rk}</span>`:r.pv<r.rk?`<span class="mv dn">▼${r.rk-r.pv}</span>`:'<span class="mv eq">=</span>';
  const line=r=>{ const f=S.fav[r.id]; return `<div class="tnr${f?' fv':''}"><span class="rk">${r.rk}</span>${mv(r)}<div class="who"><span class="tnav">${esc(ini(r.n))}</span><b>${esc(r.n)}</b>${r.cc?`<span class="tncc">${esc(r.cc)}</span>`:''}${star(r)}</div><div class="pts">${r.pts!=null?r.pts.toLocaleString('fr-FR'):'–'}<small>points</small></div></div>`; };
  const pin=R.rows.filter(r=>S.fav[r.id]);
  if(pin.length) h+=`<div class="mxl">⭐ Mes joueurs</div><div class="card tnpin" style="padding:6px 8px">${pin.map(line).join('')}</div>`;
  const N=S.rankN, top=R.rows.slice(0,N);
  h+=`<div class="mxl">Top ${N}</div><div class="card" style="padding:6px 8px"><div class="row" style="margin:6px 4px 8px;gap:6px"><select data-tn-sel="rankn">${[15,50,100,200].map(n=>`<option value="${n}" ${n===N?'selected':''}>Top ${n}</option>`).join('')}</select></div>${top.map(line).join('')}</div>`;
  return h; }

/* ---------- 10. Écran « Mes joueurs » ---------- */
function vMine(){ const t=myTour(), ids=Object.keys(S.fav), all=allMatches(t), now=Date.now();
  let h=hero('⭐ Mes joueurs','Touche ☆ à côté d\'un joueur (matchs ou classement) pour le suivre',all.some(m=>m.st==='in'&&(S.fav[m.a.id]||S.fav[m.b.id])),'')+status(bKey(t,0));
  if(!ids.length) return h+'<div class="card"><h2>Aucun joueur pour l\'instant</h2><p class="mut">Dans « Aujourd\'hui » ou « Classement », touche ☆ à côté d\'un joueur : il apparaît ici avec son classement, son match en cours, son prochain match et son dernier résultat. Les joueurs suivis passent aussi en premier dans les listes.</p></div>';
  const R=(S.cache.rank[t]||{}).rows||[];
  h+=ids.map(id=>{ const f=S.fav[id], p={id,n:f.n,cc:f.cc,s:f.n}, r=rankOf(t,p), mine=all.filter(m=>m.a.id===id||m.b.id===id);
    const cur=mine.find(m=>m.st==='in'), nxt=mine.filter(m=>m.st==='pre'&&Date.parse(m.t)>=now-3*36e5).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t))[0], lst=mine.filter(m=>m.st==='post').sort((a,b)=>Date.parse(b.t)-Date.parse(a.t))[0];
    const opp=m=>m.a.id===id?m.b:m.a, me=m=>m.a.id===id?m.a:m.b, sc=m=>{ const x=me(m).sets, y=opp(m).sets; return x.map((s,i)=>`${s.g}-${y[i]?y[i].g:'?'}`).join(' '); };
    const when=m=>{ const ts=Date.parse(m.t); if(!ts) return ''; const d=parisDK(m.t)===dayKey(0)?"aujourd'hui":parisDK(m.t)===dayKey(1)?'demain':new Date(m.t).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'}); return d+' à '+parisT(m.t); };
    const ln=[]; if(cur) ln.push(`<div class="tnl live">🔴 <b>En cours</b> · ${esc(setLabel(cur))} · ${esc(sc(cur))} contre ${esc(opp(cur).s)}</div>`);
    if(nxt) ln.push(`<div class="tnl">⏭ <b>Prochain</b> · contre ${esc(opp(nxt).s)}${opp(nxt).rk?` (#${opp(nxt).rk})`:''} · ${esc(when(nxt))}${nxt.ct?' · '+esc(nxt.ct):''} <span class="mut">· ${esc(nxt.rdf)}</span></div>`);
    if(lst){ const won=me(lst).w; ln.push(`<div class="tnl">${won?'✅':'❌'} <b>Dernier</b> · ${won?'bat':'battu par'} ${esc(opp(lst).s)} ${esc(sc(lst))} <span class="mut">· ${esc(lst.en||'')} ${esc(lst.rdf)}</span></div>`); }
    if(!ln.length) ln.push('<div class="tnl mut">Pas de match enregistré pour l\'instant.</div>');
    return `<div class="tnc fv"><div class="tnh"><span>${r?`Classement ${t.toUpperCase()} : #${r.rk}`:'Classement non chargé'}${r&&r.pts!=null?' · '+r.pts.toLocaleString('fr-FR')+' pts':''}</span><span>${star(p)}</span></div>
      <div class="tnp"><div class="tnn"><span class="tnav">${esc(ini(f.n))}</span><b>${esc(f.n)}</b>${f.cc?`<span class="tncc">${esc(f.cc)}</span>`:''}</div><div class="tns">${r?(r.pv==null?'':r.pv>r.rk?`<span class="mv up">▲${r.pv-r.rk}</span>`:r.pv<r.rk?`<span class="mv dn">▼${r.rk-r.pv}</span>`:''):''}</div></div>${ln.join('')}</div>`; }).join('');
  return h; }

/* ---------- 11. Diagnostic ESPN ---------- */
function diagHtml(){ const d=S.diag||{}, t=myTour();
  return `<div class="card tndiag"><div class="row between"><h2 style="margin:0">🔧 Diagnostic ESPN</h2><button class="sec" data-tn="diagx">Fermer</button></div>
  <p class="mut" style="margin:8px 0">Pour vérifier ce qu'ESPN renvoie. « Copier un extrait » met quelques matchs dans le presse-papiers (à me coller pour ajuster la lecture). Tu peux aussi coller un JSON ci-dessous pour voir l'écran avec ces données.</p>
  <div class="row" style="gap:6px;flex-wrap:wrap"><button class="sec" data-tn="diagrun">Tester ${t.toUpperCase()}</button><button class="sec" data-tn="diagcopy" data-v="sboard">Copier un extrait du scoreboard</button><button class="sec" data-tn="diagcopy" data-v="srank">Copier un extrait du classement</button><button class="sec" data-tn="diagcopy" data-v="board" title="Réponse complète (~200 Ko)">Brut complet</button></div>
  ${d.log?`<pre class="tnlog">${esc(d.log)}</pre>`:''}
  <textarea id="tnPaste" rows="4" placeholder="Colle ici un JSON ESPN (scoreboard ou classement)…" style="width:100%;margin-top:10px">${esc(d.paste||'')}</textarea>
  <div class="row" style="gap:6px;margin-top:6px"><button class="sec" data-tn="pasteboard">Lire comme scoreboard</button><button class="sec" data-tn="pasterank">Lire comme classement</button></div></div>`; }
async function diagRun(){ const t=myTour(), L=[]; S.diag=S.diag||{}; S.diag.log='Test en cours…'; redraw();
  const one=async(label,u,parse,count)=>{ const t0=Date.now(); try{ const r=await fetch(u,{cache:'no-store'}); const txt=await r.text(); let js=null; try{ js=JSON.parse(txt); }catch(e){}
      L.push(`${label} : HTTP ${r.status} · ${txt.length} octets · ${Date.now()-t0} ms\n  ${u}`); if(!js){ L.push('  ⚠️ réponse non JSON'); return; } const x=parse(js); L.push('  → '+count(x)); return x; }catch(e){ L.push(`${label} : ERREUR ${e.message||e}\n  ${u}`); } };
  await one('Scoreboard',SRC.board(t,''),parseBoard,x=>`${x.length} tournoi(s), ${x.reduce((n,e)=>n+e.ms.length,0)} match(s) de simple lus (${x.map(e=>e.sn+':'+e.ms.length).join(', ')||'aucun'})`);
  for(const u of SRC.rank(t)){ const x=await one('Classement',u,parseRank,x=>`${x.length} joueur(s) classé(s)${x[0]?' · #1 '+x[0].n:''}`); if(x&&x.length) break; }   // 2e adresse = secours, testée seulement si la 1re ne donne rien
  S.diag.log=L.join('\n'); redraw(); }
// extrait : tournoi + 1 match en cours / à venir / terminé (ou les 3 premiers) ; classement : 3 premiers joueurs
function trimJs(o,k){ if(Array.isArray(o)) return (k==='linescores'||k==='competitors'?o:o.slice(0,3)).map(x=>trimJs(x,k)); if(o&&typeof o==='object'){ const r={}; for(const x of Object.keys(o)) r[x]=trimJs(o[x],x); return r; } return o; }
function sample(js,kind){ try{ if(kind==='rank') return trimJs(js);
    const c=JSON.parse(JSON.stringify(js)); c.events=(c.events||[]).slice(0,2);
    for(const ev of c.events){ for(const g of (ev.groupings||[])){ const L=g.competitions||[], pick=[]; for(const st of ['in','pre','post']){ const m=L.find(x=>x.status&&x.status.type&&x.status.type.state===st&&!pick.includes(x)); if(m) pick.push(m); } for(const m of L) if(pick.length<3&&!pick.includes(m)) pick.push(m); g.competitions=pick; } if(ev.competitions) ev.competitions=ev.competitions.slice(0,3); }
    return trimJs(c); }catch(e){ return js; } }
async function diagCopy(kind){ const t=myTour(), small=kind==='sboard'||kind==='srank', base=(kind==='board'||kind==='sboard')?'board':'rank', u=base==='board'?SRC.board(t,''):SRC.rank(t)[0]; let txt=''; try{ const raw=await (await fetch(u,{cache:'no-store'})).text(); txt=small?JSON.stringify(sample(JSON.parse(raw),base),null,1):raw; }catch(e){ txt='ERREUR '+(e.message||e); }
  let ok=false; try{ await navigator.clipboard.writeText(txt); ok=true; }catch(e){ const a=document.createElement('textarea'); a.value=txt; document.body.appendChild(a); a.select(); try{ ok=document.execCommand('copy'); }catch(x){} a.remove(); }
  S.diag=S.diag||{}; S.diag.log=(ok?`✅ Copié (${txt.length} caractères). Colle-le dans la conversation.`:'⚠️ Copie impossible : ouvre l\'adresse dans un onglet et copie le texte à la main.')+'\n'+u; redraw(); }
function diagPaste(kind){ const el=document.getElementById('tnPaste'), txt=el?el.value:''; S.diag=S.diag||{}; S.diag.paste=txt; let js=null; try{ js=JSON.parse(txt); }catch(e){ S.diag.log='⚠️ Ce texte n\'est pas du JSON valide : '+e.message; return redraw(); }
  const t=myTour();
  if(kind==='board'){ const ev=parseBoard(js), n=ev.reduce((a,e)=>a+e.ms.length,0); S.diag.log=`Lu : ${ev.length} tournoi(s), ${n} match(s) de simple.`+(n?' Affichés ci-dessous (données collées, valables 10 min).':' Rien d\'exploitable : colle-moi ce JSON pour que j\'ajuste la lecture.'); if(n){ S.cache.board[bKey(t,0)]={t:Date.now(),ev}; S.pasteT=Date.now(); S.day=0; saveCache(); } }
  else { const rows=parseRank(js); S.diag.log=`Lu : ${rows.length} joueur(s) classé(s).`+(rows.length?' Enregistré comme classement '+t.toUpperCase()+'.':' Rien d\'exploitable : colle-moi ce JSON pour que j\'ajuste la lecture.'); if(rows.length){ S.cache.rank[t]={t:Date.now(),rows:rows.slice(0,200)}; saveCache(); } }
  redraw(); }

/* ---------- 12. Affichage principal + clics ---------- */
const TABS=[['today','📅',"Aujourd'hui"],['draw','🏆','Tableau'],['rank','📊','Classement'],['mine','⭐','Mes joueurs']];
window.tennisRender=function(){ $('#tabs').innerHTML=TABS.map(([k,i,l])=>`<button data-act="tab" data-t="${k}" class="${S.tab===k?'on':''}"><i>${i}</i><span>${esc(l)}</span></button>`).join('');
  const f={today:vToday,draw:vDraw,rank:vRank,mine:vMine}[S.tab]; $('#view').innerHTML=f(); ensure(); };
window.tennisRefresh=tennisRefresh;
window.Tennis={parseBoard,parseRank,roundFr,roundIdx,sample,state:S};
if(ui.sport==='tennis') render();   // le premier rendu a eu lieu avant le chargement de ce fichier
document.addEventListener('click',e=>{ if(ui.sport!=='tennis') return;
  const tb=e.target.closest&&e.target.closest('#tabs [data-act=tab]'); if(tb){ e.stopPropagation(); e.preventDefault(); S.tab=tb.dataset.t; S.more=0; savePref(); render(); window.scrollTo(0,0); return; }
  const el=e.target.closest&&e.target.closest('#view [data-tn]'); if(!el) return; const a=el.dataset.tn, v=el.dataset.v;
  if(a==='tour'){ S.tour=v; S.more=0; S.evSel=''; savePref(); render(); }
  else if(a==='day'){ S.day=+v; S.more=0; render(); }
  else if(a==='mine'){ S.mine=!S.mine; savePref(); render(); }
  else if(a==='more'){ S.more++; render(); }
  else if(a==='fav'){ e.stopPropagation(); const id=el.dataset.id; if(S.fav[id]) delete S.fav[id]; else S.fav[id]={n:el.dataset.n,cc:el.dataset.cc}; saveFav(); render(); }
  else if(a==='rd'){ const cur=S.open[v]; const def=el.querySelector('i').textContent==='▾'; S.open[v]=cur===undefined?!def:!cur; render(); }
  else if(a==='refresh') tennisRefresh(true);
  else if(a==='diag'){ S.diag=S.diag||{}; render(); window.scrollTo(0,0); } else if(a==='diagx'){ S.diag=null; render(); }
  else if(a==='diagrun') diagRun(); else if(a==='diagcopy') diagCopy(v); else if(a==='pasteboard') diagPaste('board'); else if(a==='pasterank') diagPaste('rank');
},true);
document.addEventListener('change',e=>{ if(ui.sport!=='tennis') return; const el=e.target.closest&&e.target.closest('#view [data-tn-sel]'); if(!el) return;
  if(el.dataset.tnSel==='rankn'){ S.rankN=+el.value; savePref(); render(); } else if(el.dataset.tnSel==='ev'){ S.evSel=el.value; render(); } });
})();
