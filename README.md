# 📊 StatSim Pro

> *El pensamiento crítico no se reemplaza; se potencia. Como cualquier herramienta, esto existe para ampliar nuestras capacidades, no para sustituirlas. Al hacerse cargo de las tareas más mecánicas y repetitivas, nos libera para concentrarnos en aquello que genera verdadero valor: pensar, cuestionar, crear e innovar.*

StatSim Pro no solo calcula. Explica y te acompaña. De la pregunta de investigación al resultado, te ayuda a decidir qué hacer, te explica por qué y convierte el análisis en un proceso guiado, comprensible y defendible. Ahí está la diferencia respecto a otras herramientas como SPSS, R o Jamovi. StatSim Pro no busca competir contra ellas, sino acompañar al investigador de otra manera. Mientras otras herramientas te dan una respuesta, StatSim Pro te enseña por qué esa respuesta es la correcta. Te enseña el camino, no solo el resultado.

**Suite estadística y metodológica completa para tesis de psicología y ciencias sociales — 100 % en tu navegador.**

> Sin frameworks, sin backend y sin instalación. Tampoco usa librerías de estadística ni de gráficos: los cálculos, los gráficos y los lectores de SPSS y de Excel están escritos desde cero en el propio proyecto. ¡Pruébalo aquí 👇!

<p align="center">
  <a href="https://joelpasapera.github.io/StatSim-Pro/" title="Abrir StatSim Pro en el navegador">
    <img src="docs/img/abrir-statsim-pro.svg" width="440" alt="▶ Abrir StatSim Pro (joelpasapera.github.io/StatSim-Pro)">
  </a>
</p>

De la pregunta de investigación al capítulo de resultados: descubre temas poco investigados, busca antecedentes en las principales bases académicas y fíltralos por relevancia con IA, redacta el marco teórico con citas verificadas, genera bases de datos realistas —con la fiabilidad, las correlaciones y la forma de relación que tú pides, verificadas una a una—, ejecuta análisis con rigor de SPSS (también la psicometría de un instrumento y los modelos de ecuaciones estructurales), explora tus resultados en gráficos interactivos con análisis automático y exporta capítulos completos en Word con formato APA 7 e interpretación pedagógica.

Habla el idioma de SPSS y de Excel: la base simulada se descarga como archivo `.sav` (con etiquetas de variable y de valor, niveles de medida y fechas, lista para abrir en SPSS, PSPP, JASP o jamovi) o como libro de Excel `.xlsx` (la base, su diccionario y el informe de la generación, cada uno en su hoja), y el Analizador carga tus `.sav`, `.zsav` y `.xlsx` además de los CSV de Excel (con punto y coma o coma, en UTF-8 o en el ANSI de Excel en español). Los lectores y los escritores de SPSS y de Excel son propios —también el ZIP y el DEFLATE de los .xlsx— y se comprobaron contra ReadStat, la biblioteca que usan haven (R) y pyreadstat (Python), y contra openpyxl. Y todo tu trabajo cabe en un archivo: **Guardar proyecto** (en Ayuda) lo guarda en un `.statsim` y **Abrir proyecto** lo devuelve a su sitio, la base simulada incluida, bit a bit.

---

## 🎯 ¿Para quién es?

- Estudiantes de psicología, educación, sociología y ciencias de la salud que desarrollan su tesis
- Investigadores que necesitan análisis rápidos sin licencias de software propietario
- Docentes que buscan herramientas accesibles para enseñar estadística y metodología — y que necesitan **bases de datos didácticas con parámetros conocidos** (o con imperfecciones deliberadas para practicar la limpieza)

> *"Construido para resolver un problema que vivía todos los días: perder horas en SPSS sin entender qué hacía. Ahora el análisis y la interpretación están en un solo clic."*

---

## 🧭 Una tesis, pestaña por pestaña

StatSim Pro acompaña las dos mitades del trabajo: la teórica (Explorador → Buscador → matriz de fuentes → Redactor del marco teórico) y la empírica (Simulador o tus propios datos → Analizador → capítulo de resultados en Word). Cada pieza alimenta a la siguiente.

| Pestaña | Qué hace |
|---|---|
| 🔭 **Explorador** | Te ayuda a elegir el tema: compara, subtema por subtema, cuánto se habla de él en las noticias con cuánto se ha investigado, y trae un árbol de unos 500 temas de la psicología y un mapa mundial de salud mental. |
| 🔎 **Buscador** | Busca antecedentes a la vez en diez fuentes, los criba por relevancia con IA y arma la matriz de revisión con referencias APA, el protocolo de búsqueda, el diagrama PRISMA y un metaanálisis de correlaciones. Dentro está el **Redactor**, que escribe el marco teórico con esa matriz. |
| 🎲 **Simulador** | Genera bases sintéticas con las propiedades que pidas (fiabilidad, correlaciones y su forma, diferencias por grupo, mediación y moderación, medidas repetidas, estructura factorial, desenlaces, jueces e imperfecciones) y comprueba cada una en un informe «pedido vs. obtenido». |
| 🔬 **Analizador** | Analiza tu base o la simulada: descriptivos, normalidad, correlación, regresión, comparación de grupos, χ², fiabilidad, psicometría (V de Aiken, AFE, concordancia, invarianza), ecuaciones estructurales y la forma de una relación; con gráficos, el capítulo en Word y los resultados para imprimir. |
| 📂 **Ejemplos** | Cinco estudios completos hechos con la propia página, con todos sus archivos y una guía que te señala cada paso o lo hace por ti. |
| ❔ **Ayuda** | Qué hace cada sección, **Guardar** y **Abrir proyecto** y **Recargar sin caché** (si tras una actualización la página no carga lo nuevo). |

---

## 📊 Evidencia de validación

Los resultados arrojados por **StatSim Pro** fueron comparados directamente con los reportados por **IBM SPSS Statistics** (versión estándar de laboratorio) sobre la **misma base de datos**: una base generada con el Simulador de StatSim Pro (*N* = 300 participantes, variables `Total_R` y `Total_T`).

### Resultados obtenidos

#### 1. Correlación no paramétrica (Spearman)

| Métrica | StatSim Pro | IBM SPSS | Diferencia |
|---------|:-----------:|:--------:|:----------:|
| **ρ de Spearman** | **−0.0590** | **−0.059** | **0.0000** |
| **p-valor (bilateral)** | **0.3088** | **0.309** | **0.0002** |
| *N* | 300 | 300 | — |

#### 2. Prueba de normalidad — Kolmogorov-Smirnov (Lilliefors)

| Variable | Métrica | StatSim Pro | IBM SPSS | Diferencia |
|----------|---------|:-----------:|:--------:|:----------:|
| **Total_R** | Estadístico *D* | **0.0381** | **0.038** | **0.0001** |
| | p-valor | **0.3599** | 0.200¹ | — |
| **Total_T** | Estadístico *D* | **0.0803** | **0.080** | **0.0000** |
| | p-valor | **0.0001** | **< .001** | — |

