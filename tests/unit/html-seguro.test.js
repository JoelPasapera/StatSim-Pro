// @ts-check
// tests/unit/html-seguro.test.js — (2026.12.26) shared/html.js: lo que el Buscador pinta con innerHTML (títulos, autores,
// revistas, resúmenes y enlaces que llegan de las fuentes, algunas por proxies públicos) va escapado, y un enlace solo
// puede ser http(s). Antes, un título con forma de etiqueta se ejecutaba en la página.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escaparHTML, urlSegura, htmlConCursivas, textoPlano, textoSeguro } from '../../src/shared/html.js';

test('el escape: los cinco caracteres especiales, también las comillas (para los atributos)', () => {
    assert.equal(escaparHTML(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    assert.equal(escaparHTML(null), ''); assert.equal(escaparHTML(undefined), ''); assert.equal(escaparHTML(3), '3');
});

test('los enlaces: solo http y https, escapados; nada de «javascript:», «data:» ni direcciones relativas', () => {
    assert.equal(urlSegura('https://doi.org/10.1/a"b'), 'https://doi.org/10.1/a&quot;b');
    assert.equal(urlSegura('  http://x.org/y?a=1&b=2 '), 'http://x.org/y?a=1&amp;b=2');
    for (const u of ['javascript:alert(1)', ' JAVASCRIPT:x', 'data:text/html,x', '//evil.example', 'http://', '/relativa', '', null]) assert.equal(urlSegura(u), '', String(u));
});

test('el texto de las fuentes, limpio: sin las etiquetas de los títulos, con las entidades decodificadas; «p < .05» se queda', () => {
    assert.equal(textoPlano('5-HT<inf>2A</inf> receptors <i>in vivo</i> and <scp>DNA</scp>'), '5-HT2A receptors in vivo and DNA');
    assert.equal(textoPlano('<mml:math><mml:mi>x</mml:mi></mml:math> y <jats:italic>z</jats:italic> <span class="a">s</span>'), 'x y z s', 'MathML y JATS de Crossref');
    assert.equal(textoPlano('Health &amp; Social Care &#8211; &#x2014; caf&eacute; &unknown;'), 'Health & Social Care – — café &unknown;');
    assert.equal(textoPlano('Educa&ccedil;&atilde;o &AMP; Sa&uacute;de &alpha; &Omega; &sigmaf; &yuml;&nbsp;x'), 'Educação & Saúde α Ω ς ÿ\u00a0x', 'Latin-1, griegas y &AMP;');
    assert.equal(textoPlano('p < .05 y q > .01'), 'p < .05 y q > .01');
    // solo las etiquetas conocidas: lo que parece una etiqueta pero es texto se queda
    assert.equal(textoPlano('Cortisol values <LOD and >ULOQ were excluded'), 'Cortisol values <LOD and >ULOQ were excluded');
    assert.equal(textoPlano('a<b and c>d'), 'a<b and c>d'); assert.equal(textoPlano('BMI <median and >85th'), 'BMI <median and >85th');
    assert.equal(textoPlano('T&#1;tulo &#x2;x&#9;y &#128;'), 'T&#1;tulo &#x2;x\ty &#128;', 'los puntos de código de control no se decodifican');
    assert.equal(textoPlano('&lt;script&gt;alert(1)&lt;/script&gt;x'), 'alert(1)x', 'una etiqueta codificada tampoco sobrevive');
    assert.equal(textoSeguro('A &amp; B <b>c</b> < d'), 'A &amp; B c &lt; d', 'limpio y escapado una sola vez');
    assert.equal(textoPlano(null), '');
});

test('las referencias APA: se conservan solo sus cursivas; lo demás se limpia y se escapa', () => {
    assert.equal(htmlConCursivas('García, J. (2020). <b>T</b>. <i>Revista & Co</i>, <i>3</i>(1).'), 'García, J. (2020). T. <i>Revista &amp; Co</i>, <i>3</i>(1).');
    assert.equal(htmlConCursivas('<img src=x onerror=alert(1)><i>ok</i>'), '<i>ok</i>');
    assert.equal(htmlConCursivas('5-HT<inf>2A</inf>. <i>Health &amp; Care</i>.'), '5-HT2A. <i>Health &amp; Care</i>.');
    assert.equal(htmlConCursivas('a ' + String.fromCharCode(1) + ' b <i>c</i>'), 'a  b <i>c</i>', 'las marcas internas no pueden venir en el texto');
});
