# Arranque tienda — estado canónico y vistas operativas — guion para la próxima sesión

Este archivo NO es un contrato ni un plan — es **el guion literal** que tú
pegas al arrancar la próxima sesión para implementar el objeto canónico
`storage/tienda/estado.json` y sus cuatro vistas (operador, dev nuevo, LLM,
comerciante). Está diseñado para que la otra conversación no improvise ni
pierda contexto.

Doc maestro de referencia:
`arquitectura/decisiones/propuestas/tienda-estado-canonico-y-vistas.md`.

> **Origen 2026-05-30.** Skill `ana` activada porque el horizonte es
> abierto. La cocina cerró 7 decisiones y dejó 4 abiertas explícitas.
> Patrón canónico del repo: propuesta + arranque, ambos vivos hasta que
> el horizonte se complete.

---

## 1 · Mensaje literal para pegar al inicio de la nueva conversación

Cópialo tal cual:

> *"Vamos a implementar el objeto canónico `storage/tienda/estado.json` y
> sus cuatro vistas. Caso piloto: vapers. Lee
> `arquitectura/decisiones/propuestas/tienda-estado-canonico-y-vistas.md`
> entero (~10 min).
>
> Verifica antes de tocar nada:
> - `arquitectura/decisiones/_contratos/subsistema-tienda.contract.json` v1.0.0 existe.
> - `blueprints/project-types/tienda.json` existe y escribe a `storage/tienda/bundle/`.
> - `modules/_subsistema-tienda/subsistema-tienda.modulo-base.blueprint.json` v0.1.0 existe.
> - `deployment/caddy/Caddyfile.vps` tiene bloque `handle_path /shop/*`.
> - `modules/project-manager/index.js` tiene `_initializeFromBlueprint` con symlinks/verify_after/slug.
> - `tests/runtime-cases/subsistema-tienda-pwa-servida.js` existe (test del v1.0.0).
> - NO existe `storage/tienda/estado.json` en ningún proyecto todavía.
> - NO existe `modules/tienda-estado/` todavía.
> - NO existe `frontend/src/lib/modules/tienda/TiendaDashboard.svelte` todavía.
>
> Reporta el estado en una tabla.
>
> Luego salta a **Fase 0**: cerrar conmigo las **4 decisiones abiertas**
> de la sección 7 del doc maestro. Hazme las preguntas en el orden de
> este archivo y guarda mis respuestas aquí mismo.
>
> Solo cuando las 4 estén cerradas, para a pedirme OK antes de Fase 1
> (schema + validator).
>
> NO toques código hasta que las 4 estén respondidas Y yo haya dado OK
> explícito. NO crees PR sin OK explícito mío. NO mergees nada sin OK
> explícito mío."*

---

## 2 · Las 4 preguntas en orden (la otra conversación me las hace una a una)

Formato: **enunciado · opciones · recomendación del doc**.

### Pregunta 1 — Centralizado vs descentralizado (sección 7.1)

¿Quién mantiene `storage/tienda/estado.json` al día?

- **A**: Módulo nuevo `tienda-estado` (JS POC2) escucha eventos del subsistema (`tienda.bundle.actualizada`, `oferta.creada`, `pedido.entrado`, etc.) y aplica patches centralizados al estado.json vía `fs.edit`. Único módulo que conoce el shape.
- **B**: Cada módulo del subsistema aplica `fs.edit` directo sobre el estado.json + publish `tienda.estado.actualizado`. Simple pero N módulos conocen el shape.

Recomendación del doc maestro: **sin recomendación cerrada** — depende de cuántos módulos hijos tocan estado. Si son 2-3, B es más simple; si son 6+, A reduce drift.

Mi respuesta: **___**

---

### Pregunta 2 — Cuándo se inyecta el estado al LLM (sección 7.2)

- **A**: Siempre que `page_id` esté en lista del subsistema-tienda (ai-gateway añade el estado.json como contexto adicional automáticamente).
- **B**: Solo cuando el blueprint hijo del módulo activo declara explícitamente `requires_tienda_estado: true` en su `module.json`. Opt-in por blueprint.
- **C**: Bajo demanda — el LLM lo pide como tool (`tienda.estado.leer`). Cero contexto inyectado por defecto.

Recomendación del doc maestro: **sin recomendación cerrada** — A es lo más simple pero gasta tokens en turnos que no lo usan; B requiere más diseño; C es más cuidadoso pero exige al LLM saber pedirlo.

Mi respuesta: **___**

---

### Pregunta 3 — Granularidad del shape (sección 7.3)

¿Campos derivados (`pedidos_hoy`, `productos_total`, `ofertas_activas[]`) se actualizan en tiempo real con cada evento o se computan al leer?

- **A**: Tiempo real. Cada evento del subsistema dispara patch al estado.json. Lectura instantánea, escritura cara.
- **B**: Computados al leer. El estado.json solo guarda lo que NO se puede recalcular (URL pública, último deploy, branding). Los contadores se calculan en cada `fs.read` haciendo queries a SQLite. Lectura cara, escritura barata.
- **C**: Híbrido. Lo barato de mantener (URL, deploy) en tiempo real. Lo derivado (`pedidos_hoy`) computado al leer.

