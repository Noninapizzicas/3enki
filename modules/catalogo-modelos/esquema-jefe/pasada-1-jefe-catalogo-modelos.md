# Pasada 1 — Esquematizador-Jefe-Trabajador · catalogo-modelos

> SUJETO correcto: **las DOS caras trabajadas del catálogo de modelos 3D — la del JEFE
> (quien declara qué entra al catálogo y decide su calidad) y la del TRABAJADOR (quien
> consulta a diario qué hay disponible para imprimir)** — NO el módulo entero. La cara
> del CLIENTE (POS/PWA/consumo) se deja AL MARGEN: es un taller de USO PROPIO, no vende
> nada, no hay cara de consumo.
>
> catalogo-modelos es un CUSTODIO puro del proyecto 3D: es el ÚNICO escritor de su
> store (`Map<id,Modelo>`). La dualidad aquí es de GESTIÓN + CONSULTA: el JEFE da de
> alta (la ÚNICA escritura del módulo), el TRABAJADOR consulta a diario qué hay
> disponible para imprimir. No hay operación física de máquina en este módulo (eso es
> ciclo-impresion); la cara del TRABAJADOR aquí es de CONSULTA.

## Alimento (informer al prisma — verificado contra module.json + index.js)

- **Handlers reales (index.js)**: `onRegistrarRequest` (`catalogo.registrar.request`),
  `onListarRequest` (`catalogo.listar.request`), `onObtenerRequest`
  (`catalogo.obtener.request`), `onCategoriasRequest` (`catalogo.categorias.request`),
  `onProjectActivated` (`project.activated`, restaura persistencia — sistema, no UI).
- **Proyecciones** (index.js): `_registrar` (append + emite `catalogo.modelo_registrado`),
  `_listar` (modelos del proyecto, `{modelos[], total}`), `_obtener` (modelo por id, 404
  si no existe), `_categorias` (distinct de listar, ordenado, `{categorias[], total}`),
  `_metadatos` (huecos como `desconocido`, nunca inventado).
- **Eventos que publica** (module.json): `catalogo.modelo_registrado` (lo emite
  `registrar`, cara del JEFE), `catalogo.registrar.failed` (par de fallo canónico).
- **Máquina de estados**: NO hay ciclo de vida de estados en el store. El catálogo es
  append-only: alta + consulta. Los estados `pendiente_aprobacion / aprobado /
  archivado` (mencionados en el contexto del proyecto) NO están modelados en index.js —
  no hay op de aprobar/rechazar/archivar ni eventos de transición. Es un hueco [ABIERTO].
- **Config**: NO hay config de reglas. Persistencia por proyecto vía
  `_shared/pos-persistencia` (snapshot fs debounced en `/3d/catalogo/catalogo-modelos.json`),
  restaura en `project.activated`, vuelca en `onUnload`.
- **Invariantes** (index.js): `nombre` y `project_id` obligatorios (400 si faltan);
  `id` único — duplicado → 409 `ALREADY_EXISTS` (deduplica por id); `categoria` default
  `sin_categoria`; `origen` default `desconocido`; metadatos con huecos como
  `desconocido` (nunca inventado). El juez de la unicidad es el MÓDULO, no la UI.

## Las 5 preguntas con lente de roles (JEFE + TRABAJADOR)

1. **IDENTIDAD** — ¿Qué DECIDE el JEFE aquí? ¿Qué OPERA el TRABAJADOR aquí?
   - **JEFE**: decide qué entra al catálogo (`registrar`): nombre, categoría, archivo
     .3mf, origen, metadatos (material, dimensiones, tiempo/peso estimado). Es la cara
     de EDICIÓN del custodio — la ÚNICA escritura del módulo (append + emite
     `catalogo.modelo_registrado`). Además, por decisión de negocio del dueño, el JEFE
     decide la CALIDAD del modelo (aprobar/rechazar) — hoy sin op UI, [ABIERTO].
   - **TRABAJADOR**: opera el taller a diario consultando el catálogo para saber qué
     modelos hay disponibles para imprimir (`listar`, `obtener`, `categorias`). No hay
     operación física de máquina aquí (eso es ciclo-impresion); la cara del trabajador
     es de CONSULTA diaria.
   - **NEUTRO**: `project.activated` (restaura persistencia — sistema, no UI).
