---
name: retenciones
description: >
  Skill FULL del módulo REFLEJO `retenciones` de la vertical contabilidad de Enki.
  LIQUIDA las retenciones de un periodo en sus DOS sentidos: practicadas (las que el
  negocio retuvo a terceros, acreedoras) y soportadas (las que le retuvieron a él,
  deudoras). Deriva del MAYOR, no recalcula asientos; los TIPOS de retención son
  catálogo DECLARABLE por negocio y ejercicio, nunca cableados. Úsala para operar,
  depurar o extender el reflejo, o para entender su contrato de eventos y sus reglas
  de negocio.
when-to-use: >
  - Cuando necesites la liquidación de retenciones de un periodo (RPC
    retenciones.calcular.request).
  - Cuando depures por qué la fuente sale `espejo` en vez de `mayor-balanza`, o por qué
    falta `project_id` (400 INVALID_INPUT), o cómo se agrupa un apunte sin tipo declarado.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de las retenciones (la ley entra como dato, deriva del mayor, determinista).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo retenciones.
tags: [enki, modulo, reflejo, contabilidad, retenciones]
---

# retenciones — REFLEJO STATELESS de las retenciones

## Qué hace el módulo

`retenciones` es un **REFLEJO STATELESS** (D4, hoja del plan): **LIQUIDA las
RETENCIONES** de un periodo en sus **DOS sentidos**:

- **PRACTICADAS**: las que el negocio retuvo a terceros (acreedoras).
- **SOPORTADAS**: las que le retuvieron a él (deudoras).

**Deriva del MAYOR** (`mayor-balanza`, B3); **NO recalcula ni reescribe asientos**.

**LA LEY ENTRA COMO DATO** (invariante 5): los **TIPOS de retención no son constantes
cableadas**. Llegan **DECLARADOS** por negocio y ejercicio (`tipos`, catálogo declarable)
y, por apunte, el `tipo_retencion` declarado en el asiento; sin catálogo cada apunte se
agrupa por su propio tipo declarado, **NUNCA se inventa un porcentaje**. El sentido de las
cuentas es `reglas` declarable; sin declarar se usa la partición estándar por **GRUPO**
(`4751`/`4752` practicadas · `473`/`472` soportadas por prefijo).

La retención por línea respeta base/tipo/retención **DECLARADOS** en el asiento; con
base+tipo declarados se **deriva** (el tipo sigue siendo dato); sin nada declarado, el
importe **ES** el saldo de la cuenta y se declara `procedencia:'derivada_del_saldo'`.
**Determinista**: mismo mayor + mismos tipos declarados → mismas retenciones; cero reloj.

