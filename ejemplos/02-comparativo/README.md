# Caso 2 · Estudio comparativo: ansiedad ante los exámenes según el sexo y el grado

> **Datos simulados.** La base de este caso la generó el Simulador de StatSim Pro con una configuración y una semilla fijas. Sirve para ver qué hace cada sección y qué archivos entrega, no es el resultado de una investigación.

**La pregunta.** ¿Difiere la ansiedad ante los exámenes entre mujeres y varones y entre los grados de secundaria? ¿Se asocia su nivel (baja, moderada, alta) con el sexo? Y, de paso, ¿se relaciona con el promedio de notas? Es el diseño comparativo, con las tres preguntas que suelen acompañarlo.

**Lo que muestra.** Diferencias de grupo pedidas al Simulador como d de Cohen y recuperadas por el Analizador con el protocolo que elige la prueba según los supuestos (normalidad por grupo y Levene); el post hoc con la corrección de Holm; la χ² de independencia con la V de Cramér; los niveles por percentiles; y una base con respuestas perdidas, como las reales.

## Qué se configuró en el Simulador

300 escolares con la semilla 3030 (`simulador/configuracion_completa_simulador.csv`):

| Instrumento | Escala | Ítems | Respuesta por ítem | Media pedida | DE pedida | α pedido |
| --- | --- | --- | --- | --- | --- | --- |
| IAE | Preocupación | 8 | 1 a 5 | 25 | 4.8 | 0.85 |
| IAE | Emocionalidad | 8 | 1 a 5 | 23 | 4.6 | 0.83 |

- **Diferencias de grupo:** d = −0.50 según el sexo (las mujeres puntúan más alto: la d es la del grupo de código mayor, «Hombre», frente al otro) y d = 0.30 entre cada grado y el siguiente.
- **Niveles:** la columna `Nivel_I` corta el puntaje general en Baja, Moderada y Alta por los percentiles 25 y 75.
- **Otras variables:** Sexo (52 % mujeres), Grado (3.º, 4.º y 5.º de secundaria, un tercio cada uno), Gestión del colegio (65 % pública) y Promedio de notas (media 14.2, DE 1.8, de 0 a 20), con r = −.30 con la ansiedad.
- **Imperfecciones:** 2 % de respuestas perdidas al azar (MCAR).

## Pedido vs. obtenido

El Simulador comprueba la base antes de aplicar las imperfecciones, y la última columna da el valor en la base final, con los perdidos, cuando cambia (vacía: el mismo valor) (`simulador/informe_pedido_vs_obtenido.csv`):

| Parámetro | Variable | Pedido | Obtenido | Estado | Con las imperfecciones |
| --- | --- | --- | --- | --- | --- |
| Media | Preocupación | 25.00 | 25.01 | coincide | 24.96 |
| DE | Preocupación | 4.80 | 4.78 | coincide | 4.73 |
| Media | Emocionalidad | 23.00 | 23.02 | coincide | 23.00 |
| DE | Emocionalidad | 4.60 | 4.59 | coincide | 4.62 |
| α | Preocupación | 0.85 | 0.852 | coincide |  |
| α | Emocionalidad | 0.83 | 0.829 | coincide | 0.834 |
| r | Ansiedad ante los exámenes — IAE ↔ Promedio de notas | -0.30 | -0.300 | coincide | -0.298 |
| d | Ansiedad ante los exámenes — IAE por Sexo | -0.50 | -0.49 | coincide | -0.46 |
| d | Ansiedad ante los exámenes — IAE por Grado | 0.30 | 0.30 | coincide | 0.27 |
| % | Sexo (Mujer / Hombre) | 52% / 48% | 52.0% / 48.0% | coincide |  |
| % | Grado (3.º de secundaria / 4.º de secundaria / 5.º de secundaria) | 34% / 33% / 33% | 34.0% / 33.0% / 33.0% | coincide |  |
| % | Gestión (Pública / Privada) | 65% / 35% | 65.0% / 35.0% | coincide |  |
| niveles | Nivel_I (Ansiedad ante los exámenes — IAE: Baja / Moderada / Alta) — por percentil, con empates en los cortes | 25% / 50% / 25% | 24.8% / 46.6% / 28.6% | coincide |  |

## Qué se hizo en el Analizador

