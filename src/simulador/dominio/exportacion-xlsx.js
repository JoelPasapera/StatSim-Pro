// @ts-check
// simulador/dominio/exportacion-xlsx.js — (2026.12.31) la base generada como libro de Excel (.xlsx), con tres hojas:
// «Datos», la base como la del CSV (las categorías con su etiqueta, los perdidos como celdas vacías y las fechas como
// fechas de Excel); «Diccionario», cada variable con su etiqueta, su nivel de medida, su tipo y los códigos de sus
// categorías; e «Informe», con qué versión, cuándo y con qué semilla se generó y el informe «pedido vs. obtenido», si lo
// hay. Lo escribe core/data/xlsx/escritor.js; abre en Excel, LibreOffice, Google Sheets y Numbers, y el Analizador lo lee
// con sus etiquetas (analizador/motor/datos-xlsx.js).

import { escribirXlsx } from '../../core/data/xlsx/escritor.js';
import { diasASerie } from '../../core/data/xlsx/fechas.js';
import { BaseColumnar } from '../../core/data/base-columnar.js';
import { ENCABEZADO_DICCIONARIO, HOJAS_LIBRO } from '../../shared/diccionario-xlsx.js';
import { descargarBlob } from '../../shared/descargas.js';
import { VERSION } from '../../version.js';

/**
 * @typedef {import('./exportacion-spss.js').GeneradorConBase} GeneradorConBase
 * @typedef {import('./exportacion-spss.js').MedidaSav} MedidaSav
 * @typedef {import('./exportacion-spss.js').ColumnaBase} ColumnaBase
 * @typedef {{ tipo: string, variable: string, pedido: unknown, obtenido: unknown, ok: boolean | null, conImperfecciones?: unknown }} FilaInforme
 * @typedef {{ informe?: FilaInforme[], fecha?: Date, comprimir?: boolean }} OpcionesExportacionXlsx
 *   informe: las filas del informe «pedido vs. obtenido» de la última generación; fecha: la de creación (por omisión,
 *   ahora; las pruebas la fijan); comprimir: false, sin comprimir (las pruebas)
 */

/** El tipo MIME de un libro de Excel. */
export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** «2026-10-20 09:30», en la hora local. @param {Date} f */
function cuando(f) {
    const dos = (/** @type {number} */ x) => String(x).padStart(2, '0');
    return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())} ${dos(f.getHours())}:${dos(f.getMinutes())}`;
}

/** Los códigos y etiquetas de una categórica, en orden de código: «0 = Femenino; 1 = Masculino». @param {Record<string, string>} etiquetas */
function listaDeValores(etiquetas) {
    return Object.entries(etiquetas).sort((a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0])).map(([k, e]) => `${k} = ${e}`).join('; ');
}

/** Un valor del informe como celda: los números, números; lo demás, texto. @param {unknown} v */
const celdaDeInforme = v => (typeof v === 'number' ? v : v === null || v === undefined ? '' : String(v));

export const metodosExportacionXlsx = {
    /**
     * La base generada como libro de Excel.
     * @this {GeneradorConBase & { nivelesDeMedida: () => Record<string, MedidaSav> }}
     * @param {OpcionesExportacionXlsx} [opciones]
     * @returns {Promise<{ trozos: Uint8Array[], avisos: string[] }>}
     */
    async exportarXlsx(opciones = {}) {
        const base = this.datosGenerados;
        if (!base || !base.n) throw new Error('No hay datos generados para exportar');
        const fecha = opciones.fecha instanceof Date ? opciones.fecha : new Date();
        const etiquetas = this.obtenerEtiquetas();
        const medidas = this.nivelesDeMedida();
        const cfg = this.configuracion || {};
        const columnas = base.columnas;
        const presentar = (/** @type {ColumnaBase} */ c, /** @type {number} */ i) => {
            const v = c.datos[i];
            if (!(v === v)) return null;   // NaN: perdido
            if (c.etiquetas) { const e = c.etiquetas[/** @type {any} */ (v)]; if (e !== undefined) return e; }
            if (c.formato === 'fecha') { const s = diasASerie(v); return s === null ? BaseColumnar.diasAISO(v) : s; }
            return v;
        };
        /** @type {Array<Array<string | number>>} */
        const diccionario = columnas.map(c => [
            c.nombre,
            etiquetas[c.nombre] && etiquetas[c.nombre] !== c.nombre ? etiquetas[c.nombre] : '',
            medidas[c.nombre] || (c.etiquetas ? 'nominal' : 'escala'),
            c.formato === 'fecha' ? 'fecha' : c.etiquetas ? 'categoría (sus etiquetas, en Datos)' : c.entera ? 'número entero' : 'número',
            c.etiquetas ? listaDeValores(c.etiquetas) : ''
        ]);
        const semilla = cfg.semilla !== null && cfg.semilla !== undefined && cfg.semilla !== '' ? cfg.semilla : null;
        /** @type {Array<Array<string | number>>} */
        const informe = [
            ['StatSim Pro — base simulada'],
            ['Versión', VERSION],
            ['Generada', cuando(fecha)],
            ['Casos (n)', base.n],
            ['Variables', columnas.length],
            ['Semilla', semilla === null ? 'sin semilla fija: otra generación da otra base' : semilla]
        ];
        const negrita = [0];
        const filasInforme = opciones.informe || [];
        if (filasInforme.length) {
            informe.push([]);
            negrita.push(informe.length);
            informe.push(['Parámetro', 'Variable', 'Pedido', 'Obtenido', 'Estado', 'Con imperfecciones']);
            filasInforme.forEach(f => informe.push([
                celdaDeInforme(f.tipo), celdaDeInforme(f.variable), celdaDeInforme(f.pedido), celdaDeInforme(f.obtenido),
                f.ok === null ? 'informativa' : f.ok ? 'coincide' : 'se desvía', celdaDeInforme(f.conImperfecciones)
            ]));
        }
        return escribirXlsx([
            {
                nombre: HOJAS_LIBRO.DATOS,
                encabezado: columnas.map(c => c.nombre),
                fechas: columnas.map(c => c.formato === 'fecha'),
                filas: { n: base.n, fila: i => columnas.map(c => presentar(c, i)) }
            },
            { nombre: HOJAS_LIBRO.DICCIONARIO, encabezado: [...ENCABEZADO_DICCIONARIO], filas: diccionario, anchos: [24, 48, 16, 20, 60], ajustar: [false, true, false, false, true] },
            { nombre: HOJAS_LIBRO.INFORME, filas: informe, negrita, anchos: [22, 48, 22, 22, 12, 22], ajustar: [false, true, false, false, false, false] }
        ], { fecha, comprimir: opciones.comprimir, titulo: `StatSim Pro — base simulada (n = ${base.n})` });
    },

    /**
     * Descarga la base como libro de Excel. Devuelve los avisos del escritor (p. ej., textos recortados al máximo de una
     * celda).
     * @this {{ exportarXlsx: (o?: OpcionesExportacionXlsx) => Promise<{ trozos: Uint8Array[], avisos: string[] }> }}
     * @param {string} [nombreArchivo]
     * @param {OpcionesExportacionXlsx} [opciones]
     * @returns {Promise<string[]>}
     */
    async descargarXlsx(nombreArchivo = 'base_datos_simulada.xlsx', opciones = {}) {
        const { trozos, avisos } = await this.exportarXlsx(opciones);
        descargarBlob(new Blob(/** @type {BlobPart[]} */ (/** @type {unknown} */ (trozos)), { type: TIPO_XLSX }), nombreArchivo);
        return avisos;
    }
};
