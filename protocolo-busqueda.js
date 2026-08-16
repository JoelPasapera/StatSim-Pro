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
(function () {
    'use strict';

    const CLAVE_ALMACEN = 'statsim_protocolo_busqueda_v1';

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
                    const obj = JSON.parse(crudo);
                    if (obj && Array.isArray(obj.consultas)) estado = obj;
                }
            }
        } catch (e) { /* registro nuevo */ }
    }

    // ------------------------------ núcleo ------------------------------

    /**
     * Registra una consulta ejecutada contra una fuente. Las repeticiones
     * exactas (misma fuente + misma ecuación) no duplican filas: incrementan
     * el contador `veces` y conservan el mejor dato de resultados disponible.
     */
    function registrar(datos) {
        if (!datos || !datos.fuente || !normalizarEcuacion(datos.ecuacion)) return null;
        const ahora = ahoraISO();
        if (!estado.iniciada) estado.iniciada = ahora;
        estado.ultimaActividad = ahora;

        const fuente = String(datos.fuente).trim();
        const ecuacion = normalizarEcuacion(datos.ecuacion);
        const existente = estado.consultas.find(c => c.fuente === fuente && c.ecuacion === ecuacion);

        if (existente) {
            existente.veces += 1;
            existente.fecha = ahora;
            if (Number.isFinite(datos.resultados)) {
                existente.resultados = Math.max(existente.resultados ?? -1, datos.resultados);
                if (existente.resultados < 0) existente.resultados = datos.resultados;
            }
            if (datos.filtros != null && !existente.filtros) existente.filtros = filtrosATexto(datos.filtros);
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

    /** Completa (o corrige) el nº de resultados de una consulta ya registrada. */
    function actualizarResultados(fuente, ecuacion, resultados) {
        if (!Number.isFinite(resultados)) return false;
        const ec = normalizarEcuacion(ecuacion);
        const c = estado.consultas.find(x => x.fuente === String(fuente).trim() && x.ecuacion === ec);
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
        let p = `La b\u00fasqueda de antecedentes se realiz\u00f3 ${rango} en ${r.nFuentes} ${r.nFuentes === 1 ? 'base de datos' : 'bases de datos'} (${nombres}), mediante ${r.nEcuaciones} ${r.nEcuaciones === 1 ? 'ecuaci\u00f3n de b\u00fasqueda' : 'ecuaciones de b\u00fasqueda'} documentada${r.nEcuaciones === 1 ? '' : 's'} en la ficha t\u00e9cnica de la revisi\u00f3n. `;
        p += `El proceso arroj\u00f3 un total de ${r.totalIdentificados} registros identificados (${desglose}).`;
        if (r.fuentes.some(f => f.algunSinConteo)) {
            p += ' *Alguna consulta de esta fuente no report\u00f3 conteo; el total es un m\u00ednimo.';
        }
        return p;
    }

    // ---------------------------- exportaciones ----------------------------

    function exportarCSV() {
        const esc = v => {
            const s = String(v == null ? '' : v);
            return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
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
                <td style="padding:0.35rem 0.5rem; border-bottom:1px solid #1e293b; white-space:nowrap;">${c.fuente}</td>
                <td style="padding:0.35rem 0.5rem; border-bottom:1px solid #1e293b; font-family:monospace; font-size:0.82rem; word-break:break-word;">${c.ecuacion}</td>
                <td style="padding:0.35rem 0.5rem; border-bottom:1px solid #1e293b;">${c.filtros || '—'}</td>
                <td style="padding:0.35rem 0.5rem; border-bottom:1px solid #1e293b; text-align:right;">${c.resultados ?? '—'}</td>
                <td style="padding:0.35rem 0.5rem; border-bottom:1px solid #1e293b; white-space:nowrap;">${fechaLegible(c.fecha)}</td>
            </tr>`).join('');
        return `
            <p style="color:#cbd5e1; font-size:0.95rem; line-height:1.6; text-align:justify; margin:0 0 0.8rem;">${parrafoMetodologico()}</p>
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
            <p style="color:#64748b; font-size:0.78rem; margin:0.6rem 0 0;">Ficha t\u00e9cnica generada autom\u00e1ticamente por StatSim Pro \u00b7 ${r.nConsultas} consultas \u00b7 total identificados: ${r.totalIdentificados}</p>`;
    }

    function descargar(contenido, nombre, mime) {
        // Usa la utilidad global de la app si existe; si no, fallback propio.
        if (typeof window !== 'undefined' && typeof window.descargarArchivo === 'function') {
            window.descargarArchivo(contenido, nombre, mime);
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
    function mostrarFicha(idContenedor) {
        const cont = document.getElementById(idContenedor);
        if (!cont) return;
        let caja = cont.querySelector('.protocolo-busqueda-caja');
        if (!caja) {
            caja = document.createElement('div');
            caja.className = 'protocolo-busqueda-caja';
            caja.style.cssText = 'margin-top:1rem; padding:1rem 1.2rem; border:1px solid #334155; border-radius:10px;';
            cont.appendChild(caja);
        }
        const r = resumen();
        caja.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.6rem;">
                <h4 style="margin:0; color:#fbbf24; font-size:0.95rem;">\ud83d\udccb Ficha t\u00e9cnica de la revisi\u00f3n (protocolo de b\u00fasqueda)</h4>
                <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                    <button type="button" class="pb-btn" data-accion="copiar">Copiar p\u00e1rrafo</button>
                    <button type="button" class="pb-btn" data-accion="csv">CSV</button>
                    <button type="button" class="pb-btn" data-accion="json">JSON</button>
                    <button type="button" class="pb-btn" data-accion="limpiar">Nueva revisi\u00f3n</button>
                </div>
            </div>
            <div class="pb-contenido">${fichaHTML()}</div>`;
        caja.querySelectorAll('.pb-btn').forEach(b => {
            b.style.cssText = 'background:rgba(15,23,42,0.9); border:1px solid #475569; color:#cbd5e1; border-radius:6px; padding:0.25rem 0.6rem; font-size:0.78rem; cursor:pointer;';
            b.addEventListener('click', () => {
                const accion = b.getAttribute('data-accion');
                if (accion === 'copiar') {
                    const texto = parrafoMetodologico();
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(texto);
                    }
                    if (typeof window.mostrarToast === 'function') window.mostrarToast('P\u00e1rrafo metodol\u00f3gico copiado', 'success');
                } else if (accion === 'csv') {
                    descargar(exportarCSV(), 'protocolo_busqueda.csv', 'text/csv');
                } else if (accion === 'json') {
                    descargar(exportarJSON(), 'protocolo_busqueda.json', 'application/json');
                } else if (accion === 'limpiar') {
                    const seguir = typeof confirm === 'function' ? confirm('\u00bfIniciar una nueva revisi\u00f3n? Se borrar\u00e1 el protocolo registrado en esta sesi\u00f3n.') : true;
                    if (seguir) { limpiar(); mostrarFicha(idContenedor); }
                }
            });
        });
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
        resumen,
        parrafoMetodologico,
        fichaHTML,
        exportarCSV,
        exportarJSON,
        mostrarFicha,
        limpiar
    };

    if (typeof window !== 'undefined') window.ProtocoloBusqueda = ProtocoloBusqueda;
    if (typeof module !== 'undefined' && module.exports) module.exports = ProtocoloBusqueda;
})();
