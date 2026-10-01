---
name: puerto-plan-contable
description: >-
  Skill FULL del módulo CONVERSOR STATELESS `puerto-plan-contable` de la vertical contabilidad
  (Enki). Frontera de CODIFICACIÓN del plan contable (import/export): cruza entre la codificación
  EXTERNA (el fichero del asesor) y el plan canónico del dominio (el que usa catalogo-cuentas B1).
  🔴 ES UN CONVERSOR: TRADUCE y DEVUELVE; NO ESCRIBE (quien da de alta es catalogo-cuentas.anadir
  B1). La ley entra como dato: `formato` y `mapeo` declarables; cero esquemas cableados. Sin formato
  → 400 FORMATO_NO_DECLARADO; formato sin mapeo y no canónico → 422 FORMATO_NO_DECLARABLE. SUBE
  catalogo-cuentas.buscar.request best-effort. NO persiste. Ambas RPC son PREGUNTA.
when-to-use: >-
  - Cuando necesites traducir/importar/exportar el plan contable entre codificaciones
    (RPC puerto-plan-contable.entrar.request / .salir.request).
  - Cuando depures por qué 400 FORMATO_NO_DECLARADO o 422 FORMATO_NO_DECLARABLE, o por qué
    `abierto[]` lista cuentas incompletas.
  - Cuando quieras entender su contrato de eventos: es conversor, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, conversor, stateless, contabilidad, libro, plan-contable, import, export]
---

# puerto-plan-contable — CONVERSOR de la codificación del plan

## Qué hace el módulo

`puerto-plan-contable` es un **CONVERSOR STATELESS** (B6, hoja del plan). Es la **FRONTERA DE
CODIFICACIÓN** del plan contable (import/export). Cruza FORMATOS: traduce el plan declarado entre
la codificación **EXTERNA** (el fichero del asesor: columnas, códigos de otro programa, CSV…) y la
representación **CANÓNICA** del dominio (la que usa `catalogo-cuentas` B1). Cruza FORMATO, no
decide CONTENIDO: no da de alta cuentas, no las persiste.

🔴 **ES UN CONVERSOR: TRADUCE Y DEVUELVE. No escribe.** Quien da de alta en el plan es
`catalogo-cuentas.anadir` (B1); esta hoja solo entrega el plan ya traducido para que el custodio lo
escriba. La **LEY ENTRA COMO DATO**: el `formato` y el `mapeo` (campo canónico → clave externa) son
**DECLARABLES**. Sin `formato` declarado NO se convierte; si el formato no tiene `mapeo` declarado
y no es el canónico, se rechaza (`422 FORMATO_NO_DECLARABLE`).

Invariante: **dato ausente = desconocido**. Un campo que no venga del exterior queda `null` y se
declara en `abierto`; los campos extra se conservan en `metadatos`.

- **`entrar`** — externo (plan del asesor) → plan canónico.
- **`salir`** — plan canónico → externo (formato declarado).

Ambas RPC son **PREGUNTA** → sin `ui_handlers`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `puerto-plan-contable.entrar.request` | `onEntrarRequest` | RPC conversor (**PREGUNTA**, por el bus): `{project_id, formato, externo, mapeo?\|esquemas_declarables?}` → `{project_id, formato, direccion:'entrar', plan, total, contraste_plan, abierto}`. Traduce la codificación externa del plan a la canónica. Sin formato → `FORMATO_NO_DECLARADO`; formato sin mapeo y no canónico → `FORMATO_NO_DECLARABLE`. Responde por `.entrar.response`. |
| `puerto-plan-contable.salir.request` | `onSalirRequest` | RPC conversor (**PREGUNTA**, por el bus): `{project_id, formato, plan\|cuentas, mapeo?\|esquemas_declarables?}` → `{project_id, formato, direccion:'salir', externo, total}`. Traduce el plan canónico al formato externo. No da de alta ni presenta. Responde por `.salir.response`. |

**Sube por evento:** `catalogo-cuentas.buscar.request` (B1) best-effort en `entrar`, para contrastar
lo traducido con el plan declarado (`_contrastar`, `timeout_ms:2000`, en `try/catch`). Nunca import.

### Publishes

| Evento | Cuándo |
|---|---|
| `puerto-plan-contable.entrar.response` / `.entrar.failed` | RPC `entrar`. |
| `puerto-plan-contable.salir.response` / `.salir.failed` | RPC `salir`. |

