# Pasada 1 — Prisma con LENTE DE ROL JEFE (catalogo-modelos v2)

> Método `esquematizador-jefe` (5 preguntas-jefe + lente-roles + formas UI canónicas +
> composición en 3 capas). SUJETO correcto: **la cara del ROL JEFE de catalogo-modelos** —
> NO el módulo entero. Alimento: `module.json` + `index.js` (reflejo 0.1.0).
> Testigo de forma: `pizzepos/pedidos/esquema-jefe/pasada-4-consolidacion-formas-ui.md`.

## El SUJETO

```
"la capacidad de catalogo-modelos de servir las DECISIONES de su rol JEFE:
 qué puede declarar (dar de alta modelos), de qué necesita informarse
 (listar/obtener/categorias), y qué señales sostienen esas decisiones"
```

catalogo-modelos es un CUSTODIO puro del proyecto 3D: es el ÚNICO escritor de su
store (`Map<id,Modelo>`). No hay cara de utilización de cliente final (no hay POS/PWA
que elija modelos): el catálogo es un registro de alta + consulta. La dualidad aquí es
débil — casi todo es jefe o neutro.

## Las 5 preguntas-jefe, veredicto

1. **IDENTIDAD** — ¿Qué DECIDE el jefe aquí? Dar de alta un modelo 3D en el catálogo
   (`registrar`): nombre, categoría, archivo .3mf, origen, metadatos (material,
   dimensiones, tiempo/peso estimado). Es la cara de EDICIÓN del custodio: el jefe
   declara qué entra al catálogo y el sistema lo persiste y lo reconfigura solo.
   `registrar` es la ÚNICA escritura del módulo (append + emite `catalogo.modelo_registrado`).
2. **RESTRICCIONES** — El custodio del store es el PROPIO módulo (Map<id,Modelo>).
   Invariantes reales (index.js): `nombre` y `project_id` son obligatorios (400 si
   faltan); el `id` es único — duplicado → 409 `ALREADY_EXISTS` (deduplica por id);
   `categoria` default `sin_categoria`; `origen` default `desconocido`; metadatos con
   huecos como `desconocido` (nunca inventado). Persistencia por proyecto vía
   `_shared/pos-persistencia` (snapshot fs debounced en `/3d/catalogo/catalogo-modelos.json`),
   restaura en `project.activated`, vuelca en `onUnload`. El juez de la unicidad es el
   MÓDULO, no la UI.
3. **CONTRATO** — VER antes de decidir: `listar` (modelos del proyecto, respuesta
   `{modelos[], total}`) + `obtener` (modelo por id, 404 si no existe) + `categorias`
   (distinct de listar, para el select de categoría al registrar). SEÑAL de confirmación:
   `registrar` → `catalogo.modelo_registrado` (lleva modelo_id, nombre, categoria,
   project_id). Par de fallo: `catalogo.registrar.failed`. El refresco parea
   [listar→señal]: la vista re-lee, NUNCA recarga.
4. **NO-OBJETIVOS** — No hay cara de utilización de cliente final (no hay selección de
   modelo al elegir producto). `importacion-modelo` (puente que lee el .3mf) llama a
   `registrar` tras leer el archivo — es un ORIGEN de datos, no una cara del jefe. El
   sistema (persistencia, health) informa, no decide.
5. **PREGUNTAS_ABIERTAS** — ver [ABIERTO] abajo; se nombran, no se cierran.

## Veredicto del ÁRBITRO (lente-roles) — 3/3 ops

Pregunta árbitro: ¿decide el FUTURO del catálogo (escribe en el store vía custodio) →
JEFE · ¿sirve una decisión AHORA de selección del cliente → UTILIZACIÓN (no existe aquí)
· ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `registrar` | **JEFE** | La ÚNICA escritura del custodio: da de alta un modelo (append + emite `catalogo.modelo_registrado`). Decide el FUTURO del catálogo. |
| `listar` | neutro | Alimenta la cinta-estado y el ref-select de modelos (para `obtener`). |
| `obtener` | neutro | Detalle del modelo que alimenta la vista (metadatos, origen, archivo). |
| `categorias` | neutro | Distinct de listar — alimenta el select de categoría al registrar. |

**La dualidad, en una línea**: el catálogo es un registro de alta + consulta; el jefe
SOLO declara qué entra (`registrar`) y el resto informa. No hay cara de utilización.

## Composición de la vista del jefe (3 capas)

```
1. SELECCIONAR  — ref de modelos: listar (cinta del catálogo) · tocar la tarjeta del modelo
2. INFORMARSE   — listar (cinta) + obtener (detalle: metadatos, origen, archivo) +
                  categorias (select al registrar) · cinta-estado "n modelos · n categorias"
3. DECLARAR     — la ÚNICA escritura del jefe: registrar (editor-bloque multi-campo) ·
                  la señal pareada re-lee, nunca recarga
```

### Frecuencia → jerarquía

- El gesto rey es `registrar` (editor-bloque: nombre, categoría, archivo, origen,
  metadatos). Es la cara de edición del custodio.
- `obtener` es el detalle (informe) que abre la decisión de registrar/consultar.
- No hay acciones destructivas ni transiciones de estado en este módulo (el catálogo
  no tiene ciclo de vida de estados — solo alta + consulta).

## Formas UI canónicas (mapeo de la disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta del catálogo (capa 1) | `ref-select`/cinta | `listar` — tarjetas de modelos; el ref-select queda expuesto en la cinta |
| Cinta de pulso | `cinta-estado` | "n modelos · n categorias" (listar + categorias) |
| Registrar modelo | `editor-bloque` | declaración multi-campo (nombre, categoría, archivo, origen, metadatos) — 1 modal, no fases |
| Detalle del modelo | `cinta-estado`/informe | `obtener`: metadatos, origen, archivo, created_at |
| TODAS las de declaración | `señal-refresh` | **pareadas** (tabla abajo) |

## Señales pareadas por hoja de declaración (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```
registrar → catalogo.modelo_registrado  ✅ (onRegistrarRequest → _registrar → publish)
fallo     → catalogo.registrar.failed   ✅ (par de fallo canónico)
```

## Huecos

1. **Editor de alta** — panel-jefe: editor-bloque para `registrar` (nombre, categoría,
   archivo, origen, metadatos) con señal pareada.
2. **Cinta del catálogo** — `cinta-estado` vía listar + categorias.

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **Estados del modelo** — el module.json/index.js no modelan `pendiente_aprobacion /
  aprobado / archivado` (mencionados en el contexto del proyecto) como estados reales del
  store: no hay op de aprobar/rechazar/archivar ni eventos de transición. Si el dueño
  quiere un flujo de aprobación, es decisión de negocio sobre el grafo de estados, no de
  esta cara.
- (b) **Edición/borrado** — no hay op de actualizar ni eliminar un modelo ya registrado
  (solo alta + consulta). Añadirlas es decisión de dueño (el custodio es append-only hoy).

## Cables hacia el blueprint (agente crear-blueprint-jefe)

- `ui.roles` = veredicto del árbitro arriba (4 claves: 1 jefe, 3 neutro, 0 utilizacion)
- `ui.flujo` jefe-PRIMERO: [jefe: registrar] → [consulta: listar, obtener, categorias]
- ref de selects de modelo: `catalogo.listar` (ref_label nombre, ref_value id)
- señales de refresco del panel: `catalogo.modelo_registrado` (+ `catalogo.registrar.failed`)
