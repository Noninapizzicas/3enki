# Esquema maestro — catalogo-modelos · ROL TRABAJADOR / OPERADOR

> Sujeto: la cara de **ejecución/conSULTA OPERATIVA** del catálogo de modelos 3D para el
> operador del taller (TRABAJADOR) — quien está físicamente junto a la impresora.
> Objetivo: **interfaz de consulta del catálogo** — ver qué modelo está disponible para
> imprimir y CÓMO imprimirlo (archivo, material, tamaño), con lectura directa y sin gestos.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol TRABAJADOR.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0).

## La lente TRABAJADOR aplicada a catalogo-modelos (contraste con el JEFE)

Para el JEFE, `catalogo-modelos` es el **custodio donde DECLARA** qué entra (única
escritura `registrar`, append-only). Para el **TRABAJADOR** es el **frigorífico del
stock de piezas imprimibles**: no lo llena, lo CONSULTA para operar la impresora.

El trabajador/operador:

- **NO decide** qué entra al catálogo — `registrar` es exclusivo del jefe (append + emite
  `catalogo.modelo_registrado`). El operador no da de alta ni edita modelos.
- Es un **LECTOR casi puro** aquí: necesita **VER** la pieza para saber cómo imprimirla
  (qué `.3mf`, qué material, qué dimensiones/tiempo).
- Su **operación física** (arrancar impresión, retirar pieza, cambiar filamento, revisar
  filamento) vive en `ciclo-impresion` / `cola-impresion` — NO en este módulo. El operador
  **pasa por aquí SOLO para consultar la ficha del modelo** antes de imprimir.

Contraste con el jefe (el esquema-jefe ya lo intuyó): el jefe **DECIDE y ve el panorama**;
el trabajador **EJECUTA y ve lo físico/concreto** — la ficha concreta de UN modelo que va
a tirar, no el inventario completo para decidir.

```
CATALOGO-MODELOS · ROL TRABAJADOR (operador del taller)
│
├─ CONSULTA OPERATIVA (la cara real del trabajador aquí) ─────── 100% del trabajo
│   ├─ Ficha del modelo a imprimir (obtener) · reflejo ✅ — el gesto rey:
│   │     ¿qué archivo `.3mf`? ¿qué material? ¿dimensiones? ¿tiempo estimado?
│   ├─ Cinta "qué hay disponible" (listar) · reflejo ✅ — qué piezas imprimibles existen
│   └─ Orden por categoría (categorias) · reflejo ✅ — encontrar la pieza rápido
│
├─ (NO hay escritura del trabajador) ──────────────────────────── registrar es JEFE ❌
│   · el operador no da de alta, no edita, no borra — append-only y de decisión del dueño
│
└─ LA OPERACIÓN FÍSICA ────────────────────────────────────────── en OTRO módulo
    · retirar pieza · cambiar filamento · ver qué imprime la SPARKX · stock de filamento
      → vive en ciclo-impresion / cola-impresion, NO en catalogo-modelos
```

## Los 3 principios de agilidad (qué extrae el esquema, lente trabajador)

1. **La ficha ES la vista.** El trabajador no navega una jerarquía: entra `obtener` por id
   (o toca la pieza en la cinta `listar`) y lee la ficha técnica (archivo, material,
   dimensiones, tiempo). Un solo toque de la cinta → ficha. Sin formularios, sin decisión.
2. **Lectura directa, cero recargas.** `listar`/`obtener`/`categorias` son RPC de lectura:
   la vista re-lee en cada consulta, nunca recarga, nunca espera una señal de mutación
   (el trabajador no muta).
3. **El trabajador NO escribe aquí.** No hay gesto rey de declaración (eso es jefe). Su
   "acción" operativa real desborda este módulo hacia ciclo-impresion/cola-impresion.

## El prisma de 5 huecos con lente TRABAJADOR (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué EJECUTA/CONSULTA el TRABAJADOR aquí?

