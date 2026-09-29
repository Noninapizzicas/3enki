---
name: informe-conciliacion
description: >
  Skill FULL del módulo REFLEJO `informe-conciliacion` de la vertical contabilidad de Enki.
  El DOCUMENTO DE CUADRE: saldo del banco ↔ saldo contable ajustado, la PRUEBA de que cuadra.
  Compone el informe de lo que YA existe (el cruce de E1, las partidas en tránsito de E9 y el
  saldo contable de saldo-tesoreria, POR EVENTO) y DECLARA si la igualdad se cumple — DERIVA,
  no decide. Sin estado. Úsala para operar, depurar o extender el reflejo, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites componer el informe de conciliación de un periodo (RPC
    informe-conciliacion.componer.request).
  - Cuando depures por qué el informe sale `emitido:false` (falta cruce, partidas o algún saldo),
    por qué `cuadra:null`, o por qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (deriva sin decidir, determinista, dato ausente = desconocido, no corrige el descuadre).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo informe-conciliacion.
tags: [enki, modulo, reflejo, contabilidad, informe-conciliacion]
---

# informe-conciliacion — REFLEJO del documento de cuadre

## Qué hace el módulo

`informe-conciliacion` es un **REFLEJO STATELESS** (E10, hoja del plan): el **DOCUMENTO DE
CUADRE** — **saldo del banco ↔ saldo contable AJUSTADO**. La **PRUEBA** de que cuadra. **Compone
el informe a partir de lo que YA existe** — **NO lo produce de la nada**:

- el **CRUCE** extracto↔diario (`conciliacion-bancaria` E1) **POR EVENTO**,
- las **PARTIDAS EN TRÁNSITO** que explican el desfase (`partida-conciliatoria` E9) **POR EVENTO**,
- el **SALDO CONTABLE** (`saldo-tesoreria`) **POR EVENTO**, si está disponible.

**DERIVA, NO DECIDE** (invariante): este reflejo **NO** cierra la conciliación, **NO** ajusta el
saldo, **NO** asienta nada y **NO** juzga si el descuadre es aceptable. Se limita a
`saldo_banco + partidas_en_transito = saldo_contable_ajustado` y a **DECLARAR** si la igualdad se
cumple (`cuadra:true|false`) y de cuánto es la diferencia. **Un descuadre NO se corrige aquí**: se
declara y su resolución queda en la cola del humano.

Invariantes:

- **DETERMINISTA**: mismas fuentes → mismo informe (una sola respuesta correcta).
- **Dato ausente = desconocido**: sin cruce, sin partidas o sin saldo contable **NO se estima** el
  informe; se declara que falta la fuente (`fuentes.<x>_disponible:false`) y el informe queda
  `emitido:false`. **Jamás** se rellena un saldo con `0` ni con un valor por defecto.
