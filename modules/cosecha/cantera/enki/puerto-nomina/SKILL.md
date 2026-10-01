---
name: puerto-nomina
description: >-
  Skill FULL del módulo PUENTE STATELESS `puerto-nomina` de la vertical contabilidad (Enki).
  ORIGEN DECLARABLE del dato de nómina: la FRONTERA por la que entra la nómina de un sistema de
  personal externo (o de la operación). `recibir` (ORDEN, panel) admite UNA nómina ya emitida TAL
  CUAL (no la interpreta, no le da forma — eso es recibo-nomina G1) y ANUNCIA el hecho de dominio
  `contabilidad.nomina_recibida` para que arranque la cadena de nómina. Dato ausente = desconocido.
  STATELESS: sin PosPersistencia. Este puente EMITE contabilidad.nomina_recibida.
when-to-use: >-
  - Cuando necesites admitir una nómina ya emitida por un sistema externo
    (RPC puerto-nomina.recibir.request).
  - Cuando depures por qué no arranca la cadena de nómina (no se emitió
    contabilidad.nomina_recibida), o por qué se rechaza (400 INVALID_INPUT por falta de nomina).
  - Cuando quieras entender su contrato de eventos y el hecho contabilidad.nomina_recibida.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, stateless, contabilidad, fiscal, nomina, puerto, frontera]
---

# puerto-nomina — PUENTE del origen declarable de la nómina

## Qué hace el módulo

`puerto-nomina` es un **PUENTE** (G4, hoja del plan), stateless. Es el **ORIGEN DECLARABLE** del
dato de nómina: la **FRONTERA** por la que entra la nómina de un **sistema de personal externo**
(o de la operación de la vertical). Si no existe el origen, se **DECLARA** (el puerto se abre con
su contrato); no se inventa el dato.

- **`recibir`** — llega UNA nómina ya emitida por el origen externo. El puerto la **ADMITE tal
  cual** (no la interpreta) y **ANUNCIA** el hecho de dominio `contabilidad.nomina_recibida` para
  que arranque la cadena de nómina (`recibo-nomina` G1, `lineas-nomina` G6,
  `pagos-a-cuenta-empleado` G8, `obligacion-seguridad-social`, `asiento-personal`…).

**Frontera:** la nómina viene de FUERA del repo (el sistema de personal). La escucha de
`contabilidad.nomina_recibida` NO se declara: **este puerto la EMITE**.

**Invariante**: dato ausente = desconocido. Sin nómina no hay nada que recibir (no se fabrica); el
origen/contrato que no venga queda declarado en `abierto`, nunca estimado. RPC **ORDEN** → lleva
`ui_handlers` (`workspace_module`, `barra_modulos`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `puerto-nomina.recibir.request` | `onRecibirRequest` | RPC puente (**ORDEN**, panel): `{project_id, nomina, origen?, empleado?, periodo?, recibida_en?}` → `{project_id, nomina, origen, empleado, periodo, recibida, interpretada:false, abierto}`. Admite la nómina ya emitida por el origen externo (sin interpretarla) y publica `contabilidad.nomina_recibida`. Responde por `.recibir.response`; sin nomina → `.recibir.failed`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.nomina_recibida` | Fire-and-forget (G4): la puerta admitió una nómina ya emitida por un origen externo → `{project_id, nomina, origen, empleado, periodo, recibida_en}`. **Arranca la cadena de nómina.** Lo consumen recibo-nomina (G1), obligacion-seguridad-social, asiento-personal, lineas-nomina (G6), pagos-a-cuenta-empleado (G8), conceptos-extra-nomina y liquidacion-baja-empleado. |
| `puerto-nomina.recibir.response` | Respuesta RPC correlada de la op `recibir`. |
| `puerto-nomina.recibir.failed` | Fallo determinista: falta `project_id` o `nomina`. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `recibir` | **ORDEN** (panel) | `{project_id, nomina\|hecho\|recibo, origen?\|vertical?\|sistema?, empleado?, periodo?, recibida_en?}` | `{project_id, tipo:'puerto-nomina', nomina, origen, empleado, periodo, recibida_en, recibida:true, interpretada:false, abierto}` | 400 `INVALID_INPUT` (`project_id`/`nomina`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`; sin nómina (`nomina`/`hecho`/`recibo`) →
   `_invalid('nomina')`.
2. **La nómina entra TAL CUAL**: se devuelve `nomina` sin tocar; `interpretada:false` (la forma
   asentable es de `recibo-nomina` G1).
3. **`origen`**: de `input.origen`/`vertical`/`sistema`. Ausente → `null`; y se declaran DOS claves
   de `abierto`: `origen` (el puerto no inventa el emisor) y `origen_externo` (si no existe el
   origen, se declara el puerto y se crea).
4. **`empleado`**: de `input.empleado` o de la nómina (`empleado`/`empleado_id`). **`periodo`**: de
   `input.periodo` o de la nómina.
5. **`recibida_en`**: `input.recibida_en` o `new Date().toISOString()`.
6. **STATELESS**: no guarda nada; el hecho de dominio y su anotación los hacen otros.

## Cómo se usa (RPC)

### Recibir una nómina → arranca la cadena

```json
{
  "project_id": "e57a318a-...",
  "nomina": { "empleado": "Ana Pérez", "periodo": "2026-09", "bruto": 2000, "retencion": 300, "conceptos": [ { "concepto": "salario_base", "importe": 2000 } ] },
  "origen": "nomina-externa",
  "correlation_id": "abc-16"
}
```
Respuesta `200` + `contabilidad.nomina_recibida`:
```json
{ "project_id": "e57a318a-...", "tipo": "puerto-nomina", "nomina": { "...": "..." }, "origen": "nomina-externa", "empleado": "Ana Pérez", "periodo": "2026-09", "recibida_en": "2026-10-01T...", "recibida": true, "interpretada": false, "abierto": { "origen": null, "origen_externo": null } }
```

### Sin origen → [ABIERTO]

Sin `origen` → `abierto.origen` y `abierto.origen_externo` declarados (se admite igual).

### Fallo — sin nómina

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `puerto-nomina.recibir.failed` (`INVALID_INPUT`, field `nomina`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`/`nomina`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; el plan dice `recibo-nomina`, pero el `module.json` real no declara subir
  a él). Bases: `_shared` + filesystem.
- **De quién depende por evento:** ninguno. La nómina viene de FUERA del repo.
- **Quién la consume por evento:** la cadena de nómina — recibo-nomina (G1),
  obligacion-seguridad-social, asiento-personal, lineas-nomina (G6), pagos-a-cuenta-empleado (G8),
  conceptos-extra-nomina, liquidacion-baja-empleado.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-fiscal/puerto-nomina/module.json` + `index.js`.
2. Smoke: `recibir` con nómina → 200 + `contabilidad.nomina_recibida`.
3. Sin origen → `abierto.origen`/`abierto.origen_externo`.
4. Sin nómina → 400 + `.recibir.failed`.
5. `grep -E '"event"' module.json`.

## Notas de implementación

- Clase `PuertoNomina extends ModuloHibridoReflejo`; `name = 'puerto-nomina'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- `onRecibirRequest` delega en `_atender`; publica `contabilidad.nomina_recibida` si 200, si no
  `.recibir.failed`. Proyección `_recibir`; tool `toolRecibir`.
