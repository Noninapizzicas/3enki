---
name: obligacion-seguridad-social
description: >-
  Skill FULL del módulo REFLEJO STATELESS `obligacion-seguridad-social` de la vertical
  contabilidad (Enki). Deriva el GASTO DE EMPRESA y la OBLIGACIÓN con la TGSS a partir del
  recibo de nómina (o de bases/tipos declarados). Aplica bases y tipos DECLARADOS; lo que falta
  se declara abierto, no se estima. Las contingencias son estructura; sus bases y tipos son
  DATO declarable (nunca cableados). Escucha `contabilidad.nomina_recibida`. Sin store propio
  (STATELESS). La op `calcular` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites calcular el gasto de empresa y la obligación TGSS de una nómina
    (RPC obligacion-seguridad-social.calcular.request).
  - Cuando depures por qué la obligación sale `null` (faltan bases o tipos declarados → `abierto`)
    o de dónde salió el recibo (`fuente`: declarado o recibo-nomina).
  - Cuando quieras entender su contrato de eventos y por qué NO publica hecho de dominio.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, fiscal, nomina, seguridad-social, tgss]
---

# obligacion-seguridad-social — REFLEJO STATELESS del gasto y la obligación TGSS

## Qué hace el módulo

`obligacion-seguridad-social` es un **REFLEJO STATELESS** (G2, hoja del plan) de la vertical
**contabilidad**, eje **fiscal**. Deriva, a partir de un **recibo de nómina** (o de bases y
tipos declarados aparte):

- la **aportación patronal** por cada contingencia;
- el **gasto de empresa** = bruto + aportación patronal;
- la **obligación con la TGSS** = aportación patronal + aportación del trabajador.

Las **contingencias** son estructura (`contingencias_comunes`, `desempleo`, `fogasa`,
`formacion_profesional`, `at_ep`); sus **bases** y **tipos** son **DATO declarable** —
**no hay tipos por defecto cableados**. Lo que falta **no se estima**: se declara abierto.

**Honestidad (invariante 13):**
- Sin recibo → la obligación **no se inventa** (`abierto.recibo`).
- Sin bases Y tipos declarados → no se estiman tipos por defecto (`abierto.tipos`).
- Sin aportación del trabajador o sin bruto → esos valores quedan `null` y se declaran.

**No persiste** (STATELESS). La op `calcular` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `obligacion-seguridad-social.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA): `{project_id, nomina?\|recibo?, bases?, tipos?, periodo?}` → resultado. Delega en `_atender` → `_calcular`. Si `status ≠ 200` publica `.failed`. Responde por `obligacion-seguridad-social.calcular.response`. |
| `contabilidad.nomina_recibida` | `onNominaRecibida` | Fire-and-forget (puerto-nomina): llegó una nómina → se **deriva** su obligación recalculando en memoria. **No publica el resultado como hecho** (este módulo no escribe). Si el input pide `subir_calendario:true`, sube best-effort a `calendario-fiscal.declarar.request`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `obligacion-seguridad-social.calcular.response` | Respuesta RPC correlada de la op `calcular`. |
| `obligacion-seguridad-social.calcular.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |
| `calendario-fiscal.declarar.request` | **Solo** si el input trae `subir_calendario:true` y hay periodo/obligación calculada: sube la obligación `seguridad_social` al calendario (best-effort). |

