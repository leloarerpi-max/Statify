/* ================= EUROLIGUE (API publique officielle EuroLeague) =================
   Écrans : Accueil · Matchs · Calendrier · Classement · Joueurs · Équipes (+ box score, fiche équipe, fiche joueur).
   Pas d'actus (volontairement).
   Tout ce qui dépend du format de l'API est regroupé dans les parties 1 et 2 (adresses, lecture des données) :
   si l'EuroLeague change un champ, c'est ICI qu'on ajuste. Le bloc « Source des données » (onglet Accueil, en bas)
   affiche les erreurs et permet de copier le JSON brut d'un match pour vérifier. */
(function(){
'use strict';

/* ---------- 1. Adresses (sans clé, CORS ouvert ; secours via corsproxy.io comme pour la NBA) ---------- */
const SRC={
  games:sc=>`https://api-live.euroleague.net/v2/competitions/E/seasons/${sc}/games`,
  box:(sc,code)=>`https://live.euroleague.net/api/Boxscore?gamecode=${code}&seasoncode=${sc}`,
  header:(sc,code)=>`https://live.euroleague.net/api/Header?gamecode=${code}&seasoncode=${sc}`
};
const PROXY=u=>'https://corsproxy.io/?url='+encodeURIComponent(u);
const seasonY=()=>{ const d=new Date(); return d.getMonth()>=7?d.getFullYear():d.getFullYear()-1; };   // la saison démarre fin septembre
const scOf=y=>'E'+y;
const scLabel=sc=>{ const y=+String(sc).slice(1); return y+'-'+String((y+1)%100).padStart(2,'0'); };

/* ---------- 2. Lecture des données (fonctions pures, tolérantes) ---------- */
const num=v=>{ const n=parseFloat(v); return isNaN(n)?null:n; };
const first=(...a)=>{ for(const x of a) if(x!=null&&x!=='') return x; return null; };
const trim=s=>String(s==null?'':s).trim();
function pClub(side){ const c=(side&&(side.club||side.team))||{}, code=trim(first(c.code,c.clubCode,c.tvCode,c.abbreviatedName)||'?');
  const tv=trim(first(c.tvCodes,c.tvCode,code)).split(/[;,\s]/)[0]||code;
  return {code,tri:tv.slice(0,3).toUpperCase(),n:trim(first(c.name,c.editorialName,c.abbreviatedName,code)),sn:trim(first(c.abbreviatedName,c.editorialName,c.name,code)),
    logo:(c.images&&first(c.images.crest,c.images.logo,c.images.badge))||c.crest||''}; }
function pParts(p){ if(!p) return []; if(Array.isArray(p)) return p.map(num).filter(x=>x!=null);
  const out=[]; for(let i=1;i<=4;i++){ const v=num(p['partials'+i]??p['partial'+i]??p['q'+i]); if(v!=null) out.push(v); }
  const ex=p.extraPeriods||p.extra||{}; if(ex&&typeof ex==='object') for(const k of Object.keys(ex)){ const v=num(ex[k]); if(v!=null) out.push(v); }
  return out; }
// heure du match : une date avec fuseau (Z / +hh:mm) est lue telle quelle ; sinon on applique localTimeZone (décalage en heures) s'il existe ; sinon on la lit comme UTC
function pTime(g){ const z=/[zZ]$|[+-]\d\d:?\d\d$/;
  for(const k of ['utcDate','dateUtc','date','localDate']){ const s=g[k]; if(typeof s==='string'&&z.test(s)) return new Date(s).toISOString(); }
  const tz=num(g.localTimeZone), loc=g.localDate||g.date;
  if(loc&&tz!=null){ const t=Date.parse(String(loc).slice(0,19)+'Z'); if(t) return new Date(t-tz*36e5).toISOString(); }
  if(g.date){ const t=Date.parse(String(g.date).slice(0,19)+'Z'); if(t) return new Date(t).toISOString(); }
  return ''; }
function pGame(g,sc){ const L=pClub(g.local), R=pClub(g.road), code=num(first(g.gameCode,g.code,g.game&&g.game.code)); if(code==null) return null;
  const rd=g.round, r=num(rd&&typeof rd==='object'?first(rd.round,rd.number,rd.roundNumber):first(rd,g.roundNumber))||0;
  const ph=g.phaseType||g.phase||{}, phc=trim(typeof ph==='string'?ph:first(ph.code,ph.alias,ph.name)).toUpperCase();
  const t=pTime(g), hs=num(g.local&&g.local.score), as=num(g.road&&g.road.score), gs=String(g.gameStatus||g.status||'');
  let st='pre'; if(g.played===true||/result|final|played|finished/i.test(gs)) st='post';
  else if(/live|progress|playing|running/i.test(gs)) st='in';
  else { const t0=Date.parse(t)||0, now=Date.now(); if(t0&&now>=t0-6e4&&now<t0+5*36e5) st='in'; }
  const vn=g.venue&&typeof g.venue==='object'?first(g.venue.name,g.venue.venueName):g.venue;
  return {id:sc+':'+code,sc,code,r,rn:trim((rd&&typeof rd==='object'&&first(rd.name,rd.roundName))||(r?'Journée '+r:'')),ph:phc,
    phn:trim(typeof ph==='object'?first(ph.name,ph.alias):ph),t,st,h:Object.assign(L,{s:hs}),a:Object.assign(R,{s:as}),
    qh:pParts(g.local&&g.local.partials),qa:pParts(g.road&&g.road.partials),v:trim(vn||''),aud:num(g.audience)}; }
function parseGames(js,sc){ const arr=Array.isArray(js)?js:(js&&(js.data||js.games||js.items))||[]; const out=[];
  for(const g of arr){ try{ const x=pGame(g,sc); if(x) out.push(x); }catch(e){} } return out; }
// « NUNN, KENDRICK » → « Kendrick Nunn »
const cap=w=>w.toLowerCase().replace(/(^|[\s\-'’.])([a-zà-ÿ])/g,(m,a,b)=>a+b.toUpperCase());
function pName(s){ s=trim(s); if(!s) return '?'; const m=/^([^,]+),\s*(.+)$/.exec(s); return m?cap(m[2])+' '+cap(m[1]):cap(s); }
function pMin(v){ if(v==null) return 0; if(typeof v==='number') return v; const s=String(v); if(/dnp/i.test(s)) return 0; const m=/^(\d+):(\d+)/.exec(s); return m?+m[1]+(+m[2])/60:(num(s)||0); }
function pLine(p){ const g=k=>num(p[k])||0;
  const f2m=g('FieldGoalsMade2'), f2a=g('FieldGoalsAttempted2'), f3m=g('FieldGoalsMade3'), f3a=g('FieldGoalsAttempted3');
  return {id:trim(first(p.Player_ID,p.PlayerId,p.id,p.Player)),n:pName(first(p.Player,p.Name,p.name)),no:trim(first(p.Dorsal,p.Number,'')),st:+p.IsStarter===1,tm:trim(p.Team),
    min:pMin(first(p.Minutes,p.minutes)),pts:g('Points'),f2m,f2a,f3m,f3a,fgm:f2m+f3m,fga:f2a+f3a,ftm:g('FreeThrowsMade'),fta:g('FreeThrowsAttempted'),
    or:g('OffensiveRebounds'),dr:g('DefensiveRebounds'),reb:g('TotalRebounds'),ast:g('Assistances'),stl:g('Steals'),to:g('Turnovers'),
    blk:g('BlocksFavour'),blka:g('BlocksAgainst'),pf:g('FoulsCommited'),fd:g('FoulsReceived'),pir:g('Valuation'),pm:g('Plusminus')}; }
// box score : Stats[0] = équipe à domicile, Stats[1] = visiteurs (on vérifie avec le code équipe des joueurs)
function parseBox(js,game){ if(!js||!Array.isArray(js.Stats)||js.Stats.length<2) return null;
  const T=js.Stats.map(s=>({name:trim(s.Team),coach:pName(s.Coach),pl:(s.PlayersStats||[]).map(pLine),tot:s.totr?pLine(Object.assign({Player:'Total'},s.totr)):null}));
  const codeOf=t=>{ const c={}; for(const p of t.pl) if(p.tm) c[p.tm]=(c[p.tm]||0)+1; return Object.keys(c).sort((a,b)=>c[b]-c[a])[0]||''; };
  const is=(t,side)=>{ const c=codeOf(t); return !!c&&(c===side.code||c===side.tri); };
  let [h,a]=T; if(game&&is(T[0],game.a)&&!is(T[0],game.h)) [h,a]=[T[1],T[0]];
  const qOf=nm=>{ const q=(js.ByQuarter||[]).find(x=>trim(x.Team)===nm); if(!q) return null; return ['Quarter1','Quarter2','Quarter3','Quarter4','ExtraTime','ExtraTime2','ExtraTime3','ExtraTime4'].map(k=>num(q[k])).filter((v,i)=>v!=null&&(i<4||v>0)); };
  return {h,a,qh:qOf(h.name),qa:qOf(a.name),live:!!js.Live,att:trim(js.Attendance||''),ref:trim(js.Referees||'')}; }

/* ---------- 3. État, mémoire locale ---------- */
const K={pref:'suivi-euro-pref',games:'suivi-euro-games',fav:'suivi-euro-fav',box:'suivi-euro-box'};
const jl=(k,d)=>{ try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; }catch(e){ return d; } };
const js_=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
const TABS=[['home','🏠','Accueil'],['games','📋','Matchs'],['cal','📅','Calendrier'],['table','📊','Classement'],['players','👤','Joueurs'],['teams','🛡️','Équipes']];
const P0=jl(K.pref,{});
const S={tab:TABS.some(t=>t[0]===P0.tab)?P0.tab:'home',sc:P0.sc||scOf(seasonY()),gR:0,gTeam:'',cTeam:'',cFav:!!P0.cFav,
  pSort:{k:'pts',d:-1},pMode:P0.pMode||'avg',pTeam:'',pQ:'',pMin:P0.pMin||1,pFav:false,
  games:jl(K.games,{}),fav:jl(K.fav,{teams:[],players:{}}),box:{},boxReady:false,open:null,busy:{},err:{},errT:{},boxQ:{n:0,d:0},boxFail:{},diag:'',live:{}};
if(!Array.isArray(S.fav.teams)) S.fav.teams=[]; if(!S.fav.players||typeof S.fav.players!=='object') S.fav.players={};
const savePref=()=>js_(K.pref,{tab:S.tab,sc:S.sc,cFav:S.cFav,pMode:S.pMode,pMin:S.pMin});
const saveFav=()=>js_(K.fav,S.fav);
function saveGames(){ const ks=Object.keys(S.games).sort().reverse(); for(const k of ks.slice(3)) delete S.games[k]; js_(K.games,S.games); }
// box scores : gros volume → IndexedDB (fonctions idbGet/idbSet de statify.js), copie localStorage en secours
let boxT=null;
function saveBox(){ clearTimeout(boxT); boxT=setTimeout(()=>{ try{ idbSet(K.box,S.box).catch(()=>{ js_(K.box,S.box); }); }catch(e){ js_(K.box,S.box); } },800); }
(async()=>{ let b=null; try{ b=await idbGet(K.box); }catch(e){} if(!b) b=jl(K.box,null); if(b&&typeof b==='object') for(const k of Object.keys(b)) if(!S.box[k]) S.box[k]=b[k]; S.boxReady=true; redraw(); })();

/* ---------- 4. Chargement ---------- */
async function jget(u){ const errs=[];
  // ton relais Cloudflare (le même que pour les actus) passe avant corsproxy.io, devenu payant hors localhost
  let rl=''; try{ rl=(localStorage.getItem('suivi-news-relay')||'').trim().replace(/\/+$/,''); }catch(e){}
  for(const x of [u,...(rl?[rl+'/?url='+encodeURIComponent(u)]:[]),PROXY(u)]){ const c=new AbortController(), t=setTimeout(()=>c.abort(),15000);
    try{ const r=await fetch(x,{cache:'no-store',signal:c.signal}); if(!r.ok){ errs.push('HTTP '+r.status); continue; } const tx=await r.text(); if(!tx.trim()) return null; return JSON.parse(tx); }
    catch(e){ errs.push(e.name==='AbortError'?'délai dépassé':(e.message||String(e))); } finally{ clearTimeout(t); } }
  throw new Error(errs.join(' / ')); }
function redraw(){ if(ui.sport!=='euro') return; const a=document.activeElement; if(a&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)&&a.closest&&a.closest('#view')) return; render(); }
const list=(sc)=>{ const L=((S.games[sc||S.sc]||{}).list)||[]; for(const g of L) applyLive(g); return L; };
// S.live[id] = {hs,as,q,clk,live,fin,t} lu sur le flux live (Header + box score)
function applyLive(g){ const x=S.live[g.id]; if(!x||g.st==='post') return;
  if(x.hs!=null) g.h.s=x.hs; if(x.as!=null) g.a.s=x.as; g.clk=x.clk||'';
  if(x.fin) { g.st='post'; } else if(x.live) g.st='in'; }
function liveTxt(g){ return g.clk?'EN DIRECT · '+g.clk:'EN DIRECT'; }
function pHeader(js){ if(!js||typeof js!=='object') return null; const n=v=>{ const x=num(v); return x==null?null:x; };
  const hs=n(first(js.ScoreA,js.scoreA,js.LocalScore)), as=n(first(js.ScoreB,js.scoreB,js.RoadScore));
  const q=n(first(js.Quarter,js.quarter,js.Period)), rem=trim(first(js.RemainingPartialTime,js.RemainingTime,js.Clock,''));
  const live=js.Live===true||js.Live==='true'||js.Live===1;
  let clk=''; if(q) clk=(q<=4?'Q'+q:'Prol.'+(q>5?' '+(q-4):''))+(rem&&rem!=='00:00'?' '+rem.replace(/^0(\d:)/,'$1'):(rem==='00:00'?' · fin':''));
  return {hs,as,q,clk,live}; }
async function fetchLive(g){ try{ const h=pHeader(await jget(SRC.header(g.sc,g.code))); if(h){ const o=S.live[g.id]||{};
      const started=(h.hs||0)+(h.as||0)>0;
      // match terminé : plus « Live », 4e quart (ou prolongation) à 00:00 et scores différents
      const fin=!h.live&&started&&h.q>=4&&h.hs!==h.as&&Date.now()-Date.parse(g.t)>80*6e4;
      S.live[g.id]=Object.assign(o,{hs:started?h.hs:o.hs,as:started?h.as:o.as,clk:started?(fin?'':h.clk):'',live:started&&!fin,fin,t:Date.now()}); } }
  catch(e){ S.err.live=e.message||String(e); } }
async function liveTick(){ if(S.busy.live) return; const L=((S.games[S.sc]||{}).list)||[], gs=L.filter(g=>g.st==='in'); if(!gs.length) return;
  S.busy.live=1; try{ await Promise.all(gs.map(fetchLive)); } finally{ S.busy.live=0; redraw(); } }
async function loadGames(force){ const sc=S.sc, c=S.games[sc], k='g'+sc;
  if(S.busy[k]) return; if(!force&&c&&Date.now()-c.t<(hasLive()?6e4:15*6e4)) return; if(!force&&S.errT[k]&&Date.now()-S.errT[k]<6e4) return;
  S.busy[k]=1; try{ const js=await jget(SRC.games(sc)), L=parseGames(js,sc); if(!L.length) throw new Error('format inattendu (aucun match lu)');
    S.games[sc]={t:Date.now(),list:L}; S.err[k]=''; saveGames(); }
  catch(e){ S.err[k]=e.message||String(e); S.errT[k]=Date.now(); }
  finally{ S.busy[k]=0; redraw(); liveTick(); ensureBoxes(); } }
const needBox=g=>{ const b=S.box[g.id]; if(g.st==='post') return !b||!b.fin; if(g.st==='in') return !b||Date.now()-(b.t||0)>2e4; return false; };
async function fetchBox(g){ try{ const js=await jget(SRC.box(g.sc,g.code)), b=parseBox(js,g); if(b){ b.t=Date.now(); b.fin=g.st==='post'&&!b.live; S.box[g.id]=b; delete S.boxFail[g.id];
      if(g.st==='in'){ const sum=t=>t.tot&&t.tot.pts?t.tot.pts:t.pl.reduce((a,p)=>a+(p.pts||0),0), hs=sum(b.h), as=sum(b.a), o=S.live[g.id]||(S.live[g.id]={}); if(hs+as>0&&!(o.t&&Date.now()-o.t<3e4)){ o.hs=hs; o.as=as; o.live=true; } }
      return true; } S.boxFail[g.id]=Date.now(); }
  catch(e){ S.boxFail[g.id]=Date.now(); S.err.box=e.message||String(e); } return false; }
// récupère les box scores manquants par petits paquets (4 à la fois), puis met l'écran à jour
async function ensureBoxes(){ if(S.busy.box||!S.boxReady) return;
  const todo=list().filter(g=>needBox(g)&&!(S.boxFail[g.id]&&Date.now()-S.boxFail[g.id]<5*6e4)).sort((a,b)=>(a.st==='in'?-1:0)-(b.st==='in'?-1:0)||Date.parse(b.t)-Date.parse(a.t));
  if(!todo.length) return; S.busy.box=1; S.boxQ={n:todo.length,d:0}; redraw();
  try{ for(let i=0;i<todo.length;i+=4){ await Promise.all(todo.slice(i,i+4).map(fetchBox)); S.boxQ.d=Math.min(todo.length,i+4); if(i%12===8||i+4>=todo.length) { saveBox(); redraw(); } await new Promise(r=>setTimeout(r,250)); } }
  finally{ S.busy.box=0; S.boxQ={n:0,d:0}; saveBox(); redraw(); } }
function euroRefresh(manual){ loadGames(true); if(manual) say('🏀 Euroligue : actualisation…','warn'); }
const hasLive=()=>list().some(g=>g.st==='in'||(g.st==='pre'&&Math.abs(Date.parse(g.t)-Date.now())<15*6e4));
setInterval(()=>{ if(ui.sport!=='euro'||document.hidden) return; loadGames(false); if(hasLive()){ liveTick(); ensureBoxes(); } },20000);

/* ---------- 5. Calculs : équipes, classement, joueurs ---------- */
const TC={OLY:'#d6001c',PAN:'#007a3d',MAD:'#5b3c88',BAR:'#a50044',ULK:'#0b2a5b',IST:'#003b7a',MCO:'#c8102e',ZAL:'#006a3a',TEL:'#f2c300',HTA:'#d8232a',RED:'#cf142b',PAR:'#2b2b2b',MIL:'#c8102e',VIR:'#111111',MUN:'#0066b2',BAS:'#b4122a',PAM:'#f47b20',ASV:'#1c2f5e',PRS:'#e5007e',DUB:'#1d1d1d',BER:'#ffd200',VAL:'#f47b20',MAC:'#f2c300',CSK:'#c8102e'};
const hashC=s=>{ let h=0; for(const c of String(s)) h=(h*31+c.charCodeAt(0))>>>0; return `hsl(${h%360} 55% 42%)`; };
const tcol=code=>TC[code]||hashC(code);
const hex=c=>c.startsWith('#')?c:'#34b64f';
function teamsMap(){ const M={}; for(const g of list()) for(const s of [g.h,g.a]) if(s.code&&s.code!=='?'){ const m=M[s.code]||(M[s.code]={code:s.code,tri:s.tri,n:s.n,sn:s.sn,logo:''}); if(s.logo) m.logo=s.logo; } return M; }
let TM={}; const tm=c=>TM[c]||{code:c,tri:c,n:c,sn:c,logo:''};
const isFavT=c=>S.fav.teams.includes(c);
const isFavG=g=>isFavT(g.h.code)||isFavT(g.a.code);
const logo=(c,size=20)=>{ const t=tm(c), col=hex(tcol(c)); return `<span class="av tl${t.logo?'':' fb'}" style="width:${size}px;height:${size}px;font-size:${Math.max(8,Math.round(size*.36))}px;--tc:${col};--ink:${ink(col)}" data-ini="${esc(t.tri)}">${t.logo?`<img src="${esc(t.logo)}" alt="" loading="lazy">`:esc(t.tri)}</span>`; };
const pAv=(p,size=24)=>{ const col=hex(tcol(p.team||p.tm||'')), ini=String(p.n||'?').split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase(); return `<span class="av" style="width:${size}px;height:${size}px;font-size:${Math.max(9,Math.round(size*.38))}px;--tc:${col};--ink:${ink(col)}">${esc(ini)}</span>`; };
const starT=c=>`<span class="stars"><button class="star" data-el="favt" data-id="${esc(c)}" title="${isFavT(c)?'Retirer des favoris':'Ajouter aux favoris'}">${isFavT(c)?'★':'☆'}</button></span>`;
const starP=(id,n)=>`<span class="stars"><button class="star" data-el="favp" data-id="${esc(id)}" data-n="${esc(n)}" title="${S.fav.players[id]?'Retirer des favoris':'Ajouter aux favoris'}">${S.fav.players[id]?'★':'☆'}</button></span>`;
const tLink=c=>`<span class="link" data-el="team" data-id="${esc(c)}">${logo(c,18)}${esc(tm(c).sn)}</span>`;
const pLink=(id,n)=>`<span class="link" data-el="player" data-id="${esc(id)}">${esc(n)}</span>`;
const pc=(m,a)=>a?(100*m/a).toFixed(1):'–';
const PAR={timeZone:'Europe/Paris'};
const fDay=iso=>iso?new Date(iso).toLocaleDateString('fr-FR',{...PAR,weekday:'long',day:'numeric',month:'long'}):'Date inconnue';
const fDayS=iso=>iso?new Date(iso).toLocaleDateString('fr-FR',{...PAR,day:'numeric',month:'short'}):'';
const fHour=iso=>iso?new Date(iso).toLocaleTimeString('fr-FR',{...PAR,hour:'2-digit',minute:'2-digit'}):'';
const dKey=iso=>iso?new Date(iso).toLocaleDateString('en-CA',PAR):'?';
const isRS=g=>!g.ph||/^RS|REGULAR|^SR$/i.test(g.ph);
const won=(g,c)=>g.st==='post'&&(g.h.code===c?g.h.s>g.a.s:g.a.s>g.h.s);

function standings(){ const T={};
  const get=c=>T[c]||(T[c]={code:c,g:0,w:0,l:0,pf:0,pa:0,hw:0,hl:0,aw:0,al:0,log:[]});
  for(const c of Object.keys(TM)) get(c);
  const fin=list().filter(g=>g.st==='post'&&isRS(g)&&g.h.s!=null&&g.a.s!=null).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
  for(const g of fin){ const H=get(g.h.code), A=get(g.a.code), hw=g.h.s>g.a.s;
    H.g++; A.g++; H.pf+=g.h.s; H.pa+=g.a.s; A.pf+=g.a.s; A.pa+=g.h.s;
    if(hw){ H.w++; H.hw++; A.l++; A.al++; } else { A.w++; A.aw++; H.l++; H.hl++; }
    H.log.push({win:hw,opp:g.a.code,d:g.h.s-g.a.s,id:g.id}); A.log.push({win:!hw,opp:g.h.code,d:g.a.s-g.h.s,id:g.id}); }
  // départage : victoires, puis confrontations directes entre équipes à égalité (victoires puis écart), puis écart général, puis points marqués
  const rows=Object.values(T), byW={}; for(const t of rows) (byW[t.w]=byW[t.w]||[]).push(t);
  for(const grp of Object.values(byW)){ if(grp.length<2) continue; const set=new Set(grp.map(t=>t.code));
    for(const t of grp){ t.hw2=0; t.hd2=0; } for(const g of fin){ if(!set.has(g.h.code)||!set.has(g.a.code)) continue; const H=T[g.h.code], A=T[g.a.code], d=g.h.s-g.a.s; if(d>0) H.hw2++; else A.hw2++; H.hd2+=d; A.hd2-=d; } }
  rows.sort((a,b)=>b.w-a.w||(b.hw2||0)-(a.hw2||0)||(b.hd2||0)-(a.hd2||0)||(b.pf-b.pa)-(a.pf-a.pa)||b.pf-a.pf||a.l-b.l||tm(a.code).sn.localeCompare(tm(b.code).sn));
  rows.forEach((t,i)=>t.rk=i+1); return rows; }
const formDotsE=(log,n=5)=>log.slice(-n).map(x=>`<span class="dot ${x.win?'w':'l'}" title="${x.win?'Victoire':'Défaite'} contre ${esc(tm(x.opp).sn)} (${x.d>0?'+':''}${x.d})">${x.win?'V':'D'}</span>`).join('')||'<span class="mut">–</span>';
const streakE=log=>{ if(!log.length) return '–'; const w=log[log.length-1].win; let n=0; for(let i=log.length-1;i>=0&&log[i].win===w;i--) n++; return `<span class="${w?'ok':'err'}">${w?'V':'D'}${n}</span>`; };
const zone=r=>r<=6?'z1':r<=10?'z2':'';

function playersAgg(){ const P={};
  for(const g of list()){ if(g.st!=='post') continue; const b=S.box[g.id]; if(!b) continue;
    for(const [side,t,o] of [['h',b.h,b.a],['a',b.a,b.h]]){ const team=g[side].code;
      for(const p of t.pl){ if(!(p.min>0)||!p.id) continue; const r=P[p.id]||(P[p.id]={id:p.id,n:p.n,team,gp:0,gs:0,min:0,pts:0,reb:0,or:0,dr:0,ast:0,stl:0,blk:0,to:0,pf:0,fd:0,pir:0,pm:0,fgm:0,fga:0,f2m:0,f2a:0,f3m:0,f3a:0,ftm:0,fta:0,log:[],tl:0});
        const tt=Date.parse(g.t)||0; if(tt>=r.tl){ r.team=team; r.tl=tt; r.n=p.n; }
        r.gp++; if(p.st) r.gs++; for(const k of ['min','pts','reb','or','dr','ast','stl','blk','to','pf','fd','pir','pm','fgm','fga','f2m','f2a','f3m','f3a','ftm','fta']) r[k]+=p[k]||0;
        r.log.push({id:g.id,t:g.t,opp:g[side==='h'?'a':'h'].code,home:side==='h',win:won(g,team),p}); } } }
  return P; }
let CACHE={sig:'',P:null,ST:null};
function data(){ const sig=S.sc+'|'+((S.games[S.sc]||{}).t||0)+'|'+Object.keys(S.box).length+'|'+Object.values(S.box).reduce((a,b)=>a+(b.t||0)%1e6,0);
  if(CACHE.sig!==sig){ TM=teamsMap(); CACHE={sig,ST:standings(),P:playersAgg()}; } return CACHE; }

/* ---------- 6. Écrans ---------- */
const card=(title,body,extra)=>`<div class="card">${title?`<div class="row between" style="margin-bottom:8px"><h2 style="margin:0">${title}</h2>${extra||''}</div>`:''}${body}</div>`;
function statusBar(){ const k='g'+S.sc, c=S.games[S.sc], out=[];
  if(S.busy[k]&&!c) out.push('⏳ Chargement du calendrier de l\'Euroligue…');
  if(S.err[k]) out.push(`⚠️ Lecture impossible du calendrier (${esc(S.err[k])}).${c?' Affichage des dernières données enregistrées.':''} <button class="sec" data-el="refresh">Réessayer</button>`);
  if(S.boxQ.n) out.push(`📥 Box scores : ${S.boxQ.d}/${S.boxQ.n}… (les stats joueurs se complètent au fur et à mesure)`);
  return out.length?`<div class="card ${S.err[k]?'warn':''}" style="padding:10px 14px">${out.join('<br>')}</div>`:''; }
const seasonSel=()=>{ const y=seasonY(); return `<select data-el-sel="season">${[y,y-1,y-2].map(v=>`<option value="${scOf(v)}" ${S.sc===scOf(v)?'selected':''}>Saison ${scLabel(scOf(v))}</option>`).join('')}</select>`; };
const stTxt=g=>g.st==='post'?'FINAL':g.st==='in'?liveTxt(g):fHour(g.t);

function rec(c){ const t=(data().ST||[]).find(x=>x.code===c); return t&&t.g?`<span class="gt-rec" title="Classement · victoires-défaites">${t.rk}e · ${t.w}-${t.l}</span>`:''; }
function tile(g){ const fin=g.st==='post', wh=fin&&g.h.s>g.a.s, wa=fin&&g.a.s>g.h.s, sc=v=>g.st==='pre'?'':esc(String(v??''));
  const side=(s,w)=>`<div class="gt-side ${fin&&!w?'lose':''}"><span class="gt-t">${logo(s.code,28)}<b>${esc(s.sn)}</b>${rec(s.code)}</span><span class="gt-sc">${sc(s.s)}</span></div>`;
  return `<div class="gt-tile click ${isFavG(g)?'fv':''}" data-el="game" data-id="${esc(g.id)}"><div class="gt-top"><span>${g.st==='in'?'<span class="tag live">'+esc(liveTxt(g))+'</span>':esc(stTxt(g))}</span><span>${isFavG(g)?'⭐ ':''}${esc(g.rn||'')}</span></div>${side(g.h,wh)}${side(g.a,wa)}${fin&&g.h.s!==g.a.s?`<div class="gt-diff">${esc(tm(wh?g.h.code:g.a.code).tri)} +${Math.abs(g.h.s-g.a.s)}</div>`:''}</div>`; }
function line(g){ const fin=g.st==='post', wh=fin&&g.h.s>g.a.s, wa=fin&&g.a.s>g.h.s;
  return `<div class="gt-line click ${isFavG(g)?'fv':''}" data-el="game" data-id="${esc(g.id)}"><span class="gt-l ${fin&&!wh?'lose':''}">${rec(g.h.code)}<b>${esc(g.h.sn)}</b>${logo(g.h.code,22)}</span><span class="gt-m">${g.st==='pre'?`<span class="mut" style="font-size:13px;font-weight:600">${esc(fHour(g.t))}</span>`:`<span class="${fin&&!wh?'lose':''}">${esc(String(g.h.s??''))}</span><i>–</i><span class="${fin&&!wa?'lose':''}">${esc(String(g.a.s??''))}</span>`}</span><span class="gt-r ${fin&&!wa?'lose':''}">${logo(g.a.code,22)}<b>${esc(g.a.sn)}</b>${rec(g.a.code)}</span>${g.st==='in'?'<span class="tag live">'+esc(liveTxt(g))+'</span>':''}</div>`; }
function byDay(gs,asTiles){ const days=[]; for(const g of gs){ const k=dKey(g.t); let d=days[days.length-1]; if(!d||d.k!==k){ d={k,lab:fDay(g.t),gs:[]}; days.push(d); } d.gs.push(g); }
  return days.map((d,i)=>`<div class="gt-day">${esc(d.lab)} <span class="mut">· ${d.gs.length} match${d.gs.length>1?'s':''}</span></div>${asTiles===true||(asTiles==='first'&&i===0)?`<div class="gt-grid">${d.gs.map(tile).join('')}</div>`:`<div class="gt-list">${d.gs.map(line).join('')}</div>`}`).join(''); }
// journée « courante » : celle du prochain match si elle commence dans les 4 jours ou a déjà commencé, sinon la dernière jouée
function curRound(){ const L=list(); if(!L.length) return 0; const now=Date.now();
  const live=L.find(g=>g.st==='in'); if(live) return live.r;
  const next=L.filter(g=>g.st==='pre'&&Date.parse(g.t)>now-3*36e5).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t))[0];
  const last=L.filter(g=>g.st==='post').sort((a,b)=>Date.parse(b.t)-Date.parse(a.t))[0];
  if(next&&(!last||Date.parse(next.t)-now<4*864e5||L.some(g=>g.r===next.r&&g.st==='post'))) return next.r;
  return last?last.r:(next?next.r:0); }
const roundGames=r=>list().filter(g=>g.r===r).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t)||a.code-b.code);

