---
name: informe-accionable
description: >-
  Skill FULL del módulo MICRO-AGENTE (mitad refleja) `informe-accionable` de la vertical
  contabilidad (Enki). Todo informe que recibe el cliente lleva QUÉ HACER con él. La RECOMENDACIÓN
  es juicio (mitad fuzzy del blueprint); esta mitad REFLEJA es determinista y honesta: aplica las
  REGLAS DE ACCIÓN DECLARADAS (campo · operador · umbral → recomendación) al informe/cifra ya
  compuesto (informe-rico K3) y adjunta las acciones que disparan. Motor de reglas puro: NO inventa
  una acción donde no hay regla declarada. Determinista. RPC `juzgar` es CLASE PREGUNTA.
when-to-use: >-
  - Cuando necesites adjuntar el "qué hacer" a un informe aplicando reglas declaradas
    (RPC informe-accionable.juzgar.request).
  - Cuando depures por qué `num_acciones:0` (sin reglas declaradas o ninguna dispara) o por qué
    `abierto.reglas` aparece.
  - Cuando quieras entender su contrato de eventos: es micro-agente reflejo, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, micro-agente, stateless, contabilidad, analitica, informe, acciones, reglas]
---

# informe-accionable — MICRO-AGENTE que adjunta el "qué hacer" al informe

## Qué hace el módulo

`informe-accionable` es un **MICRO-AGENTE** (R2, hoja del plan), en su **mitad REFLEJA**
(stateless). Todo informe que recibe el cliente lleva **QUÉ HACER** con él. La **RECOMENDACIÓN**
es **JUICIO**: la mitad **FUZZY** del híbrido vive en el blueprint; esta mitad refleja es la parte
**DETERMINISTA y HONESTA** — aplica las **REGLAS DE ACCIÓN DECLARADAS** al informe/cifra (un motor
de reglas puro: `campo · operador · umbral → recomendación`) y **NO inventa** una acción donde no
hay regla declarada.

- `informe-rico` (K3) **compone** la cifra; esta hoja le **adjunta** el "qué hacer".
- Lo no cubierto por una regla declarada NO se rellena: queda declarado como juicio (mitad fuzzy),
  nunca estimado.

Invariantes:
- **DETERMINISTA**: mismo informe + mismas reglas → mismas acciones.
- **Dato ausente = desconocido**: sin informe no hay nada a lo que adjuntar acción (no se fabrica);
  sin reglas declaradas → 0 acciones y el hueco se **DECLARA**.
- **NO escribe, NO persiste.**

RPC **PREGUNTA** → sin panel; su cara es el bus.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `informe-accionable.juzgar.request` | `onJuzgarRequest` | RPC micro-agente (**PREGUNTA**, por el bus): `{project_id, informe, reglas[{campo,operador,umbral,entonces,motivo?,severidad?}]}` → `{project_id, informe, acciones[], num_acciones, reglas_declaradas, abierto}`. Aplica las reglas declaradas al informe y devuelve las acciones que disparan. Sin reglas → 0 acciones. Responde por `.juzgar.response`. |

> **Nota de deriva (R3):** el plan declara escucha de `contabilidad.aviso_producido`
> (`motor-avisos` K2) y `contabilidad.asiento_asentado` (`escritor-diario` B2), pero el
> `module.json` real **solo** declara el `juzgar.request`. Ningún módulo del repo emite aún esos
> hechos (grupos posteriores); declararlos daría cadena colgada.

### Publishes

| Evento | Cuándo |
|---|---|
| `informe-accionable.juzgar.response` | Respuesta RPC correlada de la op `juzgar`. |
| `informe-accionable.juzgar.failed` | Fallo determinista: falta `project_id` o `informe`. |

