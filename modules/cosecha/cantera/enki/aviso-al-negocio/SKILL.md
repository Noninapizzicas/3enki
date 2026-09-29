---
name: aviso-al-negocio
description: >
  Skill FULL del módulo PUENTE `aviso-al-negocio` de la vertical contabilidad de Enki.
  LA CARA DE ENTREGA: el aviso ENTREGADO y CONFIRMADO al negocio cliente. COMPLETA
  `motor-avisos` (K2), que solo PRODUCE el aviso — aquí se ENTREGA por el canal
  declarable y se CONFIRMA la entrega (requisito del dueño: «información rica que
  avise»). La clave: entrega ≠ recepción — el aviso vale por LLEGAR. Entrega, NO
  decide; JAMÁS se afirma entregado sin confirmación del canal. Úsala para operar,
  depurar o extender el puente, o para entender su contrato de eventos y sus reglas
  de negocio.
when-to-use: >
  - Cuando necesites entregar (y confirmar) un aviso al negocio cliente (RPC
    aviso-al-negocio.entregar.request).
  - Cuando depures por qué sale `entregado:false` (sin canal declarado, o el canal no
    confirmó la entrega), o por qué falta `project_id`/`aviso` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del puente (entrega no decide, el canal es declarable, jamás entregado
    sin confirmación, sin estado) y su relación con `motor-avisos` (K2) vía
    `contabilidad.aviso_producido` / `contabilidad.aviso_entregado`.
  - Cuando vayas a escribir/ampliar el test unitario del puente aviso-al-negocio.
tags: [enki, modulo, puente, contabilidad, aviso-al-negocio]
---

# aviso-al-negocio — PUENTE de la entrega del aviso al negocio

## Qué hace el módulo

`aviso-al-negocio` es un **PUENTE STATELESS** (R1, hoja del plan): **LA CARA DE ENTREGA** —
el **aviso ENTREGADO y CONFIRMADO** al **negocio cliente**. **COMPLETA `motor-avisos` (K2)**,
que solo **PRODUCE** el aviso: aquí se **ENTREGA** por el canal y se **CONFIRMA** la entrega
(requisito del dueño: *«información rica que **avise**»*).

Atributos del diseño: `canal:ParametroDeclarable`.
Método: `entregar(a:Aviso):Confirmacion`.

> 🔴 **ENTREGA ≠ RECEPCIÓN — el aviso vale por LLEGAR.** Producir un aviso no basta: hay que
> **entregarlo por el canal** y **obtener la confirmación del canal**. Si el canal no confirma,
> el aviso **NO se declara entregado** (`entregado:false`, `confirmado:false`). **JAMÁS se
> afirma entregado sin confirmación.**

Invariantes:

- **ENTREGA, NO DECIDE**: **no decide** qué avisar, a quién ni por qué canal — eso ya viene
  decidido en el **Aviso** (K2 + catálogo K6). Aquí se **ENVÍA** por el canal y se devuelve la
  confirmación (`decide:false`).
- **EL CANAL ES DECLARABLE** (`ParametroDeclarable`): **sin canal declarado NO se inventa un
  canal**; el aviso queda `entregado:false` con el hueco declarado (`faltan:['canal']`).
- **LA ENTREGA ES POR EL CANAL**: se emite por el canal declarado **POR EVENTO**
  (`telegram.send_message.request` / `email.send.request` / `push.send.request` /
  `motor-avisos.producir.request`); si el canal no confirma → `entregado:false` y
  `confirmado:false`.
