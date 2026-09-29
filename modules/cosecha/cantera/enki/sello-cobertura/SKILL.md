---
name: sello-cobertura
description: >
  Skill FULL del módulo REFLEJO `sello-cobertura` de la vertical contabilidad de
  Enki. La MARCA DE COMPLETITUD de lo consultado, FUERA de ciclo: si falta
  cobertura, lo DICE ANTES de que el dueño decida. LEE la métrica única de
  cobertura (A12) y NUNCA la recalcula; si no consta → SELLO_DESCONOCIDO. Úsala
  para operar, depurar o extender el reflejo, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites sellar una respuesta consultada con la completitud de su
    cobertura (RPC sello-cobertura.sellar.request).
  - Cuando depures por qué el sello sale `estado:'SELLO_DESCONOCIDO'` (la
    cobertura no consta) o por qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del reflejo (LEE la cobertura no la recalcula, sella lo que hay,
    fuera de ciclo, sella no decide).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo sello-cobertura.
tags: [enki, modulo, reflejo, contabilidad, sello-cobertura]
---

# sello-cobertura — REFLEJO de la marca de completitud fuera de ciclo

## Qué hace el módulo

`sello-cobertura` es un **REFLEJO STATELESS** (Q3, hoja del plan): la **MARCA DE COMPLETITUD** de
lo **consultado**, **FUERA DE CICLO** — si falta cobertura, lo **DICE ANTES** de que el dueño
decida.

> ℹ️ **Fuera de ciclo**: `!= aviso-cuadre` (C6), que **solo avisa al cierre**. El sello actúa **en
> el momento de la consulta**, sin esperar a ningún cierre.

Atributos del diseño: `cobertura:Cobertura`.
Método: `sellar(respuesta):Respuesta`.

> 🔴 **LEE LA MÉTRICA ÚNICA, NO LA RECALCULA.** La cobertura la produce `completitud-cobertura`
> (**A12**) y la declara en `contabilidad.cobertura_medida`. Aquí se **TOMA** esa cobertura **ya
> medida** (declarada, **cacheada** o pedida a A12 **POR EVENTO**) y se **SELLA** con ella la
> respuesta consultada. **Recalcularla sería una SEGUNDA métrica de cobertura.**

Invariantes:

- **LEE, NO RECALCULA**: la cobertura llega **declarada**, **cacheada** del evento o pedida a A12
  **POR EVENTO**; **jamás** se recomputa desde esperados/llegados.
- **SELLA LO QUE HAY**: si la cobertura **no consta**, el sello es **`SELLO_DESCONOCIDO`** — no se
  afirma ni completo ni incompleto.
- **FUERA DE CICLO**: sella en el momento de la consulta; **no depende de ningún cierre**.
- **DETERMINISTA y sin estado de dominio**: una lectura cacheada, no una parcela.
- **Sella, no decide** (`decide:false`).

Proyección única `_sellar`. Consume `contabilidad.cobertura_medida` (fire-and-forget, LEE) y
`contabilidad.respuesta_consulta`. Cierra el círculo con `sello-cobertura.sellar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `sello-cobertura.sellar.request` | `onSellarRequest` | RPC reflejo (determinista): {project_id, respuesta?, cobertura?, vertical?} → {respuesta:{..., sello_cobertura}, sello:{estado:'SELLO_COMPLETO'\|'SELLO_INCOMPLETO'\|'SELLO_DESCONOCIDO', completo, tasa, huecos, falta_cobertura, motivo}, cobertura, lee_metrica_unica:true, recalcula_cobertura:false, fuera_de_ciclo:true, decide:false, abierto, faltan}. Sella la respuesta con LA metrica unica de cobertura (A12) LEIDA — declarada, cacheada o pedida POR EVENTO; NUNCA la recalcula. Sin cobertura → SELLO_DESCONOCIDO. Responde por sello-cobertura.sellar.response; project_id ausente → sello-cobertura.sellar.failed. |
| `contabilidad.cobertura_medida` | `onCoberturaMedida` | Fire-and-forget (A12 → Q3): completitud-cobertura publicó LA metrica unica → se LEE y se guarda (cache de lectura) para sellar sin recalcularla. Tolerante: sin project_id se ignora. ⚠️ No dispara ninguna medición: solo LEE. |
| `contabilidad.respuesta_consulta` | `onRespuestaConsulta` | Fire-and-forget (Q1 → Q3): consulta-cuentas-bajo-demanda publicó una respuesta consultada → se sella con la cobertura ANTES de que el dueño decida (fuera de ciclo). Tolerante: sin project_id se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `sello-cobertura.sellar.response` | Respuesta RPC correlada de sello-cobertura.sellar.request → {request_id, status:200, data:{respuesta, sello, cobertura, lee_metrica_unica:true, recalcula_cobertura:false, fuera_de_ciclo:true, decide:false, abierto, faltan}}. Emitida por el helper _atender. |
| `sello-cobertura.sellar.failed` | Par de fallo determinista (Q3): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de sello-cobertura.sellar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `sello-cobertura.sellar.failed` cierra el círculo de `sello-cobertura.sellar.request` cuando
> `_sellar` devuelve status ≠ 200 (`400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): el reflejo **no emite ningún evento de dominio** — sus
> dos fire-and-forget (`onCoberturaMedida`, LEE la métrica única y la cachea; `onRespuestaConsulta`,
> sella la respuesta publicada) consumen y delegan sin pasar por el bus. La respuesta de
> `onRespuestaConsulta` es el resultado de `_sellar(...)` (no un `200` intermedio). El cierre de
> círculo publica `sello-cobertura.sellar.failed` en la rama `else` (status ≠ 200).

