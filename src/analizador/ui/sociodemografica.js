// analizador/ui/sociodemografica.js — tabla sociodemográfica, niveles, descriptivos, reporte APA, referencias y descarga.
// Origen: analizador-ui.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { bus, EVENTOS } from '../../shared/eventos.js';
import { Fiabilidad } from '../fiabilidad.js';
import { referenciasDeFiabilidad } from '../psicometria/referencias.js';
import { AnalizadorEstadistico } from '../estadistica.js';
import { fmtPApp } from './analisis.js';
import { obtenerColumnasCategoricas } from './carga.js';
import { descargarArchivo } from '../../shared/descargas.js';
import { mostrarToast } from '../../shared/toast.js';

// ========================================
// TABLA SOCIODEMOGRÁFICA Y NIVELES (bajo/medio/alto)
// ========================================
// Cuantil con interpolación lineal (tipo 7 de R) sobre valores YA ordenados.
function cuantilLineal(ordenados, p) {
    const h = (ordenados.length - 1) * p;
    const lo = Math.floor(h), hi = Math.ceil(h);
    return ordenados[lo] + (h - lo) * (ordenados[hi] - ordenados[lo]);
}

// Niveles por TERCILES EMPÍRICOS de la muestra (P33.3 y P66.7): bajo/medio/alto
// con frecuencia y porcentaje. Devuelve null si hay menos de 3 valores válidos.
function calcularNivelesDeValores(valores) {
    const v = valores.filter(Number.isFinite).sort((a, b) => a - b);
    if (v.length < 3) return null;
    const c1 = cuantilLineal(v, 1 / 3), c2 = cuantilLineal(v, 2 / 3);
    const niveles = [
        { nivel: 'Bajo',  rango: `≤ ${c1.toFixed(2)}`,                    f: v.filter(x => x <= c1).length },
        { nivel: 'Medio', rango: `${c1.toFixed(2)} – ${c2.toFixed(2)}`,   f: v.filter(x => x > c1 && x <= c2).length },
        { nivel: 'Alto',  rango: `> ${c2.toFixed(2)}`,                    f: v.filter(x => x > c2).length }
    ];
    niveles.forEach(o => { o.pct = 100 * o.f / v.length; });
    return { niveles, n: v.length, c1, c2 };
}

