# Pasada 1 — Esquematizador-Jefe (lente JEFE) · catalogo-modelos

> SUJETO: la cara de DECISIÓN del catálogo de modelos 3D del taller personal de impresión 3D
> (uso propio, no vende). El JEFE aquí es el dueño que DECIDE qué modelo entra al catálogo,
> cómo se clasifica y —por decisión de negocio— qué calidad tiene. catalogo-modelos es un
> CUSTODIO puro: ÚNICO escritor de su store (`Map<id,Modelo>`). No hay cara de cliente final
> (no hay POS/PWA que elija modelo): el catálogo es alta + consulta.

## Alimento (informer al prisma)

- **Eventos que publica** (module.json): `catalogo.modelo_registrado`,
  `catalogo.registrar.failed` (par de fallo canónico).
- **Eventos que escucha**: `catalogo.registrar.request`, `catalogo.listar.request`,
  `catalogo.obtener.request`, `catalogo.categorias.request`, `project.activated`
  (restaura persistencia).
- **Handlers reales** (index.js): `onRegistrarRequest`, `onListarRequest`,
  `onObtenerRequest`, `onCategoriasRequest`, `onProjectActivated`. Todos derivados del
  esquema on + PascalCase(action) + Request → mapean a proyecciones deterministas
  `_registrar` / `_listar` / `_obtener` / `_categorias`.
- **Máquina de estados**: NO hay ciclo de vida de estados. El store es append-only
  (alta + consulta). Los estados `pendiente_aprobacion / aprobado / archivado`
  (contexto del proyecto) NO están modelados en index.js: no hay op de aprobar/rechazar
  ni evento de transición → **hueco [ABIERTO]**.
- **Confirmaciones**: `registrar` → `catalogo.modelo_registrado` (modelo_id, nombre,
  categoria, project_id). Par de fallo: `catalogo.registrar.failed`.
- **Config**: sin config de reglas. Persistencia por proyecto vía `_shared/pos-persistencia`
  (snapshot fs debounced en `/3d/catalogo/catalogo-modelos.json`), restaura en
  `project.activated`, vuelca en `onUnload`.
- **Invariantes** (index.js): `nombre` y `project_id` obligatorios (400 si faltan); `id`
  único — duplicado → 409 `ALREADY_EXISTS`; `categoria` default `sin_categoria`; `origen`
  default `desconocido`; metadatos con huecos como `desconocido` (nunca inventado). El juez
  de la unicidad es el MÓDULO, no la UI.

## Las 5 preguntas-jefe (prisma de 5 huecos)

### 1. IDENTIDAD — ¿Qué DECIDE el JEFE aquí?
- **JEFE** decide qué entra al catálogo (`registrar`): es la ÚNICA escritura del custodio.
  Declara nombre, categoría (con default `sin_categoria`), archivo .3mf, origen (default
  `desconocido`) y metadatos (material, dimensiones, tiempo/peso estimado — huecos como
  `desconocido`). Es la forma canónica **editor-bloque** (declaración multi-campo, 1 modal).
- **JEFE (calidad)** decide la calidad del modelo (aprobar/rechazar): presente por decisión
  de negocio del dueño (estados `pendiente_aprobacion/aprobado/archivado`), pero SIN op UI
  ni handler en index.js → **[ABIERTO]**. No se inventa el handler.
- **NEUTRO** para la lente jefe: `listar`, `obtener`, `categorias` — informan al jefe para
  decidir (no duplicar, elegir categoría, inspeccionar detalle), pero no son decisiones del
  jefe.

### 2. RESTRICCIONES — ¿Qué NO depende del jefe?
- El custodio del store es el PROPIO módulo (`Map<id,Modelo>`). El JEFE NO edita ni borra un
  modelo ya registrado (append-only hoy, sin op update/delete).
- El juez de la unicidad (409 `ALREADY_EXISTS`) es el MÓDULO, no la UI.
- La persistencia es del sistema (pos-persistencia), no de la UI.
- El JEFE NO decide el orden de impresión (eso es `cola-impresion`), ni la operación física
  de la máquina (eso es `ciclo-impresion`). Aquí solo declara el contenido del catálogo.

### 3. CONTRATO — ¿Qué necesita VER el jefe para decidir y qué SEÑAL pareada confirma?
- **VER antes de registrar** (para una decisión informada): `categorias` (distinct de
  listar → select de categoría) + `listar` (para no duplicar por id/nombre).
- **SEÑALES pareadas** (verificadas en index.js):
  - `registrar` → `catalogo.modelo_registrado` ✅ (onRegistrarRequest → _registrar → publish)
  - fallo → `catalogo.registrar.failed` ✅ (par de fallo canónico)
  - aprobar/rechazar → (transición de aprobación) ⚠️ **[ABIERTO]** sin op ni evento.
- Regla: sin señal, hoja inmadura. El refresco parea [registrar→señal]; la vista re-lee,
  NUNCA recarga.

### 4. NO-OBJETIVOS — ¿Qué caras NO son del jefe aquí?
- **OPERADOR** (consulta diaria: listar/obtener/categorias) y **CLIENTE** (elegir/comprar
  modelo — no existe) quedan AL MARGEN de esta corrida de lente jefe.
- `importacion-modelo` (puente que lee el .3mf) llama a `registrar` tras leer el archivo —
  es un **ORIGEN de datos**, no una cara del jefe.
