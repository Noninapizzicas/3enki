---
name: declaracion-fuente-faltante
description: >
  Skill FULL del módulo PUENTE `declaracion-fuente-faltante` de la vertical
  contabilidad de Enki (A15, hoja del plan). Si una vertical NO publica un hecho que
  se NECESITA, se DECLARA el hueco ([ABIERTO] + aviso): NUNCA se obliga a la fuente a
  producirlo — contabilidad LEE, no impone. El hueco no se rellena ni se asume vacío.
  Reacciona a `contabilidad.cobertura_calculada` (A12) y LEE su `detalle.huecos` sin
  recalcular la métrica; pide el aviso a motor-avisos (K2) con contrato TOLERANTE (503
  si no está vivo, pero el hueco queda declarado). Stateless. Úsala para operar,
  depurar o extender el puente.
when-to-use: >
  - Cuando una vertical no publica un hecho esperado y hay que declarar el hueco sin
    obligar a la fuente (entrada por el evento `contabilidad.cobertura_calculada`).
  - Cuando depures por qué no se declara nada (sin huecos), por qué el payload es
    inválido (400 INVALID_INPUT) o por qué se publica
    `contabilidad.aviso.solicitar.failed` (503, motor-avisos K2 aún no existe).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la asimetría
    con la vertical subordinada y por qué la declaración no depende de K2.
  - Cuando vayas a escribir/ampliar el test unitario del puente declaracion-fuente-faltante.
tags: [enki, modulo, puente, contabilidad, declaracion-fuente-faltante, cobertura, abierto]
---

# declaracion-fuente-faltante — PUENTE de la declaración del hueco

## Qué hace el módulo

`declaracion-fuente-faltante` es un **PUENTE STATELESS** (A15, hoja del plan): si una
vertical **NO publica un hecho que se NECESITA**, se **DECLARA el hueco** (`[ABIERTO]` +
aviso). **NUNCA se obliga a la fuente a producirlo**: contabilidad **LEE, no impone**
(asimetría con la vertical subordinada). El hueco **no se rellena ni se asume vacío**: se
marca `[ABIERTO]` y se pide el aviso al motor de avisos (K2).

La métrica que revela el hueco es la **ÚNICA de cobertura (A12
`completitud-cobertura`)**: aquí **NO se recalcula** — se **LEE** su `detalle.huecos`
(`recalcula_metrica:false`). Cada clave de la métrica se parsea como
`<pid>:<vertical>:<unidad>` **sin inventar**.

Es **stateless**: sin PosPersistencia ni `project.activated` — reacciona al evento de
dominio y sigue. La dependencia con completitud-cobertura (A12) es por **EVENTO**
(`contabilidad.cobertura_calculada`, fire-and-forget), nunca por `require` cruzado. La
dependencia con **motor-avisos (K2) AÚN NO EXISTE** en el proyecto: el aviso se **PIDE**
por EVENTO (`contabilidad.aviso.solicitar.request`, que K2 declarará en sus subscribes) y
si no contesta se publica **CONTRATO TOLERANTE** (`contabilidad.aviso.solicitar.failed`,
**`503 DEPENDENCIA_NO_DISPONIBLE`**). El hueco **QUEDA DECLARADO igualmente**
(`fuente_faltante_declarada`), porque **la declaración es de contabilidad** y no depende
de que K2 esté vivo. **No se fabrica un aviso que K2 no ha producido.**

> **NO DECLARA ops propias** (sin handlers `.request`): solo reacciona a eventos de
> dominio.

> **NO REUTILIZA**: la asimetría con la vertical subordinada es propia de esta vertical
> (fuente: prisma de interlocutor `verticales`).

## Contrato de eventos (module.json real)

