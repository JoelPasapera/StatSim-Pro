// ========================================
// BÚSQUEDA DIRECTA EN GOOGLE ACADÉMICO (intento experimental)
// Scholar no tiene API ni envía cabeceras CORS, así que el navegador bloquea
// el fetch directo. Este módulo lo intenta vía PROXIES CORS públicos (en
// cascada: si uno falla o está caído, prueba el siguiente) que reenvían la
// petición y añaden las cabeceras necesarias; luego parsea el HTML de Scholar.
// ADVERTENCIA HONESTA: depende de proxies de terceros (lentos, inestables) y
// Scholar responde con CAPTCHA ante patrones automáticos. Puede dejar de
// funcionar en cualquier momento. Es un mejor-esfuerzo, no una base estable.
// ========================================

const ScholarDirecto = {

    urlScholar(query, desde, start = 0) {
        const p = new URLSearchParams({ q: query, hl: 'es' });
        if (desde) p.set('as_ylo', String(desde));
        if (start) p.set('start', String(start)); // paginación: 0,10,20…
        return `https://scholar.google.com/scholar?${p.toString()}`;
    },

    _sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
    // Retardo humano con jitter: tiempo de "lectura" antes de pasar de página.
    _esperaHumana() { return 1500 + Math.floor(Math.random() * 2500); }, // 1.5–4 s

    // Parsea el HTML de resultados de Scholar a objetos estructurados.
    parsearHTML(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        // Solo el contenedor de cada resultado (.gs_r.gs_or); usar también su
        // hijo .gs_ri duplicaba cada obra. .gs_ri queda como fallback si Google
        // cambiara el markup externo.
        let items = [...doc.querySelectorAll('.gs_r.gs_or')];
        if (!items.length) items = [...doc.querySelectorAll('.gs_ri')];
        const obras = [];
        items.forEach(it => {
            const tEl = it.querySelector('.gs_rt');
            const titulo = tEl ? tEl.textContent.replace(/^\[[^\]]*\]\s*/, '').trim() : '';
            if (!titulo) return;
            const link = tEl && tEl.querySelector('a') ? tEl.querySelector('a').href : '';
            const meta = (it.querySelector('.gs_a') || {}).textContent || '';
            const resumen = (it.querySelector('.gs_rs') || {}).textContent || '';
            // "Autores - Revista, Año - editorial"
            const mAnio = meta.match(/\b(19|20)\d{2}\b/);
            const autores = meta.split(' - ')[0] || '';
            let citas = 0;
            it.querySelectorAll('.gs_fl a').forEach(a => {
                const m = a.textContent.match(/Citado por (\d+)|Cited by (\d+)/);
                if (m) citas = +(m[1] || m[2]);
            });
            obras.push({
                titulo, link, autoresRaw: autores.replace(/[…\u2026]/g, '').replace(/\s+/g, ' ').trim(),
                anio: mAnio ? +mAnio[0] : 's. f.',
                fuente: (meta.split(' - ')[1] || '').replace(/,?\s*(19|20)\d{2}.*$/, '').trim(),
                resumen: resumen.trim(), citas, fuentesAPI: ['Scholar']
            });
        });
        return obras;
    },

    _cache: {},

    // Recupera UNA página (offset start) probando el arsenal hasta que uno sirva.
    // Devuelve {obras, proxy, captcha} — captcha=true si Scholar bloqueó.
    async _buscarPagina(query, desde, start) {
        const objetivo = this.urlScholar(query, desde, start);
        const arsenal = (typeof ProxiesCORS !== 'undefined')
            ? ProxiesCORS.ordenados()
            : [{ id: 'allorigins-raw', build: u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, mode: 'raw' }];
        const errores = [];
        for (const proxy of arsenal) {
            const t0 = Date.now();
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 12000);
                const r = await fetch(proxy.build(objetivo), { signal: ctrl.signal });
                clearTimeout(t);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const html = (typeof ProxiesCORS !== 'undefined') ? await ProxiesCORS.extraer(proxy, r) : await r.text();
                if (/id="gs_captcha|unusual traffic|not a robot|sorry\/index/i.test(html)) {
                    if (typeof ProxiesCORS !== 'undefined') ProxiesCORS.registrar(proxy.id, false);
                    return { obras: [], proxy: proxy.id, captcha: true };
                }
                const obras = this.parsearHTML(html);
                if (obras.length) {
                    if (typeof ProxiesCORS !== 'undefined') ProxiesCORS.registrar(proxy.id, true, Date.now() - t0);
                    return { obras, proxy: proxy.id, captcha: false };
                }
                if (typeof ProxiesCORS !== 'undefined') ProxiesCORS.registrar(proxy.id, false);
                errores.push(`${proxy.id}: vacío`);
            } catch (e) {
                if (typeof ProxiesCORS !== 'undefined') ProxiesCORS.registrar(proxy.id, false);
                errores.push(`${proxy.id}: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
            }
        }
        const err = new Error(errores.slice(0, 5).join(' · ')); err.sinProxy = true; throw err;
    },

    // Paginación INTELIGENTE: trae varias páginas bajo demanda, con espera
    // humana entre cada una, rotando proxy y deteniéndose al primer CAPTCHA.
    // maxPaginas: 1→10 result., 2→20, 3→30. Devuelve obras acumuladas + meta.
    async buscarPaginado(query, desde, maxPaginas = 2) {
        const ck = `${this._normQ(query)}|${desde || ''}|p${maxPaginas}`;
        if (this._cache[ck]) return { ...this._cache[ck], deCache: true };
        const todas = [];
        const proxiesUsados = [];
        let captchaEn = 0;
        for (let pag = 0; pag < maxPaginas; pag++) {
            if (pag > 0) await this._sleep(this._esperaHumana()); // ritmo humano
            let res;
            try { res = await this._buscarPagina(query, desde, pag * 10); }
            catch (e) { if (pag === 0) throw e; else break; } // sin proxies: corta, conserva lo logrado
            if (res.captcha) { captchaEn = pag + 1; break; }   // CAPTCHA: retrocede, no insiste
            proxiesUsados.push(res.proxy);
            const nuevos = res.obras.filter(o => !todas.some(t => this._norm(t.titulo) === this._norm(o.titulo)));
            todas.push(...nuevos);
            if (res.obras.length < 8) break; // última página real (Scholar dio menos de 10)
        }
        const out = { obras: todas, proxiesUsados, paginas: proxiesUsados.length, captchaEn };
        if (todas.length) this._cache[ck] = out;
        return out;
    },

    _normQ(q) { return this._norm ? this._norm(q) : String(q).toLowerCase().trim(); },
    _norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); },

    async buscar(query, desde) {
        const ck = `${this._norm ? this._norm(query) : query.toLowerCase()}|${desde || ''}`;
        if (this._cache[ck]) return { ...this._cache[ck], deCache: true };
        const objetivo = this.urlScholar(query, desde);
        const arsenal = (typeof ProxiesCORS !== 'undefined')
            ? ProxiesCORS.ordenados()
            : [{ id: 'allorigins-raw', build: u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, mode: 'raw' }];
        const errores = [];
        let captchas = 0;
        for (const proxy of arsenal) {
            const t0 = Date.now();
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 12000);
                const r = await fetch(proxy.build(objetivo), { signal: ctrl.signal });
                clearTimeout(t);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const html = (typeof ProxiesCORS !== 'undefined')
                    ? await ProxiesCORS.extraer(proxy, r) : await r.text();
                if (/id="gs_captcha|unusual traffic|not a robot|sorry\/index/i.test(html)) {
                    captchas++;
                    if (typeof ProxiesCORS !== 'undefined') ProxiesCORS.registrar(proxy.id, false);
                    errores.push(`${proxy.id}: CAPTCHA`);
                    continue;
                }
                const obras = this.parsearHTML(html);
                if (obras.length) {
                    if (typeof ProxiesCORS !== 'undefined') ProxiesCORS.registrar(proxy.id, true, Date.now() - t0);
                    const r2 = { obras, proxy: proxy.id, captchas };
                    this._cache[ck] = r2;
                    return r2;
                }
                if (typeof ProxiesCORS !== 'undefined') ProxiesCORS.registrar(proxy.id, false);
                errores.push(`${proxy.id}: sin resultados`);
            } catch (e) {
                if (typeof ProxiesCORS !== 'undefined') ProxiesCORS.registrar(proxy.id, false);
                errores.push(`${proxy.id}: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
            }
        }
        const err = new Error(errores.slice(0, 6).join(' · '));
        err.captchas = captchas; err.intentos = arsenal.length;
        throw err;
    }
};

if (typeof window !== 'undefined') window.ScholarDirecto = ScholarDirecto;
