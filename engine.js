/* ============================================================
   Kinmap — layout engine + canvas / list rendering
   ============================================================ */

const LC = { S:54, COUPLE:118, NODEW:112, SIBGAP:46, ROWH:190, TOPY:110, CENTER:640, SIDEGAP:80, SNAP:6 };
// community blob diameter, as a multiple of a member's own size (LC.S) —
// small/medium/large per the community's own c.size (defaults to medium)
const COMMUNITY_SIZE_MULT = { small:2, medium:3, large:4 };
function blobDiameter(size){ return LC.S*(COMMUNITY_SIZE_MULT[size]||COMMUNITY_SIZE_MULT.medium); }
let POS = {};   // id -> {x,y}
let SIDE = {};  // id -> -1 (paternal-ish) | +1 (maternal-ish) | undefined (unassigned), relative to the nearest ancestor fork
let BUSX = {};  // union id -> the x its children-bus actually drops from (raw midpoint + manual busOffset, already snap-corrected)

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
    // an edge sibling's own marriage may have a pinned L/R order (set by
    // layoutDescendants) so the spouse lands on the outward side of the row —
    // relax()'s block rebuilding must see the same order or it undoes it
    if(union._order) return union._order.map(id=>FAM.byId(id)).filter(Boolean);
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
    const p0=POS[ord[0].id], p1=ord[1]&&POS[ord[1].id];
    // both already placed by an earlier pass (e.g. reached again via a
    // secondary tree's childUnion lookup) — a genuinely redundant re-visit
    if(p0 && p1) return;
    const y = genY(FAM.byId(ord[0].id).gen);
    if(ord.length===2){
      // one side already placed (e.g. an ancestor's other marriage, fanned
      // out from that already-positioned ancestor) — anchor to it instead
      // of re-deriving a fresh centre, so the placed partner doesn't move
      if(p0) POS[ord[1].id]={x:centerX,y};
      else if(p1) POS[ord[0].id]={x:centerX,y};
      else { POS[ord[0].id]={x:centerX-LC.COUPLE/2,y}; POS[ord[1].id]={x:centerX+LC.COUPLE/2,y}; }
    } else if(!p0) POS[ord[0].id]={x:centerX,y};
    const cx = ord.length===2 ? (POS[ord[0].id].x+POS[ord[1].id].x)/2 : POS[ord[0].id].x;

    const kids = union.children.filter(k=>FAM.byId(k));
    if(!kids.length) return;
    const widths = kids.map(cid=>{ const cu=childUnion(cid,union); return cu?subtreeWidth(cu):LC.NODEW; });
    const total = widths.reduce((a,b)=>a+b,0) + LC.SIBGAP*(kids.length-1);
    let cur = cx - total/2;
    kids.forEach((cid,i)=>{
      const cx = cur + widths[i]/2;
      const cu = childUnion(cid, union);
      if(cu){
        // a sibling at the outer edge of the row: pin the blood relative to
        // the inward side (facing their siblings) and the married-in spouse
        // to the outward side, so the spouse's own ancestor line doesn't
        // have to cross back in through the sibling bus to reach them
        if(kids.length>1 && cu.partners.length===2){
          const other=cu.partners.find(id=>id!==cid);
          if(i===0) cu._order=[other,cid];
          else if(i===kids.length-1) cu._order=[cid,other];
        }
        layoutDescendants(cu, cx, depth+1, seen);
      }
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

  /* ---- an ancestor's OTHER marriages (besides the one leading down to the
     grandchild we climbed up from) ----
     Without this, e.g. a great-grandmother's exes/later husbands are left
     for the generic secondary-tree fallback, which has no notion of family
     side and can seed them anywhere — including wedged into the opposite
     side of the tree. Fan them out from the already-placed ancestor, on the
     same side their own branch belongs to, and recurse into their kids so
     half-sibling branches (e.g. a step-aunt) land there too. */
  function fanExtraUnions(personId, primaryUnion, side){
    const extra = FAM.unions.filter(u=>u!==primaryUnion && u.partners.length===2 && u.partners.includes(personId));
    let n=0;
    extra.forEach(u=>{
      const otherId = u.partners.find(id=>id!==personId);
      if(POS[otherId]) return;
      n++;
      layoutDescendants(u, POS[personId].x + side*n*LC.COUPLE, 0, new Set());
      SIDE[otherId]=side;
      u.children.forEach(cid=>{ if(FAM.byId(cid)) SIDE[cid]=side; });
    });
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
    sibs.forEach((k,i)=>{ POS[k]={x:centerX + side*(i+1)*(LC.NODEW+LC.SIBGAP), y:genY(FAM.byId(k).gen)}; SIDE[k]=side; });
    // recurse up through each parent, splaying the two grandparent lines apart —
    // dir still splays further-up ancestors, but both parents of this couple
    // share the descendant's side for SIDE-tagging purposes (they're one
    // couple, not two separate family sides, at this level)
    ord.forEach((par,i)=>{
      const dir = ord.length===2 ? (i===0?-1:1) : side;
      SIDE[par.id]=side;
      fanExtraUnions(par.id, pu, side);
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
    /* ---- a hub with 3+ marriages (one person connected to every other
       member of the component, none of whom are connected to each other) ----
       Only the two immediate neighbours of the hub avoid the up-and-over
       line routing, so put whichever spouses actually have children there —
       a childless ex doesn't need the clear vertical space, but a spouse
       with kids does, otherwise the child's own descent line lands wedged
       between unrelated exes instead of at the edge of the family. */
    function orderStarHub(hub, leaves){
      const hasKids=id=>FAM.unions.some(u=>u.partners.includes(hub)&&u.partners.includes(id)&&u.children.length);
      const withKids=leaves.filter(hasKids), withoutKids=leaves.filter(id=>!hasKids(id));
      const innerLeft=withKids[0]||null, innerRight=withKids[1]||null;
      const rest=withKids.slice(2).concat(withoutKids);
      const outerLeft=[], outerRight=[];
      // prefer whichever side is less occupied so far, rather than raw index
      // parity — a hub with only one kid-bearing spouse has a fully free
      // side that a childless leftover should land on first, not alternate
      // onto the already-occupied side
      let leftCount=innerLeft?1:0, rightCount=innerRight?1:0;
      rest.forEach(id=>{
        if(leftCount<=rightCount){ outerLeft.push(id); leftCount++; }
        else { outerRight.push(id); rightCount++; }
      });
      const left=(innerLeft?[innerLeft]:[]).concat(outerLeft);
      const right=(innerRight?[innerRight]:[]).concat(outerRight);
      return [...left.slice().reverse(), hub, ...right];
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
        const hub=comp.find(id=>adj[id].length===comp.length-1);
        if(comp.length===1) ordered=comp;
        else if(comp.length===2){ const u=FAM.unions.find(x=>x.partners.includes(comp[0])&&x.partners.includes(comp[1])); ordered=u?orderCouple(u).map(o=>o.id):comp; }
        else if(hub && comp.every(id=>id===hub || adj[id].length===1)) ordered=orderStarHub(hub, comp.filter(id=>id!==hub));
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
    // which family side a block belongs to (paternal/maternal-ish, tagged
    // during the ancestor climb) — averages in case a block mixes a tagged
    // ancestor with an untagged married-in spouse
    function blockSide(b){
      const sides=b.ids.map(id=>SIDE[id]).filter(s=>s!=null);
      return sides.length ? sides.reduce((a,s)=>a+s,0)/sides.length : 0;
    }
    // re-sort just the ranked items among themselves and write them back into
    // the same slots the natural/heuristic order gave them — deliberately NOT
    // one blended comparator mixing rank with the heuristic, which isn't a
    // valid total order (a manually-ranked item can sort below-by-rank but
    // above-by-heuristic relative to different unranked neighbours, producing
    // a cycle). Used by the manual-position final pass below.
    function reorderByRank(items, rankOf){
      const slots=[]; items.forEach((it,i)=>{ if(rankOf(it)!=null) slots.push(i); });
      if(slots.length>1){
        const byRank=slots.map(i=>items[i]).sort((a,b)=>rankOf(a)-rankOf(b));
        slots.forEach((i,k)=>{ items[i]=byRank[k]; });
      }
      return items;
    }
    function deoverlap(blocks){
      blocks.forEach(b=>{ b.c=blockCenter(b); b.side=blockSide(b); });
      // side is the primary sort key so opposite-side family branches never
      // get interleaved by a coincidental desiredCenter pull — within the
      // same side, fall back to the usual centre-based order
      blocks.sort((a,b)=> (a.side-b.side) || (a.c-b.c) );
      for(let i=1;i<blocks.length;i++){
        const prev=blocks[i-1], cur=blocks[i];
        // extra breathing room right where two different family sides meet
        const extra = cur.side>prev.side ? LC.SIDEGAP : 0;
        const minGap=prev.half+cur.half+LC.NODEW+extra;
        if(cur.c-prev.c < minGap){ cur.c=prev.c+minGap; setBlock(cur,cur.c); }
      }
    }
    for(let pass=0; pass<20; pass++){
      gens.forEach(g=>{
        const blocks=buildBlocks(g);
        blocks.forEach(b=> setBlock(b, desiredCenter(b)) );
        deoverlap(blocks);
      });
    }
    /* ---- final pass: settle blocks left behind by a fallback ----
       A block with no partner-union-of-its-own-with-kids never gets pulled
       toward anything above by desiredCenter (that only pulls PARENT blocks
       toward kids, never the reverse) — this includes lone children AND
       childless couples (e.g. a married-in spouse with no kids of their
       own), so if a fallback seeded either far from their actual parents,
       they'd stay stranded there through every iteration. Snapping them to
       their now-settled parents' midpoint here — once, after the iterative
       relax already converged — can't feed back into that relaxation and
       cause the runaway drift a symmetric pull would. */
    gens.forEach(g=>{
      const blocks=buildBlocks(g);
      blocks.forEach(b=>{
        const hasOwnPull = b.ids.some(id=>FAM.unions.some(u=>u.partners.includes(id)&&u.children.some(k=>POS[k])));
        if(hasOwnPull) return;
        const parentXs=[];
        b.ids.forEach(id=>{
          const pu=FAM.parentsUnion(id);
          if(pu) pu.partners.forEach(pid=>{ if(POS[pid]) parentXs.push(POS[pid].x); });
        });
        if(parentXs.length) setBlock(b, parentXs.reduce((a,x)=>a+x,0)/parentXs.length);
      });
      deoverlap(blocks);
    });
    /* ---- final pass: manual per-person row position (App's edit mode) ----
       Every other pass above positions people in rigid, marriage-adjacent
       BLOCKS — necessary for the auto-balancing heuristics, but it means no
       single person can be repositioned independently of their spouse(s).
       This last pass lets the user override that entirely: ANY person in a
       generation can be manually ranked (App drags always move one person),
       and once ranked, they're re-sequenced among ALL other people in that
       same row (not just their own block) via the same reorderByRank
       mechanism used above, then every person in the row is re-spaced along
       a single line — tight (couple-style) between two people who are still
       actually married to each other, looser otherwise. A union whose
       partners (or children-bus) end up non-adjacent after this still
       renders correctly — routedHeights()/lineBlocked() already bow a line
       up and over whoever ends up in between, so a manually tangled row
       still connects, just messily, exactly as intended: manual placement
       is meant to escape the heuristics, not extend them. Runs once, after
       everything else has converged, so it can't cause runaway drift.

       On top of the discrete order, rowOffset is a raw per-person pixel nudge
       (App's arrow-key handler) — purely additive and non-rippling, so fine-
       tuning one person (e.g. straightening a drop-line that has no reason to
       bow) never shifts anyone else. Once a nudge lands within LC.SNAP of
       being dead-centered under that person's own parents (their parents'
       union midpoint — the same mx structural() draws the drop-line's
       vertical segment from), snap to it exactly and lock rowOffset to the
       precise value that achieves it, so the drop-line's horizontal jog
       disappears entirely instead of just getting small, and the snap stays
       stable across future recomputes (gens is processed in ascending order,
       so a parent generation's own positions — including their own manual
       nudges — are always already finalized by the time a child generation
       reads them here).

       The shift below recenters the reordered sequence to roughly where the
       row currently sits — but a fully unconnected person (no partner/child
       entry in ANY union, e.g. a friend added with no family tie) gets
       seeded far off to one side by compute()'s isolated-person fallback,
       and including that arbitrary position in the "where it currently
       sits" bounds skews the shift, shoving every actually-related person
       in the row along with them. Match centers using only the row's
       union-anchored members (same isolation test compute() itself uses),
       falling back to everyone if the row has no anchored member at all —
       so an unconnected member's own stray position never pollutes the
       reference point used to keep everyone else roughly in place. */
    gens.forEach(g=>{
      const natural=FAM.people.filter(p=>p.gen===g && POS[p.id]).map(p=>p.id).sort((a,b)=>POS[a].x-POS[b].x);
      if(!natural.some(id=>{ const pp=FAM.byId(id); return pp.rowOrder!=null || pp.rowOffset!=null; })) return;
      const seq=reorderByRank(natural.slice(), id=>FAM.byId(id).rowOrder);
      const married=(a,b)=>FAM.unions.some(u=>u.partners.length===2&&u.partners.includes(a)&&u.partners.includes(b));
      const offs=[0];
      for(let i=1;i<seq.length;i++) offs.push(offs[i-1] + (married(seq[i-1],seq[i]) ? LC.COUPLE : LC.NODEW+LC.SIBGAP));
      const anchored=id=>FAM.unions.some(u=>u.partners.includes(id)||u.children.includes(id));
      const basis=natural.filter(anchored);
      const basisIds=basis.length?basis:natural;
      const naturalXs=basisIds.map(id=>POS[id].x);
      const basisOffs=basisIds.map(id=>offs[seq.indexOf(id)]);
      const shift = (Math.min(...naturalXs)+Math.max(...naturalXs))/2 - (Math.min(...basisOffs)+Math.max(...basisOffs))/2;
      seq.forEach((id,i)=>{
        const p=FAM.byId(id);
        let x = offs[i]+shift+(p.rowOffset||0);
        if(p.rowOffset!=null){
          const pu=FAM.parentsUnion(id);
          const ppos=pu?pu.partners.map(pid=>POS[pid]).filter(Boolean):[];
          if(ppos.length){
            const rawMid = ppos.length===2 ? (ppos[0].x+ppos[1].x)/2 : ppos[0].x;
            const targetX = rawMid + (pu.busOffset||0);
            if(Math.abs(x-targetX)<=LC.SNAP){ p.rowOffset += (targetX-x); x=targetX; }
          }
        }
        POS[id].x = x;
      });
    });
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
    SIDE = {};
    BUSX = {};
    FAM.unions.forEach(u=>{ delete u._order; });
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
    computeBusAnchors();
    return bounds();
  }

  /* ---- a union's own "line origin" — the x its children-bus drops from ----
     Normally just the raw midpoint of the two parents (or the one placed
     partner). App's edit mode lets this be manually offset (busOffset),
     independent of either parent's own position — e.g. to straighten a
     singleton child's line from the parents' side instead of the child's.
     Runs once, after relax() has fully finalized every person's position
     (including their own rowOffset/snap), so kids' positions here are final.
     Mirrors the person-side rowOffset snap: once busOffset puts mx within
     LC.SNAP of the kids' average x, lock busOffset to the exact value. For a
     single-child union this is the same comparison the child's own snap
     makes (converges in one pass); for multiple children the two sides
     compare against different targets (a fixed union midpoint vs. an
     average of several kids) and may take one extra render to fully settle
     — acceptable for a slow, iterative manual-editing workflow. */
  function computeBusAnchors(){
    FAM.unions.forEach(u=>{
      const parts=u.partners.map(id=>POS[id]).filter(Boolean);
      const kids=u.children.map(id=>POS[id]).filter(Boolean);
      if(!parts.length || !kids.length) return;
      const base=parts.length===2?(parts[0].x+parts[1].x)/2:parts[0].x;
      let mx=base+(u.busOffset||0);
      if(u.busOffset!=null){
        const target=kids.reduce((s,k)=>s+k.x,0)/kids.length;
        if(Math.abs(mx-target)<=LC.SNAP){ u.busOffset+=(target-mx); mx=target; }
      }
      BUSX[u.id]=mx;
    });
  }

  function bounds(){
    const xs=Object.values(POS).map(p=>p.x), ys=Object.values(POS).map(p=>p.y);
    return { minX:Math.min(...xs)-90, maxX:Math.max(...xs)+90, minY:Math.min(...ys)-90, maxY:Math.max(...ys)+118 };
  }
  // a union's children-bus origin x, computed+snapped in computeBusAnchors();
  // falls back to the raw (offset-free) partner midpoint if that union was
  // never populated there, so a gating mismatch between here and a caller
  // never produces NaN in a rendered path
  function busX(uid){
    if(BUSX[uid]!=null) return BUSX[uid];
    const u=FAM.unions.find(x=>x.id===uid); if(!u) return undefined;
    const parts=u.partners.map(id=>POS[id]).filter(Boolean); if(!parts.length) return undefined;
    return parts.length===2?(parts[0].x+parts[1].x)/2:parts[0].x;
  }
  return {
    compute, genY, pos: id=>POS[id], nodeHalf: LC.NODEW/2, busX,
    // every person in generation g, left-to-right by current x — used by
    // App's edit-mode drag to find who else is in the same row
    peopleInGen: g => FAM.people.filter(p=>p.gen===g && POS[p.id]).map(p=>p.id).sort((a,b)=>POS[a].x-POS[b].x),
  };
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

  /* does a third member's symbol sit on the straight line between two
     same-row partners? happens when one person has 3+ marriages — at most
     two spouses can be adjacent in a 1D row, so any further union must
     route around whoever ends up in between instead of hiding behind them */
  function rangeBlocked(lo, hi, y, skipIds){
    if(lo>=hi) return false;
    return FAM.people.some(p=>{
      if(skipIds.includes(p.id)) return false;
      const pt=POS[p.id]; if(!pt) return false;
      return pt.y===y && pt.x>lo && pt.x<hi;
    });
  }
  function lineBlocked(a, b, skipIds){
    return rangeBlocked(Math.min(a.x,b.x)+LC.S/2, Math.max(a.x,b.x)-LC.S/2, a.y, skipIds);
  }

  /* routed (obstruction-avoiding) lines — both partner lines blocked by a
     third member, and children buses stretched wide by a child seeded far
     from their own parents — that span overlapping x-ranges at the same
     height would otherwise stack on top of one another and look like a
     single shared line, or a partner line could coincide with an unrelated
     bus passing through the same gap. Both kinds share one stacking pool,
     keyed by height, so anything overlapping steps up to its own level. */
  function routedHeights(){
    const spans=[];
    FAM.unions.forEach(u=>{
      const parts=u.partners.map(id=>POS[id]).filter(Boolean);
      if(parts.length===2){
        const [a,b]=parts;
        if(lineBlocked(a,b,u.partners)) spans.push({ key:u.id+':p', y:a.y, lo:Math.min(a.x,b.x), hi:Math.max(a.x,b.x) });
      }
      const kids=u.children.map(id=>POS[id]).filter(Boolean);
      if(kids.length && parts.length){
        const mx=Layout.busX(u.id);
        const cy=kids[0].y;
        const xs=kids.map(k=>k.x).concat(mx);
        const lo=Math.min(...xs), hi=Math.max(...xs);
        const skip=[...u.partners, ...u.children];
        if(rangeBlocked(lo+LC.S/2, hi-LC.S/2, cy, skip)) spans.push({ key:u.id+':b', y:cy, lo, hi });
      }
    });
    spans.sort((x,y)=>(x.hi-x.lo)-(y.hi-y.lo));
    const placed=[], heights={};
    spans.forEach(s=>{
      let level=0;
      while(placed.some(p=>p.level===level && p.y===s.y && s.lo<p.hi && s.hi>p.lo)) level++;
      heights[s.key]=LC.S+38+level*26;   // base clearance, +1 step per overlapping line
      placed.push({y:s.y,lo:s.lo,hi:s.hi,level});
    });
    return heights;
  }

  function structural(){
    let out='';
    const routed=routedHeights();
    FAM.unions.forEach(u=>{
      const parts=u.partners.map(id=>POS[id]).filter(Boolean);
      const rt=REL_BY_KEY[u.type]||{};
      const Hp=routed[u.id+':p'];
      if(parts.length===2){
        const [a,b]=parts, y=a.y, mx=(a.x+b.x)/2;
        const dash=lineDash(u.type);
        if(Hp!=null){
          out+=`<path class="struct" ${dash} d="M${a.x} ${y} V${y-Hp} H${b.x} V${y}"/>`;
          out+=marks(u.type, mx, y-Hp);
        } else {
          out+=`<path class="struct" ${dash} d="M${a.x} ${y} H${b.x}"/>`;
          out+=marks(u.type, mx, y);
        }
      }
      // children bus
      const kids=u.children.map(id=>POS[id]).filter(Boolean);
      if(kids.length && parts.length){
        // if this union's own partner-line got bowed up over an obstruction
        // (Hp), the point where the kids' line departs from the couple must
        // follow it up too — otherwise it starts from the couple's original,
        // now-unoccupied row height, well below the line that's actually
        // drawn, and visually looks disconnected from whose child this is
        const py=(Hp!=null?parts[0].y-Hp:parts[0].y), mx=Layout.busX(u.id);
        const cy=kids[0].y;
        const xs=kids.map(k=>k.x).concat(mx);
        const xsLo=Math.min(...xs), xsHi=Math.max(...xs);
        // a child seeded (or pushed by de-overlap) far from this union's own
        // partners — e.g. no room for them right beside their siblings —
        // makes for a wide bus that can cut straight across an unrelated
        // family in between; lift it clear of their halos when that happens
        const busH=routed[u.id+':b'];
        const bus = busH!=null ? cy-busH : cy-LC.S/2-30;
        out+=`<path class="struct" d="M${mx} ${py} V${bus}"/>`;
        out+=`<path class="struct" d="M${xsLo} ${bus} H${xsHi}"/>`;
        u.children.forEach(cid=>{ const k=POS[cid]; if(!k) return; const ch=FAM.byId(cid);
          const dash = ch.conn==='adopted'?'stroke-dasharray="7 5"':ch.conn==='foster'?'stroke-dasharray="2 5"':'';
          out+=`<path class="struct" ${dash} d="M${k.x} ${bus} V${k.y-LC.S/2}"/>`; });
        // draggable/arrow-key-nudgeable handle at this union's own line-origin
        // point, independent of either parent — only shown in edit mode
        if(App.state.mode==='edit'){
          const sel=App.state.selectedUnion===u.id?' sel':'';
          out+=`<g class="bus-handle${sel}" data-uid="${u.id}" data-x="${mx}" data-y="${bus}" transform="translate(${mx},${bus})"><circle r="7"/></g>`;
        }
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

  /* anchor a tie at the corner of the node's symbol that faces the other
     person — same-generation ties always leave from a top corner (so they
     read as a clean upward arc); cross-generation ties instead pick top vs.
     bottom per node, whichever is vertically closest to the other person
     (e.g. the upper node's bottom corner to the lower node's top corner).
     Female (circle) symbols don't actually have a corner — the square's
     corner point sits R√2 from center, outside the circle's own radius R —
     so for circles the anchor is pulled in along that same diagonal to sit
     right on the circle's edge instead of floating past it. */
  function cornerAnchor(id, pos, other, sameGen){
    const community = FAM.communityById(id);
    const sx = other.x>=pos.x ? 1 : -1;
    const sy = sameGen ? -1 : (other.y>=pos.y ? 1 : -1);
    if(community){
      // anchor exactly on the blob's own (randomly-shaped) boundary in this
      // corner's direction, rather than assuming a fixed circle — reads the
      // same seed SYM.communityBlob renders with, so a "Regenerate shape"
      // click keeps the tie's connection point matched to the new outline
      const angle = Math.atan2(sy, sx);
      const rad = SYM.communityRadiusAt(community, blobDiameter(community.size), angle);
      return { x:pos.x+Math.cos(angle)*rad, y:pos.y+Math.sin(angle)*rad };
    }
    // circle symbols (female members) have no real corner: the square's
    // diagonal corner point sits R√2 out, well outside a circle of radius R,
    // so pull the anchor in along that same diagonal to land on its edge
    const R = LC.S/2;
    const o = FAM.byId(id)?.sex==='f' ? R/Math.SQRT2 : R;
    return { x:pos.x+sx*o, y:pos.y+sy*o };
  }

  function emotional(){
    return FAM.rels.map(r=>{ const a=POS[r.a], b=POS[r.b]; if(!a||!b) return '';
      // ties within a generation bow upward to dodge intervening members;
      // ties that cross generations (up/down), or touch a community (which
      // has no gen at all), run straight instead
      const ga=FAM.byId(r.a)?.gen, gb=FAM.byId(r.b)?.gen;
      const sameGen = ga!=null && gb!=null && ga===gb;
      const pa=cornerAnchor(r.a,a,b,sameGen), pb=cornerAnchor(r.b,b,a,sameGen);
      const bow=sameGen?relBow(pa,pb,r.a,r.b):0;
      return `<g class="emo-g" data-rel="${r.a}__${r.b}">${SYM.emotional(r.type,pa.x,pa.y,pb.x,pb.y,bow)}</g>`; }).join('');
  }

  // the age/deceased sub-line, plus this member's label icons appended
  // right after it as one centered unit — if there's no sub-text, the
  // icons alone are centered on that same line. Text width is a rough
  // per-character estimate (no live DOM measurement here), which is fine
  // for a small cosmetic line — same approximation already used for the
  // legend's fixed column widths.
  function renderSubLine(sub, labels, y){
    labels = labels || [];
    if(!sub && !labels.length) return '';
    const iconSize=13, iconGap=3, textGap=6, charW=6.4;
    const textW = sub ? sub.length*charW : 0;
    const iconsW = labels.length ? labels.length*iconSize + (labels.length-1)*iconGap : 0;
    const totalW = textW + (sub && labels.length ? textGap : 0) + iconsW;
    let x = -totalW/2, out='';
    if(sub){ out += `<text class="nsub" x="${x+textW/2}" y="${y}" text-anchor="middle">${sub}</text>`; x += textW + (labels.length?textGap:0); }
    labels.forEach(l=>{
      out += `<g class="label-icon" transform="translate(${x},${y-iconSize+1})">${renderLabelIcon(l.icon,iconSize,l.color,l.iconPath)}</g>`;
      x += iconSize+iconGap;
    });
    return out;
  }

  // the member's name, plus a small note-badge icon appended right after it
  // (centered as one unit, mirroring renderSubLine's text+icons technique)
  // when they have at least one note — the badge is neutral-colored (not
  // tinted to any one note's color, since a member can carry several
  // differently-colored notes) and is purely an existence indicator; actual
  // note content only shows via the hover tooltip wired in app.js.
  function renderNameLine(p, y){
    const hasNotes = p.notes && p.notes.length;
    if(!hasNotes) return `<text class="nlbl" x="0" y="${y}" text-anchor="middle">${p.name}</text>`;
    const iconSize=13, gap=5, charW=7.6;
    const textW = p.name.length*charW;
    const totalW = textW + gap + iconSize;
    let x = -totalW/2;
    let out = `<text class="nlbl" x="${x+textW/2}" y="${y}" text-anchor="middle">${p.name}</text>`;
    x += textW + gap;
    // the icon's own paths are unfilled/stroke-only, so a plain hover over
    // its hollow middle wouldn't register — a transparent hit-rect behind it
    // gives the whole badge a solid hover/click target
    out += `<g class="note-badge" data-note-badge="${p.id}" transform="translate(${x},${y-iconSize+1})">
      <rect class="note-badge-hit" x="-2" y="-2" width="${iconSize+4}" height="${iconSize+4}" fill="transparent"/>
      ${renderNoteBadgeIcon(iconSize)}
    </g>`;
    return out;
  }

  function nodes(){
    return FAM.people.map(p=>{ const pt=POS[p.id]; if(!pt) return '';
      const sub = p.deceased ? `${p.dInfo||'deceased'}${p.age?` · ${p.age}`:''}` : (p.age!=null?`${p.age}`:'');
      const badge = p.index ? `<text class="nlbl-ip" x="0" y="${LC.S/2+38}" text-anchor="middle">index patient</text>` : '';
      return `<g class="node${p.index?' is-index':''}${p.deceased?' is-dec':''}" data-id="${p.id}" transform="translate(${pt.x},${pt.y})">
        <rect class="halo" x="${-LC.S/2-8}" y="${-LC.S/2-8}" width="${LC.S+16}" height="${LC.S+16}" rx="12"/>
        <g class="sym">${SYM.shape(p)}</g>
        ${renderNameLine(p, LC.S/2+20)}
        ${renderSubLine(sub, (p.labelIds||[]).map(id=>FAM.labelDef(id)).filter(Boolean), LC.S/2+(p.index?54:36))}
        ${badge}
      </g>`; }).join('');
  }

  // the community's name, centered in its blob — font-size shrinks to fit
  // within the blob's width (minus generous padding) instead of overflowing
  // past its edge when a long name lands on a small blob
  // greedy word-wrap at an estimated (no live DOM measurement) chars-per-line
  // budget — same rough-estimate approach renderNameLine/renderSubLine use
  function wrapNameLines(name, maxChars){
    const words=name.split(/\s+/).filter(Boolean);
    const lines=[]; let cur='';
    words.forEach(w=>{
      const cand = cur ? cur+' '+w : w;
      if(cand.length<=maxChars || !cur) cur=cand;
      else { lines.push(cur); cur=w; }
    });
    if(cur) lines.push(cur);
    return lines.length ? lines : [''];
  }
  // small/medium/large blobs get progressively more lines to wrap into
  // (2/3/4) — wrapping first lets the font stay larger than a single-line
  // shrink-to-fit would allow; only shrinks font as a last resort, if it
  // still doesn't fit the line budget even at the smallest wrap width
  const COMMUNITY_NAME_MAX_LINES = { small:2, medium:3, large:4 };
  function communityNameLabel(c, d){
    const maxLines = COMMUNITY_NAME_MAX_LINES[c.size] || COMMUNITY_NAME_MAX_LINES.medium;
    const pad=28, maxW=Math.max(d-pad,20), charW=7.6, base=14, minFs=9;
    let fs=base, lines=[];
    for(let tries=0; tries<6; tries++){
      const maxChars=Math.max(3, Math.floor(maxW/(charW*fs/base)));
      lines=wrapNameLines(c.name, maxChars);
      if(lines.length<=maxLines || fs<=minFs) break;
      fs=Math.max(minFs, fs-1.5);
    }
    if(lines.length>maxLines){
      lines=lines.slice(0,maxLines);
      lines[maxLines-1]=lines[maxLines-1].replace(/.{0,3}$/,'')+'…';
    }
    const lh=fs*1.2, baseline=fs*0.3;
    const firstDy=-(lines.length-1)*lh/2+baseline;
    const tspans=lines.map((ln,i)=>`<tspan x="0" dy="${i===0?firstDy.toFixed(1):lh.toFixed(1)}">${ln}</tspan>`).join('');
    return `<text class="nlbl" text-anchor="middle" style="font-size:${fs}px">${tspans}</text>`;
  }

  // free-floating community blobs — POS entries for these are written
  // directly from c.pos in canvas() (never touched by Layout.compute()),
  // so this just reads them like nodes() reads person positions
  function communities(){
    return FAM.communities.map(c=>{ const pt=POS[c.id]; if(!pt) return '';
      const d=blobDiameter(c.size), r=d/2;
      return `<g class="node community-node" data-id="${c.id}" data-kind="community" transform="translate(${pt.x},${pt.y})">
        <rect class="halo" x="${-r-8}" y="${-r-8}" width="${d+16}" height="${d+16}" rx="20"/>
        <g class="sym">${SYM.communityBlob(c,d)}</g>
        ${communityNameLabel(c,d)}
      </g>`; }).join('');
  }

  // extends Layout.compute()'s own (people/union-only) bounds to also cover
  // each community blob's footprint, so View.fit() frames dragged-out
  // communities too — computed here rather than in Layout.compute() itself,
  // since communities are deliberately outside that algorithm entirely
  function communityBounds(b){
    if(!FAM.communities.length) return b;
    let { minX, maxX, minY, maxY } = b;
    FAM.communities.forEach(c=>{
      const r=blobDiameter(c.size)/2;
      minX=Math.min(minX,c.pos.x-r); maxX=Math.max(maxX,c.pos.x+r);
      minY=Math.min(minY,c.pos.y-r); maxY=Math.max(maxY,c.pos.y+r);
    });
    return { minX, maxX, minY, maxY };
  }

  /* ---- export: a clean, standalone rendering of the genogram ----
     Shared foundation for PNG/PDF export. Builds the same three layers
     canvas() does, but from a synthetic clean state rather than the live
     App.state — no selection highlighting, no edit-mode bus-handles — and
     honors the emotional-ties visibility toggle (canvas() relies on a pure
     CSS hide, #canvas.hide-emo, which wouldn't apply to a detached SVG).
     Synchronous, no DOM touched, so there's no visible flicker. */
  function exportMarkup(includeLegend){
    const savedMode=App.state.mode, savedSelU=App.state.selectedUnion;
    App.state.mode='normal'; App.state.selectedUnion=null;
    const inner = `<g class="layer-struct">${structural()}</g><g class="layer-nodes">${nodes()}</g>`
      + (App.state.showEmo ? `<g class="layer-emo">${emotional()}</g>` : '');
    App.state.mode=savedMode; App.state.selectedUnion=savedSelU;
    // Layout.compute()'s bounds only reflects member POSITIONS, padded by a
    // fixed constant — but the live #canvas has no viewBox at all (nothing
    // is ever clipped on-screen), so a routed/bowed line (raised above its
    // row to dodge an obstruction — see routedHeights()) can easily poke
    // out further than that fixed padding assumes, and silently get cropped
    // once an export gives it a real, tightly-sized viewBox. Measure the
    // ACTUAL rendered geometry instead of guessing a padding: materialize
    // the markup off-screen and read its true SVG bounding box.
    const bounds=measureBounds(inner);
    const bg=(getComputedStyle(document.documentElement).getPropertyValue('--canvas')||'').trim()||'#f4f0e8';
    if(!includeLegend) return { inner, bounds, bg };

    // grow the canvas upward (and rightward if the legend is wider than the
    // tree itself) to fit the legend in the top-left corner — the tree's
    // own content never moves or shrinks to make room
    const legend=buildLegendMarkup();
    const gap=24;
    const legendInner=legend.render(bounds.minX+gap, bounds.minY-gap-legend.height);
    const expanded={
      minX: bounds.minX,
      minY: bounds.minY - legend.height - gap*2,
      maxX: Math.max(bounds.maxX, bounds.minX + legend.width + gap*2),
      maxY: bounds.maxY,
    };
    return { inner: inner+`<g class="legend-export">${legendInner}</g>`, bounds:expanded, bg };
  }

  function measureBounds(inner){
    const container=document.createElement('div');
    container.style.cssText='position:fixed;left:-99999px;top:0;';
    container.innerHTML=`<svg xmlns="${NS}"><g>${inner}</g></svg>`;
    document.body.appendChild(container);
    const bbox=container.querySelector('svg > g').getBBox();
    document.body.removeChild(container);
    // getBBox() is the *geometric* box only — it excludes stroke width, so
    // pad a little to keep a ~2.4px-wide stroke sitting right at the edge
    // from getting half-clipped
    const pad=10;
    return { minX:bbox.x-pad, minY:bbox.y-pad, maxX:bbox.x+bbox.width+pad, maxY:bbox.y+bbox.height+pad };
  }

  /* ---- legend, as pure SVG (for export only — the on-screen legend is an
     HTML popover built by app.js's buildLegend(), which can't be embedded
     directly in an exported SVG). Reuses the same SYM.mini/SYM.relMini icon
     renderers the on-screen legend and relationship picker use, just laid
     out on a fixed row/column grid instead of CSS flex/grid, so its exact
     size is known analytically — no extra measurement pass needed. */
  // only includes symbols/relationship types actually present in the
  // current genogram (FAM.usedMemberTraits/usedPartnerTypes/usedEmotionalTypes,
  // data.js) — same filtering the on-screen legend popover uses, so the two
  // never disagree about what's "in" the legend
  function buildLegendMarkup(){
    const rowH=22, colW=196, pad=16, headerH=24, iconColW=50;
    const cols=[
      { title:'Members', rows:FAM.usedMemberTraits().map(r=>({icon:SYM.mini(r.trait,20), h:20, label:r.label})) },
      { title:'Partner / family', rows:FAM.usedPartnerTypes().map(r=>({icon:SYM.relMini(r.key), h:18, label:r.label})) },
      { title:'Emotional', rows:FAM.usedEmotionalTypes().map(r=>({icon:SYM.relMini(r.key), h:18, label:r.label})) },
      { title:'Labels', rows:FAM.usedLabels().map(r=>({icon:renderLabelIcon(r.icon,16,r.color,r.iconPath), h:16, label:r.desc})) },
    ].filter(c=>c.rows.length);
    const maxRows=cols.length?Math.max(...cols.map(c=>c.rows.length)):0;
    const width=pad*2+colW*Math.max(cols.length,1);
    const height=pad*2+headerH+rowH*maxRows;
    function render(x0,y0){
      let out=`<rect class="legend-panel" x="${x0}" y="${y0}" width="${width}" height="${height}" rx="10"/>`;
      cols.forEach((col,ci)=>{
        const cx=x0+pad+ci*colW;
        out+=`<text class="legend-h" x="${cx}" y="${y0+pad+13}">${col.title.toUpperCase()}</text>`;
        col.rows.forEach((row,ri)=>{
          const ry=y0+pad+headerH+ri*rowH;
          out+=`<g transform="translate(${cx},${ry+(rowH-row.h)/2})">${row.icon}</g>`;
          out+=`<text class="legend-label" x="${cx+iconColW}" y="${ry+15}">${row.label}</text>`;
        });
      });
      return out;
    }
    return { width, height, render };
  }

  // wrap exportMarkup()'s inner layers in a standalone <svg>, viewBox'd to
  // an arbitrary world-space rect `vb` (not necessarily the full bounds —
  // printTiled() slices the same inner markup into several rects) with
  // explicit width/height (raw attribute strings — plain numbers for PNG
  // rasterization, physical "in" units for print)
  function buildExportSVG(inner, bg, vb, widthAttr, heightAttr){
    return `<svg xmlns="${NS}" width="${widthAttr}" height="${heightAttr}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMid meet">`
      + `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="${bg}"/>`
      + inner + `</svg>`;
  }

  // the handful of resolved style properties a rasterized export actually
  // needs — copied inline since a Blob-loaded <img> has no access to the
  // page's linked stylesheet at all
  const EXPORT_STYLE_PROPS=['fill','stroke','stroke-width','stroke-dasharray',
    'stroke-linecap','stroke-linejoin','font-family','font-size','font-weight','text-anchor','color'];
  function inlineComputedStyles(el){
    const cs=getComputedStyle(el);
    let style='';
    EXPORT_STYLE_PROPS.forEach(p=>{ const v=cs.getPropertyValue(p); if(v) style+=`${p}:${v};`; });
    el.setAttribute('style', style);
    Array.from(el.children).forEach(inlineComputedStyles);
  }

  /* ---- export as a PNG image, full resolution, any size ----
     No page constraints — the isolated Blob->Image rasterization context
     has no access to styles.css at all, so every element's resolved style
     is inlined first via a temporary, off-screen-but-connected (not
     display:none — getComputedStyle needs real layout) copy of the export
     markup. Known, accepted limitation: the custom Archivo font can't be
     fetched from that isolated context, so exported text falls back to a
     plain sans-serif — deliberate, not a bug (see plan). Returns a Promise
     resolving once the download has been triggered. */
  function exportPNG(includeLegend){
    return new Promise((resolve, reject)=>{
      const { inner, bounds, bg } = exportMarkup(includeLegend);
      const w=bounds.maxX-bounds.minX, h=bounds.maxY-bounds.minY;
      const scale=2;
      const pxW=Math.round(w*scale), pxH=Math.round(h*scale);
      const svgStr=buildExportSVG(inner, bg, {x:bounds.minX,y:bounds.minY,w,h}, pxW, pxH);

      const container=document.createElement('div');
      container.style.cssText='position:fixed;left:-99999px;top:0;';
      container.innerHTML=svgStr;
      document.body.appendChild(container);
      const svgEl=container.querySelector('svg');
      Array.from(svgEl.children).forEach(inlineComputedStyles);
      const finalStr=new XMLSerializer().serializeToString(svgEl);
      document.body.removeChild(container);

      const blob=new Blob([finalStr], {type:'image/svg+xml;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const img=new Image();
      img.onload=()=>{
        const canvasEl=document.createElement('canvas');
        canvasEl.width=pxW; canvasEl.height=pxH;
        canvasEl.getContext('2d').drawImage(img,0,0,pxW,pxH);
        URL.revokeObjectURL(url);
        canvasEl.toBlob(pngBlob=>{
          const name=(Storage.serialize(null).name||'kinmap');
          const a=document.createElement('a'); const pngUrl=URL.createObjectURL(pngBlob);
          a.href=pngUrl; a.download=name+'.png';
          document.body.appendChild(a); a.click();
          document.body.removeChild(a); URL.revokeObjectURL(pngUrl);
          resolve();
        }, 'image/png');
      };
      img.onerror=(e)=>{ URL.revokeObjectURL(url); reject(e); };
      img.src=url;
    });
  }

  /* ---- printable PDF, via the browser's native print-to-PDF ----
     No PDF library — window.print() + @page/@media print, matching the
     project's zero-dependency philosophy. Two oversized-content strategies:
     printFit() shrinks the whole tree to one page; printTiled() keeps it
     near actual size and splits it across a grid of pages to be printed
     and physically assembled. */
  const PAGE_SIZES_IN = { letter:{w:8.5,h:11}, a4:{w:8.27,h:11.69} };
  const PRINT_MARGIN_IN = 0.4, TILE_OVERLAP_IN = 0.25, PX_PER_IN = 96;

  function pageDims(pageSize, orientation){
    const base=PAGE_SIZES_IN[pageSize]||PAGE_SIZES_IN.letter;
    const w=orientation==='landscape'?base.h:base.w, h=orientation==='landscape'?base.w:base.h;
    return { w, h, usableW:w-2*PRINT_MARGIN_IN, usableH:h-2*PRINT_MARGIN_IN };
  }
  // "auto" picks whichever orientation needs less shrinking to fit the
  // whole tree on one page — used directly by printFit(), and as printTiled()'s
  // heuristic too, since less shrinking on a single page also tends to
  // minimize the total tile count
  function chooseOrientation(pageSize, orientation, contentW, contentH){
    if(orientation!=='auto') return orientation;
    const scaleFor=o=>{ const d=pageDims(pageSize,o); return Math.min(d.usableW*PX_PER_IN/contentW, d.usableH*PX_PER_IN/contentH); };
    return scaleFor('landscape')>scaleFor('portrait') ? 'landscape' : 'portrait';
  }
  function setPrintPageCSS(pageSize, orientation){
    let style=document.getElementById('print-page-style');
    if(!style){ style=document.createElement('style'); style.id='print-page-style'; document.head.appendChild(style); }
    style.textContent=`@page{size:${pageSize} ${orientation};margin:${PRINT_MARGIN_IN}in;}`;
  }
  function runPrint(pagesHTML, pageSize, orientation){
    setPrintPageCSS(pageSize, orientation);
    const area=document.getElementById('print-area');
    area.innerHTML=pagesHTML;
    const cleanup=()=>{ area.innerHTML=''; window.removeEventListener('afterprint',cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  // how many tiled pages a given page size/orientation would produce —
  // exposed on its own so the export modal can show a live "~N pages"
  // estimate without actually printing anything
  function estimateTiles(pageSize, orientation, includeLegend){
    const { bounds } = exportMarkup(includeLegend);
    const contentW=bounds.maxX-bounds.minX, contentH=bounds.maxY-bounds.minY;
    const finalOrientation=chooseOrientation(pageSize, orientation, contentW, contentH);
    const d=pageDims(pageSize, finalOrientation);
    const cols=Math.max(1,Math.ceil(contentW/(d.usableW*PX_PER_IN)));
    const rows=Math.max(1,Math.ceil(contentH/(d.usableH*PX_PER_IN)));
    return { cols, rows, orientation:finalOrientation };
  }

  function printFit(pageSize, orientation, includeLegend){
    const { inner, bounds, bg } = exportMarkup(includeLegend);
    const contentW=bounds.maxX-bounds.minX, contentH=bounds.maxY-bounds.minY;
    const finalOrientation=chooseOrientation(pageSize, orientation, contentW, contentH);
    const d=pageDims(pageSize, finalOrientation);
    const svg=buildExportSVG(inner, bg, {x:bounds.minX,y:bounds.minY,w:contentW,h:contentH}, d.usableW+'in', d.usableH+'in');
    runPrint(`<div class="print-page">${svg}</div>`, pageSize, finalOrientation);
  }

  function printTiled(pageSize, orientation, includeLegend){
    const { inner, bounds, bg } = exportMarkup(includeLegend);
    const contentW=bounds.maxX-bounds.minX, contentH=bounds.maxY-bounds.minY;
    const { cols, rows, orientation:finalOrientation } = estimateTiles(pageSize, orientation, includeLegend);
    const d=pageDims(pageSize, finalOrientation);
    const usableWpx=d.usableW*PX_PER_IN, usableHpx=d.usableH*PX_PER_IN, overlapPx=TILE_OVERLAP_IN*PX_PER_IN;
    let html='';
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const loOv=c>0?overlapPx:0, hiOv=c<cols-1?overlapPx:0;
        const topOv=r>0?overlapPx:0, botOv=r<rows-1?overlapPx:0;
        const vb={
          x: bounds.minX + c*usableWpx - loOv,
          y: bounds.minY + r*usableHpx - topOv,
          w: usableWpx + loOv + hiOv,
          h: usableHpx + topOv + botOv,
        };
        const svg=buildExportSVG(inner, bg, vb, d.usableW+'in', d.usableH+'in');
        html+=`<div class="print-page">${svg}<div class="print-page-label">Row ${r+1} of ${rows} · Col ${c+1} of ${cols}</div></div>`;
      }
    }
    runPrint(html, pageSize, finalOrientation);
  }

  function canvas(){
    lastBounds = Layout.compute();
    FAM.communities.forEach(c=>{ POS[c.id]=c.pos; });
    lastBounds = communityBounds(lastBounds);
    world.innerHTML =
      `<g class="layer-struct">${structural()}</g>`+
      `<g class="layer-nodes">${nodes()}</g>`+
      `<g class="layer-communities">${communities()}</g>`+
      `<g class="layer-emo">${emotional()}</g>`;
    selection();
    highlight();
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
    const selU = App.state.selectedUnion;
    document.querySelectorAll('.bus-handle').forEach(h=>h.classList.toggle('sel', h.dataset.uid===selU));
  }

  // dim members that don't carry any of the currently highlighted labels
  // (plus every connective line, so the matching members stand out) — a
  // per-node/per-render pass like selection(), not baked into nodes()/
  // structural(), since it's a live view toggle rather than part of the data
  function highlight(){
    const sel = App.state.highlightLabels;
    const active = !!(sel && sel.size);
    document.getElementById('canvas').classList.toggle('dim-lines', active);
    document.querySelectorAll('.node').forEach(n=>{
      const p=FAM.byId(n.dataset.id);
      const match = p && (p.labelIds||[]).some(id=>sel.has(id));
      n.classList.toggle('dim', active && !match);
    });
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
  // screen (client) coords -> world coords, inverting apply()'s transform —
  // used by App's edit-mode drag to place a node under the live pointer
  function toWorld(clientX, clientY){
    const r=svg.getBoundingClientRect();
    return { x:(clientX-r.left-view.x)/view.k, y:(clientY-r.top-view.y)/view.k };
  }

  return { init, canvas, list, selection, highlight, fit, zoomBy, panBy, panView:view, zoomPct, resetView, toWorld,
    exportPNG, printFit, printTiled, estimateTiles };
})();
