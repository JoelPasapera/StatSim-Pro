// @ts-check
// tests/navegador/recetas/04-instrumental.mjs — caso 4: estudio instrumental (las propiedades psicométricas de una escala
// de procrastinación académica de 15 ítems y tres dimensiones): validez de contenido por jueces (V de Aiken), estructura
// interna (AFE y AFC por WLSMV), invarianza según el sexo, fiabilidad y validez convergente con la autoeficacia.
import { columna, comprobarCorrelacion, comprobarFiabilidad, comprobarSEM, guardarAnalisis, simularYDescargar, tablasDe, textoDe } from './comun.mjs';
import { AVISO, DESCRIPCIONES_COMUNES, afirmar, listaArchivos, num, pAPA, seccionAvisos, seccionReproducir, sinCero, tabla, tablaEscalas, tablaInforme } from './leeme.mjs';

export const MAESTRO = `###GENERAL###
Campo,Valor
TamanoMuestra,450
Semilla,5050

###TESTS###
Prueba,Variable,CorrDimensiones,Dimensiones
EPA,Procrastinación académica,0.45,"Postergación, Distracción, Desorganización"
EAA,Autoeficacia académica,,Autoeficacia académica

###PRUEBAS###
Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa,Invertidos,Dificultades
EPA,Postergación,5,normal,15,3,1,5,0.82,0,
EPA,Distracción,5,normal,14,2.9,1,5,0.8,0,
EPA,Desorganización,5,normal,14,2.8,1,5,0.78,0,
EAA,Autoeficacia académica,8,normal,26,4.5,1,5,0.86,0,

###SOCIODEMOGRAFICOS###
Categoria,Distribucion,Promedio,DE,Minimo,Maximo,Decimales,Opciones,DependeDe,Fuerza
Sexo,binaria,0.5,,,,0,"Mujer, Hombre",,
Edad,normal,20.8,2.2,17,30,0,,,

###CORRELACIONES###
VariableA,VariableB,Correlacion,Tipo,Nube,RAtipicos,CasosAtipicos
Procrastinación académica — EPA,Autoeficacia académica,-0.4,lineal,homogenea,,
`;

/** Los ítems de la escala, como los nombra el Simulador (la sigla de cada dimensión y su número). */
const ITEMS = ['P', 'D', 'DE'].flatMap(s => [1, 2, 3, 4, 5].map(k => s + k));
const CARPETA_AIKEN = 'analizador/1-validez-de-contenido';

