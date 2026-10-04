// tests/ui/minidom.js — DOM mínimo para ejecutar la interfaz en Node, sin dependencias.
// Cubre lo que usan los módulos de src/simulador/ui/ y src/shared/: parseo de HTML (index.html completo),
// querySelector/All con listas, descendientes, tag, #id, .clase, [attr], [attr="v"], [attr^="v"] y :checked,
// closest/matches, classList, dataset, atributos y propiedades de formulario (value, checked, disabled, readOnly,
// options/selectedIndex), innerHTML/insertAdjacentHTML/textContent, cloneNode, eventos con burbujeo.
// No es un navegador: no hay maquetación, CSS ni carga de recursos.

const VACIOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', hellip: '…', raquo: '»', laquo: '«', middot: '·', times: '×', rarr: '→', larr: '←', harr: '↔', ndash: '–', mdash: '—' };
export const decodificar = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, c) => c[0] === '#' ? String.fromCodePoint(c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10)) : (ENT[c] ?? m));
const escapar = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class Evento {
    constructor(tipo, opciones = {}) { this.type = tipo; this.bubbles = !!opciones.bubbles; this.cancelable = !!opciones.cancelable; this.detail = opciones.detail; this.defaultPrevented = false; this._parar = false; this.target = null; this.currentTarget = null; }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._parar = true; }
    stopImmediatePropagation() { this._parar = true; this._inmediato = true; }
}
export class EventoPersonalizado extends Evento {}

