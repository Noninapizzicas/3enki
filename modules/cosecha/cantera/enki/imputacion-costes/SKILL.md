---
name: imputacion-costes
description: >
  Skill FULL del módulo REFLEJO `imputacion-costes` de la vertical nichos (Radar
  de Nichos, proyecto 3D). Calcula LO QUE CUESTA cada proyecto sumando sus partidas:
  construccion (montaje de la solución) + operacion (mantenimiento) + fuentes
  (cuota de consulta/scraping/API, vía coste-fuente J4) en un CosteProyecto con
  coste_total. Stateless, cada op es una proyección pura determinista; cada
  proyecto absorbe su coste real. Úsala para operar, depurar o extender el reflejo,
  o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites imputar el coste de un proyecto (construccion + operacion +
    fuentes) para alimentar la salud financiera (RPC nichos.coste.agregar.request).
  - Cuando depures por qué unas partidas se rechazan (COSTE_INVALIDO si alguna es
    negativa o no numérica) o un payload sin costes falla.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio de la imputación de costes.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo imputacion-costes.
tags: [enki, modulo, reflejo, nichos, radar, costes, imputacion, proyecto-3d]
---

# imputacion-costes — REFLEJO JS PURO del coste por proyecto

## Qué hace el módulo

`imputacion-costes` es un **REFLEJO JS PURO** (F2, hoja del plan): cero pensar,
solo calcular. Sin red, sin store, sin custodio. Calcula **lo que cuesta cada
proyecto** — la suma de sus partidas de coste:

- **construcción**: montaje de la solución.
- **operación**: mantenimiento.
- **fuentes**: cuota de consulta/scraping/API (vía `coste-fuente` J4).

Stateless: cada op es una función pura determinista (entra objeto, sale objeto).

Sin store y sin custodio: **no persiste nada**. Solo registra en memoria el
`project_id` activo (contexto) al recibir `project.activated`. Con éxito emite
`nichos.coste_imputado`; con payload inválido o partidas negativas cierra el
círculo con `nichos.coste.agregar.failed`. Cada proyecto absorbe su coste real.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.coste.agregar.request` | `onAgregarRequest` | RPC reflejo: {project_id, costes:{construccion, operacion, fuentes}} → {project_id, coste_proyecto, coste_total}. Calcula el CosteProyecto determinista (construccion + operacion + fuentes) y publica `nichos.coste_imputado`, responde por `nichos.coste.agregar.response`. Si el payload es inválido → `nichos.coste.agregar.failed`. |

> **Nota: no está en module.json pero sí lo escucha index.js en `onProjectActivated`
> (líneas 30-35)**: el reflejo registra el `project_id` activo en contexto
> (respondiendo `200 {project_id}`). Es sub-declaración de module.json: el índice
> sí escucha `project.activated` pero el manifest no lo lista como subscribe.

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.coste_imputado` | Fire-and-forget (F2): el coste del proyecto quedó calculado/imputado → {project_id, coste_proyecto, coste_total}. Lo consume la salud financiera (F3) para declarar GENERA\|SANGRA\|NEUTRO con coste real. |
| `nichos.coste.agregar.failed` | Par de fallo determinista (F2): payload inválido o partidas negativas → {status, code, message, data}. Cierra el círculo de `nichos.coste.agregar.request`. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `nichos.coste.agregar.failed` cierra `nichos.coste.agregar.request` cuando
> `_agregar` devuelve status ≠ 200 (INVALID_INPUT o COSTE_INVALIDO).

## Reglas de negocio

1. **Costes obligatorios → `400 INVALID_INPUT`**: si `costes` falta o no es objeto →
   `{ status:400, code:'INVALID_INPUT', mensaje:'costes requerido', field:'costes' }`
   + `nichos.coste.agregar.failed`.
