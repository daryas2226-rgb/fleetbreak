(() => {
"use strict";

const BOARD=10, FLEET=[4,3,3,2,2,2,1,1,1,1];
const K_GAME="fleetbreak_game_v2", K_STATS="fleetbreak_stats_v2";
const $=s=>document.querySelector(s), app=$("#app"), toastEl=$("#toast");
const diffName={easy:"Новичок",medium:"Тактик",hard:"Адмирал"};
let timer=null;

const key=(r,c)=>`${r}:${c}`, inside=(r,c)=>r>=0&&r<BOARD&&c>=0&&c<BOARD;
const fresh=(difficulty="medium")=>({phase:"home",difficulty,playerShips:[],aiShips:[],playerShots:[],aiShots:[],turn:"player",winner:null,orientation:"h",selectedSize:4,startedAt:null});
const load=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}};
let game=load(K_GAME,fresh()), records=load(K_STATS,[]);
const save=()=>{localStorage.setItem(K_GAME,JSON.stringify(game));localStorage.setItem(K_STATS,JSON.stringify(records))};
const escapeHTML=s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
function toast(msg){toastEl.textContent=msg;toastEl.classList.remove("hidden");clearTimeout(timer);timer=setTimeout(()=>toastEl.classList.add("hidden"),1700)}

