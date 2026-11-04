// ============================================================
//  웻지 포지션 배치 프로그램 - 계산/화면 코드
//  일반적인 설정 변경은 config.js에서 하세요. 이 파일은 계산 규칙을 바꿀 때만 수정합니다.
//
//  좌표 기준: x = 포지션(cm, 웨이퍼 중앙 0, 쿠폰 중심 기준)
//            자 눈금 = 자 중앙 눈금(rulerCenter) + 포지션
//  계산 규칙 요약
//   - 쿠폰 재단 크기 = 샘플 크기 + 2 × 여유 마진
//   - 이웃 쿠폰(마진 포함)이 겹치면 하나의 긴 쿠폰으로 합치고,
//     두 샘플 사이 간격을 반씩 나눠 각 샘플의 마진으로 계산
//   - 샘플(측정 영역) 자체가 겹치면 한 런에서 불가능으로 표시
//   - 두께로 입력하면 웻지 두께 계산식(config.js의 guns)을 거꾸로 풀어 포지션을 구함
// ============================================================
(function(){
const C = window.CONFIG || {};
const R = C.waferRadius ?? 15;          // 웨이퍼 반지름(cm)
const RULER_LEN = C.rulerLength ?? 30;  // 자 길이(cm)
const RANGE = C.reliableRange ?? 10;    // 공정 신뢰 포지션 범위(±cm)
const $ = id => document.getElementById(id);
// 1 decimal by default; 2 decimals only when the value actually needs it
const fmt = (v) => { if(v==null||!isFinite(v)) return '–'; const r2=Math.round(v*100)/100; return Math.abs(r2*10-Math.round(r2*10))<1e-6 ? r2.toFixed(1) : r2.toFixed(2); };
const short = v => String(Math.round(v*100)/100);
const pTxt = v => (v>0?'+':'') + short(v);
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// 화면 입력값 (처음 값은 config.js에서 가져옴)
const SIZES = (C.sampleSizes && C.sampleSizes.length) ? C.sampleSizes : [1, 1.2];
let S = {proc:C.defaultProcess ?? '', fSel:String(SIZES[0]), fCustom:SIZES[0], useM:C.defaultUseMargin ?? true, m:C.defaultMargin ?? 0.5,
  pos:C.defaultPositions ?? '', rulerC:C.rulerCenter ?? 15, gap:C.minCouponGap ?? 0, kerf:C.minSampleGap ?? 0,
  mergeMode:C.mergeMode ?? 'long', minM:C.sideDepoWarn ?? 0.3,
  mode:C.defaultMode ?? 'thk', thk:C.defaultThicknesses ?? '', gun:C.defaultGun ?? 'Gun2', centers:{}, step:String(C.positionStep ?? 0.1)};

// ---------- 웻지 두께 계산식 (엑셀 Gun 시트와 동일) ----------
const GUNS = (C.guns && C.guns.length) ? C.guns : [];
const gunOf = id => GUNS.find(g=>g.id===id) || GUNS[0];
const centerOf = g => { const v=+S.centers[g.id]; return v>0 ? v : g.center; };
function thkAt(g, x, center){
  const th=g.angle*Math.PI/180;
  const r=Math.hypot(g.R0*Math.cos(th)-x, g.R0*Math.sin(th));   // 타깃까지 거리 (y = 0 선 위)
  const [a4,a3,a2,a1,a0]=g.poly||[0,0,0,0,0];
  return center*(1+a4*r**4+a3*r**3+a2*r**2+a1*r+a0)*(g.la*r+g.lb);
}
// 목표 두께가 나오는 포지션 찾기 (-R ~ +R에서 모든 해를 찾고, 신뢰 범위 안 + 중심에 가까운 해를 고름)
function posFor(g, t, center){
  const F=x=>thkAt(g,x,center)-t, roots=[], h=0.05;
  for(let x=-R; x<R-1e-9; x+=h){
    let a=x, b=Math.min(R,x+h), fa=F(a), fb=F(b);
    if(fa===0){ roots.push(a); continue; }
    if(fa*fb<0){ for(let k=0;k<60;k++){ const mid=(a+b)/2, fm=F(mid); if(fa*fm<=0){b=mid;fb=fm;}else{a=mid;fa=fm;} } roots.push((a+b)/2); }
  }
  if(!roots.length) return null;
  roots.sort((u,v)=> ((Math.abs(u)>RANGE)-(Math.abs(v)>RANGE)) || Math.abs(u)-Math.abs(v));
  return roots[0];
}
function thkRange(g, center, lim){ let lo=Infinity, hi=-Infinity; for(let x=-lim;x<=lim+1e-9;x+=0.1){ const t=thkAt(g,x,center); lo=Math.min(lo,t); hi=Math.max(hi,t);} return [lo,hi]; }
const f3 = v => (v==null||!isFinite(v)) ? '–' : v.toFixed(3);
// 샘플 크기 선택 목록 만들기
SIZES.forEach(v=>{ const o=document.createElement('option'); o.value=String(v); o.textContent=`${Number(v).toFixed(1)} × ${Number(v).toFixed(1)}`; $('fSel').appendChild(o); });
{ const o=document.createElement('option'); o.value='c'; o.textContent='직접 입력'; $('fSel').appendChild(o); }
try{ const s=JSON.parse(localStorage.getItem('wedge-planner-v3')); if(s&&typeof s.pos==='string') S=Object.assign(S,s); if(S.fSel!=='c' && !SIZES.map(String).includes(S.fSel)) S.fSel=String(SIZES[0]); }catch(e){}
const save=()=>{ try{ localStorage.setItem('wedge-planner-v3', JSON.stringify(S)); }catch(e){} };

// ---------- 1. 입력 연결 ----------
$('proc').value=S.proc; $('fSel').value=S.fSel; $('fCustom').value=S.fCustom; $('useM').checked=S.useM; $('mVal').value=S.m; $('pos').value=S.pos;
[['rulerC','rulerC'],['gap','gap'],['kerf','kerf'],['minM','minM']].forEach(([id,k])=>{ $(id).value=S[k]; $(id).onchange=e=>{S[k]=+e.target.value||0; recompute();}; });
$('mergeMode').value=S.mergeMode; $('mergeMode').onchange=e=>{S.mergeMode=e.target.value; recompute();};
$('proc').oninput=e=>{S.proc=e.target.value.trim().replace(/^#/,''); recompute();};
$('fSel').onchange=e=>{S.fSel=e.target.value; recompute();};
$('fCustom').oninput=e=>{S.fCustom=Math.max(0.1,+e.target.value||1); recompute();};
$('useM').onchange=e=>{S.useM=e.target.checked; recompute();};
$('mVal').oninput=e=>{S.m=Math.max(0,+e.target.value||0); recompute();};
$('pos').oninput=e=>{ if(S.mode==='thk') S.thk=e.target.value; else S.pos=e.target.value; recompute();};
GUNS.forEach(g=>{ const o=document.createElement('option'); o.value=g.id; o.textContent=g.label; $('gun').appendChild(o); });
if(!GUNS.some(g=>g.id===S.gun) && GUNS.length) S.gun=GUNS[0].id;
const syncInputs=()=>{ $('mode').value=S.mode; $('gun').value=S.gun; $('center').value=centerOf(gunOf(S.gun)); $('step').value=S.step;
  $('pos').value = S.mode==='thk' ? S.thk : S.pos;
  $('pos').placeholder = S.mode==='thk' ? '1.0, 1.1, 1.2, 1.25' : '-8, -5.5, -3, -1.5, +0.5, +5.5';
  $('listLabel').textContent = S.mode==='thk' ? '목표 두께 목록 (nm, 쉼표나 공백으로 구분)' : '포지션 목록 (쉼표나 공백으로 구분)'; };
$('mode').onchange=e=>{S.mode=e.target.value; syncInputs(); recompute();};
$('gun').onchange=e=>{S.gun=e.target.value; syncInputs(); recompute();};
$('center').oninput=e=>{ const v=+e.target.value; if(v>0){ S.centers[S.gun]=v; recompute(); } };
$('step').onchange=e=>{S.step=e.target.value; recompute();};
syncInputs();

const finalSize=()=> S.fSel==='c' ? Math.max(0.1,+S.fCustom||1) : +S.fSel;
const margin=()=> S.useM ? Math.max(0,+S.m||0) : 0;
const parseNums = txt => String(txt).replace(/[−–]/g,'-').split(/[\s,;]+/).filter(x=>x!=='').map(Number).filter(isFinite);
// 입력을 샘플 목록으로: [{p: 포지션, target: 목표 두께 또는 null}]
function getEntries(msgs){
  if(S.mode!=='thk') return parseNums(S.pos).map(p=>({p, target:null}));
  const g=gunOf(S.gun), c=centerOf(g), step=+S.step, out=[];
  if(!g) return out;
  parseNums(S.thk).forEach(t=>{
    if(!(t>0)) return;
    const x=posFor(g,t,c);
    if(x==null){ const [lo,hi]=thkRange(g,c,R); msgs.push(['bad',`목표 두께 ${t} nm는 웨이퍼 위(±${R} cm)에서 나오지 않아요. 이 조건에서 가능한 두께는 ${f3(lo)} ~ ${f3(hi)} nm예요. 중심 두께를 바꾸거나 다른 건을 쓰세요.`]); return; }
    const p = step>0 ? Math.round(x/step)*step : Math.round(x*1000)/1000;
    out.push({p:Math.round(p*1000)/1000, target:t});
  });
  return out;
}
const nameOf = p => (S.proc? '#'+S.proc+'_' : '') + pTxt(p);

// ---------- 2. 배치 계산 (겹침 검사, 긴 쿠폰 합치기, 마진 자동 계산) ----------
function layout(){
  const f=finalSize(), m=margin(), msgs=[];
  const g=gunOf(S.gun), c=g?centerOf(g):0;
  const items=getEntries(msgs).map((e,i)=>({i, p:e.p, target:e.target, thk: g? thkAt(g,e.p,c) : null, name:nameOf(e.p), f, m, mL:m, mR:m, w:f+2*m, status:[], group:null}));
  const placed=[...items].sort((a,b)=>a.p-b.p);
  const links=[];
  for(let k=0;k<placed.length-1;k++){
    const a=placed[k], b=placed[k+1];
    const finGap=(b.p-f/2)-(a.p+f/2);
    const phyGap=finGap-2*m;
    if(finGap < S.kerf-1e-9){
      a.status.push(['bad','샘플 영역 겹침']); b.status.push(['bad','샘플 영역 겹침']);
      const need=a.p+f+S.kerf;
      msgs.push(['bad',`${a.name}와 ${b.name}는 샘플 영역이 ${fmt(S.kerf-finGap)} cm 겹쳐 한 런에서 만들 수 없어요. 두 포지션은 최소 ${short(f+S.kerf)} cm 떨어져야 합니다 (예: ${pTxt(need)} 이상).`]);
      links.push(false);
    } else links.push(phyGap <= S.gap+1e-9); // 마진까지 맞닿으면(간격 0) 긴 쿠폰으로 합침
  }
  const groups=[]; let cur=[];
  placed.forEach((it,k)=>{ cur.push(it); if(!(k<links.length && links[k])){ groups.push(cur); cur=[]; } });
  const longs=[];
  groups.forEach(g=>{
    if(g.length<2) return;
    if(S.mergeMode==='long'){
      const id=String.fromCharCode(65+longs.length);
      const start=g[0].p-f/2-m, end=g[g.length-1].p+f/2+m;
      const cuts=[];
      for(let k=0;k<g.length-1;k++){
        const r=g[k].p+f/2, l=g[k+1].p-f/2;
        g[k].mR=(l-r)/2; g[k+1].mL=(l-r)/2;
        if(l-r<1e-6) cuts.push({at:r, note:`${pTxt(g[k].p)}|${pTxt(g[k+1].p)} 경계`});
        else { cuts.push({at:r, note:`${pTxt(g[k].p)} 끝`}); cuts.push({at:l, note:`${pTxt(g[k+1].p)} 시작`}); }
      }
      g.forEach(x=>{ x.group=id; x.status.push(['warn',`긴 쿠폰 ${id}`]); });
      const splits=[], tight=[];
      for(let k=0;k<g.length-1;k++){
        const gapS=(g[k+1].p-f/2)-(g[k].p+f/2);
        if(gapS >= 2*m-1e-6) splits.push((g[k].p+f/2+g[k+1].p-f/2)/2);
        else tight.push({a:g[k], b:g[k+1], mm:gapS/2});
      }
      longs.push({id, members:g, start, end, w:f+2*m, cuts, splits, tight});
      msgs.push(['warn',`${g.map(x=>pTxt(x.p)).join(', ')} 포지션은 쿠폰이 맞닿거나 겹쳐서 긴 쿠폰 ${id} 하나로 합쳤어요 (${fmt(end-start)} × ${fmt(f+2*m)} cm).`]);
    } else {
      for(let k=0;k<g.length-1;k++){ const a=g[k], b=g[k+1];
        const room=((b.p-f/2)-(a.p+f/2)-S.gap)/2;
        a.mR=Math.max(0,Math.min(a.mR,room)); b.mL=Math.max(0,Math.min(b.mL,room)); }
      g.forEach(x=>x.status.push(['warn','마진 축소']));
      msgs.push(['warn',`${g.map(x=>pTxt(x.p)).join(', ')} 포지션은 마주보는 쪽 마진을 자동으로 줄여 따로 붙였어요.`]);
    }
  });
  placed.forEach(it=>{
    const L=longs.find(g=>g.id===it.group);
    let l,r,w;
    if(L){ l=L.start; r=L.end; w=L.w; } else { l=it.p-f/2-it.mL; r=it.p+f/2+it.mR; w=it.w; }
    it.edgeL=l; it.edgeR=r;
    const lim=Math.sqrt(Math.max(0,R*R-(w/2)*(w/2)));
    if(l<-lim-1e-9||r>lim+1e-9){ it.status.push(['bad','웨이퍼 밖']); msgs.push(['bad',`${it.name}: 쿠폰이 웨이퍼 가장자리(±${fmt(lim)} cm)를 벗어나요.`]); }
    if(!L && m>0 && Math.min(it.mL,it.mR)<Math.min(S.minM,m)-1e-9) it.status.push(['warn','사이드 데포 주의']);
  });
  if(!msgs.some(x=>x[0]!=='ok') && placed.length) msgs.push(['ok','겹침 없이 모두 따로 붙일 수 있어요.']);
  const outR=placed.filter(it=>Math.abs(it.p)>RANGE+1e-9);
  if(outR.length) msgs.push(['warn',`포지션 ${outR.map(it=>pTxt(it.p)).join(', ')}은(는) 공정 신뢰 범위(-${RANGE} ~ +${RANGE})를 벗어나요. 특이사항이 아니면 확인해 주세요.`]);
  if(!placed.length && !msgs.length) msgs.push(['warn', S.mode==='thk' ? '목표 두께를 입력해 주세요.' : '포지션을 입력해 주세요.']);
  return {placed, longs, msgs, f, m};
}

// ---------- 3. 화면 그리기 (웨이퍼 그림, 표, 재단표) ----------
const NS='http://www.w3.org/2000/svg';
function el(tag,attrs,parent,text){ const e=document.createElementNS(NS,tag); for(const k in attrs) e.setAttribute(k,attrs[k]); if(text!=null) e.textContent=text; if(parent) parent.appendChild(e); return e; }

function drawMap(res){
  const box=$('map'); box.innerHTML='';
  const svg=el('svg',{viewBox:`${-R-1} -6.4 ${2*R+2} 12.6`,role:'img','aria-label':'웨이퍼 위 쿠폰 배치도'});
  el('circle',{cx:0,cy:0,r:R,fill:'var(--wafer)',stroke:'var(--wafer-edge)','stroke-width':0.05},svg);
  el('line',{x1:-R,y1:0,x2:R,y2:0,stroke:'var(--wafer-edge)','stroke-width':0.03,'stroke-dasharray':'0.25 0.2'},svg);
  el('line',{x1:0,y1:-0.4,x2:0,y2:0.4,stroke:'var(--muted)','stroke-width':0.04},svg);
  // 노치 (왼쪽 끝)
  el('path',{d:`M${-R-0.05} -0.4 L${-R+0.4} 0 L${-R-0.05} 0.4 Z`,fill:'var(--panel)',stroke:'none'},svg);
  el('path',{d:`M${-R} -0.4 L${-R+0.4} 0 L${-R} 0.4`,fill:'none',stroke:'var(--wafer-edge)','stroke-width':0.05,'stroke-linejoin':'round'},svg);
  const bad=new Set(res.placed.filter(x=>x.status.some(s=>s[0]==='bad')).map(x=>x.i));
  res.longs.forEach(L=>{
    const anyBad=L.members.some(m=>bad.has(m.i));
    el('rect',{x:L.start,y:-L.w/2,width:L.end-L.start,height:L.w,fill:'var(--coupon)',stroke:anyBad?'var(--bad)':'var(--final)','stroke-width':0.05,rx:0.05},svg);
    // 마진 손실 없이 나눌 수 있는 위치: 초록 선
    L.splits.forEach(x=> el('line',{x1:x,y1:-L.w/2-0.15,x2:x,y2:L.w/2+0.15,stroke:'var(--ok)','stroke-width':0.07},svg));
    const top=-L.w/2;
    L.members.slice(0,-1).forEach((a,k)=>{
      const b=L.members[k+1], r=a.p+a.f/2, l=b.p-b.f/2, gap=l-r, mid=(r+l)/2;
      const dy=top-0.3, ty=dy-0.2-(k%2)*0.5;
      el('line',{x1:r,y1:top-0.05,x2:r,y2:dy-0.1,stroke:'var(--warn)','stroke-width':0.025},svg);
      el('line',{x1:l,y1:top-0.05,x2:l,y2:dy-0.1,stroke:'var(--warn)','stroke-width':0.025},svg);
      el('line',{x1:r,y1:dy,x2:l,y2:dy,stroke:'var(--warn)','stroke-width':0.035},svg);
      if(k%2) el('line',{x1:mid,y1:dy,x2:mid,y2:ty+0.08,stroke:'var(--warn)','stroke-width':0.02},svg);
      el('text',{x:mid,y:ty,'text-anchor':'middle','font-size':0.34,fill:'var(--warn)','font-family':'var(--mono)','font-weight':600,'paint-order':'stroke',stroke:'var(--wafer)','stroke-width':0.12},svg, gap<1e-6 ? '0' : fmt(gap));
    });
  });
  res.placed.forEach((it,k)=>{
    const isBad=bad.has(it.i);
    if(!it.group) el('rect',{x:it.edgeL,y:-it.w/2,width:it.edgeR-it.edgeL,height:it.w,fill:'var(--coupon)',stroke:isBad?'var(--bad)':'var(--final)','stroke-width':0.05,rx:0.05,'fill-opacity':0.9},svg);
    el('rect',{x:it.p-it.f/2,y:-it.f/2,width:it.f,height:it.f,fill:isBad?'var(--bad)':'var(--final)','fill-opacity':0.85},svg);
    // 포지션은 샘플 안, 자 위치는 샘플 바로 아래(마진 영역 안, 마진이 좁으면 쿠폰 아래)
    const fs=Math.min(0.38, it.f*0.92/(pTxt(it.p).length*0.6)); // 글자가 샘플 폭을 넘지 않게
    el('text',{x:it.p,y:fs*0.36,'text-anchor':'middle','font-size':fs,fill:'var(--panel)','font-family':'var(--mono)','font-weight':600},svg,pTxt(it.p));
    const inM = res.m>=0.3;
    const ry2 = inM ? it.f/2+res.m/2+0.1 : it.w/2+0.4;
    el('text',{x:it.p,y:ry2,'text-anchor':'middle','font-size':0.28,fill:'var(--muted)','font-family':'var(--mono)'},svg,fmt(S.rulerC+it.p));
  });
  const ry=4.5;
  el('rect',{x:-S.rulerC,y:ry,width:RULER_LEN,height:1.15,fill:'var(--panel)',stroke:'var(--muted)','stroke-width':0.04},svg);
  for(let v=0; v<=RULER_LEN+0.001; v+=0.5){
    const x=v-S.rulerC; if(x<-R-1e-9||x>R+1e-9) continue;
    const major=Math.abs(v%5)<1e-9, mid=Math.abs(v%1)<1e-9;
    el('line',{x1:x,y1:ry,x2:x,y2:ry+(major?0.5:mid?0.32:0.18),stroke:'var(--fg)','stroke-width':major?0.04:0.025},svg);
    if(major) el('text',{x:x,y:ry+0.95,'text-anchor':'middle','font-size':0.36,fill:'var(--fg)','font-family':'var(--mono)'},svg,String(v));
  }
  const marks=[];
  res.longs.forEach(L=>marks.push(L.start,L.end));
  res.placed.filter(x=>!x.group).forEach(x=>marks.push(x.edgeL,x.edgeR));
  marks.sort((a,b)=>a-b);
  const uniq=marks.filter((x,k)=>k===0||Math.abs(x-marks[k-1])>1e-6);
  let lastX=-1e9, level=0;
  uniq.forEach(x=>{
    el('path',{d:`M${x} ${ry-0.05} l-0.16 -0.32 h0.32 z`,fill:'var(--accent)'},svg);
    level = (x-lastX<1.0) ? (level+1)%2 : 0; lastX=x;
    const ty = ry-0.5-level*0.45;
    if(level) el('line',{x1:x,y1:ty+0.08,x2:x,y2:ry-0.4,stroke:'var(--accent)','stroke-width':0.02},svg);
    const t=el('text',{x:x,y:ty,'text-anchor':'middle','font-size':0.36,fill:'var(--accent)','font-family':'var(--mono)','font-weight':600,'paint-order':'stroke',stroke:'var(--wafer)','stroke-width':0.12},svg,fmt(S.rulerC+x));
  });
  box.appendChild(svg);
}

function renderResults(res){
  const rc=S.rulerC, {f,m}=res;
  $('fCustomWrap').hidden = S.fSel!=='c';
  $('mWrap').hidden = !S.useM;
  $('sizeNote').textContent = m>0
    ? `쿠폰 재단 크기 ${fmt(f+2*m)} × ${fmt(f+2*m)} cm → 증착·열처리 후 사방 ${fmt(m)} cm씩 잘라 ${fmt(f)} × ${fmt(f)} cm 샘플을 얻습니다. 포지션이 가까우면 마진을 자동으로 줄이거나 긴 쿠폰으로 합칩니다.`
    : `여유 마진 없이 ${fmt(f)} × ${fmt(f)} cm 쿠폰을 그대로 붙입니다.`;
  const ul=$('msgs'); ul.innerHTML='';
  res.msgs.forEach(([c,t])=>{ const li=document.createElement('li'); li.className=c; li.textContent=t; ul.appendChild(li); });
  $('procTag').textContent = S.proc ? '#'+S.proc : '';
  // 입력칸 아래 계산 결과: 포지션 / 목표 두께 / 예상 두께
  { const box=$('calcBox'); box.innerHTML='';
    if(res.placed.length){
      const t=document.createElement('table'), thk=S.mode==='thk';
      t.innerHTML=`<caption>${thk?'계산된 포지션':'포지션별 예상 두께'} (${esc(gunOf(S.gun)?.label||'')})</caption><thead><tr><th>포지션</th>${thk?'<th>목표 두께(nm)</th>':''}<th>예상 두께(nm)</th></tr></thead>`;
      const tb=document.createElement('tbody');
      res.placed.forEach(it=>{ const tr=document.createElement('tr');
        [[pTxt(it.p),'n'], ...(thk?[[String(it.target),'n']]:[]), [f3(it.thk),'n']].forEach(([v,c])=>{const td=document.createElement('td'); td.className=c; td.textContent=v; tr.appendChild(td);});
        tb.appendChild(tr); });
      t.appendChild(tb); box.appendChild(t);
    } }
  { const g=gunOf(S.gun); if(g){ const c=centerOf(g), [lo,hi]=thkRange(g,c,RANGE);
    $('gunNote').textContent = `${g.label} · 중심 두께 ${c} nm 기준, 포지션 -${RANGE} ~ +${RANGE}에서 두께 ${f3(lo)} ~ ${f3(hi)} nm (포지션 0: ${f3(thkAt(g,0,c))} nm). 계산식은 웻지 두께 계산 엑셀(ver180905)과 같아요.`; } }
  const tb=$('rBody'); tb.innerHTML='';
  res.placed.forEach(it=>{
    const tr=document.createElement('tr');
    if(it.status.some(s=>s[0]==='bad')) tr.className='bad';
    const add=(txt,cls)=>{const td=document.createElement('td'); if(cls) td.className=cls; td.textContent=txt; tr.appendChild(td);};
    add(pTxt(it.p),'n');
    add(fmt(rc+it.p),'n');
    const L=res.longs.find(g=>g.id===it.group);
    if(L){ add(`길게 (${L.members.length}개)`); add(`${fmt(L.end-L.start)} × ${fmt(L.w)}`,'n'); }
    else { add('단일'); add(`${fmt(it.edgeR-it.edgeL)} × ${fmt(it.w)}`,'n'); }
    add(m>0 ? `${fmt(it.mL)} / ${fmt(it.mR)}` : '–','n');
    add(`${fmt(rc+it.edgeL)} ~ ${fmt(rc+it.edgeR)}`,'n');
    tb.appendChild(tr);
  });
  const gb=$('groups'); gb.innerHTML='';
  $('gPanel').hidden = !res.longs.length;
  res.longs.forEach(L=>{
    const d=document.createElement('div'); d.className='gcard';
    d.innerHTML=[
      `<b>길게 (${L.members.length}개)</b> · ${esc(L.members.map(x=>x.name).join(', '))}`,
      `<span class="n">재단 크기 ${fmt(L.end-L.start)} × ${fmt(L.w)} cm</span>`,
      `<span class="n">붙이는 위치: 자 눈금 ${fmt(rc+L.start)} ~ ${fmt(rc+L.end)}</span>`,
      `<span class="n">샘플 영역: ${L.members.map(x=>`${esc(pTxt(x.p))} → ${fmt(x.p-f/2-L.start)}~${fmt(x.p+f/2-L.start)} cm`).join(' · ')}</span>`,
      `<span class="n">절단선: ${L.cuts.map(c=>`${fmt(c.at-L.start)} cm (${esc(c.note)})`).join(' · ')}</span>`,
      m>0 ? `<span class="n">나눠서 만들 때: ${L.splits.length ? `마진 손실 없이 나눌 수 있는 위치 자 눈금 ${L.splits.map(x=>fmt(rc+x)).join(', ')}` : '마진 손실 없이 나눌 수 있는 위치 없음'}${L.tight.length ? ` · 나누면 마진이 줄어드는 곳 ${L.tight.map(t=>`${esc(pTxt(t.a.p))}|${esc(pTxt(t.b.p))} (마진 ${fmt(t.mm)})`).join(', ')}` : ''}</span>` : '',
      m>0 ? `<span class="note">양 끝은 ${fmt(m)} cm, 폭 방향은 위아래 ${fmt(m)} cm씩 잘라냅니다.</span>` : ''
    ].join('');
    gb.appendChild(d);
  });
}


let LAST=null;
function recompute(){ const res=layout(); LAST=res; drawMap(res); renderResults(res); updateComment(); save(); }

// ---------- 4. VSM 정리 엑셀 만들기 (기본 양식의 sample info B4:F15만 채움) ----------
if(S.xTemp==null) S.xTemp=C.defaultTemp ?? '350C';
if(S.xMat==null) S.xMat=(C.gunMaterials||{})[S.gun] ?? C.defaultMaterial ?? '';
if(S.xComment==null) S.xComment='';
if(S.xEdited==null) S.xEdited=false;            // 사람이 comment를 직접 고쳤는지
$('xTemp').value=S.xTemp; $('xMat').value=S.xMat;
const autoComment=()=>{ const g=gunOf(S.gun); const c=g?centerOf(g):0; return `${S.xMat||''} w-${Number(c.toFixed(3))} nm`.trim(); };
function updateComment(){ if(!S.xEdited){ S.xComment=autoComment(); } $('xComment').value=S.xComment; }
$('xTemp').oninput=e=>{S.xTemp=e.target.value.trim(); save();};
$('xMat').oninput=e=>{S.xMat=e.target.value.trim(); updateComment(); save();};
$('xComment').oninput=e=>{S.xComment=e.target.value; S.xEdited = S.xComment.trim()!=='' && S.xComment!==autoComment(); save();};
$('xAuto').onclick=()=>{ S.xEdited=false; updateComment(); save(); };
// 스퍼터 건을 바꾸면 물질도 건에 맞게 (물질을 직접 고친 적이 없을 때만)
$('gun').addEventListener('change',()=>{ const m=(C.gunMaterials||{})[S.gun]; if(m && !S.xMatEdited){ S.xMat=m; $('xMat').value=m; updateComment(); save(); } });
$('xMat').addEventListener('input',()=>{ S.xMatEdited=true; });
const xmlEsc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function setCell(xml, ref, value){
  // 빈 셀 <c r="B4" s=".."/> 또는 값이 있는 셀을 새 값으로 바꿈 (서식 s는 유지)
  const re=new RegExp('<c r="'+ref+'"((?:\\s+(?!t=)[a-zA-Z:]+="[^"]*")*)(?:\\s+t="[^"]*")?((?:\\s+[a-zA-Z:]+="[^"]*")*)\\s*(?:/>|>[\\s\\S]*?</c>)');
  if(!re.test(xml)) throw new Error('양식에서 '+ref+' 칸을 찾지 못했어요');
  const body = (typeof value==='number')
    ? '><v>'+value+'</v></c>'
    : ' t="inlineStr"><is><t>'+xmlEsc(value)+'</t></is></c>';
  return xml.replace(re,(m,a1,a2)=>'<c r="'+ref+'"'+a1+a2+body);
}
async function makeExcel(){
  const msg=$('xMsg'); msg.textContent='';
  try{
    if(!window.JSZip || !window.VSM_TEMPLATE_B64) throw new Error('양식 파일(template.js)이나 jszip.min.js를 불러오지 못했어요.');
    if(!S.proc) throw new Error('공정 번호를 입력해 주세요.');
    const res=LAST||layout();
    let rows=[...res.placed].sort((a,b)=>(a.thk??0)-(b.thk??0));
    if(!rows.length) throw new Error('포지션이 없어요.');
    let note='';
    if(rows.length>12){ note=` 샘플이 ${rows.length}개라 처음 12개만 넣었어요.`; rows=rows.slice(0,12); }
    const zip=await JSZip.loadAsync(window.VSM_TEMPLATE_B64,{base64:true});
    // sample info 시트 파일 찾기
    const wb=await zip.file('xl/workbook.xml').async('string');
    const rels=await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const m=wb.match(/<sheet [^>]*name="sample info"[^>]*r:id="([^"]+)"/); if(!m) throw new Error('양식에 sample info 시트가 없어요.');
    const t=rels.match(new RegExp('Id="'+m[1]+'"[^>]*Target="([^"]+)"'))||rels.match(new RegExp('Target="([^"]+)"[^>]*Id="'+m[1]+'"'));
    const path='xl/'+t[1].replace(/^\/?xl\//,'');
    let xml=await zip.file(path).async('string');
    const comment=(S.xComment||'').trim()||autoComment();  // 빈칸이면 자동값
    rows.forEach((it,i)=>{ const r=4+i;
      xml=setCell(xml,'B'+r,'#'+S.proc);
      xml=setCell(xml,'C'+r,comment);
      xml=setCell(xml,'D'+r,Math.round(it.p*1000)/1000);
      if(it.thk!=null) xml=setCell(xml,'E'+r,Math.round(it.thk*1000)/1000);
      xml=setCell(xml,'F'+r,S.xTemp||'');
    });
    zip.file(path,xml);
    // 열 때 전체 다시 계산
    zip.file('xl/workbook.xml', wb.replace(/<calcPr([^>]*?)\/>/, (mm,a)=> a.includes('fullCalcOnLoad')?mm:'<calcPr'+a+' fullCalcOnLoad="1"/>'));
    const name='#'+S.proc+'.xlsx';
    if(window.Neutralino && Neutralino.os && Neutralino.filesystem){        // exe 버전: 저장 위치 고르기
      const u8=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
      const dest=await Neutralino.os.showSaveDialog('엑셀 양식 저장',{defaultPath:name,filters:[{name:'Excel',extensions:['xlsx']}]});
      if(!dest){ msg.textContent='저장을 취소했어요.'; return; }
      await Neutralino.filesystem.writeBinaryFile(dest.endsWith('.xlsx')?dest:dest+'.xlsx', u8.buffer);
      msg.textContent=`${dest} 에 저장했어요 (샘플 ${rows.length}개).`+note;
    } else {                                                                 // 웹 버전: 다운로드
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
      setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},2000);
      msg.textContent=`${name} 를 만들었어요 (샘플 ${rows.length}개).`+note+' 다운로드가 시작되지 않으면 이 화면에서는 다운로드가 막혀 있는 거예요. 프로그램(exe)이나 GitHub 주소에서 써 주세요.';
    }
  }catch(err){ msg.textContent='만들지 못했어요: '+err.message; }
}
$('xMake').onclick=makeExcel;
recompute();
})();
