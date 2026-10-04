// buscador/index.js — entrada de la sección Buscador de antecedentes (Fase 4).
// Los módulos se montan solos al cargar el DOM (como antes); este índice reexporta la API de la sección.
import { ProxiesCORS } from '../shared/proxies.js';
import { ScopusDirecto } from './fuentes/scopus.js';
import { PubMedDirecto } from './fuentes/pubmed.js';
import { ScieloDirecto } from './fuentes/scielo.js';
import { AliciaDirecto } from './fuentes/alicia.js';
import { ScholarDirecto } from './fuentes/scholar.js';
import { ProtocoloBusqueda } from './protocolo.js';
import { PrismaDiagrama } from './prisma.js';
import { MetaAnalisis } from './meta-analisis.js';
import { RankingRevistas } from './ranking.js';
import { Antecedentes } from './antecedentes/index.js';
import { estado, CLAVES } from '../shared/estado.js';

// Servicio que el Redactor consume sin importar al Buscador: fuentes seleccionadas y formato APA.
estado.set(CLAVES.FUENTES_BUSCADOR, {
    obtenerFuentesRedaccion: (...a) => Antecedentes.obtenerFuentesRedaccion(...a),
    citaAPA: o => Antecedentes.citaAPA(o),
    autorAPA: n => Antecedentes._autorAPA(n),
    autoresAPA: a => Antecedentes._autoresAPA(a),
    recuperarDatos: doi => Antecedentes._recuperarDatos(doi),
    get umbralRelevancia() { return Antecedentes._umbralRelevancia; },
    get relevanciaAplicada() { return Antecedentes._relevanciaAplicada; }
});

export { ProxiesCORS, ScopusDirecto, PubMedDirecto, ScieloDirecto, AliciaDirecto, ScholarDirecto, ProtocoloBusqueda, PrismaDiagrama, MetaAnalisis, RankingRevistas, Antecedentes };
