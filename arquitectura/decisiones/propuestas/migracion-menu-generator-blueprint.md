# Migración menu-generator JS legacy → blueprint puro

> **Documento de retomar.** Captura el plan para migrar
> `modules/pizzepos/menu-generator/` de JS legacy a blueprint puro.
> El módulo ya tiene `target_page_id: "menu-generator"` (ya es nodo
> navegable del grafo de cajones) — falta el blueprint en sí.
>
> Pensado a la vez como **piloto del principio rector "LLM principal +
> agentes cuando duela"** que se va a aplicar a futuro en todo el
> subsistema-carta.

Fecha: 2026-05-24.
Documentos hermanos en `propuestas/`:
- `capa-unica-tools-via-plugins.md` ✅ cerrado.
- `cajones-context-partitioning.md` ✅ cerrado.
- `migracion-agentes-blueprint.md` — pendiente, ortogonal a este.
- `principio-dolor-guia-diseno.md` — referencia filosófica.

---

## 1 · Por qué existe este documento

El usuario lo planteó así (literal):

> *"Menú generator está en JS aún y tendría que estar en blueprints
> podríamos analizarlo y prepara un plan acorde con el sistema que
> tenemos. Lo único que tiene bueno ese módulo es la lógica y como
> transforma un JSON en una carta o menú compatible con pizzepos pero
> todo esto OCR (ocr-vision, image-preprocessor, pdf-extractor) ni
> funciona. Mi idea es dejar el LLM como asesor conversacional y
> utilizar agentes para las tareas más específicas o especiales pero
> podemos empezar con LLM e ir pasando a agentes los procesos que
> duelan."*

Esto desmonta el bloqueo canónico previo del módulo:

`arquitectura/decisiones/_contratos/modulos-blueprint-driven.contract.json`
v1.1.0 dejaba `menu-generator` fuera de los candidatos a blueprint con
esta nota:

> *"menu-generator: NO es POS transaccional, pero su pipeline depende
> de librerias nativas (pdfjs, sharp, Google Vision OCR) que el LLM
> como runtime no puede ejecutar. Bloqueado como candidato blueprint
> hasta que existan modulos JS deterministas separados (ocr-vision,
> image-preprocessor, pdf-extractor)."*

**El bloqueo era teórico**: el pipeline OCR no funciona y no se usa
en producción. Si se elimina entero (en lugar de extraerlo a 3 módulos
JS deterministas), el bloqueo desaparece y el módulo se convierte en
candidato natural a blueprint puro.

**Cómo usar este documento en la próxima sesión:**
1. Lee este doc (~10 min).
2. Lee `arquitectura/decisiones/_contratos/modulos-blueprint-driven.contract.json`
   v1.1.0 (las 4 condiciones que un módulo debe cumplir para ser
   candidato; al eliminar el OCR, `menu-generator` las cumple las 4).
3. Sigue el guion en `_arranque-menu-generator-blueprint.md`.

---

## 2 · Estado actual de `menu-generator`

### Estructura del legacy (`modules/pizzepos/menu-generator/index.js`, 373 LOC)

Tres capas claramente separadas:

| Capa | Qué hace | LOC aprox | Destino en la migración |
|---|---|---|---|
| 1. Pipeline OCR | `extractText`, `pdfToImages`, `prepareImage`, `ocrExtract` — librerías nativas `pdfjs`, `sharp`, `google-vision` | ~200 | **Eliminar entera**. No funciona. Se descarta el código y las 3 dependencias del `package.json`. |
| 2. Invocación al agente | `agent.execute.request` → `menu-structurer` (estructura texto → JSON) | ~50 | **Eliminar**. El blueprint del nuevo módulo razona estructuración + transformación en una pasada (ver decisión 4.2). Agente archivado en `_archived/2026-05-24_menu-structurer-preservado/`. |
| 3. Orquestación + tool | `toolGenerate` (entry point del LLM), `onCartaGenerarSolicitada` (handler de evento), helpers POC2 | ~120 | **Absorbido por el blueprint puro**. Se vuelve pseudocódigo declarativo. |

