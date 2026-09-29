---
name: plan-amortizacion
description: >
  Skill FULL del módulo CUSTODIO `plan-amortizacion` de la vertical contabilidad de Enki.
  LA TABLA DE AMORTIZACIÓN del inmovilizado: el plan de cuotas de cada bien y la cuota que toca
  en un periodo. Método y coeficientes son DATO declarable — cero constantes fiscales; sin método
  declarado la cuota queda `[ABIERTO]` y el sistema PREGUNTA, no decide. Un solo escritor.
  Persiste por proyecto con PosPersistencia. Úsala para operar, depurar o extender el custodio,
  o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites calcular la cuota del periodo de un bien (RPC
    plan-amortizacion.cuota_del_periodo.request) o declarar su tabla (RPC
    plan-amortizacion.declarar.request).
  - Cuando depures por qué la cuota sale `null` con `abierto:true` (sin plan, sin método o sin
    coste declarado), por qué se rechaza la declaración (403 PERMISSION_DENIED si el rol no es
    DECLARACION_AMORTIZACION, 400 INVALID_INPUT si falta project_id o id_activo).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    custodio (coeficientes declarables, cero tablas cableadas, cuota determinista sin mutar el plan).
  - Cuando vayas a escribir/ampliar el test unitario del custodio plan-amortizacion.
tags: [enki, modulo, custodio, contabilidad, plan-amortizacion]
---

# plan-amortizacion — CUSTODIO CON PERSISTENCIA de la tabla de amortización

## Qué hace el módulo

`plan-amortizacion` es un **CUSTODIO CON PERSISTENCIA** (F2, hoja del plan): **LA TABLA DE
AMORTIZACIÓN** del inmovilizado — el **PLAN** de cuotas de cada bien (F1) y la **CUOTA QUE TOCA**
en un periodo (dispara en el cierre). Es el custodio de la parcela **`planes`**.

**LOS COEFICIENTES Y MÉTODOS SON DECLARABLES** (invariante 5 — la ley entra como **DATO**): el
método (lineal, porcentaje declarado, cuota declarada…) y sus **COEFICIENTES** entran como
`ParametroDeclarable` del negocio — la tabla la **DECLARA** el dueño/asesor. **PROHIBIDO CABLEAR
COEFICIENTES FISCALES**: en este módulo **NO** hay ninguna tabla legal, ningún porcentaje fijo,
ninguna vida útil por defecto, ningún cuadro ministerio. **Sin método declarado NO se genera la
tabla** y la cuota queda `[ABIERTO]` (`cuota:null`, `motivo`). **El sistema PREGUNTA; no decide.**

**EL MÉTODO ES TAMBIÉN DECLARABLE POR PLAN**: cada `declarar` fija el método y sus parámetros del
bien; el plan queda persistido y su generación es **DETERMINISTA**.

**UN SOLO ESCRITOR**: solo el camino de declaración (rol `DECLARACION_AMORTIZACION`) fija planes;
cualquier otro rol es rechazado (**segundo escritor → 403**).

Invariantes:

- **`cuota_del_periodo` NO muta el plan declarado**: calcula la cuota determinista del periodo.
- **Sin método/coeficiente declarado NO se inventa la cuota**: `cuota:null` y `[ABIERTO]`.
- **El coste del bien entra DECLARADO** en la tabla del negocio (plan o petición) — lo ausente
  queda `[ABIERTO]`.
- **Persiste por proyecto con PosPersistencia**, restaura en `project.activated` y vuelca en
  `onUnload`.

