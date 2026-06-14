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
        '1c4210c2199d31dc7d7560702729d51d',
        '92d98589eeb9940076461f3a1857661a',
        'ce978a4f4d8c9f38507a7720ddbb3998',
        '81e47fc17a598deb0880e72af71709d5'
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

    // Palabras vacías que estorban el match en Scopus (ES + EN).
    _VACIAS: new Set(['entre','e','y','o','u','de','del','la','el','los','las','en','con','para','por',
        'un','una','su','sus','al','a','the','of','and','or','in','on','for','to','with','between','a','an']),

    // Convierte la consulta en términos clave unidos por AND (mejor recall que
    // una frase larga literal, que en Scopus suele dar 0 resultados).
    _terminosClave(query) {
        const toks = String(query).toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sin acentos
            .replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/)
            .filter(t => t.length > 2 && !this._VACIAS.has(t));
        return [...new Set(toks)];
    },

    // Construye la query Scopus (cadena TITLE-ABS-KEY + filtro de año).
    _construirQuery(query, filtros = {}) {
        const terminos = this._terminosClave(query);
        const q = terminos.length ? `TITLE-ABS-KEY(${terminos.join(' ')})` : `TITLE-ABS-KEY(${query})`;
        return filtros.desde ? `${q} AND PUBYEAR > ${parseInt(filtros.desde, 10) - 1}` : q;
    },

    construirURL(query, filtros = {}) {
        const full = this._construirQuery(query, filtros);
        // view=COMPLETE incluye el abstract (dc:description) y keywords, pero
        // requiere entitlement institucional (por IP suscrita o insttoken). Si
        // no se concede, Scopus responde con error y caemos a STANDARD.
        const params = [
            `query=${encodeURIComponent(full)}`,
            `count=${filtros.count || 25}`,
            `start=${filtros.start || 0}`,
            'sort=relevancy',
            `view=${filtros.view || 'STANDARD'}`
        ].join('&');
        return `https://api.elsevier.com/content/search/scopus?${params}`;
    },

    // URL pública de Scopus para abrir la búsqueda en el navegador (no API).
    urlPublica(query, filtros = {}) {
        const full = this._construirQuery(query, filtros);
        return `https://www.scopus.com/results/results.uri?src=s&st1=${encodeURIComponent(full)}`;
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
            keywords: e['authkeywords'] || '',
            issn: e['prism:issn'] || e['prism:eIssn'] || '',
            fuentesAPI: ['Scopus']
        };
    },

    // Caché de métricas de revista (un ISSN se consulta una sola vez por sesión).
    _cacheRevista: {},

    // Obtiene CiteScore, SJR, SNIP y CUARTIL de una revista por su ISSN, vía
    // Serial Title API (confirmada accesible con las claves). El cuartil se deriva
    // del percentil de ranking por materia: ≥75→Q1, ≥50→Q2, ≥25→Q3, resto Q4.
    async metricasRevista(issn) {
        if (!issn) return null;
        const limpio = issn.replace(/[^0-9Xx]/g, '');
        if (this._cacheRevista[limpio] !== undefined) return this._cacheRevista[limpio];
        if (typeof ProxiesCORS === 'undefined') return null;
        const key = this._siguienteKey();
        const url = `https://api.elsevier.com/content/serial/title/issn/${limpio}?apiKey=${key}&view=CITESCORE`;
        const validar = (html) => {
            let d; try { d = JSON.parse(html); } catch (e) { return null; }
            const entry = d['serial-metadata-response'] && d['serial-metadata-response'].entry && d['serial-metadata-response'].entry[0];
            if (!entry || entry['error']) return null;
            const cs = entry.citeScoreYearInfoList || {};
            const sjr = entry.SJRList && entry.SJRList.SJR && entry.SJRList.SJR[0] && entry.SJRList.SJR[0]['$'];
            const snip = entry.SNIPList && entry.SNIPList.SNIP && entry.SNIPList.SNIP[0] && entry.SNIPList.SNIP[0]['$'];
            // Percentil: del año Complete más reciente con ranking por materia.
            let percentil = null;
            const anios = (cs.citeScoreYearInfo || []);
            for (const a of anios) {
                const info = a.citeScoreInformationList && a.citeScoreInformationList[0]
                    && a.citeScoreInformationList[0].citeScoreInfo && a.citeScoreInformationList[0].citeScoreInfo[0];
                const rank = info && info.citeScoreSubjectRank && info.citeScoreSubjectRank[0];
                if (rank && rank.percentile) { percentil = parseInt(rank.percentile, 10); break; }
            }
            let cuartil = '';
            if (percentil != null) cuartil = percentil >= 75 ? 'Q1' : percentil >= 50 ? 'Q2' : percentil >= 25 ? 'Q3' : 'Q4';
            return [{ // devolver como "obras" para reutilizar la carrera (espera array no vacío)
                citeScore: cs.citeScoreCurrentMetric || '',
                sjr: sjr || '', snip: snip || '',
                percentil, cuartil,
                revista: entry['dc:title'] || ''
            }];
        };
        try {
            const { obras } = await ProxiesCORS.carrera(url, validar, { anchura: 4, timeout: 15000, oleadas: 2 });
            const m = obras[0];
            this._cacheRevista[limpio] = m;
            return m;
        } catch (e) {
            this._cacheRevista[limpio] = null; // no reintentar si falla
            return null;
        }
    },

    // Una petición con una clave, a través de un proxy CORS.
    // Guarda en window la última URL y respuesta para depurar desde consola.
    _debug(url, htmlOrErr) {
        if (typeof window !== 'undefined') {
            window.__scopusDebug = window.__scopusDebug || [];
            window.__scopusDebug.push({ url, respuesta: String(htmlOrErr).slice(0, 600), ts: new Date().toISOString() });
            if (window.__scopusDebug.length > 8) window.__scopusDebug.shift();
        }
    },

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

    // Valida la respuesta JSON de Scopus; devuelve obras o null. Marca aparte
    // los errores de cuota/credenciales vía un objeto de señal compartido.
    _validarScopus(html, senal) {
        this._debug('(respuesta)', html); // queda en window.__scopusDebug para depurar
        let data;
        try { data = JSON.parse(html); } catch (e) { senal.motivo = 'respuesta no-JSON: ' + String(html).slice(0, 80); return null; }
        // Scopus señala errores de varias formas; capturamos el texto para diagnóstico.
        const errTxt = (data['service-error'] && JSON.stringify(data['service-error']))
            || (data['error-response'] && JSON.stringify(data['error-response']))
            || (data.error) || '';
        if (errTxt) {
            const msg = String(errTxt).toLowerCase();
            senal.motivo = String(errTxt).slice(0, 120);
            if (/quota|rate.?limit|maximum number|too many/.test(msg)) senal.cuota = true;
            else senal.auth = true;
            return null;
        }
        const sr = data['search-results'] || {};
        const total = sr['opensearch:totalResults'];
        const entradas = sr.entry || [];
        // Scopus devuelve una entrada con campo 'error' cuando no hay resultados.
        if (entradas.length && entradas[0].error) {
            const e = String(entradas[0].error);
            senal.motivo = `Scopus: ${e} (total=${total})`;
            if (/result set was empty/i.test(e)) senal.vacioReal = true; else senal.auth = true;
            return null;
        }
        senal.total = total;
        return entradas.length ? entradas.map(x => this.normalizar(x)) : null;
    },

    // Trae UNA página (offset start) probando claves con carrera de proxies.
    // Una vez sabido si COMPLETE funciona, se recuerda para no reintentarlo.
    _viewConfirmada: null, // null=sin probar, 'COMPLETE' o 'STANDARD'

    async _buscarPaginaConVista(query, filtros, start, view, key) {
        const baseURL = this.construirURL(query, { ...filtros, count: 25, start, view });
        const senal = {};
        try {
            const { obras, proxy } = await ProxiesCORS.carrera(
                baseURL + `&apiKey=${key}`, html => this._validarScopus(html, senal),
                { anchura: 4, timeout: 20000, oleadas: 2 });
            return { ok: true, obras, proxy, total: senal.total };
        } catch (e) {
            return { ok: false, senal, error: e.message };
        }
    },

    async _buscarPagina(query, filtros, start) {
        const diag = [];
        for (let intento = 0; intento < this.API_KEYS.length; intento++) {
            const key = this._siguienteKey();

            // Decidir qué vista intentar: si aún no se confirmó, probar COMPLETE
            // (trae abstract); si ya supimos que no hay acceso, ir directo a STANDARD.
            const vista = this._viewConfirmada || 'COMPLETE';
            let res = await this._buscarPaginaConVista(query, filtros, start, vista, key);

            // Si COMPLETE falló por entitlement (auth), reintentar STANDARD con la
            // MISMA clave y recordar que COMPLETE no está disponible.
            if (!res.ok && res.senal.auth && vista === 'COMPLETE') {
                this._viewConfirmada = 'STANDARD';
                res = await this._buscarPaginaConVista(query, filtros, start, 'STANDARD', key);
            }

            if (res.ok) {
                // Confirmar la vista que funcionó (COMPLETE si trajo abstract).
                if (!this._viewConfirmada) {
                    const conAbstract = res.obras.some(o => o.resumen && o.resumen.length > 40);
                    this._viewConfirmada = (vista === 'COMPLETE' && conAbstract) ? 'COMPLETE' : vista;
                }
                return { obras: res.obras, key: key.slice(0, 6) + '…', proxy: res.proxy, total: res.total, view: this._viewConfirmada };
            }
            // Errores que no se arreglan cambiando de clave:
            if (res.senal.cuota) { this._marcarAgotada(key); diag.push(`${key.slice(0,6)}…: cuota`); continue; }
            if (res.senal.vacioReal) { const er = new Error('vacío'); er.vacioReal = true; throw er; }
            if (res.senal.auth) { const er = new Error(res.senal.motivo || 'acceso restringido'); er.auth = true; throw er; }
            diag.push(`proxies: ${res.error}`); break;
        }
        const er = new Error(diag.slice(0, 4).join(' · ') || 'sin respuesta'); throw er;
    },

    // Búsqueda con PAGINACIÓN: trae páginas de 25 hasta 'maxResultados'.
    // Scopus es API legítima → paginar es seguro (no hay anti-bot como Scholar).
    async buscar(query, filtros = {}) {
        if (typeof ProxiesCORS === 'undefined') throw new Error('arsenal de proxies no disponible');
        const objetivo = filtros.maxResultados || 25;
        const paginas = Math.ceil(objetivo / 25);
        const todas = [];
        let ultMeta = {};
        for (let p = 0; p < paginas; p++) {
            let res;
            try { res = await this._buscarPagina(query, filtros, p * 25); }
            catch (e) {
                if (p === 0) { e.scopus = true; throw e; } // primer fallo: propagar
                break; // ya tenemos algo de páginas previas
            }
            ultMeta = { key: res.key, proxy: res.proxy };
            const nuevos = res.obras.filter(o => !todas.some(t => (t.doi && t.doi === o.doi) || t.titulo === o.titulo));
            todas.push(...nuevos);
            // Si Scopus devolvió menos de 25, no hay más páginas.
            if (res.obras.length < 25) break;
            const total = parseInt(res.total || '0', 10);
            if (total && (p + 1) * 25 >= total) break; // alcanzado el total real
        }
        return { obras: todas.slice(0, objetivo), ...ultMeta, paginas: Math.ceil(todas.length / 25), view: this._viewConfirmada };
    }
};

if (typeof window !== 'undefined') window.ScopusDirecto = ScopusDirecto;
