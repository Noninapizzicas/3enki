# PASADA 1 — prisma de 5 huecos con LENTE DE ROL JEFE sobre `carta-marketing`

> Sujeto correcto (no el módulo entero): **la capacidad de DECLARAR la identidad
> de marca** — qué puede DECLARAR el dueño de la voz, el visual y el público de
> su negocio, de qué necesita INFORMARSE y qué SEÑAL confirma.
> Ley de agnosticismo: cero tecnología de sistema ambiente.
> Fuente: modules/pizzepos/carta-marketing/index.js (reflejo-2.1.0, 199 líneas)
> + module.json (v2.6.0) + arquitectura/decisiones/_schemas/marca/marca.schema.json.

## Hueco 1 — IDENTIDAD: ¿qué DECIDE el jefe aquí?

El jefe DECLARA la IDENTIDAD de marca (el ADN que beben carta-digital,
carta-design, copy y canales), no cifras ni operaciones. La identidad es BASE
compartida (`/pizzepos/marca.json`) con contrato mecánico (marca.schema.json).
Tres decisiones, y solo tres, porque el esquema abre esas palancas:

- **D1 — La VOZ** (`voz`): cómo habla la marca. `tono[]` (2-3 adjetivos:
  cercana, gamberra, elegante…), `registro` (tú/usted, formal/desenfadada),
  `referencias[]` (inspiraciones), `si[]` (lo que SÍ hace), `no[]` (lo que
  NUNCA hace). Declarar esto = definir cómo suena TODO el copy (carta, posts,
  notificaciones).
- **D2 — El VISUAL** (`visual`): cómo se ve. `colores{}` (rol → hex),
  `tipografias{}` (rol → familia), `estilo` (dirección en una frase),
  `logo` (ruta al fichero). Dueño COMPARTIDO: el jefe capta el inicial;
  carta-design lo REFINA (paleta/tipografías finales).
- **D3 — El PÚBLICO** (`publico`): a quién. `quien` (familias, jóvenes,
  inconformistas…), `actitud` (qué buscan, cómo viven).

`update_perfil` es LA DECLARACIÓN (1 op de escritura, deep-merge por sección).
El mínimo para arrancar es `esencia.nombre`; el resto se rellena de a poco.

## Hueco 2 — RESTRICCIONES: ¿qué NO depende de él?

- **Single-writer absoluto**: el reflejo escribe `/pizzepos/marca.json` (fs.write
  atómico, single-writer). Una sola vía de escritura: update_perfil. La UI nunca
  escribe ficheros y ninguna otra op persiste.
- **Deep-merge por sección**: un parche parcial (p.ej. `{ voz: { tono } }`) NO
  pisa el resto de la identidad (index.js L41-48). El jefe edita por sección sin
  riesgo de borrar lo ya declarado.
- **EL FRENO (contrato mecánico)**: la marca SÍ tiene schema (marca.schema.json).
  update_perfil RE-VALIDA la marca RESULTANTE del merge contra el schema ANTES
  de escribir (index.js L127-128, `_checkMarca` AJV). Un parche que la rompe
  (voz como string, esencia.nombre como número) → 422, NO persiste. El COPY no
  tiene freno mecánico (texto libre — su contrato es la VOZ, irreducible al
  PENSAR).
- No decide: qué carta se publica (carta-manager), el diseño final de la carta
  (carta-design refina el visual), ni el copy redactado (lo redacta el LLM de
  página en la voz declarada).

## Hueco 3 — CONTRATO: ¿qué VER antes de decidir y qué SEÑAL confirma?

- VER: `get_perfil` → la identidad completa por secciones (esencia/voz/publico/
  visual/negocio). Devuelve SIEMPRE la estructura completa (secciones vacías si
  falta — index.js L77: `deepMerge(identidadVacia(), store)`). Sin 404: la falta
  de marca es estado NOMBRADO (secciones vacías), no error.
- SEÑAL de confirmación: `marketing.perfil.actualizado` — publicada por el
  reflejo al persistir (index.js L145, `_emitirActualizado`), con payload
  `{ project_id, campos_modificados, correlation_id, timestamp }`. Cadena
  verificada: reflejo → eventBus del core → MQTT → el frontend suscribe en dot
  notation (carta-digital la escucha como fuente).

## Hueco 4 — NO-OBJETIVOS: ¿qué caras NO son del jefe?

- **UTILIZACIÓN (nada)**: la marca NO se vende ni se consume en un panel — se
  bebe en otros paneles (carta-digital, carta-design, copy). No hay op de
  utilización en este módulo.
- **NEUTRO**: `get_perfil` — informe que alimenta la vista y la decisión.
- SISTEMA: fs store (`/pizzepos/marca.json` del proyecto), métricas del reflejo.

## Hueco 5 — PREGUNTAS_ABIERTAS (decisiones SUYAS, se nombran, no se cierran)

- [ABIERTO] **Arquetipo de marca**: el esquema no abre `arquetipo` (héroe,
  rebelde, sabio…) como campo canónico — hoy es texto libre en la identidad.
- [ABIERTO] **Manifiesto**: el esquema no abre `manifiesto` (titulo/texto/cierre)
  como sección validable — el copy lo redacta el LLM de página, no se declara
  aquí.
- [ABIERTO] **Extracción automática de paleta desde el logo**: hoy se pregunta/
  confirma; extraer la paleta desde la imagen es capacidad aparte (pipeline de
  imagen, pendiente).
- [ABIERTO] **Eventos granulares por sección**: la señal es de módulo
  (marketing.perfil.actualizado con campos_modificados), no hay
  marketing.voz.actualizada / marketing.visual.actualizada por sección.

Huecos de CONTRATO (faltan campos/señales), no de CAPTURA (la UI no pide nada
que el módulo no soporte). Se listan como onboarding del dueño, no como defectos.
