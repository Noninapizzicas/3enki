# Arranque cajones — mensaje y preguntas listas para la próxima conversación

> **✅ Documento cerrado (2026-05-24).** Las 8 preguntas se cerraron en la
> sesión del 2026-05-23/24 con las recomendaciones por defecto del propio
> documento (el usuario respondió literalmente *"todas como recomienda"*).
> Las decisiones están canonizadas en
> `arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json`
> v1.0.0 (commit `2af69f0`) como `decisiones_arquitectonicas`. El motor
> + tests + piloto + Fase 6 + Fase 5 bis están implementados y mergeados a
> main. Frentes abiertos posteriores inventariados en
> `cajones-frentes-abiertos-retomar.md` (commit `cfe4880`).
>
> Este archivo se conserva como **registro literal** del guion de arranque
> tal como se escribió en `e00f004`, ahora con las respuestas rellenas.
>
> Nota operativa: el archivo desapareció del disco en algún merge entre
> `e00f004` (creación) y el checkout que arrancó la sesión de
> implementación. La sesión lo redescubrió, recuperó el contenido del blob
> y lo restauró en disco con las respuestas reales.

---

Este archivo NO es un contrato ni un plan — es **el guion literal** que tú
pegas al arrancar la próxima sesión para implementar los cajones. Está
diseñado para que la otra conversación no improvise ni pierda contexto.

Doc maestro de referencia:
`arquitectura/decisiones/propuestas/cajones-context-partitioning.md`.

---

## 1 · Mensaje literal para pegar al inicio de la nueva conversación

Cópialo tal cual (ajusta entre corchetes si llevas semanas viviendo el
sistema):

> *"Lee `arquitectura/decisiones/propuestas/cajones-context-partitioning.md`
> entero. Es el plan completo. Arranca por la Fase 0 (verificar que
> `tools.contract v1.2` con auto-wire de `module.json.tools[]` a
> `toolsRegistry` + `uiHandler` está en main — debería estarlo desde el
> merge de la sesión review-tools-architecture). Si está, salta a Fase 1:
> cerrar conmigo las **8 decisiones abiertas** de la sección 6 del doc (5
> originales + 3 nuevas en 6.4 bis/ter/quater) antes de tocar código.
> Hazme las preguntas en el orden del archivo
> `arquitectura/decisiones/propuestas/_arranque-cajones.md` y guarda mis
> respuestas. Solo cuando las 8 estén cerradas, pasa a Fase 2 (escribir el
> contrato). NO escribas código hasta que el contrato esté validado."*

Si llevas N semanas en uso real, antepón:

> *"He vivido [N] semanas con `tools.contract v1.2` en producción. Los
> dolores observados que motivan implementar los cajones ahora son:
> [los listas tú en 2-3 viñetas]."*

---

## 2 · Las 8 preguntas en orden (la otra conversación me las hace una a una)

Formato de cada pregunta: **enunciado · opciones · recomendación del doc
(punto de partida, pero el usuario decide)**.

### Pregunta 1 — Persistencia del cajón entre turnos (sección 6.1)

¿Cómo se gestiona la vida útil de un cajón abierto?

- **A**: cerrado automáticamente al siguiente turno (simple, predecible).
- **B**: persistente hasta que el LLM lo cierre explícitamente.
- **C**: híbrida — cerrado por defecto + el LLM puede pedir "mantén abierto
  N turnos" en la tool call.

Recomendación de partida en el doc: **A**. Si el LLM se queja de reabrir,
evolucionar a C.

Mi respuesta: **A** — cierre automático al siguiente turno. Más simple y
predecible, conserva el espíritu de la metáfora ("cierra el cajón y sigue").
Si emerge demanda de reapertura recurrente en runtime, evolucionar a C.

---

### Pregunta 2 — Aplicabilidad (sección 6.2)

¿Los cajones aplican solo a blueprints, o también a otros lugares?

- **Solo blueprints** (los 10 módulos blueprint-driven).
- **+ chat principal** (el LLM general también ve cajones por dominio).
- **+ agentes especialistas** (cada agente con cajones temáticos).
- **+ memorias** (memory-rag, memory-conversation-summary).

Recomendación de partida en el doc: **solo blueprints** en v1, donde se
observó el dolor. Extender después si funciona.

Mi respuesta: **Solo blueprints** en v1. El dolor (sobrecarga del system
prompt) se observó allí; extender sin evidencia es premature optimization.
Memorias y agentes — más adelante o nunca.

---

### Pregunta 3 — Quién abre el cajón (sección 6.3)

¿La decisión de qué cajón abrir vive en el LLM o en un orquestador?

- **LLM autónomo**: el LLM razona y llama `cajon.abrir`. +1 turno de
  latencia, máximo matching semántico, mínima complejidad.
- **Orquestador externo** (chat-io o ai-gateway): clasifica intención y
  precarga el cajón antes del LLM. Menos latencia, más riesgo de error.

Recomendación de partida en el doc: **LLM autónomo**.

Mi respuesta: **LLM autónomo**. Coherente con la metáfora y trivial de
implementar (vía tool call `cajon.abrir`). +1 turno de latencia es marginal
frente a los 5-25s que ya consume cada blueprint.

---

### Pregunta 4 — Profundidad / niveles (sección 6.4)

¿Los cajones tienen niveles (cajones rápidos visibles + armarios profundos
ocultos), o son todos planos en el catálogo?

- **Plano**: todos los cajones visibles en el system prompt.
- **Con niveles**: rápidos visibles + armarios solo accesibles si el LLM
  los pide explícitamente.

