---
name: coste-fuente
description: >
  Skill FULL del módulo REFLEJO `coste-fuente` de la vertical nichos (Radar de
  Nichos, proyecto 3D). Calcula el COSTE por fuente (consulta/scraping/API) para
  imputar a proyecto: stateless, cada op es una proyección pura determinista.
  Calcula el coste de cada fuente (tipo × cuota de consultas, con coste unitario
  por defecto) y agrega el coste total imporrable para alimentar la imputación de
  costes (F2). Úsala para operar, depurar o extender el reflejo, o para entender
  su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites calcular el coste de una o varias fuentes para imputar a un
    proyecto (RPC nichos.fuente.costear.request).
  - Cuando depures por qué una fuente no se costea (FUENTE_NO_COSTABLE por tipo
    inválido o consultas <= 0) o un payload vacío se rechaza (SIN_FUENTES).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio del coste de fuentes para la imputación de costes.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo coste-fuente.
tags: [enki, modulo, reflejo, nichos, radar, coste, fuente, proyecto-3d]
---

# coste-fuente — REFLEJO JS PURO del coste por fuente

## Qué hace el módulo

`coste-fuente` es un **REFLEJO JS PURO** (J4, hoja del plan): cero pensar, solo
calcular. Sin red, sin store, sin custodio. Cada op es una función pura
determinista (entra objeto, sale objeto).

- **`costear`** → calcula el coste de cada fuente (a partir de su `tipo` y su cuota
  de `consultas`) y el `coste_total` imputable → publica
  `nichos.fuente_costea_imputado`.
- **`calcularCoste`** → proyección pura: `coste_fuente = consultas × coste_unitario`,
  con `coste_unitario` por defecto según tipo (`consulta`/`scraping`/`api`).
- **`agregarAProyecto`** → sumatoria del coste de un set de fuentes → alimenta la
  imputación de costes (F2).

Sin store y sin custodio: **no persiste nada**. Solo registra en memoria el
`project_id` activo (contexto) al recibir `project.activated`. Con éxito emite
`nichos.fuente_costea_imputado`; con payload inválido o fuente no costable
cierra el círculo con `nichos.fuente.costear.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.fuente.costear.request` | `onCostearRequest` | RPC reflejo: {project_id, fuentes:[{fuente, tipo:'consulta'\|'scraping'\|'api', consultas, coste_unitario?}]} → {project_id, fuentes_costeadas, coste_total}. Calcula el coste por fuente (determinista) y el coste total imputable. Publica `nichos.fuente_costea_imputado` y responde por `nichos.fuente.costear.response`. Si el payload es inválido → `nichos.fuente.costear.failed`. |

