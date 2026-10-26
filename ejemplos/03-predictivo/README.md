# Caso 3 · Estudio predictivo: rendimiento académico y riesgo de deserción

> **Datos simulados.** La base de este caso la generó el Simulador de StatSim Pro con una configuración y una semilla fijas. Sirve para ver qué hace cada sección y qué archivos entrega, no es el resultado de una investigación.

**La pregunta.** ¿Cuánto explican la autoeficacia académica, la procrastinación y el apoyo social el promedio ponderado de los universitarios? ¿Y qué factores elevan el riesgo de deserción (sí o no)? Son las dos regresiones de una tesis predictiva: la lineal múltiple para un criterio continuo y la logística para uno binario.

**Lo que muestra.** Un Simulador que genera a la vez una matriz de correlaciones entre cinco variables y un desenlace binario que depende de tres de ellas (con sus razones de probabilidades); y un Analizador que ajusta las dos regresiones, con sus coeficientes estandarizados, el VIF, el pseudo-R² y los intervalos de las OR. La regresión logística acepta el desenlace tal como lo entrega el Simulador, con sus categorías «No» y «Sí».

## Qué se configuró en el Simulador

400 universitarios con la semilla 4040 (`simulador/configuracion_completa_simulador.csv`):

| Instrumento | Escala | Ítems | Respuesta por ítem | Media pedida | DE pedida | α pedido |
| --- | --- | --- | --- | --- | --- | --- |
| EAA | Autoeficacia académica | 10 | 1 a 5 | 33 | 5.5 | 0.88 |
| EPA | Procrastinación académica | 12 | 1 a 5 | 32 | 6.4 | 0.85 |
| EAS | Familia | 4 | 1 a 7 | 18 | 3.2 | 0.85 |
| EAS | Amigos | 4 | 1 a 7 | 18 | 3.2 | 0.85 |
| EAS | Otros significativos | 4 | 1 a 7 | 19 | 2.9 | 0.83 |

- **Correlaciones pedidas:** autoeficacia y promedio .45; procrastinación y promedio −.38; apoyo social y promedio .22; autoeficacia y procrastinación −.40; autoeficacia y apoyo .30; procrastinación y apoyo −.18.
- **Desenlace binario:** «Riesgo de deserción» (No/Sí, 18 % de «Sí»), con una OR de 0.55 por cada DE de autoeficacia, 1.70 por cada DE de procrastinación y 0.60 por cada DE del promedio.
- **Otras variables:** Sexo (55 % mujeres), Edad (media 20.5, DE 2, de 17 a 30) y Promedio ponderado (media 13.8, DE 1.9, de 0 a 20).

## Pedido vs. obtenido

| Parámetro | Variable | Pedido | Obtenido | Estado |
| --- | --- | --- | --- | --- |
| Media | Autoeficacia académica | 33.00 | 33.01 | coincide |
| DE | Autoeficacia académica | 5.50 | 5.51 | coincide |
| Media | Procrastinación académica | 32.00 | 32.00 | coincide |
| DE | Procrastinación académica | 6.40 | 6.41 | coincide |
| Media | Familia | 18.00 | 18.02 | coincide |
| DE | Familia | 3.20 | 3.23 | coincide |
| Media | Amigos | 18.00 | 18.00 | coincide |
| DE | Amigos | 3.20 | 3.22 | coincide |
| Media | Otros significativos | 19.00 | 19.00 | coincide |
| DE | Otros significativos | 2.90 | 2.93 | coincide |
| α | Autoeficacia académica | 0.88 | 0.891 | coincide |
| α | Procrastinación académica | 0.85 | 0.847 | coincide |
| α | Familia | 0.85 | 0.840 | coincide |
| α | Amigos | 0.85 | 0.854 | coincide |
| α | Otros significativos | 0.83 | 0.826 | coincide |
| r | Autoeficacia académica ↔ Promedio ponderado | 0.45 | 0.450 | coincide |
| r | Procrastinación académica ↔ Promedio ponderado | -0.38 | -0.380 | coincide |
| r | Apoyo social percibido — EAS ↔ Promedio ponderado | 0.22 | 0.220 | coincide |
| r | Autoeficacia académica ↔ Procrastinación académica | -0.40 | -0.400 | coincide |
| r | Autoeficacia académica ↔ Apoyo social percibido — EAS | 0.30 | 0.300 | coincide |
| r | Procrastinación académica ↔ Apoyo social percibido — EAS | -0.18 | -0.180 | coincide |
| % | Sexo (Mujer / Hombre) | 55% / 45% | 55.0% / 45.0% | coincide |
| prevalencia | Riesgo de deserción (desenlace binario) | 18.0% | 18.0% | coincide |
| OR | Riesgo de deserción ~ Autoeficacia académica (OR por DE, regresión logística) | 0.55 | 0.56 | coincide |
| OR | Riesgo de deserción ~ Procrastinación académica (OR por DE, regresión logística) | 1.70 | 1.52 | coincide |
| OR | Riesgo de deserción ~ Promedio ponderado (OR por DE, regresión logística) | 0.60 | 0.56 | coincide |