### Lo bueno que se preserva

- **La lógica de transformación JSON → carta pizzepos**: cómo se mapean
  categorías, productos, precios e ingredientes al shape canónico que el
  resto del subsistema POS espera.
- **Los eventos canónicos** del bus que el módulo publica/escucha
  (`menu.generation.progress`, `menu.generation.failed`,
  `carta.generar.{iniciada,fallida,solicitada}`). Se preservan
  invariantes.
- **El `target_page_id: "menu-generator"`** (ya está). El módulo sigue
  siendo nodo del grafo cajones sin cambios.

### Lo que se elimina

- 3 dependencias nativas del `package.json` (`pdfjs-dist`, `sharp`,
  `@google-cloud/vision`).
- Agente `menu-structurer` (archivado, no borrado — recuperable).
- ~200 LOC de pipeline OCR roto.
- Posible documentación sobre OCR en el módulo (verificar `context.json`
  + `prompt.json`).

---

## 3 · Principio rector del nuevo módulo (filosofía, no solo decisión técnica)

> **El LLM principal del blueprint hace el trabajo conversacional + de
> transformación. Los agentes especializados aparecen solo cuando un
> proceso concreto demuestra dolor en runtime: latencia inaceptable,
> indeterminismo recurrente, lock-in a un provider, contexto que satura
> el blueprint principal. Sin dolor demostrado, no se extrae a agente.**

Esta es la **visión arquitectónica del usuario para todo el subsistema
carta a futuro**, no solo para este módulo. Se canoniza aquí porque
`menu-generator` es el primer caso donde se aplica explícitamente.

### Criterios concretos de "dolor suficiente" para extraer un proceso a agente

Cuando alguno de estos se cumple en runtime real (audit confirmado, no
intuición), se reabre el proceso como agente especialista propio
siguiendo el patrón `agente-blueprint`:

| Síntoma | Cómo medirlo | Acción |
|---|---|---|
| Latencia del turno > 25s consistente | Métricas de `chat.assistant.saved` por turno en runtime real | Extraer el sub-paso lento a agente con su propio `provider`/`temperature`/`max_tokens` |
| Tasa de salida malformada > 10% | Auditoría: contar respuestas que no validan contra el schema esperado | Extraer a agente con `temperature: 0.1` y prompt más estricto |
| El blueprint principal supera 30 cajones | `_extractCajones` cuenta los cajones del blueprint | Extraer las operaciones del sub-dominio a un agente con su propio catálogo |
| Necesidad de `provider` distinto (ej. modelo grande para razonar receta compleja) | Decisión humana cuando el LLM general no llega | Crear agente con provider declarado |
| Cardinalidad N de la operación (ej. 5 estilos de copywriting, cada uno con personalidad propia) | Diseño del dominio | N agentes especialistas, no N cajones del mismo blueprint |

Sin uno de estos cumplido, **NO se extrae agente**. Se vive con el LLM
general durante 2-4 semanas y se reevalúa.

---

## 4 · Decisiones tomadas

### 4.1 Alcance del input

**B** (cerrado): el blueprint acepta **texto pegado/dictado + JSON ya
estructurado**.

- Texto: el usuario pega/dicta una carta en lenguaje libre (lista de
  productos, descripción, ...).
- JSON: el usuario importa una carta ya estructurada desde otra
  herramienta (ej. export de otro POS, scraping previo). El blueprint
  solo valida y adapta a pizzepos.

**Fuera de scope explícito**: archivos PDF/imagen. Si en el futuro
alguien quiere subir PDF, será un módulo OCR separado que invoca este
blueprint pasándole el texto ya extraído.

### 4.2 Agente `menu-structurer`: eliminado, no migrado

**A** (cerrado): el blueprint del módulo absorbe la estructuración + la
transformación a pizzepos **en una sola pasada conversacional**.

