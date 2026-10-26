# Caso 1 · Estudio correlacional: estrés académico y bienestar psicológico

> **Datos simulados.** La base de este caso la generó el Simulador de StatSim Pro con una configuración y una semilla fijas. Sirve para ver qué hace cada sección y qué archivos entrega, no es el resultado de una investigación.

**La pregunta.** ¿Se relaciona el estrés académico con el bienestar psicológico en estudiantes universitarios? Es el diseño más frecuente en las tesis de psicología: correlacional, transversal, con dos instrumentos de varias dimensiones y unos objetivos específicos que relacionan cada dimensión con la otra variable.

**Lo que muestra.** El recorrido completo de un estudio correlacional: el Simulador genera la base pedida y comprueba que la entrega; el Analizador elige la prueba según la normalidad, propone los objetivos específicos a partir de los datos, corrige sus p por Holm y redacta el capítulo de resultados.

## Qué se configuró en el Simulador

320 casos con la semilla 2027 (`simulador/configuracion_completa_simulador.csv`):

| Instrumento | Escala | Ítems | Respuesta por ítem | Media pedida | DE pedida | α pedido |
| --- | --- | --- | --- | --- | --- | --- |
| EEA | Estresores | 8 | 1 a 5 | 25 | 4.6 | 0.84 |
| EEA | Reacciones físicas | 6 | 1 a 5 | 16 | 3.2 | 0.8 |
| EEA | Reacciones psicológicas | 6 | 1 a 5 | 17 | 3.4 | 0.82 |
| EBP | Autoaceptación | 6 | 1 a 6 | 24 | 3.8 | 0.81 |
| EBP | Vínculos positivos | 6 | 1 a 6 | 23 | 4 | 0.8 |
| EBP | Propósito vital | 6 | 1 a 6 | 25 | 3.6 | 0.83 |

- Las dimensiones de cada instrumento se correlacionan entre sí (r ≈ .50 en el de estrés y ≈ .45 en el de bienestar).
- Los puntajes generales de los dos instrumentos, con r = −.42.
- Sociodemográficas: Sexo (60 % mujeres), Edad (media 21.4, DE 2.4, de 17 a 35) y Universidad (55 % pública).

## Pedido vs. obtenido

El informe del Simulador mide cada parámetro sobre la base que acaba de generar (`simulador/informe_pedido_vs_obtenido.csv`):

| Parámetro | Variable | Pedido | Obtenido | Estado |
| --- | --- | --- | --- | --- |
| Media | Estresores | 25.00 | 24.97 | coincide |
| DE | Estresores | 4.60 | 4.60 | coincide |
| Media | Reacciones físicas | 16.00 | 16.02 | coincide |
| DE | Reacciones físicas | 3.20 | 3.20 | coincide |
| Media | Reacciones psicológicas | 17.00 | 16.98 | coincide |
| DE | Reacciones psicológicas | 3.40 | 3.41 | coincide |
| Media | Autoaceptación | 24.00 | 24.00 | coincide |
| DE | Autoaceptación | 3.80 | 3.84 | coincide |
| Media | Vínculos positivos | 23.00 | 23.01 | coincide |
| DE | Vínculos positivos | 4.00 | 4.00 | coincide |
| Media | Propósito vital | 25.00 | 25.04 | coincide |
| DE | Propósito vital | 3.60 | 3.59 | coincide |
| α | Estresores | 0.84 | 0.849 | coincide |
| α | Reacciones físicas | 0.80 | 0.810 | coincide |
| α | Reacciones psicológicas | 0.82 | 0.809 | coincide |
| α | Autoaceptación | 0.81 | 0.828 | coincide |
| α | Vínculos positivos | 0.80 | 0.790 | coincide |
| α | Propósito vital | 0.83 | 0.821 | coincide |
| r | Estrés académico — EEA ↔ Bienestar psicológico — EBP | -0.42 | -0.416 | coincide |
| % | Sexo (Mujer / Hombre) | 60% / 40% | 60.0% / 40.0% | coincide |
| % | Universidad (Pública / Privada) | 55% / 45% | 55.0% / 45.0% | coincide |