El mayor llega por **dos vías**, ninguna es un `require` cruzado: (1)
`contabilidad.asiento_registrado` (fire-and-forget) → espejo en memoria idempotente por
clave natural; (2) el RPC → se **PIDE** a `mayor-balanza` **POR EVENTO** y, si no
responde, se deriva del espejo (**fuente declarada**). Sin `PosPersistencia` ni
`project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `retenciones.calcular.request` | `onCalcularRequest` | RPC reflejo (calculo puro, determinista): {project_id, ejercicio?, periodo?, regimen?, territorio?, tipos?, reglas?} → {fuente:'mayor-balanza'\|'espejo', tipos_declarados, reglas_declaradas, total_practicado, total_soportado, diferencia, signo:'A_INGRESAR'\|'A_COMPENSAR_O_DEVOLVER'\|'NULA', detalle:{practicadas, soportadas, otro}}. Pide el mayor a mayor-balanza POR EVENTO; si no responde, lo deriva del espejo de asientos registrados. Los TIPOS de retencion son catalogo DECLARABLE (por negocio y ejercicio), no constante. Responde por retenciones.calcular.response; fallo (project_id ausente) → retenciones.calcular.failed. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → D4): el diario registro un asiento → se acumula la muestra en el espejo en memoria (idempotente por clave natural o numero; un hecho = un asiento). No muta el libro ni recalcula asientos. |

### Publishes

| Evento | Descripción |
|---|---|
| `retenciones.calcular.response` | Respuesta RPC correlada de retenciones.calcular.request → {request_id, status:200, data:{fuente, total_practicado, total_soportado, diferencia, signo, tipos_declarados, detalle:{practicadas, soportadas, otro}}}. Emitida por el helper _atender. |
| `retenciones.calcular.failed` | Par de fallo determinista (D4): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de retenciones.calcular.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `retenciones.calcular.failed` cierra el círculo de `retenciones.calcular.request`
> cuando `_calcular` devuelve status ≠ 200 (`project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onAsientoRegistrado` (fire-and-forget)
> **devuelve `null` siempre** y **no publica ningún evento**: solo acumula la muestra en
> el espejo (idempotente por `clave_natural`/`numero`). Si el payload no trae
> `project_id`/`asiento`/clave, devuelve `null` sin tocar el espejo.

> Nota: no figura en `module.json` pero lo **pide** `index.js` en `_mayor`: la RPC
> saliente `mayor-balanza.saldos.request` con `{project_id, ejercicio}` y
> `timeout_ms:4000`. Es una dependencia (DEP) por evento, no un evento emitido.

## Reglas de negocio

1. **Fallo determinista**: `_calcular` toma `input.project_id || this.project_id`;
   ausente → `400 INVALID_INPUT` (`field:'project_id'`).
2. **El mayor se pide, no se recalcula**: `_mayor(pid, input)` pide
   `mayor-balanza.saldos.request`; si responde `200` con `data.mayor` (array) →
   `fuente:'mayor-balanza'`; si no responde o no trae el mayor → se deriva del espejo
   (`_derivarMayor`) y `fuente:'espejo'`. La fuente se **declara**.
3. **Derivación de respaldo desde el espejo**: `_derivarMayor(pid)` acumula debe/haber
   por cuenta, conserva como DATO el `tipo_retencion`/`base_retencion`/`retencion` del
   primer apunte que los declare, redondea a 2 decimales, calcula `saldo = debe - haber`
   y ordena por `localeCompare`.
4. **Reglas DECLARABLES**: `_reglas(raw)` acepta `[{prefijo, sentido}]`; filtra los
   inválidos, normaliza `prefijo` a String y `sentido` a MAYÚSCULAS. Sin array o vacío →
   `REGLAS_DEFECTO` (`4751`/`4752`→PRACTICADA, `473`/`472`→SOPORTADA). **No se cablea la
   composición legal.**
5. **Clasificación por prefijo MÁS LARGO (determinista)**: `_sentidoDe(cuenta, reglas)`
   elige la regla cuyo prefijo casa con `codigo.startsWith(prefijo)` y es **más largo**;
   sin regla que case → `'OTRO'`.
6. **La retención por línea es DECLARADA o derivada del saldo** (`_retencionDeclarada`):
   - con `retencion` declarada → `procedencia:'declarada'` (tipo/base tal cual);
   - sin retención pero con **base+tipo declarados** → `retencion = round(base × tipo, 2)`
     y `procedencia:'derivada_de_base_y_tipo_declarados'` (**el tipo sigue siendo dato**);
   - sin nada declarado → la retención **ES** el `|saldo|` de la cuenta y
     `procedencia:'derivada_del_saldo'` (no se estima porcentaje).
   `tipo` puede ser `null` (no se inventa).
7. **Cada línea a su sentido**: `{cuenta, tipo, base, retencion, procedencia}` en
   `practicadas` / `soportadas` / `otro`.
8. **Agregados de la liquidación de retenciones**:
   `total_practicado = round(Σ retencion practicadas, 2)`;
   `total_soportado = round(Σ retencion soportadas, 2)`;
   `diferencia = round(total_practicado − total_soportado, 2)`.
9. **El signo es del libro, no un juicio cableado**: `diferencia > 0` → `'A_INGRESAR'`;
   `diferencia < 0` → `'A_COMPENSAR_O_DEVOLVER'`; `0` → `'NULA'`.
10. **Los TIPOS son DATO declarable**: `_tiposDe(pid, ejercicio, declarados)` recuerda el
    catálogo declarado por `project_id` + `ejercicio`; con `declarados` (array) lo guarda
    y lo devuelve; sin declarar, devuelve el último recordado o `null`. **No se cablea
    ningún porcentaje de retención.**
11. **Etiquetas**: `ejercicio`, `periodo` (String), `regimen`, `territorio` se propagan
    del input o quedan `null`.
12. **El espejo es idempotente**: clave = `asiento.clave_natural` o `asiento.numero`; la
    misma clave no se duplica; sin clave no se refleja.
13. **Sin estado persistente**: sin `PosPersistencia`, sin `onProjectActivated`.
14. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender`
    → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `retenciones.calcular.response`.

