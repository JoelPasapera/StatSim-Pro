// analizador/comparacion-grupos.js — comparación de grupos (t, U, ANOVA, Kruskal…).
// Origen: comparacion-grupos.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { AnalizadorEstadistico } from './estadistica.js';
import { RegresionMultiple } from './regresion.js';
import { obtenerColumnasCategoricas, obtenerColumnasNumericas } from './ui/carga.js';
import { EtiquetasVariables } from '../shared/etiquetas-variables.js';
import { escaparHTML } from '../shared/html.js';
import { obtenerEtiqueta } from '../shared/etiquetas.js';
import { pTBilateral, colaSuperiorF, pChiCuadrado, cdfNormal } from '../core/stats/numerico.js';
import { media, varianza } from '../core/stats/descriptivos.js';
import { mediana, rangosPromedio } from '../core/stats/orden.js';
import * as contrastes from '../core/stats/contrastes.js';
import { protocoloGrupos, ALFA_SUPUESTOS, MAX_GRUPOS } from '../core/stats/protocolo-grupos.js';
import { pruebaNormalidad } from '../core/stats/normalidad.js';
import { aNumero, esPerdido } from '../core/data/celdas.js';
import { formatoNumero, formatoP, pConSigno } from '../shared/formato-numero.js';
import { magnitudD, magnitudR, magnitudEta2 } from './motor/magnitudes.js';

// ========================================
// COMPARACIÓN ENTRE GRUPOS — StatSim Pro
// Flujo automático con el protocolo único (core/stats/protocolo-grupos.js, el mismo de la vista principal, el Word y la
// criba): evalúa supuestos (normalidad por grupo + Levene) y decide la prueba: 2 grupos → t de Student / t de Welch /
// U de Mann-Whitney; 3+ grupos → ANOVA de un factor / ANOVA de Welch / Kruskal-Wallis (+ post-hoc con Holm, con el modelo
// de error de cada una: t con la MCE, t de Welch, z de Dunn). (2026.12.20) Hasta la 2026.12.19, con varianzas desiguales
// esta pestaña pasaba a Kruskal-Wallis, y sus post-hoc paramétricos eran siempre t de Welch y los no paramétricos U de
// Mann-Whitney por pares.
// Reporta tamaños del efecto: d de Cohen, r, η², ε².
// ========================================

