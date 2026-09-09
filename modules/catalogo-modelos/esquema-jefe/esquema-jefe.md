# Esquema maestro — catalogo-modelos · ROL JEFE

> Sujeto: la cara de DECISIÓN del catálogo de modelos 3D para el dueño (JEFE).
> Objetivo: **interfaz de gestión del catálogo** — dar de alta modelos (la ÚNICA
> escritura del custodio) y decidir su calidad, con el mínimo de gestos y sin recargas.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol JEFE.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0).

## La lente JEFE aplicada a catalogo-modelos

`catalogo-modelos` es un **CUSTODIO puro** del proyecto 3D: es el **único escritor** de
su store (`Map<id,Modelo>`). Para el JEFE eso significa:

- **Registrar es la única escritura** del módulo (append + emite `catalogo.modelo_registrado`).
  No hay update ni delete: el catálogo es append-only hoy.
- Lo que el JEFE declara (nombre, categoría, archivo, origen, metadatos) es lo que el
  resto del sistema consume (cola-impresion, ciclo-impresion, adaptador-avisos).
- El juez de la unicidad (409 `ALREADY_EXISTS`) es el MÓDULO, no la UI.
- La decisión de CALIDAD del modelo (aprobar/rechazar) es del dueño, pero hoy **no hay
  op UI ni evento** en index.js — es un hueco [ABIERTO], no un defecto.

```
CATALOGO-MODELOS · ROL JEFE
│
├─ VISTA VIVA (catálogo) ─────────────────────────── el 90% del trabajo ocurre aquí
│   ├─ Cinta de modelos (tarjetas: nombre, categoría, origen) · reflejo ✅ (listar)
│   ├─ Cinta de pulso (n modelos · n categorías) · reflejo ✅ (listar + categorias)
│   ├─ Filtro por categoría (select desde categorias) · reflejo ✅ (categorias)
│   └─ Detalle del modelo (metadatos, archivo, created_at) · reflejo ✅ (obtener)
│
├─ GESTO INLINE (lo que hace ÁGIL al panel) ──────── 1 toque, feedback inmediato
│   └─ ⭐ Alta rápida de modelo (botón "+ modelo" → editor-bloque) · puente al custodio
│          · registrar existe ✅ — falta la CAPTURA (el hueco nº1)
│
├─ EDITOR DE ALTA (lo que excede el gesto) ───────── 1 modal, no formularios en fases
│   ├─ nombre · categoría (select) · archivo .3mf · origen · metadatos
│   │     (material, dimensiones, tiempo/peso estimado)
│   ├─ REGLA: "guardar" delega al custodio (registrar); la señal refresca la vista
│   └─ [ABIERTO] ¿alta aquí o vía importacion-modelo? — decisión del dueño
│
└─ DECISIÓN DE CALIDAD ────────────────────────────── [ABIERTO] sin op UI hoy
    ├─ aprobar / rechazar modelo (estados pendiente_aprobacion/aprobado/archivado
    │     NO modelados en index.js — no hay op ni evento de transición)
    └─ confirmador-nombrado cuando exista la op — hoy no hay nada que confirmar
```

## Los 3 principios de agilidad (lo que extrae el esquema)

1. **Frecuencia → jerarquía.** El gesto rey del JEFE es `registrar` (editor-bloque
   multi-campo). La cinta del catálogo es la vista viva; el alta es un modal único.
   Nada de formularios por fases.
2. **Ninguna operación recarga la vista.** El refresco lo hace la señal del bus
   (`catalogo.modelo_registrado`) — la vista re-lee, nunca recarga.
3. **El catálogo visible ES el formulario de lo frecuente.** No una tabla que abre
   formularios: la cinta muestra lo registrado y el alta es un gesto desde la vista.

## El prisma de 5 huecos con lente JEFE (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué DECIDE el JEFE aquí?

- **Qué entra al catálogo** (`registrar`): nombre, categoría, archivo .3mf, origen,
  metadatos (material, dimensiones, tiempo/peso estimado). Es la cara de EDICIÓN del
  custodio — la ÚNICA escritura del módulo (append + emite `catalogo.modelo_registrado`).
- **La calidad del modelo** (aprobar/rechazar) — decisión de negocio del dueño, hoy
  **sin op UI ni evento** en index.js → [ABIERTO].
- **NEUTRO**: `project.activated` (restaura persistencia — sistema, no UI).

### 2 · RESTRICCIONES — ¿Qué NO depende del JEFE?

- El custodio del store es el PROPIO módulo (`Map<id,Modelo>`). El JEFE **no edita ni
  borra** un modelo ya registrado (append-only hoy — no hay op de update/delete).
