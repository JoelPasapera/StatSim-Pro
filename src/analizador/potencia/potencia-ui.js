// @ts-check
// analizador/potencia/potencia-ui.js — (2027.01.18) la tarjeta «13. Potencia y tamaño de muestra» del Analizador (no necesita
// una base): qué calcular (el tamaño de muestra a priori, la potencia con una muestra dada o el efecto mínimo detectable), la
// prueba, el tamaño del efecto con las convenciones de Cohen, α, las colas, la potencia deseada y lo que pide cada diseño.
// Muestra el resultado en una frase, los efectos convencionales, la curva de potencia, la redacción APA y el Word; la
// mediación simple va por Monte Carlo en un Worker (con progreso y cancelación). La zona de resultados (#potResultados) es la
// que se imprime.
import { AnalizadorEstadistico } from '../estadistica.js';
import { escaparHTML } from '../../shared/html.js';
import { potencia, tamanoMuestra, efectoDetectable, curvaPotencia } from '../../core/stats/potencia.js';
import { potenciaMediacionRepartida as repartidaSinTipos } from '../psicometria/servicio-psicometrico.js';
import { graficoLineas } from '../informe/grafico-lineas.js';
import { rasterizarSVG } from '../../shared/rasterizar.js';
import { ANCHO_FIGURA } from '../graficos-en-papel.js';
import { PRUEBAS, resumenPotencia, tablaAlternativos, redactarPotencia, referenciasPotencia, documentoWordPotencia, muestraTxt, potenciaDeReferencia } from './potencia-redaccion.js';
import { descargarWord } from '../informe/word-apa.js';
import { sintaxisPotencia, bloqueSintaxis } from '../informe/sintaxis.js';
import { numeroFijo } from '../../shared/formato-numero.js';

/** @typedef {import('./potencia-redaccion.js').ResultadoPotencia} ResultadoPotencia */
/** @typedef {import('./potencia-redaccion.js').PruebaTarjeta} PruebaTarjeta */
/** @typedef {import('./potencia-redaccion.js').ModoPotencia} ModoPotencia */
// (2027.01.19) las réplicas del Monte Carlo, repartidas entre varios Workers (el mismo resultado que en uno)
const potenciaMediacionRepartida = /** @type {(rutas: { a: number, b: number, cp: number, n: number }, opciones: object, alProgreso: (hecho: number, total: number) => void) => { promesa: Promise<any>, cancelar: () => void }} */ (/** @type {unknown} */ (repartidaSinTipos));

/** @type {HTMLElement | null} */ let contenedor = null;
/** @type {ResultadoPotencia | null} */ let ultimo = null;
/** @type {{ cancelar: () => void } | null} */ let tarea = null;

/** Lo que dice el campo del efecto de cada prueba. @type {Readonly<Record<PruebaTarjeta, string>>} */
const AYUDA_EFECTO = Object.freeze({
    t2: 'd = (M₁ − M₂) / DE combinada. Sin estudios previos: .20 pequeño, .50 mediano, .80 grande.',
    t1: 'dz = media de las diferencias / su DE (no la d de los dos momentos). .20, .50 y .80.',
    r: 'La correlación que esperas en la población (por estudios previos). .10, .30 y .50.',
    anova: 'f = √(η² / (1 − η²)): η² de .01, .06 y .14 dan f de .10, .25 y .40.',
    chi2: 'w = √(χ² / N); en una tabla 2 × 2, el φ. .10, .30 y .50.',
    regresion: 'f² = R² / (1 − R²); para un incremento, ΔR² / (1 − R² del modelo completo). .02, .15 y .35.',
    mediacion: 'a: la ruta X → M; b (abajo): M → Y controlando X. Como en Fritz y MacKinnon (2007), con X y los errores de varianza 1: .14, .39 y .59 explican el 2, el 13 y el 26 % de la varianza (pequeña, mediana y grande). Desde una ruta estandarizada β: a = β/√(1 − β²).'
});