- **NO escribe, NO persiste, NO muta**: E1 cierra el cruce, E9 compone las partidas.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_componer`.
Cierra el círculo de error con `informe-conciliacion.componer.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `informe-conciliacion.componer.request` | `onComponerRequest` | RPC reflejo (calculo puro, determinista, deriva sin decidir): {project_id, periodo?, cruce?, partidas?, saldo_banco?, saldo_contable?, cuenta?} → {project_id, periodo, tipo:'informe-conciliacion', emitido, cuadra, diferencia, saldo_banco, saldo_contable, partidas_en_transito, suma_transito, saldo_contable_ajustado, fuentes:{cruce_disponible, partidas_disponible, saldo_disponible, fuente_cruce, fuente_partidas, fuente_saldo}, deriva_de:[...], abierto:{saldo_banco, saldo_contable, cruce, partidas, descuadre}}. El cruce se pide a conciliacion-bancaria (E1), las partidas a partida-conciliatoria (E9) y el saldo contable a saldo-tesoreria, TODOS POR EVENTO. Sin las fuentes suficientes el informe no se emite (emitido:false) y lo ausente NO se estima. Responde por informe-conciliacion.componer.response; project_id ausente → informe-conciliacion.componer.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `informe-conciliacion.componer.response` | Respuesta RPC correlada de informe-conciliacion.componer.request → {request_id, status:200, data:{emitido, cuadra, diferencia, saldo_banco, saldo_contable_ajustado, partidas_en_transito, fuentes, abierto}}. Emitida por el helper _atender. |
| `informe-conciliacion.componer.failed` | Par de fallo determinista (E10): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de informe-conciliacion.componer.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `informe-conciliacion.componer.failed` cierra el círculo de
> `informe-conciliacion.componer.request` cuando `_componer` devuelve status ≠ 200 (el único
> camino: `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onComponerRequest` publica el par `failed` **solo
> si `res.status !== 200`**; el camino de éxito lo cierra `_atender` con
> `informe-conciliacion.componer.response`. Un informe **no emitido** (`emitido:false`) sigue
> siendo un `200` y **NO** emite `failed`.

> Nota de sub-declaración (cruce con `index.js`): **no está en `module.json` pero sí lo emite
> `index.js` en `_cruce`/`_partidas`/`_saldo`** las tres RPC salientes
> `conciliacion-bancaria.cruzar.request`, `partida-conciliatoria.desfase.request` y
> `saldo-tesoreria.calcular.request` (todas `timeout_ms:4000`) — son **DEP por evento**, no
> eventos emitidos.

> Nota: el módulo expone `toolComponer(params)` como **tool directa** (misma proyección
> `_componer`) — no es un evento del bus, no figura en `module.json`. Tampoco figuran `_num` ni
> `_round` (utilidades internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Único error duro.
2. **El período es una etiqueta**: `periodo = input.periodo != null ? String(input.periodo) :
   null`.
3. **Las tres fuentes se resuelven por separado**, cada una declarando su `fuente_*`:
   - **CRUCE** (`_cruce`): `input.cruce` objeto → `'declarado'`; si no, RPC a E1 → `'conciliacion-bancaria'`;
     si no llega → `{cruce:null, fuente_cruce:null}` (`cruce_disponible:false`).
   - **PARTIDAS** (`_partidas`): `input.partidas` array → `'declaradas'`; si no, RPC a E9
     (`partida-conciliatoria.desfase.request` con el cruce) buscando `data.partidas` array →
     `'partida-conciliatoria'`; si no → `{partidas:null, fuente_partidas:null}`
     (`partidas_disponible:false`).
   - **SALDO CONTABLE** (`_saldo`): `input.saldo_contable` declarado → `'declarado'`; si no, RPC
     `saldo-tesoreria.calcular.request` buscando `data.saldo` → `'saldo-tesoreria'`; si no →
     `{saldo_contable:null, saldo_disponible:false, fuente_saldo:null}`.
4. **El SALDO DEL BANCO lo declara el extracto/cruce o la petición. No se deduce**:
   `input.saldo_banco` → si no `input.saldo_extracto` → si no `cruce.saldo_banco` → si no `null`.
5. **La ADICIÓN del tránsito** (`suma_transito`): suma de `importe` de las partidas, redondeada a
   2; es `null` si no hay partidas.
6. **Saldo contable ajustado**: `saldo_contable + suma_transito` redondeado a 2, **solo si ambos
   existen**; si falta uno → `null` (**no se estima**).
7. **La PRUEBA** (`cuadra`/`diferencia`): comparable solo si `saldo_banco` y
   `saldo_contable_ajustado` existen; `diferencia = saldo_banco − saldo_contable_ajustado` (a 2);
   `cuadra = (diferencia === 0)`; sin comparables → ambos `null`. **No se decide nada**: se declara.
8. **`emitido` exige las fuentes suficientes**: `cruce_disponible && partidas_disponible &&
   saldo_banco !== null && saldo_contable !== null`. Si no, `emitido:false` y lo ausente se
   declara en `abierto` (**nada se estima**).
9. **`deriva_de` se declara**: `['conciliacion-bancaria', 'partida-conciliatoria', 'saldo-tesoreria']`.
10. **`abierto` declara lo que falta**: `saldo_banco`, `saldo_contable`, `cruce`, `partidas` (cada
    uno con texto si falta) y `descuadre` (texto si `cuadra === false`: «la conciliacion NO cuadra:
    la diferencia se declara y su resolucion es de la cola del humano»). Un descuadre **no se
    corrige aquí**.
11. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
12. **HTTP exacto**: éxito `200` (con `emitido` true o false); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `informe-conciliacion.componer.response`; el error cierra con
`informe-conciliacion.componer.failed`.

### 1. `componer` — con todas las fuentes declaradas

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "cruce": { "saldo_banco": 15800.5, "sin_contrapartida": [] },
  "partidas": [ { "lado": "banco", "importe": 1200 }, { "lado": "contabilidad", "importe": 850 } ],
  "saldo_contable": 17850.5,
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "tipo": "informe-conciliacion",
  "emitido": true,
  "cuadra": true,
  "diferencia": 0,
  "saldo_banco": 15800.5,
  "saldo_contable": 17850.5,
  "partidas_en_transito": [ { "lado": "banco", "importe": 1200 }, { "lado": "contabilidad", "importe": 850 } ],
  "suma_transito": 2050,
  "saldo_contable_ajustado": 19900.5,
  "fuentes": { "cruce_disponible": true, "partidas_disponible": true, "saldo_disponible": true, "fuente_cruce": "declarado", "fuente_partidas": "declaradas", "fuente_saldo": "declarado" },
  "deriva_de": [ "conciliacion-bancaria", "partida-conciliatoria", "saldo-tesoreria" ],
  "abierto": { "saldo_banco": null, "saldo_contable": null, "cruce": null, "partidas": null, "descuadre": null }
}
```

### 2. Sin todas las fuentes — el informe NO se emite

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09", "saldo_banco": 15800.5 }
```

Si E1/E9/`saldo-tesoreria` no responden y no hay declaración → `200` con `emitido:false`,
`cuadra:null`, `diferencia:null`, `saldo_contable_ajustado:null` y
`abierto.saldo_contable:'saldo-tesoreria no respondio: no se estima el saldo contable'`,
`abierto.cruce:'E1 (conciliacion-bancaria) no respondio'`,
`abierto.partidas:'E9 (partida-conciliatoria) no respondio'`. **Nada se rellena con 0.**

### 3. Informe con descuadre — se declara, no se corrige

Con `saldo_banco = 15800.5` y `saldo_contable_ajustado = 19900.5` → `cuadra:false`,
`diferencia:-4100`, y `abierto.descuadre:'la conciliacion NO cuadra: la diferencia se declara y su
resolucion es de la cola del humano'`. **El reflejo no ajusta el saldo.**

### 4. Fallo — falta `project_id`

Respuesta `400` + `informe-conciliacion.componer.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/informe-conciliacion.test.js`. Cubre:

- `componer` con cruce + partidas + ambos saldos → `200 emitido:true`, `cuadra`/`diferencia`
  coherentes, `suma_transito` y `saldo_contable_ajustado` calculados.
- El cruce se pide a E1, las partidas a E9 y el saldo a `saldo-tesoreria` **por evento** cuando no
  llegan declarados, declarando `fuente_*`.
- Alguna fuente ausente → `emitido:false` y `abierto.<x>` con el texto (**no se estima**; ningún
  saldo se rellena con `0`).
- Descuadre → `cuadra:false`, `diferencia` declarada y `abierto.descuadre` presente (**no se
  corrige**).
- `deriva_de` = `['conciliacion-bancaria','partida-conciliatoria','saldo-tesoreria']`.
- `project_id` ausente → `400 INVALID_INPUT` + `.componer.failed`.
- **NO ESCRIBE**: ninguna llamada persiste ni muta (stateless).
- `toolComponer` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `InformeConciliacion extends ModuloHibridoReflejo`; `name = 'informe-conciliacion'`,
  `version = 'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/informe-conciliacion/`).
- `onComponerRequest` usa `this._atender(e, 'componer', 'informe-conciliacion.componer.response',
  async (d) => {...})` con cierre de círculo (par `failed` si `status !== 200`).
- Proyección `_componer(input)` (**async**: pide E1/E9/`saldo-tesoreria` por evento); helpers
  `_cruce`, `_partidas`, `_saldo`, `_num`. Tool `toolComponer`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- DEP: **pide** `conciliacion-bancaria.cruzar.request` (E1),
  `partida-conciliatoria.desfase.request` (E9) y `saldo-tesoreria.calcular.request`, todas por
  EVENTO. Lo consume la cola del humano y la auditoría del cuadre.
- **DERIVA, NO DECIDE**: el informe es la **PRUEBA** de que cuadra; el descuadre se **declara** y
  su resolución es del humano. El reflejo no ajusta saldos ni asienta.
