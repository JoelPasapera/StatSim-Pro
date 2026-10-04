// simulador/ui/resultado.js — resultado de la generación: vista previa, informe pedido vs. obtenido, diagnóstico, descargas y paso al Analizador.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { bus, EVENTOS } from '../../shared/eventos.js';
import { estado, CLAVES } from '../../shared/estado.js';
import { descargarArchivo } from '../../shared/descargas.js';
import { desplazarHacia, renderizarTablaDatos } from '../../shared/tabla-datos.js';
import { mostrarToast } from '../../shared/toast.js';

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
    const paquete = { get datos() { return base ? base.aObjetos() : null; }, etiquetas: generadorDatos.obtenerEtiquetas(), estructura: generadorDatos.obtenerEstructuraEscalas() };
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
            const esc2 = v => (String(v).includes(',') ? `"${v}"` : String(v));
            const csv = 'Parametro,Variable,Pedido,Obtenido,Estado,ConImperfecciones\n'
                + ultimoInforme.map(f => `${esc2(f.tipo)},${esc2(f.variable)},${f.pedido},${f.obtenido},${f.ok === null ? 'informativa' : f.ok ? 'coincide' : 'se desvia'},${f.conImperfecciones !== undefined ? esc2(f.conImperfecciones) : ''}`).join('\n') + '\n';
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
    document.getElementById('statPruebas').textContent = config.pruebas.filter(p => !p.sufijo).length;
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
}

function descargarCSVInternacional() {
    try {
        generadorDatos.descargarCSV('base_datos_simulada.csv', ',');
    } catch (error) {
        mostrarNotificacion('Error al descargar: ' + error.message, 'error');
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

export { publicarDatosGenerados, mostrarDiagnosticoCorrelaciones, ultimoInforme, mostrarInformePedidoObtenido, mostrarPreview, habilitarDescargaCSV, descargarCSVInternacional, descargarCSV, habilitarUsarGenerados };
