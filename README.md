# 📊 StatSim Pro

> *El pensamiento crítico no se reemplaza; se potencia. Como cualquier herramienta, esto existe para ampliar nuestras capacidades, no para sustituirlas. Al hacerse cargo de las tareas más mecánicas y repetitivas, nos libera para concentrarnos en aquello que genera verdadero valor: pensar, cuestionar, crear e innovar.*

StatSim Pro no solo calcula. Explica y te acompaña. De la pregunta de investigación al resultado, te ayuda a decidir qué hacer, te explica por qué y convierte el análisis en un proceso guiado, comprensible y defendible. Ahí está la diferencia respecto a otras herramientas como SPSS, R o Jamovi. StatSim Pro no busca competir contra ellas, sino acompañar al investigador de otra manera. Mientras otras herramientas te dan una respuesta, StatSim Pro te enseña por qué esa respuesta es la correcta. Te enseña el camino, no solo el resultado.

**Suite estadística y metodológica completa para tesis de psicología y ciencias sociales — 100 % en tu navegador.**

De la simulación de datos a la redacción del marco teórico: genera bases de datos realistas, ejecuta análisis con rigor de SPSS, explora tus resultados en gráficos interactivos con análisis automático, busca antecedentes en las principales bases académicas, filtra por relevancia con IA y exporta capítulos completos en Word con formato APA 7 e interpretación pedagógica.

> Implementado 100 % en el navegador. Sin frameworks, sin backend, sin instalación — y desde esta versión, **sin librerías de gráficos externas**: la visualización también es motor propio. ¡Pruébalo aquí 👇!

