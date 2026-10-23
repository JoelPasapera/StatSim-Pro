// @ts-check
// tests/navegador/recetas/03-predictivo.mjs — caso 3: estudio predictivo (el promedio ponderado según la autoeficacia, la
// procrastinación y el apoyo social: regresión lineal múltiple; y el riesgo de deserción, sí o no: regresión logística).
import * as P from '../pasos.mjs';
import { columna, comprobarCorrelacion, comprobarFiabilidad, comprobarRegresion, guardarAnalisis, leerDeLaPagina, simularYDescargar } from './comun.mjs';
import { AVISO, DESCRIPCIONES_COMUNES, filasCSV, listaArchivos, num, pAPA, pTabla, seccionAvisos, seccionReproducir, sinCero, tabla, tablaEscalas, tablaInforme } from './leeme.mjs';

export const MAESTRO = `###GENERAL###
Campo,Valor
TamanoMuestra,400
Semilla,4040

###TESTS###
Prueba,Variable,CorrDimensiones,Dimensiones
EAA,Autoeficacia académica,,Autoeficacia académica
EPA,Procrastinación académica,,Procrastinación académica
EAS,Apoyo social percibido,0.5,"Familia, Amigos, Otros significativos"

###PRUEBAS###
Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa,Invertidos,Dificultades
EAA,Autoeficacia académica,10,normal,33,5.5,1,5,0.88,0,
EPA,Procrastinación académica,12,normal,32,6.4,1,5,0.85,0,
EAS,Familia,4,normal,18,3.2,1,7,0.85,0,
EAS,Amigos,4,normal,18,3.2,1,7,0.85,0,
EAS,Otros significativos,4,normal,19,2.9,1,7,0.83,0,

###SOCIODEMOGRAFICOS###
Categoria,Distribucion,Promedio,DE,Minimo,Maximo,Decimales,Opciones,DependeDe,Fuerza
Sexo,binaria,0.45,,,,0,"Mujer, Hombre",,
Edad,normal,20.5,2,17,30,0,,,
Promedio ponderado,normal,13.8,1.9,0,20,2,,,

###CORRELACIONES###
VariableA,VariableB,Correlacion,Tipo,Nube,RAtipicos,CasosAtipicos
Autoeficacia académica,Promedio ponderado,0.45,lineal,homogenea,,
Procrastinación académica,Promedio ponderado,-0.38,lineal,homogenea,,
Apoyo social percibido — EAS,Promedio ponderado,0.22,lineal,homogenea,,
Autoeficacia académica,Procrastinación académica,-0.4,lineal,homogenea,,
Autoeficacia académica,Apoyo social percibido — EAS,0.3,lineal,homogenea,,
Procrastinación académica,Apoyo social percibido — EAS,-0.18,lineal,homogenea,,

###DESENLACES###
Nombre,Tipo,Parametro,Predictor1,Efecto1,Predictor2,Efecto2,Predictor3,Efecto3
Riesgo de deserción,binario,"No, Sí: 18 %",Autoeficacia académica,0.55,Procrastinación académica,1.7,Promedio ponderado,0.6
`;

/**
 * La lectura de las OR del desenlace en el informe del Simulador: las que más se apartan de lo pedido, y por qué el informe
 * las da por buenas (su error muestral, con un 18 % de «Sí»). Vacía si ninguna se aparta más de un 5 %.
 * @param {string} informe el CSV del informe
 * @param {number} n los casos de la base
 */
