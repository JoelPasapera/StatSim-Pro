// buscador/antecedentes/busqueda.js — Antecedentes: búsqueda desde la interfaz (variantes, relevancia, intensiva, criterios) y registro en el protocolo.
// Origen: buscador/antecedentes/interfaz.js (Fase 6, segunda pasada: partición por responsabilidad).

import { AliciaDirecto } from '../fuentes/alicia.js';
import { PubMedDirecto } from '../fuentes/pubmed.js';
import { ScholarDirecto } from '../fuentes/scholar.js';
import { ScieloDirecto } from '../fuentes/scielo.js';
import { ScienceDirectDirecto } from '../fuentes/sciencedirect.js';
import { ScopusDirecto } from '../fuentes/scopus.js';
import { WebOfScienceDirecto } from '../fuentes/wos.js';
import { PrismaDiagrama } from '../prisma.js';
import { ProtocoloBusqueda } from '../protocolo.js';
import { EVENTOS, bus } from '../../shared/eventos.js';
import { IAAsistente } from '../../shared/ia-asistente.js';

export const metodosAntecedentesBusqueda = {


    _renderSinonimos() {
        const q = document.getElementById('antQuery').value;
        const sin = this.sinonimosDe(q);
        const cont = document.getElementById('antSinonimos');
        cont.innerHTML = sin.length
            ? 'Prueba también: ' + sin.map(s =>
                `<a href="#" data-s="${s}" style="margin-right:0.6rem;">${s}</a>`).join('')
            : '';
        cont.querySelectorAll('a').forEach(a => a.addEventListener('click', e => {
            e.preventDefault();
            document.getElementById('antQuery').value = e.target.dataset.s;
            this._onBuscar();
        }));
    },



    // ---- Búsqueda intensiva · Generar VARIANTES de la consulta con IA ----
    async _onGenerarVariantes() {
        const consulta = (document.getElementById('antQuery') || {}).value || '';
        const zona = document.getElementById('antVariantesZona');
        const caja = document.getElementById('antVariantes');
        const estado = document.getElementById('antVariantesEstado');
        const btn = document.getElementById('antGenerarVariantes');
        const num = parseInt((document.getElementById('antNumVariantes') || {}).value || '5', 10);

        if (consulta.trim().length < 3) {
            if (estado) estado.textContent = '⚠️ Escribe primero los términos de búsqueda arriba.';
            const q = document.getElementById('antQuery'); if (q) q.focus();
            return;
        }
        // Confirmar si ya hay variantes escritas.
        if (caja && caja.value.trim().length > 5) {
            if (!confirm('Ya tienes variantes generadas. ¿Reemplazarlas por otras nuevas?')) return;
        }

        const textoBtn = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando…'; }
        if (estado) estado.textContent = 'La IA está generando variantes de tu consulta…';

        try {
            if (typeof IAAsistente === 'undefined') throw new Error('El asistente de IA no está cargado.');
            const variantes = await IAAsistente.generarVariantes(consulta, num);
            if (caja) caja.value = variantes.join('\n');
            if (zona) zona.style.display = '';
            if (estado) estado.textContent = `✓ ${variantes.length} variantes generadas. Revísalas, edítalas y pulsa «Buscar con todas las variantes».`;
        } catch (e) {
            if (estado) estado.textContent = '❌ ' + (e.message || 'No se pudieron generar las variantes.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
        }
    },



    // ---- Búsqueda intensiva · ejecutar la búsqueda con TODAS las variantes ----
    // Por cada variante (+ opcionalmente la original) ejecuta una búsqueda completa
    // con la configuración actual, combina todo y deduplica. Muestra progreso.
    // ---- Búsqueda intensiva · FILTRAR por relevancia con IA ----
    // Evalúa todos los resultados actuales (this._obras) contra los criterios,
    // en LOTES repartidos entre las claves del Worker. Añade puntuación 1-5 +
    // motivo a cada obra, y reordena la matriz por relevancia. No oculta nada.
    // Restablece el análisis/filtro de relevancia (las obras nuevas no tienen
    // puntuación: la columna se oculta y el selector vuelve a "Mostrar todas").
    _resetRelevancia() {
        this._relevanciaAplicada = false;
        this._umbralRelevancia = 0;
        const s = document.getElementById('antUmbralRelevancia');
        if (s) { s.value = '0'; s.disabled = true; }
    },



    async _onAnalizarRelevancia() {
        const estado = document.getElementById('antRelevanciaEstado');
        const btn = document.getElementById('antAnalizarRelevancia');
        const criterios = (document.getElementById('antCriterios') || {}).value || '';

        if (!this._obras || !this._obras.length) {
            if (estado) estado.textContent = '⚠️ Primero haz una búsqueda: no hay artículos que evaluar.';
            return;
        }
        if (criterios.trim().length < 20) {
            if (estado) estado.textContent = '⚠️ Genera o escribe primero los criterios de inclusión/exclusión (arriba).';
            const c = document.getElementById('antCriterios'); if (c) c.focus();
            return;
        }
        if (typeof IAAsistente === 'undefined' || !IAAsistente.disponible()) {
            if (estado) estado.textContent = '❌ El asistente de IA no está disponible.';
            return;
        }

        const textoBtn = btn ? btn.textContent : '';
        if (btn) btn.disabled = true;
        const _t0 = performance.now();

        // (2026.12.30) La lista que se evalúa, fijada al empezar: si mientras tanto llega una búsqueda nueva (el botón de
        // buscar sigue activo), las notas siguen yendo a ESTAS obras y no, por su posición, a las nuevas, que nunca se
        // evaluaron (hasta la 2026.12.29, así: «Trabajo nuevo 4 → 3» con el motivo de otra obra).
        const obras = this._obras;
        // Preparar los artículos con su índice real en esa lista.
        const articulos = obras.map((o, idx) => ({
            idx,
            titulo: o.titulo || '',
            resumen: o.resumen || o.abstract || ''
        }));

        // Dividir en lotes de 10 (decisión: ~10 artículos por llamada).
        const TAM_LOTE = 10;
        const lotes = [];
        for (let i = 0; i < articulos.length; i += TAM_LOTE) lotes.push(articulos.slice(i, i + TAM_LOTE));

        // CANALES: uno por clave del Worker (1 lote = 1 clave = 1 organización).
        // El número se consulta al Worker y AUTO-ESCALA: con 10 claves → 10 lotes
        // en paralelo = 100 referencias por tanda; si añades GROQ_KEY_11..20 en
        // Cloudflare, habrá más canales automáticamente, sin tocar código.
        const canales = Math.min(await IAAsistente.numClaves(), lotes.length);
        let completados = 0;
        let conError = 0;
        const total = lotes.length;

        // Enfriamiento por canal: cada organización admite ~8.000 tokens/minuto y
        // un lote de 10 referencias consume casi el minuto entero de su clave. Cada
        // canal espera ~62 s desde el INICIO de su lote anterior antes de lanzar el
        // siguiente: así nunca caen 2 lotes de la misma clave en el mismo minuto.
        const ENFRIAMIENTO_MS = this._ENFRIAMIENTO_RELEVANCIA_MS != null ? this._ENFRIAMIENTO_RELEVANCIA_MS : 62000;

        const actualizarProgreso = () => {
            const refsHechas = Math.min(completados * TAM_LOTE, articulos.length);
            const tandasRestantes = Math.ceil((total - completados) / canales);
            const estMin = tandasRestantes <= 0 ? '' : ` · quedan ~${tandasRestantes} min`;
            if (estado) estado.textContent = `🔎 Evaluando relevancia… ${refsHechas}/${articulos.length} referencias `
                + `(${canales} claves en paralelo, ritmo ~${canales * TAM_LOTE}/min)${estMin}`;
            if (btn) btn.textContent = `⏳ ${completados}/${total} lotes…`;
        };
        actualizarProgreso();

        // Cola de lotes atendida por N canales; el canal c usa SIEMPRE la clave c
        // (keyHint), garantizando el reparto 1 a 1 sin colisiones entre paralelos.
        let siguiente = 0;
        const trabajador = async (canal) => {
            let ultimoInicio = 0;
            while (siguiente < lotes.length) {
                const miIdx = siguiente++;
                const lote = lotes[miIdx];
                // Respetar el ritmo de la clave de este canal (TPM por minuto).
                if (ultimoInicio) {
                    const espera = ENFRIAMIENTO_MS - (performance.now() - ultimoInicio);
                    if (espera > 0) await new Promise(r => setTimeout(r, espera));
                }
                ultimoInicio = performance.now();
                try {
                    const evals = await IAAsistente.evaluarLoteRelevancia(criterios, lote, canal);
                    // Volcar cada evaluación a su obra por idx.
                    for (const ev of evals) {
                        if (obras[ev.idx]) {
                            obras[ev.idx]._relevancia = ev.puntua;       // 0-5 (0 = no evaluado)
                            obras[ev.idx]._relevanciaMotivo = ev.motivo;  // justificación
                        }
                    }
                } catch (e) {
                    conError++;
                    // Marcar el lote como no evaluado (puntua 0) para no perderlos.
                    for (const a of lote) {
                        if (obras[a.idx] && obras[a.idx]._relevancia == null) {
                            obras[a.idx]._relevancia = 0;
                            obras[a.idx]._relevanciaMotivo = 'No evaluado (error en el lote)';
                        }
                    }
                }
                completados++;
                actualizarProgreso();
            }
        };
        await Promise.all(Array.from({ length: canales }, (_, c) => trabajador(c)));

        // (2026.12.30) Una búsqueda nueva reemplazó los resultados durante la evaluación: las notas quedaron en la lista
        // anterior; la nueva no se reordena ni se filtra, y el PRISMA no cuenta como cribadas obras que no se evaluaron.
        if (this._obras !== obras) {
            if (estado) estado.textContent = '⚠️ Llegó una búsqueda nueva mientras se evaluaba la anterior: esa evaluación ya no se aplica. '
                + 'Pulsa «Analizar relevancia» otra vez para evaluar los resultados actuales.';
            if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
            return;
        }

        // Reordenar this._obras por relevancia DESC (los no evaluados, al final).
        this._obras.sort((a, b) => (b._relevancia || 0) - (a._relevancia || 0));
        this._relevanciaAplicada = true; // para que la matriz muestre la columna

        const _dur = this._formatoTiempo(performance.now() - _t0);
        const evaluados = this._obras.filter(o => o._relevancia > 0).length;
        if (typeof PrismaDiagrama !== 'undefined') {
            PrismaDiagrama.registrar('cribados', { n: evaluados });
        }
        if (estado) estado.textContent = `✓ ${evaluados} artículos evaluados en ${_dur}`
            + (conError ? ` (${conError} lote(s) con error)` : '')
            + `. Matriz reordenada por relevancia. Usa «Filtrar por relevancia» para ocultar las de puntuación baja.`;
        const selU = document.getElementById('antUmbralRelevancia');
        if (selU) selU.disabled = false; // el filtro se activa cuando hay puntuaciones
        bus.emit(EVENTOS.FUENTES_CAMBIADAS);   // el Redactor se suscribe; el Buscador no lo importa
        if (btn) { btn.disabled = false; btn.textContent = textoBtn; }

        // Re-renderizar resultados y matriz con la nueva columna.
        this._pagina = 0; this._selMat = 0;
        this._renderResultados(this._obras);
    },



    // Búsqueda intensiva en 1 clic: si aún no hay variantes, las genera con IA
    // (usando el Nº configurado) y a continuación busca con todas ellas. Si la
    // caja ya tiene variantes (generadas o editadas a mano), busca directamente.
    async _onIntensiva() {
        const caja = document.getElementById('antVariantes');
        const estado = document.getElementById('antVariantesEstado');
        if (!caja) return;
        // Variantes PROPIAS del usuario: se normalizan (trim + dedup, sin vacías)
        // y se usan tal cual — la IA ni se entera.
        // MISMO criterio que el ejecutor (>2 caracteres): así una línea de 1-2
        // letras no pasa aquí para morir en silencio después.
        const brutas = caja.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const propias = [...new Set(brutas.filter(s => s.length > 2))];
        const cortas = brutas.length - propias.length;
        if (propias.length) {
            caja.value = propias.join('\n');
            if (estado) estado.textContent = `✓ Usando tus ${propias.length} variante(s) personalizadas (sin llamar a la IA)`
                + (cortas ? ` · ⚠️ ${cortas} línea(s) descartada(s) por ser repetidas o demasiado cortas.` : '.');
        } else {
            await this._onGenerarVariantes();
        }
        if (caja.value.trim()) await this._onBuscarIntensivo();
    },



    async _onBuscarIntensivo() {
        const caja = document.getElementById('antVariantes');
        const estado = document.getElementById('antVariantesEstado');
        const btn = document.getElementById('antIntensivaBtn');
        const estadoBuscador = document.getElementById('antEstado');

        // Recoger las variantes (una por línea, ya editadas por el usuario).
        const variantes = (caja ? caja.value : '').split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 2);
        if (!variantes.length) {
            if (estado) estado.textContent = '⚠️ No hay variantes para buscar. Genera o escribe alguna.';
            return;
        }

        // ¿Incluir la consulta original como una búsqueda más?
        const incluirOrig = (document.getElementById('antIncluirOriginal') || {}).checked;
        const consultaOrig = (document.getElementById('antQuery') || {}).value.trim();
        const f = { desde: (document.getElementById('antDesde') || {}).value };
        const idiomas = this._idiomasSeleccionados();

        // Lista final de consultas base (original primero si se incluye).
        let consultas = variantes.slice();
        if (incluirOrig && consultaOrig && !consultas.some(c => c.toLowerCase() === consultaOrig.toLowerCase())) {
            consultas = [consultaOrig, ...consultas];
        }
        // PRESUPUESTO: variantes × idiomas con tope de 30 consultas totales.
        const plan = this._planPresupuesto(consultas.length, idiomas.length);
        if (plan.recortado) {
            const est = document.getElementById('antVariantesEstado');
            const msg = `⚠️ Máximo de ${plan.tope} búsquedas: se usarán ${plan.variantes} de tus ${consultas.length} variantes (×${idiomas.length} idioma(s)). Sube «Máx. búsquedas» para lanzarlas todas.`;
            if (est) est.textContent = msg;
            console.warn('[Buscador]', msg);
            consultas = consultas.slice(0, plan.variantes);
        }

        const textoBtn = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; }
        const _t0 = performance.now(); // cronómetro de la búsqueda intensiva

        // Acumulador con deduplicación incremental por DOI/título (la obra repetida suma sus bases a la que se queda).
        const vistos = new Map();
        const acumuladas = [];
        const infosTodas = [];
        let conError = 0;

        try {
            let paso = 0;
            for (let i = 0; i < consultas.length; i++) {
                const q = consultas[i];
                for (let ix = 0; ix < idiomas.length; ix++) {
                    const [cod, nombre] = idiomas[ix];
                    paso++;
                const etiqueta = `Variante ${i + 1}/${consultas.length} · ${nombre} (consulta ${paso}/${plan.total}): «${q}»…`;
                if (estado) estado.textContent = `🚀 ${etiqueta}`;
                if (estadoBuscador) estadoBuscador.textContent = etiqueta;
                if (btn) btn.textContent = `⏳ ${paso}/${plan.total}…`;

                try {
                    // Traducir esta variante al idioma de esta pasada (con caché).
                    let qEjec = q;
                    if (cod !== 'es') {
                        const tr = await this._traducirA(q, cod);
                        if (tr && tr.toLowerCase() !== q.toLowerCase()) qEjec = tr;
                    }
                    const base = (q === consultaOrig)
                        ? 'búsqueda intensiva (consulta original)'
                        : 'variante de la búsqueda intensiva';
                    this._protocoloNota = cod === 'es' ? base : `${base} · traducción al ${nombre}`;
                    const { obras, infos } = await this._buscarUnaConsulta(qEjec, { ...f, idioma: cod });
                    this._protocoloNota = '';
                    infosTodas.push(`«${q}» [${nombre}]: ${infos}`);
                    // Deduplicar contra lo ya acumulado.
                    const nuevas = this._incorporarObras(vistos, acumuladas, obras);
                    if (typeof PrismaDiagrama !== 'undefined') {
                        PrismaDiagrama.registrar('duplicados', { n: obras.length - nuevas, consulta: ['intensiva', consultaOrig, q, cod, JSON.stringify(f)].join('\u241f') });
                    }
                } catch (e) {
                    conError++;
                    infosTodas.push(`«${q}» [${nombre}]: falló (${e.message})`);
                }
                }
            }

            // Volcar resultados combinados a la matriz principal.
            this._obras = acumuladas;
            this._pagina = 0;
            this._resetRelevancia();
            const _dur = this._formatoTiempo(performance.now() - _t0);
            const resumen = `${acumuladas.length} resultados únicos de ${consultas.length} búsquedas en ${_dur}`
                + (conError ? ` (${conError} con error)` : '');
            if (estado) estado.textContent = `✓ ${resumen}. Revisa la matriz abajo.`;
            if (estadoBuscador) estadoBuscador.textContent = `${resumen}. Marca los pertinentes:`;
            this._renderResultados(this._obras);
            if (typeof ProtocoloBusqueda !== 'undefined') ProtocoloBusqueda.mostrarFicha('antProtocolo');
            this._enriquecerAutomatico(this._obras);
        } catch (e) {
            if (estado) estado.textContent = `❌ No se pudo completar la búsqueda intensiva (${e.message}).`;
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
        }
    },



    // ---- Búsqueda intensiva · Generar criterios de inclusión/exclusión con IA ----
    async _onGenerarCriterios() {
        const problema = (document.getElementById('antQuery') || {}).value || '';
        const cajaCriterios = document.getElementById('antCriterios');
        const estado = document.getElementById('antCriteriosEstado');
        const btn = document.getElementById('antGenerarCriterios');

        // Validación amable antes de llamar a la IA.
        if (problema.trim().length < 15) {
            if (estado) estado.textContent = '⚠️ Primero describe el problema de investigación (al menos una frase completa).';
            const p = document.getElementById('antQuery');
            if (p) p.focus();
            return;
        }

        // Si ya hay criterios escritos, confirmar que se van a reemplazar.
        if (cajaCriterios && cajaCriterios.value.trim().length > 20) {
            if (!confirm('Ya tienes criterios escritos. ¿Reemplazarlos por una nueva propuesta de la IA?')) return;
        }

        // Estado de carga (deshabilitar botón para evitar dobles clics).
        const textoBtn = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando…'; }
        if (estado) estado.textContent = 'La IA está redactando los criterios a partir de tu problema de investigación…';

        try {
            if (typeof IAAsistente === 'undefined') throw new Error('El asistente de IA no está cargado.');
            const criterios = await IAAsistente.generarCriterios(problema);
            if (cajaCriterios) cajaCriterios.value = criterios;
            if (estado) estado.textContent = '✓ Criterios generados. Revísalos y edítalos según tu criterio antes de filtrar.';
        } catch (e) {
            if (estado) estado.textContent = '❌ ' + (e.message || 'No se pudieron generar los criterios. Inténtalo de nuevo.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
        }
    },



    async _onBuscar(opciones = {}) {
        const _t0 = performance.now(); // cronómetro de la búsqueda
        const estado = document.getElementById('antEstado');
        const qOriginal = document.getElementById('antQuery').value.trim();
        if (!qOriginal) { estado.textContent = 'Escribe términos de búsqueda.'; return; }
        const f = { desde: document.getElementById('antDesde').value };
        const marcada = id => { const el = document.getElementById(id); return !!(el && el.checked); };
        const usarScopus = marcada('antUsarScopus') && typeof ScopusDirecto !== 'undefined';
        const usarSciencedirect = marcada('antUsarSciencedirect') && typeof ScienceDirectDirecto !== 'undefined';
        const usarWos = marcada('antUsarWos') && typeof WebOfScienceDirecto !== 'undefined';
        const usarScholar = marcada('antUsarScholar') && typeof ScholarDirecto !== 'undefined';
        const usarAbiertas = marcada('antUsarAbiertas');
        const usarPubmed = marcada('antUsarPubmed') && typeof PubMedDirecto !== 'undefined';
        const usarScielo = marcada('antUsarScielo') && typeof ScieloDirecto !== 'undefined';
        const usarAlicia = marcada('antUsarAlicia') && typeof AliciaDirecto !== 'undefined';
        // (2026.12.26) La OMS y la ONU también son fuentes: con solo ellas marcadas, la búsqueda se negaba («Marca al
        // menos una fuente»). Cuentan si su casilla está marcada y su cantidad es mayor que 0 (como en _buscarUnaConsulta).
        const usarOMS = marcada('antUsarOMS') && this._nInput('antNumOMS', 15) > 0;
        const usarONU = marcada('antUsarONU') && this._nInput('antNumONU', 10) > 0;

        if (!usarScopus && !usarSciencedirect && !usarWos && !usarScholar && !usarAbiertas && !usarPubmed && !usarScielo && !usarAlicia && !usarOMS && !usarONU) {
            estado.textContent = 'Marca al menos una fuente de búsqueda.';
            return;
        }

        const fuentes = [];
        if (usarScopus) fuentes.push('Scopus');
        if (usarSciencedirect) fuentes.push('ScienceDirect');
        if (usarWos) fuentes.push('Web of Science');
        if (usarPubmed) fuentes.push('PubMed');
        if (usarScielo) fuentes.push('SciELO');
        if (usarAlicia) fuentes.push('ALICIA');
        if (usarScholar) fuentes.push('Google Académico');
        if (usarOMS) fuentes.push('OMS');
        if (usarONU) fuentes.push('ONU');
        if (usarAbiertas) fuentes.push('fuentes complementarias');

        // MULTI-IDIOMA: una pasada por idioma marcado. «Español» usa el texto
        // tal cual; el resto se traduce (con caché) y cada ecuación entra a la
        // ficha del protocolo con su nota de idioma.
        const idiomas = this._idiomasSeleccionados();
        const etiquetaIdiomas = idiomas.map(([, n]) => n).join(' + ');
        const vistos = new Map();   // DOI o título → la obra que se queda (la repetida le suma sus bases)
        const acumuladas = [];
        const infosTodas = [];
        let brutosTotal = 0;
        try {
            for (let ix = 0; ix < idiomas.length; ix++) {
                const [cod, nombre] = idiomas[ix];
                estado.textContent = `Consultando en ${nombre} (${ix + 1}/${idiomas.length}) — ${fuentes.join(' + ')}…`;
                let qEjec = qOriginal;
                if (cod !== 'es') {
                    const tr = await this._traducirA(qOriginal, cod);
                    if (tr && tr.toLowerCase() !== qOriginal.toLowerCase()) qEjec = tr;
                }
                this._protocoloNota = cod === 'es' ? '' : `traducción al ${nombre}`;
                const { obras, infos } = await this._buscarUnaConsulta(qEjec, { ...f, idioma: cod }, opciones);
                this._protocoloNota = '';
                infosTodas.push(idiomas.length > 1 ? `[${nombre}] ${infos}` : String(infos));
                brutosTotal += obras.length;
                this._incorporarObras(vistos, acumuladas, obras);
            }
            this._obras = acumuladas;
            if (typeof PrismaDiagrama !== 'undefined') {
                // (2026.12.30) por búsqueda: repetirla reemplaza sus duplicados en lugar de sumarlos otra vez
                PrismaDiagrama.registrar('duplicados', { n: brutosTotal - this._obras.length, consulta: ['individual', qOriginal, fuentes.join(','), idiomas.map(([cod]) => cod).join(','), JSON.stringify(f)].join('\u241f') });
            }
            this._pagina = 0;
            this._resetRelevancia();
            const _dur = this._formatoTiempo(performance.now() - _t0);
            const _detalle = infosTodas.join(' · ');
            estado.textContent = this._obras.length
                ? `${this._obras.length} resultados combinados en ${_dur}${idiomas.length > 1 ? ` (${etiquetaIdiomas})` : ''} — ${_detalle}. Marca los pertinentes:`
                : `Sin resultados (${_dur}). ${_detalle}`;
            this._renderResultados(this._obras);
            if (typeof ProtocoloBusqueda !== 'undefined') ProtocoloBusqueda.mostrarFicha('antProtocolo');
            this._enriquecerAutomatico(this._obras);
        } catch (e) {
            estado.textContent = `No se pudo completar la búsqueda (${e.message}).`;
        }
    },



    // ------------------------------------------------------------------
    // PROTOCOLO DE BÚSQUEDA (ficha técnica de la revisión · Mejora 1).
    // Envuelve cada tarea de fuente: registra la ecuación literal despachada
    // y, al resolver, anota el nº de resultados. Si la fuente FALLÓ, el
    // conteo queda vacío («—») y el total se marca como mínimo: un fallo
    // no es un cero. Inofensivo si protocolo-busqueda.js no está cargado.
    _protocoloNota: '',


    _protocolo(fuente, q, f, promesa) {
        if (typeof ProtocoloBusqueda === 'undefined') return promesa;
        const filtros = [
            f && f.desde ? `Desde ${f.desde}` : '',
            f && f.idioma && f.idioma !== 'es' ? 'Idioma: ' + String(f.idioma).toUpperCase() : ''
        ].filter(Boolean).join(' · ');
        ProtocoloBusqueda.registrar({ fuente, ecuacion: q, filtros, nota: this._protocoloNota });
        return promesa.then(r => {
            const fallo = r && typeof r.info === 'string' && /falló|fallaron/.test(r.info);
            if (r && Array.isArray(r.obras) && !fallo) {
                ProtocoloBusqueda.actualizarResultados(fuente, q, r.obras.length, filtros);
                if (typeof PrismaDiagrama !== 'undefined') {
                    // (2026.12.30) Con la clave de la consulta: repetir la misma búsqueda ya no suma otra vez sus registros
                    // (la ficha del protocolo contaba 10 y el diagrama, 20)
                    PrismaDiagrama.registrar('identificados', { fuente, n: r.obras.length, consulta: ProtocoloBusqueda.claveConsulta(fuente, q, filtros) });
                }
            }
            return r;
        });
    },



    // ---- Ejecuta UNA consulta sobre todas las fuentes marcadas y devuelve
    // {obras, infos} SIN tocar el DOM ni this._obras. Reutilizable por la
    // búsqueda normal y por cada variante de la búsqueda intensiva.
    // 'opciones.fuentes' permite forzar qué fuentes usar; si no, lee las casillas.
    async _buscarUnaConsulta(q, f, opciones = {}) {
        const leer = (id, check) => {
            const el = document.getElementById(id);
            return el && el.checked;
        };
        const usarScopus = (opciones.usarScopus ?? leer('antUsarScopus')) && typeof ScopusDirecto !== 'undefined';
        const usarSciencedirect = (opciones.usarSciencedirect ?? leer('antUsarSciencedirect')) && typeof ScienceDirectDirecto !== 'undefined';
        const usarWos = (opciones.usarWos ?? leer('antUsarWos')) && typeof WebOfScienceDirecto !== 'undefined';
        const usarScholar = (opciones.usarScholar ?? leer('antUsarScholar')) && typeof ScholarDirecto !== 'undefined';
        const usarAbiertas = (opciones.usarAbiertas ?? leer('antUsarAbiertas'));
        const usarPubmed = (opciones.usarPubmed ?? leer('antUsarPubmed')) && typeof PubMedDirecto !== 'undefined';
        const usarScielo = (opciones.usarScielo ?? leer('antUsarScielo')) && typeof ScieloDirecto !== 'undefined';
        const usarAlicia = (opciones.usarAlicia ?? leer('antUsarAlicia')) && typeof AliciaDirecto !== 'undefined';
        const usarOMS = (opciones.usarOMS ?? leer('antUsarOMS'));
        const usarONU = (opciones.usarONU ?? leer('antUsarONU'));

        // Abrazadera COMPARTIDA por todas las fuentes: las flechas respetan
        // min/max solas, pero el teclado no — cualquier cifra escrita a mano
        // se encierra en su rango seguro. (Debe vivir AQUÍ, fuera de los if:
        // dentro del bloque de Scopus, PubMed no la veía → 'lim is not defined'.)
        const lim = (v, a, b) => Math.min(b, Math.max(a, isNaN(v) ? a : v));
        const tareas = [];
        if (usarScopus) {
            const maxScopus = lim(parseInt((document.getElementById('antCantidadScopus') || {}).value || '500', 10), 25, 5000);
            tareas.push(this._protocolo('Scopus', q, f,
                ScopusDirecto.buscar(q, { ...f, maxResultados: maxScopus }).then(r => {
                    const vista = r.view === 'COMPLETE' ? ', con resúmenes ✓' : '';
                    return { obras: r.obras, info: `Scopus (clave ${r.key}, ${r.obras.length} result.${vista})` };
                }).catch(e => ({ obras: [], info: `Scopus falló (${e.message})` }))));
        }
        if (usarSciencedirect) {
            // (2026.12.27) ScienceDirect: el texto completo de las revistas y los libros de Elsevier, con las claves del sitio.
            // Si esta sesión ya dejó todas las claves en pausa (cuota o rechazo), no se consulta ni entra en el protocolo.
            if (!ScienceDirectDirecto.disponible()) {
                tareas.push(Promise.resolve({ obras: [], info: `ScienceDirect no se consultó (${ScienceDirectDirecto.motivoNoDisponible()})` }));
            } else {
                const maxSd = lim(parseInt((document.getElementById('antCantidadSciencedirect') || {}).value || '50', 10), 10, 6000);
                // En el protocolo, la consulta literal que se envía (la que se pega tal cual en sciencedirect.com).
                tareas.push(this._protocolo('ScienceDirect', ScienceDirectDirecto.ecuacion(q) || q, f,
                    ScienceDirectDirecto.buscar(q, { ...f, maxResultados: maxSd }).then(r => ({
                        obras: r.obras,
                        info: `ScienceDirect (${r.obras.length} result.`
                            + (r.total > r.obras.length ? ` de ${r.total}` : '')
                            + (r.omitidos ? `, ${r.omitidos} término(s) fuera de la consulta: no caben en sus 250 caracteres` : '')
                            + (r.parcial ? `, parcial: ${r.parcial}` : '')
                            + (r.descartados ? `, ${r.descartados} registro(s) ilegible(s) descartado(s)` : '')
                            + (r.via === 'proxy' ? ', vía proxy' : '') + ')'
                    })).catch(e => ({ obras: [], info: `ScienceDirect falló (${e.message})` }))));
            }
        }
        if (usarWos) {
            // (2026.12.26) Web of Science: sin clave (ni relevo) o con la cuota del día ya agotada no se consulta, y no
            // entra en el protocolo (allí solo van las búsquedas que se lanzaron).
            if (!WebOfScienceDirecto.configurada()) {
                tareas.push(Promise.resolve({ obras: [], info: 'Web of Science no se consultó (falta la clave: «🔑 Conexión con Web of Science»)' }));
            } else if (WebOfScienceDirecto.cuotaAgotada()) {
                tareas.push(Promise.resolve({ obras: [], info: `Web of Science no se consultó (${WebOfScienceDirecto.mensajeCuota()})` }));
            } else {
                const maxWos = lim(parseInt((document.getElementById('antCantidadWos') || {}).value || '50', 10), 10, 1000);
                // En el protocolo, la ecuación literal que se envía (la que se pega tal cual en la búsqueda avanzada de
                // Web of Science): replicar la búsqueda exige la cadena exacta de cada base.
                const repintar = () => { if (this._pintarEstadoWos) this._pintarEstadoWos(); };   // el panel dice si la cuota se agotó
                tareas.push(this._protocolo('Web of Science', WebOfScienceDirecto.ecuacion(q, f) || q, f,
                    WebOfScienceDirecto.buscar(q, { ...f, maxResultados: maxWos }).then(r => (repintar(), {
                        obras: r.obras,
                        info: `Web of Science (${r.obras.length} result.`
                            + (r.parcial ? `, parcial: ${r.parcial}` : '')
                            + (r.descartados ? `, ${r.descartados} registro(s) ilegible(s) descartado(s)` : '')
                            + (r.obras.length && !r.conCitas ? ', sin recuento de citas: ¿plan de prueba?' : '')
                            + (r.via === 'relevo' ? ', vía relevo' : '') + ')'
                    })).catch(e => (repintar(), { obras: [], info: `Web of Science falló (${e.message})` }))));
            }
        }
        if (usarPubmed) {
            const maxPubmed = lim(parseInt((document.getElementById('antCantidadPubmed') || {}).value || '100', 10), 10, 1000);
            tareas.push(this._protocolo('PubMed', q, f,
                PubMedDirecto.buscar(q, { ...f, maxResultados: maxPubmed }).then(r => ({
                    obras: r.obras,
                    info: `PubMed (${r.obras.length} result., con resúmenes ✓)`
                })).catch(e => ({ obras: [], info: `PubMed falló (${e.message})` }))));
        }
        if (usarScielo) {
            const maxScielo = lim(parseInt((document.getElementById('antCantidadScielo') || {}).value || '100', 10), 10, 500);
            tareas.push(this._protocolo('SciELO', q, f,
                ScieloDirecto.buscar(q, { ...f, maxResultados: maxScielo }).then(r => ({
                    obras: r.obras,
                    info: `SciELO (${r.obras.length} result.)`
                })).catch(e => ({ obras: [], info: `SciELO falló (${e.message})` }))));
        }
        if (usarAlicia) {
            const maxAlicia = lim(parseInt((document.getElementById('antCantidadAlicia') || {}).value || '100', 10), 10, 500);
            tareas.push(this._protocolo('ALICIA', q, f,
                AliciaDirecto.buscar(q, { ...f, maxResultados: maxAlicia }).then(r => ({
                    obras: r.obras,
                    info: `ALICIA (${r.obras.length} result., con resúmenes ✓)`
                })).catch(e => ({ obras: [], info: `ALICIA falló (${e.message})` }))));
        }
        if (usarScholar) {
            // Scholar pagina de 10 en 10: el campo pide RESULTADOS y aquí se
            // traduce a páginas (20 resultados = 2 páginas).
            const resScholar = lim(parseInt((document.getElementById('antCantidad') || {}).value || '20', 10), 10, 50);
            const maxPag = Math.max(1, Math.round(resScholar / 10));
            tareas.push(this._protocolo('Google Académico', q, f,
                ScholarDirecto.buscarPaginado(q, f.desde, maxPag).then(r => ({
                    obras: r.obras.map(o => ({ ...o, link: o.link || '', autores: o.autoresRaw ? o.autoresRaw.split(/,\s*/) : [] })),
                    info: `Scholar (${r.paginas} pág.${r.captchaEn ? `, bloqueó en ${r.captchaEn}` : ''})`
                })).catch(e => ({ obras: [], info: `Scholar falló (${e.message})` }))));
        }
        if (usarOMS && this._nInput('antNumOMS', 15) > 0) {
            tareas.push(this._protocolo('OMS · IRIS', q, f,
                this._fetchJSONConRescate(this.urlIRIS(q, f)).then(d => {
                    const obras = this._extraerIRIS(d).map(x => this.normIRIS(x))
                        .filter(o => !f.desde || o.anio === 's. f.' || parseInt(o.anio, 10) >= f.desde);
                    return { obras, info: `OMS · IRIS (${obras.length} result.)` };
                }).catch(e => ({ obras: [], info: `OMS · IRIS falló (${e.message})` }))));
        }
        if (usarONU && this._nInput('antNumONU', 10) > 0) {
            const filtroAnio = o => !f.desde || o.anio === 's. f.' || parseInt(o.anio, 10) >= f.desde;
            tareas.push(this._protocolo('ONU', q, f, (async () => {
                // 1º: ReliefWeb — directo desde el navegador (CORS por diseño).
                for (const appname of ['statsim-pro', 'vocabulary']) {
                    try {
                        const d = await this._fetchJSONConRescate(this.urlReliefWeb(q, f, appname), { timeout: 15000 });
                        const obras = ((d && d.data) || []).map(x => this.normReliefWeb(x))
                            .filter(filtroAnio);
                        if (obras.length) return { obras, info: `ONU · ReliefWeb (${obras.length} result.)` };
                        if (d && d.data) break; // respondió bien pero sin resultados: no reintentar appname
                    } catch (e) { /* probar el siguiente appname */ }
                }
                // 2º: Biblioteca Digital (recjson) — puede estar tras muro anti-bot.
                try {
                    const d = await this._fetchJSONConRescate(this.urlUNDL(q, f), { timeout: 15000 });
                    const obras = this._extraerUNDL(d).map(x => this.normUNDL(x)).filter(filtroAnio);
                    if (obras.length) return { obras, info: `ONU · Biblioteca Digital (${obras.length} result.)` };
                } catch (e) { /* siguiente formato */ }
                // 3º: Biblioteca Digital (MARCXML).
                try {
                    const xml = await this._fetchTextoConRescate(this.urlUNDLxm(q, f),
                        t => typeof t === 'string' && t.includes('<record'), { timeout: 20000 });
                    const obras = this._parseMARCXML(xml).filter(filtroAnio);
                    return { obras, info: `ONU · Biblioteca Digital (${obras.length} result.${obras.length ? ', vía MARCXML' : ''})` };
                } catch (e2) {
                    return { obras: [], info: `ONU falló en las 3 vías (${e2.message})` };
                }
            })()));
        }
        if (usarAbiertas) tareas.push(this._protocolo('Fuentes complementarias', q, f,
            this.buscarMulti(q, f).then(r => ({ obras: r.obras, info: `${r.fuentesOK} fuentes complementarias — ${r.detalle || ''}` }))
                .catch(e => ({ obras: [], info: `fuentes complementarias fallaron` }))));

        const res = await Promise.all(tareas);
        const combinadas = [];
        res.forEach(r => combinadas.push(...r.obras));
        const infos = res.map(r => r.info).join(' · ');
        return { obras: combinadas, infos };
    },
};
