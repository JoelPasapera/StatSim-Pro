// ========================================
// RANKING DE REVISTAS DE PSICOLOGÍA — módulo autocontenido.
// Fuente: Serial Title API de Elsevier (misma clave que Scopus), área PSYC,
// ordenado por CiteScore. Cuartil derivado del percentil por materia
// (≥75→Q1, ≥50→Q2, ≥25→Q3, resto Q4), igual que la ficha por ISSN.
//
// FRESCURA HONESTA: el CiteScore cambia ~mensualmente y los cuartiles UNA vez
// al año. Pedirlo en cada carga quemaría cuota para recibir los mismos
// números, así que: caché local de 24 h → render instantáneo; si está viejo,
// se refresca solo en segundo plano; y el botón «Actualizar» fuerza.
//
// RED: directo-primero a api.elsevier.com (CORS abierto, verificado) con
// rescate por ProxiesCORS — el mismo patrón de Scopus y PubMed. Comparte la
// memoria de sesión de ScopusDirecto._directoOK y su rotación de claves.
// ========================================

const RankingRevistas = {

    SUBJ: 'PSYC',           // área temática de Scopus: Psicología
    TOP: 30,                // filas a mostrar
    _OBJETIVO: 200,         // revistas a traer para ordenar (2-8 páginas según el count del API)
    _CLAVE: 'statsim_ranking_psyc_v1',
    _TTL: 86400000,         // 24 horas

    // ---- Red: una página de la lista (directo-primero + rescate) ----
    _url(start, count, key) {
        return 'https://api.elsevier.com/content/serial/title?subj=' + this.SUBJ
            + '&count=' + count + '&start=' + start + '&view=CITESCORE&apiKey=' + key;
    },

    _validar(txt) {
        let d; try { d = JSON.parse(txt); } catch (e) { return null; }
        const meta = d['serial-metadata-response'];
        if (!meta || !Array.isArray(meta.entry)) return null;
        return { entradas: meta.entry, total: parseInt(((meta['opensearch:totalResults']) || '0'), 10) };
    },

    async _traerPagina(start, count) {
        if (typeof ScopusDirecto === 'undefined') throw new Error('ScopusDirecto no está cargado (claves)');
        const key = ScopusDirecto._siguienteKey();
        const url = this._url(start, count, key);
        // Directo (respetando lo aprendido por Scopus sobre CORS en esta sesión).
        if (ScopusDirecto._directoOK !== false) {
            try {
                const r = await fetch(url);
                if (ScopusDirecto._directoOK == null) ScopusDirecto._directoOK = true;
                if (r.ok) { const v = this._validar(await r.text()); if (v) return v; }
            } catch (e) { /* al rescate */ }
        }
        if (typeof ProxiesCORS === 'undefined') throw new Error('sin red directa ni arsenal de proxies');
        const { obras } = await ProxiesCORS.carrera(url, txt => { const v = this._validar(txt); return v ? [v] : null; },
            { anchura: 3, timeout: 15000, oleadas: 2 });
        return obras[0];
    },

    // ---- Parseo de una entrada al formato de la tabla ----
    _fila(entry) {
        if (!entry || entry.error) return null;
        const cs = entry.citeScoreYearInfoList || {};
        const sjr = entry.SJRList && entry.SJRList.SJR && entry.SJRList.SJR[0] && entry.SJRList.SJR[0]['$'];
        const snip = entry.SNIPList && entry.SNIPList.SNIP && entry.SNIPList.SNIP[0] && entry.SNIPList.SNIP[0]['$'];
        let percentil = null;
        for (const a of (cs.citeScoreYearInfo || [])) {
            const info = a.citeScoreInformationList && a.citeScoreInformationList[0]
                && a.citeScoreInformationList[0].citeScoreInfo && a.citeScoreInformationList[0].citeScoreInfo[0];
            const rank = info && info.citeScoreSubjectRank && info.citeScoreSubjectRank[0];
            if (rank && rank.percentile) { percentil = parseInt(rank.percentile, 10); break; }
        }
        const cuartil = percentil == null ? '' : percentil >= 75 ? 'Q1' : percentil >= 50 ? 'Q2' : percentil >= 25 ? 'Q3' : 'Q4';
        const sourceId = entry['source-id'] || '';
        const areas = (entry['subject-area'] || []).map(s => s['$'] || '').filter(Boolean);
        return {
            titulo: entry['dc:title'] || '(sin título)',
            editorial: entry['dc:publisher'] || '',
            issn: entry['prism:issn'] || entry['prism:eIssn'] || '',
            oa: String(entry.openaccess || '') === '1' || entry.openaccessArticle === true,
            citeScore: parseFloat(cs.citeScoreCurrentMetric) || 0,
            anioCS: cs.citeScoreCurrentMetricYear || '',
            sjr: sjr ? parseFloat(sjr) : null,
            snip: snip ? parseFloat(snip) : null,
            percentil, cuartil, areas,
            linkScopus: sourceId ? 'https://www.scopus.com/sourceid/' + sourceId : '',
            linkScimago: sourceId ? 'https://www.scimagojr.com/journalsearch.php?q=' + sourceId + '&tip=sid' : ''
        };
    },

    // ---- Carga completa: páginas hasta el objetivo, orden por CiteScore ----
    async _traerRanking() {
        const filas = [];
        let start = 0, total = Infinity, count = 100;
        while (start < Math.min(this._OBJETIVO, total)) {
            const pag = await this._traerPagina(start, count);
            if (!pag || !pag.entradas.length) break;
            if (Number.isFinite(pag.total) && pag.total > 0) total = pag.total;
            pag.entradas.forEach(e => { const f = this._fila(e); if (f) filas.push(f); });
            if (pag.entradas.length < 20) break; // el API devolvió menos: fin o count menor al pedido
            start += pag.entradas.length;
        }
        filas.sort((a, b) => b.citeScore - a.citeScore);
        return filas.slice(0, this.TOP);
    },

    // ---- Caché de 24 h en localStorage ----
    _leerCache() {
        try {
            const g = JSON.parse(localStorage.getItem(this._CLAVE) || 'null');
            if (g && Array.isArray(g.filas) && g.filas.length) return g;
        } catch (e) { }
        return null;
    },
    _guardarCache(filas) {
        try { localStorage.setItem(this._CLAVE, JSON.stringify({ t: Date.now(), filas })); } catch (e) { }
    },

    async cargar(forzar) {
        const cache = this._leerCache();
        if (cache && !forzar) {
            this._render(cache.filas, cache.t);
            if (Date.now() - cache.t < this._TTL) return; // fresco: nada más que hacer
        } else if (!cache) {
            this._estado('Cargando el ranking de revistas…');
        }
        try {
            const filas = await this._traerRanking();
            if (filas.length) { this._guardarCache(filas); this._render(filas, Date.now()); }
            else if (!cache) this._estado('No se pudo obtener el ranking (sin datos).');
        } catch (e) {
            if (!cache) this._estado('No se pudo obtener el ranking: ' + e.message);
        }
    },

    // ---- Interfaz ----
    _cont() {
        let c = document.getElementById('rankingRevistas');
        if (c) return c;
        const secc = document.getElementById('seccionAntecedentes');
        if (!secc) return null;
        c = document.createElement('div');
        c.id = 'rankingRevistas';
        secc.insertBefore(c, secc.firstChild);
        return c;
    },

    _estado(msg) {
        const c = this._cont();
        if (c) c.innerHTML = '<div style="border:1px solid var(--color-border, #39415a); border-radius:10px; padding:0.7rem 1rem; margin:0 0 0.9rem; font-size:0.85em; color:var(--color-text-soft, #8b93a7);">🏆 ' + msg + '</div>';
    },

    _badgeQ(q) {
        const color = q === 'Q1' ? '#22c55e' : q === 'Q2' ? '#fbbf24' : q === 'Q3' ? '#f97316' : q === 'Q4' ? '#ef4444' : '#64748b';
        return '<span style="border:1px solid ' + color + '; color:' + color + '; border-radius:6px; padding:0 0.35rem; font-size:0.85em;">' + (q || '—') + '</span>';
    },

    _render(filas, t) {
        const c = this._cont();
        if (!c) return;
        const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const fecha = new Date(t).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
        const filasHTML = filas.map((f, i) => {
            const enlaces = (f.linkScopus ? '<a href="' + f.linkScopus + '" target="_blank" rel="noopener" style="color:#7dd3fc;">Scopus</a>' : '')
                + (f.linkScimago ? (f.linkScopus ? ' · ' : '') + '<a href="' + f.linkScimago + '" target="_blank" rel="noopener" style="color:#7dd3fc;">SCImago</a>' : '');
            return '<tr style="border-top:1px solid rgba(148,163,184,0.15);' + (i % 2 ? ' background:rgba(148,163,184,0.05);' : '') + '">'
                + '<td style="padding:0.35rem 0.5rem; text-align:right; color:var(--color-text-soft, #8b93a7);">' + (i + 1) + '</td>'
                + '<td style="padding:0.35rem 0.5rem;" title="' + esc(f.areas.join(' · ')) + '">' + esc(f.titulo) + (f.oa ? ' <span title="Acceso abierto" style="color:#22c55e;">🔓</span>' : '') + '</td>'
                + '<td style="padding:0.35rem 0.5rem; text-align:right; font-weight:600;">' + f.citeScore.toFixed(1) + '</td>'
                + '<td style="padding:0.35rem 0.5rem; text-align:center;">' + this._badgeQ(f.cuartil) + '</td>'
                + '<td style="padding:0.35rem 0.5rem; text-align:right;">' + (f.percentil == null ? '—' : f.percentil) + '</td>'
                + '<td style="padding:0.35rem 0.5rem; text-align:right;">' + (f.sjr == null ? '—' : f.sjr.toFixed(2)) + '</td>'
                + '<td style="padding:0.35rem 0.5rem; text-align:right;">' + (f.snip == null ? '—' : f.snip.toFixed(2)) + '</td>'
                + '<td style="padding:0.35rem 0.5rem;">' + esc(f.editorial) + '</td>'
                + '<td style="padding:0.35rem 0.5rem; white-space:nowrap;">' + esc(f.issn) + '</td>'
                + '<td style="padding:0.35rem 0.5rem; white-space:nowrap;">' + enlaces + '</td>'
                + '</tr>';
        }).join('');
        c.innerHTML = ''
            + '<details ' + (localStorage.getItem(this._CLAVE + '_plegado') === '1' ? '' : 'open') + ' id="rankingDetalles" style="border:1px solid var(--color-border, #39415a); border-radius:10px; padding:0.6rem 1rem; margin:0 0 0.9rem;">'
            + '<summary style="cursor:pointer; color:#fbbf24; font-weight:600; font-size:0.95em;">🏆 Ranking de revistas de Psicología — CiteScore ' + esc(filas[0] && filas[0].anioCS || '') + ' (Scopus · área PSYC)</summary>'
            + '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin:0.5rem 0;">'
            + '<span style="font-size:0.78em; color:var(--color-text-soft, #8b93a7);">Top ' + filas.length + ' por CiteScore · cuartil y percentil por materia · datos: Elsevier Serial Title API · actualizado ' + fecha + '</span>'
            + '<button id="rankingActualizar" class="btn" style="font-size:0.8em; padding:0.25rem 0.7rem;">↻ Actualizar</button></div>'
            + '<div style="max-height:420px; overflow:auto; border-radius:8px;">'
            + '<table style="width:100%; border-collapse:collapse; font-size:0.82em;">'
            + '<thead><tr style="color:#fbbf24; text-align:left; position:sticky; top:0; background:var(--color-bg-card, #10182b);">'
            + '<th style="padding:0.35rem 0.5rem; text-align:right;">#</th><th style="padding:0.35rem 0.5rem;">Revista</th>'
            + '<th style="padding:0.35rem 0.5rem; text-align:right;">CiteScore</th><th style="padding:0.35rem 0.5rem; text-align:center;">Cuartil</th>'
            + '<th style="padding:0.35rem 0.5rem; text-align:right;">Percentil</th><th style="padding:0.35rem 0.5rem; text-align:right;">SJR</th>'
            + '<th style="padding:0.35rem 0.5rem; text-align:right;">SNIP</th><th style="padding:0.35rem 0.5rem;">Editorial</th>'
            + '<th style="padding:0.35rem 0.5rem;">ISSN</th><th style="padding:0.35rem 0.5rem;">Enlaces</th>'
            + '</tr></thead><tbody>' + filasHTML + '</tbody></table></div>'
            + '<div style="font-size:0.72em; color:var(--color-text-soft, #8b93a7); margin-top:0.4rem;">El cuartil se deriva del percentil por materia (≥75 Q1 · ≥50 Q2 · ≥25 Q3 · resto Q4). 🔓 = acceso abierto. El CiteScore se actualiza ~mensualmente; los cuartiles, una vez al año — por eso la tabla se guarda 24 h y se refresca sola.</div>'
            + '</details>';
        const btn = document.getElementById('rankingActualizar');
        if (btn) btn.addEventListener('click', (ev) => { ev.preventDefault(); btn.textContent = '⏳'; this.cargar(true); });
        const det = document.getElementById('rankingDetalles');
        if (det) det.addEventListener('toggle', () => {
            try { localStorage.setItem(this._CLAVE + '_plegado', det.open ? '0' : '1'); } catch (e) { }
        });
    },

    montar() { if (this._cont()) this.cargar(false); }
};

if (typeof window !== 'undefined') {
    window.RankingRevistas = RankingRevistas;
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => RankingRevistas.montar());
    } else {
        RankingRevistas.montar();
    }
}