2. **RESTRICCIONES** — ¿Qué NO depende de cada rol? El custodio del store es el PROPIO
   módulo (Map<id,Modelo>). El JEFE NO edita ni borra un modelo ya registrado (el
   custodio es append-only hoy — no hay op de update/delete). El TRABAJADOR NO decide
   qué modelo entra (eso es del JEFE) — solo consulta lo ya registrado. El juez de la
   unicidad (409 ALREADY_EXISTS) es el MÓDULO, no la UI. La persistencia es del sistema
   (pos-persistencia), no de la UI.
3. **CONTRATO** — ¿Qué necesita VER cada rol antes de decidir/operar y qué SEÑAL pareada
   confirma cada acción?
   - VER (JEFE antes de registrar): `categorias` (distinct de listar, para el select de
     categoría) + `listar` (para no duplicar por id/nombre). VER (TRABAJADOR): `listar`
     (modelos del proyecto, `{modelos[], total}`) + `obtener` (modelo por id, 404 si no
     existe) + `categorias` (filtro por categoría).
   - SEÑALES de confirmación (pareadas, verificadas en index.js): `registrar` →
     `catalogo.modelo_registrado` ✅; fallo → `catalogo.registrar.failed` ✅. El refresco
     parea [listar→señal]: la vista re-lee, NUNCA recarga.
4. **NO-OBJETIVOS** — La cara CLIENTE (elegir/comprar modelo) NO existe aquí (no hay
   selección de modelo al elegir producto) — al margen. `importacion-modelo` (puente que
   lee el .3mf) llama a `registrar` tras leer el archivo — es un ORIGEN de datos, no una
   cara del jefe. El sistema (persistencia, health) informa, no decide. La operación
   física de impresión (arrancar, retirar, cambiar filamento) vive en ciclo-impresion,
   NO aquí.
5. **PREGUNTAS_ABIERTAS** — [ABIERTO] abajo; se nombran, no se cierran.

## Veredicto del ÁRBITRO (lente-roles: jefe vs trabajador)

Pregunta árbitro: ¿decide el FUTURO del catálogo (escribe en el store vía custodio, o
decide su calidad) → JEFE · ¿opera el flujo a diario (consulta qué hay disponible para
imprimir) → TRABAJADOR · ¿solo informa → NEUTRO? La cara CLIENTE (elegir/comprar) NO se
clasifica aquí.

| Op | Veredicto | Por qué |
|---|---|---|
| `registrar` | **JEFE** | La ÚNICA escritura del custodio: da de alta un modelo (append + emite `catalogo.modelo_registrado`). Decide el FUTURO del catálogo. |
| `aprobar` / `rechazar` (calidad) | **JEFE** | Decisión de CALIDAD del dueño: qué modelo merece estar aprobado en el catálogo. Presente en el contexto del proyecto (estados pendiente_aprobacion/aprobado/archivado) pero SIN op UI ni evento en index.js — [ABIERTO]. |
| `listar` | **TRABAJADOR** | Consulta diaria del trabajador: qué modelos hay disponibles para imprimir. RPC directo `onListarRequest`. |
| `obtener` | **TRABAJADOR** | Detalle del modelo (metadatos, origen, archivo) que abre la decisión de qué imprimir. RPC directo `onObtenerRequest`. |
| `categorias` | **TRABAJADOR** | Distinct de listar — filtro/select del trabajador para agrupar la cinta por categoría. RPC directo `onCategoriasRequest`. |
| `project.activated` | neutro | Restaura persistencia — sistema, no UI. |

**Dualidad en una línea**: el JEFE declara qué entra al catálogo (`registrar`) y decide
su calidad (aprobar/rechazar, [ABIERTO]); el TRABAJADOR consulta el catálogo a diario
(listar/obtener/categorias) para saber qué hay disponible para imprimir; el CLIENTE
queda al margen (no hay cara de consumo en uso propio). El catálogo es más de GESTIÓN
(jefe) + CONSULTA (trabajador) que de operación física.

## Composición de la vista (3 capas)