- El agente legacy se archiva (no se borra) en
  `_archived/2026-05-24_menu-structurer-preservado/` con README de
  recuperación.
- Si en algún momento "estructurar texto" duele en runtime (criterios
  de la sección 3), se recupera y se migra a `agente-blueprint`.
- Esto **cierra 1 agente** del frente 2.8 (`migracion-agentes-blueprint`)
  sin necesidad de migrarlo. Coherente con `recipe-curator` (eliminado
  por obsoleto).

### 4.3 Verbo de la operación principal

**A** (cerrado): `generar` (mantiene compat con `menu.generate`).

- El blueprint declara operación `generar` con cajón
  `menu-generator.generar`.
- El nombre histórico de la tool se preserva → menos fricción para
  consumers existentes (`carta.generar.solicitada`,
  `menu.generation.progress`, etc.).

### 4.4 Capa OCR: eliminación total, no extracción

**Cerrado**: se elimina entera. No se extrae a 3 módulos JS
deterministas.

- Razón: no funciona en producción.
- Beneficio colateral: **cierra el bloqueo del contrato
  `modulos-blueprint-driven` v1.1.0** sobre `menu-generator`.
- Bump del contrato a v1.2.0 con la nota OCR retirada y
  `menu-generator` movido de `verticales_operacionales_alto_volumen`
  a `candidatos_a_blueprint.subsistema_carta`.

---

## 5 · Decisiones AÚN abiertas (a cerrar antes de tocar código)

### 5.1 Path del blueprint nuevo

¿Dónde vive el blueprint del nuevo módulo?

- **A**: `modules/pizzepos/menu-generator/menu-generator.blueprint.json`
  (mismo path actual del módulo, conserva pizzepos como scope).
- **B**: `modules/menu-generator/menu-generator.blueprint.json` (raíz
  de modules/, coherente con cómo el subsistema-carta tiene cada
  blueprint en su propio directorio).
- **C**: Crear nuevo subsistema `modules/subsistema-carta-editorial/`
  donde menu-generator + carta-marketing + carta-design vivan juntos.

Recomendación de partida: **A** (mínima fricción, mantiene path
histórico, `target_page_id` no cambia, frontend no se entera).

### 5.2 Shape exacto del JSON canónico de carta pizzepos

El módulo transforma input → carta JSON. ¿Existe ya un schema canónico
de "carta pizzepos" en el repo, o hay que cristalizarlo en este horizontal?

- **A**: Reusar el shape que ya genera `toolGenerate` legacy
  (extraerlo del código + congelarlo como
  `arquitectura/decisiones/_schemas/menu-generator/carta-pizzepos.schema.json`).
- **B**: Definir el schema desde cero coordinando con los consumers
  del subsistema POS (carta-manager, productos, categorias).
- **C**: Dejarlo declarativo en el pseudocódigo del blueprint sin
  schema AJV (el LLM produce JSON, la pseudo-validación pasa por la
  operación destino al guardar).

Recomendación de partida: **A** (preserva contrato implícito con
consumers actuales, evita romper integraciones existentes).

### 5.3 Persistencia del resultado

¿Quién guarda la carta generada y dónde?

- **A**: Blueprint llama `publishAndWait('carta-manager.crear.request', ...)`
  → carta-manager persiste. Coherente con event-core puro.
- **B**: Blueprint llama `publishAndWait('fs.write.request', ...)`
  directamente → menu-generator escribe el archivo. Más simple, viola
  `no_explorar_estado_ajeno` de `llm-runtime-discipline`.
- **C**: Blueprint devuelve la carta como resultado de su operación
  `generar`, y es responsabilidad del caller persistir (UI o agente
  que invocó).

Recomendación de partida: **A** (cumple event-core, delega persistencia
al dueño del dominio carta).

### 5.4 ¿Qué pasa con `onCartaGenerarSolicitada` (handler de evento del bus)?

