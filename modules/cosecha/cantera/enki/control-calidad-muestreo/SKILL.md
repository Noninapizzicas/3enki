---
name: control-calidad-muestreo
description: >-
  Skill FULL del módulo REFLEJO STATELESS `control-calidad-muestreo` de la vertical
  contabilidad (Enki). Selecciona lo que exige OJO HUMANO por SEÑALES DURAS: la
  regla es EXCEPCION + MUESTRA, NO revisar todo (revisa_todo:false). Excepción =
  señal estructural (rectificativo/ajuste/descuadre/cuenta_sin_declarar/
  fuera_de_periodo) o importe por encima del umbral; muestra = fracción del resto
  elegida por hash DETERMINISTA. Umbrales declarables. No escribe, no persiste; su
  cara es el bus.
when-to-use: >-
  - Cuando necesites seleccionar qué asientos exigen revisión humana (RPC
    control-calidad-muestreo.seleccionar.request).
  - Cuando depures por qué se usaron los umbrales por defecto (abierto.umbrales_
    declarados) o un 400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y las
    señales duras.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, libro, control-calidad, muestreo, determinista, auditoria]
---

# control-calidad-muestreo — REFLEJO STATELESS del muestreo de control de calidad

## Qué hace el módulo

`control-calidad-muestreo` es un **REFLEJO STATELESS** (L8, hoja del plan):
selecciona lo que exige **OJO HUMANO** por **SEÑALES DURAS**. La regla que lo
define es **EXCEPCIÓN + MUESTRA, NO revisar todo** (`revisa_todo:false`). Revisar
cada asiento no escala y entrena a mirar sin ver; este módulo **elige qué mirar**,
no revisa.

- **Excepción**: una señal estructural (`rectificativo`, `ajuste`, `descuadre`,
  `cuenta_sin_declarar`, `fuera_de_periodo`) **o** un importe por encima del umbral
  declarable.
- **Muestra**: una fracción del resto elegida por **hash DETERMINISTA** (mismo
  input + mismos umbrales → misma selección).

Los umbrales (`reglas:UmbralDeMuestreo`) son **declarables**; si no vienen, se usan
**defaults Y se declara en `abierto`** (no se finge que fueron declarados). No
escribe, no persiste. Su op es **CLASE PREGUNTA** → va por el bus, sin panel.
Publica `control-calidad-muestreo.seleccionar.response` y su par `.failed`. Escucha
`contabilidad.asiento_asentado` (B2) y `contabilidad.contrapartida_regla_declarada`
(A6.2).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `control-calidad-muestreo.seleccionar.request` | `onSeleccionarRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, asientos?, umbral_importe?, fraccion_muestra?}` → `{project_id, excepciones, muestra, num_revisar, umbrales, determinista, abierto}`. Selecciona por señal dura + muestra determinista del resto. Responde por `control-calidad-muestreo.seleccionar.response`. Payload inválido → `control-calidad-muestreo.seleccionar.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 escritor-diario): un asiento quedó en el libro. Se observa (ventana acotada) para poder muestrearlo; no se recalcula nada ni se escribe. |
| `contabilidad.contrapartida_regla_declarada` | `onContrapartidaReglaDeclarada` | Fire-and-forget (A6.2 regla-contrapartida): una regla de contrapartida quedó declarada/cambió de estado. Se registra la marca (conviene mirar los asientos que la usan); no se decide por ella. |

### Publishes

| Evento | Descripción |
|---|---|
| `control-calidad-muestreo.seleccionar.response` | Respuesta RPC correlada de la op `seleccionar` (una sola cara: el bus). |
| `control-calidad-muestreo.seleccionar.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `seleccionar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `seleccionar` | **PREGUNTA** (bus) | `{project_id, asientos?, umbral_importe?, fraccion_muestra?}` | `{project_id, excepciones, muestra, num_asientos, num_excepciones, num_muestra, num_revisar, revisa_todo:false, umbrales, determinista, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `control-calidad-muestreo.seleccionar` (`toolSeleccionar` →
`_seleccionar`).

## Reglas de negocio

1. **Señales duras (const `SENALES_DURAS`)**: `['rectificativo', 'ajuste',
   'descuadre', 'cuenta_sin_declarar', 'fuera_de_periodo']` — cuando el asiento
   trae `true` en cualquiera, va a **excepción**. No son juicios de negocio: son
   marcas estructurales.
2. **Importe alto**: si la suma del debe (`suma_debe` o la suma de las líneas) es
   `>= umbral` → señal `importe_alto`.
3. **Umbrales declarables con defaults**: `UMBRAL_IMPORTE = 10000`,
   `FRACCION_MUESTRA = 0.05`. Si no se declaran (`umbral_importe`,
   `fraccion_muestra`), se usan y **se declara en `abierto.umbrales_declarados`** que
   NO fueron declarados (son sustituibles).
4. **Muestra determinista**: `n = ceil(resto * clamp(fraccion, 0, 1))`; se ordena el
   resto por `sha1(clave|umbral|fraccion)` y se toman los `n` primeros. **Mismo
   input → misma muestra.**
5. **`revisa_todo:false`**: el propósito del módulo; nunca selecciona todo.
6. **Sin asientos**: si no hay asientos declarados ni observados →
   `num_revisar:0` con `abierto.asientos` (no se inventa la cola de revisión).
7. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
8. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `seleccionar` — qué mirar (excepción + muestra)

```json
{
  "project_id": "e57a318a-...",
  "umbral_importe": 5000,
  "fraccion_muestra": 0.1,
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "excepciones": [ { "asiento": { "numero": 7, "rectificativo": true, "lineas": [...] }, "senales": ["rectificativo"] } ], "muestra": [ { "numero": 3, ... } ], "num_asientos": 20, "num_excepciones": 1, "num_muestra": 2, "num_revisar": 3, "revisa_todo": false, "umbrales": { "importe": 5000, "fraccion_muestra": 0.1 }, "determinista": true, "abierto": { "umbrales_declarados": null } }
```
Si no se declaran umbrales, `abierto.umbrales_declarados` explica que se usaron los
defaults.

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `200 {abierto.umbrales_declarados}` — se usaron defaults (no un error: honestidad).
- `200 {num_revisar:0, abierto.asientos}` — nada que seleccionar (no se inventa cola).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2 `escritor-diario`),
  `contabilidad.contrapartida_regla_declarada` (A6.2 `regla-contrapartida`).
- **Hacia delante**: su selección alimenta la cola de revisión;
  `aviso-revision` (A8.2) y `motor-avisos` (K2) empujan avisos cuando hay excepciones.
- No escribe: selector puro.

## Verificación

- **Fichero**: `modules/contabilidad-libro/control-calidad-muestreo/` (clase
  `ControlCalidadMuestreo extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "contrapartida_regla_declarada" module.json index.js`.
- **Test unitario**: un asiento con `rectificativo:true` → excepción; importe ≥
  umbral → señal `importe_alto`; misma entrada → misma muestra (determinista); sin
  asientos → `num_revisar:0` + `abierto.asientos`.

## Notas de implementación

- Stateless: sin `PosPersistencia`. Ventana observada en memoria `this._ultimo`
  (máx. 500) y `this._reglas_marcadas` (máx. 500).
- `onSeleccionarRequest` delega en `_atender(...)`; si status ≠ 200 publica el par
  `.failed`.
- Helpers: `_seleccionar`, `_senalesDuras`, `_sumaLineas`, `_claveDe`, `_hash`
  (sha1), `toolSeleccionar`.
