/* ============================================================
   Kinmap — member label icons
   ============================================================
   Free-form per-member labels (icon + short description, added while
   editing a member) pull their icon from this list. Icons are lucide.dev's
   published SVG source (24x24 viewBox, stroke-based line art) — add more
   entries here to make more icons available in the label editor; no other
   file needs to change. */
const LABEL_ICONS = [
  { key:'star', name:'Star',
    path:'<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>' },
  { key:'heart', name:'Heart',
    path:'<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>' },
  { key:'flag', name:'Flag',
    path:'<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>' },
  { key:'triangle-alert', name:'Alert Triangle',
    path:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>' },
  { key:'house', name:'House',
    path:'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' },
  { key:'transgender', name:'Transgender',
    path:'<path d="M12 16v6"/><path d="M14 20h-4"/><path d="M18 2h4v4"/><path d="m2 2 7.17 7.17"/><path d="M2 5.355V2h3.357"/><path d="m22 2-7.17 7.17"/><path d="M8 5 5 8"/><circle cx="12" cy="12" r="4"/>' },
  { key:'mars', name:'Mars',
    path:'<path d="M16 3h5v5"/><path d="m21 3-6.75 6.75"/><circle cx="10" cy="14" r="6"/>' },
  { key:'venus', name:'Venus',
    path:'<path d="M12 15v7"/><path d="M9 19h6"/><circle cx="12" cy="9" r="6"/>' },
  { key:'shield', name:'Shield',
    path:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>' },
  { key:'hexagon', name:'Hexagon',
    path:'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' },
  { key:'blend', name:'Blend',
    path:'<circle cx="9" cy="9" r="7"/><circle cx="15" cy="15" r="7"/>' },
  { key:'club', name:'Club',
    path:'<path d="M17.28 9.05a5.5 5.5 0 1 0-10.56 0A5.5 5.5 0 1 0 12 17.66a5.5 5.5 0 1 0 5.28-8.6Z"/><path d="M12 17.66L12 22"/>' },
  { key:'diamond', name:'Diamond',
    path:'<path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"/>' },
  { key:'spade', name:'Spade',
    path:'<path d="M12 18v4"/><path d="M2 14.499a5.5 5.5 0 0 0 9.591 3.675.6.6 0 0 1 .818.001A5.5 5.5 0 0 0 22 14.5c0-2.29-1.5-4-3-5.5l-5.492-5.312a2 2 0 0 0-3-.02L5 8.999c-1.5 1.5-3 3.2-3 5.5"/>' },
  { key:'astroid', name:'Astroid',
    path:'<path d="M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203"/>' },
  { key:'building', name:'Building',
    path:'<path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M12 6h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/><path d="M8 6h.01"/><path d="M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><rect x="4" y="2" width="16" height="20" rx="2"/>' },
  { key:'church', name:'Church',
    path:'<path d="M10 9h4"/><path d="M12 7v5"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="m18 9 3.52 2.147a1 1 0 0 1 .48.854V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6.999a1 1 0 0 1 .48-.854L6 9"/><path d="M6 21V7a1 1 0 0 1 .376-.782l5-3.999a1 1 0 0 1 1.249.001l5 4A1 1 0 0 1 18 7v14"/>' },
  { key:'graduation-cap', name:'Graduation Cap',
    path:'<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>' },
  { key:'shell', name:'Shell',
    path:'<path d="M14 11a2 2 0 1 1-4 0 4 4 0 0 1 8 0 6 6 0 0 1-12 0 8 8 0 0 1 16 0 10 10 0 1 1-20 0 11.93 11.93 0 0 1 2.42-7.22 2 2 0 1 1 3.16 2.44"/>' },
  { key:'flower', name:'Flower',
    path:'<circle cx="12" cy="12" r="3"/><path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"/><path d="M12 7.5V9"/><path d="M7.5 12H9"/><path d="M16.5 12H15"/><path d="M12 16.5V15"/><path d="m8 8 1.88 1.88"/><path d="M14.12 9.88 16 8"/><path d="m8 16 1.88-1.88"/><path d="M14.12 14.12 16 16"/>' },
];

// optional icon tint for member labels — 'default' (null) leaves the icon to
// inherit its normal ink color; add more rows here for more color choices
const LABEL_COLORS = [
  { key:'default',         name:'Default',         value:null },
  { key:'copper',          name:'Copper',          value:'#B9743F' },
  { key:'hunter-green',    name:'Hunter Green',    value:'#34623F' },
  { key:'vintage-berry',   name:'Vintage Berry',   value:'#883955' },
  { key:'dry-sage',        name:'Dry Sage',        value:'#AEBD93' },
  { key:'rich-cerulean',   name:'Rich Cerulean',   value:'#2274A5' },
  { key:'blue-spruce',     name:'Blue Spruce',     value:'#157A6E' },
  { key:'taupe',           name:'Taupe',           value:'#463F3A' },
  { key:'bright-amber',    name:'Bright Amber',    value:'#FFCF00' },
  { key:'vintage-grape',   name:'Vintage Grape',   value:'#5C415D' },
  { key:'blush-rose',      name:'Blush Rose',      value:'#EA638C' },
  { key:'vanilla-custard', name:'Vanilla Custard', value:'#DCDBA8' },
];

// fixed, non-user-selectable glyph for the member-notes canvas badge/toolbar
// toggle (Lucide "sticky-note") — not part of LABEL_ICONS since it's never
// offered in the label icon picker
const NOTE_BADGE_ICON = '<path d="M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/><path d="M15 3v5a1 1 0 0 0 1 1h5"/>';

// customPath lets a caller render a one-off icon a labelDef carries directly
// (a custom Lucide icon fetched by name for that specific label) without it
// needing to exist in LABEL_ICONS at all
function renderLabelIcon(key, size=16, color=null, customPath=null){
  const path=customPath || LABEL_ICONS.find(i=>i.key===key)?.path;
  if(!path) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${color?` style="color:${color}"`:''}>${path}</svg>`;
}

function renderNoteBadgeIcon(size=16){
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${NOTE_BADGE_ICON}</svg>`;
}
