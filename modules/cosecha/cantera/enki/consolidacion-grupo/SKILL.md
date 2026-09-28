---
name: consolidacion-grupo
description: >
  Skill FULL del módulo REFLEJO `consolidacion-grupo` de la vertical contabilidad de
  Enki (I1+I2+I3, hoja del plan). ESTADOS DEL CONJUNTO con CRITERIO DECLARADO: marca de
  sociedad (I1, mecánico), detección y eliminación del cruce intercompany (I2) y
  agregación (I3). Dos niveles: por negocio (AISLADO) y del grupo (CONSOLIDADO). LOS
  NEGOCIOS NO SE FUGAN: SOLO se consolida lo DECLARADO — la lista de sociedades y el
  criterio (INTEGRACION_GLOBAL / INTEGRACION_PROPORCIONAL / PUESTA_EN_EQUIVALENCIA) son
  PARÁMETROS; sin lista declarada → NO_DECLARADO y no se consolida; sin criterio → 422
  PRECONDITION_FAILED. El aislamiento por negocio lo gobierna `aislamiento-negocio`
  (I4). Stateless: sin PosPersistencia ni project.activated. Los estados por sociedad se
  derivan de `estados-contables` (C1/C2) por EVENTO/payload (contrato TOLERANTE: si no
  responden → 503 DEPENDENCIA_NO_DISPONIBLE y NUNCA cifras inventadas). Úsala para
  operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites consolidar los estados de varias sociedades con criterio declarado
    (RPC contabilidad.consolidacion.agregar.request).
  - Cuando depures por qué no se consolida (NO_DECLARADO si falta la lista de sociedades,
    422 PRECONDITION_FAILED si falta el criterio, 503 DEPENDENCIA_NO_DISPONIBLE si
    estados-contables C1/C2 no responde, 400 INVALID_INPUT si falta project_id).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la eliminación
    intercompany y por qué el aislamiento por negocio sigue en pie.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo consolidacion-grupo.
tags: [enki, modulo, reflejo, contabilidad, consolidacion-grupo, grupo, consolidacion]
---

# consolidacion-grupo — REFLEJO · estados del grupo con criterio declarado

## Qué hace el módulo

`consolidacion-grupo` es un **REFLEJO STATELESS** (I1+I2+I3, hoja del plan): **ESTADOS
DEL CONJUNTO con CRITERIO DECLARADO**:

- **marca de sociedad** (`_etiquetar`, I1, mecánico, cero juicio);
- **detección y eliminación del cruce intercompany** (`_detectarCruceInterno` +
  `_eliminar`, I2);
- **agregación** (`_agregar` → `_sumarEstados`, I3).

Dos niveles: **por negocio (AISLADO)** y **del grupo (CONSOLIDADO)**.

**LOS NEGOCIOS NO SE FUGAN** (invariante del dominio): este módulo **SOLO consolida lo
DECLARADO**. El **aislamiento por negocio** lo gobierna `aislamiento-negocio` (I4) —
aquí **NO se lee ni se escribe la parcela de otro negocio salvo por consolidación
DECLARADA** (la lista de sociedades a consolidar y el criterio son **PARÁMETROS**). Si
**no hay declaración**, **NO se consolida**: se responde **`NO_DECLARADO`**, **jamás se
mezclan parcelas por iniciativa propia**.

Es **stateless**: **sin PosPersistencia ni `project.activated`** — cada op **entra
objeto, sale objeto**. Los estados por sociedad se **DERIVAN** de `estados-contables`
(C1/C2) por **EVENTO/payload**; contrato **TOLERANTE**: si **no responden**, se
**declara** la dependencia y **NUNCA se consolidan cifras inventadas**. La dependencia es
**por EVENTO, NUNCA por `require` cruzado**.

