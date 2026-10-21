/* tests/oracle/sav/escribir_readstat.c — (2026.12.29) escribe con el ESCRITOR de ReadStat (independiente del de StatSim
 * Pro) dos archivos de SPSS con lo que el escritor propio no escribe: cadenas muy largas (600 bytes, en tres segmentos de
 * 255 bytes útiles), cadenas con caracteres de varios bytes justo en los cortes, perdidos declarados de números (valores y
 * rango) y de cadenas, y etiquetas de valor de cadenas largas. Uno con compresión por bytes (.sav) y otro con zlib (.zsav).
 * El lector propio debe leerlos igual que el lector de ReadStat (tests/integration/sav.test.js, con sav_fixture.json).
 * Compilarlo como volcado_readstat.c: cc -O2 -I src -o escribir_readstat escribir_readstat.c .libs/libreadstat.a -lz -lm
 * Uso: escribir_readstat salida.sav salida.zsav */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "readstat.h"

static ssize_t escribir(const void *bytes, size_t len, void *ctx) { return fwrite(bytes, 1, len, (FILE *)ctx); }

/* una cadena de `n` bytes: `relleno` repetido (un carácter UTF-8 de 1 a 4 bytes) y, si sobra, letras */
static void cadena(char *dst, size_t n, const char *relleno) {
    size_t r = strlen(relleno), k = 0;
    while (k + r <= n) { memcpy(dst + k, relleno, r); k += r; }
    while (k < n) dst[k++] = 'x';
    dst[n] = '\0';
}

static int escribir_archivo(const char *ruta, readstat_compress_t compresion) {
    FILE *f = fopen(ruta, "wb");
    if (!f) return 1;
    readstat_writer_t *w = readstat_writer_init();
    readstat_set_data_writer(w, escribir);
    readstat_writer_set_file_label(w, "VLS y perdidos (ReadStat)");
    readstat_writer_set_compression(w, compresion);
    readstat_writer_set_file_timestamp(w, 1760000000);

    readstat_label_set_t *ls_num = readstat_add_label_set(w, READSTAT_TYPE_DOUBLE, "niveles");
    readstat_label_double_value(ls_num, 1, "Bajo");
    readstat_label_double_value(ls_num, 2, "Medio");
    readstat_label_double_value(ls_num, 3, "Alto");
    readstat_label_double_value(ls_num, 99, "No responde");
    readstat_label_set_t *ls_medio = readstat_add_label_set(w, READSTAT_TYPE_STRING, "grupos");
    readstat_label_string_value(ls_medio, "control-largo", "Grupo de control");
    readstat_label_string_value(ls_medio, "experimental", "Grupo experimental");

    readstat_variable_t *v_id = readstat_add_variable(w, "id", READSTAT_TYPE_DOUBLE, 0);
    readstat_variable_set_label(v_id, "Identificador");
    readstat_variable_t *v_largo = readstat_add_variable(w, "comentario_largo", READSTAT_TYPE_STRING, 600);
    readstat_variable_set_label(v_largo, "Comentario de 600 bytes");
    readstat_variable_t *v_medio = readstat_add_variable(w, "grupo", READSTAT_TYPE_STRING, 20);
    readstat_variable_set_label_set(v_medio, ls_medio);
    readstat_variable_add_missing_string_value(v_medio, "NS/NC");
    readstat_variable_t *v_num = readstat_add_variable(w, "nivel", READSTAT_TYPE_DOUBLE, 0);
    readstat_variable_set_label_set(v_num, ls_num);
    readstat_variable_set_measure(v_num, READSTAT_MEASURE_ORDINAL);
    readstat_variable_add_missing_double_value(v_num, 99);
    readstat_variable_t *v_rango = readstat_add_variable(w, "puntaje", READSTAT_TYPE_DOUBLE, 0);
    readstat_variable_add_missing_double_range(v_rango, -9, -1);
    readstat_variable_set_measure(v_rango, READSTAT_MEASURE_SCALE);
    readstat_variable_t *v_corto = readstat_add_variable(w, "corto", READSTAT_TYPE_STRING, 8);

    const int n = 8;
    readstat_begin_writing_sav(w, f, n);
    static char buf[700];
    const char *rellenos[] = { "a", "ñ", "€", "😀", "ab", "ñ€", "x", "" };
    const size_t largos[] = { 600, 255, 256, 509, 600, 600, 3, 0 };
    const char *grupos[] = { "control-largo", "experimental", "NS/NC", "", "control-largo", "otro grupo", "experimental", "control-largo" };
    const double niveles[] = { 1, 2, 3, 99, 2, 1, 3, 2 };
    const double puntajes[] = { 10.5, -3, 0, -9, -1, -0.5, 1e6, 42 };
    const char *cortos[] = { "Sí", "año", "ñandú", "", "12345678", "€uro", "abc", "z" };
    for (int i = 0; i < n; i++) {
        readstat_begin_row(w);
        readstat_insert_double_value(w, v_id, i + 1);
        cadena(buf, largos[i], rellenos[i][0] ? rellenos[i] : "x");
        /* que no corte un carácter: se recorta al último carácter entero */
        size_t L = strlen(buf);
        while (L > 0 && ((unsigned char)buf[L - 1] & 0xC0) == 0x80) L--;
        if (L > 0 && ((unsigned char)buf[L - 1] & 0xC0) == 0xC0) L--;
        buf[L] = '\0';
        if (i == 7) readstat_insert_missing_value(w, v_largo); else readstat_insert_string_value(w, v_largo, buf);
        readstat_insert_string_value(w, v_medio, grupos[i]);
        if (i == 6) readstat_insert_missing_value(w, v_num); else readstat_insert_double_value(w, v_num, niveles[i]);
        readstat_insert_double_value(w, v_rango, puntajes[i]);
        readstat_insert_string_value(w, v_corto, cortos[i]);
        readstat_end_row(w);
    }
    readstat_error_t err = readstat_end_writing(w);
    readstat_writer_free(w);
    fclose(f);
    if (err != READSTAT_OK) { fprintf(stderr, "%s: %s\n", ruta, readstat_error_message(err)); return 1; }
    return 0;
}

int main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr, "uso: %s salida.sav salida.zsav\n", argv[0]); return 2; }
    return escribir_archivo(argv[1], READSTAT_COMPRESS_ROWS) | escribir_archivo(argv[2], READSTAT_COMPRESS_BINARY);
}
