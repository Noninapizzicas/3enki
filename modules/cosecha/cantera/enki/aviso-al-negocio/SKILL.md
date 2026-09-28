---
name: aviso-al-negocio
description: >
  Skill FULL del módulo PUENTE `aviso-al-negocio` de la vertical contabilidad de Enki (R1,
  hoja del plan). EL AVISO QUE LLEGA DE VERDAD: el requisito del dueño («información rica que
  avise») se cumple aquí. Completa el motor de avisos (K2), que solo PRODUCE, con la cara de
  ENTREGA al negocio. INVARIANTE DURA (honestidad): SIN CONFIRMACIÓN DE ENTREGA EL AVISO NO
  CONSTA COMO RECIBIDO — la entrega no es la recepción. `_entregar(aviso)` empuja el aviso por
  el CANAL DECLARABLE (K7), y `_confirmar(entrega)` es el acto que convierte «enviado» en
  «recibido». Canales del propio sistema (PANEL/INTERNO) se auto-confirman — la superficie es
  la prueba; los externos (TELEGRAM/EMAIL/WHATSAPP) piden el ACK al adaptador por EVENTO, y
  sin ACK se declara `sin_confirmacion:true` y NO se emite `contabilidad.aviso_confirmado`.
  El canal es DECLARABLE (K7 `[ABIERTO]`): no hay canal cableado como ley. Stateless. Úsala
  para operar, depurar o extender el puente.
