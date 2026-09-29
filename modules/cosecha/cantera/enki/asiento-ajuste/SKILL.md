---
name: asiento-ajuste
description: >
  Skill FULL del módulo PUENTE `asiento-ajuste` de la vertical contabilidad de Enki.
  EL CAMINO POR EL QUE LA CORRECCIÓN DEL ASESOR ENTRA AL LIBRO SIN BORRAR: el ajuste
  SUMA — asiento NUEVO con `rectifica_a`, la base se PRESERVA y la traza queda intacta.
  Úsala para operar, depurar o extender el puente, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites encaminar la corrección del asesor al libro (RPC
    asiento-ajuste.entrar.request).
  - Cuando depures por qué un ajuste no entra (422 PRECONDITION_FAILED si el ajuste no
    cuadra o no trae apuntes, 400 INVALID_INPUT si falta el ajuste).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del puente (la corrección suma, la base se preserva, la traza intacta).
  - Cuando vayas a escribir/ampliar el test unitario del puente asiento-ajuste.
tags: [enki, modulo, puente, contabilidad, asiento-ajuste]
---

# asiento-ajuste — PUENTE STATELESS de la corrección

## Qué hace el módulo

`asiento-ajuste` es un **PUENTE STATELESS** (B5, hoja del plan): **EL CAMINO POR EL QUE
LA CORRECCIÓN DEL ASESOR ENTRA AL LIBRO SIN BORRAR**. **La corrección SUMA**: nunca
sobrescribe ni borra el asiento original (invariante 3). Este módulo **NO almacena** —
el almacén es `escritor-diario` (B2) y `traza-asiento` (B4); aquí solo se **cruza** el
ajuste del asesor hacia el diario.

El ajuste sale como un **asiento NUEVO** con `rectifica_a` (la base se **PRESERVA**,
`base_preservada:true`) y **clave de corrección determinista** (misma corrección sobre
la misma base → misma clave). La corrección **también cuadra** (Σ debe = Σ haber) o se
**rechaza** (`422`).

Invariantes:
- **La corrección SUMA**: el ajuste trae su `base` (asiento original) pero **NUNCA** lo
  reemplaza; se emite como un asiento **NUEVO** con `rectifica_a` (`suma:true`,
  `base_preservada:true`, `original_preservado:true`).
- **La traza queda intacta**: el puente **no toca** la traza (B4); lo declara con
  `traza:{intacta:true, puente:'asiento-ajuste'}`.
- **La ley entra como DATO**: el `motivo`/`criterio` del ajuste es **declarable**, no
  se cablea.
- **Determinista**: el mismo ajuste + misma base → **misma clave de corrección**.

