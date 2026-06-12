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

    // Proxies CORS públicos conocidos (se prueban en orden hasta que uno sirva).
    PROXIES: [
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
        url => `https://thingproxy.freeboard.io/fetch/${url}`,
        url => `https://api.codetabs.com/v1/proxy/?quest=${url}`
    ],

    urlScholar(query, desde) {
        const p = new URLSearchParams({ q: query, hl: 'es' });
        if (desde) p.set('as_ylo', String(desde));
        return `https://scholar.google.com/scholar?${p.toString()}`;
    },

    // Parsea el HTML de resultados de Scholar a objetos estructurados.
    parsearHTML(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const items = [...doc.querySelectorAll('.gs_r.gs_or, .gs_ri')];
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
                titulo, link, autoresRaw: autores.trim(),
                anio: mAnio ? +mAnio[0] : 's. f.',
                fuente: (meta.split(' - ')[1] || '').replace(/,?\s*(19|20)\d{2}.*$/, '').trim(),
                resumen: resumen.trim(), citas, fuentesAPI: ['Scholar']
            });
        });
        return obras;
    },

    async buscar(query, desde) {
        const objetivo = this.urlScholar(query, desde);
        const errores = [];
        for (let i = 0; i < this.PROXIES.length; i++) {
            const proxyURL = this.PROXIES[i](objetivo);
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 12000);
                const r = await fetch(proxyURL, { signal: ctrl.signal });
                clearTimeout(t);
                if (!r.ok) { errores.push(`proxy ${i + 1}: HTTP ${r.status}`); continue; }
                const html = await r.text();
                if (/id="gs_captcha|unusual traffic|not a robot/i.test(html)) {
                    errores.push(`proxy ${i + 1}: Scholar pidió CAPTCHA`); continue;
                }
                const obras = this.parsearHTML(html);
                if (obras.length) return { obras, proxy: i + 1 };
                errores.push(`proxy ${i + 1}: HTML sin resultados parseables`);
            } catch (e) {
                errores.push(`proxy ${i + 1}: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
            }
        }
        throw new Error(errores.join(' · '));
    }
};

if (typeof window !== 'undefined') window.ScholarDirecto = ScholarDirecto;
