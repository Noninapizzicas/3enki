---
name: registro-verifactu
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `registro-verifactu` de la vertical contabilidad
  (Enki). La CADENA INALTERABLE de la facturación: registro ENCADENADO donde cada factura emitida
  deja su huella ligada a la huella del eslabón ANTERIOR (huella_anterior). APPEND-ONLY: una vez
  encadenada, una factura no se borra, no se reordena y no se muta; romper la cadena → 409
  CADENA_ROTA. UN SOLO ESCRITOR. Solo se ENCADENA la huella, no el cuerpo de la factura. Publica
  el hecho contabilidad.factura_encadenada. Persiste por proyecto vía PosPersistencia.
when-to-use: >-
  - Cuando necesites encadenar la huella de una factura en el registro inalterable
    (RPC registro-verifactu.encadenar.request).
  - Cuando depures por qué se rechaza (409 CADENA_ROTA si la huella_anterior no liga, o 400
    INVALID_INPUT si falta factura) o por qué no re-encadena (idempotencia por huella).
  - Cuando quieras verificar la integridad de la cadena (helper verificarCadena) o entender su
    hecho contabilidad.factura_encadenada.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, fiscal, verifactu, cadena, huella]
---

# registro-verifactu — CUSTODIO de la cadena inalterable de facturación

## Qué hace el módulo

`registro-verifactu` es un **CUSTODIO CON PERSISTENCIA** (D8, hoja del plan). Es **la CADENA
INALTERABLE de la facturación**: un registro ENCADENADO donde cada factura emitida deja su
huella, **ligada a la huella del eslabón ANTERIOR** (`huella_anterior`).

Registro **APPEND-ONLY**: una vez encadenada, una factura **NO se borra, NO se reordena y NO se
muta**. Romper la cadena (`huella_anterior != ultima_huella`) es corrupción → se rechaza con
`409 CADENA_ROTA`.

**UN SOLO ESCRITOR** de la parcela: este custodio. Ningún otro muta la cadena. Aquí **solo se
ENCADENA la huella**, no el cuerpo de la factura (eso es de `emision-factura-venta` O1).