when-to-use: >
  - Cuando motor-avisos (K2) enrute un aviso y haya que ENTREGARLO y CONFIRMARLO (RPC
    contabilidad.aviso.enrutar.request).
  - Cuando depures por qué el aviso no consta como recibido (`sin_confirmacion:true`,
    `contabilidad.aviso_confirmado.failed` con SIN_CONFIRMACION_DE_ENTREGA, 503 si el
    adaptador del canal no responde) o por qué no se entrega (422 PRECONDITION_FAILED si el
    aviso no trae destinatario, 400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué el canal es
    un puerto declarable y por qué la entrega no basta.
  - Cuando vayas a escribir/ampliar el test unitario del puente aviso-al-negocio.
tags: [enki, modulo, puente, contabilidad, aviso-al-negocio, avisos, confirmacion]
---

# aviso-al-negocio — PUENTE · la entrega del aviso al negocio (y su confirmación)

## Qué hace el módulo

`aviso-al-negocio` es un **PUENTE STATELESS** (R1, hoja del plan): **EL AVISO QUE LLEGA DE
VERDAD**. El requisito del dueño (*«información rica que **avise**»*) se cumple aquí: completa
el motor de avisos (**K2**), que **solo PRODUCE**, con la cara de **ENTREGA** al negocio.
**INVARIANTE DURA (honestidad)**: **SIN CONFIRMACIÓN DE ENTREGA EL AVISO NO CONSTA COMO
RECIBIDO** — *«la entrega no es la recepción»*. Nadie da por entregado sin confirmación.

Tres momentos en una parcela:

- `_entregar(aviso)` → **empuja** el aviso por el **CANAL DECLARABLE** (K7). El canal es un
  **puerto**: hay canales que el propio sistema puede confirmar (**`PANEL`/`INTERNO`**: la
  superficie es la prueba) y canales externos (**`TELEGRAM`/`EMAIL`/`WHATSAPP`**) que exigen
  la confirmación del adaptador. **El aviso nunca queda en pantalla muda**
  (`pantalla_muda:false`).
- `_confirmar(entrega)` → **Confirmacion** `{confirmado, evidencia}`. Es el acto que convierte
  *«enviado»* en *«recibido»*.

**EL CANAL ES DECLARABLE** (K7 es `[ABIERTO]`): **no hay canal cableado como ley**. Hay un
**catálogo BASE** con su forma de confirmación (`CATALOGO_CANALES`) y el declarante
(`DUENO`/`ASESOR`) lo sobreescribe/añade con la tool `declararCanal`
(`ley_cableada:false`). Si el canal externo no confirma, se declara
**`sin_confirmacion:true`** y **NO se emite** el evento de dominio `contabilidad.aviso_confirmado`
— el aviso **NO consta como recibido**.

La dependencia con motor-avisos (**K2**) es por **EVENTO**: K2 **ENRUTA** publicando
`contabilidad.aviso.enrutar.request` y aquí se **ENTREGA** y **CONFIRMA**. **NUNCA por
`require` cruzado.**

Es **stateless**: sin PosPersistencia ni `project.activated` — no guarda estado; reacciona a
un aviso enrutado y lo entrega. El catálogo de canales es **configuración del adaptador**, no
parcela persistente.

> **NO REUTILIZA**: completa K2 (que solo PRODUCE); la entrega al negocio contable no existe
> en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.aviso.enrutar.request` | `onEnrutarRequest` | RPC puente (R1) — motor-avisos K2 enruta el aviso publicado y aqui se ENTREGA y CONFIMA: {project_id, aviso:{id, tipo, destinatario\|cola_destino, canal?, texto?, prioridad?, familia?}, canal?, destinatario?, confirmacion?\|confirmado?} → {project_id, entrega:{id, aviso_id, tipo, destinatario, canal, canal_externo, texto, prioridad, estado:'ENTREGADO', pantalla_muda:false}, confirmacion:{confirmado, canal, evidencia, sin_confirmacion, motivo}, consta_como_recibido, sin_confirmacion, llega_al_negocio:true}. Empuja el aviso por el CANAL DECLARABLE (K7); los canales del propio sistema (PANEL/INTERNO) se auto-confirman, los externos (TELEGRAM/EMAIL/WHATSAPP) piden el ACK al adaptador por EVENTO contabilidad.canal.entregar.request. SIN CONFIRMACION el aviso NO consta como recibido y NO se emite contabilidad.aviso_confirmado. Sin destinatario → 422 PRECONDITION_FAILED. Exito publica contabilidad.aviso_entregado y, si se confirma, contabilidad.aviso_confirmado; responde por contabilidad.aviso.enrutar.response; error → contabilidad.aviso.enrutar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.aviso_entregado` | Fire-and-forget (R1): el aviso quedo ENTREGADO por el canal declarado → {project_id, entrega:{id, aviso_id, tipo, destinatario, canal, canal_externo, texto, prioridad, familia, estado:'ENTREGADO', pantalla_muda:false}, canal, destinatario, canal_declarable:true, ley_cableada:false}. Es el cumplimiento del 'que avise': el aviso LLEGA al negocio, no se queda en un panel. Lo consumen la cara de consulta/entrega y la auditoria del proceso. |
| `contabilidad.aviso_confirmado` | Fire-and-forget (R1): la ENTREGA del aviso quedo CONFIRMADA (ack del adaptador o canal del propio sistema) → {project_id, entrega, confirmacion:{confirmado:true, canal, evidencia, confirmado_en}, consta_como_recibido:true}. Solo se emite si hay confirmacion: la entrega no es la recepcion. Lo consumen la cara de consulta/entrega y el cuadro del jefe. |
| `contabilidad.aviso.enrutar.failed` | Par de fallo determinista: enrutar sin project_id/aviso (400) o sin destinatario (422 PRECONDITION_FAILED: no se entrega un aviso sin silla de destino). Cierra el circulo de contabilidad.aviso.enrutar.request. |
| `contabilidad.aviso_entregado.failed` | Par de fallo del evento de dominio contabilidad.aviso_entregado: la emision del hecho de dominio no se completo. |
| `contabilidad.aviso_confirmado.failed` | Par de fallo del evento de dominio contabilidad.aviso_confirmado: el canal externo NO confirmo la entrega (SIN_CONFIRMACION_DE_ENTREGA) — el aviso quedo entregado pero NO consta como recibido (honestidad: nadie da por entregado sin confirmacion). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.aviso.enrutar.failed` cierra `contabilidad.aviso.enrutar.request`;
> `contabilidad.aviso_confirmado.failed` cierra la confirmación fallida del canal externo.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.aviso.enrutar.response` (el par response del RPC); **NO está declarada en
> `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.aviso_entregado.failed` es el par de fallo
> del evento de DOMINIO `contabilidad.aviso_entregado`; el puente solo publica el par
> `*.failed` de su RPC y, del dominio, **`contabilidad.aviso_confirmado.failed`** (que sí se
> publica desde `_confirmar` cuando el canal externo no confirma).

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.canal.entregar.request` (el puerto al adaptador del canal externo, K7):
> dependencia por EVENTO no declarada como publisher.

> Nota de sub-declaración: `_declararCanal(rol, canal, {...})` (la DECLARACIÓN del canal, K7)
> **NO está expuesta por ningún RPC** — solo como tool `toolDeclararCanal`. El declarante
> cambia el catálogo **en memoria** del módulo (`this._canales`, un Map), no una parcela
> persistente: el puente es stateless.

## Reglas de negocio

1. **LA ENTREGA NO ES LA RECEPCIÓN (invariante de honestidad)**: la respuesta declara
   `consta_como_recibido: confirmacion.confirmado` y `sin_confirmacion: !confirmacion.confirmado`.
   La `entrega.estado` es `'ENTREGADO'`; solo la **confirmación** convierte el aviso en
   **recibido**. `contabilidad.aviso_confirmado` **solo se emite si hay confirmación**.
2. **El canal es DECLARABLE (K7, `ley_cableada:false`)**: `CATALOGO_CANALES` BASE —
   `PANEL: {auto_confirma:true, evidencia:'AVISO_VISIBLE_EN_PANEL', externo:false}`,
   `INTERNO: {auto_confirma:true, evidencia:'ENTREGADO_AL_BUS_INTERNO', externo:false}`,
   `TELEGRAM`/`EMAIL`/`WHATSAPP`: `{auto_confirma:false, evidencia:'ACK_DEL_ADAPTADOR',
   externo:true}`. Canal por defecto (si no se declara): **`CANAL_DEFECTO = 'PANEL'`**. El
   canal se normaliza a mayúsculas; si no está en el catálogo, `canal_se_conocia:false` (pero
   se entrega igualmente).
3. **`_entregar` — sin destinatario no hay entrega**: exige `project_id` (400) y un `aviso`
   objeto (400). El `destinatario` se toma de `input.destinatario ?? input.cola_destino ??
   aviso.destinatario ?? aviso.cola_destino` (normalizado a mayúsculas); **sin destinatario →
   `422 PRECONDITION_FAILED`**: *«no se entrega un aviso sin silla de destino»*.
4. **La entrega es APPEND-ONLY conceptual y con secuencia**: `_secuencia += 1`; el id es
   `<project_id>-R1-<secuencia>`. La entrega lleva `{id, project_id, aviso_id, tipo,
   destinatario, canal, canal_declarable:true, canal_externo, canal_se_conocia, texto
   (aviso.texto ?? aviso.motivo ?? aviso.tipo), prioridad (?? 'NORMAL'), familia (?? 'GENERAL'),
   entregado_en, estado:'ENTREGADO', pantalla_muda:false}`. **El aviso no queda en pantalla
   muda.**
5. **`_confirmar` — tres caminos, en orden**:
   - **Confirmación DECLARADA en el payload** (`input.confirmacion` o `input.confirmado !==
     undefined`): `confirmado = input.confirmado === true || input.confirmacion.confirmado ===
     true || input.confirmacion.ack`. `declarada:true`; evidencia `input.confirmacion.evidencia
     ?? 'ACK_DECLARADO'`; sin confirmar → `sin_confirmacion:true` y motivo *«el adaptador NO
     confirmo la entrega»*.
   - **Canal del propio sistema** (`def.auto_confirma`): **`confirmado:true`** con
     `evidencia = def.evidencia`, `auto_confirmada:true` — *la superficie es la prueba*.
   - **Canal externo**: `_rpc` a `contabilidad.canal.entregar.request` (timeout 4000ms) con
     `{project_id, entrega, canal, destinatario, correlation_id}`; si `status === 200` y
     (`data.confirmado === true` o `data.ack === true`) → **confirmado** con evidencia
     `data.evidencia ?? 'ACK_DEL_ADAPTADOR'`.
6. **Sin ACK del canal externo NO se da por recibido**: se publica
   **`contabilidad.aviso_confirmado.failed`** con `status` (`resp.status || 503`),
   `error.code:'SIN_CONFIRMACION_DE_ENTREGA'`, `details:{canal, aviso_id}` y
   `confirmacion:{confirmado:false, evidencia:null, sin_confirmacion:true, motivo:'el canal
   externo no respondio/confirmo: nadie da por entregado sin confirmacion',
   canal_declarable:true}`. **El aviso queda ENTREGADO pero NO consta como recibido.**
7. **`_declararCanal` — la ley entra como DATO (K7)**: exige `canal` (400). Si viene `rol`,
   debe ser `DUENO` o `ASESOR`; cualquier otro → **`403 PERMISSION_DENIED`** con
   `rol_recibido`. La entrada declarada es `{auto_confirma (default false), evidencia (default
   'ACK_DEL_ADAPTADOR'), externo (default true), declarado:true, declarado_por,
   declarado_en}`; sobreescribe el catálogo en memoria y responde `ley_cableada:false`.
8. **El aviso LLEGA (`llega_al_negocio:true`)**: toda respuesta 200 del RPC lo declara — el
   requisito «que avise» se cumple: el aviso se empuja por el canal, no se queda en un panel
   mudo.
9. **Contrato TOLERANTE del canal externo**: el adaptador que no responde **no es fallo del
   RPC** (la respuesta sigue siendo `200` con `consta_como_recibido:false`): el hueco se
   declara en `confirmacion` y en `contabilidad.aviso_confirmado.failed`. **Se DECLARA, no se
   asume la recepción.**
10. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`; falta
    `aviso` (o no objeto) → `400 INVALID_INPUT aviso`; sin `canal` en `declararCanal` → `400
    INVALID_INPUT canal`. Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo>
    requerido', details:{ field:<campo> } } }`.
11. **HTTP exacto**: entrega armada → `200` (con o sin confirmación); payload inválido → `400`;
    rol no autorizado al declarar canal → `403`; sin destinatario → `422 PRECONDITION_FAILED`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC que responde en `contabilidad.aviso.enrutar.response`.

### 1. `enrutar` — aviso a canal del propio sistema (PANEL, auto-confirma)

```json
{
  "project_id": "e57a318a-...",
  "aviso": { "id": "e57a318a-...-K2-001", "tipo": "AVISO_SANGRIA", "destinatario": "DUENO", "texto": "la desviacion supera el umbral declarado", "prioridad": "ALTA", "familia": "ANALITICA" },
  "correlation_id": "abc-123"
}
```

Respuesta `200` (recortada):

```json
{
  "project_id": "e57a318a-...",
  "entrega": { "id": "e57a318a-...-R1-1", "project_id": "e57a318a-...", "aviso_id": "e57a318a-...-K2-001", "tipo": "AVISO_SANGRIA", "destinatario": "DUENO", "canal": "PANEL", "canal_declarable": true, "canal_externo": false, "canal_se_conocia": true, "texto": "la desviacion supera el umbral declarado", "prioridad": "ALTA", "familia": "ANALITICA", "entregado_en": "2026-09-30T09:00:00.000Z", "estado": "ENTREGADO", "pantalla_muda": false },
  "aviso_id": "e57a318a-...-K2-001",
  "canal": "PANEL",
  "destinatario": "DUENO",
  "entregado": true,
  "canal_declarable": true,
  "ley_cableada": false,
  "confirmacion": { "confirmado": true, "canal": "PANEL", "evidencia": "AVISO_VISIBLE_EN_PANEL", "confirmado_en": "2026-09-30T09:00:00.000Z", "declarada": false, "auto_confirmada": true, "sin_confirmacion": false, "motivo": null },
  "consta_como_recibido": true,
  "sin_confirmacion": false,
  "llega_al_negocio": true
}
```

Emite `contabilidad.aviso_entregado` y (al confirmar) `contabilidad.aviso_confirmado`.

### 2. `enrutar` — canal EXTERNO (TELEGRAM): se pide el ACK al adaptador

```json
{
  "project_id": "e57a318a-...",
  "aviso": { "id": "e57a318a-...-K2-002", "tipo": "AVISO_ACCIONABLE", "cola_destino": "DUENO", "texto": "hay hechos que no han entrado" },
  "canal": "TELEGRAM"
}
```

Si el adaptador (`contabilidad.canal.entregar.request`) responde `{confirmado:true}` →
`confirmacion:{confirmado:true, evidencia:'ACK_DEL_ADAPTADOR', ...}` y
`consta_como_recibido:true`; se emite `contabilidad.aviso_confirmado`.

### 3. `enrutar` — canal externo SIN ACK → entregado pero NO recibido (honestidad)

```json
{
  "status": 200,
  "data": {
    "entrega": { "canal": "TELEGRAM", "estado": "ENTREGADO", "pantalla_muda": false },
    "confirmacion": { "confirmado": false, "canal": "TELEGRAM", "evidencia": null, "confirmado_en": null, "declarada": false, "sin_confirmacion": true, "motivo": "el canal externo no respondio/confirmo: nadie da por entregado sin confirmacion", "canal_declarable": true },
    "consta_como_recibido": false,
    "sin_confirmacion": true,
    "llega_al_negocio": true
  }
}
```

Y se publica `contabilidad.aviso_confirmado.failed`:

```json
{ "status": 503, "error": { "code": "SIN_CONFIRMACION_DE_ENTREGA", "message": "el canal externo no confirmo la entrega: el aviso NO consta como recibido", "details": { "canal": "TELEGRAM", "aviso_id": "e57a318a-...-K2-002" } } }
```

### 4. `enrutar` — confirmación declarada en el payload (el adaptador la trae)

```json
{ "project_id": "e57a318a-...", "aviso": { "id": "A-1", "tipo": "AVISO_SANGRIA", "destinatario": "DUENO" }, "canal": "EMAIL", "confirmado": true }
```

→ `confirmacion:{confirmado:true, evidencia:'ACK_DECLARADO', declarada:true}` y
`consta_como_recibido:true`.

### 5. Fallo — sin destinatario → 422 (no hay silla de destino)

```json
{ "project_id": "e57a318a-...", "aviso": { "id": "A-1", "tipo": "AVISO_SANGRIA" } }
```

→ Respuesta `422` + `contabilidad.aviso.enrutar.failed`:

```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "el aviso no trae destinatario: no se entrega un aviso sin silla de destino", "details": { "aviso_id": "A-1" } } }
```

### 6. Fallo — payload inválido

Sin `project_id`/`aviso` → `400 INVALID_INPUT` + `contabilidad.aviso.enrutar.failed`.

### 7. Declarar canal (tool, sin RPC)

`_declararCanal({project_id, canal:'SMS', rol:'DUENO', auto_confirma:false, evidencia:'ACK_SMS',
externo:true})` → `200` con `{canal, entrada, ley_cableada:false}`; rol fuera de
`{DUENO, ASESOR}` → `403 PERMISSION_DENIED`.

### 8. Tools (sin RPC en module.json)

`toolEntregar` → `_entregar`; `toolDeclararCanal` → `_declararCanal`.

## Tests

El test vive en `tests/unit/aviso-al-negocio.test.js`. Cubre:

- `enrutar` con canal `PANEL` → `200`, `entrega.estado:'ENTREGADO'`,
  `entrega.pantalla_muda:false`, `confirmacion.auto_confirmada:true`,
  `consta_como_recibido:true`; emite `contabilidad.aviso_entregado` **y**
  `contabilidad.aviso_confirmado`.
- Canal externo con ACK declarado en el payload (`confirmado:true`) → `consta_como_recibido:true`
  y evidencia `'ACK_DECLARADO'`.
- **INVARIANTE DE HONESTIDAD**: canal externo sin ACK → `sin_confirmacion:true`,
  `consta_como_recibido:false`, **NO** se emite `contabilidad.aviso_confirmado` y **sí**
  `contabilidad.aviso_confirmado.failed` (`SIN_CONFIRMACION_DE_ENTREGA`).
- **Canal declarable**: `_declararCanal` con `rol:'DUENO'` cambia el catálogo
  (`ley_cableada:false`); rol no autorizado → `403 PERMISSION_DENIED`.
- **Sin destinatario** → `422 PRECONDITION_FAILED`; sin `project_id`/`aviso` → `400
  INVALID_INPUT` + `contabilidad.aviso.enrutar.failed`.
- La dependencia con el adaptador externo es **por EVENTO**
  (`contabilidad.canal.entregar.request`), nunca por `require` cruzado.
- El puente es **stateless**: sin `project.activated` ni persistencia; el catálogo de canales
  es configuración en memoria.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/aviso-al-negocio
node --test tests/unit/aviso-al-negocio.test.js
```

## Notas de implementación

- Clase `AvisoAlNegocio extends ModuloHibridoReflejo`; `name = 'aviso-al-negocio'`,
  `version = 'reflejo-0.1.0'`. **Sin store persistente** (puente stateless): solo
  `this._secuencia = 0` y `this._canales = new Map(Object.entries(CATALOGO_CANALES))` como
  configuración del adaptador.
- Constantes: `CATALOGO_CANALES` (5 canales), `CANAL_DEFECTO = 'PANEL'`.
- El único handler `onEnrutarRequest` delega en `_atender(e, 'enrutar',
  'contabilidad.aviso.enrutar.response', fn)`: si `_entregar` falla publica
  `contabilidad.aviso.enrutar.failed`; si entrega, publica `contabilidad.aviso_entregado` y
  luego intenta `_confirmar` (publicando `contabilidad.aviso_confirmado` o
  `contabilidad.aviso_confirmado.failed`).
- Proyecciones: `_entregar`, `_confirmar` (async, EVENTO al adaptador K7), `_declararCanal`.
  `_rpc`/`_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolEntregar`, `toolDeclararCanal`.
- DEP hacia delante: `contabilidad.aviso_entregado` y `contabilidad.aviso_confirmado` los
  consumen la cara de consulta/entrega y el cuadro del jefe. DEP hacia atrás por EVENTO:
  `motor-avisos` (K2) enruta publicando `contabilidad.aviso.enrutar.request`; el adaptador del
  canal externo (K7) responde por `contabilidad.canal.entregar.request`. `informe-accionable`
  (R2) entrega sus recomendaciones a través de este puente.
