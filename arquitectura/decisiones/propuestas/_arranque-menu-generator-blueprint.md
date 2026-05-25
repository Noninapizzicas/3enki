# Arranque migración menu-generator blueprint — mensaje y preguntas listas para la próxima conversación

Este archivo NO es un contrato ni un plan — es **el guion literal** que tú
pegas al arrancar la próxima sesión para implementar la migración de
`menu-generator` a blueprint puro. Está diseñado para que la otra
conversación no improvise ni pierda contexto.

Doc maestro de referencia:
`arquitectura/decisiones/propuestas/migracion-menu-generator-blueprint.md`.
Agente archivado:
`_archived/2026-05-24_menu-structurer-preservado/` (con README de
recuperación).

---

## 1 · Mensaje literal para pegar al inicio de la nueva conversación

Cópialo tal cual:

> *"Lee `arquitectura/decisiones/propuestas/migracion-menu-generator-blueprint.md`
> entero. Es el plan completo.
>
> Verifica antes de tocar nada:
> - `modules/pizzepos/menu-generator/index.js` existe (legacy a archivar).
> - `_archived/2026-05-24_menu-structurer-preservado/` existe y contiene
>   `menu-structurer.json` + `menu-structurer-system.md` + `README.md`.
> - `arquitectura/decisiones/_contratos/modulos-blueprint-driven.contract.json`
>   está en v1.1.0 con la nota OCR sobre menu-generator (la que se va a
>   quitar en Fase 6).
>
> Reporta el estado en una tabla. Si algo de lo anterior NO está, párate
> y pregúntame antes de seguir.
>
> Luego salta a **Fase 1**: cerrar conmigo las **4 decisiones abiertas**
> de la sección 5 del doc maestro. Hazme las preguntas en el orden de
> este archivo y guarda mis respuestas aquí mismo.
>
> Solo cuando las 4 estén cerradas, ejecuta Fase 0 (auditoría de
> consumers) y para a pedirme OK antes de Fase 2 (schema) y siguientes.
>
> NO empieces a escribir el blueprint hasta que las 4 preguntas estén
> respondidas Y la auditoría Fase 0 esté reportada Y yo haya dado OK
> explícito. NO crees PR sin OK explícito mío."*

---

## 2 · Las 4 preguntas en orden (la otra conversación me las hace una a una)

Formato de cada pregunta: **enunciado · opciones · recomendación del doc
(punto de partida, pero el usuario decide)**.

### Pregunta 1 — Path del blueprint nuevo (sección 5.1 del doc maestro)

¿Dónde vive el blueprint del nuevo módulo?

- **A**: `modules/pizzepos/menu-generator/menu-generator.blueprint.json`
  (mismo path actual, mantiene scope pizzepos).
- **B**: `modules/menu-generator/menu-generator.blueprint.json` (raíz
  de modules/, coherente con otros blueprints del subsistema-carta).
- **C**: Nuevo subsistema `modules/subsistema-carta-editorial/` con
  menu-generator + carta-marketing + carta-design juntos.

Recomendación de partida en el doc: **A**. Mínima fricción, mantiene
path histórico, `target_page_id` no cambia, frontend no se entera.

Mi respuesta: **A** — `modules/pizzepos/menu-generator/menu-generator.blueprint.json`. Coherente con la convención actual del repo (los 6 blueprints del subsistema-carta ya viven bajo `modules/pizzepos/`); A es la única opción con precedente vivo.

---

### Pregunta 2 — Schema canónico de carta pizzepos (sección 5.2)

¿Cómo se trata el shape de salida del módulo (carta JSON)?

- **A**: Extraer del legacy + congelar en
  `arquitectura/decisiones/_schemas/menu-generator/carta-pizzepos.schema.json`.
- **B**: Definir desde cero coordinando con consumers del subsistema
  POS (carta-manager, productos, categorias).
- **C**: Sin schema AJV — declarativo en el pseudocódigo, validación
  pasa por el destino al persistir.

Recomendación de partida en el doc: **A**. Preserva contrato implícito
con consumers actuales, evita romper integraciones existentes.

Mi respuesta: ___

---

### Pregunta 3 — Persistencia del resultado (sección 5.3)

¿Quién guarda la carta generada?

- **A**: Blueprint llama `publishAndWait('carta-manager.crear.request', ...)`.
  carta-manager persiste. Event-core puro.
- **B**: Blueprint llama `publishAndWait('fs.write.request', ...)`
  directamente. Más simple, viola `no_explorar_estado_ajeno`.
- **C**: Blueprint devuelve la carta como result — el caller persiste.

Recomendación de partida en el doc: **A**. Cumple event-core, delega
persistencia al dueño del dominio carta.

Mi respuesta: ___

---

### Pregunta 4 — Subscribe a `carta.generar.solicitada` (sección 5.4)

¿Qué hacemos con el handler de evento del bus que arranca el pipeline?

- **A**: Blueprint declara `subscribes: ['carta.generar.solicitada']` +
  LLM-runtime maneja la suscripción (patrón blueprint-subscribers-asincronos
  ya canónico).
