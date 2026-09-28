---
name: asiento-ajuste
description: >
  Skill FULL del módulo PUENTE `asiento-ajuste` de la vertical contabilidad de Enki (B5,
  hoja del plan). PLANO 1 de los 4 planos de corrección: por donde la corrección del
  asesor ENTRA al libro SIN BORRAR. El ajuste SUMA: nunca modifica ni borra el asiento
  original; la traza (B4) queda intacta (requisito de auditoría). PUENTE stateless: sin
  PosPersistencia ni project.activated. Compone el asiento de ajuste (partida doble
  verificada + clave_original declarada + borra_original:false) y lo ENVÍA a
  escritor-diario (B2) por EVENTO con rol ADMISION — B2 es el ÚNICO escritor, aquí no se
  escribe el libro. Verifica por EVENTO que el original sigue en la traza (B4). Sin
  clave_original → 422 ORIGINAL_NO_DECLARADO; descuadre → 409 DESCUADRE; original ausente
  de la traza → 404 ORIGINAL_NO_EN_TRAZA; traza no disponible → 503
  DEPENDENCIA_NO_DISPONIBLE. Úsala para operar, depurar o extender el puente, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando recibas una corrección del asesor y haya que componer el asiento de ajuste y
    señalarlo al libro (RPC contabilidad.ajuste.recibir.request).
  - Cuando depures por qué no entra un ajuste (422 ORIGINAL_NO_DECLARADO si no declara el
    original, 409 DESCUADRE, 404 ORIGINAL_NO_EN_TRAZA, 503 DEPENDENCIA_NO_DISPONIBLE si la
    traza o el diario no responden).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué el
    ajuste suma sin borrar y por qué el puente no escribe el libro.
  - Cuando vayas a escribir/ampliar el test unitario del puente asiento-ajuste.
tags: [enki, modulo, puente, contabilidad, asiento-ajuste, correccion, suma]
---

# asiento-ajuste — PUENTE stateless · el ajuste que SUMA sin borrar

## Qué hace el módulo

`asiento-ajuste` es un **PUENTE STATELESS** (B5, hoja del plan): **PLANO 1 de los 4 planos
de corrección** — por donde **la corrección del asesor ENTRA al libro SIN BORRAR**. La
invariante rectora: **el ajuste SUMA**: **nunca modifica ni borra el asiento original**;
la **traza (B4) queda intacta** (requisito de auditoría).

Es **stateless**: sin PosPersistencia ni `project.activated` — cada op **entra objeto, sale
objeto**. La dependencia con el libro es **por EVENTO**: aquí se **compone** el asiento de
ajuste (partida doble verificada + `clave_original` declarada + `borra_original:false`) y se
**ENVÍA a `escritor-diario` (B2)** publicando `contabilidad.asiento.ajustar.request` con rol
**`ADMISION`** — **B2 es el ÚNICO escritor; aquí no se escribe el libro**.

La dependencia con `traza-asiento` (B4) también es **por EVENTO**: `_verificarNoBorrado` lee
`contabilidad.traza.consultar.request`; si la traza **no responde**, **NO se afirma** que el
original siga intacto → **`503 DEPENDENCIA_NO_DISPONIBLE`**; si el original **no está** en la
traza → **`404 ORIGINAL_NO_EN_TRAZA`** (*el asiento original no se borra*).

