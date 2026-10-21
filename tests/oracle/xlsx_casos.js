// @ts-check
// tests/oracle/xlsx_casos.js — (2026.12.31) los libros que escribe core/data/xlsx/escritor.js en las pruebas del puente
// con Excel: los comparten el generador del fixture (xlsx_escribir.mjs, cuyos libros lee openpyxl en xlsx_oraculo.py) y la
// prueba de Node (tests/integration/xlsx.test.js, que comprueba que el escritor sigue escribiendo las mismas partes y que
// el lector propio lee de ellas lo mismo que openpyxl). Son deterministas: datos fijos, una semilla y una fecha fija (en
// la hora local, como la escribe el informe: así el caso no depende de la zona horaria de quien lo ejecuta).

import { createHash } from 'node:crypto';
import { extraerZip, listarZip } from '../../src/core/data/zip/lector.js';
import { escribirXlsx } from '../../src/core/data/xlsx/escritor.js';
import { diasASerie } from '../../src/core/data/xlsx/fechas.js';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

/** La fecha de creación de todos los casos. */
export const FECHA_CASOS = new Date(2026, 9, 20, 9, 30, 0);

/**
 * Un generador del Simulador con una configuración pequeña y semilla fija: ítems, una escala con dos dimensiones,
 * sociodemográficas binaria, ordinal y con fecha de nacimiento, y un desenlace binario.
 * @returns {any}
 */
export function generadorDePrueba() {
    const g = /** @type {any} */ (new GeneradorDatos());
    const dim = (/** @type {string} */ nombre, /** @type {string} */ corto) => ({ nombre, nombreCorto: corto, prueba: 'Autoestima', tipo: 'dimension', numItems: 4, media: 12, desviacion: 3, minimo: 1, maximo: 5, alfa: 0.8, distribucion: 'normal', invertidos: 0 });
    const socio = (/** @type {string} */ categoria, /** @type {string} */ corta, /** @type {string} */ distribucion, /** @type {object} */ extra) => ({ categoria, categoriaCorta: corta, distribucion, promedio: 0, desviacion: 1, minimo: null, maximo: null, decimales: 0, niveles: null, ordinal: false, fechaNacimiento: null, dependeDe: '', fuerza: 0.4, ...extra });
    g.configuracion = {
        tamanoMuestra: 40, semilla: 31, generarPercentiles: false, correlacionesExactas: false, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve',
        variablesPorTest: { Autoestima: { variable: 'Autoestima', rIntra: 0.4 } }, pruebas: [dim('Autoestima social', 'AS'), dim('Autoestima académica', 'AA')],
        sociodemograficos: [
            socio('Sexo', 'S', 'binaria', { promedio: 0.45, niveles: [{ codigo: 0, etiqueta: 'Femenino', proporcion: 0.55 }, { codigo: 1, etiqueta: 'Masculino', proporcion: 0.45 }] }),
            socio('Grado', 'G', 'categorica', { minimo: 1, maximo: 3, ordinal: true, niveles: [{ codigo: 1, etiqueta: 'Primero', proporcion: 0.4 }, { codigo: 2, etiqueta: 'Segundo', proporcion: 0.35 }, { codigo: 3, etiqueta: 'Tercero', proporcion: 0.25 }] }),
            socio('Edad', 'E', 'normal', { promedio: 20, desviacion: 2, minimo: 16, maximo: 30, fechaNacimiento: '2026-06-30' })
        ],
        correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], niveles: [], estructuras: [], cortes: [], concordancias: [], realismo: {},
        desenlaces: [{ nombre: 'Deserción', tipo: 'binario', prevalencia: 0.3, media: null, niveles: null, etiquetas: ['No', 'Sí'], predictores: [{ variable: 'Autoestima social', efecto: 1.2 }] }]
    };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g;
}

/**
 * Los casos: «tipos» (todo lo que el escritor sabe escribir: números con decimales, enteros grandes, −0, NaN e ±Infinity
 * vacíos, textos con escapes, caracteres de control, emoji, suplentes sueltos, espacios que conservar y uno de más de 32 767
 * caracteres, verdadero y falso, fechas en los bordes del sistema de 1900, filas en negrita, nombres de hoja que Excel no
 * admite y uno repetido) y «simulador» (la descarga de Excel del Simulador: Datos, Diccionario e Informe).
 * @returns {Array<{ nombre: string, determinista: boolean, escribir: () => Promise<{ trozos: Uint8Array[], avisos: string[] }> }>}
 */
export function casosEscritor() {
    const textos = ['Ñandú ✓ 🎉', '  con espacios  ', 'retorno\r\ny salto', 'tab\tdentro', 'control \u0001\u001F fin', 'literal _x000D_ y _x005F_',
        'menor < y & mayor > "comillas"', 'suelto \uD800 aquí', '=SUMA(A1:A2)', 'x'.repeat(33000)];
    const numeros = [0.1 + 0.2, -0, 1e21, -1e-7, 123456789012345, NaN, Infinity, 3, -2.5, 1.7976931348623157e308];
    const fechas = [1, 59, 61, diasASerie(0), diasASerie(19723), 2958465, null, diasASerie(-25567), diasASerie(-25509), 45000];
    return [
        {
            nombre: 'tipos', determinista: true,
            escribir: () => escribirXlsx([
                {
                    nombre: 'Datos', encabezado: ['Número', 'Texto', 'Lógico', 'Fecha', 'Vacía'], fechas: [false, false, false, true, false],
                    filas: numeros.map((x, i) => [x, textos[i], i % 3 === 0 ? true : i % 3 === 1 ? false : null, fechas[i], null])
                },
                { nombre: 'Sin: encabezado / [y negrita]', filas: [['título'], [], ['a', 1, true], ['b', 2, false]], negrita: [0] },
                { nombre: 'datos', filas: [[1]] },
                { nombre: 'Vacía', filas: [] }
            ], { fecha: FECHA_CASOS, comprimir: false, titulo: 'Casos del escritor' })
        },
        {
            nombre: 'simulador', determinista: false,
            escribir: async () => {
                const g = generadorDePrueba();
                const base = g.generarBaseDatos();
                const informe = g.informePedidoObtenido(base) || [];
                return g.exportarXlsx({ fecha: FECHA_CASOS, comprimir: false, informe });
            }
        }
    ];
}

/**
 * El SHA-256 del contenido de cada parte de un libro, por su nombre; sin docProps/core.xml, que lleva la fecha de creación
 * en UTC (cambia con la zona horaria de quien escribe el libro).
 * @param {Uint8Array} bytes
 * @returns {Promise<Record<string, string>>}
 */
export async function huellasDePartes(bytes) {
    /** @type {Record<string, string>} */
    const partes = {};
    for (const e of listarZip(bytes)) {
        if (e.nombre === 'docProps/core.xml') continue;
        partes[e.nombre] = createHash('sha256').update(await extraerZip(bytes, e)).digest('hex');
    }
    return partes;
}
