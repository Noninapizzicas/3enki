---
name: cuadro-mando-contable
description: >
  Skill FULL del módulo REFLEJO `cuadro-mando-contable` de la vertical contabilidad de Enki
  (J8, hoja del plan). EL CUADRO DEL JEFE: agregación de CONJUNTO (caja · resultado ·
  margen · desviación · ejercicio) bajo la lente del JEFE. INVARIANTE DURA: **NO baja al
  asiento** — no lee el diario, no compone apuntes, no recalcula el resultado ni la caja:
  AGREGA las proyecciones de conjunto que ya existen, cada una por EVENTO (caja →
  saldo-tesoreria E4/E5; resultado → estados-contables C2; margen → margen-analitico
  J2/J10; desviación → presupuesto J4; ejercicio → cierre-ejercicio C4). Cada sección trae
  su `disponible:true|false`; lo que no responde SE DECLARA en
  `dependencias_no_disponibles` y JAMÁS se rellena con un número inventado (contrato
  TOLERANTE). Determinist, stateless. Úsala para operar, depurar o extender el reflejo, o
  para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites el cuadro del jefe agregado (RPC contabilidad.cuadro_mando.agregar.request)
    con caja, resultado, margen, desviación y ejercicio.
  - Cuando depures por qué falta una sección (se declara `disponible:false` y aparece en
    `dependencias_no_disponibles`: 'saldo-tesoreria', 'estados-contables',
    'margen-analitico', 'presupuesto', 'cierre-ejercicio') o por qué falta project_id (400
    INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la invariante «el
    cuadro no baja al asiento» y la agregación tolerante sección a sección.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo cuadro-mando-contable.
tags: [enki, modulo, reflejo, contabilidad, cuadro-mando-contable, jefe, conjunto]
---

# cuadro-mando-contable — REFLEJO · el cuadro del JEFE (agrega sin bajar al asiento)

## Qué hace el módulo

`cuadro-mando-contable` es un **REFLEJO STATELESS** (J8, hoja del plan): **EL CUADRO DEL
JEFE**. Agregación de **CONJUNTO** (caja · resultado · margen · desviación · ejercicio) bajo
la lente del JEFE: **NO baja al asiento**. Todo lo que muestra lo **AGREGA** de lo que otros
ya derivan, **sin recalcularlo**:

| Sección | Fuente | EVENTO |
|---|---|---|
| caja | `saldo-tesoreria` (E4/E5) | `contabilidad.tesoreria.saldo.request` |
| resultado | `estados-contables` (C2) | `contabilidad.estado.resultado.request` |
| margen | `margen-analitico` (J2/J10) | `contabilidad.margen.calcular.request` / `contabilidad.tablero.cruzar.request` |
| desviación | `presupuesto` (J4) | `contabilidad.desviacion.calcular.request` |
| ejercicio | `cierre-ejercicio` (C4) | `contabilidad.cierre.estado.request` |

**INVARIANTE DURA**: el cuadro **NO baja al asiento**. No lee el diario, no compone apuntes,
no recalcula el resultado ni la caja: **agrega las proyecciones de conjunto que ya existen**.
Si una fuente no responde, **se DECLARA** su ausencia en el cuadro
(`dependencias_no_disponibles`) y **jamás se rellena con un número inventado** (contrato
**TOLERANTE**: cada sección trae su `disponible:true|false`).

Cada sección puede venir **ya resuelta en el payload** (`caja`/`resultado`/`margen`/
`desviacion`/`ejercicio`), en cuyo caso **no se toca la dependencia**.

Es **stateless**: sin PosPersistencia ni `project.activated` — cada op **entra objeto, sale
objeto**; el cuadro es una **agregación viva**, no una parcela. Dependencia entre módulos
**por EVENTO, nunca por `require` cruzado**. Es **DETERMINISTA**: `determinista:true`.

> **NO REUTILIZA**: no existe cuadro de mando contable; reutiliza J2/J3/J4/E4/E5/C1/C2 por
> RPC sin duplicarlos.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.cuadro_mando.agregar.request` | `onAgregarRequest` | RPC reflejo (J8): {project_id, periodo?, dimension?, caja?, resultado?, margen?, desviacion?, ejercicio?} → {project_id, periodo, lente:'CONJUNTO', cuadro:{caja:{caja,posicion_real,n_cuentas,disponible}, resultado:{resultado,ingreso,gasto,disponible}, margen:{margen,ingreso,coste_imputado,por_dimension,lente,disponible}, desviacion:{desviacion,desviacion_pct,signo,umbral_declarado,excede,senal,disponible}, ejercicio:{estado,n_cierres,ultimo_cierre,disponible}}, secciones, agregado:true, no_baja_al_asiento:true, dependencias_no_disponibles, n_secciones_disponibles}. AGREGA por EVENTO caja (E4/E5), resultado (C2), margen (J2/J10), desviacion (J4) y ejercicio (C4) SIN recalcularlos y SIN bajar al asiento; lo que venga ya resuelto en el payload no toca la dependencia. Fuente que no responde → se DECLARA su ausencia, jamas se rellena. Exito publica contabilidad.cuadro_mando_calculado y responde por contabilidad.cuadro_mando.agregar.response; error → contabilidad.cuadro_mando.agregar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.cuadro_mando_calculado` | Fire-and-forget (J8): el cuadro del jefe quedo agregado bajo lente de CONJUNTO → {project_id, periodo, lente:'CONJUNTO', cuadro:{caja, resultado, margen, desviacion, ejercicio}, secciones, agregado:true, no_baja_al_asiento:true, dependencias_no_disponibles}. Lo consumen el informe rico (K3, contexto del jefe) y la cara de consulta/entrega. Agregacion determinista; jamas una cifra inventada. |
| `contabilidad.cuadro_mando.agregar.failed` | Par de fallo determinista: agregar sin project_id (400). Cierra el circulo de contabilidad.cuadro_mando.agregar.request. (La ausencia de UNA fuente no es fallo del cuadro: se declara en la seccion y en dependencias_no_disponibles.) |
| `contabilidad.cuadro_mando_calculado.failed` | Par de fallo del evento de dominio contabilidad.cuadro_mando_calculado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.cuadro_mando.agregar.failed` cierra
> `contabilidad.cuadro_mando.agregar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.cuadro_mando.agregar.response` (el par response del RPC); **NO está
> declarada en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.cuadro_mando_calculado.failed` es el par
> de fallo del evento de DOMINIO; el reflejo solo publica el par `*.failed` de su RPC.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.tesoreria.saldo.request` (E4/E5), `contabilidad.estado.resultado.request`
> (C2), `contabilidad.margen.calcular.request` / `contabilidad.tablero.cruzar.request`
> (J2/J10), `contabilidad.desviacion.calcular.request` (J4) y
> `contabilidad.cierre.estado.request` (C4): cinco dependencias por EVENTO no declaradas
> como publishers.

## Reglas de negocio

1. **EL CUADRO NO BAJA AL ASIENTO (invariante dura)**: la respuesta declara `agregado:true` y
   `no_baja_al_asiento:true`; la `nota` lo dice: *«agregacion de CONJUNTO (caja · resultado ·
   margen · desviacion · ejercicio) SIN bajar al asiento»*. **No lee el diario ni compone
   apuntes.**
2. **Payload primero, dependencia después**: cada sección se toma del payload si viene
   (`input.caja`, `input.resultado`, `input.margen`, `input.desviacion`, `input.ejercicio`);
   **solo si no viene** se hace `_rpc` a la fuente (timeout 4000ms). **Lo declarado no toca
   la dependencia.**
3. **Las cinco dependencias (por EVENTO)**: caja → `contabilidad.tesoreria.saldo.request`;
   resultado → `contabilidad.estado.resultado.request` (se toma `data.resultado ||
   data`); margen → si hay `dimension` declarada, `contabilidad.margen.calcular.request`
   (una dimensión), si no `contabilidad.tablero.cruzar.request` (cruce); desviación →
   `contabilidad.desviacion.calcular.request`; ejercicio → `contabilidad.cierre.estado.request`.
4. **Contrato TOLERANTE sección a sección**: si una fuente no responde (null o `status !==
   200`), **su nombre se añade a `dependencias_no_disponibles`** (`'saldo-tesoreria'`,
   `'estados-contables'`, `'margen-analitico'`, `'presupuesto'`, `'cierre-ejercicio'`) y esa
   sección sale con `disponible:false` y cifras `null`. **La ausencia de UNA fuente NO es
   fallo del cuadro**: el cuadro se devuelve igualmente con `200`.
5. **Resúmenes deterministas** (`_resumen*`):
   - `_resumenCaja`: `caja` = `caja.total ?? caja.caja` (redondeado 2), más `posicion_real` y
     `n_cuentas`; si `null` → `{caja:null, disponible:false}`.
   - `_resumenResultado`: `resultado`, `ingreso` (`r.ingresos.total ?? r.ingresos ?? r.ingreso`)
     y `gasto` (`r.gastos.total ?? r.gastos ?? r.gasto`); **ingreso/gasto pueden ser `null`**
     si la fuente no los trae.
   - `_resumenMargen`: acepta el margen de **J2** (`margen.margen`) o el **tablero J10**
     (`totales`); devuelve `margen`, `ingreso`, `coste_imputado`, `por_dimension` y `lente`
     (`margen.lente || 'CONJUNTO'`).
   - `_resumenDesviacion`: `desviacion`, `desviacion_pct`, `signo`, `umbral_declarado`,
     `excede`, `senal`.
   - `_resumenEjercicio`: `estado` (de `ultimo_nivel2 || cierre_del_periodo || cierre`, o
     `'CON_CIERRES'`/`'ABIERTO'`), `n_cierres`, `ultimo_cierre`.
6. **`secciones` declara disponibilidad** (espejo de `cuadro`): `{ caja:{disponible,datos},
   resultado:{...}, margen:{...}, desviacion:{...}, ejercicio:{...} }` — `datos` es el objeto
   crudo de la fuente (o `null`).
7. **Métricas del cuadro**: `n_secciones_disponibles` = cuántas secciones tienen
   `disponible:true` (de 5). Es la medida honesta de cuánto del cuadro está vivo.
8. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id` (y el
   cuadro **no** se agrega). Shape: `{ status:400, error:{ code:'INVALID_INPUT',
   message:'project_id requerido', details:{ field:'project_id' } } }`.
9. **HTTP exacto**: éxito `200` (también con secciones ausentes declaradas); payload inválido
   → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC que responde en `contabilidad.cuadro_mando.agregar.response`.

### 1. `agregar` — el cuadro del jefe (todo por EVENTO)

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "dimension": "CENTRO-NORTE",
  "correlation_id": "abc-123"
}
```

Respuesta `200` (recortada; `detalle` de cada sección proviene de su fuente):

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "lente": "CONJUNTO",
  "cuadro": {
    "caja": { "caja": 12450.5, "posicion_real": "2026-09-30", "n_cuentas": 3, "disponible": true },
    "resultado": { "resultado": 8200, "ingreso": 45200, "gasto": 37000, "disponible": true },
    "margen": { "margen": 680, "ingreso": 2000, "coste_imputado": 1320, "por_dimension": null, "lente": "CONJUNTO", "disponible": true },
    "desviacion": { "desviacion": 1800, "desviacion_pct": 0.072, "signo": "POR_ENCIMA", "umbral_declarado": true, "excede": true, "senal": "EXCEDE_UMBRAL", "disponible": true },
    "ejercicio": { "estado": "ABIERTO", "n_cierres": 0, "ultimo_cierre": null, "disponible": true }
  },
  "secciones": { "caja": { "disponible": true, "datos": { "...": "..." } }, "resultado": { "disponible": true, "datos": { "...": "..." } }, "margen": { "disponible": true, "datos": { "...": "..." } }, "desviacion": { "disponible": true, "datos": { "...": "..." } }, "ejercicio": { "disponible": true, "datos": { "...": "..." } } },
  "agregado": true,
  "no_baja_al_asiento": true,
  "dependencias_no_disponibles": [],
  "n_secciones_disponibles": 5,
  "determinista": true,
  "nota": "agregacion de CONJUNTO (caja · resultado · margen · desviacion · ejercicio) SIN bajar al asiento"
}
```

