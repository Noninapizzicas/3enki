---
name: control-calidad-muestreo
description: >
  Skill FULL del módulo REFLEJO `control-calidad-muestreo` de la vertical contabilidad de
  Enki. CONTROL POR MUESTREO: excepción + muestra, NO revisar todo — selecciona los asientos
  que exigen ojo humano por SEÑALES DURAS (alto importe, sin regla, contrapartida nueva,
  cuadre dudoso, sin documento, fuera de plantilla) y una MUESTRA aleatoria determinista del
  resto. Criterios y tamaño de muestra DECLARABLES. Sin estado. Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites la selección a revisar por muestreo de un periodo (RPC
    control-calidad-muestreo.seleccionar.request).
  - Cuando depures por qué no se selecciona nada (`asientos_disponible:false` si el diario B2
    no responde; `criterios_inaplicables` si un umbral no está declarado; `muestra:[]` si no
    hay tamaño declarado).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del muestreo (excepción + muestra, determinista, criterios declarables, no decide).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo control-calidad-muestreo.
tags: [enki, modulo, reflejo, contabilidad, control-calidad-muestreo]
---

# control-calidad-muestreo — REFLEJO STATELESS del control por muestreo

## Qué hace el módulo

`control-calidad-muestreo` es un **REFLEJO STATELESS** (L8, hoja del plan): **CONTROL POR
MUESTREO: excepción + muestra, NO revisar todo**. Selecciona los asientos que **EXIGEN OJO
HUMANO** por **SEÑALES DURAS** (`alto_importe`, `sin_regla`, `contrapartida_nueva`,
`cuadre_dudoso`, `sin_documento`, `fuera_de_plantilla`) y, además, una **MUESTRA aleatoria**
del resto. El asesor revisa **ESA selección**, no el volumen entero.

> 🔴 **LOS CRITERIOS Y EL TAMAÑO DE MUESTRA SON DECLARABLES** (ley/parámetro como dato): no se
> cablea ningún importe, ningún porcentaje ni ningún tamaño — un criterio de umbral **SIN**
> umbral declarado **NO es aplicable** (`criterios_inaplicables`) y **sin tamaño declarado no
> hay muestra** (solo excepciones). Un umbral inventado mandaría al asesor a revisar lo que
> no pidió.

Invariantes:

- **DETERMINISTA**: mismos asientos + mismos criterios + misma semilla → **misma selección**
  (reproducible para que el asesor pueda rehacerla).
- **Excepción + muestra, jamás «todo»**: un asiento ya seleccionado por señal dura **no se
  repite** en la muestra.
- **Dato ausente = desconocido**: sin asientos no se selecciona nada (`asientos_disponible:false`)
  y la señal `contrapartida_nueva` **no dispara** sin contrapartidas conocidas declaradas.
  **Nada se estima.**
- **NO escribe, NO persiste, NO muta y NO decide**: la selección es un **DERIVADO**; **revisar
  es del asesor**.
- La selección es **BAJO DEMANDA** y el reflejo es stateless: **no acumula** asientos ni lanza
  selecciones proactivas.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `control-calidad-muestreo.seleccionar.request` | `onSeleccionarRequest` | RPC reflejo (seleccion pura, determinista): {project_id, periodo?, asientos?\|libro?, criterios?\|umbrales?, contrapartidas_conocidas?, muestra_tamano?\|tamano_muestra?\|muestra?, semilla?} → {project_id, tipo:'control-calidad-muestreo', seleccionados (union de excepcion + muestra), total_asientos, total_seleccionados, fuente_asientos, excepciones:[{numero, importe, motivos, asiento}], muestra:[{numero, importe, motivos, asiento}], criterios_declarados:[{senal, umbral, aplicable}], criterios_inaplicables, contrapartidas_conocidas, fuente_contrapartidas, muestreo:{tamano_declarado, semilla, universo_restante}, exhaustivo:false, revisa:'asesor', abierto}. Los asientos se reciben declarados o se PIDE a escritor-diario (B2) POR EVENTO; las contrapartidas conocidas se declaran o se PIDE a regla-contrapartida (A6). Sin asientos no se selecciona nada (asientos_disponible:false). Responde por control-calidad-muestreo.seleccionar.response; project_id ausente → control-calidad-muestreo.seleccionar.failed. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → L8): escritor-diario publico que un asiento quedo registrado → se deja constancia en el log de que hay material nuevo que muestrear. La seleccion es BAJO DEMANDA y el reflejo es stateless: NO acumula asientos ni lanza selecciones proactivas. Tolerante: sin project_id se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `control-calidad-muestreo.seleccionar.response` | Respuesta RPC correlada de control-calidad-muestreo.seleccionar.request → {request_id, status:200, data:{seleccionados, excepciones, muestra, criterios_declarados, criterios_inaplicables, muestreo, exhaustivo:false, abierto}}. Emitida por el helper _atender. |
