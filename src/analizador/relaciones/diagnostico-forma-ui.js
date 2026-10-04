// analizador/relaciones/diagnostico-forma-ui.js — tarjeta «Diagnóstico de la forma de una relación» del Analizador: elige
// X e Y, calcula en el Worker y muestra el gráfico (puntos, recta y curva elegida), las tablas, el párrafo APA y el Word.
import { AnalizadorEstadistico } from '../estadistica.js';
import { ejecutarTarea } from '../psicometria/servicio-psicometrico.js';
import { CABECERA_COEFICIENTES, filasCoeficientes, notaCoeficientes, CABECERA_MODELOS, filasModelos, notaModelos, redactarParrafo, referenciasDiagnostico, documentoWord, tablaConfirmacion } from './diagnostico-forma-redaccion.js';
import { CABECERA_NUBE, filasNube, notaNube, parrafoNube } from './nube-redaccion.js';
import { mostrarToast } from '../../shared/toast.js';
import { descargarBlob } from '../../shared/descargas.js';
import { asegurarHtmlDocx } from '../../shared/vendor.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const guia = t => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
let contenedor = null, ultimo = null, turno = 0;   // turno: solo pinta el cálculo más reciente
function datos() { try { return AnalizadorEstadistico.obtenerDatos() || []; } catch (e) { return []; } }

