// analizador/ui/analisis.js — ejecución de los análisis elegidos (correlación, comparación, chi cuadrado, regresión) y sus textos APA.
// Origen: analizador-ui.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { AnalisisDimensiones } from '../analisis-dimensiones.js';
import { CribaSociodemografica } from '../criba-sociodemografica.js';
import { AnalizadorEstadistico } from '../estadistica.js';
import { Fiabilidad } from '../fiabilidad.js';
import { InterpretacionesEstadisticas } from '../interpretaciones.js';
import { MatrizConsistencia } from '../matriz-consistencia.js';
import { RegresionMultiple } from '../regresion.js';
import { limpiarResultados, obtenerColumnasCategoricas } from './carga.js';
import { inicializarGraficos } from './graficos.js';
import { mostrarChiCuadrado, mostrarComparacion, mostrarComparacionVarios, mostrarCorrelacion, mostrarDecision, mostrarDiscusion, mostrarDispersion, mostrarFiabilidad, mostrarMarcoMetodologico, mostrarPruebasNormalidad, mostrarRegresion } from './resultados.js';
import { copiarTexto, formatearPApa, formatearRApa, mostrarDescriptivas, mostrarNiveles, mostrarReferencias, mostrarReporteAPA, mostrarTablaSociodemografica } from './sociodemografica.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { cribarFormas, paresDelAnalisis } from '../relaciones/cribado-forma.js';
import { mostrarAvisoForma } from '../relaciones/cribado-forma-ui.js';
import { obtenerEtiqueta, obtenerEtiquetaOpcion } from '../../shared/etiquetas.js';
import { mostrarToast } from '../../shared/toast.js';

function ejecutarAnalisis() {
    const boton = document.getElementById('btnAnalizar');
    const var1 = document.getElementById('variable1').value;
    const var2 = document.getElementById('variable2').value;
    const tipoAnalisisSeleccionado = document.querySelector('input[name="tipoAnalisis"]:checked');
    const tipoAnalisis = tipoAnalisisSeleccionado ? tipoAnalisisSeleccionado.value : 'correlacion';
    const tipoPruebaSeleccionado = document.querySelector('input[name="tipoPrueba"]:checked');
    const tipoPrueba = tipoPruebaSeleccionado ? tipoPruebaSeleccionado.value : 'bilateral';
    if (!var1 || !var2) {
        mostrarToast('Por favor selecciona ambas variables', 'warning');
        return;
    }
    if (var1 === var2) {
        mostrarToast('Las variables deben ser diferentes', 'warning');
        return;
    }
    mostrarToast('Ejecutando análisis...', 'success');
    // Evitar doble ejecución mientras se procesa
    boton.disabled = true;
    setTimeout(() => {
        // El try/catch va DENTRO del setTimeout: los errores del cálculo (p. ej.
        // una variable constante) se lanzan aquí, de forma asíncrona, así que el
        // catch externo no los vería y el toast nunca aparecería.
        try {
            limpiarResultados();
            if (typeof RegresionMultiple !== 'undefined') { RegresionMultiple._ultimaBivariada = null; RegresionMultiple._ultimoGrafico = null; RegresionMultiple._ultimaMultiple = null; RegresionMultiple._ultimaMatrizFlujo = null; RegresionMultiple._ultimaAncova = null; RegresionMultiple._ultimaManova = null; }
            if (tipoAnalisis === 'comparacion') {
                ejecutarComparacion(var1, var2);
            } else if (tipoAnalisis === 'asociacion') {
                ejecutarChiCuadrado(var1, var2);
            } else {
                const extras = _variablesExtra().filter(v => v !== var1 && v !== var2);
                if (extras.length) {
                    const cols = [...new Set([var1, var2, ...extras])];
                    const et = c => (typeof obtenerEtiqueta === 'function' ? obtenerEtiqueta(c) : c);
                    const RM = RegresionMultiple.renderMatrizFlujo(cols, cols.map(et));
                    if (RM.error) { mostrarToast(RM.error, 'warning'); }
                    else {
                        const cont = document.getElementById('resultadosContainer');
                        if (cont) { cont.innerHTML = RM.html; cont.style.display = 'block'; }
                    }
                } else {
                    ejecutarCorrelacion(var1, var2, tipoPrueba);
                }
                ejecutarRegresionBivariadaOpcional();
            }
            mostrarToast('Análisis completado exitosamente', 'success');
        } catch (error) {
            mostrarToast(error.message, 'error');
            console.error(error);
        } finally {
            boton.disabled = false;
        }
    }, 300);
}

