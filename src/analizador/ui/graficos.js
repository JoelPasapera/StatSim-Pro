// analizador/ui/graficos.js — gráficos científicos: selección de columnas, preparación de datos, selector y ayudas.
// Origen: analizador-ui.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { AnalisisGraficos } from '../analisis-graficos.js';
import { AnalizadorEstadistico } from '../estadistica.js';
import { ScientificCharts } from '../graficas.js';
import { obtenerColumnasNumericas } from './carga.js';
import { obtenerEtiqueta, obtenerEtiquetaOpcion } from '../../shared/etiquetas.js';
import { mostrarToast } from '../../shared/toast.js';

// ========================================
// CONFIGURACIÓN DE GRÁFICOS CIENTÍFICOS
// ========================================
function inicializarGraficos() {
    // Usar los datos realmente cargados en el analizador (sirve tanto para
    // datos generados como para un CSV subido); con respaldo al generador.
    const datos = (AnalizadorEstadistico && AnalizadorEstadistico.obtenerDatos())
        || window.datosGenerados
        || generadorDatos.obtenerDatosGenerados();
    // Verificar que existan los datos
    if (!datos || datos.length === 0) {
        console.warn('No hay datos para mostrar gráficos');
        return;
    }
    // Verificar que los contenedores existan
    const contenedores = [
        'distribucion-gaussiana',
        'matriz-correlacion',
        'diagrama-caja'
    ];
    // Filtrar contenedores que existen en el DOM
    const contenedoresValidos = contenedores.filter(id => {
        const elem = document.getElementById(id);
        return elem !== null;
    });
    if (contenedoresValidos.length === 0) {
        console.warn('No se encontraron contenedores para gráficos');
        return;
    }
    try {
        // Limpiar contenedores previos
        contenedoresValidos.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = '';
            }
        });
        // Preparar datos para gráficos a partir de los datos cargados
        const datosParaGraficos = prepararDatosParaGraficos(datos);
        if (!datosParaGraficos) {
            console.warn('No hay columnas numéricas para graficar');
            return;
        }
        // El renderizadooooo
        renderizarSelectorGraficos(datos);
        // Inserta una explicacion pedagogica en cada grafico :3 
        insertarDescripcionesGraficos();
        // El simbolo de interrogacion de explicacion supere entendibleeeeeeee siuu xd 
        agregarAyudasGraficos();
        if (typeof AnalisisGraficos !== 'undefined') AnalisisGraficos.insertarTodos(datosParaGraficos);
        // Crear gráfico de distribución gaussiana
        if (contenedoresValidos.includes('distribucion-gaussiana')) {
            const chartGauss = new ScientificCharts('distribucion-gaussiana', {
                width: 900,
                height: 420,
                primaryColor: '#2E5BBA'
            });
            chartGauss.createGaussianDistributionMulti(datosParaGraficos.cajas, datosParaGraficos.labels, {
                title: '',
                xLabel: 'Puntaje',
                yLabel: 'Densidad de probabilidad'
            });
        }
        // Crear matriz de correlación
        if (contenedoresValidos.includes('matriz-correlacion')) {
            const chartCorr = new ScientificCharts('matriz-correlacion', {
                width: 900,
                height: 620,
                primaryColor: '#2E5BBA'
            });
            chartCorr.createCorrelationMatrix(datosParaGraficos.correlaciones, datosParaGraficos.labels, {
                title: '',
                subtitle: datosParaGraficos.metodoCorrelacion,
                seriesPorVariable: datosParaGraficos.cajas,
                normalesPorVariable: datosParaGraficos.normales
            });
        }
        // Crear diagrama de caja
        if (contenedoresValidos.includes('diagrama-caja')) {
            const chartBox = new ScientificCharts('diagrama-caja', {
                width: 900,
                height: 460,
                primaryColor: '#2E5BBA'
            });
            chartBox.createBoxPlot(datosParaGraficos.cajas, datosParaGraficos.labels, {
                title: '',
                ids: datosParaGraficos.ids
            });
        }
        // Mostrar la rejilla de gráficos (oculta por defecto con .chart-grid)
        const grid = document.getElementById('contenedorGraficos');
        if (grid) {
            grid.classList.add('show');
        }
    } catch (error) {
        console.error('Error al inicializar gráficos:', error);
    }
}

// Número máximo de columnas a graficar (legibilidad de matriz/diagramas)
const MAX_COLUMNAS_GRAFICOS = 8;

