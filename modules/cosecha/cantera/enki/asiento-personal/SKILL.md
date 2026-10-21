---
name: asiento-personal
description: >-
  Skill FULL del módulo REFLEJO STATELESS `asiento-personal` de la vertical contabilidad (Enki).
  Construye el ASIENTO DE PERSONAL EQUILIBRADO desde el recibo y la cotización: DEBE = sueldo bruto
  + SS de empresa; HABER = retención IRPF + SS (trabajador+empresa) + neto. El neto se DERIVA
  (`bruto − retención − cotización trabajador`). Si el asiento cuadra, SUBE best-effort a
  `escritor-diario` (B2). Sin bruto no se inventa el asiento. Escucha `contabilidad.nomina_recibida`.
  Sin store propio. La op `construir` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites construir el asiento de personal de una nómina (RPC asiento-personal.construir.request).
  - Cuando depures por qué sale `equilibrado:false` o `asiento:null` (falta bruto) o por qué no se
    subió a escritor-diario.
  - Cuando quieras entender su contrato de eventos y sus dependencias best-effort a recibo-nomina (G1)
    y obligacion-seguridad-social (G2).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, fiscal, nomina, personal, asiento]
---

# asiento-personal — REFLEJO STATELESS del asiento de personal

## Qué hace el módulo

`asiento-personal` es un **REFLEJO STATELESS** (G3, hoja del plan) de la vertical **contabilidad**,
eje **fiscal**. Construye el **asiento de personal equilibrado** desde el recibo y la cotización:

```
DEBE  = sueldo bruto + SS a cargo de la empresa
HABER = retención IRPF + SS (trabajador + empresa) + neto pendiente
neto  = bruto − retención − cotización del trabajador        (DERIVADO, no declarado a ojo)
```

Si el asiento **cuadra** (`equilibrado === true`), SUBE best-effort el asiento a `escritor-diario`
(B2), que es quien asienta. **No inventa** el asiento: sin sueldo bruto devuelve `asiento:null` y
`abierto.bruto`.

**No persiste** (STATELESS). La op `construir` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `asiento-personal.construir.request` | `onConstruirRequest` | RPC reflejo (PREGUNTA): `{project_id, nomina?\|recibo?, bruto?, retencion?, cotizacion_trabajador?, cotizacion_empresa?, cuenta_*?, fecha?, concepto?}` → asiento. Delega en `_atender` → `_construir`. **Si `equilibrado:true`** publica `escritor-diario.asentar.request`; si `status ≠ 200` publica `.failed`. Responde por `asiento-personal.construir.response`. |
| `contabilidad.nomina_recibida` | `onNominaRecibida` | Fire-and-forget (puerto-nomina): llegó una nómina → solo se toma constancia (log del contexto). No muta nada. |

### Publishes

