# Caso 4 · Estudio instrumental: una escala de procrastinación académica

> **Datos simulados.** La base de este caso la generó el Simulador de StatSim Pro con una configuración y una semilla fijas. Sirve para ver qué hace cada sección y qué archivos entrega, no es el resultado de una investigación.

**La pregunta.** ¿Mide bien una escala de procrastinación académica de 15 ítems y tres dimensiones (postergación, distracción y desorganización)? Es la tesis instrumental o psicométrica: validez de contenido por jueces, estructura interna, invarianza entre grupos, fiabilidad y relación con otra variable.

**Lo que muestra.** Las tarjetas de psicometría del Analizador una tras otra, cada una con su Word: la V de Aiken con su intervalo y la decisión por el límite inferior; el AFE con correlaciones policóricas, análisis paralelo y rotación oblimin; el AFC por WLSMV, con un modelo rival; la invarianza de medición según el sexo; y la fiabilidad (α, ω y sus versiones ordinales) con la validez convergente en el capítulo.

## Qué se configuró en el Simulador

450 universitarios con la semilla 5050 (`simulador/configuracion_completa_simulador.csv`):

| Instrumento | Escala | Ítems | Respuesta por ítem | Media pedida | DE pedida | α pedido |
| --- | --- | --- | --- | --- | --- | --- |
| EPA | Postergación | 5 | 1 a 5 | 15 | 3 | 0.82 |
| EPA | Distracción | 5 | 1 a 5 | 14 | 2.9 | 0.8 |
| EPA | Desorganización | 5 | 1 a 5 | 14 | 2.8 | 0.78 |
| EAA | Autoeficacia académica | 8 | 1 a 5 | 26 | 4.5 | 0.86 |

- Las tres dimensiones de la escala se correlacionan entre sí (r ≈ .45); su puntaje total, con la autoeficacia académica, r = −.40.
- Sociodemográficas: Sexo (50 % mujeres, para la invarianza) y Edad (media 20.8, DE 2.2, de 17 a 30).
- Las valoraciones de los 7 jueces no salen del Simulador: son tres archivos de entrada (`analizador/1-validez-de-contenido/valoraciones_*.csv`), uno por criterio. Casi todas las valoraciones son altas (4, a veces 3) y tres ítems se pusieron a propósito en duda (D3 en claridad, P2 en coherencia y DE4 en relevancia); con 7 jueces basta que uno o dos den un 3 para que un ítem quede «por revisar», así que en los resultados hay más que esos tres.

## Pedido vs. obtenido

| Parámetro | Variable | Pedido | Obtenido | Estado |
| --- | --- | --- | --- | --- |
| Media | Postergación | 15.00 | 15.00 | coincide |
| DE | Postergación | 3.00 | 3.00 | coincide |
| Media | Distracción | 14.00 | 13.98 | coincide |
| DE | Distracción | 2.90 | 2.94 | coincide |
| Media | Desorganización | 14.00 | 13.99 | coincide |
| DE | Desorganización | 2.80 | 2.81 | coincide |
| Media | Autoeficacia académica | 26.00 | 25.98 | coincide |
| DE | Autoeficacia académica | 4.50 | 4.49 | coincide |
| α | Postergación | 0.82 | 0.812 | coincide |
| α | Distracción | 0.80 | 0.820 | coincide |
| α | Desorganización | 0.78 | 0.783 | coincide |
| α | Autoeficacia académica | 0.86 | 0.853 | coincide |
| r | Procrastinación académica — EPA ↔ Autoeficacia académica | -0.40 | -0.401 | coincide |
| % | Sexo (Mujer / Hombre) | 50% / 50% | 50.0% / 50.0% | coincide |

## Qué se hizo en el Analizador

