// analizador/psicometria/validez.js — validez convergente y discriminante de un modelo de medida ajustado (sin DOM):
//   · fiabilidad compuesta CR = (Σλ)² / [(Σλ)² + Σθ] y varianza media extraída AVE = Σλ² / (Σλ² + Σθ), con cargas y
//     varianzas residuales de la solución completamente estandarizada (Fornell y Larcker, 1981; Raykov, 1997);
//   · criterio de Fornell–Larcker: √AVE de cada factor mayor que su correlación con cualquier otro;
//   · HTMT (Henseler, Ringle y Sarstedt, 2015): media de las correlaciones entre ítems de factores distintos dividida
//     por la media geométrica de las correlaciones medias entre ítems de cada factor (< .85 estricto, < .90 liberal).
export const UMBRALES_VALIDEZ = { CR: 0.70, AVE: 0.50, HTMT: 0.85, HTMTLiberal: 0.90 };

// factores: [{ nombre, items: [..], lambdas: [..], thetas: [..] }] (estandarizados); correlaciones: matriz m×m entre
// factores; R: correlaciones entre ítems (p×p) con nombres `nombresItems`
export function validezConstructo(factores, correlaciones, R, nombresItems) {
    const avisos = [];
    const porFactor = factores.map((F, i) => {
        const sl = F.lambdas.reduce((s, l) => s + l, 0), sl2 = F.lambdas.reduce((s, l) => s + l * l, 0), st = F.thetas.reduce((s, t) => s + t, 0);
        const CR = (sl * sl) / (sl * sl + st), AVE = sl2 / (sl2 + st);
        let maxR = 0, conQuien = null;
        factores.forEach((G, j) => { if (j !== i && Math.abs(correlaciones[i][j]) > maxR) { maxR = Math.abs(correlaciones[i][j]); conQuien = G.nombre; } });
        return { nombre: F.nombre, k: F.items.length, CR, AVE, raizAVE: Math.sqrt(Math.max(AVE, 0)), maxR, conQuien,
            fornellLarcker: factores.length < 2 ? null : Math.sqrt(Math.max(AVE, 0)) > maxR };
    });
    const pos = new Map(nombresItems.map((n, i) => [n, i]));
    const mediaEntre = (A, B) => { let s = 0, c = 0; for (const a of A) for (const b of B) { s += R[pos.get(a)][pos.get(b)]; c++; } return s / c; };
    const mediaDentro = A => { let s = 0, c = 0; for (let x = 0; x < A.length; x++) for (let y = x + 1; y < A.length; y++) { s += R[pos.get(A[x])][pos.get(A[y])]; c++; } return c ? s / c : NaN; };
    const m = factores.length, htmt = Array.from({ length: m }, () => new Array(m).fill(null));
    for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
        const Fi = factores[i].items, Fj = factores[j].items, mi = mediaDentro(Fi), mj = mediaDentro(Fj);
        if (Fi.length < 2 || Fj.length < 2) { htmt[i][j] = htmt[j][i] = NaN; continue; }
        if (!(mi > 0 && mj > 0)) { avisos.push(`HTMT no calculable entre «${factores[i].nombre}» y «${factores[j].nombre}»: correlación media entre sus ítems no positiva (¿ítems inversos sin recodificar?).`); htmt[i][j] = htmt[j][i] = NaN; continue; }
        htmt[i][j] = htmt[j][i] = mediaEntre(Fi, Fj) / Math.sqrt(mi * mj);
    }
    const valores = htmt.flat().filter(v => Number.isFinite(v));
    return { porFactor, htmt, htmtMax: valores.length ? Math.max(...valores) : null, avisos, nombres: factores.map(F => F.nombre) };
}