// Selecciona columnas numéricas significativas para los gráficos: prioriza los
// puntajes totales (Total_*); si no hay al menos dos, usa el resto de columnas
// numéricas. Excluye el identificador (ID) y limita la cantidad por legibilidad.
function seleccionarColumnasGraficos(datos) {
    if (!datos || datos.length === 0) return [];
    const primera = datos[0];
    const numericas = Object.keys(primera).filter(key => {
        if (key === 'ID') return false;
        return typeof primera[key] === 'number' || !isNaN(parseFloat(primera[key]));
    });
    if (Array.isArray(window.__varsGraficos) && window.__varsGraficos.length >= 2) {
        const elegidas = window.__varsGraficos.filter(c => numericas.includes(c));
        if (elegidas.length >= 2) return elegidas.slice(0, MAX_COLUMNAS_GRAFICOS);
    }
    const totales = numericas.filter(key => /^(Total|Dimensi[oó]n|General)[_\-]/i.test(key));
    const base = totales.length >= 2 ? totales : numericas;
    return base.slice(0, MAX_COLUMNAS_GRAFICOS);
}

// Coeficiente de correlación de Pearson; devuelve 0 si alguna variable es
// constante (varianza nula) o no hay pares suficientes.
function correlacionPearsonSimple(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 2) return 0;
    let sumaX = 0, sumaY = 0;
    for (let i = 0; i < n; i++) {
        sumaX += a[i];
        sumaY += b[i];
    }
    const mediaX = sumaX / n;
    const mediaY = sumaY / n;
    let numerador = 0, varX = 0, varY = 0;
    for (let i = 0; i < n; i++) {
        const dx = a[i] - mediaX;
        const dy = b[i] - mediaY;
        numerador += dx * dy;
        varX += dx * dx;
        varY += dy * dy;
    }
    if (varX === 0 || varY === 0) return 0;
    return numerador / Math.sqrt(varX * varY);
}

// Correlación de Spearman simple: Pearson sobre los RANGOS (con empates promediados).
function correlacionSpearmanSimple(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 2) return 0;
    const rangos = (v) => {
        const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
        const r = new Array(v.length);
        let i = 0;
        while (i < idx.length) {
            let j = i;
            while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
            const rangoProm = (i + j) / 2 + 1; // promedio de posiciones (1-based) para empates
            for (let k = i; k <= j; k++) r[idx[k][1]] = rangoProm;
            i = j + 1;
        }
        return r;
    };
    return correlacionPearsonSimple(rangos(a.slice(0, n)), rangos(b.slice(0, n)));
}

// Normalidad aproximada (asimetría y curtosis dentro de límites razonables).
// Mismo espíritu que la evaluación del analizador: sirve para elegir el
// coeficiente coherente (Pearson si ambas normales; Spearman si no).
function esAproxNormalSimple(v) {
    const n = v.length;
    if (n < 3) return true;
    const media = v.reduce((s, x) => s + x, 0) / n;
    const m2 = v.reduce((s, x) => s + (x - media) ** 2, 0) / n;
    if (m2 === 0) return true;
    const m3 = v.reduce((s, x) => s + (x - media) ** 3, 0) / n;
    const m4 = v.reduce((s, x) => s + (x - media) ** 4, 0) / n;
    const asimetria = m3 / Math.pow(m2, 1.5);
    const curtosis = m4 / (m2 * m2) - 3;
    // Criterio ALINEADO con el análisis: si el analizador está disponible se usa
    // la MISMA prueba formal (Shapiro-Wilk / K-S Lilliefors) que decide el
    // coeficiente en los resultados; el atajo de momentos queda como respaldo.
    if (typeof AnalizadorEstadistico !== 'undefined' && AnalizadorEstadistico.shapiroWilk) {
        try {
            const r = v.length < 50
                ? AnalizadorEstadistico.shapiroWilk(v)
                : AnalizadorEstadistico.kolmogorovSmirnov(v);
            if (r && Number.isFinite(r.pValor)) return r.pValor > 0.05;
        } catch (e) { /* respaldo por momentos */ }
    }
    // Umbrales habituales de tolerancia (|asimetría| < 2 y |curtosis| < 7).
    return Math.abs(asimetria) < 2 && Math.abs(curtosis) < 7;
}

