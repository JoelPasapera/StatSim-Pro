# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StatSim Pro is a single-page, **zero-build, dependency-free** browser app (Spanish UI) for psychology/social-science students. It does two things: simulates statistical datasets from target means/SDs, and runs an SPSS-style analyzer. The analyzer offers two analysis types (selected by the `tipoAnalisis` radio): **correlation** between two quantitative variables (normality test → Pearson/Spearman → CI/effect size/regression → hypothesis test → auto-generated thesis prose) and **group comparison** of a quantitative variable across a grouping variable: 2 groups → Student/Welch t-test or Mann-Whitney U (with Cohen's d); 3+ groups → one-way ANOVA or Kruskal-Wallis (with η²/ε² and Bonferroni post-hoc), chosen by normality per group + Levene. Everything runs client-side; no server, no package manager, no transpilation.

## Running & testing

- **Run the app:** open `index.html` directly in a modern browser. No server needed.
- **No automated test suite.** Verification is manual via two standalone harness pages:
  - `test-generador.html` — exercises the data generator (`GeneradorDatos`).
  - `probargraficas.html` — exercises the charting library (`ScientificCharts`).
  Open these in a browser and read the console / on-page output.
- The only third-party file is `d3.v7.min.js` (vendored, used by `graficas.js`). Do not add a bundler or npm — the project is intentionally script-tag based.

## Architecture

Scripts load in a fixed order in `index.html` (order matters — later modules depend on globals set by earlier ones):

`generador-datos.js` → `analizador-estadistico.js` → `interpretaciones-estadisticas.js` → `graficas.js` → `app.js`

Each module attaches a singleton or class to `window`:

- **`generador-datos.js`** — `class GeneradorDatos`, instance `generadorDatos`. Reads the "Pruebas Aplicadas" + "Sociodemográficos" tables, generates per-item normal values (see *Generation algorithm* below), exposes `datosGenerados`.
- **`analizador-estadistico.js`** — `class AnalizadorEstadisticoProfesional`, singleton `window.AnalizadorEstadistico`. The statistical core, implemented by hand (no libraries) and validated against R/SPSS. Covers: normality (**Shapiro-Wilk** by Royston 1992 + Blom scores; **Kolmogorov-Smirnov** with the **Lilliefors** correction — Dallal-Wilkinson/Khorzad), **Pearson**/**Spearman** correlation with p-values via the regularized incomplete beta by continued fraction (`betaIncompleta`/`fraccionContinuaBeta`, `lnGamma`), **descriptives** (incl. SPSS G1/G2 skew/kurtosis), **confidence interval** of the coefficient (Fisher z; Bonett-Wright for Spearman), **effect size** r², **simple linear regression** (`calcularRegresionLineal`), **Cronbach's alpha** reliability (`calcularAlfaCronbach`/`calcularFiabilidadVariable`), dimension-level correlations, **group comparison** (`compararGrupos` for 2 groups: Levene/Brown-Forsythe, Student & Welch t-tests, Mann-Whitney U, Cohen's d; `compararVariosGrupos` for 3+: one-way ANOVA, Kruskal-Wallis, Bonferroni post-hoc, F & chi-square p-values via the incomplete beta/gamma), the inverse normal quantile (`cuantilNormalEstandar`, Acklam), and prose generators (`generarHipotesis`, `generarMarcoMetodologico`, `generarDiscusion`, `generarReporteCompleto`). The analyzer's report sections (rendered by `app.js`): descriptives → reliability → normality (with Q-Q plots) → correlation (with CI & r²) → regression → scatter plot → hypothesis decision → APA report → dimensions → discussion.
- **`interpretaciones-estadisticas.js`** — `const InterpretacionesEstadisticas` on `window`. Turns numeric results into narrative Spanish interpretation text with academic citations (Sampieri, Cohen, etc.).
- **`graficas.js`** — `class ScientificCharts` + `ScientificChartsBuilder` on `window`. D3-based APA/IEEE-styled charts: gaussian, correlation matrix, boxplot, violin, **scatter plot with regression line** (`createScatterPlot`, used for the analyzed pair) and **Q-Q plot** (`createQQPlot`, used in the normality section). Builder pattern.
- **`app.js`** — UI coordinator. No business logic of its own: wires DOM events, owns navigation between `#simulador`/`#analizador`/`#ayuda`/`#contacto` sections, and passes data between modules. Cross-module hand-off goes through **`window.datosGenerados`** (the generator writes it; the analyzer reads it via "Usar Datos Generados").

`styles.css` holds all styling. `favicon.svg` is the logo.

## Key statistical conventions (don't "fix" these — they're intentional design)

- **Normality test selection:** N < 50 → Shapiro-Wilk; N ≥ 50 → Kolmogorov-Smirnov.
- **Correlation selection:** both variables normal → Pearson; otherwise → Spearman.
- **Significance:** α = 0.05; p < .05 rejects H₀.
- **Correlation strength** uses Cohen's bands (see `interpretarCorrelacion`).
- All p-value math is implemented from scratch — changes here affect every downstream interpretation and the generated thesis text. The implementations are validated against R/SPSS (e.g. `shapiro.test`, the t-distribution two-tailed p, Lilliefors `lillie.test`); verify against those references before changing them.
- The test *selection* rules above are intentional; the *implementations* behind them have been corrected to match R/SPSS — do not revert them to simpler/approximate versions.

## Generation algorithm gotcha

The generator was rewritten (see `CORRECCIONES_APLICADAS.md`) to fix an excess-zeros bug. Items are now generated **individually** with `mediaPorItem = total / numItems` and `desviacionPorItem = desviacionTotal / sqrt(numItems)`, then clamped to each test's Mín/Máx per item. Do not revert to the old proportional/Dirichlet distribution — it concentrated values at 0.

## CSV formats

- **Configuration import/export** (per table): `ejemplo_configuracion_pruebas.csv`, `ejemplo_configuracion_sociodemograficos.csv` — these configure the generator, not the data itself.
- **Generated/analyzable dataset:** `ejemplo_base_datos_simulada.csv` — header row + comma-separated numeric data; what the analyzer's CSV upload expects.

## Conventions

- Code, comments, identifiers, and UI strings are **Spanish**. Match this when editing.
- User feedback is via `mostrarToast(mensaje, tipo)` (`success`/`warning`/etc.), defined in `app.js`.
- DOM is queried by hard-coded element IDs from `index.html`; renaming an ID means updating both the HTML and the corresponding `app.js` listener.
