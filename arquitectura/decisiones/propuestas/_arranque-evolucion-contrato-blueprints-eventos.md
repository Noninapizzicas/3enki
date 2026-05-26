# Arranque evolución contrato blueprints — eventos conscientes

Este archivo NO es un contrato ni un plan — es **el guion literal** que tú
pegas al arrancar la próxima sesión para implementar la evolución del
contrato de blueprints (eventos como decisión consciente del diseño).
Está diseñado para que la otra conversación no improvise ni pierda
contexto.

Doc maestro de referencia:
`arquitectura/decisiones/propuestas/evolucion-contrato-blueprints-eventos-conscientes.md`.

---

## 1 · Mensaje literal para pegar al inicio de la nueva conversación

Cópialo tal cual:

> *"Vamos a implementar la evolución del contrato de blueprints —
> eventos conscientes en el diseño. Lee
> `arquitectura/decisiones/propuestas/evolucion-contrato-blueprints-eventos-conscientes.md`
> entero.
>
> Verifica antes de tocar nada:
> - `arquitectura/decisiones/_contratos/modulos-blueprint-driven.contract.json`
>   está en v1.2.0.
> - `arquitectura/decisiones/_contratos/events.contract.json` está en
>   v1.2.0.
> - `arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json`
>   está en v0.5.0.
> - `arquitectura/decisiones/_validators/events.validate.js` existe.
> - PR #208 (CAS) mergeado en main.
>
> Reporta estado en una tabla. Si algo no está como se espera, párate y
> pregunta.
>
> Luego salta a **Fase 0**: cerrar conmigo las **4 decisiones abiertas**
> de la sección 5 del doc maestro. Hazme las preguntas en el orden de
> este archivo y guarda mis respuestas aquí mismo.
>
> Solo cuando las 4 estén cerradas, para a pedirme OK antes de Fase 1
> (extender events.validate.js para producir el catálogo).
>
> NO toques código hasta que las 4 estén respondidas Y yo haya dado OK
> explícito. NO crees PR sin OK explícito mío."*

---

## 2 · Las 4 preguntas en orden (la otra conversación me las hace una a una)

Formato: **enunciado · opciones · recomendación del doc**.

### Pregunta 1 — Auto-generar `events.json` (sección 5.1 del doc maestro)

¿Implementamos el catálogo curado de eventos `_outputs/events.json` ahora?

- **A**: Sí. Extender `events.validate.js` para producir
  `{event_name: {publishers, subscribers}}` indexado por evento.
- **B**: Posponer. Mantener catálogo en cabezas + grep por ahora.

Recomendación de partida en el doc: **A**. Sin catálogo curado el
diseñador no tiene de dónde elegir eventos. Esfuerzo ~1h.

Mi respuesta: ___

---

### Pregunta 2 — Migración de los 11 blueprints existentes (sección 5.2)

¿Cómo migramos los blueprints actuales al campo nuevo
`eventos_publicados_que_requieren_consumer[]`?

- **A**: Migración masiva en un solo PR (~1-2h, mecánica).
- **B**: Migración perezosa por blueprint en commits separados a medida
  que se tocan.
- **C**: Migración masiva opt-in v1 — el validator solo detecta drift
  donde se ha declarado el campo. Los blueprints sin el campo no se
  quejan.

Recomendación de partida en el doc: **C**. Permite mergear el contrato
+ validator + padre sin obligar a tocar los 11 blueprints. Cada uno se
migra cuando se revise.

Mi respuesta: ___

---

### Pregunta 3 — Severidad del cross-check `evento_publicado_sin_declarar_requirement` (sección 5.3)

¿Qué severidad para "el blueprint publica un evento en pseudocódigo
pero NO lo declara como `requires_consumer` ni está obviamente clasificado"?

- **A — info**: no bloquea, solo recordatorio para el diseñador.
- **B — warning**: visible en cada `validate:ci`, presiona migración.
- **C — error**: bloquea hasta que se clasifique.

Recomendación de partida en el doc: **A**. Cerrar como info evita ruido.
Si tras 2-4 semanas no se observa adopción real, evolucionar a warning.

Mi respuesta: ___

---

### Pregunta 4 — Aplicabilidad a módulos JS POC2 (sección 5.4)

¿El patrón aplica solo a blueprints o también a módulos JS POC2?

- **A**: Solo blueprints (los 11 actuales + futuros).
- **B**: También módulos JS POC2 — `module.json.events.publishes[]`
  añade campo `requires_consumer: true`.
- **C**: Empezar por blueprints. Extender a módulos JS POC2 si el patrón
  funciona.

Recomendación de partida en el doc: **C**. El dolor observado fue en
blueprints; sin evidencia de bug similar en JS POC2, validar el patrón
allí primero.

Mi respuesta: ___

---

## 3 · Qué hace la otra conversación con mis 4 respuestas

1. Las guarda en este mismo archivo (sustituye los `___` por las
   respuestas + 1 línea de motivo si la hay).
2. Para y pide tu OK explícito antes de ejecutar Fase 1.
3. Si das OK, ejecuta **Fase 1** (~1h, solo si decisión 1 = A):
   - Extiende `events.validate.js` para producir `_outputs/events.json`.