| `control-calidad-muestreo.seleccionar.failed` | Par de fallo determinista (L8): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de control-calidad-muestreo.seleccionar.request y de contabilidad.asiento_registrado. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `control-calidad-muestreo.seleccionar.failed` cierra el círculo de
> `control-calidad-muestreo.seleccionar.request` cuando `_seleccionar` devuelve status ≠ 200
> (`400`, `project_id` ausente).

> Nota: la firma de la señal `contabilidad.asiento_registrado` (B2) aparece documentada en el
> `module.json` **junto al par `failed`** de `seleccionar` («y de
> contabilidad.asiento_registrado»), pero el handler `onAsientoRegistrado` **no** publica nada:
> solo registra un `logger.info` y devuelve `null` (la selección es bajo demanda y stateless).
> No es una petición y no tiene par `failed` propio.

## Reglas de negocio

1. **Los ASIENTOS se reciben declarados o se piden al diario**: `_asientos` acepta
   `input.asientos` (o `input.libro`) **array** o `{asientos:[...]}` →
   `fuente_asientos:'declarados'`; si no, se **PIDE POR EVENTO** a
   `escritor-diario.asientos.request` (`{project_id, periodo}`, `timeout_ms:4000`) →
   `'escritor-diario'`. Sin respuesta → `asientos_disponible:false`.
2. **Sin asientos no se selecciona nada**: se devuelve `200` con `seleccionados:[]`,
   `total_asientos:0`, `faltan:['asientos']` y `abierto.asientos` declarado (**no se inventa
   material que muestrear**).
3. **Las SEÑALES DURAS son identidades, no criterios**: el conjunto
   `SENALES_DURAS = {alto_importe, sin_regla, contrapartida_nueva, cuadre_dudoso,
   sin_documento, fuera_de_plantilla}`. **Su umbral/valores los declara el negocio** (cero
   constantes cableadas).
4. **Los CRITERIOS son declarables** (`_criterios`): `input.criterios` o `input.umbrales`
   (objeto o array), cada uno `{senal|tipo, umbral?, campo?, valor?}`. Se ignoran los que no
   están en `SENALES_DURAS` o no declaran señal.
5. **Un criterio de umbral SIN umbral NO es aplicable**: solo `alto_importe` y
   `fuera_de_plantilla` **necesitan umbral**; sin él → `aplicable:false` (aparece en
   `criterios_inaplicables`). `sin_regla`, `contrapartida_nueva`, `cuadre_dudoso` y
   `sin_documento` son **intrínsecos** → `aplicable:true` **siempre**.
6. **La EXCEPCIÓN son los asientos con motivos** (`_evaluar`): cada asiento se evalúa contra
   los criterios **aplicables** y, si tiene ≥1 motivo, entra en `excepciones` (con sus
   `motivos`, `numero`, `clave_natural`, `fecha`, `importe`, `asiento`). Los **motivos viajan
   con la excepción**: el asesor ve **por qué** se le manda.
   - `alto_importe`: `|importe| >= umbral` (el importe es el declarado: `importe`/`total`/
     `suma_debe` o el mayor apunte de debe/haber — **no se recalcula el asiento**).
   - `sin_regla`: `asiento.sin_regla === true` o `asiento.regla_contrapartida === null`.
   - `contrapartida_nueva`: alguna contrapartida del asiento NO está entre las **conocidas**
     (necesita el conjunto declarado; **sin él no dispara**).
   - `cuadre_dudoso`: `asiento.cuadra === false` o `asiento.cuadre_dudoso === true`.
   - `sin_documento`: `asiento.documento === null` o `asiento.sin_documento === true`.
   - `fuera_de_plantilla`: `campo` declarado con valor distinto del `valor` esperado.
7. **Las CONTRAPARTIDAS CONOCIDAS se declaran o se piden a A6**: `_contrapartidasConocidas`
   acepta `input.contrapartidas_conocidas` (o `input.contrapartidas`) array →
   `fuente:'declaradas'`; si no, se **PIDE POR EVENTO** a
   `regla-contrapartida.listar.request` (`{project_id}`, `timeout_ms:4000`) y se toman las
   `contrapartida`/`cuenta` de las reglas → `fuente:'regla-contrapartida'`. Sin ninguna de las
   dos → `null` y **`contrapartida_nueva` no dispara**.