Las OR del desenlace son lo que más se aparta de lo pedido (la de procrastinación académica salió en 1.52 frente a 1.70): con 400 casos y un 18 % de «Sí», su error muestral es grande, y el informe da por buena una OR que queda a menos de 2.5 errores estándar de la pedida.

## Qué se hizo en el Analizador

1. «Usar datos generados» y, en «1. Configuración de la investigación», el título, la unidad de análisis y el lugar.
2. **La regresión lineal múltiple** (`analizador/1-regresion-multiple/`): Correlación entre la autoeficacia (`General_AA`) y el promedio (`Promedio ponderado`); en «Regresión», el promedio como variable dependiente y la autoeficacia como predictor; con «＋ Agregar predictor», la procrastinación (`General_PA`) y el apoyo social (`General_EA`). «Ejecutar análisis» y las tres descargas: el capítulo de Word lleva la regresión múltiple.
3. **La regresión logística** (`analizador/2-regresion-logistica/`): Correlación entre la procrastinación y el promedio; en «Regresión», «Riesgo de deserción» como variable dependiente (aparece como «dos categorías: No = 0, Sí = 1») y como predictores la autoeficacia, la procrastinación y el promedio. «Ejecutar análisis» y las tres descargas.
4. Ayuda → «Guardar proyecto».

## Resultados

- **Correlaciones de partida:** autoeficacia y promedio, ρ = .43, p < .001; procrastinación y promedio, ρ = −.38, p < .001.
- **Regresión lineal múltiple del promedio** (n = 400): R² = .255 (R² ajustado = .250), F(3, 396) = 45.28, p < .001.

| Término | B | β | p | IC 95 % (B) | VIF |
| --- | --- | --- | --- | --- | --- |
| (Constante) | 11.133 | — | < .001 | [9.211, 13.055] | — |
| Autoeficacia académica | 0.115 | .33 | < .001 | [0.082, 0.149] | 1.27 |
| Procrastinación académica | −0.069 | −.23 | < .001 | [−0.097, −0.041] | 1.20 |
| Apoyo social percibido — EAS | 0.058 | .08 | .088 | [−0.009, 0.125] | 1.10 |

- **Regresión logística del riesgo de deserción** (n = 400; se modela la probabilidad de «Sí» frente a «No»): pseudo-R² de McFadden = .180.

| Término | B | p | OR | IC 95 % (OR) |
| --- | --- | --- | --- | --- |
| (Constante) | 3.649 | .040 | 38.445 | [1.177, 1255.479] |
| Autoeficacia académica | −0.106 | < .001 | 0.899 | [0.844, 0.957] |
| Procrastinación académica | 0.066 | .012 | 1.068 | [1.015, 1.124] |
| Promedio ponderado (sociodemográfica continua, 0–20) | −0.302 | < .001 | 0.739 | [0.622, 0.879] |

Las OR de la tabla son por punto de cada escala; las del Simulador se pidieron por desviación estándar. Con la DE de la autoeficacia (5.5), una OR de 0.899 por punto equivale a 0.56 por DE, cerca de la pedida (0.55): el informe del Simulador las compara en su escala.

## Archivos

