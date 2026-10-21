---
name: padron-terceros
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `padron-terceros` de la vertical contabilidad
  (Enki). Identidad ÚNICA por número fiscal: un proveedor escrito de tres formas sigue siendo
  UNO. Es la faceta de identidad del maestro (N1 maestro-terceros): un solo maestro con roles.
  UN solo escritor (guard rol MAESTRO_TERCEROS; segundo escritor → 403). No se borra: unificar
  SUMA (las formas escritas se apilan como variantes append-only; la canónica solo se completa).
  NIF normalizado mecánicamente (mayúsculas, sin separadores), sin validar contra ninguna ley.
  Publica el hecho contabilidad.tercero_unificado. Persiste por proyecto vía PosPersistencia.
when-to-use: >-
  - Cuando necesites unificar la identidad de un tercero por su número fiscal
    (RPC padron-terceros.unificar.request).
  - Cuando depures por qué se rechaza (403 PERMISSION_DENIED si el rol no es MAESTRO_TERCEROS,
    400 INVALID_INPUT si falta el NIF) o cómo se acumulan las variantes de nombre.
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.tercero_unificado.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, entrada, terceros, identidad, nif]
---

# padron-terceros — CUSTODIO de la identidad única por número fiscal

## Qué hace el módulo

`padron-terceros` es un **CUSTODIO CON PERSISTENCIA** (N2, hoja del plan). Garantiza la
**identidad ÚNICA por número fiscal**: un proveedor escrito de tres formas sigue siendo UNO. Es
la faceta de **identidad** del mismo maestro que `maestro-terceros` (N1): un solo maestro con
roles.

Invariantes:
- **UN escritor por parcela**: el guard exige `rol === 'MAESTRO_TERCEROS'`; el segundo escritor
  es rechazado (`403`).
- **No se borra: unificar SUMA.** Las formas escritas se apilan como `variantes` (append-only);
  la identidad canónica solo se **completa**, nunca se pierde historia.
