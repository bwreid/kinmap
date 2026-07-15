/* ============================================================
   Kinmap — app state + interactions
   ============================================================ */
const App = (() => {
  const state = {
    selected: null,
    selectedUnion: null,
    drawer: null,
    mode: "normal",
    relPair: [],
    relType: null,
    addRelation: "child",
    showEmo: true,
    showNotes: true,
    highlightLabels: new Set(),
  };
  const RANK_STEP = 1000;
  const NUDGE_STEP = 8,
    NUDGE_BIG = 32;

  /* ---------- boot ---------- */
  function init() {
    const saved = Storage.loadAutosave();
    if (saved) {
      try {
        Storage.hydrate(saved);
      } catch (_) {}
    }
    View.init();
    rerender();
    View.fit();
    wire();
    applyEmoVisibility();
    applyNotesVisibility();
  }
  function rerender() {
    View.canvas();
    View.list();
    buildLegend();
  }

  /* ---------- selection ---------- */
  function select(id) {
    if (state.mode === "relate") {
      togglePair(id);
      return;
    }
    state.selected = id;
    state.selectedUnion = null;
    noteDraft = null;
    View.selection();
    if (id) openDrawer("inspect");
    if (id && state.mode === "edit")
      flash("Use ← → to nudge this member (Shift for a bigger step)", 3200);
  }
  function deselect() {
    if (state.mode === "relate") return;
    state.selected = null;
    state.selectedUnion = null;
    View.selection();
    closeDrawer();
  }
  function selectUnion(uid) {
    state.selected = null;
    closeDrawer();
    state.selectedUnion = uid;
    View.selection();
    flash(
      "Use ← → to nudge where this line begins (Shift for a bigger step)",
      3200,
    );
  }

  /* ---------- drawer ---------- */
  function openDrawer(mode) {
    state.drawer = mode;
    const d = document.getElementById("drawer");
    d.innerHTML =
      mode === "add" ? addForm() : mode === "edit" ? editForm() :
      mode === "add-community" ? addCommunityForm() :
      mode === "edit-community" ? editCommunityForm() : inspectView();
    d.classList.add("open");
    bindDrawer();
  }
  function closeDrawer() {
    state.drawer = null;
    noteDraft = null;
    document.getElementById("drawer").classList.remove("open");
  }

  /* ---------- add-member form ---------- */
  let form = {};
  function addForm() {
    const relation = state.addRelation;
    form = {
      name: "",
      sex: "m",
      age: "",
      deceased: false,
      conn: "bio",
      index: false,
      relation,
      target: "u3",
    };
    const seg = (opts, val, grp) =>
      opts
        .map(
          (o) =>
            `<button class="seg-b${o.v === val ? " on" : ""}" data-grp="${grp}" data-v="${o.v}">${o.l}</button>`,
        )
        .join("");
    const showFam = FAM.people.length > 0;
    const relLabel =
      {
        child: "Child of",
        sibling: "Sibling of",
        partner: "Partner of",
        parent: "Parent of",
      }[relation] || "";
    return `
    <div class="drawer-h"><h3>Add family member</h3><button class="x" data-act="close">✕</button></div>
    <div class="drawer-body">
      <div class="fld"><label>Full name</label><input class="inp" data-f="name" placeholder="e.g. Marcus Bell" autocomplete="off"></div>
      <div class="fld"><label>Sex / symbol</label><div class="seg" data-seg="sex">${seg(
        [
          { v: "m", l: "☐ Male" },
          { v: "f", l: "◯ Female" },
          { v: "u", l: "? Unknown" },
        ],
        "m",
        "sex",
      )}</div></div>
      <div class="fld two"><div><label>Age</label><input class="inp" data-f="age" inputmode="numeric" placeholder="—"></div>
        <div><label>Status</label><div class="seg" data-seg="status">${seg(
          [
            { v: "living", l: "Living" },
            { v: "dec", l: "Deceased" },
          ],
          "living",
          "status",
        )}</div></div></div>
      <div data-fam-section${showFam ? "" : ' style="display:none"'}>
        <div class="rule"></div>
        <div class="fld"><label>Place in family</label>
          <div class="seg" data-seg="relation">${seg(
            [
              { v: "child", l: "Child" },
              { v: "sibling", l: "Sibling" },
              { v: "partner", l: "Partner" },
              { v: "parent", l: "Parent" },
              { v: "none", l: "Unconnected" },
            ],
            relation,
            "relation",
          )}</div></div>
        <div class="fld" data-target-fld style="${relation === "none" ? "display:none" : ""}"><label data-rel-label>${relLabel}</label>
          <select class="inp" data-f="target">${targetOptions(relation)}</select>
          <p class="hint">Tree re-balances automatically by generation.</p></div>
        <div class="fld" data-conn-fld style="${relation === "child" || relation === "sibling" ? "" : "display:none"}"><label>Biological connection</label>
          <div class="seg" data-seg="conn">${seg(
            [
              { v: "bio", l: "Biological" },
              { v: "adopted", l: "Adopted" },
              { v: "foster", l: "Foster" },
            ],
            "bio",
            "conn",
          )}</div></div>
      </div>
      <label class="check"><input type="checkbox" data-f="index"> Mark as index patient</label>
    </div>
    <div class="drawer-foot">
      <button class="btn ghost" data-act="close">Cancel</button>
      <button class="btn primary" data-act="add">＋ Add to genogram</button>
    </div>`;
  }
  function targetOptions(relation) {
    if (relation === "none") return "";
    if (relation === "child") {
      return (
        FAM.unions
          .map((u) => {
            const ns = u.partners
              .map((id) => FAM.byId(id).name.split(" ")[0])
              .join(" + ");
            return `<option value="${u.id}">${ns}</option>`;
          })
          .join("") +
        FAM.people
          .filter((p) => !FAM.primaryUnion(p.id))
          .map(
            (p) =>
              `<option value="p:${p.id}">${p.name} (single parent)</option>`,
          )
          .join("")
      );
    }
    return FAM.people
      .map((p) => `<option value="${p.id}">${p.name}</option>`)
      .join("");
  }

  /* ---------- member notes (inline add/edit in the inspector — unlike
     labels, note content isn't shared/reusable across members, so there's
     no central registry and no separate "manage" modal) ---------- */
  const NOTE_MAX = 500;
  let noteDraft = null; // { id: existingId|null, text, color } while the inline editor is open, else null
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  // a tiny markdown-lite pass for note display only (never for the editor's
  // own textarea, which shows the raw **/_ source for editing) — always run
  // on already-escaped text so `<`/`>` typed by the user can't reopen a tag
  function mdInline(escaped) {
    return escaped
      .replace(/\*\*(\S(?:.*?\S)?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^_])_(\S(?:.*?\S)?)_(?!_)/g, "$1<em>$2</em>");
  }
  function renderNoteText(text) {
    return mdInline(escapeHtml(text));
  }
  function renderNoteEditor() {
    const colorPicker = LABEL_COLORS.map(
      (c) =>
        `<button class="label-color-b${(noteDraft.color || null) === c.value ? " on" : ""}" data-act="note-draft-color" data-color="${c.value || ""}" title="${c.name}" style="${c.value ? `background:${c.value}` : "background:var(--ink-3)"}"></button>`,
    ).join("");
    return `<div class="note-editor">
      <textarea id="note-draft-input" maxlength="${NOTE_MAX}" placeholder="Write a note…">${escapeHtml(noteDraft.text)}</textarea>
      <div class="note-cnt">${noteDraft.text.length}/${NOTE_MAX}</div>
      <div class="label-color-picker">${colorPicker}</div>
      <div class="note-editor-foot">
        <button class="btn ghost" data-act="cancel-note-edit">Cancel</button>
        <button class="btn primary" data-act="save-note">Save note</button>
      </div>
    </div>`;
  }
  function renderNotesSection(p) {
    const notes = p.notes || [];
    const rows = notes
      .map((n) => {
        if (noteDraft && noteDraft.id === n.id) return renderNoteEditor();
        return `<div class="note-row">
        <span class="note-sw" style="${n.color ? `background:${n.color}` : ""}"></span>
        <span class="note-text">${renderNoteText(n.text)}</span>
        <button class="note-edit" data-act="edit-note" data-id="${n.id}" title="Edit note">${PENCIL_ICON}</button>
        <button class="rx" data-act="remove-note" data-id="${n.id}" title="Delete note">✕</button>
      </div>`;
      })
      .join("");
    const adder =
      noteDraft && noteDraft.id === null
        ? renderNoteEditor()
        : `<button class="btn block" data-act="add-note">+ Add note</button>`;
    return `<div class="note-list">${rows}</div>${adder}`;
  }

  /* ---------- label toggle chips (shared: edit form + inspector) ---------- */
  function renderLabelChips(assignedIds, action) {
    if (!FAM.labelDefs.length)
      return `<p class="hint">No labels defined yet — use <button class="linklike" data-act="manage-labels">Manage labels</button> to create one.</p>`;
    return `<div class="label-existing-list">${FAM.labelDefs.map((l) => `<button class="label-chip${assignedIds.includes(l.id) ? " on" : ""}" data-act="${action}" data-id="${l.id}">${renderLabelIcon(l.icon, 14, l.color, l.iconPath)}<span>${l.desc}</span></button>`).join("")}</div>`;
  }
  function renderLabelsFld() {
    return `<div class="fld labels-fld" data-labels-fld>
      <label>Labels</label>
      ${renderLabelChips(form.labelIds || [], "toggle-label")}
    </div>`;
  }
  function editForm() {
    const p = FAM.byId(state.selected);
    if (!p) return "";
    form = {
      name: p.name,
      sex: p.sex,
      deceased: !!p.deceased,
      conn: p.conn || "bio",
      labelIds: [...(p.labelIds || [])],
    };
    const seg = (opts, val, grp) =>
      opts
        .map(
          (o) =>
            `<button class="seg-b${o.v === val ? " on" : ""}" data-grp="${grp}" data-v="${o.v}">${o.l}</button>`,
        )
        .join("");
    const hasParents = !!FAM.parentsUnion(p.id);
    return `
    <div class="drawer-h"><h3>Edit ${p.name}</h3><button class="x" data-act="close">✕</button></div>
    <div class="drawer-body">
      <div class="fld"><label>Full name</label><input class="inp" data-f="name" value="${p.name}" placeholder="e.g. Marcus Bell" autocomplete="off"></div>
      <div class="fld"><label>Sex / symbol</label><div class="seg" data-seg="sex">${seg(
        [
          { v: "m", l: "☐ Male" },
          { v: "f", l: "◯ Female" },
          { v: "u", l: "? Unknown" },
        ],
        p.sex,
        "sex",
      )}</div></div>
      <div class="fld two"><div><label>Age</label><input class="inp" data-f="age" inputmode="numeric" value="${p.age != null ? p.age : ""}" placeholder="—"></div>
        <div><label>Status</label><div class="seg" data-seg="status">${seg(
          [
            { v: "living", l: "Living" },
            { v: "dec", l: "Deceased" },
          ],
          p.deceased ? "dec" : "living",
          "status",
        )}</div></div></div>
      <div class="fld" data-dinfo-fld style="${p.deceased ? "" : "display:none"}"><label>Death detail</label><input class="inp" data-f="dinfo" value="${p.dInfo || ""}" placeholder="e.g. d. 2014"></div>
      ${
        hasParents
          ? `<div class="fld"><label>Biological connection</label><div class="seg" data-seg="conn">${seg(
              [
                { v: "bio", l: "Biological" },
                { v: "adopted", l: "Adopted" },
                { v: "foster", l: "Foster" },
              ],
              p.conn || "bio",
              "conn",
            )}</div></div>`
          : ""
      }
      <label class="check"><input type="checkbox" data-f="index" ${p.index ? "checked" : ""}> Mark as index patient</label>
      ${renderLabelsFld()}
    </div>
    <div class="drawer-foot">
      <button class="btn ghost" data-act="close">Cancel</button>
      <button class="btn primary" data-act="save-edit">Save changes</button>
    </div>`;
  }

  /* ---------- inspector ---------- */
  function inspectCommunityView(c) {
    const rels = FAM.relsOf(c.id);
    const relRows = rels.length
      ? rels
          .map((r) => {
            const oId = r.a === c.id ? r.b : r.a;
            const o = FAM.entityById(oId);
            const t = REL_BY_KEY[r.type];
            return `<div class="rel-row"><span class="rl">${SYM.relMini(r.type)}</span><span class="rn">${o ? o.name : "?"}</span><span class="rt">${t ? t.label : r.type}</span>
        <button class="rx" data-rmrel="${r.a}__${r.b}" title="Remove">✕</button></div>`;
          })
          .join("")
      : `<p class="hint">No relationships mapped yet.</p>`;
    return `
    <div class="drawer-h"><h3>${c.name}</h3><button class="x" data-act="close">✕</button></div>
    <div class="drawer-body">
      <div class="insp-id">
        <div class="insp-sym">${SYM.communityMini(c, 46)}</div>
        <div class="insp-meta">Community</div>
      </div>
      ${c.description ? `<div class="kv"><span>Description</span><b>${renderNoteText(c.description)}</b></div>` : ""}
      <div class="rule"></div>
      <div class="sec-h">Emotional ties <span class="cnt">${rels.length}</span></div>
      <div class="rel-list">${relRows}</div>
      <button class="btn block" data-act="relate-from">＋ Add relationship</button>
    </div>
    <div class="drawer-foot">
      <button class="btn ghost danger" data-act="delete-community">Delete</button>
      <button class="btn ghost" data-act="edit-community">✎ Edit</button>
      <button class="btn primary" data-act="close">Done</button>
    </div>`;
  }
  function inspectView() {
    const c = FAM.communityById(state.selected);
    if (c) return inspectCommunityView(c);
    const p = FAM.byId(state.selected);
    if (!p) return "";
    const pu = FAM.parentsUnion(p.id);
    const parents = pu
      ? pu.partners.map((id) => FAM.byId(id).name).join(", ")
      : "—";
    const myUnions = FAM.partnerUnions(p.id);
    const partners =
      myUnions
        .flatMap((u) => u.partners.filter((id) => id !== p.id))
        .map((id) => FAM.byId(id).name)
        .join(", ") || "—";
    const kids =
      myUnions
        .flatMap((u) => u.children)
        .map((id) => FAM.byId(id).name)
        .join(", ") || "—";
    const rels = FAM.relsOf(p.id);
    const relRows = rels.length
      ? rels
          .map((r) => {
            const oId = r.a === p.id ? r.b : r.a;
            const o = FAM.entityById(oId);
            const t = REL_BY_KEY[r.type];
            return `<div class="rel-row"><span class="rl">${SYM.relMini(r.type)}</span><span class="rn">${o ? o.name : "?"}</span><span class="rt">${t ? t.label : r.type}</span>
        <button class="rx" data-rmrel="${r.a}__${r.b}" title="Remove">✕</button></div>`;
          })
          .join("")
      : `<p class="hint">No relationships mapped yet.</p>`;

    // editable partner unions (marriage / divorce / etc.)
    const partnerOpts = REL_TYPES.partner
      .map((t) => `<option value="${t.key}">${t.label}</option>`)
      .join("");
    const unionRows = myUnions.length
      ? myUnions
          .map((u) => {
            const other = u.partners.find((id) => id !== p.id);
            const oName = other ? FAM.byId(other).name : "(no partner)";
            const sel = (t) =>
              REL_TYPES.partner.some((x) => x.key === u.type)
                ? u.type
                : "marriage";
            return `<div class="union-row">
        <span class="rl">${SYM.relMini(u.type)}</span>
        <span class="rn">${oName}</span>
        <select class="union-type" data-uedit="${u.id}">${REL_TYPES.partner.map((t) => `<option value="${t.key}"${t.key === sel() ? " selected" : ""}>${t.label}</option>`).join("")}</select>
        <button class="rx" data-rmunion="${u.id}" title="Remove union">✕</button>
      </div>`;
          })
          .join("")
      : `<p class="hint">No partner unions.</p>`;

    return `
    <div class="drawer-h"><h3>${p.name}</h3><button class="x" data-act="close">✕</button></div>
    <div class="drawer-body">
      <div class="insp-id">
        <div class="insp-sym" style="color:${p.index ? "var(--accent)" : "var(--stroke)"}">${SYM.mini(p, 46)}</div>
        <div>${p.index ? `<span class="ip-badge">Index patient</span>` : ""}
          <div class="insp-meta">${p.sex === "m" ? "Male" : p.sex === "f" ? "Female" : "Unknown"} · ${p.deceased ? p.dInfo || "Deceased" : "Living"}${p.age != null ? ` · ${p.age}` : ""}</div></div>
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
      <div class="rule"></div>
      <div class="sec-h">Notes <span class="cnt">${(p.notes || []).length}</span></div>
      ${renderNotesSection(p)}
      <div class="rule"></div>
      <div class="sec-h">Labels</div>
      ${renderLabelChips(p.labelIds || [], "toggle-label-live")}
    </div>
    <div class="drawer-foot">
      <button class="btn ghost danger" data-act="delete">Delete</button>
      ${p.rowOrder != null || p.rowOffset != null ? `<button class="btn ghost" data-act="reset-pos">↺ Reset position</button>` : ""}
      <button class="btn ghost" data-act="edit">✎ Edit</button>
      <button class="btn primary" data-act="close">Done</button>
    </div>`;
  }

  /* ---------- mutations ---------- */
  function commitAdd() {
    const d = document.getElementById("drawer");
    const name =
      (d.querySelector("[data-f=name]").value || "").trim() ||
      (form.sex === "f" ? "New (F)" : "New (M)");
    const age = parseInt(d.querySelector("[data-f=age]").value, 10);
    const idx = d.querySelector("[data-f=index]").checked;
    const target = d.querySelector("[data-f=target]")?.value || "";
    const np = {
      id: FAM.uid("p"),
      name,
      sex: form.sex,
      conn: form.conn,
      deceased: form.deceased,
      age: isNaN(age) ? null : age,
      gen: 0,
    };
    if (form.deceased) np.dInfo = "deceased";

    const famSec = d.querySelector("[data-fam-section]");
    if (famSec && famSec.style.display === "none") {
      if (idx) {
        FAM.people.forEach((p) => (p.index = false));
        np.index = true;
      }
      FAM.people.push(np);
      rerender();
      state.selected = np.id;
      View.selection();
      openDrawer("inspect");
      flash(np.name + " added");
      Storage.autosave();
      return;
    }

    if (form.relation === "none") {
      np.gen = FAM.index()?.gen ?? 2;
      FAM.people.push(np);
    } else if (form.relation === "child") {
      let u;
      if (target.startsWith("p:")) {
        const par = target.slice(2);
        u = {
          id: FAM.uid("u"),
          partners: [par],
          type: "marriage",
          children: [],
        };
        FAM.unions.push(u);
      } else u = FAM.unions.find((x) => x.id === target);
      np.gen = FAM.byId(u.partners[0]).gen + 1;
      u.children.push(np.id);
      FAM.people.push(np);
    } else if (form.relation === "sibling") {
      const x = FAM.byId(target),
        pu = FAM.parentsUnion(x.id);
      np.gen = x.gen;
      FAM.people.push(np);
      // Only add to existing parent union — don't create an empty-partners union
      // for root people (no parents in tree). They'll be placed via the safety layout.
      if (pu) pu.children.push(np.id);
    } else if (form.relation === "partner") {
      const x = FAM.byId(target);
      np.gen = x.gen;
      FAM.people.push(np);
      // If x is a lone parent (single-partner union that already has children),
      // join that union as co-parent so the children connect to the couple —
      // rather than spawning a separate, childless union.
      const lone = FAM.unions.find(
        (u) =>
          u.partners.length === 1 &&
          u.partners[0] === x.id &&
          u.children.length,
      );
      if (lone) lone.partners.push(np.id);
      else
        FAM.unions.push({
          id: FAM.uid("u"),
          partners: [x.id, np.id],
          type: "marriage",
          children: [],
        });
    } else {
      // parent
      const x = FAM.byId(target);
      np.gen = x.gen - 1;
      FAM.people.push(np);
      const pu = FAM.parentsUnion(x.id);
      if (pu && pu.partners.length < 2) pu.partners.push(np.id);
      else
        FAM.unions.push({
          id: FAM.uid("u"),
          partners: [np.id],
          type: "marriage",
          children: [x.id],
        });
    }
    if (idx) {
      FAM.people.forEach((p) => (p.index = false));
      np.index = true;
    }
    rerender();
    state.selected = np.id;
    View.selection();
    openDrawer("inspect");
    flash(np.name + " added");
    Storage.autosave();
  }

  function commitEdit() {
    const d = document.getElementById("drawer");
    const p = FAM.byId(state.selected);
    if (!p) return;
    const name =
      (d.querySelector("[data-f=name]").value || "").trim() || p.name;
    const age = parseInt(d.querySelector("[data-f=age]").value, 10);
    const idx = d.querySelector("[data-f=index]").checked;
    const dinfo = (d.querySelector("[data-f=dinfo]")?.value || "").trim();

    p.name = name;
    p.sex = form.sex;
    p.deceased = form.deceased;
    p.age = isNaN(age) ? null : age;
    if (p.deceased) p.dInfo = dinfo || "deceased";
    else delete p.dInfo;
    if (FAM.parentsUnion(p.id)) p.conn = form.conn;
    if (idx) FAM.people.forEach((x) => (x.index = x === p));
    else p.index = false;
    p.labelIds = [...(form.labelIds || [])];

    rerender();
    View.selection();
    openDrawer("inspect");
    flash(p.name + " updated");
    Storage.autosave();
  }

  function deletePerson(id) {
    if (FAM.byId(id)?.index) {
      flash("Cannot delete the index patient");
      return;
    }
    FAM.people = FAM.people.filter((p) => p.id !== id);
    FAM.unions.forEach((u) => {
      u.partners = u.partners.filter((x) => x !== id);
      u.children = u.children.filter((x) => x !== id);
    });
    FAM.unions = FAM.unions.filter(
      (u) => u.partners.length || u.children.length,
    );
    FAM.rels = FAM.rels.filter((r) => r.a !== id && r.b !== id);
    state.selected = null;
    rerender();
    closeDrawer();
    Storage.autosave();
  }

  /* ---------- communities (free-floating groups) ----------
     Unlike people, a community has no row/generation of its own — its only
     position is the absolute c.pos the user drags directly (App's
     startCommunityDrag/commitCommunityDrag, below). communityDraft holds
     the add/edit form's live name/description/color while that drawer is
     open (mirrors noteDraft/labelDraft — reset only where a fresh add/edit
     flow actually begins, never inside the render functions themselves, so
     a color-swatch click can re-render the form without losing what the
     user already typed). */
  let communityDraft = {};
  function communityColorPicker(selected) {
    return LABEL_COLORS.filter((c) => c.value)
      .map(
        (c) =>
          `<button class="label-color-b${selected === c.value ? " on" : ""}" data-act="community-draft-color" data-color="${c.value}" title="${c.name}" style="background:${c.value}"></button>`,
      )
      .join("");
  }
  function communitySizePicker(selected) {
    return [
      { v: "small", l: "Small" },
      { v: "medium", l: "Medium" },
      { v: "large", l: "Large" },
    ]
      .map(
        (o) =>
          `<button class="seg-b${o.v === selected ? " on" : ""}" data-grp="size" data-v="${o.v}">${o.l}</button>`,
      )
      .join("");
  }
  function addCommunityForm() {
    return `
    <div class="drawer-h"><h3>Add community</h3><button class="x" data-act="close">✕</button></div>
    <div class="drawer-body">
      <div class="fld"><label>Name</label><input class="inp" data-f="name" value="${escapeHtml(communityDraft.name)}" placeholder="e.g. Church group" autocomplete="off"></div>
      <div class="fld"><label>Size</label><div class="seg" data-seg="size">${communitySizePicker(communityDraft.size)}</div></div>
      <div class="fld"><label>Description</label><textarea class="inp" data-f="description" maxlength="${NOTE_MAX}" placeholder="Shown on hover…">${escapeHtml(communityDraft.description)}</textarea></div>
      <div class="fld"><label>Color</label><div class="label-color-picker">${communityColorPicker(communityDraft.color)}</div></div>
    </div>
    <div class="drawer-foot">
      <button class="btn ghost" data-act="close">Cancel</button>
      <button class="btn primary" data-act="add-community">＋ Add community</button>
    </div>`;
  }
  // default spawn point: centered above the current tree, clear of members —
  // the user drags it into its final spot afterward (Edit Positions)
  function spawnCommunityPos() {
    if (!FAM.people.length) return { x: LC.CENTER, y: LC.TOPY - 160 };
    const b = Layout.compute();
    return { x: (b.minX + b.maxX) / 2, y: b.minY - 160 };
  }
  function commitAddCommunity() {
    const d = document.getElementById("drawer");
    const name =
      (d.querySelector("[data-f=name]").value || "").trim() ||
      "New community";
    const description = (
      d.querySelector("[data-f=description]").value || ""
    ).trim();
    const nc = {
      id: FAM.uid("com"),
      name,
      description,
      color: communityDraft.color,
      size: communityDraft.size,
      pos: spawnCommunityPos(),
    };
    FAM.communities.push(nc);
    rerender();
    state.selected = nc.id;
    View.selection();
    openDrawer("inspect");
    flash(name + " added");
    Storage.autosave();
  }
  function editCommunityForm() {
    const c = FAM.communityById(state.selected);
    if (!c) return "";
    return `
    <div class="drawer-h"><h3>Edit ${c.name}</h3><button class="x" data-act="close">✕</button></div>
    <div class="drawer-body">
      <div class="fld"><label>Name</label><input class="inp" data-f="name" value="${escapeHtml(communityDraft.name)}" autocomplete="off"></div>
      <div class="fld"><label>Size</label><div class="seg" data-seg="size">${communitySizePicker(communityDraft.size)}</div></div>
      <div class="fld"><label>Shape</label><button class="btn ghost" data-act="regen-community-shape">↻ Regenerate shape</button></div>
      <div class="fld"><label>Description</label><textarea class="inp" data-f="description" maxlength="${NOTE_MAX}">${escapeHtml(communityDraft.description)}</textarea></div>
      <div class="fld"><label>Color</label><div class="label-color-picker">${communityColorPicker(communityDraft.color)}</div></div>
    </div>
    <div class="drawer-foot">
      <button class="btn ghost" data-act="close">Cancel</button>
      <button class="btn primary" data-act="save-edit-community">Save changes</button>
    </div>`;
  }
  function commitEditCommunity() {
    const d = document.getElementById("drawer");
    const c = FAM.communityById(state.selected);
    if (!c) return;
    const name =
      (d.querySelector("[data-f=name]").value || "").trim() || c.name;
    const description = (
      d.querySelector("[data-f=description]").value || ""
    ).trim();
    c.name = name;
    c.description = description;
    c.color = communityDraft.color;
    c.size = communityDraft.size;
    rerender();
    openDrawer("inspect");
    flash(c.name + " updated");
    Storage.autosave();
  }
  function deleteCommunity(id) {
    FAM.communities = FAM.communities.filter((c) => c.id !== id);
    FAM.rels = FAM.rels.filter((r) => r.a !== id && r.b !== id);
    state.selected = null;
    rerender();
    closeDrawer();
    Storage.autosave();
  }

  /* ---------- relationship builder ---------- */
  function enterRelate(seed) {
    if (state.mode === "edit") exitEdit();
    closeDrawer(); // close any open drawer before entering relate mode
    state.mode = "relate";
    state.relPair = seed ? [seed] : [];
    state.relType = null;
    document.getElementById("relbar").classList.add("open");
    document.body.classList.add("relating");
    renderRelbar();
    View.selection();
  }
  function exitRelate() {
    state.mode = "normal";
    state.relPair = [];
    state.relType = null;
    document.getElementById("relbar").classList.remove("open");
    document.body.classList.remove("relating");
    View.selection();
  }

  /* ---------- manual edit mode (drag-to-reorder within a generation) ---------- */
  function enterEdit() {
    if (state.mode === "relate") exitRelate();
    closeDrawer();
    state.mode = "edit";
    document.body.classList.add("editing");
    document.getElementById("toggle-edit-btn")?.classList.add("on");
    rerender(); // bus-origin handles only render while in edit mode
  }
  function exitEdit() {
    state.mode = "normal";
    state.selectedUnion = null;
    document.body.classList.remove("editing");
    document.getElementById("toggle-edit-btn")?.classList.remove("on");
    rerender();
  }
  function resetRowOrder(ids) {
    ids.forEach((id) => {
      const p = FAM.byId(id);
      if (p) {
        delete p.rowOrder;
        delete p.rowOffset;
      }
    });
  }
  function togglePair(id) {
    const i = state.relPair.indexOf(id);
    if (i >= 0) state.relPair.splice(i, 1);
    else {
      if (state.relPair.length >= 2) state.relPair.shift();
      state.relPair.push(id);
    }
    // a partner union (marriage/divorce/...) is meaningless for a community —
    // drop a stale partner-type pick once one lands in the pair
    if (
      state.relPair.some((pid) => FAM.communityById(pid)) &&
      REL_TYPES.partner.some((r) => r.key === state.relType)
    )
      state.relType = null;
    renderRelbar();
    View.selection();
  }
  function applyRel() {
    const [a, b] = state.relPair,
      t = state.relType;
    if (!a || !b || !t) return;
    const isPartner = REL_TYPES.partner.some((r) => r.key === t);
    if (isPartner) {
      const u = FAM.unions.find(
        (u) => u.partners.includes(a) && u.partners.includes(b),
      );
      if (u) u.type = t;
      else {
        FAM.unions.push({
          id: FAM.uid("u"),
          partners: [a, b],
          type: t,
          children: [],
        });
        // Align new partner's gen to the other's gen so they share a row
        const pa = FAM.byId(a),
          pb = FAM.byId(b);
        if (pa && pb && pa.gen !== pb.gen) pb.gen = pa.gen;
      }
    } else {
      FAM.rels = FAM.rels.filter(
        (r) => !((r.a === a && r.b === b) || (r.a === b && r.b === a)),
      );
      FAM.rels.push({ a, b, type: t });
    }
    exitRelate();
    rerender();
    flash("Relationship added");
    Storage.autosave();
  }
  function renderRelbar() {
    const bar = document.getElementById("relbar");
    const [a, b] = state.relPair;
    const chip = (id, n) => {
      if (!id) return `<span class="pchip empty">${n}</span>`;
      const community = FAM.communityById(id);
      const icon = community ? SYM.communityMini(community, 18) : SYM.mini(FAM.byId(id), 18);
      return `<span class="pchip">${icon}${FAM.entityById(id).name.split(" ")[0]}</span>`;
    };
    const anyCommunity = [a, b].some((id) => id && FAM.communityById(id));
    const grp = (arr) =>
      arr
        .map(
          (r) =>
            `<button class="rpick${state.relType === r.key ? " on" : ""}" data-rtype="${r.key}">${SYM.relMini(r.key)}<span>${r.label}</span></button>`,
        )
        .join("");
    bar.innerHTML = `
      <div class="rb-title">Add relationship</div>
      <div class="rb-steps">
        <span class="st ${a ? "done" : "now"}">1</span>${chip(a, "Select first person")}
        <span class="arr">→</span>
        <span class="st ${b ? "done" : a ? "now" : ""}">2</span>${chip(b, "Select second person")}
      </div>
      <div class="rb-pick">
        ${anyCommunity ? "" : `<div class="rb-grp"><div class="rb-gl">Partner / family</div><div class="rb-chips">${grp(REL_TYPES.partner)}</div></div>`}
        <div class="rb-grp"><div class="rb-gl">Emotional quality</div><div class="rb-chips">${grp(REL_TYPES.emotional)}</div></div>
      </div>
      <div class="rb-foot">
        <button class="btn ghost" data-act="rel-cancel">Cancel</button>
        <button class="btn primary" data-act="rel-apply" ${a && b && state.relType ? "" : "disabled"}>Apply</button>
      </div>`;
  }

  /* ---------- new genogram ---------- */
  function newGenogram() {
    if (FAM.people.length === 0) {
      doNewGenogram();
      return;
    }
    document.getElementById("new-modal").classList.add("open");
  }
  function doNewGenogram() {
    FAM.people = [];
    FAM.unions = [];
    FAM.rels = [];
    FAM.communities = [];
    FAM._n = 100;
    state.selected = null;
    state.selectedUnion = null;
    state.mode = "normal";
    state.relPair = [];
    state.relType = null;
    state.highlightLabels.clear();
    closeDrawer();
    document.getElementById("relbar").classList.remove("open");
    document.body.classList.remove("relating");
    document.body.classList.remove("editing");
    document.getElementById("toggle-edit-btn")?.classList.remove("on");
    document.getElementById("legend").classList.remove("open");
    document.getElementById("hlpop").classList.remove("open");
    document.getElementById("highlight-btn")?.classList.remove("on");
    document.getElementById("search").value = "";
    rerender();
    View.resetView();
    updZoom();
    flash("New genogram started");
    Storage.autosave();
  }

  /* ---------- export modal ---------- */
  let expOpts = {
    format: "png",
    pageSize: "letter",
    orientation: "auto",
    includeLegend: false,
  };
  function renderExportModal() {
    const body = document.getElementById("export-modal-body");
    const isPdf = expOpts.format === "pdf-fit" || expOpts.format === "pdf-tile";
    const isJson = expOpts.format === "json";
    const seg = (name, val, opts) =>
      `<div class="seg" data-seg="${name}">${opts.map((o) => `<button class="seg-b${o.v === val ? " on" : ""}" data-v="${o.v}">${o.l}</button>`).join("")}</div>`;
    let estimate = "";
    if (expOpts.format === "pdf-tile") {
      const { cols, rows, orientation } = View.estimateTiles(
        expOpts.pageSize,
        expOpts.orientation,
        expOpts.includeLegend,
      );
      const n = cols * rows;
      estimate = `<p class="exp-hint">≈ ${n} page${n === 1 ? "" : "s"} (${cols}×${rows} grid, ${orientation}) — print and align the overlapping edges to assemble.</p>`;
    } else if (expOpts.format === "pdf-fit") {
      estimate = `<p class="exp-hint">The whole tree is scaled down to fit one page — large families may end up small.</p>`;
    }
    body.innerHTML = `
      <h3>Export genogram</h3>
      <div class="fld"><label>Format</label>${seg("format", expOpts.format, [
        { v: "json", l: "JSON" },
        { v: "png", l: "Image (PNG)" },
        { v: "pdf-fit", l: "PDF (Fit)" },
        { v: "pdf-tile", l: "PDF (Tiled)" },
      ])}</div>
      ${
        isPdf
          ? `<div class="fld two">
        <div><label>Page size</label>${seg("pagesize", expOpts.pageSize, [
          { v: "letter", l: "Letter" },
          { v: "a4", l: "A4" },
        ])}</div>
        <div><label>Orientation</label>${seg(
          "orientation",
          expOpts.orientation,
          [
            { v: "auto", l: "Auto" },
            { v: "portrait", l: "Portrait" },
            { v: "landscape", l: "Landscape" },
          ],
        )}</div>
      </div>${estimate}`
          : ""
      }
      ${isJson ? "" : `<label class="check exp-legend-check"><input type="checkbox" data-f="include-legend" ${expOpts.includeLegend ? "checked" : ""}> Include legend (top-left corner)</label>`}
      <div class="modal-foot">
        <button class="btn ghost" data-act="export-cancel">Cancel</button>
        <button class="btn primary" data-act="export-confirm">Export</button>
      </div>`;
  }
  function runExport() {
    if (expOpts.format === "json") Storage.exportJSON();
    else if (expOpts.format === "png")
      View.exportPNG(expOpts.includeLegend).catch((err) => {
        console.error(err);
        flash("Image export failed");
      });
    else if (expOpts.format === "pdf-fit")
      View.printFit(
        expOpts.pageSize,
        expOpts.orientation,
        expOpts.includeLegend,
      );
    else if (expOpts.format === "pdf-tile")
      View.printTiled(
        expOpts.pageSize,
        expOpts.orientation,
        expOpts.includeLegend,
      );
  }

  /* ---------- manage-labels modal ---------- */
  let labelDraft = {
    icon: LABEL_ICONS[0].key,
    desc: "",
    color: null,
    iconPath: null,
    customText: "",
  };
  let editingLabelId = null;
  const PENCIL_ICON =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';
  function renderLabelsModal() {
    const body = document.getElementById("labels-modal-body");
    const rows = FAM.labelDefs
      .map((l) => {
        const n = FAM.people.filter((p) =>
          (p.labelIds || []).includes(l.id),
        ).length;
        return `<div class="labeldef-row">
        <span class="lbldef-ic">${renderLabelIcon(l.icon, 18, l.color, l.iconPath)}</span>
        <span class="lbldef-desc">${l.desc}</span>
        <span class="lbldef-count">${n} member${n === 1 ? "" : "s"}</span>
        <button class="lbldef-edit" data-act="edit-labeldef" data-id="${l.id}">Edit</button>
        <button class="rx" data-act="remove-labeldef" data-id="${l.id}" title="Delete label">✕</button>
      </div>`;
      })
      .join("");
    body.innerHTML = `
      <h3>Manage labels</h3>
      <div class="labeldef-list">${rows || '<p class="hint">No labels yet — add one below.</p>'}</div>
      <div class="rule"></div>
      <div class="fld">
        <label>Add a label</label>
        <div class="label-picker">${LABEL_ICONS.map((ic) => `<button class="label-ic-b${ic.key === labelDraft.icon && !labelDraft.iconPath ? " on" : ""}" data-act="draft-icon" data-icon="${ic.key}" title="${ic.name}">${renderLabelIcon(ic.key, 15)}</button>`).join("")}<span class="custom-icon-wrap">
          <input class="inp custom-icon-input" id="custom-icon-input" value="${labelDraft.customText}" placeholder="Custom icon…">
          <span class="info-btn" tabindex="0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            <span class="info-tip">Type an exact icon name from <a href="https://lucide.dev/icons" target="_blank" rel="noopener">lucide.dev/icons</a> to use it for this label, then press Enter or click "+ Add label".</span>
          </span>
        </span></div>
        <input class="inp" id="labeldef-desc-input" value="${labelDraft.desc}" maxlength="40" placeholder="Label description (max 40 chars)">
        <div class="label-color-picker">${LABEL_COLORS.map((c) => `<button class="label-color-b${(labelDraft.color || null) === c.value ? " on" : ""}" data-act="draft-color" data-color="${c.value || ""}" title="${c.name}" style="${c.value ? `background:${c.value}` : "background:var(--ink-3)"}"></button>`).join("")}</div>
      </div>
      <div class="modal-foot">
        ${editingLabelId ? "" : '<button class="btn ghost" data-act="labels-close">Done</button>'}
        <button class="btn primary" data-act="add-labeldef">${editingLabelId ? `${PENCIL_ICON} Edit label` : "＋ Add label"}</button>
        ${editingLabelId ? '<button class="btn ghost" data-act="cancel-labeldef-edit">Cancel</button>' : ""}
      </div>`;
  }

  // reads whatever's currently typed in the custom-icon input (if anything)
  // and resolves it into labelDraft.icon/iconPath — used by both the
  // Enter-to-select shortcut and by "+ Add label" directly, so typing a name
  // and immediately clicking Add (without pressing Enter first) still picks
  // it up instead of silently falling back to whatever was selected before.
  // A fetched custom icon is stored only on labelDraft (and from there, only
  // on the labelDef it's used to create) — there's no shared catalog of
  // custom icons to add it to.
  async function resolveDraftIcon() {
    const input = document.getElementById("custom-icon-input");
    const raw = input?.value.trim();
    if (!raw) return true;
    const key = raw.toLowerCase().replace(/\s+/g, "-");
    const builtin = LABEL_ICONS.find((i) => i.key === key);
    if (builtin) {
      labelDraft.icon = key;
      labelDraft.iconPath = null;
      return true;
    }
    try {
      const res = await fetch(
        `https://unpkg.com/lucide-static@latest/icons/${key}.svg`,
      );
      if (!res.ok) throw new Error("not found");
      const text = await res.text();
      const inner = text
        .replace(/<!--[\s\S]*?-->/g, "")
        .match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1]
        ?.trim();
      if (!inner) throw new Error("parse failed");
      labelDraft.icon = key;
      labelDraft.iconPath = inner;
      flash(`Using "${key}" icon`);
      return true;
    } catch (err) {
      flash(`Icon "${key}" not found — check lucide.dev/icons`);
      return false;
    }
  }

  function closeLabelsModal() {
    document.getElementById("labels-modal").classList.remove("open");
    editingLabelId = null;
    labelDraft = {
      icon: LABEL_ICONS[0].key,
      desc: "",
      color: null,
      iconPath: null,
      customText: "",
    };
  }

  /* ---------- highlight-by-label popover ---------- */
  function renderHighlightPop() {
    const el = document.getElementById("hlpop-body");
    if (!el) return;
    const labels = FAM.usedLabels();
    if (!labels.length) {
      el.innerHTML = `<p class="hint">No labels in use yet.</p>`;
      return;
    }
    const chips = labels
      .map(
        (l) =>
          `<button class="label-chip${state.highlightLabels.has(l.id) ? " on" : ""}" data-act="toggle-highlight-label" data-id="${l.id}">${renderLabelIcon(l.icon, 14, l.color, l.iconPath)}<span>${l.desc}</span></button>`,
      )
      .join("");
    el.innerHTML = `
      <div class="hlpop-h">Highlight members with</div>
      <div class="label-existing-list">${chips}</div>
      ${state.highlightLabels.size ? '<button class="linklike hlpop-clear" data-act="clear-highlight">Clear highlight</button>' : ""}`;
  }

  /* ---------- event wiring ---------- */
  function wire() {
    // toolbar
    document.getElementById("topbar").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const a = b.dataset.act;
      if (a === "add") {
        deselectSilent();
        openDrawer("add");
      }
      if (a === "relate") {
        enterRelate(state.selected);
      }
      if (a === "add-community") {
        deselectSilent();
        communityDraft = { name: "", description: "", color: LABEL_COLORS.find((c) => c.value)?.value, size: "medium" };
        openDrawer("add-community");
      }
      if (a === "new") {
        newGenogram();
      }
      if (a === "save") {
        if (FAM.people.length === 0) {
          flash("Nothing to save");
          return;
        }
        const inp = document.getElementById("save-name-input");
        inp.value = "";
        document.getElementById("save-modal").classList.add("open");
        setTimeout(() => inp.focus(), 50);
      }
      if (a === "open") {
        Storage.renderSavesList("saves-list");
        document.getElementById("open-modal").classList.add("open");
      }
      if (a === "export") {
        renderExportModal();
        document.getElementById("export-modal").classList.add("open");
      }
      if (a === "manage-labels") {
        renderLabelsModal();
        document.getElementById("labels-modal").classList.add("open");
      }
    });
    // floating stage controls (view, zoom, edit-positions) — live over the
    // canvas, not inside #topbar
    document.getElementById("stage-canvas").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const a = b.dataset.act;
      if (a === "fit") {
        View.fit();
        updZoom();
      }
      if (a === "legend") {
        document.getElementById("legend").classList.toggle("open");
      }
      if (a === "toggle-emo") {
        state.showEmo = !state.showEmo;
        applyEmoVisibility();
      }
      if (a === "toggle-highlight") {
        renderHighlightPop();
        document.getElementById("hlpop").classList.toggle("open");
      }
      if (a === "toggle-notes") {
        state.showNotes = !state.showNotes;
        applyNotesVisibility();
      }
      if (a === "zin") {
        View.zoomBy(1.2);
        updZoom();
      }
      if (a === "zout") {
        View.zoomBy(1 / 1.2);
        updZoom();
      }
      if (a === "toggle-edit") {
        state.mode === "edit" ? exitEdit() : enterEdit();
      }
      if (a === "reset-all-pos") {
        resetRowOrder(FAM.people.map((p) => p.id));
        FAM.unions.forEach((u) => delete u.busOffset);
        rerender();
        flash("All manual positions reset");
        Storage.autosave();
      }
    });
    // new-genogram modal
    document.getElementById("new-modal").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const a = b.dataset.act;
      if (a === "new-cancel")
        document.getElementById("new-modal").classList.remove("open");
      if (a === "new-confirm") {
        document.getElementById("new-modal").classList.remove("open");
        doNewGenogram();
      }
    });
    document.getElementById("new-modal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("new-modal"))
        document.getElementById("new-modal").classList.remove("open");
    });
    // export modal
    document.getElementById("export-modal").addEventListener("click", (e) => {
      const segBtn = e.target.closest(".seg-b");
      if (segBtn) {
        const grp = segBtn.closest("[data-seg]").dataset.seg;
        expOpts[grp === "pagesize" ? "pageSize" : grp] = segBtn.dataset.v;
        renderExportModal();
        return;
      }
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "export-cancel")
        document.getElementById("export-modal").classList.remove("open");
      if (b.dataset.act === "export-confirm") {
        document.getElementById("export-modal").classList.remove("open");
        runExport();
      }
    });
    document.getElementById("export-modal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("export-modal"))
        document.getElementById("export-modal").classList.remove("open");
    });
    document.getElementById("export-modal").addEventListener("change", (e) => {
      if (e.target.dataset.f === "include-legend") {
        expOpts.includeLegend = e.target.checked;
        renderExportModal();
      }
    });
    // manage-labels modal
    document
      .getElementById("labels-modal")
      .addEventListener("click", async (e) => {
        const b = e.target.closest("[data-act]");
        if (!b) return;
        const a = b.dataset.act;
        if (a === "labels-close") closeLabelsModal();
        if (a === "remove-labeldef") {
          if (b.dataset.id === editingLabelId) {
            editingLabelId = null;
            labelDraft = {
              icon: LABEL_ICONS[0].key,
              desc: "",
              color: null,
              iconPath: null,
              customText: "",
            };
          }
          FAM.removeLabelDef(b.dataset.id);
          state.highlightLabels.delete(b.dataset.id);
          renderLabelsModal();
          rerender();
          Storage.autosave();
        }
        if (a === "edit-labeldef") {
          const l = FAM.labelDef(b.dataset.id);
          if (!l) return;
          editingLabelId = l.id;
          labelDraft = {
            icon: l.icon,
            desc: l.desc,
            color: l.color || null,
            iconPath: l.iconPath || null,
            customText: l.iconPath ? l.icon : "",
          };
          renderLabelsModal();
        }
        if (a === "cancel-labeldef-edit") {
          editingLabelId = null;
          labelDraft = {
            icon: LABEL_ICONS[0].key,
            desc: "",
            color: null,
            iconPath: null,
            customText: "",
          };
          renderLabelsModal();
        }
        if (a === "draft-icon") {
          labelDraft.icon = b.dataset.icon;
          labelDraft.iconPath = null;
          labelDraft.customText = "";
          renderLabelsModal();
        }
        if (a === "draft-color") {
          labelDraft.color = b.dataset.color || null;
          renderLabelsModal();
        }
        if (a === "add-labeldef") {
          const desc = (
            document.getElementById("labeldef-desc-input")?.value || ""
          )
            .trim()
            .slice(0, 40);
          if (!desc) return;
          // pick up any not-yet-confirmed text left in the custom-icon field
          // so clicking Add directly (without pressing Enter first) still uses it
          const ok = await resolveDraftIcon();
          if (!ok) return;
          if (editingLabelId) {
            const l = FAM.labelDef(editingLabelId);
            if (l) {
              l.icon = labelDraft.icon;
              l.desc = desc;
              l.color = labelDraft.color;
              l.iconPath = labelDraft.iconPath;
            }
            editingLabelId = null;
          } else {
            FAM.addLabelDef({
              icon: labelDraft.icon,
              desc,
              color: labelDraft.color,
              iconPath: labelDraft.iconPath,
            });
          }
          labelDraft = {
            icon: LABEL_ICONS[0].key,
            desc: "",
            color: null,
            iconPath: null,
            customText: "",
          };
          renderLabelsModal();
          rerender();
          Storage.autosave();
        }
      });
    document.getElementById("labels-modal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("labels-modal"))
        document.getElementById("labels-modal").classList.remove("open");
    });
    document.getElementById("labels-modal").addEventListener("input", (e) => {
      if (e.target.id === "labeldef-desc-input")
        labelDraft.desc = e.target.value;
      if (e.target.id === "custom-icon-input")
        labelDraft.customText = e.target.value;
    });
    document
      .getElementById("labels-modal")
      .addEventListener("keydown", async (e) => {
        if (e.target.id !== "custom-icon-input" || e.key !== "Enter") return;
        if (!e.target.value.trim()) return;
        e.target.disabled = true;
        await resolveDraftIcon();
        renderLabelsModal();
      });
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        document.getElementById("labels-modal").classList.contains("open")
      )
        closeLabelsModal();
    });
    // highlight-by-label popover
    document.getElementById("hlpop").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const a = b.dataset.act;
      if (a === "toggle-highlight-label") {
        const id = b.dataset.id;
        if (state.highlightLabels.has(id)) state.highlightLabels.delete(id);
        else state.highlightLabels.add(id);
        renderHighlightPop();
        View.highlight();
        document
          .getElementById("highlight-btn")
          ?.classList.toggle("on", state.highlightLabels.size > 0);
      }
      if (a === "clear-highlight") {
        state.highlightLabels.clear();
        renderHighlightPop();
        View.highlight();
        document.getElementById("highlight-btn")?.classList.remove("on");
      }
    });
    // save modal
    document.getElementById("save-modal").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "save-cancel")
        document.getElementById("save-modal").classList.remove("open");
      if (b.dataset.act === "save-confirm") {
        const name =
          document.getElementById("save-name-input").value.trim() || "Untitled";
        const ok = Storage.saveNamed(name);
        document.getElementById("save-modal").classList.remove("open");
        flash(ok ? "Saved: " + name : "Save failed: storage full");
      }
    });
    document.getElementById("save-modal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("save-modal"))
        document.getElementById("save-modal").classList.remove("open");
    });
    document
      .getElementById("save-name-input")
      .addEventListener("keydown", (e) => {
        if (e.key === "Enter")
          document.querySelector('[data-act="save-confirm"]').click();
      });
    // open modal
    document.getElementById("open-modal").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "open-cancel")
        document.getElementById("open-modal").classList.remove("open");
      if (b.dataset.act === "load-entry") {
        const doc = Storage.loadNamed(b.dataset.key);
        if (!doc) return;
        Storage.hydrate(doc);
        state.selected = null;
        state.selectedUnion = null;
        state.mode = "normal";
        state.relPair = [];
        state.relType = null;
        state.highlightLabels.clear();
        closeDrawer();
        document.getElementById("relbar").classList.remove("open");
        document.body.classList.remove("relating");
        document.body.classList.remove("editing");
        document.getElementById("toggle-edit-btn")?.classList.remove("on");
        document.getElementById("legend").classList.remove("open");
        document.getElementById("hlpop").classList.remove("open");
        document.getElementById("highlight-btn")?.classList.remove("on");
        document.getElementById("search").value = "";
        rerender();
        View.fit();
        updZoom();
        document.getElementById("open-modal").classList.remove("open");
        Storage.autosave();
        flash("Loaded: " + doc.name);
      }
      if (b.dataset.act === "delete-entry") {
        Storage.deleteNamed(b.dataset.key);
        Storage.renderSavesList("saves-list");
      }
    });
    document.getElementById("open-modal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("open-modal"))
        document.getElementById("open-modal").classList.remove("open");
    });
    // member list
    document.getElementById("mlist").addEventListener("click", (e) => {
      const r = e.target.closest(".mrow");
      if (!r) return;
      select(r.dataset.id);
      if (state.mode !== "relate") focusNode(r.dataset.id);
    });
    document.getElementById("search").addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll(".mrow").forEach((r) => {
        const n = r.querySelector(".mname").textContent.toLowerCase();
        r.style.display = n.includes(q) ? "" : "none";
      });
    });
    // drawer (delegated)
    document.getElementById("drawer").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const a = b.dataset.act;
      if (a === "close") closeDrawer();
      if (a === "add") commitAdd();
      if (a === "edit") openDrawer("edit");
      if (a === "save-edit") commitEdit();
      if (a === "delete") deletePerson(state.selected);
      if (a === "relate-from") enterRelate(state.selected);
      if (a === "add-community") commitAddCommunity();
      if (a === "edit-community") {
        const c = FAM.communityById(state.selected);
        if (c) {
          communityDraft = { name: c.name, description: c.description || "", color: c.color, size: c.size || "medium" };
          openDrawer("edit-community");
        }
      }
      if (a === "save-edit-community") commitEditCommunity();
      if (a === "delete-community") deleteCommunity(state.selected);
      if (a === "community-draft-color") {
        communityDraft.color = b.dataset.color;
        openDrawer(state.drawer);
      }
      if (a === "regen-community-shape") {
        const c = FAM.communityById(state.selected);
        if (c) {
          // an immediate, standalone action (not part of the name/color
          // draft's save/cancel lifecycle) — takes effect and autosaves
          // right away so the canvas shows the new shape straightaway
          c.shapeSeed = Math.floor(Math.random() * 0xffffffff);
          rerender();
          Storage.autosave();
        }
      }
      if (a === "reset-pos") {
        // manual position is purely personal now (rowOrder lives on just
        // this one person), so resetting only clears their own override —
        // everyone else in the row keeps whatever manual order they have
        resetRowOrder([state.selected]);
        rerender();
        openDrawer("inspect");
        flash("Position reset");
        Storage.autosave();
      }
      if (a === "toggle-label") {
        form.labelIds = form.labelIds || [];
        const id = b.dataset.id,
          i = form.labelIds.indexOf(id);
        if (i === -1) form.labelIds.push(id);
        else form.labelIds.splice(i, 1);
        b.classList.toggle("on", i === -1);
      }
      if (a === "toggle-label-live") {
        const p = FAM.byId(state.selected);
        if (!p) return;
        p.labelIds = p.labelIds || [];
        const id = b.dataset.id,
          i = p.labelIds.indexOf(id);
        if (i === -1) p.labelIds.push(id);
        else p.labelIds.splice(i, 1);
        b.classList.toggle("on", i === -1);
        rerender();
        Storage.autosave();
      }
      if (a === "manage-labels") {
        renderLabelsModal();
        document.getElementById("labels-modal").classList.add("open");
      }
      if (a === "add-note") {
        noteDraft = { id: null, text: "", color: null };
        openDrawer("inspect");
      }
      if (a === "edit-note") {
        const p = FAM.byId(state.selected);
        const n = p && (p.notes || []).find((x) => x.id === b.dataset.id);
        if (!n) return;
        noteDraft = { id: n.id, text: n.text, color: n.color || null };
        openDrawer("inspect");
      }
      if (a === "note-draft-color") {
        if (!noteDraft) return;
        noteDraft.color = b.dataset.color || null;
        openDrawer("inspect");
      }
      if (a === "cancel-note-edit") {
        noteDraft = null;
        openDrawer("inspect");
      }
      if (a === "save-note") {
        const p = FAM.byId(state.selected);
        if (!p || !noteDraft) return;
        const text = noteDraft.text.trim();
        if (!text) {
          flash("Note can't be empty");
          return;
        }
        p.notes = p.notes || [];
        if (noteDraft.id) {
          const n = p.notes.find((x) => x.id === noteDraft.id);
          if (n) {
            n.text = text;
            n.color = noteDraft.color;
          }
        } else {
          p.notes.push({ id: FAM.uid("note"), text, color: noteDraft.color });
        }
        noteDraft = null;
        rerender();
        openDrawer("inspect");
        Storage.autosave();
      }
      if (a === "remove-note") {
        const p = FAM.byId(state.selected);
        if (!p) return;
        p.notes = (p.notes || []).filter((n) => n.id !== b.dataset.id);
        if (noteDraft && noteDraft.id === b.dataset.id) noteDraft = null;
        rerender();
        openDrawer("inspect");
        Storage.autosave();
      }
      if (a === "rmrel") {
      }
    });
    document.getElementById("drawer").addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rmrel]");
      if (rm) {
        const [a, b] = rm.dataset.rmrel.split("__");
        FAM.rels = FAM.rels.filter((r) => !(r.a === a && r.b === b));
        rerender();
        openDrawer("inspect");
        Storage.autosave();
        return;
      }
      const ru = e.target.closest("[data-rmunion]");
      if (ru) {
        const uid = ru.dataset.rmunion;
        const u = FAM.unions.find((x) => x.id === uid);
        if (u) {
          if (u.children.length) {
            // keep children parented to the remaining partner; just drop the selected person
            u.partners = u.partners.filter((id) => id !== state.selected);
            if (!u.partners.length)
              FAM.unions = FAM.unions.filter((x) => x.id !== uid);
          } else FAM.unions = FAM.unions.filter((x) => x.id !== uid);
        }
        rerender();
        openDrawer("inspect");
        flash("Union removed");
        Storage.autosave();
      }
    });
    document.getElementById("drawer").addEventListener("change", (e) => {
      const ue = e.target.closest("[data-uedit]");
      if (!ue) return;
      const u = FAM.unions.find((x) => x.id === ue.dataset.uedit);
      if (u) {
        u.type = ue.value;
        rerender();
        openDrawer("inspect");
        flash("Union updated");
        Storage.autosave();
      }
    });
    // relbar
    document.getElementById("relbar").addEventListener("click", (e) => {
      const t = e.target.closest("[data-rtype]");
      if (t) {
        state.relType = t.dataset.rtype;
        renderRelbar();
        return;
      }
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "rel-cancel") exitRelate();
      if (b.dataset.act === "rel-apply") applyRel();
    });
    // canvas pan/zoom + node click
    canvasEvents();
    // edit-mode arrow-key nudge: fine horizontal positioning, independent of
    // the drag gesture — either a selected person's rowOffset (engine.js) or
    // a selected union's bus-origin busOffset, whichever is currently selected
    document.addEventListener("keydown", (e) => {
      if (state.mode !== "edit" || (!state.selected && !state.selectedUnion))
        return;
      if (e.target.closest("input,textarea,select,[contenteditable]")) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_BIG : NUDGE_STEP;
      const delta = e.key === "ArrowRight" ? step : -step;
      if (state.selectedUnion) {
        const u = FAM.unions.find((x) => x.id === state.selectedUnion);
        if (!u) return;
        u.busOffset = (u.busOffset || 0) + delta;
        rerender();
        Storage.autosave();
        return;
      }
      const p = FAM.byId(state.selected);
      if (!p) return;
      p.rowOffset = (p.rowOffset || 0) + delta;
      rerender();
      Storage.autosave();
    });
  }
  function bindDrawer() {
    const d = document.getElementById("drawer");
    d.querySelectorAll(".seg-b").forEach((b) =>
      b.addEventListener("click", () => {
        const grp = b.dataset.grp,
          v = b.dataset.v;
        d.querySelectorAll(`.seg-b[data-grp=${grp}]`).forEach((x) =>
          x.classList.toggle("on", x === b),
        );
        if (grp === "sex") form.sex = v;
        if (grp === "conn") form.conn = v;
        if (grp === "size") communityDraft.size = v;
        if (grp === "status") {
          form.deceased = v === "dec";
          const dinfoFld = d.querySelector("[data-dinfo-fld]");
          if (dinfoFld) dinfoFld.style.display = form.deceased ? "" : "none";
        }
        if (grp === "relation") {
          form.relation = v;
          state.addRelation = v;
          d.querySelector("[data-rel-label]").textContent =
            {
              child: "Child of",
              sibling: "Sibling of",
              partner: "Partner of",
              parent: "Parent of",
            }[v] || "";
          d.querySelector("[data-f=target]").innerHTML = targetOptions(v);
          d.querySelector("[data-conn-fld]").style.display =
            v === "child" || v === "sibling" ? "" : "none";
          d.querySelector("[data-target-fld]").style.display =
            v === "none" ? "none" : "";
        }
      }),
    );
    const idxCb = d.querySelector("[data-f=index]");
    if (idxCb)
      idxCb.addEventListener("change", () => {
        const famSec = d.querySelector("[data-fam-section]");
        if (!famSec) return;
        const show = !idxCb.checked && FAM.people.length > 0;
        famSec.style.display = show ? "" : "none";
      });
    const noteTa = d.querySelector("#note-draft-input");
    if (noteTa)
      noteTa.addEventListener("input", () => {
        if (!noteDraft) return;
        noteDraft.text = noteTa.value;
        const cnt = d.querySelector(".note-cnt");
        if (cnt) cnt.textContent = `${noteTa.value.length}/${NOTE_MAX}`;
      });
    // live-sync into communityDraft so a color-swatch click (which re-renders
    // the form via openDrawer) doesn't lose whatever the user already typed
    if (state.drawer === "add-community" || state.drawer === "edit-community") {
      const nameInp = d.querySelector("[data-f=name]");
      if (nameInp)
        nameInp.addEventListener("input", () => {
          communityDraft.name = nameInp.value;
        });
      const descInp = d.querySelector("[data-f=description]");
      if (descInp)
        descInp.addEventListener("input", () => {
          communityDraft.description = descInp.value;
        });
    }
  }

  function applyNotesVisibility() {
    document
      .getElementById("canvas")
      .classList.toggle("hide-notes", !state.showNotes);
    const btn = document.getElementById("toggle-notes-btn");
    if (btn) {
      btn.classList.toggle("on", state.showNotes);
      btn.title = state.showNotes ? "Notes shown — click to hide" : "Notes hidden — click to show";
      const lbl = btn.querySelector(".lbl");
      if (lbl) lbl.textContent = state.showNotes ? "Notes shown" : "Notes hidden";
    }
    if (!state.showNotes) hideNoteTip();
  }

  /* ---------- note-badge hover popup ----------
     Positioned in screen space (via getBoundingClientRect) rather than SVG
     space, since the canvas pans/zooms — an HTML overlay div can't be
     placed using the SVG's own coordinate system. */
  function showNoteTip(badgeEl, p) {
    const tip = document.getElementById("note-tip");
    tip.innerHTML = (p.notes || [])
      .map(
        (n) =>
          `<div class="note-tip-row"><span class="note-tip-sw" style="${n.color ? `background:${n.color}` : ""}"></span><span class="note-tip-text">${renderNoteText(n.text)}</span></div>`,
      )
      .join("");
    const stageRect = document
      .getElementById("stage-canvas")
      .getBoundingClientRect();
    const badgeRect = badgeEl.getBoundingClientRect();
    tip.classList.add("show");
    const tipRect = tip.getBoundingClientRect();
    let left = badgeRect.left - stageRect.left + badgeRect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, stageRect.width - tipRect.width - 8));
    const top = badgeRect.top - stageRect.top - tipRect.height - 10;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }
  function hideNoteTip() {
    document.getElementById("note-tip").classList.remove("show");
  }

  /* ---------- community hover popup (same mechanism as notes, above) ---------- */
  function showCommunityTip(el, c) {
    const tip = document.getElementById("community-tip");
    tip.innerHTML = `<div class="note-tip-h">${escapeHtml(c.name)}</div><div class="note-tip-row"><span class="note-tip-text">${renderNoteText(c.description)}</span></div>`;
    const stageRect = document
      .getElementById("stage-canvas")
      .getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    tip.classList.add("show");
    const tipRect = tip.getBoundingClientRect();
    let left = elRect.left - stageRect.left + elRect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, stageRect.width - tipRect.width - 8));
    const top = elRect.top - stageRect.top - tipRect.height - 10;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }
  function hideCommunityTip() {
    document.getElementById("community-tip").classList.remove("show");
  }

  function applyEmoVisibility() {
    document
      .getElementById("canvas")
      .classList.toggle("hide-emo", !state.showEmo);
  }

  function deselectSilent() {
    state.selected = null;
    state.selectedUnion = null;
    View.selection();
  }
  function focusNode() {
    /* could center; keep view stable */
  }
  function updZoom() {
    const z = document.getElementById("zpct");
    if (z) z.textContent = View.zoomPct() + "%";
  }

  /* ---- edit-mode drag-to-reorder helpers ----
     Every drag moves exactly ONE person — never their spouse(s), never a
     "block" — and re-sequences them anywhere among everyone else in the
     same generation row. There's no adjacency requirement: a union whose
     partners land non-adjacent after this still renders fine (the existing
     obstruction-routing in View bows the line up and over whoever ends up
     in between), which is the point — manual placement is meant to escape
     the auto-balancing heuristics, not extend them. */
  function startDrag(node, e) {
    const id = node.dataset.id,
      p = FAM.byId(id);
    if (!p) return null;
    const others = Layout.peopleInGen(p.gen)
      .filter((oid) => oid !== id)
      .map((oid) => ({ id: oid, c: Layout.pos(oid).x, half: Layout.nodeHalf }));
    // deliberately no early bail-out when `others` is empty (the sole person
    // in their generation, e.g. an only child) — there's nothing to reorder
    // against, but they can still be dragged continuously via rowOffset;
    // returning null here used to fall through to canvas-panning instead
    // homeIdx: where they'd slot back in among `others` at their own
    // starting x — the indicator only makes sense once the drop position
    // has moved past this, not from the very start of an in-place reposition
    const myX = Layout.pos(id).x;
    let homeIdx = others.length;
    for (let i = 0; i < others.length; i++) {
      if (myX < others[i].c) {
        homeIdx = i;
        break;
      }
    }
    return {
      kind: "person",
      id,
      gen: p.gen,
      others,
      homeIdx,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      dropIdx: null,
    };
  }
  function updateDrag(drag, e) {
    const w = View.toWorld(e.clientX, e.clientY);
    drag.lastX = w.x;
    const el = document.querySelector(`.node[data-id="${drag.id}"]`);
    if (el)
      el.setAttribute(
        "transform",
        `translate(${w.x},${Layout.pos(drag.id).y})`,
      );
    let idx = drag.others.length;
    for (let i = 0; i < drag.others.length; i++) {
      if (w.x < drag.others[i].c) {
        idx = i;
        break;
      }
    }
    drag.dropIdx = idx;
    if (idx === drag.homeIdx) endDragVisual();
    else showDragIndicator(drag.others, idx, Layout.pos(drag.id).y);
  }
  function showDragIndicator(others, idx, y) {
    let line = document.getElementById("drag-indicator");
    if (!line) {
      line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.id = "drag-indicator";
      document.getElementById("world").appendChild(line);
    }
    const before = others[idx - 1],
      after = others[idx];
    const x =
      before && after
        ? (before.c + before.half + after.c - after.half) / 2
        : after
          ? after.c - after.half - 40
          : before
            ? before.c + before.half + 40
            : 0;
    line.setAttribute("x1", x);
    line.setAttribute("x2", x);
    line.setAttribute("y1", y - 70);
    line.setAttribute("y2", y + 70);
  }
  function endDragVisual() {
    document.getElementById("drag-indicator")?.remove();
  }
  function commitDrag(drag) {
    const order = drag.others.slice();
    order.splice(drag.dropIdx, 0, { id: drag.id });
    order.forEach((s, i) => {
      const p = FAM.byId(s.id);
      if (p) p.rowOrder = (i + 1) * RANK_STEP;
    });
    // continuous fine-position: find where this slot would land with zero
    // offset, then store the leftover distance to the actual drop point as
    // rowOffset — one drag gesture sets both order AND fine position;
    // arrow keys still work afterward for further adjustment
    const p = FAM.byId(drag.id);
    delete p.rowOffset;
    Layout.compute();
    const naturalX = Layout.pos(drag.id).x;
    const offset = drag.lastX - naturalX;
    if (Math.abs(offset) >= 1) p.rowOffset = offset;
    else delete p.rowOffset;
    rerender();
    flash("Position updated");
    Storage.autosave();
  }

  /* ---- a union's own line-origin handle: a simple 1:1 pixel-follow drag,
     no reordering/siblings concept (unlike a person's drag), just a direct
     continuous nudge of engine.js's busOffset ---- */
  function startBusDrag(handle, e) {
    const uid = handle.dataset.uid,
      u = FAM.unions.find((x) => x.id === uid);
    if (!u) return null;
    const baseX = parseFloat(handle.dataset.x) - (u.busOffset || 0); // raw, offset-free mx
    return {
      kind: "bus",
      uid,
      baseX,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      lastX: parseFloat(handle.dataset.x),
    };
  }
  function updateBusDrag(drag, e) {
    const w = View.toWorld(e.clientX, e.clientY);
    drag.lastX = w.x;
    const el = document.querySelector(`.bus-handle[data-uid="${drag.uid}"]`);
    if (el) el.setAttribute("transform", `translate(${w.x},${el.dataset.y})`);
  }
  function commitBusDrag(drag) {
    const u = FAM.unions.find((x) => x.id === drag.uid);
    if (!u) return;
    const offset = drag.lastX - drag.baseX;
    if (Math.abs(offset) >= 1) u.busOffset = offset;
    else delete u.busOffset;
    rerender();
    flash("Position updated");
    Storage.autosave();
  }

  /* ---- a community blob: free 1:1 pixel-follow drag on BOTH axes, no
     row/generation/order concept at all (unlike a person's drag) — it just
     writes the pointer's world position straight to the community's own
     absolute pos, entirely independent of Layout.compute()/relax() ---- */
  function startCommunityDrag(node, e) {
    const id = node.dataset.id,
      c = FAM.communityById(id);
    if (!c) return null;
    return {
      kind: "community",
      id,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      lastX: c.pos.x,
      lastY: c.pos.y,
    };
  }
  function updateCommunityDrag(drag, e) {
    const w = View.toWorld(e.clientX, e.clientY);
    drag.lastX = w.x;
    drag.lastY = w.y;
    const el = document.querySelector(`.community-node[data-id="${drag.id}"]`);
    if (el) el.setAttribute("transform", `translate(${w.x},${w.y})`);
  }
  function commitCommunityDrag(drag) {
    const c = FAM.communityById(drag.id);
    if (!c) return;
    c.pos = { x: drag.lastX, y: drag.lastY };
    rerender();
    flash("Position updated");
    Storage.autosave();
  }

  function canvasEvents() {
    const svg = document.getElementById("canvas");
    let down = null,
      moved = false,
      drag = null;
    svg.addEventListener("pointerdown", (e) => {
      if (state.mode === "edit") {
        const handle = e.target.closest(".bus-handle");
        if (handle) {
          drag = startBusDrag(handle, e);
          if (drag) svg.setPointerCapture(e.pointerId);
        }
        if (!drag) {
          const node = e.target.closest(".node");
          if (node) {
            drag =
              node.dataset.kind === "community"
                ? startCommunityDrag(node, e)
                : startDrag(node, e);
            if (drag) svg.setPointerCapture(e.pointerId);
          }
        }
        if (drag) return;
      }
      down = {
        x: e.clientX,
        y: e.clientY,
        vx: View.panView.x,
        vy: View.panView.y,
      };
      moved = false;
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", (e) => {
      if (drag) {
        if (
          !drag.moved &&
          Math.abs(e.clientX - drag.startX) +
            Math.abs(e.clientY - drag.startY) <=
            4
        )
          return;
        drag.moved = true;
        if (drag.kind === "bus") updateBusDrag(drag, e);
        else if (drag.kind === "community") updateCommunityDrag(drag, e);
        else updateDrag(drag, e);
        return;
      }
      if (!down) return;
      const dx = e.clientX - down.x,
        dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      View.panView.x = down.vx + dx;
      View.panView.y = down.vy + dy;
      document
        .getElementById("world")
        .setAttribute(
          "transform",
          `translate(${View.panView.x},${View.panView.y}) scale(${View.panView.k})`,
        );
    });
    svg.addEventListener("pointerup", (e) => {
      if (drag) {
        try {
          svg.releasePointerCapture(e.pointerId);
        } catch (_) {}
        if (drag.kind === "bus") {
          if (drag.moved) commitBusDrag(drag);
          else selectUnion(drag.uid);
        } else if (drag.kind === "community") {
          if (drag.moved) commitCommunityDrag(drag);
          else select(drag.id);
        } else {
          if (drag.moved) commitDrag(drag);
          else select(drag.id);
        }
        endDragVisual();
        drag = null;
        return;
      }
      const wasMoved = moved;
      down = null;
      try {
        svg.releasePointerCapture(e.pointerId);
      } catch (_) {}
      if (!wasMoved) {
        // Pointer capture redirects e.target to the svg, so hit-test the cursor position instead.
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const node = el && el.closest(".node");
        if (node) select(node.dataset.id);
        else deselect();
      }
    });
    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        View.zoomBy(
          e.deltaY < 0 ? 1.1 : 1 / 1.1,
          e.clientX - r.left,
          e.clientY - r.top,
        );
        updZoom();
      },
      { passive: false },
    );
    // note-badge hover popup — pointerover/pointerout bubble (unlike
    // mouseenter/mouseleave), so a single delegated pair works here
    svg.addEventListener("pointerover", (e) => {
      if (!state.showNotes) return;
      const badge = e.target.closest(".note-badge");
      if (!badge) return;
      const p = FAM.byId(badge.dataset.noteBadge);
      if (p) showNoteTip(badge, p);
    });
    svg.addEventListener("pointerout", (e) => {
      if (e.target.closest(".note-badge")) hideNoteTip();
    });
    // community-blob hover popup — same delegated pointerover/pointerout
    // mechanism as note badges, just triggered by the whole blob
    svg.addEventListener("pointerover", (e) => {
      const cn = e.target.closest(".community-node");
      if (!cn) return;
      const c = FAM.communityById(cn.dataset.id);
      if (c && c.description) showCommunityTip(cn, c);
    });
    svg.addEventListener("pointerout", (e) => {
      if (e.target.closest(".community-node")) hideCommunityTip();
    });
  }

  /* toast */
  let toastT;
  function flash(msg, ms = 1900) {
    let t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), ms);
  }

  return { state, init, select, rerender, enterRelate };
})();

