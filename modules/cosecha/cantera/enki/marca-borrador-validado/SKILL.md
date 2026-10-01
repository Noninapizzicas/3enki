---
name: marca-borrador-validado
description: >-
  Skill FULL del módulo REFLEJO STATELESS `marca-borrador-validado` de la vertical contabilidad
  (Enki). El SELLO del punto en que está lo que se ve: "en curso" (EN_CURSO) / "revisado"
  (REVISADO) / "firmado" (FIRMADO). Existe para que NO se decida sobre un borrador vivo. El sello
  se DERIVA de los hechos ya ocurridos: `contabilidad.traza_registrada` (traza-asiento B4) → al
  menos REVISADO; `contabilidad.revision_firmada` (flujo-firma L3) → FIRMADO. El sello SOLO sube
  (EN_CURSO < REVISADO < FIRMADO): re-trazar no degrada lo firmado. Dato ausente = desconocido: sin
  hechos vistos → EN_CURSO y borrador vivo. NO escribe, NO persiste (registro derivado en memoria).
when-to-use: >-
  - Cuando necesites saber el sello del punto en que está lo que ves (RPC
    marca-borrador-validado.estado.request).
  - Cuando depures por qué `sello:'EN_CURSO'` con `borrador_vivo:true` (no se vio ningún hecho) o por
    qué un sello no baja tras re-trazar.
  - Cuando quieras entender su contrato de eventos: es reflejo, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, analitica, sello, borrador, validacion]
---

# marca-borrador-validado — REFLEJO del sello del borrador

## Qué hace el módulo

`marca-borrador-validado` es un **REFLEJO STATELESS** (Q4, hoja del plan). Es el **SELLO del punto
en que está lo que se ve**: "en curso" (`EN_CURSO`) / "revisado" (`REVISADO`) / "firmado"
(`FIRMADO`). Existe para que **NO se decida sobre un borrador vivo**: quien lee una cifra sabe si
está mirando hierro o un documento a medio hacer.

El sello se **DERIVA** de los hechos ya ocurridos, sin recálculo de dominio:
- `contabilidad.traza_registrada` (`traza-asiento` B4) → hay asiento trazado → al menos `REVISADO`.
- `contabilidad.revision_firmada` (`flujo-firma` L3) → el asesor firmó → `FIRMADO`.

El reflejo **NO impone** la marca: la **acumula** a partir de los hechos que ESCUCHA y la DECLARA.

Invariantes:
- **Dato ausente = desconocido**: sin ningún hecho visto, el sello es `EN_CURSO` y se declara
  `borrador_vivo:true` (no se inventa una validación).
- **NUNCA degrada**: una vez firmado, re-trazar no lo baja a `revisado`; el sello **SOLO sube**
  (`ORDEN_SELLO`: EN_CURSO < REVISADO < FIRMADO).
- **NO escribe dominio, NO persiste**; su registro de sellos es un **DERIVADO en memoria**.

**Escucha** (R3, ambos con emisor vivo): `contabilidad.traza_registrada` (B4) y
`contabilidad.revision_firmada` (L3). RPC **PREGUNTA** → sin `ui_handlers`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `marca-borrador-validado.estado.request` | `onEstadoRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id, clave\|referencia}` → `{project_id, clave, sello, validado, borrador_vivo, firmado}`. Devuelve el sello del punto en que está lo que se ve; sin hechos vistos → `EN_CURSO` y `borrador_vivo:true`. Responde por `.estado.response`. |
| `contabilidad.traza_registrada` | `onTrazaRegistrada` | **Fire-and-forget** (lo emite `traza-asiento` B4): un asiento quedó trazado → **sube** el sello a `REVISADO` (nunca lo baja). No responde. |
| `contabilidad.revision_firmada` | `onRevisionFirmada` | **Fire-and-forget** (lo emite `flujo-firma` L3): el asesor firmó → **sube** el sello a `FIRMADO` (nunca lo baja). No responde. |

> Nota: el plan dice que "sube" `traza-asiento.registrar.request` y `flujo-firma.estado.request`,
> pero el `module.json` real **no** declara esos envíos; el código **escucha** sus hechos en su lugar.

### Publishes

| Evento | Cuándo |
|---|---|
| `marca-borrador-validado.estado.response` | Respuesta RPC correlada de la op `estado`. |
| `marca-borrador-validado.estado.failed` | Fallo determinista: falta `project_id` o `clave`. |