- **Dato ausente = desconocido**: un campo que no llega queda `null`, no se estima.
- **Normalización mecánica del NIF**: `_normalizaNif` pasa a mayúsculas y quita
  `[\s.\-_/]`; **no valida contra ninguna ley** (eso sería una constante legal cableada).

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/padron-terceros`, archivo
`padron-terceros.json`), restaura en `project.activated` y vuelca en `onUnload`. Emite
`contabilidad.tercero_unificado` en éxito y su par `*.unificar.failed` en rechazo.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `padron-terceros.unificar.request` | `onUnificarRequest` | RPC custodio (**ORDEN**, panel): `{project_id, rol:'MAESTRO_TERCEROS', tercero{nombre?, nif\|numero_fiscal, roles?}}` → `{project_id, tercero, creada}`. Guard de escritor. Identifica el tercero por su NIF normalizado: crea la identidad o SUMA la variante escrita (append-only). Publica `contabilidad.tercero_unificado` y responde por `.unificar.response`. Sin NIF/tercero → `.unificar.failed`. |
| `project.activated` | `onProjectActivated` | Restaura el padrón del proyecto activado desde el storage. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.tercero_unificado` | Fire-and-forget (N2): una identidad de tercero quedó unificada por su número fiscal → `{project_id, tercero, creada}`. Lo consume `maestro-terceros` (N1) para completar el maestro. |
| `padron-terceros.unificar.response` | Respuesta RPC correlada de la op `unificar`. |
| `padron-terceros.unificar.failed` | Fallo determinista: rol ≠ MAESTRO_TERCEROS, falta el NIF o tercero inválido. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `unificar` | **ORDEN** (panel) | `{project_id, rol:'MAESTRO_TERCEROS', tercero\|t}` | `{project_id, tercero, creada}` | 403 `PERMISSION_DENIED`; 400 `INVALID_INPUT` (`project_id`/`tercero`/`tercero.nif`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Guard de escritor**: `input.rol === 'MAESTRO_TERCEROS'` (`ROL_ESCRITOR`). Otro rol →
   `403 PERMISSION_DENIED` con `{rol_esperado, rol_recibido}`.
2. **Tercero obligatorio**: `input.tercero`/`input.t` objeto → si no, `_invalid('tercero')`.
3. **NIF obligatorio**: `_normalizaNif(t.nif ?? t.numero_fiscal)`; si vacío →
   `_invalid('tercero.nif')`.
4. **Normalización mecánica**: mayúsculas + strip de `[\s.\-_/]`; sin validación legal.
5. **Identidad nueva** → crea `{nif, nombre_canonico, variantes, roles, condiciones:null,
   creada_en, actualizada_en}`; `creada:true`. El nombre entra como primera variante.
6. **Identidad existente** → unificar SUMA (append-only):
   - el nombre escrito se **apila** en `variantes` si es nuevo;
   - `nombre_canonico` solo se rellena si estaba `null` (nunca se sobrescribe);
   - los `roles` se **unen** (Set);
   - `actualizada_en` se refresca.
   Devuelve `creada:false`.
7. **`condiciones:null`**: desconocido, no se estima.
8. **Lectura directa** `identidadDe(pid, nif)` (no muta), normalizando el NIF consultado.

## Cómo se usa (RPC)

### Crear/unificar un tercero

```json
{
  "project_id": "e57a318a-...",
  "rol": "MAESTRO_TERCEROS",
  "tercero": { "nombre": "Proveedor S.L.", "nif": "B-12.345.678", "roles": ["proveedor"] },
  "correlation_id": "abc-4"
}
```
Respuesta `200` + `contabilidad.tercero_unificado`:
```json
{ "project_id": "e57a318a-...", "tercero": { "nif": "B12345678", "nombre_canonico": "Proveedor S.L.", "variantes": ["Proveedor S.L."], "roles": ["proveedor"], "condiciones": null, "creada_en": "2026-10-01T...", "actualizada_en": "2026-10-01T..." }, "creada": true }
```

### Segunda forma escrita (mismo NIF) → suma variante

```json
{ "project_id": "e57a318a-...", "rol": "MAESTRO_TERCEROS", "tercero": { "nombre": "PROVEEDOR SL", "nif": "b12345678" } }
```
Respuesta `200`: `creada:false`, `variantes:["Proveedor S.L.","PROVEEDOR SL"]`,
`nombre_canonico` intacto.

### Fallo — rol inválido

```json
{ "project_id": "e57a318a-...", "rol": "MOTOR_COBRO", "tercero": { "nif": "B12345678" } }
```
Respuesta `403` + `padron-terceros.unificar.failed`:
```json
{ "status": 403, "code": "PERMISSION_DENIED", "mensaje": "solo el escritor del maestro (MAESTRO_TERCEROS) puede unificar identidades", "rol_esperado": "MAESTRO_TERCEROS", "rol_recibido": "MOTOR_COBRO" }
```

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `403 PERMISSION_DENIED` | `rol !== 'MAESTRO_TERCEROS'`. |
| `400 INVALID_INPUT` (`project_id`) | falta `project_id`. |
| `400 INVALID_INPUT` (`tercero`) | no viene tercero objeto. |
| `400 INVALID_INPUT` (`tercero.nif`) | NIF ausente o vacío tras normalizar. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` +
  `_shared/pos-persistencia` + `filesystem` + `project-manager`.
- **De quién depende:** ninguna escucha declarada.
- **Quién la consume:** `maestro-terceros` (N1) lee `contabilidad.tercero_unificado` para
  completar el maestro. Es la faceta de identidad del mismo maestro.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-entrada/padron-terceros/module.json` + `index.js`.
2. Smoke: `unificar` con rol `MAESTRO_TERCEROS` → 200 + `contabilidad.tercero_unificado`.
3. NIF normalizado: `B-12.345.678` → `B12345678`.
4. Segunda forma → `creada:false`, variante apilada, canónico intacto.
5. Rol inválido → 403 + `.unificar.failed`.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `PadronTerceros extends ModuloHibridoReflejo`; `name = 'padron-terceros'`,
  `version = 'reflejo-0.1.0'`. Store `this._padrones` (Map `pid → {esquema, identidades:
  Map<nif, Tercero>}`).
- **PosPersistencia**: `file:'padron-terceros.json'`, `dir:'/contabilidad/padron-terceros'`.
  `hidratar` reconstruye el `Map` por `nif`.
- Proyección `_unificar`; helpers `_normalizaNif`, `_roles`; lectura directa `identidadDe`; tool
  `toolUnificar`. `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo`.