| Evento | Cuándo |
|---|---|
| `asiento-personal.construir.response` | Respuesta RPC correlada de la op `construir`. |
| `asiento-personal.construir.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |
| `escritor-diario.asentar.request` | **Solo si el asiento cuadra** (`equilibrado === true`): `{project_id, asiento, origen:'asiento-personal', correlation_id}`. |

> **NO publica un hecho de dominio** (`contabilidad.*`): es un reflejo de construcción. Su salida
> externa es la subida best-effort del asiento a B2.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `construir` | **PREGUNTA** | `{project_id, nomina?\|recibo?, bruto?, salario_bruto?, retencion?, cotizacion_trabajador?\|ss_trabajador?, cotizacion_empresa?\|ss_empresa?, cuenta_sueldos?, cuenta_ss_empresa?, cuenta_hp_retenciones?, cuenta_ss_acreedora?, cuenta_neto?, fecha?, concepto?, clave?}` | `{project_id, tipo, asiento:{fecha, concepto, clave, lineas}, lineas, desglose, suma_debe, suma_haber, diferencia, cuadra, equilibrado, determinista, formula, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Sin bruto no hay asiento**: `cifras.bruto === null` → `200` con `asiento:null`, `equilibrado:false`
   y `abierto.bruto` («el asiento de personal no se inventa»).
2. **El neto se DERIVA**: `neto = round(bruto − retención − cot_trabajador, 2)`. **No se declara a ojo.**
3. **Resolución de cifras** (`_cifrasDe`): declaradas en el input/recibo → si falta el bruto, RPC
   `recibo-nomina.dar_forma.request` (G1, timeout 800 ms); si falta la SS de empresa, RPC
   `obligacion-seguridad-social.calcular.request` (G2, timeout 800 ms). `fuente` ∈
   `{'declarado','recibo-nomina','recibo-nomina+ss',null}`.
4. **Líneas del asiento** (cuentas **declarables**, sin reglas PGC ocultas):
   - DEBE: `640` (sueldos, por el bruto) + `642` (SS empresa) si la hay.
   - HABER: `4751` (HP acreedora por retenciones) si hay; `476` (SS acreedora) si hay cotización;
     `465` (neto pendiente de pago) siempre.
5. **Cuadre**: `equilibrado = |suma_debe − suma_haber| <= EPSILON` (`EPSILON = 0.005`).
6. **Subida a B2**: `escritor-diario.asentar.request` **solo** si hay asiento y cuadra.
7. **Huecos declarados**: retención/cotizaciones ausentes → `abierto.retencion` /
   `abierto.cotizacion_trabajador` / `abierto.cotizacion_empresa`.
8. **Determinista**: `formula: 'neto = bruto − retencion − cotizacion_trabajador; DEBE(bruto + SS_empresa) == HABER(retencion + SS + neto)'`.
9. **`_num` estricto**: `undefined/null/''` → `null`.

## Cómo se usa (RPC)

### Construir el asiento de una nómina

```json
{
  "project_id": "e57a318a-...",
  "nomina": { "bruto": 2000, "retencion": 200, "cotizacion_trabajador": 130, "cotizacion_empresa": 581.4 },
  "fecha": "2026-09-30",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "asiento-personal",
  "fuente": "declarado",
  "asiento": {
    "fecha": "2026-09-30",
    "concepto": "nomina",
    "clave": null,
    "lineas": [
      { "cuenta": "640", "debe": 2000, "haber": 0, "concepto": "sueldos y salarios" },
      { "cuenta": "642", "debe": 581.4, "haber": 0, "concepto": "seguridad social a cargo de la empresa" },
      { "cuenta": "4751", "debe": 0, "haber": 200, "concepto": "HP acreedora por retenciones practicadas" },
      { "cuenta": "476", "debe": 0, "haber": 711.4, "concepto": "organismos de la seguridad social acreedores" },
      { "cuenta": "465", "debe": 0, "haber": 1670, "concepto": "remuneraciones pendientes de pago (neto)" }
    ]
  },
  "desglose": { "bruto": 2000, "retencion": 200, "cotizacion_trabajador": 130, "cotizacion_empresa": 581.4, "neto": 1670 },
  "suma_debe": 2581.4,
  "suma_haber": 2581.4,
  "diferencia": 0,
  "cuadra": true,
  "equilibrado": true,
  "determinista": true,
  "formula": "neto = bruto − retencion − cotizacion_trabajador;  DEBE(bruto + SS_empresa) == HABER(retencion + SS + neto)",
  "abierto": { "retencion": null, "cotizacion_trabajador": null, "cotizacion_empresa": null }
}
```
Publica `escritor-diario.asentar.request` (cuadra).

### Sin bruto — ABIERTO

```json
{ "project_id": "e57a318a-..." }
```
→ `asiento:null`, `equilibrado:false`,
`abierto.bruto = "no llego el sueldo bruto (ni declarado ni del recibo): el asiento de personal no se inventa"`.
**No sube nada** a B2.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_construir`. |
| (no es error) | 200 | Sin bruto → ABIERTO (no se inventa el asiento). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.nomina_recibida` (puerto-nomina).
- **Llama por RPC (best-effort, 800 ms)**: `recibo-nomina.dar_forma.request` (G1),
  `obligacion-seguridad-social.calcular.request` (G2).
- **Sube a**: `escritor-diario.asentar.request` (B2) si cuadra.

## Verificación

1. Fichero: `modules/contabilidad-fiscal/asiento-personal/`.
2. Eventos reales: subscribes `asiento-personal.construir.request`, `contabilidad.nomina_recibida`;
   publishes `asiento-personal.construir.response`, `.failed`, `escritor-diario.asentar.request`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-fiscal/asiento-personal/index.js
   # → asiento-personal.construir.failed / escritor-diario.asentar.request → recibo-nomina.dar_forma.request / obligacion-seguridad-social.calcular.request
   ```
4. Test unitario (si existe): con cifras → asiento cuadrado + subida; sin bruto → ABIERTO; neto derivado;
   sin `project_id` → 400 + failed.
