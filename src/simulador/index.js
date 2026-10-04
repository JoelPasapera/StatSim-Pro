// simulador/index.js — entrada de la sección Simulador.
// F1: el dominio ya es modular (dominio/*.js). La interfaz sigue en app.js (clásico) hasta la Fase 2, así que
// aquí se expone el puente mínimo que esa interfaz espera; desaparece cuando app.js se convierta en módulos.
import { GeneradorDatos, BaseColumnar } from './dominio/generador.js';

export function montarSimulador(StatSim) {
    const generadorDatos = new GeneradorDatos();
    // puente heredado (app.js, guia-coherencia.js, etiquetas-variables.js):
    window.BaseColumnar = BaseColumnar;
    window.GeneradorDatos = GeneradorDatos;
    window.generadorDatos = generadorDatos;
    StatSim.simulador = { generador: generadorDatos, GeneradorDatos, BaseColumnar };
    StatSim.autotest = async () => { const m = await import('./dominio/autotest.js'); return m.autotest(); };
    return generadorDatos;
}