> **NO REUTILIZA**: la corrección que suma sobre el libro es propia del dominio contable
> (espejo de A13 del lado del asiento).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.ajuste.recibir.request` | `onRecibirRequest` | RPC puente: {project_id, correccion:{tipo:'AJUSTE'\|'CORRIGE'\|'ANULA'\|'REGULARIZA', apuntes:[{cuenta, debe, haber}], clave_original}, motivo?, periodo?} → {project_id, asiento_ajuste:{tipo:'AJUSTE', apuntes, suma:true, borra_original:false, clave_original}, original_intacto:true, borrado:false, senal_libro}. Verifica por EVENTO que el original sigue en la traza (B4) y ENVIA el ajuste a escritor-diario (B2) por contabilidad.asiento.ajustar.request con rol ADMISION. Sin clave_original → 422 ORIGINAL_NO_DECLARADO; sin partida doble cuadrada → 409 DESCUADRE; si el original no esta en la traza → 404 ORIGINAL_NO_EN_TRAZA; si la traza no responde → 503 DEPENDENCIA_NO_DISPONIBLE. Exito publica contabilidad.ajuste_recibido y responde por contabilidad.ajuste.recibir.response; error → contabilidad.ajuste.recibir.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.asiento.ajustar.request` | Senal al libro (B5 → B2): el asiento de ajuste listo para asentar → {project_id, rol:'ADMISION', asiento:{tipo:'AJUSTE', apuntes, suma:true, borra_original:false, clave_original}, clave_natural}. Lo consume escritor-diario (B2, handler onAjustarRequest), que es el UNICO escritor: aqui no se escribe el libro. Si B2 no responde → contabilidad.asiento.ajustar.failed y NO se declara el ajuste recibido. |
| `contabilidad.ajuste_recibido` | Fire-and-forget (B5): la correccion del asesor quedo recibida y SEÑALADA al libro SUMANDO (original intacto en la traza) → {project_id, asiento_ajuste, clave_original, original_intacto:true, borrado:false, suma:true, senal_libro}. Requisito de auditoria: el original NUNCA se borra. |
| `contabilidad.ajuste.recibir.failed` | Par de fallo determinista: correccion sin project_id/tipo valido, original no declarado (422 ORIGINAL_NO_DECLARADO), partida doble descuadrada (409 DESCUADRE), original ausente de la traza (404 ORIGINAL_NO_EN_TRAZA) o traza no disponible (503). Cierra el circulo de contabilidad.ajuste.recibir.request. |
| `contabilidad.asiento.ajustar.failed` | Par de fallo del envio al libro: escritor-diario (B2) no confirmo el asiento de ajuste (503 DEPENDENCIA_NO_DISPONIBLE) o lo rechazo (409 DESCUADRE / ERROR_DUPLICADO). NO se declara recibido lo que el libro no confirma. |
| `contabilidad.ajuste_recibido.failed` | Par de fallo del evento de dominio contabilidad.ajuste_recibido: la correccion se compuso pero el libro (B2) no la confirmo; no se emite como recibida. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.ajuste.recibir.failed` cierra el círculo de
> `contabilidad.ajuste.recibir.request`; si el envío al libro no confirma, se cierran
> `contabilidad.asiento.ajustar.failed` **y** `contabilidad.ajuste_recibido.failed`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.ajuste.recibir.response` (el par response del RPC); **NO está declarada en
> `publishes`**.

> Nota: no está en module.json pero sí lo emite index.js — el puente publica por `_rpc`
> `contabilidad.traza.consultar.request` (dependencia por EVENTO hacia traza-asiento B4) y
> `contabilidad.asiento.ajustar.request` (dependencia por EVENTO hacia escritor-diario B2);
> ambas son peticiones request/response que el puente emite, no declaradas como publishers
> aparte de la señal al libro ya listada.

> Nota: `onRecibirRequest` publica **`contabilidad.asiento.ajustar.request`** directamente
> como señal al libro, además de `contabilidad.ajuste_recibido` (éxito) o los pares de fallo.
> No hay pares `*.failed` de dominio declarados que no se emitan: los tres pares
> declarados (`contabilidad.ajuste.recibir.failed`, `contabilidad.asiento.ajustar.failed`,
> `contabilidad.ajuste_recibido.failed`) se publican desde `onRecibirRequest`.

## Reglas de negocio

1. **El ajuste SUMA, nunca borra (la invariante del plano 1)**: `_recibir` devuelve el
   asiento de ajuste con `borra_original:false`, `suma:true`, `tipo:'AJUSTE'` y `origen` (por
   defecto `'ASESOR_B5'`). La respuesta incluye `original_intacto:true` y `borrado:false`, y
   la `regla`: *«el ajuste SUMA: nunca modifica ni borra el asiento original»*.
2. **El original se DECLARA, no se asume**: `_recibir` toma la clave del original de
   `input.clave_original`/`input.clave_natural_original`, `correccion.clave_original` o
   `correccion.original.clave_natural`. Si **no la declara** → **`422 PRECONDITION_FAILED`**
   con `{ message:'la correccion no declara el asiento original al que apunta: se declara,
   no se asume', details:{ senal:'ORIGINAL_NO_DECLARADO' } }`.
3. **Tipos de corrección declarables**: `TIPOS_CORRECCION = ['AJUSTE','CORRIGE','ANULA',
   'REGULARIZA']`. Fuera del conjunto → **`400 INVALID_INPUT correccion.tipo`**. El tipo se
   normaliza a mayúsculas; por defecto `'AJUSTE'`.
