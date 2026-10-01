---
name: lineas-nomina
description: >-
  Skill FULL del módulo REFLEJO STATELESS `lineas-nomina` de la vertical contabilidad (Enki).
  DESGLOSE de la nómina: bruto · retención (IRPF) · cotización del trabajador · neto. Hace la
  nómina EXPLICABLE. Mecánico y DETERMINISTA: NO decide bases ni tipos; TOMA los importes
  DECLARADOS del recibo (G1) y los CLASIFICA en las cuatro cubetas con la clasificación DECLARABLE
  (palabra/tipo → cubeta). Lo no clasificable cae en `otras`; el neto se declara completo o no
  (`neto_completo`), nunca se cierra a ciegas. neto = bruto − retención − cotización (+ otras).
  NO escribe, NO persiste. RPC `desglosar` es CLASE PREGUNTA (por el bus).
when-to-use: >-
  - Cuando necesites desglosar una nómina en bruto/retención/cotización/neto
    (RPC lineas-nomina.desglosar.request).
  - Cuando depures por qué hay líneas en `otras` (falta clasificación declarada) o por qué
    `neto_completo:false` (falta algún término).
  - Cuando quieras entender su contrato de eventos: es reflejo puro, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, fiscal, nomina, desglose, neto]
---

# lineas-nomina — REFLEJO que hace la nómina explicable

## Qué hace el módulo

`lineas-nomina` es un **REFLEJO STATELESS** (G6, hoja del plan). Hace el **DESGLOSE** de la
nómina: **bruto · retención (IRPF) · cotización del trabajador · neto**. Hace la nómina
**EXPLICABLE** — convierte el recibo (G1) en sus líneas con su naturaleza.

**Mecánico y DETERMINISTA**: NO decide las bases ni los tipos (eso es del motor de personal, fuera
de esta hoja); TOMA los importes **DECLARADOS** y los **CLASIFICA** en las cuatro cubetas. Lo que
no pueda clasificar con una regla declarada NO se inventa: cae en **`otras`** y el neto se declara
**COMPLETO o NO** (`neto_completo`), nunca se cierra a ciegas.

```
neto = bruto − retención − cotización + otras   (según los signos declarados)
```

Invariante: **dato ausente = desconocido**. Sin nómina/recibo no hay desglose (no se fabrica); un
importe sin declarar queda `null`, no `0`. Sin ninguna línea en una cubeta → su total es `null`
(no un 0 inventado). RPC **PREGUNTA** → sin panel.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `lineas-nomina.desglosar.request` | `onDesglosarRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id, nomina\|recibo, clasificacion?}` → `{project_id, desglose{bruto,retencion,cotizacion,neto}, otras, neto, neto_completo, neto_derivado, num_lineas, abierto}`. Clasifica los conceptos declarados en las cuatro cubetas y calcula los totales; lo no clasificable cae en `otras`. Responde por `.desglosar.response`; sin nomina → `.desglosar.failed`. |

> **Nota de deriva (R3):** el plan declara escucha de `contabilidad.nomina_recibida`, pero el
> `module.json` real **solo** declara el `desglosar.request`. Ningún módulo del repo emite aún ese
> hecho (`puerto-nomina` G4, grupo posterior); declararlo daría cadena colgada.

### Publishes

| Evento | Cuándo |
|---|---|
| `lineas-nomina.desglosar.response` | Respuesta RPC correlada de la op `desglosar`. |
| `lineas-nomina.desglosar.failed` | Fallo determinista: falta `project_id` o `nomina`. |

