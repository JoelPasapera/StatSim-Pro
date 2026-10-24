// @ts-check
// tests/unit/ejemplos-markdown.test.js — (2027.01.02) el Markdown de los README de ejemplos/ en HTML (src/ejemplos/markdown.js),
// el que pinta la pestaña «Ejemplos»: lo que escriben las recetas (títulos, párrafos, listas con bloques dentro, tablas,
// citas, código, negritas y enlaces) y, sobre todo, que nada se cuele sin escapar ni un enlace vaya adonde no debe; y las
// piezas con que el generador saca los pasos de cada README (seccionDe, elementosDeLista).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { elementosDeLista, enLinea, markdownAHtml, partirEnSecciones, seccionDe, sinSecciones } from '../../src/ejemplos/markdown.js';

const ejemplos = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ejemplos');

test('el texto se escapa: ninguna etiqueta ni entidad del README llega como HTML', () => {
    const html = markdownAHtml('Hola <script>alert(1)</script> & <img src=x onerror="alert(2)"> "comillas"');
    assert.equal(html, '<p>Hola &lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;img src=x onerror=&quot;alert(2)&quot;&gt; &quot;comillas&quot;</p>');
    assert.ok(!/<script|<img/.test(markdownAHtml('# <b>t</b>\n\n- <i>x</i>\n\n> <u>y</u>\n\n| <a> | b |\n| --- | --- |\n| <c> | d |\n\n```\n<pre>\n```')));
});

test('dentro del texto: código, negritas, escapes y enlaces', () => {
    assert.equal(enLinea('Usa `<b>` y **negrita** con \\*literal\\*'), 'Usa <code>&lt;b&gt;</code> y <strong>negrita</strong> con *literal*');
    assert.equal(enLinea('``a ` b``'), '<code>a ` b</code>', 'un código que lleva una comilla invertida');
    assert.equal(enLinea('sin cerrar `abc'), 'sin cerrar `abc');
    assert.equal(enLinea('**sin cerrar'), '**sin cerrar');
    assert.equal(enLinea('**`código` en negrita**'), '<strong><code>código</code> en negrita</strong>');
});

test('los enlaces: http(s) en otra pestaña; los relativos, solo si quien llama los resuelve; los demás, solo su texto', () => {
    assert.equal(enLinea('[sitio](https://ejemplo.org/a?b=1&c=2)'), '<a href="https://ejemplo.org/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">sitio</a>');
    for (const malo of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', '//otro.sitio/x', '/raiz/x', '\\\\servidor\\x', 'mailto:a@b.c']) {
        assert.equal(enLinea(`[texto](${malo})`), 'texto', `«${malo}» no es un enlace`);
    }
    assert.equal(enLinea('[a](simulador/base.sav)'), 'a', 'un relativo sin quien lo resuelva, solo su texto');
    const op = { resolverRuta: (/** @type {string} */ r) => (r === 'simulador/base.sav' ? 'ejemplos/01/simulador/base.sav?v=1' : null) };
    assert.equal(enLinea('[a](simulador/base.sav)', op), '<a href="ejemplos/01/simulador/base.sav?v=1" target="_blank" rel="noopener">a</a>');
    assert.equal(enLinea('[a](otro.txt)', op), 'a', 'uno que no resuelve, solo su texto');
    // aunque quien llama resolviera cualquier ruta, un esquema que no es http(s) ni llega a preguntarle
    const todo = { resolverRuta: (/** @type {string} */ r) => r };
    for (const malo of ['javascript:alert(1)', 'data:text/html,x', '//otro.sitio/x', '/raiz/x', '\u0001javascript:alert(1)', '\u0000javascript:x', 'java\u0009script:x', '%6Aavascript:x', 'a b']) {
        assert.ok(!/<a\b/.test(enLinea(`[t](${malo})`, todo)), `${JSON.stringify(malo)}: no es un enlace`);
    }
    assert.equal(enLinea('[**b** `c`](https://x.org)'), '<a href="https://x.org" target="_blank" rel="noopener noreferrer"><strong>b</strong> <code>c</code></a>');
    assert.equal(enLinea('[w](https://es.wikipedia.org/wiki/A_(b)) y más'), '<a href="https://es.wikipedia.org/wiki/A_(b)" target="_blank" rel="noopener noreferrer">w</a> y más', 'paréntesis equilibrados en el destino');
});

test('títulos con el nivel de quien los pinta, párrafos, citas y bloques de código', () => {
    assert.equal(markdownAHtml('# Uno\n\n## Dos\n\n### Tres', { nivelBase: 3 }), '<h3>Uno</h3>\n<h4>Dos</h4>\n<h5>Tres</h5>');
    assert.equal(markdownAHtml('###### seis', { nivelBase: 3 }), '<h6>seis</h6>', 'nunca más allá de h6');
    assert.equal(markdownAHtml('una línea\notra línea\n\nsegundo'), '<p>una línea otra línea</p>\n<p>segundo</p>');
    assert.equal(markdownAHtml('> **Ojo.** cita\n> que sigue'), '<blockquote><p><strong>Ojo.</strong> cita que sigue</p></blockquote>');
    assert.equal(markdownAHtml('```lavaan\nF =~ a + b\n  <x>\n```'), '<pre><code>F =~ a + b\n  &lt;x&gt;</code></pre>');
});

