---
name: onboarding-negocio
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `onboarding-negocio` de la vertical contabilidad
  (Enki). RECOGE los datos DECLARABLES del negocio nuevo (nombre, NIF, plan, fuentes, parámetros).
  UN escritor. Es la puerta de alta: lo que el negocio declara al nacer queda guardado y se anuncia
  el hecho. La parcela aislada NO se reimplementa: SUBE a aislamiento-negocio.parcela.request (I4)
  por EVENTO; el plan declarado lo confirma contra catalogo-cuentas.buscar.request (B1) por EVENTO
  (ambos best-effort). Dato ausente = desconocido. Publica contabilidad.negocio_registrado.
  Persiste por proyecto vía PosPersistencia.
when-to-use: >-
  - Cuando necesites dar de alta un negocio con sus datos declarables, o leerlos
    (RPC onboarding-negocio.recoger.request / .leer.request).
  - Cuando depures por qué se rechaza (403 si el rol no es ONBOARDING_NEGOCIO) o por qué hay
    campos en `abierto`/`faltan` (dato no declarado, no se inventa).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.negocio_registrado.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, analitica, onboarding, negocio, alta]
---

# onboarding-negocio — CUSTODIO de la puerta de alta del negocio

## Qué hace el módulo

`onboarding-negocio` es un **CUSTODIO CON PERSISTENCIA** (K1, hoja del plan). **RECOGE** los datos
**DECLARABLES** del negocio nuevo: su **plan**, sus **fuentes** y sus **parámetros**. UN escritor.
Es la puerta de alta: lo que el negocio declara al nacer queda guardado y se anuncia el hecho.

La parcela aislada del negocio y el plan contable **NO se reimplementan** aquí:
- **SUBE** a `aislamiento-negocio.parcela.request` (I4) por EVENTO — la parcela la crea su custodio.
- **SUBE** a `catalogo-cuentas.buscar.request` (B1) por EVENTO — el plan declarado lo custodia B1.

Invariantes:
- **Dato ausente = desconocido**: un dato no declarado queda `null` y se declara en `abierto`
  (jamás se estima ni se completa). Un negocio sin plan declarado **NO** se le inventa un plan.
- **No se borra**: re-recoger **APPENDEA** al historial.
- **UN escritor por parcela** (guard rol `ONBOARDING_NEGOCIO`; segundo escritor → 403).

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/onboarding-negocio`, archivo
`onboarding-negocio.json`), restaura en `project.activated` y vuelca en `onUnload`.

**Dos caras:** `recoger` es **ORDEN** (`workspace_module`, `barra_modulos`); `leer` es **PREGUNTA**
(bus).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `onboarding-negocio.recoger.request` | `onRecogerRequest` | RPC custodio (**ORDEN**, panel): `{project_id, rol:'ONBOARDING_NEGOCIO', negocio_id, datos{nombre?,nif?,plan?,fuentes?,parametros?}}` → `{project_id, negocio_id, negocio, registrado, parcela}`. Guard de escritor. Recoge/actualiza los datos declarables y sube la parcela a `aislamiento-negocio`. Publica `contabilidad.negocio_registrado`. Responde por `.recoger.response`. |
| `onboarding-negocio.leer.request` | `onLeerRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, negocio_id}` → `{project_id, negocio_id, negocio, existe, faltan, completo}`. Devuelve lo declarado; lo que falte se declara en `abierto`. Sin negocio → `existe:false`. Responde por `.leer.response`. |
| `project.activated` | `onProjectActivated` | Restaura los negocios declarados del proyecto activado desde el storage. |

**Sube por evento:** `aislamiento-negocio.parcela.request` (I4) y `catalogo-cuentas.buscar.request`
(B1), ambos `await this._rpc(...)` best-effort. Nunca import.

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.negocio_registrado` | Fire-and-forget (K1): un negocio quedó registrado con sus datos declarables → `{project_id, negocio_id, negocio, registrado:true}`. Lo consume `aislamiento-negocio` (I4) para su parcela y el resto de la capa analítica. |
| `onboarding-negocio.recoger.response` / `.recoger.failed` | RPC `recoger`. |
| `onboarding-negocio.leer.response` / `.leer.failed` | RPC `leer`. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `recoger` | **ORDEN** (panel) | `{project_id, rol:'ONBOARDING_NEGOCIO', negocio_id\|negocio, datos?\|campos}` | `{project_id, negocio_id, negocio, registrado:true, total_negocios, parcela, plan_contrastado, abierto}` | 403 `PERMISSION_DENIED`; 400 `INVALID_INPUT` (`project_id`/`negocio_id`) |
| `leer` | **PREGUNTA** (bus) | `{project_id, negocio_id}` | `{project_id, negocio_id, negocio, existe, faltan, completo, abierto}` | 400 `INVALID_INPUT` |

