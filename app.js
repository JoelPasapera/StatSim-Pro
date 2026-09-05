// ========================================
// APP PRINCIPAL - COORDINADOR DE INTERFAZ
// ========================================
// ========================================
// NAVEGACIÓN
// ========================================
document.addEventListener('DOMContentLoaded', function () {
    inicializarApp();
});
function inicializarApp() {
    configurarNavegacion();
    configurarGenerador();
    configurarAnalizador();
}
function configurarNavegacion() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            // Actualizar navegación activa
            navLinks.forEach(l => {
                l.classList.remove('active');
                l.removeAttribute('aria-current');
            });
            this.classList.add('active');
            this.setAttribute('aria-current', 'page');
            // Mostrar sección correspondiente
            document.querySelectorAll('.section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(targetId).classList.add('active');
        });
    });
}
// ========================================
// CONFIGURACIÓN DEL GENERADOR
// ========================================
function configurarGenerador() {
    // Botón agregar prueba
    const _btnTest = document.getElementById('btnAgregarTest');
    if (_btnTest) _btnTest.addEventListener('click', agregarFilaTest);
    // Fila inicial del cuadro de tests + delegación para borrar.
    const _bodyTests = document.getElementById('bodyTests');
    if (_bodyTests) {
        if (!_bodyTests.querySelector('.fila-test')) agregarFilaTestConDatos({});
        _bodyTests.addEventListener('click', ev => {
            const btn = ev.target.closest('.btn-delete');
            if (!btn) return;
            btn.closest('tr').remove();
            refrescarSelectoresDePrueba();
        });
    }
    document.getElementById('btnAgregarPrueba').addEventListener('click', agregarFilaPrueba);
    // Botón agregar sociodemográfico
    document.getElementById('btnAgregarSocio').addEventListener('click', agregarFilaSocio);
    // Botón generar base de datos
    document.getElementById('btnGenerar').addEventListener('click', generarBaseDatos);
    // Botón descargar CSV
    document.getElementById('btnDescargarCSV').addEventListener('click', descargarCSV);
    const btnIntl = document.getElementById('btnDescargarCSVIntl');
    if (btnIntl) btnIntl.addEventListener('click', descargarCSVInternacional);
    // Botones importar/exportar pruebas
    document.getElementById('btnImportarPruebas').addEventListener('click', () => {
        document.getElementById('importPruebasInput').click();
    });
    document.getElementById('btnExportarPruebas').addEventListener('click', exportarConfigPruebas);
    document.getElementById('importPruebasInput').addEventListener('change', importarConfigPruebas);
    // Botones importar/exportar sociodemográficos
    document.getElementById('btnImportarSocio').addEventListener('click', () => {
        document.getElementById('importSocioInput').click();
    });
    document.getElementById('btnExportarSocio').addEventListener('click', exportarConfigSocio);
    // Correlaciones (tabla III) y maestros: mismo patrón que las tablas I y II.
    const _bIC = document.getElementById('btnImportarCorrelaciones');
    if (_bIC) _bIC.addEventListener('click', () => document.getElementById('importCorrelacionesInput').click());
    const _bEC = document.getElementById('btnExportarCorrelaciones');
    if (_bEC) _bEC.addEventListener('click', exportarConfigCorrelaciones);
    const _iC = document.getElementById('importCorrelacionesInput');
    if (_iC) _iC.addEventListener('change', importarConfigCorrelaciones);
    // La etiqueta de la columna objetivo sigue al índice elegido (α ↔ ω).
    const _selIF = document.getElementById('indiceFiabilidad');
    const _sincronizarEtiquetaFiabilidad = () => {
        const simbolo = (_selIF && _selIF.value === 'omega') ? 'ω' : 'α';
        const th = document.getElementById('thFiabilidad');
        if (th) th.firstChild ? th.firstChild.nodeValue = simbolo + ' objetivo' : th.textContent = simbolo + ' objetivo';
        document.querySelectorAll('.etiquetaFiabilidad').forEach(el => { el.textContent = simbolo; });
    };
    if (_selIF) { _selIF.addEventListener('change', _sincronizarEtiquetaFiabilidad); _sincronizarEtiquetaFiabilidad(); }
    const _bIT = document.getElementById('btnImportarTodo');
    if (_bIT) _bIT.addEventListener('click', () => document.getElementById('importTodoInput').click());
    const _bET = document.getElementById('btnExportarTodo');
    if (_bET) _bET.addEventListener('click', exportarConfigTodo);
    const _iT = document.getElementById('importTodoInput');
    if (_iT) _iT.addEventListener('change', importarConfigTodo);
    document.getElementById('importSocioInput').addEventListener('change', importarConfigSocio);
    // Delegación de eventos para botones de eliminar
    document.getElementById('bodyPruebas').addEventListener('click', function (e) {
        if (e.target.closest('.btn-delete')) {
            eliminarFilaPrueba(e.target.closest('tr'));
        }
    });
    // Límites de Media/DE en vivo: recalcular al escribir en cualquier campo de
    // la prueba, y ajustar al rango permitido al salir de Media/DE.
    const tbodyPruebas = document.getElementById('bodyPruebas');
    tbodyPruebas.addEventListener('input', function (e) {
        const fila = e.target.closest && e.target.closest('.fila-prueba');
        if (fila) actualizarLimitesPrueba(fila);
        if (e.target.getAttribute && e.target.getAttribute('aria-label') === 'Nombre de la prueba') {
            actualizarListaPruebas();
        }
    });
    tbodyPruebas.addEventListener('change', ajustarPruebaEnCambio);
    actualizarTodasLasPruebas(); // pase inicial sobre la fila de ejemplo
    // El límite inferior de DE (anti-escalera) depende de N: recalcular al cambiarlo.
    const inputN = document.getElementById('tamanoMuestra');
    if (inputN) inputN.addEventListener('input', actualizarTodasLasPruebas);
    document.getElementById('bodySocio').addEventListener('click', function (e) {
        if (e.target.closest('.btn-delete')) {
            eliminarFilaSocio(e.target.closest('tr'));
        }
    });
    // Sociodemográficos: los campos se desbloquean al escribir la Categoría
    const tbodySocio = document.getElementById('bodySocio');
    tbodySocio.addEventListener('input', function (e) {
        const fila = e.target.closest && e.target.closest('.fila-socio');
        if (fila) actualizarBloqueoSocio(fila);
    });
    actualizarTodosSocio();
    // Correlaciones objetivo
    const btnCorrelacion = document.getElementById('btnAgregarCorrelacion');
    if (btnCorrelacion) {
        btnCorrelacion.addEventListener('click', agregarFilaCorrelacion);
    }
    const bodyCorrelaciones = document.getElementById('bodyCorrelaciones');
    if (bodyCorrelaciones) {
        bodyCorrelaciones.addEventListener('click', function (e) {
            if (e.target.closest('.btn-delete')) {
                e.target.closest('tr').remove();
            }
        });
    }
    // Diferencias por grupo
    const btnDiferencia = document.getElementById('btnAgregarDiferencia');
    if (btnDiferencia) {
        btnDiferencia.addEventListener('click', agregarFilaDiferencia);
    }
    const bodyDiferencias = document.getElementById('bodyDiferencias');
    if (bodyDiferencias) {
        bodyDiferencias.addEventListener('click', function (e) {
            if (e.target.closest('.btn-delete')) {
                e.target.closest('tr').remove();
            }
        });
    }
}
// Variables que pueden usarse como agrupación: sociodemográficas Binaria o
// Categórica.
function obtenerVariablesAgrupacion() {
    const nombres = [];
    document.querySelectorAll('#bodySocio .fila-socio').forEach(fila => {
        const select = fila.querySelector('select');
        const dist = select ? select.value : 'normal';
        if (dist === 'binaria' || dist === 'categorica') {
            const categoria = fila.querySelector('input').value.trim();
            if (categoria) nombres.push(categoria);
        }
    });
    return nombres;
}
function agregarFilaDiferencia() {
    const cuantitativas = obtenerVariablesCorrelacionables();
    const agrupaciones = obtenerVariablesAgrupacion();
    if (cuantitativas.length === 0 || agrupaciones.length === 0) {
        mostrarToast('Necesitas al menos una variable cuantitativa y una de agrupación (Binaria o Categórica)', 'warning');
        return;
    }
    const tbody = document.getElementById('bodyDiferencias');
    const fila = document.createElement('tr');
    fila.className = 'fila-diferencia';
    const opcionesCuant = cuantitativas.map(n => `<option value="${n}">${n}</option>`).join('');
    const opcionesGrupo = agrupaciones.map(n => `<option value="${n}">${n}</option>`).join('');
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Variable cuantitativa"><option value="">Variable...</option>${opcionesCuant}</select></td>
        <td><select class="input input-sm" aria-label="Variable de agrupación"><option value="">Agrupación...</option>${opcionesGrupo}</select></td>
        <td><input type="number" class="input input-sm" step="0.1" placeholder="Ej: 0.5" aria-label="d de Cohen"></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(fila);
}
// Lista de variables que pueden correlacionarse: nombres de las escalas y de
// las sociodemográficas continuas (Normal/Asimétrica).
function obtenerVariablesCorrelacionables() {
    const nombres = [];
    document.querySelectorAll('#bodyPruebas .fila-prueba').forEach(fila => {
        const inputEscala = fila.querySelector('[aria-label="Nombre de la escala"]');
        const nombre = inputEscala ? inputEscala.value.trim() : '';
        if (nombre) nombres.push(nombre);
    });
    // Puntajes GENERALES derivados (tests con ≥2 dimensiones): correlacionables
    // porque el generador reparte la correlación pedida entre sus dimensiones.
    const filasPorTest = {};
    document.querySelectorAll('#bodyPruebas .fila-prueba').forEach(fila => {
        const sel = fila.querySelector('[aria-label="Nombre de la prueba"]');
        const p = sel ? sel.value.trim() : '';
        if (p) filasPorTest[p] = (filasPorTest[p] || 0) + 1;
    });
    (typeof testsDefinidos === 'function' ? testsDefinidos() : []).forEach(t => {
        if ((filasPorTest[t.prueba] || 0) >= 2)
            nombres.push(t.variable ? `${t.variable} — ${t.prueba}` : `Puntaje general — ${t.prueba}`);
    });
    document.querySelectorAll('#bodySocio .fila-socio').forEach(fila => {
        const select = fila.querySelector('select');
        const dist = select ? select.value : 'normal';
        if (dist === 'normal' || dist === 'asimetrica') {
            const categoria = fila.querySelector('input').value.trim();
            if (categoria) nombres.push(categoria);
        }
    });
    return nombres;
}
function agregarFilaCorrelacion() {
    const nombres = obtenerVariablesCorrelacionables();
    if (nombres.length < 2) {
        mostrarToast('Define al menos 2 variables cuantitativas (escalas o continuas) antes de añadir correlaciones', 'warning');
        return;
    }
    const tbody = document.getElementById('bodyCorrelaciones');
    const fila = document.createElement('tr');
    fila.className = 'fila-correlacion';
    const opciones = nombres.map(n => `<option value="${n}">${n}</option>`).join('');
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Variable A"><option value="">Variable A...</option>${opciones}</select></td>
        <td><select class="input input-sm" aria-label="Variable B"><option value="">Variable B...</option>${opciones}</select></td>
        <td><input type="number" class="input input-sm" step="0.05" min="-0.99" max="0.99" placeholder="Ej: 0.5" aria-label="Correlación objetivo"></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(fila);
}
function agregarFilaPrueba() {
    const tbody = document.getElementById('bodyPruebas');
    const nuevaFila = tbody.querySelector('.fila-prueba').cloneNode(true);
    // Limpiar valores y estado de validación heredado del clon
    nuevaFila.querySelectorAll('input').forEach(input => {
        input.value = '';
        input.classList.remove('invalid');
    });
    // Reset de límites dinámicos solo en Media/DE (los de ítems y α son fijos)
    const ioNueva = inputsPrueba(nuevaFila);
    [ioNueva.media, ioNueva.de].forEach(inp => { if (inp) { inp.removeAttribute('min'); inp.removeAttribute('max'); } });
    tbody.appendChild(nuevaFila);
    actualizarLimitesPrueba(nuevaFila);
    mostrarToast('Fila agregada', 'success');
}
function eliminarFilaPrueba(fila) {
    const tbody = document.getElementById('bodyPruebas');
    const filas = tbody.querySelectorAll('.fila-prueba');
    if (filas.length <= 1) {
        mostrarToast('Debe haber al menos una prueba', 'warning');
        return;
    }
    fila.remove();
    mostrarToast('Fila eliminada', 'success');
}
function agregarFilaSocio() {
    const tbody = document.getElementById('bodySocio');
    const nuevaFila = tbody.querySelector('.fila-socio').cloneNode(true);
    // Limpiar valores
    nuevaFila.querySelectorAll('input').forEach(input => {
        input.value = '';
    });
    tbody.appendChild(nuevaFila);
    actualizarBloqueoSocio(nuevaFila);
    mostrarToast('Variable agregada', 'success');
}
function eliminarFilaSocio(fila) {
    const tbody = document.getElementById('bodySocio');
    const filas = tbody.querySelectorAll('.fila-socio');
    if (filas.length <= 1) {
        mostrarToast('Debe haber al menos una variable sociodemográfica', 'warning');
        return;
    }
    fila.remove();
    mostrarToast('Variable eliminada', 'success');
}
// ========================================
// MOTOR DE GENERACIÓN (B4): Web Worker con respaldo en el hilo principal
// ========================================
// La base se genera en generador-worker.js, fuera del hilo de la interfaz:
// la página sigue respondiendo y muestra el avance. Si el Worker no está
// disponible (archivo no subido, protocolo file://), se genera en el hilo
// principal como antes. El resultado es la misma BaseColumnar en ambos casos.
const MotorGeneracion = (() => {
    // Versión de generador-worker.js: súbela cuando cambie ese archivo (no
    // tiene etiqueta <script> en index.html, así que se declara aquí).
    const VERSION_WORKER = 1;
    let worker = null;
    let contador = 0;

    // ?v= de un módulo tal como lo carga index.html, para que el Worker
    // importe exactamente la misma versión (una sola fuente: index.html).
    const versionDe = (archivo) => {
        const etiqueta = document.querySelector(`script[src^="${archivo}"]`);
        const m = etiqueta && /[?&]v=([^&]+)/.exec(etiqueta.getAttribute('src') || '');
        return m ? m[1] : '1';
    };
    const crearWorker = () => new Worker(`generador-worker.js?v=${VERSION_WORKER}&b=${encodeURIComponent(versionDe('base-columnar.js'))}&g=${encodeURIComponent(versionDe('generador-datos.js'))}`);

    function generarConWorker(configuracion, alProgresar) {
        return new Promise((resolver, rechazar) => {
            if (typeof Worker === 'undefined') { const e = new Error('Sin Web Workers'); e.esFalloDelWorker = true; rechazar(e); return; }
            if (!worker) worker = crearWorker();
            const id = ++contador;
            const w = worker;
            const limpiar = () => { w.onmessage = null; w.onerror = null; };
            w.onmessage = (evento) => {
                const m = evento.data || {};
                if (m.id !== id) return;
                if (m.tipo === 'progreso') { if (alProgresar) alProgresar(m.fraccion, m.etapa); return; }
                limpiar();
                if (m.tipo === 'error') { rechazar(new Error(m.mensaje)); return; }
                resolver({
                    base: BaseColumnar.desdeSerializado(m.base),
                    informe: m.informe || [],
                    diagnosticoCorrelaciones: m.diagnosticoCorrelaciones,
                    resumenImperfecciones: m.resumenImperfecciones,
                    diferenciasLimitadas: m.diferenciasLimitadas || [],
                    ms: m.ms
                });
            };
            w.onerror = (evento) => {
                // Fallo del propio Worker (archivo no encontrado, error de carga):
                // se descarta y el llamador cae al respaldo en el hilo principal.
                limpiar();
                try { w.terminate(); } catch (e) { /* nada */ }
                worker = null;
                const e = new Error(evento && evento.message ? evento.message : 'El Worker de generación no pudo iniciarse');
                e.esFalloDelWorker = true;
                if (evento && evento.preventDefault) evento.preventDefault();
                rechazar(e);
            };
            w.postMessage({ id, configuracion });
        });
    }

    function generarEnHilo(configuracion, alProgresar) {
        return new Promise((resolver, rechazar) => {
            // setTimeout: deja que la interfaz pinte el estado «generando» antes
            // de bloquear el hilo.
            setTimeout(() => {
                try {
                    generadorDatos.configuracion = configuracion;
                    const inicio = Date.now();
                    const base = generadorDatos.generarBaseDatos(alProgresar);
                    resolver({
                        base,
                        informe: generadorDatos.informePedidoObtenido(base) || [],
                        diagnosticoCorrelaciones: generadorDatos.diagnosticoCorrelaciones,
                        resumenImperfecciones: generadorDatos.resumenImperfecciones,
                        diferenciasLimitadas: generadorDatos.diferenciasLimitadas || [],
                        ms: Date.now() - inicio
                    });
                } catch (error) { rechazar(error); }
            }, 50);
        });
    }

    // Genera con la configuración dada (objeto plano). Devuelve una promesa con
    // { base, informe, diagnosticoCorrelaciones, resumenImperfecciones, ... }.
    function generar(configuracion, alProgresar) {
        return generarConWorker(configuracion, alProgresar).catch(error => {
            if (!error || !error.esFalloDelWorker) throw error;
            console.warn('[MotorGeneracion] Worker no disponible, se genera en el hilo principal:', error.message);
            return generarEnHilo(configuracion, alProgresar);
        });
    }

    return { generar };
})();