Se dispara con `contabilidad.firma_registrada` (fire-and-forget: firma del asesor) y con
`asiento-ajuste.entrar.request` (RPC); publica `contabilidad.asiento_ajuste_recibido` —
el diario lo **AÑADE**. Sin `PosPersistencia` ni `project.activated` (puente puro).
Proyección `_entrar`. Par de fallo `asiento-ajuste.entrar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `asiento-ajuste.entrar.request` | `onEntrarRequest` | RPC puente: {project_id, ajuste:{apuntes:[{cuenta, debe, haber}], concepto?, fecha?, base?\|rectifica_a?}, base?, motivo?='ajuste_asesor', firmado_por?} → {project_id, ajuste:{tipo:'asiento-ajuste', rectifica_a, base_preservada:true, suma:true, clave_natural, apuntes, ...}, rectifica_a, clave_correccion, original_preservado:true, encaminado}. El ajuste NO sustituye el original: se emite como asiento NUEVO (append-only) con `rectifica_a`. Rechaza (422) si el ajuste no cuadra (Σ debe != Σ haber) o si no trae apuntes. Publica contabilidad.asiento_ajuste_recibido (el diario lo AÑADE) y responde por asiento-ajuste.entrar.response; fallo → asiento-ajuste.entrar.failed. |
| `contabilidad.firma_registrada` | `onFirmaRegistrada` | Fire-and-forget (flujo-firma L3 → B5): la firma del asesor quedó registrada → el ajuste firmado entra al libro por el mismo camino (la corrección SUMA). Requiere {project_id, ajuste}; se ignora si falta alguno. |

### Publishes

| Evento | Descripción |
|---|---|
| `asiento-ajuste.entrar.response` | Respuesta RPC correlada de asiento-ajuste.entrar.request → {request_id, status:200, data:{ajuste, rectifica_a, clave_correccion, suma, original_preservado, encaminado}}. Emitida por el helper _atender. |
| `asiento-ajuste.entrar.failed` | Par de fallo determinista (B5): ajuste sin apuntes o malformado (422), ajuste que no cuadra (422, descuadre de partida doble), ajuste/base ausente (400) → {status, error:{code, message, details?}}. Cierra el círculo de asiento-ajuste.entrar.request. |
| `contabilidad.asiento_ajuste_recibido` | Fire-and-forget (B5 → B2/B4): el ajuste del asesor SALE hacia el libro como asiento de corrección NUEVO → {project_id, ajuste, rectifica_a, clave_correccion, suma:true, correlation_id}. Lo LEEN escritor-diario (B2, que lo AÑADE: la corrección suma) y traza-asiento (B4, que conserva el rastro). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `asiento-ajuste.entrar.failed` cierra el círculo de
> `asiento-ajuste.entrar.request` cuando `_entrar` devuelve status ≠ 200
> (`400`/`422`).

> Nota de honestidad (cruce con `index.js`): `_entrar` **encamina** el ajuste al libro
> publicando `contabilidad.asiento_ajuste_recibido` desde el helper `_encaminar` **antes**
> de devolver, y `onEntrarRequest` lo publica **otra vez** en la rama `status === 200`.
> Es decir, en el camino RPC el evento de dominio sale **dos veces** (una desde
> `_encaminar`, otra desde el handler); el campo `encaminado` de la respuesta refleja si
> el bus estaba disponible (`_encaminar` devuelve `false` si no lo está o si la
> publicación lanza — **se declara, no se oculta**).

> Nota: el fire-and-forget `onFirmaRegistrada` **no** usa `_atender`: toma
> `d.project_id` + `d.ajuste` (se ignora sin ambos), llama a `_entrar({proyecto, ajuste,
> base: d.base || d.asiento_original, motivo: d.motivo || 'firma_asesor', firmado_por:
> d.firmado_por || d.quien})` y devuelve el resultado como acuse (la publicación del
> evento ocurre dentro de `_encaminar`).

> Nota: no figura en `module.json` pero lo implementa `index.js`: `_entrar` acepta el
> alias `input.a` como sinónimo de `input.ajuste` y lee `ajuste.rectifica_a` como base
> cuando no llega `base` explícita.

## Reglas de negocio

1. **La forma se valida primero**: `ajuste` (`input.ajuste || input.a`) debe ser objeto;
   `ajuste.apuntes` debe ser array **no vacío** → si falta o está vacío:
   `422 PRECONDITION_FAILED` con `{motivo:'apuntes_vacios'}`. Un ajuste sin apuntes **no
   corrige nada**.
2. **Cada apunte se normaliza**: debe ser objeto con `cuenta` no vacía y `debe`/`haber`
   numéricos válidos; si no → `422 PRECONDITION_FAILED` (`'apunte de ajuste malformado'`,
   `'apunte de ajuste sin cuenta'` o `'importe de ajuste inválido (debe/haber)'`).
3. **La corrección también cuadra (invariante 1)**: con
   `suma_debe = round(Σ debe, 2)` y `suma_haber = round(Σ haber, 2)`, si
   `|round(suma_debe - suma_haber, 2)| > 0.01` → `422 PRECONDITION_FAILED` con
   `{suma_debe, suma_haber, descuadre, motivo:'descuadre_partida_doble'}`. **La
   corrección también cuadra o es un error.**
4. **La base NUNCA se reemplaza**: `base = input.base || ajuste.base ||
   ajuste.rectifica_a`. `rectifica_a` se deriva a la clave/número de la base (String) o a
   `null` si no hay base. El original se conserva: `base_preservada:true`,
   `original_preservado:true`.
5. **El motivo es declarable (la ley entra como DATO)**:
   `motivo = input.motivo ?? ajuste.motivo ?? 'ajuste_asesor'`;
   `firmado_por = input.firmado_por ?? ajuste.firmado_por ?? null`.
6. **Clave de corrección determinista**:
   `clave_correccion = ['AJUSTE', rectifica_a ?? '', motivo, apuntes.map(a =>
   'cuenta:debe:haber').join(',')].join('|')`. La misma corrección sobre la misma base
   **NO** se duplica. El asiento nuevo la lleva como `clave_natural`.
7. **El asiento de corrección es completo y append-only (para que B2 lo AÑADA)**:
   `{tipo:'asiento-ajuste', rectifica_a, base_preservada:true, suma:true, clave_natural:
   clave_correccion, concepto, fecha, sociedad, motivo, firmado_por, apuntes:
   normalizados, suma_debe, suma_haber, traza:{intacta:true, puente:'asiento-ajuste'}}`.
   `fecha` cae a `new Date().toISOString()` si no se declara; `concepto`/`sociedad` a
   `null` si no llegan.
8. **El puente no escribe el libro**: `_encaminar(pid, asiento, input)` publica
   `contabilidad.asiento_ajuste_recibido` y devuelve `true`; si el bus no está disponible
   o la publicación lanza, devuelve `false` → `encaminado:false`. **No se finge que se
   escribió.**
9. **La traza queda intacta**: el puente no toca `traza-asiento` (B4); el asiento nuevo
   solo declara `traza:{intacta:true}`.
10. **`project_id` tolerante**: `input.project_id || this.project_id || null` — el guard
    de identidad es el ajuste, no el proyecto.
11. **`_num(v)`**: `undefined`/`null`/`''` → `0`; si `Number(v)` no es finito → `null`
    (inválido → `422`).
12. **HTTP exacto**: éxito `200`; ajuste/base ausente/no objeto → `400 INVALID_INPUT`;
    sin apuntes / apunte malformado / descuadre → `422 PRECONDITION_FAILED`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `asiento-ajuste.entrar.response` y emite
`contabilidad.asiento_ajuste_recibido`.

### 1. `entrar` — encaminar la corrección del asesor

```json
{
  "project_id": "e57a318a-...",
  "ajuste": {
    "apuntes": [
      { "cuenta": "629", "debe": 50, "haber": 0 },
      { "cuenta": "400", "debe": 0, "haber": 50 }
    ],
    "concepto": "gasto omitido 2026-08",
    "fecha": "2026-09-30",
    "base": { "clave_natural": "pizzepos:compra:2026-08-01:0001", "numero": 7 }
  },
  "motivo": "ajuste_asesor",
  "firmado_por": "asesor-a",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ajuste": {
    "tipo": "asiento-ajuste",
    "rectifica_a": "pizzepos:compra:2026-08-01:0001",
    "base_preservada": true,
    "suma": true,
    "clave_natural": "AJUSTE|pizzepos:compra:2026-08-01:0001|ajuste_asesor|629:50.00:0.00,400:0.00:50.00",
    "concepto": "gasto omitido 2026-08",
    "fecha": "2026-09-30",
    "sociedad": null,
    "motivo": "ajuste_asesor",
    "firmado_por": "asesor-a",
    "apuntes": [ { "cuenta": "629", "debe": 50, "haber": 0 }, { "cuenta": "400", "debe": 0, "haber": 50 } ],
    "suma_debe": 50,
    "suma_haber": 50,
    "traza": { "intacta": true, "puente": "asiento-ajuste" }
  },
  "rectifica_a": "pizzepos:compra:2026-08-01:0001",
  "clave_correccion": "AJUSTE|pizzepos:compra:2026-08-01:0001|ajuste_asesor|629:50.00:0.00,400:0.00:50.00",
  "suma": true,
  "original_preservado": true,
  "encaminado": true,
  "motivo": "ajuste_asesor"
}
```

Emite `contabilidad.asiento_ajuste_recibido`:

```json
{ "project_id": "e57a318a-...", "ajuste": { "...": "..." }, "rectifica_a": "pizzepos:compra:2026-08-01:0001", "clave_correccion": "AJUSTE|...", "suma": true, "correlation_id": "abc-123" }
```

`escritor-diario` (B2) lo **AÑADE** como asiento nuevo; `traza-asiento` (B4) conserva el
rastro. **El original no se toca.**

### 2. Fire-and-forget — reacción a `contabilidad.firma_registrada`

`onFirmaRegistrada` toma `d.project_id` + `d.ajuste` (sin ambos → `null`), llama a
`_entrar` con `motivo: d.motivo || 'firma_asesor'` y `firmado_por: d.firmado_por ||
d.quien`. El ajuste firmado entra por el **mismo** camino: la corrección **SUMA**.

### 3. Fallo — el ajuste no cuadra

```json
{ "project_id": "e57a318a-...", "ajuste": { "apuntes": [ { "cuenta": "629", "debe": 50, "haber": 0 }, { "cuenta": "400", "debe": 0, "haber": 40 } ] } }
```

Respuesta `422` + `asiento-ajuste.entrar.failed`:

```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "el ajuste no cuadra: suma debe != suma haber (la corrección también cuadra o es un error)", "details": { "suma_debe": 50, "suma_haber": 40, "descuadre": 10, "motivo": "descuadre_partida_doble" } } }
```

### 4. Fallo — ajuste sin apuntes

```json
{ "project_id": "e57a318a-...", "ajuste": { "apuntes": [] } }
```

Respuesta `422` + `asiento-ajuste.entrar.failed`:

```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "un ajuste sin apuntes no corrige nada", "details": { "motivo": "apuntes_vacios" } } }
```

### 5. Fallo — falta el ajuste

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `400` + `asiento-ajuste.entrar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "ajuste requerido", "details": { "field": "ajuste" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/asiento-ajuste.test.js`. Cubre:

- `entrar` con ajuste que cuadra + base → `200`, asiento **NUEVO** con `rectifica_a`,
  `base_preservada:true`, `suma:true`, `original_preservado:true`, `clave_correccion`
  determinista y emite `contabilidad.asiento_ajuste_recibido`.
- Reproducir la misma corrección sobre la misma base → **misma** `clave_correccion`
  (determinismo).
- Ajuste sin apuntes → `422` (`motivo:'apuntes_vacios'`); ajuste que no cuadra → `422`
  (`motivo:'descuadre_partida_doble'`).
- Apunte malformado / sin cuenta / importe inválido → `422`.
- `ajuste` ausente/no objeto → `400 INVALID_INPUT`; `project_id` ausente → `400`.
- `onFirmaRegistrada` encamina el ajuste firmado; sin `project_id`/`ajuste` → `null`.
- `encaminado:false` se declara si el bus no está disponible (no se finge la escritura).
- `toolEntrar` devuelve la misma proyección que `_entrar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AsientoAjuste extends ModuloHibridoReflejo`; `name = 'asiento-ajuste'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin
  `onProjectActivated` (PUENTE stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/asiento-ajuste/`).
- `onEntrarRequest` usa `this._atender(e, 'entrar',
  'asiento-ajuste.entrar.response', async (d) => {...})`; dentro hace el cierre de
  círculo: en `200` publica `contabilidad.asiento_ajuste_recibido`, si no
  `asiento-ajuste.entrar.failed`. `onFirmaRegistrada` **no** usa `_atender`.
- Proyección única `_entrar(input)` → `{status, data}`; helper `_encaminar(pid, asiento,
  input)` (publica el evento de dominio, devuelve booleano) y `_num(v)`. Tool
  `toolEntrar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo dispara `flujo-firma` (L3) vía `contabilidad.firma_registrada`; lo LEEN
  `escritor-diario` (B2) y `traza-asiento` (B4) vía `contabilidad.asiento_ajuste_recibido`.
  Es el único camino por el que se reabre un cierre (`cierre-ejercicio` C4 lo consulta
  por evento).