8. **La MUESTRA es determinista y reproducible** (`_muestra`): `tamano = _tamano(input)` (0 si
   no se declara → **no hay muestra**); se baraja `restantes` con **Fisher-Yates** usando un
   **PRNG mulberry32 sembrado** (`_semilla`) y se toman los `min(tamano, restantes.length)`
   primeros. Cada elegido lleva `motivos:[{senal:'muestra', motivo:'seleccionado por muestreo
   aleatorio determinista'}]`.
9. **La SEMILLA es declarable o derivada, cero aleatoriedad oculta** (`_semilla`):
   `input.semilla` → `input.muestra.semilla` → `` `${project_id}|${periodo} ``
   (**reproducible**).
10. **Un asiento ya seleccionado por señal dura NO se repite en la muestra**: la muestra se
    saca solo de `restantes` (los que no tuvieron motivos).
11. **La selección es la UNIÓN**: `seleccionados = [...excepciones, ...muestra]`, `total_seleccionados
    = excepciones.length + muestra.length`. **El control es por muestreo, no exhaustivo**
    (`exhaustivo:false`).
12. **El control es AUDITABLE, no una caja negra**: `criterios_declarados` (con su umbral y
    `aplicable`), `criterios_inaplicables`, `contrapartidas_conocidas` (+ su fuente) y
    `muestreo:{tamano_declarado, semilla, universo_restante}` se declaran siempre.
13. **`revisa` declara quién**: `'asesor (la seleccion es una propuesta de donde poner el
    ojo)'` — **el reflejo NO decide**.
14. **`abierto`: qué falta se declara**: `criterios` (sin criterios declarados no hay
    excepción), `umbrales` (criterios sin umbral), `tamano_muestra` (sin tamaño → solo
    excepciones) y `contrapartidas` (sin conocidas, `contrapartida_nueva` no dispara).
15. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
16. **Puro**: no escribe, no persiste, no muta, sin reloj, sin azar oculto (semilla
    declarada/derivada).
17. **HTTP exacto**: éxito `200` (con asientos o sin ellos); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `control-calidad-muestreo.seleccionar.response`. **No emite evento de dominio.**

### 1. `seleccionar` — excepción + muestra con criterios declarados

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "asientos": [
    { "numero": 1, "importe": 5000, "apuntes": [ { "cuenta": "629", "debe": 5000 } ] },
    { "numero": 2, "importe": 100, "apuntes": [ { "cuenta": "430", "debe": 100 } ] },
    { "numero": 3, "importe": 90, "cuadra": false, "apuntes": [ { "cuenta": "700", "haber": 90 } ] }
  ],
  "criterios": [
    { "senal": "alto_importe", "umbral": 3000 },
    { "senal": "cuadre_dudoso" },
    { "senal": "contrapartida_nueva" }
  ],
  "contrapartidas_conocidas": ["430", "700"],
  "muestra_tamano": 1,
  "semilla": "rev-2026-09",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "tipo": "control-calidad-muestreo",
  "seleccionados": [ { "numero": 1, "importe": 5000, "motivos": [ { "senal": "alto_importe", "umbral": 3000, "importe": 5000, "motivo": "el importe alcanza el umbral declarado (3000)" } ], "asiento": { "...": "..." } }, { "numero": 3, "importe": 90, "motivos": [ { "senal": "cuadre_dudoso", "descuadre": null, "motivo": "el asiento no cuadra o su cuadre es dudoso" } ], "asiento": { "...": "..." } }, { "numero": 2, "importe": 100, "motivos": [ { "senal": "muestra", "motivo": "seleccionado por muestreo aleatorio determinista" } ], "asiento": { "...": "..." } } ],
  "total_asientos": 3,
  "total_seleccionados": 3,
  "fuente_asientos": "declarados",
  "asientos_disponible": true,
  "excepciones": [ { "numero": 1, "...": "..." }, { "numero": 3, "...": "..." } ],
  "muestra": [ { "numero": 2, "...": "..." } ],
  "criterios_declarados": [
    { "senal": "alto_importe", "umbral": 3000, "aplicable": true },
    { "senal": "cuadre_dudoso", "umbral": null, "aplicable": true },
    { "senal": "contrapartida_nueva", "umbral": null, "aplicable": true }
  ],
  "criterios_inaplicables": [],
  "contrapartidas_conocidas": ["430", "700"],
  "fuente_contrapartidas": "declaradas",
  "muestreo": { "tamano_declarado": 1, "semilla": "rev-2026-09", "universo_restante": 1 },
  "exhaustivo": false,
  "revisa": "asesor (la seleccion es una propuesta de donde poner el ojo)",
  "abierto": { "criterios": null, "umbrales": null, "tamano_muestra": null, "contrapartidas": null }
}
```

### 2. `seleccionar` — un criterio de umbral SIN umbral → no es aplicable

```json
{ "project_id": "e57a318a-...", "asientos": [ { "numero": 1, "importe": 5000 } ], "criterios": [ { "senal": "alto_importe" } ] }
```

Respuesta `200`: `criterios_inaplicables:['alto_importe']`, `excepciones:[]`, `muestra:[]`,
`abierto.umbrales` declarado. **Cero constantes: un umbral inventado mandaría a revisar lo
que no se pidió.**

### 3. `seleccionar` — sin asientos (no se inventa material)

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09" }
```

