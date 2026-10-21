---
name: eliminacion-intercompany
description: >-
  Skill FULL del módulo REFLEJO STATELESS `eliminacion-intercompany` de la vertical
  contabilidad (Enki). Detecta el CRUCE interno (intercompany) entre sociedades del grupo
  declarado y devuelve el conjunto de PARTIDAS A ELIMINAR en la consolidación, con su
  importe neto y su anulación. DETERMINISTA: emparejamiento por reglas declaradas
  (criterio.grupo, criterio.umbral, criterio.cuentas_internas), cero constantes cableadas.
  NO escribe, NO persiste. Su RPC `eliminar` es CLASE PREGUNTA (sin panel, su cara es el bus).
when-to-use: >-
  - Cuando necesites derivar las partidas del cruce interno a eliminar en la consolidación
    (RPC eliminacion-intercompany.eliminar.request).
  - Cuando depures por qué devuelve `eliminaciones` vacías con `abierto:true` y `faltan`
    (faltan partidas o falta `criterio.grupo`).
  - Cuando quieras entender su contrato de eventos (subscribes/publishes): es reflejo puro,
    no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, analitica, consolidacion, intercompany, grupo]
---

# eliminacion-intercompany — REFLEJO de eliminaciones intercompany

## Qué hace el módulo

`eliminacion-intercompany` es un **REFLEJO STATELESS** (I2, hoja del plan). Detecta el
**cruce interno** entre sociedades del MISMO grupo declarado (una partida de una sociedad
contra otra del grupo) y devuelve el conjunto de **PARTIDAS A ELIMINAR** en la
consolidación, cada una con su `importe` y su `anulacion` (signo opuesto), más el `neto`
total.

Es **determinista**: la detección es un emparejamiento por reglas declaradas
(`criterio.grupo`, `criterio.umbral`, `criterio.cuentas_internas`) — **cero constantes de
negocio cableadas** (LEY COMO DATO). **NO escribe, NO borra, NO persiste**: la eliminación
es una *propuesta* de partidas; las partidas son del diario.

**Dato ausente = desconocido**: sin partidas o sin grupo declarado → `eliminaciones: []`,
`abierto:true` y `faltan` con lo que falta. Nada se estima. La marca de sociedad (I1,
`marca-sociedad`) es lo que hace posible saber que dos partidas se cruzan.

Su RPC `eliminar` es **CLASE PREGUNTA** → no lleva `ui_handlers`, su cara es el bus.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `eliminacion-intercompany.eliminar.request` | `onEliminarRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id, asientos\|partidas?, criterio{grupo,umbral,cuentas_internas}}` → `{project_id, eliminaciones[], n_eliminaciones, neto, abierto, faltan}`. Empareja deterministamente el cruce interno del grupo declarado. Sin asientos/grupo → eliminaciones vacías con lo que falta. Responde por `.eliminar.response`; payload inválido → `.eliminar.failed`. |

> Nota de deriva (R3): el plan declara escucha de dominio de `contabilidad.asiento_asentado`
> y `contabilidad.ejercicio_cerrado`, pero el `module.json` real **solo** declara el
> `.eliminar.request`. Es un reflejo que recibe las partidas *en la petición*; no escucha
> el bus de hechos.

### Publishes

| Evento | Cuándo |
|---|---|
| `eliminacion-intercompany.eliminar.response` | Respuesta RPC correlada de la op `eliminar`. |
| `eliminacion-intercompany.eliminar.failed` | Fallo determinista: falta `project_id` o payload inválido → `{status, code, message}`. |

