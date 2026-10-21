// buscador/protocolo.js — protocolo de búsqueda auto-documentado (registro de ecuaciones y resultados).
// Origen: protocolo-busqueda.js (Fase 4), sin cambios de comportamiento; dependencias explícitas.

import { descargarArchivo, descargarBlob } from '../shared/descargas.js';
import { asegurarHtmlDocx } from '../shared/vendor.js';
import { mostrarToast } from '../shared/toast.js';
import { PrismaDiagrama } from './prisma.js';
import { escaparHTML } from '../shared/html.js';
import { sinFormula } from '../shared/csv.js';

/**
 * ProtocoloBusqueda - Protocolo de búsqueda auto-documentado
 * -----------------------------------------------------------
 * Registra, sin fricción para el usuario, cada consulta que el Buscador
 * ejecuta contra las bases académicas: fuente, ecuación de búsqueda literal,
 * filtros, número de resultados y fecha/hora. Con ello genera la FICHA
 * TÉCNICA DE LA REVISIÓN: el artefacto que responde a la pregunta clásica
 * del jurado «¿cómo buscó y podría otro investigador replicarlo?».
 *
 * Punto de integración (una línea por despacho de consulta):
 *
 *     ProtocoloBusqueda.registrar({
 *         fuente: 'Scopus',
 *         ecuacion: '"emotional intelligence" AND anxiety',
 *         filtros: 'Años 2020–2025 · Artículos',   // opcional (string u objeto)
 *         resultados: 143,                          // opcional (n identificados)
 *         nota: 'variante EN generada por IA'       // opcional
 *     });
 *
 * Si el número de resultados llega después (respuesta asíncrona), puede
 * registrarse primero la consulta y luego actualizar:
 *
 *     ProtocoloBusqueda.actualizarResultados('Scopus', ecuacion, 143);
 *
 * Salidas: ficha visual en la app, párrafo metodológico listo para la tesis,
 * CSV y JSON (este último alimentará el flujo PRISMA de la Fase 1b).
 *
 * Persistencia: sessionStorage (sobrevive a recargas dentro de la sesión de
 * trabajo; se limpia al cerrar el navegador o con el botón «Nueva revisión»).
 *
 * Módulo autocontenido: sin dependencias de otros módulos ni librerías.
 */

const CLAVE_ALMACEN = 'statsim_protocolo_busqueda_v1';

// Estado visual: la ficha inicia PLEGADA; si el usuario la abre, las
// re-renderizaciones tras cada búsqueda respetan su elección.
let fichaAbierta = false;

// ------------------------------ estado ------------------------------

let estado = {
    iniciada: null,          // ISO de la primera consulta registrada
    ultimaActividad: null,   // ISO de la última
    consultas: []            // [{fuente, ecuacion, filtros, resultados, nota, fecha, veces}]
};

function ahoraISO() { return new Date().toISOString(); }

function fechaLegible(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function filtrosATexto(f) {
    if (f == null) return '';
    if (typeof f === 'string') return f;
    try {
        return Object.entries(f)
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([k, v]) => `${k}: ${v}`).join(' · ');
    } catch (e) { return String(f); }
}

function normalizarEcuacion(e) {
    return String(e || '').replace(/\s+/g, ' ').trim();
}

// --------------------------- persistencia ---------------------------

function guardar() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(CLAVE_ALMACEN, JSON.stringify(estado));
        }
    } catch (e) { /* modo privado o cuota: el registro sigue en memoria */ }
}

function cargar() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            const crudo = sessionStorage.getItem(CLAVE_ALMACEN);
            if (crudo) {
                const obj = estadoValido(JSON.parse(crudo));
                if (obj) estado = obj;
            }
        }
    } catch (e) { /* registro nuevo */ }
}

// (2026.12.31, revisión) El registro que llega de fuera —el de un proyecto, que puede ser de otra persona, o el del
// almacenamiento de la sesión— solo se acepta con la forma que escribe registrar(): cada consulta con sus siete campos, los
// textos como cadenas de un largo razonable y los conteos como números (nada más: un campo de otro tipo o de más se
// descarta con el registro entero). Y la ficha escapa todo lo que pinta. Antes, un proyecto manipulado metía HTML en la
// ficha: el párrafo metodológico, con los nombres de las fuentes, iba sin escapar.
const LARGO_MAXIMO = { fuente: 200, ecuacion: 20000, texto: 4000, fecha: 40, consultas: 10000 };

