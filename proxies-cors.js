// ========================================
// ARSENAL DE PROXIES CORS — módulo dedicado (separa los proxies de la lógica).
// Provee una lista extensa de proxies CORS públicos Y un sistema de SALUD que
// reordena dinámicamente: los que responden suben al frente, los que fallan
// bajan. Así una búsqueda usa primero lo que está vivo y rápido, en vez de
// recorrer una lista estática gigante de endpoints muertos.
//
// Cada proxy se describe con:
//   build(url)  → URL del proxy que envuelve la URL objetivo
//   mode        → 'raw' (devuelve el cuerpo tal cual) | 'json' (cuerpo en JSON)
//   jsonField   → si mode==='json', campo del que extraer el HTML
//   needsEncode → si la URL objetivo debe ir percent-encoded
// ========================================

const ProxiesCORS = {

    // ---- Arsenal (orden inicial; la salud lo reordena en caliente) ----
    LISTA: [
        // Familia AllOrigins — la más fiable en la práctica (raw y get/json).
        { id: 'allorigins-raw',    build: u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,         mode: 'raw' },
        { id: 'allorigins-get',    build: u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,          mode: 'json', jsonField: 'contents' },
        { id: 'allorigins-hexlet', build: u => `https://allorigins.hexlet.app/raw?url=${encodeURIComponent(u)}`,       mode: 'raw' },
        { id: 'allorigins-hx-get', build: u => `https://allorigins.hexlet.app/get?url=${encodeURIComponent(u)}`,       mode: 'json', jsonField: 'contents' },
        // codetabs — vivo, pero EXIGE la URL objetivo percent-encoded (antes daba 400).
        { id: 'codetabs',          build: u => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,    mode: 'raw' },
        // Workers/Deno comunitarios que sí emiten cabeceras CORS.
        { id: 'whateverorigin',    build: u => `https://whateverorigin.org/get?url=${encodeURIComponent(u)}`,          mode: 'json', jsonField: 'contents' },
        { id: 'allorigins-cf',     build: u => `https://api.allorigins.win/get?charset=UTF-8&url=${encodeURIComponent(u)}`, mode: 'json', jsonField: 'contents' },
        // Candidato fresco (encode correcto verificado). Los builders sin
        // encodeURIComponent se retiraron: truncaban los parámetros de la
        // query en silencio — «válido pero incompleto», el peor fallo posible,
        // porque la salud no puede detectarlo.
        { id: 'corsproxy-io',      build: u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,                  mode: 'raw' }
    ],

    // ---- Salud persistente en localStorage: sobrevive recargas y pestañas;
    // si el almacenamiento falla o está bloqueado, se degrada a memoria. ----
    _mem: {},
    _CLAVE: 'statsim_proxy_health',

    _cargarSalud() {
        try {
            const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(this._CLAVE);
            const g = raw ? JSON.parse(raw) : null;
            this._mem = (g && typeof g === 'object' && !Array.isArray(g)) ? g : {};
        } catch (e) { this._mem = {}; }
        // SANITIZACIÓN: el almacén pudo corromperse y NADA de aquí puede
        // romper una búsqueda: números coercionados, negativos a cero, relojes
        // del futuro descartados, basura eliminada.
        // DECAIMIENTO PROPORCIONAL: tras 24 h sin actividad el historial
        // ENCOGE (×0.3) conservando la tasa — envejecer no es olvidar quién
        // era bueno y quién era malo.
        const AHORA = Date.now();
        for (const k of Object.keys(this._mem)) {
            const h = this._mem[k];
            if (!h || typeof h !== 'object' || Array.isArray(h)) { delete this._mem[k]; continue; }
            ['ok', 'fail', 'msProm', 'rachaFail', 'ultimoFail', 'ts'].forEach(c => {
                h[c] = Number.isFinite(+h[c]) && +h[c] >= 0 ? +h[c] : 0;
            });
            if (h.ts > AHORA + 60000) h.ts = 0;
            if (h.ultimoFail > AHORA + 60000) h.ultimoFail = 0;
            if (AHORA - h.ts > 86400000) {
                h.ok = Math.round(h.ok * 0.3);
                h.fail = Math.round(h.fail * 0.3);
                h.rachaFail = 0; h.ultimoFail = 0;
            }
        }
        return this._mem;
    },
    _guardarTid: null,
    _guardarSalud() {
        // Hasta ~16 escrituras síncronas por búsqueda fallida → una sola,
        // 250 ms después de la última novedad.
        clearTimeout(this._guardarTid);
        this._guardarTid = setTimeout(() => {
            try { if (typeof localStorage !== 'undefined') localStorage.setItem(this._CLAVE, JSON.stringify(this._mem)); }
            catch (e) { /* memoria solamente */ }
        }, 250);
    },

    // Puntaje: tasa de éxito reciente + bonus de velocidad − castigo por racha.
    // Proxies probados y buenos se acercan a 1; los malos, a 0.
    _score(id) {
        const h = this._mem[id];
        if (!h || (h.ok + h.fail) === 0) return 0.55; // prior: sin historial, ligeramente sobre la media
        // SUAVIZADO (Laplace + peso por confianza): una sonda afortunada no
        // destrona al caballo de batalla ni un tropiezo entierra al veterano.
        // Números: 1 éxito/0 fallos ⇒ ~0.59 · 500/25 ⇒ ~0.93 · 0/1 ⇒ ~0.39.
        const n = h.ok + h.fail;
        const tasa = (h.ok + 1) / (n + 2);
        const conf = n / (n + 4);
        const vel = h.msProm ? Math.max(0, 1 - h.msProm / 15000) : 0;
        const castigo = Math.min(0.4, (h.rachaFail || 0) * 0.1);
        return conf * (tasa * 0.7 + vel * 0.3) + (1 - conf) * 0.55 - castigo;
    },

    // Cuarentena TEMPORAL: un proxy con racha de fallos se aparta, pero se le
    // da otra oportunidad pasado un tiempo (revive solo). Mejor que excluir
    // para siempre, porque muchos proxies caen y vuelven.
    _enCuarentena(id) {
        const h = this._mem[id];
        if (!h || (h.rachaFail || 0) < 4) return false;
        const espera = Math.min(30, Math.pow(2, h.rachaFail - 4)) * 60000; // 1→…→30 min
        return (Date.now() - (h.ultimoFail || 0)) < espera;
    },

    registrar(id, exito, ms, duro) {
        const h = this._mem[id] || (this._mem[id] = { ok: 0, fail: 0, msProm: 0, rachaFail: 0 });
        h.ts = Date.now(); // marca de actividad: el decaimiento de 24 h cuenta desde aquí
        if (exito) {
            h.ok++; h.rachaFail = 0;
            // La latencia solo se aprende cuando viene — la sonda de 1 KB
            // no contamina el promedio de las búsquedas reales.
            if (Number.isFinite(ms) && ms > 0) h.msProm = h.msProm ? Math.round(h.msProm * 0.7 + ms * 0.3) : ms;
        } else { h.fail++; h.rachaFail = (h.rachaFail || 0) + 1 + (duro ? 2 : 0); h.ultimoFail = Date.now(); }
        this._guardarSalud();
    },

    // AMNISTÍA: borra rachas y cuarentenas (la estadística histórica queda).
    // Se invoca sola tras una derrota total; también sirve desde consola.
    amnistia() {
        Object.values(this._mem).forEach(h => { if (h) { h.rachaFail = 0; h.ultimoFail = 0; } });
        this._guardarSalud();
    },

    // Lista ordenada por salud (mejor primero), excluyendo opcionalmente los
    // que llevan demasiados fallos seguidos.
    ordenados() {
        if (!Object.keys(this._mem).length) this._cargarSalud();
        const orden = lista => lista
            .map(p => ({ p, s: this._score(p.id) }))
            .sort((a, b) => b.s - a.s)
            .map(x => x.p);
        const activos = this.LISTA.filter(p => !this._enCuarentena(p.id));
        // REFUERZO: si la cuarentena dejó menos de 4 corredores, se rellena
        // con los acuartelados mejor puntuados. Apartar proxies está bien;
        // salir a la carrera a perder en 2 segundos, no.
        if (activos.length < 4) {
            activos.push(...orden(this.LISTA.filter(p => this._enCuarentena(p.id))));
        }
        return orden(activos);
    },

    // DEADLINE INDIVIDUAL — cada corredor con su propio plazo (3× su
    // promedio, entre 4 s y el techo). Sin historia: el techo completo. El
    // máximo del lote castigaba a los rápidos por culpa del lento.
    _plazoProxy(id, base) {
        const ms = (this._mem[id] || {}).msProm;
        if (!Number.isFinite(ms) || !ms) return base;
        return Math.max(4000, Math.min(base, ms * 3));
    },

    // FAMILIA = backend real (host). allorigins-raw/get/cf son EL MISMO
    // servidor: correr 3 contra él no da diversidad, dispara su rate limit y
    // correlaciona los fallos. Máx. 2 corredores por familia por lote; los
    // diferidos encabezan la siguiente oleada.
    _familia(p) {
        try { return new URL(p.build('https://x.y/z')).host; } catch (e) { return p.id; }
    },
    _armarLote(cola, anchura) {
        const lote = [], porFam = {}, resto = [];
        while (cola.length && lote.length < anchura) {
            const p = cola.shift();
            const f = this._familia(p);
            if ((porFam[f] || 0) >= 2) { resto.push(p); continue; }
            porFam[f] = (porFam[f] || 0) + 1;
            lote.push(p);
        }
        cola.unshift(...resto);
        return lote;
    },

    // SONDA PEREZOSA: tras la primera victoria de la sesión, prueba EN FONDO
    // los proxies sin historial con una petición diminuta (~1 KB). La próxima
    // carrera sale informada, sin costarle un milisegundo al usuario.
    _sondeada: false,
    _SONDA_URL: 'https://api.crossref.org/works?rows=1', // objetivo diminuto (~1 KB) para probar proxies sin gastar nada
    _sondaTrasVictoria() {
        if (this._sondeada) return;
        this._sondeada = true;
        const nuevos = this.LISTA.filter(p => { const h = this._mem[p.id]; return !h || (h.ok + h.fail) === 0; });
        nuevos.forEach(p => {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 6000);
            fetch(p.build(this._SONDA_URL), { signal: ctrl.signal })
                .then(async r => {
                    const cuerpo = r.ok ? await this.extraer(p, r) : '';
                    clearTimeout(tid); // también aquí el cuerpo tiene deadline
                    // Sin ms a propósito — 1 KB de sonda no es una búsqueda real.
                    this.registrar(p.id, !!(r.ok && cuerpo && String(cuerpo).length > 2));
                })
                .catch(() => { clearTimeout(tid); this.registrar(p.id, false); });
        });
    },

    // Extrae el HTML de la respuesta según el modo del proxy.
    // Devuelve SIEMPRE el cuerpo (los consumidores lo usan como canal de
    // señales: leen el error de la fuente para rotar claves, etc.) y, cuando el
    // proxy lo delata (AllOrigins /get), el código HTTP real del destino.
    async _extraerConCodigo(proxy, resp) {
        if (proxy.mode === 'json') {
            const j = await resp.json();
            const codigoDestino = (j && j.status && +j.status.http_code) || 0;
            return { cuerpo: (proxy.jsonField ? j[proxy.jsonField] : j) || '', codigoDestino };
        }
        return { cuerpo: await resp.text(), codigoDestino: 0 };
    },
    async extraer(proxy, resp) {
        return (await this._extraerConCodigo(proxy, resp)).cuerpo;
    },

    // ========================================================================
    // CARRERA PARALELA: lanza los N mejores proxies a la vez contra el mismo
    // objetivo y resuelve con el PRIMERO que entregue contenido válido (validar
    // decide qué es "válido"). Cancela los demás. La latencia pasa de "suma de
    // los que fallan" a "el más rápido que funciona". Registra salud de todos.
    //
    //   objetivo : URL a pedir (ya con sus parámetros)
    //   validar  : (htmlString) => obrasArray | null   (null = respuesta inútil)
    //   op       : { anchura=4, timeout=15000, oleadas=2 }
    // Devuelve { obras, proxy } o lanza con diagnóstico.
    // ========================================================================
    // ---- CACHÉ + DEDUP DE VUELOS -------------------------------------
    // La misma URL pedida dos veces en 10 min (reintentos, variantes que
    // coinciden, doble clic) devuelve la respuesta al instante y comparte
    // un único vuelo si aún está en el aire. Los fallos NO se cachean.
    // Clave = URL objetivo (cada fuente valida sus propias URLs).
    // CONTRATO: las obras se comparten por referencia entre hits — no
    // reordenes ni vacíes el array recibido (anotar sus objetos sí vale).
    _m: { carreras: 0, requests: 0, victorias: 0, hitsCache: 0, dedupVuelos: 0, adelantos: 0 },
    metricas() {
        const m = { ...this._m };
        m.reqPorBusqueda = m.victorias ? +(m.requests / m.victorias).toFixed(2) : null;
        return m;
    },

    _cache: new Map(),
    _CACHE_TTL: 600000, // 10 minutos: repeticiones dentro de la misma sesión de trabajo
    _CACHE_MAX: 30,     // tope de respuestas vivas; la más olvidada sale primero
    async carrera(objetivo, validar, op = {}) {
        if (op.sinCache) return this._carreraViva(objetivo, validar, op);
        const hit = this._cache.get(objetivo);
        if (hit && (Date.now() - hit.t) < this._CACHE_TTL) {
            this._cache.delete(objetivo); this._cache.set(objetivo, hit); // LRU real: el uso refresca la posición
            if (hit.listo) this._m.hitsCache++; else this._m.dedupVuelos++;
            return hit.prom;
        }
        const prom = this._carreraViva(objetivo, validar, op);
        const entrada = { t: Date.now(), prom, listo: false }; // 'listo' separa hit real (resuelto) de dedup (aún en vuelo)
        this._cache.set(objetivo, entrada);
        prom.then(() => { entrada.listo = true; }, () => {});
        if (this._cache.size > this._CACHE_MAX) this._cache.delete(this._cache.keys().next().value);
        prom.catch(() => { const v = this._cache.get(objetivo); if (v && v.prom === prom) this._cache.delete(objetivo); }); // borra solo SU entrada (si otra más nueva ocupó la URL, no se toca)
        return prom;
    },

    // Interruptor de emergencia: ProxiesCORS.HEDGING = false en consola vuelve
    // al comportamiento de oleadas (todos los del lote a la vez).
    HEDGING: true,

    // Retraso del hedge: el siguiente corredor sale cuando el anterior ya
    // debería haber respondido (su promedio ×1.1, entre 700 ms y 2.5 s).
    _retrasoHedge(idPrevio) {
        const ms = (this._mem[idPrevio] || {}).msProm;
        return Math.min(2500, Math.max(700, ms ? Math.round(ms * 1.1) : 1200));
    },

    async _carreraViva(objetivo, validar, op = {}) {
        if (typeof Promise.any !== 'function') return this._carreraSecuencial(objetivo, validar, op);
        // Sin red no hay culpables — la salud de los proxies no se toca.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            const e = new Error('sin conexión a internet'); e.carrera = true; throw e;
        }
        // Defensa en profundidad: solo se proxifican destinos https.
        if (!/^https:\/\//i.test(String(objetivo))) {
            const e = new Error('objetivo rechazado: solo URLs https'); e.carrera = true; throw e;
        }
        const anchura = op.anchura || 4;
        const timeout = op.timeout || 15000;
        const oleadas = op.oleadas || 2;
        if (!op._gracia) this._m.carreras++;
        const diag = [];
        let regimenLento = false; // una cadena muerta por timeouts ⇒ techo completo en la gracia
        let errDestino = null;    // la fuente respondió con error ⇒ los proxies no pagan

        // CADENA HEDGED: el arsenal ordenado por salud y diversidad de
        // familia sale ESCALONADO — el mejor primero; cada siguiente, solo si el
        // anterior aún no resolvió cuando ya debería. En hosts sanos la búsqueda
        // cuesta ~1 petición; los corredores no lanzados se cancelan GRATIS.
        // AVANCE RÁPIDO: si un corredor muere en 200 ms, el siguiente sale ya —
        // tráfico de francotirador, latencia de escopeta.
        const cola = this.ordenados();
        const orden = [];
        while (cola.length) orden.push(...this._armarLote(cola, anchura));
        orden.length = Math.min(orden.length, anchura * oleadas); // tope de la cadena: nunca más corredores que anchura × oleadas

        const ctrls = orden.map(() => new AbortController());
        const marcas = orden.map(() => ({ timeout: false, lanzado: false }));
        const arranques = new Array(orden.length).fill(null);
        const lanzadores = [];
        let pararPorDestino = null;
        const frenoDestino = new Promise((resolver, rechazar) => { pararPorDestino = rechazar; });
        frenoDestino.catch(() => {}); // sin unhandledrejection si nadie escucha aún

        const adelantar = () => {
            const i = marcas.findIndex(m => !m.lanzado);
            if (i !== -1 && arranques[i]) { this._m.adelantos++; arranques[i](); }
        };

        const corredores = orden.map((proxy, i) => new Promise((resolver, rechazar) => {
            const arrancar = () => {
                if (marcas[i].lanzado) return;
                marcas[i].lanzado = true;
                this._m.requests++;
                const t0 = Date.now();
                const plazo = regimenLento ? timeout : this._plazoProxy(proxy.id, timeout);
                const tid = setTimeout(() => { marcas[i].timeout = true; ctrls[i].abort(); }, plazo);
                fetch(proxy.build(objetivo), { signal: ctrls[i].signal })
                    .then(async r => {
                        if (!r.ok) throw Object.assign(new Error(`HTTP${r.status}`), { proxyId: proxy.id });
                        // Techo de tamaño cuando el proxy declara Content-Length.
                        const cl = +(r.headers && r.headers.get && r.headers.get('content-length'));
                        if (cl && cl > 3e6) throw Object.assign(new Error('respuesta >3 MB'), { proxyId: proxy.id });
                        const { cuerpo, codigoDestino } = await this._extraerConCodigo(proxy, r);
                        // El validador del consumidor SIEMPRE ve el cuerpo (ahí leen
                        // los módulos el error real de la fuente para rotar claves).
                        const obras = validar(cuerpo);
                        if (!obras || !obras.length) {
                            if (codigoDestino >= 400) throw Object.assign(new Error(`destino HTTP${codigoDestino}`), { proxyId: proxy.id, destino: true, destinoStatus: codigoDestino });
                            throw Object.assign(new Error('vacío'), { proxyId: proxy.id });
                        }
                        // El deadline vive hasta validar; recién aquí se desarma.
                        clearTimeout(tid);
                        this.registrar(proxy.id, true, Date.now() - t0); // éxito anotado en el settle del propio corredor
                        resolver({ obras, proxy, ms: Date.now() - t0 });
                    })
                    .catch(e => {
                        clearTimeout(tid);
                        const err = Object.assign(e instanceof Error ? e : new Error('err'), { proxyId: (e && e.proxyId) || proxy.id });
                        const esAbort = err.name === 'AbortError' || /abort/i.test(String(err.message));
                        err.esTimeout = esAbort && marcas[i].timeout;
                        err.esCancelacion = esAbort && !marcas[i].timeout;
                        if (err.destino) {
                            // La culpa es de la fuente. 4xx firme (≠429) ⇒ parar la
                            // cadena YA: más proxies no arreglan un 404. 5xx/429 ⇒ se
                            // sigue (otro camino puede esquivar un borde caído), pero
                            // el proxy no paga.
                            const cod = +(String(err.message).match(/HTTP(\d+)/) || [])[1] || 0;
                            if (cod >= 400 && cod < 500 && cod !== 429) pararPorDestino(err);
                        } else if (!err.esCancelacion) {
                            this.registrar(err.proxyId, false, 0, /HTTP429/.test(String(err.message)));
                            adelantar(); // AVANCE RÁPIDO: fallo definitivo ⇒ el siguiente sale ya
                        }
                        rechazar(err);
                    });
            };
            arranques[i] = arrancar;
            if (i === 0) arrancar();
        }));

        // Calendario de lanzamientos escalonados (el avance rápido puede
        // adelantarlos; el guardián de 'lanzado' evita dobles arranques).
        let retraso = 0;
        for (let i = 1; i < orden.length; i++) {
            retraso += this.HEDGING ? this._retrasoHedge(orden[i - 1].id) : ((i % anchura) === 0 ? 1500 : 0);
            lanzadores.push(setTimeout(arranques[i], retraso));
        }

        const limpiar = () => {
            lanzadores.forEach(l => clearTimeout(l));
            ctrls.forEach((c, i) => { if (marcas[i].lanzado) { try { c.abort(); } catch (e) {} } });
        };

        try {
            // Gana el primer corredor válido… o frena todo si la fuente confesó un 4xx.
            const ganador = await Promise.race([Promise.any(corredores), frenoDestino]);
            // CANCELACIÓN REAL: en vuelo se abortan; los no lanzados jamás salen.
            lanzadores.forEach(l => clearTimeout(l));
            ctrls.forEach((c, i) => { if (marcas[i].lanzado && orden[i].id !== ganador.proxy.id) { try { c.abort(); } catch (e) {} } });
            this._m.victorias++;
            this._sondaTrasVictoria();
            return { obras: ganador.obras, proxy: ganador.proxy.id, ms: ganador.ms };
        } catch (agg) {
            limpiar();
            const errs = (agg && agg.errors) ? agg.errors : [agg];
            let timeouts = 0;
            errs.forEach(e => {
                if (e && e.destino && !errDestino) errDestino = e;
                if (e && e.esTimeout) timeouts++;
                if (!(e && e.esCancelacion)) diag.push(e && e.proxyId ? `${e.proxyId}:${e.message}` : String((e && e.message) || 'err'));
            });
            if (timeouts >= Math.ceil(Math.max(1, errs.length) / 2)) regimenLento = true;
        }
        // Si la fuente contestó con error, ni amnistía ni gracia — el
        // problema no está en los intermediarios.
        if (errDestino) {
            const err = new Error(`${errDestino.message} — el problema está en la fuente consultada, no en los intermediarios`);
            err.carrera = true; err.destino = true; err.destinoStatus = errDestino.destinoStatus || 0;
            throw err;
        }
        if (!op._gracia) {
            this.amnistia();
            // Respiro con jitter — relanzar el arsenal en el mismo milisegundo
            // agrava justo lo que acaba de matarnos (rate limits).
            await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 2000)));
            try {
                return await this._carreraViva(objetivo, validar, { ...op, timeout: regimenLento ? timeout : Math.min(timeout, 10000), _gracia: true });
            } catch (e2) {
                String((e2 && e2.message) || '').split(' · ').forEach(d => { if (d && !diag.includes(d)) diag.push(d); });
            }
        }
        const err = new Error((op._gracia ? '' : 'arsenal completo probado y salud reiniciada — reintenta en unos minutos · ')
            + (diag.slice(0, 5).join(' · ') || 'ningún proxy respondió'));
        err.carrera = true;
        throw err;
    },

    // Respaldo secuencial para navegadores sin Promise.any (ES2021).
    async _carreraSecuencial(objetivo, validar, op = {}) {
        const timeout = op.timeout || 15000;
        const diag = [];
        for (const proxy of this.ordenados().slice(0, (op.anchura || 4) * (op.oleadas || 2))) {
            const t0 = Date.now();
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), timeout);
            try {
                const r = await fetch(proxy.build(objetivo), { signal: ctrl.signal });
                if (!r.ok) { clearTimeout(tid); throw new Error('HTTP' + r.status); }
                // El deadline sigue armado durante cuerpo y validación.
                const { cuerpo, codigoDestino } = await this._extraerConCodigo(proxy, r);
                const obras = validar(cuerpo);
                clearTimeout(tid);
                if ((!obras || !obras.length) && codigoDestino >= 400) throw Object.assign(new Error(`destino HTTP${codigoDestino}`), { destino: true, destinoStatus: codigoDestino });
                if (obras && obras.length) { this.registrar(proxy.id, true, Date.now() - t0); return { obras, proxy: proxy.id, ms: Date.now() - t0 }; }
                this.registrar(proxy.id, false); diag.push(`${proxy.id}:vacío`);
            } catch (e) {
                clearTimeout(tid);
                if (!(e && e.destino)) this.registrar(proxy.id, false, 0, /HTTP429/.test(String(e.message)));
                diag.push(`${proxy.id}:${e.message}`);
            }
        }
        if (!op._gracia) { this.amnistia(); return this._carreraSecuencial(objetivo, validar, { ...op, timeout: Math.min(timeout, 10000), _gracia: true }); }
        const err = new Error(diag.slice(0, 6).join(' · ') || 'ningún proxy respondió'); err.carrera = true; throw err;
    },

    estado() {
        return this.LISTA.map(p => ({ id: p.id, score: +this._score(p.id).toFixed(2), cuarentena: this._enCuarentena(p.id), ...(this._mem[p.id] || {}) }));
    },

    // Una línea humana para la consola: ProxiesCORS.describir()
    describir() {
        const e = this.estado();
        const sanos = e.filter(x => !x.cuarentena && x.score >= 0.5).length;
        const enC = e.filter(x => x.cuarentena).map(x => x.id);
        const mejor = [...e].sort((a, b) => b.score - a.score)[0];
        return `${sanos}/${e.length} proxies sanos · en cuarentena: ${enC.length ? enC.join(', ') : 'ninguno'}` +
            ` · mejor: ${mejor.id} (score ${mejor.score}${mejor.msProm ? `, ~${mejor.msProm} ms` : ''})` +
            ` · caché: ${this._cache.size} respuestas vivas`;
    }
};

if (typeof window !== 'undefined') {
    window.ProxiesCORS = ProxiesCORS;
    ProxiesCORS._cargarSalud();
}
