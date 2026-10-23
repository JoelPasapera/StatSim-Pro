// @ts-check
// tests/navegador/recetas/05-estructural.mjs — caso 5: modelo de ecuaciones estructurales con variables latentes (el apoyo
// social y la autoeficacia académica como antecedentes del engagement académico), con un modelo rival de mediación
// completa, y la regresión múltiple de los puntajes observados.
import * as P from '../pasos.mjs';
import { columna, comprobarCorrelacion, comprobarFiabilidad, comprobarRegresion, comprobarSEM, guardarAnalisis, leerDeLaPagina, simularYDescargar, tablasDe, textoDe } from './comun.mjs';
import { AVISO, DESCRIPCIONES_COMUNES, afirmar, listaArchivos, num, pAPA, pTabla, seccionAvisos, seccionReproducir, sinCero, tabla, tablaEscalas, tablaInforme } from './leeme.mjs';

export const MAESTRO = `###GENERAL###
Campo,Valor
TamanoMuestra,380
Semilla,6060

###TESTS###
Prueba,Variable,CorrDimensiones,Dimensiones
EAS,Apoyo social percibido,,Apoyo social percibido
EAA,Autoeficacia académica,,Autoeficacia académica
UWES,Engagement académico,,Engagement académico

###PRUEBAS###
Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa,Invertidos,Dificultades
EAS,Apoyo social percibido,6,normal,27,4.8,1,7,0.88,0,
EAA,Autoeficacia académica,6,normal,20,3.3,1,5,0.85,0,
UWES,Engagement académico,6,normal,22,4.4,0,6,0.9,0,

###SOCIODEMOGRAFICOS###
Categoria,Distribucion,Promedio,DE,Minimo,Maximo,Decimales,Opciones,DependeDe,Fuerza
Sexo,binaria,0.42,,,,0,"Mujer, Hombre",,
Edad,normal,21,2.2,17,30,0,,,

###MODELOS###
Tipo,X,MediadorModerador,Y,Coef1,Coef2,Coef3
mediacion,Apoyo social percibido,Autoeficacia académica,Engagement académico,0.4,0.45,0.15
`;

/** Los indicadores de cada latente: los ítems que nombra el Simulador (la sigla de la escala y el número). */
const ITEMS = (/** @type {string} */ s) => [1, 2, 3, 4, 5, 6].map(k => s + k).join(' + ');
const MEDIDA = `Apoyo =~ ${ITEMS('ASP')}
Autoeficacia =~ ${ITEMS('AA')}
Engagement =~ ${ITEMS('EA')}`;
/** La hipótesis: mediación parcial (el apoyo actúa sobre el engagement a través de la autoeficacia y también directamente). */
const PARCIAL = `${MEDIDA}
Autoeficacia ~ Apoyo
Engagement ~ Autoeficacia + Apoyo`;
/** El rival: mediación completa (sin el camino directo). */
const COMPLETA = `${MEDIDA}
Autoeficacia ~ Apoyo
Engagement ~ Autoeficacia`;