- **Qué pieza imprimir y CÓMO** (`obtener`): la ficha del modelo — `archivo3mf`,
  `material`, `dimensiones`, `tiempo_estimado`, `peso_estimado` (metadatos), para saber
  qué archivo cargar y con qué material. Es la cara de CONSULTA del custodio — la ÚNICA
  que usa el operador a diario.
- **Qué hay disponible** (`listar`): cinta de modelos imprimibles del proyecto
  (`{modelos[], total}`) — la "alacena" de lo que puede tirar.
- **Cómo encontrarlo** (`categorias`): distinct de listar, ordenado — para agrupar la
  cinta y localizar la pieza (p.ej. por categoría).
- **NEUTRO**: `project.activated` (restaura persistencia — sistema, no UI).

### 2 · RESTRICCIONES — ¿Qué NO depende del TRABAJADOR?

- `registrar` **no es del trabajador** — es la única escritura y es del JEFE; el operador
  no decide qué entra al catálogo, no edita ni borra (append-only en index.js).
- El juez de unicidad (409 `ALREADY_EXISTS`) es el MÓDULO, no la UI (y no lo toca el worker).
- La persistencia por proyecto es del sistema (pos-persistencia), no del operador.
- `importacion-modelo` llame a `registrar` tras leer el `.3mf` — es un ORIGEN de datos, no
  una cara del trabajador.
- Los metadatos con huecos vienen como `desconocido` (`_metadatos`) — el operador ve el
  hueco honesto (tiempo/material "desconocido"), NO se le inventa un valor.

### 3 · CONTRATO — ¿Qué necesita VER el TRABAJADOR y qué SEÑAL confirma?

**VER (para operar la impresora):**
- `listar` (`{modelos[], total}`) — qué hay disponible para imprimir en el proyecto.
- `obtener` (por `id`) — la FICHA de UN modelo: archivo, metadatos (material,
  dimensiones, tiempo/peso), origen, created_at. Es la consulta que desbloquea la operación.
- `categorias` (distinct ordenado) — agrupar/ordenar la cinta para encontrar la pieza.

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | Verificado |
|---|---|---|
| `listar` / `obtener` / `categorias` | (lectura) la vista re-lee, nunca recarga | ✅ RPC de lectura puro |
| (el trabajador NO muta) | (no emite, no recibe señal de refresco de mutación) | ✅ sin op de escritura del worker |
| refresco del catálogo | `catalogo.modelo_registrado` (la EMITE el JEFE) | ✅ `onRegistrarRequest → _registrar → publish` — el worker ve llegar piezas nuevas por esta señal, pero NO la dispara |

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del TRABAJADOR?

- **JEFE** (decidir qué entra, calidad): la única escritura `registrar` + aprobar/rechazar
  (hoy sin op, [ABIERTO]) son del dueño — el trabajo de DECISIÓN se separa del árbol del worker.
- **CLIENTE** (elegir/comprar): NO existe — taller de uso propio, no vende (fase 0).
- **SISTEMA**: persistencia, health — informa, no opera.
- **Operación física de la impresora** (arrancar/retirar/cambiar filamento/stock): vive en
  `ciclo-impresion` / `cola-impresion`, NO aquí. Aquí el trabajador SOLO consulta la ficha.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **Alcance real de la cara del worker** — el operador casi no vive en catalogo-modelos:
  consulta la ficha (`obtener`) y pasa a `ciclo-impresion`. ¿La FICHA de impresión debe estar
  embebida en la vista de la cola/ciclo (consultar sin cambiar de módulo)? Decisión de sitio.
- (b) **Filtro por material en la cinta del worker** — `_listar`/`_categorias` no filtran por
  `metadatos.material`. El operador que solo tiene PETG cargado querría ver "qué hay en PETG".
  Hueco de consulta, no de escritura; mismo hueco (d) del jefe.
