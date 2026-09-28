---
name: compra-proveedor
description: >
  Skill FULL del módulo REFLEJO `compra-proveedor` de la vertical contabilidad de
  Enki (N5+N7, hoja del plan). La compra VERIFICADA antes de asentar: (N5) cotejo
  pedido ↔ recepción ↔ factura — lo que NO cuadra va a la cola de revisión y JAMÁS se
  asienta "casi cuadrado"; (N7) ajuste del COSTE REAL por rappels, pronto-pago,
  descuentos y anticipos — a lo realmente pagado. El ajuste SUMA, NUNCA borra.
  Determinista y sin estado. Contrato TOLERANTE: si mayor-balanza no está viva, los
  anticipos se leen solo del payload y la ausencia se declara (`anticipos_fuente:
  'NO_DISPONIBLE'`); si hay que certificar y falta la fuente → 503, nunca un coste
  inventado. Úsala para operar, depurar o extender el reflejo.
when-to-use: >
  - Cuando necesites cotejar una compra pedido/recepción/factura
    (RPC contabilidad.compra.cotejar.request) o ajustar su coste real
    (RPC contabilidad.compra.coste_real.request).
  - Cuando depures por qué el cotejo descuadra (DESCUADRE + señal a cola), por qué el
    coste real sale 503 (mayor-balanza no disponible al certificar) o por qué falta
    factura/pedido/recepción (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el cotejo
    declarable y por qué el ajuste suma sin borrar.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo compra-proveedor.
tags: [enki, modulo, reflejo, contabilidad, compra-proveedor, cotejo, coste-real]
---

# compra-proveedor — REFLEJO de la compra verificada

## Qué hace el módulo

`compra-proveedor` es un **REFLEJO STATELESS** (N5+N7, hoja del plan): **la compra
VERIFICADA antes de asentar**. Cubre dos operaciones puras:

- **(N5) Cotejo `pedido ↔ recepción ↔ factura`**: lo que **NO cuadra** va a la **cola de
  revisión** (A8.1) y **JAMÁS** se asienta "casi cuadrado". También difiere **por línea**
  (cantidad e importe).
- **(N7) Ajuste del COSTE REAL** por rappels, pronto-pago, descuentos y anticipos — a
  **lo realmente pagado**. **El ajuste SUMA, NUNCA borra** (invariante de corrección del
  dominio).

Es **stateless**: sin PosPersistencia ni `project.activated` — **cada op entra objeto,
sale objeto**, y el cálculo es **DETERMINISTA** (mismas entradas → mismo cotejo/ajuste;
un test lo afirma). Las dependencias se leen **por EVENTO**, nunca por `require` cruzado:

- **maestro-terceros (N1)** → `contabilidad.tercero.identificar.request` (opcional:
  cuando el payload solo trae el NIF).
- **mayor-balanza (B3)** → `contabilidad.mayor.movimientos.request` (para los anticipos ya
  asentados; **AÚN NO EXISTE**).

**CONTRATO TOLERANTE**: si mayor-balanza no está viva **no se fabrican anticipos** — el
ajuste se calcula con lo **DECLARADO** en el payload y la ausencia se marca
(`anticipos_fuente:'NO_DISPONIBLE'`). Si hay que **CERTIFICAR** "a lo realmente pagado"
(`certificar:true`) y falta la fuente → **`503 DEPENDENCIA_NO_DISPONIBLE`**; **nunca** un
coste real inventado. El **COTEJO es DECLARABLE**: si el negocio declara que **no**
coteja (`coteja:false`, pieza `[ABIERTO]`) se asienta directo **PERO SE DECLARA**
(`se_declara:true`).

> **NO REUTILIZA**: no existe cotejo compra/recepción/factura en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.compra.cotejar.request` | `onCotejarRequest` | RPC reflejo (N5): {project_id, pedido?, recepcion?, factura, coteja?:false, proveedor?\|nif?, tolerancia?} → {project_id, coteja, cuadra, resultado:'CUADRA'\|'DESCUADRE', suma_factura, vs_pedido:{total,descuadre,cuadra,lineas:[...]}, vs_recepcion:{...}, descuadres, n_descuadres, senal, proveedor, proveedor_fuente}. Coteja pedido <-> recepcion <-> factura ANTES de asentar; lo que no cuadra → senal de excepcion a la cola de revision (A8.1) y JAMAS se asienta 'casi cuadrado'. Si el negocio declara que NO coteja (coteja:false) se asienta directo pero SE DECLARA. Determinista. Publica contabilidad.compra_cotejada y responde por contabilidad.compra.cotejar.response; si falta project_id/factura o no hay pedido ni recepcion → contabilidad.compra.cotejar.failed. |
| `contabilidad.compra.coste_real.request` | `onCoste_realRequest` | RPC reflejo (N7): {project_id, factura, descuentos?:[{tipo,importe}], anticipos?:[{asiento,importe}], certificar?} → {project_id, coste_bruto, descuentos, total_descuentos, anticipos, total_anticipos, coste_real, ajuste, signo_ajuste:'SUMA', no_borra:true, anticipos_fuente:'PAYLOAD'\|'MAYOR_BALANZA'\|'NO_DISPONIBLE'}. Ajusta el coste a lo REALMENTE pagado (rappels, pronto-pago, descuentos, anticipos); el ajuste SUMA y nunca borra. Los anticipos salen del payload o de mayor-balanza (B3) por EVENTO; si hace falta certificar y B3 no esta viva → 503 DEPENDENCIA_NO_DISPONIBLE (no se fabrica). Publica contabilidad.compra_cotejada; error → contabilidad.compra.coste_real.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.compra_cotejada` | Fire-and-forget (N5/N7): la compra quedo verificada → {op:'cotejar'\|'coste_real', project_id, cuadra?, resultado?, descuadres?\|coste_real, ajuste, no_borra:true, ...}. El cotejo cuadra o senala excepcion a la cola (A8.1); el coste real ajusta a lo pagado SUMANDO el ajuste. Lo consume la admision/el libro para asentar con base. |
| `contabilidad.compra.cotejar.failed` | Par de fallo determinista: cotejar sin project_id/factura (400) o sin pedido ni recepcion (400). Cierra el circulo de contabilidad.compra.cotejar.request. |
| `contabilidad.compra.coste_real.failed` | Par de fallo determinista: coste_real sin project_id/factura (400) o mayor-balanza (B3) no disponible al certificar los anticipos (503 DEPENDENCIA_NO_DISPONIBLE — contrato TOLERANTE: no se fabrica el coste real). Cierra el circulo de contabilidad.compra.coste_real.request. |
| `contabilidad.compra_cotejada.failed` | Par de fallo del evento de dominio contabilidad.compra_cotejada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.compra.cotejar.failed` cierra `contabilidad.compra.cotejar.request`
> y `contabilidad.compra.coste_real.failed` cierra
> `contabilidad.compra.coste_real.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.compra.cotejar.response` y `contabilidad.compra.coste_real.response`
> (los pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: **`contabilidad.compra_cotejada.failed` está declarada en `publishes` pero no se
> emite en `index.js`** — el reflejo solo publica los pares de fallo de sus RPC.

> Nota: no está en module.json pero sí lo emite index.js en `_fichaProveedor` /
> `_anticiposAsentados` — el módulo publica por `_rpc`
> `contabilidad.tercero.identificar.request` y `contabilidad.mayor.movimientos.request`
> (dependencias por EVENTO, no declaradas como publishers).

## Reglas de negocio

1. **Cotejo antes de asentar (N5)**: `_cotejar` exige `project_id`, `factura` (objeto)
   y **al menos** `pedido` o `recepcion`. Compara el **total** de cada fuente contra la
   **suma de la factura** y devuelve `cuadra` (booleano) y `resultado:'CUADRA'|'DESCUADRE'`.
2. **Lo que no cuadra NO se asienta**: si `coteja === true` y `cuadra === false` →
   `senal:'excepcion_a_cola_revision'`; *jamás* se asienta "casi cuadrado".
3. **El cotejo es DECLARABLE**: `coteja = !(input.coteja === false)`. Con
   `coteja:false` se asienta directo **pero se declara**
   (`se_declara:true`, `nota:'el negocio declara que NO coteja: se asienta directo y SE
   DECLARA'`) y `senal:null`.
4. **Tolerancia declarable**: `tolerancia = input.tolerancia` si es número `≥ 0`, si no
   `TOLERANCIA_DEFECTO = 0.01`. Un descuadre dentro de la tolerancia **cuadra**
   (`|descuadre| <= tolerancia`).
5. **Diferencia por línea**: `_lineasDescuadradas` agrupa por clave
   (`articulo|codigo|referencia|descripcion|concepto`, en mayúsculas) y reporta
   `{ articulo, importe_origen, importe_factura, descuadre_importe, cantidad_origen,
   cantidad_factura, descuadre_cantidad }` cuando el importe excede la tolerancia o la
   cantidad difiere.
6. **El ajuste SUMA, NUNCA borra (N7)**: `_ajustarCosteReal` calcula
   `coste_real = bruto - total_descuentos - total_anticipos` y devuelve
   `ajuste = bruto - coste_real` con `signo_ajuste:'SUMA'` y `no_borra:true`.
7. **Anticipos tolerantes**: `_anticiposAsentados` toma los anticipos del payload
   (`input.anticipos` | `input.anticipos_asentados`, `fuente:'PAYLOAD'`) o de
   mayor-balanza (filtrando `m.anticipo === true`, `fuente:'MAYOR_BALANZA'`); si B3 no
   responde → `{ anticipos:[], fuente:'NO_DISPONIBLE' }`.
8. **Certificar exige fuente**: con `certificar:true` y `anticipos_fuente ===
   'NO_DISPONIBLE'` → **`503 DEPENDENCIA_NO_DISPONIBLE`** con
   `{ dependencia:'mayor-balanza', op:'coste_real', accion:'NO_FABRICAR_PUBLICAR_FALLO' }`.
   *No se fabrica el coste real.*
9. **Ficha del proveedor tolerante (N1)**: del payload (`fuente:'PAYLOAD'`) o pedida a
   maestro-terceros por NIF (`fuente:'MAESTRO_TERCEROS'`); sin NIF →
   `fuente:'SIN_NIF'`; si el maestro no responde → `fuente:'NO_DISPONIBLE'` con
   `proveedor:null` (**no se inventa la ficha**).
10. **Determinista**: mismos datos de entrada → mismo cotejo/ajuste (`determinista:true`).
    Todos los importes se redondean a 2 decimales (`_round(x, 2)`).
11. **Validaciones deterministas**: en `cotejar` falta `project_id` → `400 INVALID_INPUT
    project_id`; `factura` ausente/no objeto → `400 INVALID_INPUT factura`; sin pedido ni
    recepción → `400 INVALID_INPUT pedido/recepcion`. En `coste_real` falta `project_id`
    → `400 INVALID_INPUT project_id`; `factura`/`asiento` ausente → `400 INVALID_INPUT
    factura`. Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo>
    requerido', details:{ field:<campo> } } }`.
12. **HTTP exacto**: éxito `200`; payload inválido → `400`; certificar sin fuente → `503`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responden en `contabilidad.compra.cotejar.response` y
`contabilidad.compra.coste_real.response`.

### 1. `cotejar` — la compra cuadra

```json
{
  "project_id": "e57a318a-...",
  "pedido": { "total": 121, "lineas": [{ "articulo": "A1", "base": 100, "cuota": 21, "cantidad": 2 }] },
  "recepcion": { "total": 121, "lineas": [{ "articulo": "A1", "base": 100, "cuota": 21, "cantidad": 2 }] },
  "factura": { "lineas": [{ "articulo": "A1", "base": 100, "cuota": 21, "cantidad": 2 }] },
  "nif": "B12345678",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "op": "cotejar",
  "project_id": "e57a318a-...",
  "proveedor": { "id_tercero": "prov-1", "nif": "B12345678" },
  "proveedor_fuente": "MAESTRO_TERCEROS",
  "coteja": true,
  "cuadra": true,
  "resultado": "CUADRA",
  "suma_factura": 121,
  "vs_pedido": { "contra": "PEDIDO", "disponible": true, "total": 121, "descuadre": 0, "cuadra": true, "lineas": [] },
  "vs_recepcion": { "contra": "RECEPCION", "disponible": true, "total": 121, "descuadre": 0, "cuadra": true, "lineas": [] },
  "descuadres": [], "n_descuadres": 0, "tolerancia": 0.01,
  "senal": null, "determinista": true
}
```
Emite `contabilidad.compra_cotejada` (res.data + `correlation_id`).

### 2. `cotejar` — descuadre → señal a la cola (NO se asienta)

Con `pedido.total:150` y `factura` sumando `121` → `cuadra:false`, `resultado:'DESCUADRE'`,
`n_descuadres:1`, `senal:'excepcion_a_cola_revision'`, y `vs_pedido.lineas` con las
diferencias por línea. Emite igualmente `contabilidad.compra_cotejada`.

### 3. `cotejar` — el negocio declara que NO coteja

Con `"coteja": false` → se asienta directo con `se_declara:true` y la nota.

### 4. `coste_real` — ajuste a lo realmente pagado (el ajuste suma)

```json
{
  "project_id": "e57a318a-...",
  "factura": { "total": 1210, "lineas": [] },
  "descuentos": [{ "tipo": "RAPPEL", "importe": 10 }, { "tipo": "PRONTO_PAGO", "importe": 5 }],
  "anticipos": [{ "asiento": "A-1", "importe": 100 }],
  "correlation_id": "abc-124"
}
```
Respuesta `200`:
```json
{ "op": "coste_real", "project_id": "e57a318a-...", "factura": null, "coste_bruto": 1210, "descuentos": [{ "tipo": "RAPPEL", "importe": 10 }, { "tipo": "PRONTO_PAGO", "importe": 5 }], "total_descuentos": 15, "anticipos": [{ "id_asiento": "A-1", "importe": 100 }], "total_anticipos": 100, "coste_real": 1095, "ajuste": 115, "signo_ajuste": "SUMA", "no_borra": true, "determinista": true, "anticipos_fuente": "PAYLOAD", "anticipos_disponible": true, "suma": true }
```
Emite `contabilidad.compra_cotejada`.

### 5. `coste_real` — certificar sin mayor-balanza → 503 (TOLERANTE)

Con `"certificar": true` y sin anticipos en el payload y B3 no viva → `503` +
`contabilidad.compra.coste_real.failed`:
```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "mayor-balanza (B3) no esta disponible: no se fabrican los anticipos del coste real", "details": { "dependencia": "mayor-balanza", "op": "coste_real", "accion": "NO_FABRICAR_PUBLICAR_FALLO" } } }
```

### 6. Fallo — payload inválido

En `cotejar` sin pedido ni recepción → `400 INVALID_INPUT` con
`{ field: 'pedido/recepcion' }` + `contabilidad.compra.cotejar.failed`.

### 7. Tools (sin RPC en module.json)

`toolCotejar` → `_cotejar`; `toolCosteReal` → `_costeReal`;
`toolAjustarCosteReal` → `_ajustarCosteReal`.

## Tests

El test vive en `tests/unit/compra-proveedor.test.js`. Cubre:

- `cotejar` con pedido/recepción/factura coincidentes → `200 {cuadra:true,
  resultado:'CUADRA'}`, emite `contabilidad.compra_cotejada`.
- **Descuadre** → `resultado:'DESCUADRE'`, `senal:'excepcion_a_cola_revision'`,
  diferencias por línea (`descuadre_importe`, `descuadre_cantidad`).
- `coteja:false` → `se_declara:true`, `senal:null`.
- **Determinismo**: mismas entradas → mismo cotejo/ajuste.
- `coste_real` con descuentos + anticipos → `coste_real = bruto - descuentos -
  anticipos`, `signo_ajuste:'SUMA'`, `no_borra:true`, `anticipos_fuente:'PAYLOAD'`.
- **Contrato tolerante**: B3 no disponible → `anticipos_fuente:'NO_DISPONIBLE'` con el
  ajuste calculado solo con lo declarado; con `certificar:true` → `503
  DEPENDENCIA_NO_DISPONIBLE` + `contabilidad.compra.coste_real.failed`.
- `proveedor_fuente` `PAYLOAD` / `MAESTRO_TERCEROS` / `SIN_NIF` / `NO_DISPONIBLE`.
- Payloads inválidos (sin `project_id`/`factura`, sin pedido ni recepción) → `400
  INVALID_INPUT`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/compra-proveedor
node --test tests/unit/compra-proveedor.test.js
```

## Notas de implementación

- Clase `CompraProveedor extends ModuloHibridoReflejo`; `name = 'compra-proveedor'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: nada que persistir).
- Constante `TOLERANCIA_DEFECTO = 0.01`.
- `onCotejarRequest` delega en `_atender(e, 'cotejar',
  'contabilidad.compra.cotejar.response', fn)`; `onCoste_realRequest` en
  `_atender(e, 'coste_real', 'contabilidad.compra.coste_real.response', fn)`. Cada uno
  publica `contabilidad.compra_cotejada` (éxito) o su par `*.failed`.
- Lecturas de dependencia por EVENTO (`_rpc`, `timeout_ms:4000`):
  `_fichaProveedor` (`contabilidad.tercero.identificar.request`),
  `_anticiposAsentados` (`contabilidad.mayor.movimientos.request`).
- Proyecciones puras: `_cotejar`, `_comparar`, `_lineasDescuadradas`, `_costeReal`,
  `_ajustarCosteReal` + helpers `_importe`, `_importeLinea`, `_cantidadLinea`,
  `_claveLinea`. `_invalid`/`_errorResponse`/`_round` vienen de la base.
- Tools: `toolCotejar`, `toolCosteReal`, `toolAjustarCosteReal`.
- DEP hacia delante: `contabilidad.compra_cotejada` lo consume la admisión/el libro
  para asentar con base; el descuadre señala a la cola de revisión (A8.1). DEP hacia
  atrás por evento: N1 `maestro-terceros`, B3 `mayor-balanza` (AÚN NO EXISTE).