/* legend content builder */
function buildLegend() {
  const el = document.getElementById("legend-body");
  if (!el) return;
  const members = FAM.usedMemberTraits();
  const partner = FAM.usedPartnerTypes();
  const emo = FAM.usedEmotionalTypes();
  const labels = FAM.usedLabels().map((l) => ({ ...l, label: l.desc }));
  const col = (title, rows, iconFn) =>
    rows.length
      ? `<div class="lg-col"><div class="lg-h">${title}</div>${rows
          .map(
            (r) =>
              `<div class="lg-row"><span class="lg-s">${iconFn(r)}</span>${r.label}</div>`,
          )
          .join("")}</div>`
      : "";
  const cols = [
    col("Members", members, (r) => SYM.mini(r.trait, 22)),
    col("Partner / family", partner, (r) => SYM.relMini(r.key)),
    col("Emotional", emo, (r) => SYM.relMini(r.key)),
    col("Labels", labels, (r) =>
      renderLabelIcon(r.icon, 20, r.color, r.iconPath),
    ),
  ].filter(Boolean);
  el.style.gridTemplateColumns = `repeat(${cols.length || 1},1fr)`;
  el.innerHTML = cols.join("");
}

window.addEventListener("DOMContentLoaded", () => {
  App.init();
  buildLegend();
});