> **No publica hecho de dominio**: es un reflejo que calcula (no escribe) → no hay
> `contabilidad.*` que anunciar (R2). El `_eliminar` que devuelve status ≠ 200 dispara
> `.eliminar.failed` desde el handler.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `eliminar` | **PREGUNTA** (bus) | `{project_id, partidas\|asientos?, criterio{grupo,sociedades,umbral,cuentas_internas}}` | `{project_id, fuente_partidas, criterio, eliminaciones[], n_eliminaciones, neto, abierto, faltan, motivo}` | 400 `INVALID_INPUT` (`project_id`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')` (400). El pid puede caer a `this.project_id`.
2. **Partidas declaradas en la petición**: `_partidas` aplana `partidas` o `asientos` (los
   asientos pueden traer sus `partidas[]` dentro, se les inyecta `sociedad` del asiento).
   Si no hay array → devuelve `abierto:true, faltan:['partidas']` (no se derivan eliminaciones).
3. **Sin grupo declarado no hay perímetro**: si `criterio.sociedades` está vacío →
   `abierto:true, faltan:['criterio.grupo'], motivo:'no se adivina el perimetro...'`.
4. **Cruce existe si**: `sociedad` y `sociedad_contraparte` no son nulas, son **distintas**,
   **ambas** están en el conjunto del grupo y la partida tiene `importe` numérico finito.
   Si la sociedad == contraparte, o falta contraparte, o está fuera del grupo, se ignora.
5. **Anulación**: cada eliminación lleva `importe` y `anulacion = -importe` (redondeados a 2).
6. **`neto`** = suma de los importes de las eliminaciones (redondeado a 2). Si no hay
   partidas o grupo → `neto:null`.
7. **`cuenta_interna`**: `null` si no se declararon `cuentas_internas`; si se declararon,
   `true`/`false` según si la `cuenta` de la partida está en el set.
8. **Orden determinista**: `eliminaciones` se ordena por `id_partida` (`localeCompare`)
   para reproducibilidad. Mismos asientos + mismo criterio → mismas eliminaciones.
9. **Criterio flexible**: `grupo`/`sociedades` (en `criterio` o en la raíz), acepta strings
   u objetos (`id`/`nombre`/`sociedad`); `umbral` numérico; `cuentas_internas` array o valor.

## Cómo se usa (RPC)

### Petición con cruce interno

```json
{
  "project_id": "e57a318a-...",
  "partidas": [
    { "id_partida": "p2", "sociedad": "A", "sociedad_contraparte": "B", "cuenta": "4400", "importe": 1500.0 },
    { "id_partida": "p1", "sociedad": "B", "sociedad_contraparte": "A", "cuenta": "4400", "importe": -1500.0 }
  ],
  "criterio": { "grupo": ["A", "B"], "umbral": 0.01, "cuentas_internas": ["4400"] }
}
```

Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "fuente_partidas": "declarado",
  "criterio": { "sociedades": ["A","B"], "umbral": 0.01, "cuentas_internas": ["4400"] },
  "eliminaciones": [
    { "id_partida": "p1", "sociedad": "B", "sociedad_contraparte": "A", "cuenta": "4400", "cuenta_interna": true, "importe": -1500.0, "anulacion": 1500.0, "motivo": "cruce interno entre sociedades del grupo declarado" },
    { "id_partida": "p2", "sociedad": "A", "sociedad_contraparte": "B", "cuenta": "4400", "cuenta_interna": true, "importe": 1500.0, "anulacion": -1500.0, "motivo": "cruce interno entre sociedades del grupo declarado" }
  ],
  "n_eliminaciones": 2,
  "neto": 0,
  "abierto": false,
  "faltan": [],
  "motivo": null
}
```

### Sin grupo declarado → [ABIERTO]

```json
{ "project_id": "e57a318a-...", "partidas": [ { "sociedad": "A", "sociedad_contraparte": "B", "importe": 10 } ] }
```
Respuesta `200`: `eliminaciones: []`, `neto: null`, `abierto: true`, `faltan: ["criterio.grupo"]`.

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`) | falta `project_id` (y no hay `this.project_id`). |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` + `filesystem`
  + `project-manager`.
- **De quién depende por datos:** recibe las partidas ya marcadas por `marca-sociedad` (I1)
  en la petición. No escucha bus de hechos.
- **Quién la usa:** la consolidación (`consolidacion` I3) consume sus eliminaciones.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-analitica/eliminacion-intercompany/module.json` + `index.js`.
2. Smoke del RPC: dos partidas cruzadas del mismo grupo → `n_eliminaciones:2`, `neto` correcto.
3. Caso [ABIERTO]: sin `criterio.grupo` → `abierto:true`, `faltan:['criterio.grupo']`.
4. Par `*.failed` determinista: sin `project_id` → `.eliminar.failed`.
5. Comprobar eventos reales: `grep -E '"event"' module.json` (solo `.eliminar.request`).

## Notas de implementación

- Clase `EliminacionIntercompany extends ModuloHibridoReflejo`; `name =
  'eliminacion-intercompany'`, `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- `onEliminarRequest` delega en `_atender(e, 'eliminar',
  'eliminacion-intercompany.eliminar.response', async d => this._eliminar(d))` y publica
  `.eliminar.failed` solo si `status !== 200`.
- Proyección `async _eliminar(input)`; tool `toolEliminar`.
- Helpers privados: `_partidas`, `_criterio`, `_clave`, `_num`. `_round` y
  `_invalid`/`_errorResponse` vienen de `modulo-hibrido-reflejo`.