// Barra de progreso de la generación (marcado en index.html: #progresoGeneracion)
function mostrarProgresoGeneracion(fraccion, etapa) {
    const cont = document.getElementById('progresoGeneracion');
    if (!cont) return;
    const relleno = cont.querySelector('.progreso-generacion__relleno');
    const texto = cont.querySelector('.progreso-generacion__texto');
    const pct = Math.max(0, Math.min(100, Math.round((fraccion || 0) * 100)));
    if (relleno) relleno.style.width = pct + '%';
    if (texto) texto.textContent = `${etapa || 'Generando'}… ${pct} %`;
    cont.setAttribute('aria-valuenow', String(pct));
    cont.hidden = false;
}
function ocultarProgresoGeneracion() {
    const cont = document.getElementById('progresoGeneracion');
    if (cont) cont.hidden = true;
}

// window.datosGenerados: vista por OBJETOS de la base para el código que la
// espera así (gráficos, respaldos). Se materializa solo si alguien la lee:
// generar y descargar un CSV nunca paga ese coste.
function publicarDatosGenerados(base) {
    let valor;
    Object.defineProperty(window, 'datosGenerados', {
        configurable: true,
        enumerable: true,
        get() { if (valor === undefined) valor = base ? base.aObjetos() : null; return valor; },
        set(v) { valor = v; }
    });
}

