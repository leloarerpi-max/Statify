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
  m=/(\d+)(?:st|nd|rd|th)\s*round/.exec(t); if(m) return +m[1]; m=/^\s*round\s+(\d+)\s*$/.exec(t); if(m) return +m[1]; return 3; }
function roundFr(t){ const i=roundIdx(t), s=String(t||'').toLowerCase(), m=/round of (\d+)/.exec(s);
  if(/qualif/.test(s)) return 'Qualifications'; if(i===7) return 'Finale'; if(i===6) return 'Demi-finales'; if(i===5) return 'Quarts de finale';
  if(m) return {16:'8es de finale',32:'16es de finale',64:'32es de finale',128:'64es de finale'}[+m[1]]||t; if(!t) return 'Tour'; return i===1?'1er tour':i+'e tour'; }
// rk = classement explicite (rare) ; sd = « curatedRank »/tête de série d'ESPN (absent pour certains joueurs) ; le classement affiché vient de la liste « Classement »
function pPlayer(c){ const a=c.athlete||c.player||{}, full=first(a.displayName,a.fullName,c.displayName,c.name,a.shortName)||'?';
  const ls=(c.linescores||c.sets||[]).map(l=>({g:num(first(l&&l.value,l&&l.score,l&&l.games,l)),tb:num(first(l&&l.tiebreak,l&&l.tieBreak,l&&l.tiebreakScore,l&&l.tb))})).filter(l=>l.g!=null);
  return {id:String(first(a.id,c.id,full)),n:full,s:shortN(a,full),cc:ccOf(a),rk:num(first(c.rank,a.rank,c.ranking,c.currentRank,a.ranking)),
    sd:num(first(c.seed,c.tournamentSeed,a.seed,c.curatedRank&&c.curatedRank.current)),w:!!c.winner,sv:!!(c.possession||c.serving||c.isServing||c.hasPossession),gm:first(c.gameScore,c.currentGame,c.points),sets:ls}; }
function pMatch(co,grp,ev){
  const gname=String(first(grp&&grp.displayName,grp&&grp.slug,grp&&grp.name,co.type&&co.type.text,co.type&&co.type.name)||'');
  if(/doubl/i.test(gname)) return null;
  const cs=(co.competitors||[]).filter(c=>c&&(c.athlete||c.player||c.displayName)); if(cs.length!==2) return null;
  const [a,b]=cs.slice().sort((x,y)=>(x.order||0)-(y.order||0)).map(pPlayer);
  const tt=(co.status&&co.status.type)||{}; let st=tt.state; if(!st) st=tt.completed?'post':/progress/i.test(tt.name||tt.description||'')?'in':'pre';
  const rd=String(first(co.round&&(co.round.displayName||co.round.name),co.notes&&co.notes[0]&&co.notes[0].text)||'');
  return {id:String(first(co.id,co.uid)||(ev.id+':'+a.id+'-'+b.id)),ev:ev.id,en:ev.sn,per:num(co.status&&co.status.period),rd,rdf:roundFr(rd),ri:roundIdx(rd),st,t:String(first(co.date,co.startDate,co.startTime,ev.start)||''),
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
const K={fav:'suivi-tennis-fav',pref:'suivi-tennis-pref',cache:'suivi-tennis-cache',draw:'suivi-tennis-draw',notif:'suivi-tennis-notif',snap:'suivi-tennis-snap',starm:'suivi-tennis-starm'};
const jl=(k,d)=>{ try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; }catch(e){ return d; } };
const js_=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
const P0=jl(K.pref,{});
const S={errT:{},tab:['home','today','draw','rank','mine','stats'].includes(P0.tab)?P0.tab:'home',qual:!!P0.qual,dmode:P0.dmode==='list'?'list':'tree',autoDraw:{},tour:P0.tour==='wta'?'wta':'atp',day:0,mine:!!P0.mine,rankN:P0.rankN||50,more:0,
  fav:jl(K.fav,{}),cache:jl(K.cache,{board:{},rank:{}}),draw:jl(K.draw,{}),busy:{},err:{},open:{},evSel:'',diag:null,pasteT:0};
S.cache.board=S.cache.board||{}; S.cache.rank=S.cache.rank||{};
const savePref=()=>js_(K.pref,{tab:S.tab,tour:S.tour,mine:S.mine,rankN:S.rankN,qual:S.qual,dmode:S.dmode});
const saveFav=()=>js_(K.fav,S.fav);
// matchs étoilés (★) : {idMatch:{t:date,tr:circuit}} ; propres à cet appareil, oubliés après 3 jours
S.starM=jl(K.starm,{}); for(const k of Object.keys(S.starM)) if(Date.now()-((S.starM[k]||{}).t||0)>3*864e5) delete S.starM[k];
const saveStarM=()=>js_(K.starm,S.starM);
const isStar=m=>!!S.starM[m.id];
function saveCache(){ const ks=Object.keys(S.cache.board).sort((a,b)=>S.cache.board[b].t-S.cache.board[a].t); for(const k of ks.slice(6)) delete S.cache.board[k]; js_(K.cache,S.cache); }
function mergeBoard(tour,evs){ for(const e of evs){ const key=tour+':'+e.id, D=S.draw[key]||(S.draw[key]={ms:{},n:e.sn,start:e.start,end:e.end,t:0}); if(!D.ms) D.ms={}; D.n=e.sn; D.start=e.start||D.start; D.end=e.end||D.end; D.t=Date.now(); for(const m of e.ms) D.ms[m.id]=m; } saveDraw(); }
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
  S.busy[k]=1; try{ const js=await jget(SRC.board(tour,off===0?'':dayKey(off).replace(/-/g,''))); const evs=parseBoard(js); S.cache.board[k]={t:Date.now(),ev:evs}; mergeBoard(tour,evs); S.err[k]=''; saveCache(); try{ ntScan(tour,evs); }catch(x){} }
  catch(e){ S.err[k]=e.name==='AbortError'?'délai dépassé':(e.message||String(e)); S.errT[k]=Date.now(); } finally{ S.busy[k]=0; redraw(); } }
async function loadRank(tour,force){ const c=S.cache.rank[tour]; if(S.busy['r'+tour]) return; if(!force&&c&&Date.now()-c.t<6*36e5) return; if(!force&&S.errT['r'+tour]&&Date.now()-S.errT['r'+tour]<30e3) return;
  S.busy['r'+tour]=1; let last='';
  for(const u of SRC.rank(tour)){ try{ const rows=parseRank(await jget(u)); if(rows.length){ S.cache.rank[tour]={t:Date.now(),rows:rows.slice(0,200)}; S.err['r'+tour]=''; saveCache(); last=''; break; } last='format inattendu (aucun joueur classé trouvé)'; }catch(e){ last=e.name==='AbortError'?'délai dépassé':(e.message||String(e)); } }
  if(last){ S.err['r'+tour]=last; S.errT['r'+tour]=Date.now(); } S.busy['r'+tour]=0; redraw(); }
// tableau : le scoreboard renvoie déjà tout le tournoi ; ce bouton (facultatif) relit les jours précédents au cas où ESPN n'en renverrait qu'une partie
async function loadDraw(tour,ev){ const key=tour+':'+ev.id; if(S.busy['d'+key]) return; S.busy['d'+key]=1; redraw();
  const days=[]; const s0=Date.parse(ev.start)||Date.now(), e0=Math.min(Date.parse(ev.end)||Date.now(),Date.now());
  for(let t=s0;t<=e0+864e5/2&&days.length<18;t+=864e5){ const y=new Date(t).toISOString().slice(0,10); if(!days.includes(y)) days.push(y); }
  for(let i=0;i<days.length;i+=2) await Promise.all(days.slice(i,i+2).map(async y=>{ try{ const evs=parseBoard(await jget(SRC.board(tour,y.replace(/-/g,'')))); mergeBoard(tour,evs.filter(x=>x.id===ev.id)); }catch(x){ S.err['d'+key]=x.message||String(x); } }));
  S.busy['d'+key]=0; redraw(); }
function tennisRefresh(manual){ const t=myTour();
  if(S.tab==='rank') loadRank(t,true); else { S.pasteT=0; loadBoard(t,0,true); }
  if(manual&&typeof say==='function') say('🎾 Actualisation du tennis…','warn'); }
function ensure(){ const t=myTour();
  loadBoard(t,0); if(S.tab==='today'&&S.day!==0&&!dayMs(t,S.day).length) loadBoard(t,S.day);   // le scoreboard du jour contient déjà les autres jours ; lecture datée seulement en dernier recours
  loadRank(t);
  try{ if(S.tab==='draw'||(S.tab==='home'&&tzPlaced().includes('bracket'))){ const ev=currentEvent(); if(ev&&!S.autoDraw[t+ev.id]){ S.autoDraw[t+ev.id]=1; loadDraw(t,ev); } } }catch(e){} }
// mise à jour automatique : toutes les 30 s s'il y a du direct ou un match imminent (le scoreboard pèse ~200 Ko), sinon toutes les 3 min
function hasLive(){ return allMatches(myTour()).some(m=>m.st==='in'||(m.st==='pre'&&Date.parse(m.t)-Date.now()<20*6e4&&Date.parse(m.t)-Date.now()>-3*36e5)); }
setInterval(()=>{ if(ui.sport!=='tennis'||document.hidden||S.tab==='rank') return; const c=S.cache.board[bKey(myTour(),0)], age=Date.now()-((c&&c.t)||0), live=hasLive();
  if((live&&age>30e3)||(!live&&age>18e4)) tennisRefresh(false); },10000);