4. Si Fase 1 limpia, para a pedirte OK para Fase 2.
5. Itera Fases 2-7 según el doc maestro, pidiendo OK entre cada una.
6. **NUNCA crear PR ni mergear sin OK explícito mío.**

---

## 4 · Recordatorios para la próxima conversación

- Idioma de los archivos: español (canónico del repo).
- Sin emojis en código ni archivos salvo que el usuario los pida.
- Branch de trabajo: la que diga el system prompt de esa sesión, NUNCA
  pushear a otra sin permiso explícito.
- `validate:ci` tiene que pasar antes de cualquier merge/push.
- **NUNCA crear PR sin OK explícito del usuario.**
- **NUNCA mergear PR sin OK explícito del usuario.**
- Cualquier cambio al contrato `modulos-blueprint-driven.contract.json`
  bumpea version (cambio breaking si tipo principios cambia, cambio
  menor si añade secciones opcionales).
- Cualquier cambio al blueprint padre bumpea version.
- Si la decisión 2 = C (opt-in), el validator IGNORA blueprints sin el
  campo declarado. NO se queja por ausencia.

---

## 5 · Si algo se tuerce

Si la otra conversación intenta:

- Tocar código antes de Fase 0 y antes de las 4 preguntas → **rechaza**,
  vuelve a sección 2.
- Migrar los 11 blueprints existentes en el mismo PR si decisión 2 = C
  → **rechaza**, opt-in es opt-in.
- Bumpear `events.contract.json` (no se toca en este horizonte) →
  **rechaza**, solo se extiende su validator.
- Marcar cross-checks como `error` cuando decisión 3 = A → **rechaza**.
- Aplicar a módulos JS POC2 cuando decisión 4 = C → **rechaza**.
- Crear PR sin tu OK → **rechaza**.
- Mergear sin tu OK → **rechaza**.

Si dudas, frase canónica: *"Vuelve al doc maestro
`evolucion-contrato-blueprints-eventos-conscientes.md` antes de seguir."*

---

## 6 · Cheatsheet del estado pre-implementación

### Decisiones YA cerradas en sesión (5)

| # | Decisión |
|---|---|
| 1 | Origen: insight tras Críticas 1 y 2 del audit cross-blueprint |
| 2 | Naming del campo nuevo: `eventos_publicados_que_requieren_consumer[]` |
| 3 | Severidad del cross-check publishing-side huérfano: **error** (bloquea CI) |
| 4 | Eventos fire-and-forget de observabilidad: NO se declaran, quedan fuera |
| 5 | Helper en el padre como **checklist** (no como tool), separado de `helpers_built_in_para_el_pseudocodigo` |

### Decisiones abiertas (4)

1. Auto-generar `events.json` ahora (A) o después (B).
2. Migración de los 11 blueprints: masiva (A), perezosa (B), o opt-in (C).
3. Severidad del cross-check "publica sin declarar": info (A), warning (B), error (C).
4. Aplicabilidad a JS POC2: solo blueprints (A), también JS (B), o después (C).

### Artefactos a crear/tocar

| Artefacto | Acción |
|---|---|
| `events.validate.js` | Extender para producir `_outputs/events.json` (si decisión 1 = A) |
| Schema del blueprint hijo (si existe) | Añadir campo `eventos_publicados_que_requieren_consumer[]` |
| `subsistema-recetario.modulo-base.blueprint.json` | Bump v0.5.0 → v0.6.0 + sección `checklist_eventos_al_disenar_blueprint` |
| `modulos-blueprint-driven.contract.json` | Bump v1.2.0 → v1.3.0 + sección `proceso_de_diseno_de_blueprint` |
| `blueprint-eventos-conscientes.validate.js` (NUEVO) | 3 cross-checks (1 error publishing-side, 1 warning subscribing-side, 1 info missing-declaration) |
| `blueprint-eventos-conscientes.contract.json` (NUEVO) | Contrato transversal del patrón |
| `drift-baseline.json` | Sección nueva para el validator |
| `package.json` + `.github/workflows/validate.yml` | Wireado del validator nuevo |

### Las 7 fases del camino

1. Cerrar 4 decisiones (30 min).
2. Auto-gen events.json (1h, si A).
3. Schema + sección en padre (30 min).
4. Actualizar contrato paradigma (30 min).
5. Implementar validator nuevo (1-2h).
6. Doc canónico del patrón (30 min).
7. Audit retrospectivo de los 11 blueprints (1h).

**Total v1: 4-6h en 1-2 sesiones.**

---

## 7 · Visión de futuro (no en v1)

Cuando el patrón valide en runtime real (1-2 semanas tras mergear):

- Migración masiva de los 11 blueprints actuales si decisión 2 = C.
- Extensión a módulos JS POC2 si decisión 4 = C → B.
- Endurecer severidad del cross-check "publica sin declarar" si
  decisión 3 = A → B.
- Auto-generación de diagrama gráfico del grafo publish/subscribe.
- Versionado semántico de eventos (`carta.creada.v1` vs `.v2`).