**Dato ausente = desconocido**: sin factura no hay nada que encadenar (no se inventa un
eslabón). La huella se DECLARA o se deriva de la factura declarada (identidad, no juicio). El
mismo eslabón (misma huella) **no se re-encadena** (idempotente).

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/registro-verifactu`,
archivo `registro-verifactu.json`), restaura en `project.activated` y vuelca en `onUnload`. La op
`encadenar` es **ORDEN** (panel).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `registro-verifactu.encadenar.request` | `onEncadenarRequest` | RPC custodio (**ORDEN**, panel): `{project_id, factura, huella?, huella_anterior?}` → `{project_id, factura, registro, encadenada, total, append_only}`. Encadena la huella de una factura al último eslabón; huella_anterior que no liga → 409 `CADENA_ROTA`; misma huella → no re-encadena. Publica `contabilidad.factura_encadenada`. Responde por `.encadenar.response`. |
| `project.activated` | `onProjectActivated` | Restaura la cadena de facturación del proyecto activado desde el storage. |

> **Nota de deriva (R3):** el plan declara escucha de `contabilidad.factura_emitida`, pero el
> `module.json` real **solo** declara el RPC + `project.activated`. Ningún módulo del repo emite
> aún ese hecho (`emision-factura-venta` O1, de un grupo posterior); declararlo daría cadena colgada.

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.factura_encadenada` | Fire-and-forget (D8): una factura quedó encadenada en el registro inalterable → `{project_id, factura, huella, huella_anterior, posicion, encadenada_en}`. **Solo se publica si `encadenada===true`** (si fue idempotente, NO). Lo exige la administración (integridad de la facturación). |
| `registro-verifactu.encadenar.response` | Respuesta RPC correlada de la op `encadenar`. |
| `registro-verifactu.encadenar.failed` | Fallo determinista: falta `project_id`/`factura` o la cadena está rota (409 `CADENA_ROTA`). |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `encadenar` | **ORDEN** (panel) | `{project_id, factura\|f, huella?, huella_anterior?}` | `{project_id, factura, registro, encadenada, total, append_only}` | 409 `CADENA_ROTA`; 400 `INVALID_INPUT` (`project_id`/`factura`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`; sin factura objeto (`factura`/`f`) →
   `_invalid('factura')`.
2. **`GENESIS`**: el eslabón de origen; la primera factura no tiene huella anterior.
3. **Guard de cadena**: si `input.huella_anterior` viene declarada y **no** es igual a
   `cadena.ultima_huella` → `409 CADENA_ROTA` con `{esperada, recibida}`. La cadena es
   inalterable, no se reordena.
4. **Huella** (`_huella`): declarada (`input.huella` o `factura.huella`) o `sha256` (32 hex) de
   `JSON.stringify({huella_anterior, serie, numero, fecha, total, emisor, receptor})`. **Liga la
   cadena** (incluye la huella anterior en el material).
5. **Idempotencia**: si la huella ya está en la cadena → 200 con `encadenada:false, ya_existe:true`
   (no duplica eslabones, no publica hecho).
6. **Append-only**: nuevo eslabón `{id:'vf_${pid}_${n+1}', posicion, factura, serie, fecha,
   huella, huella_anterior, inmutable:true, encadenada_en}`; `ultima_huella = huella`.
7. **`hidratar`**: reconstruye `ultima_huella` del último registro o `GENESIS`.
8. **`verificarCadena(pid)`** (helper de lectura): recorre la cadena ligando `huella_anterior`
   con la anterior; devuelve `{ok:true, eslabones}` o `{ok:false, rota_en, esperada, recibida}`.

## Cómo se usa (RPC)

### Encadenar una factura

```json
{ "project_id": "e57a318a-...", "factura": { "serie": "A", "numero": "42", "fecha": "2026-10-01", "total": 1210.0, "emisor": "B1", "receptor": "B2" }, "correlation_id": "abc-7" }
```
Respuesta `200` + `contabilidad.factura_encadenada`:
```json
{ "project_id": "e57a318a-...", "factura": { "serie": "A", "numero": "42", "total": 1210.0 }, "registro": { "id": "vf_e57a318a-..._1", "posicion": 1, "factura": "42", "serie": "A", "fecha": "2026-10-01", "huella": "ab12...ef", "huella_anterior": "GENESIS", "inmutable": true, "encadenada_en": "2026-10-01T..." }, "encadenada": true, "total": 1, "append_only": true }
```

### Cadena rota

```json
{ "project_id": "e57a318a-...", "factura": { "numero": "43" }, "huella_anterior": "otra-huella" }
```
Respuesta `409` + `registro-verifactu.encadenar.failed`:
```json
{ "status": 409, "code": "CADENA_ROTA", "mensaje": "la huella_anterior declarada no liga con el ultimo eslabon: el registro es inalterable", "data": { "esperada": "ab12...ef", "recibida": "otra-huella" } }
```

### Re-encadenar la misma factura → idempotente

Misma factura → 200 con `encadenada:false, ya_existe:true`. **No** emite hecho.

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `409 CADENA_ROTA` | `huella_anterior` declarada no liga con la última de la cadena. |
| `400 INVALID_INPUT` (`project_id` / `factura`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` +
  `_shared/pos-persistencia` + `filesystem` + `project-manager` + `crypto`.
- **De quién depende:** el cuerpo de la factura lo emite `emision-factura-venta` (O1); aquí solo
  se encadena su huella.
- **Quién la consume:** la administración exige la integridad del registro; el helper
  `verificarCadena` sirve a la inspección.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-fiscal/registro-verifactu/module.json` + `index.js`.
2. Smoke: `encadenar` → 200 + `contabilidad.factura_encadenada`, `posicion:1`.
3. Segunda factura liga con `huella_anterior` de la primera.
4. `huella_anterior` errónea → `409 CADENA_ROTA` + `.encadenar.failed`.
5. Re-encadenar misma huella → `ya_existe:true`.
6. `verificarCadena(pid)` → `{ok:true}`.
7. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `RegistroVerifactu extends ModuloHibridoReflejo`; `name = 'registro-verifactu'`,
  `version = 'reflejo-0.1.0'`. Store `this._cadenas` (Map `pid → {esquema, registros[],
  ultima_huella}`).
- **PosPersistencia**: `file:'registro-verifactu.json'`, `dir:'/contabilidad/registro-verifactu'`.
- Proyección `_encadenar`; helper `_huella`; lecturas `cadenaDe(pid)` y `verificarCadena(pid)`;
  tool `toolEncadenar`. `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo`.