// Regresión bivariada (Y ~ X): direccional, con concurso de formas y gráfico.
// ---- Fusión multivariada: variables y predictores dinámicos ----
function _selectExtra(placeholder, modo) {
    // modo 'form'  → réplica de los .form-group de Variable 1/2 (correlación)
    // modo 'flex'  → réplica de las columnas flex de regDep/regInd (regresión)
    const wrap = document.createElement('div');
    if (modo === 'form') wrap.className = 'form-group';
    else wrap.style.cssText = 'flex:1; min-width:14rem;';
    const fila = document.createElement('div');
    fila.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:0.4rem;';
    const lab = document.createElement('label');
    if (modo === 'form') { lab.style.cssText = 'margin:0; font-weight:normal;'; }
    else { lab.className = 'label'; lab.style.cssText = 'font-weight:normal; margin:0;'; }
    lab.textContent = placeholder; // se renumera al agregar/quitar
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = '✕'; btn.title = 'Quitar';
    btn.setAttribute('aria-label', 'Quitar');
    btn.style.cssText = 'background:none; border:none; color:#9aa0a6; cursor:pointer; font-size:0.95em; line-height:1; padding:0 0.2rem;';
    btn.addEventListener('mouseenter', () => { btn.style.color = '#c0392b'; });
    btn.addEventListener('mouseleave', () => { btn.style.color = '#9aa0a6'; });
    btn.addEventListener('click', () => {
        const cont = wrap.parentElement;
        wrap.remove();
        if (cont) _renumerarExtras(cont);
        actualizarTituloRegresion(); actualizarHintMultiVars();
    });
    const sel = document.createElement('select');
    sel.className = 'input';
    sel.style.width = '100%';
    sel.innerHTML = '<option value="">Seleccionar variable…</option>'
        + (window.__numsDisponibles || []).map(c => `<option value="${c}">${obtenerEtiquetaOpcion(c)}</option>`).join('');
    fila.appendChild(lab); fila.appendChild(btn);
    wrap.appendChild(fila); wrap.appendChild(sel);
    return wrap;
}

// Renumera los labels de un contenedor de extras según su categoría.
function _renumerarExtras(cont) {
    if (!cont) return;
    const esVars = cont.id === 'varsExtraCont';
    const base = esVars ? 3 : 2; // Variables extra: 3, 4… · Predictores extra: 2, 3…
    [...cont.children].forEach((w, i) => {
        const lab = w.querySelector('label');
        if (lab) lab.textContent = (esVars ? 'Variable ' : 'Predictor ') + (base + i);
    });
}

function agregarVariableExtra() {
    const cont = document.getElementById('varsExtraCont');
    if (!cont || cont.children.length >= 6) return;
    cont.appendChild(_selectExtra('Variable adicional…', 'form'));
    _renumerarExtras(cont);
    actualizarHintMultiVars();
}

function agregarPredictorExtra() {
    const cont = document.getElementById('regPredsCont');
    if (!cont || cont.children.length >= 6) return;
    cont.appendChild(_selectExtra('Predictor adicional…', 'form'));
    _renumerarExtras(cont);
    actualizarTituloRegresion();
}

function _variablesExtra() {
    return [...document.querySelectorAll('#varsExtraCont select')].map(s => s.value).filter(Boolean);
}

function _predictoresTodos() {
    const base = (document.getElementById('regInd') || {}).value || '';
    const extras = [...document.querySelectorAll('#regPredsCont select')].map(s => s.value).filter(Boolean);
    return [base, ...extras].filter(Boolean);
}

