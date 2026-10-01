---
name: recibo-nomina
description: >-
  Skill FULL del módulo REFLEJO STATELESS `recibo-nomina` de la vertical contabilidad (Enki).
  Admite y da FORMA ASENTABLE al hecho de nómina: una CABEZA identificada (empleado, periodo,
  fecha, devengo) + unos CONCEPTOS declarados, cada uno con su importe. Mecánico, CERO juicio:
  NO calcula la nómina (bruto/neto, bases, tipos) ni la interpreta; el hecho llega YA emitido por
  puerto-nomina (G7) y aquí solo se le da la forma que necesitan asiento-personal (G3) y la
  cadena de nómina. Se normaliza la ESTRUCTURA, no el VALOR (los importes se copian; ausente →
  null, no 0). Dato ausente = desconocido. RPC `dar_forma` es CLASE PREGUNTA (por el bus).
when-to-use: >-
  - Cuando necesites dar forma asentable al hecho de nómina (RPC recibo-nomina.dar_forma.request).
  - Cuando depures por qué hay campos en `abierto.cabeza` (cabeza incompleta) o por qué un
    concepto sale con `importe:null` (no se asume 0).
  - Cuando quieras entender su contrato de eventos: es reflejo puro, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, fiscal, nomina, recibo, forma]
---

# recibo-nomina — REFLEJO que da forma asentable al hecho de nómina

## Qué hace el módulo

`recibo-nomina` es un **REFLEJO STATELESS** (G1, hoja del plan). Admite y da **FORMA
ASENTABLE** al hecho de nómina. Es **mecánico, CERO juicio**: **NO calcula** la nómina
(bruto/neto, bases, tipos), **NO la interpreta** y **NO decide** nada — el hecho de nómina llega
**YA emitido** (por `puerto-nomina` G7) y aquí se le da la forma que el escritor de personal
(`asiento-personal` G3) y el resto de la cadena de nómina necesitan.

La forma asentable: una **CABEZA** identificada (empleado, periodo) y unos **CONCEPTOS**
declarados, cada uno con su importe. Se normaliza la **ESTRUCTURA**, no el **VALOR**: los
importes y conceptos son DECLARADOS y se copian tal cual (lo ausente queda `null`).

**Dato ausente = desconocido**: sin hecho de nómina no hay forma que dar (no se fabrica); un
concepto sin importe se declara, **no se estima con un cero**. Su RPC `dar_forma` es **CLASE
PREGUNTA** → sin panel; su cara es el bus.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `recibo-nomina.dar_forma.request` | `onDarFormaRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id, nomina}` → `{project_id, forma, cabeza, conceptos, num_conceptos, calculado:false, interpretado:false, abierto}`. Da forma asentable al hecho de nómina; los importes se copian declarados (no se calculan). Responde por `.dar_forma.response`. |

> **Nota de deriva (R3):** el plan declara escucha de `contabilidad.nomina_recibida`, pero el
> `module.json` real **solo** declara el `dar_forma.request`. Ningún módulo del repo emite aún
> ese hecho (`puerto-nomina` G7, de un grupo posterior); declararlo daría cadena colgada.

### Publishes

| Evento | Cuándo |
|---|---|
| `recibo-nomina.dar_forma.response` | Respuesta RPC correlada de la op `dar_forma`. |
| `recibo-nomina.dar_forma.failed` | Fallo determinista: falta `project_id` o `nomina`. |

