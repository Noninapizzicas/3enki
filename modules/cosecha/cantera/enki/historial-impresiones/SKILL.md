---
name: historial-impresiones
description: >-
  Módulo CUSTODIO del proyecto 3D: registro append-only de impresiones pasadas
  del taller (fecha, modelo, material, filamento usado, tiempo, resultado). Es
  la memoria del taller — cada impresion.completada del ciclo de impresión se
  registra como entrada inmutable. Huecos de datos quedan como 'desconocido'
  (invariante 5: dato ausente nombrado, nunca inventado). Single-writer de su
  store por proyecto vía PosPersistencia.
when-to-use: >-
  Cuando necesites registrar una impresión pasada del taller 3D, listar el
  historial de impresiones (más reciente primero), o entender cómo el ciclo de
  impresión persiste cada impresion.completada como entrada inmutable. Úsalo
  también para diagnosticar el historial de un proyecto (qué se imprimió,
  cuándo, con qué material y resultado).
tags: [enki, 3d, custodio, historial, impresiones, append-only, reflejo]
---

# 3D · historial-impresiones

> **Qué es.** CUSTODIO (reflejo JS puro, determinista) del historial de
> impresiones del taller de impresión 3D. Registro **append-only** de
> impresiones pasadas: fecha, modelo, material, filamento usado, tiempo y
> resultado. Es la **memoria del taller**: cada `impresion.completada` del
> ciclo de impresión se registra aquí como entrada **inmutable** (nunca se
> edita ni borra). Si faltan datos (p.ej. tiempo exacto), el hueco queda como
> `desconocido` — nunca se inventa.
>
> Tipo: **CUSTODIO** (single-writer de su store por proyecto).
>
> Código: `modules/historial-impresiones/index.js` · v0.1.0

---

## 1 · LÓGICA

**Rol en el sistema.** El taller imprime una pieza a la vez (cuello de botella:
la impresora SPARKX i7). El orquestador `ciclo-impresion` detecta el fin de
cada impresión y emite `impresion.completada`. Este módulo la escucha y la
persiste como entrada del historial. El dueño consulta el historial por RPC
(`historial.listar.request`) para ver qué se ha impreso.

**Append-only.** El store es un array por proyecto. Cada registro es inmutable:
se añade al frente (`unshift`) con un `id` UUID único y un sello `registrado_en`.
No existe operación de edición ni borrado. El orden de lectura es **más reciente
primero**.

**Huecos como `desconocido`.** Todo campo opcional ausente se rellena con el
valor canónico `desconocido` (invariante 5 del plan: *dato ausente nombrado,
nunca inventado*). Aplica a `modelo_nombre`, `material`, `filamento_usado`,
`tiempo` y `resultado`.

**Persistencia.** PosPersistencia por proyecto, fichero `historial-impresiones.json`
en `3d/historial-impresiones/`. `onProjectActivated` restaura el store del
proyecto; `onUnload` hace flush. Depende de `filesystem` (`fs.*.request`).

**Estructura del registro:**

```json
{
  "id": "uuid",
  "project_id": "e57a318a-...",
  "modelo_id": "m1",
  "modelo_nombre": "Soporte",
  "material": "PLA",
  "filamento_usado": "12.5",
  "tiempo": "2h 15m",
  "resultado": "completada",
  "fecha": "2026-09-06T22:56:00.000Z",
  "registrado_en": "2026-09-06T22:56:00.000Z"
}
```

---

## 2 · RPCs (request/response)

### `historial.registrar.request` → `historial.registrar.response`

Registra una impresión pasada (append-only). Lo llama `ciclo-impresion`.

**Request:**
```json
{
  "project_id": "e57a318a-...",
  "modelo_id": "m1",
  "modelo_nombre": "Soporte",
  "material": "PLA",
  "filamento_usado": "12.5",
  "tiempo": "2h 15m",
  "resultado": "completada"
}
```
Solo `project_id` y `modelo_id` son obligatorios; el resto, si falta, queda como
`desconocido`.

**Response 200:**
```json
{ "status": 200, "data": { "project_id": "e57a318a-...", "id": "uuid", "registrado": true } }
```

