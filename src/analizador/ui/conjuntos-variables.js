// @ts-check
// analizador/ui/conjuntos-variables.js — (2027.01.18) el desplegable «qué variables se revisan» de las tarjetas que trabajan
// con un conjunto de variables (la depuración y los datos perdidos): las escalas que detecta la fiabilidad (primero las
// totales, luego las de más ítems), todas las variables numéricas salvo los puntajes (General_, Dimension_ y Total_: son la
// suma de los ítems, en otra escala, y repetirían su información) y una lista propia escrita a mano; y la elección que
// resulta, con su descripción para la redacción.
import { Fiabilidad } from '../fiabilidad.js';
import { escaparHTML } from '../../shared/html.js';
import { columnasCuantitativas } from '../motor/columnas.js';

/** @typedef {{ etiqueta: string, items: string[] }} Escala */

/** Los puntajes que calcula el Simulador (o que siguen su convención): no son ítems. */
const PUNTAJE = /^(General|Dimension|Total)_/i;

/**
 * Las escalas detectadas (con al menos `minimo` ítems) y las variables numéricas de una base.
 * @param {Record<string, unknown>[]} filas
 * @param {number} [minimo]
 * @returns {{ escalas: Escala[], numericas: string[] }}
 */
export function conjuntosDe(filas, minimo = 2) {
    if (!filas.length) return { escalas: [], numericas: [] };
    /** @type {{ etiqueta: string, items: string[], particion?: boolean }[]} */ const grupos = Fiabilidad.detectarGrupos(filas);
    const escalas = grupos.filter(g => g.items.length >= minimo)
        .sort((a, b) => (b.particion ? 1 : 0) - (a.particion ? 1 : 0) || b.items.length - a.items.length)
        .map(g => ({ etiqueta: g.etiqueta, items: g.items }));
    return { escalas, numericas: columnasCuantitativas(filas).filter(c => c !== 'ID' && !PUNTAJE.test(c)) };
}

/**
 * Las opciones del desplegable: las escalas, «todas» y «propia».
 * @param {{ escalas: Escala[], numericas: string[] }} c
 */
export function opcionesHTML(c) {
    return c.escalas.map(g => `<option value="${escaparHTML(g.etiqueta)}">${escaparHTML(g.etiqueta)} · ${g.items.length} ítems</option>`).join('')
        + (c.numericas.length ? `<option value="todas">Todas las variables numéricas, sin los puntajes · ${c.numericas.length}</option>` : '') + '<option value="propia">Lista propia de variables…</option>';
}

/**
 * Las variables de una elección del desplegable.
 * @param {string} valor el del desplegable
 * @param {string} textoPropio lo escrito en la lista propia («P1, P2, P3»)
 * @param {Record<string, unknown>[]} filas
 * @param {{ escalas: Escala[], numericas: string[] }} c
 * @returns {{ items: string[], descripcion: string } | null} null si no hay elección; lanza si la lista propia nombra una
 *   columna que no está en la base
 */
export function variablesDe(valor, textoPropio, filas, c) {
    if (valor === 'propia') {
        const columnas = new Set(filas.length ? Object.keys(/** @type {Record<string, unknown>} */ (filas[0])) : []);
        const items = [...new Set(String(textoPropio).split(/[,;\s]+/).map(s => s.trim()).filter(Boolean))];
        const ausentes = items.filter(x => !columnas.has(x));
        if (ausentes.length) throw new Error(`No están en la base: ${ausentes.join(', ')}.`);
        return { items, descripcion: 'las variables elegidas' };
    }
    if (valor === 'todas') return { items: c.numericas, descripcion: 'todas las variables numéricas, sin los puntajes' };
    const g = c.escalas.find(x => x.etiqueta === valor);
    return g ? { items: g.items, descripcion: `los ítems de ${g.etiqueta}` } : null;
}
