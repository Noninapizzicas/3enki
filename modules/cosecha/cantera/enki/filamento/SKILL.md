---
name: filamento
description: >
  Skill FULL del módulo CUSTODIO `filamento` del proyecto 3D (taller de impresión 3D,
  una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE). Gestiona el stock
  de bobinas de filamento por proyecto: registrar, descontar (SOLO por gramo MEDIDO del
  historial, cero estimación), cambiar bobina y evaluar el umbral de reposición (avisa,
  no decide). Úsala para operar, depurar o extender el custodio del filamento, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites registrar una bobina, descontar stock tras una impresión medida,
    cambiar la bobina en uso o evaluar el umbral de reposición.
  - Cuando depures por qué no se descuenta (falta gramo medido), no se encuentra la bobina
    o el aviso material.bajo no se emite al cruzar el umbral.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes: material.actualizado,
    material.bajo) y las reglas de negocio del stock de filamento.
  - Cuando vayas a escribir/ampliar el test unitario del custodio del filamento.
tags: [enki, modulo, custodio, impresora-3d, filamento, stock, proyecto-3d]
---

# filamento — CUSTODIO del stock de bobinas del taller 3D

## Qué hace el módulo

`filamento` es un **CUSTODIO** (dueño del store y de la persistencia): es el **único
escritor** del store `bobinas` por proyecto (vía `PosPersistencia`, `/3d/filamento` ,
`filamento.json`, single-file, scope project, single-writer).

Cada bobina guarda `gramos_total`, `gramos_restantes`, `material`, `color` y `enUso`.
Las operaciones: **registrar** bobina, **descontar** stock (SOLO con gramo MEDIDO del
historial, CERO estimación), **cambiar** bobina en uso y **evaluar** el umbral de
reposición.