> **No publica hecho de dominio**: reflejo puro (da forma, no escribe estado) → no hay
> `contabilidad.*` que anunciar (R2). El handler publica `.dar_forma.failed` solo si status ≠ 200.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `dar_forma` | **PREGUNTA** (bus) | `{project_id, nomina\|hecho\|recibo}` | `{project_id, tipo:'recibo-nomina', forma, cabeza, conceptos, num_conceptos, calculado:false, interpretado:false, abierto}` | 400 `INVALID_INPUT` (`project_id`/`nomina`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`; sin nómina objeto (`nomina`/`hecho`/`recibo`)
   → `_invalid('nomina')`.
2. **Campos de CABEZA** (`CABEZA`): `empleado, empleado_id, periodo, fecha, devengo`. Cada uno se
   copia; ausente/vacío → `null` y se apila en `faltan_cabeza`.
3. **`abierto.cabeza`** declarado si falta algún campo de cabeza (`'campos de cabeza sin declarar:
   ...'`).
4. **CONCEPTOS** (`_conceptos`): de `nomina.conceptos` o `nomina.lineas`. Cada uno:
   `{orden (1-based), concepto|clave, tipo, importe, signo, cantidad, precio}`.
5. **Importes COPIADOS, nunca calculados**: `importe` de `o.importe` o `o.cuantia`; ausente →
   `null` (**no se asume 0**).
6. **`abierto.conceptos`** declarado si no hay conceptos (`'el hecho de nomina no declara
   conceptos: la forma queda sin lineas (no se estiman)'`).
7. **Banderas fijas**: `calculado:false`, `interpretado:false`.
8. **Determinista y stateless**: no guarda nada, no persiste.

## Cómo se usa (RPC)

### Dar forma a una nómina

```json
{
  "project_id": "e57a318a-...",
  "nomina": {
    "empleado": "Ana Pérez", "empleado_id": "emp-1", "periodo": "2026-09", "fecha": "2026-09-30",
    "conceptos": [ { "concepto": "salario_base", "importe": 2000 }, { "concepto": "irpf", "cuantia": -300, "signo": "N" } ]
  }
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...", "tipo": "recibo-nomina",
  "forma": { "empleado": "Ana Pérez", "empleado_id": "emp-1", "periodo": "2026-09", "fecha": "2026-09-30", "devengo": null, "conceptos": [ { "orden": 1, "concepto": "salario_base", "tipo": null, "importe": 2000, "signo": null, "cantidad": null, "precio": null }, { "orden": 2, "concepto": "irpf", "tipo": null, "importe": -300, "signo": "N", "cantidad": null, "precio": null } ] },
  "cabeza": { "empleado": "Ana Pérez", "empleado_id": "emp-1", "periodo": "2026-09", "fecha": "2026-09-30", "devengo": null },
  "conceptos": [ "..." ], "num_conceptos": 2, "calculado": false, "interpretado": false,
  "abierto": { "cabeza": "campos de cabeza sin declarar: devengo (se declaran, no se inventan)", "conceptos": null }
}
```

### Fallo — sin nómina

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `recibo-nomina.dar_forma.failed` (`INVALID_INPUT`, field `nomina`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`) | falta `project_id`. |
| `400 INVALID_INPUT` (`nomina`) | no viene hecho de nómina objeto. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` +
  `project-manager`.
- **De quién depende:** el hecho de nómina lo emite `puerto-nomina` (G7) — aún no en el repo (R3).
- **Quién la usa:** `asiento-personal` (G3) y la cadena de nómina (lineas-nomina, conceptos-extra).
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-fiscal/recibo-nomina/module.json` + `index.js`.
2. Smoke: `dar_forma` con nómina → 200, cabeza + conceptos copiados.
3. Cabeza incompleta → `abierto.cabeza` declarado; sin conceptos → `abierto.conceptos`.
4. Sin nómina → 400 + `.dar_forma.failed`.
5. `grep -E '"event"' module.json` (solo `dar_forma.request`).

## Notas de implementación

- Clase `ReciboNomina extends ModuloHibridoReflejo`; `name = 'recibo-nomina'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- `onDarFormaRequest` delega en `_atender(e,'dar_forma','recibo-nomina.dar_forma.response', ...)`
  y publica `.dar_forma.failed` si status ≠ 200.
- Proyección `_dar_forma`; helper `_conceptos`; tool `toolDarForma`.
  `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo`.