4. **El original debe seguir en la traza (B4)**: `_verificarNoBorrado` lee
   `contabilidad.traza.consultar.request` (timeout 4000ms). Si la traza **no responde** →
   **`503 DEPENDENCIA_NO_DISPONIBLE`** con
   `{ dependencia:'traza-asiento', clave_original, accion:'NO_AFIRMAR_INTACTO_PUBLICAR_FALLO' }`.
   Si el original **no está** (`hallada:false`, sin `entrada`) → **`404 ORIGINAL_NO_EN_TRAZA`**
   con `{ clave_original, simbolico:'ORIGINAL_NO_EN_TRAZA' }`.
5. **Partida doble en el ajuste**: `_sumas` acumula debe/haber; si `|debe - haber| > 0.005`
   → **`409 DESCUADRE`** con `{ message:'el asiento de ajuste NO cuadra: debe <x> != haber
   <y>', details:{ debe, haber, simbolico:'DESCUADRE' } }`. Menos de dos apuntes → **`422
   PRECONDITION_FAILED`** con `{ n_apuntes }`.
6. **El puente NO escribe el libro**: compone el asiento y lo **SEÑALA** al diario publicando
   `contabilidad.asiento.ajustar.request` con `rol:'ADMISION'` (`_senalarAlDiario`, timeout
   5000ms). Si B2 **no responde** o lo rechaza → **NO se declara el ajuste recibido**: se
   publican `contabilidad.ajuste_recibido.failed` **y** `contabilidad.asiento.ajustar.failed`
   (*NO se declara recibido lo que el libro no confirma*).
7. **`senal_libro` refleja la confirmación**: el evento `contabilidad.ajuste_recibido` lleva
   `senal_libro` con `{ asiento, clave_natural }` del asiento que B2 confirmó.
8. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   `correccion` ausente/no objeto → `400 INVALID_INPUT correccion`; tipo fuera del conjunto
   → `400 INVALID_INPUT correccion.tipo`. Shape: `{ status:400, error:{ code:'INVALID_INPUT',
   message:'<campo> requerido', details:{ field:<campo> } } }`.
9. **La ley entra como DATO**: los apuntes, el motivo y la clave original son **datos** que
   aporta el asesor; el puente no cabla contrapartidas ni reglas.
10. **HTTP exacto**: éxito `200`; payload inválido → `400`; descuadre → `409` (y descuadre de
    B2); original ausente de la traza → `404`; traza (o diario) no disponible → `503`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC en `contabilidad.ajuste.recibir.response`.

### 1. `recibir` — recibir la corrección y señalarla al libro (suma)

```json
{
  "project_id": "e57a318a-...",
  "correccion": {
    "tipo": "AJUSTE",
    "clave_original": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84",
    "apuntes": [ { "cuenta": "629", "debe": 50, "haber": 0 }, { "cuenta": "572", "debe": 0, "haber": 50 } ]
  },
  "motivo": "gasto no imputado",
  "periodo": "2026-09",
  "correlation_id": "abc-124"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "asiento_ajuste": { "tipo": "AJUSTE", "correccion_tipo": "AJUSTE", "origen": "ASESOR_B5", "apuntes": [ { "cuenta": "629", "debe": 50, "haber": 0 }, { "cuenta": "572", "debe": 0, "haber": 50 } ], "debe": 50, "haber": 50, "clave_original": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84", "clave_natural": null, "periodo": "2026-09", "motivo": "gasto no imputado", "borra_original": false, "suma": true, "destino": "escritor-diario (B2)" },
  "clave_original": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84",
  "original_intacto": true,
  "borrado": false,
  "suma": true,
  "regla": "el ajuste SUMA: nunca modifica ni borra el asiento original"
}
```
Emite `contabilidad.ajuste_recibido` (res.data + `senal_libro` + `correlation_id`) tras
confirmar B2. La señal al libro va por `contabilidad.asiento.ajustar.request`.

### 2. Fallo — original no declarado → 422

```json
{ "project_id": "e57a318a-...", "correccion": { "tipo": "AJUSTE", "apuntes": [ { "cuenta": "629", "debe": 50, "haber": 0 }, { "cuenta": "572", "debe": 0, "haber": 50 } ] } }
```
Respuesta `422` + `contabilidad.ajuste.recibir.failed`:
```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "la correccion no declara el asiento original al que apunta: se declara, no se asume", "details": { "senal": "ORIGINAL_NO_DECLARADO" } } }
```

