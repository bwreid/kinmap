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

  byId(id){ return this.people.find(p=>p.id===id); },
  parentsUnion(id){ return this.unions.find(u=>u.children.includes(id)); },
  partnerUnions(id){ return this.unions.filter(u=>u.partners.includes(id)); },
  primaryUnion(id){ return this.partnerUnions(id)[0] || null; },
  relsOf(id){ return this.rels.filter(r=>r.a===id||r.b===id); },
  index(){ return this.people.find(p=>p.index); },
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
      default:             return wrap(`<path d="M2 ${y} H44" ${B}/>`);
    }
  }

  /* ---- emotional line between two node centers (canvas overlay) ---- */
  function emotional(key, x1,y1,x2,y2){
    const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1;
    const ux=dx/len, uy=dy/len, px=-uy, py=ux;       // unit + perpendicular
    const trim=33;                                   // keep clear of symbols
    const ax=x1+ux*trim, ay=y1+uy*trim, bx=x2-ux*trim, by=y2-uy*trim;
    const L=Math.hypot(bx-ax,by-ay);
    const line=(ox,oy,dash='')=>`<path class="emo" d="M${ax+px*ox} ${ay+py*oy} L${bx+px*ox} ${by+py*oy}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
    const off=(x,y,o)=>[x+px*o, y+py*o];
    const zig=(amp,off1=0)=>{
      const n=Math.max(3,Math.round(L/16)); let d='';
      for(let i=0;i<=n;i++){ const t=i/n, sx=ax+(bx-ax)*t, sy=ay+(by-ay)*t;
        const a=(i===0||i===n)?0:(i%2?amp:-amp)+off1;
        const X=sx+px*a, Y=sy+py*a; d+=(i?'L':'M')+X.toFixed(1)+' '+Y.toFixed(1)+' '; }
      return `<path class="emo" d="${d}"/>`;
    };
    const arrow=()=>{ const a=10; const lx=bx-ux*a, ly=by-uy*a;
      return `<path class="emo" d="M${lx+px*6} ${ly+py*6} L${bx} ${by} L${lx-px*6} ${ly-py*6}"/>`; };
    switch(key){
      case 'close':       return line(-3,-3)+line(3,3);
      case 'fused':       return line(-5,-5)+line(0,0)+line(5,5);
      case 'affiliated':  return line(0,0);
      case 'distant':     return line(0,0,'3 6');
      case 'indifferent': return line(0,0,'2 6');
      case 'temporary':   return line(0,0,'2 5');
      case 'conflict':    return zig(7);
      case 'fusedHostile':return line(-6,-6)+line(6,6)+zig(6);
      case 'abuse':       return zig(7)+arrow();
      case 'neglect':     return line(0,0,'3 6')+arrow();
      case 'cutoff': {
        const mx=(ax+bx)/2, my=(ay+by)/2;
        const [a1,b1]=off(mx-ux*5,my-uy*5,10),[a2,b2]=off(mx-ux*5,my-uy*5,-10);
        const [c1,d1]=off(mx+ux*5,my+uy*5,10),[c2,d2]=off(mx+ux*5,my+uy*5,-10);
        return line(0,0)+`<path class="emo" d="M${a1} ${b1} L${a2} ${b2} M${c1} ${d1} L${c2} ${d2}"/>`;
      }
      default:            return line(0,0);
    }
  }

  return { R, STK, shape, mini, relMini, emotional };
})();