### Subscribes (consumo por evento fire-and-forget)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.cobertura_calculada` | `onCoberturaCalculada` | Fire-and-forget (A12 → A15): completitud-cobertura calculo la cobertura del periodo → {project_id, periodo, esperados, recibidos, huecos, tasa, detalle:{huecos:[clave]}, senal}. Por cada hueco se DECLARA la fuente faltante ([ABIERTO], no se rellena, no se obliga a la fuente) publicando contabilidad.fuente_faltante_declarada, y se PIDE el aviso a motor-avisos (K2) por contabilidad.aviso.solicitar.request. La metrica NO se recalcula: se LEE. Si K2 no responde (AUN NO CONSTRUIDO) → contabilidad.aviso.solicitar.failed (503 DEPENDENCIA_NO_DISPONIBLE, TOLERANTE) y el hueco SIGUE declarado. Sin huecos no se declara nada. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.fuente_faltante_declarada` | Fire-and-forget (A15): el hueco de una fuente quedo DECLARADO → {project_id, tipo:'FUENTE_FALTANTE', hueco:{tipo,clave,project_id,vertical,unidad,periodo,marca:'ABIERTO'}, marca:'ABIERTO', estado:'ABIERTO', vertical, periodo, no_se_obliga_a_la_fuente:true, no_se_asume_vacio:true, declarado_por:'CONTABILIDAD'}. La declaracion es de contabilidad: se emite SIEMPRE, aunque motor-avisos (K2) no este vivo. |
| `contabilidad.aviso.solicitar.request` | Peticion de aviso por EVENTO a motor-avisos (K2): {project_id, origen:'A15_DECLARACION_FUENTE_FALTANTE', tipo:'HUECO_COBERTURA', marca:'ABIERTO', motivo, destinatario:'DUENO', contexto:{vertical, periodo, clave, cobertura}}. K2 la declara en sus subscribes y responde por contabilidad.aviso.solicitar.response. Es un PUERTO: contabilidad PIDE, K2 PRODUCE/ENTREGA el aviso. |
| `contabilidad.fuente_faltante.failed` | Par de fallo determinista: declarar un hueco con payload invalido (400). Cierra el circulo del reflejo interno de declaracion. |
| `contabilidad.fuente_faltante_declarada.failed` | Par de fallo del evento de dominio contabilidad.fuente_faltante_declarada: la emision del hecho de dominio no se completo. |
| `contabilidad.aviso.solicitar.failed` | Contrato TOLERANTE (K2 AUN NO EXISTE): motor-avisos no respondio o rechazo la peticion → 503 DEPENDENCIA_NO_DISPONIBLE. El hueco queda DECLARADO [ABIERTO] igualmente; NO se fabrica un aviso que K2 no ha producido. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.fuente_faltante.failed` cierra el reflejo interno de declaración
> (hueco con payload inválido) y `contabilidad.aviso.solicitar.failed` cierra la
> petición de aviso a K2.

> Nota: `contabilidad.aviso.solicitar.request` está declarada en **`publishes`** y es a
> la vez un PUERTO (petición a K2); K2 la declara en sus **subscribes** y responde por
> `contabilidad.aviso.solicitar.response`. `_rpc` espera esa respuesta.

> Nota: **`contabilidad.fuente_faltante_declarada.failed` está declarada en `publishes`
> pero no se emite en `index.js`** — el puente publica los pares
> `contabilidad.fuente_faltante.failed` y `contabilidad.aviso.solicitar.failed`, no el
> par del evento de dominio.

> Nota: no está en module.json pero sí lo emite index.js — `onCoberturaCalculada` también
> publica `contabilidad.fuente_faltante.failed` (rama `decl.status !== 200`) y
> `contabilidad.aviso.solicitar.failed` (dentro de `_pedirAviso`, si K2 no responde).

## Reglas de negocio

1. **Asimetría con la fuente (invariante rectora)**: contabilidad **LEE, no impone**.
   `no_se_obliga_a_la_fuente:true` y `no_se_asume_vacio:true` acompañan siempre a la
   declaración. El hueco **no se rellena** ni se presupone.
2. **El hueco se marca [ABIERTO]**: `MARCA_ABIERTO = 'ABIERTO'`, `TIPO_HUECO =
   'FUENTE_FALTANTE'`. Toda declaración lleva `marca:'ABIERTO'`, `estado:'ABIERTO'`,
   `declarado_por:'CONTABILIDAD'`.
3. **La métrica NO se recalcula**: `_detectarHueco` **LEE** `cobertura.detalle.huecos`
   (`recalcula_metrica:false`, `metrica:'A12'`). No inventa huecos.
4. **Parseo de la clave sin inventar**: la clave de la métrica es `<pid>:<vertical>:<unidad>`.
   `_detectarHueco` parte por `:`: `project_id` = primera parte, `vertical` = segunda (si
   hay ≥3 partes; si no, primer `verticales_esperadas` o `null`), `unidad` = resto unido
   por `:` (si hay ≥3 partes; si no `null`).
5. **Sin huecos no se declara nada**: si `huecos.length === 0`, devuelve `200
   {project_id, huecos:[], declarado:false}` y **no** publica nada.
6. **La declaración es de contabilidad (se emite SIEMPRE)**: por cada hueco se publica
   `contabilidad.fuente_faltante_declarada` **antes** de pedir el aviso, **independiente**
   de que K2 esté vivo.
7. **Contrato TOLERANTE con motor-avisos (K2)**: `_pedirAviso` hace `_rpc`
   (`timeout_ms:4000`) a `contabilidad.aviso.solicitar.request`; si no hay respuesta o el
   `status !== 200`, publica `contabilidad.aviso.solicitar.failed` con **`503
   DEPENDENCIA_NO_DISPONIBLE`** y `details:{dependencia:'motor-avisos', vertical, clave}`.
   **No se fabrica el aviso.** El hueco sigue declarado.
8. **Aviso al DUENO**: la petición lleva `destinatario:'DUENO'`, `tipo:'HUECO_COBERTURA'`,
   `origen:'A15_DECLARACION_FUENTE_FALTANTE'` y `contexto.cobertura = {esperados,
   recibidos, huecos, tasa}`.
9. **Un evento por hueco**: con N huecos se publican N `fuente_faltante_declarada` (y N
   peticiones de aviso). El handler devuelve al final
   `{project_id, n_huecos, declarado:true}`.
10. **Validación determinista**: `_declarar` con `hueco` ausente/no objeto → `400
    INVALID_INPUT hueco`; sin `project_id` (ni en `input` ni en `hueco`) → `400
    INVALID_INPUT project_id`. Shape: `{ status:400, error:{ code:'INVALID_INPUT',
    message:'<campo> requerido', details:{ field:<campo> } } }`. En ese caso se publica
    `contabilidad.fuente_faltante.failed`.
11. **La ley entra como DATO**: las verticales esperadas, el periodo y las claves son
    datos de la métrica A12 / declaraciones; el puente no cabla verticales.
12. **HTTP exacto**: la declaración con hueco válido → `200`; hueco inválido → `400`; K2
    no disponible → `503` en el par `aviso.solicitar.failed` (el hueco **sigue**
    declarado); no usa `_atender` (no hay RPC propio).

## Cómo se usa (eventos)

Este puente **no tiene RPCs propios**: todo entra por el evento de dominio
`contabilidad.cobertura_calculada`.

### 1. Entrada — cobertura con huecos → se declara cada fuente faltante y se pide el aviso

Entra `contabilidad.cobertura_calculada`:
```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "esperados": 50,
  "recibidos": 46,
  "huecos": 2,
  "tasa": 0.92,
  "detalle": { "huecos": ["e57a318a-...:COMPRA:FAC-2026-0042", "e57a318a-...:CONSUMO:2026-09"] },
  "senal": "...",
  "correlation_id": "abc-123"
}
```
Se publica, por cada hueco, `contabilidad.fuente_faltante_declarada`:
```json
{ "project_id": "e57a318a-...", "tipo": "FUENTE_FALTANTE", "hueco": { "tipo": "FUENTE_FALTANTE", "clave": "e57a318a-...:COMPRA:FAC-2026-0042", "project_id": "e57a318a-...", "vertical": "COMPRA", "unidad": "FAC-2026-0042", "periodo": "2026-09", "marca": "ABIERTO", "no_se_rellena": true, "no_se_obliga_a_la_fuente": true, "metrica": "A12", "recalcula_metrica": false }, "marca": "ABIERTO", "estado": "ABIERTO", "vertical": "COMPRA", "periodo": "2026-09", "aviso_destinatario": "DUENO", "aviso_motivo": "una fuente no publico un hecho esperado: se declara el hueco, no se obliga", "no_se_obliga_a_la_fuente": true, "no_se_asume_vacio": true, "declarado_por": "CONTABILIDAD", "correlation_id": "abc-123" }
```
Y se PIDE el aviso a K2 por `contabilidad.aviso.solicitar.request`:
```json
{ "project_id": "e57a318a-...", "origen": "A15_DECLARACION_FUENTE_FALTANTE", "tipo": "HUECO_COBERTURA", "marca": "ABIERTO", "motivo": "una fuente no publico un hecho esperado: se declara el hueco, no se obliga", "destinatario": "DUENO", "contexto": { "vertical": "COMPRA", "periodo": "2026-09", "clave": "e57a318a-...:COMPRA:FAC-2026-0042", "cobertura": { "esperados": 50, "recibidos": 46, "huecos": 2, "tasa": 0.92 } }, "correlation_id": "abc-123" }
```

### 2. K2 no está vivo → 503 TOLERANTE (el hueco queda declarado)

Si motor-avisos (K2) no responde, se publica `contabilidad.aviso.solicitar.failed`:
```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "motor-avisos (K2) no respondio: el hueco queda DECLARADO [ABIERTO], no se fabrica el aviso", "details": { "dependencia": "motor-avisos", "vertical": "COMPRA", "clave": "e57a318a-...:COMPRA:FAC-2026-0042" } } }
```
La declaración `contabilidad.fuente_faltante_declarada` ya se emitió **igual**.

### 3. Cobertura sin huecos → no se declara nada

```json
{ "project_id": "e57a318a-...", "detalle": { "huecos": [] } }
```
→ `200 {project_id, huecos:[], declarado:false}` sin publicaciones.

### 4. Fallo — hueco inválido

Hueco con payload inválido → `400 INVALID_INPUT` + `contabilidad.fuente_faltante.failed`.

### 5. Tools (sin RPC en module.json)

`toolDetectarHueco` → `_detectarHueco`; `toolDeclarar` → `_declarar`.

## Tests

El test vive en `tests/unit/declaracion-fuente-faltante.test.js`. Cubre:

- Cobertura **con huecos** → por cada hueco emite `contabilidad.fuente_faltante_declarada`
  con `marca:'ABIERTO'`, `no_se_obliga_a_la_fuente:true`, `no_se_asume_vacio:true`, y pide
  el aviso `contabilidad.aviso.solicitar.request`.
- **Sin huecos** → `declarado:false`, sin publicaciones.
- **Parseo de la clave** `<pid>:<vertical>:<unidad>` → `vertical` y `unidad` correctos
  (sin inventar).
- **Contrato TOLERANTE**: K2 no responde → `contabilidad.aviso.solicitar.failed` (503) y
  la declaración **sigue** emitida.
- `_declarar` con hueco inválido → `400 INVALID_INPUT` + `contabilidad.fuente_faltante.failed`.
- La métrica **no se recalcula** (`recalcula_metrica:false`).
- El puente es **stateless**: sin `project.activated` ni persistencia; **no usa
  `_atender`** (sin RPC propio).

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/declaracion-fuente-faltante
node --test tests/unit/declaracion-fuente-faltante.test.js
```

