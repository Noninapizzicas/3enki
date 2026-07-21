---
id: plataforma/enki-sense
dominio: plataforma
resumen: Los SENTIDOS locales de Enki — órganos Rust en tu máquina (cero nube) que transducen señal↔señal (decir/oír/traducir/renderizar) y perciben (trazo/sonido). Molde OCR4RS. LA FAMILIA COMPLETA (6 sentidos): motor-ojo (render), motor-traduce (marian), motor-oido (whisper), motor-sonido (prosodia), motor-voz (piper-rs, español) y motor-trazo (geometría de canvas) VIVOS end-to-end, verificados. SIN botón (nacen operativos). Frenos disueltos: "página que la beba" y el interruptor de cómputo puro.
fuentes:
  - modules/motor-ojo/**
  - modules/motor-traduce/**
  - modules/motor-oido/**
  - modules/motor-sonido/**
  - modules/motor-voz/**
  - modules/motor-trazo/**
  - frontend/src/lib/modules/trazo/**
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
MOTOR (Rust nativo, EN 2enki · VERIFICADO)  enki-sense/crates/motor-traduce — servidor axum
     127.0.0.1:8121: /health · POST /translate. candle + MarianMT/Opus-MT (Helsinki-NLP), Rust puro,
     NO Bergamot. Carga LOCAL (sin red en runtime): los modelos por par (~300MB) los provisiona
     get-models.sh con curl (patrón ocr4rs), NO el binario. VERIFICADO EN VIVO: compila, descarga el
     modelo fr-en (300MB) y traduce ("Hello world", "Where are the toilets?"). Alias embed_tokens→
     shared para cargar cualquier Opus-MT; freno anti-bucle (el EOS no cierra 100% limpio con
     tokenizers lmz+pesos Helsinki → queda algún token de cola; assets emparejados lo pulen).

PUENTE (bus) 3er sentido  modules/motor-oido v0.1.0 — motor-oido.transcribir.request {audio_base64,
     idioma?} → POST /transcribe → {texto, idioma, confianza}. Tool 'transcribir' (en GLOBAL_TOOLS).
     SIN botón EN EL MOTOR (el guard de PRIVACIDAD del micrófono vive en el BORDE, al CAPTURAR — no
     un toggle de servidor). Degrada honesto (sin_motor). Base http://localhost:8122. Test:
     motor-oido__index (5).
MOTOR (Rust nativo, EN 2enki · VERIFICADO)  enki-sense/crates/motor-oido — servidor axum
     127.0.0.1:8122: /health · POST /transcribe. candle-whisper (whisper-tiny multilingüe), Rust puro.
     WAV→PCM 16k (hound) → mel (candle audio::pcm_to_mel) → encoder → decode greedy con tokens
     especiales (SOT/lang/transcribe/notimestamps) + detección de idioma. Carga LOCAL; get-models.sh
     provisiona el modelo (~145MB, patrón ocr4rs). VERIFICADO EN VIVO: transcribe jfk.wav →
     "And so my fellow Americans ask not what your country can do for you..." (confianza 0.86) y
     detecta el idioma (en). A diferencia de marian, whisper cierra limpio (EOS dispara).

PUENTE (bus) 1er PERCEPTOR  modules/motor-sonido v0.1.0 — motor-sonido.analizar.request {audio_base64}
     → POST /analyze → {features:{energia_rms, pitch_hz, tasa_silabas_s, variacion_energia,
     proporcion_sonora, duracion_s}}. Tool 'analizar_sonido' (en GLOBAL_TOOLS). SIN botón. El motor
     da FEATURES crudas (mitad REFLEJO); la etiqueta emocional la infiere el LLM (mitad FUZZY, en el
     core) → sube a la PROPIOCEPCIÓN. Test: motor-sonido__index (4).
MOTOR (Rust nativo, EN 2enki · VERIFICADO)  enki-sense/crates/motor-sonido — servidor axum
     127.0.0.1:8123: /health · POST /analyze. DSP PURO, SIN modelo (nada que descargar): RMS,
     f0 por autocorrelación (50–400 Hz), ritmo por picos de envolvente, variación de energía.
     VERIFICADO EN VIVO: tono sintético de 220 Hz → pitch_hz 222.2 (±1%); voz real → prosodia
     plausible (pitch variable, 37% sonoro, 2 síl/s). Es el 1er PERCEPTOR (clase 2 del bisturí):
     features reflejo aquí, juicio emocional en el LLM.

PUENTE (bus) 4º sentido  modules/motor-voz v0.1.0 — motor-voz.decir.request {texto, voz?} →
     POST /speak → {audio_base64 (WAV), sample_rate}. Tool 'decir' (en GLOBAL_TOOLS). SIN botón
     (salida pura, no toca micrófono). Degrada honesto (sin_motor / 422 VOZ_NO_DISPONIBLE). Base
     http://localhost:8124. Test: motor-voz__index (4).
MOTOR (Rust, EN 2enki · VERIFICADO)  enki-sense/crates/motor-voz — servidor axum 127.0.0.1:8124:
     /health · POST /speak. piper-rs (voces Piper ONNX vía ort/ONNX Runtime) — Rust, NO Python (el
     pip piper-tts es Python; candle no tiene VITS). Voces en ESPAÑOL, cache por voz. Carga LOCAL;
     get-models.sh provisiona la voz (~61MB, patrón ocr4rs). VERIFICADO EN VIVO: "Hola, bienvenido a
     Tres Vueltas y Verás. ¿Qué te pongo?" → WAV 22050 Hz, 2.7s de voz española; voz inexistente →
     422 honesto. Nota: ort baja ONNX Runtime al compilar (egress abierto en el VPS).
PUENTE (bus) 2º PERCEPTOR — CIERRA LA FAMILIA  modules/motor-trazo v0.1.0 —
     motor-trazo.interpretar.request {trazos:[[{x,y}...]...]} → POST /interpret →
     {elementos:[{tipo, bbox, cerrado, n_puntos, n_vertices}]}. Tool 'interpretar_trazo' (en
     GLOBAL_TOOLS). SIN botón (geometría local pura; el guard del canvas vive en el BORDE). El motor
     da GEOMETRÍA cruda (mitad REFLEJO); la INTENCIÓN (flecha, boceto, tachón) la infiere el LLM
     (mitad FUZZY, en el core) → sube a la PROPIOCEPCIÓN. Base http://localhost:8125. Test:
     motor-trazo__index (4).
MOTOR (Rust nativo, EN 2enki · VERIFICADO)  enki-sense/crates/motor-trazo — servidor axum
     127.0.0.1:8125: /health · POST /interpret. GEOMETRÍA PURA, SIN modelo (nada que descargar):
     bbox, cierre por proximidad extremo-inicio, simplificación RDP (vértices reales), rectitud
     (línea), circularidad 4π·área/largo² (círculo), nº de lados (triángulo/rectángulo/polígono);
     área por shoelace. Cotas de sanidad (2000 trazos / 100k puntos → {fallo demasiado_grande}).
     VERIFICADO EN VIVO: rectángulo (44 pts) → rectangulo (4 vértices), línea (31) → linea (2),
     círculo (37) → circulo, triángulo (39) → triangulo. Es el 2º PERCEPTOR y CIERRA la familia (6º
     sentido): geometría reflejo aquí, intención en el LLM.
BORDE (clase 3 · cliente)  frontend/src/lib/modules/trazo — la MANO: un <canvas> donde el dueño
     DIBUJA con dedo/ratón (pointer events, captura en el cliente). Al interpretar manda los trazos por
     mqttRequest('motor-trazo','interpretar',{trazos}) → ui/request/motor-trazo/interpretar (puerta
     ui_handlers del puente, misma _interpretar que la tool/bus) → motor :8125; pinta la geometría
     (cajas + tipo). UNIVERSAL (es un sentido, no página de dominio → se ve en CUALQUIER proyecto,
     sobrevive al gate de page-set). Degrada honesto (503 → aviso, no inventa formas).

DESPLIEGUE  vps-setup.sh asegura el toolchain Rust (rustup) ANTES de los 6 motores (paso
     3a-ter-aa) — el bloque ocr4rs solo instalaba cargo en su fallback, y con ocr4rs prebuilt ese
     camino se saltaba → los motores morían en 'sin cargo'. Ahora cargo se garantiza siempre
     (idempotente); cada motor compila con cargo install --root /usr/local (binario a /usr/local/bin,
     lo encuentra systemd). Sin cargo aún → los 6 degradan honesto (503 sin_motor).
```

## Topics

```
motor-ojo.render.request → .response            (renderizar · server nativo)  [VIVO]
motor-traduce.request → .response               (traducir · server nativo)    [VIVO · verificado fr-en]
motor-voz.decir.request → .response              (decir · piper-rs)            [VIVO · verificado ES]
motor-oido.transcribir.request → .response       (oír · candle-whisper)        [VIVO · verificado]
motor-sonido.analizar.request → .response        (sonido · DSP features)       [VIVO · verificado]
motor-trazo.interpretar.request → .response      (trazo · geometría pura)      [VIVO · verificado]
SIN interruptor: los órganos de cómputo/salida nacen operativos (único guard: 503 sin_motor)
```