const guia = (/** @type {string} */ t) => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
/** @param {string} sel @returns {any} */
const q = sel => /** @type {HTMLElement} */ (contenedor).querySelector(sel);
/** Un campo de diseño (se muestra solo con las pruebas que lo usan). @param {string} pruebas @param {string} cuerpo */
const campo = (pruebas, cuerpo) => `<div class="form-group" data-pruebas="${pruebas}">${cuerpo}</div>`;

const PLANTILLA = () => `
    <h3 class="card-title">13. Potencia y tamaño de muestra <span class="help-text" style="display:inline;">— no necesita una base cargada</span></h3>
    <p class="help-text">Cuántas personas necesitas para detectar un efecto (a priori), qué potencia tiene la muestra que ya tienes o cuál es el menor
        efecto que puede detectar (sensibilidad), con las distribuciones exactas de G*Power 3.1; la mediación simple, por simulación de Monte Carlo.</p>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('Qué pregunta quieres responder: lo habitual, antes de recoger datos, es el tamaño de muestra.')}
            <label for="potModo">Qué calcular</label>
            <select id="potModo" class="input"><option value="muestra">Tamaño de muestra (a priori)</option><option value="potencia">Potencia con una muestra dada</option><option value="sensibilidad">Efecto mínimo detectable (sensibilidad)</option></select>
            <span class="help-text">Con los datos ya recogidos, la sensibilidad es más informativa que la potencia «observada».</span>
        </div>
        <div class="form-group">
            ${guia('La prueba con la que contrastarás tu hipótesis principal.')}
            <label for="potPrueba">Prueba</label>
            <select id="potPrueba" class="input">${Object.entries(PRUEBAS).map(([v, p]) => `<option value="${v}">${escaparHTML(p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1))} (${escaparHTML(p.simbolo === 'a' ? 'a y b' : p.simbolo)})</option>`).join('')}</select>
            <span class="help-text">Cada prueba tiene su tamaño del efecto: el campo siguiente dice cuál.</span>
        </div>
        <div class="form-group" id="potCampoEfecto">
            ${guia('El efecto que quieres poder detectar: el de estudios previos o el menor que te importaría.')}
            <label for="potEfecto" id="potEfectoEtiqueta">Tamaño del efecto (d)</label>
            <input id="potEfecto" class="input" type="number" step="any" min="0" value="0.5">
            <div style="display:flex; flex-wrap:wrap; gap:0.3rem; margin-top:0.35rem;" role="group" aria-label="Efectos convencionales">
                ${['Pequeño', 'Mediano', 'Grande'].map((t, i) => `<button type="button" class="btn btn-outline" data-convencion="${i}" style="padding:0.15rem 0.6rem; font-size:0.85em; min-height:0;">${t}</button>`).join('')}</div>
            <span class="help-text" id="potEfectoAyuda">${escaparHTML(AYUDA_EFECTO.t2)}</span>
        </div>
        <div class="form-group" id="potCampoN" hidden>
            ${guia('La muestra que tienes (o la máxima que puedes conseguir).')}
            <label for="potN" id="potNEtiqueta">Tamaño de muestra</label>
            <input id="potN" class="input" type="number" step="1" min="2" value="100">
            <span class="help-text" id="potNAyuda">El de cada grupo en la t de dos grupos (n₁) y en el ANOVA; el total en las demás.</span>
        </div>
        <div class="form-group">
            ${guia('El nivel de significación y si la hipótesis predice una dirección.')}
            <label for="potAlfa">α</label>
            <select id="potAlfa" class="input"><option value="0.05">.05</option><option value="0.01">.01</option><option value="0.1">.10</option></select>
            <label for="potColas" style="margin-top:0.5rem;">Contraste</label>
            <select id="potColas" class="input"><option value="2">Bilateral</option><option value="1">Unilateral (hipótesis direccional)</option></select>
            <span class="help-text">Las colas, solo en las t y la correlación; el α por defecto es el de la configuración de la investigación.</span>
        </div>
        <div class="form-group" id="potCampoPotencia">
            ${guia('La probabilidad de detectar el efecto si existe que quieres asegurar.')}
            <label for="potPotencia">Potencia deseada</label>
            <select id="potPotencia" class="input"><option value="0.8">.80 (lo habitual)</option><option value="0.9">.90</option><option value="0.95">.95</option></select>
            <span class="help-text">.80 es la convención de Cohen (1988); .90 o .95 si un falso negativo es grave.</span>
        </div>
        ${campo('t2', `${guia('Si los grupos tendrán tamaños distintos (por ejemplo, el doble de controles).')}<label for="potRazon">Razón n₂ / n₁</label><input id="potRazon" class="input" type="number" step="any" min="0.1" value="1"><span class="help-text">1: grupos iguales (lo más eficiente).</span>`)}
        ${campo('anova', `${guia('Cuántos grupos compara el ANOVA.')}<label for="potK">Grupos</label><input id="potK" class="input" type="number" step="1" min="2" value="3"><span class="help-text">Los grupos se suponen del mismo tamaño, como en G*Power.</span>`)}
        ${campo('chi2', `${guia('Los grados de libertad de la χ²: (filas − 1) × (columnas − 1).')}<label for="potGl">Grados de libertad</label><input id="potGl" class="input" type="number" step="1" min="1" value="1"><span class="help-text">Una tabla 2 × 2 tiene 1; una de 3 × 4, 6.</span>`)}
        ${campo('regresion', `${guia('Cuántos predictores tiene el modelo y cuántos se prueban (todos: el R² del modelo).')}<label for="potP">Predictores del modelo</label><input id="potP" class="input" type="number" step="1" min="1" value="3"><label for="potQ" style="margin-top:0.5rem;">Predictores que se prueban</label><input id="potQ" class="input" type="number" step="1" min="1" value="3"><span class="help-text">Para el aporte de un bloque (regresión jerárquica), los del bloque; los de control, en el total.</span>`)}
        ${campo('mediacion', `${guia('Las otras rutas de la mediación, en la misma métrica que a.')}<label for="potB">Ruta b (M → Y)</label><input id="potB" class="input" type="number" step="any" value="0.39"><label for="potCp" style="margin-top:0.5rem;">Efecto directo c′ (X → Y)</label><input id="potCp" class="input" type="number" step="any" value="0"><span class="help-text">c′ = 0: mediación completa (la situación de las tablas de Fritz y MacKinnon).</span>`)}
        ${campo('mediacion', `${guia('Cuántas bases se simulan por cada n: más réplicas, estimación más precisa (y más lenta).')}<label for="potR">Réplicas de Monte Carlo</label><select id="potR" class="input"><option value="1000">1 000 (rápido, ± .03)</option><option value="5000" selected>5 000 (recomendado, ± .01)</option></select><label for="potSemilla" style="margin-top:0.5rem;">Semilla</label><input id="potSemilla" class="input" type="number" min="1" step="1" value="2027"><span class="help-text">Con la misma semilla, el mismo resultado.</span>`)}
    </div>
    <div class="acciones-fila"><button type="button" id="potCalcular" class="btn btn-primary">Calcular</button></div>
    <div id="potProgresoFila" class="boot-progreso" hidden><progress id="potProgreso" max="100" value="0" aria-label="Progreso de la simulación"></progress> <span id="potEstado" class="help-text" aria-live="polite"></span>
        <button type="button" id="potCancelar" class="btn btn-outline">Cancelar</button></div>
    <div id="potMensajes" role="alert"></div>
    <div id="potResultados" hidden></div>`;