1. «Usar datos generados» y, en «1. Configuración de la investigación», el título, la unidad de análisis y el lugar.
2. **El capítulo** (`analizador/1-capitulo/`): Correlación entre la ansiedad (`General_I`) y el promedio (`Promedio de notas`), «Ejecutar análisis» y las tres descargas. El capítulo de Word se redacta sobre una correlación, y sus secciones ya comparan las dos variables según el sexo, el grado y la gestión del colegio.
3. **Las comparaciones** (`analizador/2-comparacion/`): «Comparación de grupos» con la ansiedad como variable cuantitativa y Sexo como agrupación, «Ejecutar análisis»; y, en la tarjeta «Comparación entre grupos», Grado y la ansiedad, «Comparar grupos». Después, «Descargar resultados» e «Imprimir o guardar en PDF» (el PDF lleva las dos).
4. **La asociación** (`analizador/3-asociacion/`): «Asociación de dos variables categóricas (Chi²)» con `Nivel_I` y Sexo, «Ejecutar análisis», «Descargar resultados» e «Imprimir o guardar en PDF».
5. Ayuda → «Guardar proyecto».

La comparación y la asociación no tienen capítulo de Word propio: el botón «Exportar capítulo a Word» lo dice y remite a los resultados en texto y al PDF.

## Resultados

- **Correlación con el promedio:** ρ = −.33, p < .001, con los 290 casos completos (los perdidos dejan fuera a 10).
- **Según el sexo.** U de Mann-Whitney, U = 7818, z = −3.78, p < .001; tamaño del efecto r = .222 (pequeño).

| Grupo | n | Media | DE | Mediana |
| --- | --- | --- | --- | --- |
| Hombre | 142 | 23.25 | 4.00 | 23.00 |
| Mujer | 148 | 25.09 | 4.05 | 26.00 |

- **Según el grado.** Kruskal-Wallis, H(2) = 12.39, p = .002; tamaño del efecto ε² = .043 (pequeño).

| Grupo | n | Media | DE | Mediana |
| --- | --- | --- | --- | --- |
| 3.º de secundaria | 97 | 23.21 | 4.16 | 24.00 |
| 4.º de secundaria | 97 | 24.03 | 4.11 | 24.00 |
| 5.º de secundaria | 96 | 25.35 | 3.84 | 26.00 |

Comparaciones por pares, con la corrección de Holm:

| Par | Prueba | Estadístico | p | p de Holm |
| --- | --- | --- | --- | --- |
| 4.º de secundaria vs 3.º de secundaria | z de Dunn | 1.34 | .181 | .181 |
| 4.º de secundaria vs 5.º de secundaria | z de Dunn | −2.16 | .031 | .062 |
| 3.º de secundaria vs 5.º de secundaria | z de Dunn | −3.49 | < .001 | .001 |

- **Nivel de ansiedad y sexo:** χ²(2) = 12.91, p = .002, V de Cramér = .211, con n = 290.

| Nivel_I \ Sexo | Hombre | Mujer | Total |
| --- | --- | --- | --- |
| Alta | 27 | 56 | 83 |
| Baja | 42 | 30 | 72 |
| Moderada | 73 | 62 | 135 |
| Total | 142 | 148 | 290 |

Las d pedidas (−0.50 y 0.30) se recuperan: el informe del Simulador las mide en la base, y el Analizador encuentra las dos diferencias con pruebas no paramétricas, porque los totales Likert no pasan la normalidad (ver los avisos al final).

## Archivos

