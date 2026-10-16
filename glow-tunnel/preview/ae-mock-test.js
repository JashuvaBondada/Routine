// Minimal After Effects stand-in for running a .jsx end to end in Node.
// It checks script logic, effect match names, and evaluates every expression
// the script writes against a fake CONTROLS layer.
const fs = require('fs');
const vm = require('vm');
const [, , scriptPath, scenario] = process.argv;

const KNOWN_EFFECTS = new Set(['ADBE Slider Control', 'ADBE Color Control', 'ADBE Bulge', 'CC Radial Fast Blur',
  'ADBE Radial Blur', 'ADBE Geometry2', 'ADBE Tint', 'ADBE Glo2', 'ADBE Noise', 'ADBE Offset', 'ADBE Corner Pin']);
const log = [], expressions = [];

class Prop {
  constructor(name, parent, value) {
    this.name = name; this.matchName = name; this.parentProperty = parent; this._v = value; this.kids = [];
    this.keys = []; this.expression = ''; this.propertyValueType = 0; this.maskMode = 0;
  }
  get value() { return this._v === undefined ? 0 : this._v; }
  setValue(v) { if (v === undefined) throw new Error('setValue(undefined) on ' + this.path()); this._v = v; }
  setValuesAtTimes(t, v) {
    if (!Array.isArray(t) || t.length !== v.length) throw new Error('setValuesAtTimes mismatch on ' + this.path());
    t.forEach((tt, i) => this.keys.push([tt, v[i]]));
  }
  get numKeys() { return this.keys.length; }
  setTemporalEaseAtKey(i, a, b) { if (i < 1 || i > this.keys.length) throw new Error('bad key index ' + i); if (!a.length) throw new Error('empty ease'); }
  path() { return (this.parentProperty && this.parentProperty.path ? this.parentProperty.path() + ' > ' : '') + this.name; }
  property(n) {
    if (typeof n === 'number') { const k = this.kids[n - 1]; if (!k) throw new Error('no property index ' + n + ' in ' + this.path()); return k; }
    let k = this.kids.find(x => x.name === n || x.matchName === n);
    if (!k) { k = new Prop(n, this); this.kids.push(k); }
    return k;
  }
  get numProperties() { return this.kids.length; }
  get propertyType() { return this.kids.length ? 2 : 1; }
  get canSetExpression() { return true; }
  get expressionError() { return ''; }
  get propertyIndex() { return this.parentProperty.kids.indexOf(this) + 1; }
  canAddProperty(mn) { return KNOWN_EFFECTS.has(mn) || /^ADBE (Mask Atom|Vector)/.test(mn); }
  addProperty(mn) {
    if (this.name === 'ADBE Effect Parade' && !KNOWN_EFFECTS.has(mn)) throw new Error('unknown effect ' + mn);
    const p = new Prop(mn, this); this.kids.push(p);
    // Real effects come with their parameters already present.
    if (this.name === 'ADBE Effect Parade') for (let i = 1; i <= 4; i++) p.kids.push(new Prop(mn + '-000' + i, p));
    if (mn === 'ADBE Mask Atom') ['ADBE Mask Shape', 'ADBE Mask Feather'].forEach(n => p.kids.push(new Prop(n, p)));
    return p;
  }
}
// Watch every expression assignment.
Object.defineProperty(Prop.prototype, 'expression', {
  get() { return this._e || ''; },
  set(e) { this._e = e; if (e) expressions.push({ where: this.path(), expr: e, value: this._v }); }
});

let idSeq = 1;
class Layer {
  constructor(comp, name, kind) {
    this.containingComp = comp; this.name = name; this.kind = kind; this.enabled = true; this.selected = false;
    this.adjustmentLayer = false; this.inPoint = 0; this.outPoint = comp.duration; this.startTime = 0;
    this.root = new Prop(name, null);
    const t = this.root.property('ADBE Transform Group');
    t.property('ADBE Anchor Point').setValue([0, 0]); t.property('ADBE Position').setValue([comp.width / 2, comp.height / 2]);
    t.property('ADBE Position').propertyValueType = 6413; t.property('ADBE Position').dimensionsSeparated = false;
    t.property('ADBE Scale').setValue([100, 100, 100]); t.property('ADBE Opacity').setValue(100);
    if (kind === 'text') this.root.property('ADBE Text Properties').property('ADBE Text Document').setValue(new TextDocument(name));
    this.hasVideo = kind !== 'audio'; this.hasAudio = kind === 'audio';
  }
  property(n) { if (n === 'ADBE Text Properties' && this.kind !== 'text') return null; return this.root.property(n); }
  get numProperties() { return this.root.kids.length; }
  sourceRectAtTime() {
    if (this.kind === 'text') { const d = this.property('ADBE Text Properties').property('ADBE Text Document').value;
      return { left: -d.text.length * d.fontSize * 0.27, top: -d.fontSize * 0.72, width: d.text.length * d.fontSize * 0.54, height: d.fontSize * 0.72 }; }
    return { left: 0, top: 0, width: this.w || this.containingComp.width, height: this.h || this.containingComp.height };
  }
  duplicate() { const L = new Layer(this.containingComp, this.name, this.kind); L.root = clone(this.root); this.containingComp._insertAbove(this, L); return L; }
  moveToBeginning() { this.containingComp._move(this, 0); }
  moveToEnd() { this.containingComp._move(this, Infinity); }
  get index() { return this.containingComp._layers.indexOf(this) + 1; }
}
function clone(p, parent) { const q = new Prop(p.name, parent, Array.isArray(p._v) ? p._v.slice() : (p._v && p._v.clone ? p._v.clone() : p._v));
  q.matchName = p.matchName; q.propertyValueType = p.propertyValueType; q.kids = p.kids.map(k => clone(k, q)); q.keys = p.keys.slice(); return q; }
