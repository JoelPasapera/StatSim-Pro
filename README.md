# 📊 ¿Qué es "Sig." en SPSS?

Cuando realizas una prueba estadística en SPSS, uno de los valores más importantes que encontrarás es **"Sig."**, abreviatura de **significación estadística** (*significance*).

En la práctica, **"Sig." es el valor p (p-value)**.

Comprender este número es fundamental para interpretar correctamente los resultados de cualquier análisis estadístico.

---

# 🧠 La idea detrás del valor p

Toda prueba estadística comienza con una suposición inicial llamada:

## Hipótesis nula (H₀)

La hipótesis nula representa la ausencia de efecto, diferencia o relación.

Por ejemplo, en una prueba de correlación:

> **H₀:** No existe ninguna relación entre las variables.  
> La correlación real en la población es igual a cero.

---

# ❓ ¿Qué responde el valor "Sig."?

El valor p responde a la siguiente pregunta:

> **Si realmente no existiera ninguna relación entre las variables, ¿qué tan probable sería obtener un resultado como el observado (o incluso más extremo) únicamente por azar?**

---

# 📉 Interpretación del valor "Sig."

## Cuando Sig. es pequeño

```text
Sig. < 0,05
```

Esto significa:

> Sería poco probable obtener este resultado si la hipótesis nula fuera cierta.

Por lo tanto:

✅ Se rechaza la hipótesis nula.

✅ Se concluye que existe una relación estadísticamente significativa.

---

## Cuando Sig. es grande

```text
Sig. > 0,05
```

Esto significa:

> El resultado observado es compatible con la existencia de azar.

Por lo tanto:

❌ No se rechaza la hipótesis nula.

❌ No existe evidencia suficiente para afirmar que hay una relación.

---

# 🎯 La regla práctica

En la mayoría de investigaciones se utiliza un nivel de significación de:

```text
α = 0,05
```

Este valor se conoce como **nivel de significación** o **alfa (α)**.

### Regla rápida

| Valor de Sig. | Interpretación |
|--------------|---------------|
| **Sig. < 0,05** | Resultado significativo |
| **Sig. ≥ 0,05** | Resultado no significativo |

> ⚠️ El valor 0,05 es una convención científica ampliamente aceptada, no una ley natural.

---

# 🚨 Errores comunes al interpretar el valor p

## Error 1: Creer que el valor p es la probabilidad de que H₀ sea verdadera

Incorrecto.

El valor p **NO** indica:

> "La probabilidad de que la hipótesis nula sea cierta."

Lo que realmente indica es:

> "La probabilidad de obtener estos datos (o unos más extremos) suponiendo que la hipótesis nula sea cierta."

Es una diferencia sutil, pero fundamental.

---

## Error 2: Pensar que un resultado no significativo demuestra que no existe relación

Incorrecto.

Un resultado no significativo simplemente indica:

> No se encontró evidencia suficiente para detectar una relación con los datos disponibles.

Esto no demuestra que la relación no exista.

Puede ocurrir que:

- La muestra sea demasiado pequeña.
- El efecto sea débil.
- El estudio no tenga suficiente potencia estadística.

---

# ↔️ ¿Qué significa "(bilateral)" en SPSS?

Cuando SPSS muestra:

```text
Sig. (bilateral)
```

está indicando que se utilizó una **prueba de dos colas (two-tailed test)**.

Esto significa que el análisis considera ambas posibilidades:

- Una relación positiva (+)
- Una relación negativa (−)

sin asumir previamente cuál será la dirección del efecto.

Es el procedimiento más utilizado en investigación científica.

---

# 📌 Resumen rápido

| Situación | Interpretación |
|------------|---------------|
| Sig. < 0,05 | Existe evidencia estadística de relación |
| Sig. ≥ 0,05 | No existe evidencia suficiente de relación |
| Valor p | Probabilidad de los datos asumiendo que H₀ es verdadera |
| No significativo | No prueba ausencia de relación |
| Sig. (bilateral) | Prueba de dos colas |

---

## 🎓 En una sola frase

> El valor **"Sig."** indica qué tan compatibles son los datos observados con la hipótesis de que no existe relación entre las variables. Cuanto más pequeño sea, mayor será la evidencia estadística contra la hipótesis nula.

Tambien podrias pensarlo de la siguiente manera: 
El p-valor mide qué tan compatible es mi resultado con la idea de que no pasa nada (solo azar). Cuanto más pequeño, menos compatible, y más razones tengo para pensar que sí pasa algo.
