// redactor/redactor/redaccion.js — RedactorTeorico: redacción por secciones, cosido de partes, marcadores, control de calidad y pase F3.
// Origen: redactor/redactor.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

import { IAAsistente } from '../../shared/ia-asistente.js';

export const metodosRedactorTeoricoRedaccion = {
    // ---- Redactar el documento COMPLETO (todas las secciones, en paralelo) ----
    async _onRedactarTodo() {
        const estado = document.getElementById('redEstado');
        const btn = document.getElementById('redRedactarTodo');
        const btnWord = document.getElementById('redDescargarWord');
        const res = document.getElementById('redResultado');
        const problema = (document.getElementById('antQuery') || {}).value || '';
        const variablesTexto = (document.getElementById('redVariables') || {}).value || '';
        const variables = this._leerVariables();
        this.actualizarInfoFuentes();
        let fuentes = this._fuentes();
        if (problema.trim().length < 15) { if (estado) estado.textContent = '⚠️ Falta el problema de investigación (arriba).'; return; }
        if (!variables.length) { if (estado) estado.textContent = '⚠️ Identifica (o escribe) primero las variables de estudio.'; return; }
        if (!fuentes.length) { if (estado) estado.textContent = '⚠️ No hay fuentes: usa la matriz o importa una exportada.'; return; }
        if (typeof IAAsistente === 'undefined') { if (estado) estado.textContent = '❌ El asistente de IA no está cargado.'; return; }
        // INSTANTÁNEA (F2.3): la reparación por DOI muta las fuentes en segundo
        // plano; una copia congela lo que esta redacción usará, sin carreras.
        fuentes = fuentes.map(f => ({ ...f, autores: (f.autores || []).slice(), fuentesAPI: (f.fuentesAPI || []).slice() }));
        const avisoReparando = this._reparandoDOI ? ' (la reparación de resúmenes por DOI seguía en curso: se redactó con la instantánea del momento).' : '';
        // FICHA DE INSTRUMENTOS: la verdad extraída de la matriz, para inyectar
        // y verificar. Si la extracción falla, el sistema degrada con gracia.
        if (estado) estado.textContent = '🧭 Leyendo la matriz: ficha de instrumentos…';
        let ficha = [];
        try { ficha = await IAAsistente.extraerFichaInstrumentos(fuentes); } catch (e) { console.warn('[Redactor] sin ficha de instrumentos:', e && e.message); }
        this._fichaInstrumentos = ficha;
        if (typeof IAAsistente !== 'undefined') IAAsistente._rescatesGroq = 0;
        const fichaNota = ficha.length
            ? ' FICHA DE INSTRUMENTOS (verificada de la matriz — nombra cada instrumento EXACTAMENTE con su constructo): '
              + ficha.map(i => `${i.nombre}${i.sigla ? ' (' + i.sigla + ')' : ''} → ${i.constructo}${i.familia ? ' [familia: ' + i.familia + ']' : ''}`).join('; ') + '.'
            : '';
        // Techo por llamada: lo define el asistente (configurable en un lugar).
        const MAX = (IAAsistente.MAX_FUENTES_SECCION && IAAsistente.MAX_FUENTES_SECCION > 0)
            ? IAAsistente.MAX_FUENTES_SECCION : 32;
        // Plan → tareas. partes:'auto' = ceil(fuentes/MAX): reparto equitativo
        // de TODO el corpus, cada parte con fuentes distintas (ventana rotatoria).
        const plan = this._construirPlanSecciones(variables);
        const tareas = [];
        let off = 0;
        for (const sec of plan) {
            const nPartes = sec.partes === 'auto'
                ? Math.max(1, Math.ceil(fuentes.length / MAX))
                : sec.partes;
            const porParte = Math.min(MAX, Math.max(Math.min(8, fuentes.length), Math.ceil(fuentes.length / nPartes)));
            const usadasEnSeccion = nPartes > 1 ? new Set() : null; // partes de una misma sección: fuentes disjuntas
            for (let p = 0; p < nPartes; p++) {
                let fsel = this._seleccionarFuentes(fuentes, sec.afinidad, porParte, off, usadasEnSeccion);
                off += porParte; // ventana completa: cada parte trae fuentes distintas
                let notaOMS = '';
                if (sec.titulo === 'Antecedentes' && p === 0) {
                    const pr = this._priorizarOMS(fsel, fuentes, 8, porParte);
                    fsel = pr.fsel;
                    if (pr.oms || pr.onu) notaOMS = ' CONVENCIÓN DE ORDEN OBLIGATORIA: abre la sección con los antecedentes'
                        + ' internacionales de organismos oficiales — son las primeras fuentes de tu lista, en este'
                        + ' orden: primero OMS/OPS, después ONU y sus agencias — integrándolos también por ejes, y'
                        + ' solo entonces continúa con los demás estudios (internacional → nacional → local).';
                } else if (sec.titulo === 'Planteamiento del problema') {
                    const pr = this._priorizarOMS(fsel, fuentes, 4, porParte);
                    fsel = pr.fsel;
                    if (pr.oms || pr.onu) notaOMS = ' Al abrir el planteamiento, usa los informes de organismos internacionales'
                        + ' (las primeras fuentes de tu lista: OMS/OPS primero, luego ONU) para dimensionar el contexto'
                        + ' global del fenómeno — como marco de apertura, sin convertir la prevalencia en el vacío del estudio.';
                }
                if (usadasEnSeccion) fsel.forEach(f => usadasEnSeccion.add(f));
                tareas.push({
                    seccion: sec.titulo,
                    titulo: nPartes > 1 ? `${sec.titulo} (parte ${p + 1} de ${nPartes})` : sec.titulo,
                    instrucciones: sec.instrucciones + notaOMS + fichaNota + (nPartes > 1
                        ? ` Esta es la PARTE ${p + 1} de ${nPartes}: construye los ejes únicamente con las fuentes que se te dan aquí (otras partes cubren las demás); no escribas introducción ni cierre generales de la sección.`
                          + (p > 0 ? ' APERTURA DE CONTINUACIÓN: el lector viene de las partes anteriores — PROHIBIDO reintroducir el tema, definir de nuevo los conceptos o abrir con «La relación entre X e Y…»: entra DIRECTO al primer eje o estudio, como si continuaras el párrafo anterior.' : '')
                          + (p < nPartes - 1 ? ' PROHIBIDO enunciar vacíos de evidencia en esta parte: se reservan para el cierre de la sección.'
                                             : ' Al cerrar esta última parte, enuncia UN ÚNICO vacío maestro que integre y jerarquice lo que el conjunto de la sección no cubre — nada de vacíos sueltos por eje.')
                        : ''),
                    fuentes: fsel
                });
            }
        }
        const t = btn ? btn.textContent : '';
        if (btn) btn.disabled = true;
        if (btnWord) btnWord.style.display = 'none';
        const btnPDFh = document.getElementById('redDescargarPDF'); if (btnPDFh) btnPDFh.style.display = 'none';
        const btnF3h = document.getElementById('redPaseF3'); if (btnF3h) btnF3h.style.display = 'none';
        if (res) { res.style.display = 'none'; res.textContent = ''; }
        const _t0 = performance.now();
        // Canales: los del Worker del REDACTOR (Gemini), con fallback al de Groq.
        // Concurrencia = min(claves, tope prudente, nº de tareas). El tope evita
        // que 9-10 llamadas pesadas golpeen Gemini a la vez (causa de los fallos
        // parciales); el chatConReintento con backoff absorbe los transitorios.
        const clavesDisp = await (IAAsistente.numClavesRedactor ? IAAsistente.numClavesRedactor()
            : (IAAsistente.numClaves ? IAAsistente.numClaves() : 1));
        const topeCanales = this._MAX_CANALES_REDACCION || 4;
        const clavesN = (Number.isFinite(clavesDisp) && clavesDisp > 0) ? clavesDisp : 1;
        const canales = Math.max(1, Math.min(clavesN, topeCanales, tareas.length || 1));
        let completadas = 0, conError = 0;
        const resultados = new Array(tareas.length).fill(null);
        const prog = () => {
            const tandas = Math.ceil((tareas.length - completadas) / canales);
            if (estado) estado.textContent = `📄 Redactando… ${completadas}/${tareas.length} secciones `
                + `(${canales} claves en paralelo)${tandas > 0 ? ` · quedan ~${tandas} tanda(s)` : ''}`;
            if (btn) btn.textContent = `⏳ ${completadas}/${tareas.length}…`;
        };
        prog();
        let siguiente = 0;
        const trabajador = async (canal) => {
            // Escalonado de arranque: los canales usan claves DISTINTAS (keyHint=canal),
            // así que la simultaneidad no quema cuota por clave; este pequeño stagger
            // solo suaviza el pico global sobre el Worker (cortesía, no necesidad).
            if (canal) await new Promise(r => setTimeout(r, Math.min(canal * this._STAGGER_MS, 1500)));
            let ultimo = 0;
            while (siguiente < tareas.length) {
                const i = siguiente++;
                const tarea = tareas[i];
                if (ultimo) {
                    const espera = this._ENFRIAMIENTO_MS - (performance.now() - ultimo);
                    if (espera > 0) await new Promise(r => setTimeout(r, espera));
                }
                ultimo = performance.now();
                try {
                    const bruto = await IAAsistente.redactarSeccion({
                        titulo: tarea.titulo, instrucciones: tarea.instrucciones,
                        problema, variablesTexto, fuentes: tarea.fuentes, keyHint: canal
                    });
                    // Centinela de truncado (MAX_TOKENS) inyectado por el cliente IA:
                    // sin él, una sección cortada a media frase pasaba en silencio.
                    const truncada = /\[\[TRUNCADO_MAX_TOKENS\]\]\s*$/.test(bruto);
                    const brutoLimpio = truncada ? bruto.replace(/\s*\[\[TRUNCADO_MAX_TOKENS\]\]\s*$/, '') : bruto;
                    if (truncada) {
                        resultados[i] = { seccion: tarea.seccion, texto: '[No se pudo generar esta parte: la respuesta llegó truncada por límite de tokens.]', reintentable: true, codigo: 'TRUNCADA' };
                    } else {
                        const proc = this._procesarParte(tarea, brutoLimpio);
                        const varsFaltan = /Definición conceptual/i.test(tarea.seccion)
                            ? this._leerVariables().map(v => v.nombre).filter(n => n && !this._normTexto(proc.texto).includes(this._normTexto(n)))
                            : [];
                        if (varsFaltan.length) {
                            resultados[i] = { seccion: tarea.seccion, texto: `[No se pudo generar esta parte: la definición no cubrió «${varsFaltan[0]}».]`, reintentable: true, codigo: 'INCOMPLETA' };
                        } else {
                            resultados[i] = { seccion: tarea.seccion, proveedor: (typeof IAAsistente !== 'undefined' && IAAsistente._ultimoProveedor) || 'gemini', texto: proc.texto,
                                fuentesUsadas: proc.fuentesUsadas, marcInvalidos: proc.invalidos, sinMarcadores: proc.sinMarcadores };
                        }
                    }
                } catch (e) {
                    conError++;
                    resultados[i] = { seccion: tarea.seccion, texto: `[No se pudo generar esta parte: ${e.message}]`,
                        reintentable: e.reintentable !== false, codigo: e.codigo || 'DESCONOCIDO', codigoRespaldo: e.codigoRespaldo };
                    if (typeof console !== 'undefined') console.warn(`[Redactor] sección "${tarea.titulo}" falló:`, (e.codigo || '?') + (e.codigoRespaldo ? '→' + e.codigoRespaldo : ''), '·', e.message);
                }
                completadas++; prog();
            }
        };
        await Promise.all(Array.from({ length: canales }, (_, c) => trabajador(c)));
        // SEGUNDA PASADA: reintentar SOLO las que fallaron por causas transitorias.
        // Las definitivas (bloqueo de seguridad) ya no se reintentan en vano.
        const fallidas = [];
        resultados.forEach((r, i) => { if (r && /^\[No se pudo generar/.test(r.texto) && (r.reintentable !== false || r.codigo === 'GEMINI_4XX')) fallidas.push(i); });
        // Tormenta de cuota-por-minuto: si hay fallos CUOTA_*, esperar a que la
        // ventana ruede antes del rescate vale más que reintentar en caliente.
        const hayCuota = fallidas.some(i => /^CUOTA/.test(String((resultados[i] || {}).codigo || '')));
        if (hayCuota && fallidas.length) {
            if (estado) estado.textContent = `⏳ Cuota por minuto agotada en ${fallidas.length} parte(s): esperando ${Math.round((this._ESPERA_CUOTA_MS ?? 20000) / 1000)} s a que ruede la ventana antes del rescate…`;
            await new Promise(r => setTimeout(r, this._ESPERA_CUOTA_MS ?? 20000));
        }
        // GEMINI_4XX no es transitorio, pero un lote más pequeño a veces sí pasa:
        // se reintenta UNA vez con la mitad de fuentes (mínimo 6).
        if (fallidas.length) {
            if (estado) estado.textContent = `🔁 Reintentando ${fallidas.length} sección(es) con más calma…`;
            // Enfriamiento más largo antes de la 2ª pasada: si fue cuota/rate, dar aire.
            await new Promise(r => setTimeout(r, Math.max(this._ENFRIAMIENTO_MS, 8000)));
            let fi = 0;
            const reint = async (canal) => {
                let ultimoR = 0;
                while (fi < fallidas.length) {
                    const i = fallidas[fi++];
                    const base = tareas[i];
                    const con4xx = resultados[i] && resultados[i].codigo === 'GEMINI_4XX';
                    const tarea = con4xx
                        ? { ...base, fuentes: base.fuentes.slice(0, Math.max(6, Math.ceil(base.fuentes.length / 2))) }
                        : base;
                    if (con4xx && typeof console !== 'undefined') console.warn(`[Redactor] reintento 4xx con lote encogido (${tarea.fuentes.length} fuentes):`, base.titulo);
                    // Respiro también en la 2ª pasada: si cayó por cuota, martillear re-falla.
                    if (ultimoR) {
                        const espera = this._ENFRIAMIENTO_MS - (performance.now() - ultimoR);
                        if (espera > 0) await new Promise(r => setTimeout(r, espera));
                    }
                    ultimoR = performance.now();
                    try {
                        const bruto = await IAAsistente.redactarSeccion({
                            titulo: tarea.titulo, instrucciones: tarea.instrucciones,
                            problema, variablesTexto, fuentes: tarea.fuentes, keyHint: canal
                        });
                        // En el rescate se acepta el texto aunque venga truncado: mejor algo que nada.
                        const brutoLimpio = bruto.replace(/\s*\[\[TRUNCADO_MAX_TOKENS\]\]\s*$/, '');
                        const proc = this._procesarParte(tarea, brutoLimpio);
                        resultados[i] = { seccion: tarea.seccion, proveedor: (typeof IAAsistente !== 'undefined' && IAAsistente._ultimoProveedor) || 'gemini', texto: proc.texto,
                            fuentesUsadas: proc.fuentesUsadas, marcInvalidos: proc.invalidos, sinMarcadores: proc.sinMarcadores };
                        conError--;
                    } catch (e) {
                        // El placeholder refleja el error MÁS RECIENTE (no el de la 1ª pasada).
                        resultados[i] = { seccion: tarea.seccion, texto: `[No se pudo generar esta parte: ${e.message}]`,
                            reintentable: false, codigo: e.codigo || 'DESCONOCIDO' };
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(canales, fallidas.length) }, (_, c) => reint(c)));
        }
        // Unir las partes de cada sección en el ORDEN del plan.
        const secciones = [];
        const costura = { aperturas: new Map(), citas: new Map(), quitAperturas: 0, quitComodin: 0, corrConocidas: 0, trenes: 0 };
        for (const sec of plan) {
            const delSec = resultados.filter(r => r && r.seccion === sec.titulo);
            // Los banners de error son SAGRADOS: el cosedor los mutilaba (huella
            // repetida → primera frase fuera → «Reintenta en ~1 min…» huérfano).
            const partes = delSec.map(r => /^\[No se pudo generar/.test(String(r.texto || ''))
                ? r.texto
                : this._coserParte(this._corregirInstrumentos(this._limpiarTexto(r.texto), costura), costura));
            const usadasSec = new Set(); delSec.forEach(r => (r.fuentesUsadas || []).forEach(f => usadasSec.add(f)));
            secciones.push({ titulo: sec.titulo, capitulo: sec.capitulo || 'II', texto: partes.join('\n\n'),
                fuentesUsadas: [...usadasSec] });
        }
        const textoCompleto = secciones.map(s => s.texto).join('\n\n');
        // Texto REAL = sin los marcadores de error; es lo que decide si hubo éxito.
        const textoReal = textoCompleto.replace(/\[No se pudo generar[^\]]*\]/g, '').trim();
        const usadasGlobal = new Set(); let marcInvalidosTotal = 0, partesSinMarc = 0, partesConMarc = 0;
        resultados.forEach(r => {
            if (!r) return;
            (r.fuentesUsadas || []).forEach(f => usadasGlobal.add(f));
            marcInvalidosTotal += r.marcInvalidos || 0;
            if (r.sinMarcadores === true) partesSinMarc++; else if (r.fuentesUsadas) partesConMarc++;
        });
        const residuales = (textoReal.match(/[\[(]F\s*\d/g) || []).length;
        const citadas = partesConMarc > 0 ? [...usadasGlobal] : this._fuentesCitadas(textoReal, fuentes);
        const sospechosas = [...this._citasSospechosas(textoReal, fuentes), ...this._fantasmasNarrativos(textoReal, fuentes)];
        this._documento = { secciones, fuentes, citadas, problema,
            meta: { plantilla: 'P2-marcadores', fecha: new Date().toISOString(), canales,
                marcadores: { invalidos: marcInvalidosTotal, partesSinMarcadores: partesSinMarc, partesConMarcadores: partesConMarc },
                costura: { aperturas: costura.quitAperturas, comodin: costura.quitComodin },
                fichaInstrumentos: ficha } };
        const min = ((performance.now() - _t0) / 60000).toFixed(1);
        const palabras = textoReal.split(/\s+/).filter(Boolean).length;
        // Diagnóstico agrupado por código de error (para depurar de un vistazo).
        this._ultimoDiagnostico = {};
        resultados.forEach(r => { if (r && r.codigo) { const k = r.codigo + (r.codigoRespaldo ? '→' + r.codigoRespaldo : ''); this._ultimoDiagnostico[k] = (this._ultimoDiagnostico[k] || 0) + 1; } });
        if (marcInvalidosTotal > 0) this._ultimoDiagnostico.MARCADORES_INVALIDOS = marcInvalidosTotal;
        if (sospechosas.length) {
            this._ultimoDiagnostico.CITAS_SOSPECHOSAS = sospechosas.length;
            if (typeof console !== 'undefined') console.warn('[Redactor] Citas que NO están en tu matriz (revísalas una a una):', sospechosas);
        }
        if (conError > 0 && typeof console !== 'undefined') {
            console.warn('[Redactor] Resumen de fallos por tipo:', this._ultimoDiagnostico,
                '— consulta RedactorTeorico._ultimoDiagnostico para el detalle.');
        }
        if (res) {
            res.style.display = '';
            res.textContent = this._renderTexto(secciones);
        }
        try { this._guardarUltimo(); } catch (e) {}
        const recEnlace = document.getElementById('redRecuperar');
        if (recEnlace) recEnlace.style.display = 'none';
        // Si NO se produjo texto real, es un fallo total: diagnóstico claro, no falso "✓".
        if (palabras < 20) {
            const codigos = Object.entries(this._ultimoDiagnostico).sort((a, b) => b[1] - a[1]);
            const dominante = codigos.length ? codigos[0][0] : 'DESCONOCIDO';
            const explica = (IAAsistente._mensajePorCodigo ? IAAsistente._mensajePorCodigo(dominante, {}) : dominante);
            if (estado) estado.textContent = `❌ No se generó texto (${tareas.length} secciones fallaron). Motivo principal: ${explica} · Detalle por tipo: ${JSON.stringify(this._ultimoDiagnostico)}. Abre la consola (F12) para ver cada sección. Si es cuota, espera 1 min o añade claves; si es tamaño, reduce fuentes.`;
            if (btn) { btn.disabled = false; btn.textContent = t; }
            if (res) { res.style.display = 'none'; }
            return; // no mostrar documento vacío ni botón de Word
        }
        const avisoOMS = fuentes.some(f => this._esOMS(f)) ? ''
            : ' ⚠️ La matriz no contiene fuentes de la OMS/ONU: rehaz la búsqueda en el Buscador (ya integra IRIS de la OMS y ReliefWeb/Biblioteca Digital de la ONU) e importa la matriz actualizada.';
        // ===== PANEL DE DIAGNÓSTICO (petición del dueño: ordenado y visual) =====
        const esc = x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        // Errores FINALES desde la verdad (banners), no con contador sube-baja (adiós «-3»).
        const muertasFinal = resultados.filter(r => r && /^\[No se pudo generar/.test(String(r.texto || ''))).length;
        const provPorSec = new Map();
        const muertasPorSec = new Map();
        resultados.forEach(r => {
            if (!r) return;
            if (/^\[No se pudo generar/.test(String(r.texto || ''))) {
                muertasPorSec.set(r.seccion, (muertasPorSec.get(r.seccion) || 0) + 1);
                return;
            }
            if (!provPorSec.has(r.seccion)) provPorSec.set(r.seccion, new Set());
            provPorSec.get(r.seccion).add(r.proveedor || 'gemini');
        });
        let partesGem = 0, partesGrq = 0;
        resultados.forEach(r => { if (r && !/^\[No se pudo/.test(String(r.texto || ''))) { if (r.proveedor === 'groq') partesGrq++; else partesGem++; } });
        const chip = (txt, icono) => `<span style="display:inline-block;background:#eef2f7;border:1px solid #d6dee8;border-radius:999px;padding:1px 9px;margin:2px 3px 0 0;font-size:.88em;">${icono} ${esc(txt)}</span>`;
        const chipsSec = secciones.map(sec => {
            const ps = provPorSec.get(sec.titulo) || new Set();
            const base = ps.size === 0 ? '❌' : ps.has('groq') ? (ps.has('gemini') ? '✦🛟' : '🛟') : '✦';
            const icono = base + (ps.size > 0 && muertasPorSec.get(sec.titulo) ? '❌' : '');
            return chip(sec.titulo, icono);
        }).join('');
        const fila = (icono, etiqueta, contenido) => `<div style="margin:3px 0;"><b>${icono} ${etiqueta}:</b> ${contenido}</div>`;
        const alertas = [];
        if (residuales > 0) alertas.push(`❌ ${residuales} marcador(es) F# SIN convertir — redactor ANTIGUO en caché: sube ?v= y Ctrl+F5.`);
        if (muertasFinal > 0) alertas.push(`${muertasFinal} parte(s) con error — código(s): ${esc(JSON.stringify(this._ultimoDiagnostico))}`);
        if (sospechosas.length) alertas.push(`${sospechosas.length} cita(s) NO están en tu matriz: ${esc(sospechosas.slice(0, 3).join(' · '))}${sospechosas.length > 3 ? ' … (consola)' : ''}`);
        if ((this._ultimoSaneo.posiblesDuplicados || []).length) alertas.push(`${this._ultimoSaneo.posiblesDuplicados.length} posible(s) referencia(s) duplicada(s) (misma obra, dos idiomas/fuentes) — consola`);
        if (costura.trenes > 0) alertas.push(`${costura.trenes} tren(es) de citas A→B→C sin jerarquizar`);
        for (const a of this._detectarContradiccionPosicionamiento(secciones, variables)) alertas.push(a);
        const muletillas = this._muletillasDoc(textoReal);
        if (muletillas.length) alertas.push(`🧬 plantilla repetida: ${muletillas.map(([k, n]) => `«${esc(k)}…»×${n}`).join(' · ')} — varía la retórica (la F3 reescribirá)`);
        const vacios = this._declaracionesVacio(textoReal);
        if (vacios > 2) alertas.push(`${vacios} declaraciones de vacío — deja la maestra (Estado) y la de cierre`);
        if (avisoOMS) alertas.push(esc(avisoOMS.replace(/^\s*⚠️\s*/, '')));
        if (avisoReparando) alertas.push(esc(avisoReparando.replace(/^[\s(.]+|[).]+$/g, '')));
        const saneoBits = [];
        if (this._ultimoSaneo.reparadas) saneoBits.push(`${this._ultimoSaneo.reparadas} cita(s) reparada(s)`);
        if (this._ultimoSaneo.refsRec) saneoBits.push(`${this._ultimoSaneo.refsRec} referencia(s) APA reconstruida(s) (sin revista — Crossref llega en F3)`);
        if (this._ultimoSaneo.excluidas) saneoBits.push(`${this._ultimoSaneo.excluidas} pseudo-registro(s) excluido(s)`);
        if (this._ultimoSaneo.corruptos) saneoBits.push(`${this._ultimoSaneo.corruptos} campo(s) corruptos limpiados`);
        const costuraBits = [];
        if (costura.quitAperturas) costuraBits.push(`${costura.quitAperturas} apertura(s) repetida(s)`);
        if (costura.quitComodin) costuraBits.push(`${costura.quitComodin} frase(s) duplicada(s)`);
        if (costura.corrConocidas) costuraBits.push(`${costura.corrConocidas} etiqueta(s) de instrumento corregida(s)`);
        if (estado) estado.innerHTML = `<div style="text-align:left;border:1px solid #d0d7de;border-radius:10px;padding:10px 14px;background:#f8fafc;line-height:1.6;">`
            + `<div style="font-weight:700;color:#116329;">✓ Documento redactado en ${min} min</div>`
            + fila('📄', 'Documento', `${secciones.length} secciones · ~${palabras.toLocaleString('es')} palabras · <b>${citadas.length}</b> de ${fuentes.length} fuentes citadas${partesConMarc > 0 ? ' (conteo exacto por marcadores)' : ''}${partesSinMarc ? ` · ${partesSinMarc} parte(s) en modo compatibilidad` : ''}${marcInvalidosTotal > 0 ? ` · ${marcInvalidosTotal} alucinación(es) de fuente cazada(s)` : ''}`)
            + fila('🤖', 'Motores', `✦ Gemini ${partesGem} parte(s)${partesGrq ? ` · 🛟 Groq ${partesGrq} rescate(s)` : ''}<br>${chipsSec}`)
            + (costuraBits.length ? fila('🧵', 'Costura', costuraBits.join(' · ')) : '')
            + (saneoBits.length ? fila('🩺', 'Saneo de matriz', saneoBits.join(' · ')) : '')
            + (alertas.length ? `<div style="margin-top:6px;padding:6px 10px;border-left:3px solid #d4a72c;background:#fff8e5;border-radius:0 6px 6px 0;">${alertas.map(a => `<div style="margin:2px 0;">⚠️ ${a}</div>`).join('')}</div>` : '')
            + `<div style="margin-top:6px;color:#57606a;">📥 Descárgalo en <b>Word</b> o <b>PDF</b> y verifica cada cita contra la fuente original.</div>`
            + `</div>`;
        if (btnWord) btnWord.style.display = '';
        const btnPDFs = document.getElementById('redDescargarPDF'); if (btnPDFs) btnPDFs.style.display = '';
        const btnF3s = document.getElementById('redPaseF3'); if (btnF3s) btnF3s.style.display = '';
        const btnCop = document.getElementById('redCopiar');
        if (btnCop) btnCop.style.display = '';
        if (btn) { btn.disabled = false; btn.textContent = t; }
    },


    _limpiarTexto(t) {
        t = String(t || '').replace(/\*([^*\n]{1,80})\*/g, '$1');   // *énfasis* markdown residual
        return String(t || '')
            .replace(/^#+\s*/gm, '')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/[\u00A0\u2007\u2009\u202F\u2060]/g, ' ')
            .trim();
    },


    _guardarUltimo() {
        if (typeof localStorage === 'undefined' || !this._documento) return;
        const d = this._documento;
        const idx = new Map(d.fuentes.map((f, i) => [f, i]));
        const ligera = f => ({ titulo: f.titulo, cita: f.cita, ref: f.ref, anio: f.anio, doi: f.doi,
            autores: (f.autores || []).slice(0, 8), fuente: f.fuente });
        const data = { t: Date.now(), problema: d.problema,
            secciones: d.secciones.map(s => ({ titulo: s.titulo, capitulo: s.capitulo, texto: s.texto })),
            fuentes: d.fuentes.map(ligera),
            citadasIdx: (d.citadas || []).map(f => idx.get(f)).filter(n => n != null) };
        try { localStorage.setItem(this._CLAVE_GUARDADO, JSON.stringify(data)); } catch (e) {}
    },


    _renderTexto(secciones) {
        let capAct = '';
        return secciones.map(s => {
            let enc = '';
            if ((s.capitulo || 'II') !== capAct) {
                capAct = s.capitulo || 'II';
                enc = (capAct === 'I' ? 'CAPÍTULO I: INTRODUCCIÓN' : 'CAPÍTULO II: MARCO TEÓRICO') + '\n\n';
            }
            return enc + s.titulo.toUpperCase() + '\n\n' + s.texto;
        }).join('\n\n\n');
    },


    _recuperarUltimo() {
        let d;
        try { d = JSON.parse(localStorage.getItem(this._CLAVE_GUARDADO) || 'null'); } catch (e) { d = null; }
        if (!d || !Array.isArray(d.secciones) || !d.secciones.length) return false;
        const fuentes = d.fuentes || [];
        this._documento = { secciones: d.secciones, fuentes,
            citadas: (d.citadasIdx || []).map(i => fuentes[i]).filter(Boolean), problema: d.problema || '' };
        const res = document.getElementById('redResultado');
        if (res) { res.style.display = ''; res.textContent = this._renderTexto(d.secciones); }
        const bW = document.getElementById('redDescargarWord'); if (bW) bW.style.display = '';
        const bP = document.getElementById('redDescargarPDF'); if (bP) bP.style.display = '';
        const bF3 = document.getElementById('redPaseF3'); if (bF3) bF3.style.display = '';
        const bC = document.getElementById('redCopiar'); if (bC) bC.style.display = '';
        const est = document.getElementById('redEstado');
        const min = Math.max(1, Math.round((Date.now() - (d.t || Date.now())) / 60000));
        if (est) est.textContent = `📂 Redacción recuperada (guardada hace ${min < 60 ? min + ' min' : Math.round(min / 60) + ' h'}): ` +
            `${d.secciones.length} secciones, ${(this._documento.citadas || []).length} fuentes citadas. Puedes descargarla en Word.`;
        const rec = document.getElementById('redRecuperar'); if (rec) rec.style.display = 'none';
        return true;
    },


    _objetivosF3() {
        const doc = this._documento;
        if (!doc || !doc.secciones) return [];
        const textoTotal = doc.secciones.map(s => s.texto).join('\n\n');
        const muletillas = new Set(this._muletillasDoc(textoTotal).map(([k]) => k));
        const variables = this._leerVariables();
        const ficha = (doc.meta && doc.meta.fichaInstrumentos) || this._fichaInstrumentos || [];
        const contradic = this._detectarContradiccionPosicionamiento(doc.secciones, variables);
        const famObjetivo = {};
        for (const v of variables) {
            if (!contradic.some(a => a.includes(v.nombre))) continue;
            const toksV = String(v.nombre).toLowerCase().split(/\s+/);
            const insV = ficha.find(i => i.familia && toksV.some(tk => tk.length > 4 && String(i.constructo || '').includes(tk)));
            if (insV) famObjetivo[v.nombre] = { familia: insV.familia, sigla: insV.sigla || insV.nombre };
            else {
                for (const sec of doc.secciones) {
                    if (!sec.titulo.toLowerCase().includes(v.nombre.toLowerCase())) continue;
                    const m = (sec.texto.match(/se adopta[^.]{0,200}/i) || [''])[0].match(this._FAMILIAS_RE);
                    if (m) { famObjetivo[v.nombre] = { familia: m[0], sigla: '' }; break; }
                }
            }
        }
        const objetivos = [];
        const vistasMuletilla = new Set();
        doc.secciones.forEach((sec, iSec) => {
            const parrs = String(sec.texto || '').split(/\n{2,}/);
            const esEstado = /Estado de la cuesti/i.test(sec.titulo);
            const esDef = /Definici\u00f3n conceptual/i.test(sec.titulo);
            let vaciosEstado = [];
            if (esEstado) parrs.forEach((p, i) => { if (this._declaracionesVacio(p) > 0) vaciosEstado.push(i); });
            const maestraIdx = vaciosEstado.length ? vaciosEstado[vaciosEstado.length - 1] : -1;
            parrs.forEach((p, iParr) => {
                if (/^\[No se pudo generar/.test(p.trim()) || p.trim().length < 120) return;
                // POSICIONAMIENTO (prioridad m\u00e1xima)
                for (const v of variables) {
                    const fo = famObjetivo[v.nombre];
                    if (!fo || !sec.titulo.toLowerCase().includes(v.nombre.toLowerCase())) continue;
                    if (/se adopta/i.test(p)) {
                        const fams = p.match(this._FAMILIAS_RE) || [];
                        if (fams.some(f => f.replace(/-/g, '') !== String(fo.familia).replace(/-/g, ''))) {
                            objetivos.push({ iSec, iParr, tipo: 'POSICIONAMIENTO', prioridad: 0, texto: p,
                                instruccion: `Unifica el posicionamiento: el modelo adoptado para \u00ab${v.nombre}\u00bb es \u00ab${fo.familia}\u00bb${fo.sigla ? ` (en correspondencia con el instrumento ${fo.sigla})` : ''}. Reescribe para que la adopci\u00f3n declare SOLO esa familia, justificando la correspondencia; las dem\u00e1s familias pueden mencionarse \u00fanicamente como alternativas descartadas.` });
                            return;
                        }
                    }
                }
                // TREN de citas (\u22654 narrativas seguidas)
                let run = 0, hayTren = false;
                for (const fr of this._frases(p)) { if (this._esNarrativaFr(fr)) { run++; if (run >= 4) hayTren = true; } else run = 0; }
                if (hayTren) {
                    objetivos.push({ iSec, iParr, tipo: 'TREN', prioridad: 1, texto: p,
                        instruccion: 'Este p\u00e1rrafo encadena 4+ frases \u00abAutor (a\u00f1o) hall\u00f3\u2026\u00bb. Reag\u00fapalo por IDEAS con frases-tema propias y los estudios como respaldo dentro (narrativas o parent\u00e9ticas), variando la ret\u00f3rica.' });
                    return;
                }
                // VAC\u00cdO no-maestro
                if (this._declaracionesVacio(p) > 0 && !(esEstado && iParr === maestraIdx) && !(esDef && iParr === parrs.length - 1)) {
                    objetivos.push({ iSec, iParr, tipo: 'VACIO', prioridad: 2, texto: p,
                        instruccion: 'Elimina la declaraci\u00f3n de vac\u00edo/laguna/escasez de este p\u00e1rrafo (el vac\u00edo maestro vive en el Estado de la cuesti\u00f3n): cierra la idea con una s\u00edntesis del aporte, sin anunciar carencias.' });
                    return;
                }
                // MULETILLA (2\u00aa+ aparici\u00f3n del mismo arranque)
                for (const fr of this._frases(p)) {
                    const k = fr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
                    if (k.split(' ').length === 3 && muletillas.has(k)) {
                        if (!vistasMuletilla.has(k)) { vistasMuletilla.add(k); break; }
                        objetivos.push({ iSec, iParr, tipo: 'MULETILLA', prioridad: 3, texto: p,
                            instruccion: `El arranque \u00ab${k}\u2026\u00bb ya se us\u00f3 antes en el documento: reescribe la(s) frase(s) que lo repiten con otra estructura ret\u00f3rica, manteniendo el contenido.` });
                        return;
                    }
                }
            });
        });
        objetivos.sort((a, b) => a.prioridad - b.prioridad);
        return objetivos.slice(0, 14);
    },


    async _onPaseF3() {
        if (!this._documento) return;
        const estado = document.getElementById('redEstado');
        const btn = document.getElementById('redPaseF3');
        const objetivos = this._objetivosF3();
        if (!objetivos.length) { if (estado) estado.textContent = '\u2728 F3: los radares est\u00e1n limpios \u2014 nada que pulir.'; return; }
        if (btn) { btn.disabled = true; btn.textContent = '\ud83e\uddea Puliendo\u2026'; }
        const porSec = new Map();
        objetivos.forEach(o => { if (!porSec.has(o.iSec)) porSec.set(o.iSec, []); porSec.get(o.iSec).push(o); });
        let aplicados = 0, rechazados = 0, fallos = 0;
        const antes = { trenes: 0, muletillas: this._muletillasDoc(this._documento.secciones.map(s => s.texto).join('\n\n')).length, vacios: this._declaracionesVacio(this._documento.secciones.map(s => s.texto).join('\n\n')) };
        let hechas = 0;
        for (const [iSec, items] of porSec) {
            const sec = this._documento.secciones[iSec];
            if (estado) estado.textContent = `\ud83e\uddea F3: puliendo \u00ab${sec.titulo}\u00bb (${++hechas}/${porSec.size} secciones, ${items.length} pasaje(s))\u2026`;
            let reescritos = [];
            try { reescritos = await IAAsistente.pulirPasajes(sec.titulo, items.map(o => ({ i: o.iParr, tipo: o.tipo, instruccion: o.instruccion, texto: o.texto })), { keyHint: (hechas - 1) % 10 }); }
            catch (e) { fallos += items.length; console.warn('[F3] secci\u00f3n fall\u00f3:', sec.titulo, e && e.codigo, e && e.message); continue; }
            const parrs = String(sec.texto || '').split(/\n{2,}/);
            for (const r of reescritos) {
                const orig = parrs[r.i];
                if (typeof orig !== 'string') { rechazados++; continue; }
                const nuevo = this._limpiarTexto(r.texto);
                const ratio = nuevo.length / Math.max(1, orig.length);
                const seguro = this._mismaFirma(this._firmaCitas(orig), this._firmaCitas(nuevo))
                    && !/[\[(]F\d|\bF\d/.test(nuevo) && !/^\[No se pudo/.test(nuevo) && ratio > 0.5 && ratio < 1.7;
                if (seguro) { parrs[r.i] = nuevo; aplicados++; } else { rechazados++; }
            }
            sec.texto = parrs.join('\n\n');
        }
        const textoNuevo = this._documento.secciones.map(s => `${s.titulo}\n\n${s.texto}`).join('\n\n\n');
        const res = document.getElementById('redResultado');
        if (res) res.textContent = textoNuevo;
        this._documento.meta.f3 = { fecha: new Date().toISOString(), aplicados, rechazados, fallos };
        try { this._guardarUltimo(); } catch (e) {}
        const todo = this._documento.secciones.map(s => s.texto).join('\n\n');
        const despues = { muletillas: this._muletillasDoc(todo).length, vacios: this._declaracionesVacio(todo) };
        const contradicPost = this._detectarContradiccionPosicionamiento(this._documento.secciones, this._leerVariables()).length;
        if (estado) estado.innerHTML = `<div style="text-align:left;border:1px solid #d0d7de;border-radius:10px;padding:10px 14px;background:#f8fafc;line-height:1.6;">`
            + `<div style="font-weight:700;color:#116329;">\ud83e\uddea Pase de coherencia F3 completado</div>`
            + `<div><b>\u270d\ufe0f Pulido:</b> ${aplicados} pasaje(s) reescrito(s) \u00b7 ${rechazados} rechazado(s) por seguridad de citas${fallos ? ` \u00b7 ${fallos} sin respuesta del modelo` : ''}</div>`
            + `<div><b>\ud83d\udcc9 Radares:</b> muletillas ${antes.muletillas}\u2192${despues.muletillas} \u00b7 vac\u00edos ${antes.vacios}\u2192${despues.vacios} \u00b7 posicionamiento contradictorio: ${contradicPost ? '\u26a0\ufe0f a\u00fan presente' : '\u2705 unificado'}</div>`
            + `<div style="margin-top:4px;color:#57606a;">\ud83d\udce5 Vuelve a descargar Word/PDF para llevarte la versi\u00f3n pulida. Ninguna cita naci\u00f3 ni muri\u00f3: garantizado por firma.</div></div>`;
        if (btn) { btn.disabled = false; btn.textContent = '\ud83e\uddea Pase de coherencia (F3)'; }
    },


    // ---- Probar el motor: redactar el Planteamiento del problema ----
    async _onProbarSeccion() {
        const estado = document.getElementById('redEstado');
        const btn = document.getElementById('redProbar');
        const res = document.getElementById('redResultado');
        const problema = (document.getElementById('antQuery') || {}).value || '';
        const variablesTexto = (document.getElementById('redVariables') || {}).value || '';
        this.actualizarInfoFuentes();
        const fuentes = this._fuentes();
        if (problema.trim().length < 15) {
            if (estado) estado.textContent = '⚠️ Falta el problema de investigación (arriba).';
            return;
        }
        if (variablesTexto.trim().length < 5) {
            if (estado) estado.textContent = '⚠️ Identifica (o escribe) primero las variables de estudio.';
            return;
        }
        if (!fuentes.length) {
            if (estado) estado.textContent = '⚠️ No hay fuentes en la matriz: busca y marca artículos primero.';
            return;
        }
        const t = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Redactando…'; }
        const MAXp = (typeof IAAsistente !== 'undefined' && IAAsistente.MAX_FUENTES_SECCION) || 32;
        if (estado) estado.textContent = `✍️ Redactando con ${Math.min(fuentes.length, MAXp)} fuentes… puede tardar ~1 minuto.`;
        const _t0 = performance.now();
        try {
            if (typeof IAAsistente === 'undefined') throw new Error('El asistente de IA no está cargado.');
            const texto = await IAAsistente.redactarSeccion({
                titulo: 'Planteamiento del problema',
                instrucciones: 'Redacta el planteamiento del problema: fenómeno, contexto y consecuencias '
                    + '(cifras solo si están en los resúmenes). El vacío identificado debe ser coherente con '
                    + 'un estudio correlacional: controversia teórica o inconsistencia de hallazgos sobre la '
                    + 'relación entre las variables — NUNCA falta de datos de prevalencia (vacío descriptivo '
                    + 'ajeno a la pregunta). Cierra con la pregunta de investigación en forma correlacional.',
                problema,
                variablesTexto,
                fuentes,
                keyHint: 0
            });
            const seg = ((performance.now() - _t0) / 1000).toFixed(1);
            this._textos['planteamiento'] = { titulo: 'Planteamiento del problema', texto };
            if (res) { res.style.display = ''; res.textContent = texto; }
            if (estado) estado.textContent = `✓ Sección redactada en ${seg} s. Revisa el texto y las citas: `
                + `si la calidad te convence, pasamos a generar el documento completo.`;
        } catch (e) {
            if (estado) estado.textContent = '❌ ' + (e.message || 'No se pudo redactar la sección.')
                + (e.codigo ? ` (código: ${e.codigo})` : '');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = t; }
        }
    },
};
