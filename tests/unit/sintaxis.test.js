// sintaxis.test.js — (2027.01.19) la sintaxis equivalente en R y SPSS (analizador/informe/sintaxis.js): cada análisis da las
// dos, sin huecos («undefined», «NaN»), con los nombres de las columnas a salvo (los de R entre acentos graves si hace falta;
// los de SPSS, los del .sav del programa), las funciones y opciones de cada caso (las tres preguntas de la potencia, la
// prueba que eligió el protocolo de las relacionadas, el centrado del multinivel) y el bloque plegable con el HTML escapado.
// (2027.01.20) Y lo que corrigió la revisión: la lectura de R, los casos completos y la corrección de la esfericidad, la
// McNemar exacta de SPSS, el orden de spcor.test, la moderación centrada, lavaan con nombres que admite, los duplicados y los
// identificadores vacíos, la T de los baremos y su grupo, la potencia de un incremento de R² con λ = f²·N (frente a pwr), los
// procedimientos POWER de SPSS, la mediación de Fritz y MacKinnon, el DIF completo de la TRI y los módulos de SPSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../src/analizador/informe/sintaxis.js';
import { nombreVariableSav } from '../../src/core/data/sav/escritor.js';
import { UMBRALES } from '../../src/analizador/depuracion/deteccion-casos.js';

const sinHuecos = (/** @type {{ r: string, spss: string, nota?: string }} */ s, /** @type {string} */ que) => {
    assert.ok(s.r.length > 20 && s.spss.length > 20, `${que}: las dos sintaxis`);
    for (const t of [s.r, s.spss, s.nota || '']) assert.doesNotMatch(t, /undefined|NaN|\[object|null\b(?!\))/, `${que}: ${t}`);
};

test('los nombres: los de R, sintácticos o entre acentos graves; los de SPSS, los del .sav', () => {
    assert.equal(S.nr('Edad'), 'Edad'); assert.equal(S.nr('P.1'), 'P.1');
    assert.equal(S.nr('Edad (años)'), '`Edad (años)`'); assert.equal(S.nr('1P'), '`1P`'); assert.equal(S.nr('.5x'), '`.5x`');
    assert.equal(S.nr('a`b'), '`a\\`b`');
    assert.equal(nombreVariableSav('Edad (años)'), 'Edad__años_');
    assert.equal(nombreVariableSav('1P'), 'V1P');
    assert.equal(nombreVariableSav('ALL'), 'ALL_');
    const s = S.sintaxisParcial({ x: 'Edad (años)', y: 'Y', controles: ['1P'], spearman: false });
    assert.match(s.r, /d\$`Edad \(años\)`/); assert.match(s.r, /c\("Edad \(años\)", "Y", "1P"\)/);
    assert.match(s.spss, /PARTIAL CORR \/VARIABLES=Edad__años_ Y BY V1P/);
});