// Tabla 1 de la tesis: frecuencias y porcentajes de las variables
// sociodemográficas (categóricas) detectadas en la base.
function mostrarTablaSociodemografica() {
    const container = document.getElementById('resultadosSociodemografica');
    if (!container) return;
    const datos = AnalizadorEstadistico.obtenerDatos() || [];
    const categoricas = obtenerColumnasCategoricas(6);
    if (datos.length === 0 || categoricas.length === 0) {
        container.style.display = 'none'; container.innerHTML = ''; return;
    }
    let filas = '';
    categoricas.forEach(col => {
        const conteo = new Map();
        datos.forEach(d => {
            const k = String(d[col] ?? '').trim();
            if (k) conteo.set(k, (conteo.get(k) || 0) + 1);
        });
        const total = [...conteo.values()].reduce((a, b) => a + b, 0);
        const cats = [...conteo.entries()].sort((a, b) => b[1] - a[1]);
        filas += `<tr><td rowspan="${cats.length}" style="vertical-align: top;"><strong>${col}</strong></td>` +
            cats.map(([cat, f], i) =>
                `${i === 0 ? '' : '<tr>'}<td>${cat}</td><td>${f}</td><td>${(100 * f / total).toFixed(1)}%</td></tr>`
            ).join('');
    });
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">👥 Características Sociodemográficas de la Muestra</h3>
            <p class="result-subtitle">Distribución de frecuencias (f) y porcentajes (%) de las variables de
            caracterización. Corresponde a la clásica Tabla 1 del capítulo de resultados.</p>
            <div class="result-box"><div class="table-container">
                <table class="table">
                    <thead><tr><th>Variable</th><th>Categoría</th><th>f</th><th>%</th></tr></thead>
                    <tbody>${filas}</tbody>
                </table>
            </div>
            <p class="help-text">N = ${datos.length}. Los porcentajes se calculan sobre los casos con dato válido en cada variable.</p>
            </div>
        </div>`;
    container.style.display = 'block';
}

// Niveles descriptivos (bajo/medio/alto) de las dos variables analizadas.
function mostrarNiveles(var1, var2, et1, et2) {
    const container = document.getElementById('resultadosNiveles');
    if (!container) return;
    const datos = AnalizadorEstadistico.obtenerDatos() || [];
    if (datos.length === 0) { container.style.display = 'none'; return; }
    const bloque = (col, etiqueta) => {
        const r = calcularNivelesDeValores(datos.map(d => +d[col]));
        if (!r) return '';
        return `
            <div class="result-box" style="margin-top: 0.75rem;">
                <h4>Niveles de ${etiqueta}</h4>
                <div class="table-container"><table class="table">
                    <thead><tr><th>Nivel</th><th>Rango de puntajes</th><th>f</th><th>%</th></tr></thead>
                    <tbody>${r.niveles.map(o =>
                        `<tr><td><strong>${o.nivel}</strong></td><td>${o.rango}</td><td>${o.f}</td><td>${o.pct.toFixed(1)}%</td></tr>`
                    ).join('')}</tbody>
                </table></div>
            </div>`;
    };
    const b1 = bloque(var1, et1), b2 = bloque(var2, et2);
    if (!b1 && !b2) { container.style.display = 'none'; return; }
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">📶 Niveles Descriptivos de las Variables</h3>
            <p class="result-subtitle">Clasificación de los participantes en niveles bajo, medio y alto. Los puntos de
            corte corresponden a los terciles empíricos de la muestra (percentiles 33.3 y 66.7), criterio habitual
            cuando el instrumento no aporta baremos normativos propios.</p>
            ${b1}${b2}
        </div>`;
    container.style.display = 'block';
}

