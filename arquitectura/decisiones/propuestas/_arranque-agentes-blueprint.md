# Arranque migración agentes-blueprint — mensaje y preguntas listas para la próxima conversación

Este archivo NO es un contrato ni un plan — es **el guion literal** que tú
pegas al arrancar la próxima sesión para implementar la migración de los
30 agentes legacy al patrón `agente-blueprint`. Está diseñado para que la
otra conversación no improvise ni pierda contexto.

Doc maestro de referencia:
`arquitectura/decisiones/propuestas/migracion-agentes-blueprint.md`.
Contrato transversal autoritativo:
`arquitectura/decisiones/_contratos/agente-blueprint.contract.json` (v1.0.0).

---

## 1 · Mensaje literal para pegar al inicio de la nueva conversación

Cópialo tal cual:

> *"Lee `arquitectura/decisiones/propuestas/migracion-agentes-blueprint.md`
> entero. Es el plan completo. Luego lee
> `arquitectura/decisiones/_contratos/agente-blueprint.contract.json`
> (fuente de verdad del modelo) y
> `arquitectura/migracion/notas/agentes-roadmap.md` (plan de fases
> original).
>
> Arranca verificando el estado de **Fase 0** en disco:
> - `modules/_agentes-blueprint/agente-base.blueprint.json` — ¿existe?
> - `arquitectura/decisiones/_schemas/agente-blueprint/` — ¿existe?
> - `arquitectura/decisiones/_validators/agente-blueprint.validate.js` — ¿existe?
> - Sección `agente-blueprint` en `drift-baseline.json` — ¿existe?
>
> Reporta el estado en una tabla. Si Fase 0 está incompleta (lo más
> probable), NO la implementes todavía. Salta directo a Fase 1: cerrar
> conmigo las **9 decisiones abiertas** de la sección 4 del doc maestro.
> Hazme las preguntas en el orden del archivo
> `arquitectura/decisiones/propuestas/_arranque-agentes-blueprint.md` y
> guarda mis respuestas aquí mismo.
>
> Solo cuando las 9 estén cerradas, ejecuta Fase 0 entera (blueprint
> padre + schemas + validator + baseline) y para a pedirme OK antes de
> tocar el piloto `escandallo-analyzer` (Fase 2).
>
> NO empieces a migrar ningún agente hasta que Fase 0 esté en disco Y las
> 9 preguntas estén respondidas Y yo haya dado OK explícito."*

---

## 2 · Las 9 preguntas en orden (la otra conversación me las hace una a una)

Formato de cada pregunta: **enunciado · opciones · recomendación del doc
(punto de partida, pero el usuario decide)**.

### Pregunta 1 — Agentes trigger-based (sección 4.1 del doc maestro)

8 agentes del subsistema-recetario (escandallo-analyzer y similares)
declaran `event_listener` + `publish_on_success` + `publish_on_failure`.
Reaccionan a eventos del dominio en lugar de invocarse via
`agent.execute.request`. ¿Cómo encajan en el modelo blueprint?

- **A**: Mantener trigger-based como modo declarativo del blueprint
  (`reacciona_a_evento: '<x>'` + `publica_resultado_en: '<y>'`). Mínima
  fricción de migración. Soporta ambos modos.
- **B**: Eliminar el modo trigger durante la migración. El módulo que
  publica el evento del dominio invoca explícitamente al agente via
  `agent.execute.request`. Más limpio, más cambios cross-módulo.
- **C**: Híbrida — soportar ambos modos, default on-demand, trigger
  opcional.

Recomendación de partida en el doc: **A** (preserva shape actual, el
contrato evoluciona a v1.1 con campos opcionales para trigger).

Mi respuesta: ___

---

### Pregunta 2 — Granularidad de migración (sección 4.2 del doc maestro)

¿Migración por subsistema en sprints o agente-a-agente individual?

- **A — Subsistema entero por sprint**: 8 agentes recetario en un PR, 8
  carta-digital en otro, etc. Bueno para validar el modelo end-to-end por
  dominio.
- **B — Agente a agente individual**: cada agente es un PR. Más granular,
  más overhead, coherente con `module-rewrite`.
- **C — Olas pragmáticas**: piloto único primero (escandallo-analyzer),
  luego subsistema entero por sprint.

Recomendación de partida en el doc: **C** (piloto valida modelo, luego
subsistemas).