| Archivo | Qué es | Tamaño |
| --- | --- | --- |
| [analizador/1-regresion-multiple/capitulo_resultados_APA.docx](analizador/1-regresion-multiple/capitulo_resultados_APA.docx) | El capítulo de resultados en Word (APA 7) de la correlación analizada: botón «Exportar capítulo a Word». Se abre en Microsoft Word (LibreOffice y Google Docs no leen la técnica con que se arma). | 874 KB |
| [analizador/1-regresion-multiple/resultados.pdf](analizador/1-regresion-multiple/resultados.pdf) | La página de resultados impresa en PDF (solo los resultados, sin los controles): botón «Imprimir o guardar en PDF» del Analizador. | 1.2 MB |
| [analizador/1-regresion-multiple/resultados_analisis.txt](analizador/1-regresion-multiple/resultados_analisis.txt) | Los resultados en texto plano: botón «Descargar resultados». | 32 KB |
| [analizador/2-regresion-logistica/capitulo_resultados_APA.docx](analizador/2-regresion-logistica/capitulo_resultados_APA.docx) | El capítulo de resultados en Word (APA 7) de la correlación analizada: botón «Exportar capítulo a Word». Se abre en Microsoft Word (LibreOffice y Google Docs no leen la técnica con que se arma). | 882 KB |
| [analizador/2-regresion-logistica/resultados.pdf](analizador/2-regresion-logistica/resultados.pdf) | La página de resultados impresa en PDF (solo los resultados, sin los controles): botón «Imprimir o guardar en PDF» del Analizador. | 1.2 MB |
| [analizador/2-regresion-logistica/resultados_analisis.txt](analizador/2-regresion-logistica/resultados_analisis.txt) | Los resultados en texto plano: botón «Descargar resultados». | 29 KB |
| [proyecto.statsim](proyecto.statsim) | El proyecto completo (configuración y base del Simulador, datos del Analizador y lo demás que había en la página): Ayuda → «Guardar proyecto». Se abre con Ayuda → «Abrir proyecto». | 32 KB |
| [simulador/base_datos_simulada.sav](simulador/base_datos_simulada.sav) | La base en SPSS, con las etiquetas de variable y de valor y el nivel de medida: botón «SPSS (.sav)». | 28 KB |
| [simulador/base_datos_simulada.xlsx](simulador/base_datos_simulada.xlsx) | La base en Excel, con tres hojas (Datos, Diccionario e Informe): botón «Excel (.xlsx)». | 64 KB |
| [simulador/base_datos_simulada_excel_espanol.csv](simulador/base_datos_simulada_excel_espanol.csv) | La base en CSV para Excel en español (punto y coma y coma decimal): botón «CSV (Excel español)». | 43 KB |
| [simulador/base_datos_simulada_internacional.csv](simulador/base_datos_simulada_internacional.csv) | La base en CSV internacional (coma y punto decimal): botón «CSV (internacional)». | 43 KB |
| [simulador/configuracion_completa_simulador.csv](simulador/configuracion_completa_simulador.csv) | La configuración completa del Simulador (el archivo maestro), como la exporta «Exportar todo». Se abre con «Importar todo». | 3 KB |
| [simulador/informe_pedido_vs_obtenido.csv](simulador/informe_pedido_vs_obtenido.csv) | Cada parámetro pedido, medido sobre la base generada: botón «Descargar informe (CSV)». | 2 KB |
| [simulador/verificacion_de_la_base.pdf](simulador/verificacion_de_la_base.pdf) | La verificación de la base impresa en PDF (avisos, pedido vs. obtenido y resumen): botón «Imprimir o guardar en PDF» del Simulador. | 77 KB |

## Cómo reproducirlo

- **Abrirlo en la página.** En la pestaña «Ejemplos», elige este caso y pulsa «Abrir en StatSim» (o, en Ayuda, «Abrir proyecto» con `proyecto.statsim`): el Simulador vuelve con su configuración y su base (la misma, bit a bit) y el Analizador con sus datos y la configuración de la investigación. Los análisis no se guardan en el proyecto: tras abrirlo, repite los pasos 2 y 3 del Analizador. En la guía que se abre con el caso, «Hazlo por mí» (o «Hazlo todo por mí») los repite a la vista, como se hicieron aquí, y «Muéstrame» señala dónde está cada cosa.
- **Desde cero.** En el Simulador, «Importar todo» con `simulador/configuracion_completa_simulador.csv` y «Generar»: con la misma semilla sale la misma base. Después, los pasos del Analizador de arriba.
- **Comprobarlo.** `npm test` abre este proyecto con el código del momento y comprueba que regenera la misma base y que el Analizador da las cifras de `verificacion.json`. Con Playwright instalado, `node tests/navegador/ejemplos.mjs comprobar 03-predictivo` rehace el caso entero en Chromium, pulsando los botones, y lo compara con esta carpeta: byte a byte, salvo los PDF, de los que se compara su texto impreso y sus páginas (y en otra computadora, con otras fuentes, del Word se compara su texto).

## Los avisos del Simulador

Al generar, el Simulador muestra 5 avisos bajo «Generar» (están al principio de `simulador/verificacion_de_la_base.pdf`). No son errores de la configuración: anticipan cómo se comportarán los datos. El más repetido dice que el total de una escala Likert es un número entero «escalonado» y que, con más de 50 casos, la prueba de Kolmogorov-Smirnov rechazará su normalidad casi siempre aunque la forma sea normal. Por eso el Analizador termina usando pruebas no paramétricas (Spearman, Mann-Whitney, Kruskal-Wallis): es lo que pasa con datos Likert reales de ese tamaño.
