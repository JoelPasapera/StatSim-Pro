// ========================================
// RANKING DE REVISTAS DE PSICOLOGÍA — v2 (auditada).
// Fuente: Serial Title API de Elsevier (claves propias de Scopus), área PSYC
// COMPLETA (~1.300-1.500 revistas): el API lista en orden alfabético, así que
// para un top real hay que traer TODO y ordenar en el cliente (v1 rankeaba
// «lo mejor de la letra A» — bug confirmado en producción).
//
// PERCENTIL RIGUROSO: solo del año con @status='Complete' (el In-Progress es
// el tracker mensual) y solo de categorías de psicología (códigos ASJC 32xx),
// tomando el mejor. Cuartil: ≥75 Q1 · ≥50 Q2 · ≥25 Q3 · resto Q4.
//
// RED: directo a api.elsevier.com con timeout de 10 s. Errores de CLAVE/CUOTA
// (401/403/429) rotan clave y reintentan directo UNA vez — jamás van a los
// proxies (rescatan transporte, no errores de API). Solo el bloqueo CORS cae
// al arsenal. La clave viaja en URL: decisión documentada (contrato de
// seguridad de proxies-cors); con esta política casi nunca transita por ellos.
//
// FRESCURA: el CiteScore mostrado es ANUAL (se publica en junio; lo mensual es
// el tracker). Caché de 7 días con render instantáneo; el refresco en fondo no
// repinta si los datos no cambiaron (no te roba el scroll). Solo se cachea la
// cobertura COMPLETA: un ranking parcial se muestra avisado, nunca se guarda.
// ========================================

