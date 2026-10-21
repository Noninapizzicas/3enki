---
name: catalogo-cuentas
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `catalogo-cuentas` de la vertical contabilidad
  (Enki). Plan contable declarable/importable del asesor. UN escritor. `anadir` (ORDEN) ESCRIBE y
  por eso ANUNCIA el hecho contabilidad.plan_cuentas_declarado (el intento anterior escribía sin
  anunciar y cortaba la cadena); `buscar` (PREGUNTA) no anuncia. El código es la identidad
  declarada de la cuenta: sin código no se añade. No se pisa en silencio: re-añadir appendea al
  historial. Persiste por proyecto vía PosPersistencia.
when-to-use: >-
  - Cuando necesites añadir/actualizar una cuenta del plan o buscar cuentas
    (RPC catalogo-cuentas.anadir.request / .buscar.request).
  - Cuando depures por qué `buscar` devuelve `abierto.plan` (no hay plan declarado) o por qué
    `anadir` se rechaza (400 INVALID_INPUT por falta de `codigo`).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.plan_cuentas_declarado.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, libro, plan-contable, cuentas]
---

# catalogo-cuentas — CUSTODIO del plan contable

## Qué hace el módulo

`catalogo-cuentas` es un **CUSTODIO CON PERSISTENCIA** (B1, hoja del plan). Es el **plan
contable declarable/importable del asesor**. **UN escritor.**

⚠️ **Este es el módulo cuyo `anadir` escribía sin anunciar** (una de las causas de la cadena
cortada en el intento anterior). R2: `anadir` ESCRIBE → DEBE anunciar el hecho. Aquí **sí** se
publica `contabilidad.plan_cuentas_declarado` al añadir una cuenta; sin ese hecho, quien depende
del plan (`contrapartida-asistida`) nunca se enteraba de que el plan cambió.

Invariantes:
- `anadir` es ESCRITURA → anuncia `contabilidad.plan_cuentas_declarado`.
- `buscar` es PREGUNTA → no anuncia hecho.
- **El código es la identidad declarada de la cuenta**: sin código NO se añade.
- **No se duplica ni se pisa en silencio**: re-añadir una cuenta APPENDEA al historial.

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/catalogo-cuentas`, archivo
`catalogo-cuentas.json`), restaura en `project.activated` y vuelca en `onUnload`.

**Dos caras:** `anadir` es **ORDEN** (`system_panel`); `buscar` es **PREGUNTA** (bus).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `catalogo-cuentas.anadir.request` | `onAnadirRequest` | RPC custodio (**ORDEN**, panel): `{project_id, codigo, nombre?, tipo?, naturaleza?, padre?}` → `{project_id, cuenta, anadida, total}`. Añade/actualiza una cuenta; sin `codigo` → `INVALID_INPUT`. PUBLICA `contabilidad.plan_cuentas_declarado` (R2). Responde por `.anadir.response`. |
| `catalogo-cuentas.buscar.request` | `onBuscarRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, codigo?, prefijo?, texto?, tipo?}` → `{project_id, encontradas, total, total_plan}`. Busca en el plan declarado; no muta. Responde por `.buscar.response`. |
| `project.activated` | `onProjectActivated` | Restaura el plan contable del proyecto activado desde el storage. |

> Nota de deriva (R3): el plan declara subir `cola-declaraciones-criterio.fijar.request`, pero el
> `module.json` real no lo declara.

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.plan_cuentas_declarado` | Fire-and-forget (B1): el plan contable cambió (se añadió/actualizó una cuenta) → `{project_id, codigo, cuenta, anadida:true, total}`. Lo consume `contrapartida-asistida` (resuelve la contrapartida contra el plan declarado). |
| `catalogo-cuentas.anadir.response` | Respuesta RPC correlada de la op `anadir`. |
| `catalogo-cuentas.anadir.failed` | Fallo determinista: falta `project_id` o `codigo`. |
| `catalogo-cuentas.buscar.response` | Respuesta RPC correlada de la op `buscar`. |
| `catalogo-cuentas.buscar.failed` | Fallo determinista: falta `project_id`. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `anadir` | **ORDEN** (panel) | `{project_id, codigo, nombre?, tipo?, naturaleza?, padre?}` | `{project_id, cuenta, anadida:true, total, abierto}` | 400 `INVALID_INPUT` (`project_id`/`codigo`) |
| `buscar` | **PREGUNTA** (bus) | `{project_id, codigo?, prefijo?, texto?, tipo?}` | `{project_id, encontradas, total, total_plan, abierto}` | 400 `INVALID_INPUT` (`project_id`) |

