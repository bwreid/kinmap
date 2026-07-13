/* ============================================================
   Kinmap — data model, relationship vocabulary, symbol renderers
   ============================================================ */

/* ---------- seed family (Marcus = index patient) ---------- */
const FAM = {
  people: [
    { id:'pgf', name:'Walter Bell',  sex:'m', age:78, deceased:true,  dInfo:'d. 2014', gen:0, conn:'bio' },
    { id:'pgm', name:'Rose Bell',    sex:'f', age:81, gen:0, conn:'bio' },
    { id:'mgf', name:'Henry Cole',   sex:'m', age:75, gen:0, conn:'bio' },
    { id:'mgm', name:'Diane Cole',   sex:'f', age:73, gen:0, conn:'bio' },
    { id:'father', name:'David Bell',sex:'m', age:49, gen:1, conn:'bio' },
    { id:'mother', name:'Karen Bell',sex:'f', age:47, gen:1, conn:'bio' },
    { id:'marcus', name:'Marcus Bell',sex:'m',age:17, gen:2, index:true, conn:'bio' },
    { id:'lena',   name:'Lena Bell',  sex:'f',age:14, gen:2, conn:'bio' },
  ],
  unions: [
    { id:'u1', partners:['pgf','pgm'], type:'marriage', children:['father'] },
    { id:'u2', partners:['mgf','mgm'], type:'marriage', children:['mother'] },
    { id:'u3', partners:['father','mother'], type:'marriage', children:['marcus','lena'], root:true },
  ],
  rels: [
    { a:'mother', b:'marcus', type:'close' },
    { a:'father', b:'marcus', type:'conflict' },
    { a:'marcus', b:'lena',   type:'close' },
    { a:'father', b:'pgf',    type:'cutoff' },
  ],
  // central registry of member labels — { id, icon, desc, color } — created
  // and deleted only from the "Manage labels" screen; people reference these
  // by id (p.labelIds) rather than embedding their own copy
  labelDefs: [],

  byId(id){ return this.people.find(p=>p.id===id); },
  labelDef(id){ return this.labelDefs.find(l=>l.id===id); },
  addLabelDef({icon,desc,color}){
    const l={ id:this.uid('lbl'), icon, desc, color:color||null };
    this.labelDefs.push(l); return l;
  },
  removeLabelDef(id){
    this.labelDefs=this.labelDefs.filter(l=>l.id!==id);
    this.people.forEach(p=>{ if(p.labelIds) p.labelIds=p.labelIds.filter(x=>x!==id); });
  },
  parentsUnion(id){ return this.unions.find(u=>u.children.includes(id)); },
  partnerUnions(id){ return this.unions.filter(u=>u.partners.includes(id)); },
  primaryUnion(id){ return this.partnerUnions(id)[0] || null; },
  relsOf(id){ return this.rels.filter(r=>r.a===id||r.b===id); },
  index(){ return this.people.find(p=>p.index); },
  // which legend rows are actually relevant to THIS genogram — used by both
  // the on-screen legend popover and the export legend, so a pared-down
  // legend only ever shows symbols/relationship types that appear somewhere
  // in the current data, not the app's full vocabulary
  usedMemberTraits(){
    const has=pred=>this.people.some(pred);
    const out=[];
    if(has(p=>p.sex==='m')) out.push({ trait:{sex:'m'}, label:'Male' });
    if(has(p=>p.sex==='f')) out.push({ trait:{sex:'f'}, label:'Female' });
    if(has(p=>p.index)) out.push({ trait:{sex:'m',index:true}, label:'Index patient' });
    if(has(p=>p.deceased)) out.push({ trait:{sex:'m',deceased:true}, label:'Deceased' });
    if(has(p=>p.sex==='u')) out.push({ trait:{sex:'u'}, label:'Unknown' });
    return out;
  },
  usedPartnerTypes(){
    const used=new Set(this.unions.map(u=>u.type));
    return REL_TYPES.partner.filter(t=>used.has(t.key));
  },
  usedEmotionalTypes(){
    const used=new Set(this.rels.map(r=>r.type));
    return REL_TYPES.emotional.filter(t=>used.has(t.key));
  },
  // labelDefs actually assigned to at least one member — used by both the
  // on-screen legend popover and the export legend, so unused labels (defined
  // centrally but not yet applied to anyone) don't clutter the legend
  usedLabels(){
    return this.labelDefs.filter(l=>this.people.some(p=>(p.labelIds||[]).includes(l.id)));
  },
  _n:100,
  uid(pfx){ return pfx + (++this._n); },
};