/** Una fecha del registro: una cadena que se entiende como fecha (o nada: null); undefined si no lo es. @param {unknown} v */
function fechaValida(v) {
    if (v === null || v === undefined || v === '') return null;
    return typeof v === 'string' && v.length <= LARGO_MAXIMO.fecha && !Number.isNaN(Date.parse(v)) ? v : undefined;
}

/** Un texto opcional del registro (los filtros, la nota): una cadena ('' si falta); null si es otra cosa. @param {unknown} v */
const textoOpcional = v => (v === null || v === undefined ? '' : typeof v === 'string' && v.length <= LARGO_MAXIMO.texto ? v : null);

/**
 * Una consulta del registro con su forma, o null.
 * @param {any} c
 */
function consultaValida(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    const fuente = typeof c.fuente === 'string' ? c.fuente.trim() : '';
    const ecuacion = typeof c.ecuacion === 'string' ? normalizarEcuacion(c.ecuacion) : '';
    if (!fuente || fuente.length > LARGO_MAXIMO.fuente || !ecuacion || ecuacion.length > LARGO_MAXIMO.ecuacion) return null;
    const filtros = textoOpcional(c.filtros), nota = textoOpcional(c.nota), fecha = fechaValida(c.fecha);
    // los resultados, un conteo (el número de obras que devolvió la fuente), como los del flujo PRISMA
    const resultados = c.resultados === null || c.resultados === undefined ? null : (Number.isSafeInteger(c.resultados) && c.resultados >= 0 ? c.resultados : undefined);
    const veces = c.veces === undefined ? 1 : (Number.isSafeInteger(c.veces) && c.veces >= 1 ? c.veces : null);
    if (filtros === null || nota === null || fecha === undefined || resultados === undefined || veces === null) return null;
    return { fuente, ecuacion, filtros, resultados, nota, fecha, veces };
}

/**
 * El registro con su forma (una copia con solo sus campos), o null.
 * @param {any} obj
 */
function estadoValido(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.consultas) || obj.consultas.length > LARGO_MAXIMO.consultas) return null;
    const consultas = [];
    for (const c of obj.consultas) {
        const v = consultaValida(c);
        if (!v) return null;
        consultas.push(v);
    }
    const iniciada = fechaValida(obj.iniciada), ultimaActividad = fechaValida(obj.ultimaActividad);
    if (iniciada === undefined || ultimaActividad === undefined) return null;
    return { iniciada, ultimaActividad, consultas };
}

// ------------------------------ núcleo ------------------------------

/**
 * La clave de una consulta: la fuente, la ecuación y los filtros. (2026.12.30) Con los filtros: hasta la 2026.12.29, la
 * misma ecuación con otros filtros («desde 2015» tras «desde 2021») se fundía en la fila anterior, que seguía documentando
 * los filtros viejos con el número de resultados nuevo.
 * @param {string} fuente @param {string} ecuacion @param {unknown} filtros
 */
function claveConsulta(fuente, ecuacion, filtros) {
    return [String(fuente).trim(), normalizarEcuacion(ecuacion), filtrosATexto(filtros)].join('\u241f');
}

const claveDe = c => claveConsulta(c.fuente, c.ecuacion, c.filtros);

/**
 * Registra una consulta ejecutada contra una fuente. Las repeticiones
 * exactas (misma fuente, ecuación y filtros) no duplican filas: incrementan
 * el contador `veces` y conservan el mejor dato de resultados disponible.
 */
