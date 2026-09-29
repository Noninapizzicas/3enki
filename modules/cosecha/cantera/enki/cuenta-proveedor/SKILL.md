---
name: cuenta-proveedor
description: >
  Skill FULL del módulo REFLEJO `cuenta-proveedor` de la vertical contabilidad de Enki.
  LA CUENTA CORRIENTE DEL PROVEEDOR (lo que le DEBEMOS) derivada del libro: mayor auxiliar del
  tercero con cada factura de compra VIVA y su saldo, sobre el tercero ÚNICO del maestro (sin
  maestro nuevo) y con la cuenta contable declarable. Sin estado. Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites el saldo del proveedor o sus facturas vivas (RPC
    cuenta-proveedor.saldo.request / cuenta-proveedor.facturas_vivas.request).
  - Cuando depures por qué `tercero_disponible:false` (el maestro N1 no respondió y no se declaró
    la ficha), por qué `disponible:false` con `saldo:null` (sin asientos NO se estima un 0) o por
    qué una factura va a `abierto.facturas_sin_importe`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes de la
    cuenta (determinista, convenio declarado, maestro de terceros ÚNICO).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo cuenta-proveedor.
tags: [enki, modulo, reflejo, contabilidad, cuenta-proveedor]
---

# cuenta-proveedor — REFLEJO STATELESS de la cuenta corriente del proveedor

## Qué hace el módulo

`cuenta-proveedor` es un **REFLEJO STATELESS** (N3, hoja del plan): **LA CUENTA CORRIENTE DEL
PROVEEDOR: LO QUE LE DEBEMOS. DERIVADA DEL LIBRO.** Mayor auxiliar del tercero: cada factura de
compra **VIVA** y su **saldo**. **NO almacena nada**: el libro es `escritor-diario` (B2) y la ficha
del tercero es `maestro-terceros` (N1) — aquí solo se **DERIVA** la cuenta corriente **POR EVENTO**.

Atributos del diseño: `diario:EscritorDiario`, `tercero:Tercero`. Métodos:
`saldo(t:Tercero):Cuantía`, `facturas_vivas(t):Set<Factura>`.

**🔴 EL MAESTRO DE TERCEROS ES ÚNICO (N1, ya construido).** Cliente y proveedor cuelgan del
**MISMO tercero** (un tercero, un registro con `roles`; un tercero puede ser cliente **Y**
proveedor). Este reflejo **NO crea un maestro nuevo ni una ficha paralela**: pide la ficha a
`maestro-terceros.ficha.request` POR EVENTO y trabaja sobre **ESE** tercero. Si el maestro no
responde y no se declara la ficha → `tercero_disponible:false` (**jamás se inventa el tercero**).

**🔴 LA CUENTA CONTABLE ES DECLARABLE, NO CABLEADA.** Ninguna subcuenta (400.x, 410…) está escrita
aquí: la trae el input (`cuenta`) o la ficha del tercero (`cuenta_proveedor`); sin cuenta declarada
el emparejamiento usa la **CLAVE** del tercero declarada en los apuntes (`tercero`/`clave`/`nif`) y
el resultado declara `criterio_emparejamiento` con qué se emparejó.

Invariantes:

- **DETERMINISTA**: mismos asientos + mismo tercero + mismo convenio → mismo saldo.
- **Dato ausente = desconocido**: sin asientos **NO** se estima un saldo (`disponible:false`,
  `saldo:null`; **jamás se devuelve 0 por defecto**); una factura sin importe declarado no se da por
  viva ni por pagada y va aparte en `abierto.facturas_sin_importe`; sin cuenta/clave **no** se
  afirma que un asiento sea del tercero.
- **NO escribe, NO persiste, NO muta y NO decide**: la cuenta corriente es un **DERIVADO** del libro.
- **El convenio de signo es DECLARADO y visible**: `acreedor` (por defecto) → `saldo = Σhaber −
  Σdebe`; `deudor` → `Σdebe − Σhaber`.
- **Una factura es VIVA si queda pendiente ≠ 0**; lo **APLICADO** a una factura sale de los asientos
  que **DECLARAN** aplicarla (`aplica_a`/`pago_de`).