class TextDocument { constructor(t) { this.text = t; this.font = 'ArialMT'; this.fontSize = 50; this.tracking = 0; }
  clone() { return Object.assign(new TextDocument(this.text), this); } }
class Item { constructor(name) { this.name = name; this.id = idSeq++; this.parentFolder = null; } }
class CompItem extends Item {
  constructor(name, w, h, par, dur, fps) { super(name); this.width = w; this.height = h; this.duration = dur; this.frameRate = fps; this._layers = []; this.time = 0;
    const self = this;
    this.layers = {
      addText(t) { const L = new Layer(self, t, 'text'); self._layers.unshift(L); return L; },
      addSolid(c, n, w, h) { if (!Array.isArray(c) || c.length !== 3) throw new Error('addSolid colour'); const L = new Layer(self, n, 'solid'); L.w = w; L.h = h; self._layers.unshift(L); return L; },
      addNull(d) { const L = new Layer(self, 'Null', 'null'); self._layers.unshift(L); return L; },
      addShape() { const L = new Layer(self, 'Shape', 'shape'); self._layers.unshift(L); return L; },
      add(item) { if (!item) throw new Error('layers.add(undefined)'); const L = new Layer(self, item.name, item.hasAudio && !item.hasVideo ? 'audio' : 'av'); self._layers.unshift(L); return L; },
    };
  }
  get numLayers() { return this._layers.length; }
  layer(i) { if (typeof i === 'string') return this._layers.find(l => l.name === i) || null; const L = this._layers[i - 1]; if (!L) throw new Error('no layer ' + i); return L; }
  get selectedLayers() { return this._layers.filter(l => l.selected); }
  _insertAbove(ref, L) { this._layers.splice(this._layers.indexOf(ref), 0, L); }
  _move(L, to) { this._layers.splice(this._layers.indexOf(L), 1); if (to === 0) this._layers.unshift(L); else this._layers.push(L); }
  openInViewer() {}
}
class FootageItem extends Item { constructor(n, audio) { super(n); this.hasAudio = audio; this.hasVideo = !audio; this.duration = 200; } }

const project = {
  items: { addComp: (...a) => (Layer.builtComp = new CompItem(...a)), addFolder: n => new Item(n) },
  activeItem: null,
  renderQueue: { items: { add: c => log.push('render queue: ' + c.name) } },
  importFile(io) {
    const p = io.file.fsName;
    if (/\.psd$/i.test(p)) {
      const comp = new CompItem('alesso', 1080, 1920, 1, 10, 30);
      const bg = new Layer(comp, 'Background', 'av'); bg.w = 1080; bg.h = 1920;
      const tx = new Layer(comp, 'Alesso', 'av'); tx.w = 751; tx.h = 212;
      comp._layers = [tx, bg];
      return comp;
    }
    return new FootageItem('song.mp3', true);
  },
};
let lastComp = null;
const app = {
  project, beginUndoGroup() {}, endUndoGroup() {},
  findMenuCommandId: n => (n === 'Convert to Editable Text' ? 3799 : 0),
  executeCommand(id) {
    // Convert the selected PSD text layer into a text layer, like AE does.
    for (const c of [lastComp].filter(Boolean)) {}
    const comp = Layer.lastSelectedComp; if (!comp) return;
    const sel = comp._layers.find(l => l.selected); if (!sel) return;
    const T = new Layer(comp, sel.name, 'text');
    const d = T.property('ADBE Text Properties').property('ADBE Text Document').value;
    d.text = 'Alesso'; d.font = 'Futura-CondensedExtraBold'; d.fontSize = 50; d.tracking = -40;
    sel.selected = false; T.selected = true; comp._layers.unshift(T); sel.enabled = false;
  },
};
// Track which comp the script selected a layer in.
Object.defineProperty(Layer.prototype, 'selected', { get() { return this._sel || false; }, set(v) { this._sel = v; if (v) Layer.lastSelectedComp = this.containingComp; } });