El módulo legacy escucha `carta.generar.solicitada` y arranca el
pipeline. En el modelo blueprint:

- **A**: El blueprint declara `subscribes: ['carta.generar.solicitada']`
  + el LLM-runtime maneja la suscripción automáticamente (patrón
  blueprint-subscribers-asincronos ya canónico en main).
- **B**: Eliminar el subscribe — quien quiera generar una carta invoca
  directamente la tool `menu-generator.generar` del blueprint.
- **C**: Mantener ambos modos: subscribe del bus + tool directa.

Recomendación de partida: **A** (preserva la integración con `carta-scheduler`
y otros emisores del evento, sin cambiar API externa).

---

## 6 · Cuellos identificados

| # | Cuello | Severidad | Mitigación |
|---|---|---|---|
| 1 | Romper consumers que esperan eventos `menu.generation.*` | Alta | Preservar nombres + shapes de los 5 eventos canónicos actuales. Validar antes/después contra el catálogo de eventos del repo. |
| 2 | Lock-in al provider que use el LLM general del blueprint | Media | Coherente con la filosofía: si un provider concreto da mejor resultado para cartas largas, se extrae a agente. Hasta entonces, `provider: auto` del blueprint padre. |
| 3 | Cartas grandes (50+ productos) saturan el blueprint | Baja inicial, observar | Si emerge, decisión arquitectónica: usar cajones del propio módulo + chunking de la carta. |
| 4 | El agente `menu-structurer` archivado tenía `temperature: 0.1` (más estricto) — el blueprint general puede ser más laxo y devolver JSON inválido | Media | Pseudocódigo del blueprint instruye al LLM "responde SOLO con el JSON, sin texto fuera". Si tasa de salidas inválidas > 10%, criterio para reabrir como agente. |
| 5 | Las dependencias nativas (`pdfjs`, `sharp`, `@google-cloud/vision`) están en `package.json` pero las usa solo este módulo | Baja | Eliminar de `package.json` cuando se archive el legacy. Verificar antes con `grep` que ningún otro módulo las importa. |
| 6 | El frontend `Pdf2ImgPanel.svelte` y similares quizá esperan la tool legacy `menu.generate` con `filePath` | Media | Auditar consumers UI antes de eliminar el endpoint legacy. Si hay, decidir si se preservan en modo "esperando OCR futuro" o se eliminan también. |

---

## 7 · Lo que NO se incluye en v1

- **NO se construye un módulo OCR sustituto**. El input PDF/imagen
  queda fuera del scope. Si vuelve a hacer falta, será horizontal
  futuro con módulos JS dedicados.
- **NO se reescribe la lógica de transformación**. Se traduce
  declarativamente al blueprint preservando el shape de carta pizzepos
  actual.
- **NO se migra el agente `menu-structurer`** a `agente-blueprint`. Se
  archiva. Reabrir solo si dolor en runtime.
- **NO se cambia `target_page_id`**. El módulo sigue siendo el mismo
  nodo del grafo cajones, con misma identidad.
- **NO se toca el subsistema-carta más allá del propio módulo**. Si
  carta-manager o carta-scheduler necesitan ajustarse para consumir el
  nuevo blueprint, es trabajo aparte (coordinado, no fusionado).

---

## 8 · Camino propuesto para implementación

### Fase 0 — Auditoría rápida de consumers (30 min)

Antes de tocar nada:

1. `grep` exhaustivo de `menu.generate`, `menu.generation.`,
   `carta.generar.` en todo el repo (modules + frontend).
2. Listar quién publica y quién consume cada evento.
3. Listar quién llama la tool `menu.generate` (LLM, frontend, otros
   módulos).
4. Decidir compat-strategy para cada consumer roto si lo hay.

Output: cuadro de consumers en notas del PR.

### Fase 1 — Cerrar las 4 decisiones abiertas (15 min, sin código)

Cerrar decisiones 5.1-5.4 con el usuario.

### Fase 2 — Schema de carta pizzepos (1h, si decisión 5.2 = A o B)

