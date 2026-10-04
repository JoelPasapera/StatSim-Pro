// analizador/relaciones/cribado-forma-ui.js — presentación del cribado de forma (HTML sin estado): la columna «Forma» de
// la criba, los avisos del resultado principal y de los objetivos específicos, y las letras y la nota de la matriz del
// Word. El botón «Diagnosticar» solo lleva el par en atributos de datos: lo atiende la tarjeta 7 (diagnostico-forma-ui).
import { claveParForma } from './cribado-forma.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fp = p => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.'));
const resultadoDe = (formas, a, b) => (formas && formas.resultados ? formas.resultados.get(claveParForma(a, b)) || null : null);
const boton = r => `<button type="button" class="btn btn-outline" style="padding:0.1rem 0.5rem;font-size:0.8em;" data-diagnosticar-x="${esc(r.a)}" data-diagnosticar-y="${esc(r.b)}" title="Abrir el diagnóstico completo de este par en la tarjeta 7">Diagnosticar</button>`;
const NOMBRE_TIPO_FORMA = { recta: 'Recta', 'curva-monotona': '∿ Curva monótona', 'no-monotona': 'Cambia de sentido', 'no-evaluable': 'No evaluable' };
// símbolo del giro confirmado: ∪ si es un mínimo, ⋂ si es un máximo
const simboloGiro = r => (r.giro && r.giro.tipo === 'mínimo' ? '∪ ' : '⋂ ');

// celda de la columna «Forma» de la criba
export function marcaForma(formas, a, b) {
    const r = resultadoDe(formas, a, b);
    if (!r) return '—';
    if (!r.evaluable) return `<span class="help-text" title="${esc(r.motivo || '')}">No evaluable</span>`;
    const p = `<span class="help-text">(p Holm ${r.pAjustada < 0.001 ? '< .001' : `= ${fp(r.pAjustada)}`})</span>`;
    return r.tipo === 'recta' ? `Recta ${p}` : `<strong>${r.tipo === 'no-monotona' ? simboloGiro(r) : ''}${NOMBRE_TIPO_FORMA[r.tipo]}</strong> ${p} ${boton(r)}`;
}
// aviso para el resultado principal o un objetivo específico cuya forma no es lineal ('' si es recta)
export function avisoForma(formas, a, b, etA, etB) {
    const r = resultadoDe(formas, a, b);
    if (!r || !r.noLineal) return '';
    const pTxt = r.pAjustada < 0.001 ? 'p < .001' : `p = ${fp(r.pAjustada)}`;
    const texto = r.tipo === 'no-monotona'
        ? `La relación entre ${esc(etA)} y ${esc(etB)} <strong>cambia de sentido</strong> (cribado de forma, ${pTxt} con Holm): ni r ni ρ la describen bien; revisa su forma antes de interpretarla.`
        : `La relación entre ${esc(etA)} y ${esc(etB)} es <strong>curva pero monótona</strong> (cribado de forma, ${pTxt} con Holm): la ρ de Spearman la describe mejor que r.`;
    return `<div class="orden-guia" role="note" style="margin:0.6rem 0 0;"><span class="orden-guia-titulo">Forma de la relación:</span><span class="orden-nota">${texto} ${boton(r)}</span></div>`;
}
export function mostrarAvisoForma(idContenedor, formas, a, b, etA, etB) {
    const c = typeof document !== 'undefined' ? document.getElementById(idContenedor) : null, html = avisoForma(formas, a, b, etA, etB);
    if (!c || !html) return false;
    const div = document.createElement('div'); div.className = 'aviso-forma'; div.innerHTML = html; c.appendChild(div);
    return true;
}
// párrafo explicativo de la columna «Forma» de la criba
export const explicacionCribado = formas => (formas && formas.m ? ` La columna <strong>Forma</strong> marca los pares cuya relación no es lineal: se contrasta si una curva cúbica mejora a la recta (RESET robusta de Ramsey, 1969, con errores típicos HC3 y la p calibrada por bootstrap salvaje) y se corrige por Holm entre los ${formas.m} pares del análisis; un giro se confirma con la prueba de las dos rectas (Simonsohn, 2018). Es un cribado: «Diagnosticar» abre el análisis completo del par.` : '');

// matriz del Word: letra en superíndice de cada celda y nota de las letras usadas
export function sufijoMatriz(formas, a, b) {
    const r = resultadoDe(formas, a, b);
    return !r || !r.noLineal ? '' : r.tipo === 'no-monotona' ? 'ᵇ' : 'ᵃ';
}
export function notaMatriz(usadas) {
    const partes = [];
    if (usadas.has('ᵃ')) partes.push('ᵃ Relación curva pero monótona según el cribado de forma: la ρ de Spearman la describe mejor que r.');
    if (usadas.has('ᵇ')) partes.push('ᵇ Relación que cambia de sentido: ni r ni ρ la describen.');
    return partes.length ? ` ${partes.join(' ')} Cribado: RESET robusta (Ramsey, 1969) con errores típicos HC3 y p por bootstrap salvaje, corregida por Holm; los giros, confirmados con la prueba de las dos rectas (Simonsohn, 2018).` : '';
}
// frase para el apartado de objetivos específicos del Word
export function textoObjetivosForma(formas, seleccionados) {
    const marcados = (seleccionados || []).map(s => ({ s, r: resultadoDe(formas, s.columnaX, s.columnaY) })).filter(x => x.r && x.r.noLineal);
    if (!marcados.length) return '';
    const lista = marcados.map(({ s, r }) => `${s.etiquetaX || s.columnaX} y ${s.etiquetaY || s.columnaY} (${r.tipo === 'no-monotona' ? 'cambia de sentido' : 'curva monótona'})`);
    return `El cribado de forma señaló que ${marcados.length === 1 ? 'la relación entre' : 'las relaciones entre'} ${lista.join('; ')} no ${marcados.length === 1 ? 'es lineal' : 'son lineales'}; su coeficiente debe interpretarse con esa salvedad.`;
}
