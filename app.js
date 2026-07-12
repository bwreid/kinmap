/* ============================================================
   Kinmap — app state + interactions
   ============================================================ */
const App = (()=>{
  const state = { selected:null, selectedUnion:null, drawer:null, mode:'normal', relPair:[], relType:null, addRelation:'child', showEmo:true };
  const RANK_STEP = 1000;
  const NUDGE_STEP = 8, NUDGE_BIG = 32;

  /* ---------- boot ---------- */
  function init(){
    const saved = Storage.loadAutosave();
    if(saved){ try{ Storage.hydrate(saved); }catch(_){} }
    View.init();
    rerender();
    View.fit();
    wire();
    applyEmoVisibility();
  }
  function rerender(){ View.canvas(); View.list(); }

  /* ---------- selection ---------- */
  function select(id){
    if(state.mode==='relate'){ togglePair(id); return; }
    state.selected=id; state.selectedUnion=null; View.selection();
    if(id) openDrawer('inspect');
    if(id && state.mode==='edit') flash('Use ← → to nudge this member (Shift for a bigger step)', 3200);
  }
  function deselect(){ if(state.mode==='relate') return; state.selected=null; state.selectedUnion=null; View.selection(); closeDrawer(); }
  function selectUnion(uid){
    state.selected=null; closeDrawer();
    state.selectedUnion=uid; View.selection();
    flash('Use ← → to nudge where this line begins (Shift for a bigger step)', 3200);
  }

  /* ---------- drawer ---------- */
  function openDrawer(mode){
    state.drawer=mode;
    const d=document.getElementById('drawer');
    d.innerHTML = mode==='add'? addForm() : mode==='edit'? editForm() : inspectView();
    d.classList.add('open');
    bindDrawer();
  }
  function closeDrawer(){ state.drawer=null; document.getElementById('drawer').classList.remove('open'); }

  /* ---------- add-member form ---------- */
  let form = {};
  function addForm(){
    const relation = state.addRelation;
    form = { name:'', sex:'m', age:'', deceased:false, conn:'bio', index:false, relation, target:'u3' };
    const seg=(opts,val,grp)=>opts.map(o=>`<button class="seg-b${o.v===val?' on':''}" data-grp="${grp}" data-v="${o.v}">${o.l}</button>`).join('');
    const showFam = FAM.people.length > 0;
    const relLabel={child:'Child of',sibling:'Sibling of',partner:'Partner of',parent:'Parent of'}[relation]||'';
    return `
    <div class="drawer-h"><h3>Add family member</h3><button class="x" data-act="close">✕</button></div>
    <div class="drawer-body">
      <div class="fld"><label>Full name</label><input class="inp" data-f="name" placeholder="e.g. Marcus Bell" autocomplete="off"></div>
      <div class="fld"><label>Sex / symbol</label><div class="seg" data-seg="sex">${seg([{v:'m',l:'☐ Male'},{v:'f',l:'◯ Female'},{v:'u',l:'? Unknown'}],'m','sex')}</div></div>
      <div class="fld two"><div><label>Age</label><input class="inp" data-f="age" inputmode="numeric" placeholder="—"></div>
        <div><label>Status</label><div class="seg" data-seg="status">${seg([{v:'living',l:'Living'},{v:'dec',l:'Deceased'}],'living','status')}</div></div></div>
      <div data-fam-section${showFam ? '' : ' style="display:none"'}>
        <div class="rule"></div>
        <div class="fld"><label>Place in family</label>
          <div class="seg" data-seg="relation">${seg([{v:'child',l:'Child'},{v:'sibling',l:'Sibling'},{v:'partner',l:'Partner'},{v:'parent',l:'Parent'},{v:'none',l:'Unconnected'}],relation,'relation')}</div></div>
        <div class="fld" data-target-fld style="${relation==='none'?'display:none':''}"><label data-rel-label>${relLabel}</label>
          <select class="inp" data-f="target">${targetOptions(relation)}</select>
          <p class="hint">Tree re-balances automatically by generation.</p></div>
        <div class="fld" data-conn-fld style="${(relation==='child'||relation==='sibling')?'':'display:none'}"><label>Biological connection</label>
          <div class="seg" data-seg="conn">${seg([{v:'bio',l:'Biological'},{v:'adopted',l:'Adopted'},{v:'foster',l:'Foster'}],'bio','conn')}</div></div>
      </div>
      <label class="check"><input type="checkbox" data-f="index"> Mark as index patient</label>
    </div>
    <div class="drawer-foot">
      <button class="btn ghost" data-act="close">Cancel</button>
      <button class="btn primary" data-act="add">＋ Add to genogram</button>
    </div>`;
  }
  function targetOptions(relation){
    if(relation==='none') return '';
    if(relation==='child'){
      return FAM.unions.map(u=>{ const ns=u.partners.map(id=>FAM.byId(id).name.split(' ')[0]).join(' + ');
        return `<option value="${u.id}">${ns}</option>`; }).join('')
        + FAM.people.filter(p=>!FAM.primaryUnion(p.id)).map(p=>`<option value="p:${p.id}">${p.name} (single parent)</option>`).join('');
    }
    return FAM.people.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  }

  /* ---------- edit-member form ---------- */
  function editForm(){
    const p=FAM.byId(state.selected); if(!p) return '';
    form = { name:p.name, sex:p.sex, deceased:!!p.deceased, conn:p.conn||'bio' };
    const seg=(opts,val,grp)=>opts.map(o=>`<button class="seg-b${o.v===val?' on':''}" data-grp="${grp}" data-v="${o.v}">${o.l}</button>`).join('');
    const hasParents = !!FAM.parentsUnion(p.id);
    return `
    <div class="drawer-h"><h3>Edit ${p.name}</h3><button class="x" data-act="close">✕</button></div>
    <div class="drawer-body">
      <div class="fld"><label>Full name</label><input class="inp" data-f="name" value="${p.name}" placeholder="e.g. Marcus Bell" autocomplete="off"></div>
      <div class="fld"><label>Sex / symbol</label><div class="seg" data-seg="sex">${seg([{v:'m',l:'☐ Male'},{v:'f',l:'◯ Female'},{v:'u',l:'? Unknown'}],p.sex,'sex')}</div></div>
      <div class="fld two"><div><label>Age</label><input class="inp" data-f="age" inputmode="numeric" value="${p.age!=null?p.age:''}" placeholder="—"></div>
        <div><label>Status</label><div class="seg" data-seg="status">${seg([{v:'living',l:'Living'},{v:'dec',l:'Deceased'}],p.deceased?'dec':'living','status')}</div></div></div>
      <div class="fld" data-dinfo-fld style="${p.deceased?'':'display:none'}"><label>Death detail</label><input class="inp" data-f="dinfo" value="${p.dInfo||''}" placeholder="e.g. d. 2014"></div>
      ${hasParents?`<div class="fld"><label>Biological connection</label><div class="seg" data-seg="conn">${seg([{v:'bio',l:'Biological'},{v:'adopted',l:'Adopted'},{v:'foster',l:'Foster'}],p.conn||'bio','conn')}</div></div>`:''}
      <label class="check"><input type="checkbox" data-f="index" ${p.index?'checked':''}> Mark as index patient</label>
    </div>
    <div class="drawer-foot">
      <button class="btn ghost" data-act="close">Cancel</button>
      <button class="btn primary" data-act="save-edit">Save changes</button>
    </div>`;
  }

  /* ---------- inspector ---------- */
  function inspectView(){
    const p=FAM.byId(state.selected); if(!p) return '';
    const pu=FAM.parentsUnion(p.id);
    const parents = pu? pu.partners.map(id=>FAM.byId(id).name).join(', ') : '—';
    const myUnions = FAM.partnerUnions(p.id);
    const partners = myUnions.flatMap(u=>u.partners.filter(id=>id!==p.id)).map(id=>FAM.byId(id).name).join(', ')||'—';
    const kids = myUnions.flatMap(u=>u.children).map(id=>FAM.byId(id).name).join(', ')||'—';
    const rels = FAM.relsOf(p.id);
    const relRows = rels.length? rels.map(r=>{ const oId=r.a===p.id?r.b:r.a; const o=FAM.byId(oId); const t=REL_BY_KEY[r.type];
      return `<div class="rel-row"><span class="rl">${SYM.relMini(r.type)}</span><span class="rn">${o.name}</span><span class="rt">${t?t.label:r.type}</span>
        <button class="rx" data-rmrel="${r.a}__${r.b}" title="Remove">✕</button></div>`; }).join('')
      : `<p class="hint">No relationships mapped yet.</p>`;

    // editable partner unions (marriage / divorce / etc.)
    const partnerOpts = REL_TYPES.partner.map(t=>`<option value="${t.key}">${t.label}</option>`).join('');
    const unionRows = myUnions.length? myUnions.map(u=>{
      const other=u.partners.find(id=>id!==p.id);
      const oName=other?FAM.byId(other).name:'(no partner)';
      const sel=t=>REL_TYPES.partner.some(x=>x.key===u.type)?u.type:'marriage';
      return `<div class="union-row">
        <span class="rl">${SYM.relMini(u.type)}</span>
        <span class="rn">${oName}</span>
        <select class="union-type" data-uedit="${u.id}">${REL_TYPES.partner.map(t=>`<option value="${t.key}"${t.key===sel()?' selected':''}>${t.label}</option>`).join('')}</select>
        <button class="rx" data-rmunion="${u.id}" title="Remove union">✕</button>
      </div>`;
    }).join('') : `<p class="hint">No partner unions.</p>`;

    return `
    <div class="drawer-h"><h3>${p.name}</h3><button class="x" data-act="close">✕</button></div>
    <div class="drawer-body">
      <div class="insp-id">
        <div class="insp-sym" style="color:${p.index?'var(--accent)':'var(--stroke)'}">${SYM.mini(p,46)}</div>
        <div>${p.index?`<span class="ip-badge">Index patient</span>`:''}
          <div class="insp-meta">${p.sex==='m'?'Male':p.sex==='f'?'Female':'Unknown'} · ${p.deceased?(p.dInfo||'Deceased'):'Living'}${p.age!=null?` · ${p.age}`:''}</div></div>
      </div>
      <div class="kv"><span>Parents</span><b>${parents}</b></div>
      <div class="kv"><span>Partner(s)</span><b>${partners}</b></div>
      <div class="kv"><span>Children</span><b>${kids}</b></div>
      <div class="rule"></div>
      <div class="sec-h">Partner unions <span class="cnt">${myUnions.length}</span></div>
      <div class="union-list">${unionRows}</div>
      <div class="rule"></div>
      <div class="sec-h">Emotional ties <span class="cnt">${rels.length}</span></div>
      <div class="rel-list">${relRows}</div>
      <button class="btn block" data-act="relate-from">＋ Add relationship</button>
    </div>
    <div class="drawer-foot">
      <button class="btn ghost danger" data-act="delete">Delete</button>
      ${(p.rowOrder!=null||p.rowOffset!=null)?`<button class="btn ghost" data-act="reset-pos">↺ Reset position</button>`:''}
      <button class="btn ghost" data-act="edit">✎ Edit</button>
      <button class="btn primary" data-act="close">Done</button>
    </div>`;
  }

  /* ---------- mutations ---------- */
  function commitAdd(){
    const d=document.getElementById('drawer');
    const name=(d.querySelector('[data-f=name]').value||'').trim()|| (form.sex==='f'?'New (F)':'New (M)');
    const age=parseInt(d.querySelector('[data-f=age]').value,10);
    const idx=d.querySelector('[data-f=index]').checked;
    const target=(d.querySelector('[data-f=target]')?.value)||'';
    const np={ id:FAM.uid('p'), name, sex:form.sex, conn:form.conn, deceased:form.deceased,
               age:isNaN(age)?null:age, gen:0 };
    if(form.deceased) np.dInfo='deceased';

    const famSec=d.querySelector('[data-fam-section]');
    if(famSec && famSec.style.display==='none'){
      if(idx){ FAM.people.forEach(p=>p.index=false); np.index=true; }
      FAM.people.push(np);
      rerender(); state.selected=np.id; View.selection(); openDrawer('inspect');
      flash(np.name+' added'); Storage.autosave();
      return;
    }

    if(form.relation==='none'){
      np.gen=(FAM.index()?.gen)??2; FAM.people.push(np);
    } else if(form.relation==='child'){
      let u;
      if(target.startsWith('p:')){ const par=target.slice(2); u={id:FAM.uid('u'),partners:[par],type:'marriage',children:[]}; FAM.unions.push(u); }
      else u=FAM.unions.find(x=>x.id===target);
      np.gen=FAM.byId(u.partners[0]).gen+1; u.children.push(np.id); FAM.people.push(np);
    } else if(form.relation==='sibling'){
      const x=FAM.byId(target), pu=FAM.parentsUnion(x.id);
      np.gen=x.gen; FAM.people.push(np);
      // Only add to existing parent union — don't create an empty-partners union
      // for root people (no parents in tree). They'll be placed via the safety layout.
      if(pu) pu.children.push(np.id);
    } else if(form.relation==='partner'){
      const x=FAM.byId(target); np.gen=x.gen; FAM.people.push(np);
      // If x is a lone parent (single-partner union that already has children),
      // join that union as co-parent so the children connect to the couple —
      // rather than spawning a separate, childless union.
      const lone = FAM.unions.find(u=>u.partners.length===1 && u.partners[0]===x.id && u.children.length);
      if(lone) lone.partners.push(np.id);
      else FAM.unions.push({id:FAM.uid('u'),partners:[x.id,np.id],type:'marriage',children:[]});
    } else { // parent
      const x=FAM.byId(target); np.gen=x.gen-1; FAM.people.push(np);
      const pu=FAM.parentsUnion(x.id);
      if(pu && pu.partners.length<2) pu.partners.push(np.id);
      else FAM.unions.push({id:FAM.uid('u'),partners:[np.id],type:'marriage',children:[x.id]});
    }
    if(idx){ FAM.people.forEach(p=>p.index=false); np.index=true; }
    rerender(); state.selected=np.id; View.selection(); openDrawer('inspect');
    flash(np.name+' added'); Storage.autosave();
  }

  function commitEdit(){
    const d=document.getElementById('drawer');
    const p=FAM.byId(state.selected); if(!p) return;
    const name=(d.querySelector('[data-f=name]').value||'').trim()||p.name;
    const age=parseInt(d.querySelector('[data-f=age]').value,10);
    const idx=d.querySelector('[data-f=index]').checked;
    const dinfo=(d.querySelector('[data-f=dinfo]')?.value||'').trim();

    p.name=name; p.sex=form.sex; p.deceased=form.deceased;
    p.age=isNaN(age)?null:age;
    if(p.deceased) p.dInfo=dinfo||'deceased'; else delete p.dInfo;
    if(FAM.parentsUnion(p.id)) p.conn=form.conn;
    if(idx) FAM.people.forEach(x=>x.index=(x===p)); else p.index=false;

    rerender(); View.selection(); openDrawer('inspect');
    flash(p.name+' updated'); Storage.autosave();
  }

  function deletePerson(id){
    if(FAM.byId(id)?.index){ flash('Cannot delete the index patient'); return; }
    FAM.people=FAM.people.filter(p=>p.id!==id);
    FAM.unions.forEach(u=>{ u.partners=u.partners.filter(x=>x!==id); u.children=u.children.filter(x=>x!==id); });
    FAM.unions=FAM.unions.filter(u=>u.partners.length||u.children.length);
    FAM.rels=FAM.rels.filter(r=>r.a!==id&&r.b!==id);
    state.selected=null; rerender(); closeDrawer(); Storage.autosave();
  }

  /* ---------- relationship builder ---------- */
  function enterRelate(seed){
    if(state.mode==='edit') exitEdit();
    closeDrawer(); // close any open drawer before entering relate mode
    state.mode='relate'; state.relPair = seed?[seed]:[]; state.relType=null;
    document.getElementById('relbar').classList.add('open');
    document.body.classList.add('relating');
    renderRelbar(); View.selection();
  }
  function exitRelate(){
    state.mode='normal'; state.relPair=[]; state.relType=null;
    document.getElementById('relbar').classList.remove('open');
    document.body.classList.remove('relating');
    View.selection();
  }

  /* ---------- manual edit mode (drag-to-reorder within a generation) ---------- */
  function enterEdit(){
    if(state.mode==='relate') exitRelate();
    closeDrawer();
    state.mode='edit';
    document.body.classList.add('editing');
    document.getElementById('toggle-edit-btn')?.classList.add('on');
    rerender();   // bus-origin handles only render while in edit mode
  }
  function exitEdit(){
    state.mode='normal';
    state.selectedUnion=null;
    document.body.classList.remove('editing');
    document.getElementById('toggle-edit-btn')?.classList.remove('on');
    rerender();
  }
  function resetRowOrder(ids){
    ids.forEach(id=>{ const p=FAM.byId(id); if(p){ delete p.rowOrder; delete p.rowOffset; } });
  }
  function togglePair(id){
    const i=state.relPair.indexOf(id);
    if(i>=0) state.relPair.splice(i,1);
    else { if(state.relPair.length>=2) state.relPair.shift(); state.relPair.push(id); }
    renderRelbar(); View.selection();
  }
  function applyRel(){
    const [a,b]=state.relPair, t=state.relType;
    if(!a||!b||!t) return;
    const isPartner = REL_TYPES.partner.some(r=>r.key===t);
    if(isPartner){
      const u=FAM.unions.find(u=>u.partners.includes(a)&&u.partners.includes(b));
      if(u) u.type=t;
      else {
        FAM.unions.push({id:FAM.uid('u'),partners:[a,b],type:t,children:[]});
        // Align new partner's gen to the other's gen so they share a row
        const pa=FAM.byId(a), pb=FAM.byId(b);
        if(pa && pb && pa.gen !== pb.gen) pb.gen=pa.gen;
      }
    } else {
      FAM.rels=FAM.rels.filter(r=>!((r.a===a&&r.b===b)||(r.a===b&&r.b===a)));
      FAM.rels.push({a,b,type:t});
    }
    exitRelate(); rerender(); flash('Relationship added'); Storage.autosave();
  }
  function renderRelbar(){
    const bar=document.getElementById('relbar');
    const [a,b]=state.relPair;
    const chip=(id,n)=> id? `<span class="pchip">${SYM.mini(FAM.byId(id),18)}${FAM.byId(id).name.split(' ')[0]}</span>`
                          : `<span class="pchip empty">${n}</span>`;
    const grp=(arr)=>arr.map(r=>`<button class="rpick${state.relType===r.key?' on':''}" data-rtype="${r.key}">${SYM.relMini(r.key)}<span>${r.label}</span></button>`).join('');
    bar.innerHTML=`
      <div class="rb-title">Add relationship</div>
      <div class="rb-steps">
        <span class="st ${a?'done':'now'}">1</span>${chip(a,'Select first person')}
        <span class="arr">→</span>
        <span class="st ${b?'done':(a?'now':'')}">2</span>${chip(b,'Select second person')}
      </div>
      <div class="rb-pick">
        <div class="rb-grp"><div class="rb-gl">Partner / family</div><div class="rb-chips">${grp(REL_TYPES.partner)}</div></div>
        <div class="rb-grp"><div class="rb-gl">Emotional quality</div><div class="rb-chips">${grp(REL_TYPES.emotional)}</div></div>
      </div>
      <div class="rb-foot">
        <button class="btn ghost" data-act="rel-cancel">Cancel</button>
        <button class="btn primary" data-act="rel-apply" ${(a&&b&&state.relType)?'':'disabled'}>Apply</button>
      </div>`;
  }

  /* ---------- new genogram ---------- */
  function newGenogram(){
    if(FAM.people.length===0){ doNewGenogram(); return; }
    document.getElementById('new-modal').classList.add('open');
  }
  function doNewGenogram(){
    FAM.people=[]; FAM.unions=[]; FAM.rels=[]; FAM._n=100;
    state.selected=null; state.selectedUnion=null; state.mode='normal'; state.relPair=[]; state.relType=null;
    closeDrawer();
    document.getElementById('relbar').classList.remove('open');
    document.body.classList.remove('relating');
    document.body.classList.remove('editing');
    document.getElementById('toggle-edit-btn')?.classList.remove('on');
    document.getElementById('legend').classList.remove('open');
    document.getElementById('search').value='';
    rerender();
    View.resetView(); updZoom();
    flash('New genogram started'); Storage.autosave();
  }

  /* ---------- event wiring ---------- */
  function wire(){
    // toolbar
    document.getElementById('topbar').addEventListener('click',e=>{
      const b=e.target.closest('[data-act]'); if(!b) return;
      const a=b.dataset.act;
      if(a==='add'){ deselectSilent(); openDrawer('add'); }
      if(a==='relate'){ enterRelate(state.selected); }
      if(a==='fit'){ View.fit(); updZoom(); }
      if(a==='legend'){ document.getElementById('legend').classList.toggle('open'); }
      if(a==='toggle-emo'){ state.showEmo=!state.showEmo; applyEmoVisibility(); }
      if(a==='new'){ newGenogram(); }
      if(a==='save'){
        if(FAM.people.length===0){ flash('Nothing to save'); return; }
        const inp=document.getElementById('save-name-input');
        inp.value=''; document.getElementById('save-modal').classList.add('open');
        setTimeout(()=>inp.focus(),50);
      }
      if(a==='open'){
        Storage.renderSavesList('saves-list');
        document.getElementById('open-modal').classList.add('open');
      }
      if(a==='export'){ Storage.exportJSON(); }
    });
    // floating stage controls (zoom, edit-positions) — live over the canvas,
    // not inside #topbar
    document.getElementById('stage-canvas').addEventListener('click',e=>{
      const b=e.target.closest('[data-act]'); if(!b) return;
      const a=b.dataset.act;
      if(a==='zin'){ View.zoomBy(1.2); updZoom(); }
      if(a==='zout'){ View.zoomBy(1/1.2); updZoom(); }
      if(a==='toggle-edit'){ state.mode==='edit'?exitEdit():enterEdit(); }
      if(a==='reset-all-pos'){
        resetRowOrder(FAM.people.map(p=>p.id));
        FAM.unions.forEach(u=>delete u.busOffset);
        rerender(); flash('All manual positions reset'); Storage.autosave();
      }
    });
    // new-genogram modal
    document.getElementById('new-modal').addEventListener('click',e=>{
      const b=e.target.closest('[data-act]'); if(!b) return;
      const a=b.dataset.act;
      if(a==='new-cancel') document.getElementById('new-modal').classList.remove('open');
      if(a==='new-confirm'){ document.getElementById('new-modal').classList.remove('open'); doNewGenogram(); }
    });
    document.getElementById('new-modal').addEventListener('click',e=>{
      if(e.target===document.getElementById('new-modal')) document.getElementById('new-modal').classList.remove('open');
    });
    // save modal
    document.getElementById('save-modal').addEventListener('click',e=>{
      const b=e.target.closest('[data-act]'); if(!b) return;
      if(b.dataset.act==='save-cancel') document.getElementById('save-modal').classList.remove('open');
      if(b.dataset.act==='save-confirm'){
        const name=document.getElementById('save-name-input').value.trim()||'Untitled';
        const ok=Storage.saveNamed(name);
        document.getElementById('save-modal').classList.remove('open');
        flash(ok? 'Saved: '+name : 'Save failed: storage full');
      }
    });
    document.getElementById('save-modal').addEventListener('click',e=>{
      if(e.target===document.getElementById('save-modal')) document.getElementById('save-modal').classList.remove('open');
    });
    document.getElementById('save-name-input').addEventListener('keydown',e=>{
      if(e.key==='Enter') document.querySelector('[data-act="save-confirm"]').click();
    });
    // open modal
    document.getElementById('open-modal').addEventListener('click',e=>{
      const b=e.target.closest('[data-act]'); if(!b) return;
      if(b.dataset.act==='open-cancel') document.getElementById('open-modal').classList.remove('open');
      if(b.dataset.act==='load-entry'){
        const doc=Storage.loadNamed(b.dataset.key); if(!doc) return;
        Storage.hydrate(doc);
        state.selected=null; state.selectedUnion=null; state.mode='normal'; state.relPair=[]; state.relType=null;
        closeDrawer();
        document.getElementById('relbar').classList.remove('open');
        document.body.classList.remove('relating');
        document.body.classList.remove('editing');
        document.getElementById('toggle-edit-btn')?.classList.remove('on');
        document.getElementById('legend').classList.remove('open');
        document.getElementById('search').value='';
        rerender(); View.fit(); updZoom();
        document.getElementById('open-modal').classList.remove('open');
        Storage.autosave();
        flash('Loaded: '+doc.name);
      }
      if(b.dataset.act==='delete-entry'){
        Storage.deleteNamed(b.dataset.key);
        Storage.renderSavesList('saves-list');
      }
    });
    document.getElementById('open-modal').addEventListener('click',e=>{
      if(e.target===document.getElementById('open-modal')) document.getElementById('open-modal').classList.remove('open');
    });
    // member list
    document.getElementById('mlist').addEventListener('click',e=>{
      const r=e.target.closest('.mrow'); if(!r) return; select(r.dataset.id);
      if(state.mode!=='relate') focusNode(r.dataset.id);
    });
    document.getElementById('search').addEventListener('input',e=>{
      const q=e.target.value.toLowerCase();
      document.querySelectorAll('.mrow').forEach(r=>{ const n=r.querySelector('.mname').textContent.toLowerCase();
        r.style.display=n.includes(q)?'':'none'; });
    });
    // drawer (delegated)
    document.getElementById('drawer').addEventListener('click',e=>{
      const b=e.target.closest('[data-act]'); if(!b) return;
      const a=b.dataset.act;
      if(a==='close') closeDrawer();
      if(a==='add') commitAdd();
      if(a==='edit') openDrawer('edit');
      if(a==='save-edit') commitEdit();
      if(a==='delete') deletePerson(state.selected);
      if(a==='relate-from') enterRelate(state.selected);
      if(a==='reset-pos'){
        // manual position is purely personal now (rowOrder lives on just
        // this one person), so resetting only clears their own override —
        // everyone else in the row keeps whatever manual order they have
        resetRowOrder([state.selected]);
        rerender(); openDrawer('inspect'); flash('Position reset'); Storage.autosave();
      }
      if(a==='rmrel'){ }
    });
    document.getElementById('drawer').addEventListener('click',e=>{
      const rm=e.target.closest('[data-rmrel]'); if(rm){
        const [a,b]=rm.dataset.rmrel.split('__'); FAM.rels=FAM.rels.filter(r=>!(r.a===a&&r.b===b)); rerender(); openDrawer('inspect'); Storage.autosave(); return;
      }
      const ru=e.target.closest('[data-rmunion]'); if(ru){
        const uid=ru.dataset.rmunion; const u=FAM.unions.find(x=>x.id===uid);
        if(u){
          if(u.children.length){
            // keep children parented to the remaining partner; just drop the selected person
            u.partners=u.partners.filter(id=>id!==state.selected);
            if(!u.partners.length) FAM.unions=FAM.unions.filter(x=>x.id!==uid);
          } else FAM.unions=FAM.unions.filter(x=>x.id!==uid);
        }
        rerender(); openDrawer('inspect'); flash('Union removed'); Storage.autosave();
      }
    });
    document.getElementById('drawer').addEventListener('change',e=>{
      const ue=e.target.closest('[data-uedit]'); if(!ue) return;
      const u=FAM.unions.find(x=>x.id===ue.dataset.uedit);
      if(u){ u.type=ue.value; rerender(); openDrawer('inspect'); flash('Union updated'); Storage.autosave(); }
    });
    // relbar
    document.getElementById('relbar').addEventListener('click',e=>{
      const t=e.target.closest('[data-rtype]'); if(t){ state.relType=t.dataset.rtype; renderRelbar(); return; }
      const b=e.target.closest('[data-act]'); if(!b) return;
      if(b.dataset.act==='rel-cancel') exitRelate();
      if(b.dataset.act==='rel-apply') applyRel();
    });
    // canvas pan/zoom + node click
    canvasEvents();
    // edit-mode arrow-key nudge: fine horizontal positioning, independent of
    // the drag gesture — either a selected person's rowOffset (engine.js) or
    // a selected union's bus-origin busOffset, whichever is currently selected
    document.addEventListener('keydown', e=>{
      if(state.mode!=='edit' || (!state.selected && !state.selectedUnion)) return;
      if(e.target.closest('input,textarea,select,[contenteditable]')) return;
      if(e.key!=='ArrowLeft' && e.key!=='ArrowRight') return;
      e.preventDefault();
      const step=e.shiftKey?NUDGE_BIG:NUDGE_STEP;
      const delta=e.key==='ArrowRight'?step:-step;
      if(state.selectedUnion){
        const u=FAM.unions.find(x=>x.id===state.selectedUnion); if(!u) return;
        u.busOffset=(u.busOffset||0)+delta;
        rerender(); Storage.autosave();
        return;
      }
      const p=FAM.byId(state.selected); if(!p) return;
      p.rowOffset=(p.rowOffset||0)+delta;
      rerender(); Storage.autosave();
    });
  }
  function bindDrawer(){
    const d=document.getElementById('drawer');
    d.querySelectorAll('.seg-b').forEach(b=>b.addEventListener('click',()=>{
      const grp=b.dataset.grp, v=b.dataset.v;
      d.querySelectorAll(`.seg-b[data-grp=${grp}]`).forEach(x=>x.classList.toggle('on',x===b));
      if(grp==='sex') form.sex=v;
      if(grp==='conn') form.conn=v;
      if(grp==='status'){
        form.deceased=(v==='dec');
        const dinfoFld=d.querySelector('[data-dinfo-fld]');
        if(dinfoFld) dinfoFld.style.display=form.deceased?'':'none';
      }
      if(grp==='relation'){ form.relation=v; state.addRelation=v;
        d.querySelector('[data-rel-label]').textContent={child:'Child of',sibling:'Sibling of',partner:'Partner of',parent:'Parent of'}[v]||'';
        d.querySelector('[data-f=target]').innerHTML=targetOptions(v);
        d.querySelector('[data-conn-fld]').style.display=(v==='child'||v==='sibling')?'':'none';
        d.querySelector('[data-target-fld]').style.display=(v==='none')?'none':'';
      }
    }));
    const idxCb=d.querySelector('[data-f=index]');
    if(idxCb) idxCb.addEventListener('change',()=>{
      const famSec=d.querySelector('[data-fam-section]'); if(!famSec) return;
      const show=!idxCb.checked && FAM.people.length>0;
      famSec.style.display=show?'':'none';
    });
  }

  function applyEmoVisibility(){
    document.getElementById('canvas').classList.toggle('hide-emo', !state.showEmo);
    document.getElementById('toggle-emo-btn')?.classList.toggle('on', state.showEmo);
  }

  function deselectSilent(){ state.selected=null; state.selectedUnion=null; View.selection(); }
  function focusNode(){ /* could center; keep view stable */ }
  function updZoom(){ const z=document.getElementById('zpct'); if(z) z.textContent=View.zoomPct()+'%'; }

  /* ---- edit-mode drag-to-reorder helpers ----
     Every drag moves exactly ONE person — never their spouse(s), never a
     "block" — and re-sequences them anywhere among everyone else in the
     same generation row. There's no adjacency requirement: a union whose
     partners land non-adjacent after this still renders fine (the existing
     obstruction-routing in View bows the line up and over whoever ends up
     in between), which is the point — manual placement is meant to escape
     the auto-balancing heuristics, not extend them. */
  function startDrag(node, e){
    const id=node.dataset.id, p=FAM.byId(id); if(!p) return null;
    const others=Layout.peopleInGen(p.gen).filter(oid=>oid!==id)
      .map(oid=>({ id:oid, c:Layout.pos(oid).x, half:Layout.nodeHalf }));
    // deliberately no early bail-out when `others` is empty (the sole person
    // in their generation, e.g. an only child) — there's nothing to reorder
    // against, but they can still be dragged continuously via rowOffset;
    // returning null here used to fall through to canvas-panning instead
    // homeIdx: where they'd slot back in among `others` at their own
    // starting x — the indicator only makes sense once the drop position
    // has moved past this, not from the very start of an in-place reposition
    const myX=Layout.pos(id).x;
    let homeIdx=others.length;
    for(let i=0;i<others.length;i++){ if(myX<others[i].c){ homeIdx=i; break; } }
    return { kind:'person', id, gen:p.gen, others, homeIdx, startX:e.clientX, startY:e.clientY, moved:false, dropIdx:null };
  }
  function updateDrag(drag, e){
    const w=View.toWorld(e.clientX, e.clientY);
    drag.lastX=w.x;
    const el=document.querySelector(`.node[data-id="${drag.id}"]`);
    if(el) el.setAttribute('transform',`translate(${w.x},${Layout.pos(drag.id).y})`);
    let idx=drag.others.length;
    for(let i=0;i<drag.others.length;i++){ if(w.x<drag.others[i].c){ idx=i; break; } }
    drag.dropIdx=idx;
    if(idx===drag.homeIdx) endDragVisual();
    else showDragIndicator(drag.others, idx, Layout.pos(drag.id).y);
  }
  function showDragIndicator(others, idx, y){
    let line=document.getElementById('drag-indicator');
    if(!line){
      line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.id='drag-indicator';
      document.getElementById('world').appendChild(line);
    }
    const before=others[idx-1], after=others[idx];
    const x = before&&after ? (before.c+before.half+after.c-after.half)/2
            : after ? after.c-after.half-40
            : before ? before.c+before.half+40 : 0;
    line.setAttribute('x1',x); line.setAttribute('x2',x);
    line.setAttribute('y1',y-70); line.setAttribute('y2',y+70);
  }
  function endDragVisual(){ document.getElementById('drag-indicator')?.remove(); }
  function commitDrag(drag){
    const order=drag.others.slice();
    order.splice(drag.dropIdx, 0, { id:drag.id });
    order.forEach((s,i)=>{ const p=FAM.byId(s.id); if(p) p.rowOrder=(i+1)*RANK_STEP; });
    // continuous fine-position: find where this slot would land with zero
    // offset, then store the leftover distance to the actual drop point as
    // rowOffset — one drag gesture sets both order AND fine position;
    // arrow keys still work afterward for further adjustment
    const p=FAM.byId(drag.id);
    delete p.rowOffset;
    Layout.compute();
    const naturalX=Layout.pos(drag.id).x;
    const offset=drag.lastX-naturalX;
    if(Math.abs(offset)>=1) p.rowOffset=offset; else delete p.rowOffset;
    rerender(); flash('Position updated'); Storage.autosave();
  }

  /* ---- a union's own line-origin handle: a simple 1:1 pixel-follow drag,
     no reordering/siblings concept (unlike a person's drag), just a direct
     continuous nudge of engine.js's busOffset ---- */
  function startBusDrag(handle, e){
    const uid=handle.dataset.uid, u=FAM.unions.find(x=>x.id===uid); if(!u) return null;
    const baseX=parseFloat(handle.dataset.x) - (u.busOffset||0);   // raw, offset-free mx
    return { kind:'bus', uid, baseX, startX:e.clientX, startY:e.clientY, moved:false, lastX:parseFloat(handle.dataset.x) };
  }
  function updateBusDrag(drag, e){
    const w=View.toWorld(e.clientX, e.clientY);
    drag.lastX=w.x;
    const el=document.querySelector(`.bus-handle[data-uid="${drag.uid}"]`);
    if(el) el.setAttribute('transform',`translate(${w.x},${el.dataset.y})`);
  }
  function commitBusDrag(drag){
    const u=FAM.unions.find(x=>x.id===drag.uid); if(!u) return;
    const offset=drag.lastX-drag.baseX;
    if(Math.abs(offset)>=1) u.busOffset=offset; else delete u.busOffset;
    rerender(); flash('Position updated'); Storage.autosave();
  }

  function canvasEvents(){
    const svg=document.getElementById('canvas');
    let down=null, moved=false, drag=null;
    svg.addEventListener('pointerdown',e=>{
      if(state.mode==='edit'){
        const handle=e.target.closest('.bus-handle');
        if(handle){ drag=startBusDrag(handle, e); if(drag) svg.setPointerCapture(e.pointerId); }
        if(!drag){
          const node=e.target.closest('.node');
          if(node){ drag=startDrag(node, e); if(drag) svg.setPointerCapture(e.pointerId); }
        }
        if(drag) return;
      }
      down={x:e.clientX,y:e.clientY,vx:View.panView.x,vy:View.panView.y}; moved=false; svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove',e=>{
      if(drag){
        if(!drag.moved && Math.abs(e.clientX-drag.startX)+Math.abs(e.clientY-drag.startY)<=4) return;
        drag.moved=true;
        if(drag.kind==='bus') updateBusDrag(drag, e); else updateDrag(drag, e);
        return;
      }
      if(!down) return; const dx=e.clientX-down.x, dy=e.clientY-down.y;
      if(Math.abs(dx)+Math.abs(dy)>4) moved=true;
      View.panView.x=down.vx+dx; View.panView.y=down.vy+dy;
      document.getElementById('world').setAttribute('transform',`translate(${View.panView.x},${View.panView.y}) scale(${View.panView.k})`);
    });
    svg.addEventListener('pointerup',e=>{
      if(drag){
        try{ svg.releasePointerCapture(e.pointerId); }catch(_){}
        if(drag.kind==='bus'){
          if(drag.moved) commitBusDrag(drag); else selectUnion(drag.uid);
        } else {
          if(drag.moved) commitDrag(drag); else select(drag.id);
        }
        endDragVisual(); drag=null; return;
      }
      const wasMoved=moved; down=null;
      try{ svg.releasePointerCapture(e.pointerId); }catch(_){}
      if(!wasMoved){
        // Pointer capture redirects e.target to the svg, so hit-test the cursor position instead.
        const el=document.elementFromPoint(e.clientX,e.clientY);
        const node=el&&el.closest('.node');
        if(node) select(node.dataset.id); else deselect();
      }
    });
    svg.addEventListener('wheel',e=>{ e.preventDefault(); const r=svg.getBoundingClientRect();
      View.zoomBy(e.deltaY<0?1.1:1/1.1, e.clientX-r.left, e.clientY-r.top); updZoom(); },{passive:false});
  }

  /* toast */
  let toastT;
  function flash(msg, ms=1900){ let t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
    clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),ms); }

  return { state, init, select, rerender, enterRelate };
})();

/* legend content builder */
function buildLegend(){
  const el=document.getElementById('legend-body'); if(!el) return;
  const ppl=[{sex:'m'},{sex:'f'},{sex:'m',index:true},{sex:'m',deceased:true},{sex:'u'}];
  const lbl=['Male','Female','Index patient','Deceased','Unknown'];
  const sym=ppl.map((p,i)=>`<div class="lg-row"><span class="lg-s">${SYM.mini(p,22)}</span>${lbl[i]}</div>`).join('');
  const partner=REL_TYPES.partner.map(r=>`<div class="lg-row"><span class="lg-s">${SYM.relMini(r.key)}</span>${r.label}</div>`).join('');
  const emo=REL_TYPES.emotional.map(r=>`<div class="lg-row"><span class="lg-s">${SYM.relMini(r.key)}</span>${r.label}</div>`).join('');
  el.innerHTML=`<div class="lg-col"><div class="lg-h">Members</div>${sym}</div>
    <div class="lg-col"><div class="lg-h">Partner / family</div>${partner}</div>
    <div class="lg-col"><div class="lg-h">Emotional</div>${emo}</div>`;
}

window.addEventListener('DOMContentLoaded',()=>{ App.init(); buildLegend(); });