// ---------------------------------------------------------------- tablas y redacción (una sola fuente: pantalla y Word)
const f2 = x => (Number.isFinite(x) ? x.toFixed(2).replace(/^(-?)0\./, '$1.') : '—');
export const CABECERA_VALIDEZ = ['Factor', 'k', 'CR', 'AVE', '√AVE', 'Máx. |r| con otro factor', 'Fornell–Larcker'];
export const filasValidez = v => v.porFactor.map(f => [f.nombre, String(f.k), f2(f.CR), f2(f.AVE), f2(f.raizAVE), f.conQuien ? `${f2(f.maxR)} (${f.conQuien})` : '—', f.fornellLarcker === null ? '—' : f.fornellLarcker ? 'Se cumple' : 'No se cumple']);
export const cabeceraHTMT = v => ['Factor', ...v.nombres];
export const filasHTMT = v => v.nombres.map((n, i) => [n, ...v.nombres.map((_, j) => (j < i ? f2(v.htmt[i][j]) : j === i ? '—' : ''))]);
export const NOTA_VALIDEZ = 'CR = fiabilidad compuesta; AVE = varianza media extraída (Fornell y Larcker, 1981), ambas con la solución completamente estandarizada. Criterios: CR ≥ .70 y AVE ≥ .50; Fornell–Larcker se cumple si √AVE supera la correlación del factor con cualquier otro. HTMT = razón heterorrasgo-monorrasgo (Henseler et al., 2015): < .85 indica validez discriminante (< .90 con un criterio liberal).';
export const REFERENCIAS_VALIDEZ = [
    'Fornell, C. y Larcker, D. F. (1981). Evaluating structural equation models with unobservable variables and measurement error. <i>Journal of Marketing Research, 18</i>(1), 39–50. https://doi.org/10.1177/002224378101800104',
    'Henseler, J., Ringle, C. M. y Sarstedt, M. (2015). A new criterion for assessing discriminant validity in variance-based structural equation modeling. <i>Journal of the Academy of Marketing Science, 43</i>(1), 115–135. https://doi.org/10.1007/s11747-014-0403-8',
    'Raykov, T. (1997). Estimation of composite reliability for congeneric measures. <i>Applied Psychological Measurement, 21</i>(2), 173–184. https://doi.org/10.1177/01466216970212006'
];

export function redactarValidez(v) {
    const lista = xs => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
    const F = v.porFactor, rango = xs => (Math.min(...xs) === Math.max(...xs) ? `fue ${f2(xs[0])}` : `osciló entre ${f2(Math.min(...xs))} y ${f2(Math.max(...xs))}`);
    const partes = [`La validez convergente se examinó con la fiabilidad compuesta (CR; Raykov, 1997) y la varianza media extraída (AVE; Fornell y Larcker, 1981): la CR ${rango(F.map(f => f.CR))} (criterio ≥ .70) y la AVE ${rango(F.map(f => f.AVE))} (criterio ≥ .50).`];
    const bajaCR = F.filter(f => f.CR < UMBRALES_VALIDEZ.CR).map(f => f.nombre), bajaAVE = F.filter(f => f.AVE < UMBRALES_VALIDEZ.AVE);
    if (bajaCR.length) partes.push(bajaCR.length === 1 ? `El factor ${bajaCR[0]} no alcanzó la fiabilidad compuesta mínima.` : `Los factores ${lista(bajaCR)} no alcanzaron la fiabilidad compuesta mínima.`);
    if (bajaAVE.length) {
        const conCR = bajaAVE.filter(f => f.CR >= UMBRALES_VALIDEZ.CR).map(f => f.nombre);
        partes.push(`La AVE no llegó a .50 en ${lista(bajaAVE.map(f => f.nombre))}${conCR.length ? `; con una CR de al menos .70${conCR.length < bajaAVE.length ? ` (${conCR.join(', ')})` : ''}, Fornell y Larcker (1981) consideran aún adecuada la validez convergente` : ''}.`);
    }
    if (F.length > 1) {
        const incumple = F.filter(f => f.fornellLarcker === false).map(f => f.nombre);
        partes.push(`En cuanto a la validez discriminante, el criterio de Fornell–Larcker ${incumple.length ? `no se cumplió en ${lista(incumple)}` : 'se cumplió en todos los factores (√AVE mayor que sus correlaciones con los demás)'}`
            + (Number.isFinite(v.htmtMax) ? ` y el HTMT (Henseler et al., 2015) alcanzó como máximo ${f2(v.htmtMax)}${v.htmtMax < UMBRALES_VALIDEZ.HTMT ? ', por debajo de .85' : v.htmtMax < UMBRALES_VALIDEZ.HTMTLiberal ? ', por debajo de .90 solo con el criterio liberal' : ', por encima de .90, lo que indica que al menos dos factores no se distinguen empíricamente'}.` : '.'));
    }
    return partes.join(' ');
}