> **NO REUTILIZA**: la consolidación multi-sociedad **no existe en el inventario**
> (grupo = 0 módulos).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.consolidacion.agregar.request` | `onAgregarRequest` | RPC reflejo (I1+I2+I3): {project_id, periodo?, sociedades:[IdSociedad], criterio:'INTEGRACION_GLOBAL'\|'INTEGRACION_PROPORCIONAL'\|'PUESTA_EN_EQUIVALENCIA', estados?\|asientos?} → {project_id, criterio, sociedades, estados_por_sociedad, eliminaciones, consolidado:{activo, pasivo, patrimonio, resultado, activo_bruto, eliminado_intercompany}, aislamiento_intacto:true}. SOLO consolida lo DECLARADO: sin lista de sociedades → NO_DECLARADO (no se mezclan parcelas); sin criterio → 422 PRECONDITION_FAILED. Los estados se derivan de estados-contables (C1/C2) por EVENTO; si no responde → 503 DEPENDENCIA_NO_DISPONIBLE. Exito publica contabilidad.grupo_consolidado y responde por contabilidad.consolidacion.agregar.response; error → contabilidad.consolidacion.agregar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.grupo_consolidado` | Fire-and-forget (I3): los estados del CONJUNTO quedaron consolidados con criterio declarado y eliminacion intercompany → {project_id, periodo, criterio, sociedades, n_sociedades, eliminaciones, consolidado:{activo, pasivo, patrimonio, resultado, eliminado_intercompany}, aislamiento_intacto:true}. Lo consumen la vista agregada del grupo, el cuadro de mando y los informes. Solo lo declarado; jamas una fuga entre negocios. |
| `contabilidad.consolidacion.agregar.failed` | Par de fallo determinista: sin project_id (400), criterio de consolidacion no declarado o no valido (422 PRECONDITION_FAILED), o estados-contables (C1/C2) no disponible (503 DEPENDENCIA_NO_DISPONIBLE). Cierra el circulo de contabilidad.consolidacion.agregar.request. |
| `contabilidad.grupo_consolidado.failed` | Par de fallo del evento de dominio contabilidad.grupo_consolidado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.consolidacion.agregar.failed` cierra
> `contabilidad.consolidacion.agregar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.consolidacion.agregar.response` (el par response del RPC); **NO está
> declarada en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical:
> el par de fallo real es `<op>.failed`) — `contabilidad.grupo_consolidado.failed` es el
> par del evento de **DOMINIO**; el reflejo solo publica el par `*.failed` de su RPC.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.estado.balance.request` (dependencia por EVENTO hacia `estados-contables`
> C1/C2, no declarada como publisher).

## Reglas de negocio

1. **SOLO se consolida lo DECLARADO**: `_listaDeclarada` exige `sociedades`/
   `lista_sociedades` (array, normalizando a ids). Si **no hay lista** (o está vacía) →
   respuesta `200` con `consolidado:false`, `no_declarado:true`, `simbolico:'NO_DECLARADO'`,
   `motivo` y `aislamiento_intacto:true` — **no se consolidan parcelas por iniciativa
   propia**.
2. **Criterio DECLARABLE (entra como DATO)**: `_criterioDe` exige `criterio`/
   `criterio_consolidacion`. Sin declarar → **`422 PRECONDITION_FAILED`** (`criterios`,
   `no_declarado:true`). Criterio fuera del catálogo → `422`. `CRITERIOS =
   ['INTEGRACION_GLOBAL','INTEGRACION_PROPORCIONAL','PUESTA_EN_EQUIVALENCIA']`.
3. **Etiquetado de sociedad (I1, mecánico)**: `_etiquetar` copia el asiento y le fija
   `sociedad` (de `sociedad`/`id_sociedad`/`asiento.sociedad`). Sin sociedad → `400
   INVALID_INPUT sociedad`. Cero juicio.
4. **Detección del cruce intercompany (I2)**: `_detectarCruceInterno` recorre apuntes y
   marca un cruce cuando `origen` (sociedad del apunte/asiento) y `destino`
   (`contraparte_sociedad`/`sociedad_contraparte`) son **distintas** y **ambas pertenecen
   al grupo declarado**. Devuelve `sociedad_origen`, `sociedad_destino`, `cuenta`,
   `importe` (debe o haber) y `lado`.
