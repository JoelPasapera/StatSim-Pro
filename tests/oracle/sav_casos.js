// @ts-check
// tests/oracle/sav_casos.js — (2026.12.29) las bases que escribe core/data/sav/escritor.js en las pruebas del puente SPSS:
// las comparten el generador del fixture (sav_oraculo.mjs, que las hace leer a ReadStat) y la prueba de Node
// (tests/integration/sav.test.js, que comprueba que el escritor sigue produciendo exactamente esos bytes). Son
// deterministas: un azar con semilla y fechas fijas.

/** Azar reproducible (mulberry32). @param {number} semilla */
function azarCon(semilla) {
    let s = semilla | 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Las bases de prueba del escritor: una completa (todo lo que el escritor sabe escribir: etiquetas de variable y de valor,
 * niveles de medida, fechas, cadenas cortas y largas con etiquetas, UTF-8 con emoji, nombres que SPSS no admite y hay que
 * ajustar, recortes de etiquetas y de cadenas), una sin comprimir, una en orden de bytes «big endian» y una sin casos.
 * @returns {Array<{ nombre: string, base: any, opciones?: { comprimir?: boolean, granEndian?: boolean } }>}
 */
export function casosEscritor() {
    const azar = azarCon(20261016);
    const n = 257;
    const likert = Array.from({ length: n }, () => (azar() < 0.05 ? NaN : 1 + Math.floor(azar() * 5)));
    const continua = Array.from({ length: n }, () => (azar() < 0.03 ? NaN : (azar() - 0.5) * 2000.123456789));
    const grande = Array.from({ length: n }, (_, i) => (i % 7 === 0 ? 1e12 + i : -3.5 - i));
    const enteros = Array.from({ length: n }, (_, i) => i - 120);      // cruza el rango comprimible (−99…151)
    const dias = Array.from({ length: n }, (_, i) => (i % 11 === 0 ? NaN : -4000 + i * 37));   // 1959…1996
    const frases = ['', 'Sí', 'año', 'niño pequeño', 'Ñandú ✓ 🎉', 'texto que pasa de los ocho bytes', 'x'.repeat(300)];
    const textos = Array.from({ length: n }, (_, i) => frases[i % frases.length]);
    const categorias = Array.from({ length: n }, (_, i) => ['A', 'BB', 'Cé'][i % 3]);
    const anclas = { 1: 'Nunca', 2: 'Casi nunca', 3: 'A veces', 4: 'Casi siempre', 5: 'Siempre' };
    return [
        {
            nombre: 'completo',
            base: {
                etiquetaArchivo: 'Base de prueba — StatSim Pro (ñ, tildes)',
                documentos: ['Generado por la prueba del escritor', 'Segunda línea con tildes: acción, pingüino'],
                fecha: new Date(2026, 9, 16, 1, 2, 3),
                variables: [
                    { nombre: 'ID', valores: Array.from({ length: n }, (_, i) => i + 1), medida: 'nominal', etiqueta: 'Identificador' },
                    { nombre: 'Item_Likert_1', valores: likert, medida: 'ordinal', etiqueta: 'Ítem 1 — Me siento tranquilo', etiquetasValor: anclas },
                    { nombre: 'Item_Likert_2', valores: likert.map(x => (Number.isNaN(x) ? x : 6 - x)), medida: 'ordinal', etiquetasValor: anclas },
                    { nombre: 'Item_Likert_3', valores: likert.map((x, i) => (Number.isNaN(x) ? x : 1 + ((x + i) % 5))), medida: 'ordinal', etiquetasValor: anclas },
                    { nombre: 'Continua', valores: continua, etiqueta: 'Una continua con decimales' },
                    { nombre: 'Grande', valores: grande, decimales: 1 },
                    { nombre: 'Enteros', valores: enteros },
                    { nombre: 'FechaNacimiento', valores: dias, fecha: true, etiqueta: 'Fecha de nacimiento' },
                    { nombre: 'Comentario', tipo: 'texto', valores: textos, etiqueta: 'Comentario libre' },
                    { nombre: 'Grupo', tipo: 'texto', valores: categorias, etiquetasValor: [['A', 'Grupo A'], ['BB', 'Grupo B'], ['Cé', 'Grupo C con tilde']] },
                    { nombre: 'GrupoLargo', tipo: 'texto', valores: categorias.map(c => `${c}-categoría-larga`), etiquetasValor: [['A-categoría-larga', 'Etiqueta de una cadena de más de 8 bytes']] },
                    { nombre: 'Sexo', valores: Array.from({ length: n }, (_, i) => i % 2), etiquetasValor: [[0, 'Femenino'], [1, 'Masculino']], etiqueta: 'Sexo (0 = Femenino, 1 = Masculino)' },
                    { nombre: 'Nivel socioeconómico', valores: Array.from({ length: n }, (_, i) => 1 + (i % 3)), etiquetasValor: { 1: 'Bajo', 2: 'Medio', 3: 'Alto' }, medida: 'ordinal' },
                    { nombre: 'nivel_socioeconómico', valores: Array.from({ length: n }, () => 1) },
                    { nombre: 'AND', valores: Array.from({ length: n }, () => 2) },
                    { nombre: '1ra.medición.', valores: Array.from({ length: n }, () => 3.25) },
                    { nombre: 'Una_variable_con_un_nombre_larguísimo_que_pasa_de_los_sesenta_y_cuatro_bytes_permitidos', valores: Array.from({ length: n }, () => 7) },
                    { nombre: 'Etiqueta_larga', valores: Array.from({ length: n }, () => 1), etiqueta: 'Á'.repeat(200), etiquetasValor: [[1, 'é'.repeat(100)]] },
                    { nombre: 'Un_decimal', valores: Array.from({ length: n }, (_, i) => (i % 9) / 2 - 1) }   // −1, −0.5 … 3: formato F con un decimal
                ]
            }
        },
        { nombre: 'sin_comprimir', base: { fecha: new Date(2026, 0, 2, 3, 4, 5), variables: [{ nombre: 'x', valores: continua }, { nombre: 'y', tipo: 'texto', valores: textos }] }, opciones: { comprimir: false } },
        { nombre: 'gran_endian', base: { fecha: new Date(2026, 0, 2, 3, 4, 5), variables: [{ nombre: 'x', valores: continua, etiquetasValor: { 1: 'uno' } }, { nombre: 'y', tipo: 'texto', valores: textos }] }, opciones: { granEndian: true } },
        { nombre: 'vacia', base: { n: 0, fecha: new Date(2026, 0, 2, 3, 4, 5), variables: [{ nombre: 'x', valores: [] }, { nombre: 'y', tipo: 'texto', valores: [] }] } }
    ];
}

/**
 * Los bytes de un .sav sin la fecha y la hora de creación de la cabecera (bytes 92 a 108: «dd mmm yy» y «hh:mm:ss», en la
 * hora local de quien lo escribe), para comparar archivos escritos en máquinas con otra zona horaria.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array}
 */
export function sinMarcaDeTiempo(bytes) {
    const copia = bytes.slice();
    if (copia.length >= 109) copia.fill(0x20, 92, 109);
    return copia;
}