- **Es BAJO DEMANDA y stateless**: `contabilidad.asiento_registrado` (B2) solo se **loguea** — no
  acumula asientos ni recalcula saldos proactivamente.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `cuenta-proveedor.saldo.request` | `onSaldoRequest` | RPC reflejo (lectura pura, determinista): {project_id, tercero?\|tercero_id?\|nif?, cuenta?, convenio?:'acreedor'\|'deudor', asientos?\|libro?, periodo?} → {project_id, tipo:'cuenta-proveedor', tercero, tercero_disponible, saldo, convenio, sum_debe, sum_haber, num_apuntes, apuntes, disponible, criterio_emparejamiento, fuente_asientos, fuente_tercero, roles, deriva_de, abierto}. El tercero viene declarado o se PIDE al MAESTRO UNICO maestro-terceros.ficha.request (N1) POR EVENTO; los asientos se reciben declarados o se PIDE a escritor-diario (B2) POR EVENTO. Sin asientos → disponible:false y saldo:null (no se devuelve 0). Responde por cuenta-proveedor.saldo.response; project_id ausente → cuenta-proveedor.saldo.failed. |
| `cuenta-proveedor.facturas_vivas.request` | `onFacturasVivasRequest` | RPC reflejo (lectura pura, determinista): misma entrada → {project_id, tipo:'cuenta-proveedor', tercero, facturas_vivas:[{clave, numero, clave_natural, fecha, importe, aplicado, pendiente, viva, fecha_vencimiento, asiento}], facturas, num_facturas_vivas, num_facturas, total_pendiente, disponible, criterio_emparejamiento, abierto}. VIVA = pendiente != 0 (sin criterio cableado). Una factura sin importe declarado NO se da por viva ni por pagada: va aparte en abierto.facturas_sin_importe (nada se estima). Responde por cuenta-proveedor.facturas_vivas.response; project_id ausente → cuenta-proveedor.facturas_vivas.failed. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → N3): un asiento quedo registrado → se deja constancia en el log de que la cuenta corriente quedo desactualizada. El reflejo es stateless y la cuenta es BAJO DEMANDA: NO acumula asientos ni recalcula saldos proactivamente. Tolerante: sin project_id se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `cuenta-proveedor.saldo.response` | Respuesta RPC correlada de cuenta-proveedor.saldo.request → {request_id, status:200, data:{tercero, tercero_disponible, saldo, convenio, sum_debe, sum_haber, apuntes, disponible, criterio_emparejamiento, fuente_asientos, fuente_tercero, roles, abierto}}. Emitida por el helper _atender. |
| `cuenta-proveedor.saldo.failed` | Par de fallo determinista (N3): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de cuenta-proveedor.saldo.request. |
| `cuenta-proveedor.facturas_vivas.response` | Respuesta RPC correlada de cuenta-proveedor.facturas_vivas.request → {request_id, status:200, data:{tercero, facturas_vivas, num_facturas_vivas, total_pendiente, disponible, criterio_emparejamiento, abierto}}. Emitida por el helper _atender. |
| `cuenta-proveedor.facturas_vivas.failed` | Par de fallo determinista (N3): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de cuenta-proveedor.facturas_vivas.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `cuenta-proveedor.saldo.failed` cierra el círculo de `cuenta-proveedor.saldo.request` y
> `cuenta-proveedor.facturas_vivas.failed` el de `cuenta-proveedor.facturas_vivas.request`, cuando
> `_saldo`/`_facturas_vivas` devuelven status ≠ 200 (`400 INVALID_INPUT` por `project_id` ausente).

> Nota: `onAsientoRegistrado` **no** usa `_atender`: **solo registra un `logger.info`**
> («cuenta-proveedor.asiento_registrado») y devuelve `null`. **No guarda nada** (stateless), no
> publica evento de dominio y no tiene par `failed` (no es una petición). Sin `project_id` → `null`.

## Reglas de negocio

1. **El CONTEXTO** (`_contexto`) reúne: el tercero (N1), los asientos (B2) y el convenio declarado.
   El **convenio** es `input.convenio` (`toLowerCase().trim()`) o `'acreedor'` por defecto —
   **declarado y visible**.
2. **El TERCERO**: `input.tercero` (objeto) → `fuente_tercero:'declarado'`. Si no, con
   `input.nif`/`numero_fiscal`/`tercero_id` → `_rpc('maestro-terceros.ficha.request',
   {project_id, tercero:{nif}}, {timeout_ms:4000})`; con `encontrado === true && data.tercero` →
   `fuente_tercero:'maestro-terceros'`. Sin ficha → `tercero_disponible:false` (**NO se inventa**).