function registrar(datos) {
    if (!datos || !datos.fuente || !normalizarEcuacion(datos.ecuacion)) return null;
    const ahora = ahoraISO();
    if (!estado.iniciada) estado.iniciada = ahora;
    estado.ultimaActividad = ahora;

    const fuente = String(datos.fuente).trim();
    const ecuacion = normalizarEcuacion(datos.ecuacion);
    const clave = claveConsulta(fuente, ecuacion, datos.filtros);
    const existente = estado.consultas.find(c => claveDe(c) === clave);

    if (existente) {
        existente.veces += 1;
        existente.fecha = ahora;
        if (Number.isFinite(datos.resultados)) {
            existente.resultados = Math.max(existente.resultados ?? -1, datos.resultados);
            if (existente.resultados < 0) existente.resultados = datos.resultados;
        }
        if (datos.nota && !existente.nota) existente.nota = String(datos.nota);
        guardar();
        return existente;
    }
    const registro = {
        fuente,
        ecuacion,
        filtros: filtrosATexto(datos.filtros),
        resultados: Number.isFinite(datos.resultados) ? datos.resultados : null,
        nota: datos.nota ? String(datos.nota) : '',
        fecha: ahora,
        veces: 1
    };
    estado.consultas.push(registro);
    guardar();
    return registro;
}

/**
 * Completa (o corrige) el nº de resultados de una consulta ya registrada: la de esos filtros o, si no se dan, la más
 * reciente de esa fuente y ecuación.
 */
function actualizarResultados(fuente, ecuacion, resultados, filtros) {
    if (!Number.isFinite(resultados)) return false;
    const ec = normalizarEcuacion(ecuacion), f = String(fuente).trim();
    const candidatas = filtros === undefined
        ? estado.consultas.filter(x => x.fuente === f && x.ecuacion === ec)
        : estado.consultas.filter(x => claveDe(x) === claveConsulta(f, ec, filtros));
    const c = candidatas.reduce((ultima, x) => (!ultima || String(x.fecha) >= String(ultima.fecha) ? x : ultima), null);
    if (!c) return false;
    c.resultados = resultados;
    estado.ultimaActividad = ahoraISO();
    guardar();
    return true;
}

/** Resumen estructurado (también alimentará el flujo PRISMA en Fase 1b). */
function resumen() {
    const porFuente = new Map();
    estado.consultas.forEach(c => {
        if (!porFuente.has(c.fuente)) {
            porFuente.set(c.fuente, { nombre: c.fuente, nEcuaciones: 0, nConsultas: 0, totalResultados: 0, algunSinConteo: false });
        }
        const f = porFuente.get(c.fuente);
        f.nEcuaciones += 1;
        f.nConsultas += c.veces;
        if (Number.isFinite(c.resultados)) f.totalResultados += c.resultados;
        else f.algunSinConteo = true;
    });
    const fuentes = [...porFuente.values()].sort((a, b) => b.totalResultados - a.totalResultados);
    return {
        fechaInicio: estado.iniciada,
        fechaFin: estado.ultimaActividad,
        nFuentes: fuentes.length,
        nEcuaciones: estado.consultas.length,
        // (2026.12.30) las ecuaciones distintas (la misma en dos bases, o con otros filtros, es una sola ecuación)
        nEcuacionesDistintas: new Set(estado.consultas.map(c => c.ecuacion)).size,
        nConsultas: estado.consultas.reduce((s, c) => s + c.veces, 0),
        totalIdentificados: fuentes.reduce((s, f) => s + f.totalResultados, 0),
        fuentes
    };
}

/**
 * Párrafo metodológico listo para la tesis, redactado desde el registro.
 * Defendible palabra por palabra: cada número sale de la tabla.
 */