const RankingRevistas = {

    SUBJ: 'PSYC',
    _CLAVE: 'statsim_ranking_psyc_v2',
    _TTL: 7 * 86400000,          // 7 días: los datos son anuales
    _VENTANA: 4,                 // páginas en paralelo

    // ---------- estado de la vista (orden, filtros, profundidad) ----------
    _datos: null,                // { t, filas, total, parcial }
    _vista: { orden: 'citeScore', asc: false, top: 30, area: '', tipo: '', filtro: '' },

    // ---------- red ----------
    _url(start, count, key) {
        return 'https://api.elsevier.com/content/serial/title?subj=' + this.SUBJ
            + '&count=' + count + '&start=' + start
            + '&view=CITESCORE&httpAccept=application/json&apiKey=' + key;
    },

    _validar(txt) {
        let d; try { d = JSON.parse(txt); } catch (e) { return null; }
        const meta = d['serial-metadata-response'];
        if (!meta || !Array.isArray(meta.entry)) return null;
        return { entradas: meta.entry, total: parseInt((meta['opensearch:totalResults']) || '0', 10) };
    },

    async _fetchDirecto(url) {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 10000);
        try { return await fetch(url, { signal: ctrl.signal }); }
        finally { clearTimeout(tid); }
    },

    // Una página. Política de errores:
    //  · 401/403/429 = clave/cuota → rotar clave y reintentar directo UNA vez;
    //    si persiste, error claro y SIN proxies (no es un problema de red).
    //  · Bloqueo CORS → arsenal de proxies (transporte).
    async _traerPagina(start, count) {
        if (typeof ScopusDirecto === 'undefined') throw new Error('ScopusDirecto no está cargado (claves)');
        for (let intento = 0; intento < 2; intento++) {
            const key = ScopusDirecto._siguienteKey();
            const url = this._url(start, count, key);
            if (ScopusDirecto._directoOK !== false) {
                try {
                    const r = await this._fetchDirecto(url);
                    if (ScopusDirecto._directoOK == null) ScopusDirecto._directoOK = true;
                    if (r.status === 401 || r.status === 403 || r.status === 429) {
                        if (intento === 0) continue; // rotar clave y reintentar directo
                        throw Object.assign(new Error('clave/cuota rechazada por Elsevier (HTTP' + r.status + ')'), { api: true });
                    }
                    if (r.ok) { const v = this._validar(await r.text()); if (v) return v; }
                    throw Object.assign(new Error('HTTP' + r.status + ' de Elsevier'), { api: true });
                } catch (e) {
                    if (e && e.api) throw e;
                    const esAbort = e && (e.name === 'AbortError' || /abort/i.test(String(e.message)));
                    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
                    if (!esAbort && !sinRed) ScopusDirecto._directoOK = false; // CORS: aprender y no insistir
                    break; // al rescate por transporte
                }
            } else break;
        }
        if (typeof ProxiesCORS === 'undefined') throw new Error('sin red directa ni arsenal de proxies');
        const key2 = ScopusDirecto._siguienteKey();
        const { obras } = await ProxiesCORS.carrera(this._url(start, count, key2),
            txt => { const v = this._validar(txt); return v ? [v] : null; },
            { anchura: 3, timeout: 15000, oleadas: 2 });
        return obras[0];
    },

    // ---------- parseo ----------
    _fila(entry) {
        if (!entry || entry.error) return null;
        const cs = entry.citeScoreYearInfoList || {};
        const sjr = entry.SJRList && entry.SJRList.SJR && entry.SJRList.SJR[0] && entry.SJRList.SJR[0]['$'];
        const snip = entry.SNIPList && entry.SNIPList.SNIP && entry.SNIPList.SNIP[0] && entry.SNIPList.SNIP[0]['$'];
        // Percentil: año Complete, mejor rank de categorías 32xx (psicología).
        let percentil = null;
        for (const a of (cs.citeScoreYearInfo || [])) {
            if (String(a['@status'] || '').toLowerCase() !== 'complete') continue;
            const info = a.citeScoreInformationList && a.citeScoreInformationList[0]
                && a.citeScoreInformationList[0].citeScoreInfo && a.citeScoreInformationList[0].citeScoreInfo[0];
            const ranks = (info && info.citeScoreSubjectRank) || [];
            for (const rk of ranks) {
                if (!String(rk.subjectCode || '').startsWith('32')) continue;
                const p = parseInt(rk.percentile, 10);
                if (Number.isFinite(p) && (percentil == null || p > percentil)) percentil = p;
            }
        }
        const cuartil = percentil == null ? '' : percentil >= 75 ? 'Q1' : percentil >= 50 ? 'Q2' : percentil >= 25 ? 'Q3' : 'Q4';
        const sourceIdCrudo = String(entry['source-id'] || '');
        const sourceId = /^\d+$/.test(sourceIdCrudo) ? sourceIdCrudo : ''; // solo dígitos entran a un href
        const titulo = entry['dc:title'] || '(sin título)';
        return {
            titulo,
            esRevision: /\bannual review\b|\breviews?\b|\brevisi(ó|o)n\b/i.test(titulo),
            editorial: entry['dc:publisher'] || '',
            issn: entry['prism:issn'] || entry['prism:eIssn'] || '',
            oa: String(entry.openaccess || '') === '1' || entry.openaccessArticle === true,
            citeScore: parseFloat(cs.citeScoreCurrentMetric) || 0,
            anioCS: cs.citeScoreCurrentMetricYear || '',
            sjr: sjr ? parseFloat(sjr) : null,
            snip: snip ? parseFloat(snip) : null,
            percentil, cuartil,
            areas: (entry['subject-area'] || []).map(s => s['$'] || '').filter(Boolean),
            linkScopus: sourceId ? 'https://www.scopus.com/sourceid/' + sourceId : '',
            linkScimago: sourceId ? 'https://www.scimagojr.com/journalsearch.php?q=' + sourceId + '&tip=sid' : ''
        };
    },

    // ---------- carga completa: TODO el área, en paralelo ----------
    async _traerRanking(alProgresar) {
        const primera = await this._traerPagina(0, 200);
        const porPagina = primera.entradas.length;         // el count real que sirve el API
        const total = primera.total || porPagina;
        const paginas = Math.max(1, Math.ceil(total / porPagina));
        const lotes = new Array(paginas).fill(null);
        lotes[0] = primera.entradas;
        let hechas = 1, fallos = 0;
        if (alProgresar) alProgresar(hechas, paginas);

        const indices = []; for (let p = 1; p < paginas; p++) indices.push(p);
        let cursor = 0;
        const trabajador = async () => {
            while (cursor < indices.length) {
                const p = indices[cursor++];
                for (let intento = 0; intento < 2; intento++) {
                    try {
                        const r = await this._traerPagina(p * porPagina, porPagina);
                        lotes[p] = r.entradas; break;
                    } catch (e) {
                        if (e && e.api) { cursor = indices.length; fallos++; lotes[p] = []; break; } // cuota: no martillear
                        if (intento === 1) { fallos++; lotes[p] = []; }
                    }
                }
                hechas++; if (alProgresar) alProgresar(Math.min(hechas, paginas), paginas);
            }
        };
        await Promise.all(Array.from({ length: Math.min(this._VENTANA, indices.length) }, trabajador));

        const filas = [];
        lotes.forEach(l => (l || []).forEach(e => { const f = this._fila(e); if (f) filas.push(f); }));
        filas.sort((a, b) => b.citeScore - a.citeScore);
        return { filas, total, parcial: fallos > 0 };
    },

    // ---------- caché (solo cobertura completa) ----------
    _leerCache() {
        try {
            const g = JSON.parse(localStorage.getItem(this._CLAVE) || 'null');
            if (g && Array.isArray(g.filas) && g.filas.length) return g;
        } catch (e) { }
        return null;
    },

    async cargar(forzar) {
        const cache = this._leerCache();
        if (cache && !forzar) {
            this._datos = cache; this._render();
            if (Date.now() - cache.t < this._TTL) return;
        } else if (!cache) {
            this._estado('Cargando el ranking completo del área (≈1.400 revistas)…');
        }
        try {
            const r = await this._traerRanking((h, t) => {
                if (!cache) this._estado('Cargando el ranking… página ' + h + ' de ' + t);
            });
            if (!r.filas.length) { if (!cache) this._estado('No se pudo obtener el ranking (sin datos).'); else this._render(); return; }
            const nuevo = { t: Date.now(), filas: r.filas, total: r.total, parcial: r.parcial };
            // #10: si nada cambió, no repintar (respeta el scroll del lector).
            const igual = this._datos && JSON.stringify(this._datos.filas) === JSON.stringify(nuevo.filas);
            this._datos = nuevo;
            if (!r.parcial) { try { localStorage.setItem(this._CLAVE, JSON.stringify(nuevo)); } catch (e) { } }
            if (!igual) this._render();
        } catch (e) {
            // #3: nunca dejar el botón colgado — restaurar la tabla cacheada con aviso.
            if (cache) { this._datos = cache; this._render('⚠️ No se pudo actualizar (' + e.message + '); mostrando datos guardados.'); }
            else this._estado('No se pudo obtener el ranking: ' + e.message);
        }
    },

    // ---------- vista ----------
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

    _filasVisibles() {
        const v = this._vista;
        let filas = this._datos.filas.slice();
        if (v.area) filas = filas.filter(f => f.areas.includes(v.area));
        if (v.tipo === 'rev') filas = filas.filter(f => f.esRevision);
        if (v.tipo === 'emp') filas = filas.filter(f => !f.esRevision);
        if (v.filtro) {
            const t = v.filtro.toLowerCase();
            filas = filas.filter(f => (f.titulo + ' ' + f.editorial).toLowerCase().includes(t));
        }
        const k = v.orden;
        filas.sort((a, b) => {
            const x = a[k] == null ? -Infinity : a[k], y = b[k] == null ? -Infinity : b[k];
            return v.asc ? x - y : y - x;
        });
        return filas;
    },

    _csv() {
        const esc = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
        const filas = this._filasVisibles();
        const cab = ['#', 'Revista', 'Tipo', 'CiteScore', 'Cuartil', 'Percentil', 'SJR', 'SNIP', 'Editorial', 'Acceso abierto', 'ISSN', 'Áreas', 'Scopus', 'SCImago'];
        const cuerpo = filas.map((f, i) => [i + 1, f.titulo, f.esRevision ? 'Revisión' : 'Empírica/otra', f.citeScore,
            f.cuartil || '', f.percentil == null ? '' : f.percentil, f.sjr == null ? '' : f.sjr, f.snip == null ? '' : f.snip,
            f.editorial, f.oa ? 'Sí' : 'No', f.issn, f.areas.join(' | '), f.linkScopus, f.linkScimago].map(esc).join(','));
        const blob = new Blob(['\ufeff' + cab.map(esc).join(',') + '\n' + cuerpo.join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'ranking_revistas_psicologia.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    },

    _render(aviso) {
        const c = this._cont();
        if (!c || !this._datos) return;
        const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const v = this._vista;
        const todas = this._filasVisibles();
        const filas = todas.slice(0, v.top);
        const fecha = new Date(this._datos.t).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
        const areas = [...new Set(this._datos.filas.flatMap(f => f.areas))].sort();
        const flecha = k => v.orden === k ? (v.asc ? ' ↑' : ' ↓') : '';
        const th = (k, txt, alinear) => '<th data-orden="' + k + '" style="padding:0.35rem 0.5rem; cursor:pointer; white-space:nowrap;'
            + (alinear ? ' text-align:' + alinear + ';' : '') + (v.orden === k ? ' text-decoration:underline;' : '') + '">' + txt + flecha(k) + '</th>';

        const filasHTML = filas.map((f, i) => {
            const barra = f.percentil == null ? '—'
                : '<div style="position:relative; min-width:64px;"><div style="position:absolute; inset:0; background:rgba(34,197,94,0.18); width:' + f.percentil + '%; border-radius:3px;"></div>'
                + '<span style="position:relative; padding:0 0.25rem;">' + f.percentil + '</span></div>';
            const nombre = f.linkScopus
                ? '<a href="' + f.linkScopus + '" target="_blank" rel="noopener" style="color:inherit; text-decoration:underline dotted;">' + esc(f.titulo) + '</a>'
                : esc(f.titulo);
            return '<tr style="border-top:1px solid rgba(148,163,184,0.15);' + (i % 2 ? ' background:rgba(148,163,184,0.05);' : '') + '">'
                + '<td style="padding:0.35rem 0.5rem; text-align:right; color:var(--color-text-soft, #8b93a7);">' + (i + 1) + '</td>'
                + '<td style="padding:0.35rem 0.5rem;" title="' + esc(f.areas.join(' · ')) + '">' + nombre
                + (f.esRevision ? ' <span title="Revista de revisión/síntesis: acumula muchas más citas por artículo" style="color:#a78bfa;">📖</span>' : '')
                + (f.oa ? ' <span title="Acceso abierto" style="color:#22c55e;">🔓</span>' : '') + '</td>'
                + '<td style="padding:0.35rem 0.5rem; text-align:right; font-weight:600;">' + f.citeScore.toFixed(1) + '</td>'
                + '<td style="padding:0.35rem 0.5rem; text-align:center;">' + this._badgeQ(f.cuartil) + '</td>'
                + '<td style="padding:0.35rem 0.5rem; text-align:right;">' + barra + '</td>'
                + '<td style="padding:0.35rem 0.5rem; text-align:right;">' + (f.sjr == null ? '—' : f.sjr.toFixed(2)) + '</td>'
                + '<td style="padding:0.35rem 0.5rem; text-align:right;">' + (f.snip == null ? '—' : f.snip.toFixed(2)) + '</td>'
                + '<td style="padding:0.35rem 0.5rem; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + esc(f.editorial) + '">' + esc(f.editorial) + '</td>'
                + '<td style="padding:0.35rem 0.5rem; white-space:nowrap;">' + esc(f.issn) + '</td>'
                + '<td style="padding:0.35rem 0.5rem; white-space:nowrap;">' + (f.linkScimago ? '<a href="' + f.linkScimago + '" target="_blank" rel="noopener" style="color:#7dd3fc;">SCImago</a>' : '—') + '</td>'
                + '</tr>';
        }).join('');

        c.innerHTML = ''
            + '<details ' + (localStorage.getItem(this._CLAVE + '_plegado') === '1' ? '' : 'open') + ' id="rankingDetalles" style="border:1px solid var(--color-border, #39415a); border-radius:10px; padding:0.6rem 1rem; margin:0 0 0.9rem;">'
            + '<summary style="cursor:pointer; color:#fbbf24; font-weight:600; font-size:0.95em;">🏆 Ranking de revistas de Psicología — CiteScore ' + esc(filas[0] && filas[0].anioCS || '') + ' (Scopus · área PSYC completa)</summary>'
            + (aviso ? '<div style="font-size:0.78em; color:#fbbf24; margin:0.4rem 0 0;">' + esc(aviso) + '</div>' : '')
            + (this._datos.parcial ? '<div style="font-size:0.78em; color:#f97316; margin:0.4rem 0 0;">⚠️ Cobertura parcial en esta carga (alguna página falló): el ranking se muestra pero NO se guardó en caché.</div>' : '')
            + '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin:0.5rem 0;">'
            + '<span style="font-size:0.78em; color:var(--color-text-soft, #8b93a7);">Top ' + filas.length + ' de ' + this._datos.filas.length + ' revistas del área · datos: Elsevier Serial Title API · CiteScore anual (junio) · actualizado ' + fecha + '</span>'
            + '<span style="display:flex; gap:0.4rem; flex-wrap:wrap;">'
            + '<button id="rankingCSV" class="btn" style="font-size:0.8em; padding:0.25rem 0.7rem;">⬇ CSV</button>'
            + '<button id="rankingActualizar" class="btn" style="font-size:0.8em; padding:0.25rem 0.7rem;">↻ Actualizar</button></span></div>'
            + '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin:0 0 0.5rem;">'
            + '<input id="rankingFiltro" class="input" placeholder="filtrar por nombre o editorial…" value="' + esc(v.filtro) + '" style="flex:2; min-width:180px; font-size:0.85em; padding:0.3rem 0.5rem;">'
            + '<select id="rankingArea" class="input" style="flex:2; min-width:180px; font-size:0.85em; padding:0.3rem 0.5rem;"><option value="">Todas las subáreas</option>'
            + areas.map(a => '<option value="' + esc(a) + '"' + (v.area === a ? ' selected' : '') + '>' + esc(a) + '</option>').join('') + '</select>'
            + '<select id="rankingTipo" class="input" style="flex:1; min-width:130px; font-size:0.85em; padding:0.3rem 0.5rem;">'
            + '<option value="">Todo tipo</option><option value="emp"' + (v.tipo === 'emp' ? ' selected' : '') + '>Solo empíricas</option>'
            + '<option value="rev"' + (v.tipo === 'rev' ? ' selected' : '') + '>Solo revisión 📖</option></select>'
            + '<select id="rankingTop" class="input" style="flex:0 0 auto; font-size:0.85em; padding:0.3rem 0.5rem;">'
            + [30, 50, 100].map(n => '<option value="' + n + '"' + (v.top === n ? ' selected' : '') + '>Top ' + n + '</option>').join('') + '</select></div>'
            + '<div style="max-height:420px; overflow:auto; border-radius:8px;">'
            + '<table style="width:100%; border-collapse:collapse; font-size:0.82em;">'
            + '<thead><tr style="color:#fbbf24; text-align:left; position:sticky; top:0; background:var(--color-bg-card, #10182b); z-index:1;">'
            + '<th style="padding:0.35rem 0.5rem; text-align:right;">#</th><th style="padding:0.35rem 0.5rem;">Revista</th>'
            + th('citeScore', 'CiteScore', 'right') + '<th style="padding:0.35rem 0.5rem; text-align:center;">Cuartil</th>'
            + th('percentil', 'Percentil', 'right') + th('sjr', 'SJR', 'right') + th('snip', 'SNIP', 'right')
            + '<th style="padding:0.35rem 0.5rem;">Editorial</th><th style="padding:0.35rem 0.5rem;">ISSN</th><th style="padding:0.35rem 0.5rem;">Enlaces</th>'
            + '</tr></thead><tbody>' + filasHTML + '</tbody></table></div>'
            + '<div style="font-size:0.72em; color:var(--color-text-soft, #8b93a7); margin-top:0.4rem;">Cuartil y percentil: del año <i>Complete</i> y solo de categorías de psicología (ASJC 32xx), tomando el mejor. 📖 = revista de revisión/síntesis: publican pocos artículos que todo el mundo cita como marco teórico, por eso su CiteScore aplasta al de las revistas empíricas (Annual Review ~55 vs. una empírica top ~10-16) — compara peras con peras usando el filtro de tipo. 🔓 = acceso abierto. El nombre enlaza al perfil en Scopus.</div>'
            + '</details>';

        const oir = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
        oir('rankingActualizar', 'click', (e) => { e.preventDefault(); e.target.textContent = '⏳'; this.cargar(true); });
        oir('rankingCSV', 'click', (e) => { e.preventDefault(); this._csv(); });
        oir('rankingFiltro', 'input', (e) => { v.filtro = e.target.value; this._renderConservandoFoco('rankingFiltro'); });
        oir('rankingArea', 'change', (e) => { v.area = e.target.value; this._render(); });
        oir('rankingTipo', 'change', (e) => { v.tipo = e.target.value; this._render(); });
        oir('rankingTop', 'change', (e) => { v.top = parseInt(e.target.value, 10) || 30; this._render(); });
        c.querySelectorAll('th[data-orden]').forEach(el => el.addEventListener('click', () => {
            const k = el.getAttribute('data-orden');
            if (v.orden === k) v.asc = !v.asc; else { v.orden = k; v.asc = false; }
            this._render();
        }));
        const det = document.getElementById('rankingDetalles');
        if (det) det.addEventListener('toggle', () => {
            try { localStorage.setItem(this._CLAVE + '_plegado', det.open ? '0' : '1'); } catch (e) { }
        });
    },

    // Repintar sin perder el foco ni el cursor del campo de filtro.
    _renderConservandoFoco(id) {
        const el = document.getElementById(id);
        const pos = el ? el.selectionStart : 0;
        this._render();
        const el2 = document.getElementById(id);
        if (el2) { el2.focus(); try { el2.setSelectionRange(pos, pos); } catch (e) { } }
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
