# enki-sense

Los **sentidos locales** de Enki — órganos Rust que corren en tu máquina (cero nube).
La familia que sigue a `ocr4rs` (físico) y Crawl4RS (web). Vive **dentro de 2enki** y se
despliega desde `deployment/vps-setup.sh`.

Guión completo (el bisturí, las 3 clases anatómicas): `arquitectura/decisiones/propuestas/enki-sense.md`.

## Motores

| crate | sentido | estado |
|---|---|---|
| `motor-ojo` | RENDER — datos/markup → SVG · PDF · imagen (resvg/usvg/svg2pdf) | ✅ vivo (v0.1.0) |

Los demás (`motor-traduce`, `motor-voz`, `motor-oido`, `motor-sonido`) entran como crates
hermanos con el mismo molde, cuando exista la página que los beba.

## motor-ojo — el órgano de render

Servidor HTTP fino (axum), solo loopback `127.0.0.1:8120`. Lo consume el core por el puente
`modules/motor-ojo` (bus↔HTTP). La `fuente` universal es **SVG**; `tipo` decide el destino.

```
GET  /health
POST /render { "tipo": "svg" | "pdf" | "imagen", "fuente": "<svg…>", "opts"?: {} }
     → 200 { "base64": "…", "ext": "png" | "pdf" | "svg" }
     →     { "fallo": { "tipo": "error", "motivo": "…" } }   # nunca inventa bytes
```

- `imagen` → SVG rasterizado a PNG (resvg + tiny-skia)
- `pdf` → SVG a PDF (svg2pdf)
- `svg` → SVG parseado y re-serializado (usvg normaliza/optimiza)

Carga las fuentes del sistema una vez (para que el texto renderice).

## Compilar y correr

```sh
cargo build --release
MOTOR_OJO_PORT=8120 ./target/release/motor-ojo
curl -s localhost:8120/health
```

En el VPS lo hace solo `deployment/vps-setup.sh` (compila con `cargo install`, systemd
`motor-ojo.service`, enciende el interruptor `motor-ojo`). Sin el binario, el puente degrada
honesto (503 `sin_motor`); leer/render del resto del sistema sigue.