> **No publica hecho de dominio** (R2).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `juzgar` | **PREGUNTA** (bus) | `{project_id, informe\|aviso\|cifra, reglas[]\|acciones[]\|criterio.reglas}` | `{project_id, tipo:'informe-accionable', informe, acciones, num_acciones, reglas_declaradas, deterministico:true, abierto}` | 400 `INVALID_INPUT` (`project_id`/`informe`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`; sin informe (`informe`/`aviso`/`cifra`) →
   `_invalid('informe')`.
2. **Reglas** (`_reglas`): de `input.reglas`, `input.acciones` o `input.criterio.reglas`. Sin
   reglas → `acciones:[]`, `reglas_declaradas:0`, `abierto.reglas` declarado.
3. **Operadores** (`OPERADORES`): `<, <=, >, >=, ==, !=, existe, no_existe`. Operador desconocido o
   sin `campo` → la regla **no dispara** (no se adivina).
4. **Campo** (`_leerCampo`): ruta con puntos (`a.b.c`) sobre el informe; ausente → `undefined`.
5. **`existe`/`no_existe`**: disparan según `actual` no nulo / nulo. Para el resto, **sin valor no
   se dispara** (no se estima).
6. **Comparación**: si `actual` y `umbral` son numéricos → comparación numérica; si no, para `==`/`!=`
   igualdad estricta de texto; otros operadores no disparan.
7. **Acción**: `{regla (de id/clave), recomendacion (de entonces/recomendacion), motivo, severidad}`.
8. **`deterministico:true`**: aplica reglas; jamás inventa una acción.

## Cómo se usa (RPC)

### Adjuntar acciones

```json
{
  "project_id": "e57a318a-...",
  "informe": { "periodo": "2026-Q3", "saldo": { "clientes": 120000 }, "vencido": 45000 },
  "reglas": [
    { "id": "r1", "campo": "vencido", "operador": ">", "umbral": 30000, "entonces": "reclamar a clientes morosos", "severidad": "alta", "motivo": "vencido > 30k" },
    { "id": "r2", "campo": "saldo.caja", "operador": "existe", "entonces": "revisar caja" }
  ]
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "tipo": "informe-accionable", "informe": { "...": "..." }, "acciones": [ { "regla": "r1", "recomendacion": "reclamar a clientes morosos", "motivo": "vencido > 30k", "severidad": "alta" } ], "num_acciones": 1, "reglas_declaradas": 2, "deterministico": true, "abierto": { "reglas": null } }
```
(Las reglas sobre campos inexistentes — como `saldo.caja` — no disparan.)

### Sin reglas → [ABIERTO]

```json
{ "project_id": "e57a318a-...", "informe": { "x": 1 } }
```
Respuesta `200`: `num_acciones:0, reglas_declaradas:0, abierto.reglas` declarado.

### Fallo — sin informe

Respuesta `400` + `informe-accionable.juzgar.failed` (`INVALID_INPUT`, field `informe`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`/`informe`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; el plan dice `informe-rico`, y el código no declara subir a él, pero el
  diseño es que K3 compone y R2 adjunta). Bases: `_shared` + filesystem.
- **Quién la usa:** el informe que recibe el cliente (con su "qué hacer").
- **Frontera con vecinos:** la narración fuzzy vive en R3; aquí solo reglas declaradas.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-analitica/informe-accionable/module.json` + `index.js`.
2. Smoke: `juzgar` con regla que dispara → acción en `acciones`.
3. Sin reglas → 0 acciones y `abierto.reglas`.
4. Operador desconocido → regla no dispara.
5. `grep -E '"event"' module.json` (solo `juzgar.request`).

## Notas de implementación

- Clase `InformeAccionable extends ModuloHibridoReflejo`; `name = 'informe-accionable'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless). Set `OPERADORES`.
- `onJuzgarRequest` delega en `_atender`; publica `.juzgar.failed` si status ≠ 200. Proyección
  `_juzgar`; helpers `_dispara`, `_leerCampo`, `_reglas`, `_num`; tool `toolJuzgar`.