- El sistema (persistencia, health) informa, no decide.

### 5. PREGUNTAS_ABIERTAS — [ABIERTO] (se nombran, no se cierran)
- (a) **Estados del modelo / aprobación** — module.json/index.js NO modelan
  `pendiente_aprobacion / aprobado / archivado` como estados reales: no hay op de
  aprobar/rechazar ni evento de transición. Si el dueño quiere un flujo de aprobación (cara
  de JEFE de calidad), es decisión de negocio sobre el grafo de estados, NO de esta cara.
  → ui_handler `aprobar_rechazar` **[ABIERTO]** SIN handler falso (no existe en index.js).
- (b) **Edición/borrado** — sin op de actualizar ni eliminar (append-only hoy). Decisión de
  dueño.

## Veredicto del ÁRBITRO (lente-roles: jefe)

Pregunta árbitro: ¿decide el FUTURO del catálogo (escribe en el store vía custodio, o decide
su calidad) → **JEFE** · ¿solo informa → **NEUTRO** (fuera de la lente jefe)?

| Op | Veredicto | Handler real (index.js) | Por qué |
|---|---|---|---|
| `registrar` | **JEFE** | `onRegistrarRequest` ✅ | La ÚNICA escritura del custodio: alta (append + emite `catalogo.modelo_registrado`). Decide el FUTURO del catálogo. |
| `aprobar`/`rechazar` (calidad) | **JEFE** | — ⚠️ **[ABIERTO]** | Decisión de CALIDAD del dueño. Presente en contexto (pendiente_aprobacion/aprobado/archivado) pero SIN op ni handler en index.js. NO se inventa. |
| `categorias` | neutro | `onCategoriasRequest` ✅ | Distinct de listar — alimenta el select de categoría al registrar. Consulta informativa. |
| `listar` | neutro | `onListarRequest` ✅ | Cinta del catálogo — ver qué hay para no duplicar. |
| `obtener` | neutro | `onObtenerRequest` ✅ | Detalle del modelo (metadatos, origen, archivo) antes de decidir. |

**Dualidad en una línea**: el JEFE declara qué entra al catálogo (`registrar` — única
escritura del custodio) y decide su calidad (aprobar/rechazar, [ABIERTO]); el resto
(categorias/listar/obtener) solo informa para que el jefe decida mejor.

## Composición de la vista (cara jefe)

```
1. DECLARAR (JEFE) — registrar: editor-bloque multi-campo (nombre, categoría, archivo,
   origen, metadatos). Única escritura del custodio. Señal pareada re-lee, nunca recarga.
   · JEFE: aprobar/rechazar modelo (sin op UI hoy, [ABIERTO]).
2. VER para decidir (informativo) — listar (cinta: no duplicar) · obtener (detalle) ·
   categorias (select de categoría).
```

### Frecuencia → jerarquía
- El gesto rey es `registrar` (editor-bloque). Es la cara de EDICIÓN del custodio.
- No hay acciones destructivas ni transiciones de estado en este módulo (append-only).

## Formas UI canónicas (cara jefe)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Registrar modelo (JEFE) | `editor-bloque` | declaración multi-campo (nombre, categoría, archivo, origen, metadatos) — 1 modal, no fases |
| Aprobar/rechazar modelo (JEFE) | `confirmador-nombrado` | **[ABIERTO]** decisión de calidad del dueño; sin op UI ni handler hoy |
| Select de categoría (al registrar) | `ref-select` | vía `categorias` |
| Cinta del catálogo (ver para no duplicar) | `cinta-estado` | vía `listar` — "n modelos · n categorias" |
| Todas las de declaración | `señal-refresh` | **pareadas** (ver contratos) |

## Señales pareadas por hoja de declaración (verificadas en index.js)

```
registrar → catalogo.modelo_registrado  ✅ (onRegistrarRequest → _registrar → publish)
fallo     → catalogo.registrar.failed   ✅ (par de fallo canónico)
aprobar/rechazar → (transición aprobación) ⚠️ [ABIERTO] sin op UI ni evento en index.js
```

## Huecos
1. **Editor de alta** — panel-jefe: editor-bloque para `registrar` (nombre, categoría,
   archivo, origen, metadatos) con señal pareada.
2. **Aprobación/copia de calidad** — [ABIERTO] aprobar/rechazar, sin handler real.

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **Estados del modelo** — los estados pendiente_aprobacion/aprobado/archivado no están
  modelados en index.js; añadir flujo de aprobación es decisión de negocio sobre el grafo.
- (b) **Edición/borrado** — sin op de update/delete (append-only hoy).

## Cables hacia el blueprint (agente crear-blueprint-jefe)
- `ui.roles` = veredicto del árbitro: registrar=jefe, aprobar/rechazar=jefe [ABIERTO],
  categorias=neutro, listar=neutro, obtener=neutro.
- `ui.flujo` JEFE-PRIMERO: [jefe: registrar, aprobar/rechazar] → [neutro: categorias,
  listar, obtener].
- ref de select de categoría: `catalogo.categorias`. ref de select de modelo:
  `catalogo.listar` (ref_label nombre, ref_value id).
- señales de refresco del panel: `catalogo.modelo_registrado` (+ `catalogo.registrar.failed`).