/** @type {import('../ejemplos.mjs').Receta} */
export default {
    carpeta: '05-estructural',
    titulo: 'Apoyo social, autoeficacia y engagement académico',
    diseno: 'Explicativo (SEM)',
    resumen: 'Modelo de ecuaciones estructurales con tres variables latentes por WLSMV, comparado con un rival de mediación completa; validez convergente (AVE y fiabilidad compuesta) y la regresión de los puntajes.',
    async recorrer(caso) {
        const p = caso.pagina;
        const { columnas } = await simularYDescargar(caso, MAESTRO);
        const apoyo = columna(columnas, /^General_ASP$/), autoeficacia = columna(columnas, /^General_AA$/), engagement = columna(columnas, /^General_EA$/);
        caso.cifras.columnas = { apoyo, autoeficacia, engagement };
        await P.usarBaseDelSimulador(p);
        await P.describirInvestigacion(p, { titulo: 'Apoyo social percibido, autoeficacia académica y engagement académico en universitarios de Lima Metropolitana: un modelo de ecuaciones estructurales, 2026', unidad: 'estudiantes universitarios', lugar: 'Lima Metropolitana' });
        // 1) los dos modelos estructurales (WLSMV: los ítems son ordinales), primero el rival y después la hipótesis
        const modelos = [{ sintaxis: COMPLETA, etiqueta: 'Modelo alternativo', estimador: 'WLSMV' }, { sintaxis: PARCIAL, etiqueta: 'Modelo final', estimador: 'WLSMV' }];
        for (const m of modelos) await P.ajustarSEM(p, /** @type {any} */ (m));
        caso.cifras.sem = await comprobarSEM(caso, modelos);
        caso.cifras.semParametros = (await tablasDe(p, '#semOut'))[0];
        caso.cifras.semTexto = await textoDe(p, '#semOut');
        caso.cifras.semValidez = await leerDeLaPagina(p, "import('./src/analizador/sem-motor.js').then(m => { const V = m.SEM._ultimos[m.SEM._ultimos.length - 1].validez; return V ? V.porFactor.map(f => ({ factor: f.nombre, AVE: f.AVE, CR: f.CR })) : null; })");
        // 2) la correlación del apoyo con el engagement y la regresión del engagement en los dos antecedentes (el capítulo
        //    de Word, que lleva también los modelos estructurales)
        const regresion = { dependiente: engagement, predictores: [apoyo, autoeficacia] };
        await P.analizar(p, { tipo: 'correlacion', variables: [apoyo, engagement], regresion });
        caso.cifras.correlacion = await comprobarCorrelacion(caso);
        await comprobarRegresion(caso, regresion.dependiente, regresion.predictores);
        comprobarFiabilidad(caso);
        caso.cifras.multiple = await leerDeLaPagina(p, "import('./src/analizador/regresion.js').then(m => { const R = m.RegresionMultiple._ultimaMultiple; return R && { familia: R.familia, n: R.n, R2: R.R2, R2aj: R.R2aj, F: R.F, glR: R.glR, glE: R.glE, pF: R.pF, coefs: R.coefs }; })");
        await guardarAnalisis(caso, '1-capitulo');
        caso.guardar('proyecto.statsim', (await P.guardarProyecto(p)).bytes);
    },
    leeme(caso) {
        const c = caso.cifras, s = c.simulador, r = c.correlacion, m = c.multiple;
        const [cab, ...params] = c.semParametros;
        const iE = cab.indexOf('Estandarizado'), iP = cab.indexOf('p');
        const caminos = params.filter((/** @type {string[]} */ f) => / ~ /.test(f[0] || '') && !/=~|~~/.test(f[0] || '')).map((/** @type {string[]} */ f) => [f[0], f[iE], f[iP]]);
        const cargas = params.filter((/** @type {string[]} */ f) => /=~/.test(f[0] || '')).map((/** @type {string[]} */ f) => Number(f[iE])).filter(Number.isFinite);
        const ajuste = (/** @type {any} */ x) => [x.etiqueta === 'Modelo final' ? 'Mediación parcial (hipótesis)' : 'Mediación completa (rival)', `${num(x.chi2)} (${x.gl})`, sinCero(x.CFI, 3), sinCero(x.RMSEA, 3)];
        const comparacion = /\(anidados, WLSMV\): al restringir, ΔCFI = (-?[\d.]*\d) y ΔRMSEA = (-?[\d.]*\d)/.exec(c.semTexto);
        const directo = caminos.find((/** @type {string[]} */ f) => f[0] === 'Engagement ~ Apoyo');
        afirmar(!!comparacion && Number(comparacion[1]) < 0 && !!directo && /^(<|\.0[0-4])/.test(String(directo[2]).trim()), 'el rival se ajusta peor y el camino directo es significativo');
        const filasMultiple = m.coefs.map((/** @type {any} */ k) => [k.nombre, num(k.b, 3), k.beta === null ? '—' : sinCero(k.beta), pTabla(k.pValor)]);
        const validez = (c.semValidez || []).map((/** @type {any} */ f) => [f.factor, sinCero(f.AVE), sinCero(f.CR)]);
        return `# Caso 5 · Modelo de ecuaciones estructurales: apoyo social, autoeficacia y engagement

${AVISO}

**La pregunta.** ¿El apoyo social percibido favorece el engagement académico a través de la autoeficacia? Es la hipótesis de mediación que suele ponerse a prueba con un modelo de ecuaciones estructurales: tres variables latentes medidas por sus ítems y los caminos entre ellas, frente a un modelo rival.

**Lo que muestra.** El Simulador genera la mediación pedida (los caminos a, b y c′) y su informe mide incluso el efecto indirecto; el Analizador ajusta los dos modelos estructurales por WLSMV (los ítems son ordinales), da el ajuste global con la lectura de cada índice, la validez convergente y discriminante, los caminos estandarizados y el diagrama, y los compara.

## Qué se configuró en el Simulador

${s.n} universitarios con la semilla 6060 (\`simulador/configuracion_completa_simulador.csv\`):

${tablaEscalas(MAESTRO)}

- **Mediación:** apoyo social → autoeficacia (a = .40), autoeficacia → engagement controlando el apoyo (b = .45) y apoyo → engagement directo (c′ = .15). El efecto indirecto esperado es a·b = .18.
- Sociodemográficas: Sexo (58 % mujeres) y Edad (media 21, DE 2.2, de 17 a 30).

## Pedido vs. obtenido

${tablaInforme(s.informe)}

## Qué se hizo en el Analizador

1. «Usar datos generados» y, en «1. Configuración de la investigación», el título, la unidad de análisis y el lugar.
2. **SEM**, dos veces, con el estimador WLSMV: primero el rival (mediación completa, sin el camino directo) como «Modelo alternativo» y después la hipótesis (mediación parcial) como «Modelo final»; en cada uno, «¿Es adecuado usar SEM aquí?» y «Ajustar modelo». Los modelos, en la sintaxis de la tarjeta:

   \`\`\`
${PARCIAL.split('\n').map(l => '   ' + l).join('\n')}
   \`\`\`

   El rival es el mismo sin «+ Apoyo» en la última línea.
3. **El capítulo** (\`analizador/1-capitulo/\`): Correlación entre el apoyo social (\`${c.columnas.apoyo}\`) y el engagement (\`${c.columnas.engagement}\`), con la regresión del engagement en el apoyo y la autoeficacia (\`${c.columnas.autoeficacia}\`); «Ejecutar análisis» y las tres descargas. El capítulo de Word lleva la comparación de los modelos estructurales y el diagrama de rutas, y el PDF, la tarjeta del SEM completa.
4. Ayuda → «Guardar proyecto».

## Resultados

**Ajuste de los modelos (WLSMV).**

${tabla(['Modelo', 'χ² (gl)', 'CFI', 'RMSEA'], c.sem.map(ajuste))}

Al quitar el camino directo, el CFI baja ${sinCero(Math.abs(Number(comparacion[1])), 3)} y el RMSEA sube ${sinCero(Number(comparacion[2]), 3)}: el modelo rival se ajusta algo peor, y el camino directo es significativo en el de la hipótesis.

**Caminos estructurales del modelo de la hipótesis** (estandarizados):

${tabla(['Camino', 'Estandarizado', 'p'], caminos)}

Las cargas de los 18 ítems van de ${sinCero(Math.min(...cargas))} a ${sinCero(Math.max(...cargas))}.${validez.length ? `\n\n${tabla(['Factor', 'AVE', 'Fiabilidad compuesta'], validez)}` : ''}

**Regresión de los puntajes observados** (n = ${m.n}): R² = ${sinCero(m.R2, 3)}, F(${m.glR}, ${m.glE}) = ${num(m.F)}, ${pAPA(m.pF)}; la correlación del apoyo con el engagement es ${r.metodo.startsWith('Spearman') ? 'ρ' : 'r'} = ${sinCero(r.coeficiente)} (${pAPA(r.pValor)}).

${tabla(['Término', 'B', 'β', 'p'], filasMultiple)}

**Lo que la aplicación no calcula todavía.** El Analizador estima los caminos directos, pero no el efecto indirecto (a·b) ni su intervalo por bootstrap, que es la prueba de la mediación. Aquí puede verse en el informe del Simulador (la fila «a·b», el pedido y el obtenido en la base), no en el Analizador.

## Archivos

${listaArchivos(caso, DESCRIPCIONES_COMUNES)}

${seccionReproducir(caso.carpeta, 'tras abrirlo, repite los pasos 2 y 3 del Analizador.')}

${seccionAvisos(s.avisos)}
`;
    },
};
