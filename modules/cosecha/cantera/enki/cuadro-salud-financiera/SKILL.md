---
name: cuadro-salud-financiera
description: >
  Skill FULL del módulo CUSTODIO `cuadro-salud-financiera` de la vertical nichos
  (Radar de Nichos, proyecto 3D). Declara la SALUD FINANCIERA de cada proyecto:
  GENERA | SANGRA | NEUTRO + flujo a caja, calculada de HECHOS (cobros F1 +
  costes F2), nunca de promesas. Medida maestra inalterable. Persiste por proyecto
  vía PosPersistencia con un solo escritor (guard rol SISTEMA_SALUD) y alimenta
  reglas-aprendidas (C7), alerta-sangria (F4) y el portafolio (K1). Úsala para
  operar, depurar o extender el custodio, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites actualizar o leer el cuadro de salud financiera de un
    proyecto (RPC nichos.salud.actualizar.request / nichos.cuadro.leer.request).
  - Cuando depures por qué un cuadro se rechaza (PERMISSION_DENIED si el rol no es
    SISTEMA_SALUD, COSTE_INVALIDO con coste negativo) o no se emite
    nichos.salud.actualizada / nichos.cuadro.flujo_a_caja.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio (GENERA/SANGRA/NEUTRO por hechos, techo de sangría).
  - Cuando vayas a escribir/ampliar el test unitario del custodio cuadro-salud-financiera.
tags: [enki, modulo, custodio, persistencia, nichos, radar, salud, financiera, proyecto-3d]
---

# cuadro-salud-financiera — CUSTODIO CON PERSISTENCIA de la salud financiera

## Qué hace el módulo

`cuadro-salud-financiera` es un **CUSTODIO CON PERSISTENCIA** (F3, hoja del plan):
el dueño del **cuadro de salud financiera** por proyecto. Declara la salud de cada
proyecto como **GENERA | SANGRA | NEUTRO** + su **flujo a caja**, calculada de
**HECHOS** (F1 cobros efectivo/comprometido + F2 costes construccion/operacion/
fuentes), **nunca de promesas**. Es la **medida maestra inalterable**:

- **GENERA** → ingresos > coste total (el proyecto cierra en positivo).
- **SANGRA** → coste total ≥ techo declarado y supera ingresos (alimenta F4/reglas).
- **NEUTRO** → ninguno (no genera, no sangra: en equilibrio/coste igual a caja).

