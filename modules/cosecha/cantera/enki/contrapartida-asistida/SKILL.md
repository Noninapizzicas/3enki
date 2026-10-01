---
name: contrapartida-asistida
description: >-
  Skill FULL del módulo MICRO-AGENTE (mitad refleja) `contrapartida-asistida` de la vertical
  contabilidad (Enki). PROPONE cuenta/tercero/periodo contra el PLAN DECLARADO; el corte duro lo
  fija regla-contrapartida (A6.2) — esta hoja NO decide. Su mitad REFLEJA es determinista y
  honesta: junta lo DECLARADO (la regla vigente, SUBIDA a regla-contrapartida.aplicar.request por
  EVENTO) y lo expone como PROPUESTA; lo no cubierto por una regla declarada NO se rellena (queda
  en `abierto`, es juicio de la mitad fuzzy). Dato ausente = desconocido. NO escribe, NO persiste.
  Escucha contabilidad.hecho_recibido / .plan_cuentas_declarado / .tercero_actualizado.
when-to-use: >-
  - Cuando necesites proponer la contrapartida de un hecho contra el plan declarado
    (RPC contrapartida-asistida.juzgar.request).
  - Cuando depures por qué `propuesta.contrapartida:null` y `completa:false` (no hay regla
    declarada que cubra el hecho).
  - Cuando quieras entender su contrato de eventos: es micro-agente reflejo, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, micro-agente, stateless, contabilidad, entrada, contrapartida, propuesta]
---

# contrapartida-asistida — MICRO-AGENTE que propone la contrapartida

## Qué hace el módulo

`contrapartida-asistida` es un **MICRO-AGENTE** (A6.1, hoja del plan), en su **mitad REFLEJA**
(stateless). **PROPONE** cuenta/tercero/periodo contra el **PLAN DECLARADO**. **PROPONE**; el corte
duro lo fija `regla-contrapartida` (A6.2). Esta hoja **NO decide**: sugiere la contrapartida de un
hecho y deja que la regla declarada (el humano) fije la contrapartida definitiva.

La mitad refleja (determinista) NO inventa una contrapartida. Junta lo **DECLARADO** (la regla
vigente, vía `regla-contrapartida.aplicar.request` por EVENTO) y lo expone como **PROPUESTA**. Lo
que no esté cubierto por una regla declarada NO se rellena: queda declarado como juicio (mitad
fuzzy), nunca estimado.

Invariantes:
- **PROPONE, no fija**: `juzgar` deriva; el corte duro es de `regla-contrapartida` (A6.2).
- **Dato ausente = desconocido**: sin hecho NO hay nada que proponer; sin regla declarada la
  propuesta queda ABIERTA.
- **NO escribe, NO persiste.**

**Escucha** (R3, con emisor vivo): `contabilidad.hecho_recibido` (`puerto-evento-vertical` A1),
`contabilidad.plan_cuentas_declarado` (`catalogo-cuentas` B1) y `contabilidad.tercero_actualizado`
(`maestro-terceros` N1) — los tres handlers son **fire-and-forget**: toman constancia del contexto
(traza vía `logger.info`) sin anunciar hecho. RPC **PREGUNTA** → sin panel.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `contrapartida-asistida.juzgar.request` | `onJuzgarRequest` | RPC micro-agente (**PREGUNTA**, por el bus): `{project_id?, hecho, contexto?, tercero?, periodo?}` → `{project_id, hecho, contexto, propuesta{contrapartida,tercero,periodo}, completa, propone:true, fija:false}`. Propone la contrapartida del hecho contra la regla declarada (vía `regla-contrapartida.aplicar.request`). Sin hecho → `INVALID_INPUT`. Responde por `.juzgar.response`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | **Fire-and-forget** (lo emite `puerto-evento-vertical` A1): se recibió un hecho crudo → toma constancia del contexto. **No responde** (no propone ni escribe; el hecho llega por RPC). |
| `contabilidad.plan_cuentas_declarado` | `onPlanCuentasDeclarado` | **Fire-and-forget** (lo emite `catalogo-cuentas` B1): el plan contable cambió → toma constancia del contexto. No responde. |
| `contabilidad.tercero_actualizado` | `onTerceroActualizado` | **Fire-and-forget** (lo emite `maestro-terceros` N1): un tercero quedó actualizado → toma constancia del contexto. No responde. |

