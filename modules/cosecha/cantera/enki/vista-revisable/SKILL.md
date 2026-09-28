---
name: vista-revisable
description: >
  Skill FULL del módulo REFLEJO `vista-revisable` de la vertical contabilidad de Enki
  (L2/L8, hoja del plan). TODO ASIENTO/CÁLCULO EXPLICADO: {cifra, base, origen, estado} —
  NO caja negra. La Vista es la composición DETERMINISTA de la traza (traza-asiento B4,
  por EVENTO: quién y cuándo creó el asiento, entrada inmutable) y de la PRUEBA conservada
  (expediente-documental L7, por EVENTO: el documento origen archivado y enlazado a la
  cifra). L2 EXPLICA; el expediente (L7) CONSERVA la prueba. Y el CONTROL DE CALIDAD POR
  MUESTREO (L8): selección por EXCEPCIÓN y MUESTRA — no revisar todo — por señales DURAS
  DECLARADAS (ALTO_IMPORTE con umbral declarado, SIN_REGLA, CONTRAPARTIDA_NUEVA,
  CUADRE_DUDOSO); la selección es determinista. Lo que no responde SE DECLARA en
  vista.estado.dependencias_no_disponibles — NUNCA se inventa la explicación ni la prueba.
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos.
when-to-use: >
  - Cuando necesites explicar un asiento/cálculo (RPC contabilidad.asiento.explicar.request)
    o seleccionar la muestra a revisar (contabilidad.muestra.seleccionar.request).
  - Cuando depures por qué una cifra aparece con `prueba_disponible:false` o una
    dependencia en `dependencias_no_disponibles` (traza-asiento B4 / expediente-documental
    L7), o por qué ALTO_IMPORTE no actúa (umbral no declarado), o 400 INVALID_INPUT.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la composición
    determinista de la traza y la prueba, y el muestreo por señales duras.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo vista-revisable.
tags: [enki, modulo, reflejo, contabilidad, vista-revisable, explicabilidad, muestreo]
---

# vista-revisable — REFLEJO que explica cada cifra y selecciona la muestra

## Qué hace el módulo

`vista-revisable` es un **REFLEJO STATELESS** (L2/L8, hoja del plan): **TODO
ASIENTO/CÁLCULO EXPLICADO**: `{cifra, base, origen, estado}` — **NO caja negra**. La
**Vista** es la **composición DETERMINISTA** de:

- la **traza** (`traza-asiento` B4, por **EVENTO** `contabilidad.traza.consultar.request`:
  **QUIÉN** y **CUÁNDO** creó el asiento, entrada inmutable), y
- la **PRUEBA conservada** (`expediente-documental` L7, por **EVENTO**
  `contabilidad.expediente.recuperar.request`: el documento origen archivado y enlazado a
  la cifra).

**L2 EXPLICA; el expediente (L7) CONSERVA la prueba.** Y el **CONTROL DE CALIDAD POR
MUESTREO** (L8): selección por **EXCEPCIÓN y MUESTRA** — *no revisar todo* — por **señales
DURAS DECLARADAS** (`ALTO_IMPORTE` con umbral declarado, `SIN_REGLA`,
`CONTRAPARTIDA_NUEVA`, `CUADRE_DUDOSO`). La selección es **determinista** (un test la
afirma) y el **umbral** que exige ojo humano lo declara el dueño, no la intuición (si no
se declara umbral, `ALTO_IMPORTE` **no actúa**).

Es **stateless**: sin PosPersistencia ni `project.activated` — cada op **entra objeto,
sale objeto**. El contrato es **TOLERANTE**: lo que no responde (`traza-asiento` B4 /
`expediente-documental` L7) **SE DECLARA** en `dependencias_no_disponibles` — **NUNCA** se
inventa la explicación ni la prueba. Emite `contabilidad.vista_explicada` y
`contabilidad.muestra_seleccionada` en éxito, y sus pares deterministas en fallo.