/** Un generador reproducible (mulberry32) para las valoraciones de los jueces. @param {number} semilla */
function aleatorio(semilla) {
    let s = semilla >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Las valoraciones de 7 jueces (de 1 a 4) a los 15 ítems en un criterio, como un CSV con punto y coma (lo que se carga con
 * «Cargar CSV»). La mayoría de los ítems, bien valorados; los que se indican, con las probabilidades de su perfil.
 * @param {number} semilla
 * @param {Record<string, number[]>} perfiles ítem → probabilidades de 4, 3, 2 y 1
 */
function valoraciones(semilla, perfiles) {
    const u = aleatorio(semilla), base = [0.8, 0.18, 0.02, 0];
    const valor = (/** @type {number[]} */ p) => { const r = u(); let a = 0; for (let k = 0; k < 4; k++) { a += /** @type {number} */ (p[k]); if (r < a) return 4 - k; } return 1; };
    const filas = ITEMS.map(item => [item, ...Array.from({ length: 7 }, () => valor(perfiles[item] || base))].join(';'));
    return ['Ítem;' + Array.from({ length: 7 }, (_, j) => `Juez ${j + 1}`).join(';'), ...filas].join('\r\n') + '\r\n';
}

const CRITERIOS = [
    { nombre: 'Claridad', archivo: 'valoraciones_claridad.csv', texto: valoraciones(101, { D3: [0.1, 0.4, 0.4, 0.1] }) },
    { nombre: 'Coherencia', archivo: 'valoraciones_coherencia.csv', texto: valoraciones(202, { P2: [0.35, 0.45, 0.2, 0] }) },
    { nombre: 'Relevancia', archivo: 'valoraciones_relevancia.csv', texto: valoraciones(303, { DE4: [0.05, 0.3, 0.45, 0.2] }) },
];
const AIKEN = { minimo: 1, maximo: 4, confianza: 0.95, v0: 0.7 };
const AFE = { correlacion: 'auto', factores: 'paralelo', rotacion: 'oblimin', B: 200, semilla: 2026 };

/** El modelo de tres factores correlacionados (el del instrumento) en la sintaxis del SEM. */
const MODELO_TRES = `Postergacion =~ P1 + P2 + P3 + P4 + P5
Distraccion =~ D1 + D2 + D3 + D4 + D5
Desorganizacion =~ DE1 + DE2 + DE3 + DE4 + DE5`;
/** El rival: un solo factor. */
const MODELO_UNO = `Procrastinacion =~ ${ITEMS.join(' + ')}`;

/** Un número de un CSV con coma decimal (y exponente: «7,3242e-3»). @param {string} t */
const numCSV = t => Number(String(t).replace(',', '.'));

/** (2027.01.02) Los pasos del Analizador que hay que repetir tras abrir el proyecto (su README y la guía de la pestaña). */
const REPETIR = { desde: 2, hasta: 6, nota: 'la V de Aiken vuelve con sus valoraciones: en el paso 2 basta con «Calcular V de Aiken»' };

/** @type {import('../ejemplos.mjs').Receta} */
export default {
    carpeta: '04-instrumental',
    titulo: 'Propiedades psicométricas de una escala de procrastinación académica',
    diseno: 'Instrumental',
    resumen: 'V de Aiken con 7 jueces, AFE con correlaciones policóricas y análisis paralelo, AFC por WLSMV frente a un modelo rival, invarianza según el sexo, fiabilidad α y ω y validez convergente.',
    carpetas: { 'analizador/1-validez-de-contenido': 'La validez de contenido (V de Aiken)', 'analizador/2-afe': 'El análisis factorial exploratorio', 'analizador/3-invarianza': 'La invarianza según el sexo', 'analizador/4-capitulo': 'La fiabilidad, la validez convergente y el capítulo de Word' },
    repetir: REPETIR,
    async recorrer(caso) {
        const p = caso.pagina;
        const { columnas } = await simularYDescargar(caso, MAESTRO);
        const procrastinacion = columna(columnas, /^General_E$/), autoeficacia = columna(columnas, /^General_AA$/);
        for (const it of ITEMS) if (!columnas.includes(it)) throw new Error(`la base no tiene el ítem ${it}`);
        caso.cifras.columnas = { procrastinacion, autoeficacia };
        await caso.hacer(1, 'usarBaseDelSimulador');
        await caso.hacer(1, 'describirInvestigacion', { titulo: 'Propiedades psicométricas de la Escala de Procrastinación Académica en universitarios de Lima Metropolitana, 2026', unidad: 'estudiantes universitarios', lugar: 'Lima Metropolitana' });
        // 1) validez de contenido: las valoraciones de los jueces, un archivo por criterio
        for (const c of CRITERIOS) caso.guardar(`${CARPETA_AIKEN}/${c.archivo}`, c.texto);
        const aiken = await caso.hacer(2, 'calcularAiken', { ...AIKEN, criterios: CRITERIOS.map(c => ({ nombre: c.nombre, archivo: `${CARPETA_AIKEN}/${c.archivo}` })) });
        caso.guardar(`${CARPETA_AIKEN}/${aiken.csv.nombre}`, aiken.csv.bytes);
        caso.guardar(`${CARPETA_AIKEN}/${aiken.word.nombre}`, aiken.word.bytes);
        caso.pedir('aiken', { ...AIKEN, criterios: CRITERIOS.map(c => ({ nombre: c.nombre, archivo: `${CARPETA_AIKEN}/${c.archivo}` })), csv: `${CARPETA_AIKEN}/${aiken.csv.nombre}` });
        caso.cifras.aikenCSV = aiken.csv.bytes.toString('utf8');
        caso.cifras.aikenResumen = await textoDe(p, '#aikenResultados');
        // 2) estructura interna exploratoria: AFE de los 15 ítems
        const afe = await caso.hacer(3, 'calcularAFE', { conjunto: 'Escala total (EPA)', correlacion: AFE.correlacion, factores: AFE.factores, rotacion: AFE.rotacion, replicas: AFE.B, semilla: AFE.semilla });
        caso.guardar(`analizador/2-afe/${afe.csv.nombre}`, afe.csv.bytes);
        caso.guardar(`analizador/2-afe/${afe.word.nombre}`, afe.word.bytes);
        caso.pedir('afe', { items: ITEMS, opciones: AFE, csv: `analizador/2-afe/${afe.csv.nombre}` });
        caso.cifras.afe = await textoDe(p, '#afeResultados');
        // 3) estructura interna confirmatoria: el modelo de un factor y el de tres (AFC por WLSMV), comparados
        const modelos = [{ sintaxis: MODELO_UNO, etiqueta: 'Modelo alternativo', estimador: 'WLSMV' }, { sintaxis: MODELO_TRES, etiqueta: 'Modelo final', estimador: 'WLSMV' }];
        for (const m of modelos) await caso.hacer(4, 'ajustarSEM', m);
        caso.cifras.sem = await comprobarSEM(caso, modelos);
        // 4) invarianza según el sexo, con el modelo de tres factores
        const inv = await caso.hacer(5, 'evaluarInvarianza', { sintaxis: MODELO_TRES, grupo: 'Sexo', estimador: 'WLSMV', agrupar: true });
        caso.guardar(`analizador/3-invarianza/${inv.word.nombre}`, inv.word.bytes);
        caso.pedir('invarianza', { sintaxis: MODELO_TRES, grupo: 'Sexo', estimador: 'WLSMV', estricta: false, agrupar: await p.isChecked('#invAgrupar') });
        caso.cifras.invarianza = await tablasDe(p, '#invResultados');
        // 5) fiabilidad y validez convergente: la correlación con la autoeficacia (el capítulo de Word, con el AFC)
        await caso.hacer(6, 'analizar', { tipo: 'correlacion', variables: [procrastinacion, autoeficacia] });
        caso.cifras.correlacion = await comprobarCorrelacion(caso);
        comprobarFiabilidad(caso);
        caso.cifras.fiabilidad = (await tablasDe(p, '#resultadosFiabilidad'))[0];
        await guardarAnalisis(caso, 6, '4-capitulo');
        caso.guardar('proyecto.statsim', (await caso.hacer(7, 'guardarProyecto')).bytes);
    },
    leeme(caso) {
        const c = caso.cifras, s = c.simulador, afe = c.afe, r = c.correlacion;
        // la V de Aiken, ítem por ítem y criterio por criterio (del CSV que descargó la página)
        const [, ...lineas] = c.aikenCSV.replace(/^\ufeff/, '').trim().split(/\r?\n/).map((/** @type {string} */ l) => l.split(';'));
        /** @type {Map<string, Record<string, string[]>>} */
        const porItem = new Map();
        for (const [criterio, item, , , v, li, , , decision] of lineas) {
            if (!porItem.has(item)) porItem.set(item, {});
            /** @type {any} */ (porItem.get(item))[criterio] = [sinCero(numCSV(v)), sinCero(numCSV(li)), decision];
        }
        const orden = { 'No válido': 2, Revisar: 1, 'Válido': 0 };
        const global = (/** @type {Record<string, string[]>} */ fila) => Object.values(fila).map(x => /** @type {string} */ (x[2])).sort((a, b) => (/** @type {any} */ (orden))[b] - (/** @type {any} */ (orden))[a])[0] || '';
        const filasAiken = [...porItem].map(([item, fila]) => [item, ...CRITERIOS.map(k => { const x = fila[k.nombre]; return x ? `${x[0]} (${x[2]})` : '—'; }), global(fila)]);
        const cuenta = (/** @type {string} */ d) => filasAiken.filter(f => f[f.length - 1] === d).length;
        const noValidos = filasAiken.filter(f => f[f.length - 1] === 'No válido').map(f => f[0]);
        // el AFE, de su texto en la página
        const de = (/** @type {RegExp} */ re) => { const m = re.exec(afe); if (!m) throw new Error(`el texto del AFE no tiene ${re}`); return m; };
        const kmo = de(/KMO = (\.\d+) \(([^)]+)\)/), bartlett = de(/Bartlett χ²\((\d+)\) = ([\d.]+), p ([<=] ?\.\d+)/), factores = de(/(\d+) factores \(paralelo: (\d+); Kaiser: (\d+)\)/);
        const varianza = de(/explicaron en conjunto el ([\d.]+) %/), cargas = de(/cargas principales oscilaron entre (\.\d+) y (\.\d+)/);
        const revisar = /Ítems a revisar(.*?)Redacción/.exec(afe);
        // cada dimensión en su propio factor: el factor principal de sus ítems (del CSV de cargas que descargó la página)
        const [, ...cargasCSV] = /** @type {Buffer} */ (caso.archivos.get('analizador/2-afe/afe_cargas.csv')).toString('utf8').replace(/^\ufeff/, '').trim().split(/\r?\n/).map(l => l.split(';'));
        const factorDe = new Map(['P', 'D', 'DE'].map(s => [s, new Set(cargasCSV.filter(f => /** @type {string} */ (f[0]).replace(/\d+$/, '') === s).map(f => f[5]))]));
        afirmar([...factorDe.values()].every(f => f.size === 1) && new Set([...factorDe.values()].map(f => [...f][0])).size === 3, 'cada dimensión carga en su propio factor');
        const [uno, tres] = c.sem;
        afirmar(tres.CFI >= 0.95 && tres.RMSEA <= 0.06 && uno.CFI < 0.9, 'el modelo de tres factores se ajusta bien y el de uno no');
        // la invarianza: la tabla de los niveles y la de sus comparaciones
        const [niveles, comparaciones] = c.invarianza;
        // los negativos con el signo menos, como las demás cifras del README (la tarjeta los escribe con el guion)
        const conMenos = (/** @type {string[]} */ fila) => fila.map(celda => celda.replace(/^-(?=[.\d])/, '−'));
        const ajuste = (/** @type {any} */ m) => [m.etiqueta === 'Modelo final' ? 'Tres factores' : 'Un factor', `${num(m.chi2)} (${m.gl})`, sinCero(m.CFI, 3), sinCero(m.RMSEA, 3)];
        const fiab = c.fiabilidad.slice(1).map((/** @type {string[]} */ f) => [f[0], f[1], f[3], f[4], (f[5] || '').replace(/\[.*$/, ''), f[11]]);
        caso.destacar(`V de Aiken: ${cuenta('Válido')} de ${filasAiken.length} ítems válidos`, `AFE: ${factores[2]} factores, KMO = ${kmo[1]}`,
            `AFC de tres factores: CFI = ${sinCero(tres.CFI, 3)}, RMSEA = ${sinCero(tres.RMSEA, 3)}`);
        return `# Caso 4 · Estudio instrumental: una escala de procrastinación académica

${AVISO}

**La pregunta.** ¿Mide bien una escala de procrastinación académica de 15 ítems y tres dimensiones (postergación, distracción y desorganización)? Es la tesis instrumental o psicométrica: validez de contenido por jueces, estructura interna, invarianza entre grupos, fiabilidad y relación con otra variable.

**Lo que muestra.** Las tarjetas de psicometría del Analizador una tras otra, cada una con su Word: la V de Aiken con su intervalo y la decisión por el límite inferior; el AFE con correlaciones policóricas, análisis paralelo y rotación oblimin; el AFC por WLSMV, con un modelo rival; la invarianza de medición según el sexo; y la fiabilidad (α, ω y sus versiones ordinales) con la validez convergente en el capítulo.

## Qué se configuró en el Simulador

${s.n} universitarios con la semilla 5050 (\`simulador/configuracion_completa_simulador.csv\`):

${tablaEscalas(MAESTRO)}

- Las tres dimensiones de la escala se correlacionan entre sí (r ≈ .45); su puntaje total, con la autoeficacia académica, r = −.40.
- Sociodemográficas: Sexo (50 % mujeres, para la invarianza) y Edad (media 20.8, DE 2.2, de 17 a 30).
- Las valoraciones de los 7 jueces no salen del Simulador: son tres archivos de entrada (\`${CARPETA_AIKEN}/valoraciones_*.csv\`), uno por criterio. Casi todas las valoraciones son altas (4, a veces 3) y tres ítems se pusieron a propósito en duda (D3 en claridad, P2 en coherencia y DE4 en relevancia); con 7 jueces basta que uno o dos den un 3 para que un ítem quede «por revisar», así que en los resultados hay más que esos tres.

## Pedido vs. obtenido

${tablaInforme(s.informe)}

## Qué se hizo en el Analizador

1. «Usar datos generados» y, en «1. Configuración de la investigación», el título, la unidad de análisis y el lugar.
2. **«3. Validez de contenido por juicio de expertos (V de Aiken)»**: escala de 1 a 4, IC del 95 %, criterio V₀ = .70; tres criterios (Claridad, Coherencia y Relevancia), cada uno con «Cargar CSV»; «Calcular V de Aiken» y sus descargas (\`${CARPETA_AIKEN}/\`).
3. **«4. Análisis factorial exploratorio (AFE)»**: «Escala total (EPA)», correlación automática (policórica), factores por análisis paralelo (200 réplicas, semilla 2026), rotación oblimin; «Calcular AFE» y sus descargas (\`analizador/2-afe/\`).
4. **SEM (AFC)**: el modelo de un factor como «Modelo alternativo» y el de tres como «Modelo final», los dos con WLSMV; «¿Es adecuado usar SEM aquí?» y «Ajustar modelo» en cada uno.
5. **«6. Invarianza de medición»**: el modelo de tres factores, agrupación Sexo, WLSMV; «Evaluar la invarianza» y su Word (\`analizador/3-invarianza/\`).
6. **Fiabilidad y validez convergente**: Correlación entre la escala (\`${c.columnas.procrastinacion}\`) y la autoeficacia (\`${c.columnas.autoeficacia}\`), «Ejecutar análisis» y las tres descargas (\`analizador/4-capitulo/\`). El PDF de esta carpeta lleva todas las tarjetas anteriores con sus resultados, y el capítulo de Word, el AFC.
7. Ayuda → «Guardar proyecto»: el proyecto guarda también las valoraciones de los jueces.

## Resultados

**Validez de contenido.** De los 15 ítems, ${cuenta('Válido')} son válidos, ${cuenta('Revisar')} quedan por revisar y ${cuenta('No válido')} no son válidos${noValidos.length ? ` (${noValidos.join(' y ')})` : ''}, con la decisión más exigente de los tres criterios. Un ítem es válido si el límite inferior del IC de su V alcanza .70: con 7 jueces, una V alta no basta.

${tabla(['Ítem', ...CRITERIOS.map(k => `${k.nombre}: V (decisión)`), 'Decisión global'], filasAiken)}

**Estructura interna exploratoria.** KMO = ${kmo[1]} (${kmo[2]}) y Bartlett χ²(${bartlett[1]}) = ${bartlett[2]}, p ${bartlett[3]}. El análisis paralelo retiene ${factores[2]} factores (Kaiser, ${factores[3]}), que explican el ${varianza[1]} % de la varianza; las cargas principales van de ${cargas[1]} a ${cargas[2]}, y cada ítem carga en su dimensión.${revisar ? ` Ítems a revisar: ${revisar[1].trim()}.` : ''}

**Estructura interna confirmatoria (WLSMV).**

${tabla(['Modelo', 'χ² (gl)', 'CFI', 'RMSEA'], c.sem.map(ajuste))}

El modelo de tres factores se ajusta bien y el de un factor, no: la escala es multidimensional, como se diseñó.

**Invarianza según el sexo.**

${tabla(/** @type {string[]} */ (niveles[0]), niveles.slice(1).map(conMenos))}

${tabla(/** @type {string[]} */ (comparaciones[0]), comparaciones.slice(1).map(conMenos))}

**Fiabilidad.**

${tabla(['Escala', 'Ítems', 'ω total', 'ω jerárquico', 'α', 'Interpretación'], fiab)}

**Validez convergente.** La escala se relaciona con la autoeficacia académica: ${r.metodo.startsWith('Spearman') ? 'ρ' : 'r'} = ${sinCero(r.coeficiente)}, ${pAPA(r.pValor)} (n = ${r.n}).

## Archivos

${listaArchivos(caso, [
    [/valoraciones_\w+\.csv$/, 'Una entrada: las valoraciones de los 7 jueces a los 15 ítems en un criterio (las que se cargan con «Cargar CSV»).'],
    [/validez_contenido_aiken\.csv$/, 'La V de Aiken de cada ítem en cada criterio, con su intervalo, su p y su decisión: botón «CSV» de la tarjeta.'],
    [/validez_contenido_aiken\.docx$/, 'La validez de contenido redactada en APA, con sus tablas: botón «Word» de la tarjeta.'],
    [/afe_cargas\.csv$/, 'Las cargas factoriales, las comunalidades y la MSA de cada ítem: botón «CSV» del AFE.'],
    [/afe_APA\.docx$/, 'El AFE redactado en APA, con sus tablas: botón «Word» del AFE.'],
    [/invarianza_APA\.docx$/, 'La invarianza de medición redactada en APA, con sus tablas: botón «Word» de la tarjeta.'],
    ...DESCRIPCIONES_COMUNES,
])}

${seccionReproducir(caso.carpeta, REPETIR)}

${seccionAvisos(s.avisos)}
`;
    },
};