Mi respuesta: ___

---

### Pregunta 3 — Disabled agents (sección 4.3 del doc maestro)

¿Qué hacer con los 3 disabled (architect, image-processor, recipe-curator)
y la anomalía recipe-structurer?

- **A**: Eliminar todos los disabled durante la migración (carpeta
  archivada en `_archived/<fecha>_agentes-disabled/`).
- **B**: Migrarlos como disabled con `disabled_reason` documentado en el
  contrato propio. Quedan en repo "por si vuelven".
- **C**: Caso por caso (eliminar curator/structurer obsoletos, migrar
  architect/image-processor como disabled con razón).

Recomendación de partida en el doc: **C** (recipe-curator se elimina por
razón clara documentada; recipe-structurer se verifica; architect y
image-processor se migran como disabled con razón).

Mi respuesta: ___

---

### Pregunta 4 — recipe-analyzer / recipe-completer / recipe-structurer (sección 4.4)

¿Siguen siendo agentes o se absorben como operaciones del módulo `recetas`?

- **A**: Conservar como agentes (razonamiento separado del módulo).
- **B**: Absorber todos como operaciones del módulo `recetas`. Cero
  agentes recipe-* en el repo final.
- **C**: Mixto — absorber `recipe-analyzer` y `recipe-completer` (lógica
  básica que cabe en el blueprint del módulo) pero conservar
  `recipe-chef-advisor` y `recipe-researcher` como agentes (razonamiento
  complejo con personalidad propia).

Recomendación de partida en el doc: **C** (preserva agentes con identidad
clara, absorbe los que no la tienen).

Mi respuesta: ___

---

### Pregunta 5 — viabilidad-receta-analyzer (sección 4.5)

¿Se fusiona con el módulo `viabilidad` (ya blueprint) o se conserva como
agente?

- **A — Conservar como agente** (razonamiento de proyección sobre receta
  individual).
- **B — Fusionar con módulo viabilidad** como operación
  `viabilidad.analizar_receta`.

Recomendación de partida en el doc: depende de la decisión 4 — si
absorbemos los recipe-* básicos, **B** es coherente.

Mi respuesta: ___

---

### Pregunta 6 — device-ops (sección 4.6)

26 tools, viola umbral 20. ¿Dividir, migrar entero, o posponer?

- **A — Dividir durante migración**: 3-4 agentes nuevos
  (`device-registrar`, `esp32-flasher-operator`, `firmware-deployer`,
  posiblemente `device-monitor`). Más trabajo, más limpio.
- **B — Migrar entero**: 1 agente con 26 tools (drift warning asumido).
  División en horizontal futuro.
- **C — No migrar todavía**: caso especial, posponer hasta horizontal
  device propio.

Recomendación de partida en el doc: **C** (posponer). El subsistema
device tiene su propia complejidad y dividir 26 tools sin contexto del
dominio device es riesgo alto.

Mi respuesta: ___

---

### Pregunta 7 — intent-router (sección 4.7)

Puerta única del chat. Su migración reconfigura el flujo entero.

- **A — Último** (cuando los otros 29 estén migrados). Roadmap recomienda
  esto.
- **B — Primero** como piloto definitivo. Si funciona aquí, funciona en
  cualquier lado. Pero rompe el chat si falla.
- **C — Nunca**: vive como excepción del modelo, se mantiene en
  `ai-agent-framework`.

Recomendación de partida en el doc: **A** (último, después de 29
exitosos).

Mi respuesta: ___

---

### Pregunta 8 — Destino de `ai-agent-framework` post-migración (sección 4.8)

¿Qué hace el módulo cuando los 30 agentes sean blueprint independientes?

- **A — Eliminar completamente** (carpeta archivada). Dispatching pasa a
  ai-gateway.
- **B — Sobrevive aligerado** como dispatcher de `agent.execute.request` +
  tool `invoke_agent` (compat).
- **C — Fusionar con ai-gateway** (un solo módulo).

Recomendación de partida en el doc: **B** (transición segura), pero
decisión real al llegar a Fase 6 con datos en mano.

Mi respuesta: ___

---

### Pregunta 9 — Integración de `agentes-tools.json` (categorías read/write/destructive) con el modelo blueprint (sección 4.9)

Hoy es un archivo separado con regla global de tools.

