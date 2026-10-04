// analizador/index.js — entrada de la sección Analizador (Fase 3): módulos ES en src/analizador/.
// (F5) sin puentes: los módulos se importan entre sí; este índice reexporta la API de la sección.
import { montarAnalizador as montarUI } from './ui/index.js';
import { bus, EVENTOS } from '../shared/eventos.js';
import { montarValidezContenido, montarAFE, montarConcordancia, montarInvarianza } from './psicometria/index.js';
import { montarDiagnosticoForma } from './relaciones/diagnostico-forma-ui.js';
import * as Psicometria from './psicometria/index.js';
import { AnalizadorEstadistico } from './estadistica.js';
import { Fiabilidad } from './fiabilidad.js';
import { RegresionMultiple } from './regresion.js';
import { SEM } from './sem-motor.js';
import { SEMUI } from './sem-ui.js';
import { ComparacionGrupos } from './comparacion-grupos.js';
import { CribaCorrelaciones } from './criba-correlaciones.js';
import { CribaSociodemografica } from './criba-sociodemografica.js';
import { AnalisisDimensiones } from './analisis-dimensiones.js';
import { MatrizConsistencia } from './matriz-consistencia.js';
import { InterpretacionesEstadisticas } from './interpretaciones.js';
import { ScientificCharts, ScientificChartsBuilder } from './graficas.js';
import { AnalisisGraficos } from './analisis-graficos.js';
import { ExportadorWord } from './exportador-word.js';
import { EtiquetasVariables } from '../shared/etiquetas-variables.js';

// El Simulador avisa por el bus cuando hay una base nueva: se refrescan los desplegables que dependen de ella.
export function montarAnalizador() {
    montarUI();
    montarValidezContenido();   // (2026.10.04) tarjeta 3: validez de contenido por juicio de expertos
    montarAFE();                // (2026.10.11) tarjeta 4: análisis factorial exploratorio
    montarConcordancia();       // (2026.10.16) tarjeta 5: concordancia entre evaluadores (κ y CCI)
    montarInvarianza();         // (2026.10.19) tarjeta 6: invarianza de medición (AFC multigrupo)
    montarDiagnosticoForma();   // (2026.10.28) tarjeta 7: diagnóstico de la forma de una relación
    bus.on(EVENTOS.BASE_GENERADA, () => { try { ComparacionGrupos.actualizarSelects(); RegresionMultiple.actualizarSelects(); } catch (e) { console.error('[Analizador] al recibir la base:', e); } });
}
export { Psicometria, AnalizadorEstadistico, Fiabilidad, RegresionMultiple, SEM, SEMUI, ComparacionGrupos, CribaCorrelaciones, CribaSociodemografica, AnalisisDimensiones, MatrizConsistencia, InterpretacionesEstadisticas, ScientificCharts, ScientificChartsBuilder, AnalisisGraficos, ExportadorWord, EtiquetasVariables };
