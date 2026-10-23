// @ts-check
// tests/navegador/recetas/01-correlacional.mjs — caso 1: estudio correlacional entre dos instrumentos de tres dimensiones
// (estrés académico y bienestar psicológico en universitarios), con los objetivos específicos por dimensiones.
import * as P from '../pasos.mjs';
import { columna, comprobarCorrelacion, comprobarFiabilidad, comprobarObjetivos, guardarAnalisis, leerDeLaPagina, objetivosEspecificos, simularYDescargar, tablasDe } from './comun.mjs';
import { AVISO, DESCRIPCIONES_COMUNES, afirmar, listaArchivos, pAPA, seccionAvisos, seccionReproducir, sinCero, tabla, tablaEscalas, tablaInforme } from './leeme.mjs';

export const MAESTRO = `###GENERAL###
Campo,Valor
TamanoMuestra,320
Semilla,2027

###TESTS###
Prueba,Variable,CorrDimensiones,Dimensiones
EEA,Estrés académico,0.5,"Estresores, Reacciones físicas, Reacciones psicológicas"
EBP,Bienestar psicológico,0.45,"Autoaceptación, Vínculos positivos, Propósito vital"

###PRUEBAS###
Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa,Invertidos,Dificultades
EEA,Estresores,8,normal,25,4.6,1,5,0.84,0,
EEA,Reacciones físicas,6,normal,16,3.2,1,5,0.8,0,
EEA,Reacciones psicológicas,6,normal,17,3.4,1,5,0.82,0,
EBP,Autoaceptación,6,normal,24,3.8,1,6,0.81,0,
EBP,Vínculos positivos,6,normal,23,4,1,6,0.8,0,
EBP,Propósito vital,6,normal,25,3.6,1,6,0.83,0,

###SOCIODEMOGRAFICOS###
Categoria,Distribucion,Promedio,DE,Minimo,Maximo,Decimales,Opciones,DependeDe,Fuerza
Sexo,binaria,0.4,,,,0,"Mujer, Hombre",,
Edad,normal,21.4,2.4,17,35,0,,,
Universidad,binaria,0.45,,,,0,"Pública, Privada",,

###CORRELACIONES###
VariableA,VariableB,Correlacion,Tipo,Nube,RAtipicos,CasosAtipicos
Estrés académico — EEA,Bienestar psicológico — EBP,-0.42,lineal,homogenea,,
`;