Emite `contabilidad.cuadro_mando_calculado` (res.data + `correlation_id`).

### 2. `agregar` — con el payload ya resuelto (no toca las dependencias)

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "caja": { "total": 12450.5, "n_cuentas": 3 },
  "resultado": { "resultado": 8200, "ingresos": { "total": 45200 }, "gastos": { "total": 37000 } },
  "margen": { "margen": { "margen": 680, "ingreso": 2000, "coste_imputado": 1320 } },
  "desviacion": { "desviacion": 1800, "signo": "POR_ENCIMA", "excede": true, "senal": "EXCEDE_UMBRAL" },
  "ejercicio": { "n_cierres": 0 }
}
```

→ Respuesta `200` con las cinco secciones `disponible:true` y **cero** `_rpc`.

### 3. `agregar` — sin `dimension` (usa el tablero cruzado J10)

Sin `dimension` ni `margen` en el payload → el margen se pide a
`contabilidad.tablero.cruzar.request` (J10) y `_resumenMargen` toma sus `totales`.

### 4. Fallo — fuente ausente (NO es fallo del cuadro) → 200 con dependencia declarada

Con `saldo-tesoreria` (E4/E5) y `cierre-ejercicio` (C4) mudos:

```json
{
  "status": 200,
  "data": {
    "cuadro": { "caja": { "caja": null, "disponible": false }, "...": "...", "ejercicio": { "estado": null, "disponible": false } },
    "secciones": { "caja": { "disponible": false, "datos": null }, "ejercicio": { "disponible": false, "datos": null }, "...": "..." },
    "dependencias_no_disponibles": ["saldo-tesoreria", "cierre-ejercicio"],
    "n_secciones_disponibles": 3
  }
}
```

### 5. Fallo — payload inválido

```json
{ "periodo": "2026-09" }
```

→ Respuesta `400` + `contabilidad.cuadro_mando.agregar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