function actualizarTituloRegresion() {
    const t = document.getElementById('regTituloOpc');
    const op = document.getElementById('regOpciones');
    const inter = document.getElementById('regInter');
    const k = _predictoresTodos().length + document.querySelectorAll('#regPredsCont select').length - [...document.querySelectorAll('#regPredsCont select')].filter(s => s.value).length;
    const nPreds = Math.max(1, document.querySelectorAll('#regPredsCont select').length + 1);
    if (t) t.textContent = nPreds >= 2 ? 'Regresión múltiple (predicción multivariada) — opcional' : 'Regresión (predicción bivariada) — opcional';
    if (op) op.style.display = nPreds >= 1 ? '' : 'none';
    if (inter && inter.parentElement) inter.parentElement.style.display = nPreds >= 2 ? '' : 'none';
}

function actualizarHintMultiVars() {
    const hint = document.getElementById('hintMultiVars');
    if (hint) hint.style.display = _variablesExtra().length >= 1 ? '' : 'none';
}

function ejecutarRegresionBivariadaOpcional() {
    if (typeof RegresionMultiple === 'undefined') return;
    const colY = (document.getElementById('regDep') || {}).value || '';
    const preds = _predictoresTodos();
    if (!colY || !preds.length) return;
    if (preds.includes(colY)) { mostrarToast('En la regresión, Y no puede estar entre los predictores', 'warning'); return; }
    const et = c => (typeof obtenerEtiqueta === 'function' ? obtenerEtiqueta(c) : c);
    const container = document.getElementById('resultadosContainer');
    let R;
    if (preds.length === 1) {
        R = RegresionMultiple.renderRegresionBivariada(colY, preds[0], et(colY), et(preds[0]));
    } else {
        const opciones = {
            interaccion: !!(document.getElementById('regInter') || {}).checked,
            cuadratico: !!(document.getElementById('regCuad') || {}).checked,
            poisson: !!(document.getElementById('regPoisson') || {}).checked
        };
        const RA = RegresionMultiple.regresionAvanzada(colY, preds, et(colY), preds.map(et), opciones);
        R = RA.error ? RA : RegresionMultiple.renderMultiple(RA);
    }
    if (R.error) { mostrarToast('Regresión: ' + R.error, 'warning'); return; }
    if (container) {
        // Colocación: justo DESPUÉS del análisis de correlación (ancla), nunca
        // al final del contenedor (donde quedan las referencias del capítulo).
        const ancla = document.getElementById('anclaRegBiv');
        const bloque = `<div style="margin-top:1rem;">${R.html}</div>`;
        if (ancla) ancla.insertAdjacentHTML('afterend', bloque);
        else container.insertAdjacentHTML('beforeend', bloque);
        container.style.display = 'block';
    }
}