/* ---------- 5. Données utiles aux écrans ---------- */
const boardEvents=(tour,off)=>((S.cache.board[bKey(tour,off)]||{}).ev)||[];
const isQual=m=>m.ri===0||/qualif/i.test(m.rd||'');   // qualifications : masquées par défaut (case « Qualifications » pour les afficher)
function allMatches(tour){ const out=[]; for(const k of Object.keys(S.draw)) if(k.startsWith(tour+':')) out.push(...Object.values(S.draw[k].ms||{}).filter(m=>S.qual||!isQual(m))); return out; }
// matchs d'un jour (jour de Paris) ; un match en cours compte pour aujourd'hui quelle que soit son heure de départ
const dayMs=(tour,off)=>allMatches(tour).filter(m=>m.st==='in'?off===0:!!Date.parse(m.t)&&parisDK(m.t)===dayKey(off));
function currentEvent(){ const evs=boardEvents(myTour(),0).filter(e=>e.ms.length||true); if(!evs.length) return null; return evs.find(e=>e.id===S.evSel)||evs.slice().sort((a,b)=>b.ms.length-a.ms.length)[0]; }
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]/g,'');
const RM=new WeakMap();
const rankOf=(tour,p)=>{ const rows=(S.cache.rank[tour]||{}).rows; if(!rows||!rows.length) return null; let M=RM.get(rows); if(!M){ M={id:new Map(),n:new Map()}; rows.forEach(r=>{ M.id.set(r.id,r); M.n.set(norm(r.n),r); }); RM.set(rows,M); } return M.id.get(p.id)||M.n.get(norm(p.n))||null; };
const rkTxt=p=>{ const r=rankOf(myTour(),p); return r?`#${r.rk}`:p.rk?`#${p.rk}`:p.sd?`(${p.sd})`:''; };
const isFav=p=>!!S.fav[p.id];
const ini=n=>String(n||'?').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();

/* ---------- 6. Affichage : éléments communs ---------- */
const star=p=>`<span class="tnst${isFav(p)?' on':''}" data-tn="fav" data-id="${esc(p.id)}" data-n="${esc(p.n)}" data-cc="${esc(p.cc)}" title="${isFav(p)?'Retirer de mes joueurs':'Ajouter à mes joueurs'}">${isFav(p)?'★':'☆'}</span>`;
function setLabel(m){ if(/suspend|delay|rain|interrupt/i.test(m.dsc)) return 'Interrompu'; const n=m.per||Math.max(m.a.sets.length,m.b.sets.length)||1; return n===1?'1er set':n+'e set'; }
function endNote(m){ return /retir|abandon/i.test(m.dsc)?' · abandon':/walkover|w\/o|forfait/i.test(m.dsc)?' · forfait':''; }
function setsHtml(m,p,q){ const live=m.st==='in', n=Math.max(p.sets.length,q.sets.length); let h='';
  for(let i=0;i<n;i++){ const x=p.sets[i], y=q.sets[i]; if(!x){ h+='<span></span>'; continue; } const cur=live&&i===n-1, won=y?x.g>y.g:true;
    const showTb=x.tb!=null&&(y&&y.tb!=null?x.tb<y.tb:!won); h+=`<span class="${cur?'cur':won?'w':''}">${x.g}${showTb?`<sup>${x.tb}</sup>`:''}</span>`; }
  if(live&&p.gm!=null) h+=`<span class="gm">${esc(p.gm)}</span>`; return h; }
function row(m,p,q){ const win=m.st==='post'&&p.w, live=m.st==='in';
  return `<div class="tnp"><div class="tnn${win?' win':''}"><span class="tnav">${esc(ini(p.n))}</span><b>${esc(p.s)}</b>${p.cc?`<span class="tncc">${esc(p.cc)}</span>`:''}${rkTxt(p)?`<span class="tnrk">${esc(rkTxt(p))}</span>`:''}${live&&p.sv?'<span class="tnsv" title="Au service"></span>':''}${star(p)}</div><div class="tns">${setsHtml(m,p,q)}</div></div>`; }
function card(m){ const fv=isFav(m.a)||isFav(m.b), head=`${esc(m.en||'')}${m.en&&m.rdf?' · ':''}${esc(m.rdf)}${m.ct?' · '+esc(m.ct):''}`;
  const pill=m.st==='in'?`<span class="tnpill"><i></i>${esc(setLabel(m))}</span>`:m.st==='post'?`<span class="tnpill fin">Terminé${esc(endNote(m))}</span>`:'';
  const ms=m.st==='post'?'':`<span class="tnst${isStar(m)?' on':''}" data-tn="mstar" data-id="${esc(m.id)}" title="${isStar(m)?'Ne plus recevoir les alertes de ce match':'Recevoir les alertes de ce match'}">${isStar(m)?'★':'☆'}</span>`;
  return `<div class="tnc${fv||isStar(m)?' fv':''}"><div class="tnh"><span>${head}</span><span style="display:flex;gap:6px;align-items:center;flex:none">${pill}${ms}</span></div>${row(m,m.a,m.b)}${row(m,m.b,m.a)}</div>`; }
function hero(title,sub,live,extra){ const t=myTour();
  return `<div class="mxhero"><div class="row between" style="gap:10px;align-items:center;flex-wrap:wrap"><div style="min-width:0"><h2 style="margin:0">${live?'<span class="livedot"></span>':''}${title}</h2><div class="mut" style="font-size:12px;margin-top:2px">${sub}</div></div>
    <div class="row" style="gap:6px;flex-wrap:nowrap"><button class="${t==='atp'?'':'sec '}fbtn" data-tn="tour" data-v="atp">ATP</button><button class="${t==='wta'?'':'sec '}fbtn" data-tn="tour" data-v="wta">WTA</button><label class="mut" style="font-size:12px;display:flex;align-items:center;gap:4px;margin-left:6px;white-space:nowrap;cursor:pointer"><input type="checkbox" data-tn="qual" ${S.qual?'checked':''}> Qualifications</label></div></div>${extra||''}</div>`; }
function status(k){ if(S.busy[k]&&!S.cache.board[k]) return '<div class="card"><p class="mut" style="margin:0">⏳ Chargement…</p></div>';
  if(S.err[k]&&!(S.cache.board[k])) return `<div class="card"><p class="err" style="margin:0 0 6px">⚠️ ESPN ne répond pas (${esc(S.err[k])}).</p><button class="sec" data-tn="refresh">Réessayer</button> <button class="sec" data-tn="diag">🔧 Diagnostic ESPN</button></div>`; return ''; }