[![GitHub Pages](https://img.shields.io/badge/🌐_Demo_Online-StatSim_Pro-2E5BBA?style=for-the-badge)](https://joelpasapera.github.io/StatSim-Pro)

---

## 🎯 ¿Para quién es?

- Estudiantes de psicología, educación, sociología y ciencias de la salud que desarrollan su tesis
- Investigadores que necesitan análisis rápidos sin licencias de software propietario
- Docentes que buscan herramientas accesibles para enseñar estadística y metodología

> *"Construido para resolver un problema que vivía todos los días: perder horas en SPSS sin entender qué hacía. Ahora el análisis y la interpretación están en un solo clic."*

---

## 📊 Evidencia de validación

Los resultados arrojados por **StatSim Pro** fueron comparados directamente con los reportados por **IBM SPSS Statistics** (versión estándar de laboratorio) sobre la **misma base de datos**.

### Archivo de prueba

- [`base_datos_simulada.csv`](./base_datos_simulada.csv) — Base de datos simulada generada con el módulo interno de StatSim Pro (*N* = 300 participantes, variables `Total_R` y `Total_T`).

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

![image](https://github.com/JoelPasapera/StatSim-Pro.github.io/blob/fec7b57c8f97627c3b8cb247d32ca96407bb5d67/Evidencia%20%5BSPSS%5D%20-%20Correlaci%C3%B3n.png)

**Pruebas de normalidad — StatSim Pro vs. SPSS**

![image](https://github.com/JoelPasapera/StatSim-Pro.github.io/blob/fec7b57c8f97627c3b8cb247d32ca96407bb5d67/Evidencia%20%5BSPSS%5D%20-%20Prueba%20de%20normalidad.png)

Además de la comparación con SPSS, cada módulo estadístico se verifica contra **casos con solución conocida** (valores de tabla, ejemplos resueltos a mano y recuperación exacta de coeficientes sintéticos), incluyendo estudios de calibración por simulación (p. ej., 300 réplicas normales para confirmar la tasa nominal de falsos positivos de Lilliefors ≈ 5 %).

---

## 📚 Motor estadístico implementado desde cero

Sin librerías estadísticas externas: cada fórmula está escrita y verificada en el propio proyecto.

- **Shapiro-Wilk** — Algoritmo de Royston (1992, AS R94), el mismo que usan R y SPSS
- **Kolmogorov-Smirnov** — Corrección de Lilliefors (Dallal-Wilkinson / Khorzad)
- **Correlación** — Pearson y Spearman con intervalos de confianza (Fisher z; Bonett-Wright para Spearman)
- **Pruebas t** — Student (varianzas agrupadas) y Welch (Satterthwaite)
- **ANOVA** — Una vía con η²
- **No paramétricas** — U de Mann-Whitney (empates + corrección de continuidad) y Kruskal-Wallis con corrección de empates y ε²
- **Levene** — Homogeneidad de varianzas (centrado en la media, como SPSS)
- **Chi-cuadrado** — Independencia con V de Cramér
- **Regresión** — Lineal simple y **múltiple (OLS matricial)** con B, EE, β estandarizados, t, p, IC 95 %, R², R² ajustado, F del modelo y **VIF** por predictor
- **Fiabilidad** — Alfa de Cronbach por escala y dimensiones
- **Comparaciones múltiples** — Corrección de Holm
- **Potencia post-hoc** — Aproximación de Fisher para correlaciones
- **p-valores** — Beta y gamma incompletas regularizadas por fracción continua de Lentz (Numerical Recipes)

---

## 🎨 Motor de visualización propio (statviz.js)

Desde esta versión, StatSim Pro **ya no depende de D3.js**: los gráficos se dibujan con `statviz.js`, un motor SVG ligero (~33 KB sin minificar, frente a ~280 KB de D3) escrito desde cero para el proyecto, que implementa exactamente el contrato que la app necesita:

- Escalas lineales (con `nice`, ticks y **formato adaptativo de decimales** según el paso), de banda y secuenciales
- Ejes con estilos legibles en tema oscuro, selecciones data-join (`data/enter/exit/join`), generadores de línea y área con **curvas B-spline** (curveBasis) y cierre lineal
- Histogramas con umbrales, jerarquías con empaquetado de círculos y proyección geográfica Natural Earth para el panorama mundial
- Verificado con una **batería de regresión propia** (jsdom) que cubre estadísticos, escalas, ejes, áreas de violín, empaquetado y geografía

---

## ✨ Características

### 🎲 Generador de bases de datos (Simulador)

- ✅ Simulación de datos controlados con media y desviación estándar objetivo
- ✅ Soporte para múltiples pruebas psicométricas con ítems, dimensiones y puntajes de escala
- ✅ Variables sociodemográficas personalizables (sexo, edad, carrera, etc.)
- ✅ Generación siguiendo distribución normal, con **reglas de coherencia** entre ítems y totales (fuente única de fórmulas compartida con la validación)
- ✅ Guía de coherencia en vivo que avisa de configuraciones contradictorias
- ✅ Correlación objetivo entre escalas para simular relaciones realistas
- ✅ Exportación a CSV (con BOM, compatible con Excel) y vista previa

### 🔬 Analizador estadístico

- ✅ Carga de CSV propio o de los datos generados, con vista previa (N y variables)
- ✅ **Etiquetas de variables**: renombra puntajes de escala (`General_IE` → “Inteligencia emocional”) y toda la app y el Word usan el nombre legible
- ✅ Configuración de la investigación (título, unidad de análisis, contexto) y de dimensiones por variable
- ✅ **Correlación bivariada** (Pearson/Spearman elegido automáticamente según normalidad; bilateral o unilateral) con IC 95 %, interpretación de fuerza y dirección
- ✅ **Comparación entre grupos con protocolo automático**: la app evalúa normalidad por grupo + Levene y elige sola — t de Student, **t de Welch** o U de Mann-Whitney (2 grupos); ANOVA o Kruskal-Wallis (3+), con **post-hoc por pares y corrección de Holm** — explicando siempre *por qué* eligió esa prueba, con tamaños del efecto (d, r, η², ε²) y su magnitud
- ✅ **Asociación de categóricas** (Chi² con V de Cramér)
- ✅ **Análisis multivariado**: matriz de correlaciones interactiva para 2+ variables (método por par según normalidad, p corregidos por Holm) y **regresión lineal múltiple** con selector de dependiente + múltiples predictores, tabla completa de coeficientes, VIF, normalidad de residuos y **efecto crudo vs. ajustado** del predictor focal
- ✅ **Lectura causal honesta**: la sección “De la correlación al control estadístico” explica las tres condiciones causales y por qué un diseño transversal aporta asociación ajustada, necesaria pero no suficiente
- ✅ Criba automática de correlaciones por dimensiones para los objetivos específicos (priorizada y con Holm)
- ✅ Hallazgos según variables sociodemográficas (pruebas según la naturaleza de cada variable)
- ✅ Interpretaciones en lenguaje llano de cada resultado
- ✅ Marco metodológico asistido: pregunta, objetivo general, objetivos específicos, hipótesis H₀/H₁ y **matriz de consistencia** construida automáticamente

### 📈 Dashboard de gráficos interactivos con análisis automático

- ✅ **Selector de variables con casillas**: elige qué variables graficar (2–8) y todos los gráficos, junto con sus análisis, se redibujan al instante
- ✅ **Distribución de puntajes: teórica vs. empírica** — para cada variable, la curva normal N(μ, σ) (continua) se contrasta con la **densidad empírica de los datos reales** (KDE de Silverman, punteada): la comparación visual delata asimetrías y bimodalidades antes de las pruebas formales; con líneas de media, cursor en cruz con coordenadas y rejilla tenue
- ✅ **Matriz de correlaciones exploratoria**: paleta divergente diseñada para tema oscuro (sin celdas blancas), contraste del texto por luminancia real, celdas y tipografía adaptativas, etiquetas de variables completas y **tooltip por celda** con coeficiente (Pearson o Spearman según la normalidad de ese par), p aproximado, N, IC 95 % (Fisher) e interpretación en lenguaje natural
- ✅ **Diagrama de caja investigable**: lienzo proporcional al número de variables, etiquetas del eje en diagonal, **tooltip con los estadísticos completos de cada caja** (N, mediana, cuartiles, RIC, mínimo, máximo, atípicos) y **ficha por cada punto atípico** (valor, límites de Tukey e identificador del participante)
- ✅ **Análisis automático bajo cada gráfico** (`analisis-graficos.js`): un párrafo con redacción científica publicable generado desde los datos vigentes — severidad de las desviaciones de normalidad (γ₁, γ₂) con dirección e implicación, dispersión relativa (CV), estructura correlacional (varianza compartida, cautela por comparaciones múltiples), atípicos con dirección, asimetría por mediana y bigotes, y recomendaciones condicionales (paramétricos vs. robustos; media/DE vs. mediana/RIC), con avisos automáticos por N reducido o escalas dispares
- ✅ **Ayudas pedagógicas**: botón «?» junto a cada título abre una explicación en lenguaje coloquial de qué es el gráfico, para qué sirve y qué observar
- ✅ Todos los gráficos son **responsive de verdad**: el lienzo se ajusta exactamente al contenido y al marco que lo contiene, sin recortes ni superposiciones
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
- ✅ Sección de **comparación entre grupos** (descriptivos + supuestos + contraste + post-hoc + interpretación)
- ✅ Sección de **análisis multivariado** con el modelo que el investigador ejecutó (resumen, coeficientes, crudo vs. ajustado y precisión conceptual sobre causalidad)
- ✅ Referencias APA del capítulo

### 🔎 Buscador de antecedentes académicos

- ✅ Búsqueda simultánea en **Scopus** (rotación de múltiples claves API), **PubMed**, **SciELO**, **ALICIA (Concytec)**, **Google Scholar**, **OpenAlex** y **Crossref**
- ✅ **Búsqueda intensiva con IA**: generación de criterios de inclusión/exclusión, expansión de la consulta en variantes (ES/EN) y paginación profunda
- ✅ **Análisis de relevancia con IA** (escala 1–5 con justificación) vía Cloudflare Worker con **rotación de hasta 10 claves gratuitas de Groq en paralelo**, JSON estricto y reintentos con enfriamiento automático
- ✅ Filtro por umbral de relevancia que gobierna matriz, exportaciones y redacción
- ✅ **Enriquecimiento automático por DOI en cascada**: OpenAlex → Crossref → Semantic Scholar → Europe PMC → **Scopus Abstract Retrieval** → Unpaywall (rescata resúmenes que las APIs abiertas no traen, p. ej. Elsevier), con recuperación de autores y año
- ✅ **Matriz de revisión bibliográfica de 15 columnas**: Relevancia, Título, **Autor**, Año, Contexto (país), Objetivos, Muestra, Instrumentos, Resultados, Conclusiones, Revista, Cuartil, Indexación, Referencia APA y Link/DOI
- ✅ Métricas de revista (cuartil SJR e indexación) y detección de país y muestra desde el resumen
- ✅ Exportación a **Excel** (formato APA: Times 12, ajuste de texto, anchos calibrados) y **CSV dual** (ES con `;` y coma decimal / internacional con `,`)
- ✅ Referencias APA 7 correctas: apellidos e iniciales interpretados desde cualquier formato de las APIs (“Batbayar E.”, “E. Batbayar”, “EB Batbayar”…), “y” en español, cursivas de revista

### ✍️ Redactor de marco teórico con IA

- ✅ **Identificación de variables** de estudio a partir del problema (la IA propone, tú confirmas)
- ✅ **Documento completo de 9 secciones**: Planteamiento del problema, Estado de la cuestión, Antecedentes (en partes para cubrir todas las fuentes), Bases teóricas y Modelos teóricos por variable, Justificación y Definición conceptual de las variables — redactadas **en paralelo** por múltiples claves de IA
- ✅ **Regla de oro inviolable: toda idea lleva cita** — cada párrafo debe contener al menos una cita (parentética o narrativa) construida por la app desde la matriz; los textuales solo pueden ser literales de los resúmenes
- ✅ Selección de fuentes por afinidad temática con reparto rotatorio (las 50 fuentes se distribuyen por el documento)
- ✅ Importación de la matriz exportada (Excel/CSV) con **reparación automática por DOI** de resúmenes y autores rotos, prefiriendo la columna Autor
- ✅ Reintento automático de secciones que fallan por límites de cuota
- ✅ **Word .docx en formato APA 7**: Times New Roman 12, doble espacio, sangrías, títulos centrados, nota de verificación y **Referencias finales solo de las fuentes realmente citadas**, en orden alfabético con sangría francesa
- ✅ Botón de copiado íntegro al portapapeles
- ✅ Aviso honesto permanente: es un **borrador asistido** — verifica cada cita contra la fuente original y reescríbelo con tu voz

### 🔒 Privacidad y arquitectura

- ✅ **100 % del procesamiento estadístico ocurre en tu navegador**: tus datos nunca salen de tu equipo
- ✅ Sin backend propio ni base de datos; despliegue estático en GitHub Pages
- ✅ Vanilla JavaScript modular (sin frameworks) con **motor de visualización propio** (`statviz.js`, sin D3 ni otras librerías de gráficos); ExcelJS y html-docx-js desde CDN solo para exportaciones
- ✅ Las llamadas a IA (solo en el buscador/redactor) envían únicamente títulos y resúmenes de artículos públicos a través de un Worker propio; las claves nunca se exponen en el cliente

---

## 🚀 Uso

1. Abre la demo: [joelpasapera.github.io/StatSim-Pro](https://joelpasapera.github.io/StatSim-Pro)
2. **Simulador** → genera una base de datos realista (o salta este paso si tienes la tuya)
3. **Analizador** → carga tu CSV o usa los datos generados; etiqueta tus variables; elige el análisis (correlación, comparación de grupos, chi², multivariado) y ejecuta
4. **Explora el dashboard**: selecciona variables con las casillas, pasa el cursor por la matriz y los diagramas de caja, investiga los atípicos y lee el análisis automático bajo cada gráfico
5. Exporta el **capítulo de resultados en Word APA** con un clic
6. **Buscador** → busca antecedentes, analiza relevancia con IA, llena la matriz y expórtala
7. **Redactor** → importa la matriz, identifica variables y genera el **marco teórico completo en Word APA**

Para uso local: clona el repositorio y abre `index.html` (o sirve la carpeta con cualquier servidor estático).

```bash
git clone https://github.com/JoelPasapera/StatSim-Pro.git
cd StatSim-Pro
python -m http.server 8000   # o cualquier servidor estático
```

---

## 📁 Estructura del proyecto

| Módulo | Responsabilidad |
|---|---|
| `index.html`, `app.js`, `style.css` | Interfaz, navegación y orquestación |
| `generador-datos.js`, `guia-coherencia.js` | Simulación de datos y reglas de coherencia (fuente única) |
| `analizador-estadistico.js` | Motor estadístico central (normalidad, correlaciones, fiabilidad, Holm…) |
| `comparacion-grupos.js` | Protocolo automático t/Welch/U/ANOVA/Kruskal-Wallis + post-hoc |
| `regresion-multiple.js` | Matriz multi-variable y regresión múltiple OLS (VIF, crudo vs. ajustado) |
| `statviz.js` | **Motor de visualización propio** (escalas, ejes, selecciones, curvas, histogramas, pack, geo) — reemplaza a D3 |
| `graficas.js` | Librería de gráficos científicos: distribución teórica vs. empírica (KDE), matriz de correlaciones, boxplot, Q-Q, dispersión con banda de confianza — responsive, tema oscuro, tooltips exploratorios y cursor de coordenadas |
| `analisis-graficos.js` | Análisis automático bajo cada gráfico: redacción científica condicional a los datos, extensible por registro |
| `interpretaciones-estadisticas.js` | Redacción en lenguaje llano de los resultados |
| `criba-correlaciones.js`, `criba-sociodemografica.js`, `analisis-dimensiones.js` | Objetivos específicos y hallazgos por sociodemográficos |
| `etiquetas-variables.js`, `matriz-consistencia.js` | Nombres legibles y matriz de consistencia |
| `exportador-word.js` | Capítulo de resultados .docx APA 7 con pedagogía |
| `antecedentes.js` + `scopus/pubmed/scielo/alicia/scholar-directo.js`, `proxies-cors.js` | Buscador multi-fuente y enriquecimiento por DOI |
| `ia-asistente.js` | Cliente del Worker de IA (criterios, relevancia, redacción) |
| `redactor-teorico.js` | Marco teórico completo con citas y Word APA |

---

## ⚠️ Nota de responsabilidad académica

StatSim Pro automatiza cálculos y borradores, no el criterio del investigador. Los textos generados con IA son **borradores de trabajo**, y los análisis automáticos bajo los gráficos son **lecturas descriptivas preliminares**: contrasta cada cita con la fuente original, confirma los supuestos con las pruebas formales y reescribe con tu propia voz antes de incorporar cualquier resultado a tu tesis.

---

**Hecho con ❤️ para la comunidad académica hispanohablante.**
