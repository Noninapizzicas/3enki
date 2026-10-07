---
name: perfil-cobro-entrega
description: >
  Skill FULL del módulo CUSTODIO `perfil-cobro-entrega` de la vertical nichos
  (Radar de Nichos). Guarda el CONTRATO DE PAGO Y ENTREGA declarable por pagador del
  nicho: plataforma de cobro aceptada, forma y canal de entrega de la solución al pagador,
  precio, periodicidad y condiciones. Es el STORE del perfil de cobro/entrega por proyecto
  que motor-cobro (E3) y canal-distribucion (E4) consumen. Un solo escritor (CONSTRUCTOR o
  DUEÑO, guard de rol); la lectura no muta. Persiste por proyecto vía PosPersistencia.
  Úsala para operar, depurar o extender el custodio, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites declarar o consultar el contrato de cobro/entrega de un proyecto
    (RPC nichos.perfil.declarar.request / nichos.perfil.leer.request).
  - Cuando depures por qué una declaración se rechaza (PERMISSION_DENIED si el rol no es
    CONSTRUCTOR/DUEÑO, INVALID_INPUT si la plataforma/forma de entrega no es permitida).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas de
    negocio (un solo escritor, plataformas/formas cerradas, merge conservador).
  - Cuando vayas a escribir/ampliar el test unitario del custodio.
tags: [enki, modulo, custodio, persistencia, nichos, radar, cobro, entrega, proyecto-3d]
---

# perfil-cobro-entrega — CUSTODIO CON PERSISTENCIA del contrato de cobro/entrega

## Qué hace el módulo

`perfil-cobro-entrega` es un **CUSTODIO CON PERSISTENCIA** (I1, hoja del plan): el dueño del
store del perfil de cobro/entrega **por proyecto**. Guarda el **CONTRATO DE PAGO Y ENTREGA**
declarable por pagador del nicho: las **plataformas de cobro aceptadas**, la **forma y canal de
entrega** de la solución al pagador, el **precio**, la **periodicidad** y las **condiciones**. Es
el **STORE** que **motor-cobro (E3)** y **canal-distribucion (E4)** consumen.

Un **solo escritor** del store: el **CONSTRUCTOR** declara el contrato al construir el nicho y el
**DUEÑO** puede declararlo o ajustarlo (guard de rol en `_declarar`); los demás procesos son solo
lectores. La lectura (`_leer`) no muta. Persiste por proyecto con **PosPersistencia** (storage
`/prisma/nichos/perfil-cobro-entrega.json`), restaura en `project.activated` y vuelca en `onUnload`.
Emite `nichos.perfil.declarado` en éxito y su par de fallo `nichos.perfil.declarar.failed` en rechazo.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.perfil.leer.request` | `onLeerRequest` | RPC custodio: {project_id} → {project_id, perfil}. Lee el perfil de cobro/entrega vigente del proyecto (pagador, contrato{plataforma_cobro, forma_entrega, precio, periodicidad, canal_entrega, condiciones}). La lectura no muta. Lo consumen motor-cobro (E3) y canal-distribucion (E4). |
| `nichos.perfil.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'CONSTRUCTOR'\|'DUEÑO', contrato:{...}} → {project_id, perfil, declarado}. Guard de rol (second-writer rechazado: rol != CONSTRUCTOR/DUEÑO). Persiste el contrato, publica `nichos.perfil.declarado` y responde por `nichos.perfil.declarar.response`. Si no es un escritor autorizado o el contrato es inválido (plataforma/forma_entrega no permitidas) → `nichos.perfil.declarar.failed`. |
| `project.activated` | `onProjectActivated` | Restaura el perfil de cobro/entrega del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.perfil.declarado` | Fire-and-forget (I1): el contrato de cobro/entrega fue declarado → {project_id, perfil, declarado:true}. Lo consumen motor-cobro (E3) para ejecutar el cobro y canal-distribucion (E4) para entregar la solución por el canal declarado. |
| `nichos.perfil.declarar.failed` | Par de fallo determinista (I1): declaración rechazada (rol != CONSTRUCTOR/DUEÑO) o contrato inválido → {status, code, message, data}. Cierra el círculo de nichos.perfil.declarar.request. |

> **Regla de cierre de círculo**: el par `nichos.perfil.declarar.failed` cierra el círculo de
> `nichos.perfil.declarar.request`. En éxito `onDeclararRequest` propaga el fire-and-forget de
> dominio `nichos.perfil.declarado` (con `correlation_id` del request) además de la `.response`.

> **Nota: los eventos de dominio que emite index.js en `onDeclararRequest` (nichos.perfil.declarado,
> nichos.perfil.declarar.failed) coinciden exactamente con los publicados en module.json** — no hay
> sub-declaración en este módulo.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_declarar` exige `rol` en `['CONSTRUCTOR','DUEÑO']` (Set
   `ROLES_ESCRITOR`). Si el rol es cualquiera otro → `403 PERMISSION_DENIED` con
   `{ status:403, code:'PERMISSION_DENIED', mensaje:'solo el CONSTRUCTOR o el DUEÑO pueden declarar el contrato de cobro/entrega', roles_esperados:['CONSTRUCTOR','DUEÑO'], rol_recibido:<rol> }`
   + `nichos.perfil.declarar.failed`. Second-writer rechazado.
