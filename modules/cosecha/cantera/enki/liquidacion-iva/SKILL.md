---
name: liquidacion-iva
description: >
  Skill FULL del módulo REFLEJO `liquidacion-iva` de la vertical contabilidad de Enki.
  LIQUIDA el IVA de un periodo: devengado (repercutido) menos soportado (deducible) →
  cuota. Deriva del MAYOR, no recalcula asientos; los TIPOS de IVA son catálogo
  DECLARABLE por negocio y ejercicio, nunca cableados. Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites la liquidación de IVA de un periodo (RPC
    liquidacion-iva.calcular.request).
  - Cuando depures por qué la fuente sale `espejo` en vez de `mayor-balanza`, o por qué
    falta `project_id` (400 INVALID_INPUT), o cómo se agrupa un apunte sin tipo declarado.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la liquidación (la ley entra como dato, deriva del mayor, determinista).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo liquidacion-iva.
tags: [enki, modulo, reflejo, contabilidad, liquidacion-iva]
---

# liquidacion-iva — REFLEJO STATELESS del IVA

## Qué hace el módulo

`liquidacion-iva` es un **REFLEJO STATELESS** (D1, hoja del plan): **LIQUIDA el IVA**
de un periodo — **IVA DEVENGADO (repercutido) − IVA SOPORTADO (deducible) → CUOTA**.
**Deriva del MAYOR** (`mayor-balanza`, B3); **NO recalcula ni reescribe asientos**.

**LA LEY ENTRA COMO DATO** (invariante 5): los **TIPOS de IVA no son constantes
cableadas**. Llegan **DECLARADOS** por negocio y ejercicio (`tipos`, catálogo declarable
del régimen común/foral/Canarias/Ceuta-Melilla → IVA/IGIC/IPSI) y, por apunte, el
`tipo_iva` declarado en el asiento — sin catálogo, cada apunte se agrupa por su propio
tipo declarado, **NUNCA se inventa un tipo**. El sentido de las cuentas tampoco se
cablea: `reglas` es declarable; sin declarar se usa la composición por defecto por
**GRUPO** de cuenta (`477` devengado / `472` soportado / `470` devengado).

La cuota por línea respeta base/tipo/cuota **DECLARADOS** en el asiento; si solo hay
base+tipo declarados, se **deriva** de ellos (el tipo sigue siendo dato); si no hay nada
declarado, el importe del IVA **ES** el saldo de la cuenta de IVA del libro y se declara
`procedencia:'derivada_del_saldo'`. **Determinista**: mismo mayor + mismos tipos
declarados → misma liquidación; cero reloj.

