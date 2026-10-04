// redactor/redactor/calidad.js — RedactorTeorico: control de calidad del texto redactado (muletillas, fantasmas narrativos, citas sospechosas, contradicciones, instrumentos) y autotest.
// Origen: redactor/redactor/redaccion.js (Fase 6, segunda pasada: partición por responsabilidad).

export const metodosRedactorTeoricoCalidad = {

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
        texto = String(texto || '').replace(/\[No se pudo generar[^\]]*\]/g, ' ');
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
        texto = String(texto || '').replace(/\[No se pudo generar[^\]]*\]/g, ' ');
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


    _esNarrativaFr(fr) { return /^(?:[A-Z\u00c0-\u017d][\p{L}\u2019'-]+(?:\s+(?:y\s+[A-Z\u00c0-\u017d][\p{L}\u2019'-]+|et\s+al\.))?)\s*\((?:19|20)\d{2}[a-z]?\)/u.test(fr); },


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
};
