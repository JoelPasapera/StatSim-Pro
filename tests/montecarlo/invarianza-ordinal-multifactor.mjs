// tests/montecarlo/invarianza-ordinal-multifactor.mjs — Monte Carlo del camino multifactor del paso 6B (revisión 2026.10.22):
// 2 factores correlacionados, una covarianza residual, 3 grupos e ítems de 3 y 5 categorías, con invarianza verdadera.
// DIFFTEST debe rechazar cerca del 5 % en cada paso; las d latentes, sin sesgo, y sus EE, calibrados.
import * as I from '../../src/analizador/psicometria/invarianza-ordinal.js';
import { crearAleatorio } from '../../src/analizador/psicometria/aleatorio.js';
const R = Number(process.argv[2] || 80), rng = crearAleatorio(777);
let reserva = null;
const nrm = () => { if (reserva !== null) { const r = reserva; reserva = null; return r; } let u = 0; while (u === 0) u = rng.siguiente(); const v = rng.siguiente(), m = Math.sqrt(-2 * Math.log(u)); reserva = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v); };
const nm = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'], cortes = j => (j % 2 ? [-0.6, 0.6] : [-1.2, -0.4, 0.4, 1.2]);
const modelo = { latentes: { F1: ['a1', 'a2', 'a3'], F2: ['b1', 'b2', 'b3'] }, covars: [['a1', 'b1']] };
const verdad = { 'F1B': 0.3, 'F1C': -0.2, 'F2B': 0.15 / Math.sqrt(0.9725), 'F2C': -0.1 / Math.sqrt(0.9725) };
const rech = { umbrales: 0, metrica: 0, escalar: 0 }, d = {}, se = {}, dm = {};
let ok = 0;
for (let r = 0; r < R; r++) {
    const filas = [['A', 350, 0], ['B', 300, 0.3], ['C', 320, -0.2]].flatMap(([g, n, mu]) => Array.from({ length: n }, () => {
        const f1 = mu + nrm(), f2 = 0.5 * f1 + 0.85 * nrm(), e = nrm(), o = { g };
        nm.forEach((c, j) => { const f = j < 3 ? f1 : f2, z = 0.7 * f + 0.6 * nrm() + (j === 0 || j === 3 ? 0.25 * e : 0); o[c] = 1 + cortes(j).filter(k => z > k).length; }); return o; }));
    const res = I.analizarInvarianzaOrdinal(modelo, filas, 'g');
    if (res.error || res.niveles.some(N => !N.convergio)) continue;
    ok++;
    res.niveles.slice(1).forEach(N => { if (!N.delta.equivalente && N.delta.p < 0.05) rech[N.nivel]++; });
    // medias latentes del modelo escalar aunque algún paso se rechace por azar: se leen directamente del ajuste
    const esc = res.niveles[3];
    esc.esp.libres.forEach((pl, k) => { if (pl.tipo !== 'mediaLatente') return; const kv = esc.esp.libres.findIndex(o => o.tipo === 'varLatente' && o.i === pl.i && o.j === pl.i && o.grupo === 0); const clave = esc.esp.factores[pl.i] + ['A', 'B', 'C'][pl.grupo];
        (d[clave] ||= []).push(esc.x[k] / Math.sqrt(esc.x[kv])); (dm[clave] ||= []).push(esc.x[k]); (se[clave] ||= []).push(esc.se[k]); });
}
const media = v => v.reduce((s, x) => s + x, 0) / v.length, sd = v => { const m = media(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };
const salida = { R: ok, rechazo: Object.fromEntries(Object.entries(rech).map(([k, v]) => [k, +(v / ok).toFixed(3)])),
    sesgoD: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, +(media(v) - verdad[k]).toFixed(3)])),
    razonEE: Object.fromEntries(Object.entries(se).map(([k, v]) => [k, +(media(v) / sd(dm[k])).toFixed(2)])) };
console.log(JSON.stringify(salida));
const ee = Math.sqrt(0.05 * 0.95 / ok), mal = [];
if (ok < 0.95 * R) mal.push('demasiadas réplicas sin converger');
for (const [k, v] of Object.entries(salida.rechazo)) if (Math.abs(v - 0.05) > 3 * ee) mal.push(`DIFFTEST ${k}: ${v}`);
for (const [k, v] of Object.entries(salida.sesgoD)) if (Math.abs(v) > 0.04) mal.push(`sesgo de d en ${k}: ${v}`);
for (const [k, v] of Object.entries(salida.razonEE)) if (v < 0.8 || v > 1.2) mal.push(`EE de ${k}: ×${v}`);
if (mal.length) { console.log('FALLOS: ' + mal.join('; ')); process.exitCode = 1; }
