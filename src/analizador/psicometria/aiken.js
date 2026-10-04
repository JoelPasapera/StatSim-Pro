// analizador/psicometria/aiken.js — validez de contenido por juicio de expertos: V de Aiken (núcleo de cálculo puro,
// sin DOM; la interfaz está en aiken-ui.js, la redacción APA en aiken-redaccion.js y la lectura de tablas en aiken-entrada.js).
//
//   V = S / (n·k),  S = Σ (xⱼ − mínimo),  k = máximo − mínimo            (Aiken, 1980)
//   IC por el método score, tratando V como una proporción de n·k ensayos (Penfield y Giacobbi, 2004):
//     L, U = [2nkV + z² ∓ z·√(4nkV(1 − V) + z²)] / [2(nk + z²)]
//   p exacta de cola derecha bajo H₀ de valoraciones al azar (cada xⱼ uniforme en {mín…máx}, es decir, V = .50),
//   la distribución de las tablas de Aiken (1985), calculada por convolución exacta.
//   Decisión por el LÍMITE INFERIOR del intervalo frente al criterio V₀ (Merino-Soto y Livia, 2009):
//     válido si L ≥ V₀ · revisar si V ≥ V₀ pero L < V₀ · no válido si V < V₀.
import { zBilateral } from './numerico.js';

const EPS = 1e-12;
export const CRITERIOS_V0 = [
    { valor: 0.50, nombre: 'liberal', cita: 'Cicchetti, 1994' },
    { valor: 0.70, nombre: 'recomendado', cita: 'Charter, 2003' },
    { valor: 0.80, nombre: 'estricto', cita: null }
];
export const NIVELES_CONFIANZA = [0.90, 0.95, 0.975, 0.99, 0.999];

// V de un ítem a partir de las valoraciones de sus jueces (null = juez que no valoró el ítem)
export function vAiken(valoraciones, minimo, maximo) {
    const k = maximo - minimo;
    const validas = valoraciones.filter(x => x !== null && x !== undefined);
    const n = validas.length;
    if (n === 0 || !(k > 0)) return { n, S: 0, media: NaN, V: NaN };
    const S = validas.reduce((s, x) => s + (x - minimo), 0);
    return { n, S, media: minimo + S / n, V: S / (n * k) };
}

// Intervalo score de Penfield y Giacobbi (2004)
export function intervaloScore(V, n, k, confianza = 0.95) {
    const z = zBilateral(confianza), z2 = z * z, nk = n * k;
    const centro = 2 * nk * V + z2;
    const radio = z * Math.sqrt(Math.max(0, 4 * nk * V * (1 - V)) + z2);
    const den = 2 * (nk + z2);
    return { inferior: Math.max(0, (centro - radio) / den), superior: Math.min(1, (centro + radio) / den), z };
}

// P(S′ ≥ S) con S′ = suma de n variables uniformes discretas en {0…k}: distribución exacta por convolución
// (sin simulación). Se suma la cola desde el extremo, así las probabilidades pequeñas no se pierden por cancelación.
export function pExactaAiken(S, n, k) {
    if (!(n >= 1) || !(k >= 1)) return NaN;
    let dist = new Float64Array([1]);
    const w = 1 / (k + 1);
    for (let j = 0; j < n; j++) {
        const nueva = new Float64Array(dist.length + k);
        for (let s = 0; s < dist.length; s++) {
            const v = dist[s] * w;
            if (v === 0) continue;
            for (let t = 0; t <= k; t++) nueva[s + t] += v;
        }
        dist = nueva;
    }
    const desde = Math.max(0, Math.ceil(S - 1e-9));
    let cola = 0;
    for (let s = dist.length - 1; s >= desde; s--) cola += dist[s];
    return Math.min(1, cola);
}

export function decidir(V, inferior, v0) {
    if (inferior >= v0 - EPS) return 'valido';
    if (V >= v0 - EPS) return 'revisar';
    return 'no_valido';
}
const GRAVEDAD = { valido: 0, revisar: 1, no_valido: 2 };

// Comprueba la escala y cada valoración; devuelve la lista de errores (vacía si todo es correcto).
export function validarEntrada({ minimo, maximo, criterios }) {
    const errores = [];
    if (!Number.isInteger(minimo) || !Number.isInteger(maximo)) errores.push('La escala de valoración debe usar números enteros (por ejemplo, de 1 a 4).');
    else if (maximo <= minimo) errores.push('El valor máximo de la escala debe ser mayor que el mínimo.');
    else if (maximo - minimo > 20) errores.push('La escala tiene más de 21 categorías: revisa el mínimo y el máximo.');
    if (!criterios || criterios.length === 0) errores.push('Agrega al menos un criterio con sus valoraciones.');
    const nItems = criterios && criterios.length && Array.isArray(criterios[0].valoraciones) ? criterios[0].valoraciones.length : 0;
    (criterios || []).forEach((c, ic) => {
        const nombre = c.nombre || `Criterio ${ic + 1}`;
        if (!c.valoraciones || c.valoraciones.length === 0) { errores.push(`«${nombre}»: no hay valoraciones.`); return; }
        if (c.valoraciones.length !== nItems) errores.push(`«${nombre}» tiene ${c.valoraciones.length} ítems y «${criterios[0].nombre || 'Criterio 1'}» tiene ${nItems}: todos los criterios deben valorar los mismos ítems.`);
        c.valoraciones.forEach((fila, i) => {
            if (!fila.some(x => x !== null && x !== undefined)) errores.push(`«${nombre}», ítem ${i + 1}: ningún juez lo valoró.`);
            fila.forEach((x, j) => {
                if (x === null || x === undefined) return;
                if (!Number.isFinite(x) || !Number.isInteger(x)) errores.push(`«${nombre}», ítem ${i + 1}, juez ${j + 1}: «${x}» no es una valoración entera.`);
                else if (Number.isInteger(minimo) && Number.isInteger(maximo) && (x < minimo || x > maximo)) errores.push(`«${nombre}», ítem ${i + 1}, juez ${j + 1}: ${x} está fuera de la escala ${minimo}–${maximo}.`);
            });
        });
    });
    return errores;
}

