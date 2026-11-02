// tests/ui/citas.js — (2027.01.20) las citas de un documento de Word del programa frente a sus referencias: cada cita del
// texto, de las notas y de los títulos («(Autor, año)», «Autor y Otro (año)», «Autor et al., año, año») tiene su referencia (el
// mismo primer autor y el mismo año) y cada referencia se cita. La revisión de las fases A y B halló citas sin referencia
// (Lecoutre, Benavoli) y una veintena de referencias sin cita; esto las encuentra en cada Word que exportan las pruebas.

/** Los autores institucionales que se citan por su sigla. */
const SIGLAS = Object.freeze({ AERA: 'American Educational Research Association' });

/** El texto plano de un trozo de HTML (sin etiquetas y con las entidades de escaparHTML deshechas). @param {string} html */
const plano = html => html.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

/** Un apellido con mayúscula inicial (con tildes, apóstrofos y guiones), y las partículas neerlandesas y alemanas («van
 * Buuren»; no «de», que en castellano es la preposición de «el de Cousineau»). */
const APELLIDO = "(?:(?:van|von)(?: der| den)? )?[A-ZÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜáéíóúñü’'\\-]+";
/** Los coautores con un apellido de dos palabras («Kendall y Babington Smith, 1939»). */
const COMPUESTOS = ['Babington Smith'];
const COAUTOR = `(?:${COMPUESTOS.join('|')}|${APELLIDO})`;
/** Una cita: el primer autor, sus coautores («y X», «e Y») o «et al.», y uno o varios años. */
const CITA = new RegExp(`(${APELLIDO})((?:,? (?:y|e) ${COAUTOR})*|(?: et al\\.))(?:, | \\()((?:19|20)\\d{2})((?:, (?:19|20)\\d{2})*)`, 'gu');

/**
 * Las citas y las referencias de un documento, y lo que no cuadra.
 * @param {string} html el documento (con la sección «Referencias» de referenciasWord)
 * @returns {{ sinReferencia: string[], sinCita: string[] }}
 */
export function problemasDeCitas(html) {
    const marca = '<b>Referencias</b></p>', k = html.indexOf(marca);
    if (k < 0) return { sinReferencia: [], sinCita: ['(el documento no tiene referencias)'] };
    const texto = plano(html.slice(0, k)), refsHtml = html.slice(k + marca.length);
    const referencias = [...refsHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => {
        const t = plano(/** @type {string} */ (m[1])).trim(), anio = (/\((\d{4})/.exec(t) || [])[1] || '';
        return { apellido: t.slice(0, t.indexOf(',')).trim(), anio, texto: t.slice(0, 60) };
    });
    /** @type {{ apellido: string, anio: string }[]} */ const citas = [];
    for (const m of texto.matchAll(CITA)) {
        const apellido = /** @type {string} */ (m[1]), anios = [/** @type {string} */ (m[3]), ...(m[4] || '').split(',').map(s => s.trim()).filter(Boolean)];
        for (const anio of anios) citas.push({ apellido: SIGLAS[/** @type {'AERA'} */ (apellido)] || apellido, anio });
    }
    const igual = (/** @type {{ apellido: string, anio: string }} */ c, /** @type {{ apellido: string, anio: string }} */ r) => c.apellido === r.apellido && c.anio === r.anio;
    return {
        sinReferencia: [...new Set(citas.filter(c => !referencias.some(r => igual(c, r))).map(c => `${c.apellido} (${c.anio})`))],
        sinCita: referencias.filter(r => !citas.some(c => igual(c, r))).map(r => r.texto)
    };
}
