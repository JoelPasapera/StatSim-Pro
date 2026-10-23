// @ts-check
// tests/navegador/recetas/02-comparativo.mjs — caso 2: estudio comparativo en escolares (ansiedad ante los exámenes según
// el sexo y el grado, su nivel según el sexo y su relación con el promedio de notas), con un 2 % de respuestas perdidas.
import * as P from '../pasos.mjs';
import { columna, comprobarChi2, comprobarCorrelacion, comprobarFiabilidad, comprobarGrupos, guardarAnalisis, leerDeLaPagina, simularYDescargar, tablasDe } from './comun.mjs';
import { AVISO, DESCRIPCIONES_COMUNES, afirmar, estadistico, letraDe, listaArchivos, num, pAPA, pTabla, seccionAvisos, seccionReproducir, sinCero, tabla, tablaEscalas, tablaInforme } from './leeme.mjs';

export const MAESTRO = `###GENERAL###
Campo,Valor
TamanoMuestra,300
Semilla,3030
PctPerdidos,2
MecanismoPerdidos,MCAR

###TESTS###
Prueba,Variable,CorrDimensiones,Dimensiones
IAE,Ansiedad ante los exámenes,0.55,"Preocupación, Emocionalidad"

###PRUEBAS###
Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa,Invertidos,Dificultades
IAE,Preocupación,8,normal,25,4.8,1,5,0.85,0,
IAE,Emocionalidad,8,normal,23,4.6,1,5,0.83,0,

###SOCIODEMOGRAFICOS###
Categoria,Distribucion,Promedio,DE,Minimo,Maximo,Decimales,Opciones,DependeDe,Fuerza
Sexo,binaria,0.48,,,,0,"Mujer, Hombre",,
Grado,categorica,,,,,0,3.º de secundaria:34 < 4.º de secundaria:33 < 5.º de secundaria:33,,
Gestión,binaria,0.35,,,,0,"Pública, Privada",,
Promedio de notas,normal,14.2,1.8,0,20,1,,,

###CORRELACIONES###
VariableA,VariableB,Correlacion,Tipo,Nube,RAtipicos,CasosAtipicos
Ansiedad ante los exámenes — IAE,Promedio de notas,-0.3,lineal,homogenea,,

###DIFERENCIAS###
Cuantitativa,Agrupacion,d,Tipo,Agrupacion2
Ansiedad ante los exámenes — IAE,Sexo,-0.5,d,
Ansiedad ante los exámenes — IAE,Grado,0.3,d,

###CORTES###
Variable,CategoriasCortes
Ansiedad ante los exámenes — IAE,"Baja, Moderada, Alta @ P25, P75"
`;

/** El análisis de grupos que ve la página (ComparacionGrupos, el mismo protocolo de la vista y de la tarjeta). */
const GRUPOS = (/** @type {string} */ grupo, /** @type {string} */ numerica) => `import('./src/analizador/comparacion-grupos.js').then(m => m.ComparacionGrupos.analizar(${JSON.stringify(grupo)}, ${JSON.stringify(numerica)}, ${JSON.stringify(grupo)}, ${JSON.stringify(numerica)}))`;