> **No publica hecho de dominio** (R2).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `entrar` | **PREGUNTA** (bus) | `{project_id, formato, externo, mapeo?, esquemas_declarables?}` | `{project_id, formato, direccion:'entrar', plan, total, adaptador_declarado, escrito:false, contraste_plan, abierto}` | 400 `FORMATO_NO_DECLARADO`; 422 `FORMATO_NO_DECLARABLE`; 400 `INVALID_INPUT` (`externo`) |
| `salir` | **PREGUNTA** (bus) | `{project_id, formato, plan\|cuentas, mapeo?, esquemas_declarables?}` | `{project_id, formato, direccion:'salir', externo, total, adaptador_declarado, escrito:false}` | 400 `FORMATO_NO_DECLARADO`; 422 `FORMATO_NO_DECLARABLE`; 400 `INVALID_INPUT` (`plan`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Campos canónicos de cuenta** (`CAMPOS_CUENTA`): `codigo, nombre, tipo, naturaleza, padre`.
2. **Sin `formato`** (o vacío) → `400 FORMATO_NO_DECLARADO` con `{esquemas_declarables}`.
3. **Resolución del mapeo** (`_mapeoDe`): si `input.mapeo` es objeto se usa; si no, solo se acepta
   el formato canónico (`'canonico'`/`'enki'`) o un formato en `esquemas_declarables` (mapeo
   identidad). Si no → `422 FORMATO_NO_DECLARABLE`.
4. **`entrar`**: `externo` objeto obligatorio. `_cuentasDe` extrae el array de un array directo o de
   `{cuentas}`/`{plan}`. `_aCuenta` traduce cada cuenta: campo ausente → `null` + `faltantes`;
   campos extra → `value.metadatos`.
5. **`abierto`** (en `entrar`): array de `{codigo, faltantes}` por cada cuenta incompleta.
6. **`contraste_plan`**: si hay `project_id`, `_contrastar` sube `catalogo-cuentas.buscar.request` y
   devuelve `{total_plan, nuevas}` (códigos traducidos que no están en el plan declarado), o `null`
   si el bus no responde.
7. **`salir`**: `plan` (o `cuentas`) obligatorio; itera y aplica el mapeo inverso con
   `cu?.[campo] ?? null` (ausente → null).
8. **`escrito:false`** siempre: no da de alta, no presenta.

## Cómo se usa (RPCs)

### 1. entrar — plan externo → canónico

```json
{
  "project_id": "e57a318a-...",
  "formato": "asesor-csv-v1",
  "externo": [ { "Cuenta": "430", "Titulo": "Clientes", "Naturaleza": "D" } ],
  "mapeo": { "codigo": "Cuenta", "nombre": "Titulo", "naturaleza": "Naturaleza" }
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "formato": "asesor-csv-v1", "direccion": "entrar", "plan": [ { "codigo": "430", "nombre": "Clientes", "tipo": null, "naturaleza": "D", "padre": null, "metadatos": {} } ], "total": 1, "adaptador_declarado": true, "escrito": false, "contraste_plan": { "total_plan": 5, "nuevas": [] }, "abierto": [ { "codigo": "430", "faltantes": ["tipo","padre"] } ] }
```

### 2. salir — canónico → externo

```json
{ "project_id": "e57a318a-...", "formato": "canonico", "plan": [ { "codigo": "430", "nombre": "Clientes" } ] }
```
Respuesta `200`: `externo` con los campos mapeados, `escrito:false`.

### Fallo — formato sin mapeo ni canónico

Respuesta `422` + `puerto-plan-contable.entrar.failed` (`FORMATO_NO_DECLARABLE`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 FORMATO_NO_DECLARADO` | falta `formato`. |
| `422 FORMATO_NO_DECLARABLE` | formato sin mapeo y no canónico ni declarado. |
| `400 INVALID_INPUT` (`externo`/`plan`) | el cuerpo a traducir no es objeto. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** `catalogo-cuentas` (B1) — **sube** `catalogo-cuentas.buscar.request` por EVENTO
  (best-effort, para contrastar).
- **Quién la usa:** quien importa/exporta el plan; el alta real la hace `catalogo-cuentas.anadir`.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-libro/puerto-plan-contable/module.json` + `index.js`.
2. Smoke: `entrar` con `formato+mapeo` → 200, `plan` traducido, `contraste_plan`.
3. Sin formato → 400; formato sin mapeo → 422 + `.entrar.failed`.
4. `salir` → `externo` con mapeo inverso.
5. `grep -E '"event"' module.json`.

## Notas de implementación

- Clase `PuertoPlanContable extends ModuloHibridoReflejo`; `name = 'puerto-plan-contable'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless). Constante `CAMPOS_CUENTA`.
- `onEntrarRequest`/`onSalirRequest` delegan en `_atender`; `_entrar` es `async` (por la subida
  best-effort). Helpers `_aCuenta`, `_cuentasDe`, `_contrastar`, `_formato`, `_esquemas`,
  `_mapeoDe`; tools `toolEntrar`/`toolSalir`.