function mostrarDescriptivas(var1, var2, resultado) {
    const container = document.getElementById('resultadosDescriptivas');
    if (!container) return;
    const d1 = resultado.descriptivas1;
    const d2 = resultado.descriptivas2;
    // Fila de la tabla; `decimales` controla el formato de los valores numéricos.
    const fila = (etiqueta, v1, v2, decimales = 2) => `
        <tr>
            <td>${etiqueta}</td>
            <td>${typeof v1 === 'number' ? v1.toFixed(decimales) : v1}</td>
            <td>${typeof v2 === 'number' ? v2.toFixed(decimales) : v2}</td>
        </tr>`;
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Estadísticos Descriptivos</h3>
            <p class="result-subtitle">Resumen numérico de cada variable, base para interpretar la correlación. La asimetría y la curtosis describen la forma de la distribución: valores próximos a 0 sugieren simetría y una forma mesocúrtica (cercana a la normal).</p>
            <div class="result-box">
                <table class="result-table">
                    <tr><th>Estadístico</th><th>${var1}</th><th>${var2}</th></tr>
                    ${fila('N', d1.n, d2.n, 0)}
                    ${fila('Media (M)', d1.media, d2.media)}
                    ${fila('Desviación estándar (DE)', d1.desviacion, d2.desviacion)}
                    ${fila('Error estándar', d1.errorEstandar, d2.errorEstandar)}
                    ${fila('Mínimo', d1.min, d2.min)}
                    ${fila('Máximo', d1.max, d2.max)}
                    ${fila('Mediana', d1.mediana, d2.mediana)}
                    ${fila('Q1 / Q3', `${d1.q1.toFixed(2)} / ${d1.q3.toFixed(2)}`, `${d2.q1.toFixed(2)} / ${d2.q3.toFixed(2)}`)}
                    ${fila('Asimetría', d1.asimetria, d2.asimetria)}
                    ${fila('Curtosis', d1.curtosis, d2.curtosis)}
                </table>
            </div>
        </div>`;
    container.style.display = 'block';
}

// Formatea un coeficiente al estilo APA: sin cero a la izquierda y 2 decimales.
function formatearRApa(r) {
    if (typeof r !== 'number' || isNaN(r)) return '—';
    const signo = r < 0 ? '-' : '';
    return signo + Math.abs(r).toFixed(2).replace(/^0/, '');
}

// Formatea el p-valor al estilo APA (p < .001 para valores muy pequeños).
function formatearPApa(p) {
    if (typeof p !== 'number' || isNaN(p)) return 'p = —';
    if (p < 0.001) return 'p < .001';
    return 'p = ' + p.toFixed(3).replace(/^0/, '');
}

// Construye la frase de resultados en formato APA 7.
function construirLineaAPA(var1, var2, resultado) {
    const simbolo = resultado.tipoCorrelacion === 'Pearson' ? 'r' : 'rₛ';
    const ic = resultado.intervaloConfianza;
    const icTexto = ic
        ? `, IC 95% [${formatearRApa(ic.inferior)}, ${formatearRApa(ic.superior)}]`
        : '';
    const significativa = resultado.pValor < 0.05;
    const relacion = significativa
        ? `una correlación ${resultado.interpretacion.direccion} estadísticamente significativa`
        : `una correlación ${resultado.interpretacion.direccion} no significativa`;
    return `Se halló ${relacion} entre ${var1} y ${var2}, ${simbolo}(${resultado.gl}) = ${formatearRApa(resultado.coeficiente)}, ${formatearPApa(resultado.pValor)}${icTexto}; r² = ${formatearRApa(resultado.r2)}.`;
}

function mostrarReporteAPA(var1, var2, resultado) {
    const container = document.getElementById('resultadosReporteAPA');
    if (!container) return;
    const linea = construirLineaAPA(var1, var2, resultado);
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Reporte en formato APA</h3>
            <p class="result-subtitle">Frase lista para pegar en la sección de resultados de tu tesis o artículo (estilo APA 7).</p>
            <div class="result-box apa-box">
                <p id="apaTexto" class="apa-text">${linea}</p>
                <button type="button" id="btnCopiarAPA" class="btn btn-outline">Copiar</button>
            </div>
        </div>`;
    container.style.display = 'block';
    const btn = document.getElementById('btnCopiarAPA');
    if (btn) {
        btn.addEventListener('click', () => copiarTexto(linea));
    }
}

// Copia un texto al portapapeles y avisa por toast.
function copiarTexto(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto)
            .then(() => mostrarToast('Reporte copiado al portapapeles', 'success'))
            .catch(() => mostrarToast('No se pudo copiar el reporte', 'error'));
    } else {
        mostrarToast('El navegador no permite copiar automáticamente', 'warning');
    }
}

// Análisis por dimensiones: solo se ejecuta si el usuario configuró
// dimensiones para AMBAS variables. Es opcional y no debe interrumpir el
// análisis principal, por lo que cualquier error se reporta por toast.
function mostrarDimensionesSiAplica(var1, var2, tipoPrueba) {
    const container = document.getElementById('resultadosDimensiones');
    if (!container) return;
    const dim1 = (document.getElementById('dimensionesVar1') || { value: '' }).value.trim();
    const dim2 = (document.getElementById('dimensionesVar2') || { value: '' }).value.trim();
    // Si no hay dimensiones para ambas variables, ocultar la sección
    if (!dim1 || !dim2) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    try {
        AnalizadorEstadistico.parsearDimensionesDesdeString(var1, dim1);
        AnalizadorEstadistico.parsearDimensionesDesdeString(var2, dim2);
        const resultados = AnalizadorEstadistico.calcularCorrelacionPorDimensiones(var1, var2, tipoPrueba);
        mostrarTablaDimensiones(container, var1, var2, resultados);
    } catch (error) {
        container.style.display = 'none';
        container.innerHTML = '';
        mostrarToast('Dimensiones: ' + error.message, 'warning');
    }
}

