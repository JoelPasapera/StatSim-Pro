// analizador/psicometria/optimizacion.js — minimización sin restricciones por BFGS (Nocedal y Wright, 2006, alg. 6.1):
// aproximación de la inversa del hessiano con la actualización BFGS y búsqueda lineal de retroceso con interpolación
// cuadrática (condición de Armijo). Una región no admisible (f no finita o penalizada) solo acorta el paso.
// Convergencia sobre el gradiente ESCALADO, máx |∂f/∂x_k|·max(1, |x_k|): no depende de las unidades de cada parámetro
// (una varianza de 100 y una carga de 0,7 se juzgan con el mismo criterio relativo).
const punto = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

export function bfgs(f, g, x0, { maxIter = 2000, tolGrad = 1e-7, penalizacion = 1e9 } = {}) {
    const n = x0.length;
    const identidad = () => Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
    let x = Float64Array.from(x0), fx = f(x), gx = Float64Array.from(g(x)), H = identidad(), iter = 0, estado = 'iteraciones', quietas = 0;
    const maxAbs = (v, xs) => { let m = 0; for (let i = 0; i < v.length; i++) m = Math.max(m, Math.abs(v[i]) * (xs ? Math.max(1, Math.abs(xs[i])) : 1)); return m; };
    if (!Number.isFinite(fx) || fx >= penalizacion || gx.some(v => !Number.isFinite(v))) return { x: Array.from(x), f: fx, iteraciones: 0, gradienteMax: NaN, convergio: false, estado: 'inicio no admisible' };
    for (; iter < maxIter; iter++) {
        if (maxAbs(gx, x) < tolGrad) { estado = 'gradiente'; break; }
        const d = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = 0; const Hi = H[i]; for (let j = 0; j < n; j++) s -= Hi[j] * gx[j]; d[i] = s; }
        let gd = punto(gx, d);
        if (!(gd < 0)) { H = identidad(); for (let i = 0; i < n; i++) d[i] = -gx[i]; gd = -punto(gx, gx); }   // dirección no descendente: se reinicia
        let t = 1, xn = new Float64Array(n), fn = Infinity, ok = false;
        for (let k = 0; k < 60; k++) {
            for (let i = 0; i < n; i++) xn[i] = x[i] + t * d[i];
            fn = f(xn);
            if (Number.isFinite(fn) && fn < penalizacion && fn <= fx + 1e-4 * t * gd) { ok = true; break; }
            let tq = Number.isFinite(fn) && fn < penalizacion ? (-gd * t * t) / (2 * (fn - fx - gd * t)) : 0.1 * t;
            if (!Number.isFinite(tq)) tq = 0.5 * t;   // interpolación degenerada (denominador nulo): se reduce a la mitad
            t = Math.min(0.5 * t, Math.max(0.1 * t, tq));
        }
        if (!ok) { estado = 'búsqueda lineal'; break; }
        const gn = Float64Array.from(g(xn));
        if (gn.some(v => !Number.isFinite(v))) { estado = 'gradiente no finito'; break; }
        const s = xn.map((v, i) => v - x[i]), y = gn.map((v, i) => v - gx[i]), sy = punto(s, y);
        if (iter === 0 && sy > 0) { const esc = sy / punto(y, y); H = H.map((fila, i) => fila.map((_, j) => (i === j ? esc : 0))); }
        if (sy > 1e-10 * Math.sqrt(punto(s, s) * punto(y, y))) {   // actualización BFGS de la inversa (se omite si la curvatura no es positiva)
            const Hy = H.map(fila => punto(fila, y)), yHy = punto(y, Hy), rho = 1 / sy;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) H[i][j] += rho * ((1 + rho * yHy) * s[i] * s[j] - Hy[i] * s[j] - s[i] * Hy[j]);
        }
        // Estancamiento: 10 iteraciones seguidas sin mejora relativa de f por encima del ruido numérico, con el gradiente
        // ya pequeño: es el límite de la precisión de doble (seguir solo gastaría iteraciones)
        quietas = fx - fn <= 1e-13 * Math.max(1, Math.abs(fx)) ? quietas + 1 : 0;
        x = xn; fx = fn; gx = gn;
        if (quietas >= 10 && maxAbs(gx, x) < 1e-5) { estado = 'estancado en el mínimo'; break; }
    }
    const gmax = maxAbs(gx, x);
    // Si la búsqueda lineal ya no mejora con un gradiente muy pequeño, es el límite de la precisión numérica: convergió
    return { x: Array.from(x), f: fx, gradiente: Array.from(gx), iteraciones: iter, gradienteMax: gmax, convergio: estado === 'gradiente' || gmax < 1e-5, estado };
}