### 3. Fallo — descuadre → 409

Apuntes que no cuadran → `409 DESCUADRE` + `contabilidad.ajuste.recibir.failed`:
```json
{ "status": 409, "error": { "code": "DESCUADRE", "message": "el asiento de ajuste NO cuadra: debe 50 != haber 40", "details": { "debe": 50, "haber": 40, "simbolico": "DESCUADRE" } } }
```

### 4. Fallo — original ausente de la traza → 404

Original declarado que no está en la traza (B4) → `404 ORIGINAL_NO_EN_TRAZA` +
`contabilidad.ajuste.recibir.failed`:
```json
{ "status": 404, "error": { "code": "ORIGINAL_NO_EN_TRAZA", "message": "el asiento original <clave> no esta en la traza: el asiento original no se borra", "details": { "clave_original": "<clave>", "simbolico": "ORIGINAL_NO_EN_TRAZA" } } }
```

### 5. Fallo — traza/diario no disponible → 503

- Traza (B4) no responde → `503 DEPENDENCIA_NO_DISPONIBLE` con
  `{ dependencia:'traza-asiento', clave_original, accion:'NO_AFIRMAR_INTACTO_PUBLICAR_FALLO' }`.
- El ajuste se compone pero B2 no confirma → se publican `contabilidad.ajuste_recibido.failed`
  y `contabilidad.asiento.ajustar.failed` (con `DEPENDENCIA_NO_DISPONIBLE` si B2 no respondió).

### 6. Tools (sin RPC en module.json)

`toolRecibir` → `_recibir`; `toolVerificarNoBorrado` → `_verificarNoBorrado`.

## Tests

El test vive en `tests/unit/asiento-ajuste.test.js`. Cubre:

- `recibir` con corrección declarada y original en la traza y B2 disponible → `200`,
  `asiento_ajuste.tipo:'AJUSTE'`, `borra_original:false`, `suma:true`, `original_intacto:true`,
  `borrado:false`; emite `contabilidad.ajuste_recibido`.
- **El ajuste suma sin borrar**: la respuesta nunca trae `borra_original:true`; se publica la
  señal al libro `contabilidad.asiento.ajustar.request` con `rol:'ADMISION'`.
- Sin `clave_original` → `422 ORIGINAL_NO_DECLARADO` + `contabilidad.ajuste.recibir.failed`.
- Partida doble descuadrada → `409 DESCUADRE`.
- Original no en la traza → `404 ORIGINAL_NO_EN_TRAZA`; traza no disponible → `503
  DEPENDENCIA_NO_DISPONIBLE` (`NO_AFIRMAR_INTACTO_PUBLICAR_FALLO`).
- B2 no confirma → `contabilidad.ajuste_recibido.failed` **y**
  `contabilidad.asiento.ajustar.failed` (no se declara recibido).
- Tipo fuera de `TIPOS_CORRECCION` → `400 INVALID_INPUT correccion.tipo`.
- El puente es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/asiento-ajuste
node --test tests/unit/asiento-ajuste.test.js
```

## Notas de implementación

- Clase `AsientoAjuste extends ModuloHibridoReflejo`; `name = 'asiento-ajuste'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (puente stateless: no hay `this._store` ni
  PosPersistencia ni `project.activated`).
- Constante: `TIPOS_CORRECCION = ['AJUSTE','CORRIGE','ANULA','REGULARIZA']`. Tolerancia del
  cuadre `0.005`.
- `onRecibirRequest` delega en `_atender(e, 'recibir', 'contabilidad.ajuste.recibir.response',
  fn)`: en éxito compone (`_recibir`), **señala** al diario (`_senalarAlDiario` → `_rpc`
  `contabilidad.asiento.ajustar.request`) y publica `contabilidad.ajuste_recibido` o los pares
  de fallo; en fallo de composición publica `contabilidad.ajuste.recibir.failed`.
- Proyecciones puras: `_recibir` (async: clave_original + traza + partida doble),
  `_verificarNoBorrado` (async, EVENTO B4), `_senalarAlDiario` (async, EVENTO B2), `_sumas`.
  `_rpc`/`_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolRecibir`, `toolVerificarNoBorrado`.
- DEP hacia delante: `contabilidad.asiento.ajustar.request` lo consume `escritor-diario` (B2,
  `onAjustarRequest`), el ÚNICO escritor. DEP hacia atrás por evento: `traza-asiento` (B4)
  provee `contabilidad.traza.consultar.request`.