- **B**: Eliminar el subscribe — quien quiera generar invoca directamente
  la tool del blueprint.
- **C**: Ambos modos (subscribe + tool directa).

Recomendación de partida en el doc: **A**. Preserva integración con
carta-scheduler y otros emisores del evento, no cambia API externa.

Mi respuesta: ___

---

## 3 · Qué hace la otra conversación con mis 4 respuestas

1. Las guarda en este mismo archivo (sustituye los `___` por las
   respuestas + 1 línea de motivo si la hay).
2. Para y pide tu OK explícito antes de ejecutar Fase 0 (auditoría de
   consumers).
3. Si das OK, ejecuta Fase 0 → reporta tabla de consumers → para otra
   vez para que decidas compat-strategy si hay rotos.
4. Si Fase 0 limpia, continúa con Fases 2-8 según el doc maestro:
   - Schema (si decisión 2 = A o B).
   - Blueprint nuevo.
   - Bump `module.json`.
   - Archivado del legacy.
   - Bump contrato `modulos-blueprint-driven` v1.1.0 → v1.2.0.
   - Tests (smoke + audit runtime).
   - Cleanup.
5. Para a pedirte OK antes de cualquier commit con cambios destructivos
   (eliminar dependencias `package.json`, eliminar agente del legacy
   path).
6. **NO crear PR sin OK explícito.**

---

## 4 · Recordatorios para la próxima conversación

- Idioma de los archivos: español (canónico del repo).
- El blueprint NO sigue POC2 (es blueprint puro, sin JS).
- Sin emojis en código ni archivos salvo que el usuario los pida.
- Branch de trabajo: la que diga el system prompt de esa sesión, NUNCA
  pushear a otra sin permiso explícito.
- `validate:ci` tiene que pasar antes de cualquier merge/push.
- **NUNCA crear PR sin OK explícito del usuario.**
- **NO** crear nuevos módulos OCR sustitutos. La capa OCR queda fuera
  del scope. Si vuelve a hacer falta, horizontal futuro.
- **NO** migrar el agente `menu-structurer` a `agente-blueprint`. Está
  archivado por decisión cerrada (criterio: aplica solo si dolor en
  runtime, ver sección 3 del doc maestro).

---

## 5 · Si algo se tuerce

Si la otra conversación intenta:
- Construir módulos OCR (`pdf-extractor`, `image-preprocessor`,
  `ocr-vision`) → **rechaza**, decisión 4.4 cerrada (eliminación total,
  no extracción).
- Migrar `menu-structurer` a `agente-blueprint` → **rechaza**, decisión
  4.2 cerrada (archivado, criterio de recuperación en sección 3 del
  doc maestro).
- Cambiar el `target_page_id` del módulo → **rechaza**, el nodo del
  grafo cajones se preserva intacto.
- Bumpear `modulos-blueprint-driven.contract.json` más allá de v1.2.0
  o tocar otras secciones del contrato → **rechaza**, solo cambia la
  nota OCR sobre menu-generator y la reclasificación del módulo.
- Cambiar shape de los 5 eventos canónicos (`menu.generation.*`,
  `carta.generar.*`) → **rechaza**, son invariantes que preservan
  consumers existentes.
- Crear PR sin tu OK explícito → **rechaza**.
- Saltarse Fase 0 (auditoría de consumers) → **rechaza**, es el único
  garante de que la migración no rompe integraciones existentes.

Si dudas, frase canónica: *"Vuelve al doc maestro
`migracion-menu-generator-blueprint.md` antes de seguir."*

---

## 6 · Cheatsheet del estado pre-migración

| Pieza | Estado | Notas |
|---|---|---|
| Módulo `menu-generator` JS legacy | Vivo en `modules/pizzepos/menu-generator/` | 373 LOC, 3 capas (OCR roto + agente + tool) |
| Capa OCR | Rota, no se usa en producción | Eliminación total decidida |
| Agente `menu-structurer` | Archivado en `_archived/2026-05-24_menu-structurer-preservado/` | Con README de recuperación |
| `target_page_id: "menu-generator"` | Ya declarado en `module.json` | NO se toca |
| 5 eventos canónicos | `menu.generation.{progress,failed}`, `carta.generar.{iniciada,fallida,solicitada}` | Se preservan invariantes |
| Bloqueo del contrato `modulos-blueprint-driven` v1.1.0 | Vigente: la nota OCR sobre menu-generator | Se quita en Fase 6 (bump v1.2.0) |
| 3 dependencias nativas | `pdfjs-dist`, `sharp`, `@google-cloud/vision` en `package.json` | Se eliminan en Fase 5 si ningún otro módulo las usa (grep antes) |
| Test legacy POC2 | `tests/unit/pizzepos__menu-generator.test.js` | Se reescribe contra el blueprint nuevo |
| Tool actual `menu.generate` | Auto-wireada por `tools.contract v1.2` | Pasa a ser `menu-generator.generar` (verbo canónico) |