El mayor llega por **dos vías**, ninguna es un `require` cruzado: (1)
`contabilidad.asiento_registrado` (fire-and-forget) → espejo en memoria idempotente por
clave natural; (2) el RPC → se **PIDE** a `mayor-balanza` **POR EVENTO** y, si no
responde, se deriva del espejo (**fuente declarada**). Sin `PosPersistencia` ni
`project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `liquidacion-iva.calcular.request` | `onCalcularRequest` | RPC reflejo (calculo puro, determinista): {project_id, ejercicio?, periodo?, regimen?, territorio?, tipos?, reglas?} → {regimen, territorio, fuente:'mayor-balanza'\|'espejo', tipos_declarados, reglas_declaradas, total_devengado, total_soportado, cuota, signo:'A_INGRESAR'\|'A_COMPENSAR_O_DEVOLVER'\|'NULA', detalle:{devengado, soportado, otro}}. Pide el mayor a mayor-balanza POR EVENTO; si no responde, lo deriva del espejo de asientos registrados. Los TIPOS de IVA son catalogo DECLARABLE (por negocio y ejercicio), no constante. Responde por liquidacion-iva.calcular.response; fallo (project_id ausente) → liquidacion-iva.calcular.failed. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → D1): el diario registro un asiento → se acumula la muestra en el espejo en memoria (idempotente por clave natural o numero; un hecho = un asiento). No muta el libro ni recalcula asientos. |

### Publishes

| Evento | Descripción |
|---|---|
| `liquidacion-iva.calcular.response` | Respuesta RPC correlada de liquidacion-iva.calcular.request → {request_id, status:200, data:{fuente, total_devengado, total_soportado, cuota, signo, tipos_declarados, detalle:{devengado, soportado, otro}}}. Emitida por el helper _atender. |
| `liquidacion-iva.calcular.failed` | Par de fallo determinista (D1): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de liquidacion-iva.calcular.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `liquidacion-iva.calcular.failed` cierra el círculo de
> `liquidacion-iva.calcular.request` cuando `_calcular` devuelve status ≠ 200
> (`project_id` ausente).

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
   por cuenta desde los asientos reflejados, conserva como DATO el `tipo_iva`/`base_iva`/
   `cuota_iva` del primer apunte que los declare, redondea a 2 decimales, calcula
   `saldo = debe - haber` y ordena por `localeCompare`.
4. **Reglas DECLARABLES**: `_reglas(raw)` acepta `[{prefijo, lado}]`; filtra los
   inválidos, normaliza `prefijo` a String y `lado` a MAYÚSCULAS. Sin array o vacío →
   `REGLAS_DEFECTO` (`477`→DEVENGADO, `472`→SOPORTADO, `470`→DEVENGADO). **No se cablea
   la composición legal.**
5. **Clasificación por prefijo MÁS LARGO (determinista)**: `_ladoDe(cuenta, reglas)`
   elige la regla cuyo prefijo casa con `codigo.startsWith(prefijo)` y es **más largo**;
   sin regla que case → `'OTRO'`.
6. **La cuota por línea es DECLARADA o derivada del saldo** (`_cuotaDeclarada`):
   - con `cuota_iva` declarada → `procedencia:'declarada'` (tipo/base tal cual);
   - sin cuota pero con **base+tipo declarados** → `cuota = round(base × tipo, 2)` y
     `procedencia:'derivada_de_base_y_tipo_declarados'` (**el tipo sigue siendo dato, no
     constante**);
   - sin nada declarado → la cuota **ES** el `|saldo|` de la cuenta y
     `procedencia:'derivada_del_saldo'` (no se estima tipo).
   `tipo` puede ser `null` (no se inventa).
7. **Cada línea al lado que le toca**: `{cuenta, tipo, base, cuota, procedencia}` en
   `devengado` / `soportado` / `otro`.
8. **Agregados de la liquidación**:
   `total_devengado = round(Σ cuota devengado, 2)`;
   `total_soportado = round(Σ cuota soportado, 2)`;
   `cuota = round(total_devengado − total_soportado, 2)`.
9. **El signo es del libro, no un juicio cableado**: `cuota > 0` → `'A_INGRESAR'`;
   `cuota < 0` → `'A_COMPENSAR_O_DEVOLVER'` (una cuota negativa es un resultado
   declarado, **no un error**); `0` → `'NULA'`.
10. **Los TIPOS son DATO declarable**: `_tiposDe(pid, ejercicio, declarados)` recuerda el
    catálogo declarado por `project_id` + `ejercicio`; con `declarados` (array) lo guarda
    y lo devuelve; sin declarar, devuelve el último recordado o `null`. **No se cablea
    ningún tipo de IVA.**
11. **Etiquetas**: `ejercicio`, `periodo` (String), `regimen`, `territorio` se propagan
    del input o quedan `null`.
12. **El espejo es idempotente**: clave = `asiento.clave_natural` o `asiento.numero`; la
    misma clave no se duplica; sin clave no se refleja.
13. **Sin estado persistente**: sin `PosPersistencia`, sin `onProjectActivated`.
14. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender`
    → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `liquidacion-iva.calcular.response`.

