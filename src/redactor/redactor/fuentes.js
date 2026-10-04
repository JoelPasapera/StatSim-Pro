// redactor/redactor/fuentes.js — RedactorTeorico: importación (CSV/XLSX), saneado, citas y selección de fuentes.
// Origen: redactor/redactor.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

import { fuentesBuscador } from './base.js';

export const metodosRedactorTeoricoFuentes = {
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

    // Relevancia en su escala ORIGINAL 1-5 (espejo exacto del filtro del Buscador:
    // «mayor o igual que N»). Texto de cortesía: Alta=5, Media=3, Baja=1.
    // null = sin dato → SIEMPRE pasa: nada se pierde en silencio.
    _valorRelevancia(f) {
        const v = String((f && f.relevancia) || '').toLowerCase().trim();
        if (!v) return null;
        if (/alta|high/.test(v)) return 5;
        if (/media|medium|moderada/.test(v)) return 3;
        if (/baja|low/.test(v)) return 1;
        const n = parseFloat(v.replace(',', '.'));
        return isFinite(n) ? n : null;
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
        if (rk > 0) return filtrada.filter(f => { const r = this._valorRelevancia(f); return r === null || r >= rk; });
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
        const fb = fuentesBuscador();
        if (!this._fuentesImportadas || !fb || !fb.recuperarDatos) return;
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
                    const datos = await fb.recuperarDatos(f.doi);
                    if (datos && datos.abstract && (!f.resumen || f.resumen.length < 40)) { f.resumen = datos.abstract; logrados++; }
                    // Reparar AUTORES rotos: cita nueva con apellidos reales y la
                    // referencia reconstruida (autores APA + resto original desde el año).
                    if (datos && datos.autores && datos.autores.length && f._autoresPendientes) {
                        const autoresLimpios = (datos.autores || []).map(a => this._sanearAutor(a)).filter(Boolean);
                        const nuevaCita = this._citaDesdeAutores(autoresLimpios, f.anio || datos.anio);
                        if (nuevaCita) {
                            f.cita = nuevaCita;
                            const resto = String(f.ref).split(/(?=\(\s*(?:\d{4}|s\.\s*f\.))/)[1] || `(${f.anio || datos.anio || 's. f.'}). ${f.titulo}.`;
                            const autoresAPA = (typeof fb.autoresAPA === 'function')
                                ? fb.autoresAPA(datos.autores) : datos.autores.join(', ');
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
        const fb = fuentesBuscador();
        if (!fb || !fb.obtenerFuentesRedaccion) return [];
        const obras = fb.obtenerFuentesRedaccion();
        return this._sanearFuentes(obras.map(o => ({
            cita: this._citaCorta(o),
            ref: (fb.citaAPA ? fb.citaAPA(o) : ''),
            titulo: o.titulo || '',
            anio: o.anio || '',
            relevancia: iRel >= 0 ? String(f[iRel] ?? '').trim() : '',
            resumen: o.resumen || o.abstract || ''
        })));
    },

    _apellido(nombre) {
        const n = String(nombre || '').trim();
        if (!n) return '';
        const fb = fuentesBuscador();
        if (fb && fb.autorAPA) {
            return fb.autorAPA(n).split(',')[0].trim();
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
        const fb = fuentesBuscador();
        if (fb && fb.relevanciaAplicada && fb.umbralRelevancia > 0) {
            filtro = ` (filtro: relevancia ≥ ${fb.umbralRelevancia})`;
        }
        info.textContent = n
            ? `📚 Fuentes disponibles para la redacción: ${n}${filtro}.`
            : '📚 Aún no hay fuentes: busca y marca artículos, o carga una matriz exportada (arriba).';
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
};
