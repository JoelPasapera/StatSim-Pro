# Caso 5 · Modelo de ecuaciones estructurales: apoyo social, autoeficacia y engagement

> **Datos simulados.** La base de este caso la generó el Simulador de StatSim Pro con una configuración y una semilla fijas. Sirve para ver qué hace cada sección y qué archivos entrega, no es el resultado de una investigación.

**La pregunta.** ¿El apoyo social percibido favorece el engagement académico a través de la autoeficacia? Es la hipótesis de mediación que suele ponerse a prueba con un modelo de ecuaciones estructurales: tres variables latentes medidas por sus ítems y los caminos entre ellas, frente a un modelo rival.

**Lo que muestra.** El Simulador genera la mediación pedida (los caminos a, b y c′) y su informe mide incluso el efecto indirecto; el Analizador ajusta los dos modelos estructurales por WLSMV (los ítems son ordinales), da el ajuste global con la lectura de cada índice, la validez convergente y discriminante, los caminos estandarizados y el diagrama, y los compara.

## Qué se configuró en el Simulador

380 universitarios con la semilla 6060 (`simulador/configuracion_completa_simulador.csv`):

| Instrumento | Escala | Ítems | Respuesta por ítem | Media pedida | DE pedida | α pedido |
| --- | --- | --- | --- | --- | --- | --- |
| EAS | Apoyo social percibido | 6 | 1 a 7 | 27 | 4.8 | 0.88 |
| EAA | Autoeficacia académica | 6 | 1 a 5 | 20 | 3.3 | 0.85 |
| UWES | Engagement académico | 6 | 0 a 6 | 22 | 4.4 | 0.9 |

- **Mediación:** apoyo social → autoeficacia (a = .40), autoeficacia → engagement controlando el apoyo (b = .45) y apoyo → engagement directo (c′ = .15). El efecto indirecto esperado es a·b = .18.
- Sociodemográficas: Sexo (58 % mujeres) y Edad (media 21, DE 2.2, de 17 a 30).

## Pedido vs. obtenido

| Parámetro | Variable | Pedido | Obtenido | Estado |
| --- | --- | --- | --- | --- |
| Media | Apoyo social percibido | 27.00 | 27.02 | coincide |
| DE | Apoyo social percibido | 4.80 | 4.80 | coincide |
| Media | Autoeficacia académica | 20.00 | 19.98 | coincide |
| DE | Autoeficacia académica | 3.30 | 3.29 | coincide |
| Media | Engagement académico | 22.00 | 22.01 | coincide |
| DE | Engagement académico | 4.40 | 4.42 | coincide |
| α | Apoyo social percibido | 0.88 | 0.876 | coincide |
| α | Autoeficacia académica | 0.85 | 0.850 | coincide |
| α | Engagement académico | 0.90 | 0.892 | coincide |
| a | Mediación Apoyo social percibido → Autoeficacia académica → Engagement académico: a (Apoyo social percibido → Autoeficacia académica) | 0.40 | 0.400 | coincide |
| b | Mediación Apoyo social percibido → Autoeficacia académica → Engagement académico: b (Autoeficacia académica → Engagement académico, con Apoyo social percibido) | 0.45 | 0.450 | coincide |
| a·b | Mediación Apoyo social percibido → Autoeficacia académica → Engagement académico: efecto indirecto vía Autoeficacia académica | 0.180 | 0.180 | coincide |
| c′ | Mediación Apoyo social percibido → Autoeficacia académica → Engagement académico: c′ (Apoyo social percibido → Engagement académico directo) | 0.15 | 0.150 | coincide |
| % | Sexo (Mujer / Hombre) | 58% / 42% | 57.9% / 42.1% | coincide |

## Qué se hizo en el Analizador

1. «Usar datos generados» y, en «1. Configuración de la investigación», el título, la unidad de análisis y el lugar.
2. **SEM**, dos veces, con el estimador WLSMV: primero el rival (mediación completa, sin el camino directo) como «Modelo alternativo» y después la hipótesis (mediación parcial) como «Modelo final»; en cada uno, «¿Es adecuado usar SEM aquí?» y «Ajustar modelo». Los modelos, en la sintaxis de la tarjeta:

   ```
   Apoyo =~ ASP1 + ASP2 + ASP3 + ASP4 + ASP5 + ASP6
   Autoeficacia =~ AA1 + AA2 + AA3 + AA4 + AA5 + AA6
   Engagement =~ EA1 + EA2 + EA3 + EA4 + EA5 + EA6
   Autoeficacia ~ Apoyo
   Engagement ~ Autoeficacia + Apoyo
   ```

   El rival es el mismo sin «+ Apoyo» en la última línea.
3. **El capítulo** (`analizador/1-capitulo/`): Correlación entre el apoyo social (`General_ASP`) y el engagement (`General_EA`), con la regresión del engagement en el apoyo y la autoeficacia (`General_AA`); «Ejecutar análisis» y las tres descargas. El capítulo de Word lleva la comparación de los modelos estructurales y el diagrama de rutas, y el PDF, la tarjeta del SEM completa.
4. Ayuda → «Guardar proyecto».

## Resultados

**Ajuste de los modelos (WLSMV).**

| Modelo | χ² (gl) | CFI | RMSEA |
| --- | --- | --- | --- |
| Mediación completa (rival) | 176.30 (133) | .993 | .029 |
| Mediación parcial (hipótesis) | 150.78 (132) | .997 | .019 |

Al quitar el camino directo, el CFI baja .004 y el RMSEA sube .010: el modelo rival se ajusta algo peor, y el camino directo es significativo en el de la hipótesis.

**Caminos estructurales del modelo de la hipótesis** (estandarizados):

