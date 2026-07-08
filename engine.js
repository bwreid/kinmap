/* ============================================================
   Kinmap — layout engine + canvas / list rendering
   ============================================================ */

const LC = { S:54, COUPLE:118, NODEW:112, SIBGAP:46, ROWH:190, TOPY:110, CENTER:640 };
let POS = {};   // id -> {x,y}

/* ---------------- auto-balancing generational layout ----------------
   Strategy:
   1. Width-aware subtree packing seeds an initial, sensibly-ordered layout
      (descendants down from the root union, ancestors up from each partner).
   2. An iterative relaxation pass centres every parent-couple over its
      children and then pushes apart any symbols that overlap within a row,
      guaranteeing no collisions while keeping the tree balanced.
--------------------------------------------------------------------- */
const Layout = (()=>{
  function genY(g){ return LC.TOPY + g*LC.ROWH; }

  function orderCouple(union){               // male left, female right
    if(!union || !union.partners.length) return [];
    const [a,b]=union.partners.map(id=>FAM.byId(id));
    if(!a) return [];
    if(!b) return [a];
    if(a.sex==='f' && b.sex!=='f') return [b,a];
    return [a,b];
  }
  // the union a child heads as a partner (their own marriage), not their parent union
  function childUnion(cid, parentUnion){
    return FAM.unions.find(u=>u!==parentUnion && u.partners.includes(cid));
  }

  /* ---- width each descendant subtree needs ---- */
  function subtreeWidth(union, seen){
    seen = seen || new Set();
    if(seen.has(union.id)) return LC.NODEW;
    seen.add(union.id);
    const selfW = orderCouple(union).length===2 ? LC.COUPLE+LC.NODEW : LC.NODEW;
    const kids = union.children.filter(k=>FAM.byId(k));
    let w = selfW;
    if(kids.length){
      w = kids.reduce((s,cid)=>{ const cu=childUnion(cid,union); return s + (cu?subtreeWidth(cu,seen):LC.NODEW); },0)
          + LC.SIBGAP*(kids.length-1);
    }
    seen.delete(union.id);
    return Math.max(w, selfW);
  }

  function layoutDescendants(union, centerX, depth, seen){
    if(depth>10) return;
    seen = seen || new Set();
    if(seen.has(union.id)) return;
    seen.add(union.id);
    const ord = orderCouple(union);
    if(!ord.length) return;
    const y = genY(FAM.byId(ord[0].id).gen);
    if(ord.length===2){ POS[ord[0].id]={x:centerX-LC.COUPLE/2,y}; POS[ord[1].id]={x:centerX+LC.COUPLE/2,y}; }
    else POS[ord[0].id]={x:centerX,y};

    const kids = union.children.filter(k=>FAM.byId(k));
    if(!kids.length) return;
    const widths = kids.map(cid=>{ const cu=childUnion(cid,union); return cu?subtreeWidth(cu):LC.NODEW; });
    const total = widths.reduce((a,b)=>a+b,0) + LC.SIBGAP*(kids.length-1);
    let cur = centerX - total/2;
    kids.forEach((cid,i)=>{
      const cx = cur + widths[i]/2;
      const cu = childUnion(cid, union);
      if(cu) layoutDescendants(cu, cx, depth+1, seen);
      else POS[cid]={x:cx, y:genY(FAM.byId(cid).gen)};
      cur += widths[i] + LC.SIBGAP;
    });
  }

  /* ---- width a person's ancestor pyramid needs ---- */
  function ancWidth(personId, seen){
    seen = seen || new Set();
    if(seen.has(personId)) return LC.NODEW;
    seen.add(personId);
    const pu = FAM.parentsUnion(personId);
    let w = LC.NODEW;
    if(pu){
      const parents = pu.partners.filter(p=>FAM.byId(p));
      const pw = parents.length ? parents.reduce((s,p)=>s+ancWidth(p,seen),0) : LC.COUPLE;
      const sibs = pu.children.filter(k=>k!==personId && FAM.byId(k)).length;
      w = pw + sibs*(LC.NODEW+LC.SIBGAP);
    }
    seen.delete(personId);
    return Math.max(w, LC.COUPLE);
  }

  function layoutAncestors(personId, centerX, side, depth, seen){
    if(depth>10) return;
    seen = seen || new Set();
    if(seen.has(personId)) return;
    seen.add(personId);
    const pu = FAM.parentsUnion(personId);
    if(!pu) return;
    const ord = orderCouple(pu);
    if(!ord.length) return;
    const y = genY(FAM.byId(ord[0].id).gen);
    if(ord.length===2){ POS[ord[0].id]={x:centerX-LC.COUPLE/2,y}; POS[ord[1].id]={x:centerX+LC.COUPLE/2,y}; }
    else POS[ord[0].id]={x:centerX,y};
    // aunts/uncles fan toward the outer side of the diagram
    const sibs = pu.children.filter(k=>k!==personId && FAM.byId(k));
    sibs.forEach((k,i)=>{ POS[k]={x:centerX + side*(i+1)*(LC.NODEW+LC.SIBGAP), y:genY(FAM.byId(k).gen)}; });
    // recurse up through each parent, splaying the two grandparent lines apart
    ord.forEach((par,i)=>{
      const dir = ord.length===2 ? (i===0?-1:1) : side;
      layoutAncestors(par.id, POS[par.id].x, dir, depth+1, seen);
    });
  }

  /* ---- iterative relaxation: centre parents over kids, de-overlap rows ----
     Each generation row is built from connected partner-COMPONENTS, ordered as
     a path so a person with multiple partners lands in the MIDDLE (e.g.
     David — Karen — Alex). Components are rigid blocks, so the de-overlap sort
     can never interleave partners or mistake a spouse for a sibling. ---- */
  function relax(){
    const gens = [...new Set(FAM.people.filter(p=>POS[p.id]).map(p=>p.gen))].sort((a,b)=>a-b);

    function orderPath(comp, adj){
      let start=comp[0], best=Infinity;
      comp.forEach(id=>{ if(adj[id].length<best){ best=adj[id].length; start=id; } });
      const visited=new Set(), path=[]; let cur=start;
      while(cur!=null){
        visited.add(cur); path.push(cur);
        let next=null;
        for(const n of adj[cur]){ if(!visited.has(n)){ next=n; break; } }
        cur=next;
      }
      comp.forEach(id=>{ if(!visited.has(id)){ path.push(id); visited.add(id); } });
      return path;
    }
    // how many 2-person unions a person heads (i.e. is this a multi-marriage "hub"?)
    function partnerCount2(id){
      return FAM.unions.filter(u=>u.partners.length===2 && u.partners.includes(id)).length;
    }
    /* ---- per-gap spacing within a partner block ----
       Default gap is one COUPLE. When a hub person (2+ marriages) sits next to a
       SECONDARY married-in spouse who carries their own ancestor branch (e.g.
       Karen — Alex, where Alex has parents Don & Song), widen that gap so the
       whole in-law branch splays outward instead of crowding the centre. The
       extra room ≈ the spouse's ancestor pyramid, so their grandparent couple
       lands directly above them and the child-line drops cleanly. ---- */
    function blockGaps(ids){
      const n=ids.length, gaps=new Array(Math.max(0,n-1)).fill(LC.COUPLE);
      for(let i=0;i<n-1;i++){
        const a=ids[i], b=ids[i+1];
        const aHub=partnerCount2(a)>=2, bHub=partnerCount2(b)>=2;
        let hub=null, spouse=null;
        if(aHub && !bHub){ hub=a; spouse=b; }
        else if(bHub && !aHub){ hub=b; spouse=a; }
        if(hub && spouse && FAM.parentsUnion(spouse)){
          const hubUnions=FAM.unions.filter(u=>u.partners.length===2 && u.partners.includes(hub));
          const primary=hubUnions.find(u=>u.root)||hubUnions[0];
          const u=FAM.unions.find(x=>x.partners.includes(hub)&&x.partners.includes(spouse));
          if(u && u!==primary){
            // splay by the in-law's ancestor span so their grandparents sit above them
            gaps[i] += Math.max(LC.NODEW, ancWidth(spouse) - LC.COUPLE);
          }
        }
      }
      return gaps;
    }
    function makeBlock(ids){
      const n=ids.length;
      const gaps=blockGaps(ids);
      const xs=[0]; for(let i=0;i<n-1;i++) xs.push(xs[i]+gaps[i]);
      const span=xs[n-1]||0, c=span/2;
      const offs=xs.map(x=>x-c);
      return { ids, n, half:span/2, off:i=>offs[i] };
    }
    function buildBlocks(g){
      const ids=FAM.people.filter(p=>p.gen===g && POS[p.id]).map(p=>p.id);
      const idset=new Set(ids);
      const adj={}; ids.forEach(id=>adj[id]=[]);
      FAM.unions.forEach(u=>{
        const o=orderCouple(u);
        if(o.length===2 && idset.has(o[0].id) && idset.has(o[1].id)){
          adj[o[0].id].push(o[1].id); adj[o[1].id].push(o[0].id);
        }
      });
      const seen=new Set(), blocks=[];
      ids.forEach(id=>{
        if(seen.has(id)) return;
        const comp=[], stack=[id];
        while(stack.length){ const c=stack.pop(); if(seen.has(c)) continue; seen.add(c); comp.push(c);
          adj[c].forEach(n=>{ if(!seen.has(n)) stack.push(n); }); }
        let ordered;
        if(comp.length===1) ordered=comp;
        else if(comp.length===2){ const u=FAM.unions.find(x=>x.partners.includes(comp[0])&&x.partners.includes(comp[1])); ordered=u?orderCouple(u).map(o=>o.id):comp; }
        else ordered=orderPath(comp, adj);
        blocks.push(makeBlock(ordered));
      });
      return blocks;
    }
    // geometric centre (block offsets may be non-uniform, so mean != midpoint)
    const blockCenter = b => { const xs=b.ids.map(id=>POS[id].x); return (Math.min(...xs)+Math.max(...xs))/2; };
    const setBlock = (b,c) => b.ids.forEach((id,i)=>POS[id].x = c + b.off(i));
    function desiredCenter(b){
      const terms=[];
      FAM.unions.forEach(u=>{
        const idxs=u.partners.map(pid=>b.ids.indexOf(pid)).filter(i=>i>=0);
        const kids=u.children.filter(k=>POS[k]);
        if(idxs.length && kids.length){
          const midOff = idxs.reduce((s,i)=>s+b.off(i),0)/idxs.length;
          const kc = kids.reduce((s,k)=>s+POS[k].x,0)/kids.length;
          terms.push(kc - midOff);
        }
      });
      return terms.length ? terms.reduce((a,b)=>a+b,0)/terms.length : blockCenter(b);
    }
    for(let pass=0; pass<20; pass++){
      gens.forEach(g=>{
        const blocks=buildBlocks(g);
        blocks.forEach(b=> setBlock(b, desiredCenter(b)) );
        blocks.forEach(b=> b.c=blockCenter(b) );
        blocks.sort((a,b)=>a.c-b.c);
        for(let i=1;i<blocks.length;i++){
          const prev=blocks[i-1], cur=blocks[i];
          const minGap=prev.half+cur.half+LC.NODEW;
          if(cur.c-prev.c < minGap){ cur.c=prev.c+minGap; setBlock(cur,cur.c); }
        }
      });
    }
  }

  /* ---- lay out union clusters not reachable from the main root ---- */
  function layoutSecondaryTrees(){
    const placedSet = new Set(Object.keys(POS));
    const secUnions = FAM.unions.filter(u =>
      u.partners.some(id => FAM.byId(id) && !placedSet.has(id))
    );
    if(!secUnions.length) return;

    // Index each person to the secondary unions they appear in
    const personUnions = {};
    secUnions.forEach(u => {
      [...u.partners, ...u.children].forEach(id => {
        if(!personUnions[id]) personUnions[id] = [];
        personUnions[id].push(u.id);
      });
    });

    // Group unions into connected components via shared people
    const visited = new Set(), components = [];
    secUnions.forEach(u => {
      if(visited.has(u.id)) return;
      const comp = [], stack = [u.id];
      while(stack.length){
        const uid = stack.pop();
        if(visited.has(uid)) continue;
        visited.add(uid);
        const cu = FAM.unions.find(x => x.id === uid);
        if(!cu) continue;
        comp.push(cu);
        [...cu.partners, ...cu.children].forEach(pid => {
          (personUnions[pid]||[]).forEach(nuid => { if(!visited.has(nuid)) stack.push(nuid); });
        });
      }
      components.push(comp);
    });

    // Lay out each component to the right of everything placed so far
    components.forEach(comp => {
      // Root = union where no partner is a child within this component
      const compChildIds = new Set(comp.flatMap(u => u.children));
      let rootU = comp.find(u => u.partners.length && !u.partners.every(id => compChildIds.has(id)));
      if(!rootU) rootU = comp[0];

      const xs = Object.values(POS).map(p => p.x);
      const rightEdge = xs.length ? Math.max(...xs) : LC.CENTER;
      const centerX = rightEdge + LC.S + LC.SIBGAP + subtreeWidth(rootU) / 2;

      layoutDescendants(rootU, centerX, 0);
      const ord = orderCouple(rootU);
      if(ord[0] && POS[ord[0].id]) layoutAncestors(ord[0].id, POS[ord[0].id].x, -1, 0);
      if(ord[1] && POS[ord[1].id]) layoutAncestors(ord[1].id, POS[ord[1].id].x, +1, 0);
    });
  }

  function compute(){
    POS = {};
    const root = FAM.unions.find(u=>u.root) || FAM.unions[0];
    if(root){
      layoutDescendants(root, LC.CENTER, 0);
      const ord = orderCouple(root);
      if(ord[0]) layoutAncestors(ord[0].id, POS[ord[0].id].x, -1, 0);
      if(ord[1]) layoutAncestors(ord[1].id, POS[ord[1].id].x, +1, 0);
    }

    // Lay out trees not connected to the main root
    layoutSecondaryTrees();

    // Snap unplaced partners next to an already-placed spouse
    let changed = true, guard=0;
    while(changed && guard++<20){
      changed = false;
      FAM.unions.forEach(u=>{
        if(u.partners.length!==2) return;
        const [aid,bid]=u.partners;
        const pa=POS[aid], pb=POS[bid];
        if(pa && !pb){ const bo=FAM.byId(bid); if(!bo) return; bo.gen=FAM.byId(aid).gen; POS[bid]={x:pa.x+LC.COUPLE, y:pa.y}; changed=true; }
        else if(pb && !pa){ const ao=FAM.byId(aid); if(!ao) return; ao.gen=FAM.byId(bid).gen; POS[aid]={x:pb.x-LC.COUPLE, y:pb.y}; changed=true; }
      });
    }

    // Safety: place any remaining unplaced people (truly isolated, no union connections)
    const used = {};
    FAM.people.forEach(p=>{ if(POS[p.id]) used[p.gen]=Math.max(used[p.gen]??-1e9, POS[p.id].x); });
    const posXs = Object.values(POS).map(p=>p.x);
    const globalRight = posXs.length ? Math.max(...posXs) : LC.CENTER - 280;
    FAM.people.forEach(p=>{ if(!POS[p.id]){
      const inUnion = FAM.unions.some(u => u.partners.includes(p.id) || u.children.includes(p.id));
      const x = inUnion
        ? (used[p.gen]??(LC.CENTER-200))+LC.NODEW
        : Math.max((used[p.gen]??-1e9)+LC.NODEW, globalRight+LC.NODEW+LC.SIBGAP);
      used[p.gen]=x; POS[p.id]={x,y:genY(p.gen)};
    }});

    relax();
    return bounds();
  }

  function bounds(){
    const xs=Object.values(POS).map(p=>p.x), ys=Object.values(POS).map(p=>p.y);
    return { minX:Math.min(...xs)-90, maxX:Math.max(...xs)+90, minY:Math.min(...ys)-90, maxY:Math.max(...ys)+118 };
  }
  return { compute, genY };
})();