Respuesta `200`: `asientos_disponible:false`, `seleccionados:[]`, `total_asientos:0`,
`faltan:['asientos']`, `abierto.asientos` declarado (B2 no respondió).

### 4. `seleccionar` — sin tamaño declarado (solo excepciones)

```json
{ "project_id": "e57a318a-...", "asientos": [ { "numero": 1, "importe": 100 } ], "criterios": [ { "senal": "sin_regla" } ] }
```

Respuesta `200`: `muestra:[]`, `muestreo.tamano_declarado:0`, `abierto.tamano_muestra`
declarado (**cero tamaños cableados**).

### 5. Fire-and-forget — reacción a `contabilidad.asiento_registrado`

`onAsientoRegistrado` toma `e.data || e`; sin `project_id` → `null`. Con `project_id` solo
registra un `logger.info` de que hay material nuevo que muestrear y devuelve `null`. **No
acumula asientos ni lanza selecciones proactivas** (bajo demanda, stateless).

### 6. Fallo — falta `project_id`

Respuesta `400` + `control-calidad-muestreo.seleccionar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/control-calidad-muestreo.test.js`. Cubre:

- `seleccionar` con asientos + criterios declarados → `200`, `excepciones` con sus `motivos`,
  `muestra` con su tamaño y `seleccionados` = **unión** de ambas.
- Un criterio de umbral **sin umbral** → `criterios_inaplicables` lo incluye y **no dispara**.
- **Determinismo**: mismos asientos + mismos criterios + misma semilla → **misma selección**;
  dos llamadas con la misma `semilla` dan la misma `muestra`.
- **Excepción + muestra, no «todo»**: un asiento ya en `excepciones` **no** aparece en
  `muestra`; `exhaustivo:false`.
- **Sin tamaño declarado** → `muestra:[]` y `muestreo.tamano_declarado:0`.
- **Sin asientos** (ni declarados ni B2) → `asientos_disponible:false`, `faltan:['asientos']`.
- Asientos pedidos **por evento** a `escritor-diario` (B2) → `fuente_asientos:'escritor-diario'`.
- Contrapartidas conocidas **declaradas** o de `regla-contrapartida` (A6); **sin ellas**,
  `contrapartida_nueva` **no dispara**.
- `onAsientoRegistrado` devuelve `null` y **no muta**; sin `project_id` → `null`.
- `project_id` ausente → `400 INVALID_INPUT` + `control-calidad-muestreo.seleccionar.failed`.
- `toolSeleccionar` devuelve la misma proyección que `_seleccionar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ControlCalidadMuestreo extends ModuloHibridoReflejo`; `name = 'control-calidad-muestreo'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/control-calidad-muestreo/`; es de la vertical **libro**).
- Constante `SENALES_DURAS = new Set(['alto_importe','sin_regla','contrapartida_nueva',
  'cuadre_dudoso','fuera_de_plantilla','sin_documento'])` — **identidades de señal, no
  criterios**.
- `onSeleccionarRequest` usa `this._atender(e, 'seleccionar',
  'control-calidad-muestreo.seleccionar.response', async (d) => {...})` y publica el par
  `failed` si `status !== 200`. `onAsientoRegistrado` **no** usa `_atender` (solo loguea).
- Proyección `_seleccionar(input)` (`async`: puede pedir asientos y contrapartidas por
  evento) → `{status, data}`; helpers `_criterios`, `_evaluar`, `_muestra`, `_tamano`,
  `_semilla`, `_prng`, `_asientos`, `_contrapartidasConocidas`, `_contrapartidas`, `_importe`,
  `_num`. Tool `toolSeleccionar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `escritor-diario.asientos.request` (B2) y `regla-contrapartida.listar.request`
  (A6) **por evento** (best-effort); observa `contabilidad.asiento_registrado` (B2) como señal
  tolerante; lo revisa el asesor.
- **PARÁMETRO COMO DATO**: criterios, umbrales y tamaño de muestra son declarables; la semilla
  es declarable o derivada de proyecto+periodo (**reproducible: cero aleatoriedad oculta**).
  **Cero umbrales, porcentajes o tamaños cableados.**
- **SELECCIONA, NO DECIDE**: la selección es una **propuesta de dónde poner el ojo**;
  **revisar es del asesor**.