> **Nota: no está en module.json pero sí lo escucha index.js en `onProjectActivated`
> (líneas 42-47)**: el reflejo registra el `project_id` activo en contexto
> (respondiendo `200 {project_id}`). Es sub-declaración de module.json: el índice
> sí escucha `project.activated` pero el manifest no lo lista como subscribe.

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.fuente_costea_imputado` | Fire-and-forget (J4): el coste de las fuentes quedó calculado e imputable → {project_id, fuentes_costeadas, coste_total}. Lo consume la imputación de costes (F2) para sumar la partida de fuentes al CosteProyecto. |
| `nichos.fuente.costear.failed` | Par de fallo determinista (J4): payload inválido o fuente no costable → {status, code, message, data}. Cierra el círculo de `nichos.fuente.costear.request`. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `nichos.fuente.costear.failed` cierra `nichos.fuente.costear.request` cuando
> `_costear` devuelve status ≠ 200 (SIN_FUENTES o FUENTE_NO_COSTABLE).

## Reglas de negocio

1. **Sin fuentes → `400 SIN_FUENTES`**: si `fuentes` no es array o está vacío →
   `{ status:400, code:'SIN_FUENTES', mensaje:'no hay fuentes que costear', project_id }`
   + `nichos.fuente.costear.failed`.
2. **Fuente no costable → `400 FUENTE_NO_COSTABLE`**: si `_calcularCoste` devuelve
   `null` (tipo inválido, consultas `<= 0` o no-entero) →
   `{ status:400, code:'FUENTE_NO_COSTABLE', mensaje:'la fuente no es costable (tipo inválido o consultas <=0)', project_id, fuente }`
   + failed.
3. **Coste unitario por defecto por tipo** (EUR por consulta):
   `consulta: 0.01`, `scraping: 0.05`, `api: 0.03`. Solo aplica si `coste_unitario`
   no se pasa o no es finito; si se pasa y es `< 0` → fuente no costable (`null`).
4. **Tipos de fuente cerrados**: `tipo` debe ser `consulta` | `scraping` | `api`
   (Set `TIPOS_FUENTE`); por defecto `consulta`. Cualquier otro → no costable.
5. **Cálculo determinista**: `coste = round(consultas × coste_unitario × 100) / 100`
   (2 decimales). El `project_id` del request tiene preferencia sobre el de
   contexto (`project_id || this.project_id`); sin él → `400 INVALID_INPUT project_id`.
6. **HTTP exacto**: éxito `200`; payload inválido → `400`; excepción en
   `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.fuente.costear.response`:

### 1. `costear` — costear un set de fuentes

```json
{
  "project_id": "e57a318a-...",
  "fuentes": [
    { "fuente": "google-consulta", "tipo": "consulta", "consultas": 100 },
    { "fuente": "scraper-productos", "tipo": "scraping", "consultas": 20 },
    { "fuente": "api-proveedor", "tipo": "api", "consultas": 50, "coste_unitario": 0.05 }
  ]
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "fuentes_costeadas": [
    { "project_id": "e57a318a-...", "fuente": "google-consulta", "tipo": "consulta", "consultas": 100, "coste_unitario": 0.01, "coste": 1 },
    { "project_id": "e57a318a-...", "fuente": "scraper-productos", "tipo": "scraping", "consultas": 20, "coste_unitario": 0.05, "coste": 1 },
    { "project_id": "e57a318a-...", "fuente": "api-proveedor", "tipo": "api", "consultas": 50, "coste_unitario": 0.05, "coste": 2.5 }
  ],
  "coste_total": 4.5,
  "costeado": true
}
```
Emite `nichos.fuente_costea_imputado` con ese mismo `data`:
```json
{ "project_id": "e57a318a-...", "fuentes_costeadas": [ ... ], "coste_total": 4.5, "costeado": true }
```

### Fallo — fuente no costable

```json
{ "project_id": "e57a318a-...", "fuentes": [ { "fuente": "x", "tipo": "telegram", "consultas": 5 } ] }
```
Respuesta `400` + `nichos.fuente.costear.failed`:
```json
{ "status": 400, "code": "FUENTE_NO_COSTABLE", "mensaje": "la fuente no es costable (tipo inválido o consultas <=0)", "project_id": "e57a318a-...", "fuente": { "fuente": "x", "tipo": "telegram", "consultas": 5 } }
```

## Tests

El test vive en `tests/unit/coste-fuente.test.js`. Cubre:

- `costear` con fuentes válidas → `200`, costea por tipo (coste unitario por defecto)
  y agrega `coste_total`; emite `nichos.fuente_costea_imputado`.
- Fuentes vacías / no array → `400 SIN_FUENTES` + failed.
- Fuente con tipo inválido o consultas `<= 0` → `400 FUENTE_NO_COSTABLE` + failed.
- `calcularCoste` con `coste_unitario` explícito lo usa; con `< 0` → retorna `null`.
- `agregarAProyecto` suma el coste de un set → `200 {project_id, coste_fuentes}`.
- `project.activated` registra el `project_id` de contexto.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/coste-fuente
node tests/unit/coste-fuente.test.js
```

## Notas de implementación

- Clase `CosteFuente extends ModuloHibridoReflejo`; `name = 'coste-fuente'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless);
  `this.project_id` (memoria) como único estado.
- `onCostearRequest` delega en `_atender(e, 'costear', 'nichos.fuente.costear.response', fn)`
  y hace el fire-and-forget de dominio (`nicheos.fuente_costea_imputado` en 200 o
  `nichos.fuente.costear.failed` si no) dentro del handler.
- Constantes: `COSTE_UNITARIO_POR_TIPO = { consulta: 0.01, scraping: 0.05, api: 0.03 }`,
  `TIPOS_FUENTE = new Set(['consulta', 'scraping', 'api'])`.
- Proyecciones puras: `_costear` (loop + total), `_calcularCoste` (coste de una
  fuente), `_agregarAProyecto` (sumatoria para F2).
- Tools: `toolCostear` → `_costear`, `toolCalcularCoste` → `_calcularCoste`,
  `toolAgregarAProyecto` → `_agregarAProyecto`.
- DEP hacia delante: lo consume la imputación de costes (F2) vía
  `nichos.fuente_costea_imputado`.
