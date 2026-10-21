// buscador/prisma.js — diagrama PRISMA de la selección de estudios.
// Origen: prisma-diagrama.js (Fase 4), sin cambios de comportamiento; dependencias explícitas.

import { ProtocoloBusqueda } from './protocolo.js';

// ========================================
// DIAGRAMA DE FLUJO PRISMA 2020 — módulo autónomo.
// Rastrea el recorrido de la revisión (identificados por fuente → duplicados
// eliminados → cribados por relevancia → excluidos → incluidos en la matriz)
// y genera el diagrama de flujo exigido en revisiones sistemáticas.
//
// DOS MODOS:
//  · AUTOMÁTICO: el buscador registra cada paso con PrismaDiagrama.registrar()
//    (hooks de una línea en antecedentes.js).
//  · MANUAL: si aún no hay registros, las cajas del panel se editan a mano y
//    el diagrama se dibuja igual (útil también para revisiones hechas fuera).
//
// Exporta: PNG (para pegar en la tesis) y texto plano (para la redacción).
// ========================================
const PrismaDiagrama = {
    _datos: {
        identificados: {},   // { 'Scopus': 120, 'PubMed': 80, ... }
        duplicados: 0,       // eliminados al combinar fuentes
        cribados: 0,         // evaluados por relevancia (títulos/resúmenes)
        excluidos: 0,        // descartados por el umbral de relevancia
        motivoExclusion: '', // p. ej. 'relevancia < 3 según criterios'
        incluidos: 0,        // fuentes finales en la matriz de revisión
        porConsulta: {},     // (2026.12.30) { clave de la consulta: { fuente, n } }: lo que aportó cada una
        duplicadosPorBusqueda: {}   // (2026.12.30) { clave de la búsqueda: n }
    },
    // ---- API de registro (hooks del buscador) ----
    // registrar('identificados', {fuente:'Scopus', n:120})
    // registrar('duplicados', {n:35}) · registrar('cribados', {n:165})
    // registrar('excluidos', {n:80, motivo:'relevancia < 3'})
    // registrar('incluidos', {n:85})
    _CLAVE: 'statsim_prisma_flujo_v1',
    _guardar() {
        if (typeof sessionStorage === 'undefined') return;
        try { sessionStorage.setItem(this._CLAVE, JSON.stringify(this._datos)); } catch (e) {}
    },
    _cargar() {
        if (typeof sessionStorage === 'undefined') return;
        try {
            const g = this.validar(JSON.parse(sessionStorage.getItem(this._CLAVE) || 'null'));
            if (g) this._datos = g;
        } catch (e) {}
    },
    // (2026.12.31, revisión) El flujo que llega de fuera —el de un proyecto, que puede ser de otra persona, o el del
    // almacenamiento de la sesión— solo se acepta con la forma que escribe registrar(): los conteos, enteros ≥ 0; el motivo,
    // un texto; los nombres de las fuentes y las claves de las consultas, textos (una copia con solo esos campos; null si
    // algo no la tiene). Antes, un proyecto manipulado con un contador con forma de etiqueta HTML la metía en el diagrama.
    validar(datos) {
        const entero = v => (Number.isSafeInteger(v) && v >= 0 ? v : null);
        if (!datos || typeof datos !== 'object' || Array.isArray(datos) || !datos.identificados || typeof datos.identificados !== 'object') return null;
        // { texto: valor } con cada valor convertido por `valor` (null: no vale); una clave «__proto__», como propiedad propia
        const mapa = (o, valor) => {
            if (o === undefined || o === null) return {};
            if (typeof o !== 'object' || Array.isArray(o)) return null;
            const r = {};
            for (const [k, v] of Object.entries(o)) {
                const x = valor(v);
                if (x === null || k.length > 20000) return null;
                Object.defineProperty(r, k, { value: x, enumerable: true, writable: true, configurable: true });
            }
            return r;
        };
        const identificados = mapa(datos.identificados, entero);
        const porConsulta = mapa(datos.porConsulta, v => (v && typeof v === 'object' && typeof v.fuente === 'string' && entero(v.n) !== null ? { fuente: v.fuente, n: v.n } : null));
        const duplicadosPorBusqueda = mapa(datos.duplicadosPorBusqueda, entero);
        const conteo = k => (datos[k] === undefined ? 0 : entero(datos[k]));
        const duplicados = conteo('duplicados'), cribados = conteo('cribados'), excluidos = conteo('excluidos'), incluidos = conteo('incluidos');
        const m = datos.motivoExclusion;
        const motivoExclusion = m === undefined || m === null ? '' : typeof m === 'string' && m.length <= 2000 ? m : null;
        if (!identificados || !porConsulta || !duplicadosPorBusqueda || motivoExclusion === null || [duplicados, cribados, excluidos, incluidos].includes(null)) return null;
        return { identificados, duplicados, cribados, excluidos, motivoExclusion, incluidos, porConsulta, duplicadosPorBusqueda };
    },
    // (2026.12.30) `consulta`: la clave de la consulta (identificados) o de la búsqueda (duplicados). Con ella, repetir la
    // misma búsqueda reemplaza su aporte en lugar de sumarlo otra vez, como la ficha del protocolo (que la cuenta una vez,
    // con «veces» = 2); sin ella (registros manuales o de otro origen), se suma como antes.
    registrar(evento, datos = {}) {
        const d = this._datos;
        const n = Math.max(0, parseInt(datos.n, 10) || 0);
        const clave = typeof datos.consulta === 'string' && datos.consulta ? datos.consulta : null;
        if (evento === 'identificados' && datos.fuente) {
            let previo = 0;
            if (clave) {
                d.porConsulta = d.porConsulta || {};
                const antes = d.porConsulta[clave];
                if (antes && antes.fuente === datos.fuente) previo = antes.n;
                d.porConsulta[clave] = { fuente: datos.fuente, n };
            }
            d.identificados[datos.fuente] = Math.max(0, (d.identificados[datos.fuente] || 0) - previo + n);
        } else if (evento === 'duplicados') {
            let previo = 0;
            if (clave) { d.duplicadosPorBusqueda = d.duplicadosPorBusqueda || {}; previo = d.duplicadosPorBusqueda[clave] || 0; d.duplicadosPorBusqueda[clave] = n; }
            d.duplicados = Math.max(0, d.duplicados - previo + n);
        }
        else if (evento === 'cribados') d.cribados = n;
        else if (evento === 'excluidos') { d.excluidos = n; if (datos.motivo) d.motivoExclusion = datos.motivo; }
        else if (evento === 'incluidos') d.incluidos = n;
        this._guardar();
        this._pintarResumen();
    },
    // (2026.12.31) Para el archivo de proyecto (buscador/proyecto.js): el flujo guardado, en lugar del de esta sesión.
    restaurar(datos) {
        const valido = this.validar(datos);
        if (!valido) throw new Error('el flujo PRISMA guardado no tiene la forma esperada');
        this._datos = valido;
        this._guardar();
        this._refrescar();
    },
    reiniciar() {
        this._datos = { identificados: {}, duplicados: 0, cribados: 0, excluidos: 0, motivoExclusion: '', incluidos: 0, porConsulta: {}, duplicadosPorBusqueda: {} };
        this._guardar();
        this._refrescar();
    },
    // (2026.12.31) El resumen y, si está a la vista, el diagrama, con los números de ahora (tras abrir un proyecto o empezar
    // una revisión nueva, el diagrama ya dibujado seguía con los de antes).
    _refrescar() {
        this._pintarResumen();
        const lienzo = typeof document !== 'undefined' ? document.getElementById('prismaLienzo') : null;
        if (lienzo && lienzo.style.display !== 'none' && lienzo.querySelector('svg')) this.mostrar();
    },
    _totalIdentificados() {
        return Object.values(this._datos.identificados || {}).reduce((s, v) => s + (Number.isFinite(v) && v > 0 ? v : 0), 0);
    },
    // ---- UI: panel dentro de la sección del buscador ----
    montar() {
        const secc = document.getElementById('seccionAntecedentes');
        if (!secc || document.getElementById('prismaPanel')) return;
        const panel = document.createElement('div');
        panel.id = 'prismaPanel';
        panel.className = 'form-group';
        panel.style.cssText = 'margin-top:1.5rem; padding-top:1.2rem; border-top:1px dashed var(--color-border, #e5e5e5);';
        panel.innerHTML = `
          <h3 style="margin:0 0 0.3rem; font-size:1.05rem;">🔀 Flujo de selección de estudios (adaptado de PRISMA)</h3>
          <p class="help-text" style="margin:0 0 0.6rem;">El recorrido de tu revisión (identificados → duplicados → cribados → incluidos), en el formato de diagrama que piden las revisiones sistemáticas. Los números se capturan solos al buscar y cribar; también puedes editarlos a mano.</p>
          <div id="prismaResumen" class="help-text" style="margin:0 0 0.6rem;"></div>
          <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;">
            <button id="prismaVer" class="btn btn-primary" style="padding:0.4rem 1rem;">📐 Generar diagrama</button>
            <button id="prismaEditar" class="btn btn-outline" style="padding:0.4rem 1rem;">✏️ Editar números</button>
            <button id="prismaPNG" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">⬇ Descargar PNG</button>
            <button id="prismaTexto" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">📋 Copiar como texto</button>
          </div>
          <div id="prismaEditor" style="display:none; margin-top:0.7rem; padding:0.7rem 0.9rem; border:1px dashed var(--color-border,#ccc); border-radius:0.5rem;">
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:0.5rem;">
              <label style="font-size:0.9em;">Identificados (total)<input type="number" id="prismaInIdent" class="input input-sm" min="0"></label>
              <label style="font-size:0.9em;">Duplicados eliminados<input type="number" id="prismaInDup" class="input input-sm" min="0"></label>
              <label style="font-size:0.9em;">Cribados (evaluados)<input type="number" id="prismaInCrib" class="input input-sm" min="0"></label>
              <label style="font-size:0.9em;">Excluidos en la criba<input type="number" id="prismaInExc" class="input input-sm" min="0"></label>
              <label style="font-size:0.9em;">Incluidos en la revisión<input type="number" id="prismaInInc" class="input input-sm" min="0"></label>
              <label style="font-size:0.9em;">Motivo de exclusión<input type="text" id="prismaInMot" class="input input-sm" placeholder="Ej: relevancia < 3 según criterios"></label>
            </div>
            <button id="prismaAplicar" class="btn btn-secondary" style="margin-top:0.6rem; padding:0.3rem 0.9rem;">Aplicar</button>
          </div>
          <div id="prismaLienzo" style="display:none; margin-top:0.8rem; overflow:auto; border:1px solid var(--color-border,#ddd); border-radius:0.5rem; background:#fff; padding:0.8rem;"></div>`;
        secc.parentElement.appendChild(panel);
        document.getElementById('prismaVer').addEventListener('click', () => this.mostrar());
        document.getElementById('prismaEditar').addEventListener('click', () => {
            const ed = document.getElementById('prismaEditor');
            const visible = ed.style.display !== 'none';
            ed.style.display = visible ? 'none' : '';
            if (!visible) this._cargarEditor();
        });
        document.getElementById('prismaAplicar').addEventListener('click', () => this._aplicarEditor());
        document.getElementById('prismaPNG').addEventListener('click', () => this._descargarPNG());
        document.getElementById('prismaTexto').addEventListener('click', () => this._copiarTexto());
        // Coherencia tras recargar: la ficha del protocolo persiste; si este
        // embudo quedó vacío, siembra los identificados desde sus conteos.
        if (!this._totalIdentificados() && typeof ProtocoloBusqueda !== 'undefined') {
            try {
                (ProtocoloBusqueda.resumen().fuentes || []).forEach(f => {
                    if (f.totalResultados > 0) this._datos.identificados[f.nombre] = f.totalResultados;
                });
            } catch (e) {}
        }
        this._pintarResumen();
    },
    _pintarResumen() {
        const el = typeof document !== 'undefined' ? document.getElementById('prismaResumen') : null;
        if (!el) return;
        const d = this._datos, tot = this._totalIdentificados();
        if (!tot && !d.incluidos) { el.textContent = 'Aún sin datos: busca en las bases (o pulsa «Editar números» para escribirlos a mano).'; return; }
        const fuentes = Object.entries(d.identificados).map(([f, n]) => `${f}: ${n}`).join(' · ');
        el.textContent = `Identificados: ${tot}${fuentes ? ` (${fuentes})` : ''} · Duplicados: ${d.duplicados} · Cribados: ${d.cribados} · Excluidos: ${d.excluidos} · Incluidos: ${d.incluidos}`;
    },
    _cargarEditor() {
        const d = this._datos;
        const v = (id, val) => { const e = document.getElementById(id); if (e) e.value = val || ''; };
        v('prismaInIdent', this._totalIdentificados() || '');
        v('prismaInDup', d.duplicados || ''); v('prismaInCrib', d.cribados || '');
        v('prismaInExc', d.excluidos || ''); v('prismaInInc', d.incluidos || '');
        v('prismaInMot', d.motivoExclusion || '');
    },
    _aplicarEditor() {
        const g = id => Math.max(0, parseInt((document.getElementById(id) || {}).value, 10) || 0);
        const tot = g('prismaInIdent');
        // Entrada manual: el total sustituye el desglose por fuente (si difiere), y las cifras escritas a mano ya no se
        // descuentan cuando se repite una búsqueda anterior.
        if (tot !== this._totalIdentificados()) { this._datos.identificados = { 'Bases de datos': tot }; this._datos.porConsulta = {}; }
        if (g('prismaInDup') !== this._datos.duplicados) this._datos.duplicadosPorBusqueda = {};
        this._datos.duplicados = g('prismaInDup');
        this._datos.cribados = g('prismaInCrib');
        this._datos.excluidos = g('prismaInExc');
        this._datos.incluidos = g('prismaInInc');
        this._datos.motivoExclusion = ((document.getElementById('prismaInMot') || {}).value || '').trim();
        this._guardar();
        this._pintarResumen();
        this.mostrar();
    },
    // Autocompletar huecos con la aritmética del flujo (sin inventar de más).
    // (2026.12.31, revisión) Los conteos, siempre números (lo que no lo es cuenta 0): el diagrama los pinta en su SVG.
    _completo() {
        const d = this._datos;
        const num = v => (Number.isFinite(v) && v > 0 ? v : 0);
        const tot = num(this._totalIdentificados()), duplicados = num(d.duplicados);
        const cribados = num(d.cribados) || Math.max(0, tot - duplicados);
        const excluidos = num(d.excluidos) || Math.max(0, cribados - num(d.incluidos));
        const incluidos = num(d.incluidos) || Math.max(0, cribados - excluidos);
        const fuentes = {};
        for (const [f, n] of Object.entries(d.identificados || {})) if (num(n) > 0) Object.defineProperty(fuentes, f, { value: n, enumerable: true, writable: true, configurable: true });
        return { tot, duplicados, cribados, excluidos, incluidos,
                 motivo: typeof d.motivoExclusion === 'string' && d.motivoExclusion ? d.motivoExclusion : 'No cumplir los criterios de relevancia',
                 fuentes };
    },
    // (2026.12.30) Un texto en líneas de hasta `ancho` caracteres, partido entre palabras (una palabra más larga que la línea
    // se parte), con «…» al final si no cabe en `maxLineas`.
    _partirEnLineas(texto, ancho, maxLineas) {
        const lineas = [];
        let actual = '';
        for (let palabra of String(texto).split(/\s+/).filter(Boolean)) {
            while (palabra.length > ancho) {
                if (actual) { lineas.push(actual); actual = ''; }
                lineas.push(palabra.slice(0, ancho)); palabra = palabra.slice(ancho);
            }
            if (!actual) actual = palabra;
            else if (actual.length + 1 + palabra.length <= ancho) actual += ' ' + palabra;
            else { lineas.push(actual); actual = palabra; }
        }
        if (actual) lineas.push(actual);
        if (lineas.length <= maxLineas) return lineas;
        const visibles = lineas.slice(0, maxLineas);
        const ultima = visibles[maxLineas - 1];
        visibles[maxLineas - 1] = (ultima.length < ancho ? ultima : ultima.slice(0, ancho - 1)) + '…';
        return visibles;
    },
    // ---- El diagrama (SVG, estilo PRISMA 2020 en español) ----
    _svg() {
        const c = this._completo();
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // (2026.12.31, revisión) sin escapar aquí: las líneas se escapan al pintarlas (antes, dos veces: «Taylor &amp;amp; …»)
        const fuentesTxt = Object.entries(c.fuentes)
            .filter(([, n]) => n > 0)
            .map(([f, n]) => `${f} (n = ${n})`);
        // Partir el desglose de fuentes en líneas de ~3 items.
        const lineasFuentes = [];
        for (let i = 0; i < fuentesTxt.length; i += 3) lineasFuentes.push(fuentesTxt.slice(i, i + 3).join('; '));
        if (!lineasFuentes.length) lineasFuentes.push('Bases de datos académicas');
        const altoCaja1 = 46 + lineasFuentes.length * 15;
        const W = 760;
        const caja = (x, y, w, h, lineas, negrita) => {
            const t = lineas.map((l, i) =>
                `<text x="${x + 12}" y="${y + 24 + i * 15}" font-size="12" ${i === 0 && negrita ? 'font-weight="bold"' : ''} fill="#1a1a1a">${l}</text>`).join('');
            return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f4f7fd" stroke="#2E5BBA" stroke-width="1.5" rx="4"/>${t}`;
        };
        const flecha = (x1, y1, x2, y2) =>
            `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2E5BBA" stroke-width="1.5" marker-end="url(#pf)"/>`;
        let y = 40;
        const partes = [];
        // Etiquetas de fase (columna izquierda, giradas)
        const fase = (yc, h, texto) =>
            `<rect x="12" y="${yc}" width="30" height="${h}" fill="#2E5BBA" rx="4"/>` +
            `<text x="27" y="${yc + h / 2}" font-size="11" fill="#fff" font-weight="bold" text-anchor="middle" transform="rotate(-90 27 ${yc + h / 2})">${texto}</text>`;
        // 1) Identificación
        const y1 = y;
        partes.push(caja(60, y, 420, altoCaja1,
            [`<tspan font-weight="bold">Registros identificados (n = ${c.tot})</tspan>`,
             'Fuentes consultadas:', ...lineasFuentes.map(esc)], false));
        partes.push(caja(510, y + 4, 230, 52,
            [`<tspan font-weight="bold">Registros eliminados</tspan>`, `Duplicados (n = ${c.duplicados})`], false));
        partes.push(flecha(480, y + altoCaja1 / 2, 510, y + 30));
        y += altoCaja1 + 34;
        partes.push(flecha(270, y1 + altoCaja1, 270, y));
        partes.push(fase(y1 - 6, altoCaja1 + 12, 'IDENTIFICACIÓN'));
        // 2) Cribado
        const y2 = y;
        partes.push(caja(60, y, 420, 46,
            [`<tspan font-weight="bold">Registros cribados por título y resumen (n = ${c.cribados})</tspan>`], false));
        // (2026.12.30) El motivo, en líneas que se parten entre palabras y se escapan después: hasta la 2026.12.29 se cortaba
        // en los caracteres 34 y 70 del texto YA escapado («relevancia &l|t; 4»), partiendo palabras y entidades, y lo que
        // pasaba de 70 se perdía.
        const lineasMotivo = this._partirEnLineas('Motivo: ' + c.motivo, 34, 4).map(esc);
        partes.push(caja(510, y - 2, 230, Math.max(66, 36 + lineasMotivo.length * 15),
            [`<tspan font-weight="bold">Registros excluidos (n = ${c.excluidos})</tspan>`, ...lineasMotivo], false));
        partes.push(flecha(480, y + 23, 510, y + 23));
        y += 46 + 34;
        partes.push(flecha(270, y2 + 46, 270, y));
        partes.push(fase(y2 - 6, 58, 'CRIBADO'));
        // 3) Incluidos
        const y3 = y;
        partes.push(caja(60, y, 420, 50,
            [`<tspan font-weight="bold">Estudios incluidos en la revisión (n = ${c.incluidos})</tspan>`,
             '(matriz de revisión bibliográfica)'], false));
        partes.push(fase(y3 - 6, 62, 'INCLUSIÓN'));
        y += 76;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}" font-family="Arial, Helvetica, sans-serif">
          <defs><marker id="pf" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#2E5BBA"/></marker></defs>
          <rect width="${W}" height="${y}" fill="#ffffff"/>
          <text x="60" y="24" font-size="13" font-weight="bold" fill="#1a1a1a">Diagrama de flujo de la revisión (adaptado de PRISMA 2020)</text>
          ${partes.join('\n')}
        </svg>`;
    },
    mostrar() {
        const lienzo = document.getElementById('prismaLienzo');
        if (!lienzo) return;
        lienzo.innerHTML = this._svg();
        lienzo.style.display = '';
        const png = document.getElementById('prismaPNG'); if (png) png.style.display = '';
        const txt = document.getElementById('prismaTexto'); if (txt) txt.style.display = '';
    },
    _descargarPNG() {
        const lienzo = document.getElementById('prismaLienzo');
        const svgEl = lienzo && lienzo.querySelector('svg');
        if (!svgEl) return;
        const xml = new XMLSerializer().serializeToString(svgEl);
        const img = new Image();
        const ESCALA = 2; // nítido para el Word
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = svgEl.viewBox.baseVal.width * ESCALA;
            canvas.height = svgEl.viewBox.baseVal.height * ESCALA;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = 'diagrama_PRISMA.png';
            a.click();
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    },
    textoPlano() {
        const c = this._completo();
        const fuentes = Object.entries(c.fuentes).filter(([, n]) => n > 0).map(([f, n]) => `${f} (n = ${n})`).join('; ');
        return `Diagrama de flujo de la revisión (adaptado de PRISMA 2020)\n`
            + `Identificación: registros identificados n = ${c.tot}${fuentes ? ` [${fuentes}]` : ''}; `
            + `duplicados eliminados n = ${c.duplicados}.\n`
            + `Cribado: registros evaluados por título y resumen n = ${c.cribados}; `
            + `excluidos n = ${c.excluidos} (motivo: ${c.motivo}).\n`
            + `Inclusión: estudios incluidos en la revisión n = ${c.incluidos}.`;
    },
    async _copiarTexto() {
        const t = this.textoPlano();
        try { await navigator.clipboard.writeText(t); } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } catch (e2) {}
            document.body.removeChild(ta);
        }
        const btn = document.getElementById('prismaTexto');
        if (btn) { const x = btn.textContent; btn.textContent = '✓ Copiado'; setTimeout(() => { btn.textContent = x; }, 2000); }
    }
};
if (typeof window !== 'undefined') {
    PrismaDiagrama._cargar();
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => PrismaDiagrama.montar());
    } else {
        queueMicrotask(() => PrismaDiagrama.montar());   // (F5) tras evaluar todo el grafo de módulos (hay ciclos)
    }
}

export { PrismaDiagrama };