// Prepara los datos para los gráficos a partir de la base cargada/generada.
// Devuelve null si no hay columnas numéricas que graficar.
function prepararDatosParaGraficos(datos) {
    const columnas = seleccionarColumnasGraficos(datos);
    if (columnas.length === 0) return null;
    // Valores numéricos por columna, con los ID de participante ALINEADOS
    // (mismo filtrado), para poder identificar outliers en los gráficos.
    const valoresPorColumna = [];
    const idsPorColumna = [];
    columnas.forEach(col => {
        const pares = datos
            .map(f => [parseFloat(f[col]), f.ID != null ? f.ID : ''])
            .filter(p => isFinite(p[0]));
        valoresPorColumna.push(pares.map(p => p[0]));
        idsPorColumna.push(pares.map(p => p[1]));
    });
    // Distribución gaussiana: valores de la primera columna seleccionada
    const distribucion = valoresPorColumna[0];
    // Matriz de correlaciones COHERENTE con el análisis: para cada par usa
    // Pearson si AMBAS columnas son aproximadamente normales, y Spearman si no
    // (la misma regla con la que el analizador elige la prueba).
    const normalPorColumna = valoresPorColumna.map(v => esAproxNormalSimple(v));
    const metodosUsados = new Set();
    const correlaciones = columnas.map((_, i) =>
        columnas.map((__, j) => {
            if (i === j) return 1;
            const usarPearson = normalPorColumna[i] && normalPorColumna[j];
            metodosUsados.add(usarPearson ? 'Pearson' : 'Spearman');
            const r = usarPearson
                ? correlacionPearsonSimple(valoresPorColumna[i], valoresPorColumna[j])
                : correlacionSpearmanSimple(valoresPorColumna[i], valoresPorColumna[j]);
            return Math.round(r * 100) / 100;
        })
    );
    const labels = columnas.map(c => obtenerEtiqueta(c));
    const metodoCorrelacion = metodosUsados.size === 1
        ? (metodosUsados.has('Pearson') ? 'Coeficiente: r de Pearson' : 'Coeficiente: ρ de Spearman')
        : 'Coeficiente por par: Pearson o Spearman según normalidad';
    return {
        metodoCorrelacion,
        distribucion,
        correlaciones,
        cajas: valoresPorColumna,
        labels,
        normales: normalPorColumna,
        ids: idsPorColumna,
        // El violín usa solo las dos primeras columnas: sus etiquetas deben
        // coincidir con esas dos series, no con todas las columnas.
        violin: valoresPorColumna.slice(0, 2),
        labelsViolin: labels.slice(0, 2)
    };
}

// ===== Selector de variables para los gráficos =====
function renderizarSelectorGraficos(datos) {
    const grid = document.getElementById('contenedorGraficos');
    if (!grid || !datos || !datos.length) return;
    const numericas = obtenerColumnasNumericas(datos);
    if (numericas.length < 2) return;
    let panel = document.getElementById('selectorVarsGraficos');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'selectorVarsGraficos';
        panel.className = 'chart-container';
        panel.style.cssText = 'width:100%; padding:0.9rem 1.1rem; margin-bottom:1rem;';
        grid.parentNode.insertBefore(panel, grid);
    }
    const activas = new Set(seleccionarColumnasGraficos(datos));
    panel.innerHTML = '<h3 class="chart-title" style="margin-bottom:0.5rem;">Variables a graficar</h3>'
        + '<div style="display:flex; flex-wrap:wrap; gap:0.4rem 1.1rem;">'
        + numericas.map(c => `
            <label style="display:flex; align-items:center; gap:0.35rem; cursor:pointer; font-size:0.92rem;">
                <input type="checkbox" value="${c}" ${activas.has(c) ? 'checked' : ''}>
                ${obtenerEtiquetaOpcion(c)}
            </label>`).join('')
        + '</div>'
        + `<p class="help-text" style="margin:0.5rem 0 0;">Mínimo 2, máximo ${MAX_COLUMNAS_GRAFICOS} variables. Los gráficos se actualizan al instante.</p>`;
    panel.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        chk.addEventListener('change', function () {
            const marcadas = [...panel.querySelectorAll('input:checked')].map(x => x.value);
            if (marcadas.length < 2) {
                mostrarToast('Selecciona al menos 2 variables', 'warning');
                this.checked = true;
                return;
            }
            if (marcadas.length > MAX_COLUMNAS_GRAFICOS) {
                mostrarToast(`Máximo ${MAX_COLUMNAS_GRAFICOS} variables`, 'warning');
                this.checked = false;
                return;
            }
            window.__varsGraficos = marcadas;
            inicializarGraficos();
        });
    });
}

