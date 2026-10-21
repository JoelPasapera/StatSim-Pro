// @ts-check
// simulador/dominio/exportacion-spss.js — la base generada como archivo de SPSS (.sav): cada columna con su etiqueta de
// variable (la del diccionario, obtenerEtiquetas), sus etiquetas de valor (las categorías de la base), su nivel de medida
// (nominal, ordinal o escala, según lo que es en la configuración) y las fechas como fechas. (2026.12.29) El archivo lo
// escribe core/data/sav/escritor.js; abre directamente en SPSS (16 o posterior), PSPP, JASP o jamovi, sin pasos manuales.

import { escribirSav } from '../../core/data/sav/escritor.js';
import { VERSION } from '../../version.js';
import { descargarBlob } from '../../shared/descargas.js';

/**
 * @typedef {'nominal' | 'ordinal' | 'escala'} MedidaSav
 * @typedef {{ nombre: string, entera: boolean, datos: Float32Array | Float64Array, etiquetas?: Record<string, string> | null, formato?: string | null }} ColumnaBase
 * @typedef {{ n: number, columnas: ColumnaBase[] }} BaseGenerada
 * @typedef {{
 *   configuracion: any, datosGenerados: BaseGenerada | null,
 *   obtenerEtiquetas: () => Record<string, string>,
 *   _itemsDe: (p: any) => string[], columnaDeEscala: (p: any) => string, _esDicotomica: (p: any) => boolean,
 *   _siglaDeVariable: (v: string) => string, _columnasDeEstado: (h: any) => string[], _columnaCategoricaDe: (v: string) => string | null,
 *   _controlesEsperados: () => Array<{ columna: string }>
 * }} GeneradorConBase
 */

/**
 * La firma de los archivos del Simulador en la cabecera del .sav: el Analizador la reconoce (motor/datos-spss.js) y lee como
 * categoría toda numérica con etiquetas de valor, porque aquí los ítems no las llevan.
 */
export const PRODUCTO_SIMULADOR = 'StatSim Pro - Simulador';