- **Sin estado**: un puente. **No recuerda** avisos.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única
`_entregar`. Consume `contabilidad.aviso_producido` (K2, fire-and-forget) y publica
`contabilidad.aviso_entregado`. Cierra el círculo con `aviso-al-negocio.entregar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `aviso-al-negocio.entregar.request` | `onEntregarRequest` | RPC puente: {project_id, aviso:{id, tipo, asunto, motivo, destino, canal, detalle}, aviso_id?, canal?, destino?} → {aviso_id, aviso, confirmacion:{entregado, confirmado, canal, canal_evento, destino, id_mensaje, entregado_en, motivo}, decide:false, completa_a:'motor-avisos (K2)', abierto, faltan}. Entrega el aviso por el canal declarable (POR EVENTO: telegram/email/push) y devuelve la CONFIRMACION; sin canal declarado → entregado:false con el hueco (no inventa canal); sin confirmacion del canal → entregado:false. Exito → publica contabilidad.aviso_entregado y responde por aviso-al-negocio.entregar.response; aviso/project_id ausente → aviso-al-negocio.entregar.failed. |
| `contabilidad.aviso_producido` | `onAvisoProducido` | Fire-and-forget (K2 → R1): motor-avisos publicó un Aviso PRODUCIDO (con su tipo, motivo, destino y canal) → se ENTREGA y se CONFIRMA al negocio. Tolerante: sin project_id se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `aviso-al-negocio.entregar.response` | Respuesta RPC correlada de aviso-al-negocio.entregar.request → {request_id, status:200, data:{aviso_id, confirmacion:{entregado, confirmado, canal, id_mensaje}, decide:false, abierto, faltan}}. Emitida por el helper _atender. |
| `aviso-al-negocio.entregar.failed` | Par de fallo determinista (R1): aviso o project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de aviso-al-negocio.entregar.request. |
| `contabilidad.aviso_entregado` | Fire-and-forget (R1): un aviso quedo ENTREGADO (y confirmado) al negocio cliente por el canal declarado → {project_id, aviso_id, confirmacion, entregado, canal, correlation_id}. Es la confirmacion de entrega que motor-avisos (K2) NO podía dar (el solo PRODUCE). Lo consume el cuadro de mando (J8) y la operacion. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `aviso-al-negocio.entregar.failed` cierra el círculo de
> `aviso-al-negocio.entregar.request` cuando `_entregar` devuelve status ≠ 200
> (`400 INVALID_INPUT` por `project_id` **o** `aviso` ausentes).

> Nota de honestidad (cruce con `index.js`): `onEntregarRequest` publica
> `contabilidad.aviso_entregado` **siempre que `_entregar` devuelve `200`** — lo que **incluye**
> la vía **sin canal declarado** (`entregado:false`) y la vía **canal que no confirma**
> (`entregado:false`); el evento viaja con `entregado` tal cual (`false` en esos casos). El
> consumidor debe mirar `entregado`/`confirmacion`. La rama `else` publica
> `aviso-al-negocio.entregar.failed`.

> Nota de sub-declaración (cruce con `index.js`): los canales de entrega **no** figuran como
> eventos en `module.json` pero `index.js` los **emite** por EVENTO en la constante `CANALES`
> (son **DEP por evento**, el canal declarable): `telegram.send_message.request`,
> `email.send.request`, `push.send.request`, `motor-avisos.producir.request` — vía `_rpc(...,
> {timeout_ms:8000})`.

> Nota: el módulo expone `toolEntregar(params)` como **tool directa** (misma proyección
> `_entregar`) — no es un evento del bus. Tampoco figuran `_canal`, `_texto` (internos) ni la
> constante `CANALES` en el `module.json`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **El AVISO es obligatorio**: `input.aviso` debe ser objeto; ausente/no objeto →
   `400 INVALID_INPUT` (`field:'aviso'`).
3. **`aviso_id`**: `input.aviso_id` (string) o `aviso.id` (string) o `null`.
4. **El CANAL es `ParametroDeclarable`** (`_canal`): se resuelve de `input.canal` (si no es
   `null`) o `aviso.canal`; se normaliza a minúsculas. El mapa `CANALES` fija la **identidad**
   de cada canal (**no** criterio de negocio):
   - `telegram` → `telegram.send_message.request`.
   - `email` → `email.send.request`.
   - `push` → `push.send.request`.
   - `motor` → `motor-avisos.producir.request`.
   Un valor desconocido o vacío → `null`. **Sin canal NO se inventa uno.**
5. **SIN CANAL DECLARADO** → `200` con
   `confirmacion:{entregado:false, confirmado:false, canal:null, motivo:'el canal no esta
   declarado: el puente ENTREGA, no inventa por donde'}`, `abierto:true`, `faltan:['canal']`,
   `decide:false`. **No se inventa por dónde.**
6. **LA ENTREGA** (`_rpc` al `canal.evento`, `timeout_ms:8000`) con
   `{project_id, aviso, aviso_id, destino:<input.destino ?? aviso.destino>, texto:<_texto(aviso)>,
   canal:<canal.canal>}`. **`_texto`** compone `«<asunto>: <motivo>»` (o solo el asunto si no hay
   motivo; `'aviso'` si no hay asunto).
7. **La CONFIRMACIÓN**: `entregado` es `true` **solo si** la respuesta del canal cumple
   `data.entregado === true` **o** `data.sent === true` **o** `data.status === 200` **o**
   `data.ok === true`; si `_rpc` falla, se captura a `null` → `entregado:false`. **JAMÁS
   entregado sin confirmación del canal.**
8. **La `confirmacion`**: `{entregado, confirmado:<== entregado>, canal:<canal.canal>,
   canal_evento:<canal.evento>, destino:<input.destino ?? aviso.destino ?? null>,
   id_mensaje:<data.id_mensaje ?? data.message_id ?? null>, entregado_en:<ISO si entregado, si no
   null>, motivo:<'el aviso quedo ENTREGADO por el canal declarado y el canal lo confirmo' |
   'el canal no confirmo la entrega: el aviso NO se declara entregado'>}`.
9. **La respuesta con canal** (`200`): `{project_id, aviso_id, aviso, confirmacion,
   decide:false, completa_a:'motor-avisos (K2, que solo PRODUCE)', abierto:{entrega, destino},
   faltan}`.
   - `abierto.entrega` = `null` si entregado, si no `'el canal no confirmo la entrega — no se
     afirma entregado'`; `abierto.destino` = declara el hueco si `confirmacion.destino === null`.
   - `faltan` = `[]` si entregado, si no `['confirmacion_canal']`.
10. **ENTREGA, NO DECIDE**: `decide:false` y `completa_a:'motor-avisos (K2, que solo PRODUCE)'`
    **siempre**. El puente **entrega**, no decide qué avisar, a quién ni por dónde.
11. **`onAvisoProducido` (K2 → R1)**: `e.data || e`; **sin `project_id` → `null`** (tolerancia).
    Delega en `_entregar({project_id, aviso: d.aviso || d, aviso_id, canal, destino,
    correlation_id})` para **entregar y confirmar** el aviso producido.
12. **Sin estado**: un puente **no recuerda** avisos. Sin `PosPersistencia`, sin
    `onProjectActivated`, sin store en disco.
13. **HTTP exacto**: éxito `200` (entregado o no); `project_id` o `aviso` ausentes → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `aviso-al-negocio.entregar.response` y emite `contabilidad.aviso_entregado`.

### 1. `entregar` — el aviso llega por el canal (telegram) y se confirma

```json
{
  "project_id": "e57a318a-...",
  "aviso": { "id": "AV-9", "tipo": "cuadre", "asunto": "cuadre", "motivo": "faltan 1 hecho por llegar", "canal": "telegram", "destino": "dueno" },
  "correlation_id": "abc-123"
}
```

Respuesta `200` (el canal confirmó):

```json
{
  "project_id": "e57a318a-...",
  "aviso_id": "AV-9",
  "aviso": { "id": "AV-9", "tipo": "cuadre", "asunto": "cuadre", "motivo": "faltan 1 hecho por llegar", "canal": "telegram", "destino": "dueno" },
  "confirmacion": {
    "entregado": true,
    "confirmado": true,
    "canal": "telegram",
    "canal_evento": "telegram.send_message.request",
    "destino": "dueno",
    "id_mensaje": "5551",
    "entregado_en": "2026-09-30T...",
    "motivo": "el aviso quedo ENTREGADO por el canal declarado y el canal lo confirmo"
  },
  "decide": false,
  "completa_a": "motor-avisos (K2, que solo PRODUCE)",
  "abierto": { "entrega": null, "destino": null },
  "faltan": []
}
```

Emite `contabilidad.aviso_entregado` (lo consumen el cuadro de mando J8 y la operación):

```json
{ "project_id": "e57a318a-...", "aviso_id": "AV-9", "confirmacion": { "entregado": true, "...": "..." }, "entregado": true, "canal": "telegram", "correlation_id": "abc-123" }
```

### 2. `entregar` — sin canal declarado → no se inventa por dónde

`aviso` sin `canal` y sin `input.canal` → `200` con `confirmacion:{entregado:false,
confirmado:false, canal:null, motivo:'el canal no esta declarado: el puente ENTREGA, no inventa
por donde'}`, `faltan:['canal']`. Emite el evento con `entregado:false`.

### 3. `entregar` — el canal no confirma → no se declara entregado

Si `_rpc` devuelve `null` o una respuesta sin `entregado/sent/ok/status:200` →
`confirmacion:{entregado:false, confirmado:false, canal, motivo:'el canal no confirmo la
entrega: el aviso NO se declara entregado'}`, `faltan:['confirmacion_canal']`, `abierto.entrega`
declarado. **ENTREGA ≠ RECEPCIÓN.**

### 4. Fire-and-forget — reacción a `contabilidad.aviso_producido` (K2)

`onAvisoProducido` toma `e.data || e`; sin `project_id` → `null`. Con `project_id`, **entrega y
confirma** el aviso producido por el mismo `_entregar` (con `aviso:d.aviso || d`). El ciclo
**COMPLETA** a K2: K2 **produce**, R1 **entrega**.

### 5. Fallo — falta el aviso

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `400` + `aviso-al-negocio.entregar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "aviso requerido", "details": { "field": "aviso" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/aviso-al-negocio.test.js`. Cubre:

- `entregar` con `canal:'telegram'` y el canal confirmando → `200 confirmacion.entregado:true`,
  `canal_evento:'telegram.send_message.request'`, y **emite** `contabilidad.aviso_entregado`.
- **Sin canal declarado** → `entregado:false`, `canal:null`, `faltan:['canal']` (**no se inventa
  un canal**).
- **El canal no confirma** → `entregado:false`, `confirmado:false`, `faltan:['confirmacion_canal']`
  (**jamás entregado sin confirmación**).
- `_texto` compone `«asunto: motivo»`; los canales del mapa (`telegram`/`email`/`push`/`motor`)
  enrutan a su evento correcto.
- `decide:false` y `completa_a:'motor-avisos (K2, que solo PRODUCE)'` **siempre**.
- `onAvisoProducido` (K2 → R1) entrega el aviso producido; **tolerante** sin `project_id`.
- `project_id` o `aviso` ausentes → `400 INVALID_INPUT` + `.entregar.failed`.
- **Sin estado**: ninguna llamada recordó nada (stateless); `toolEntregar` devuelve la misma
  proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AvisoAlNegocio extends ModuloHibridoReflejo`; `name = 'aviso-al-negocio'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (PUENTE stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/aviso-al-negocio/`).
- Constante `CANALES` — el mapa `canal → {evento, canal}` (**la identidad** de cada canal, no
  criterio de negocio).
- `onEntregarRequest` usa `this._atender(e, 'entregar', 'aviso-al-negocio.entregar.response',
  async (d) => {...})` con cierre de círculo (evento de dominio en `200` — entregado o no —,
  par `failed` si no). `onAvisoProducido` (fire-and-forget) entrega directamente sin `_atender`.
  `onUnload` delega en `super`.
- Proyección única `_entregar(input)` (**async**: entrega por el canal por evento); helpers
  `_canal`, `_texto`. Tool `toolEntregar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: **emite por EVENTO** al canal declarado (`telegram` / `email` / `push` / `motor-avisos`,
  `timeout_ms:8000`) y **consume** `contabilidad.aviso_producido` (K2) para entregar. Publica
  `contabilidad.aviso_entregado`, que lo consumen el cuadro de mando (J8) y la operación.
- **ENTREGA, NO DECIDE**: **el aviso vale por LLEGAR** — se **entrega** y se **confirma**;
  **JAMÁS entregado sin confirmación**; sin canal declarado no se inventa un canal.
