// tests/montecarlo/wlsmv.mjs — verificación por simulación de Monte Carlo del WLSMV (no hay oráculo independiente
// disponible sin R/lavaan). Un factor con 6 ítems ordinales de 5 categorías (umbrales asimétricos), n = 500 y R réplicas
// con semilla. Se comprueba lo que la teoría asintótica promete:
//   1) Γ/n reproduce la varianza real de cada correlación policórica entre muestras;
//   2) el error estándar robusto medio reproduce la desviación típica real de cada estimación;
//   3) el χ² corregido en media y varianza rechaza un modelo correcto cerca del 5 % y su media se acerca a gl;
//   4) las cargas estandarizadas no tienen sesgo apreciable.
import { crearAleatorio } from '../../src/analizador/psicometria/aleatorio.js';
import { estadisticosOrdinales, ajustarDWLS, inferenciaWLSMV } from '../../src/analizador/psicometria/wlsmv.js';
import { SEM } from '../../src/analizador/sem-motor.js';
import { ComparacionGrupos } from '../../src/analizador/comparacion-grupos.js';

const R = Number(process.argv[2] || 300), n = 500, semilla = 20261015;
const lam = [0.8, 0.7, 0.6, 0.7, 0.5, 0.6], cortes = lam.map((_, j) => [-1.3, -0.5, 0.3, 1.1].map(c => c + 0.15 * (j - 2.5)));
const nombres = lam.map((_, j) => 'Y' + (j + 1)), modelo = SEM.parsear('F =~ ' + nombres.join(' + '));
const rng = crearAleatorio(semilla);
let reserva = null;
const normal = () => { if (reserva !== null) { const r = reserva; reserva = null; return r; } let u = 0; while (u === 0) u = rng.siguiente(); const v = rng.siguiente(), m = Math.sqrt(-2 * Math.log(u)); reserva = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v); };

const rhos = [], gammas = [], cargas = [], brutos = [], ees = [], chis = [], rechazos = [];
let gl = null, noConv = 0;
const t0 = Date.now();
for (let r = 0; r < R; r++) {
    const cols = lam.map(() => new Array(n));
    for (let i = 0; i < n; i++) { const f = normal(); lam.forEach((l, j) => { const z = l * f + Math.sqrt(1 - l * l) * normal(); cols[j][i] = 1 + cortes[j].filter(c => z > c).length; }); }
    const sm = estadisticosOrdinales(cols);
    const est = SEM._construir(modelo, sm.R, nombres), fit = ajustarDWLS(est, sm), inf = inferenciaWLSMV(sm, fit);
    if (!fit.opt.convergio || inf.error) { noConv++; continue; }
    gl = inf.gl;
    rhos.push(sm.pares.map(([j, l]) => sm.R[j][l])); gammas.push(sm.pares.map((_, q) => sm.Gamma[q][q] / n));
    const ks = fit.libres, iPhi = ks.findIndex(k => est.libres[k].nombre === 'var (F)'), phi = fit.theta[ks[iPhi]];
    const std = [Math.sqrt(phi), ...ks.filter(k => est.libres[k].mat === 'A').map(k => fit.theta[k] * Math.sqrt(phi))];
    cargas.push(std);
    brutos.push(ks.map(k => fit.theta[k])); ees.push(ks.map((_, a) => inf.se[a])); chis.push(inf.chi2);
    rechazos.push(ComparacionGrupos._pChi2(inf.chi2, inf.gl) < 0.05);
}
const media = v => v.reduce((s, x) => s + x, 0) / v.length, varianza = v => { const m = media(v); return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1); };
const col = (M, k) => M.map(f => f[k]);
const P = rhos[0].length, razonGamma = Array.from({ length: P }, (_, q) => media(col(gammas, q)) / varianza(col(rhos, q)));
// EE robusto medio frente a la desviación típica real de cada parámetro libre (sin estandarizar, como se estiman)
const razonEE = brutos[0].map((_, k) => media(col(ees, k)) / Math.sqrt(varianza(col(brutos, k))));
const sesgo = lam.map((l, j) => media(col(cargas, j)) - l);
const tasa = media(rechazos.map(Number)), mediaChi = media(chis);
const resultado = { R: cargas.length, noConv, gl, tasaRechazo: tasa, mediaChi2: mediaChi, varChi2: varianza(chis), razonGamma: [Math.min(...razonGamma), Math.max(...razonGamma)], razonGammaMedia: media(razonGamma), razonEE: [Math.min(...razonEE), Math.max(...razonEE)], sesgoMax: Math.max(...sesgo.map(Math.abs)), segundos: (Date.now() - t0) / 1000 };
console.log(JSON.stringify(resultado));
// Criterios con margen para el error de Monte Carlo (con R réplicas, la tasa de rechazo tiene EE ≈ √(.05·.95/R))
const eeTasa = Math.sqrt(0.05 * 0.95 / resultado.R), fallos = [];
if (resultado.noConv > 0.02 * R) fallos.push('demasiadas réplicas sin converger');
if (Math.abs(resultado.razonGammaMedia - 1) > 0.07) fallos.push('Γ no reproduce la varianza real de las policóricas');
if (resultado.razonEE[0] < 0.85 || resultado.razonEE[1] > 1.15) fallos.push('los errores estándar robustos no reproducen la dispersión real');
if (Math.abs(resultado.tasaRechazo - 0.05) > 3 * eeTasa) fallos.push('la tasa de rechazo del χ² corregido se aleja del 5 %');
if (Math.abs(resultado.mediaChi2 - resultado.gl) > 0.12 * resultado.gl) fallos.push('la media del χ² corregido se aleja de los gl');
if (resultado.sesgoMax > 0.02) fallos.push('sesgo apreciable en las cargas');
if (fallos.length) { console.log('FALLOS: ' + fallos.join('; ')); process.exitCode = 1; }
export { resultado };