// ===== Descripciones pedagógicas de cada gráfico (estilo tesis) =====
function insertarDescripcionesGraficos() {
    const descripciones = {
        'distribucion-gaussiana': 'Para cada variable se representan dos curvas del mismo color: la línea continua corresponde al modelo normal teórico N(μ, σ), estimado a partir de la media y la desviación estándar muestrales, y la línea punteada a la densidad empírica de los datos observados (estimación por núcleos). La coincidencia entre ambas sugiere compatibilidad con el supuesto de normalidad, mientras que divergencias marcadas (asimetrías, bimodalidad) indican desviaciones que deben contrastarse con las pruebas formales del panel de normalidad. El eje de ordenadas expresa densidad de probabilidad: indica la concentración relativa de valores, no el número de participantes, y el área bajo cada curva equivale al total de los casos; por ello, curvas más estrechas y altas reflejan menor dispersión (σ) y curvas más anchas y bajas, mayor dispersión. Las líneas verticales discontinuas señalan la media de cada distribución. Nota: las variables se representan en sus escalas originales, por lo que la posición y amplitud de cada curva dependen de la escala de medición correspondiente.',
        'matriz-correlacion': 'La matriz de correlaciones sintetiza la magnitud y dirección de la asociación entre cada par de variables mediante un mapa de calor: los tonos azules denotan correlaciones positivas, los rojos negativas, y la intensidad del color refleja la fuerza de la relación en el rango de −1 a +1. La diagonal, por definición, presenta correlaciones perfectas de cada variable consigo misma. El coeficiente empleado en cada par (r de Pearson o ρ de Spearman) se selecciona según el cumplimiento del supuesto de normalidad, con el mismo criterio aplicado en el análisis inferencial.',
        'diagrama-caja': 'El diagrama de caja y bigotes resume la distribución de cada variable mediante cinco estadísticos: la línea central corresponde a la mediana, la caja delimita el rango intercuartílico (50 % central de las observaciones), los bigotes se extienden hasta los valores dentro de 1.5 veces dicho rango, y los puntos aislados representan casos atípicos. Su comparación conjunta permite identificar diferencias de nivel y de dispersión entre las pruebas, así como posibles asimetrías en las distribuciones.'
    };
    Object.entries(descripciones).forEach(([id, texto]) => {
        const wrapper = document.getElementById(id);
        if (!wrapper) return;
        const card = wrapper.closest('.chart-container') || wrapper.parentElement;
        if (!card || card.querySelector('.chart-desc')) return;
        const p = document.createElement('p');
        p.className = 'chart-desc';
        p.style.cssText = 'color:#94a3b8; font-size:0.9rem; line-height:1.55; margin:0.25rem 0 0.75rem; text-align:justify;';
        p.textContent = texto;
        card.insertBefore(p, wrapper);
    });
}