function hero(){ const L=list(); if(!L.length) return '';
  const favs=L.filter(isFavG), pool=favs.length?favs:L, now=Date.now();
  const live=pool.find(g=>g.st==='in'), last=pool.filter(g=>g.st==='post').sort((a,b)=>Date.parse(b.t)-Date.parse(a.t))[0], next=pool.filter(g=>g.st==='pre'&&Date.parse(g.t)>now-3*36e5).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t))[0];
  const g=live||(next&&last&&Date.parse(next.t)-now<12*36e5?next:last||next); if(!g) return '';
  const focus=favs.length?(isFavT(g.h.code)?g.h.code:g.a.code):(g.st==='post'?(g.h.s>g.a.s?g.h.code:g.a.code):g.h.code);
  const eb=(favs.length?'Ton équipe · '+tm(focus).sn:g.st==='post'?'Dernier match joué':g.st==='in'?'En direct':'Prochain match')+(g.rn?' · '+g.rn:'');
  const chip=g.st==='post'?(favs.length?(won(g,focus)?'Victoire':'Défaite'):'Final'):g.st==='in'?liveTxt(g):'À venir', cls=g.st==='post'?(favs.length?(won(g,focus)?'w':'l'):''):'';
  return heroHtml({act:'',id:'',col:hex(tcol(focus)),eb,l1:logo(g.h.code,44),n1:tm(g.h.code).tri,l2:logo(g.a.code,44),n2:tm(g.a.code).tri,s1:g.st==='pre'?'':g.h.s,s2:g.st==='pre'?'':g.a.s,chip,cls,when:g.st==='pre'?fDay(g.t)+' · '+fHour(g.t):fDay(g.t)}).replace('class="hero click"',`class="hero click" data-el="game" data-id="${esc(g.id)}"`); }