| Archivo | Qué es | Tamaño |
| --- | --- | --- |
| [analizador/1-capitulo/capitulo_resultados_APA.docx](analizador/1-capitulo/capitulo_resultados_APA.docx) | El capítulo de resultados en Word (APA 7) de la correlación analizada: botón «Exportar capítulo a Word». Se abre en Microsoft Word (LibreOffice y Google Docs no leen la técnica con que se arma). | 839 KB |
| [analizador/1-capitulo/resultados.pdf](analizador/1-capitulo/resultados.pdf) | La página de resultados impresa en PDF (solo los resultados, sin los controles): botón «Imprimir o guardar en PDF» del Analizador. | 1012 KB |
| [analizador/1-capitulo/resultados_analisis.txt](analizador/1-capitulo/resultados_analisis.txt) | Los resultados en texto plano: botón «Descargar resultados». | 26 KB |
| [analizador/2-comparacion/resultados.pdf](analizador/2-comparacion/resultados.pdf) | La página de resultados impresa en PDF (solo los resultados, sin los controles): botón «Imprimir o guardar en PDF» del Analizador. | 306 KB |
| [analizador/2-comparacion/resultados_analisis.txt](analizador/2-comparacion/resultados_analisis.txt) | Los resultados en texto plano: botón «Descargar resultados». | 2 KB |
| [analizador/3-asociacion/resultados.pdf](analizador/3-asociacion/resultados.pdf) | La página de resultados impresa en PDF (solo los resultados, sin los controles): botón «Imprimir o guardar en PDF» del Analizador. | 294 KB |
| [analizador/3-asociacion/resultados_analisis.txt](analizador/3-asociacion/resultados_analisis.txt) | Los resultados en texto plano: botón «Descargar resultados». | 1 KB |
| [proyecto.statsim](proyecto.statsim) | El proyecto completo (configuración y base del Simulador, datos del Analizador y lo demás que había en la página): Ayuda → «Guardar proyecto». Se abre con Ayuda → «Abrir proyecto». | 18 KB |
| [simulador/base_datos_simulada.sav](simulador/base_datos_simulada.sav) | La base en SPSS, con las etiquetas de variable y de valor y el nivel de medida: botón «SPSS (.sav)». | 14 KB |
| [simulador/base_datos_simulada.xlsx](simulador/base_datos_simulada.xlsx) | La base en Excel, con tres hojas (Datos, Diccionario e Informe): botón «Excel (.xlsx)». | 32 KB |
| [simulador/base_datos_simulada_excel_espanol.csv](simulador/base_datos_simulada_excel_espanol.csv) | La base en CSV para Excel en español (punto y coma y coma decimal): botón «CSV (Excel español)». | 27 KB |
| [simulador/base_datos_simulada_internacional.csv](simulador/base_datos_simulada_internacional.csv) | La base en CSV internacional (coma y punto decimal): botón «CSV (internacional)». | 27 KB |
| [simulador/configuracion_completa_simulador.csv](simulador/configuracion_completa_simulador.csv) | La configuración completa del Simulador (el archivo maestro), como la exporta «Exportar todo». Se abre con «Importar todo». | 2 KB |
| [simulador/informe_pedido_vs_obtenido.csv](simulador/informe_pedido_vs_obtenido.csv) | Cada parámetro pedido, medido sobre la base generada: botón «Descargar informe (CSV)». | 1 KB |
| [simulador/verificacion_de_la_base.pdf](simulador/verificacion_de_la_base.pdf) | La verificación de la base impresa en PDF (avisos, pedido vs. obtenido y resumen): botón «Imprimir o guardar en PDF» del Simulador. | 75 KB |

## Cómo reproducirlo

- **Abrirlo en la página.** En la pestaña «Ejemplos», elige este caso y pulsa «Abrir en StatSim» (o, en Ayuda, «Abrir proyecto» con `proyecto.statsim`): el Simulador vuelve con su configuración y su base (la misma, bit a bit) y el Analizador con sus datos y la configuración de la investigación. Los análisis no se guardan en el proyecto: tras abrirlo, repite los pasos 2 a 4 del Analizador. En la guía que se abre con el caso, «Hazlo por mí» (o «Hazlo todo por mí») los repite a la vista, como se hicieron aquí, y «Muéstrame» señala dónde está cada cosa.
- **Desde cero.** En el Simulador, «Importar todo» con `simulador/configuracion_completa_simulador.csv` y «Generar»: con la misma semilla sale la misma base. Después, los pasos del Analizador de arriba.
- **Comprobarlo.** `npm test` abre este proyecto con el código del momento y comprueba que regenera la misma base y que el Analizador da las cifras de `verificacion.json`. Con Playwright instalado, `node tests/navegador/ejemplos.mjs comprobar 02-comparativo` rehace el caso entero en Chromium, pulsando los botones, y lo compara con esta carpeta: byte a byte, salvo los PDF, de los que se compara su texto impreso y sus páginas (y en otra computadora, con otras fuentes, del Word se compara su texto).

## Los avisos del Simulador

Al generar, el Simulador muestra 2 avisos bajo «Generar» (están al principio de `simulador/verificacion_de_la_base.pdf`). No son errores de la configuración: anticipan cómo se comportarán los datos. El más repetido dice que el total de una escala Likert es un número entero «escalonado» y que, con más de 50 casos, la prueba de Kolmogorov-Smirnov rechazará su normalidad casi siempre aunque la forma sea normal. Por eso el Analizador termina usando pruebas no paramétricas (Spearman, Mann-Whitney, Kruskal-Wallis): es lo que pasa con datos Likert reales de ese tamaño.