1. «Usar datos generados» y, en «1. Configuración de la investigación», el título, la unidad de análisis y el lugar.
2. **«3. Validez de contenido por juicio de expertos (V de Aiken)»**: escala de 1 a 4, IC del 95 %, criterio V₀ = .70; tres criterios (Claridad, Coherencia y Relevancia), cada uno con «Cargar CSV»; «Calcular V de Aiken» y sus descargas (`analizador/1-validez-de-contenido/`).
3. **«4. Análisis factorial exploratorio (AFE)»**: «Escala total (EPA)», correlación automática (policórica), factores por análisis paralelo (200 réplicas, semilla 2026), rotación oblimin; «Calcular AFE» y sus descargas (`analizador/2-afe/`).
4. **SEM (AFC)**: el modelo de un factor como «Modelo alternativo» y el de tres como «Modelo final», los dos con WLSMV; «¿Es adecuado usar SEM aquí?» y «Ajustar modelo» en cada uno.
5. **«6. Invarianza de medición»**: el modelo de tres factores, agrupación Sexo, WLSMV; «Evaluar la invarianza» y su Word (`analizador/3-invarianza/`).
6. **Fiabilidad y validez convergente**: Correlación entre la escala (`General_E`) y la autoeficacia (`General_AA`), «Ejecutar análisis» y las tres descargas (`analizador/4-capitulo/`). El PDF de esta carpeta lleva todas las tarjetas anteriores con sus resultados, y el capítulo de Word, el AFC.
7. Ayuda → «Guardar proyecto»: el proyecto guarda también las valoraciones de los jueces.

## Resultados

**Validez de contenido.** De los 15 ítems, 7 son válidos, 6 quedan por revisar y 2 no son válidos (D3 y DE4), con la decisión más exigente de los tres criterios. Un ítem es válido si el límite inferior del IC de su V alcanza .70: con 7 jueces, una V alta no basta.

| Ítem | Claridad: V (decisión) | Coherencia: V (decisión) | Relevancia: V (decisión) | Decisión global |
| --- | --- | --- | --- | --- |
| P1 | 1.00 (Válido) | .95 (Válido) | .90 (Válido) | Válido |
| P2 | .90 (Válido) | .81 (Revisar) | 1.00 (Válido) | Revisar |
| P3 | 1.00 (Válido) | .95 (Válido) | .95 (Válido) | Válido |
| P4 | 1.00 (Válido) | .90 (Válido) | .95 (Válido) | Válido |
| P5 | .90 (Válido) | .90 (Válido) | .90 (Válido) | Válido |
| D1 | 1.00 (Válido) | .90 (Válido) | .90 (Válido) | Válido |
| D2 | .95 (Válido) | .90 (Válido) | .76 (Revisar) | Revisar |
| D3 | .43 (No válido) | .86 (Revisar) | 1.00 (Válido) | No válido |
| D4 | .95 (Válido) | .86 (Revisar) | .76 (Revisar) | Revisar |
| D5 | .95 (Válido) | .86 (Revisar) | .95 (Válido) | Revisar |
| DE1 | 1.00 (Válido) | .90 (Válido) | .95 (Válido) | Válido |
| DE2 | .90 (Válido) | .86 (Revisar) | .95 (Válido) | Revisar |
| DE3 | .95 (Válido) | 1.00 (Válido) | .81 (Revisar) | Revisar |
| DE4 | .90 (Válido) | .95 (Válido) | .48 (No válido) | No válido |
| DE5 | .90 (Válido) | 1.00 (Válido) | 1.00 (Válido) | Válido |

**Estructura interna exploratoria.** KMO = .91 (excelente) y Bartlett χ²(105) = 3148.47, p < .001. El análisis paralelo retiene 3 factores (Kaiser, 3), que explican el 54.73 % de la varianza; las cargas principales van de .51 a .90, y cada ítem carga en su dimensión. Ítems a revisar: DE3: comunalidad < .30.

**Estructura interna confirmatoria (WLSMV).**

| Modelo | χ² (gl) | CFI | RMSEA |
| --- | --- | --- | --- |
| Un factor | 914.71 (90) | .805 | .143 |
| Tres factores | 125.13 (87) | .991 | .031 |

El modelo de tres factores se ajusta bien y el de un factor, no: la escala es multidimensional, como se diseñó.

**Invarianza según el sexo.**

| Modelo | χ² | gl | p | CFI | TLI | RMSEA | IC 90 % | SRMR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Configural | 209.93 | 174 | .033 | .992 | .990 | .030 | [.009, .044] | .055 |
| Umbrales | 234.92 | 199 | .041 | .992 | .991 | .028 | [.006, .042] | .055 |
| Métrica (umbrales y cargas) | 236.69 | 211 | .108 | .994 | .994 | .023 | [.000, .038] | .056 |
| Escalar (umbrales, cargas e interceptos) | 246.85 | 223 | .131 | .994 | .995 | .022 | [.000, .036] | .056 |

