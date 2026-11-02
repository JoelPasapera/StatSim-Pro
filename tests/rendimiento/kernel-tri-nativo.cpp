// kernel-tri-nativo.cpp — (2027.01.19) el arnés nativo del núcleo de kernel-tri.cpp (para docs/EVALUACION-WASM.md): lee
// los datos que escribe wasm-frente-a-js.mjs, repite el paso E y escribe el tiempo de cada repetición y los resultados (la
// posterior y los recuentos) para compararlos con los de JavaScript y WebAssembly.
#include "kernel-tri.cpp"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <vector>

int main(int argc, char** argv) {
    if (argc < 3) { std::fprintf(stderr, "uso: %s entrada.bin salida.bin\n", argv[0]); return 2; }
    std::FILE* f = std::fopen(argv[1], "rb");
    if (!f) return 1;
    int32_t cab[5];
    if (std::fread(cab, sizeof(int32_t), 5, f) != 5) return 1;
    const int32_t n = cab[0], J = cab[1], Q = cab[2], Kmax = cab[3], reps = cab[4];
    std::vector<int8_t> X((size_t)J * n);
    std::vector<double> logP((size_t)J * Q * Kmax), logPesos(Q), logL((size_t)n * Q), w((size_t)n * Q), r((size_t)J * Kmax * Q);
    if (std::fread(X.data(), 1, X.size(), f) != X.size() || std::fread(logP.data(), 8, logP.size(), f) != logP.size() || std::fread(logPesos.data(), 8, logPesos.size(), f) != logPesos.size()) return 1;
    std::fclose(f);
    std::vector<double> tiempos;
    double total = 0.0;
    for (int32_t k = 0; k < reps + 3; k++) {
        const auto t0 = std::chrono::steady_clock::now();
        total = paso_e(n, J, Q, Kmax, X.data(), logP.data(), logPesos.data(), logL.data(), w.data(), r.data());
        const auto t1 = std::chrono::steady_clock::now();
        if (k >= 3) tiempos.push_back(std::chrono::duration<double, std::milli>(t1 - t0).count());
    }
    std::sort(tiempos.begin(), tiempos.end());
    std::FILE* o = std::fopen(argv[2], "wb");
    if (!o) return 1;
    std::fwrite(&total, 8, 1, o);
    std::fwrite(w.data(), 8, w.size(), o);
    std::fwrite(r.data(), 8, r.size(), o);
    std::fclose(o);
    std::printf("{\"mediana\": %.6f, \"minimo\": %.6f}\n", tiempos[tiempos.size() / 2], tiempos[0]);
    return 0;
}
