// tests/montecarlo/invarianza-ordinal.mjs — verificación por Monte Carlo del paso 6B (no hay lavaan ni Mplus aquí).
// Dos grupos (n = 300 cada uno) con 5 ítems de 4 categorías; el grupo B tiene media latente 0,4 y varianza 1,3.
//   · Invarianza verdadera: DIFFTEST y χ² corregido deben rechazar cerca del 5 %; la d latente, sin sesgo; su EE,
//     igual a la dispersión real de κ̂.
//   · No invarianza en y4 dentro del grupo B: un desplazamiento uniforme de sus umbrales (+0,5) es un intercepto distinto
//     y debe detectarlo el paso escalar (el de umbrales lo absorbe al liberar ν, por diseño de Wu y Estabrook). El paso de
//     umbrales, que deja libres ν y s de cada ítem, solo puede detectar cambios NO afines de sus umbrales: mover el
//     umbral central (−0,9) lo es; mover solo el superior sería casi afín y apenas detectable (propiedad del contraste).
import { crearAleatorio } from '../../src/analizador/psicometria/aleatorio.js';
import { analizarInvarianzaOrdinal } from '../../src/analizador/psicometria/invarianza-ordinal.js';

const R = Number(process.argv[2] || 200), RP = Number(process.argv[3] || 40), n = 300;
const lam = [0.8, 0.7, 0.6, 0.7, 0.6], cortes = [-0.9, 0.1, 1.0], nm = lam.map((_, j) => 'y' + (j + 1)), modelo = { latentes: { F: nm }, covars: [] };
const rng = crearAleatorio(20261021);
let reserva = null;
const normal = () => { if (reserva !== null) { const r = reserva; reserva = null; return r; } let u = 0; while (u === 0) u = rng.siguiente(); const v = rng.siguiente(), m = Math.sqrt(-2 * Math.log(u)); reserva = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v); };
const simular = (uniforme = 0, central = 0) => [['A', 0, 1], ['B', 0.4, 1.3]].flatMap(([g, mu, v]) => Array.from({ length: n }, () => {
    const f = mu + Math.sqrt(v) * normal(), o = { g };
    lam.forEach((l, j) => {
        const cambia = g === 'B' && j === 3, cs = cambia ? cortes.map((c, k) => c + uniforme + (k === 1 ? central : 0)) : cortes;
        o[nm[j]] = 1 + cs.filter(c => l * f + Math.sqrt(1 - l * l) * normal() > c).length;
    });
    return o;
}));
const media = v => v.reduce((s, x) => s + x, 0) / v.length, varianza = v => { const m = media(v); return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1); };
const t0 = Date.now(), rechazo = { umbrales: [], metrica: [], escalar: [] }, dift = { umbrales: [], metrica: [], escalar: [] }, glD = {}, chiRech = { configural: [], escalar: [] }, ds = [], ks = [], ses = [];
let fallos = 0;
for (let r = 0; r < R; r++) {
    const res = analizarInvarianzaOrdinal(modelo, simular(0), 'g');
    if (res.error || res.niveles.some(N => !N.convergio)) { fallos++; continue; }
    res.niveles.slice(1).forEach(N => { rechazo[N.nivel].push(N.delta.p < 0.05 ? 1 : 0); dift[N.nivel].push(N.delta.chi2); glD[N.nivel] = N.delta.gl; });
    for (const k of ['configural', 'escalar']) chiRech[k].push(res.niveles.find(N => N.nivel === k).p < 0.05 ? 1 : 0);
    const m = res.medias[0];   // sin medias cuando algún nivel se rechaza por azar (≈ 5 % con invarianza verdadera)
    if (m) { ds.push(m.d); ks.push(m.kappa); ses.push(m.se); }
}
let porEscalar = 0, porUmbrales = 0;
for (let r = 0; r < RP; r++) {
    const a = analizarInvarianzaOrdinal(modelo, simular(0.5, 0), 'g'), b = analizarInvarianzaOrdinal(modelo, simular(0, -0.9), 'g');
    if (!a.error && a.niveles[3].delta.p < 0.05) porEscalar++;
    if (!b.error && b.niveles[1].delta.p < 0.05) porUmbrales++;
}
// d verdadera: κ en la métrica del marcador dividida por √φ de la referencia = 0,4 / 1
const resultado = { R: rechazo.umbrales.length, conMedias: ds.length, fallos, rechazo: Object.fromEntries(Object.entries(rechazo).map(([k, v]) => [k, media(v)])), mediaDIFFTEST: Object.fromEntries(Object.entries(dift).map(([k, v]) => [k, media(v)])), glD,
    rechazoChi2: Object.fromEntries(Object.entries(chiRech).map(([k, v]) => [k, media(v)])), sesgoD: media(ds) - 0.4, razonEE: media(ses) / Math.sqrt(varianza(ks)), potenciaEscalar: porEscalar / RP, potenciaUmbrales: porUmbrales / RP, segundos: (Date.now() - t0) / 1000 };
console.log(JSON.stringify(resultado));
const eeTasa = Math.sqrt(0.05 * 0.95 / resultado.R), mal = [];
if (fallos > 0.03 * R) mal.push('demasiadas réplicas sin converger');
for (const [k, t] of Object.entries(resultado.rechazo)) if (Math.abs(t - 0.05) > 3 * eeTasa) mal.push(`DIFFTEST ${k}: rechazo ${t}`);
for (const [k, m] of Object.entries(resultado.mediaDIFFTEST)) if (Math.abs(m - glD[k]) > 0.2 * glD[k]) mal.push(`DIFFTEST ${k}: media ${m} frente a ${glD[k]} gl`);
for (const [k, t] of Object.entries(resultado.rechazoChi2)) if (Math.abs(t - 0.05) > 3 * eeTasa) mal.push(`χ² ${k}: rechazo ${t}`);
if (Math.abs(resultado.sesgoD) > 0.03) mal.push('sesgo en la d latente');
if (resultado.razonEE < 0.85 || resultado.razonEE > 1.15) mal.push('EE de la media latente mal calibrado');
if (resultado.potenciaEscalar < 0.8) mal.push('el paso escalar no detecta interceptos no invariantes');
if (resultado.potenciaUmbrales < 0.7) mal.push('el paso de umbrales no detecta un cambio no afín de umbrales');
if (mal.length) { console.log('FALLOS: ' + mal.join('; ')); process.exitCode = 1; }