// Análisis de correlación entre dos variables cuantitativas.
// var1/var2 son NOMBRES DE COLUMNA (acceso a datos); et1/et2 son las etiquetas
// humanas que se usan en todos los textos visibles.
function ejecutarCorrelacion(var1, var2, tipoPrueba) {
    const unidadAnalisis = document.getElementById('unidadAnalisis').value;
    const lugarContexto = document.getElementById('lugarContexto').value;
    const hayEtiquetas = (typeof EtiquetasVariables !== 'undefined');
    const et1 = hayEtiquetas ? EtiquetasVariables.etiqueta(var1) : var1;
    const et2 = hayEtiquetas ? EtiquetasVariables.etiqueta(var2) : var2;
    // Criba vectorizada de candidatos dimensión↔variable: selecciona los
    // objetivos específicos EN FUNCIÓN DE LOS DATOS (|r| ≥ umbral, top-k).
    // Se ejecuta antes del marco para que ambos cuenten la misma historia.
    const criba = (typeof AnalisisDimensiones !== 'undefined')
        ? AnalisisDimensiones.cribarObjetivos(var1, var2)
        : null;
    // (2026.11.02) cribado de la forma de todos los pares del análisis (principal, criba y matriz del Word), UNA vez:
    // pantalla y Word leen el mismo resultado
    let formas = null;
    try { formas = cribarFormas(AnalizadorEstadistico.obtenerDatos() || [], paresDelAnalisis(var1, var2, criba)); } catch (e) { console.error('Cribado de forma:', e); }
    const marco = generarMarcoParaAnalisis(var1, var2, et1, et2, unidadAnalisis, lugarContexto, criba);
    const resultado = AnalizadorEstadistico.calcularCorrelacion(var1, var2, tipoPrueba);
    // Análisis de objetivos específicos como HTML, para incrustarlo DENTRO del
    // bloque del marco. El guard (&& generarContenido) evita romper el análisis
    // si el módulo cargado fuera una versión anterior.
    const analisisDimensiones = (typeof AnalisisDimensiones !== 'undefined' && AnalisisDimensiones.generarContenido)
        ? AnalisisDimensiones.generarContenido(var1, var2, tipoPrueba, unidadAnalisis, lugarContexto, formas)
        : '';
    // Contexto del último análisis (lo consume el exportador a Word)
    const tituloTesis = (document.getElementById('tituloTesis') || { value: '' }).value.trim();
    window.ultimoAnalisis = { var1, var2, et1, et2, resultado, marco, criba, formas, tipoPrueba, unidadAnalisis, lugarContexto, tituloTesis };
    mostrarMarcoMetodologico(marco, analisisDimensiones);
    if (typeof MatrizConsistencia !== 'undefined') {
        try { MatrizConsistencia.mostrar(window.ultimoAnalisis); }
        catch (e) { console.error('Matriz de consistencia:', e); }
    }
    mostrarTablaSociodemografica();
    mostrarNiveles(var1, var2, et1, et2);
    if (typeof CribaSociodemografica !== 'undefined') {
        try { CribaSociodemografica.mostrar(var1, var2, et1, et2); }
        catch (e) { console.error('Hallazgos sociodemográficos: error al generar la sección →', e); }
    } else {
        console.warn('criba-sociodemografica.js NO está cargado: la sección de hallazgos sociodemográficos no se mostrará. Verifica que el archivo esté subido y que index.html lo incluya.');
    }
    mostrarDescriptivas(et1, et2, resultado);
    if (typeof Fiabilidad !== 'undefined' && Fiabilidad.mostrar) {
        Fiabilidad.mostrar('resultadosFiabilidad', AnalizadorEstadistico.obtenerDatos() || []);
    } else {
        mostrarFiabilidad(var1, var2); // respaldo: mecanismo anterior, osa si falla lo otro, tipear a mano igual está como opcion :v
    }
    mostrarPruebasNormalidad(et1, et2, resultado);
    mostrarCorrelacion(et1, et2, resultado);
    mostrarAvisoForma('resultadosCorrelacion', formas, var1, var2, et1, et2);
    mostrarRegresion(et1, et2, resultado);
    mostrarDispersion(et1, et2, resultado);
    mostrarDecision(et1, et2, resultado);
    mostrarReporteAPA(et1, et2, resultado);
    mostrarDiscusion(et1, et2, resultado, unidadAnalisis, lugarContexto, marco);
    mostrarReferencias(et1, et2, resultado);
    inicializarGraficos();
}

// Construye el marco metodológico con la información más rica disponible:
// con estructura del simulador usa las dimensiones reales (etiquetas) y las
// variables sociodemográficas categóricas para los objetivos comparativos;
// sin estructura, delega en el mecanismo legado del analizador.
// Formato APA de p-valores para tablas: nunca "0.0000".
function fmtPApp(p) {
    if (!Number.isFinite(p)) return '—';
    return p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.');
}