Un **solo escritor**: el flujo de salud (F1/F2) consume y este cuadro agrega por
proyecto (guard rol **SISTEMA_SALUD**). La lectura (`_leer`) no muta; la escritura
(`_agregarPorProyecto` / `_registrarFlujoACaja`) valida y persiste. Persiste por
proyecto con **PosPersistencia** (storage `/prisma/nichos/cuadro-salud-financiera.json`),
restaura en `project.activated` y vuelca en `onUnload`. Emisor/par de fallo:
`nichos.salud.actualizada`, `nichos.cuadro.flujo_a_caja` y `nichos.salud.actualizar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.salud.actualizar.request` | `onActualizarRequest` | RPC custodio: {project_id, rol:'SISTEMA_SALUD', cobros, costes} → {project_id, saludo, estado, flujo_a_caja}. Calcula el estado GENERA\|SANGRA\|NEUTRO con coste+cobro real y persiste el cuadro. Publica `nichos.salud.actualizada` y responde por `nichos.salud.actualizar.response`. Si rol inválido o datos inválidos → `nichos.salud.actualizar.failed`. |
| `nichos.cuadro.leer.request` | `onLeerRequest` | RPC custodio: {project_id} → {project_id, cuadro}. Lee el CuadroGlobal del proyecto (estado, coste_total, ingresos, flujo_a_caja). La lectura no muta. Lo consume reglas-aprendidas (C7), alerta-sangria (F4) y vista-portafolio (K1). |
| `nichos.cobro_registrado` | `onCobroRegistrado` | Fire-and-forget (F3): registro-cobros (F1) asentó un cobro → {project_id, cobro}. Acumula el ingreso real del proyecto (caja) sin recalcular el estado completo. Publica `nichos.salud.actualizada` si el proyecto está activo. |
| `nichos.coste_imputado` | `onCosteImputado` | Fire-and-forget (F3): imputacion-costes (F2) imputó el coste → {project_id, coste_proyecto}. Acumula el coste real del proyecto y recalcula el estado GENERA\|SANGRA\|NEUTRO. Publica `nichos.salud.actualizada`. |
| `project.activated` | `onProjectActivated` | Restaura el cuadro de salud del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.salud.actualizada` | Fire-and-forget (F3): estado de salud financiera del proyecto declarado → {project_id, estado:'GENERA'\|'SANGRA'\|'NEUTRO', coste_total, ingresos, flujo_a_caja}. Lo consumen reglas-aprendidas (C7), alerta-sangria (F4), vista-portafolio (K1) y pulso-avance. |
| `nichos.cuadro.flujo_a_caja` | Fire-and-forget (F3): el flujo a caja del proyecto quedó registrado → {project_id, flujo_a_caja, periodo}. Complementa la medida maestra de salud financiera por proyecto. |
| `nichos.salud.actualizar.failed` | Par de fallo determinista (F3): escritura rechazada (rol != SISTEMA_SALUD) o payload inválido → {status, code, message, data}. Cierra el círculo de `nichos.salud.actualizar.request`. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `nichos.salud.actualizar.failed` cierra `nichos.salud.actualizar.request`
> cuando `_agregarPorProyecto` devuelve status ≠ 200. En éxito emite
> `nichos.salud.actualizada` **y** `nichos.cuadro.flujo_a_caja`.

> **Nota: sub-declaración de module.json respecto a index.js en `_registrarFlujoACaja`
> (líneas 235-246)**: existe la proyección/tool `toolRegistrarFlujoACaja` para
> registrar el flujo a caja de un periodo, pero NO hay un handler ni subscribe
> `nicheos.cuadro.registrar_flujo.request` en module.json — `_registrarFlujoACaja`
> solo está disponible como tool interna, sin RPC del bus declarada.

## Reglas de negocio

1. **Medida maestra de hechos, no de promesas**: el estado se calcula SOLO de
   `cobros` (ingresos) y `coste_total`/`costes` reales. `_calcularEstado`:
   `ingresos > coste_total` → `GENERA`; `coste_total >= TECHO_SANGRIA && coste_total >
   ingresos` → `SANGRA`; si no → `NEUTRO`. CERO estados inventados/promesas.
2. **Un solo escritor (guard de rol)**: `_agregarPorProyecto` exige
   `rol === 'SISTEMA_SALUD'` (constante `ROL_SISTEMA_SALUD`). Si el rol es otro →
   `403 PERMISSION_DENIED` con
   `{ status:403, code:'PERMISSION_DENIED', mensaje:'solo el SISTEMA_SALUD puede actualizar el cuadro de salud', rol_esperado:'SISTEMA_SALUD', rol_recibido:<rol> }`
   + `nichos.salud.actualizar.failed`. Second-writer rechazado.
3. **Coste válido → `400 COSTE_INVALIDO`**: si `coste_total` no es finito o es
   `< 0` → `{ status:400, code:'COSTE_INVALIDO', mensaje:'el coste total debe ser un numero >= 0', project_id }`
   + failed. `costes.fuentes` se suma como número (construccion+operacion+fuentes)
   si no se pasa `coste_total`.
4. **Techo de sangría declarado**: `TECHO_SANGRIA = 1000` (EUR). Sobre ese coste
   acumulado el proyecto pasa a `SANGRA` cuando además supera ingresos.
5. **Acumuladores fire-and-forget (F1→F3, F2→F3)**: `_acumularCobro` suma el `importe`
   real a `ingresos` y recalcula estado/flujo; `_acumularCoste` fija `coste_total`
   (`coste_proyecto.coste_total ?? coste_proyecto`) y recalcula. Si el cobro/coste
   es inválido → `400 INVALID_INPUT` (`cobro inválido para acumular en caja` /
   `coste inválido para imputar al cuadro`), sin emitir par de fallo (no hay RPC que
   cerrar en fire-and-forget).
6. **La lectura no muta**: `_leer` obtiene o crea el cuadro (`_obtenerOCrear`) y
   devuelve `200 {project_id, cuadro}` sin tocar el estado.
7. **HTTP exacto**: éxito `200`; rol inválido → `403`; campos inválidos → `400`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.salud.actualizar.response` y
`nichos.cuadro.leer.response`:

### 1. `actualizar` — declarar la salud del proyecto (solo SISTEMA_SALUD)