Recomendación del doc maestro: **sin recomendación cerrada** — depende de cuántos lectores haya y con qué frecuencia. Para 1 lector ocasional (operador) B es más barato; para dashboard del comerciante en vivo, A o C.

Mi respuesta: **___**

---

### Pregunta 4 — Multi-tenant cf-worker en estado.json (sección 7.4)

Si un proyecto usa el modelo legacy (PWA en Netlify + chat en cf-worker), `bundle.fuente: "cf-worker"`. ¿Qué shape tiene `bundle.*` en ese caso?

- **A**: Mantener shape único para todos los casos. Campos `worker_url`, `worker_kv_namespace` se añaden como opcionales y quedan vacíos cuando no aplica.
- **B**: `bundle` es un `oneOf` por fuente (vps-local, netlify, cf-worker, github-pages). Cada fuente tiene su sub-shape. Más estricto pero más complejo.
- **C**: Diferir la decisión hasta que entre el primer proyecto que use modelo legacy + estado.json. v1 solo soporta `vps-local`.

Recomendación del doc maestro: **C** (sin emergencia real). Diferir.

Mi respuesta: **___**

---

## 3 · Qué hace la otra conversación con mis 4 respuestas

1. Las guarda en este archivo (sustituye los `___` por las respuestas + 1 línea de motivo si la hay).
2. Para y pide OK explícito antes de Fase 1 (schema + validator).
3. Ejecuta Fases 1-8 según el doc maestro, parando a pedir OK entre cada una:
   - Fase 1: schema + validator (1-2h).
   - Fase 2: bootstrap del estado.json en `tienda.json` feature (2-3h).
   - Fase 3: helper canónico para actualizar (centralizado o descentralizado según Q1) (2-3h).
   - Fase 4: vista del LLM via ai-gateway (según Q2) (1-2h).
   - Fase 5: `TiendaDashboard.svelte` del comerciante (3-4h).
   - Fase 6: entrada CLAUDE.md / docs (30 min).
   - Fase 7: migración manual del estado.json del proyecto vapers (30 min).
   - Fase 8: extender test runtime end-to-end (1h).
4. **NUNCA crear PR ni mergear sin OK explícito.**

---

## 3.bis · Estado de avance

Sesión aún no arrancada. Se rellena al iniciarse.

| Fase | Estado |
|---|---|
| Fase 0 — decisiones abiertas | pendiente (4 preguntas arriba) |
| Fase 1 — schema + validator | bloqueada en Fase 0 |
| Fase 2 — bootstrap estado.json en tienda.json | bloqueada |
| Fase 3 — helper canónico | bloqueada |
| Fase 4 — vista LLM | bloqueada |
| Fase 5 — TiendaDashboard.svelte | bloqueada |
| Fase 6 — docs entry point | bloqueada |
| Fase 7 — migración vapers | bloqueada |
| Fase 8 — test runtime e2e | bloqueada |

---

## 4 · Recordatorios para la próxima conversación

- Idioma de los archivos: español (canónico del repo).
- El módulo nuevo (si Q1=A) sigue POC2: BaseModule + 5 helpers + tests por capa.
- `tienda.estado.actualizado` declara `eventos_publicados_que_requieren_consumer[]`
  si emite con expectativa de consumer (contrato `blueprint-eventos-conscientes` v1.0.0).
- El schema del estado.json usa AJV strict 2020-12 pero con
  `additionalProperties: true` — esbozo, NO closed.
- Cualquier escritura del estado.json va por `fs.edit` o `fs.write` del bus,
  nunca acceso directo. CAS si hay risk de concurrencia (`safeUpdate` del
  padre del subsistema-recetario, mismo patrón).
- Sin emojis en código ni archivos.
- Branch de trabajo: la que diga el system prompt de esa sesión.
- **NUNCA crear PR sin OK explícito.**
- **NUNCA mergear PR sin OK explícito + CI verde.**
- **NUNCA precompilar enums** de `bundle.fuente` o `canales_pedido` —
  son abiertos por diseño.

---

## 5 · Si algo se tuerce

Si la otra conversación intenta:

- Cerrar `bundle.fuente` como enum estricto → **rechaza**, decisión cocinada en sección 3.2 del maestro (esbozo, no closed).
- Mover el estado.json a un sitio compartido global (`/opt/enki/data/tienda-estado.json`) → **rechaza**, sección 3.1 cerró: por proyecto, en `base_path/storage/tienda/`.
- Tirar `cf-worker` o `static-template.js` → **rechaza**, decisión 4 cerrada (conviven).
- Refactorizar `comandero-cliente-builder` para que sea del subsistema-tienda → **rechaza**, decisión 5 cerrada (NO es del subsistema, namespace propio).
- Inyectar estado.json al LLM en TODOS los turnos sin filtrar `page_id` → **rechaza** sin la respuesta a Q2.
- Mantener contadores en tiempo real sin haber respondido Q3 → **rechaza**.
- Crear schema del cf-worker en estado.json antes de tener un proyecto real que lo necesite → **rechaza**, recomendación Q4=C (diferir).
- Reescribir el `tienda.json` feature → **rechaza**, está vivo en v1.0.0.
- Crear PR sin tu OK explícito → **rechaza**.
- Mergear sin tu OK explícito → **rechaza**.

