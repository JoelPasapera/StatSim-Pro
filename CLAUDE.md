# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StatSim Pro is a single-page, **zero-build, dependency-free** browser app (Spanish UI) for psychology/social-science students. It does two things: simulates statistical datasets from target means/SDs, and runs SPSS-style correlation analysis (normality test → Pearson/Spearman → hypothesis test → auto-generated thesis prose). Everything runs client-side; no server, no package manager, no transpilation.

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
- **`analizador-estadistico.js`** — `class AnalizadorEstadisticoProfesional`, singleton `window.AnalizadorEstadistico`. The statistical core. Implements (by hand, no libraries) Shapiro-Wilk, Kolmogorov-Smirnov, Pearson, Spearman, p-values via incomplete beta / t-distribution (`betaIncompleta`, `lnGamma`), descriptives, skew/kurtosis, dimension-level correlations, and prose generators (`generarHipotesis`, `generarMarcoMetodologico`, `generarDiscusion`, `generarReporteCompleto`).
- **`interpretaciones-estadisticas.js`** — `const InterpretacionesEstadisticas` on `window`. Turns numeric results into narrative Spanish interpretation text with academic citations (Sampieri, Cohen, etc.).
- **`graficas.js`** — `class ScientificCharts` + `ScientificChartsBuilder` on `window`. D3-based APA/IEEE-styled charts (gaussian, correlation matrix, boxplot, violin). Builder pattern.
- **`app.js`** — UI coordinator. No business logic of its own: wires DOM events, owns navigation between `#simulador`/`#analizador`/`#ayuda`/`#contacto` sections, and passes data between modules. Cross-module hand-off goes through **`window.datosGenerados`** (the generator writes it; the analyzer reads it via "Usar Datos Generados").

`styles.css` holds all styling. `favicon.svg` is the logo.

## Key statistical conventions (don't "fix" these — they're intentional design)

- **Normality test selection:** N < 50 → Shapiro-Wilk; N ≥ 50 → Kolmogorov-Smirnov.
- **Correlation selection:** both variables normal → Pearson; otherwise → Spearman.
- **Significance:** α = 0.05; p < .05 rejects H₀.
- **Correlation strength** uses Cohen's bands (see `interpretarCorrelacion`).
- All p-value math is implemented from scratch — changes here affect every downstream interpretation and the generated thesis text.

## Generation algorithm gotcha

The generator was rewritten (see `CORRECCIONES_APLICADAS.md`) to fix an excess-zeros bug. Items are now generated **individually** with `mediaPorItem = total / numItems` and `desviacionPorItem = desviacionTotal / sqrt(numItems)`, then clamped to each test's Mín/Máx per item. Do not revert to the old proportional/Dirichlet distribution — it concentrated values at 0.

## CSV formats

- **Configuration import/export** (per table): `ejemplo_configuracion_pruebas.csv`, `ejemplo_configuracion_sociodemograficos.csv` — these configure the generator, not the data itself.
- **Generated/analyzable dataset:** `ejemplo_base_datos_simulada.csv` — header row + comma-separated numeric data; what the analyzer's CSV upload expects.

## Conventions

- Code, comments, identifiers, and UI strings are **Spanish**. Match this when editing.
- User feedback is via `mostrarToast(mensaje, tipo)` (`success`/`warning`/etc.), defined in `app.js`.
- DOM is queried by hard-coded element IDs from `index.html`; renaming an ID means updating both the HTML and the corresponding `app.js` listener.
