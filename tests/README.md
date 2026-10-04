# Pruebas de StatSim Pro

Desde la raíz del repositorio, con Node 18+ (y Python 3 con NumPy y SciPy para los oráculos):

    npm test                 modo rápido: pruebas del runner nativo (unit, integration, ui) y escenarios, en paralelo (≈ medio minuto)
    npm run test:completo    todo: añade mutaciones, sondas, fuzz y los dos oráculos en Python (≈ un minuto)
    npm run test:cobertura   las pruebas del runner con el informe de cobertura de Node

En Windows, si tarda mucho más, casi siempre es el antivirus analizando cada lectura de archivo de Node:
añade la carpeta del proyecto a las exclusiones de Windows Defender.

- `unit/`: pruebas unitarias de `core` y del dominio del Simulador.
- `integration/`: el autotest interno (95 comprobaciones), el Worker con clonación estructurada real, escenarios compuestos, mutaciones de la validación, sondas de casos límite, el oráculo del Analizador y las cinco fuentes del Buscador con respuestas grabadas (sin red).
- `ui/`: `minidom.js` (DOM mínimo sin dependencias), `simulador.test.js` (monta `index.html` real con `src/main.js` y recorre las nueve tarjetas, la generación, el maestro y los renombrados) `analizador.test.js` (la base generada pasa al Analizador y se analiza) y `buscador-redactor.test.js` (carga y montaje sin red).
- `fuzz/`: configuraciones aleatorias con invariantes (`node tests/fuzz/fuzz.js [iteraciones] [semilla]`).
- `oracle/`: doce bases de referencia del Simulador recalculadas con NumPy el oráculo del Analizador con SciPy (`analizador_oraculo.py` → `analizador_fixture.json`) el de la V de Aiken (`aiken_oraculo.py` → `aiken_fixture.json`, con la convolución validada por enumeración) y el ordinal (`ordinal_oraculo.py` → `ordinal_fixture.json`: Φ con mpmath a 40 dígitos, Φ₂ por integración verificada con la fórmula de Owen, policóricas, α y ω ordinales) y el del bootstrap (`bootstrap_oraculo.py` → `bootstrap_fixture.json`: sfc32 bit a bit, remuestras, percentil y BCa) y el del AFE (`afe_oraculo.py` → `afe_fixture.json`: KMO, Bartlett, paralelo con el mismo sfc32, ejes principales, oblimin, varimax y promax) y el del SEM por ML (`sem_oraculo.py` → `sem_fixture.json`: forma LISREL, BFGS de SciPy con gradiente numérico, información esperada con derivadas numéricas, IC del RMSEA con la χ² no central; también CR, AVE y HTMT) y el de concordancia (`concordancia_oraculo.py` → `concordancia_fixture.json`: κ de Cohen con scikit-learn, κ de Fleiss, CCI e IC con la F de SciPy), sin usar el sitio.
- La batería exige que la versión coincida en `src/version.js`, `index.html` (`?v=` de `src/main.js`) y `version.json`.

Al tocar cualquier módulo: sube `VERSION` en `src/version.js` y el `?v=` de `src/main.js` en `index.html`, y ejecuta la batería antes de publicar.

## Monte Carlo

`montecarlo/wlsmv.mjs` (en `npm run test:completo`) simula 600 muestras de un modelo conocido y comprueba que la Γ analítica, los errores estándar robustos, la tasa de rechazo del χ² corregido y las cargas se comportan como promete la teoría, con márgenes para el error de simulación. Es solo Node: corre también sin Python.

Oráculo de invarianza (`oracle/invarianza_oraculo.py` → `invarianza_fixture.json`): AFC multigrupo por ML con medias programado desde cero en NumPy y minimizado con SciPy, dos conjuntos (intercepto no invariante con 2 grupos; invariante con 3 grupos), cuatro niveles, índices, IC del RMSEA con `ncx2`, medias latentes con EE por hessiana numérica y la CDF de la χ² no central.

Monte Carlo de la invarianza ordinal (`montecarlo/invarianza-ordinal.mjs`): 200 réplicas con invarianza verdadera (tasas de rechazo de DIFFTEST y del χ² corregido, sesgo y calibración del EE de la media latente) y 60 de potencia (interceptos y umbrales no invariantes). Una segunda simulación (`montecarlo/invarianza-ordinal-multifactor.mjs`, 100 réplicas) cubre dos factores correlacionados, una covarianza residual, tres grupos e ítems de 3 y 5 categorías.

Oráculo de las relaciones con forma (`oracle/formas_generar.mjs` → `oracle/formas_oraculo.py`): Node genera 68 bases con las 17 curvas del atlas y Python las analiza con las funciones reescritas desde las ecuaciones (η, identidad r(X, Y) = η·r(f(X), X), identificación de la forma entre las 17 con correlación con signo, Media, DE, α y tercera correlación en las bases sin aviso). Nota: una ANOVA del residuo por valores de X rechaza menos del 5 % porque el modo exacto hace el residuo ortogonal a X y a f(X) en la muestra; es esperable, no un defecto.