function around(cells){
  const out=new Set();
  cells.forEach(({r,c})=>{for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const nr=r+dr,nc=c+dc;if(inside(nr,nc))out.add(key(nr,nc))}});
  return out;
}
function canPlace(ships,cells){
  if(cells.some(p=>!inside(p.r,p.c)))return false;
  const banned=new Set();ships.forEach(s=>around(s.cells).forEach(x=>banned.add(x)));
  return !cells.some(p=>banned.has(key(p.r,p.c)));
}
function makeShip(size,cells){return{id:`s${size}-${Math.random().toString(36).slice(2,9)}`,size,cells,hits:[]}}
function autoFleet(){
  const ships=[];
  for(const size of FLEET){
    let ok=false;
    for(let guard=0;guard<3000&&!ok;guard++){
      const o=Math.random()<.5?"h":"v",r=Math.floor(Math.random()*10),c=Math.floor(Math.random()*10);
      const cells=Array.from({length:size},(_,i)=>({r:r+(o==="v"?i:0),c:c+(o==="h"?i:0)}));
      if(canPlace(ships,cells)){ships.push(makeShip(size,cells));ok=true}
    }
    if(!ok)return autoFleet();
  }
  return ships;
}
function shipAt(ships,r,c){return ships.find(s=>s.cells.some(p=>p.r===r&&p.c===c))}
function fire(ships,shots,r,c){
  if(shots.some(s=>s.r===r&&s.c===c))return null;
  const ship=shipAt(ships,r,c);
  if(!ship)return{ships,shot:{r,c,result:"miss"}};
  const hk=key(r,c);
  const next=ships.map(s=>s.id===ship.id&&!s.hits.includes(hk)?{...s,hits:[...s.hits,hk]}:s);
  const u=next.find(s=>s.id===ship.id),sunk=u.hits.length===u.size;
  return{ships:next,shot:{r,c,result:sunk?"sunk":"hit",shipId:ship.id}};
}
const allSunk=ships=>ships.length&&ships.every(s=>s.hits.length===s.size);
const neighbors=(r,c)=>[[-1,0],[1,0],[0,-1],[0,1]].map(([dr,dc])=>({r:r+dr,c:c+dc})).filter(p=>inside(p.r,p.c));
function randomFree(shots){
  const used=new Set(shots.map(s=>key(s.r,s.c))),a=[];
  for(let r=0;r<10;r++)for(let c=0;c<10;c++)if(!used.has(key(r,c)))a.push({r,c});
  return a[Math.floor(Math.random()*a.length)];
}
function aiEasy(shots){return randomFree(shots)}
function aiMedium(shots){
  const used=new Set(shots.map(s=>key(s.r,s.c)));
  for(const h of [...shots].reverse().filter(s=>s.result==="hit")){
    const a=neighbors(h.r,h.c).filter(p=>!used.has(key(p.r,p.c)));
    if(a.length)return a[Math.floor(Math.random()*a.length)];
  }
  return randomFree(shots);
}
function unresolvedGroups(shots){
  const hs=shots.filter(s=>s.result==="hit"),set=new Set(hs.map(s=>key(s.r,s.c))),seen=new Set(),groups=[];
  for(const h of hs){const hk=key(h.r,h.c);if(seen.has(hk))continue;const q=[{r:h.r,c:h.c}],g=[];seen.add(hk);
    while(q.length){const cur=q.shift();g.push(cur);for(const n of neighbors(cur.r,cur.c)){const nk=key(n.r,n.c);if(set.has(nk)&&!seen.has(nk)){seen.add(nk);q.push(n)}}}groups.push(g)}
  return groups;
}
function aiHard(shots){
  const used=new Set(shots.map(s=>key(s.r,s.c))),groups=unresolvedGroups(shots);
  if(groups.length){
    const g=groups[groups.length-1];let cand=[];
    if(g.length>=2){
      if(g.every(p=>p.r===g[0].r)){const cs=g.map(p=>p.c).sort((a,b)=>a-b);cand=[{r:g[0].r,c:cs[0]-1},{r:g[0].r,c:cs[cs.length-1]+1}]}
      else if(g.every(p=>p.c===g[0].c)){const rs=g.map(p=>p.r).sort((a,b)=>a-b);cand=[{r:rs[0]-1,c:g[0].c},{r:rs[rs.length-1]+1,c:g[0].c}]}
    }
    if(!cand.length)cand=g.flatMap(p=>neighbors(p.r,p.c));
    cand=cand.filter(p=>inside(p.r,p.c)&&!used.has(key(p.r,p.c)));
    if(cand.length)return cand[Math.floor(Math.random()*cand.length)];
  }
  const remaining=[4,3,3,2,2,2,1,1,1,1];
  const sunkById=new Map();
  shots.filter(s=>s.result==="sunk"&&s.shipId).forEach(s=>sunkById.set(s.shipId,(sunkById.get(s.shipId)||0)+1));
  [...sunkById.values()].forEach(size=>{const i=remaining.indexOf(size);if(i>=0)remaining.splice(i,1)});
  const score=Array.from({length:10},()=>Array(10).fill(0));
  for(const size of remaining)for(const o of ["h","v"])for(let r=0;r<10;r++)for(let c=0;c<10;c++){
    const cells=Array.from({length:size},(_,i)=>({r:r+(o==="v"?i:0),c:c+(o==="h"?i:0)}));
    if(cells.some(p=>!inside(p.r,p.c)))continue;
    if(cells.some(p=>{const s=shots.find(x=>x.r===p.r&&x.c===p.c);return s&&(s.result==="miss"||s.result==="sunk")}))continue;
    cells.forEach(p=>{if(!used.has(key(p.r,p.c)))score[p.r][p.c]++});
  }
  let max=-1,best=[];for(let r=0;r<10;r++)for(let c=0;c<10;c++){if(used.has(key(r,c)))continue;if(score[r][c]>max){max=score[r][c];best=[{r,c}]}else if(score[r][c]===max)best.push({r,c})}
  return best[Math.floor(Math.random()*best.length)]||randomFree(shots);
}
const aiTarget=()=>game.difficulty==="easy"?aiEasy(game.aiShots):game.difficulty==="medium"?aiMedium(game.aiShots):aiHard(game.aiShots);