function standTable(rows,compact){ const head=compact?'<th>#</th><th class="l">Équipe</th><th>V</th><th>D</th><th>Diff.</th>':'<th>#</th><th class="l">Équipe</th><th>MJ</th><th>V</th><th>D</th><th class="hide-m">%V</th><th class="hide-m">Pts</th><th class="hide-m">Enc.</th><th>Diff.</th><th class="hide-m">Dom.</th><th class="hide-m">Ext.</th><th>Série</th><th class="hide-m">5 derniers</th>';
  const body=rows.map(t=>{ const d=t.pf-t.pa, dc=`<td class="${d>=0?'ok':'err'}">${d>0?'+':''}${d}</td>`;
    return compact?`<tr class="${zone(t.rk)} ${isFavT(t.code)?'fv':''}"><td>${t.rk}</td><td class="l">${tLink(t.code)}</td><td>${t.w}</td><td>${t.l}</td>${dc}</tr>`
      :`<tr class="${zone(t.rk)}"><td>${t.rk}</td><td class="l"><span style="display:inline-flex;align-items:center;gap:2px;white-space:nowrap">${starT(t.code)}${tLink(t.code)}</span></td><td>${t.g}</td><td><b>${t.w}</b></td><td>${t.l}</td><td class="hide-m">${pc(t.w,t.g)}</td><td class="hide-m">${t.pf}</td><td class="hide-m">${t.pa}</td>${dc}<td class="hide-m">${t.hw}-${t.hl}</td><td class="hide-m">${t.aw}-${t.al}</td><td>${streakE(t.log)}</td><td class="hide-m">${formDotsE(t.log)}</td></tr>`; }).join('')||`<tr><td colspan="13" class="empty">Aucun match terminé.</td></tr>`;
  return `<div class="scroll"><table class="st"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`; }