function parrafoMetodologico() {
    const r = resumen();
    if (r.nFuentes === 0) return 'Aún no se han registrado consultas en esta sesión.';
    const listaFuentes = r.fuentes.map(f => f.nombre);
    const nombres = listaFuentes.length <= 1
        ? listaFuentes.join('')
        : listaFuentes.slice(0, -1).join(', ') + ' y ' + listaFuentes[listaFuentes.length - 1];
    const rango = fechaLegible(r.fechaInicio) === fechaLegible(r.fechaFin)
        ? `el ${fechaLegible(r.fechaInicio)}`
        : `entre el ${fechaLegible(r.fechaInicio)} y el ${fechaLegible(r.fechaFin)}`;
    const desglose = r.fuentes
        .map(f => `${f.nombre} = ${f.totalResultados}${f.algunSinConteo ? '*' : ''}`)
        .join('; ');
    // (2026.12.30) las ecuaciones distintas y, si hay más filas, en cuántas consultas (base de datos y filtros) se aplicaron:
    // hasta la 2026.12.29, «3 ecuaciones» para una sola ecuación lanzada en tres bases
    const nE = r.nEcuacionesDistintas, aplicada = r.nEcuaciones > nE
        ? `, aplicada${nE === 1 ? '' : 's'} en ${r.nEcuaciones} consultas (combinaciones de base de datos y filtros) documentadas`
        : ` documentada${nE === 1 ? '' : 's'}`;
    let p = `La b\u00fasqueda de antecedentes se realiz\u00f3 ${rango} en ${r.nFuentes} ${r.nFuentes === 1 ? 'base de datos' : 'bases de datos'} (${nombres}), mediante ${nE} ${nE === 1 ? 'ecuaci\u00f3n de b\u00fasqueda' : 'ecuaciones de b\u00fasqueda'}${aplicada} en la ficha t\u00e9cnica de la revisi\u00f3n. `;
    p += `El proceso arroj\u00f3 un total de ${r.totalIdentificados} registros identificados (${desglose}).`;
    if (r.fuentes.some(f => f.algunSinConteo)) {
        p += ' *Alguna consulta de esta fuente no report\u00f3 conteo; el total es un m\u00ednimo.';
    }
    return p;
}

// ---------------------------- exportaciones ----------------------------