## Notas de implementación

- Clase `DeclaracionFuenteFaltante extends ModuloHibridoReflejo`; `name =
  'declaracion-fuente-faltante'`, `version = 'reflejo-0.1.0'`. **Sin store** (puente
  stateless: no hay `this._store` ni PosPersistencia ni `project.activated`).
- Constantes: `MARCA_ABIERTO='ABIERTO'`, `TIPO_HUECO='FUENTE_FALTANTE'`.
- **No usa `_atender`** (no hay RPCs request/response): el único handler es
  `onCoberturaCalculada`, fire-and-forget. El aviso se pide con `_rpc`
  (`contabilidad.aviso.solicitar.request`, `timeout_ms:4000`).
- Proyecciones puras: `_detectarHueco` (parsea la métrica A12), `_declarar` (marca
  `[ABIERTO]`), `_pedirAviso` (PUERTO a K2, tolerante). `_invalid`/`_rpc` vienen de la
  base.
- Tools: `toolDetectarHueco`, `toolDeclarar`.
- DEP hacia delante: `contabilidad.fuente_faltante_declarada` (lo consumen los avisos /
  la cara del dueño); `contabilidad.aviso.solicitar.request` es el PUERTO a K2
  `motor-avisos` (AÚN NO EXISTE). DEP hacia atrás por evento: A12
  `completitud-cobertura` (entrada `contabilidad.cobertura_calculada`).