- (c) **Campos operativos extra en la ficha** — el worker imprime con tiempo/tiro reales;
  hoy `tiempo_estimado` y `peso_estimado` vienen como metadato declarado por el jefe (o
  `desconocido`). Si el operador necesita tiempo real de impresión, es del dominio de
  ciclo-impresion, no del catálogo.
- (d) **Estados del modelo / aprobación** — `pendiente_aprobacion/aprobado/archivado` NO
  modelados en index.js; de existir, el worker solo los leería (imprime lo "aprobado"),
  nunca los transiciona. Mismo [ABIERTO] (a) del jefe.

## Veredicto del ÁRBITRO (lente-roles) — CLASIFICACIÓN para el TRABAJADOR

Pregunta árbitro: ¿decide el FUTURO del catálogo → JEFE · ¿opera/consulta a diario para
ejecutar → TRABAJADOR · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `registrar` | **JEFE** (NO trabajador) | La ÚNICA escritura del custodio. El operador NO da de alta modelos — lo decide el dueño. |
| `obtener` | **TRABAJADOR** ✅ | La FICHA de UN modelo (archivo, material, dimensiones, tiempo): lo que el operador lee antes de imprimir. Es su gesto rey. |
| `listar` | **TRABAJADOR** ✅ | Cinta de piezas disponibles para imprimir — la alacena operativa. RPC directo `onListarRequest`. |
| `categorias` | **TRABAJADOR** ✅ | Distinct de listar — agrupar/ordenar la cinta para localizar la pieza. RPC directo `onCategoriasRequest`. |
| `aprobar` / `rechazar` (calidad) | **JEFE** | Decisión de CALIDAD del dueño. El worker solo lo leería si existiera — NO lo transiciona. [ABIERTO, sin op hoy]. |
| `project.activated` | neutro | Restaura persistencia — sistema, no UI. |

**Conclusión del árbitro (honesta):** el trabajador en `catalogo-modelos` es un
**LECTOR casi puro** — sus caras son `listar` + `obtener` + `categorias` (consulta para
imprimir), y **NO toca `registrar`** (es jefe). Su cara operativa real (retirar, cambiar
filamento, stock) NO vive en este módulo.

## Composición de la vista del TRABAJADOR (capa única)

```
CONSULTAR  — el 100% del trabajo del worker aquí es consulta:
             · listar (cinta de piezas disponibles) · categorias (agrupar la cinta)
             · obtener (FICHA de un modelo: archivo .3mf, material, dimensiones, tiempo)
```

### Frecuencia → jerarquía

- El gesto rey del TRABAJADOR es **`obtener`** (la ficha del modelo a imprimir), alcanzado
  desde la cinta `listar` (o por id directo). Un toque: cinta → ficha.
- `categorias` ordena/organiza la cinta para encontrar la pieza rápido.
- **NO hay acción de declaración del worker** — no edita, no registra, no transiciona.
  Su "acción" física vive en `ciclo-impresion`/`cola-impresion`.

## Formas UI canónicas (disección, lente trabajador)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta de piezas disponibles (capa 1) | `ref-select`/cinta | `listar` — qué hay para imprimir; un toque abre la ficha |
| Cinta agrupada por categoría | `cinta-estado` | `categorias` — agrupar/ordenar para localizar |
| FICHA del modelo (gesto rey del worker) | `cinta-estado`/informe | `obtener`: archivo `.3mf`, material, dimensiones, tiempo/peso, origen — lo que el operador lee para imprimir |
| (El worker NO declara) | — | sin `editor-bloque`, sin `confirmador`: el worker no tiene escrituras aquí |

## Señales pareadas por hoja (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES del módulo (el worker solo LEE):

```
listar     → (lectura) la vista re-lee, nunca recarga ✅  RPC onListarRequest → _listar
obtener    → (lectura) la vista re-lee, nunca recarga ✅  RPC onObtenerRequest → _obtener
categorias → (lectura) la vista re-lee, nunca recarga ✅  RPC onCategoriasRequest → _categorias
(refresco) → catalogo.modelo_registrado  ✅  EMITIDA por el JEFE (onRegistrarRequest → publish);
             el worker la recibe para ver piezas nuevas, pero NO la dispara
registrar  → (NO del worker) ❌  escritura exclusiva del JEFE
```

