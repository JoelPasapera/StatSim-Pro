/* tests/oracle/sav/volcado_readstat.c — (2026.12.29) el oráculo del puente SPSS: vuelca un .sav o .zsav en JSON con
 * ReadStat (https://github.com/WizardMac/ReadStat, licencia MIT; la biblioteca que usan haven, de R, y pyreadstat, de
 * Python), independiente de core/data/sav/lector.js. Lo usa tests/oracle/sav_oraculo.mjs para generar sav_fixture.json.
 *
 * Compilarlo (Linux o macOS, con un compilador de C y zlib):
 *     git clone https://github.com/WizardMac/ReadStat && cd ReadStat && ./autogen.sh && ./configure && make
 *     cc -O2 -I src -o volcado_readstat ruta/a/volcado_readstat.c .libs/libreadstat.a -lz -lm
 * Uso: volcado_readstat archivo.sav > volcado.json
 *
 * El JSON: rows, vars, encoding, label, compression (none | rows | binary), endianness, version, created; notes (los
 * documentos); variables (name, label, format, type, measure, alignment, display_width, storage_width, labels: el nombre
 * de su conjunto de etiquetas de valor, missing: [[desde, hasta], …]); value_labels ([conjunto, valor, etiqueta]); data
 * (una fila por caso: número, cadena, null para el perdido del sistema y {"user_missing": valor} para un perdido
 * declarado); error ("" si se leyó entero). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "readstat.h"

static FILE *f_meta, *f_notes, *f_vars, *f_labels, *f_data;
static char *b_meta, *b_notes, *b_vars, *b_labels, *b_data;
static size_t l_meta, l_notes, l_vars, l_labels, l_data;
static FILE *OUT;
#undef putchar
#define putchar(c) fputc((c), OUT)
#define fputs(s, f) fputs((s), OUT)
#define printf(...) fprintf(OUT, __VA_ARGS__)

typedef struct { int nvars; int row; int first_value; } ctx_t;

static void json_str(const char *s) {
    putchar('"');
    if (s) for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
        if (*p == '"' || *p == '\\') { putchar('\\'); putchar(*p); }
        else if (*p == '\n') fputs("\\n", stdout);
        else if (*p == '\r') fputs("\\r", stdout);
        else if (*p == '\t') fputs("\\t", stdout);
        else if (*p < 0x20) printf("\\u%04x", *p);
        else putchar(*p);
    }
    putchar('"');
}

static void json_num(double v) {
    if (isnan(v)) fputs("null", stdout);
    else if (isinf(v)) fputs(v > 0 ? "\"+inf\"" : "\"-inf\"", stdout);
    else printf("%.17g", v);
}

static void json_value(readstat_value_t v) {
    if (readstat_value_type(v) == READSTAT_TYPE_STRING) { json_str(readstat_string_value(v)); return; }
    if (readstat_value_is_system_missing(v)) { fputs("null", stdout); return; }
    json_num(readstat_double_value(v));
}

static int handle_metadata(readstat_metadata_t *m, void *c) {
    ctx_t *ctx = (ctx_t *)c; OUT = f_meta;
    ctx->nvars = readstat_get_var_count(m);
    printf("{\"rows\":%d,\"vars\":%d,\"encoding\":", readstat_get_row_count(m), readstat_get_var_count(m));
    json_str(readstat_get_file_encoding(m));
    fputs(",\"label\":", stdout); json_str(readstat_get_file_label(m));
    printf(",\"compression\":\"%s\"", readstat_get_compression(m) == READSTAT_COMPRESS_ROWS ? "rows" : readstat_get_compression(m) == READSTAT_COMPRESS_BINARY ? "binary" : "none");
    printf(",\"endianness\":\"%s\"", readstat_get_endianness(m) == READSTAT_ENDIAN_BIG ? "big" : "little");
    printf(",\"version\":%d", readstat_get_file_format_version(m));
    printf(",\"created\":%ld", (long)readstat_get_creation_time(m));
    return READSTAT_HANDLER_OK;
}

static int n_notes = 0;
static int handle_note(int idx, const char *note, void *c) {
    (void)idx; (void)c; OUT = f_notes;
    if (n_notes++) putchar(',');
    json_str(note);
    return READSTAT_HANDLER_OK;
}

static int n_vars_seen = 0;
static int handle_variable(int index, readstat_variable_t *v, const char *val_labels, void *c) {
    (void)c; OUT = f_vars;
    if (n_vars_seen++) putchar(',');
    const char *measure[] = {"unknown", "nominal", "ordinal", "scale"};
    const char *align[] = {"unknown", "left", "center", "right"};
    printf("{\"index\":%d,\"name\":", index); json_str(readstat_variable_get_name(v));
    fputs(",\"label\":", stdout); json_str(readstat_variable_get_label(v));
    fputs(",\"format\":", stdout); json_str(readstat_variable_get_format(v));
    printf(",\"type\":\"%s\"", readstat_variable_get_type(v) == READSTAT_TYPE_STRING ? "string" : "numeric");
    printf(",\"measure\":\"%s\",\"alignment\":\"%s\"", measure[readstat_variable_get_measure(v)], align[readstat_variable_get_alignment(v)]);
    printf(",\"display_width\":%d,\"storage_width\":%zu", readstat_variable_get_display_width(v), readstat_variable_get_storage_width(v));
    fputs(",\"labels\":", stdout); json_str(val_labels);
    fputs(",\"missing\":[", stdout);
    int n = readstat_variable_get_missing_ranges_count(v);
    for (int i = 0; i < n; i++) {
        if (i) putchar(',');
        fputs("[", stdout); json_value(readstat_variable_get_missing_range_lo(v, i)); putchar(',');
        json_value(readstat_variable_get_missing_range_hi(v, i)); fputs("]", stdout);
    }
    fputs("]}", stdout);
    return READSTAT_HANDLER_OK;
}

static int n_labels_seen = 0;
static int handle_value_label(const char *set, readstat_value_t value, const char *label, void *c) {
    (void)c; OUT = f_labels;
    if (n_labels_seen++) putchar(',');
    fputs("[", stdout); json_str(set); putchar(','); json_value(value); putchar(','); json_str(label); fputs("]", stdout);
    return READSTAT_HANDLER_OK;
}

static int in_data = 0, last_row = -1;
static int handle_value(int obs, readstat_variable_t *v, readstat_value_t value, void *c) {
    ctx_t *ctx = (ctx_t *)c; OUT = f_data;
    in_data = 1;
    int idx = readstat_variable_get_index(v);
    if (obs != last_row) { if (last_row >= 0) fputs("],", stdout); putchar('['); last_row = obs; }
    else putchar(',');
    (void)idx; (void)ctx;
    if (readstat_value_type(value) != READSTAT_TYPE_STRING && readstat_value_is_defined_missing(value, v)) {
        fputs("{\"user_missing\":", stdout); json_num(readstat_double_value(value)); putchar('}');
    } else json_value(value);
    return READSTAT_HANDLER_OK;
}

static void handle_error(const char *msg, void *c) { (void)c; fprintf(stderr, "readstat: %s\n", msg); }

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "uso: %s archivo.sav\n", argv[0]); return 2; }
    ctx_t ctx = {0};
    readstat_parser_t *p = readstat_parser_init();
    readstat_set_metadata_handler(p, handle_metadata);
    readstat_set_note_handler(p, handle_note);
    readstat_set_variable_handler(p, handle_variable);
    readstat_set_value_label_handler(p, handle_value_label);
    readstat_set_value_handler(p, handle_value);
    readstat_set_error_handler(p, handle_error);
    f_meta = open_memstream(&b_meta, &l_meta); f_notes = open_memstream(&b_notes, &l_notes); f_vars = open_memstream(&b_vars, &l_vars);
    f_labels = open_memstream(&b_labels, &l_labels); f_data = open_memstream(&b_data, &l_data);
    readstat_error_t err = readstat_parse_sav(p, argv[1], &ctx);
    if (in_data) { OUT = f_data; fputs("]", stdout); }
    fclose(f_meta); fclose(f_notes); fclose(f_vars); fclose(f_labels); fclose(f_data);
    OUT = stdout;
    fprintf(stdout, "%s,\"notes\":[%s],\"variables\":[%s],\"value_labels\":[%s],\"data\":[%s],\"error\":", b_meta ? b_meta : "{", b_notes, b_vars, b_labels, b_data);
    json_str(err == READSTAT_OK ? "" : readstat_error_message(err)); fputc('}', stdout); fputc('\n', stdout);
    readstat_parser_free(p);
    return err == READSTAT_OK ? 0 : 1;
}