> **No publica hecho de dominio** (R2).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `desglosar` | **PREGUNTA** (bus) | `{project_id, nomina\|recibo\|hecho\|recibo_nomina, clasificacion?}` | `{project_id, tipo:'lineas-nomina', desglose, otras, neto_completo, neto, neto_derivado, num_lineas, determinista:true, abierto}` | 400 `INVALID_INPUT` (`project_id`/`nomina`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`; sin nómina (`nomina`/`recibo`/`hecho`/
   `recibo_nomina`) → `_invalid('nomina')`.
2. **Cubetas** (`CUBETAS`): `bruto, retencion, cotizacion, neto`.
3. **Conceptos** (`_conceptos`): de `nomina.desglose`, `nomina.conceptos` o `nomina.lineas`. Cada
   uno: `{orden, concepto (de concepto/clave/tipo), tipo, importe, signo}`.
4. **Clasificación declarable** (`_clasificacion`): mapa `{palabra_o_tipo → cubeta}`; acepta la
   orientación inversa `{cubeta → palabra}`. Solo entran claves/valores que sean cubetas válidas.
5. **`_clasificar`**: por `tipo` declarado, o por `concepto` exacto, o por substring del concepto.
   **Sin regla declarada → `null` → cae en `otras`** (no se inventa).
6. **Totales** (`total`): suma de los `importe` numéricos de cada cubeta; **sin líneas → `null`**
   (no un 0). `otras_total` igual.
7. **`neto`**: el declarado si viene en la cubeta `neto`; si no, se **DERIVA** de
   `bruto − retencion − cotizacion` (`neto_derivado:true`) cuando hay al menos un término.
8. **`neto_completo`**: `true` solo si `bruto`, `retencion` y `cotizacion` **no** son `null`.
   `abierto.neto` declarado si no.
9. **`abierto.clasificacion`** declarado si no se declaró ninguna clasificación.

## Cómo se usa (RPC)

### Desglosar una nómina

```json
{
  "project_id": "e57a318a-...",
  "nomina": { "conceptos": [ { "concepto": "salario_base", "tipo": "bruto", "importe": 2000 }, { "concepto": "irpf", "tipo": "retencion", "importe": 300 }, { "concepto": "ss_trabajador", "tipo": "cotizacion", "importe": 120 } ] },
  "clasificacion": { "bruto": ["salario_base"], "retencion": ["irpf"], "cotizacion": ["ss"] }
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "tipo": "lineas-nomina", "desglose": { "bruto": { "total": 2000, "lineas": [ { "orden": 1, "concepto": "salario_base", "tipo": "bruto", "importe": 2000, "signo": null } ] }, "retencion": { "total": 300, "lineas": [ "..." ] }, "cotizacion": { "total": 120, "lineas": [ "..." ] }, "neto": { "total": 1580, "lineas": [] } }, "otras": { "total": null, "lineas": [] }, "neto_completo": true, "neto": 1580, "neto_derivado": true, "num_lineas": 3, "determinista": true, "abierto": { "clasificacion": null, "neto": null } }
```

### Sin clasificación → conceptos a `otras`

Sin `clasificacion`, todos los conceptos caen en `otras`, `neto` deriva de los totales `null` (queda
`null`) y `abierto.clasificacion` se declara.

### Fallo — sin nómina

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `lineas-nomina.desglosar.failed` (`INVALID_INPUT`, field `nomina`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`/`nomina`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; el plan dice `recibo-nomina`, y su materia es el recibo G1). Bases:
  `_shared` + filesystem.
- **Quién la usa:** la cadena de nómina (asiento-personal, explicación del recibo).
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-fiscal/lineas-nomina/module.json` + `index.js`.
2. Smoke: `desglosar` con clasificación → cubetas pobladas, `neto` derivado.
3. Sin clasificación → todo a `otras`, `abierto.clasificacion` declarado.
4. Sin nómina → 400 + `.desglosar.failed`.
5. `grep -E '"event"' module.json` (solo `desglosar.request`).

## Notas de implementación

- Clase `LineasNomina extends ModuloHibridoReflejo`; `name = 'lineas-nomina'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless). Constante `CUBETAS`.
- `onDesglosarRequest` delega en `_atender`; publica `.desglosar.failed` si status ≠ 200.
  Proyección `_desglosar`; helpers `_nomina`, `_conceptos`, `_clasificacion`, `_clasificar`, `_num`;
  tool `toolDesglosar`.
