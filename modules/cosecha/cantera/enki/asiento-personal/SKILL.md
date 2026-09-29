---
name: asiento-personal
description: >
  Skill FULL del módulo REFLEJO `asiento-personal` de la vertical contabilidad de Enki.
  Construye el ASIENTO DE PERSONAL EQUILIBRADO (sueldos + SS + retención + pago) desde el recibo ya
  calculado y la obligación SS, con las CUENTAS DECLARABLES — cálculo puro, sin cablear el PGC. Sin
  estado. Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos y
  sus reglas de negocio.
when-to-use: >
  - Cuando necesites construir el asiento de personal de una nómina (RPC
    asiento-personal.construir.request).
  - Cuando depures por qué sale `asiento:null` y `abierto:true` (sin recibo ni obligación), por qué
    `cuentas_origen:'sin_declarar'` (no se declaró el mapa de cuentas), por qué `cuadra:null`, o por
    qué falla con 400 INVALID_INPUT (falta `project_id`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (cálculo puro, cuentas declarables, equilibrio declarado no parcheado, dato ausente =
    desconocido).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo asiento-personal.
tags: [enki, modulo, reflejo, contabilidad, asiento-personal]
---

# asiento-personal — REFLEJO del asiento de personal equilibrado

## Qué hace el módulo

`asiento-personal` es un **REFLEJO STATELESS** (G3, hoja del plan): **GASTO DE PERSONAL, RETENCIÓN Y
PAGO → ASIENTO EQUILIBRADO**. El diseño lo dice literal: `construir(...):Asiento`, con
`nomina:ReciboNomina` y `ss:ObligacionSeguridadSocial`. **Calculo PURO, determinista**: misma entrada
→ mismo asiento.

**LA CADENA DE PERSONAL ENTRA COMO DATO, por EVENTO** (**jamás** un require cruzado):

- el **RECIBO** ya calculado por el sistema externo (`recibo-nomina` G1),
- la **OBLIGACIÓN** con la SS ya derivada (`obligacion-seguridad-social` G2).

Las dos pueden venir **declaradas** en la petición **o pedirse al bus** (`_rpc`).

**LAS CUENTAS SON DECLARABLES**: este reflejo **NO** cablea ningún número de cuenta del PGC. Si el
negocio declara el mapa de cuentas (`cuentas`), las partidas lo usan; si no, cada partida declara su
`cuenta:null` **y su ROL**, y la respuesta lo dice: `cuentas_origen:'sin_declarar'` — la numeración
es del negocio, **no del módulo**.

**EQUILIBRIO**: el asiento se cierra por construcción (`Debe = Haber`) y se **PUBLICAN** las dos
sumas (`total_debe`, `total_haber`) y `cuadra`/`descuadre`. Un descuadre de lo declarado **NO se
corrige ni se parchea a ciegas**: se **DECLARA** y lo resuelve el humano.

Invariante: **dato ausente = desconocido**. Sin retención declarada **no** se estima un `0`: la
partida **no se crea** y el campo se lista en `faltantes`.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_construir`.
Cierra el círculo de error con `asiento-personal.construir.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `asiento-personal.construir.request` | `onConstruirRequest` | RPC reflejo (calculo puro, determinista): {project_id, recibo\|nomina\|clave_natural\|empleado+periodo (el recibo ya calculado por el sistema externo; si falta se pide a recibo-nomina G1 POR EVENTO), obligacion\|ss (la obligacion TGSS; si falta se pide a obligacion-seguridad-social G2 POR EVENTO), cuentas? (DECLARABLES: {gasto_sueldos, gasto_ss_empresa, retencion, organismos, neto}), tipos?, bases?, fecha?} → {asiento:{clase:'nomina', partidas, debe, haber, total_debe, total_haber, cuadra, descuadre, cuentas_origen:'declaradas'\|'sin_declarar', cuentas_cableadas:false, origen_recibo, origen_obligacion, calculo_puro:true}, faltantes, abierto}. Debe = sueldos (bruto) + SS_empresa; Haber = neto + retencion + organismos (empresa+trabajador). El asiento se cierra por construccion; ningun importe se estima. Responde por asiento-personal.construir.response; project_id ausente o sin recibo ni obligacion → asiento-personal.construir.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `asiento-personal.construir.response` | Respuesta RPC correlada de asiento-personal.construir.request → {request_id, status:200, data:{asiento:{debe, haber, total_debe, total_haber, cuadra, descuadre}, faltantes, abierto}}. Emitida por el helper _atender. |
| `asiento-personal.construir.failed` | Par de fallo determinista (G3): project_id ausente (400), sin recibo ni obligacion que asentar, o excepcion de la proyeccion (500) → {status, error:{code, message, details?}}. Cierra el circulo de asiento-personal.construir.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `asiento-personal.construir.failed` cierra el círculo de `asiento-personal.construir.request`
> cuando `_construir` devuelve status ≠ 200.

> Nota de honestidad (cruce con `index.js`): `onConstruirRequest` publica
> `asiento-personal.construir.failed` **solo si `_construir` devuelve status ≠ 200**; si devuelve
> `200` responde por `_atender` y **no** emite evento de dominio (este reflejo no tiene
> fire-and-forget propio).

> Nota: `_construir` **pide al bus** `recibo-nomina.dar_forma.request` (G1) y
> `obligacion-seguridad-social.calcular.request` (G2) con `this._rpc` — son **llamadas salientes**,
> **no** eventos que el módulo publique, y por eso **no figuran en `module.json`**. Tampoco figuran
> `_recibo`, `_obligacion`, `_mapaCuentas`, `_desc`, `_num`, las constantes `ROLES`/`CUENTAS` ni
> `toolConstruir`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente → `400
   INVALID_INPUT` (`field:'project_id'`).
2. **El RECIBO** (`_recibo`): declarado (`input.recibo || input.nomina` objeto) → `origen_recibo:
   'declarado'`; si no, **pide por evento** a `recibo-nomina.dar_forma.request` (G1) con
   `clave_natural` o `empleado`+`periodo`, `timeout_ms:4000`; si responde →
   `origen_recibo:'recibo-nomina'`.
3. **La OBLIGACIÓN SS** (`_obligacion`): declarada (`input.obligacion || input.ss`) →
   `origen_obligacion:'declarada'`, tomando `cuota_empresa` (o su alias `gasto_empresa`) y
   `cuota_trabajador`. Si no, **se pide por evento** a `obligacion-seguridad-social.calcular.request`
   (G2) — **solo si hay recibo o `tipos` declarados**, con `timeout_ms:4000` → `origen_obligacion:
   'obligacion-seguridad-social'`.
4. **Fallback de cotización del trabajador**: si G2 no da obligación y el **recibo** trae
   `cotizacion_trabajador`, se usa **solo esa** para el HABER de organismos →
   `origen_obligacion:'recibo.cotizacion_trabajador'` con `cuota_empresa:null`. Todo desde **dato
   declarado**, sin inventar.
5. **Sin recibo NI obligación no hay asiento**: `asiento:null`, `abierto:true`,
   `faltantes:['recibo','obligacion_ss']` y `motivo:'no se construye asiento sin recibo ni
   obligacion de SS (nada se estima)'`.
6. **Lo ausente se declara**: `recibo.bruto`, `recibo.retencion`, `recibo.neto`, `ss.cuota_empresa`,
   `ss.cuota_trabajador` ausentes (si la fuente existe) → cada uno a `faltantes`. **No se estima un
   0.**
7. **LAS PARTIDAS** (`ROLES` del dominio, cuenta declarable):
   - **DEBE**: `gasto_sueldos` = `bruto` (copiado del recibo); `gasto_ss_empresa` = `cuota_empresa`
     (de G2).
   - **HABER**: `neto_a_pagar` = `neto` (copiado); `retencion_irpf_pasivo` = `retencion`; y
     `organismos_ss_pasivo` = `cuota_empresa + cuota_trabajador` (**solo** si ambas no son `null`,
     redondeado a 2).
   - **Una partida solo se crea si su importe no es `null`**; cada partida lleva `{rol, cuenta,
     importe, descripcion}`.
8. **CUENTAS DECLARABLES** (`_mapaCuentas`): acepta los nombres del contrato
   (`gasto_sueldos`, `gasto_ss_empresa`, `retencion`, `organismos`, `neto`) **o alias**
   (`sueldos`/`cuenta_sueldos`; `ss_empresa`/`cuenta_ss_empresa`; `irpf`/`cuenta_retencion`/
   `hp_acreedores`; `tgss`/`ss_acreedores`/`organismos_ss`; `neto_a_pagar`/`cuenta_neto`/
   `remuneraciones_pendientes`). Valor vacío/`null` → la cuenta queda `null`. **Cero números
   cableados.**
9. **EQUILIBRIO DECLARADO, NO PARCHEADO**: `total_debe`/`total_haber` = suma redondeada de cada
   lado; `descuadre = total_debe − total_haber`. Con `faltantes.length === 0` (`completa`) se
   publica `cuadra = (descuadre === 0)` y `descuadre`; si falta algo **ambos quedan `null`**.
10. **El asiento se cierra por construcción**: como organismos = empresa + trabajador y el debe =
    bruto + empresa, el descuadre esperado es 0 cuando todo está declarado; si sale ≠ 0, **se
    declara** y lo resuelve el humano.
11. **Metadatos del asiento**: `clase:'nomina'`, `empleado`/`periodo` del recibo, `fecha` =
    `input.fecha` o `recibo.fecha`, `clave_natural`, `partidas` = `[...debe, ...haber]`,
    `cuentas_cableadas:false`, `calculado_aqui:true`, `calculo_puro:true`, `origen_recibo`,
    `origen_obligacion`.
12. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
13. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` → `500
    UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `asiento-personal.construir.response`; el error cierra con
`asiento-personal.construir.failed`.

### 1. `construir` — recibo + obligación declarados y cuentas declaradas

```json
{
  "project_id": "e57a318a-...",
  "recibo": { "empleado": "E-014", "periodo": "2026-09", "fecha": "2026-09-30", "bruto": 2100, "retencion": 210, "neto": 1757, "moneda": "EUR" },
  "obligacion": { "cuota_empresa": 611.1, "cuota_trabajador": 133 },
  "cuentas": { "gasto_sueldos": "640", "gasto_ss_empresa": "642", "retencion": "4751", "organismos": "476", "neto": "465" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "asiento": {
    "clase": "nomina",
    "empleado": "E-014",
    "periodo": "2026-09",
    "fecha": "2026-09-30",
    "clave_natural": null,
    "partidas": [
      { "rol": "gasto_sueldos", "cuenta": "640", "importe": 2100, "descripcion": "gasto de sueldos (bruto del recibo)" },
      { "rol": "gasto_ss_empresa", "cuenta": "642", "importe": 611.1, "descripcion": "gasto de Seguridad Social a cargo de la empresa" },
      { "rol": "neto_a_pagar", "cuenta": "465", "importe": 1757, "descripcion": "neto a pagar al trabajador" },
      { "rol": "retencion_irpf_pasivo", "cuenta": "4751", "importe": 210, "descripcion": "retencion de IRPF practicada" },
      { "rol": "organismos_ss_pasivo", "cuenta": "476", "importe": 744.1, "descripcion": "organismos de la Seguridad Social acreedores" }
    ],
    "debe": [],
    "haber": [],
    "total_debe": 2711.1,
    "total_haber": 2711.1,
    "cuadra": true,
    "descuadre": 0,
    "cuentas_origen": "declaradas",
    "cuentas_cableadas": false,
    "origen_recibo": "declarado",
    "origen_obligacion": "declarada",
    "calculado_aqui": true,
    "calculo_puro": true
  },
  "faltantes": [],
  "abierto": false,
  "motivo": null
}
```

### 2. `construir` — sin cuentas declaradas (el PGC no se cablea)

Sin `cuentas` → cada partida sale con `cuenta:null` **y su rol**, y
`cuentas_origen:'sin_declarar'`. La numeración es **del negocio**, no del módulo.

### 3. `construir` — sin recibo ni obligación (nada que asentar)

```json
{ "project_id": "e57a318a-..." }
```

`200` con `asiento:null`, `abierto:true`, `faltantes:["recibo","obligacion_ss"]` y `motivo`.

### 4. `construir` — sin retención declarada (no se estima un 0)

Si el recibo no trae `retencion`, la partida de retención **no se crea** y `faltantes:
["recibo.retencion"]`; `cuadra`/`descuadre` quedan `null`. **No se asume retención cero.**

### 5. Fallo — falta `project_id`

Respuesta `400` + `asiento-personal.construir.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/asiento-personal.test.js`. Cubre:

- `construir` con recibo + obligación declarados → `200`, Debe = sueldos + SS_empresa, Haber =
  neto + retención + organismos, `total_debe === total_haber`, `cuadra:true`, `descuadre:0`.
- **Cuentas declarables**: con `cuentas` → `cuentas_origen:'declaradas'` y las partidas usan el mapa;
  sin `cuentas` → todas `cuenta:null` con su rol y `cuentas_origen:'sin_declarar'` (**nada cableado**).
- **Sin recibo ni obligación** → `asiento:null`, `abierto:true`, `faltantes:['recibo','obligacion_ss']`.
- Un importe ausente queda `null` y en `faltantes`; la **partida no se crea** y `cuadra:null` (**no se
  estima**).
- La obligación se pide por evento a G2; el recibo, a G1; el fallback usa
  `recibo.cotizacion_trabajador` cuando G2 no responde.
- `project_id` ausente → `400 INVALID_INPUT` + `.construir.failed`.
- `toolConstruir` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AsientoPersonal extends ModuloHibridoReflejo`; `name = 'asiento-personal'`, `version =
  'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/asiento-personal/`).
- Constantes: `ROLES` (rol del dominio: `gasto_sueldos`, `gasto_ss_empresa`,
  `retencion_irpf_pasivo`, `organismos_ss_pasivo`, `neto_a_pagar`) y `CUENTAS` (clave de cuenta
  declarable por rol) — **solo nombres, ningún número del PGC**.
- `onConstruirRequest` usa `this._atender(e, 'construir', 'asiento-personal.construir.response',
  async (d) => {...})` con cierre de círculo.
- Proyección `_construir(input)` (**asíncrona**); helpers `_recibo` (RPC a G1), `_obligacion` (RPC a
  G2 + fallback del recibo), `_mapaCuentas` (nombres + alias), `_desc`, `_num`. Tool `toolConstruir`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimentan `recibo-nomina` (G1) y `obligacion-seguridad-social` (G2) por evento; es la hoja
  que cierra la cadena de personal (G3).
- **PARÁMETRO COMO DATO**: las cuentas son **declarables** (nombre o alias); el código **no asume**
  ningún número del PGC. El equilibrio se **publica y se declara**: un descuadre **no se parchea**.