/**
 * Análisis completo.
 * entrada: { minimo, maximo, confianza, v0, items: [etiqueta…],
 *            criterios: [{ nombre, jueces: [nombre…], valoraciones: (number|null)[ítem][juez] }] }
 * salida:  { ok, errores, avisos, configuracion, criterios: [{ nombre, nJueces, items: [...], resumen }], porItem, resumen }
 */
export function analizarValidezContenido(entrada) {
    const { minimo, maximo, criterios = [] } = entrada;
    const confianza = entrada.confianza ?? 0.95, v0 = entrada.v0 ?? 0.70;
    const errores = validarEntrada({ minimo, maximo, criterios });
    if (!(confianza > 0 && confianza < 1)) errores.push('El nivel de confianza debe estar entre 0 y 1 (por ejemplo, 0.95).');
    if (!(v0 >= 0 && v0 <= 1)) errores.push('El criterio V₀ debe estar entre 0 y 1 (por ejemplo, 0.70).');
    if (errores.length) return { ok: false, errores, avisos: [] };
    const k = maximo - minimo;
    const nItems = criterios[0].valoraciones.length;
    const etiquetas = Array.from({ length: nItems }, (_, i) => (entrada.items && entrada.items[i]) || `Ítem ${i + 1}`);
    const avisos = [];
    const resCriterios = criterios.map((c, ic) => {
        const nombre = c.nombre || `Criterio ${ic + 1}`;
        const nJueces = Math.max(...c.valoraciones.map(f => f.length));
        const items = c.valoraciones.map((fila, i) => {
            const b = vAiken(fila, minimo, maximo);
            const ic95 = intervaloScore(b.V, b.n, k, confianza);
            return { indice: i, etiqueta: etiquetas[i], n: b.n, S: b.S, media: b.media, V: b.V,
                inferior: ic95.inferior, superior: ic95.superior, p: pExactaAiken(b.S, b.n, k), decision: decidir(b.V, ic95.inferior, v0) };
        });
        const vs = items.map(x => x.V);
        const cuenta = d => items.filter(x => x.decision === d).length;
        const incompletos = items.filter(x => x.n < nJueces);
        if (incompletos.length) avisos.push(`«${nombre}»: ${incompletos.length} ítem(s) con valoraciones faltantes; su V se calcula con los jueces que sí los valoraron.`);
        return { nombre, nJueces, jueces: c.jueces || [], items,
            resumen: { vMedia: vs.reduce((s, v) => s + v, 0) / vs.length, vMin: Math.min(...vs), vMax: Math.max(...vs),
                validos: cuenta('valido'), revisar: cuenta('revisar'), noValidos: cuenta('no_valido') } };
    });
    const nJuecesMin = Math.min(...resCriterios.map(c => c.nJueces));
    if (nJuecesMin < 3) avisos.push('Con menos de 3 jueces el intervalo de confianza es muy amplio: la decisión apenas tiene respaldo. Se recomiendan entre 5 y 10 expertos.');
    if (new Set(resCriterios.map(c => c.nJueces)).size > 1) avisos.push('No todos los criterios tienen el mismo número de jueces: revisa que las tablas estén completas.');
    // por ítem: V promedio de los criterios y la decisión más exigente
    const porItem = etiquetas.map((etiqueta, i) => {
        const filas = resCriterios.map(c => c.items[i]);
        const decision = filas.reduce((peor, f) => GRAVEDAD[f.decision] > GRAVEDAD[peor] ? f.decision : peor, 'valido');
        return { indice: i, etiqueta, V: filas.reduce((s, f) => s + f.V, 0) / filas.length, porCriterio: filas.map(f => f.V), decision };
    });
    const cuentaGlobal = d => porItem.filter(x => x.decision === d).length;
    return {
        ok: true, errores: [], avisos,
        configuracion: { minimo, maximo, k, confianza, v0, nItems, criterios: resCriterios.map(c => c.nombre) },
        criterios: resCriterios,
        porItem,
        resumen: { vMedia: porItem.reduce((s, x) => s + x.V, 0) / porItem.length, validos: cuentaGlobal('valido'), revisar: cuentaGlobal('revisar'), noValidos: cuentaGlobal('no_valido'),
            nJueces: nJuecesMin }
    };
}
