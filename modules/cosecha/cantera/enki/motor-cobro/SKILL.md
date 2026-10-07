---
name: motor-cobro
description: >
  Skill FULL del módulo REFLEJO (stateless) `motor-cobro` de la vertical nichos (Radar
  de Nichos). Ejecuta y registra el cobro del nicho sobre las plataformas DECLARADAS
  (agnóstico al proveedor): distingue EFECTIVO (el dinero entró: pagos directos) de
  COMPROMETIDO (promesa/suscripción recurrente que genera flujo a caja futuro). Publica
  nichos.cobro.ejecutado (-> registro-cobros F1 append-only) + su par determinista. Sin
  store, sin persistencia: proyección pura determinista. Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites ejecutar un cobro de un nicho sobre la plataforma declarada
    (RPC nichos.motor-cobro.ejecutar.request).
  - Cuando depures por qué un cobro se rechaza (INVALID_INPUT en importe<=0, pagador vacío,
    plataforma no declarada o proyecto sin id) o no se emite nichos.cobro.ejecutado.
  - Cuando quieras entender la proyección pura EFECTIVO vs COMPROMETIDO (moneda EUR,
    registro_por MOTOR_COBRO) y el contrato de eventos del reflejo.
  - Cuando vayas a escribir/ampliar el test unitario del módulo.
tags: [enki, modulo, reflejo, stateless, nichos, radar, cobro, motor, proyecto-3d]
---

# motor-cobro — REFLEJO (stateless) que ejecuta el cobro del nicho

## Qué hace el módulo

`motor-cobro` es un **REFLEJO STATELESS** (E3): ejecuta y registra el **cobro del nicho** sobre
las **plataformas DECLARADAS** (agnóstico al proveedor). Distingue **EFECTIVO** (el dinero entró:
pagos directos) de **COMPROMETIDO** (promesa/suscripción recurrente que genera flujo a caja
futuro).

**REFLEJO puro**: sin store, sin persistencia, cada op entra objeto y sale objeto — **proyección
pura determinista**. El **pago-gateway** (líder provider-agnóstico) es el puerto reutilizable que
se llamaría por RPC; el motor de NICHOS se construye **encima del puerto, nunca acoplado al
proveedor**. Publica `nichos.cobro.ejecutado` (→ `registro-cobros` append-only) + su par de fallo
`nichos.cobro.ejecutar.failed`.

> **Nota de forma**: aunque es stateless, su `module.json` declara `project.activated` como
> subscribe (y `onProjectActivated` existe) — pero SOLO registra el `project_id` activo en memoria
> (contexto), sin persistence ni restauración. No es un custodio; no hay PosPersistencia.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.motor-cobro.ejecutar.request` | `onEjecutarRequest` | RPC puro: {project_id, importe, pagador, plataforma} → {project_id, cobro:{importe, pagador, plataforma, tipo:EFECTIVO\|COMPROMETIDO, moneda, ejecutado_en}, ejecutado:true}. Ejecuta el cobro sobre la plataforma declarada (del perfil de cobro/entrega I1) de forma agnóstica al proveedor. Importe <= 0, pagador vacío o plataforma no declarada → `nichos.cobro.ejecutar.failed`. Éxito → publica `nichos.cobro.ejecutado` y responde por `nichos.motor-cobro.ejecutar.response`. |
| `project.activated` | `onProjectActivated` | Reflejo sin estado: registra el `project_id` activo para scope del contexto; no persiste nada. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.cobro.ejecutado` | Fire-and-forget (E3): el cobro del nicho fue ejecutado sobre una plataforma declarada → {project_id, cobro:{importe, pagador, plataforma, tipo:EFECTIVO\|COMPROMETIDO, moneda}, ejecutado:true}. Lo consume registro-cobros (F1) para asentarlo append-only y el pipeline-por-nicho (L1). |
| `nichos.cobro.ejecutar.failed` | Par de fallo determinista (E3): cobro rechazado (importe <= 0, pagador vacío o plataforma no declarada) → {status, code, message, data}. Cierra el círculo de `nichos.motor-cobro.ejecutar.request`. |

> **Regla de cierre de círculo**: el par `nichos.cobro.ejecutar.failed` cierra el círculo de
> `nichos.motor-cobro.ejecutar.request`. En éxito `onEjecutarRequest` propaga el fire-and-forget de
> dominio `nichos.cobro.ejecutado` (con `correlation_id` del request) además de la `.response`.

> **Nota: los eventos de dominio que emite index.js en `onEjecutarRequest` (nichos.cobro.ejecutado,
> nichos.cobro.ejecutar.failed) coinciden exactamente con los publicados en module.json** — no hay
> sub-declaración en este módulo.

## Reglas de negocio

1. **Plataformas de cobro cerradas (declaradas)**: `plataforma` debe estar en
   `['efectivo','transferencia','paypal','stripe','suscripcion','cripto']` (Set `PLATAFORMAS_COBRO`,
   mismo elenco del perfil I1). Cualquier otra (p. ej. `'bitcoin'`) →
   `{ status:400, code:'INVALID_INPUT', mensaje:'plataforma de cobro no declarada', data:{plataforma} }`
   + `nichos.cobro.ejecutar.failed`. El motor solo ejecuta lo declarado.
2. **Importe estrictamente positivo**: `Number(importe)` debe ser finito y `> 0`; si no →
   `_invalid('importe')` (`{ status:400, code:'INVALID_INPUT', field:'importe' }`) + failed.