### 6. Tools (sin RPC en module.json)

`toolAgregar` → `_agregar`.

## Tests

El test vive en `tests/unit/cuadro-mando-contable.test.js`. Cubre:

- `agregar` con las cinco fuentes respondiendo → `200`, `lente:'CONJUNTO'`, `agregado:true`,
  `no_baja_al_asiento:true`, `n_secciones_disponibles:5`; emite
  `contabilidad.cuadro_mando_calculado`.
- **El payload manda**: con `caja`/`resultado`/`margen`/`desviacion`/`ejercicio` declarados
  → **cero** llamadas a las dependencias.
- **Tolerante sección a sección**: una fuente muda → su sección `disponible:false` y su
  nombre en `dependencias_no_disponibles`; el cuadro **sigue** siendo `200` (la ausencia de
  una fuente no es fallo del cuadro).
- Resúmenes: `_resumenResultado` con `ingresos`/`gastos` anidados; `_resumenMargen` tanto
  desde J2 (`margen.margen`) como desde J10 (`totales`).
- Sin `project_id` → `400 INVALID_INPUT` + `contabilidad.cuadro_mando.agregar.failed`.
- **Determinismo**: la MISMA entrada devuelve EXACTAMENTE el MISMO resultado.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/cuadro-mando-contable
node --test tests/unit/cuadro-mando-contable.test.js
```

## Notas de implementación

- Clase `CuadroMandoContable extends ModuloHibridoReflejo`; `name = 'cuadro-mando-contable'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: nada que persistir).
- Constante: `LENTE = 'CONJUNTO'`.
- El único handler `onAgregarRequest` delega en `_atender(e, 'agregar',
  'contabilidad.cuadro_mando.agregar.response', fn)`; publica el evento de dominio si
  `status === 200` y el par `*.failed` si no.
- Proyección pura: `_agregar` (async, cinco `_rpc` en serie) + resúmenes `_resumenCaja`,
  `_resumenResultado`, `_resumenMargen`, `_resumenDesviacion`, `_resumenEjercicio`.
  `_rpc`/`_invalid`/`_errorResponse`/`_round` vienen de la base.
- Tools: `toolAgregar`.
- DEP hacia delante: `contabilidad.cuadro_mando_calculado` lo consume `informe-rico` (K3) y
  la cara de consulta/entrega (`consulta-dueno`, Q1, que lo ofrece como operación `cuadro`).
  DEP hacia atrás por EVENTO: E4/E5 `saldo-tesoreria`, C2 `estados-contables`, J2/J10
  `margen-analitico`, J4 `presupuesto`, C4 `cierre-ejercicio`.