function notaDeLasOR(informe, n) {
    const filas = filasCSV(informe).filter(f => f[0] === 'OR').map(f => ({ variable: /** @type {string} */ (f[1]).replace(/^.*~\s*/, '').replace(/\s*\(.*$/, ''), pedido: Number(f[2]), obtenido: Number(f[3]), estado: f[4] }));
    const lejos = filas.filter(f => Math.abs(f.obtenido - f.pedido) / f.pedido > 0.05).sort((a, b) => Math.abs(b.obtenido - b.pedido) / b.pedido - Math.abs(a.obtenido - a.pedido) / a.pedido);
    if (!lejos.length) return '';
    const [mayor] = lejos;
    return `Las OR del desenlace son lo que más se aparta de lo pedido (la de ${mayor.variable.toLowerCase()} salió en ${num(mayor.obtenido)} frente a ${num(mayor.pedido)}): con ${n} casos y un 18 % de «Sí», su error muestral es grande, y el informe da por buena una OR que queda a menos de 2.5 errores estándar de la pedida.`;
}

/** Lo que el README cita de la última regresión de la página (RegresionMultiple._ultimaMultiple). */
const ULTIMA = "import('./src/analizador/regresion.js').then(m => { const R = m.RegresionMultiple._ultimaMultiple; return R && { familia: R.familia, n: R.n, R2: R.R2, R2aj: R.R2aj, F: R.F, glR: R.glR, glE: R.glE, pF: R.pF, mcFadden: R.mcFadden, coefs: R.coefs, vifs: R.vifs, eventoY: R.eventoY, avisos: R.avisos }; })";

/** @type {import('../ejemplos.mjs').Receta} */
export default {
    carpeta: '03-predictivo',
    titulo: 'Predictores del rendimiento y del riesgo de deserción',
    diseno: 'Predictivo',
    resumen: 'Regresión lineal múltiple del promedio (β, VIF, R²) y regresión logística del riesgo de deserción, el desenlace binario «No/Sí» del Simulador (OR con su intervalo).',
    async recorrer(caso) {
        const p = caso.pagina;
        const { columnas } = await simularYDescargar(caso, MAESTRO);
        const autoeficacia = columna(columnas, /^General_AA$/), procrastinacion = columna(columnas, /^General_PA$/);
        const apoyo = columna(columnas, /^General_E/), promedio = columna(columnas, /^Promedio/), riesgo = columna(columnas, /^Riesgo/);
        caso.cifras.columnas = { autoeficacia, procrastinacion, apoyo, promedio, riesgo };
        await P.usarBaseDelSimulador(p);
        await P.describirInvestigacion(p, { titulo: 'Autoeficacia académica, procrastinación y apoyo social como predictores del rendimiento y del riesgo de deserción en universitarios de Lima Metropolitana, 2026', unidad: 'estudiantes universitarios', lugar: 'Lima Metropolitana' });
        // 1) el promedio según los tres predictores (regresión lineal múltiple), sobre la correlación autoeficacia–promedio
        const multiple = { dependiente: promedio, predictores: [autoeficacia, procrastinacion, apoyo] };
        await P.analizar(p, { tipo: 'correlacion', variables: [autoeficacia, promedio], regresion: multiple });
        caso.cifras.correlacion1 = await comprobarCorrelacion(caso);
        await comprobarRegresion(caso, multiple.dependiente, multiple.predictores);
        comprobarFiabilidad(caso);
        caso.cifras.multiple = await leerDeLaPagina(p, ULTIMA);
        await guardarAnalisis(caso, '1-regresion-multiple');
        // 2) el riesgo de deserción (sí/no) según la autoeficacia, la procrastinación y el promedio (regresión logística)
        const logistica = { dependiente: riesgo, predictores: [autoeficacia, procrastinacion, promedio] };
        await P.analizar(p, { tipo: 'correlacion', variables: [procrastinacion, promedio], regresion: logistica });
        caso.cifras.correlacion2 = await comprobarCorrelacion(caso);
        await comprobarRegresion(caso, logistica.dependiente, logistica.predictores);
        caso.cifras.logistica = await leerDeLaPagina(p, ULTIMA);
        await guardarAnalisis(caso, '2-regresion-logistica');
        caso.guardar('proyecto.statsim', (await P.guardarProyecto(p)).bytes);
    },
    leeme(caso) {
        const c = caso.cifras, s = c.simulador, m = c.multiple, l = c.logistica, col = c.columnas;
        if (m.familia !== 'ols' || l.familia !== 'logistica') throw new Error(`regresiones inesperadas: ${m.familia} y ${l.familia}`);
        const rho = (/** @type {any} */ r) => `${r.metodo.startsWith('Spearman') ? 'ρ' : 'r'} = ${sinCero(r.coeficiente)}, ${pAPA(r.pValor)}`;
        const filasMultiple = m.coefs.map((/** @type {any} */ k, /** @type {number} */ j) => [k.nombre, num(k.b, 3), k.beta === null ? '—' : sinCero(k.beta), pTabla(k.pValor), `[${num(k.ic[0], 3)}, ${num(k.ic[1], 3)}]`, j === 0 ? '—' : num(m.vifs[j - 1])]);
        const filasLogistica = l.coefs.map((/** @type {any} */ k) => [k.nombre, num(k.b, 3), pTabla(k.pValor), num(k.OR, 3), `[${num(k.ic[0], 3)}, ${num(k.ic[1], 3)}]`]);
        return `# Caso 3 · Estudio predictivo: rendimiento académico y riesgo de deserción

${AVISO}

**La pregunta.** ¿Cuánto explican la autoeficacia académica, la procrastinación y el apoyo social el promedio ponderado de los universitarios? ¿Y qué factores elevan el riesgo de deserción (sí o no)? Son las dos regresiones de una tesis predictiva: la lineal múltiple para un criterio continuo y la logística para uno binario.

**Lo que muestra.** Un Simulador que genera a la vez una matriz de correlaciones entre cinco variables y un desenlace binario que depende de tres de ellas (con sus razones de probabilidades); y un Analizador que ajusta las dos regresiones, con sus coeficientes estandarizados, el VIF, el pseudo-R² y los intervalos de las OR. La regresión logística acepta el desenlace tal como lo entrega el Simulador, con sus categorías «No» y «Sí».

## Qué se configuró en el Simulador

${s.n} universitarios con la semilla 4040 (\`simulador/configuracion_completa_simulador.csv\`):

${tablaEscalas(MAESTRO)}

- **Correlaciones pedidas:** autoeficacia y promedio .45; procrastinación y promedio −.38; apoyo social y promedio .22; autoeficacia y procrastinación −.40; autoeficacia y apoyo .30; procrastinación y apoyo −.18.
- **Desenlace binario:** «Riesgo de deserción» (No/Sí, 18 % de «Sí»), con una OR de 0.55 por cada DE de autoeficacia, 1.70 por cada DE de procrastinación y 0.60 por cada DE del promedio.
- **Otras variables:** Sexo (55 % mujeres), Edad (media 20.5, DE 2, de 17 a 30) y Promedio ponderado (media 13.8, DE 1.9, de 0 a 20).

## Pedido vs. obtenido

${tablaInforme(s.informe)}

${notaDeLasOR(s.informe, s.n)}

## Qué se hizo en el Analizador

1. «Usar datos generados» y, en «1. Configuración de la investigación», el título, la unidad de análisis y el lugar.
2. **La regresión lineal múltiple** (\`analizador/1-regresion-multiple/\`): Correlación entre la autoeficacia (\`${col.autoeficacia}\`) y el promedio (\`${col.promedio}\`); en «Regresión», el promedio como variable dependiente y la autoeficacia como predictor; con «＋ Agregar predictor», la procrastinación (\`${col.procrastinacion}\`) y el apoyo social (\`${col.apoyo}\`). «Ejecutar análisis» y las tres descargas: el capítulo de Word lleva la regresión múltiple.
3. **La regresión logística** (\`analizador/2-regresion-logistica/\`): Correlación entre la procrastinación y el promedio; en «Regresión», «${col.riesgo}» como variable dependiente (aparece como «dos categorías: No = 0, Sí = 1») y como predictores la autoeficacia, la procrastinación y el promedio. «Ejecutar análisis» y las tres descargas.
4. Ayuda → «Guardar proyecto».

## Resultados

- **Correlaciones de partida:** autoeficacia y promedio, ${rho(c.correlacion1)}; procrastinación y promedio, ${rho(c.correlacion2)}.
- **Regresión lineal múltiple del promedio** (n = ${m.n}): R² = ${sinCero(m.R2, 3)} (R² ajustado = ${sinCero(m.R2aj, 3)}), F(${m.glR}, ${m.glE}) = ${num(m.F)}, ${pAPA(m.pF)}.

${tabla(['Término', 'B', 'β', 'p', 'IC 95 % (B)', 'VIF'], filasMultiple)}

- **Regresión logística del riesgo de deserción** (n = ${l.n}; se modela la probabilidad de «${l.eventoY.evento}» frente a «${l.eventoY.referencia}»): pseudo-R² de McFadden = ${sinCero(l.mcFadden, 3)}.

${tabla(['Término', 'B', 'p', 'OR', 'IC 95 % (OR)'], filasLogistica)}

Las OR de la tabla son por punto de cada escala; las del Simulador se pidieron por desviación estándar. Con la DE de la autoeficacia (5.5), una OR de ${num(l.coefs[1].OR, 3)} por punto equivale a ${num(Math.pow(l.coefs[1].OR, 5.5), 2)} por DE, cerca de la pedida (0.55): el informe del Simulador las compara en su escala.

## Archivos

${listaArchivos(caso, DESCRIPCIONES_COMUNES)}

${seccionReproducir(caso.carpeta, 'tras abrirlo, repite los pasos 2 y 3 del Analizador.')}

${seccionAvisos(s.avisos)}
`;
    },
};