Proyecciones `_cuota_del_periodo` y `_declarar`. Publica `contabilidad.cuota_amortizacion`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `plan-amortizacion.cuota_del_periodo.request` | `onCuotaDelPeriodoRequest` | RPC custodio (calculo determinista, NO muta): {project_id, id_activo, periodo, plan?, valor?, porcentaje?, cuota?, amortizacion_acumulada?} → {project_id, id_activo, periodo, cuota, acumulada, metodo, base, plan, fuente_valor, abierto, motivo}. La cuota se DERIVA del metodo y los coeficientes DECLARADOS en la tabla del plan (o en la peticion): lineal = base/vida_util declarada, porcentaje = base x coeficiente declarado, cuota declarada = importe fijado por el negocio. Sin plan declarado, sin metodo declarado, sin coeficiente declarado o (cuando el metodo deriva de una base) sin coste declarado, NO se inventa la cuota: cuota:null y abierto:true con su motivo (nada se estima, ninguna tabla fiscal cableada). Exito con cuota → publica contabilidad.cuota_amortizacion y responde por plan-amortizacion.cuota_del_periodo.response; project_id o id_activo ausente → plan-amortizacion.cuota_del_periodo.failed. |
| `plan-amortizacion.declarar.request` | `onDeclararRequest` | RPC custodio (escritura, UNICO ESCRITOR): {project_id, rol:'DECLARACION_AMORTIZACION', plan:{id_activo, metodo?, coeficientes?, vida_util?, valor_residual?, coste?, valor?, porcentaje?, cuota?, base?, periodicidad?}} → {project_id, plan, declarado:true, abierto:[parametros no declarados]}. El metodo, sus coeficientes, la vida util, el valor residual y el coste del bien son ParametroDeclarable del negocio; lo ausente queda null y se declara en `abierto`. UPSERT por id_activo con historial de declaraciones. Responde por plan-amortizacion.declarar.response; rol distinto de DECLARACION_AMORTIZACION → 403; project_id o plan.id_activo ausente → plan-amortizacion.declarar.failed. |
| `project.activated` | `onProjectActivated` | Restaura la parcela de planes de amortizacion del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `plan-amortizacion.cuota_del_periodo.response` | Respuesta RPC correlada de plan-amortizacion.cuota_del_periodo.request → {request_id, status:200, data:{cuota, acumulada, metodo, base, plan, abierto, motivo}}. Emitida por el helper _atender. |
| `plan-amortizacion.cuota_del_periodo.failed` | Par de fallo determinista (F2): project_id o id_activo ausente → {status, error:{code, message, details?}}. Cierra el circulo de plan-amortizacion.cuota_del_periodo.request. |
| `plan-amortizacion.declarar.response` | Respuesta RPC correlada de plan-amortizacion.declarar.request → {request_id, status:200, data:{plan, declarado:true, abierto}}. Emitida por el helper _atender. |
| `plan-amortizacion.declarar.failed` | Par de fallo determinista (F2): segundo escritor (rol distinto de DECLARACION_AMORTIZACION → 403) o plan.id_activo/project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de plan-amortizacion.declarar.request. |
| `contabilidad.cuota_amortizacion` | Fire-and-forget (F2): hay cuota de amortizacion del periodo para un bien → {project_id, id_activo, periodo, cuota, acumulada, metodo, correlation_id}. Lo LEEN valor-neto-contable (F4, al balance), el cierre del ejercicio y el asiento de amortizacion. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `plan-amortizacion.cuota_del_periodo.failed` cierra el círculo de
> `plan-amortizacion.cuota_del_periodo.request` y `plan-amortizacion.declarar.failed` cierra el de
> `plan-amortizacion.declarar.request`, cada uno cuando su proyección devuelve status ≠ 200.

> Nota de honestidad (cruce con `index.js`): `onCuotaDelPeriodoRequest` publica
> `contabilidad.cuota_amortizacion` **solo si `res.data.cuota !== null`** — es decir, **solo cuando
> hay cuota real**; un `[ABIERTO]` (`cuota:null`) sigue siendo un `200` pero **NO** emite el evento
> de dominio ni el par `failed`. `onDeclararRequest` publica el par `declarar.failed` solo si
> `status !== 200`.

