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
// ============================================================
(function(){
const C = window.CONFIG || {};
const R = C.waferRadius ?? 15;          // 웨이퍼 반지름(cm)
const RULER_LEN = C.rulerLength ?? 30;  // 자 길이(cm)
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
  mergeMode:C.mergeMode ?? 'long', minM:C.sideDepoWarn ?? 0.3};
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
$('pos').oninput=e=>{S.pos=e.target.value; recompute();};

const finalSize=()=> S.fSel==='c' ? Math.max(0.1,+S.fCustom||1) : +S.fSel;
const margin=()=> S.useM ? Math.max(0,+S.m||0) : 0;
function parsePositions(){
  return S.pos.replace(/[−–]/g,'-').split(/[\s,;]+/).filter(x=>x!=='').map(Number).filter(isFinite);
}
const nameOf = p => (S.proc? '#'+S.proc+'_' : '') + pTxt(p);

// ---------- 2. 배치 계산 (겹침 검사, 긴 쿠폰 합치기, 마진 자동 계산) ----------
function layout(){
  const f=finalSize(), m=margin(), msgs=[];
  const items=parsePositions().map((p,i)=>({i, p, name:nameOf(p), f, m, mL:m, mR:m, w:f+2*m, status:[], group:null}));
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
    } else links.push(phyGap < S.gap-1e-9);
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
      longs.push({id, members:g, start, end, w:f+2*m, cuts});
      msgs.push(['warn',`${g.map(x=>pTxt(x.p)).join(', ')} 포지션은 쿠폰이 겹쳐서 긴 쿠폰 ${id} 하나로 합쳤어요 (${fmt(end-start)} × ${fmt(f+2*m)} cm).`]);
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
  if(!msgs.length && placed.length) msgs.push(['ok','겹침 없이 모두 따로 붙일 수 있어요.']);
  if(!placed.length) msgs.push(['warn','포지션을 입력해 주세요.']);
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
  const bad=new Set(res.placed.filter(x=>x.status.some(s=>s[0]==='bad')).map(x=>x.i));
  res.longs.forEach(L=>{
    const anyBad=L.members.some(m=>bad.has(m.i));
    el('rect',{x:L.start,y:-L.w/2,width:L.end-L.start,height:L.w,fill:'var(--coupon)',stroke:anyBad?'var(--bad)':'var(--final)','stroke-width':0.05,rx:0.05},svg);
    L.cuts.forEach(c=> el('line',{x1:c.at,y1:-L.w/2-0.1,x2:c.at,y2:L.w/2+0.1,stroke:'var(--fg)','stroke-width':0.035,'stroke-dasharray':'0.12 0.08'},svg));
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
    const half=Math.max(it.w,1)/2, up=!it.group && k%2===0;
    const base = up ? -half-0.75 : half+0.6+((it.group && k%2) ? 0.95 : 0);
    el('text',{x:it.p,y:base,'text-anchor':'middle','font-size':0.42,fill:'var(--fg)','font-family':'var(--mono)','font-weight':500},svg,pTxt(it.p));
    el('text',{x:it.p,y:base+0.42,'text-anchor':'middle','font-size':0.32,fill:'var(--muted)','font-family':'var(--mono)'},svg,`(${fmt(S.rulerC+it.p)})`);
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
  const tb=$('rBody'); tb.innerHTML='';
  res.placed.forEach(it=>{
    const tr=document.createElement('tr');
    if(it.status.some(s=>s[0]==='bad')) tr.className='bad';
    const add=(txt,cls)=>{const td=document.createElement('td'); if(cls) td.className=cls; td.textContent=txt; tr.appendChild(td);};
    add(pTxt(it.p),'n');
    add(`${fmt(rc+it.p-f/2)} ~ ${fmt(rc+it.p+f/2)}`,'n');
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
      m>0 ? `<span class="note">양 끝은 ${fmt(m)} cm, 폭 방향은 위아래 ${fmt(m)} cm씩 잘라냅니다.</span>` : ''
    ].join('');
    gb.appendChild(d);
  });
}


function recompute(){ const res=layout(); drawMap(res); renderResults(res); save(); }
recompute();
})();
