// @ts-check
// tests/unit/formato-p.test.js — (2026.12.30) el p de una prueba, el mismo en todas las vistas (shared/formato-numero.js): tres
// decimales, sin el cero inicial, «< .001», y sin que el redondeo lo lleve a un umbral de decisión (α, .01, .05 y .10)
// que no alcanza; «p = .034» en las frases (antes, «p .034»); la U de Mann-Whitney con su medio. (2027.01.01) Y el término
// de una ecuación con su signo («− 0.114·x», no «+ -0.114·x»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatoP, pConSigno, textoP, formatoMitades, numeroConMenos, terminoConSigno } from '../../src/shared/formato-numero.js';

const lado = (/** @type {number} */ x, /** @type {number} */ t) => (Math.abs(x - t) <= 1e-9 * t ? 0 : Math.sign(x - t));

test('(2027.01.01) el término de una ecuación lleva su signo delante, el del número redondeado', () => {
    assert.equal(terminoConSigno(0.1144, '·x'), '+ 0.114·x');
    assert.equal(terminoConSigno(-0.1144, '·x'), '− 0.114·x', 'no «+ -0.114·x»');
    assert.equal(terminoConSigno(-0.0001, '·x²'), '+ 0.000·x²', 'redondeado a cero, sin «−»');
    assert.equal(terminoConSigno(-3.2, '', 1), '− 3.2');
    assert.equal(terminoConSigno(NaN, '·x'), '+ —·x');
    assert.equal(terminoConSigno(-Infinity, '·x'), '− ∞·x');
    // (revisión) el primer término, con el mismo «−» y sin «-0.000»
    assert.equal(numeroConMenos(-2.7), '−2.700');
    assert.equal(numeroConMenos(2.7, 1), '2.7');
    assert.equal(numeroConMenos(-0.0001), '0.000');
    assert.equal(numeroConMenos(-0), '0.000');
    assert.equal(numeroConMenos(NaN), '—');
    assert.equal(numeroConMenos(-Infinity), '−∞');
});

test('tres decimales, sin el cero inicial, «< .001» y «—»', () => {
    assert.equal(formatoP(0.0346), '.035'); assert.equal(formatoP(0.5), '.500'); assert.equal(formatoP(1), '1.000');
    assert.equal(formatoP(0.00099), '< .001'); assert.equal(formatoP(0.001), '.001'); assert.equal(formatoP(-1e-17), '< .001');
    for (const x of [NaN, Infinity, -Infinity]) assert.equal(formatoP(x), '—');
    assert.equal(formatoP(0.0346, { ceroInicial: true }), '0.035'); assert.equal(formatoP(0.0004, { ceroInicial: true }), '< 0.001');
});

test('el redondeo no cruza ni alcanza un umbral: .0496 no es «.050» junto a «p < .05», ni .0504 «.050» junto a «p > .05»', () => {
    assert.equal(formatoP(0.0496), '.0496'); assert.equal(formatoP(0.04996), '.04996'); assert.equal(formatoP(0.0499996), '.049999');
    assert.equal(formatoP(0.0504), '.0504'); assert.equal(formatoP(0.0505), '.051', 'lejos del umbral, tres decimales');
    assert.equal(formatoP(0.05), '.050', 'sobre el umbral, tal cual'); assert.equal(formatoP(0.05 + 1e-13), '.050', 'el ruido del punto flotante no cuenta');
    assert.equal(formatoP(0.0099), '.0099'); assert.equal(formatoP(0.0999), '.0999'); assert.equal(formatoP(0.1004), '.1004');
    assert.equal(formatoP(0.0398, { alfa: 0.04 }), '.0398', 'con el α del estudio'); assert.equal(formatoP(0.0398), '.040', 'sin él, .04 no es umbral');
    // barrido: ningún p mostrado queda del otro lado (o encima) de .01, .05, .10 o α, y nunca se aleja más de medio milésimo
    let s = 7; const u = () => (s = (s * 48271) % 2147483647) / 2147483647;
    for (let i = 0; i < 200000; i++) {
        const t0 = [0.01, 0.05, 0.1, 0.03][i % 4];
        const p = i % 3 ? t0 + (u() - 0.5) * (i % 7 ? 2e-3 : 2e-6) : u() * 0.12;
        const f = formatoP(p, { alfa: 0.03, ceroInicial: true });
        if (f.startsWith('<')) { assert.ok(p < 0.001); continue; }
        const m = Number(f);
        for (const t of [0.01, 0.03, 0.05, 0.1]) { const l = lado(p, t); if (l !== 0) assert.equal(lado(m, t), l, `p = ${p} → ${f} frente a ${t}`); }
        assert.ok(Math.abs(m - p) <= 0.0005 + 1e-12, `p = ${p} → ${f}`);
    }
});

test('en las frases: «= .034», «< .001» y «p = .034»', () => {
    assert.equal(pConSigno(0.034), '= .034'); assert.equal(pConSigno(0.0002), '< .001'); assert.equal(pConSigno(NaN), '—');
    assert.equal(textoP(0.0496), 'p = .0496'); assert.equal(textoP(0.0002), 'p < .001'); assert.equal(textoP(NaN), '');
    assert.equal(textoP(0.0496, { ceroInicial: true }), 'p = 0.0496');
});

test('la U de Mann-Whitney (y cualquier estadístico semientero), con su medio', () => {
    assert.equal(formatoMitades(24), '24'); assert.equal(formatoMitades(24.5), '24.5'); assert.equal(formatoMitades(-3.5), '-3.5');
    assert.equal(formatoMitades(2.25), '2.25'); assert.equal(formatoMitades(NaN), '—'); assert.equal(formatoMitades(Infinity), '∞');
});

test('ninguna vista ni el Word escriben «p .034» (sin el signo) ni tienen su propia copia del formato', async () => {
    const fs = await import('node:fs'), path = await import('node:path');
    const raiz = new URL('../../src/', import.meta.url).pathname;
    const archivos = [];
    const recorrer = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => (e.isDirectory() ? recorrer(path.join(d, e.name)) : e.name.endsWith('.js') && archivos.push(path.join(d, e.name))));
    recorrer(raiz);
    for (const f of archivos) {
        const t = fs.readFileSync(f, 'utf8');
        assert.ok(!/p \$\{(?:this\.|RMf\.|RM\.|CG\.)?(?:_fp|fp|fmtPApp|formatoP)\(/.test(t), `${path.relative(raiz, f)}: «p ${'${'}_fp(…)}» sin «=»`);
        if (!f.endsWith(path.join('shared', 'formato-numero.js'))) assert.ok(!/p < 0\.001 \? '< \.001' : p\.toFixed\(3\)\.replace\(\/\^0\\\.\//.test(t), `${path.relative(raiz, f)}: una copia del formato del p`);
        // (revisión) ni un p con «toFixed» detrás de «< .001» (el χ² y el Δχ² del SEM escribían «p = 0.050» con p = .0496)
        assert.ok(!/< 0\.001 \? '< \.001' : '= ' \+ fx\(/.test(t), `${path.relative(raiz, f)}: un p con toFixed`);
    }
});
