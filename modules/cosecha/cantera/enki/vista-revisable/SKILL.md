---
name: vista-revisable
description: >
  Skill FULL del módulo REFLEJO `vista-revisable` de la vertical contabilidad de Enki.
  LA SALIDA LEGIBLE Y REVISABLE, NO CAJA NEGRA: muestra cada asiento CON su origen — la
  composición determinista de la traza (quién lo creó, cuándo y por qué) de traza-asiento
  (B4) — junto con sus apuntes y sus datos declarados. Deriva, no decide: no juzga, no
  corrige, no firma y no recalcula las sumas. Sin estado. Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites explicar un asiento con su procedencia (RPC
    vista-revisable.explicar.request).
  - Cuando depures por qué `traza_disponible:false` (la traza B4 no respondió — no se
    inventa la autoría), por qué `suma_debe`/`suma_haber` salen null (la vista no recalcula)
    o por qué falla (400 INVALID_INPUT si falta project_id o asiento).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    de la vista (muestra con origen, sin caja negra, no recalcula, no firma).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo vista-revisable.
tags: [enki, modulo, reflejo, contabilidad, vista-revisable]
---

# vista-revisable — REFLEJO STATELESS de la vista con procedencia

## Qué hace el módulo

`vista-revisable` es un **REFLEJO STATELESS** (L2, hoja del plan): **LA SALIDA LEGIBLE Y
REVISABLE. NO CAJA NEGRA.** Muestra cada asiento y cada cálculo **CON su ORIGEN**: la
composición determinista de la **TRAZA** (`traza-asiento` B4) — **quién** lo creó, **cuándo**
y **por qué** — junto con sus **apuntes** y sus **datos declarados**. El **ASESOR revisa** lo
que ve, con su **procedencia a la vista**.

**DERIVA, NO DECIDE**: este reflejo **NO juzga** si un asiento está bien, **NO lo corrige**,
**NO lo firma** (eso es de `flujo-firma` L3) y **NO conserva la prueba** (eso es de
`expediente-documental` L7). Solo **EXPLICA** lo que ya existe, leyendo la traza **POR
EVENTO**. Si la traza no está disponible, se declara `traza_disponible:false` y se explica lo
que sí se sabe — **jamás se inventa la autoría**.

Invariantes:

- **DETERMINISTA**: mismo asiento + misma traza → misma explicación.
- **Dato ausente = desconocido**: sin traza **NO** se afirma quién ni cuándo; se declara
  ABIERTO.
- **NO escribe, NO persiste, NO muta**: L2 **EXPLICA**; el expediente (L7) **CONSERVA**.
- **Sin caja negra**: toda cifra que se muestra viaja con su **procedencia declarada**.
- **La vista NO recalcula las sumas**: las muestra si el asiento las trae.
- **Es una VISTA BAJO DEMANDA, no un acumulador**: no guarda nada (es stateless).
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `vista-revisable.explicar.request` | `onExplicarRequest` | RPC reflejo (composicion pura, determinista): {project_id, asiento:{numero?, clave_natural?, fecha?, sociedad?, concepto?, apuntes?, suma_debe?, suma_haber?, cuadra?, traza?}, numero?, periodo?, traza?} → {project_id, tipo:'vista-revisable', emitida:true, explicacion:{numero, clave_natural, fecha, sociedad, concepto, apuntes, suma_debe, suma_haber, cuadra, descuadre, traza, origen:{traza_disponible, fuente_traza, quien, cuando, motivo, origen_asiento}}, procedencia:{apuntes, sumas, traza}, revisable_por:'asesor (flujo-firma L3)', firmada:false, deriva_de, abierto:{traza, sumas}}. La traza se recibe declarada o se PIDE a traza-asiento (B4) POR EVENTO; sin traza NO se inventa la autoria. La vista NO recalcula las sumas. Responde por vista-revisable.explicar.response; asiento o project_id ausente → vista-revisable.explicar.failed. |
| `contabilidad.traza_registrada` | `onTrazaRegistrada` | Fire-and-forget (B4 → L2): traza-asiento publico que una marca quedo registrada → la vista quedara desactualizada; se anota en el log (sin guardar nada: L2 es stateless). Tolerante: sin project_id se ignora. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → L2): escritor-diario publico que un asiento quedo registrado → la vista quedara desactualizada; se anota en el log (sin guardar nada: L2 es stateless). Tolerante: sin project_id se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `vista-revisable.explicar.response` | Respuesta RPC correlada de vista-revisable.explicar.request → {request_id, status:200, data:{emitida, explicacion, procedencia, revisable_por, firmada:false, deriva_de, abierto}}. Emitida por el helper _atender. |
| `vista-revisable.explicar.failed` | Par de fallo determinista (L2): project_id o asiento ausente → {status, error:{code, message, details?}}. Cierra el circulo de vista-revisable.explicar.request y de las señales B2/B4. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `vista-revisable.explicar.failed` cierra el círculo de
> `vista-revisable.explicar.request` cuando `_explicar` devuelve status ≠ 200 (`400`,
> `project_id` o `asiento` ausente).

