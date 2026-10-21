# PASADA 1 — prisma de 5 huecos con LENTE DE ROL JEFE sobre `tecnicas`

> Sujeto correcto (no el módulo entero): **la capacidad de tecnicas de servir
> las DECISIONES del rol JEFE** — qué puede DECLARAR el dueño sobre el catálogo
> de técnicas culinarias codificadas del proyecto, de qué necesita INFORMARSE y
> qué SEÑAL confirma. Ley de agnosticismo: cero tecnología de sistema ambiente.
> Fuente: tecnicas.blueprint.json v1.2.0 (391 líneas, leídas enteras — el módulo
> NO tiene index.js: es blueprint-driven, el LLM ES el runtime vía ai-gateway)
> + module.json v1.1.0. Alimento: anatomía-eventos-elementos.md (mismo dir).

## Hueco 1 — IDENTIDAD: ¿qué DECIDE el jefe aquí?

El jefe declara el CATÁLOGO de técnicas — el futuro del saber hacer del
negocio, que después recetas/prototipos referencian por tecnica_id y el
ai-gateway usa como default del turno. El contrato abre 2 escrituras:

- **D1 — Codificar una técnica nueva** (`codificar`): nombre (único),
  descripción, categoría, parámetros técnicos (temperaturas, tiempos, ratios),
  materiales, instrucciones paso a paso, etiquetas. Declarar esto = meter en
  el catálogo una técnica que cocina/equipo puede ejecutar.
- **D2 — Declarar la evolución de una técnica** (`actualizar`): los 6 campos
  permitidos (descripcion, categoria, parametros, materiales, instrucciones,
  etiquetas). Cada declaración = snapshot previo al history + version +1.

El catálogo nace vacío y el dueño lo puebla. No hay "política por declarar"
a la entrega: la alta (codificar) es la declaración primigenia.

## Hueco 2 — RESTRICCIONES: ¿qué NO depende de él?

- **Single-writer del store**: la única vía de escritura es `tecnicas.json`
  del proyecto (single-json-per-project, single-writer) y solo por codificar
  o actualizar. La UI jamás escribe ficheros.
- **El nombre es la clave de unicidad** (lowercase+trim): el jefe no puede
  tener dos técnicas con el mismo nombre — el módulo lo dictamina
  ALREADY_EXISTS en la respuesta de codificar.
- **La versión y el history deciden solos**: la UI no puede tocar
  id/nombre/version/history/created_at vía actualizar (enum de campos
  permitidos del contrato); no hay "reinvertir el historial".
- **El dato exacto manda**: los parámetros son DATOS (°C, min, ratios) — el
  módulo NO valida rangos semánticos y la UI no inventa: viajan verbatim.
- No decide: qué recetas usan cada técnica (recetas referencia tecnica_id),
  ni el coste de insumos (escandallo), ni la ejecución en cocina (cocina).

## Hueco 3 — CONTRATO: ¿qué VER antes de decidir y qué SEÑAL confirma?

- VER: `listar {}` → catálogo ALFABÉTICO ligero (sin history): id, nombre,
  categoria, descripcion, etiquetas, version. Estado del catálogo de un
  vistazo. `parametros { tecnica_id }` → subset acotado al pulso técnico
  (motivo de existir: que el LLM consulte ligero).
- VER profundo de 1 técnica: `obtener { tecnica_id | nombre }` → técnica
  COMPLETA con history (match por nombre exacto > parcial).
- SEÑAL de confirmación (verificadas en el contrato): `tecnica.creada`
  (tras codificar persiste) y `tecnica.actualizada` (tras actualizar
  persiste, con campos_modificados). El JSON de seed de la UI (ui.datos /
  ui.detalle) define `refresh_on: [tecnica.creada, tecnica.actualizada]` —
  la página se re-asienta con AMBAS.

## Hueco 4 — NO-OBJETIVOS: ¿qué caras NO son del jefe?

- **UTILIZACIÓN: VACÍA (0 ops)** — el uso de una técnica es información:
  consultar parametros/obtener es LECTURA (neutro) para cocina/recetas, no
  una ejecución de venta. La técnica no se "cobra" ni se "despacha" — el
  árbitro: no hay decisión AHORA que ejecute este módulo en la venta.
- SISTEMA: fs store (tecnicas.json), history/auditoría, el módulo-base del
  subsistema-recetario del que extiende.

## Hueco 5 — PREGUNTAS_ABIERTAS (decisiones SUYAS, se nombran, no se cierran)

- [ABIERTO] **Categorías canónicas**: categoria es string libre (trabajo
  pendiente #2 del contrato: coccion/preservacion/transformacion/presentacion/
  fermentacion/marinado...) — el dueño decide el enum cuando el catálogo
  crezca. La UI hoy: texto libre con sugerencias, no enum cerrado.
- [ABIERTO] **Forma del esquema de parámetros**: `parametros` es object libre
  por técnica (¿{temperatura_horno:{min,max}}? ¿lista plana?). El contrato de
  v2 podría fijar sub-esquemas por categoría de técnica.
- [ABIERTO] **Vinculación con recetas**: si la técnica cambia parámetros, las
  recetas que la usan no se enteran (trabajo pendiente #1: subscribirse a
  tecnica.actualizada para invalidar escandallos).

Huecos de CONTRATO (faltan campos/enum), no de CAPTURA: la UI no pide nada
que el módulo no soporte. Se listan como onboarding del dueño, no defectos.