function mostrarTablaDimensiones(container, var1, var2, resultados) {
    const filas = resultados.map(r => `
                    <tr>
                        <td>${r.dimension1}</td>
                        <td>${r.dimension2}</td>
                        <td><strong>${r.tipoCorrelacion}</strong></td>
                        <td>${r.coeficiente.toFixed(4)}</td>
                        <td>${fmtPApp(r.pValor)}</td>
                        <td>${r.pValor < 0.05 ? 'Significativa (p < .05)' : 'No significativa (p ≥ .05)'}</td>
                    </tr>`).join('');
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Análisis por Dimensiones</h3>
            <p class="result-subtitle">Correlación entre cada dimensión de ${var1} y cada dimensión de ${var2}. Para cada par de dimensiones, el coeficiente (Pearson o Spearman) se elige según el cumplimiento del supuesto de normalidad, con el mismo criterio que el análisis global.</p>
            <div class="result-box">
                <table class="result-table">
                    <tr>
                        <th>Dimensión (${var1})</th>
                        <th>Dimensión (${var2})</th>
                        <th>Coeficiente</th>
                        <th>Valor</th>
                        <th>p</th>
                        <th>Significancia (α = .05)</th>
                    </tr>
                    ${filas}
                </table>
            </div>
        </div>
    `;
    container.style.display = 'block';
}

function mostrarReferencias(var1, var2, resultado) {
    // ✅ DECLARA EL CONTENEDOR PRINCIPAL
    const container = document.getElementById('resultadosContainer');
    if (!container) {
        console.error("No se encontró el contenedor #resultadosContainer");
        return;
    }
    const html = `
        <div class="references-container">
            <h4 class="result-title">Referencias bibliográficas</h4>
            <div class="reference-card">
                <p class="reference-text">1. Hernández-Sampieri, R., & Mendoza, C. (2023). Metodología de la investigación: las rutas cuantitativa, cualitativa y mixta. <a href="https://apiperiodico.jalisco.gob.mx/api/sites/periodicooficial.jalisco.gob.mx/files/metodologia_de_la_investigacion_-_roberto_hernandez_sampieri.pdf" target="_blank">https://apiperiodico.jalisco.gob.mx/api/sites/periodicooficial.jalisco.gob.mx/files/metodologia_de_la_investigacion_-_roberto_hernandez_sampieri.pdf</a></p>
            </div>
            <div class="reference-card">
                <p class="reference-text">2. Hernández, D., Fernández, C., & Baptista, M. D. P. (2010). Metodologia de la investigacion 5ta Edicion Sampieri. <a href="https://www.academia.edu/download/46694261/Metodologia_de_la_investigacion_5ta_Edicion_Sampieri___Dulce_Hernandez_-_Academia.edu.pdf" target="_blank">https://www.academia.edu/download/46694261/Metodologia_de_la_investigacion_5ta_Edicion_Sampieri___Dulce_Hernandez_-_Academia.edu.pdf</a></p>
            </div>
            <div class="reference-card">
                <p class="reference-text">3. Taherdoost, H. (2022). What are different research approaches? Comprehensive review of qualitative, quantitative, and mixed method research, their applications, types, and limitations. Journal of Management Science & Engineering Research, 5(1), 53-63. <a href="https://hal.science/hal-03741840/document" target="_blank">https://hal.science/hal-03741840/document</a></p>
            </div>
            <div class="reference-card">
                <p class="reference-text">4. Cohen, J. (1988). Statistical power analysis for the behavioral sciences (2.ª ed.). Lawrence Erlbaum Associates.</p>
            </div>
            <div class="reference-card">
                <p class="reference-text">5. Arias, J. L. (2021). Diseño y metodología de la investigación. Enfoques Consulting EIRL. <a href="https://repositorio.concytec.gob.pe/handle/20.500.12390/2260" target="_blank">https://repositorio.concytec.gob.pe/handle/20.500.12390/2260</a></p>
            </div>
            <div class="reference-card">
                <p class="reference-text">6. Cvetković-Vega, A., Maguiña, J. L., Soto, A., Lama-Valdivia, J., & Correa, L. E. (2021). Estudios transversales. Revista de la Facultad de Medicina Humana, 21(1), 164-170. <a href="https://doi.org/10.25176/RFMH.v21i1.3069" target="_blank">https://doi.org/10.25176/RFMH.v21i1.3069</a></p>
            </div>
        </div>
    `;
    // (2026.10.08) las fuentes de la fiabilidad ordinal y del KR-20, si esta tabla las reportó (se pinta antes)
    const ult = Fiabilidad._ultimo && Fiabilidad._ultimo.validos;
    const conIC = !!(Fiabilidad._bootstrap && ult && ult.some(r => Fiabilidad._bootstrap.porClave.has(r.huella)));
    const extra = referenciasDeFiabilidad(ult, conIC);
    const tarjetas = extra.map((r, i) => `<div class="reference-card"><p class="reference-text">${7 + i}. ${r}</p></div>`).join('');
    container.innerHTML = tarjetas ? html.replace(/<\/div>\s*$/, tarjetas + '</div>') : html;
    container.style.display = 'block';
}

function descargarResultados() {
    // Obtener el contenido de resultados (texto de cada contenedor, vacío si no existe)
    const textoContenedor = id => {
        const elem = document.getElementById(id);
        return elem ? elem.innerText.trim() : '';
    };
    // El contenedor de normalidad es 'pruebasNormalidadContainer' (no 'resultadosNormalidad').
    // Las secciones opcionales (descriptivos, APA, dimensiones) se filtran si están vacías.
    const secciones = [
        ['ESTADÍSTICOS DESCRIPTIVOS', textoContenedor('resultadosDescriptivas')],
        ['ANÁLISIS DE FIABILIDAD (ALFA DE CRONBACH)', textoContenedor('resultadosFiabilidad')],
        ['PRUEBA DE NORMALIDAD', textoContenedor('pruebasNormalidadContainer')],
        ['ANÁLISIS DE CORRELACIÓN', textoContenedor('resultadosCorrelacion')],
        ['REGRESIÓN LINEAL SIMPLE', textoContenedor('resultadosRegresion')],
        ['PRUEBA DE HIPÓTESIS', textoContenedor('resultadosDecision')],
        ['REPORTE EN FORMATO APA', textoContenedor('resultadosReporteAPA')],
        ['ANÁLISIS POR DIMENSIONES', textoContenedor('resultadosDimensiones')],
        ['DISCUSIÓN (PLANTILLA)', textoContenedor('resultadosDiscusion')],
        ['COMPARACIÓN DE GRUPOS', textoContenedor('resultadosComparacion')],
        ['ASOCIACIÓN (CHI-CUADRADO)', textoContenedor('resultadosChiCuadrado')]
    ].filter(([, texto]) => texto);
    // Evitar descargar un archivo vacío si aún no se ejecutó el análisis
    if (secciones.length === 0) {
        mostrarToast('Primero ejecuta un análisis para descargar resultados', 'warning');
        return;
    }
    const cuerpo = secciones
        .map(([titulo, texto], i) => `${i + 1}. ${titulo}\n${texto}`)
        .join('\n\n');
    const contenido = `RESULTADOS DEL ANÁLISIS ESTADÍSTICO
====================================
${cuerpo}
----
Generado por StatSim Pro
Fecha: ${new Date().toLocaleDateString()}
`;
    descargarArchivo(contenido, 'resultados_analisis.txt', 'text/plain');
    mostrarToast('Resultados descargados', 'success');
}

export { cuantilLineal, calcularNivelesDeValores, mostrarTablaSociodemografica, mostrarNiveles, mostrarDescriptivas, formatearRApa, formatearPApa, construirLineaAPA, mostrarReporteAPA, copiarTexto, mostrarDimensionesSiAplica, mostrarTablaDimensiones, mostrarReferencias, descargarResultados };

// (2026.10.09) si la fiabilidad se completa después (bootstrap), la lista de referencias visible se actualiza
bus.on(EVENTOS.FIABILIDAD_ACTUALIZADA, () => { const c = typeof document !== 'undefined' && document.getElementById('resultadosContainer'); if (c && c.style.display !== 'none' && c.innerHTML) mostrarReferencias(); });