> Nota de sub-declaración (cruce con `index.js`): **no está en `module.json` pero sí lo emite
> `index.js`** el RPC saliente en `_leerCobertura`: `completitud-cobertura.medir.request`
> (`{project_id, vertical}`, `timeout_ms:4000`) — es una **DEP por evento** (LECTURA), no un evento
> emitido.

> Nota: tampoco figuran `_sello`, `_leerCobertura`, `_num` (internos) ni la caché `_cobertura` en
> el `module.json`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **LA COBERTURA se LEE** (`_leerCobertura`), **en este orden** — (a) `input.cobertura` si es
   objeto; (b) `input.respuesta.cobertura` si es objeto; (c) la **caché de lectura**
   `this._cobertura.get(pid)`; (d) **POR EVENTO** a `completitud-cobertura.medir.request`
   (`{project_id, vertical}`, `timeout_ms:4000`) → su `data.cobertura`. **Nunca se recalcula.**
3. **El SELLO** (`_sello`) **derivado de la cobertura LEÍDA**, **tres estados**:
   - **sin cobertura** (o no objeto) → `{estado:'SELLO_DESCONOCIDO', completo:null, tasa:null,
     huecos:null, motivo:'la metrica unica de cobertura no consta: no se sella ni completo ni
     incompleto'}`. **No se afirma nada.**
   - **con cobertura**: `completa = cobertura.completa === true`; `declarada = cobertura.declarada
     !== false`; `estado = completa ? 'SELLO_COMPLETO' : (declarada ? 'SELLO_INCOMPLETO' :
     'SELLO_DESCONOCIDO')`. `tasa` y `huecos` se **COPIAN tal cual** de la métrica única (**no se
     recalculan**). `falta_cobertura = !completa`. `motivo` declara el caso (completa / incompleta
     — «se dice ANTES de que el dueño decida» — / no declarada).
4. **La RESPUESTA SELLADA**: `respuesta ? {...input.respuesta, sello_cobertura: sello} : null`.
   **Nada se altera**: solo se **añade** la marca de completitud. El sello se **adjunta** también
   como campo aparte (`sello`).
5. **La respuesta completa**: `{project_id, respuesta (sellada), sello, cobertura,
   lee_metrica_unica:true, recalcula_cobertura:false, fuera_de_ciclo:true, decide:false,
   avisa_antes_de_decidir:true, abierto:{cobertura}, faltan:[cobertura?]}`.
   - `avisa_antes_de_decidir:true`: **si falta cobertura, se DICE ANTES de decidir** (esa es la
     razón de ser del sello).
   - `abierto.cobertura` declara si A12 no respondió (**el sello queda DESCONOCIDO**); `faltan`
     lleva `['cobertura']` cuando no consta.
6. **`onCoberturaMedida` (LEE)**: guarda `this._cobertura.set(project_id, d.cobertura || null)`;
   **tolerante**: sin `project_id` se ignora (devuelve `null`). **No dispara ninguna medición:
   solo LEE.**
7. **`onRespuestaConsulta` (Q1 → Q3)**: sella la respuesta publicada con
   `_sellar({project_id, respuesta:d, vertical:d.vertical, correlation_id})` — **antes de que el
   dueño decida** (fuera de ciclo); **tolerante**: sin `project_id` se ignora.
8. **Sella, no decide**: `decide:false` **siempre**. **No escribe, NO persiste**: la caché
   `this._cobertura` es una **LECTURA**, no una parcela. Sin `PosPersistencia`, sin
   `onProjectActivated`.