test('tablas: cabecera, alineación, celdas con «|» escapado y filas cortas', () => {
    const html = markdownAHtml('| A | B | C |\n| :--- | :---: | ---: |\n| x \\| y | **z** |\n');
    assert.equal(html, '<div class="table-container"><table class="table"><thead><tr><th scope="col" style="text-align:left">A</th>'
        + '<th scope="col" style="text-align:center">B</th><th scope="col" style="text-align:right">C</th></tr></thead><tbody><tr>'
        + '<td style="text-align:left">x | y</td><td style="text-align:center"><strong>z</strong></td><td style="text-align:right"></td></tr></tbody></table></div>');
});

test('listas: numeradas desde donde empiezan, con un bloque de código y otro párrafo dentro de un elemento', () => {
    const md = '2. primero\n3. segundo, con código:\n\n   ```\n   Apoyo =~ A1 + A2\n   ```\n\n   y un párrafo después.\n4. tercero\n\nFuera.';
    const html = markdownAHtml(md);
    assert.equal(html, '<ol start="2"><li>primero</li><li><p>segundo, con código:</p>\n<pre><code>Apoyo =~ A1 + A2</code></pre>\n<p>y un párrafo después.</p></li><li>tercero</li></ol>\n<p>Fuera.</p>');
    assert.deepEqual(elementosDeLista(md), ['primero', 'segundo, con código:\n\n```\nApoyo =~ A1 + A2\n```\n\ny un párrafo después.', 'tercero']);
    assert.equal(markdownAHtml('- a\n- b\n\n1. c'), '<ul><li>a</li><li>b</li></ul>\n<ol><li>c</li></ol>', 'otra clase de lista empieza otra lista');
    assert.equal(markdownAHtml('- a\nsigue a\n- b'), '<ul><li>a sigue a</li><li>b</li></ul>', 'una línea sin sangría continúa el párrafo del elemento');
});

test('secciones de nivel 2: una, sin ellas, partidas; lo que hay entre vallas no cuenta', () => {
    const md = '# T\n\nintro\n\n## Uno\n\nuno\n\n```\n## no es sección\n```\n\n## Archivos\n\ntabla\n\n## Dos\n\ndos';
    assert.equal(seccionDe(md, 'Uno').trim(), 'uno\n\n```\n## no es sección\n```');
    assert.equal(seccionDe(md, 'No está'), '');
    assert.ok(!/Archivos|tabla/.test(sinSecciones(md, ['Archivos'])) && /## Dos/.test(sinSecciones(md, ['Archivos'])));
    const { inicio, secciones } = partirEnSecciones(md.replace(/\n/g, '\r\n'));
    assert.equal(inicio.trim(), '# T\n\nintro');
    assert.deepEqual(secciones.map(s => s.titulo), ['Uno', 'Archivos', 'Dos']);
    assert.equal(secciones[2].texto.trim(), 'dos');
    assert.deepEqual(partirEnSecciones('sin secciones'), { inicio: 'sin secciones', secciones: [] });
});

test('los README de ejemplos/: sus pasos salen enteros y todo su HTML, escapado y con enlaces solo a sus archivos', () => {
    const casos = fs.existsSync(ejemplos) ? fs.readdirSync(ejemplos).filter(c => /^\d{2}-/.test(c)) : [];
    assert.ok(casos.length > 0, 'hay casos en ejemplos/');
    for (const caso of casos) {
        const md = fs.readFileSync(path.join(ejemplos, caso, 'README.md'), 'utf8');
        const pasos = elementosDeLista(seccionDe(md, 'Qué se hizo en el Analizador'));
        assert.ok(pasos.length >= 3, `${caso}: tiene sus pasos`);
        assert.ok(pasos.every(p => p.trim() && !/^\d+\.\s/.test(p)), `${caso}: cada paso sin su número`);
        /** @type {string[]} */
        const pedidas = [];
        const html = markdownAHtml(md, { resolverRuta: r => { pedidas.push(r); return `x/${r}`; } });
        assert.ok(!/<(script|img|iframe|style|svg)\b/i.test(html), `${caso}: sin etiquetas que no son del Markdown`);
        assert.ok(pedidas.length > 0 && pedidas.every(r => fs.existsSync(path.join(ejemplos, caso, ...r.split('/')))), `${caso}: cada enlace relativo es un archivo del caso`);
        assert.ok(!/\]\(|\*\*/.test(html.replace(/<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>/g, '')), `${caso}: no quedan marcas de Markdown sin convertir`);
    }
});