Es un **CUSTODIO sin juicio**: el **umbral de reposición es decisión del dueño** (ABIERTO).
Cuando se cruza el umbral, `_evaluarUmbral` **avisa** (emite `material.bajo`) pero
**nunca decide ni encarga** la reposición. Soporta varios materiales (hoy `PETG`).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `filamento.registrar.request` | `onRegistrarRequest` | Registra una bobina nueva con su gramos_total y gramos_restantes. Emite `material.actualizado`. |
| `filamento.descontar.request` | `onDescontarRequest` | Decrementa el stock solo con gramo MEDIDO del historial (cero estimación). Emite `material.actualizado` y `material.bajo` si cruza umbral. |
| `filamento.cambiar.request` | `onCambiarRequest` | Cambia la bobina en uso (pone `enUso` en otra o nueva). Emite `material.actualizado`. |
| `filamento.evaluar.request` | `onEvaluarRequest` | Evalúa el umbral de reposición de las bobinas; si alguna cruza, emite `material.bajo` (avisa, no decide). |
| `project.activated` | `onProjectActivated` | Restaura el store del proyecto activado (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `filamento.registrar.response` | Respuesta correlada: bobina registrada. |
| `filamento.descontar.response` | Respuesta correlada: bobina decrementada. |
| `filamento.cambiar.response` | Respuesta correlada: bobina en uso cambiada. |
| `filamento.evaluar.response` | Respuesta correlada: resultado de la evaluación de umbrales. |
| `material.actualizado` | Cambio de bobina o consumo: estado del material actualizado. |
| `material.bajo` | Se cruzó el umbral de reposición (resta < umbral): aviso, NO decide. |
| `filamento.descontar.failed` | Par de fallo: no se pudo descontar (sin gramo medido o bobina inexistente). |
| `filamento.cambiar.failed` | Par de fallo: no se pudo cambiar la bobina. |

> **Regla de cierre de círculo**: los pares de fallo canónicos son
> `filamento.descontar.failed` y `filamento.cambiar.failed`; responden en
> `filamento.<accion>.response`.

## Reglas de negocio

1. **CERO estimación sin dato MEDIDO (honestidad M11)**: `_descontar` exige
   `gramos_medido` (gramo de la impresión real del historial). Si falta, es `NaN` o `<= 0`
   → `400 INVALID_INPUT` (`'gramos_medido (dato MEDIDO del historial) requerido'`) +
   `filamento.descontar.failed` con `motivo: 'sin_gramo_medido'`. **Nunca se conjetura**.
2. **Bobina para descontar**: se localiza por `bobina_id`/`id`, o por `material`
   (prefiriendo la `enUso`), o la única `enUso`. Si no hay bobina → `404 NOT_FOUND` +
   `filamento.descontar.failed` con `motivo: 'bobina_no_encontrada'`.
3. **`gramos_restantes` nunca baja de 0**: `Math.max(0, restantes)`.
4. **Umbral avisa, NO decide**: `_descontar` y `_evaluarUmbral` emiten `material.bajo`
   cuando `gramos_restantes < umbralRepos`, pero el umbral es decisión del dueño y solo se
   evalúa si está fijado (`umbralRepos != null`); sin umbral fijado no se evalúa (no se
   inventa). `_evaluarUmbral` reporta `{ evaluadas, bajas }`.
5. **`_cambiarBobina`**: pone `enUso` en la bobina (default true) y puede rellenar de gramo
   (si el dueño lo declara). No hay reposición automática.
6. **`_registrarBobina`**: `gramos_total` obligatorio; si no se indica `gramos_restantes` se
   asume igual al total (bobina llena, honesto). Material default `PETG`.
7. **Single-writer por proyecto**: `PosPersistencia` `filamento.json` en `/3d/filamento`,
   hidrata/restaura por `project_id` en `project.activated`, `flush()` en `onUnload`.

## Uso / cómo invocarlo

RPCs request/response que responden en `*.response`:

### 1. `registrar` — alta de una bobina

```json
{
  "project_id": "e57a318a-...",
  "gramos_total": 1000,
  "material": "PETG",
  "color": "negro",
  "umbral_repos": 200,
  "enUso": true
}
```
Respuesta `201`: `{ "bobina": {...} }`. Emite `material.actualizado` (`accion: 'registrada'`).

### 2. `descontar` — decrementar stock por gramo MEDIDO del historial

```json
{ "project_id": "e57a318a-...", "bobina_id": "bob_xxx", "gramos_medido": 3.42 }
```
Respuesta `200`: `{ "bobina": {...}, "gramos_descontados": 3.42, "bajo_umbral": false }`.
Si cruza el umbral → emite además `material.bajo`.

### 3. `cambiar` — cambiar la bobina en uso

```json
{ "project_id": "e57a318a-...", "bobina_id": "bob_yyy", "en_uso": true }
```
Respuesta `200`: `{ "bobina": {...} }`. Emite `material.actualizado` (`accion: 'cambio_bobina'`).

### 4. `evaluar` — evaluar umbrales de reposición del proyecto

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`: `{ "evaluadas": N, "bajas": [ ... ] }`. Emite un `material.bajo` por cruce.

## Tests

El test vive en `tests/unit/filamento.test.js`. Cubre:

- `registrar` crea bobina (`201`) y emite `material.actualizado`; sin `gramos_total` → 400;
  sin `gramos_restantes` se asume igual al total.
- `descontar` con `gramos_medido` ok → `200`, disminuye `gramos_restantes`, emite
  `material.actualizado`; sin `gramos_medido` → `400` + `filamento.descontar.failed`
  (`sin_gramo_medido`); sin bobina → `404` + `failed` (`bobina_no_encontrada`).
- `descontar` al cruzar umbral → emite `material.bajo` (avisa, no decide).
- `cambiar` cambia `enUso` y emite `material.actualizado`; bobina inexistente → 404.
- `evaluar` solo emite `material.bajo` para bobinas con umbral fijado y bajo él.
- Persistencia por proyecto (`project.activated` restaura; `onUnload` flush).

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/filamento
node tests/unit/filamento.test.js
# esperado: filamento: N/N OK
```

> En el runtime real esto corrió desde `/opt/enki/modules/filamento`; en este repo, el test
> se ejecuta desde `modules/filamento`.

## Notas de implementación

- Clase `FilamentoReflejo extends ModuloHibridoReflejo`; `name = 'filamento'`,
  `version = 'reflejo-0.1.0'`.
- Store en `this.bobinas` (`Map` `${project_id}:${id}` → bobina); `PosPersistencia`
  `filamento.json` en `/3d/filamento`.
- Handlers RPC de una línea que delegan en `_atender(e, accion, 'filamento.<accion>.response', fn)`.
- `_findBobina` resuelve por id, material (prefiriendo enUso) o la única enUso.
- `_publicarEvento`/`eventBus.publish` añade `timestamp` ISO a los eventos publicados.
- DEP en plan: `historial` (dato MEDIDO para descontar) y `adaptador-avisos`.