5. **Eliminación intercompany (I2)**: `_eliminar` produce `ELIMINACION_INTERCOMPANY` con
   **`neutraliza_solo_en_consolidado:true`** — **NO toca el libro de cada sociedad**
   (`no_toca_el_libro:true`). Sin cruces (no array) → `400 INVALID_INPUT cruces`.
6. **Agregación determinista (I3)**: `_sumarEstados` suma por sociedad
   `activo/pasivo/patrimonio/resultado` y aplica la eliminación
   (`activo`/`pasivo` = bruto − `totalEliminado`); conserva `activo_bruto`,
   `pasivo_bruto` y `eliminado_intercompany`.
7. **Estados por sociedad DECLARADOS o derivados (contrato TOLERANTE)**: `_estadosDe`
   usa `estados`/`estados_por_sociedad` del payload; si no, por cada sociedad pide
   `contabilidad.estado.balance.request` a `estados-contables` (C1/C2) (timeout 4000ms)
   con `proyecto_sociedad`. Si **alguna no responde** → `null` → **`503
   DEPENDENCIA_NO_DISPONIBLE`** (`{dependencia:'estados-contables',
   accion:'NO_CONSOLIDAR_PUBLICAR_FALLO'}`) — **nunca cifras inventadas**.
8. **Aislamiento intacto**: la respuesta marca `consolidado_con_criterio_declarado:true`,
   `aislamiento_intacto:true` y `dos_niveles:{por_negocio:'aislado', del_grupo:'consolidado'}`.
   La consolidación es una **VISTA del conjunto**; cada negocio conserva su parcela.
9. **Validaciones deterministas de entrada**: falta `project_id` → `400 INVALID_INPUT
   project_id`; en `_etiquetar` sin asiento → `400 INVALID_INPUT asiento`; en `_detectarCruceInterno`
   sin asientos → `400 INVALID_INPUT asientos`. Shape: `{status:400,
   error:{code:'INVALID_INPUT', message:'<campo> requerido', details:{field:<campo>}}}`.
10. **HTTP exacto**: éxito `200`; payload inválido → `400`; criterio no declarado → `422`;
    estados no disponibles → `503`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

El único RPC responde en `contabilidad.consolidacion.agregar.response`.