function generarBaseDatos() {
    try {
        if (typeof BaseColumnar === 'undefined') {
            throw new Error('Falta base-columnar.js: en index.html debe cargarse antes de generador-datos.js');
        }
        // Recolectar configuración
        generadorDatos.recolectarConfiguracion();
        // Validar
        const validacion = generadorDatos.validarConfiguracion();
        if (validacion.errores.length > 0) {
            mostrarToast('Error: ' + validacion.errores[0], 'error');
            return;
        }
        if (validacion.advertencias.length > 0) {
            console.warn('Advertencias:', validacion.advertencias);
            // Mostrar la primera advertencia de forma visible (la más relevante
            // suele ser la de factibilidad de la Media/DE frente al rango).
            mostrarToast('⚠ ' + validacion.advertencias[0], 'warning', 9000);
        }
        // Generar datos (asíncrono: Worker o respaldo en el hilo)
        const boton = document.getElementById('btnGenerar');
        boton.disabled = true; // Evitar doble ejecución mientras se procesa
        mostrarProgresoGeneracion(0, 'Preparando');
        const configuracion = JSON.parse(JSON.stringify(generadorDatos.obtenerConfiguracion()));
        MotorGeneracion.generar(configuracion, mostrarProgresoGeneracion)
            .then(resultado => {
                // El generador de la página queda con el resultado, igual que si
                // hubiera generado él mismo (descargas, etiquetas, Analizador).
                generadorDatos.datosGenerados = resultado.base;
                generadorDatos.diagnosticoCorrelaciones = resultado.diagnosticoCorrelaciones;
                generadorDatos.resumenImperfecciones = resultado.resumenImperfecciones;
                generadorDatos.diferenciasLimitadas = resultado.diferenciasLimitadas;
                publicarDatosGenerados(resultado.base);
                mostrarPreview(resultado.base);
                mostrarDiagnosticoCorrelaciones();
                mostrarInformePedidoObtenido(resultado.base, resultado.informe);
                habilitarDescargaCSV();
                habilitarUsarGenerados();
                const ri = resultado.resumenImperfecciones || {};
                const partesRi = [];
                if (ri.perdidos) partesRi.push(`${ri.perdidos} valores perdidos`);
                if (ri.descuidados) partesRi.push(`${ri.descuidados} respondientes descuidados`);
                if (ri.digitacion) partesRi.push(`${ri.digitacion} errores de digitación`);
                const tiempo = resultado.ms >= 1000 ? ` (${(resultado.ms / 1000).toFixed(1)} s)` : '';
                mostrarToast(partesRi.length ? `Base generada con imperfecciones realistas: ${partesRi.join(' · ')}${tiempo}` : `¡Base de datos generada exitosamente!${tiempo}`, 'success', partesRi.length ? 8000 : undefined);
            })
            .catch(error => {
                mostrarToast(error.message, 'error');
                console.error(error);
            })
            .finally(() => {
                boton.disabled = false;
                ocultarProgresoGeneracion();
            });
    } catch (error) {
        mostrarToast(error.message, 'error');
        console.error(error);
        const boton = document.getElementById('btnGenerar');
        if (boton) boton.disabled = false;
        ocultarProgresoGeneracion();
    }
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
        <td>${esc(f.tipo)}</td><td>${esc(f.variable)}</td><td>${esc(f.pedido)}</td><td>${esc(f.obtenido)}</td>
        <td>${f.ok ? '<span style="color:#2ea043;">✓ coincide</span>' : '<span style="color:#d4a72c;">⚠ se desvía</span>'}</td></tr>`).join('');
    cont.style.display = '';
    const btn = document.getElementById('btnDescargarInforme');
    if (btn && !btn._listo) {
        btn._listo = true;
        btn.addEventListener('click', () => {
            const esc2 = v => (String(v).includes(',') ? `"${v}"` : String(v));
            const csv = 'Parametro,Variable,Pedido,Obtenido,Estado\n'
                + ultimoInforme.map(f => `${esc2(f.tipo)},${esc2(f.variable)},${f.pedido},${f.obtenido},${f.ok ? 'coincide' : 'se desvia'}`).join('\n') + '\n';
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
    document.getElementById('statPruebas').textContent = config.pruebas.length;
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
    if (typeof ComparacionGrupos !== 'undefined') ComparacionGrupos.actualizarSelects();
    if (typeof RegresionMultiple !== 'undefined') RegresionMultiple.actualizarSelects();
    // Selects opcionales de la regresión bivariada (con opción en blanco).
    try {
        const nums = (typeof obtenerColumnasNumericas === 'function') ? obtenerColumnasNumericas(datos) : [];
        ['regDep', 'regInd'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="">Seleccionar variable…</option>'
                + nums.map(c => `<option value="${c}">${obtenerEtiquetaOpcion(c)}</option>`).join('');
        });
    } catch (e) { /* opcional */ }
    // Selects opcionales de la regresión bivariada (con opción en blanco).
    try {
        const nums = (typeof obtenerColumnasNumericas === 'function') ? obtenerColumnasNumericas(datos) : [];
        ['regDep', 'regInd'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="">Seleccionar variable…</option>'
                + nums.map(c => `<option value="${c}">${obtenerEtiquetaOpcion(c)}</option>`).join('');
        });
    } catch (e) { /* opcional */ }
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
// ========================================
// CONFIGURACIÓN DEL ANALIZADOR
// ========================================
function configurarAnalizador() {
    // Botón usar datos generados
    document.getElementById('btnUsarGenerados').addEventListener('click', cargarDatosGenerados);
    // Input file CSV
    document.getElementById('fileInput').addEventListener('change', cargarArchivoCSV);
    // Editor de etiquetas SIEMPRE visible: antes de cargar datos muestra su
    // versión de espera para que la función sea descubrible.
    if (typeof EtiquetasVariables !== 'undefined' && EtiquetasVariables.mostrarVacio) {
        EtiquetasVariables.mostrarVacio('editorEtiquetas');
    }
    // Botón analizar (ejecutarAnalisis ya inicializa los gráficos al final)
    document.getElementById('btnAnalizar').addEventListener('click', ejecutarAnalisis);
    // Cambio de tipo de análisis: actualizar las etiquetas de los selectores
    const bAV = document.getElementById('btnAgregarVariable');
    if (bAV) bAV.addEventListener('click', agregarVariableExtra);
    const bAP = document.getElementById('btnAgregarPredictor');
    if (bAP) bAP.addEventListener('click', agregarPredictorExtra);
    actualizarTituloRegresion();
    try { actualizarEtiquetasAnalisis(); } catch (e) {}
    document.querySelectorAll('input[name="tipoAnalisis"]').forEach(radio => {
        radio.addEventListener('change', actualizarEtiquetasAnalisis);
    });
    // Botón descargar resultados
    document.getElementById('btnDescargarResultados').addEventListener('click', descargarResultados);
    const btnWord = document.getElementById('btnExportarWord');
    if (btnWord) btnWord.addEventListener('click', () => ExportadorWord.descargar(window.ultimoAnalisis));
}
// Ajusta las etiquetas de los selectores según el tipo de análisis elegido.
function actualizarEtiquetasAnalisis() {
    const seleccionado = document.querySelector('input[name="tipoAnalisis"]:checked');
    const tipo = seleccionado ? seleccionado.value : 'correlacion';
    const label1 = document.getElementById('labelVariable1');
    const label2 = document.getElementById('labelVariable2');
    if (tipo === 'comparacion') {
        if (label1) label1.textContent = 'Variable cuantitativa';
        if (label2) label2.textContent = 'Variable de agrupación';
    } else if (tipo === 'asociacion') {
        if (label1) label1.textContent = 'Variable categórica 1';
        if (label2) label2.textContent = 'Variable categórica 2';
    } else {
        if (label1) label1.textContent = 'Variable 1';
        if (label2) label2.textContent = 'Variable 2';
    }
    const hintTA = document.getElementById('hintTipoAnalisis');
    if (hintTA) {
        const textos = {
            correlacion: 'Finalidad: medir si dos variables cuantitativas se mueven juntas — la dirección (positiva/negativa) y la fuerza de esa asociación. Responde a preguntas como «¿a mayor inteligencia emocional, mayor rendimiento?» (asociación, no causa).',
            comparacion: 'Finalidad: comprobar si los grupos de una variable categórica difieren en una variable numérica (p. ej., ¿difiere el puntaje entre hombres y mujeres, o entre carreras?).',
            asociacion: 'Finalidad: evaluar si dos variables categóricas están relacionadas entre sí (p. ej., ¿el sexo se asocia con la elección de carrera?).'
        };
        hintTA.textContent = textos[tipo] || '';
    }
}
function cargarDatosGenerados() {
    try {
        // Verificar que AnalizadorEstadistico esté disponible
        //if (typeof AnalizadorEstadistico === 'undefined') {
        //    mostrarToast('Error: El analizador estadístico no está cargado. Recarga la página.', 'error');
        //    return;
        //}
        const datos = generadorDatos.obtenerDatosGenerados();
        if (!datos || datos.length === 0) {
            mostrarToast('No hay datos generados. Genera una base de datos primero.', 'warning');
            return;
        }
        if (typeof window.AnalizadorEstadistico === 'undefined') {
            mostrarToast('Error: AnalizadorEstadistico indefinido', 'error');
            return;
        }
        window.AnalizadorEstadistico.cargarDatos(datos);
        // Registrar etiquetas humanas y estructura de pruebas (estilo SPSS):
        // la interfaz mostrará "Inteligencia Cognitiva" en vez de "Total_IC".
        // Con datos del simulador NO se ofrece el editor: las etiquetas son las
        // configuradas en la sección Simulador.
        if (typeof EtiquetasVariables !== 'undefined' && generadorDatos.obtenerEtiquetas) {
            EtiquetasVariables.fijar(
                generadorDatos.obtenerEtiquetas(),
                generadorDatos.obtenerEstructuraEscalas()
            );
            if (EtiquetasVariables.mostrarVacio) {
                EtiquetasVariables.mostrarVacio('editorEtiquetas', '🧪 Datos del Simulador: las etiquetas ya vienen configuradas desde la sección Simulador, así que aquí no hay nada que renombrar. Este editor se activa al subir un CSV externo.');
            } else {
                EtiquetasVariables.ocultarEditor('editorEtiquetas');
            }
        }
        mostrarDatosCargados(datos);
        mostrarToast('Datos cargados exitosamente', 'success');
        // Almacenar datos generados globalmente para los gráficos
        window.datosGenerados = datos;
    } catch (error) {
        mostrarToast(error.message, 'error');
    }
}
function cargarArchivoCSV(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
        mostrarToast('Por favor selecciona un archivo CSV', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const csvText = event.target.result;
            AnalizadorEstadistico.cargarDesdeCSV(csvText);
            const datos = AnalizadorEstadistico.obtenerDatos();
            // Base de datos EXTERNA: no hay etiquetas del simulador. Se limpian
            // las anteriores y se ofrece el editor para renombrar variables.
            if (typeof EtiquetasVariables !== 'undefined') {
                EtiquetasVariables.limpiar();
                // Columnas totalmente vacías: el editor avisará si alguna es de puntaje.
                const _numericas = obtenerColumnasNumericas(datos);
                EtiquetasVariables._columnasVacias = Object.keys(datos[0] || {}).filter(c =>
                    c !== 'ID' && !_numericas.includes(c) &&
                    datos.every(f => f[c] === '' || f[c] === null || f[c] === undefined || (typeof f[c] === 'number' && isNaN(f[c])))
                );
                EtiquetasVariables.mostrarEditor('editorEtiquetas', _numericas, function () {
                    poblarSelectsVariables(AnalizadorEstadistico.obtenerDatos());
                    // Si ya hay un análisis en pantalla y las dos variables siguen
                    // seleccionadas, se regenera solo con los nuevos nombres.
                    const marcoVisible = document.getElementById('marcoMetodologicoContainer');
                    const v1 = document.getElementById('variable1').value;
                    const v2 = document.getElementById('variable2').value;
                    if (marcoVisible && marcoVisible.style.display !== 'none' && v1 && v2) {
                        ejecutarAnalisis();
                        mostrarToast('Etiquetas aplicadas: el reporte se regeneró con los nuevos nombres', 'success');
                    } else {
                        mostrarToast('Etiquetas aplicadas: los textos del análisis usarán los nuevos nombres', 'success');
                    }
                });
            }
            mostrarDatosCargados(datos);
            mostrarToast('Archivo CSV cargado exitosamente', 'success');
        } catch (error) {
            mostrarToast(error.message, 'error');
        }
    };
    reader.onerror = function () {
        mostrarToast('No se pudo leer el archivo', 'error');
    };
    reader.readAsText(file);
}
function mostrarDatosCargados(datos) {
    const container = document.getElementById('datosContainer');
    const seleccionContainer = document.getElementById('seleccionContainer');
    // Actualizar estadísticas
    document.getElementById('analisisN').textContent = datos.length;
    document.getElementById('analisisVars').textContent = Object.keys(datos[0]).length;
    // Crear tabla (primeras 10 filas)
    renderizarTablaDatos(
        document.getElementById('analisisHead'),
        document.getElementById('analisisBody'),
        datos
    );
    poblarSelectsVariables(datos);
    // Configurador de dimensiones: detección automática editable
    if (typeof Fiabilidad !== 'undefined' && Fiabilidad.mostrarConfigurador) {
        Fiabilidad.mostrarConfigurador('configuradorDimensiones', datos);
    }
    // Mostrar containers
    container.style.display = 'block';
    seleccionContainer.style.display = 'block';
    // Scroll
    desplazarHacia(container);
}
// Columnas numéricas analizables del dataset (excluye el identificador).
function obtenerColumnasNumericas(datos) {
    if (!datos || datos.length === 0) return [];
    return Object.keys(datos[0]).filter(col => {
        if (col === 'ID') return false;
        return typeof datos[0][col] === 'number' || !isNaN(parseFloat(datos[0][col]));
    });
}
// Puebla los selectores de variables del analizador. Reutilizable: se llama al
// cargar datos y también al aplicar nuevas etiquetas (para refrescar los textos).
function poblarSelectsVariables(datos) {
    try { window.__numsDisponibles = (typeof obtenerColumnasNumericas === 'function') ? obtenerColumnasNumericas(datos) : []; } catch (e) { window.__numsDisponibles = []; }
    const bAV = document.getElementById('btnAgregarVariable');
    if (bAV) bAV.style.display = (window.__numsDisponibles.length >= 3) ? '' : 'none';
    document.querySelectorAll('#varsExtraCont select, #regPredsCont select').forEach(s => {
        const val = s.value;
        s.innerHTML = '<option value="">Seleccionar variable…</option>' + window.__numsDisponibles.map(c => `<option value="${c}">${obtenerEtiquetaOpcion(c)}</option>`).join('');
        
        s.value = val;
    });
    if (typeof ComparacionGrupos !== 'undefined') ComparacionGrupos.actualizarSelects();
    if (typeof RegresionMultiple !== 'undefined') RegresionMultiple.actualizarSelects();
    // Selects opcionales de la regresión bivariada (con opción en blanco).
    try {
        const nums = (typeof obtenerColumnasNumericas === 'function') ? obtenerColumnasNumericas(datos) : [];
        ['regDep', 'regInd'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="">Seleccionar variable…</option>'
                + nums.map(c => `<option value="${c}">${obtenerEtiquetaOpcion(c)}</option>`).join('');
        });
    } catch (e) { /* opcional */ }
    const columnasNumericas = obtenerColumnasNumericas(datos);
    const select1 = document.getElementById('variable1');
    const select2 = document.getElementById('variable2');
    const valor1 = select1.value, valor2 = select2.value; // conservar selección
    select1.innerHTML = '<option value="">Seleccionar variable...</option>';
    select2.innerHTML = '<option value="">Seleccionar variable...</option>';
    columnasNumericas.forEach(col => {
        const nombre = col.trim();
        // Mostrar la etiqueta humana ("Inteligencia Cognitiva (Total_IC)");
        // el value conserva el nombre técnico de la columna.
        const texto = (typeof EtiquetasVariables !== 'undefined')
            ? EtiquetasVariables.etiquetaConColumna(nombre)
            : nombre;
        const option1 = document.createElement('option');
        option1.value = nombre;
        option1.textContent = texto;
        select1.appendChild(option1);
        const option2 = document.createElement('option');
        option2.value = nombre;
        option2.textContent = texto;
        select2.appendChild(option2);
    });
    // Restaurar la selección previa si las columnas siguen existiendo
    if (valor1) select1.value = valor1;
    if (valor2) select2.value = valor2;
}
// Oculta y vacía todos los contenedores de resultados antes de cada análisis,
// para que no se mezclen salidas de correlación y de comparación de grupos.
function limpiarResultados() {
    const ids = [
        'marcoMetodologicoContainer', 'resultadosDescriptivas', 'resultadosFiabilidad',
        'pruebasNormalidadContainer', 'resultadosCorrelacion', 'resultadosRegresion',
        'resultadosDispersion', 'resultadosDecision', 'resultadosReporteAPA',
        'resultadosDimensiones', 'resultadosDiscusion', 'resultadosContainer',
        'resultadosComparacion', 'resultadosChiCuadrado'
    ];
    ids.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) {
            elem.style.display = 'none';
            elem.innerHTML = '';
        }
    });
}
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
    const marco = generarMarcoParaAnalisis(var1, var2, et1, et2, unidadAnalisis, lugarContexto, criba);
    const resultado = AnalizadorEstadistico.calcularCorrelacion(var1, var2, tipoPrueba);
    // Análisis de objetivos específicos como HTML, para incrustarlo DENTRO del
    // bloque del marco. El guard (&& generarContenido) evita romper el análisis
    // si el módulo cargado fuera una versión anterior.
    const analisisDimensiones = (typeof AnalisisDimensiones !== 'undefined' && AnalisisDimensiones.generarContenido)
        ? AnalisisDimensiones.generarContenido(var1, var2, tipoPrueba, unidadAnalisis, lugarContexto)
        : '';
    // Contexto del último análisis (lo consume el exportador a Word)
    const tituloTesis = (document.getElementById('tituloTesis') || { value: '' }).value.trim();
    window.ultimoAnalisis = { var1, var2, et1, et2, resultado, marco, criba, tipoPrueba, unidadAnalisis, lugarContexto, tituloTesis };
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
// Columnas categóricas del dataset cargado (texto, sin contar ID), para los
// objetivos comparativos del marco. Limitadas a un máximo razonable.
function obtenerColumnasCategoricas(maximo) {
    const datos = AnalizadorEstadistico.obtenerDatos() || [];
    if (datos.length === 0) return [];
    return Object.keys(datos[0])
        .filter(col => col !== 'ID')
        .filter(col => {
            const v = datos[0][col];
            return typeof v === 'string' && isNaN(parseFloat(v));
        })
        .slice(0, maximo || 4);
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
function mostrarChiCuadrado(var1, var2, resultado) {
    const container = document.getElementById('resultadosChiCuadrado');
    if (!container) return;
    const significativa = resultado.decision === 'rechazar';
    // Tabla de contingencia (frecuencias observadas con totales)
    const encabezado = `<tr><th>${var1} \\ ${var2}</th>${resultado.categorias2.map(c => `<th>${c}</th>`).join('')}<th>Total</th></tr>`;
    const filas = resultado.observadas.map((fila, i) =>
        `<tr><td><strong>${resultado.categorias1[i]}</strong></td>${fila.map(o => `<td>${o}</td>`).join('')}<td><strong>${resultado.totalFila[i]}</strong></td></tr>`
    ).join('');
    const totalFinal = `<tr><td><strong>Total</strong></td>${resultado.totalColumna.map(t => `<td><strong>${t}</strong></td>`).join('')}<td><strong>${resultado.n}</strong></td></tr>`;
    const avisoEsperadas = resultado.esperadasBajas > 0
        ? `<p class="result-subtitle" style="color: #b45309; margin-top: 0.5rem;">⚠️ ${resultado.esperadasBajas} casilla(s) tienen una frecuencia esperada menor que 5; la prueba de chi-cuadrado puede no ser fiable (considera la prueba exacta de Fisher).</p>`
        : '';
    const pTexto = resultado.pValor < 0.001 ? 'p < .001' : 'p = ' + resultado.pValor.toFixed(3).replace(/^0/, '');
    const interpretacion = significativa
        ? `Existe una asociación estadísticamente significativa entre ${var1} y ${var2} (χ²(${resultado.gl}) = ${resultado.chiCuadrado.toFixed(2)}, ${pTexto}). La V de Cramér (${resultado.cramerV.toFixed(3)}) indica una ${interpretarCramerV(resultado.cramerV)}. Las dos variables no son independientes.`
        : `No se halló una asociación estadísticamente significativa entre ${var1} y ${var2} (χ²(${resultado.gl}) = ${resultado.chiCuadrado.toFixed(2)}, ${pTexto}); las variables pueden considerarse independientes.`;
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Asociación de Variables Categóricas (Chi-cuadrado)</h3>
            <p class="result-subtitle">Prueba de independencia entre <strong>${var1}</strong> y <strong>${var2}</strong>. Evalúa si las dos variables categóricas están asociadas; la V de Cramér mide la fuerza de la asociación.</p>
            <div class="result-box" style="overflow-x: auto;">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Tabla de contingencia (frecuencias observadas)</h5>
                <table class="result-table">
                    ${encabezado}
                    ${filas}
                    ${totalFinal}
                </table>
                ${avisoEsperadas}
            </div>
            <div class="result-box">
                <table class="result-table">
                    <tr><td>Chi-cuadrado de Pearson:</td><td><strong>χ²(${resultado.gl}) = ${resultado.chiCuadrado.toFixed(3)}</strong></td></tr>
                    <tr><td>p-valor:</td><td><strong>${fmtPApp(resultado.pValor)}</strong></td></tr>
                    <tr><td>V de Cramér (tamaño del efecto):</td><td><strong>${resultado.cramerV.toFixed(3)}</strong> (${interpretarCramerV(resultado.cramerV)})</td></tr>
                    <tr><td>N:</td><td>${resultado.n}</td></tr>
                    <tr><td>Decisión sobre H₀:</td><td class="${significativa ? 'decision-reject' : 'decision-accept'}"><strong>${significativa ? 'SE RECHAZA H₀' : 'NO SE RECHAZA H₀'}</strong></td></tr>
                </table>
            </div>
            <div class="result-box interpretation-box interpretation-box--hipotesis">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/></svg>
                    Interpretación
                </h5>
                <p class="interpretation-text">${interpretacion}</p>
            </div>
        </div>`;
    container.style.display = 'block';
    desplazarHacia(container);
}
function mostrarMarcoMetodologico(marco, analisisDimensionesHTML) {
    const container = document.getElementById('marcoMetodologicoContainer');
    if (!container) {
        console.warn('No existe elemento #marcoMetodologicoContainer en el HTML');
        return;
    }
    let html = `
        <div class="result-section">
            <h3 class="section-title">📋 Marco Metodológico</h3>
            
            <div class="result-box">
                <h4 class="result-subtitle">❓ Pregunta de Investigación</h4>
                <p class="marco-text">${marco.preguntaInvestigacion}</p>
            </div>
            
            <div class="result-box">
                <h4 class="result-subtitle">🎯 Objetivo General</h4>
                <p class="marco-text">${marco.objetivoGeneral}</p>
            </div>
            
            <div class="result-box">
                <h4 class="result-subtitle">📋 Objetivos Específicos</h4>
                <ol class="marco-list">
                    ${marco.objetivosEspecificos.map(obj => `<li>${obj}</li>`).join('')}
                </ol>
                ${analisisDimensionesHTML || ''}
            </div>
            
            <div class="result-box">
                <h4 class="result-subtitle">💡 Hipótesis de Investigación (H₁)</h4>
                <p class="marco-text">${marco.hipotesis.hipotesisInvestigador}</p>
            </div>
            
            <div class="result-box">
                <h4 class="result-subtitle">❌ Hipótesis Nula (H₀)</h4>
                <p class="marco-text">${marco.hipotesis.hipotesisNula}</p>
            </div>
            ${marco.tipoYDiseno ? `
            <div class="result-box">
                <h4 class="result-subtitle">🧭 Tipo y diseño de estudio</h4>
                ${marco.tipoYDiseno.split('\n\n').map(p => `<p class="marco-text" style="text-align: justify;">${p}</p>`).join('')}
            </div>` : ''}
        </div>
    `;
    container.innerHTML = html;
    container.style.display = 'block';
}
function mostrarPruebasNormalidad(var1, var2, resultado) {
    const container = document.getElementById('pruebasNormalidadContainer');
    if (!container) {
        console.warn('No existe elemento #pruebasNormalidadContainer en el HTML');
        return;
    }
    const html = `
        <div class="result-section">
            <h3 class="section-title">Pruebas de normalidad</h3>
            <p class="result-subtitle">Hernández-Sampieri & Mendoza (2023) establecen que el tamaño muestral es el criterio decisivo para elegir la prueba de normalidad adecuada, porque cada una tiene sensibilidad diferente según el volumen de datos. Por un lado, Shapiro-Wilk es la prueba más potente parar muestras pequeñas (menor a 50 datos). Por otro lado, Kolmogorov-Smirnov es recomendable aplicarla con muestras mayores a 50. Es decir, el criterio metodológico en la selección de la prueba depende del cumplimiento del supuesto muestral.</p>
            <div class="result-box" style="margin-bottom: 1rem;">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Variable: ${var1}</h5>
                <table class="result-table">
                    <tr>
                        <td>Prueba utilizada:</td>
                        <td><strong>${resultado.normalidad1.prueba}</strong> (${resultado.normalidad1.razon})</td>
                    </tr>
                    <tr>
                        <td>Estadístico:</td>
                        <td>${resultado.normalidad1.estadistico.toFixed(4)}</td>
                    </tr>
                    <tr>
                        <td>p-valor:</td>
                        <td>${fmtPApp(resultado.normalidad1.pValor)}</td>
                    </tr>
                    <tr>
                        <td>Decisión:</td>
                        <td><strong>${resultado.normalidad1.decision}</strong></td>
                    </tr>
                </table>
            </div>
            
            <div class="result-box">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Variable: ${var2}</h5>
                <table class="result-table">
                    <tr>
                        <td>Prueba utilizada:</td>
                        <td><strong>${resultado.normalidad2.prueba}</strong> (${resultado.normalidad2.razon})</td>
                    </tr>
                    <tr>
                        <td>Estadístico:</td>
                        <td>${resultado.normalidad2.estadistico.toFixed(4)}</td>
                    </tr>
                    <tr>
                        <td>p-valor:</td>
                        <td>${fmtPApp(resultado.normalidad2.pValor)}</td>
                    </tr>
                    <tr>
                        <td>Decisión:</td>
                        <td><strong>${resultado.normalidad2.decision}</strong></td>
                    </tr>
                </table>
            </div>
            <!-- Gráficos Q-Q para evaluar visualmente la normalidad -->
            <div class="result-box">
                <p class="result-subtitle" style="margin-bottom: 0.5rem;">Gráficos Q-Q: si los puntos se alinean con la recta de referencia, la distribución es aproximadamente normal.</p>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center;">
                    <div id="histVariable1" style="flex: 1 1 46%; min-width: 320px;"></div>
                    <div id="qqVariable1" style="flex: 1 1 46%; min-width: 320px;"></div>
                    <div id="histVariable2" style="flex: 1 1 46%; min-width: 320px;"></div>
                    <div id="qqVariable2" style="flex: 1 1 46%; min-width: 320px;"></div>
                </div>
            </div>
            <!-- Interpretación de Normalidad -->
            <div class="result-box interpretation-box interpretation-box--normalidad">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/>
                    </svg>
                    Interpretación Estadística
                </h5>
                <p class="interpretation-text">
                    ${InterpretacionesEstadisticas.generarInterpretacionNormalidad(var1, var2, resultado)}
                </p>
            </div>
        </div>
        <div class="card" style="padding:1rem 1.25rem; margin-top:1rem;">
            <h5 style="margin:0 0 0.4rem;">💡 Los porqués detrás de estos números</h5>
            <p style="margin:0 0 0.4rem;"><b>¿Por qué media y desviación estándar?</b> La media es el centro de gravedad de la distribución — el punto exacto donde los datos se equilibran, y por eso los valores extremos la arrastran hacia sí. La desviación estándar es la <i>distancia típica</i> de una persona a ese centro, la unidad natural de la variable: bajo normalidad, cerca del 68 % de los casos queda a ±1 DE de la media y el 95 % a ±2 DE, de modo que dos números se convierten en un mapa completo de dónde está casi todo el mundo. La asimetría cuenta la historia de las colas (positiva: una cola derecha larga arrastra la media por encima de la mediana) y la curtosis mide la propensión a valores extremos. El detalle crucial: ese mapa de «media ± DE» solo es honesto si la forma es normal — con distribuciones deformadas, los mismos dos números engañan. Por eso la app comprueba la normalidad antes de decidir nada.</p>
            <p style="margin:0;"><b>¿Por qué la normalidad decide el coeficiente?</b> Pearson se construye multiplicando desviaciones — (xᵢ−x̄)(yᵢ−ȳ) — y ahí vive su talón de Aquiles: un solo participante extremo aporta un producto gigantesco que puede dominar toda la suma, y la validez de su p-valor se deriva asumiendo normalidad; además solo captura relaciones lineales. Spearman aplica una cirugía elegante: convierte cada valor en su rango (1.º, 2.º, 3.º…) y calcula sobre esos rangos. Al quedarse solo con el <i>orden</i>, las distancias — donde habitan los atípicos y las deformidades de la distribución — desaparecen: el valor más extremo del mundo pasa a ser simplemente «el último de la fila». Robustez por diseño, no por parche.</p>
            <p style="margin:0;"><b>¿Por qué la normalidad decide el coeficiente?</b> Pearson se construye multiplicando desviaciones — (xᵢ−x̄)(yᵢ−ȳ) — y ahí vive su talón de Aquiles: un solo participante extremo aporta un producto gigantesco que puede dominar toda la suma, y la validez de su p-valor se deriva asumiendo normalidad; además solo captura relaciones lineales. Spearman aplica una cirugía elegante: convierte cada valor en su rango (1.º, 2.º, 3.º…) y calcula sobre esos rangos. Al quedarse solo con el <i>orden</i>, las distancias — donde habitan los atípicos y las deformidades de la distribución — desaparecen: el valor más extremo del mundo pasa a ser simplemente «el último». Robustez por diseño, no por parche.</p>
        </div>
    `;
    container.innerHTML = html;
    container.style.display = 'block';
    // Dibujar los gráficos Q-Q con los valores de cada variable
    dibujarGraficosQQ(var1, var2, resultado);
}
// Dibuja un gráfico Q-Q por cada variable usando sus valores pareados.
function dibujarGraficosQQ(var1, var2, resultado) {
    const pares = resultado.valoresPareados;
    if (!pares) return;
    // Panel visual de normalidad por variable: histograma con la curva normal
    // teórica superpuesta (¿la campana se ajusta a los datos?) y Q-Q plot
    // (¿los cuantiles siguen la diagonal?). Juntos justifican visualmente la
    // elección entre Pearson y Spearman.
    const dibujar = (idHist, idQQ, valores, etiqueta) => {
        if (!Array.isArray(valores) || valores.length < 3) return;
        const cfg = { width: 640, height: 400, primaryColor: '#2E5BBA' };
        try {
            if (document.getElementById(idHist)) {
                new ScientificCharts(idHist, cfg)
                    .createHistogramNormal(valores, { title: `Distribución: ${etiqueta}`, xLabel: etiqueta });
            }
            if (document.getElementById(idQQ)) {
                new ScientificCharts(idQQ, cfg)
                    .createQQPlot(valores, { title: `Q-Q: ${etiqueta}` });
            }
        } catch (error) {
            console.error(`Error en panel de normalidad de ${etiqueta}:`, error);
        }
    };
    dibujar('histVariable1', 'qqVariable1', pares.x, var1);
    dibujar('histVariable2', 'qqVariable2', pares.y, var2);
}
function mostrarCorrelacion(var1, var2, resultado) {
    const container = document.getElementById('resultadosCorrelacion');
    if (!container) return;
    const html = `
        <div class="result-section">
            <h3 class="section-title">Análisis de Correlación</h3>
            <p class="result-subtitle">El análisis de correlación permite medir la fuerza y dirección de la relación entre dos variables cuantitativas. Según Hernández, Fernández & Baptista (2010), el coeficiente de correlación de Pearson es adecuado cuando ambas variables siguen una distribución normal, mientras que el coeficiente de correlación de Spearman es preferible cuando al menos una variable no cumple con la normalidad. Es decir, la elección del coeficiente no es arbitraria, depende estrictamente del cumplimiento del supuesto de normalidad previamente validado. La interpretación del coeficiente varía desde -1 (correlación negativa perfecta) hasta +1 (correlación positiva perfecta), siendo 0 indicativo de ausencia de correlación.</p>
            <div class="result-box">
                <table class="result-table">
                    <tr>
                        <td>Variables:</td>
                        <td><strong>${var1} - ${var2}</strong></td>
                    </tr>
                    <tr>
                        <td>N:</td>
                        <td>${resultado.n}</td>
                    </tr>
                    <tr>
                        <td>Coeficiente utilizado:</td>
                        <td><strong>${resultado.tipoCorrelacion}</strong></td>
                    </tr>
                    <tr>
                        <td>Razón:</td>
                        <td>${resultado.normalidad1.normal && resultado.normalidad2.normal ?
            'Ambas variables siguen una distribución normal' :
            'Al menos una variable no sigue una distribución normal'}</td>
                    </tr>
                    <tr>
                        <td>Coeficiente (${resultado.tipoCorrelacion === 'Pearson' ? 'r' : 'ρ'}):</td>
                        <td><strong style="font-size: 1.1em;">${resultado.coeficiente.toFixed(4)}</strong></td>
                    </tr>
                    <tr>
                        <td>p-valor (${resultado.tipoPrueba}):</td>
                        <td><strong>${fmtPApp(resultado.pValor)}</strong></td>
                    </tr>
                    <tr>
                        <td>IC 95% del coeficiente:</td>
                        <td>${resultado.intervaloConfianza ?
            `[${resultado.intervaloConfianza.inferior.toFixed(3)}, ${resultado.intervaloConfianza.superior.toFixed(3)}]` :
            'No disponible (N ≤ 3)'}</td>
                    </tr>
                    <tr>
                        <td>Tamaño del efecto (r²):</td>
                        <td><strong>${(resultado.r2 * 100).toFixed(1)}%</strong> de varianza compartida</td>
                    </tr>
                    <tr>
                        <td>Interpretación:</td>
                        <td><strong>${resultado.interpretacion.texto}</strong></td>
                    </tr>
                </table>
            </div>
            <!-- Interpretación de Correlación -->
            <div class="result-box interpretation-box interpretation-box--correlacion">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/>
                    </svg>
                    Interpretación Estadística
                </h5>
                <p class="interpretation-text">
                    ${InterpretacionesEstadisticas.generarInterpretacionCorrelacion(var1, var2, resultado)}
                </p>
            </div>
        </div>
        
        <div id="anclaRegBiv"></div>
    `;
    container.innerHTML = html;
    container.style.display = 'block';
}
function mostrarDecision(var1, var2, resultado) {
    const container = document.getElementById('resultadosDecision');
    if (!container) return;
    const prueba = AnalizadorEstadistico.pruebaHipotesis(resultado);
    const html = `
        <div class="result-section">
            <h3 class="section-title">Prueba de Hipótesis</h3>
            <p class="result-subtitle">Según Taherdoost (2022), la prueba de hipótesis es un procedimiento estadístico que permite evaluar afirmaciones sobre parámetros poblacionales basándose en datos muestrales. El proceso implica formular una hipótesis nula (H₀) y una hipótesis alternativa (H₁), seleccionar un nivel de significancia (α), calcular un estadístico de prueba y determinar el p-valor asociado. La decisión de rechazar o no rechazar H₀ se basa en la comparación del p-valor con α, proporcionando así una base objetiva para la inferencia estadística.</p>
            <div class="result-box">
                <table class="result-table">
                    <tr>
                        <td>Nivel de significancia (α):</td>
                        <td><strong>${prueba.alpha}</strong></td>
                    </tr>
                    <tr>
                        <td>p-valor:</td>
                        <td><strong>${fmtPApp(resultado.pValor)}</strong></td>
                    </tr>
                    <tr>
                        <td>Comparación:</td>
                        <td>${fmtPApp(resultado.pValor)} ${prueba.decision === 'rechazar' ? '<' : '≥'} α = ${prueba.alpha}</td>
                    </tr>
                    <tr>
                        <td>Decisión sobre H₀:</td>
                        <td class="${prueba.decision === 'rechazar' ? 'decision-reject' : 'decision-accept'}">
                            <strong>${prueba.decision === 'rechazar' ? 'SE RECHAZA H₀' : 'NO SE RECHAZA H₀'}</strong>
                        </td>
                    </tr>
                    <tr>
                        <td>Conclusión:</td>
                        <td><strong>${prueba.conclusionH1}</strong></td>
                    </tr>
                    ${resultado.poder != null ? `
                    <tr>
                        <td>Potencia estadística (1 − β):</td>
                        <td><strong>${(resultado.poder * 100).toFixed(1)}%</strong> ${resultado.poder >= 0.8 ? '(adecuada, ≥ 80%)' : '(insuficiente, &lt; 80%)'}</td>
                    </tr>` : ''}
                </table>
                <div style="margin-top: 1rem; padding: 1rem; background-color: #f9f9f9; border-radius: 6px;">
                    <p style="margin: 0; font-size: 0.9rem; line-height: 1.6;">
                        ${prueba.conclusionH0}${resultado.poder != null && resultado.poder < 0.8 ? ' La potencia es inferior al 80% recomendado por Cohen; un resultado no significativo podría deberse a un tamaño muestral insuficiente (riesgo de error tipo II).' : ''}
                    </p>
                </div>
            </div>
            <!-- Interpretación de Prueba de Hipótesis -->
            <div class="result-box interpretation-box interpretation-box--hipotesis">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/>
                    </svg>
                    Interpretación Estadística
                </h5>
                <p class="interpretation-text">
                    ${InterpretacionesEstadisticas.generarInterpretacionHipotesis(var1, var2, resultado, prueba)}
                </p>
            </div>
        </div>
        
    `;
    container.innerHTML = html;
    container.style.display = 'block';
}
function mostrarDiscusion(var1, var2, resultado, unidadAnalisis, lugarContexto, marco) {
    const container = document.getElementById('resultadosDiscusion');
    if (!container) return;
    // Reutilizar el marco ya construido (con dimensiones reales y objetivos
    // comparativos) para que la discusión y la tarjeta de marco digan LO MISMO.
    const discusion = marco
        ? InterpretacionesEstadisticas.generarDiscusion(
            var1, var2, resultado,
            AnalizadorEstadistico.pruebaHipotesis(resultado),
            unidadAnalisis, lugarContexto, { marco })
        : AnalizadorEstadistico.generarDiscusion(var1, var2, resultado, unidadAnalisis, lugarContexto);
    const html = `
        <div class="result-section">
            <h3 class="section-title">Discusión (Plantilla)</h3>
            <div class="discussion-box">
                ${discusion.replace(/\[(.*?)\]/g, '<span class="highlight">[$1]</span>')}
            </div>
        </div>
    `;
    container.innerHTML = html;
    container.style.display = 'block';
}
// Muestra el alfa de Cronbach de las escalas cuyas dimensiones (ítems) haya
// configurado el usuario. Es opcional: si no hay dimensiones, no se muestra.
function mostrarFiabilidad(var1, var2) {
    const container = document.getElementById('resultadosFiabilidad');
    if (!container) return;
    const dim1 = (document.getElementById('dimensionesVar1') || { value: '' }).value.trim();
    const dim2 = (document.getElementById('dimensionesVar2') || { value: '' }).value.trim();
    if (!dim1 && !dim2) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    let bloques = '';
    try {
        if (dim1) {
            AnalizadorEstadistico.parsearDimensionesDesdeString(var1, dim1);
            bloques += bloqueFiabilidad(var1, AnalizadorEstadistico.calcularFiabilidadVariable(var1));
        }
        if (dim2) {
            AnalizadorEstadistico.parsearDimensionesDesdeString(var2, dim2);
            bloques += bloqueFiabilidad(var2, AnalizadorEstadistico.calcularFiabilidadVariable(var2));
        }
    } catch (error) {
        container.style.display = 'none';
        container.innerHTML = '';
        mostrarToast('Fiabilidad: ' + error.message, 'warning');
        return;
    }
    if (!bloques) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Análisis de Fiabilidad (Alfa de Cronbach)</h3>
            <p class="result-subtitle">Consistencia interna de cada escala y sus dimensiones. Según George y Mallery (2003), un α ≥ .70 indica una fiabilidad aceptable; ≥ .80 buena y ≥ .90 excelente.</p>
            ${bloques}
        </div>`;
    container.style.display = 'block';
}
function bloqueFiabilidad(variable, fiab) {
    if (!fiab || !fiab.escala) return '';
    const fila = (etiqueta, f) => f
        ? `<tr><td>${etiqueta}</td><td><strong>${f.alfa.toFixed(3)}</strong></td><td>${f.k}</td><td>${f.interpretacion}</td></tr>`
        : `<tr><td>${etiqueta}</td><td colspan="3">No disponible (se requieren ≥ 2 ítems)</td></tr>`;
    const filasDimensiones = fiab.dimensiones
        .map(d => fila(`Dimensión: ${d.nombre}`, d.fiabilidad))
        .join('');
    return `
        <div class="result-box" style="margin-bottom: 1rem;">
            <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Escala: ${variable}</h5>
            <table class="result-table">
                <tr><th>Componente</th><th>α de Cronbach</th><th>N° ítems</th><th>Interpretación</th></tr>
                ${fila('Escala total', fiab.escala)}
                ${filasDimensiones}
            </table>
        </div>`;
}
// Muestra el reporte de comparación de dos grupos.
function mostrarComparacion(varCuantitativa, varAgrupacion, resultado) {
    const container = document.getElementById('resultadosComparacion');
    if (!container) return;
    const d1 = resultado.descriptivas1;
    const d2 = resultado.descriptivas2;
    const prueba = resultado.prueba;
    const ef = resultado.tamanoEfecto;
    const significativa = resultado.decision === 'rechazar';
    const estadisticoTexto = resultado.parametrica
        ? `t(${prueba.gl.toFixed(2)}) = ${prueba.estadistico.toFixed(3)}`
        : `U = ${prueba.U.toFixed(1)}, z = ${prueba.z.toFixed(3)}`;
    const lineaApa = lineaApaComparacion(varCuantitativa, varAgrupacion, resultado);
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Comparación de Grupos</h3>
            <p class="result-subtitle">Comparación de <strong>${varCuantitativa}</strong> entre los grupos de <strong>${varAgrupacion}</strong>. La prueba se elige según los supuestos: t de Student o de Welch si ambos grupos son normales (según la prueba de Levene de igualdad de varianzas), o U de Mann-Whitney si alguno no es normal.</p>
            <div class="result-box">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Descriptivos por grupo</h5>
                <table class="result-table">
                    <tr><th>Grupo</th><th>N</th><th>Media</th><th>DE</th><th>Normalidad (p)</th></tr>
                    <tr><td>${resultado.etiqueta1}</td><td>${d1.n}</td><td>${d1.media.toFixed(2)}</td><td>${d1.desviacion.toFixed(2)}</td><td>${resultado.normalidad1.pValor.toFixed(3)} (${resultado.normalidad1.normal ? 'normal' : 'no normal'})</td></tr>
                    <tr><td>${resultado.etiqueta2}</td><td>${d2.n}</td><td>${d2.media.toFixed(2)}</td><td>${d2.desviacion.toFixed(2)}</td><td>${resultado.normalidad2.pValor.toFixed(3)} (${resultado.normalidad2.normal ? 'normal' : 'no normal'})</td></tr>
                </table>
            </div>
            <div class="result-box">
                <table class="result-table">
                    <tr><td>Levene (igualdad de varianzas):</td><td>F(${resultado.levene.df1}, ${resultado.levene.df2}) = ${resultado.levene.estadistico.toFixed(3)}, ${fmtPApp(resultado.levene.pValor) === '< .001' ? 'p < .001' : 'p = ' + fmtPApp(resultado.levene.pValor)} (${resultado.levene.varianzasIguales ? 'varianzas iguales' : 'varianzas desiguales'})</td></tr>
                    <tr><td>Prueba aplicada:</td><td><strong>${prueba.prueba}</strong></td></tr>
                    <tr><td>Estadístico:</td><td>${estadisticoTexto}</td></tr>
                    <tr><td>p-valor (bilateral):</td><td><strong>${fmtPApp(prueba.pValor)}</strong></td></tr>
                    <tr><td>Tamaño del efecto (d de Cohen):</td><td><strong>${ef.d.toFixed(3)}</strong> (${ef.interpretacion})</td></tr>
                    ${resultado.tamanoEfectoRangos ? `<tr><td>Tamaño del efecto (r de rangos):</td><td><strong>${resultado.tamanoEfectoRangos.r.toFixed(3)}</strong> (${resultado.tamanoEfectoRangos.interpretacion}) — apropiado para la prueba no paramétrica</td></tr>` : ''}
                    <tr><td>Decisión sobre H₀:</td><td class="${significativa ? 'decision-reject' : 'decision-accept'}"><strong>${significativa ? 'SE RECHAZA H₀' : 'NO SE RECHAZA H₀'}</strong></td></tr>
                </table>
            </div>
            ${bloqueApaComparacionHTML(lineaApa)}
            <div class="result-box" style="display: flex; justify-content: center;">
                <div id="cajaGrupos"></div>
            </div>
            <div class="result-box interpretation-box interpretation-box--hipotesis">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/></svg>
                    Interpretación
                </h5>
                <p class="interpretation-text">${interpretarComparacion(varCuantitativa, varAgrupacion, resultado)}</p>
            </div>
        </div>`;
    container.style.display = 'block';
    dibujarCajaGrupos(resultado);
    conectarCopiaComparacion(lineaApa);
    desplazarHacia(container);
}
// Dibuja un diagrama de caja por grupo en el contenedor #cajaGrupos usando los
// datos crudos de cada grupo expuestos en el resultado de la comparación.
function dibujarCajaGrupos(resultado) {
    if (!document.getElementById('cajaGrupos') || !Array.isArray(resultado.gruposDatos)) return;
    // Etiquetas cortas para el eje (solo el valor del grupo, sin el prefijo)
    const etiquetas = resultado.etiquetas.map(e => e.split('=').pop().trim());
    try {
        new ScientificCharts('cajaGrupos', { width: 520, height: 360, primaryColor: '#2E5BBA' })
            .createBoxPlot(resultado.gruposDatos, etiquetas, {
                title: 'Distribución por grupo',
                yLabel: 'Valor'
            });
    } catch (error) {
        console.error('Error al crear el diagrama de caja por grupo:', error);
    }
}
// Muestra el reporte de comparación de 3 o más grupos (ANOVA / Kruskal-Wallis).
function mostrarComparacionVarios(varCuantitativa, varAgrupacion, resultado) {
    const container = document.getElementById('resultadosComparacion');
    if (!container) return;
    const prueba = resultado.prueba;
    const significativa = resultado.decision === 'rechazar';
    const k = resultado.etiquetas.length;
    const filasDesc = resultado.descriptivas.map((d, i) =>
        `<tr><td>${resultado.etiquetas[i]}</td><td>${d.n}</td><td>${d.media.toFixed(2)}</td><td>${d.desviacion.toFixed(2)}</td><td>${resultado.normalidades[i].pValor.toFixed(3)} (${resultado.normalidades[i].normal ? 'normal' : 'no normal'})</td></tr>`
    ).join('');
    const lineaPrueba = resultado.parametrica
        ? `F(${prueba.glEntre}, ${prueba.glDentro}) = ${prueba.F.toFixed(3)}`
        : `H(${prueba.gl}) = ${prueba.H.toFixed(3)}`;
    const efecto = resultado.parametrica
        ? `η² = ${prueba.etaCuadrado.toFixed(3)} (${(prueba.etaCuadrado * 100).toFixed(1)}% de varianza explicada)`
        : `ε² = ${prueba.epsilonCuadrado.toFixed(3)}`;
    let postHocHtml = '';
    if (resultado.postHoc) {
        const filas = resultado.postHoc.comparaciones.map(c =>
            `<tr><td>${c.grupo1}</td><td>${c.grupo2}</td><td>${c.pAjustada.toFixed(4)}</td><td>${c.significativa ? 'Sí' : 'No'}</td></tr>`
        ).join('');
        postHocHtml = `
            <div class="result-box">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Comparaciones por pares (post-hoc, ${resultado.postHoc.metodo})</h5>
                <table class="result-table">
                    <tr><th>Grupo A</th><th>Grupo B</th><th>p ajustada</th><th>Significativa</th></tr>
                    ${filas}
                </table>
            </div>`;
    }
    const pTexto = prueba.pValor < 0.001 ? 'p < .001' : 'p = ' + prueba.pValor.toFixed(3).replace(/^0/, '');
    const interpretacion = significativa
        ? `Existen diferencias estadísticamente significativas en ${varCuantitativa} entre al menos dos de los grupos de ${varAgrupacion} (${prueba.prueba}, ${pTexto}). Las comparaciones por pares (Bonferroni) indican entre qué grupos se encuentran las diferencias.`
        : `No se hallaron diferencias estadísticamente significativas en ${varCuantitativa} entre los grupos de ${varAgrupacion} (${prueba.prueba}, ${pTexto}).`;
    const lineaApa = lineaApaComparacion(varCuantitativa, varAgrupacion, resultado);
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Comparación de Grupos (${k} grupos)</h3>
            <p class="result-subtitle">Comparación de <strong>${varCuantitativa}</strong> entre los ${k} grupos de <strong>${varAgrupacion}</strong>. Se usa ANOVA de una vía si todos los grupos son normales, o Kruskal-Wallis si alguno no lo es. Si el resultado global es significativo, se muestran comparaciones por pares con corrección de Bonferroni.</p>
            <div class="result-box">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Descriptivos por grupo</h5>
                <table class="result-table">
                    <tr><th>Grupo</th><th>N</th><th>Media</th><th>DE</th><th>Normalidad (p)</th></tr>
                    ${filasDesc}
                </table>
            </div>
            <div class="result-box">
                <table class="result-table">
                    <tr><td>Levene (igualdad de varianzas):</td><td>F(${resultado.levene.df1}, ${resultado.levene.df2}) = ${resultado.levene.estadistico.toFixed(3)}, ${fmtPApp(resultado.levene.pValor) === '< .001' ? 'p < .001' : 'p = ' + fmtPApp(resultado.levene.pValor)}</td></tr>
                    <tr><td>Prueba aplicada:</td><td><strong>${prueba.prueba}</strong></td></tr>
                    <tr><td>Estadístico:</td><td>${lineaPrueba}</td></tr>
                    <tr><td>p-valor:</td><td><strong>${fmtPApp(prueba.pValor)}</strong></td></tr>
                    <tr><td>Tamaño del efecto:</td><td><strong>${efecto}</strong></td></tr>
                    <tr><td>Decisión sobre H₀:</td><td class="${significativa ? 'decision-reject' : 'decision-accept'}"><strong>${significativa ? 'SE RECHAZA H₀' : 'NO SE RECHAZA H₀'}</strong></td></tr>
                </table>
            </div>
            ${postHocHtml}
            ${bloqueApaComparacionHTML(lineaApa)}
            <div class="result-box" style="display: flex; justify-content: center;">
                <div id="cajaGrupos"></div>
            </div>
            <div class="result-box interpretation-box interpretation-box--hipotesis">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/></svg>
                    Interpretación
                </h5>
                <p class="interpretation-text">${interpretacion}</p>
            </div>
        </div>`;
    container.style.display = 'block';
    dibujarCajaGrupos(resultado);
    conectarCopiaComparacion(lineaApa);
    desplazarHacia(container);
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
function mostrarDispersion(var1, var2, resultado) {
    const container = document.getElementById('resultadosDispersion');
    if (!container) return;
    const pares = resultado.valoresPareados;
    if (!pares || !Array.isArray(pares.x) || pares.x.length < 2) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Diagrama de Dispersión</h3>
            <p class="result-subtitle">Relación entre ${var1} y ${var2}, con la recta de regresión por mínimos cuadrados y el coeficiente de determinación R². Permite valorar visualmente la forma, dirección y dispersión de la asociación.</p>
            <div class="result-box" style="display: flex; justify-content: center;">
                <div id="graficoDispersion"></div>
            </div>
        </div>`;
    container.style.display = 'block';
    // El gráfico se dibuja con la librería ScientificCharts (D3); si fallara,
    // no debe interrumpir el resto del reporte.
    try {
        const chart = new ScientificCharts('graficoDispersion', {
            width: 520,
            height: 380,
            primaryColor: '#2E5BBA'
        });
        const I = InterpretacionesEstadisticas;
        const esSp = I._esSpearman(resultado.tipoCorrelacion);
        const r2 = Number.isFinite(resultado.r2) ? resultado.r2 : resultado.coeficiente ** 2;
        const anot = [
            `${esSp ? 'ρ' : 'r'} = ${resultado.coeficiente.toFixed(3)}  (${I._fmtP(resultado.pValor)})`,
            `${esSp ? 'ρ²' : 'R²'} = ${r2.toFixed(3)}   n = ${resultado.n}`
        ];
        const ic = resultado.intervaloConfianza;
        if (ic && Number.isFinite(ic.inferior)) {
            anot.push(`IC 95% [${ic.inferior.toFixed(3)}, ${ic.superior.toFixed(3)}]`);
        }
        chart.createScatterPlotPro(pares.x, pares.y, {
            title: `${var1} vs ${var2}`,
            xLabel: var1,
            yLabel: var2,
            annotationLines: anot
        });
    } catch (error) {
        console.error('Error al crear el diagrama de dispersión:', error);
        container.querySelector('#graficoDispersion').textContent =
            'No se pudo generar el diagrama de dispersión.';
    }
}
function mostrarRegresion(var1, var2, resultado) {
    const container = document.getElementById('resultadosRegresion');
    if (!container) return;
    // Solo cuando hay regresión (se cumplió la normalidad → método paramétrico)
    const reg = resultado.regresion;
    if (!reg) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    const signo = reg.intercepto >= 0 ? '+' : '−';
    const ecuacion = `${var2} = ${reg.pendiente.toFixed(3)} · ${var1} ${signo} ${Math.abs(reg.intercepto).toFixed(3)}`;
    const sentido = reg.pendiente >= 0 ? 'aumenta' : 'disminuye';
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Regresión Lineal Simple</h3>
            <p class="result-subtitle">Modelo predictivo por mínimos cuadrados de ${var2} en función de ${var1}. Se reporta porque ambas variables cumplieron el supuesto de normalidad; la ecuación permite estimar ${var2} a partir de ${var1}.</p>
            <div class="result-box">
                <p class="apa-text" style="font-style: normal; font-weight: 600;">${ecuacion}</p>
                <table class="result-table">
                    <tr><td>Pendiente (B):</td><td><strong>${reg.pendiente.toFixed(4)}</strong> (EE = ${reg.errorEstandarPendiente.toFixed(4)})</td></tr>
                    <tr><td>Intercepto (B₀):</td><td>${reg.intercepto.toFixed(4)}</td></tr>
                    <tr><td>t de la pendiente (gl = ${reg.gl}):</td><td>${reg.tPendiente.toFixed(3)}</td></tr>
                    <tr><td>p de la pendiente:</td><td><strong>${reg.pPendiente.toFixed(4)}</strong></td></tr>
                    <tr><td>R² (bondad de ajuste):</td><td><strong>${(reg.r2 * 100).toFixed(1)}%</strong></td></tr>
                    <tr><td>Error estándar de estimación:</td><td>${reg.errorEstandarEstimacion.toFixed(4)}</td></tr>
                </table>
                <p class="marco-text" style="margin-top: 0.75rem;">Por cada unidad que aumenta ${var1}, ${var2} ${sentido} en promedio ${Math.abs(reg.pendiente).toFixed(3)} unidades.</p>
            </div>
        </div>`;
    container.style.display = 'block';
}
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
    container.innerHTML = html;
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
// ========================================
// UTILIDADES
// ========================================
// Etiqueta humana GLOBAL: la consumen la regresión, la comparación de grupos,
// ANCOVA/MANOVA y la matriz de flujo para sus textos. Antes no existía y todos
// los módulos caían silenciosamente al nombre técnico de la columna.
function obtenerEtiqueta(columna) {
    return (typeof EtiquetasVariables !== 'undefined') ? EtiquetasVariables.etiqueta(columna) : columna;
}
// Variante para selects: "Etiqueta (Columna_tecnica)".
function obtenerEtiquetaOpcion(columna) {
    return (typeof EtiquetasVariables !== 'undefined') ? EtiquetasVariables.etiquetaConColumna(columna) : columna;
}
// Etiqueta humana GLOBAL: la consumen la regresión, la comparación de grupos,
// ANCOVA/MANOVA y la matriz de flujo para sus textos. Antes no existía y todos
// los módulos caían silenciosamente al nombre técnico de la columna.
function obtenerEtiqueta(columna) {
    return (typeof EtiquetasVariables !== 'undefined') ? EtiquetasVariables.etiqueta(columna) : columna;
}
// Variante para selects: "Etiqueta (Columna_tecnica)".
function obtenerEtiquetaOpcion(columna) {
    return (typeof EtiquetasVariables !== 'undefined') ? EtiquetasVariables.etiquetaConColumna(columna) : columna;
}
// Renderiza encabezados y las primeras `maxFilas` filas de una base de datos
// en una tabla (thead/tbody). Devuelve la lista de columnas.
function renderizarTablaDatos(thead, tbody, datos, maxFilas = 10) {
    thead.innerHTML = '';
    tbody.innerHTML = '';
    // Acepta la base columnar del Simulador o un arreglo de filas-objeto (Analizador)
    const esBase = typeof datos.nombres === 'function' && typeof datos.valor === 'function';
    const columnas = esBase ? datos.nombres() : Object.keys(datos[0]);
    const filaEncabezados = document.createElement('tr');
    columnas.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        filaEncabezados.appendChild(th);
    });
    thead.appendChild(filaEncabezados);
    const limite = Math.min(maxFilas, datos.length);
    for (let i = 0; i < limite; i++) {
        const fila = document.createElement('tr');
        columnas.forEach(col => {
            const td = document.createElement('td');
            const valor = esBase ? datos.valor(col, i) : datos[i][col];
            td.textContent = typeof valor === 'number' ? (Number.isNaN(valor) ? '' : valor.toFixed(2)) : valor;
            fila.appendChild(td);
        });
        tbody.appendChild(fila);
    }
    return columnas;
}
// Desplaza la vista hacia un elemento respetando la preferencia de movimiento
// reducido del sistema (accesibilidad).
function desplazarHacia(elemento) {
    const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    elemento.scrollIntoView({ behavior: movimientoReducido ? 'auto' : 'smooth', block: 'nearest' });
}
let temporizadorToast = null;
function mostrarToast(mensaje, tipo = 'success', duracion = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = mensaje;
    toast.className = `toast ${tipo}`;
    toast.classList.add('show');
    // Cancelar el temporizador previo para que un toast nuevo no se oculte
    // antes de tiempo por el setTimeout de uno anterior.
    if (temporizadorToast) {
        clearTimeout(temporizadorToast);
    }
    temporizadorToast = setTimeout(() => {
        toast.classList.remove('show');
        temporizadorToast = null;
    }, duracion);
}
// ========================================
// IMPORTAR/EXPORTAR CONFIGURACIONES
// ========================================
// PRUEBAS APLICADAS


// ---- Ayudantes compartidos por los exportadores/importadores (fuente única) ----
// Generan el MISMO CSV que los botones individuales de cada tabla.
function csvDeTabla(selectorFilas, tipo) {
    const esc = v => (String(v).includes(',') ? `"${v}"` : String(v));
    if (tipo === 'pruebas') {
        let csv = 'Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa,Invertidos\n';
        document.querySelectorAll(selectorFilas).forEach(fila => {
            const inputs = fila.querySelectorAll('input');
            const selPrueba = fila.querySelector('[aria-label="Nombre de la prueba"]');
            const selectDist = fila.querySelector('[aria-label="Distribución"]');
            csv += `${esc(selPrueba ? selPrueba.value.trim() : '')},${esc(inputs[0].value.trim())},`
                + `${inputs[1].value || ''},${selectDist ? selectDist.value : 'normal'},${inputs[2].value || ''},`
                + `${inputs[3].value || ''},${inputs[4].value || ''},${inputs[5].value || ''},${inputs[6] ? (inputs[6].value || '') : ''},${inputs[7] ? (inputs[7].value || '') : ''}\n`;
        });
        return csv;
    }
    let csv = 'Categoria,Distribucion,Promedio,DE,Minimo,Maximo,Decimales\n';
    document.querySelectorAll(selectorFilas).forEach(fila => {
        const inputs = fila.querySelectorAll('input');
        const select = fila.querySelector('select');
        csv += `${esc(inputs[0].value.trim())},${select ? select.value : 'normal'},${inputs[1].value || ''},`
            + `${inputs[2].value || ''},${inputs[3].value || ''},${inputs[4].value || ''},${inputs[5].value || ''}\n`;
    });
    return csv;
}
// Aplica un CSV de PRUEBAS a la tabla I (misma compatibilidad de formatos que
// el importador individual: nuevo con Tipo, intermedio y antiguo). Devuelve nº de filas.
function aplicarCSVPruebas(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return 0;
    const enc = lineas[0].toLowerCase();
    const tienePruebaEscala = enc.includes('escala');
    const tieneTipo = enc.includes('tipo');          // formato antiguo: la columna se ignora
    const tieneDistribucion = enc.includes('distribucion');
    const tbody = document.getElementById('bodyPruebas');
    if (tbody) tbody.innerHTML = '';
    let n = 0;
    for (const linea of lineas.slice(1)) {
        const v = parsearLineaCSV(linea.trim());
        if (v.length < 4) continue;
        if (tienePruebaEscala) {
            const off = tieneTipo ? 1 : 0;
            // Las filas «General» de bases antiguas se descartan: el puntaje
            // general ahora se calcula solo (promedio de las dimensiones).
            if (tieneTipo && String(v[2] || '').toLowerCase() === 'general') continue;
            agregarFilaPruebaConDatos({
                prueba: v[0] || '', nombre: v[1] || '',
                numItems: v[2 + off] || '', distribucion: v[3 + off] || 'normal',
                media: v[4 + off] || '', de: v[5 + off] || '',
                min: v[6 + off] || '', max: v[7 + off] || '', alfa: v[8 + off] || '',
                invertidos: v[9 + off] || ''
            });
        } else if (tieneDistribucion) {
            agregarFilaPruebaConDatos({ prueba: v[0] || '', nombre: v[0] || '', numItems: v[1] || '',
                distribucion: v[2] || 'normal', media: v[3] || '', de: v[4] || '', min: v[5] || '', max: v[6] || '', alfa: v[7] || '' });
        } else {
            agregarFilaPruebaConDatos({ prueba: v[0] || '', nombre: v[0] || '', numItems: v[1] || '',
                distribucion: 'normal', media: v[2] || '', de: v[3] || '', min: v[4] || '', max: v[5] || '', alfa: v[6] || '' });
        }
        n++;
    }
    return n;
}
// Aplica un CSV de SOCIODEMOGRÁFICOS a la tabla II. Devuelve nº de filas.
function aplicarCSVSocio(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return 0;
    const tieneDistribucion = lineas[0].toLowerCase().includes('distribucion');
    const tbody = document.getElementById('bodySocio');
    if (tbody) tbody.innerHTML = '';
    let n = 0;
    for (const linea of lineas.slice(1)) {
        const v = parsearLineaCSV(linea.trim());
        if (v.length < 3) continue;
        const d = tieneDistribucion ? 1 : 0;
        agregarFilaSocioConDatos({
            categoria: v[0] || '', distribucion: tieneDistribucion ? (v[1] || 'normal') : 'normal',
            promedio: v[1 + d] || '', de: v[2 + d] || '', min: v[3 + d] || '', max: v[4 + d] || '', decimales: v[5 + d] || '2'
        });
        n++;
    }
    return n;
}

// ============================================================================
// CORRELACIONES: importar / exportar (mismo patrón que Pruebas y Sociodemográficos)
// ============================================================================
function exportarConfigCorrelaciones() {
    try {
        const filas = document.querySelectorAll('#bodyCorrelaciones .fila-correlacion');
        if (filas.length === 0) {
            mostrarToast('No hay correlaciones para exportar', 'warning');
            return;
        }
        descargarArchivo(csvDeCorrelaciones(), 'configuracion_correlaciones.csv', 'text/csv');
        mostrarToast('Correlaciones exportadas exitosamente', 'success');
    } catch (error) {
        mostrarToast('Error al exportar: ' + error.message, 'error');
    }
}
// CSV de correlaciones (reutilizado por el exportador maestro).
function csvDeTests() {
    let csv = 'Prueba,Variable,CorrDimensiones\n';
    testsDefinidos().forEach(t => {
        const esc = v => (String(v).includes(',') ? `"${v}"` : String(v));
        csv += `${esc(t.prueba)},${esc(t.variable)},${t.rIntra}\n`;
    });
    return csv;
}
function aplicarCSVTests(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return 0;
    const tbody = document.getElementById('bodyTests');
    if (tbody) tbody.innerHTML = '';
    let n = 0;
    for (const linea of lineas.slice(1)) {
        const v = parsearLineaCSV(linea);
        if (!v[0]) continue;
        agregarFilaTestConDatos({ prueba: v[0], variable: v[1] || '', rIntra: v[2] !== undefined ? v[2] : '' });
        n++;
    }
    refrescarSelectoresDePrueba();
    return n;
}
function csvDeCorrelaciones() {
    let csv = 'VariableA,VariableB,Correlacion\n';
    document.querySelectorAll('#bodyCorrelaciones .fila-correlacion').forEach(fila => {
        const selA = fila.querySelector('[aria-label="Variable A"]');
        const selB = fila.querySelector('[aria-label="Variable B"]');
        const inpR = fila.querySelector('[aria-label="Correlación objetivo"]');
        const esc = v => (String(v).includes(',') ? `"${v}"` : String(v));
        csv += `${esc(selA ? selA.value : '')},${esc(selB ? selB.value : '')},${inpR ? inpR.value : ''}\n`;
    });
    return csv;
}
// Aplica filas de correlación desde texto CSV. Devuelve cuántas entraron.
// Las variables deben EXISTIR ya en las tablas I/II (los <select> se llenan de
// ahí): por eso el maestro importa correlaciones al final.
function aplicarCSVCorrelaciones(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return { aplicadas: 0, omitidas: 0 };
    const tbody = document.getElementById('bodyCorrelaciones');
    if (tbody) tbody.innerHTML = '';
    let aplicadas = 0, omitidas = 0;
    for (const linea of lineas.slice(1)) {
        const partes = linea.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        const [varA, varB, r] = partes;
        if (!varA || !varB) { omitidas++; continue; }
        agregarFilaCorrelacion();
        const fila = tbody ? tbody.lastElementChild : null;
        if (!fila) { omitidas++; continue; }
        const selA = fila.querySelector('[aria-label="Variable A"]');
        const selB = fila.querySelector('[aria-label="Variable B"]');
        const inpR = fila.querySelector('[aria-label="Correlación objetivo"]');
        const existe = (sel, val) => sel && Array.from(sel.options).some(o => o.value === val);
        if (!existe(selA, varA) || !existe(selB, varB)) { fila.remove(); omitidas++; continue; }
        selA.value = varA; selB.value = varB;
        if (inpR) inpR.value = (r === undefined || r === '') ? '' : r;
        aplicadas++;
    }
    return { aplicadas, omitidas };
}
function importarConfigCorrelaciones(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const encabezado = String(event.target.result).split(/\r?\n/)[0].toLowerCase();
            if (!encabezado.includes('variablea') || !encabezado.includes('correlacion')) {
                mostrarToast('Formato incorrecto. Encabezados esperados: VariableA,VariableB,Correlacion', 'error');
                return;
            }
            const res = aplicarCSVCorrelaciones(event.target.result);
            if (res.aplicadas === 0) {
                mostrarToast('Ninguna correlación se pudo aplicar: define primero esas variables en las tablas I y II', 'warning');
            } else {
                mostrarToast(`${res.aplicadas} correlación(es) importada(s)` + (res.omitidas ? ` · ${res.omitidas} omitida(s): variables inexistentes` : ''), res.omitidas ? 'warning' : 'success');
            }
        } catch (error) {
            mostrarToast('Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ============================================================================
// MAESTRO: las TRES configuraciones en un solo archivo
// Formato: bloques separados por marcadores ###SECCION### — legible, editable
// a mano y compatible con los CSV sueltos de cada tabla.
// ============================================================================
const MARCA_TODO = { general: '###GENERAL###', tests: '###TESTS###', pruebas: '###PRUEBAS###', socio: '###SOCIODEMOGRAFICOS###', corr: '###CORRELACIONES###' };
// Campos de la tarjeta «Configuración General» que viajan en el archivo maestro.
const CAMPOS_GENERAL = [
    { id: 'tamanoMuestra', clave: 'TamanoMuestra' },
    { id: 'semilla', clave: 'Semilla' },
    { id: 'generarPercentiles', clave: 'GenerarPercentiles', checkbox: true },
    { id: 'correlacionesExactas', clave: 'CorrelacionesExactas', checkbox: true },
    { id: 'indiceFiabilidad', clave: 'IndiceFiabilidad' },
    { id: 'heterogeneidadItems', clave: 'HeterogeneidadItems' },
    { id: 'pctPerdidos', clave: 'PctPerdidos' },
    { id: 'mecanismoPerdidos', clave: 'MecanismoPerdidos' },
    { id: 'pctDescuidados', clave: 'PctDescuidados' },
    { id: 'tipoDescuidado', clave: 'TipoDescuidado' },
    { id: 'marcarDescuidados', clave: 'MarcarDescuidados', checkbox: true },
    { id: 'pctDigitacion', clave: 'PctDigitacion' }
];
function csvDeGeneral() {
    let csv = 'Campo,Valor\n';
    CAMPOS_GENERAL.forEach(c => {
        const el = document.getElementById(c.id);
        const v = el ? (c.checkbox ? (el.checked ? 'si' : 'no') : (el.value || '')) : '';
        csv += `${c.clave},${v}\n`;
    });
    return csv;
}
// Aplica el bloque general. Devuelve cuántos campos se restauraron.
function aplicarCSVGeneral(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return 0;
    let n = 0;
    for (const linea of lineas.slice(1)) {
        const [clave, ...resto] = linea.split(',');
        const valor = resto.join(',').trim();
        const campo = CAMPOS_GENERAL.find(c => c.clave.toLowerCase() === String(clave).trim().toLowerCase());
        if (!campo) continue;
        const el = document.getElementById(campo.id);
        if (!el) continue;
        if (campo.checkbox) el.checked = /^(si|sí|true|1)$/i.test(valor);
        else el.value = valor;
        n++;
    }
    return n;
}
function exportarConfigTodo() {
    try {
        const partes = [];
        // Se reutilizan los MISMOS generadores de cada tabla (una sola fuente de verdad).
        const csvG = csvDeGeneral();
        const csvT = csvDeTests();
        const csvP = csvDeTabla('#bodyPruebas .fila-prueba', 'pruebas');
        const csvS = csvDeTabla('#bodySocio .fila-socio', 'socio');
        const csvC = csvDeCorrelaciones();
        const nFilas = s => Math.max(0, String(s).trim().split(/\r?\n/).length - 1);
        if (nFilas(csvP) === 0 && nFilas(csvS) === 0 && nFilas(csvC) === 0) {
            mostrarToast('No hay nada configurado para exportar', 'warning');
            return;
        }
        partes.push(MARCA_TODO.general, csvG.trim(), '', MARCA_TODO.tests, csvT.trim(), '', MARCA_TODO.pruebas, csvP.trim(), '', MARCA_TODO.socio, csvS.trim(), '', MARCA_TODO.corr, csvC.trim(), '');
        descargarArchivo(partes.join('\n'), 'configuracion_completa_simulador.csv', 'text/csv');
        mostrarToast(`Configuración completa exportada: general + ${nFilas(csvP)} prueba(s), ${nFilas(csvS)} variable(s), ${nFilas(csvC)} correlación(es)`, 'success');
    } catch (error) {
        mostrarToast('Error al exportar: ' + error.message, 'error');
    }
}
function importarConfigTodo(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const texto = String(event.target.result);
            if (!texto.includes(MARCA_TODO.pruebas)) {
                mostrarToast('Este archivo no es una configuración completa. Usa el botón «Importar CSV» de cada tabla, o exporta primero con «Exportar TODO».', 'error');
                return;
            }
            const bloque = (ini, fin) => {
                const a = texto.indexOf(ini);
                if (a < 0) return '';
                const desde = a + ini.length;
                const b = fin ? texto.indexOf(fin, desde) : -1;
                return texto.slice(desde, b < 0 ? undefined : b).trim();
            };
            // Archivos antiguos SIN ###GENERAL### siguen funcionando: el bloque sale vacío.
            const csvG = bloque(MARCA_TODO.general, texto.includes(MARCA_TODO.tests) ? MARCA_TODO.tests : MARCA_TODO.pruebas);
            const csvT = bloque(MARCA_TODO.tests, MARCA_TODO.pruebas);
            const csvP = bloque(MARCA_TODO.pruebas, MARCA_TODO.socio);
            const csvS = bloque(MARCA_TODO.socio, MARCA_TODO.corr);
            const csvC = bloque(MARCA_TODO.corr, null);
            // ORDEN OBLIGATORIO: primero I y II (definen las variables), luego III
            // (sus desplegables se llenan a partir de las anteriores).
            const rG = csvG ? aplicarCSVGeneral(csvG) : 0;
            const rT = csvT ? aplicarCSVTests(csvT) : 0;   // los tests van ANTES que las escalas
            const rP = csvP ? aplicarCSVPruebas(csvP) : 0;
            const rS = csvS ? aplicarCSVSocio(csvS) : 0;
            const rC = csvC ? aplicarCSVCorrelaciones(csvC) : { aplicadas: 0, omitidas: 0 };
            mostrarToast(`Configuración completa importada: ${rG ? 'general + ' : ''}${rP} prueba(s), ${rS} variable(s), ${rC.aplicadas} correlación(es)` + (rC.omitidas ? ` · ${rC.omitidas} correlación(es) omitida(s)` : ''), 'success');
        } catch (error) {
            mostrarToast('Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function exportarConfigPruebas() {
    try {
        const filas = document.querySelectorAll('#bodyPruebas .fila-prueba');
        if (filas.length === 0) {
            mostrarToast('No hay pruebas para exportar', 'warning');
            return;
        }
        // Crear CSV con encabezados
        let csv = 'Prueba,Escala,Tipo,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa\n';
        filas.forEach(fila => {
            const inputs = fila.querySelectorAll('input');
            const selectTipo = fila.querySelector('[aria-label="Tipo de escala"]');
            const selectDist = fila.querySelector('[aria-label="Distribución"]');
            const tipo = selectTipo ? selectTipo.value : 'dimension';
            const distribucion = selectDist ? selectDist.value : 'normal';
            const prueba = inputs[0].value.trim() || '';
            const escala = inputs[1].value.trim() || '';
            const numItems = inputs[2].value || '';
            const media = inputs[3].value || '';
            const de = inputs[4].value || '';
            const min = inputs[5].value || '';
            const max = inputs[6].value || '';
            const alfa = inputs[7] ? (inputs[7].value || '') : '';
            // Escapar valores con comas
            const esc = v => (v.includes(',') ? `"${v}"` : v);
            csv += `${esc(prueba)},${esc(escala)},${tipo},${numItems},${distribucion},${media},${de},${min},${max},${alfa}\n`;
        });
        // Descargar archivo
        descargarArchivo(csv, 'configuracion_pruebas.csv', 'text/csv');
        mostrarToast('Configuración de pruebas exportada exitosamente', 'success');
    } catch (error) {
        mostrarToast('Error al exportar: ' + error.message, 'error');
    }
}
function importarConfigPruebas(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const csv = event.target.result;
            const lineas = csv.trim().split('\n');
            if (lineas.length < 2) {
                mostrarToast('El archivo CSV está vacío o no tiene datos', 'error');
                return;
            }
            // Verificar encabezados
            const encabezados = lineas[0].toLowerCase();
            if (!encabezados.includes('numitems')) {
                mostrarToast('El archivo CSV no tiene el formato correcto. Encabezados esperados: Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa', 'error');
                return;
            }
            // Compatibilidad de formatos:
            //  nuevo:      Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa
            //  intermedio: Nombre,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa
            //  antiguo:    Nombre,NumItems,Media,DE,MinItem,MaxItem,Alfa
            const tienePruebaEscala = encabezados.includes('escala');
            const tieneTipo = encabezados.includes('tipo');
            const tieneDistribucion = encabezados.includes('distribucion');
            // Limpiar tabla actual
            const tbody = document.getElementById('bodyPruebas');
            tbody.innerHTML = '';
            // Procesar cada línea (saltar encabezados)
            for (let i = 1; i < lineas.length; i++) {
                const linea = lineas[i].trim();
                if (!linea) continue;
                const valores = parsearLineaCSV(linea);
                if (valores.length < 4) continue;
                if (tienePruebaEscala) {
                    const off = tieneTipo ? 1 : 0; // formato nuevo incluye columna Tipo
                    agregarFilaPruebaConDatos({
                        prueba: valores[0] || '',
                        nombre: valores[1] || '',
                        tipo: tieneTipo ? (valores[2] || 'dimension') : 'dimension',
                        numItems: valores[2 + off] || '',
                        distribucion: valores[3 + off] || 'normal',
                        media: valores[4 + off] || '',
                        de: valores[5 + off] || '',
                        min: valores[6 + off] || '',
                        max: valores[7 + off] || '',
                        alfa: valores[8 + off] || ''
                    });
                } else if (tieneDistribucion) {
                    // Formato sin columna Prueba: usar el mismo nombre como prueba y escala
                    agregarFilaPruebaConDatos({
                        prueba: valores[0] || '',
                        nombre: valores[0] || '',
                        numItems: valores[1] || '',
                        distribucion: valores[2] || 'normal',
                        media: valores[3] || '',
                        de: valores[4] || '',
                        min: valores[5] || '',
                        max: valores[6] || '',
                        alfa: valores[7] || ''
                    });
                } else {
                    agregarFilaPruebaConDatos({
                        prueba: valores[0] || '',
                        nombre: valores[0] || '',
                        numItems: valores[1] || '',
                        distribucion: 'normal',
                        media: valores[2] || '',
                        de: valores[3] || '',
                        min: valores[4] || '',
                        max: valores[5] || '',
                        alfa: valores[6] || ''
                    });
                }
            }
            mostrarToast(`Configuración importada: ${lineas.length - 1} pruebas`, 'success');
        } catch (error) {
            mostrarToast('Error al importar: ' + error.message, 'error');
        }
    };
    reader.onerror = function () {
        mostrarToast('No se pudo leer el archivo', 'error');
    };
    reader.readAsText(file);
    e.target.value = ''; // Limpiar input
}
// ===================== CUADRO DE PRUEBAS (TESTS) =====================
// Define qué tests existen y qué variable psicológica mide cada uno. Alimenta
// el desplegable «Prueba (test)» de la tabla de escalas.
function agregarFilaTestConDatos(datos = {}) {
    const tbody = document.getElementById('bodyTests');
    if (!tbody) return;
    const fila = document.createElement('tr');
    fila.className = 'fila-test';
    fila.innerHTML = `
        <td><input type="text" class="input input-sm" placeholder="Ej: EQ-i:YV" maxlength="100" value="${datos.prueba || ''}" aria-label="Nombre del test"></td>
        <td><input type="text" class="input input-sm" placeholder="Ej: Inteligencia emocional" maxlength="100" value="${datos.variable || ''}" aria-label="Variable psicológica"></td>
        <td><input type="number" class="input input-sm" step="0.05" min="-0.99" max="0.99" value="${datos.rIntra !== undefined && datos.rIntra !== '' ? datos.rIntra : '0.40'}" aria-label="Correlación entre dimensiones" title="Correlación esperada entre las dimensiones de este test (las subescalas de un mismo instrumento suelen correlacionar entre 0.30 y 0.60). Una pareja fijada en la tabla III prevalece sobre este valor."></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar test">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>`;
    tbody.appendChild(fila);
    fila.querySelector('[aria-label="Nombre del test"]').addEventListener('input', refrescarSelectoresDePrueba);
    refrescarSelectoresDePrueba();
}
function agregarFilaTest() { agregarFilaTestConDatos({}); }
// Nombres de test definidos arriba (sin vacíos ni repetidos).
function testsDefinidos() {
    const out = [];
    document.querySelectorAll('#bodyTests .fila-test').forEach(f => {
        const nombre = (f.querySelector('[aria-label="Nombre del test"]') || {}).value || '';
        const variable = (f.querySelector('[aria-label="Variable psicológica"]') || {}).value || '';
        const rIntra = (f.querySelector('[aria-label="Correlación entre dimensiones"]') || {}).value || '';
        if (nombre.trim() && !out.some(x => x.prueba === nombre.trim())) out.push({ prueba: nombre.trim(), variable: variable.trim(), rIntra: rIntra.trim() });
    });
    return out;
}
// Repuebla los desplegables de la tabla de escalas conservando la selección.
function refrescarSelectoresDePrueba() {
    const tests = testsDefinidos();
    document.querySelectorAll('#bodyPruebas .fila-prueba [aria-label="Nombre de la prueba"]').forEach(sel => {
        if (!sel || sel.tagName !== 'SELECT') return;
        const actual = sel.value;
        sel.innerHTML = '<option value="">— elige un test —</option>'
            + tests.map(t => `<option value="${t.prueba}"${t.prueba === actual ? ' selected' : ''}>${t.prueba}</option>`).join('');
        if (actual && !tests.some(t => t.prueba === actual)) sel.value = '';
    });
}

