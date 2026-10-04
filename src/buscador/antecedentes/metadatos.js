// buscador/antecedentes/metadatos.js — Antecedentes: detección de país, indexación, cuartil, muestra y objetivo; formato APA.
// Origen: buscador/antecedentes.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

export const metodosAntecedentesMetadatos = {

    // ---------- Extracción heurística de campos (de abstract/metadatos) ----------

    // País: busca gentilicios/países frecuentes en título+resumen.
    _detectarPais(o) {
        const t = (o.titulo + ' ' + (o.resumen || '')).toLowerCase();
        const mapa = {
            'Perú': /per[uú]|peruvian|peruan/, 'México': /m[eé]xico|mexican/, 'Chile': /chile/,
            'Colombia': /colombia/, 'Argentina': /argentin/, 'España': /spain|spanish|españ/,
            'Ecuador': /ecuador/, 'Brasil': /brazil|brasil/, 'Bolivia': /bolivia/,
            'Venezuela': /venezuel/, 'Estados Unidos': /united states|american students|\bu\.?s\.?a?\b/,
            'China': /\bchina\b|chinese/, 'Marruecos': /morocc/, 'Turquía': /turkey|turkish/
        };
        for (const [pais, rx] of Object.entries(mapa)) if (rx.test(t)) return pais;
        return '';
    },


    // Indexación: inferida de la fuente/base (heurística; el usuario verifica).
    _detectarIndexacion(o) {
        const ix = [];
        if ((o.fuentesAPI || []).includes('Scopus')) ix.push('Scopus');
        const f = (o.fuente || '').toLowerCase();
        if (/scielo/.test((o.link || '') + f)) ix.push('SciELO');
        if (/redalyc/.test((o.link || '') + f)) ix.push('Redalyc');
        if (o.doi) ix.push('Crossref');
        return [...new Set(ix)].join(', ');
    },


    // Insignia de cuartil con color para mostrar en la tabla (HTML).
    _insigniaCuartil(o) {
        if (!o._metricas || !o._metricas.cuartil) return '';
        const m = o._metricas;
        const colores = { Q1: ['#E1F5EE', '#085041'], Q2: ['#EAF3DE', '#27500A'], Q3: ['#FAEEDA', '#633806'], Q4: ['#FCEBEB', '#791F1F'] };
        const [bg, fg] = colores[m.cuartil] || ['#F1EFE8', '#444441'];
        const cs = m.citeScore ? `<div style="font-size:0.75rem; color:#666; margin-top:3px;">CiteScore ${m.citeScore}</div>` : '';
        return `<span style="display:inline-block; background:${bg}; color:${fg}; font-size:0.78rem; font-weight:600; padding:2px 8px; border-radius:6px;">${m.cuartil}</span>${cs}`;
    },


    // Texto plano del cuartil (para CSV): "Q1, CiteScore 4.8".
    _cuartilTexto(o) {
        if (!o._metricas || !o._metricas.cuartil) return '';
        const m = o._metricas;
        return m.cuartil + (m.citeScore ? `, CiteScore ${m.citeScore}` : '');
    },


    // Muestra: frases tipo "N participantes/students/estudiantes/sample".
    _detectarMuestra(o) {
        const r = o.resumen || '';
        const m = r.match(/(\b\d[\d.,]{1,6})\s*(participants?|participantes|students?|estudiantes|subjects?|sujetos|adolescen\w*|ni[ñn]os|adults?|adultos|individuals?|patients?|pacientes)/i);
        return m ? `${m[1].replace(/[.,]$/, '')} ${m[2]}` : '';
    },


    // Objetivo: oración del abstract que enuncia propósito (aim/objetivo/purpose).
    _detectarObjetivo(o) {
        const r = o.resumen || '';
        const m = r.match(/[^.]*\b(aim(?:ed)?|objective|purpose|this study (?:aims|examines|investigates|analyzes)|objetivo|prop[oó]sito|se busc[oó]|tuvo por objeto)\b[^.]*\./i);
        return m ? m[0].trim() : '';
    },


    // ---------- APA 7 ----------
    // Convierte un nombre de autor (en cualquiera de los formatos que devuelven
    // las APIs) a APA: "Apellido, I. I.". Detecta las INICIALES (tokens de una
    // letra, con o sin punto, p. ej. "E.", "EB", "J.A.") para no confundirlas
    // con el apellido:  "Batbayar E." → Batbayar, E. · "E. Batbayar" → Batbayar, E.
    // · "Juan García" → García, J. · "García, J." → García, J. (idempotente).
    _esInicial(tok) {
        return /^([A-ZÁÉÍÓÚÑ]\.?){1,3}$/.test(tok.replace(/\./g, '.'));
    },

    // ¿Autor corporativo? (organismos, ministerios, universidades…). En APA 7ª
    // se escriben con su nombre completo, SIN invertir ni reducir a iniciales.
    _esCorporativo(n) {
        return /\(|organi[sz]ation|organizaci[oó]n|nations|naciones|unicef|unesco|world health|pan american|panamericana|ministerio|ministry|fondo|\bfund\b|programme|programa|instituto|institute|universidad|university|agencia|agency|centro|centre|center|comit[eé]|committee|asociaci[oó]n|association|banco|\bbank\b|secretar[ií]a|department|departamento|oficina|office/i.test(n);
    },

    _autorAPA(nombre) {
        const n = String(nombre || '').trim();
        if (!n) return '';
        if (this._esCorporativo(n)) return n.replace(/\s+/g, ' ');
        if (n.includes(',')) {
            // Ya viene "Apellido, Iniciales": normalizar puntos de las iniciales.
            const [ape, resto] = [n.split(',')[0].trim(), n.split(',').slice(1).join(',').trim()];
            const ini = resto.split(/\s+/).filter(Boolean)
                .map(p => this._esInicial(p)
                    ? p.replace(/\./g, '').split('').map(c => c.toUpperCase() + '.').join(' ')
                    : p[0].toUpperCase() + '.')
                .join(' ');
            return ini ? `${ape}, ${ini}` : ape;
        }
        const partes = n.split(/\s+/);
        if (partes.length === 1) return partes[0];
        const inicialesFin = [], inicialesIni = [];
        let i = partes.length - 1;
        while (i > 0 && this._esInicial(partes[i])) { inicialesFin.unshift(partes[i]); i--; }
        let j = 0;
        while (j < partes.length - 1 && this._esInicial(partes[j])) { inicialesIni.push(partes[j]); j++; }
        let apellidoTokens, inicialesTokens;
        if (inicialesFin.length) {          // "Batbayar E." / "De la Cruz J. A."
            apellidoTokens = partes.slice(0, partes.length - inicialesFin.length);
            inicialesTokens = inicialesFin;
        } else if (inicialesIni.length) {   // "E. Batbayar" / "J. A. de la Cruz"
            apellidoTokens = partes.slice(inicialesIni.length);
            inicialesTokens = inicialesIni;
        } else {                            // "Juan García" (nombres completos)
            apellidoTokens = [partes[partes.length - 1]];
            inicialesTokens = partes.slice(0, -1);
        }
        const apellido = apellidoTokens.join(' ');
        const ini = inicialesTokens.map(p => this._esInicial(p)
            ? p.replace(/\./g, '').split('').map(c => c.toUpperCase() + '.').join(' ')
            : p[0].toUpperCase() + '.').join(' ');
        return ini ? `${apellido}, ${ini}` : apellido;
    },

    _autoresAPA(autores) {
        const a = autores.map(n => this._autorAPA(n));
        if (!a.length) return '';
        if (a.length === 1) return a[0];
        if (a.length === 2) return `${a[0]} y ${a[1]}`;
        if (a.length <= 20) return `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`;
        return `${a.slice(0, 19).join(', ')}, ... ${a[a.length - 1]}`;
    },

    citaAPA(o) {
        // APA 7ª: el bloque de autores cierra con punto. Las personas ya lo
        // traen en la inicial (García, J.), pero los corporativos no — se añade
        // solo cuando falta, sin duplicarlo jamás.
        let aut = this._autoresAPA(o.autores);
        if (aut && !aut.endsWith('.')) aut += '.';
        let c = `${aut} (${o.anio}). ${o.titulo}.`;
        if (o.fuente) {
            // Informes de organismos (OMS/ONU): en APA 7ª la editorial es el
            // propio organismo, no una "revista" — y va en redonda.
            const esInstitucional = /^(OMS · IRIS|ONU · Biblioteca Digital)$/.test(o.fuente);
            if (esInstitucional) {
                const editorial = (o.autores && o.autores[0] && this._esCorporativo(o.autores[0]))
                    ? o.autores[0]
                    : (o.fuente.startsWith('OMS') ? 'Organización Mundial de la Salud' : 'Naciones Unidas');
                c += ` ${editorial}.`;
            } else {
                c += ` <i>${o.fuente}</i>`;
                if (o.volumen) c += `, <i>${o.volumen}</i>${o.numero ? `(${o.numero})` : ''}`;
                if (o.paginas) c += `, ${o.paginas}`;
                c += '.';
            }
        }
        // APA 7: cerrar con el DOI; si no hay DOI, con la URL de acceso disponible.
        if (o.doi) c += ` ${o.doi}`;
        else if (o.link) c += ` ${o.link}`;
        return c;
    },
};