3. **Pagador obligatorio (string no-vacío)**: `pagador` debe ser string con trim no vacío; si no →
   `_invalid('pagador')` + failed.
4. **`project_id` obligatorio**: si no viene y no hay contexto activo → `_invalid('project_id')`
   + failed.
5. **EFECTIVO vs COMPROMETIDO (proyección pura)**: `_distinguirEfectivoDePromesa` asigna
   `tipo = PLATAFORMAS_EFECTIVO.has(plataforma) ? 'EFECTIVO' : 'COMPROMETIDO'` con
   `PLATAFORMAS_EFECTIVO = ['efectivo','transferencia','paypal','stripe','cripto']`; `suscripcion`
   → COMPROMETIDO (promesa recurrente). **Moneda `EUR`** (constante `MONEDA`), marca `ejecutado_en`
   ISO y `registrado_por:'MOTOR_COBRO'`.
6. **Agnóstico al proveedor**: el motor envuelve/enrutaría el pago-gateway (líder provider-agnóstico)
   por RPC y produce el **Cobro del dominio NICHOS**; nunca se acopla a un vendor.
7. **Reflejo sin estado**: `project_id` del request tiene preferencia sobre el contexto
   (`this.project_id`); no hay store ni PosPersistencia. `project.activated` solo registra el
   proyecto activo en memoria.
8. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.motor-cobro.ejecutar.response`:

### 1. `ejecutar` — ejecutar el cobro sobre la plataforma declarada

```json
{
  "project_id": "e57a318a-...",
  "importe": 120,
  "pagador": "cliente a",
  "plataforma": "transferencia",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "cobro": {
    "importe": 120,
    "pagador": "cliente a",
    "plataforma": "transferencia",
    "tipo": "EFECTIVO",
    "moneda": "EUR",
    "ejecutado_en": "2026-09-25T10:00:00.000Z",
    "registrado_por": "MOTOR_COBRO"
  },
  "ejecutado": true
}
```
Emite `nichos.cobro.ejecutado` (fire-and-forget para registro-cobros F1 / pipeline-por-nicho L1):
```json
{ "project_id": "e57a318a-...", "cobro": { "importe": 120, "pagador": "cliente a", "plataforma": "transferencia", "tipo": "EFECTIVO", "moneda": "EUR" }, "ejecutado": true, "correlation_id": "abc-123" }
```
Cobro de suscripción (`plataforma:'suscripcion'`) → `tipo:'COMPROMETIDO'` (mismo shape).

### Fallos típicos

- Importe `0`/negativo → `400` + `nichos.cobro.ejecutar.failed` (`INVALID_INPUT`, field `importe`).
- Plataforma no declarada (`'bitcoin'`) → `400` + failed (`INVALID_INPUT`, "plataforma de cobro no declarada").
- Pagador vacío → `400` + failed (`INVALID_INPUT`, field `pagador`).
- Sin `project_id` ni contexto → `400` + failed (`INVALID_INPUT`, field `project_id`).

## Tests

El test vive en `tests/unit/nichos__motor-cobro.test.js`. Cubre:

- `ejecutar` cobro EFECTIVO (transferencia) → `200`, `tipo:'EFECTIVO'`, `registrado_por:'MOTOR_COBRO'`,
  publica `nichos.cobro.ejecutado` + `.response` correlado con `request_id`.
- Cobro COMPROMETIDO (suscripcion) → `tipo:'COMPROMETIDO'`.
- Importe `0` → `400 INVALID_INPUT` + `nichos.cobro.ejecutar.failed`.
- Plataforma no declarada (`'bitcoin'`) → `400 INVALID_INPUT`.
- Pagador vacío → `400 INVALID_INPUT`.
- `project.activated` registra el `project_id`; sin `project_id` explícito usa el contexto.
- Manifest: subscribes (`ejecutar.request` + `project.activated`) ↔ handlers y publishes
  (`ejecutado` + `ejecutar.failed`) exactos de la hoja E3.

Para ejecutarlo (test central del repo):

```bash
cd /home/admin/3enki
node tests/unit/nichos__motor-cobro.test.js
```

## Notas de implementación

- Clase `MotorCobro extends ModuloHibridoReflejo`; `name = 'motor-cobro'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless); `this.project_id` en memoria.
- `onEjecutarRequest` delega en `_atender(e, 'ejecutar', 'nichos.motor-cobro.ejecutar.response', fn)`;
  con `status === 200` publica `nichos.cobro.ejecutado`; si no, `nichos.cobro.ejecutar.failed`
  (propaga `correlation_id`).
- `onProjectActivated` es reflejo de contexto: registra `this.project_id` (no persiste).
- Proyecciones puras: `_ejecutarCobro` (validación + ejecución) y `_distinguirEfectivoDePromesa`
  (EFECTIVO/COMPROMETIDO). Constants `PLATAFORMAS_COBRO`, `PLATAFORMAS_EFECTIVO`, `MONEDA='EUR'`.
- Tools: `toolEjecutar` → `_ejecutarCobro`, `toolDistinguir` → `_distinguirEfectivoDePromesa`.
- El pago-gateway (líder provider-agnóstico) es el puerto reutilizable que el motor envuelve — el
  motor de NICHOS se construye encima, nunca acoplado al proveedor.
- DEP hacia delante: lo consume registro-cobros (F1) para asentarlo append-only y el
  pipeline-por-nicho (L1); lee el perfil de cobro/entrega (I1) para la plataforma declarada.