| Camino | Estandarizado | p |
| --- | --- | --- |
| Autoeficacia ~ Apoyo | 0.46 | < .001 |
| Engagement ~ Autoeficacia | 0.52 | < .001 |
| Engagement ~ Apoyo | 0.13 | .016 |

Las cargas de los 18 ítems van de .63 a .91.

| Factor | AVE | Fiabilidad compuesta |
| --- | --- | --- |
| Apoyo | .60 | .90 |
| Autoeficacia | .58 | .89 |
| Engagement | .66 | .92 |

**Regresión de los puntajes observados** (n = 380): R² = .279, F(2, 377) = 72.88, p < .001; la correlación del apoyo con el engagement es ρ = .33 (p < .001).

| Término | B | β | p |
| --- | --- | --- | --- |
| (Constante) | 6.211 | — | < .001 |
| Apoyo social percibido | 0.138 | .15 | .002 |
| Autoeficacia académica | 0.604 | .45 | < .001 |

**Lo que la aplicación no calcula todavía.** El Analizador estima los caminos directos, pero no el efecto indirecto (a·b) ni su intervalo por bootstrap, que es la prueba de la mediación. Aquí puede verse en el informe del Simulador (la fila «a·b», el pedido y el obtenido en la base), no en el Analizador.

## Archivos

| Archivo | Qué es | Tamaño |
| --- | --- | --- |
| [analizador/1-capitulo/capitulo_resultados_APA.docx](analizador/1-capitulo/capitulo_resultados_APA.docx) | El capítulo de resultados en Word (APA 7) de la correlación analizada: botón «Exportar capítulo a Word». Se abre en Microsoft Word (LibreOffice y Google Docs no leen la técnica con que se arma). | 767 KB |
| [analizador/1-capitulo/resultados.pdf](analizador/1-capitulo/resultados.pdf) | La página de resultados impresa en PDF (solo los resultados, sin los controles): botón «Imprimir o guardar en PDF» del Analizador. | 1.2 MB |
| [analizador/1-capitulo/resultados_analisis.txt](analizador/1-capitulo/resultados_analisis.txt) | Los resultados en texto plano: botón «Descargar resultados». | 28 KB |
| [proyecto.statsim](proyecto.statsim) | El proyecto completo (configuración y base del Simulador, datos del Analizador y lo demás que había en la página): Ayuda → «Guardar proyecto». Se abre con Ayuda → «Abrir proyecto». | 18 KB |
| [simulador/base_datos_simulada.sav](simulador/base_datos_simulada.sav) | La base en SPSS, con las etiquetas de variable y de valor y el nivel de medida: botón «SPSS (.sav)». | 14 KB |
| [simulador/base_datos_simulada.xlsx](simulador/base_datos_simulada.xlsx) | La base en Excel, con tres hojas (Datos, Diccionario e Informe): botón «Excel (.xlsx)». | 35 KB |
| [simulador/base_datos_simulada_excel_espanol.csv](simulador/base_datos_simulada_excel_espanol.csv) | La base en CSV para Excel en español (punto y coma y coma decimal): botón «CSV (Excel español)». | 22 KB |
| [simulador/base_datos_simulada_internacional.csv](simulador/base_datos_simulada_internacional.csv) | La base en CSV internacional (coma y punto decimal): botón «CSV (internacional)». | 22 KB |
| [simulador/configuracion_completa_simulador.csv](simulador/configuracion_completa_simulador.csv) | La configuración completa del Simulador (el archivo maestro), como la exporta «Exportar todo». Se abre con «Importar todo». | 2 KB |
| [simulador/informe_pedido_vs_obtenido.csv](simulador/informe_pedido_vs_obtenido.csv) | Cada parámetro pedido, medido sobre la base generada: botón «Descargar informe (CSV)». | 1 KB |
| [simulador/verificacion_de_la_base.pdf](simulador/verificacion_de_la_base.pdf) | La verificación de la base impresa en PDF (avisos, pedido vs. obtenido y resumen): botón «Imprimir o guardar en PDF» del Simulador. | 76 KB |

## Cómo reproducirlo

- **Abrir el proyecto.** En Ayuda, «Abrir proyecto» y elige `proyecto.statsim`: el Simulador vuelve con su configuración y su base (la misma, bit a bit) y el Analizador con sus datos. Los análisis no se guardan en el proyecto: tras abrirlo, repite los pasos 2 y 3 del Analizador.
- **Desde cero.** En el Simulador, «Importar todo» con `simulador/configuracion_completa_simulador.csv` y «Generar»: con la misma semilla sale la misma base. Después, los pasos del Analizador de arriba.
- **Comprobarlo.** `npm test` abre este proyecto con el código del momento y comprueba que regenera la misma base y que el Analizador da las cifras de `verificacion.json`. Con Playwright instalado, `node tests/navegador/ejemplos.mjs comprobar 05-estructural` rehace el caso entero en Chromium, pulsando los botones, y lo compara con esta carpeta: byte a byte, salvo los PDF, de los que se compara su texto impreso y sus páginas (y en otra computadora, con otras fuentes, del Word se compara su texto).

## Los avisos del Simulador

Al generar, el Simulador muestra 3 avisos bajo «Generar» (están al principio de `simulador/verificacion_de_la_base.pdf`). No son errores de la configuración: anticipan cómo se comportarán los datos. El más repetido dice que el total de una escala Likert es un número entero «escalonado» y que, con más de 50 casos, la prueba de Kolmogorov-Smirnov rechazará su normalidad casi siempre aunque la forma sea normal. Por eso el Analizador termina usando pruebas no paramétricas (Spearman, Mann-Whitney, Kruskal-Wallis): es lo que pasa con datos Likert reales de ese tamaño.