const LEGEND='<div class="legend"><span><i class="z1" style="background:#3ecf8e"></i>1-6 : play-offs</span><span><i style="background:#f5a524"></i>7-10 : play-in</span><span><i></i>11+ : éliminés</span></div>';
const PC={gp:['MJ',r=>r.gp,r=>r.gp],min:['MIN',r=>r.min/r.gp,r=>f1(r.min/r.gp),r=>Math.round(r.min)],pts:['PTS',r=>r.pts/r.gp,r=>`<b>${f1(r.pts/r.gp)}</b>`,r=>`<b>${r.pts}</b>`],
  reb:['REB',r=>r.reb/r.gp,r=>f1(r.reb/r.gp),r=>r.reb],ast:['AST',r=>r.ast/r.gp,r=>f1(r.ast/r.gp),r=>r.ast],stl:['INT',r=>r.stl/r.gp,r=>f1(r.stl/r.gp),r=>r.stl],blk:['CTR',r=>r.blk/r.gp,r=>f1(r.blk/r.gp),r=>r.blk],
  to:['BP',r=>r.to/r.gp,r=>f1(r.to/r.gp),r=>r.to],pir:['PIR',r=>r.pir/r.gp,r=>`<b>${f1(r.pir/r.gp)}</b>`,r=>r.pir],
  fg:['TIR%',r=>r.fga?r.fgm/r.fga:-1,r=>pc(r.fgm,r.fga)],f3:['3P%',r=>r.f3a?r.f3m/r.f3a:-1,r=>pc(r.f3m,r.f3a)],ft:['LF%',r=>r.fta?r.ftm/r.fta:-1,r=>pc(r.ftm,r.fta)]};