function exportarCSV() {
    const esc = v => {
        const s = sinFormula(v == null ? '' : v);   // (2026.12.30) una ecuación «=…» o «-x», como texto en la hoja
        return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const filas = ['Fuente;Ecuación de búsqueda;Filtros;Resultados;Fecha;Consultas;Nota'];
    estado.consultas.forEach(c => {
        filas.push([c.fuente, c.ecuacion, c.filtros, c.resultados ?? '', c.fecha, c.veces, c.nota].map(esc).join(';'));
    });
    return '\ufeff' + filas.join('\n');
}

function exportarJSON() {
    return JSON.stringify({ generado: ahoraISO(), ...estado, resumen: resumen() }, null, 2);
}

/** HTML de la ficha (lo reutilizará el exportador Word en la Fase 1b). */
function fichaHTML() {
    const r = resumen();
    if (r.nFuentes === 0) {
        return '<p style="color:#94a3b8; margin:0;">A\u00fan no hay consultas registradas: ejecuta una b\u00fasqueda y la ficha se construir\u00e1 sola.</p>';
    }
    const filas = estado.consultas.map(c => `
        <tr>
            <td style="padding:0.35rem 0.5rem; border-bottom:1px solid #1e293b; white-space:nowrap;">${escaparHTML(c.fuente)}</td>
            <td style="padding:0.35rem 0.5rem; border-bottom:1px solid #1e293b; font-family:monospace; font-size:0.82rem; word-break:break-word;">${escaparHTML(c.ecuacion)}</td>
            <td style="padding:0.35rem 0.5rem; border-bottom:1px solid #1e293b;">${escaparHTML(c.filtros) || '—'}</td>
            <td style="padding:0.35rem 0.5rem; border-bottom:1px solid #1e293b; text-align:right;">${Number.isFinite(c.resultados) ? c.resultados : '—'}</td>
            <td style="padding:0.35rem 0.5rem; border-bottom:1px solid #1e293b; white-space:nowrap;">${fechaLegible(c.fecha)}</td>
        </tr>`).join('');
    return `
        <p style="color:#cbd5e1; font-size:0.95rem; line-height:1.6; text-align:justify; margin:0 0 0.8rem;">${escaparHTML(parrafoMetodologico())}</p>
        <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; color:#e2e8f0; font-size:0.88rem;">
            <thead>
                <tr style="color:#fbbf24; text-align:left;">
                    <th style="padding:0.35rem 0.5rem; border-bottom:1px solid #475569;">Fuente</th>
                    <th style="padding:0.35rem 0.5rem; border-bottom:1px solid #475569;">Ecuaci\u00f3n de b\u00fasqueda</th>
                    <th style="padding:0.35rem 0.5rem; border-bottom:1px solid #475569;">Filtros</th>
                    <th style="padding:0.35rem 0.5rem; border-bottom:1px solid #475569; text-align:right;">Resultados</th>
                    <th style="padding:0.35rem 0.5rem; border-bottom:1px solid #475569;">Fecha</th>
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>
        </div>
        <p style="color:#94a3b8; font-size:0.78rem; margin:0.6rem 0 0;">Ficha t\u00e9cnica generada autom\u00e1ticamente por StatSim Pro \u00b7 ${escaparHTML(r.nConsultas)} consultas \u00b7 total identificados: ${escaparHTML(r.totalIdentificados)}</p>`;
}

// --------------------- exportación a Word (APA 7) ---------------------

/** Interpretación automática del protocolo, condicional a los datos. */
function interpretacionAutomatica() {
    const r = resumen();
    if (r.nFuentes === 0) return [];
    const p = [];
    const rango = fechaLegible(r.fechaInicio) === fechaLegible(r.fechaFin)
        ? `el ${fechaLegible(r.fechaInicio)}`
        : `entre el ${fechaLegible(r.fechaInicio)} y el ${fechaLegible(r.fechaFin)}`;
    p.push(`La tabla documenta ${r.nEcuaciones} ${r.nEcuaciones === 1 ? 'ecuación de búsqueda ejecutada' : 'ecuaciones de búsqueda ejecutadas'} sobre ${r.nFuentes} ${r.nFuentes === 1 ? 'base de datos' : 'bases de datos'} ${rango}, con el registro literal de cada ecuación y sus filtros; ello permite a cualquier lector replicar la búsqueda paso a paso, requisito central de una revisión transparente.`);
    if (r.totalIdentificados > 0) {
        const top = r.fuentes[0];
        p.push(`En conjunto se identificaron ${r.totalIdentificados} registros; la fuente más productiva fue ${top.nombre}, con ${top.totalResultados} ${top.totalResultados === 1 ? 'registro' : 'registros'}.`);
    }
    const variantes = estado.consultas.filter(c => /variante/i.test(c.nota || '')).length;
    if (variantes > 0) {
        p.push(`${variantes} de las ecuaciones ${variantes === 1 ? 'corresponde a una variante generada' : 'corresponden a variantes generadas'} durante la búsqueda intensiva; su registro documenta la expansión de la consulta original hacia sinónimos y términos alternativos en español e inglés.`);
    }
    const sinConteo = estado.consultas.filter(c => !Number.isFinite(c.resultados)).length;
    if (sinConteo > 0) {
        p.push(`${sinConteo} ${sinConteo === 1 ? 'consulta no reportó' : 'consultas no reportaron'} conteo porque la fuente no respondió en el momento de la búsqueda (símbolo —); por transparencia la consulta queda documentada igualmente y el total identificado se declara como un mínimo.`);
    }
    p.push('Se trata de una revisión estructurada con protocolo de búsqueda documentado; no se reclama la exhaustividad de una revisión sistemática formal (sin doble cribado independiente ni evaluación formal de riesgo de sesgo).');
    return p;
}

/** HTML del protocolo en formato APA 7 (Times 12, tabla sin filetes verticales).
 *  Reutilizable por el exportador del capítulo (apéndice metodológico). */
function wordHTML(nTabla = 1) {
    const r = resumen();
    if (r.nFuentes === 0) return '<p>Aún no hay consultas registradas.</p>';
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const F = "font-family:'Times New Roman',serif; font-size:12pt;";
    const hayNota = estado.consultas.some(c => c.nota);
    const th = 'border-top:1.5pt solid #000; border-bottom:1pt solid #000; padding:3pt 6pt; text-align:left; font-weight:bold;';
    const td = 'padding:3pt 6pt; text-align:left; vertical-align:top;';
    const ult = estado.consultas.length - 1;
    const filas = estado.consultas.map((c, i) => {
        const borde = i === ult ? ' border-bottom:1.5pt solid #000;' : '';
        return `<tr>` +
            `<td style="${td}${borde}">${esc(c.fuente)}</td>` +
            `<td style="${td}${borde}">${esc(c.ecuacion)}</td>` +
            `<td style="${td}${borde}">${esc(c.filtros) || '—'}</td>` +
            `<td style="${td}${borde} text-align:right;">${Number.isFinite(c.resultados) ? c.resultados : '—'}</td>` +
            `<td style="${td}${borde}">${fechaLegible(c.fecha)}</td>` +
            (hayNota ? `<td style="${td}${borde}">${esc(c.nota) || ''}</td>` : '') +
            `</tr>`;
    }).join('');
    const interpretacion = interpretacionAutomatica()
        .map(x => `<p style="${F} line-height:200%; margin:0 0 6pt; text-align:left;">${esc(x)}</p>`).join('');
    return `
        <h2 style="${F} font-size:12pt; font-weight:bold; text-align:center; margin:0 0 12pt;">Ficha técnica de la revisión (protocolo de búsqueda)</h2>
        <p style="${F} line-height:200%; text-align:left; margin:0 0 12pt;">${esc(parrafoMetodologico())}</p>
        <p style="${F} font-weight:bold; margin:12pt 0 0;">Tabla ${nTabla}</p>
        <p style="${F} font-style:italic; margin:2pt 0 8pt;">Protocolo de búsqueda por fuente y ecuación</p>
        <table style="border-collapse:collapse; width:100%; ${F} font-size:11pt;">
            <thead><tr>
                <th style="${th}">Fuente</th>
                <th style="${th}">Ecuación de búsqueda</th>
                <th style="${th}">Filtros</th>
                <th style="${th} text-align:right;">Resultados</th>
                <th style="${th}">Fecha</th>
                ${hayNota ? `<th style="${th}">Nota</th>` : ''}
            </tr></thead>
            <tbody>${filas}</tbody>
        </table>
        <p style="${F} font-size:10pt; margin:6pt 0 14pt;"><i>Nota.</i> Ficha generada automáticamente por StatSim Pro a partir del registro de consultas de la sesión. El símbolo — indica que la fuente no reportó conteo (fallo de conexión), por lo que el total identificado es un mínimo.</p>
        <h3 style="${F} font-size:12pt; font-weight:bold; margin:0 0 8pt;">Interpretación</h3>
        ${interpretacion}`;
}

/**
 * Descarga el protocolo como .docx real. (2026.12.30) html-docx se carga a demanda (shared/vendor.js), como en el Word del
 * Analizador: hasta la 2026.12.29 se esperaba ya cargado —nadie lo cargaba— y el botón solo avisaba «aún no está cargado».
 */
async function exportarWord() {
    const motor = await asegurarHtmlDocx();
    if (!motor || typeof motor.asBlob !== 'function') {
        if (typeof mostrarToast === 'function') mostrarToast('No se pudo cargar el generador de Word. Revisa tu conexión e inténtalo de nuevo.', 'error');
        return;
    }
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${wordHTML()}</body></html>`;
    descargarBlob(motor.asBlob(doc), 'protocolo_busqueda.docx');
    if (typeof mostrarToast === 'function') mostrarToast('Protocolo exportado a Word', 'success');
}

function descargar(contenido, nombre, mime) {
    // Usa la utilidad global de la app si existe; si no, fallback propio.
    if (typeof window !== 'undefined' && typeof descargarArchivo === 'function') {
        descargarArchivo(contenido, nombre, mime);
        return;
    }
    const blob = new Blob([contenido], { type: mime + ';charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.style.visibility = 'hidden';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ------------------------------- UI -------------------------------

/**
 * Renderiza la ficha técnica dentro del contenedor indicado, con botones
 * de exportación. Idempotente: puede llamarse tras cada búsqueda.
 */
// (2026.12.31) El contenedor donde se pintó la ficha por última vez: al restaurar un proyecto se vuelve a pintar ahí.
let ultimoContenedor = null;

function mostrarFicha(idContenedor) {
    const cont = document.getElementById(idContenedor);
    if (!cont) return;
    ultimoContenedor = idContenedor;
    let caja = cont.querySelector('.protocolo-busqueda-caja');
    if (!caja) {
        caja = document.createElement('div');
        caja.className = 'protocolo-busqueda-caja';
        caja.style.cssText = 'margin-top:1rem; padding:1rem 1.2rem; border:1px solid #334155; border-radius:10px;';
        cont.appendChild(caja);
    }
    const r = resumen();
    const resumenCorto = r.nFuentes === 0
        ? 'aún sin consultas registradas'
        : `${r.nEcuaciones} ${r.nEcuaciones === 1 ? 'ecuación' : 'ecuaciones'} · ${r.nFuentes} ${r.nFuentes === 1 ? 'fuente' : 'fuentes'} · ${r.totalIdentificados} identificados`;
    caja.innerHTML = `
        <details class="pb-details" ${fichaAbierta ? 'open' : ''}>
            <summary style="cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                <h4 style="margin:0; color:#fbbf24; font-size:0.95rem;"><span class="pb-flecha">${fichaAbierta ? '▾' : '▸'}</span> 📋 Ficha técnica de la revisión (protocolo de búsqueda)</h4>
                <span style="color:#94a3b8; font-size:0.8rem;">${resumenCorto}</span>
            </summary>
            <div style="margin-top:0.8rem;">
                <div style="display:flex; justify-content:flex-end; gap:0.4rem; flex-wrap:wrap; margin-bottom:0.6rem;">
                    <button type="button" class="pb-btn" data-accion="copiar">Copiar párrafo</button>
                    <button type="button" class="pb-btn" data-accion="word">Word (APA)</button>
                    <button type="button" class="pb-btn" data-accion="csv">CSV</button>
                    <button type="button" class="pb-btn" data-accion="json">JSON</button>
                    <button type="button" class="pb-btn" data-accion="limpiar">Nueva revisión</button>
                </div>
                <div class="pb-contenido">${fichaHTML()}</div>
            </div>
        </details>`;
    const det = caja.querySelector('details');
    if (det) det.addEventListener('toggle', () => {
        fichaAbierta = det.open;
        const flecha = caja.querySelector('.pb-flecha');
        if (flecha) flecha.textContent = det.open ? '▾' : '▸';
    });
    caja.querySelectorAll('.pb-btn').forEach(b => {
        b.style.cssText = 'background:rgba(15,23,42,0.9); border:1px solid #475569; color:#cbd5e1; border-radius:6px; padding:0.25rem 0.6rem; font-size:0.78rem; cursor:pointer;';
        b.addEventListener('click', () => {
            const accion = b.getAttribute('data-accion');
            if (accion === 'copiar') {
                const texto = parrafoMetodologico();
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(texto);
                }
                if (typeof mostrarToast === 'function') mostrarToast('P\u00e1rrafo metodol\u00f3gico copiado', 'success');
            } else if (accion === 'word') {
                exportarWord();
            } else if (accion === 'csv') {
                descargar(exportarCSV(), 'protocolo_busqueda.csv', 'text/csv');
            } else if (accion === 'json') {
                descargar(exportarJSON(), 'protocolo_busqueda.json', 'application/json');
            } else if (accion === 'limpiar') {
                const seguir = typeof confirm === 'function' ? confirm('\u00bfIniciar una nueva revisi\u00f3n? Se borrar\u00e1 el protocolo registrado en esta sesi\u00f3n.') : true;
                if (seguir) {
                    limpiar();
                    if (typeof PrismaDiagrama !== 'undefined') PrismaDiagrama.reiniciar();
                    mostrarFicha(idContenedor);
                }
            }
        });
    });
}

// (2026.12.31) Para el archivo de proyecto (buscador/proyecto.js): una copia del registro, y su restauración.
function estadoActual() {
    return JSON.parse(JSON.stringify(estado));
}

/** El registro de un proyecto en lugar del de esta sesión, si tiene la forma de validarEstado(); si no, un error. @param {unknown} obj */
function restaurarEstado(obj) {
    const valido = estadoValido(obj);
    if (!valido) throw new Error('el protocolo de búsqueda guardado no tiene la forma esperada');
    estado = valido;
    guardar();
    if (ultimoContenedor) mostrarFicha(ultimoContenedor);
}

function limpiar() {
    estado = { iniciada: null, ultimaActividad: null, consultas: [] };
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CLAVE_ALMACEN); } catch (e) { }
}

// --------------------------- API pública ---------------------------

cargar();

const ProtocoloBusqueda = {
    registrar,
    actualizarResultados,
    claveConsulta,
    resumen,
    parrafoMetodologico,
    fichaHTML,
    wordHTML,
    exportarWord,
    exportarCSV,
    exportarJSON,
    mostrarFicha,
    limpiar,
    estadoActual,
    restaurarEstado,
    validarEstado: estadoValido
};

export { ProtocoloBusqueda };
