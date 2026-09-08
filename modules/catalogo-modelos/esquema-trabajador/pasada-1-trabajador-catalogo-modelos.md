# Pasada 1 — Esquematizador (lente TRABAJADOR) · catalogo-modelos

> SUJETO: **la cara del TRABAJADOR sobre el catálogo de modelos 3D** — quien consulta a
> diario qué hay disponible para imprimir. catalogo-modelos es un CUSTODIO puro del
> proyecto 3D (taller personal, uso propio, no vende): es el ÚNICO escritor de su store
> (`Map<id,Modelo>`). La cara del TRABAJADOR aquí es de **CONSULTA** (listar/obtener/
> categorias — qué hay disponible para imprimir), NO de operación física de máquina
> (eso vive en ciclo-impresion). La cara del JEFE (registrar — dar de alta) y la del
> CLIENTE (consumo) quedan AL MARGEN de esta lente.

## Alimento (informer al prisma — verificado contra module.json + index.js)

- **Handlers reales (index.js)**: `onListarRequest` (`catalogo.listar.request`),
  `onObtenerRequest` (`catalogo.obtener.request`), `onCategoriasRequest`
  (`catalogo.categorias.request`) — los TRES son RPC consumibles por UI y son la cara
  de CONSULTA del trabajador. `onRegistrarRequest` (`catalogo.registrar.request`) es la
  cara del JEFE (dar de alta), NO del trabajador. `onProjectActivated` restaura
  persistencia (sistema, no UI).
- **Proyecciones** (index.js): `_listar` (modelos del proyecto, `{modelos[], total}`),
  `_obtener` (modelo por id, 404 si no existe), `_categorias` (distinct de listar,
  ordenado, `{categorias[], total}`), `_metadatos` (huecos como `desconocido`, nunca
  inventado).
- **Eventos que publica** (alimentan señales pareadas): `catalogo.modelo_registrado`
  (lo emite `registrar`, cara del JEFE), `catalogo.registrar.failed` (par de fallo).
  El trabajador NO escribe: no hay evento de escritura que le toque.
- **Invariantes** (index.js): `_listar` filtra por `project_id`; `_obtener` exige `id`
  (400 si falta, 404 si no existe); `_categorias` agrupa por `categoria` con default
  `sin_categoria`. El juez de la unicidad es el MÓDULO, no la UI.

## Las 5 preguntas con LENTE TRABAJADOR

1. **IDENTIDAD** — ¿Qué OPERA el TRABAJADOR aquí?
   - **listar** (consulta diaria): qué modelos hay disponibles para imprimir. RPC
     directo `onListarRequest`. Es el gesto rey de la cara trabajador.
   - **obtener** (detalle): metadatos, origen, archivo .3mf de un modelo concreto.
     RPC directo `onObtenerRequest`.
   - **categorias** (filtro): distinct de listar para filtrar/agrupar por categoría.
     RPC directo `onCategoriasRequest`.
   - Neutro (informa): las tres son de consulta pura — el trabajador NO escribe.
2. **RESTRICCIONES** — ¿Qué NO depende del trabajador? El custodio del store es el
   PROPIO módulo (Map<id,Modelo>). El trabajador NO registra ni edita ni borra modelos
   (eso es del JEFE, `registrar`). El trabajador NO decide qué modelo entra al
   catálogo — solo consulta lo ya registrado. La persistencia es del sistema
   (pos-persistencia), no de la UI. La operación física de impresión (arrancar,
   retirar, cambiar filamento) vive en ciclo-impresion, NO aquí.
3. **CONTRATO** — ¿Qué necesita VER para operar y qué SEÑAL pareada confirma?
   - VER: `listar` (modelos del proyecto, `{modelos[], total}`) + `obtener` (detalle
     del modelo por id) + `categorias` (filtro por categoría).
   - SEÑALES pareadas (index.js): las consultas son de lectura — la vista re-lee,
     NUNCA recarga. El refresco del catálogo lo dispara `catalogo.modelo_registrado`
     (cuando el JEFE da de alta, el trabajador ve el modelo nuevo al re-listar).
4. **NO-OBJETIVOS** — La cara JEFE (`registrar` — dar de alta, la ÚNICA escritura del
   custodio) y la cara CLIENTE (consumo, no existe en uso propio) quedan al margen
   aquí. `importacion-modelo` (puente que lee el .3mf) llama a `registrar` — es un
   ORIGEN de datos, no una cara del trabajador. La operación física de impresión vive
   en ciclo-impresion.