function leaders(P,k,n){ const R=Object.values(P), mx=Math.max(1,...R.map(r=>r.gp)), min=Math.max(1,Math.ceil(mx*.4)); return R.filter(r=>r.gp>=min).sort((a,b)=>PC[k][1](b)-PC[k][1](a)).slice(0,n||5); }

function vHome(){ const D=data(), r=curRound(), rg=roundGames(r), L=list();
  if(!L.length) return statusBar()+card('🏀 Euroligue',S.busy['g'+S.sc]?'<p class="mut">Chargement du calendrier…</p>':`<p>Aucun match chargé pour la saison ${scLabel(S.sc)}.</p><button data-el="refresh">🔄 Charger l'Euroligue</button>`);
  let h=hero()+statusBar();
  const live=L.filter(g=>g.st==='in'); if(live.length) h+=card('🔴 En direct',`<div class="gt-grid">${live.map(tile).join('')}</div>`);
  h+=card(esc(rg[0]&&rg[0].rn?rg[0].rn:'Journée '+r)+(rg[0]&&!isRS(rg[0])&&rg[0].phn?' · '+esc(rg[0].phn):''),rg.length?byDay(rg,'first'):'<p class="empty">Aucun match.</p>',`<button class="sec" data-el="go" data-v="games">Tous les matchs</button>`);
  const fv=S.fav.teams.filter(c=>TM[c]);
  if(fv.length){ const now=Date.now(); h+=card('⭐ Mes équipes',fv.map(c=>{ const t=D.ST.find(x=>x.code===c)||{rk:'–',w:0,l:0,log:[]}, nx=L.filter(g=>(g.h.code===c||g.a.code===c)&&g.st==='pre'&&Date.parse(g.t)>now-3*36e5).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t))[0];
    return `<div class="row between" style="padding:8px 0;border-top:1px solid var(--line)"><span>${tLink(c)} <span class="mut">· ${t.rk}e · ${t.w}-${t.l}</span></span><span>${formDotsE(t.log)}</span>${nx?`<span class="mut click" data-el="game" data-id="${esc(nx.id)}" style="flex-basis:100%;font-size:12.5px">Prochain : ${nx.h.code===c?'vs':'@'} ${esc(tm(nx.h.code===c?nx.a.code:nx.h.code).sn)} · ${esc(fDayS(nx.t))} ${esc(fHour(nx.t))}</span>`:''}</div>`; }).join('')); }
  else h+=`<div class="card mut" style="padding:10px 14px">💡 Touche ☆ à côté d'une équipe (Classement ou Équipes) pour la suivre : ses matchs passent en tête de l'accueil.</div>`;
  h+=`<div class="stgrid"><div>${card('📊 Classement',standTable(D.ST.slice(0,10),true)+LEGEND,`<button class="sec" data-el="go" data-v="table">Complet</button>`)}</div><div>${card('🏅 Meilleurs joueurs',leadersHtml(D.P),`<button class="sec" data-el="go" data-v="players">Tous</button>`)}</div></div>`;
  h+=sourceCard(); return h; }
function leadersHtml(P){ if(!Object.keys(P).length) return `<p class="mut">${S.boxQ.n||!S.boxReady?'Box scores en cours de récupération…':'Pas encore de box score.'}</p>`;
  return [['pts','Points'],['reb','Rebonds'],['ast','Passes'],['pir','Évaluation (PIR)']].map(([k,l])=>`<h3 style="margin:10px 0 4px;font-size:13px">${l}</h3>${leaders(P,k,3).map((r,i)=>`<div class="row between" style="padding:3px 0"><span>${i+1}. ${pAv(r,22)}${pLink(r.id,r.n)} <span class="mut">${esc(tm(r.team).tri)}</span></span><b>${f1(PC[k][1](r))}</b></div>`).join('')}`).join(''); }
function sourceCard(){ const c=S.games[S.sc], nb=Object.keys(S.box).filter(k=>k.startsWith(S.sc+':')).length, fin=list().filter(g=>g.st==='post').length;
  return `<details class="card"><summary><b>Source des données</b> <span class="mut">· API publique EuroLeague</span></summary><p class="mut" style="margin:8px 0">Calendrier et scores : <code>api-live.euroleague.net</code> · box scores : <code>live.euroleague.net</code>. Mise à jour automatique (toutes les 20 s pendant un match, sinon toutes les 15 min).</p>
  <p class="mut" style="margin:4px 0">Dernière lecture : ${c?new Date(c.t).toLocaleString('fr-FR'):'jamais'} · ${list().length} matchs · box scores : ${nb}/${fin} matchs terminés.${S.err.box?' Dernière erreur box score : '+esc(S.err.box):''}</p>
  <div class="row" style="margin-top:8px"><button class="sec" data-el="refresh">🔄 Relire maintenant</button><button class="sec" data-el="reboxes">Re-télécharger les box scores</button><button class="sec" data-el="diag">Copier le JSON brut d'un match</button></div>${S.diag?`<p class="mut" style="margin-top:6px">${esc(S.diag)}</p>`:''}</details>`; }

function vGames(){ const L=list(); if(!L.length) return vHome();
  const rounds=[...new Set(L.map(g=>g.r))].sort((a,b)=>a-b), r=S.gR&&rounds.includes(S.gR)?S.gR:curRound(), teams=Object.values(TM).sort((a,b)=>a.sn.localeCompare(b.sn));
  let gs=S.gTeam?L.filter(g=>g.h.code===S.gTeam||g.a.code===S.gTeam).sort((a,b)=>Date.parse(b.t)-Date.parse(a.t)):roundGames(r);
  const rl=x=>{ const g=L.find(y=>y.r===x); return (g&&g.rn)||('Journée '+x); };
  const nav=S.gTeam?'':`<button class="sec" data-el="round" data-v="${rounds[rounds.indexOf(r)-1]??''}" ${rounds.indexOf(r)<=0?'disabled':''}>◀</button><select data-el-sel="round">${rounds.map(x=>`<option value="${x}" ${x===r?'selected':''}>${esc(rl(x))}</option>`).join('')}</select><button class="sec" data-el="round" data-v="${rounds[rounds.indexOf(r)+1]??''}" ${rounds.indexOf(r)>=rounds.length-1?'disabled':''}>▶</button>`;
  return statusBar()+`<div class="card"><div class="row" style="margin-bottom:6px">${seasonSel()}${nav}<select data-el-sel="gteam"><option value="">Toutes les équipes</option>${teams.map(t=>`<option value="${esc(t.code)}" ${t.code===S.gTeam?'selected':''}>${esc(t.sn)}</option>`).join('')}</select><span class="mut">${gs.length} match(s) · touche un match pour le box score</span></div>${gs.length?byDay(gs,S.gTeam?false:true):'<p class="empty">Aucun match.</p>'}</div>`; }