| Comparación | Δχ² | Δgl | p | ΔCFI | ΔRMSEA | ΔSRMR | Decisión |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Umbrales vs. configural | 26.07 | 25 | .404 | .000 | −.002 | .000 | Se sostiene |
| Métrica vs. umbrales | 8.28 | 12 | .763 | .002 | −.005 | .001 | Se sostiene |
| Escalar vs. métrica | 10.16 | 12 | .602 | .000 | −.001 | .000 | Se sostiene |

**Fiabilidad.**

| Escala | Ítems | ω total | ω jerárquico | α | Interpretación |
| --- | --- | --- | --- | --- | --- |
| Postergación (EPA) | 5 | 0.821 | — | 0.812 | buena (ω) |
| Distracción (EPA) | 5 | 0.837 | — | 0.820 | buena (ω) |
| Desorganización (EPA) | 5 | 0.799 | — | 0.783 | aceptable (ω) |
| Autoeficacia académica (EAA) | 8 | 0.859 | — | 0.853 | buena (ω) |
| Escala total (EPA) | 15 | 0.875 | 0.714 | 0.871 | buena (ω) |

**Validez convergente.** La escala se relaciona con la autoeficacia académica: ρ = −.40, p < .001 (n = 450).

## Archivos

| Archivo | Qué es | Tamaño |
| --- | --- | --- |
| [analizador/1-validez-de-contenido/validez_contenido_aiken.csv](analizador/1-validez-de-contenido/validez_contenido_aiken.csv) | La V de Aiken de cada ítem en cada criterio, con su intervalo, su p y su decisión: botón «CSV» de la tarjeta. | 3 KB |
| [analizador/1-validez-de-contenido/validez_contenido_aiken.docx](analizador/1-validez-de-contenido/validez_contenido_aiken.docx) | La validez de contenido redactada en APA, con sus tablas: botón «Word» de la tarjeta. | 31 KB |
| [analizador/1-validez-de-contenido/valoraciones_claridad.csv](analizador/1-validez-de-contenido/valoraciones_claridad.csv) | Una entrada: las valoraciones de los 7 jueces a los 15 ítems en un criterio (las que se cargan con «Cargar CSV»). | 1 KB |
| [analizador/1-validez-de-contenido/valoraciones_coherencia.csv](analizador/1-validez-de-contenido/valoraciones_coherencia.csv) | Una entrada: las valoraciones de los 7 jueces a los 15 ítems en un criterio (las que se cargan con «Cargar CSV»). | 1 KB |
| [analizador/1-validez-de-contenido/valoraciones_relevancia.csv](analizador/1-validez-de-contenido/valoraciones_relevancia.csv) | Una entrada: las valoraciones de los 7 jueces a los 15 ítems en un criterio (las que se cargan con «Cargar CSV»). | 1 KB |
| [analizador/2-afe/afe_APA.docx](analizador/2-afe/afe_APA.docx) | El AFE redactado en APA, con sus tablas: botón «Word» del AFE. | 17 KB |
| [analizador/2-afe/afe_cargas.csv](analizador/2-afe/afe_cargas.csv) | Las cargas factoriales, las comunalidades y la MSA de cada ítem: botón «CSV» del AFE. | 1 KB |
| [analizador/3-invarianza/invarianza_APA.docx](analizador/3-invarianza/invarianza_APA.docx) | La invarianza de medición redactada en APA, con sus tablas: botón «Word» de la tarjeta. | 20 KB |
| [analizador/4-capitulo/capitulo_resultados_APA.docx](analizador/4-capitulo/capitulo_resultados_APA.docx) | El capítulo de resultados en Word (APA 7) de la correlación analizada: botón «Exportar capítulo a Word». Se abre en Microsoft Word (LibreOffice y Google Docs no leen la técnica con que se arma). | 936 KB |
| [analizador/4-capitulo/resultados.pdf](analizador/4-capitulo/resultados.pdf) | La página de resultados impresa en PDF (solo los resultados, sin los controles): botón «Imprimir o guardar en PDF» del Analizador. | 1.4 MB |
| [analizador/4-capitulo/resultados_analisis.txt](analizador/4-capitulo/resultados_analisis.txt) | Los resultados en texto plano: botón «Descargar resultados». | 25 KB |
| [proyecto.statsim](proyecto.statsim) | El proyecto completo (configuración y base del Simulador, datos del Analizador y lo demás que había en la página): Ayuda → «Guardar proyecto». Se abre con Ayuda → «Abrir proyecto». | 24 KB |
| [simulador/base_datos_simulada.sav](simulador/base_datos_simulada.sav) | La base en SPSS, con las etiquetas de variable y de valor y el nivel de medida: botón «SPSS (.sav)». | 19 KB |
| [simulador/base_datos_simulada.xlsx](simulador/base_datos_simulada.xlsx) | La base en Excel, con tres hojas (Datos, Diccionario e Informe): botón «Excel (.xlsx)». | 49 KB |
| [simulador/base_datos_simulada_excel_espanol.csv](simulador/base_datos_simulada_excel_espanol.csv) | La base en CSV para Excel en español (punto y coma y coma decimal): botón «CSV (Excel español)». | 33 KB |
| [simulador/base_datos_simulada_internacional.csv](simulador/base_datos_simulada_internacional.csv) | La base en CSV internacional (coma y punto decimal): botón «CSV (internacional)». | 33 KB |
| [simulador/configuracion_completa_simulador.csv](simulador/configuracion_completa_simulador.csv) | La configuración completa del Simulador (el archivo maestro), como la exporta «Exportar todo». Se abre con «Importar todo». | 2 KB |
| [simulador/informe_pedido_vs_obtenido.csv](simulador/informe_pedido_vs_obtenido.csv) | Cada parámetro pedido, medido sobre la base generada: botón «Descargar informe (CSV)». | 1 KB |
| [simulador/verificacion_de_la_base.pdf](simulador/verificacion_de_la_base.pdf) | La verificación de la base impresa en PDF (avisos, pedido vs. obtenido y resumen): botón «Imprimir o guardar en PDF» del Simulador. | 71 KB |

