// simulador/ui/resultado.js — resultado de la generación: vista previa, informe pedido vs. obtenido, diagnóstico, descargas y paso al Analizador.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { bus, EVENTOS } from '../../shared/eventos.js';
import { estado, CLAVES } from '../../shared/estado.js';
import { descargarArchivo } from '../../shared/descargas.js';
import { desplazarHacia, renderizarTablaDatos } from '../../shared/tabla-datos.js';
import { mostrarToast } from '../../shared/toast.js';
import { campoCSV } from '../../shared/csv.js';
import { escaparHTML } from '../../shared/html.js';

// window.datosGenerados: vista por OBJETOS de la base para el código que la
// espera así (gráficos, respaldos). Se materializa solo si alguien la lee:
// generar y descargar un CSV nunca paga ese coste.
function publicarDatosGenerados(base) {
    let valor;
    Object.defineProperty(window, 'datosGenerados', {
        configurable: true,
        enumerable: true,
        // Una sola copia: la vista por objetos vive en la caché de la propia base
        // (la misma que usa generadorDatos.obtenerDatosGenerados()).
        get() { return valor !== undefined ? valor : (base ? base.aObjetos() : null); },
        set(v) { valor = v; }
    });
    // Traspaso al Analizador sin importarlo: estado compartido + evento (el Analizador se suscribe)
    // La vista por objetos se calcula solo cuando alguien la pide (getter): con n grande cuesta tiempo y memoria,
    // y si el usuario no abre el Analizador no hace falta. La base la cachea una sola vez.
    // (2027.01.01) con los códigos de las categorías («0 = No, 1 = Sí»): el Analizador los necesita para saber qué categoría de
    // un desenlace binario es el 1
    const paquete = { get datos() { return base ? base.aObjetos() : null; }, etiquetas: generadorDatos.obtenerEtiquetas(), estructura: generadorDatos.obtenerEstructuraEscalas(), codigosDeCategorias: base && base.codigosDeCategorias ? base.codigosDeCategorias() : {} };
    estado.set(CLAVES.BASE_SIMULADOR, paquete);
    bus.emit(EVENTOS.BASE_GENERADA, paquete);
}