/** La prueba elegida. @returns {PruebaTarjeta} */
const prueba = () => /** @type {PruebaTarjeta} */ (q('#potPrueba').value);
/** El modo elegido. @returns {ModoPotencia} */
const modo = () => /** @type {ModoPotencia} */ (q('#potModo').value);

/** Muestra los campos que usa la prueba y el modo elegidos. */
export function actualizarCampos() {
    if (!contenedor) return;
    const p = prueba(), m = modo(), P = PRUEBAS[p];
    contenedor.querySelectorAll('[data-pruebas]').forEach(e => { /** @type {HTMLElement} */ (e).hidden = !String(/** @type {HTMLElement} */ (e).dataset.pruebas).split(' ').includes(p); });
    q('#potCampoEfecto').hidden = m === 'sensibilidad';
    q('#potCampoN').hidden = m === 'muestra';
    q('#potCampoPotencia').hidden = m === 'potencia';
    q('#potColas').disabled = !(p === 't2' || p === 't1' || p === 'r');
    q('#potEfectoEtiqueta').textContent = p === 'mediacion' ? 'Ruta a (X → M)' : `Tamaño del efecto (${P.simbolo})`;
    q('#potEfectoAyuda').textContent = AYUDA_EFECTO[p];
    q('#potNEtiqueta').textContent = p === 't2' ? 'Tamaño de muestra (n₁, el del primer grupo)' : p === 'anova' ? 'Tamaño de muestra (n de cada grupo)' : 'Tamaño de muestra (N total)';
}