function boardHTML(ships,shots,{hide=false,interactive=false,setup=false}={}){
  const shipMap=new Map();ships.forEach(s=>s.cells.forEach(p=>shipMap.set(key(p.r,p.c),s)));
  const shotMap=new Map(shots.map(s=>[key(s.r,s.c),s]));
  let h='<div class="boardWrap"><div class="corner"></div>';
  for(let c=0;c<10;c++)h+=`<div class="axis">${String.fromCharCode(65+c)}</div>`;
  for(let r=0;r<10;r++){h+=`<div class="axis">${r+1}</div>`;for(let c=0;c<10;c++){
    const s=shipMap.get(key(r,c)),shot=shotMap.get(key(r,c)),sunk=s&&s.hits.length===s.size;
    const cls=["cell"];if(s&&!hide)cls.push("ownShip");if(shot?.result==="miss")cls.push("miss");if(shot&&(shot.result==="hit"||shot.result==="sunk"))cls.push("hit");if(shot?.result==="sunk"||(sunk&&shot))cls.push("sunk");if(interactive||setup)cls.push("interactive");
    h+=`<button class="${cls.join(" ")}" data-r="${r}" data-c="${c}" ${!(interactive||setup)?"disabled":""} aria-label="${String.fromCharCode(65+c)}${r+1}">${shot?.result==="miss"?"•":shot&&(shot.result==="hit"||shot.result==="sunk")?"×":""}</button>`;
  }}return h+"</div>";
}
function remaining(ships){return ships.filter(s=>s.hits.length<s.size).length}
function statsCalc(){
  const total=records.length,wins=records.filter(x=>x.won).length;
  return{total,wins,losses:total-wins,wr:total?Math.round(wins/total*100):0,avg:total?Math.round(records.reduce((a,x)=>a+x.accuracy,0)/total):0};
}
function analyze(shots){
  const hits=shots.filter(s=>s.result==="hit"||s.result==="sunk").length,acc=shots.length?Math.round(hits/shots.length*100):0;
  let good=0,far=0;for(let i=1;i<shots.length;i++)if(shots[i-1].result==="hit"){const d=Math.abs(shots[i-1].r-shots[i].r)+Math.abs(shots[i-1].c-shots[i].c);if(d===1)good++;if(d>3)far++}
  const m=[];
  if(acc>=35)m.push(["Высокая точность",`${acc}% попаданий — сильный результат для поля 10×10.`]);
  else if(acc>=25)m.push(["Стабильная стрельба",`Точность ${acc}%. Чуть больше системности — и партия станет короче.`]);
  else m.push(["Есть резерв",`Точность ${acc}%. Начинай поиск более равномерным шахматным паттерном.`]);
  m.push(good>=far?["Хорошее добивание","После попаданий ты чаще проверяла соседние клетки и не теряла найденный корабль."]:["Не теряй контакт","После попадания сначала проверяй соседние клетки, а уже потом меняй сектор."]);
  const zones=new Set(shots.map(s=>`${Math.floor(s.r/5)}:${Math.floor(s.c/5)}`)).size;
  m.push(zones>=4?["Поле под контролем","Ты распределяла поиск по разным секторам поля."]:["Расширь поиск","Не задерживайся слишком долго в одной четверти поля, если там нет контакта."]);
  return{hits,acc,m};
}
function markSunkShots(shots,shipId){return shots.map(s=>s.shipId===shipId&&s.result==="hit"?{...s,result:"sunk"}:s)}
function recordFinish(winner){
  game.winner=winner;game.phase="result";
  const a=analyze(game.playerShots);
  records.unshift({id:Math.random().toString(36).slice(2),at:Date.now(),won:winner==="player",difficulty:game.difficulty,shots:game.playerShots.length,hits:a.hits,accuracy:a.acc});
  records=records.slice(0,50);save();
  if(winner==="player")celebrate();
  render();
}
function celebrate(){
  const end=Date.now()+1000;
  const interval=setInterval(()=>{if(Date.now()>end){clearInterval(interval);return}
    for(let i=0;i<7;i++){const el=document.createElement("div");el.textContent=["✦","•","⚓"][Math.floor(Math.random()*3)];el.style.cssText=`position:fixed;z-index:99;left:${Math.random()*100}vw;top:-20px;color:${Math.random()>.5?"#51d3ff":"#ffcf66"};font-size:${12+Math.random()*18}px;pointer-events:none;transition:transform 1.1s linear,opacity 1.1s;`;document.body.append(el);requestAnimationFrame(()=>{el.style.transform=`translate(${(Math.random()-.5)*120}px,${innerHeight+80}px) rotate(${Math.random()*600}deg)`;el.style.opacity="0"});setTimeout(()=>el.remove(),1200)}
  },80);
}
function startNew(d){game=fresh(d);game.phase="setup";game.difficulty=d;game.aiShips=autoFleet();save();render()}
function nextAvailable(){
  for(const size of [4,3,2,1])if(game.playerShips.filter(s=>s.size===size).length<FLEET.filter(x=>x===size).length)return size;return null;
}
function manualPlace(r,c){
  const size=game.selectedSize;if(!size)return;
  const required=FLEET.filter(x=>x===size).length,placed=game.playerShips.filter(s=>s.size===size).length;if(placed>=required)return toast("Все корабли этого размера уже размещены");
  const cells=Array.from({length:size},(_,i)=>({r:r+(game.orientation==="v"?i:0),c:c+(game.orientation==="h"?i:0)}));
  if(!canPlace(game.playerShips,cells))return toast("Здесь корабль размещать нельзя");
  game.playerShips.push(makeShip(size,cells));game.selectedSize=nextAvailable();save();render();
}
function begin(){if(game.playerShips.length!==10)return toast("Сначала размести весь флот");game.phase="battle";game.turn="player";game.winner=null;game.playerShots=[];game.aiShots=[];game.startedAt=Date.now();save();render()}
function playerShoot(r,c){
  if(game.phase!=="battle"||game.turn!=="player")return;
  if(game.playerShots.some(s=>s.r===r&&s.c===c))return toast("Ты уже стреляла сюда");
  const res=fire(game.aiShips,game.playerShots,r,c);game.aiShips=res.ships;game.playerShots.push(res.shot);
  if(res.shot.result==="sunk"){game.playerShots=markSunkShots(game.playerShots,res.shot.shipId);toast("Корабль уничтожен!")}else if(res.shot.result==="hit")toast("Попадание!");
  if(allSunk(game.aiShips))return recordFinish("player");
  game.turn="ai";save();render();setTimeout(aiMove,430);
}
function aiMove(){
  if(game.phase!=="battle"||game.turn!=="ai")return;
  const t=aiTarget(),res=fire(game.playerShips,game.aiShots,t.r,t.c);game.playerShips=res.ships;game.aiShots.push(res.shot);
  if(res.shot.result==="sunk")game.aiShots=markSunkShots(game.aiShots,res.shot.shipId);
  if(allSunk(game.playerShips))return recordFinish("ai");
  game.turn="player";save();render();
}
function home(){
  const hasSaved=game.playerShips.length>0&&!game.winner;
  return `<main class="page home"><section class="hero">
    <div class="brand"><div class="brandMark">⚓</div><span>FleetBreak</span></div>
    <div class="eyebrow">BATTLESHIP REIMAGINED</div><h1>10 минут.<br><span>Два флота.</span><br>Один победитель.</h1>
    <p class="lead">Современный морской бой для короткой передышки между парами. Выбери сложность, расставь флот и переиграй AI.</p>
    <div class="difficultyCards">
      ${[["easy","≈","Новичок","Случайные ходы"],["medium","⌖","Тактик","Добивает после попадания"],["hard","◉","Адмирал","Вероятностный поиск"]].map(([d,ic,n,s])=>`<button class="difficultyCard ${d}" data-action="new" data-diff="${d}"><div class="diffIcon">${ic}</div><strong>${n}</strong><small>${s}</small></button>`).join("")}
    </div>
    ${hasSaved?`<button class="secondary wide" data-action="continue">Продолжить сохранённую игру</button>`:""}
    <button class="textButton" data-action="stats">▥ Моя статистика</button>
  </section>
  <section class="featureStrip"><div><span class="ficon">⌖</span><strong>3 режима AI</strong><span>От случайного до вероятностного поиска</span></div><div><span class="ficon">↻</span><strong>Автосохранение</strong><span>Продолжай после обновления страницы</span></div><div><span class="ficon">✦</span><strong>Battle Analysis</strong><span>Разбор тактики после матча</span></div></section></main>`;
}
function setup(){
  const count=size=>FLEET.filter(x=>x===size).length-game.playerShips.filter(s=>s.size===size).length;
  return `<main class="page"><header class="topbar"><button class="iconButton" data-action="home">←</button><div><span class="muted">ПОДГОТОВКА</span><h2>Расставь свой флот</h2></div><span class="pill ${game.difficulty}">${diffName[game.difficulty]}</span></header>
  <section class="setupLayout"><div class="panel boardPanel">${boardHTML(game.playerShips,[],{setup:true})}</div><aside class="panel controls"><h3>Корабли</h3><div class="shipChoices">
  ${[4,3,2,1].map(size=>`<button class="shipChoice ${game.selectedSize===size?"active":""}" data-action="size" data-size="${size}" ${count(size)<=0?"disabled":""}><span>${Array.from({length:size},()=>"<i></i>").join("")}</span><b>${size} ${size===1?"клетка":"клетки"}</b><small>× ${count(size)}</small></button>`).join("")}</div>
  <div class="segmented"><button data-action="orient" data-o="h" class="${game.orientation==="h"?"active":""}">↔ Горизонтально</button><button data-action="orient" data-o="v" class="${game.orientation==="v"?"active":""}">↕ Вертикально</button></div>
  <button class="secondary" data-action="auto">⤨ Расставить автоматически</button><button class="textButton" data-action="clear">Очистить поле</button>
  <div class="ruleBox"><strong>Правило FleetBreak</strong><span>Корабли не могут соприкасаться даже углами.</span></div>
  <button class="primary" data-action="begin" ${game.playerShips.length!==10?"disabled":""}>Начать бой ⌖</button></aside></section></main>`;
}
function battle(){
  const pr=remaining(game.playerShips),ar=remaining(game.aiShips);
  return `<main class="page"><header class="topbar battleTop"><div class="brand compact"><div class="brandMark">⚓</div><span>FleetBreak</span></div><div class="turnBadge ${game.turn==="ai"?"ai":""}">${game.turn==="player"?"ТВОЙ ХОД":"AI ДУМАЕТ…"}</div><span class="pill ${game.difficulty}">${diffName[game.difficulty]}</span></header>
  <section class="scorebar"><div><span>Твой флот</span><strong>${pr}<small>/10</small></strong></div><div class="scoreLine"><i style="width:${pr*10}%"></i></div><div class="scoreVs">VS</div><div class="scoreLine enemy"><i style="width:${ar*10}%"></i></div><div class="right"><span>Флот AI</span><strong>${ar}<small>/10</small></strong></div></section>
  <section class="battleGrid"><div class="battleBoard"><div class="boardTitle"><span>МОЙ ФЛОТ</span><small>${game.aiShots.length} выстрелов AI</small></div>${boardHTML(game.playerShips,game.aiShots)}</div>
  <div class="battleBoard enemyBoard"><div class="boardTitle"><span>ФЛОТ ПРОТИВНИКА</span><small>${game.playerShots.length} твоих выстрелов</small></div>${boardHTML(game.aiShips,game.playerShots,{hide:true,interactive:game.turn==="player"})}</div></section>
  <div class="battleHint">⌖ ${game.turn==="player"?"Выбери клетку на поле противника":"Противник выбирает цель…"}</div></main>`;
}
function result(){
  const a=analyze(game.playerShots),won=game.winner==="player";
  return `<main class="page resultPage"><section class="resultHero ${won?"win":"lose"}"><div class="resultIcon">${won?"🏆":"🔥"}</div><div class="eyebrow">${won?"МИССИЯ ВЫПОЛНЕНА":"ФЛОТ УНИЧТОЖЕН"}</div><h1>${won?"Победа!":"Поражение"}</h1><p>${won?"Ты уничтожила весь флот противника.":"AI оказался быстрее. Разбор уже готов."}</p></section>
  <section class="metrics"><div><strong>${game.playerShots.length}</strong><span>выстрелов</span></div><div><strong>${a.hits}</strong><span>попаданий</span></div><div><strong>${a.acc}%</strong><span>точность</span></div><div><strong>${diffName[game.difficulty]}</strong><span>сложность</span></div></section>
  <section class="analysis panel"><div class="sectionTitle"><span class="sicon">✦</span><div><span>BATTLE ANALYSIS</span><h2>Тактический разбор</h2></div></div><div class="analysisCards">${a.m.map((m,i)=>`<div class="analysisCard"><span>${i+1}</span><div><strong>${escapeHTML(m[0])}</strong><p>${escapeHTML(m[1])}</p></div></div>`).join("")}</div></section>
  <div class="resultActions"><button class="primary" data-action="replay">↻ Сыграть ещё</button><button class="secondary" data-action="stats">▥ Статистика</button><button class="textButton" data-action="reset-home">На главную</button></div></main>`;
}
function stats(){
  const s=statsCalc();
  return `<main class="page"><header class="topbar"><button class="iconButton" data-action="home">←</button><div><span class="muted">ПРОГРЕСС</span><h2>Моя статистика</h2></div><div></div></header>
  <section class="metrics"><div><strong>${s.total}</strong><span>игр</span></div><div><strong>${s.wins}</strong><span>побед</span></div><div><strong>${s.wr}%</strong><span>win rate</span></div><div><strong>${s.avg}%</strong><span>ср. точность</span></div></section>
  <section class="panel history"><div class="sectionTitle"><span class="sicon">▥</span><div><span>ИСТОРИЯ</span><h2>Последние партии</h2></div></div>${!records.length?`<div class="emptyState">Здесь появятся результаты после первой завершённой партии.</div>`:`<div class="historyList">${records.slice(0,10).map(r=>`<div class="historyRow"><div class="resultDot ${r.won?"win":"lose"}"></div><div><strong>${r.won?"Победа":"Поражение"}</strong><small>${new Date(r.at).toLocaleString("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</small></div><span class="pill ${r.difficulty}">${diffName[r.difficulty]}</span><div class="historyMetric"><strong>${r.shots}</strong><small>выстр.</small></div><div class="historyMetric"><strong>${r.accuracy}%</strong><small>точн.</small></div></div>`).join("")}</div>`}</section>
  <button class="primary centered" data-action="new" data-diff="medium">Новая игра</button></main>`;
}
function render(){
  save();
  app.innerHTML=game.phase==="home"?home():game.phase==="setup"?setup():game.phase==="battle"?battle():game.phase==="result"?result():stats();
  bind();
}
function bind(){
  app.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click",()=>{
    const a=el.dataset.action;
    if(a==="new")startNew(el.dataset.diff);
    else if(a==="continue"){game.phase=game.startedAt?"battle":"setup";render()}
    else if(a==="stats"){game.phase="stats";render()}
    else if(a==="home"){game.phase="home";render()}
    else if(a==="size"){game.selectedSize=Number(el.dataset.size);render()}
    else if(a==="orient"){game.orientation=el.dataset.o;render()}
    else if(a==="auto"){game.playerShips=autoFleet();game.selectedSize=null;render()}
    else if(a==="clear"){game.playerShips=[];game.selectedSize=4;render()}
    else if(a==="begin")begin();
    else if(a==="replay")startNew(game.difficulty);
    else if(a==="reset-home"){game=fresh(game.difficulty);render()}
  }));
  if(game.phase==="setup")app.querySelectorAll(".cell.interactive").forEach(el=>el.addEventListener("click",()=>manualPlace(Number(el.dataset.r),Number(el.dataset.c))));
  if(game.phase==="battle"&&game.turn==="player")app.querySelectorAll(".enemyBoard .cell.interactive").forEach(el=>el.addEventListener("click",()=>playerShoot(Number(el.dataset.r),Number(el.dataset.c))));
}
if(game.phase==="battle"&&game.turn==="ai")setTimeout(aiMove,350);
render();
})();
