---
name: valoracion-existencia
description: >-
  Skill FULL del módulo REFLEJO STATELESS `valoracion-existencia` de la vertical contabilidad
  (Enki). Capa de VALOR sobre el inventario existente (NO lo duplica: el store de stock es
  `inventario`): recibe las existencias declaradas y les aplica el MÉTODO DE VALORACIÓN declarado
  (FIFO/PMP/medio) para devolver su valor. El método es DATO, no constante cableada. Determinista.
  Dato ausente = desconocido: una línea sin cantidad o sin coste NO se valora con un cero
  (`valor:null, valoracion_completa:false`); el TOTAL solo se declara si TODAS las líneas tienen
  valor. NO escribe, NO persiste, NO muta el inventario. RPC PREGUNTA (por el bus, sin panel).
when-to-use: >-
  - Cuando necesites valorar existencias declaradas con un método declarado
    (RPC valoracion-existencia.valorar.request).
  - Cuando depures por qué el `total` es `null` (`valoracion_completa:false`: hay líneas
    incompletas) o por qué `abierto.metodo` aparece.
  - Cuando quieras entender su contrato de eventos: es reflejo puro, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, analitica, existencias, valoracion, inventario]
---

# valoracion-existencia — REFLEJO de la capa de valor sobre el inventario

## Qué hace el módulo

`valoracion-existencia` es un **REFLEJO STATELESS** (H1, hoja del plan). Es una **CAPA DE VALOR
*SOBRE* el inventario existente**. **NO lo duplica**: recibe las existencias YA declaradas (el
store de stock es `inventario`, infra reutilizada como base) y les aplica el **MÉTODO DE
VALORACIÓN declarado** (FIFO / PMP / coste medio / coste declarado) para devolver su valor. El
método es **DATO** (ParametroDeclarable), no una constante cableada.

**Determinista**: mismas existencias + mismo método → mismo valor. Cero juicio.

Invariantes:
- **Dato ausente = desconocido**: una línea sin cantidad o sin coste NO se valora con un cero — su
  `valor` queda `null` y la valoración se declara `valoracion_completa:false`.
- **Sin método declarado** se valora igual lo declarado, pero el hueco se DECLARA (`abierto.metodo`).
- **El `total` solo se declara si TODAS las líneas tienen valor** (no una suma parcial).
- **NO escribe, NO persiste, NO muta** el inventario: solo calcula.

RPC **PREGUNTA** → sin `ui_handlers`; su cara es el bus.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `valoracion-existencia.valorar.request` | `onValorarRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id, existencias, metodo?}` → `{project_id, fuente, metodo, lineas[], num_lineas, total, valoracion_completa, abierto, faltan}`. Valora las existencias declaradas con el método declarado (cantidad × coste). Sin existencias → valoración vacía con el hueco declarado; líneas incompletas → `total:null`. Responde por `.valorar.response`. |

> Nota de deriva (R3): el plan declara subir `frontera-ficha-producto.entrar.request`, pero el
> `module.json` real **no** lo declara. Tampoco escucha hechos de dominio.

### Publishes

| Evento | Cuándo |
|---|---|
| `valoracion-existencia.valorar.response` | Respuesta RPC correlada de la op `valorar`. |
| `valoracion-existencia.valorar.failed` | Fallo determinista: falta `project_id` o payload inválido. |

> **No publica hecho de dominio** (R2).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `valorar` | **PREGUNTA** (bus) | `{project_id, existencias\|inventario\|lineas, metodo?\|criterio{metodo}}` | `{project_id, fuente, metodo, metodo_declarado, lineas, num_lineas, total, valoracion_completa, abierto, faltan, motivo}` | 400 `INVALID_INPUT` (`project_id`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`.
2. **Existencias**: array de `existencias`/`inventario`/`lineas`. Si no es array → valoración vacía
   con `fuente:null, total:null, valoracion_completa:false`, `abierto.existencias` declarado,
   `faltan:['existencias']`.
3. **Método** (`_metodo`): de `input.metodo` o `input.criterio.metodo`; se guarda en MAYÚSCULAS;
   ausente → `null` (`metodo_declarado:false`, `abierto.metodo` declarado).
4. **Por línea**: `cantidad` de `cantidad`/`stock`; `coste` de `coste_unitario`/`coste`/`precio`
   (`_num`). `valor = round(cantidad * coste, 2)` **solo si ambos no son null**; si no → `null`.
5. **`completa`**: `false` en cuanto una línea queda sin valor. `total = completa ? round(suma,2) : null`
   (nunca una suma parcial).
6. **Línea**: `{producto (de producto/producto_id/sku/referencia), cantidad, coste_unitario,
   valor, moneda}`.
7. **`abierto.lineas_incompletas`** declarado si `!completa`.
8. **Determinista y stateless**: el orden de las líneas sigue el declarado.

## Cómo se usa (RPC)

### Valorar existencias

```json
{
  "project_id": "e57a318a-...",
  "metodo": "pmp",
  "existencias": [ { "producto": "PLA-1", "cantidad": 10, "coste_unitario": 19.9, "moneda": "EUR" }, { "producto": "PETG-1", "stock": 5, "precio": 25 } ]
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...", "fuente": "declarado", "metodo": "PMP", "metodo_declarado": true,
  "lineas": [ { "producto": "PLA-1", "cantidad": 10, "coste_unitario": 19.9, "valor": 199, "moneda": "EUR" }, { "producto": "PETG-1", "cantidad": 5, "coste_unitario": 25, "valor": 125, "moneda": null } ],
  "num_lineas": 2, "total": 324, "valoracion_completa": true,
  "abierto": { "metodo": null, "lineas_incompletas": null }, "faltan": [], "motivo": null
}
```

### Líneas incompletas → total:null

Con una línea sin coste → `valoracion_completa:false`, `total:null`, `valor` de esa línea `null`, y
`abierto.lineas_incompletas` declarado.

### Sin existencias

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`: `{fuente:null, lineas:[], total:null, valoracion_completa:false, abierto:{existencias:'...'}, faltan:['existencias']}`.

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`) | falta `project_id`. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; el plan dice `frontera-ficha-producto`, y usa `inventario` como base,
  pero el `module.json` real no lo declara). Bases: `_shared` + filesystem + `inventario`.
- **Quién la usa:** la cadena de existencias (`variacion-stock-valorada`, `ajuste-inventario`).
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-analitica/valoracion-existencia/module.json` + `index.js`.
2. Smoke: `valorar` con método PMP y líneas completas → `total` calculado, `valoracion_completa:true`.
3. Línea incompleta → `total:null`, `valor:null`, `abierto.lineas_incompletas`.
4. Sin existencias → valoración vacía con `faltan:['existencias']`.
5. `grep -E '"event"' module.json`.

## Notas de implementación

- Clase `ValoracionExistencia extends ModuloHibridoReflejo`; `name = 'valoracion-existencia'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- `onValorarRequest` delega en `_atender`; publica `.valorar.failed` si status ≠ 200.
  Proyección `_valorar`; helpers `_metodo`, `_num`; tool `toolValorar`.