// Columnas cuantitativas: al menos 80 % de valores numéricos y 3 valores distintos
function columnasCuantitativas(filas) {
    if (!filas.length) return [];
    return Object.keys(filas[0]).filter(c => {
        let num = 0, total = 0; const vistos = new Set();
        for (const f of filas) { const v = f[c]; if (v === '' || v === null || v === undefined) continue; total++; const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.')); if (Number.isFinite(x)) { num++; if (vistos.size < 3) vistos.add(x); } }
        return total > 0 && num / total >= 0.8 && vistos.size >= 3;
    });
}
const aNumero = v => (v === '' || v === null || v === undefined ? NaN : typeof v === 'number' ? v : Number(String(v).replace(',', '.')));

const PLANTILLA = () => `
    <h3 class="card-title">7. Diagnóstico de la forma de una relación <span class="help-text" style="display:inline;">— opcional</span></h3>
    <p class="help-text">Averigua qué forma tiene la relación entre dos variables (recta, curva que se frena o se acelera, en S, en U, cíclica…)
        y qué coeficiente la describe bien, según el <em>Atlas de relaciones entre variables</em>.</p>
    <div class="rejilla-psico">
        <div class="form-group">${guia('Elegir la variable que va en el eje horizontal (la que se supone que influye).')}
            <label for="dfX">Variable X</label><select id="dfX" class="input"><option value="">Carga una base primero</option></select>
            <span class="help-text">Cuantitativa, con al menos 3 valores distintos.</span></div>
        <div class="form-group">${guia('Elegir la variable que va en el eje vertical (la que se explica).')}
            <label for="dfY">Variable Y</label><select id="dfY" class="input"><option value="">Carga una base primero</option></select>
            <span class="help-text">Se usan los casos con ambas variables.</span></div>
        <div class="form-group">${guia('Decidir desde qué tamaño una relación lineal se consideraría despreciable; solo se usa si no se encuentra relación, para comprobarlo con una prueba de equivalencia.')}
            <label for="dfLimite">Límite de equivalencia (|r|)</label><input type="number" id="dfLimite" class="input" value="0.10" min="0.01" max="0.5" step="0.01">
            <span class="help-text">Prueba TOST (Lakens, 2017). Por defecto .10, un efecto pequeño; justifica otro valor si tu campo lo pide.</span></div>
    </div>
    <div class="acciones-fila"><button type="button" id="dfCalcular" class="btn btn-primary">Diagnosticar la forma</button>
        <button type="button" id="dfActualizar" class="btn btn-outline" title="Actualizar con la base cargada" aria-label="Actualizar las variables">↻</button></div>
    <div id="dfEstado" class="help-text" role="status"></div>
    <div id="dfMensajes" role="alert"></div>
    <div id="dfResultados" hidden></div>`;

export function actualizarVariables() {
    if (!contenedor) return;
    const cols = columnasCuantitativas(datos());
    for (const id of ['#dfX', '#dfY']) {
        const sel = contenedor.querySelector(id), previo = sel.value;
        sel.innerHTML = cols.length ? cols.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('') : '<option value="">Carga una base primero</option>';
        if (cols.includes(previo)) sel.value = previo;
    }
    if (cols.length > 1 && contenedor.querySelector('#dfX').value === contenedor.querySelector('#dfY').value) contenedor.querySelector('#dfY').value = cols[1];
}

// Gráfico de dispersión con la recta (discontinua) y la forma elegida (continua); SVG escalable
function graficoSVG(d, nx, ny) {
    const W = 640, H = 380, m = { l: 56, r: 16, t: 14, b: 44 }, n = d.x.length, paso = Math.max(1, Math.floor(n / 1500));
    const xmin = Math.min(...d.curvas.x), xmax = Math.max(...d.curvas.x);
    let ymin = Infinity, ymax = -Infinity; for (let i = 0; i < n; i++) { if (d.y[i] < ymin) ymin = d.y[i]; if (d.y[i] > ymax) ymax = d.y[i]; }
    const sx = v => m.l + ((v - xmin) / (xmax - xmin || 1)) * (W - m.l - m.r), sy = v => H - m.b - ((v - ymin) / (ymax - ymin || 1)) * (H - m.t - m.b);
    let puntos = ''; for (let i = 0; i < n; i += paso) puntos += `<circle cx="${sx(d.x[i]).toFixed(1)}" cy="${sy(d.y[i]).toFixed(1)}" r="2.2"/>`;
    const linea = ys => d.curvas.x.map((v, i) => `${i ? 'L' : 'M'}${sx(v).toFixed(1)},${sy(Math.min(ymax, Math.max(ymin, ys[i]))).toFixed(1)}`).join('');
    const marcas = (a, b) => Array.from({ length: 5 }, (_, i) => a + ((b - a) * i) / 4);
    // (2026.10.31) la nube: bordes de cuantil (.10 y .90) si no son paralelos, techo escalonado si hay condición necesaria
    // y anillos en los casos influyentes
    const nb = d.nube, capas = [], leyenda = [];
    if (nb && nb.cuantiles && !['paralela', 'no-aplica'].includes(nb.patron.patron)) { for (const k of [0, 2]) { const r = nb.cuantiles.rectas[k]; capas.push(`<path d="M${sx(xmin).toFixed(1)},${sy(Math.min(ymax, Math.max(ymin, r.a + r.b * xmin))).toFixed(1)}L${sx(xmax).toFixed(1)},${sy(Math.min(ymax, Math.max(ymin, r.a + r.b * xmax))).toFixed(1)}" fill="none" stroke="currentColor" stroke-opacity="0.75" stroke-width="1.2" stroke-dasharray="2 3"/>`); } leyenda.push('punteadas: bordes de cuantil .10 y .90'); }
    if (nb && nb.necesaria && nb.necesidad.techo.length) {
        const c = [...nb.necesidad.techo].sort((p, q) => p[0] - q[0]), pts = [];
        if (nb.necesidad.direccion > 0) { c.forEach(([xx, yy], j) => { if (j) pts.push([xx, c[j - 1][1]]); pts.push([xx, yy]); }); pts.push([xmax, c[c.length - 1][1]]); }
        else { pts.push([xmin, c[0][1]]); c.forEach(([xx, yy], j) => { pts.push([xx, yy]); if (j < c.length - 1) pts.push([xx, c[j + 1][1]]); }); }
        capas.push(`<path d="${pts.map(([a, b], j) => `${j ? 'L' : 'M'}${sx(a).toFixed(1)},${sy(b).toFixed(1)}`).join('')}" fill="none" stroke="var(--color-accent, #e6b93f)" stroke-width="1.6" stroke-opacity="0.9"/>`); leyenda.push('escalonada: techo de la condición necesaria');
    }
    if (nb && !nb.influencia.error) { const marcados = nb.influencia.principales.filter(c => c.D > nb.influencia.fMediana || c.pBonferroni < 0.05); marcados.forEach(c => capas.push(`<circle cx="${sx(c.x).toFixed(1)}" cy="${sy(c.y).toFixed(1)}" r="6" fill="none" stroke="var(--color-danger, #e5484d)" stroke-width="1.6"/>`)); if (marcados.length) leyenda.push('anillos: casos influyentes'); }
    const ejes = marcas(xmin, xmax).map(v => `<text x="${sx(v)}" y="${H - m.b + 16}" text-anchor="middle">${(+v.toFixed(1))}</text>`).join('') + marcas(ymin, ymax).map(v => `<text x="${m.l - 6}" y="${sy(v) + 4}" text-anchor="end">${(+v.toFixed(1))}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Dispersión de ${esc(ny)} frente a ${esc(nx)} con la recta y la forma elegida" style="width:100%;max-width:${W}px;height:auto;font-size:11px;fill:currentColor;">
        <line x1="${m.l}" y1="${H - m.b}" x2="${W - m.r}" y2="${H - m.b}" stroke="currentColor" stroke-opacity="0.4"/><line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${H - m.b}" stroke="currentColor" stroke-opacity="0.4"/>
        <g fill-opacity="0.35">${puntos}</g>
        <path d="${linea(d.curvas.lineal)}" fill="none" stroke="currentColor" stroke-opacity="0.6" stroke-width="1.5" stroke-dasharray="5 4"/>
        <path d="${linea(d.curvas.descriptiva)}" fill="none" stroke="var(--color-accent, #e6b93f)" stroke-width="2.6"/>${capas.join('')}
        ${ejes}<text x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle" font-weight="bold">${esc(nx)}</text>
        <text transform="translate(14 ${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle" font-weight="bold">${esc(ny)}</text></svg>
        <p class="help-text" style="margin:0.2rem 0 0;">Línea discontinua: la recta (lo que ve r). Línea continua: la forma elegida (${esc(d.modeloDescriptivo.nombre.toLowerCase())}).${leyenda.length ? ` Además, ${leyenda.join('; ')}.` : ''}</p>`;
}
function tablaHTML(cab, filas, nota) {
    return `<div class="table-container"><table class="table"><thead><tr>${cab.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr>${f.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="help-text"><em>Nota.</em> ${esc(nota)}</p>`;
}

export function calcular() {
    const q = s => contenedor.querySelector(s), msj = q('#dfMensajes'), zona = q('#dfResultados'), filas = datos(), nx = q('#dfX').value, ny = q('#dfY').value;
    const error = t => { msj.innerHTML = `<div class="aiken-errores"><strong>No se puede diagnosticar:</strong> ${esc(t)}</div>`; zona.hidden = true; ultimo = null; return null; };
    if (!filas.length) return error('No hay una base cargada en el Analizador.');
    if (!nx || !ny) return error('Elige las dos variables.');
    if (nx === ny) return error('X e Y deben ser variables distintas.');
    const limite = parseFloat(q('#dfLimite').value);
    if (!(limite >= 0.01 && limite <= 0.5)) return error('El límite de equivalencia debe estar entre .01 y .50.');
    msj.innerHTML = ''; q('#dfCalcular').disabled = true; q('#dfEstado').textContent = 'Calculando coeficientes y comparando formas…';
    const tarea = ejecutarTarea('forma', [{ clave: 'forma', x: filas.map(f => aNumero(f[nx])), y: filas.map(f => aNumero(f[ny])) }], { limiteEquivalencia: limite });
    // (revisión 2026.11.03) dos «Diagnosticar» seguidos lanzan dos tareas: el resultado que llegue tarde de un turno anterior
    // se descarta, para que la pantalla muestre siempre el par que indican los selectores
    const miTurno = ++turno, vigente = () => miTurno === turno;
    const fin = () => { if (vigente()) { q('#dfCalcular').disabled = false; q('#dfEstado').textContent = ''; } };
    return tarea.promesa.then(lista => { fin(); return vigente() ? pintar(lista[0].resultado, nx, ny) : null; }, e => { fin(); return vigente() ? error(String(e && e.message || e)) : null; });
}
function pintar(d, nx, ny) {
    const msj = contenedor.querySelector('#dfMensajes'), zona = contenedor.querySelector('#dfResultados');
    if (d.error) { msj.innerHTML = `<div class="aiken-errores"><strong>No se puede diagnosticar:</strong> ${esc(d.error)}</div>`; zona.hidden = true; ultimo = null; return null; }
    ultimo = { d, nx, ny };
    const recomendacion = { r: 'la r de Pearson', 'ρ': 'la ρ de Spearman', 'τ': 'la τ-b de Kendall', modelo: 'el modelo ajustado (r y ρ no la describen)', ninguno: 'ninguno: no hay evidencia de relación' }[d.coefRecomendado];
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">${esc(ny)} frente a ${esc(nx)}: ${d.descripcion.grupo === 'sin' ? 'sin relación apreciable' : `relación ${esc(d.descripcion.nombre)}`}</h4>
        <p><strong>Coeficiente recomendado:</strong> ${esc(recomendacion)}.</p>${graficoSVG(d, nx, ny)}
        <h5 class="aiken-subtitulo">Coeficientes</h5>${tablaHTML(CABECERA_COEFICIENTES, filasCoeficientes(d), notaCoeficientes(d))}
        <h5 class="aiken-subtitulo">Comparación de formas</h5>${tablaHTML(CABECERA_MODELOS, filasModelos(d), notaModelos(d))}
        ${(t3 => (t3 ? `<h5 class="aiken-subtitulo" id="dfTituloConfirmacion">${esc(t3.titulo)}</h5>${tablaHTML(t3.cabecera, t3.filas, t3.nota)}` : ''))(tablaConfirmacion(d, nx))}
        ${d.nube ? `<h5 class="aiken-subtitulo" id="dfTituloNube">La nube de puntos</h5>${tablaHTML(CABECERA_NUBE, filasNube(d.nube, nx, ny), notaNube(d.nube))}<p class="aiken-parrafo" id="dfParrafoNube">${esc(parrafoNube(d.nube, nx, ny, d.categoria))}</p>` : ''}
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="dfParrafo">${esc(redactarParrafo(d, nx, ny))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasDiagnostico(d, nx, ny).map(x => `<p>${x}</p>`).join('')}</details>
        <div class="acciones-fila"><button type="button" id="dfWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`;
    zona.hidden = false;
    zona.querySelector('#dfWord').addEventListener('click', async () => {
        const doc = documentoWord(d, nx, ny), conv = await asegurarHtmlDocx();
        const [blob, nombre] = conv && conv.asBlob ? [conv.asBlob('<!DOCTYPE html>' + doc), 'forma_relacion_APA.docx'] : [new Blob(['\ufeff' + doc], { type: 'application/msword' }), 'forma_relacion_APA.doc'];
        descargarBlob(blob, nombre);
        mostrarToast(nombre.endsWith('.docx') ? 'Diagnóstico exportado a Word (APA 7)' : 'Exportado en .doc: no se pudo cargar el conversor a .docx', nombre.endsWith('.docx') ? 'success' : 'warning');
    });
    return d;
}

// (2026.11.02) diagnóstico de un par pedido desde otra sección (botón «Diagnosticar» de la criba o de un aviso de forma)
function diagnosticarPar(a, b) {
    if (!contenedor) return null;
    actualizarVariables();
    const sx = contenedor.querySelector('#dfX'), sy = contenedor.querySelector('#dfY'), hay = (sel, v) => [...sel.querySelectorAll('option')].some(o => o.value === v);
    if (!hay(sx, a) || !hay(sy, b)) { mostrarToast('Esas columnas no están disponibles para el diagnóstico de forma', 'warning'); return null; }
    sx.value = a; sy.value = b;
    if (typeof contenedor.scrollIntoView === 'function') contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return calcular();
}
export function montarDiagnosticoForma() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('diagnosticoFormaContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    contenedor.innerHTML = PLANTILLA();
    contenedor.querySelector('#dfX').addEventListener('focus', actualizarVariables);
    contenedor.querySelector('#dfY').addEventListener('focus', actualizarVariables);
    contenedor.querySelector('#dfActualizar').addEventListener('click', actualizarVariables);
    contenedor.querySelector('#dfCalcular').addEventListener('click', () => calcular());
    document.addEventListener('click', e => { const b = e.target && e.target.closest ? e.target.closest('[data-diagnosticar-x]') : null; if (b) diagnosticarPar(b.getAttribute('data-diagnosticar-x'), b.getAttribute('data-diagnosticar-y')); });
}
export function resultadoDiagnosticoForma() { return ultimo; }