Si A: extraer shape implícito del legacy → schema AJV en
`arquitectura/decisiones/_schemas/menu-generator/carta-pizzepos.schema.json`.
Si B: definir con consumers. Si C: skip.

### Fase 3 — Escribir el blueprint (2-3h)

`modules/pizzepos/menu-generator/menu-generator.blueprint.json` (o
path según decisión 5.1):
- Extiende blueprint padre `subsistema-recetario.modulo-base` (ya
  canónico para módulos blueprint del repo).
- Declara `target_page_id: "menu-generator"` (preserva).
- Declara `cajones_enabled: true` (consistente con otros blueprints).
- Operación `generar` con cajón completo: input (texto/JSON), pseudocódigo
  estructurado paso a paso, normalización, validación contra schema (si
  Fase 2 lo produjo), invocación a `carta-manager.crear.request` para
  persistir, response al caller.
- (Opcional) Operación `previsualizar` que valida sin persistir.

### Fase 4 — Bump `module.json` (15 min)

- Quitar `main: "index.js"`.
- Añadir `blueprint_driven: true`.
- Preservar `target_page_id`.
- Actualizar `version` a `8.0.0` (bump major, breaking del shape interno).
- Eliminar `dependencies: ["pdfjs", "sharp", "google-vision"]`.
- Bump `description` para reflejar el nuevo scope (texto/JSON, sin OCR).

### Fase 5 — Archivado del legacy (30 min)

- Mover `modules/pizzepos/menu-generator/index.js` →
  `modules/pizzepos/menu-generator/_legacy/index.js` (patrón POC2).
- Mover `context.json`, `prompt.json`, `schemas/*` si quedan
  desfasados.
- Confirmar agente `menu-structurer` ya archivado en
  `_archived/2026-05-24_menu-structurer-preservado/` (lo está, ver
  README del archivo).
- Eliminar JSON del agente de
  `modules/conversacion/ai-agent-framework/agents/menu-structurer.json`
  + system prompt.
- Eliminar dependencias `pdfjs-dist`, `sharp`, `@google-cloud/vision`
  del `package.json` si ningún otro módulo las usa (grep antes).

### Fase 6 — Actualizar contratos (30 min)

- `modulos-blueprint-driven.contract.json`: bump v1.2.0. Quitar la
  nota OCR sobre `menu-generator`. Moverlo de
  `verticales_operacionales_alto_volumen.modulos_pipeline_externo`
  hacia `candidatos_a_blueprint.subsistema_carta` (o categoría
  equivalente).
- `agents-config.contract.json`: actualizar count de agentes vivos
  (1 menos).

### Fase 7 — Tests (1-2h)

- Smoke test: el blueprint carga, el catálogo de cajones se construye,
  `cajon.abrir('generar')` devuelve el pseudocódigo.
- Audit runtime: ejecutar `menu-generator.generar` con un input real
  (texto pegado + JSON importado), verificar que la carta se persiste
  vía `carta-manager`.
- Verificar que `carta.generar.solicitada` (si decisión 5.4 = A o C)
  sigue arrancando el pipeline.

### Fase 8 — Cierre

- Actualizar `cajones-frentes-abiertos-retomar.md` si aplica.
- Regenerar baseline.
- Commit + push.
- (NO crear PR sin OK del usuario.)

**Total estimado: 4-6h en 1-2 sesiones.**

---

## 9 · Cómo arrancar la próxima sesión

Mensaje sugerido literal:

> *"Vamos a implementar la migración de `menu-generator` a blueprint
> puro. Lee
> `arquitectura/decisiones/propuestas/migracion-menu-generator-blueprint.md`
> entero. Sigue el guion en
> `_arranque-menu-generator-blueprint.md`."*

El guion del arranque hace que la próxima conversación:
1. Verifique que el legacy y el agente están donde se esperan.
2. Te haga las **4 preguntas abiertas** en orden (decisiones 5.1-5.4).
3. **Para y pide tu OK** antes de tocar código.
4. Solo entonces ejecuta Fases 0-8.

