# menu-generator legacy v7.0.0 — archivado 2026-05-25

Implementacion legacy JS del modulo `menu-generator`. Archivada por la migracion
documentada en `arquitectura/decisiones/propuestas/migracion-menu-generator-blueprint.md`
(4 decisiones cerradas en `_arranque-menu-generator-blueprint.md`).

## Que reemplaza esta archivacion

| Pieza v7.0.0 (este directorio) | Sustituida por (canonico v8.0.0) |
|---|---|
| `index.js` (373 LOC, 3 capas OCR + agente + tool) | `modules/pizzepos/menu-generator/menu-generator.blueprint.json` (blueprint puro v8.0.0) |
| `context.json` (rules `no_editar`/`no_guardar`/`no_buscar`) | El blueprint ya delega persistencia a `carta-manager.save.request` (no_explorar_estado_ajeno por contrato `llm-runtime-discipline`) |
| `prompt.json` (system prompt del v7) | `arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json` v0.4.0 (padre) + prompt del blueprint hijo |
| `schemas/carta-output.json` (draft-07 legacy) | `arquitectura/decisiones/_schemas/menu-generator/carta-pizzepos.schema.json` (AJV draft 2020-12, `additionalProperties: false`, `$id` canonico) |

## Decisiones cerradas

- **4.2**: agente `menu-structurer` archivado en `_archived/2026-05-24_menu-structurer-preservado/`. El LLM principal del blueprint absorbe la estructuracion en una sola pasada.
- **4.4**: pipeline OCR (`pdfjs.render → sharp.prepare-ocr → google-vision.extract`) ELIMINADO entero. No funcionaba en produccion. Input v8 = texto pegado/dictado o JSON ya estructurado (decision 4.1).
- **5.1**: blueprint vive en mismo path historico (`modules/pizzepos/menu-generator/`). target_page_id preservado.
- **5.3**: persistencia via `carta-manager.save.request` (event-core puro).
- **5.4**: subscribe a `carta.generar.solicitada` preservado via mecanismo `blueprint-subscribers-asincronos` (canonizado en main tras frente 2.4).

## Eventos canonicos preservados del v7

El v8.0.0 preserva los 4 eventos canonicos consumidos por `frontend/src/lib/stores/menu-generator.ts`:

- `menu.generation.progress` (step `structuring` solamente — el `extracting` desaparece con OCR)
- `menu.generation.failed`
- `carta.generar.iniciada`
- `carta.generar.fallida`

`agent.execute.request` del v7 al agente menu-structurer YA NO se publica (agente archivado).

## Recuperacion

Si en el futuro vuelve a hacer falta OCR, NO se desempolva este `index.js` — se construyen
modulos JS dedicados (`pdf-extractor`, `image-preprocessor`, `ocr-vision`) como horizontal
futuro. Este directorio queda como referencia historica.