- El juez de la unicidad (409 `ALREADY_EXISTS`) es el MÓDULO, no la UI.
- `nombre` y `project_id` son obligatorios (400 si faltan) — el módulo valida, no la UI.
- La persistencia por proyecto es del sistema (pos-persistencia), no de la UI.
- `importacion-modelo` (puente que lee el .3mf) llama a `registrar` tras leer el archivo
  — es un ORIGEN de datos, no una cara del jefe.

### 3 · CONTRATO — ¿Qué necesita VER y qué SEÑAL confirma?

**VER (antes de registrar):**
- `categorias` (distinct de listar, ordenado) — para el select de categoría.
- `listar` (modelos del proyecto, `{modelos[], total}`) — para no duplicar por id/nombre.

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | Verificado |
|---|---|---|
| `registrar` → éxito | `catalogo.modelo_registrado` | ✅ `onRegistrarRequest → _registrar → publish` |
| `registrar` → fallo | `catalogo.registrar.failed` | ✅ par de fallo canónico |
| `listar` / `obtener` / `categorias` | (lectura) la vista re-lee, nunca recarga | ✅ |
| refresco del panel | `catalogo.modelo_registrado` | ✅ (al dar de alta, la cinta re-lee) |
| aprobar/rechazar | (transición de aprobación) | ⚠️ [ABIERTO] sin op UI ni evento |

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del JEFE?

- **CLIENTE** (elegir/comprar modelo): NO existe — taller de uso propio, no vende (fase 0).
- **TRABAJADOR** (consulta diaria qué hay disponible para imprimir): es otra cara — la
  cinta de consulta alimenta la vista del jefe pero su gesto rey es distinto. Se separa.
- **SISTEMA**: persistencia, health — informa, no decide.
- **Operación física de impresión** (arrancar, retirar, cambiar filamento): vive en
  ciclo-impresion, NO aquí.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **Estados del modelo** — `pendiente_aprobacion / aprobado / archivado` (mencionados
  en el contexto del proyecto) NO están modelados en index.js: no hay op de
  aprobar/rechazar/archivar ni eventos de transición. Si el dueño quiere un flujo de
  aprobación (cara de JEFE de calidad), es decisión de negocio sobre el grafo de estados.
- (b) **Edición/borrado** — no hay op de actualizar ni eliminar un modelo ya registrado
  (solo alta + consulta). Añadirlas es decisión de dueño (el custodio es append-only hoy).
- (c) **Alta aquí vs importacion-modelo** — el dueño puede dar de alta directo (registrar)
  o vía importación (importacion-modelo lee el .3mf y registra). Dónde vive el alta
  manual es decisión del dueño.
- (d) **Filtro por material** — `_listar`/`_categorias` no filtran por `material`
  (metadato). Hueco de consulta si el jefe quiere ver "qué hay en PETG".

## Veredicto del ÁRBITRO (lente-roles)

Pregunta árbitro: ¿decide el FUTURO del catálogo (escribe en el store vía custodio, o
decide su calidad) → JEFE · ¿opera el flujo a diario (consulta qué hay disponible) →
TRABAJADOR · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `registrar` | **JEFE** | La ÚNICA escritura del custodio: da de alta un modelo (append + emite `catalogo.modelo_registrado`). Decide el FUTURO del catálogo. |
| `aprobar` / `rechazar` (calidad) | **JEFE** | Decisión de CALIDAD del dueño. Presente en el contexto del proyecto pero SIN op UI ni evento en index.js — [ABIERTO]. |
| `listar` | neutro→jefe | Lectura que alimenta la vista del jefe (cinta + no duplicar). RPC directo `onListarRequest`. |
| `obtener` | neutro→jefe | Detalle del modelo (metadatos, origen, archivo) que abre la decisión de registrar. RPC directo `onObtenerRequest`. |
| `categorias` | neutro→jefe | Distinct de listar — select de categoría al registrar. RPC directo `onCategoriasRequest`. |
| `project.activated` | neutro | Restaura persistencia — sistema, no UI. |

**El panel del jefe se compone SOLO de hojas-jefe + hojas-neutro que las alimentan.**
`listar`/`obtener`/`categorias` son lecturas neutras que alimentan la decisión de
`registrar`; la cara de consulta diaria (trabajador) se separa del árbol del jefe.

## Composición de la vista del jefe (3 capas)

```
1. SELECCIONAR  — ref de modelos: listar (cinta del catálogo) · tocar la tarjeta del
                  modelo (obtener) · categorias como select al registrar
2. INFORMARSE   — listar (cinta) + obtener (detalle: metadatos, origen, archivo) +
                  categorias (select de categoría) · cinta-estado "n modelos · n categorias"
3. DECLARAR     — las ÚNICAS escrituras del jefe:
                  · registrar (editor-bloque multi-campo) — la señal pareada re-lee,
                    nunca recarga.
                  · aprobar/rechazar modelo (hoy sin op UI, [ABIERTO]).
```

