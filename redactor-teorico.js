// ========================================
// REDACTOR DEL MARCO TEÓRICO (borrador asistido por IA) — Sesión A.
// La IA redacta un borrador sustentado ÚNICAMENTE en las fuentes de la matriz
// de revisión (respetando el filtro de relevancia). Anti-alucinación: solo puede
// citar las fuentes reales, con citas cortas ya construidas por la app, y las
// citas textuales solo pueden salir de los resúmenes.
//
// REDACCIÓN: vía Worker de GEMINI (proveedor dedicado del redactor), con el
// contrato de SÍNTESIS CIENTÍFICA (por ejes temáticos, no autor por autor).
//
// IMPORTANTE (honestidad académica): el resultado es un BORRADOR de trabajo.
// El investigador debe verificar cada cita contra la fuente original, corregir
// y reescribir con su propia voz antes de usarlo en la tesis.
// ========================================
const RedactorTeorico = {
    _VERSION: 'F7-coherencia',
    _textos: {}, // secciones redactadas: { clave: { titulo, texto, fuentesUsadas } }
    montar() {
        if (this._montado) return; // guardia: montar() dos veces duplicaría listeners
        const cont = document.getElementById('antRedactor');
        if (!cont) return; // el buscador aún no está montado
        this._montado = true;
        cont.innerHTML = `
          <div class="form-group" style="margin-top:1.5rem; padding-top:1.2rem; border-top:1px dashed var(--color-border, #e5e5e5);">
            <h3 style="margin:0 0 0.3rem; font-size:1.05rem;">📝 Redacción del marco teórico (borrador asistido)</h3>
            <p class="help-text" style="margin:0 0 0.6rem;">La IA redacta un borrador sustentado <strong>únicamente en las fuentes de tu matriz</strong> (respetando el filtro de relevancia). Es un punto de partida: <strong>verifica cada cita contra la fuente original</strong>, corrige y reescribe con tu voz antes de usarlo.</p>
            <div id="redFuentesInfo" class="help-text" style="margin:0 0 0.8rem;"></div>
            <div style="margin:0 0 1rem; padding:0.7rem 0.9rem; border:1px dashed var(--color-border, #ccc); border-radius:0.5rem;">
              <label class="label" style="display:block; margin:0 0 0.5rem;">📂 Matriz de fuentes para redactar</label>
              <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
                <button id="redUsarGenerada" class="btn btn-primary" style="padding:0.4rem 1rem;">📊 Usar la matriz generada</button>
                <button id="redSubirArchivo" class="btn btn-outline" style="padding:0.4rem 1rem;">📁 Subir archivo (.xlsx / .csv)</button>
                <input type="file" id="redArchivo" accept=".xlsx,.csv" style="display:none;">
                <button id="redQuitarImport" class="btn btn-outline" style="padding:0.25rem 0.7rem; display:none;">✕ Quitar matriz importada</button>
              </div>
              <p class="help-text" style="margin:0.5rem 0 0.2rem;">🎯 <b>Filtrar por relevancia:</b> 
                <select id="redFiltroRel" style="padding:0.15rem 0.4rem;">
                  <option value="0">Todas las fuentes</option>
                  <option value="2">Media y alta</option>
                  <option value="3">Solo alta</option>
                </select> <span id="redFiltroRelInfo" class="help-text"></span></p>
              <p class="help-text" style="margin:0.4rem 0 0;"><b>Usar la matriz generada</b>: redacta con lo que tengas ahora en el Buscador (respetando el filtro de relevancia). <b>Subir archivo</b>: usa una matriz exportada antes — Excel (.xlsx), CSV español (;) o CSV internacional (,) — sin repetir la búsqueda.</p>
              <div id="redImportInfo" class="help-text" style="margin-top:0.4rem;"></div>
            </div>
            <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; margin-top:0.2rem;">
              <button id="redRedactarTodo" class="btn btn-primary" style="padding:0.45rem 1.1rem;">📄 Redactar marco teórico completo</button>
              <button id="redProbar" class="btn btn-outline" style="padding:0.4rem 1rem;">✍️ Probar solo una sección</button>
              <button id="redDescargarWord" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">⬇ Descargar Word (.docx)</button>
              <button id="redDescargarPDF" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">⬇ Descargar PDF</button>
              <button id="redPaseF3" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">🧪 Pase de coherencia (F3)</button>
              <button id="redCopiar" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">📋 Copiar texto</button>
            </div>
            <p class="help-text" style="margin:0.4rem 0 0;">El documento completo redacta todas las secciones en paralelo (planteamiento, estado de la cuestión, antecedentes, bases teóricas y modelos por variable, justificación y definiciones), con la regla de oro: <strong>toda idea con su cita</strong>. Al terminar podrás descargarlo como Word (.docx) en formato APA con las referencias al final.</p>
            <div id="redEstado" class="help-text" style="margin-top:0.5rem;"></div>
            <a id="redRecuperar" href="#" class="help-text" style="display:none; margin-top:0.3rem; text-decoration:underline; cursor:pointer;">📂 Recuperar última redacción</a>
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
        console.info('[Redactor] versión ' + this._VERSION + ' activa · verificación: RedactorTeorico.autotest()');
        const rec = document.getElementById('redRecuperar');
        if (rec) {
            rec.addEventListener('click', (ev) => { ev.preventDefault(); this._recuperarUltimo(); });
            try {
                const g = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(this._CLAVE_GUARDADO)) || 'null');
                if (g && Array.isArray(g.secciones) && g.secciones.length) {
                    const min = Math.max(1, Math.round((Date.now() - (g.t || Date.now())) / 60000));
                    rec.textContent = `📂 Recuperar última redacción (hace ${min < 60 ? min + ' min' : Math.round(min / 60) + ' h'})`;
                    rec.style.display = '';
                }
            } catch (e) {}
        }
        const inpArchivo = document.getElementById('redArchivo');
        if (inpArchivo) inpArchivo.addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) this._onArchivo(f);
            e.target.value = ''; // permite volver a cargar el mismo archivo
        });
        const btnQuitar = document.getElementById('redQuitarImport');
        if (btnQuitar) btnQuitar.addEventListener('click', () => this._quitarImportadas());
        const bSubir = document.getElementById('redSubirArchivo');
        if (bSubir) bSubir.addEventListener('click', () => {
            const f = document.getElementById('redArchivo');
            if (f) f.click();
        });
        const bGen = document.getElementById('redUsarGenerada');
        if (bGen) bGen.addEventListener('click', () => {
            const q2 = document.getElementById('redQuitarImport');
            if (q2 && q2.style.display !== 'none') q2.click();
            else this.actualizarInfoFuentes();
            const info = document.getElementById('redImportInfo');
            if (info) info.textContent = '📊 Redactando con la matriz generada en el Buscador (con su filtro de relevancia).';
        });
        const btnTodo = document.getElementById('redRedactarTodo');
        if (btnTodo) btnTodo.addEventListener('click', () => this._onRedactarTodo());
        const btnWord = document.getElementById('redDescargarWord');
        if (btnWord) btnWord.addEventListener('click', () => this._onDescargarWord());
        const btnPDF = document.getElementById('redDescargarPDF');
        if (btnPDF) btnPDF.addEventListener('click', () => this._onDescargarPDF());
        const btnF3 = document.getElementById('redPaseF3');
        if (btnF3) btnF3.addEventListener('click', () => this._onPaseF3());
        const selRel = document.getElementById('redFiltroRel');
        if (selRel) selRel.addEventListener('change', () => {
            this._filtroRel = parseInt(selRel.value, 10) || 0;
            const guard = this._filtroRel; this._filtroRel = 0;
            const todas = this._fuentes(); const tot = todas.length;
            const sinDato = todas.filter(f => this._rangoRelevancia(f) === 0).length;
            this._filtroRel = guard;
            const pasan = this._fuentes().length;
            const info = document.getElementById('redFiltroRelInfo');
            if (info) info.textContent = guard === 0 ? '' : `→ ${pasan} de ${tot} fuente(s) pasan el filtro${sinDato ? ` (${sinDato} sin dato de relevancia, incluidas)` : ''}.`;
        });
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
    // Reconstruye la cita corta APA a partir de la lista de autores reales.
    // ============ F2.6: SANEADOR DE AUTORES Y CITAS (fixtures reales) ============
    // Palabras y frases de REVISTA que jamás son un autor (lista viva: casos reales del jurado).
    _PALABRAS_REVISTA: /^(research|intelligence|frontiers?|journal(s)?|revista(s)?|review(s)?|ciencias?|sciences?|magazine|mag|kosmos|psiquemag|editorial|proceedings|press|universidad|university|latam|redacción|redaccion|autor(es)?|author(s)?|anonymous|anónimo|anonimo|admin|online|education|educación|educacion|psychology|psicología|psicologia|neurociencias?|neuropsicolog[a-záéíóúüñ]*|psicopedagog[a-záéíóúüñ]*|pedagog[a-záéíóúüñ]*|sociolog[a-záéíóúüñ]*|antropolog[a-záéíóúüñ]*|medicina|enfermer[a-záéíóúüñ]*|salud|tecnolog[a-záéíóúüñ]*|innovaci[a-záéíóúüñ]*|investigaci[a-záéíóúüñ]*|docencia|educativ[a-záéíóúüñ]*|académic[a-záéíóúüñ]*|academic[a-záéíóúüñ]*|universitari[a-záéíóúüñ]*|científic[a-záéíóúüñ]*|cientific[a-záéíóúüñ]*|multidisciplinar[a-záéíóúüñ]*|interdisciplinar[a-záéíóúüñ]*|iberoamerican[a-záéíóúüñ]*|latinoamerican[a-záéíóúüñ]*|horizontes?|scielo|redalyc|dialnet|scopus|elsevier|springer|wiley|mdpi|heliyon|plos)$/i,
    _FRASES_REVISTA: /^(ciencia latina|frontiers in\b.*|revista\b.*|journal of\b.*|international journal\b.*|res non verba.*)$/i,
    // Nombres de pila frecuentes (es/en): si encabezan un token multi-palabra sin coma, se descartan
    // para citar por el APELLIDO (el jurado no perdona un «(Oscar Magna et al., 2025)»).
    _NOMBRES_PILA: /^(oscar|óscar|maría|maria|josé|jose|juan|luis|carlos|ana|pedro|jorge|miguel|david|daniel|laura|paola|diego|pablo|sergio|andrés|andres|felipe|ricardo|roberto|fernando|francisco|javier|antonio|manuel|alejandro|cristian|christian|gabriel|gabriela|camila|valeria|sofía|sofia|lucía|lucia|elena|marta|rosa|carmen|julia|sara|john|michael|james|robert|william|mary|jennifer|linda|richard|thomas|charles|susan|jessica|karen|kevin|brian|mark|paul|steven|george|edward|peter|ryan)$/i,
    _PARTICULAS_AP: /^(de|del|der|den|da|das|dos|di|du|la|las|los|le|van|von|ter|ten|mac|mc|san|santa)$/i,
    _sanearAutor(a) {
        let s = String(a || '').trim();
        if (!s) return '';
        s = s.replace(/^[\s\-–—]+|[\s\-–—]+$/g, '');      // guiones colgantes («Orgambídez Ramos -»)
        if (/[@]|https?:\/\//i.test(s)) return '';        // correos y URLs jamás son autores
        if (/^[\w.-]+\.(com|org|net|edu|gov|io|es|mx|pe|co|cl|ar|br)$/i.test(s)) return ''; // «gmail.com» no es un autor
        // ' - ' con espacios NUNCA forma parte de un apellido real (los compuestos
        // van sin espacios: García-Álvarez). Se corta SIEMPRE y se queda lo de la izquierda.
        s = s.split(/\s+[-–—]\s+/)[0].trim();
        if (!s || /\d/.test(s)) return '';                // años o cifras incrustadas: fuera
        if (this._PALABRAS_REVISTA.test(s) || this._FRASES_REVISTA.test(s)) return '';
        // CamelCase interno (PsiqueMag, EduPsykhé) delata marca/revista — se salvan Mc/Mac/De/Di/La/O'
        if (/^\p{Lu}\p{Ll}+\p{Lu}/u.test(s) && !/^(Mc|Mac|De|Di|La|O')/.test(s)) return '';
        // «Oscar Magna» → «Magna»: pelar nombres de pila al frente (sin coma = orden Nombre Apellido)
        if (!s.includes(',')) {
            let toks = s.split(/\s+/);
            while (toks.length > 1 && this._NOMBRES_PILA.test(toks[0])) toks.shift();
            s = toks.join(' ');
        }
        if (s.length >= 4 && !/[a-zà-öø-ÿ]/.test(s) && !/\[/.test(s))
            s = s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (x, p, c) => p + c.toUpperCase());
        return s;
    },
    // ========== VALIDADOR-REPARADOR DE CITAS (puerta única) ==========
    // La cita es lo único que el lector ve: si huele a revista, correo o cifra,
    // se reconstruye (autores → referencia → título) antes de dejarla citar.
    // ============ REFERENCIAS: la lista final también se sanea ============
    // La cita estaba protegida; la LISTA imprimía f.ref crudo de la matriz:
    // revista fundida en los autores, «[PDF]», años-como-iniciales, un segundo
    // bloque de autores tras el año… Un jurado metodológico lo caza al vuelo.
    _esRefSucia(ref) {
        const r = String(ref || '');
        if (!r.trim()) return true;
        if (/\[(PDF|HTML|B|BOOK|CITATION)\]/i.test(r)) return true;
        if (/[\p{L}][-–]\s+[A-ZÀ-Ž]/u.test(r)) return true;                    // «Ziegler- High Ability…»
        if (/\by\s+\d{4}\s*\.?\s*\(/.test(r)) return true;                  // «…S. y 2025.(2025)»
        if (/@/.test(r)) return true;
        if (/\((?:19|20)\d{2}[a-z]?\)\.\s*[A-ZÀ-Ž][\p{L}’'-]+(?:\s+[A-ZÀ-Ž][\p{L}’'-]+)?,\s*[A-ZÀ-Ž]\./u.test(r)) return true; // 2º bloque de autores tras el año
        if (/(https?:\/\/\S+).*https?:\/\//.test(r)) return true;             // URLs dobles
        return false;
    },
    _tituloOracion(s) {
        const x = String(s || '').trim();
        if (!x || /[a-zà-ÿ]/.test(x)) return x;
        return x.toLowerCase().replace(/(^|[:.?!]\s+)(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
    },
    _refReconstruir(f) {
        const orig = String(f.ref || '');
        const anio = f.anio || 's. f.';
        let head = '';
        const iAnio = orig.search(/\(\s*(?:19|20)\d{2}[a-z]?\s*\)|\(\s*s\.\s*f\.\s*\)/);
        if (iAnio > 0) {
            const cand = orig.slice(0, iAnio).trim().replace(/[.,;\s]+$/, '');
            if (cand && !this._esRefSucia(cand + ' (2000). x.') && !/\d/.test(cand) && cand.length <= 220) head = cand + ' ';
        }
        if (!head && Array.isArray(f.autores) && f.autores.length)
            head = f.autores.slice(0, 7).join(', ').replace(/, ([^,]+)$/, ' y $1') + ' ';
        const titulo = this._tituloOracion(f.titulo || '').replace(/[.\s]+$/, '');
        const doi = String(f.doi || '').trim();
        const urlM = !doi && (orig.match(/https?:\/\/\S+/) || [])[0];
        const cola = doi ? ` https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}` : (urlM ? ' ' + urlM.replace(/[).,;]+$/, '') : '');
        const cuerpo = head ? `${head}(${anio}). ${titulo}.${cola}` : `${titulo}. (${anio}).${cola}`;
        return cuerpo.replace(/\s{2,}/g, ' ').trim();
    },
    _esCitaSucia(cita) {
        const inner = String(cita || '').replace(/^\(|\)$/g, '').trim();
        if (!inner) return true;
        const sinAnio = inner.replace(/,\s*(?:19|20)\d{2}[a-z]?$/, '').replace(/,\s*s\.\s*f\.$/, '');
        if (/[@]|https?:|\s[-–—]\s|\d/.test(sinAnio)) return true;
        if (/[-–—]$/.test(sinAnio.trim())) return true;                 // guion colgante antes del año
        if (/\b[\w-]+\.(com|org|net|edu|gov|io)\b/i.test(sinAnio)) return true; // dominios promovidos a autor
        if (/\[(HTML|PDF|B|BOOK|CITATION)\]|supplemental material/i.test(inner)) return true; // basura de scraping
        return sinAnio.split(/\s+y\s+|;\s*|,\s*|\s+et al\.?/).some(tok =>
            tok && (this._PALABRAS_REVISTA.test(tok.trim()) || this._FRASES_REVISTA.test(tok.trim())));
    },
    _citaDesdeTitulo(titulo, anio) {
        const cortas = String(titulo || '').split(/\s+/).slice(0, 4).join(' ').replace(/[.,;:]+$/, '');
        return cortas ? `(“${cortas}”, ${anio || 's. f.'})` : '';
    },
    _repararCita(f) {
        const limpios = (f.autores || []).map(a => this._sanearAutor(a)).filter(Boolean);
        let c = limpios.length ? this._citaDesdeAutores(limpios, f.anio) : '';
        if (!c || this._esCitaSucia(c)) c = this._citaDesdeRef(f.ref, f.anio);
        if (!c || this._esCitaSucia(c)) c = this._citaDesdeTitulo(f.titulo, f.anio);
        return c;
    },
    // Surrogates huérfanos y caracteres de control del scraping: JSON.stringify
    // los escapa feliz, el navegador los envía feliz… y el parser de Gemini
    // devuelve 400 INVALID_ARGUMENT con TODAS las claves. Invisibles para todos
    // menos para la API — se ejecutan aquí, en la puerta única.
    _limpiarUnicode(s) {
        return String(s == null ? '' : s)
            .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
            .replace(/(^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g, '$1')
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    },
    // Relevancia normalizada a rango 1-3 (alta=3): acepta «Alta/Media/Baja»,
    // números 1-5, porcentajes… 0 = sin dato (SIEMPRE pasa: no se pierde en silencio).
    _rangoRelevancia(f) {
        const v = String((f && f.relevancia) || '').toLowerCase().trim();
        if (!v) return 0;
        if (/alta|high/.test(v)) return 3;
        if (/media|medium|moderada/.test(v)) return 2;
        if (/baja|low/.test(v)) return 1;
        const n = parseFloat(v.replace(',', '.'));
        if (!isFinite(n)) return 0;
        if (n > 5) return n >= 75 ? 3 : n >= 50 ? 2 : 1;
        return n >= 4 ? 3 : n >= 3 ? 2 : 1;
    },
    _sanearFuentes(lista) {
        if (!Array.isArray(lista)) return lista;
        let reparadas = 0, irreparables = 0, corruptos = 0, refsRec = 0;
        for (const f of lista) {
            if (!f || f._citaOK) continue;
            // Texto envenenado del scraping (surrogates rotos, controles) → limpiar TODO
            for (const campo of ['titulo', 'resumen', 'ref', 'cita']) {
                const v = f[campo];
                if (typeof v === 'string' && v) {
                    const limpio = this._limpiarUnicode(v);
                    if (limpio !== v) { f[campo] = limpio; corruptos++; }
                }
            }
            if (Array.isArray(f.autores)) f.autores = f.autores.map(a => this._limpiarUnicode(a));
            // Entidades/etiquetas HTML del scraping y CITA AJENA incrustada como título
            // («Ferrándiz García, C. et al.(2025). Inteligencia…» dentro de titulo).
            if (f.titulo) {
                f.titulo = String(f.titulo).replace(/&lt;\/?\w+&gt;|<\/?\w+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
                    .replace(/^\s*[A-ZÀ-Ž][\p{L}’' .-]+,\s*[A-ZÀ-Ž]\.[^()]{0,60}\(\s*(?:19|20)\d{2}[a-z]?\s*\)\.\s*/u, '').trim();
            }
            // Prefijos de scraping de Scholar en el título («[HTML] Interventions…»)
            if (f.titulo) f.titulo = String(f.titulo).replace(/^\s*\[(HTML|PDF|B|BOOK|CITATION|CITAS)\]\s*/i, '').trim();
            if (Array.isArray(f.autores)) f.autores = f.autores.map(a => this._sanearAutor(a)).filter(Boolean);
            // Año perdido pero presente en la referencia → rescatarlo (mata los «s. f.» falsos)
            if (!f.anio) { const m = String(f.ref || '').match(/\((?:19|20)\d{2}[a-z]?\)/); if (m) f.anio = m[0].replace(/[()]/g, ''); }
            const sfFalso = f.anio && /s\.\s*f\./.test(String(f.cita || ''));
            if (sfFalso || this._esCitaSucia(f.cita)) {
                const nueva = this._repararCita(f);
                if (nueva && !this._esCitaSucia(nueva)) { f.cita = nueva; reparadas++; if (f.doi) f._autoresPendientes = true; }
                else irreparables++;
            }
            // La REFERENCIA de la lista final: si huele rota, se reconstruye limpia
            if (this._esRefSucia(f.ref)) { f.ref = this._refReconstruir(f); refsRec++; }
            f._citaOK = true;
        }
        // Filas gemelas por DOI + pseudo-registros que NUNCA deben competir por
        // relevancia: material suplementario, erratas, portadas… (aguas arriba).
        const BASURA = /^(supplemental material|supplementary material|correction to|corrigendum|erratum|retraction|retracted|editorial board|table of contents|front matter|issue information|copyright page)/i;
        const doisVistos = new Set(); let dupDoi = 0, excluidas = 0;
        const filtrada = lista.filter(f => {
            if (BASURA.test(String(f && f.titulo || '')) || BASURA.test(String(f && f.ref || ''))) { excluidas++; return false; }
            const d = String(f && f.doi || '').trim().toLowerCase();
            if (!d) return true;
            if (doisVistos.has(d)) { dupDoi++; return false; }
            doisVistos.add(d); return true;
        });
        // Duplicados-traducción (misma obra en dos idiomas/fuentes, DOIs hermanos):
        // se REPORTAN, no se borran — decidir cuál va es del tesista.
        const porAutorAnio = new Map();
        for (const f of filtrada) {
            const ap = ((f.autores && f.autores[0]) || String(f.cita || '').replace(/^\(/, '').split(/[,y]/)[0] || '').trim().toLowerCase();
            if (!ap || !f.anio) continue;
            const k = ap + '|' + f.anio;
            if (!porAutorAnio.has(k)) porAutorAnio.set(k, []);
            porAutorAnio.get(k).push(f);
        }
        const posiblesDuplicados = [];
        for (const grupo of porAutorAnio.values()) {
            for (let a = 0; a < grupo.length; a++) for (let b = a + 1; b < grupo.length; b++) {
                const dA = String(grupo[a].doi || '').toLowerCase(), dB = String(grupo[b].doi || '').toLowerCase();
                const stem = d => d.replace(/[0-9a-z]$/, '');
                const tj = (x, y) => { const A = new Set(this._normTexto(x).split(/\s+/).filter(w => w.length > 3)); const B = new Set(this._normTexto(y).split(/\s+/).filter(w => w.length > 3)); let i = 0; for (const w of A) if (B.has(w)) i++; return i / (Math.min(A.size, B.size) || 1); };
                if ((dA && dB && dA !== dB && stem(dA) === stem(dB)) || tj(grupo[a].titulo, grupo[b].titulo) > 0.5)
                    posiblesDuplicados.push(`${grupo[a].cita} ↔ ${grupo[b].cita}`);
            }
        }
        if ((dupDoi || excluidas) && lista === this._fuentesImportadas) this._fuentesImportadas = filtrada;
        // 🎯 Filtro por relevancia: también sobre matrices IMPORTADAS.
        const rk = this._filtroRel || 0;
        if (rk > 0) return filtrada.filter(f => { const r = this._rangoRelevancia(f); return r === 0 || r >= rk; });
        if (reparadas || irreparables || dupDoi || excluidas || corruptos || refsRec || posiblesDuplicados.length) {
            this._ultimoSaneo = { reparadas, irreparables, dupDoi, excluidas, corruptos, refsRec, posiblesDuplicados };
            if (typeof console !== 'undefined') console.info(`[Redactor] citas saneadas: ${reparadas} reparadas` + (irreparables ? `, ${irreparables} irreparables (revisar matriz)` : '') + (dupDoi ? `, ${dupDoi} fila(s) gemela(s) por DOI fundida(s)` : '') + (excluidas ? `, ${excluidas} pseudo-registro(s) basura excluido(s)` : '') + (corruptos ? `, ${corruptos} campo(s) con caracteres corruptos limpiados` : '') + (refsRec ? `, ${refsRec} referencia(s) APA reconstruida(s)` : '') + (posiblesDuplicados.length ? `; ⚠️ posibles duplicados: ${posiblesDuplicados.join(' · ')}` : ''));
        }
        return filtrada;
    },
    _citaDesdeAutores(autores, anio) {
        const aps = (autores || []).map(a => this._apellido(a)).filter(Boolean);
        const y = anio || 's. f.';
        if (!aps.length) return '';
        if (aps.length === 1) return `(${aps[0]}, ${y})`;
        if (aps.length === 2) return `(${aps[0]} y ${aps[1]}, ${y})`;
        return `(${aps[0]} et al., ${y})`;
    },
    // Completa en segundo plano los resúmenes faltantes de la matriz importada,
    // consultando por DOI la misma cascada del buscador. No bloquea; informa.
    async _completarResumenes() {
        if (!this._fuentesImportadas || typeof Antecedentes === 'undefined' || !Antecedentes._recuperarDatos) return;
        const pendientes = this._fuentesImportadas.filter(f =>
            f.doi && ((!f.resumen || f.resumen.length < 40) || f._autoresPendientes));
        if (!pendientes.length) return;
        this._reparandoDOI = true;
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
                        const autoresLimpios = (datos.autores || []).map(a => this._sanearAutor(a)).filter(Boolean);
                        const nuevaCita = this._citaDesdeAutores(autoresLimpios, f.anio || datos.anio);
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
        this._reparandoDOI = false;
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
        const mSep = t.match(/^sep=(.)\r?\n/i);
        let sep = null;
        if (mSep) { sep = mSep[1]; t = t.slice(mSep[0].length); }
        if (!sep) {
            const primera = t.split(/\r?\n/, 1)[0] || '';
            let pc = 0, py = 0, dentro = false;
            for (const ch of primera) {
                if (ch === '"') dentro = !dentro;
                else if (!dentro && ch === ';') pc++;
                else if (!dentro && ch === ',') py++;
            }
            sep = pc >= py ? ';' : ',';
        }
        const filas = [];
        let fila = [], campo = '', dentro = false;
        for (let i = 0; i < t.length; i++) {
            const ch = t[i];
            if (dentro) {
                if (ch === '"') {
                    if (t[i + 1] === '"') { campo += '"'; i++; }
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
    // ExcelJS BAJO DEMANDA: el index.html la carga, pero si ese <script> falló
    // (CDN caído, bloqueador de anuncios, red inestable) la librería queda
    // muerta toda la sesión. Aquí el redactor se cura solo: la inyecta él
    // mismo, con CDN de respaldo, en vez de rendirse con "recarga la página".
    _EXCELJS_URLS: [
        'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
        'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'
    ],
    _cargaExcelJS: null,
    async _asegurarExcelJS() {
        if (typeof ExcelJS !== 'undefined') return;
        if (!this._cargaExcelJS) {
            this._cargaExcelJS = (async () => {
                for (const url of this._EXCELJS_URLS) {
                    const ok = await new Promise(res => {
                        const s = document.createElement('script');
                        s.src = url; s.async = true;
                        const tid = setTimeout(() => { s.remove(); res(false); }, 12000);
                        s.onload = () => { clearTimeout(tid); res(true); };
                        s.onerror = () => { clearTimeout(tid); s.remove(); res(false); };
                        document.head.appendChild(s);
                    });
                    if (ok && typeof ExcelJS !== 'undefined') return;
                }
                throw Object.assign(new Error('No se pudo cargar la librería de Excel desde ningún CDN. Revisa tu conexión o desactiva bloqueadores para cdnjs.cloudflare.com / cdn.jsdelivr.net y reintenta.'), { codigo: 'EXCELJS_NO_CARGA', reintentable: true });
            })();
        }
        try { await this._cargaExcelJS; }
        catch (e) { this._cargaExcelJS = null; throw e; } // fallo: permitir reintentar
    },
    // Lee la primera hoja de un .xlsx (con ExcelJS asegurado bajo demanda).
    async _parsearXLSX(buffer) {
        await this._asegurarExcelJS();
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
        const iRel = col('relevancia', 'nivel de relevancia', 'relevance', 'prioridad');
        if (iTitulo < 0 || iRef < 0) {
            throw new Error('El archivo no parece una matriz exportada por la app (faltan las columnas «Título» y «Referencia (APA)»).');
        }
        const limpiar = s => String(s == null ? '' : s).replace(/<[^>]+>/g, '').trim();
        const lista = filas.map(f => {
            const titulo = limpiar(f[iTitulo]);
            const ref = limpiar(f[iRef]);
            if (!titulo && !ref) return null;
            const anio = limpiar(iAnio >= 0 ? f[iAnio] : '') || (ref.match(/\((\d{4})[a-z]?\)/) || [])[1] || '';
            let resumen = limpiar(iResultados >= 0 ? f[iResultados] : '');
            if (!resumen) {
                const partes = [];
                if (iObjetivos >= 0 && limpiar(f[iObjetivos])) partes.push('Objetivos: ' + limpiar(f[iObjetivos]));
                if (iMuestra >= 0 && limpiar(f[iMuestra])) partes.push('Muestra: ' + limpiar(f[iMuestra]));
                if (iConclusiones >= 0 && limpiar(f[iConclusiones])) partes.push('Conclusiones: ' + limpiar(f[iConclusiones]));
                resumen = partes.join(' ');
            }
            const linkCrudo = limpiar(iLink >= 0 ? f[iLink] : '');
            const doi = /doi\.org\//.test(linkCrudo) || /^10\./.test(linkCrudo) ? linkCrudo : '';
            const autoresCol = limpiar(iAutor >= 0 ? f[iAutor] : '')
                .split(/;\s*/).map(s => this._sanearAutor(s)).filter(Boolean); // F2.6
            let cita, autoresPendientes;
            if (autoresCol.length) {
                cita = this._citaDesdeAutores(autoresCol, anio);
                autoresPendientes = false;
            } else {
                cita = this._citaDesdeRef(ref, anio);
                autoresPendientes = /^\("/.test(cita) || cita.startsWith('(s. a.');
            }
            return { cita, ref, titulo, anio, resumen, doi, autores: autoresCol, _autoresPendientes: autoresPendientes };
        }).filter(Boolean).filter(x => x.titulo || x.ref);
        const vistosDedup = new Set();
        return lista.filter(x => {
            const k = this._normTexto(x.titulo).slice(0, 90) + '|' + (x.anio || '');
            if (k !== '|' && vistosDedup.has(k)) return false;
            vistosDedup.add(k); return true;
        });
    },
    // Deriva la cita corta (Apellido, año) desde la referencia APA completa.
    _citaDesdeRef(ref, anioFallback) {
        const r = String(ref || '');
        const anio = (r.match(/\((\d{4}[a-z]?|s\.\s*f\.)\)/) || [])[1] || anioFallback || 's. f.';
        const preAnio = r.split(/\(\s*(?:\d{4}|s\.\s*f\.)/)[0] || '';
        const M = 'A-ZÀ-ÖØ-ÞĀ-Ž', m_ = 'a-zà-öø-ÿā-ž';
        // F2.2: partículas de apellidos compuestos («de la Cruz», «van Dijk»).
        const PART = '(?:[Dd]e(?:l|\\s+la|\\s+las|\\s+los)?|[Ll]a|[Ll]as|[Ll]os|[Vv]an|[Vv]on|[Dd]a|[Dd]as|[Dd]os|[Dd]i|[Dd]u|[Ll]e|[Tt]er|[Tt]en|[Mm]ac|[Mm]c|[Ss]an(?:ta)?)';
        const AP = `[${M}][${M}${m_}'’-]+`;
        const m = [...preAnio.matchAll(new RegExp(`((?:${PART}\\s+)*${AP}(?:\\s+(?:${PART}\\s+)*${AP})*)\\s*,\\s*(?:[${M}]\\.\\s*)+`, 'g'))];
        const apellidos = m.map(x => x[1].trim()).filter(a => a && !new RegExp(`^([${M}]\\.?\\s*)+$`).test(a));
        if (!apellidos.length) {
            const palabras = preAnio.trim().split(/\s+/).filter(Boolean);
            const soloIniciales = palabras.length && palabras.every(p => new RegExp(`^([${M}${m_}]\\.?,?)+$`).test(p));
            if (!palabras.length || soloIniciales) {
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
        if (this._fuentesImportadas && this._fuentesImportadas.length) return this._sanearFuentes(this._fuentesImportadas);
        if (typeof Antecedentes === 'undefined' || !Antecedentes.obtenerFuentesRedaccion) return [];
        const obras = Antecedentes.obtenerFuentesRedaccion();
        return this._sanearFuentes(obras.map(o => ({
            cita: this._citaCorta(o),
            ref: (Antecedentes.citaAPA ? Antecedentes.citaAPA(o) : ''),
            titulo: o.titulo || '',
            anio: o.anio || '',
            relevancia: iRel >= 0 ? String(f[iRel] ?? '').trim() : '',
            resumen: o.resumen || o.abstract || ''
        })));
    },
    _apellido(nombre) {
        const n = String(nombre || '').trim();
        if (!n) return '';
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
        const problema = (document.getElementById('antQuery') || {}).value || '';
        const caja = document.getElementById('redVariables');
        const estado = document.getElementById('redEstado');
        const btn = document.getElementById('redIdentificar');
        if (problema.trim().length < 15) {
            if (estado) estado.textContent = '⚠️ Escribe primero el problema de investigación (arriba, en «Búsqueda intensiva»).';
            const p = document.getElementById('antQuery'); if (p) p.focus();
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
    // DOCUMENTO COMPLETO: plan, orquestación y Word APA
    // ============================================================
    _documento: null, // { secciones: [{titulo, texto}], fuentes, citadas }
    // Enfriamiento entre lotes del mismo canal. Con Gemini el cuello suele ser
    // el límite de peticiones/minuto del tier gratuito (no los tokens): 15 s por
    // canal es prudente. Si vieras errores de cuota (429), súbelo; el failover
    // del Worker entre claves también amortigua los picos. (0 en tests.)
    // Respiro entre llamadas del MISMO canal. Antes 15000: herencia de cuando los
    // canales compartían claves a ciegas. Hoy keyHint da canal↔clave 1:1 en el
    // Worker, así que una clave recibe ~1.5 llamadas/min (≪ 10 RPM del free tier):
    // basta un margen corto anti-ráfaga para respuestas que vuelven en 1-2 s.
    _ENFRIAMIENTO_MS: 4000,
    // Tope de secciones simultáneas (independiente del nº de claves): evita
    // que muchas llamadas pesadas golpeen Gemini a la vez. 4 = rápido sin ahogar.
    // Techo de canales paralelos. El real es min(claves, tareas, este techo):
    // con 10 claves → 10 en vuelo (17 partes ≈ 2 tandas ≈ 70-90 s en vez de 3 min).
    // 24 acompaña el plan de crecer a 30-40 claves (RL_IP del Worker: 120/min);
    // ojo: el paralelismo REAL lo acota el nº de PARTES (con 239 fuentes ≈ 17).
    _MAX_CANALES_REDACCION: 24,
    _STAGGER_MS: 300, // escalonado de arranque entre canales (no golpear el Worker en el mismo ms)
    _normTexto(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },
    // Variables desde el textarea: [{nombre, definicion, instrumento}]
    _leerVariables() {
        const t = (document.getElementById('redVariables') || {}).value || '';
        return t.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
            // Separador flexible: raya larga/media en cualquier posición; el guion
            // corto SOLO rodeado de espacios — nombres como «auto-eficacia» o
            // «socio-emocional» no deben partirse jamás (bug G2 del plan).
            let partes = l.split(/\s*[—–]\s*/);
            if (partes.length === 1) partes = l.split(/\s+-\s+/);
            const nombre = partes[0];
            let definicion = partes.slice(1).join(' — ').trim(), instrumento = '';
            const mi = definicion.match(/\s*[—-]\s*Instrumento\s*:\s*(.+)$/i);
            if (mi) { instrumento = mi[1].trim(); definicion = definicion.slice(0, mi.index).trim(); }
            return { nombre: (nombre || '').trim(), definicion, instrumento };
        }).filter(v => v.nombre);
    },
    // Plan de secciones (dinámico según las variables). partes:'auto' = la
    // sección se divide en ceil(fuentes/MAX) partes: reparto EQUITATIVO del
    // corpus completo con cada llamada dentro de su zona de calidad.
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
                + 'estudio por estudio): agrupa hallazgos convergentes y señala discrepancias y vacíos. '
                + 'Responde implícitamente, en este orden: dónde COINCIDEN los estudios, dónde DISCREPAN, y '
                + 'POR QUÉ podrían discrepar (medidas distintas, poblaciones, diseños); el lector debe llegar '
                + 'al final sintiendo que la investigación propuesta es la consecuencia lógica del recorrido. '
                + 'Si la evidencia es heterogénea (positiva, negativa y nula), conviértelo en argumento de defensa: '
                + 'la falta de homogeneidad JUSTIFICA contrastar empíricamente la relación en la población específica.' });
        plan.push({ titulo: 'Antecedentes', capitulo: 'II', afinidad: '', partes: 'auto',
            instrucciones: 'Redacta los antecedentes como una SÍNTESIS POR EJES TEMÁTICOS, no como un desfile '
                + 'de estudios. Agrupa las fuentes según lo que sus hallazgos evidencian (relaciones halladas, '
                + 'resultados divergentes, poblaciones o niveles de análisis, aproximaciones metodológicas) y '
                + 'desarrolla cada eje integrando VARIOS estudios por párrafo, con sus citas agrupadas. Haz que '
                + 'los estudios DIALOGUEN: convergencias, divergencias y qué sugiere cada contraste — y cierra '
                + 'el recorrido dejando claro qué se sabe ESPECÍFICAMENTE de la población del problema y qué no. Los datos '
                + 'de muestra, contexto o diseño solo se mencionan cuando son el argumento (p. ej., para explicar '
                + 'una discrepancia entre estudios). Cubre TODAS las fuentes de la lista, repartidas dentro de '
                + 'los ejes, y cierra cada eje con lo que el conjunto de la evidencia permite concluir.' });
        for (const v of variables) {
            plan.push({ titulo: `Bases teóricas: ${v.nombre}`, capitulo: 'II', afinidad: v.nombre + ' ' + v.definicion, partes: 1,
                instrucciones: `Desarrolla con profundidad la variable «${v.nombre}»: definiciones de distintos `
                    + `autores (cada una con su cita), evolución del concepto y componentes o dimensiones — `
                    + `contrastando las definiciones entre sí (en qué coinciden y en qué difieren), no como un `
                    + `listado. DELIMITACIÓN CONCEPTUAL OBLIGATORIA: si en las fuentes coexisten aproximaciones u `
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
            instrucciones: 'CIERRA el marco explicitando la CADENA completa por variable: definición → modelo '
                + 'adoptado → dimensiones → instrumento (de la FICHA, con su familia) → conexión explícita con '
                + 'el objetivo y las hipótesis. Para CADA variable de estudio, presenta su definición conceptual formal con la cita '
                + 'del autor correspondiente (una definición principal y, si las fuentes lo permiten, una alternativa). '
                + 'La definición final de cada variable debe corresponder EXACTAMENTE al modelo o aproximación '
                + 'adoptado en las bases teóricas (coherencia de delimitación conceptual).' });
        return plan;
    },
    // ¿Fuente de la OMS/organismo internacional de salud?
    _esOMS(f) {
        if (!f) return false;
        if (/OMS|IRIS/i.test(String(f.fuente || ''))) return true;
        if ((f.fuentesAPI || []).some(x => /OMS|IRIS|WHO/i.test(String(x)))) return true;
        return (f.autores || []).some(a => /Organizaci[oó]n Mundial de la Salud|World Health Organization|Organizaci[oó]n Panamericana|Pan American Health/i.test(String(a)));
    },
    // ¿Fuente de la ONU (no sanitaria)?
    _esONU(f) {
        if (!f || this._esOMS(f)) return false;
        if (/ONU|UNDL|ReliefWeb|Biblioteca Digital/i.test(String(f.fuente || ''))) return true;
        if ((f.fuentesAPI || []).some(x => /ONU|UNDL|ReliefWeb/i.test(String(x)))) return true;
        return (f.autores || []).some(a => /Naciones Unidas|United Nations|UNICEF|UNESCO|PNUD|UNDP|CEPAL/i.test(String(a)));
    },
    _priorizarOMS(fsel, fuentes, maxOMS, n, maxONU = Math.ceil(maxOMS / 2)) {
        const oms = fuentes.filter(f => this._esOMS(f)).slice(0, maxOMS);
        const onu = fuentes.filter(f => this._esONU(f)).slice(0, maxONU);
        const cabeza = [...oms, ...onu];
        if (!cabeza.length) return { fsel, oms: 0, onu: 0 };
        const resto = fsel.filter(f => !cabeza.includes(f));
        return { fsel: [...cabeza, ...resto].slice(0, Math.max(n, cabeza.length)), oms: oms.length, onu: onu.length };
    },
    // TESTAMENTO (CH1 del plan): hoy la única sección multi-parte (Antecedentes)
    // tiene afinidad vacía ⇒ rotación pura ⇒ partición correcta del corpus. PERO
    // si alguna vez una sección CON afinidad se hace multi-parte, sin 'excluir'
    // todas sus partes recibirían las MISMAS fuentes top-afines (bug silencioso).
    // El parámetro 'excluir' (Set por sección) desactiva esa mina para siempre.
    _seleccionarFuentes(fuentes, afinidad, n = 32, offset = 0, excluir = null) {
        if (excluir && excluir.size) fuentes = fuentes.filter(f => !excluir.has(f));
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
            const usadas = new Set(sel);
            for (let k = 0; sel.length < n && k < fuentes.length; k++) {
                const f = fuentes[(offset + k) % fuentes.length];
                if (!usadas.has(f)) { sel.push(f); usadas.add(f); }
            }
        }
        return sel;
    },
    // ============ N3: AUTOTEST · el módulo lleva su auditor dentro ============
    autotest() {
        const T = []; const ok = (n, c) => T.push((c ? '✓ ' : '✗ ') + n);
        const fs = [{ cita: '(Uno, 2020)' }, { cita: '(Dos y Tres, 2021)' }, { cita: '(Cuatro et al., 2022)' }];
        let r = this._reemplazarMarcadores('Idea probada [F1]. Convergen [F2, F3]. Falsa [F9].', fs);
        ok('marcadores: simple+grupo+inválido', r.texto.includes('(Uno, 2020)') && r.texto.includes('(Dos y Tres, 2021; Cuatro et al., 2022)') && !r.texto.includes('[F') && r.invalidos === 1 && r.usadas.size === 3);
        r = this._reemplazarMarcadores('Consecutivos [F1] [F2].', fs);
        ok('marcadores: consecutivos se funden', r.texto.includes('(Uno, 2020; Dos y Tres, 2021)'));
        r = this._reemplazarMarcadores('Convergen (F2, F3) aquí.', fs);
        ok('DIALECTO paréntesis (F2, F3) → cita APA', r.texto === 'Convergen (Dos y Tres, 2021; Cuatro et al., 2022) aquí.');
        ok('cita compuesta: de la Cruz', this._citaDesdeRef('de la Cruz, J. (2020). Título.', '').startsWith('(de la Cruz'));
        ok('cita compuesta: van Dijk', this._citaDesdeRef('van Dijk, K. (2019). Obra.', '').startsWith('(van Dijk'));
        ok('saneador: revista pegada', this._sanearAutor('Tituaña - Revista Científica RES NON VERBA') === 'Tituaña');
        ok('saneador: correo fuera', this._sanearAutor('K.tamara.t@gmail.com') === '');
        ok('saneador: año fuera', this._sanearAutor('2023') === '');
        ok('saneador: MAYÚSCULAS', this._sanearAutor('FERREIRA') === 'Ferreira');
        const vp = (() => { const el = document.getElementById('redVariables'); const prev = el ? el.value : null;
            if (el) el.value = 'auto-eficacia - creencia propia';
            const v = this._leerVariables()[0] || {}; if (el && prev !== null) el.value = prev; return v; })();
        ok('variables: guion con espacios', vp.nombre === 'auto-eficacia' && vp.definicion === 'creencia propia');
        ok('fallback sin marcadores', this._procesarParte({ fuentes: fs }, 'Clásico (Uno, 2020).').sinMarcadores === true);
        console.log('[Redactor.autotest]\n' + T.join('\n'));
        return `${T.filter(x => x.startsWith('✓')).length}/${T.length} en verde`;
    },
    // ---- Redactar el documento COMPLETO (todas las secciones, en paralelo) ----
    async _onRedactarTodo() {
        const estado = document.getElementById('redEstado');
        const btn = document.getElementById('redRedactarTodo');
        const btnWord = document.getElementById('redDescargarWord');
        const res = document.getElementById('redResultado');
        const problema = (document.getElementById('antQuery') || {}).value || '';
        const variablesTexto = (document.getElementById('redVariables') || {}).value || '';
        const variables = this._leerVariables();
        this.actualizarInfoFuentes();
        let fuentes = this._fuentes();
        if (problema.trim().length < 15) { if (estado) estado.textContent = '⚠️ Falta el problema de investigación (arriba).'; return; }
        if (!variables.length) { if (estado) estado.textContent = '⚠️ Identifica (o escribe) primero las variables de estudio.'; return; }
        if (!fuentes.length) { if (estado) estado.textContent = '⚠️ No hay fuentes: usa la matriz o importa una exportada.'; return; }
        if (typeof IAAsistente === 'undefined') { if (estado) estado.textContent = '❌ El asistente de IA no está cargado.'; return; }
        // INSTANTÁNEA (F2.3): la reparación por DOI muta las fuentes en segundo
        // plano; una copia congela lo que esta redacción usará, sin carreras.
        fuentes = fuentes.map(f => ({ ...f, autores: (f.autores || []).slice(), fuentesAPI: (f.fuentesAPI || []).slice() }));
        const avisoReparando = this._reparandoDOI ? ' (la reparación de resúmenes por DOI seguía en curso: se redactó con la instantánea del momento).' : '';
        // FICHA DE INSTRUMENTOS: la verdad extraída de la matriz, para inyectar
        // y verificar. Si la extracción falla, el sistema degrada con gracia.
        if (estado) estado.textContent = '🧭 Leyendo la matriz: ficha de instrumentos…';
        let ficha = [];
        try { ficha = await IAAsistente.extraerFichaInstrumentos(fuentes); } catch (e) { console.warn('[Redactor] sin ficha de instrumentos:', e && e.message); }
        this._fichaInstrumentos = ficha;
        if (typeof IAAsistente !== 'undefined') IAAsistente._rescatesGroq = 0;
        const fichaNota = ficha.length
            ? ' FICHA DE INSTRUMENTOS (verificada de la matriz — nombra cada instrumento EXACTAMENTE con su constructo): '
              + ficha.map(i => `${i.nombre}${i.sigla ? ' (' + i.sigla + ')' : ''} → ${i.constructo}${i.familia ? ' [familia: ' + i.familia + ']' : ''}`).join('; ') + '.'
            : '';
        // Techo por llamada: lo define el asistente (configurable en un lugar).
        const MAX = (IAAsistente.MAX_FUENTES_SECCION && IAAsistente.MAX_FUENTES_SECCION > 0)
            ? IAAsistente.MAX_FUENTES_SECCION : 32;
        // Plan → tareas. partes:'auto' = ceil(fuentes/MAX): reparto equitativo
        // de TODO el corpus, cada parte con fuentes distintas (ventana rotatoria).
        const plan = this._construirPlanSecciones(variables);
        const tareas = [];
        let off = 0;
        for (const sec of plan) {
            const nPartes = sec.partes === 'auto'
                ? Math.max(1, Math.ceil(fuentes.length / MAX))
                : sec.partes;
            const porParte = Math.min(MAX, Math.max(Math.min(8, fuentes.length), Math.ceil(fuentes.length / nPartes)));
            const usadasEnSeccion = nPartes > 1 ? new Set() : null; // partes de una misma sección: fuentes disjuntas
            for (let p = 0; p < nPartes; p++) {
                let fsel = this._seleccionarFuentes(fuentes, sec.afinidad, porParte, off, usadasEnSeccion);
                off += porParte; // ventana completa: cada parte trae fuentes distintas
                let notaOMS = '';
                if (sec.titulo === 'Antecedentes' && p === 0) {
                    const pr = this._priorizarOMS(fsel, fuentes, 8, porParte);
                    fsel = pr.fsel;
                    if (pr.oms || pr.onu) notaOMS = ' CONVENCIÓN DE ORDEN OBLIGATORIA: abre la sección con los antecedentes'
                        + ' internacionales de organismos oficiales — son las primeras fuentes de tu lista, en este'
                        + ' orden: primero OMS/OPS, después ONU y sus agencias — integrándolos también por ejes, y'
                        + ' solo entonces continúa con los demás estudios (internacional → nacional → local).';
                } else if (sec.titulo === 'Planteamiento del problema') {
                    const pr = this._priorizarOMS(fsel, fuentes, 4, porParte);
                    fsel = pr.fsel;
                    if (pr.oms || pr.onu) notaOMS = ' Al abrir el planteamiento, usa los informes de organismos internacionales'
                        + ' (las primeras fuentes de tu lista: OMS/OPS primero, luego ONU) para dimensionar el contexto'
                        + ' global del fenómeno — como marco de apertura, sin convertir la prevalencia en el vacío del estudio.';
                }
                if (usadasEnSeccion) fsel.forEach(f => usadasEnSeccion.add(f));
                tareas.push({
                    seccion: sec.titulo,
                    titulo: nPartes > 1 ? `${sec.titulo} (parte ${p + 1} de ${nPartes})` : sec.titulo,
                    instrucciones: sec.instrucciones + notaOMS + fichaNota + (nPartes > 1
                        ? ` Esta es la PARTE ${p + 1} de ${nPartes}: construye los ejes únicamente con las fuentes que se te dan aquí (otras partes cubren las demás); no escribas introducción ni cierre generales de la sección.`
                          + (p > 0 ? ' APERTURA DE CONTINUACIÓN: el lector viene de las partes anteriores — PROHIBIDO reintroducir el tema, definir de nuevo los conceptos o abrir con «La relación entre X e Y…»: entra DIRECTO al primer eje o estudio, como si continuaras el párrafo anterior.' : '')
                          + (p < nPartes - 1 ? ' PROHIBIDO enunciar vacíos de evidencia en esta parte: se reservan para el cierre de la sección.'
                                             : ' Al cerrar esta última parte, enuncia UN ÚNICO vacío maestro que integre y jerarquice lo que el conjunto de la sección no cubre — nada de vacíos sueltos por eje.')
                        : ''),
                    fuentes: fsel
                });
            }
        }
        const t = btn ? btn.textContent : '';
        if (btn) btn.disabled = true;
        if (btnWord) btnWord.style.display = 'none';
        const btnPDFh = document.getElementById('redDescargarPDF'); if (btnPDFh) btnPDFh.style.display = 'none';
        const btnF3h = document.getElementById('redPaseF3'); if (btnF3h) btnF3h.style.display = 'none';
        if (res) { res.style.display = 'none'; res.textContent = ''; }
        const _t0 = performance.now();
        // Canales: los del Worker del REDACTOR (Gemini), con fallback al de Groq.
        // Concurrencia = min(claves, tope prudente, nº de tareas). El tope evita
        // que 9-10 llamadas pesadas golpeen Gemini a la vez (causa de los fallos
        // parciales); el chatConReintento con backoff absorbe los transitorios.
        const clavesDisp = await (IAAsistente.numClavesRedactor ? IAAsistente.numClavesRedactor()
            : (IAAsistente.numClaves ? IAAsistente.numClaves() : 1));
        const topeCanales = this._MAX_CANALES_REDACCION || 4;
        const clavesN = (Number.isFinite(clavesDisp) && clavesDisp > 0) ? clavesDisp : 1;
        const canales = Math.max(1, Math.min(clavesN, topeCanales, tareas.length || 1));
        let completadas = 0, conError = 0;
        const resultados = new Array(tareas.length).fill(null);
        const prog = () => {
            const tandas = Math.ceil((tareas.length - completadas) / canales);
            if (estado) estado.textContent = `📄 Redactando… ${completadas}/${tareas.length} secciones `
                + `(${canales} claves en paralelo)${tandas > 0 ? ` · quedan ~${tandas} tanda(s)` : ''}`;
            if (btn) btn.textContent = `⏳ ${completadas}/${tareas.length}…`;
        };
        prog();
        let siguiente = 0;
        const trabajador = async (canal) => {
            // Escalonado de arranque: los canales usan claves DISTINTAS (keyHint=canal),
            // así que la simultaneidad no quema cuota por clave; este pequeño stagger
            // solo suaviza el pico global sobre el Worker (cortesía, no necesidad).
            if (canal) await new Promise(r => setTimeout(r, Math.min(canal * this._STAGGER_MS, 1500)));
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
                    const bruto = await IAAsistente.redactarSeccion({
                        titulo: tarea.titulo, instrucciones: tarea.instrucciones,
                        problema, variablesTexto, fuentes: tarea.fuentes, keyHint: canal
                    });
                    // Centinela de truncado (MAX_TOKENS) inyectado por el cliente IA:
                    // sin él, una sección cortada a media frase pasaba en silencio.
                    const truncada = /\[\[TRUNCADO_MAX_TOKENS\]\]\s*$/.test(bruto);
                    const brutoLimpio = truncada ? bruto.replace(/\s*\[\[TRUNCADO_MAX_TOKENS\]\]\s*$/, '') : bruto;
                    if (truncada) {
                        resultados[i] = { seccion: tarea.seccion, texto: '[No se pudo generar esta parte: la respuesta llegó truncada por límite de tokens.]', reintentable: true, codigo: 'TRUNCADA' };
                    } else {
                        const proc = this._procesarParte(tarea, brutoLimpio);
                        const varsFaltan = /Definición conceptual/i.test(tarea.seccion)
                            ? this._leerVariables().map(v => v.nombre).filter(n => n && !this._normTexto(proc.texto).includes(this._normTexto(n)))
                            : [];
                        if (varsFaltan.length) {
                            resultados[i] = { seccion: tarea.seccion, texto: `[No se pudo generar esta parte: la definición no cubrió «${varsFaltan[0]}».]`, reintentable: true, codigo: 'INCOMPLETA' };
                        } else {
                            resultados[i] = { seccion: tarea.seccion, proveedor: (typeof IAAsistente !== 'undefined' && IAAsistente._ultimoProveedor) || 'gemini', texto: proc.texto,
                                fuentesUsadas: proc.fuentesUsadas, marcInvalidos: proc.invalidos, sinMarcadores: proc.sinMarcadores };
                        }
                    }
                } catch (e) {
                    conError++;
                    resultados[i] = { seccion: tarea.seccion, texto: `[No se pudo generar esta parte: ${e.message}]`,
                        reintentable: e.reintentable !== false, codigo: e.codigo || 'DESCONOCIDO', codigoRespaldo: e.codigoRespaldo };
                    if (typeof console !== 'undefined') console.warn(`[Redactor] sección "${tarea.titulo}" falló:`, (e.codigo || '?') + (e.codigoRespaldo ? '→' + e.codigoRespaldo : ''), '·', e.message);
                }
                completadas++; prog();
            }
        };
        await Promise.all(Array.from({ length: canales }, (_, c) => trabajador(c)));
        // SEGUNDA PASADA: reintentar SOLO las que fallaron por causas transitorias.
        // Las definitivas (bloqueo de seguridad) ya no se reintentan en vano.
        const fallidas = [];
        resultados.forEach((r, i) => { if (r && /^\[No se pudo generar/.test(r.texto) && (r.reintentable !== false || r.codigo === 'GEMINI_4XX')) fallidas.push(i); });
        // Tormenta de cuota-por-minuto: si hay fallos CUOTA_*, esperar a que la
        // ventana ruede antes del rescate vale más que reintentar en caliente.
        const hayCuota = fallidas.some(i => /^CUOTA/.test(String((resultados[i] || {}).codigo || '')));
        if (hayCuota && fallidas.length) {
            if (estado) estado.textContent = `⏳ Cuota por minuto agotada en ${fallidas.length} parte(s): esperando ${Math.round((this._ESPERA_CUOTA_MS ?? 20000) / 1000)} s a que ruede la ventana antes del rescate…`;
            await new Promise(r => setTimeout(r, this._ESPERA_CUOTA_MS ?? 20000));
        }
        // GEMINI_4XX no es transitorio, pero un lote más pequeño a veces sí pasa:
        // se reintenta UNA vez con la mitad de fuentes (mínimo 6).
        if (fallidas.length) {
            if (estado) estado.textContent = `🔁 Reintentando ${fallidas.length} sección(es) con más calma…`;
            // Enfriamiento más largo antes de la 2ª pasada: si fue cuota/rate, dar aire.
            await new Promise(r => setTimeout(r, Math.max(this._ENFRIAMIENTO_MS, 8000)));
            let fi = 0;
            const reint = async (canal) => {
                let ultimoR = 0;
                while (fi < fallidas.length) {
                    const i = fallidas[fi++];
                    const base = tareas[i];
                    const con4xx = resultados[i] && resultados[i].codigo === 'GEMINI_4XX';
                    const tarea = con4xx
                        ? { ...base, fuentes: base.fuentes.slice(0, Math.max(6, Math.ceil(base.fuentes.length / 2))) }
                        : base;
                    if (con4xx && typeof console !== 'undefined') console.warn(`[Redactor] reintento 4xx con lote encogido (${tarea.fuentes.length} fuentes):`, base.titulo);
                    // Respiro también en la 2ª pasada: si cayó por cuota, martillear re-falla.
                    if (ultimoR) {
                        const espera = this._ENFRIAMIENTO_MS - (performance.now() - ultimoR);
                        if (espera > 0) await new Promise(r => setTimeout(r, espera));
                    }
                    ultimoR = performance.now();
                    try {
                        const bruto = await IAAsistente.redactarSeccion({
                            titulo: tarea.titulo, instrucciones: tarea.instrucciones,
                            problema, variablesTexto, fuentes: tarea.fuentes, keyHint: canal
                        });
                        // En el rescate se acepta el texto aunque venga truncado: mejor algo que nada.
                        const brutoLimpio = bruto.replace(/\s*\[\[TRUNCADO_MAX_TOKENS\]\]\s*$/, '');
                        const proc = this._procesarParte(tarea, brutoLimpio);
                        resultados[i] = { seccion: tarea.seccion, proveedor: (typeof IAAsistente !== 'undefined' && IAAsistente._ultimoProveedor) || 'gemini', texto: proc.texto,
                            fuentesUsadas: proc.fuentesUsadas, marcInvalidos: proc.invalidos, sinMarcadores: proc.sinMarcadores };
                        conError--;
                    } catch (e) {
                        // El placeholder refleja el error MÁS RECIENTE (no el de la 1ª pasada).
                        resultados[i] = { seccion: tarea.seccion, texto: `[No se pudo generar esta parte: ${e.message}]`,
                            reintentable: false, codigo: e.codigo || 'DESCONOCIDO' };
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(canales, fallidas.length) }, (_, c) => reint(c)));
        }
        // Unir las partes de cada sección en el ORDEN del plan.
        const secciones = [];
        const costura = { aperturas: new Map(), citas: new Map(), quitAperturas: 0, quitComodin: 0, corrConocidas: 0, trenes: 0 };
        for (const sec of plan) {
            const delSec = resultados.filter(r => r && r.seccion === sec.titulo);
            // Los banners de error son SAGRADOS: el cosedor los mutilaba (huella
            // repetida → primera frase fuera → «Reintenta en ~1 min…» huérfano).
            const partes = delSec.map(r => /^\[No se pudo generar/.test(String(r.texto || ''))
                ? r.texto
                : this._coserParte(this._corregirInstrumentos(this._limpiarTexto(r.texto), costura), costura));
            const usadasSec = new Set(); delSec.forEach(r => (r.fuentesUsadas || []).forEach(f => usadasSec.add(f)));
            secciones.push({ titulo: sec.titulo, capitulo: sec.capitulo || 'II', texto: partes.join('\n\n'),
                fuentesUsadas: [...usadasSec] });
        }
        const textoCompleto = secciones.map(s => s.texto).join('\n\n');
        // Texto REAL = sin los marcadores de error; es lo que decide si hubo éxito.
        const textoReal = textoCompleto.replace(/\[No se pudo generar[^\]]*\]/g, '').trim();
        const usadasGlobal = new Set(); let marcInvalidosTotal = 0, partesSinMarc = 0, partesConMarc = 0;
        resultados.forEach(r => {
            if (!r) return;
            (r.fuentesUsadas || []).forEach(f => usadasGlobal.add(f));
            marcInvalidosTotal += r.marcInvalidos || 0;
            if (r.sinMarcadores === true) partesSinMarc++; else if (r.fuentesUsadas) partesConMarc++;
        });
        const residuales = (textoReal.match(/[\[(]F\s*\d/g) || []).length;
        const citadas = partesConMarc > 0 ? [...usadasGlobal] : this._fuentesCitadas(textoReal, fuentes);
        const sospechosas = [...this._citasSospechosas(textoReal, fuentes), ...this._fantasmasNarrativos(textoReal, fuentes)];
        this._documento = { secciones, fuentes, citadas, problema,
            meta: { plantilla: 'P2-marcadores', fecha: new Date().toISOString(), canales,
                marcadores: { invalidos: marcInvalidosTotal, partesSinMarcadores: partesSinMarc, partesConMarcadores: partesConMarc },
                costura: { aperturas: costura.quitAperturas, comodin: costura.quitComodin },
                fichaInstrumentos: ficha } };
        const min = ((performance.now() - _t0) / 60000).toFixed(1);
        const palabras = textoReal.split(/\s+/).filter(Boolean).length;
        // Diagnóstico agrupado por código de error (para depurar de un vistazo).
        this._ultimoDiagnostico = {};
        resultados.forEach(r => { if (r && r.codigo) { const k = r.codigo + (r.codigoRespaldo ? '→' + r.codigoRespaldo : ''); this._ultimoDiagnostico[k] = (this._ultimoDiagnostico[k] || 0) + 1; } });
        if (marcInvalidosTotal > 0) this._ultimoDiagnostico.MARCADORES_INVALIDOS = marcInvalidosTotal;
        if (sospechosas.length) {
            this._ultimoDiagnostico.CITAS_SOSPECHOSAS = sospechosas.length;
            if (typeof console !== 'undefined') console.warn('[Redactor] Citas que NO están en tu matriz (revísalas una a una):', sospechosas);
        }
        if (conError > 0 && typeof console !== 'undefined') {
            console.warn('[Redactor] Resumen de fallos por tipo:', this._ultimoDiagnostico,
                '— consulta RedactorTeorico._ultimoDiagnostico para el detalle.');
        }
        if (res) {
            res.style.display = '';
            res.textContent = this._renderTexto(secciones);
        }
        try { this._guardarUltimo(); } catch (e) {}
        const recEnlace = document.getElementById('redRecuperar');
        if (recEnlace) recEnlace.style.display = 'none';
        // Si NO se produjo texto real, es un fallo total: diagnóstico claro, no falso "✓".
        if (palabras < 20) {
            const codigos = Object.entries(this._ultimoDiagnostico).sort((a, b) => b[1] - a[1]);
            const dominante = codigos.length ? codigos[0][0] : 'DESCONOCIDO';
            const explica = (IAAsistente._mensajePorCodigo ? IAAsistente._mensajePorCodigo(dominante, {}) : dominante);
            if (estado) estado.textContent = `❌ No se generó texto (${tareas.length} secciones fallaron). Motivo principal: ${explica} · Detalle por tipo: ${JSON.stringify(this._ultimoDiagnostico)}. Abre la consola (F12) para ver cada sección. Si es cuota, espera 1 min o añade claves; si es tamaño, reduce fuentes.`;
            if (btn) { btn.disabled = false; btn.textContent = t; }
            if (res) { res.style.display = 'none'; }
            return; // no mostrar documento vacío ni botón de Word
        }
        const avisoOMS = fuentes.some(f => this._esOMS(f)) ? ''
            : ' ⚠️ La matriz no contiene fuentes de la OMS/ONU: rehaz la búsqueda en el Buscador (ya integra IRIS de la OMS y ReliefWeb/Biblioteca Digital de la ONU) e importa la matriz actualizada.';
        // ===== PANEL DE DIAGNÓSTICO (petición del dueño: ordenado y visual) =====
        const esc = x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        // Errores FINALES desde la verdad (banners), no con contador sube-baja (adiós «-3»).
        const muertasFinal = resultados.filter(r => r && /^\[No se pudo generar/.test(String(r.texto || ''))).length;
        const provPorSec = new Map();
        resultados.forEach(r => {
            if (!r || /^\[No se pudo generar/.test(String(r.texto || ''))) return;
            if (!provPorSec.has(r.seccion)) provPorSec.set(r.seccion, new Set());
            provPorSec.get(r.seccion).add(r.proveedor || 'gemini');
        });
        let partesGem = 0, partesGrq = 0;
        resultados.forEach(r => { if (r && !/^\[No se pudo/.test(String(r.texto || ''))) { if (r.proveedor === 'groq') partesGrq++; else partesGem++; } });
        const chip = (txt, icono) => `<span style="display:inline-block;background:#eef2f7;border:1px solid #d6dee8;border-radius:999px;padding:1px 9px;margin:2px 3px 0 0;font-size:.88em;">${icono} ${esc(txt)}</span>`;
        const chipsSec = secciones.map(sec => {
            const ps = provPorSec.get(sec.titulo) || new Set();
            const icono = ps.has('groq') ? (ps.has('gemini') ? '✦🛟' : '🛟') : '✦';
            return chip(sec.titulo, icono);
        }).join('');
        const fila = (icono, etiqueta, contenido) => `<div style="margin:3px 0;"><b>${icono} ${etiqueta}:</b> ${contenido}</div>`;
        const alertas = [];
        if (residuales > 0) alertas.push(`❌ ${residuales} marcador(es) F# SIN convertir — redactor ANTIGUO en caché: sube ?v= y Ctrl+F5.`);
        if (muertasFinal > 0) alertas.push(`${muertasFinal} parte(s) con error — código(s): ${esc(JSON.stringify(this._ultimoDiagnostico))}`);
        if (sospechosas.length) alertas.push(`${sospechosas.length} cita(s) NO están en tu matriz: ${esc(sospechosas.slice(0, 3).join(' · '))}${sospechosas.length > 3 ? ' … (consola)' : ''}`);
        if ((this._ultimoSaneo.posiblesDuplicados || []).length) alertas.push(`${this._ultimoSaneo.posiblesDuplicados.length} posible(s) referencia(s) duplicada(s) (misma obra, dos idiomas/fuentes) — consola`);
        if (costura.trenes > 0) alertas.push(`${costura.trenes} tren(es) de citas A→B→C sin jerarquizar`);
        for (const a of this._detectarContradiccionPosicionamiento(secciones, variables)) alertas.push(a);
        const muletillas = this._muletillasDoc(textoReal);
        if (muletillas.length) alertas.push(`🧬 plantilla repetida: ${muletillas.map(([k, n]) => `«${esc(k)}…»×${n}`).join(' · ')} — varía la retórica (la F3 reescribirá)`);
        const vacios = this._declaracionesVacio(textoReal);
        if (vacios > 2) alertas.push(`${vacios} declaraciones de vacío — deja la maestra (Estado) y la de cierre`);
        if (avisoOMS) alertas.push(esc(avisoOMS.replace(/^\s*⚠️\s*/, '')));
        if (avisoReparando) alertas.push(esc(avisoReparando.replace(/^[\s(.]+|[).]+$/g, '')));
        const saneoBits = [];
        if (this._ultimoSaneo.reparadas) saneoBits.push(`${this._ultimoSaneo.reparadas} cita(s) reparada(s)`);
        if (this._ultimoSaneo.refsRec) saneoBits.push(`${this._ultimoSaneo.refsRec} referencia(s) APA reconstruida(s) (sin revista — Crossref llega en F3)`);
        if (this._ultimoSaneo.excluidas) saneoBits.push(`${this._ultimoSaneo.excluidas} pseudo-registro(s) excluido(s)`);
        if (this._ultimoSaneo.corruptos) saneoBits.push(`${this._ultimoSaneo.corruptos} campo(s) corruptos limpiados`);
        const costuraBits = [];
        if (costura.quitAperturas) costuraBits.push(`${costura.quitAperturas} apertura(s) repetida(s)`);
        if (costura.quitComodin) costuraBits.push(`${costura.quitComodin} frase(s) duplicada(s)`);
        if (costura.corrConocidas) costuraBits.push(`${costura.corrConocidas} etiqueta(s) de instrumento corregida(s)`);
        if (estado) estado.innerHTML = `<div style="text-align:left;border:1px solid #d0d7de;border-radius:10px;padding:10px 14px;background:#f8fafc;line-height:1.6;">`
            + `<div style="font-weight:700;color:#116329;">✓ Documento redactado en ${min} min</div>`
            + fila('📄', 'Documento', `${secciones.length} secciones · ~${palabras.toLocaleString('es')} palabras · <b>${citadas.length}</b> de ${fuentes.length} fuentes citadas${partesConMarc > 0 ? ' (conteo exacto por marcadores)' : ''}${partesSinMarc ? ` · ${partesSinMarc} parte(s) en modo compatibilidad` : ''}${marcInvalidosTotal > 0 ? ` · ${marcInvalidosTotal} alucinación(es) de fuente cazada(s)` : ''}`)
            + fila('🤖', 'Motores', `✦ Gemini ${partesGem} parte(s)${partesGrq ? ` · 🛟 Groq ${partesGrq} rescate(s)` : ''}<br>${chipsSec}`)
            + (costuraBits.length ? fila('🧵', 'Costura', costuraBits.join(' · ')) : '')
            + (saneoBits.length ? fila('🩺', 'Saneo de matriz', saneoBits.join(' · ')) : '')
            + (alertas.length ? `<div style="margin-top:6px;padding:6px 10px;border-left:3px solid #d4a72c;background:#fff8e5;border-radius:0 6px 6px 0;">${alertas.map(a => `<div style="margin:2px 0;">⚠️ ${a}</div>`).join('')}</div>` : '')
            + `<div style="margin-top:6px;color:#57606a;">📥 Descárgalo en <b>Word</b> o <b>PDF</b> y verifica cada cita contra la fuente original.</div>`
            + `</div>`;
        if (btnWord) btnWord.style.display = '';
        const btnPDFs = document.getElementById('redDescargarPDF'); if (btnPDFs) btnPDFs.style.display = '';
        const btnF3s = document.getElementById('redPaseF3'); if (btnF3s) btnF3s.style.display = '';
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
    _limpiarTexto(t) {
        t = String(t || '').replace(/\*([^*\n]{1,80})\*/g, '$1');   // *énfasis* markdown residual
        return String(t || '')
            .replace(/^#+\s*/gm, '')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/[\u00A0\u2007\u2009\u202F\u2060]/g, ' ')
            .trim();
    },
    // ============ F2.4: AUTOGUARDADO · un cierre de pestaña no quema 6.000 palabras ============
    _CLAVE_GUARDADO: 'statsim_redactor_ultimo',
    _guardarUltimo() {
        if (typeof localStorage === 'undefined' || !this._documento) return;
        const d = this._documento;
        const idx = new Map(d.fuentes.map((f, i) => [f, i]));
        const ligera = f => ({ titulo: f.titulo, cita: f.cita, ref: f.ref, anio: f.anio, doi: f.doi,
            autores: (f.autores || []).slice(0, 8), fuente: f.fuente });
        const data = { t: Date.now(), problema: d.problema,
            secciones: d.secciones.map(s => ({ titulo: s.titulo, capitulo: s.capitulo, texto: s.texto })),
            fuentes: d.fuentes.map(ligera),
            citadasIdx: (d.citadas || []).map(f => idx.get(f)).filter(n => n != null) };
        try { localStorage.setItem(this._CLAVE_GUARDADO, JSON.stringify(data)); } catch (e) {}
    },
    _renderTexto(secciones) {
        let capAct = '';
        return secciones.map(s => {
            let enc = '';
            if ((s.capitulo || 'II') !== capAct) {
                capAct = s.capitulo || 'II';
                enc = (capAct === 'I' ? 'CAPÍTULO I: INTRODUCCIÓN' : 'CAPÍTULO II: MARCO TEÓRICO') + '\n\n';
            }
            return enc + s.titulo.toUpperCase() + '\n\n' + s.texto;
        }).join('\n\n\n');
    },
    _recuperarUltimo() {
        let d;
        try { d = JSON.parse(localStorage.getItem(this._CLAVE_GUARDADO) || 'null'); } catch (e) { d = null; }
        if (!d || !Array.isArray(d.secciones) || !d.secciones.length) return false;
        const fuentes = d.fuentes || [];
        this._documento = { secciones: d.secciones, fuentes,
            citadas: (d.citadasIdx || []).map(i => fuentes[i]).filter(Boolean), problema: d.problema || '' };
        const res = document.getElementById('redResultado');
        if (res) { res.style.display = ''; res.textContent = this._renderTexto(d.secciones); }
        const bW = document.getElementById('redDescargarWord'); if (bW) bW.style.display = '';
        const bP = document.getElementById('redDescargarPDF'); if (bP) bP.style.display = '';
        const bF3 = document.getElementById('redPaseF3'); if (bF3) bF3.style.display = '';
        const bC = document.getElementById('redCopiar'); if (bC) bC.style.display = '';
        const est = document.getElementById('redEstado');
        const min = Math.max(1, Math.round((Date.now() - (d.t || Date.now())) / 60000));
        if (est) est.textContent = `📂 Redacción recuperada (guardada hace ${min < 60 ? min + ' min' : Math.round(min / 60) + ' h'}): ` +
            `${d.secciones.length} secciones, ${(this._documento.citadas || []).length} fuentes citadas. Puedes descargarla en Word.`;
        const rec = document.getElementById('redRecuperar'); if (rec) rec.style.display = 'none';
        return true;
    },
    // ¿Qué citas del TEXTO no existen en la MATRIZ? La pregunta académicamente
    // letal que nadie hace: el modelo puede inventar (Autor, año) con total fluidez.
    // v0 heurística (F1.5 del plan); la versión exacta llega con los marcadores (F2).
    // El detector clásico solo cazaba «(Apellido, año)». Una alucinación
    // NARRATIVA — «García (2020) demostró…» con García inexistente — pasaba
    // de largo. Índice compacto propio + mismas normalizaciones.
    _fantasmasNarrativos(texto, fuentes) {
        const t = String(texto || '').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u00a0\u202f]/g, ' ');   // el patrón token exige guion ASCII
        if (!t || !fuentes.length) return [];
        const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u00a0\u202f]/g, ' ').trim();
        const claves = new Set();
        const reg = (ap, y) => { const a = norm(ap).replace(/\bet al\.?/g, '').trim(), yy = norm(y); if (a && yy) claves.add(a + '|' + yy); };
        for (const f of fuentes) {
            const inner = String(f.cita || '').replace(/^\(|\)$/g, '');
            const y = (inner.match(/(\d{4}[a-z]?|s\.\s*f\.)\s*$/) || [])[1] || String(f.anio || '');
            for (const tr of inner.replace(/,?\s*(\d{4}[a-z]?|s\.\s*f\.)\s*$/, '').split(/\s+(?:y|&|and)\s+|,\s*/)) {
                reg(tr, y); reg(tr, f.anio);
                const toks = tr.trim().split(/\s+/); if (toks.length > 1) { reg(toks[0], y); reg(toks[toks.length - 1], y); }
            }
            for (const a of (f.autores || [])) { reg(String(a).split(',')[0], y); reg(String(a).split(',')[0], f.anio); }
            for (const m of String(f.cita || '').matchAll(/\[([A-Z\u00c0-\u017d]{2,})\]/g)) { reg(m[1], y); reg(m[1], f.anio); }
        }
        const out = [], vistos = new Set();
        for (const m of t.matchAll(/\b([A-Z\u00c0-\u017d][\p{L}\u2019'-]+(?:\s+(?:y|&)\s+[A-Z\u00c0-\u017d][\p{L}\u2019'-]+|\s+et\s+al\.)?)\s+\((\d{4}[a-z]?|s\.\s*f\.)\)/gu)) {
            const ap = m[1], anio = m[2];
            const toks = norm(ap).replace(/\bet al\.?/g, '').trim().split(/\s+/).filter(Boolean);
            let ok = false;
            for (const c of new Set([toks.join(' '), toks[0], toks[toks.length - 1]]))
                if (claves.has(c + '|' + norm(anio))) { ok = true; break; }
            if (ok) continue;
            const etiqueta = `${ap} (${anio}) [narrativa]`;
            if (!vistos.has(etiqueta)) { vistos.add(etiqueta); out.push(etiqueta); }
            if (out.length >= 6) break;
        }
        return out;
    },
    // Muletillas de plantilla: el MISMO arranque de frase (4 tokens) repetido ≥3
    // veces en el documento delata molde clonado entre secciones.
    _muletillasDoc(texto) {
        const cuenta = new Map();
        for (const fr of this._frases(String(texto || ''))) {
            if (/^[(\[]/.test(fr.trim())) continue;
            const toks = fr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 3);
            if (toks.length < 3) continue;   // 3 tokens: «los hallazgos de» — el 4º suele ser el autor y camufla el molde
            const k = toks.join(' ');
            cuenta.set(k, (cuenta.get(k) || 0) + 1);
        }
        return [...cuenta].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 3);
    },
    _declaracionesVacio(texto) {
        return (String(texto || '').match(/(persiste|subsiste|se evidencia|exhibe|se identifica)[^.]{0,90}?(vac[ií]o|laguna|escasez)/gi) || []).length;
    },
    _citasSospechosas(texto, fuentes) {
        const t = String(texto || '');
        if (!t || !fuentes.length) return [];
        const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u00a0\u202f]/g, ' ').trim();
        // Índice de la matriz: apellido|año para cada apellido de la cita corta, cada
        // autor, y cada SIGLA entre corchetes («Organización Mundial de la Salud [OMS]»
        // debe validar también «(OMS, 2023)» — sin esto, falso positivo garantizado).
        const claves = new Set();
        const registrar = (ap, anio) => { const a = norm(ap), y = norm(anio); if (a && y) claves.add(a + '|' + y); };
        for (const f of fuentes) {
            const inner = String(f.cita || '').replace(/^\(|\)$/g, '');
            const anioCita = (inner.match(/(\d{4}[a-z]?|s\.\s*f\.)\s*$/) || [])[1] || String(f.anio || '');
            const anios = new Set([anioCita, String(f.anio || '')].filter(Boolean));
            const preAnio = inner.replace(/,?\s*(\d{4}[a-z]?|s\.\s*f\.)\s*$/, '');
            const trozos = preAnio.split(/\s+(?:y|&|and)\s+|,\s*/).map(x => x.replace(/\bet al\.?/gi, '').trim()).filter(Boolean);
            for (const anio of anios) {
                for (const tr of trozos) {
                    registrar(tr, anio);                                  // apellido compuesto completo
                    const toks = tr.split(/\s+/).filter(Boolean);
                    if (toks.length > 1) { registrar(toks[0], anio); registrar(toks[toks.length - 1], anio); }
                }
                for (const a of (f.autores || [])) registrar(String(a).split(',')[0], anio);
                for (const m of String(f.cita || '').matchAll(/\[([A-Z\u00c0-\u017d]{2,})\]/g)) registrar(m[1], anio);
                for (const a of (f.autores || [])) for (const m of String(a).matchAll(/\[([A-Z\u00c0-\u017d]{2,})\]/g)) registrar(m[1], anio);
            }
        }
        const conocida = (ap, anio) => {
            const apN = norm(ap).replace(/\bet al\.?/g, '').trim();
            if (!apN) return true; // sin apellido interpretable: no acusar
            const toks = apN.split(/\s+/).filter(Boolean);
            for (const c of new Set([apN, toks[0], toks[toks.length - 1]]))
                if (claves.has(c + '|' + norm(anio))) return true;
            return false;
        };
        const sospechosas = new Set();
        // 1) Parentéticas, incluidas agrupadas: (A, 2020; B, 2021)
        for (const m of t.matchAll(/\(([^()]{3,200}?)\)/g)) {
            if (!/\d{4}|s\.\s*f\./.test(m[1])) continue; // no es una cita
            for (const seg of m[1].split(/;\s*/)) {
                const mm = seg.trim().match(/^(.*?),\s*(\d{4}[a-z]?|s\.\s*f\.)$/);
                if (!mm) continue;
                const ap = mm[1].trim();
                if (/^(p\.|pp\.|v\u00e9ase|ver\s|como se cit)/i.test(ap)) continue;
                if (!conocida(ap, mm[2])) sospechosas.add('(' + ap + ', ' + mm[2] + ')');
            }
        }
        // 2) Narrativas: Apellido (2020) · Apellido et al. (2020) · Apellido y Apellido (2020)
        for (const m of t.matchAll(/\b([A-Z\u00c0-\u00d6\u00d8-\u00de][\w\u00c0-\u00ff'\u2019-]+(?:\s+(?:y|&)\s+[A-Z\u00c0-\u00d6\u00d8-\u00de][\w\u00c0-\u00ff'\u2019-]+)?(?:\s+et\s+al\.)?)\s*\((\d{4}[a-z]?)\)/g)) {
            const primero = m[1].split(/\s+(?:y|&)\s+/)[0].replace(/\s+et\s+al\.?$/i, '').trim();
            if (!conocida(primero, m[2])) sospechosas.add(m[1].trim() + ' (' + m[2] + ')');
        }
        return [...sospechosas];
    },
    // ============ COSTURA MECÁNICA (F2.7): lo que 17 llamadas paralelas no pueden ver ============
    // Cada parte se redacta a ciegas de las demás; los tics convergentes (mismo abridor,
    // misma conclusión-comodín) solo se cazan aquí, con el documento entero delante.
    _frases(texto) {
        const MASCARA = [[/et al\./g, 'et al\u0001'], [/s\.\s*f\./g, 's\u0001f\u0001'], [/p\.\s*ej\./g, 'p\u0001ej\u0001'], [/vs\./g, 'vs\u0001'], [/cols\./g, 'cols\u0001'], [/cf\./g, 'cf\u0001'], [/fig\./gi, 'fig\u0001'], [/núm\./g, 'núm\u0001'], [/Vol\./g, 'Vol\u0001']];
        let t = String(texto || '');
        for (const [re, sub] of MASCARA) t = t.replace(re, sub);
        const out = t.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ž¿¡«“(])/).map(s => s.replace(/\u0001/g, '.'));
        return out;
    },
    // ===== VERIFICADOR DE INSTRUMENTOS (dinámico, sin listas a mano) =====
    // La ficha nace de la matriz en cada redacción. La contradicción que se
    // corrige es PRECISA: la etiqueta «inventario/test/escala de <constructoB>»
    // pegada a un instrumento cuyo constructo real (según la ficha) es A. Las
    // frases comparativas legítimas («se comparó el EQ-i con medidas de CI»)
    // no llevan esa etiqueta y quedan intactas.
    _escRe(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); },
    // La mina del jurado: una sección adopta Bar-On para el instrumento y otra
    // adopta Salovey-Mayer para EL MISMO. Se detecta y se grita en el panel;
    // la reescritura coherente es trabajo de la F3.
    _FAMILIAS_RE: /(Bar-?On|Salovey y Mayer|Mayer y Salovey|Goleman|Boyatzis|Wechsler|Cattell|CHC|Gardner|Sternberg)/gi,
    _detectarContradiccionPosicionamiento(secciones, variables) {
        const alertas = [];
        for (const v of (variables || [])) {
            const fams = new Set();
            for (const s of (secciones || [])) {
                if (!String(s.titulo || '').toLowerCase().includes(String(v.nombre || '').toLowerCase())) continue;
                const m = String(s.texto || '').match(/se adopta[^.]{0,200}/gi) || [];
                for (const frase of m) {
                    const fs = frase.match(this._FAMILIAS_RE) || [];
                    for (const f of fs) fams.add(f.replace(/-/g, '').replace(/Mayer y Salovey/i, 'Salovey y Mayer'));
                }
            }
            if (fams.size > 1) alertas.push(`Posicionamiento CONTRADICTORIO en «${v.nombre}»: ${[...fams].join(' vs ')} — unifica el modelo adoptado antes de sustentar`);
        }
        return alertas;
    },
    _corregirInstrumentos(texto, ctx) {
        let t = String(texto || '');
        const ficha = this._fichaInstrumentos || [];
        if (!ficha.length) return t;
        for (const ins of ficha) {
            if (!ins.constructo) continue;
            // Aliases: el texto suele decir «Bar-On» a secas, no «Inventario de Bar-On».
            const base = String(ins.nombre || '').replace(/^(inventario|test|escala|cuestionario)\s+de\s+/i, '').trim();
            const aliases = [...new Set([ins.nombre, base, ins.sigla].filter(x => x && x.length >= 3))].map(x => this._escRe(x));
            if (!aliases.length) continue;
            // Contradicción precisa: etiqueta «inventario/test/escala/cuestionario de <X≠constructo real>»
            // pegada al instrumento — X puede ser CUALQUIER cosa (lookahead negado sobre el correcto).
            const re = new RegExp(
                `\\b(inventario|test|escala|cuestionario)(\\s+de)\\s+(?!${this._escRe(ins.constructo)}\\b)([a-záéíóúüñ][a-záéíóúüñ\\s-]{2,40}?)((?:\\s+de)?\\s+(?:${aliases.join('|')}))`, 'gi');
            t = t.replace(re, (m, g1, g2, gX, g4) => { ctx.corrConocidas++; return `${g1}${g2} ${ins.constructo}${g4}`; });
        }
        return t;
    },
    _huellaApertura(frase) {
        return this._normTexto(frase).split(/\s+/).slice(0, 5).join(' ');
    },
    _coserParte(texto, ctx) {
        // REGRESIÓN CAZADA (modelo 5): coser por frases y re-unir con espacios
        // aplanaba los párrafos en un muro de texto. Los párrafos son sagrados:
        // se cose DENTRO de cada uno y se re-unen con \n\n intactos.
        const parrafos = String(texto || '').split(/\r?\n\s*\r?\n/);
        const out = [];
        for (let i = 0; i < parrafos.length; i++) {
            const p = parrafos[i];
            if (!p.trim()) continue;
            const c = this._coserFrases(p, ctx, i === 0 && out.length === 0);
            if (c.trim()) out.push(c);
        }
        return out.length ? out.join('\n\n') : texto; // jamás vaciar una parte entera
    },
    _coserFrases(texto, ctx, esApertura) {
        let frases = this._frases(texto);
        // Trenes «Autor (año)… Autor (año)…»: ≥4 seguidas = falta de jerarquización
        const esNarrativa = fr => /^(?:[A-ZÀ-Ž][\p{L}’'-]+(?:\s+(?:y\s+[A-ZÀ-Ž][\p{L}’'-]+|et\s+al\.))?)\s*\((?:19|20)\d{2}[a-z]?\)/u.test(fr);
        let seguidas = 0;
        for (const fr of frases) { if (esNarrativa(fr)) { seguidas++; if (seguidas === 4) ctx.trenes++; } else seguidas = 0; }
        if (!frases.length) return texto;
        // 1) Abridores-molde: la misma huella de 5 palabras abriendo varias partes
        const h = esApertura ? this._huellaApertura(frases[0]) : ''; // el molde solo abre PARTES
        if (h && h.split(' ').length >= 4) {
            const visto = ctx.aperturas.get(h) || 0;
            ctx.aperturas.set(h, visto + 1);
            if (visto >= 1 && frases.length > 1) { frases = frases.slice(1); ctx.quitAperturas++; }
        }
        // 2) Frases-comodín: misma cita + un 7-grama CONTIGUO compartido = la misma
        // frase hecha reformulada; el shingle largo es casi inmune a falsos positivos.
        const shingles = f => {
            const w = this._normTexto(f.replace(/\([^)]*\)/g, ' ')).split(/\s+/).filter(Boolean);
            const out = new Set();
            for (let i = 0; i + 7 <= w.length; i++) out.add(w.slice(i, i + 7).join(' '));
            return out;
        };
        const finales = [];
        for (const fr of frases) {
            // Los grupos «(A, 2024; B, 2023)» se parten: cada cita interior es una clave propia
            const grupos = fr.match(/\([^()]{6,180}?, (?:19|20)\d{2}[a-z]?\)/g) || [];
            const citas = [];
            for (const g of grupos) for (const c of g.replace(/^\(|\)$/g, '').split(/;\s*/)) {
                if (/, (?:19|20)\d{2}[a-z]?$/.test(c.trim())) citas.push('(' + c.trim() + ')');
            }
            const mios = shingles(fr);
            let duplicada = false;
            for (const c of citas) {
                const vistos = ctx.citas.get(c);
                if (!vistos) continue;
                for (const sh of mios) if (vistos.has(sh)) { duplicada = true; break; }
                if (duplicada) break;
            }
            if (duplicada && (finales.length || frases.length > 1)) { ctx.quitComodin++; continue; }
            finales.push(fr);
            for (const c of citas) {
                let vistos = ctx.citas.get(c);
                if (!vistos) { vistos = new Set(); ctx.citas.set(c, vistos); }
                for (const sh of mios) vistos.add(sh);
            }
        }
        return finales.join(' ');
    },
    // ============ F2.1: TRAZABILIDAD POR MARCADORES [F#] ============
    // El modelo cita con marcadores locales a SU llamada ([F1..Fn] = su fsel);
    // aquí se convierten en citas APA exactas. Esto da lo que la detección por
    // strings jamás pudo: conteo EXACTO de citadas, marcadores inválidos =
    // alucinación cazada en el acto, y el mapa afirmación→fuente para el futuro.
    _reemplazarMarcadores(texto, fsel) {
        let t = String(texto || '');
        const usadas = new Set(); let invalidos = 0, grupos = 0;
        const interior = f => String(f.cita || '').replace(/^\(|\)$/g, '').trim();
        // DIALECTOS de marcador (el rescate Groq escribe «(F16, F19, F5)» con
        // paréntesis y hasta con «y»): se normalizan a corchetes ANTES de convertir.
        // Una cita APA real jamás matchea (lleva letras y año).
        t = t.replace(/\(\s*(F\s*\d+(?:\s*(?:[,;]|y)\s*F?\s*\d+)*)\s*\)/g, '[$1]');
        t = t.replace(/\]\s*\[(?=F?\s*\d)/g, ', ');
        t = t.replace(/\[\s*F\s*\d+(?:\s*(?:[,;]|y)\s*F?\s*\d+)*\s*\]/g, (m) => {
            grupos++;
            const nums = (m.match(/\d+/g) || []).map(Number);
            const partes = []; const vistos = new Set();
            for (const n of nums) {
                const f = fsel[n - 1];
                if (!f) { invalidos++; continue; }
                if (vistos.has(f)) continue;
                vistos.add(f); usadas.add(f);
                const txtCita = interior(f);
                if (!txtCita || partes.includes(txtCita)) continue;   // dedup visual: dos filas, misma cita
                // Fusión de PERSONA: «Salvo, 2026» y «Di Salvo, 2026» son el mismo autor con
                // partícula perdida en una fila gemela — gana la forma completa.
                const clave = c => { const m = c.match(/^(.*?),\s*((?:19|20)\d{2}[a-z]?|s\.\s*f\.)$/); return m ? { ap: m[1].trim(), an: m[2] } : null; };
                const nueva = clave(txtCita); let absorbida = false;
                if (nueva && !/\sy\s|;|et al\./.test(nueva.ap)) {
                    for (let k = 0; k < partes.length; k++) {
                        const prev = clave(partes[k]);
                        if (!prev || prev.an !== nueva.an || /\sy\s|;|et al\./.test(prev.ap)) continue;
                        const corta = nueva.ap.length <= prev.ap.length ? nueva.ap : prev.ap;
                        const larga = nueva.ap.length <= prev.ap.length ? prev.ap : nueva.ap;
                        const resto = larga.endsWith(' ' + corta) ? larga.slice(0, -corta.length).trim().split(/\s+/) : null;
                        if (resto && resto.every(w => this._PARTICULAS_AP.test(w))) {
                            partes[k] = larga + ', ' + prev.an; absorbida = true; break;
                        }
                    }
                }
                if (!absorbida) partes.push(txtCita);
            }
            return partes.length ? '(' + partes.join('; ') + ')' : '';
        });
        t = t.replace(/\[\s*F[\d\s,;yF]*\]?/g, () => { invalidos++; return ''; });
        t = t.replace(/\(\s*F\d[\d\s,;yF]*\)?/g, () => { invalidos++; return ''; });
        // Dialecto DESNUDO del rescate: «los hallazgos de F30» sin corchete alguno.
        t = t.replace(/\bF(\d{1,3})\b/g, (m, n) => {
            const f = fsel[+n - 1];
            if (f && f.cita) { usadas.add(+n - 1); return f.cita; }
            invalidos++; return '';
        });
        // «Furnham y Robinson (2022) (Furnham y Robinson, 2022)»: narrativa + marcador
        // adyacente del mismo estudio → el paréntesis sobra.
        t = t.replace(/([\p{Lu}][\p{L}’' .-]{1,50}?(?:\s+y\s+[\p{Lu}][\p{L}’' .-]{1,40}|\s+et\s+al\.)?)\s*\(((?:19|20)\d{2}[a-z]?)\)\s*\(\s*\1,\s*\2\s*\)/gu, '$1 ($2)');
        t = t.replace(/\*([^*\n]{1,80})\*/g, '$1');   // *énfasis* markdown residual (el «*flow*» del doc 7)
        t = t.replace(/ {2,}/g, ' ').replace(/\s+([.,;:])/g, '$1');
        return { texto: t, usadas, invalidos, grupos, sinMarcadores: grupos === 0 };
    },
    _procesarParte(tarea, textoCrudo) {
        const r = this._reemplazarMarcadores(textoCrudo, tarea.fuentes || []);
        if (r.sinMarcadores) {
            const legado = this._fuentesCitadas(textoCrudo, tarea.fuentes || []);
            return { texto: textoCrudo, fuentesUsadas: legado, invalidos: 0, sinMarcadores: true };
        }
        return { texto: r.texto, fuentesUsadas: [...r.usadas], invalidos: r.invalidos, sinMarcadores: false };
    },
    _fuentesCitadas(texto, fuentes) {
        const t = String(texto || '');
        const usadas = fuentes.filter(f => {
            const inner = String(f.cita || '').replace(/^\(|\)$/g, '');
            if (!inner) return false;
            if (t.includes(inner)) return true;
            const m = inner.match(/^(.*),\s*([^,]+)$/);
            if (m) {
                const narrativa = `${m[1]} (${m[2]})`;
                if (t.includes(narrativa)) return true;
                const ap = m[1].split(/\s+y\s+|\s+et al\./)[0].trim();
                if (ap && t.includes(ap) && t.includes(m[2])) return true;
            }
            return false;
        });
        if (!usadas.length) {
            // Texto sustancial sin NINGUNA cita reconocida = el detector no entendió
            // el formato: mejor listar todas en las referencias del Word que ninguna,
            // pero avisando. Texto vacío o mínimo ⇒ 0 citadas DE VERDAD (antes este
            // fallback mentía «239 de 239» incluso con el documento en blanco).
            if (t.length > 500) {
                if (typeof console !== 'undefined') console.warn('[Redactor] No se reconoció ninguna cita en el texto: se listarán todas las fuentes en las referencias del Word.');
                return fuentes.slice();
            }
            return [];
        }
        return usadas;
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
    // ============ F3: PASE DE COHERENCIA (modelo solo donde hace falta) ============
    // Los radares construyen la lista de objetivos; el modelo reescribe SOLO esos
    // párrafos; la firma de citas garantiza que NINGUNA cita nace ni muere.
    _firmaCitas(texto) {
        // Canónica: ÚLTIMO apellido significativo + año, con CONTEO (multiset).
        // Así «Navarro Saldaña y Flores Oyarzo (2022)» ≡ «(Navarro Saldaña y Flores
        // Oyarzo, 2022)», y perder UNA de dos citas con clave compartida se detecta
        // por el conteo. Colisión residual (mismo apellido+año intercambiados): asumida.
        const t = String(texto || '');
        const canon = seg => {
            const limpio = String(seg || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\bet al\.?/g, '').replace(/[.,]+$/g, '').trim();
            const toks = limpio.split(/\s+/).filter(x => x && !['y', '&', 'and', 'de', 'la', 'del', 'los'].includes(x));
            return toks.length ? toks[toks.length - 1] : '';
        };
        const firma = new Map();
        const suma = k => { if (k && !k.startsWith('|')) firma.set(k, (firma.get(k) || 0) + 1); };
        for (const m of t.matchAll(/\(([^()]{2,160}?)\)/g)) {
            for (const seg of m[1].split(';')) {
                const mm = seg.match(/^\s*(.{2,120}?),\s*((?:19|20)\d{2}[a-z]?|s\.\s*f\.)\s*$/);
                if (mm) suma(canon(mm[1]) + '|' + mm[2].replace(/\s+/g, ''));
            }
        }
        for (const m of t.matchAll(/\b([A-Z\u00c0-\u017d][\p{L}\u2019'-]+(?:\s+(?:y|&)\s+[A-Z\u00c0-\u017d][\p{L}\u2019'-]+|\s+et\s+al\.)?)\s+\(((?:19|20)\d{2}[a-z]?|s\.\s*f\.)\)/gu))
            suma(canon(m[1]) + '|' + m[2].replace(/\s+/g, ''));
        return firma;
    },
    _mismaFirma(a, b) {
        if (a.size !== b.size) return false;
        for (const [k, n] of a) if (b.get(k) !== n) return false;
        return true;
    },
    _esNarrativaFr(fr) { return /^(?:[A-Z\u00c0-\u017d][\p{L}\u2019'-]+(?:\s+(?:y\s+[A-Z\u00c0-\u017d][\p{L}\u2019'-]+|et\s+al\.))?)\s*\((?:19|20)\d{2}[a-z]?\)/u.test(fr); },
    _objetivosF3() {
        const doc = this._documento;
        if (!doc || !doc.secciones) return [];
        const textoTotal = doc.secciones.map(s => s.texto).join('\n\n');
        const muletillas = new Set(this._muletillasDoc(textoTotal).map(([k]) => k));
        const variables = this._leerVariables();
        const ficha = (doc.meta && doc.meta.fichaInstrumentos) || this._fichaInstrumentos || [];
        const contradic = this._detectarContradiccionPosicionamiento(doc.secciones, variables);
        const famObjetivo = {};
        for (const v of variables) {
            if (!contradic.some(a => a.includes(v.nombre))) continue;
            const toksV = String(v.nombre).toLowerCase().split(/\s+/);
            const insV = ficha.find(i => i.familia && toksV.some(tk => tk.length > 4 && String(i.constructo || '').includes(tk)));
            if (insV) famObjetivo[v.nombre] = { familia: insV.familia, sigla: insV.sigla || insV.nombre };
            else {
                for (const sec of doc.secciones) {
                    if (!sec.titulo.toLowerCase().includes(v.nombre.toLowerCase())) continue;
                    const m = (sec.texto.match(/se adopta[^.]{0,200}/i) || [''])[0].match(this._FAMILIAS_RE);
                    if (m) { famObjetivo[v.nombre] = { familia: m[0], sigla: '' }; break; }
                }
            }
        }
        const objetivos = [];
        const vistasMuletilla = new Set();
        doc.secciones.forEach((sec, iSec) => {
            const parrs = String(sec.texto || '').split(/\n{2,}/);
            const esEstado = /Estado de la cuesti/i.test(sec.titulo);
            const esDef = /Definici\u00f3n conceptual/i.test(sec.titulo);
            let vaciosEstado = [];
            if (esEstado) parrs.forEach((p, i) => { if (this._declaracionesVacio(p) > 0) vaciosEstado.push(i); });
            const maestraIdx = vaciosEstado.length ? vaciosEstado[vaciosEstado.length - 1] : -1;
            parrs.forEach((p, iParr) => {
                if (/^\[No se pudo generar/.test(p.trim()) || p.trim().length < 120) return;
                // POSICIONAMIENTO (prioridad m\u00e1xima)
                for (const v of variables) {
                    const fo = famObjetivo[v.nombre];
                    if (!fo || !sec.titulo.toLowerCase().includes(v.nombre.toLowerCase())) continue;
                    if (/se adopta/i.test(p)) {
                        const fams = p.match(this._FAMILIAS_RE) || [];
                        if (fams.some(f => f.replace(/-/g, '') !== String(fo.familia).replace(/-/g, ''))) {
                            objetivos.push({ iSec, iParr, tipo: 'POSICIONAMIENTO', prioridad: 0, texto: p,
                                instruccion: `Unifica el posicionamiento: el modelo adoptado para \u00ab${v.nombre}\u00bb es \u00ab${fo.familia}\u00bb${fo.sigla ? ` (en correspondencia con el instrumento ${fo.sigla})` : ''}. Reescribe para que la adopci\u00f3n declare SOLO esa familia, justificando la correspondencia; las dem\u00e1s familias pueden mencionarse \u00fanicamente como alternativas descartadas.` });
                            return;
                        }
                    }
                }
                // TREN de citas (\u22654 narrativas seguidas)
                let run = 0, hayTren = false;
                for (const fr of this._frases(p)) { if (this._esNarrativaFr(fr)) { run++; if (run >= 4) hayTren = true; } else run = 0; }
                if (hayTren) {
                    objetivos.push({ iSec, iParr, tipo: 'TREN', prioridad: 1, texto: p,
                        instruccion: 'Este p\u00e1rrafo encadena 4+ frases \u00abAutor (a\u00f1o) hall\u00f3\u2026\u00bb. Reag\u00fapalo por IDEAS con frases-tema propias y los estudios como respaldo dentro (narrativas o parent\u00e9ticas), variando la ret\u00f3rica.' });
                    return;
                }
                // VAC\u00cdO no-maestro
                if (this._declaracionesVacio(p) > 0 && !(esEstado && iParr === maestraIdx) && !(esDef && iParr === parrs.length - 1)) {
                    objetivos.push({ iSec, iParr, tipo: 'VACIO', prioridad: 2, texto: p,
                        instruccion: 'Elimina la declaraci\u00f3n de vac\u00edo/laguna/escasez de este p\u00e1rrafo (el vac\u00edo maestro vive en el Estado de la cuesti\u00f3n): cierra la idea con una s\u00edntesis del aporte, sin anunciar carencias.' });
                    return;
                }
                // MULETILLA (2\u00aa+ aparici\u00f3n del mismo arranque)
                for (const fr of this._frases(p)) {
                    const k = fr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
                    if (k.split(' ').length === 3 && muletillas.has(k)) {
                        if (!vistasMuletilla.has(k)) { vistasMuletilla.add(k); break; }
                        objetivos.push({ iSec, iParr, tipo: 'MULETILLA', prioridad: 3, texto: p,
                            instruccion: `El arranque \u00ab${k}\u2026\u00bb ya se us\u00f3 antes en el documento: reescribe la(s) frase(s) que lo repiten con otra estructura ret\u00f3rica, manteniendo el contenido.` });
                        return;
                    }
                }
            });
        });
        objetivos.sort((a, b) => a.prioridad - b.prioridad);
        return objetivos.slice(0, 14);
    },
    async _onPaseF3() {
        if (!this._documento) return;
        const estado = document.getElementById('redEstado');
        const btn = document.getElementById('redPaseF3');
        const objetivos = this._objetivosF3();
        if (!objetivos.length) { if (estado) estado.textContent = '\u2728 F3: los radares est\u00e1n limpios \u2014 nada que pulir.'; return; }
        if (btn) { btn.disabled = true; btn.textContent = '\ud83e\uddea Puliendo\u2026'; }
        const porSec = new Map();
        objetivos.forEach(o => { if (!porSec.has(o.iSec)) porSec.set(o.iSec, []); porSec.get(o.iSec).push(o); });
        let aplicados = 0, rechazados = 0, fallos = 0;
        const antes = { trenes: 0, muletillas: this._muletillasDoc(this._documento.secciones.map(s => s.texto).join('\n\n')).length, vacios: this._declaracionesVacio(this._documento.secciones.map(s => s.texto).join('\n\n')) };
        let hechas = 0;
        for (const [iSec, items] of porSec) {
            const sec = this._documento.secciones[iSec];
            if (estado) estado.textContent = `\ud83e\uddea F3: puliendo \u00ab${sec.titulo}\u00bb (${++hechas}/${porSec.size} secciones, ${items.length} pasaje(s))\u2026`;
            let reescritos = [];
            try { reescritos = await IAAsistente.pulirPasajes(sec.titulo, items.map(o => ({ i: o.iParr, tipo: o.tipo, instruccion: o.instruccion, texto: o.texto })), { keyHint: (hechas - 1) % 10 }); }
            catch (e) { fallos += items.length; console.warn('[F3] secci\u00f3n fall\u00f3:', sec.titulo, e && e.codigo, e && e.message); continue; }
            const parrs = String(sec.texto || '').split(/\n{2,}/);
            for (const r of reescritos) {
                const orig = parrs[r.i];
                if (typeof orig !== 'string') { rechazados++; continue; }
                const nuevo = this._limpiarTexto(r.texto);
                const ratio = nuevo.length / Math.max(1, orig.length);
                const seguro = this._mismaFirma(this._firmaCitas(orig), this._firmaCitas(nuevo))
                    && !/[\[(]F\d|\bF\d/.test(nuevo) && !/^\[No se pudo/.test(nuevo) && ratio > 0.5 && ratio < 1.7;
                if (seguro) { parrs[r.i] = nuevo; aplicados++; } else { rechazados++; }
            }
            sec.texto = parrs.join('\n\n');
        }
        const textoNuevo = this._documento.secciones.map(s => `${s.titulo}\n\n${s.texto}`).join('\n\n\n');
        const res = document.getElementById('redResultado');
        if (res) res.textContent = textoNuevo;
        this._documento.meta.f3 = { fecha: new Date().toISOString(), aplicados, rechazados, fallos };
        try { this._guardarUltimo(); } catch (e) {}
        const todo = this._documento.secciones.map(s => s.texto).join('\n\n');
        const despues = { muletillas: this._muletillasDoc(todo).length, vacios: this._declaracionesVacio(todo) };
        const contradicPost = this._detectarContradiccionPosicionamiento(this._documento.secciones, this._leerVariables()).length;
        if (estado) estado.innerHTML = `<div style="text-align:left;border:1px solid #d0d7de;border-radius:10px;padding:10px 14px;background:#f8fafc;line-height:1.6;">`
            + `<div style="font-weight:700;color:#116329;">\ud83e\uddea Pase de coherencia F3 completado</div>`
            + `<div><b>\u270d\ufe0f Pulido:</b> ${aplicados} pasaje(s) reescrito(s) \u00b7 ${rechazados} rechazado(s) por seguridad de citas${fallos ? ` \u00b7 ${fallos} sin respuesta del modelo` : ''}</div>`
            + `<div><b>\ud83d\udcc9 Radares:</b> muletillas ${antes.muletillas}\u2192${despues.muletillas} \u00b7 vac\u00edos ${antes.vacios}\u2192${despues.vacios} \u00b7 posicionamiento contradictorio: ${contradicPost ? '\u26a0\ufe0f a\u00fan presente' : '\u2705 unificado'}</div>`
            + `<div style="margin-top:4px;color:#57606a;">\ud83d\udce5 Vuelve a descargar Word/PDF para llevarte la versi\u00f3n pulida. Ninguna cita naci\u00f3 ni muri\u00f3: garantizado por firma.</div></div>`;
        if (btn) { btn.disabled = false; btn.textContent = '\ud83e\uddea Pase de coherencia (F3)'; }
    },
    // ============ PDF: mismo documento, jsPDF bajo demanda (patrón ExcelJS) ============
    // jsPDF con fuentes core = WinAnsi/Latin-1: ı, ć, α, β, guiones tipográficos…
    // producen glifos rotos y LÍNEAS DECAPITADAS. Transliteración fiel solo-PDF
    // (el Word conserva todo perfecto).
    _paraPDF(s) {
        return String(s == null ? '' : s)
            .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
            .replace(/[\u2018\u2019\u201A]/g, "'").replace(/[\u201C\u201D\u201E]/g, '"')
            .replace(/\u2026/g, '...').replace(/[\u00A0\u202F\u2009]/g, ' ')
            .replace(/ı/g, 'i').replace(/İ/g, 'I')
            .replace(/[ćč]/g, 'c').replace(/[ĆČ]/g, 'C')
            .replace(/[şș]/g, 's').replace(/[ŞȘ]/g, 'S')
            .replace(/[ğ]/g, 'g').replace(/[łŀ]/g, 'l').replace(/[ŁĿ]/g, 'L')
            .replace(/[đ]/g, 'd').replace(/[Đ]/g, 'D').replace(/[ž]/g, 'z').replace(/[Ž]/g, 'Z')
            .replace(/α/g, 'alfa').replace(/β/g, 'beta').replace(/λ/g, 'lambda').replace(/χ/g, 'chi')
            .replace(/≈/g, '~').replace(/≤/g, '<=').replace(/≥/g, '>=')
            .replace(/[→↔]/g, '-').replace(/[«»]/g, '"')
            .replace(/[^\u0000-\u00FF]/g, '');
    },
    _cargarJsPDF() {
        if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
        const urls = [
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
            'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
        ];
        return urls.reduce((p, u) => p.catch(() => new Promise((res, rej) => {
            const sc = document.createElement('script');
            sc.src = u; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc);
        })), Promise.reject());
    },
    async _onDescargarPDF() {
        if (!this._documento) return;
        const estado = document.getElementById('redEstado');
        try { await this._cargarJsPDF(); } catch (e) {
            if (estado) estado.textContent = '❌ No se pudo cargar el generador de PDF (¿CDN bloqueado?). Usa Descargar Word.';
            return;
        }
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
        const M = 72, ANCHO = 612 - M * 2, PIE = 720, LINEA = 23;
        let y = M;
        const salto = (n = LINEA) => { y += n; if (y > PIE) { pdf.addPage(); y = M; } };
        const parrafo = (texto, francesa = false, sangriaInicial = false) => {
            const limpio = this._paraPDF(texto);
            let lineas;
            if (sangriaInicial) {
                // Sangría APA de 1ª línea (0.5in): la primera se parte a ancho reducido
                // y el resto refluye a ancho completo.
                const primera = pdf.splitTextToSize(limpio, ANCHO - 36)[0] || '';
                const resto = limpio.slice(primera.length).trim();
                lineas = [{ tx: primera, x: M + 36 }, ...pdf.splitTextToSize(resto, ANCHO).map(tx => ({ tx, x: M }))];
            } else {
                lineas = pdf.splitTextToSize(limpio, ANCHO - (francesa ? 36 : 0)).map((tx, i) => ({ tx, x: M + (francesa && i > 0 ? 36 : 0) }));
            }
            for (const ln of lineas) {
                if (y > PIE) { pdf.addPage(); y = M; }
                if (ln.tx) pdf.text(ln.tx, ln.x, y);
                y += LINEA;
            }
        };
        pdf.setFontSize(12);
        const d = this._documento;
        let capAct = '';
        for (const s of d.secciones) {
            if ((s.capitulo || 'II') !== capAct) {
                capAct = s.capitulo || 'II';
                if (y > PIE - 60) { pdf.addPage(); y = M; }   // encabezado jamás huérfano al pie
                pdf.setFont('times', 'bold');
                pdf.text(capAct === 'I' ? 'CAPÍTULO I: INTRODUCCIÓN' : 'CAPÍTULO II: MARCO TEÓRICO', 306, y, { align: 'center' });
                salto(LINEA * 1.4);
            }
            if (y > PIE - 60) { pdf.addPage(); y = M; }
            pdf.setFont('times', 'bold');
            pdf.text(this._paraPDF(String(s.titulo || '').toUpperCase()), 306, y, { align: 'center' });
            salto(LINEA * 1.2);
            pdf.setFont('times', 'normal');
            for (const par of String(s.texto || '').split(/\n{2,}/)) { parrafo(par.trim(), false, true); salto(6); }
            salto(10);
        }
        pdf.addPage(); y = M;
        pdf.setFont('times', 'bold');
        pdf.text('REFERENCIAS', 306, y, { align: 'center' }); salto(LINEA * 1.3);
        pdf.setFont('times', 'normal');
        const refs = d.citadas.slice().sort((a, b) => String(a.ref).localeCompare(String(b.ref), 'es'));
        for (const f of refs) { parrafo(String(f.ref), true); salto(4); }
        // Números de página (APA: esquina superior derecha)
        const nPag = pdf.internal.getNumberOfPages();
        for (let p = 1; p <= nPag; p++) { pdf.setPage(p); pdf.setFont('times', 'normal'); pdf.setFontSize(11); pdf.text(String(p), 612 - M, 40, { align: 'right' }); pdf.setFontSize(12); }
        pdf.save('marco_teorico_APA.pdf');
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
        const problema = (document.getElementById('antQuery') || {}).value || '';
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
        const MAXp = (typeof IAAsistente !== 'undefined' && IAAsistente.MAX_FUENTES_SECCION) || 32;
        if (estado) estado.textContent = `✍️ Redactando con ${Math.min(fuentes.length, MAXp)} fuentes… puede tardar ~1 minuto.`;
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
            if (estado) estado.textContent = '❌ ' + (e.message || 'No se pudo redactar la sección.')
                + (e.codigo ? ` (código: ${e.codigo})` : '');
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