test('las relacionadas: la función de la prueba que eligió el protocolo', () => {
    const casos = /** @type {[string, RegExp, RegExp][]} */ ([
        ['t-pareada', /t\.test\(datos\$Post, datos\$Pre, paired = TRUE\)[\s\S]*# dz/, /T-TEST PAIRS=Post WITH Pre \(PAIRED\)/],
        ['wilcoxon', /wilcox\.test\(datos\$Post, datos\$Pre, paired = TRUE, exact = FALSE, correct = FALSE\)/, /NPAR TESTS \/WILCOXON=Post WITH Pre \(PAIRED\)/],
        ['mcnemar', /binom\.test\(tabla\[1, 2\], tabla\[1, 2\] \+ tabla\[2, 1\]\)/, /CROSSTABS \/TABLES=Pre BY Post\n  \/STATISTICS=MCNEMAR \/CELLS=COUNT\./]
    ]);
    for (const [prueba, r, spss] of casos) { const s = S.sintaxisRelacionadas({ medidas: ['Pre', 'Post'], prueba }); sinHuecos(s, prueba); assert.match(s.r, r); assert.match(s.spss, spss); }
    const tres = ['T1', 'T2', 'T3'];
    const rm = S.sintaxisRelacionadas({ medidas: tres, prueba: 'anova-rm' });
    assert.match(rm.r, /afex::aov_ez\(id = "id", dv = "valor", within = "medida", data = largo/); assert.doesNotMatch(rm.r, /between/);
    assert.match(rm.spss, /GLM T1 T2 T3\n  \/WSFACTOR=medida 3 Polynomial/); assert.doesNotMatch(rm.nota || '', /Lecoutre/);
    const mixto = S.sintaxisRelacionadas({ medidas: tres, grupo: 'Grupo', prueba: 'anova-mixta' });
    assert.match(mixto.r, /between = "Grupo"/); assert.match(mixto.spss, /GLM T1 T2 T3 BY Grupo[\s\S]*\/DESIGN=Grupo\./); assert.match(mixto.nota || '', /Lecoutre/);
    assert.match(S.sintaxisRelacionadas({ medidas: tres, prueba: 'friedman' }).r, /friedman\.test[\s\S]*pairwise\.wilcox\.test\([^)]*p\.adjust\.method = "holm"/);
    assert.match(S.sintaxisRelacionadas({ medidas: tres, prueba: 'cochran' }).spss, /NPAR TESTS \/COCHRAN=T1 T2 T3\./);
});

test('la potencia: el n, la potencia o el efecto, con la función de pwr de cada prueba', () => {
    const base = { alfa: 0.05, colas: 2, potenciaDeseada: 0.8, razon: 1, k: 3, gl: 1, predictores: 3, probados: 3, n2: null };
    const t2 = S.sintaxisPotencia({ ...base, modo: 'muestra', prueba: 't2', efecto: 0.5, n: 64 });
    assert.match(t2.r, /pwr::pwr\.t\.test\(d = 0\.5, power = 0\.8, sig\.level = 0\.05, type = "two\.sample", alternative = "two\.sided"\)/);
    assert.match(t2.r, /pwr::pwr\.t\.test\(d = 0\.5, n = 64,/);
    assert.match(S.sintaxisPotencia({ ...base, modo: 'potencia', prueba: 'r', efecto: 0.3, n: 84, colas: 1 }).r, /pwr::pwr\.r\.test\(r = 0\.3, n = 84, sig\.level = 0\.05, alternative = "greater"\)/);
    assert.match(S.sintaxisPotencia({ ...base, modo: 'sensibilidad', prueba: 'anova', efecto: 0.25, n: 53 }).r, /pwr::pwr\.anova\.test\(n = 53, power = 0\.8, sig\.level = 0\.05, k = 3\)/);
    assert.match(S.sintaxisPotencia({ ...base, modo: 'potencia', prueba: 'regresion', efecto: 0.15, n: 77 }).r, /pwr::pwr\.f2\.test\(f2 = 0\.15, v = 73, sig\.level = 0\.05, u = 3\)/);
    assert.match(S.sintaxisPotencia({ ...base, modo: 'muestra', prueba: 'chi2', efecto: 0.3, n: 88 }).r, /pwr::pwr\.chisq\.test\(w = 0\.3, power = 0\.8, sig\.level = 0\.05, df = 1\)/);
    assert.match(S.sintaxisPotencia({ ...base, modo: 'potencia', prueba: 't2', efecto: 0.5, n: 40, n2: 80, razon: 2 }).r, /pwr::pwr\.t2n\.test\(n1 = 40, n2 = 80, d = 0\.5/);
    const med = S.sintaxisPotencia({ ...base, modo: 'potencia', prueba: 'mediacion', efecto: 0.39, b: 0.39, cp: 0, n: 60, R: 1000, semilla: 7 });
    assert.match(med.r, /set\.seed\(7\); n <- 60; a <- 0\.39; b <- 0\.39; cp <- 0[\s\S]*replicate\(1000,[\s\S]*pa < 0\.05 && pb < 0\.05/);
    for (const prueba of ['t2', 't1', 'r', 'anova', 'chi2', 'regresion', 'mediacion']) for (const modo of ['muestra', 'potencia', 'sensibilidad']) sinHuecos(S.sintaxisPotencia({ ...base, modo, prueba, efecto: 0.3, n: 50, b: 0.3, cp: 0 }), `${prueba} ${modo}`);
});

test('la depuración, los perdidos, los baremos y la ROC, con sus umbrales y opciones', () => {
    const items = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    const d = S.sintaxisDepuracion({ items, minimo: 1, maximo: 5, enteros: true, id: 'Código', umbrales: { ...UMBRALES } });
    sinHuecos(d, 'depuración');
    assert.match(d.r, /duplicated\(datos\$`Código`, incomparables = NA\)/); assert.match(d.r, /rowSums\(it < 1 \| it > 5 \| it != round\(it\), na\.rm = TRUE\) > 0/);
    assert.match(d.r, /duplicated\(datos\[c\("P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"\)\]\)   # casos duplicados \(en los ítems\)/);
    assert.match(d.r, /rowSums\(!is\.na\(it\)\) >= 6 & careless::irv\(it\) == 0/);
    assert.match(d.spss, /DO REPEAT v = P1 P2 P3 P4 P5 P6 P7 P8\.\n  IF \(NOT MISSING\(v\) AND \(v < 1 OR v > 5 OR v <> RND\(v\)\)\) fuera_rango = fuera_rango \+ 1\.\nEND REPEAT\./);
    assert.match(d.r, /careless::longstring\(it\) >= 6/); assert.match(d.r, /abs\(scale\(it\)\) > 3\.29/); assert.match(d.r, /< 0\.001/);
    assert.match(d.spss, /SIG\.CHISQ\(D2, 8\)/);
    assert.doesNotMatch(S.sintaxisDepuracion({ items: ['A', 'B', 'C'], minimo: null, maximo: null, id: null, umbrales: { ...UMBRALES } }).r, /longstring|fuera de rango|duplicated\(datos\$/);
    const conColumnas = S.sintaxisDepuracion({ items: ['A', 'B', 'C'], minimo: null, maximo: null, id: 'ID', umbrales: { ...UMBRALES }, duplicados: ['A', 'B', 'C', 'Edad', 'Sexo'] });
    assert.match(conColumnas.r, /duplicated\(datos\[c\("A", "B", "C", "Edad", "Sexo"\)\]\)   # casos duplicados \(en las columnas que comparó el programa\)/);
    assert.match(conColumnas.spss, /con todas las variables salvo el identificador, la marca temporal y el número de fila\.\n\* Identificadores repetidos: lo mismo, con solo ID\./);
    const p0 = S.sintaxisPerdidos({ variables: ['A', 'B'], metodo: null, m: 20, iteraciones: 10, semilla: 1 });
    sinHuecos(p0, 'perdidos sin imputar'); assert.doesNotMatch(p0.r, /mice::mice/); assert.doesNotMatch(p0.spss, /MULTIPLE IMPUTATION/);
    const p1 = S.sintaxisPerdidos({ variables: ['A', 'B'], metodo: 'pmm', m: 20, iteraciones: 10, semilla: 2027 });
    assert.match(p1.r, /mice::mice\(v, m = 20, method = "pmm", maxit = 10, seed = 2027\)/); assert.match(p1.spss, /DATASET DECLARE imputadas\.[\s\S]*SCALEMODEL=PMM/);
    const b = S.sintaxisBaremos({ escala: 'Total_IAE', grupo: 'Sexo', cortes: [10, 25, 75, 90] });
    sinHuecos(b, 'baremos'); assert.match(b.r, /quantile\(datos\$Total_IAE, c\(0\.1, 0\.25, 0\.75, 0\.9\), type = 7, na\.rm = TRUE\)/); assert.match(b.spss, /\/PERCENTILES=10 25 75 90/);
    assert.match(b.r, /T = round\(50 \+ 10 \* qnorm\(as\.vector\(pc\) \/ 100\), 1\)/, 'la T, con un decimal como la tabla');
    assert.match(b.r, /lapply\(split\(datos\$Total_IAE, datos\$Sexo\), baremo\)/);
    assert.match(b.spss, /RANK VARIABLES=Total_IAE \(A\) BY Sexo[\s\S]*SPLIT FILE LAYERED BY Sexo\.\nFREQUENCIES[\s\S]*SPLIT FILE OFF\./);
    assert.doesNotMatch(S.sintaxisBaremos({ escala: 'Total_IAE', grupo: null, cortes: [25, 75] }).r, /split/);
    assert.match(p1.nota || '', /módulo Missing Values/);
    const r = S.sintaxisROC({ puntuacion: 'Total', criterio: 'Dx', positivo: "Con depresión d'X", sentido: 'menor' });
    sinHuecos(r, 'ROC'); assert.match(r.r, /direction = ">"/); assert.match(r.spss, /ROC Total BY Dx \('Con depresión d''X'\)[\s\S]*TESTPOS\(SMALL\)/);
    assert.match(S.sintaxisROC({ puntuacion: 'Total', criterio: 'Dx', positivo: '1', sentido: 'mayor' }).spss, /BY Dx \(1\)[\s\S]*TESTPOS\(LARGE\)/);
});

test('la mediación (PROCESS), la TRI y el multinivel', () => {
    const m1 = S.sintaxisMediacion({ modelo: 1, x: 'X', y: 'Y', m: [], w: 'W', covariables: ['Edad'], B: 5000, semilla: 2027, centrar: true });
    sinHuecos(m1, 'moderación'); assert.match(m1.r, /lm\(Y ~ X \* W \+ Edad, data = d\)/); assert.match(m1.r, /dc\$X <- dc\$X - mean\(dc\$X\)/); assert.match(m1.spss, /\/model=1 \/center=1 \/jn=1/);
    // los coeficientes, del modelo centrado; la región de Johnson-Neyman, del modelo sin centrar (en la escala de W)
    assert.match(m1.r, /summary\(lm\(Y ~ X \* W \+ Edad, data = dc\)\)[\s\S]*modelo <- lm\(Y ~ X \* W \+ Edad, data = d\)[\s\S]*johnson_neyman\(modelo, pred = X, modx = W\)/);
    assert.match(m1.nota || '', /Con \/center=1, PROCESS muestra los valores de la moderadora con su media restada/);
    const sinCentrar = S.sintaxisMediacion({ modelo: 1, x: 'X', y: 'Y', m: [], w: 'W', covariables: [], B: 5000, semilla: 2027, centrar: false });
    assert.doesNotMatch(sinCentrar.r, /dc <-/); assert.doesNotMatch(sinCentrar.nota || '', /center/);
    const m4 = S.sintaxisMediacion({ modelo: 4, x: 'X', y: 'Y', m: ['M'], w: null, covariables: [], B: 5000, semilla: 9, centrar: true });
    assert.match(m4.r, /indirecto := a \* b[\s\S]*set\.seed\(9\)[\s\S]*bootstrap = 5000/); assert.doesNotMatch(m4.spss, /center/);
    // lavaan, con nombres que admite: los de la base se renombran a X, Y, M y C1…
    const conTildes = S.sintaxisMediacion({ modelo: 4, x: 'Estrés laboral', y: 'Ánimo', m: ['Rumiación'], w: null, covariables: ['Edad (años)'], B: 1000, semilla: 1, centrar: false });
    assert.match(conTildes.r, /na\.omit\(datos\[c\("Estrés laboral", "Ánimo", "Rumiación", "Edad \(años\)"\)\]\)\nnames\(d\) <- c\("X", "Y", "M", "C1"\)/);
    assert.match(conTildes.r, /M ~ a \* X \+ C1\n  Y ~ b \* M \+ cp \* X \+ C1/); assert.doesNotMatch(conTildes.r, /Estrés laboral ~|`Rumiación` ~/);
    assert.match(S.sintaxisMediacion({ modelo: 7, x: 'X', y: 'Y', m: ['M'], w: 'W', covariables: [], B: 1000, semilla: 1, centrar: false }).r, /process\(data = datos, y = "Y", x = "X", m = c\("M"\), w = "W", model = 7, boot = 1000, seed = 1\)/);
    for (const [modelo, tipo] of /** @type {const} */ ([['grm', 'graded'], ['2pl', '2PL'], ['rasch', 'Rasch']])) {
        const t = S.sintaxisTRI({ items: ['I1', 'I2', 'I3'], modelo, grupo: 'Sexo' });
        sinHuecos(t, modelo); assert.match(t.r, new RegExp(`itemtype = "${tipo}"`));
        assert.match(t.r, /MASS::polr\(f, data = d\)/); assert.match(t.r, /glm\(f, family = binomial, data = d\)/);
        // el DIF como el programa: la regla del 80 %, los grupos de menos de 10 fuera, Nagelkerke y Holm
        assert.match(t.r, /total <- ifelse\(respondidos >= 0\.8 \* J, rowMeans\(it, na\.rm = TRUE\) \* J, NA\)/);
        assert.match(t.r, /g\[g %in% names\(n_g\)\[n_g < 10\]\] <- NA/);
        assert.match(t.r, /list\(y ~ tc, y ~ tc \+ g, y ~ tc \* g\)/);
        assert.match(t.r, /p\.adjust\(dif\[, "p"\], method = "holm"\)/);
        assert.match(t.r, /usar <- rowSums\(!is\.na\(it\)\) > 0[\s\S]*mirt::coef\(m, IRTpars = TRUE, printSE = TRUE\)/);
        assert.equal(/COV_11/.test(t.nota || ''), modelo === 'rasch');
    }
    assert.doesNotMatch(S.sintaxisTRI({ items: ['I1', 'I2', 'I3'], modelo: 'grm', grupo: null }).r, /DIF/);
    const ml = S.sintaxisMultinivel({ y: 'Nota', predictores: ['Horas', 'Tamaño'], grupo: 'Aula', centrado: ['grupo', 'gran-media'], medias: ['Horas'] });
    sinHuecos(ml, 'multinivel');
    assert.match(ml.r, /d\$Horas_cg <- d\$Horas - ave\(d\$Horas, d\$Aula\)/); assert.match(ml.r, /d\$`Tamaño_cm` <- d\$`Tamaño` - mean\(d\$`Tamaño`\)/);
    assert.match(ml.r, /lmer\(Nota ~ Horas_cg \+ `Tamaño_cm` \+ Horas_mg \+ \(1 \| Aula\), data = d\)/);
    assert.match(ml.spss, /AGGREGATE \/OUTFILE=\* MODE=ADDVARIABLES \/BREAK=Aula \/mg_Horas=MEAN\(Horas\)\./);
    assert.match(ml.spss, /COMPUTE Horas_mg = mg_Horas - m_Horas\./);
    assert.match(ml.spss, /MIXED Nota WITH Horas_cg Tamaño_cm Horas_mg\n  \/FIXED=Horas_cg Tamaño_cm Horas_mg \| SSTYPE\(3\)/);
    assert.match(ml.nota || '', /MIXED necesita el módulo Advanced Statistics/);
    const nulo = S.sintaxisMultinivel({ y: 'Nota', predictores: [], grupo: 'Aula', centrado: [] });
    assert.match(nulo.r, /lmer\(Nota ~ 1 \+ \(1 \| Aula\)/); assert.doesNotMatch(nulo.spss, /FIXED|AGGREGATE/);
});

test('el bloque plegable escapa los nombres (son de la base, no del programa)', () => {
    const html = S.bloqueSintaxis(S.sintaxisParcial({ x: '<img src=x onerror=alert(1)>', y: 'Y', controles: ['Z'], spearman: true }));
    assert.match(html, /^<details class="aiken-referencias sintaxis-equivalente"><summary>Sintaxis equivalente en R y SPSS<\/summary>/);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('(2027.01.20) R lee la base con los nombres tal cual y las celdas vacías como perdidas', () => {
    const s = S.sintaxisParcial({ x: 'Edad (años)', y: 'Y', controles: ['Z'], spearman: false });
    assert.match(s.r, /^datos <- read\.csv2\("base\.csv", check\.names = FALSE, na\.strings = c\("", "NA"\), fileEncoding = "UTF-8-BOM"\)\n# o readxl::read_excel\("base\.xlsx"\); con haven::read_sav\("base\.sav"\), los nombres son los del \.sav/);
});

test('(2027.01.20) las medidas repetidas: los casos completos antes de la base larga y la corrección del programa', () => {
    const tres = ['T1', 'T2', 'T3'];
    for (const [correccion, r, fila] of /** @type {const} */ ([['ninguna', 'none', 'Esfericidad asumida'], ['gg', 'GG', 'Greenhouse-Geisser'], ['hf', 'HF', 'Huynh-Feldt']])) {
        const s = S.sintaxisRelacionadas({ medidas: tres, prueba: 'anova-rm', correccion });
        sinHuecos(s, correccion);
        assert.match(s.r, new RegExp(`correction = "${r}"`));
        assert.match(s.spss, new RegExp(`la fila «${fila}»: la corrección que aplicó el programa`));
        assert.match(s.r, /d <- na\.omit\(datos\[c\("T1", "T2", "T3"\)\]\); d\$id <- seq_len\(nrow\(d\)\)[\s\S]*pivot_longer\(d, cols = c\("T1", "T2", "T3"\)/);
        assert.match(s.nota || '', /Advanced Statistics/);
    }
    const mixto = S.sintaxisRelacionadas({ medidas: tres, grupo: 'Grupo', prueba: 'anova-mixta', correccion: 'gg' });
    assert.match(mixto.r, /na\.omit\(datos\[c\("T1", "T2", "T3", "Grupo"\)\]\)/);
    const fr = S.sintaxisRelacionadas({ medidas: tres, prueba: 'friedman' });
    assert.match(fr.r, /friedman\.test\(as\.matrix\(d\[c\("T1", "T2", "T3"\)\]\)\)/); assert.match(fr.spss, /\(PAIRED\)\n  \/MISSING=LISTWISE\./);
    assert.match(S.sintaxisRelacionadas({ medidas: ['Pre', 'Post'], prueba: 't-pareada' }).spss, /SPSS 27 o posterior/);
});

test('(2027.01.20) la parcial: spcor.test con los controles quitados de la variable de cada semiparcial; la Spearman de SPSS, con los casos completos', () => {
    const s = S.sintaxisParcial({ x: 'X', y: 'Y', controles: ['Z1', 'Z2'], spearman: false });
    assert.match(s.r, /ppcor::spcor\.test\(d\$Y, d\$X, d\[c\("Z1", "Z2"\)\], method = "pearson"\)   # semiparcial de la primera/);
    assert.match(s.r, /ppcor::spcor\.test\(d\$X, d\$Y, d\[c\("Z1", "Z2"\)\], method = "pearson"\)   # semiparcial de la segunda/);
    assert.match(s.nota || '', /La p de las semiparciales del programa es la de la parcial/);
    const sp = S.sintaxisParcial({ x: 'X', y: 'Y', controles: ['Z'], spearman: true });
    assert.match(sp.spss, /DATASET COPY completos\.\nDATASET ACTIVATE completos\.\nSELECT IF \(NMISS\(X, Y, Z\) = 0\)\.\nRANK VARIABLES=X Y Z/);
});

test('(2027.01.20) la potencia: el incremento de R² con λ = f²·N (pwr solo si se prueban todos), POWER de SPSS y la mediación de Fritz y MacKinnon', () => {
    const base = { alfa: 0.05, colas: 2, potenciaDeseada: 0.8, razon: 1, k: 3, gl: 1, n2: null };
    const inc = (/** @type {string} */ modo) => S.sintaxisPotencia({ ...base, modo, prueba: 'regresion', efecto: 0.15, n: 90, predictores: 5, probados: 2 });
    for (const modo of ['muestra', 'potencia', 'sensibilidad']) { const s = inc(modo); sinHuecos(s, modo); assert.doesNotMatch(s.r, /pwr\.f2\.test\(/); assert.match(s.r, /ncp = f2 \* N/); assert.match(s.nota || '', /λ = f²·\(u \+ v \+ 1\)/); }
    assert.match(inc('muestra').r, /N <- p \+ 2; while \(potencia\(N, f2\) < 0\.8\) N <- N \+ 1/);
    assert.match(inc('potencia').r, /potencia\(90, f2\)$/);
    assert.match(inc('sensibilidad').r, /uniroot\(function\(f2\) potencia\(90, f2\) - 0\.8, c\(1e-6, 10\)\)\$root/);
    assert.match(inc('potencia').spss, /POWER UNIVARIATE LINEAR\n  \/PARAMETERS SIGNIFICANCE=0\.05 N=90 TOTAL_PREDICTORS=5 TEST_PREDICTORS=2 PARTIAL_CORR=0\.361158\./);
    assert.match(inc('muestra').spss, /POWER=0\.8 TOTAL_PREDICTORS=5/);
    // con todos los predictores, pwr da lo mismo (u + v + 1 = N)
    assert.match(S.sintaxisPotencia({ ...base, modo: 'potencia', prueba: 'regresion', efecto: 0.15, n: 77, predictores: 3, probados: 3 }).r, /pwr::pwr\.f2\.test/);
    const t2 = S.sintaxisPotencia({ ...base, modo: 'potencia', prueba: 't2', efecto: 0.5, n: 90, n2: 100, razon: 100 / 90, predictores: 1, probados: 1 });
    assert.match(t2.spss, /POWER MEANS INDEPENDENT\n  \/PARAMETERS TEST=NONDIRECTIONAL SIGNIFICANCE=0\.05 N=90 100 MEAN=0\.5 SD=1\./);
    const r1 = S.sintaxisPotencia({ ...base, modo: 'muestra', prueba: 'r', efecto: 0.3, n: 84, colas: 1, predictores: 1, probados: 1 });
    assert.match(r1.spss, /POWER PEARSON ONESAMPLE\n  \/PARAMETERS TEST=DIRECTIONAL SIGNIFICANCE=0\.05 N=84 NULL=0 ALTERNATIVE=0\.3\./); assert.match(r1.spss, /con el n hallado/);
    assert.match(S.sintaxisPotencia({ ...base, modo: 'muestra', prueba: 'anova', efecto: 0.25, n: 53, predictores: 1, probados: 1 }).spss, /POWER ONEWAY ANOVA/);
    assert.doesNotMatch(S.sintaxisPotencia({ ...base, modo: 'muestra', prueba: 'anova', efecto: 0.25, n: 53, predictores: 1, probados: 1 }).spss, /UNIVARIATE/);
    const med = S.sintaxisPotencia({ ...base, modo: 'potencia', prueba: 'mediacion', efecto: 0.39, b: 0.39, cp: 0, n: 74, R: 1000, semilla: 7, predictores: 1, probados: 1 });
    assert.match(med.r, /x <- rnorm\(n\); m <- a \* x \+ rnorm\(n\); y <- cp \* x \+ b \* m \+ rnorm\(n\)/, 'los errores de varianza 1, como Fritz y MacKinnon');
    assert.doesNotMatch(med.r, /sqrt\(1 - /);
    assert.match(med.spss, /Ni SPSS ni G\*Power calculan la potencia de la mediación/); assert.doesNotMatch(med.nota || '', /G\*Power/);
});

test('(2027.01.20) el bloque: cada botón dice qué copia y el código se recorre con el teclado', () => {
    const html = S.bloqueSintaxis({ r: 'x', spss: 'y' });
    assert.match(html, /<button type="button" class="btn btn-outline sintaxis-copiar" data-lenguaje="R" aria-label="Copiar la sintaxis de R">Copiar<\/button><\/p><pre class="sintaxis-codigo" tabindex="0" aria-label="Sintaxis de R">/);
    assert.match(html, /aria-label="Copiar la sintaxis de SPSS"/);
});
