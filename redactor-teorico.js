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

            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.4rem;">
              <label class="label" for="redVariables" style="margin:0;">Variables de estudio</label>
              <button id="redIdentificar" class="btn btn-outline" style="padding:0.3rem 0.8rem;">🧩 Identificar variables</button>
            </div>
            <textarea id="redVariables" class="input" rows="4" style="resize:vertical;"
              placeholder="Una variable por línea, con el formato:  Nombre — definición conceptual breve.&#10;Pulsa «Identificar variables» para que la IA las proponga a partir del problema de investigación; luego edítalas a tu criterio."></textarea>
            <p class="help-text" style="margin:0.4rem 0 0;">La IA propone; tú confirmas. Estas variables guiarán todas las secciones del marco teórico.</p>

            <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; margin-top:1rem;">
              <button id="redProbar" class="btn btn-primary" style="padding:0.4rem 1rem;">✍️ Probar el motor: redactar «Planteamiento del problema»</button>
            </div>
            <p class="help-text" style="margin:0.4rem 0 0;">Prueba con una sección real para validar la calidad del texto y de las citas antes de generar el documento completo (siguiente fase).</p>
            <div id="redEstado" class="help-text" style="margin-top:0.5rem;"></div>
            <div id="redResultado" style="display:none; margin-top:0.8rem; padding:1rem; border:1px solid var(--color-border, #ddd); border-radius:0.5rem; background:#fafafa; white-space:pre-wrap; font-family:'Times New Roman', serif; font-size:0.95rem; line-height:1.6; max-height:28rem; overflow:auto;"></div>
          </div>`;

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
        } catch (e) {
            this._fuentesImportadas = null;
            if (info) info.textContent = '❌ ' + (e.message || 'No se pudo leer el archivo.');
            this.actualizarInfoFuentes();
        }
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
            return { cita: this._citaDesdeRef(ref, anio), ref, titulo, anio, resumen };
        }).filter(Boolean).filter(x => x.titulo || x.ref);
    },

    // Deriva la cita corta (Apellido, año) desde la referencia APA completa:
    // "García, J., López, M. & Ruiz, P. (2023). ..." → (García et al., 2023).
    _citaDesdeRef(ref, anioFallback) {
        const r = String(ref || '');
        const anio = (r.match(/\((\d{4}[a-z]?|s\.\s*f\.)\)/) || [])[1] || anioFallback || 's. f.';
        const preAnio = r.split(/\(\s*(?:\d{4}|s\.\s*f\.)/)[0] || '';
        // Autores "Apellido, X." (iniciales con punto), tolerando compuestos.
        const m = [...preAnio.matchAll(/([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚáéíóúñÑ'’-]+(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚáéíóúñÑ'’-]+)*)\s*,\s*(?:[A-ZÁÉÍÓÚÑ]\.\s*)+/g)];
        const apellidos = m.map(x => x[1].trim()).filter(Boolean);
        if (!apellidos.length) {
            const palabras = preAnio.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
            return palabras ? `(${palabras}, ${anio})` : `(s. a., ${anio})`;
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
        if (n.includes(',')) return n.split(',')[0].trim(); // "García, J." → García
        const partes = n.split(/\s+/);
        return partes[partes.length - 1]; // "Juan García" → García
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
            if (estado) estado.textContent = `✓ ${vars.length} variable(s) identificada(s). Revísalas y edítalas a tu criterio.`;
        } catch (e) {
            if (estado) estado.textContent = '❌ ' + (e.message || 'No se pudieron identificar las variables.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = t; }
        }
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
                instrucciones: 'Presenta la magnitud y relevancia del problema (con datos epidemiológicos o '
                    + 'de prevalencia SOLO si aparecen en los resúmenes de las fuentes), el contexto en que '
                    + 'ocurre, sus consecuencias y el vacío que justifica investigarlo. Cierra con la '
                    + 'formulación del problema en forma de pregunta.',
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
