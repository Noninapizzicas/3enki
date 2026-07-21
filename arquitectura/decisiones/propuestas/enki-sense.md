# enki-sense — los sentidos locales de Enki (guión asentado)

> **Estado:** guión acordado (bisturí pasado). El modelo se asienta ANTES de codificar
> (regla del diseccionador). Caso hermano de anatomía: `OCR4RS` (órgano físico nativo) y
> `Crawl4RS` (órgano web) — enki-sense es la SIGUIENTE familia de órganos, no un paradigma nuevo.
>
> **Sin freno de construcción.** No hay "una página debe existir antes de construir": ese freno era
> `declara-antes-de-actuar` y se disolvió (la cúpula de eventos rompió `montar = inyectar` — el
> catálogo carga todo, el turno tira top-K bajo demanda). Se construye libre; cada órgano **degrada
> honesto** (503 `<motivo>`) hasta que hay motor, y la cúpula solo inyecta en el turno la capacidad
> que una página está bebiendo. El orden lo dicta la demanda viva (palanca), no un guard.

## El corte maestro — 3 clases anatómicas (no "6 motores")

El bisturí (¿lo afirma un test, o pide juicio?) parte los seis verbos en tres anatomías:

```
1 · TRANSDUCTORES deterministas   decir · oír · traducir · renderizar
    señal↔señal por una caja determinista (Piper/whisper/Bergamot/resvg).
    FORMA  REFLEJO puro · un test de fixture lo afirma · molde OCR4RS exacto.
    NO es juicio del sistema: el motor transduce, el LLM de página decide QUÉ decir/traducir.

2 · PERCEPTORES                    interpretar-trazo · analizar-sonido
    cada uno PARTIDO en dos por el bisturí:
      · la mitad medible (geometría del trazo · features DSP/FFT del audio) = REFLEJO puro
      · la mitad de juicio (intención del gesto · etiqueta emocional)        = MICRO-AGENTE fuzzy
    el fuzzy vive en el CORE (el LLM ya está ahí) · tools:[] + validador que no inventa.
    Su salida sube a la PROPIOCEPCIÓN — el LLM la lee al turno siguiente. Esa es la joya.

3 · HARDWARE DE BORDE              micrófono · altavoz · canvas
    NO es un motor: es captura/reproducción, y SIEMPRE en el cliente.
    El servidor es sordo, mudo y ciego al gesto. La INFERENCIA puede subir al server;
    el SENTIDO (el mic, el altavoz, el lienzo) nunca baja del dispositivo.
```

## La disección, verbo a verbo (las 6 preguntas → forma · máquina · dato ausente)

```
decir (TTS)            texto → WAV
  Q1 REFLEJO (Piper: mismo texto+voz → mismos bytes; test afirma header/duración)
  Q2 sin store (MVP) · Q3 de a una (el caller parte el párrafo)
  Q4 falta voz → voz default declarada; falta modelo → 503 sin_voz (nunca audio inventado)
  Q5 texto→fonemas + sample-rate 22050: UNA frontera, dentro del motor
  Q6 motor-voz.decir.request {texto, voz?, velocidad?} → motor-voz.audio {wav_base64, ms}
  MÁQUINA inferencia SERVER (genera bytes) · reproducción BORDE (<audio> en el frontend)

oír (STT)              audio → texto
  Q1 REFLEJO (whisper: señal→texto; la confianza la REPORTA, no la juzga) — NO fuzzy:
     transcribir lo que se dijo = reflejo; interpretar lo que se quiso decir = el LLM de página
  Q2 sin store · Q3 de a una (streaming = N segmentos, cada uno 1:1)
  Q4 audio ilegible → {texto:'', confianza:0} (no inventa palabras)
  Q5 decode mp3/ogg→PCM 16k: UNA frontera (symphonia)
  Q6 motor-oido.oir.request {audio_base64, idioma?} → motor-oido.transcrito {texto, idioma, confianza}
  MÁQUINA captura BORDE (mic) · inferencia SERVER o BORDE (WASM) según privacidad/potencia

traducir              texto → texto
  Q1 REFLEJO (Bergamot, caja determinista; el "¿está bien?" no lo juzga el motor)
  Q2 sin store · Q3 de a una
  Q4 par no soportado → 503 sin_par (no inventa un idioma que no tiene)
  Q5 normalizar códigos de idioma (es/spa/es-ES): UN conversor
  Q6 motor-traduce.request {texto, de, a} → motor-traduce.response {texto_traducido}
  MÁQUINA SERVER nativo (~50MB/par, sin hardware)

renderizar            datos/markup → SVG/PDF/imagen        ◀ EL PRIMERO (consumidor vivo)
  Q1 REFLEJO puro (resvg/tiny-skia/printpdf/image — 100% determinista; el más limpio)
  Q2 devuelve bytes; persiste el dueño (contenido/publicador), no el motor
  Q3 de a una (un doc → un artefacto)
  Q4 SVG malformado / fuente ausente → 503 honesto (no pinta basura; resvg ya reporta)
  Q5 unidades (mm/px/pt) y color space: UNA frontera por formato
  Q6 motor-ojo.render.request {tipo:svg|pdf|imagen, fuente, opts?} → motor-ojo.render.response {base64, ext}
  MÁQUINA SERVER nativo (Rust puro estático) · clon EXACTO de OCR4RS · trivial

interpretar-trazo     trazos canvas → intención            (PARTIDO)
  Q1 geometría (trazo cerrado ≈ rectángulo) = REFLEJO · "ese rect ES una caja de producto" = FUZZY
  Q2 CUSTODIO del canvas-state (trazos + elementos) · Q3 de a una (el gesto es la unidad)
  Q4 ambiguo → intencion:'incierta' + faltantes[] (no inventa un layout)
  Q5 canvas-px → modelo lógico: un conversor
  Q6 user.canvas.trazo → motor-ojo.canvas.interpretado {elementos, intencion} → propiocepción
  MÁQUINA captura BORDE (el lienzo está en el front) · geometría reflejo · intención fuzzy en el CORE

analizar-sonido       audio → prosodia/emoción             (PARTIDO)
  Q1 features (pitch, energía, tasa de habla vía FFT) = REFLEJO · etiqueta emocional = FUZZY
  Q2 sin store · Q3 de a una
  Q4 audio insuficiente → {emocion:'indeterminada', confianza:0} (no inventa emoción)
  Q5 decode (symphonia): una frontera
  Q6 motor-sonido.analizar.request {audio_base64} → motor-sonido.prosodia {features, emocion?, confianza}
  MÁQUINA captura BORDE (mic) · features reflejo · etiqueta fuzzy en el CORE
```