```json
{
  "project_id": "e57a318a-...",
  "rol": "SISTEMA_SALUD",
  "cobros": [ { "importe": 800, "tipo": "EFECTIVO" }, { "importe": 500, "tipo": "COMPROMETIDO" } ],
  "costes": { "construccion": 400, "operacion": 100, "fuentes": 50 },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "cuadro": { "esquema": "nichos-cuadro-salud-v1", "proyect_id": "e57a318a-...", "estado": "GENERA", "ingresos": 1300, "coste_total": 550, "flujo_a_caja": 750, "techo_sangria": 1000, "periodo": "semana", "updated_at": "2026-09-25T..." },
  "estado": "GENERA",
  "actualizado": true
}
```
Emite `nichos.salud.actualizada`:
```json
{ "project_id": "e57a318a-...", "estado": "GENERA", "coste_total": 550, "ingresos": 1300, "flujo_a_caja": 750, "correlation_id": "abc-123" }
```
y también `nichos.cuadro.flujo_a_caja`:
```json
{ "project_id": "e57a318a-...", "flujo_a_caja": 750, "periodo": "semana" }
```

### 2. `leer` — leer el cuadro (no muta)

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "cuadro": { "esquema": "nichos-cuadro-salud-v1", "proyect_id": "e57a318a-...", "estado": "GENERA", "ingresos": 1300, "coste_total": 550, "flujo_a_caja": 750, "techo_sangria": 1000, "periodo": "semana", "updated_at": "2026-09-25T..." } }
```

### Fallo — rol inválido

```json
{ "project_id": "e57a318a-...", "rol": "SISTEMA_PROYECTOS", "cobros": [], "costes": { "construccion": 10 } }
```
Respuesta `403` + `nichos.salud.actualizar.failed`:
```json
{ "status": 403, "code": "PERMISSION_DENIED", "mensaje": "solo el SISTEMA_SALUD puede actualizar el cuadro de salud", "rol_esperado": "SISTEMA_SALUD", "rol_recibido": "SISTEMA_PROYECTOS" }
```

## Tests

El test vive en `tests/unit/cuadro-salud-financiera.test.js`. Cubre:

- `actualizar` con rol `SISTEMA_SALUD` y hechos válidos → `200`, calcula
  `GENERA`/`SANGRA`/`NEUTRO` según ingresos vs coste_total/techo, persiste y emite
  `nichos.salud.actualizada` (+ `nichos.cuadro.flujo_a_caja`).
- `actualizar` con rol distinto → `403 PERMISSION_DENIED` + `nichos.salud.actualizar.failed`.
- `actualizar` con `coste_total` negativo → `400 COSTE_INVALIDO` + failed.
- `leer` → `200 {project_id, cuadro}` sin mutar.
- `onCobroRegistrado` acumula ingreso (F1→F3) y `onCosteImputado` recalcula
  (F2→F3); cobro/coste inválido → `400 INVALID_INPUT`.
- `_registrarFlujoACaja` registra el flujo de un periodo.
- `project.activated` restaura el cuadro vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/cuadro-salud-financiera
node tests/unit/cuadro-salud-financiera.test.js
```

## Notas de implementación

- Clase `CuadroSaludFinanciera extends ModuloHibridoReflejo`; `name =
  'cuadro-salud-financiera'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._cuadros` (Map project_id → cuadro).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'cuadro-salud-financiera.json', dir: '/prisma/nichos', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` +
  `detener()`. Cada escritura marca `marcarDirty(pid)`.
- `onActualizarRequest` delega en `_atender(e, 'actualizar',
  'nichos.salud.actualizar.response', ...)` y publica `nichos.salud.actualizada` +
  `nichos.cuadro.flujo_a_caja` en 200, o `nichos.salud.actualizar.failed` si no.
- `onCosteImputado` publica `nichos.salud.actualizada` solo si
  `res.status === 200 && res.data.actualizado`.
- Proyecciones: `_agregarPorProyecto` (escritura + guard), `_leer` (lectura),
  `_calcularEstado` (medida maestra pura), `_acumularCobro` / `_acumularCoste`
  (fire-and-forget), `_registrarFlujoACaja` (tool). Helper `estadoDe(pid)` como
  alias para C7/K1.
- Tools: `toolActualizar` → `_agregarPorProyecto`, `toolLeer` → `_leer`,
  `toolRegistrarFlujoACaja` → `_registrarFlujoACaja`.
- DEP hacia delante: lo consumen reglas-aprendidas (C7), alerta-sangria (F4),
  vista-portafolio (K1) y pulso-avance.