/* ---------------- rendering ---------------- */
const View = (()=>{
  const NS='http://www.w3.org/2000/svg';
  let world, svg, lastBounds;

  function el(tag, attrs={}, html){ const e=document.createElementNS(NS,tag);
    for(const k in attrs) e.setAttribute(k,attrs[k]); if(html!=null) e.innerHTML=html; return e; }

  function init(){
    svg = document.getElementById('canvas');
    world = document.getElementById('world');
  }

  function structural(){
    let out='';
    FAM.unions.forEach(u=>{
      const parts=u.partners.map(id=>POS[id]).filter(Boolean);
      const rt=REL_BY_KEY[u.type]||{};
      if(parts.length===2){
        const [a,b]=parts, y=a.y, mx=(a.x+b.x)/2;
        const dash=lineDash(u.type);
        out+=`<path class="struct" ${dash} d="M${a.x} ${y} H${b.x}"/>`;
        out+=marks(u.type, mx, y);
      }
      // children bus
      const kids=u.children.map(id=>POS[id]).filter(Boolean);
      if(kids.length && parts.length){
        const py=parts[0].y, mx=parts.length===2?(parts[0].x+parts[1].x)/2:parts[0].x;
        const cy=kids[0].y, bus=cy-LC.S/2-30;
        out+=`<path class="struct" d="M${mx} ${py} V${bus}"/>`;
        const xs=kids.map(k=>k.x).concat(mx);
        out+=`<path class="struct" d="M${Math.min(...xs)} ${bus} H${Math.max(...xs)}"/>`;
        u.children.forEach(cid=>{ const k=POS[cid]; if(!k) return; const ch=FAM.byId(cid);
          const dash = ch.conn==='adopted'?'stroke-dasharray="7 5"':ch.conn==='foster'?'stroke-dasharray="2 5"':'';
          out+=`<path class="struct" ${dash} d="M${k.x} ${bus} V${k.y-LC.S/2}"/>`; });
      }
    });
    return out;
  }
  /* dashed/dotted partner-line styles for non-solid union types
     (matches the legend / picker previews in SYM.relMini) */
  function lineDash(type){
    switch(type){
      case 'cohabitation': return 'stroke-dasharray="10 6"';
      case 'engagement':   return 'stroke-dasharray="10 6"';
      case 'temporary':    return 'stroke-dasharray="2 6"';
      case 'nonconsensual':return 'stroke-dasharray="1 6"';
      default: return '';
    }
  }
  function marks(type, mx, y){
    const B='class="struct"';
    if(type==='divorce')   return `<path ${B} d="M${mx-7} ${y-9} L${mx-1} ${y+9} M${mx+1} ${y-9} L${mx+7} ${y+9}"/>`;
    if(type==='separation')return `<path ${B} d="M${mx-3} ${y-9} L${mx+5} ${y+9}"/>`;
    if(type==='widowed')   return `<path ${B} d="M${mx} ${y-9} L${mx-7} ${y+9} M${mx} ${y-9} L${mx+7} ${y+9}"/>`;
    if(type==='engagement')return `<path ${B} fill="none" d="M${mx-8} ${y+6} L${mx} ${y-6} L${mx+8} ${y+6}"/>`;
    return '';
  }

  /* signed bow amount (perpendicular offset for the curve's control point).
     Always bows toward -y (upward on screen) so ties arc up and away from
     name/age labels instead of alternating above/below; the bow grows if a
     member's symbol sits in the way along that upward side. */
  function relBow(a, b, aid, bid){
    const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy)||1;
    const ux=dx/len, uy=dy/len, px=-uy, py=ux;
    const sign = py>0 ? -1 : 1;   // whichever perpendicular direction points upward
    let blocked=false;
    FAM.people.forEach(p=>{
      if(p.id===aid||p.id===bid) return;
      const pt=POS[p.id]; if(!pt) return;
      const vx=pt.x-a.x, vy=pt.y-a.y;
      const t=(vx*ux+vy*uy)/len;
      if(t<0.14||t>0.86) return;
      const d=(vx*px+vy*py)*sign;   // distance on the side the curve bows toward
      if(d>=0 && d<LC.S+20) blocked=true;
    });
    const base=Math.min(Math.max(len*0.22,30),76);
    const clear=Math.max(base, LC.S+38);
    return sign*(blocked?clear:base);
  }

  /* anchor a tie at the node's top-left or top-right corner (whichever
     faces the other person) instead of its center, so the curve leaves
     from up near the roofline and reads as a clean upward arc */
  function cornerAnchor(p, other){
    const R=LC.S/2+6;
    const sx = other.x>=p.x ? 1 : -1;
    return { x:p.x+sx*R, y:p.y-R };
  }

  function emotional(){
    return FAM.rels.map(r=>{ const a=POS[r.a], b=POS[r.b]; if(!a||!b) return '';
      const pa=cornerAnchor(a,b), pb=cornerAnchor(b,a);
      const bow=relBow(pa,pb,r.a,r.b);
      return `<g class="emo-g" data-rel="${r.a}__${r.b}">${SYM.emotional(r.type,pa.x,pa.y,pb.x,pb.y,bow)}</g>`; }).join('');
  }

  function nodes(){
    return FAM.people.map(p=>{ const pt=POS[p.id]; if(!pt) return '';
      const sub = p.deceased ? `${p.dInfo||'deceased'}${p.age?` · ${p.age}`:''}` : (p.age!=null?`${p.age}`:'');
      const badge = p.index ? `<text class="nlbl-ip" x="0" y="${LC.S/2+38}" text-anchor="middle">index patient</text>` : '';
      return `<g class="node${p.index?' is-index':''}${p.deceased?' is-dec':''}" data-id="${p.id}" transform="translate(${pt.x},${pt.y})">
        <rect class="halo" x="${-LC.S/2-8}" y="${-LC.S/2-8}" width="${LC.S+16}" height="${LC.S+16}" rx="12"/>
        <g class="sym">${SYM.shape(p)}</g>
        <text class="nlbl" x="0" y="${LC.S/2+20}" text-anchor="middle">${p.name}</text>
        ${sub?`<text class="nsub" x="0" y="${LC.S/2+(p.index?54:36)}" text-anchor="middle">${sub}</text>`:''}
        ${badge}
      </g>`; }).join('');
  }

  function canvas(){
    lastBounds = Layout.compute();
    world.innerHTML =
      `<g class="layer-struct">${structural()}</g>`+
      `<g class="layer-nodes">${nodes()}</g>`+
      `<g class="layer-emo">${emotional()}</g>`;
    selection();
  }

  function list(){
    const box=document.getElementById('mlist');
    const gens=[...new Set(FAM.people.map(p=>p.gen))].sort((a,b)=>a-b);
    const names=['Generation I','Generation II','Generation III','Generation IV','Generation V'];
    box.innerHTML = gens.map(g=>{
      const rows=FAM.people.filter(p=>p.gen===g).map(p=>`
        <button class="mrow" data-id="${p.id}">
          <span class="msym">${SYM.mini(p,22)}</span>
          <span class="mname">${p.name}</span>
          <span class="mage">${p.deceased?'†':''}${p.age!=null?p.age:'–'}</span>
        </button>`).join('');
      return `<div class="gen-group"><div class="gen-h">${names[g]||('Gen '+(g+1))}</div>${rows}</div>`;
    }).join('');
    const pc=document.getElementById('pcount'); if(pc) pc.textContent=FAM.people.length;
    selection();
  }

  function selection(){
    const sel = App.state.selected, pair = App.state.relPair||[];
    document.querySelectorAll('.node').forEach(n=>{
      const id=n.dataset.id;
      n.classList.toggle('sel', id===sel);
      n.classList.toggle('pick', pair.includes(id));
    });
    document.querySelectorAll('.mrow').forEach(r=>r.classList.toggle('sel', r.dataset.id===sel));
  }

  /* pan / zoom */
  const view={x:0,y:0,k:1};
  function apply(){ world.setAttribute('transform',`translate(${view.x},${view.y}) scale(${view.k})`); }
  function fit(){
    if(!FAM.people.length){ resetView(); return; }
    const b=lastBounds||Layout.compute();
    const rect=svg.getBoundingClientRect();
    const w=b.maxX-b.minX, h=b.maxY-b.minY;
    const k=Math.min(rect.width/w, rect.height/h, 1.1)*0.94;
    view.k=k; view.x=rect.width/2 - (b.minX+w/2)*k; view.y=rect.height/2 - (b.minY+h/2)*k;
    apply();
  }
  function zoomBy(f, cx, cy){
    const rect=svg.getBoundingClientRect(); cx=cx??rect.width/2; cy=cy??rect.height/2;
    const nk=Math.max(0.3,Math.min(2.2, view.k*f));
    view.x = cx - (cx-view.x)*(nk/view.k); view.y = cy - (cy-view.y)*(nk/view.k);
    view.k=nk; apply();
  }
  function panBy(dx,dy){ view.x+=dx; view.y+=dy; apply(); }
  function zoomPct(){ return Math.round(view.k*100); }
  function resetView(){ view.x=0; view.y=0; view.k=1; apply(); }

  return { init, canvas, list, selection, fit, zoomBy, panBy, panView:view, zoomPct, resetView };
})();