### Frecuencia → jerarquía

- El gesto rey del JEFE es `registrar` (editor-bloque: nombre, categoría, archivo,
  origen, metadatos). Es la cara de edición del custodio.
- `obtener` es el detalle (informe) que abre la decisión de registrar.
- `categorias` alimenta el select de categoría al registrar.
- No hay acciones destructivas ni transiciones de estado en este módulo (el catálogo
  no tiene ciclo de vida de estados — solo alta + consulta).

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta del catálogo (capa 1) | `ref-select`/cinta | `listar` — tarjetas de modelos; el ref-select queda expuesto en la cinta |
| Cinta de pulso | `cinta-estado` | "n modelos · n categorias" (listar + categorias) |
| Registrar modelo (JEFE) | `editor-bloque` | declaración multi-campo (nombre, categoría, archivo, origen, metadatos) — 1 modal, no fases |
| Detalle del modelo | `cinta-estado`/informe | `obtener`: metadatos, origen, archivo, created_at |
| Select de categoría (al registrar) | `ref-select` | `categorias` — distinct de listar, alimenta el editor de alta |
| Aprobar/rechazar modelo (JEFE) | `confirmador-nombrado` | [ABIERTO] decisión de calidad del dueño; sin op UI hoy |
| TODAS las de declaración | `señal-refresh` | **pareadas** (tabla abajo) |

## Señales pareadas por hoja de declaración (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```
registrar → catalogo.modelo_registrado  ✅ (onRegistrarRequest → _registrar → publish)
fallo     → catalogo.registrar.failed   ✅ (par de fallo canónico)
listar    → (lectura) la vista re-lee, nunca recarga ✅
obtener   → (lectura) la vista re-lee, nunca recarga ✅
categorias→ (lectura) la vista re-lee, nunca recarga ✅
refresco  → catalogo.modelo_registrado ✅ (cuando el JEFE da de alta, la cinta re-lee)
aprobar/rechazar → (transición aprobación) ⚠️ [ABIERTO] sin op UI ni evento en index.js
```

## Huecos reales (todos de UI, todos del rol jefe)

1. **Editor de alta** — panel-jefe: editor-bloque para `registrar` (nombre, categoría,
   archivo, origen, metadatos) con señal pareada `catalogo.modelo_registrado`.
2. **Cinta del catálogo** — `cinta-estado` vía listar + categorias (la vista viva del
   jefe: qué hay registrado, sin duplicar).

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **Estados del modelo** — aprobar/rechazar/archivar NO modelados en index.js.
- (b) **Edición/borrado** — no hay op de update/delete (append-only hoy).
- (c) **Alta aquí vs importacion-modelo** — dónde vive el alta manual.
- (d) **Filtro por material** — `_listar`/`_categorias` no filtran por metadato.

## El deliverable hacia F7 (spec de construcción)

El panel del jefe para catalogo-modelos = `CatalogoJefePanel` compuesto por:
- Cinta de pulso (n modelos · n categorías) + cinta del catálogo (listar) + select de
  categoría (categorias).
- Botón "+ modelo" (editor-bloque de alta) — delega a `registrar`.
- Detalle del modelo (obtener) al tocar una tarjeta.
- Todas las mutaciones: emitir → señal refresca → la vista ES el feedback.

## Puertos abiertos (cableables por el sitio)

- `fuente_del_catalogo` → hoy: `catalogo.listar` / `catalogo.obtener` / `catalogo.categorias`
- `escritor_del_catalogo` → hoy: `catalogo.registrar` (custodio, única escritura)
- `señal_de_refresco` → hoy: `catalogo.modelo_registrado` + `catalogo.registrar.failed`
- `origen_de_datos` → hoy: `importacion-modelo` (lee el .3mf y registra)

## Verificación contra index.js (agotado)

- Handlers reales: `onRegistrarRequest`, `onListarRequest`, `onObtenerRequest`,
  `onCategoriasRequest`, `onProjectActivated` — todos presentes y mapeados.
- Proyecciones: `_registrar` (append + emite `catalogo.modelo_registrado`), `_listar`
  (`{modelos[], total}`), `_obtener` (404 si no existe), `_categorias` (distinct ordenado),
  `_metadatos` (huecos como `desconocido`).
- Invariantes: `nombre`+`project_id` obligatorios (400); `id` único (409 `ALREADY_EXISTS`);
  `categoria` default `sin_categoria`; `origen` default `desconocido`; metadatos con
  huecos como `desconocido` (nunca inventado).
- **No hay op de update/delete ni de aprobar/rechazar** — el catálogo es append-only;
  la decisión de calidad es [ABIERTO], no un defecto de la UI.