function vCal(){ const L=list(); if(!L.length) return vHome(); const now=Date.now(), teams=Object.values(TM).sort((a,b)=>a.sn.localeCompare(b.sn));
  let gs=L.filter(g=>g.st!=='post'&&(Date.parse(g.t)||now)>now-3*36e5); if(S.cTeam) gs=gs.filter(g=>g.h.code===S.cTeam||g.a.code===S.cTeam); else if(S.cFav) gs=gs.filter(isFavG);
  gs.sort((a,b)=>Date.parse(a.t)-Date.parse(b.t)||a.code-b.code); const shown=gs.slice(0,60);
  return statusBar()+`<div class="card"><div class="row" style="margin-bottom:6px">${seasonSel()}<select data-el-sel="cteam"><option value="">Toutes les équipes</option>${teams.map(t=>`<option value="${esc(t.code)}" ${t.code===S.cTeam?'selected':''}>${esc(t.sn)}</option>`).join('')}</select><label class="mut"><input type="checkbox" data-el-sel="cfav" ${S.cFav?'checked':''}> Mes équipes seulement</label><span class="mut">${gs.length} match(s) à venir · heures de Paris</span></div>${shown.length?byDay(shown,false):'<p class="empty">Aucun match à venir'+(S.cFav&&!S.fav.teams.length?' : ajoute d\'abord une équipe en favori (☆).':'.')+'</p>'}${gs.length>60?'<p class="mut">… et '+(gs.length-60)+' autres.</p>':''}</div>`; }
function vTable(){ const D=data(); if(!list().length) return vHome();
  return statusBar()+`<div class="card"><div class="row" style="margin-bottom:10px">${seasonSel()}<span class="mut">Saison régulière, calculé à partir des résultats officiels. Départage : confrontations directes, puis écart de points.</span></div>${LEGEND}${standTable(D.ST,false)}</div>`; }
