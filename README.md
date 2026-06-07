# StatSim Pro - Simulador y Analizador Estadístico

## 📊 Descripción

StatSim Pro es una aplicación web para simular bases de datos estadísticos y realizar análisis correlacionales al estilo SPSS. 


## 🎓 Público objetivo

- Estudiantes de psicología, educación, sociología y ciencias de la salud
- Investigadores que necesitan análisis rápidos sin licencias de software propietario
- Docentes que buscan herramientas accesibles para enseñar estadística



&gt; Implementado 100 % en el navegador. Sin frameworks pesados, sin backend, sin instalación. Pruebalo aqui 👇!

[![GitHub Pages](https://img.shields.io/badge/🌐_Demo_Online-StatSim_Pro-2E5BBA?style=for-the-badge)](https://joelpasapera.github.io/StatSim-Pro)

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
| | p-valor | **0.0001** | **&lt; .001** | — |

&gt; ¹ SPSS reporta *p* = 0.200 como **límite inferior de la significación verdadera** (ver pie de tabla en SPSS). StatSim Pro calcula el valor p exacto mediante la aproximación de Dallal-Wilkinson/Khorzad, arrojando un resultado más informativo (*p* = 0.3599).

### Capturas de pantalla

**Correlación de Spearman — StatSim Pro vs. SPSS**
![image](https://github.com/JoelPasapera/StatSim-Pro.github.io/blob/fec7b57c8f97627c3b8cb247d32ca96407bb5d67/Evidencia%20%5BSPSS%5D%20-%20Correlaci%C3%B3n.png)

**Pruebas de normalidad — StatSim Pro vs. SPSS**

![image](https://github.com/JoelPasapera/StatSim-Pro.github.io/blob/fec7b57c8f97627c3b8cb247d32ca96407bb5d67/Evidencia%20%5BSPSS%5D%20-%20Prueba%20de%20normalidad.png)


## 📚 Motor estadístico implementado desde cero

- **Shapiro-Wilk** — Algoritmo de Royston (1992, AS R94), mismo que usan R y SPSS
- **Kolmogorov-Smirnov** — Corrección de Lilliefors (Dallal-Wilkinson / Khorzad)
- **Correlación** — Pearson y Spearman con intervalos de confianza (Fisher z; Bonett-Wright para Spearman)
- **Pruebas t** — Student y Welch
- **ANOVA** — Una vía con η²
- **No paramétricas** — Mann-Whitney U, Kruskal-Wallis con ε²
- **Chi-cuadrado** — Independencia con V de Cramér
- **Regresión** — Lineal simple por mínimos cuadrados
- **Fiabilidad** — Alfa de Cronbach por escala y dimensiones
- **p-valores** — Beta incompleta regularizada por fracción continua de Lentz (Numerical Recipes)

---

## 🚀 Uso

1. Abre la demo: [joelpasapera.github.io/StatSim-Pro.github.io](https://joelpasapera.github.io/StatSim-Pro.github.io/)
2. Ve a la pestaña **Simulador** para generar una base de datos
3. Ve a la pestaña **Analizador** para cargar tus datos (CSV) o usar los generados
4. Selecciona variables, tipo de análisis y ejecuta


&gt; *"Construido para resolver un problema que vivía todos los días: perder horas en SPSS sin entender qué hacía. Ahora el análisis y la interpretación están en un solo clic."*

---

## ✨ Características

### Generador de Base de Datos
- ✅ Simulación de datos controlados con media y desviación estándar
- ✅ Soporte para múltiples pruebas psicométricas
- ✅ Variables sociodemográficas personalizables
- ✅ Generación siguiendo distribución normal
- ✅ Exportación a formato CSV
- ✅ Vista previa de datos generados

### Analizador Estadístico
- ✅ Pruebas de normalidad automáticas (Shapiro-Wilk / Kolmogorov-Smirnov)
- ✅ Correlaciones de Pearson y Spearman
- ✅ Selección automática de prueba según normalidad
- ✅ Pruebas bilaterales y unilaterales
- ✅ Prueba de hipótesis con interpretación automática
- ✅ Generación de plantilla de discusión
- ✅ Resultados al estilo SPSS

---

## 🚀 Cómo Usar

---

### 1. Generar Base de Datos

#### Paso 1: Configuración General
- Ingresa el **tamaño muestral** (N) - mínimo 2 participantes

#### Paso 2: Agregar Pruebas Aplicadas
- Haz clic en **"+ Agregar Prueba"** para añadir filas
- Para cada prueba completa:
  - **Nombre**: Ej: "WAIS-IV", "TMMS-24"
  - **N° de Ítems**: Cantidad de preguntas (Ej: 60)
  - **Media**: Promedio esperado (Ej: 100)
  - **Desviación Estándar**: Variabilidad (Ej: 15)

#### Paso 3: Agregar Variables Sociodemográficas
- Haz clic en **"+ Agregar Variable"**
- Completa:
  - **Categoría**: Nombre (Ej: "Edad", "Sexo")
  - **Promedio**: Valor medio (Ej: 20 para edad)
  - **Desviación Estándar**: Variabilidad

**Nota sobre Sexo:** Si agregas "Sexo" codificado como 1=Masculino, 2=Femenino:
- Promedio: 1.5 (para distribución 50/50)
- Desviación: 0.5

#### Paso 4: Generar
- Haz clic en **"Generar Base de Datos"**
- Revisa la vista previa
- Descarga el CSV si lo deseas

---

### 2. Analizar Datos

#### Opción A: Usar Datos Generados
1. Genera una base de datos primero
2. Ve a la sección **"Analizador"**
3. Haz clic en **"Usar Datos Generados"**

#### Opción B: Subir Archivo CSV
1. Ve a la sección **"Analizador"**
2. Haz clic en **"Subir Archivo CSV"**
3. Selecciona tu archivo `.csv`

#### Paso 2: Seleccionar Variables
- Elige **Variable 1** del menú desplegable
- Elige **Variable 2** del menú desplegable
- Selecciona tipo de prueba:
  - **Bilateral (2 colas)**: Para hipótesis no direccionales
  - **Unilateral (1 cola)**: Para hipótesis direccionales

#### Paso 3: Ejecutar Análisis
- Haz clic en **"Ejecutar Análisis"**
- Revisa los 4 apartados de resultados:
  1. Prueba de Normalidad
  2. Análisis de Correlación
  3. Prueba de Hipótesis
  4. Discusión (Plantilla editable)

#### Paso 4: Descargar Resultados
- Haz clic en **"Descargar Resultados"** para obtener un archivo .txt

---

## 📋 Lógica del Análisis

### Prueba de Normalidad Automática

```
SI N < 50:
    Usar Shapiro-Wilk
SI NO:
    Usar Kolmogorov-Smirnov
```

### Selección de Correlación Automática

```
SI Variable1 es NORMAL Y Variable2 es NORMAL:
    Usar Correlación de Pearson
SI NO:
    Usar Correlación de Spearman (Rho)
```

### Prueba de Hipótesis

```
SI p-valor < 0.05:
    Rechazar H₀ → Existe correlación significativa
SI NO:
    No rechazar H₀ → No hay correlación significativa
```

---

## 💡 Ejemplo de Uso

### Caso: Desconexión Moral y Competencia Ciudadana

**1. Generador:**
- Tamaño muestral: 100
- Pruebas:
  - Desconexión Moral: 30 ítems, M=45, DE=8
  - Competencia Ciudadana: 25 ítems, M=50, DE=10
- Sociodemográficos:
  - Edad: M=20, DE=2
  - Sexo: M=1.5, DE=0.5

**2. Análisis:**
- Variable 1: Total_DM (Desconexión Moral)
- Variable 2: Total_CC (Competencia Ciudadana)
- Tipo: Bilateral

**3. Interpretación:**
Si p = 0.495:
- No se rechaza H₀
- No existe relación estadísticamente significativa

---

## 📁 Estructura de Archivos

```
StatSim-Pro/
│
├── index.html                  # Página principal
├── styles.css                  # Estilos elegantes
├── generador-datos.js          # Lógica de simulación
├── analizador-estadistico.js   # Lógica de análisis
├── app.js                      # Coordinador de interfaz
└── README.md                   # Este archivo
```

---

## 🎨 Diseño

La aplicación combina:
- **Tipografías limpias**: Inter (sans-serif) para legibilidad
- **Paleta minimalista**: Negro, blanco, grises con acentos dorados
- **Navegación intuitiva**: Secciones claras y transiciones suaves
- **Responsive**: Adaptable a diferentes tamaños de pantalla

---

## ⚙️ Requisitos Técnicos

- **Navegador moderno** (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- **JavaScript habilitado**
- **No requiere conexión a internet** (funciona offline)

---

## 🔬 Validaciones Implementadas

### Generador:
- ✅ Tamaño muestral mínimo: 2
- ✅ Desviación estándar > 0
- ✅ Al menos 1 prueba y 1 variable sociodemográfica
- ✅ Advertencias para valores poco realistas

### Analizador:
- ✅ Mínimo 3 observaciones para normalidad
- ✅ Variables diferentes para correlación
- ✅ Valores numéricos válidos
- ✅ Mismo N para ambas variables

---

## 📊 Interpretación de Correlaciones

### Fuerza (según Cohen):
- **< 0.1**: Nula o muy débil
- **0.1 - 0.3**: Débil
- **0.3 - 0.5**: Moderada
- **0.5 - 0.7**: Moderada-fuerte
- **0.7 - 0.9**: Fuerte
- **≥ 0.9**: Muy fuerte

### Significancia:
- **p < .001**: Altamente significativa (***)
- **p < .01**: Muy significativa (**)
- **p < .05**: Significativa (*)
- **p ≥ .05**: No significativa (ns)

---

## 🐛 Solución de Problemas

### "No hay datos generados"
→ Genera una base de datos primero en la sección Simulador

### "Las variables deben ser diferentes"
→ Selecciona dos variables distintas para correlacionar

### "Archivo CSV inválido"
→ Verifica que el archivo tenga encabezados y datos separados por comas

### Los resultados no se muestran
→ Revisa la consola del navegador (F12) para ver errores

---

## 📚 Referencias Estadísticas

- Shapiro, S. S., & Wilk, M. B. (1965). An analysis of variance test for normality
- Kolmogorov, A. (1933). Sulla determinazione empirica di una legge di distribuzione
- Pearson, K. (1895). Notes on regression and inheritance
- Spearman, C. (1904). The proof and measurement of association between two things

---

## 🎓 Recomendaciones de Uso

1. **Para tesis**: Usa datos simulados solo para practicar el análisis. Los datos reales son necesarios para publicación.

2. **Parámetros realistas**: Consulta manuales técnicos de instrumentos para obtener medias y DE esperables.

3. **Tamaño muestral**: 
   - Mínimo 30 para análisis correlacional
   - 50-100 para estudios piloto
   - 100+ para tesis de licenciatura

4. **Interpretación**: La aplicación genera plantillas. Personalízalas con tu marco teórico y literatura específica.

---

## 🛠️ Tecnología

| Aspecto | Elección |
|---------|----------|
| **Frontend** | HTML5, CSS3, JavaScript puro (vanilla JS) |
| **Gráficos** | D3.js v7 (única dependencia externa, vendoreada) |
| **Build** | Ninguno. Zero-build, zero-config |
| **Backend** | Ninguno. Todo el procesamiento es client-side |
| **Hosting** | GitHub Pages (gratuito) |

---

## 🔄 Próximas Mejoras (Sugeridas)

- [ ] Análisis de regresión lineal
- [ ] Pruebas t de Student
- [ ] ANOVA de un factor
- [ ] Gráficos interactivos
- [ ] Exportar resultados a PDF
- [ ] Guardar proyectos en localStorage
- [ ] Análisis de confiabilidad (Alfa de Cronbach)
- [ ] Estadísticas descriptivas avanzadas

---

## 📞 Soporte

Para reportar errores o sugerir mejoras, revisa el código fuente y personalízalo según tus necesidades.
gmail: joelpasapera101@gmail.com

---

## 📄 Licencia

Apache License 2.0

---

**¡Éxito en tus investigaciones!** 🎓📊

*Última actualización: Mayo 2026*
