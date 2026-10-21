# PASADA 1 — prisma de 5 huecos con LENTE DE ROL JEFE sobre `marca-cliente`

> Sujeto correcto: **la capacidad de DECLARAR la relación con el cliente** —
> qué puede DECLARAR el dueño de la voz, la presencia, los clientes y la
> fidelización de su negocio, de qué necesita INFORMARSE y qué SEÑAL confirma.
> Ley de agnosticismo: cero tecnología de sistema ambiente.
> Fuente: modules/marca-cliente/index.js (reflejo-0.1.0, 165 líneas) + module.json
> (v0.1.0, 6 ui_handlers, RAÍZ).

## Hueco 1 — IDENTIDAD: ¿qué DECIDE el jefe aquí?

El jefe DECLARA la relación con el cliente (la política del dueño sobre cómo
tratar a su cliente), en 4 bloques del contrato `marca-v1`:

- **D1 — La VOZ** (`voz`): `tono` (adjetivo/s), `valores[]`, `tradicion_referencia`.
  Declarar esto = definir cómo se trata/suena la marca con el cliente.
- **D2 — La PRESENCIA** (`presencia`): `canales[]` — dónde está la marca
  (web, instagram, whatsapp, glovo...).
- **D3 — Los CLIENTES** (`clientes`): `lista[]` de clientes por contacto
  (teléfono/email), cada uno con sus `puntos`.
- **D4 — La FIDELIZACIÓN** (`fidelizacion`): `activa` (bool), `puntos_por_euro`
  (número > 0 o null), `recompensas[]` — el programa de puntos del negocio.

`reglas.actualizar` es LA DECLARACIÓN (única op de escritura). Los nulls del
contrato (tono null, activa false, puntos_por_euro null) son política POR
DECLARAR — los puebla el dueño.

## Hueco 2 — RESTRICCIONES: ¿qué NO depende de él?

- **Single-writer absoluto**: el reflejo escribe `/pizzepos/marca.json`
  (ConfigCustodio, fs). Una sola vía de escritura: `reglas.actualizar`. La UI
  nunca escribe ficheros.
- **Validación por campo del cambio**: el custodio valida SOLO lo que viene
  (validadores por bloque de index.js L38-72). Un campo ausente no se toca.
  `fidelizacion.puntos_por_euro` > 0 o null; `activa` bool; arrays como arrays.
- **Sin 404 de lectura**: `reglas.leer` devuelve SIEMPRE la estructura completa
  (persistida o el DEFAULT si no existe) + `fuente` ('persistida'|'default').
- No decide: la atención puntual al cliente en el POS (consulta de datos —
  utilización), ni políticas ajenas (que carta se publica, etc.).

## Hueco 3 — CONTRATO: ¿qué VER antes de decidir y qué SEÑAL confirma?

- VER: `reglas.leer` → `{ reglas, fuente }` — las reglas vigentes por bloques
  (voz/presencia/clientes/fidelizacion). `voz.obtener` y `presencia.obtener`
  son lecturas parciales (neutras). El panel usa `reglas.leer` para el informe.
- SEÑAL de confirmación: `marca.reglas.actualizadas` — publicada por el
  ConfigCustodio al persistir (index.js L132, `_custodio.actualizar` → eventBus),
  con payload `{ project_id, reglas }`. Cadena: reflejo → eventBus core → MQTT →
  el frontend suscribe en dot notation.

## Hueco 4 — NO-OBJETIVOS: ¿qué caras NO son del jefe?

- **UTILIZACIÓN (2 ops)**: `cliente.obtener` + `fidelizacion.obtener` (por
  `contacto` requerido) — la ATENCIÓN al cliente en el POS, consulta puntual.
  NO se implementa en este panel del jefe.
- **NEUTRO (3 ops)**: `reglas.leer` (informe, alimenta la vista),
  `voz.obtener`, `presencia.obtener` (lecturas parciales).
- SISTEMA: fs store (`/pizzepos/marca.json` del proyecto), métricas del reflejo.

## Hueco 5 — PREGUNTAS_ABIERTAS (decisiones SUYAS, se nombran, no se cierran)

- [ABIERTO] **Alta/edición de clientes individuales**: la `lista[]` de clientes
  no tiene escritura UI dedicada; `cliente.obtener` es consulta puntual.
- [ABIERTO] **Eventos granulares por bloque**: la señal es de módulo
  (marca.reglas.actualizadas con la reglas completas), no hay
  marca.voz.actualizada etc.
- [ABIERTO] **Recompensas tipadas**: hoy son strings libres en `recompensas[]`
  (café gratis, % descuento...); no hay un tipo canónico.

Huecos de CONTRATO (faltan campos/señales), no de CAPTURA (la UI no pide nada
que el módulo no soporte). Se listan como onboarding del dueño, no como defectos.