/* ---------- 7. Écran « Aujourd'hui » ---------- */
function vToday(){ const t=myTour(), k=bKey(t,0);
  let ms=dayMs(t,S.day); if(S.mine) ms=ms.filter(m=>isFav(m.a)||isFav(m.b));
  const fvScore=m=>(isFav(m.a)||isFav(m.b))?0:1, byT=(a,b)=>fvScore(a)-fvScore(b)||(Date.parse(a.t)||0)-(Date.parse(b.t)||0);
  const live=ms.filter(m=>m.st==='in').sort(byT), pre=ms.filter(m=>m.st==='pre').sort((a,b)=>(Date.parse(a.t)||0)-(Date.parse(b.t)||0)||fvScore(a)-fvScore(b)), done=ms.filter(m=>m.st==='post').sort((a,b)=>fvScore(a)-fvScore(b)||(Date.parse(b.t)||0)-(Date.parse(a.t)||0));
  const dl=['Hier',"Aujourd'hui",'Demain'], dn=new Date(Date.now()+S.day*864e5).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'});
  const ex=`<div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap">${[-1,0,1].map(d=>`<button class="${S.day===d?'':'sec '}fbtn" data-tn="day" data-v="${d}">${dl[d+1]}</button>`).join('')}<button class="${S.mine?'':'sec '}fbtn" data-tn="mine">⭐ Mes joueurs</button><span class="mut" style="margin-left:auto;font-size:12px">${(S.cache.board[k]&&S.cache.board[k].t)?'mis à jour '+new Date(S.cache.board[k].t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):''} · <span class="link" data-tn="diag">🔧 Diagnostic ESPN</span></span></div>`;
  let h=hero('🎾 Tennis '+(S.day===0?'du jour':dl[S.day+1].toLowerCase()),esc(dn)+' · heure de Paris',live.length>0,ex)+(S.diag?diagHtml():'')+status(k)+(NT_OK&&!ntActive()?'<div class="card" style="padding:10px 14px"><div class="row between" style="gap:10px;align-items:center"><span style="font-size:13px">🔔 Alertes de matchs : début, jeux, breaks, sets, fin</span><button class="fbtn" data-tn="ntgo">Activer</button></div></div>':'');
  if(!ms.length&&!status(k)&&!S.busy[k]) h+=`<div class="card"><p class="mut" style="margin:0">${S.mine?`Le filtre « ⭐ Mes joueurs » est activé : aucun match de tes joueurs ce jour-là. Touche ☆ à côté d\'un joueur pour le suivre.${dayMs(t,S.day).length?` <button class="fbtn" style="margin-top:8px" data-tn="mine">Voir tous les matchs (${dayMs(t,S.day).length})</button>`:''}`:'Aucun match de simple ce jour-là. Pas de tournoi ou pas de données reçues : ouvre le <span class="link" data-tn="diag">diagnostic ESPN</span> pour vérifier.'}</p></div>`;
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
  const all=(D?Object.values(D.ms||{}):[]).filter(m=>S.qual||!isQual(m)), by={}; all.forEach(m=>{ (by[m.ri]||(by[m.ri]=[])).push(m); });
  const ris=Object.keys(by).map(Number).sort((a,b)=>a-b);
  const dateTxt=(ev.start?new Date(ev.start).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):'')+(ev.end?' – '+new Date(ev.end).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):'');
  let h=hero('🏆 '+esc(ev.sn||'Tournoi'),(past?'Dernier tournoi enregistré · ':'')+esc(dateTxt),all.some(m=>m.st==='in'),sel)+status(bKey(t,0))+`<div class="mut" style="font-size:12px;margin:-4px 4px 8px;text-align:right">${S.busy['d'+key]?'⏳ lecture des jours précédents…':`<span class="link" data-tn="drawdays" data-id="${esc(ev.id)}">↻ Compléter avec les jours précédents</span>`}</div>`;
  if(!all.length) return h+(S.busy['d'+key]?'<div class="card"><p class="mut" style="margin:0">⏳ Chargement du tableau…</p></div>':'<div class="card"><p class="mut" style="margin:0">Aucun match de simple trouvé pour ce tournoi (voir le diagnostic ESPN dans l\'onglet Aujourd\'hui).</p></div>');
  // parcours d'un joueur favori engagé dans le tournoi
  const fp=all.flatMap(m=>[m.a,m.b]).find(isFav);
  if(fp){ const rds=[...new Set(all.filter(m=>m.a.id===fp.id||m.b.id===fp.id).map(m=>m.ri))].sort((a,b)=>a-b), cell=r=>{ const mm=all.find(m=>m.ri===r&&(m.a.id===fp.id||m.b.id===fp.id)), nm=roundFr(mm?mm.rd:'')||'';
      const state=!mm?'':mm.st==='in'?' cur':mm.st==='post'?((mm.a.id===fp.id?mm.a:mm.b).w?' ok':' ko'):'';
      const sh=mm?({5:'Quart',6:'Demi',7:'Finale'}[mm.ri]||mm.rdf.replace(/ de finale$/,'')):nm;
      return `<span class="pc${state}">${esc(sh)}${state===' ok'?' ✓':state===' ko'?' ✗':state===' cur'?' · en cours':''}</span>`; };
    h+=`<div class="mxl">⭐ Parcours de ${esc(fp.s)}</div><div class="card" style="padding:10px 14px"><div class="tnparc">${rds.map(cell).join('')}</div></div>`; }
  h+=`<div class="row" style="gap:6px;margin:0 0 10px"><button class="${S.dmode==='list'?'sec ':''}fbtn" data-tn="dmode" data-v="tree">🌳 Arbre</button><button class="${S.dmode==='list'?'':'sec '}fbtn" data-tn="dmode" data-v="list">📋 Liste par tour</button></div>`;
  if(S.dmode!=='list') return h+`<div class="card" style="padding:12px">${bracketHtml(all)}</div>`;
  // tours : en cours d'abord, puis les suivants, puis les tours passés (repliés)
  const curRi=ris.find(r=>by[r].some(m=>m.st!=='post'))??ris[ris.length-1], later=ris.filter(r=>r>curRi), earlier=ris.filter(r=>r<curRi).reverse();
  const futureMissing=[5,6,7].filter(r=>r>Math.max(...ris));   // seulement quarts / demis / finale (les tours intermédiaires varient selon le tournoi)
  const FR={5:'Quarts de finale',6:'Demi-finales',7:'Finale'};
  const open=r=>S.open[key+':'+r]!==undefined?S.open[key+':'+r]:(r===curRi||r===later[0]);
  const sec=r=>{ const L=(by[r]||[]).slice().sort((a,b)=>(a.st==='in'?0:a.st==='pre'?1:2)-(b.st==='in'?0:b.st==='pre'?1:2)||(Date.parse(a.t)||0)-(Date.parse(b.t)||0)), n=L.length, nl=L.filter(m=>m.st==='in').length, nd=L.filter(m=>m.st==='post').length;
    const bdg=nl?`<span class="st live">${nl} en cours</span>`:nd===n?`<span class="st">${n} match${n>1?'s':''} · terminé${n>1?'s':''}</span>`:`<span class="st">${n-nd} à jouer</span>`, o=open(r);
    return `<div class="tnrd" data-tn="rd" data-v="${key}:${r}"><b>${esc(L[0]?L[0].rdf:'Tour')}</b>${bdg}<i>${o?'▾':'▸'}</i></div>`+(o?`<div class="tng">${L.map(mini).join('')}</div>`:''); };
  h+=[curRi,...later,...futureMissing.map(r=>'F'+r),...earlier].map(r=>typeof r==='string'?`<div class="tnrd"><b>${FR[+r.slice(1)]||'Tour'}</b><span class="st">à venir</span></div>`:sec(r)).join('');
  return h; }