> **NO REUTILIZA**: la explicabilidad de cada cifra es requisito de la **medida maestra**
> (que el asesor la acepte); no existe en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.asiento.explicar.request` | `onExplicarRequest` | RPC reflejo: {project_id, asiento, clave_natural?, cifra?} → {project_id, vista:{cifra:{id, clave_natural, tipo, debe, haber, total}, base:{hechos, apuntes, documento_origen, prueba_disponible}, origen:{modulo, regla, asentado_por, asentado_en, traza_inmutable}, estado:{cuadra, prueba_disponible, dependencias_no_disponibles}}, caja_negra:false}. Explica la cifra componiendo la traza (EVENTO contabilidad.traza.consultar.request) y la prueba (EVENTO contabilidad.expediente.recuperar.request). Proyeccion PURA de lectura. Exito publica contabilidad.vista_explicada y responde por contabilidad.asiento.explicar.response; error → contabilidad.asiento.explicar.failed. |
| `contabilidad.muestra.seleccionar.request` | `onSeleccionarRequest` | RPC reflejo: {project_id, asientos:[...], senales?:{umbral_alto_importe}, senales_activas?} → {project_id, muestra:[{id, clave_natural, tipo, importe, motivos}], n, n_conjunto, tasa_muestra, criterios}. Seleccion por EXCEPCION y MUESTRA con senales DURAS DECLARADAS (ALTO_IMPORTE, SIN_REGLA, CONTRAPARTIDA_NUEVA, CUADRE_DUDOSO); determinista. Exito publica contabilidad.muestra_seleccionada y responde por contabilidad.muestra.seleccionar.response; error → contabilidad.muestra.seleccionar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.vista_explicada` | Fire-and-forget (L2): un asiento/calculo quedo EXPLICADO → {project_id, vista:{cifra, base, origen, estado}, caja_negra:false, dependencias_no_disponibles}. Lo consume la cara de revision del asesor: la medida maestra es que el asesor ACEPTE la cifra. |
| `contabilidad.muestra_seleccionada` | Fire-and-forget (L8): la MUESTRA de asientos a revisar quedo seleccionada por senales duras → {project_id, muestra, n, n_conjunto, tasa_muestra, criterios}. Da al asesor solo lo que exige ojo humano, sin revisar todo. |
| `contabilidad.asiento.explicar.failed` | Par de fallo determinista: explicar sin project_id o sin asiento/calculo. Cierra el circulo de contabilidad.asiento.explicar.request. |
| `contabilidad.muestra.seleccionar.failed` | Par de fallo determinista: seleccionar muestra sin project_id o sin conjunto de asientos. Cierra el circulo de contabilidad.muestra.seleccionar.request. |
| `contabilidad.vista_explicada.failed` | Par de fallo del evento de dominio contabilidad.vista_explicada: la emision del hecho de dominio no se completo. |
| `contabilidad.muestra_seleccionada.failed` | Par de fallo del evento de dominio contabilidad.muestra_seleccionada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.asiento.explicar.failed` cierra `contabilidad.asiento.explicar.request`;
> `contabilidad.muestra.seleccionar.failed` cierra
> `contabilidad.muestra.seleccionar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.asiento.explicar.response` y `contabilidad.muestra.seleccionar.response`
> (los pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.vista_explicada.failed` y
> `contabilidad.muestra_seleccionada.failed` son los pares de fallo de los eventos de
> DOMINIO; el reflejo solo publica los pares `*.failed` de sus RPC.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.traza.consultar.request` (traza-asiento B4) y
> `contabilidad.expediente.recuperar.request` (expediente-documental L7); dependencias por
> EVENTO no declaradas como publishers.

## Reglas de negocio

1. **NO caja negra (L2)**: `_explicar` compone una `vista` con cuatro bloques — `cifra`,
   `base`, `origen`, `estado` — y la respuesta declara `caja_negra:false` y
   `determinista:true`. Toda cifra sale con **su base, su origen y su estado**.
2. **La cifra**: `cifra = { id, clave_natural, tipo, debe, haber, total }`, donde `debe` y
   `haber` son la suma redondeada de los `apuntes` (o `lineas`) del asiento; `total` = el
   `total` declarado, o `debe` si no viene.
3. **La base**: `base = { hechos, apuntes, documento_origen, prueba_disponible }`. Los
   `hechos` salen de `asiento.hecho` (array de uno o vacío); los `apuntes` se normalizan a
   `{ cuenta, debe, haber }` (redondeado a céntimos).
4. **La prueba viene del expediente por EVENTO (L7)**: si hay `cifra` (o `clave_natural`),
   se pide `contabilidad.expediente.recuperar.request`; si responde, `documento` =
   `resp.data.documento || resp.data.id_documento` y `prueba_disponible:true`. Si **no
   responde** → `documento:null`, `prueba_disponible:false` y se añade
   `'expediente-documental'` a `dependencias_no_disponibles`.
5. **La traza viene por EVENTO (B4)**: si hay `clave_natural`, se pide
   `contabilidad.traza.consultar.request`; si `resp.data.hallada`, `traza =
   resp.data.entrada` y `origen.traza_inmutable:true` con `secuencia_traza`. Si **no
   responde** (o no hay clave) → se añade `'traza-asiento'` a `dependencias_no_disponibles`
   y `traza_inmutable:false`.
6. **El origen**: `origen = { modulo (por defecto `'escritor-diario'`), regla,
   contrapartida, asentado_por, asentado_en, traza_inmutable, secuencia_traza }`. El
   `asentado_por`/`asentado_en` prefieren la **traza** (la prueba inmutable) y caen al
   propio asiento si no la hay.
7. **El estado**: `estado = { asentado:true, explicado:true, cuadra, prueba_disponible,
   dependencias_no_disponibles }`; `cuadra = |debe - haber| < 0.005`.
8. **Lo que no se pudo probar SE DECLARA**: `dependencias_no_disponibles` aparece en la
   vista y en el `data` de la respuesta. **Nunca se inventa la explicación ni la prueba.**
9. **Muestreo por EXCEPCIÓN y MUESTRA (L8)**: `_seleccionarMuestra` recorre los asientos y
   marca `motivos` por señales DURAS — `ALTO_IMPORTE` (el mayor `|debe-haber|` de los
   apuntes `>= umbral`, **solo si el umbral es finito/declarado**), `SIN_REGLA`
   (`sin_regla:true` o `regla:null` o `tiene_regla:false`), `CONTRAPARTIDA_NUEVA`
   (`contrapartida_nueva:true`), `CUADRE_DUDOSO` (`cuadre_dudoso:true` o `cuadra:false`).
   Solo entran en la muestra los asientos con al menos un motivo.
10. **Señales declarables**: `senales_activas` (array) elige qué señales actúan; por
    defecto `SENALES_POR_DEFECTO = ['ALTO_IMPORTE','SIN_REGLA','CONTRAPARTIDA_NUEVA',
    'CUADRE_DUDOSO']`. El `umbral_alto_importe` puede venir en `senales` o suelto; si no
    es finito, `ALTO_IMPORTE` **no actúa** (`criterios.umbral_declarado:false`).
11. **La respuesta del muestreo**: `{ muestra:[{id, clave_natural, tipo, importe,
    motivos}], n, n_conjunto, tasa_muestra, criterios:{ senales_activas,
    umbral_alto_importe, umbral_declarado }, determinista:true }`; `tasa_muestra =
    n / n_conjunto` (0 si el conjunto está vacío, redondeado a 4 decimales).
12. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    sin `asiento`/`calculo`/`objeto` (o no objeto) → `400 INVALID_INPUT asiento`; sin
    `asientos` (array) → `400 INVALID_INPUT asientos`. Shape: `{ status:400, error:{
    code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
13. **HTTP exacto**: éxito `200`; payload inválido → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`. El reflejo **no** devuelve 503: lo que falta se declara dentro de
    la `vista`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.asiento.explicar.response` y
`contabilidad.muestra.seleccionar.response`.

### 1. `explicar` — explicar un asiento/cálculo

```json
{
  "project_id": "e57a318a-...",
  "asiento": {
    "id": "A1",
    "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84",
    "tipo": "NORMAL",
    "apuntes": [ { "cuenta": "430", "debe": 121, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 100 }, { "cuenta": "477", "debe": 0, "haber": 21 } ]
  },
  "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84",
  "cifra": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "vista": {
    "cifra": { "id": "A1", "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84", "tipo": "NORMAL", "debe": 121, "haber": 121, "total": 121 },
    "base": { "hechos": [], "apuntes": [ { "cuenta": "430", "debe": 121, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 100 }, { "cuenta": "477", "debe": 0, "haber": 21 } ], "documento_origen": { "id_documento": "..." }, "prueba_disponible": true },
    "origen": { "modulo": "escritor-diario", "regla": null, "contrapartida": null, "asentado_por": "ADMISION", "asentado_en": "2026-09-12T10:00:00.000Z", "traza_inmutable": true, "secuencia_traza": 1 },
    "estado": { "asentado": true, "explicado": true, "cuadra": true, "prueba_disponible": true, "dependencias_no_disponibles": [] }
  },
  "caja_negra": false,
  "determinista": true,
  "dependencias_no_disponibles": [],
  "nota": "TODO asiento/calculo EXPLICADO (cifra, base, origen, estado): no caja negra; el sistema DECLARA lo que no pudo probar"
}
```

Emite `contabilidad.vista_explicada` (res.data + `correlation_id`).

### 2. `explicar` — traza/expediente no disponibles (SE DECLARA)

Si `traza-asiento` (B4) y `expediente-documental` (L7) no responden:

```json
{ "project_id": "e57a318a-...", "asiento": { "id": "A1", "apuntes": [ { "cuenta": "430", "debe": 100, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 100 } ] } }
```

→ `vista.estado.dependencias_no_disponibles: ["traza-asiento","expediente-documental"]`,
`prueba_disponible:false`, `traza_inmutable:false`; **no se inventa** ni la prueba ni la
traza.

### 3. `seleccionar` — muestra por señales duras

```json
{
  "project_id": "e57a318a-...",
  "asientos": [
    { "id": "A1", "clave_natural": "k1", "tipo": "NORMAL", "apuntes": [ { "cuenta": "430", "debe": 5000, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 5000 } ] },
    { "id": "A2", "clave_natural": "k2", "tipo": "NORMAL", "sin_regla": true, "apuntes": [ { "cuenta": "430", "debe": 10, "haber": 0 } ] },
    { "id": "A3", "clave_natural": "k3", "tipo": "NORMAL", "apuntes": [ { "cuenta": "430", "debe": 20, "haber": 0 } ] }
  ],
  "senales": { "umbral_alto_importe": 1000 },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "muestra": [
    { "id": "A1", "clave_natural": "k1", "tipo": "NORMAL", "importe": 5000, "motivos": ["ALTO_IMPORTE"] },
    { "id": "A2", "clave_natural": "k2", "tipo": "NORMAL", "importe": 10, "motivos": ["SIN_REGLA"] }
  ],
  "n": 2,
  "n_conjunto": 3,
  "tasa_muestra": 0.6667,
  "criterios": { "senales_activas": ["ALTO_IMPORTE","SIN_REGLA","CONTRAPARTIDA_NUEVA","CUADRE_DUDOSO"], "umbral_alto_importe": 1000, "umbral_declarado": true },
  "determinista": true,
  "nota": "seleccion por EXCEPCION y MUESTRA (no revisar todo): las senales son DURAS y DECLARADAS, nunca intuicion"
}
```

Emite `contabilidad.muestra_seleccionada` (res.data + `correlation_id`).

### 4. `seleccionar` — sin umbral declarado → ALTO_IMPORTE no actúa

Sin `senales.umbral_alto_importe` ni `umbral_alto_importe` → `criterios.umbral_declarado:false` y
`ALTO_IMPORTE` no marca ningún motivo (A1 del ejemplo no entraría en la muestra).

### 5. Fallo — payload inválido

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `400` + `contabilidad.asiento.explicar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "asiento requerido", "details": { "field": "asiento" } } }
```

### 6. Tools (sin RPC en module.json)

`toolExplicar` → `_explicar`; `toolSeleccionarMuestra` → `_seleccionarMuestra`.

## Tests

El test viviría en `tests/unit/vista-revisable.test.js`. Cubre:

- `explicar` con traza y prueba disponibles → `200`, `caja_negra:false`,
  `vista.origen.traza_inmutable:true`, `vista.estado.prueba_disponible:true`; emite
  `contabilidad.vista_explicada`.
- **Lo que no se pudo probar SE DECLARA**: sin traza/expediente →
  `dependencias_no_disponibles:["traza-asiento","expediente-documental"]`, sin inventar.
- **Determinismo** del muestreo: la MISMA entrada devuelve EXACTAMENTE la MISMA muestra.
- `seleccionar` con `umbral_alto_importe` → `ALTO_IMPORTE` en `motivos`; **sin umbral** →
  `ALTO_IMPORTE` no actúa (`umbral_declarado:false`).
- Señales `SIN_REGLA` / `CONTRAPARTIDA_NUEVA` / `CUADRE_DUDOSO` marcan sus motivos.
- Sin `project_id`/`asiento`/`asientos` → `400 INVALID_INPUT` + par `*.failed`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/vista-revisable
node --test tests/unit/vista-revisable.test.js
```

## Notas de implementación

- Clase `VistaRevisable extends ModuloHibridoReflejo`; `name = 'vista-revisable'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: nada que persistir).
- Constante: `SENALES_POR_DEFECTO = ['ALTO_IMPORTE', 'SIN_REGLA', 'CONTRAPARTIDA_NUEVA',
  'CUADRE_DUDOSO']`.
- `onExplicarRequest`/`onSeleccionarRequest` publican el evento de dominio si `status ===
  200` y el par `*.failed` si no. Ambos delegan en
  `_atender(e, '<op>', 'contabilidad.<...>.response', fn)`.
- Proyecciones puras: `_explicar` (async), `_seleccionarMuestra` (síncrona; hay un wrapper
  `_seleccionarMuestraEntrada`), `_apunteImporte`. `_rpc`, `_invalid`, `_round` vienen de
  la base.
- Tools: `toolExplicar`, `toolSeleccionarMuestra`.
- DEP hacia delante: `contabilidad.muestra_seleccionada` y `contabilidad.vista_explicada`
  alimentan la cara de revisión del asesor. DEP hacia atrás por evento: `traza-asiento`
  (B4) y `expediente-documental` (L7).
