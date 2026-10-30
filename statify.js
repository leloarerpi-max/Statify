/* ================= Données & constantes ================= */
const KEY='suivi-nba-v1', KEYF='suivi-nba-fav', KEYS='suivi-nba-sched', KEYT='suivi-nba-theme', KEYN='suivi-nba-notes', KEYB='suivi-nba-backup', KEYH='suivi-nba-home';
const CDN = id => `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${id}.json`;
const TEAMS={ATL:['Atlanta Hawks','E'],BOS:['Boston Celtics','E'],BKN:['Brooklyn Nets','E'],CHA:['Charlotte Hornets','E'],CHI:['Chicago Bulls','E'],CLE:['Cleveland Cavaliers','E'],DAL:['Dallas Mavericks','W'],DEN:['Denver Nuggets','W'],DET:['Detroit Pistons','E'],GSW:['Golden State Warriors','W'],HOU:['Houston Rockets','W'],IND:['Indiana Pacers','E'],LAC:['LA Clippers','W'],LAL:['Los Angeles Lakers','W'],MEM:['Memphis Grizzlies','W'],MIA:['Miami Heat','E'],MIL:['Milwaukee Bucks','E'],MIN:['Minnesota Timberwolves','W'],NOP:['New Orleans Pelicans','W'],NYK:['New York Knicks','E'],OKC:['Oklahoma City Thunder','W'],ORL:['Orlando Magic','E'],PHI:['Philadelphia 76ers','E'],PHX:['Phoenix Suns','W'],POR:['Portland Trail Blazers','W'],SAC:['Sacramento Kings','W'],SAS:['San Antonio Spurs','W'],TOR:['Toronto Raptors','E'],UTA:['Utah Jazz','W'],WAS:['Washington Wizards','E']};
const tname = tri => TEAMS[tri] ? TEAMS[tri][0] : tri;
const TEAM_ID={ATL:1610612737,BOS:1610612738,CLE:1610612739,NOP:1610612740,CHI:1610612741,DAL:1610612742,DEN:1610612743,GSW:1610612744,HOU:1610612745,LAC:1610612746,LAL:1610612747,MIA:1610612748,MIL:1610612749,MIN:1610612750,BKN:1610612751,NYK:1610612752,ORL:1610612753,IND:1610612754,PHI:1610612755,PHX:1610612756,POR:1610612757,SAC:1610612758,SAS:1610612759,OKC:1610612760,TOR:1610612761,UTA:1610612762,MEM:1610612763,WAS:1610612764,DET:1610612765,CHA:1610612766};
const TCOL={ATL:'#E03A3E',BOS:'#00A04A',BKN:'#7A7F87',CHA:'#1D9AB0',CHI:'#CE1141',CLE:'#B0264F',DAL:'#1E7BC6',DEN:'#FEC524',DET:'#C8102E',GSW:'#2D6BD6',HOU:'#CE1141',IND:'#FDBB30',LAC:'#3B82C4',LAL:'#8A4FD0',MEM:'#5D76A9',MIA:'#C8123F',MIL:'#00843D',MIN:'#2A7AB8',NOP:'#B4975A',NYK:'#F58426',OKC:'#007AC1',ORL:'#0077C0',PHI:'#ED174C',PHX:'#E56020',POR:'#D3202F',SAC:'#7B4BB0',SAS:'#8F9BA3',TOR:'#CE1141',UTA:'#F9A01B',WAS:'#E31837'};
const tcolor = tri => TCOL[tri] || '#34b64f';
const ink = c => { const n=parseInt(c.slice(1),16); return (((n>>16)*299+(((n>>8)&255)*587)+((n&255)*114))/1000)>150?'#1b2438':'#ffffff'; };
const cdist = (x,y) => { const p=parseInt(x.slice(1),16), q=parseInt(y.slice(1),16); return Math.hypot((p>>16)-(q>>16),((p>>8)&255)-((q>>8)&255),(p&255)-(q&255)); };
function pickColors(cs){ const fb=['#34b64f','#f0b010','#f07020']; const out=[]; cs.forEach((c,i)=>{ let col=c||fb[i%3]; if(out.some(o=>cdist(o,col)<70)) col=fb.find(f=>!out.some(o=>cdist(o,f)<70))||fb[i%3]; out.push(col); }); return out; }
const TABS=[['home','Accueil'],['games','Matchs'],['players','Joueurs'],['teams','Équipes'],['standings','Classement'],['studio','Studio'],['race','Qualification'],['records','Records'],['compare','Comparer'],['rest','Repos'],['cal','Calendrier']];
const HOME_BLOCKS=[['tonight','Ce soir (heure de Paris)'],['kpis','Chiffres clés'],['alerts','Alertes sur mes favoris'],['week','Équipe de la semaine'],['bigmatch','Gros matchs à venir'],['news','Actus NBA (français)'],['duel','Duel de la semaine'],['favs','Mes favoris'],['notes','Mes notes'],['results','Derniers résultats'],['scorers','Meilleurs marqueurs']];
const HOME_FULL=['kpis','alerts','week','favs','notes','news'];

function loadJ(k,d){ try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; }catch(e){ return d; } }
/* ---- Grosse mémoire : copie dans IndexedDB (beaucoup plus de place que localStorage, limité à ~5 Mo sur iPhone) ---- */
var IDBP=null;
function idbOpen(){ if(!window.indexedDB) return Promise.reject(new Error('pas d\'IndexedDB')); return IDBP||(IDBP=new Promise((res,rej)=>{ const r=indexedDB.open('statify',1); r.onupgradeneeded=()=>{ try{ r.result.createObjectStore('kv'); }catch(e){} }; r.onsuccess=()=>res(r.result); r.onerror=()=>{ IDBP=null; rej(r.error); }; })); }
async function idbSet(k,v){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction('kv','readwrite'); tx.objectStore('kv').put(v,k); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); tx.onabort=()=>rej(tx.error); }); }
async function idbGet(k){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction('kv','readonly'), q=tx.objectStore('kv').get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); }
var bigT={};
function bigSave(k,obj){ const t=Date.now(); let ok=false;
  try{ localStorage.setItem(k,JSON.stringify(obj)); ok=true; }catch(e){ try{ localStorage.removeItem(k); }catch(x){} }
  try{ localStorage.setItem('suivi-ts-'+k,String(t)); }catch(e){}
  clearTimeout(bigT[k]); bigT[k]=setTimeout(()=>{ idbSet(k,{t,v:obj}).catch(()=>{}); },800);
  return ok||!!window.indexedDB; }
function bigFlush(){ for(const k of Object.keys(bigT)){ clearTimeout(bigT[k]); delete bigT[k]; } try{ idbSet(KEY,{t:Date.now(),v:games}).catch(()=>{}); idbSet(KEYFO,{t:Date.now(),v:foot}).catch(()=>{}); }catch(e){} }
function saveJ(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
let games = loadJ(KEY,{});
let fav = loadJ(KEYF,{teams:[],players:{}}); if(!fav.teams) fav.teams=[]; if(!fav.players) fav.players={};
let sched = loadJ(KEYS,[]);
let liveData={items:[],t:0,err:'',busy:false}, liveMem={}, liveLast=0, liveSeen=new Set();
let notes = loadJ(KEYN,{});
let backup = loadJ(KEYB,{last:null,snooze:0});
let homeCfg = loadJ(KEYH,{order:HOME_BLOCKS.map(b=>b[0]),hidden:[]});
/* Anti-doublons : un même match (mêmes équipes, à moins de 30 h d'écart) ne peut exister qu'une fois ; on garde la version officielle (id NBA) */
function dedupeGames(){ const by={}; let n=0;
  for(const g of Object.values(games)){ if(g.status!==3||!g.time||!g.home||!g.away) continue; (by[g.home.tri+'|'+g.away.tri] ||= []).push(g); }
  for(const k in by){ const L=by[k].sort((a,b)=>tms(a)-tms(b));
    for(let i=0;i<L.length;i++) for(let j=i+1;j<L.length;j++){ const a=L[i], b=L[j]; if(!games[a.id]||!games[b.id]) continue;
      if(Math.abs(tms(b)-tms(a))>=30*36e5) continue;
      const esp=g=>/^espn/.test(String(g.id)), np=g=>(g.home.players||[]).length+(g.away.players||[]).length;
      const drop=(esp(a)!==esp(b))?(esp(a)?a:b):(np(a)>=np(b)?b:a); delete games[drop.id]; n++; } }
  return n; }
const save = () => { try{ dedupeGames(); }catch(e){} return bigSave(KEY,games); };
const saveFav = () => saveJ(KEYF,fav);

const ui = {tab:'home', openGame:null, openPlayer:null, openTeam:null, gTeam:'',
  pMode:'avg', pSort:{k:'pts',d:-1}, pTeam:'', pSearch:'', pMin:1, pFav:false,
  cmpMode:'players', cmpA:'', cmpB:'', confF:'EW', recMin:1, schedFav:false, raceF:'E', sport:(()=>{ try{ return localStorage.getItem('suivi-sport')==='foot'?'foot':'nba'; }catch(e){ return 'nba'; } })(), ftab:'home', fLg:'', fPer:0, calEarly:false, calTeam:'', calWhen:'up', calMonth:'', weekMin:2, homeEdit:false, rkT:null};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sayT=null, sayMute=false;
function say(t, cls='mut'){ if(sayMute) return; const m=$('#msg'); m.className='nbaonly '+cls; m.innerHTML=t; clearTimeout(sayT); if(t) sayT=setTimeout(()=>{ m.innerHTML=''; const f=document.getElementById('fmsg'); if(f){ f.innerHTML=''; f.style.display='none'; } },/err|warn/.test(cls)?20000:7000); const f=document.getElementById('fmsg'); if(f){ f.className=cls; f.innerHTML=t; f.style.display=ui.sport==='foot'&&t?'block':'none'; } }
const f1 = x => Number.isFinite(x) ? x.toFixed(1) : '–';
const pc = (a,b) => b>0 ? (100*a/b).toFixed(1)+'%' : '–';
const pcn = (a,b) => b>0 ? 100*a/b : -1;
const tms = g => Date.parse(g.time) || 0;
const fmtD = iso => { const d=new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}); };
const fmtDS = iso => { const d=new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(',',''); };
const fmtDT = iso => { const d=new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('fr-FR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}); };

/* ================= Parsing ================= */
function mins(s){ const m=/PT(\d+)M([\d.]+)S/.exec(s||''); return m ? (+m[1]+(+m[2])/60) : 0; }
function parseTeam(t){
  const s=t.statistics||{};
  return {
    tri:t.teamTricode, name:`${t.teamCity||''} ${t.teamName||''}`.trim() || tname(t.teamTricode), score:t.score ?? s.points ?? 0,
    q:(Array.isArray(t.periods)?t.periods.map(x=>+x.score).filter(n=>Number.isFinite(n)):[]),
    st:{fgm:s.fieldGoalsMade,fga:s.fieldGoalsAttempted,tpm:s.threePointersMade,tpa:s.threePointersAttempted,ftm:s.freeThrowsMade,fta:s.freeThrowsAttempted,reb:s.reboundsTotal,ast:s.assists,stl:s.steals,blk:s.blocks,to:s.turnovers,pf:s.foulsPersonal,oreb:s.reboundsOffensive??null,dreb:s.reboundsDefensive??null},
    players:(t.players||[]).map(p=>{
      const q=p.statistics||{};
      return {id:p.personId,name:p.name,tri:t.teamTricode,pos:p.position||'',starter:p.starter==='1',
        min:mins(q.minutes),pts:q.points||0,reb:q.reboundsTotal||0,ast:q.assists||0,stl:q.steals||0,blk:q.blocks||0,
        to:q.turnovers||0,pf:q.foulsPersonal||0,fgm:q.fieldGoalsMade||0,fga:q.fieldGoalsAttempted||0,
        tpm:q.threePointersMade||0,tpa:q.threePointersAttempted||0,ftm:q.freeThrowsMade||0,fta:q.freeThrowsAttempted||0,
        pm:q.plusMinusPoints||0,oreb:q.reboundsOffensive??null,dreb:q.reboundsDefensive??null};
    })
  };
}
function findGame(o,d=0){
  if(!o||typeof o!=='object'||d>8) return null;
  if(o.homeTeam&&o.awayTeam&&(o.homeTeam.players||o.homeTeam.statistics)) return o;
  for(const k in o){ const r=findGame(o[k],d+1); if(r) return r; }
  return null;
}
function parseGame(json,fallbackId){
  const g=findGame(json); if(!g) throw new Error('aucun match trouvé dans ces données');
  const txt=(g.gameStatusText||'').trim();
  return {id:g.gameId||fallbackId,status:g.gameStatus ?? (/final/i.test(txt)?3:2),statusText:txt,
    time:g.gameTimeUTC||g.gameEt||'',home:parseTeam(g.homeTeam),away:parseTeam(g.awayTeam)};
}
function findSchedule(o,d=0){
  if(!o||typeof o!=='object'||d>6) return null;
  if(Array.isArray(o.gameDates)) return o;
  for(const k in o){ const r=findSchedule(o[k],d+1); if(r) return r; }
  return null;
}
function parseSchedule(json){
  const s=findSchedule(json); if(!s) return null;
  const out=[];
  for(const d of s.gameDates) for(const g of (d.games||[])){
    if(!g.homeTeam||!g.awayTeam) continue;
    out.push({id:g.gameId,t:g.gameDateTimeUTC||g.gameDateTimeEst||g.gameDateEst||d.gameDate||'',h:g.homeTeam.teamTricode,a:g.awayTeam.teamTricode,s:g.gameStatus});
  }
  return out.filter(x=>x.h&&x.a);
}
function splitJson(t){
  const out=[]; let depth=0,start=-1,inStr=false,bs=false;
  for(let i=0;i<t.length;i++){
    const c=t[i];
    if(inStr){ if(bs) bs=false; else if(c==='\\') bs=true; else if(c==='"') inStr=false; continue; }
    if(c==='"'){ if(depth>0) inStr=true; continue; }
    if(c==='{'){ if(depth===0) start=i; depth++; }
    else if(c==='}'&&depth>0){ depth--; if(depth===0) out.push(t.slice(start,i+1)); }
  }
  return out;
}

/* ================= Ajout de données ================= */
function ingest(text){
  const parts=splitJson(text); if(!parts.length) throw new Error('aucun JSON reconnu');
  let g=0,s=0,nw=0,f=0,na=0; const errs=[];
  for(const p of parts){
    let o; try{ o=JSON.parse(p); }catch(e){ errs.push('JSON invalide'); continue; }
    if(o&&o.__foot){ f+=footIngest(o); continue; }
    if(o&&o.__news){ na+=newsIngest(o); continue; }
    const sc=parseSchedule(o);
    if(sc&&sc.length){ sched=sc; saveJ(KEYS,sched); s=sc.length; continue; }
    try{ const gm=parseGame(o,null); const old=games[gm.id]; if(!old||old.status!==3) nw++; games[gm.id]=gm; g++; }catch(e){ errs.push(e.message); }
  }
  save(); if(f){ footSave(); if(!g&&!s) setSport('foot'); } if(na&&!g&&!s&&!f){ setSport('nba'); ui.tab='home'; } render();
  return {g,s,nw,f,na,errs};
}
function report(r){
  const bits=[]; if(r.g) bits.push(`${r.g} match(s) ajouté(s) : ${r.nw} nouveau(x), ${r.g-r.nw} déjà connu(s)`); if(r.s) bits.push(`calendrier de ${r.s} matchs enregistré`); if(r.f) bits.push(`${r.f} lot(s) de données foot enregistré(s)`); if(r.na) bits.push(`${r.na} article(s) d'actus enregistré(s)`);
  if(!bits.length) say('Rien reconnu : '+esc(r.errs[0]||'format inconnu'),'err');
  else say('✓ '+bits.join(', ')+(r.errs.length?` (${r.errs.length} élément(s) ignoré(s))`:''),'ok');
}
function extractIds(text){ const out=new Set(); let m; const re=/(?<!\d)(00\d{8})(?!\d)/g; while((m=re.exec(text))) out.add(m[1]); return [...out]; }
const lastErr={};
async function fetchGame(id){
  const errs=[]; const urls=[];
  if(location.protocol.startsWith('http')) urls.push('/api/boxscore/'+id);
  urls.push(CDN(id));
  urls.push('https://corsproxy.io/?url='+encodeURIComponent(CDN(id)));
  for(const u of urls){
    try{ const r=await fetch(u,{cache:'no-store'}); if(!r.ok){ errs.push('HTTP '+r.status); continue; } return parseGame(await r.json(),id); }
    catch(e){ errs.push(e.message||String(e)); }
  }
  lastErr[id]=errs.join(' | '); throw new Error(lastErr[id]);
}
async function addFromInput(){
  const v=$('#url').value.trim();
  if(v[0]==='{'){ try{ report(ingest(v)); $('#url').value=''; }catch(e){ say('Texte non reconnu : '+esc(e.message),'err'); } return; }
  const ids=extractIds(v);
  if(!ids.length){ say('Aucun numéro de match trouvé (il doit contenir un identifiant comme 0022600001).','err'); return; }
  $('#manualLink').href=CDN(ids[0]); $('#manualLink').textContent=CDN(ids[0]);
  let ok=0; const ko=[];
  for(const id of ids){ say(`Récupération ${id}… (${ok+ko.length+1}/${ids.length})`); try{ games[id]=await fetchGame(id); ok++; }catch(e){ ko.push(id); } }
  save(); render();
  if(ok){ say(`✓ ${ok} match(s) ajouté(s)/mis à jour.`+(ko.length?` Échec pour : ${ko.join(', ')}.`:''),ko.length?'warn':'ok'); $('#url').value=''; }
  else { say(`Impossible de lire ${ko.join(', ')} (${esc(lastErr[ko[0]]||'erreur inconnue')}). Utilise le marque-page, ou « ajout manuel du JSON ».`,'err'); document.getElementById('manualBox').open=true; }
}
/* ---- NBA via ESPN (lecture ouverte depuis le fichier) ---- */
const ESPN_TRI={WSH:'WAS',NO:'NOP',UTAH:'UTA',SA:'SAS',NY:'NYK',GS:'GSW'};
const etri=a=>ESPN_TRI[a]||a;
const nname=n=>String(n||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[.'’-]/g,' ').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/\s+/g,' ').trim();
function espnIdMaps(){ const byTeam={}, byName={}; for(const g of Object.values(games)) for(const side of ['home','away']) for(const p of g[side].players){ const k=nname(p.name); byTeam[p.tri+'|'+k]=p.id; (byName[k] ||= new Set()).add(String(p.id)); } return {byTeam,byName}; }
function espnParseSummary(sm,nbaId,maps){
  const hd=((sm.header||{}).competitions||[])[0]; if(!hd) throw new Error('en-tête du match absent');
  const comp={}; for(const c of hd.competitors||[]) comp[c.homeAway]={tri:etri((c.team||{}).abbreviation),tid:String((c.team||{}).id),score:+c.score||0,q:(c.linescores||[]).map(x=>+x.value).filter(Number.isFinite)};
  if(!comp.home||!comp.away) throw new Error('équipes introuvables');
  const bp=(sm.boxscore||{}).players||[]; if(!bp.length) throw new Error('boxscore joueurs absent');
  const bt=(sm.boxscore||{}).teams||[];
  const num=v=>{ const n=parseInt(String(v).replace('+',''),10); return Number.isFinite(n)?n:0; };
  const pair=v=>{ const m=String(v||'').split('-'); return [num(m[0]),num(m[1])]; };
  const side=sd=>{ const c=comp[sd]; const blk=bp.find(b=>String((b.team||{}).id)===c.tid); if(!blk) throw new Error('joueurs de '+c.tri+' absents');
    const players=[]; const stt=(blk.statistics||[])[0]||{}; const keys=stt.keys||[];
    for(const a of (stt.athletes||[])){ if(a.didNotPlay||!(a.stats||[]).length) continue; const o={}; keys.forEach((k,i)=>{ o[k]=a.stats[i]; });
      const [fgm,fga]=pair(o['fieldGoalsMade-fieldGoalsAttempted']), [tpm,tpa]=pair(o['threePointFieldGoalsMade-threePointFieldGoalsAttempted']), [ftm,fta]=pair(o['freeThrowsMade-freeThrowsAttempted']);
      const at=a.athlete||{}, nm=at.displayName||at.fullName||'?', k=nname(nm); let id=maps.byTeam[c.tri+'|'+k]; if(id==null){ const set=maps.byName[k]; id=(set&&set.size===1)?[...set][0]:'e'+at.id; if(/^\d+$/.test(String(id))) id=+id; }
      players.push({id,name:nm,tri:c.tri,pos:(at.position&&at.position.abbreviation)||'',starter:!!a.starter,min:num(o.minutes),pts:num(o.points),reb:num(o.rebounds),ast:num(o.assists),stl:num(o.steals),blk:num(o.blocks),to:num(o.turnovers),pf:num(o.fouls),fgm,fga,tpm,tpa,ftm,fta,pm:num(o.plusMinus),oreb:num(o.offensiveRebounds),dreb:num(o.defensiveRebounds)}); }
    const sum=k=>players.reduce((t,p)=>t+p[k],0);
    const tb=bt.find(t=>String((t.team||{}).id)===c.tid), tv=lab=>{ const x=((tb||{}).statistics||[]).find(z=>z.label===lab||z.name===lab); return x?x.displayValue:null; };
    const rebT=tv('Rebounds'), orT=tv('Offensive Rebounds'), drT=tv('Defensive Rebounds');
    return {tri:c.tri,name:tname(c.tri),score:c.score,q:c.q,st:{fgm:sum('fgm'),fga:sum('fga'),tpm:sum('tpm'),tpa:sum('tpa'),ftm:sum('ftm'),fta:sum('fta'),reb:rebT!=null?num(rebT):sum('reb'),ast:sum('ast'),stl:sum('stl'),blk:sum('blk'),to:sum('to'),pf:sum('pf'),oreb:orT!=null?num(orT):null,dreb:drT!=null?num(drT):null},players};
  };
  const home=side('home'), away=side('away'); if(!home.players.length||!away.players.length) throw new Error('aucun joueur lu');
  return {id:nbaId,status:3,statusText:'Final',time:hd.date||'',home,away};
}
function nbaSeasonY(){ const d=new Date(); return d.getMonth()>=8?d.getFullYear():d.getFullYear()-1; }
function nbaDays(last){ const day=864e5, now=Date.now(); let bf=''; try{ bf=localStorage.getItem('suivi-nba-bf')||''; }catch(e){}
  if(bf!==String(nbaSeasonY())) return Math.min(240,Math.ceil((now-Date.UTC(nbaSeasonY(),9,1))/day)+1);
  return last?Math.min(14,Math.ceil((now-last)/day)+1):3; }
function nbaBfDone(){ try{ localStorage.setItem('suivi-nba-bf',String(nbaSeasonY())); }catch(e){} }
async function nbaEspnRefresh(why){
  const f=t=>new Date(t).toISOString().slice(0,10).replace(/-/g,''), day=864e5, now=Date.now();
  const fin=Object.values(games).filter(g=>g.status===3).map(tms).filter(Boolean), last=fin.length?Math.max(...fin):0;
  const days=nbaDays(last), maps=espnIdMaps();
  say(`⏳ NBA via ESPN : calendrier (${days} jour(s))…`,'warn');
  const cand=[]; let ko=0, errm='', okReq=0;
  for(let a=-days;a<=0;a+=4){ await Promise.all([0,1,2,3].filter(k=>a+k<=0).map(async k=>{ const u=`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${f(now+(a+k)*day-6*36e5)}`;
    try{ const r=await fetch(u); if(!r.ok) throw new Error('HTTP '+r.status); const j=await r.json(); okReq++;
      for(const e of (j.events||[])){ if(!(e.status&&e.status.type&&e.status.type.completed)) continue; if(e.season&&e.season.type===1) continue; const cs=((e.competitions||[])[0]||{}).competitors||[]; const h=cs.find(c=>c.homeAway==='home'), w=cs.find(c=>c.homeAway==='away'); if(!h||!w) continue;
        cand.push({eid:e.id,t:Date.parse(e.date)||0,h:etri(h.team.abbreviation),a:etri(w.team.abbreviation)}); } }
    catch(e){ ko++; errm=e.message||String(e); } })); }
  if(!okReq){ say(`⚠️ ESPN ne répond pas non plus (${esc(errm)}). Utilise le <b>favori NBA</b> sur nba.com, puis Ctrl+V ici.`,'err'); return; }
  const seen=new Set(); let todo=[]; const calKo=ko;
  for(const c of cand){ if(seen.has(c.eid)) continue; seen.add(c.eid); if(Object.values(games).some(g=>g.status===3&&g.home.tri===c.h&&g.away.tri===c.a&&Math.abs(tms(g)-c.t)<30*36e5)) continue;
    const m=sched.filter(x=>x.h===c.h&&x.a===c.a).sort((x,y)=>Math.abs(Date.parse(x.t)-c.t)-Math.abs(Date.parse(y.t)-c.t))[0];
    const nid=(m&&Math.abs(Date.parse(m.t)-c.t)<36*36e5)?m.id:'espn'+c.eid;
    if(games[nid]&&games[nid].status===3) continue; todo.push({...c,nid}); }
  if(!todo.length){ if(!calKo) nbaBfDone(); render(); say('✓ NBA (ESPN) : rien de nouveau, tes matchs sont à jour.','ok'); return; }
  todo.sort((a,b)=>a.t-b.t); const more=todo.length>80; todo=todo.slice(0,80); let ok=0; errm='';
  for(let i=0;i<todo.length;i+=3){ say(`⏳ NBA via ESPN : matchs ${i}/${todo.length}…`,'warn'); await Promise.all(todo.slice(i,i+3).map(async x=>{ try{ const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${x.eid}`); if(!r.ok) throw new Error('HTTP '+r.status); games[x.nid]=espnParseSummary(await r.json(),x.nid,maps); const sc=sched.find(z=>z.id===x.nid); if(sc) sc.s=3; ok++; }catch(e){ ko++; errm=e.message||String(e); } })); }
  save(); saveJ(KEYS,sched); render();
  if(!more&&!calKo) nbaBfDone(); else if(more&&ok) setTimeout(()=>{ if(!nbaBusy) nbaRefresh(); },800);
  if(!ok) say(`⚠️ NBA (ESPN) : aucun match lu (${esc(errm)}). Utilise le <b>favori NBA</b> sur nba.com, puis Ctrl+V ici.`,'err');
  else say(`✓ NBA (via ESPN) : ${ok} match(s) ajouté(s)${ko?`, ${ko} échec(s) (${esc(errm)})`:''}.`,ko?'warn':'ok');
}
let nbaBusy=false;
async function nbaGetJson(u){ const urls=[u,'https://corsproxy.io/?url='+encodeURIComponent(u)], errs=[]; for(const x of urls){ try{ const r=await fetch(x,{cache:'no-store'}); if(!r.ok){ errs.push('HTTP '+r.status); continue; } return await r.json(); }catch(e){ errs.push(e.message||String(e)); } } throw new Error(errs.join(' | ')); }
async function nbaRefresh(){
  if(nbaBusy) return; nbaBusy=true;
  try{
    say('⏳ NBA : lecture du calendrier…','warn');
    let sj; try{ sj=await nbaGetJson('https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json'); }
    catch(e){ await nbaEspnRefresh(e.message); return; }
    const sc=parseSchedule(sj); if(!sc||!sc.length){ say('Calendrier NBA illisible. Utilise le favori NBA.','err'); return; }
    sched=sc; saveJ(KEYS,sched);
    const now=Date.now(), fin=Object.values(games).filter(g=>g.status===3).map(tms).filter(Boolean), last=fin.length?Math.max(...fin):0;
    const days=nbaDays(last), from=now-days*864e5;
    const all=sched.filter(x=>!/^001/.test(x.id)&&Date.parse(x.t)<=now-3*36e5&&Date.parse(x.t)>=from&&!(games[x.id]&&games[x.id].status===3)&&!Object.values(games).some(g=>g.status===3&&g.home.tri===x.h&&g.away.tri===x.a&&Math.abs(tms(g)-Date.parse(x.t))<30*36e5)).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t)), more=all.length>60, todo=all.slice(0,60);
    if(!todo.length){ nbaBfDone(); save(); render(); say('✓ NBA : calendrier mis à jour, aucun nouveau match terminé à récupérer.','ok'); return; }
    let ok=0,ko=0,errm=''; const gs=[];
    for(let i=0;i<todo.length;i+=4){ say(`⏳ NBA : matchs ${i}/${todo.length}…`,'warn'); await Promise.all(todo.slice(i,i+4).map(async x=>{ try{ const g=await fetchGame(x.id); if(g.status===3||g.status===2){ games[x.id]=g; ok++; } }catch(e){ ko++; errm=e.message||String(e); } })); }
    save(); render();
    if(!more&&!ko) nbaBfDone(); else if(more&&ok) setTimeout(()=>{ if(!nbaBusy) nbaRefresh(); },800);
    if(!ok&&ko) say(`⚠️ NBA : aucun match lu (${esc(errm)}). Utilise le <b>favori NBA</b> sur nba.com, puis Ctrl+V ici.`,'err');
    else say(`✓ NBA : ${ok} match(s) ajouté(s)/mis à jour${ko?`, ${ko} échec(s) (${esc(errm)})`:''}.`,ko?'warn':'ok');
  } finally { nbaBusy=false; }
}
async function refreshLive(){
  const ids=Object.values(games).filter(g=>g.status!==3).map(g=>g.id);
  if(!ids.length){ say('Aucun match en cours à actualiser.'); return; }
  let ok=0; for(const id of ids){ try{ games[id]=await fetchGame(id); ok++; }catch(e){} }
  save(); render(); say(`${ok}/${ids.length} match(s) actualisé(s).`,ok?'ok':'err');
}

/* ================= Statistiques ================= */
const SUM=['min','pts','reb','ast','stl','blk','to','pf','fgm','fga','tpm','tpa','ftm','fta','pm'];
function gameScore(p){
  const reb=(p.oreb!=null&&p.dreb!=null)?0.7*p.oreb+0.3*p.dreb:0.4*p.reb;
  return p.pts+0.4*p.fgm-0.7*p.fga-0.4*(p.fta-p.ftm)+reb+p.stl+0.7*p.ast+0.7*p.blk-0.4*p.pf-p.to;
}
function buildStats(list){
  const fin=(list||Object.values(games)).filter(g=>g.status===3).sort((a,b)=>tms(a)-tms(b)||a.id.localeCompare(b.id));
  const P={},T={};
  for(const g of fin){
    for(const [me,op,home] of [[g.home,g.away,true],[g.away,g.home,false]]){
      const win=+me.score>+op.score;
      const t=T[me.tri] ||= {tri:me.tri,name:me.name,g:0,w:0,l:0,pf:0,pa:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,reb:0,ast:0,stl:0,blk:0,to:0,adv:{g:0,poss:0,pace:0,pts:0,opp:0},log:[]};
      t.g++; win?t.w++:t.l++; t.pf+=+me.score; t.pa+=+op.score;
      for(const f of ['fgm','fga','tpm','tpa','ftm','fta','reb','ast','stl','blk','to']) t[f]+=(me.st&&me.st[f])||0;
      const ms=me.st||{}, os=op.st||{};
      if(ms.oreb!=null&&os.oreb!=null&&ms.fga!=null&&os.fga!=null){
        const poss=((ms.fga+0.44*ms.fta-ms.oreb+ms.to)+(os.fga+0.44*os.fta-os.oreb+os.to))/2, mn=48+5*Math.max(0,(me.q||[]).length-4);
        if(poss>0){ t.adv.g++; t.adv.poss+=poss; t.adv.pace+=48*poss/mn; t.adv.pts+=+me.score; t.adv.opp+=+op.score; }
      }
      t.log.push({gid:g.id,time:g.time,opp:op.tri,home,pf:+me.score,pa:+op.score,win,qf:me.q||[],qa:op.q||[]});
      for(const p of me.players){
        if(p.min<=0) continue;
        const o=P[p.id] ||= {id:p.id,name:p.name,tri:p.tri,pos:p.pos||'',gp:0,dd:0,td:0,gsum:0,log:[],...Object.fromEntries(SUM.map(k=>[k,0]))};
        o.gp++; o.tri=p.tri; o.pos=p.pos||o.pos; for(const k of SUM) o[k]+=p[k];
        const gs=gameScore(p); o.gsum+=gs;
        const cats=[p.pts,p.reb,p.ast,p.stl,p.blk].filter(x=>x>=10).length;
        if(cats>=2) o.dd++; if(cats>=3) o.td++;
        o.log.push({gid:g.id,time:g.time,opp:op.tri,home,win,pts:p.pts,reb:p.reb,ast:p.ast,stl:p.stl,blk:p.blk,min:p.min,pm:p.pm,tpm:p.tpm,fgm:p.fgm,fga:p.fga,to:p.to,pf:p.pf,starter:p.starter,gs,cats});
      }
    }
  }
  return {fin,P,T};
}
function streakN(log){ if(!log.length) return null; const w=log[log.length-1].win; let n=0; for(let i=log.length-1;i>=0&&log[i].win===w;i--) n++; return {w,n}; }
const streak=log=>{ const s=streakN(log); return s?(s.w?'V':'D')+s.n:'–'; };
const formDots=(log,n=5)=>log.slice(-n).map(x=>`<span class="dot ${x.win?'w':'l'}" title="${x.win?'Victoire':'Défaite'} vs ${esc(x.opp)}">${x.win?'V':'D'}</span>`).join('')||'<span class="mut">–</span>';
const ts=r=>r.pts/(2*(r.fga+0.44*r.fta));
const efg=r=>(r.fgm+0.5*r.tpm)/r.fga;
function upcoming(){
  const now=Date.now()-4*3600e3, done=new Set(Object.values(games).filter(g=>g.status===3).map(g=>g.id));
  return sched.filter(x=>x.s!==3&&!done.has(x.id)&&Date.parse(x.t)>=now).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
}
const nextGame=tri=>upcoming().find(x=>x.h===tri||x.a===tri);

/* ---- Tendances, splits, alertes, notes, face-à-face ---- */
function trend(p){
  if(p.gp<4) return null;
  const n=Math.min(5,Math.floor(p.gp/2)), rec=p.log.slice(-n), ra=rec.reduce((s,x)=>s+x.pts,0)/n, sa=p.pts/p.gp;
  return {d:ra-sa,n,ra,sa};
}
function trendHtml(t){
  if(!t) return '<span class="mut">–</span>';
  const sg=(t.d>0?'+':'')+t.d.toFixed(1), tt=`${t.n} derniers matchs : ${f1(t.ra)} pts de moyenne, contre ${f1(t.sa)} sur la saison`;
  return t.d>=1.5?`<span class="ok" title="${tt}">▲ ${sg}</span>`:t.d<=-1.5?`<span class="err" title="${tt}">▼ ${sg}</span>`:`<span class="mut" title="${tt}">= ${sg}</span>`;
}
function splitRow(label,arr){
  if(!arr.length) return `<tr><td class="l">${label}</td><td colspan="7" class="mut">–</td></tr>`;
  const n=arr.length, sm=k=>arr.reduce((a,x)=>a+(x[k]||0),0);
  return `<tr><td class="l">${label}</td><td>${n}</td><td>${f1(sm('min')/n)}</td><td><b>${f1(sm('pts')/n)}</b></td><td>${f1(sm('reb')/n)}</td><td>${f1(sm('ast')/n)}</td><td>${pc(sm('fgm'),sm('fga'))}</td><td>${f1(sm('pm')/n)}</td></tr>`;
}
function teamSplitRow(label,arr){
  if(!arr.length) return `<tr><td class="l">${label}</td><td colspan="5" class="mut">–</td></tr>`;
  const n=arr.length, w=arr.filter(x=>x.win).length, pf=arr.reduce((a,x)=>a+x.pf,0)/n, pa=arr.reduce((a,x)=>a+x.pa,0)/n;
  return `<tr><td class="l">${label}</td><td>${n}</td><td>${w}-${n-w}</td><td>${f1(pf)}</td><td>${f1(pa)}</td><td class="${pf>=pa?'ok':'err'}">${f1(pf-pa)}</td></tr>`;
}
function alerts(S){
  const out=[], recent=iso=>{ const t=Date.parse(iso); return !t||Date.now()-t<8*86400e3; };
  for(const id of Object.keys(fav.players)){
    const p=S.P[id]; if(!p) continue;
    const last=p.log[p.log.length-1]; if(!recent(last.time)) continue;
    if(last.cats>=3) out.push(`🔥 ${playerLink(id,p.name)} a signé un <b>triple-double</b> (${last.pts} pts, ${last.reb} reb, ${last.ast} pas) contre ${esc(tname(last.opp))}.`);
    if(p.gp>=2){ const prev=p.log.slice(0,-1), pa=prev.reduce((s,x)=>s+x.pts,0)/prev.length;
      if(last.pts-pa>=10) out.push(`📈 ${playerLink(id,p.name)} a marqué <b>${last.pts} pts</b> contre ${esc(tname(last.opp))}, soit ${f1(last.pts-pa)} de plus que sa moyenne précédente (${f1(pa)}).`); }
  }
  for(const id of Object.keys(fav.players)){
    const p=S.P[id]; if(!p||p.gp<7) continue; const last=p.log[p.log.length-1]; if(!recent(last.time)) continue;
    const rec=p.log.slice(-5), old=p.log.slice(0,-5), avg=(a,k)=>a.reduce((s,x)=>s+x[k],0)/a.length, hot=[], cold=[];
    for(const [k,lab,abs,rel] of [['pts','pts',4,.2],['reb','reb',2.5,.25],['ast','pas',2.5,.25]]){ const r=avg(rec,k), o=avg(old,k);
      if(r-o>=abs&&r>=o*(1+rel)) hot.push(`${f1(r)} ${lab} (avant : ${f1(o)})`); else if(k==='pts'&&o-r>=abs&&r<=o*(1-rel)) cold.push(`${f1(r)} ${lab} (avant : ${f1(o)})`); }
    if(hot.length) out.push(`🔥 ${playerLink(id,p.name)} est <b>en forme</b> sur ses 5 derniers matchs : ${hot.join(', ')}.`);
    if(cold.length) out.push(`🥶 ${playerLink(id,p.name)} <b>marque moins</b> sur ses 5 derniers matchs : ${cold.join(', ')}.`);
  }
  for(const tri of fav.teams){
    const t=S.T[tri]; if(!t) continue; const sk=streakN(t.log);
    if(sk&&sk.n>=5) out.push(sk.w?`🏆 ${teamLink(tri)} : série de <b>${sk.n} victoires</b> de suite.`:`⚠️ ${teamLink(tri)} : série de <b>${sk.n} défaites</b> de suite.`);
  }
  for(const r of recordsBroken(S,Date.now()-8*86400e3)) if(fav.players[r.p.id]) out.push(`🏅 ${playerLink(r.p.id,r.p.name)} <b>bat ses records personnels</b> ${r.x.home?'contre':'à'} ${esc(tname(r.x.opp))} : ${r.items.map(i=>`${fv(i.k,i.val)} ${i.lab} (avant : ${fv(i.k,i.prev)})`).join(', ')}.`);
  return out;
}
const REC_K=[['pts','PTS',15],['reb','REB',8],['ast','AST',6],['stl','STL',3],['blk','BLK',3],['tpm','3P',4],['gs','Game Score',15]];
const chron=p=>[...p.log].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
function playerBests(p){ const b={}; for(const [k] of REC_K){ let best=null; for(const x of p.log) if(!best||x[k]>best[k]) best=x; b[k]=best; } return b; }
function recordsBroken(S,sinceMs){
  const out=[];
  for(const p of Object.values(S.P)){ if(p.log.length<4) continue; const byG={};
    chron(p).forEach((x,i,a)=>{ for(const [k,lab,th] of REC_K){ const mx=a.slice(0,i).reduce((m,y)=>Math.max(m,y[k]),-Infinity);
      if(i>=3&&x[k]>mx&&x[k]>=th&&Date.parse(x.time)>=sinceMs) (byG[x.gid] ||= {p,x,items:[]}).items.push({k,lab,val:x[k],prev:mx}); } });
    out.push(...Object.values(byG)); }
  return out;
}
const fv=(k,v)=>k==='gs'?f1(v):v;
function alertCard(S){ const a=alerts(S); return a.length?`<div class="card"><div class="row between"><h2 style="margin:0">🔔 Alertes sur tes favoris</h2></div>${a.map(x=>`<div class="alert">${x}</div>`).join('')}</div>`:''; }
const noteBox=(key,name,ph)=>`<h3>Mes notes</h3><textarea class="note" data-note="${esc(key)}" data-name="${esc(name||'')}" placeholder="${esc(ph)}">${esc((notes[key]||{}).t||'')}</textarea><div class="mut">Enregistré automatiquement quand tu cliques en dehors de la zone.</div>`;
const noteMark=key=>notes[key]?' <span title="Tu as une note">📝</span>':'';
function setNote(key,name,val){ val=val.trim(); if(val) notes[key]={t:val,n:name||''}; else delete notes[key]; saveJ(KEYN,notes); }
function notesCard(S){
  const keys=Object.keys(notes); if(!keys.length) return '';
  const rows=keys.map(k=>{ const i=k.indexOf(':'), type=k.slice(0,i), id=k.slice(i+1), n=notes[k]; let who;
    if(type==='player') who=`<span class="link" data-act="openplayer" data-id="${esc(id)}">${esc(S.P[id]?S.P[id].name:(n.n||id))}</span>`;
    else if(type==='game'){ const g=games[id]; who=`<span class="link" data-act="opengame" data-id="${esc(id)}">${esc(g?`${g.away.tri} @ ${g.home.tri} · ${fmtD(g.time)}`:id)}</span>`; }
    else if(type==='fmatch'||type==='fteam'||type==='fplayer') who=`<span class="link" data-act="${type}" data-id="${esc(id)}">⚽ ${esc(n.n||id)}</span>`;
    else who=`<span class="link" data-act="openteam" data-id="${esc(id)}">${esc(tname(id))}</span>`;
    const t=n.t||''; return `<tr><td class="l">${who}</td><td class="l" style="white-space:normal">${esc(t.length>160?t.slice(0,160)+'…':t)}</td></tr>`; }).join('');
  return `<div class="card"><h2>📝 Mes notes</h2><div class="scroll"><table><tbody>${rows}</tbody></table></div></div>`;
}
function trendCard(S){
  const rows=Object.values(S.P).map(p=>({p,t:trend(p)})).filter(x=>x.t); if(!rows.length) return '';
  const up=[...rows].sort((a,b)=>b.t.d-a.t.d).slice(0,5), dn=[...rows].sort((a,b)=>a.t.d-b.t.d).slice(0,5);
  const li=x=>`<tr><td class="l">${playerLink(x.p.id,x.p.name)} <span class="mut">${esc(x.p.tri)}</span></td><td>${f1(x.t.ra)} <span class="mut">vs ${f1(x.t.sa)}</span></td><td>${trendHtml(x.t)}</td></tr>`;
  return `<div class="card"><h2>Tendances : derniers matchs contre moyenne de saison (points)</h2><div class="grid2"><div><h3>En hausse</h3><table><tbody>${up.map(li).join('')}</tbody></table></div><div><h3>En baisse</h3><table><tbody>${dn.map(li).join('')}</tbody></table></div></div><p class="mut">Joueurs ayant au moins 4 matchs.</p></div>`;
}
function h2h(S,a,b){
  const gs=S.fin.filter(g=>(g.home.tri===a.tri&&g.away.tri===b.tri)||(g.home.tri===b.tri&&g.away.tri===a.tri)).sort((x,y)=>tms(y)-tms(x));
  if(!gs.length) return '<h3>Face-à-face</h3><p class="mut">Ces deux équipes ne se sont pas encore affrontées dans tes matchs.</p>';
  let wa=0,wb=0,diff=0;
  const rows=gs.map(g=>{ const ah=g.home.tri===a.tri, sa=+(ah?g.home.score:g.away.score), sb=+(ah?g.away.score:g.home.score); if(sa>sb) wa++; else wb++; diff+=sa-sb;
    return `<tr class="click" data-act="opengame" data-id="${g.id}"><td class="l">${fmtD(g.time)}</td><td class="l">${esc(g.away.tri)} ${g.away.score} - ${g.home.score} ${esc(g.home.tri)}</td><td>${esc(sa>sb?a.tri:b.tri)}</td><td class="${sa>sb?'ok':'err'}">${sa>sb?'+':''}${sa-sb}</td></tr>`; }).join('');
  return `<h3>Face-à-face</h3><p><b>${esc(a.tri)} ${wa} - ${wb} ${esc(b.tri)}</b> · écart moyen pour ${esc(a.tri)} : ${f1(diff/gs.length)} pts</p><div class="scroll"><table><thead><tr><th>Date</th><th class="l">Score</th><th>Vainqueur</th><th>Écart (${esc(a.tri)})</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}



/* ---- Rappel de sauvegarde ---- */
function renderBackup(){
  const el=document.getElementById('backupBar'); if(!el) return;
  if(!Object.keys(games).length){ el.innerHTML=''; window._ftBk=''; ftRender(); return; }
  const age=backup.last?(Date.now()-backup.last)/86400e3:Infinity;
  const due=age>=7&&Date.now()>(backup.snooze||0);
  const when=backup.last?`${new Date(backup.last).toLocaleDateString('fr-FR',{day:'numeric',month:'long'})} (${age<1?'aujourd\'hui':'il y a '+Math.floor(age)+' j'})`:'jamais';
  el.innerHTML=due
    ?`<div class="card" style="border-color:var(--warn)"><div class="row between"><div>💾 <b>Pense à sauvegarder tes données.</b> Dernière sauvegarde : ${when}. Elles ne sont gardées que dans ce navigateur.</div><div class="row"><button data-bk="now">Sauvegarder maintenant</button><button class="sec" data-bk="later">Plus tard</button></div></div></div>`
    :'';
  window._ftBk=`💾 Dernière sauvegarde : ${when}`; ftRender();
}

function renderSync(){
  const el=document.getElementById('syncBar'); if(!el) return;
  if(ui.sport==='foot'){ el.innerHTML=''; window._ftSy=''; ftRender(); return; }
  const times=Object.values(games).filter(g=>g.status===3).map(tms).filter(Boolean);
  const btn='<button data-act="nbarefresh" style="margin-right:8px">🔄 Actualiser la NBA</button>';
  if(!times.length){ el.innerHTML='<div class="mut" style="margin:-6px 0 10px;font-size:12px">'+btn+'Clique pour récupérer les matchs terminés.</div>'; window._ftSy=''; ftRender(); return; }
  const last=Math.max(...times), diff=(Date.now()-last)/86400e3, n=Math.min(14,Math.ceil(diff)+1);
  const when=new Date(last).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  el.innerHTML=''; window._ftSy=`📅 Dernier match NBA en base : ${when}`; ftRender();
}
function ftRender(){ const e=document.getElementById('ftInfo'); if(e) e.innerHTML=[window._ftBk,window._ftSy].filter(Boolean).map(x=>'<span>'+x+'</span>').join(''); }

/* ---- Équipe de la semaine ---- */
function weekCard(S){
  const lines=Object.values(S.P).flatMap(p=>p.log.map(x=>({...x,id:p.id,name:p.name,tri:p.tri})));
  if(!lines.length) return '';
  const tt=x=>Date.parse(x.time)||0, latest=Math.max(...lines.map(tt));
  const win=latest?lines.filter(x=>tt(x)>=latest-7*86400e3):lines;
  const by={};
  for(const x of win){ const o=by[x.id] ||= {id:x.id,name:x.name,tri:x.tri,n:0,pts:0,reb:0,ast:0,stl:0,blk:0}; o.n++; for(const k of ['pts','reb','ast','stl','blk']) o[k]+=x[k]; }
  let rows=Object.values(by).map(o=>({...o,sc:(o.pts+o.reb+o.ast+o.stl+o.blk)/o.n}));
  let min=ui.weekMin, lowered=false; if(!rows.some(r=>r.n>=min)){ min=1; lowered=ui.weekMin>1; }
  rows=rows.filter(r=>r.n>=min).sort((a,b)=>b.sc-a.sc).slice(0,5);
  const label=latest?`du ${fmtD(new Date(latest-7*86400e3).toISOString())} au ${fmtD(new Date(latest).toISOString())}`:'tous les matchs';
  return `<div class="card"><div class="row between"><h2 style="margin:0">⭐ Équipe de la semaine <span class="mut" style="font-weight:400;font-size:13px">${label}</span></h2></div>
  <div class="scroll"><table><thead><tr><th class="l">Joueur</th><th>MJ</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>Score</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td class="l">${i+1}. ${avatar(r.id,r.name,r.tri,26)}${playerLink(r.id,r.name)} <span class="mut">${esc(r.tri)}</span></td><td>${r.n}</td><td>${f1(r.pts/r.n)}</td><td>${f1(r.reb/r.n)}</td><td>${f1(r.ast/r.n)}</td><td>${f1(r.stl/r.n)}</td><td>${f1(r.blk/r.n)}</td><td><b>${f1(r.sc)}</b></td></tr>`).join('')||'<tr><td colspan="8" class="empty">Aucun joueur.</td></tr>'}</tbody></table></div>
  <p class="mut" style="margin:6px 0 0">Score = points + rebonds + passes + interceptions + contres, en moyenne par match. Période : 7 jours avant le dernier match de ta base.</p></div>`;
}

/* ---- Repos et enchaînements ---- */
const nyDay=iso=>{ const t=Date.parse(iso); if(!t) return null; try{ return new Date(t).toLocaleDateString('en-CA',{timeZone:'America/New_York'}); }catch(e){ return new Date(t).toISOString().slice(0,10); } };
const dayN=k=>{ const [y,m,d]=k.split('-').map(Number); return Date.UTC(y,m-1,d)/86400000; };
function teamSchedules(){
  const byId={};
  for(const x of sched) byId[x.id]={id:x.id,t:x.t,h:x.h,a:x.a,done:false};
  for(const g of Object.values(games)) byId[g.id]={id:g.id,t:g.time||(byId[g.id]&&byId[g.id].t)||'',h:g.home.tri,a:g.away.tri,done:g.status===3};
  const m={};
  for(const e of Object.values(byId)){ const d=nyDay(e.t); if(!d) continue; for(const tri of [e.h,e.a]) (m[tri] ||= []).push({...e,day:d,n:dayN(d),ts:Date.parse(e.t)}); }
  for(const k in m) m[k].sort((a,b)=>a.ts-b.ts);
  return m;
}
function restBefore(sc,tri,id){ const l=sc[tri]||[], i=l.findIndex(e=>e.id===id); if(i<=0) return null; const r=l[i].n-l[i-1].n-1; return r<0?null:r; }
function restStats(S){
  const sc=teamSchedules(), res={}, lg={b2b:{w:0,l:0,d:0},rest:{w:0,l:0,d:0}};
  for(const g of S.fin) for(const [me,op] of [[g.home,g.away],[g.away,g.home]]){
    const rest=restBefore(sc,me.tri,g.id); if(rest===null) continue;
    const win=+me.score>+op.score, diff=+me.score-+op.score, cat=rest===0?'b2b':'rest';
    const r=res[me.tri] ||= {tri:me.tri,name:me.name,b2b:{w:0,l:0,d:0},rest:{w:0,l:0,d:0}};
    for(const o of [r[cat],lg[cat]]){ win?o.w++:o.l++; o.d+=diff; }
  }
  return {res,lg,sc};
}
function viewRest(S){
  if(!S.fin.length) return '<div class="card empty">Aucun match terminé pour l\'instant.</div>';
  const {res,lg,sc}=restStats(S), hasCal=sched.length>0;
  const n=o=>o.w+o.l, rec=o=>n(o)?`${o.w}-${o.l}`:'–', dm=o=>n(o)?f1(o.d/n(o)):'–', pcs=o=>n(o)?Math.round(100*o.w/n(o))+'%':'–';
  const rows=Object.values(res).sort((a,b)=>n(b.b2b)-n(a.b2b)||a.name.localeCompare(b.name));
  const now=Date.now()-4*3600e3, horizon=now+8*86400e3, byGame={};
  for(const tri in sc){ const l=sc[tri]; for(let i=1;i<l.length;i++){ const e=l[i]; if(e.done||e.ts<now||e.ts>horizon) continue; if(e.n-l[i-1].n===1) (byGame[e.id] ||= {e,teams:[]}).teams.push(tri); } }
  const up=Object.values(byGame).sort((a,b)=>a.e.ts-b.e.ts).slice(0,20);
  let h='';
  if(!hasCal) h+='<div class="card warn">⚠️ Sans le calendrier, seuls tes matchs ajoutés sont connus : un enchaînement peut être manqué si un match entre les deux n\'est pas dans ta base. Va sur nba.com/schedule, clique sur le favori, puis Ctrl+V ici.</div>';
  h+=`<div class="grid"><div class="kpi"><span class="mut">2e soir de suite (ligue)</span><b>${rec(lg.b2b)}</b><span class="mut">${pcs(lg.b2b)} · écart ${dm(lg.b2b)}</span></div><div class="kpi"><span class="mut">Équipe reposée (ligue)</span><b>${rec(lg.rest)}</b><span class="mut">${pcs(lg.rest)} · écart ${dm(lg.rest)}</span></div></div>`;
  h+=`<div class="card"><h2>Bilan par équipe</h2><div class="scroll"><table><thead><tr><th class="l">Équipe</th><th>Enchaîn.</th><th>Bilan</th><th>Écart moy.</th><th>Reposée</th><th>Bilan</th><th>Écart moy.</th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td class="l">${star('team',r.tri)}${teamLink(r.tri,r.name)}</td><td>${n(r.b2b)}</td><td>${rec(r.b2b)}</td><td class="${r.b2b.d<0?'err':r.b2b.d>0?'ok':''}">${dm(r.b2b)}</td><td>${n(r.rest)}</td><td>${rec(r.rest)}</td><td class="${r.rest.d<0?'err':r.rest.d>0?'ok':''}">${dm(r.rest)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Pas assez de matchs datés.</td></tr>'}</tbody></table></div>
  <p class="mut" style="margin:6px 0 0">« Enchaînement » = équipe qui jouait aussi la veille (heure de la côte Est). Écart moyen = points marqués moins points encaissés.</p></div>`;
  h+=`<div class="card"><h2>Prochains matchs avec un 2e soir de suite</h2>${hasCal?`<div class="scroll"><table><thead><tr><th class="l">Date</th><th class="l">Match</th><th class="l">Équipe(s) fatiguée(s)</th></tr></thead><tbody>${up.map(x=>`<tr><td class="l">${esc(fmtDT(x.e.t))}</td><td class="l">${esc(x.e.a)} @ ${esc(x.e.h)}</td><td class="l">${x.teams.map(t=>`<span class="${fav.teams.includes(t)?'win':''}">${esc(tname(t))}</span>`).join(', ')}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">Aucun enchaînement dans les 8 prochains jours.</td></tr>'}</tbody></table></div>`:'<p class="mut">Calendrier non chargé.</p>'}</div>`;
  return h;
}


/* ---- Flèches de classement (évolution depuis la dernière soirée de matchs) ---- */
function prevStats(){
  const fin=Object.values(games).filter(g=>g.status===3);
  const days=fin.map(g=>nyDay(g.time)).filter(Boolean).sort();
  if(!days.length) return null;
  const latest=days[days.length-1];
  const older=fin.filter(g=>{ const d=nyDay(g.time); return !d||d<latest; });
  if(!older.length||older.length===fin.length) return null;
  const st=buildStats(older); st.day=latest; return st;
}
function moveHtml(prevMap,key,nowRank){
  if(!prevMap) return '';
  const p=prevMap.get(key);
  if(p==null) return ' <span class="mut mv" title="Nouveau dans ce classement">new</span>';
  const d=p-nowRank;
  return d>0?` <span class="ok mv" title="Monte de ${d} place(s)">▲${d}</span>`:d<0?` <span class="err mv" title="Descend de ${-d} place(s)">▼${-d}</span>`:' <span class="mut mv" title="Inchangé">=</span>';
}
const moveNote=S=>S.prev?`<p class="mut" style="margin:8px 0 0">▲▼ = places gagnées ou perdues grâce aux matchs du ${esc(fmtD(S.prev.day))} (dernière soirée de ta base). « = » : inchangé, « new » : absent du classement avant.</p>`:'';
const rankMap=ids=>new Map(ids.map((id,i)=>[id,i+1]));
function playerRanking(P,k,d,minGp){
  const c=PCOL[k]||PCOL.pts;
  return Object.values(P).filter(r=>r.gp>=minGp).sort((a,b)=>{ const x=c.v(a),y=c.v(b); return (x>y?1:x<y?-1:0)*d; }).map(r=>r.id);
}
const standCmp=(a,b)=>b.w/b.g-a.w/a.g||b.w-a.w||(b.pf-b.pa)/b.g-(a.pf-a.pa)/a.g;

/* ================= Graphiques SVG ================= */
const COLORS=['#34b64f','#f0b010','#f07020'];
function lineChart(series,labels){
  const W=640,H=230,L=34,R=12,T=14,B=26;
  const all=series.flatMap(s=>s.values.filter(v=>v!=null)); if(!all.length) return '';
  let max=Math.max(...all), min=Math.min(0,...all); if(max===min) max=min+1;
  const n=labels.length, x=i=>L+(n<=1?(W-L-R)/2:i*(W-L-R)/(n-1)), y=v=>T+(H-T-B)*(1-(v-min)/(max-min));
  let g=''; for(let i=0;i<=4;i++){ const v=min+(max-min)*i/4, yy=y(v); g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" style="stroke:var(--line)"/><text x="${L-5}" y="${yy+4}" text-anchor="end">${Math.round(v)}</text>`; }
  const step=Math.ceil(n/8); let xl=''; labels.forEach((l,i)=>{ if(i%step===0) xl+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`; });
  const lines=series.map((s,k)=>{ const c=s.color||COLORS[k%3]; const pts=s.values.map((v,i)=>v==null?null:[x(i),y(v)]).filter(Boolean);
    return `<polyline fill="none" stroke="${c}" stroke-width="2" points="${pts.map(p=>p.join(',')).join(' ')}"/>`+pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${c}"/>`).join(''); }).join('');
  const leg=series.length>1?`<div class="legend">${series.map((s,k)=>`<span><i style="background:${s.color||COLORS[k%3]}"></i>${esc(s.name)}</span>`).join('')}</div>`:'';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${g}${xl}${lines}</svg>${leg}`;
}
function barsChart(labels,s1,s2,n1,n2,c1=COLORS[0],c2=COLORS[1]){
  const W=640,H=230,L=34,R=12,T=14,B=26;
  const max=Math.max(1,...s1,...s2), n=labels.length, slot=(W-L-R)/Math.max(n,1), bw=Math.min(22,slot/2.6);
  const y=v=>T+(H-T-B)*(1-v/max); let g='';
  for(let i=0;i<=4;i++){ const v=max*i/4,yy=y(v); g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" style="stroke:var(--line)"/><text x="${L-5}" y="${yy+4}" text-anchor="end">${Math.round(v)}</text>`; }
  let b=''; labels.forEach((l,i)=>{ const cx=L+slot*i+slot/2;
    b+=`<rect x="${cx-bw}" y="${y(s1[i])}" width="${bw}" height="${H-B-y(s1[i])}" fill="${c1}"/><rect x="${cx}" y="${y(s2[i])}" width="${bw}" height="${H-B-y(s2[i])}" fill="${c2}"/><text x="${cx}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${g}${b}</svg><div class="legend"><span><i style="background:${c1}"></i>${esc(n1)}</span><span><i style="background:${c2}"></i>${esc(n2)}</span></div>`;
}
function spark(vals){
  if(vals.length<2) return '';
  const W=110,H=28,max=Math.max(...vals),min=Math.min(...vals),r=max-min||1;
  const pts=vals.map((v,i)=>`${(i*(W-4)/(vals.length-1)+2).toFixed(1)},${(H-3-(H-6)*(v-min)/r).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><polyline fill="none" stroke="${COLORS[0]}" stroke-width="2" points="${pts}"/></svg>`;
}


/* ================= Visuel : photos, logos, radar, rangs ================= */
const initials=n=>String(n||'?').trim().split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
const photoUrl=(id,big)=>/^e\d/.test(String(id))?`https://a.espncdn.com/i/headshots/nba/players/full/${String(id).slice(1)}.png`:`https://cdn.nba.com/headshots/nba/latest/${big?'1040x760':'260x190'}/${id}.png`;
const logoUrl=tri=>TEAM_ID[tri]?`https://cdn.nba.com/logos/nba/${TEAM_ID[tri]}/global/L/logo.svg`:'';
const avatar=(id,name,tri,size=28)=>{ const c=tcolor(tri); return `<span class="av" style="width:${size}px;height:${size}px;font-size:${Math.max(9,Math.round(size*.38))}px;--tc:${c};--ink:${ink(c)}" data-ini="${esc(initials(name))}"><img src="${photoUrl(id,size>80)}" alt="" loading="lazy"></span>`; };
const teamLogo=(tri,size=20)=>{ const c=tcolor(tri), u=logoUrl(tri); return `<span class="av tl" style="width:${size}px;height:${size}px;font-size:${Math.max(8,Math.round(size*.36))}px;--tc:${c};--ink:${ink(c)}" data-ini="${esc(tri)}">${u?`<img src="${u}" alt="" loading="lazy">`:esc(tri)}</span>`; };
document.addEventListener('error',e=>{ const t=e.target; if(!t||t.tagName!=='IMG') return; const sp=t.parentNode; if(!sp||!sp.classList||!sp.classList.contains('av')) return;
  if(t.dataset&&t.dataset.pid&&!t.dataset.tried&&typeof footPhotoAlt==='function'){ t.dataset.tried='1'; footPhotoAlt(t.dataset.pid).then(u=>{ if(u&&t.isConnected){ t.src=u; } else if(sp.isConnected){ sp.classList.add('fb'); sp.textContent=sp.dataset.ini||''; } }); return; }
  sp.classList.add('fb'); sp.textContent=sp.dataset.ini||''; },true);

function pctOf(vals,v){ let lt=0,eq=0; for(const x of vals){ if(x<v) lt++; else if(x===v) eq++; } return 100*(lt+eq/2)/vals.length; }
const RADL=['PTS','REB','AST','STL','BLK','TIR'];
const RADP=[r=>r.pts/r.gp,r=>r.reb/r.gp,r=>r.ast/r.gp,r=>r.stl/r.gp,r=>r.blk/r.gp,r=>(r.fga+r.fta)/r.gp>=3?100*ts(r):null];
function radarVals(S,p){ const all=Object.values(S.P); return RADP.map(fn=>{ const vals=all.map(fn).filter(v=>v!=null), v=fn(p); return v==null||!vals.length?0:pctOf(vals,v); }); }
const RADTL=['PTS','DÉF','REB','AST','FG%','3P%'];
const RADT=[t=>t.pf/t.g,t=>-t.pa/t.g,t=>t.reb/t.g,t=>t.ast/t.g,t=>pcn(t.fgm,t.fga),t=>pcn(t.tpm,t.tpa)];
function radarValsT(S,t){ const all=Object.values(S.T); return RADT.map(fn=>pctOf(all.map(fn),fn(t))); }
function radarChart(labels,series,what){
  const W=320,H=300,cx=W/2,cy=H/2+4,R=105,n=labels.length;
  const ang=i=>-Math.PI/2+2*Math.PI*i/n, pt=(i,v)=>[(cx+R*v/100*Math.cos(ang(i))).toFixed(1),(cy+R*v/100*Math.sin(ang(i))).toFixed(1)];
  let g=''; for(const lv of [25,50,75,100]) g+=`<polygon points="${labels.map((_,i)=>pt(i,lv).join(',')).join(' ')}" fill="none" style="stroke:var(--line)"${lv===50?' stroke-dasharray="3 3"':''}/>`;
  g+=labels.map((l,i)=>{ const [x,y]=pt(i,100),[tx,ty]=pt(i,123); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" style="stroke:var(--line)"/><text x="${tx}" y="${+ty+4}" text-anchor="middle">${esc(l)}</text>`; }).join('');
  const polys=series.map(s=>`<polygon points="${s.vals.map((v,i)=>pt(i,v).join(',')).join(' ')}" fill="${s.color}" fill-opacity=".22" stroke="${s.color}" stroke-width="2"/>`+s.vals.map((v,i)=>{ const [x,y]=pt(i,v); return `<circle cx="${x}" cy="${y}" r="3" fill="${s.color}"/>`; }).join('')).join('');
  const leg=series.length>1?`<div class="legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`:'';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:360px" role="img">${g}${polys}</svg>${leg}<div class="mut" style="font-size:12px">Chaque axe = position parmi les ${what} de ta base (100 = le meilleur, cercle pointillé = médiane).</div>`;
}
function pctTable(S,p){
  const all=Object.values(S.P), c=tcolor(p.tri);
  const specs=[['PTS',r=>r.pts/r.gp,f1],['REB',r=>r.reb/r.gp,f1],['AST',r=>r.ast/r.gp,f1],['STL',r=>r.stl/r.gp,f1],['BLK',r=>r.blk/r.gp,f1],['3PM',r=>r.tpm/r.gp,f1],['TS%',r=>(r.fga+r.fta)/r.gp>=3?100*ts(r):null,x=>x.toFixed(1)+'%'],['Game Score',r=>r.gsum/r.gp,f1]];
  return `<div class="scroll"><table><thead><tr><th class="l">Stat</th><th>Moy.</th><th>Rang</th><th class="l"></th><th>Top</th></tr></thead><tbody>${specs.map(([l,fn,fm])=>{
    const vals=all.map(fn).filter(v=>v!=null), v=fn(p);
    if(v==null||!vals.length) return `<tr><td class="l">${l}</td><td colspan="4" class="mut">pas assez de tirs</td></tr>`;
    const rank=1+vals.filter(x=>x>v).length, pct=pctOf(vals,v), top=Math.max(1,Math.round(100*rank/vals.length));
    return `<tr><td class="l">${l}</td><td>${fm(v)}</td><td>${rank} / ${vals.length}</td><td class="l"><div class="pbar"><i style="width:${pct.toFixed(0)}%;background:${c}"></i></div></td><td>${top} %</td></tr>`; }).join('')}</tbody></table></div><p class="mut" style="margin:6px 0 0">« Top 10 % » = parmi les 10 % meilleurs des ${all.length} joueurs de ta base.</p>`;
}
function consistency(p){
  const v=p.log.map(x=>x.pts), n=v.length, m=v.reduce((a,b)=>a+b,0)/n, sd=Math.sqrt(v.reduce((a,b)=>a+(b-m)*(b-m),0)/n);
  let best=p.log[0], worst=p.log[0]; for(const x of p.log){ if(x.pts>best.pts) best=x; if(x.pts<worst.pts) worst=x; }
  let cur=0,max=0; for(const x of v){ if(x>=20){ cur++; if(cur>max) max=cur; } else cur=0; }
  return {sd,best,worst,n20:v.filter(x=>x>=20).length,cur,max};
}
let _hist={k:'',v:null};
function rankHistory(){
  const fin=Object.values(games).filter(g=>g.status===3);
  const k=fin.length+':'+fin.reduce((a,g)=>a+(+g.home.score)+(+g.away.score),0);
  if(_hist.k===k) return _hist.v;
  let v=null;
  const days=[...new Set(fin.map(g=>nyDay(g.time)).filter(Boolean))].sort();
  if(days.length>=2){
    v={days,teams:[],players:[]};
    for(const d of days){ const sub=fin.filter(g=>{ const x=nyDay(g.time); return !x||x<=d; }), st=buildStats(sub);
      v.teams.push(rankMap(Object.values(st.T).sort(standCmp).map(t=>t.tri)));
      v.players.push(rankMap(playerRanking(st.P,'pts',-1,1))); }
  }
  _hist={k,v}; return v;
}
function rankChart(series,labels,maxRank){
  const W=640,H=230,L=34,R=12,T=14,B=26,n=labels.length,mr=Math.max(2,maxRank);
  if(!series.some(s=>s.values.some(v=>v!=null))) return '';
  const x=i=>L+(n<=1?(W-L-R)/2:i*(W-L-R)/(n-1)), y=r=>T+(H-T-B)*((r-1)/(mr-1));
  let g=''; for(const r of [...new Set([0,1,2,3,4].map(i=>Math.round(1+(mr-1)*i/4)))]){ const yy=y(r); g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" style="stroke:var(--line)"/><text x="${L-5}" y="${yy+4}" text-anchor="end">${r}</text>`; }
  const step=Math.ceil(n/8); let xl=''; labels.forEach((l,i)=>{ if(i%step===0) xl+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`; });
  const lines=series.map(s=>{ const pts=s.values.map((v,i)=>v==null?null:[x(i),y(v)]).filter(Boolean); return `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${pts.map(q=>q.join(',')).join(' ')}"/>`+pts.map(q=>`<circle cx="${q[0]}" cy="${q[1]}" r="3" fill="${s.color}"/>`).join(''); }).join('');
  const leg=series.length>1?`<div class="legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`:'';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${g}${xl}${lines}</svg>${leg}`;
}
function rankEvolution(S){
  const H=rankHistory();
  if(!H) return '<div class="card"><h2>Évolution du classement</h2><p class="mut">Il faut au moins deux soirées de matchs dans ta base pour tracer une courbe.</p></div>';
  const tris=Object.keys(S.T).sort((a,b)=>tname(a).localeCompare(tname(b))), rank=Object.values(S.T).sort(standCmp).map(t=>t.tri);
  let sel=ui.rkT; if(!sel){ sel=[...new Set([...fav.teams.filter(t=>S.T[t]),...rank])].slice(0,3); while(sel.length<3) sel.push(''); }
  const cols=pickColors(sel.map(t=>t?tcolor(t):null));
  const series=sel.map((t,i)=>t?{name:tname(t),color:cols[i],values:H.teams.map(m=>m.get(t)??null)}:null).filter(Boolean);
  return `<div class="card"><h2>Évolution du classement</h2><div class="row" style="margin-bottom:8px">${[0,1,2].map(i=>`<select id="rkT${i}"><option value="">(aucune)</option>${tris.map(t=>`<option value="${t}" ${t===sel[i]?'selected':''}>${esc(tname(t))}</option>`).join('')}</select>`).join('')}</div>${rankChart(series,H.days.map(d=>fmtD(d)),Math.max(...H.teams.map(m=>m.size)))||'<p class="mut">Rien à tracer.</p>'}<p class="mut">Place au classement général (ligue entière, parmi les équipes de ta base) à la fin de chaque soirée. 1 = en haut.</p></div>`;
}
function teamQuarters(t){
  const L=t.log.filter(x=>x.qf&&x.qa&&x.qf.length>=4&&x.qa.length>=4); if(!L.length) return null;
  const av=a=>a.reduce((x,y)=>x+y,0)/a.length;
  return [0,1,2,3].map(i=>({f:av(L.map(x=>x.qf[i])),a:av(L.map(x=>x.qa[i])),w:L.filter(x=>x.qf[i]>x.qa[i]).length,n:L.length}));
}
function advRow(t){ if(!t.adv.g) return null; return {pace:t.adv.pace/t.adv.g,off:100*t.adv.pts/t.adv.poss,def:100*t.adv.opp/t.adv.poss,g:t.adv.g}; }
function advCard(S){
  const rows=Object.values(S.T).map(t=>({t,a:advRow(t)})).filter(x=>x.a).sort((x,y)=>(y.a.off-y.a.def)-(x.a.off-x.a.def));
  if(!rows.length) return '<div class="card"><h2>Stats avancées des équipes</h2><p class="mut">Pas encore de données : ces chiffres demandent les rebonds offensifs, absents des matchs ajoutés avant la dernière mise à jour. Ré-ajoute des matchs (favori sur la page d\'accueil de nba.com avec quelques jours) pour les obtenir.</p></div>';
  return `<div class="card"><h2>Stats avancées des équipes</h2><div class="scroll"><table><thead><tr><th class="l">Équipe</th><th>Matchs</th><th>Rythme</th><th>Attaque</th><th>Défense</th><th>Net</th></tr></thead><tbody>${rows.map(({t,a})=>`<tr><td class="l">${star('team',t.tri)}${teamLink(t.tri,t.name)}</td><td>${a.g}</td><td>${f1(a.pace)}</td><td>${f1(a.off)}</td><td>${f1(a.def)}</td><td class="${a.off>=a.def?'ok':'err'}"><b>${(a.off-a.def>0?'+':'')+f1(a.off-a.def)}</b></td></tr>`).join('')}</tbody></table></div>
  <p class="mut" style="margin:6px 0 0">Rythme = possessions par 48 min. Attaque / défense = points marqués / encaissés pour 100 possessions (une possession = tirs + 0,44 × lancers francs − rebonds offensifs + balles perdues). Net = attaque − défense. Seuls les matchs ajoutés avec rebonds offensifs comptent.</p></div>`;
}
function quartersCard(S){
  const rows=Object.values(S.T).map(t=>({t,q:teamQuarters(t)})).filter(x=>x.q);
  if(!rows.length) return '<div class="card"><h2>Par quart-temps</h2><p class="mut">Pas de score par quart-temps dans les matchs de ta base. Ré-ajoute des matchs pour l\'obtenir.</p></div>';
  const best=i=>[...rows].sort((a,b)=>(b.q[i].f-b.q[i].a)-(a.q[i].f-a.q[i].a))[0];
  return `<div class="card"><h2>Par quart-temps</h2><p>Meilleure équipe en <b>Q1</b> : ${teamLink(best(0).t.tri)} · en <b>Q4</b> : ${teamLink(best(3).t.tri)}</p><div class="scroll"><table><thead><tr><th class="l">Équipe</th><th>Matchs</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Quarts gagnés</th></tr></thead><tbody>${rows.map(({t,q})=>`<tr><td class="l">${teamLink(t.tri,t.name)}</td><td>${q[0].n}</td>${q.map(x=>`<td class="${x.f>=x.a?'ok':'err'}">${(x.f-x.a>0?'+':'')+f1(x.f-x.a)}</td>`).join('')}<td>${Math.round(100*q.reduce((a,x)=>a+x.w,0)/(q[0].n*4))}%</td></tr>`).join('')}</tbody></table></div><p class="mut" style="margin:6px 0 0">Écart moyen de points par quart-temps (marqués − encaissés).</p></div>`;
}
function lineScore(g){
  const a=g.away.q||[], h=g.home.q||[];
  if(!a.length||!h.length) return g.status===3?'<p class="mut">Score par quart-temps non disponible pour ce match (ré-ajoute-le pour l\'obtenir).</p>':'';
  const n=Math.max(a.length,h.length), lab=i=>i<4?'Q'+(i+1):'OT'+(i-3);
  const row=(t,o)=>`<tr><td class="l">${teamLogo(t.tri,18)}<b>${esc(t.tri)}</b></td>${Array.from({length:n},(_,i)=>{ const v=t.q[i], w=o.q[i]; return `<td class="${v!=null&&w!=null&&v>w?'win':''}">${v??'–'}</td>`; }).join('')}<td><b>${t.score}</b></td></tr>`;
  return `<div class="scroll"><table style="width:auto"><thead><tr><th class="l"></th>${Array.from({length:n},(_,i)=>`<th>${lab(i)}</th>`).join('')}<th>T</th></tr></thead><tbody>${row(g.away,g.home)}${row(g.home,g.away)}</tbody></table></div>`;
}

/* ---- Accueil personnalisable ---- */
function homeCfgNorm(){ const ids=HOME_BLOCKS.map(b=>b[0]); const o=(homeCfg.order||[]).filter(i=>ids.includes(i)); for(const i of ids) if(!o.includes(i)){ if(i==='tonight') o.unshift(i); else o.push(i); } return {order:o,hidden:(homeCfg.hidden||[]).filter(i=>ids.includes(i))}; }
function homeEditor(cfg){
  const lab=Object.fromEntries(HOME_BLOCKS);
  return `<div class="card"><h2>Personnaliser l'accueil</h2><p class="mut">Coche les blocs à afficher et change leur ordre avec les flèches.</p>${cfg.order.map((id,i)=>`<div class="row hrow"><label><input type="checkbox" data-act="hometoggle" data-id="${id}" ${cfg.hidden.includes(id)?'':'checked'}> ${esc(lab[id])}</label><button class="sec" data-act="homemove" data-id="${id}" data-d="-1" ${i===0?'disabled':''}>↑</button><button class="sec" data-act="homemove" data-id="${id}" data-d="1" ${i===cfg.order.length-1?'disabled':''}>↓</button></div>`).join('')}<div class="row" style="margin-top:10px"><button data-act="homeedit">Terminé</button><button class="sec" data-act="homereset">Tout réinitialiser</button></div></div>`;
}

/* ---- Mode grand écran ---- */
const tv={on:false,i:0,timer:null,fs:false};
function tvSlides(S){
  const out=[], fin=S.fin;
  if(fin.length){
    const days=fin.map(g=>nyDay(g.time)).filter(Boolean).sort(), last=days[days.length-1];
    let gs=last?fin.filter(g=>nyDay(g.time)===last):[]; if(!gs.length) gs=fin.slice(-8);
    gs=gs.slice(0,12);
    const row=(t,w)=>`<div class="tvrow ${w?'tvw':''}">${teamLogo(t.tri,44)}<span class="tvn">${esc(t.name)}</span><span class="tvs">${t.score}</span></div>`;
    out.push({title:'Résultats'+(last?' du '+fmtD(last):''),html:`<div class="tvgames">${gs.map(g=>{ const hw=+g.home.score>+g.away.score; return `<div class="tvgame">${row(g.away,!hw)}${row(g.home,hw)}</div>`; }).join('')}</div>`});
    const mk=(St,c)=>Object.values(St.T).filter(t=>!c||(TEAMS[t.tri]&&TEAMS[t.tri][1]===c)).sort(standCmp);
    let lists=[['Est','E'],['Ouest','W']].map(([l,c])=>[l,c,mk(S,c)]).filter(x=>x[2].length); if(!lists.length) lists=[['Ligue','',mk(S,'')]];
    out.push({title:'Classement',html:`<div class="tvcols">${lists.map(([l,c,rows])=>{ const pv=S.prev?rankMap(mk(S.prev,c).map(t=>t.tri)):null; return `<div class="tvlist"><h2>${l}</h2>${rows.slice(0,8).map((t,i)=>`<div class="tvrow"><span style="width:2.6em">${i+1}${moveHtml(pv,t.tri,i+1)}</span>${teamLogo(t.tri,36)}<span class="tvn">${esc(t.name)}</span><span>${t.w}-${t.l}</span></div>`).join('')}</div>`; }).join('')}</div>`});
    const top=Object.values(S.P).sort((a,b)=>b.pts/b.gp-a.pts/a.gp).slice(0,8);
    out.push({title:'Meilleurs marqueurs',html:`<div class="tvlist">${top.map((p,i)=>`<div class="tvrow"><span style="width:1.6em">${i+1}</span>${avatar(p.id,p.name,p.tri,56)}<span class="tvn">${esc(p.name)} <span class="mut">${esc(p.tri)}</span></span><span class="mut">${p.gp} MJ · ${p.pts} pts</span><span class="tvs">${f1(p.pts/p.gp)}</span></div>`).join('')}</div>`});
    const fT=fav.teams.filter(t=>S.T[t]), fP=Object.keys(fav.players).filter(i=>S.P[i]);
    if(fT.length||fP.length) out.push({title:'Mes favoris',html:`<div class="tvcols"><div class="tvlist">${fT.map(t=>{ const x=S.T[t]; return `<div class="tvrow">${teamLogo(t,44)}<span class="tvn">${esc(x.name)}</span><span>${formDots(x.log)}</span><span class="tvs">${x.w}-${x.l}</span></div>`; }).join('')}</div><div class="tvlist">${fP.map(i=>{ const x=S.P[i]; return `<div class="tvrow">${avatar(x.id,x.name,x.tri,48)}<span class="tvn">${esc(x.name)}</span><span class="mut">${f1(x.reb/x.gp)} reb · ${f1(x.ast/x.gp)} pas</span><span class="tvs">${f1(x.pts/x.gp)}</span></div>`; }).join('')}</div></div>`});
  }
  return out;
}
function tvRender(){
  const el=document.getElementById('tv'); if(!el) return;
  const S=buildStats(); S.prev=prevStats(); const sl=tvSlides(S);
  const bar=n=>`<div class="tvbar"><span>${Array.from({length:n},(_,i)=>`<i class="${i===tv.i?'on':''}"></i>`).join('')}</span><span class="mut">← → pour changer · Échap pour quitter</span><button data-tv="close">✕</button></div>`;
  if(!sl.length){ el.innerHTML=bar(0)+'<h1 class="tvh">Aucun match terminé pour l\'instant</h1>'; return; }
  tv.i=((tv.i%sl.length)+sl.length)%sl.length; const x=sl[tv.i];
  el.innerHTML=bar(sl.length)+`<h1 class="tvh">${esc(x.title)}</h1>`+x.html;
}
function tvTimer(){ clearInterval(tv.timer); tv.timer=setInterval(()=>{ tv.i++; tvRender(); },12000); }
function tvOpen(){
  let el=document.getElementById('tv'); if(!el){ el=document.createElement('div'); el.id='tv'; document.body.appendChild(el); }
  tv.on=true; tv.i=0; tvRender(); tvTimer();
  try{ if(el.requestFullscreen) el.requestFullscreen().then(()=>{ tv.fs=true; }).catch(()=>{}); }catch(e){}
}
function tvClose(){
  clearInterval(tv.timer); tv.on=false; const el=document.getElementById('tv'); if(el) el.remove();
  try{ if(document.fullscreenElement&&document.exitFullscreen) document.exitFullscreen(); }catch(e){} tv.fs=false;
}
document.addEventListener('keydown',e=>{ if(!tv.on) return; if(e.key==='Escape') tvClose(); else if(e.key==='ArrowRight'){ tv.i++; tvRender(); tvTimer(); } else if(e.key==='ArrowLeft'){ tv.i--; tvRender(); tvTimer(); } });
document.addEventListener('click',e=>{ if(tv.on&&e.target.closest&&e.target.closest('[data-tv=close]')) tvClose(); });
document.addEventListener('fullscreenchange',()=>{ if(tv.on&&tv.fs&&!document.fullscreenElement) tvClose(); });

/* ================= Vues ================= */
const star=(type,id,name)=>{ const on=type==='team'?fav.teams.includes(id):!!fav.players[id]; return `<span class="stars"><button class="star" data-act="fav${type}" data-id="${esc(id)}" data-name="${esc(name||'')}" title="${on?'Retirer des favoris':'Ajouter aux favoris'}">${on?'★':'☆'}</button>${type==='team'?bellBtn('nba',id):''}</span>`; };
const gameDate=g=>fmtD(g.time);
const teamLink=(tri,name)=>`<span class="link" data-act="openteam" data-id="${esc(tri)}">${teamLogo(tri,18)}${esc(name||tname(tri))}</span>`;
const playerLink=(id,name)=>`<span class="link" data-act="openplayer" data-id="${esc(id)}">${esc(name)}</span>`;

/* ---------- Actus NBA en français (flux RSS Basket USA / TrashTalk) ---------- */
const KEYNEWS='suivi-nba-news', NEWS_SRC=[['Basket USA','https://www.basketusa.com/feed/']];
let news=loadJ(KEYNEWS,{t:0,items:[],err:''}), newsBusy=false;
news.items=(news.items||[]).filter(i=>i.s!=='TrashTalk');   // TrashTalk retiré
function newsStrip(h){ try{ const d=new DOMParser().parseFromString('<body>'+String(h||'')+'</body>','text/html'); return (d.body.textContent||'').replace(/\s+/g,' ').trim(); }catch(e){ return String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); } }
function newsParseXml(txt,src){ const doc=new DOMParser().parseFromString(txt,'text/xml'); const out=[];
  for(const it of doc.querySelectorAll('item')){ const g=n=>{ const e=it.getElementsByTagName(n)[0]; return e?e.textContent:''; }; const l=g('link').trim(), t=newsStrip(g('title')); if(!t||!/^https?:/.test(l)) continue;
    out.push({t,l,d:Date.parse(g('pubDate'))||0,e:newsStrip(g('description')).slice(0,190),s:src,c:newsClean(g('content:encoded'))}); }
  return out; }
async function newsGet(url,src){
  const enc=encodeURIComponent(url), tries=[()=>url,()=>'https://api.allorigins.win/raw?url='+enc,()=>'https://corsproxy.io/?url='+enc,()=>'rss2json'], errs=[];
  for(const f of tries){ const u=f(); try{
      if(u==='rss2json'){ const r=await fetch('https://api.rss2json.com/v1/api.json?rss_url='+enc); if(!r.ok) throw new Error('HTTP '+r.status); const j=await r.json(); if(j.status!=='ok') throw new Error('flux illisible'); return (j.items||[]).map(i=>({t:newsStrip(i.title),l:i.link,d:Date.parse(String(i.pubDate||'').replace(' ','T')+'Z')||0,e:newsStrip(i.description).slice(0,190),s:src,c:newsClean(i.content||'')})).filter(i=>i.t&&/^https?:/.test(i.l)); }
      const c=new AbortController(), to=setTimeout(()=>c.abort(),9000); let r; try{ r=await fetch(u,{signal:c.signal}); } finally{ clearTimeout(to); }
      if(!r.ok) throw new Error('HTTP '+r.status); const items=newsParseXml(await r.text(),src); if(!items.length) throw new Error('aucun article lu'); return items;
    }catch(e){ errs.push(e.message||String(e)); } }
  throw new Error(errs[errs.length-1]||'échec'); }
async function newsRefresh(auto,pages){
  if(newsBusy) return; newsBusy=true; if(!auto) say('⏳ Actus NBA…','warn'); pages=pages||3;
  if(ui.openGame&&ui.sport!=='foot') try{ render(); }catch(e){}
  try{ let all=[], bad=[];
    // le flux ne contient que ~10 articles : on lit aussi les pages suivantes (?paged=2, 3…) pour remonter ~1 jour en arrière
    await Promise.all(NEWS_SRC.map(async ([src,url])=>{ for(let pg=1;pg<=pages;pg++){ try{ const it=await newsGet(pg===1?url:url+'?paged='+pg,src); all=all.concat(it); if(!it.length||Date.now()-Math.min(...it.map(i=>i.d||Date.now()))>4*864e5) break; }catch(e){ if(pg===1) bad.push(src+' ('+(e.message||e)+')'); break; } } }));
    newsKeep(all);
    if(all.length){ const seen=new Set(); all=all.concat(news.items||[]).filter(i=>!seen.has(i.l)&&seen.add(i.l)&&(!i.d||Date.now()-i.d<21*864e5)).sort((a,b)=>b.d-a.d).slice(0,400); news={t:Date.now(),items:all,err:bad.join(' ; ')}; saveJ(KEYNEWS,news); if(!auto) say(`✓ ${all.length} article(s) récupéré(s)${bad.length?' — indisponible : '+esc(bad.join(' ; ')):''}.`,bad.length?'warn':'ok'); }
    else { news={...news,t:Date.now(),err:bad.join(' ; ')}; saveJ(KEYNEWS,news); if(!auto) say('⚠️ Actus : lecture directe refusée par le navigateur. Utilise le favori « Actus » sur basketusa.com puis Ctrl+V ici.','err'); }
    if(ui.sport!=='foot'&&(ui.tab==='home'||ui.openGame)&&(ui.openGame||!$('#modal').classList.contains('on'))) render();
  } finally { newsBusy=false; } }
function newsIngest(o){ try{ const it=newsParseXml(String(o.xml||''),o.src||'Actus'); if(!it.length) return 0; newsKeep(it); const seen=new Set(); const all=it.concat(news.items||[]).filter(i=>!seen.has(i.l)&&seen.add(i.l)&&(!i.d||Date.now()-i.d<21*864e5)).sort((a,b)=>b.d-a.d).slice(0,150); news={t:Date.now(),items:all,err:''}; saveJ(KEYNEWS,news); return it.length; }catch(e){ return 0; } }

/* ---- Lecteur d'article intégré : l'article s'ouvre dans une fenêtre de Statify ---- */
const KEYNF2='suivi-nba-news-full'; let newsFull=loadJ(KEYNF2,{});
const NEWS_OK={P:1,H1:1,H2:1,H3:1,H4:1,UL:1,OL:1,LI:1,BLOCKQUOTE:1,STRONG:1,B:1,EM:1,I:1,BR:1,A:1,IMG:1,FIGURE:1,FIGCAPTION:1};
function newsClean(html,base){
  try{
    const src=new DOMParser().parseFromString('<body>'+String(html||'')+'</body>','text/html').body, out=document.createElement('div'); let budget=18000;
    const safeUrl=u=>{ try{ const x=new URL(u,base||'https://www.basketusa.com/'); return /^https?:$/.test(x.protocol)?x.href:''; }catch(e){ return ''; } };
    const walk=(from,to)=>{ for(const n of [...from.childNodes]){
      if(budget<=0) return;
      if(n.nodeType===3){ const t=n.textContent; budget-=t.length; to.appendChild(document.createTextNode(t)); }
      else if(n.nodeType===1){ const tag=n.tagName;
        if(/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|NOSCRIPT|SVG|BUTTON|INPUT|TEXTAREA|SELECT|LINK|META|VIDEO|AUDIO|CANVAS)$/.test(tag)) continue;
        if(!NEWS_OK[tag]){ walk(n,to); continue; }
        const el=document.createElement(tag.toLowerCase());
        if(tag==='A'){ const h=safeUrl(n.getAttribute('href')); if(!h){ walk(n,to); continue; } el.href=h; el.target='_blank'; el.rel='noopener noreferrer'; }
        if(tag==='IMG'){ const s=safeUrl(n.getAttribute('src')||n.getAttribute('data-src')); if(!s) continue; el.src=s; el.alt=(n.getAttribute('alt')||'').slice(0,200); el.loading='lazy'; el.referrerPolicy='no-referrer'; budget-=300; to.appendChild(el); continue; }
        if(tag!=='BR') walk(n,el);
        to.appendChild(el); } } };
    walk(src,out);
    [...out.querySelectorAll('p')].forEach(p=>{ const t=p.textContent.trim(); if((!t&&!p.querySelector('img'))||/est apparu en premier sur|appeared first on/i.test(t)) p.remove(); });
    return out.innerHTML;
  }catch(e){ return ''; }
}
function newsKeep(arr){
  try{
    for(const i of arr){ if(i.c){ if(i.c.length>=300) newsFull[i.l]=i.c; delete i.c; } }
    const keep=new Set((news.items||[]).concat(arr).sort((a,b)=>(b.d||0)-(a.d||0)).slice(0,30).map(i=>i.l));
    for(const k of Object.keys(newsFull)) if(!keep.has(k)) delete newsFull[k];
    saveJ(KEYNF2,newsFull);
  }catch(e){}
}
function newsReaderHtml(l){
  const i=(news.items||[]).find(x=>x.l===l); if(!i) return '';
  const c=newsFull[l];
  const body=c?`<div class="nrd">${newsClean(c)}</div>`
    :ui.newsLoad===l?`<div class="nrd"><p class="mut">⏳ Chargement de l'article complet…</p>${i.e?`<p>${esc(i.e)}${i.e.length>=189?'…':''}</p>`:''}</div>`
    :`<div class="nrd"><p class="mut">${ui.newsFail===l?'Impossible de charger l\'article complet pour l\'instant (la page ou le relais ne répond pas).':'Le texte complet de cet article n\'est pas disponible dans le flux.'}</p>${i.e?`<p>${esc(i.e)}${i.e.length>=189?'…':''}</p>`:''}<p><button class="sec" data-act="newsretry" data-l="${esc(l)}">🔄 Réessayer</button></p></div>`;
  const btns=`<div class="row" style="margin-top:14px;gap:8px"><a class="nrd-open" href="${esc(i.l)}" target="_blank" rel="noopener">Lire sur le site d'origine ↗</a><button class="sec" data-act="newsclose">Fermer</button></div>`;
  return `<div class="card nrd-card"><div class="mut" style="font-size:12px;margin-bottom:8px;padding-right:48px">${esc(i.s)}${i.d?' · '+esc(newsAgo(i.d)):''}</div><h2 style="margin:0 0 12px;line-height:1.3;padding-right:44px">${esc(i.t)}</h2>${body}${btns}</div>`;
}

/* ---- Article complet : le flux n'a qu'un résumé, on lit la page de l'article et on en extrait le texte ---- */
function newsExtract(txt,base){
  if(txt.length<30000&&/Just a moment|cf-browser-verification|Enable JavaScript and cookies|Attention Required/i.test(txt.slice(0,8000))) return '';
  const doc=new DOMParser().parseFromString(txt,'text/html');
  doc.querySelectorAll('img').forEach(im=>{ const s=im.getAttribute('data-src')||im.getAttribute('data-lazy-src')||im.getAttribute('data-original');
    if(s) im.setAttribute('src',s); else { const ss=im.getAttribute('data-srcset')||im.getAttribute('srcset'); if(!im.getAttribute('src')&&ss) im.setAttribute('src',ss.split(',')[0].trim().split(' ')[0]); } });
  let el=null;
  for(const s of ['article .entry-content','.entry-content','.post-content','.td-post-content','[itemprop=articleBody]','.article-content','.single-content','.post-body','article']){
    for(const c of doc.querySelectorAll(s)){ if((c.textContent||'').trim().length>400){ el=c; break; } } if(el) break; }
  if(!el){ let best=0; doc.querySelectorAll('div,section,main').forEach(c=>{ let n=0; c.querySelectorAll(':scope > p').forEach(p=>{ n+=(p.textContent||'').trim().length; }); if(n>best){ best=n; el=c; } }); if(best<400) el=null; }
  if(!el) return '';
  const junk=/share|social|related|newsletter|comment|advert|\bads?\b|promo|sidebar|widget|breadcrumb|author|tags|pagination|sponsor|subscribe|read-more|lire-aussi|yarpp|jp-relatedposts|wp-block-buttons/i;
  el.querySelectorAll('script,style,noscript,iframe,form,nav,aside,button,svg,video,audio').forEach(n=>n.remove());
  el.querySelectorAll('[class],[id]').forEach(n=>{ if(n!==el&&junk.test((n.getAttribute('class')||'')+' '+(n.getAttribute('id')||''))) n.remove(); });
  const h=newsClean(el.innerHTML,base);
  return h.replace(/<[^>]+>/g,'').trim().length>=300?h:'';
}
async function newsFetchArticle(url){
  const enc=encodeURIComponent(url), tries=[()=>url,()=>'https://api.allorigins.win/raw?url='+enc,()=>'https://corsproxy.io/?url='+enc], errs=[];
  for(const f of tries){
    try{ const c=new AbortController(), to=setTimeout(()=>c.abort(),12000); let r; try{ r=await fetch(f(),{signal:c.signal}); } finally{ clearTimeout(to); }
      if(!r.ok) throw new Error('HTTP '+r.status);
      const h=newsExtract(await r.text(),url); if(h) return h; throw new Error('texte introuvable');
    }catch(e){ errs.push(e.message||String(e)); } }
  throw new Error(errs.join(' | '));
}
async function newsLoadFull(l){
  if(newsFull[l]||ui.newsLoad===l) return;
  ui.newsLoad=l; ui.newsFail=null;
  try{
    const h=await newsFetchArticle(l); newsFull[l]=h;
    const keep=new Set((news.items||[]).slice().sort((a,b)=>(b.d||0)-(a.d||0)).slice(0,30).map(i=>i.l)); keep.add(l);
    for(const k of Object.keys(newsFull)) if(!keep.has(k)) delete newsFull[k];
    saveJ(KEYNF2,newsFull);
  }catch(e){ ui.newsFail=l; }
  finally{ if(ui.newsLoad===l) ui.newsLoad=null; if(ui.newsRead===l) render(); }
}
function newsAgo(t){ if(!t) return ''; const m=Math.max(0,Math.round((Date.now()-t)/6e4)); return m<60?`il y a ${m} min`:m<1440?`il y a ${Math.round(m/60)} h`:`il y a ${Math.round(m/1440)} j`; }
function newsCard(){
  if(!ui.newsTried&&(!news.t||Date.now()-news.t>30*6e4)){ ui.newsTried=1; setTimeout(()=>newsRefresh(true),300); }
  const kw=[...fav.teams.flatMap(t=>{ const n=tname(t).toLowerCase(); return [n,n.split(' ').slice(-1)[0]]; }),...Object.values(fav.players).map(n=>String(n).toLowerCase().split(' ').slice(-1)[0]).filter(w=>w.length>=4)];
  const onlyFav=!!ui.newsFav&&kw.length, list=news.items.filter(i=>!onlyFav||kw.some(k=>(i.t+' '+i.e).toLowerCase().includes(k))).slice(0,ui.newsMore?20:8);
  const rows=list.map(i=>`<div class="alert"><a href="${esc(i.l)}" data-act="newsopen" data-l="${esc(i.l)}" target="_blank" rel="noopener"><b>${esc(i.t)}</b></a> <span class="mut" style="font-size:12px">· ${esc(i.s)} · ${i.d?esc(newsAgo(i.d)):''}</span>${i.e?`<div class="mut" style="margin-top:2px">${esc(i.e)}${i.e.length>=189?'…':''}</div>`:''}</div>`).join('');
  return `<div class="card"><div class="row between"><h2 style="margin:0">📰 Actus NBA en français</h2><div class="row">${kw.length?`<label class="mut"><input type="checkbox" data-act="newsfav" ${onlyFav?'checked':''}> mes favoris</label>`:''}<button class="sec" data-act="newsrefresh">🔄 Actualiser</button></div></div>${rows||`<p class="mut" style="margin:10px 0 0">${news.items.length?'Aucun article ne parle de tes favoris pour le moment.':(news.err?'Lecture directe refusée par le navigateur. Installe le favori « Actus » (fichier <b>bouton-favori-actus.html</b>), va sur <b>basketusa.com</b>, clique dessus, puis fais <b>Ctrl+V</b> ici.':'Chargement des actus…')}</p>`}${news.items.length>list.length&&!onlyFav?`<p style="margin:8px 0 0"><span class="link" data-act="newsmore">Voir plus d'articles</span></p>`:''}<p class="mut" style="margin:8px 0 0;font-size:11px">Articles du flux public de Basket USA : un clic ouvre l'article ici (lien vers le site d'origine en bas).${news.t?' Mis à jour '+esc(newsAgo(news.t))+'.':''}</p></div>`;
}
/* ---- Grand bloc d'accueil (dernier résultat de ton équipe) ---- */
function heroHtml(o){
  return `<div class="hero click" style="--tc:${o.col}" data-act="${o.act}" data-id="${esc(o.id)}"><div class="hero-eb">${esc(o.eb)}</div><div class="hero-row"><div class="hero-t"><span class="hero-lg">${o.l1}</span><b>${esc(o.n1)}</b></div><div class="hero-s">${o.s1}<small>–</small>${o.s2}</div><div class="hero-t"><span class="hero-lg">${o.l2}</span><b>${esc(o.n2)}</b></div></div><div class="hero-ft"><span class="hero-chip ${o.cls}">${esc(o.chip)}</span><span>${esc(o.when)}</span></div></div>`;
}
function heroNba(S){
  try{ const fin=[...S.fin].sort((a,b)=>tms(b)-tms(a)); if(!fin.length) return '';
    const tri=fav.teams.find(t=>fin.some(g=>g.home.tri===t||g.away.tri===t)), g=tri?fin.find(x=>x.home.tri===tri||x.away.tri===tri):fin[0];
    const a=+g.away.score, h=+g.home.score, mineHome=tri?g.home.tri===tri:h>=a, ms=mineHome?h:a, os=mineHome?a:h, d=Math.abs(h-a), focus=mineHome?g.home.tri:g.away.tri;
    return heroHtml({act:'opengame',id:g.id,col:tcolor(focus),eb:tri?'Ton équipe · '+tname(tri):'Dernier match joué',l1:teamLogo(g.away.tri,44),n1:g.away.tri,l2:teamLogo(g.home.tri,44),n2:g.home.tri,s1:g.away.score,s2:g.home.score,
      cls:tri?(ms>os?'w':'l'):'n',chip:tri?(ms>os?'Victoire +'+d:'Défaite −'+d):'Écart '+d,when:fmtD(g.time)+' · Final'});
  }catch(e){ return ''; }
}
function heroFoot(done){
  try{ if(!done||!done.length) return ''; const L=[...done].sort((a,b)=>Date.parse(b.d)-Date.parse(a.d));
    const fid=ffav.find(id=>L.some(m=>m.hid===id||m.aid===id)), m=fid?L.find(x=>x.hid===fid||x.aid===fid):L[0];
    const mineHome=fid?m.hid===fid:true, ms=mineHome?m.hs:m.as, os=mineHome?m.as:m.hs;
    return heroHtml({act:'fmatch',id:m.id,col:fcol(mineHome?m.hc:m.ac),eb:fid?'Ton club · '+(mineHome?m.hn:m.an):'Dernier match joué',l1:footLogo(m.hl,44),n1:m.hn,l2:footLogo(m.al,44),n2:m.an,s1:m.hs,s2:m.as,
      cls:fid?(ms>os?'w':ms<os?'l':'n'):'n',chip:fid?(ms>os?'Victoire':ms<os?'Défaite':'Match nul'):footLgName(m.lg),when:fmtD(m.d)+' · Terminé'});
  }catch(e){ return ''; }
}
function viewHome(S){
  if(!Object.keys(games).length) return `<div class="card"><h2>Bienvenue 👋</h2><p>Pour commencer :</p><ol><li>Colle un lien nba.com dans la zone en haut (ou utilise le marque-page), puis « Ajouter ».</li><li>Marque tes équipes et joueurs préférés avec l'étoile ☆.</li><li>Sur <b>nba.com/schedule</b>, clique sur le favori puis Ctrl+V ici pour afficher les prochains matchs.</li></ol></div>`+(ffav.length?`<div class="card"><h2>⚽ Mes clubs de foot</h2>${footFavCards()}</div>`:'');
  const fin=S.fin, favT=fav.teams, favP=Object.keys(fav.players), sc=teamSchedules(), B={};
  B.kpis=`<div class="grid"><div class="kpi"><span class="mut">Matchs suivis</span><b>${Object.keys(games).length}</b></div><div class="kpi"><span class="mut">Terminés</span><b>${fin.length}</b></div><div class="kpi"><span class="mut">Joueurs</span><b>${Object.keys(S.P).length}</b></div><div class="kpi"><span class="mut">Pts / match</span><b>${f1(fin.reduce((s,g)=>s+ +g.home.score+ +g.away.score,0)/(fin.length||1))}</b></div></div>`;
  B.alerts=alertCard(S);
  B.week=weekCard(S);
  const teamCards=favT.map(tri=>{ const t=S.T[tri], nx=nextGame(tri);
    return `<div class="mini" style="border-left:4px solid ${tcolor(tri)}"><div class="row between"><b>${teamLink(tri)}</b>${star('team',tri)}</div>${t?`<div class="big">${t.w}-${t.l}</div><div class="mut">Diff. moy. ${f1((t.pf-t.pa)/t.g)} · Série ${streak(t.log)}</div><div style="margin-top:6px">${formDots(t.log)}</div>`:'<div class="mut">Aucun match terminé</div>'}${nx?`<div class="mut" style="margin-top:6px">Prochain : <span class="link" data-act="opengame" data-id="${esc(nx.id)}">${esc(nx.a)} @ ${esc(nx.h)}</span> — ${esc(fmtDT(nx.t))}${restBefore(sc,tri,nx.id)===0?' · ⚠️ 2e soir de suite':''}</div>`:''}</div>`; }).join('');
  const playerCards=favP.map(id=>{ const p=S.P[id], tri=p?p.tri:'';
    return `<div class="mini" style="border-left:4px solid ${tcolor(tri)}"><div class="row between"><div class="row">${avatar(id,fav.players[id],tri,44)}<b>${playerLink(id,fav.players[id])}</b></div>${star('player',id,fav.players[id])}</div>${p?`<div class="big">${f1(p.pts/p.gp)} pts</div><div class="mut">${p.tri} · ${p.gp} MJ · ${f1(p.reb/p.gp)} reb · ${f1(p.ast/p.gp)} pas</div><div style="margin-top:6px">${spark(p.log.slice(-10).map(x=>x.pts))} <span class="mut">Tendance</span> ${trendHtml(trend(p))}</div>`:'<div class="mut">Pas encore de stats</div>'}</div>`; }).join('');
  const sel=`<div class="row" style="margin-top:10px"><select id="favTeamSel"><option value="">Ajouter une équipe favorite…</option>${Object.keys(TEAMS).filter(t=>!favT.includes(t)).map(t=>`<option value="${t}">${esc(tname(t))}</option>`).join('')}</select><button class="sec" data-act="addfavteam">Ajouter</button></div>`;
  B.favs=`<div class="card"><h2>Mes favoris</h2>${(teamCards||playerCards)?`<div class="grid2">${teamCards}${playerCards}</div>`:'<p class="mut">Aucun favori pour l\'instant. Ajoute une équipe ci-dessous, ou clique sur l\'étoile ☆ à côté d\'un joueur.</p>'}${sel}</div>`;
  B.notes=notesCard(S);
  B.tonight=tonightNba(S); B.bigmatch=bigCard(S); B.duel=duelCard(S); B.news=newsCard();
  const lastDay=fin.length?nyDay(fin[fin.length-1].time):null, dayG=fin.filter(g=>nyDay(g.time)===lastDay);
  const last=[...(lastDay?dayG:[])].reverse().map(g=>{ const aw=+g.away.score>+g.home.score, hw=+g.home.score>+g.away.score;
    return `<tr class="click" data-act="opengame" data-id="${g.id}"><td class="l">${gameDate(g)}</td><td class="l ${aw?'win':''}">${teamLogo(g.away.tri,20)}<span class="nfull">${esc(g.away.name)}</span><span class="ntri">${esc(g.away.tri)}</span></td><td class="${aw?'win':''}">${g.away.score}</td><td class="l ${hw?'win':''}">@ ${teamLogo(g.home.tri,20)}<span class="nfull">${esc(g.home.name)}</span><span class="ntri">${esc(g.home.tri)}</span></td><td class="${hw?'win':''}">${g.home.score}</td></tr>`; }).join('');
  B.results=`<div class="card"><h2>Derniers résultats <span class="mut" style="font-weight:400;font-size:13px">${lastDay?esc(fmtD(dayG[dayG.length-1].time))+' · '+dayG.length+' match'+(dayG.length>1?'s':''):''}</span></h2><div class="scroll"><table><tbody>${last||'<tr><td class="empty">Aucun match terminé</td></tr>'}</tbody></table></div></div>`;
  const topAll=Object.values(S.P).sort((a,b)=>b.pts/b.gp-a.pts/a.gp), pvTop=S.prev?rankMap(playerRanking(S.prev.P,'pts',-1,1)):null;
  const top=topAll.slice(0,5).map((p,i)=>`<tr><td class="l">${i+1}.${moveHtml(pvTop,p.id,i+1)} ${avatar(p.id,p.name,p.tri,26)}${playerLink(p.id,p.name)} <span class="mut">${p.tri}</span></td><td>${p.gp}</td><td><b>${f1(p.pts/p.gp)}</b></td><td>${p.pts}</td></tr>`).join('');
  B.scorers=`<div class="card"><h2>Meilleurs marqueurs</h2><div class="scroll"><table><thead><tr><th class="l">Joueur</th><th>MJ</th><th>PTS moy.</th><th>PTS tot.</th></tr></thead><tbody>${top||'<tr><td class="empty" colspan="4">–</td></tr>'}</tbody></table></div></div>`;
  const cfg=homeCfgNorm();
  const parts=cfg.order.filter(id=>!cfg.hidden.includes(id)).map(id=>B[id]?`<div class="${HOME_FULL.includes(id)?'full':''}">${B[id]}</div>`:'').join('');
  return heroNba(S)+(()=>{ try{ return stuReadyCard('nba'); }catch(e){ return ''; } })()+`<div class="row between" style="margin-bottom:10px"><span class="mut">${cfg.hidden.length?cfg.hidden.length+' bloc(s) masqué(s)':''}</span><button class="sec" data-act="homeedit">⚙ Personnaliser l'accueil</button></div>${ui.homeEdit?homeEditor(cfg):''}<div class="home">${parts}</div>`;
}

function viewGames(S){
  let list=Object.values(games).sort((a,b)=>tms(b)-tms(a)||b.id.localeCompare(a.id));
  const tris=[...new Set(Object.values(games).flatMap(g=>[g.home.tri,g.away.tri]))].sort();
  if(ui.gTeam) list=list.filter(g=>g.home.tri===ui.gTeam||g.away.tri===ui.gTeam);
  const dkey=g=>{ const t=tms(g); return t?new Date(t).toLocaleDateString('fr-CA',{timeZone:'Europe/Paris'}):'?'; };
  const dlab=g=>{ const t=tms(g); return t?new Date(t).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'}):'Date inconnue'; };
  const days=[]; for(const g of list){ const k=dkey(g); let d=days[days.length-1]; if(!d||d.k!==k){ d={k,lab:dlab(g),gs:[]}; days.push(d); } d.gs.push(g); }
  const win=(g,side)=>{ const fin=g.status===3, a=+g.away.score, h=+g.home.score; return fin&&(side==='a'?a>h:h>a); };
  const isFav=g=>fav.teams.includes(g.home.tri)||fav.teams.includes(g.away.tri);
  const tile=g=>{ const fin=g.status===3, wa=win(g,'a'), wh=win(g,'h'), diff=Math.abs(+g.away.score-+g.home.score), w=wa?g.away.tri:g.home.tri;
    const side=(t,sc,isW)=>`<div class="gt-side ${fin&&!isW?'lose':''}"><span class="gt-t">${teamLogo(t.tri,28)}<b>${esc(t.tri)}</b></span><span class="gt-sc">${esc(String(sc))}</span></div>`;
    const bg=stuNbaBig(g.away.tri,g.home.tri); return `<div class="gt-tile click ${isFav(g)?'fv':''} ${bg?'big':''}" data-act="opengame" data-id="${g.id}">${bg?`<div class="bigtag">🔥 ${esc(bg)}</div>`:''}<div class="gt-top"><span>${fin?'FINAL':esc(g.statusText||'À venir')}${noteMark('game:'+g.id)}</span><span>${isFav(g)?'⭐ ':''}<button class="danger gt-x" data-act="delgame" data-id="${g.id}" title="Supprimer">✕</button></span></div>${side(g.away,g.away.score,wa)}${side(g.home,g.home.score,wh)}${fin&&diff?`<div class="gt-diff">${esc(w)} +${diff}</div>`:''}</div>`; };
  const line=g=>{ const fin=g.status===3, wa=win(g,'a'), wh=win(g,'h');
    return `<div class="gt-line click ${isFav(g)?'fv':''}" data-act="opengame" data-id="${g.id}"><span class="gt-l ${fin&&!wa?'lose':''}"><b>${esc(g.away.tri)}</b>${teamLogo(g.away.tri,22)}</span><span class="gt-m"><span class="${fin&&!wa?'lose':''}">${esc(String(g.away.score))}</span><i>–</i><span class="${fin&&!wh?'lose':''}">${esc(String(g.home.score))}</span></span><span class="gt-r ${fin&&!wh?'lose':''}">${teamLogo(g.home.tri,22)}<b>${esc(g.home.tri)}</b></span>${fin?'':`<span class="tag live">${esc(g.statusText||'À venir')}</span>`}<button class="danger gt-x" data-act="delgame" data-id="${g.id}" title="Supprimer">✕</button></div>`; };
  const body=days.map((d,i)=>`<div class="gt-day">${esc(d.lab)} <span class="mut">· ${d.gs.length} match${d.gs.length>1?'s':''}</span></div>${i===0?`<div class="gt-grid">${d.gs.map(tile).join('')}</div>`:`<div class="gt-list">${d.gs.map(line).join('')}</div>`}`).join('');
  let h=`<div class="card"><div class="row" style="margin-bottom:6px"><select id="gTeam"><option value="">Toutes les équipes</option>${tris.map(t=>`<option value="${t}" ${t===ui.gTeam?'selected':''}>${esc(tname(t))}</option>`).join('')}</select><span class="mut">${list.length} match(s) · touche un match pour le box score</span></div>${body||'<p class="empty">Aucun match.</p>'}</div>`;
  return h;
}

/* ---- Résumés de la presse française (Basket USA, TrashTalk) rattachés au match ---- */
const NICK={ATL:'Hawks',BOS:'Celtics',BKN:'Nets',CHA:'Hornets',CHI:'Bulls',CLE:'Cavaliers',DAL:'Mavericks',DEN:'Nuggets',DET:'Pistons',GSW:'Warriors',HOU:'Rockets',IND:'Pacers',LAC:'Clippers',LAL:'Lakers',MEM:'Grizzlies',MIA:'Heat',MIL:'Bucks',MIN:'Timberwolves',NOP:'Pelicans',NYK:'Knicks',OKC:'Thunder',ORL:'Magic',PHI:'Sixers',PHX:'Suns',POR:'Trail Blazers',SAC:'Kings',SAS:'Spurs',TOR:'Raptors',UTA:'Jazz',WAS:'Wizards'};

const NALT={PHI:['76ers','sixers'],POR:['trail blazers','blazers'],MIN:['timberwolves','wolves'],CLE:['cavaliers','cavs'],DAL:['mavericks','mavs']};
const NEWS_SEARCH=[['Basket USA',q=>'https://www.basketusa.com/?s='+encodeURIComponent(q)]];
function nbaKeys(t){ const n=(NICK[t]||tname(t)).toLowerCase(); return [n,...(NALT[t]||[])]; }
function nbaHas(txt,keys){ return keys.some(k=>new RegExp('(^|[^a-zà-ÿ0-9])'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-zà-ÿ0-9]|$)','i').test(txt)); }
function gameNews(g){
  if(!g||g.status!==3||!news||!(news.items||[]).length) return [];
  const t0=Date.parse(g.time)||0, kh=nbaKeys(g.home.tri), ka=nbaKeys(g.away.tri), a=+g.away.score||0, h=+g.home.score||0, W=Math.max(a,h), Lo=Math.min(a,h);
  const sc=new RegExp('\\b'+W+'\\s*(-|–|à|a)\\s*'+Lo+'\\b'), res=/(victoire|vainqueur|bat\b|battent|battu|s'impos|s’impos|domin|défaite|renvers|plie|écras|fait chuter|font chuter|sombre|craque|punit|punissent|remporte|l'emport|l’emport|résiste|k\.?o\b|efface|effacent|remontée|retournement|enchaîn|s'offre|s’offre|s'offrent|corrige|surclass|dompt|terrass|étrill|atomis|assomm|crucifi|scalp|douche|refroidi|stopp|vient à bout|viennent à bout|se défait|tombe|tombent|chute|s'incline|s’incline|cède|cèdent|piège|piègent|maîtris|s'adjug|déroul|carton|humili|record)/i, prev=/(pronostic|paris joueurs|paris sportifs|aperçu|avant-match|preview|programme|à quelle heure|où regarder|blessures et)/i;
  const out=[];
  for(const it of news.items){ if(!it.d) continue; const dt=it.d-t0; if(dt<-2*36e5||dt>60*36e5||prev.test(it.t)) continue;
    const txt=(it.t+' '+(it.e||'')).toLowerCase(), th=nbaHas(txt,kh), ta=nbaHas(txt,ka), titleBoth=nbaHas(it.t.toLowerCase(),kh)&&nbaHas(it.t.toLowerCase(),ka);
    let v=0; if(th&&ta) v+=3; else if(th||ta) v+=1; if(titleBoth) v+=2; if(sc.test(txt)) v+=2; if(res.test(it.t)) v+=1;
    const recap=sc.test(txt)||res.test(it.t)||/(récap|resume|résumé|compte rendu)/i.test(it.t);
    if(th&&ta&&((titleBoth&&recap)||sc.test(txt))) out.push({it,v});
    else if(titleBoth&&dt>=36e5&&dt<=20*36e5) out.push({it,v:v-1}); }
  const best={}; for(const x of out.sort((a,b)=>b.v-a.v||a.it.d-b.it.d)){ if(!best[x.it.s]) best[x.it.s]=x.it; }
  return Object.values(best).slice(0,2);
}
function nbaRecapHtml(g){
  if(!g||g.status!==3) return '';
  if(!ui.newsTriedG&&(!news.t||Date.now()-news.t>30*6e4)){ ui.newsTriedG=1; setTimeout(()=>newsRefresh(true),200); }
  const L=gameNews(g), q=(NICK[g.away.tri]||g.away.tri)+' '+(NICK[g.home.tri]||g.home.tri);
  const deep=(ui.newsDeep ||= {}); if(!L.length&&!deep[g.id]&&Date.now()-(Date.parse(g.time)||0)<5*864e5){ deep[g.id]=1; setTimeout(()=>newsRefresh(true,6),300); }
  const links=NEWS_SEARCH.map(([n,f])=>`<a href="${esc(f(q))}" target="_blank" rel="noopener">${n} ↗</a>`).join(' · ');
  const body=L.length?L.map(i=>`<div class="alert"><a href="${esc(i.l)}" data-act="newsopen" data-l="${esc(i.l)}" target="_blank" rel="noopener"><b>${esc(i.t)}</b></a> <span class="mut" style="font-size:12px">· ${esc(i.s)}</span>${i.e?`<div class="mut" style="margin-top:2px">${esc(i.e)}${i.e.length>=189?'…':''}</div>`:''}</div>`).join('')
    :`<p class="mut" style="margin:6px 0">${news.items&&news.items.length?(newsBusy?'⏳ Recherche du résumé dans les derniers articles…':'Pas encore d\'article trouvé pour ce match dans les derniers articles.'):'Actus pas encore chargées.'} <span class="link" data-act="newsrefresh">🔄 Chercher</span></p>`;
  return `<div class="card" style="background:var(--field);margin:10px 0"><h3 style="margin:0 0 6px">📰 Le match vu par la presse française</h3>${body}<p class="mut" style="margin:6px 0 0;font-size:12px">Chercher le résumé complet : ${links}</p></div>`;
}
const ddBadge=p=>{ const n=[p.pts,p.reb,p.ast,p.stl,p.blk].filter(v=>v>=10).length; return n>=3?' <span class="ddb td" title="Triple-double">TD</span>':n===2?' <span class="ddb" title="Double-double">DD</span>':''; };
function bxHero(g){
  const aw=+g.away.score>+g.home.score, col=tcolor(aw?g.away.tri:g.home.tri), a=g.away.q||[], h=g.home.q||[], n=Math.max(a.length,h.length), lab=i=>i<4?'Q'+(i+1):'OT'+(i-3);
  const qt=n?`<div class="bxh-q" style="grid-template-columns:54px repeat(${n},1fr) 40px"><span></span>${Array.from({length:n},(_,i)=>`<span class="h">${lab(i)}</span>`).join('')}<span class="h">T</span><span class="l">${esc(g.away.tri)}</span>${Array.from({length:n},(_,i)=>`<span>${a[i]??'–'}</span>`).join('')}<b>${g.away.score}</b><span class="l">${esc(g.home.tri)}</span>${Array.from({length:n},(_,i)=>`<span>${h[i]??'–'}</span>`).join('')}<b>${g.home.score}</b></div>`:'';
  return `<div class="hero" style="--tc:${col};cursor:default"><div class="hero-eb">${esc(gameDate(g))} · ${g.status===3?'Final':esc(g.statusText||'')}</div><div class="hero-row"><div class="hero-t"><span class="hero-lg">${teamLogo(g.away.tri,44)}</span><b>${esc(NICK[g.away.tri]||g.away.name||g.away.tri)}</b></div><div class="hero-s">${g.away.score}<small>–</small>${g.home.score}</div><div class="hero-t"><span class="hero-lg">${teamLogo(g.home.tri,44)}</span><b>${esc(NICK[g.home.tri]||g.home.name||g.home.tri)}</b></div></div>${qt}</div>`;
}
function bxTops(g){
  const one=t=>{ const ps=[...t.players].filter(p=>p.min>0).sort((a,b)=>b.pts-a.pts||b.min-a.min).slice(0,3); if(!ps.length) return '';
    return `<div class="card"><h3 style="margin:0 0 10px;display:flex;align-items:center;gap:8px">⭐ Les meilleurs · ${teamLogo(t.tri,22)}${esc(t.name||t.tri)}</h3><div class="bx-tops">${ps.map(p=>`<div class="bx-tp"><span class="bx-av">${avatar(p.id,p.name,p.tri,42)}</span><b>${esc(p.name)}</b>${ddBadge(p)}<div class="bx-big">${p.pts}<small>pts</small></div><span class="mut" style="font-size:11px">${p.reb} reb · ${p.ast} pas</span></div>`).join('')}</div></div>`; };
  return one(g.away)+one(g.home);
}

/* ---- « Avant le match » : carte d'infos pour un match à venir (foot + NBA) ---- */
function preCd(iso){ const t=Date.parse(iso); if(!t) return ''; const d=t-Date.now(); if(d<=0) return '⏱ Coup d\'envoi imminent'; const m=Math.round(d/60000), h=Math.floor(m/60), mm=m%60; return '⏱ Coup d\'envoi dans '+(h>=48?Math.round(h/24)+' jours':h>0?h+' h '+String(mm).padStart(2,'0'):mm+' min'); }
const preForm=arr=>arr.length?arr.map(x=>`<span class="dot ${x==='V'?'w':x==='D'?'l':'d'}">${x}</span>`).join(''):'<span class="mut">–</span>';
function preBars(rows,ca,cb){ return rows.map(([lab,a,b,hi])=>{ const mx=Math.max(a,b,0.001); return `<div class="pre-st"><b>${f1(a)}</b><div class="pre-sb"><div class="l"><i style="width:${Math.round(a/mx*100)}%;background:${ca}"></i></div><span>${esc(lab)}</span><div class="r"><i style="width:${Math.round(b/mx*100)}%;background:${cb}"></i></div></div><b>${f1(b)}</b></div>`; }).join(''); }
function preH2H(na,nb,wa,wb,dr,ca,cb,last){ const n=wa+wb+dr; if(!n) return ''; return `<div class="card pre"><h3>⚔️ Face à face</h3><div class="pre-lab"><span>${esc(na)} ${wa}</span>${dr?`<span class="mut">${dr} nul${dr>1?'s':''}</span>`:'<span></span>'}<span>${esc(nb)} ${wb}</span></div><div class="pre-h2h"><i style="width:${wa/n*100}%;background:${ca}"></i><i style="width:${dr/n*100}%;background:#c9d6e3"></i><i style="width:${wb/n*100}%;background:${cb}"></i></div>${last?`<div class="mut" style="font-size:12px">${last}</div>`:''}</div>`; }
function footPre(m){
  const {T,P,mt}=footIdx(), th=T[m.hid]||{}, ta=T[m.aid]||{}, ch=fcol(m.hc), cx=fcol(m.ac), [ca,cb]=pickColors([ch,cx]);
  let out='';
  const sh=th.st, sa=ta.st;
  if(sh&&sa){ const gap=Math.abs(sh.pts-sa.pts), lead=sh.pts>=sa.pts?m.hn:m.an;
    out+=`<div class="card pre"><h3>🎯 L'enjeu</h3><div class="pre-tx"><b>${esc(m.hn)}</b> (${sh.rank}${sh.rank===1?'er':'e'}, ${sh.pts} pts) reçoit <b>${esc(m.an)}</b> (${sa.rank}${sa.rank===1?'er':'e'}, ${sa.pts} pts). ${gap===0?'Égalité de points avant le match.':gap<=3?`Seulement <b>${gap} pt${gap>1?'s':''}</b> d'écart : un match direct.`:`${esc(lead)} compte <b>${gap} pts</b> d'avance.`}</div></div>`; }
  if(th.log&&ta.log&&(th.log.length||ta.log.length)) out+=`<div class="card pre"><h3>📈 Forme (5 derniers)</h3><div class="pre-fm"><span>${esc(m.hn)}</span><div>${fdots(m.hid)}</div></div><div class="pre-fm"><span>${esc(m.an)}</span><div>${fdots(m.aid)}</div></div></div>`;
  const h2=mt.filter(x=>x.done&&x.id!==m.id&&((x.hid===m.hid&&x.aid===m.aid)||(x.hid===m.aid&&x.aid===m.hid))).sort((a,b)=>Date.parse(b.d)-Date.parse(a.d));
  if(h2.length){ let wa=0,wb=0,dr=0; for(const x of h2){ const hg=x.hid===m.hid?x.hs:x.as, ag=x.hid===m.hid?x.as:x.hs; hg>ag?wa++:hg<ag?wb++:dr++; } const l=h2[0]; out+=preH2H(m.hn,m.an,wa,wb,dr,ca,cb,`Dernier : ${esc(l.hn)} ${l.hs}-${l.as} ${esc(l.an)} (${esc(fmtD(l.d))})`); }
  const top=id=>Object.values(P).filter(p=>p.tid===id&&p.g>0).sort((a,b)=>b.g-a.g||b.a-a.a)[0];
  const pa=top(m.hid), pb=top(m.aid), pc=(p,co)=>p?`<div class="pre-p"><span class="pre-av">${footAv(p.id,p.n,co,40)}</span><b>${plink(p.id,p.n)}</b><div class="big">${p.g}</div><span class="mut">buts · ${esc(p.tn)}${p.a?' · '+p.a+' pd':''}</span></div>`:'<div></div>';
  if(pa||pb) out+=`<div class="card pre"><h3>⭐ Joueurs à suivre</h3><div class="pre-pl">${pc(pa,m.hc)}${pc(pb,m.ac)}</div></div>`;
  if(th.g&&ta.g) out+=`<div class="card pre"><h3>📊 Moyennes par match</h3>${preBars([['Buts marqués',th.gf/th.g,ta.gf/ta.g],['Buts encaissés',th.ga/th.g,ta.ga/ta.g]],ca,cb)}</div>`;
  if(!m.x) out+=`<div class="pre-note">🕐 <div><b>Compositions</b> : ESPN les publie environ 1 h avant le coup d'envoi. Rouvre ce match à ce moment-là.</div></div>`;
  return out;
}
function gameOrSched(id){
  if(games[id]) return games[id]; const x=sched.find(e=>e.id===id); if(!x) return null;
  const mk=tri=>({tri,name:tname(tri),score:0,players:[],st:{},q:[]});
  return {id:x.id,time:x.t,status:1,statusText:'À venir',home:mk(x.h),away:mk(x.a)};
}
function nbaPre(g){
  const S=buildStats(), sc=teamSchedules(), ha=g.home.tri, aw=g.away.tri, th=S.T[ha], ta=S.T[aw], [ca,cb]=pickColors([tcolor(aw),tcolor(ha)]);
  const rank=Object.values(S.T).sort(standCmp).map(t=>t.tri), rk=t=>rank.indexOf(t)+1;
  const bl=t=>{ const T=S.T[t]; return T?`${T.w}-${T.l} · ${rk(t)}e`:''; };
  let out='';
  const rest=t=>{ const r=restBefore(sc,t,g.id); return r===null?'':r===0?'<span class="pre-chip w">2e soir de suite</span>':`<span class="pre-chip g">Reposé · ${r} jour${r>1?'s':''}</span>`; };
  out+=`<div class="card pre"><h3>📈 Forme et repos</h3>${[aw,ha].map(t=>`<div class="pre-fm"><span>${teamLogo(t,20)} ${esc(tname(t))}</span><div>${S.T[t]?formDots(S.T[t].log):'<span class="mut">–</span>'} ${rest(t)}</div></div>`).join('')}</div>`;
  const ser=S.fin.filter(x=>(x.home.tri===ha&&x.away.tri===aw)||(x.home.tri===aw&&x.away.tri===ha));
  if(ser.length){ let wa=0,wh=0; for(const x of ser){ const aWin=(x.home.tri===aw)===(+x.home.score>+x.away.score); aWin?wa++:wh++; } const l=ser[ser.length-1]; out+=preH2H(aw,ha,wa,wh,0,ca,cb,`Dernier : ${esc(l.away.tri)} ${l.away.score} - ${l.home.score} ${esc(l.home.tri)} (${esc(fmtD(l.time))})`); }
  const top=t=>Object.values(S.P).filter(p=>p.tri===t&&p.gp>0).sort((a,b)=>b.pts/b.gp-a.pts/a.gp)[0];
  const pc=p=>p?`<div class="pre-p"><span class="pre-av">${avatar(p.id,p.name,p.tri,40)}</span><b>${playerLink(p.id,p.name)}</b><div class="big">${f1(p.pts/p.gp)}</div><span class="mut">pts / match · ${esc(p.tri)}</span></div>`:'<div></div>';
  const pa=top(aw), pb=top(ha); if(pa||pb) out+=`<div class="card pre"><h3>⭐ Joueurs à suivre</h3><div class="pre-pl">${pc(pa)}${pc(pb)}</div></div>`;
  if(ta&&th) out+=`<div class="card pre"><h3>📊 Moyennes par match</h3>${preBars([['Points marqués',ta.pf/ta.g,th.pf/th.g],['Points encaissés',ta.pa/ta.g,th.pa/th.g]],ca,cb)}</div>`;
  const hero=`<div class="hero" style="--tc:${tcolor(aw)};cursor:default"><div class="hero-eb">${esc(fmtDT(g.time))}</div><div class="hero-row"><div class="hero-t"><span class="hero-lg">${teamLogo(aw,44)}</span><b>${esc(NICK[aw]||tname(aw))}</b><small>${esc(bl(aw))}</small></div><div class="hero-s" style="font-size:22px">${esc((fmtDT(g.time).match(/\d{1,2}[:h]\d{2}/)||['–'])[0])}</div><div class="hero-t"><span class="hero-lg">${teamLogo(ha,44)}</span><b>${esc(NICK[ha]||tname(ha))}</b><small>${esc(bl(ha))}</small></div></div><div class="hero-ft" style="justify-content:center"><span>${esc(preCd(g.time))}</span></div></div>`;
  return hero+out+`<div class="pre-note">ℹ️ Blessés et compositions : pas fournis par ESPN pour l'instant, donc non affichés.</div>`;
}
function boxScore(g){
  if(g.status!==3&&!(g.home.players||[]).some(p=>p.min>0)) return `<div class="card print-target"><div class="row between" style="margin-bottom:10px"><h2 style="margin:0">Avant le match — ${esc(g.away.tri)} @ ${esc(g.home.tri)}</h2><button class="sec" data-act="closegame">Fermer</button></div>${nbaPre(g)}${noteBox('game:'+g.id,g.away.tri+' @ '+g.home.tri,'Note sur ce match…')}</div>`;
  const other=t=>t===g.home?g.away:g.home;
  const tbl=t=>{
    const ps=t.players.filter(p=>p.min>0).sort((a,b)=>b.pts-a.pts||b.min-a.min), s=t.st||{}, top=ps.length?ps[0].pts:0, won=+t.score>+other(t).score;
    const pm=v=>`<span class="${v>0?'pmp':v<0?'pmn':'mut'}">${v>0?'+':''}${v}</span>`;
    return `<div class="bx"><div class="bx-head" style="--tc:${tcolor(t.tri)}">${teamLogo(t.tri,34)}<div class="bx-name">${esc(t.name)}<span class="mut">${won?'Victoire':'Défaite'}</span></div><div class="bx-score ${won?'':'lose'}">${t.score}</div></div><div class="scroll"><table class="bxt"><thead><tr><th class="l">Joueur</th><th class="pt">PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG</th><th>3P</th><th>LF</th><th>MIN</th><th>+/-</th></tr></thead><tbody>
    ${ps.map(p=>`<tr><td class="l bxp">${star('player',p.id,p.name)}${avatar(p.id,p.name,p.tri,24)}${playerLink(p.id,p.name)} <span class="mut">${esc(p.pos)}</span>${ddBadge(p)}</td><td class="pt"><b class="${p.pts===top&&top>0?'best':''}">${p.pts}</b></td><td>${p.reb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td><td>${p.to}</td><td>${p.fgm}/${p.fga}<i class="pcb" style="--w:${p.fga?Math.round(p.fgm/p.fga*100):0}%"></i></td><td>${p.tpm}/${p.tpa}</td><td>${p.ftm}/${p.fta}</td><td class="mut">${Math.round(p.min)}</td><td>${pm(p.pm)}</td></tr>`).join('')}
    <tr class="bx-tot"><td class="l">Total équipe</td><td class="pt"><b>${t.score}</b></td><td>${s.reb??''}</td><td>${s.ast??''}</td><td>${s.stl??''}</td><td>${s.blk??''}</td><td>${s.to??''}</td><td>${s.fgm??''}/${s.fga??''}</td><td>${s.tpm??''}/${s.tpa??''}</td><td>${s.ftm??''}/${s.fta??''}</td><td></td><td></td></tr></tbody></table></div></div>`;
  };
  return `<div class="card print-target"><div class="row between"><h2 style="margin:0">Box score — ${esc(g.away.tri)} @ ${esc(g.home.tri)} · ${gameDate(g)}</h2><div class="row"><button class="sec" data-act="print">Imprimer / PDF</button><button class="sec" data-act="closegame">Fermer</button></div></div>${bxHero(g)}${nbaRecapHtml(g)}${bxTops(g)}${tbl(g.away)}${tbl(g.home)}${noteBox('game:'+g.id,g.away.tri+' @ '+g.home.tri,'Note sur ce match…')}</div>`;
}

/* --- Joueurs --- */
const PCOL={
  gp:{l:'MJ',v:r=>r.gp,f:r=>r.gp},
  min:{l:'MIN',v:r=>r.min/r.gp,f:r=>f1(r.min/r.gp)},
  pts:{l:'PTS moy.',v:r=>r.pts/r.gp,f:r=>`<b>${f1(r.pts/r.gp)}</b>`},
  sp:{l:'PTS tot.',v:r=>r.pts,f:r=>r.pts},
  reb:{l:'REB',v:r=>r.reb/r.gp,f:r=>f1(r.reb/r.gp)},
  ast:{l:'AST',v:r=>r.ast/r.gp,f:r=>f1(r.ast/r.gp)},
  stl:{l:'STL',v:r=>r.stl/r.gp,f:r=>f1(r.stl/r.gp)},
  blk:{l:'BLK',v:r=>r.blk/r.gp,f:r=>f1(r.blk/r.gp)},
  to:{l:'TO',v:r=>r.to/r.gp,f:r=>f1(r.to/r.gp)},
  fg:{l:'FG%',v:r=>pcn(r.fgm,r.fga),f:r=>pc(r.fgm,r.fga)},
  tp:{l:'3P%',v:r=>pcn(r.tpm,r.tpa),f:r=>pc(r.tpm,r.tpa)},
  ft:{l:'LF%',v:r=>pcn(r.ftm,r.fta),f:r=>pc(r.ftm,r.fta)},
  pm:{l:'+/-',v:r=>r.pm/r.gp,f:r=>f1(r.pm/r.gp)},
  tr:{l:'Tendance',v:r=>{ const t=trend(r); return t?t.d:-999; },f:r=>trendHtml(trend(r))},
  tmin:{l:'MIN',v:r=>r.min,f:r=>Math.round(r.min)},
  tpts:{l:'PTS',v:r=>r.pts,f:r=>`<b>${r.pts}</b>`},
  treb:{l:'REB',v:r=>r.reb,f:r=>r.reb},tast:{l:'AST',v:r=>r.ast,f:r=>r.ast},tstl:{l:'STL',v:r=>r.stl,f:r=>r.stl},tblk:{l:'BLK',v:r=>r.blk,f:r=>r.blk},tto:{l:'TO',v:r=>r.to,f:r=>r.to},
  tfg:{l:'FG',v:r=>r.fgm,f:r=>`${r.fgm}/${r.fga}`},ttp:{l:'3P',v:r=>r.tpm,f:r=>`${r.tpm}/${r.tpa}`},tft:{l:'LF',v:r=>r.ftm,f:r=>`${r.ftm}/${r.fta}`},
  ts:{l:'TS%',v:r=>r.fga+r.fta>0?100*ts(r):-1,f:r=>r.fga+r.fta>0?(100*ts(r)).toFixed(1)+'%':'–'},
  efg:{l:'eFG%',v:r=>r.fga>0?100*efg(r):-1,f:r=>r.fga>0?(100*efg(r)).toFixed(1)+'%':'–'},
  p36:{l:'PTS/36',v:r=>r.min>0?r.pts/r.min*36:0,f:r=>f1(r.min>0?r.pts/r.min*36:NaN)},
  r36:{l:'REB/36',v:r=>r.min>0?r.reb/r.min*36:0,f:r=>f1(r.min>0?r.reb/r.min*36:NaN)},
  a36:{l:'AST/36',v:r=>r.min>0?r.ast/r.min*36:0,f:r=>f1(r.min>0?r.ast/r.min*36:NaN)},
  ato:{l:'AST/TO',v:r=>r.to>0?r.ast/r.to:r.ast,f:r=>f1(r.to>0?r.ast/r.to:r.ast)},
  gmsc:{l:'Game Score',v:r=>r.gsum/r.gp,f:r=>f1(r.gsum/r.gp)},
  dd:{l:'DD',v:r=>r.dd,f:r=>r.dd},td:{l:'TD',v:r=>r.td,f:r=>r.td}
};
const PMODES={avg:['gp','min','pts','sp','reb','ast','stl','blk','to','fg','tp','ft','pm','tr'],tot:['gp','tmin','tpts','treb','tast','tstl','tblk','tto','tfg','ttp','tft'],adv:['gp','min','gmsc','ts','efg','p36','r36','a36','ato','dd','td','pm']};
function playerRows(S){
  let rows=Object.values(S.P);
  if(ui.pTeam) rows=rows.filter(r=>r.tri===ui.pTeam);
  if(ui.pFav) rows=rows.filter(r=>fav.players[r.id]);
  if(ui.pSearch) rows=rows.filter(r=>r.name.toLowerCase().includes(ui.pSearch.toLowerCase()));
  const k=ui.pSort.k, d=ui.pSort.d;
  rows.sort((a,b)=>{ if(k==='name'||k==='tri') return String(a[k]).localeCompare(String(b[k]))*d; const c=PCOL[k]||PCOL.pts; const x=c.v(a),y=c.v(b); return (x>y?1:x<y?-1:0)*d; });
  return rows;
}
const PKEY={avg:['pts','reb','ast'],tot:['tpts','treb','tast'],adv:['gmsc','ts','efg']};
function playersTable(rows,cols,withTeam=true,rk=null){
  const ess=new Set([...(PKEY[ui.pMode]||[]),ui.pSort.k]), isP=cols===PMODES[ui.pMode], pc=k=>isP&&!ess.has(k)?' pc':'';
  const th=cols.map(k=>`<th class="s${pc(k)}" data-act="sort" data-k="${k}">${PCOL[k].l}${ui.pSort.k===k?(ui.pSort.d>0?' ▲':' ▼'):''}</th>`).join('');
  return `<div class="scroll"><table class="${ui.pAll?'pall':''}"><thead><tr>${rk?'<th>#</th>':''}<th class="l s pn" data-act="sort" data-k="name">Joueur${ui.pSort.k==='name'?(ui.pSort.d>0?' ▲':' ▼'):''}</th>${withTeam?`<th class="s hide-m" data-act="sort" data-k="tri">Éq.</th>`:''}${th}</tr></thead><tbody>${rows.map(r=>`<tr>${rk?`<td class="rk">${rk.now.get(r.id)||''}${moveHtml(rk.prev,r.id,rk.now.get(r.id))}</td>`:''}<td class="l pn">${star('player',r.id,r.name)}${avatar(r.id,r.name,r.tri,26)}${playerLink(r.id,r.name)}${withTeam?` <span class="mut tm-m">${esc(r.tri)}</span>`:''}${noteMark('player:'+r.id)}</td>${withTeam?`<td class="hide-m">${esc(r.tri)}</td>`:''}${cols.map(k=>`<td class="${pc(k).trim()}">${PCOL[k].f(r)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length+3}" class="empty">Aucun joueur (il faut au moins un match terminé).</td></tr>`}</tbody></table></div>`;
}
function playerRk(S){
  const k=ui.pSort.k; if(k==='name'||k==='tri') return null;
  return {now:rankMap(playerRanking(S.P,k,ui.pSort.d,1)),prev:S.prev?rankMap(playerRanking(S.prev.P,k,ui.pSort.d,1)):null};
}
function viewPlayers(S){
  const rows=playerRows(S), teams=[...new Set(Object.values(S.P).map(r=>r.tri))].sort();
  const maxGp=Math.max(1,...Object.values(S.P).map(r=>r.gp));
  let h=`<div class="card"><div class="row" style="margin-bottom:10px">
    <input type="text" id="pSearch" placeholder="Rechercher un joueur…" value="${esc(ui.pSearch)}" style="min-width:160px;flex:0 1 220px">
    <select id="pTeam"><option value="">Toutes les équipes</option>${teams.map(t=>`<option value="${t}" ${t===ui.pTeam?'selected':''}>${t}</option>`).join('')}</select>
    <select id="pMode"><option value="avg" ${ui.pMode==='avg'?'selected':''}>Moyennes</option><option value="tot" ${ui.pMode==='tot'?'selected':''}>Totaux</option><option value="adv" ${ui.pMode==='adv'?'selected':''}>Avancées</option></select>
    
    <label class="mut"><input type="checkbox" id="pFav" ${ui.pFav?'checked':''}> Favoris</label>
    <button class="sec" data-act="csv">CSV</button><button class="sec pallbtn" data-act="pall">${ui.pAll?'Moins de stats':'Toutes les stats'}</button></div>
    ${playersTable(rows,PMODES[ui.pMode],true,playerRk(S))}
    <p class="mut" style="margin:8px 0 0">Matchs terminés uniquement. ${ui.pMode==='adv'?'TS% = efficacité réelle au tir ; eFG% = tir ajusté aux 3 pts ; /36 = par 36 minutes ; DD/TD = double-doubles / triple-doubles ; Game Score = indice de performance de Hollinger moyen par match.':''} Clique sur un nom pour le détail. Le rang # suit la colonne triée, sur l'ensemble des joueurs.</p>${moveNote(S)}</div>`;
  return h;
}
function playerDetail(S,p){
  const c=tcolor(p.tri), labels=p.log.map(x=>fmtD(x.time)), H=rankHistory(), cs=consistency(p);
  const [c1,c2,c3]=pickColors([c,'#ff8a4f','#3ecf8e']);
  const rows=[...p.log].reverse().map(x=>`<tr><td class="l">${fmtD(x.time)}</td><td class="l">${x.home?'vs':'@'} ${esc(x.opp)}</td><td><span class="dot ${x.win?'w':'l'}">${x.win?'V':'D'}</span></td><td>${Math.round(x.min)}</td><td><b>${x.pts}</b></td><td>${x.reb}</td><td>${x.ast}</td><td>${x.pm>0?'+':''}${x.pm}</td><td>${f1(x.gs)}</td></tr>`).join('');
  const sp=[['Domicile',p.log.filter(x=>x.home)],['Extérieur',p.log.filter(x=>!x.home)],['Victoires',p.log.filter(x=>x.win)],['Défaites',p.log.filter(x=>!x.win)],['Titulaire',p.log.filter(x=>x.starter)],['Remplaçant',p.log.filter(x=>!x.starter)]];
  return `<div class="card print-target" style="border-left:4px solid ${c}">
  <div class="phead" style="background:linear-gradient(135deg,${c}33,transparent 65%)">${avatar(p.id,p.name,p.tri,112)}<div class="pinfo"><div class="pname">${star('player',p.id,p.name)}${esc(p.name)}</div><div class="psub">${teamLogo(p.tri,22)}${esc(tname(p.tri))}${p.pos?' · '+esc(p.pos):''} · ${p.gp} match(s)</div></div><div class="row"><button class="sec" data-act="print">Imprimer / PDF</button><button class="sec" data-act="closeplayer">Fermer</button></div></div>
  <div class="grid"><div class="kpi"><span class="mut">PTS (moy.)</span><b>${f1(p.pts/p.gp)}</b></div><div class="kpi"><span class="mut">PTS (total)</span><b>${p.pts}</b></div><div class="kpi"><span class="mut">REB</span><b>${f1(p.reb/p.gp)}</b></div><div class="kpi"><span class="mut">AST</span><b>${f1(p.ast/p.gp)}</b></div><div class="kpi"><span class="mut">TS%</span><b>${PCOL.ts.f(p)}</b></div><div class="kpi"><span class="mut">Game Score</span><b>${f1(p.gsum/p.gp)}</b></div><div class="kpi"><span class="mut">DD / TD</span><b>${p.dd} / ${p.td}</b></div><div class="kpi"><span class="mut">Tendance (pts)</span><b>${trendHtml(trend(p))}</b></div></div>
  ${lineChart([{name:'PTS',values:p.log.map(x=>x.pts),color:c1},{name:'REB',values:p.log.map(x=>x.reb),color:c2},{name:'AST',values:p.log.map(x=>x.ast),color:c3}],labels)}
  <div class="grid2"><div><h3>Profil (par rapport aux autres joueurs)</h3>${radarChart(RADL,[{name:p.name,color:c,vals:radarVals(S,p)}],'joueurs')}</div><div><h3>Classement parmi les joueurs</h3>${pctTable(S,p)}</div></div>
  <h3>Régularité</h3><div class="grid"><div class="kpi"><span class="mut">Écart-type (pts)</span><b>${f1(cs.sd)}</b><span class="mut">plus c'est bas, plus il est régulier</span></div><div class="kpi"><span class="mut">Meilleur match</span><b>${cs.best.pts} pts</b><span class="mut">${cs.best.home?'vs':'@'} ${esc(cs.best.opp)} · ${fmtD(cs.best.time)}</span></div><div class="kpi"><span class="mut">Pire match</span><b>${cs.worst.pts} pts</b><span class="mut">${cs.worst.home?'vs':'@'} ${esc(cs.worst.opp)} · ${fmtD(cs.worst.time)}</span></div><div class="kpi"><span class="mut">Matchs à 20+ pts</span><b>${cs.n20} / ${p.gp}</b><span class="mut">${Math.round(100*cs.n20/p.gp)} %</span></div><div class="kpi"><span class="mut">Série à 20+ pts</span><b>${cs.cur}</b><span class="mut">record : ${cs.max}</span></div></div>
  ${H?`<h3>Évolution de son rang (points par match)</h3>${rankChart([{name:p.name,color:c,values:H.players.map(m=>m.get(p.id)??null)}],H.days.map(d=>fmtD(d)),Math.max(...H.players.map(m=>m.size)))}`:''}
  <h3>Selon la situation</h3><div class="scroll"><table><thead><tr><th class="l">Situation</th><th>MJ</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>FG%</th><th>+/-</th></tr></thead><tbody>${sp.map(([l,a])=>splitRow(l,a)).join('')}</tbody></table></div>
  <h3>Match par match</h3><div class="scroll"><table><thead><tr><th>Date</th><th class="l">Match</th><th></th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>+/-</th><th>GmSc</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="mut" style="margin:6px 0 0">GmSc = Game Score (Hollinger) : points + 0,4×tirs réussis − 0,7×tirs tentés − 0,4×lancers manqués + rebonds pondérés + interceptions + 0,7×passes + 0,7×contres − 0,4×fautes − balles perdues. Pour les matchs ajoutés avant la mise à jour, les rebonds sont estimés.</p>
  ${noteBox('player:'+p.id,p.name,'Ex. : à surveiller, blessé…')}</div>`;
}

/* --- Équipes --- */
function teamRow(t){ return {pf:t.pf/t.g,pa:t.pa/t.g}; }
function viewTeams(S){
  const rows=Object.values(S.T).sort((a,b)=>b.w-a.w||(b.pf-b.pa)-(a.pf-a.pa));
  let h=`<div class="card scroll"><table><thead><tr><th class="l">Équipe</th><th>MJ</th><th>V</th><th>D</th><th>%V</th><th>Pts moy.</th><th>Enc. moy.</th><th>Pts tot.</th><th>Enc. tot.</th><th>Diff.</th><th>FG%</th><th>3P%</th><th class="hide-m">REB</th><th class="hide-m">AST</th><th>Forme</th></tr></thead><tbody>
  ${rows.map(t=>`<tr><td class="l">${star('team',t.tri)}${teamLink(t.tri,t.name)}</td><td>${t.g}</td><td>${t.w}</td><td>${t.l}</td><td>${pc(t.w,t.g)}</td><td>${f1(t.pf/t.g)}</td><td>${f1(t.pa/t.g)}</td><td><b>${t.pf}</b></td><td>${t.pa}</td><td class="${t.pf>=t.pa?'ok':'err'}">${f1((t.pf-t.pa)/t.g)}</td><td>${pc(t.fgm,t.fga)}</td><td>${pc(t.tpm,t.tpa)}</td><td class="hide-m">${f1(t.reb/t.g)}</td><td class="hide-m">${f1(t.ast/t.g)}</td><td>${formDots(t.log)}</td></tr>`).join('')||'<tr><td colspan="15" class="empty">Aucun match terminé.</td></tr>'}</tbody></table></div>`;
  h+=advCard(S)+quartersCard(S);
  return h;
}
function teamDetail(S,t){
  const c=tcolor(t.tri), [cf,ca]=pickColors([c,'#9aa7c2']), tq=teamQuarters(t), H=rankHistory(), ad=advRow(t);
  const roster=Object.values(S.P).filter(p=>p.tri===t.tri).sort((a,b)=>b.pts/b.gp-a.pts/a.gp);
  const rows=[...t.log].reverse().map(x=>`<tr><td class="l">${fmtD(x.time)}</td><td class="l">${x.home?'vs':'@'} ${esc(tname(x.opp))}</td><td><span class="dot ${x.win?'w':'l'}">${x.win?'V':'D'}</span></td><td>${x.pf}-${x.pa}</td></tr>`).join('');
  return `<div class="card print-target" style="border-left:4px solid ${c}"><div class="phead" style="background:linear-gradient(135deg,${c}33,transparent 65%)">${teamLogo(t.tri,84)}<div class="pinfo"><div class="pname">${star('team',t.tri)}${esc(t.name)}</div><div class="psub">${t.w}-${t.l} · ${t.pf} pts marqués, ${t.pa} encaissés · série ${streak(t.log)}</div></div><div class="row"><button class="sec" data-act="print">Imprimer / PDF</button><button class="sec" data-act="closeteam">Fermer</button></div></div>
  ${ad?`<div class="grid"><div class="kpi"><span class="mut">Rythme</span><b>${f1(ad.pace)}</b></div><div class="kpi"><span class="mut">Attaque (/100 poss.)</span><b>${f1(ad.off)}</b></div><div class="kpi"><span class="mut">Défense (/100 poss.)</span><b>${f1(ad.def)}</b></div><div class="kpi"><span class="mut">Net</span><b class="${ad.off>=ad.def?'ok':'err'}">${(ad.off-ad.def>0?'+':'')+f1(ad.off-ad.def)}</b></div></div>`:''}
  ${teamExtraNba(S,t)}
  <h3>Points marqués et encaissés par match</h3>${barsChart(t.log.map(x=>fmtD(x.time)),t.log.map(x=>x.pf),t.log.map(x=>x.pa),'Marqués','Encaissés',cf,ca)}
  <div class="grid2"><div><h3>Profil (par rapport aux autres équipes)</h3>${radarChart(RADTL,[{name:t.name,color:c,vals:radarValsT(S,t)}],'équipes')}</div><div>${tq?`<h3>Par quart-temps (moyenne par match)</h3><div class="scroll"><table><thead><tr><th class="l"></th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th></tr></thead><tbody><tr><td class="l">Marqués</td>${tq.map(x=>`<td>${f1(x.f)}</td>`).join('')}</tr><tr><td class="l">Encaissés</td>${tq.map(x=>`<td>${f1(x.a)}</td>`).join('')}</tr><tr><td class="l">Écart</td>${tq.map(x=>`<td class="${x.f>=x.a?'ok':'err'}">${(x.f-x.a>0?'+':'')+f1(x.f-x.a)}</td>`).join('')}</tr><tr><td class="l">Quarts gagnés</td>${tq.map(x=>`<td>${x.w}/${x.n}</td>`).join('')}</tr></tbody></table></div>`:'<h3>Par quart-temps</h3><p class="mut">Pas de score par quart-temps dans les matchs de cette équipe (ré-ajoute-les pour l\'obtenir).</p>'}</div></div>
  ${H?`<h3>Évolution au classement</h3>${rankChart([{name:t.name,color:c,values:H.teams.map(m=>m.get(t.tri)??null)}],H.days.map(d=>fmtD(d)),Math.max(...H.teams.map(m=>m.size)))}`:''}
  <h3>Domicile et extérieur</h3><div class="scroll"><table><thead><tr><th class="l">Situation</th><th>MJ</th><th>V-D</th><th>Pts</th><th>Enc.</th><th>Diff.</th></tr></thead><tbody>${teamSplitRow('Domicile',t.log.filter(x=>x.home))}${teamSplitRow('Extérieur',t.log.filter(x=>!x.home))}</tbody></table></div>
  <div class="grid2"><div><h3>Résultats</h3><div class="scroll"><table><tbody>${rows}</tbody></table></div></div><div><h3>Effectif</h3>${playersTable(roster,['gp','min','pts','reb','ast','fg'],false)}</div></div>
  ${noteBox('team:'+t.tri,t.name,'Ex. : équipe à suivre…')}</div>`;
}

/* --- Classement --- */
const zoneOf=r=>r<=6?'z1':r<=8?'z2':r<=10?'z3':'';
function standTable(S,conf,compact){
  const sel=a=>conf?a.filter(t=>TEAMS[t.tri]&&TEAMS[t.tri][1]===conf):a;
  const rows=sel(Object.values(S.T)).sort(standCmp);
  const pv=S.prev?rankMap(sel(Object.values(S.prev.T)).sort(standCmp).map(t=>t.tri)):null;
  const zone=conf?(i=>zoneOf(i+1)):(()=>'');
  const head=compact?'<th>#</th><th class="l">Équipe</th><th>V</th><th>D</th><th>%V</th><th>Diff.</th><th>Série</th>':'<th>#</th><th class="l">Équipe</th><th>MJ</th><th>V</th><th>D</th><th>%V</th><th>Pts tot.</th><th>Enc. tot.</th><th>Diff. moy.</th><th>Série</th><th>5 derniers</th>';
  const body=rows.map((t,i)=>{ const d=(t.pf-t.pa)/t.g, dc=`<td class="${t.pf>=t.pa?'ok':'err'}">${f1(d)}</td>`;
    return compact?`<tr class="${zone(i)}"><td>${i+1}${moveHtml(pv,t.tri,i+1)}</td><td class="l">${star('team',t.tri)}${teamLink(t.tri,t.name)}</td><td>${t.w}</td><td>${t.l}</td><td>${pc(t.w,t.g)}</td>${dc}<td>${streak(t.log)}</td></tr>`
      :`<tr class="${zone(i)}"><td>${i+1}${moveHtml(pv,t.tri,i+1)}</td><td class="l">${star('team',t.tri)}${teamLink(t.tri,t.name)}</td><td>${t.g}</td><td>${t.w}</td><td>${t.l}</td><td>${pc(t.w,t.g)}</td><td>${t.pf}</td><td>${t.pa}</td>${dc}<td>${streak(t.log)}</td><td>${formDots(t.log)}</td></tr>`; }).join('')||`<tr><td colspan="${compact?7:11}" class="empty">Aucun match terminé.</td></tr>`;
  return `<div class="scroll"><table class="st"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function viewStandings(S){
  const m=ui.confF==null||ui.confF==='EW'?'EW':ui.confF, legend=m==='EW'||m==='E'||m==='W'?`<div class="legend"><span><i class="z1"></i>1-6 : play-offs directs</span><span><i class="z2"></i>7-8 : play-in (2 chances)</span><span><i class="z3"></i>9-10 : play-in (élimination)</span><span><i></i>11-15 : hors course</span></div>`:'';
  const body=m==='EW'?`<div class="stgrid"><div><h3>Conférence Est</h3>${standTable(S,'E',true)}</div><div><h3>Conférence Ouest</h3>${standTable(S,'W',true)}</div></div>`:standTable(S,m==='E'||m==='W'?m:'',false);
  return `<div class="card"><div class="row" style="margin-bottom:10px"><select id="confF"><option value="EW" ${m==='EW'?'selected':''}>Est et Ouest côte à côte</option><option value="" ${m===''?'selected':''}>Toute la ligue</option><option value="E" ${m==='E'?'selected':''}>Conférence Est seule</option><option value="W" ${m==='W'?'selected':''}>Conférence Ouest seule</option></select><span class="mut">Calculé uniquement à partir des matchs que tu as ajoutés.</span></div>${legend}${body}${moveNote(S)}</div>`+rankEvolution(S);
}

/* --- Records --- */
function viewRecords(S){
  const P=Object.values(S.P);
  if(!S.fin.length) return '<div class="card empty">Aucun match terminé pour l\'instant.</div>';
  const maxGp=Math.max(1,...P.map(r=>r.gp));
  const leaders=[['Points','pts',r=>r.pts/r.gp],['Rebonds','reb',r=>r.reb/r.gp],['Passes','ast',r=>r.ast/r.gp],['Interceptions','stl',r=>r.stl/r.gp],['Contres','blk',r=>r.blk/r.gp],['3 pts réussis','tpm',r=>r.tpm/r.gp],['TS% (≥ 5 tirs/match)','ts',r=>(r.fga+r.fta)/r.gp>=5?100*ts(r):-1]];
  const rankIds=Pobj=>fn=>Object.values(Pobj).filter(r=>r.gp>=ui.recMin).map(r=>[r,fn(r)]).filter(x=>x[1]>=0).sort((a,b)=>b[1]-a[1]).map(x=>x[0].id);
  const lead=leaders.map(([t,k,fn])=>{ const ids=rankIds(S.P)(fn), byId=Object.fromEntries(P.map(r=>[r.id,r])), pvm=S.prev?rankMap(rankIds(S.prev.P)(fn)):null;
    const top=ids.slice(0,5).map(id=>[byId[id],fn(byId[id])]), tot=['pts','reb','ast','stl','blk','tpm'].includes(k);
    return `<div><h3>${t}</h3><table><tbody>${top.map(([r,v],i)=>`<tr><td class="l">${i+1}.${moveHtml(pvm,r.id,i+1)} ${avatar(r.id,r.name,r.tri,22)}${playerLink(r.id,r.name)} <span class="mut">${r.tri}</span></td><td><b>${f1(v)}</b>${tot?` <span class="mut">(${r[k]} au total)</span>`:''}</td></tr>`).join('')||'<tr><td class="mut">–</td></tr>'}</tbody></table></div>`; }).join('');
  const lines=P.flatMap(p=>p.log.map(x=>({...x,name:p.name,id:p.id,tri:p.tri})));
  const hi=[['Points','pts'],['Rebonds','reb'],['Passes','ast'],['Interceptions','stl'],['Contres','blk'],['3 pts','tpm'],['Game Score','gs']].map(([t,k])=>{ const top=[...lines].sort((a,b)=>b[k]-a[k]).slice(0,5);
    return `<div><h3>${t}</h3><table><tbody>${top.map(x=>`<tr><td class="l">${playerLink(x.id,x.name)} <span class="mut">${x.home?'vs':'@'} ${esc(x.opp)} · ${fmtD(x.time)}</span></td><td><b>${k==='gs'?f1(x[k]):x[k]}</b></td></tr>`).join('')}</tbody></table></div>`; }).join('');
  const tds=lines.filter(x=>x.cats>=3).sort((a,b)=>tms({time:b.time})-tms({time:a.time}));
  const ddl=[...P].filter(r=>r.dd>0).sort((a,b)=>b.dd-a.dd||b.td-a.td).slice(0,8);
  const marg=S.fin.map(g=>({g,m:Math.abs(g.home.score-g.away.score),tot:+g.home.score+ +g.away.score}));
  const gl=(arr,fmt)=>arr.map(x=>`<tr class="click" data-act="opengame" data-id="${x.g.id}"><td class="l">${fmtD(x.g.time)} · ${esc(x.g.away.tri)} ${x.g.away.score} - ${x.g.home.score} ${esc(x.g.home.tri)}</td><td><b>${fmt(x)}</b></td></tr>`).join('');
  return `<div class="card"><div class="row between"><h2 style="margin:0">Meilleurs de la saison</h2><select id="recMin">${Array.from({length:maxGp},(_,i)=>`<option value="${i+1}" ${ui.recMin===i+1?'selected':''}>≥ ${i+1} match(s)</option>`).join('')}</select></div><div class="grid2">${lead}</div>${moveNote(S)}</div>
  <div class="card"><h2>Records personnels</h2><p class="mut" style="margin:0 0 8px">Le meilleur match de chaque joueur de ta base. 🆕 = record battu ces 8 derniers jours (après au moins 3 matchs).</p><div class="scroll"><table><thead><tr><th class="l">Joueur</th><th class="l">Meilleur match (Game Score)</th><th>PTS</th><th>REB</th><th>AST</th><th>3P</th><th>STL</th><th>BLK</th></tr></thead><tbody>${(()=>{ const nw=new Set(recordsBroken(S,Date.now()-8*86400e3).flatMap(r=>r.items.map(i=>r.p.id+'|'+i.k)));
    return P.filter(r=>r.gp>=ui.recMin).map(r=>({r,b:playerBests(r)})).sort((a,c)=>c.b.gs.gs-a.b.gs.gs).slice(0,60).map(({r,b})=>{ const g=b.gs, cell=k=>`<td>${b[k][k]}${nw.has(r.id+'|'+k)?' 🆕':''}</td>`;
      return `<tr><td class="l">${avatar(r.id,r.name,r.tri,22)}${playerLink(r.id,r.name)} <span class="mut">${esc(r.tri)}</span></td><td class="l"><span class="link" data-act="opengame" data-id="${esc(g.gid)}">${g.pts} pts, ${g.reb} reb, ${g.ast} pas</span> <span class="mut">${g.home?'vs':'@'} ${esc(g.opp)} · ${fmtD(g.time)} · GmSc ${f1(g.gs)}</span></td>${cell('pts')}${cell('reb')}${cell('ast')}${cell('tpm')}${cell('stl')}${cell('blk')}</tr>`; }).join('')||'<tr><td class="empty" colspan="8">–</td></tr>'; })()}</tbody></table></div></div>
  <div class="card"><h2>Records sur un match</h2><div class="grid2">${hi}</div></div>
  <div class="card"><h2>Triple-doubles et double-doubles</h2><div class="grid2"><div><h3>Triple-doubles (${tds.length})</h3><table><tbody>${tds.map(x=>`<tr><td class="l">${playerLink(x.id,x.name)} <span class="mut">${x.home?'vs':'@'} ${esc(x.opp)} · ${fmtD(x.time)}</span></td><td>${x.pts}/${x.reb}/${x.ast}</td></tr>`).join('')||'<tr><td class="mut">Aucun</td></tr>'}</tbody></table></div><div><h3>Double-doubles</h3><table><tbody>${ddl.map(r=>`<tr><td class="l">${playerLink(r.id,r.name)} <span class="mut">${r.tri}</span></td><td><b>${r.dd}</b></td></tr>`).join('')||'<tr><td class="mut">Aucun</td></tr>'}</tbody></table></div></div></div>
  <div class="card"><h2>Matchs marquants</h2><div class="grid2"><div><h3>Plus gros écarts</h3><table><tbody>${gl([...marg].sort((a,b)=>b.m-a.m).slice(0,5),x=>'+'+x.m)}</tbody></table></div><div><h3>Matchs les plus serrés</h3><table><tbody>${gl([...marg].sort((a,b)=>a.m-b.m).slice(0,5),x=>x.m)}</tbody></table></div><div><h3>Plus de points au total</h3><table><tbody>${gl([...marg].sort((a,b)=>b.tot-a.tot).slice(0,5),x=>x.tot)}</tbody></table></div></div></div>`+trendCard(S);
}

/* --- Comparer --- */
const CMP_P=[{l:'PTS',v:r=>r.pts/r.gp,f:f1},{l:'REB',v:r=>r.reb/r.gp,f:f1},{l:'AST',v:r=>r.ast/r.gp,f:f1},{l:'STL',v:r=>r.stl/r.gp,f:f1},{l:'BLK',v:r=>r.blk/r.gp,f:f1},{l:'TO',v:r=>r.to/r.gp,f:f1,low:true},{l:'FG%',v:r=>Math.max(0,pcn(r.fgm,r.fga)),f:x=>x.toFixed(1)},{l:'3P%',v:r=>Math.max(0,pcn(r.tpm,r.tpa)),f:x=>x.toFixed(1)},{l:'LF%',v:r=>Math.max(0,pcn(r.ftm,r.fta)),f:x=>x.toFixed(1)},{l:'TS%',v:r=>Math.max(0,PCOL.ts.v(r)),f:x=>x.toFixed(1)},{l:'MIN',v:r=>r.min/r.gp,f:f1}];
const CMP_T=[{l:'Pts',v:t=>t.pf/t.g,f:f1},{l:'Enc.',v:t=>t.pa/t.g,f:f1,low:true},{l:'Diff.',v:t=>(t.pf-t.pa)/t.g,f:f1},{l:'%V',v:t=>100*t.w/t.g,f:x=>x.toFixed(0)},{l:'REB',v:t=>t.reb/t.g,f:f1},{l:'AST',v:t=>t.ast/t.g,f:f1},{l:'STL',v:t=>t.stl/t.g,f:f1},{l:'BLK',v:t=>t.blk/t.g,f:f1},{l:'TO',v:t=>t.to/t.g,f:f1,low:true},{l:'FG%',v:t=>Math.max(0,pcn(t.fgm,t.fga)),f:x=>x.toFixed(1)},{l:'3P%',v:t=>Math.max(0,pcn(t.tpm,t.tpa)),f:x=>x.toFixed(1)}];
function viewCompare(S){
  const pl=ui.cmpMode==='players', src=pl?S.P:S.T;
  const opts=Object.values(src).sort((a,b)=>pl?b.pts/b.gp-a.pts/a.gp:b.w-a.w);
  const key=o=>pl?o.id:o.tri, label=o=>pl?`${o.name} (${o.tri})`:o.name;
  if(!src[ui.cmpA]) ui.cmpA=opts[0]?key(opts[0]):''; if(!src[ui.cmpB]||ui.cmpB===ui.cmpA) ui.cmpB=(opts.find(o=>key(o)!==ui.cmpA)||{})[pl?'id':'tri']||'';
  const selHtml=(id,cur)=>`<select id="${id}">${opts.map(o=>`<option value="${esc(key(o))}" ${key(o)===cur?'selected':''}>${esc(label(o))}</option>`).join('')}</select>`;
  let h=`<div class="card"><div class="row" style="margin-bottom:12px"><select id="cmpMode"><option value="players" ${pl?'selected':''}>Joueurs</option><option value="teams" ${!pl?'selected':''}>Équipes</option></select>${selHtml('cmpA',ui.cmpA)}<span class="mut">contre</span>${selHtml('cmpB',ui.cmpB)}</div>`;
  const a=src[ui.cmpA], b=src[ui.cmpB];
  if(!a||!b) return h+'<div class="empty">Il faut au moins deux '+(pl?'joueurs':'équipes')+' avec des matchs terminés.</div></div>';
  const specs=pl?CMP_P:CMP_T, [colA,colB]=pickColors([tcolor(a.tri),tcolor(b.tri)]);
  const hd=o=>pl?avatar(o.id,o.name,o.tri,44):teamLogo(o.tri,40);
  h+=`<div class="row between"><div class="row">${hd(a)}<b style="color:${colA}">${esc(label(a))}</b></div><div class="row"><b style="color:${colB}">${esc(label(b))}</b>${hd(b)}</div></div>`;
  h+=specs.map(sp=>{ const x=sp.v(a),y=sp.v(b),m=Math.max(Math.abs(x),Math.abs(y))||1, aw=sp.low?x<y:x>y, bw=sp.low?y<x:y>x;
    return `<div class="cmp"><div class="cv ${aw?'win':''}">${sp.f(x)}</div><div class="cb l"><i class="${aw?'w':''}" style="width:${Math.max(0,x)/m*100}%;background:${colA}"></i></div><div class="cl">${sp.l}</div><div class="cb r"><i class="${bw?'w':''}" style="width:${Math.max(0,y)/m*100}%;background:${colB}"></i></div><div class="cv ${bw?'win':''}">${sp.f(y)}</div></div>`; }).join('');
  h+=`<h3>Profil comparé</h3>`+(pl?radarChart(RADL,[{name:label(a),color:colA,vals:radarVals(S,a)},{name:label(b),color:colB,vals:radarVals(S,b)}],'joueurs'):radarChart(RADTL,[{name:label(a),color:colA,vals:radarValsT(S,a)},{name:label(b),color:colB,vals:radarValsT(S,b)}],'équipes'));
  const va=pl?a.log.map(x=>x.pts):a.log.map(x=>x.pf), vb=pl?b.log.map(x=>x.pts):b.log.map(x=>x.pf), n=Math.max(va.length,vb.length);
  h+=`<h3>${pl?'Points':'Points marqués'} par match</h3>`+lineChart([{name:label(a),values:Array.from({length:n},(_,i)=>va[i]??null),color:colA},{name:label(b),values:Array.from({length:n},(_,i)=>vb[i]??null),color:colB}],Array.from({length:n},(_,i)=>'M'+(i+1)));
  return h+(pl?'':cmpExtraNba(S,a,b)+h2h(S,a,b))+'</div>';
}

/* --- Calendrier --- */
/* ---- Qualification, calendrier restant, gros matchs, duel ---- */
const isReg=x=>/^002/.test(x.id);
const early=x=>{ const d=new Date(x.t), m=d.getHours()*60+d.getMinutes(); return m>=360&&m<=1290; };
const stubT=tri=>({tri,name:tname(tri),w:0,l:0,g:0,pf:0,pa:0,log:[]});
function playedBySched(){ const m={}, lim=Date.now()-4*3600e3; sched.filter(x=>isReg(x)&&Date.parse(x.t)<lim).forEach(x=>{ m[x.h]=(m[x.h]||0)+1; m[x.a]=(m[x.a]||0)+1; }); return m; }
function raceData(S,conf){
  const tris=Object.keys(TEAMS).filter(t=>TEAMS[t][1]===conf), ps=playedBySched();
  const rows=tris.map(tri=>{ const t=S.T[tri]||stubT(tri), rem=Math.max(0,82-Math.max(t.g,ps[tri]||0));
    return {tri,t,w:t.w,l:t.l,g:t.g,rem,maxW:t.w+rem,wp:t.g?t.w/t.g:0,diff:t.g?(t.pf-t.pa)/t.g:-99,proj:t.g?t.w/t.g*(t.g+rem):null}; });
  rows.sort((a,b)=>b.wp-a.wp||b.w-a.w||b.diff-a.diff);
  const need=(r,N)=>{ const o=rows.filter(x=>x!==r).map(x=>x.maxW).sort((a,b)=>b-a); return o.length<N?0:o[N-1]+1-r.w; };
  const out=(r,N)=>rows.filter(x=>x!==r&&x.w>r.maxW).length>=N;
  const w6=rows[5]?rows[5].w:0, w10=rows[9]?rows[9].w:0;
  rows.forEach((r,i)=>{ r.rank=i+1; r.g6=r.w-w6; r.g10=r.w-w10; r.n6=need(r,6); r.n10=need(r,10); r.e6=out(r,6); r.e10=out(r,10);
    r.status=r.n6<=0?'✅ Play-offs assurés':r.n10<=0?'🟡 Play-in assuré':r.e10?'❌ Hors course (top 10)':r.e6?'Play-offs directs impossibles':'En course'; });
  return rows;
}
function difficulty(S,conf,rk){
  const sc=teamSchedules(), up=upcoming().filter(isReg), owp=tri=>{ const t=S.T[tri]; return t&&t.g>=3?t.w/t.g:0.5; };
  const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
  const rows=Object.keys(TEAMS).filter(t=>TEAMS[t][1]===conf).map(tri=>{ const l=up.filter(x=>x.h===tri||x.a===tri), opp=x=>x.h===tri?x.a:x.h;
    return {tri,n:l.length,avg:avg(l.map(x=>owp(opp(x)))),avg10:avg(l.slice(0,10).map(x=>owp(opp(x)))),home:l.filter(x=>x.h===tri).length,away:l.filter(x=>x.a===tri).length,b2b:l.filter(x=>restBefore(sc,tri,x.id)===0).length,top:l.filter(x=>rk[opp(x)]&&rk[opp(x)]<=6).length}; });
  const ord=[...rows].filter(r=>r.avg!=null).sort((a,b)=>b.avg-a.avg); ord.forEach((r,i)=>r.hard=i+1);
  return rows;
}
function viewRace(S){
  const confs=ui.raceF==='W'?['W']:ui.raceF==='EW'?['E','W']:['E'], rk={};
  for(const c of ['E','W']) raceData(S,c).forEach(r=>{ if(r.g>=3) rk[r.tri]=r.rank; });
  const sel=`<div class="row" style="margin-bottom:10px"><select id="raceF"><option value="E" ${ui.raceF==='E'?'selected':''}>Conférence Est</option><option value="W" ${ui.raceF==='W'?'selected':''}>Conférence Ouest</option><option value="EW" ${ui.raceF==='EW'?'selected':''}>Les deux</option></select></div>`;
  const playedSched=playedBySched(), cnt={}; sched.filter(isReg).forEach(x=>{ cnt[x.h]=(cnt[x.h]||0)+1; cnt[x.a]=(cnt[x.a]||0)+1; }); const minCnt=sched.length?Math.min(...Object.keys(TEAMS).map(t=>cnt[t]||0)):82;
  let missing=0; if(sched.length) for(const t of Object.keys(TEAMS)){ missing+=Math.max(0,(playedSched[t]||0)-((S.T[t]||{}).g||0)); }
  let h=`<div class="card"><h2>Course aux play-offs</h2>${sel}`;
  h+=`<p class="mut">Matchs restants = 82 − matchs déjà joués.</p>`;
  if(!sched.length) h+=`<div class="card warn">⚠️ Sans le calendrier, seuls les matchs que tu as ajoutés sont comptés comme joués. Va sur nba.com/schedule, clique sur le favori, puis Ctrl+V ici.</div>`;
  else if(minCnt<82) h+=`<div class="card warn">ℹ️ Le calendrier de nba.com ne contient que ${minCnt} matchs par équipe : c'est normal, la NBA ne publie que 80 des 82 matchs. Les 2 derniers (entre le 4 et le 10 décembre) dépendent des résultats de la phase de groupes de la NBA Cup. Recopie le calendrier après le 10 décembre pour les voir. Les « restants » sont calculés comme 82 − matchs joués ; le tableau « Calendrier restant » ne voit que les matchs déjà publiés.</div>`;
  if(sched.length&&missing>0) h+=`<div class="card warn">⚠️ Il manque <b>${missing}</b> match(s) déjà joués dans ta base : les victoires sont sous-estimées et les « restants » surestimés. Rattrape-les avec le favori depuis la page d'accueil de nba.com.</div>`;
  h+=`<div class="legend"><span><i class="z1"></i>Play-offs directs (top 6)</span><span><i class="z2"></i>Play-in (7-10)</span></div>`;
  const nc=(x,rem)=>x<=0?'<span class="ok">Assuré ✅</span>':x>rem?'<span class="mut">pas encore</span>':`<b>${x}</b> V. sur ${rem}`, gp=v=>v>0?'+'+v:String(v);
  for(const c of confs){ const rows=raceData(S,c);
    h+=`<h3>${c==='E'?'Conférence Est':'Conférence Ouest'}</h3><div class="scroll"><table class="st"><thead><tr><th>#</th><th class="l">Équipe</th><th>V-D</th><th>Restants</th><th>Écart 6e</th><th>Écart 10e</th><th>Projection</th><th>Pour assurer le top 6</th><th>Pour assurer le top 10</th><th class="l">Situation</th></tr></thead><tbody>${rows.map(r=>`<tr class="${zoneOf(r.rank)}"><td>${r.rank}</td><td class="l">${star('team',r.tri)}${teamLink(r.tri,r.t.name||tname(r.tri))}</td><td>${r.w}-${r.l}</td><td>${r.rem}</td><td class="${r.g6>=0?'ok':'err'}">${gp(r.g6)}</td><td class="${r.g10>=0?'ok':'err'}">${gp(r.g10)}</td><td>${r.proj==null?'–':f1(r.proj)+' V.'}</td><td>${nc(r.n6,r.rem)}</td><td>${nc(r.n10,r.rem)}</td><td class="l">${r.status}</td></tr>`).join('')}</tbody></table></div>`; }
  h+=`<p class="mut" style="margin:8px 0 0">Écart = victoires d'avance (+) ou de retard (−) sur la 6e et la 10e place actuelles. « Pour assurer » = victoires nécessaires pour être sûr de finir dans le top 6 (ou top 10) <i>même si les rivales gagnent tous leurs matchs restants</i>. Estimation prudente : elle ne tient pas compte des matchs que les rivales jouent entre elles ni des départages officiels. Projection = rythme actuel prolongé sur 82 matchs.</p></div>`;
  h+=`<div class="card"><h2>Calendrier restant</h2>`;
  if(!sched.length) h+=`<p class="mut">Il faut charger le calendrier (nba.com/schedule + favori + Ctrl+V).</p>`;
  else for(const c of confs){ const rows=difficulty(S,c,rk).sort((a,b)=>(a.hard||99)-(b.hard||99)), cl=v=>v==null?'':v>=0.53?'err':v<=0.47?'ok':'', pct=v=>v==null?'–':(v*100).toFixed(1).replace('.',',')+' %';
    h+=`<h3>${c==='E'?'Conférence Est':'Conférence Ouest'} — du programme le plus dur au plus facile</h3><div class="scroll"><table><thead><tr><th>Difficulté</th><th class="l">Équipe</th><th>Restants</th><th>% V. moyen des adversaires</th><th>10 prochains</th><th>Dom.</th><th>Ext.</th><th>2e soir de suite</th><th>Contre top 6</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.hard||'–'}</td><td class="l">${teamLink(r.tri)}</td><td>${r.n}</td><td class="${cl(r.avg)}">${pct(r.avg)}</td><td class="${cl(r.avg10)}">${pct(r.avg10)}</td><td>${r.home}</td><td>${r.away}</td><td>${r.b2b}</td><td>${r.top}</td></tr>`).join('')}</tbody></table></div>`;
    h+=`<p class="mut" style="margin:8px 0 0">Force d'un adversaire = son pourcentage de victoires dans ta base (50 % tant qu'il a moins de 3 matchs). Plus la saison avance, plus c'est fiable. Rouge = adversaires plutôt forts, vert = plutôt faibles.</p>`; }
  return h+'</div>';
}
function bigMatches(S){
  const up=upcoming().filter(isReg); if(!up.length) return null;
  const up2=ui.calEarly?up.filter(early):up; if(!up2.length) return null;
  const d0=nyDay(up2[0].t), list=up2.filter(x=>nyDay(x.t)===d0), rk={};
  for(const c of ['E','W']) raceData(S,c).forEach(r=>{ if(r.g>=3) rk[r.tri]=r.rank; });
  const stars=Object.values(S.P).filter(p=>p.gp>=3).sort((a,b)=>b.pts/b.gp-a.pts/a.gp).slice(0,10);
  const items=list.map(x=>{ let sc=0; const tags=[], both=[x.h,x.a];
    const fT=both.filter(t=>fav.teams.includes(t)); if(fT.length){ sc+=3; tags.push('⭐ '+fT.map(tname).join(' / ')); }
    const fP=Object.keys(fav.players).filter(id=>S.P[id]&&both.includes(S.P[id].tri)); if(fP.length){ sc+=2; tags.push('⭐ '+fP.map(id=>S.P[id].name).slice(0,2).join(', ')); }
    const st=stars.filter(p=>both.includes(p.tri)&&!fP.includes(p.id)); if(st.length){ sc+=1; tags.push('🌟 '+st.map(p=>p.name).slice(0,2).join(', ')); }
    const rh=rk[x.h], ra=rk[x.a];
    if(rh&&ra){ if(rh<=6&&ra<=6){ sc+=3; tags.push('Choc du haut de tableau ('+rh+'e vs '+ra+'e)'); } else if(rh<=10&&ra<=10){ sc+=1; tags.push('Course au play-in'); } }
    return {x,sc,tags}; });
  const top=items.filter(i=>i.sc>0).sort((a,b)=>b.sc-a.sc||Date.parse(a.x.t)-Date.parse(b.x.t)).slice(0,5);
  return {day:d0,first:up2[0].t,total:list.length,items:top};
}
function bigCard(S){
  const b=bigMatches(S); if(!b) return '';
  const lab=new Date(b.day+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  return `<div class="card"><div class="row between"><h2 style="margin:0">🔥 À ne pas manquer — soirée du ${esc(lab)}</h2></div><p class="mut">${b.total} match(s) au programme.</p>${b.items.length?b.items.map(i=>`<div class="alert"><b>${teamLogo(i.x.a,18)}${esc(tname(i.x.a))} @ ${teamLogo(i.x.h,18)}${esc(tname(i.x.h))}</b> <span class="mut">${esc(fmtDT(i.x.t))}</span><br>${i.tags.map(t=>`<span class="chip">${esc(t)}</span>`).join(' ')}</div>`).join(''):'<p class="mut">Pas de gros match repéré (programme calme, ou pas encore assez de matchs dans ta base).</p>'}</div>`;
}

/* ================= Statify+ : Ce soir, légendes, face-à-face, buts par minute ================= */
const PARIS={timeZone:'Europe/Paris'};
const parisT=iso=>new Date(iso).toLocaleTimeString('fr-FR',{...PARIS,hour:'2-digit',minute:'2-digit'});
const parisD=iso=>new Date(iso).toLocaleDateString('fr-FR',{...PARIS,weekday:'long',day:'numeric',month:'long'});
const parisDK=iso=>new Date(iso).toLocaleDateString('en-CA',PARIS);
const wikiLink=(q,label)=>`<a href="https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}&go=Go" target="_blank" rel="noopener">${esc(label||q)}</a>`;

/* --- Légendes des clubs --- */
const LEG_NBA={ATL:['Dominique Wilkins','Bob Pettit','Lou Hudson','Trae Young'],BOS:['Bill Russell','Larry Bird','John Havlicek','Paul Pierce','Bob Cousy'],BKN:['Julius Erving','Jason Kidd','Vince Carter','Kenyon Martin'],CHA:['Kemba Walker','Alonzo Mourning','Larry Johnson','Muggsy Bogues'],CHI:['Michael Jordan','Scottie Pippen','Dennis Rodman','Derrick Rose'],CLE:['LeBron James','Brad Daugherty','Mark Price','Kyrie Irving'],DAL:['Dirk Nowitzki','Jason Terry','Michael Finley','Rolando Blackman'],DEN:['Nikola Jokić','Alex English','Dikembe Mutombo','David Thompson'],DET:['Isiah Thomas','Joe Dumars','Ben Wallace','Chauncey Billups','Bill Laimbeer'],GSW:['Stephen Curry','Wilt Chamberlain','Rick Barry','Chris Mullin','Klay Thompson'],HOU:['Hakeem Olajuwon','Moses Malone','Yao Ming','Clyde Drexler','Rudy Tomjanovich'],IND:['Reggie Miller','Rik Smits','Mel Daniels','George McGinnis'],LAC:['Chris Paul','Blake Griffin','Bob McAdoo','Elton Brand'],LAL:['Magic Johnson','Kareem Abdul-Jabbar','Kobe Bryant',"Shaquille O'Neal",'Jerry West','Elgin Baylor'],MEM:['Marc Gasol','Zach Randolph','Mike Conley','Tony Allen'],MIA:['Dwyane Wade','Alonzo Mourning','Udonis Haslem','Tim Hardaway','Chris Bosh'],MIL:['Kareem Abdul-Jabbar','Oscar Robertson','Giannis Antetokounmpo','Sidney Moncrief','Bob Dandridge'],MIN:['Kevin Garnett','Kevin Love','Karl-Anthony Towns','Sam Cassell'],NOP:['Chris Paul','Anthony Davis','David West','Tyson Chandler'],NYK:['Willis Reed','Walt Frazier','Patrick Ewing','Bernard King','Earl Monroe'],OKC:['Kevin Durant','Russell Westbrook','Gary Payton','Shawn Kemp'],ORL:["Shaquille O'Neal",'Penny Hardaway','Dwight Howard','Nick Anderson'],PHI:['Julius Erving','Wilt Chamberlain','Allen Iverson','Moses Malone','Charles Barkley'],PHX:['Steve Nash','Charles Barkley','Kevin Johnson','Devin Booker','Alvan Adams'],POR:['Clyde Drexler','Bill Walton','Damian Lillard','Brandon Roy'],SAC:['Mitch Richmond','Chris Webber','Peja Stojaković','Oscar Robertson'],SAS:['Tim Duncan','David Robinson','Tony Parker','Manu Ginóbili','George Gervin'],TOR:['Vince Carter','Chris Bosh','Kyle Lowry','DeMar DeRozan','Kawhi Leonard'],UTA:['Karl Malone','John Stockton','Jeff Hornacek','Mark Eaton'],WAS:['Wes Unseld','Elvin Hayes','John Wall','Gilbert Arenas']};
const LEG_F=[
 [/paris sg|^psg|paris saint/,['Zlatan Ibrahimović','Ronaldinho','Pauleta','Kylian Mbappé','Edinson Cavani','Marco Verratti']],
 [/marseille|^om$/,['Jean-Pierre Papin','Chris Waddle','Abedi Pelé','Basile Boli','Didier Deschamps','Steve Mandanda']],
 [/^lyon|olympique lyon/,['Juninho Pernambucano','Karim Benzema','Sidney Govou','Alexandre Lacazette','Cris']],
 [/monaco/,['Thierry Henry','Jean Tigana','Radamel Falcao','Kylian Mbappé','Youri Djorkaeff']],
 [/^lille|losc/,['Eden Hazard','Yohan Cabaye','Rio Mavuba']],
 [/saint.?etienne|^asse/,['Michel Platini','Dominique Rocheteau','Jean-Michel Larqué']],
 [/bordeaux/,['Zinédine Zidane','Alain Giresse','Christophe Dugarry','Jean Tigana']],
 [/^nantes/,['Marcel Desailly','Christian Karembeu','Patrice Loko']],
 [/auxerre/,['Éric Cantona','Guy Roux','Djibril Cissé','Philippe Mexès']],
 [/montpellier/,['Laurent Blanc','Carlos Valderrama','Olivier Giroud']],
 [/man(chester)? ?u|united.*man|^man utd/,['Bobby Charlton','George Best','Eric Cantona','Ryan Giggs','Wayne Rooney']],
 [/man(chester)? ?c(ity)?$|^man city/,['Sergio Agüero','Vincent Kompany','David Silva','Colin Bell']],
 [/liverpool/,['Steven Gerrard','Kenny Dalglish','Ian Rush','Mohamed Salah']],
 [/arsenal/,['Thierry Henry','Dennis Bergkamp','Patrick Vieira','Tony Adams']],
 [/chelsea/,['Frank Lampard','John Terry','Didier Drogba','Gianfranco Zola']],
 [/tottenham|spurs/,['Harry Kane','Glenn Hoddle','Jimmy Greaves','Gareth Bale']],
 [/newcastle/,['Alan Shearer','Kevin Keegan','Les Ferdinand']],
 [/everton/,['Dixie Dean','Neville Southall','Duncan Ferguson']],
 [/west ham/,['Bobby Moore','Geoff Hurst','Martin Peters']],
 [/leicester/,['Jamie Vardy','Gary Lineker','Kasper Schmeichel']],
 [/real madrid/,['Alfredo Di Stéfano','Raúl','Iker Casillas','Cristiano Ronaldo','Zinédine Zidane']],
 [/barcelon/,['Lionel Messi','Johan Cruyff','Xavi','Andrés Iniesta','Ronaldinho']],
 [/atletico|atlético/,['Fernando Torres','Antoine Griezmann','Diego Godín','Luis Aragonés']],
 [/sevill/,['Jesús Navas','Frédéric Kanouté','Ivan Rakitić']],
 [/valencia/,['David Villa','Gaizka Mendieta','Santiago Cañizares']],
 [/athletic|bilbao/,['Telmo Zarra','José Ángel Iribar','Aritz Aduriz']],
 [/real sociedad/,['Xabi Alonso','Luis Arconada','Mikel Oyarzabal']],
 [/villarreal/,['Juan Román Riquelme','Marcos Senna','Diego Forlán']],
 [/juventus|^juve/,['Alessandro Del Piero','Gianluigi Buffon','Michel Platini','Pavel Nedvěd']],
 [/^ac milan|^milan/,['Paolo Maldini','Franco Baresi','Marco van Basten','Kaká']],
 [/inter/,['Javier Zanetti','Giuseppe Meazza','Ronaldo','Giacinto Facchetti']],
 [/napoli/,['Diego Maradona','Marek Hamšík','Dries Mertens']],
 [/^roma|as roma/,['Francesco Totti','Daniele De Rossi','Bruno Conti']],
 [/lazio/,['Alessandro Nesta','Paul Gascoigne','Giorgio Chinaglia']],
 [/fiorentina/,['Gabriel Batistuta','Roberto Baggio','Giancarlo Antognoni']],
 [/sampdoria/,['Gianluca Vialli','Roberto Mancini']],
 [/parma/,['Hernán Crespo','Lilian Thuram','Gianluigi Buffon']],
 [/bayern/,['Franz Beckenbauer','Gerd Müller','Philipp Lahm','Oliver Kahn','Robert Lewandowski']],
 [/dortmund/,['Marco Reus','Michael Zorc','Lars Ricken']],
 [/leverkusen/,['Rudi Völler','Michael Ballack','Bernd Schneider']],
 [/schalke/,['Klaus Fischer','Olaf Thon','Raúl']],
 [/bremen/,['Johan Micoud','Miroslav Klose','Claudio Pizarro']],
 [/hamburg/,['Uwe Seeler','Felix Magath','Kevin Keegan']],
 [/gladbach|m.?gladbach/,['Günter Netzer','Jupp Heynckes','Berti Vogts']],
 [/stuttgart/,['Jürgen Klinsmann','Mario Gómez','Guido Buchwald']],
 [/frankfurt/,['Jay-Jay Okocha','Bernd Hölzenbein','Anthony Yeboah']],
 [/wolfsburg/,['Edin Džeko','Grafite','Diego']],
 [/ajax/,['Johan Cruyff','Marco van Basten','Dennis Bergkamp','Edwin van der Sar']],
 [/benfica/,['Eusébio','Rui Costa','Nuno Gomes']],
 [/^porto|fc porto/,['Vítor Baía','Deco','Jorge Costa','Fernando Couto']],
 [/sporting/,['Cristiano Ronaldo','Luís Figo','Paulo Futre']]
];
function legendsHtml(kind,key,name){
  let names=null;
  if(kind==='nba') names=LEG_NBA[key];
  else { const k=String(name||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\b(fc|cf|afc|sc|ac|as|ssc|rc|us|ud|sv|vfb|vfl|fsv|1\.)\b\.?/g,m=>/^(ac|as)$/.test(m)?m:'').trim(); const f=LEG_F.find(x=>x[0].test(k)); names=f&&f[1]; }
  const q=kind==='nba'?(tname(key)+' légendes basket'):(name+' football légendes');
  return `<h3>🏆 Légendes du club</h3><div>${names?names.map(n=>`<span class="chip">${wikiLink(n)}</span>`).join(''):'<span class="mut">Pas de liste pour ce club.</span>'} <span class="mut" style="font-size:12px">· ${wikiLink(q,'Plus sur Wikipédia ↗')}</span></div>`;
}

/* --- Ce soir --- */
function tonightNba(S){
  if(!sched||!sched.length) return '';
  const now=Date.now(); let L=upcoming().filter(x=>Date.parse(x.t)>=now-3*36e5&&Date.parse(x.t)<=now+30*36e5);
  // une « nuit » = de 18h à 6h du matin (heure de Paris) : on n'affiche que la prochaine (un match avant 18h compte pour la nuit qui suit)
  { const nk=x=>parisDK(new Date(Date.parse(x.t)-6*36e5).toISOString()); if(L.length){ const k0=L.map(nk).sort()[0]; L=L.filter(x=>nk(x)===k0); } }
  let big=new Set(); try{ const b=bigMatches(S); if(b) b.items.forEach(i=>big.add(i.x.id)); }catch(e){}
  const mine=x=>fav.teams.includes(x.h)||fav.teams.includes(x.a);
  const rows=[...L].sort((a,b)=>mine(b)-mine(a)||Date.parse(a.t)-Date.parse(b.t)).map(x=>`<div class="liverow" style="grid-template-columns:auto 1fr auto"><div><b>${esc(parisT(x.t))}</b></div><div class="lt">${teamLogo(x.a,22)}<span class="nfull">${esc(tname(x.a))}</span><span class="ntri">${esc(x.a)}</span> <span class="mut">@</span> ${teamLogo(x.h,22)}<span class="nfull">${esc(tname(x.h))}</span><span class="ntri">${esc(x.h)}</span>${mine(x)?' ⭐':''}${big.has(x.id)?' 🔥':''}</div><div><span class="link" data-act="cmpgo" data-sp="nba" data-a="${esc(x.h)}" data-b="${esc(x.a)}" title="Comparer ces deux équipes">⚖️</span></div></div>`).join('');
  return `<div class="card"><div class="row between"><h2 style="margin:0">🌙 Ce soir / cette nuit <span class="mut" style="font-weight:400;font-size:13px">(heure de Paris)</span></h2></div>${rows||'<p class="mut" style="margin:8px 0 0">Aucun match prévu cette nuit (calendrier chargé jusqu\'au '+esc(parisD(sched[sched.length-1].t))+').</p>'}</div>`;
}
function tonightFoot(){
  const {mt}=footIdx(); if(!mt.length) return '';
  const now=Date.now(), L=mt.filter(m=>!m.done&&m.st!=='post'&&Date.parse(m.d)>=now-2*36e5&&Date.parse(m.d)<=now+30*36e5).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d));
  let big=new Set(); try{ footBig(40).forEach(i=>big.add(i.m.id)); }catch(e){}
  const mine=m=>ffav.includes(m.hid)||ffav.includes(m.aid);
  const rows=[...L].sort((a,b)=>mine(b)-mine(a)||Date.parse(a.d)-Date.parse(b.d)).slice(0,14).map(m=>`<div class="liverow" style="grid-template-columns:auto 1fr auto"><div><b>${esc(parisT(m.d))}</b>${m.st==='in'?' <span class="err">🔴</span>':''}</div><div class="lt" data-act="fmatch" data-id="${esc(m.id)}" style="cursor:pointer">${footLogo(m.hl,20)}${esc(m.hn)} <span class="mut">-</span> ${footLogo(m.al,20)}${esc(m.an)}${mine(m)?' ⭐':''}${big.has(m.id)?' 🔥':''}<span class="mut" style="font-size:12px"> · ${esc(footLgName(m.lg))}</span></div><div><span class="link" data-act="cmpgo" data-sp="foot" data-a="${esc(m.hid)}" data-b="${esc(m.aid)}" data-lg="${esc(m.lg)}" title="Comparer ces deux clubs">⚖️</span></div></div>`).join('');
  return rows?`<div class="card"><h2 style="margin:0 0 6px">🌙 Ce soir <span class="mut" style="font-weight:400;font-size:13px">(heure de Paris)</span></h2>${rows}</div>`:'';
}

/* --- Fiche équipe NBA enrichie --- */
function teamExtraNba(S,t){
  const r0=Object.values(S.P).filter(p=>p.tri===t.tri&&p.gp>0), mg=Math.max(0,...r0.map(p=>p.gp)), roster=r0.filter(p=>p.gp>=Math.ceil(mg/3)), best=k=>[...roster].sort((a,b)=>b[k]/b.gp-a[k]/a.gp)[0];
  const kp=(l,k)=>{ const p=best(k); return `<div class="kpi"><span class="mut">${l}</span><b style="font-size:16px">${p?playerLink(p.id,p.name):'–'}</b>${p?`<span class="mut">${f1(p[k]/p.gp)} / match</span>`:''}</div>`; };
  const nx=upcoming().filter(x=>x.h===t.tri||x.a===t.tri).slice(0,5);
  return `<h3>Forme et prochains matchs</h3><div class="grid"><div class="kpi"><span class="mut">Forme (5 derniers)</span><div style="margin-top:4px">${formDots(t.log)}</div></div>${kp('Meilleur marqueur','pts')}${kp('Meilleur rebondeur','reb')}${kp('Meilleur passeur','ast')}</div>
  ${nx.length?`<div class="scroll"><table><tbody>${nx.map(x=>`<tr><td class="l">${esc(parisD(x.t))}</td><td>${esc(parisT(x.t))}</td><td class="l">${x.h===t.tri?'vs':'@'} ${teamLogo(x.h===t.tri?x.a:x.h,18)}${esc(tname(x.h===t.tri?x.a:x.h))}</td></tr>`).join('')}</tbody></table></div>`:'<p class="mut">Aucun match à venir dans le calendrier chargé.</p>'}
  ${legendsHtml('nba',t.tri)}`;
}

/* --- Face-à-face : forme, joueurs clés, prochaine rencontre --- */
function cmpExtraNba(S,a,b){
  const key=t=>[...Object.values(S.P)].filter(p=>p.tri===t.tri&&p.gp>0).sort((x,y)=>y.pts/y.gp-x.pts/x.gp).slice(0,3);
  const col=t=>`<div><h3 style="margin-top:0">${teamLogo(t.tri,20)} ${esc(t.name)}</h3><div style="margin-bottom:6px">Forme : ${formDots(t.log)} <span class="mut">· série ${streak(t.log)}</span></div>${key(t).map(p=>`<div>${playerLink(p.id,p.name)} <span class="mut">${f1(p.pts/p.gp)} pts · ${f1(p.reb/p.gp)} reb · ${f1(p.ast/p.gp)} pd</span></div>`).join('')||'<span class="mut">–</span>'}</div>`;
  const nx=upcoming().find(x=>(x.h===a.tri&&x.a===b.tri)||(x.h===b.tri&&x.a===a.tri));
  return `<h3>Avant le match : forme et joueurs clés</h3><div class="grid2">${col(a)}${col(b)}</div>${nx?`<p class="mut">Prochaine rencontre : ${esc(parisD(nx.t))} à ${esc(parisT(nx.t))} (heure de Paris) — ${esc(tname(nx.a))} @ ${esc(tname(nx.h))}.</p>`:''}`;
}
function cmpExtraFoot(a,b){
  const {P,mt}=footIdx(), key=t=>Object.values(P).filter(p=>p.tid===t.id).sort((x,y)=>(y.g+y.a)-(x.g+x.a)||y.gp-x.gp).slice(0,3);
  const col=t=>`<div><h3 style="margin-top:0">${footLogo(t.lo,20)}${esc(t.n)}</h3><div style="margin-bottom:6px">Forme : ${fdots(t.id,5)}</div>${key(t).map(p=>`<div>${plink(p.id,p.n)} <span class="mut">${p.g} but${p.g>1?'s':''} · ${p.a} PD · ${p.gp} MJ</span></div>`).join('')||'<span class="mut">Pas encore de stats joueurs.</span>'}</div>`;
  const nx=mt.filter(m=>!m.done&&((m.hid===a.id&&m.aid===b.id)||(m.hid===b.id&&m.aid===a.id))).sort((x,y)=>Date.parse(x.d)-Date.parse(y.d))[0];
  return `<h3>Avant le match : forme et joueurs clés</h3><div class="grid2">${col(a)}${col(b)}</div>${nx?`<p class="mut">Prochaine rencontre : ${esc(parisD(nx.d))} à ${esc(parisT(nx.d))} (heure de Paris) — ${esc(nx.hn)} - ${esc(nx.an)}.</p>`:''}`;
}

/* --- Joueur foot : buts par tranche de minutes --- */
function footPlayerMinHtml(p){
  const {mt}=footIdx(), byId=Object.fromEntries(mt.map(m=>[m.id,m])), b=[0,0,0,0,0,0]; let n=0;
  for(const x of p.log){ const m=byId[x.mid]; if(!m||!m.x) continue; for(const e of m.x.ev){ if((e.t==='g'||e.t==='pg')&&e.p===p.n){ b[Math.min(5,Math.floor(Math.max(0,(e.m||1)-1)/15))]++; n++; } } }
  if(!n) return '';
  const mx=Math.max(...b), lab=['0-15','16-30','31-45','46-60','61-75','76-90+'], W=300, H=120, bw=36;
  const bars=b.map((v,i)=>{ const h=mx?v/mx*70:0, x=14+i*47; return `<rect x="${x}" y="${96-h}" width="${bw}" height="${Math.max(h,1)}" rx="3" style="fill:var(--acc)"/><text x="${x+bw/2}" y="${90-h}" text-anchor="middle">${v}</text><text x="${x+bw/2}" y="112" text-anchor="middle" style="fill:var(--mut)">${lab[i]}</text>`; }).join('');
  return `<h3>Quand marque-t-il ?</h3><svg viewBox="0 0 ${W} ${H}" style="max-width:420px;width:100%" font-size="10">${bars}</svg><p class="mut" style="margin:4px 0 0">${p.gp?`${(p.g/p.gp).toFixed(2).replace('.',',')} but${p.g/p.gp>=2?'s':''} par match en moyenne · `:''}minute connue pour ${n} but${n>1?'s':''} sur ${p.g}.</p>`;
}


function footTeamExtra(t,plist){
  const bs=[...plist].sort((x,y)=>y.g-x.g)[0], ba=[...plist].sort((x,y)=>y.a-x.a)[0];
  return `<h3>Hommes clés</h3><div class="grid"><div class="kpi"><span class="mut">Meilleur buteur</span><b style="font-size:16px">${bs&&bs.g?plink(bs.id,bs.n):'–'}</b>${bs&&bs.g?`<span class="mut">${bs.g} but${bs.g>1?'s':''} en ${bs.gp} MJ</span>`:''}</div><div class="kpi"><span class="mut">Meilleur passeur</span><b style="font-size:16px">${ba&&ba.a?plink(ba.id,ba.n):'–'}</b>${ba&&ba.a?`<span class="mut">${ba.a} PD en ${ba.gp} MJ</span>`:''}</div></div>${legendsHtml('foot',t.id,t.n)}`;
}
function confetti(box,cols){
  const n=110; let h='';
  for(let i=0;i<n;i++){ const c=cols[i%cols.length]; h+=`<i class="cf" style="left:${Math.random()*100}%;background:${c};animation-duration:${2.4+Math.random()*2.6}s;animation-delay:${Math.random()*1.4}s;width:${6+Math.random()*7}px;height:${9+Math.random()*9}px;border-radius:${Math.random()<.3?'50%':'2px'}"></i>`; }
  box.insertAdjacentHTML('beforeend',h); setTimeout(()=>box.querySelectorAll('.cf').forEach(e=>e.remove()),7500);
}
function closeWelcome(){ $('#welcome').classList.remove('on'); $('#welcome').innerHTML=''; }
function showWelcome(force){
  try{ const S=buildStats(); S.prev=prevStats(); const FT=ui.sport==='foot', al=FT?footAlerts():alerts(S);
    if(!al.length){ if(force) say('Aucune alerte pour le moment.','warn'); return; }
    const times=S.fin.map(g=>Date.parse(g.time)||0), sig=FT?'f'+footIdx().done.length:S.fin.length+'|'+Math.max(0,...times), wk=FT?'suivi-foot-welcome':'suivi-nba-welcome';
    if(!force){ if(localStorage.getItem(wk)===sig) return; localStorage.setItem(wk,sig); }
    const W=$('#welcome'), party=al.some(x=>/🏅|triple-double|🎩/.test(x));
    W.innerHTML=`<div class="wbox"><h2>${party?'🎉':'🔔'} Du nouveau sur tes favoris !</h2>${al.map(x=>`<div class="alert">${x}</div>`).join('')}<div style="margin-top:14px;text-align:right"><button data-act="closewelcome">Super, merci</button></div></div>`;
    W.classList.add('on');
    if(party){ const [a,b]=FT?[null,null]:['E','W'].map(c=>{ const r=raceData(S,c)[0]; return r&&r.g?tcolor(r.tri):null; }); confetti(W,['#34b64f','#f0b010','#f07020','#e04030','#3cc15a','#ffffff',a||'#ff8a4f',b||'#8a4fd0']); }
  }catch(e){}
}
function renderLeaders(S){
  let on='1'; try{ on=localStorage.getItem('suivi-nba-lead')!=='0'?'1':'0'; }catch(e){}
  document.body.classList.toggle('lead',on==='1');
  const L=['E','W'].map(c=>{ const r=raceData(S,c)[0]; return r&&r.g?r:null; }), root=document.documentElement.style;
  root.setProperty('--lE',L[0]?tcolor(L[0].tri):'transparent'); root.setProperty('--lW',L[1]?tcolor(L[1].tri):'transparent');
  $('#leaders').innerHTML=L.map((r,i)=>r?`<span class="lchip" style="border-color:${tcolor(r.tri)}" data-act="openteam" data-id="${r.tri}" title="Équipe en tête de la conférence ${i?'Ouest':'Est'}">${teamLogo(r.tri,22)}<b>${i?'Ouest':'Est'}</b> ${esc(r.tri)} ${r.w}-${r.l}</span>`:'').join('');
}
function duelData(S){
  const times=S.fin.map(g=>Date.parse(g.time)).filter(Boolean); if(!times.length) return null;
  const cut=Math.max(...times)-7*86400e3, arr=[];
  for(const p of Object.values(S.P)){ const l=p.log.filter(x=>Date.parse(x.time)>=cut); if(!l.length) continue; const n=l.length, sm=k=>l.reduce((s,x)=>s+x[k],0)/n;
    arr.push({p,n,pts:sm('pts'),reb:sm('reb'),ast:sm('ast'),gs:sm('gs'),min:sm('min'),w:l.filter(x=>x.win).length}); }
  let c=arr.filter(a=>a.n>=2); if(c.length<2) c=arr; if(c.length<2) return null;
  c.sort((a,b)=>b.gs-a.gs); return {a:c[0],b:c[1]};
}
function duelCard(S){
  const d=duelData(S); if(!d) return '';
  const {a,b}=d, [ca,cb]=pickColors([tcolor(a.p.tri),tcolor(b.p.tri)]);
  const rows=[['Points','pts'],['Rebonds','reb'],['Passes','ast'],['Game Score','gs'],['Minutes','min']].map(([l,k])=>{ const x=a[k],y=b[k],m=Math.max(x,y)||1;
    return `<div class="cmp"><div class="cv ${x>=y?'win':''}">${f1(x)}</div><div class="cb l"><i class="${x>=y?'w':''}" style="width:${x/m*100}%;background:${ca}"></i></div><div class="cl">${l}</div><div class="cb r"><i class="${y>=x?'w':''}" style="width:${y/m*100}%;background:${cb}"></i></div><div class="cv ${y>=x?'win':''}">${f1(y)}</div></div>`; }).join('');
  const hd=(o,c)=>`<div class="row">${avatar(o.p.id,o.p.name,o.p.tri,48)}<div><b style="color:${c}">${playerLink(o.p.id,o.p.name)}</b><div class="mut">${esc(o.p.tri)} · ${o.n} match(s) · ${o.w} V.</div></div></div>`;
  return `<div class="card"><h2>⚔️ Duel de la semaine</h2><p class="mut">Les deux joueurs avec le meilleur Game Score moyen sur les 7 derniers jours de matchs (au moins 2 matchs si possible).</p><div class="row between">${hd(a,ca)}${hd(b,cb)}</div>${rows}<div style="margin-top:8px"><button class="sec" data-act="cmpopen" data-a="${esc(a.p.id)}" data-b="${esc(b.p.id)}">Comparer en détail</button></div></div>`;
}
function viewCal(S){
  if(!sched.length) return `<div class="card"><h2>Calendrier</h2><p>Pour voir tous les matchs de la saison :</p><ol><li>Va sur <b>nba.com/schedule</b>.</li><li>Clique sur ton favori « 🏀 Copier match NBA ».</li><li>Reviens ici et fais <b>Ctrl+V</b>.</li></ol><p class="mut">Si le favori a été installé avant cette version, glisse à nouveau le bouton du haut de la page dans ta barre de favoris pour le mettre à jour.</p></div>`;
  const done={}; Object.values(games).filter(g=>g.status===3).forEach(g=>{ done[g.id]=g; });
  const now=Date.now()-4*3600e3, mk=t=>{ const d=new Date(t); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); };
  const all=sched.filter(x=>!/^001/.test(x.id)&&x.h&&x.a&&Date.parse(x.t));
  const months=[...new Set(all.map(x=>mk(x.t)))].sort();
  let list=all;
  if(ui.calWhen==='up') list=list.filter(x=>!done[x.id]&&x.s!==3&&Date.parse(x.t)>=now);
  else if(ui.calWhen==='past') list=list.filter(x=>done[x.id]||x.s===3||Date.parse(x.t)<now);
  if(ui.calTeam) list=list.filter(x=>x.h===ui.calTeam||x.a===ui.calTeam);
  else if(ui.schedFav&&fav.teams.length) list=list.filter(x=>fav.teams.includes(x.h)||fav.teams.includes(x.a));
  if(ui.calMonth) list=list.filter(x=>mk(x.t)===ui.calMonth);
  list=[...list].sort((a,b)=>(Date.parse(a.t)-Date.parse(b.t))*(ui.calWhen==='past'?-1:1));
  const bm=bigMatches(S), hot=new Set(bm?bm.items.map(i=>i.x.id):[]);
  let h2='', last='';
  for(const x of list){ const d=new Date(x.t), dk=d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    if(dk!==last){ h2+=`<tr><th class="l" colspan="4" style="text-transform:capitalize">${esc(dk)}</th></tr>`; last=dk; }
    const g=done[x.id], res=g?`<span class="link" data-act="opengame" data-id="${esc(x.id)}">${g.away.score} - ${g.home.score}</span>`:(x.s===3?'<span class="mut">terminé</span>':'');
    h2+=`<tr class="${early(x)?'early':''}"><td class="l">${esc(d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}))}${hot.has(x.id)?' 🔥':''}</td><td class="l ${fav.teams.includes(x.a)?'win':''}">${esc(tname(x.a))}</td><td class="l ${fav.teams.includes(x.h)?'win':''}">@ ${esc(tname(x.h))}</td><td>${res}</td></tr>`; }
  const opt=(v,l,cur)=>`<option value="${esc(v)}" ${cur===v?'selected':''}>${esc(l)}</option>`;
  return bigCard(S)+`<div class="card"><div class="row" style="margin-bottom:10px"><select id="calWhen">${opt('up','Matchs à venir',ui.calWhen)}${opt('past','Matchs joués',ui.calWhen)}${opt('all','Toute la saison',ui.calWhen)}</select><select id="calTeam">${opt('','Toutes les équipes',ui.calTeam)}${Object.keys(TEAMS).sort((a,b)=>tname(a).localeCompare(tname(b))).map(t=>opt(t,tname(t),ui.calTeam)).join('')}</select><select id="calMonth">${opt('','Tous les mois',ui.calMonth)}${months.map(m=>opt(m,new Date(m+'-15').toLocaleDateString('fr-FR',{month:'long',year:'numeric'}),ui.calMonth)).join('')}</select><label><input type="checkbox" id="schedFav" ${ui.schedFav?'checked':''}> Mes équipes seulement</label></div><p class="mut" style="margin:0 0 8px">${list.length} match(s) affiché(s) sur ${all.length} dans le calendrier · heures dans ton fuseau · 🔥 = à ne pas manquer</p><div class="legend"><span><i class="early"></i>Commence au plus tard à 21h30 (heure locale)</span></div>
  <div class="scroll"><table><tbody>${h2||'<tr><td class="empty" colspan="4">Aucun match pour ce filtre.</td></tr>'}</tbody></table></div></div>`;
}

/* ================= Foot (ESPN) : données ================= */
function closeModals(){ ui.openPlayer=ui.openTeam=ui.openGame=ui.fMatch=ui.fPlayer=ui.fTeam=ui.newsRead=null; }
function setSport(x){ const ch=ui.sport!==x; ui.sport=x; try{ localStorage.setItem('suivi-sport',x); }catch(e){} if(ch) setTimeout(()=>{ try{ liveRender(); }catch(e){} },400); }
const KEYFO='suivi-foot-v1', KEYFF='suivi-foot-fav', KEYFP='suivi-foot-favp', KEYSP='suivi-sport';
const FLG=[['fra.1','Ligue 1'],['eng.1','Premier League'],['esp.1','Liga'],['ita.1','Serie A'],['ger.1','Bundesliga'],['uefa.champions','Ligue des champions'],['uefa.europa','Europa League'],['uefa.europa.conf','Conférence League']];
const isEU=lg=>/^uefa\./.test(lg||'');
const zoneFr=d=>{ const x=String(d||''); const t=[[/champions league.*(qualif|play)/i,'Qualif. Ligue des champions'],[/champions league/i,'Ligue des champions'],[/europa league.*(qualif|play)/i,'Qualif. Europa League'],[/europa league/i,'Europa League'],[/conference league.*(qualif|play)/i,'Qualif. Conférence League'],[/conference league/i,'Conférence League'],[/relegation.*(play|round)/i,'Barrage de relégation'],[/relegation/i,'Relégation'],[/promotion.*(play|round)/i,'Barrage de promotion'],[/promotion/i,'Promotion'],[/round of 16|8th/i,'Qualifié pour les 8es de finale'],[/knockout/i,'Phase à élimination directe'],[/play-?off/i,'Barrages'],[/eliminat/i,'Éliminé']]; for(const [r,f] of t) if(r.test(x)) return f; return x; };
const inLg=(o,lg)=>!lg||lg==='mine'||o.lg===lg||!!(o.comps&&o.comps[lg]);
const FTABS=[['home','Accueil'],['multi','🔥 Multiplex'],['matches','Matchs'],['table','Classement'],['teams','Équipes'],['players','Joueurs'],['records','Records'],['compare','Comparer'],['cal','Calendrier']];
let foot=loadJ(KEYFO,{leagues:{}}), ffav=loadJ(KEYFF,[]), ffavP=loadJ(KEYFP,[]);
// étoile DORÉE = notifications / multiplex ; étoile BLEUE = favoris (suivi, accueil, stats)
const KEYNF='suivi-notif-fav'; let nfav=loadJ(KEYNF,null);
if(!nfav||!Array.isArray(nfav.nba)||!Array.isArray(nfav.foot)){ nfav={nba:[...fav.teams],foot:[...ffav]}; saveJ(KEYNF,nfav); }
function nfavToggle(k,id){ const a=nfav[k]; if(!a) return; const i=a.indexOf(id); if(i>=0) a.splice(i,1); else a.push(id); saveJ(KEYNF,nfav); render(); }
function nfavAll(){ let ids=[]; try{ ids=Object.keys(footIdx().T); }catch(e){} nfav={nba:Object.keys(TEAMS),foot:ids}; saveJ(KEYNF,nfav); }
function nfavNone(){ nfav={nba:[],foot:[]}; saveJ(KEYNF,nfav); }
const bellBtn=(k,id)=>{ const on=nfav[k].includes(id); return `<button class="star bell" data-act="nbell" data-k="${k}" data-id="${esc(id)}" title="${on?'Notifications activées (toucher pour retirer)':'Recevoir les notifications de cette équipe'}">${on?'★':'☆'}</button>`; };
if(!foot.leagues) foot.leagues={}; if(!foot.ph) foot.ph={};
let _fidx=null;
const footStat=(e,n)=>{ const x=(e.stats||[]).find(y=>y.name===n); return x&&x.value!=null?+x.value:0; };
const fcol=c=>c?(String(c)[0]==='#'?c:'#'+c):'#34b64f';
const footLgName=lg=>(FLG.find(x=>x[0]===lg)||[0,lg])[1];
const posGroup=a=>{ a=String(a||'').toUpperCase(); return /^(G|GK)/.test(a)?'G':/^(D|CB|LB|RB|SW|WB)/.test(a)?'D':/^(M|CM|DM|AM|LM|RM|CDM|CAM)/.test(a)?'M':/^(F|ST|CF|LW|RW|SS|W)/.test(a)?'F':'?'; };
const POSL={G:'Gardien',D:'Défenseur',M:'Milieu',F:'Attaquant','?':'–'};
const fpc=(a,b)=>b?Math.round(100*a/b)+' %':'–';
const fdiv=(a,b)=>b?a/b:0;

function footCompact(d,M){
  const x={ts:{h:{},a:{}},ev:[],pl:{h:[],a:[]},fm:{}}; let any=0;
  const SM={possessionPct:'poss',totalShots:'sh',shotsOnTarget:'sot',wonCorners:'cor',foulsCommitted:'fl',yellowCards:'yc',redCards:'rc',offsides:'off',saves:'sv',accuratePasses:'pasA',totalPasses:'pas',interceptions:'int',blockedShots:'blk',effectiveTackles:'tkl',totalClearance:'clr',accurateCrosses:'croA',totalCrosses:'cro'};
  ((d.boxscore||{}).teams||[]).forEach((t,i)=>{ const s=(t.homeAway||(i?'away':'home'))==='away'?'a':'h';
    for(const st of (t.statistics||[])){ const k=SM[st.name]; if(k){ const v=parseFloat(st.displayValue!=null?st.displayValue:st.value); if(!isNaN(v)){ x.ts[s][k]=v; any=1; } } } });
  for(const r of (d.rosters||[])){ const s=r.homeAway==='away'?'a':'h';
    if(r.formation) x.fm[s]=typeof r.formation==='string'?r.formation:(r.formation.displayName||'');
    for(const p of (r.roster||[])){ const a=p.athlete||{}, st={}; (p.stats||[]).forEach(z=>{ st[z.name]=+z.value||0; });
      const subIn=p.subbedIn&&(p.subbedIn===true||p.subbedIn.didSub), played=p.starter||st.appearances>0||subIn; if(!played) continue;
      const id=String(a.id||a.displayName||'');
      x.pl[s].push({id,n:a.displayName||a.fullName||a.shortName||'?',pos:(p.position&&p.position.abbreviation)||'',jn:String(p.jersey||a.jersey||''),s:p.starter?1:0,g:st.totalGoals||0,a:st.goalAssists||0,sh:st.totalShots||0,sot:st.shotsOnTarget||0,yc:st.yellowCards||0,rc:st.redCards||0,sv:st.saves||0,gc:st.goalsConceded||0,fc:st.foulsCommitted||0,fs:st.foulsSuffered||0,og:st.ownGoals||0});
      const hs=a.headshot&&a.headshot.href; if(hs&&a.id) foot.ph[String(a.id)]=hs; any=1; } }
  for(const e of (d.keyEvents||[])){ const tx=((e.type&&e.type.text)||'').toLowerCase(); let t=null;
    if(/own goal/.test(tx)) t='og'; else if(e.scoringPlay||/^goal|penalty - scored|penalty scored/.test(tx)) t=/penalty/.test(tx)?'pg':'g';
    else if(/yellow/.test(tx)) t='yc'; else if(/red card/.test(tx)) t='rc'; else if(/substitution/.test(tx)) t='sub'; if(!t) continue;
    const disp=(e.clock&&e.clock.displayValue)||'', tid=String((e.team&&e.team.id)||''), ps=(e.participants||[]).map(z=>z.athlete&&z.athlete.displayName).filter(Boolean);
    x.ev.push({t,m:parseInt(disp)||0,ms:disp,s:tid===M.hid?'h':tid===M.aid?'a':'',p:ps[0]||'',p2:ps[1]||'',tx:(t==='sub'||!ps.length)?String(e.shortText||e.text||'').slice(0,80):''}); any=1; }
  x.ev.sort((a,b)=>a.m-b.m);
  const gi=d.gameInfo||{}; if(gi.venue&&gi.venue.fullName) x.ven=gi.venue.fullName; if(gi.attendance) x.att=+gi.attendance||0;
  if(!any){ M.nx=1; delete M.x; foot.dbg={keys:Object.keys(d||{}).join(', '),roster:((d.rosters||[])[0]?Object.keys(d.rosters[0]).join(', '):'(aucun roster)'),ke:(d.keyEvents||[]).length,bx:Object.keys(d.boxscore||{}).join(', ')}; return 0; }
  M.x=x; delete M.nx; return 1;
}
function footIngest(o){
  try{
    const lg=o.league, d=o.data; if(!lg||!d) return 0; _fidx=null;
    const L=(foot.leagues[lg] ||= {standings:[],matches:{},upd:0,season:''});
    if(o.__foot==='standings'){
      const ent=(d.children||[]).flatMap(c=>(c.standings&&c.standings.entries)||[]); if(!ent.length) return 0;
      L.standings=ent.map(e=>({id:String(e.team.id),name:e.team.shortDisplayName||e.team.displayName,abbr:e.team.abbreviation,logo:(e.team.logos&&e.team.logos[0]&&e.team.logos[0].href)||'',
        rank:footStat(e,'rank'),gp:footStat(e,'gamesPlayed'),w:footStat(e,'wins'),d:footStat(e,'ties'),l:footStat(e,'losses'),gf:footStat(e,'pointsFor'),ga:footStat(e,'pointsAgainst'),pts:footStat(e,'points'),gd:footStat(e,'pointDifferential'),
        zone:e.note?{d:e.note.description||'',c:e.note.color||'#8f9bb8'}:null})).sort((a,b)=>a.rank-b.rank);
      L.season=(d.season&&d.season.displayName)||L.season; L.upd=Date.now(); return 1;
    }
    if(o.__foot==='scores'){
      let n=0;
      for(const e of (d.events||[])){ const c=e.competitions&&e.competitions[0]; if(!c) continue;
        const h=c.competitors.find(x=>x.homeAway==='home'), a=c.competitors.find(x=>x.homeAway==='away'); if(!h||!a) continue;
        const sc=x=>{ const l=(x.leaders||[]).find(y=>y.name==='goals'), t=l&&l.leaders&&l.leaders[0]; return t&&t.athlete?{n:t.athlete.displayName||t.athlete.shortName,v:+t.value||0}:null; };
        const st=(e.status&&e.status.type)||{}, old=L.matches[e.id]||{};
        L.matches[e.id]={...old,id:e.id,d:e.date,st:st.state||'pre',done:!!st.completed,det:st.shortDetail||st.detail||'',clk:(e.status&&e.status.displayClock)||'',sn:st.name||'',per:(e.status&&e.status.period)||0,
          ven:(c.venue&&c.venue.fullName)||old.ven||'',
          hid:String(h.team.id),hn:h.team.shortDisplayName||h.team.displayName,ha:h.team.abbreviation,hl:h.team.logo||'',hc:h.team.color||'',hs:+h.score||0,hsc:sc(h),
          aid:String(a.team.id),an:a.team.shortDisplayName||a.team.displayName,aa:a.team.abbreviation,al:a.team.logo||'',ac:a.team.color||'',as:+a.score||0,asc:sc(a)}; n++; }
      L.upd=Date.now(); return n?1:0;
    }
    if(o.__foot==='summary'){ const M=L.matches[o.id]; if(!M) return 0; footCompact(d,M); if(M.st==='in') M.lv=1; else delete M.lv; L.upd=Date.now(); return 1; }
  }catch(e){}
  return 0;
}
function footSave(){
  if(bigSave(KEYFO,foot)) return true;
  const put=()=>{ try{ localStorage.setItem(KEYFO,JSON.stringify(foot)); return true; }catch(e){ return false; } };
  if(put()) return true;
  const det=Object.values(foot.leagues).flatMap(L=>Object.values(L.matches)).filter(m=>m.x).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d));
  for(const part of ['pl','ev','ts']){ for(let i=0;i<det.length;i+=40){ det.slice(i,i+40).forEach(m=>{ if(m.x) m.x[part]=part==='ts'?{h:{},a:{}}:(part==='pl'?{h:[],a:[]}:[]); }); foot.pruned=1; if(put()) return true; } }
  return false;
}
function footPeriods(){ return [{l:'Rapide : 2 semaines en arrière, 2 en avant (~240 requêtes)',b:14,f:14},{l:'1 mois en arrière, 3 semaines en avant (~420 requêtes)',b:30,f:21},{l:'Depuis le début de saison, 3 semaines en avant (très long)',b:'start',f:21}]; }
function footUrls(per){
  const out=[], day=864e5, now=Date.now(), f=t=>new Date(t).toISOString().slice(0,10).replace(/-/g,'');
  const y=new Date(), sy=y.getMonth()>=6?y.getFullYear():y.getFullYear()-1, start=Date.UTC(sy,7,1), end=Date.UTC(sy+1,5,5);
  const a0=per.b==='start'?Math.floor((start-now)/day):-per.b, a1=per.f==='end'?Math.ceil((end-now)/day):per.f;
  for(const [lg] of FLG){ out.push({k:'standings',lg,u:`https://site.api.espn.com/apis/v2/sports/soccer/${lg}/standings`});
    for(let a=a0;a<a1;a++){ out.push({k:'scores',lg,u:`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${f(now+a*day)}`}); } }
  return out;
}
async function footGet(u){ let err; for(let k=0;k<3;k++){ try{ const r=await fetch(u); if(!r.ok){ if(r.status===400||r.status===404||r.status===403||r.status===429){ const e=new Error('HTTP '+r.status); e.fatal=1; throw e; } throw new Error('HTTP '+r.status); } return await r.json(); }catch(e){ err=e; if(e.fatal) break; await new Promise(z=>setTimeout(z,400*(k+1))); } } throw err; }
async function footRefresh(){
  if(footBusy) return; footBusy=true; try{ render(); }catch(e){}
  const per=footPeriods()[ui.fPer||0], urls=footUrls(per); let ok=0,ko=0,last='',n=0;
  try{
    say('⏳ ESPN : classements et calendrier…','warn');
    const stop=()=>/HTTP 4(03|29)/.test(last);
    for(let i=0;i<urls.length;i+=6){ if(stop()) break; if(i%30===0) say(`⏳ ESPN : classements et calendrier ${i}/${urls.length}…`,'warn'); await Promise.all(urls.slice(i,i+6).map(async x=>{ try{ ok+=footIngest({__foot:x.k,league:x.lg,data:await footGet(x.u)}); }catch(e){ ko++; last=e.message||String(e); } })); }
    if(stop()){ saveJ(KEYFO,foot); render(); say('⏸️ ESPN demande de ralentir ('+esc(last)+') : actualisation interrompue pour ne pas être bloqué. Tes données sont gardées, réessaie dans 10-15 minutes.','warn'); return; }
    if(ko>ok){ saveJ(KEYFO,foot); render(); say(`⚠️ ESPN a répondu à ${ok} requête(s) sur ${urls.length} (erreur : ${esc(last)}). Le navigateur bloque la lecture directe depuis ce fichier : utilise le <b>favori foot</b> sur espn.com/soccer, puis Ctrl+V ici.`,'err'); return; }
    if(!ok){ say('ESPN refuse la lecture directe depuis cette page ('+esc(last)+'). Utilise le favori foot sur espn.com/soccer, puis Ctrl+V ici.','err'); return; }
    const todo=Object.entries(foot.leagues).flatMap(([lg,L])=>Object.values(L.matches).filter(m=>m.done&&((!m.x&&!m.nx)||m.lv)).map(m=>({lg,m}))).sort((a,b)=>Date.parse(b.m.d)-Date.parse(a.m.d)).slice(0,400);
    for(let i=0;i<todo.length;i+=3){ if(stop()) break; say(`⏳ Détails des matchs : ${i}/${todo.length}…`,'warn');
      await Promise.all(todo.slice(i,i+3).map(async t=>{ try{ footIngest({__foot:'summary',league:t.lg,id:t.m.id,data:await footGet(`https://site.api.espn.com/apis/site/v2/sports/soccer/${t.lg}/summary?event=${t.m.id}`)}); n++; }catch(e){ ko++; last=e.message||String(e); } })); }
    const saved=footSave(); render();
    if(stop()){ say(`⏸️ ESPN demande de ralentir : ${ok} lot(s) et ${n} match(s) détaillé(s) enregistrés, le reste a été interrompu pour ne pas être bloqué. Réessaie dans 10-15 minutes.`,'warn'); return; }
    say(`✓ Foot mis à jour : ${ok} lot(s), ${n} match(s) détaillé(s)${ko?`, ${ko} échec(s) (dernière erreur : ${esc(last)})`:''}.${foot.pruned?' Espace presque plein : les détails les plus anciens ont été allégés.':''}${saved?'':' ⚠️ Sauvegarde impossible (espace plein).'}`,saved?'ok':'err');
  } finally { footBusy=false; try{ render(); }catch(e){} }
}
let footBusy=false;

/* ---- agrégats ---- */
function footIdx(){
  if(_fidx) return _fidx;
  const T={}, P={}, mt=[];
  const mkT=(id,n,lo,co,lg)=>(T[id] ||= {id,n,lo,co,lg,g:0,w:0,d:0,ls:0,gf:0,ga:0,cs:0,btts:0,o25:0,fts:0,H:{g:0,w:0,d:0,ls:0,gf:0,ga:0},A:{g:0,w:0,d:0,ls:0,gf:0,ga:0},log:[],xn:0,sx:{},gfi:[0,0,0,0,0,0],gai:[0,0,0,0,0,0]});
  const LGS=Object.entries(foot.leagues).sort((a,b)=>isEU(a[0])-isEU(b[0]));
  for(const [lg,L] of LGS){
    for(const m of Object.values(L.matches)){ mt.push({...m,lg});
      mkT(m.hid,m.hn,m.hl,m.hc,lg); mkT(m.aid,m.an,m.al,m.ac,lg); (T[m.hid].comps ||= {})[lg]=1; (T[m.aid].comps ||= {})[lg]=1; }
  }
  const done=mt.filter(m=>m.done).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d));
  for(const m of done){
    for(const s of ['h','a']){
      const me=s==='h'?{id:m.hid,gf:m.hs,ga:m.as,opp:m.an,oid:m.aid}:{id:m.aid,gf:m.as,ga:m.hs,opp:m.hn,oid:m.hid}, t=T[me.id], res=me.gf>me.ga?'w':me.gf<me.ga?'l':'d', H=s==='h'?t.H:t.A;
      t.g++; t[res==='l'?'ls':res]++; t.gf+=me.gf; t.ga+=me.ga; if(me.ga===0) t.cs++; if(me.gf>0&&me.ga>0) t.btts++; if(me.gf+me.ga>2) t.o25++; if(me.gf===0) t.fts++;
      H.g++; H[res==='l'?'ls':res]++; H.gf+=me.gf; H.ga+=me.ga;
      t.log.push({mid:m.id,t:m.d,opp:me.opp,oid:me.oid,home:s==='h',gf:me.gf,ga:me.ga,res});
      if(m.x){ t.xn++; const ts=m.x.ts[s]; for(const k in ts) t.sx[k]=(t.sx[k]||0)+ts[k];
        for(const e of m.x.ev) if(e.t==='g'||e.t==='pg'||e.t==='og'){ const scorer=e.s; const b=Math.min(5,Math.max(0,Math.floor((Math.max(e.m,1)-1)/15))); if(scorer===s) t.gfi[b]++; else if(scorer) t.gai[b]++; } }
    }
    if(m.x) for(const s of ['h','a']){ const tid=s==='h'?m.hid:m.aid, tt=T[tid], opp=s==='h'?m.an:m.hn, res=(s==='h'?m.hs-m.as:m.as-m.hs);
      for(const p of m.x.pl[s]){ const pid=p.id; if(!pid) continue; const r=(P[pid] ||= {id:pid,n:p.n,pos:p.pos,pg:posGroup(p.pos),tid,tn:tt.n,tlo:tt.lo,tco:tt.co,lg:tt.lg,gp:0,gs:0,g:0,a:0,sh:0,sot:0,yc:0,rc:0,sv:0,gc:0,fc:0,fs:0,cs:0,log:[]});
        r.tid=tid; r.tn=tt.n; r.tlo=tt.lo; r.tco=tt.co; r.lg=tt.lg; if(p.pos) { r.pos=p.pos; r.pg=posGroup(p.pos); } r.n=p.n;
        (r.comps ||= {})[m.lg]=1; r.gp++; r.gs+=p.s; r.g+=p.g; r.a+=p.a; r.sh+=p.sh; r.sot+=p.sot; r.yc+=p.yc; r.rc+=p.rc; r.sv+=p.sv; r.gc+=p.gc; r.fc+=p.fc; r.fs+=p.fs; if(r.pg==='G'&&p.s&&((s==='h'?m.as:m.hs)===0)) r.cs++;
        r.log.push({mid:m.id,t:m.d,opp,home:s==='h',res:res>0?'w':res<0?'l':'d',sc:(s==='h'?m.hs+'-'+m.as:m.as+'-'+m.hs),g:p.g,a:p.a,sh:p.sh,sot:p.sot,yc:p.yc,rc:p.rc,sv:p.sv,s:p.s}); } }
  }
  for(const [lg0,L] of LGS) for(const r of L.standings){ if(T[r.id]){ if(!isEU(lg0)||!T[r.id].st) T[r.id].st=r; (T[r.id].comps ||= {})[lg0]=1; } else T[r.id]={comps:{[lg0]:1},id:r.id,n:r.name,lo:r.logo,co:'',lg:'',g:0,w:0,d:0,ls:0,gf:0,ga:0,cs:0,btts:0,o25:0,fts:0,H:{},A:{},log:[],xn:0,sx:{},gfi:[0,0,0,0,0,0],gai:[0,0,0,0,0,0],st:r}; }
  for(const [lg,L] of LGS) for(const r of L.standings){ if(T[r.id]&&(!isEU(lg)||!T[r.id].lg||isEU(T[r.id].lg))) T[r.id].lg=lg; }
  _fidx={T,P,mt,done};
  return _fidx;
}
const footTeamName=id=>{ const t=footIdx().T[id]; return t?t.n:id; };
const tlink=(id,n)=>`<span class="link" data-act="fteam" data-id="${esc(id)}">${esc(n||footTeamName(id))}</span>`;
const plink=(id,n)=>`<span class="link" data-act="fplayer" data-id="${esc(id)}">${esc(n)}</span>`;
const mlink=(m,txt)=>`<span class="link" data-act="fmatch" data-id="${esc(m.id)}">${txt}</span>`;
const footLogo=(u,n=20)=>u?`<img src="${esc(u)}" alt="" width="${n}" height="${n}" style="vertical-align:middle;margin-right:5px;object-fit:contain" loading="lazy" onerror="this.style.display='none'">`:'';
const footPhoto=id=>foot.ph[id]||(/^\d+$/.test(String(id))?`https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png`:'');
/* ---- Photos : sources de secours (Wikipédia, TheSportsDB) ---- */
const KEYPHX='suivi-foot-phx'; let phx=loadJ(KEYPHX,{}); const phQ=[], phBusy={}; let phRun=0;
const phSave=()=>{ try{ localStorage.setItem(KEYPHX,JSON.stringify(phx)); }catch(e){} };
const phJson=async(u)=>{ const c=new AbortController(), t=setTimeout(()=>c.abort(),8000); try{ const r=await fetch(u,{signal:c.signal}); if(!r.ok) return null; return await r.json(); }catch(e){ return null; } finally{ clearTimeout(t); } };
async function phLookup(name,team){
  const clean=String(name||'').trim(); if(!clean) return '';
  const isFoot=x=>/footbal|soccer|goalkeeper|midfielder|defender|striker|winger|forward/i.test(x||'');
  for(const q of [clean.replace(/ /g,'_'),clean.replace(/ /g,'_')+'_(footballer)']){
    const j=await phJson('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(q)+'?redirect=true');
    if(j&&j.thumbnail&&j.thumbnail.source&&j.type!=='disambiguation'&&isFoot((j.description||'')+' '+(j.extract||'').slice(0,160))) return j.thumbnail.source; }
  const j=await phJson('https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p='+encodeURIComponent(clean));
  const tk=nname(team).split(' ').filter(w=>w.length>=4);
  for(const p of ((j&&j.player)||[])){ if(p.strSport&&p.strSport!=='Soccer') continue; const tt=nname(p.strTeam); if(tk.length&&!tk.some(w=>tt.includes(w))) continue; const u=p.strCutout||p.strThumb||p.strRender; if(u) return u; }
  return '';
}
function footPhotoAlt(pid){
  pid=String(pid); const c=phx[pid]; if(c&&c.u) return Promise.resolve(c.u); if(c&&Date.now()-c.t<12*36e5) return Promise.resolve('');
  if(phBusy[pid]) return phBusy[pid];
  const p=(footIdx().P||{})[pid]; if(!p) return Promise.resolve('');
  return phBusy[pid]=new Promise(res=>{ phQ.push(async()=>{ let u=''; try{ u=await phLookup(p.n,p.tn); }catch(e){} phx[pid]={u,t:Date.now()}; phSave(); delete phBusy[pid]; res(u); }); phPump(); });
}
function phPump(){ while(phRun<3&&phQ.length){ const f=phQ.shift(); phRun++; f().finally(()=>{ phRun--; setTimeout(phPump,200); }); } }
function footImgFix(el){ const pid=el.getAttribute('data-pid'); if(!pid||el.getAttribute('data-tried')) { el.style.display='none'; return; } el.setAttribute('data-tried','1'); footPhotoAlt(pid).then(u=>{ if(u&&el.isConnected){ el.setAttribute('href',u); el.style.display=''; } else el.style.display='none'; }); }
const footAv=(id,name,color,size=28)=>{ const c=fcol(color), ph=footPhoto(id); return `<span class="av" style="width:${size}px;height:${size}px;font-size:${Math.max(9,Math.round(size*.38))}px;--tc:${c};--ink:${ink(c)}" data-ini="${esc(initials(name))}">${ph?`<img src="${esc(ph)}" data-pid="${esc(id)}" alt="" loading="lazy">`:esc(initials(name))}</span>`; };
const fstar=id=>`<span class="stars"><button class="star" data-act="footfav" data-id="${esc(id)}" title="${ffav.includes(id)?'Retirer des clubs favoris':'Ajouter aux clubs favoris'}">${ffav.includes(id)?'★':'☆'}</button>${bellBtn('foot',id)}</span>`;
const fpstar=id=>`<button class="star" data-act="footfavp" data-id="${esc(id)}" title="${ffavP.includes(id)?'Retirer des joueurs favoris':'Ajouter aux joueurs favoris'}">${ffavP.includes(id)?'★':'☆'}</button>`;
const fdots=(id,n=5)=>{ const t=footIdx().T[id]; const l=t?t.log.slice(-n):[]; return l.map(x=>`<span class="dot ${x.res}" title="${esc(x.home?'vs':'@')} ${esc(x.opp)} ${x.gf}-${x.ga}">${x.res==='w'?'V':x.res==='l'?'D':'N'}</span>`).join('')||'<span class="mut">–</span>'; };
const footLgSel=(id,cur,withAll=true,withMine=false)=>`<select id="${id}">${withAll?`<option value="" ${cur===''?'selected':''}>Tous les championnats</option>`:''}${FLG.map(([c,n])=>`<option value="${c}" ${cur===c?'selected':''}>${esc(n)}</option>`).join('')}${withMine?`<option value="mine" ${cur==='mine'?'selected':''}>★ Mes clubs</option>`:''}</select>`;
const footLgOrFirst=()=>ui.fLg&&ui.fLg!=='mine'?ui.fLg:(FLG.find(([c])=>foot.leagues[c])||FLG[0])[0];
function footMatches(){ const {mt}=footIdx(); const lg=ui.fLg; return mt.filter(m=>!lg||(lg==='mine'?(ffav.includes(m.hid)||ffav.includes(m.aid)):m.lg===lg)); }
const footWho=m=>`${footLogo(m.hl,18)}${esc(m.hn)}`;

/* ---- calcul d'un classement (domicile / extérieur / forme) ---- */
function footCalcTable(lg,mode){
  const {mt}=footIdx(), R={};
  const mk=(id,n,lo)=>(R[id] ||= {id,n,lo,H:{g:0,w:0,d:0,ls:0,gf:0,ga:0},A:{g:0,w:0,d:0,ls:0,gf:0,ga:0},log:[]});
  for(const m of mt.filter(x=>x.done&&x.lg===lg).sort((x,y)=>Date.parse(x.d)-Date.parse(y.d))){
    for(const s of ['h','a']){ const id=s==='h'?m.hid:m.aid, gf=s==='h'?m.hs:m.as, ga=s==='h'?m.as:m.hs, r=mk(id,s==='h'?m.hn:m.an,s==='h'?m.hl:m.al), res=gf>ga?'w':gf<ga?'ls':'d', B=s==='h'?r.H:r.A;
      B.g++; B[res]++; B.gf+=gf; B.ga+=ga; r.log.push({res:res==='ls'?'l':res,gf,ga}); } }
  return Object.values(R).map(t=>{
    let g,w,d,ls,gf,ga;
    if(mode==='H') ({g,w,d,ls,gf,ga}=t.H); else if(mode==='A') ({g,w,d,ls,gf,ga}=t.A);
    else { const l=t.log.slice(-5); g=l.length; w=l.filter(x=>x.res==='w').length; d=l.filter(x=>x.res==='d').length; ls=g-w-d; gf=l.reduce((s,x)=>s+x.gf,0); ga=l.reduce((s,x)=>s+x.ga,0); }
    return {id:t.id,n:t.n,lo:t.lo,g,w,d,ls,gf,ga,gd:gf-ga,pts:3*w+d};
  }).filter(r=>r.g>0).sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf);
}

/* ---- alertes ---- */
function footAlertItems(){
  const out=[], lim=Date.now()-8*864e5, {done,T,P}=footIdx();
  const add=(tid,name,k,icon,full,short,extra)=>out.push({tid,name,k,icon,full,short,...(extra||{})});
  for(const m of done){ if(Date.parse(m.d)<lim) continue;
    const sc=mlink(m,`${m.hs}-${m.as}`);
    for(const s of ['h','a']){ const tid=s==='h'?m.hid:m.aid, mine=ffav.includes(tid), gf=s==='h'?m.hs:m.as, ga=s==='h'?m.as:m.hs, me=s==='h'?m.hn:m.an, op=s==='h'?m.an:m.hn;
      if(mine){ if(gf-ga>=3) add(tid,me,'crush','💥',`${tlink(tid,me)} a <b>écrasé</b> ${esc(op)} (${sc}).`,`${esc(op)} (${sc})`);
        if(m.x&&m.x.ts[s].rc>0){ const r=m.x.ts[s].rc; add(tid,me,'rc','🟥',`${tlink(tid,me)} : <b>${r>1?r+' cartons rouges':'un carton rouge'}</b> contre ${esc(op)} (${sc}).`,`<b>${r>1?r+' cartons rouges':'Carton rouge'}</b> contre ${esc(op)} (${sc})`); } }
      if(m.x) for(const p of m.x.pl[s]){ const fav=ffavP.includes(p.id);
        if(p.g>=3&&(mine||fav)) add(tid,me,'hat','🎩',`${plink(p.id,p.n)} (${esc(me)}) a signé un <b>triplé</b> contre ${esc(op)} !`,`${plink(p.id,p.n)} : <b>triplé</b> contre ${esc(op)}`);
        else if(p.g>0&&fav) add(tid,me,'goal','⚽',`${plink(p.id,p.n)} (${esc(me)}) a marqué ${p.g>1?'<b>'+p.g+' buts</b>':'un but'} contre ${esc(op)} (${sc}).`,`${plink(p.id,p.n)} : ${p.g>1?'<b>'+p.g+' buts</b>':'un but'} contre ${esc(op)} (${sc})`);
        else if(p.a>=2&&fav) add(tid,me,'ast','🅰️',`${plink(p.id,p.n)} (${esc(me)}) : <b>${p.a} passes décisives</b> contre ${esc(op)}.`,`${plink(p.id,p.n)} : <b>${p.a} passes décisives</b> contre ${esc(op)}`); } }
  }
  for(const id of ffav){ const t=T[id]; if(!t||!t.log.length) continue; const l=t.log; let n=0,u=0,d=0;
    for(let i=l.length-1;i>=0&&l[i].res==='w';i--) n++; for(let i=l.length-1;i>=0&&l[i].res!=='l';i--) u++; for(let i=l.length-1;i>=0&&l[i].res==='l';i--) d++;
    if(n>=4) add(id,t.n,'streak','🏆',`${tlink(id,t.n)} : <b>${n} victoires</b> de suite.`,`${n} victoires de suite`,{chip:'w'}); else if(u>=6) add(id,t.n,'streak','🛡️',`${tlink(id,t.n)} : <b>${u} matchs sans défaite</b>.`,`${u} matchs sans défaite`,{chip:'w'});
    if(d>=3) add(id,t.n,'streak','⚠️',`${tlink(id,t.n)} : <b>${d} défaites</b> de suite.`,`${d} défaites de suite`,{chip:'l'}); }
  return out;
}
function footAlerts(){ return footAlertItems().map(i=>`${i.icon} ${i.full}`); }
/* carte « Alertes foot » : une ligne par club, plus de doublons */
function footAlertsCard(){
  const items=footAlertItems(); if(!items.length) return '';
  const {T}=footIdx(), G=new Map();
  for(const i of items){ if(!G.has(i.tid)) G.set(i.tid,{tid:i.tid,name:i.name,chips:[],lines:[],crush:[]}); const g=G.get(i.tid);
    if(i.chip) g.chips.push(i); else if(i.k==='crush') g.crush.push(i.short); else g.lines.push(i); }
  const rows=[...G.values()].map(g=>{ const t=T[g.tid], lo=t?footLogo(t.lo,30):'';
    const lines=(g.crush.length?[`<div class="fal-i"><span>💥</span><div>A écrasé ${g.crush.join(' et ')}</div></div>`]:[]).concat(g.lines.map(i=>`<div class="fal-i"><span>${i.icon}</span><div>${i.short}</div></div>`));
    return `<div class="fal"><div class="fal-h"><span class="fal-lg">${lo}</span><b>${tlink(g.tid,g.name)}</b><span class="fal-ch">${g.chips.map(c=>`<span class="fal-c ${c.chip}">${c.icon} ${esc(c.short)}</span>`).join('')}</span></div>${lines.join('')}</div>`; }).join('');
  return `<div class="card"><div class="row between"><h2 style="margin:0">🔔 Alertes foot <span class="mut" style="font-size:13px;font-weight:400">· ${items.length} · ${G.size} club${G.size>1?'s':''}</span></h2></div><div class="fal-list">${rows}</div></div>`;
}

/* ---- gros matchs foot ---- */
function footBig(max=6){
  const {mt,T,P}=footIdx(), now=Date.now()-3*36e5, lim=now+8*864e5, size={}, rk={};
  for(const [lg,L] of Object.entries(foot.leagues)){ size[lg]=L.standings.length; (rk[lg]={}); L.standings.forEach(r=>{ rk[lg][r.id]=r.rank; }); }
  const favPT=new Set(ffavP.map(id=>P[id]&&P[id].tid).filter(Boolean));
  return mt.filter(m=>!m.done&&Date.parse(m.d)>=now&&Date.parse(m.d)<=lim).map(m=>{ let sc=0; const tags=[], a=(rk[m.lg]||{})[m.hid], b=(rk[m.lg]||{})[m.aid], n=size[m.lg]||20;
    const fT=[m.hid,m.aid].filter(t=>ffav.includes(t)); if(fT.length){ sc+=3; tags.push('⭐ '+fT.map(footTeamName).join(' / ')); }
    const fP=[m.hid,m.aid].filter(t=>favPT.has(t)); if(fP.length){ sc+=2; tags.push('⭐ joueur favori'); }
    if(a&&b&&isEU(m.lg)){ if(a<=8&&b<=8){ sc+=3; tags.push('Choc de la phase de ligue ('+a+'e vs '+b+'e)'); } else if(a>n-8&&b>n-8){ sc+=1; tags.push('Duel pour survivre'); } }
    else if(a&&b){ if(a<=4&&b<=4){ sc+=3; tags.push('Choc du haut du classement ('+a+'e vs '+b+'e)'); } else if(a<=6&&b<=6){ sc+=2; tags.push('Duel pour l\'Europe'); } else if(a>n-5&&b>n-5){ sc+=1; tags.push('Duel du bas de tableau'); } }
    return {m,sc,tags}; }).filter(x=>x.sc>0).sort((x,y)=>y.sc-x.sc||Date.parse(x.m.d)-Date.parse(y.m.d)).slice(0,max);
}

/* ================= Foot : vues ================= */
function footControls(extra){
  const has=Object.keys(foot.leagues).length, nd=footIdx().mt.filter(m=>m.x).length, tot=footIdx().done.length;
  const dbg=foot.dbg?`<details style="margin-top:8px"><summary class="mut">🔧 Certains matchs n'ont pas de détails : diagnostic</summary><p class="mut">Copie ce texte et envoie-le-moi pour que j'adapte la lecture : <code>${esc(JSON.stringify(foot.dbg))}</code></p></details>`:'';
  const P=[['⚡','Rapide','2 semaines avant / après · ~1 min'],['📅','1 mois','1 mois avant, 3 semaines après · ~2 min'],['🗓️','Toute la saison','depuis août · plusieurs minutes']], cur=ui.fPer||0;
  const menu=ui.fMenu?`<div class="fmenu">${P.map(([ic,l,d],i)=>`<button class="${i===cur?'':'sec'}" data-act="footper" data-i="${i}"><b>${ic} ${l}</b><span>${d}</span></button>`).join('')}<button class="sec fmx" data-act="footmenu">Annuler</button></div>`:'';
  return `<div class="fbar"><button class="sec fbtn" data-act="footmenu" ${footBusy?'disabled':''}>${footBusy?'⏳ Actualisation…':'🔄 Actualiser'}</button><span class="mut">${tot} match${tot>1?'s':''} en mémoire · ${nd} détaillé${nd>1?'s':''}</span>${extra?`<span style="margin-left:auto">${extra}</span>`:''}</div>${menu}${has?'':`<div class="card"><p class="mut" style="margin:0">Aucune donnée. Clique sur « Actualiser » (lecture directe d'ESPN). Si le navigateur refuse : installe le <b>favori foot</b> (fichier bouton-favori-foot.html), va sur <b>espn.com/soccer</b>, clique sur le favori, puis reviens ici et fais <b>Ctrl+V</b>.</p></div>`}${dbg}`;
}
function footRow(m,showLg){
  const live=m.st==='in', pre=!m.done&&!live, hw=m.done&&m.hs>m.as, aw=m.done&&m.as>m.hs, mine=ffav.includes(m.hid)||ffav.includes(m.aid);
  const sc=pre?`<span class="mut"><span class="dfull">${esc(fmtDT(m.d))}</span><span class="dshort">${esc(fmtDS(m.d))}</span></span>`:`<b>${m.hs} - ${m.as}</b>${live?` <span class="err">🔴 ${esc(fLbl(m.sn,m.clk,m.per,m.det))}</span>`:''}`;
  const badges=(m.x?`${m.x.ev.some(e=>e.t==='rc')?' 🟥':''}${[...m.x.pl.h,...m.x.pl.a].some(p=>p.g>=3)?' 🎩':''}`:'')+(m.x?'':'');
  return `<tr class="click fmatch ${mine?'favrow':''}" data-act="fmatch" data-id="${esc(m.id)}">${showLg?`<td class="l mut hide-m">${esc(footLgName(m.lg))}</td>`:''}<td class="l ${hw?'win':''}">${footWho(m)}</td><td>${sc}${badges}${m.done?'':' '+mpickStar(m)}</td><td class="l ${aw?'win':''}">${footLogo(m.al,18)}${esc(m.an)}</td></tr>`;
}
function footLists(ms,n=15,showLg=false){
  const done=ms.filter(m=>m.done).sort((a,b)=>Date.parse(b.d)-Date.parse(a.d)).slice(0,n), up=ms.filter(m=>!m.done).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d)).slice(0,n);
  const t=a=>a.length?`<div class="scroll"><table><tbody>${a.map(m=>footRow(m,showLg)).join('')}</tbody></table></div>`:'<p class="mut">Aucun match.</p>';
  return `<div class="grid2"><div><h3>Derniers résultats</h3>${t(done)}</div><div><h3>Prochains matchs (heure locale)</h3>${t(up)}</div></div>`;
}
function footFavCards(){
  const {T}=footIdx();
  if(!ffav.length) return '<p class="mut">Aucun club favori : clique sur l\'étoile ☆ à côté d\'un club dans un classement.</p>';
  return `<div class="grid2">${ffav.map(id=>{ const t=T[id]; if(!t) return `<div class="mini"><b>Club ${esc(id)}</b><div class="mut">Données non chargées</div>${fstar(id)}</div>`;
    const st=t.st, ms=footIdx().mt.filter(m=>m.hid===id||m.aid===id).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d)), nx=ms.find(m=>!m.done), last=[...ms].reverse().find(m=>m.done), c=fcol(t.co||(st&&st.zone&&st.zone.c));
    return `<div class="mini" style="border-left:4px solid ${c}"><div class="row between"><b>${footLogo(t.lo,26)}${tlink(id,t.n)}</b>${fstar(id)}</div><div class="mut">${esc(footLgName(t.lg))}</div>${st?`<div class="big">${st.rank}<sup>e</sup> · ${st.pts} pts</div><div class="mut">${st.w}V ${st.d}N ${st.l}D · diff. ${st.gd>0?'+':''}${st.gd}</div>`:''}<div style="margin:6px 0">${fdots(id)}</div>${last?`<div class="mut">Dernier : ${mlink(last,`${esc(last.hn)} ${last.hs}-${last.as} ${esc(last.an)}`)}</div>`:''}${nx?`<div class="mut">Prochain : ${mlink(nx,`${esc(nx.hn)} - ${esc(nx.an)}`)} · ${esc(fmtDT(nx.d))}</div>`:''}</div>`; }).join('')}</div>`;
}
function footScorersTable(pl,key,lab,n=8){
  const top=pl.filter(p=>p[key]>0).sort((a,b)=>b[key]-a[key]||b.gp-a.gp).slice(0,n);
  const mx=top.length?top[0][key]:1;
  return top.length?`<div class="scl">${top.map((p,i)=>`<div class="scl-r"><span class="scl-n">${i+1}</span>${footAv(p.id,p.n,p.tco,38)}<div class="scl-i"><b>${plink(p.id,p.n)}</b><span class="mut">${esc(p.tn)}</span><div class="scl-b"><div style="width:${Math.round(p[key]/mx*100)}%"></div></div></div><span class="scl-v">${p[key]}<small>${p[key]>1?lab:lab.replace(/s$/,'')}</small></span></div>`).join('')}</div>`:'<p class="mut">–</p>';
}
function footLeadersFallback(lg){
  const L=foot.leagues[lg]; if(!L) return '';
  const best={}; Object.values(L.matches).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d)).forEach(m=>{ if(m.hsc) best[m.hid]={...m.hsc,tn:m.hn}; if(m.asc) best[m.aid]={...m.asc,tn:m.an}; });
  const top=Object.values(best).filter(x=>x.v>0).sort((a,b)=>b.v-a.v).slice(0,8);
  return top.length?`<table><tbody>${top.map((x,i)=>`<tr><td class="l">${i+1}. ${esc(x.n)} <span class="mut">${esc(x.tn)}</span></td><td><b>${x.v}</b> <span class="mut">but${x.v>1?'s':''}</span></td></tr>`).join('')}</tbody></table>`:'';
}

/* ---------- Accueil ---------- */

const FHOME_BLOCKS=[['alerts','Alertes sur mes clubs'],['tonight','Ce soir (heure de Paris)'],['clubs','Mes clubs'],['players','Mes joueurs'],['big','Gros matchs à venir'],['news','À la une'],['kpis','Chiffres clés'],['matches','Matchs'],['scorers','Meilleurs buteurs']];
const KEYFH='suivi-foot-home'; let fhomeCfg=loadJ(KEYFH,{order:FHOME_BLOCKS.map(b=>b[0]),hidden:[]});
function fhomeNorm(){ const ids=FHOME_BLOCKS.map(b=>b[0]); const o=(fhomeCfg.order||[]).filter(i=>ids.includes(i)); for(const i of ids) if(!o.includes(i)) o.push(i); return {order:o,hidden:(fhomeCfg.hidden||[]).filter(i=>ids.includes(i))}; }
function fhomeEditor(cfg){
  const lab=Object.fromEntries(FHOME_BLOCKS);
  return `<div class="card"><h2>Personnaliser l'accueil foot</h2><p class="mut">Coche les blocs à afficher et change leur ordre avec les flèches (mets tes blocs préférés en premier).</p>${cfg.order.map((id,i)=>`<div class="row hrow"><label><input type="checkbox" data-act="fhometoggle" data-id="${id}" ${cfg.hidden.includes(id)?'':'checked'}> ${esc(lab[id])}</label><button class="sec" data-act="fhomemove" data-id="${id}" data-d="-1" ${i===0?'disabled':''}>↑</button><button class="sec" data-act="fhomemove" data-id="${id}" data-d="1" ${i===cfg.order.length-1?'disabled':''}>↓</button></div>`).join('')}<div class="row" style="margin-top:10px"><button data-act="fhomeedit">Terminé</button><button class="sec" data-act="fhomereset">Tout réinitialiser</button></div></div>`;
}
function footHome(){
  const {mt,done,P}=footIdx(), pl=Object.values(P), lg=ui.fLg&&ui.fLg!=='mine'?ui.fLg:'';
  const cfg=fhomeNorm();
  let h=footControls(`${cfg.hidden.length?`<span class="mut">${cfg.hidden.length} bloc${cfg.hidden.length>1?'s':''} masqué${cfg.hidden.length>1?'s':''} · </span>`:''}<button class="sec fbtn" data-act="fhomeedit" title="Personnaliser l'accueil">⚙<span class="hide-m"> Personnaliser</span></button>`); const FB={};
  h+=multiBanner();
  if(!mt.length) return h;
  { const ac=footAlertsCard(); if(ac) FB.alerts=ac; }
  const nw=footNews(3); if(nw.length) FB.news=`<div class="card"><h2>📰 À la une</h2>${nw.map(n=>`<div class="alert"><b>${mlink(n.m,esc(n.r.title))}</b> <span class="mut" style="font-size:12px">· ${esc(footLgName(n.m.lg))} · ${n.age<1?'aujourd\'hui':n.age<2?'hier':'il y a '+Math.floor(n.age)+' j'}</span><div class="mut" style="margin-top:3px">${(()=>{ const t=n.r.paras[1]||n.r.paras[0]; if(t.length<=230) return t; const c=t.slice(0,230), i=c.lastIndexOf(' ; '); return (i>60?c.slice(0,i):c.replace(/\s+\S*$/,''))+' … <span class="link" data-act="fmatch" data-id="'+esc(n.m.id)+'">lire la suite</span>'; })()}</div></div>`).join('')}</div>`;
  const goals=done.reduce((s,m)=>s+m.hs+m.as,0);
  FB.kpis=`<div class="grid"><div class="kpi"><span class="mut">Matchs joués</span><b>${done.length}</b></div><div class="kpi"><span class="mut">Buts / match</span><b>${f1(fdiv(goals,done.length))}</b></div><div class="kpi"><span class="mut">Championnats</span><b>${Object.keys(foot.leagues).length}</b></div><div class="kpi"><span class="mut">Joueurs suivis</span><b>${pl.length}</b></div></div>`;
  FB.tonight=tonightFoot();
  FB.clubs=`<div class="card"><h2>⭐ Mes clubs</h2>${footFavCards()}</div>`;
  const bg=footBig(); if(bg.length) FB.big=`<div class="card"><h2>🔥 À ne pas manquer (8 prochains jours)</h2>${bg.map(i=>`<div class="alert"><b>${mlink(i.m,`${footLogo(i.m.hl,18)}${esc(i.m.hn)} - ${footLogo(i.m.al,18)}${esc(i.m.an)}`)}</b> <span class="mut">${esc(footLgName(i.m.lg))} · ${esc(fmtDT(i.m.d))}</span><br>${i.tags.map(t=>`<span class="chip">${esc(t)}</span>`).join(' ')}</div>`).join('')}</div>`;
  if(ffavP.length){ FB.players=`<div class="card"><h2>⭐ Mes joueurs</h2><div class="scroll"><table><thead><tr><th class="l">Joueur</th><th>MJ</th><th>Buts</th><th>PD</th><th>Tirs</th></tr></thead><tbody>${ffavP.map(id=>{ const p=P[id]; return p?`<tr><td class="l">${fpstar(id)}${footAv(p.id,p.n,p.tco,24)}${plink(p.id,p.n)} <span class="mut">${esc(p.tn)}</span></td><td>${p.gp}</td><td><b>${p.g}</b></td><td>${p.a}</td><td>${p.sh}</td></tr>`:`<tr><td class="l">${esc(id)}</td><td colspan="4" class="mut">pas encore de stats</td></tr>`; }).join('')}</tbody></table></div></div>`; }
  FB.matches=`<div class="card"><div class="row between"><h2 style="margin:0">Matchs</h2>${footLgSel('fLg',ui.fLg,true,true)}</div>${footLists(footMatches(),8,!ui.fLg||ui.fLg==='mine')}</div>`;
  const sc=lg?pl.filter(p=>inLg(p,lg)):pl;
  FB.scorers=`<div class="card"><h2>Meilleurs buteurs ${lg?'— '+esc(footLgName(lg)):''}</h2>${sc.length?`<div class="grid2"><div><h3>Buts</h3>${footScorersTable(sc,'g','buts',6)}</div><div><h3>Passes décisives</h3>${footScorersTable(sc,'a','PD',6)}</div></div>`:(lg?footLeadersFallback(lg):'')||'<p class="mut">Les buteurs apparaissent après le chargement des détails des matchs (bouton Actualiser).</p>'}</div>`;
  h+=heroFoot(done);
  h+=ui.fHomeEdit?fhomeEditor(cfg):'';
  for(const id of cfg.order) if(!cfg.hidden.includes(id)&&FB[id]) h+=FB[id];
  return h;
}

/* ---------- Matchs ---------- */
function footMatchesView(){
  const {mt}=footIdx(); let ms=footMatches();
  const w=ui.fWhen||'all'; if(w==='done') ms=ms.filter(m=>m.done); else if(w==='up') ms=ms.filter(m=>!m.done);
  if(ui.fTeamF) ms=ms.filter(m=>m.hid===ui.fTeamF||m.aid===ui.fTeamF);
  const teams=[...new Map(footMatches().flatMap(m=>[[m.hid,m.hn],[m.aid,m.an]])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  ms=[...ms].sort((a,b)=>(Date.parse(a.d)-Date.parse(b.d))*(w==='up'?1:-1));
  const lim=ui.fLimit||60, shown=ms.slice(0,lim);
  const dkf=m=>new Date(m.d).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'});
  const days=[]; for(const m of shown){ const k=dkf(m); let d=days[days.length-1]; if(!d||d.k!==k){ d={k,ms:[]}; days.push(d); } d.ms.push(m); }
  const mineM=m=>ffav.includes(m.hid)||ffav.includes(m.aid);
  const tileF=m=>{ const live=m.st==='in', pre=!m.done&&!live, hw=m.done&&m.hs>m.as, aw=m.done&&m.as>m.hs, mn=mineM(m);
    const st=live?`<span class="err">🔴 ${esc(fLbl(m.sn,m.clk,m.per,m.det))}</span>`:pre?esc(parisT(m.d)):'TERMINÉ';
    const side=(logo,n,sc,lose)=>`<div class="gt-side ${lose?'lose':''}"><span class="gt-t">${footLogo(logo,26)}<b>${esc(n)}</b></span><span class="gt-sc">${pre?'<span class="mut">–</span>':sc}</span></div>`;
    const badges=(m.x?`${m.x.ev.some(e=>e.t==='rc')?' 🟥':''}${[...m.x.pl.h,...m.x.pl.a].some(p=>p.g>=3)?' 🎩':''}`:'');
    const bg=stuFootBig(m); return `<div class="gt-tile click ${mn?'fv':''} ${bg?'big':''}" data-act="fmatch" data-id="${esc(m.id)}">${bg?`<div class="bigtag">🔥 ${esc(bg)}</div>`:''}<div class="gt-top"><span>${st}${badges}</span><span>${mn?'⭐ ':''}${pre?mpickStar(m):''}</span></div>${side(m.hl,m.hn,m.hs,aw)}${side(m.al,m.an,m.as,hw)}</div>`; };
  const lineF=m=>{ const live=m.st==='in', pre=!m.done&&!live, hw=m.done&&m.hs>m.as, aw=m.done&&m.as>m.hs, mn=mineM(m);
    const mid=pre?`<span class="mut" style="font-size:13px">${esc(parisT(m.d))}</span>`:`<span class="${aw?'lose':''}">${m.hs}</span><i>–</i><span class="${hw?'lose':''}">${m.as}</span>`;
    const bg=stuFootBig(m); return `<div class="gt-line gtf click ${mn?'fv':''} ${bg?'big':''}" data-act="fmatch" data-id="${esc(m.id)}" ${bg?`title="${esc(bg)}"`:''}><span class="gt-l ${aw?'lose':''}"><b>${bg?'🔥 ':''}${esc(m.hn)}</b>${footLogo(m.hl,22)}</span><span class="gt-m">${mid}${live?' <span class="err" style="font-size:11px">🔴</span>':''}</span><span class="gt-r ${hw?'lose':''}">${footLogo(m.al,22)}<b>${esc(m.an)}</b></span></div>`; };
  const showLgH=!ui.fLg||ui.fLg==='mine';
  const grp=arr=>{ const o=[]; for(const m of arr){ let g=o.find(x=>x.lg===m.lg); if(!g){ g={lg:m.lg,ms:[]}; o.push(g); } g.ms.push(m); } return o; };
  const body=days.map((d,i)=>`<div class="gt-day" style="text-transform:capitalize">${esc(d.k)} <span class="mut" style="text-transform:none">· ${d.ms.length} match${d.ms.length>1?'s':''}</span></div>`+(i===0?grp(d.ms).map(g=>`${showLgH?`<div class="gt-lg"><i></i>${esc(footLgName(g.lg))}</div>`:''}<div class="gt-grid">${g.ms.map(tileF).join('')}</div>`).join(''):`<div class="gt-list">${d.ms.map(lineF).join('')}</div>`)).join('');
  const rows=body;
  return footControls()+`<div class="card"><div class="row" style="margin-bottom:10px">${footLgSel('fLg',ui.fLg,true,true)}<select id="fTeamF"><option value="">Tous les clubs</option>${teams.map(([id,n])=>`<option value="${esc(id)}" ${ui.fTeamF===id?'selected':''}>${esc(n)}</option>`).join('')}</select><select id="fWhen"><option value="all" ${w==='all'?'selected':''}>Tous</option><option value="done" ${w==='done'?'selected':''}>Joués</option><option value="up" ${w==='up'?'selected':''}>À venir</option></select></div><p class="mut" style="margin:0 0 8px">${ms.length} match(s) · clique sur un match pour le détail · 🟥 carton rouge · 🎩 triplé</p>${rows||'<p class="empty">Aucun match.</p>'}${ms.length>lim?`<div style="margin-top:8px"><button class="sec" data-act="fmore">Afficher plus</button></div>`:''}</div>`;
}

/* ---------- Fiche match ---------- */
function footStatBars(m){
  const x=m.x; if(!x) return ''; const [ca,cb]=pickColors([fcol(m.hc),fcol(m.ac)]);
  const rows=[['Possession (%)','poss'],['Tirs','sh'],['Tirs cadrés','sot'],['Corners','cor'],['Fautes','fl'],['Cartons jaunes','yc'],['Cartons rouges','rc'],['Hors-jeu','off'],['Arrêts','sv'],['Passes réussies','pasA'],['Interceptions','int']].filter(([,k])=>x.ts.h[k]!=null||x.ts.a[k]!=null);
  if(!rows.length) return '';
  return `<h3>Statistiques du match</h3>`+rows.map(([l,k])=>{ const a=x.ts.h[k]||0,b=x.ts.a[k]||0,mx=Math.max(a,b)||1; return `<div class="cmp"><div class="cv ${a>b?'win':''}">${a}</div><div class="cb l"><i class="${a>=b?'w':''}" style="width:${a/mx*100}%;background:${ca}"></i></div><div class="cl" style="font-size:11px">${l}</div><div class="cb r"><i class="${b>=a?'w':''}" style="width:${b/mx*100}%;background:${cb}"></i></div><div class="cv ${b>a?'win':''}">${b}</div></div>`; }).join('');
}
/* ---------- Résumés de match en français (sans IA : phrases construites à partir des données) ---------- */
const frDe=n=>/^Le /.test(n)?'du '+n.slice(3):/^Les /.test(n)?'des '+n.slice(4):/^[AEIOUÉÈÂÎHaeiouéèh]/.test(n)?"d'"+n:'de '+n;
const frA=n=>/^Le /.test(n)?'au '+n.slice(3):/^Les /.test(n)?'aux '+n.slice(4):'à '+n;
const hashN=str=>{ let h=0; for(const c of String(str)) h=(h*31+c.charCodeAt(0))>>>0; return h; };
const pickV=(id,arr,salt=0)=>arr[(hashN(id)+salt)%arr.length];
const JOURS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
function footRecap(m){
  if(!m.done) return null; const x=m.x, id=String(m.id), {T}=footIdx();
  const win=m.hs>m.as?'h':m.hs<m.as?'a':'', W=win==='h'?m.hn:win==='a'?m.an:'', Lz=win==='h'?m.an:win==='a'?m.hn:'', diff=Math.abs(m.hs-m.as), tot=m.hs+m.as;
  const evs=x?(x.ev||[]):[], goals=[]; let sh=0,sa=0; const cnt={};
  for(const e of evs){ if(!(e.t==='g'||e.t==='pg'||e.t==='og')||!(e.s==='h'||e.s==='a')) continue; const bh=e.s==='h'?sh-sa:sa-sh; if(e.s==='h') sh++; else sa++; const k=e.p+'|'+e.s; cnt[k]=(cnt[k]||0)+1; goals.push({e,s:e.s,bh,ah:bh+1,sh,sa,n:e.t==='og'?0:cnt[k]}); }
  // récit
  let comeback=false, lateWin=false, dg=null;
  if(win&&goals.length){ const dif=g=>win==='h'?g.sh-g.sa:g.sa-g.sh; comeback=goals.some(g=>dif(g)<0); let k=-1; goals.forEach((g,i)=>{ if(dif(g)<=0) k=i; }); dg=goals[k+1]||null; lateWin=!!dg&&dg.e.m>=85&&diff===1; }
  // titre
  let title; const sc=win?`${Math.max(m.hs,m.as)}-${Math.min(m.hs,m.as)}`:`${m.hs}-${m.as}`;
  if(!win) title=tot===0?pickV(id,[`Rien pour personne entre ${m.hn} et ${m.an}`,`${m.hn} et ${m.an} se neutralisent sans but`]):pickV(id,[`${m.hn} et ${m.an} se quittent dos à dos (${sc})`,`Match nul spectaculaire entre ${m.hn} et ${m.an} (${sc})`.replace('spectaculaire',tot>=4?'spectaculaire':'équilibré')]);
  else if(comeback&&diff<=2) title=pickV(id,[`${W} renverse ${Lz} (${sc})`,`Belle remontée de ${W} face ${frA(Lz).replace(/^à /,'à ')} (${sc})`]);
  else if(lateWin) title=pickV(id,[`${W} s'impose dans les dernières minutes (${sc})`,`${W} arrache la victoire face ${frA(Lz).replace(/^à /,'à ')} (${sc})`]);
  else if(diff>=3) title=pickV(id,[`${W} écrase ${Lz} (${sc})`,`Démonstration de ${W} face ${frA(Lz).replace(/^à /,'à ')} (${sc})`,`${W} frappe fort : ${sc} contre ${Lz}`]);
  else title=pickV(id,[`${W} s'impose face ${frA(Lz).replace(/^à /,'à ')} (${sc})`,`${W} prend le meilleur sur ${Lz} (${sc})`,`Victoire ${frDe(W)} contre ${Lz} (${sc})`]);
  const P=[];
  // contexte
  const d=new Date(m.d), jour=isNaN(d)?'':JOURS[d.getDay()], ven=m.ven||(x&&x.ven), att=x&&x.att;
  P.push(`${esc(footLgName(m.lg))}${jour?`, ${jour} ${fmtD(m.d)}`:''} : ${esc(m.hn)} recevait ${esc(m.an)}${ven?` ${/^(Stade|Allianz|Parc|Vélodrome|Groupama)/.test(ven)?'au':'à'} ${esc(ven)}`:''}${att?`, devant ${att.toLocaleString('fr-FR')} spectateurs`:''}. Score final : <b>${m.hs}-${m.as}</b>.`);
  // buts
  if(goals.length){ const tn=s=>s==='h'?m.hn:m.an, ts=goals.map(g=>{ const e=g.e, team=tn(g.s), who=e.p||'un joueur', mn=e.ms||(e.m+"'"), asst=e.p2&&e.t==='g'?`, passe ${frDe(e.p2)}`:'', pen=e.t==='pg'?' sur penalty':'';
      let verb; const tie=g.ah===0, first=g.sh+g.sa===1, ownN=g.s==='h'?g.sh:g.sa;
      if(e.t==='og') return `${who} marque contre son camp (${mn}) et offre un but à ${team}`;
      if(g.n===3) return `${who} signe un triplé${pen} (${mn})`; if(g.n===2) return `${who} s'offre un doublé${pen} (${mn}${asst})`;
      if(first) verb=`ouvre le score pour ${team}`; else if(tie) verb=`égalise pour ${team}`; else if(g.bh<0) verb=`réduit l'écart pour ${team}`; else if(g.bh===0) verb=`redonne l'avantage à ${team}`; else if(ownN===2&&g.bh===1) verb=`double la mise pour ${team}`; else verb=pickV(id,[`creuse l'écart pour ${team}`,`enfonce le clou pour ${team}`,`aggrave le score pour ${team}`],g.sh+g.sa);
      return `${who} ${verb}${pen} (${mn}${asst})`; });
    P.push(`Le déroulé : ${ts.join(' ; ')}.`); }
  else if(x&&tot===0) P.push(`Aucun but dans cette rencontre.`);
  // moment clé
  const bits=[];
  if(dg&&win){ bits.push(comeback?`Le tournant du match : ${esc(W)} passe devant pour de bon à la ${esc(dg.e.ms||dg.e.m+"'")} (${dg.sh}-${dg.sa})${comeback?' après avoir été mené':''}.`:(dg.e.m>=85?`${esc(W)} fait la différence tout à la fin, à la ${esc(dg.e.ms||dg.e.m+"'")} (${dg.sh}-${dg.sa}).`:`${esc(W)} ouvre la voie à la ${esc(dg.e.ms||dg.e.m+"'")} et ne lâche plus l'avantage.`)); }
  const reds=evs.filter(e=>e.t==='rc'); if(reds.length) bits.push(`${reds.map(e=>`${esc(e.p||'Un joueur')} (${e.s==='h'?esc(m.hn):esc(m.an)}, ${esc(e.ms||e.m+"'")})`).join(' et ')} ${reds.length>1?'sont exclus':'est exclu'}, ce qui change la physionomie de la fin de match.`);
  if(bits.length) P.push(bits.join(' '));
  // stats
  if(x&&x.ts&&x.ts.h&&x.ts.a){ const h=x.ts.h, a=x.ts.a, st=[]; const ph=h.poss, pa=a.poss;
    if(ph&&pa){ const dom=ph>=pa?m.hn:m.an, dp=Math.max(ph,pa); st.push(`${esc(dom)} a dominé la possession (${dp.toFixed(0)} %)`); }
    if(h.sh!=null&&a.sh!=null) st.push(`${h.sh} tirs (${h.sot||0} cadrés) pour ${esc(m.hn)} contre ${a.sh} (${a.sot||0}) pour ${esc(m.an)}`);
    if(h.cor!=null&&a.cor!=null) st.push(`${h.cor}-${a.cor} aux corners`);
    if(h.yc!=null) { const y=(h.yc||0)+(a.yc||0); st.push(y?`${y} carton${y>1?'s':''} jaune${y>1?'s':''}`:'aucun carton jaune'); }
    let note=''; if(ph&&pa&&win){ const wp=win==='h'?ph:pa; if(wp<45) note=` ${esc(W)} s'est montré plus réaliste avec moins de ballon.`; else if(wp>58&&diff>=1) note=` ${esc(W)} a justifié sa victoire par sa maîtrise.`; }
    P.push(`Dans les chiffres : ${st.join(', ')}.${note}`); }
  // homme du match
  if(x&&x.pl){ const all=['h','a'].flatMap(s=>x.pl[s].map(p=>({...p,s}))); const sco=p=>4*p.g+2*p.a+.6*p.sot+.3*p.sh+(p.sv||0)*.5+(p.rc?-3:0)+(((p.s==='h'?m.as:m.hs)===0&&p.pos==='G'&&p.s)?2:0);
    const best=all.sort((u,v)=>sco(v)-sco(u))[0]; if(best&&sco(best)>=3){ const parts=[]; if(best.g) parts.push(`${best.g} but${best.g>1?'s':''}`); if(best.a) parts.push(`${best.a} passe${best.a>1?'s':''} décisive${best.a>1?'s':''}`); if(best.sv>=4) parts.push(`${best.sv} arrêts`); if(!parts.length&&best.sot) parts.push(`${best.sot} tir${best.sot>1?'s':''} cadré${best.sot>1?'s':''}`);
      P.push(`⭐ <b>Homme du match (d'après les statistiques)</b> : ${plink(best.id,best.n)} (${esc(best.s==='h'?m.hn:m.an)})${parts.length?` — ${parts.join(', ')}`:''}.`); } }
  // séries
  const serie=[]; for(const sd of ['h','a']){ const tid=sd==='h'?m.hid:m.aid, t=T[tid]; if(!t) continue; const i=t.log.findIndex(z=>z.mid===m.id); if(i<0) continue; const nm=sd==='h'?m.hn:m.an; let w=0,u=0,l=0; for(let j=i;j>=0&&t.log[j].res==='w';j--) w++; for(let j=i;j>=0&&t.log[j].res!=='l';j--) u++; for(let j=i;j>=0&&t.log[j].res==='l';j--) l++;
    if(w>=3) serie.push(`${esc(nm)} enchaîne une ${w}e victoire de suite`); else if(l>=3) serie.push(`${esc(nm)} s'enfonce avec une ${l}e défaite de suite`); else if(u>=6) serie.push(`${esc(nm)} reste invaincu depuis ${u} matchs`);
    const isLast=t.log[t.log.length-1].mid===m.id, st=t.st; if(isLast&&st&&m.lg===t.lg) serie.push(`${esc(nm)} occupe désormais la ${st.rank}${st.rank===1?'re':'e'} place (${st.pts} pts)`); }
  if(serie.length) P.push(serie.join(' ; ')+'.');
  return {title,paras:P,score:(diff>=3?3:0)+(comeback?3:0)+(lateWin?2:0)+Math.min(4,tot)+(reds.length?1:0)};
}
function footRecapHtml(m){ const r=footRecap(m); if(!r) return ''; return `<div class="card" style="background:var(--field);margin:10px 0"><h3 style="margin:0 0 6px">📰 ${esc(r.title)}</h3>${r.paras.map(t=>`<p style="margin:6px 0">${t}</p>`).join('')}<p class="mut" style="margin:6px 0 0;font-size:11px">Texte généré automatiquement à partir des données du match. · <a href="https://translate.google.com/translate?sl=en&tl=fr&u=${encodeURIComponent('https://www.espn.com/soccer/match/_/gameId/'+m.id)}" target="_blank" rel="noopener">Page ESPN du match, traduite en français ↗</a></p></div>`; }
function footNews(max=3){
  const {done}=footIdx(), now=Date.now(), lim=now-8*864e5;
  return done.filter(m=>Date.parse(m.d)>=lim&&m.x).map(m=>{ const r=footRecap(m), age=(now-Date.parse(m.d))/864e5, fav=(ffav.includes(m.hid)||ffav.includes(m.aid))?4:0; return {m,r,age,sc:r.score+fav+Math.max(0,12-age*4)}; }).sort((a,b)=>b.sc-a.sc||Date.parse(b.m.d)-Date.parse(a.m.d)).slice(0,max);
}
/* ---------- Frise du match ---------- */
function footFrise(m){
  const x=m.x; if(!x||!x.ev) return '';
  const ev=x.ev.filter(e=>(e.s==='h'||e.s==='a')&&e.t!=='') ; if(!ev.length) return '';
  const maxM=Math.max(90,...ev.map(e=>e.m||0)), W=640, H=230, L=18, R=18, AX=118, X=mi=>L+(W-L-R)*Math.min(Math.max(mi,0),maxM)/maxM;
  const lvl={h:[],a:[]}, items=[]; let sh=0,sa=0; const goals=[];
  for(const e of ev){ const mi=e.m||0; let lv=0; const arr=lvl[e.s]; while(arr[lv]!=null&&mi-arr[lv]<5) lv++; arr[lv]=mi;
    let score=''; if(e.t==='g'||e.t==='pg'||e.t==='og'){ if(e.s==='h') sh++; else sa++; score=sh+'-'+sa; goals.push({e,mi,sh,sa}); }
    items.push({e,mi,lv,score}); }
  const hc=pickColors([fcol(m.hc),fcol(m.ac)]);
  const last=s=>String(s||'').trim().split(/\s+/).slice(-1)[0];
  const sym=(it,cx,cy)=>{ const e=it.e, tt=(e.p||e.tx||'')+(e.t==='sub'&&e.p2?' ↔ '+e.p2:'');
    const tip=`<title>${esc((e.ms||(it.mi+"'"))+' — '+({g:'But',pg:'But (pen.)',og:'But contre son camp',yc:'Carton jaune',rc:'Carton rouge',sub:'Changement'}[e.t]||'')+(tt?' : '+tt:''))}</title>`;
    if(e.t==='yc') return `<g>${tip}<rect x="${cx-4}" y="${cy-6}" width="8" height="12" rx="1.5" fill="#ffd43b"/></g>`;
    if(e.t==='rc') return `<g>${tip}<rect x="${cx-4}" y="${cy-6}" width="8" height="12" rx="1.5" fill="#e5484d"/></g>`;
    if(e.t==='sub') return `<g opacity=".55">${tip}<text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="11" style="fill:var(--acc)">⇄</text></g>`;
    return `<g>${tip}<circle cx="${cx}" cy="${cy}" r="9" style="fill:var(--card);stroke:${e.t==='og'?'#e5484d':'var(--txt)'}" stroke-width="1.6"/><text x="${cx}" y="${cy+4.5}" text-anchor="middle" font-size="12">⚽</text></g>`; };
  let g=''; for(const t of [0,15,30,45,60,75,90].filter(v=>v<=maxM)) g+=`<line x1="${X(t)}" x2="${X(t)}" y1="${AX-4}" y2="${AX+4}" style="stroke:var(--mut)"/><text x="${X(t)}" y="${AX+18}" text-anchor="middle" font-size="10" style="fill:var(--mut)">${t}'</text>`;
  g+=`<line x1="${X(45)}" x2="${X(45)}" y1="22" y2="${H-22}" stroke-dasharray="3 4" style="stroke:var(--line)"/><text x="${X(45)}" y="14" text-anchor="middle" font-size="10" style="fill:var(--mut)">mi-temps</text>`;
  let body=''; const sorted=[...items].sort((a,b)=>({sub:0,yc:1,rc:1,g:2,pg:2,og:2}[a.e.t]||0)-({sub:0,yc:1,rc:1,g:2,pg:2,og:2}[b.e.t]||0));
  for(const it of sorted){ const cx=X(it.mi), up=it.e.s==='h', cy=up?AX-20-it.lv*20:AX+20+it.lv*20+10-(it.lv?0:0);
    body+=`<line x1="${cx}" x2="${cx}" y1="${AX}" y2="${cy+(up?10:-10)}" style="stroke:var(--line)"/>`+sym(it,cx,cy);
    if(it.score){ const ty=up?cy-14:cy+22, an=cx>W-50?'end':cx<50?'start':'middle'; body+=`<text x="${cx}" y="${ty}" text-anchor="${an}" font-size="10" font-weight="700" style="fill:var(--txt)">${esc(it.score)}</text>`; if(it.e.p) body+=`<text x="${cx}" y="${up?ty-11:ty+11}" text-anchor="${an}" font-size="9" style="fill:var(--mut)">${esc(last(it.e.p))}</text>`; } }
  const bar=`<line x1="${L}" x2="${W-R}" y1="${AX}" y2="${AX}" stroke-width="3" stroke-linecap="round" style="stroke:var(--line)"/>`;
  const names=`<text x="${L}" y="${H-4}" font-size="11" font-weight="700" fill="${hc[0]}">▲ ${esc(m.hn)}</text><text x="${W-R}" y="${H-4}" font-size="11" font-weight="700" text-anchor="end" fill="${hc[1]}">▼ ${esc(m.an)}</text>`;
  // but décisif
  let note='';
  if(m.done&&m.hs!==m.as&&goals.length){ const win=m.hs>m.as?'h':'a'; const dif=gl=>win==='h'?gl.sh-gl.sa:gl.sa-gl.sh; let k=-1; goals.forEach((gl,i)=>{ if(dif(gl)<=0) k=i; }); const dg=goals[k+1];
    if(dg){ const w=win==='h'?m.hn:m.an; note=`<p class="mut" style="margin:4px 0 0">🔑 ${k<0?`${esc(w)} ouvre le score et ne lâche plus l'avantage`:`Le match bascule : ${esc(w)} passe devant pour de bon`} à la <b>${esc(dg.e.ms||dg.mi+"'")}</b> (${dg.sh}-${dg.sa}${dg.e.p?`, ${esc(dg.e.p)}`:''}).</p>`; } }
  else if(m.done&&m.hs===m.as&&goals.length) note=`<p class="mut" style="margin:4px 0 0">🤝 Match nul : l'égalisation décisive tombe à la <b>${esc(goals[goals.length-1].e.ms||goals[goals.length-1].mi+"'")}</b>.</p>`;
  return `<h3>Frise du match</h3><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Frise du match">${g}${bar}${body}${names}</svg><div class="legend"><span>⚽ but</span><span><i style="background:#ffd43b"></i>carton jaune</span><span><i style="background:#e5484d"></i>carton rouge</span><span>⇄ changement</span></div>${note}`;
}
function footTimeline(m){
  const x=m.x; if(!x||!x.ev.length) return '';
  const ic={g:'⚽',pg:'⚽ (pen.)',og:'⚽ (c.s.c.)',yc:'🟨',rc:'🟥',sub:'🔁'};
  return `<h3>Déroulé du match</h3><div class="scroll"><table><tbody>${x.ev.map(e=>{ const txt=e.t==='sub'?esc(e.p?`${e.p}${e.p2?' ↔ '+e.p2:''}`:e.tx):`<b>${esc(e.p||e.tx)}</b>${e.t==='g'&&e.p2?` <span class="mut">(passe : ${esc(e.p2)})</span>`:''}`, cell=`${ic[e.t]} ${txt}`;
    return `<tr><td class="l" style="width:46%;text-align:right">${e.s==='h'?cell:''}</td><td style="width:8%"><span class="tlm">${esc(e.ms||e.m+"'")}</span></td><td class="l" style="width:46%">${e.s==='a'?cell:''}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function footLineup(m,s){
  const pl=(m.x&&m.x.pl[s])||[]; if(!pl.length) return '';
  const name=s==='h'?m.hn:m.an, tid=s==='h'?m.hid:m.aid, co=s==='h'?m.hc:m.ac, fm=m.x.fm[s];
  const row=p=>`<tr><td class="l">${esc(p.jn)} ${footAv(p.id,p.n,co,22)}${plink(p.id,p.n)} <span class="mut">${esc(p.pos)}</span></td><td>${p.g||''}</td><td>${p.a||''}</td><td>${p.sh?p.sh+'/'+p.sot:''}</td><td>${p.yc?'🟨':''}${p.rc?'🟥':''}</td><td>${p.sv||''}</td></tr>`;
  const st=pl.filter(p=>p.s), bn=pl.filter(p=>!p.s);
  return `<div><h3 style="border-left:4px solid ${fcol(co)};padding-left:8px">${tlink(tid,name)}${fm?` <span class="mut">${esc(fm)}</span>`:''}</h3><div class="scroll"><table><thead><tr><th class="l">Joueur</th><th>B</th><th>PD</th><th>Tirs</th><th>Cart.</th><th>Arr.</th></tr></thead><tbody>${st.map(row).join('')}${bn.length?`<tr><td class="l mut" colspan="6">Remplaçants utilisés</td></tr>${bn.map(row).join('')}`:''}</tbody></table></div></div>`;
}

/* ---- Résumé de match rédigé par IA (Google Gemini), à partir du live écrit ESPN ---- */
const KEYAI='suivi-ai-key', KEYAIM='suivi-ai-model', KEYRS='suivi-resumes';
let aiKey=(()=>{ try{ return localStorage.getItem(KEYAI)||''; }catch(e){ return ''; } })(), aiDraft='';
let resumes=loadJ(KEYRS,{}); const resBusy={}, resErr={};
const AIMODELS=['gemini-flash-latest','gemini-3.6-flash','gemini-3.5-flash','gemini-2.5-flash','gemini-2.0-flash'];
function resSave(){ const ks=Object.keys(resumes).sort((a,b)=>(resumes[b].at||0)-(resumes[a].at||0)); for(const k of ks.slice(80)) delete resumes[k]; saveJ(KEYRS,resumes); }
let aiModels=null;
async function aiPickModels(){
  if(aiModels) return aiModels; let r;
  try{ r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(aiKey)}`); }
  catch(e){ const er=new Error('Impossible de joindre Google Gemini depuis l\'app.'); er.det='liste des modèles : '+(e.message||e); throw er; }
  const j=await r.json().catch(()=>({}));
  if(!r.ok){ const msg=(j.error&&j.error.message)||('HTTP '+r.status); if(r.status===400||r.status===401||r.status===403){ const e=new Error('Google refuse la clé : vérifie que tu l\'as copiée en entier.'); e.key=1; e.det=msg; throw e; } const e=new Error('Gemini indisponible pour le moment.'); e.det=msg; throw e; }
  const names=(j.models||[]).filter(x=>(x.supportedGenerationMethods||[]).includes('generateContent')).map(x=>String(x.name||'').replace(/^models\//,''));
  const ok=n=>/^gemini-([\d.]+-)?flash(-latest)?$/.test(n), ver=n=>parseFloat((n.match(/gemini-([\d.]+)/)||[])[1]||'0');
  const best=names.filter(ok).sort((a,b)=>(b==='gemini-flash-latest')-(a==='gemini-flash-latest')||ver(b)-ver(a));
  const lite=names.filter(n=>/^gemini-[\d.]+-flash-lite$/.test(n)).sort((a,b)=>ver(b)-ver(a));
  aiModels=[...best,...lite]; if(!aiModels.length) aiModels=AIMODELS.slice(); return aiModels;
}
async function aiCall(prompt){
  let last='', list=await aiPickModels(); const pref=(()=>{ try{ return localStorage.getItem(KEYAIM)||''; }catch(e){ return ''; } })();
  if(pref&&list.includes(pref)) list=[pref,...list.filter(x=>x!==pref)];
  const body=JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.7,responseMimeType:'application/json'}});
  for(const mo of list.slice(0,4)){
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${mo}:generateContent?key=${encodeURIComponent(aiKey)}`; let r=null;
    for(const ct of ['application/json','text/plain']){ try{ r=await fetch(url,{method:'POST',headers:{'Content-Type':ct},body}); break; }catch(e){ last=mo+' : '+(e.message||e); } }
    if(!r) continue;
    const j=await r.json().catch(()=>({})), msg=(j.error&&j.error.message)||('HTTP '+r.status);
    if(r.status===404){ last=mo+' : modèle indisponible'; continue; }
    if(!r.ok){ if(/api key|API_KEY/i.test(msg)||r.status===401||r.status===403){ const e=new Error('Google refuse la clé : vérifie que tu l\'as copiée en entier.'); e.key=1; e.det=msg; throw e; }
      if(r.status===429){ last=mo+' : limite gratuite atteinte'; continue; }
      last=mo+' : '+msg; continue; }
    const txt=((((j.candidates||[])[0]||{}).content||{}).parts||[]).map(x=>x.text||'').join('');
    if(txt){ try{ localStorage.setItem(KEYAIM,mo); }catch(e){} return txt; }
    last=mo+' : réponse vide';
  }
  const e=new Error(/limite gratuite/.test(last)?'Limite gratuite de Gemini atteinte pour le moment. Réessaie dans quelques minutes.':'Gemini n\'a pas pu écrire le résumé.'); e.det=last; throw e;
}
function resFacts(m,d){
  const x=m.x||{}, {T}=footIdx(), L=[];
  L.push(`Compétition : ${footLgName(m.lg)}. Date : ${fmtDT(m.d)}.${(m.ven||x.ven)?' Stade : '+(m.ven||x.ven)+'.':''}${x.att?' Spectateurs : '+x.att+'.':''}`);
  L.push(`Équipe à domicile : ${m.hn}. Équipe à l'extérieur : ${m.an}. Score final : ${m.hn} ${m.hs} - ${m.as} ${m.an}.`);
  const st=id=>{ const t=T[id]; return t&&t.st?`${t.st.rank}${t.st.rank===1?'er':'e'} avec ${t.st.pts} pts`:''; };
  if(st(m.hid)||st(m.aid)) L.push(`Classement actuel (après ce match, peut inclure d'autres matchs de la journée) : ${m.hn} ${st(m.hid)||'?'} ; ${m.an} ${st(m.aid)||'?'}.`);
  const tn=s=>s==='h'?m.hn:s==='a'?m.an:'?', TY={g:'But',pg:'But sur penalty',og:'But contre son camp',yc:'Carton jaune',rc:'Carton rouge',sub:'Remplacement'};
  const ev=(x.ev||[]).filter(e=>e.t!=='sub'&&e.t!=='yc');
  if(ev.length) L.push('Faits officiels :\n'+ev.map(e=>`- ${e.ms||e.m+"'"} ${TY[e.t]||e.t} (${tn(e.s)}) : ${e.p||e.tx||'?'}${e.p2&&e.t==='g'?' (passe de '+e.p2+')':''}`).join('\n'));
  const yc=(x.ev||[]).filter(e=>e.t==='yc'); if(yc.length) L.push('Cartons jaunes : '+yc.map(e=>`${e.p} (${tn(e.s)}, ${e.ms})`).join(', ')+'.');
  const ts=x.ts||{}, SN={poss:'Possession %',sh:'Tirs',sot:'Tirs cadrés',cor:'Corners',sv:'Arrêts',fl:'Fautes',off:'Hors-jeu'};
  const sl=Object.keys(SN).filter(k=>ts.h&&ts.h[k]!=null).map(k=>`${SN[k]} ${ts.h[k]}-${ts.a[k]}`); if(sl.length) L.push(`Statistiques (${m.hn}-${m.an}) : ${sl.join(', ')}.`);
  const pl=s=>((x.pl||{})[s]||[]).filter(p=>p.s).map(p=>p.n).join(', '); if(pl('h')) L.push(`Titulaires ${m.hn} : ${pl('h')}.\nTitulaires ${m.an} : ${pl('a')}.`);
  let com=((d&&d.commentary)||[]).map(c=>({t:(c.time&&c.time.displayValue)||(c.clock&&c.clock.displayValue)||'',x:String(c.text||(c.play&&c.play.text)||'').trim(),q:+c.sequence||0})).filter(c=>c.x);
  if(com.length>1&&com[0].q>com[com.length-1].q) com.reverse();
  let txt=com.map(c=>`${c.t} ${c.x}`).join('\n');
  if(txt.length>16000) txt=com.filter(c=>!/^(Corner|Foul by|Offside|Substitution|Delay|.* wins a free kick|.* is shown the yellow card|Hand ball)/i.test(c.x)).map(c=>`${c.t} ${c.x}`).join('\n').slice(-16000);
  if(!com.length){ const ke=((d&&d.keyEvents)||[]).map(e=>`${(e.clock&&e.clock.displayValue)||''} ${e.text||''}`.trim()).filter(Boolean); if(ke.length) txt=ke.join('\n'); }
  if(txt) L.push('Commentaire en direct (en anglais, ordre chronologique) :\n'+txt);
  return {facts:L.join('\n\n'),live:com.length>0};
}
async function resGen(m){
  const id=String(m.id); if(!aiKey||resBusy[id]) return; resBusy[id]=1; delete resErr[id]; try{ render(); }catch(e){}
  try{
    let d=null; try{ d=await footGet(`https://site.api.espn.com/apis/site/v2/sports/soccer/${m.lg}/summary?event=${m.id}`); if(!m.x){ footIngest({__foot:'summary',league:m.lg,id:m.id,data:d}); footSave(); m=footIdx().mt.find(z=>String(z.id)===id)||m; } }catch(e){}
    const {facts,live}=resFacts(m,d);
    const prompt=`Tu es journaliste sportif pour un grand site d'information sportive français. Rédige le compte rendu du match de football décrit ci-dessous, en français.
Règles :
- N'invente RIEN : utilise uniquement les faits fournis. Le commentaire en direct est en anglais : sers-t'en pour raconter les actions (occasions, arrêts, tournants), traduit et reformulé.
- Pas de citations de joueurs ou d'entraîneurs, pas de statistiques qui ne sont pas fournies.
- Minutes au format « (58e) ». Style vivant et précis, phrases variées, pas de liste à puces.
- Mets en gras avec **...** les 2 à 4 joueurs décisifs, une seule fois chacun.
- Si un classement est fourni, termine par la conséquence au classement, avec prudence.
Réponds uniquement en JSON : {"titre":"titre accrocheur, 70 caractères max, sans le score","chapo":"une phrase de résumé","paragraphes":["3 ou 4 paragraphes de 2 à 4 phrases, dans l'ordre du match"]}

${facts}`;
    let raw=await aiCall(prompt); raw=raw.replace(/^\s*```(json)?/i,'').replace(/```\s*$/,'');
    let o; try{ o=JSON.parse(raw); }catch(e){ const a=raw.indexOf('{'), b=raw.lastIndexOf('}'); o=JSON.parse(raw.slice(a,b+1)); }
    const ps=(o.paragraphes||o.paragraphs||[]).map(String).filter(Boolean); if(!ps.length) throw new Error('Réponse de l\'IA incomplète. Touche « Réécrire ».');
    resumes[id]={t:String(o.titre||o.title||''),c:String(o.chapo||''),p:ps,at:Date.now(),live,sc:m.hs+'-'+m.as}; resSave();
  }catch(e){ resErr[id]={m:e.message||String(e),key:!!e.key,det:e.det||''}; }
  finally{ delete resBusy[id]; try{ render(); }catch(e){} }
}
function resAuto(){
  if(!aiKey||Object.keys(resBusy).length) return;
  const mine=new Set([...ffav,...((nfav&&nfav.foot)||[])]), now=Date.now();
  const m=footIdx().done.filter(x=>(mine.has(x.hid)||mine.has(x.aid))&&now-Date.parse(x.d)<36*36e5&&now-Date.parse(x.d)>105*6e4&&!resumes[x.id]&&!resErr[x.id]).sort((a,b)=>Date.parse(b.d)-Date.parse(a.d))[0];
  if(m) resGen(m);
}
setTimeout(resAuto,8000); setInterval(resAuto,90e3);
const resMd=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
function footAiHtml(m){
  if(!m.done) return ''; const id=String(m.id), r=resumes[id], tag='<span class="ai-tag">📰 Résumé du match</span>';
  if(r&&r.sc&&r.sc!==m.hs+'-'+m.as){ delete resumes[id]; resSave(); }
  else if(r) return `<div class="card ai-card">${tag}${r.t?`<h2>${resMd(r.t)}</h2>`:''}${r.c?`<div class="ai-chapo">${resMd(r.c)}</div>`:''}${r.p.map(t=>`<p>${resMd(t)}</p>`).join('')}<div class="ai-ft"><span>✨ Rédigé par IA ${r.live?'à partir du live ESPN':'à partir des données du match (pas de live écrit ESPN)'}</span><button class="sec" data-act="resgen" data-id="${esc(id)}">↻ Réécrire</button></div></div>`;
  if(!aiKey) return `<div class="card ai-card ai-key">${tag}<p>Pour avoir un résumé écrit comme par un journaliste, Statify a besoin d'une clé d'IA gratuite (Google Gemini). À faire une seule fois.</p><p class="mut" style="font-size:12.5px">1. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Ouvre Google AI Studio ↗</a> et connecte-toi avec ton compte Google.<br>2. Touche « Create API key » et copie la clé.<br>3. Colle-la ci-dessous.</p><input id="aiKeyIn" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Colle ta clé ici (commence par AIza…)" value="${esc(aiDraft)}"><button data-act="aikeysave" style="width:100%;margin-top:8px">🔑 Enregistrer ma clé Gemini</button></div>`;
  if(resErr[id]) return `<div class="card ai-card">${tag}<p class="err" style="font-size:13.5px">⚠️ ${esc(resErr[id].m)}</p>${resErr[id].det?`<p class="mut" style="font-size:11.5px">Détail technique : ${esc(resErr[id].det)}</p>`:''}<div class="row"><button data-act="resgen" data-id="${esc(id)}">↻ Réessayer</button><button class="sec" data-act="aikeyreset">🔑 Changer la clé</button></div></div>`;
  if(!resBusy[id]) setTimeout(()=>resGen(m),30);
  return `<div class="card ai-card">${tag}<div class="ai-ld">✍️ Rédaction du résumé en cours…</div><div class="ai-sk" style="width:92%"></div><div class="ai-sk"></div><div class="ai-sk" style="width:76%"></div><div class="ai-sk" style="width:88%"></div></div>`;
}
document.addEventListener('input',e=>{ if(e.target&&e.target.id==='aiKeyIn') aiDraft=e.target.value; });
function footMatchModal(m){
  const {mt}=footIdx(), h2h=mt.filter(x=>x.done&&x.id!==m.id&&((x.hid===m.hid&&x.aid===m.aid)||(x.hid===m.aid&&x.aid===m.hid))).sort((a,b)=>Date.parse(b.d)-Date.parse(a.d));
  const live=m.st==='in', pre=!m.done&&!live, [ca]=pickColors([fcol(m.hc)]);
  const stTxt=live?'🔴 '+esc(fLbl(m.sn,m.clk,m.per,m.det)||'En cours'):pre?'À venir':esc(m.det||'Terminé');
  return `<div class="card print-target">
  <div class="row between" style="margin-bottom:10px"><span class="mut" style="font-size:12px">${esc(footLgName(m.lg))}${m.ven||(m.x&&m.x.ven)?' · '+esc(m.ven||m.x.ven):''}${m.x&&m.x.att?' · '+m.x.att.toLocaleString('fr-FR')+' spectateurs':''}</span><div class="row"><button class="sec" data-act="print">Imprimer / PDF</button><button class="sec" data-act="fclose">Fermer</button></div></div>
  <div class="hero" style="--tc:${ca};cursor:default"><div class="hero-eb">${esc(footLgName(m.lg))} · ${esc(fmtDT(m.d))}</div><div class="hero-row"><div class="hero-t"><span class="hero-lg">${footLogo(m.hl,44)}</span><b>${tlink(m.hid,m.hn)}</b></div><div class="hero-s"${pre?' style="font-size:22px"':''}>${pre?esc((fmtDT(m.d).match(/\d{1,2}[:h]\d{2}/)||['–'])[0]):`${m.hs}<small>–</small>${m.as}`}</div><div class="hero-t"><span class="hero-lg">${footLogo(m.al,44)}</span><b>${tlink(m.aid,m.an)}</b></div></div><div class="hero-ft" style="justify-content:center"><span>${pre?esc(preCd(m.d)):stTxt}</span></div></div>
  ${pre?footPre(m):''}${live?'<div class="mut" style="font-size:12px;margin-bottom:6px">🔴 Match en cours : score, buts, stats et compositions se mettent à jour automatiquement.</div>':''}${footAiHtml(m)}${resumes[String(m.id)]?'':footRecapHtml(m)}
   ${m.x?'':(m.done?`<p class="mut">${m.nx?'ESPN n\'a pas fourni de détails pour ce match.':'Détails non chargés : clique sur « 🔄 Actualiser le foot ».'}</p>`:'')}
  ${footFrise(m)}${footTimeline(m)}${footStatBars(m)}
  ${m.x?`<div class="grid2">${footLineup(m,'h')}${footLineup(m,'a')}</div>`:''}
  ${h2h.length?`<h3>Confrontations enregistrées</h3><div class="scroll"><table><tbody>${h2h.map(x=>`<tr class="click" data-act="fmatch" data-id="${esc(x.id)}"><td class="l">${fmtD(x.d)}</td><td class="l">${esc(x.hn)}</td><td><b>${x.hs} - ${x.as}</b></td><td class="l">${esc(x.an)}</td></tr>`).join('')}</tbody></table></div>`:''}
  ${noteBox('fmatch:'+m.id,m.hn+' - '+m.an,'Ex. : à revoir, super match…')}</div>`;
}

/* ---------- Classement ---------- */
/* ---------- Évolution du classement ---------- */
const CURVEC=['#34b64f','#f0b010','#f07020','#e04030','#4f8cff','#c77dff','#2ec4b6','#f783ac'];
function footCurveData(lg){
  const {mt}=footIdx(), R={}, cap=isEU(lg)?8:999;
  for(const m of mt.filter(x=>x.done&&x.lg===lg).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d))){
    for(const sd of ['h','a']){ const id=sd==='h'?m.hid:m.aid, gf=sd==='h'?m.hs:m.as, ga=sd==='h'?m.as:m.hs; const r=(R[id] ||= {id,n:sd==='h'?m.hn:m.an,ab:sd==='h'?m.ha:m.aa,c:sd==='h'?m.hc:m.ac,cum:[]});
      if(r.cum.length>=cap) continue; const pv=r.cum[r.cum.length-1]||{p:0,gf:0,ga:0}; r.cum.push({p:pv.p+(gf>ga?3:gf===ga?1:0),gf:pv.gf+gf,ga:pv.ga+ga}); } }
  const ids=Object.keys(R); if(!ids.length) return null;
  const stm=Object.fromEntries((((foot.leagues[lg]||{}).standings)||[]).map(r=>[r.id,r])); let off=0;
  for(const i of ids){ const r=R[i], st=stm[i], tot=r.cum[r.cum.length-1]; if(!st||st.gp<r.cum.length) continue; const b={p:Math.max(0,st.pts-tot.p),gf:Math.max(0,st.gf-tot.gf),ga:Math.max(0,st.ga-tot.ga)}; r.cum=r.cum.map(c=>({p:c.p+b.p,gf:c.gf+b.gf,ga:c.ga+b.ga})); off=Math.max(off,st.gp-r.cum.length); }
  const K=Math.max(...ids.map(i=>R[i].cum.length));
  const rank={}, pts={}, gap=[]; ids.forEach(i=>{ rank[i]=[]; pts[i]=[]; });
  for(let k=1;k<=K;k++){ const tb=ids.map(i=>{ const c=R[i].cum[Math.min(k,R[i].cum.length)-1]; return {i,p:c.p,gd:c.gf-c.ga,gf:c.gf}; }).sort((a,b)=>b.p-a.p||b.gd-a.gd||b.gf-a.gf||String(a.i).localeCompare(String(b.i)));
    tb.forEach((t,j)=>{ rank[t.i].push(j+1); pts[t.i].push(t.p); }); gap.push(tb[0].p); }
  return {R,ids,K,off,rank,pts,lead:gap,N:ids.length};
}
function footCurveCard(lg){
  const D=footCurveData(lg); if(!D||D.K<2) return `<div class="card"><h2>📈 Évolution du classement</h2><p class="mut">Pas assez de matchs en mémoire (il faut au moins 2 journées). Utilise la période « 1 mois » ou « Depuis le début de saison » dans « Actualiser le foot ».</p></div>`;
  const cur=ui.fCurve&&ui.fCurve.lg===lg?ui.fCurve:(ui.fCurve={lg,mode:'rank',sel:null});
  const byLast=[...D.ids].sort((a,b)=>D.rank[a][D.K-1]-D.rank[b][D.K-1]);
  if(!cur.sel) cur.sel=byLast.slice(0,5);
  cur.sel=cur.sel.filter(i=>D.R[i]); const mode=cur.mode||'rank';
  const W=640,H=310,L=38,R=70,T=14,B=26, x=k=>L+(D.K<=1?0:(W-L-R)*k/(D.K-1));
  let ymin,ymax,fmt=v=>v;
  const val=(i,k)=>mode==='rank'?D.rank[i][k]:mode==='pts'?D.pts[i][k]:D.pts[i][k]-D.lead[k];
  let r0=1,r1=D.N; if(mode==='rank'&&cur.sel.length){ const rs=cur.sel.flatMap(i=>D.rank[i]); r0=Math.max(1,Math.min(...rs)-1); r1=Math.min(D.N,Math.max(...rs)+1); while(r1-r0<5){ if(r0>1) r0--; if(r1-r0<5&&r1<D.N) r1++; if(r0===1&&r1===D.N) break; } }
  if(mode==='rank'){ ymin=r0; ymax=r1; } else { const all=cur.sel.flatMap(i=>D.pts[i].map((v,k)=>mode==='pts'?v:v-D.lead[k])); ymin=Math.min(0,...all,0); ymax=Math.max(1,...all,mode==='gap'?0:1); if(ymax===ymin) ymax=ymin+1; }
  const y=v=>mode==='rank'?T+(H-T-B)*(v-r0)/Math.max(1,r1-r0):T+(H-T-B)*(1-(v-ymin)/(ymax-ymin));
  let g=''; 
  if(mode==='rank'&&!isEU(lg)&&D.N>=12){ const a=Math.max(1,r0), b=Math.min(4,r1); if(r0<=4) g+=`<rect x="${L}" y="${y(a)-5}" width="${W-L-R}" height="${y(b)-y(a)+10}" fill="#3ecf8e" opacity=".09"/>`; const c=Math.max(D.N-2,r0), e=r1; if(r1>=D.N-2) g+=`<rect x="${L}" y="${y(c)-5}" width="${W-L-R}" height="${y(e)-y(c)+10}" fill="#e5484d" opacity=".09"/>`; }
  const ticks=mode==='rank'?(r1-r0<=9?Array.from({length:r1-r0+1},(_,j)=>r0+j):[...new Set([r0,Math.round(r0+(r1-r0)/3),Math.round(r0+2*(r1-r0)/3),r1])]):Array.from({length:5},(_,j)=>Math.round(ymin+(ymax-ymin)*j/4));
  for(const v of ticks){ const yy=y(v); g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" style="stroke:var(--line)"/><text x="${L-6}" y="${yy+4}" text-anchor="end" font-size="10" style="fill:var(--mut)">${mode==='rank'?v+'e':v}</text>`; }
  const step=Math.ceil(D.K/12); for(let k=0;k<D.K;k++) if(k%step===0||k===D.K-1) g+=`<text x="${x(k)}" y="${H-8}" text-anchor="middle" font-size="10" style="fill:var(--mut)">J${D.off+k+1}</text>`;
  const ly={}; { const arr=cur.sel.map(i=>({i,y:y(val(i,D.K-1))})).sort((a,b)=>a.y-b.y); for(let j=1;j<arr.length;j++) if(arr[j].y-arr[j-1].y<13) arr[j].y=arr[j-1].y+13; arr.forEach(o=>{ ly[o.i]=o.y; }); }
  const lines=cur.sel.map((i,j)=>{ const c=CURVEC[j%CURVEC.length], pts=D.rank[i].map((_,k)=>[x(k),y(val(i,k))]), lp=pts[pts.length-1];
    return `<polyline fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round" points="${pts.map(q=>q.join(',')).join(' ')}"/>`+pts.map((q,k)=>`<circle cx="${q[0]}" cy="${q[1]}" r="3" fill="${c}"><title>${esc(D.R[i].n)} · J${D.off+k+1} : ${D.rank[i][k]}e, ${D.pts[i][k]} pts</title></circle>`).join('')+`<text x="${lp[0]+7}" y="${ly[i]+4}" font-size="11" font-weight="700" style="fill:${c}">${esc(D.R[i].ab||D.R[i].n.slice(0,3))}</text>`; }).join('');
  const chips=cur.sel.map((i,j)=>`<span class="chip"><i style="background:${CURVEC[j%CURVEC.length]}"></i>${esc(D.R[i].n)} <button class="x" data-act="fcdel" data-id="${esc(i)}" title="Retirer">✕</button></span>`).join('');
  const opts=byLast.filter(i=>!cur.sel.includes(i)).map(i=>`<option value="${esc(i)}">${esc(D.R[i].n)}</option>`).join('');
  const mine=byLast.filter(i=>ffav.includes(i));
  const lab=mode==='rank'?'Place au classement après chaque journée (1re en haut)':mode==='pts'?'Points cumulés':'Écart de points avec le leader (course au titre, au maintien…)';
  return `<div class="card"><h2>📈 Évolution du classement</h2><div class="row" style="margin-bottom:8px"><select id="fCurveMode"><option value="rank" ${mode==='rank'?'selected':''}>Place</option><option value="pts" ${mode==='pts'?'selected':''}>Points</option><option value="gap" ${mode==='gap'?'selected':''}>Écart au leader</option></select><button class="sec" data-act="fcpre" data-id="top">Top 5</button><button class="sec" data-act="fcpre" data-id="bot">Bas de tableau</button>${mine.length?'<button class="sec" data-act="fcpre" data-id="mine">Mes clubs</button>':''}<select id="fCurveAdd"><option value="">+ Ajouter un club…</option>${opts}</select></div><div class="row" style="margin-bottom:6px;flex-wrap:wrap">${chips||'<span class="mut">Aucun club sélectionné</span>'}</div><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(lab)}">${g}${lines}</svg><p class="mut" style="margin:6px 0 0;font-size:12px">${esc(lab)}. Les ${D.K} dernière(s) journée(s) chargée(s) sont tracées${isEU(lg)?' (phase de ligue)':''} ; le point de départ reprend le classement officiel moins ces matchs. Pour voir plus loin, charge « 1 mois » ou « Depuis le début de saison ».</p></div>`;
}
function footTableView(){
  const lg=footLgOrFirst(), L=foot.leagues[lg], mode=ui.fTMode||'G';
  const tabs=`<div class="row" style="margin-bottom:10px">${FLG.map(([c,n])=>`<button class="${lg===c?'':'sec'}" data-act="footlg" data-id="${c}">${esc(n)}</button>`).join('')}<select id="fTMode"><option value="G" ${mode==='G'?'selected':''}>Général</option><option value="H" ${mode==='H'?'selected':''}>Domicile</option><option value="A" ${mode==='A'?'selected':''}>Extérieur</option><option value="F" ${mode==='F'?'selected':''}>Forme (5 derniers)</option></select></div>`;
  let body;
  if(mode==='G'){
    if(!L||!L.standings.length) body='<p class="mut">Pas encore de classement : clique sur « Actualiser le foot ».</p>';
    else { const zl=[...new Map(L.standings.filter(r=>r.zone&&r.zone.d).map(r=>[r.zone.d,r.zone.c])).entries()];
      const rowsH=L.standings.map(r=>{ const zc=r.zone&&r.zone.c?r.zone.c:'#8aa0b8';
        return `<div class="cls-r"><span class="cls-rk" style="--z:${esc(zc)}">${r.rank}</span><div class="cls-c"><div class="cls-n">${fstar(r.id)}${footLogo(r.logo,24)}<span>${tlink(r.id,r.name)}</span></div><div class="cls-s">${r.gp} J · ${r.w}V ${r.d}N ${r.l}D · ${r.gf}-${r.ga} <b class="${r.gd>=0?'ok':'err'}">${r.gd>0?'+':''}${r.gd}</b></div></div><span class="cls-f">${fdots(r.id)}</span><b class="cls-p">${r.pts}</b></div>`; }).join('');
      body=`<div class="cls">${rowsH}</div><div class="row" style="margin:12px 0 4px;gap:14px">${zl.map(([d,c])=>`<span class="zl"><i style="background:${esc(c)}"></i>${esc(zoneFr(d))}</span>`).join('')}</div><p class="mut" style="margin:8px 0 0">${esc(L.season||'')} · mis à jour ${L.upd?esc(fmtDT(new Date(L.upd).toISOString())):'–'} · la forme est calculée sur les matchs en mémoire.</p>`; }
  } else { const rows=footCalcTable(lg,mode);
    body=rows.length?`<div class="scroll"><table class="st"><thead><tr><th>#</th><th class="l">Club</th><th>MJ</th><th>V</th><th>N</th><th>D</th><th>BP</th><th>BC</th><th>Diff.</th><th>Pts</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td class="l">${fstar(r.id)}${footLogo(r.lo)}${tlink(r.id,r.n)}</td><td>${r.g}</td><td>${r.w}</td><td>${r.d}</td><td>${r.ls}</td><td>${r.gf}</td><td>${r.ga}</td><td class="${r.gd>=0?'ok':'err'}">${r.gd>0?'+':''}${r.gd}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody></table></div><p class="mut" style="margin:8px 0 0">Calculé sur les matchs en mémoire : charge « Depuis le début de saison » pour un classement complet.</p>`:'<p class="mut">Pas assez de matchs en mémoire.</p>'; }
  return footControls()+`<div class="card">${tabs}${body}</div>`+footCurveCard(lg);
}

/* ---------- Équipes ---------- */
function footTeamAvg(t){ const n=t.xn||1, a=k=>t.sx[k]!=null&&t.xn?t.sx[k]/n:null; return {poss:a('poss'),sh:a('sh'),sot:a('sot'),cor:a('cor'),fl:a('fl'),yc:a('yc'),rc:a('rc')}; }
function footTeamsView(){
  const lg=footLgOrFirst(), {T}=footIdx(), rk=Object.fromEntries(((foot.leagues[lg]||{}).standings||[]).map(r=>[r.id,r])), rows=Object.values(T).filter(t=>inLg(t,lg)&&(t.g>0||t.st)).map(t=>({...t,st:isEU(lg)?(rk[t.id]||null):t.st})).sort((a,b)=>((a.st?a.st.rank:99)-(b.st?b.st.rank:99))||b.w-a.w);
  const fx=v=>v==null?'–':f1(v);
  return footControls()+`<div class="card"><div class="row" style="margin-bottom:10px">${FLG.map(([c,n])=>`<button class="${lg===c?'':'sec'}" data-act="footlg" data-id="${c}">${esc(n)}</button>`).join('')}</div>${isEU(lg)?'<p class="mut" style="margin:0 0 8px">Moyennes toutes compétitions confondues (championnat + coupe d\'Europe) ; le rang est celui de la phase de ligue.</p>':''}<div class="scroll"><table><thead><tr><th>#</th><th class="l">Club</th><th>MJ</th><th>BP/m</th><th>BC/m</th><th>Poss.</th><th>Tirs/m</th><th>Cadrés/m</th><th>Corners/m</th><th>Cartons/m</th><th>Clean sheets</th><th>BTTS</th><th>+2,5 buts</th></tr></thead><tbody>${rows.map(t=>{ const a=footTeamAvg(t); return `<tr><td>${t.st?t.st.rank:'–'}</td><td class="l">${fstar(t.id)}${footLogo(t.lo)}${tlink(t.id,t.n)}</td><td>${t.g}</td><td>${t.g?f1(t.gf/t.g):'–'}</td><td>${t.g?f1(t.ga/t.g):'–'}</td><td>${a.poss!=null?f1(a.poss)+' %':'–'}</td><td>${fx(a.sh)}</td><td>${fx(a.sot)}</td><td>${fx(a.cor)}</td><td>${a.yc!=null?f1(a.yc+(a.rc||0)):'–'}</td><td>${t.cs}</td><td>${fpc(t.btts,t.g)}</td><td>${fpc(t.o25,t.g)}</td></tr>`; }).join('')||'<tr><td class="empty" colspan="13">Aucune équipe : actualise le foot.</td></tr>'}</tbody></table></div><p class="mut" style="margin:8px 0 0">Les moyennes de possession, tirs, corners et cartons ne portent que sur les matchs dont les détails sont chargés.</p></div>`;
}
const FRADT=['Buts marqués','Défense','Possession','Tirs','Cadrés','Discipline'];
function footRadarT(T,t){ const peers=Object.values(T).filter(x=>x.lg===t.lg&&x.g>0), v=x=>{ const a=footTeamAvg(x); return [fdiv(x.gf,x.g),-fdiv(x.ga,x.g),a.poss||0,a.sh||0,a.sot||0,-((a.yc||0)+(a.rc||0)*2)]; };
  const all=peers.map(v), me=v(t); return me.map((x,i)=>pctOf(all.map(a=>a[i]),x)); }
function footTeamModal(t){
  const {P,T,mt}=footIdx(), st=t.st, c=fcol(t.co||(st&&st.zone&&st.zone.c)), [c1,c2]=pickColors([c,'#9aa7c2']), a=footTeamAvg(t);
  const plist=Object.values(P).filter(p=>p.tid===t.id).sort((x,y)=>y.g-x.g||y.a-x.a||y.gp-x.gp);
  const lg=t.log, labels=lg.map(x=>fmtD(x.t)), ms=mt.filter(m=>m.hid===t.id||m.aid===t.id).sort((x,y)=>Date.parse(x.d)-Date.parse(y.d)), nx=ms.filter(m=>!m.done).slice(0,5);
  const sp=(l,x)=>`<tr><td class="l">${l}</td><td>${x.g||0}</td><td>${x.w||0}-${x.d||0}-${x.ls||0}</td><td>${x.gf||0}</td><td>${x.ga||0}</td></tr>`;
  const bucket=['0-15','16-30','31-45','46-60','61-75','76-90+'];
  return `<div class="card print-target" style="border-left:4px solid ${c}"><div class="phead" style="background:linear-gradient(135deg,${c}33,transparent 65%)">${footLogo(t.lo,84)}<div class="pinfo"><div class="pname">${fstar(t.id)}${esc(t.n)}</div><div class="psub">${esc(footLgName(t.lg))}${st?` · ${st.rank}e · ${st.pts} pts · ${st.w}V ${st.d}N ${st.l}D`:''}</div></div><div class="row"><button class="sec" data-act="print">Imprimer / PDF</button><button class="sec" data-act="fclose">Fermer</button></div></div>
  <div style="margin-bottom:8px">${fdots(t.id,8)}</div>
  <div class="grid"><div class="kpi"><span class="mut">Buts marqués / m</span><b>${t.g?f1(t.gf/t.g):'–'}</b></div><div class="kpi"><span class="mut">Buts encaissés / m</span><b>${t.g?f1(t.ga/t.g):'–'}</b></div><div class="kpi"><span class="mut">Clean sheets</span><b>${t.cs}</b></div><div class="kpi"><span class="mut">Match sans marquer</span><b>${t.fts}</b></div><div class="kpi"><span class="mut">Possession</span><b>${a.poss!=null?f1(a.poss)+' %':'–'}</b></div><div class="kpi"><span class="mut">Tirs / cadrés</span><b>${a.sh!=null?f1(a.sh)+' / '+f1(a.sot):'–'}</b></div><div class="kpi"><span class="mut">BTTS</span><b>${fpc(t.btts,t.g)}</b></div><div class="kpi"><span class="mut">+2,5 buts</span><b>${fpc(t.o25,t.g)}</b></div></div>
  ${lg.length>1?`<h3>Buts marqués et encaissés par match</h3>${barsChart(labels,lg.map(x=>x.gf),lg.map(x=>x.ga),'Marqués','Encaissés',c1,c2)}`:''}
  <div class="grid2"><div><h3>Profil (par rapport au championnat)</h3>${t.g>=2?radarChart(FRADT,[{name:t.n,color:c1,vals:footRadarT(T,t)}],'clubs'):'<p class="mut">Pas assez de matchs.</p>'}</div><div><h3>Quand marque-t-on ?</h3>${t.gfi.some(Boolean)||t.gai.some(Boolean)?barsChart(bucket,t.gfi,t.gai,'Marqués','Encaissés',c1,c2):'<p class="mut">Nécessite les détails des matchs.</p>'}</div></div>
  <h3>Domicile et extérieur</h3><div class="scroll"><table><thead><tr><th class="l"></th><th>MJ</th><th>V-N-D</th><th>BP</th><th>BC</th></tr></thead><tbody>${sp('Domicile',t.H)}${sp('Extérieur',t.A)}</tbody></table></div>
  ${nx.length?`<h3>Prochains matchs</h3><div class="scroll"><table><tbody>${nx.map(m=>footRow(m,false)).join('')}</tbody></table></div>`:''}
  <div class="grid2"><div><h3>Résultats</h3><div class="scroll"><table><tbody>${[...lg].reverse().slice(0,20).map(x=>{ const m=ms.find(z=>z.id===x.mid); return `<tr class="click" data-act="fmatch" data-id="${esc(x.mid)}"><td class="l">${fmtD(x.t)}</td><td class="l">${x.home?'vs':'@'} ${esc(x.opp)}</td><td><span class="dot ${x.res}">${x.res==='w'?'V':x.res==='l'?'D':'N'}</span></td><td>${x.gf}-${x.ga}</td></tr>`; }).join('')||'<tr><td class="empty">–</td></tr>'}</tbody></table></div></div><div><h3>Joueurs (matchs détaillés)</h3>${plist.length?`<div class="scroll"><table><thead><tr><th class="l">Joueur</th><th>MJ</th><th>B</th><th>PD</th><th>Tirs</th></tr></thead><tbody>${plist.slice(0,16).map(p=>`<tr><td class="l">${footAv(p.id,p.n,t.co,22)}${plink(p.id,p.n)} <span class="mut">${esc(p.pos)}</span></td><td>${p.gp}</td><td><b>${p.g}</b></td><td>${p.a}</td><td>${p.sh}</td></tr>`).join('')}</tbody></table></div>`:'<p class="mut">Pas de détails de joueurs.</p>'}</div></div>
  ${footTeamExtra(t,plist)}
  ${noteBox('fteam:'+t.id,t.n,'Ex. : équipe à suivre…')}</div>`;
}

/* ---------- Joueurs ---------- */
const FPCOLS=[['gp','MJ',p=>p.gp],['gs','Tit.',p=>p.gs],['g','Buts',p=>p.g],['a','PD',p=>p.a],['ga','B+PD',p=>p.g+p.a],['gm','B/match',p=>fdiv(p.g,p.gp),v=>v.toFixed(2)],['sh','Tirs',p=>p.sh],['sot','Cadrés',p=>p.sot],['acc','Précision',p=>fdiv(p.sot,p.sh)*100,v=>Math.round(v)+' %'],['yc','🟨',p=>p.yc],['rc','🟥',p=>p.rc],['sv','Arrêts',p=>p.sv],['cs','CS',p=>p.cs],['fc','Fautes',p=>p.fc]];
function footPlayersList(){
  const {P}=footIdx(); let l=Object.values(P);
  const lg=ui.fLg; if(lg==='mine') l=l.filter(p=>ffav.includes(p.tid)||ffavP.includes(p.id)); else if(lg) l=l.filter(p=>inLg(p,lg));
  if(ui.fpTeam) l=l.filter(p=>p.tid===ui.fpTeam); if(ui.fpPos) l=l.filter(p=>p.pg===ui.fpPos);
  l=l.filter(p=>p.gp>=(ui.fpMin||1)); if(ui.fpQ) l=l.filter(p=>p.n.toLowerCase().includes(ui.fpQ.toLowerCase())||p.tn.toLowerCase().includes(ui.fpQ.toLowerCase()));
  const sk=ui.fpSort||{k:'ga',d:-1}, col=FPCOLS.find(c=>c[0]===sk.k)||FPCOLS[4];
  return l.sort((a,b)=>sk.k==='n'?sk.d*a.n.localeCompare(b.n):sk.d*(col[2](a)-col[2](b))||(b.g-a.g));
}
function footPlayersView(){
  const {P}=footIdx(), all=Object.values(P); if(!all.length) return footControls()+'<div class="card"><p class="mut">Pas encore de statistiques de joueurs : elles viennent des détails de matchs (bouton « Actualiser le foot »).</p></div>';
  const l=footPlayersList(), sk=ui.fpSort||{k:'ga',d:-1}, maxGp=Math.max(1,...all.map(p=>p.gp));
  const teams=[...new Map(all.filter(p=>!ui.fLg||ui.fLg==='mine'||inLg(p,ui.fLg)).map(p=>[p.tid,p.tn])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const th=([k,lab])=>`<th data-act="fsort" data-k="${k}" style="cursor:pointer">${lab}${sk.k===k?(sk.d<0?' ▼':' ▲'):''}</th>`;
  return footControls()+`<div class="card"><div class="row" style="margin-bottom:10px">${footLgSel('fLg',ui.fLg,true,true)}<select id="fpTeam"><option value="">Tous les clubs</option>${teams.map(([id,n])=>`<option value="${esc(id)}" ${ui.fpTeam===id?'selected':''}>${esc(n)}</option>`).join('')}</select><select id="fpPos"><option value="">Tous les postes</option>${['G','D','M','F'].map(k=>`<option value="${k}" ${ui.fpPos===k?'selected':''}>${POSL[k]}</option>`).join('')}</select><select id="fpMin">${Array.from({length:maxGp},(_,i)=>`<option value="${i+1}" ${(ui.fpMin||1)===i+1?'selected':''}>≥ ${i+1} match(s)</option>`).join('')}</select><input id="fpQ" placeholder="Rechercher…" value="${esc(ui.fpQ||'')}"><button class="sec" data-act="fcsv">CSV</button></div>
  <div class="scroll"><table><thead><tr><th class="l" data-act="fsort" data-k="n" style="cursor:pointer">Joueur</th>${FPCOLS.map(th).join('')}</tr></thead><tbody>${l.slice(0,120).map(p=>`<tr><td class="l">${fpstar(p.id)}${footAv(p.id,p.n,p.tco,24)}${plink(p.id,p.n)} <span class="mut">${esc(p.tn)} · ${esc(POSL[p.pg]||'')}</span>${noteMark('fplayer:'+p.id)}</td>${FPCOLS.map(c=>`<td>${c[3]?c[3](c[2](p)):c[2](p)}</td>`).join('')}</tr>`).join('')||'<tr><td class="empty" colspan="16">Aucun joueur.</td></tr>'}</tbody></table></div><p class="mut" style="margin:8px 0 0">${l.length} joueur(s)${l.length>120?' (120 premiers affichés)':''} · statistiques calculées sur les matchs dont les détails sont chargés · CS = clean sheets (gardiens titulaires).</p></div>`;
}
const FRADP=['Buts','Passes D.','Tirs','Cadrés','Fautes subies','Fautes (−)'];
const footRadarV=p=>[fdiv(p.g,p.gp),fdiv(p.a,p.gp),fdiv(p.sh,p.gp),fdiv(p.sot,p.gp),fdiv(p.fs,p.gp),-fdiv(p.fc,p.gp)];
/* ---------- Carte joueur façon « FUT » ---------- */
const darken=(c,f)=>{ const n=parseInt(String(c).replace('#',''),16)||0; const r=Math.round((n>>16)*f), g=Math.round(((n>>8)&255)*f), b=Math.round((n&255)*f); return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1); };
function footCardData(p){
  const {P}=footIdx(), peers=Object.values(P).filter(x=>inLg(x,p.lg)&&x.gp>=2&&(p.pg==='?'||x.pg===p.pg));
  let rows, ovr;
  if(p.pg==='G'){ rows=[['ARR',p.sv],['CS',p.cs],['BC',p.gc],['MJ',p.gp],['TIT',p.gs],['CAR',p.yc+p.rc]];
    const f=[x=>fdiv(x.sv,x.gp),x=>fdiv(x.cs,x.gp),x=>-fdiv(x.gc,x.gp)]; ovr=peers.length>=3?f.reduce((a,fn)=>a+pctOf(peers.map(fn),fn(p)),0)/f.length:50; }
  else { rows=[['BUT',p.g],['PD',p.a],['TIR',p.sh],['CAD',p.sot],['MJ',p.gp],['CAR',p.yc+p.rc]];
    const me=footRadarV(p), all=peers.map(footRadarV); ovr=peers.length>=3?me.reduce((a,v,i)=>a+pctOf(all.map(z=>z[i]),v),0)/me.length:50; }
  return {rows,ovr:Math.max(55,Math.min(99,Math.round(55+44*ovr/100)))};
}
function footCardSvg(p,imgs){
  imgs=imgs||{}; const {T}=footIdx(), t=T[p.tid]||{}, col=pickColors([fcol(p.tco)])[0], dk=darken(col,.42), dk2=darken(col,.2), D=footCardData(p);
  const photo=imgs.photo||footPhoto(p.id)||'', logo=imgs.logo||p.tlo||'', uid='fc'+String(p.id).replace(/\W/g,'');
  const nm=String(p.n||'').toUpperCase(), parts=nm.split(/\s+/), disp=parts.length>1?parts[parts.length-1]:nm, fs=disp.length>13?17:disp.length>10?20:24;
  const stat=(r,i)=>{ const cx=i<3?78:222, cy=282+(i%3)*32; return `<text x="${cx-6}" y="${cy}" text-anchor="end" font-size="20" font-weight="800" fill="#f5e6a8">${esc(String(r[1]))}</text><text x="${cx+2}" y="${cy}" font-size="13" font-weight="700" fill="#f5e6a8" opacity=".85">${esc(r[0])}</text>`; };
  return `<svg class="fc" viewBox="0 0 300 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Carte de ${esc(p.n)}" font-family="system-ui,Segoe UI,Arial,sans-serif">
<defs><linearGradient id="${uid}g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${col}"/><stop offset=".55" stop-color="${dk}"/><stop offset="1" stop-color="${dk2}"/></linearGradient><linearGradient id="${uid}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#c9a227"/><stop offset="1" stop-color="#f5e6a8"/></linearGradient><clipPath id="${uid}c"><path d="M150 8 L286 34 L286 292 Q286 372 150 412 Q14 372 14 292 L14 34 Z"/></clipPath></defs>
<path d="M150 8 L286 34 L286 292 Q286 372 150 412 Q14 372 14 292 L14 34 Z" fill="url(#${uid}g)" stroke="url(#${uid}b)" stroke-width="5"/>
<g clip-path="url(#${uid}c)"><circle cx="215" cy="120" r="120" fill="#fff" opacity=".07"/><path d="M0 330 L300 250 L300 420 L0 420 Z" fill="#000" opacity=".18"/></g>
<text x="46" y="78" font-size="46" font-weight="900" fill="#f5e6a8">${D.ovr}</text><text x="48" y="100" font-size="16" font-weight="800" fill="#f5e6a8">${esc(p.pos||POSL[p.pg]||'')}</text>
${logo?`<image onerror="this.style.display='none'" href="${esc(logo)}" x="34" y="112" width="36" height="36" preserveAspectRatio="xMidYMid meet"/>`:''}
<circle cx="170" cy="130" r="58" fill="#fff" opacity=".12"/><text x="170" y="146" text-anchor="middle" font-size="44" font-weight="800" fill="#f5e6a8">${esc(initials(p.n))}</text>${photo?`<image onerror="footImgFix(this)" data-pid="${esc(p.id)}" href="${esc(photo)}" x="86" y="40" width="170" height="170" preserveAspectRatio="xMidYMax meet"/>`:''}
<text x="150" y="238" text-anchor="middle" font-size="${fs}" font-weight="900" fill="#fff" letter-spacing=".5">${esc(disp)}</text>
<line x1="52" x2="248" y1="248" y2="248" stroke="url(#${uid}b)" stroke-width="1.5"/>
<text x="150" y="264" text-anchor="middle" font-size="11" fill="#fff" opacity=".8">${esc((p.tn||'').slice(0,18))}${p.lg?' · '+esc(footLgName(p.lg)):''}</text>
${D.rows.map(stat).join('')}
<line x1="150" x2="150" y1="268" y2="360" stroke="url(#${uid}b)" stroke-width="1" opacity=".5"/>
<text x="150" y="392" text-anchor="middle" font-size="9" fill="#f5e6a8" opacity=".7" letter-spacing="1.5">NOTE SUR ${Object.values(footIdx().P).filter(x=>inLg(x,p.lg)&&x.gp>=2&&(p.pg==='?'||x.pg===p.pg)).length} JOUEURS</text>
</svg>`;
}
async function footToData(u){ if(!u) return ''; try{ const r=await fetch(u,{mode:'cors'}); if(!r.ok) return ''; const b=await r.blob(); return await new Promise(res=>{ const f=new FileReader(); f.onload=()=>res(String(f.result)); f.onerror=()=>res(''); f.readAsDataURL(b); }); }catch(e){ return ''; } }
async function footCardDownload(pid){
  const p=footIdx().P[pid]; if(!p) return; say('⏳ Préparation de l\'image…','warn');
  try{ let [photo,logo]=await Promise.all([footToData(footPhoto(p.id)),footToData(p.tlo)]); if(!photo){ const u=await footPhotoAlt(p.id); if(u) photo=await footToData(u); }
    const svg=footCardSvg(p,{photo,logo}), url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
    const img=new Image(); await new Promise((ok,ko)=>{ img.onload=ok; img.onerror=()=>ko(new Error('image')); img.src=url; });
    const cv=document.createElement('canvas'); cv.width=900; cv.height=1260; const cx=cv.getContext('2d'); cx.drawImage(img,0,0,900,1260); URL.revokeObjectURL(url);
    const blob=await new Promise(r=>cv.toBlob(r,'image/png')); if(!blob) throw new Error('export');
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='carte-'+String(p.n).toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.png'; document.body.appendChild(a); a.click(); a.remove();
    say('✓ Carte téléchargée'+((!photo&&footPhoto(p.id))?' (sans la photo : ESPN ne l\'a pas autorisée)':'')+'.','ok');
  }catch(e){ say('Export impossible ('+esc(e.message||String(e))+'). Fais une capture d\'écran de la carte.','err'); }
}
function footPlayerModal(p){
  const {P,T}=footIdx(), c=fcol(p.tco), peers=Object.values(P).filter(x=>x.lg===p.lg&&x.gp>=2&&(p.pg==='?'||x.pg===p.pg)), me=footRadarV(p), all=peers.map(footRadarV);
  const rv=me.map((v,i)=>pctOf(all.map(a=>a[i]),v)), [c1,c2]=pickColors([c,'#ff8a4f']);
  const logs=p.log, cum=[]; logs.reduce((s,x)=>{ s+=x.g; cum.push(s); return s; },0);
  const specs=[['Buts / match',x=>fdiv(x.g,x.gp)],['Passes D. / match',x=>fdiv(x.a,x.gp)],['Tirs / match',x=>fdiv(x.sh,x.gp)],['Cadrés / match',x=>fdiv(x.sot,x.gp)],['Fautes / match',x=>fdiv(x.fc,x.gp)]];
  const t=T[p.tid];
  return `<div class="card print-target" style="border-left:4px solid ${c}"><div class="phead" style="background:linear-gradient(135deg,${c}33,transparent 65%)">${footAv(p.id,p.n,p.tco,112)}<div class="pinfo"><div class="pname">${fpstar(p.id)}${esc(p.n)}</div><div class="psub">${footLogo(p.tlo,22)}${tlink(p.tid,p.tn)} · ${esc(POSL[p.pg]||'')}${p.pos?' ('+esc(p.pos)+')':''} · ${p.gp} match(s)</div></div><div class="row"><button class="sec" data-act="print">Imprimer / PDF</button><button class="sec" data-act="fclose">Fermer</button></div></div>
  <div class="grid2" style="align-items:center"><div class="fcard-wrap">${footCardSvg(p)}<div style="margin-top:8px"><button data-act="fcarddl" data-id="${esc(p.id)}">⬇ Télécharger la carte (image)</button></div></div><div>
  <div class="grid"><div class="kpi"><span class="mut">Buts</span><b>${p.g}</b></div><div class="kpi"><span class="mut">Passes D.</span><b>${p.a}</b></div><div class="kpi"><span class="mut">Titularisations</span><b>${p.gs}</b></div><div class="kpi"><span class="mut">Tirs / cadrés</span><b>${p.sh} / ${p.sot}</b></div><div class="kpi"><span class="mut">Précision</span><b>${p.sh?Math.round(100*p.sot/p.sh)+' %':'–'}</b></div><div class="kpi"><span class="mut">Cartons</span><b>🟨 ${p.yc} 🟥 ${p.rc}</b></div>${p.pg==='G'?`<div class="kpi"><span class="mut">Arrêts / clean sheets</span><b>${p.sv} / ${p.cs}</b></div>`:`<div class="kpi"><span class="mut">Buts + passes</span><b>${p.g+p.a}</b></div>`}</div></div></div>
  ${logs.length>1?`<h3>Buts cumulés</h3>${lineChart([{name:'Buts cumulés',values:cum,color:c1}],logs.map(x=>fmtD(x.t)))}`:''}
  <div class="grid2"><div><h3>Profil (${peers.length} joueurs comparés)</h3>${peers.length>=3?radarChart(FRADP,[{name:p.n,color:c1,vals:rv}],'joueurs du championnat au même poste'):'<p class="mut">Pas assez de joueurs à comparer.</p>'}</div><div><h3>Classement parmi eux</h3><div class="scroll"><table><thead><tr><th class="l">Stat</th><th>Valeur</th><th>Top</th></tr></thead><tbody>${specs.map(([l,fn])=>{ const v=fn(p), vs=peers.map(fn); const top=peers.length?Math.round(100-pctOf(vs,v)+ (100/(2*peers.length))):null; return `<tr><td class="l">${l}</td><td>${v.toFixed(2)}</td><td>${top==null?'–':'Top '+Math.max(1,Math.min(100,top))+' %'}</td></tr>`; }).join('')}</tbody></table></div></div></div>
  <h3>Match par match</h3><div class="scroll"><table><thead><tr><th class="l">Date</th><th class="l">Match</th><th></th><th>B</th><th>PD</th><th>Tirs</th><th>Cart.</th></tr></thead><tbody>${[...logs].reverse().map(x=>`<tr class="click" data-act="fmatch" data-id="${esc(x.mid)}"><td class="l">${fmtD(x.t)}</td><td class="l">${x.home?'vs':'@'} ${esc(x.opp)} <span class="mut">${x.s?'':'(remplaçant)'}</span></td><td><span class="dot ${x.res}">${x.res==='w'?'V':x.res==='l'?'D':'N'}</span></td><td>${x.g||''}</td><td>${x.a||''}</td><td>${x.sh?x.sh+'/'+x.sot:''}</td><td>${x.yc?'🟨':''}${x.rc?'🟥':''}</td></tr>`).join('')}</tbody></table></div>
  ${footPlayerMinHtml(p)}
  ${noteBox('fplayer:'+p.id,p.n,'Ex. : à surveiller, blessé…')}</div>`;
}

/* ---------- Records ---------- */
function footRecordsView(){
  const {P,T,done}=footIdx(); let pl=Object.values(P), ms=done; const lg=ui.fLg&&ui.fLg!=='mine'?ui.fLg:'';
  if(lg){ pl=pl.filter(p=>inLg(p,lg)); ms=ms.filter(m=>m.lg===lg); }
  const tm=Object.values(T).filter(t=>t.g>0&&inLg(t,lg));
  const lists=[['Buts','g','buts'],['Passes décisives','a','PD'],['Tirs','sh','tirs'],['Tirs cadrés','sot','cadrés'],['Arrêts (gardiens)','sv','arrêts'],['Clean sheets','cs','CS'],['Cartons jaunes','yc','🟨'],['Cartons rouges','rc','🟥'],['Fautes commises','fc','fautes']];
  const gm=[...ms].sort((a,b)=>(b.hs+b.as)-(a.hs+a.as)).slice(0,6), big=[...ms].sort((a,b)=>Math.abs(b.hs-b.as)-Math.abs(a.hs-a.as)).slice(0,6);
  const ml=a=>`<div class="scroll"><table><tbody>${a.map(m=>`<tr class="click" data-act="fmatch" data-id="${esc(m.id)}"><td class="l">${fmtD(m.d)}</td><td class="l">${esc(m.hn)}</td><td><b>${m.hs} - ${m.as}</b></td><td class="l">${esc(m.an)}</td></tr>`).join('')||'<tr><td class="empty">–</td></tr>'}</tbody></table></div>`;
  const tl=(l,fn,fmt,asc)=>{ const a=[...tm].filter(t=>t.g>=2).sort((x,y)=>(asc?1:-1)*(fn(x)-fn(y))).slice(0,6); return `<div><h3>${l}</h3><table><tbody>${a.map((t,i)=>`<tr><td class="l">${i+1}. ${footLogo(t.lo,18)}${tlink(t.id,t.n)}</td><td><b>${fmt(t)}</b></td></tr>`).join('')||'<tr><td class="empty">–</td></tr>'}</tbody></table></div>`; };
  const hat=[]; ms.forEach(m=>{ ['h','a'].forEach(s=>{ if(m.x) m.x.pl[s].filter(p=>p.g>=3).forEach(p=>hat.push({m,p,s})); }); });
  const reds=ms.filter(m=>m.x&&m.x.ev.some(e=>e.t==='rc')).slice(-8).reverse();
  return footControls()+`<div class="card"><div class="row between"><h2 style="margin:0">Meilleurs joueurs</h2>${footLgSel('fLg',ui.fLg==='mine'?'':ui.fLg,true,false)}</div>${pl.length?`<div class="grid2">${lists.map(([t,k,lab])=>`<div><h3>${t}</h3>${footScorersTable(pl,k,lab,6)}</div>`).join('')}</div>`:'<p class="mut">Les records de joueurs viennent des détails de matchs.</p>'}</div>
  <div class="card"><h2>Équipes</h2><div class="grid2">${tl('Meilleures attaques (buts / m)',t=>t.gf/t.g,t=>f1(t.gf/t.g))}${tl('Meilleures défenses (buts encaissés / m)',t=>t.ga/t.g,t=>f1(t.ga/t.g),true)}${tl('Clean sheets',t=>t.cs,t=>t.cs)}${tl('Matchs sans marquer',t=>t.fts,t=>t.fts)}${tl('Matchs avec +2,5 buts',t=>t.o25/t.g,t=>fpc(t.o25,t.g))}${tl('BTTS (les deux marquent)',t=>t.btts/t.g,t=>fpc(t.btts,t.g))}</div></div>
  <div class="card"><h2>Matchs marquants</h2><div class="grid2"><div><h3>Plus de buts</h3>${ml(gm)}</div><div><h3>Plus gros écarts</h3>${ml(big)}</div><div><h3>Triplés (${hat.length})</h3><table><tbody>${hat.slice(-8).reverse().map(x=>`<tr><td class="l">${plink(x.p.id,x.p.n)} <span class="mut">${esc(x.s==='h'?x.m.hn:x.m.an)}</span></td><td>${x.p.g} buts</td><td class="l">${mlink(x.m,fmtD(x.m.d))}</td></tr>`).join('')||'<tr><td class="empty">–</td></tr>'}</tbody></table></div><div><h3>Matchs avec carton rouge</h3>${ml(reds)}</div></div></div>`;
}

/* ---------- Comparer ---------- */
const FCMP_T=[['Points / match',t=>t.st&&t.st.gp?t.st.pts/t.st.gp:fdiv(3*t.w+t.d,t.g),v=>v.toFixed(2)],['Buts marqués / m',t=>fdiv(t.gf,t.g),f1],['Buts encaissés / m',t=>fdiv(t.ga,t.g),f1,true],['Clean sheets (%)',t=>100*fdiv(t.cs,t.g),v=>Math.round(v)+' %'],['Possession (%)',t=>footTeamAvg(t).poss||0,f1],['Tirs / m',t=>footTeamAvg(t).sh||0,f1],['Cadrés / m',t=>footTeamAvg(t).sot||0,f1],['Corners / m',t=>footTeamAvg(t).cor||0,f1],['Fautes / m',t=>footTeamAvg(t).fl||0,f1,true],['+2,5 buts (%)',t=>100*fdiv(t.o25,t.g),v=>Math.round(v)+' %']];
const FCMP_P=[['Buts',p=>p.g,v=>v],['Passes D.',p=>p.a,v=>v],['Buts / match',p=>fdiv(p.g,p.gp),v=>v.toFixed(2)],['Tirs / match',p=>fdiv(p.sh,p.gp),v=>v.toFixed(1)],['Cadrés / match',p=>fdiv(p.sot,p.gp),v=>v.toFixed(1)],['Précision (%)',p=>100*fdiv(p.sot,p.sh),v=>Math.round(v)],['Fautes / match',p=>fdiv(p.fc,p.gp),v=>v.toFixed(1),true],['Cartons',p=>p.yc+2*p.rc,v=>v,true]];

/* ================= Multiplex foot ================= */
function multiAll(){
  const {mt}=footIdx(), M={};
  for(const m of mt) M[m.id]={id:m.id,lg:m.lg,d:m.d,hn:m.hn,an:m.an,hid:m.hid,aid:m.aid,hl:m.hl,al:m.al,st:m.done?'post':(m.st||'pre'),hs:m.hs||0,as:m.as||0,txt:'',
    ev:((m.x&&m.x.ev)||[]).filter(e=>e.t==='g'||e.t==='pg'||e.t==='og'||e.t==='rc').map(e=>({t:e.t,min:e.m,ms:e.ms,p:e.p,s:e.s}))};
  for(const it of (liveData.items||[])){ if(it.k!=='f') continue;
    const o=M[it.id]||(M[it.id]={id:it.id,lg:it.lg,d:it.d,hn:it.h.n,an:it.a.n,hid:it.h.id,aid:it.a.id,hl:it.h.l,al:it.a.l,ev:[]});
    o.st=it.done?'post':it.st; o.hs=it.h.s; o.as=it.a.s; o.txt=it.st==='in'?liveText(it):'';
    if(it.ev&&it.ev.length) o.ev=it.ev.filter(e=>e.g||e.rc).map(e=>({t:e.rc?'rc':e.og?'og':e.pg?'pg':'g',min:parseInt(e.m)||0,ms:e.m,p:e.p,s:e.s})); }
  return M;
}
function multiDetect(){
  const now=Date.now(), M=multiAll(), by={}, out=[];
  for(const m of Object.values(M)){ const t=Date.parse(m.d); if(!t||t<now-3.5*36e5||t>now+36*36e5) continue; (by[m.lg] ||= []).push({...m,t}); }
  for(const [lg,L] of Object.entries(by)){ L.sort((a,b)=>a.t-b.t);
    for(let i=0;i<L.length;i++){ const c=L.filter(x=>x.t>=L[i].t&&x.t<=L[i].t+30*6e4); if(c.length>=3){ out.push({lg,start:L[i].t,ms:c}); i+=c.length-1; } } }
  return out.sort((a,b)=>a.start-b.start);
}
const multiLive=lg=>{ try{ return multiDetect().some(d=>d.lg===lg&&d.start<=Date.now()+20*6e4); }catch(e){ return false; } };
function multiBanner(){
  const D=multiDetect().filter(d=>!mhide[d.lg+':'+d.start]); if(!D.length) return '';
  const today=parisDK(new Date().toISOString());
  return D.slice(0,2).map(d=>{ const iso=new Date(d.start).toISOString(), live=d.ms.some(m=>m.st==='in'), hr=+new Date(iso).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',hour12:false}).slice(0,2), day=parisDK(iso)===today?(hr>=18?'ce soir':'aujourd\'hui'):(hr>=18?'demain soir':'demain');
    return `<div class="card" style="border-left:4px solid #e04030"><div class="row between"><div>🔥 <b>Multiplex ${esc(footLgName(d.lg))} ${live?'en cours':day}</b> : ${d.ms.length} matchs à ${esc(parisT(iso))}</div><div class="row" style="gap:6px"><button data-act="multigo" data-lg="${esc(d.lg)}" data-d="${esc(parisDK(iso))}">${live?'Suivre en direct':'Ouvrir'}</button><button class="sec" data-act="mbanx" data-k="${esc(d.lg+':'+d.start)}" title="Masquer cette bannière">✕</button></div></div></div>`; }).join('');
}
function multiTable(lg,ms){
  const LG=foot.leagues[lg]; if(!LG||!LG.standings.length) return '';
  const upd=LG.upd||0, rows=LG.standings.map(r=>({...r,np:r.pts,ngd:r.gd,ngf:r.gf,pl:null})), by=Object.fromEntries(rows.map(r=>[r.id,r]));
  let used=0;
  for(const m of ms){ if(m.st!=='in'&&m.st!=='post') continue; const tt=Date.parse(m.d); if(m.st==='post'&&upd>=tt+115*6e4) continue; used++;
    for(const [id,gf,ga] of [[m.hid,m.hs,m.as],[m.aid,m.as,m.hs]]){ const r=by[id]; if(!r) continue; r.np+=gf>ga?3:gf===ga?1:0; r.ngd+=gf-ga; r.ngf+=gf; r.pl=m; r.res=(gf>ga?'gagne ':gf<ga?'perd ':'nul ')+gf+'-'+ga; } }
  const zoneAt=LG.standings.map(r=>r.zone), srt=[...rows].sort((a,b)=>b.np-a.np||b.ngd-a.ngd||b.ngf-a.ngf||a.rank-b.rank); srt.forEach((r,i)=>{ r.nr=i+1; });
  const body=srt.map(r=>{ const mv=r.rank-r.nr, ar=mv>0?`<span style="color:var(--ok)">▲${mv}</span>`:mv<0?`<span style="color:var(--bad)">▼${-mv}</span>`:'<span class="mut">=</span>',
    z=zoneAt[r.nr-1], z0=r.zone, ch=mv!==0&&z&&(!z0||z.d!==z0.d), tag=ch?`<span style="display:block;font-size:11px;color:${esc(z.c||'var(--mut)')}">→ ${esc(zoneFr(z.d))}</span>`:'';
    const sc=r.pl?` <span class="mut" style="font-size:12px">(${r.pl.st==='in'?r.res:r.res.replace(/^gagne/,'a gagné').replace(/^perd/,'a perdu').replace(/^nul/,'nul,')})</span>`:'';
    return `<tr class="${r.pl?'favrow':''}"><td>${r.nr}</td><td>${ar}</td><td class="l">${footLogo(r.logo,18)}${esc(r.name)}${sc}${tag}</td><td><b>${r.np}</b></td><td>${r.ngd>0?'+':''}${r.ngd}</td></tr>`; }).join('');
  return `<div class="card"><h2>📈 Classement live <span class="mut" style="font-weight:400;font-size:12px">· projeté avec les scores du moment${used?'':' (aucun match commencé)'}</span></h2><div class="scroll"><table><thead><tr><th>#</th><th></th><th class="l">Club</th><th>Pts</th><th>Diff.</th></tr></thead><tbody>${body}</tbody></table></div><p class="mut" style="font-size:12px;margin:6px 0 0">Basé sur le dernier classement chargé : « ▲▼ » = places gagnées ou perdues si les scores restent ainsi.</p></div>`;
}
function multiBilan(ms){
  const started=ms.filter(m=>m.st==='in'||m.st==='post'); if(!started.length) return '';
  let goals=0, comeback=null, late=null; const sc={};
  for(const m of started){ goals+=m.hs+m.as; let h=0,a=0, dh=0, da=0;
    for(const e of [...m.ev].sort((x,y)=>x.min-y.min)){ if(e.t==='rc') continue;
      if(e.s==='h') h++; else if(e.s==='a') a++; dh=Math.max(dh,a-h); da=Math.max(da,h-a);
      if(e.p&&(e.t==='g'||e.t==='pg')) sc[e.p]=(sc[e.p]||0)+1;
      if(!late||e.min>late.min) late={min:e.min,ms:e.ms,p:e.p,m,og:e.t==='og'}; }
    if(m.st==='post'){ for(const [side,def] of [['h',dh],['a',da]]){ const my=side==='h'?m.hs:m.as, op=side==='h'?m.as:m.hs; if(def>=1&&my>=op){ const v=def+(my>op?.5:0); if(!comeback||v>comeback.v) comeback={v,def,win:my>op,m,side}; } } } }
  const top=Object.entries(sc).sort((a,b)=>b[1]-a[1]), best=top.length?top.filter(x=>x[1]===top[0][1]).map(x=>x[0]):[];
  const li=[];
  li.push(`⚽ <b>${goals}</b> but${goals>1?'s':''} sur ${started.length} match${started.length>1?'s':''} commencé${started.length>1?'s':''}`);
  if(comeback){ const m=comeback.m, nm=comeback.side==='h'?m.hn:m.an; li.push(`🔄 <b>Plus gros retournement</b> : ${esc(nm)} était mené de ${comeback.def} but${comeback.def>1?'s':''} et ${comeback.win?'gagne':'égalise'} (${esc(m.hn)} ${m.hs}-${m.as} ${esc(m.an)})`); }
  if(late&&late.min>0) li.push(`⏱️ <b>But le plus tardif</b> : ${esc(late.p||'?')} à la ${esc(late.ms||late.min+"'")}${late.og?' (csc)':''} (${esc(late.m.hn)} - ${esc(late.m.an)})`);
  if(best.length&&(top[0][1]>=2||best.length===1)) li.push(`👑 <b>Meilleur buteur de la soirée</b> : ${best.slice(0,3).map(esc).join(', ')+(best.length>3?' et '+(best.length-3)+(best.length-3>1?' autres':' autre'):'')} (${top[0][1]} but${top[0][1]>1?'s':''})`);
  return `<div class="card"><h2>📊 Bilan de la soirée</h2>${li.map(x=>`<p style="margin:6px 0">${x}</p>`).join('')}</div>`;
}
const KEYMP='suivi-multi-pick', KEYMH='suivi-multi-hide'; let mhide=loadJ(KEYMH,{});
let mpick=loadJ(KEYMP,{});
function mpickToggle(id,d){ const on=!mpick[id]; if(on) mpick[id]=Date.parse(d)||Date.now(); else delete mpick[id]; const lim=Date.now()-2*864e5; for(const k in mpick) if(mpick[k]<lim) delete mpick[k]; saveJ(KEYMP,mpick); return on; }
const mpickStar=m=>(nfav.foot.includes(m.hid)||nfav.foot.includes(m.aid))?'<span title="Club à étoile dorée : toujours dans ton multiplex" style="opacity:.85;font-size:18px;padding:2px">⭐</span>':`<span class="link mpk" data-act="mpick" data-id="${esc(m.id)}" data-d="${esc(m.d)}" title="${mpick[m.id]?'Retirer de':'Ajouter à'} mon multiplex">${mpick[m.id]?'⭐':'☆'}</span>`;
// matchs du jour (date de Paris) + ceux encore en cours (un match qui déborde après minuit)
const todayDK=()=>parisDK(new Date().toISOString());
const multiDay=()=>ui.fMultiDay||todayDK();
const dayDK=t=>parisDK(new Date(t).toISOString());
function multiDays(){ const t=todayDK(), lim=Date.now()+7*864e5, s=new Set([t]); for(const m of Object.values(multiAll())){ const x=Date.parse(m.d); if(x&&x<=lim) s.add(parisDK(m.d)); } return [...s].filter(d=>d>=t).sort().slice(0,7); }
const dayLabel=d=>{ const t=todayDK(), tm=dayDK(Date.now()+864e5); return d===t?'Aujourd\'hui':d===tm?'Demain':new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric'}); };
// matchs du jour choisi (date de Paris) ; aujourd'hui : aussi ceux encore en cours (match qui déborde après minuit)
const multiWin=m=>{ const day=multiDay(); if(day===todayDK()&&m.st==='in') return true; return !!Date.parse(m.d)&&parisDK(m.d)===day; };
function multiSet(lg){
  const M=Object.values(multiAll()), byT=(a,b)=>Date.parse(a.d)-Date.parse(b.d);
  if(lg==='all') return M.filter(multiWin).sort(byT);
  if(lg==='pick') return M.filter(m=>multiWin(m)&&(mpick[m.id]||nfav.foot.includes(m.hid)||nfav.foot.includes(m.aid))).sort(byT);
  return M.filter(m=>m.lg===lg&&multiWin(m)).sort(byT);
}
function footMultiView(){
  if(ui.fMultiDay&&ui.fMultiDay<todayDK()) ui.fMultiDay=null;
  const now=Date.now(), day=multiDay(), M=Object.values(multiAll()), det=multiDetect().filter(d=>dayDK(d.start)===day||(day===todayDK()&&d.ms.some(m=>m.st==='in')));
  const dbar=`<div class="row" style="gap:6px;margin:0 0 10px;flex-wrap:wrap;align-items:center">${multiDays().map(d=>`<button class="${d===day?'':'sec'} fbtn" data-act="mday" data-d="${d}">${esc(dayLabel(d))}</button>`).join('')}<button class="sec fbtn" data-act="multiclose" title="Fermer le multiplex" style="margin-left:auto">✕ Fermer</button></div>`;
  const lgs=FLG.filter(([c])=>det.some(d=>d.lg===c)||M.some(m=>m.lg===c&&multiWin(m)));
  const opts=[['all','🌍 Tous les championnats'],['pick','⭐ Ma sélection'],...lgs.map(([c,n])=>[c,(det.some(d=>d.lg===c)?'🔥 ':'')+n])];
  let lg=ui.fMulti; if(!opts.find(x=>x[0]===lg)) lg='all';
  let h=footControls()+dbar;
  if(!lgs.length) return h+`<div class="card"><h2>🔥 Multiplex</h2><p class="mut">Aucun match ${day===todayDK()?'aujourd\'hui':'ce jour-là'}. Quand au moins 3 matchs d'un même championnat commencent à moins de 30 minutes d'écart, Statify te prévient ici et sur l'accueil foot. Actualise les scores (🔄) pour charger le calendrier.</p></div>`;
  const ms=multiSet(lg), mixed=new Set(ms.map(m=>m.lg)).size>1, isMx=det.some(d=>d.lg===lg), live=ms.filter(m=>m.st==='in').length;
  const rank=m=>{ const c=liveMem['f'+m.id]; return (c&&c.chg&&now-c.chg<90000)?0:m.st==='in'?1:m.st==='pre'?2:3; };
  const sorted=[...ms].sort((a,b)=>rank(a)-rank(b)||(rank(a)===0?liveMem['f'+b.id].chg-liveMem['f'+a.id].chg:rank(a)===3?Date.parse(b.d)-Date.parse(a.d):Date.parse(a.d)-Date.parse(b.d)));
  const evl=(m,sd)=>m.ev.filter(e=>e.s===sd).sort((x,y)=>x.min-y.min).map(e=>`<div>${e.t==='rc'?'🟥':'⚽'} ${esc(e.p||'?')} ${esc(e.ms||e.min+"'")}${e.t==='og'?' (csc)':e.t==='pg'?' (pen.)':''}</div>`).join('');
  const prog=m=>{ const t=String(m.txt||''); if(/mi-?temps|half/i.test(t)) return 50; const k=t.match(/(\d+)/); return k?Math.max(2,Math.min(100,Math.round(+k[1]/90*100))):0; };
  const evl2=(m,sd)=>m.ev.filter(e=>e.s===sd).sort((x,y)=>x.min-y.min).map(e=>`<div>${e.t==='rc'?'🟥':'⚽'} ${esc(e.p||'?')} <span>${esc(e.ms||e.min+"'")}${e.t==='og'?' (csc)':e.t==='pg'?' (pen.)':''}</span></div>`).join('');
  const card=m=>{ const c=liveMem['f'+m.id], recent=c&&c.chg&&now-c.chg<90000, fv=nfav.foot.includes(m.hid)||nfav.foot.includes(m.aid), pk=!!mpick[m.id], lv=m.st==='in';
    const pill=m.st==='pre'?`<span class="mxp pre">${esc(parisT(m.d))}</span>`:m.st==='post'?'<span class="mxp fin">TERMINÉ</span>':`<span class="mxp live"><i></i>${esc(m.txt||'En cours')}</span>`;
    const pr=lv?prog(m):0, sc=m.st==='pre'?'<span class="mut">–</span>':`${m.hs}<small>:</small>${m.as}`;
    const bg=stuFootBig(m); return `<div class="mxc${fv?' fv':''}${recent?' gl':''}${bg?' big':''}" data-act="fmatch" data-id="${esc(m.id)}">${bg?`<div class="bigtag">🔥 ${esc(bg)}</div>`:''}${recent?`<div class="mxg">⚽ BUT ! · il y a ${Math.max(1,Math.round((now-c.chg)/1000))} s</div>`:''}<div class="mxh"><span class="mut">${mixed?esc(footLgName(m.lg)):''}</span>${pill}<span class="mxs">${mpickStar(m)}</span></div><div class="mxr"><div class="mxt">${footLogo(m.hl,28)}<b>${esc(m.hn)}</b></div><div class="mxsc">${sc}</div><div class="mxt r"><b>${esc(m.an)}</b>${footLogo(m.al,28)}</div></div>${pr?`<div class="mxb"><div style="width:${pr}%"></div></div>`:''}${m.ev.length?`<div class="mxe"><div>${evl2(m,'h')}</div><div style="text-align:right">${evl2(m,'a')}</div></div>`:''}</div>`; };
  const SEC=[[0,'⚡ Ça vient de bouger'],[1,'🔴 En cours'],[2,'⏰ À venir'],[3,'🏁 Terminés']];
  const onlyLive=live>0&&!ui.mxAll, hid=onlyLive?sorted.filter(m=>rank(m)>=2).length:0;
  const secHtml=SEC.filter(([r])=>!onlyLive||r<=1).map(([r,t])=>{ const L=sorted.filter(m=>rank(m)===r); return L.length?`<div class="mxl">${t}</div>${L.map(card).join('')}`:''; }).join('')
    +(live>0&&(hid||ui.mxAll)?`<div style="text-align:center;margin:8px 0"><button class="sec" data-act="mxall">${ui.mxAll?'Masquer les matchs à venir et terminés':'Voir aussi les '+hid+' autre'+(hid>1?'s':'')+' match'+(hid>1?'s':'')+' (à venir / terminés)'}</button></div>`:'');
  const first=ms.length?ms[0]:null, title=lg==='all'?'🌍 Multiplex tous championnats':lg==='pick'?'⭐ Mon multiplex':`🔥 ${isMx?'Multiplex':'Soirée'} ${esc(footLgName(lg))}`;
  const empty=lg==='all'?`<p class="mut">Aucun match ${day===todayDK()?'aujourd\'hui':'ce jour-là'}.${(()=>{ const nx=M.filter(m=>m.st==='pre'&&Date.parse(m.d)>now).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d))[0]; return nx?' Prochain match : '+esc(parisD(nx.d))+' à '+esc(parisT(nx.d))+'.':''; })()}</p>`:lg==='pick'?'<p class="mut">Aucun match de ta sélection ce jour-là. Choisis « 🌍 Tous les championnats » et touche ☆ sur les matchs que tu veux suivre (les matchs de tes clubs à étoile dorée y sont ajoutés d\'office).</p>':'<p class="mut">Aucun match.</p>';
  const goals=ms.reduce((n,m)=>n+(m.st==='pre'?0:(+m.hs||0)+(+m.as||0)),0), dd=new Date(Date.parse(first?first.d:Date.now())).toLocaleDateString('fr-FR',{...PARIS,weekday:'long',day:'numeric',month:'long'});
  h+=`<div class="mxhero"><div class="row between" style="gap:10px;align-items:flex-start;flex-wrap:wrap"><div style="min-width:0"><h2 style="margin:0">${live?'<span class="livedot"></span>':''}${title}</h2><div class="mut" style="font-size:12px;margin-top:2px;text-transform:capitalize">${esc(dd)} · heure de Paris</div></div><select id="fMulti" style="max-width:100%">${opts.map(([c,n])=>`<option value="${esc(c)}" ${c===lg?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
  <div class="mxchips"><div><b>${ms.length}</b><span>Matchs</span></div><div><b class="${live?'err':''}">${live}</b><span>En cours</span></div><div><b>${goals}</b><span>Buts</span></div></div>
  <div class="row" style="margin-top:12px;gap:8px"><button class="sec" data-act="sndtoggle">${sndPref()==='0'?'🔇 Son de but : coupé':'🔊 Son de but : activé'}</button><button class="sec" data-act="gbtest">▶ Tester le bandeau</button><button class="sec rb-btn" data-act="radio">${radio.on?'⏸ Couper RMC':'📻 Écouter RMC en direct'}</button></div>
  ${ms.length?`<p class="mut" style="margin:10px 0 0;font-size:12px">${first?'Premier coup d\'envoi à '+esc(parisT(first.d))+' · ':''}touche ☆ pour ajouter un match à ta sélection</p>`:''}</div>${secHtml||`<div class="card">${empty}</div>`}`;
  // classement live : un championnat à la fois
  const tl=[...new Set(ms.map(m=>m.lg))].filter(l=>foot.leagues[l]&&foot.leagues[l].standings.length);
  if(tl.length){ const liveLg=(ms.find(m=>m.st==='in')||{}).lg; let cur=ui.fMultiT; if(!tl.includes(cur)) cur=tl.includes(liveLg)?liveLg:tl[0];
    let tb=multiTable(cur,ms.filter(m=>m.lg===cur));
    if(tl.length>1) tb=tb.replace('<h2>📈 Classement live',`<div class="row" style="margin-bottom:6px"><select id="fMultiT">${tl.map(l=>`<option value="${esc(l)}" ${l===cur?'selected':''}>${esc(footLgName(l))}</option>`).join('')}</select></div><h2>📈 Classement live`);
    h+=tb; }
  h+=multiBilan(ms);
  return h;
}

function footCompareView(){
  const {T,P,done}=footIdx(), pl=(ui.fCmpMode||'teams')==='players', lg=ui.fLg&&ui.fLg!=='mine'?ui.fLg:'';
  const src=pl?Object.values(P).filter(p=>p.gp>=1&&inLg(p,lg)).sort((a,b)=>(b.g+b.a)-(a.g+a.a)):Object.values(T).filter(t=>t.g>0&&inLg(t,lg)).sort((a,b)=>((a.st?a.st.rank:99)-(b.st?b.st.rank:99))||b.w-a.w);
  let h=footControls()+`<div class="card"><div class="row" style="margin-bottom:12px"><select id="fCmpMode"><option value="teams" ${!pl?'selected':''}>Clubs</option><option value="players" ${pl?'selected':''}>Joueurs</option></select>${footLgSel('fLg',lg,true,false)}`;
  if(src.length<2) return h+'</div><p class="mut">Il faut au moins deux '+(pl?'joueurs':'clubs')+' avec des matchs en mémoire.</p></div>';
  const key=o=>o.id; if(!src.find(o=>key(o)===ui.fCmpA)) ui.fCmpA=key(src[0]); if(!src.find(o=>key(o)===ui.fCmpB)||ui.fCmpB===ui.fCmpA) ui.fCmpB=key(src.find(o=>key(o)!==ui.fCmpA));
  const lab=o=>pl?`${o.n} (${o.tn})`:o.n, sel=(id,cur)=>`<select id="${id}">${src.map(o=>`<option value="${esc(key(o))}" ${key(o)===cur?'selected':''}>${esc(lab(o))}</option>`).join('')}</select>`;
  h+=`${sel('fCmpA',ui.fCmpA)}<span class="mut">contre</span>${sel('fCmpB',ui.fCmpB)}</div>`;
  const a=src.find(o=>key(o)===ui.fCmpA), b=src.find(o=>key(o)===ui.fCmpB), [ca,cb]=pickColors([fcol(pl?a.tco:a.co),fcol(pl?b.tco:b.co)]), specs=pl?FCMP_P:FCMP_T;
  const hd=(o,c)=>pl?`<div class="row">${footAv(o.id,o.n,o.tco,44)}<b style="color:${c}">${esc(lab(o))}</b></div>`:`<div class="row">${footLogo(o.lo,40)}<b style="color:${c}">${esc(o.n)}</b></div>`;
  h+=`<div class="row between">${hd(a,ca)}${hd(b,cb)}</div>`;
  h+=specs.map(([l,fn,fm,low])=>{ const x=fn(a),y=fn(b),m=Math.max(Math.abs(x),Math.abs(y))||1, aw=low?x<y:x>y, bw=low?y<x:y>x; return `<div class="cmp"><div class="cv ${aw?'win':''}">${fm(x)}</div><div class="cb l"><i class="${aw?'w':''}" style="width:${Math.max(0,x)/m*100}%;background:${ca}"></i></div><div class="cl" style="font-size:11px">${l}</div><div class="cb r"><i class="${bw?'w':''}" style="width:${Math.max(0,y)/m*100}%;background:${cb}"></i></div><div class="cv ${bw?'win':''}">${fm(y)}</div></div>`; }).join('');
  if(!pl){ h+=`<h3>Profil comparé</h3>${radarChart(FRADT,[{name:a.n,color:ca,vals:footRadarT(T,a)},{name:b.n,color:cb,vals:footRadarT(T,b)}],'clubs')}`;
    const hh=done.filter(m=>(m.hid===a.id&&m.aid===b.id)||(m.hid===b.id&&m.aid===a.id)).sort((x,y)=>Date.parse(y.d)-Date.parse(x.d));
    h+=cmpExtraFoot(a,b);
    h+=`<h3>Confrontations directes en mémoire</h3>${hh.length?`<div class="scroll"><table><tbody>${hh.map(m=>`<tr class="click" data-act="fmatch" data-id="${esc(m.id)}"><td class="l">${fmtD(m.d)}</td><td class="l">${esc(m.hn)}</td><td><b>${m.hs} - ${m.as}</b></td><td class="l">${esc(m.an)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="mut">Aucune.</p>'}`; }
  else { const pe=Object.values(P).filter(x=>x.lg===a.lg&&x.gp>=2), v=o=>footRadarV(o), all=pe.map(v);
    h+=`<h3>Profil comparé</h3>${pe.length>=3?radarChart(FRADP,[{name:a.n,color:ca,vals:v(a).map((x,i)=>pctOf(all.map(z=>z[i]),x))},{name:b.n,color:cb,vals:v(b).map((x,i)=>pctOf(all.map(z=>z[i]),x))}],'joueurs du championnat'):'<p class="mut">Pas assez de joueurs.</p>'}`;
    const n=Math.max(a.log.length,b.log.length), cu=o=>{ let s=0; return Array.from({length:n},(_,i)=>o.log[i]?(s+=o.log[i].g):null); };
    if(n>1) h+=`<h3>Buts cumulés (match après match)</h3>${lineChart([{name:a.n,values:cu(a),color:ca},{name:b.n,values:cu(b),color:cb}],Array.from({length:n},(_,i)=>'M'+(i+1)))}`; }
  return h+'</div>';
}

/* ---------- Calendrier ---------- */
function footCalView(){
  const {mt}=footIdx(); let ms=footMatches();
  const w=ui.fCalWhen||'up', now=Date.now()-3*36e5, mk=t=>{ const d=new Date(t); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); };
  const months=[...new Set(ms.map(m=>mk(m.d)))].sort();
  if(w==='up') ms=ms.filter(m=>!m.done&&Date.parse(m.d)>=now); else if(w==='past') ms=ms.filter(m=>m.done);
  if(ui.fCalTeam) ms=ms.filter(m=>m.hid===ui.fCalTeam||m.aid===ui.fCalTeam); if(ui.fCalMonth) ms=ms.filter(m=>mk(m.d)===ui.fCalMonth);
  const teams=[...new Map(footMatches().flatMap(m=>[[m.hid,m.hn],[m.aid,m.an]])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  ms=[...ms].sort((a,b)=>(Date.parse(a.d)-Date.parse(b.d))*(w==='past'?-1:1));
  const bg=new Set(footBig(40).map(i=>i.m.id)); let rows='', last='';
  for(const m of ms.slice(0,ui.fCalLimit||250)){ const d=new Date(m.d), dk=d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); if(dk!==last){ rows+=`<tr><th class="l" colspan="6" style="text-transform:capitalize">${esc(dk)}</th></tr>`; last=dk; }
    const mine=ffav.includes(m.hid)||ffav.includes(m.aid);
    rows+=`<tr class="click ${mine?'favrow':''}" data-act="fmatch" data-id="${esc(m.id)}"><td class="l" style="width:26px;padding-right:0">${m.done?'':mpickStar(m)}</td><td class="l">${esc(d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}))}${bg.has(m.id)?' 🔥':''}</td><td class="l mut">${esc(footLgName(m.lg))}</td><td class="l ${m.done&&m.hs>m.as?'win':''}">${footWho(m)}</td><td class="l ${m.done&&m.as>m.hs?'win':''}">${footLogo(m.al,18)}${esc(m.an)}</td><td>${m.done?`<b>${m.hs} - ${m.as}</b>`:m.st==='in'?`<span class="err">🔴 ${m.hs}-${m.as}</span>`:''}</td></tr>`; }
  const opt=(v,l,cur)=>`<option value="${esc(v)}" ${cur===v?'selected':''}>${esc(l)}</option>`;
  return footControls()+`<div class="card"><div class="row" style="margin-bottom:10px">${footLgSel('fLg',ui.fLg,true,true)}<select id="fCalWhen">${opt('up','Matchs à venir',w)}${opt('past','Matchs joués',w)}${opt('all','Toute la saison',w)}</select><select id="fCalTeam">${opt('','Tous les clubs',ui.fCalTeam||'')}${teams.map(([id,n])=>opt(id,n,ui.fCalTeam||'')).join('')}</select><select id="fCalMonth">${opt('','Tous les mois',ui.fCalMonth||'')}${months.map(m=>opt(m,new Date(m+'-15').toLocaleDateString('fr-FR',{month:'long',year:'numeric'}),ui.fCalMonth||'')).join('')}</select></div><p class="mut" style="margin:0 0 8px">${ms.length} match(s) · heures dans ton fuseau · 🔥 = à ne pas manquer · ☆ = ajouter le match à ton multiplex · ligne colorée = un de tes clubs · pour tout le calendrier : « Toute la saison » dans le menu d'actualisation</p><div class="scroll"><table><tbody>${rows||'<tr><td class="empty" colspan="5">Aucun match.</td></tr>'}</tbody></table></div>${ms.length>(ui.fCalLimit||250)?`<div style="margin-top:8px"><button class="sec" data-act="fcalmore">Afficher plus</button></div>`:''}</div>`;
}



/* ---------- Radio RMC en direct (écoute perso) ---------- */
const RADIO={n:'RMC',u:['https://audio.bfmtv.com/rmcradio_128.mp3','http://audio.bfmtv.com/rmcradio_128.mp3']};
const radio={el:null,on:false,load:false,err:'',i:0};
function radioUI(){
  let b=document.getElementById('radioBar');
  if(!b){ b=document.createElement('div'); b.id='radioBar'; document.body.appendChild(b); }
  const show=radio.on||radio.err; b.classList.toggle('on',!!show);
  b.innerHTML=show?`<span class="rb-ic">📻</span><div class="rb-tx"><b>${esc(RADIO.n)}</b><span>${radio.err?esc(radio.err):radio.load?'Connexion…':'En direct'}</span></div>${radio.on&&!radio.load&&!radio.err?'<span class="rb-eq"><i></i><i></i><i></i><i></i></span>':''}<button data-act="radio" title="${radio.on?'Couper':'Écouter'}">${radio.on?'⏸':'▶'}</button><button class="x" data-act="radiox" title="Fermer">✕</button>`:'';
  document.querySelectorAll('.rb-btn').forEach(x=>{ x.textContent=radio.on?'⏸ Couper RMC':'📻 Écouter RMC en direct'; });
}
function radioPlay(){
  if(!radio.el){ const a=radio.el=new Audio(); a.preload='none';
    a.addEventListener('playing',()=>{ radio.load=false; radio.err=''; radioUI(); });
    a.addEventListener('waiting',()=>{ if(radio.on){ radio.load=true; radioUI(); } });
    a.addEventListener('error',()=>{ if(!radio.on) return; if(radio.i<RADIO.u.length-1){ radio.i++; radioStart(); } else { radio.on=false; radio.load=false; radio.err='Flux indisponible pour le moment.'; radio.i=0; radioUI(); } }); }
  radio.on=true; radio.err=''; radioStart();
  try{ if('mediaSession' in navigator){ navigator.mediaSession.metadata=new MediaMetadata({title:'RMC en direct',artist:'Statify',artwork:[{src:'icon-512.png',sizes:'512x512',type:'image/png'}]}); navigator.mediaSession.setActionHandler('pause',radioStop); navigator.mediaSession.setActionHandler('stop',radioStop); navigator.mediaSession.setActionHandler('play',radioPlay); } }catch(e){}
}
function radioStart(){ radio.load=true; radioUI(); const a=radio.el; a.src=RADIO.u[radio.i]+(RADIO.u[radio.i].includes('?')?'&':'?')+'t='+Date.now(); a.play().catch(e=>{ if(!radio.on) return; radio.on=false; radio.load=false; radio.err=/NotAllowed/i.test(e&&e.name||'')?'Touche ▶ pour lancer la radio.':'Lecture impossible.'; radioUI(); }); }
function radioStop(){ radio.on=false; radio.load=false; if(radio.el){ try{ radio.el.pause(); radio.el.removeAttribute('src'); radio.el.load(); }catch(e){} } radioUI(); }
document.addEventListener('click',e=>{ const b=e.target.closest('[data-act=radio],[data-act=radiox]'); if(!b) return; e.stopPropagation(); if(b.dataset.act==='radiox'){ radioStop(); radio.err=''; radioUI(); } else if(radio.on) radioStop(); else radioPlay(); },true);
/* ---------- Pseudo affiché sur les images du Studio (gardé de l'ancien mode Live TikTok : même réglage mémorisé) ---------- */
const KEYTT='suivi-ttk'; const ttk={handle:'',...loadJ(KEYTT,{})};
const ttkSave=()=>saveJ(KEYTT,{handle:ttk.handle});
function viewFoot(){
  const v={home:footHome,multi:footMultiView,matches:footMatchesView,table:footTableView,teams:footTeamsView,players:footPlayersView,records:footRecordsView,compare:footCompareView,cal:footCalView}[ui.ftab]||footHome;
  return v();
}
function footModalHtml(){
  const {mt,T,P}=footIdx();
  if(ui.fMatch){ const m=mt.find(x=>x.id===ui.fMatch); if(m) return footMatchModal(m); }
  if(ui.fTeam&&T[ui.fTeam]) return footTeamModal(T[ui.fTeam]);
  if(ui.fPlayer&&P[ui.fPlayer]) return footPlayerModal(P[ui.fPlayer]);
  return '';
}
function footCsv(){
  const l=footPlayersList(), head=['Joueur','Club','Poste','MJ','Titu.','Buts','PD','Tirs','Cadrés','Jaunes','Rouges','Arrêts','CS','Fautes'];
  download('foot-joueurs.csv','﻿'+[head,...l.map(p=>[p.n,p.tn,POSL[p.pg],p.gp,p.gs,p.g,p.a,p.sh,p.sot,p.yc,p.rc,p.sv,p.cs,p.fc])].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n'),'text/csv');
}

/* ================= Rendu ================= */
/* fiche ouverte = une étape dans l'historique : le bouton retour du téléphone la referme */
let modalWas=false;
function modalHist(on){
  try{ if(on&&!modalWas) history.pushState({statifyModal:1},''); else if(!on&&modalWas&&history.state&&history.state.statifyModal) history.back(); }catch(e){}
  modalWas=on;
}
window.addEventListener('popstate',()=>{ if($('#modal').classList.contains('on')){ modalWas=false; closeModals(); render(); } });
function render(){
  const act=document.activeElement, aid=act&&act.id, sel=act&&act.selectionStart;
  try{
    const S=buildStats(); S.prev=prevStats();
    const FT=ui.sport==='foot', TT=FT?FTABS:TABS, cur=FT?ui.ftab:ui.tab;
    document.body.classList.toggle('sport-foot',FT);
    document.querySelectorAll('#sportSeg button').forEach(b=>b.classList.toggle('on',b.dataset.sport===ui.sport));
    { const ICO={home:'🏠',games:'📋',matches:'📋',players:'👤',teams:'🛡️',standings:'📊',table:'📊',multi:'🔥',race:'🎯',records:'🏅',compare:'⚖️',rest:'😴',cal:'📅',studio:'🎨'}, cl=l=>l.replace(/^🔥\s*/,'');
      const PRI=FT?['home','multi','matches','table']:['home','games','players','teams'], pri=TT.filter(([k])=>PRI.includes(k)), rest=TT.filter(([k])=>!PRI.includes(k)), inRest=rest.some(([k])=>k===cur);
      const tb=([k,l])=>`<button data-act="tab" data-t="${k}" class="${cur===k?'on':''}"><i>${ICO[k]||'•'}</i><span>${esc(cl(l))}</span></button>`;
      $('#tabs').innerHTML=pri.map(tb).join('')+`<button data-act="pronos"><i>🎯</i><span>Pronos</span></button><button data-act="tabmore" class="${inRest||ui.tabMore?'on':''}"><i>⋯</i><span>Plus</span></button>`+(ui.tabMore?`<div class="tabsheet">${rest.map(tb).join('')}</div>`:''); }
    const v={home:viewHome,games:viewGames,players:viewPlayers,teams:viewTeams,standings:viewStandings,race:viewRace,records:viewRecords,compare:viewCompare,rest:viewRest,cal:viewCal,studio:()=>viewStudio('nba')}[ui.tab];
    $('#view').innerHTML=FT?viewFoot():v(S);
    const M=$('#modal'), mb=M.firstElementChild, keep=M.classList.contains('on')?M.scrollTop:0;
    let mh='';
    if(FT) mh=footModalHtml();
    else if(ui.newsRead) mh=newsReaderHtml(ui.newsRead);
    else if(ui.openPlayer&&S.P[ui.openPlayer]) mh=playerDetail(S,S.P[ui.openPlayer]);
    else if(ui.openTeam&&S.T[ui.openTeam]) mh=teamDetail(S,S.T[ui.openTeam]);
    else if(ui.openGame&&gameOrSched(ui.openGame)) mh=boxScore(gameOrSched(ui.openGame));
    mb.innerHTML=mh; M.classList.toggle('on',!!mh); document.body.style.overflow=mh?'hidden':''; M.scrollTop=keep; modalHist(!!mh);
    try{ renderLeaders(S); }catch(e){}
  }catch(e){ console.error(e); $('#view').innerHTML='<div class="card err">Erreur d\'affichage : '+esc(e.message)+'</div>'; }
  renderBackup(); renderSync(); try{ liveRender(); }catch(e){}
  if(aid==='pSearch'||aid==='fpQ'||aid==='stuTitle'||aid==='stuHandle'){ const n=document.getElementById(aid); if(n){ n.focus(); try{ n.setSelectionRange(sel,sel); }catch(e){} } }
}

/* ================= Export ================= */
function download(name,data,type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500); }
function exportCsv(){
  const S=buildStats(), head=['Joueur','Equipe','MJ','MIN','PTS','PTS tot.','REB','AST','STL','BLK','TO','FG%','3P%','LF%','TS%'];
  const rows=Object.values(S.P).sort((a,b)=>b.pts/b.gp-a.pts/a.gp).map(r=>[r.name,r.tri,r.gp,(r.min/r.gp).toFixed(1),(r.pts/r.gp).toFixed(1),r.pts,(r.reb/r.gp).toFixed(1),(r.ast/r.gp).toFixed(1),(r.stl/r.gp).toFixed(1),(r.blk/r.gp).toFixed(1),(r.to/r.gp).toFixed(1),r.fga?(100*r.fgm/r.fga).toFixed(1):'',r.tpa?(100*r.tpm/r.tpa).toFixed(1):'',r.fta?(100*r.ftm/r.fta).toFixed(1):'',(r.fga+r.fta)?(100*ts(r)).toFixed(1):'']);
  download('stats-joueurs.csv','﻿'+[head,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n'),'text/csv');
}
const CRC=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
function crc32(u8){ let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c=CRC[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function zipStore(files){
  const enc=new TextEncoder(), u16=n=>[n&255,(n>>8)&255], u32=n=>[n&255,(n>>8)&255,(n>>16)&255,(n>>>24)&255];
  const parts=[],central=[]; let off=0;
  for(const f of files){
    const name=enc.encode(f.name), data=enc.encode(f.data), crc=crc32(data);
    const lh=new Uint8Array([0x50,0x4b,3,4,...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)]);
    parts.push(lh,name,data);
    central.push(new Uint8Array([0x50,0x4b,1,2,...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),name);
    off+=lh.length+name.length+data.length;
  }
  const csize=central.reduce((s,a)=>s+a.length,0);
  const end=new Uint8Array([0x50,0x4b,5,6,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(csize),...u32(off),...u16(0)]);
  const all=[...parts,...central,end], out=new Uint8Array(all.reduce((s,a)=>s+a.length,0)); let p=0; for(const a of all){ out.set(a,p); p+=a.length; } return out;
}
function makeXlsx(sheets){
  const X=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
  const col=i=>{ let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; };
  const files=[];
  files.push({name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>'});
  files.push({name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'});
  files.push({name:'xl/workbook.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>`<sheet name="${X(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets></workbook>'});
  files.push({name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`});
  files.push({name:'xl/styles.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'});
  sheets.forEach((s,i)=>{
    const rows=s.rows.map((r,ri)=>`<row r="${ri+1}">`+r.map((v,ci)=>{ const ref=col(ci)+(ri+1), st=ri===0?' s="1"':'';
      if(typeof v==='number'&&Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
      if(v===''||v==null) return '';
      return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${X(v)}</t></is></c>`; }).join('')+'</row>').join('');
    files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`});
  });
  return zipStore(files);
}
function exportXlsx(){
  const S=buildStats(), n1=x=>+x.toFixed(1), d=g=>(g.time||'').slice(0,10);
  const joueurs=[['Joueur','Équipe','MJ','MIN','PTS','PTS tot.','REB','AST','STL','BLK','TO','FG%','3P%','LF%','TS%','+/-','DD','TD']].concat(Object.values(S.P).sort((a,b)=>b.pts/b.gp-a.pts/a.gp).map(r=>[r.name,r.tri,r.gp,n1(r.min/r.gp),n1(r.pts/r.gp),r.pts,n1(r.reb/r.gp),n1(r.ast/r.gp),n1(r.stl/r.gp),n1(r.blk/r.gp),n1(r.to/r.gp),n1(Math.max(0,pcn(r.fgm,r.fga))),n1(Math.max(0,pcn(r.tpm,r.tpa))),n1(Math.max(0,pcn(r.ftm,r.fta))),n1(Math.max(0,PCOL.ts.v(r))),n1(r.pm/r.gp),r.dd,r.td]));
  const equipes=[['Équipe','MJ','V','D','%V','Pts','Enc.','Pts tot.','Enc. tot.','Diff.','FG%','3P%','REB','AST']].concat(Object.values(S.T).sort((a,b)=>b.w-a.w).map(t=>[t.name,t.g,t.w,t.l,n1(100*t.w/t.g),n1(t.pf/t.g),n1(t.pa/t.g),t.pf,t.pa,n1((t.pf-t.pa)/t.g),n1(Math.max(0,pcn(t.fgm,t.fga))),n1(Math.max(0,pcn(t.tpm,t.tpa))),n1(t.reb/t.g),n1(t.ast/t.g)]));
  const matchs=[['Date','Visiteur','Pts','Domicile','Pts','Statut']].concat(Object.values(games).sort((a,b)=>tms(b)-tms(a)).map(g=>[d(g),g.away.name,+g.away.score,g.home.name,+g.home.score,g.status===3?'Terminé':(g.statusText||'À venir')]));
  const box=[['Date','Équipe','Adversaire','Joueur','MIN','PTS','REB','AST','STL','BLK','TO','FGM','FGA','3PM','3PA','LFM','LFA','+/-']];
  for(const g of S.fin) for(const [me,op] of [[g.away,g.home],[g.home,g.away]]) for(const p of me.players) if(p.min>0) box.push([d(g),me.tri,op.tri,p.name,n1(p.min),p.pts,p.reb,p.ast,p.stl,p.blk,p.to,p.fgm,p.fga,p.tpm,p.tpa,p.ftm,p.fta,p.pm]);
  const bytes=makeXlsx([{name:'Joueurs',rows:joueurs},{name:'Équipes',rows:equipes},{name:'Matchs',rows:matchs},{name:'Box scores',rows:box}]);
  download('statify.xlsx',bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* ================= Événements ================= */
function toggleFav(type,id,name){
  if(type==='team'){ const i=fav.teams.indexOf(id); if(i>=0) fav.teams.splice(i,1); else fav.teams.push(id); }
  else { if(fav.players[id]) delete fav.players[id]; else fav.players[id]=name; }
  saveFav(); render();
}
['#view','#modal','#welcome','#leaders','#syncBar'].forEach(q=>$(q).addEventListener('click',e=>{
  const el=e.target.closest('[data-act]'); if(!el) return;
  const a=el.dataset.act, id=el.dataset.id;
  if(el.closest('#welcome')) closeWelcome();
  if(a==='closewelcome') return;
  if(a==='favteam') toggleFav('team',id);
  else if(a==='favplayer') toggleFav('player',id,el.dataset.name);
  else if(a==='opengame'){ closeModals(); ui.openGame=id; $('#modal').scrollTop=0; render(); }
  else if(a==='closegame'){ ui.openGame=null; render(); }
  else if(a==='aikeysave'){ const v=((document.getElementById('aiKeyIn')||{}).value||'').trim().replace(/\s+/g,''); if(v.length<20){ say('⚠️ Cette clé paraît incomplète : copie-la en entier depuis Google AI Studio.','err'); return; } aiKey=v; aiDraft=''; aiModels=null; try{ localStorage.setItem(KEYAI,v); }catch(e){} for(const k in resErr) delete resErr[k]; say('✓ Clé Gemini enregistrée. Le résumé est en cours de rédaction…','ok'); render(); }
  else if(a==='aikeyreset'){ aiKey=''; aiModels=null; try{ localStorage.removeItem(KEYAI); }catch(e){} for(const k in resErr) delete resErr[k]; render(); }
  else if(a==='resgen'){ const m=footIdx().mt.find(z=>String(z.id)===String(id)); if(m){ delete resumes[String(id)]; resSave(); delete resErr[String(id)]; resGen(m); } }
  else if(a==='pall'){ ui.pAll=!ui.pAll; render(); }
  else if(a==='delgame'){ if(confirm('Supprimer ce match ?')){ delete games[id]; if(ui.openGame===id) ui.openGame=null; save(); render(); } }
  else if(a==='openplayer'){ ui.openPlayer=id; ui.openTeam=null; $('#modal').scrollTop=0; render(); }
  else if(a==='closeplayer'){ ui.openPlayer=null; render(); }
  else if(a==='openteam'){ ui.openTeam=id; ui.openPlayer=null; $('#modal').scrollTop=0; render(); }
  else if(a==='closeteam'){ ui.openTeam=null; render(); }
  else if(a==='sort'){ const k=el.dataset.k; ui.pSort=ui.pSort.k===k?{k,d:-ui.pSort.d}:{k,d:(k==='name'||k==='tri')?1:-1}; render(); }
  else if(a==='csv') exportCsv();
  else if(a==='fmatch'||a==='fteam'||a==='fplayer'){ setSport('foot'); closeModals(); ui[a==='fmatch'?'fMatch':a==='fteam'?'fTeam':'fPlayer']=id; $('#modal').scrollTop=0; render(); }
  else if(a==='fclose'){ closeModals(); render(); }
  else if(a==='newsrefresh') newsRefresh(false);
  else if(a==='newsfav'){ ui.newsFav=!ui.newsFav; render(); }
  else if(a==='newsopen'){ if(e.ctrlKey||e.metaKey||e.shiftKey) return; e.preventDefault(); ui.newsRead=el.dataset.l; newsLoadFull(ui.newsRead); render(); $('#modal').scrollTop=0; }
  else if(a==='newsretry'){ ui.newsFail=null; newsLoadFull(el.dataset.l); render(); }
  else if(a==='newsclose'){ ui.newsRead=null; render(); }
  else if(a==='newsmore'){ ui.newsMore=1; render(); }
  else if(a==='fcarddl') footCardDownload(id);
  else if(a==='fcdel'){ if(ui.fCurve&&ui.fCurve.sel) ui.fCurve.sel=ui.fCurve.sel.filter(i=>i!==id); render(); }
  else if(a==='fcpre'){ const lg=footLgOrFirst(), D=footCurveData(lg); if(D&&ui.fCurve){ const by=[...D.ids].sort((a,b)=>D.rank[a][D.K-1]-D.rank[b][D.K-1]); ui.fCurve.sel=id==='top'?by.slice(0,5):id==='bot'?by.slice(-5):by.filter(i=>ffav.includes(i)).slice(0,8); } render(); }
  else if(a==='footlg'){ ui.fLg=id; ui.fpTeam=ui.fTeamF=ui.fCalTeam=''; render(); }
  else if(a==='footrefresh') footRefresh();
  else if(a==='footmenu'){ ui.fMenu=!ui.fMenu; render(); }
  else if(a==='footper'){ ui.fPer=+el.dataset.i; ui.fMenu=false; render(); footRefresh(); }
  else if(a==='nbarefresh') nbaRefresh();
  else if(a==='mxall'){ ui.mxAll=!ui.mxAll; render(); }
  else if(a==='gbtest'){ sndUnlock(); playGoal(); goalBanner({h:{n:'Lens',s:2,l:''},a:{n:'Nantes',s:1,l:''},lg:'fra.1',id:'demo'},'h',{p:'Sotoca',m:"68'"}); }
  else if(a==='sndtoggle'){ const off=sndPref()!=='0'; try{ localStorage.setItem('suivi-snd',off?'0':'1'); }catch(e){} if(!off){ sndUnlock(); playGoal(true); } render(); }
  else if(a==='nbell'){ nfavToggle(el.dataset.k,id); }
  else if(a==='footfav'){ const i=ffav.indexOf(id); if(i>=0) ffav.splice(i,1); else ffav.push(id); saveJ(KEYFF,ffav); render(); }
  else if(a==='footfavp'){ const i=ffavP.indexOf(id); if(i>=0) ffavP.splice(i,1); else ffavP.push(id); saveJ(KEYFP,ffavP); render(); }
  else if(a==='fsort'){ const k=el.dataset.k; ui.fpSort=(ui.fpSort&&ui.fpSort.k===k)?{k,d:-ui.fpSort.d}:{k,d:k==='n'?1:-1}; render(); }
  else if(a==='fmore'){ ui.fLimit=(ui.fLimit||60)+60; render(); }
  else if(a==='fcalmore'){ ui.fCalLimit=(ui.fCalLimit||250)+250; render(); }
  else if(a==='fcsv') footCsv();
  else if(a==='mpick'){ const on=mpickToggle(id,el.dataset.d); render(); if(ui.ftab!=='multi') say(on?'⭐ Ajouté à ton multiplex : onglet 🔥 Multiplex → « ⭐ Ma sélection » le jour du match.':'Retiré de ton multiplex.','ok'); }
  else if(a==='multigo'){ closeModals(); ui.ftab='multi'; ui.fMulti=el.dataset.lg; ui.fMultiDay=el.dataset.d&&el.dataset.d!==todayDK()?el.dataset.d:null; render(); window.scrollTo(0,0); }
  else if(a==='mday'){ ui.fMultiDay=el.dataset.d===todayDK()?null:el.dataset.d; render(); }
  else if(a==='multiclose'){ ui.ftab='home'; ui.fMultiDay=null; render(); window.scrollTo(0,0); }
  else if(a==='mbanx'){ mhide[el.dataset.k]=Date.now(); for(const k in mhide) if(Date.now()-mhide[k]>4*864e5) delete mhide[k]; saveJ(KEYMH,mhide); render(); }
  else if(a==='cmpgo'){ closeModals(); if(el.dataset.sp==='foot'){ ui.ftab='compare'; ui.fCmpMode='teams'; ui.fCmpA=el.dataset.a; ui.fCmpB=el.dataset.b; ui.fLg=''; } else { ui.tab='compare'; ui.cmpMode='teams'; ui.cmpA=el.dataset.a; ui.cmpB=el.dataset.b; } render(); window.scrollTo(0,0); }
  else if(a==='cmpopen'){ closeModals(); ui.tab='compare'; ui.cmpMode='players'; ui.cmpA=el.dataset.a; ui.cmpB=el.dataset.b; render(); }
  else if(a==='fhomeedit'){ ui.fHomeEdit=!ui.fHomeEdit; render(); }
  else if(a==='fhometoggle'){ const cf=fhomeNorm(), i=cf.hidden.indexOf(id); if(i>=0) cf.hidden.splice(i,1); else cf.hidden.push(id); fhomeCfg=cf; saveJ(KEYFH,fhomeCfg); render(); }
  else if(a==='fhomemove'){ const cf=fhomeNorm(), i=cf.order.indexOf(id), j=i+(+el.dataset.d); if(i>=0&&j>=0&&j<cf.order.length){ [cf.order[i],cf.order[j]]=[cf.order[j],cf.order[i]]; fhomeCfg=cf; saveJ(KEYFH,fhomeCfg); render(); } }
  else if(a==='fhomereset'){ fhomeCfg={order:FHOME_BLOCKS.map(b=>b[0]),hidden:[]}; saveJ(KEYFH,fhomeCfg); render(); }
  else if(a==='homeedit'){ ui.homeEdit=!ui.homeEdit; render(); }
  else if(a==='hometoggle'){ const cf=homeCfgNorm(), i=cf.hidden.indexOf(id); if(i>=0) cf.hidden.splice(i,1); else cf.hidden.push(id); homeCfg=cf; saveJ(KEYH,homeCfg); render(); }
  else if(a==='homemove'){ const cf=homeCfgNorm(), i=cf.order.indexOf(id), j=i+(+el.dataset.d); if(i>=0&&j>=0&&j<cf.order.length){ [cf.order[i],cf.order[j]]=[cf.order[j],cf.order[i]]; homeCfg=cf; saveJ(KEYH,homeCfg); render(); } }
  else if(a==='homereset'){ homeCfg={order:HOME_BLOCKS.map(b=>b[0]),hidden:[]}; saveJ(KEYH,homeCfg); render(); }
  else if(a==='print'){ document.body.classList.add('print-one'); setTimeout(()=>window.print(),50); }
  else if(a==='addfavteam'){ const v=$('#favTeamSel').value; if(v&&!fav.teams.includes(v)){ fav.teams.push(v); saveFav(); render(); } }
}));
$('#modal').addEventListener('click',e=>{ if(e.target.id==='modal'){ closeModals(); render(); } });
$('#mclose').addEventListener('click',()=>{ closeModals(); render(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&$('#welcome').classList.contains('on')){ closeWelcome(); return; } if(e.key==='Escape'&&!tv.on&&(ui.openPlayer||ui.openTeam||ui.openGame||ui.fMatch||ui.fTeam||ui.fPlayer||ui.newsRead)){ closeModals(); render(); } });
$('#modal').addEventListener('change',e=>{ const t=e.target; if(t.dataset&&t.dataset.note){ setNote(t.dataset.note,t.dataset.name,t.value); t.style.borderColor='var(--ok)'; setTimeout(()=>{ t.style.borderColor=''; },900); } });
$('#tabs').addEventListener('click',e=>{ if(e.target.closest('[data-act=pronos]')){ location.href='prono.html'; return; } if(e.target.closest('[data-act=tabmore]')){ ui.tabMore=!ui.tabMore; render(); return; } const b=e.target.closest('[data-act=tab]'); if(b){ ui.tabMore=false; if(ui.sport==='foot'){ if(b.dataset.t!=='multi'||ui.ftab!=='multi'){ ui.fMultiDay=null; if(b.dataset.t==='multi') ui.fMulti='all'; } ui.ftab=b.dataset.t; } else ui.tab=b.dataset.t; closeModals(); render(); } });
$('#view').addEventListener('change',e=>{
  const t=e.target, id=t.id;
  if(t.dataset&&t.dataset.note){ setNote(t.dataset.note,t.dataset.name,t.value); t.style.borderColor='var(--ok)'; setTimeout(()=>{ t.style.borderColor=''; },900); return; }
  if(id==='gTeam') ui.gTeam=t.value; else if(id==='pTeam') ui.pTeam=t.value; else if(id==='pMode'){ ui.pMode=t.value; ui.pSort={k:PMODES[t.value].includes('pts')?'pts':(t.value==='tot'?'tpts':'ts'),d:-1}; }
  else if(id==='pMin') ui.pMin=+t.value; else if(id==='pFav') ui.pFav=t.checked; else if(id==='confF') ui.confF=t.value;
  else if(id==='recMin') ui.recMin=+t.value; else if(id==='weekMin') ui.weekMin=+t.value; else if(id==='schedFav') ui.schedFav=t.checked; else if(id==='calEarly') ui.calEarly=t.checked; else if(id==='raceF') ui.raceF=t.value;
  else if(id==='fLg'){ ui.fLg=t.value; ui.fpTeam=ui.fTeamF=ui.fCalTeam=''; } else if(id==='fTeamF') ui.fTeamF=t.value; else if(id==='fWhen') ui.fWhen=t.value; else if(id==='fpTeam') ui.fpTeam=t.value; else if(id==='fpPos') ui.fpPos=t.value; else if(id==='fpMin') ui.fpMin=+t.value;
  else if(id==='fMulti') ui.fMulti=t.value; else if(id==='fMultiT') ui.fMultiT=t.value; else if(id==='fPer') ui.fPer=+t.value; else if(id==='fTMode') ui.fTMode=t.value; else if(id==='fCurveMode'){ if(ui.fCurve) ui.fCurve.mode=t.value; } else if(id==='fCurveAdd'){ if(ui.fCurve&&t.value&&ui.fCurve.sel&&ui.fCurve.sel.length<8) ui.fCurve.sel.push(t.value); } else if(id==='fCmpMode'){ ui.fCmpMode=t.value; ui.fCmpA=''; ui.fCmpB=''; } else if(id==='fCmpA') ui.fCmpA=t.value; else if(id==='fCmpB') ui.fCmpB=t.value;
  else if(id==='fCalWhen') ui.fCalWhen=t.value; else if(id==='fCalTeam') ui.fCalTeam=t.value; else if(id==='fCalMonth') ui.fCalMonth=t.value; else if(id==='calTeam') ui.calTeam=t.value; else if(id==='calWhen') ui.calWhen=t.value; else if(id==='calMonth') ui.calMonth=t.value;
  else if(/^rkT[012]$/.test(id)){ const cur=[0,1,2].map(i=>(document.getElementById('rkT'+i)||{}).value||''); ui.rkT=cur; }
  else if(id==='cmpMode'){ ui.cmpMode=t.value; ui.cmpA=''; ui.cmpB=''; } else if(id==='cmpA') ui.cmpA=t.value; else if(id==='cmpB') ui.cmpB=t.value;
  else return;
  render();
});
$('#view').addEventListener('input',e=>{ if(e.target.id==='pSearch'){ ui.pSearch=e.target.value; render(); } else if(e.target.id==='fpQ'){ ui.fpQ=e.target.value; render(); } });

document.addEventListener('paste',e=>{
  const t=((e.clipboardData||window.clipboardData).getData('text')||'').trim();
  if(t[0]!=='{') return;
  if(e.target.id==='manual') return;
  e.preventDefault();
  try{ report(ingest(t)); $('#url').value=''; }catch(err){ say('Texte collé non reconnu : '+esc(err.message),'err'); }
});
$('#btnAdd').onclick=addFromInput;
$('#url').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); addFromInput(); } });
$('#url').addEventListener('input',()=>{ const id=extractIds($('#url').value)[0]; if(id){ $('#manualLink').href=CDN(id); $('#manualLink').textContent=CDN(id); } });
$('#btnManual').onclick=()=>{ try{ report(ingest($('#manual').value)); $('#manual').value=''; }catch(e){ say('JSON invalide : '+esc(e.message),'err'); } };
$('#btnTv').onclick=tvOpen;
$('#btnXlsx').onclick=()=>{ if(!Object.keys(games).length){ say('Ajoute au moins un match avant d\'exporter.','warn'); return; } exportXlsx(); };
function doBackup(){
  download('statify-sauvegarde-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({v:4,app:'statify+prono',date:new Date().toISOString(),games,fav,sched,notes,foot,ffav,ffavP,...StatifyBackup.pronoPart()}),'application/json');
  backup={last:Date.now(),snooze:0}; saveJ(KEYB,backup); try{ StatifyBackup.stamp(); }catch(e){} renderBackup();
}
$('#btnExport').onclick=doBackup;
$('#backupBar').addEventListener('click',e=>{
  const b=e.target.closest('[data-bk]'); if(!b) return;
  if(b.dataset.bk==='now') doBackup();
  else { backup.snooze=Date.now()+86400e3; saveJ(KEYB,backup); renderBackup(); }
});
$('#btnImport').onclick=()=>$('#fileImport').click();
$('#fileImport').onchange=async e=>{
  try{
    const d=JSON.parse(await e.target.files[0].text());
    let extra=''; if(d&&Array.isArray(d.football)){ try{ extra=StatifyBackup.restoreProno(d); }catch(err){ extra=' · Pronos : erreur de lecture'; } }
    if(d&&d.games){ Object.assign(games,d.games); if(d.fav){ fav.teams=[...new Set([...fav.teams,...(d.fav.teams||[])])]; Object.assign(fav.players,d.fav.players||{}); } if(d.sched&&d.sched.length) sched=d.sched; if(d.notes) Object.assign(notes,d.notes); if(d.foot&&d.foot.leagues){ foot=d.foot; foot.ph=foot.ph||{}; _fidx=null; footSave(); } if(Array.isArray(d.ffav)){ ffav=[...new Set([...ffav,...d.ffav])]; saveJ(KEYFF,ffav); } if(Array.isArray(d.ffavP)){ ffavP=[...new Set([...ffavP,...d.ffavP])]; saveJ(KEYFP,ffavP); } }
    else if(!(d&&Array.isArray(d.football))) Object.assign(games,d);
    save(); saveFav(); saveJ(KEYS,sched); saveJ(KEYN,notes); render(); say('✓ Sauvegarde importée.'+extra,'ok');
  }catch(err){ say('Fichier invalide.','err'); }
};
$('#btnMore').onclick=()=>document.body.classList.toggle('menu-open');
$('#btnRefresh').onclick=()=>{ if(ui.sport==='foot'){ if(footBusy) return; ui.fMenu=true; render(); window.scrollTo({top:0,behavior:'smooth'}); } else nbaRefresh(); };
['#msg','#fmsg'].forEach(q=>{ const n=$(q); if(n) n.addEventListener('click',()=>{ n.innerHTML=''; n.style.display='none'; }); });
window.addEventListener('afterprint',()=>document.body.classList.remove('print-one'));
$('#welcome').addEventListener('click',e=>{ if(e.target.id==='welcome') closeWelcome(); });
$('#sportSeg').addEventListener('click',e=>{ const b=e.target.closest('[data-sport]'); if(b){ setSport(b.dataset.sport); closeModals(); render(); } });
/* ================= Recherche globale ================= */
const gsNorm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
function gsSearch(q){
  q=gsNorm(q).trim(); if(q.length<2) return null;
  const sc=(...a)=>Math.min(...a.map(x=>{ x=gsNorm(x); return x.startsWith(q)?0:new RegExp('[\\s\\-\'.(]'+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(x)?1:(q.length>=3&&x.includes(q))?2:9; })), has=(...a)=>sc(...a)<9, out={nba:{p:[],t:[],m:[]},foot:{p:[],t:[],m:[]}};
  try{
    const S=buildStats();
    out.nba.t=Object.keys(TEAMS).filter(k=>has(TEAMS[k][0],k)).sort((a,b)=>sc(TEAMS[a][0],a)-sc(TEAMS[b][0],b)).slice(0,5).map(k=>({id:k,l:tname(k),s:k}));
    out.nba.p=Object.values(S.P).filter(p=>has(p.name)).sort((a,b)=>sc(a.name)-sc(b.name)||b.pts/b.gp-a.pts/a.gp).slice(0,6).map(p=>({id:p.id,l:p.name,s:p.tri+' · '+f1(p.pts/p.gp)+' pts'}));
    out.nba.m=Object.values(games).filter(g=>has(g.home.name,g.away.name,g.home.tri,g.away.tri)).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).slice(0,5).map(g=>({id:g.id,l:`${g.away.tri} ${g.away.score} - ${g.home.score} ${g.home.tri}`,s:fmtD(g.time)}));
  }catch(e){}
  try{
    const {P,T,mt}=footIdx();
    out.foot.t=Object.values(T).filter(t=>has(t.n)).sort((a,b)=>sc(a.n)-sc(b.n)).slice(0,5).map(t=>({id:t.id,l:t.n,s:footLgName(t.lg)}));
    out.foot.p=Object.values(P).filter(p=>has(p.n)).sort((a,b)=>sc(a.n)-sc(b.n)||b.g-a.g).slice(0,6).map(p=>({id:p.id,l:p.n,s:p.tn+' · '+p.g+' but'+(p.g>1?'s':'')}));
    out.foot.m=mt.filter(m=>has(m.hn,m.an)).sort((a,b)=>Date.parse(b.d)-Date.parse(a.d)).slice(0,5).map(m=>({id:m.id,l:m.done?`${m.hn} ${m.hs}-${m.as} ${m.an}`:`${m.hn} - ${m.an}`,s:fmtD(m.d)+(m.done?'':' · à venir')}));
  }catch(e){}
  return out;
}
function gsHtml(q){
  const r=gsSearch(q); if(!r) return '<p class="mut" style="padding:8px 4px">Tape au moins 2 lettres : un joueur, une équipe ou un match (NBA et foot).</p>';
  const order=ui.sport==='foot'?['foot','nba']:['nba','foot'], N={nba:'🏀 NBA',foot:'⚽ Foot'}, K=[['t','Équipes'],['p','Joueurs'],['m','Matchs']];
  let h='', any=false;
  for(const sp of order){ for(const [k,lab] of K){ const L=r[sp][k]; if(!L.length) continue; any=true;
    h+=`<div class="gsh">${N[sp]} · ${lab}</div>`+L.map(x=>`<div class="gsr" data-gs="${sp}${k}" data-id="${esc(x.id)}"><b>${esc(x.l)}</b><span class="mut">${esc(x.s)}</span></div>`).join(''); } }
  return any?h:'<p class="mut" style="padding:8px 4px">Aucun résultat.</p>';
}
function gsOpen(){ const o=$('#gs'); o.classList.add('on'); const i=$('#gsq'); i.value=''; $('#gsres').innerHTML=gsHtml(''); setTimeout(()=>i.focus(),50); }
function gsClose(){ $('#gs').classList.remove('on'); }
$('#btnSearch').addEventListener('click',gsOpen);
$('#gsq').addEventListener('input',e=>{ $('#gsres').innerHTML=gsHtml(e.target.value); });
$('#gs').addEventListener('click',e=>{
  if(e.target.id==='gs'||e.target.id==='gsx'){ gsClose(); return; }
  const r=e.target.closest('[data-gs]'); if(!r) return;
  const k=r.dataset.gs, id=r.dataset.id; gsClose(); closeModals();
  if(k.startsWith('foot')){ setSport('foot'); ui[k==='foott'?'fTeam':k==='footp'?'fPlayer':'fMatch']=id; }
  else { setSport('nba'); if(k==='nbat') ui.openTeam=id; else if(k==='nbap') ui.openPlayer=id; else ui.openGame=id; }
  render(); const m=$('#modal'); if(m) m.scrollTop=0;
});

/* ================= Cloud (GitHub Gist privé) ================= */
const CLOUD_KEYS=['suivi-nba-v1','suivi-nba-fav','suivi-nba-sched','suivi-nba-notes','suivi-nba-home','suivi-nba-lead','suivi-foot-v1','suivi-foot-fav','suivi-foot-favp','suivi-foot-home','suivi-multi-pick','suivi-live-fav','suivi-notif-fav'];
const KEYC='suivi-cloud';
let cloud=loadJ(KEYC,{tok:'',gid:'',auto:false,last:0,sig:''});
const cloudSave=()=>{ try{ localStorage.setItem(KEYC,JSON.stringify(cloud)); }catch(e){} };
const cloudData=()=>{ const o={}; for(const k of CLOUD_KEYS){ try{ const v=k===KEY?JSON.stringify(games):k===KEYFO?JSON.stringify(foot):localStorage.getItem(k); if(v) o[k+'.json']={content:v}; }catch(e){} } return o; };
const cloudSig=()=>{ const o=cloudData(); let n=0; for(const k in o){ const c=o[k].content; n+=c.length; for(let i=0;i<c.length;i++) n=(n*31+c.charCodeAt(i))|0; } return String(n); };
async function cloudApi(path,opt={}){
  const r=await fetch('https://api.github.com'+path,{...opt,headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+cloud.tok,'Content-Type':'application/json'}});
  if(!r.ok){ const t=await r.text().catch(()=>''); throw new Error(r.status===401?'Jeton refusé (vérifie-le)':r.status===404?'Espace cloud introuvable':('Erreur '+r.status+' '+t.slice(0,80))); }
  return r.json();
}
async function cloudPush(){
  if(!cloud.tok) throw new Error('Ajoute d\'abord ton jeton GitHub');
  const files=cloudData(); if(!Object.keys(files).length) throw new Error('Rien à envoyer');
  files['LISEZMOI.txt']={content:'Sauvegarde Statify - ne pas modifier à la main.'};
  let g;
  if(cloud.gid) g=await cloudApi('/gists/'+cloud.gid,{method:'PATCH',body:JSON.stringify({files})});
  else g=await cloudApi('/gists',{method:'POST',body:JSON.stringify({description:'Statify - sauvegarde',public:false,files})});
  cloud.gid=g.id; cloud.last=Date.now(); cloud.sig=cloudSig(); cloud.remote=g.updated_at; cloudSave(); return g;
}
async function cloudPull(){
  if(!cloud.tok||!cloud.gid) throw new Error('Rien à récupérer : envoie d\'abord depuis l\'autre appareil');
  const g=await cloudApi('/gists/'+cloud.gid); let n=0;
  for(const [name,f] of Object.entries(g.files||{})){ const k=name.replace(/\.json$/,''); if(!CLOUD_KEYS.includes(k)) continue;
    let c=f.content; if(f.truncated||c==null){ const r=await fetch(f.raw_url); c=await r.text(); }
    if(c){ try{ const v=JSON.parse(c); if(k===KEY||k===KEYFO){ try{ localStorage.setItem(k,c); }catch(e){ try{ localStorage.removeItem(k); }catch(x){} } try{ localStorage.setItem('suivi-ts-'+k,String(Date.now())); }catch(e){} await idbSet(k,{t:Date.now(),v}).catch(()=>{}); } else localStorage.setItem(k,c); n++; }catch(e){} } }
  cloud.last=Date.now(); cloud.remote=g.updated_at; cloud.sig=cloudSig(); cloudSave(); return n;
}
function notifConfig(){
  const nba=[...new Set(nfav.nba)].filter(t=>TEAMS[t]);
  let T={}; try{ T=footIdx().T; }catch(e){}
  const names=[], lgs=new Set(), unk=[], order=FLG.map(x=>x[0]);
  for(const id of nfav.foot){ const t=T[id]; if(!t){ unk.push(id); continue; } names.push(t.n); Object.keys(t.comps||{}).forEach(l=>lgs.add(l)); if(t.lg) lgs.add(t.lg); }
  // matchs choisis avec l'étoile dans le multiplex / le calendrier (récents ou à venir seulement)
  const picks=[]; try{ const byId=new Map(footIdx().mt.map(m=>[String(m.id),m])), lim=Date.now()-24*36e5;
    for(const id of Object.keys(mpick||{})){ const m=byId.get(String(id)); if(m&&Date.parse(m.d)>lim){ picks.push(String(m.id)); lgs.add(m.lg); } } }catch(e){}
  let leagues=[...lgs].filter(l=>order.includes(l)).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  if(!leagues.length&&(names.length||picks.length)) leagues=['fra.1'];
  const cfg={nba,foot:{teams:[...new Set(names)],leagues,matches:picks},multiplex:{enabled:true,leagues:['fra.1','uefa.champions']},alerts:{kickoff:true,score:true,final:true},live:{everySeconds:15,runMinutes:9}};
  return {cfg,unk,text:JSON.stringify(cfg,null,2)};
}
async function notifSync(force){
  if(!cloud.tok) throw new Error('Ajoute d\'abord ton jeton GitHub');
  const n=notifConfig();
  if(n.unk.length) throw new Error('Un club étoilé n\'est pas chargé : ouvre l\'onglet Foot, actualise (🔄), puis réessaie');
  const core=JSON.stringify({nba:n.cfg.nba,foot:n.cfg.foot});
  if(!force&&cloud.nsig===core) return false;
  const files={'statify-notif.json':{content:JSON.stringify({v:1,nba:n.cfg.nba,foot:n.cfg.foot,maj:new Date().toISOString()},null,1)}};
  let g=null;
  if(cloud.nid){ try{ g=await cloudApi('/gists/'+cloud.nid,{method:'PATCH',body:JSON.stringify({files})}); }catch(e){ if(/introuvable/.test(e.message)) cloud.nid=''; else throw e; } }
  if(!g) g=await cloudApi('/gists',{method:'POST',body:JSON.stringify({description:'Statify - alertes',public:true,files})});
  cloud.nid=g.id; cloud.nsig=core; cloud.nlast=Date.now(); cloudSave(); return true;
}
function cloudMsg(t,ok){ const m=$('#cloudmsg'); if(m){ m.textContent=t; m.style.color=ok?'var(--ok)':'var(--bad)'; } }
function cloudRender(){
  const b=$('#cloudbody'), when=cloud.last?new Date(cloud.last).toLocaleString('fr-FR'):'jamais';
  b.innerHTML=`<h2 style="margin-top:0">☁️ Cloud : téléphone et ordinateur synchronisés</h2>
  <p class="mut">Tes favoris, notes, matchs et réglages sont copiés dans un espace <b>privé</b> de ton compte GitHub (un « Gist »). Sur chaque appareil : colle le même jeton.</p>
  <ol class="mut" style="padding-left:18px;margin:6px 0 10px"><li>Sur github.com : Settings → Developer settings → Personal access tokens → <i>Tokens (classic)</i> → Generate new token.</li><li>Coche seulement la case <b>gist</b>, valide, copie le jeton.</li><li>Colle-le ci-dessous. Sur le 2<sup>e</sup> appareil, colle le même jeton puis « Récupérer ».</li></ol>
  <input id="cloudtok" type="password" placeholder="Jeton GitHub (ghp_…)" value="${esc(cloud.tok)}" autocomplete="off" style="width:100%;box-sizing:border-box">
  <div class="row" style="margin:10px 0"><button id="cloudup">⬆️ Envoyer vers le cloud</button><button class="sec" id="clouddown">⬇️ Récupérer depuis le cloud</button></div>
  <label style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;cursor:pointer"><input type="checkbox" id="cloudauto" style="width:auto;flex:none" ${cloud.auto?'checked':''}><span>Envoi automatique quand mes données changent</span></label>
  <p class="mut" style="margin:8px 0 0">Dernière synchro : ${esc(when)}${cloud.gid?'':' · espace pas encore créé'}</p>
  <p id="cloudmsg" style="margin:6px 0 0;min-height:1.3em"></p>
  ${(()=>{ const n=notifConfig(), none=!n.cfg.nba.length&&!n.cfg.foot.teams.length&&!n.cfg.foot.matches.length, on=!!cloud.nid, when=cloud.nlast?new Date(cloud.nlast).toLocaleString('fr-FR'):'';
    return `<hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
  <h3 style="margin:0 0 6px">🔔 Alertes quand l'appli est fermée</h3>
  <p class="mut" style="margin:0 0 6px">Ton robot Telegram lit tes équipes à <b style="color:#f0b010">étoile dorée</b> (<b>${n.cfg.nba.length} en NBA, ${n.cfg.foot.teams.length} en foot, ${n.cfg.foot.matches.length} match(s) choisi(s) dans le multiplex</b>) dans un petit espace « Statify - alertes » de ton compte. Il est <b>public</b> mais ne contient que les noms de tes équipes.</p>
  ${none?'<p class="mut"><b>Aucune équipe à étoile dorée pour l\'instant.</b> Touche la ☆ dorée à côté d\'une équipe ou d\'un club (la bleue sert aux favoris), puis reviens ici.</p>':''}
  ${n.unk.length?`<p class="mut">⚠️ ${n.unk.length} club(s) à étoile dorée non chargé(s) : ouvre l'onglet Foot, actualise (🔄), puis reviens ici.</p>`:''}
  <div class="row" style="margin:8px 0 0"><button id="nsend">🔔 ${on?'Mettre à jour maintenant':'Activer les alertes'}</button></div>
  <div class="row" style="margin:8px 0 0"><button class="sec" id="nall">★ Tout mettre en doré</button><button class="sec" id="nnone">☆ Tout retirer</button></div>
  <p class="mut" style="margin:6px 0 0">${on?`✓ Actif${when?' · dernier envoi : '+esc(when):''}. Ensuite c'est automatique : ajoute ou retire une ☆, et le robot suit (Statify doit être ouvert au moment où tu changes tes étoiles).`:'Colle d\'abord ton jeton GitHub dans la zone plus haut, puis touche ce bouton.'}</p>
  <p id="nmsg" style="margin:6px 0 0;min-height:1.3em"></p>
  <details style="margin-top:6px"><summary class="mut" style="cursor:pointer">Secours : copier la config à la main</summary>
  <textarea id="ncfg" readonly rows="9" style="width:100%;box-sizing:border-box;font:16px/1.3 ui-monospace,Menlo,monospace;white-space:pre;margin-top:6px">${esc(n.text)}</textarea>
  <div class="row" style="margin:8px 0 0"><button class="sec" id="ncopy">📋 Copier ma config</button></div></details>`; })()}
  <div class="row" style="justify-content:flex-end"><button class="sec" id="cloudclose">Fermer</button></div>`;
}
function cloudOpen(){ cloudRender(); $('#cloud').classList.add('on'); }
function cloudClose(){ $('#cloud').classList.remove('on'); }
$('#btnCloud').addEventListener('click',cloudOpen);
$('#cloud').addEventListener('click',async e=>{
  const id=e.target.id; if(id==='cloud'||id==='cloudclose'){ cloudClose(); return; }
  if(id==='nall'||id==='nnone'){
    let nb=0; try{ nb=Object.keys(footIdx().T).length; }catch(e){}
    if(id==='nall'){ if(!confirm('Mettre en étoile dorée les 30 équipes NBA et '+nb+' clubs de foot ?\n\nTu recevras les notifications de TOUS leurs matchs (coup d\'envoi, buts, score final) : cela peut faire beaucoup d\'alertes par jour.')) return; nfavAll(); }
    else { if(!confirm('Retirer toutes les étoiles dorées ? Tu ne recevras plus aucune notification (les étoiles bleues ne changent pas).')) return; nfavNone(); }
    if(cloud.tok&&cloud.nid) notifSync(false).catch(()=>{});
    render(); cloudRender(); const m=$('#nmsg'); if(m){ m.textContent=id==='nall'?'✓ Tous les clubs sont en doré. Touche « Mettre à jour maintenant » pour prévenir le robot tout de suite.':'✓ Étoiles dorées retirées.'; m.style.color='var(--ok)'; }
    return; }
  if(id==='nsend'){
    const tk=($('#cloudtok').value||'').trim(); if(tk){ cloud.tok=tk; cloudSave(); }
    const m=$('#nmsg'), say=(t,ok)=>{ if(m){ m.textContent=t; m.style.color=ok?'var(--ok)':'var(--bad)'; } };
    say('Envoi…',true);
    try{ await notifSync(true); say('✓ Alertes activées : le robot suit maintenant tes équipes étoilées.',true); }
    catch(err){ say('⚠️ '+(err.message==='Failed to fetch'?'Pas de réseau':err.message),false); }
    return; }
  if(id==='ncopy'){
    const ta=$('#ncfg'), m=$('#nmsg'), ok=()=>{ if(m){ m.textContent='✓ Copié. Colle-le dans config.json sur GitHub.'; m.style.color='var(--ok)'; } };
    const fb=()=>{ try{ ta.focus(); ta.select(); ta.setSelectionRange(0,ta.value.length); if(document.execCommand('copy')) ok(); else if(m){ m.textContent='Sélectionne le texte et copie-le à la main.'; m.style.color='var(--bad)'; } }catch(err){ if(m){ m.textContent='Sélectionne le texte et copie-le à la main.'; m.style.color='var(--bad)'; } } };
    try{ navigator.clipboard.writeText(ta.value).then(ok,fb); }catch(err){ fb(); }
    return; }
  if(id==='cloudup'||id==='clouddown'){
    cloud.tok=($('#cloudtok').value||'').trim(); cloudSave();
    try{
      if(id==='cloudup'){ cloudMsg('Envoi…',true); await cloudPush(); cloudMsg('✓ Envoyé. Colle le même jeton sur ton autre appareil, puis « Récupérer ».',true); }
      else{ if(!confirm('Remplacer les données de cet appareil par celles du cloud ?')) return; cloudMsg('Récupération…',true); const n=await cloudPull(); cloudMsg('✓ '+n+' élément(s) récupéré(s). Rechargement…',true); setTimeout(()=>location.reload(),900); }
      if(id==='cloudup') cloudRender(), cloudMsg('✓ Envoyé. Sur ton autre appareil : colle le même jeton, puis « Récupérer ».',true);
    }catch(err){ cloudMsg('⚠️ '+(err.message==='Failed to fetch'?'Pas de réseau':err.message),false); }
  }
});
$('#cloud').addEventListener('change',e=>{ if(e.target.id==='cloudauto'){ cloud.tok=($('#cloudtok').value||cloud.tok).trim(); cloud.auto=e.target.checked; cloudSave(); } });
setInterval(()=>{ if(!cloud.tok||!cloud.nid||navigator.onLine===false) return; notifSync(false).catch(()=>{}); },60000);
setTimeout(()=>{ if(cloud.tok&&cloud.nid&&navigator.onLine!==false) notifSync(false).catch(()=>{}); },8000);
setInterval(()=>{ if(!cloud.auto||!cloud.tok||navigator.onLine===false) return; const sg=cloudSig(); if(sg!==cloud.sig) cloudPush().catch(()=>{}); },60000);
document.addEventListener('keydown',e=>{
  const tag=(e.target.tagName||'').toLowerCase(), typing=tag==='input'||tag==='textarea'||tag==='select';
  if(e.key==='Escape'&&$('#gs').classList.contains('on')){ gsClose(); return; }
  if(e.key==='/'&&!typing&&!e.ctrlKey&&!e.metaKey){ e.preventDefault(); gsOpen(); }
});

$('#btnLead').onclick=()=>{ try{ localStorage.setItem('suivi-nba-lead',localStorage.getItem('suivi-nba-lead')==='0'?'1':'0'); }catch(e){} render(); };
(function(){ const f=()=>document.body.classList.toggle('offline',navigator.onLine===false); window.addEventListener('online',f); window.addEventListener('offline',f); f(); })();
if('serviceWorker' in navigator&&location.protocol.startsWith('http')&&!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(()=>{});
function applyTheme(t){ document.documentElement.dataset.theme=t; }
(function(){
  let t=null; try{ t=localStorage.getItem(KEYT); }catch(e){}
  if(!t) t=(window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';
  applyTheme(t);
  $('#btnTheme').onclick=()=>{ const n=document.documentElement.dataset.theme==='light'?'dark':'light'; applyTheme(n); try{ localStorage.setItem(KEYT,n); }catch(e){} };
  const code=document.getElementById('bmcode').textContent.replace(/\s*\n\s*/g,'');
  const bm=document.getElementById('bm'); bm.href='javascript:'+encodeURIComponent(code);
  bm.onclick=e=>{ e.preventDefault(); say('Glisse ce bouton dans ta barre de favoris, ne clique pas dessus ici.','warn'); };
  document.getElementById('manualBox').open=!Object.keys(games).length;
})();
render();

/* ================= Live (ESPN, sans serveur) ================= */
function fLbl(sn,clk,per,det){
  sn=String(sn||''); clk=String(clk||'');
  if(/HALFTIME/.test(sn)) return 'Mi-temps';
  if(/FULL_TIME|FINAL/.test(sn)) return 'Terminé';
  if(/END_OF_REGULATION/.test(sn)) return 'Fin du temps réglementaire';
  if(/END_OF_EXTRATIME/.test(sn)) return 'Fin de la prolongation';
  if(/SHOOTOUT|PENALTY/.test(sn)) return 'Tirs au but';
  if(/EXTRA/.test(sn)) return 'Prol. '+clk;
  if(/POSTPONED/.test(sn)) return 'Reporté';
  if(/DELAY|SUSPEND/.test(sn)) return 'Interrompu';
  return clk||det||'';
}
function nLbl(sn,clk,per,det){
  sn=String(sn||''); per=+per||0;
  if(/HALFTIME/.test(sn)) return 'Mi-temps';
  const q=per>4?'Prol.'+(per>5?' '+(per-4):''):'Q'+per;
  if(/END_PERIOD/.test(sn)) return 'Fin '+q;
  if(/IN_PROGRESS/.test(sn)) return q+' · '+(clk||'');
  return det||'';
}
function liveFavOnly(){ try{ return localStorage.getItem('suivi-live-fav')!=='0'; }catch(e){ return true; } }
/* ---- Son de but (multiplex) ---- */
function sndPref(){ try{ return localStorage.getItem('suivi-snd')==='0'?'0':'1'; }catch(e){ return '1'; } }
const GOAL_SND='data:audio/mpeg;base64,SUQzBAAAAAAAe1RYWFgAAAAmAAADY29tbWVudABjb252ZXJ0ZWQgYnkgY29udmVydDJtcDMubmV0AFRJVDIAAAALAAADbXVsdGlwbGV4AFRQRTEAAAAJAAADbXVzaXF1ZQBUU1NFAAAADwAAA0xhdmY1Ny44My4xMDAAAAAAAAAAAAAAAP/7UAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEluZm8AAAAPAAAAQgAAbJEABQkJDRERFRkZHCAgJCgoLDAwMzc3Oz8/Q0dHS05OUlZWWl5eYmZmaW1tcXV1eX19gISEiIiMkJCUmJibn5+jp6err6+ztra6vr7CxsbKzc3R1dXZ3d3h5eXo7Ozw9PT4/Pz/AAAAAExhdmM1Ny4xMAAAAAAAAAAAAAAAACQGkQAAAAAAAGyR/IiAawAAAAAAAAAAAAAAAAAAAAD/+5BkAA/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVeWKyihhAtHSkn8rKwkcWIdLKZEexGrDDC0eVlHMjIyNRxxDpYrDDGRkZGQwtLKwkcWIMjIyM0eVlFDCBaGj/k6WKwkcWIdHS/pYrKKGEC0dLCP5WVhI4sQ6PKZF2KysMIFo8rKZlkZGo44h0sVhhjVVVAAXpr7TTTTEFppptNNNNv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABJppgG/TX/2mmmk0000QoYcYcQYxMpjDiBZGdnZ2dv9EZ2dnZzM7Ozs5hIoYcYWIFuzs7OzuxmdjkO/s7L/qUzOzs7FMzs7OwwoSOMOIFiGWWWDAiEI6xS3fNEJ0I6dlkD5ogjpdOy73dEERT6bnTf3SACEdpud3zfghBjpnTu5mjmgQR07e77ogvgiU600u8gh2SKbnST34AIOUU3O6Ej5oEEcI6d3JLmiC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';
let goalSnd=null, sndUnlocked=false;
function sndEl(){ if(!goalSnd){ try{ goalSnd=new Audio(GOAL_SND); goalSnd.preload='auto'; }catch(e){ goalSnd=null; } } return goalSnd; }
// iPhone : le navigateur n'autorise le son qu'après un premier toucher de l'écran
function sndUnlock(){ if(sndUnlocked) return; const a=sndEl(); if(!a) return; sndUnlocked=true;
  try{ a.muted=true; const p=a.play(); if(p&&p.then) p.then(()=>{ a.pause(); a.currentTime=0; a.muted=false; }).catch(()=>{ sndUnlocked=false; a.muted=false; }); }catch(e){ sndUnlocked=false; } }
['pointerdown','touchend','click','keydown'].forEach(ev=>document.addEventListener(ev,sndUnlock,{passive:true}));
function playGoal(force){ if(!force&&sndPref()==='0') return; const a=sndEl(); if(!a) return; try{ a.muted=false; a.currentTime=0; const p=a.play(); if(p&&p.catch) p.catch(()=>{}); }catch(e){} }
// un but compte comme « multiplex » si le match est dans un multiplex en cours, dans ma sélection, ou si c'est un de mes clubs
const goalSoundOk=it=>{ try{ return multiLive(it.lg)||!!mpick[it.id]||nfav.foot.includes(it.h.id)||nfav.foot.includes(it.a.id); }catch(e){ return false; } };
/* ---- Bandeau « BUT ! » façon télé (appli ouverte) ---- */
const gbQ=[]; let gbBusy=false;
const gbReduce=()=>{ try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };
function goalBanner(it,sd,lg,kind='goal'){
  try{ if(!sd||!document.body.animate) return; if(gbQ.length>=4) gbQ.shift();
    gbQ.push({kind,tm:sd==='h'?it.h.n:it.a.n,logo:sd==='h'?it.h.l:it.a.l,h:it.h.n,a:it.a.n,hs:it.h.s,as:it.a.s,p:lg&&lg.p?lg.p:'',m:lg&&lg.m?lg.m:(()=>{ try{ return liveText(it); }catch(e){ return ''; } })(),og:!!(lg&&lg.og),pg:!!(lg&&lg.pg),sd});
    if(!gbBusy) gbNext(); }catch(e){}
}
async function gbNext(){
  const g=gbQ.shift(); if(!g){ gbBusy=false; return; } gbBusy=true;
  const quick=gbQ.length>0, rd=gbReduce();
  const el=document.createElement('div'); el.className='gbanner k-'+(g.kind||'goal'); const TT={goal:g.pg?'BUT SUR PENALTY !':'BUT !',rc:'CARTON ROUGE',var:'BUT REFUSÉ'};
  el.innerHTML=`<div class="gb-logo">${footLogo(g.logo,34)}</div><div class="gb-tx"><div class="gb-t">${TT[g.kind||'goal']}</div><div class="gb-s"><b>${esc(g.p||g.tm)}</b>${g.p?' · '+esc(g.tm):''}${g.m?' · '+esc(g.m):''}${g.og?' (csc)':g.pg?' (pen.)':''}</div></div><div class="gb-sc"><span class="${g.sd==='h'?'hit':''}">${esc(g.h)}</span> <b>${g.hs} - ${g.as}</b> <span class="${g.sd==='a'?'hit':''}">${esc(g.a)}</span></div>`;
  document.body.appendChild(el);
  try{
    await el.animate(rd?[{opacity:0},{opacity:1}]:[{transform:'translateX(-110%)'},{transform:'translateX(0)'}],{duration:rd?150:380,easing:'cubic-bezier(.2,.9,.3,1)',fill:'forwards'}).finished;
    if(!rd&&(g.kind||'goal')==='goal') gbConfetti(el);
    await new Promise(r=>setTimeout(r,quick?1600:3600));
    await el.animate(rd?[{opacity:1},{opacity:0}]:[{transform:'translateX(0)'},{transform:'translateX(110%)'}],{duration:rd?150:320,easing:'ease-in',fill:'forwards'}).finished;
  }catch(e){}
  el.remove(); gbNext();
}
function gbConfetti(el){
  try{ const r=el.getBoundingClientRect(), d=window.devicePixelRatio||1, cv=document.createElement('canvas'); cv.className='gbcv'; cv.width=innerWidth*d; cv.height=(r.bottom+160)*d; document.body.appendChild(cv);
    const cx=cv.getContext('2d'), C=['#34b64f','#ff4a3a','#f0b010','#4a9bff','#fff'], P=[];
    for(let i=0;i<46;i++){ const a=-Math.PI/2+(Math.random()-.5)*2.2, v=(4+Math.random()*7)*d; P.push({x:(r.left+r.width*.22)*d,y:(r.top+r.height/2)*d,vx:Math.cos(a)*v*1.3,vy:Math.sin(a)*v,w:(5+Math.random()*5)*d,h:(3+Math.random()*4)*d,r:Math.random()*6,vr:(Math.random()-.5)*.4,c:C[i%5],l:0}); }
    (function step(){ cx.clearRect(0,0,cv.width,cv.height); let n=0; for(const p of P){ p.l++; p.vy+=.26*d; p.vx*=.99; p.x+=p.vx; p.y+=p.vy; p.r+=p.vr; if(p.l<120){ n++; cx.save(); cx.translate(p.x,p.y); cx.rotate(p.r); cx.globalAlpha=1-p.l/120; cx.fillStyle=p.c; cx.fillRect(-p.w/2,-p.h/2,p.w,p.h); cx.restore(); } }
      if(n) requestAnimationFrame(step); else cv.remove(); })(); }catch(e){}
}
function liveAlertOk(it){ if(!liveFavOnly()||!nfav.foot.length) return true; if(multiLive(it.lg)||mpick[it.id]) return true; return nfav.foot.includes(it.h.id)||nfav.foot.includes(it.a.id); }
/* liveData & co : déclarés en haut du script (utilisés dès le premier affichage) */
const liveF=t=>new Date(t).toISOString().slice(0,10).replace(/-/g,'');
function liveItem(kind,lg,e){
  const c=e.competitions&&e.competitions[0]; if(!c) return null;
  const h=c.competitors.find(x=>x.homeAway==='home'), a=c.competitors.find(x=>x.homeAway==='away'); if(!h||!a) return null;
  const st=(e.status&&e.status.type)||{}, sn=st.name||'', clk=(e.status&&e.status.displayClock)||'', per=(e.status&&e.status.period)||0;
  const side=x=>kind==='n'?{id:etri(x.team.abbreviation),n:tname(etri(x.team.abbreviation)),s:+x.score||0}:{id:String(x.team.id),n:x.team.shortDisplayName||x.team.displayName,l:x.team.logo||'',s:+x.score||0};
  const it={k:kind,lg,id:String(e.id),st:st.state||'pre',done:!!st.completed,sn,per,h:side(h),a:side(a),t:Date.now(),d:e.date,lab:kind==='n'?nLbl(sn,clk,per,st.shortDetail):fLbl(sn,clk,per,st.shortDetail)};
  if(kind==='f'){ it.ev=(c.details||[]).filter(x=>(x.scoringPlay||x.redCard)&&!x.shootout).map(x=>{ const ai=(x.athletesInvolved||[])[0]||{}, tid=String((x.team||{}).id||'');
      return {g:!!x.scoringPlay,rc:!!x.redCard&&!x.scoringPlay,og:!!x.ownGoal,pg:!!x.penaltyKick,m:(x.clock&&x.clock.displayValue)||'',p:ai.shortName||ai.displayName||'',s:tid===it.h.id?'h':tid===it.a.id?'a':''}; }); }
  else { const tp=x=>{ const l=(x.leaders||[]).find(y=>y.name==='points'), t=l&&l.leaders&&l.leaders[0]; return t&&t.athlete?(t.athlete.shortName||t.athlete.displayName)+' '+(t.displayValue||'')+' pts':''; }; it.h.top=tp(h); it.a.top=tp(a); }
  if(kind==='f'){ const m=/(\d+)'?(?:\s*\+\s*(\d+))?/.exec(clk); it.run=/FIRST_HALF|SECOND_HALF|EXTRA/.test(sn)&&!!m; if(m){ it.m=+m[1]; it.p=m[2]!=null?+m[2]:null; } }
  return it;
}
function liveText(it){
  if(it.k==='f'&&it.run&&it.m!=null){
    const el=Math.max(0,Math.floor((Date.now()-it.t)/60000)), pre=/EXTRA/.test(it.sn)?'Prol. ':'';
    if(it.p!=null) return pre+it.m+"'+"+(it.p+el)+"'";
    const lim=/EXTRA/.test(it.sn)?(it.per===3?105:120):(it.per===1?45:90), v=it.m+el;
    return pre+(v>lim?lim+"'+":v+"'");
  }
  return it.lab;
}
function liveRender(){
  const box=document.getElementById('liveBox'); if(!box) return;
  const want=ui.sport==='foot'?'f':'n', L=(liveData.items||[]).filter(x=>x.st==='in'&&x.k===want); if(!L.length||(ui.sport==='foot'&&ui.ftab==='multi')){ box.innerHTML=''; return; }
  const mine=x=>x.k==='n'?(fav.teams.includes(x.h.id)||fav.teams.includes(x.a.id)):(ffav.includes(x.h.id)||ffav.includes(x.a.id));
  L.sort((x,y)=>mine(y)-mine(x));
  const ago=Math.max(0,Math.round((Date.now()-liveData.t)/1000));
  const bar=x=>{ if(x.k!=='f') return ''; const tot=/EXTRA/.test(x.sn)?120:90, pc=v=>Math.min(100,Math.max(0,v/tot*100));
    const cur=/HALFTIME/.test(x.sn)?45:(x.run&&x.m!=null?x.m+Math.floor((Date.now()-x.t)/60000):(x.m||0));
    const mk=(x.ev||[]).filter(e=>e.s).map(e=>`<i class="${e.s}" style="left:${pc(parseInt(e.m)||0)}%;background:${e.rc?'#e04030':e.s==='h'?'var(--acc,#34b64f)':'#f07020'}" title="${esc((e.p||'')+' '+e.m)}"></i>`).join('');
    return `<div class="lbar"><b style="width:${pc(cur)}%"></b><u></u>${mk}</div>`; };
  const evl=(x,sd)=>(x.ev||[]).filter(e=>e.s===sd).map(e=>`<div>${e.rc?'🟥':'⚽'} ${esc(e.p||'?')} ${esc(e.m)}${e.og?' (csc)':e.pg?' (pen.)':''}</div>`).join('');
  const evs=x=>{ if(x.k==='n'){ return (x.h.top||x.a.top)?`<div class="lev"><div>${esc(x.h.top||'')}</div><div style="text-align:right">${esc(x.a.top||'')}</div></div>`:''; }
    return (x.ev&&x.ev.length)?`<div class="lev"><div>${evl(x,'h')}</div><div style="text-align:right">${evl(x,'a')}</div></div>`:''; };
  const row=x=>{ const key=x.k+x.id, fl=(liveMem[key]&&Date.now()-liveMem[key].chg<30000)?' flash':'';
    const lg=x.k==='n'?'NBA':footLgName(x.lg), lo=(s,k)=>x.k==='n'?teamLogo(s.id,22):footLogo(s.l,22);
    const go=(x.k==='f'&&Object.values(foot.leagues).some(L=>L.matches[x.id]))?` data-act="fmatch" data-id="${esc(x.id)}" style="cursor:pointer"`:'';
    return `<div class="liverow${fl}"${go}><div class="lt">${lo(x.h)}<b>${esc(x.h.n)}</b></div><div class="ls">${x.h.s} - ${x.a.s}<span class="lm">${esc(liveText(x))}</span></div><div class="lt r"><b>${esc(x.a.n)}</b>${lo(x.a)}</div>${bar(x)}${evs(x)}<div class="lc mut">${mine(x)?'⭐ ':''}${esc(lg)}</div></div>`; };
  box.innerHTML=`<div class="card livecard"><h2><span class="livedot"></span><span class="lhn">En direct</span> <span class="mut" style="font-size:12px;font-weight:400">· mis à jour il y a ${ago} s · <span class="link" data-act="liverefresh">actualiser</span></span>${want==='f'?`<label class="mut" style="font-size:12px;margin-left:auto;font-weight:400"><input type="checkbox" data-act="livefav" ${liveFavOnly()?'checked':''}> Alertes buts : mes clubs</label>`:''}</h2>${L.map(row).join('')}</div>`;
}
async function liveFetch(manual,only){
  if(liveData.busy) return; liveData.busy=true; liveTry=Date.now();
  try{
    const now=Date.now(), jobs=[];
    const days=[liveF(now)]; if(new Date(now).getUTCHours()<5) days.push(liveF(now-864e5));
    if(!only) liveFull=now;
    for(const [lg] of FLG) if(!only||only.has(lg)) for(const d of days) jobs.push({k:'f',lg,u:`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${d}`});
    if(!only||only.has('nba')) jobs.push({k:'n',lg:'nba',u:`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${liveF(now-6*36e5)}`});
    let ok=0; const items=[], ing=[], okLg=new Set(), failLg=new Set(); let lim=false;
    await Promise.all(jobs.map(async j=>{ try{ const r=await fetch(j.u,{cache:'no-store'}); if(!r.ok){ if(r.status===429||r.status===403) lim=true; throw 0; } const d=await r.json(); ok++; okLg.add(j.k==='n'?'nba':j.lg);
      let any=false; for(const e of (d.events||[])){ const it=liveItem(j.k,j.lg,e); if(!it) continue; items.push(it); if(it.st==='in'||liveSeen.has(it.k+':'+it.lg+':'+it.id)) any=true; }
      if(j.k==='f'&&any) ing.push({lg:j.lg,d}); }catch(e){ failLg.add(j.k==='n'?'nba':j.lg); } }));
    for(const l of failLg) okLg.delete(l);
    // ESPN refuse ou ne répond pas : on ralentit (30 s, 1 min, 2 min… jusqu'à 5 min), retour au rythme normal dès que ça répond
    liveFail=lim?Math.min(liveFail+2,6):!ok?Math.min(liveFail+1,6):0;
    if(!ok){ liveData.err='ESPN ne répond pas'; if(manual) say('⚠️ Live : ESPN ne répond pas.','err'); return; }
    liveData.err=''; liveData.t=Date.now(); liveLast=liveData.t;
    // mode rapide : on garde tels quels les championnats non interrogés
    // championnats non interrogés (mode rapide) ou qui n'ont pas répondu : on garde leurs derniers scores connus
    for(const x of (liveData.items||[])) if(!okLg.has(x.k==='n'?'nba':x.lg)) items.push(x);
    { const seen=new Set(); for(let i=0;i<items.length;i++){ const k=items[i].k+items[i].id; if(seen.has(k)){ items.splice(i,1); i--; } else seen.add(k); } }
    // changements de score
    const cur=new Set(); let changed=false;
    for(const it of items){ if(it.st!=='in') continue; const key=it.k+it.id; cur.add(it.k+':'+it.lg+':'+it.id); const sc=it.h.s+'-'+it.a.s, o=liveMem[key];
      if(it.k==='f'){ const rcs=(it.ev||[]).filter(e=>e.rc), rk='r'+it.id, pr=liveMem[rk]; liveMem[rk]=rcs.length; }
      if(!o||o.sc!==sc){ liveMem[key]={sc,chg:o?Date.now():0}; if(o){ changed=true; if(it.k==='f'&&ui.sport==='foot'&&liveAlertOk(it)){ const [oh,oa]=String(o.sc).split('-').map(Number), sd=it.h.s>oh?'h':it.a.s>oa?'a':'', gl=(it.ev||[]).filter(e=>e.g&&e.s===sd), lg=(sd&&gl.length===(sd==='h'?it.h.s:it.a.s))?gl[gl.length-1]:null, tm=sd==='h'?it.h.n:sd==='a'?it.a.n:''; if(sd&&goalSoundOk(it)){ playGoal(); goalBanner(it,sd,lg); } say(sd?`⚽ <b>BUT de ${esc(tm)} !</b> ${esc(it.h.n)} ${it.h.s} - ${it.a.s} ${esc(it.a.n)}${lg&&lg.p?' · '+esc(lg.p)+' '+esc(lg.m)+(lg.og?' (csc)':lg.pg?' (pen.)':''):''}`:`📝 <b>Score modifié</b> (VAR ?) : ${esc(it.h.n)} ${it.h.s} - ${it.a.s} ${esc(it.a.n)}`,sd?'ok':'warn'); } } } }
    const ended=[...liveSeen].filter(k=>!cur.has(k)); liveSeen=cur;
    liveData.items=items;
    for(const g of ing){ try{ footIngest({__foot:'scores',league:g.lg,data:g.d}); }catch(e){} }
    if(ing.length) footSave();
    // on ne redessine la page que s'il s'est passé quelque chose (ou chaque minute pour faire avancer les minutes)
    const sig=items.filter(x=>x.st!=='pre').map(x=>x.k+x.id+':'+x.h.s+'-'+x.a.s+':'+x.st+':'+(x.ev||[]).length).sort().join('|');
    if(sig!==liveSig){ liveSig=sig; changed=true; }
    if(!changed&&items.some(x=>x.st==='in')&&Date.now()-liveRen>6e4) changed=true;
    liveRender(); if(changed&&!document.querySelector('input:focus')){ liveRen=Date.now(); render(); }
    if(ui.fMatch) await liveDetail(ui.fMatch);
    // fins de match : on complète les détails
    for(const k of ended){ const [kind,lg,id]=k.split(':'); const it=items.find(x=>x.k===kind&&x.id===id&&x.lg===lg);
      if(!it||!it.done) continue;
      if((kind==='f')===(ui.sport==='foot')) say(`🏁 Terminé : ${esc(it.h.n)} ${it.h.s} - ${it.a.s} ${esc(it.a.n)}`,'ok');
      if(kind==='f'){ try{ footIngest({__foot:'summary',league:lg,id,data:await footGet(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/summary?event=${id}`)}); footSave(); render(); }catch(e){} }
      else { sayMute=ui.sport==='foot'; try{ await nbaEspnRefresh(); }catch(e){} finally{ sayMute=false; } } }
  }finally{ liveData.busy=false; }
}
async function liveDetail(id){
  const it=(liveData.items||[]).find(x=>x.k==='f'&&x.id===String(id)&&x.st==='in'); if(!it) return;
  try{ footIngest({__foot:'summary',league:it.lg,id:it.id,data:await footGet(`https://site.api.espn.com/apis/site/v2/sports/soccer/${it.lg}/summary?event=${it.id}`)}); footSave();
    if(ui.fMatch===it.id&&!document.querySelector('#modal input:focus,#modal textarea:focus')) render(); }catch(e){}
}
function liveNeed(){
  const now=Date.now(), w=t=>{ t=Date.parse(t); return t&&t<now+15*6e4&&t>now-3.5*36e5; };
  if((liveData.items||[]).some(x=>x.st==='in')) return true;
  if(Object.values(foot.leagues).some(L=>Object.values(L.matches).some(m=>!m.done&&m.st!=='post'&&w(m.d)))) return true;
  return sched.some(x=>x.s!==3&&w(x.t));
}
let liveFull=0, liveSig='', liveRen=0, liveFail=0, liveTry=0;
function liveTick(){
  if(document.hidden) return; const now=Date.now(), age=now-liveLast;
  // 1 échec isolé : on garde le rythme ; échecs répétés ou refus d'ESPN : 30 s, 1 min, 2 min… (max 5 min)
  if(liveFail>=2&&now-liveTry<Math.min(3e5,15e3*2**(liveFail-1))){ liveRender(); return; }
  const soon=x=>{ const t=Date.parse(x.d); return x.st==='pre'&&t&&t<=now+15*6e4&&t>=now-45*6e4; };
  const L=(liveData.items||[]).filter(x=>x.st==='in'||soon(x));
  // match en cours ou coup d'envoi dans les 15 min : toutes les ~15 s, seulement les championnats concernés ; tour complet de sécurité toutes les 3 min
  if(L.length&&age>=15e3){ if(now-liveFull>=3*6e4) liveFetch(false); else liveFetch(false,new Set(L.map(x=>x.k==='n'?'nba':x.lg))); return; }
  if((liveNeed()&&age>=30e3)||age>=5*6e4) liveFetch(false); else liveRender();
}
setInterval(liveTick,5000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&Date.now()-liveLast>6e4) liveFetch(false); });
setTimeout(()=>liveFetch(false),2500);
document.addEventListener('click',e=>{ const r=e.target.closest('#liveBox [data-act=fmatch]'); if(r) setTimeout(()=>liveDetail(r.dataset.id),80); },false);
document.addEventListener('change',e=>{ if(e.target.matches&&e.target.matches('[data-act=livefav]')){ try{ localStorage.setItem('suivi-live-fav',e.target.checked?'1':'0'); }catch(x){} } });
document.addEventListener('click',e=>{ if(e.target.closest('[data-act=liverefresh]')){ e.stopPropagation(); liveFetch(true); } },true);

/* ================= STUDIO : images prêtes à poster (foot + NBA) ================= */
function stuS(){ return window.__stu || (window.__stu={tplF:'recap',tplN:'nres',fmt:'pt',lg:'',conf:'E',pick:{},title:{},tok:0,img:{},noImg:false}); }
var STU_FONT='"Inter","Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif';
var STU_FMT={sq:[1080,1080,'Carré'],pt:[1080,1350,'Portrait (Insta)'],st:[1080,1920,'Story / TikTok']};
var STU_TPL_F=[['recap','Récap de la journée','#0b1b30'],['table','Si ça reste comme ça / Classement','#2a1220'],['pre','Avant le match','#0a2a66'],['scor','Les buteurs','#1f2a12']];
var STU_TPL_N=[['nres','Résultats de la nuit','#140e1f'],['ntop','Les cartons de la nuit','#2a1608'],['nbox','Box score d\'un match','#0b1b30'],['nstand','Classement Est / Ouest','#0a2a66'],['npre','Avant-match NBA','#2a1220']];
var STU_HT={'fra.1':'#Ligue1','eng.1':'#PremierLeague','esp.1':'#LaLiga','ita.1':'#SerieA','ger.1':'#Bundesliga','uefa.champions':'#ChampionsLeague','uefa.europa':'#EuropaLeague','fra.2':'#Ligue2'};
var stuTag=s=>'#'+String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]/g,'');
var stuHandle=()=>{ const h=(typeof ttk!=='undefined'&&ttk.handle)||''; return h?'@'+h.replace(/^@/,''):'@statify'; };
var stuIni=n=>String(n||'?').replace(/^(FC|AS|OGC|RC|SC|AJ|Stade|Olympique|Real|Atlético|Athletic)\s+/i,'').slice(0,3).toUpperCase();
var stuOrd=n=>n===1?'1er':n+'e';

/* ---- dessin ---- */
function cvF(c,size,weight){ c.font=`${weight||700} ${Math.round(size)}px ${STU_FONT}`; }
function cvRR(c,x,y,w,h,r){ c.beginPath(); if(c.roundRect) c.roundRect(x,y,w,h,r); else { c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); } }
function cvFit(c,t,maxW){ t=String(t??''); if(c.measureText(t).width<=maxW) return t; while(t.length>1&&c.measureText(t+'…').width>maxW) t=t.slice(0,-1); return t+'…'; }
function cvTx(c,t,x,y,o){ o=o||{}; cvF(c,o.size||30,o.weight||700); c.fillStyle=o.color||'#fff'; c.textAlign=o.align||'left'; c.textBaseline=o.base||'alphabetic'; c.globalAlpha=o.alpha??1; c.fillText(o.max?cvFit(c,t,o.max):String(t??''),x,y); c.globalAlpha=1; }
function cvWrap(c,t,maxW,maxLines){ const w=String(t).split(/\s+/), L=[]; let cur=''; for(const x of w){ const nx=cur?cur+' '+x:x; if(c.measureText(nx).width>maxW&&cur){ L.push(cur); cur=x; } else cur=nx; } if(cur) L.push(cur); if(L.length>maxLines){ L.length=maxLines; L[maxLines-1]=cvFit(c,L[maxLines-1]+' …',maxW); } return L; }
function stuImg(url){ const S=stuS(); if(!url||S.noImg) return Promise.resolve(null); if(url in S.img) return Promise.resolve(S.img[url]);
  return new Promise(res=>{ const im=new Image(); im.crossOrigin='anonymous'; const to=setTimeout(()=>{ S.img[url]=null; res(null); },3500); im.onload=()=>{ clearTimeout(to); S.img[url]=im; res(im); }; im.onerror=()=>{ clearTimeout(to); S.img[url]=null; res(null); }; im.src=url; }); }
function cvLogo(c,url,x,y,s,label,col,ring){ const S=stuS(), im=url&&!S.noImg?S.img[url]:null;
  c.save(); c.beginPath(); c.arc(x+s/2,y+s/2,s/2,0,7); c.closePath();
  if(im){ c.fillStyle='#fff'; c.fill(); c.clip(); const p=s*.14; try{ c.drawImage(im,x+p,y+p,s-2*p,s-2*p); }catch(e){} }
  else { c.fillStyle=col||'#34b64f'; c.fill(); cvTx(c,label,x+s/2,y+s/2+s*.13,{size:s*.32,weight:900,align:'center',color:(typeof ink==='function'?ink(col||'#34b64f'):'#fff')}); }
  c.restore(); if(ring){ c.beginPath(); c.arc(x+s/2,y+s/2,s/2,0,7); c.lineWidth=s*.05; c.strokeStyle=ring; c.stroke(); } }
function cvDot(c,x,y,r,col,t){ c.beginPath(); c.arc(x,y,r,0,7); c.fillStyle=col; c.fill(); if(t) cvTx(c,t,x,y+r*.36,{size:r*1.05,weight:900,align:'center'}); }
function cvBadge(c,t,x,y,h,bg,fg){ cvF(c,h*.55,900); const w=c.measureText(t).width+h*.8; cvRR(c,x,y,w,h,h/2); c.fillStyle=bg; c.fill(); cvTx(c,t,x+w/2,y+h*.7,{size:h*.55,weight:900,align:'center',color:fg||'#fff'}); return w; }

/* ---- données des modèles ---- */
function stuLeagues(){ const L=FLG.filter(([c])=>foot.leagues[c]&&(Object.keys(foot.leagues[c].matches||{}).length||(foot.leagues[c].standings||[]).length)); return L.length?L:FLG.slice(0,1); }
function stuFootRecap(lg){
  const {mt}=footIdx(), done=mt.filter(m=>m.done&&m.lg===lg).sort((a,b)=>Date.parse(b.d)-Date.parse(a.d));
  if(!done.length) return {empty:'Aucun match terminé en mémoire pour ce championnat. Actualise le foot.'};
  const last=Date.parse(done[0].d), ms=done.filter(m=>last-Date.parse(m.d)<3.5*864e5).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d));
  let goals=0, late=null, comeback=null; const sc={};
  for(const m of ms){ goals+=m.hs+m.as; const ev=((m.x&&m.x.ev)||[]).filter(e=>(e.t==='g'||e.t==='pg'||e.t==='og')&&(e.s==='h'||e.s==='a')).sort((a,b)=>a.m-b.m); let h=0,a=0,dh=0,da=0;
    for(const e of ev){ e.s==='h'?h++:a++; dh=Math.max(dh,a-h); da=Math.max(da,h-a); if(e.p&&e.t!=='og') sc[e.p]=(sc[e.p]||0)+1; if(!late||e.m>late.e.m) late={e,m}; }
    for(const [sd,def] of [['h',dh],['a',da]]){ const my=sd==='h'?m.hs:m.as, op=sd==='h'?m.as:m.hs; if(def>=1&&my>op&&(!comeback||def>comeback.def)) comeback={def,team:sd==='h'?m.hn:m.an,opp:sd==='h'?m.an:m.hn}; } }
  const top=Object.entries(sc).sort((a,b)=>b[1]-a[1])[0], big=[...ms].sort((a,b)=>Math.abs(b.hs-b.as)-Math.abs(a.hs-a.as))[0];
  const hl=[{b:'⚽ '+goals,s:`but${goals>1?'s':''} sur ${ms.length} matchs`}];
  if(comeback) hl.push({b:'🔄 '+comeback.team,s:`renverse ${comeback.opp}`}); else if(big&&Math.abs(big.hs-big.as)>=2){ const w=big.hs>big.as?big.hn:big.an; hl.push({b:'💥 '+w,s:`plus large victoire (${Math.max(big.hs,big.as)}-${Math.min(big.hs,big.as)})`}); }
  if(top&&top[1]>=2) hl.push({b:`👑 ${top[0]}`,s:`${top[1]===2?'doublé':top[1]===3?'triplé':top[1]+' buts'}`}); else if(late&&late.e.m>=80) hl.push({b:'⏱ '+(late.e.ms||late.e.m+"'"),s:`${late.e.p||'?'}, le plus tardif`});
  const d1=new Date(Date.parse(ms[0].d)), d2=new Date(last), fd=d=>d.toLocaleDateString('fr-FR',{...PARIS,day:'numeric',month:'short'}).replace('.','');
  const story=comeback?`${comeback.team} renverse ${comeback.opp}`:big?`${big.hs>big.as?big.hn:big.as>big.hs?big.an:big.hn} ${big.hs===big.as?'accroché':'s\'impose'} (${big.hs}-${big.as})`:'';
  return {theme:'recap',eyebrow:`${footLgName(lg)} · ${fd(d1)===fd(d2)?fd(d2):fd(d1)+' – '+fd(d2)}`,title:'Le récap de la journée ⚽',cta:'Ton avis en commentaire 👇',
    src:ms,rows:ms.map(m=>({k:'res',h:m.hn,a:m.an,hs:m.hs,as:m.as,hl:m.hl,al:m.al,hc:fcol(m.hc),ac:fcol(m.ac)})),hl,
    caption:`${story?story+' 🔥 ':''}Le récap de la journée en ${footLgName(lg)} ⚽ ${goals} buts !\n\n${STU_HT[lg]||stuTag(footLgName(lg))} #football #foot ${ms.slice(0,3).map(m=>stuTag(m.hn)).join(' ')}`};
}
function stuFootTable(lg,max){
  const LG=foot.leagues[lg]; if(!LG||!(LG.standings||[]).length) return {empty:'Pas de classement chargé pour ce championnat. Actualise le foot.'};
  let live=[]; try{ live=multiSet('all').filter(m=>m.lg===lg&&m.st==='in'); }catch(e){}
  const rows=LG.standings.map(r=>({...r,np:r.pts,ngd:r.gd,ngf:r.gf,res:''})), by=Object.fromEntries(rows.map(r=>[r.id,r]));
  for(const m of live) for(const [id,gf,ga,opp,home] of [[m.hid,m.hs,m.as,m.an,1],[m.aid,m.as,m.hs,m.hn,0]]){ const r=by[id]; if(!r) continue; r.np+=gf>ga?3:gf===ga?1:0; r.ngd+=gf-ga; r.ngf+=gf; r.res=`${gf>ga?'gagne':gf<ga?'perd':'nul'} ${gf}-${ga} ${home?'contre':'à'} ${opp}`; }
  const srt=live.length?[...rows].sort((a,b)=>b.np-a.np||b.ngd-a.ngd||b.ngf-a.ngf||a.rank-b.rank):[...rows].sort((a,b)=>a.rank-b.rank); srt.forEach((r,i)=>{ r.nr=i+1; });
  const {T}=footIdx(), form=id=>{ const t=T[id]; return t&&t.log?t.log.slice(-5).map(x=>x.res==='w'?'V':x.res==='l'?'D':'N'):[]; };
  const mins=live.map(m=>{ const k=String(m.txt||'').match(/(\d+)/); return k?+k[1]:0; }), mn=mins.length?Math.max(...mins):0;
  const movers=srt.filter(r=>r.nr!==r.rank).sort((a,b)=>Math.abs(b.rank-b.nr)-Math.abs(a.rank-a.nr));
  return live.length?{src:{live,srt},theme:'live',badge:`EN DIRECT${mn?' · '+mn+"'":''}`,eyebrow:footLgName(lg),title:'Si ça reste comme ça… 📈',cta:'Qui finit en tête ce soir ? 👇',
      rows:srt.slice(0,max).map(r=>({k:'st',rk:r.nr,mv:r.rank-r.nr,n:r.name,lo:r.logo,pts:r.np,sub:r.res,live:!!r.res})),
      caption:`🔴 EN DIRECT : si ça reste comme ça…${movers[0]?` ${movers[0].name} ${movers[0].rank>movers[0].nr?'grimpe':'chute'} à la ${stuOrd(movers[0].nr)} place !`:''} 📈\n\n${STU_HT[lg]||stuTag(footLgName(lg))} #football #direct`}
    :{src:{live,srt},theme:'table',eyebrow:`${footLgName(lg)} · ${new Date().toLocaleDateString('fr-FR',{...PARIS,day:'numeric',month:'long'})}`,title:'Le classement 📊',cta:'Qui sera champion ? 👇',
      rows:srt.slice(0,max).map(r=>({k:'st',rk:r.rank,mv:0,n:r.name,lo:r.logo,pts:r.pts,sub:`${r.gp} J · ${r.gd>0?'+':''}${r.gd}`,form:form(r.id),zone:r.zone&&r.zone.c})),
      caption:`📊 Le classement de ${footLgName(lg)} après cette journée. ${srt[0]?srt[0].name+' en tête avec '+srt[0].pts+' pts !':''}\n\n${STU_HT[lg]||stuTag(footLgName(lg))} #football #classement`};
}
function stuFootPreList(lg){ const {mt}=footIdx(), now=Date.now(); return mt.filter(m=>m.lg===lg&&!m.done&&m.st!=='in'&&Date.parse(m.d)>now-2*36e5&&Date.parse(m.d)<now+8*864e5).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d)); }
function stuFootPre(lg,pick){
  const L=stuFootPreList(lg); if(!L.length) return {empty:'Aucun match à venir en mémoire pour ce championnat (8 prochains jours).'};
  const {T,P,mt}=footIdx(), rk=id=>T[id]&&T[id].st?T[id].st.rank:30;
  const soon=L.filter(m=>Date.parse(m.d)<Date.parse(L[0].d)+3*864e5), def=[...soon].sort((a,b)=>(rk(a.hid)+rk(a.aid))-(rk(b.hid)+rk(b.aid)))[0];
  const m=L.find(x=>String(x.id)===String(pick))||def, th=T[m.hid]||{}, ta=T[m.aid]||{};
  const form=t=>t&&t.log?t.log.slice(-5).map(x=>x.res==='w'?'V':x.res==='l'?'D':'N'):[];
  const h2=mt.filter(x=>x.done&&((x.hid===m.hid&&x.aid===m.aid)||(x.hid===m.aid&&x.aid===m.hid))); let wa=0,wb=0,dr=0; for(const x of h2){ const g1=x.hid===m.hid?x.hs:x.as, g2=x.hid===m.hid?x.as:x.hs; g1>g2?wa++:g1<g2?wb++:dr++; }
  const top=id=>Object.values(P).filter(p=>p.tid===id&&p.g>0).sort((a,b)=>b.g-a.g)[0];
  const d=new Date(Date.parse(m.d)), today=parisDK(new Date().toISOString()), dk=parisDK(m.d), when=dk===today?'Ce soir':dk===parisDK(new Date(Date.now()+864e5).toISOString())?'Demain':d.toLocaleDateString('fr-FR',{...PARIS,weekday:'long',day:'numeric',month:'short'});
  const isDef=m===def;
  return {src:m,theme:'pre',eyebrow:`${when} ${parisT(m.d)}${(m.ven||(m.x&&m.x.ven))?' · '+(m.ven||m.x.ven):''}`,title:isDef?'L\'affiche de la journée 🔥':'Avant-match 🔥',cta:'Ton prono ? 👇',
    pre:{h:m.hn,a:m.an,hl:m.hl,al:m.al,hc:fcol(m.hc),ac:fcol(m.ac),hs:th.st?`${stuOrd(th.st.rank)} · ${th.st.pts} pts`:'',as:ta.st?`${stuOrd(ta.st.rank)} · ${ta.st.pts} pts`:'',lgn:footLgName(lg),fh:form(th),fa:form(ta),h2:[wa,dr,wb],ph:top(m.hid),pa:top(m.aid)},
    caption:`🔥 ${m.hn} – ${m.an}, ${when.toLowerCase()} à ${parisT(m.d)} ! Forme, face à face, joueurs à suivre : tout ce qu'il faut savoir avant le match. Ton prono ? 👇\n\n${STU_HT[lg]||stuTag(footLgName(lg))} ${stuTag(m.hn)} ${stuTag(m.an)} #football #prono`};
}
function stuFootScor(lg,max){
  const {P}=footIdx(), L=Object.values(P).filter(p=>(p.comps||{})[lg]&&p.g>0).sort((a,b)=>b.g-a.g||b.a-a.a).slice(0,max);
  if(!L.length) return {empty:'Pas encore de buteurs en mémoire : charge « Depuis le début de saison » dans « Actualiser le foot ».'};
  return {theme:'scor',eyebrow:`${footLgName(lg)} · matchs chargés`,title:'Les buteurs 🎯',cta:'Qui finira meilleur buteur ? 👇',
    rows:L.map((p,i)=>({k:'pl',rk:i+1,n:p.n,sub:`${p.tn}${p.a?' · '+p.a+' passe'+(p.a>1?'s':'')+' déc.':''}`,big:p.g,unit:'buts',col:fcol(p.tco),lo:p.tlo})),
    caption:`🎯 Les meilleurs buteurs de ${footLgName(lg)} : ${L[0].n} mène la danse avec ${L[0].g} buts ! Qui va finir en tête ? 👇\n\n${STU_HT[lg]||stuTag(footLgName(lg))} #football #buteur`};
}
/* NBA */
function stuNbaNight(){ const fin=Object.values(games).filter(g=>g.status===3&&g.time); if(!fin.length) return null; const day=fin.map(g=>nyDay(g.time)).sort().pop(); return {day,gs:fin.filter(g=>nyDay(g.time)===day).sort((a,b)=>tms(a)-tms(b))}; }
var stuNbaDate=day=>new Date(day+'T12:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:'long'});
var stuNick=t=>NICK[t]||tname(t);
function stuNbaRes(){
  const N=stuNbaNight(); if(!N) return {empty:'Aucun match NBA terminé en mémoire. Actualise la NBA.'};
  const big=[...N.gs].sort((a,b)=>Math.abs(b.home.score-b.away.score)-Math.abs(a.home.score-a.away.score))[0], close=[...N.gs].sort((a,b)=>Math.abs(a.home.score-a.away.score)-Math.abs(b.home.score-b.away.score))[0];
  return {src:N.gs,theme:'nba',eyebrow:`NBA · Nuit du ${stuNbaDate(N.day)}`,title:'Les résultats de la nuit 🏀',cta:'Le match de la nuit ? 👇',
    rows:N.gs.map(g=>({k:'nres',a:g.away.tri,h:g.home.tri,as:+g.away.score,hs:+g.home.score,ot:Math.max((g.away.q||[]).length,(g.home.q||[]).length)>4})),
    caption:`🏀 Les résultats de la nuit en NBA : ${N.gs.length} matchs.${close?` Le plus serré : ${stuNick(close.away.tri)} – ${stuNick(close.home.tri)} (${close.away.score}-${close.home.score}).`:''}\n\n#NBA #NBAFrance #basket ${N.gs.slice(0,3).map(g=>stuTag(stuNick(+g.away.score>+g.home.score?g.away.tri:g.home.tri))).join(' ')}`};
}
var stuDD=p=>{ const n=[p.pts,p.reb,p.ast,p.stl,p.blk].filter(v=>v>=10).length; return n>=3?'TD':n===2?'DD':''; };
function stuNbaTop(max){
  const N=stuNbaNight(); if(!N) return {empty:'Aucun match NBA terminé en mémoire. Actualise la NBA.'};
  const ps=N.gs.flatMap(g=>[...g.home.players,...g.away.players].filter(p=>p.min>0)).sort((a,b)=>b.pts-a.pts||b.reb-a.reb).slice(0,max);
  if(!ps.length) return {empty:'Pas de stats joueurs pour cette nuit.'};
  const td=ps.filter(p=>stuDD(p)==='TD');
  return {src:ps,theme:'nba',eyebrow:`NBA · Nuit du ${stuNbaDate(N.day)}`,title:'Les cartons de la nuit 🔥',cta:'Le meilleur de la nuit ? 👇',
    rows:ps.map((p,i)=>({k:'pl',rk:i+1,n:p.name,sub:`${p.tri} · ${p.reb} reb · ${p.ast} pas${p.blk>=3?' · '+p.blk+' cont':''}`,big:p.pts,unit:'pts',col:tcolor(p.tri),badge:stuDD(p),ini:initials(p.name)})),
    caption:`🔥 Les cartons de la nuit en NBA : ${ps[0].name} frappe fort avec ${ps[0].pts} points !${td.length?` Et ${td.length>1?td.length+' triple-doubles':'un triple-double de '+td[0].name} 🤯`:''}\n\n#NBA #NBAFrance #basket ${stuTag(stuNick(ps[0].tri))}`};
}
function stuNbaBox(pick){
  const N=stuNbaNight(); if(!N) return {empty:'Aucun match NBA terminé en mémoire. Actualise la NBA.'};
  const def=[...N.gs].sort((a,b)=>Math.abs(a.home.score-a.away.score)-Math.abs(b.home.score-b.away.score))[0], g=N.gs.find(x=>x.id===pick)||def;
  const top=t=>t.players.filter(p=>p.min>0).sort((a,b)=>b.pts-a.pts).slice(0,3).map(p=>({n:p.name,pts:p.pts,reb:p.reb,ast:p.ast,b:stuDD(p)}));
  const aw=+g.away.score>+g.home.score, w=aw?g.away:g.home, l=aw?g.home:g.away;
  return {src:g,theme:'nba',eyebrow:`NBA · Nuit du ${stuNbaDate(N.day)}`,title:`Les ${stuNick(w.tri)} s'imposent${Math.abs(w.score-l.score)<=5?' au bout du suspense':''} 🏀`,cta:'Ton MVP du match ? 👇',
    box:{a:g.away.tri,h:g.home.tri,as:+g.away.score,hs:+g.home.score,qa:g.away.q||[],qh:g.home.q||[],ta:top(g.away),th:top(g.home)},
    caption:`🏀 ${stuNick(g.away.tri)} ${g.away.score} – ${g.home.score} ${stuNick(g.home.tri)}. ${top(w)[0]?top(w)[0].n+' : '+top(w)[0].pts+' points.':''}\n\n#NBA #NBAFrance ${stuTag(stuNick(g.away.tri))} ${stuTag(stuNick(g.home.tri))}`};
}
function stuNbaStand(conf,max){
  const S=buildStats(); const L=Object.values(S.T).filter(t=>(TEAMS[t.tri]||[])[1]===conf&&t.g>0).sort(standCmp); if(!L.length) return {empty:'Pas assez de matchs NBA en mémoire.'};
  let pr={}; try{ const P=prevStats(); if(P&&P.T) Object.values(P.T).filter(t=>(TEAMS[t.tri]||[])[1]===conf&&t.g>0).sort(standCmp).forEach((t,i)=>{ pr[t.tri]=i+1; }); }catch(e){}
  const cn=conf==='E'?'Est':'Ouest';
  return {theme:'nstand',eyebrow:`NBA · Conférence ${cn}`,title:`Le classement à l'${cn} 📊`,cta:'Qui va aller au bout ? 👇',
    rows:L.slice(0,max).map((t,i)=>({k:'st',rk:i+1,mv:pr[t.tri]?pr[t.tri]-(i+1):0,n:tname(t.tri),tri:t.tri,pts:`${t.w}-${t.l}`,sub:`${(100*t.w/t.g).toFixed(0)} % · série ${streak(t.log)}`,form:t.log.slice(-5).map(x=>x.win?'V':'D'),col:tcolor(t.tri)})),
    caption:`📊 Le classement de la conférence ${cn} en NBA : ${tname(L[0].tri)} en tête (${L[0].w}-${L[0].l}) !\n\n#NBA #NBAFrance #basket`};
}
function stuNbaPreList(){ try{ return upcoming().filter(x=>Date.parse(x.t)<Date.now()+3*864e5).slice(0,40); }catch(e){ return []; } }
function stuNbaPre(pick){
  const L=stuNbaPreList(); if(!L.length) return {empty:'Aucun match NBA à venir dans le calendrier. Charge le calendrier (nba.com/schedule).'};
  const S=buildStats(), wp=t=>{ const x=S.T[t]; return x&&x.g?x.w/x.g:.4; }, d0=nyDay(L[0].t);
  const def=[...L.filter(x=>nyDay(x.t)===d0)].sort((a,b)=>(wp(b.h)+wp(b.a))-(wp(a.h)+wp(a.a)))[0], x=L.find(y=>y.id===pick)||def;
  let sc=null; try{ sc=teamSchedules(); }catch(e){}
  const rest=t=>{ if(!sc) return ''; const r=restBefore(sc,t,x.id); return r===null?'':r===0?'2e soir de suite':`Reposé · ${r} j`; };
  const rec=t=>{ const T=S.T[t]; return T?`${T.w}-${T.l}`:''; }, form=t=>{ const T=S.T[t]; return T?T.log.slice(-5).map(y=>y.win?'V':'D'):[]; };
  const top=t=>Object.values(S.P).filter(p=>p.tri===t&&p.gp>0).sort((a,b)=>b.pts/b.gp-a.pts/a.gp)[0];
  const ser=S.fin.filter(g=>(g.home.tri===x.h&&g.away.tri===x.a)||(g.home.tri===x.a&&g.away.tri===x.h)); let wa=0,wh=0; for(const g of ser){ ((g.home.tri===x.a)===(+g.home.score>+g.away.score))?wa++:wh++; }
  const ta=top(x.a), th=top(x.h);
  return {src:x,theme:'npre',eyebrow:`NBA · ${new Date(Date.parse(x.t)).toLocaleDateString('fr-FR',{...PARIS,weekday:'long',day:'numeric',month:'short'})} · ${parisT(x.t)}`,title:x===def?'L\'affiche de la nuit 🔥':'Avant-match 🔥',cta:'Ton prono ? 👇',
    pre:{nba:1,h:stuNick(x.a),a:stuNick(x.h),htri:x.a,atri:x.h,hc:tcolor(x.a),ac:tcolor(x.h),hs:rec(x.a),as:rec(x.h),lgn:'NBA',fh:form(x.a),fa:form(x.h),h2:[wa,0,wh],rh:rest(x.a),ra:rest(x.h),ph:ta?{n:ta.name,g:f1(ta.pts/ta.gp),u:'pts/m'}:null,pa:th?{n:th.name,g:f1(th.pts/th.gp),u:'pts/m'}:null},
    caption:`🔥 ${stuNick(x.a)} @ ${stuNick(x.h)} cette nuit à ${parisT(x.t)} ! Forme, repos, joueurs à suivre : ton prono ? 👇\n\n#NBA #NBAFrance ${stuTag(stuNick(x.a))} ${stuTag(stuNick(x.h))}`};
}

/* ---- rendu d'une carte ---- */
var STU_TH={recap:{bg:['#0b1b30','#0b1b30'],g1:'#2fc15a',g2:'#1f6fff',acc:'#7dffa6'},live:{bg:['#0b1b30','#0b1b30'],g1:'#ff3b4a',g2:'#1f6fff',acc:'#ff8a8a'},table:{bg:['#0b1b30','#0b1b30'],g1:'#1f6fff',g2:'#2fc15a',acc:'#8fc1ff'},
  pre:{bg:['#0a2a66','#2a1430'],g1:'#ffcc33',g2:'#c8102e',acc:'#ffcc33'},scor:{bg:['#0f1c14','#0b1b30'],g1:'#ffcc33',g2:'#2fc15a',acc:'#ffd24a'},nba:{bg:['#140e1f','#140e1f'],g1:'#ff9f1a',g2:'#c8102e',acc:'#ffb547'},
  nstand:{bg:['#0b1b30','#140e1f'],g1:'#1f6fff',g2:'#ff9f1a',acc:'#8fc1ff'},npre:{bg:['#2a1220','#140e1f'],g1:'#ff9f1a',g2:'#1f6fff',acc:'#ffcc33'}};
function stuData(sport){ const D=stuData0(sport); try{ if(D&&!D.empty) D.caption=stuCaption(sport,D)||D.caption; }catch(e){ console.error(e); } return D; }
function stuData0(sport){ const S=stuS(), max={sq:7,pt:9,st:13}[S.fmt]||9;
  if(sport==='foot'){ const lg=S.lg&&foot.leagues[S.lg]?S.lg:stuLeagues()[0][0]; S.lg=lg; const t=S.tplF;
    return t==='table'?stuFootTable(lg,max+1):t==='pre'?stuFootPre(lg,S.pick.pre):t==='scor'?stuFootScor(lg,max):stuFootRecap(lg); }
  const t=S.tplN; return t==='ntop'?stuNbaTop(Math.min(max-1,8)):t==='nbox'?stuNbaBox(S.pick.nbox):t==='nstand'?stuNbaStand(S.conf,Math.min(max+1,15)):t==='npre'?stuNbaPre(S.pick.npre):stuNbaRes(); }
async function stuRender(cv,D,fmt){
  const [W,H]=STU_FMT[fmt]||STU_FMT.pt, c=cv.getContext('2d'), th=STU_TH[D.theme]||STU_TH.recap, S=stuS(), tk=S.tok;
  const urls=[]; for(const r of (D.rows||[])){ if(r.hl) urls.push(r.hl); if(r.al) urls.push(r.al); if(r.lo) urls.push(r.lo); if(r.tri) urls.push(logoUrl(r.tri)); if(r.k==='nres'){ urls.push(logoUrl(r.a),logoUrl(r.h)); } }
  if(D.pre){ if(D.pre.nba){ urls.push(logoUrl(D.pre.htri),logoUrl(D.pre.atri)); } else urls.push(D.pre.hl,D.pre.al); } if(D.box) urls.push(logoUrl(D.box.a),logoUrl(D.box.h));
  urls.push('icon-192.png'); await Promise.all(urls.filter(Boolean).map(stuImg)); if(tk!==S.tok) return;
  cv.width=W; cv.height=H;
  // fond
  const g=c.createLinearGradient(0,0,W*.6,H); g.addColorStop(0,th.bg[0]); g.addColorStop(1,th.bg[1]); c.fillStyle=g; c.fillRect(0,0,W,H);
  for(const [x,y,r,col] of [[W,0,W*.85,th.g1],[0,H,W*.85,th.g2]]){ const rg=c.createRadialGradient(x,y,0,x,y,r); rg.addColorStop(0,col+'55'); rg.addColorStop(1,col+'00'); c.fillStyle=rg; c.fillRect(0,0,W,H); }
  const P=72, story=fmt==='st', top=story?190:70, botSafe=story?260:0;
  // marque
  const ic=S.img['icon-192.png']; if(ic&&!S.noImg){ c.save(); cvRR(c,P,top,58,58,16); c.clip(); try{ c.drawImage(ic,P,top,58,58); }catch(e){} c.restore(); } else { cvRR(c,P,top,58,58,16); c.fillStyle='#2fc15a'; c.fill(); }
  cvTx(c,'S T A T I F Y',P+76,top+40,{size:26,weight:900,alpha:.9});
  let y=top+58+56;
  if(D.badge){ const w=cvBadge(c,'● '+D.badge,P,y-34,48,'#ff3b4a'); y+=36; }
  cvTx(c,String(D.eyebrow||'').toUpperCase(),P,y,{size:26,weight:900,color:th.acc,max:W-2*P}); y+=18;
  const ttl=(S.title[(D.theme||'')+'|'+(D.title||'')]||D.title||''); cvF(c,story?84:76,900); const TL=cvWrap(c,ttl,W-2*P,2); for(const l of TL){ y+=story?92:84; cvTx(c,l,P,y,{size:story?84:76,weight:900}); }
  y+=40;
  const fy=H-botSafe-120, avail=fy-30-y;
  // pied
  c.fillStyle='#ffffff26'; c.fillRect(P,fy,W-2*P,2);
  cvTx(c,stuHandle(),P,fy+66,{size:30,weight:800,alpha:.85}); cvTx(c,D.cta||'',W-P,fy+66,{size:28,weight:800,align:'right',alpha:.85,max:W/2});
  if(D.rows) stuRows(c,D,P,y,W-2*P,avail,fmt);
  else if(D.pre) stuPre(c,D.pre,P,y,W-2*P,avail,th);
  else if(D.box) stuBox(c,D.box,P,y,W-2*P,avail);
  else if(D.match) stuMatch(c,D.match,P,y,W-2*P,avail);
}
function stuRows(c,D,x,y,w,avail,fmt){
  const hlH=D.hl?150:0, rows=D.rows, n=rows.length, maxRow=D.rows[0].k==='pl'?130:D.rows[0].k==='res'?124:110, gap=12;
  let rh=Math.min(maxRow,Math.floor((avail-hlH-(hlH?24:0)-gap*(n-1))/Math.max(1,n))); let shown=rows;
  if(rh<58){ const k=Math.max(1,Math.floor((avail-hlH-(hlH?24:0)+gap)/(58+gap))); shown=rows.slice(0,k); rh=58; }
  shown.forEach((r,i)=>{ const yy=y+i*(rh+gap); stuRow(c,r,x,yy,w,rh); });
  if(D.hl){ const yy=y+shown.length*(rh+gap)+12, cw=(w-2*16)/3; D.hl.slice(0,3).forEach((h,i)=>{ const xx=x+i*(cw+16); cvRR(c,xx,yy,cw,hlH,22); c.fillStyle='#ffffff14'; c.fill(); cvTx(c,h.b,xx+20,yy+62,{size:38,weight:900,max:cw-40}); cvTx(c,h.s,xx+20,yy+108,{size:24,weight:600,alpha:.8,max:cw-40}); }); }
}
function stuRowBase(c,r,x,y,w,h){
  const f=h/96; cvRR(c,x,y,w,h,20*f); c.fillStyle=r.live?'#ffffff1c':'#ffffff10'; c.fill();
  if(r.k==='res'){ const s=h*.56, mid=x+w/2, hw=r.hs>r.as, aw=r.as>r.hs, dim='#ffffff8a';
    cvLogo(c,r.hl,x+18*f,y+(h-s)/2,s,stuIni(r.h),r.hc); cvTx(c,r.h,x+18*f+s+16*f,y+h/2+12*f,{size:34*f,weight:800,color:aw?dim:'#fff',max:w/2-s-110*f});
    cvTx(c,`${r.hs} - ${r.as}`,mid,y+h/2+15*f,{size:44*f,weight:900,align:'center'});
    cvLogo(c,r.al,x+w-18*f-s,y+(h-s)/2,s,stuIni(r.a),r.ac); cvTx(c,r.a,x+w-18*f-s-16*f,y+h/2+12*f,{size:34*f,weight:800,align:'right',color:hw?dim:'#fff',max:w/2-s-110*f}); return; }
  if(r.k==='nres'){ const s=h*.6, mid=x+w/2, aw=r.as>r.hs, dim='#ffffff8a';
    cvLogo(c,logoUrl(r.a),x+18*f,y+(h-s)/2,s,r.a,tcolor(r.a)); cvTx(c,stuNick(r.a),x+18*f+s+16*f,y+h/2+12*f,{size:32*f,weight:800,color:aw?'#fff':dim,max:w/2-s-120*f});
    cvTx(c,`${r.as} - ${r.hs}`,mid,y+h/2+15*f,{size:42*f,weight:900,align:'center'}); if(r.ot) cvTx(c,'PROL.',mid,y+h-10*f,{size:16*f,weight:900,align:'center',color:'#ffb547'});
    cvLogo(c,logoUrl(r.h),x+w-18*f-s,y+(h-s)/2,s,r.h,tcolor(r.h)); cvTx(c,stuNick(r.h),x+w-18*f-s-16*f,y+h/2+12*f,{size:32*f,weight:800,align:'right',color:aw?dim:'#fff',max:w/2-s-120*f}); return; }
  if(r.k==='st'){ const s=h*.54; let xx=x+22*f;
    if(r.zone){ c.fillStyle=r.zone; cvRR(c,x,y+h*.2,8*f,h*.6,4*f); c.fill(); }
    cvTx(c,r.rk,xx+18*f,y+h/2+12*f,{size:34*f,weight:900,align:'center'}); xx+=52*f;
    cvLogo(c,r.lo||(r.tri?logoUrl(r.tri):''),xx,y+(h-s)/2,s,r.tri||stuIni(r.n),r.col||'#34b64f'); xx+=s+18*f;
    const right=x+w-24*f, ptsW=110*f, mvW=r.mv?90*f:(r.form&&r.form.length?r.form.length*30*f+10*f:0);
    cvTx(c,r.n,xx,y+(r.sub?h*.45:h/2+12*f),{size:32*f,weight:800,max:right-ptsW-mvW-xx-10*f}); if(r.sub) cvTx(c,r.sub,xx,y+h*.78,{size:22*f,weight:600,alpha:.75,max:right-ptsW-mvW-xx-10*f});
    cvTx(c,r.pts,right-mvW-10*f,y+h/2+13*f,{size:36*f,weight:900,align:'right'});
    if(r.mv) cvTx(c,(r.mv>0?'▲':'▼')+Math.abs(r.mv),right,y+h/2+12*f,{size:30*f,weight:900,align:'right',color:r.mv>0?'#5dff8f':'#ff7a6a'});
    else if(r.form&&r.form.length){ r.form.forEach((v,i)=>cvDot(c,right-(r.form.length-1-i)*30*f-12*f,y+h/2,12*f,v==='V'?'#2fc15a':v==='D'?'#ff3b4a':'#8a9ab0')); }
    if(r.live){ c.strokeStyle=r.mv>0?'#2fc15a99':r.mv<0?'#ff3b4a99':'#ffffff33'; c.lineWidth=3; cvRR(c,x,y,w,h,20*f); c.stroke(); } return; }
  if(r.k==='pl'){ const s=h*.62; let xx=x+20*f;
    cvTx(c,r.rk,xx+16*f,y+h/2+14*f,{size:40*f,weight:900,align:'center',alpha:.45}); xx+=50*f;
    if(r.lo) cvLogo(c,r.lo,xx,y+(h-s)/2,s,stuIni(r.sub),r.col); else cvLogo(c,'',xx,y+(h-s)/2,s,r.ini||stuIni(r.n),r.col); xx+=s+20*f;
    const right=x+w-24*f; cvF(c,72*f,900); const bw=c.measureText(String(r.big)).width+70*f;
    cvTx(c,r.n,xx,y+h*.45,{size:34*f,weight:800,max:right-bw-xx-(r.badge?70*f:0)});
    if(r.badge){ cvF(c,34*f,800); const nw=Math.min(c.measureText(r.n).width,right-bw-xx-70*f); cvBadge(c,r.badge,xx+nw+12*f,y+h*.45-30*f,34*f,r.badge==='TD'?'#ffb020':'#1f6fff',r.badge==='TD'?'#1b1300':'#fff'); }
    cvTx(c,r.sub,xx,y+h*.76,{size:23*f,weight:600,alpha:.75,max:right-bw-xx});
    cvTx(c,r.big,right-58*f,y+h/2+24*f,{size:64*f,weight:900,align:'right'}); cvTx(c,r.unit,right,y+h/2+24*f,{size:22*f,weight:700,align:'right',alpha:.7}); }
}
function stuPre(c,p,x,y,w,avail,th){
  const sc=Math.min(1,avail/900), L=200*sc, cx1=x+w*.2, cx2=x+w*.8;
  for(const [cx,url,tri,n,col,sub] of [[cx1,p.nba?logoUrl(p.htri):p.hl,p.htri,p.h,p.hc,p.hs],[cx2,p.nba?logoUrl(p.atri):p.al,p.atri,p.a,p.ac,p.as]]){
    cvLogo(c,url,cx-L/2,y,L,tri||stuIni(n),col,'#fff'); cvTx(c,n,cx,y+L+58*sc,{size:44*sc,weight:900,align:'center',max:w*.4}); if(sub) cvTx(c,sub,cx,y+L+100*sc,{size:28*sc,weight:700,align:'center',alpha:.8}); }
  cvTx(c,'VS',x+w/2,y+L/2+30*sc,{size:96*sc,weight:900,align:'center'}); cvTx(c,p.lgn,x+w/2,y+L/2+82*sc,{size:26*sc,weight:700,align:'center',alpha:.8});
  let yy=y+L+140*sc; const bh=Math.max(110,150*sc), gap=18*sc;
  const box=(title,draw)=>{ if(yy+bh>y+avail) return; cvRR(c,x,yy,w,bh,24); c.fillStyle='#ffffff10'; c.fill(); cvTx(c,title.toUpperCase(),x+28,yy+44,{size:22,weight:900,alpha:.7}); draw(yy); yy+=bh+gap; };
  if((p.fh&&p.fh.length)||(p.fa&&p.fa.length)) box('Forme (5 derniers)'+(p.rh||p.ra?' · repos':''),Y=>{ (p.fh||[]).forEach((v,i)=>cvDot(c,x+46+i*52,Y+bh-44,21,v==='V'?'#2fc15a':v==='D'?'#ff3b4a':'#8a9ab0',v)); (p.fa||[]).forEach((v,i,a)=>cvDot(c,x+w-46-(a.length-1-i)*52,Y+bh-44,21,v==='V'?'#2fc15a':v==='D'?'#ff3b4a':'#8a9ab0',v));
    if(p.rh) cvTx(c,p.rh,x+28+Math.max(1,(p.fh||[]).length)*52+10,Y+bh-36,{size:22,weight:800,color:/2e soir/.test(p.rh)?'#ffb547':'#7dffa6'}); if(p.ra) cvTx(c,p.ra,x+w-28-Math.max(1,(p.fa||[]).length)*52-10,Y+bh-36,{size:22,weight:800,align:'right',color:/2e soir/.test(p.ra)?'#ffb547':'#7dffa6'}); });
  const [a,d,b]=p.h2||[0,0,0], t=a+d+b;
  if(t) box(p.nba?'Bilan cette saison':'Face à face',Y=>{ cvTx(c,`${p.h} ${a}`,x+28,Y+88,{size:28,weight:800,max:w/2-60}); if(d) cvTx(c,`${d} nul${d>1?'s':''}`,x+w/2,Y+88,{size:24,weight:700,align:'center',alpha:.75}); cvTx(c,`${p.a} ${b}`,x+w-28,Y+88,{size:28,weight:800,align:'right',max:w/2-60});
    let xx=x+28; const bw=w-56; for(const [v,col] of [[a,p.hc],[d,'#8a9ab0'],[b,p.ac]]){ const ww=bw*v/t; if(ww>0){ c.fillStyle=col; c.fillRect(xx,Y+bh-36,ww,14); xx+=ww; } } });
  if(p.ph||p.pa) box('Joueurs à suivre',Y=>{ if(p.ph){ cvTx(c,String(p.ph.g),x+28,Y+bh-30,{size:60,weight:900}); cvF(c,60,900); const gw=c.measureText(String(p.ph.g)).width; cvTx(c,p.ph.n,x+44+gw,Y+bh-58,{size:26,weight:800,max:w/2-gw-80}); cvTx(c,p.ph.u||'buts',x+44+gw,Y+bh-28,{size:22,weight:600,alpha:.75}); }
    if(p.pa){ cvTx(c,String(p.pa.g),x+w-28,Y+bh-30,{size:60,weight:900,align:'right'}); cvF(c,60,900); const gw=c.measureText(String(p.pa.g)).width; cvTx(c,p.pa.n,x+w-44-gw,Y+bh-58,{size:26,weight:800,align:'right',max:w/2-gw-80}); cvTx(c,p.pa.u||'buts',x+w-44-gw,Y+bh-28,{size:22,weight:600,align:'right',alpha:.75}); } });
}
function stuBox(c,b,x,y,w,avail){
  const L=150, cx1=x+w*.18, cx2=x+w*.82;
  cvLogo(c,logoUrl(b.a),cx1-L/2,y,L,b.a,tcolor(b.a),'#fff'); cvLogo(c,logoUrl(b.h),cx2-L/2,y,L,b.h,tcolor(b.h),'#fff');
  cvTx(c,stuNick(b.a),cx1,y+L+46,{size:32,weight:900,align:'center',max:w*.34}); cvTx(c,stuNick(b.h),cx2,y+L+46,{size:32,weight:900,align:'center',max:w*.34});
  cvTx(c,`${b.as} - ${b.hs}`,x+w/2,y+L/2+30,{size:Math.max(b.as,b.hs)>=100?76:96,weight:900,align:'center'}); cvTx(c,'Final'+(Math.max(b.qa.length,b.qh.length)>4?' · prol.':''),x+w/2,y+L/2+84,{size:26,weight:700,align:'center',alpha:.75});
  let yy=y+L+80; const n=Math.max(b.qa.length,b.qh.length);
  if(n){ const qh=150; cvRR(c,x,yy,w,qh,22); c.fillStyle='#ffffff10'; c.fill(); const cw=(w-200)/(n+1);
    for(let i=0;i<=n;i++){ const lab=i===n?'T':i<4?'Q'+(i+1):'OT'+(i-3), xx=x+170+i*cw+cw/2; cvTx(c,lab,xx,yy+40,{size:22,weight:900,align:'center',alpha:.6}); cvTx(c,i===n?b.as:(b.qa[i]??'–'),xx,yy+86,{size:30,weight:i===n?900:700,align:'center'}); cvTx(c,i===n?b.hs:(b.qh[i]??'–'),xx,yy+130,{size:30,weight:i===n?900:700,align:'center'}); }
    cvTx(c,b.a,x+28,yy+86,{size:28,weight:900}); cvTx(c,b.h,x+28,yy+130,{size:28,weight:900}); yy+=qh+24; }
  const extra=(b.st?230:0)+(b.sum?110:0), colW=(w-20)/2, rowH=Math.max(70,Math.min(92,Math.floor((y+avail-yy-50-extra)/3)));
  for(const [k,arr,tri] of [[0,b.ta,b.a],[1,b.th,b.h]]){ const xx=x+k*(colW+20); cvTx(c,'TOP '+tri,xx+8,yy+30,{size:22,weight:900,color:tcolor(tri)==='#000000'?'#fff':'#ffffffcc'});
    arr.forEach((p,i)=>{ const Y=yy+46+i*(rowH+8); cvRR(c,xx,Y,colW,rowH,18); c.fillStyle='#ffffff10'; c.fill(); cvTx(c,p.n,xx+20,Y+rowH*.44,{size:26,weight:800,max:colW-140}); cvTx(c,`${p.reb} reb · ${p.ast} pas${p.b?' · '+p.b:''}`,xx+20,Y+rowH*.78,{size:20,weight:600,alpha:.75,max:colW-140}); cvTx(c,p.pts,xx+colW-20,Y+rowH*.66,{size:46,weight:900,align:'right'}); }); }
  yy+=46+3*(rowH+8)+12;
  if(b.st&&yy+200<y+avail){ const [sa,sh]=b.st, pc=(m,a)=>a?Math.round(100*m/a):0, R=[['Adresse',pc(sa.fgm,sa.fga),pc(sh.fgm,sh.fga),1],['3 points',sa.tpm||0,sh.tpm||0],['Rebonds',sa.reb||0,sh.reb||0],['Pertes de balle',sa.to||0,sh.to||0]].filter(r=>r[1]||r[2]); const lh=52, bh=R.length*lh+16; cvRR(c,x,yy,w,bh,22); c.fillStyle='#ffffff10'; c.fill();
    R.forEach(([l,a,v,pcnt],i)=>{ const Y=yy+44+i*lh; cvTx(c,a+(pcnt?' %':''),x+26,Y,{size:28,weight:900}); cvTx(c,l,x+w/2,Y,{size:23,weight:700,align:'center',alpha:.75}); cvTx(c,v+(pcnt?' %':''),x+w-26,Y,{size:28,weight:900,align:'right'}); }); yy+=bh+16; }
  if(b.sum&&yy+60<y+avail){ cvF(c,28,600); const ls=cvWrap(c,b.sum,w-52,2); cvRR(c,x,yy,w,ls.length*40+30,22); c.fillStyle='#ffffff10'; c.fill(); ls.forEach((l,i)=>cvTx(c,l,x+26,yy+48+i*40,{size:28,weight:600})); }
}

/* ---- vue ---- */
function viewStudio(sport){
  const S=stuS(), F=sport==='foot', tpls=F?STU_TPL_F:STU_TPL_N, cur=F?S.tplF:S.tplN;
  const tplH=tpls.map(([k,n,bg])=>`<button class="stu-t ${k===cur?'on':''}" data-act="stutpl" data-k="${k}" style="--bg:${bg}">${esc(n)}</button>`).join('');
  const fmtH=Object.entries(STU_FMT).map(([k,[,,n]])=>`<button class="${S.fmt===k?'':'sec'} fbtn" data-act="stufmt" data-k="${k}">${esc(n)}</button>`).join('');
  let opt='';
  if(F){ const L=stuLeagues(); if(!S.lg||!L.find(([c])=>c===S.lg)) S.lg=L[0][0]; opt=`<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">${L.map(([c,n])=>`<button class="${S.lg===c?'':'sec'} fbtn" data-act="stulg" data-k="${c}">${esc(n)}</button>`).join('')}</div>`;
    if(cur==='pre'){ const PL=stuFootPreList(S.lg); if(PL.length) opt+=`<select id="stuPick" style="margin-top:8px;width:100%"><option value="">Choix auto : l'affiche</option>${PL.slice(0,30).map(m=>`<option value="${esc(m.id)}" ${String(S.pick.pre)===String(m.id)?'selected':''}>${esc(fmtD(m.d))} ${esc(parisT(m.d))} · ${esc(m.hn)} – ${esc(m.an)}</option>`).join('')}</select>`; } }
  else { if(cur==='nstand') opt=`<div class="row" style="gap:6px;margin-top:8px"><button class="${S.conf==='E'?'':'sec'} fbtn" data-act="stuconf" data-k="E">Est</button><button class="${S.conf==='W'?'':'sec'} fbtn" data-act="stuconf" data-k="W">Ouest</button></div>`;
    if(cur==='nbox'){ const N=stuNbaNight(); if(N) opt=`<select id="stuPick" style="margin-top:8px;width:100%"><option value="">Choix auto : le plus serré</option>${N.gs.map(g=>`<option value="${esc(g.id)}" ${S.pick.nbox===g.id?'selected':''}>${esc(g.away.tri)} ${g.away.score} - ${g.home.score} ${esc(g.home.tri)}</option>`).join('')}</select>`; }
    if(cur==='npre'){ const PL=stuNbaPreList(); if(PL.length) opt=`<select id="stuPick" style="margin-top:8px;width:100%"><option value="">Choix auto : l'affiche</option>${PL.map(x=>`<option value="${esc(x.id)}" ${S.pick.npre===x.id?'selected':''}>${esc(fmtD(x.t))} ${esc(parisT(x.t))} · ${esc(x.a)} @ ${esc(x.h)}</option>`).join('')}</select>`; } }
  setTimeout(()=>stuDraw(sport),0);
  return `<div class="card stu"><h2 style="margin:0 0 2px">🎨 Studio</h2><p class="mut" style="margin:0 0 12px">Des images prêtes à poster sur Instagram, TikTok, X ou WhatsApp, en 2 touches.</p>
  <h3>1. Choisis un modèle</h3><div class="stu-tpl">${tplH}</div>
  <h3>2. Format${F?' et championnat':''}</h3><div class="row" style="gap:6px;flex-wrap:wrap">${fmtH}</div>${opt}
  <h3>3. Aperçu</h3><div class="stu-pv"><div class="stu-cvw"><canvas id="stuCv" width="1080" height="1350"></canvas><div class="stu-empty" id="stuEmpty"></div></div>
  <div class="stu-btns"><button data-act="stushare">↗ Partager</button><button class="sec" data-act="stuload">⬇ Télécharger</button>
  <label class="mut" style="font-size:12.5px">Titre (vide = automatique)<input id="stuTitle" placeholder="Titre automatique" autocomplete="off"></label>
  <label class="mut" style="font-size:12.5px">Ton @pseudo<input id="stuHandle" placeholder="@ton pseudo" autocomplete="off" autocapitalize="off" value="${esc((typeof ttk!=='undefined'&&ttk.handle)||'')}"></label></div></div>
  ${stuCarOk(sport)?`<label class="stu-carl"><input type="checkbox" id="stuCarOn" ${S.car?'checked':''}> 🖼️ Carrousel : ajouter une image détaillée par match</label><div id="stuCar"></div>`:''}
  <h3>4. Légende à copier</h3><div class="stu-cap"><div id="stuCap"></div><button class="sec" data-act="stucopy">📋 Copier la légende</button></div>
  <p class="mut" style="font-size:12px;margin:10px 0 0">Les données viennent de ce que Statify a en mémoire : actualise avant de créer une image. Si les logos ne s'affichent pas dans l'image, Statify met des pastilles de couleur à la place.</p></div>`;
}
async function stuDraw(sport){
  const cv=document.getElementById('stuCv'); if(!cv) return; const S=stuS(); S.tok++; const tk=S.tok;
  sport=sport||(ui.sport==='foot'?'foot':'nba'); let D; try{ D=stuData(sport); }catch(e){ D={empty:'Erreur : '+e.message}; }
  S.cur=D; const em=document.getElementById('stuEmpty'), cap=document.getElementById('stuCap'), ti=document.getElementById('stuTitle');
  if(ti&&document.activeElement!==ti) ti.value=S.title[(D.theme||'')+'|'+(D.title||'')]||'';
  if(D.empty){ cv.style.display='none'; if(em){ em.style.display='block'; em.textContent=D.empty; } if(cap) cap.textContent='—'; return; }
  cv.style.display=''; if(em) em.style.display='none'; if(cap) cap.textContent=D.caption||'';
  try{ await stuRender(cv,D,S.fmt); }catch(e){ console.error(e); }
  try{ stuDrawCar(sport); }catch(e){}
  if(tk!==S.tok) return;
}
function stuBlob(){ const cv=document.getElementById('stuCv'), S=stuS(); return new Promise((res,rej)=>{ try{ cv.toBlob(b=>b?res(b):rej(new Error('vide')),'image/png'); }catch(e){ rej(e); } }).catch(async e=>{ if(S.noImg) throw e; S.noImg=true; await stuDraw(); return stuBlob(); }); }
async function stuShare(){ const S=stuS(); try{ const sp=ui.sport==='foot'?'foot':'nba', bl=await stuBlobs(sp), fs=bl.map((b,i)=>new File([b],`statify-${S.cur&&S.cur.theme||'image'}-${i+1}.png`,{type:'image/png'})), f=fs[0], b=bl[0];
    if(navigator.canShare&&navigator.canShare({files:fs})){ try{ await navigator.clipboard.writeText(S.cur&&S.cur.caption||''); }catch(e){} await navigator.share({files:fs}); stuMarkPosted(); say(fs.length>1?`✓ ${fs.length} images partagées. La légende est copiée : colle-la dans ton post.`:'✓ Image partagée. La légende est copiée : colle-la dans ton post.','ok'); }
    else { bl.forEach((x,i)=>setTimeout(()=>stuDl(x),i*400)); } }catch(e){ if(e&&e.name==='AbortError') return; say('⚠️ Partage impossible : '+esc(e.message||e)+'. Utilise « Télécharger ».','err'); } }
function stuDl(b){ const S=stuS(), a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=`statify-${S.cur&&S.cur.theme||'image'}-${Date.now()}.png`; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },4000); try{ stuMarkPosted(); }catch(e){} say('✓ Image téléchargée.','ok'); }
document.addEventListener('click',e=>{ const b=e.target.closest('.stu [data-act]'); if(!b) return; const a=b.dataset.act, S=stuS(), F=ui.sport==='foot'; if(!/^stu/.test(a)) return; e.stopPropagation();
  if(a==='stutpl'){ if(F) S.tplF=b.dataset.k; else S.tplN=b.dataset.k; render(); }
  else if(a==='stufmt'){ S.fmt=b.dataset.k; render(); } else if(a==='stulg'){ S.lg=b.dataset.k; S.pick.pre=''; render(); } else if(a==='stuconf'){ S.conf=b.dataset.k; render(); }
  else if(a==='stushare') stuShare(); else if(a==='stuload') stuBlobs(F?'foot':'nba').then(L=>L.forEach((x,i)=>setTimeout(()=>stuDl(x),i*400))).catch(err=>say('⚠️ '+esc(err.message||err),'err'));
  else if(a==='stucopy'){ const t=S.cur&&S.cur.caption||''; (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>say('✓ Légende copiée.','ok')).catch(()=>{ const ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); say('✓ Légende copiée.','ok'); }catch(x){} ta.remove(); }); } },true);
document.addEventListener('change',e=>{ if(e.target&&e.target.id==='stuCarOn'){ stuS().car=e.target.checked; stuS().tok++; stuDrawCar(ui.sport==='foot'?'foot':'nba'); } });
document.addEventListener('change',e=>{ if(e.target&&e.target.id==='stuPick'){ const S=stuS(), F=ui.sport==='foot', k=F?'pre':S.tplN; S.pick[k]=e.target.value; stuDraw(); } });
document.addEventListener('input',e=>{ const t=e.target; if(!t) return; const S=stuS();
  if(t.id==='stuTitle'&&S.cur){ S.title[(S.cur.theme||'')+'|'+(S.cur.title||'')]=t.value.trim(); stuDraw(); }
  else if(t.id==='stuHandle'){ if(typeof ttk!=='undefined'){ ttk.handle=t.value.trim().replace(/^@/,''); ttkSave(); } stuDraw(); } });

/* ---- Lien direct vers le Studio (#studio=recap&lg=fra.1) depuis les notifications du robot ---- */
var STU_NBA_T=['nres','ntop','nbox','nstand','npre'];
function stuDeepLink(){
  const m=location.hash.match(/^#studio=([a-z]+)(?:&lg=([\w.]+))?/i); if(!m) return; const t=m[1], lg=m[2]||'', S=stuS();
  try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){}
  closeModals();
  if(STU_NBA_T.includes(t)){ setSport('nba'); ui.tab='studio'; S.tplN=t; const N=stuNbaNight(); if(!N||Date.now()-Date.parse(N.gs[0].time)>30*36e5) setTimeout(()=>{ try{ nbaRefresh(); }catch(e){} },300); }
  else { render(); return; }   // Studio Foot retiré
  render(); window.scrollTo(0,0); say('📸 Image prête : vérifie l\'aperçu, puis « ↗ Partager ».','ok');
}
window.addEventListener('hashchange',stuDeepLink); setTimeout(stuDeepLink,600);
/* ---- Carte « 📸 Prêt à poster » sur les accueils ---- */
function stuReady(sport){
  const out=[], now=Date.now(), seen=loadJ('suivi-stu-seen',{});
  if(sport==='foot'){ const {mt}=footIdx(); let live=[]; try{ live=multiSet('all').filter(m=>m.st==='in'); }catch(e){}
    for(const [lg,n] of FLG){ const L=mt.filter(m=>m.lg===lg); if(!L.length) continue;
      if(live.some(m=>m.lg===lg)&&(foot.leagues[lg]||{}).standings&&foot.leagues[lg].standings.length) out.push({k:'table:'+lg+':'+parisDK(new Date().toISOString()),t:'table',lg,lab:`📈 Si ça reste comme ça · ${n}`,sub:'Classement en direct'});
      const d=L.filter(m=>m.done).sort((a,b)=>Date.parse(b.d)-Date.parse(a.d))[0]; if(d&&now-Date.parse(d.d)<20*36e5&&!L.some(m=>m.st==='in'||(!m.done&&Date.parse(m.d)<now))) out.push({k:'recap:'+lg+':'+parisDK(d.d),t:'recap',lg,lab:`⚽ Récap · ${n}`,sub:'Journée terminée'}); } }
  else { const N=stuNbaNight(); if(N&&now-Math.max(...N.gs.map(g=>tms(g)))<20*36e5){ out.push({k:'nres:'+N.day,t:'nres',lab:'🏀 Résultats de la nuit',sub:`${N.gs.length} matchs`},{k:'ntop:'+N.day,t:'ntop',lab:'🔥 Les cartons de la nuit',sub:'Top marqueurs'}); } }
  return out.filter(x=>!seen[x.k]).slice(0,4);
}
function stuReadyCard(sport){ const L=stuReady(sport); if(!L.length) return '';
  return `<div class="card stu-ready"><div class="row between" style="margin-bottom:8px"><b>📸 Prêt à poster</b><span class="mut" style="font-size:12px">ouvre le Studio en 1 touche</span></div><div class="stu-rl">${L.map(x=>`<div class="stu-ri"><button data-act="sturdy" data-t="${esc(x.t)}" data-lg="${esc(x.lg||'')}" data-k="${esc(x.k)}"><b>${esc(x.lab)}</b><span>${esc(x.sub)}</span></button><button class="sec x" data-act="sturdyx" data-k="${esc(x.k)}" title="Masquer">✕</button></div>`).join('')}</div></div>`; }
document.addEventListener('click',e=>{ const b=e.target.closest('[data-act=sturdy],[data-act=sturdyx]'); if(!b) return; e.stopPropagation(); const seen=loadJ('suivi-stu-seen',{}); seen[b.dataset.k]=Date.now(); for(const k in seen) if(Date.now()-seen[k]>5*864e5) delete seen[k]; saveJ('suivi-stu-seen',seen);
  if(b.dataset.act==='sturdyx'){ render(); return; } location.hash='studio='+b.dataset.t+(b.dataset.lg?'&lg='+b.dataset.lg:''); },true);
/* ---- Légendes détaillées ---- */
function stuTags(D){ const m=String(D.caption||'').match(/(#\S+(?:\s+#\S+)*)\s*$/); return m?m[1]:''; }
function stuGoalsTxt(m){ const ev=((m.x&&m.x.ev)||[]).filter(e=>(e.s==='h'||e.s==='a')).sort((a,b)=>a.m-b.m); if(!ev.length) return '';
  const g=sd=>ev.filter(e=>e.s===sd&&(e.t==='g'||e.t==='pg'||e.t==='og')).map(e=>`${e.p||'?'} ${e.ms||e.m+"'"}${e.t==='pg'?' (pen.)':e.t==='og'?' (csc)':''}${e.p2&&e.t==='g'?' (passe '+e.p2+')':''}`);
  const rc=ev.filter(e=>e.t==='rc').map(e=>`🟥 ${e.p||'?'} ${e.ms||e.m+"'"} (${e.s==='h'?m.hn:m.an})`);
  const gh=g('h'), ga=g('a'), L=[]; if(gh.length) L.push(`   ⚽ ${m.hn} : ${gh.join(', ')}`); if(ga.length) L.push(`   ⚽ ${m.an} : ${ga.join(', ')}`); if(rc.length) L.push('   '+rc.join(' · ')); return L.join('\n'); }
function stuForm(t){ return t&&t.log&&t.log.length?t.log.slice(-5).map(x=>x.res==='w'?'V':x.res==='l'?'D':'N').join('-'):''; }
function stuNbaLine(p){ if(!p) return ''; const d=stuDD(p); return `${p.name} ${p.pts} pts, ${p.reb} reb, ${p.ast} pas${p.fga?`, ${p.fgm}/${p.fga} aux tirs`:''}${d==='TD'?' (triple-double)':d==='DD'?' (double-double)':''}`; }
var stuTopP=t=>(t.players||[]).filter(p=>p.min>0).sort((a,b)=>b.pts-a.pts)[0];
function stuCaption(sport,D){
  const S=stuS(), tags=stuTags(D), t=sport==='foot'?S.tplF:S.tplN, out=[];
  if(sport==='foot'&&t==='recap'){ const ms=D.src||[]; out.push(String(D.caption||'').split('\n')[0]);
    for(const m of ms){ const r=resumes[String(m.id)]; out.push(`\n${m.hs>m.as?'✅':m.hs<m.as?'❌':'🤝'} ${m.hn} ${m.hs}-${m.as} ${m.an}`); const g=stuGoalsTxt(m); if(g) out.push(g); if(r&&r.c) out.push(`   📝 ${r.c}`); } }
  else if(sport==='foot'&&t==='table'){ const {live,srt}=D.src||{};
    if(live&&live.length){ out.push(`🔴 EN DIRECT en ${footLgName(S.lg)} !`); for(const m of live) out.push(`⏱ ${m.hn} ${m.hs}-${m.as} ${m.an}${m.txt?' ('+m.txt+')':''}`); out.push('\n📈 Si ça reste comme ça :');
      for(const r of srt.slice(0,8)) out.push(`${r.nr}. ${r.name} · ${r.np} pts${r.rank!==r.nr?` (${r.rank>r.nr?'▲':'▼'}${Math.abs(r.rank-r.nr)})`:''}`); }
    else { out.push(`📊 Le classement de ${footLgName(S.lg)} :`); for(const r of srt.slice(0,10)) out.push(`${r.rank}. ${r.name} · ${r.pts} pts (${r.gd>0?'+':''}${r.gd})`); if(srt.length>12){ out.push('…'); for(const r of srt.slice(-3)) out.push(`${r.rank}. ${r.name} · ${r.pts} pts`); } } }
  else if(sport==='foot'&&t==='pre'){ const m=D.src, p=D.pre, {T}=footIdx(), th=T[m.hid]||{}, ta=T[m.aid]||{};
    out.push(`🔥 ${m.hn} – ${m.an} · ${D.eyebrow}`); if(p.hs||p.as) out.push(`📊 Classement : ${m.hn} ${p.hs||'?'} · ${m.an} ${p.as||'?'}`);
    if(stuForm(th)||stuForm(ta)) out.push(`📈 Forme : ${m.hn} ${stuForm(th)||'–'} · ${m.an} ${stuForm(ta)||'–'}`);
    const [a,d,b]=p.h2; if(a+d+b) out.push(`⚔️ Face à face : ${a} victoire${a>1?'s':''} ${m.hn}, ${d} nul${d>1?'s':''}, ${b} victoire${b>1?'s':''} ${m.an}`);
    const fr=v=>f1(v).replace('.',','); if(th.g&&ta.g) out.push(`⚽ Buts par match : ${m.hn} ${fr(th.gf/th.g)} marqués, ${fr(th.ga/th.g)} encaissés · ${m.an} ${fr(ta.gf/ta.g)} marqués, ${fr(ta.ga/ta.g)} encaissés`);
    if(p.ph||p.pa) out.push(`⭐ À suivre : ${[p.ph&&`${p.ph.n} (${p.ph.g} buts)`,p.pa&&`${p.pa.n} (${p.pa.g} buts)`].filter(Boolean).join(' · ')}`); out.push('\nTon prono ? Donne-moi le score exact 👇'); }
  else if(sport==='foot'&&t==='scor'){ out.push(`🎯 Les meilleurs buteurs de ${footLgName(S.lg)} :`); D.rows.forEach(r=>out.push(`${r.rk}. ${r.n} (${r.sub.split(' · ')[0]}) · ${r.big} but${r.big>1?'s':''}${/passe/.test(r.sub)?', '+r.sub.split(' · ')[1].replace(' déc.',' décisives'):''}`)); }
  else if(t==='nres'){ const gs=D.src||[]; out.push(`🏀 Les résultats de la nuit en NBA (${gs.length} matchs) :`);
    for(const g of gs){ const aw=+g.away.score>+g.home.score, ot=Math.max((g.away.q||[]).length,(g.home.q||[]).length)>4; out.push(`\n${stuNick(g.away.tri)} ${g.away.score}-${g.home.score} ${stuNick(g.home.tri)}${ot?' (prolongation)':''} · victoire ${aw?'des '+stuNick(g.away.tri):'des '+stuNick(g.home.tri)}`);
      const ta=stuTopP(g.away), th=stuTopP(g.home); if(ta) out.push(`   ⭐ ${stuNick(g.away.tri)} : ${stuNbaLine(ta)}`); if(th) out.push(`   ⭐ ${stuNick(g.home.tri)} : ${stuNbaLine(th)}`); } }
  else if(t==='ntop'){ out.push('🔥 Les cartons de la nuit en NBA :'); (D.src||[]).forEach((p,i)=>out.push(`${i+1}. ${stuNbaLine(p)} (${p.tri})`)); }
  else if(t==='nbox'){ const g=D.src, q=(g.away.q||[]).map((v,i)=>`${i<4?'Q'+(i+1):'OT'+(i-3)} ${v}-${(g.home.q||[])[i]??'?'}`).join(' · ');
    out.push(`🏀 ${stuNick(g.away.tri)} ${g.away.score}-${g.home.score} ${stuNick(g.home.tri)}`); if(q) out.push(`🧮 ${q}`);
    const sa=g.away.st||{}, sh=g.home.st||{}, pc=(m,a)=>a?Math.round(100*m/a)+' %':'–';
    if(sa.fga&&sh.fga) out.push(`🎯 Adresse : ${pc(sa.fgm,sa.fga)} vs ${pc(sh.fgm,sh.fga)} · 3 pts : ${sa.tpm}/${sa.tpa} vs ${sh.tpm}/${sh.tpa} · Rebonds : ${sa.reb}-${sh.reb} · Passes : ${sa.ast}-${sh.ast} · Pertes : ${sa.to}-${sh.to}`);
    for(const [tm,nm] of [[g.away,stuNick(g.away.tri)],[g.home,stuNick(g.home.tri)]]){ out.push(`\n${nm} :`); tm.players.filter(p=>p.min>0).sort((a,b)=>b.pts-a.pts).slice(0,3).forEach(p=>out.push(`   ⭐ ${stuNbaLine(p)}`)); } out.push('\nTon MVP du match ? 👇'); }
  else if(t==='nstand'){ out.push(`📊 ${D.title.replace(/ 📊$/,'')} :`); D.rows.forEach(r=>out.push(`${r.rk}. ${r.n} (${r.pts})${r.mv?` ${r.mv>0?'▲':'▼'}${Math.abs(r.mv)}`:''}`)); }
  else if(t==='npre'){ const p=D.pre; out.push(`🔥 ${p.h} @ ${p.a} · ${D.eyebrow.replace(/^NBA · /,'')}`); if(p.hs||p.as) out.push(`📊 Bilans : ${p.h} ${p.hs||'–'} · ${p.a} ${p.as||'–'}`); if(p.fh.length||p.fa.length) out.push(`📈 5 derniers : ${p.h} ${p.fh.join('-')||'–'} · ${p.a} ${p.fa.join('-')||'–'}`);
    const rp=r=>!r?'?':/2e soir/.test(r)?'2e soir de suite':r.replace(/Reposé · (\d+) j/,(_,n)=>n+' jour'+(n>1?'s':'')+' de repos'); if(p.rh||p.ra) out.push(`😴 Repos : ${p.h} ${rp(p.rh)} · ${p.a} ${rp(p.ra)}`); const [a,,b]=p.h2; if(a+b) out.push(`⚔️ Cette saison : ${p.h} ${a} – ${b} ${p.a}`);
    if(p.ph||p.pa) out.push(`⭐ À suivre : ${[p.ph&&`${p.ph.n} (${String(p.ph.g).replace('.',',')} pts/match)`,p.pa&&`${p.pa.n} (${String(p.pa.g).replace('.',',')} pts/match)`].filter(Boolean).join(' · ')}`); out.push('\nTon prono ? 👇'); }
  if(!out.length) return D.caption;
  return out.join('\n')+(tags?'\n\n'+tags:'');
}
/* ---- Carrousel : une image par match ---- */
function stuFootSlide(m,lg){ const r=resumes[String(m.id)], W=m.hs>m.as?m.hn:m.as>m.hs?m.an:'';
  const ev=((m.x&&m.x.ev)||[]).filter(e=>e.s==='h'||e.s==='a').sort((a,b)=>a.m-b.m), ts=m.x&&m.x.ts&&m.x.ts.h&&Object.keys(m.x.ts.h).length?m.x.ts:null;
  let sum=r?(r.c||r.p[0]):''; if(!sum){ try{ const fr=footRecap(m); sum=fr&&fr.paras&&fr.paras[1]?String(fr.paras[1]).replace(/<[^>]+>/g,''):''; }catch(e){} }
  return {theme:'recap',eyebrow:`${footLgName(lg)} · ${fmtD(m.d).replace(/\.$/,'')}`,title:r&&r.t?r.t:W?`${W} s'impose`:'Match nul',cta:'Ton homme du match ? 👇',
    match:{h:m.hn,a:m.an,hs:m.hs,as:m.as,hl:m.hl,al:m.al,hc:fcol(m.hc),ac:fcol(m.ac),ev,ts,sum}}; }
function stuNbaSlide(g){ const D=stuNbaBox(g.id); const ta=stuTopP(g.away), th=stuTopP(g.home), aw=+g.away.score>+g.home.score, w=aw?ta:th;
  D.box.st=[g.away.st||{},g.home.st||{}]; D.box.sum=w?`${w.name} porte les ${stuNick(aw?g.away.tri:g.home.tri)} : ${w.pts} pts, ${w.reb} reb, ${w.ast} pas.`:''; return D; }
function stuSlides(sport){ const S=stuS(), D=S.cur; if(!D||D.empty) return []; const L=[D];
  if(sport==='foot'&&S.tplF==='recap') for(const m of (D.src||[]).slice(0,10)) L.push(stuFootSlide(m,S.lg));
  if(sport!=='foot'&&S.tplN==='nres') for(const g of (D.src||[]).slice(0,10)) L.push(stuNbaSlide(g));
  return L; }
function stuMatch(c,m,x,y,w,avail){
  const L=150, cx1=x+w*.18, cx2=x+w*.82;
  cvLogo(c,m.hl,cx1-L/2,y,L,stuIni(m.h),m.hc,'#fff'); cvLogo(c,m.al,cx2-L/2,y,L,stuIni(m.a),m.ac,'#fff');
  cvTx(c,m.h,cx1,y+L+46,{size:32,weight:900,align:'center',max:w*.34}); cvTx(c,m.a,cx2,y+L+46,{size:32,weight:900,align:'center',max:w*.34});
  cvTx(c,`${m.hs} - ${m.as}`,x+w/2,y+L/2+34,{size:100,weight:900,align:'center'}); cvTx(c,'Terminé',x+w/2,y+L/2+86,{size:26,weight:700,align:'center',alpha:.75});
  let yy=y+L+84; const end=y+avail;
  const goals=sd=>m.ev.filter(e=>e.s===sd).map(e=>`${e.t==='rc'?'🟥':'⚽'} ${e.p||'?'} ${e.ms||e.m+"'"}${e.t==='pg'?' (pen.)':e.t==='og'?' (csc)':''}`);
  const gh=goals('h'), ga=goals('a'), n=Math.max(gh.length,ga.length);
  if(n){ const lh=44, bh=n*lh+30; cvRR(c,x,yy,w,bh,22); c.fillStyle='#ffffff10'; c.fill();
    gh.forEach((t,i)=>cvTx(c,t,x+26,yy+52+i*lh,{size:28,weight:700,max:w/2-40})); ga.forEach((t,i)=>cvTx(c,t,x+w-26,yy+52+i*lh,{size:28,weight:700,align:'right',max:w/2-40})); yy+=bh+20; }
  if(m.ts&&yy+120<end){ const SN=[['poss','Possession',1],['sh','Tirs'],['sot','Tirs cadrés'],['cor','Corners']].filter(([k])=>m.ts.h[k]!=null&&m.ts.a[k]!=null), lh=70, bh=SN.length*lh+20;
    if(SN.length&&yy+bh<end-60){ cvRR(c,x,yy,w,bh,22); c.fillStyle='#ffffff10'; c.fill();
      SN.forEach(([k,l,pc],i)=>{ const a=+m.ts.h[k]||0, b=+m.ts.a[k]||0, t=a+b||1, Y=yy+22+i*lh; cvTx(c,`${a}${pc?' %':''}`,x+26,Y+30,{size:30,weight:900}); cvTx(c,l,x+w/2,Y+28,{size:24,weight:700,align:'center',alpha:.75}); cvTx(c,`${b}${pc?' %':''}`,x+w-26,Y+30,{size:30,weight:900,align:'right'});
        const bw=w-52; c.fillStyle=m.hc; cvRR(c,x+26,Y+44,bw*a/t-3,12,6); c.fill(); c.fillStyle=m.ac; cvRR(c,x+26+bw*a/t+3,Y+44,bw*b/t-3,12,6); c.fill(); }); yy+=bh+20; } }
  if(m.sum&&yy+100<end){ cvF(c,30,600); const lines=cvWrap(c,m.sum,w-52,Math.max(1,Math.floor((end-yy-30)/42))); const bh=lines.length*42+36; cvRR(c,x,yy,w,bh,22); c.fillStyle='#ffffff10'; c.fill(); lines.forEach((l,i)=>cvTx(c,l,x+26,yy+52+i*42,{size:30,weight:600})); }
}
async function stuDrawCar(sport){ const box=document.getElementById('stuCar'); if(!box) return; const S=stuS();
  if(!S.car||!stuCarOk(sport)){ box.innerHTML=''; return; } const L=stuSlides(sport); if(L.length<2){ box.innerHTML='<span class="mut">Pas de détail de match pour faire un carrousel.</span>'; return; }
  const tk=S.tok; box.innerHTML=`<div class="mut" style="font-size:12.5px;margin-bottom:6px">🖼️ Carrousel : ${L.length} images (couverture + 1 par match)</div><div class="stu-thumbs">${L.map((_,i)=>`<canvas data-i="${i}"></canvas>`).join('')}</div>`;
  for(let i=0;i<L.length;i++){ if(tk!==S.tok) return; const big=document.createElement('canvas'); await stuRender(big,L[i],S.fmt); const th=box.querySelector(`canvas[data-i="${i}"]`); if(!th) return; th.width=216; th.height=Math.round(216*big.height/big.width); th.getContext('2d').drawImage(big,0,0,th.width,th.height); } }
var stuCarOk=sport=>sport==='foot'?stuS().tplF==='recap':stuS().tplN==='nres';
async function stuBlobs(sport){ const S=stuS(), L=S.car&&stuCarOk(sport)?stuSlides(sport):[S.cur], out=[];
  for(let i=0;i<L.length;i++){ const cv=document.createElement('canvas'); await stuRender(cv,L[i],S.fmt); try{ out.push(await new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error('vide')),'image/png'))); }catch(e){ if(S.noImg) throw e; S.noImg=true; return stuBlobs(sport); } }
  return out; }

/* ================= STUDIO v2 : gros matchs, nouveaux modèles, thèmes, vidéo ================= */
var STU_TPL_F=[['recap','Récap de la journée','#0b1b30'],['fprog','Programme du week-end','#0a2a66'],['table','Si ça reste comme ça / Classement','#2a1220'],['pre','Avant le match','#0a2a66'],['fpoll','Sondage : qui gagne ?','#3a2a08'],['fweek','Le joueur du week-end','#1f2a12'],['fteam','L\'équipe type','#0f3a1f'],['fnum','Les chiffres de la journée','#2a1608'],['scor','Les buteurs','#1f2a12'],['fduel','Duel de joueurs','#2a1220'],['fclub','Mon club','#0a2a66']];
var STU_TPL_N=[['nres','Résultats de la nuit','#140e1f'],['nperf','La perf de la nuit','#2a1608'],['ntop','Les cartons de la nuit','#2a1608'],['nbox','Box score d\'un match','#0b1b30'],['nprog','Programme de la nuit','#0a2a66'],['npre','Avant-match NBA','#2a1220'],['npoll','Sondage : qui gagne ?','#3a2a08'],['nstand','Classement Est / Ouest','#0a2a66'],['nduel','Duel de joueurs','#2a1220'],['nclub','Mon équipe','#0a2a66']];
var STU_CLASSICS=[['paris|psg','marseille'],['lyon','etienne'],['marseille','lyon'],['lens','lille'],['nice','monaco'],['paris|psg','lyon'],['real madrid','barcelon'],['atletico|atlético','real madrid'],['inter','milan'],['juventus','inter'],['juventus','milan'],['roma','lazio'],['liverpool','everton'],['manchester united|man united','manchester city|man city'],['arsenal','tottenham'],['liverpool','manchester united|man united'],['liverpool','manchester city|man city'],['arsenal','chelsea'],['bayern','dortmund'],['benfica','porto'],['ajax','feyenoord'],['celtic','rangers'],['sevilla|séville','betis']];
var STU_NRIV=[['LAL','BOS'],['LAL','GSW'],['BOS','NYK'],['LAL','LAC'],['BOS','PHI'],['MIA','NYK'],['CHI','DET'],['DAL','SAS'],['MIA','BOS'],['OKC','DEN'],['DEN','LAL']];
function stuN(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }
function stuClassic(a,b){ const m=(n,p)=>p.split('|').some(q=>stuN(n).includes(stuN(q))); return STU_CLASSICS.some(([x,y])=>(m(a,x)&&m(b,y))||(m(a,y)&&m(b,x))); }
function stuFootBig(m){ try{ if(stuClassic(m.hn,m.an)) return 'Classique'; const {T}=footIdx(), rh=T[m.hid]&&T[m.hid].st&&T[m.hid].st.rank, ra=T[m.aid]&&T[m.aid].st&&T[m.aid].st.rank, n=((foot.leagues[m.lg]||{}).standings||[]).length||20, lim=Math.max(4,Math.round(n*.3));
  if(rh&&ra&&rh<=lim&&ra<=lim) return 'Choc au sommet'; if(rh&&ra&&rh>=n-3&&ra>=n-3) return 'Duel pour le maintien'; }catch(e){} return ''; }
var stuNbaS=null, stuNbaSt=0;
function stuNbaStats(){ if(!stuNbaS||Date.now()-stuNbaSt>5000){ stuNbaS=buildStats(); stuNbaSt=Date.now(); } return stuNbaS; }
function stuNbaBig(a,h){ if(STU_NRIV.some(([x,y])=>(x===a&&y===h)||(x===h&&y===a))) return 'Rivalité'; const S=stuNbaStats(), wp=t=>{ const x=S.T[t]; return x&&x.g>=5?x.w/x.g:0; }; return wp(a)>=.6&&wp(h)>=.6?'Choc':''; }
function stuPick(k){ return stuS().pick[k]; }
var stuParisDay=t=>{ try{ return new Date(t).toLocaleDateString('fr-FR',{...PARIS,weekday:'long',day:'numeric',month:'long'}); }catch(e){ return ''; } };

/* ---- Programme ---- */
function stuFootProg(lg){
  const {mt}=footIdx(), now=Date.now(), all=lg==='all';
  const L=mt.filter(m=>(all?STU_LGOK(m.lg):m.lg===lg)&&!m.done&&m.st!=='in'&&Date.parse(m.d)>now-36e5&&Date.parse(m.d)<now+4.5*864e5).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d));
  if(!L.length) return {empty:'Aucun match à venir dans les 4 prochains jours pour ce choix. Actualise le foot.'};
  const big=L.map(m=>({m,b:stuFootBig(m)})).filter(x=>x.b).slice(0,2);
  const rows=[]; let day='';
  for(const m of L){ const d=stuParisDay(m.d); if(d!==day){ rows.push({k:'day',t:d}); day=d; } rows.push({k:'prog',t:parisT(m.d),h:m.hn,a:m.an,hl:m.hl,al:m.al,hc:fcol(m.hc),ac:fcol(m.ac),big:stuFootBig(m),lg:all?footLgName(m.lg):''}); }
  const lgn=all?'Foot':footLgName(lg);
  return {theme:'pre',eyebrow:`${lgn} · ${L.length} matchs`,title:'Le programme du week-end ⚽',cta:'Quel match tu regardes ? 👇',prog:{big:big.map(({m,b})=>({h:m.hn,a:m.an,hl:m.hl,al:m.al,hc:fcol(m.hc),ac:fcol(m.ac),b,t:`${stuParisDay(m.d).split(' ')[0]} ${parisT(m.d)}`})),rows},src:{L,big},
    caption:`📅 Le programme ${all?'foot':'de '+lgn} : ${L.length} matchs à suivre !${big.length?`\n🔥 À ne pas rater : ${big.map(x=>`${x.m.hn} – ${x.m.an} (${x.b.toLowerCase()})`).join(', ')}`:''}\n\n${L.map(m=>`${stuFootBig(m)?'🔥':'⚽'} ${stuParisDay(m.d).split(' ')[0]} ${parisT(m.d)} · ${m.hn} – ${m.an}`).join('\n')}\n\nQuel match tu regardes ? 👇\n\n${all?'#football #foot':(STU_HT[lg]||stuTag(lgn))} #programme #football`};
}
var STU_LGOK=lg=>!!foot.leagues[lg];
function stuNbaProg(){
  const L=stuNbaPreList().filter(x=>Date.parse(x.t)<Date.now()+30*36e5); if(!L.length) return {empty:'Aucun match NBA dans les prochaines 30 h. Charge le calendrier.'};
  const S=stuNbaStats(), rec=t=>{ const x=S.T[t]; return x?`${x.w}-${x.l}`:''; };
  const rows=L.map(x=>({k:'prog',t:parisT(x.t),h:stuNick(x.a),a:stuNick(x.h),htri:x.a,atri:x.h,hc:tcolor(x.a),ac:tcolor(x.h),big:stuNbaBig(x.a,x.h),sub:[rec(x.a),rec(x.h)]}));
  const big=L.filter(x=>stuNbaBig(x.a,x.h)).slice(0,2).map(x=>({h:stuNick(x.a),a:stuNick(x.h),htri:x.a,atri:x.h,hc:tcolor(x.a),ac:tcolor(x.h),b:stuNbaBig(x.a,x.h),t:parisT(x.t)}));
  return {theme:'npre',eyebrow:`NBA · ${stuParisDay(L[0].t)} · heure de Paris`,title:'Le programme de la nuit 🏀',cta:'Tu veilles pour quel match ? 👇',prog:{big,rows},
    caption:`🏀 Le programme NBA de la nuit : ${L.length} matchs (heure de Paris)${big.length?`\n🔥 L'affiche : ${big.map(b=>`${b.h} @ ${b.a}`).join(', ')}`:''}\n\n${rows.map(r=>`${r.big?'🔥':'🏀'} ${r.t} · ${r.h} @ ${r.a}${r.sub[0]?` (${r.sub[0]} / ${r.sub[1]})`:''}`).join('\n')}\n\nTu veilles pour quel match ? 👇\n\n#NBA #NBAFrance #basket`};
}
/* ---- Sondage ---- */
function stuFootPoll(lg){ const D=stuFootPre(lg,stuPick('fpoll')); if(D.empty) return D; const m=D.src, b=stuFootBig(m);
  return {theme:'pre',eyebrow:D.eyebrow,title:'Qui va gagner ? 🗳️',cta:'Vote en commentaire 👇',clubCol:[D.pre.hc,D.pre.ac],poll:{h:m.hn,a:m.an,hl:m.hl,al:m.al,hc:D.pre.hc,ac:D.pre.ac,b,draw:true,sub:[D.pre.hs,D.pre.as]},src:m,
    caption:`🗳️ ${m.hn} – ${m.an} : qui va gagner ?${b?' 🔥 '+b+' !':''}\n\nÉcris en commentaire :\n1️⃣ = ${m.hn}\n❌ = match nul\n2️⃣ = ${m.an}\n\nBonus : donne le score exact 👇\n\n${STU_HT[lg]||stuTag(footLgName(lg))} ${stuTag(m.hn)} ${stuTag(m.an)} #prono #football`}; }
function stuNbaPoll(){ const D=stuNbaPre(stuPick('npoll')); if(D.empty) return D; const x=D.src, p=D.pre, b=stuNbaBig(x.a,x.h);
  return {theme:'npre',eyebrow:D.eyebrow,title:'Qui va gagner ? 🗳️',cta:'Vote en commentaire 👇',clubCol:[p.hc,p.ac],poll:{h:p.h,a:p.a,htri:p.htri,atri:p.atri,hc:p.hc,ac:p.ac,b,draw:false,sub:[p.hs,p.as]},src:x,
    caption:`🗳️ ${p.h} @ ${p.a} cette nuit : qui gagne ?${b?' 🔥 '+b+' !':''}\n\nÉcris en commentaire :\n1️⃣ = ${p.h}\n2️⃣ = ${p.a}\n\nBonus : l'écart de points 👇\n\n#NBA #NBAFrance ${stuTag(p.h)} ${stuTag(p.a)}`}; }
/* ---- Perf de la nuit (NBA) ---- */
function stuNbaPerf(){
  const N=stuNbaNight(); if(!N) return {empty:'Aucun match NBA terminé en mémoire. Actualise la NBA.'};
  const L=[]; for(const g of N.gs) for(const [me,op] of [[g.away,g.home],[g.home,g.away]]) for(const p of me.players) if(p.min>0) L.push({p,me,op,g,gs:gameScore(p)});
  L.sort((a,b)=>b.gs-a.gs); const id=stuPick('nperf'), x=L.find(y=>String(y.p.id)===String(id))||L[0]; if(!x) return {empty:'Pas de stats joueurs pour cette nuit.'};
  const S=stuNbaStats(), sp=S.P[x.p.id], avg=sp&&sp.gp>1?(sp.pts-x.p.pts)/(sp.gp-1):null, won=+x.me.score>+x.op.score, p=x.p;
  const diff=avg!=null?p.pts-avg:null, d=stuDD(p);
  return {theme:'nba',eyebrow:`NBA · Nuit du ${stuNbaDate(N.day)}`,title:'La perf de la nuit 🔥',cta:'Il mérite le MVP ? 👇',clubCol:[tcolor(p.tri),'#140e1f'],list:L.slice(0,25),
    hero:{n:p.name,ini:initials(p.name),col:tcolor(p.tri),tri:p.tri,sub:`Les ${stuNick(x.me.tri)} ${won?'gagnent':'perdent'} ${x.me.score}-${x.op.score} contre les ${stuNick(x.op.tri)}`,big:p.pts,unit:'POINTS',badge:d,
      grid:[['Rebonds',p.reb],['Passes',p.ast],['Interceptions',p.stl],['Contres',p.blk],['Tirs',`${p.fgm}/${p.fga}`],['3 points',`${p.tpm}/${p.tpa}`]],
      note:diff!=null&&Math.abs(diff)>=3?`${diff>0?'+':''}${f1(diff).replace('.',',')} pts par rapport à sa moyenne (${f1(avg).replace('.',',')})`:p.fga?`${Math.round(100*p.fgm/p.fga)} % de réussite au tir`:''},
    caption:`🔥 La perf de la nuit : ${p.name} !\n\n${p.pts} points, ${p.reb} rebonds, ${p.ast} passes${p.stl?`, ${p.stl} interceptions`:''}${p.blk?`, ${p.blk} contres`:''}${d==='TD'?' : TRIPLE-DOUBLE 🤯':d==='DD'?' (double-double)':''}\n🎯 ${p.fgm}/${p.fga} aux tirs, ${p.tpm}/${p.tpa} à 3 points\n🏀 ${stuNick(x.me.tri)} ${x.me.score}-${x.op.score} ${stuNick(x.op.tri)}${diff!=null&&Math.abs(diff)>=3?`\n📈 ${diff>0?'+':''}${f1(diff).replace('.',',')} pts par rapport à sa moyenne`:''}\n\nIl mérite le MVP ? 👇\n\n#NBA #NBAFrance ${stuTag(stuNick(p.tri))} ${stuTag(p.name)}`};
}
/* ---- Foot : matchs de la journée et joueurs ---- */
function stuFootDay(lg){ const {mt}=footIdx(), done=mt.filter(m=>m.done&&m.lg===lg).sort((a,b)=>Date.parse(b.d)-Date.parse(a.d)); if(!done.length) return []; const last=Date.parse(done[0].d); return done.filter(m=>last-Date.parse(m.d)<3.5*864e5); }
function stuFootPlayers(ms){ const out=[];
  for(const m of ms) for(const sd of ['h','a']){ const pl=(m.x&&m.x.pl&&m.x.pl[sd])||[], gf=sd==='h'?m.hs:m.as, ga=sd==='h'?m.as:m.hs, tm=sd==='h'?m.hn:m.an, col=fcol(sd==='h'?m.hc:m.ac), lo=sd==='h'?m.hl:m.al;
    for(const p of pl){ const pg=posGroup(p.pos); let sc=p.g*3+p.a*2+p.sot*.5+(p.sh-p.sot)*.15+(gf>ga?1:gf===ga?.3:0)-p.rc*2-p.yc*.3; if(pg==='G') sc+=p.sv*.6+(ga===0?2.5:0); if(pg==='D'&&ga===0) sc+=1.5; if(!p.s) sc*=.85;
      out.push({p,pg,sc,tm,col,lo,m,gf,ga,note:Math.max(4,Math.min(10,5.5+sc*.45))}); } }
  return out.sort((a,b)=>b.sc-a.sc); }
function stuFootWeek(lg){ const ms=stuFootDay(lg), L=stuFootPlayers(ms); if(!L.length) return {empty:'Pas de détails de joueurs pour cette journée (ESPN ne les fournit pas toujours). Actualise le foot.'};
  const id=stuPick('fweek'), x=L.find(y=>String(y.p.id)===String(id))||L[0], p=x.p, G=x.pg==='G';
  return {theme:'scor',eyebrow:`${footLgName(lg)} · ${fmtD(x.m.d).replace(/\.$/,'')}`,title:'Le joueur du week-end ⭐',cta:'Tu valides ? 👇',clubCol:[x.col,'#0b1b30'],list:L.slice(0,25),
    hero:{n:p.n,ini:initials(p.n),col:x.col,lo:x.lo,sub:`${x.tm} · ${x.m.hn} ${x.m.hs}-${x.m.as} ${x.m.an}`,big:G?p.sv:p.g,unit:G?'ARRÊTS':p.g>1?'BUTS':'BUT',
      grid:G?[['Arrêts',p.sv],['Buts encaissés',x.ga],['Clean sheet',x.ga===0?'Oui':'Non'],['Note',f1(x.note).replace('.',',')]]:[['Buts',p.g],['Passes déc.',p.a],['Tirs',p.sh],['Cadrés',p.sot],['Cartons',p.yc+p.rc?`${p.yc?'🟨':''}${p.rc?'🟥':''}`:'0'],['Note',f1(x.note).replace('.',',')+'/10']],note:''},
    caption:`⭐ Le joueur du week-end en ${footLgName(lg)} : ${p.n} (${x.tm}) !\n\n${G?`🧤 ${p.sv} arrêts${x.ga===0?', clean sheet':''}`:`⚽ ${p.g} but${p.g>1?'s':''}${p.a?`, 🅰️ ${p.a} passe${p.a>1?'s':''} décisive${p.a>1?'s':''}`:''}, ${p.sh} tirs dont ${p.sot} cadrés`}\n🏟️ ${x.m.hn} ${x.m.hs}-${x.m.as} ${x.m.an}\n📊 Note Statify : ${f1(x.note).replace('.',',')}/10\n\nTu valides ? 👇\n\n${STU_HT[lg]||stuTag(footLgName(lg))} ${stuTag(x.tm)} #football`};
}
function stuFootTeam(lg){ const ms=stuFootDay(lg), L=stuFootPlayers(ms).filter(x=>x.p.s||x.sc>3); if(L.length<11) return {empty:'Pas assez de détails de joueurs pour composer une équipe type. Actualise le foot.'};
  const used=new Set(), pick=(g,n)=>{ const r=[]; for(const x of L) if(r.length<n&&x.pg===g&&!used.has(x.p.id)){ r.push(x); used.add(x.p.id); } return r; };
  const XI={G:pick('G',1),D:pick('D',4),M:pick('M',3),F:pick('F',3)}; for(const g of ['G','D','M','F']){ const need={G:1,D:4,M:3,F:3}[g]; for(const x of L){ if(XI[g].length>=need) break; if(!used.has(x.p.id)&&!(g==='G')){ XI[g].push(x); used.add(x.p.id); } } }
  const all=[...XI.F,...XI.M,...XI.D,...XI.G];
  return {theme:'recap',eyebrow:`${footLgName(lg)} · d'après les stats`,title:'L\'équipe type de la journée 🏆',cta:'Qui manque ? 👇',team:XI,
    caption:`🏆 L'équipe type de la journée en ${footLgName(lg)} (4-3-3, d'après les stats) :\n\n🧤 ${XI.G.map(x=>x.p.n).join(', ')||'—'}\n🛡️ ${XI.D.map(x=>`${x.p.n} (${x.tm})`).join(', ')}\n⚙️ ${XI.M.map(x=>`${x.p.n} (${x.tm})`).join(', ')}\n🔥 ${XI.F.map(x=>`${x.p.n} (${x.tm})${x.p.g?' '+'⚽'.repeat(Math.min(3,x.p.g)):''}`).join(', ')}\n\nQui manque selon toi ? 👇\n\n${STU_HT[lg]||stuTag(footLgName(lg))} #equipetype #football ${[...new Set(all.map(x=>stuTag(x.tm)))].slice(0,4).join(' ')}`};
}
function stuFootNums(lg){ const ms=stuFootDay(lg); if(!ms.length) return {empty:'Aucun match terminé en mémoire pour ce championnat.'};
  let goals=0, fast=null, late=null, rc=0, poss=null, shots=null, braces=0; const sc={};
  for(const m of ms){ goals+=m.hs+m.as; const ev=((m.x&&m.x.ev)||[]);
    for(const e of ev){ if(e.t==='g'||e.t==='pg'||e.t==='og'){ if(!fast||e.m<fast.e.m) fast={e,m}; if(!late||e.m>late.e.m) late={e,m}; if(e.p&&e.t!=='og'){ const k=e.p+'|'+m.id; sc[k]=(sc[k]||0)+1; } } if(e.t==='rc') rc++; }
    const ts=m.x&&m.x.ts; if(ts&&ts.h) for(const [sd,tm] of [['h',m.hn],['a',m.an]]){ const t=ts[sd]||{}; if(t.poss!=null&&(!poss||t.poss>poss.v)) poss={v:t.poss,tm,m}; if(t.sh!=null&&(!shots||t.sh>shots.v)) shots={v:t.sh,tm}; } }
  for(const k in sc) if(sc[k]>=2) braces++;
  const big=[...ms].sort((a,b)=>Math.abs(b.hs-b.as)-Math.abs(a.hs-a.as))[0], R=[];
  R.push({big:String(goals),s:`buts en ${ms.length} matchs`}); R.push({big:f1(goals/ms.length).replace('.',','),s:'buts par match'});
  if(fast) R.push({big:fast.e.ms||fast.e.m+"'",s:`but le plus rapide : ${fast.e.p||'?'}`}); if(late&&late.e.m>=80) R.push({big:late.e.ms||late.e.m+"'",s:`but le plus tardif : ${late.e.p||'?'}`});
  if(big&&big.hs!==big.as) R.push({big:`${Math.max(big.hs,big.as)}-${Math.min(big.hs,big.as)}`,s:`plus large victoire : ${big.hs>big.as?big.hn:big.an}`});
  if(poss) R.push({big:Math.round(poss.v)+' %',s:`plus grosse possession : ${poss.tm}`}); if(shots) R.push({big:String(shots.v),s:`tirs : ${shots.tm}, l'équipe la plus dangereuse`});
  R.push({big:String(rc),s:`carton${rc>1?'s':''} rouge${rc>1?'s':''}`}); if(braces) R.push({big:String(braces),s:`doublé${braces>1?'s':''} ou plus`});
  return {theme:'nba',eyebrow:`${footLgName(lg)} · ${fmtD(ms[0].d).replace(/\.$/,'')} – ${fmtD(ms[ms.length-1].d).replace(/\.$/,'')}`,title:'Les chiffres de la journée 🔢',cta:'Quel chiffre te surprend ? 👇',nums:R.slice(0,8),
    caption:`🔢 Les chiffres de la journée en ${footLgName(lg)} :\n\n${R.map(r=>`▪️ ${r.big} ${r.s}`).join('\n')}\n\nQuel chiffre te surprend le plus ? 👇\n\n${STU_HT[lg]||stuTag(footLgName(lg))} #stats #football`};
}
/* ---- Duel ---- */
function stuFootDuelList(lg){ const {P}=footIdx(); return Object.values(P).filter(p=>(p.comps||{})[lg]&&p.gp>0).sort((a,b)=>(b.g*2+b.a)-(a.g*2+a.a)||b.sot-a.sot).slice(0,60); }
function stuNbaDuelList(){ const S=stuNbaStats(); return Object.values(S.P).filter(p=>p.gp>0).sort((a,b)=>b.pts/b.gp-a.pts/a.gp).slice(0,80); }
function stuFootDuel(lg){ const L=stuFootDuelList(lg); if(L.length<2) return {empty:'Pas assez de joueurs en mémoire. Charge « Depuis le début de saison ».'};
  const a=L.find(p=>String(p.id)===String(stuPick('fduelA')))||L[0], b=L.find(p=>String(p.id)===String(stuPick('fduelB'))&&p!==a)||L.find(p=>p!==a);
  const st=[['Buts',p=>p.g],['Passes déc.',p=>p.a],['Tirs',p=>p.sh],['Tirs cadrés',p=>p.sot],['Matchs',p=>p.gp],['Buts / match',p=>+(p.g/p.gp).toFixed(2)]];
  return {theme:'pre',eyebrow:`${footLgName(lg)} · matchs chargés`,title:'Le duel ⚔️',cta:'Tu choisis qui ? 👇',clubCol:[fcol(a.tco),fcol(b.tco)],list:L,
    duel:{a:{n:a.n,ini:initials(a.n),col:fcol(a.tco),lo:a.tlo,sub:a.tn},b:{n:b.n,ini:initials(b.n),col:fcol(b.tco),lo:b.tlo,sub:b.tn},rows:st.map(([l,f])=>[l,f(a),f(b)])},
    caption:`⚔️ ${a.n} ou ${b.n} ?\n\n${st.map(([l,f])=>`${l} : ${String(f(a)).replace('.',',')} – ${String(f(b)).replace('.',',')}`).join('\n')}\n\nTu choisis qui ? 👇\n\n${STU_HT[lg]||stuTag(footLgName(lg))} ${stuTag(a.n)} ${stuTag(b.n)} #football`}; }
function stuNbaDuel(){ const L=stuNbaDuelList(); if(L.length<2) return {empty:'Pas assez de joueurs NBA en mémoire.'};
  const a=L.find(p=>String(p.id)===String(stuPick('nduelA')))||L[0], b=L.find(p=>String(p.id)===String(stuPick('nduelB'))&&p!==a)||L.find(p=>p!==a), av=(p,k)=>+(p[k]/p.gp).toFixed(1), pc=(m,x)=>x?Math.round(100*m/x):0;
  const st=[['Points',p=>av(p,'pts')],['Rebonds',p=>av(p,'reb')],['Passes',p=>av(p,'ast')],['Interceptions',p=>av(p,'stl')],['Contres',p=>av(p,'blk')],['Adresse %',p=>pc(p.fgm,p.fga)],['3 points %',p=>pc(p.tpm,p.tpa)]];
  return {theme:'nba',eyebrow:'NBA · moyennes par match',title:'Le duel ⚔️',cta:'Tu choisis qui ? 👇',clubCol:[tcolor(a.tri),tcolor(b.tri)],list:L,
    duel:{a:{n:a.name,ini:initials(a.name),col:tcolor(a.tri),sub:stuNick(a.tri)},b:{n:b.name,ini:initials(b.name),col:tcolor(b.tri),sub:stuNick(b.tri)},rows:st.map(([l,f])=>[l,f(a),f(b)])},
    caption:`⚔️ ${a.name} ou ${b.name} ?\n\n${st.map(([l,f])=>`${l} : ${String(f(a)).replace('.',',')} – ${String(f(b)).replace('.',',')}`).join('\n')}\n\nTu choisis qui ? 👇\n\n#NBA #NBAFrance ${stuTag(a.name)} ${stuTag(b.name)}`}; }
/* ---- Mon club ---- */
function stuFootClubList(lg){ const st=((foot.leagues[lg]||{}).standings)||[]; const fav=[...new Set([...ffav,...((nfav&&nfav.foot)||[])])]; return [...st.filter(r=>fav.includes(r.id)),...st.filter(r=>!fav.includes(r.id))]; }
function stuFootClub(lg){ const L=stuFootClubList(lg); if(!L.length) return {empty:'Pas de classement chargé pour ce championnat. Actualise le foot.'};
  const r=L.find(x=>String(x.id)===String(stuPick('fclub')))||L[0], {mt,T}=footIdx(), t=T[r.id]||{}, col=fcol(t.co);
  const last=mt.filter(m=>m.done&&(m.hid===r.id||m.aid===r.id)).sort((a,b)=>Date.parse(b.d)-Date.parse(a.d))[0], next=mt.filter(m=>!m.done&&(m.hid===r.id||m.aid===r.id)&&Date.parse(m.d)>Date.now()-2*36e5).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d))[0];
  const lr=last?(()=>{ const home=last.hid===r.id, gf=home?last.hs:last.as, ga=home?last.as:last.hs; return {res:gf>ga?'Victoire':gf<ga?'Défaite':'Nul',sc:`${last.hn} ${last.hs}-${last.as} ${last.an}`,goals:((last.x&&last.x.ev)||[]).filter(e=>(e.t==='g'||e.t==='pg')&&e.s===(home?'h':'a')).map(e=>`${e.p} ${e.ms||e.m+"'"}`).join(', '),col:gf>ga?'#2fc15a':gf<ga?'#ff3b4a':'#8a9ab0'}; })():null;
  const form=t.log?t.log.slice(-5).map(x=>x.res==='w'?'V':x.res==='l'?'D':'N'):[];
  return {theme:'pre',eyebrow:`${footLgName(lg)} · ${new Date().toLocaleDateString('fr-FR',{...PARIS,day:'numeric',month:'long'})}`,title:r.name,cta:`Allez ${r.name} ! 👇`,clubCol:[col,'#0b1b30'],list:L,
    club:{n:r.name,lo:r.logo,col,ini:stuIni(r.name),rank:r.rank,pts:r.pts,rec:`${r.w}V ${r.d}N ${r.l}D · ${r.gf}-${r.ga}`,form,last:lr,next:next?{t:`${stuParisDay(next.d)} · ${parisT(next.d)}`,o:next.hid===r.id?next.an:next.hn,home:next.hid===r.id,ol:next.hid===r.id?next.al:next.hl,oc:fcol(next.hid===r.id?next.ac:next.hc)}:null},
    caption:`💙 ${r.name} : ${stuOrd(r.rank)} de ${footLgName(lg)} avec ${r.pts} points (${r.w}V ${r.d}N ${r.l}D)\n${form.length?`📈 Forme : ${form.join('-')}\n`:''}${lr?`⏮️ Dernier match : ${lr.res.toLowerCase()} ${lr.sc}${lr.goals?` (${lr.goals})`:''}\n`:''}${next?`⏭️ Prochain : ${next.hid===r.id?'contre':'à'} ${next.hid===r.id?next.an:next.hn}, ${stuParisDay(next.d)} à ${parisT(next.d)}\n`:''}\nAllez ${r.name} ! 👇\n\n${STU_HT[lg]||stuTag(footLgName(lg))} ${stuTag(r.name)} #football`}; }
function stuNbaClubList(){ const S=stuNbaStats(), fv=fav.teams||[]; const L=Object.values(S.T).sort(standCmp); return [...L.filter(t=>fv.includes(t.tri)),...L.filter(t=>!fv.includes(t.tri))]; }
function stuNbaClub(){ const L=stuNbaClubList(); if(!L.length) return {empty:'Pas de match NBA en mémoire.'};
  const t=L.find(x=>x.tri===stuPick('nclub'))||L[0], S=stuNbaStats(), conf=(TEAMS[t.tri]||[])[1], cr=Object.values(S.T).filter(x=>(TEAMS[x.tri]||[])[1]===conf).sort(standCmp).findIndex(x=>x.tri===t.tri)+1;
  const lg=S.fin.filter(g=>g.home.tri===t.tri||g.away.tri===t.tri).sort((a,b)=>tms(b)-tms(a))[0], nx=nextGame(t.tri);
  const lr=lg?(()=>{ const me=lg.home.tri===t.tri?lg.home:lg.away, op=me===lg.home?lg.away:lg.home, w=+me.score>+op.score, tp=stuTopP(me); return {res:w?'Victoire':'Défaite',sc:`${stuNick(lg.away.tri)} ${lg.away.score}-${lg.home.score} ${stuNick(lg.home.tri)}`,goals:tp?`${tp.name} ${tp.pts} pts`:'',col:w?'#2fc15a':'#ff3b4a'}; })():null;
  return {theme:'npre',eyebrow:`NBA · Conférence ${conf==='E'?'Est':'Ouest'}`,title:tname(t.tri),cta:`Go ${stuNick(t.tri)} ! 👇`,clubCol:[tcolor(t.tri),'#140e1f'],list:L,
    club:{n:tname(t.tri),tri:t.tri,col:tcolor(t.tri),ini:t.tri,rank:cr,pts:`${t.w}-${t.l}`,rec:`${f1(t.pf/t.g).replace('.',',')} pts marqués · ${f1(t.pa/t.g).replace('.',',')} encaissés`,form:t.log.slice(-5).map(x=>x.win?'V':'D'),last:lr,next:nx?{t:`${stuParisDay(nx.t)} · ${parisT(nx.t)}`,o:stuNick(nx.h===t.tri?nx.a:nx.h),home:nx.h===t.tri,otri:nx.h===t.tri?nx.a:nx.h,oc:tcolor(nx.h===t.tri?nx.a:nx.h)}:null,nba:1},
    caption:`🏀 ${tname(t.tri)} : ${t.w}-${t.l}, ${stuOrd(cr)} à l'${conf==='E'?'Est':'Ouest'}\n📈 5 derniers : ${t.log.slice(-5).map(x=>x.win?'V':'D').join('-')}\n${lr?`⏮️ Dernier match : ${lr.res.toLowerCase()} ${lr.sc}${lr.goals?` (${lr.goals})`:''}\n`:''}${nx?`⏭️ Prochain : ${nx.h===t.tri?'contre':'à'} ${stuNick(nx.h===t.tri?nx.a:nx.h)}, ${stuParisDay(nx.t)} à ${parisT(nx.t)}\n`:''}\nGo ${stuNick(t.tri)} ! 👇\n\n#NBA #NBAFrance ${stuTag(stuNick(t.tri))}`}; }

/* ---- aiguillage ---- */
function stuData0(sport){ const S=stuS(), max={sq:7,pt:9,st:13}[S.fmt]||9;
  if(sport==='foot'){ const L=stuLeagues(); if(S.lg!=='all'&&!(S.lg&&foot.leagues[S.lg])) S.lg=L[0][0]; const t=S.tplF; let lg=S.lg; if(lg==='all'&&t!=='fprog') lg=L[0][0];
    let D=t==='table'?stuFootTable(lg,max+1):t==='pre'?stuFootPre(lg,S.pick.pre):t==='scor'?stuFootScor(lg,max):t==='fprog'?stuFootProg(S.lg):t==='fpoll'?stuFootPoll(lg):t==='fweek'?stuFootWeek(lg):t==='fteam'?stuFootTeam(lg):t==='fnum'?stuFootNums(lg):t==='fduel'?stuFootDuel(lg):t==='fclub'?stuFootClub(lg):stuFootRecap(lg);
    if(t==='recap'&&D.rows){ (D.src||[]).forEach((m,i)=>{ D.rows[i].big=stuFootBig(m); }); const o=D.rows.map((r,i)=>({r,m:(D.src||[])[i]})).sort((a,b)=>(!!b.r.big)-(!!a.r.big)); D.rows=o.map(x=>x.r); D.src=o.map(x=>x.m); }
    return D; }
  const t=S.tplN; const D=t==='ntop'?stuNbaTop(Math.min(max-1,8)):t==='nbox'?stuNbaBox(S.pick.nbox):t==='nstand'?stuNbaStand(S.conf,Math.min(max+1,15)):t==='npre'?stuNbaPre(S.pick.npre):t==='nperf'?stuNbaPerf():t==='nprog'?stuNbaProg():t==='npoll'?stuNbaPoll():t==='nduel'?stuNbaDuel():t==='nclub'?stuNbaClub():stuNbaRes();
  if(t==='nres'&&D.rows){ (D.src||[]).forEach((g,i)=>{ D.rows[i].big=stuNbaBig(g.away.tri,g.home.tri); }); const o=D.rows.map((r,i)=>({r,g:(D.src||[])[i]})).sort((a,b)=>(!!b.r.big)-(!!a.r.big)); D.rows=o.map(x=>x.r); D.src=o.map(x=>x.g); }
  return D; }
function stuData(sport){ const D=stuData0(sport), S=stuS(); try{ if(D&&!D.empty){ const t=sport==='foot'?S.tplF:S.tplN; if(['recap','table','pre','scor','nres','ntop','nbox','nstand','npre'].includes(t)) D.caption=stuCaption(sport,D)||D.caption;
    if(t==='recap'||t==='nres'){ const bg=(D.rows||[]).filter(r=>r.big); if(bg.length) D.caption=D.caption.replace(/\n\n/,`\n🔥 ${bg.map(r=>t==='recap'?`${r.h} ${r.hs}-${r.as} ${r.a} (${r.big.toLowerCase()})`:`${stuNick(r.a)} ${r.as}-${r.hs} ${stuNick(r.h)} (${r.big.toLowerCase()})`).join(' · ')}\n\n`); }
    if(S.tone==='sobre') D.caption=D.caption.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{2194}-\u{21AA}\u{FE0F}\u{20E3}]/gu,'').replace(/[ \t]+/g,' ').replace(/^ /gm,'');
    const tg=(S.tags||'').trim(); if(tg) D.caption+=' '+tg.split(/\s+/).map(x=>x.startsWith('#')?x:'#'+x).join(' '); } }catch(e){ console.error(e); } return D; }

/* ---- thèmes ---- */
var STU_THEMES={auto:'Automatique',nuit:'Nuit',vert:'Statify vert',club:'Couleurs du club'};
function stuTheme(D){ const S=stuS(), base=STU_TH[D.theme]||STU_TH.recap;
  if(S.theme==='nuit') return {bg:['#0b1426','#0b1426'],g1:'#3a5a8a',g2:'#1f2f4a',acc:'#9fb7d8'};
  if(S.theme==='vert') return {bg:['#06281a','#0b1b30'],g1:'#2fc15a',g2:'#1a9d55',acc:'#7dffa6'};
  if(S.theme==='club'&&D.clubCol){ const [a,b]=D.clubCol, dk=x=>{ const h=String(x||'#0b1b30').replace('#',''); const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16)||0; const f=v=>Math.round(v*.35).toString(16).padStart(2,'0'); return '#'+f(n>>16&255)+f(n>>8&255)+f(n&255); };
    return {bg:[dk(a),dk(b)],g1:a,g2:b||a,acc:'#ffffff'}; }
  return base; }

/* ---- rendu ---- */
async function stuRender(cv,D,fmt){
  const [W,H]=STU_FMT[fmt]||STU_FMT.pt, c=cv.getContext('2d'), th=stuTheme(D), S=stuS(), tk=S.tok;
  if(!D._t){ const urls=[]; for(const r of (D.rows||[])){ if(r.hl) urls.push(r.hl); if(r.al) urls.push(r.al); if(r.lo) urls.push(r.lo); if(r.tri) urls.push(logoUrl(r.tri)); if(r.k==='nres'){ urls.push(logoUrl(r.a),logoUrl(r.h)); } }
    if(D.pre){ if(D.pre.nba){ urls.push(logoUrl(D.pre.htri),logoUrl(D.pre.atri)); } else urls.push(D.pre.hl,D.pre.al); } if(D.box) urls.push(logoUrl(D.box.a),logoUrl(D.box.h)); if(D.match) urls.push(D.match.hl,D.match.al);
    const add=o=>{ if(!o) return; if(o.hl) urls.push(o.hl); if(o.al) urls.push(o.al); if(o.htri) urls.push(logoUrl(o.htri)); if(o.atri) urls.push(logoUrl(o.atri)); if(o.lo) urls.push(o.lo); if(o.tri) urls.push(logoUrl(o.tri)); if(o.ol) urls.push(o.ol); if(o.otri) urls.push(logoUrl(o.otri)); };
    if(D.prog){ D.prog.big.forEach(add); D.prog.rows.forEach(add); } add(D.poll); add(D.hero); add(D.club); if(D.club&&D.club.next) add(D.club.next); if(D.duel){ add(D.duel.a); add(D.duel.b); } if(D.team) Object.values(D.team).flat().forEach(x=>add({lo:x.lo}));
    urls.push('icon-192.png'); await Promise.all(urls.filter(Boolean).map(stuImg)); if(tk!==S.tok&&!D._rec) return; }
  if(cv.width!==W) cv.width=W; if(cv.height!==H) cv.height=H; c.setTransform(1,0,0,1,0,0); c.globalAlpha=1;
  const t=D._t, ease=v=>1-Math.pow(1-Math.max(0,Math.min(1,v)),3);
  const g=c.createLinearGradient(0,0,W*.6,H); g.addColorStop(0,th.bg[0]); g.addColorStop(1,th.bg[1]); c.fillStyle=g; c.fillRect(0,0,W,H);
  for(const [x,y,r,col] of [[W,0,W*.85,th.g1],[0,H,W*.85,th.g2]]){ const rg=c.createRadialGradient(x,y,0,x,y,r); rg.addColorStop(0,col+'55'); rg.addColorStop(1,col+'00'); c.fillStyle=rg; c.fillRect(0,0,W,H); }
  const P=72, story=fmt==='st', top=story?190:70, botSafe=story?260:0;
  const ic=S.img['icon-192.png']; if(ic&&!S.noImg){ c.save(); cvRR(c,P,top,58,58,16); c.clip(); try{ c.drawImage(ic,P,top,58,58); }catch(e){} c.restore(); } else { cvRR(c,P,top,58,58,16); c.fillStyle='#2fc15a'; c.fill(); }
  cvTx(c,'S T A T I F Y',P+76,top+40,{size:26,weight:900,alpha:.9});
  let y=top+58+56; const ta=t==null?1:ease(t/.6);
  c.save(); c.globalAlpha=ta; if(t!=null) c.translate(0,(1-ta)*30);
  if(D.badge){ cvBadge(c,'● '+D.badge,P,y-34,48,'#ff3b4a'); y+=36; }
  cvTx(c,String(D.eyebrow||'').toUpperCase(),P,y,{size:26,weight:900,color:th.acc,max:W-2*P}); y+=18;
  const ttl=(S.title[(D.theme||'')+'|'+(D.title||'')]||D.title||''); cvF(c,story?84:76,900); const TL=cvWrap(c,ttl,W-2*P,2); for(const l of TL){ y+=story?92:84; c.globalAlpha=ta; cvTx(c,l,P,y,{size:story?84:76,weight:900,alpha:ta}); }
  c.restore(); y+=40;
  const fy=H-botSafe-120, avail=fy-30-y;
  c.fillStyle='#ffffff26'; c.fillRect(P,fy,W-2*P,2);
  cvTx(c,stuHandle(),P,fy+66,{size:30,weight:800,alpha:.85}); cvTx(c,D.cta||'',W-P,fy+66,{size:28,weight:800,align:'right',alpha:.85,max:W/2});
  const x=P, w=W-2*P;
  if(D.rows){ stuRows(c,D,x,y,w,avail,fmt); return; }
  const ca=t==null?1:ease((t-.6)/.8); c.save(); c.globalAlpha=ca; if(t!=null){ const s=.94+.06*ca; c.translate(W/2,y+avail/2); c.scale(s,s); c.translate(-W/2,-(y+avail/2)); }
  if(D.pre) stuPre(c,D.pre,x,y,w,avail,th); else if(D.box) stuBox(c,D.box,x,y,w,avail); else if(D.match) stuMatch(c,D.match,x,y,w,avail);
  else if(D.prog) stuProg(c,D.prog,x,y,w,avail); else if(D.poll) stuPoll(c,D.poll,x,y,w,avail); else if(D.hero) stuHero(c,D.hero,x,y,w,avail,th);
  else if(D.team) stuTeamDraw(c,D.team,x,y,w,avail); else if(D.nums) stuNums(c,D.nums,x,y,w,avail,th,t); else if(D.duel) stuDuel(c,D.duel,x,y,w,avail); else if(D.club) stuClub(c,D.club,x,y,w,avail,th);
  c.restore();
}
function stuRows(c,D,x,y,w,avail,fmt){
  const hlH=D.hl?150:0, rows=D.rows, n=rows.length, maxRow=D.rows[0].k==='pl'?130:D.rows[0].k==='res'?124:110, gap=12, t=D._t;
  let rh=Math.min(maxRow,Math.floor((avail-hlH-(hlH?24:0)-gap*(n-1))/Math.max(1,n))); let shown=rows;
  if(rh<58){ const k=Math.max(1,Math.floor((avail-hlH-(hlH?24:0)+gap)/(58+gap))); shown=rows.slice(0,k); rh=58; }
  shown.forEach((r,i)=>{ const yy=y+i*(rh+gap); if(t==null){ stuRow(c,r,x,yy,w,rh); return; } const p=Math.max(0,Math.min(1,(t-.7-i*.32)/.35)); if(p<=0) return; const e=1-Math.pow(1-p,3);
    c.save(); c.globalAlpha=e; c.translate((1-e)*120,0); stuRow(c,r,x,yy,w,rh); c.restore(); });
  if(D.hl){ const p=t==null?1:Math.max(0,Math.min(1,(t-.7-shown.length*.32)/.5)); if(p>0){ c.save(); c.globalAlpha=p; const yy=y+shown.length*(rh+gap)+12, cw=(w-2*16)/3; D.hl.slice(0,3).forEach((h,i)=>{ const xx=x+i*(cw+16); cvRR(c,xx,yy,cw,hlH,22); c.fillStyle='#ffffff14'; c.fill(); cvTx(c,h.b,xx+20,yy+62,{size:38,weight:900,max:cw-40}); cvTx(c,h.s,xx+20,yy+108,{size:24,weight:600,alpha:.8,max:cw-40}); }); c.restore(); } }
}
function stuRow(c,r,x,y,w,h){
  if(r.big&&(r.k==='res'||r.k==='nres')){ const f=h/96; c.save(); cvRR(c,x-3,y-3,w+6,h+6,22*f); c.fillStyle='#ffcc3330'; c.fill(); c.restore(); }
  stuRowBase(c,r,x,y,w,h);
  if(r.big&&(r.k==='res'||r.k==='nres')){ const f=h/96; c.save(); cvRR(c,x,y,w,h,20*f); c.lineWidth=3; c.strokeStyle='#ffcc33'; c.stroke(); cvTx(c,'🔥 '+r.big.toUpperCase(),x+w/2,y+Math.max(14,17*f),{size:Math.max(12,14*f),weight:900,align:'center',color:'#ffcc33'}); c.restore(); }
}
/* ---- dessins des nouveaux modèles ---- */
function stuProg(c,p,x,y,w,avail){
  let yy=y; const end=y+avail;
  for(const b of p.big){ const bh=190; if(yy+bh>end) break; cvRR(c,x,yy,w,bh,26); c.fillStyle='#ffcc3322'; c.fill(); c.lineWidth=3; c.strokeStyle='#ffcc33'; c.stroke();
    cvTx(c,'🔥 '+b.b.toUpperCase(),x+w/2,yy+40,{size:24,weight:900,align:'center',color:'#ffcc33'}); const L=96;
    cvLogo(c,b.hl||(b.htri?logoUrl(b.htri):''),x+40,yy+62,L,b.htri||stuIni(b.h),b.hc); cvLogo(c,b.al||(b.atri?logoUrl(b.atri):''),x+w-40-L,yy+62,L,b.atri||stuIni(b.a),b.ac);
    cvTx(c,b.h,x+40+L+20,yy+122,{size:32,weight:900,max:w/2-L-90}); cvTx(c,b.a,x+w-40-L-20,yy+122,{size:32,weight:900,align:'right',max:w/2-L-90}); cvTx(c,b.t,x+w/2,yy+166,{size:26,weight:800,align:'center',alpha:.85});
    yy+=bh+16; }
  const rows=p.rows, rh=62, dh=50; let used=0, cut=0;
  for(const r of rows){ const hh=r.k==='day'?dh:rh+8; if(yy+hh>end-40){ cut=rows.slice(used).filter(z=>z.k==='prog').length; break; }
    if(r.k==='day'){ cvTx(c,String(r.t).toUpperCase(),x+4,yy+36,{size:24,weight:900,alpha:.75}); yy+=dh; }
    else { cvRR(c,x,yy,w,rh,16); c.fillStyle=r.big?'#ffcc3326':'#ffffff10'; c.fill(); if(r.big){ c.lineWidth=2; c.strokeStyle='#ffcc33'; c.stroke(); }
      cvTx(c,r.t,x+20,yy+41,{size:26,weight:900,color:r.big?'#ffcc33':'#fff'}); const s=40, mid=x+w/2+40;
      cvLogo(c,r.hl||(r.htri?logoUrl(r.htri):''),mid-30-s,yy+11,s,r.htri||stuIni(r.h),r.hc); cvTx(c,r.h,mid-40-s,yy+41,{size:26,weight:800,align:'right',max:w/2-120});
      cvTx(c,'–',mid,yy+41,{size:26,weight:900,align:'center',alpha:.6});
      cvLogo(c,r.al||(r.atri?logoUrl(r.atri):''),mid+30,yy+11,s,r.atri||stuIni(r.a),r.ac); cvTx(c,r.a+(r.big?' 🔥':''),mid+40+s,yy+41,{size:26,weight:800,max:w/2-140});
      yy+=rh+8; }
    used++; }
  if(cut>0) cvTx(c,`+ ${cut} autre${cut>1?'s':''} match${cut>1?'s':''}`,x+w/2,Math.min(end-6,yy+30),{size:24,weight:800,align:'center',alpha:.75});
}
function stuPoll(c,p,x,y,w,avail){
  const L=Math.min(230,avail*.32), cx1=x+w*.22, cx2=x+w*.78;
  if(p.b) cvTx(c,'🔥 '+p.b.toUpperCase(),x+w/2,y+10,{size:26,weight:900,align:'center',color:'#ffcc33'});
  const yy=y+30; cvLogo(c,p.hl||(p.htri?logoUrl(p.htri):''),cx1-L/2,yy,L,p.htri||stuIni(p.h),p.hc,'#fff'); cvLogo(c,p.al||(p.atri?logoUrl(p.atri):''),cx2-L/2,yy,L,p.atri||stuIni(p.a),p.ac,'#fff');
  cvTx(c,p.h,cx1,yy+L+52,{size:38,weight:900,align:'center',max:w*.42}); cvTx(c,p.a,cx2,yy+L+52,{size:38,weight:900,align:'center',max:w*.42});
  if(p.sub){ if(p.sub[0]) cvTx(c,p.sub[0],cx1,yy+L+92,{size:24,weight:700,align:'center',alpha:.75}); if(p.sub[1]) cvTx(c,p.sub[1],cx2,yy+L+92,{size:24,weight:700,align:'center',alpha:.75}); }
  cvTx(c,'VS',x+w/2,yy+L/2+30,{size:80,weight:900,align:'center'});
  const by=yy+L+140, bh=Math.min(260,y+avail-by-20), opts=p.draw?[['1',p.h,p.hc],['N','Nul','#8a9ab0'],['2',p.a,p.ac]]:[['1',p.h,p.hc],['2',p.a,p.ac]], gap=20, bw=(w-gap*(opts.length-1))/opts.length;
  if(bh<120) return;
  opts.forEach(([k,l,col],i)=>{ const bx=x+i*(bw+gap); cvRR(c,bx,by,bw,bh,28); c.fillStyle='#ffffff14'; c.fill(); c.lineWidth=4; c.strokeStyle=col; c.stroke();
    cvTx(c,k,bx+bw/2,by+bh*.55,{size:Math.min(130,bh*.5),weight:900,align:'center'}); cvTx(c,l,bx+bw/2,by+bh-30,{size:26,weight:800,align:'center',alpha:.85,max:bw-30}); });
}
function stuHero(c,h,x,y,w,avail,th){
  const R=Math.min(250,avail*.3), cx=x+w/2;
  c.save(); c.beginPath(); c.arc(cx,y+R/2,R/2,0,7); c.fillStyle=h.col||'#34b64f'; c.fill(); c.lineWidth=8; c.strokeStyle='#fff'; c.stroke(); c.restore();
  cvTx(c,h.ini,cx,y+R/2+R*.13,{size:R*.36,weight:900,align:'center',color:(typeof ink==='function'?ink(h.col||'#34b64f'):'#fff')});
  const lo=h.lo||(h.tri?logoUrl(h.tri):''); if(lo) cvLogo(c,lo,cx+R*.24,y+R*.62,R*.38,h.tri||'',h.col);
  if(h.badge) cvBadge(c,h.badge,cx-R/2-10,y+6,52,h.badge==='TD'?'#ffb020':'#1f6fff',h.badge==='TD'?'#1b1300':'#fff');
  let yy=y+R+64; cvTx(c,h.n,cx,yy,{size:54,weight:900,align:'center',max:w}); yy+=46; cvTx(c,h.sub,cx,yy,{size:26,weight:700,align:'center',alpha:.8,max:w}); yy+=26;
  const bigS=Math.min(170,avail*.2); cvTx(c,String(h.big),cx,yy+bigS*.95,{size:bigS,weight:900,align:'center',color:th.acc}); yy+=bigS+8; cvTx(c,h.unit,cx,yy+20,{size:28,weight:900,align:'center',alpha:.85}); yy+=48;
  const cols=3, rows=Math.ceil(h.grid.length/cols), gh=Math.min(120,(y+avail-yy-(h.note?80:0)-(rows-1)*14)/rows), gw=(w-2*14)/cols;
  if(gh>=70) h.grid.forEach(([l,v],i)=>{ const gx=x+(i%cols)*(gw+14), gy=yy+Math.floor(i/cols)*(gh+14); cvRR(c,gx,gy,gw,gh,20); c.fillStyle='#ffffff12'; c.fill(); cvTx(c,String(v),gx+gw/2,gy+gh*.52,{size:Math.min(48,gh*.42),weight:900,align:'center'}); cvTx(c,l,gx+gw/2,gy+gh*.84,{size:22,weight:700,align:'center',alpha:.75,max:gw-20}); });
  if(h.note&&gh>=70){ const ny=yy+rows*(gh+14)+6; if(ny+60<y+avail){ cvRR(c,x,ny,w,64,20); c.fillStyle=th.acc+'26'; c.fill(); cvTx(c,'📈 '+h.note,cx,ny+43,{size:27,weight:800,align:'center',max:w-40}); } }
}
function stuTeamDraw(c,T,x,y,w,avail){
  const ph=Math.min(avail,w*1.25), py=y; cvRR(c,x,py,w,ph,24); const g=c.createLinearGradient(0,py,0,py+ph); g.addColorStop(0,'#1f7a3a'); g.addColorStop(1,'#16602d'); c.fillStyle=g; c.fill();
  c.save(); cvRR(c,x,py,w,ph,24); c.clip(); c.globalAlpha=.12; for(let i=0;i<8;i++) if(i%2===0){ c.fillStyle='#fff'; c.fillRect(x,py+i*ph/8,w,ph/8); } c.restore();
  c.strokeStyle='#ffffffaa'; c.lineWidth=3; c.beginPath(); c.moveTo(x,py+ph/2); c.lineTo(x+w,py+ph/2); c.stroke(); c.beginPath(); c.arc(x+w/2,py+ph/2,ph*.09,0,7); c.stroke();
  c.strokeRect(x+w*.25,py,w*.5,ph*.13); c.strokeRect(x+w*.25,py+ph*.87,w*.5,ph*.13);
  const lines=[['F',.14],['M',.38],['D',.64],['G',.88]], s=Math.min(96,w*.11);
  for(const [g,fy] of lines){ const L=T[g]||[], n=L.length; L.forEach((xx,i)=>{ const cx=x+w*(i+1)/(n+1), cy=py+ph*fy;
    c.beginPath(); c.arc(cx,cy,s/2,0,7); c.fillStyle=xx.col; c.fill(); c.lineWidth=4; c.strokeStyle='#fff'; c.stroke();
    cvTx(c,initials(xx.p.n),cx,cy+s*.14,{size:s*.36,weight:900,align:'center',color:(typeof ink==='function'?ink(xx.col):'#fff')});
    const nm=String(xx.p.n).split(' ').slice(-1)[0], lw=Math.min(230,w/(n+1)-12); cvRR(c,cx-lw/2,cy+s/2+6,lw,34,10); c.fillStyle='#0b1b30cc'; c.fill(); cvTx(c,nm,cx,cy+s/2+31,{size:22,weight:800,align:'center',max:lw-10});
    const st=xx.p.g?'⚽'.repeat(Math.min(3,xx.p.g)):xx.p.a?'🅰️':xx.pg==='G'&&xx.p.sv?xx.p.sv+' arr.':''; if(st) cvTx(c,st,cx,cy-s/2-8,{size:22,weight:800,align:'center'}); }); }
}
function stuNums(c,R,x,y,w,avail,th,t){
  const cols=2, rows=Math.ceil(R.length/cols), gap=16, bh=Math.min(200,(avail-(rows-1)*gap)/rows), bw=(w-gap)/2;
  R.forEach((r,i)=>{ const bx=x+(i%cols)*(bw+gap), by=y+Math.floor(i/cols)*(bh+gap); const p=t==null?1:Math.max(0,Math.min(1,(t-.7-i*.28)/.35)); if(p<=0) return; c.save(); c.globalAlpha*=p;
    cvRR(c,bx,by,bw,bh,24); c.fillStyle='#ffffff12'; c.fill(); cvTx(c,r.big,bx+28,by+bh*.55,{size:Math.min(80,bh*.42),weight:900,color:th.acc,max:bw-50}); cvF(c,24,700); const ls=cvWrap(c,r.s,bw-50,2); ls.forEach((l,j)=>cvTx(c,l,bx+28,by+bh*.55+38+j*30,{size:24,weight:700,alpha:.85})); c.restore(); });
}
function stuDuel(c,d,x,y,w,avail){
  const R=Math.min(170,avail*.22), cx1=x+w*.22, cx2=x+w*.78;
  for(const [p,cx] of [[d.a,cx1],[d.b,cx2]]){ c.beginPath(); c.arc(cx,y+R/2,R/2,0,7); c.fillStyle=p.col; c.fill(); c.lineWidth=6; c.strokeStyle='#fff'; c.stroke(); cvTx(c,p.ini,cx,y+R/2+R*.13,{size:R*.36,weight:900,align:'center',color:(typeof ink==='function'?ink(p.col):'#fff')});
    cvTx(c,p.n,cx,y+R+48,{size:32,weight:900,align:'center',max:w*.44}); cvTx(c,p.sub,cx,y+R+84,{size:23,weight:700,align:'center',alpha:.75,max:w*.44}); }
  cvTx(c,'VS',x+w/2,y+R/2+26,{size:64,weight:900,align:'center'});
  let yy=y+R+120; const n=d.rows.length, rh=Math.min(92,(y+avail-yy)/n-10);
  d.rows.forEach(([l,a,b],i)=>{ const Y=yy+i*(rh+10); cvRR(c,x,Y,w,rh,18); c.fillStyle='#ffffff10'; c.fill(); const wa=+a>+b, wb=+b>+a;
    cvTx(c,String(a).replace('.',','),x+28,Y+rh*.62,{size:Math.min(40,rh*.45),weight:900,color:wa?'#7dffa6':'#fff'}); cvTx(c,String(b).replace('.',','),x+w-28,Y+rh*.62,{size:Math.min(40,rh*.45),weight:900,align:'right',color:wb?'#7dffa6':'#fff'}); cvTx(c,l,x+w/2,Y+rh*.4,{size:22,weight:700,align:'center',alpha:.75});
    const t=(+a)+(+b)||1, bw=w*.5; c.fillStyle=d.a.col; cvRR(c,x+w/2-bw/2,Y+rh*.62,bw*(+a)/t,10,5); c.fill(); c.fillStyle=d.b.col; cvRR(c,x+w/2-bw/2+bw*(+a)/t,Y+rh*.62,bw*(+b)/t,10,5); c.fill(); });
}
function stuClub(c,k,x,y,w,avail,th){
  const L=Math.min(200,avail*.24); cvLogo(c,k.lo||(k.tri?logoUrl(k.tri):''),x,y,L,k.ini,k.col,'#fff');
  cvTx(c,stuOrd(k.rank),x+L+40,y+L*.5,{size:90,weight:900}); cvTx(c,k.nba?'de sa conférence':'au classement',x+L+40,y+L*.5+40,{size:26,weight:700,alpha:.8});
  cvTx(c,String(k.pts)+(k.nba?'':' pts'),x+w,y+L*.5,{size:64,weight:900,align:'right',color:th.acc}); cvTx(c,k.rec,x+w,y+L*.5+40,{size:22,weight:700,align:'right',alpha:.8,max:w-L-260});
  let yy=y+L+40; const box=(title,hh,draw)=>{ if(yy+hh>y+avail) return; cvRR(c,x,yy,w,hh,24); c.fillStyle='#ffffff12'; c.fill(); cvTx(c,title.toUpperCase(),x+28,yy+42,{size:22,weight:900,alpha:.7}); draw(yy); yy+=hh+18; };
  if(k.form&&k.form.length) box('Forme',120,Y=>k.form.forEach((v,i)=>cvDot(c,x+50+i*62,Y+82,24,v==='V'?'#2fc15a':v==='D'?'#ff3b4a':'#8a9ab0',v)));
  if(k.last) box('Dernier match · '+k.last.res,k.last.goals?170:130,Y=>{ c.fillStyle=k.last.col; cvRR(c,x,Y+20,10,k.last.goals?130:90,5); c.fill(); cvTx(c,k.last.sc,x+28,Y+96,{size:38,weight:900,max:w-56}); if(k.last.goals) cvTx(c,'⚽ '+k.last.goals,x+28,Y+140,{size:24,weight:700,alpha:.85,max:w-56}); });
  if(k.next) box('Prochain match',150,Y=>{ cvLogo(c,k.next.ol||(k.next.otri?logoUrl(k.next.otri):''),x+28,Y+60,70,k.next.otri||stuIni(k.next.o),k.next.oc); cvTx(c,(k.next.home?'contre ':'à ')+k.next.o,x+118,Y+96,{size:34,weight:900,max:w-150}); cvTx(c,k.next.t,x+118,Y+132,{size:24,weight:700,alpha:.8,max:w-150}); });
}

/* ---- vidéo ---- */
function stuVidMime(){ const L=['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']; if(typeof MediaRecorder==='undefined') return ''; return L.find(t=>{ try{ return MediaRecorder.isTypeSupported(t); }catch(e){ return false; } })||''; }
async function stuVideo(sport){
  const S=stuS(), D=S.cur; if(!D||D.empty) return; const mime=stuVidMime(); if(!mime){ say('⚠️ Ce navigateur ne sait pas créer de vidéo. Essaie avec Safari (iPhone) ou Chrome/Edge à jour.','err'); return; }
  const box=document.getElementById('stuVid'); if(S.vBusy) return; S.vBusy=1;
  const [W,H]=STU_FMT[S.fmt]||STU_FMT.pt, cv=document.createElement('canvas'); cv.width=W; cv.height=H; cv.style.cssText='position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none'; document.body.appendChild(cv);
  try{ await stuRender(cv,D,S.fmt); }catch(e){}
  const n=(D.rows||D.nums||[]).length, T=Math.min(16,Math.max(6,1.2+(D.rows||D.nums?n*.32+.6:1.4)+3.8));
  const stream=cv.captureStream(30), rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8e6}), chunks=[];
  rec.ondataavailable=e=>{ if(e.data&&e.data.size) chunks.push(e.data); };
  const done=new Promise(r=>{ rec.onstop=r; });
  rec.start(250); const t0=performance.now(); let alive=true;
  if(box) box.innerHTML=`<div class="stu-vprog">🎬 Création de la vidéo… <b id="stuVt">0</b> / ${Math.round(T)} s</div>`;
  await new Promise(res=>{ const step=async()=>{ if(!alive) return; const t=(performance.now()-t0)/1000; try{ await stuRender(cv,{...D,_t:t,_rec:1},S.fmt); }catch(e){} const el=document.getElementById('stuVt'); if(el) el.textContent=Math.min(Math.round(t),Math.round(T)); if(t>=T){ alive=false; res(); return; } requestAnimationFrame(step); }; requestAnimationFrame(step); });
  rec.stop(); await done; cv.remove(); S.vBusy=0;
  const ext=/mp4/.test(mime)?'mp4':'webm', blob=new Blob(chunks,{type:mime.split(';')[0]}); S.vid={blob,ext};
  if(box){ const u=URL.createObjectURL(blob); box.innerHTML=`<video src="${u}" controls playsinline loop muted autoplay class="stu-video"></video><div class="row" style="gap:6px;margin-top:8px"><button data-act="stuvshare">↗ Partager la vidéo</button><button class="sec" data-act="stuvdl">⬇ Télécharger (${ext.toUpperCase()})</button></div>${ext==='webm'?'<p class="mut" style="font-size:12px;margin:6px 0 0">Vidéo au format WebM (Chrome/Edge). TikTok l\'accepte sur ordinateur ; sur iPhone, Safari crée directement du MP4.</p>':''}`; }
}
async function stuVShare(){ const S=stuS(); if(!S.vid) return; const f=new File([S.vid.blob],`statify-${S.cur&&S.cur.theme||'video'}.${S.vid.ext}`,{type:S.vid.blob.type});
  try{ if(navigator.canShare&&navigator.canShare({files:[f]})){ try{ await navigator.clipboard.writeText(S.cur&&S.cur.caption||''); }catch(e){} await navigator.share({files:[f]}); stuMarkPosted(); say('✓ Vidéo partagée. La légende est copiée.','ok'); } else stuVDl(); }catch(e){ if(e&&e.name==='AbortError') return; say('⚠️ Partage impossible : '+esc(e.message||e),'err'); } }
function stuVDl(){ const S=stuS(); if(!S.vid) return; const a=document.createElement('a'); a.href=URL.createObjectURL(S.vid.blob); a.download=`statify-${Date.now()}.${S.vid.ext}`; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },4000); stuMarkPosted(); say('✓ Vidéo téléchargée.','ok'); }

/* ---- préférences, liste « à poster » ---- */
(function(){ const p=loadJ('suivi-stu-pref',{}); const S=stuS(); for(const k of ['fmt','theme','tone','tags']) if(p[k]!=null) S[k]=p[k]; if(!S.theme) S.theme='auto'; if(!S.tone) S.tone='fun'; })();
function stuPrefSave(){ const S=stuS(); saveJ('suivi-stu-pref',{fmt:S.fmt,theme:S.theme,tone:S.tone,tags:S.tags||''}); }
function stuPostKey(sport){ const S=stuS(), t=sport==='foot'?S.tplF:S.tplN; return `${parisDK(new Date().toISOString())}|${t}|${sport==='foot'?S.lg:''}`; }
function stuMarkPosted(){ const sp=ui.sport==='foot'?'foot':'nba', P=loadJ('suivi-stu-posted',{}); P[stuPostKey(sp)]=Date.now(); for(const k in P) if(Date.now()-P[k]>4*864e5) delete P[k]; saveJ('suivi-stu-posted',P); try{ const el=document.getElementById('stuTodo'); if(el) el.outerHTML=stuTodoHtml(sp); }catch(e){} }
function stuTodoHtml(sport){ const P=loadJ('suivi-stu-posted',{}), day=parisDK(new Date().toISOString()), seen={}; let L=[]; try{ L=stuReady(sport); }catch(e){}
  const done=Object.keys(P).filter(k=>k.startsWith(day+'|')).map(k=>k.split('|')), tn=(t)=>((sport==='foot'?STU_TPL_F:STU_TPL_N).find(x=>x[0]===t)||[,t])[1];
  const items=[...L.map(x=>({t:x.t,lg:x.lg||'',lab:x.lab,ok:!!P[`${day}|${x.t}|${x.lg||''}`]})),...done.filter(d=>!L.some(x=>x.t===d[1]&&(x.lg||'')===d[2])).map(d=>({t:d[1],lg:d[2],lab:tn(d[1])+(d[2]&&footLgName?' · '+footLgName(d[2]):''),ok:true}))];
  if(!items.length) return '<div id="stuTodo"></div>';
  return `<div id="stuTodo" class="stu-todo"><b>📋 À poster aujourd'hui</b>${items.map(x=>`<button class="${x.ok?'ok':''}" data-act="stutodo" data-t="${esc(x.t)}" data-lg="${esc(x.lg)}">${x.ok?'✓':'◻'} ${esc(x.lab)}</button>`).join('')}</div>`; }

/* ---- vue ---- */
function stuPickers(sport,cur){ const S=stuS(), sel=(id,k,L,lab)=>L.length?`<select id="${id}" data-k="${k}" style="margin-top:8px;width:100%"><option value="">${esc(lab)}</option>${L.map(([v,n])=>`<option value="${esc(v)}" ${String(S.pick[k])===String(v)?'selected':''}>${esc(n)}</option>`).join('')}</select>`:'';
  if(sport==='foot'){ const lg=S.lg==='all'?stuLeagues()[0][0]:S.lg;
    if(cur==='pre'||cur==='fpoll') return sel('stuPk',cur==='pre'?'pre':'fpoll',stuFootPreList(lg).slice(0,30).map(m=>[m.id,`${fmtD(m.d)} ${parisT(m.d)} · ${m.hn} – ${m.an}${stuFootBig(m)?' 🔥':''}`]),'Choix auto : l\'affiche');
    if(cur==='fweek'){ const L=stuFootPlayers(stuFootDay(lg)).slice(0,25); return sel('stuPk','fweek',L.map(x=>[x.p.id,`${x.p.n} (${x.tm}) · note ${f1(x.note)}`]),'Choix auto : le meilleur'); }
    if(cur==='fduel'){ const L=stuFootDuelList(lg).map(p=>[p.id,`${p.n} (${p.tn}) · ${p.g} buts`]); return sel('stuPk','fduelA',L,'Joueur 1 : auto')+sel('stuPk2','fduelB',L,'Joueur 2 : auto'); }
    if(cur==='fclub') return sel('stuPk','fclub',stuFootClubList(lg).map(r=>[r.id,`${r.rank}. ${r.name}`]),'Choix auto : ton club favori');
    return ''; }
  if(cur==='nbox'){ const N=stuNbaNight(); return N?sel('stuPk','nbox',N.gs.map(g=>[g.id,`${g.away.tri} ${g.away.score} - ${g.home.score} ${g.home.tri}`]),'Choix auto : le plus serré'):''; }
  if(cur==='npre'||cur==='npoll') return sel('stuPk',cur,stuNbaPreList().map(x=>[x.id,`${fmtD(x.t)} ${parisT(x.t)} · ${x.a} @ ${x.h}${stuNbaBig(x.a,x.h)?' 🔥':''}`]),'Choix auto : l\'affiche');
  if(cur==='nperf'){ const D=stuS().cur; const L=(D&&D.list&&D.hero?D.list:[]).map(y=>[y.p.id,`${y.p.name} (${y.p.tri}) · ${y.p.pts} pts`]); return sel('stuPk','nperf',L,'Choix auto : la meilleure perf'); }
  if(cur==='nduel'){ const L=stuNbaDuelList().map(p=>[p.id,`${p.name} (${p.tri}) · ${f1(p.pts/p.gp)} pts`]); return sel('stuPk','nduelA',L,'Joueur 1 : auto')+sel('stuPk2','nduelB',L,'Joueur 2 : auto'); }
  if(cur==='nclub') return sel('stuPk','nclub',stuNbaClubList().map(t=>[t.tri,`${tname(t.tri)} (${t.w}-${t.l})`]),'Choix auto : ton équipe favorite');
  return ''; }
function viewStudio(sport){
  const S=stuS(), F=sport==='foot', tpls=F?STU_TPL_F:STU_TPL_N, cur=F?S.tplF:S.tplN;
  if(!tpls.find(x=>x[0]===cur)){ if(F) S.tplF='recap'; else S.tplN='nres'; }
  if(cur==='nperf'&&(!S.cur||!S.cur.hero)) try{ S.cur=stuData('nba'); }catch(e){}
  const tplH=tpls.map(([k,n,bg])=>`<button class="stu-t ${k===cur?'on':''}" data-act="stutpl" data-k="${k}" style="--bg:${bg}">${esc(n)}</button>`).join('');
  const fmtH=Object.entries(STU_FMT).map(([k,[,,n]])=>`<button class="${S.fmt===k?'':'sec'} fbtn" data-act="stufmt" data-k="${k}">${esc(n)}</button>`).join('');
  let opt='';
  if(F){ const L=stuLeagues(); if(S.lg!=='all'&&(!S.lg||!L.find(([c])=>c===S.lg))) S.lg=L[0][0]; if(S.lg==='all'&&cur!=='fprog') S.lg=L[0][0];
    opt=`<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">${cur==='fprog'?`<button class="${S.lg==='all'?'':'sec'} fbtn" data-act="stulg" data-k="all">🌍 Tous</button>`:''}${L.map(([c,n])=>`<button class="${S.lg===c?'':'sec'} fbtn" data-act="stulg" data-k="${c}">${esc(n)}</button>`).join('')}</div>`; }
  else if(cur==='nstand') opt=`<div class="row" style="gap:6px;margin-top:8px"><button class="${S.conf==='E'?'':'sec'} fbtn" data-act="stuconf" data-k="E">Est</button><button class="${S.conf==='W'?'':'sec'} fbtn" data-act="stuconf" data-k="W">Ouest</button></div>`;
  try{ opt+=stuPickers(sport,cur); }catch(e){}
  const thH=Object.entries(STU_THEMES).map(([k,n])=>`<button class="${(S.theme||'auto')===k?'':'sec'} fbtn" data-act="stuth" data-k="${k}">${esc(n)}</button>`).join('');
  setTimeout(()=>stuDraw(sport),0);
  return `<div class="card stu"><h2 style="margin:0 0 2px">🎨 Studio</h2><p class="mut" style="margin:0 0 12px">Des images et des vidéos prêtes à poster, en 2 touches. 🔥 = gros match mis en avant.</p>
  ${stuTodoHtml(sport)}
  <h3>1. Choisis un modèle</h3><div class="stu-tpl">${tplH}</div>
  <h3>2. Format${F?', championnat':''} et réglages</h3><div class="row" style="gap:6px;flex-wrap:wrap">${fmtH}</div>${opt}
  <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:10px"><span class="mut" style="font-size:12.5px;align-self:center">Thème :</span>${thH}</div>
  <h3>3. Aperçu</h3><div class="stu-pv"><div class="stu-cvw"><canvas id="stuCv" width="1080" height="1350"></canvas><div class="stu-empty" id="stuEmpty"></div></div>
  <div class="stu-btns"><button data-act="stushare">↗ Partager l'image</button><button class="sec" data-act="stuload">⬇ Télécharger</button><button class="sec" data-act="stuvid">🎬 Créer la vidéo animée</button><div id="stuVid"></div>
  <label class="mut" style="font-size:12.5px">Titre (vide = automatique)<input id="stuTitle" placeholder="Titre automatique" autocomplete="off"></label>
  <label class="mut" style="font-size:12.5px">Ton @pseudo<input id="stuHandle" placeholder="@ton pseudo" autocomplete="off" autocapitalize="off" value="${esc((typeof ttk!=='undefined'&&ttk.handle)||'')}"></label></div></div>
  ${stuCarOk(sport)?`<label class="stu-carl"><input type="checkbox" id="stuCarOn" ${S.car?'checked':''}> 🖼️ Carrousel : ajouter une image détaillée par match</label><div id="stuCar"></div>`:''}
  <h3>4. Légende à copier</h3><div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:8px"><button class="${S.tone!=='sobre'?'':'sec'} fbtn" data-act="stutone" data-k="fun">😄 Fun</button><button class="${S.tone==='sobre'?'':'sec'} fbtn" data-act="stutone" data-k="sobre">Sobre</button><input id="stuTags" placeholder="Tes hashtags (ex. #statify #foot)" value="${esc(S.tags||'')}" style="flex:1;min-width:160px" autocomplete="off" autocapitalize="off"></div>
  <div class="stu-cap"><div id="stuCap"></div><button class="sec" data-act="stucopy">📋 Copier la légende</button></div>
  <p class="mut" style="font-size:12px;margin:10px 0 0">Les données viennent de ce que Statify a en mémoire : actualise avant de créer une image. Si les logos ne s'affichent pas, Statify met des pastilles de couleur à la place.</p></div>`;
}
document.addEventListener('click',e=>{ const b=e.target.closest('.stu [data-act]'); if(!b) return; const a=b.dataset.act, S=stuS(), sp=ui.sport==='foot'?'foot':'nba';
  if(!['stuth','stutone','stuvid','stuvshare','stuvdl','stutodo'].includes(a)) return; e.stopPropagation();
  if(a==='stuth'){ S.theme=b.dataset.k; stuPrefSave(); render(); } else if(a==='stutone'){ S.tone=b.dataset.k; stuPrefSave(); render(); }
  else if(a==='stuvid') stuVideo(sp); else if(a==='stuvshare') stuVShare(); else if(a==='stuvdl') stuVDl();
  else if(a==='stutodo'){ if(sp==='foot'){ S.tplF=b.dataset.t; if(b.dataset.lg) S.lg=b.dataset.lg; } else S.tplN=b.dataset.t; render(); } },true);
document.addEventListener('change',e=>{ const t=e.target; if(!t) return; if(t.id==='stuPk'||t.id==='stuPk2'){ stuS().pick[t.dataset.k]=t.value; stuDraw(); } });
document.addEventListener('input',e=>{ const t=e.target; if(t&&t.id==='stuTags'){ stuS().tags=t.value; stuPrefSave(); clearTimeout(window.__stuTg); window.__stuTg=setTimeout(()=>stuDraw(),400); } });

/* ---- Au démarrage : on récupère la copie IndexedDB si elle est plus récente ou si localStorage était plein ---- */
async function bigLoad(){
  let changed=false;
  for(const [k,get,set] of [[KEY,()=>games,v=>{ games=v; }],[KEYFO,()=>foot,v=>{ foot=v; _fidx=null; }]]){
    try{ const rec=await idbGet(k); const lt=+(localStorage.getItem('suivi-ts-'+k)||0), has=!!localStorage.getItem(k);
      if(rec&&rec.v&&(rec.t>lt+2000||!has)){ set(rec.v); changed=true; }
      else if(!rec&&has){ idbSet(k,{t:lt||Date.now(),v:get()}).catch(()=>{}); } }catch(e){} }
  if(changed){ try{ render(); }catch(e){} }
  return changed;
}
/* ---- Mise à jour automatique à l'ouverture (et au retour dans l'appli) ---- */
async function footAuto(force){
  if(footBusy||(navigator.onLine===false)) return false; const now=Date.now(), day=864e5;
  const have=Object.keys(foot.leagues||{}).filter(lg=>FLG.some(([c])=>c===lg)), L=have.length?have:FLG.map(x=>x[0]);
  if(!force&&now-(foot.autoAt||0)<10*6e4) return false;
  footBusy=true; foot.autoAt=now; let ok=0, stop=false, n=0;
  const f=t=>new Date(t).toISOString().slice(0,10).replace(/-/g,''), get=async x=>{ try{ const d=await footGet(x.u); if(x.k==='summary'){ footIngest({__foot:'summary',league:x.lg,id:x.id,data:d}); n++; } else ok+=footIngest({__foot:x.k,league:x.lg,data:d}); }catch(e){ if(/HTTP 4(03|29)/.test(e.message||'')) stop=true; } };
  const sb=(lg,a)=>({k:'scores',lg,u:`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${f(now+a*day)}`});
  const pool=async(list,k)=>{ let i=0; await Promise.all(Array.from({length:Math.min(k,list.length)},async()=>{ while(i<list.length&&!stop){ const x=list[i++]; await get(x); } })); };
  try{
    // 1) d'abord hier / aujourd'hui / demain : tout part en même temps, on affiche dès que c'est là
    await pool(L.flatMap(lg=>[-1,0,1].map(a=>sb(lg,a))),12); _fidx=null; try{ render(); }catch(e){}
    // 2) puis le reste en arrière-plan : classements, autres jours, détails des matchs finis
    await pool([...L.map(lg=>({k:'standings',lg,u:`https://site.api.espn.com/apis/v2/sports/soccer/${lg}/standings`})),...L.flatMap(lg=>[-3,-2,2,3,4,5,6,7].map(a=>sb(lg,a)))],8); _fidx=null; try{ render(); }catch(e){}
    const todo=Object.entries(foot.leagues).flatMap(([lg,Lg])=>Object.values(Lg.matches).filter(m=>m.done&&((!m.x&&!m.nx)||m.lv)&&now-Date.parse(m.d)<10*day).map(m=>({lg,m}))).sort((a,b)=>Date.parse(b.m.d)-Date.parse(a.m.d)).slice(0,30);
    await pool(todo.map(t=>({k:'summary',lg:t.lg,u:`https://site.api.espn.com/apis/site/v2/sports/soccer/${t.lg}/summary?event=${t.m.id}`,id:t.m.id})).map(x=>({...x,__s:1})),4).catch(()=>{});
    if(ok) footSave(); _fidx=null;
  } finally { footBusy=false; autoBadge(''); try{ render(); }catch(e){} }
  return ok>0;
}
async function nbaAuto(force){
  const last=+(localStorage.getItem('suivi-nba-auto')||0); if(!force&&Date.now()-last<30*6e4) return; if(navigator.onLine===false||nbaBusy) return;
  try{ localStorage.setItem('suivi-nba-auto',String(Date.now())); }catch(e){}
  sayMute=ui.sport==='foot'; try{ await nbaRefresh(); }catch(e){}
  try{ const m=await nbaCheck(); if(m>0){ const lk=loadJ('suivi-nba-chk',{}); if(!(lk.m===m&&Date.now()-lk.t<6*36e5)){ saveJ('suivi-nba-chk',{m,t:Date.now()}); try{ localStorage.removeItem('suivi-nba-bf'); }catch(e){} await nbaRefresh(); } } }catch(e){} finally{ sayMute=false; }
}
/* Contrôle : compare le nombre de matchs en mémoire au bilan V-D officiel (classement ESPN) ; renvoie le nombre de matchs manquants */
async function nbaCheck(){
  const r=await fetch('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings',{cache:'no-store'}); if(!r.ok) return 0; const j=await r.json(), rec={};
  const walk=(o,d)=>{ if(!o||typeof o!=='object'||d>9) return; if(o.team&&Array.isArray(o.stats)){ const g=n=>{ const x=o.stats.find(z=>z.name===n); return x?+x.value:NaN; }; const w=g('wins'), l=g('losses'); if(Number.isFinite(w)&&Number.isFinite(l)) rec[etri(o.team.abbreviation)]=w+l; } for(const k in o) walk(o[k],d+1); };
  walk(j,0); if(Object.keys(rec).length<20) return 0;
  const have={}; for(const g of Object.values(games)) if(g.status===3){ have[g.home.tri]=(have[g.home.tri]||0)+1; have[g.away.tri]=(have[g.away.tri]||0)+1; }
  let miss=0; for(const t in rec) miss+=Math.max(0,rec[t]-(have[t]||0)); return miss;
}
function autoBadge(t){ let el=document.getElementById('autoBadge'); if(!el){ el=document.createElement('div'); el.id='autoBadge'; document.body.appendChild(el); } el.textContent=t; el.classList.toggle('on',!!t); }
var autoHidden=0;
async function autoRun(){ autoBadge('🔄 Mise à jour…'); try{ liveFetch(false); }catch(e){} await Promise.all([footAuto().catch(()=>{}),nbaAuto().catch(()=>{})]); autoBadge(''); }
document.addEventListener('visibilitychange',()=>{ if(document.hidden){ autoHidden=Date.now(); bigFlush(); } else if(autoHidden&&Date.now()-autoHidden>5*6e4) autoRun(); });
window.addEventListener('pagehide',bigFlush);
setTimeout(async()=>{ try{ await Promise.race([bigLoad(),new Promise(r=>setTimeout(r,1200))]); }catch(e){} try{ if(dedupeGames()){ save(); render(); } }catch(e){} autoRun(); },0);