### 1. `agregar` — consolidación con criterio declarado

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "sociedades": ["S-1", "S-2"],
  "criterio": "INTEGRACION_GLOBAL",
  "estados": [
    { "sociedad": "S-1", "activo": 1000, "pasivo": 400, "patrimonio": 600, "resultado": 100 },
    { "sociedad": "S-2", "activo": 800, "pasivo": 300, "patrimonio": 500, "resultado": 50 }
  ],
  "asientos": [ { "id": "A1", "sociedad": "S-1", "apuntes": [ { "cuenta": "430", "debe": 100, "contraparte_sociedad": "S-2" } ] } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200` (bruto activo 1800, eliminado intercompany 100):

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "criterio": "INTEGRACION_GLOBAL",
  "sociedades": ["S-1", "S-2"],
  "n_sociedades": 2,
  "estados_por_sociedad": [ { "sociedad": "S-1", "activo": 1000, "pasivo": 400, "patrimonio": 600, "resultado": 100 }, { "sociedad": "S-2", "activo": 800, "pasivo": 300, "patrimonio": 500, "resultado": 50 } ],
  "eliminaciones": { "n": 1, "total": 100, "detalle": [ { "sociedad_origen": "S-1", "sociedad_destino": "S-2", "tipo": "ELIMINACION_INTERCOMPANY", "importe": 100, "neutraliza_solo_en_consolidado": true } ] },
  "consolidado": { "activo": 1700, "pasivo": 600, "patrimonio": 1100, "resultado": 150, "activo_bruto": 1800, "pasivo_bruto": 700, "eliminado_intercompany": 100 },
  "consolidado_con_criterio_declarado": true,
  "aislamiento_intacto": true,
  "dos_niveles": { "por_negocio": "aislado", "del_grupo": "consolidado" },
  "determinista": true
}
```

Emite `contabilidad.grupo_consolidado` (res.data + `correlation_id`).

### 2. `agregar` — sin lista de sociedades → NO_DECLARADO

Sin `sociedades` → `200` con `consolidado:false`, `no_declarado:true`,
`simbolico:'NO_DECLARADO'`, `motivo` y `aislamiento_intacto:true`. **No se mezclan
parcelas.**

### 3. Fallo — criterio no declarado → 422

```json
{ "project_id": "e57a318a-...", "sociedades": ["S-1"] }
```

→ `422 PRECONDITION_FAILED` (`criterios`, `no_declarado:true`) +
`contabilidad.consolidacion.agregar.failed`.

### 4. Fallo — estados no disponibles → 503

Sin estados en payload y con `estados-contables` (C1/C2) sin responder → `503
DEPENDENCIA_NO_DISPONIBLE` (`{dependencia:'estados-contables',
accion:'NO_CONSOLIDAR_PUBLICAR_FALLO'}`).

### 5. Tools (sin RPC en module.json)

`toolEtiquetar` → `_etiquetar`; `toolDetectarCruceInterno` → `_detectarCruceInterno`;
`toolEliminar` → `_eliminar`; `toolAgregar` → `_agregar`.

## Tests

El test viviría en `tests/unit/consolidacion-grupo.test.js`. Cubre:

- `agregar` con estados declarados y criterio → `200`, `consolidado` con eliminación
  intercompany aplicada (`activo` = bruto − eliminado); emite
  `contabilidad.grupo_consolidado`.
- **SOLO lo declarado**: sin `sociedades` → `NO_DECLARADO` (`consolidado:false`,
  `aislamiento_intacto:true`).
- **Criterio declarable**: sin `criterio` → `422 PRECONDITION_FAILED`.
- **Eliminación intercompany**: `_detectarCruceInterno` detecta el par entre dos
  sociedades del grupo; `_eliminar` marca `neutraliza_solo_en_consolidado:true` y
  **no toca el libro**.
- **Determinismo**: la MISMA entrada devuelve EXACTAMENTE el MISMO consolidado.
- **Estados derivados**: sin `estados` en payload se derivan de `estados-contables`
  (C1/C2); si no responde → `503 DEPENDENCIA_NO_DISPONIBLE` (**nunca cifras inventadas**).
- Payload sin `project_id` → `400 INVALID_INPUT`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/consolidacion-grupo
node --test tests/unit/consolidacion-grupo.test.js
```

## Notas de implementación

- Clase `ConsolidacionGrupo extends ModuloHibridoReflejo`; `name =
  'consolidacion-grupo'`, `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless:
  nada que persistir).
- Constante `CRITERIOS = ['INTEGRACION_GLOBAL','INTEGRACION_PROPORCIONAL',
  'PUESTA_EN_EQUIVALENCIA']` (el criterio del conjunto entra como **DATO**).
- `onAgregarRequest` delega en `_atender(e, 'agregar', 'contabilidad.consolidacion.agregar.response',
  fn)`: en fallo publica `contabilidad.consolidacion.agregar.failed`; en éxito, si hay
  `consolidado`, publica `contabilidad.grupo_consolidado`.
- Proyecciones puras: `_etiquetar`, `_detectarCruceInterno`, `_eliminar`, `_agregar`
  (async) + helpers `_listaDeclarada`, `_sociedadesDe`, `_criterioDe`, `_asientosDe`,
  `_estadosDe` (async, EVENTO C1/C2), `_sumarEstados`. `_rpc`/`_invalid`/`_errorResponse`
  vienen de la base; `_round` de la base.
- Tools: `toolEtiquetar`, `toolDetectarCruceInterno`, `toolEliminar`, `toolAgregar`.
- DEP hacia delante: `contabilidad.grupo_consolidado` → vista agregada del grupo, cuadro
  de mando e informes. DEP hacia atrás por EVENTO: `estados-contables` (C1/C2) provee los
  estados por sociedad; `aislamiento-negocio` (I4) gobierna el aislamiento por negocio.