> Nota: los fire-and-forget `onTrazaRegistrada` y `onAsientoRegistrado` **no** usan
> `_atender`: delegan en `_senal(evento, e)`, que **solo registra un `logger.info`** de que
> la vista quedó desactualizada y devuelve `null`. **No guardan nada** (L2 es stateless), no
> publican evento de dominio y no tienen par `failed` (no son peticiones). Sin `project_id`
> → `null`.

## Reglas de negocio

1. **El asiento es obligatorio**: `input.asiento` debe ser objeto; ausente o no objeto →
   `400 INVALID_INPUT` (`field:'asiento'`). Sin asiento no hay nada que explicar.
2. **`numero`/`clave_natural` con fallback**: `numero = asiento.numero` o `input.numero`;
   `clave_natural = asiento.clave_natural` o `null`.
3. **Los APUNTES se muestran tal cual**: `apuntes` es un array mapeado a
   `{cuenta, debe, haber}` (cada campo cae a `null` si falta). **La vista no los recalcula ni
   los completa.**
4. **Las SUMAS SOLO si el asiento las trae**: `suma_debe` / `suma_haber` = el valor declarado
   en el asiento o `null`. **No se recomputan** (una vista no reescribe el libro). `cuadra` y
   `descuadre` también se copian del asiento o `null`.
5. **La TRAZA (B4) se lee POR EVENTO, en orden**: (a) `input.traza` objeto →
   `fuente_traza:'declarada'`; (b) `asiento.traza` objeto → `fuente_traza:'asiento'`; (c)
   `_rpc('traza-asiento.consultar.request', {project_id, numero, clave_natural, asiento},
   {timeout_ms:4000})` → `marca` (o la última de `marcas`) con `fuente_traza:'traza-asiento'`.
   Sin respuesta → `marca:null`, `traza_disponible:false`, `fuente_traza:null`. **NO se
   inventa la autoría.**
6. **El ORIGEN es el corazón de la vista**: `origen:{traza_disponible, fuente_traza, quien,
   cuando, motivo, origen_asiento}`. `quien`/`cuando`/`motivo` salen de la marca (o `null`);
   `origen_asiento` es `'asiento'` si el asiento traía su traza, `'traza-asiento'` si vino de
   B4, o `null`.
7. **`procedencia` declara de dónde sale cada cosa**: `apuntes` → «declarados en el asiento
   (no recalculados)»; `sumas` → «declaradas en el asiento (no recalculadas)» o «el asiento
   no trae las sumas: la vista NO las recalcula»; `traza` → «traza-asiento (B4)» o «la traza
   no está disponible: no se inventa la autoría».
8. **`emitida:true` siempre que haya asiento**: explicar es su razón de ser. Y
   `firmada:false`, `revisable_por:'asesor (flujo-firma L3)'` — **la vista no firma**.
9. **`deriva_de` declara sus fuentes**: `['escritor-diario (B2)', 'traza-asiento (B4)']`.
10. **`abierto`: qué falta se declara**: `traza` (B4 no respondió: no se afirma quién ni
    cuándo) y `sumas` (el asiento no las trae y la vista no las recalcula).
11. **`periodo` declarable**: `input.periodo` o `null`.
12. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
13. **Puro**: no escribe, no persiste, no muta; sin reloj salvo el implícito, sin azar.
14. **HTTP exacto**: éxito `200`; `project_id` o `asiento` ausente → `400`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `vista-revisable.explicar.response`. **No emite evento de dominio.**

### 1. `explicar` — asiento con traza declarada