2. **Contrato obligatorio → `400 INVALID_INPUT`**: si `contrato` falta o no es objeto →
   `{ status:400, code:'INVALID_INPUT', mensaje:'contrato requerido', field:'contrato' }` + failed.
3. **Plataformas de cobro cerradas**: `plataforma_cobro` debe estar en
   `['efectivo','transferencia','paypal','stripe','suscripcion','cripto']` (Set `PLATAFORMAS_COBRO`).
   Si se declara una no permitida (p. ej. `'bitcoin'`) → `400 INVALID_INPUT` `contrato.plataforma_cobro`.
4. **Formas de entrega cerradas**: `forma_entrega` debe estar en `['digital','fisico','híbrido','hibrido']`
   (Set `FORMAS_ENTREGA`; `'híbrido'` se normaliza a `'hibrido'`). Si se declara una no permitida
   (p. ej. `'teletransporte'`) → `400 INVALID_INPUT` `contrato.forma_entrega`.
5. **Precio estrictamente positivo**: `numPos(contrato.precio)` requiere `Number(precio)` finito y `> 0`;
   si no, cae al precio previo o `null`. CERO contratos con precio ≤ 0.
6. **`project_id` obligatorio → `400 INVALID_INPUT`**: si falta `project_id` → `_invalid('project_id')`
   (mismo shape `{status:400, code:'INVALID_INPUT', field:'project_id'}`) + failed.
7. **Merge conservador sobre el molde**: `_declarar` sobre el perfil previo — cada campo declarable
   se valida y normaliza; si no viene en la nueva declaración, preserva el valor previo (pagador,
   plataforma/forma, precio, periodicidad, canal_entrega) o aplica default honesto (pagador=pid,
   condiciones=[]). Marca `updated_at` ISO y `declarado_por` con el rol.
8. **La lectura no muta**: `_leer` obtiene o crea el perfil (`_obtenerOCrear`, que solo crea si no
   existe) y devuelve `200 {project_id, perfil}` sin tocar el contrato.
