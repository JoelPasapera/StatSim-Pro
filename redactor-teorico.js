// ========================================
// REDACTOR DEL MARCO TEÓRICO (borrador asistido por IA) — Sesión A.
// La IA redacta un borrador sustentado ÚNICAMENTE en las fuentes de la matriz
// de revisión (respetando el filtro de relevancia). Anti-alucinación: solo puede
// citar las fuentes reales, con citas cortas ya construidas por la app, y las
// citas textuales solo pueden salir de los resúmenes.
//
// IMPORTANTE (honestidad académica): el resultado es un BORRADOR de trabajo.
// El investigador debe verificar cada cita contra la fuente original, corregir
// y reescribir con su propia voz antes de usarlo en la tesis.
// ========================================

const RedactorTeorico = {

    _textos: {}, // secciones redactadas: { clave: { titulo, texto, fuentesUsadas } }

    montar() {
        const cont = document.getElementById('antRedactor');
        if (!cont) return; // el buscador aún no está montado

        cont.innerHTML = `
          <div class="form-group" style="margin-top:1.5rem; padding-top:1.2rem; border-top:1px dashed var(--color-border, #e5e5e5);">
            <h3 style="margin:0 0 0.3rem; font-size:1.05rem;">📝 Redacción del marco teórico (borrador asistido)</h3>
            <p class="help-text" style="margin:0 0 0.6rem;">La IA redacta un borrador sustentado <strong>únicamente en las fuentes de tu matriz</strong> (respetando el filtro de relevancia). Es un punto de partida: <strong>verifica cada cita contra la fuente original</strong>, corrige y reescribe con tu voz antes de usarlo.</p>
            <div id="redFuentesInfo" class="help-text" style="margin:0 0 0.8rem;"></div>

            <div style="margin:0 0 1rem; padding:0.7rem 0.9rem; border:1px dashed var(--color-border, #ccc); border-radius:0.5rem;">
              <label class="label" for="redArchivo" style="display:block; margin:0 0 0.4rem;">📂 ¿Ya tienes una matriz exportada? Cárgala y redacta sin repetir el proceso</label>
              <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
                <input type="file" id="redArchivo" accept=".xlsx,.csv" style="font-size:0.85em;">
                <button id="redQuitarImport" class="btn btn-outline" style="padding:0.25rem 0.7rem; display:none;">✕ Quitar matriz importada</button>
              </div>
              <p class="help-text" style="margin:0.4rem 0 0;">Acepta los tres formatos que exporta la app: Excel (.xlsx), CSV español (;) y CSV internacional (,). Se usan todas las filas del archivo.</p>
              <div id="redImportInfo" class="help-text" style="margin-top:0.4rem;"></div>
            </div>

            <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; margin-top:0.2rem;">
              <button id="redRedactarTodo" class="btn btn-primary" style="padding:0.45rem 1.1rem;">📄 Redactar marco teórico completo</button>
              <button id="redProbar" class="btn btn-outline" style="padding:0.4rem 1rem;">✍️ Probar solo una sección</button>
              <button id="redDescargarWord" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">⬇ Descargar Word (.docx)</button>
              <button id="redCopiar" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">📋 Copiar texto</button>
            </div>
            <p class="help-text" style="margin:0.4rem 0 0;">El documento completo redacta todas las secciones en paralelo (planteamiento, estado de la cuestión, antecedentes, bases teóricas y modelos por variable, justificación y definiciones), con la regla de oro: <strong>toda idea con su cita</strong>. Al terminar podrás descargarlo como Word (.docx) en formato APA con las referencias al final.</p>
            <div id="redEstado" class="help-text" style="margin-top:0.5rem;"></div>
            <div id="redResultado" style="display:none; margin-top:0.8rem; padding:1rem; border:1px solid var(--color-border, #ddd); border-radius:0.5rem; background:#fafafa; white-space:pre-wrap; font-family:'Times New Roman', serif; font-size:0.95rem; line-height:1.6; max-height:28rem; overflow:auto;"></div>
          </div>`;

        // Variables de estudio: se montan ARRIBA, entre «Problema de investigación»
        // y «Criterios» (flujo natural: problema → variables → criterios). Si el
        // slot no existiera (versión vieja del buscador), caen dentro del redactor.
        const slotVars = document.getElementById('antVariablesSlot') || cont;
        const bloqueVars = document.createElement('div');
        bloqueVars.className = 'form-group';
        bloqueVars.style.marginTop = '1rem';
        bloqueVars.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.4rem;">
              <label class="label" for="redVariables" style="margin:0;">Variables de estudio</label>
              <button id="redIdentificar" class="btn btn-outline" style="padding:0.3rem 0.8rem;">🧩 Identificar variables</button>
            </div>
            <textarea id="redVariables" class="input" rows="4" style="resize:vertical;"
              placeholder="Una variable por línea, con el formato:  Nombre — definición conceptual breve.&#10;Pulsa «Identificar variables» para que la IA las proponga a partir del problema de investigación; luego edítalas a tu criterio."></textarea>
            <p class="help-text" style="margin:0.4rem 0 0;">La IA propone; tú confirmas. Estas variables guiarán los criterios y todas las secciones del marco teórico.</p>`;
        if (slotVars === cont) cont.insertBefore(bloqueVars, cont.firstChild); else slotVars.appendChild(bloqueVars);

        const btnVar = document.getElementById('redIdentificar');
        if (btnVar) btnVar.addEventListener('click', () => this._onIdentificarVariables());
        const btnProbar = document.getElementById('redProbar');
        if (btnProbar) btnProbar.addEventListener('click', () => this._onProbarSeccion());
        const inpArchivo = document.getElementById('redArchivo');
        if (inpArchivo) inpArchivo.addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) this._onArchivo(f);
            e.target.value = ''; // permite volver a cargar el mismo archivo
        });
        const btnQuitar = document.getElementById('redQuitarImport');
        if (btnQuitar) btnQuitar.addEventListener('click', () => this._quitarImportadas());
        const btnTodo = document.getElementById('redRedactarTodo');
        if (btnTodo) btnTodo.addEventListener('click', () => this._onRedactarTodo());
        const btnWord = document.getElementById('redDescargarWord');
        if (btnWord) btnWord.addEventListener('click', () => this._onDescargarWord());
        const btnCopiar = document.getElementById('redCopiar');
        if (btnCopiar) btnCopiar.addEventListener('click', () => this._onCopiar());

        this.actualizarInfoFuentes();
    },

    // ============================================================
    // IMPORTAR una matriz exportada (Excel .xlsx · CSV ; · CSV ,)
    // ============================================================
    _fuentesImportadas: null,
    _nombreImportado: '',

    async _onArchivo(file) {
        const info = document.getElementById('redImportInfo');
        try {
            const nombre = (file.name || '').toLowerCase();
            let cols, filas;
            if (nombre.endsWith('.xlsx')) {
                const buf = await file.arrayBuffer();
                ({ cols, filas } = await this._parsearXLSX(buf));
            } else if (nombre.endsWith('.csv')) {
                const texto = await file.text();
                ({ cols, filas } = this._parsearCSV(texto));
            } else {
                throw new Error('Formato no soportado. Usa .xlsx o .csv exportados por la app.');
            }
            const fuentes = this._filasAFuentes(cols, filas);
            if (!fuentes.length) throw new Error('El archivo no contiene filas con título y referencia.');
            this._fuentesImportadas = fuentes;
            this._nombreImportado = file.name;
            const btnQ = document.getElementById('redQuitarImport');
            if (btnQ) btnQ.style.display = '';
            if (info) info.textContent = `✓ Matriz importada: ${fuentes.length} fuente(s) de «${file.name}». La redacción usará estas fuentes.`;
            this.actualizarInfoFuentes();
            this._completarResumenes(); // rellena en segundo plano los que tengan DOI y no resumen
        } catch (e) {
            this._fuentesImportadas = null;
            if (info) info.textContent = '❌ ' + (e.message || 'No se pudo leer el archivo.');
            this.actualizarInfoFuentes();
        }
    },

    // Completa en segundo plano los resúmenes faltantes de la matriz importada,
    // consultando por DOI la misma cascada del buscador (OpenAlex → Crossref →
    // Semantic Scholar → Europe PMC → Scopus). No bloquea; informa el avance.
    // Reconstruye la cita corta APA a partir de la lista de autores reales.
    _citaDesdeAutores(autores, anio) {
        const aps = (autores || []).map(a => this._apellido(a)).filter(Boolean);
        const y = anio || 's. f.';
        if (!aps.length) return '';
        if (aps.length === 1) return `(${aps[0]}, ${y})`;
        if (aps.length === 2) return `(${aps[0]} y ${aps[1]}, ${y})`;
        return `(${aps[0]} et al., ${y})`;
    },

    async _completarResumenes() {
        if (!this._fuentesImportadas || typeof Antecedentes === 'undefined' || !Antecedentes._recuperarDatos) return;
        const pendientes = this._fuentesImportadas.filter(f =>
            f.doi && ((!f.resumen || f.resumen.length < 40) || f._autoresPendientes));
        if (!pendientes.length) return;
        const info = document.getElementById('redImportInfo');
        const base = info ? info.textContent : '';
        let hechos = 0, logrados = 0;
        const CONCURRENCIA = 5;
        let idx = 0;
        const trabajador = async () => {
            while (idx < pendientes.length) {
                const f = pendientes[idx++];
                try {
                    const datos = await Antecedentes._recuperarDatos(f.doi);
                    if (datos && datos.abstract && (!f.resumen || f.resumen.length < 40)) { f.resumen = datos.abstract; logrados++; }
                    // Reparar AUTORES rotos: cita nueva con apellidos reales y la
                    // referencia reconstruida (autores APA + resto original desde el año).
                    if (datos && datos.autores && datos.autores.length && f._autoresPendientes) {
                        const nuevaCita = this._citaDesdeAutores(datos.autores, f.anio || datos.anio);
                        if (nuevaCita) {
                            f.cita = nuevaCita;
                            const resto = String(f.ref).split(/(?=\(\s*(?:\d{4}|s\.\s*f\.))/)[1] || `(${f.anio || datos.anio || 's. f.'}). ${f.titulo}.`;
                            const autoresAPA = (typeof Antecedentes._autoresAPA === 'function')
                                ? Antecedentes._autoresAPA(datos.autores) : datos.autores.join(', ');
                            f.ref = `${autoresAPA} ${resto}`.trim();
                            f._autoresPendientes = false;
                            logrados++;
                        }
                    }
                } catch (e) { /* seguir con la siguiente */ }
                hechos++;
                if (info) info.textContent = `${base} Completando resúmenes faltantes por DOI: ${hechos}/${pendientes.length}…`;
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, pendientes.length) }, () => trabajador()));
        if (info) info.textContent = `${base} ✓ Completado por DOI: ${logrados} campo(s) reparado(s) (resúmenes y/o autores) en ${pendientes.length} fuentes.`;
        this.actualizarInfoFuentes();
    },

    _quitarImportadas() {
        this._fuentesImportadas = null;
        this._nombreImportado = '';
        const btnQ = document.getElementById('redQuitarImport');
        if (btnQ) btnQ.style.display = 'none';
        const info = document.getElementById('redImportInfo');
        if (info) info.textContent = 'Matriz importada retirada: la redacción vuelve a usar la matriz de la sesión actual.';
        this.actualizarInfoFuentes();
    },

    // Parser CSV con comillas ("" escapadas), saltos dentro de campos, BOM y la
    // pista "sep=;" de Excel. Autodetecta el separador (; español / , internacional).
    _parsearCSV(texto) {
        let t = String(texto || '').replace(/^\ufeff/, '');
        // Pista de Excel-ES en la primera línea: "sep=;"
        const mSep = t.match(/^sep=(.)\r?\n/i);
        let sep = null;
        if (mSep) { sep = mSep[1]; t = t.slice(mSep[0].length); }
        if (!sep) {
            // Autodetección sobre la primera línea (fuera de comillas).
            const primera = t.split(/\r?\n/, 1)[0] || '';
            let pc = 0, py = 0, dentro = false;
            for (const ch of primera) {
                if (ch === '"') dentro = !dentro;
                else if (!dentro && ch === ';') pc++;
                else if (!dentro && ch === ',') py++;
            }
            sep = pc >= py ? ';' : ',';
        }
        // Máquina de estados: campos, comillas y saltos de línea dentro de comillas.
        const filas = [];
        let fila = [], campo = '', dentro = false;
        for (let i = 0; i < t.length; i++) {
            const ch = t[i];
            if (dentro) {
                if (ch === '"') {
                    if (t[i + 1] === '"') { campo += '"'; i++; } // comilla escapada
                    else dentro = false;
                } else campo += ch;
            } else if (ch === '"') {
                dentro = true;
            } else if (ch === sep) {
                fila.push(campo); campo = '';
            } else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && t[i + 1] === '\n') i++;
                fila.push(campo); campo = '';
                if (fila.some(c => c.trim() !== '')) filas.push(fila);
                fila = [];
            } else campo += ch;
        }
        fila.push(campo);
        if (fila.some(c => c.trim() !== '')) filas.push(fila);
        if (filas.length < 2) throw new Error('El CSV no tiene datos (solo encabezado o vacío).');
        return { cols: filas[0].map(c => String(c).trim()), filas: filas.slice(1) };
    },

    // Lee la primera hoja de un .xlsx (requiere ExcelJS, ya cargado en la app).
    async _parsearXLSX(buffer) {
        if (typeof ExcelJS === 'undefined') throw new Error('La librería de Excel no está cargada. Recarga la página.');
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];
        if (!ws) throw new Error('El Excel no tiene hojas.');
        const filas = [];
        let cols = [];
        ws.eachRow((row, n) => {
            const vals = row.values.slice(1).map(v => {
                if (v == null) return '';
                if (typeof v === 'object') return String(v.text || v.result || v.richText?.map(r => r.text).join('') || '');
                return String(v);
            });
            if (n === 1) cols = vals.map(s => s.trim());
            else filas.push(vals);
        });
        if (!cols.length || !filas.length) throw new Error('El Excel no tiene datos.');
        return { cols, filas };
    },

    // Convierte filas crudas en fuentes {cita, ref, titulo, anio, resumen}.
    // Localiza las columnas por NOMBRE (tolerante a mayúsculas/tildes), así
    // funciona con 13 o 14 columnas (con o sin Relevancia).
    _filasAFuentes(cols, filas) {
        const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const idx = {};
        cols.forEach((c, i) => { idx[norm(c)] = i; });
        const col = (...nombres) => { for (const n of nombres) { if (idx[n] != null) return idx[n]; } return -1; };

        const iTitulo = col('titulo');
        const iAnio = col('ano', 'año');
        const iRef = col('referencia (apa)', 'referencia apa', 'referencia');
        const iResultados = col('resultados');
        const iObjetivos = col('objetivos');
        const iMuestra = col('muestra');
        const iConclusiones = col('conclusiones');
        const iLink = col('link/doi', 'link', 'doi');
        const iAutor = col('autor', 'autores', 'autor(es)');
        if (iTitulo < 0 || iRef < 0) {
            throw new Error('El archivo no parece una matriz exportada por la app (faltan las columnas «Título» y «Referencia (APA)»).');
        }
        const limpiar = s => String(s == null ? '' : s).replace(/<[^>]+>/g, '').trim();

        return filas.map(f => {
            const titulo = limpiar(f[iTitulo]);
            const ref = limpiar(f[iRef]);
            if (!titulo && !ref) return null;
            const anio = limpiar(iAnio >= 0 ? f[iAnio] : '') || (ref.match(/\((\d{4})[a-z]?\)/) || [])[1] || '';
            // El "resumen": la columna Resultados guarda el resumen del artículo al
            // exportar; si viniera vacía (matriz editada a mano), se compone con
            // Objetivos/Muestra/Conclusiones.
            let resumen = limpiar(iResultados >= 0 ? f[iResultados] : '');
            if (!resumen) {
                const partes = [];
                if (iObjetivos >= 0 && limpiar(f[iObjetivos])) partes.push('Objetivos: ' + limpiar(f[iObjetivos]));
                if (iMuestra >= 0 && limpiar(f[iMuestra])) partes.push('Muestra: ' + limpiar(f[iMuestra]));
                if (iConclusiones >= 0 && limpiar(f[iConclusiones])) partes.push('Conclusiones: ' + limpiar(f[iConclusiones]));
                resumen = partes.join(' ');
            }
            // DOI (si la columna Link/DOI trae uno): permite completar resúmenes faltantes.
            const linkCrudo = limpiar(iLink >= 0 ? f[iLink] : '');
            const doi = /doi\.org\//.test(linkCrudo) || /^10\./.test(linkCrudo) ? linkCrudo : '';
            // Cita: PREFERIR la columna «Autor» (dato estructurado y limpio) y, si
            // falta, derivarla de la referencia (texto desde el inicio hasta el año).
            const autoresCol = limpiar(iAutor >= 0 ? f[iAutor] : '')
                .split(/;\s*/).map(s => s.trim()).filter(Boolean);
            let cita, autoresPendientes;
            if (autoresCol.length) {
                cita = this._citaDesdeAutores(autoresCol, anio);
                autoresPendientes = false;
            } else {
                cita = this._citaDesdeRef(ref, anio);
                // Cita por título o «s. a.»: los autores venían rotos/ausentes en la
                // referencia; se marcan para repararlos por DOI en segundo plano.
                autoresPendientes = /^\("/.test(cita) || cita.startsWith('(s. a.');
            }
            return { cita, ref, titulo, anio, resumen, doi, _autoresPendientes: autoresPendientes };
        }).filter(Boolean).filter(x => x.titulo || x.ref);
    },

    // Deriva la cita corta (Apellido, año) desde la referencia APA completa:
    // "García, J., López, M. & Ruiz, P. (2023). ..." → (García et al., 2023).
    _citaDesdeRef(ref, anioFallback) {
        const r = String(ref || '');
        const anio = (r.match(/\((\d{4}[a-z]?|s\.\s*f\.)\)/) || [])[1] || anioFallback || 's. f.';
        const preAnio = r.split(/\(\s*(?:\d{4}|s\.\s*f\.)/)[0] || '';
        // Autores "Apellido, X." (iniciales con punto), tolerando compuestos.
        const M = 'A-ZÀ-ÖØ-ÞĀ-Ž', m_ = 'a-zà-öø-ÿā-ž';
        const m = [...preAnio.matchAll(new RegExp(`([${M}][${M}${m_}'’-]+(?:\\s+[${M}][${M}${m_}'’-]+)*)\\s*,\\s*(?:[${M}]\\.\\s*)+`, 'g'))];
        // Descartar "apellidos" que en realidad son iniciales sueltas (letra + punto):
        // evita citas inválidas tipo "(E. B., 2026)" cuando la referencia vino rota.
        const apellidos = m.map(x => x[1].trim()).filter(a => a && !new RegExp(`^([${M}]\\.?\\s*)+$`).test(a));
        if (!apellidos.length) {
            const palabras = preAnio.trim().split(/\s+/).filter(Boolean);
            const soloIniciales = palabras.length && palabras.every(p => new RegExp(`^([${M}${m_}]\\.?,?)+$`).test(p));
            if (!palabras.length || soloIniciales) {
                // Sin autor recuperable: APA permite citar por el título abreviado.
                const t = String(ref).split(/\(\s*(?:\d{4}|s\.\s*f\.)/)[1] || '';
                const tit = t.replace(/^\)\.?\s*/, '').split(/\s+/).slice(0, 3).join(' ').replace(/[.,;:]+$/, '');
                return tit ? `("${tit}", ${anio})` : `(s. a., ${anio})`;
            }
            return `(${palabras.slice(0, 2).join(' ')}, ${anio})`;
        }
        if (apellidos.length === 1) return `(${apellidos[0]}, ${anio})`;
        if (apellidos.length === 2) return `(${apellidos[0]} y ${apellidos[1]}, ${anio})`;
        return `(${apellidos[0]} et al., ${anio})`;
    },

    // ---- Fuentes: las importadas (si hay) o las de la matriz de la sesión ----
    _fuentes() {
        if (this._fuentesImportadas && this._fuentesImportadas.length) return this._fuentesImportadas;
        if (typeof Antecedentes === 'undefined' || !Antecedentes.obtenerFuentesRedaccion) return [];
        const obras = Antecedentes.obtenerFuentesRedaccion();
        return obras.map(o => ({
            cita: this._citaCorta(o),
            ref: (Antecedentes.citaAPA ? Antecedentes.citaAPA(o) : ''),
            titulo: o.titulo || '',
            anio: o.anio || '',
            resumen: o.resumen || o.abstract || ''
        }));
    },

    // Cita corta APA a partir de los autores: (Apellido, año) · (A y B, año) ·
    // (A et al., año). La construye la app para que el modelo NO la invente.
    _apellido(nombre) {
        const n = String(nombre || '').trim();
        if (!n) return '';
        // Reutiliza la heurística APA del buscador (detecta iniciales tipo
        // "Batbayar E." para no tomar la inicial como apellido).
        if (typeof Antecedentes !== 'undefined' && Antecedentes._autorAPA) {
            return Antecedentes._autorAPA(n).split(',')[0].trim();
        }
        if (n.includes(',')) return n.split(',')[0].trim();
        const partes = n.split(/\s+/);
        return partes[partes.length - 1];
    },
    _citaCorta(o) {
        const autores = (o.autores || []).map(a => this._apellido(a)).filter(Boolean);
        const anio = o.anio || 's. f.';
        if (!autores.length) {
            // Sin autores: usar las primeras palabras del título (regla APA de recurso).
            const t = String(o.titulo || 'Anónimo').split(/\s+/).slice(0, 3).join(' ');
            return `("${t}", ${anio})`;
        }
        if (autores.length === 1) return `(${autores[0]}, ${anio})`;
        if (autores.length === 2) return `(${autores[0]} y ${autores[1]}, ${anio})`;
        return `(${autores[0]} et al., ${anio})`;
    },

    actualizarInfoFuentes() {
        const info = document.getElementById('redFuentesInfo');
        if (!info) return;
        const n = this._fuentes().length;
        if (this._fuentesImportadas && this._fuentesImportadas.length) {
            info.textContent = `📚 Fuentes para la redacción: ${n} (importadas de «${this._nombreImportado}»).`;
            return;
        }
        let filtro = '';
        if (typeof Antecedentes !== 'undefined' && Antecedentes._relevanciaAplicada && Antecedentes._umbralRelevancia > 0) {
            filtro = ` (filtro: relevancia ≥ ${Antecedentes._umbralRelevancia})`;
        }
        info.textContent = n
            ? `📚 Fuentes disponibles para la redacción: ${n}${filtro}.`
            : '📚 Aún no hay fuentes: busca y marca artículos, o carga una matriz exportada (arriba).';
    },

    // ---- Identificar variables con IA (editables por el usuario) ----
    async _onIdentificarVariables() {
        const problema = (document.getElementById('antProblema') || {}).value || '';
        const caja = document.getElementById('redVariables');
        const estado = document.getElementById('redEstado');
        const btn = document.getElementById('redIdentificar');

        if (problema.trim().length < 15) {
            if (estado) estado.textContent = '⚠️ Escribe primero el problema de investigación (arriba, en «Búsqueda intensiva»).';
            const p = document.getElementById('antProblema'); if (p) p.focus();
            return;
        }
        if (caja && caja.value.trim().length > 5) {
            if (!confirm('Ya tienes variables escritas. ¿Reemplazarlas por una nueva propuesta de la IA?')) return;
        }

        const t = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Identificando…'; }
        if (estado) estado.textContent = 'La IA está identificando las variables de estudio…';
        try {
            if (typeof IAAsistente === 'undefined') throw new Error('El asistente de IA no está cargado.');
            const vars = await IAAsistente.extraerVariables(problema);
            if (caja) caja.value = vars.map(v => `${v.nombre} — ${v.definicion}`).join('\n');
            const hintIns = document.getElementById('redHintInstrumento');
            if (!hintIns && caja && caja.parentElement) {
                caja.insertAdjacentHTML('afterend', '<p id="redHintInstrumento" class="help-text" style="margin:0.3rem 0 0;font-size:0.85em;">💡 Opcional pero recomendado: añade al final de cada línea « — Instrumento: [nombre del test o inventario]». El redactor lo usará para <b>delimitar el modelo teórico</b> que adopta tu investigación (p. ej., habilidad vs. rasgo) anclándolo a cómo medirás la variable.</p>');
            }
            if (estado) estado.textContent = `✓ ${vars.length} variable(s) identificada(s). Revísalas y edítalas a tu criterio.`;
        } catch (e) {
            if (estado) estado.textContent = '❌ ' + (e.message || 'No se pudieron identificar las variables.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = t; }
        }
    },

    // ============================================================
    // DOCUMENTO COMPLETO (Sesión B+C): plan, orquestación y Word APA
    // ============================================================
    _documento: null, // { secciones: [{titulo, texto}], fuentes, citadas }
    _ENFRIAMIENTO_MS: 62000, // TPM: 1 lote/clave/minuto (0 en tests)

    _normTexto(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },

    // Variables desde el textarea: [{nombre, definicion}]
    _leerVariables() {
        const t = (document.getElementById('redVariables') || {}).value || '';
        return t.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
            const [nombre, ...resto] = l.split('—');
            let definicion = resto.join('—').trim(), instrumento = '';
            const mi = definicion.match(/\s*[—-]\s*Instrumento\s*:\s*(.+)$/i);
            if (mi) { instrumento = mi[1].trim(); definicion = definicion.slice(0, mi.index).trim(); }
            return { nombre: (nombre || '').trim(), definicion, instrumento };
        }).filter(v => v.nombre);
    },

    // Plan de secciones (dinámico según las variables). 'partes' divide una
    // sección larga en varias llamadas con fuentes distintas (más exhaustivo).
    _construirPlanSecciones(variables) {
        const plan = [];
        plan.push({ titulo: 'Planteamiento del problema', capitulo: 'I', afinidad: '', partes: 1,
            instrucciones: 'Redacta el planteamiento del problema: describe el fenómeno (con cifras de las fuentes '
                + 'solo si aparecen en los resúmenes), el contexto y las consecuencias. REGLA DE COHERENCIA DEL '
                + 'VACÍO: como la investigación es de tipo correlacional, el vacío que identifiques DEBE ser '
                + 'coherente con esa pregunta — controversia o desacuerdo teórico sobre la relación (o independencia) '
                + 'entre los constructos, hallazgos inconsistentes entre estudios previos, o ausencia de evidencia '
                + 'sobre esa relación en la población y contexto del estudio. PROHIBIDO justificar el estudio por '
                + 'falta de datos de prevalencia o epidemiológicos: ese es un vacío descriptivo de salud pública, '
                + 'discordante con una pregunta correlacional. Cierra formulando la pregunta general en forma '
                + 'correlacional (¿Existe relación entre X e Y en [población]?).' });
        plan.push({ titulo: 'Justificación', capitulo: 'I', afinidad: '', partes: 1,
            instrucciones: 'Redacta la justificación del estudio en sus formas pertinentes (teórica, práctica, '
                + 'metodológica y/o social), cada argumento sustentado con citas de las fuentes.' });

        plan.push({ titulo: 'Estado de la cuestión', capitulo: 'II', afinidad: '', partes: 1,
            instrucciones: 'Sintetiza qué se sabe actualmente sobre el tema, ORGANIZADO POR CONCEPTOS (no '
                + 'estudio por estudio): agrupa hallazgos convergentes y señala discrepancias y vacíos.' });
        plan.push({ titulo: 'Antecedentes', capitulo: 'II', afinidad: '', partes: 4,
            instrucciones: 'Presenta los estudios previos UNO POR UNO en párrafos: para cada estudio citado '
                + 'indica autores y año (cita narrativa), objetivo, muestra/contexto, y hallazgos principales. '
                + 'Cubre TODOS los estudios de la lista de fuentes proporcionada.' });
        for (const v of variables) {
            plan.push({ titulo: `Bases teóricas: ${v.nombre}`, capitulo: 'II', afinidad: v.nombre + ' ' + v.definicion, partes: 1,
                instrucciones: `Desarrolla con profundidad la variable «${v.nombre}»: definiciones de distintos `
                    + `autores (cada una con su cita), evolución del concepto y componentes o dimensiones. `
                    + `DELIMITACIÓN CONCEPTUAL OBLIGATORIA: si en las fuentes coexisten aproximaciones u `
                    + `operacionalizaciones rivales del constructo, preséntalas Y declara explícitamente cuál `
                    + `adopta esta investigación, justificando la elección`
                    + (v.instrumento ? ` por su correspondencia con el instrumento previsto («${v.instrumento}»)` : ` por su correspondencia con el instrumento de medición que la operacionalizará`)
                    + `; mantén esa adopción de forma consistente en el resto del texto.` });
        }
        for (const v of variables) {
            plan.push({ titulo: `Modelos teóricos de ${v.nombre}`, capitulo: 'II', afinidad: v.nombre + ' modelo teoría enfoque', partes: 1,
                instrucciones: `Expón los modelos o teorías que explican «${v.nombre}» SEGÚN LAS FUENTES: nombre `
                    + `del modelo, autores (con cita) y postulados centrales; señala convergencias y diferencias. `
                    + `Si los modelos son rivales o parten de perspectivas opuestas, CIERRA declarando cuál adopta `
                    + `esta investigación y por qué`
                    + (v.instrumento ? ` (el instrumento previsto, «${v.instrumento}», operacionaliza esa perspectiva)` : ` (anclando la elección al instrumento de medición previsto)`)
                    + `.` });
        }
                plan.push({ titulo: 'Definición conceptual de las variables', capitulo: 'II', afinidad: variables.map(v => v.nombre).join(' '), partes: 1,
            instrucciones: 'Para CADA variable de estudio, presenta su definición conceptual formal con la cita  La definición final de cada variable debe corresponder EXACTAMENTE al modelo o aproximación adoptado en las bases teóricas (coherencia de delimitación conceptual).'
                + 'del autor correspondiente (una definición principal y, si las fuentes lo permiten, una alternativa).' });
        return plan;
    },

    // Selección de fuentes por afinidad simple (palabras clave en título+resumen),
    // con relleno rotatorio para repartir las fuentes entre secciones/partes.
    // ¿Es una fuente de la OMS/organismo internacional de salud? (IRIS o autoría institucional)
    _esOMS(f) {
        if (!f) return false;
        if (/OMS|IRIS/i.test(String(f.fuente || ''))) return true;
        if ((f.fuentesAPI || []).some(x => /OMS|IRIS|WHO/i.test(String(x)))) return true;
        return (f.autores || []).some(a => /Organizaci[oó]n Mundial de la Salud|World Health Organization|Organizaci[oó]n Panamericana|Pan American Health/i.test(String(a)));
    },

    // Antepone las fuentes OMS al subconjunto de una tarea (convención: los
    // antecedentes internacionales abren la sección). Mantiene el tamaño n.
    _priorizarOMS(fsel, fuentes, maxOMS, n) {
        const oms = fuentes.filter(f => this._esOMS(f)).slice(0, maxOMS);
        if (!oms.length) return { fsel, oms: 0 };
        const resto = fsel.filter(f => !oms.includes(f));
        return { fsel: [...oms, ...resto].slice(0, Math.max(n, oms.length)), oms: oms.length };
    },

    _seleccionarFuentes(fuentes, afinidad, n = 32, offset = 0) {
        if (fuentes.length <= n) return fuentes.slice();
        const claves = this._normTexto(afinidad).split(/\W+/).filter(w => w.length > 3);
        const puntuadas = fuentes.map((f, i) => {
            const texto = this._normTexto(f.titulo + ' ' + f.resumen);
            const score = claves.reduce((s, k) => s + (texto.includes(k) ? 1 : 0), 0);
            return { f, i, score };
        });
        const conAfinidad = puntuadas.filter(p => p.score > 0).sort((a, b) => b.score - a.score || a.i - b.i);
        const sel = conAfinidad.slice(0, n).map(p => p.f);
        if (sel.length < n) {
            // Relleno rotatorio (reparte el resto de fuentes entre secciones).
            const usadas = new Set(sel);
            for (let k = 0; sel.length < n && k < fuentes.length; k++) {
                const f = fuentes[(offset + k) % fuentes.length];
                if (!usadas.has(f)) { sel.push(f); usadas.add(f); }
            }
        }
        return sel;
    },

    // ---- Redactar el documento COMPLETO (todas las secciones, en paralelo) ----
    async _onRedactarTodo() {
        const estado = document.getElementById('redEstado');
        const btn = document.getElementById('redRedactarTodo');
        const btnWord = document.getElementById('redDescargarWord');
        const res = document.getElementById('redResultado');
        const problema = (document.getElementById('antProblema') || {}).value || '';
        const variablesTexto = (document.getElementById('redVariables') || {}).value || '';
        const variables = this._leerVariables();

        this.actualizarInfoFuentes();
        const fuentes = this._fuentes();
        if (problema.trim().length < 15) { if (estado) estado.textContent = '⚠️ Falta el problema de investigación (arriba).'; return; }
        if (!variables.length) { if (estado) estado.textContent = '⚠️ Identifica (o escribe) primero las variables de estudio.'; return; }
        if (!fuentes.length) { if (estado) estado.textContent = '⚠️ No hay fuentes: usa la matriz o importa una exportada.'; return; }
        if (typeof IAAsistente === 'undefined') { if (estado) estado.textContent = '❌ El asistente de IA no está cargado.'; return; }

        // Plan → tareas (las secciones con 'partes' se dividen con fuentes distintas).
        const plan = this._construirPlanSecciones(variables);
        const tareas = [];
        let off = 0;
        for (const sec of plan) {
            const porParte = Math.min(32, Math.max(8, Math.ceil(fuentes.length / sec.partes)));
            for (let p = 0; p < sec.partes; p++) {
                let fsel = this._seleccionarFuentes(fuentes, sec.afinidad, porParte, off);
                off += porParte; // desplaza una ventana completa: cada parte trae fuentes distintas
                let notaOMS = '';
                if (sec.titulo === 'Antecedentes' && p === 0) {
                    const pr = this._priorizarOMS(fsel, fuentes, 8, porParte);
                    fsel = pr.fsel;
                    if (pr.oms) notaOMS = ' CONVENCIÓN DE ORDEN OBLIGATORIA: abre la sección con los antecedentes'
                        + ' internacionales de organismos oficiales (OMS/OPS) — son las primeras fuentes de tu'
                        + ' lista — y solo después continúa con los demás estudios (internacional → nacional → local).';
                } else if (sec.titulo === 'Planteamiento del problema') {
                    const pr = this._priorizarOMS(fsel, fuentes, 4, porParte);
                    fsel = pr.fsel;
                    if (pr.oms) notaOMS = ' Al abrir el planteamiento, usa los informes de organismos internacionales'
                        + ' (las primeras fuentes de tu lista, OMS/OPS) para dimensionar el contexto global del'
                        + ' fenómeno — como marco de apertura, sin convertir la prevalencia en el vacío del estudio.';
                }
                tareas.push({
                    seccion: sec.titulo,
                    titulo: sec.partes > 1 ? `${sec.titulo} (parte ${p + 1} de ${sec.partes})` : sec.titulo,
                    instrucciones: sec.instrucciones + notaOMS + (sec.partes > 1
                        ? ` Esta es la PARTE ${p + 1} de ${sec.partes}: cubre únicamente las fuentes que se te dan aquí (otras partes cubren las demás); no escribas introducción ni cierre generales.` : ''),
                    fuentes: fsel
                });
            }
        }

        const t = btn ? btn.textContent : '';
        if (btn) btn.disabled = true;
        if (btnWord) btnWord.style.display = 'none';
        if (res) { res.style.display = 'none'; res.textContent = ''; }
        const _t0 = performance.now();

        const canales = Math.min(await (IAAsistente.numClaves ? IAAsistente.numClaves() : 7), tareas.length);
        let completadas = 0, conError = 0;
        const resultados = new Array(tareas.length).fill(null);
        const prog = () => {
            const tandas = Math.ceil((tareas.length - completadas) / canales);
            if (estado) estado.textContent = `📄 Redactando… ${completadas}/${tareas.length} secciones `
                + `(${canales} claves en paralelo)${tandas > 0 ? ` · quedan ~${tandas} min` : ''}`;
            if (btn) btn.textContent = `⏳ ${completadas}/${tareas.length}…`;
        };
        prog();

        let siguiente = 0;
        const trabajador = async (canal) => {
            let ultimo = 0;
            while (siguiente < tareas.length) {
                const i = siguiente++;
                const tarea = tareas[i];
                if (ultimo) {
                    const espera = this._ENFRIAMIENTO_MS - (performance.now() - ultimo);
                    if (espera > 0) await new Promise(r => setTimeout(r, espera));
                }
                ultimo = performance.now();
                try {
                    const texto = await IAAsistente.redactarSeccion({
                        titulo: tarea.titulo, instrucciones: tarea.instrucciones,
                        problema, variablesTexto, fuentes: tarea.fuentes, keyHint: canal
                    });
                    resultados[i] = { seccion: tarea.seccion, texto };
                } catch (e) {
                    conError++;
                    resultados[i] = { seccion: tarea.seccion, texto: `[No se pudo generar esta parte: ${e.message}]` };
                }
                completadas++; prog();
            }
        };
        await Promise.all(Array.from({ length: canales }, (_, c) => trabajador(c)));

        // SEGUNDA PASADA: reintentar las tareas que fallaron (p. ej. por cuota),
        // tras el enfriamiento, repartidas de nuevo entre los canales.
        const fallidas = [];
        resultados.forEach((r, i) => { if (r && /^\[No se pudo generar/.test(r.texto)) fallidas.push(i); });
        if (fallidas.length) {
            if (estado) estado.textContent = `🔁 Reintentando ${fallidas.length} sección(es) que fallaron…`;
            if (this._ENFRIAMIENTO_MS > 0) await new Promise(r => setTimeout(r, this._ENFRIAMIENTO_MS));
            let fi = 0;
            const reint = async (canal) => {
                while (fi < fallidas.length) {
                    const i = fallidas[fi++];
                    const tarea = tareas[i];
                    try {
                        const texto = await IAAsistente.redactarSeccion({
                            titulo: tarea.titulo, instrucciones: tarea.instrucciones,
                            problema, variablesTexto, fuentes: tarea.fuentes, keyHint: canal
                        });
                        resultados[i] = { seccion: tarea.seccion, texto };
                        conError--;
                    } catch (e) { /* se queda el placeholder */ }
                }
            };
            await Promise.all(Array.from({ length: Math.min(canales, fallidas.length) }, (_, c) => reint(c)));
        }

        // Unir las partes de cada sección en el ORDEN del plan.
        const secciones = [];
        for (const sec of plan) {
            const partes = resultados.filter(r => r && r.seccion === sec.titulo).map(r => this._limpiarTexto(r.texto));
            secciones.push({ titulo: sec.titulo, capitulo: sec.capitulo || 'II', texto: partes.join('\n\n') });
        }
        const textoCompleto = secciones.map(s => s.texto).join('\n\n');
        const citadas = this._fuentesCitadas(textoCompleto, fuentes);
        this._documento = { secciones, fuentes, citadas, problema };

        const min = ((performance.now() - _t0) / 60000).toFixed(1);
        const palabras = textoCompleto.split(/\s+/).filter(Boolean).length;
        if (res) {
            res.style.display = '';
            let capAct = '';
            res.textContent = secciones.map(s => {
                let enc = '';
                if ((s.capitulo || 'II') !== capAct) {
                    capAct = s.capitulo || 'II';
                    enc = (capAct === 'I' ? 'CAPÍTULO I: INTRODUCCIÓN' : 'CAPÍTULO II: MARCO TEÓRICO') + '\n\n';
                }
                return enc + s.titulo.toUpperCase() + '\n\n' + s.texto;
            }).join('\n\n\n');
        }
        if (estado) estado.textContent = `✓ Documento redactado en ${min} min: ${secciones.length} secciones, `
                + (fuentes.some(f => this._esOMS(f)) ? '' : ' ⚠️ La matriz no contiene fuentes de la OMS: rehaz la búsqueda en el Buscador (ya integra IRIS de la OMS) e importa la matriz actualizada.')
            + `~${palabras.toLocaleString('es')} palabras, ${citadas.length} fuentes citadas de ${fuentes.length}`
            + (conError ? ` (${conError} parte(s) con error)` : '')
            + `. Descárgalo en Word y verifica cada cita contra la fuente original.`;
        if (btnWord) btnWord.style.display = '';
        const btnCop = document.getElementById('redCopiar');
        if (btnCop) btnCop.style.display = '';
        if (btn) { btn.disabled = false; btn.textContent = t; }
    },

    // Copia al portapapeles el documento mostrado (con fallback clásico).
    async _onCopiar() {
        const res = document.getElementById('redResultado');
        const btn = document.getElementById('redCopiar');
        const texto = res ? res.textContent : '';
        if (!texto) return;
        let ok = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(texto);
                ok = true;
            }
        } catch (e) { /* probar fallback */ }
        if (!ok) {
            try {
                const ta = document.createElement('textarea');
                ta.value = texto;
                ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                ok = document.execCommand('copy');
                document.body.removeChild(ta);
            } catch (e) { ok = false; }
        }
        if (btn) {
            const t = btn.textContent;
            btn.textContent = ok ? '✓ Copiado' : '❌ No se pudo copiar';
            setTimeout(() => { btn.textContent = t; }, 2000);
        }
    },

    // Limpieza ligera del texto del modelo (markdown residual).
    _limpiarTexto(t) {
        return String(t || '')
            .replace(/^#+\s*/gm, '')       // ### títulos
            .replace(/\*\*(.+?)\*\*/g, '$1') // **negritas**
            .replace(/[\u00A0\u2007\u2009\u202F\u2060]/g, ' ') // espacios "raros" (n = 377) → normal
            .trim();
    },

    // Fuentes realmente citadas en el texto (parentética o narrativa).
    _fuentesCitadas(texto, fuentes) {
        const t = String(texto || '');
        const usadas = fuentes.filter(f => {
            const inner = String(f.cita || '').replace(/^\(|\)$/g, ''); // "García et al., 2023"
            if (!inner) return false;
            if (t.includes(inner)) return true;
            const m = inner.match(/^(.*),\s*([^,]+)$/); // autores, año
            if (m) {
                const narrativa = `${m[1]} (${m[2]})`;
                if (t.includes(narrativa)) return true;
                const ap = m[1].split(/\s+y\s+|\s+et al\./)[0].trim();
                if (ap && t.includes(ap) && t.includes(m[2])) return true;
            }
            return false;
        });
        return usadas.length ? usadas : fuentes.slice(); // si no detecta, incluir todas
    },

    // ---- Word .docx en formato APA ----
    _htmlAPA(doc) {
        const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const parrafos = txt => String(txt || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
            .map(p => `<p style="text-indent:0.5in; margin:0 0 0pt;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');
        let capW = '';
        const cuerpo = doc.secciones.map(s => {
            let enc = '';
            if ((s.capitulo || 'II') !== capW) {
                capW = s.capitulo || 'II';
                enc = `<h1 style="text-align:center; font-size:14pt; margin:24pt 0 12pt;">${capW === 'I' ? 'CAPÍTULO I: INTRODUCCIÓN' : 'CAPÍTULO II: MARCO TEÓRICO'}</h1>\n`;
            }
            return enc + `<h1 style="text-align:center; font-size:12pt; margin:24pt 0 12pt;">${esc(s.titulo)}</h1>\n${parrafos(s.texto)}`;
        }).join('\n');
        // Referencias: solo las citadas, orden alfabético, sangría francesa.
        const refs = doc.citadas.slice().sort((a, b) => String(a.ref).localeCompare(String(b.ref), 'es'))
            .map(f => `<p style="margin:0 0 0pt; margin-left:0.5in; text-indent:-0.5in;">${String(f.ref)
                .replace(/&/g, '&amp;').replace(/<(?!\/?i>)/g, '&lt;')}</p>`).join('\n');
        return `<html><head><meta charset="utf-8"><style>
            body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 200%; }
            h1 { font-family: 'Times New Roman', serif; font-weight: bold; }
            p { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 200%; }
        </style></head><body>
        <h1 style="text-align:center; font-size:12pt;">MARCO TEÓRICO</h1>
        <p style="text-align:center; font-style:italic; font-size:10pt; line-height:150%;">Borrador asistido por IA a partir de ${doc.fuentes.length} fuentes de la matriz de revisión. Verifique cada cita contra la fuente original, corrija y reescriba con su propia voz antes de incorporarlo a la tesis.</p>
        ${cuerpo}
        <h1 style="text-align:center; font-size:12pt; margin:24pt 0 12pt;">Referencias</h1>
        ${refs}
        </body></html>`;
    },

    _onDescargarWord() {
        if (!this._documento) return;
        const html = this._htmlAPA(this._documento);
        let blob, nombre;
        if (typeof htmlDocx !== 'undefined' && htmlDocx.asBlob) {
            blob = htmlDocx.asBlob('<!DOCTYPE html>' + html);
            nombre = 'marco_teorico_APA.docx';
        } else {
            blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
            nombre = 'marco_teorico_APA.doc';
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nombre;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },

    // ---- Probar el motor: redactar el Planteamiento del problema ----
    async _onProbarSeccion() {
        const estado = document.getElementById('redEstado');
        const btn = document.getElementById('redProbar');
        const res = document.getElementById('redResultado');
        const problema = (document.getElementById('antProblema') || {}).value || '';
        const variablesTexto = (document.getElementById('redVariables') || {}).value || '';

        this.actualizarInfoFuentes();
        const fuentes = this._fuentes();

        if (problema.trim().length < 15) {
            if (estado) estado.textContent = '⚠️ Falta el problema de investigación (arriba).';
            return;
        }
        if (variablesTexto.trim().length < 5) {
            if (estado) estado.textContent = '⚠️ Identifica (o escribe) primero las variables de estudio.';
            return;
        }
        if (!fuentes.length) {
            if (estado) estado.textContent = '⚠️ No hay fuentes en la matriz: busca y marca artículos primero.';
            return;
        }

        const t = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Redactando…'; }
        if (estado) estado.textContent = `✍️ Redactando con ${Math.min(fuentes.length, 20)} fuentes (modelo potente)… puede tardar ~1 minuto.`;
        const _t0 = performance.now();
        try {
            if (typeof IAAsistente === 'undefined') throw new Error('El asistente de IA no está cargado.');
            const texto = await IAAsistente.redactarSeccion({
                titulo: 'Planteamiento del problema',
                instrucciones: 'Redacta el planteamiento del problema: fenómeno, contexto y consecuencias '
                    + '(cifras solo si están en los resúmenes). El vacío identificado debe ser coherente con '
                    + 'un estudio correlacional: controversia teórica o inconsistencia de hallazgos sobre la '
                    + 'relación entre las variables — NUNCA falta de datos de prevalencia (vacío descriptivo '
                    + 'ajeno a la pregunta). Cierra con la pregunta de investigación en forma correlacional.',
                problema,
                variablesTexto,
                fuentes,
                keyHint: 0
            });
            const seg = ((performance.now() - _t0) / 1000).toFixed(1);
            this._textos['planteamiento'] = { titulo: 'Planteamiento del problema', texto };
            if (res) { res.style.display = ''; res.textContent = texto; }
            if (estado) estado.textContent = `✓ Sección redactada en ${seg} s. Revisa el texto y las citas: `
                + `si la calidad te convence, pasamos a generar el documento completo.`;
        } catch (e) {
            if (estado) estado.textContent = '❌ ' + (e.message || 'No se pudo redactar la sección.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = t; }
        }
    }
};

if (typeof window !== 'undefined') {
    window.RedactorTeorico = RedactorTeorico;
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => RedactorTeorico.montar());
    } else {
        RedactorTeorico.montar();
    }
}