> **No publica hecho de dominio** (R2).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `estado` | **PREGUNTA** (bus) | `{project_id, clave\|referencia}` | `{project_id, clave, sello, validado, borrador_vivo, firmado, firmado_por?, visto_en?, abierto}` | 400 `INVALID_INPUT` (`project_id`/`clave`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`; sin `clave` (ni `referencia`) →
   `_invalid('clave')`.
2. **Sin sello registrado** → `sello:'EN_CURSO', validado:false, borrador_vivo:true, firmado:false`,
   `abierto.validacion` declarado.
3. **Con sello** → `sello` vigente, `validado = sello !== 'EN_CURSO'`, `borrador_vivo:false`,
   `firmado = sello === 'FIRMADO'`, `firmado_por`, `visto_en`.
4. **`_subirSello(pid, clave, sello, d)`**: `nuevo = ORDEN_SELLO[sello] > ORDEN_SELLO[actual.sello] ?
   sello : actual.sello` → **el sello solo sube**. `en` = `d.en` o `now`; `firmado_por` se fija al
   firmar (`d.firmado_por` o `d.revision.firmado_por`), y se conserva en lo demás.
5. **`_claveDe(d)`** (el hecho): `clave`/`referencia`/`asiento_id`/`revision.clave`. Sin clave → se
   ignora el hecho (no se inventa la clave).
6. **Handlers de dominio**: envueltos en `try/catch` con `logger.error`.
7. **Lectura directa** `sellosDe(pid)` (derivado, no muta): pares `{clave, sello, en, firmado_por}`.

## Cómo se usa (RPC + eventos)

### 1. Hecho trazado → sube a REVISADO

`traza-asiento` publica `contabilidad.traza_registrada` con `{project_id, asiento_id, traza,
registrada}` → `onTrazaRegistrada` sube el sello de esa clave a `REVISADO`.

### 2. Firma → sube a FIRMADO

`flujo-firma` publica `contabilidad.revision_firmada` con `{project_id, clave, revision, firmada,
estado}` → `onRevisionFirmada` sube el sello a `FIRMADO`.

### 3. Consultar el sello

```json
{ "project_id": "e57a318a-...", "clave": "rev-2026-Q3" }
```
Respuesta `200` (tras firma):
```json
{ "project_id": "e57a318a-...", "clave": "rev-2026-Q3", "sello": "FIRMADO", "validado": true, "borrador_vivo": false, "firmado": true, "firmado_por": "asesor@despacho", "visto_en": "2026-10-01T...", "abierto": { "validacion": null } }
```

### 4. Sin hechos vistos → borrador vivo

Respuesta `200`: `{sello:'EN_CURSO', validado:false, borrador_vivo:true, firmado:false,
abierto:{validacion:'no se ha visto ningun hecho (traza/firma) para esta clave: sigue siendo un
borrador vivo'}}`.

### Fallo — sin clave

Respuesta `400` + `marca-borrador-validado.estado.failed` (`INVALID_INPUT`, field `clave`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`/`clave`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** `traza-asiento` (B4) y `flujo-firma` (L3) — **escucha** sus hechos
  (`contabilidad.traza_registrada`, `contabilidad.revision_firmada`).
- **Quién la usa:** quien lee una cifra y necesita saber si es hierro o borrador vivo.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-analitica/marca-borrador-validado/module.json` + `index.js`.
2. Smoke: tras `contabilidad.traza_registrada` → `sello:'REVISADO'`; tras
   `contabilidad.revision_firmada` → `FIRMADO`.
3. Monotonía: una traza posterior a la firma **no** baja de `FIRMADO`.
4. Sin hechos → `EN_CURSO, borrador_vivo:true`.
5. `grep -E '"event"' module.json`.

## Notas de implementación

- Clase `MarcaBorradorValidado extends ModuloHibridoReflejo`; `name = 'marca-borrador-validado'`,
  `version = 'reflejo-0.1.0'`. **Sin PosPersistencia**, con registro DERIVADO en memoria
  `this._sellos` (Map `pid → Map<clave, {sello, en, firmado_por}>`). No se restaura entre reinicios.
- Constante `ORDEN_SELLO = {EN_CURSO:0, REVISADO:1, FIRMADO:2}`.
- Handlers `onTrazaRegistrada`/`onRevisionFirmada` (dominio) y `onEstadoRequest` (RPC). Proyección
  `_estado`; helpers `_subirSello`, `_claveDe`; lectura `sellosDe(pid)`; tool `toolEstado`.