3. **La CUENTA contable**: `input.cuenta` → `tercero.cuenta_proveedor` → `tercero.cuenta` → `null`.
   **NUNCA cableada.** El **criterio de emparejamiento** declarado: `cuenta declarada (X)` o
   `clave del tercero declarada en los apuntes (Y)` o `sin cuenta ni clave declarada: no se puede
   emparejar`.
4. **La CLAVE del tercero** para emparejar apuntes sin cuenta: `input.tercero_id` o `tercero.nif`/
   `tercero.clave`; `null` si no hay.
5. **Los ASIENTOS**: `input.asientos`/`input.libro` (array o `{asientos:[]}`) → `fuente_asientos:
   'declarados'`; si no, `_rpc('escritor-diario.asientos.request', {project_id, periodo})` →
   `'escritor-diario'`. Sin asientos → `disponible:false` y `saldo:null` (**no se devuelve 0**).
6. **El emparejamiento de apuntes**: `_apunteDelTercero(ap, ctx)` → por `cuenta` declarada
   (`ap.cuenta === ctx.cuenta`) o por la clave (`ap.tercero`/`ap.clave`/`ap.nif ===
   clave_tercero`). **Sin cuenta ni clave no se afirma que un apunte sea del tercero.**
7. **La agregación** (`_agregar`): recorre los asientos y sus `apuntes`, suma `Σdebe` y `Σhaber`
   (cada campo cae a `0` si falta) y detalla `apuntes:[{numero, fecha, concepto, cuenta, debe,
   haber}]`.
8. **El convenio** (`_aplicarConvenio`): `deudor` → `Σdebe − Σhaber`; `acreedor` (defecto) →
   `Σhaber − Σdebe`. `saldo`, `sum_debe` y `sum_haber` se redondean a 2.
9. **`roles`** viaja desde la ficha del maestro único (un tercero puede ser cliente Y proveedor);
   `deriva_de:['escritor-diario (B2)', 'maestro-terceros (N1)']`.
10. **Las FACTURAS VIVAS** (`_facturas_vivas`): se consideran solo los asientos que **DECLARAN** ser
    factura de compra (`_esFacturaDeCompra`: `es_factura_compra === true`, `es_factura === true`,
    `factura != null`, o `tipo ∈ {factura_compra, factura-compra}`) y que son **del tercero**
    (`_delTercero`). La clave: `a.factura` → `a.clave_natural` → `asiento_<numero|índice>`.
11. **Sin importe declarado → la factura va APARTE**: `importe === null` →
    `abierto.facturas_sin_importe` («no se puede decir si está viva (no se estima)»). **No se da por
    viva ni por pagada.**
12. **`aplicado` y `pendiente`**: `aplicado` = suma de los asientos que **DECLARAN** aplicarla
    (`a.aplica_a`/`a.pago_de === clave`); `pendiente = |importe| − aplicado` (redondeado a 2).
    **`viva = pendiente !== 0`** — determinista, **sin criterio cableado**.
13. **`fecha_vencimiento`** es la **declarada** en el propio asiento (N6 lo calcula aparte):
    **aquí no se recalcula**.
14. **Los totales**: `num_facturas_vivas`, `num_facturas`, `total_pendiente` = suma de los
    `pendiente` de las vivas.
15. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
16. **HTTP exacto**: éxito `200` (también con `disponible:false` y `tercero_disponible:false`);
    `project_id` ausente → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `cuenta-proveedor.saldo.response` / `cuenta-proveedor.facturas_vivas.response`. **No
emite evento de dominio.**

### 1. `saldo` — tercero declarado + asientos declarados

```json
{
  "project_id": "e57a318a-...",
  "tercero": { "nif": "B123", "roles": ["proveedor"], "cuenta_proveedor": "400.MAD" },
  "asientos": [
    { "numero": 1, "fecha": "2026-09-01", "factura": "F1", "importe": 100, "tipo": "factura_compra" },
    { "numero": 2, "fecha": "2026-09-02", "concepto": "pago", "importe": 40, "aplica_a": "F1" }
  ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`: `tercero_disponible:true`, `saldo:60` (`Σhaber − Σdebe` con convenio `acreedor`),
`convenio:'acreedor'`, `sum_debe:0`, `sum_haber:60`, `apuntes` con el detalle,
`disponible:true`, `criterio_emparejamiento:'cuenta declarada (400.MAD)'`,
`fuente_asientos:'declarados'`, `fuente_tercero:'declarado'`, `roles:['proveedor']`,
`deriva_de:['escritor-diario (B2)','maestro-terceros (N1)']`.