function mini(m){ const fv=isFav(m.a)||isFav(m.b), L=(p,q)=>`<div class="ln"><span class="nm${m.st==='post'&&p.w?' w':''}">${esc(p.s)}${rkTxt(p)?`<small>${esc(rkTxt(p))}</small>`:''}${isFav(p)?' <span class="tnstar">★</span>':''}</span><span class="sc">${setsHtml(m,p,q)}</span></div>`;
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
  h+=ntCard();
  { const st=allMatches(t).filter(m=>isStar(m)&&m.st!=='post').sort((a,b)=>(Date.parse(a.t)||0)-(Date.parse(b.t)||0)); if(st.length) h+='<div class="mxl">★ Matchs choisis pour les alertes</div>'+st.map(card).join(''); }
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
  return `<div class="card tndiag"><div class="row between"><h2 style="margin:0">🔧 Diagnostic ESPN <span class="mut" style="font-size:12px;font-weight:400">· tennis.js v9</span></h2><button class="sec" data-tn="diagx">Fermer</button></div>
  <p class="mut" style="margin:8px 0">Pour vérifier ce qu'ESPN renvoie. « Télécharger un extrait » crée un petit fichier (quelques matchs) que tu peux joindre à ta réponse pour que j'ajuste la lecture. Tu peux aussi coller un JSON ci-dessous pour voir l'écran avec ces données.</p>
  <div class="row" style="gap:6px;flex-wrap:wrap"><button class="sec" data-tn="diagrun">Tester ${t.toUpperCase()}</button><button class="sec" data-tn="diagcopy" data-v="dboard">⬇ Télécharger un extrait du scoreboard</button><button class="sec" data-tn="diagcopy" data-v="drank">⬇ Télécharger un extrait du classement</button></div><div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px"><button class="sec" data-tn="diagcopy" data-v="sboard">Copier l'extrait du scoreboard</button><button class="sec" data-tn="diagcopy" data-v="srank">Copier l'extrait du classement</button></div>
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
async function diagCopy(kind){   // kind : sboard / srank (copier l'extrait) · dboard / drank (télécharger l'extrait en fichier)
  const t=myTour(), dl=kind[0]==='d', base=/board/.test(kind)?'board':'rank', u=base==='board'?SRC.board(t,''):SRC.rank(t)[0]; let txt='', err='';
  try{ const raw=await (await fetch(u,{cache:'no-store'})).text(); txt=JSON.stringify(sample(JSON.parse(raw),base),null,1); }catch(e){ err=e.message||String(e); }
  S.diag=S.diag||{};
  if(err){ S.diag.log='⚠️ Impossible de lire ESPN : '+err+'\n'+u; return redraw(); }
  if(dl){ download(`espn-tennis-${base==='board'?'scoreboard':'classement'}-${t}.json`,txt,'application/json'); S.diag.log=`✅ Fichier téléchargé (${txt.length} caractères). Joins-le simplement à ta réponse dans la conversation.\n`+u; return redraw(); }
  let ok=false; try{ await navigator.clipboard.writeText(txt); ok=true; }catch(e){ const a=document.createElement('textarea'); a.value=txt; document.body.appendChild(a); a.select(); try{ ok=document.execCommand('copy'); }catch(x){} a.remove(); }
  S.diag.log=(ok?`✅ Extrait copié (${txt.length} caractères). Va tout de suite dans la conversation et fais Ctrl+V (ne sélectionne pas ce message : ça remplacerait le contenu copié).`:'⚠️ Copie impossible : utilise plutôt « Télécharger ».')+'\n'+u; redraw(); }
function diagPaste(kind){ const el=document.getElementById('tnPaste'), txt=el?el.value:''; S.diag=S.diag||{}; S.diag.paste=txt; let js=null; try{ js=JSON.parse(txt); }catch(e){ S.diag.log='⚠️ Ce texte n\'est pas du JSON valide : '+e.message; return redraw(); }
  const t=myTour();
  if(kind==='board'){ const ev=parseBoard(js), n=ev.reduce((a,e)=>a+e.ms.length,0); S.diag.log=`Lu : ${ev.length} tournoi(s), ${n} match(s) de simple.`+(n?' Affichés ci-dessous (données collées, valables 10 min).':' Rien d\'exploitable : colle-moi ce JSON pour que j\'ajuste la lecture.'); if(n){ S.cache.board[bKey(t,0)]={t:Date.now(),ev}; mergeBoard(t,ev); S.pasteT=Date.now(); S.day=0; saveCache(); } }
  else { const rows=parseRank(js); S.diag.log=`Lu : ${rows.length} joueur(s) classé(s).`+(rows.length?' Enregistré comme classement '+t.toUpperCase()+'.':' Rien d\'exploitable : colle-moi ce JSON pour que j\'ajuste la lecture.'); if(rows.length){ S.cache.rank[t]={t:Date.now(),rows:rows.slice(0,200)}; saveCache(); } }
  redraw(); }


/* ---------- 11b. Notifications (ordinateur, navigateur ouvert) ---------- */
// Pour les joueurs suivis (☆) : début, chaque jeu (🔥 BREAK si le service est perdu), fin de set, fin de match.
// Fonctionne tant que Statify est ouvert (onglet ou appli, même réduit), quel que soit le sport affiché. Réglages propres à cet appareil (non synchronisés).
const NT0=jl(K.notif,{}), NT={on:!!NT0.on,snd:NT0.snd!==false,col:NT0.col!==false,big:NT0.big!==false,scope:['fav','pick'].includes(NT0.scope)?NT0.scope:'all',start:NT0.start!==false,game:NT0.game!==false,set:NT0.set!==false,end:NT0.end!==false};
const saveNt=()=>js_(K.notif,NT);
const NT_API=typeof Notification!=='undefined', NT_PHONE=!!(window.matchMedia&&matchMedia('(hover:none) and (pointer:coarse)').matches), NT_OK=NT_API&&!NT_PHONE;
const ntActive=()=>NT_OK&&NT.on&&Notification.permission==='granted';
// envoi : via le service worker quand il existe (plus fiable sous Windows/Chrome), sinon directement depuis la page ; NT.last garde le résultat du dernier essai
// son : joué par la page (une notification de navigateur ne peut pas jouer de son personnalisé) ; un son au plus toutes les 1,5 s
let ntAud=null, ntSndT=0;
const ntAudio=()=>ntAud||(ntAud=Object.assign(new Audio('tennis-ball.mp3'),{preload:'auto',volume:.8}));
function ntSound(force){ if(!force&&(!NT.snd||Date.now()-ntSndT<1500)) return; ntSndT=Date.now();
  const fail=e=>{ const n=e&&e.name; NT.lastSnd='son : '+(n==='NotAllowedError'?'bloqué par le navigateur (clique une fois dans la page Statify, puis réessaie)':n==='NotSupportedError'?'fichier tennis-ball.mp3 introuvable ou illisible (il doit être dans le même dossier que index.html)':(e&&e.message)||String(e)); if(ui.sport==='tennis') redraw(); };
  try{ const a=ntAudio(); a.currentTime=0; const p=a.play(); if(p&&p.then) p.then(()=>{ NT.lastSnd='son : ok'; if(force&&ui.sport==='tennis') redraw(); }).catch(fail); }catch(e){ fail(e); } }
// les navigateurs n'autorisent un son qu'après un clic dans la page : on « débloque » l'audio au premier clic
const ntUnlock=()=>{ document.removeEventListener('pointerdown',ntUnlock,true); document.removeEventListener('keydown',ntUnlock,true); try{ const a=ntAudio(), v=a.volume; a.volume=0; const p=a.play(); const done=()=>{ a.pause(); a.currentTime=0; a.volume=v; }; if(p&&p.then) p.then(done).catch(()=>{ a.volume=v; }); else done(); }catch(e){} };
document.addEventListener('pointerdown',ntUnlock,true); document.addEventListener('keydown',ntUnlock,true);
// bandeau coloré affiché dans la notification (une notification de navigateur n'accepte pas de fond coloré, mais bien une image) :
// dégradé selon le type d'alerte (début, jeu, break, set, victoire, défaite…) dessiné ici même, sans fichier à ajouter
function ntLook(title,body){
  const t=String(title||''), b=String(body||''), brk=/break/i.test(b);
  if(/^✅/.test(t)) return {c1:'#16a34a',c2:'#065f46',emo:'🏆',lab:'VICTOIRE'};
  if(/^❌/.test(t)) return {c1:'#dc2626',c2:'#7f1d1d',emo:'💔',lab:'DÉFAITE'};
  if(/^🏁/.test(t)) return {c1:'#f59e0b',c2:'#92400e',emo:'🏁',lab:'MATCH TERMINÉ'};
  if(/Début du match/i.test(b)) return {c1:'#2563eb',c2:'#1e3a8a',emo:'▶️',lab:'DÉBUT DU MATCH'};
  if(/set/i.test(b)&&/(remporte|terminé)/i.test(b)) return brk?{c1:'#f97316',c2:'#9a3412',emo:'🔥',lab:'BREAK DÉCISIF · SET'}:{c1:'#7c3aed',c2:'#4c1d95',emo:'✅',lab:'SET'};
  if(brk) return {c1:'#f97316',c2:'#b91c1c',emo:'🔥',lab:'BREAK !'};
  return {c1:'#0d9488',c2:'#134e4a',emo:'🎾',lab:'JEU'};
}
function ntBanner(title,body,full){
  try{ const L=ntLook(title,body), W=720, H=360, cv=document.createElement('canvas'); cv.width=W; cv.height=H; const x=cv.getContext('2d');
    const g=x.createLinearGradient(0,0,W,H); g.addColorStop(0,L.c1); g.addColorStop(1,L.c2); x.fillStyle=g; x.fillRect(0,0,W,H);
    x.fillStyle='rgba(255,255,255,.10)'; x.beginPath(); x.arc(W-70,-10,170,0,7); x.fill(); x.beginPath(); x.arc(40,H+30,120,0,7); x.fill();
    x.textBaseline='middle'; x.fillStyle='#fff'; x.font='110px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.fillText(L.emo,40,full?126:H/2-6);
    const fit=(txt,w,px,wt)=>{ let p=px; do{ x.font=wt+' '+p+'px "Segoe UI",Arial,sans-serif'; p-=2; }while(x.measureText(txt).width>w&&p>14); };
    x.shadowColor='rgba(0,0,0,.35)'; x.shadowBlur=8; fit(L.lab,W-190-24,60,800); x.fillText(L.lab,185,full?96:H/2-40);
    x.shadowBlur=0; x.fillStyle='rgba(255,255,255,.92)'; const sub=String(title||'').replace(/^[^\p{L}\d]+/u,'').split(' · ')[0];
    if(!full){ fit(sub,W-185-24,36,600); x.fillText(sub,185,H/2+30); }
    else{ // tout dans le bandeau : joueurs en haut, détail (score…) sur 2 lignes dessous
      fit(sub,W-185-24,34,700); x.fillText(sub,185,152);
      const det=String(body||'').replace(/^[^\p{L}\d]+/u,'').replace(/^BREAK ! /i,'').replace(/^Break décisif · /i,''); x.font='600 26px "Segoe UI",Arial,sans-serif'; x.fillStyle='#fff';
      const words=det.split(' '), ln=[]; let cur=''; for(const w of words){ const t=cur?cur+' '+w:w; if(x.measureText(t).width>W-60&&cur){ ln.push(cur); cur=w; } else cur=t; } if(cur) ln.push(cur);
      ln.slice(0,3).forEach((t,i)=>x.fillText(t,30,226+i*34)); }
    return cv.toDataURL('image/png'); }catch(e){ return ''; } }
const NTS={send(title,body,tag){ ntSound(); const o={body,tag,icon:'icon-192.png'}; if(NT.col){ const im=ntBanner(title,body,NT.big); if(im){ o.image=im; if(NT.big){ o.body=''; title='🎾 Tennis'; } } }
  const direct=()=>{ try{ const n=new Notification(title,{body:o.body,tag,image:o.image}); n.onclick=()=>{ try{ window.focus(); }catch(e){} n.close(); }; NT.last='ok (page)'; }catch(e){ NT.last='erreur : '+(e.message||e); } };
  try{ if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(r=>{ if(r&&r.active&&r.showNotification) return r.showNotification(title,o).then(()=>{ NT.last='ok (service worker)'; }); direct(); }).catch(direct); else direct(); }catch(e){ direct(); } }};
let ntSeq=0;
const sumG=a=>a.reduce((s,x)=>s+x,0), ntOther=s=>s==='a'?'b':s==='b'?'a':'';
const setDone=(x,y)=>{ const hi=Math.max(x,y), lo=Math.min(x,y); return (hi>=6&&hi-lo>=2)||(hi===7&&lo>=5); };
const ordSet=n=>n===1?'1er set':n+'e set';
const ntSnap=m=>({t:Date.now(),st:m.st,a:m.a.sets.map(s=>s.g),b:m.b.sets.map(s=>s.g),sv:m.a.sv?'a':m.b.sv?'b':''});
// compare deux lectures successives d'un match (p = avant, c = maintenant) ; renvoie les alertes et le serveur probable du prochain jeu
function ntEvents(m,p,c){
  const me=(S.fav[m.b.id]&&!S.fav[m.a.id])?'b':'a', op=ntOther(me), X=m[me], Y=m[op], ev=[], g=(arr,i)=>arr[i]||0;
  const pa=p?p.a:[], pb=p?p.b:[], ca=c.a, cb=c.b, n=Math.max(ca.length,cb.length);
  const mineA=me==='a'?ca:cb, oppA=me==='a'?cb:ca, ttl=`🎾 ${X.s} – ${Y.s}${NT.scope!=='fav'&&(m.ct||m.en)?' · '+(m.ct||m.en):''}`, ctx=[m.en,m.rdf].filter(Boolean).join(' · ');
  const scAll=side=>{ const u=side==='a'?ca:cb, v=side==='a'?cb:ca; return u.map((x,i)=>x+'-'+g(v,i)).join(' '); };
  const won=(upTo)=>{ let a=0,b=0; for(let i=0;i<=upTo;i++){ if(!setDone(g(mineA,i),g(oppA,i))&&i>=n-1&&c.st!=='post') continue; if(g(mineA,i)>g(oppA,i)) a++; else if(g(oppA,i)>g(mineA,i)) b++; } return [a,b]; };
  if((!p&&c.st==='in'&&sumG(ca)+sumG(cb)===0)||(p&&p.st==='pre'&&c.st==='in'))
    ev.push({k:'start',title:ttl,body:`▶️ Début du match${ctx?' · '+ctx:''}${m.ct?' · '+m.ct:''}`});
  if(!p) return {ev,nx:''};
  let nx=p.nx||'';
  if(c.st==='post'&&p.st!=='post'){
    let sa=0,sb=0; for(let i=0;i<n;i++){ if(g(ca,i)>g(cb,i)) sa++; else if(g(cb,i)>g(ca,i)) sb++; }
    const w=m.a.w?'a':m.b.w?'b':sa>sb?'a':sb>sa?'b':'', W=w?m[w]:X, L=w?m[ntOther(w)]:Y, both=S.fav[m.a.id]&&S.fav[m.b.id];
    const head=both||!w?'🏁':(w===me?'✅':'❌');
    ev.push({k:'end',title:`${head} ${W.s} bat ${L.s}`,body:`${w?scAll(w):scAll('a')}${endNote(m)}${ctx?' · '+ctx:''}`});
  }
  const d=sumG(ca)+sumG(cb)-(sumG(pa)+sumG(pb));
  if(p.st==='in'&&c.st==='in'&&d>0){
    const ch=[]; for(let i=0;i<n;i++) if(g(ca,i)!==g(pa,i)||g(cb,i)!==g(pb,i)) ch.push(i);
    const srv=p.sv||p.nx||''; nx=srv?(d%2?ntOther(srv):srv):'';
    if(d===1&&ch.length===1){
      const i=ch[0], w=g(ca,i)>g(pa,i)?'a':'b', W=m[w], tbk=(g(ca,i)===7&&g(cb,i)===6)||(g(ca,i)===6&&g(cb,i)===7), brk=!!srv&&!tbk&&srv!==w;
      const wm=w===me?mineA:oppA, wo=w===me?oppA:mineA;
      if(setDone(g(ca,i),g(cb,i))){
        const [x,y]=won(i), lead=x>y?X:Y, hi=Math.max(x,y), lo=Math.min(x,y);
        ev.push({k:'set',title:ttl,body:`${brk?'🔥 Break décisif · ':'✅ '}${W.s} remporte le ${ordSet(i+1)} ${g(wm,i)}-${g(wo,i)}${tbk?' (tie-break)':''} · ${x===y?x+' set partout':lead.s+' mène '+hi+' set'+(hi>1?'s':'')+' à '+lo}`});
      } else {
        const [x,y]=i>0?won(i-1):[0,0];
        ev.push({k:'game',title:ttl,body:`${brk?'🔥 BREAK ! ':''}Jeu ${W.s}${!brk&&srv?' (service tenu)':''} · ${ordSet(i+1)} : ${g(mineA,i)}-${g(oppA,i)}${i>0?` · sets ${x}-${y}`:''}`});
      }
    } else {
      const fin=ch.some(i=>setDone(g(ca,i),g(cb,i))||i<n-1);
      ev.push({k:fin?'set':'game',title:ttl,body:`${fin?'✅ Set terminé · ':`${d} jeux · `}${scAll(me)}`});
    }
  }
  return {ev,nx};
}
const ntWanted=m=>NT.scope==='all'||isStar(m)||(NT.scope==='fav'&&!!(S.fav[m.a.id]||S.fav[m.b.id]));
function ntScan(tour,evs){
  if(!ntActive()) return; if(NT.scope!=='all'&&!Object.keys(S.starM).length&&(NT.scope==='pick'||!Object.keys(S.fav).length)){ NT.stat={t:Date.now(),n:0}; return; }
  const snap=jl(K.snap,{}), now=Date.now(), out=[]; let watched=0;   // relue à chaque fois : deux onglets ouverts n'envoient pas l'alerte en double
  for(const k of Object.keys(snap)) if(now-snap[k].t>36*36e5) delete snap[k];
  for(const e of evs) for(const m of e.ms){ if(!ntWanted(m)) continue; if(m.st!=='post') watched++;
    const p=snap[m.id], c=ntSnap(m); let r={ev:[],nx:''}; try{ r=ntEvents(m,p,c); }catch(x){}
    c.nx=r.nx; snap[m.id]=c;
    for(const x of r.ev){ const k=x.k==='set'&&!NT.set&&NT.game?'game':x.k; if(NT[k]) out.push({m,x}); } }
  js_(K.snap,snap); NT.stat={t:now,n:watched};
  for(const o of out.slice(-12)) NTS.send(o.x.title,o.x.body,'tn-'+o.m.id+'-'+(++ntSeq));
}
const favTours=()=>NT.scope==='all'?['atp','wta']:[...new Set([...(NT.scope==='fav'?Object.values(S.fav):[]),...Object.values(S.starM)].map(f=>f.tr==='wta'?'wta':'atp'))];
function favBusy(tour){ const now=Date.now(); return allMatches(tour).some(m=>ntWanted(m)&&(m.st==='in'||(m.st==='pre'&&Date.parse(m.t)-now<25*6e4&&Date.parse(m.t)-now>-3*36e5))); }
// lecture en arrière-plan : toutes les 30 s s'il y a un match d'un joueur suivi en cours ou imminent, sinon toutes les 3 min (même si l'onglet est réduit)
function ntPoll(force){ if(!ntActive()) return; for(const t of favTours()){ const c=S.cache.board[bKey(t,0)], age=Date.now()-((c&&c.t)||0); if(force===true||(favBusy(t)&&age>28e3)||age>18e4) loadBoard(t,0,true); } }
setInterval(ntPoll,10000);
function ntToggle(){
  if(NT.on&&Notification.permission==='granted'){ NT.on=false; saveNt(); return render(); }
  Promise.resolve(Notification.requestPermission()).then(r=>{ NT.on=r==='granted'; saveNt(); if(NT.on){ js_(K.snap,{}); ntPoll(true); } render(); }).catch(()=>render()); }
function ntCard(){ if(!NT_OK) return `<div class="card"><h2 style="margin:0">🔔 Notifications</h2><p class="mut" style="margin:8px 0 0;font-size:13px">${NT_PHONE?'Les notifications tennis sont réservées à l\'ordinateur : ouvre Statify sur ton PC pour les activer.':'Ce navigateur ne gère pas les notifications : essaie avec Chrome, Edge ou Firefox sur ordinateur.'}</p></div>`;
  const perm=Notification.permission, on=NT.on&&perm==='granted', opt=(k,l)=>`<button class="${NT[k]?'':'sec '}fbtn" data-tn="ntopt" data-v="${k}">${NT[k]?'✓ ':''}${l}</button>`;
  const txt=perm==='denied'?'Les notifications sont bloquées pour ce site : autorise-les dans les réglages du navigateur (cadenas à côté de l\'adresse), puis réactive-les ici.'
    :!on?'Reçois une alerte pour les matchs en direct : début du match, chaque jeu (🔥 BREAK quand le service est perdu), chaque set et fin du match. Uniquement sur cet ordinateur.'
      :NT.scope==='pick'&&!Object.keys(S.starM).length?'Touche ☆ en haut à droite d\'un match (onglet Aujourd\'hui) pour choisir ceux dont tu veux les alertes.'
      :NT.scope==='fav'&&!Object.keys(S.fav).length&&!Object.keys(S.starM).length?'Suis au moins un joueur avec ☆, ou étoile un match, pour recevoir des alertes.'
    :'Actives tant que Statify reste ouvert (onglet ou application, même réduit, quel que soit le sport affiché). Le 🔥 BREAK apparaît quand ESPN indique qui sert.';
  return `<div class="card"><div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center"><h2 style="margin:0">🔔 Notifications sur cet ordinateur</h2><button class="${on?'':'sec '}fbtn" data-tn="nton">${on?'Activées':'Activer'}</button></div>
    <p class="mut" style="margin:8px 0 0;font-size:13px">${txt}</p>${on?`<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><button class="${NT.scope==='all'?'':'sec '}fbtn" data-tn="ntscope" data-v="all">Tous les matchs en direct</button><button class="${NT.scope==='fav'?'':'sec '}fbtn" data-tn="ntscope" data-v="fav">Mes joueurs + matchs ★</button><button class="${NT.scope==='pick'?'':'sec '}fbtn" data-tn="ntscope" data-v="pick">Matchs ★ seulement</button></div><div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">${opt('start','Début')}${opt('game','Chaque jeu')}${opt('set','Chaque set')}${opt('end','Fin du match')}<button class="${NT.snd?'':'sec '}fbtn" data-tn="ntopt" data-v="snd">${NT.snd?'🔊 Son':'🔇 Son'}</button><button class="${NT.col?'':'sec '}fbtn" data-tn="ntopt" data-v="col">${NT.col?'🎨 Couleurs':'⬜ Couleurs'}</button><button class="${NT.big&&NT.col?'':'sec '}fbtn" data-tn="ntopt" data-v="big" title="Tout le texte dans le bandeau coloré ; la partie grise ne garde qu'un titre">🖼️ Tout dans le bandeau</button><button class="sec fbtn" data-tn="ntsnd">Tester le son</button><button class="sec fbtn" data-tn="nttest">Tester la notification</button></div>${NT.stat?`<p class="mut" style="margin:8px 0 0;font-size:12px">Surveillance : ${NT.stat.n} match${NT.stat.n>1?'s':''} · dernière lecture d\'ESPN à ${new Date(NT.stat.t).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris'})}</p>`:'<p class="mut" style="margin:8px 0 0;font-size:12px">Surveillance : pas encore de lecture depuis l\'ouverture de la page.</p>'}${NT.lastSnd?`<p class="mut" style="margin:8px 0 0;font-size:12px">${esc(NT.lastSnd)}</p>`:''}${NT.last?`<p class="mut" style="margin:8px 0 0;font-size:12px">Dernier essai : ${esc(NT.last)}. Si rien n'apparaît à l'écran alors que c'est « ok » : Windows → Paramètres → Système → Notifications → active ton navigateur et coupe « Ne pas déranger » / « Assistant de concentration » ; sur Mac : Réglages → Notifications → ton navigateur.</p>`:''}`:''}</div>`; }