export const metodosExportacionSpss = {
    /**
     * El nivel de medida de cada columna, según lo que es en la configuración: los ítems tipo Likert, ordinales (los
     * dicotómicos, nominales); los totales, percentiles, conteos y continuas, escala; las categóricas, nominales, salvo las
     * declaradas ordinales, los niveles por puntos de corte y los desenlaces ordinales. Lo que no aparece aquí: nominal si
     * tiene etiquetas de valor y escala si no (lo decide el escritor).
     * @this {GeneradorConBase}
     * @returns {Record<string, MedidaSav>}
     */
    nivelesDeMedida() {
        const cfg = this.configuracion || {};
        /** @type {Record<string, MedidaSav>} */
        const medida = { ID: 'nominal' };
        (cfg.pruebas || []).forEach((/** @type {any} */ p) => {
            // (2026.12.29, revisión) ordinales solo los ítems con mínimo y máximo (tipo Likert): los de una escala continua
            // (11.65, 12.30…) son de escala; como ordinales, jamovi y JASP los abrían como factores de cientos de niveles
            const likert = p.minimo !== null && p.minimo !== undefined && p.maximo !== null && p.maximo !== undefined;
            if (p.tipo !== 'general') this._itemsDe(p).forEach(col => { medida[col] = this._esDicotomica(p) ? 'nominal' : (likert ? 'ordinal' : 'escala'); });
            medida[this.columnaDeEscala(p)] = 'escala';
        });
        (cfg.sociodemograficos || []).forEach((/** @type {any} */ s) => {
            const d = s.distribucion || 'normal';
            medida[s.categoria] = s.ordinal ? 'ordinal' : (d === 'binaria' || d === 'categorica' ? 'nominal' : 'escala');
        });
        (cfg.desenlaces || []).forEach((/** @type {any} */ d) => { medida[d.nombre] = d.tipo === 'ordinal' ? 'ordinal' : (d.tipo === 'binario' ? 'nominal' : 'escala'); });
        (cfg.cortes || []).forEach((/** @type {any} */ c) => { medida[`Nivel_${this._siglaDeVariable(c.variable)}`] = 'ordinal'; });
        (cfg.histeresis || []).forEach((/** @type {any} */ h) => this._columnasDeEstado(h).forEach(c => { medida[c] = 'nominal'; }));
        (cfg.concordancias || []).forEach((/** @type {any} */ c) => {
            if (c.tipo === 'informante') return;
            const sigla = this._siglaDeVariable(c.variable);
            // los jueces categóricos, como la variable que juzgan; los de puntuación, escala
            const juzgada = this._columnaCategoricaDe(c.variable);
            const comoJuzgada = c.tipo === 'jueces' ? ((juzgada && medida[juzgada]) || 'nominal') : 'escala';
            for (let j = 1; j <= (c.jueces || 2); j++) medida[`Juez${j}_${sigla}`] = comoJuzgada;
        });
        medida.Respuesta_descuidada = 'nominal';
        medida.Estilo_respuesta = 'nominal';
        medida.Tiempo_respuesta_seg = 'escala';
        this._controlesEsperados().forEach(c => { medida[c.columna] = 'ordinal'; });
        (cfg.gruposPruebas || []).forEach((/** @type {any} */ g) => { if (g.escalas && g.escalas.length >= 2) { medida[`General_${g.sigla}`] = 'escala'; medida[`PC_${g.sigla}`] = 'escala'; } });
        return medida;
    },

    /**
     * La base generada como archivo .sav.
     * @this {GeneradorConBase & { nivelesDeMedida: () => Record<string, MedidaSav> }}
     * @param {{ fecha?: Date }} [opciones] la fecha de creación (por omisión, ahora; las pruebas la fijan)
     * @returns {{ bytes: Uint8Array, avisos: string[] }}
     */
    exportarSav(opciones = {}) {
        const base = this.datosGenerados;
        if (!base || !base.n) throw new Error('No hay datos generados para exportar');
        const etiquetas = this.obtenerEtiquetas();
        const medidas = this.nivelesDeMedida();
        const fecha = opciones.fecha instanceof Date ? opciones.fecha : new Date();
        const cfg = this.configuracion || {};
        const variables = base.columnas.map(c => ({
            nombre: c.nombre,
            etiqueta: etiquetas[c.nombre] || '',
            valores: c.datos,
            fecha: c.formato === 'fecha',
            decimales: c.entera ? 0 : undefined,
            medida: medidas[c.nombre],
            etiquetasValor: c.etiquetas || undefined
        }));
        const dos = (/** @type {number} */ x) => String(x).padStart(2, '0');
        const cuando = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())} ${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`;
        const { bytes, avisos } = escribirSav({
            n: base.n,
            variables,
            etiquetaArchivo: `StatSim Pro — base simulada (n = ${base.n})`,
            documentos: [
                `Base simulada con StatSim Pro ${VERSION} el ${cuando}.`,
                cfg.semilla !== null && cfg.semilla !== undefined && cfg.semilla !== '' ? `Semilla: ${cfg.semilla} (la misma configuración y semilla reproducen la base).` : 'Sin semilla fija: otra generación da otra base.'
            ],
            fecha
        }, { producto: PRODUCTO_SIMULADOR });
        return { bytes, avisos };
    },

    /**
     * Descarga la base como .sav. Devuelve los avisos del escritor (p. ej., nombres que SPSS no admite y se ajustaron).
     * @this {{ exportarSav: () => { bytes: Uint8Array, avisos: string[] } }}
     * @param {string} [nombreArchivo]
     * @returns {string[]}
     */
    descargarSav(nombreArchivo = 'base_datos_simulada.sav') {
        const { bytes, avisos } = this.exportarSav();
        descargarBlob(new Blob([/** @type {BlobPart} */ (/** @type {unknown} */ (bytes))], { type: 'application/x-spss-sav' }), nombreArchivo);
        return avisos;
    }
};
