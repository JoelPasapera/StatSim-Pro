# Ejemplos de StatSim Pro

Cinco casos de uso hechos por la propia página. Cada uno se recorrió en un navegador de verdad (Chromium) como lo haría una persona: importar la configuración en el Simulador, generar la base, descargarla en todos sus formatos, pasarla al Analizador, analizar, exportar el Word, imprimir los resultados en PDF y guardar el proyecto. Lo que hay en cada carpeta es lo que descargó la página, sin retocar.

En la página, la pestaña **Ejemplos** los muestra uno por uno, deja descargar cada archivo (o el caso entero en un .zip) y los abre en StatSim con un clic, con sus pasos a la vista: en cada paso, «Muéstrame» señala dónde está cada control y, en los que hay que repetir, «Hazlo por mí» repite el análisis a la vista, como se hizo en el caso.

> **Datos simulados.** Todas las bases las generó el Simulador con una configuración y una semilla fijas: sirven para ver qué hace cada sección y qué entrega, no son resultados de ninguna investigación.

| # | Caso | Diseño | Lo que muestra |
| --- | --- | --- | --- |
| 1 | [Estrés académico y bienestar psicológico](01-correlacional/README.md) | Correlacional | Dos instrumentos de tres dimensiones: normalidad, correlación de Spearman, objetivos específicos por dimensiones con Holm, fiabilidad y el capítulo de Word completo. |
| 2 | [Ansiedad ante los exámenes según el sexo y el grado](02-comparativo/README.md) | Comparativo | Diferencias pedidas como d de Cohen: Mann-Whitney por sexo, Kruskal-Wallis por grado con post hoc de Holm, χ² del nivel con el sexo y una base con respuestas perdidas. |
| 3 | [Predictores del rendimiento y del riesgo de deserción](03-predictivo/README.md) | Predictivo | Regresión lineal múltiple del promedio (β, VIF, R²) y regresión logística del riesgo de deserción, el desenlace binario «No/Sí» del Simulador (OR con su intervalo). |
| 4 | [Propiedades psicométricas de una escala de procrastinación académica](04-instrumental/README.md) | Instrumental | V de Aiken con 7 jueces, AFE con correlaciones policóricas y análisis paralelo, AFC por WLSMV frente a un modelo rival, invarianza según el sexo, fiabilidad α y ω y validez convergente. |
| 5 | [Apoyo social, autoeficacia y engagement académico](05-estructural/README.md) | Explicativo (SEM) | Modelo de ecuaciones estructurales con tres variables latentes por WLSMV, comparado con un rival de mediación completa; validez convergente (AVE y fiabilidad compuesta) y la regresión de los puntajes. |

## Qué hay en cada carpeta

- `README.md`: la pregunta del caso, lo que se configuró, lo que se pulsó en el Analizador y sus resultados, con las cifras que dio la página.
- `simulador/`: la configuración completa (el archivo maestro, para «Importar todo»), la base en CSV (dos variantes), SPSS (.sav) y Excel (.xlsx), el informe «pedido vs. obtenido» y su verificación impresa en PDF.
- `analizador/`: una carpeta por análisis, con el capítulo de Word (de las correlaciones), los resultados en texto y la página impresa en PDF; y las tarjetas de psicometría, con sus propios Word y CSV.
- `proyecto.statsim`: el proyecto completo, para abrirlo con Ayuda → «Abrir proyecto».
- `verificacion.json`: la huella de cada archivo y las cifras que se vuelven a calcular para comprobar el caso; también la ficha del caso (sus cifras clave y sus pasos).

Y, junto a las carpetas, `indice.json`: el catálogo que lee la pestaña «Ejemplos» (sale de las fichas de los casos).

## Cómo se hicieron

Con `node tests/navegador/ejemplos.mjs generar` (una receta por caso en `tests/navegador/recetas/`), que abre la página en Chromium con Playwright, sin red externa, con la zona horaria de Lima y el reloj fijo en el 21 de octubre de 2026 a las 12:00 (Lima): por eso las fechas que llevan los archivos (en el Word, el proyecto, las bases y lo impreso) son esas y una segunda corrida da los mismos archivos, byte a byte (los PDF, con el mismo texto impreso: la fecha de creación que Chromium anota dentro de un PDF es la de la corrida). Los PDF salen del motor de impresión de Chromium con los estilos de impresión de la página, como «Imprimir → Guardar como PDF».

## Cómo se comprueban

- `npm test` (sin navegador): cada archivo sigue siendo el que generó la página (su huella), cada proyecto regenera bit a bit su base con el código del momento, la base es la misma en el proyecto, los CSV, el .sav y el .xlsx (y los códigos de sus categorías, en el proyecto, el .sav y el .xlsx), el Analizador vuelve a dar las cifras y los textos de `verificacion.json`, y la configuración de cada caso, importada en la página, da bit a bit su base.
- `node tests/navegador/ejemplos.mjs comprobar` (con Playwright): rehace cada caso en Chromium, pulsando los botones, y lo compara con su carpeta: cada archivo byte a byte, salvo los PDF, de los que se compara lo que dice el papel (su texto impreso) y su número de páginas, porque dos impresiones de la misma página no siempre dan los mismos bytes. Los PDF y las figuras del Word dependen además de las fuentes instaladas y de la versión de Chromium: en otra computadora, del Word se compara su texto (`verificacion.json` guarda la huella del dibujo con que se hicieron). La batería completa lo corre si encuentra Playwright.
- Tras un cambio que altere a propósito lo que entrega la página, `node tests/navegador/ejemplos.mjs generar` los rehace.

## Lo que no está

- El **Buscador**, el **Redactor** y el **Explorador**: dependen de las bases académicas en línea y de la IA, y estos ejemplos se generan sin red.
- Un estudio **pre-post**: el Simulador genera medidas repetidas, pero el Analizador aún no tiene pruebas para muestras relacionadas (t pareada, Wilcoxon).
- El **efecto indirecto** de una mediación con su intervalo: el Analizador estima los caminos del modelo estructural, no el producto a·b (el caso 5 lo explica).
