// ========================================
// BÚSQUEDA EN SCOPUS (Elsevier) — módulo dedicado.
// Usa la Scopus Search API con ROTACIÓN de API keys propias (resiliencia ante
// caídas/cuota). Dos obstáculos conocidos de esta API, mitigados aquí:
//   1) NO envía cabeceras CORS → el navegador bloquea el fetch directo; se
//      enruta por el arsenal de proxies CORS (ProxiesCORS), igual que Scholar.
//   2) El acceso completo suele requerir red institucional suscrita; sin ella
//      la API responde 401/403 o devuelve metadatos limitados. El módulo lo
//      detecta y lo reporta con claridad en vez de fallar en silencio.
// Claves hardcodeadas por decisión explícita del propietario (son suyas).
// ========================================

const ScopusDirecto = {

    // API keys propias del proyecto (rotación ante cuota/caída).
    API_KEYS: [
        'd54be3207354b928a6e2ce355101c81f',
        '147d71e438d2d472bea28abbe4aa9c4e',
        '359dd3266f644bf44e1b6610d7c6664c',
        '16ccbb33ab907de19c7064a0d479451f',
        '1c4210c2199d31dc7d7560702729d51d'
    ],
    _idxKey: 0,
    _keyEstado: {}, // key → {agotada:bool, ts}

    // Siguiente clave disponible (salta las marcadas como agotadas hoy).
    _siguienteKey() {
        const n = this.API_KEYS.length;
        for (let i = 0; i < n; i++) {
            const k = this.API_KEYS[(this._idxKey + i) % n];
            const est = this._keyEstado[k];
            if (!est || !est.agotada) { this._idxKey = (this._idxKey + i + 1) % n; return k; }
        }
        return this.API_KEYS[0]; // todas agotadas: reintenta la primera
    },

    _marcarAgotada(k) { this._keyEstado[k] = { agotada: true, ts: Date.now() }; },

    construirURL(query, filtros = {}) {
        let q = `TITLE-ABS-KEY(${query})`;
        if (filtros.desde) q += ` AND PUBYEAR > ${parseInt(filtros.desde, 10) - 1}`;
        const p = new URLSearchParams({
            query: q,
            count: String(filtros.count || 25),
            sort: 'relevancy',
            view: 'STANDARD'
        });
        return `https://api.elsevier.com/content/search/scopus?${p.toString()}`;
    },

    normalizar(e) {
        const autores = e['dc:creator'] ? [e['dc:creator']] : [];
        const doi = e['prism:doi'] ? `https://doi.org/${e['prism:doi']}` : '';
        const scopusURL = (e.link || []).find(l => l['@ref'] === 'scopus');
        return {
            titulo: e['dc:title'] || '(sin título)',
            autores,
            anio: (e['prism:coverDate'] || '').slice(0, 4) || 's. f.',
            doi,
            link: doi || (scopusURL ? scopusURL['@href'] : ''),
            fuente: e['prism:publicationName'] || '',
            volumen: e['prism:volume'] || '', numero: e['prism:issueIdentifier'] || '',
            paginas: e['prism:pageRange'] || '',
            citas: parseInt(e['citedby-count'] || '0', 10),
            idioma: '',
            resumen: e['dc:description'] || '',
            fuentesAPI: ['Scopus']
        };
    },

    // Una petición con una clave, a través de un proxy CORS.
    async _intentar(url, key, proxy) {
        const conKey = url + `&apiKey=${key}`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        try {
            const r = await fetch(proxy.build(conKey), { signal: ctrl.signal });
            clearTimeout(t);
            if (r.status === 429) return { error: 'cuota', status: 429 };
            if (r.status === 401 || r.status === 403) return { error: 'auth', status: r.status };
            if (!r.ok) return { error: 'http', status: r.status };
            const html = (typeof ProxiesCORS !== 'undefined') ? await ProxiesCORS.extraer(proxy, r) : await r.text();
            let data;
            try { data = JSON.parse(html); } catch (e) { return { error: 'parse' }; }
            // Scopus puede devolver error embebido (cuota/credenciales) con HTTP 200.
            if (data['service-error'] || (data['error-response'])) return { error: 'servicio' };
            const entradas = (data['search-results'] && data['search-results'].entry) || [];
            if (entradas.length && entradas[0].error) return { error: 'servicio' };
            return { obras: entradas.map(x => this.normalizar(x)) };
        } catch (e) {
            clearTimeout(t);
            return { error: e.name === 'AbortError' ? 'timeout' : 'red' };
        }
    },

    async buscar(query, filtros = {}) {
        const url = this.construirURL(query, filtros);
        const proxies = (typeof ProxiesCORS !== 'undefined') ? ProxiesCORS.ordenados()
            : [{ id: 'allorigins-raw', build: u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, mode: 'raw' }];
        const diag = [];
        // ESTRATEGIA: el cuello de botella es el PROXY, no la clave. Por eso el
        // bucle externo recorre proxies con UNA sola clave; la clave SOLO rota
        // cuando el error es específicamente de cuota (429) o credenciales —
        // así no se queman las 5 claves contra un proxy caído.
        let key = this._siguienteKey();
        for (const proxy of proxies) {
            const res = await this._intentar(url, key, proxy);
            if (res.obras && res.obras.length) {
                if (typeof ProxiesCORS !== 'undefined') ProxiesCORS.registrar(proxy.id, true, 0);
                return { obras: res.obras, key: key.slice(0, 6) + '…', proxy: proxy.id };
            }
            // 429 = cuota de ESA clave agotada → cambiar de clave y reintentar
            // el MISMO proxy (que sí funciona) con la nueva clave.
            if (res.error === 'cuota') {
                this._marcarAgotada(key);
                const nueva = this._siguienteKey();
                if (nueva !== key) {
                    key = nueva;
                    const res2 = await this._intentar(url, key, proxy);
                    if (res2.obras && res2.obras.length) {
                        if (typeof ProxiesCORS !== 'undefined') ProxiesCORS.registrar(proxy.id, true, 0);
                        return { obras: res2.obras, key: key.slice(0, 6) + '…', proxy: proxy.id };
                    }
                }
                diag.push(`cuota agotada en claves`);
                continue;
            }
            // 401/403 = restricción de credenciales/red: cambiar de clave no ayuda
            // (es el mismo nivel de acceso); se reporta y se prueba otro proxy.
            if (res.error === 'auth') { diag.push(`${proxy.id}: ${res.status} (acceso restringido)`); continue; }
            // Fallo del proxy (404/timeout/red): registrar y pasar al siguiente.
            if (typeof ProxiesCORS !== 'undefined') ProxiesCORS.registrar(proxy.id, false);
            diag.push(`${proxy.id}: ${res.error || 'sin datos'}`);
        }
        const err = new Error(diag.slice(0, 5).join(' · ') || 'ningún proxy entregó la respuesta de Scopus');
        err.scopus = true;
        throw err;
    }
};

if (typeof window !== 'undefined') window.ScopusDirecto = ScopusDirecto;