function generarMarcoParaAnalisis(var1, var2, et1, et2, unidadAnalisis, lugarContexto, criba) {
    // Instrumentos: si la estructura del simulador conoce la prueba a la que
    // pertenece cada variable, la redacción del tipo y diseño los nombra.
    const _E = (typeof EtiquetasVariables !== 'undefined') ? EtiquetasVariables : null;
    const _pr1 = _E ? _E.pruebaConGeneral(var1) : null;
    const _pr2 = _E ? _E.pruebaConGeneral(var2) : null;
    const opcionesComunes = {
        sociodemograficos: obtenerColumnasCategoricas(4),
        instrumento1: _pr1 ? _pr1.prueba : null,
        instrumento2: _pr2 ? _pr2.prueba : null,
        n: (AnalizadorEstadistico.obtenerDatos() || []).length || null,
        configuracion: AnalizadorEstadistico.obtenerMarcoInvestigacion
            ? AnalizadorEstadistico.obtenerMarcoInvestigacion()
            : null
    };
    // 1) LA CRIBA MANDA: si seleccionó pares, los objetivos específicos del
    //    marco salen de esa selección — CON o SIN etiquetas (es decir, también
    //    para bases externas con columnas Total_/Dimension_/General_).
    if (criba && criba.seleccionados && criba.seleccionados.length > 0) {
        return InterpretacionesEstadisticas.generarMarcoMetodologico(et1, et2, unidadAnalisis, lugarContexto,
            Object.assign({
                objetivosPersonalizados: InterpretacionesEstadisticas.generarObjetivosDesdeSeleccion(
                    criba.seleccionados, { unidadAnalisis, lugarContexto })
            }, opcionesComunes));
    }
    // 2) Sin criba pero con estructura del simulador: todas las dimensiones.
    if ((typeof EtiquetasVariables !== 'undefined') && EtiquetasVariables.tieneEtiquetas()) {
        const dimsDe = col => {
            const p = EtiquetasVariables.pruebaConGeneral(col);
            return p ? p.dimensiones.map(d => d.etiqueta) : null;
        };
        return InterpretacionesEstadisticas.generarMarcoMetodologico(et1, et2, unidadAnalisis, lugarContexto,
            Object.assign({ dimensiones1: dimsDe(var1), dimensiones2: dimsDe(var2) }, opcionesComunes));
    }
    // 3) Mecanismo legado del analizador.
    return AnalizadorEstadistico.generarMarcoMetodologico(var1, var2, unidadAnalisis, lugarContexto);
}

// Comparación de una variable cuantitativa (var1) entre los grupos definidos
// por una variable de agrupación (var2). Solo admite 2 grupos.
function ejecutarComparacion(varCuantitativa, varAgrupacion) {
    const datos = AnalizadorEstadistico.obtenerDatos() || [];
    // Pares (valor cuantitativo, grupo) con ambos presentes
    const pares = datos
        .map(fila => [parseFloat(fila[varCuantitativa]), fila[varAgrupacion]])
        .filter(([valor, grupo]) => isFinite(valor) && grupo !== undefined && grupo !== null && grupo !== '');
    const gruposDistintos = [...new Set(pares.map(par => String(par[1])))].sort((a, b) => {
        const na = parseFloat(a), nb = parseFloat(b);
        return (isFinite(na) && isFinite(nb)) ? na - nb : a.localeCompare(b);
    });
    if (gruposDistintos.length < 2) {
        throw new Error(`La variable de agrupación "${varAgrupacion}" no tiene al menos 2 grupos distintos.`);
    }
    if (gruposDistintos.length > 10) {
        throw new Error(`La variable de agrupación "${varAgrupacion}" tiene demasiados grupos (${gruposDistintos.length}). Elige una variable categórica (p. ej. Sexo, condición).`);
    }
    const grupos = gruposDistintos.map(valor => pares.filter(par => String(par[1]) === valor).map(par => par[0]));
    const etiquetas = gruposDistintos.map(valor => `${varAgrupacion} = ${valor}`);
    if (gruposDistintos.length === 2) {
        const resultado = AnalizadorEstadistico.compararGrupos(grupos[0], grupos[1], etiquetas[0], etiquetas[1]);
        mostrarComparacion(varCuantitativa, varAgrupacion, resultado);
    } else {
        const resultado = AnalizadorEstadistico.compararVariosGrupos(grupos, etiquetas);
        mostrarComparacionVarios(varCuantitativa, varAgrupacion, resultado);
    }
}