- **A — Conservar como regla global** que el validator cruza con
  `eventos_que_invoca[]`.
- **B — Embeber categorías en el blueprint padre**
  `_agentes-blueprint/agente-base.blueprint.json`.
- **C — Mover al contrato `tools.contract.json`** (centralizar).

Recomendación de partida en el doc: **A** (mínima fricción, regla ya
vigente desde 2026-04-27).

Mi respuesta: ___

---

## 3 · Qué hace la otra conversación con mis 9 respuestas

1. Las guarda en este mismo archivo (sustituye los `___` por las
   respuestas + 1 línea de motivo si la hay).
2. Para y pide tu OK explícito antes de ejecutar Fase 0.
3. Si das OK, ejecuta **Fase 0 completa** (~7-9h):
   - Crea `modules/_agentes-blueprint/agente-base.blueprint.json`.
   - Crea schemas en `arquitectura/decisiones/_schemas/agente-blueprint/`.
   - Implementa `agente-blueprint.validate.js` con los 20 cross-checks.
   - Wirea a validate-all + npm + workflow.
   - Regenera baseline con sección `agente-blueprint`.
   - Commit:
     `feat(agente-blueprint): cierre Fase 0 — padre + schemas + validator + baseline`.
4. Para y pide tu OK antes de Fase 2 (piloto escandallo-analyzer).

---

## 4 · Recordatorios para la próxima conversación

- Idioma de los archivos: español (canónico del repo).
- Agentes-blueprint **NO siguen POC2** (son blueprint puro, sin JS).
- Sin emojis en código ni archivos salvo que el usuario los pida.
- Branch de trabajo: la que diga el system prompt de esa sesión, NUNCA
  pushear a otra sin permiso explícito.
- `validate:ci` tiene que pasar antes de cualquier merge/push.
- **NUNCA crear PR sin OK explícito del usuario.**
- Antes de tocar el archivo legacy de un agente: leer su system prompt
  curado en `prompts/<agente>.md` (o `prompts/<agente>-system.md`) — ese
  es el origen del `.md` curado del nuevo agente.

---

## 5 · Si algo se tuerce

Si la otra conversación intenta:
- Migrar un agente antes de cerrar Fase 0 → **párala**, vuelve a Fase 0.
- Saltarse las 9 preguntas y empezar a migrar → **vuelve a sección 2 de
  este archivo**.
- Cambiar el contrato `agente-blueprint.contract.json` "porque algo no
  encaja" → **rechaza**, captura el problema como decisión abierta y
  consúltalo con el usuario antes de bump versión del contrato.
- Tocar `intent-router` antes de que los otros 29 estén migrados (si la
  respuesta 7 fue A o C) → **rechaza**, se respeta el orden de fases.
- Eliminar `ai-agent-framework` antes de Fase 6 → **rechaza**, su destino
  se decide al final no al principio.
- Crear un PR sin tu OK explícito → **rechaza**, los commits van a la
  rama designada y esperan tu review.

Si dudas, frase canónica: *"Vuelve al doc maestro
`migracion-agentes-blueprint.md` antes de seguir."*

---

## 6 · Inventario rápido de los 30 agentes (cheatsheet)

| Subsistema | Agentes (estado) | Fase de migración |
|---|---|---|
| Recetario | escandallo-analyzer ✅ (piloto), viabilidad-receta-analyzer, recipe-{analyzer,chef-advisor,completer,curator ❌,researcher,structurer ❓} | 2 (piloto) + 3 (resto) |
| Carta digital + tarifas | cartadigital-{composer,ofertas,pwa-builder,reviewer}, tarifas-{creator,sync}, marketing-{brand-keeper,copywriter} | 4 |
| Menu generator | marketing-strategist, menu-{enricher,structurer,validator} | 4 |
| Carta scheduler | scheduler-{dispatcher,planner} | 4 |
| Facturas | invoice-{structurer,validator} (ambos tools:[]) | 4 |
| Impresion | impresion-{architect,builder} | 4 |
| Device/ESP32 | device-ops (26 tools — decisión 6) | 5 (caso especial) |
| Transversales | architect ❌, image-processor ❌, intent-router (decisión 7), marketing-onboarding | 5 (casos especiales) |

❌ = disabled. ❓ = anomalía (declarado disabled en inventario, enabled
en JSON).