Si dudas, frase canónica: *"Vuelve al doc maestro
`tienda-estado-canonico-y-vistas.md` antes de seguir."*

---

## 6 · Cheatsheet del estado pre-implementación

### Decisiones YA cerradas (7)

| # | Decisión | Cierre |
|---|---|---|
| 1 | Path canónico del bundle | `storage/tienda/bundle/` (vivo desde v1.0.0 2026-05-29) |
| 2 | URL pública | `/shop/<slug>` (renombrado desde `/tienda/<slug>`) |
| 3 | Servidor del bundle local | Caddy del VPS via `handle_path /shop/*` |
| 4 | cf-worker + Netlify export | Conviven con el sistema nuevo, NO se tira nada |
| 5 | comandero-cliente-builder | NO es del subsistema-tienda |
| 6 | Estado canónico | `storage/tienda/estado.json` (nuevo) |
| 7 | Pieza unificadora para 4 perfiles | El propio estado.json |

### Decisiones abiertas (4) → se cierran en Fase 0

1. **Centralizado vs descentralizado** del mantenimiento del estado.json (Q1).
2. **Cuándo inyectar estado al LLM** (Q2).
3. **Granularidad del shape** — campos derivados en tiempo real vs computados (Q3).
4. **Multi-tenant cf-worker** en estado.json (Q4, recomendación: diferir).

### Módulos nuevos a crear

| Módulo | Cuándo | Tipo | Esfuerzo |
|---|---|---|---|
| `tienda-estado` (si Q1=A) | Fase 3 | JS POC2 | 2-3h |

### Módulos a tocar (sin reescribir)

| Módulo | Cambio |
|---|---|
| `subsistema-tienda.contract.json` | Bump v1.0.0 → v1.1.0 con sección `objeto_estado_canonico` |
| `subsistema-tienda.modulo-base.blueprint.json` | Añadir referencia a estado.json como entry point |
| `tienda.json` feature | Añadir `initialFiles["storage/tienda/estado.json"]` |
| `subsistema-tienda.validate.js` | Nuevo cross-check `drift_estado_json_no_canonico` |
| `ai-gateway` o `prompt-builder` | Inyectar estado.json según Q2 |
| `tests/runtime-cases/subsistema-tienda-pwa-servida.js` | Extender con pasos del estado.json |

### Archivos nuevos a crear

- `arquitectura/decisiones/_schemas/subsistema-tienda/estado.schema.json`
- `frontend/src/lib/modules/tienda/TiendaDashboard.svelte`
- `modules/tienda-estado/` (si Q1=A)

### Las 8 fases del camino

| # | Nombre | Esfuerzo |
|---|---|---|
| 0 | Documentación y bump contrato | 1-2h |
| 1 | Schema + validator | 1-2h |
| 2 | Bootstrap estado.json en feature | 2-3h |
| 3 | Helper canónico (centralizado vs descentralizado según Q1) | 2-3h |
| 4 | Vista del LLM via ai-gateway (según Q2) | 1-2h |
| 5 | TiendaDashboard.svelte del comerciante | 3-4h |
| 6 | Documentación entry point | 30 min |
| 7 | Migración manual del estado.json de vapers | 30 min |
| 8 | Test runtime end-to-end | 1h |

**Total v1: 12-19h en 2-3 sesiones.**

---

## 7 · Patrón vivo a respetar

- **Propuesta + arranque siempre en pareja** — patrón establecido por
  `vertical-tienda-pwa-sin-datos.md` + `_arranque-vertical-tienda-pwa-sin-datos.md`.
- **No precompilar decisiones abiertas** — las 4 preguntas se hacen al
  usuario, no se cierran solo porque "parecen obvias". (Disciplina ana.)
- **`subsistema-tienda` complementa la verticalidad de
  `vertical-tienda-pwa-sin-datos`** — no la reemplaza. Esa vertical cubre
  WhatsApp escueto + recogida; esta propuesta cubre observabilidad y
  operabilidad. Ambos horizontes pueden ejecutarse en paralelo o secuencia
  según prioridad del usuario.
- **Sin migrar piezas legacy** (cf-worker, static-template.js, export-cli.js)
  en este horizonte. Solo cuadrarlos en el estado.json como `bundle.fuente`.
- **El `tienda.json` feature (vivo desde v1.0.0)** es la pieza canónica
  de bootstrap del subsistema. No se reescribe — se extiende con el
  `initialFiles["storage/tienda/estado.json"]`.

---

## 8 · Frase canónica para retomar

> *"Cuatro perfiles miran la tienda: operador, dev nuevo, LLM, comerciante.
> Todos consumen el mismo `storage/tienda/estado.json`. Primer paso: cerrar
> las 4 preguntas abiertas. Sin eso, no se toca código."*