/* ---------- 12. Affichage principal + clics ---------- */


/* ---------- Tableau en arbre (branches) + Accueil tennis en zones libres ---------- */
function bracketHtml(all){
  if(!all.length) return '<p class="mut" style="margin:0">Aucun match.</p>';
  const byR={}; all.forEach(m=>(byR[m.ri]||(byR[m.ri]=[])).push(m));
  const ris=Object.keys(byR).map(Number).sort((a,b)=>a-b), win=m=>m.st==='post'?(m.a.w?m.a:m.b.w?m.b:null):null;
  const kids=new Map(), used=new Set();
  for(let i=1;i<ris.length;i++) for(const m of byR[ris[i]]){ const ks=[];
    for(const p of [m.a,m.b]){ const km=byR[ris[i-1]].find(x=>!used.has(x.id)&&win(x)&&win(x).id===p.id); if(km){ ks.push(km); used.add(km.id); } }
    if(ks.length) kids.set(m.id,ks); }
  const byT=(a,b)=>(Date.parse(a.t)||0)-(Date.parse(b.t)||0);
  const roots=all.filter(m=>!used.has(m.id)).sort((a,b)=>b.ri-a.ri||byT(a,b));
  const trees=roots.filter(m=>kids.has(m.id)), leaves=roots.filter(m=>!kids.has(m.id));
  const node=m=>{ const ks=kids.get(m.id)||[]; return `<div class="bn">${ks.length?`<div class="bk">${ks.map(node).join('')}</div>`:''}<div class="bm${ks.length?' hk':''}"><div class="brl">${esc(m.rdf)}</div>${mini(m)}</div></div>`; };
  let h=trees.length?`<div class="brk">${trees.map(m=>`<div class="broot">${node(m)}</div>`).join('')}</div>`:'';
  if(leaves.length){ const g={}; leaves.forEach(m=>(g[m.rdf]||(g[m.rdf]=[])).push(m));
    h+=(trees.length?'<div class="mxl" style="margin-top:12px">Autres matchs (l\'arbre se dessine au fil des tours)</div>':'<div class="mut" style="font-size:12px;margin:0 0 8px">Les branches se dessinent au fil des tours : pour l\'instant, les matchs sont listés par tour.</div>')
      +Object.keys(g).map(r=>`<div class="mut" style="font-weight:700;font-size:12px;margin:8px 0 4px">${esc(r)}</div><div class="tng">${g[r].sort(byT).map(mini).join('')}</div>`).join(''); }
  return h; }