/** Un número de un campo. @param {string} id */
const numero = id => Number(String(q(id).value).replace(',', '.'));

/**
 * Las opciones de la prueba elegida, validadas.
 * @returns {{ o: Record<string, number>, errores: string[] }}
 */
function opcionesDe() {
    /** @type {string[]} */ const errores = [];
    /** @type {Record<string, number>} */ const o = { alfa: numero('#potAlfa'), colas: numero('#potColas') };
    const p = prueba();
    if (p === 't2') { o.razon = numero('#potRazon'); if (!(o.razon > 0)) errores.push('La razón n₂/n₁ debe ser positiva.'); }
    if (p === 'anova') { o.k = numero('#potK'); if (!(Number.isInteger(o.k) && o.k >= 2)) errores.push('El ANOVA necesita al menos 2 grupos (un número entero).'); }
    if (p === 'chi2') { o.gl = numero('#potGl'); if (!(Number.isInteger(o.gl) && o.gl >= 1)) errores.push('Los grados de libertad de la χ² deben ser un entero positivo.'); }
    if (p === 'regresion') {
        o.predictores = numero('#potP'); o.probados = numero('#potQ');
        if (!(Number.isInteger(o.predictores) && o.predictores >= 1)) errores.push('El número de predictores debe ser un entero positivo.');
        else if (!(Number.isInteger(o.probados) && o.probados >= 1 && o.probados <= o.predictores)) errores.push('Los predictores que se prueban deben ser entre 1 y los del modelo.');
    }
    if (p !== 't2' && p !== 't1' && p !== 'r') o.colas = 2;
    return { o, errores };
}

/** @param {string[]} errores @param {string[]} [avisos] */
function mensajes(errores, avisos = []) {
    const caja = q('#potMensajes');
    const bloque = (/** @type {string} */ clase, /** @type {string} */ titulo, /** @type {string[]} */ xs) => (xs.length ? `<div class="${clase}"><strong>${titulo}</strong><ul>${xs.map(x => `<li>${escaparHTML(x)}</li>`).join('')}</ul></div>` : '');
    caja.innerHTML = bloque('aiken-errores', 'No se puede calcular:', errores) + bloque('aiken-avisos', 'Ten en cuenta:', avisos);
}