### 1. `calcular` — la liquidación de IVA

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "periodo": "2026-3T",
  "regimen": "IVA",
  "territorio": "comun",
  "tipos": [ { "tipo": 0.21, "nombre": "general" }, { "tipo": 0.10, "nombre": "reducido" } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "periodo": "2026-3T",
  "regimen": "IVA",
  "territorio": "comun",
  "fuente": "mayor-balanza",
  "tipos_declarados": [ { "tipo": 0.21, "nombre": "general" }, { "tipo": 0.10, "nombre": "reducido" } ],
  "reglas_declaradas": null,
  "total_devengado": 210,
  "total_soportado": 100,
  "cuota": 110,
  "signo": "A_INGRESAR",
  "detalle": {
    "devengado": [ { "cuenta": "477", "tipo": 0.21, "base": 1000, "cuota": 210, "procedencia": "declarada" } ],
    "soportado": [ { "cuenta": "472", "tipo": 0.10, "base": 1000, "cuota": 100, "procedencia": "derivada_de_base_y_tipo_declarados" } ],
    "otro": []
  }
}
```

Sin `reglas`, se usan las de defecto (`477`→DEVENGADO, `472`→SOPORTADO, `470`→DEVENGADO).
Si `mayor-balanza` no responde en `4000 ms`, la misma respuesta sale con `fuente:'espejo'`.
Una cuota negativa sale con `signo:'A_COMPENSAR_O_DEVOLVER'` (**no es un error**).

### 2. Fire-and-forget — reacción a `contabilidad.asiento_registrado`

`onAsientoRegistrado` acumula la muestra del asiento en el espejo (idempotente por
clave) para poder derivar el mayor si B3 no responde. **Devuelve `null`** y **no publica**
ningún evento.

### 3. Fallo — falta `project_id`

```json
{ "ejercicio": "2026", "periodo": "2026-3T" }
```

Respuesta `400` + `liquidacion-iva.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/liquidacion-iva.test.js`. Cubre:

- `calcular` con el mayor servido por `mayor-balanza` → `200 fuente:'mayor-balanza'`,
  `total_devengado`/`total_soportado`/`cuota` y `signo` correctos.
- `reglas` declaradas → clasificación propia; sin `reglas` → composición por defecto.
- Cuota por línea: declarada; derivada de base+tipo declarados; derivada del saldo
  (`procedencia` correspondiente) — **sin inventar tipo**.
- Cuota negativa → `signo:'A_COMPENSAR_O_DEVOLVER'` (resultado declarado, no error).
- `calcular` cuando `mayor-balanza` **no** responde → `fuente:'espejo'` derivada de
  `contabilidad.asiento_registrado`.
- `tipos` declarados se recuerdan por proyecto+ejercicio (`tipos_declarados`).
- Prefijo más largo gana (p. ej. `477` casa antes que `470`).
- `calcular` sin `project_id` → `400 INVALID_INPUT` + `liquidacion-iva.calcular.failed`.
- `onAsientoRegistrado` refleja y devuelve `null` sin publicar evento.
- `toolCalcular` devuelve la misma proyección que `_calcular`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `LiquidacionIva extends ModuloHibridoReflejo`; `name = 'liquidacion-iva'`,
  `version = 'reflejo-0.1.0'`. Espejo `this._espejo` (`Map<project_id, Map<clave, asiento>>`)
  y catálogo declarado `this._tipos` (`Map<project_id, Map<ejercicio, [tipo]>>`).
  Sin `PosPersistencia`.
- Constante `REGLAS_DEFECTO = [{prefijo:'477',lado:'DEVENGADO'}, {prefijo:'472',
  lado:'SOPORTADO'}, {prefijo:'470',lado:'DEVENGADO'}]`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/liquidacion-iva/`).
- `onCalcularRequest` usa `this._atender(e, 'calcular', 'liquidacion-iva.calcular.response',
  async (d) => {...})` y dentro publica `liquidacion-iva.calcular.failed` si
  `status !== 200`. `onAsientoRegistrado` **no** usa `_atender`.
- Proyección `_calcular(input)` (`async`, pide el mayor por evento); helpers `_cuotaDeclarada`,
  `_mayor`, `_derivarMayor`, `_reglas`, `_ladoDe`, `_tiposDe`, `_espejoDe`, `_num`.
  Tool `toolCalcular`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `mayor-balanza.saldos.request` (B3) por evento; lo alimenta
  `contabilidad.asiento_registrado` (B2). Lo LEE `modelo-303` (D2) y `modelo-390` (D3) por
  evento vía `liquidacion-iva.calcular.request`.
- **LA LEY COMO DATO**: los tipos de IVA/IGIC/IPSI, el régimen, el territorio y las
  reglas de sentido son **catálogos declarables por negocio y ejercicio** — el módulo
  **PREPARA** la liquidación; el **asesor presenta y firma**.