9. **HTTP exacto**: éxito `200` (sello completo/incompleto/desconocido); `project_id` ausente →
   `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `sello-cobertura.sellar.response`. **No emite evento de dominio.**

### 1. `sellar` — cobertura completa (leída) → `SELLO_COMPLETO`

```json
{
  "project_id": "e57a318a-...",
  "respuesta": { "tema": "caja", "valor": 3421.75 },
  "cobertura": { "declarada": true, "esperados": 3, "llegados": 3, "huecos": [], "tasa": 1, "completa": true },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "respuesta": { "tema": "caja", "valor": 3421.75, "sello_cobertura": { "estado": "SELLO_COMPLETO", "completo": true, "tasa": 1, "huecos": [], "falta_cobertura": false, "motivo": "lo consultado tiene cobertura completa (se lee de la metrica unica A12)" } },
  "sello": { "estado": "SELLO_COMPLETO", "completo": true, "tasa": 1, "huecos": [], "falta_cobertura": false, "motivo": "lo consultado tiene cobertura completa (se lee de la metrica unica A12)" },
  "cobertura": { "declarada": true, "esperados": 3, "llegados": 3, "huecos": [], "tasa": 1, "completa": true },
  "lee_metrica_unica": true,
  "recalcula_cobertura": false,
  "fuera_de_ciclo": true,
  "decide": false,
  "avisa_antes_de_decidir": true,
  "abierto": { "cobertura": null },
  "faltan": []
}
```

La `tasa` y los `huecos` del sello se **COPIAN** de la métrica única (A12); el reflejo **no la
recalcula** (`recalcula_cobertura:false`).

### 2. `sellar` — cobertura incompleta → `SELLO_INCOMPLETO` (se dice ANTES de decidir)

Cobertura con `completa:false` y `declarada:true` → `estado:'SELLO_INCOMPLETO'`,
`falta_cobertura:true` y `motivo` («se dice ANTES de que el dueño decida»).

### 3. `sellar` — sin cobertura → `SELLO_DESCONOCIDO` (no se afirma nada)

Sin `input.cobertura`, sin `respuesta.cobertura`, sin caché y con A12 sin responder → cobertura
`null` → `sello:{estado:'SELLO_DESCONOCIDO', completo:null, tasa:null, huecos:null, motivo:...}`,
`abierto.cobertura` declarando el hueco, `faltan:['cobertura']`. **No se afirma ni completo ni
incompleto.**

### 4. Fallo — falta `project_id`

```json
{ "respuesta": { "tema": "caja", "valor": 3421.75 } }
```

Respuesta `400` + `sello-cobertura.sellar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/sello-cobertura.test.js`. Cubre:

- `sellar` con cobertura **completa** → `200 {estado:'SELLO_COMPLETO', completo:true}`, `tasa` y
  `huecos` **copiados** de la métrica única, `decide:false`, `fuera_de_ciclo:true`,
  `recalcula_cobertura:false`.
- Cobertura **incompleta** (`declarada:true`, `completa:false`) → `SELLO_INCOMPLETO`,
  `falta_cobertura:true` (**se dice ANTES de decidir**).
- Cobertura **no declarada** (`declarada:false`) → `SELLO_DESCONOCIDO` (**no se afirma nada**).
- **Sin cobertura** (ni declarada, ni en la respuesta, ni caché, ni A12) → `SELLO_DESCONOCIDO`,
  `abierto.cobertura` declarando el hueco, `faltan:['cobertura']`.
- La **cobertura se LEE**: de `input.cobertura`, de `input.respuesta.cobertura`, de la caché
  (`onCoberturaMedida`) o de `completitud-cobertura.medir.request` (A12). **Nunca se recalcula.**
- La respuesta sale **sellada** (`respuesta.sello_cobertura`) **sin alterar** el resto de sus campos.
- `onCoberturaMedida` es **tolerante** sin `project_id`; **no dispara medición**.
- `onRespuestaConsulta` (Q1 → Q3) sella la respuesta publicada; tolerante sin `project_id`.
- `project_id` ausente → `400 INVALID_INPUT` + `sello-cobertura.sellar.failed`.
- `toolSellar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `SelloCobertura extends ModuloHibridoReflejo`; `name = 'sello-cobertura'`, `version =
  'reflejo-0.1.0'`. Caché de lectura `this._cobertura = new Map()` (`project_id → cobertura`),
  **no es parcela**. Sin `PosPersistencia`, sin store en disco, sin `onProjectActivated`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/sello-cobertura/`).
- `onSellarRequest` usa `this._atender(e, 'sellar', 'sello-cobertura.sellar.response', async (d) =>
  {...})` con cierre de círculo (par `failed` si status ≠ 200). Los fire-and-forget
  `onCoberturaMedida` (cachea la lectura) y `onRespuestaConsulta` (sella la respuesta publicada)
  delegan sin pasar por el bus. `onUnload` delega en `super`.
- Proyección única `_sellar(input)` (**async**: puede pedir A12 por evento); helpers `_sello`,
  `_leerCobertura`. Tool `toolSellar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: **LEE** `completitud-cobertura.medir.request` (A12) por EVENTO y consume
  `contabilidad.cobertura_medida` (fire-and-forget) para cachear la métrica única; consume
  `contabilidad.respuesta_consulta` de la puerta pull (Q1) para sellar. **LA COBERTURA SE LEE, NO
  SE RECALCULA.**
- **FUERA DE CICLO**: sella en la consulta, **antes** de que el dueño decida (frente a
  `aviso-cuadre`, C6, que solo avisa al cierre).