function vPlayers(){ const D=data(); if(!list().length) return vHome();
  let R=Object.values(D.P); const teams=Object.values(TM).sort((a,b)=>a.sn.localeCompare(b.sn)), tot=S.pMode==='tot';
  if(S.pTeam) R=R.filter(r=>r.team===S.pTeam); if(S.pFav) R=R.filter(r=>S.fav.players[r.id]||isFavT(r.team)); if(S.pMin>1) R=R.filter(r=>r.gp>=S.pMin);
  if(S.pQ){ const q=S.pQ.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); R=R.filter(r=>r.n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').includes(q)); }
  const k=S.pSort.k, d=S.pSort.d, val=r=>k==='n'?r.n:k==='team'?tm(r.team).sn:tot&&PC[k][3]?(k==='min'?r.min:r[k]):PC[k][1](r);
  R.sort((a,b)=>{ const x=val(a), y=val(b); return typeof x==='string'?d*x.localeCompare(y):d*(x-y)||b.gp-a.gp; });
  const cols=['gp','min','pts','reb','ast','stl','blk','to','pir','fg','f3','ft'], ar=c=>S.pSort.k===c?(S.pSort.d>0?' ▲':' ▼'):'';
  const th=cols.map(c=>`<th class="s" data-el="sort" data-k="${c}">${PC[c][0]}${ar(c)}</th>`).join('');
  const rows=R.slice(0,250).map((r,i)=>`<tr><td class="rk">${i+1}</td><td class="l pn">${starP(r.id,r.n)}${pAv(r,22)}${pLink(r.id,r.n)}</td><td class="hide-m l">${tLink(r.team)}</td>${cols.map(c=>`<td>${tot&&PC[c][3]?PC[c][3](r):PC[c][2](r)}</td>`).join('')}</tr>`).join('');
  const note=!Object.keys(D.P).length?`<p class="mut">${S.boxQ.n||!S.boxReady?'⏳ Récupération des box scores…':'Aucun box score pour l\'instant.'}</p>`:'';
  return statusBar()+`<div class="card"><div class="row" style="margin-bottom:10px">${seasonSel()}<input type="text" id="elQ" data-el-sel="pq" placeholder="Rechercher un joueur…" value="${esc(S.pQ)}" style="min-width:160px;flex:0 1 220px">
    <select data-el-sel="pteam"><option value="">Toutes les équipes</option>${teams.map(t=>`<option value="${esc(t.code)}" ${t.code===S.pTeam?'selected':''}>${esc(t.sn)}</option>`).join('')}</select>
    <select data-el-sel="pmode"><option value="avg" ${!tot?'selected':''}>Moyennes</option><option value="tot" ${tot?'selected':''}>Totaux</option></select>
    <select data-el-sel="pmin">${[1,3,5,8,10].map(n=>`<option value="${n}" ${S.pMin===n?'selected':''}>${n===1?'Tous les joueurs':n+' matchs mini'}</option>`).join('')}</select>
    <label class="mut"><input type="checkbox" data-el-sel="pfav" ${S.pFav?'checked':''}> Favoris</label><span class="mut">${R.length} joueur(s)</span></div>${note}
    <div class="scroll"><table><thead><tr><th>#</th><th class="l s pn" data-el="sort" data-k="n">Joueur${ar('n')}</th><th class="l s hide-m" data-el="sort" data-k="team">Équipe${ar('team')}</th>${th}</tr></thead><tbody>${rows||`<tr><td colspan="15" class="empty">Aucun joueur.</td></tr>`}</tbody></table></div>
    <p class="mut" style="margin-top:8px">INT = interceptions · CTR = contres · BP = balles perdues · PIR = évaluation EuroLeague.</p></div>`; }
function vTeams(){ const D=data(); if(!list().length) return vHome();
  const cards=D.ST.map(t=>`<div class="gt-tile click ${isFavT(t.code)?'fv':''}" data-el="team" data-id="${esc(t.code)}" style="--tc:${hex(tcol(t.code))};border-left:4px solid var(--tc)"><div class="gt-top"><span>${t.rk}e · ${t.w}-${t.l}</span>${starT(t.code)}</div><div class="gt-side"><span class="gt-t">${logo(t.code,34)}<b>${esc(tm(t.code).sn)}</b></span></div><div style="margin-top:6px">${formDotsE(t.log)}</div></div>`).join('');
  return statusBar()+`<div class="card"><div class="row" style="margin-bottom:10px">${seasonSel()}<span class="mut">${D.ST.length} équipes · touche une équipe pour sa fiche</span></div><div class="gt-grid el-teams">${cards}</div></div>`; }

/* ---------- 7. Fenêtres : box score, équipe, joueur ---------- */
function mGame(id){ const g=list().find(x=>x.id===id); if(!g) return ''; const b=S.box[g.id];
  const head=`<div class="row between"><h2 style="margin:0">${esc(g.h.sn)} – ${esc(g.a.sn)}</h2></div>`;
  const hs=g.st==='pre'?'':g.h.s, as=g.st==='pre'?'':g.a.s;
  const hr=`<div class="hero" style="--tc:${hex(tcol(g.h.code))};cursor:default"><div class="hero-eb">${esc([g.rn,g.phn&&!isRS(g)?g.phn:'',fDay(g.t)+(g.st==='pre'?' · '+fHour(g.t):'')].filter(Boolean).join(' · '))}</div><div class="hero-row"><div class="hero-t"><span class="hero-lg">${logo(g.h.code,44)}</span><b>${esc(tm(g.h.code).tri)}</b></div><div class="hero-s">${hs}<small>–</small>${as}</div><div class="hero-t"><span class="hero-lg">${logo(g.a.code,44)}</span><b>${esc(tm(g.a.code).tri)}</b></div></div><div class="hero-ft"><span class="hero-chip">${g.st==='post'?'Final':g.st==='in'?esc(liveTxt(g)):'À venir'}</span><span>${esc(g.v||'')}${g.aud?' · '+g.aud.toLocaleString('fr-FR')+' spectateurs':''}</span></div></div>`;
  const qh=(b&&b.qh)||g.qh, qa=(b&&b.qa)||g.qa, n=Math.max(qh.length,qa.length);
  const qt=n?`<div class="scroll"><table class="st"><thead><tr><th class="l">Équipe</th>${Array.from({length:n},(_,i)=>`<th>${i<4?'Q'+(i+1):'Prol.'+(n>5?i-3:'')}</th>`).join('')}<th>Total</th></tr></thead><tbody>${[[g.h,qh,qa],[g.a,qa,qh]].map(([s,q,o])=>`<tr><td class="l">${logo(s.code,18)}<b>${esc(s.sn)}</b></td>${Array.from({length:n},(_,i)=>`<td class="${q[i]!=null&&o[i]!=null&&q[i]>o[i]?'win':''}">${q[i]??'–'}</td>`).join('')}<td><b>${esc(String(s.s??''))}</b></td></tr>`).join('')}</tbody></table></div>`:'';
  if(g.st==='pre'){ const D=data(), row=c=>{ const t=D.ST.find(x=>x.code===c); return t?`<div class="row between" style="padding:6px 0"><span>${tLink(c)} <span class="mut">${t.rk}e · ${t.w}-${t.l}</span></span><span>${formDotsE(t.log)}</span></div>`:''; };
    const h2h=list().filter(x=>x.st==='post'&&((x.h.code===g.h.code&&x.a.code===g.a.code)||(x.h.code===g.a.code&&x.a.code===g.h.code))).sort((a,b)=>Date.parse(b.t)-Date.parse(a.t));
    return `<div class="card">${head}${hr}<h3>📈 Forme</h3>${row(g.h.code)}${row(g.a.code)}${h2h.length?`<h3>⚔️ Déjà cette saison</h3><div class="gt-list">${h2h.map(line).join('')}</div>`:''}</div>`; }
  if(!b) return `<div class="card">${head}${hr}${qt}<p class="mut">⏳ Box score en cours de récupération…</p></div>`;
  const tbl=(s,t,o)=>{ const ps=t.pl.filter(p=>p.min>0).sort((a,b)=>b.pts-a.pts||b.min-a.min), dnp=t.pl.filter(p=>!(p.min>0)), top=ps.length?ps[0].pts:0, w=(s.s||0)>(o.s||0), x=t.tot||{};
    const pm=v=>`<span class="${v>0?'pmp':v<0?'pmn':'mut'}">${v>0?'+':''}${v}</span>`;
    return `<div class="bx"><div class="bx-head" style="--tc:${hex(tcol(s.code))}">${logo(s.code,34)}<div class="bx-name">${esc(t.name||s.n)}<span class="mut">${g.st!=='post'?'En cours':w?'Victoire':'Défaite'}${t.coach&&t.coach!=='?'?' · coach '+esc(t.coach):''}</span></div><div class="bx-score ${w||g.st!=='post'?'':'lose'}">${esc(String(s.s??''))}</div></div><div class="scroll"><table class="bxt"><thead><tr><th class="l">Joueur</th><th class="pt">PTS</th><th>REB</th><th>AST</th><th>INT</th><th>CTR</th><th>BP</th><th>2P</th><th>3P</th><th>LF</th><th>MIN</th><th>+/-</th><th>PIR</th></tr></thead><tbody>
    ${ps.map(p=>`<tr><td class="l bxp">${starP(p.id,p.n)}<span class="mut">${esc(p.no)}</span> ${pLink(p.id,p.n)}${p.st?' <span class="mut" title="Titulaire">•</span>':''}</td><td class="pt"><b class="${p.pts===top&&top>0?'best':''}">${p.pts}</b></td><td>${p.reb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td><td>${p.to}</td><td>${p.f2m}/${p.f2a}</td><td>${p.f3m}/${p.f3a}</td><td>${p.ftm}/${p.fta}</td><td class="mut">${Math.round(p.min)}</td><td>${pm(p.pm)}</td><td><b>${p.pir}</b></td></tr>`).join('')}
    <tr class="bx-tot"><td class="l">Total équipe</td><td class="pt"><b>${esc(String(s.s??x.pts??''))}</b></td><td>${x.reb??''}</td><td>${x.ast??''}</td><td>${x.stl??''}</td><td>${x.blk??''}</td><td>${x.to??''}</td><td>${x.f2m??''}/${x.f2a??''}</td><td>${x.f3m??''}/${x.f3a??''}</td><td>${x.ftm??''}/${x.fta??''}</td><td></td><td></td><td>${x.pir??''}</td></tr></tbody></table></div>${dnp.length?`<p class="mut" style="margin:6px 10px">N'ont pas joué : ${dnp.map(p=>esc(p.n)).join(', ')}</p>`:''}</div>`; };
  const tops=[...b.h.pl.map(p=>({p,c:g.h.code})),...b.a.pl.map(p=>({p,c:g.a.code}))].filter(x=>x.p.min>0).sort((x,y)=>y.p.pir-x.p.pir).slice(0,3);
  const tp=tops.length?`<div class="bx-tops">${tops.map(({p,c})=>`<div class="bx-tp click" data-el="player" data-id="${esc(p.id)}"><span class="bx-av">${pAv({n:p.n,team:c},40)}</span><b>${esc(p.n)}</b><span class="mut">${esc(tm(c).tri)}</span><span>${p.pts} pts · ${p.reb} reb · ${p.ast} ast</span><span class="mut">PIR ${p.pir}</span></div>`).join('')}</div>`:'';
  return `<div class="card print-target">${head}${hr}${qt}${tp}${tbl(g.h,b.h,g.a)}${tbl(g.a,b.a,g.h)}${b.ref?`<p class="mut">Arbitres : ${esc(b.ref)}</p>`:''}</div>`; }
function mTeam(c){ const D=data(), t=D.ST.find(x=>x.code===c); if(!t) return ''; const T=tm(c), col=hex(tcol(c)), now=Date.now();
  const gs=list().filter(g=>g.h.code===c||g.a.code===c), past=gs.filter(g=>g.st==='post').sort((a,b)=>Date.parse(b.t)-Date.parse(a.t)), next=gs.filter(g=>g.st!=='post'&&Date.parse(g.t)>now-3*36e5).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t)).slice(0,5);
  const ro=Object.values(D.P).filter(r=>r.team===c).sort((a,b)=>b.pts/b.gp-a.pts/a.gp);
  const avg=x=>t.g?f1(x/t.g):'–';
  return `<div class="card print-target" style="border-left:4px solid ${col}"><div class="row between"><span></span></div><div class="phead" style="background:linear-gradient(135deg,${col}33,transparent 65%)">${logo(c,84)}<div class="pinfo"><div class="pname">${starT(c)}${esc(T.n)}</div><div class="psub">${t.rk}e · ${t.w} V – ${t.l} D · domicile ${t.hw}-${t.hl} · extérieur ${t.aw}-${t.al}</div><div style="margin-top:6px">${formDotsE(t.log,10)} <span class="mut">· série ${streakE(t.log)}</span></div></div></div>
  <div class="row" style="gap:18px;margin-bottom:10px"><span>Marqués <b>${avg(t.pf)}</b>/match</span><span>Encaissés <b>${avg(t.pa)}</b>/match</span><span>Écart <b class="${t.pf>=t.pa?'ok':'err'}">${t.g?((t.pf-t.pa)/t.g>0?'+':'')+f1((t.pf-t.pa)/t.g):'–'}</b></span></div>
  ${next.length?`<h3>📅 Prochains matchs</h3><div class="gt-list">${next.map(line).join('')}</div>`:''}
  ${past.length?`<h3>📋 Résultats</h3><div class="gt-list">${past.slice(0,12).map(line).join('')}</div>`:''}
  ${ro.length?`<h3>👤 Joueurs (moyennes)</h3><div class="scroll"><table><thead><tr><th class="l">Joueur</th><th>MJ</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>PIR</th><th>3P%</th></tr></thead><tbody>${ro.map(r=>`<tr><td class="l">${starP(r.id,r.n)}${pLink(r.id,r.n)}</td><td>${r.gp}</td><td>${f1(r.min/r.gp)}</td><td><b>${f1(r.pts/r.gp)}</b></td><td>${f1(r.reb/r.gp)}</td><td>${f1(r.ast/r.gp)}</td><td>${f1(r.pir/r.gp)}</td><td>${pc(r.f3m,r.f3a)}</td></tr>`).join('')}</tbody></table></div>`:''}</div>`; }
function mPlayer(id){ const D=data(), r=D.P[id]; if(!r) return ''; const col=hex(tcol(r.team)), L=r.log.slice().sort((a,b)=>Date.parse(b.t)-Date.parse(a.t));
  const best=k=>Math.max(...r.log.map(x=>x.p[k]||0));
  return `<div class="card print-target" style="border-left:4px solid ${col}"><div class="row between"><span></span></div><div class="phead" style="background:linear-gradient(135deg,${col}33,transparent 65%)">${pAv(r,84)}<div class="pinfo"><div class="pname">${starP(r.id,r.n)}${esc(r.n)}</div><div class="psub">${tLink(r.team)} · ${r.gp} match(s), ${r.gs} titulaire</div></div></div>
  <div class="row" style="gap:18px;margin-bottom:10px">${['pts','reb','ast','pir','min'].map(k=>`<span>${PC[k][0]} <b>${f1(PC[k][1](r))}</b></span>`).join('')}<span>TIR <b>${pc(r.fgm,r.fga)}%</b></span><span>3P <b>${pc(r.f3m,r.f3a)}%</b></span><span>LF <b>${pc(r.ftm,r.fta)}%</b></span></div>
  <p class="mut">Records cette saison : ${best('pts')} pts · ${best('reb')} reb · ${best('ast')} ast · PIR ${best('pir')}</p>
  <h3>📋 Match par match</h3><div class="scroll"><table><thead><tr><th class="l">Date</th><th class="l">Adversaire</th><th>Rés.</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>2P</th><th>3P</th><th>LF</th><th>PIR</th></tr></thead><tbody>${L.map(x=>`<tr class="click" data-el="game" data-id="${esc(x.id)}"><td class="l">${esc(fDayS(x.t))}</td><td class="l">${x.home?'vs':'@'} ${logo(x.opp,18)}${esc(tm(x.opp).sn)}</td><td class="${x.win?'ok':'err'}">${x.win?'V':'D'}</td><td>${Math.round(x.p.min)}</td><td><b>${x.p.pts}</b></td><td>${x.p.reb}</td><td>${x.p.ast}</td><td>${x.p.f2m}/${x.p.f2a}</td><td>${x.p.f3m}/${x.p.f3a}</td><td>${x.p.ftm}/${x.p.fta}</td><td>${x.p.pir}</td></tr>`).join('')}</tbody></table></div></div>`; }

/* ---------- 8. Branchement dans Statify ---------- */
let modalOn=false;
window.euroRender=function(){ $('#tabs').innerHTML=TABS.map(([k,i,l])=>`<button data-act="tab" data-t="${k}" class="${S.tab===k?'on':''}"><i>${i}</i><span>${esc(l)}</span></button>`).join('');
  data(); const f={home:vHome,games:vGames,cal:vCal,table:vTable,players:vPlayers,teams:vTeams}[S.tab]||vHome;
  let v; try{ v=f(); }catch(e){ console.error(e); v='<div class="card err">Erreur d\'affichage Euroligue : '+esc(e.message)+'</div>'; }
  $('#view').innerHTML=v;
  let mh=''; try{ if(S.open) mh=S.open.k==='game'?mGame(S.open.id):S.open.k==='team'?mTeam(S.open.id):S.open.k==='player'?mPlayer(S.open.id):''; }catch(e){ console.error(e); mh='<div class="card err">Erreur : '+esc(e.message)+'</div>'; }
  if(S.open&&!mh) S.open=null;
  const M=$('#modal'), keep=M.classList.contains('on')&&modalOn?M.scrollTop:0; M.firstElementChild.innerHTML=mh; M.classList.toggle('on',!!mh); document.body.style.overflow=mh?'hidden':''; M.scrollTop=keep; modalOn=!!mh;
  try{ modalHist(!!mh); }catch(e){}
  if(S.open&&S.open.k==='game'){ const g=list().find(x=>x.id===S.open.id); if(g&&needBox(g)&&!S.busy['b'+g.id]){ S.busy['b'+g.id]=1; fetchBox(g).then(()=>{ S.busy['b'+g.id]=0; saveBox(); redraw(); }); } }
  loadGames(false); ensureBoxes(); if(!S.live._t||Date.now()-S.live._t>15e3){ S.live._t=Date.now(); liveTick(); } };
window.euroRefresh=euroRefresh;
window.euroClose=()=>{ S.open=null; };
window.Euro={parseGames,parseBox,pGame,state:S,standings:()=>data().ST,players:()=>data().P};
if(ui.sport==='euro') render();   // le premier rendu a eu lieu avant le chargement de ce fichier

const open=(k,id)=>{ S.open={k,id}; const M=$('#modal'); if(M) M.scrollTop=0; render(); };
document.addEventListener('click',e=>{ if(ui.sport!=='euro') return;
  const tb=e.target.closest&&e.target.closest('#tabs [data-act=tab]'); if(tb){ e.stopPropagation(); e.preventDefault(); S.tab=tb.dataset.t; S.open=null; savePref(); render(); window.scrollTo(0,0); return; }
  const el=e.target.closest&&e.target.closest('#view [data-el],#modal [data-el]'); if(!el) return; const a=el.dataset.el, id=el.dataset.id, v=el.dataset.v;
  if(a==='favt'||a==='favp'){ e.stopPropagation(); e.preventDefault(); if(a==='favt'){ const i=S.fav.teams.indexOf(id); if(i>=0) S.fav.teams.splice(i,1); else S.fav.teams.push(id); } else { if(S.fav.players[id]) delete S.fav.players[id]; else S.fav.players[id]={n:el.dataset.n}; } saveFav(); render(); return; }
  e.stopPropagation();
  if(a==='game') open('game',id); else if(a==='team') open('team',id); else if(a==='player') open('player',id);
  else if(a==='close'){ S.open=null; render(); }
  else if(a==='go'){ S.tab=v; savePref(); render(); window.scrollTo(0,0); }
  else if(a==='round'){ if(v!==''){ S.gR=+v; render(); } }
  else if(a==='sort'){ const k=el.dataset.k; S.pSort=S.pSort.k===k?{k,d:-S.pSort.d}:{k,d:k==='n'||k==='team'?1:-1}; render(); }
  else if(a==='refresh') euroRefresh(true);
  else if(a==='reboxes'){ for(const k of Object.keys(S.box)) if(k.startsWith(S.sc+':')) delete S.box[k]; S.boxFail={}; saveBox(); render(); ensureBoxes(); }
  else if(a==='diag'){ const g=list().filter(x=>x.st==='post').sort((x,y)=>Date.parse(y.t)-Date.parse(x.t))[0]||list()[0]; if(!g){ S.diag='Aucun match chargé.'; render(); return; }
    S.diag='Lecture…'; render(); Promise.all([jget(SRC.games(S.sc)).then(j=>{ const arr=(j&&(j.data||j))||[]; return Array.isArray(arr)?arr.find(x=>+first(x.gameCode,x.code)===g.code):null; }).catch(x=>'erreur : '+x.message),jget(SRC.box(g.sc,g.code)).catch(x=>'erreur : '+x.message)])
      .then(([gm,bx])=>{ const t=JSON.stringify({match:gm,boxscore:bx},null,1); try{ navigator.clipboard.writeText(t); S.diag='JSON brut du match n°'+g.code+' copié ('+Math.round(t.length/1024)+' Ko).'; }catch(x){ S.diag='Copie impossible : '+x.message; } render(); }); }
},true);
// fermeture de la fenêtre : croix, clic à côté, Échap, bouton retour
document.addEventListener('click',e=>{ if(ui.sport!=='euro'||!S.open) return; if(e.target.id==='mclose'||e.target.id==='modal'){ S.open=null; } },true);
document.addEventListener('keydown',e=>{ if(ui.sport==='euro'&&S.open&&e.key==='Escape'){ S.open=null; render(); } });
window.addEventListener('popstate',()=>{ if(ui.sport==='euro'&&S.open){ S.open=null; modalOn=false; } },true);
document.addEventListener('change',e=>{ if(ui.sport!=='euro') return; const el=e.target.closest&&e.target.closest('#view [data-el-sel]'); if(!el) return; const k=el.dataset.elSel, v=el.value;
  if(k==='season'){ S.sc=v; S.gR=0; S.gTeam=S.cTeam=S.pTeam=''; savePref(); render(); loadGames(false); }
  else if(k==='round'){ S.gR=+v; render(); } else if(k==='gteam'){ S.gTeam=v; render(); } else if(k==='cteam'){ S.cTeam=v; render(); } else if(k==='cfav'){ S.cFav=el.checked; savePref(); render(); }
  else if(k==='pteam'){ S.pTeam=v; render(); } else if(k==='pmode'){ S.pMode=v; savePref(); render(); } else if(k==='pmin'){ S.pMin=+v; savePref(); render(); } else if(k==='pfav'){ S.pFav=el.checked; render(); } });
let qT=null; document.addEventListener('input',e=>{ if(ui.sport!=='euro'||!e.target.matches||!e.target.matches('#elQ')) return; const el=e.target; clearTimeout(qT); qT=setTimeout(()=>{ S.pQ=el.value; const p=el.selectionStart; render(); const n=document.getElementById('elQ'); if(n){ n.focus(); try{ n.setSelectionRange(p,p); }catch(x){} } },250); });
})();
