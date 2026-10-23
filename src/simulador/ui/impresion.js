// @ts-check
// simulador/ui/impresion.js — (2027.01.01) la verificación de la base simulada en papel o en PDF: el botón «Imprimir o
// guardar en PDF» del informe «pedido vs. obtenido» y el encabezado de lo impreso (n, columnas, semilla, versión y fecha).
// Qué se imprime lo deciden los estilos de impresión (assets/css/componentes/impresion.css): los avisos de la generación,
// el diagnóstico de correlaciones, el informe y el resumen de la base, sin la configuración.
import { VERSION } from '../../version.js';
import { fechaDeImpresion, imprimir, registrarEncabezadoImpresion } from '../../shared/impresion.js';

/** @returns {import('../../shared/impresion.js').EncabezadoImpresion} */
function encabezado() {
    const generador = /** @type {any} */ (window).generadorDatos;
    const base = generador && generador.datosGenerados;
    const semilla = generador && generador.configuracion ? generador.configuracion.semilla : null;
    const conSemilla = semilla !== null && semilla !== undefined && semilla !== '';
    return {
        titulo: 'Verificación de la base simulada',
        lineas: [
            base ? `Base: ${base.n} casos y ${base.columnas.length} columnas · ${conSemilla ? `semilla ${semilla} (la misma configuración y semilla dan la misma base)` : 'sin semilla fija'}` : 'Sin base generada',
            `StatSim Pro ${VERSION} · ${fechaDeImpresion()}`,
        ],
    };
}

/** El botón y el encabezado (montarInterfazSimulador lo llama una vez). */
export function montarImpresionSimulador() {
    registrarEncabezadoImpresion('simulador', encabezado);
    const boton = document.getElementById('btnImprimirSimulador');
    if (boton) boton.addEventListener('click', imprimir);
}
