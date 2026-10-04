// analizador/psicometria/aiken-redaccion.js — textos y tablas APA 7 de la V de Aiken (sin DOM): el párrafo para el
// apartado de validez del instrumento, las referencias que ese párrafo cita, las tablas para Word (mismo estilo que el
// exportador del capítulo de resultados) y el CSV de resultados.
import { CRITERIOS_V0 } from './aiken.js';

// APA: los estadísticos acotados entre 0 y 1 van sin cero inicial (.85); p con tres decimales o «< .001»
export const f2 = x => (Number.isFinite(x) ? x.toFixed(2).replace(/^(-?)0\./, '$1.') : '—');
export const fp = p => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.'));
const pct = c => `${String(Math.round(c * 1000) / 10).replace('.', ',')} %`;
export const ROTULO_DECISION = { valido: 'Válido', revisar: 'Revisar', no_valido: 'No válido' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const lista = xs => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
const listaMinuscula = xs => lista(xs.map(x => x.toLowerCase()));
const itemsDe = (filas, decision) => filas.filter(x => x.decision === decision).map(x => x.etiqueta);
// Nombra ítems en prosa: «el ítem 4» / «los ítems 3 y 6» con la numeración por defecto; con etiquetas propias
// (el enunciado del ítem), entre comillas latinas.
const numeroDe = e => { const m = /^[íi]tem\s+(\d+)$/i.exec(String(e).trim()); return m ? m[1] : null; };
function nombrarItems(etiquetas, conArticulo = true) {
    const nums = etiquetas.map(numeroDe);
    const cuerpo = lista(nums.every(Boolean) ? nums : etiquetas.map(e => `«${e}»`));
    const uno = etiquetas.length === 1;
    return conArticulo ? `${uno ? 'el ítem' : 'los ítems'} ${cuerpo}` : `${uno ? 'ítem' : 'ítems'} ${cuerpo}`;
}

export function citaCriterio(v0) {
    const c = CRITERIOS_V0.find(x => Math.abs(x.valor - v0) < 1e-9);
    return c && c.cita ? c.cita : null;
}

// Párrafo para el apartado «Validez de contenido» del método (o de resultados, en un estudio instrumental)
export function redactarParrafo(res) {
    const { configuracion: cfg, criterios, resumen, porItem } = res;
    const nJ = resumen.nJueces, nI = cfg.nItems;
    const cita = citaCriterio(cfg.v0);
    const partes = [];
    partes.push(`La validez de contenido se examinó mediante el juicio de ${nJ === 1 ? '1 experto, quien valoró' : `${nJ} expertos, quienes valoraron`} ${criterios.length > 1 ? `la ${listaMinuscula(cfg.criterios)}` : `la ${cfg.criterios[0].toLowerCase()}`} ${nI === 1 ? 'del único ítem' : `de los ${nI} ítems`} en una escala de ${cfg.minimo} a ${cfg.maximo}.`);
    partes.push(`Para cada ítem${criterios.length > 1 ? ' y criterio' : ''} se calculó el coeficiente V de Aiken (Aiken, 1980) con su intervalo de confianza al ${pct(cfg.confianza)} por el método score (Penfield y Giacobbi, 2004), y se consideró válido el ítem cuyo límite inferior alcanzó el criterio V₀ = ${f2(cfg.v0)} (${cita ? `${cita}; ` : ''}Merino-Soto y Livia, 2009).`);
    criterios.forEach(c => {
        const r = c.resumen, revisar = itemsDe(c.items, 'revisar'), malos = itemsDe(c.items, 'no_valido');
        const validos = r.validos === nI ? (nI === 1 ? 'el ítem fue válido' : 'todos los ítems fueron válidos') : r.validos === 0 ? 'ningún ítem fue válido' : `${r.validos} ${r.validos === 1 ? 'ítem fue válido' : 'ítems fueron válidos'}`;
        let t = nI === 1 ? `En ${c.nombre.toLowerCase()}, V = ${f2(r.vMedia)}; ${validos}` : `En ${c.nombre.toLowerCase()}, los coeficientes oscilaron entre ${f2(r.vMin)} y ${f2(r.vMax)} (M = ${f2(r.vMedia)}); ${validos}`;
        if (revisar.length) t += `, ${revisar.length === 1 ? 'uno requiere revisión' : `${revisar.length} requieren revisión`} (${nombrarItems(revisar, false)})`;
        if (malos.length) t += `${revisar.length ? ' y' : ','} ${malos.length === 1 ? 'uno no alcanzó el criterio' : `${malos.length} no alcanzaron el criterio`} (${nombrarItems(malos, false)})`;
        partes.push(t + '.');
    });
    const revisarG = itemsDe(porItem, 'revisar'), malosG = itemsDe(porItem, 'no_valido');
    let cierre = criterios.length > 1
        ? `En conjunto, ${resumen.validos} de los ${nI} ítems resultaron válidos en ${criterios.length === 2 ? 'ambos criterios' : `los ${criterios.length} criterios`} y la V promedio del instrumento fue ${f2(resumen.vMedia)}.`
        : `La V promedio del instrumento fue ${f2(resumen.vMedia)}.`;
    if (revisarG.length) cierre += ` Se recomienda revisar ${nombrarItems(revisarG)}, cuya evidencia no es concluyente con este número de jueces`;
    if (malosG.length) cierre += `${revisarG.length ? ', y' : ' Se recomienda'} reformular o retirar ${nombrarItems(malosG)}`;
    if (revisarG.length || malosG.length) cierre += '.';
    partes.push(cierre);
    return partes.join(' ');
}

// Referencias APA 7 de lo que cita el párrafo (orden alfabético)
export function referencias(v0) {
    const refs = [
        'Aiken, L. R. (1980). Content validity and reliability of single items or questionnaires. <i>Educational and Psychological Measurement, 40</i>(4), 955–959. https://doi.org/10.1177/001316448004000419',
        'Aiken, L. R. (1985). Three coefficients for analyzing the reliability and validity of ratings. <i>Educational and Psychological Measurement, 45</i>(1), 131–142. https://doi.org/10.1177/0013164485451012',
        'Merino-Soto, C. y Livia Segovia, J. (2009). Intervalos de confianza asimétricos para el índice la validez de contenido: Un programa Visual Basic para la V de Aiken. <i>Anales de Psicología, 25</i>(1), 169–171.',
        'Penfield, R. D. y Giacobbi, P. R., Jr. (2004). Applying a score confidence interval to Aiken\'s item content-relevance index. <i>Measurement in Physical Education and Exercise Science, 8</i>(4), 213–225. https://doi.org/10.1207/s15327841mpee0804_3'
    ];
    const cita = citaCriterio(v0);
    if (cita && cita.startsWith('Charter')) refs.push('Charter, R. A. (2003). A breakdown of reliability coefficients by test type and reliability method, and the clinical implications of low reliability. <i>The Journal of General Psychology, 130</i>(3), 290–304. https://doi.org/10.1080/00221300309601160');
    if (cita && cita.startsWith('Cicchetti')) refs.push('Cicchetti, D. V. (1994). Guidelines, criteria, and rules of thumb for evaluating normed and standardized assessment instruments in psychology. <i>Psychological Assessment, 6</i>(4), 284–290. https://doi.org/10.1037/1040-3590.6.4.284');
    return refs.sort((a, b) => a.localeCompare(b, 'es'));
}

// Filas de la tabla de un criterio (texto plano; el llamador decide el formato)
export function filasCriterio(c) {
    return c.items.map(x => [x.etiqueta, String(x.n), x.media.toFixed(2), f2(x.V), `[${f2(x.inferior)}, ${f2(x.superior)}]`, fp(x.p), ROTULO_DECISION[x.decision]]);
}
export const CABECERA_CRITERIO = ['Ítem', 'n', 'M', 'V', 'IC', 'p', 'Decisión'];
export const notaCriterio = cfg => `M = media de las valoraciones (escala ${cfg.minimo}–${cfg.maximo}); V = V de Aiken; IC = intervalo de confianza al ${pct(cfg.confianza)} por el método score (Penfield y Giacobbi, 2004); p = probabilidad exacta de obtener una V igual o mayor si los jueces valoraran al azar (Aiken, 1985). Decisión por el límite inferior del IC frente a V₀ = ${f2(cfg.v0)}: válido (límite ≥ V₀), revisar (V ≥ V₀ pero límite < V₀), no válido (V < V₀).`;

// Tabla APA 7 para Word: filetes superior, bajo el encabezado e inferior; sin bordes verticales
function tablaWord(numero, titulo, cabecera, filas, nota) {
    const th = cabecera.map(h => `<td style="border-top:1pt solid black;border-bottom:1pt solid black;padding:3pt 4pt;font-weight:bold;">${esc(h)}</td>`).join('');
    const tr = filas.map((f, i) => '<tr>' + f.map(c => `<td style="padding:2pt 4pt;${i === filas.length - 1 ? 'border-bottom:1pt solid black;' : ''}">${esc(c)}</td>`).join('') + '</tr>').join('');
    return `<p style="margin:14pt 0 0;line-height:200%;"><b>Tabla ${numero}</b></p>
        <p style="margin:0 0 6pt;line-height:200%;"><i>${esc(titulo)}</i></p>
        <table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:11pt;line-height:115%;"><tr>${th}</tr>${tr}</table>
        <p style="margin:4pt 0 0;font-size:11pt;line-height:150%;"><i>Nota.</i> ${esc(nota)}</p>`;
}

// Documento Word completo (HTML con el espacio de nombres de Office, Times New Roman 12)
export function documentoWord(res) {
    const cfg = res.configuracion;
    let n = 0;
    let cuerpo = `<p style="margin:0 0 8pt;line-height:200%;text-align:center;"><b>Validez de contenido por juicio de expertos</b></p>
        <p style="margin:0;line-height:200%;text-align:justify;text-indent:0.5in;">${esc(redactarParrafo(res))}</p>`;
    res.criterios.forEach(c => { cuerpo += tablaWord(++n, `V de Aiken por ítem: ${c.nombre.toLowerCase()} (${c.nJueces} jueces)`, CABECERA_CRITERIO, filasCriterio(c), notaCriterio(cfg)); });
    if (res.criterios.length > 1) {
        const cab = ['Ítem', ...cfg.criterios, 'V promedio', 'Decisión'];
        const filas = res.porItem.map(x => [x.etiqueta, ...x.porCriterio.map(f2), f2(x.V), ROTULO_DECISION[x.decision]]);
        cuerpo += tablaWord(++n, 'Resumen de la validez de contenido por ítem', cab, filas, 'Decisión global: la más exigente de los criterios (un ítem es válido solo si lo es en todos).');
    }
    cuerpo += `<p style="margin:18pt 0 8pt;line-height:200%;text-align:center;"><b>Referencias</b></p>` +
        referencias(cfg.v0).map(r => `<p style="margin:0;line-height:200%;padding-left:0.5in;text-indent:-0.5in;">${r}</p>`).join('');
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><title>Validez de contenido (V de Aiken)</title>
        <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
        <style>body{font-family:"Times New Roman",serif;font-size:12pt;}</style></head><body>${cuerpo}</body></html>`;
}

// CSV de resultados (punto y coma, para Excel en español)
export function csvResultados(res) {
    const lineas = ['Criterio;Ítem;n;M;V;IC_inferior;IC_superior;p;Decisión'];
    const dec = (x, d) => x.toFixed(d).replace('.', ',');   // Excel en español: separador «;» y decimales con coma
    const seguro = s => /^[=+\-@]/.test(String(s)) ? `'${s}` : s;   // un texto que empiece por = + - @ no se ejecuta como fórmula
    res.criterios.forEach(c => c.items.forEach(x => lineas.push([seguro(c.nombre), seguro(x.etiqueta), x.n, dec(x.media, 4), dec(x.V, 4), dec(x.inferior, 4), dec(x.superior, 4), x.p.toExponential(4).replace('.', ','), ROTULO_DECISION[x.decision]]
        .map(v => { const s = String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';'))));
    return lineas.join('\r\n');
}
