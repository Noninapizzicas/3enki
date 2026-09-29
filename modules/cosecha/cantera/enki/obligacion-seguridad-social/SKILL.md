---
name: obligacion-seguridad-social
description: >
  Skill FULL del módulo REFLEJO `obligacion-seguridad-social` de la vertical contabilidad de Enki.
  Deriva la OBLIGACIÓN con la TGSS y el GASTO DE EMPRESA desde el recibo, aplicando los TIPOS y las
  BASES que el negocio DECLARA — la ley entra como dato, cero constantes cableadas. Sin estado.
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites derivar la obligación con la Seguridad Social de un recibo (RPC
    obligacion-seguridad-social.calcular.request).
  - Cuando depures por qué sale `obligacion:null` y `abierto:true` (no hay tipos declarados), por qué
    un importe sale `null` (base o tipo no declarados → `faltantes`) o por qué falla con 400
    INVALID_INPUT (falta `project_id`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (los tipos y las bases son dato, el recibo se copia, dato ausente = desconocido).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo obligacion-seguridad-social.
tags: [enki, modulo, reflejo, contabilidad, obligacion-seguridad-social]
---

# obligacion-seguridad-social — REFLEJO de la obligación con la TGSS y el gasto de empresa

## Qué hace el módulo

`obligacion-seguridad-social` es un **REFLEJO STATELESS** (G2, hoja del plan): **GASTO DE EMPRESA +
OBLIGACIÓN CON LA TGSS**, derivados **DEL RECIBO** y de los **TIPOS/BASES que el negocio DECLARA**.
El diseño lo dice literal: `calcular(n:ReciboNomina):Obligacion`, con `tipos:ParametroDeclarable`.
**Cálculo PURO y determinista**: misma entrada → misma obligación.

**LOS TIPOS Y LAS BASES SON DATO** (invariante **LEY/PARÁMETRO COMO DATO**): aquí **NO** se cablea
**ningún** tipo de cotización, **ninguna** base, **ningún** grupo de tarifa, **ninguna** tabla legal.
Todo eso llega **DECLARADO** por el negocio (`tipos`, `bases`) y se aplica de forma pura
(`base × tipo`). La ley **entra como dato**; el módulo la **aplica**, no la conoce.

**EL RECIBO LLEGA YA CALCULADO** por el sistema externo (por **EVENTO**: `recibo-nomina` G1, o
**declarado** en la petición). Aquí **NO** se calcula la nómina: se **COPIAN** sus importes para el
**gasto de empresa** (`gasto_empresa` = bruto del recibo + cuota a cargo de la empresa).

Invariante: **dato ausente = desconocido**. Una línea de tipo cuya **base** o **tipo** no venga
declarada queda `importe:null` y se declara en `faltantes`; los totales que dependan de ella quedan
`null`. **Jamás** se rellena con `0` un tipo que no se declaró, **ni** se estima una base. **Sin
TIPOS declarados no hay obligación que calcular**: `obligacion:null`, `abierto:true` con `motivo`.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_calcular`.
Cierra el círculo de error con `obligacion-seguridad-social.calcular.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `obligacion-seguridad-social.calcular.request` | `onCalcularRequest` | RPC reflejo (determinista): {project_id, recibo\|nomina\|clave_natural\|empleado+periodo, tipos (DECLARABLES: [{concepto, tipo, a_cargo, base?}] o mapa {concepto: tipo\|{tipo,a_cargo}}), bases? (DECLARABLES: escalar \| mapa {concepto: importe} \| [{concepto, importe}])} → {project_id, empleado, periodo, origen_recibo:'declarado'\|'recibo-nomina', obligacion:{lineas, cuota_empresa, cuota_trabajador, total_tgss, moneda, tipos_origen:'declarados', regla_cableada:false}, gasto_empresa (= bruto del recibo + cuota de empresa), tipos_declarados, bases_declaradas, faltantes, abierto} o, sin tipos declarados, obligacion:null + motivo. Los tipos y las bases son dato: nada se cablea y lo ausente queda null y se declara en `faltantes`. Responde por obligacion-seguridad-social.calcular.response; project_id ausente o calculo invalido → obligacion-seguridad-social.calcular.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `obligacion-seguridad-social.calcular.response` | Respuesta RPC correlada de obligacion-seguridad-social.calcular.request → {request_id, status:200, data:{obligacion, gasto_empresa, faltantes, abierto}}. Emitida por el helper _atender. |
| `obligacion-seguridad-social.calcular.failed` | Par de fallo determinista (G2): project_id ausente (400) o excepcion de la proyeccion (500) → {status, error:{code, message, details?}}. Cierra el circulo de obligacion-seguridad-social.calcular.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `obligacion-seguridad-social.calcular.failed` cierra el círculo de
> `obligacion-seguridad-social.calcular.request` cuando `_calcular` devuelve status ≠ 200.

> Nota de honestidad (cruce con `index.js`): `onCalcularRequest` publica
> `obligacion-seguridad-social.calcular.failed` **solo si `_calcular` devuelve status ≠ 200**; si
> devuelve `200` responde por `_atender` y **no** emite ningún evento de dominio (este reflejo no
> tiene fire-and-forget propio).

> Nota: `_calcular` **pide el recibo al bus** con `this._rpc('recibo-nomina.dar_forma.request', …)`
> cuando no se lo declaran — es una **llamada saliente** (`_rpc`), **no** un evento que este módulo
> publique, y por eso **no figura en `module.json`**. Tampoco figuran `_recibo`, `_tipos`,
> `_baseDeclarada`, `_esCargo`, `_num` ni `toolCalcular` (utilidades internas / tool directa).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente → `400
   INVALID_INPUT` (`field:'project_id'`) vía `_invalid`.
2. **El RECIBO se resuelve primero** (`_recibo`): si `input.recibo` o `input.nomina` es objeto →
   `origen_recibo:'declarado'`. Si no, **se pide por evento** a `recibo-nomina.dar_forma.request`
   (G1) con `clave_natural` o `empleado`+`periodo`, `timeout_ms:4000`; si responde → `origen_recibo:
   'recibo-nomina'`. Si no hay nada → `{recibo:null, origen_recibo:null}`. **Nunca un require
   cruzado.**
3. **LOS TIPOS son DECLARABLES** (`_tipos`): admite **array** de líneas (`{concepto, tipo, a_cargo,
   base?}` — con alias `t.cuota` por `t.tipo` y `t.cargo` por `t.a_cargo`) o **mapa**
   `{concepto: tipo|{tipo, a_cargo}}` (en el mapa, un valor escalar da `base:null` y
   `a_cargo:null`). Cada campo se normaliza con `_num` / `String`.
4. **SIN TIPOS declarados NO hay obligación**: `lineas_tipo.length === 0` → `200` con
   `obligacion:null`, `gasto_empresa:null`, `tipos_declarados:0`, `bases_declaradas`, `abierto:true`,
   `faltantes:['tipos']` y `motivo:'no hay tipos declarados: nada se calcula …'`. **Nada se cablea.**
5. **LAS BASES son DECLARABLES** (`_baseDeclarada`): si la línea trae `base` propia, se usa esa; si
   no, se busca la declarada — **escalar** (vale para cualquier concepto), **mapa**
   `{concepto: importe}` o **array** `[{concepto, importe|base}]`. Sin coincidencia → `null`.
6. **El importe es puro** (`base × tipo`): `_round(base * tipo, 2)` **solo** si base y tipo no son
   `null`; en cualquier otro caso `importe:null`. `completo` = `importe !== null && a_cargo !==
   null`.
7. **LO AUSENTE SE DECLARA**: base ausente → `faltantes:'tipos[i].base'`; tipo ausente →
   `tipos[i].tipo`; `a_cargo` ausente → `tipos[i].a_cargo`. **Ni 0 ni estimación.**
8. **Cuotas por cargo** (`_esCargo`: comparación `trim + toLowerCase` con `'empresa'` /
   `'trabajador'`): sin líneas para un cargo → `cuota:0, lineas:0, incompleta:false` (el `0` es
   aritmética de un conjunto vacío, **no** un tipo rellenado). Con líneas, si alguna tiene
   `importe:null` → `cuota:null` (`incompleta:true`); si no, suma redondeada.
9. **`total_tgss`** = `empresa.cuota + trabajador.cuota` **solo** si ambas no son `null`; si no,
   `null`. **`otras_lineas`** recoge las líneas cuyo `a_cargo` no es `empresa` ni `trabajador`.
10. **EL BRUTO SE COPIA** del recibo (`_num(recibo.bruto)`); si el recibo existe y el bruto no es
    numérico → `faltantes:'recibo.bruto'`. **El gasto de empresa** =
    `_round(bruto + empresa.cuota, 2)` **solo** si ambos no son `null`; si no, `null`.
11. **La ley es DATO, y se declara**: `obligacion.tipos_origen = 'declarados'` y
    `regla_cableada:false` — el módulo declara que **no** aportó ninguna constante legal.
12. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
13. **HTTP exacto**: éxito `200`; `project_id` ausente → `400 INVALID_INPUT`; excepción en `_atender`
    → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `obligacion-seguridad-social.calcular.response`; el error cierra con
`obligacion-seguridad-social.calcular.failed`.

### 1. `calcular` — tipos y bases declarados, recibo declarado

```json
{
  "project_id": "e57a318a-...",
  "recibo": { "empleado": "E-014", "periodo": "2026-09", "bruto": 2100, "moneda": "EUR" },
  "tipos": [
    { "concepto": "contingencias comunes empresa", "tipo": 0.2360, "a_cargo": "empresa" },
    { "concepto": "contingencias comunes trabajador", "tipo": 0.0470, "a_cargo": "trabajador" },
    { "concepto": "desempleo", "tipo": 0.0550, "a_cargo": "empresa" }
  ],
  "bases": { "contingencias comunes empresa": 2100, "contingencias comunes trabajador": 2100, "desempleo": 2100 },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "empleado": "E-014",
  "periodo": "2026-09",
  "clave_natural": null,
  "origen_recibo": "declarado",
  "obligacion": {
    "lineas": [
      { "concepto": "contingencias comunes empresa", "base": 2100, "tipo": 0.236, "a_cargo": "empresa", "importe": 495.6, "completo": true },
      { "concepto": "contingencias comunes trabajador", "base": 2100, "tipo": 0.047, "a_cargo": "trabajador", "importe": 98.7, "completo": true },
      { "concepto": "desempleo", "base": 2100, "tipo": 0.055, "a_cargo": "empresa", "importe": 115.5, "completo": true }
    ],
    "cuota_empresa": 611.1,
    "cuota_trabajador": 98.7,
    "total_tgss": 709.8,
    "otras_lineas": [],
    "moneda": "EUR",
    "tipos_origen": "declarados",
    "regla_cableada": false
  },
  "gasto_empresa": 2711.1,
  "bruto_origen": "recibo",
  "tipos_declarados": 3,
  "bases_declaradas": true,
  "faltantes": [],
  "abierto": false,
  "motivo": null
}
```

### 2. `calcular` — sin tipos declarados: no hay obligación (nada se cablea)

```json
{ "project_id": "e57a318a-...", "recibo": { "empleado": "E-014", "periodo": "2026-09", "bruto": 2100 } }
```

`200` con `obligacion:null`, `gasto_empresa:null`, `tipos_declarados:0`, `abierto:true`,
`faltantes:["tipos"]` y `motivo:"no hay tipos declarados: nada se calcula (los tipos y las bases de
cotizacion son dato)"`. **La ley no se inventa.**

### 3. `calcular` — una base que no llega (importe `null`, no 0)

Con un tipo `{concepto:"desempleo", tipo:0.055, a_cargo:"empresa"}` y **sin** base declarada para
ese concepto → su `importe:null`, `faltantes:["tipos[2].base"]`, `cuota_empresa:null` (línea
incompleta), `total_tgss:null` y `gasto_empresa:null`. **Nada se estima.**

### 4. `calcular` — sin recibo declarado, se pide a `recibo-nomina` (G1)

Sin `recibo`, con `empleado:"E-014"` + `periodo:"2026-09"` (o `clave_natural`), el módulo **pide por
evento** `recibo-nomina.dar_forma.request`; si responde, `origen_recibo:"recibo-nomina"` y el bruto
se copia de ahí.

### 5. Fallo — falta `project_id`

Respuesta `400` + `obligacion-seguridad-social.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/obligacion-seguridad-social.test.js`. Cubre:

- `calcular` con `tipos` + `bases` declarados → `200`, `cuota_empresa`/`cuota_trabajador`/`total_tgss`
  y `gasto_empresa` = bruto + cuota de empresa; `tipos_origen:'declarados'`, `regla_cableada:false`.
- **Cero constantes legales**: sin `tipos` → `obligacion:null`, `abierto:true`, `faltantes:['tipos']`
  y `motivo`; el módulo **no** aporta ningún tipo por defecto.
- Un tipo cuya base o tipo no venga declarado → `importe:null` y entra en `faltantes` (**no se
  rellena con 0**).
- `bases` en sus tres formas (escalar, mapa por concepto, array de `{concepto, importe}`).
- Los tipos como **mapa** (`{concepto: tipo}`) → `base:null`, `a_cargo:null` y sus `faltantes`.
- El recibo declarado gana; sin él se pide por evento a `recibo-nomina` (`origen_recibo`).
- `project_id` ausente → `400 INVALID_INPUT` + `.calcular.failed`.
- `toolCalcular` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ObligacionSeguridadSocial extends ModuloHibridoReflejo`; `name =
  'obligacion-seguridad-social'`, `version = 'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin
  `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/obligacion-seguridad-social/`).
- `onCalcularRequest` usa `this._atender(e, 'calcular',
  'obligacion-seguridad-social.calcular.response', async (d) => {...})` con cierre de círculo.
- Proyección `_calcular(input)` (**asíncrona**); helpers `_recibo` (llamada saliente `_rpc` a G1),
  `_tipos`, `_baseDeclarada`, `_esCargo`, `_num`. Tool `toolCalcular`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimenta el recibo de `recibo-nomina` (G1) por evento; lo LEE `asiento-personal` (G3), que
  pide `obligacion-seguridad-social.calcular.request` para obtener la obligación TGSS.
- **PARÁMETRO COMO DATO**: tipos, bases y `a_cargo` son **declarables**; el código **no asume**
  ningún tipo, base ni tabla legal. El bruto se **copia** del recibo (no se calcula aquí).