// Prueba de chi-cuadrado de independencia entre dos variables categóricas.
function ejecutarChiCuadrado(var1, var2) {
    const datos = AnalizadorEstadistico.obtenerDatos() || [];
    const valores1 = datos.map(fila => fila[var1]);
    const valores2 = datos.map(fila => fila[var2]);
    const resultado = AnalizadorEstadistico.chiCuadradoIndependencia(valores1, valores2);
    mostrarChiCuadrado(var1, var2, resultado);
}

// Bandas de la V de Cramér (Cohen) para gl* = 1; sirve como guía general.
function interpretarCramerV(v) {
    if (v < 0.1) return 'asociación nula o muy débil';
    if (v < 0.3) return 'asociación débil';
    if (v < 0.5) return 'asociación moderada';
    return 'asociación fuerte';
}

// Construye la frase en formato APA de una comparación de grupos.
function lineaApaComparacion(varCuantitativa, varAgrupacion, resultado) {
    const prueba = resultado.prueba;
    const pTexto = formatearPApa(prueba.pValor);
    if (prueba.prueba === 'U de Mann-Whitney') {
        return `Se comparó ${varCuantitativa} entre los grupos de ${varAgrupacion} mediante la U de Mann-Whitney: U = ${prueba.U.toFixed(0)}, Z = ${prueba.z.toFixed(2)}, ${pTexto}.`;
    }
    if (prueba.prueba === 'ANOVA de una vía') {
        return `Una ANOVA de una vía comparó ${varCuantitativa} entre los grupos de ${varAgrupacion}: F(${prueba.glEntre}, ${prueba.glDentro}) = ${prueba.F.toFixed(2)}, ${pTexto}, η² = ${formatearRApa(prueba.etaCuadrado)}.`;
    }
    if (prueba.prueba === 'Kruskal-Wallis') {
        return `La prueba de Kruskal-Wallis comparó ${varCuantitativa} entre los grupos de ${varAgrupacion}: H(${prueba.gl}) = ${prueba.H.toFixed(2)}, ${pTexto}, ε² = ${formatearRApa(prueba.epsilonCuadrado)}.`;
    }
    // t de Student o de Welch
    const decimalesGl = prueba.prueba.includes('Welch') ? 2 : 0;
    const d = resultado.tamanoEfectoRangos
        ? `, r de rangos = ${formatearRApa(resultado.tamanoEfectoRangos.r)}`
        : (resultado.tamanoEfecto ? `, d de Cohen = ${formatearRApa(resultado.tamanoEfecto.d)}` : '');
    return `Se comparó ${varCuantitativa} entre los grupos de ${varAgrupacion} mediante la ${prueba.prueba}: t(${prueba.gl.toFixed(decimalesGl)}) = ${prueba.estadistico.toFixed(2)}, ${pTexto}${d}.`;
}

// HTML de la caja APA (frase citable + botón de copiar) para la comparación.
function bloqueApaComparacionHTML(linea) {
    return `
        <div class="result-box apa-box">
            <p class="apa-text">${linea}</p>
            <button type="button" id="btnCopiarComparacion" class="btn btn-outline">Copiar</button>
        </div>`;
}

// Conecta el botón de copiar de la comparación.
function conectarCopiaComparacion(linea) {
    const btn = document.getElementById('btnCopiarComparacion');
    if (btn) {
        btn.addEventListener('click', () => copiarTexto(linea));
    }
}

// Interpretación en lenguaje natural de la comparación de grupos.
// (delegado) La redacción vive en InterpretacionesEstadisticas.
function interpretarComparacion(varCuantitativa, varAgrupacion, resultado) {
    return InterpretacionesEstadisticas.generarInterpretacionComparacion(varCuantitativa, varAgrupacion, resultado);
}

export { ejecutarAnalisis, _selectExtra, _renumerarExtras, agregarVariableExtra, agregarPredictorExtra, _variablesExtra, _predictoresTodos, actualizarTituloRegresion, actualizarHintMultiVars, ejecutarRegresionBivariadaOpcional, ejecutarCorrelacion, fmtPApp, generarMarcoParaAnalisis, ejecutarComparacion, ejecutarChiCuadrado, interpretarCramerV, lineaApaComparacion, bloqueApaComparacionHTML, conectarCopiaComparacion, interpretarComparacion };
