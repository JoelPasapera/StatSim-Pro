// ========================================
// BUSCADOR DE ANTECEDENTES v2 — módulo especializado multi-fuente.
// Consulta EN PARALELO tres APIs académicas abiertas (sin claves, CORS ok):
//   · Semantic Scholar — ranking semántico (lo más cercano a Google Académico)
//   · OpenAlex         — cobertura masiva, filtros de idioma/fecha
//   · Crossref         — metadatos editoriales de revistas
// Luego FUSIONA (deduplicación por DOI/título), RE-RANKEA localmente
// (coincidencias en título ≫ resumen, bonus de frase, idioma y citas) y
// sugiere SINÓNIMOS para términos atípicos. Sin Google Scholar embebido:
// CORS lo impide a nivel de navegador; se ofrece como pestaña externa.
// ========================================

const Antecedentes = {

    CONFIG: {
        POR_FUENTE: 25,
        RECORTE_RESUMEN: 350,
        MAILTO: '',
        SINONIMOS: {
            'inteligencia cognitiva': ['cognitive ability', 'intelligence', 'capacidad cognitiva', 'habilidades cognitivas'],
            'inteligencia emocional': ['emotional intelligence', 'competencias emocionales'],
            'autoestima': ['self-esteem'], 'ansiedad': ['anxiety'], 'depresion': ['depression'],
            'estres academico': ['academic stress'], 'rendimiento academico': ['academic performance', 'academic achievement'],
            'memoria de trabajo': ['working memory'], 'funciones ejecutivas': ['executive functions'],
            'bienestar psicologico': ['psychological well-being'], 'motivacion': ['motivation'],
            'agresividad': ['aggression'], 'habilidades sociales': ['social skills'],
            'adiccion a redes sociales': ['social media addiction', 'problematic internet use']
        }
    },

    _seleccion: new Map(),
    _obras: [],

    // ---------- utilidades ----------
    _norm(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    },

    sinonimosDe(query) {
        return this.CONFIG.SINONIMOS[this._norm(query)] || [];
    },

    // Puntaje local de relevancia: título ≫ resumen; frase completa en título
    // vale doble; idioma preferido y citas (log) desempatan.
    puntuar(obra, query, idiomaPref) {
        const q = this._norm(query), toks = q.split(' ').filter(t => t.length > 2);
        const t = this._norm(obra.titulo), r = this._norm(obra.resumen);
        let s = 0;
        toks.forEach(tok => { if (t.includes(tok)) s += 3; else if (r.includes(tok)) s += 1; });
        if (toks.length > 1 && t.includes(q)) s += 8;
        else if (toks.length > 1 && r.includes(q)) s += 3;
        // Citas e idioma solo DESEMPATAN entre obras ya pertinentes: sin
        // coincidencia léxica alguna, la obra queda fuera (score 0).
        if (s > 0) {
            if (idiomaPref && obra.idioma === idiomaPref) s += 2;
            s += Math.log10(1 + (obra.citas || 0));
        }
        return s;
    },

    fusionar(listas, query, idiomaPref) {
        // Índice DOBLE (por DOI y por título normalizado): así se reconoce la
        // misma obra aunque una fuente traiga DOI y otra no.
        const vistos = new Map();
        const kDoi = o => o.doi ? o.doi.replace(/^https?:\/\/doi\.org\//, '').toLowerCase() : '';
        listas.flat().forEach(o => {
            const kd = kDoi(o), kt = this._norm(o.titulo);
            const previo = (kd && vistos.get('d:' + kd)) || vistos.get('t:' + kt);
            if (!previo) {
                if (kd) vistos.set('d:' + kd, o);
                vistos.set('t:' + kt, o);
            } else {
                if (!previo.resumen && o.resumen) previo.resumen = o.resumen;
                if (!previo.doi && o.doi) { previo.doi = o.doi; vistos.set('d:' + kDoi(previo), previo); }
                previo.citas = Math.max(previo.citas || 0, o.citas || 0);
                previo.fuentesAPI = [...new Set([...(previo.fuentesAPI || []), ...(o.fuentesAPI || [])])];
            }
        });
        return [...new Set(vistos.values())]
            .map(o => (o._score = this.puntuar(o, query, idiomaPref), o))
            .filter(o => o._score > 0)
            .sort((a, b) => b._score - a._score);
    },

    // ---------- fuentes ----------
    reconstruirAbstract(inv) {
        if (!inv) return '';
        const pares = [];
        Object.entries(inv).forEach(([w, pos]) => pos.forEach(p => pares.push([p, w])));
        return pares.sort((a, b) => a[0] - b[0]).map(p => p[1]).join(' ');
    },

    urlOpenAlex(query, f = {}) {
        let q = String(query).replace(/,/g, ' ').trim();
        const filtros = [`title_and_abstract.search:${q}`, 'type:article'];
        if (f.desde) filtros.push(`from_publication_date:${f.desde}-01-01`);
        if (f.idioma) filtros.push(`language:${f.idioma}`);
        const p = new URLSearchParams({ filter: filtros.join(','), sort: 'relevance_score:desc', 'per-page': String(this.CONFIG.POR_FUENTE) });
        if (this.CONFIG.MAILTO) p.set('mailto', this.CONFIG.MAILTO);
        return `https://api.openalex.org/works?${p.toString()}`;
    },
    normOpenAlex(o) {
        const b = o.biblio || {};
        return {
            titulo: o.title || o.display_name || '(sin título)',
            autores: (o.authorships || []).map(a => a.author && a.author.display_name).filter(Boolean),
            anio: o.publication_year || 's. f.', doi: o.doi || '',
            fuente: (o.primary_location && o.primary_location.source && o.primary_location.source.display_name) || '',
            volumen: b.volume || '', numero: b.issue || '',
            paginas: (b.first_page && b.last_page) ? `${b.first_page}-${b.last_page}` : (b.first_page || ''),
            citas: o.cited_by_count || 0, idioma: o.language || '',
            resumen: this.reconstruirAbstract(o.abstract_inverted_index), fuentesAPI: ['OpenAlex']
        };
    },

    urlSemantic(query, f = {}) {
        const p = new URLSearchParams({
            query, limit: String(this.CONFIG.POR_FUENTE),
            fields: 'title,abstract,year,authors,externalIds,citationCount,venue,publicationVenue'
        });
        if (f.desde) p.set('year', `${f.desde}-`);
        return `https://api.semanticscholar.org/graph/v1/paper/search?${p.toString()}`;
    },
    normSemantic(o) {
        const doi = o.externalIds && o.externalIds.DOI ? `https://doi.org/${o.externalIds.DOI}` : '';
        return {
            titulo: o.title || '(sin título)',
            autores: (o.authors || []).map(a => a.name).filter(Boolean),
            anio: o.year || 's. f.', doi,
            fuente: o.venue || (o.publicationVenue && o.publicationVenue.name) || '',
            volumen: '', numero: '', paginas: '',
            citas: o.citationCount || 0, idioma: '',
            resumen: o.abstract || '', fuentesAPI: ['SemanticScholar']
        };
    },

    urlCrossref(query, f = {}) {
        const filtros = ['type:journal-article'];
        if (f.desde) filtros.push(`from-pub-date:${f.desde}-01-01`);
        const p = new URLSearchParams({
            'query.bibliographic': query, rows: String(this.CONFIG.POR_FUENTE),
            filter: filtros.join(','),
            select: 'DOI,title,author,issued,container-title,volume,issue,page,is-referenced-by-count,abstract'
        });
        if (this.CONFIG.MAILTO) p.set('mailto', this.CONFIG.MAILTO);
        return `https://api.crossref.org/works?${p.toString()}`;
    },
    normCrossref(o) {
        const anio = o.issued && o.issued['date-parts'] && o.issued['date-parts'][0] ? o.issued['date-parts'][0][0] : 's. f.';
        return {
            titulo: (o.title && o.title[0]) || '(sin título)',
            autores: (o.author || []).map(a => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean),
            anio, doi: o.DOI ? `https://doi.org/${o.DOI}` : '',
            fuente: (o['container-title'] && o['container-title'][0]) || '',
            volumen: o.volume || '', numero: o.issue || '', paginas: o.page || '',
            citas: o['is-referenced-by-count'] || 0, idioma: '',
            resumen: String(o.abstract || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            fuentesAPI: ['Crossref']
        };
    },

    async _fetchJSON(url) {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
    },

    async buscarMulti(query, f = {}) {
        const tareas = [
            this._fetchJSON(this.urlSemantic(query, f)).then(d => (d.data || []).map(x => this.normSemantic(x))),
            this._fetchJSON(this.urlOpenAlex(query, f)).then(d => (d.results || []).map(x => this.normOpenAlex(x))),
            this._fetchJSON(this.urlCrossref(query, f)).then(d => ((d.message && d.message.items) || []).map(x => this.normCrossref(x)))
        ];
        const res = await Promise.allSettled(tareas);
        const listas = res.filter(r => r.status === 'fulfilled').map(r => r.value);
        const caidas = res.filter(r => r.status === 'rejected').length;
        if (!listas.length) throw new Error('ninguna fuente respondió');
        return { obras: this.fusionar(listas, query, f.idioma), fuentesOK: listas.length, caidas };
    },

    urlScholar(query, f = {}) {
        const p = new URLSearchParams({ q: query, hl: 'es' });
        if (f.desde) p.set('as_ylo', String(f.desde));
        return `https://scholar.google.com/scholar?${p.toString()}`;
    },

    // ---------- APA 7 ----------
    _autorAPA(nombre) {
        const partes = nombre.trim().split(/\s+/);
        if (partes.length === 1) return partes[0];
        const apellido = partes[partes.length - 1];
        const ini = partes.slice(0, -1).map(p => p[0].toUpperCase() + '.').join(' ');
        return `${apellido}, ${ini}`;
    },
    _autoresAPA(autores) {
        const a = autores.map(n => this._autorAPA(n));
        if (!a.length) return '';
        if (a.length === 1) return a[0];
        if (a.length === 2) return `${a[0]} & ${a[1]}`;
        if (a.length <= 20) return `${a.slice(0, -1).join(', ')}, & ${a[a.length - 1]}`;
        return `${a.slice(0, 19).join(', ')}, ... ${a[a.length - 1]}`;
    },
    citaAPA(o) {
        let c = `${this._autoresAPA(o.autores)} (${o.anio}). ${o.titulo}.`;
        if (o.fuente) {
            c += ` <i>${o.fuente}</i>`;
            if (o.volumen) c += `, <i>${o.volumen}</i>${o.numero ? `(${o.numero})` : ''}`;
            if (o.paginas) c += `, ${o.paginas}`;
            c += '.';
        }
        // APA 7: cerrar con el DOI; si no hay DOI, con la URL de acceso disponible.
        if (o.doi) c += ` ${o.doi}`;
        else if (o.link) c += ` ${o.link}`;
        return c;
    },

    // ---------- interfaz ----------
    montar() {
        let cont = document.getElementById('seccionAntecedentes');
        if (!cont) {
            cont = document.createElement('div');
            cont.id = 'seccionAntecedentes';
            const ancla = document.querySelector('footer');
            (ancla ? ancla.parentNode : document.body).insertBefore(cont, ancla || null);
        }
        const sugerida = window.ultimoAnalisis ? `${window.ultimoAnalisis.et1} ${window.ultimoAnalisis.et2}` : '';
        cont.innerHTML = `
        <div class="card" style="margin-top:1.5rem;">
          <details>
            <summary style="cursor:pointer;"><strong>📚 Buscador de Antecedentes</strong>
              — 3 bases académicas en paralelo, referencias APA y matriz de antecedentes</summary>
            <div style="margin-top:1rem;">
              <div class="form-row">
                <div class="form-group" style="flex:2;">
                  <label class="label">Términos de búsqueda</label>
                  <input type="text" id="antQuery" class="input" value="${sugerida}"
                    placeholder="Ej: inteligencia emocional rendimiento académico">
                  <div id="antSinonimos" class="help-text" style="margin-top:0.35rem;"></div>
                </div>
                <div class="form-group"><label class="label">Desde el año</label>
                  <input type="number" id="antDesde" class="input" value="${new Date().getFullYear() - 5}"></div>
                <div class="form-group"><label class="label">Priorizar idioma</label>
                  <select id="antIdioma" class="input"><option value="">Indistinto</option>
                  <option value="es" selected>Español</option><option value="en">Inglés</option></select></div>
                <div class="form-group"><label class="label">Resultados (Scholar)</label>
                  <select id="antCantidad" class="input"><option value="1">10 (rápido)</option>
                  <option value="2" selected>20</option><option value="3">30 (más lento)</option></select></div>
              </div>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.4rem;">
                <input type="checkbox" id="antUsarScholar" checked> Intentar Google Académico directo (experimental, vía proxy)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarScopus"> Buscar en Scopus (Elsevier, vía proxy)
              </label><br>
              <button id="antBuscar" class="btn btn-primary">🔎 Buscar</button>
              <button id="antScholar" class="btn btn-outline">↗ Abrir en Google Académico</button>
              <div id="antEstado" class="help-text" style="margin-top:0.5rem;"></div>
              <div id="antResultados"></div>
              <div id="antSeleccion"></div>
            </div>
          </details>
        </div>`;
        document.getElementById('antBuscar').addEventListener('click', () => this._onBuscar());
        document.getElementById('antScholar').addEventListener('click', () => {
            const q = document.getElementById('antQuery').value.trim();
            if (q) window.open(this.urlScholar(q, { desde: document.getElementById('antDesde').value }), '_blank');
        });
        document.getElementById('antQuery').addEventListener('input', () => this._renderSinonimos());
        this._renderSinonimos();
    },

    _renderSinonimos() {
        const q = document.getElementById('antQuery').value;
        const sin = this.sinonimosDe(q);
        const cont = document.getElementById('antSinonimos');
        cont.innerHTML = sin.length
            ? 'Prueba también: ' + sin.map(s =>
                `<a href="#" data-s="${s}" style="margin-right:0.6rem;">${s}</a>`).join('')
            : '';
        cont.querySelectorAll('a').forEach(a => a.addEventListener('click', e => {
            e.preventDefault();
            document.getElementById('antQuery').value = e.target.dataset.s;
            this._onBuscar();
        }));
    },

    async _onBuscar() {
        const estado = document.getElementById('antEstado');
        const q = document.getElementById('antQuery').value.trim();
        if (!q) { estado.textContent = 'Escribe términos de búsqueda.'; return; }
        estado.textContent = 'Consultando Semantic Scholar + OpenAlex + Crossref…';
        try {
            const f = { desde: document.getElementById('antDesde').value, idioma: document.getElementById('antIdioma').value };
            if (document.getElementById('antUsarScopus') && document.getElementById('antUsarScopus').checked && typeof ScopusDirecto !== 'undefined') {
                estado.textContent = 'Consultando Scopus (Elsevier)…';
                try {
                    const { obras, key, proxy } = await ScopusDirecto.buscar(q, f);
                    this._obras = obras;
                    estado.textContent = `${obras.length} resultados de Scopus (clave ${key}, proxy ${proxy}). Marca los pertinentes:`;
                    this._renderResultados(this._obras);
                    return;
                } catch (e) {
                    estado.textContent = `Scopus no respondió (${e.message}). Probando otras fuentes…`;
                }
            }
            if (document.getElementById('antUsarScholar') && document.getElementById('antUsarScholar').checked && typeof ScholarDirecto !== 'undefined') {
                estado.textContent = 'Intentando Google Académico vía proxy (puede tardar)…';
                try {
                    const maxPag = parseInt((document.getElementById('antCantidad') || {}).value || '2', 10);
                    if (maxPag > 1) estado.textContent = `Buscando en Google Académico (hasta ${maxPag} páginas, con pausas para evitar bloqueos)…`;
                    const { obras, proxiesUsados, paginas, captchaEn } = await ScholarDirecto.buscarPaginado(q, f.desde, maxPag);
                    if (!obras.length) throw new Error(captchaEn ? 'CAPTCHA inmediato' : 'sin resultados');
                    this._obras = obras.map(o => ({ ...o, link: o.link || '', autores: o.autoresRaw ? o.autoresRaw.split(/,\s*/) : [] }));
                    const aviso = captchaEn ? ` (Scholar bloqueó desde la página ${captchaEn}; se muestran las anteriores)` : '';
                    estado.textContent = `${obras.length} resultados de Google Académico — ${paginas} página(s)${aviso}. Marca los pertinentes:`;
                    this._renderResultados(this._obras);
                    return;
                } catch (e) {
                    estado.textContent = `Google Académico no respondió (${e.message}). Usando las 3 bases académicas como alternativa…`;
                }
            }
            const { obras, fuentesOK, caidas } = await this.buscarMulti(q, f);
            this._obras = obras;
            estado.textContent = obras.length
                ? `${obras.length} resultados únicos de ${fuentesOK} bases${caidas ? ` (${caidas} no respondió)` : ''}, ordenados por relevancia local. Marca los pertinentes:`
                : 'Sin resultados relevantes: prueba un sinónimo sugerido o términos en inglés.';
            this._renderResultados(obras);
        } catch (e) {
            estado.textContent = `No se pudo consultar las bases (${e.message}). Verifica tu conexión.`;
        }
    },

    _renderResultados(obras) {
        const filas = obras.map((o, i) => `
            <tr>
              <td><input type="checkbox" data-i="${i}" ${this._seleccion.has(this._norm(o.titulo)) ? 'checked' : ''}></td>
              <td>${o.autores.slice(0, 3).join('; ')}${o.autores.length > 3 ? ' et al.' : ''} (${o.anio})</td>
              <td>${(o.link || o.doi) ? `<a href="${o.link || o.doi}" target="_blank">${o.titulo}</a>` : o.titulo}</td>
              <td>${o.fuente}</td><td>${o.citas}</td>
              <td>${(o.link || o.doi) ? `<a href="${o.link || o.doi}" target="_blank" title="Abrir artículo">🔗</a>` : '—'}</td>
              <td style="font-size:0.8em;color:#888;">${(o.fuentesAPI || []).join('+')}</td>
            </tr>`).join('');
        document.getElementById('antResultados').innerHTML = `
            <div class="table-container" style="margin-top:0.75rem;"><table class="table">
              <thead><tr><th></th><th>Autores (año)</th><th>Título</th><th>Fuente</th><th>Citas</th><th>Enlace</th><th>Base</th></tr></thead>
              <tbody>${filas}</tbody></table></div>`;
        document.getElementById('antResultados').querySelectorAll('input[type=checkbox]').forEach(ch =>
            ch.addEventListener('change', e => {
                const o = this._obras[+e.target.dataset.i];
                const k = this._norm(o.titulo);
                if (e.target.checked) this._seleccion.set(k, o); else this._seleccion.delete(k);
                this._renderSeleccion();
            }));
    },

    _renderSeleccion() {
        const sel = [...this._seleccion.values()];
        const cont = document.getElementById('antSeleccion');
        if (!sel.length) { cont.innerHTML = ''; return; }
        const refs = sel.map(o => this.citaAPA(o)).sort((a, b) => a.localeCompare(b, 'es'));
        const matriz = sel.map(o => `
            <tr><td>${this._autoresAPA(o.autores.slice(0, 3))}${o.autores.length > 3 ? ' et al.' : ''} (${o.anio})</td>
              <td>${(o.link || o.doi) ? `<a href="${o.link || o.doi}" target="_blank">${o.titulo}</a>` : o.titulo}</td>
              <td>${o.resumen ? o.resumen.slice(0, this.CONFIG.RECORTE_RESUMEN) + (o.resumen.length > this.CONFIG.RECORTE_RESUMEN ? '…' : '') : '[REVISAR TEXTO COMPLETO]'}</td>
              <td>[COMPLETAR: relación con tus variables y aporte a tu estudio]</td></tr>`).join('');
        cont.innerHTML = `
            <h4 style="margin-top:1.25rem;">Referencias seleccionadas (APA 7, orden alfabético)</h4>
            <div class="result-box">${refs.map(r => `<p style="margin:0 0 0.5rem;padding-left:2rem;text-indent:-2rem;">${r}</p>`).join('')}</div>
            <h4 style="margin-top:1rem;">Matriz de antecedentes</h4>
            <div class="table-container"><table class="table">
              <thead><tr><th>Autores (año)</th><th>Título</th><th>Resumen</th><th>Aporte al estudio</th></tr></thead>
              <tbody>${matriz}</tbody></table></div>
            <p class="help-text">El resumen proviene de las bases de datos; el «aporte al estudio» es tu análisis: lee los textos antes de citarlos.</p>`;
    }
};

if (typeof window !== 'undefined') {
    window.Antecedentes = Antecedentes;
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => Antecedentes.montar());
    } else {
        Antecedentes.montar();
    }
}