function drawOf(t){ let ev=currentEvent(), key=ev?t+':'+ev.id:'', D=key&&S.draw[key], past=false;
  if(!ev){ const ks=Object.keys(S.draw).filter(k=>k.startsWith(t+':')).sort((a,b)=>(S.draw[b].t||0)-(S.draw[a].t||0)); if(ks.length){ key=ks[0]; D=S.draw[key]; ev={id:key.split(':')[1],sn:D.n,start:D.start,end:D.end}; past=true; } }
  return {ev,key,D,past,all:(D?Object.values(D.ms||{}):[]).filter(m=>S.qual||!isQual(m))}; }
const TZ=['L','C','R'], TZN={L:'Colonne gauche',C:'Centre',R:'Colonne droite'}, KZ='suivi-tennis-zones';
const tmv=r=>r.pv==null?'<span class="mv eq">·</span>':r.pv>r.rk?`<span class="mv up">▲${r.pv-r.rk}</span>`:r.pv<r.rk?`<span class="mv dn">▼${r.rk-r.pv}</span>`:'<span class="mv eq">=</span>';
const TB_LABEL={cotes:'💶 Cotes & combinés (cotes basses)',lrank:'🌍 Classement ATP en direct (flèches)',live:'🔴 En direct',today:"⏰ À venir aujourd'hui",results:'🏁 Résultats récents',mine:'⭐ Mes joueurs',bracket:'🌳 Tableau du tournoi (arbre)',rank:'📊 Classement (ESPN)',stats:'📈 Faits marquants (Stats ATP)'};
const TSIZE=['today','results','rank','lrank'];
let tz=jl(KZ,null);
const tzDefault=()=>({L:['mine','lrank'],C:['live','today','bracket'],R:['results','stats'],n:{}});
function tzInit(){ if(!tz||!tz.L||!tz.C||!tz.R) tz=tzDefault(); if(!tz.n) tz.n={}; }
const tzSave=()=>js_(KZ,tz);
function tzPlaced(){ tzInit(); return [...tz.L,...tz.C,...tz.R]; }
const tzSizeLbl=id=>{ const all=tz.n[id]==='all'; return id==='rank'||id==='lrank'?(all?'📏 Top 50':'📏 Top 10'):(all?'📏 Tout':'📏 Top 8'); };
function tzBlock(id){ const t=myTour(), ms=allMatches(t), all=tz.n[id]==='all';
  const byT=(a,b)=>(Date.parse(a.t)||0)-(Date.parse(b.t)||0);
  const list=(L,empty)=>L.length?`<div class="tng tzg">${L.map(mini).join('')}</div>`:`<p class="mut" style="margin:0">${empty}</p>`;
  const box=(title,body)=>`<div class="card tzcard"><h2>${title}</h2>${body}</div>`;
  if(id==='live'){ const L=ms.filter(m=>m.st==='in'); return box((L.length?'<span class="livedot"></span> ':'🔴 ')+'En direct',list(L,'Aucun match en cours.')); }
  if(id==='today'){ const L=dayMs(t,0).filter(m=>m.st==='pre').sort(byT); return box("⏰ À venir aujourd'hui",list(L.slice(0,all?999:8),"Plus de match à venir aujourd'hui.")); }
  if(id==='results'){ const L=ms.filter(m=>m.st==='post').sort((a,b)=>byT(b,a)); return box('🏁 Résultats récents',list(L.slice(0,all?999:8),'Aucun résultat pour le moment.')); }
  if(id==='mine'){ const ids=Object.keys(S.fav); if(!ids.length) return box('⭐ Mes joueurs','<p class="mut" style="margin:0">Touche ☆ à côté d\'un joueur pour le suivre.</p>');
    const seen=new Set(), L=[]; for(const f of ids){ const mm=ms.filter(m=>m.a.id===f||m.b.id===f), pick=mm.find(m=>m.st==='in')||mm.filter(m=>m.st==='pre').sort(byT)[0]||mm.filter(m=>m.st==='post').sort((a,b)=>byT(b,a))[0]; if(pick&&!seen.has(pick.id)){ seen.add(pick.id); L.push(pick); } }
    return box('⭐ Mes joueurs',list(L,'Aucun match récent de tes joueurs.')); }
  if(id==='bracket'){ const d=drawOf(t); if(!d.ev) return box('🌳 Tableau du tournoi','<p class="mut" style="margin:0">Aucun tournoi en cours aujourd\'hui.</p>'); return box('🌳 '+esc(d.ev.sn||'Tournoi'),bracketHtml(d.all)); }
  if(id==='rank'){ const R=S.cache.rank[t]; if(!R) return box('📊 Classement '+t.toUpperCase(),'<p class="mut" style="margin:0">Classement en chargement…</p>');
    const rows=R.rows.slice(0,all?50:10).map(r=>`<div class="rr${S.fav[r.id]?' fv':''}"><span class="rk">${r.rk}</span>${tmv(r)}<div class="rt"><b>${esc(r.n)}</b></div><b class="rp">${r.pts!=null?r.pts.toLocaleString('fr-FR'):'–'}</b></div>`).join('');
    return box('📊 Classement '+t.toUpperCase(),rows); }
  if(id==='cotes'){ const T=window.__tennis, E=T&&T.etat(), d0=new Date(), iso=d0.getFullYear()+'-'+String(d0.getMonth()+1).padStart(2,'0')+'-'+String(d0.getDate()).padStart(2,'0');
    const gv=(k,d)=>{ try{ const v=parseFloat(localStorage.getItem(k)); return v>0?v:d; }catch(e){ return d; } }, seuil=gv('suivi-tennis-seuil',1.5), mise=gv('suivi-tennis-mise',1), f2=n=>(+n).toFixed(2).replace('.',',');
    const ctl=`<div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:8px;font-size:12px"><label>Cote du favori ≤ <input type="number" step="0.05" min="1" value="${seuil}" data-cote="seuil" style="width:64px"></label><label>Mise <input type="number" step="0.5" min="0.5" value="${mise}" data-cote="mise" style="width:64px"> €</label></div>`;
    if(!E||!E.robot||!E.robot.url) return box('💶 Cotes & combinés',`<p class="mut" style="margin:0">Les cotes viennent de ton robot (Tennis Explorer). Renseigne-le dans l'onglet Stats ATP.</p>`);
    const D=E.days&&E.days[iso];
    if(!D&&!S.cotesT&&window.tennisCharger){ S.cotesT=1; E.jour=iso; Promise.resolve(window.tennisCharger(false)).then(()=>{ try{ window.tennisRender&&window.tennisRender(); }catch(e){} }); }
    if(!D||!(D.matchs||[]).length) return box('💶 Cotes & combinés',ctl+`<p class="mut" style="margin:0">${D?'Aucun match avec cotes aujourd’hui.':'Chargement des cotes…'}</p>`);
    const ok=(D.matchs||[]).filter(m=>m.w!==1&&m.w!==2&&+m.c1>1&&+m.c2>1).map(m=>{ const n=m.c1<=m.c2?1:2; return {m,n,fav:n===1?m.j1:m.j2,c:n===1?+m.c1:+m.c2}; }).sort((a,b)=>a.c-b.c);
    const bas=ok.filter(x=>x.c<=seuil).slice(0,12);
    const rows=ok.slice(0,12).map(x=>`<div class="rr${x.c<=seuil?'':' mut'}"><span class="rk">${esc(x.m.heure||'')}</span><div class="rt"><b>${esc(x.fav)}</b> <span class="mut">vs ${esc(x.n===1?x.m.j2:x.m.j1)} · ${esc(x.m.tournoi||'')}</span></div><b class="rp">${f2(x.c)}</b></div>`).join('');
    const P=[]; for(let i=0;i<bas.length;i++) for(let j=i+1;j<bas.length;j++) P.push({a:bas[i],b:bas[j],c:bas[i].c*bas[j].c});
    P.sort((a,b)=>a.c-b.c); const top=P.slice(0,8);
    const combos=top.length?top.map((p,i)=>`<div class="rr"><div class="rt"><b>${esc(p.a.fav)}</b> + <b>${esc(p.b.fav)}</b></div><b class="rp">${f2(p.c)}</b><span class="mv up" title="gain net pour ${f2(mise)} €">+${f2((p.c-1)*mise)} €</span><button class="sec" data-tn="cpcombo" data-i="${i}" title="Copier pour PronoTracker">📋</button></div>`).join(''):`<p class="mut" style="margin:6px 0 0">${bas.length<2?'Moins de 2 matchs sous '+f2(seuil)+' : monte le seuil pour voir des combinés.':''}</p>`;
    S._cb=top.map(p=>[p.a,p.b].map(x=>`${iso} | ${x.m.j1} vs ${x.m.j2} | ${x.m.tournoi||'Tennis'} | Vainqueur du match | ${x.fav} | ${mise} | ${x.c}`).join('\n'));
    return box('💶 Cotes & combinés (cotes basses)',ctl+rows+`<h3 style="font-size:12px;margin:10px 0 4px">Combinés de 2 matchs (du plus bas au plus haut)</h3>`+combos+`<div class="mut" style="font-size:11px;margin-top:6px">Cotes Tennis Explorer · aujourd’hui · ${ok.length} match(s) avec cotes</div>`); }
  if(id==='lrank'){ const T=window.__tennis, C=T&&T.etat().cl, cfg=T&&T.etat().robot&&T.etat().robot.url;
    if(C&&!C.l.length&&cfg&&!S.lrT&&window.tennisClassement){ S.lrT=1; Promise.resolve(window.tennisClassement(false)).then(()=>{ try{ window.tennisRender&&window.tennisRender(); }catch(e){} }); }
    if(!C||!C.l.length) return box('🌍 Classement ATP en direct',`<p class="mut" style="margin:0">${cfg?'Chargement du classement en direct…':'Classement live indisponible : renseigne le robot (réglage en bas de l’onglet Stats ATP). Classement ESPN avec flèches disponible via le bloc « Classement (ESPN) ».'}</p>`);
    const rows=C.l.slice(0,all?50:10).map(x=>`<div class="rr"><span class="rk">${esc(x.rang)}</span>${x.variation?`<span class="mv ${x.variation>0?'up':'dn'}">${x.variation>0?'▲'+x.variation:'▼'+Math.abs(x.variation)}</span>`:'<span class="mv eq">=</span>'}<div class="rt"><b>${esc(x.nom)}</b>${x.resultat?`<div class="mut" style="font-size:11px">${esc(x.resultat)}</div>`:''}</div><b class="rp">${x.points!=null?esc(x.points):'–'}</b></div>`).join('');
    return box('🌍 Classement ATP en direct',rows+`<div class="mut" style="font-size:11px;margin-top:6px">Points en direct · live-tennis.eu${C.maj?' · lu à '+new Date(C.maj).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</div>`); }
  if(id==='stats'){ const J=window.__tennisJoueurs, T=window.__tennis; return box('📈 Faits marquants',J&&T?J.faitsHtml(T.filtrer(),'rgba(128,128,128,.32)'):'<p class="mut" style="margin:0">Stats indisponibles.</p>'); }
  return ''; }
