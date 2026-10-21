// @ts-check
// buscador/fuentes/doi.js — el DOI de un registro, validado, para las fuentes que lo leen de su API.
// (2026.12.27) Era una función de fuentes/wos.js; ScienceDirect necesita la misma, así que vive aquí, una sola vez.

/**
 * El DOI sin resolvedor ni prefijo («10.xxxx/…»), o '' si no lo es. Admite los ángulos de los DOI SICI
 * («10.1002/(SICI)…<1::AID-JCLP1>3.0.CO;2-H»): al pintarlo se escapa (shared/html.js); comillas y espacios, no.
 * @param {unknown} doi
 * @returns {string}
 */
export function doiLimpio(doi) {
    const d = String(doi ?? '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    return /^10\.\d{4,9}\/[^\s"'`]+$/.test(d) ? d : '';
}