## Huecos reales para el TRABAJADOR (honestos)

El panel del trabajador en catalogo-modelos es **mínimo**: es una cara de CONSULTA casi
sin piel propia. Los huecos reales:

1. **Ficha de consulta del modelo** — `cinta-estado`/informe vía `obtener`: la ficha
   (archivo, material, dimensiones, tiempo) que el operador lee antes de imprimir.
2. **Cinta de piezas disponibles** — `ref-select`/cinta vía `listar` + `categorias` para
   agrupar: qué hay para imprimir.
3. **[MATIZ] Embebido o autónomo** — dado que el worker casi no vive aquí, la vía más
   honesta puede ser que la FICHA (`obtener`) se EMBEBA en la vista de la cola/`ciclo-impresion`
   (el operador consulta la pieza desde donde va a imprimirla) en vez de un panel aparte.

`[ABIERTO]` (decisiones del sitio/dueño, NO del worker):
- (a) **Ficha en la vista de impresión** — ¿panel propio del worker o ficha embebida en
  ciclo-impresion? Decisión de sitio.
- (b) **Filtro por material** — `_listar`/`_categorias` no filtran por `metadatos.material`.
- (c) **Estados de modelo** — de existir aprobación, el worker solo LEE lo imprimible.
- (d) **Tiempo real de impresión** — dominio de ciclo-impresion, no del catálogo.

## El deliverable hacia F7 (spec de construcción)

El panel del TRABAJADOR para catalogo-modelos = `CatalogoWorkerConsulta` compuesto por:
- Cinta de piezas disponibles (`listar`), opcionalmente agrupada por categoría
  (`categorias`).
- FICHA del modelo (`obtener`) al tocar una pieza: archivo `.3mf`, material, dimensiones,
  tiempo/peso estimado, origen.
- **Sin escrituras** — el worker no registra (`registrar` es del jefe). Todas las consultas:
  RPC de lectura; la vista re-lee, nunca recarga.
- **Posible embebido**: si el sitio decide integrar la ficha en la vista de la cola /
  `ciclo-impresion`, este panel queda como especificación de la ficha a reutilizar, no como
  panel independiente.

## Puertos abiertos (cableables por el sitio) — puertos de LECTURA del worker

- `fuente_del_catalogo` → hoy: `catalogo.listar` / `catalogo.obtener` / `catalogo.categorias`
- `lector_de_ficha` → hoy: `catalogo.obtener` (la consulta operativa del worker)
- `señal_de_novedad` → hoy: `catalogo.modelo_registrado` (recibida NO emitida por el worker)
- `escritor_del_catalogo` → NO es del worker: `catalogo.registrar` (JEFE, única escritura)

## Verificación contra index.js (agotado)

- Handlers reales: `onRegistrarRequest`, `onListarRequest`, `onObtenerRequest`,
  `onCategoriasRequest`, `onProjectActivated` — todos presentes y mapeados.
- Proyecciones: `_listar` (`{modelos[], total}`), `_obtener` (404 si no existe),
  `_categorias` (distinct ordenado), `_metadatos` (huecos como `desconocido`).
- El worker USA: `_listar` (cinta), `_obtener` (ficha), `_categorias` (agrupar) — las 3
  RPC de lectura. NO usa `_registrar` (es del JEFE) ni `_metadatos` de escritura.
- Invariantes que afectan lo que VE: `archivo3mf` puede ser `null`; metadatos con huecos
  como `desconocido` (nunca inventado) — el worker ve el hueco honesto de la pieza.
- **No hay op de update/delete ni de aprobar/rechazar** — el catálogo es append-only;
  el worker solo LEE un inventario que escribe el jefe. La cara del trabajador aquí es
  casi sin piel (mínima): la operación física vive en `ciclo-impresion`/`cola-impresion`.