## Reglas de negocio (lo que el código IMPONE)

1. **`_anadir`**: sin `project_id` → `_invalid('project_id')`; sin `codigo` → `_invalid('codigo')`.
2. **Cuenta**: `{codigo, nombre, tipo, naturaleza, padre, declarado_en, historial}`. Solo se
   actualiza el campo que viene declarado (`nombre/tipo/naturaleza/padre`); `null` si no.
3. **No se pisa en silencio**: cada `anadir` hace `push` a `historial` con el estado
   `{nombre, tipo, naturaleza, padre, en}`; `declarado_en` se refresca.
4. **`abierto`** declarado si faltan `nombre` o `naturaleza` (no se inventan).
5. **`_buscar`** (no muta): filtra por `codigo` (exacto), `prefijo` (startsWith), `tipo` (exacto)
   y `texto` (substring en `nombre`, case-insensitive). Devuelve `encontradas, total,
   total_plan`.
6. **`abierto.plan`** declarado si el plan está vacío (`'el plan contable no está declarado
   todavía'`).
7. **`naturaleza`**: `deudora|acreedora` (declarable) — ausente = desconocido. Lectura directa
   `cuentasDe(pid)`.

## Cómo se usa (RPCs)

### 1. Añadir una cuenta

```json
{ "project_id": "e57a318a-...", "codigo": "430", "nombre": "Clientes", "tipo": "activo", "naturaleza": "deudora", "correlation_id": "abc-10" }
```
Respuesta `200` + `contabilidad.plan_cuentas_declarado`:
```json
{ "project_id": "e57a318a-...", "cuenta": { "codigo": "430", "nombre": "Clientes", "tipo": "activo", "naturaleza": "deudora", "padre": null, "declarado_en": "2026-10-01T...", "historial": [ { "nombre": "Clientes", "tipo": "activo", "naturaleza": "deudora", "padre": null, "en": "2026-10-01T..." } ] }, "anadida": true, "total": 1, "abierto": { "nombre": null, "naturaleza": null } }
```

### 2. Buscar por prefijo

```json
{ "project_id": "e57a318a-...", "prefijo": "43" }
```
Respuesta `200`: `{encontradas:[...], total:1, total_plan:1}`.

### Fallo — sin código

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `catalogo-cuentas.anadir.failed` (`INVALID_INPUT`, field `codigo`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`/`codigo`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; el plan dice `cola-declaraciones-criterio`, no cableado en el código).
- **Quién la consume:** `contrapartida-asistida` (A5) resuelve la contrapartida contra
  `contabilidad.plan_cuentas_declarado`.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-libro/catalogo-cuentas/module.json` + `index.js`.
2. Smoke: `anadir` código `430` → 200 + `contabilidad.plan_cuentas_declarado` (CLAVE: verifica R2).
3. Re-añadir → historial crece, no se pisa.
4. `buscar` por prefijo/código/tipo/texto; sin plan → `abierto.plan`.
5. Sin `codigo` → 400 + `.anadir.failed`.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `CatalogoCuentas extends ModuloHibridoReflejo`; `name = 'catalogo-cuentas'`,
  `version = 'reflejo-0.1.0'`. Store `this._catalogos` (Map `pid → {esquema, cuentas:
  Map<codigo, Cuenta>}`).
- **PosPersistencia**: `file:'catalogo-cuentas.json'`, `dir:'/contabilidad/catalogo-cuentas'`.
- Proyecciones `_anadir`/`_buscar`; lectura `cuentasDe(pid)`; tools `toolAnadir`/`toolBuscar`.
