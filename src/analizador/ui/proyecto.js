// @ts-check
// analizador/ui/proyecto.js — (2026.12.31) lo que el Analizador guarda en un proyecto (shared/proyecto.js; «Guardar
// proyecto», en Ayuda) y cómo lo restaura: los datos cargados, por columnas (motor/datos-proyecto.js, en JSON que conserva
// NaN, infinitos y −0), sus etiquetas de variable, su estructura de pruebas y de dónde vinieron (del Simulador, de un CSV,
// de un .sav o de un libro de Excel, con su hoja) y, desde la 2027.01.01, los códigos de sus categorías («0 = No, 1 = Sí»).
// Al abrirlo, el Analizador queda con esos datos, como tras cargarlos; los análisis se vuelven a ejecutar con «Analizar».

import { inscribirEnProyecto } from '../../shared/proyecto.js';
import { leerJsonAcotado } from '../../core/data/json-acotado.js';
import { TOPES_JSON_ETIQUETAS, codigosValidos, columnasAJson, datosDeJson, estructuraValida, etiquetasValidas, filasAColumnas } from '../motor/datos-proyecto.js';
import { sinMarcado } from '../../core/data/texto.js';
import { estadoDeLosDatos, restaurarDatos } from './carga.js';

/** @type {Record<string, string>} */
const ORIGENES = { simulador: 'del Simulador', csv: 'de un CSV', sav: 'de una base de SPSS', xlsx: 'de un libro de Excel' };

/** El texto UTF-8 de un archivo del proyecto. @param {Uint8Array | undefined} b */
const texto = b => (b ? new TextDecoder().decode(b) : null);

/** @returns {import('../../shared/proyecto.js').ParteCapturada | null} */
function capturar() {
    const estado = estadoDeLosDatos();
    if (!estado) return null;
    const porColumnas = filasAColumnas(estado.filas);
    const columnas = porColumnas.columnas;
    const origen = estado.origen || { tipo: 'csv' };
    return {
        archivos: {
            'datos.json': columnasAJson(porColumnas),
            // (revisión) los códigos, solo si el proyecto podrá volver a abrirlos (codigosValidos los acota): si no, sin ellos
            'etiquetas.json': JSON.stringify({ etiquetas: estado.etiquetas, estructura: estado.estructura, origen, codigosDeCategorias: estado.codigosDeCategorias && codigosValidos(estado.codigosDeCategorias) ? estado.codigosDeCategorias : {} })
        },
        resumen: `los datos del Analizador (${estado.filas.length} casos y ${columnas.length} variables, ${ORIGENES[origen.tipo] || 'de un archivo'}${origen.archivo ? ` «${origen.archivo}»` : ''})`
    };
}

/** @param {Map<string, Uint8Array>} archivos @returns {string} */
function restaurar(archivos) {
    const datos = texto(archivos.get('datos.json'));
    if (datos === null) throw new Error('faltan los datos («datos.json»)');
    // (2026.12.31, revisiones) uno desmedido, ni se lee (medido antes: sus celdas y su forma)
    const filas = datosDeJson(datos);
    if (!filas.length) throw new Error('los datos guardados no tienen casos');
    /** @type {any} */
    let meta = { etiquetas: {}, estructura: [], origen: { tipo: 'csv' } };
    const crudo = texto(archivos.get('etiquetas.json'));
    if (crudo !== null) {
        // (2026.12.31, cuarta revisión) también medido antes de leerlo: la estructura de 25 millones de dimensiones se
        // construía entera antes de que estructuraValida la rechazara
        const leido = leerJsonAcotado(crudo, TOPES_JSON_ETIQUETAS, { forma: 'las etiquetas guardadas («etiquetas.json») no tienen la forma esperada', invalido: 'las etiquetas guardadas («etiquetas.json») no son JSON válido' });
        meta = { ...meta, ...leido };
    }
    // (2026.12.31, revisión) con la forma que se guarda (un proyecto puede ser de otra persona: las etiquetas se pintan y
    // la estructura decide qué columnas forman cada dimensión)
    if (!etiquetasValidas(meta.etiquetas)) throw new Error('las etiquetas guardadas («etiquetas.json») no tienen la forma esperada');
    if (!estructuraValida(meta.estructura)) throw new Error('la estructura de pruebas guardada («etiquetas.json») no tiene la forma esperada');
    // (2027.01.01) los códigos de las categorías (los proyectos anteriores no los traen)
    if (meta.codigosDeCategorias !== undefined && !codigosValidos(meta.codigosDeCategorias)) throw new Error('los códigos de las categorías guardados («etiquetas.json») no tienen la forma esperada');
    const etiquetas = meta.etiquetas;
    /** @type {any[]} */
    const estructura = meta.estructura;
    // (2026.12.31, revisión) de dónde vinieron: uno de los orígenes conocidos, con el nombre del archivo y de la hoja como
    // textos sin marcado (un proyecto puede ser de otra persona); los «<» y «>» de las etiquetas y de la estructura los quita
    // restaurarDatos
    /** @type {any} */
    const o = meta.origen && typeof meta.origen === 'object' ? meta.origen : {};
    const nombre = (/** @type {unknown} */ v) => (typeof v === 'string' && v.length <= 500 ? sinMarcado(v) : undefined);
    /** @type {{ tipo: string, archivo?: string, hoja?: string }} */
    const origen = { tipo: Object.prototype.hasOwnProperty.call(ORIGENES, o.tipo) ? o.tipo : 'csv', archivo: nombre(o.archivo), hoja: nombre(o.hoja) };
    if (origen.archivo === undefined) delete origen.archivo;
    if (origen.hoja === undefined) delete origen.hoja;
    restaurarDatos({ filas, etiquetas, estructura, origen, codigosDeCategorias: meta.codigosDeCategorias || null });
    return `los datos del Analizador (${filas.length} casos)`;
}

inscribirEnProyecto({ seccion: 'analizador', titulo: 'el Analizador', orden: 20, capturar, restaurar });

export { capturar as capturarAnalizadorParaProyecto, restaurar as restaurarAnalizadorDeProyecto };