## Qué se hizo en el Analizador

1. «Usar datos generados»: la base pasa al Analizador con sus etiquetas.
2. «1. Configuración de la investigación»: el título, la unidad de análisis (estudiantes universitarios) y el lugar (Lima Metropolitana), que usa la redacción.
3. «Análisis estadístico»: Correlación, Variable 1 = Estrés académico — EEA (`General_EE`), Variable 2 = Bienestar psicológico — EBP (`General_EB`), prueba bilateral, y «Ejecutar análisis».
4. «Exportar capítulo a Word», «Descargar resultados» e «Imprimir o guardar en PDF» (carpeta `analizador/1-correlacion/`).
5. Ayuda → «Guardar proyecto».

## Resultados

- **Normalidad.** Con n = 320, la prueba es Kolmogorov-Smirnov con la corrección de Lilliefors: p < .001 para el estrés y p < .001 para el bienestar. Al menos una se aparta de la normalidad, así que la correlación es la de Spearman.
- **Correlación.** ρ = −.40, p < .001, IC 95 % [−.49, −.30]: correlación moderada negativa altamente significativa (p < .001). La r pedida al Simulador era −.42 (Pearson); la ρ de Spearman sobre los mismos datos sale algo menor, como es habitual.
- **Objetivos específicos.** El Analizador evalúa cada dimensión con la otra variable, elige las de mayor relación y corrige los p por Holm:

| Objetivo específico | Coeficiente | p ajustado (Holm) | Decisión |
| --- | --- | --- | --- |
| Propósito vital ↔ Estrés académico — EEA | -0.340 | p < 0.001 | ✅ Significativa |
| Reacciones psicológicas ↔ Bienestar psicológico — EBP | -0.327 | p < 0.001 | ✅ Significativa |
| Autoaceptación ↔ Estrés académico — EEA | -0.327 | p < 0.001 | ✅ Significativa |
| Reacciones físicas ↔ Bienestar psicológico — EBP | -0.318 | p < 0.001 | ✅ Significativa |
| Vínculos positivos ↔ Estrés académico — EEA | -0.317 | p < 0.001 | ✅ Significativa |

- **Fiabilidad** (tarjeta «Fiabilidad y consistencia interna»):

| Escala | Ítems | ω total | α | Interpretación |
| --- | --- | --- | --- | --- |
| Estresores (EEA) | 8 | 0.853 | 0.849 | buena (ω) |
| Reacciones físicas (EEA) | 6 | 0.818 | 0.810 | buena (ω) |
| Reacciones psicológicas (EEA) | 6 | 0.823 | 0.809 | buena (ω) |
| Autoaceptación (EBP) | 6 | 0.841 | 0.828 | buena (ω) |
| Vínculos positivos (EBP) | 6 | 0.797 | 0.790 | aceptable (ω) |
| Propósito vital (EBP) | 6 | 0.832 | 0.821 | buena (ω) |
| Escala total (EEA) | 20 | 0.898 | 0.896 | buena (ω) |
| Escala total (EBP) | 18 | 0.881 | 0.878 | buena (ω) |

El capítulo de Word reúne todo lo anterior con el marco metodológico (pregunta, objetivos, hipótesis, matriz de consistencia), la tabla sociodemográfica, los niveles, las comparaciones según el sexo y la universidad, la discusión y las referencias.

## Archivos