## Cómo reproducirlo

- **Abrirlo en la página.** En la pestaña «Ejemplos», elige este caso y pulsa «Abrir en StatSim» (o, en Ayuda, «Abrir proyecto» con `proyecto.statsim`): el Simulador vuelve con su configuración y su base (la misma, bit a bit) y el Analizador con sus datos y la configuración de la investigación. Los análisis no se guardan en el proyecto: tras abrirlo, repite los pasos 2 a 6 del Analizador (la V de Aiken vuelve con sus valoraciones: en el paso 2 basta con «Calcular V de Aiken»). En la guía que se abre con el caso, «Hazlo por mí» (o «Hazlo todo por mí») los repite a la vista, como se hicieron aquí, y «Muéstrame» señala dónde está cada cosa.
- **Desde cero.** En el Simulador, «Importar todo» con `simulador/configuracion_completa_simulador.csv` y «Generar»: con la misma semilla sale la misma base. Después, los pasos del Analizador de arriba.
- **Comprobarlo.** `npm test` abre este proyecto con el código del momento y comprueba que regenera la misma base y que el Analizador da las cifras de `verificacion.json`. Con Playwright instalado, `node tests/navegador/ejemplos.mjs comprobar 04-instrumental` rehace el caso entero en Chromium, pulsando los botones, y lo compara con esta carpeta: byte a byte, salvo los PDF, de los que se compara su texto impreso y sus páginas (y en otra computadora, con otras fuentes, del Word se compara su texto).

## Los avisos del Simulador

Al generar, el Simulador muestra 4 avisos bajo «Generar» (están al principio de `simulador/verificacion_de_la_base.pdf`). No son errores de la configuración: anticipan cómo se comportarán los datos. El más repetido dice que el total de una escala Likert es un número entero «escalonado» y que, con más de 50 casos, la prueba de Kolmogorov-Smirnov rechazará su normalidad casi siempre aunque la forma sea normal. Por eso el Analizador termina usando pruebas no paramétricas (Spearman, Mann-Whitney, Kruskal-Wallis): es lo que pasa con datos Likert reales de ese tamaño.
