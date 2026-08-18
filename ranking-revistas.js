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
    _CLAVE: 'statsim_ranking_psyc_v5', // la caché v4 (cobertura de UNA página por confiar en totalResults) se ignora sola
    _TTL: 7 * 86400000,          // 7 días: los datos son anuales
    _VENTANA: 4,                 // páginas en paralelo

    // ---------- estado de la vista (orden, filtros, profundidad) ----------
    _datos: null,                // { t, filas, total, parcial }
    _vista: { orden: 'citeScore', asc: false, top: 30, area: '', tipo: '', filtro: '' },

    // ---------- red ----------
    _url(start, count, key) {
        return 'https://api.elsevier.com/content/serial/title?subj=' + this.SUBJ
            + (this._contentJournal ? '&content=journal' : '') // SOLO revistas; si el API rechazara el parámetro, se desactiva solo
            + '&count=' + count + '&start=' + start
            + '&view=CITESCORE&httpAccept=application/json&apiKey=' + key;
    },

    _validar(txt) {
        let d; try { d = JSON.parse(txt); } catch (e) { return null; }
        const meta = d['serial-metadata-response'];
        if (!meta || !Array.isArray(meta.entry)) return null;
        return { entradas: meta.entry, total: parseInt((meta['opensearch:totalResults']) || '0', 10) };
    },

    // Espaciador GLOBAL: la concurrencia (ventana 4) no limita el ritmo; esto
    // sí — un disparo cada ≥180 ms ⇒ ~5,5 req/s, bajo el techo de 6 req/s.
    _contentJournal: true, // fail-safe: se apaga si Elsevier devolviera 4xx por el parámetro
    _ESPACIADO_MS: 180,
    _proximoDisparo: 0,
    async _espaciar() {
        const ahora = Date.now();
        const espera = Math.max(0, this._proximoDisparo - ahora);
        this._proximoDisparo = Math.max(ahora, this._proximoDisparo) + this._ESPACIADO_MS;
        if (espera) await new Promise(r => setTimeout(r, espera));
    },

    async _fetchDirecto(url) {
        await this._espaciar();
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
                        throw Object.assign(new Error('clave/cuota rechazada por Elsevier (HTTP' + r.status + ')'), { cuota: true });
                    }
                    if (r.ok) { const v = this._validar(await r.text()); if (v) return v; }
                    // 5xx y demás: fallo de ESTA página (reintentable), no de la clave.
                    throw Object.assign(new Error('HTTP' + r.status + ' de Elsevier'), { estadoHTTP: r.status });
                } catch (e) {
                    if (e && (e.cuota || e.estadoHTTP)) throw e;
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
        // Tipo REAL del serial según Scopus: aunque content=journal fallara o
        // mintiera, las series de libros y actas quedan fuera aquí.
        const tipoFuente = String(entry['prism:aggregationType'] || '').toLowerCase();
        if (tipoFuente && tipoFuente !== 'journal') return null;
        const cs = entry.citeScoreYearInfoList || {};
        const anioCS = String(cs.citeScoreCurrentMetricYear || '');
        // SJR/SNIP son SERIES por año: elegir el del año del CiteScore, o el más
        // reciente — jamás [0] a ciegas (podría ser el más antiguo de la serie).
        const elegirMetrica = (lista) => {
            if (!Array.isArray(lista) || !lista.length) return null;
            const delAnio = lista.find(x => String(x['@year'] || '') === anioCS);
            if (delAnio) return delAnio['$'];
            let mejor = lista[0];
            for (const x of lista) { if (parseInt(x['@year'], 10) > parseInt(mejor['@year'], 10)) mejor = x; }
            return mejor['$'];
        };
        const sjr = elegirMetrica(entry.SJRList && entry.SJRList.SJR);
        const snip = elegirMetrica(entry.SNIPList && entry.SNIPList.SNIP);
        // Percentil: ESTRICTAMENTE del año Complete que coincide con el CiteScore
        // mostrado. Sin coincidencia ⇒ «—»: mejor un hueco honesto que una métrica
        // de otro año sin avisar. (SJR/SNIP sí caen al año más reciente: son
        // informativas y varían lento; el cuartil DECIDE, y no se mezcla.)
        let percentil = null;
        const aniosInfo = (cs.citeScoreYearInfo || []).filter(a => String(a['@status'] || '').toLowerCase() === 'complete');
        const preferidos = aniosInfo.filter(a => String(a['@year'] || '') === anioCS);
        for (const a of preferidos) {
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
        const areasPsic = (entry['subject-area'] || [])
            .filter(s => String(s['@code'] || '').startsWith('32'))
            .map(s => s['$'] || '').filter(Boolean);
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
            anioCS,
            sjr: sjr != null ? parseFloat(sjr) : null,
            snip: snip != null ? parseFloat(snip) : null,
            percentil, cuartil,
            areas: areasPsic, // SOLO subáreas de psicología: el filtro no debe ofrecer aeroespacial
            linkScopus: sourceId ? 'https://www.scopus.com/sourceid/' + sourceId : '',
            linkScimago: sourceId ? 'https://www.scimagojr.com/journalsearch.php?q=' + sourceId + '&tip=sid' : ''
        };
    },

    // ---------- carga completa: TODO el área, en paralelo ----------
    // LECCIÓN (bug real de producción): el 'opensearch:totalResults' del listado
    // por materia puede faltar o mentir a la baja — confiar en él dejó el ranking
    // en UNA página (~200 títulos alfabéticos: por eso AMPPS entraba con la «A»
    // y Psychological Science jamás con la «P»). Ahora el total SOLO decora el
    // progreso: el fin real lo marca una página corta o vacía, con techo de
    // seguridad, y los trabajadores reclaman páginas hasta encontrarlo.
    _TECHO_TITULOS: 4000,

    async _traerRanking(alProgresar) {
        let primera;
        try { primera = await this._traerPagina(0, 200); }
        catch (e) {
            // Si el rechazo pudo venir del parámetro content, reintentar sin él.
            if (this._contentJournal && e && e.estadoHTTP && e.estadoHTTP < 500) { this._contentJournal = false; primera = await this._traerPagina(0, 200); }
            else throw e;
        }
        if (!primera.entradas.length) throw new Error('Elsevier devolvió una primera página vacía');
        const porPagina = primera.entradas.length;   // el count real que sirve el API
        let totalDeclarado = primera.total || 0;     // orientativo: puede faltar o mentir
        const lotes = [primera.entradas];            // lotes[p] = entradas · null = pendiente/fallo
        let finAlcanzado = primera.entradas.length < 200; // primera ya corta ⇒ no hay más
        let fallos = 0, leidas = 1, siguiente = 1;
        this._stopCuota = false;

        const estimadas = () => totalDeclarado
            ? Math.min(Math.ceil(totalDeclarado / porPagina), Math.ceil(this._TECHO_TITULOS / porPagina))
            : 0;
        if (alProgresar) alProgresar(leidas, estimadas());

        const trabajador = async () => {
            while (!this._stopCuota && !finAlcanzado) {
                const p = siguiente++;
                const start = p * porPagina;
                if (start >= this._TECHO_TITULOS) { finAlcanzado = true; break; } // techo de seguridad
                let entradas = null; // null = fallo (≠ [] = fin natural)
                for (let intento = 0; intento < 2; intento++) {
                    try {
                        const r = await this._traerPagina(start, porPagina);
                        entradas = r.entradas;
                        if (!totalDeclarado && r.total) totalDeclarado = r.total;
                        break;
                    } catch (e) {
                        if (e && e.cuota) { this._stopCuota = true; fallos++; break; } // cuota: parar TODO
                        if (intento === 1) fallos++; // 5xx u otros: 1 reintento; el hueco queda anotado
                    }
                }
                lotes[p] = entradas || [];
                leidas++;
                // Fin NATURAL solo si la página llegó (no falló) y vino corta o vacía.
                if (entradas && entradas.length < porPagina) finAlcanzado = true;
                if (alProgresar) alProgresar(leidas, estimadas());
            }
        };
        await Promise.all(Array.from({ length: this._VENTANA }, trabajador));
        if (this._stopCuota) fallos = Math.max(fallos, 1);

        const filas = [];
        let excluidas = 0;
        const vistos = new Set(); // por si el API repitiera páginas: cada revista UNA vez
        lotes.forEach(l => (l || []).forEach(e => {
            const f = this._fila(e);
            if (!f) return;                    // no-revistas (series, actas): ni cuentan
            const clave = f.linkScopus || f.titulo.toLowerCase();
            if (vistos.has(clave)) return;
            vistos.add(clave);
            if (f.citeScore > 0) filas.push(f); else excluidas++;
        }));
        filas.sort((a, b) => b.citeScore - a.citeScore);
        return { filas, total: totalDeclarado || (filas.length + excluidas), parcial: fallos > 0, excluidas };
    },

    // ---------- caché (solo cobertura completa) ----------
    _leerCache() {
        try {
            const g = JSON.parse(localStorage.getItem(this._CLAVE) || 'null');
            if (g && Array.isArray(g.filas) && g.filas.length && g.parcial !== true) return g;
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
                if (!cache) this._estado('Cargando el ranking… página ' + h + (t ? ' de ~' + t : '…'));
            });
            if (!r.filas.length) { if (!cache) this._estado('No se pudo obtener el ranking (sin datos).'); else this._render(); return; }
            const nuevo = { t: Date.now(), filas: r.filas, total: r.total, parcial: r.parcial, excluidas: r.excluidas || 0 };
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
            const x = a[k], y = b[k];
            const vacioX = x == null || x === '', vacioY = y == null || y === '';
            if (vacioX && vacioY) return 0;
            if (vacioX) return 1;  // los «—» siempre al fondo, suba o baje el orden
            if (vacioY) return -1;
            if (typeof x === 'string') return v.asc ? x.localeCompare(y) : y.localeCompare(x);
            return v.asc ? x - y : y - x;
        });
        return filas;
    },

    _csv() {
        const esc = s => '"' + String(s == null ? '' : s).replace(/"/g, '""').replace(/[\r\n]+/g, ' ') + '"';
        const filas = this._filasVisibles();
        const cab = ['#', 'Revista', 'Tipo', 'CiteScore', 'Cuartil', 'Percentil', 'SJR', 'SNIP', 'Editorial', 'Acceso abierto', 'ISSN', 'Áreas', 'Scopus', 'SCImago'];
        const cuerpo = filas.map((f, i) => [i + 1, f.titulo, f.esRevision ? 'Revisión (heurística)' : 'No revisión detectada', f.citeScore,
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
        const anioTitulo = (this._datos.filas.find(f => f.anioCS) || {}).anioCS || '';
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
                + '<td style="padding:0.35rem 0.5rem; white-space:nowrap;">'
                + (((f.linkScopus ? '<a href="' + f.linkScopus + '" target="_blank" rel="noopener" style="color:#7dd3fc;">Scopus</a>' : '')
                + (f.linkScopus && f.linkScimago ? ' · ' : '')
                + (f.linkScimago ? '<a href="' + f.linkScimago + '" target="_blank" rel="noopener" style="color:#7dd3fc;">SCImago</a>' : '')) || '—') + '</td>'
                + '</tr>';
        }).join('');

        c.innerHTML = ''
            + '<details ' + (localStorage.getItem(this._CLAVE + '_plegado') === '1' ? '' : 'open') + ' id="rankingDetalles" style="border:1px solid var(--color-border, #39415a); border-radius:10px; padding:0.6rem 1rem; margin:0 0 0.9rem;">'
            + '<summary style="cursor:pointer; color:#fbbf24; font-weight:600; font-size:0.95em;">🏆 Ranking de revistas de Psicología — CiteScore ' + esc(anioTitulo) + ' (Scopus · área PSYC completa)</summary>'
            + (aviso ? '<div style="font-size:0.78em; color:#fbbf24; margin:0.4rem 0 0;">' + esc(aviso) + '</div>' : '')
            + (this._datos.parcial ? '<div style="font-size:0.78em; color:#f97316; margin:0.4rem 0 0;">⚠️ Cobertura parcial en esta carga (alguna página falló): el ranking se muestra pero NO se guardó en caché.</div>' : '')
            + '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin:0.5rem 0;">'
            + '<span style="font-size:0.78em; color:var(--color-text-soft, #8b93a7);">Top ' + filas.length + ' de ' + this._datos.filas.length + ' revistas con métrica · Scopus lista ' + (this._datos.total || '¿?') + ' títulos en PSYC (' + (this._datos.excluidas || 0) + ' sin CiteScore vigente excluidos) · CiteScore anual (junio) · actualizado ' + fecha + '</span>'
            + '<span style="display:flex; gap:0.4rem; flex-wrap:wrap;">'
            + '<button id="rankingCSV" class="btn" style="font-size:0.8em; padding:0.25rem 0.7rem;">⬇ CSV</button>'
            + '<button id="rankingActualizar" class="btn" style="font-size:0.8em; padding:0.25rem 0.7rem;">↻ Actualizar</button></span></div>'
            + '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin:0 0 0.5rem;">'
            + '<input id="rankingFiltro" class="input" placeholder="filtrar por nombre o editorial…" value="' + esc(v.filtro) + '" style="flex:2; min-width:180px; font-size:0.85em; padding:0.3rem 0.5rem;">'
            + '<select id="rankingArea" class="input" style="flex:2; min-width:180px; font-size:0.85em; padding:0.3rem 0.5rem;"><option value="">Todas las subáreas</option>'
            + areas.map(a => '<option value="' + esc(a) + '"' + (v.area === a ? ' selected' : '') + '>' + esc(a) + '</option>').join('') + '</select>'
            + '<select id="rankingTipo" class="input" style="flex:1; min-width:130px; font-size:0.85em; padding:0.3rem 0.5rem;">'
            + '<option value="">Todo tipo</option><option value="emp"' + (v.tipo === 'emp' ? ' selected' : '') + '>Ocultar revisiones 📖</option>'
            + '<option value="rev"' + (v.tipo === 'rev' ? ' selected' : '') + '>Solo revisión 📖</option></select>'
            + '<select id="rankingTop" class="input" style="flex:0 0 auto; font-size:0.85em; padding:0.3rem 0.5rem;">'
            + [30, 50, 100].map(n => '<option value="' + n + '"' + (v.top === n ? ' selected' : '') + '>Top ' + n + '</option>').join('') + '</select></div>'
            + '<div style="max-height:420px; overflow:auto; border-radius:8px;">'
            + '<table style="width:100%; border-collapse:collapse; font-size:0.82em;">'
            + '<thead><tr style="color:#fbbf24; text-align:left; position:sticky; top:0; background:var(--color-bg-card, #10182b); z-index:1;">'
            + '<th style="padding:0.35rem 0.5rem; text-align:right;">#</th>' + th('titulo', 'Revista')
            + th('citeScore', 'CiteScore', 'right') + th('cuartil', 'Cuartil', 'center')
            + th('percentil', 'Percentil', 'right') + th('sjr', 'SJR', 'right') + th('snip', 'SNIP', 'right')
            + '<th style="padding:0.35rem 0.5rem;">Editorial</th><th style="padding:0.35rem 0.5rem;">ISSN</th><th style="padding:0.35rem 0.5rem;">Enlaces</th>'
            + '</tr></thead><tbody>' + filasHTML + '</tbody></table></div>'
            + '<div style="font-size:0.72em; color:var(--color-text-soft, #8b93a7); margin-top:0.4rem;">Cuartil y percentil: del año <i>Complete</i> y solo de categorías de psicología (ASJC 32xx), tomando el mejor. 📖 = revista de revisión/síntesis: publican pocos artículos que todo el mundo cita como marco teórico, por eso su CiteScore aplasta al de las revistas empíricas (Annual Review ~55 vs. una empírica top ~10-16) — compara peras con peras usando el filtro de tipo. 🔓 = acceso abierto. El nombre enlaza al perfil en Scopus. Solo se listan revistas (content=journal) con CiteScore vigente: fuera series de libros, actas y títulos descontinuados. La marca 📖 es una heurística por el nombre, no un metadato de Scopus.</div>'
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

    // Diagnóstico desde la consola del navegador:
    //   RankingRevistas.buscarTitulo('psychological science')
    // Pregunta a Scopus por título y muestra tipo, códigos de área, CiteScore y
    // si esa revista está dentro del ranking cargado — zanja cualquier ausencia.
    async buscarTitulo(titulo) {
        const key = (typeof ScopusDirecto !== 'undefined') ? ScopusDirecto._siguienteKey() : '';
        const url = 'https://api.elsevier.com/content/serial/title?title=' + encodeURIComponent(titulo)
            + '&view=CITESCORE&httpAccept=application/json&count=10&apiKey=' + key;
        const r = await fetch(url);
        const v = this._validar(await r.text());
        if (!v) { console.log('Sin respuesta legible de Elsevier (HTTP' + r.status + ')'); return 0; }
        v.entradas.forEach(e => console.log(
            (e['dc:title'] || '?')
            + '\n  tipo=' + (e['prism:aggregationType'] || '¿?')
            + ' · áreas=' + ((e['subject-area'] || []).map(s => (s['@code'] || '?') + ':' + (s['@abbrev'] || '')).join(', '))
            + ' · CiteScore=' + (((e.citeScoreYearInfoList || {}).citeScoreCurrentMetric) || '—')
            + ' · ¿en el ranking cargado?: ' + (this._datos && this._datos.filas.some(f => f.titulo === e['dc:title']) ? 'SÍ' : 'NO')));
        return v.entradas.length;
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