| Archivo | Qué es | Tamaño |
| --- | --- | --- |
| [analizador/1-correlacion/capitulo_resultados_APA.docx](analizador/1-correlacion/capitulo_resultados_APA.docx) | El capítulo de resultados en Word (APA 7) de la correlación analizada: botón «Exportar capítulo a Word». Se abre en Microsoft Word (LibreOffice y Google Docs no leen la técnica con que se arma). | 726 KB |
| [analizador/1-correlacion/resultados.pdf](analizador/1-correlacion/resultados.pdf) | La página de resultados impresa en PDF (solo los resultados, sin los controles): botón «Imprimir o guardar en PDF» del Analizador. | 1.1 MB |
| [analizador/1-correlacion/resultados_analisis.txt](analizador/1-correlacion/resultados_analisis.txt) | Los resultados en texto plano: botón «Descargar resultados». | 30 KB |
| [proyecto.statsim](proyecto.statsim) | El proyecto completo (configuración y base del Simulador, datos del Analizador y lo demás que había en la página): Ayuda → «Guardar proyecto». Se abre con Ayuda → «Abrir proyecto». | 29 KB |
| [simulador/base_datos_simulada.sav](simulador/base_datos_simulada.sav) | La base en SPSS, con las etiquetas de variable y de valor y el nivel de medida: botón «SPSS (.sav)». | 22 KB |
| [simulador/base_datos_simulada.xlsx](simulador/base_datos_simulada.xlsx) | La base en Excel, con tres hojas (Datos, Diccionario e Informe): botón «Excel (.xlsx)». | 56 KB |
| [simulador/base_datos_simulada_excel_espanol.csv](simulador/base_datos_simulada_excel_espanol.csv) | La base en CSV para Excel en español (punto y coma y coma decimal): botón «CSV (Excel español)». | 38 KB |
| [simulador/base_datos_simulada_internacional.csv](simulador/base_datos_simulada_internacional.csv) | La base en CSV internacional (coma y punto decimal): botón «CSV (internacional)». | 38 KB |
| [simulador/configuracion_completa_simulador.csv](simulador/configuracion_completa_simulador.csv) | La configuración completa del Simulador (el archivo maestro), como la exporta «Exportar todo». Se abre con «Importar todo». | 2 KB |
| [simulador/informe_pedido_vs_obtenido.csv](simulador/informe_pedido_vs_obtenido.csv) | Cada parámetro pedido, medido sobre la base generada: botón «Descargar informe (CSV)». | 1 KB |
| [simulador/verificacion_de_la_base.pdf](simulador/verificacion_de_la_base.pdf) | La verificación de la base impresa en PDF (avisos, pedido vs. obtenido y resumen): botón «Imprimir o guardar en PDF» del Simulador. | 76 KB |

## Cómo reproducirlo

- **Abrirlo en la página.** En la pestaña «Ejemplos», elige este caso y pulsa «Abrir en StatSim» (o, en Ayuda, «Abrir proyecto» con `proyecto.statsim`): el Simulador vuelve con su configuración y su base (la misma, bit a bit) y el Analizador con sus datos y la configuración de la investigación. Los análisis no se guardan en el proyecto: tras abrirlo, repite el paso 3 del Analizador. En la guía que se abre con el caso, «Hazlo por mí» (o «Hazlo todo por mí») los repite a la vista, como se hicieron aquí, y «Muéstrame» señala dónde está cada cosa.
- **Desde cero.** En el Simulador, «Importar todo» con `simulador/configuracion_completa_simulador.csv` y «Generar»: con la misma semilla sale la misma base. Después, los pasos del Analizador de arriba.
- **Comprobarlo.** `npm test` abre este proyecto con el código del momento y comprueba que regenera la misma base y que el Analizador da las cifras de `verificacion.json`. Con Playwright instalado, `node tests/navegador/ejemplos.mjs comprobar 01-correlacional` rehace el caso entero en Chromium, pulsando los botones, y lo compara con esta carpeta: byte a byte, salvo los PDF, de los que se compara su texto impreso y sus páginas (y en otra computadora, con otras fuentes, del Word se compara su texto).

## Los avisos del Simulador

Al generar, el Simulador muestra 6 avisos bajo «Generar» (están al principio de `simulador/verificacion_de_la_base.pdf`). No son errores de la configuración: anticipan cómo se comportarán los datos. El más repetido dice que el total de una escala Likert es un número entero «escalonado» y que, con más de 50 casos, la prueba de Kolmogorov-Smirnov rechazará su normalidad casi siempre aunque la forma sea normal. Por eso el Analizador termina usando pruebas no paramétricas (Spearman, Mann-Whitney, Kruskal-Wallis): es lo que pasa con datos Likert reales de ese tamaño.
