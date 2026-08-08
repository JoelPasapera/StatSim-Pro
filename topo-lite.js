// ========================================
// TOPO-LITE — decodificador TopoJSON propio de StatSim Pro.
// Implementa desde la especificación abierta del formato (v1.0) la ÚNICA
// operación que el Panorama necesita: feature(topología, objeto) →
// GeoJSON dibujable por d3. Sustituye a topojson-client (7 KB, 9
// funciones) con ~1.6 KB y una sola función, optimizada:
//  · decodificación delta+transform en un solo bucle plano por arco,
//  · sin closures por punto ni allocations intermedias,
//  · caché de arcos decodificados (cada frontera compartida entre dos
//    países se decodifica UNA vez y se reusa — el truco del formato,
//    aprovechado también en tiempo de ejecución).
// Formato (spec): arcs = [[ [dx,dy], ... ]] con deltas acumulativos
// cuantizados; transform = {scale:[kx,ky], translate:[tx,ty]};
// índice de arco negativo = ~i con recorrido inverso; al concatenar
// arcos en un anillo se omite el punto de empalme duplicado.
// ========================================
(function (global) {
    'use strict';
    function decodificarArcos(topo) {
        const t = topo.transform;
        const kx = t ? t.scale[0] : 1, ky = t ? t.scale[1] : 1;
        const tx = t ? t.translate[0] : 0, ty = t ? t.translate[1] : 0;
        const fuente = topo.arcs, n = fuente.length;
        const arcos = new Array(n);
        for (let i = 0; i < n; i++) {
            const a = fuente[i], m = a.length, out = new Array(m);
            let x = 0, y = 0;
            for (let j = 0; j < m; j++) {
                const p = a[j];
                if (t) { x += p[0]; y += p[1]; out[j] = [x * kx + tx, y * ky + ty]; }
                else out[j] = [p[0], p[1]];
            }
            arcos[i] = out;
        }
        return arcos;
    }
    function anillo(indices, arcos) {
        // Preconteo del total → un solo Array del tamaño exacto y escritura
        // indexada (sin push ni realocaciones: el camino rápido del motor).
        const nIdx = indices.length;
        let total = 0;
        for (let i = 0; i < nIdx; i++) {
            let idx = indices[i];
            if (idx < 0) idx = ~idx;
            total += arcos[idx].length - (i ? 1 : 0);
        }
        const puntos = new Array(total);
        let k = 0;
        for (let i = 0; i < nIdx; i++) {
            let idx = indices[i];
            const inverso = idx < 0;
            if (inverso) idx = ~idx;
            const arco = arcos[idx], m = arco.length;
            const desde = i ? 1 : 0; // omite el punto de empalme duplicado
            if (inverso) for (let j = m - 1 - desde; j >= 0; j--) puntos[k++] = arco[j];
            else for (let j = desde; j < m; j++) puntos[k++] = arco[j];
        }
        return puntos;
    }
    function geometria(g, arcos, t) {
        const tipo = g.type;
        if (tipo === 'GeometryCollection')
            return { type: tipo, geometries: g.geometries.map(x => geometria(x, arcos, t)) };
        let coords;
        if (tipo === 'Point') coords = punto(g.coordinates, t);
        else if (tipo === 'MultiPoint') coords = g.coordinates.map(c => punto(c, t));
        else if (tipo === 'LineString') coords = anillo(g.arcs, arcos);
        else if (tipo === 'MultiLineString' || tipo === 'Polygon') coords = g.arcs.map(a => anillo(a, arcos));
        else if (tipo === 'MultiPolygon') coords = g.arcs.map(p => p.map(a => anillo(a, arcos)));
        else return null;
        return { type: tipo, coordinates: coords };
    }
    function punto(c, t) {
        return t ? [c[0] * t.scale[0] + t.translate[0], c[1] * t.scale[1] + t.translate[1]] : c.slice();
    }
    function feature(topo, objeto) {
        // Caché por topología: fronteras compartidas se decodifican una vez.
        if (!topo.__arcosLite) Object.defineProperty(topo, '__arcosLite',
            { value: decodificarArcos(topo), enumerable: false });
        const arcos = topo.__arcosLite;
        const uno = (o) => ({
            type: 'Feature',
            id: o.id !== undefined ? o.id : undefined,
            properties: o.properties || {},
            geometry: geometria(o, arcos, topo.transform)
        });
        return objeto.type === 'GeometryCollection'
            ? { type: 'FeatureCollection', features: objeto.geometries.map(uno) }
            : uno(objeto);
    }
    const api = { feature };
    global.TopoLite = api;
    // Compatibilidad: si nadie más trajo topojson, ocupamos su lugar.
    if (!global.topojson) global.topojson = api;
})(typeof window !== 'undefined' ? window : globalThis);