---

## 10 · Relación con otros contratos del sistema

| Contrato | Cómo se relaciona |
|---|---|
| `modulos-blueprint-driven.contract.json` v1.1.0 → v1.2.0 | Se bumpea para quitar la nota OCR sobre menu-generator y reclasificarlo como candidato. |
| `cajones-context-partitioning.contract.json` | El blueprint nuevo activa `cajones_enabled: true` automáticamente al heredar del padre canónico. |
| `llm-runtime-discipline.contract.json` | Las 10 reglas (no inventes datos, enfoque una operación, etc.) aplican al LLM ejecutando el blueprint. |
| `agente-blueprint.contract.json` | NO aplica en v1 (el módulo es blueprint puro, no agente). Aplicaría si en el futuro un sub-paso duele y se extrae. |
| `agents-config.contract.json` | Conteo de agentes vivos baja en 1 (menu-structurer archivado). |
| `agent-flow.contract.json` | NO aplica en v1 (sin agentes). |
| `tools.contract.json` v1.2 | El blueprint declara su tool `menu-generator.generar` siguiendo el shape canónico. |
| `events.contract.json` | Los 5 eventos canónicos del módulo legacy se preservan invariantes. |
| `errors.contract.json` | Los 4 errores conocidos (`INVALID_INPUT`, `RESOURCE_NOT_FOUND`, `UPSTREAM_INVALID_RESPONSE`, `UPSTREAM_TIMEOUT`) se preservan. |
| `principio-dolor-guia-diseno.md` | El principio rector del nuevo módulo (sección 3 de este doc) es aplicación directa. |

---

## 11 · Referencias rápidas

| Qué | Dónde | Por qué |
|---|---|---|
| Legacy del módulo | `modules/pizzepos/menu-generator/index.js` (373 LOC) | Fuente del pseudocódigo del blueprint |
| `module.json` actual | `modules/pizzepos/menu-generator/module.json` | Conserva `target_page_id`, eventos, tools |
| Agente archivado | `_archived/2026-05-24_menu-structurer-preservado/` | Recuperable según criterios de dolor |
| Blueprint padre canónico | `arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json` | El módulo nuevo lo extiende |
| Contrato que se bumpea | `arquitectura/decisiones/_contratos/modulos-blueprint-driven.contract.json` v1.1.0 | Fase 6 lo actualiza a v1.2.0 |
| Test de referencia | `tests/unit/pizzepos__menu-generator.test.js` (legacy POC2) | Se reescribe contra el blueprint nuevo |
| Frontend (consumer probable) | `frontend/src/lib/modules/menu-generate/GeneratePanel.svelte` | Auditar en Fase 0 |
| Principio dolor guía | `arquitectura/decisiones/propuestas/principio-dolor-guia-diseno.md` | Aplicación operativa del principio |

---

## 12 · Frase resumen para retomar

**`menu-generator` migra de JS legacy a blueprint puro absorbiendo
estructuración + transformación a carta pizzepos en una sola pasada
conversacional del LLM. La capa OCR (rota, no usada) se elimina entera,
lo cual cierra el bloqueo del contrato `modulos-blueprint-driven` v1.1.0
sin necesidad de extraer 3 módulos JS deterministas. El agente
`menu-structurer` se archiva (no se migra) en
`_archived/2026-05-24_menu-structurer-preservado/`. Principio rector
del módulo: LLM principal hace todo; agentes especialistas solo cuando
un proceso duele en runtime (latencia > 25s, malformación > 10%,
saturación de cajones, lock-in de provider, cardinalidad N). 4
decisiones abiertas que cerrar: path del blueprint, schema canónico de
carta pizzepos, persistencia del resultado, manejo del subscribe
`carta.generar.solicitada`. Plan en 8 fases, 4-6h totales en 1-2
sesiones.**