> ¹ SPSS reporta *p* = 0.200 como **límite inferior de la significación verdadera** (ver pie de tabla en SPSS). StatSim Pro calcula el valor p exacto mediante la aproximación de Dallal-Wilkinson/Khorzad, arrojando un resultado más informativo (*p* = 0.3599).

### Capturas de pantalla

**Correlación de Spearman — StatSim Pro vs. SPSS**

![Correlación de Spearman en StatSim Pro y en SPSS](https://github.com/JoelPasapera/StatSim-Pro.github.io/blob/fec7b57c8f97627c3b8cb247d32ca96407bb5d67/Evidencia%20%5BSPSS%5D%20-%20Correlaci%C3%B3n.png)

**Pruebas de normalidad — StatSim Pro vs. SPSS**

![Pruebas de normalidad en StatSim Pro y en SPSS](https://github.com/JoelPasapera/StatSim-Pro.github.io/blob/fec7b57c8f97627c3b8cb247d32ca96407bb5d67/Evidencia%20%5BSPSS%5D%20-%20Prueba%20de%20normalidad.png)

Además de la comparación con SPSS, cada módulo estadístico se verifica contra **casos con solución conocida** (valores de tabla, ejemplos resueltos a mano y recuperación exacta de coeficientes sintéticos), incluyendo estudios de calibración por simulación (p. ej., 300 réplicas normales para confirmar la tasa nominal de falsos positivos de Lilliefors ≈ 5 %), y contra **referencias independientes**: dieciocho oráculos en Python (SciPy, NumPy, scikit-learn y mpmath), las salidas publicadas de R (`lm`, `glm`, `oneway.test`, `kruskal.test`), ReadStat para los archivos de SPSS y openpyxl para los de Excel. Más de mil pruebas automáticas corren antes de cada versión (ver [🧪 Pruebas](#-pruebas)).

### 🧪 Verificación integrada (autotest)

El proyecto lleva sus propias pruebas dentro del código, ejecutables desde la consola del navegador (F12):

```js
await StatSim.autotest()                          // 102 comprobaciones del simulador
StatSim.api.redactor.RedactorTeorico.autotest()   // 11 comprobaciones del redactor
```

Cada comprobación corresponde a un fallo que ocurrió de verdad durante el desarrollo y que ya no debe repetirse: correlaciones exactas, fiabilidad autocalibrada, puntaje general derivado, matrices de correlación imposibles, ítems invertidos, valores perdidos, exportación limpia, conversión de citas… Con semilla fija, para que el resultado sea reproducible y no dependa del azar.

### 📂 Ejemplos hechos por la propia página

La carpeta [`ejemplos/`](ejemplos/README.md) trae cinco casos de uso completos, recorridos en un navegador de verdad como lo haría una persona:

| # | Caso | Diseño |
|---|---|---|
| 1 | [Estrés académico y bienestar psicológico](ejemplos/01-correlacional/README.md) | Correlacional |
| 2 | [Ansiedad ante los exámenes según el sexo y el grado](ejemplos/02-comparativo/README.md) | Comparativo |
| 3 | [Predictores del rendimiento y del riesgo de deserción](ejemplos/03-predictivo/README.md) | Predictivo |
| 4 | [Propiedades psicométricas de una escala de procrastinación académica](ejemplos/04-instrumental/README.md) | Instrumental |
| 5 | [Apoyo social, autoeficacia y engagement académico](ejemplos/05-estructural/README.md) | Explicativo (SEM) |

Cada uno guarda lo que descargó la página, sin retocar: la configuración del Simulador, la base en CSV, SPSS y Excel, el informe «pedido vs. obtenido» y su verificación en PDF, el capítulo de Word, los resultados en texto y en PDF, los informes de psicometría y el proyecto `.statsim` para abrirlo y seguir. Su README explica la pregunta, qué se pulsó y qué dio cada análisis. Son datos simulados, y son también una prueba: `npm test` comprueba que cada proyecto regenera la misma base y que el Analizador vuelve a dar las mismas cifras.

En la página, la pestaña **Ejemplos** los muestra uno por uno: sus cifras clave, sus archivos para descargar (o el caso entero en un .zip) y su explicación; con **«Abrir en StatSim»** el caso se carga en el Simulador y el Analizador y una guía deja a la vista sus pasos, con los que ya trajo el proyecto marcados y los que hay que repetir resaltados. En cada paso, **«Muéstrame»** te señala en la página dónde está cada control y qué lleva; en los que hay que repetir, **«Hazlo por mí»** (o «Hazlo todo por mí», todos seguidos) repite los análisis a la vista, con pausas, como se hicieron en el caso: las descargas quedan para ti, señaladas.

---

## 📚 Motor estadístico implementado desde cero

Sin librerías estadísticas externas: cada fórmula está escrita y verificada en el propio proyecto, y cada primitiva numérica tiene una sola implementación (`src/core/`), que comparten todas las vistas, el Word y el Simulador.

- **Shapiro-Wilk** — Algoritmo de Royston (1992, AS R94), el mismo que usan R y SPSS
- **Kolmogorov-Smirnov** — Corrección de Lilliefors (Dallal-Wilkinson / Khorzad)
- **Correlación** — Pearson y Spearman con intervalos de confianza (Fisher z; Bonett-Wright para Spearman), una sola convención en la vista principal, el informe, el mapa de correlaciones y el diagnóstico de forma; matrices con eliminación por pares
- **Pruebas t** — Student (varianzas agrupadas) y Welch (Satterthwaite)
- **ANOVA** — De un factor con η², y **de Welch** (sin suponer varianzas iguales; la prueba robusta de SPSS, `oneway.test` de R); **ANCOVA** (con la homogeneidad de las pendientes) y **MANOVA** (Λ de Wilks)
- **No paramétricas** — U de Mann-Whitney (corrección de empates; sin corrección de continuidad, como SPSS) y Kruskal-Wallis con corrección de empates y ε²
- **Levene** — Homogeneidad de varianzas (centrado en la media, como SPSS)
- **Chi-cuadrado** — Independencia con V de Cramér
- **Regresión** — Lineal simple y **múltiple (mínimos cuadrados por la QR de Householder, el método de R, con su criterio de colinealidad)** con B, EE, β estandarizados, t, p, IC 95 %, R², R² ajustado, F del modelo y **VIF** por predictor, con moderación (interacción centrada) y término cuadrático; con dos variables, la **forma** que mejor ajusta (lineal, cuadrática, cúbica, logarítmica o exponencial) por AIC con regla de parsimonia; **logística y de Poisson** (IRLS sobre la misma QR, el algoritmo de `glm` de R) con OR o razones de tasas, IC de Wald, pseudo-R² de McFadden, AIC, aviso de sobredispersión y una prueba exacta de separación (programación lineal)
- **Fiabilidad** — **Alfa de Cronbach** (bruto con IC 95 % por el procedimiento de Feldt, y estandarizado), **omega total de McDonald** (solución unifactorial por ejes principales iterados), **lambda 2 de Guttman**, **correlación media inter-ítem** con su rango, **α y ω ordinales** (sobre correlaciones policóricas o tetracóricas), **KR-20** en ítems dicotómicos e **intervalos por bootstrap** (percentil o BCa)
- **Psicometría** — **V de Aiken** con su intervalo (validez de contenido por jueces); **correlaciones policóricas y tetracóricas** por máxima verosimilitud en dos pasos (Olsson, 1979); **análisis factorial exploratorio** (KMO y MSA por ítem, esfericidad de Bartlett, análisis paralelo por permutaciones, ejes principales iterados, rotaciones oblimin, varimax y promax); **concordancia** entre evaluadores (κ de Cohen y de Fleiss, coeficiente de correlación intraclase con su intervalo)
- **Ecuaciones estructurales (SEM)** — AFC, análisis de rutas, mediación y SEM completo en una sola formulación (el modelo RAM), con sintaxis de lavaan; por **máxima verosimilitud** (BFGS con el gradiente analítico) o **WLSMV** para ítems ordinales (Muthén, 1984); χ², CFI, TLI, RMSEA con su intervalo y SRMR; aviso de soluciones no admisibles (casos Heywood) y de modelos sin identificar, con su causa probable; validez convergente y discriminante (fiabilidad compuesta, AVE, Fornell–Larcker y HTMT); comparación de modelos (Δχ² o AIC con ML; con WLSMV, ΔCFI y ΔRMSEA según Chen, 2007)
- **Invarianza de medición** — AFC multigrupo por máxima verosimilitud con estructura de medias (configural, métrica, escalar y estricta) o por WLSMV con ítems ordinales (la secuencia de Wu y Estabrook, 2016), con las medias latentes cuando la invarianza se sostiene
- **Forma de una relación** (según el *Atlas de relaciones entre variables*) — r, ρ, τ-b de Kendall, correlación de distancias y η por tramos; comparación de formas por AICc con pesos de Akaike; prueba de las dos rectas (Simonsohn, 2018); la nube de puntos: abanico (Breusch–Pagan de Koenker y White), bordes por regresión de cuantiles, condición necesaria (NCA), efecto techo o suelo y atípicos influyentes (distancia de Cook y, en grupo, un MCD robusto determinista)
- **Comparaciones múltiples** — Corrección de Holm; post-hoc con el modelo de error de cada prueba global: t con la media cuadrática del error (DMS de Fisher), t de Welch por pares y z de Dunn
- **Potencia post-hoc** — Aproximación de Cohen (1988; la de `pwr.r.test`) para correlaciones, con el α y la lateralidad de la prueba
- **Metaanálisis de correlaciones** — Transformación de Fisher, efectos aleatorios de DerSimonian-Laird, heterogeneidad (Q, I², τ²) y forest plot
- **p-valores** — Beta y gamma incompletas regularizadas por fracción continua de Lentz (Numerical Recipes)
- **Álgebra matricial propia, una sola implementación** (`src/core/linalg/`) — Descomposición de **Cholesky** (generación de datos correlacionados, inversas y log-determinantes de matrices definidas positivas), rotación de **Jacobi** para autovalores y autovectores (corrección de matrices no definidas positivas), **Gauss-Jordan** con pivoteo parcial, **QR de Householder**, inversión triangular y la fase 1 del **símplex** revisado
- **Azar reproducible** (`src/core/random/`) — Generadores con semilla (**mulberry32** para el Simulador, **sfc32** para los remuestreos), normales por **Box-Muller** y permutaciones uniformes (**Fisher–Yates**): la misma semilla da la misma secuencia de números en cualquier navegador y, con ella, la misma base (salvo que un motor de JavaScript calcule `Math.log`, `Math.cos` o `Math.exp` con otro último dígito: el estándar no los fija, y el redondeo de los valores casi siempre lo absorbe)

---

## 🎨 Motor de visualización propio (statviz.js)

StatSim Pro **no depende de D3.js**: los gráficos se dibujan con `statviz.js`, un motor SVG ligero (~35 KB sin minificar, frente a ~280 KB de D3) escrito desde cero para el proyecto, que implementa exactamente el contrato que la app necesita:

- Escalas lineales (con `nice`, ticks y **formato adaptativo de decimales** según el paso), de banda y secuenciales
- Ejes con estilos legibles en tema oscuro, selecciones data-join (`data/enter/exit/join`), generadores de línea y área con **curvas B-spline** (curveBasis) y cierre lineal
- Histogramas con umbrales, jerarquías con empaquetado de círculos y proyección geográfica Natural Earth para el panorama mundial
- Comprobado por la batería: sus estadísticos, contra los del núcleo, y cada gráfico, en Chromium (en la pantalla, impreso y en el Word)

Y dos piezas más, también propias:

- **El diagrama de rutas del SEM** (`sem-diagrama.js`): dispone el modelo en filas o, si no cabe, en columna; curva por fuera las covarianzas, separa las rutas recíprocas y lleva cada carga cruzada a su propio punto del indicador; y coloca cada coeficiente donde no tapa una flecha, una punta, una variable ni otro número (si no queda ningún sitio libre, en el que menos tapa). La misma figura va al Word y a lo impreso
- **Los gráficos en papel**: al imprimir y en las figuras del Word, cada gráfico pasa a tinta sobre blanco, con sus textos y sus líneas con contraste suficiente; lo comprueban pruebas en Chromium

---

## ✨ Características

### 🔭 Explorador de temas

- ✅ **Problemáticas latentes**: escribe un tema y la IA propone subtemas (sin IA, se usan unos de respaldo); de cada uno se mide el interés de las noticias de los últimos tres meses en medios y organismos de referencia (GDELT) frente a la producción académica de los últimos cinco años (OpenAlex). Un **índice de brecha** los ordena entre sí —🔥 latente (mucho ruido y poca investigación), 📊 equilibrado, 📚 saturado— con una nube de burbujas
- ✅ **Formular con IA**: convierte un subtema en un problema de investigación con su pregunta, tres enfoques posibles y su viabilidad (una propuesta orientativa para validar con tu asesor)
- ✅ **Árbol de la psicología**: unos 500 temas curados en área → subcategoría → tema, con filtro instantáneo
- ✅ **Panorama mundial de salud mental**: un mapa con la mortalidad por suicidio de la OMS (por 100 000, estandarizada por edad), que se descarga solo al pulsar «Mostrar»; de un país pasas a un problema y a una población, y de ahí al medidor de brechas

### 🎲 Generador de bases de datos (Simulador)

Un simulador psicométrico que entrega **exactamente lo que le pides**, y que además puede ensuciar los datos a propósito para que la limpieza sea parte del aprendizaje. La generación corre en un Worker: la página no se congela mientras trabaja.

**Estructura del instrumento**

- ✅ **Cuadro de pruebas** (tabla I): declara cada test, la **variable psicológica que mide** y la **correlación esperada entre sus dimensiones**
- ✅ Cada fila es **una dimensión** (ítems, media, DE, mínimo y máximo por ítem y su distribución: normal, uniforme, asimétrica, con techo o con suelo); el **puntaje general de cada test se calcula solo** como promedio de sus dimensiones (columna `General_`), y un test de una sola escala tiene esa escala como general
- ✅ **Escalas de acierto/error** (ítems 0/1) con la dificultad de cada ítem
- ✅ Variables sociodemográficas personalizables (sexo, edad, carrera, etc.)
- ✅ **Percentiles** opcionales (`PC_`) por escala y por puntaje general, calculados por rango medio
- ✅ **Heterogeneidad de los ítems** (ítems «fáciles» y «difíciles», cargas desiguales), sin cambiar la media, la DE, las correlaciones ni la fiabilidad
- ✅ Guía de coherencia en vivo que avisa de configuraciones contradictorias, con desbloqueo progresivo de campos

**Control psicométrico real**

- ✅ **Fiabilidad objetivo por escala**: elige el coeficiente —**α de Cronbach** u **ω de McDonald**— y el generador **se autocalibra** para que el valor observado coincida con el pedido (el redondeo de los ítems Likert desviaba el resultado; ahora se corrige por bisección midiendo con el mismo estimador que usa el Analizador)
- ✅ **Ítems invertidos**: indica cuántos ítems de la escala se puntúan al revés. La base los entrega **sin recodificar**, como llegan de un cuestionario real: quien no los refleje antes de sumar verá caer la fiabilidad, igual que en la vida real
- ✅ **Correlaciones objetivo** (tabla III) entre dimensiones, sociodemográficas numéricas y **puntajes generales derivados** (la correlación pedida sobre un General se reparte matemáticamente entre sus dimensiones)
- ✅ **Correlaciones exactas** (activable): la muestra reproduce *exactamente* la correlación pedida (si pides r = 0.40, obtienes 0.40) en lugar de fluctuar por error de muestreo. Desactívalo para que los datos se comporten como una muestra recogida en campo
- ✅ **Estructura factorial coherente**: las dimensiones de un mismo test correlacionan entre sí como en un instrumento real, y cualquier pareja que fijes explícitamente siempre prevalece
- ✅ **Detección de correlaciones imposibles**: si la combinación pedida no puede existir en ninguna muestra (matriz no definida positiva), se identifican las **tríadas en conflicto**, se sustituye por la **matriz válida más cercana** y se informa cuánto se movió cada correlación — en lugar de forzarla en silencio

**Relaciones con forma (el *Atlas de relaciones entre variables*)**

- ✅ **Tipo de relación**: además de la lineal, 17 curvas (logarítmica, sigmoide, en U, cíclica…), con la fuerza η de la relación
- ✅ **Nube**: homogénea, abanico que se abre o que se cierra, triángulo de condición necesaria o con un atípico influyente
- ✅ **Restricción de rango**: la base guarda solo el porcentaje superior o inferior de una variable (como los admitidos por un examen), y la selección atenúa sus correlaciones como en la realidad

**Diseños (tablas IV a IX)**

- ✅ **Diferencias por grupo** (IV): la d de Cohen entre los grupos de una variable binaria o categórica, la interacción de dos factores (2 × 2) y el anidamiento con su CCI
- ✅ **Modelos estructurales** (V): mediación simple y paralela, moderación, relación curvilínea, terceras variables (confusión, supresión y colisionador) y la paradoja de Simpson
- ✅ **Medidas repetidas** (VI): de 2 a 4 ondas con su estabilidad y su cambio, curvas de crecimiento, paneles cruzados (también con interceptos aleatorios, el RI-CLPM), relaciones entre personas y dentro de la persona y estados con histéresis
- ✅ **Estructura factorial** (VII): la carga de cada ítem, cargas cruzadas, un factor de método para los ítems invertidos y el desajuste del modelo, para que el AFE y el AFC tengan qué recuperar
- ✅ **Desenlaces y puntos de corte** (VIII): niveles con nombre por cortes fijos o percentiles, y variables criterio no continuas (sí/no, conteos, ordinales) que dependen de las escalas que elijas
- ✅ **Concordancia** (IX): un segundo informante (madre, docente) o una forma paralela, y jueces que clasifican (κ) o puntúan (CCI)

**Realismo opcional (para enseñar limpieza de datos)**: seis controles independientes

- ✅ **Valores perdidos** con mecanismo **MCAR** (al azar), **MAR** (dependen de una variable observada) o **MNAR** (de la propia puntuación), con **regla del 80 %**: si a una escala le falta más del 20 % de sus ítems su total queda vacío; si falta menos, se prorratea
- ✅ **Respuestas descuidadas**: participantes de *línea recta* (mismo valor en todos los ítems) o de respuesta al azar, con columna marcadora opcional para que el docente pueda corregir el ejercicio
- ✅ **Errores de digitación**: valores imposibles fuera de rango, el atípico más común en bases transcritas a mano
- ✅ **Estilos de respuesta**, **ítems de control** de la atención y **tiempo de respuesta**

**Verificación y flujo de trabajo**

- ✅ **Informe «pedido vs. obtenido»**: tras generar, una tabla contrasta cada parámetro configurado (media, DE, α/ω, correlaciones, formas, diferencias, modelos, ondas…) con su valor medido en la base, con estado ✓/⚠ y descarga en CSV — la evidencia que respalda la simulación en el anexo metodológico. Con imperfecciones, verifica el generador sobre la base limpia y resume lo que se inyectó
- ✅ **Importar / Exportar por tabla** y botones **maestros** que guardan o restauran **toda la configuración del simulador** en un solo archivo
- ✅ Exportación a CSV (con BOM, compatible con Excel; en formato español o internacional), a SPSS (.sav) y a Excel (.xlsx: la base con sus fechas como fechas, el diccionario de variables y el informe de la generación), vista previa e **impresión del informe en PDF**; los valores perdidos salen como celda vacía
- ✅ **Enviar al Analizador** con un clic

### 🔬 Analizador estadístico

- ✅ Carga de CSV, de libros de Excel (.xlsx, con selector de hoja y, si son del Simulador, sus etiquetas), de bases de SPSS (.sav, .zsav) o de los datos generados, con vista previa (N y variables). Una celda vacía es un **valor perdido** en todos los análisis (nunca un 0), venga del CSV o del Simulador; un número se lee solo si la celda contiene un número completo, con punto o con coma decimal (`3,5`)
- ✅ **Etiquetas de variables**: renombra puntajes de escala (`General_IE` → “Inteligencia emocional”) y toda la app y el Word usan el nombre legible. Las columnas se reconocen por prefijo (`General_`, `Dimension_`, `Total_`), de modo que una base exportada conserva su estructura aunque vuelva desde un CSV externo
- ✅ Configuración de la investigación (título, unidad de análisis, contexto) y de dimensiones por variable
- ✅ **Correlación bivariada** (Pearson/Spearman elegido automáticamente según normalidad; bilateral o unilateral) con IC 95 %, interpretación de fuerza y dirección; con tres variables o más, **matriz de correlaciones** (método por par según normalidad, p corregidos por Holm)
- ✅ **Regresión** junto a la correlación: simple, con la forma funcional que mejor ajusta; **múltiple** con tabla completa de coeficientes, VIF, normalidad de residuos y **efecto crudo vs. ajustado** del predictor focal; con interacción o término cuadrático; **logística** si la dependiente es binaria y **de Poisson** si es un conteo
- ✅ **Lectura causal honesta**: la sección “De la correlación al control estadístico” explica las tres condiciones causales y por qué un diseño transversal aporta asociación ajustada, necesaria pero no suficiente
- ✅ **Comparación entre grupos con protocolo automático**: la app evalúa normalidad por grupo + Levene y elige sola — t de Student, **t de Welch** o U de Mann-Whitney (2 grupos); ANOVA, **ANOVA de Welch** o Kruskal-Wallis (3+), con **post-hoc por pares y corrección de Holm**, el mismo protocolo en la vista principal, la pestaña de grupos, el Word y la criba sociodemográfica — explicando siempre *por qué* eligió esa prueba, con tamaños del efecto (d, r, η², ε²) y su magnitud; **ANCOVA** y **MANOVA** opcionales mediante preguntas guiadas
- ✅ **Asociación de categóricas** (Chi² con V de Cramér)
- ✅ **Fiabilidad y consistencia interna**: α de Cronbach con IC 95 %, α estandarizada, **ω total de McDonald**, λ₂ de Guttman y correlación media inter-ítem, con interpretación por umbrales; **α y ω ordinales**, KR-20 e intervalos por bootstrap
- ✅ **Psicometría de un instrumento**, en tarjetas propias: **V de Aiken** (3), **AFE** (4), **concordancia entre evaluadores** (5), **invarianza de medición** (6) y el **diagnóstico de la forma de una relación** (7), cada una con su redacción APA, sus tablas y su Word; los cálculos largos corren en un Worker, con progreso y cancelación
- ✅ **Ecuaciones estructurales (SEM)** con sintaxis de lavaan y ejemplos: un **motor de decisión** previo dice si el modelo y la muestra lo permiten; luego, el ajuste con cada índice explicado (qué es, por qué, cómo mejorarlo y cómo reportarlo en APA), el **diagrama de rutas** con los coeficientes estandarizados, la validez convergente y discriminante y la comparación de modelos (inicial, alternativo y final)
- ✅ Criba automática de correlaciones por dimensiones para los objetivos específicos (priorizada y con Holm), y **cribado de la forma** de todos los pares
- ✅ Hallazgos según variables sociodemográficas (pruebas según la naturaleza de cada variable)
- ✅ Interpretaciones en lenguaje llano de cada resultado, con **los porqués** detrás de los números y una plantilla para la discusión
- ✅ Marco metodológico asistido: pregunta, objetivo general, objetivos específicos, hipótesis H₀/H₁ y **matriz de consistencia** construida automáticamente
- ✅ **Descargar resultados** en texto e **imprimir o guardar en PDF** (solo los resultados, en papel blanco, con su encabezado)

### 📈 Dashboard de gráficos interactivos con análisis automático

- ✅ **Selector de variables con casillas**: elige qué variables graficar (2–8) y todos los gráficos, junto con sus análisis, se redibujan al instante
- ✅ **Distribución de puntajes: teórica vs. empírica** — para cada variable, la curva normal N(μ, σ) (continua) se contrasta con la **densidad empírica de los datos reales** (KDE de Silverman, punteada): la comparación visual delata asimetrías y bimodalidades antes de las pruebas formales; con líneas de media, cursor en cruz con coordenadas y rejilla tenue
- ✅ **Matriz de correlaciones exploratoria**: paleta divergente diseñada para tema oscuro (sin celdas blancas), contraste del texto por luminancia real, celdas y tipografía adaptativas, etiquetas de variables completas y **tooltip por celda** con coeficiente (Pearson o Spearman según la normalidad de ese par), p aproximado, N, IC 95 % (Fisher) e interpretación en lenguaje natural
- ✅ **Diagrama de caja investigable**: lienzo proporcional al número de variables, etiquetas del eje en diagonal, **tooltip con los estadísticos completos de cada caja** (N, mediana, cuartiles, RIC, mínimo, máximo, atípicos) y **ficha por cada punto atípico** (valor, límites de Tukey e identificador del participante)
- ✅ **Análisis automático bajo cada gráfico** (`analisis-graficos.js`, con la misma asimetría y curtosis que la tabla de descriptivos): un párrafo con redacción científica publicable generado desde los datos vigentes — severidad de las desviaciones de normalidad (γ₁, γ₂) con dirección e implicación, dispersión relativa (CV), estructura correlacional (varianza compartida, cautela por comparaciones múltiples), atípicos con dirección, asimetría por mediana y bigotes, y recomendaciones condicionales (paramétricos vs. robustos; media/DE vs. mediana/RIC), con avisos automáticos por N reducido o escalas dispares
- ✅ **Ayudas pedagógicas**: botón «?» junto a cada título abre una explicación en lenguaje coloquial de qué es el gráfico, para qué sirve y qué observar
- ✅ Todos los gráficos son **responsive de verdad**: el lienzo se ajusta exactamente al contenido y al marco que lo contiene, sin recortes ni superposiciones, también en un teléfono
- ✅ En el panel de normalidad: histogramas con curva normal y ejes numéricos, Q-Q plots; en correlación: dispersión con recta de mínimos cuadrados y **banda de confianza al 95 %**

### 📄 Exportador de capítulo de resultados (Word APA 7)

- ✅ Documento **.docx real** con portada, resumen, índice con anclas y numeración APA de tablas y figuras
- ✅ Marco metodológico completo + matriz de consistencia
- ✅ Tabla sociodemográfica **con interpretación pedagógica** (categorías predominantes, lectura de f y %)
- ✅ Niveles por terciles explicados, descriptivos (M, DE, asimetría, curtosis) interpretados en llano
- ✅ Figuras exportadas como imagen (histogramas, Q-Q, dispersión) **cada una con su explicación** usando los valores reales — incluida la nota metodológica sobre por qué la vista del histograma puede no coincidir con la prueba de normalidad en muestras grandes
- ✅ **Contraste de hipótesis y decisión estadística**: H₀/H₁, α, estadístico, p, IC 95 %, decisión explícita (se rechaza / no se rechaza) y **potencia post-hoc** valorada contra el umbral de .80
- ✅ Matriz de correlaciones en tabla APA (triángulo inferior)
- ✅ Correlaciones de objetivos específicos con corrección de Holm y párrafo didáctico
- ✅ Sección de **comparación entre grupos** (descriptivos + supuestos + contraste + post-hoc + interpretación), con la ANCOVA y el MANOVA si se pidieron
- ✅ Sección de **análisis multivariado** con el modelo que el investigador ejecutó (resumen, coeficientes, crudo vs. ajustado y precisión conceptual sobre causalidad)
- ✅ Sección del **SEM** (ajuste, parámetros, validez, comparación de modelos y el diagrama de rutas como figura); las tarjetas de psicometría exportan además su propio Word
- ✅ Referencias APA del capítulo

### 🔎 Buscador de antecedentes académicos

- ✅ Búsqueda simultánea en **Google Académico**, **Scopus** (rotación de múltiples claves API), **Web of Science** (Colección Principal, por la API Starter de Clarivate: con tu clave, que no sale de tu navegador salvo hacia Clarivate, o con el relevo propio del sitio; ver [docs/WEB-OF-SCIENCE.md](docs/WEB-OF-SCIENCE.md)), **PubMed**, **SciELO**, **ALICIA (Concytec)**, la **OMS** (IRIS: guías e informes oficiales de salud), la **ONU** (su Biblioteca Digital) y fuentes complementarias (**OpenAlex**, **Crossref** y **Semantic Scholar**). **ScienceDirect** (el texto completo de las revistas y los libros de Elsevier, con las mismas claves que Scopus) está lista, pero viene desmarcada hasta que Elsevier habilite su ScienceDirect Search API para las claves del sitio
- ✅ **Una obra que encuentran varias bases (mismo DOI) es una sola fila** que las nombra todas en la columna «Base» («Scopus+Web of Science») y en la «Indexación», y toma de las otras el resumen, el ISSN o las citas que le falten
- ✅ **Búsqueda intensiva con IA**: generación de criterios de inclusión/exclusión, expansión de la consulta en variantes (ES/EN) y paginación profunda
- ✅ **Variantes propias**: escribe tus propias variantes de búsqueda (una por línea) y se usarán tal cual, sin pasar por la IA; deja la caja vacía y se generan automáticamente
- ✅ **Tope de búsquedas configurable** (variantes × idiomas): decide cuántas búsquedas se lanzan, con aviso en vivo del coste y advertencia explícita si alguna variante quedaría fuera
- ✅ **Análisis de relevancia con IA** (escala 1–5 con justificación) a través de un Cloudflare Worker propio que reparte el trabajo en paralelo entre sus claves de Groq, con JSON estricto y reintentos con enfriamiento automático
- ✅ Filtro por umbral de relevancia que gobierna matriz, exportaciones y redacción
- ✅ **Enriquecimiento automático por DOI en cascada**: OpenAlex → Crossref → Semantic Scholar → Europe PMC → **Scopus Abstract Retrieval** → Unpaywall (rescata resúmenes que las APIs abiertas no traen, p. ej. Elsevier, y los de Web of Science y ScienceDirect, que sus APIs no dan), con recuperación de autores y año, el ISSN que falta (para el cuartil) y el nombre de la revista con sus tildes cuando la base lo da en mayúsculas (Web of Science)
- ✅ **Matriz de revisión bibliográfica de 15 columnas**: Relevancia, Título, **Autor**, Año, Contexto (país), Objetivos, Muestra, Instrumentos, Resultados, Conclusiones, Revista, Cuartil, Indexación, Referencia APA y Link/DOI
- ✅ Métricas de revista (cuartil por el percentil de CiteScore de Scopus, e indexación) y detección de país y muestra desde el resumen
- ✅ **Ranking de revistas de psicología**: todas las del área en Scopus, ordenadas por el percentil de CiteScore de su último año completo, con su cuartil y descarga en Excel
- ✅ **Protocolo de búsqueda auto-documentado**: cada consulta queda registrada (fuente, ecuación literal, filtros, resultados, fecha y hora) en la ficha técnica de la revisión, para que otro investigador pueda replicarla
- ✅ **Diagrama de flujo PRISMA 2020**, automático (lo registra el Buscador) o a mano, en PNG y en texto
- ✅ **Metaanálisis de correlaciones** con los r y los N que transcribes del texto completo de cada estudio (efectos aleatorios, heterogeneidad y forest plot)
- ✅ Exportación a **Excel** (formato APA: Times 12, ajuste de texto, anchos calibrados) y **CSV dual** (ES con `;` y coma decimal / internacional con `,`)
- ✅ Referencias APA 7 correctas: apellidos e iniciales interpretados desde cualquier formato de las APIs (“Batbayar E.”, “E. Batbayar”, “EB Batbayar”…), “y” en español, cursivas de revista

### ✍️ Redactor de marco teórico con IA

- ✅ **Identificación de variables** de estudio a partir del problema (la IA propone, tú confirmas)
- ✅ **Marco teórico completo**: el Capítulo I (planteamiento del problema y justificación) y el Capítulo II (estado de la cuestión, antecedentes —en partes, para cubrir todas las fuentes—, bases teóricas y modelos teóricos de cada variable y su definición conceptual), redactados **en paralelo** por múltiples claves de IA
- ✅ **Regla de oro inviolable: toda idea lleva cita** — el modelo escribe con marcadores de evidencia y la app los convierte en **citas APA reales** tomadas de tu matriz, contando exactamente qué fuentes se usaron
- ✅ **Caza de citas inventadas**: cualquier referencia que no exista en la matriz se detecta y se reporta, tanto en forma parentética como narrativa
- ✅ **Ficha de instrumentos** extraída de tu propia matriz (nombre, sigla, constructo y familia teórica) que se inyecta en todas las secciones para que ningún test se describa midiendo lo que no mide, y que además detecta **posicionamientos teóricos contradictorios** entre secciones
- ✅ **Filtro por relevancia** (≥ 2 … ≥ 5) aplicable también a una matriz **ya descargada** que vuelvas a importar (en Excel o CSV)
- ✅ **Saneado de la matriz en una sola puerta**: caracteres corruptos del scraping, autores contaminados con nombres de revista, **referencias APA reconstruidas** cuando llegan rotas y **posibles duplicados reportados —nunca borrados—** para que decidas tú
- ✅ **Cadena de respaldo ante límites de cuota**: reintentos con espera respetando la ventana del proveedor y **cambio automático a un segundo motor de IA**, comprimiendo el material sin omitir ninguna fuente ni perder las cifras de los resúmenes
- ✅ **Pase de coherencia**: un botón revisa el documento y reescribe solo los pasajes que lo necesitan (cadenas de citas sin jerarquizar, muletillas repetidas, declaraciones de vacío duplicadas, modelo teórico contradictorio), con una **garantía mecánica**: si la reescritura altera las citas del párrafo, se rechaza
- ✅ **Panel de diagnóstico** al terminar: secciones, palabras, fuentes citadas, **qué motor escribió cada sección**, costura del texto, saneado de la matriz y alertas accionables
- ✅ **Word .docx y PDF en formato APA 7**: Times New Roman 12, doble espacio, sangrías, títulos centrados, numeración de páginas y **Referencias finales solo de las fuentes realmente citadas**, en orden alfabético con sangría francesa
- ✅ Botón de copiado íntegro al portapapeles y recuperación del último documento generado
- ✅ Aviso honesto permanente: es un **borrador asistido** — verifica cada cita contra la fuente original y reescríbelo con tu voz

### 💾 Proyecto completo en un archivo

- ✅ **Guardar proyecto** (en Ayuda) descarga un `.statsim` con todo tu trabajo: la configuración del Simulador y su base generada (la misma, sin volver a generarla), los datos cargados en el Analizador con sus etiquetas y la configuración de la investigación, la tabla de la V de Aiken, la última redacción del Redactor y el protocolo de búsqueda con su flujo PRISMA
- ✅ **Abrir proyecto** lo devuelve todo a su sitio, en este u otro navegador, tras pedirte confirmación; un proyecto ajeno se comprueba antes de tocar nada, y tu clave de Web of Science nunca entra en él

### 🔒 Privacidad y arquitectura

- ✅ **100 % del procesamiento estadístico ocurre en tu navegador**: tus datos nunca salen de tu equipo
- ✅ Sin backend propio ni base de datos; despliegue estático en GitHub Pages
- ✅ JavaScript nativo en **módulos ES** (sin frameworks ni herramientas de construcción): ninguna sección importa de otra (se comunican por un bus de eventos y un estado compartido), cada primitiva numérica tiene una sola implementación y lo pesado se descarga solo cuando hace falta (la pestaña Ejemplos, las bibliotecas de exportación)
- ✅ **Lectores y escritores propios** de SPSS (.sav y .zsav), Excel (.xlsx), ZIP y DEFLATE, y del CSV con sus codificaciones (UTF-8, UTF-16 o el ANSI de Excel en español)
- ✅ Bibliotecas de terceros solo para exportar, y solo cuando se usan: html-docx-js (los .docx) y ExcelJS (las hojas del Buscador y del ranking de revistas), copiadas en `assets/vendor/`; jsPDF, desde un CDN, para el PDF del Redactor
- ✅ Las llamadas a IA (solo en el Explorador, el Buscador y el Redactor) envían solo lo que pide la tarea —tu tema o tu problema de investigación y los títulos y resúmenes de artículos públicos— a Workers propios de Cloudflare (Groq para los subtemas, los criterios, las variantes y la relevancia; Gemini para la redacción, con Groq de respaldo), que guardan las claves fuera de la página y rotan entre ellas; tus datos del Simulador y del Analizador nunca van a la IA
- ✅ La clave de Web of Science, si pegas la tuya, no sale de tu navegador salvo hacia Clarivate (o el relevo propio del sitio), nunca hacia los proxies públicos; puedes recordarla en el navegador o usarla solo mientras la página esté abierta
- ✅ Lo que llega de las fuentes (títulos, autores, revistas, resúmenes, enlaces) se pinta como texto, sin etiquetas, con las entidades decodificadas y con enlaces solo http(s); y los nombres que escribes (columnas, variables, latentes del SEM), también como texto
- ✅ **Recargar sin caché** (en Ayuda) vuelve a descargar todos los archivos del sitio si el navegador mezcla una versión nueva con un módulo viejo; **Restablecer y recargar** borra además lo guardado en el navegador

---

## 🚀 Uso

1. Abre la página: **[joelpasapera.github.io/StatSim-Pro](https://joelpasapera.github.io/StatSim-Pro/)**
2. ¿Primera vez? En **Ejemplos**, abre un caso resuelto en StatSim y sigue su guía («Muéstrame» te señala cada control; «Hazlo por mí» lo hace a la vista): verás el recorrido entero con datos de ejemplo antes de usar los tuyos
3. **Explorador** → escribe un tema amplio y mira qué subtemas tienen mucho interés y poca investigación; formula el que elijas como problema
4. **Buscador** → busca antecedentes (con tus propias variantes si quieres), analiza relevancia con IA, llena la matriz y expórtala; el protocolo y el PRISMA se llenan solos
5. **Redactor** (dentro del Buscador) → usa la matriz del Buscador o impórtala, filtra por relevancia, identifica variables, genera el **marco teórico completo**, pásale el **pase de coherencia** y descárgalo en **Word o PDF APA**
6. **Simulador** → declara tus pruebas y dimensiones, fija la fiabilidad y las correlaciones objetivo, y genera la base (o salta este paso si tienes la tuya). Revisa el **informe pedido vs. obtenido** y, si vas a enseñar limpieza de datos, activa las **imperfecciones realistas**
7. **Analizador** → carga tu CSV, Excel o SPSS, o usa los datos generados; etiqueta tus variables; elige el análisis (correlación, comparación de grupos, chi², regresión) y ejecuta; para tu instrumento, usa las tarjetas de psicometría y el SEM
8. **Explora el dashboard**: selecciona variables con las casillas, pasa el cursor por la matriz y los diagramas de caja, investiga los atípicos y lee el análisis automático bajo cada gráfico
9. Exporta el **capítulo de resultados en Word APA** con un clic, o imprime los resultados en PDF
10. **Ayuda → Guardar proyecto** para seguir otro día, en este u otro navegador

Para uso local: clona el repositorio y sirve la carpeta con cualquier servidor estático (abierta como archivo, con doble clic en `index.html`, el navegador no carga los módulos de la página).

```bash
git clone https://github.com/JoelPasapera/StatSim-Pro.git
cd StatSim-Pro
python -m http.server 8000   # o cualquier servidor estático; luego abre http://localhost:8000
```

Funciona en las versiones actuales de Chrome, Edge, Firefox y Safari (hacen falta los módulos ES).

---

## 🧪 Pruebas

Desde la raíz del repositorio, con Node 18 o más reciente (y Python 3 con NumPy y SciPy para los oráculos):

```bash
npm test                    # rápida: las pruebas de Node (unitarias, de integración y de la interfaz) y los escenarios, en paralelo
npm run test:completo       # todo: añade mutaciones, sondas, fuzz, los dieciocho oráculos en Python, los tipos y Chromium
npm run ejemplos            # rehace ejemplos/ en Chromium (hace falta Playwright)
npm run ejemplos:comprobar  # los rehace en una carpeta temporal y los compara con los guardados
```

- **Más de mil pruebas de Node** (`node --test`), sin dependencias: la interfaz se prueba sobre el `index.html` real con un DOM mínimo propio (`tests/ui/minidom.js`), y el Buscador, con respuestas grabadas, sin red
- **Oráculos**: cada cálculo se contrasta con una implementación independiente (SciPy, NumPy, scikit-learn, mpmath, las salidas publicadas de R, ReadStat y openpyxl)
- **Mutaciones**: se rompe el código a propósito para comprobar que alguna prueba lo nota
- **Chromium** (con Playwright, que no es una dependencia del proyecto: sin él, esas pruebas se omiten y se dice): los ejemplos, «Muéstrame» y «Hazlo por mí», los gráficos en la pantalla, impresos y en el Word, con datos extremos y en un teléfono de 360 px, y «Recargar sin caché»
- **Tipos**: los módulos nuevos y los que se reescriben llevan JSDoc y `// @ts-check`; la batería completa los comprueba con TypeScript, sin compilar nada (si TypeScript no está instalado, lo omite y lo dice)

Lo que prueba cada archivo, en [`tests/README.md`](tests/README.md).

---

## 📁 Estructura del proyecto

```
StatSim-Pro/
├── index.html            # la cáscara: cabecera, pestañas y secciones
├── version.json          # la versión publicada (la página la compara al arrancar)
├── src/
│   ├── main.js           # el arranque, la navegación por #hash y la carga de las secciones
│   ├── version.js        # la versión única del sitio (controla la caché)
│   ├── core/             # sin DOM: el núcleo que comparte todo
│   │   ├── stats/        #   distribuciones, descriptivos, correlación, contrastes, normalidad, MCO, MLG, fiabilidad…
│   │   ├── linalg/       #   Cholesky, Gauss-Jordan, Jacobi, QR de Householder, símplex
│   │   ├── random/       #   mulberry32, sfc32, Box-Muller, Fisher–Yates
│   │   └── data/         #   la base columnar, las celdas y los perdidos, las codificaciones, sav/, xlsx/ y zip/
│   ├── shared/           # lo que comparten las secciones: eventos, estado, statviz.js, CSV, HTML seguro, impresión, IA…
│   ├── simulador/        # dominio/ (el generador, sin DOM), worker/ (el Worker) y ui/ (una pieza por tabla)
│   ├── analizador/       # estadistica.js (el orquestador) sobre motor/ (los cálculos), psicometria/, relaciones/,
│   │                     #   el SEM (sem-motor.js, sem-ui.js, sem-diagrama.js), la regresión, los gráficos, el Word y ui/
│   ├── buscador/         # fuentes/ (Scopus, ScienceDirect, Web of Science, PubMed, SciELO, ALICIA, Scholar), antecedentes/,
│   │                     #   protocolo.js, prisma.js, meta-analisis.js y ranking.js
│   ├── redactor/         # el marco teórico (redactor/: plan, redacción, calidad, cosido, fuentes y exportación)
│   ├── explorador/       # explorar.js (las brechas), arbol.js, panorama.js y topo-lite.js
│   ├── ejemplos/         # la pestaña «Ejemplos» y hazlo/ («Muéstrame» y «Hazlo por mí»)
│   └── proyecto/         # el .statsim: guardar y abrir el proyecto completo
├── workers/relevo-wos.js # el relevo de Web of Science (Cloudflare Worker; se despliega aparte)
├── assets/               # css/ (por componentes), data/ (países e ISO del mapa), img/, video/ y vendor/
├── ejemplos/             # los cinco casos hechos por la página, con todo lo que descargó, e indice.json
├── tests/                # unit/, integration/, ui/, oracle/, fuzz/, montecarlo/, navegador/ y run.js
├── docs/                 # la documentación (abajo) e img/ (las imágenes del README)
└── Teoria/               # notas de estadística (qué es «Sig.» en SPSS)
```

Reglas que mantienen la estructura escalable: `core` no importa de nadie; `shared`, solo de `core`; cada sección, de `core` y `shared`, y ninguna de otra; un módulo de dominio no toca el DOM y uno de interfaz no calcula. Añadir una sección es añadir su carpeta y registrarla en `src/version.js`. Todo, con detalle, en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

---

## 📖 Documentación

| Documento | Qué cuenta |
|---|---|
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Qué cambió en cada versión, con lo que se midió y se probó |
| [docs/LIMITACIONES.md](docs/LIMITACIONES.md) | Lo que StatSim Pro aún no hace o hace con límites conocidos, y por qué |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Las capas, las reglas de dependencia, las convenciones y el plan de la refactorización a módulos |
| [docs/ESTADO-MIGRACION.md](docs/ESTADO-MIGRACION.md) | Dónde quedó cada archivo del proyecto original |
| [docs/WEB-OF-SCIENCE.md](docs/WEB-OF-SCIENCE.md) | Cómo conectar Web of Science: tu clave o el relevo del sitio |
| [docs/PLAN-PSICOMETRIA.md](docs/PLAN-PSICOMETRIA.md) y [docs/PLAN-RELACIONES.md](docs/PLAN-RELACIONES.md) | Los planes de la psicometría y del *Atlas de relaciones*, paso a paso |
| [tests/README.md](tests/README.md) | Las pruebas, una por una |
| [ejemplos/README.md](ejemplos/README.md) | Los cinco casos de ejemplo: qué trae cada carpeta, cómo se hicieron y cómo se comprueban |

---

## ⚠️ Nota de responsabilidad académica

StatSim Pro automatiza cálculos y borradores, no el criterio del investigador. Los textos generados con IA son **borradores de trabajo**, y los análisis automáticos bajo los gráficos son **lecturas descriptivas preliminares**: contrasta cada cita con la fuente original, confirma los supuestos con las pruebas formales y reescribe con tu propia voz antes de incorporar cualquier resultado a tu tesis.

Las bases generadas por el **Simulador son datos sintéticos**: sirven para diseñar, enseñar y poner a prueba un procedimiento de análisis, nunca para sustituir datos reales ni para sostener conclusiones sustantivas sobre una población.

---

## 📄 Licencia

StatSim Pro se distribuye con la [licencia Apache 2.0](LICENSE.txt). Quien participe en el proyecto se compromete con su [código de conducta](CODE_OF_CONDUCT.md).

---

<p align="center">
  <a href="https://joelpasapera.github.io/StatSim-Pro/" title="Abrir StatSim Pro en el navegador">
    <img src="docs/img/abrir-statsim-pro.svg" width="360" alt="▶ Abrir StatSim Pro (joelpasapera.github.io/StatSim-Pro)">
  </a>
</p>

**Hecho con ❤️ para la comunidad académica hispanohablante.**