```
1. SELECCIONAR  — ref de modelos: listar (cinta del catálogo) · tocar la tarjeta del
                  modelo (obtener) · categorias como filtro/select del trabajador
2. INFORMARSE   — listar (cinta) + obtener (detalle: metadatos, origen, archivo) +
                  categorias (select al registrar, filtro al consultar) ·
                  cinta-estado "n modelos · n categorias"
3. DECLARAR/OPERAR — las ÚNICAS escrituras:
                  · JEFE: registrar (editor-bloque multi-campo) — la señal pareada
                    re-lee, nunca recarga.
                  · JEFE: aprobar/rechazar modelo (hoy sin op UI, [ABIERTO]).
                  · TRABAJADOR: no escribe — solo consulta (listar/obtener/categorias).
```

### Frecuencia → jerarquía

- El gesto rey del JEFE es `registrar` (editor-bloque: nombre, categoría, archivo,
  origen, metadatos). Es la cara de edición del custodio.
- El gesto rey del TRABAJADOR es `listar` (cinta del catálogo — qué hay disponible).
- `obtener` es el detalle (informe) que abre la decisión de registrar/consultar.
- `categorias` es el filtro/select que agrupa la cinta (trabajador) y alimenta el select
  de categoría al registrar (jefe).
- No hay acciones destructivas ni transiciones de estado en este módulo (el catálogo
  no tiene ciclo de vida de estados — solo alta + consulta). La cara del TRABAJADOR es
  de consulta pura, no de operación física.

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta del catálogo (capa 1) | `ref-select`/cinta | `listar` — tarjetas de modelos; el ref-select queda expuesto en la cinta |
| Cinta de pulso | `cinta-estado` | "n modelos · n categorias" (listar + categorias) |
| Registrar modelo (JEFE) | `editor-bloque` | declaración multi-campo (nombre, categoría, archivo, origen, metadatos) — 1 modal, no fases |
| Detalle del modelo | `cinta-estado`/informe | `obtener`: metadatos, origen, archivo, created_at |
| Filtro por categoría (TRABAJADOR) | `ref-select` | `categorias` — distinct de listar, agrupa la cinta |
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
refresco  → catalogo.modelo_registrado ✅ (cuando el JEFE da de alta, el trabajador
             ve el modelo nuevo al re-listar)
aprobar/rechazar → (transición aprobación) ⚠️ [ABIERTO] sin op UI ni evento en index.js
```

## Huecos

1. **Editor de alta** — panel-jefe: editor-bloque para `registrar` (nombre, categoría,
   archivo, origen, metadatos) con señal pareada.
2. **Cinta del catálogo** — `cinta-estado` vía listar + categorias (consulta diaria del
   trabajador).

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **Estados del modelo** — el module.json/index.js NO modelan `pendiente_aprobacion /
  aprobado / archivado` (mencionados en el contexto del proyecto) como estados reales del
  store: no hay op de aprobar/rechazar/archivar ni eventos de transición. Si el dueño
  quiere un flujo de aprobación (cara de JEFE de calidad), es decisión de negocio sobre
  el grafo de estados, no de esta cara.
- (b) **Edición/borrado** — no hay op de actualizar ni eliminar un modelo ya registrado
  (solo alta + consulta). Añadirlas es decisión de dueño (el custodio es append-only hoy).
- (c) **Filtro por material** — `_listar`/`_categorias` no filtran por `material`
  (metadato). Hueco de consulta si el trabajador quiere ver "qué hay en PETG".

## Cables hacia el blueprint (agente crear-blueprint-jefe)

- `ui.roles` = veredicto del árbitro: registrar=jefe, aprobar/rechazar=jefe [ABIERTO],
  listar=trabajador, obtener=trabajador, categorias=trabajador, project.activated=neutro.
- `ui.flujo` JEFE-PRIMERO: [jefe: registrar, aprobar/rechazar] → [trabajador: listar,
  obtener, categorias]. El TRABAJADOR consulta (no escribe).
- ref de selects de modelo: `catalogo.listar` (ref_label nombre, ref_value id).
- señales de refresco del panel: `catalogo.modelo_registrado` (+ `catalogo.registrar.failed`).