**Sube por evento:** `regla-contrapartida.aplicar.request` (A6.2) con `{project_id, contexto, hecho}`,
`await this._rpc(...)`. Nunca import.

### Publishes

| Evento | Cuándo |
|---|---|
| `contrapartida-asistida.juzgar.response` | Respuesta RPC correlada de la op `juzgar`. |
| `contrapartida-asistida.juzgar.failed` | Fallo determinista: falta el hecho. |

> **No publica hecho de dominio** (R2).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `juzgar` | **PREGUNTA** (bus) | `{project_id?, hecho\|evento, contexto?, tercero?, periodo?}` | `{project_id, hecho, contexto, propuesta, completa, propone:true, fija:false, regla?, abierto}` | 400 `INVALID_INPUT` (`hecho`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Hecho obligatorio**: `hecho`/`evento` objeto → si no, `_invalid('hecho')`.
2. **Contexto** (`_contexto`): `input.contexto` o, si no, del hecho por
   `contexto/proveedor/cliente/tercero/nif/numero_fiscal`.
3. **Sube a `regla-contrapartida.aplicar.request`** con `{project_id, contexto, hecho}` (await).
   `aplicada = regla.data.aplicada === true`; `contrapartida = aplicada ? regla.data.contrapartida : null`.
4. **Tercero y periodo** (`_campo`): de la petición o del hecho (`tercero/proveedor/cliente/nif/
   numero_fiscal`; `periodo/ejercicio/fecha/fecha_valor`). Ausente → `null` (no se estima).
5. **`completa`** = `propuesta.contrapartida != null`.
6. **`propone:true, fija:false`** siempre.
7. **`abierto`** declarado si no completa: `'no hay regla declarada que cubra este hecho: ... (es
   juicio de la mitad fuzzy, no se estima)'`.
8. **Los tres handlers de dominio** solo loguean (`logger.info`) el contexto; envueltos en `try/catch`.

## Cómo se usa (RPC)

### Proponer la contrapartida

```json
{ "project_id": "e57a318a-...", "hecho": { "proveedor": "ACME", "importe": 500, "fecha": "2026-10-01" } }
```
Respuesta `200` (con regla declarada que cubre `proveedor:ACME`):
```json
{ "project_id": "e57a318a-...", "hecho": { "proveedor": "ACME", "importe": 500, "fecha": "2026-10-01" }, "contexto": "ACME", "propuesta": { "contrapartida": "4000", "tercero": "ACME", "periodo": "2026-10-01" }, "completa": true, "propone": true, "fija": false, "regla": { "clave": "ACME::4000" }, "abierto": null }
```

### Sin regla → propuesta abierta

```json
{ "project_id": "e57a318a-...", "hecho": { "proveedor": "desconocido", "importe": 1 } }
```
Respuesta `200`: `{propuesta:{contrapartida:null, tercero:'desconocido', periodo:null}, completa:false, abierto:'...'}`.

### Fallo — sin hecho

Respuesta `400` + `contrapartida-asistida.juzgar.failed` (`INVALID_INPUT`, field `hecho`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`hecho`) | no viene hecho/evento objeto. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** `regla-contrapartida` (A6.2) — **sube** `regla-contrapartida.aplicar.request` por
  EVENTO.
- **De quién depende por evento:** `puerto-evento-vertical` (A1), `catalogo-cuentas` (B1) y
  `maestro-terceros` (N1) emiten sus hechos de contexto.
- **Frontera con vecinos:** `regla-contrapartida` (A6.2) fija el corte duro; esta hoja solo propone.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-entrada/contrapartida-asistida/module.json` + `index.js`.
2. Smoke: `juzgar` con hecho cubierto por regla → `completa:true`, `propone:true`.
3. Sin regla → `contrapartida:null`, `abierto` declarado.
4. Sin hecho → 400 + `.juzgar.failed`.
5. `grep -E '"event"' module.json` (1 RPC + 3 hechos de contexto).

## Notas de implementación

- Clase `ContrapartidaAsistida extends ModuloHibridoReflejo`; `name = 'contrapartida-asistida'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- `onJuzgarRequest` delega en `_atender` (`async`), publica `.juzgar.failed` si status ≠ 200.
  Handlers `onHechoRecibido`/`onPlanCuentasDeclarado`/`onTerceroActualizado`. Proyección
  `async _juzgar`; helpers `_contexto`, `_campo`; tool `toolJuzgar`.