**Errores:**
- `400 INVALID_INPUT` — falta `project_id` (mensaje `project_id requerido`).
- `400 INVALID_INPUT` — falta `modelo_id` (mensaje `modelo_id requerido`). Además
  emite el par de fallo `historial.registrar.failed` con `motivo: modelo_id_requerido`.

### `historial.listar.request` → `historial.listar.response`

Lista el historial del proyecto, **más reciente primero**. Lo llama el dueño.

**Request:**
```json
{ "project_id": "e57a318a-..." }
```

**Response 200:**
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "registros": [ { "id": "uuid", "modelo_id": "m1", "material": "PLA", "resultado": "completada", "..." : "..." } ],
    "total": 1
  }
}
```
Proyecto sin historial → `total: 0`, `registros: []` (no es error).

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo | Payload |
|---|---|---|
| `historial.impresion_registrada` | Tras registrar una impresión (por RPC o por `impresion.completada`) | `{ project_id, id, modelo_id, resultado, timestamp }` |
| `historial.registrar.failed` | Fallo al registrar (datos inválidos: falta `modelo_id`). Par canónico de `historial.registrar.request` | `{ project_id, motivo, timestamp }` |

### Escucha

| Evento | Handler | Qué hace |
|---|---|---|
| `historial.registrar.request` | `onRegistrarRequest` | Delega en `_registrar` (append-only) |
| `historial.listar.request` | `onListarRequest` | Delega en `_listar` (más reciente primero) |
| `impresion.completada` | `onImpresionCompletada` | Fire-and-forget: registra la impresión y emite `historial.impresion_registrada` |
| `project.activated` | `onProjectActivated` | Restaura el store persistido del proyecto |

**Fire-and-forget `impresion.completada`** — payload que consume:
```json
{
  "project_id": "e57a318a-...",
  "modelo_id": "m5",
  "modelo_nombre": "Engranaje",
  "material": "PLA",
  "filamento_usado": "8.2",
  "tiempo": "1h 40m",
  "resultado": "completada"
}
```
Si `resultado` no viene, se fuerza a `completada`. Si falta `project_id`, el
handler no hace nada (no registra).

---

## 4 · FLUJO TÍPICO

**Flujo C — ciclo de impresión → historial (el corazón):**

```
ciclo-impresion detecta fin → impresion.completada
  → historial-impresiones.onImpresionCompletada
  → _registrar (append-only, huecos como 'desconocido')
  → historial.impresion_registrada
  → PosPersistencia marcaDirty → flush en onUnload
```

**Flujo del dueño — consultar historial:**

```
dueño → historial.listar.request { project_id }
  → _listar → registros más reciente primero + total
```

---

## 5 · REGLAS DE NEGOCIO

1. **Append-only** — cada impresión es una entrada inmutable; nunca se edita ni borra.
2. **Más reciente primero** — `unshift` al frente; `_listar` devuelve en ese orden.
3. **Huecos como `desconocido`** — dato ausente nombrado, nunca inventado (invariante 5).
4. **Single-writer** — este módulo es el único que escribe su store por proyecto.
5. **Cierre de círculo** — todo flujo cierra con par canónico: `historial.registrar.failed` ante datos inválidos.
6. **`impresion.completada` sin `project_id`** — no registra (no puede scopeear el store).

---

## 6 · VERIFICACIÓN

Test unitario determinista (sin bus, sin red) que ejercita la lógica pura por
métodos internos (`_rpc`/`eventBus` stubeados):

```bash
cd /opt/enki/modules/historial-impresiones
sudo -u www-data node tests/unit/historial-impresiones__registrar.test.js
# RESULTADO: 8/8 bloques OK
```

Cubre: registrar impresión completa (200 + id) · listar con total · huecos como
`desconocido` · append-only (ids únicos, más reciente primero) · registrar sin
`modelo_id` → 400 + `historial.registrar.failed` · sin `project_id` → 400 ·
`impresion.completada` → registra + emite `impresion_registrada` · listar proyecto
sin historial → vacío.

**Smoke de eventos** (opcional, con bus real): publicar `impresion.completada`
y comprobar que se emite `historial.impresion_registrada` y que el fichero
`3d/historial-impresiones/historial-impresiones.json` del proyecto crece.