function agregarFilaPruebaConDatos(datos) {
    const tbody = document.getElementById('bodyPruebas');
    const nuevaFila = document.createElement('tr');
    nuevaFila.className = 'fila-prueba';
    const dist = datos.distribucion || 'normal';
    const opcion = (valor, etiqueta) => `<option value="${valor}"${dist === valor ? ' selected' : ''}>${etiqueta}</option>`;
    nuevaFila.innerHTML = `
        <td><select class="input input-sm" aria-label="Nombre de la prueba"></select></td>
        <td><input type="text" class="input input-sm" placeholder="Ej: Memoria de trabajo" maxlength="100" value="${datos.nombre}" aria-label="Nombre de la escala"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 60" min="1" value="${datos.numItems}" aria-label="Número de ítems"></td>
        <td>
            <select class="input input-sm" aria-label="Distribución">
                ${opcion('normal', 'Normal')}${opcion('uniforme', 'Uniforme')}${opcion('asimetrica', 'Asimétrica')}
            </select>
        </td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 100" step="0.01" value="${datos.media}" aria-label="Media (M)"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 15" step="0.01" min="0.01" value="${datos.de}" aria-label="Desviación estándar (DE)"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 0" step="1" value="${datos.min}" aria-label="Mínimo por ítem"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 5" step="1" value="${datos.max}" aria-label="Máximo por ítem"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 0.85" step="0.01" min="0" max="0.99" value="${datos.alfa || ''}" aria-label="Alfa de Cronbach objetivo"></td>
        <td><input type="number" class="input input-sm" placeholder="0" step="1" min="0" value="${datos.invertidos || ''}" aria-label="Ítems invertidos" title="Cuántos ítems de esta escala se puntúan al revés (se guardan reflejados, como en una base real: hay que recodificarlos antes de sumar). Son los ÚLTIMOS de la escala."></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(nuevaFila);
    // El desplegable se puebla con los tests del cuadro superior y se
    // preselecciona el que traiga el dato (importación/restauración).
    refrescarSelectoresDePrueba();
    const sel = nuevaFila.querySelector('[aria-label="Nombre de la prueba"]');
    if (sel && datos.prueba) {
        if (!Array.from(sel.options).some(o => o.value === datos.prueba)) {
            agregarFilaTestConDatos({ prueba: datos.prueba, variable: '' });   // test implícito de un CSV antiguo
            refrescarSelectoresDePrueba();
        }
        sel.value = datos.prueba;
    }
    actualizarLimitesPrueba(nuevaFila);
}
// SOCIODEMOGRÁFICOS
function exportarConfigSocio() {
    try {
        const filas = document.querySelectorAll('#bodySocio .fila-socio');
        if (filas.length === 0) {
            mostrarToast('No hay variables sociodemográficas para exportar', 'warning');
            return;
        }
        // Crear CSV con encabezados
        let csv = 'Categoria,Distribucion,Promedio,DE,Minimo,Maximo,Decimales\n';
        filas.forEach(fila => {
            const inputs = fila.querySelectorAll('input');
            const select = fila.querySelector('select');
            const categoria = inputs[0].value.trim() || '';
            const distribucion = select ? select.value : 'normal';
            const promedio = inputs[1].value || '';
            const de = inputs[2].value || '';
            const min = inputs[3].value || '';
            const max = inputs[4].value || '';
            const decimales = inputs[5].value || '';
            // Escapar valores con comas
            const categoriaEscapada = categoria.includes(',') ? `"${categoria}"` : categoria;
            csv += `${categoriaEscapada},${distribucion},${promedio},${de},${min},${max},${decimales}\n`;
        });
        // Descargar archivo
        descargarArchivo(csv, 'configuracion_sociodemograficos.csv', 'text/csv');
        mostrarToast('Configuración de sociodemográficos exportada exitosamente', 'success');
    } catch (error) {
        mostrarToast('Error al exportar: ' + error.message, 'error');
    }
}
function importarConfigSocio(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const csv = event.target.result;
            const lineas = csv.trim().split('\n');
            if (lineas.length < 2) {
                mostrarToast('El archivo CSV está vacío o no tiene datos', 'error');
                return;
            }
            // Verificar encabezados
            const encabezados = lineas[0].toLowerCase();
            if (!encabezados.includes('categoria') || !encabezados.includes('promedio')) {
                mostrarToast('El archivo CSV no tiene el formato correcto. Encabezados esperados: Categoria,Promedio,DE,Minimo,Maximo,Decimales', 'error');
                return;
            }
            // Limpiar tabla actual
            const tbody = document.getElementById('bodySocio');
            tbody.innerHTML = '';
            // El formato nuevo incluye una columna "Distribucion" tras "Categoria";
            // se detecta por el encabezado para mantener compatibilidad con CSV viejos.
            const tieneDistribucion = encabezados.includes('distribucion');
            // Procesar cada línea (saltar encabezados)
            for (let i = 1; i < lineas.length; i++) {
                const linea = lineas[i].trim();
                if (!linea) continue;
                const valores = parsearLineaCSV(linea);
                if (valores.length >= 3) {
                    const desplazamiento = tieneDistribucion ? 1 : 0;
                    agregarFilaSocioConDatos({
                        categoria: valores[0] || '',
                        distribucion: tieneDistribucion ? (valores[1] || 'normal') : 'normal',
                        promedio: valores[1 + desplazamiento] || '',
                        de: valores[2 + desplazamiento] || '',
                        min: valores[3 + desplazamiento] || '',
                        max: valores[4 + desplazamiento] || '',
                        decimales: valores[5 + desplazamiento] || '2'
                    });
                }
            }
            mostrarToast(`Configuración importada: ${lineas.length - 1} variables`, 'success');
        } catch (error) {
            mostrarToast('Error al importar: ' + error.message, 'error');
        }
    };
    reader.onerror = function () {
        mostrarToast('No se pudo leer el archivo', 'error');
    };
    reader.readAsText(file);
    e.target.value = ''; // Limpiar input
}
function agregarFilaSocioConDatos(datos) {
    const tbody = document.getElementById('bodySocio');
    const nuevaFila = document.createElement('tr');
    nuevaFila.className = 'fila-socio';
    const dist = datos.distribucion || 'normal';
    const opcion = (valor, etiqueta) => `<option value="${valor}"${dist === valor ? ' selected' : ''}>${etiqueta}</option>`;
    nuevaFila.innerHTML = `
        <td><input type="text" class="input input-sm" placeholder="Ej: Edad" value="${datos.categoria}" aria-label="Categoría"></td>
        <td>
            <select class="input input-sm" aria-label="Distribución">
                ${opcion('normal', 'Normal')}${opcion('uniforme', 'Uniforme')}${opcion('asimetrica', 'Asimétrica')}${opcion('conteo', 'Conteo (Poisson)')}${opcion('binaria', 'Binaria (0/1)')}${opcion('categorica', 'Categórica')}
            </select>
        </td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 20" step="0.01" value="${datos.promedio}" aria-label="Promedio"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 2.5" step="0.01" min="0.01" value="${datos.de}" aria-label="Desviación estándar"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 15" step="0.01" value="${datos.min}" aria-label="Mínimo"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 25" step="0.01" value="${datos.max}" aria-label="Máximo"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 2" min="0" max="4" value="${datos.decimales}" aria-label="Número de decimales"></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(nuevaFila);
    actualizarBloqueoSocio(nuevaFila);
}
// ========================================
// CONFIGURACIÓN DE GRÁFICOS CIENTÍFICOS
// ========================================
function inicializarGraficos() {
    // Usar los datos realmente cargados en el analizador (sirve tanto para
    // datos generados como para un CSV subido); con respaldo al generador.
    const datos = (window.AnalizadorEstadistico && window.AnalizadorEstadistico.obtenerDatos())
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
// ========================================
// UTILIDADES PARA CSV
// ========================================
function parsearLineaCSV(linea) {
    const resultado = [];
    let dentroComillas = false;
    let valorActual = '';
    for (let i = 0; i < linea.length; i++) {
        const char = linea[i];
        if (char === '"') {
            dentroComillas = !dentroComillas;
        } else if (char === ',' && !dentroComillas) {
            resultado.push(valorActual.trim());
            valorActual = '';
        } else {
            valorActual += char;
        }
    }
    resultado.push(valorActual.trim());
    return resultado;
}
function descargarArchivo(contenido, nombreArchivo, tipoMime) {
    const blob = new Blob([contenido], { type: tipoMime + ';charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', nombreArchivo);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
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
