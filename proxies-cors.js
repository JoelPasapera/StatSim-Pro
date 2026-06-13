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
        { id: 'allorigins-cf',     build: u => `https://api.allorigins.win/get?charset=UTF-8&url=${encodeURIComponent(u)}`, mode: 'json', jsonField: 'contents' }
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

    registrar(id, exito, ms) {
        const h = this._mem[id] || (this._mem[id] = { ok: 0, fail: 0, msProm: 0, rachaFail: 0 });
        if (exito) {
            h.ok++; h.rachaFail = 0;
            h.msProm = h.msProm ? Math.round(h.msProm * 0.7 + ms * 0.3) : ms;
        } else { h.fail++; h.rachaFail = (h.rachaFail || 0) + 1; h.ultimoFail = Date.now(); }
        this._guardarSalud();
    },

    // Lista ordenada por salud (mejor primero), excluyendo opcionalmente los
    // que llevan demasiados fallos seguidos.
    ordenados() {
        if (!Object.keys(this._mem).length) this._cargarSalud();
        const activos = this.LISTA.filter(p => !this._enCuarentena(p.id));
        const pool = activos.length ? activos : this.LISTA; // si todos en cuarentena, reintenta todos
        return pool
            .map(p => ({ p, s: this._score(p.id) }))
            .sort((a, b) => b.s - a.s)
            .map(x => x.p);
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
    async carrera(objetivo, validar, op = {}) {
        const anchura = op.anchura || 4;
        const timeout = op.timeout || 15000;
        const oleadas = op.oleadas || 2;
        const cola = this.ordenados();
        const diag = [];

        for (let ola = 0; ola < oleadas && cola.length; ola++) {
            const lote = cola.splice(0, anchura);
            if (!lote.length) break;

            // Cada corredor: resuelve {ok:true, obras, proxy, ms} o se RECHAZA
            // (para que Promise.any tome al primero que cumpla; si todos
            // rechazan, cae al catch y probamos la siguiente oleada).
            const corredores = lote.map(proxy => {
                const t0 = Date.now();
                const ctrl = new AbortController();
                const tid = setTimeout(() => ctrl.abort(), timeout);
                return fetch(proxy.build(objetivo), { signal: ctrl.signal })
                    .then(async r => {
                        clearTimeout(tid);
                        if (!r.ok) throw new Error(`${proxy.id}:HTTP${r.status}`);
                        const html = await this.extraer(proxy, r);
                        const obras = validar(html);
                        if (!obras || !obras.length) throw new Error(`${proxy.id}:vacío`);
                        return { obras, proxy, ms: Date.now() - t0, ctrl, lote };
                    })
                    .catch(e => { clearTimeout(tid); throw (e instanceof Error ? e : new Error(`${proxy.id}:err`)); });
            });

            try {
                const ganador = await Promise.any(corredores);
                // Premiar al ganador; penalizar a los que ya fallaron en este lote.
                this.registrar(ganador.proxy.id, true, ganador.ms);
                // Abortar a los rezagados (ya no se necesitan).
                lote.forEach(p => { if (p.id !== ganador.proxy.id) { /* sus AbortControllers viven en sus closures; el navegador los GC al resolver */ } });
                return { obras: ganador.obras, proxy: ganador.proxy.id, ms: ganador.ms };
            } catch (agg) {
                // Promise.any rechaza con AggregateError: todos los del lote fallaron.
                const errs = (agg && agg.errors) ? agg.errors : [agg];
                errs.forEach(e => {
                    const id = String(e && e.message || '').split(':')[0];
                    if (id) this.registrar(id, false);
                    diag.push(String(e && e.message || 'err'));
                });
                // siguiente oleada con los próximos proxies
            }
        }
        const err = new Error(diag.slice(0, 6).join(' · ') || 'ningún proxy respondió');
        err.carrera = true;
        throw err;
    },

    estado() {
        return this.LISTA.map(p => ({ id: p.id, score: +this._score(p.id).toFixed(2), ...(this._mem[p.id] || {}) }));
    }
};

if (typeof window !== 'undefined') {
    window.ProxiesCORS = ProxiesCORS;
    ProxiesCORS._cargarSalud();
}
