// analizador/psicometria/index.js — análisis psicométricos del Analizador (validez de contenido; después AFE, ordinales…).
export { analizarValidezContenido, vAiken, intervaloScore, pExactaAiken, decidir, validarEntrada, CRITERIOS_V0, NIVELES_CONFIANZA } from './aiken.js';
export { parsearMatriz } from './aiken-entrada.js';
export { redactarParrafo, referencias, documentoWord, csvResultados } from './aiken-redaccion.js';
export { montarValidezContenido } from './aiken-ui.js';
export { montarAFE } from './afe-ui.js';
export { montarConcordancia } from './concordancia-ui.js';
export { montarInvarianza } from './invarianza-ui.js';
export { analizarInvarianza } from './invarianza.js';
export { kappaCohen, kappaFleiss, cci } from './concordancia.js';
export { validezConstructo } from './validez.js';
export { analizarAFE, kmo, bartlett, analisisParalelo, rotar } from './afe.js';
export { cuantilNormal, zBilateral } from './numerico.js';