> Nota de sub-declaración (cruce con `index.js`): **no está en `module.json` pero sí lo
> implementa `index.js`**: el helper `_declarar` fija cada parámetro presente y deja `null` los
> ausentes; `_cuota` admite como **sinónimos** de método `'porcentaje'|'porcentaje_declarado'|
> 'tanto_por_ciento'`, `'lineal'|'lineal_declarado'` y `'cuota_declarada'|'importe_declarado'` —
> sinónimos **en el parseo del método declarado**, no un catálogo de valores. Un método que el
> módulo no entiende **no se improvisa**: devuelve `cuota:null` con motivo («el negocio declara su
> tabla»). Tampoco figura el helper de lectura `plansDe(pid)` (no muta).

> Nota: el módulo expone `toolCuotaDelPeriodo(params)` y `toolDeclarar(params)` como **tools
> directas** — no son eventos del bus, no figuran en `module.json`.

## Reglas de negocio

1. **`cuota_del_periodo` — fallos deterministas**: `project_id` (`input.project_id ||
   this.project_id`) ausente → `400 INVALID_INPUT` (`field:'project_id'`); `id_activo` (de
   `input.id_activo` o `input.activo.id_activo`, trim) ausente → `400 INVALID_INPUT`
   (`field:'id_activo'`).
2. **El PLAN se resuelve primero**: `input.plan` objeto o el persistido del bien
   (`_planesDe(pid).get(id_activo)`). **Sin plan → `[ABIERTO]`** con
   `motivo:'el bien no tiene plan de amortizacion declarado (la tabla la declara el negocio)'`.
3. **El MÉTODO es DECLARABLE**: `plan.metodo` no vacío; **sin método → `[ABIERTO]`** con
   `motivo:'el plan no declara metodo de amortizacion: no se asume ninguno (nada se estima)'`.
   **No se asume lineal.**
4. **El COSTE del bien** (`_valorDelBien`): `input.valor` declarado → `fuente_valor:'declarado'`;
   si no `plan.coste` → si no `plan.valor` → `fuente_valor:'plan'`; si no `null`.
5. **La base solo se exige cuando el método la necesita**: `pide_base = !_esCuotaFija(metodo)`
   (los métodos `'cuota_declarada'`/`'importe_declarado'` **no** derivan de una base). Si
   `valor === null && pide_base` → `[ABIERTO]` con
   `motivo:'no hay coste del bien declarado en la tabla del plan (y el metodo lo necesita): no se
   estima'`.
6. **La cuota se DERIVA del método y sus coeficientes declarados** (`_cuota`):
   - `base = plan.base` si declarada; si no `valor − residual` (residual `_num(plan.valor_residual) || 0`).
   - **`porcentaje`** (`'porcentaje'|'porcentaje_declarado'|'tanto_por_ciento'`): coeficiente
     declarado en `coeficientes.porcentaje|coeficiente|tanto_por_ciento` → `plan.porcentaje` →
     `input.porcentaje`; `cuota = base × (pct/100)`. Sin coeficiente → `cuota:null` con motivo.
   - **`lineal`** (`'lineal'|'lineal_declarado'`): `base / vida_util` con `vida_util` **declarada**;
     sin `vida_util` (>0) → `cuota:null` («no se asume ninguna»).
   - **`cuota declarada`** (`'cuota_declarada'|'importe_declarado'`): importe en
     `coeficientes.cuota|importe` → `plan.cuota` → `input.cuota`; sin importe → `cuota:null`.
   - **Método desconocido** → `cuota:null` con
     `motivo:"metodo '<metodo>' no aplicable con los parametros declarados: el negocio declara su tabla"`.
7. **Sin cuota derivable → `[ABIERTO]`**: la respuesta devuelve `cuota:null`, `acumulada:null`,
   `metodo`, `plan`, `fuente_valor`, `abierto:true` y el `motivo` del cálculo.
8. **La acumulada**: `input.amortizacion_acumulada` si viene (redondeada a 2); si no, la propia
   `cuota` del periodo (redondeada a 2). `base` se devuelve redondeada a 2.
9. **`cuota_del_periodo` NO muta**: no escribe ni cambia el plan persistido.
10. **`declarar` — fallos deterministas**: `project_id` ausente → `400`
    (`field:'project_id'`); `plan.id_activo` (o `input.id_activo`) ausente → `400`
    (`field:'plan.id_activo'`).