### 2. `saldo` — sin asientos → `disponible:false`, `saldo:null`

Sin asientos declarados y con B2 sin responder → `disponible:false`, `saldo:null`,
`abierto.asientos` («el saldo NO se estima (no se devuelve 0)»). **No se devuelve 0.**

### 3. `saldo` — el maestro N1 no responde → `tercero_disponible:false`

Sin `tercero` declarado y con N1 sin responder → `tercero:null`, `tercero_disponible:false`,
`abierto.tercero` («no se inventa el tercero»).

### 4. `facturas_vivas` — factura sin importe → va aparte

Un asiento marcado como factura de compra del tercero **sin importe** →
`abierto.facturas_sin_importe:[{clave, motivo:'la factura no declara importe...'}]`. **No se da por
viva ni por pagada.**

### 5. `facturas_vivas` — viva/pagada por `aplica_a`

Factura de 100 con un asiento que `aplica_a:'F1'` por 100 → `pendiente:0`, `viva:false`. Parcial →
`pendiente > 0`, `viva:true`.

### 6. Fire-and-forget — señal B2

`onAsientoRegistrado` (`contabilidad.asiento_registrado`) **solo loguea** y devuelve `null`. Sin
`project_id` → `null`.

### 7. Fallo — falta `project_id`

Respuesta `400` + `cuenta-proveedor.saldo.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/cuenta-proveedor.test.js`. Cubre:

- `saldo` con tercero + asientos declarados → `200 disponible:true`, `saldo` con el convenio
  declarado (`acreedor` por defecto: `Σhaber − Σdebe`; `deudor`: `Σdebe − Σhaber`).
- **Sin asientos** → `disponible:false`, `saldo:null` (**no se devuelve 0**).
- **N1 no responde** → `tercero_disponible:false` (**no se inventa el tercero**).
- **Sin cuenta declarada** → emparejamiento por clave del tercero; el criterio se declara.
- `facturas_vivas`: VIVA ⇔ `pendiente !== 0`; `aplicado` sale de los asientos con `aplica_a`/`pago_de`.
- **Factura sin importe** → `abierto.facturas_sin_importe` (**no se da por viva ni por pagada**).
- **Determinismo**: mismos asientos + mismo tercero + mismo convenio → mismo saldo.
- `onAsientoRegistrado` devuelve `null` y no muta; sin `project_id` → `null`.
- `project_id` ausente → `400 INVALID_INPUT` + `cuenta-proveedor.saldo.failed` /
  `cuenta-proveedor.facturas_vivas.failed`.
- `toolSaldo` / `toolFacturasVivas` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `CuentaProveedor extends ModuloHibridoReflejo`; `name = 'cuenta-proveedor'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/cuenta-proveedor/`; es de la vertical **entrada**).
- Dos proyecciones: `_saldo(input)` y `_facturas_vivas(input)` (`async`: piden tercero a N1 y
  asientos a B2 por evento); helper compartido `_contexto`, más `_agregar`, `_aplicarConvenio`,
  `_apuntesDe`, `_apunteDelTercero`, `_delTercero`, `_esFacturaDeCompra`, `_claveFactura`,
  `_aplicado`, `_importe`, `_num`. Tools `toolSaldo`, `toolFacturasVivas`.
- **DEP**: pide a `maestro-terceros.ficha.request` (N1) y `escritor-diario.asientos.request` (B2)
  **por EVENTO** (best-effort); observa `contabilidad.asiento_registrado` (B2) como señal tolerante;
  es el **mayor auxiliar** que compone `estado-cuenta-proveedor` (N4) por evento.
- **🔴 MAESTRO DE TERCEROS ÚNICO**: cliente y proveedor cuelgan del **MISMO tercero** (N1); este
  reflejo **NO crea maestro nuevo** ni ficha paralela. Sin ficha → `tercero_disponible:false`.
- **🔴 CUENTA CABLEADA = PROHIBIDO**: la cuenta contable es **declarable** (input o ficha); el
  criterio de emparejamiento viaja declarado y el convenio de signo es **visible**.
- **DATO AUSENTE = DESCONOCIDO**: sin asientos → `saldo:null` (**nunca 0**); una factura sin importe
  va a `abierto.facturas_sin_importe`. **NO escribe, NO persiste, NO muta.**