## El reparto por naturaleza (dónde vive cada mitad)

```
SERVER nativo (Rust puro, clon OCR4RS)   renderizar · traducir
SERVER con modelos ML                     decir (Piper) · oír (whisper) — solo la INFERENCIA
CORE (el LLM ya está ahí)                 la mitad FUZZY de trazo y sonido (micro-agente, tools:[])
BORDE / cliente (hardware)                mic (oír·sonido) · altavoz (decir) · canvas (trazo)
                                          captura y reproducción — WASM en el frontend o compañero de dispositivo
```

## El molde (heredado de OCR4RS, no inventado)

Cada transductor = **un servicio Rust nativo** (dentro de 2enki, `enki-sense/`) + **un módulo puente**
(`modules/motor-*`, reflejo bus↔HTTP) + **degradación honesta** (503 `sin_motor`). El motor produce
datos; el puente los proyecta al bus; la cúpula los sirve al LLM bajo demanda.

## SIN BOTÓN — operativo desde el minuto 1 (la pregunta madre aplicada)

Estos órganos **nacen operativos, sin interruptor**. La regla, con el discriminador de P0:

```
¿un botón on/off protege un ESTADO NOMBRABLE?
  · render / traducir (cómputo local puro: SVG→bytes, texto→texto; sin red, sin shell, sin
    ops peligrosas) → NO protege nada → el botón es ceremonia (miedo) → SE DISUELVE. Sin botón.
  · el ÚNICO guard que queda es honesto: si el motor no responde → 503 sin_motor.
EXCEPCIÓN (donde el botón SÍ es invariante, porque protege un estado real):
  · micrófono (oír / sonido) → PRIVACIDAD: no escuchar sin consentimiento. El guard se queda,
    pero vive en el BORDE (permiso del dispositivo), no como un toggle de servidor.
  · cualquier órgano con efecto irreversible o egress externo → guard que nombra ese estado.
```

Surface **desde el minuto 1**: la tool se añade a `GLOBAL_TOOLS` del ai-gateway (como `leer_web`),
no solo por la cúpula. Operativa sin encender nada.

## Orden de obra (demanda viva → esfuerzo, NO ley)

```
1. renderizar   → hambre real HOY: carta-digital · facturas · publicador · contenido.add_imagen.
                  Clon más trivial de OCR4RS. Prueba el molde sensorial entero barato.
2. traducir     → demanda latente real: carta multi-idioma · whatsapp con clientes en otro idioma.
3. decir · oír  → cuando exista la UI de voz que los beba (andamiables antes; degradan honesto).
4. sonido·trazo → la propiocepción sensorial; tras el canal de voz/canvas.
```

## Ciclo (diseccionador)

```
ASENTAR    este documento (hecho).
CONSTRUIR  por dependencia: puente en 2enki (degrada honesto) → repo Rust del motor → cablear deploy.
           Primer ladrillo: modules/motor-ojo (puente render) — existe en el bus antes que el motor,
           como crawl4rs vivió antes de su despliegue. 503 sin_motor hasta que el servicio esté.
VERIFICAR  test PURO por pieza (stub del HTTP, como crawl4rs__marcha-larga) · commit al verde.
COSER      contratos de evento + fronteras (sample-rate, unidades, códigos de idioma).
PODAR      nada que podar aún (familia nueva).
```

## Contrato de eventos (resumen, fuente de verdad de los topics)

```
motor-ojo.render.request → .response            (renderizar · server nativo)
motor-ojo.canvas.interpretado                   (trazo · fuzzy core, sube a propiocepción)
motor-traduce.request → .response               (traducir · server nativo)
motor-voz.decir.request → .audio                (decir · inferencia server, reproduce borde)
motor-oido.oir.request → .transcrito            (oír · captura borde, inferencia server/borde)
motor-sonido.analizar.request → .prosodia       (sonido · features reflejo, etiqueta fuzzy)
interruptor por órgano (grupo 'sistema', OFF)   enciende/apaga cada puente en caliente
```