function tzRender(){ tzInit(); const edit=!!S.tzEdit, Z={};
  for(const z of TZ) Z[z]=tz[z].map(id=>{ let b=''; try{ b=tzBlock(id); }catch(e){ b=''; } if(!b&&!edit) return '';
    return `<div class="tb" data-tb="${id}"${edit?' draggable="true"':''}>${edit?`<div class="hbbar"><span>⠿ ${esc(TB_LABEL[id]||id)}</span><span>${TSIZE.includes(id)?`<button class="sec" data-tn="tzsize" data-id="${id}">${tzSizeLbl(id)}</button>`:''}<button class="sec" data-tn="tzgo" data-id="${id}" data-d="-1" title="Zone précédente">◀</button><button class="sec" data-tn="tzgo" data-id="${id}" data-d="1" title="Zone suivante">▶</button><button class="sec" data-tn="tzdel" data-id="${id}" title="Retirer">✕</button></span></div>`:''}${b||'<p class="mut">(rien à afficher pour l\'instant)</p>'}</div>`; }).join('');
  const hl=edit||Z.L, hr=edit||Z.R;
  return `<div class="tz${edit?' edit':''}${hl?' hasl':''}${hr?' hasr':''}">${TZ.map(z=>`<div class="tzc${z==='C'?'':' rail'}" data-zone="${z}" data-label="${TZN[z]}">${Z[z]}</div>`).join('')}</div>`; }
function tzEditor(){ tzInit(); const cat=Object.keys(TB_LABEL).filter(id=>!tzPlaced().includes(id));
  const row=(z,id,i)=>`<div class="row hrow"><span style="flex:1">${esc(TB_LABEL[id])}</span>${TSIZE.includes(id)?`<button class="sec" data-tn="tzsize" data-id="${id}">${tzSizeLbl(id)}</button>`:''}<button class="sec" data-tn="tzgo" data-id="${id}" data-d="-1" ${z==='L'?'disabled':''}>◀</button><button class="sec" data-tn="tzmv" data-id="${id}" data-d="-1" ${i===0?'disabled':''}>▲</button><button class="sec" data-tn="tzmv" data-id="${id}" data-d="1" ${i===tz[z].length-1?'disabled':''}>▼</button><button class="sec" data-tn="tzgo" data-id="${id}" data-d="1" ${z==='R'?'disabled':''}>▶</button><button class="sec" data-tn="tzdel" data-id="${id}">✕</button></div>`;
  return `<div class="card"><h2>Personnaliser l'accueil tennis</h2><p class="mut">Glisse les blocs <b>directement sur la page</b> (poignée ⠿) vers la colonne gauche, le centre ou la colonne droite, ou utilise ◀ ▶ ▲ ▼. ✕ retire un bloc.</p>${TZ.map(z=>`<h3 style="margin:12px 0 4px">${TZN[z]}</h3>${tz[z].map((id,i)=>row(z,id,i)).join('')||'<p class="mut" style="margin:0">Vide.</p>'}`).join('')}<h3 style="margin:14px 0 4px">Ajouter un bloc</h3>${cat.length?`<div class="row"><select id="tzAddSel">${cat.map(id=>`<option value="${id}">${esc(TB_LABEL[id])}</option>`).join('')}</select><select id="tzAddZone"><option value="C">au centre</option><option value="L">colonne gauche</option><option value="R">colonne droite</option></select><button class="sec" data-tn="tzadd">Ajouter</button></div>`:'<p class="mut" style="margin:0">Tous les blocs sont placés.</p>'}<div class="row" style="margin-top:10px"><button data-tn="tzedit">Terminé</button><button class="sec" data-tn="tzreset">Tout réinitialiser</button></div></div>`; }
