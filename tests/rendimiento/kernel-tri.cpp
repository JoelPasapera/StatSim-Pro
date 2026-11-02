// kernel-tri.cpp — (2027.01.19) el núcleo que más tiempo pide de la TRI (core/stats/tri.js) en C++, para la evaluación de
// WebAssembly (docs/EVALUACION-WASM.md): el paso E del algoritmo EM —la log-verosimilitud de cada persona en cada nodo de la
// cuadratura, su posterior normalizada y la log-verosimilitud marginal— y los recuentos esperados de cada categoría de cada
// ítem en cada nodo. Las mismas operaciones, en el mismo orden, que el JavaScript de wasm-frente-a-js.mjs. Se compila igual
// a WebAssembly (clang --target=wasm32, sin biblioteca estándar: exp y log se importan de Math, las de JavaScript, así los
// resultados son los mismos bit a bit) y a código nativo (con las de la biblioteca de C).
#include <stdint.h>

#ifdef __wasm__
extern "C" {
__attribute__((import_module("env"), import_name("exp"))) double exp_js(double);
__attribute__((import_module("env"), import_name("log"))) double log_js(double);
}
#define EXP exp_js
#define LOG log_js
extern unsigned char __heap_base;
static uintptr_t tope = 0;
// Un reservador de memoria mínimo (sin liberar): el tramo pedido, alineado a 16, creciendo la memoria si hace falta.
extern "C" void* reservar(uint32_t bytes) {
    if (!tope) tope = (uintptr_t)&__heap_base;
    uintptr_t p = (tope + 15) & ~(uintptr_t)15;
    tope = p + bytes;
    uintptr_t tengo = __builtin_wasm_memory_size(0) * 65536u;
    if (tope > tengo) __builtin_wasm_memory_grow(0, (tope - tengo + 65535u) / 65536u);
    return (void*)p;
}
#else
#include <cmath>
#define EXP std::exp
#define LOG std::log
#endif

extern "C" {

// X: J × n categorías (−1, perdido), por ítem; logP: J × Q × Kmax, el logaritmo de la probabilidad de cada categoría en cada
// nodo; logPesos: Q; logL y w: n × Q (de trabajo y la posterior); r: J × Kmax × Q, los recuentos esperados. Devuelve la
// log-verosimilitud marginal.
double paso_e(int32_t n, int32_t J, int32_t Q, int32_t Kmax, const int8_t* X, const double* logP, const double* logPesos,
              double* logL, double* w, double* r) {
    for (int32_t k = 0; k < n * Q; k++) logL[k] = 0.0;
    for (int32_t j = 0; j < J; j++) {
        const int8_t* x = X + (int64_t)j * n;
        const double* T = logP + (int64_t)j * Q * Kmax;
        for (int32_t i = 0; i < n; i++) {
            const int32_t c = x[i];
            if (c < 0) continue;
            double* L = logL + (int64_t)i * Q;
            for (int32_t q = 0; q < Q; q++) L[q] += T[q * Kmax + c];
        }
    }
    double total = 0.0;
    for (int32_t i = 0; i < n; i++) {
        const double* L = logL + (int64_t)i * Q;
        double* W = w + (int64_t)i * Q;
        double m = -1e300;
        for (int32_t q = 0; q < Q; q++) { const double v = L[q] + logPesos[q]; if (v > m) m = v; }
        double s = 0.0;
        for (int32_t q = 0; q < Q; q++) { const double e = EXP(L[q] + logPesos[q] - m); W[q] = e; s += e; }
        for (int32_t q = 0; q < Q; q++) W[q] = W[q] / s;
        total += m + LOG(s);
    }
    for (int32_t k = 0; k < J * Kmax * Q; k++) r[k] = 0.0;
    for (int32_t j = 0; j < J; j++) {
        const int8_t* x = X + (int64_t)j * n;
        double* R = r + (int64_t)j * Kmax * Q;
        for (int32_t i = 0; i < n; i++) {
            const int32_t c = x[i];
            if (c < 0) continue;
            double* Rc = R + c * Q;
            const double* W = w + (int64_t)i * Q;
            for (int32_t q = 0; q < Q; q++) Rc[q] += W[q];
        }
    }
    return total;
}

}