/** Los efectos convencionales y su tamaño de muestra o su potencia. @param {ResultadoPotencia} R @param {Record<string, number>} o */
function alternativos(R, o) {
    const P = PRUEBAS[R.prueba], nombres = ['Pequeño', 'Mediano', 'Grande'];
    if (R.prueba === 'mediacion') return [];
    return P.convenciones.map((e, i) => {
        if (R.modo === 'muestra') { const t = tamanoMuestra(/** @type {any} */ (R.prueba), e, { ...o, potenciaDeseada: R.potenciaDeseada }); return { nombre: /** @type {string} */ (nombres[i]), efecto: e, n: t ? t.n : null, total: t ? t.total : null }; }
        const unidades = R.prueba === 'anova' ? R.k * R.n : R.n;
        return { nombre: /** @type {string} */ (nombres[i]), efecto: e, n: potencia(/** @type {any} */ (R.prueba), e, unidades, R.prueba === 't2' ? { ...o, razon: /** @type {number} */ (R.n2) / R.n } : o), total: null };
    });
}

/** La curva de potencia del resultado (salvo en la mediación). @param {ResultadoPotencia} R @param {boolean} papel */
export function graficoPotencia(R, papel = false) {
    if (R.prueba === 'mediacion') return null;
    const o = { alfa: R.alfa, colas: R.colas, razon: R.razon, k: R.k, gl: R.gl, predictores: R.predictores, probados: R.probados };
    const hasta = Math.max(20, Math.ceil(R.n * 2.2)), curva = curvaPotencia(R.prueba, R.efecto, 2, hasta, { ...o, puntos: 80 });
    const unidad = PRUEBAS[R.prueba].unidad, ejeX = `Tamaño de muestra${unidad ? ` (n ${unidad})` : ' (N)'}`;
    return graficoLineas({
        series: [{ etiqueta: `${PRUEBAS[R.prueba].simbolo} = ${numeroFijo(R.efecto, 2)}`, puntos: curva.map(p => ({ x: p.n, y: p.potencia, descripcion: `n = ${p.n}: potencia ${numeroFijo(p.potencia, 3)}` })) }],
        ejeX: { titulo: ejeX, min: 0, decimales: 0 }, ejeY: { titulo: 'Potencia', min: 0, max: 1, decimales: 1 },
        referencias: [{ tipo: 'h', valor: potenciaDeReferencia(R), etiqueta: `potencia ${numeroFijo(potenciaDeReferencia(R), 2)}` }],
        // la etiqueta, arriba y a la izquierda del punto: la curva crece y se curva hacia abajo, así que ahí no pasa
        destacados: [{ x: R.n, y: R.potencia, etiqueta: `${muestraTxt(R)}: ${numeroFijo(R.potencia, 3)}`, lado: 'izquierda', vertical: 'arriba' }],
        descripcion: `Curva de potencia de la ${PRUEBAS[R.prueba].nombre} para ${PRUEBAS[R.prueba].simbolo} = ${numeroFijo(R.efecto, 2)}: la potencia crece con el tamaño de la muestra`, papel
    });
}