11. **GUARD de escritor**: `_declarar` exige `input.rol === 'DECLARACION_AMORTIZACION'`
    (constante `ROL_ESCRITOR`). Cualquier otro rol → `403 PERMISSION_DENIED` con
    `{rol_esperado, rol_recibido}`.
12. **UPSERT por `id_activo` con historial**: si el plan existe se reusa (conserva `declarado_en`,
    `estado` e `historial`) y se actualiza; cada declaración **APPENDEA** a `plan.historial` un
    registro `{metodo, coeficientes, por:'DECLARACION_AMORTIZACION', en:ahora}`.
13. **El molde del plan** (`PARAMETROS_PLAN`): `['metodo', 'coeficientes', 'vida_util',
    'valor_residual', 'coste', 'valor', 'porcentaje', 'cuota', 'base', 'periodicidad']`. Solo los
    **nombres**: **ningún valor cableado**. `vida_util`, `valor_residual` y `base` se normalizan
    con `_num`; lo ausente se apila en `abierto`.
14. **Nada cableado**: el código **no enumera** métodos fiscales, coeficientes ni vidas útiles; los
    sinónimos de método solo reconocen lo declarado. El plan queda `estado:'DECLARADO'`.
15. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)` (reconstruye `planes` + `orden`); `onUnload` →
    `flush()` + `detener()`.
16. **HTTP exacto**: éxito `200` (con `cuota` o `[ABIERTO]`); rol inválido → `403`;
    `project_id`/`id_activo` ausentes → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `plan-amortizacion.cuota_del_periodo.response` y
`plan-amortizacion.declarar.response`; emite `contabilidad.cuota_amortizacion`.

### 1. `declarar` — el dueño/asesor declara la tabla del bien

```json
{
  "project_id": "e57a318a-...",
  "rol": "DECLARACION_AMORTIZACION",
  "plan": { "id_activo": "MAQ-01", "metodo": "lineal", "vida_util": 10, "valor_residual": 0, "coste": 48000, "periodicidad": "anual" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "plan": { "id_activo": "MAQ-01", "metodo": "lineal", "coeficientes": null, "vida_util": 10, "valor_residual": 0, "base": null, "periodicidad": "anual", "coste": 48000, "estado": "DECLARADO", "abierto": [], "declarado_en": "2026-09-25T...", "updated_at": "2026-09-25T...", "historial": [ { "metodo": "lineal", "coeficientes": null, "por": "DECLARACION_AMORTIZACION", "en": "2026-09-25T..." } ] },
  "declarado": true,
  "abierto": []
}
```

Re-declarar el mismo bien → UPSERT: el **historial crece** y `declarado_en` **se conserva**.

### 2. `cuota_del_periodo` — la cuota derivada del método declarado

```json
{ "project_id": "e57a318a-...", "id_activo": "MAQ-01", "periodo": "2026-09", "correlation_id": "abc-123" }
```

Con el plan anterior (lineal, vida útil 10, coste 48000) → `200`:

```json
{
  "project_id": "e57a318a-...", "id_activo": "MAQ-01", "periodo": "2026-09",
  "cuota": 4800, "acumulada": 4800, "metodo": "lineal", "base": 48000,
  "plan": { "...": "..." }, "fuente_valor": "plan", "abierto": false, "motivo": null
}
```

Emite `contabilidad.cuota_amortizacion` (lo LEEN valor-neto-contable F4, el cierre y el asiento de
amortización):

```json
{ "project_id": "e57a318a-...", "id_activo": "MAQ-01", "periodo": "2026-09", "cuota": 4800, "acumulada": 4800, "metodo": "lineal", "correlation_id": "abc-123" }
```

### 3. `cuota_del_periodo` — sin método declarado → `[ABIERTO]`

Sin plan → `200` con `cuota:null`, `acumulada:null`, `abierto:true` y
`motivo:'el bien no tiene plan de amortizacion declarado (la tabla la declara el negocio)'`. Con
plan pero sin método → `motivo:'el plan no declara metodo de amortizacion: no se asume ninguno
(nada se estima)'`. **NO se emite `contabilidad.cuota_amortizacion`** (no hay cuota).

### 4. Fallo — segundo escritor al declarar

Respuesta `403` + `plan-amortizacion.declarar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el camino de declaracion (DECLARACION_AMORTIZACION) fija planes de amortizacion", "details": { "rol_esperado": "DECLARACION_AMORTIZACION", "rol_recibido": "OTRO" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/plan-amortizacion.test.js`. Cubre:

- `declarar` con rol `DECLARACION_AMORTIZACION` → `200 {declarado:true}`; re-declarar → UPSERT con
  historial creciente y `declarado_en` conservado.
- Otro rol → `403 PERMISSION_DENIED` + `.declarar.failed`; sin `plan.id_activo` → `400`.
- `cuota_del_periodo` con plan lineal declarado → `200 cuota` calculada y emite
  `contabilidad.cuota_amortizacion`.
- Sin plan / sin método / sin coeficiente / sin coste (cuando el método lo pide) → `200 cuota:null`
  con `abierto:true` y `motivo` (**no se inventa**, ninguna tabla fiscal cableada).
- Método desconocido → `cuota:null` con el motivo de «el negocio declara su tabla».
- **`cuota_del_periodo` NO muta el plan** persistido.
- `project.activated` restaura la parcela; `plansDe(pid)` lee sin mutar.
- `toolCuotaDelPeriodo` / `toolDeclarar` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PlanAmortizacion extends ModuloHibridoReflejo`; `name = 'plan-amortizacion'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._parcelas`
  (`Map<project_id, {esquema, planes: Map<id_activo, Plan>, orden:[]}>`). Esquema
  `'contabilidad-plan-amortizacion-v1'`.
- Constantes: `ROL_ESCRITOR = 'DECLARACION_AMORTIZACION'` y `PARAMETROS_PLAN = ['metodo',
  'coeficientes', 'vida_util', 'valor_residual', 'coste', 'valor', 'porcentaje', 'cuota', 'base',
  'periodicidad']` (solo nombres del molde).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file: 'plan-amortizacion.json',
  dir: '/contabilidad/plan-amortizacion', snapshot, hidratar })` desde
  `modules/contabilidad-analitica/plan-amortizacion/` (DOS niveles →
  `../../_shared/pos-persistencia`). `onProjectActivated` → `restaurar(project_id)`; `onUnload` →
  `flush()` + `detener()`; `marcarDirty(pid)` en cada escritura.
- `onCuotaDelPeriodoRequest` / `onDeclararRequest` usan `this._atender(e, '<op>',
  '<slug>.<op>.response', async (d) => {...})` con cierre de círculo. Proyecciones
  `_cuota_del_periodo` (**async**, no muta) y `_declarar` (**síncrona** + GUARD); helpers `_cuota`,
  `_esCuotaFija`, `_valorDelBien`, `_planesDe`, `_obtenerOCrear` y la función de módulo
  `plan_valor(coeficientes, claves)`. Lectura directa `plansDe(pid)`. Tools `toolCuotaDelPeriodo` /
  `toolDeclarar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lee el bien/valor desde el plan declarado o la petición; el criterio de cierre se podría
  consultar en la cola declarativa (K9) por evento, **pero nunca se asume un valor de ella**. Lo
  LEEN `valor-neto-contable` (F4), el cierre del ejercicio y el asiento de amortización vía
  `contabilidad.cuota_amortizacion`.
- **PARÁMETRO COMO DATO**: método, coeficientes, vida útil, valor residual y coste son
  **declarables**; el código **NO cablea** ninguna tabla fiscal, ningún porcentaje fijo, ninguna
  vida útil por defecto. **Sin método declarado la cuota queda `[ABIERTO]`: el sistema PREGUNTA; no
  decide.**