/* ---------- relationship vocabulary ---------- */
const REL_TYPES = {
  partner: [
    { key:'marriage',      label:'Marriage' },
    { key:'cohabitation',  label:'Cohabitation' },
    { key:'engagement',    label:'Engagement' },
    { key:'separation',    label:'Separation' },
    { key:'divorce',       label:'Divorce' },
    { key:'widowed',       label:'Widowed' },
    { key:'temporary',     label:'Temporary' },
    { key:'nonconsensual', label:'Nonconsensual' },
  ],
  emotional: [
    { key:'affiliated',   label:'Affiliated' },
    { key:'close',        label:'Close' },
    { key:'fused',        label:'Fused' },
    { key:'conflict',     label:'Conflict' },
    { key:'fusedHostile', label:'Fused-hostile' },
    { key:'abuse',        label:'Abuse' },
    { key:'distant',      label:'Distant' },
    { key:'indifferent',  label:'Indifferent' },
    { key:'neglect',      label:'Neglect' },
    { key:'cutoff',       label:'Cutoff' },
    { key:'cutoffRepaired', label:'Cutoff Repaired' },
  ],
};
const REL_BY_KEY = {};
[...REL_TYPES.partner, ...REL_TYPES.emotional].forEach(r=>REL_BY_KEY[r.key]=r);

/* ============================================================
   SYM — symbol + line SVG renderers
   ============================================================ */