## Reglas de negocio (lo que el código IMPONE)

1. **Guard de escritor**: `input.rol === 'ONBOARDING_NEGOCIO'` → si no, `403 PERMISSION_DENIED`.
2. **`negocio_id`**: de `negocio_id` o de `negocio` (si no es objeto); obligatorio.
3. **Campos declarables** (`CAMPOS_DECLARABLES`): `nombre, nif, plan, fuentes, parametros`. Solo se
   copian los **declarados** (`!== undefined && !== null`); lo demás queda `null`/`[]`.
4. **No se borra**: cada `recoger` hace `push` a `historial` con `{nombre, nif, plan, fuentes, en}`.
5. **Sube la parcela**: `await this._rpc('aislamiento-negocio.parcela.request', {project_id,
   negocio_id})`; si responde con `data.parcela`, se guarda en `negocio.parcela`.
6. **Contrasta el plan**: si hay `negocio.plan`, `await this._rpc('catalogo-cuentas.buscar.request',
   {project_id, texto: plan})`; `plan_contrastado = (planResp?.status === 200)`.
7. **`abierto`** en `recoger`: una clave por campo declarable ausente (`nombre`, `nif`, `plan`,
   `fuentes`, `parametros`) con su motivo (no se inventa).
8. **`_leer`**: sin negocio → `negocio:null, existe:false, abierto.negocio` declarado. Con negocio →
   `faltan` = campos declarables vacíos; `completo = faltan.length === 0`.

## Cómo se usa (RPCs)

### 1. Recoger los datos declarables

```json
{
  "project_id": "e57a318a-...", "rol": "ONBOARDING_NEGOCIO", "negocio_id": "pizzepos-1",
  "datos": { "nombre": "Pizzería Centro", "nif": "B12345678", "plan": "PGCE-2007", "fuentes": ["pos"], "parametros": { "iva": 10 } },
  "correlation_id": "abc-20"
}
```
Respuesta `200` + `contabilidad.negocio_registrado`:
```json
{ "project_id": "e57a318a-...", "negocio_id": "pizzepos-1", "negocio": { "negocio_id": "pizzepos-1", "nombre": "Pizzería Centro", "nif": "B12345678", "plan": "PGCE-2007", "fuentes": ["pos"], "parametros": { "iva": 10 }, "parcela": "negocio:pizzepos-1", "declarado_en": "2026-10-01T...", "historial": [ "..." ] }, "registrado": true, "total_negocios": 1, "parcela": "negocio:pizzepos-1", "plan_contrastado": true, "abierto": { "nombre": null, "nif": null, "plan": null, "fuentes": null, "parametros": null } }
```

### 2. Recoger sin plan → [ABIERTO]

Sin `plan` → `abierto.plan:'no se declaro el plan contable del negocio: el sistema pregunta, no lo
asigna'`; no se sube a `catalogo-cuentas`.

### 3. Leer

```json
{ "project_id": "e57a318a-...", "negocio_id": "pizzepos-1" }
```
Respuesta `200`: `{negocio:{...}, existe:true, faltan:[], completo:true}`.

### Fallo — rol inválido

Respuesta `403` + `onboarding-negocio.recoger.failed` (`PERMISSION_DENIED`, `{rol_esperado,
rol_recibido}`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `403 PERMISSION_DENIED` | `rol !== 'ONBOARDING_NEGOCIO'`. |
| `400 INVALID_INPUT` (`project_id`/`negocio_id`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** `aislamiento-negocio` (I4) y `catalogo-cuentas` (B1) — **sube** a ambos por EVENTO.
- **Quién la consume por evento:** `aislamiento-negocio` (I4) lee `contabilidad.negocio_registrado`.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-analitica/onboarding-negocio/module.json` + `index.js`.
2. Smoke: `recoger` con rol ONBOARDING_NEGOCIO → 200 + `contabilidad.negocio_registrado`.
3. Sin plan → `abierto.plan` declarado.
4. Rol inválido → 403 + `.recoger.failed`.
5. `leer` de negocio inexistente → `existe:false`.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `OnboardingNegocio extends ModuloHibridoReflejo`; `name = 'onboarding-negocio'`,
  `version = 'reflejo-0.1.0'`. Store `this._negocios` (Map `pid → {esquema, negocios:
  Map<negocio_id, NegocioDeclarado>}`).
- **PosPersistencia**: `file:'onboarding-negocio.json'`, `dir:'/contabilidad/onboarding-negocio'`.
- Proyecciones `_recoger` (**async**) / `_leer`; lectura `negociosDe(pid)`; tools `toolRecoger`/
  `toolLeer`.