```json
{
  "project_id": "e57a318a-...",
  "asiento": {
    "numero": 1,
    "clave_natural": "pizzepos:venta:2026-09-01:0001",
    "fecha": "2026-09-01",
    "concepto": "venta mostrador",
    "apuntes": [ { "cuenta": "430", "debe": 121.5, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 100 } ],
    "suma_debe": 121.5,
    "suma_haber": 100,
    "cuadra": false
  },
  "traza": { "quien": "escritor-a", "cuando": "2026-09-25T...:00.000Z", "motivo": "creacion" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": null,
  "tipo": "vista-revisable",
  "emitida": true,
  "explicacion": {
    "numero": 1,
    "clave_natural": "pizzepos:venta:2026-09-01:0001",
    "fecha": "2026-09-01",
    "sociedad": null,
    "concepto": "venta mostrador",
    "apuntes": [ { "cuenta": "430", "debe": 121.5, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 100 } ],
    "suma_debe": 121.5,
    "suma_haber": 100,
    "cuadra": false,
    "descuadre": null,
    "traza": { "quien": "escritor-a", "cuando": "2026-09-25T...:00.000Z", "motivo": "creacion" },
    "origen": { "traza_disponible": true, "fuente_traza": "declarada", "quien": "escritor-a", "cuando": "2026-09-25T...:00.000Z", "motivo": "creacion", "origen_asiento": "traza-asiento" }
  },
  "procedencia": {
    "apuntes": "declarados en el asiento (no recalculados)",
    "sumas": "declaradas en el asiento (no recalculadas)",
    "traza": "traza-asiento (B4)"
  },
  "revisable_por": "asesor (flujo-firma L3)",
  "firmada": false,
  "deriva_de": ["escritor-diario (B2)", "traza-asiento (B4)"],
  "abierto": { "traza": null, "sumas": null }
}
```

### 2. `explicar` — sin traza (no se inventa la autoría)

```json
{ "project_id": "e57a318a-...", "asiento": { "numero": 2, "fecha": "2026-09-02", "apuntes": [] } }
```

Respuesta `200`: `traza:null`, `origen.traza_disponible:false`, `origen.fuente_traza:null`,
`procedencia.traza:'la traza no esta disponible: no se inventa la autoria'`,
`abierto.traza` declarado, `abierto.sumas` declarado. **No se afirma quién ni cuándo.**

### 3. `explicar` — traza pedida por evento a `traza-asiento` (B4)

Sin traza declarada ni en el asiento, la vista hace
`traza-asiento.consultar.request`; con `marca` en la respuesta →
`origen.fuente_traza:'traza-asiento'`.

### 4. Fire-and-forget — señales B2/B4

`onTrazaRegistrada` (`contabilidad.traza_registrada`) y `onAsientoRegistrado`
(`contabilidad.asiento_registrado`) llaman a `_senal(evento, e)`, que **solo loguea** que la
vista quedó desactualizada y devuelve `null`. **No guardan nada** (stateless); sin
`project_id` → `null`.

### 5. Fallo — falta el asiento

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `400` + `vista-revisable.explicar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "asiento requerido", "details": { "field": "asiento" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/vista-revisable.test.js`. Cubre:

- `explicar` con asiento + traza declarada → `200 emitida:true`, `origen.traza_disponible:true`,
  `firmada:false`, `revisable_por:'asesor (flujo-firma L3)'`.
- **Sin traza** (ni declarada, ni en el asiento, ni B4 responde) → `traza_disponible:false`,
  `origen.quien:null`, `abierto.traza` declarado (**no se inventa la autoría**).
- Traza en el asiento → `fuente_traza:'asiento'`, `origen_asiento:'asiento'`.
- Traza pedida **por evento** a `traza-asiento` (B4) → `fuente_traza:'traza-asiento'`.
- **La vista NO recalcula las sumas**: `suma_debe`/`suma_haber` solo salen si el asiento las
  trae; si no → `null` + `abierto.sumas`.
- **Determinismo**: mismo asiento + misma traza → misma explicación.
- `onTrazaRegistrada` / `onAsientoRegistrado` devuelven `null` y **no mutan**; sin
  `project_id` → `null`.
- `project_id` o `asiento` ausente → `400 INVALID_INPUT` + `vista-revisable.explicar.failed`.
- `toolExplicar` devuelve la misma proyección que `_explicar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `VistaRevisable extends ModuloHibridoReflejo`; `name = 'vista-revisable'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/vista-revisable/`; es de la vertical **libro**).
- `onExplicarRequest` usa `this._atender(e, 'explicar', 'vista-revisable.explicar.response',
  async (d) => {...})` y publica el par `failed` si `status !== 200`. `onTrazaRegistrada` /
  `onAsientoRegistrado` **no** usan `_atender`.
- Proyección `_explicar(input)` (`async`: pide la traza por evento) → `{status, data}`;
  helpers `_senal`, `_traza`. Tool `toolExplicar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide la traza a `traza-asiento.consultar.request` (B4) **por evento** (best-effort);
  observa `contabilidad.traza_registrada` (B4) y `contabilidad.asiento_registrado` (B2) como
  señales tolerantes; lo revisa el asesor vía `flujo-firma` (L3); la prueba la conserva
  `expediente-documental` (L7).
- **SIN CAJA NEGRA**: toda cifra mostrada lleva su `procedencia` declarada.
- **EXPLICA, NO JUZGA, NO FIRMA, NO RECALCULA**: L2 solo muestra.