Recomendación de partida en el doc: **plano**. Introducir niveles solo si
el catálogo crece a más de ~30 cajones.

Mi respuesta: **Plano**. Sin niveles en v1. El blueprint mayor (carta-manager)
tiene 13 cajones — muy lejos del umbral subjetivo de 30. Si crece, reabrir
la decisión.

---

### Pregunta 5 — Almacenamiento físico (sección 6.5)

¿Dónde vive el contenido del cajón?

- **Inline en el blueprint hijo** (lo que ya hay; ai-gateway extrae en
  memoria al arrancar). Cero archivos nuevos.
- **Archivos separados por operación** (`modules/<mod>/cajones/<op>.json`).
  Hot-reload fácil, muchos archivos.
- **Híbrido**: blueprint sigue como archivo único pero ai-gateway cachea
  cajones en un Map al arrancar.

Recomendación de partida en el doc: **inline**. Partir a archivos solo si
el blueprint se vuelve inmanejable.

Mi respuesta: **Inline en el blueprint hijo**. Los blueprints actuales NO
se tocan; ai-gateway extrae los cajones en memoria al arrancar
(`_extractCajones` + `cajonesCatalog` Map). Cero archivos nuevos.

---

### Pregunta 6 — Detector de foco (sección 6.4 bis, nueva en 2026-05-22)

¿Quién decide que la conversación ha cambiado de dominio y la página tiene
que moverse?

- **A — LLM autónomo**: el LLM invoca `chat.cambiar_foco`.
- **B — Router intermedio**: módulo clasificador antes del LLM principal.
- **C — Manual por click**: solo cambia foco si el usuario clica un
  destino en la barra lateral.
- **D — Híbrida A+C**: el LLM propone, el usuario confirma.

Recomendación de partida en el doc: **A** en piloto. Si la tasa de
cambios equivocados supera ~10%, evolucionar a D.

Mi respuesta: **A — LLM autónomo**. Coherente con la decisión de la
pregunta 3. Validado en runtime real (2026-05-24, audit multi-page): 3
cambios de foco semánticamente correctos, 0% equivocados. La opción D
queda como evolución condicional si emerge tasa de error.

---

### Pregunta 7 — Ayudas de UI residual al cambio de foco (sección 6.4 ter, nueva)

Cuando el LLM cambia la página automáticamente, ¿cómo se entera el usuario?

- **Nada** (silencioso).
- **Banner en el chat**: el LLM antepone "*(moviéndote a viabilidad
  porque...)*".
- **Toast / notificación efímera** en frontend.
- **Breadcrumb persistente** encima del chat.
- **Confirmación previa** (parte de la opción D de la pregunta 6).

Recomendación de partida en el doc: **banner en el chat** (mínimo viable).
Si confunde, añadir breadcrumb.

Mi respuesta: **Banner en el chat**. Coste cero, máxima transparencia.
Implementado vía `notifyInfo(motivo)` en el listener de `chat.foco.cambiado`
del store del frontend. Si confunde, añadir breadcrumb persistente.

---

### Pregunta 8 — Archivadores / cajones anidados (sección 6.4 quater, nueva)

¿Los cajones pueden tener archivadores dentro (ej. `recetas.crear` →
"Pizzas" / "Postres")?

- **A — Jerarquía estricta** declarada en el blueprint.
- **B — Tags / labels** en cada cajón, búsqueda por intersección.
- **C — Plano** (sin agrupamiento dentro del cajón).

Recomendación de partida en el doc: **C** (plano) en v1. Evolucionar a B
si duele.

Mi respuesta: **C — plano** (sin archivadores). El LLM razona el
agrupamiento mental cuando hace falta. Si emerge dolor concreto con
catálogos planos > umbral, reabrir la decisión.

---

## 3 · Qué hace la otra conversación con mis 8 respuestas

1. Las guarda en este mismo archivo (sustituye los `___` por las
   respuestas + 1 línea de motivo si la hay).
2. Pasa a **Fase 2** del doc maestro: escribir
   `arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json`
   con esas decisiones cerradas como `decisiones_arquitectonicas`.
3. Hace `git commit` con mensaje
   `feat(cajones): contrato + decisiones cerradas`.
4. **Para aquí y pide tu OK** antes de seguir con Fase 3 (código).

---

## 4 · Recordatorios para la próxima conversación

- Idioma de los archivos: español (canónico del repo).
- Patrón POC2 obligatorio para cualquier módulo nuevo (BaseModule + 5
  helpers + tests por capas).
- Sin emojis en código ni archivos salvo que el usuario los pida.
- Branch de trabajo: la que diga el system prompt de esa sesión, NUNCA
  pushear a otra sin permiso explícito.
- `validate:ci` tiene que pasar antes de cualquier merge/push.
- Antes de proponer botones, paneles o componentes nuevos: leer
  `frontend/src/lib/modules/panels.ts` y `WorkBar.svelte` para usar el
  patrón existente, no inventar uno nuevo.

---

## 5 · Si algo se tuerce

Si la otra conversación intenta:
- Saltarse las 8 preguntas y pasar directo al código → **pídele que vuelva
  a la sección 2 de este archivo**.
- Cambiar la metáfora (cajones por otra cosa) → **rechaza, la metáfora
  está canonizada en el doc maestro**.
- Añadir "botones por cajón" en la UI → **rechaza, es un fallo de dictado
  documentado en sección 5.5.5 del doc maestro**.
- Implementar embeddings / similarity search en v1 → **rechaza, está en
  la lista NO de la sección 8 del doc maestro**.

Si dudas, frase canónica: *"Vuelve al doc maestro
`cajones-context-partitioning.md` antes de seguir."*