class Nodo {
    constructor(doc) { this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; this._oyentes = new Map(); }
    get parentElement() { return this.parentNode instanceof Elemento ? this.parentNode : null; }
    addEventListener(tipo, fn) { if (!this._oyentes.has(tipo)) this._oyentes.set(tipo, []); this._oyentes.get(tipo).push(fn); }
    removeEventListener(tipo, fn) { const l = this._oyentes.get(tipo); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
    dispatchEvent(ev) {
        ev.target = ev.target || this;
        const ruta = []; for (let n = this; n; n = n.parentNode) ruta.push(n);
        if (this.ownerDocument && ruta[ruta.length - 1] !== this.ownerDocument) ruta.push(this.ownerDocument);
        for (const n of ruta) {
            ev.currentTarget = n;
            for (const fn of [...(n._oyentes.get(ev.type) || [])]) { if (typeof fn === 'function') fn.call(n, ev); else if (fn && fn.handleEvent) fn.handleEvent(ev); if (ev._inmediato) break; }
            const inline = n['on' + ev.type]; if (typeof inline === 'function') inline.call(n, ev);
            if (!ev.bubbles || ev._parar) break;
        }
        return !ev.defaultPrevented;
    }
}

export class Texto extends Nodo {
    constructor(doc, texto) { super(doc); this.nodeType = 3; this.data = String(texto); }
    get textContent() { return this.data; } set textContent(v) { this.data = String(v); }
    get nodeValue() { return this.data; }
    cloneNode() { return new Texto(this.ownerDocument, this.data); }
}

export class Elemento extends Nodo {
    constructor(doc, tag) { super(doc); this.nodeType = 1; this.tagName = tag.toUpperCase(); this.localName = tag.toLowerCase(); this._attrs = new Map(); this.style = crearEstilo(); this._valor = undefined; this._checked = undefined; this._selected = undefined; }
    // ---- atributos
    getAttribute(n) { return this._attrs.has(n) ? this._attrs.get(n) : null; }
    setAttribute(n, v) { this._attrs.set(n, String(v)); if (n === 'id') this.ownerDocument._ids = null; }
    removeAttribute(n) { this._attrs.delete(n); if (n === 'id') this.ownerDocument._ids = null; }
    hasAttribute(n) { return this._attrs.has(n); }
    get attributes() { return Array.from(this._attrs, ([name, value]) => ({ name, value })); }
    get id() { return this.getAttribute('id') || ''; } set id(v) { this.setAttribute('id', v); }
    get className() { return this.getAttribute('class') || ''; } set className(v) { this.setAttribute('class', v); }
    get name() { return this.getAttribute('name') || ''; } set name(v) { this.setAttribute('name', v); }
    get type() { return this.getAttribute('type') || (this.localName === 'input' ? 'text' : ''); } set type(v) { this.setAttribute('type', v); }
    get title() { return this.getAttribute('title') || ''; } set title(v) { this.setAttribute('title', v); }
    get placeholder() { return this.getAttribute('placeholder') || ''; } set placeholder(v) { this.setAttribute('placeholder', v); }
    get href() { return this.getAttribute('href') || ''; } set href(v) { this.setAttribute('href', v); }
    get download() { return this.localName === 'a' ? (this.getAttribute('download') || '') : undefined; } set download(v) { this.setAttribute('download', v); }
    get src() { return this.getAttribute('src') || ''; } set src(v) { this.setAttribute('src', v); }
    get disabled() { return this.hasAttribute('disabled'); } set disabled(v) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }
    get readOnly() { return this.hasAttribute('readonly'); } set readOnly(v) { v ? this.setAttribute('readonly', '') : this.removeAttribute('readonly'); }
    get hidden() { return this.hasAttribute('hidden'); } set hidden(v) { v ? this.setAttribute('hidden', '') : this.removeAttribute('hidden'); }
    get required() { return this.hasAttribute('required'); } set required(v) { v ? this.setAttribute('required', '') : this.removeAttribute('required'); }
    get min() { return this.getAttribute('min') || ''; } set min(v) { this.setAttribute('min', v); }
    get max() { return this.getAttribute('max') || ''; } set max(v) { this.setAttribute('max', v); }
    get step() { return this.getAttribute('step') || ''; } set step(v) { this.setAttribute('step', v); }
    get maxLength() { return parseInt(this.getAttribute('maxlength') || '-1', 10); } set maxLength(v) { this.setAttribute('maxlength', v); }
    get classList() {
        const el = this; const lista = () => (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
        return { add: (...c) => { const s = new Set(lista()); c.forEach(x => s.add(x)); el.setAttribute('class', [...s].join(' ')); }, remove: (...c) => { const s = new Set(lista()); c.forEach(x => s.delete(x)); el.setAttribute('class', [...s].join(' ')); }, contains: c => lista().includes(c), toggle: (c, f) => { const s = new Set(lista()); const on = f === undefined ? !s.has(c) : !!f; on ? s.add(c) : s.delete(c); el.setAttribute('class', [...s].join(' ')); return on; }, get length() { return lista().length; } };
    }
    get dataset() { const el = this; return new Proxy({}, { get: (t, k) => typeof k === 'string' ? (el.hasAttribute('data-' + aGuiones(k)) ? el.getAttribute('data-' + aGuiones(k)) : undefined) : undefined, set: (t, k, v) => { el.setAttribute('data-' + aGuiones(k), v); return true; }, deleteProperty: (t, k) => { el.removeAttribute('data-' + aGuiones(k)); return true; }, has: (t, k) => el.hasAttribute('data-' + aGuiones(k)) }); }
    // ---- formularios
    get value() {
        if (this.localName === 'select') { const op = this.options.find(o => o.selected); return op ? op.value : (this.options[0] ? this.options[0].value : ''); }
        if (this.localName === 'option') return this.hasAttribute('value') ? this.getAttribute('value') : this.textContent;
        if (this.localName === 'textarea') return this._valor !== undefined ? this._valor : this.textContent;
        return this._valor !== undefined ? this._valor : (this.getAttribute('value') || '');
    }
    set value(v) {
        v = v === null || v === undefined ? '' : String(v);
        if (this.localName === 'select') { const ops = this.options; let hallado = false; ops.forEach(o => { o.selected = !hallado && o.value === v; if (o.selected) hallado = true; }); if (!hallado && ops.length) { ops.forEach(o => { o.selected = false; }); } return; }
        if (this.localName === 'option') { this.setAttribute('value', v); return; }
        this._valor = v;
    }
    get checked() { return this._checked !== undefined ? this._checked : this.hasAttribute('checked'); } set checked(v) { this._checked = !!v; }
    get selected() { return this._selected !== undefined ? this._selected : this.hasAttribute('selected'); } set selected(v) { this._selected = !!v; }
    get options() { return this.localName === 'select' ? this.querySelectorAll('option') : []; }
    get selectedIndex() { const ops = this.options; const i = ops.findIndex(o => o.selected); return ops.length ? Math.max(0, i) : -1; }
    set selectedIndex(i) { this.options.forEach((o, k) => { o.selected = k === i; }); }
    get selectedOptions() { return this.options.filter(o => o.selected); }
    focus() {} blur() {} select() {} scrollIntoView() {} click() { this.dispatchEvent(new Evento('click', { bubbles: true, cancelable: true })); }
    // maquetación simulada (no hay motor de layout): medidas fijas y razonables para que las gráficas se construyan
    get clientWidth() { return 900; } get clientHeight() { return 420; } get offsetWidth() { return 900; } get offsetHeight() { return 420; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 900, bottom: 420, width: 900, height: 420, x: 0, y: 0 }; }
    getBBox() { return { x: 0, y: 0, width: 50, height: 12 }; }
    getContext() { return new Proxy({}, { get: () => () => ({ width: 10 }) }); }
    getComputedTextLength() { return 50; }
    // ---- árbol
    get children() { return this.childNodes.filter(n => n instanceof Elemento); }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
    get nextElementSibling() { if (!this.parentNode) return null; const h = this.parentNode.children; return h[h.indexOf(this) + 1] || null; }
    get previousElementSibling() { if (!this.parentNode) return null; const h = this.parentNode.children; return h[h.indexOf(this) - 1] || null; }
    appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); this.ownerDocument._ids = null; return n; }
    append(...ns) { ns.forEach(n => this.appendChild(typeof n === 'string' ? new Texto(this.ownerDocument, n) : n)); }
    prepend(...ns) { ns.reverse().forEach(n => this.insertBefore(typeof n === 'string' ? new Texto(this.ownerDocument, n) : n, this.childNodes[0] || null)); }
    insertBefore(n, ref) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); this.ownerDocument._ids = null; return n; }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; this.ownerDocument._ids = null; } return n; }
    replaceChild(nuevo, viejo) { this.insertBefore(nuevo, viejo); this.removeChild(viejo); return viejo; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    replaceWith(...ns) { const p = this.parentNode; if (!p) return; ns.forEach(n => p.insertBefore(n, this)); p.removeChild(this); }
    cloneNode(profundo) { const c = new Elemento(this.ownerDocument, this.localName); this._attrs.forEach((v, k) => c._attrs.set(k, v)); c._valor = this._valor; c._checked = this._checked; c._selected = this._selected; if (profundo) this.childNodes.forEach(n => c.appendChild(n.cloneNode(true))); return c; }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    // ---- contenido
    get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
    set textContent(v) { this.childNodes.forEach(n => { n.parentNode = null; }); this.childNodes = []; if (v !== '' && v !== null && v !== undefined) this.appendChild(new Texto(this.ownerDocument, v)); this.ownerDocument._ids = null; }
    get innerText() { return this.textContent; } set innerText(v) { this.textContent = v; }
    get innerHTML() { return this.childNodes.map(n => n instanceof Elemento ? n.outerHTML : escapar(n.data)).join(''); }
    set innerHTML(html) { this.childNodes.forEach(n => { n.parentNode = null; }); this.childNodes = []; parsearEn(this, String(html)); this.ownerDocument._ids = null; }
    get outerHTML() { const at = Array.from(this._attrs, ([k, v]) => v === '' ? ` ${k}=""` : ` ${k}="${v.replace(/"/g, '&quot;')}"`).join(''); return VACIOS.has(this.localName) ? `<${this.localName}${at}>` : `<${this.localName}${at}>${this.innerHTML}</${this.localName}>`; }
    insertAdjacentHTML(pos, html) {
        const tmp = new Elemento(this.ownerDocument, 'div'); parsearEn(tmp, String(html)); const ns = [...tmp.childNodes];
        if (pos === 'beforeend') ns.forEach(n => this.appendChild(n));
        else if (pos === 'afterbegin') ns.reverse().forEach(n => this.insertBefore(n, this.childNodes[0] || null));
        else if (pos === 'beforebegin') ns.forEach(n => this.parentNode.insertBefore(n, this));
        else if (pos === 'afterend') { let ref = this.nextSibling; ns.forEach(n => this.parentNode.insertBefore(n, ref)); }
    }
    insertAdjacentElement(pos, el) {
        if (pos === 'beforeend') this.appendChild(el); else if (pos === 'afterbegin') this.insertBefore(el, this.childNodes[0] || null);
        else if (pos === 'beforebegin') this.parentNode.insertBefore(el, this); else if (pos === 'afterend') this.parentNode.insertBefore(el, this.nextSibling);
        return el;
    }
    insertAdjacentText(pos, texto) { this.insertAdjacentElement(pos, new Texto(this.ownerDocument, texto)); }
    get nextSibling() { if (!this.parentNode) return null; const h = this.parentNode.childNodes; return h[h.indexOf(this) + 1] || null; }
    // ---- selectores
    matches(sel) { return separarLista(sel).some(s => coincideComplejo(this, s)); }
    closest(sel) { for (let n = this; n instanceof Elemento; n = n.parentNode) if (n.matches(sel)) return n; return null; }
    querySelectorAll(sel) { const out = []; const lista = separarLista(sel); const rec = n => { for (const c of n.childNodes) if (c instanceof Elemento) { if (lista.some(s => coincideComplejo(c, s))) out.push(c); rec(c); } }; rec(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getElementsByTagName(t) { return this.querySelectorAll(t); }
    getElementsByClassName(c) { return this.querySelectorAll('.' + c); }
}
const aGuiones = k => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
// style: objeto de propiedades con la API de CSSStyleDeclaration que usan las gráficas
function crearEstilo() {
    const s = {};
    Object.defineProperties(s, {
        setProperty: { value: (k, v) => { s[k] = v; } }, removeProperty: { value: k => { const v = s[k]; delete s[k]; return v || ''; } }, getPropertyValue: { value: k => s[k] || '' },
        cssText: { get: () => Object.keys(s).map(k => `${k}: ${s[k]}`).join('; '), set: v => { Object.keys(s).forEach(k => delete s[k]); String(v).split(';').forEach(par => { const [k, val] = par.split(':'); if (k && val) s[k.trim()] = val.trim(); }); } }
    });
    return s;
}

// ---- selectores (subconjunto): lista ',', descendiente ' ', compuestos tag/#id/.clase/[attr]/[attr=v]/[attr^=v]/[attr~=v]/[attr*=v]/:checked/:not(...)/:first-of-type
function separarLista(sel) { const out = []; let cur = '', prof = 0, comilla = null; for (const ch of String(sel)) { if (comilla) { cur += ch; if (ch === comilla) comilla = null; continue; } if (ch === '"' || ch === "'") comilla = ch; if (ch === '[' || ch === '(') prof++; if (ch === ']' || ch === ')') prof--; if (ch === ',' && prof === 0) { out.push(cur.trim()); cur = ''; continue; } cur += ch; } if (cur.trim()) out.push(cur.trim()); return out.filter(Boolean); }
function partesCompuesto(c) {
    const partes = []; const re = /\*|[A-Za-z][\w-]*|#[\w-]+|\.[\w-]+|\[[^\]]+\]|:not\([^)]*\)|:[\w-]+/g; let m;
    while ((m = re.exec(c))) partes.push(m[0]);
    return partes;
}
function coincideCompuesto(el, comp) {
    for (const p of partesCompuesto(comp)) {
        if (p === '*') continue;
        if (p[0] === '#') { if (el.id !== p.slice(1)) return false; }
        else if (p[0] === '.') { if (!el.classList.contains(p.slice(1))) return false; }
        else if (p[0] === '[') {
            const m = /^\[([\w-]+)(?:([~|^$*]?=)"?([^"\]]*)"?)?\]$/.exec(p); if (!m) return false;
            const [, a, op, v] = m; const val = el.getAttribute(a);
            if (op === undefined) { if (val === null) return false; }
            else if (op === '=') { if (val !== v) return false; }
            else if (op === '^=') { if (val === null || !val.startsWith(v)) return false; }
            else if (op === '$=') { if (val === null || !val.endsWith(v)) return false; }
            else if (op === '*=') { if (val === null || !val.includes(v)) return false; }
            else if (op === '~=') { if (val === null || !val.split(/\s+/).includes(v)) return false; }
        }
        else if (p.startsWith(':not(')) { if (el.matches(p.slice(5, -1))) return false; }
        else if (p === ':checked') { if (!(el.checked || el.selected)) return false; }
        else if (p === ':first-of-type') { if (!el.parentNode || el.parentNode.children.find(c => c.localName === el.localName) !== el) return false; }
        else if (p === ':disabled') { if (!el.disabled) return false; }
        else if (p === ':enabled') { if (el.disabled) return false; }
        else if (p[0] === ':') { return false; }
        else { if (el.localName !== p.toLowerCase()) return false; }
    }
    return true;
}
// separa un selector complejo en compuestos y combinadores respetando corchetes, paréntesis y comillas
function tokensSelector(sel) {
    const out = []; let cur = '', prof = 0, comilla = null;
    for (const ch of sel) {
        if (comilla) { cur += ch; if (ch === comilla) comilla = null; continue; }
        if (ch === '"' || ch === "'") { comilla = ch; cur += ch; continue; }
        if (ch === '[' || ch === '(') prof++; if (ch === ']' || ch === ')') prof--;
        if (prof === 0 && (ch === ' ' || ch === '>')) { if (cur) out.push(cur); cur = ''; if (ch === '>') out.push('>'); continue; }
        cur += ch;
    }
    if (cur) out.push(cur);
    return out;
}
function coincideComplejo(el, sel) {
    const tokensTodos = tokensSelector(sel); const trozos = tokensTodos.filter(x => x !== '>'); const directos = tokensTodos.includes('>');
    if (directos) {   // combinadores '>' (hijo) y ' ' (descendiente) mezclados: resolución sencilla de derecha a izquierda
        const tokens = tokensTodos; let n = el; let i = tokens.length - 1;
        if (!coincideCompuesto(n, tokens[i])) return false; i--;
        while (i >= 0) {
            if (tokens[i] === '>') { n = n.parentElement; i--; if (!n || !coincideCompuesto(n, tokens[i])) return false; i--; }
            else { n = n.parentElement; while (n && !coincideCompuesto(n, tokens[i])) n = n.parentElement; if (!n) return false; i--; }
        }
        return true;
    }
    let i = trozos.length - 1; if (!coincideCompuesto(el, trozos[i])) return false; i--;
    let n = el.parentElement;
    while (i >= 0) { while (n && !coincideCompuesto(n, trozos[i])) n = n.parentElement; if (!n) return false; n = n.parentElement; i--; }
    return true;
}

// ---- parser de HTML (tolerante): etiquetas, atributos, texto, comentarios, raw en script/style
function parsearEn(padre, html) {
    const doc = padre.ownerDocument; const pila = [padre]; let i = 0; const N = html.length;
    const texto = t => { if (t) pila[pila.length - 1].appendChild(new Texto(doc, decodificar(t))); };
    while (i < N) {
        const lt = html.indexOf('<', i);
        if (lt < 0) { texto(html.slice(i)); break; }
        texto(html.slice(i, lt));
        if (html.startsWith('<!--', lt)) { const fin = html.indexOf('-->', lt + 4); i = fin < 0 ? N : fin + 3; continue; }
        if (html.startsWith('<!', lt)) { const fin = html.indexOf('>', lt); i = fin < 0 ? N : fin + 1; continue; }
        if (html.startsWith('</', lt)) {
            const fin = html.indexOf('>', lt); const nombre = html.slice(lt + 2, fin).trim().toLowerCase();
            for (let k = pila.length - 1; k > 0; k--) if (pila[k].localName === nombre) { pila.length = k; break; }
            i = fin + 1; continue;
        }
        const m = /^<([A-Za-z][\w:-]*)/.exec(html.slice(lt)); if (!m) { texto('<'); i = lt + 1; continue; }
        const nombre = m[1].toLowerCase(); let j = lt + m[0].length; const el = new Elemento(doc, nombre);
        const reAttr = /\s*([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;
        for (;;) {
            reAttr.lastIndex = j; const a = reAttr.exec(html); if (!a || a.index !== j) break;
            if (/^\/?>?$/.test(a[1])) { j = a.index + a[0].length; if (a[1].includes('>')) { j = a.index + a[0].indexOf('>'); } break; }
            el._attrs.set(a[1], decodificar(a[2] ?? a[3] ?? a[4] ?? '')); j = reAttr.lastIndex;
        }
        const cierre = html.indexOf('>', j); const auto = cierre > 0 && html[cierre - 1] === '/'; i = cierre < 0 ? N : cierre + 1;
        pila[pila.length - 1].appendChild(el);
        if (VACIOS.has(nombre) || auto) continue;
        if (RAW.has(nombre)) { const fin = html.toLowerCase().indexOf('</' + nombre, i); el.appendChild(new Texto(doc, html.slice(i, fin < 0 ? N : fin))); const cierra = html.indexOf('>', fin); i = fin < 0 ? N : cierra + 1; continue; }
        pila.push(el);
    }
}

export class Documento extends Elemento {
    constructor(html = '') {
        super(null, '#document'); this.ownerDocument = this; this.nodeType = 9; this.readyState = 'complete'; this._ids = null;
        this.defaultView = null; this.location = { hash: '', search: '', href: 'https://localhost/' };
        if (html) parsearEn(this, html);
        this.documentElement = this.querySelector('html') || this;
        this.head = this.querySelector('head') || this.documentElement; this.body = this.querySelector('body') || this.documentElement;
    }
    createElement(tag) { return new Elemento(this, tag); }
    createElementNS(ns, tag) { return new Elemento(this, tag); }
    createTextNode(t) { return new Texto(this, t); }
    createDocumentFragment() { return new Elemento(this, '#fragment'); }
    getElementById(id) { if (!this._ids) { this._ids = new Map(); const rec = n => { for (const c of n.childNodes) if (c instanceof Elemento) { const i = c.getAttribute('id'); if (i && !this._ids.has(i)) this._ids.set(i, c); rec(c); } }; rec(this); } return this._ids.get(id) || null; }
    get activeElement() { return this.body; }
}

// ---- entorno: crea document/window y los globales que la interfaz espera
export function crearEntorno(html) {
    const document = new Documento(html);
    const descargas = [], toasts = [];
    const window = globalThis;
    Object.assign(window, {
        document, Evento, CustomEvent: EventoPersonalizado, Event: Evento, HTMLElement: Elemento, Node: Nodo, Element: Elemento,
        location: document.location, history: { replaceState() {}, pushState() {} },
        localStorage: { _m: new Map(), getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); }, clear() { this._m.clear(); }, get length() { return this._m.size; } },
        requestAnimationFrame: f => { f(); return 1; }, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1, cancelAnimationFrame() {}, getComputedStyle: () => ({}), scrollTo() {}, alert() {}, confirm: () => true, prompt: () => '',
        Blob: class { constructor(partes, o = {}) { this.partes = partes; this.type = o.type || ''; this.size = partes.reduce((s, p) => s + String(p).length, 0); } text() { return Promise.resolve(this.partes.map(String).join('')); } },
        FileReader: class { readAsText(f) { setTimeout(() => this.onload && this.onload({ target: { result: f && f._texto !== undefined ? f._texto : '' } }), 0); } },
        Worker: undefined,
        matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
        __descargas: descargas, __toasts: toasts
    });
    window.window = window; window.self = window;
    if (!('navigator' in window) || !window.navigator) Object.defineProperty(window, 'navigator', { value: { userAgent: 'minidom', language: 'es' }, configurable: true });
    window.URL.createObjectURL = blob => { descargas.push(blob); return 'blob:' + descargas.length; };
    window.URL.revokeObjectURL = () => {};
    window.addEventListener = (t, f) => document.addEventListener(t, f); window.removeEventListener = (t, f) => document.removeEventListener(t, f); window.dispatchEvent = e => document.dispatchEvent(e);
    return { document, window, descargas, toasts, disparar: (el, tipo, opciones = { bubbles: true, cancelable: true }) => el.dispatchEvent(new Evento(tipo, opciones)) };
}
