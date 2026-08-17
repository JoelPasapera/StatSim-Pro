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
        // Candidatos frescos: públicos y volubles. Riesgo cero por diseño:
        // la salud los promociona si viven o los entierra si no.
        { id: 'corsproxy-io',      build: u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,                  mode: 'raw' },
        { id: 'cors-workers',      build: u => `https://test.cors.workers.dev/?${u}`,                                 mode: 'raw' },
        { id: 'cors-eu',           build: u => `https://cors.eu.org/${u}`,                                            mode: 'raw' }
    ],

    // ---- Salud persistente (localStorage no está disponible en artifacts del
    // chat, pero sí en el sitio desplegado; se degrada a memoria si falla) ----
    _mem: {},
    _CLAVE: 'statsim_proxy_health',

    _cargarSalud() {
        try {
            const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(this._CLAVE);
            this._mem = raw ? JSON.parse(raw) : {};
        } catch (e) { this._mem = {}; }
        // DECAIMIENTO: la salud envejece. Entradas sin actividad en 24 h
        // pierden rachas y cuarentenas; la estadística base se acota.
        const AHORA = Date.now();
        Object.values(this._mem).forEach(h => {
            if (!h || typeof h !== 'object') return;
            if (AHORA - (h.ts || 0) > 86400000) {
                h.ok = Math.min(h.ok || 0, 3);
                h.fail = Math.min(h.fail || 0, 3);
                h.rachaFail = 0; h.ultimoFail = 0;
            }
        });
        return this._mem;
    },
    _guardarSalud() {
        try { if (typeof localStorage !== 'undefined') localStorage.setItem(this._CLAVE, JSON.stringify(this._mem)); }
        catch (e) { /* memoria solamente */ }
    },

    // Puntaje: tasa de éxito reciente + bonus de velocidad − castigo por racha.
    // Proxies probados y buenos se acercan a 1; los malos, a 0.
    _score(id) {
        const h = this._mem[id];
        if (!h || (h.ok + h.fail) === 0) return 0.55; // sin historial: ligeramente sobre la media → se exploran pronto
        const tasa = h.ok / (h.ok + h.fail);
        const vel = h.msProm ? Math.max(0, 1 - h.msProm / 15000) : 0;
        const castigo = Math.min(0.4, (h.rachaFail || 0) * 0.1);
        return tasa * 0.7 + vel * 0.3 - castigo;
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
        h.ts = Date.now();
        if (exito) {
            h.ok++; h.rachaFail = 0;
            h.msProm = h.msProm ? Math.round(h.msProm * 0.7 + ms * 0.3) : ms;
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

    _timeoutLote(lote, base) {
        const historia = lote.map(p => (this._mem[p.id] || {}).msProm).filter(Boolean);
        if (!historia.length) return base;
        return Math.max(6000, Math.min(base, Math.max(...historia) * 3));
    },

    // SONDA PEREZOSA: tras la primera victoria de la sesión, prueba EN FONDO
    // los proxies sin historial con una petición diminuta (~1 KB). La próxima
    // carrera sale informada, sin costarle un milisegundo al usuario.
    _sondeada: false,
    _SONDA_URL: 'https://api.crossref.org/works?rows=1',
    _sondaTrasVictoria() {
        if (this._sondeada) return;
        this._sondeada = true;
        const nuevos = this.LISTA.filter(p => { const h = this._mem[p.id]; return !h || (h.ok + h.fail) === 0; });
        nuevos.forEach(p => {
            const t0 = Date.now();
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 6000);
            fetch(p.build(this._SONDA_URL), { signal: ctrl.signal })
                .then(async r => {
                    clearTimeout(tid);
                    const cuerpo = r.ok ? await this.extraer(p, r) : '';
                    this.registrar(p.id, !!(r.ok && cuerpo && String(cuerpo).length > 2), Date.now() - t0);
                })
                .catch(() => { clearTimeout(tid); this.registrar(p.id, false); });
        });
    },

    // Extrae el HTML de la respuesta según el modo del proxy.
    async extraer(proxy, resp) {
        if (proxy.mode === 'json') {
            const j = await resp.json();
            return (proxy.jsonField ? j[proxy.jsonField] : j) || '';
        }
        return resp.text();
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
    _cache: new Map(),
    _CACHE_TTL: 600000,
    _CACHE_MAX: 30,
    async carrera(objetivo, validar, op = {}) {
        if (op.sinCache) return this._carreraViva(objetivo, validar, op);
        const hit = this._cache.get(objetivo);
        if (hit && (Date.now() - hit.t) < this._CACHE_TTL) return hit.prom;
        const prom = this._carreraViva(objetivo, validar, op);
        this._cache.set(objetivo, { t: Date.now(), prom });
        if (this._cache.size > this._CACHE_MAX) this._cache.delete(this._cache.keys().next().value);
        prom.catch(() => this._cache.delete(objetivo));
        return prom;
    },

    async _carreraViva(objetivo, validar, op = {}) {
        if (typeof Promise.any !== 'function') return this._carreraSecuencial(objetivo, validar, op);
        const anchura = op.anchura || 4;
        const timeout = op.timeout || 15000;
        const oleadas = op.oleadas || 2;
        const cola = this.ordenados();
        const diag = [];

        for (let ola = 0; ola < oleadas && cola.length; ola++) {
            const lote = cola.splice(0, anchura);
            if (!lote.length) break;
            // Timeout adaptativo: con historia en el lote no se esperan 15 s
            // a corredores que suelen responder en 2 (3× su promedio, piso 6 s).
            const timeoutLote = this._timeoutLote(lote, timeout);

            // Un AbortController POR corredor, guardado en un array accesible
            // desde fuera del .map() → así sí podemos cancelar a los perdedores.
            const ctrls = lote.map(() => new AbortController());
            const corredores = lote.map((proxy, i) => {
                const t0 = Date.now();
                const tid = setTimeout(() => ctrls[i].abort(), timeoutLote);
                // Cada corredor adjunta SU id de proxy al error (objeto, no string),
                // para registrar salud por id real y nunca por el mensaje de fetch.
                return fetch(proxy.build(objetivo), { signal: ctrls[i].signal })
                    .then(async r => {
                        clearTimeout(tid);
                        if (!r.ok) throw Object.assign(new Error(`HTTP${r.status}`), { proxyId: proxy.id });
                        const html = await this.extraer(proxy, r);
                        const obras = validar(html);
                        if (!obras || !obras.length) throw Object.assign(new Error('vacío'), { proxyId: proxy.id });
                        return { obras, proxy, ms: Date.now() - t0 };
                    })
                    .catch(e => { clearTimeout(tid); throw Object.assign(e instanceof Error ? e : new Error('err'), { proxyId: e && e.proxyId || proxy.id }); });
            });

            try {
                const ganador = await Promise.any(corredores);
                // CANCELACIÓN REAL de los rezagados (ahorra ancho de banda y, en
                // Scholar, evita peticiones extra que dispararían el anti-bot).
                ctrls.forEach((c, i) => { if (lote[i].id !== ganador.proxy.id) { try { c.abort(); } catch (e) {} } });
                this.registrar(ganador.proxy.id, true, ganador.ms);
                this._sondaTrasVictoria();
                return { obras: ganador.obras, proxy: ganador.proxy.id, ms: ganador.ms };
            } catch (agg) {
                // Todos fallaron: registrar salud por proxyId REAL (no por mensaje).
                const errs = (agg && agg.errors) ? agg.errors : [agg];
                errs.forEach(e => {
                    if (e && e.proxyId) { this.registrar(e.proxyId, false, 0, /HTTP429/.test(String(e.message))); diag.push(`${e.proxyId}:${e.message}`); }
                    else diag.push(String(e && e.message || 'err'));
                });
            }
        }
        // DERROTA TOTAL → AMNISTÍA + OLEADA DE GRACIA: la memoria puede decir
        // «todos malos» mientras la realidad dice otra cosa (cuarentenas
        // heredadas de otro momento). Se limpian rachas y se corre UNA pasada
        // más con el arsenal completo. Si también falla, el fallo es real.
        if (!op._gracia) {
            this.amnistia();
            try {
                return await this._carreraViva(objetivo, validar, { ...op, timeout: Math.min(timeout, 10000), _gracia: true });
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
                clearTimeout(tid);
                if (!r.ok) throw new Error('HTTP' + r.status);
                const obras = validar(await this.extraer(proxy, r));
                if (obras && obras.length) { this.registrar(proxy.id, true, Date.now() - t0); return { obras, proxy: proxy.id, ms: Date.now() - t0 }; }
                this.registrar(proxy.id, false); diag.push(`${proxy.id}:vacío`);
            } catch (e) { clearTimeout(tid); this.registrar(proxy.id, false, 0, /HTTP429/.test(String(e.message))); diag.push(`${proxy.id}:${e.message}`); }
        }
        if (!op._gracia) { this.amnistia(); return this._carreraSecuencial(objetivo, validar, { ...op, _gracia: true }); }
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