/** @type {import('../ejemplos.mjs').Receta} */
export default {
    carpeta: '01-correlacional',
    titulo: 'Estrés académico y bienestar psicológico',
    diseno: 'Correlacional',
    resumen: 'Dos instrumentos de tres dimensiones: normalidad, correlación de Spearman, objetivos específicos por dimensiones con Holm, fiabilidad y el capítulo de Word completo.',
    async recorrer(caso) {
        const p = caso.pagina;
        const { columnas } = await simularYDescargar(caso, MAESTRO);
        const estres = columna(columnas, /^General_EE$/), bienestar = columna(columnas, /^General_EB$/);
        await P.usarBaseDelSimulador(p);
        await P.describirInvestigacion(p, { titulo: 'Estrés académico y bienestar psicológico en estudiantes universitarios de Lima Metropolitana, 2026', unidad: 'estudiantes universitarios', lugar: 'Lima Metropolitana' });
        await P.analizar(p, { tipo: 'correlacion', variables: [estres, bienestar] });
        caso.cifras.correlacion = await leerDeLaPagina(p, '(() => { const u = window.ultimoAnalisis; const r = { ...u.resultado }; delete r.valoresPareados; return { var1: u.var1, var2: u.var2, et1: u.et1, et2: u.et2, resultado: r }; })()');
        await comprobarCorrelacion(caso);
        comprobarObjetivos(caso, estres, bienestar);
        comprobarFiabilidad(caso);
        caso.cifras.objetivos = await objetivosEspecificos(p);
        caso.cifras.fiabilidad = (await tablasDe(p, '#resultadosFiabilidad'))[0];
        await guardarAnalisis(caso, '1-correlacion');
        caso.guardar('proyecto.statsim', (await P.guardarProyecto(p)).bytes);
    },
    leeme(caso) {
        const c = caso.cifras, r = c.correlacion.resultado, s = c.simulador;
        const rho = r.tipoCorrelacion.startsWith('Spearman') ? 'ρ' : 'r';
        afirmar(rho === 'ρ' && r.coeficiente < 0 && Math.abs(r.coeficiente) < 0.42 && r.pValor < 0.05, 'una ρ de Spearman negativa, significativa y algo menor que la r pedida (.42)');
        const objetivos = c.objetivos.map((o, k) => {
            const col = (/** @type {string} */ nombre) => o.fila[o.cabecera.findIndex(h => h.startsWith(nombre))] || '';
            return [o.titulo.replace(/^Objetivo específico \d+:\s*/, '') || `Objetivo ${k + 1}`, col('Coeficiente'), col('p ajustado'), col('Decisión')];
        });
        const fiab = c.fiabilidad.slice(1).map(f => [f[0], f[1], f[3], (f[5] || '').replace(/\[.*$/, ''), f[11]]);
        return `# Caso 1 · Estudio correlacional: estrés académico y bienestar psicológico

${AVISO}

**La pregunta.** ¿Se relaciona el estrés académico con el bienestar psicológico en estudiantes universitarios? Es el diseño más frecuente en las tesis de psicología: correlacional, transversal, con dos instrumentos de varias dimensiones y unos objetivos específicos que relacionan cada dimensión con la otra variable.

**Lo que muestra.** El recorrido completo de un estudio correlacional: el Simulador genera la base pedida y comprueba que la entrega; el Analizador elige la prueba según la normalidad, propone los objetivos específicos a partir de los datos, corrige sus p por Holm y redacta el capítulo de resultados.

## Qué se configuró en el Simulador

${s.n} casos con la semilla 2027 (\`simulador/configuracion_completa_simulador.csv\`):

${tablaEscalas(MAESTRO)}

- Las dimensiones de cada instrumento se correlacionan entre sí (r ≈ .50 en el de estrés y ≈ .45 en el de bienestar).
- Los puntajes generales de los dos instrumentos, con r = −.42.
- Sociodemográficas: Sexo (60 % mujeres), Edad (media 21.4, DE 2.4, de 17 a 35) y Universidad (55 % pública).

## Pedido vs. obtenido

El informe del Simulador mide cada parámetro sobre la base que acaba de generar (\`simulador/informe_pedido_vs_obtenido.csv\`):

${tablaInforme(s.informe)}

## Qué se hizo en el Analizador

1. «Usar datos generados»: la base pasa al Analizador con sus etiquetas.
2. «1. Configuración de la investigación»: el título, la unidad de análisis (estudiantes universitarios) y el lugar (Lima Metropolitana), que usa la redacción.
3. «Análisis estadístico»: Correlación, Variable 1 = ${c.correlacion.et1} (\`${c.correlacion.var1}\`), Variable 2 = ${c.correlacion.et2} (\`${c.correlacion.var2}\`), prueba bilateral, y «Ejecutar análisis».
4. «Exportar capítulo a Word», «Descargar resultados» e «Imprimir o guardar en PDF» (carpeta \`analizador/1-correlacion/\`).
5. Ayuda → «Guardar proyecto».

## Resultados

- **Normalidad.** Con n = ${r.n}, la prueba es Kolmogorov-Smirnov con la corrección de Lilliefors: ${pAPA(r.normalidad1.pValor)} para el estrés y ${pAPA(r.normalidad2.pValor)} para el bienestar. ${r.normalidad1.normal && r.normalidad2.normal ? 'Las dos son normales, así que la correlación es la de Pearson.' : 'Al menos una se aparta de la normalidad, así que la correlación es la de Spearman.'}
- **Correlación.** ${rho} = ${sinCero(r.coeficiente)}, ${pAPA(r.pValor)}, IC 95 % [${sinCero(r.intervaloConfianza.inferior)}, ${sinCero(r.intervaloConfianza.superior)}]: ${r.interpretacion.texto.charAt(0).toLowerCase() + r.interpretacion.texto.slice(1)}. La r pedida al Simulador era −.42 (Pearson); la ρ de Spearman sobre los mismos datos sale algo menor, como es habitual.
- **Objetivos específicos.** El Analizador evalúa cada dimensión con la otra variable, elige las de mayor relación y corrige los p por Holm:

${tabla(['Objetivo específico', 'Coeficiente', 'p ajustado (Holm)', 'Decisión'], objetivos)}

- **Fiabilidad** (tarjeta «Fiabilidad y consistencia interna»):

${tabla(['Escala', 'Ítems', 'ω total', 'α', 'Interpretación'], fiab)}

El capítulo de Word reúne todo lo anterior con el marco metodológico (pregunta, objetivos, hipótesis, matriz de consistencia), la tabla sociodemográfica, los niveles, las comparaciones según el sexo y la universidad, la discusión y las referencias.

## Archivos

${listaArchivos(caso, DESCRIPCIONES_COMUNES)}

${seccionReproducir(caso.carpeta, 'tras abrirlo, repite el paso 3 del Analizador.')}

${seccionAvisos(s.avisos)}
`;
    },
};