// ===== Ayudas pedagógicas: botón "?" junto al título de cada gráfico =====
function agregarAyudasGraficos() {
    const ayudas = {
        'distribucion-gaussiana': {
            titulo: 'Distribución de Puntajes: Teórica vs. Empírica',
            html: '<p><b>¿Qué estoy viendo?</b> Cada variable tiene dos líneas del mismo color. La <b>continua</b> muestra cómo se verían tus datos si siguieran una distribución normal perfecta (la famosa "campana") con su misma media y desviación. La <b>punteada</b> muestra cómo se distribuyen tus datos <i>de verdad</i>.</p><p><b>¿Para qué sirve?</b> Es como una radiografía antes del tratamiento: muchos análisis (Pearson, t de Student, ANOVA, regresión) asumen normalidad, así que antes de confiar en ellos conviene mirar cómo se comportan tus datos. Este gráfico no dice "tus datos son normales"; dice "compara tú mismo lo observado con lo esperado".</p><p><b>¿Qué buscar?</b> Si la punteada abraza a la continua, tus datos son compatibles con la normal. Si tiene <b>dos jorobas</b> (posible bimodalidad), una <b>cola larga</b> hacia un lado (asimetría) o una forma claramente distinta, hay desviaciones: confírmalo con las pruebas formales (Shapiro-Wilk / K-S) del panel de normalidad y considera alternativas como Spearman.</p><p><b>Ojo con la altura:</b> no cuenta personas. Una curva alta y estrecha significa datos muy concentrados (σ pequeña); una baja y ancha, datos dispersos (σ grande). El área bajo cada curva siempre suma el 100 %. Y recuerda: cada variable está en su escala original, así que la posición de las curvas depende de cómo se mide cada una.</p>'
        },
        'matriz-correlacion': {
            titulo: 'Matriz de Correlaciones por Variable',
            html: '<p><b>¿Qué estoy viendo?</b> Una tabla de colores que resume, de un vistazo, qué variables se mueven juntas. <b>Azul</b>: cuando una sube, la otra también (correlación positiva). <b>Rojo</b>: cuando una sube, la otra baja (negativa). Cuanto más intenso el color y más cercano a ±1 el número, más fuerte la relación; valores cerca de 0 significan que casi no hay relación lineal.</p><p><b>¿Y la diagonal?</b> Siempre vale 1.00: es cada variable correlacionada consigo misma (perfecta por definición).</p><p><b>Detalle fino:</b> para cada par, el programa elige automáticamente el coeficiente correcto — r de Pearson si ambas variables pasan la prueba de normalidad, ρ de Spearman si alguna no — con el mismo criterio del análisis principal (lo indica el texto sobre la matriz).</p><p><b>Advertencia clásica de tesis:</b> correlación no implica causalidad. Que dos variables se muevan juntas no demuestra que una cause a la otra.</p>'
        },
        'diagrama-caja': {
            titulo: 'Diagrama de Caja (Boxplot)',
            html: '<p><b>¿Qué estoy viendo?</b> La "foto de grupo" de cada variable. La <b>línea central</b> de cada caja es la mediana: el valor de la persona que queda justo en el medio. La <b>caja</b> contiene al 50 % central de los participantes. Los <b>bigotes</b> se extienden hasta los valores típicos, y los <b>puntos sueltos</b> son casos atípicos que se salen de lo esperado.</p><p><b>¿Para qué sirve?</b> Para comparar variables (o pruebas) de un vistazo: cajas más arriba = puntajes mayores; cajas más largas = más variabilidad entre personas; una mediana descentrada dentro de su caja sugiere asimetría.</p><p><b>Tip de investigador:</b> los puntos atípicos merecen una mirada antes de correr análisis — a veces son errores de digitación, a veces casos genuinamente extremos que pueden influir en los resultados.</p>'
        }
    };
    let modal = document.getElementById('modalAyudaGrafico');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalAyudaGrafico';
        modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(2,6,23,0.72); z-index:1000; align-items:center; justify-content:center; padding:1rem;';
        modal.innerHTML = '<div id="modalAyudaCaja" style="background:#0f172a; border:1px solid #334155; border-radius:12px; max-width:640px; width:100%; max-height:82vh; overflow-y:auto; padding:1.4rem 1.6rem; box-shadow:0 20px 60px rgba(0,0,0,0.5);">'
            + '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:0.6rem;">'
            + '<h4 id="modalAyudaTitulo" style="margin:0; color:#fbbf24; font-size:1.05rem;"></h4>'
            + '<button id="modalAyudaCerrar" aria-label="Cerrar" style="background:none; border:none; color:#94a3b8; font-size:1.3rem; cursor:pointer; line-height:1;">✕</button>'
            + '</div><div id="modalAyudaContenido" style="color:#cbd5e1; font-size:0.95rem; line-height:1.6;"></div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
        modal.querySelector('#modalAyudaCerrar').addEventListener('click', () => { modal.style.display = 'none'; });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.style.display = 'none'; });
    }
    Object.entries(ayudas).forEach(([id, ayuda]) => {
        const wrapper = document.getElementById(id);
        if (!wrapper) return;
        const card = wrapper.closest('.chart-container') || wrapper.parentElement;
        const titulo = card ? card.querySelector('.chart-title') : null;
        if (!titulo || titulo.querySelector('.btn-ayuda-grafico')) return;
        const btn = document.createElement('button');
        btn.className = 'btn-ayuda-grafico';
        btn.type = 'button';
        btn.textContent = '?';
        btn.setAttribute('aria-label', 'Explicación de este gráfico');
        btn.title = '¿Qué es este gráfico?';
        btn.style.cssText = 'display:inline-flex; align-items:center; justify-content:center; width:19px; height:19px; margin-left:0.5rem; border:none; border-radius:50%; background:linear-gradient(135deg,#f59e0b,#d97706); color:#fff; font-size:12px; font-weight:700; cursor:pointer; vertical-align:middle; box-shadow:0 1px 4px rgba(245,158,11,0.45); transition:transform 0.15s;';
        btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.18)'; });
        btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
        btn.addEventListener('click', () => {
            document.getElementById('modalAyudaTitulo').textContent = ayuda.titulo;
            document.getElementById('modalAyudaContenido').innerHTML = ayuda.html;
            modal.style.display = 'flex';
        });
        titulo.appendChild(btn);
    });
}

export { inicializarGraficos, MAX_COLUMNAS_GRAFICOS, seleccionarColumnasGraficos, correlacionPearsonSimple, correlacionSpearmanSimple, esAproxNormalSimple, prepararDatosParaGraficos, renderizarSelectorGraficos, insertarDescripcionesGraficos, agregarAyudasGraficos };