// ---- Diagnóstico visible de correlaciones incompatibles ----
function mostrarDiagnosticoCorrelaciones() {
    const cont = document.getElementById('diagnosticoCorrelaciones');
    if (!cont) return;
    const dg = generadorDatos.diagnosticoCorrelaciones;
    const limitadas = (dg && dg.limitadas) || [];
    const cal = dg && dg.calibracion;
    // Se muestra si la matriz pedida era imposible O si alguna r no es
    // alcanzable con las formas (asimétrica/uniforme), los recortes Likert o
    // las diferencias por grupo configurados (calibración sin converger).
    const hayLimite = limitadas.length > 0 || (cal && !cal.convergio) || (dg && dg.intermediaAjustada);
    if (!dg || (!dg.imposible && !hayLimite)) { cont.style.display = 'none'; cont.innerHTML = ''; return; }
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const tri = (dg.triadas || []).slice(0, 4).map(t =>
        `<li>${t.variables.map(esc).join(' · ')} — correlaciones pedidas ${t.correlaciones.map(x => x.toFixed(2)).join(', ')}</li>`).join('');
    const aj = (dg.ajustes || []).slice(0, 8).map(a =>
        `<li>${esc(a.a)} ↔ ${esc(a.b)}: <strong>${a.pedido.toFixed(2)} → ${a.ajustado.toFixed(2)}</strong></li>`).join('');
    const lim = limitadas.slice(0, 8).map(l =>
        `<li>${esc(l.a)} ↔ ${esc(l.b)}: pedida <strong>${l.pedido.toFixed(2)}</strong>, alcanzable ≈ <strong>${l.alcanzable.toFixed(2)}</strong></li>`).join('');
    const titulo = dg.imposible ? '⚠️ Correlaciones incompatibles entre sí' : '⚠️ Correlaciones fuera del alcance de la configuración';
    const intro = dg.imposible
        ? 'La combinación pedida no puede existir en ninguna muestra real (la matriz no es definida positiva). Se usó la <strong>matriz válida más cercana</strong>; revisa qué cambió y ajusta tus objetivos si lo necesitas.'
        : 'Con las formas de distribución (asimétrica/uniforme), los rangos Likert o las diferencias por grupo configurados, alguna correlación pedida no es alcanzable exactamente. Se generó la <strong>mejor aproximación</strong>; el informe «pedido vs. obtenido» muestra el valor real.';
    const notaCal = (cal && !cal.convergio)
        ? `<p class="help-text" style="margin:0.4rem 0 0;">La calibración exacta se detuvo con un error máximo de <strong>${cal.error.toFixed(3)}</strong> en alguna correlación: esa combinación no es alcanzable con las formas o rangos elegidos.</p>` : '';
    cont.innerHTML = `
        <h3 class="card-title">${titulo}</h3>
        <p class="help-text">${intro}</p>
        ${tri ? `<p style="margin:0.4rem 0 0.2rem;"><strong>Tríada(s) en conflicto:</strong></p><ul class="help-text">${tri}</ul>` : ''}
        ${aj ? `<p style="margin:0.4rem 0 0.2rem;"><strong>Correlaciones ajustadas:</strong></p><ul class="help-text">${aj}</ul>` : ''}
        ${lim ? `<p style="margin:0.4rem 0 0.2rem;"><strong>Correlaciones limitadas por la forma de las variables:</strong></p><ul class="help-text">${lim}</ul>` : ''}
        ${notaCal}`;
    cont.style.display = '';
    mostrarToast(dg.imposible
        ? '⚠ Algunas correlaciones pedidas eran incompatibles y se ajustaron: revisa el aviso bajo la vista previa'
        : '⚠ Alguna correlación pedida no es alcanzable con la configuración elegida: revisa el aviso bajo la vista previa', 'warning', 9000);
}

// ---- Informe pedido vs obtenido ----
/** @type {any[]} */
let ultimoInforme = [];

function mostrarInformePedidoObtenido(datos, filasPrecalculadas = null) {
    const cont = document.getElementById('informePedidoObtenido');
    const body = document.getElementById('bodyInforme');
    if (!cont || !body) return;
    ultimoInforme = filasPrecalculadas || generadorDatos.informePedidoObtenido(datos) || [];
    if (!ultimoInforme.length) { cont.style.display = 'none'; return; }
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    body.innerHTML = ultimoInforme.map(f => `<tr>
        <td>${esc(f.tipo)}</td><td>${esc(f.variable)}</td><td>${esc(f.pedido)}</td><td>${esc(f.obtenido)}${f.conImperfecciones !== undefined ? `<br><span class="help-text" title="Valor en la base final, con las imperfecciones pedidas">con imperfecciones: ${esc(f.conImperfecciones)}</span>` : ''}</td>
        <td>${f.ok === null ? '<span style="color:var(--color-text-secondary, #888);">informativa</span>' : f.ok ? '<span style="color:#2ea043;">✓ coincide</span>' : '<span style="color:#d4a72c;">⚠ se desvía</span>'}</td></tr>`).join('');
    cont.style.display = '';
    const btn = document.getElementById('btnDescargarInforme');
    if (btn && !btn._listo) {
        btn._listo = true;
        btn.addEventListener('click', () => {
            // (2026.12.30) todos los campos con comillas si hace falta: «Pedido» y «Obtenido» llevan comas («cortes en 20.00,
            // 36.00») y la fila salía con un campo de más
            const esc2 = campoCSV;
            const csv = 'Parametro,Variable,Pedido,Obtenido,Estado,ConImperfecciones\n'
                + ultimoInforme.map(f => `${esc2(f.tipo)},${esc2(f.variable)},${esc2(f.pedido)},${esc2(f.obtenido)},${f.ok === null ? 'informativa' : f.ok ? 'coincide' : 'se desvia'},${f.conImperfecciones !== undefined ? esc2(f.conImperfecciones) : ''}`).join('\n') + '\n';
            descargarArchivo(csv, 'informe_pedido_vs_obtenido.csv', 'text/csv');
        });
    }
}