/** @type {import('../ejemplos.mjs').Receta} */
export default {
    carpeta: '02-comparativo',
    titulo: 'Ansiedad ante los exámenes según el sexo y el grado',
    diseno: 'Comparativo',
    resumen: 'Diferencias pedidas como d de Cohen: Mann-Whitney por sexo, Kruskal-Wallis por grado con post hoc de Holm, χ² del nivel con el sexo y una base con respuestas perdidas.',
    async recorrer(caso) {
        const p = caso.pagina;
        const { columnas } = await simularYDescargar(caso, MAESTRO);
        const ansiedad = columna(columnas, /^General_/), nivel = columna(columnas, /^Nivel_/), notas = columna(columnas, /^Promedio/);
        caso.cifras.columnas = { ansiedad, nivel, notas };
        await P.usarBaseDelSimulador(p);
        await P.describirInvestigacion(p, { titulo: 'Ansiedad ante los exámenes en estudiantes de secundaria de Lima Metropolitana: diferencias según el sexo y el grado, 2026', unidad: 'estudiantes de secundaria', lugar: 'Lima Metropolitana' });
        // 1) el capítulo de Word: la correlación con el promedio, cuyas secciones comparan la ansiedad según el sexo, el
        //    grado y la gestión del colegio
        await P.analizar(p, { tipo: 'correlacion', variables: [ansiedad, notas] });
        await comprobarCorrelacion(caso);
        comprobarFiabilidad(caso);
        caso.cifras.correlacion = await leerDeLaPagina(p, '(() => { const r = window.ultimoAnalisis.resultado; return { coeficiente: r.coeficiente, pValor: r.pValor, n: r.n, tipoCorrelacion: r.tipoCorrelacion }; })()');
        await guardarAnalisis(caso, '1-capitulo');
        // 2) la comparación por sexo (el análisis general) y por grado (la tarjeta «Comparación entre grupos», con post hoc)
        await P.analizar(p, { tipo: 'comparacion', variables: [ansiedad, 'Sexo'] });
        await P.compararGrupos(p, { grupo: 'Grado', numerica: ansiedad });
        caso.cifras.sexo = await leerDeLaPagina(p, GRUPOS('Sexo', ansiedad));
        caso.cifras.grado = await leerDeLaPagina(p, GRUPOS('Grado', ansiedad));
        comprobarGrupos(caso, 'Sexo', ansiedad);
        comprobarGrupos(caso, 'Grado', ansiedad);
        await guardarAnalisis(caso, '2-comparacion', { word: false });
        // 3) la asociación del nivel de ansiedad con el sexo (χ² de independencia)
        await P.analizar(p, { tipo: 'asociacion', variables: [nivel, 'Sexo'] });
        caso.cifras.chi = await comprobarChi2(caso, nivel, 'Sexo');
        caso.cifras.contingencia = (await tablasDe(p, '#resultadosChiCuadrado'))[0];
        caso.cifras.cramer = await leerDeLaPagina(p, `import('./src/analizador/estadistica.js').then(m => { const A = m.AnalizadorEstadistico, d = A.obtenerDatos(); return A.chiCuadradoIndependencia(d.map(f => f[${JSON.stringify(nivel)}]), d.map(f => f.Sexo)).cramerV; })`);
        await guardarAnalisis(caso, '3-asociacion', { word: false });
        caso.guardar('proyecto.statsim', (await P.guardarProyecto(p)).bytes);
    },
    leeme(caso) {
        const c = caso.cifras, s = c.simulador, r = c.correlacion, sx = c.sexo, gr = c.grado, chi = c.chi;
        const rho = r.tipoCorrelacion.startsWith('Spearman') ? 'ρ' : 'r';
        const noParametricas = [sx, gr].every((/** @type {any} */ R) => /Mann-Whitney|Kruskal/.test(R.prueba.nombre) && R.prueba.pValor < 0.05);
        const mujeres = sx.grupos.find((/** @type {any} */ g) => g.nombre === 'Mujer'), varones = sx.grupos.find((/** @type {any} */ g) => g.nombre === 'Hombre');
        afirmar(noParametricas && mujeres.media > varones.media, 'las dos diferencias significativas, con pruebas no paramétricas, y las mujeres por encima');
        const grupos = (/** @type {any} */ R) => tabla(['Grupo', 'n', 'Media', 'DE', 'Mediana'], [...R.grupos].sort((/** @type {any} */ a, /** @type {any} */ b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
            .map((/** @type {any} */ g) => [g.nombre, g.n, num(g.media), num(g.de), num(g.mediana)]));
        const prueba = (/** @type {any} */ R) => `${R.prueba.nombre}, ${letraDe(R.prueba.nombre)}${R.prueba.gl === null || R.prueba.gl === undefined ? '' : `(${R.prueba.gl})`} = ${estadistico(R.prueba.estadistico)}${Number.isFinite(R.prueba.z) ? `, z = ${num(R.prueba.z)}` : ''}, ${pAPA(R.prueba.pValor)}; tamaño del efecto ${R.prueba.efecto.nombre} = ${sinCero(R.prueba.efecto.valor, 3)} (${R.prueba.magnitud})`;
        const postHoc = (gr.postHoc || []).map((/** @type {any} */ q) => [`${q.a} vs ${q.b}`, q.nombre, num(q.estadistico), pTabla(q.pValor), pTabla(q.pHolm)]);
        return `# Caso 2 · Estudio comparativo: ansiedad ante los exámenes según el sexo y el grado

${AVISO}

**La pregunta.** ¿Difiere la ansiedad ante los exámenes entre mujeres y varones y entre los grados de secundaria? ¿Se asocia su nivel (baja, moderada, alta) con el sexo? Y, de paso, ¿se relaciona con el promedio de notas? Es el diseño comparativo, con las tres preguntas que suelen acompañarlo.

**Lo que muestra.** Diferencias de grupo pedidas al Simulador como d de Cohen y recuperadas por el Analizador con el protocolo que elige la prueba según los supuestos (normalidad por grupo y Levene); el post hoc con la corrección de Holm; la χ² de independencia con la V de Cramér; los niveles por percentiles; y una base con respuestas perdidas, como las reales.

## Qué se configuró en el Simulador

${s.n} escolares con la semilla 3030 (\`simulador/configuracion_completa_simulador.csv\`):

${tablaEscalas(MAESTRO)}

- **Diferencias de grupo:** d = −0.50 según el sexo (las mujeres puntúan más alto: la d es la del grupo de código mayor, «Hombre», frente al otro) y d = 0.30 entre cada grado y el siguiente.
- **Niveles:** la columna \`${c.columnas.nivel}\` corta el puntaje general en Baja, Moderada y Alta por los percentiles 25 y 75.
- **Otras variables:** Sexo (52 % mujeres), Grado (3.º, 4.º y 5.º de secundaria, un tercio cada uno), Gestión del colegio (65 % pública) y Promedio de notas (media 14.2, DE 1.8, de 0 a 20), con r = −.30 con la ansiedad.
- **Imperfecciones:** 2 % de respuestas perdidas al azar (MCAR).

## Pedido vs. obtenido

El Simulador comprueba la base antes de aplicar las imperfecciones, y la última columna da el valor en la base final, con los perdidos, cuando cambia (vacía: el mismo valor) (\`simulador/informe_pedido_vs_obtenido.csv\`):

${tablaInforme(s.informe)}

## Qué se hizo en el Analizador

1. «Usar datos generados» y, en «1. Configuración de la investigación», el título, la unidad de análisis y el lugar.
2. **El capítulo** (\`analizador/1-capitulo/\`): Correlación entre la ansiedad (\`${c.columnas.ansiedad}\`) y el promedio (\`${c.columnas.notas}\`), «Ejecutar análisis» y las tres descargas. El capítulo de Word se redacta sobre una correlación, y sus secciones ya comparan las dos variables según el sexo, el grado y la gestión del colegio.
3. **Las comparaciones** (\`analizador/2-comparacion/\`): «Comparación de grupos» con la ansiedad como variable cuantitativa y Sexo como agrupación, «Ejecutar análisis»; y, en la tarjeta «Comparación entre grupos», Grado y la ansiedad, «Comparar grupos». Después, «Descargar resultados» e «Imprimir o guardar en PDF» (el PDF lleva las dos).
4. **La asociación** (\`analizador/3-asociacion/\`): «Asociación de dos variables categóricas (Chi²)» con \`${c.columnas.nivel}\` y Sexo, «Ejecutar análisis», «Descargar resultados» e «Imprimir o guardar en PDF».
5. Ayuda → «Guardar proyecto».

La comparación y la asociación no tienen capítulo de Word propio: el botón «Exportar capítulo a Word» lo dice y remite a los resultados en texto y al PDF.

## Resultados

- **Correlación con el promedio:** ${rho} = ${sinCero(r.coeficiente)}, ${pAPA(r.pValor)}, con los ${r.n} casos completos (los perdidos dejan fuera a ${s.n - r.n}).
- **Según el sexo.** ${prueba(sx)}.

${grupos(sx)}

- **Según el grado.** ${prueba(gr)}.

${grupos(gr)}

${postHoc.length ? `Comparaciones por pares, con la corrección de Holm:\n\n${tabla(['Par', 'Prueba', 'Estadístico', 'p', 'p de Holm'], postHoc)}` : ''}

- **Nivel de ansiedad y sexo:** χ²(${chi.gl}) = ${num(chi.chiCuadrado)}, ${pAPA(chi.pValor)}, V de Cramér = ${sinCero(c.cramer, 3)}, con n = ${chi.n}.

${tabla(c.contingencia[0], c.contingencia.slice(1))}

Las d pedidas (−0.50 y 0.30) se recuperan: el informe del Simulador las mide en la base, y el Analizador encuentra las dos diferencias con pruebas no paramétricas, porque los totales Likert no pasan la normalidad (ver los avisos al final).

## Archivos

${listaArchivos(caso, DESCRIPCIONES_COMUNES)}

${seccionReproducir(caso.carpeta, 'tras abrirlo, repite los pasos 2 a 4 del Analizador.')}

${seccionAvisos(s.avisos)}
`;
    },
};
