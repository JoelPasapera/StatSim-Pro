// ========================================
// BUSCADOR DE ANTECEDENTES (Fase A — sin LLM, sin claves, client-side puro)
// Consulta OpenAlex (https://docs.openalex.org), API académica abierta con
// CORS habilitado: títulos, autores, año, DOI, revista, citas y resumen.
// Entrega: tabla filtrable, referencias en APA 7 listas para copiar y una
// matriz de antecedentes con huecos editoriales para el trabajo del tesista.
// Naturaleza del módulo: I/O de red + formateo bibliográfico (no estadística).
// ========================================

const Antecedentes = {

    CONFIG: {
        POR_PAGINA: 25,        // resultados por búsqueda
        MAILTO: '',            // opcional: email para el "polite pool" de OpenAlex
        RECORTE_RESUMEN: 350   // caracteres del resumen en la matriz
    },

    _seleccion: new Map(), // id → obra normalizada

    // ---------- Capa de datos (OpenAlex) ----------

    construirURL(query, filtros = {}) {
        const f = [];
        if (filtros.desde) f.push(`from_publication_date:${filtros.desde}-01-01`);
        if (filtros.idioma) f.push(`language:${filtros.idioma}`);
        f.push('type:article');
        const params = new URLSearchParams({
            search: query,
            'per-page': String(this.CONFIG.POR_PAGINA),
            sort: 'cited_by_count:desc'
        });
        if (f.length) params.set('filter', f.join(','));
        if (this.CONFIG.MAILTO) params.set('mailto', this.CONFIG.MAILTO);
        return `https://api.openalex.org/works?${params.toString()}`;
    },

    // OpenAlex entrega el resumen como índice invertido {palabra: [posiciones]}.
    reconstruirAbstract(inv) {
        if (!inv) return '';
        const pares = [];
        Object.entries(inv).forEach(([palabra, posiciones]) =>
            posiciones.forEach(p => pares.push([p, palabra])));
        return pares.sort((a, b) => a[0] - b[0]).map(p => p[1]).join(' ');
    },

    normalizar(obra) {
        const autores = (obra.authorships || []).map(a => (a.author && a.author.display_name) || '').filter(Boolean);
        const fuente = (obra.primary_location && obra.primary_location.source && obra.primary_location.source.display_name) || '';
        const b = obra.biblio || {};
        return {
            id: obra.id,
            titulo: obra.title || obra.display_name || '(sin título)',
            autores,
            anio: obra.publication_year || 's. f.',
            doi: obra.doi || '',
            fuente,
            volumen: b.volume || '', numero: b.issue || '',
            paginas: (b.first_page && b.last_page) ? `${b.first_page}-${b.last_page}` : (b.first_page || ''),
            citas: obra.cited_by_count || 0,
            idioma: obra.language || '',
            resumen: this.reconstruirAbstract(obra.abstract_inverted_index)
        };
    },

    async buscar(query, filtros) {
        const resp = await fetch(this.construirURL(query, filtros));
        if (!resp.ok) throw new Error(`OpenAlex respondió ${resp.status}`);
        const data = await resp.json();
        return (data.results || []).map(o => this.normalizar(o));
    },

    // ---------- Formato APA 7 ----------

    _autorAPA(nombre) {
        const partes = nombre.trim().split(/\s+/);
        if (partes.length === 1) return partes[0];
        const apellido = partes[partes.length - 1];
        const iniciales = partes.slice(0, -1).map(p => p[0].toUpperCase() + '.').join(' ');
        return `${apellido}, ${iniciales}`;
    },

    _autoresAPA(autores) {
        const a = autores.map(n => this._autorAPA(n));
        if (a.length === 0) return '';
        if (a.length === 1) return a[0];
        if (a.length === 2) return `${a[0]} & ${a[1]}`;
        if (a.length <= 20) return `${a.slice(0, -1).join(', ')}, & ${a[a.length - 1]}`;
        return `${a.slice(0, 19).join(', ')}, ... ${a[a.length - 1]}`; // APA 7: ≥21 autores
    },

    citaAPA(o) {
        let c = `${this._autoresAPA(o.autores)} (${o.anio}). ${o.titulo}.`;
        if (o.fuente) {
            c += ` <i>${o.fuente}</i>`;
            if (o.volumen) c += `, <i>${o.volumen}</i>${o.numero ? `(${o.numero})` : ''}`;
            if (o.paginas) c += `, ${o.paginas}`;
            c += '.';
        }
        if (o.doi) c += ` ${o.doi}`;
        return c;
    },

    // ---------- Interfaz ----------

    montar() {
        let cont = document.getElementById('seccionAntecedentes');
        if (!cont) {
            cont = document.createElement('div');
            cont.id = 'seccionAntecedentes';
            const ancla = document.querySelector('footer');
            (ancla ? ancla.parentNode : document.body).insertBefore(cont, ancla || null);
        }
        const sugerida = (window.ultimoAnalisis)
            ? `${window.ultimoAnalisis.et1} ${window.ultimoAnalisis.et2}` : '';
        cont.innerHTML = `
        <div class="card" style="margin-top: 1.5rem;">
            <details>
                <summary style="cursor:pointer;"><strong>📚 Buscador de Antecedentes</strong>
                    — literatura científica real (OpenAlex), referencias APA y matriz de antecedentes</summary>
                <div style="margin-top: 1rem;">
                    <div class="form-row">
                        <div class="form-group" style="flex:2;">
                            <label class="label">Términos de búsqueda</label>
                            <input type="text" id="antQuery" class="input" value="${sugerida}"
                                placeholder="Ej: emotional intelligence cognitive adolescents">
                            <span class="help-text">Consejo: en inglés hay 10× más resultados. Usa tus variables como punto de partida.</span>
                        </div>
                        <div class="form-group"><label class="label">Desde el año</label>
                            <input type="number" id="antDesde" class="input" value="${new Date().getFullYear() - 5}"></div>
                        <div class="form-group"><label class="label">Idioma</label>
                            <select id="antIdioma" class="input"><option value="">Todos</option>
                            <option value="es">Español</option><option value="en" selected>Inglés</option></select></div>
                    </div>
                    <button id="antBuscar" class="btn btn-primary">🔎 Buscar antecedentes</button>
                    <div id="antEstado" class="help-text" style="margin-top:0.5rem;"></div>
                    <div id="antResultados"></div>
                    <div id="antSeleccion"></div>
                </div>
            </details>
        </div>`;
        document.getElementById('antBuscar').addEventListener('click', () => this._onBuscar());
    },

    async _onBuscar() {
        const estado = document.getElementById('antEstado');
        const q = document.getElementById('antQuery').value.trim();
        if (!q) { estado.textContent = 'Escribe términos de búsqueda.'; return; }
        estado.textContent = 'Consultando OpenAlex…';
        try {
            const obras = await this.buscar(q, {
                desde: document.getElementById('antDesde').value,
                idioma: document.getElementById('antIdioma').value
            });
            this._obras = obras;
            estado.textContent = obras.length
                ? `${obras.length} resultados (ordenados por citas). Marca los relevantes:`
                : 'Sin resultados: prueba términos en inglés o amplía el rango de años.';
            this._renderResultados(obras);
        } catch (e) {
            estado.textContent = `No se pudo consultar OpenAlex (${e.message}). Verifica tu conexión.`;
        }
    },

    _renderResultados(obras) {
        const filas = obras.map((o, i) => `
            <tr>
                <td><input type="checkbox" data-i="${i}" ${this._seleccion.has(o.id) ? 'checked' : ''}></td>
                <td>${o.autores.slice(0, 3).join('; ')}${o.autores.length > 3 ? ' et al.' : ''} (${o.anio})</td>
                <td>${o.doi ? `<a href="${o.doi}" target="_blank">${o.titulo}</a>` : o.titulo}</td>
                <td>${o.fuente}</td><td>${o.citas}</td>
            </tr>`).join('');
        document.getElementById('antResultados').innerHTML = `
            <div class="table-container" style="margin-top:0.75rem;"><table class="table">
                <thead><tr><th></th><th>Autores (año)</th><th>Título</th><th>Fuente</th><th>Citas</th></tr></thead>
                <tbody>${filas}</tbody></table></div>`;
        document.getElementById('antResultados').querySelectorAll('input[type=checkbox]').forEach(ch =>
            ch.addEventListener('change', e => {
                const o = this._obras[+e.target.dataset.i];
                if (e.target.checked) this._seleccion.set(o.id, o); else this._seleccion.delete(o.id);
                this._renderSeleccion();
            }));
    },

    _renderSeleccion() {
        const sel = [...this._seleccion.values()];
        const cont = document.getElementById('antSeleccion');
        if (!sel.length) { cont.innerHTML = ''; return; }
        const refs = sel.map(o => this.citaAPA(o))
            .sort((a, b) => a.localeCompare(b, 'es'));
        const matriz = sel.map(o => `
            <tr><td>${this._autoresAPA(o.autores.slice(0, 3))}${o.autores.length > 3 ? ' et al.' : ''} (${o.anio})</td>
                <td>${o.titulo}</td>
                <td>${o.resumen ? o.resumen.slice(0, this.CONFIG.RECORTE_RESUMEN) + (o.resumen.length > this.CONFIG.RECORTE_RESUMEN ? '…' : '') : '[REVISAR TEXTO COMPLETO]'}</td>
                <td>[COMPLETAR: relación con tus variables y aporte a tu estudio]</td></tr>`).join('');
        cont.innerHTML = `
            <h4 style="margin-top:1.25rem;">Referencias seleccionadas (APA 7, orden alfabético)</h4>
            <div class="result-box">${refs.map(r => `<p style="margin:0 0 0.5rem; padding-left:2rem; text-indent:-2rem;">${r}</p>`).join('')}</div>
            <h4 style="margin-top:1rem;">Matriz de antecedentes</h4>
            <div class="table-container"><table class="table">
                <thead><tr><th>Autores (año)</th><th>Título</th><th>Resumen</th><th>Aporte al estudio</th></tr></thead>
                <tbody>${matriz}</tbody></table></div>
            <p class="help-text">El resumen proviene de la base de datos; el «aporte al estudio» es tu análisis: léelos antes de citarlos.</p>`;
    }
};

if (typeof window !== 'undefined') {
    window.Antecedentes = Antecedentes;
    // Montaje robusto: funciona tanto si el DOM aún carga como si ya está listo.
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => Antecedentes.montar());
    } else {
        Antecedentes.montar();
    }
}