function mostrarPreview(datos) {
    const container = document.getElementById('previewContainer');
    const config = generadorDatos.obtenerConfiguracion();
    // Actualizar estadísticas
    document.getElementById('statParticipantes').textContent = datos.length;
    document.getElementById('statVariables').textContent = (typeof datos.nombres === 'function') ? datos.nombres().length : Object.keys(datos[0]).length;
    // (B7) las ondas T2… son clones: se cuentan las pruebas configuradas, no las columnas de onda
    document.getElementById('statPruebas').textContent = (config.pruebas || []).filter(p => !p.sufijo).length;
    // Crear tabla preview (solo primeras 10 filas)
    renderizarTablaDatos(
        document.getElementById('previewHead'),
        document.getElementById('previewBody'),
        datos
    );
    // Mostrar container
    container.style.display = 'block';
    // Scroll suave hacia el preview
    desplazarHacia(container);
}

function habilitarDescargaCSV() {
    const btn = document.getElementById('btnDescargarCSV');
    btn.disabled = false;
    const btnIntl = document.getElementById('btnDescargarCSVIntl');
    if (btnIntl) btnIntl.disabled = false;
    const btnSav = document.getElementById('btnDescargarSAV');
    if (btnSav) btnSav.disabled = false;
    const btnXlsx = document.getElementById('btnDescargarXLSX');
    if (btnXlsx) btnXlsx.disabled = false;
}

function descargarCSVInternacional() {
    try {
        generadorDatos.descargarCSV('base_datos_simulada.csv', ',');
        mostrarToast('CSV descargado exitosamente', 'success');
    } catch (error) {
        // (2026.12.29) antes llamaba a mostrarNotificacion, que no existe: el error se convertía en otro (ReferenceError)
        mostrarToast('Error al descargar: ' + error.message, 'error');
    }
}

// (2026.12.29) La base como archivo de SPSS (.sav), con etiquetas de variable y de valor, niveles de medida y fechas.
function descargarSAV() {
    try {
        const avisos = generadorDatos.descargarSav('base_datos_simulada.sav');
        if (avisos.length) mostrarToast(`Archivo de SPSS descargado. Ajustes: ${avisos.join(' · ')}`, 'warning', 9000);
        else mostrarToast('Archivo de SPSS (.sav) descargado: ábrelo directamente en SPSS, PSPP, JASP o jamovi', 'success', 5000);
    } catch (error) {
        mostrarToast('Error al crear el archivo de SPSS: ' + error.message, 'error');
    }
}

// (2026.12.31) La base como libro de Excel (.xlsx): la hoja «Datos» (como el CSV, con las fechas como fechas), su
// «Diccionario» (etiquetas, niveles de medida y códigos) y el «Informe» de la generación (simulador/dominio/exportacion-xlsx.js).
// Se escribe por trozos y se comprime con el compresor del navegador: con una base grande tarda unos segundos, y el botón
// queda desactivado mientras tanto (dos clics seguidos no escriben dos libros).
let escribiendoXlsx = false;
async function descargarXLSX() {
    if (escribiendoXlsx) return;
    escribiendoXlsx = true;
    const btn = document.getElementById('btnDescargarXLSX');
    const estabaDesactivado = btn ? btn.disabled : false;
    if (btn) btn.disabled = true;
    const base = generadorDatos.datosGenerados;
    if (base && base.n * base.columnas.length > 500000) mostrarToast('Preparando el libro de Excel…', 'info', 4000);
    try {
        const avisos = await generadorDatos.descargarXlsx('base_datos_simulada.xlsx', { informe: ultimoInforme });
        if (avisos.length) mostrarToast(`Libro de Excel descargado. Ajustes: ${avisos.join(' · ')}`, 'warning', 9000);
        else mostrarToast('Libro de Excel (.xlsx) descargado: la base, su diccionario y el informe de la generación, cada uno en su hoja', 'success', 5000);
    } catch (error) {
        mostrarToast('Error al crear el libro de Excel: ' + error.message, 'error');
    } finally {
        escribiendoXlsx = false;
        if (btn) btn.disabled = estabaDesactivado;
    }
}

