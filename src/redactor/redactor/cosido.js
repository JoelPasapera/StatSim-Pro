// redactor/redactor/cosido.js — RedactorTeorico: cosido de partes y frases, marcadores, fuentes citadas y HTML APA.
// Origen: redactor/redactor/redaccion.js (Fase 6, segunda pasada: partición por responsabilidad).

export const metodosRedactorTeoricoCosido = {

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
};