function vHome(){ const t=myTour(), k=bKey(t,0), live=allMatches(t).some(m=>m.st==='in');
  const ex=`<div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap"><button class="sec fbtn" data-tn="tzedit">⚙ Personnaliser</button><span class="mut" style="margin-left:auto;font-size:12px">${(S.cache.board[k]&&S.cache.board[k].t)?'mis à jour '+new Date(S.cache.board[k].t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</span></div>`;
  return hero('🎾 Accueil tennis',esc(new Date().toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'}))+' · heure de Paris',live,ex)+status(k)+(S.tzEdit?tzEditor():'')+tzRender(); }
(function(){ let dragId=null;
  const clean=()=>document.querySelectorAll('.hbover,.hbdrag,.hcover').forEach(x=>x.classList.remove('hbover','hbafter','hbdrag','hcover'));
  const blk=e=>e.target&&e.target.closest?e.target.closest('.tz.edit .tb'):null, zon=e=>e.target&&e.target.closest?e.target.closest('.tz.edit .tzc'):null;
  const after=(e,b)=>{ const r=b.getBoundingClientRect(); return e.clientY>r.top+r.height/2; };
  document.addEventListener('dragstart',e=>{ const b=blk(e); if(!b) return; dragId=b.dataset.tb; b.classList.add('hbdrag'); try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',dragId); }catch(_){} });
  document.addEventListener('dragover',e=>{ if(!dragId) return; const b=blk(e), c=zon(e);
    if(b&&b.dataset.tb!==dragId){ e.preventDefault(); clean(); b.classList.add('hbover'); b.classList.toggle('hbafter',after(e,b)); }
    else if(!b&&c){ e.preventDefault(); clean(); c.classList.add('hcover'); } });
  document.addEventListener('drop',e=>{ if(!dragId) return; const b=blk(e), c=zon(e);
    if((b&&b.dataset.tb===dragId)||(!b&&!c)){ clean(); dragId=null; return; }
    e.preventDefault(); tzInit(); for(const z of TZ) tz[z]=tz[z].filter(i=>i!==dragId);
    if(b){ const z=b.closest('.tzc').dataset.zone, k=tz[z].indexOf(b.dataset.tb); tz[z].splice(k+(after(e,b)?1:0),0,dragId); } else tz[c.dataset.zone].push(dragId);
    tzSave(); dragId=null; clean(); render(); });
  document.addEventListener('dragend',()=>{ dragId=null; clean(); });
})();
const TABS=[['home','🏠','Accueil'],['today','📅',"Aujourd'hui"],['draw','🏆','Tableau'],['rank','📊','Classement'],['mine','⭐','Mes joueurs'],['stats','📈','Stats ATP']];
window.tennisRender=function(){ $('#tabs').innerHTML=TABS.map(([k,i,l])=>`<button data-act="tab" data-t="${k}" class="${S.tab===k?'on':''}"><i>${i}</i><span>${esc(l)}</span></button>`).join('');
  const f={home:vHome,today:vToday,draw:vDraw,rank:vRank,mine:vMine,stats:()=>'<div id="tennisViewContent"></div>'}[S.tab]; $('#view').innerHTML=f(); ensure();
  // Stats ATP = l'ancien onglet Tennis de PronoTracker (Elo, palmarès, fiches joueurs, duels, historique), affiché ici
  if(S.tab==='stats') setTimeout(()=>{ try{ window.__tennis&&window.__tennis.render(); }catch(e){} },0);
  // les matchs ATP terminés s'enregistrent tout seuls (comme avant dans PronoTracker) dès qu'on ouvre le tennis
  if(!S.recT){ S.recT=1; setTimeout(()=>{ try{ window.tennisOuvrir&&window.tennisOuvrir(); }catch(e){} },1500); } };
window.tennisRefresh=tennisRefresh;
window.Tennis={parseBoard,parseRank,roundFr,roundIdx,sample,state:S,nt:NT,ntScan,ntEvents,ntSend:NTS};
if(ui.sport==='tennis') render();   // le premier rendu a eu lieu avant le chargement de ce fichier
document.addEventListener('click',e=>{ if(ui.sport!=='tennis') return;
  const tb=e.target.closest&&e.target.closest('#tabs [data-act=tab]'); if(tb){ e.stopPropagation(); e.preventDefault(); S.tab=tb.dataset.t; S.more=0; savePref(); render(); window.scrollTo(0,0); return; }
  const el=e.target.closest&&e.target.closest('#view [data-tn]'); if(!el) return; const a=el.dataset.tn, v=el.dataset.v;
  if(a==='tour'){ S.tour=v; S.more=0; S.evSel=''; savePref(); render(); }
  else if(a==='dmode'){ S.dmode=v==='list'?'list':'tree'; savePref(); render(); }
  else if(a==='tzedit'){ S.tzEdit=!S.tzEdit; render(); }
  else if(a==='tzgo'){ tzInit(); const id=el.dataset.id, z=TZ.find(k=>tz[k].includes(id)), j=TZ.indexOf(z)+(+el.dataset.d); if(z&&j>=0&&j<3){ tz[z]=tz[z].filter(i=>i!==id); tz[TZ[j]].push(id); tzSave(); render(); } }
  else if(a==='tzmv'){ tzInit(); const id=el.dataset.id, z=TZ.find(k=>tz[k].includes(id)), A=z&&tz[z], i=z?A.indexOf(id):-1, j=i+(+el.dataset.d); if(z&&j>=0&&j<A.length){ [A[i],A[j]]=[A[j],A[i]]; tzSave(); render(); } }
  else if(a==='tzdel'){ tzInit(); const id=el.dataset.id; for(const z of TZ) tz[z]=tz[z].filter(i=>i!==id); tzSave(); render(); }
  else if(a==='tzadd'){ tzInit(); const sv=document.getElementById('tzAddSel'), zv=document.getElementById('tzAddZone'), id=sv&&sv.value, z=zv&&zv.value; if(id&&TZ.includes(z)&&!tzPlaced().includes(id)){ tz[z].push(id); tzSave(); render(); } }
  else if(a==='tzsize'){ tzInit(); const id=el.dataset.id; tz.n={...tz.n,[id]:tz.n[id]==='all'?'8':'all'}; tzSave(); render(); }
  else if(a==='tzreset'){ tz=tzDefault(); tzSave(); render(); }
  else if(a==='cpcombo'){ const t=(S._cb||[])[+el.dataset.i]; if(t){ try{ navigator.clipboard.writeText(t); say('📋 Combiné copié (colle-le dans PronoTracker)','ok'); }catch(e){} } }
  else if(a==='qual'){ S.qual=!S.qual; S.more=0; savePref(); render(); }
  else if(a==='day'){ S.day=+v; S.more=0; render(); }
  else if(a==='mine'){ S.mine=!S.mine; savePref(); render(); }
  else if(a==='more'){ S.more++; render(); }
  else if(a==='fav'){ e.stopPropagation(); const id=el.dataset.id; if(S.fav[id]) delete S.fav[id]; else S.fav[id]={n:el.dataset.n,cc:el.dataset.cc,tr:S.tour}; saveFav(); render(); }
  else if(a==='rd'){ const cur=S.open[v]; const def=el.querySelector('i').textContent==='▾'; S.open[v]=cur===undefined?!def:!cur; render(); }
  else if(a==='mstar'){ e.stopPropagation(); const id=el.dataset.id;
    if(S.starM[id]) delete S.starM[id]; else { const first=!Object.keys(S.starM).length; S.starM[id]={t:Date.now(),tr:S.tour};
      if(first&&NT.on&&NT.scope==='all'){ NT.scope='pick'; saveNt(); js_(K.snap,{}); } if(typeof say==='function') say(ntActive()?'★ Match choisi : tu recevras ses alertes (réglable dans « Mes joueurs »).':'★ Match choisi. Pour recevoir les alertes, active les notifications dans « Mes joueurs ».','warn'); }
    saveStarM(); ntPoll(true); render(); }
  else if(a==='nton') ntToggle();
  else if(a==='ntgo'){ S.tab='mine'; savePref(); render(); window.scrollTo(0,0); ntToggle(); }
  else if(a==='ntscope'){ NT.scope=v; saveNt(); js_(K.snap,{}); ntPoll(true); render(); }
  else if(a==='ntopt'){ NT[v]=!NT[v]; saveNt(); render(); }
  else if(a==='ntsnd'){ NT.lastSnd='son : essai…'; fetch('tennis-ball.mp3',{method:'HEAD',cache:'no-store'}).then(r=>{ if(!r.ok){ NT.lastSnd='son : fichier tennis-ball.mp3 introuvable (HTTP '+r.status+') : mets-le dans le même dossier que index.html'; redraw(); } }).catch(()=>{}); ntSound(true); }
  else if(a==='nttest'){ NT.last='envoi…'; NTS.send('🎾 C. Alcaraz – J. Sinner','🔥 BREAK ! Jeu C. Alcaraz · 2e set : 3-2 · sets 1-0 (test)','tn-test-'+Date.now()); render(); setTimeout(()=>{ if(ui.sport==='tennis') render(); },700); }
  else if(a==='refresh') tennisRefresh(true);
  else if(a==='drawdays'){ const ev=boardEvents(myTour(),0).find(x=>x.id===el.dataset.id)||currentEvent(); if(ev) loadDraw(myTour(),ev); }
  else if(a==='diag'){ S.diag=S.diag||{}; render(); window.scrollTo(0,0); } else if(a==='diagx'){ S.diag=null; render(); }
  else if(a==='diagrun') diagRun(); else if(a==='diagcopy') diagCopy(v); else if(a==='pasteboard') diagPaste('board'); else if(a==='pasterank') diagPaste('rank');
},true);
document.addEventListener('change',e=>{ if(ui.sport!=='tennis') return; const el=e.target.closest&&e.target.closest('#view [data-tn-sel]'); if(!el) return;
  if(el.dataset.tnSel==='rankn'){ S.rankN=+el.value; savePref(); render(); } else if(el.dataset.tnSel==='ev'){ S.evSel=el.value; render(); } });
})();

document.addEventListener('change',e=>{ const el=e.target&&e.target.closest&&e.target.closest('[data-cote]'); if(!el) return; const v=parseFloat(el.value); if(!(v>0)) return; try{ localStorage.setItem(el.dataset.cote==='mise'?'suivi-tennis-mise':'suivi-tennis-seuil',String(v)); }catch(x){} try{ render(); }catch(x){} });