2. **Partidas válidas → `400 COSTE_INVALIDO`**: `_calcularCosteProyecto` devuelve
   `null` si alguna partida (`construccion`, `operacion`, `fuentes`) no es finita o
   es `< 0` → `{ status:400, code:'COSTE_INVALIDO', mensaje:'las partidas de coste deben ser numeros >= 0', project_id }`
   + failed. CERO costes negativos.
3. **`fuentes` como número o array**: si `costes.fuentes` es un array, se suma el
   `coste` de cada elemento (`Number(f.coste) || 0`) en lugar de usarlo como número.
   Así la partida de fuentes puede venir ya detallada (desde coste-fuente J4).
4. **Cálculo determinista**: `coste_total = round((construccion + operacion + fuentes) × 100)/100`
   (2 decimales); cada partida también se redondea. `project_id` del request tiene
   preferencia sobre el de contexto; sin él → `400 INVALID_INPUT project_id`.
5. **HTTP exacto**: éxito `200`; payload inválido → `400`; excepción en `_atender`
   → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.coste.agregar.response`:

### 1. `agregar` — imputar el coste de un proyecto

```json
{
  "project_id": "e57a318a-...",
  "costes": { "construccion": 120.5, "operacion": 30, "fuentes": 4.5 }
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "coste_proyecto": { "esquema": "nichos-coste-proyecto-v1", "construccion": 120.5, "operacion": 30, "fuentes": 4.5, "coste_total": 155 },
  "coste_total": 155,
  "imputado": true
}
```
Emite `nichos.coste_imputado` con el mismo `data`:
```json
{ "project_id": "e57a318a-...", "coste_proyecto": { "esquema": "nichos-coste-proyecto-v1", "construccion": 120.5, "operacion": 30, "fuentes": 4.5, "coste_total": 155 }, "coste_total": 155, "imputado": true }
```

### Variante — `fuentes` como array (detalle de coste-fuente)

```json
{ "project_id": "e57a318a-...", "costes": { "construccion": 100, "operacion": 20, "fuentes": [ { "fuente": "google-consulta", "coste": 1 }, { "fuente": "scraper-productos", "coste": 1 } ] } }
```
Respuesta `200`: `fuentes = 2`, total `122`.

### Fallo — partida negativa

```json
{ "project_id": "e57a318a-...", "costes": { "construccion": -5, "operacion": 10 } }
```
Respuesta `400` + `nichos.coste.agregar.failed`:
```json
{ "status": 400, "code": "COSTE_INVALIDO", "mensaje": "las partidas de coste deben ser numeros >= 0", "project_id": "e57a318a-..." }
```

## Tests

El test vive en `tests/unit/imputacion-costes.test.js`. Cubre:

- `agregar` con partidas válidas → `200`, desglose con `esquema nichos-coste-proyecto-v1`
  + `coste_total`, emite `nichos.coste_imputado`.
- `costes` ausente / no objeto → `400 INVALID_INPUT` + failed.
- Partida negativa o no numérica → `400 COSTE_INVALIDO` + failed.
- `fuentes` como array se suma (por `coste` de cada elemento).
- `project.activated` registra el `project_id` de contexto.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/imputacion-costes
node tests/unit/imputacion-costes.test.js
```

## Notas de implementación

- Clase `ImputacionCostes extends ModuloHibridoReflejo`; `name = 'imputacion-costes'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless);
  `this.project_id` (memoria) como único estado.
- `onAgregarRequest` delega en `_atender(e, 'agregar', 'nichos.coste.agregar.response', fn)`
  y hace el fire-and-forget de dominio (`nichos.coste_imputado` en 200 o
  `nichos.coste.agregar.failed` si no) dentro del handler.
- Proyecciones puras: `_agregar` (valida + imputa) y `_calcularCosteProyecto`
  (desglose + total). Esquema `nichos-coste-proyecto-v1`.
- DEP hacia delante: lo consume la salud financiera (F3) vía `nichos.coste_imputado`;
  depende de `coste-fuente` (J4) para la partida de fuentes.