> **NO publica un hecho de dominio propio.** Es un reflejo: calcula, no escribe estado → no hay
> hecho que anunciar (R2 no aplica). La única subida externa es la condicional al calendario.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** | `{project_id, nomina?\|recibo?\|hecho?, bases?, tipos?, aportacion_trabajador?, bruto?, periodo?, subir_calendario?}` | `{project_id, tipo, fuente, periodo, contingencias:[{contingencia, base, tipo, importe, aplicable, abierto}], aportacion_empresa, aportacion_trabajador, obligacion_tgss, gasto_empresa, determinista, tipos_declarados, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Bases y tipos son DATO**: `base * tipo` por contingencia, redondeado a 2 decimales. Si falta
   base **o** tipo → `importe:null` y `abierto` por contingencia (**no se estima**).
2. **Aportación patronal** = suma de importes aplicables; `null` si ninguna contingencia es aplicable.
3. **Obligación TGSS** = `aportacion_empresa + aportacion_trabajador`; `null` si falta cualquiera.
   La aportación del trabajador **se lee del recibo** (no se recalcula aquí).
4. **Gasto de empresa** = `bruto + aportacion_empresa`; `null` si falta el bruto.
5. **Origen del recibo** (`_reciboDe`): input `nomina`/`recibo`/`hecho` → si no, RPC
   `recibo-nomina.dar_forma.request` (timeout 800 ms). `fuente` ∈ `{'declarado','recibo-nomina',null}`.
6. **Preferencia de declaración**: `_declarado(a,b)` toma el objeto del input si es objeto, si no
   el de la nómina. Sin ninguno → `{}`.
7. **Determinista**: mismas bases+tipos → misma obligación. `tipos_declarados` lista las
   contingencias con tipo numérico.
8. **Subida al calendario condicional**: solo con `subir_calendario === true` y `periodo` presente.
   Una PREGUNTA no muta estado por defecto.
9. **`_num` estricto**: `undefined/null/''` → `null`.

## Cómo se usa (RPC)

### Calcular con bases y tipos declarados

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "nomina": {
    "bruto": 2000,
    "aportacion_trabajador": 130,
    "bases": { "contingencias_comunes": 1900, "desempleo": 1900, "at_ep": 1900 },
    "tipos": { "contingencias_comunes": 0.236, "desempleo": 0.055, "at_ep": 0.015 }
  },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "obligacion-seguridad-social",
  "fuente": "declarado",
  "periodo": "2026-09",
  "contingencias": [
    { "contingencia": "contingencias_comunes", "base": 1900, "tipo": 0.236, "importe": 448.4, "aplicable": true, "abierto": null },
    { "contingencia": "desempleo", "base": 1900, "tipo": 0.055, "importe": 104.5, "aplicable": true, "abierto": null },
    { "contingencia": "fogasa", "base": null, "tipo": null, "importe": null, "aplicable": false, "abierto": "falta la base y el tipo de fogasa (no se estima)" },
    { "contingencia": "at_ep", "base": 1900, "tipo": 0.015, "importe": 28.5, "aplicable": true, "abierto": null }
  ],
  "aportacion_empresa": 581.4,
  "aportacion_trabajador": 130,
  "obligacion_tgss": 711.4,
  "gasto_empresa": 2581.4,
  "determinista": true,
  "tipos_declarados": ["contingencias_comunes","desempleo","at_ep"],
  "abierto": { "recibo": null, "tipos": null, "trabajador": null, "bruto": null }
}
```

### Sin recibo — ABIERTO

```json
{ "project_id": "e57a318a-..." }
```
→ `aportacion_empresa:null`, `obligacion_tgss:null`,
`abierto.recibo = "no se recibio el recibo de nomina (ni declarado ni de recibo-nomina): la obligacion no se inventa"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `obligacion-seguridad-social.calcular.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_calcular`. |
| (no es error) | 200 | Sin recibo o sin bases+tipos → ABIERTO (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.nomina_recibida` (puerto-nomina).
- **Llama por RPC (best-effort, 800 ms)**: `recibo-nomina.dar_forma.request`.
- **Habla con**: `calendario-fiscal.declarar.request` (condicional).
- **Le alimentan/usan**: `asiento-personal` (G3) pide `obligacion-seguridad-social.calcular.request`
  por RPC para construir el asiento de personal.

## Verificación

1. Fichero: `modules/contabilidad-fiscal/obligacion-seguridad-social/`.
2. Eventos reales: subscribes `obligacion-seguridad-social.calcular.request`, `contabilidad.nomina_recibida`;
   publishes `obligacion-seguridad-social.calcular.response`, `.failed` (+ `calendario-fiscal.declarar.request`).
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-fiscal/obligacion-seguridad-social/index.js
   # → obligacion-seguridad-social.calcular.failed / calendario-fiscal.declarar.request → recibo-nomina.dar_forma.request
   ```
4. Test unitario (si existe): con bases+tipos → sumas correctas; sin recibo → ABIERTO; sin tipos → `abierto.tipos`;
   `subir_calendario:true` → sube calendario; sin `project_id` → 400 + failed.
