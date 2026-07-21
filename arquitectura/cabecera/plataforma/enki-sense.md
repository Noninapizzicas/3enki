---
id: plataforma/enki-sense
dominio: plataforma
resumen: Los SENTIDOS locales de Enki — órganos Rust en tu máquina (cero nube) que transducen señal↔señal (decir/oír/traducir/renderizar) y perciben (trazo/sonido). Molde OCR4RS. motor-ojo (render) VIVO end-to-end; motor-traduce (traducir) puente listo, motor candle pendiente. SIN botón (nacen operativos). Frenos disueltos: "página que la beba" y el interruptor de cómputo puro.
fuentes:
  - modules/motor-ojo/**
  - modules/motor-traduce/**
  - enki-sense/**
  - deployment/vps-setup.sh
  - arquitectura/decisiones/propuestas/enki-sense.md
verificado: 2026-07-21
---

# ENKI-SENSE — los sentidos locales (órganos Rust, cero nube)

> La siguiente familia de órganos tras OCR4RS (físico) y Crawl4RS (web): los SENTIDOS.
> Corren en tu máquina, no en APIs de terceros — soberanía. Guión asentado:
> `arquitectura/decisiones/propuestas/enki-sense.md` (bisturí completo).

## El corte maestro — 3 clases anatómicas (no "6 motores")

```
1 · TRANSDUCTORES deterministas   decir · oír · traducir · renderizar
    señal↔señal por caja determinista (Piper · whisper · Bergamot · resvg/printpdf/image).
    FORMA REFLEJO puro · un test de fixture lo afirma · molde OCR4RS exacto.

2 · PERCEPTORES                    interpretar-trazo · analizar-sonido
    PARTIDOS por el bisturí: la mitad medible (geometría · features DSP) = REFLEJO;
    la mitad de juicio (intención · etiqueta emocional) = MICRO-AGENTE fuzzy en el CORE.
    Su salida sube a la PROPIOCEPCIÓN — el LLM la lee al turno siguiente. La joya.

3 · HARDWARE DE BORDE              micrófono · altavoz · canvas
    NO es motor: captura/reproducción, SIEMPRE en el cliente. La inferencia sube; el sentido no baja.
```

## Reparto por naturaleza (dónde vive cada mitad)

```
SERVER nativo (Rust puro, clon OCR4RS)   renderizar · traducir
SERVER con modelos ML (solo inferencia)  decir (Piper) · oír (whisper)
CORE (el LLM ya está ahí)                 la mitad FUZZY de trazo y sonido (tools:[] + validador)
BORDE / cliente (hardware)               mic · altavoz · canvas — captura/reproducción (WASM o device)
```

## Dos frenos disueltos (P0 · la pregunta madre)

1. **Sin freno de construcción.** *"Una lente solo entra cuando hay página que la beba"* era
   `declara-antes-de-actuar` → se disolvió: la cúpula rompió `montar = inyectar` (catálogo carga
   todo, turno tira top-K). Se construye libre; degrada honesto hasta que hay motor.
2. **Sin botón — operativos desde el minuto 1.** Estos órganos NO tienen interruptor. El render/
   traducir es cómputo local puro (SVG→bytes): un on/off no protege ningún estado nombrable →
   ceremonia (miedo), se disuelve. Único guard: `503 sin_motor` si el binario no responde. La tool
   va a `GLOBAL_TOOLS` (operativa como `leer_web`, no solo por cúpula). EXCEPCIÓN: donde el botón SÍ
   protege un estado real se queda — micrófono (privacidad, guard en el BORDE), egress externo,
   irreversibilidad.

## Estado / piezas

```
PUENTE (bus)  modules/motor-ojo v0.2.0 — motor-ojo.render.request {tipo:svg|pdf|imagen, fuente,
     opts?} → POST /render → {base64, ext}. Tool 'renderizar' (en GLOBAL_TOOLS → operativa desde el
     minuto 1). SIN botón. Degrada honesto (sin_motor / 422 RENDER_FALLIDO). Base
     http://localhost:8120 (env MOTOR_OJO_URL). Test: motor-ojo__index (5).
MOTOR (Rust nativo, EN 2enki)  enki-sense/ — workspace Cargo, crate motor-ojo. Servidor axum
     127.0.0.1:8120: /health · POST /render. resvg/usvg/svg2pdf (SVG puro, sin Chromium → nativo
     como ocr4rs, NO Docker). fuente universal = SVG; tipo → PNG (resvg) · PDF (svg2pdf) · SVG
     (usvg). Carga fuentes del sistema una vez. VERIFICADO EN VIVO: compila y sirve PNG/PDF válidos;
     fuente inválida → {fallo} honesto. Despliegue: vps-setup.sh compila (cargo install), systemd
     motor-ojo.service. SIN botón (nace operativo).
CONSUMIDOR vivo del render  carta-digital · facturas · publicador · contenido.add_imagen.

PUENTE (bus) 2º sentido  modules/motor-traduce v0.1.0 — motor-traduce.request {texto, de, a} →
     POST /translate → {texto_traducido}. Tool 'traducir' (en GLOBAL_TOOLS). SIN botón. Normaliza
     códigos de idioma en una frontera (es-ES→es); de==a → passthrough. Degrada honesto (sin_motor /
     422 PAR_NO_SOPORTADO). Base http://localhost:8121 (env MOTOR_TRADUCE_URL). Test:
     motor-traduce__index (6). Consumidor latente: carta multi-idioma · whatsapp.
MOTOR (decisión, PENDIENTE de build)  candle + MarianMT/Opus-MT (Helsinki-NLP) — Rust puro, NO
     Bergamot (bindings C++). Modelos por par de idiomas (~300MB), descargados en el deploy (patrón
     ocr4rs get-models, no van en el binario). El puente ya degrada honesto (sin_motor) hasta que
     el motor exista. Su ciclo build+verify es propio (compila candle + prueba con un par real).
PENDIENTE  motor de traducir (candle-marian) · voz/oído/sonido/trazo cuando exista la UI que los
     beba — mismo molde, crates hermanos en enki-sense/.
```

## Topics

```
motor-ojo.render.request → .response            (renderizar · server nativo)  [VIVO]
motor-traduce.request → .response               (traducir · server nativo)    [PUENTE listo · motor pendiente]
motor-voz.decir.request → .audio                (decir · inferencia server)   [guión]
motor-oido.oir.request → .transcrito            (oír · captura borde)         [guión]
motor-sonido.analizar.request → .prosodia       (sonido · features+fuzzy)     [guión]
motor-ojo.canvas.interpretado                   (trazo · fuzzy core → propiocepción)  [guión]
SIN interruptor: los órganos de cómputo/salida nacen operativos (único guard: 503 sin_motor)
```