/** Pinta un resultado. @param {ResultadoPotencia} R */
function pintar(R) {
    ultimo = R;
    const zona = q('#potResultados'), t = tablaAlternativos(R), g = graficoPotencia(R, false);
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Resultados: ${escaparHTML(PRUEBAS[R.prueba].nombre)}</h4>
        <p style="margin:0.2rem 0 0.4rem;"><b id="potResumen">${escaparHTML(resumenPotencia(R))}</b></p>
        ${R.alternativos.length ? `<h5 class="aiken-subtitulo">${escaparHTML(t.titulo)}</h5><div class="table-container"><table class="table"><thead><tr>${t.cabecera.map(h => `<th>${escaparHTML(h)}</th>`).join('')}</tr></thead><tbody>${t.filas.map(f => `<tr>${f.map(c => `<td>${escaparHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="help-text"><em>Nota.</em> ${escaparHTML(t.nota)}</p>` : ''}
        ${g ? `<h5 class="aiken-subtitulo">Curva de potencia</h5><div style="max-width:640px;">${g.svg}</div>` : ''}
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="potParrafo">${escaparHTML(redactarPotencia(R))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasPotencia(R).map(x => `<p>${x}</p>`).join('')}</details>
        ${bloqueSintaxis(sintaxisPotencia(R))}
        <div class="acciones-fila"><button type="button" id="potWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`;
    zona.hidden = false;
    q('#potWord').addEventListener('click', () => { void exportarWord(); });
}

/** Calcula y muestra. @returns {Promise<ResultadoPotencia | null>} */
export function calcular() {
    if (!contenedor) return Promise.resolve(null);
    if (tarea) { tarea.cancelar(); tarea = null; }
    const p = prueba(), m = modo(), { o, errores } = opcionesDe();
    const efecto = numero('#potEfecto'), n = numero('#potN'), potenciaDeseada = numero('#potPotencia');
    if (m !== 'sensibilidad' && !(efecto > 0)) errores.push('El tamaño del efecto debe ser un número positivo.');
    if (m !== 'sensibilidad' && p === 'r' && !(efecto < 1)) errores.push('La correlación debe estar entre 0 y 1.');
    if (m !== 'muestra' && !(Number.isInteger(n) && n >= 2)) errores.push('El tamaño de muestra debe ser un entero de al menos 2.');
    if (p === 'mediacion' && m === 'sensibilidad') errores.push('En la mediación, el efecto mínimo detectable no se calcula (habría que simular cada efecto): usa el tamaño de muestra o la potencia con un n dado.');
    /** @type {ResultadoPotencia} */
    const R = { modo: m, prueba: p, efecto, alfa: o.alfa ?? 0.05, colas: /** @type {1 | 2} */ (o.colas === 1 ? 1 : 2), potenciaDeseada, razon: o.razon ?? 1, k: o.k ?? 3, gl: o.gl ?? 1, predictores: o.predictores ?? 1, probados: o.probados ?? o.predictores ?? 1,
        b: numero('#potB'), cp: numero('#potCp'), R: numero('#potR'), semilla: Math.max(1, Math.floor(numero('#potSemilla') || 2027)), n: 0, n2: null, total: 0, potencia: NaN, ee: null, alternativos: [] };
    if (p === 'mediacion' && !errores.length) {
        if (!(Number.isFinite(R.b) && Number.isFinite(R.cp))) errores.push('Escribe las rutas b y c′ (c′ puede ser 0).');
        else if (R.b === 0) errores.push('Con b = 0 no hay mediación que detectar.');
        else if ([efecto, R.b, R.cp].some(v => Math.abs(v) > 5)) errores.push('Unas rutas mayores que 5 (en la métrica de Fritz y MacKinnon, más del 96 % de la varianza explicada) no son realistas: revisa los valores.');
    }
    if (errores.length) { mensajes(errores); q('#potResultados').hidden = true; ultimo = null; return Promise.resolve(null); }
    mensajes([]);
    if (p !== 'mediacion') {
        if (m === 'muestra') {
            const t = tamanoMuestra(p, efecto, { ...o, potenciaDeseada });
            if (!t) { mensajes(['Ni con 10 millones de casos se alcanza esa potencia: el efecto es demasiado pequeño.']); q('#potResultados').hidden = true; ultimo = null; return Promise.resolve(null); }
            Object.assign(R, { n: t.n, n2: t.n2, total: t.total, potencia: t.potenciaReal });
        } else {
            const disenoT2 = p === 't2' ? { n2: Math.ceil(R.razon * n) } : {};
            const total = p === 't2' ? n + Math.ceil(R.razon * n) : p === 'anova' ? R.k * n : n;
            Object.assign(R, { n, n2: p === 't2' ? disenoT2.n2 : null, total });
            const oN = p === 't2' ? { ...o, razon: /** @type {number} */ (disenoT2.n2) / n } : o;
            if (m === 'potencia') R.potencia = potencia(p, efecto, p === 'anova' ? R.k * n : n, oN);
            else {
                const e = efectoDetectable(p, n, { ...oN, potenciaDeseada });
                if (e === null) { mensajes([`Con ${muestraTxt(R)} no se llega a esa potencia ni con efectos enormes${p === 'r' ? ' (ρ = .99)' : ''}: aumenta la muestra.`]); q('#potResultados').hidden = true; ultimo = null; return Promise.resolve(null); }
                R.efecto = e; R.potencia = potenciaDeseada;
            }
            if (!Number.isFinite(R.potencia)) { mensajes(['Con ese tamaño de muestra el diseño no es posible (faltan grados de libertad).']); q('#potResultados').hidden = true; ultimo = null; return Promise.resolve(null); }
        }
        R.alternativos = alternativos(R, o);
        pintar(R);
        return Promise.resolve(R);
    }
    // la mediación: en los Workers
    const inicio = Date.now();
    q('#potCalcular').disabled = true; q('#potProgresoFila').hidden = false; q('#potEstado').textContent = 'Simulando…';
    const actual = potenciaMediacionRepartida({ a: efecto, b: R.b, cp: R.cp, n: m === 'potencia' ? n : 0 }, { R: R.R, alfa: R.alfa, semilla: R.semilla, potenciaDeseada }, (h, t) => {
        q('#potProgreso').value = Math.round((100 * h) / t);
        q('#potEstado').textContent = `${m === 'potencia' ? `Réplicas: ${h.toLocaleString('es')} de ${t.toLocaleString('es')}` : `Tamaños probados: ${h}`} · ${((Date.now() - inicio) / 1000).toFixed(0)} s`;
    });
    tarea = actual;
    q('#potCancelar').onclick = () => actual.cancelar();
    const terminar = () => { q('#potCalcular').disabled = false; q('#potProgresoFila').hidden = true; if (tarea === actual) tarea = null; };
    return actual.promesa.then(r => {
        terminar();
        if (!r) { mensajes(['Ni con 20 000 casos se alcanza esa potencia: las rutas son demasiado pequeñas.']); q('#potResultados').hidden = true; ultimo = null; return null; }
        Object.assign(R, m === 'potencia' ? { n, total: n, potencia: r.potencia, ee: r.ee } : { n: r.n, total: r.n, potencia: r.potencia, ee: r.ee });
        pintar(R);
        return R;
    }).catch(err => {
        terminar();
        mensajes(err && err.cancelado ? [] : [`No se pudo simular: ${err && err.message ? err.message : err}`], err && err.cancelado ? ['Simulación cancelada.'] : []);
        return null;
    });
}

/** El Word del último cálculo (con la curva, si se puede pasar a imagen). */
export async function exportarWord() {
    if (!ultimo) return null;
    const g = graficoPotencia(ultimo, true);
    const png = g ? await rasterizarSVG(g.svg, ANCHO_FIGURA, Math.round(ANCHO_FIGURA * g.alto / g.ancho)) : null;
    return descargarWord(documentoWordPotencia(ultimo, png), 'potencia_APA', 'Análisis de potencia exportado a Word (APA 7)');
}

/** Monta la tarjeta en #potenciaContainer (una vez). */
export function montarPotencia() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('potenciaContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    contenedor.innerHTML = PLANTILLA();
    try { const a = AnalizadorEstadistico.alfaEstudio(); if ([0.05, 0.01, 0.1].includes(a)) q('#potAlfa').value = String(a); } catch (e) { /* sin configuración: .05 */ }
    q('#potModo').addEventListener('change', actualizarCampos);
    q('#potPrueba').addEventListener('change', () => {
        const P = PRUEBAS[prueba()];
        q('#potEfecto').value = String(P.convenciones[1]);
        actualizarCampos();
    });
    contenedor.querySelectorAll('[data-convencion]').forEach(b => b.addEventListener('click', () => { q('#potEfecto').value = String(PRUEBAS[prueba()].convenciones[Number(/** @type {HTMLElement} */ (b).dataset.convencion)]); }));
    q('#potCalcular').addEventListener('click', () => { void calcular(); });
    actualizarCampos();
}

/** El último resultado. */
export function resultadoPotencia() { return ultimo; }