5. **PREGUNTAS_ABIERTAS** — [ABIERTO]
   - (a) **Estados del modelo** — el module.json/index.js NO modelan
     `pendiente_aprobacion / aprobado / archivado` como estados reales del store: no
     hay op de aprobar/rechazar/archivar ni eventos de transición. Si el dueño quiere
     un flujo de aprobación (cara de JEFE de calidad), es decisión de negocio sobre el
     grafo de estados, no de esta cara de consulta.
   - (b) **Edición/borrado** — no hay op de actualizar ni eliminar un modelo ya
     registrado (solo alta + consulta). Añadirlas es decisión de dueño (el custodio es
     append-only hoy).
   - (c) **Filtro por material** — `_listar` filtra por `project_id` y `_categorias`
     agrupa por `categoria`, pero no hay filtro por `material` (metadato). Si el
     trabajador quiere ver "qué hay en PETG", es un hueco de consulta [ABIERTO].

## Composición de la vista (3 capas)

```
1. SELECCIONAR — ref de modelos: listar (cinta del catálogo) · tocar la tarjeta del
                 modelo (obtener) · categorias como filtro/select
2. INFORMARSE   — listar (cinta) + obtener (detalle: metadatos, origen, archivo) +
                  categorias (filtro) · cinta-estado "n modelos · n categorias"
3. OPERAR       — el TRABAJADOR NO escribe: solo consulta (neutro). Las ÚNICAS
                  escrituras del módulo son del JEFE (registrar), al margen aquí.
```

### Frecuencia → jerarquía

- El gesto rey del trabajador es `listar` (cinta del catálogo — qué hay disponible).
- `obtener` es el detalle (informe) que abre la decisión de qué imprimir.
- `categorias` es el filtro/select que agrupa la cinta.
- No hay acciones destructivas ni transiciones de estado en este módulo (el catálogo
  no tiene ciclo de vida de estados — solo alta + consulta). La cara del TRABAJADOR es
  de consulta pura (neutro), no de operación física.

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta del catálogo (capa 1) | `ref-select`/cinta | `listar` — tarjetas de modelos; el ref-select queda expuesto en la cinta |
| Cinta de pulso | `cinta-estado` | "n modelos · n categorias" (listar + categorias) |
| Detalle del modelo | `cinta-estado`/informe | `obtener`: metadatos, origen, archivo, created_at |
| Filtro por categoría | `ref-select` | `categorias` — distinct de listar, agrupa la cinta |

## Señales pareadas por hoja (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```
listar     → (lectura) la vista re-lee, nunca recarga ✅
obtener    → (lectura) la vista re-lee, nunca recarga ✅
categorias → (lectura) la vista re-lee, nunca recarga ✅
refresco   → catalogo.modelo_registrado ✅ (cuando el JEFE da de alta, el trabajador
             ve el modelo nuevo al re-listar)
fallo      → catalogo.registrar.failed ✅ (par de fallo canónico, del JEFE)
```

## Huecos

1. **Cinta del catálogo** — `cinta-estado` vía listar + categorias (consulta del
   trabajador).
2. **Detalle del modelo** — `obtener` (metadatos, origen, archivo, created_at).

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **Estados del modelo** — no modelados en index.js (pendiente_aprobacion/aprobado/
  archivado). Decisión de negocio sobre el grafo de estados, no de esta cara.
- (b) **Edición/borrado** — no hay op de actualizar/eliminar (append-only hoy).
- (c) **Filtro por material** — `_listar`/`_categorias` no filtran por `material`
  (metadato). Hueco de consulta si el trabajador quiere "qué hay en PETG".

## Cables hacia el blueprint

- `ui.roles` = listar=trabajador, obtener=trabajador, categorias=trabajador,
  registrar=jefe (al margen de esta lente).
- `ui.flujo` TRABAJADOR: [listar] · [obtener según modelo] · [categorias como filtro].
  El trabajador consulta (neutro), no escribe.
- ref de selects de modelo: `catalogo.listar` (ref_label nombre, ref_value id).
- señales de refresco del panel: `catalogo.modelo_registrado` (+ `catalogo.registrar.failed`).
