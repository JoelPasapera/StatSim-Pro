// @ts-check
// analizador/ui/impresion.js — (2027.01.01) el Analizador en papel o en PDF: el botón «Imprimir o guardar en PDF» de los
// resultados y el encabezado de lo impreso (de qué datos, de dónde vienen, con qué versión y cuándo). Qué se imprime lo
// deciden los estilos de impresión (assets/css/componentes/impresion.css): los resultados, sin los controles.
import { VERSION } from '../../version.js';
import { fechaDeImpresion, imprimir, registrarEncabezadoImpresion } from '../../shared/impresion.js';
import { estadoDeLosDatos } from './carga.js';

/**
 * De dónde vienen los datos cargados, en palabras («generados en el Simulador», «del archivo «base.csv»»…).
 * @param {{ tipo?: string, archivo?: string, hoja?: string } | undefined} origen
 * @returns {string}
 */
export function origenEnPalabras(origen) {
    if (!origen) return '';
    if (origen.tipo === 'simulador') return 'generados en el Simulador';
    const archivo = origen.archivo ? `«${origen.archivo}»` : '';
    if (origen.tipo === 'xlsx') {
        const hoja = origen.hoja ? `de la hoja «${origen.hoja}» ` : '';
        return archivo ? `${hoja}del libro de Excel ${archivo}` : `${hoja}de un libro de Excel`.trim();
    }
    if (origen.tipo === 'sav') return archivo ? `del archivo de SPSS ${archivo}` : 'de un archivo de SPSS';
    return archivo ? `del archivo ${archivo}` : 'de un archivo CSV';
}

/** El valor escrito en un campo de la página, sin espacios a los lados. @param {string} id */
function campo(id) {
    const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
    return el && typeof el.value === 'string' ? el.value.trim() : '';
}

/** @returns {import('../../shared/impresion.js').EncabezadoImpresion} */
function encabezado() {
    const estado = estadoDeLosDatos();
    const variables = estado && estado.filas[0] ? Object.keys(estado.filas[0]).length : 0;
    return {
        titulo: 'Resultados del Analizador',
        lineas: [
            campo('tituloTesis'),
            [campo('unidadAnalisis'), campo('lugarContexto')].filter(Boolean).join(' · '),
            estado ? `Datos: ${estado.filas.length} casos y ${variables} variables, ${origenEnPalabras(estado.origen)}` : 'Sin datos cargados',
            `StatSim Pro ${VERSION} · ${fechaDeImpresion()}`,
        ],
    };
}

/** El botón y el encabezado (montarAnalizador lo llama una vez). */
export function montarImpresionAnalizador() {
    registrarEncabezadoImpresion('analizador', encabezado);
    const boton = document.getElementById('btnImprimirAnalizador');
    if (boton) boton.addEventListener('click', imprimir);
}