9. **HTTP exacto**: éxito `200`; rol inválido → `403`; campos inválidos → `400`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.perfil.declarar.response` y `nichos.perfil.leer.response`:

### 1. `declarar` — declarar/ajustar el contrato de cobro y entrega (solo CONSTRUCTOR | DUEÑO)

```json
{
  "project_id": "e57a318a-...",
  "rol": "CONSTRUCTOR",
  "contrato": {
    "pagador": "cliente a",
    "plataforma_cobro": "transferencia",
    "forma_entrega": "digital",
    "precio": 120,
    "periodicidad": "mes",
    "canal_entrega": "email",
    "condiciones": ["pago anticipado"]
  },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "perfil": {
    "esquema": "nichos-perfil-cobro-entrega-v1",
    "pagador": "cliente a",
    "contrato": { "plataforma_cobro": "transferencia", "forma_entrega": "digital", "precio": 120, "periodicidad": "mes", "canal_entrega": "email", "condiciones": ["pago anticipado"] },
    "updated_at": "2026-09-25T10:00:00.000Z",
    "declarado_por": "CONSTRUCTOR"
  },
  "declarado": true
}
```
Emite `nichos.perfil.declarado`:
```json
{ "project_id": "e57a318a-...", "perfil": { "...": "..." }, "declarado": true, "correlation_id": "abc-123" }
```

### 2. `leer` — consultar el perfil vigente (no muta)

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "perfil": { "esquema": "nichos-perfil-cobro-entrega-v1", "pagador": "cliente a", "contrato": { "plataforma_cobro": "transferencia", "forma_entrega": "digital", "precio": 120, "periodicidad": "mes", "canal_entrega": "email", "condiciones": ["pago anticipado"] }, "updated_at": "...", "declarado_por": "CONSTRUCTOR" } }
```

### Fallos típicos

- Rol distinto de CONSTRUCTOR/DUEÑO → `403` + `nichos.perfil.declarar.failed` (`PERMISSION_DENIED`).
- Plataforma no permitida (`'bitcoin'`) → `400` + failed (`INVALID_INPUT`).
- Forma de entrega no permitida (`'teletransporte'`) → `400` + failed (`INVALID_INPUT`).
- Falta `project_id` o `contrato` → `400` + failed (`INVALID_INPUT`).

## Tests

El test vive en `tests/unit/nichos__perfil-cobro-entrega.test.js`. Cubre:

- `declarar` con rol `CONSTRUCTOR` y contrato válido → `200`, guarda plataforma/forma/precio,
  publica `nichos.perfil.declarado` y su `.response` correlado con `request_id`.
- `leer` → `200 {project_id, perfil}` sin mutar.
- `perfilPagador` (alias para E3/E4) devuelve el perfil con contrato.
- `declarar` con DUEÑO → ajuste con **merge conservador** (preserva forma declarada antes) y
  `declarado_por:'DUEÑO'`.
- Rol distinto → `403 PERMISSION_DENIED` + `nichos.perfil.declarar.failed`.
- Contrato inválido (plataforma/forma no permitida) → `400 INVALID_INPUT` + failed.
- `project.activated` restaura el perfil de otro proyecto vía PosPersistencia.
- Manifest: subscribes (leer/declarar/project.activated) ↔ handlers y publishes exactos de la hoja I1.

Para ejecutarlo (test central del repo):

```bash
cd /home/admin/3enki
node tests/unit/nichos__perfil-cobro-entrega.test.js
```

## Notas de implementación

- Clase `PerfilCobroEntrega extends ModuloHibridoReflejo`; `name = 'perfil-cobro-entrega'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._perfiles` (Map project_id → perfil).
- **PosPersistencia**: `this._persist = new PosPersistencia({ modulo: this, file:
  'perfil-cobro-entrega.json', dir: '/prisma/nichos', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Las
  escrituras/lecturas con creación marcan `marcarDirty(pid)`.
- `onDeclararRequest` delega en `_atender(e, 'declarar', 'nichos.perfil.declarar.response', fn)` y
  hace el fire-and-forget de dominio (`nichos.perfil.declarado` en 200 o
  `nichos.perfil.declarar.failed` si no) dentro del handler, propagando `correlation_id`.
- `onLeerRequest` delega en `_atender(e, 'leer', 'nichos.perfil.leer.response', d => this._leer(d))`.
- Proyecciones: `_leer` (lectura, no muta) y `_declarar` (escritura con guard de rol + merge
  conservador); alias semántico `perfilPagador(pid)` para E3/E4. Helpers `perfilVacio()`/`numPos`.
  `_invalid`/`_errorResponse` vienen de `modulo-hibrido-reflejo`.
- Tools: `toolLeer` → `_leer`, `toolDeclarar` → `_declarar`.
- DEP hacia delante: lo consumen motor-cobro (E3) y canal-distribucion (E4).