### 1. `calcular` — la liquidación de retenciones

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "periodo": "2026-3T",
  "regimen": "IRPF",
  "tipos": [ { "tipo": 0.15, "nombre": "trabajo" }, { "tipo": 0.19, "nombre": "capital mobiliario" } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "periodo": "2026-3T",
  "regimen": "IRPF",
  "territorio": null,
  "fuente": "mayor-balanza",
  "tipos_declarados": [ { "tipo": 0.15, "nombre": "trabajo" }, { "tipo": 0.19, "nombre": "capital mobiliario" } ],
  "reglas_declaradas": null,
  "total_practicado": 150,
  "total_soportado": 45,
  "diferencia": 105,
  "signo": "A_INGRESAR",
  "detalle": {
    "practicadas": [ { "cuenta": "4751", "tipo": 0.15, "base": 1000, "retencion": 150, "procedencia": "declarada" } ],
    "soportadas": [ { "cuenta": "473", "tipo": 0.15, "base": 300, "retencion": 45, "procedencia": "derivada_de_base_y_tipo_declarados" } ],
    "otro": []
  }
}
```

Sin `reglas`, se usan las de defecto (`4751`/`4752`→PRACTICADA, `473`/`472`→SOPORTADA).
Si `mayor-balanza` no responde en `4000 ms`, la misma respuesta sale con `fuente:'espejo'`.

### 2. Fire-and-forget — reacción a `contabilidad.asiento_registrado`

`onAsientoRegistrado` acumula la muestra del asiento en el espejo (idempotente por
clave) para poder derivar el mayor si B3 no responde. **Devuelve `null`** y **no publica**
ningún evento.

### 3. Fallo — falta `project_id`

```json
{ "ejercicio": "2026", "periodo": "2026-3T" }
```

Respuesta `400` + `retenciones.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/retenciones.test.js`. Cubre:

- `calcular` con el mayor servido por `mayor-balanza` → `200 fuente:'mayor-balanza'`,
  `total_practicado`/`total_soportado`/`diferencia` y `signo` correctos.
- `reglas` declaradas → sentido propio; sin `reglas` → partición por defecto por grupo.
- Retención por línea: declarada; derivada de base+tipo declarados; derivada del saldo
  (`procedencia` correspondiente) — **sin inventar porcentaje**.
- Diferencia negativa → `signo:'A_COMPENSAR_O_DEVOLVER'` (resultado declarado, no error).
- `calcular` cuando `mayor-balanza` **no** responde → `fuente:'espejo'` derivada de
  `contabilidad.asiento_registrado`.
- `tipos` declarados se recuerdan por proyecto+ejercicio (`tipos_declarados`).
- Prefijo más largo gana (p. ej. `4751` casa antes que `4752`/`473`).
- `calcular` sin `project_id` → `400 INVALID_INPUT` + `retenciones.calcular.failed`.
- `onAsientoRegistrado` refleja y devuelve `null` sin publicar evento.
- `toolCalcular` devuelve la misma proyección que `_calcular`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `Retenciones extends ModuloHibridoReflejo`; `name = 'retenciones'`,
  `version = 'reflejo-0.1.0'`. Espejo `this._espejo` (`Map<project_id, Map<clave, asiento>>`)
  y catálogo declarado `this._tipos` (`Map<project_id, Map<ejercicio, [tipo]>>`).
  Sin `PosPersistencia`.
- Constante `REGLAS_DEFECTO = [{prefijo:'4751',sentido:'PRACTICADA'}, {prefijo:'4752',
  sentido:'PRACTICADA'}, {prefijo:'473',sentido:'SOPORTADA'}, {prefijo:'472',
  sentido:'SOPORTADA'}]`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/retenciones/`).
- `onCalcularRequest` usa `this._atender(e, 'calcular', 'retenciones.calcular.response',
  async (d) => {...})` y dentro publica `retenciones.calcular.failed` si `status !== 200`.
  `onAsientoRegistrado` **no** usa `_atender`.
- Proyección `_calcular(input)` (`async`, pide el mayor por evento); helpers `_retencionDeclarada`,
  `_mayor`, `_derivarMayor`, `_reglas`, `_sentidoDe`, `_tiposDe`, `_espejoDe`, `_num`.
  Tool `toolCalcular`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `mayor-balanza.saldos.request` (B3) por evento; lo alimenta
  `contabilidad.asiento_registrado` (B2).
- **LA LEY COMO DATO**: los tipos de retención (porcentajes), el régimen y las reglas de
  sentido son **catálogos declarables por negocio y ejercicio** — el módulo **PREPARA**
  la liquidación; el **asesor presenta y firma**.