function descargarCSV() {
    try {
        generadorDatos.descargarCSV('base_datos_simulada.csv', ';');
        mostrarToast('CSV descargado exitosamente', 'success');
    } catch (error) {
        mostrarToast(error.message, 'error');
    }
}

function habilitarUsarGenerados() {
    const btn = document.getElementById('btnUsarGenerados');
    btn.disabled = false;
}

/**
 * (2026.12.31, revisión) Sin base generada, como antes de generar: al abrir un proyecto que no la trae, la base anterior deja
 * de estar a la vista, de descargarse y de poder pasarse al Analizador (antes quedaba, aunque ya no correspondiera a la
 * configuración abierta).
 */
function ocultarResultadoGeneracion() {
    generadorDatos.datosGenerados = null;
    generadorDatos.diagnosticoCorrelaciones = null;
    generadorDatos.resumenImperfecciones = null;
    generadorDatos.diferenciasLimitadas = [];
    ultimoInforme = [];
    estado.borrar(CLAVES.BASE_SIMULADOR);
    try { window.datosGenerados = null; } catch (e) { /* sin la vista por objetos */ }
    for (const id of ['previewContainer', 'informePedidoObtenido', 'diagnosticoCorrelaciones']) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }
    for (const id of ['btnDescargarCSV', 'btnDescargarCSVIntl', 'btnDescargarSAV', 'btnDescargarXLSX', 'btnUsarGenerados']) {
        const b = /** @type {HTMLButtonElement | null} */ (document.getElementById(id));
        if (b) b.disabled = true;
    }
}

/**
 * (2026.12.30) Los errores y los avisos de la validación, todos, en la tarjeta que hay bajo «Generar» (y nada si no hay).
 * Hasta la 2026.12.29 solo el primero salía en un aviso emergente, que el de «base generada» tapaba al momento: los demás
 * (el recorte de una sociodemográfica, una escala con un solo límite, una uniforme que no usa su promedio…) solo llegaban a
 * la consola.
 * @param {string[]} errores
 * @param {string[]} advertencias
 */
function mostrarAvisosDeValidacion(errores, advertencias) {
    const cont = document.getElementById('avisosGeneracion');
    if (!cont) return;
    const lista = errores.length ? errores : advertencias;
    if (!lista.length) { cont.style.display = 'none'; cont.innerHTML = ''; return; }
    const titulo = errores.length
        ? `❌ La configuración tiene ${errores.length === 1 ? 'un error' : `${errores.length} errores`}: corrígelo${errores.length === 1 ? '' : 's'} para generar`
        : `⚠️ ${advertencias.length === 1 ? 'Un aviso' : `${advertencias.length} avisos`} de la configuración`;
    cont.style.borderLeftColor = errores.length ? '#c0392b' : '#d4a72c';
    cont.innerHTML = `<h3 class="card-title">${titulo}</h3><ul class="help-text">${lista.map(a => `<li>${escaparHTML(a)}</li>`).join('')}</ul>`
        + (errores.length ? '' : '<p class="help-text" style="margin:0.4rem 0 0;">La base se genera igual: son límites del modelo que conviene conocer antes de usarla.</p>');
    cont.style.display = '';
}

export { mostrarAvisosDeValidacion, publicarDatosGenerados, mostrarDiagnosticoCorrelaciones, ultimoInforme, mostrarInformePedidoObtenido, mostrarPreview, habilitarDescargaCSV, descargarCSVInternacional, descargarCSV, descargarSAV, descargarXLSX, habilitarUsarGenerados, ocultarResultadoGeneracion };