const SYM = (()=>{
  const R = 27;                 // half symbol size (54px)
  const STK = 2.4;              // stroke weight (refined clinical)

  /* person shape centered at 0,0, drawn with currentColor stroke */
  function shape(p){
    const s = R, d = s*2;
    let g = '';
    if(p.sex==='f'){
      g += `<circle cx="0" cy="0" r="${s}"/>`;
      if(p.index) g += `<circle cx="0" cy="0" r="${s-5}"/>`;
    } else if(p.sex==='u'){
      g += `<rect x="${-s}" y="${-s}" width="${d}" height="${d}" rx="3"/>`;
      g += `<text class="qmark" x="0" y="1" text-anchor="middle" dominant-baseline="middle">?</text>`;
    } else { // male / default square
      g += `<rect x="${-s}" y="${-s}" width="${d}" height="${d}" rx="3"/>`;
      if(p.index) g += `<rect x="${-s+5}" y="${-s+5}" width="${d-10}" height="${d-10}" rx="2"/>`;
    }
    if(p.deceased) g += `<path class="decx" d="M${-s} ${-s} L${s} ${s} M${s} ${-s} L${-s} ${s}"/>`;
    return g;
  }

  /* mini standalone symbol for the member list */
  function mini(p, size=22){
    const s=size, h=s/2-2, d=s-4;
    let inner;
    if(p.sex==='f') inner=`<circle cx="${s/2}" cy="${s/2}" r="${h}"/>`+(p.index?`<circle cx="${s/2}" cy="${s/2}" r="${h-3}"/>`:'');
    else if(p.sex==='u') inner=`<rect x="2" y="2" width="${d}" height="${d}" rx="2"/><text x="${s/2}" y="${s/2+4}" text-anchor="middle" font-size="${s*0.55}" stroke="none" fill="currentColor">?</text>`;
    else inner=`<rect x="2" y="2" width="${d}" height="${d}" rx="2"/>`+(p.index?`<rect x="5" y="5" width="${d-6}" height="${d-6}" rx="1"/>`:'');
    if(p.deceased) inner+=`<path d="M2 2 L${s-2} ${s-2} M${s-2} 2 L2 ${s-2}"/>`;
    return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none" stroke="currentColor" stroke-width="1.8">${inner}</svg>`;
  }

  /* mini relationship-line preview for picker chips */
  function relMini(key){
    const w=46,h=18,y=9,B='stroke="currentColor" stroke-width="2" fill="none"';
    const wrap=i=>`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${i}</svg>`;
    switch(key){
      case 'marriage':     return wrap(`<path d="M2 ${y} H44" ${B}/>`);
      case 'cohabitation': return wrap(`<path d="M2 ${y} H44" ${B} stroke-dasharray="6 4"/>`);
      case 'engagement':   return wrap(`<path d="M2 ${y} H16 M30 ${y} H44" ${B} stroke-dasharray="6 4"/><path d="M17 ${y+4} L23 ${y-4} L29 ${y+4}" ${B}/>`);
      case 'separation':   return wrap(`<path d="M2 ${y} H44" ${B}/><path d="M21 3 L27 15" ${B}/>`);
      case 'divorce':      return wrap(`<path d="M2 ${y} H44" ${B}/><path d="M18 3 L24 15 M24 3 L30 15" ${B}/>`);
      case 'widowed':      return wrap(`<path d="M2 ${y} H44" ${B}/><path d="M23 3 L17 15 M23 3 L29 15" ${B}/>`);
      case 'temporary':    return wrap(`<path d="M2 ${y} H44" ${B} stroke-dasharray="2 4"/>`);
      case 'nonconsensual':return wrap(`<path d="M2 ${y} H44" ${B} stroke-dasharray="1 4"/>`);
      case 'affiliated':   return wrap(`<path d="M2 ${y} H44" ${B}/>`);
      case 'close':        return wrap(`<path d="M2 6 H44 M2 12 H44" ${B}/>`);
      case 'fused':        return wrap(`<path d="M2 5 H44 M2 9 H44 M2 13 H44" ${B}/>`);
      case 'conflict':     return wrap(`<path d="M2 ${y} L8 4 L14 14 L20 4 L26 14 L32 4 L38 14 L44 ${y}" ${B}/>`);
      case 'fusedHostile': return wrap(`<path d="M2 5 H44 M2 13 H44" ${B}/><path d="M2 9 L10 5 L18 13 L26 5 L34 13 L44 9" ${B}/>`);
      case 'abuse':        return wrap(`<path d="M2 ${y} L9 4 L16 14 L23 4 L30 14 L37 9 H40" ${B}/><path d="M37 5 L44 9 L37 13" ${B}/>`);
      case 'distant':      return wrap(`<path d="M2 ${y} H44" ${B} stroke-dasharray="3 5"/>`);
      case 'indifferent':  return wrap(`<path d="M2 ${y} H44" ${B} stroke-dasharray="2 5"/>`);
      case 'neglect':      return wrap(`<path d="M2 ${y} H36" ${B} stroke-dasharray="3 5"/><path d="M37 5 L44 9 L37 13" ${B}/>`);
      case 'cutoff':       return wrap(`<path d="M2 ${y} H44" ${B}/><path d="M20 3 V15 M26 3 V15" ${B}/>`);
      case 'cutoffRepaired': return wrap(`<path d="M2 ${y} H44" ${B}/><path d="M17 3 V15 M29 3 V15" ${B}/><circle cx="23" cy="${y}" r="4" ${B}/>`);
      default:             return wrap(`<path d="M2 ${y} H44" ${B}/>`);
    }
  }

  /* ---- emotional line between two node anchor points (canvas overlay) ----
     x1,y1,x2,y2 are the tie's start/end anchors (the top corner of each
     node's symbol facing the other person), already clear of the node —
     see engine.js's cornerAnchor(). Drawn as a quadratic bezier so ties
     can bow around intervening members instead of cutting straight
     through them; `bow` (signed perpendicular offset for the control
     point) comes from the layout engine's collision check. bow===0
     degenerates to a straight line. */
  function emotional(key, x1,y1,x2,y2, bow=0){
    const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1;
    const ux=dx/len, uy=dy/len, px=-uy, py=ux;       // unit + perpendicular (chord-based)
    const trim=4;                                    // small gap off the corner anchor
    const ax=x1+ux*trim, ay=y1+uy*trim, bx=x2-ux*trim, by=y2-uy*trim;
    const mx=(ax+bx)/2, my=(ay+by)/2;
    const ccx=mx+px*bow, ccy=my+py*bow;              // bezier control point
    const L=Math.hypot(bx-ax,by-ay);

    const qpoint=t=>{ const it=1-t;
      return { x: it*it*ax + 2*it*t*ccx + t*t*bx, y: it*it*ay + 2*it*t*ccy + t*t*by }; };
    const qtangent=t=>{
      const tx=2*(1-t)*(ccx-ax)+2*t*(bx-ccx), ty=2*(1-t)*(ccy-ay)+2*t*(by-ccy);
      const l=Math.hypot(tx,ty)||1; return { ux:tx/l, uy:ty/l, px:-ty/l, py:tx/l }; };

    const line=(o,dash='')=>{
      const n=18; let d='';
      for(let i=0;i<=n;i++){ const t=i/n, pt=qpoint(t), tan=qtangent(t);
        const X=pt.x+tan.px*o, Y=pt.y+tan.py*o; d+=(i?'L':'M')+X.toFixed(1)+' '+Y.toFixed(1)+' '; }
      return `<path class="emo" fill="none" d="${d}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
    };
    const zig=(amp,off1=0)=>{
      const n=Math.max(6,Math.round(L/16)); let d='';
      for(let i=0;i<=n;i++){ const t=i/n, pt=qpoint(t), tan=qtangent(t);
        const a=(i===0||i===n)?0:(i%2?amp:-amp)+off1;
        const X=pt.x+tan.px*a, Y=pt.y+tan.py*a; d+=(i?'L':'M')+X.toFixed(1)+' '+Y.toFixed(1)+' '; }
      return `<path class="emo" fill="none" d="${d}"/>`;
    };
    // zig()'s vertices swing to +-amp and only snap back to the exact
    // endpoint on the very last vertex, so the path's true final segment
    // approaches from that last peak's angle, not the smooth curve tangent —
    // this mirrors that same vertex so arrow() can point the way the zigzag
    // actually arrives instead of the way the idealized curve would.
    const zigLastVertex=(amp)=>{
      const n=Math.max(6,Math.round(L/16));
      const t=(n-1)/n, pt=qpoint(t), tan=qtangent(t);
      const a=(n-1)%2?amp:-amp;
      return { x: pt.x+tan.px*a, y: pt.y+tan.py*a };
    };
    const arrow=(from)=>{
      let ux,uy,px,py;
      if(from){ const dx=bx-from.x, dy=by-from.y, l=Math.hypot(dx,dy)||1;
        ux=dx/l; uy=dy/l; px=-uy; py=ux; }
      else { const tan=qtangent(1); ({ux,uy,px,py}=tan); }
      const a=10; const lx=bx-ux*a, ly=by-uy*a;
      return `<path class="emo" d="M${lx+px*6} ${ly+py*6} L${bx} ${by} L${lx-px*6} ${ly-py*6}"/>`;
    };
    switch(key){
      case 'close':       return line(-3)+line(3);
      case 'fused':       return line(-5)+line(0)+line(5);
      case 'affiliated':  return line(0);
      case 'distant':     return line(0,'3 6');
      case 'indifferent': return line(0,'2 6');
      case 'temporary':   return line(0,'2 5');
      case 'conflict':    return zig(7);
      case 'fusedHostile':return line(-6)+line(6)+zig(6);
      case 'abuse':       return zig(7)+arrow(zigLastVertex(7));
      case 'neglect':     return line(0,'3 6')+arrow();
      case 'cutoff': {
        const pt1=qpoint(0.47), tan1=qtangent(0.47), pt2=qpoint(0.53), tan2=qtangent(0.53);
        const [a1,b1]=[pt1.x+tan1.px*10, pt1.y+tan1.py*10], [a2,b2]=[pt1.x-tan1.px*10, pt1.y-tan1.py*10];
        const [c1,d1]=[pt2.x+tan2.px*10, pt2.y+tan2.py*10], [c2,d2]=[pt2.x-tan2.px*10, pt2.y-tan2.py*10];
        return line(0)+`<path class="emo" d="M${a1} ${b1} L${a2} ${b2} M${c1} ${d1} L${c2} ${d2}"/>`;
      }
      case 'cutoffRepaired': {
        // same two cutoff tick marks, spread further apart to leave room for
        // a small "repaired" circle sitting between them — reads as |o|
        const pt1=qpoint(0.42), tan1=qtangent(0.42), pt2=qpoint(0.58), tan2=qtangent(0.58);
        const [a1,b1]=[pt1.x+tan1.px*10, pt1.y+tan1.py*10], [a2,b2]=[pt1.x-tan1.px*10, pt1.y-tan1.py*10];
        const [c1,d1]=[pt2.x+tan2.px*10, pt2.y+tan2.py*10], [c2,d2]=[pt2.x-tan2.px*10, pt2.y-tan2.py*10];
        const mid=qpoint(0.5);
        return line(0)+`<path class="emo" d="M${a1} ${b1} L${a2} ${b2} M${c1} ${d1} L${c2} ${d2}"/>`+`<circle class="emo" cx="${mid.x}" cy="${mid.y}" r="7"/>`;
      }
      default:            return line(0);
    }
  }

  return { R, STK, shape, mini, relMini, emotional };
})();