const answers = {
  text:    { edit: ['', 'Alesso', '', '#FF6A00', '', '0:00', '10'], checks: [true, true] },
  psd:     { edit: ['/u/alesso.psd', '', '', '#FF6A00', '', '0:00', '10'], checks: [true, true] },
  psdSong: { edit: ['/u/alesso.psd', '', '', 'orange', '/u/song.mp3', '1:05.5', '12'], checks: [true, false] },
}[scenario];
class Window {
  constructor() { this._edits = []; this._checks = []; }
  add(type, b, text) {
    const ctl = { text: text || '', value: false, preferredSize: {}, graphics: {}, onClick: null, add: (...a) => this.add(...a), alignment: '', orientation: '', alignChildren: [] };
    if (type === 'edittext') this._edits.push(ctl);
    if (type === 'checkbox') this._checks.push(ctl);
    return ctl;
  }
  show() { this._edits.forEach((c, i) => c.text = answers.edit[i]); this._checks.forEach((c, i) => c.value = answers.checks[i]); return 1; }
}
function File(p) { if (!(this instanceof File)) return new File(p); this.fsName = p; this.exists = true; this.displayName = String(p).split('/').pop(); }
File.prototype.open = function () { return true; }; File.prototype.write = function (t) { log.push('REPORT FILE ' + this.fsName + ':\n' + t); }; File.prototype.close = function () {};
File.openDialog = () => null;
function ImportOptions(f) { this.file = f; this.canImportAs = () => true; }

const ctx = {
  app, File, ImportOptions, Folder: { desktop: { fsName: '/home/mock/Desktop' } }, PropertyType: { PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3 }, Window, CompItem, AVLayer: Layer, TextLayer: Layer, ShapeLayer: Layer,
  ImportAsType: { COMP_CROPPED_LAYERS: 1, COMP: 2 }, KeyframeEase: function (s, i) { this.speed = s; this.influence = i; },
  PropertyValueType: { TwoD_SPATIAL: 6413, ThreeD_SPATIAL: 6414 }, ParagraphJustification: { CENTER_JUSTIFY: 7415 },
  MaskMode: { ADD: 1, SUBTRACT: 2, INTERSECT: 3 }, Shape: function () {}, BlendingMode: { MULTIPLY: 1 },
  alert: m => log.push('ALERT: ' + m), $: { writeln: console.log },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), ctx, { filename: scriptPath });
log.forEach(l => console.log(l));
if (process.env.LAYERS) console.log('layers top->bottom: ' + Layer.builtComp._layers.map(l => l.name + (l.adjustmentLayer ? ' [adj]' : '')).join(' | '));

// Evaluate every expression against the comp the script built.
const main = [...new Set(expressions.map(() => null))] && Layer.builtComp;
let bad = 0;
const comps = [];
for (const e of expressions) {
  const controls = { effect: n => () => ({ Glow: 100, Streaks: 40, Squeeze: 0.5, Speed: 0.8, Growth: 1.6, Stretch: 25, Sway: 3, Grain: 7, Twist: 4, Copies: 75, Color: [1, 0.4, 0, 1] }[n] ?? (() => { throw new Error('no control "' + n + '"'); })()) };
  const thisComp = { layer: n => { if (n !== 'CONTROLS') throw new Error('no layer ' + n); return { effect: n2 => idx => controls.effect(n2)() }; } };
  const ease = (t, t0, t1, a, b) => { const p = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))); return a + (b - a) * p; };
  try {
    const f = new Function('thisComp', 'thisLayer', 'time', 'value', 'ease', 'Math', 'return eval(arguments[6]);');
    for (const time of [0, 0.4, 2.3, 7.9]) {
      const v = f(thisComp, { width: 1080, height: 1920 }, time, e.value === undefined ? [100, 100, 100] : e.value, ease, Math, e.expr);
      const ok = (typeof v === 'number' && isFinite(v)) || (Array.isArray(v) && v.every(x => typeof x === 'number' && isFinite(x)));
      if (!ok) throw new Error('bad result ' + JSON.stringify(v));
    }
  } catch (err) { bad++; console.log('EXPRESSION ERROR at ' + e.where + ': ' + err.message + '\n   ' + e.expr); }
}
console.log(expressions.length + ' expressions evaluated, ' + bad + ' failed');