const ComparacionGrupos = {

    // ---------- Distribuciones: del núcleo único (core/stats/numerico.js) ----------
    _pT(t, df) { return pTBilateral(t, df); },   // p BILATERAL
    _pF(F, d1, d2) { return F > 0 ? colaSuperiorF(F, d1, d2) : 1; },   // cola SUPERIOR (el valor p)
    _pChi2(x, k) { return x > 0 ? (k === 0 ? 0 : pChiCuadrado(x, k)) : 1; },   // con 0 gl, la χ² es una masa en 0 (un k inválido sigue dando NaN)
    _phi(z) { return cdfNormal(z); },   // CDF

    // ---------- Descriptivos básicos ----------
    _media(v) { return media(v); },
    _var(v) { return varianza(v); },
    _mediana(v) { return mediana(v); },

    // Rangos con empates promediados sobre el conjunto combinado.
    _rangos(v) { return rangosPromedio(v); },

    // ---------- Pruebas (del núcleo único; cada una con su formato de esta pestaña) ----------
    // t de Student (varianzas agrupadas) — 2 grupos.
    tStudent(a, b) { return this._fmtT('t de Student', contrastes.tStudent(a, b)); },   // (2026.12.14) del núcleo único
    // t de Welch (varianzas desiguales) — 2 grupos.
    tWelch(a, b) { return this._fmtT('t de Welch', contrastes.tWelch(a, b)); },
    _fmtT(nombre, r) { return { nombre, estadistico: r.t, gl: r.gl, pValor: r.pValor, efecto: { nombre: 'd de Cohen', valor: r.d } }; },
    // U de Mann-Whitney (aprox. normal con corrección de empates; sin corrección por continuidad, como SPSS).
    mannWhitneyU(a, b) { return this._fmtMannWhitney(contrastes.mannWhitney(a, b)); },   // la convención del núcleo, la de SPSS (hasta la 2026.12.14, con continuidad)
    _fmtMannWhitney(r) { return { nombre: 'U de Mann-Whitney', estadistico: r.U, z: r.z, gl: null, pValor: r.pValor, efecto: { nombre: 'r', valor: r.r } }; },
    // ANOVA de un factor.
    anova(grupos) { return this._fmtAnova('ANOVA de un factor', contrastes.anova(grupos)); },
    // ANOVA de Welch (2026.12.20): sin suponer varianzas iguales; gl del error fraccionarios y el η² descriptivo del clásico.
    anovaWelch(grupos) { return this._fmtAnova('ANOVA de Welch', contrastes.anovaWelch(grupos)); },
    _fmtAnova(nombre, r) { return { nombre, estadistico: r.F, gl: [r.gl1, r.gl2], pValor: r.pValor, efecto: { nombre: 'η²', valor: r.eta2 } }; },
    // Kruskal-Wallis (con corrección de empates).
    // (2026.12.14) ε² = H/(n − 1) (Tomczak y Tomczak, 2014): antes se calculaba (H − k + 1)/(n − k), que es η²_H, recortada a 0
    kruskalWallis(grupos) { return this._fmtKruskal(contrastes.kruskal(grupos)); },
    _fmtKruskal(r) { return { nombre: 'Kruskal-Wallis', estadistico: r.H, gl: r.gl, pValor: r.pValor, efecto: { nombre: 'ε²', valor: r.epsilon2 } }; },
    // Levene (centrado en la media, como SPSS): ANOVA sobre |x − media del grupo|.
    levene(grupos) { return this._fmtLevene(contrastes.levene(grupos)); },   // centrada en la media: la convención del núcleo, la de SPSS
    // (2026.12.23) con todos los grupos constantes F es 0/0: F = 0 con p = 1, como la vista principal (el Word mostraba «—»)
    _fmtLevene(r) { return { nombre: 'Levene', estadistico: Number.isNaN(r.F) ? 0 : r.F, gl: [r.gl1, r.gl2], pValor: r.pValor, homogeneas: r.pValor > ALFA_SUPUESTOS }; },
    // La prueba global que eligió el protocolo, en el formato de esta pestaña.
    _fmtPrueba(P) {
        switch (P.prueba) {
            case 'student': return this._fmtT('t de Student', P.global);
            case 'welch': return this._fmtT('t de Welch', P.global);
            case 'mann-whitney': return this._fmtMannWhitney(P.global);
            case 'anova': return this._fmtAnova('ANOVA de un factor', P.global);
            case 'anova-welch': return this._fmtAnova('ANOVA de Welch', P.global);
            default: return this._fmtKruskal(P.global);
        }
    },
    // Por qué se eligió cada prueba (la pestaña y el Word).
    _razon(P) {
        switch (P.prueba) {
            case 'student': return 'ambos grupos con distribución normal y varianzas homogéneas (Levene p > .05)';
            case 'welch': return 'grupos normales pero con varianzas desiguales (Levene p ≤ .05): se aplica la corrección de Welch';
            case 'anova': return 'todos los grupos con distribución normal y varianzas homogéneas (Levene p > .05)';
            case 'anova-welch': return 'todos los grupos con distribución normal pero varianzas desiguales (Levene p ≤ .05): se aplica la corrección de Welch, que no supone varianzas iguales';
            default: return 'al menos un grupo se aparta de la normalidad: se emplea la alternativa por rangos';   // Mann-Whitney y Kruskal-Wallis
        }
    },
    // El nivel de significación del estudio (el de la vista principal, AnalizadorEstadistico.alfaEstudio; .05 si no está
    // disponible) y su forma APA.
    _alfa() {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        return A && typeof A.alfaEstudio === 'function' ? A.alfaEstudio() : 0.05;
    },
    _fa(a) { return String(a).replace(/^0\./, '.'); },
    // gl: enteros tal cual; fraccionarios (Welch), con dos decimales.
    _fgl(g) { return Number.isInteger(g) ? String(g) : this._fx(g, 2); },

    // ---------- Interpretación de tamaños del efecto ----------
    // las bandas de Cohen (1988), las mismas del análisis general (2026.12.24: una sola definición, motor/magnitudes.js)
    _magnitud(nombre, v) { return nombre === 'd de Cohen' ? magnitudD(v) : nombre === 'r' ? magnitudR(v) : magnitudEta2(v); },   // η² / ε²

    // Qué compara la prueba de cada post-hoc (la pestaña y el Word).
    _notaPostHoc(metodo) {
        if (metodo === 'mce') return 'Cada par se contrasta con la t de Student que usa la media cuadrática del error (MCE) del ANOVA, el mismo término de error de la prueba global (gl = N − k); los p se corrigen por Holm.';
        if (metodo === 'welch') return 'Cada par se contrasta con la t de Welch, que, como el ANOVA de Welch, no supone varianzas iguales; los p se corrigen por Holm.';
        if (metodo === 'dunn') return 'Cada par se contrasta con la z de Dunn, que compara los rangos promedio de la ordenación conjunta de todos los grupos, la misma de Kruskal-Wallis; los p se corrigen por Holm.';
        return '';
    },

    // ---------- Motor: analiza una variable numérica según una de agrupación ----------
    // Devuelve un objeto rico con grupos, supuestos, decisión, prueba y post-hoc.
    analizar(colGrupo, colNum, etGrupo, etNum) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        if (!datos.length) return { error: 'No hay datos cargados.' };

        // Agrupar los valores numéricos válidos por categoría.
        const mapa = new Map();
        datos.forEach(d => {
            // (2026.12.18) la conversión y los perdidos del núcleo: antes +valor contaba como 0 la celda vacía de un CSV, y
            // un grupo NaN (perdido del Simulador) formaba el grupo «NaN»
            const g = esPerdido(d[colGrupo]) ? '' : String(d[colGrupo]).trim();
            const x = aNumero(d[colNum]);
            if (g && Number.isFinite(x)) {
                if (!mapa.has(g)) mapa.set(g, []);
                mapa.get(g).push(x);
            }
        });
        const excluidos = [];
        const entradas = [...mapa.entries()].filter(([nom, v]) => {
            if (v.length >= 3) return true;
            excluidos.push(`${nom} (n = ${v.length})`); return false;
        });
        if (entradas.length < 2) return { error: 'Se necesitan al menos 2 grupos con 3 o más casos cada uno.' };
        // (2026.12.20) el máximo de la vista principal: con más grupos, la variable no es de agrupación o conviene reunirlos
        if (entradas.length > MAX_GRUPOS) return { error: `La variable de agrupación tiene demasiados grupos (${entradas.length}); elige una variable categórica de ${MAX_GRUPOS} grupos como máximo o reúne sus categorías.` };
        entradas.sort((a, b) => b[1].length - a[1].length);
        const nombres = entradas.map(e => e[0]);
        const grupos = entradas.map(e => e[1]);
        const k = grupos.length;

        // Supuestos, decisión, prueba global y post-hoc: el protocolo único (el de la vista principal, el Word y la criba).
        const alfa = this._alfa();
        const P = protocoloGrupos(grupos, { alfa });
        const normalidad = P.normalidad.map((r, i) => ({ grupo: nombres[i], n: grupos[i].length, normal: r.normal, prueba: r.abreviatura, pValor: r.pValor }));
        const prueba = this._fmtPrueba(P);
        prueba.significativa = P.significativa;
        prueba.magnitud = this._magnitud(prueba.efecto.nombre, prueba.efecto.valor);

        // Post-hoc (solo 3+ grupos y global significativo): pares con Holm y el modelo de error de la prueba global.
        const postHoc = P.postHoc ? P.postHoc.pares.map(p => ({
            a: nombres[p.i], b: nombres[p.j], nombre: P.postHoc.nombre, estadistico: p.estadistico, gl: p.gl,
            pValor: p.pValor, pHolm: p.pHolm, sig: p.significativa
        })) : null;

        return {
            etGrupo: etGrupo || colGrupo, etNum: etNum || colNum, k, alfa,
            grupos: entradas.map(([nom, v]) => ({
                nombre: nom, n: v.length,
                media: this._media(v), de: Math.sqrt(this._var(v)), mediana: this._mediana(v)
            })),
            excluidos, normalidad, levene: this._fmtLevene(P.levene), rama: P.rama, razon: this._razon(P), prueba,
            postHoc, metodoPostHoc: P.postHoc ? P.postHoc.metodo : null
        };
    },

    // ---------- UI en la página ----------
    montar() {
        const seccion = document.getElementById('cgSlot') || document.getElementById('analizador');
        if (!seccion || document.getElementById('cgCard')) return;
        const card = document.createElement('div');
        card.id = 'cgCard';
        card.className = 'card';
        card.style.cssText = 'margin-top:1.5rem;padding:1.25rem;border:1px solid var(--color-border,#e5e5e5);border-radius:0.6rem;';
        card.innerHTML = `
          <h3 style="margin:0 0 0.3rem;">⚖️ Comparación entre grupos</h3>
          <p class="help-text" style="margin:0 0 0.8rem;">Compara una variable numérica entre los grupos de una variable categórica. La app evalúa los supuestos (normalidad por grupo y homogeneidad de varianzas) y elige automáticamente la prueba adecuada: t de Student, t de Welch o U de Mann-Whitney (2 grupos); ANOVA de un factor, ANOVA de Welch o Kruskal-Wallis con post-hoc de Holm (3 o más).</p>
          <div style="display:flex;gap:0.8rem;flex-wrap:wrap;align-items:flex-end;">
            <div><label class="label" for="cgGrupo">Variable de agrupación</label><br>
              <select id="cgGrupo" class="input" style="min-width:12rem;"></select></div>
            <div><label class="label" for="cgNum">Variable numérica</label><br>
              <select id="cgNum" class="input" style="min-width:12rem;"></select></div>
            <button id="cgAnalizar" class="btn btn-primary" style="padding:0.5rem 1.1rem;">Comparar grupos</button>
          </div>
          <p class="help-text" style="margin:0.7rem 0 0; font-size:0.88em; line-height:1.5;">
            <b>¿Cómo usar esta sección?</b> Sirve para responder preguntas como «¿difiere la inteligencia emocional entre hombres y mujeres?» o «¿varía el puntaje según la carrera?».
            En <b>Variable de agrupación</b> elige una columna categórica que divide tu muestra en grupos (p. ej., Sexo, Carrera, Turno): define <i>quiénes se comparan</i>.
            En <b>Variable numérica</b> elige el puntaje que quieres contrastar entre esos grupos (p. ej., General_IE o una dimensión): define <i>qué se compara</i>.
            La app verificará los supuestos por ti y explicará qué prueba aplicó y por qué.</p>
          <div style="margin-top:0.9rem; padding-top:0.7rem; border-top:1px dashed #ddd;">
            <p style="margin:0 0 0.2rem; font-weight:600;">¿Sospechas que los grupos parten con ventaja en otra variable? <span style="font-weight:normal;">(ANCOVA)</span></p>
            <p class="help-text" style="margin:0 0 0.4rem; font-size:0.86em;">Ejemplo: «¿difieren las carreras en inteligencia emocional… o es que unas tienen estudiantes de más edad?». Elige la variable a igualar y la comparación se repetirá descontando su efecto. Déjalo en blanco para comparar tal cual.</p>
            <select id="cgCov" class="input" style="min-width:16rem;"><option value="">Sin covariable — comparar tal cual</option></select>
          </div>
          <div style="margin-top:0.8rem;">
            <p style="margin:0 0 0.2rem; font-weight:600;">¿Crees que el factor afecta a varios resultados a la vez? <span style="font-weight:normal;">(MANOVA)</span></p>
            <p class="help-text" style="margin:0 0 0.4rem; font-size:0.86em;">Ejemplo: un tratamiento que mueve ansiedad, estrés y autoestima al mismo tiempo. Marca las variables de resultado <b>adicionales</b> a la elegida arriba y se analizarán en conjunto — evitando el riesgo de hacer varias pruebas sueltas.</p>
            <div id="cgDVs" style="max-height:7.5rem; overflow:auto; border:1px solid #ddd; border-radius:0.4rem; padding:0.4rem 0.6rem;"><span class="help-text">Carga datos para ver las variables.</span></div>
          </div>
          <div id="cgEstado" class="help-text" style="margin-top:0.5rem;"></div>
          <div id="cgResultado" style="margin-top:0.8rem;"></div>`;
        seccion.appendChild(card);
        const btn = document.getElementById('cgAnalizar');
        if (btn) btn.addEventListener('click', () => this._onAnalizar());
        this.actualizarSelects();
    },

    actualizarSelects() {
        const selG = document.getElementById('cgGrupo');
        const selN = document.getElementById('cgNum');
        if (!selG || !selN) return;
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        const cats = (typeof obtenerColumnasCategoricas === 'function') ? obtenerColumnasCategoricas(8) : [];
        const nums = (typeof obtenerColumnasNumericas === 'function' && datos.length) ? obtenerColumnasNumericas(datos) : [];
        // (2026.12.29) nombres y etiquetas escapados: llegan de un CSV o de un .sav ajeno
        const et = c => escaparHTML((typeof EtiquetasVariables !== 'undefined') ? EtiquetasVariables.etiquetaConColumna(c) : c);
        const opcion = c => `<option value="${escaparHTML(c)}">${et(c)}</option>`;
        selG.innerHTML = cats.map(opcion).join('');
        selN.innerHTML = nums.map(opcion).join('');
        const estado = document.getElementById('cgEstado');
        if (estado) estado.textContent = (!cats.length || !nums.length)
            ? 'Genera o carga una base de datos para habilitar la comparación.' : '';
        // ANCOVA/MANOVA: covariable y variables de resultado adicionales.
        try {
            const numsAM = (typeof obtenerColumnasNumericas === 'function' && datos.length) ? obtenerColumnasNumericas(datos) : [];
            const cov = document.getElementById('cgCov');
            if (cov) {
                const val = cov.value;
                cov.innerHTML = '<option value="">Sin covariable — comparar tal cual</option>'
                    + numsAM.map(opcion).join('');
                cov.value = val;
            }
            const dvs = document.getElementById('cgDVs');
            if (dvs) dvs.innerHTML = numsAM.length
                ? numsAM.map(c => `<label style="display:block;margin:0.15rem 0;cursor:pointer;"><input type="checkbox" value="${escaparHTML(c)}" style="margin-right:0.4rem;">${et(c)}</label>`).join('')
                : '<span class="help-text">Carga datos para ver las variables.</span>';
        } catch (e) { /* opcional */ }
    },

    _fp(p) { return formatoP(p, { alfa: this._alfa() }); },
    _fx(x, d = 2) { return formatoNumero(x, d); },   // (2026.12.22) ±∞ como «∞» (grupos constantes y distintos), no «—»

    _onAnalizar() {
        const colG = (document.getElementById('cgGrupo') || {}).value;
        const colN = (document.getElementById('cgNum') || {}).value;
        const out = document.getElementById('cgResultado');
        const estado = document.getElementById('cgEstado');
        if (!colG || !colN) { if (estado) estado.textContent = '⚠️ Selecciona ambas variables.'; return; }
        const R = this.analizar(colG, colN);
        if (R.error) { if (estado) estado.textContent = '⚠️ ' + R.error; if (out) out.innerHTML = ''; return; }
        if (estado) estado.textContent = '';
        this._ultimo = R;

        const fila = (cells, th) => `<tr>${cells.map(c => th ? `<th style="border:1px solid #ddd;padding:0.35rem 0.5rem;background:#f5f5f5;">${c}</th>` : `<td style="border:1px solid #ddd;padding:0.35rem 0.5rem;">${c}</td>`).join('')}</tr>`;
        const tabla = (rows) => `<table style="border-collapse:collapse;margin:0.4rem 0 0.8rem;font-size:0.92em;">${rows}</table>`;

        let html = `<h4 style="margin:0.4rem 0 0.2rem;">Descriptivos por grupo</h4>`
            + tabla(fila(['Grupo', 'n', 'Media', 'DE', 'Mediana'], true)
                + R.grupos.map(g => fila([g.nombre, g.n, this._fx(g.media), this._fx(g.de), this._fx(g.mediana)])).join(''));
        if (R.excluidos.length) html += `<p class="help-text">Grupos excluidos por tamaño insuficiente: ${R.excluidos.join(', ')}.</p>`;

        html += `<h4 style="margin:0.6rem 0 0.2rem;">Supuestos</h4>`
            + tabla(fila(['Grupo', 'n', 'Prueba', 'p', 'Decisión'], true)
                + R.normalidad.map(x => fila([x.grupo, x.n, x.prueba, this._fp(x.pValor), x.normal ? 'Normal' : 'No normal'])).join('')
                + fila(['<b>Levene (varianzas)</b>', '', `F(${R.levene.gl[0]}, ${R.levene.gl[1]})`, this._fp(R.levene.pValor), R.levene.homogeneas ? 'Homogéneas' : 'No homogéneas']));
        html += this._porqueDidactico(R);

        // ANCOVA (si eligió covariable) y MANOVA (si marcó resultados extra).
        if (typeof RegresionMultiple !== 'undefined') {
            RegresionMultiple._ultimaAncova = null;
            RegresionMultiple._ultimaManova = null;
            const cov = (document.getElementById('cgCov') || {}).value || '';
            if (cov && cov !== colN) {
                const RA = RegresionMultiple.ancova(colG, colN, cov, { grupo: colG, y: (typeof obtenerEtiqueta === 'function' ? obtenerEtiqueta(colN) : colN), cov });
                html += RA.error ? `<p class="help-text">⚠️ ANCOVA: ${RA.error}</p>` : RegresionMultiple._htmlAncova(RA);
            } else if (cov === colN) {
                html += `<p class="help-text">⚠️ ANCOVA: la covariable no puede ser la misma variable numérica que comparas.</p>`;
            }
            const dvsExtra = [...document.querySelectorAll('#cgDVs input:checked')].map(x => x.value).filter(c => c !== colN);
            if (dvsExtra.length) {
                const cols = [colN, ...dvsExtra];
                const MA = RegresionMultiple.manova(colG, cols, { grupo: colG, ys: cols.map(c => (typeof obtenerEtiqueta === 'function' ? obtenerEtiqueta(c) : c)) });
                html += MA.error ? `<p class="help-text">⚠️ MANOVA: ${MA.error}</p>` : RegresionMultiple._htmlManova(MA);
            }
        }

        const P = R.prueba;
        const glTxt = this._glTxt(P);
        html += `<h4 style="margin:0.6rem 0 0.2rem;">Prueba aplicada: ${P.nombre}</h4>`
            + `<p class="help-text" style="margin:0 0 0.3rem;">Elegida porque ${R.razon}.</p>`
            + tabla(fila(['Estadístico', 'gl', 'p', `Efecto (${P.efecto.nombre})`, 'Magnitud', 'Decisión'], true)
                + fila([this._fx(P.estadistico, 3), glTxt || '—', this._fp(P.pValor), this._fx(P.efecto.valor, 3), P.magnitud,
                        P.significativa ? '<b>Diferencias significativas</b>' : 'Sin diferencias significativas']));

        if (R.postHoc) {
            html += `<h4 style="margin:0.6rem 0 0.2rem;">Comparaciones por pares (post-hoc, corrección de Holm)</h4>`
                + `<p class="help-text" style="margin:0 0 0.3rem;">${this._notaPostHoc(R.metodoPostHoc)}</p>`
                + tabla(fila(['Par', 'Prueba', 'Estadístico', 'p', 'p (Holm)', 'Decisión'], true)
                    + R.postHoc.map(p => fila([`${p.a} vs ${p.b}`, p.nombre, this._fx(p.estadistico, 3), this._fp(p.pValor), this._fp(p.pHolm), p.sig ? '<b>Significativa</b>' : 'No significativa'])).join(''));
        }
        html += `<p style="margin:0.4rem 0 0;">${this.interpretar(R)}</p>`;
        if (out) out.innerHTML = html;
    },

    // gl de la prueba global, para las tablas (la pestaña y el Word): «(2, 57)», «(2, 31.46)» (ANOVA de Welch), «(41.27)».
    _glTxt(P) {
        return Array.isArray(P.gl) ? `(${this._fgl(P.gl[0])}, ${this._fgl(P.gl[1])})` : (P.gl != null ? `(${this._fgl(P.gl)})` : '');
    },
    // «= .023» o «< .001», para escribir «p = .023» y «p < .001».
    _pTxt(p) { return pConSigno(p, { alfa: this._alfa() }); },

    // Interpretación en lenguaje llano (compartida con el Word).
    interpretar(R) {
        const P = R.prueba, alfa = this._fa(Number.isFinite(R.alfa) ? R.alfa : 0.05);
        const medias = R.grupos.map(g => `${g.nombre} (M = ${this._fx(g.media)}, DE = ${this._fx(g.de)})`).join(', ');
        let s = `Se comparó ${R.etNum} entre los ${R.k} grupos de ${R.etGrupo}: ${medias}. `
            + `Dado que ${R.razon}, se aplicó la prueba ${P.nombre}, que resultó `
            + (P.significativa
                ? `estadísticamente significativa (p ${this._pTxt(P.pValor)}; α = ${alfa}): existen diferencias reales entre los grupos en ${R.etNum}. `
                : `no significativa (p ${this._pTxt(P.pValor)}; α = ${alfa}): los datos no evidencian diferencias entre los grupos en ${R.etNum}. `)
            + `El tamaño del efecto (${P.efecto.nombre} = ${this._fx(P.efecto.valor, 3)}) indica una magnitud ${P.magnitud}, `
            + `es decir, la relevancia práctica de la diferencia observada más allá de su significancia.`;
        if (R.postHoc) {
            const sig = R.postHoc.filter(p => p.sig);
            s += sig.length
                ? ` Las comparaciones por pares (${R.postHoc[0].nombre}) con corrección de Holm localizan las diferencias en: ${sig.map(p => `${p.a} vs ${p.b} (p de Holm ${this._pTxt(p.pHolm)})`).join('; ')}.`
                : ' Sin embargo, tras la corrección de Holm ninguna comparación por pares alcanzó la significancia, lo que sugiere diferencias globales difusas más que contrastes marcados entre pares concretos.';
        }
        return s;
    },

    // ---------- Generación automática para el capítulo Word ----------
    // Recorre las variables categóricas (las 8 primeras columnas de texto; las de más de MAX_GRUPOS grupos comparables se
    // omiten) × las variables indicadas.
    // Los porqués de las pruebas empleadas (compartido web/Word).
    _porqueDidactico(R) {
        const p = String((R.prueba && (R.prueba.nombre || R.prueba)) || '');
        let h = `<p style="margin:0.5rem 0 0; padding:0.5rem 0.7rem; background:#f0f6ff; border-left:3px solid #2E5BBA; border-radius:0.3rem; font-size:0.9em;"><b>💡 Los porqués del protocolo.</b> `;
        h += `<b>¿Por qué Levene vigila las varianzas?</b> Porque su truco es convertir cada dato en su desviación absoluta respecto al centro de su grupo y hacerles un análisis de varianza a <i>esas desviaciones</i>: si un grupo es más disperso, sus desviaciones promedian más alto y la F lo delata. Importa porque las pruebas clásicas reparten el error asumiendo dispersiones iguales — con varianzas desiguales, sus p-valores pierden calibración (y por eso existe la variante de Welch, que renuncia a ese supuesto). `;
        if (/Mann-Whitney|Kruskal/i.test(p)) {
            h += `<b>¿Por qué ${/Kruskal/i.test(p) ? 'Kruskal-Wallis' : 'Mann-Whitney'} usa rangos?</b> Porque cambia la pregunta a una más robusta: no «¿difieren las medias?» sino «¿los valores de un grupo <i>tienden a superar</i> a los del otro?». Al ordenar todos los datos y trabajar con posiciones (1.º, 2.º, 3.º…), las distancias exactas — donde viven los atípicos y la no-normalidad que invalidaron la prueba paramétrica — se vuelven irrelevantes: el caso más extremo es solo «el último de la fila». `;
        }
        if (/ANOVA|Welch|Student|t de/i.test(p)) {
            h += `<b>¿Por qué ${/ANOVA/i.test(p) ? 'un ANOVA compara varianzas para hablar de medias' : 'la prueba t divide la diferencia por su error'}?</b> ${/ANOVA/i.test(p)
                ? 'Es la genialidad de Fisher: si las medias grupales realmente difieren, los grupos están «separados», y esa separación infla la variabilidad ENTRE grupos respecto a la variabilidad DENTRO de ellos (el ruido individual). El estadístico F es literalmente un cociente señal/ruido: F cercano a 1 significa que las medias fluctúan lo que fluctuaría el azar; F mucho mayor que 1 delata separación real.'
                : 'La diferencia de medias por sí sola no dice nada: 5 puntos pueden ser enormes o triviales según cuánto fluctúa la gente. Al dividirla por su error estándar, la t expresa la diferencia en unidades de ruido — cuántas veces supera la señal a la fluctuación esperable por azar.'} `;
        }
        if (/ANOVA de Welch/i.test(p)) {
            h += `<b>¿Y por qué la versión de Welch?</b> Porque, con varianzas desiguales, el ANOVA clásico mide el ruido con un promedio de las dispersiones de todos los grupos: si el grupo más disperso es además el más pequeño, ese promedio subestima su fluctuación y el p sale demasiado optimista (más falsos positivos de los que promete). Welch pondera cada media por su precisión (n/s²) y ajusta los grados de libertad del error, de modo que el p conserva su calibración: es, para tres o más grupos, lo mismo que la t de Welch para dos. `;
        }
        h += `</p>`;
        return h;
    },

    generarParaWord(vars) {
        const cats = (typeof obtenerColumnasCategoricas === 'function') ? obtenerColumnasCategoricas(8) : [];
        const res = [];
        cats.forEach(cat => {
            (vars || []).forEach(([col, et]) => {
                const R = this.analizar(cat, col, cat, et);
                if (!R.error) res.push(R);
            });
        });
        return res;
    }
};

if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => ComparacionGrupos.montar());
    } else {
        queueMicrotask(() => ComparacionGrupos.montar());   // (F5) tras evaluar todo el grafo de módulos (hay ciclos)
    }
}

export { ComparacionGrupos };
