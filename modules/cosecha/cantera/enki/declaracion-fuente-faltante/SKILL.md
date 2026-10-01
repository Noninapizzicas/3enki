---
name: declaracion-fuente-faltante
description: >-
  Skill FULL del módulo PUENTE `declaracion-fuente-faltante` de la vertical contabilidad
  (Enki). DETECTA que una vertical NO publica un hecho necesario Y LO DECLARA — NUNCA la
  obliga a producirlo ni inventa el dato que falta (`creada_fuente:false`, `obliga:false`).
  Escucha `contabilidad.hecho_recibido`: si el hecho DECLARA que su fuente falta, se declara;
  si no lo declara, NO se inventa la acusación. Al declarar publica el hecho
  `contabilidad.fuente_faltante_declarada` y SUBE la señal a `motor-avisos.producir.request`.
  Sin store propio (PUENTE stateless). La op `declarar` es ORDEN → lleva ui_handler.
when-to-use: >-
  - Cuando necesites declarar que falta una fuente que una vertical debería publicar
    (RPC declaracion-fuente-faltante.declarar.request).
  - Cuando depures por qué no se declara nada (sin fuente señalada → `declarada:false`
    y `abierto`) o por qué un payload inválido dispara declarar.failed.
  - Cuando quieras entender su contrato de eventos: el hecho `contabilidad.fuente_faltante_declarada`
    y la subida best-effort a motor-avisos.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, stateless, contabilidad, entrada, honestidad, avisos]
---

# declaracion-fuente-faltante — PUENTE que declara la fuente ausente

## Qué hace el módulo

`declaracion-fuente-faltante` es un **PUENTE** (A15, hoja del plan) de la vertical
**contabilidad**, eje **entrada**. Su papel es de **testigo honesto**: cuando una
vertical **NO publica un hecho que se esperaba**, este módulo **lo declara** — pero
**no la obliga a producir el hecho** ni **fabrica el dato ausente**.

El círculo completo es:

```
señal (fuente esperada que no llegó, o hecho observado sin su fuente)
   → declaracion-fuente-faltante.declarar  (DECLARA — no rellena)
   → aviso (motor-avisos.producir.request) para que el negocio lo vea
y además el hecho contabilidad.fuente_faltante_declarada (lo lee motor-avisos)
```

**Honestidad (invariante 13): sin señal NO se inventa una declaración.** Si nada
declara que falta una fuente, se devuelve ABIERTO (`declarada:false`, `declaracion:null`).
Una fuente "faltante" inventada sería una **acusación falsa** a la vertical.

**Es PUENTE STATELESS**: no tiene PosPersistencia ni store. Cada declaración se construye
al vuelo con un `declaracion_id` (`ff_<pid>_<base36 de Date.now()>`). La op `declarar`
es **CLASE ORDEN** (barra de módulos) → lleva `ui_handler` (`workspace_module`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `declaracion-fuente-faltante.declarar.request` | `onDeclararRequest` | RPC puente (ORDEN): `{project_id, fuente\|fuente_esperada, vertical?, motivo?, ref?}` → `{project_id, declaracion, declarada}`. Declara la ausencia de una fuente. Si declara (`declarada:true`) publica `contabilidad.fuente_faltante_declarada` **y** sube `motor-avisos.producir.request`. Si `status ≠ 200` publica `declaracion-fuente-faltante.declarar.failed`. Responde por `declaracion-fuente-faltante.declarar.response`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Fire-and-forget (puerto-evento-vertical A1): llegó un hecho. Si el hecho **DECLARA** que su fuente falta (`fuente_faltante` / `fuente_esperada`), se declara y se publica el hecho. Si no lo declara → **no se inventa la acusación** (retorno silencioso). |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.fuente_faltante_declarada` | Fire-and-forget (A15): se declaró que una vertical no publica un hecho necesario → `{project_id, vertical, fuente, motivo, declaracion_id, correlation_id}`. Lo lee `motor-avisos` (K2). Se emite tanto desde la vía RPC como desde `onHechoRecibido`. |
| `motor-avisos.producir.request` | Best-effort: al declarar, se SUBE la señal al motor de avisos (`{tipo:'fuente', severidad:'warn', titulo, detalle, origen:'declaracion-fuente-faltante', ref, correlation_id}`). No se cablea la entrega. |
| `declaracion-fuente-faltante.declarar.response` | Respuesta RPC correlada de la op `declarar` (una sola cara: el bus). |
| `declaracion-fuente-faltante.declarar.failed` | Par de fallo determinista: falta `project_id` o entrada inválida (no se señaló fuente → NO es fallo, es `declarada:false` con `abierto`). Cierra el círculo de `declarar.request`. |

> **Sí publica un HECHO** (`contabilidad.fuente_faltante_declarada`) porque **declarar ES
> escribir** una declaración: R2 (escribe → anuncia) obliga a anunciarlo. Además sube la
> señal a motor-avisos, pero **no empuja el aviso** él mismo (eso es de K2).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `declarar` | **ORDEN** (ui_handler: workspace_module, barra_modulos) | `{project_id, fuente?, fuente_esperada?, vertical?, motivo?, ref?}` | `{project_id, tipo, declaracion:{declaracion_id, vertical, fuente, motivo, ref, obliga:false, declarada_en}, declarada:true, creada_fuente:false, abierto}`; o ABIERTO con `declarada:false` si no se señala fuente | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Solo declara, no crea**: `creada_fuente:false` en toda respuesta. El módulo **no
   produce** el hecho que falta ni obliga a la vertical (`obliga:false`). La declaración
   es **informativa**, no un requerimiento.
2. **Sin fuente señalada no hay declaración**: si no llega `fuente` ni `fuente_esperada`,
   devuelve `200` con `declarada:false` y `abierto.fuente` — **no se inventa la acusación**.
   (Ojo: esto **no es un error**, es honestidad.)
3. **Guard implícito**: el único escritor es este módulo (no hay guard de rol; es un
   puente declarativo, no una parcela con dueño).
4. **`ref` normalizado**: `ref` se guarda como string o `null`; `motivo` como string o `null`
   (si no se declaró motivo, se anota el hueco en `abierto.motivo`, no se inventa).
5. **Idempotencia del hecho observado**: la clave del hecho se toma de `hecho.clave` o
   `hecho.id` para el `ref`; el `declaracion_id` lleva `Date.now()` (no hay store que deduplique —
   el bus puede entregar el mismo hecho más de una vez y se declarará dos veces: es un PUENTE
   stateless, no un custodio append-only).
6. **Fire-and-forget silencioso**: en `onHechoRecibido`, si el hecho no declara fuente
   faltante → `return` sin publicar nada. Si hay excepción → se loguea (`logger.error`), no se propaga.
7. **Best-effort hacia motor-avisos**: se publica `motor-avisos.producir.request` solo cuando
   la declaración tuvo éxito; si motor-avisos no está, el `publish` no rompe nada.

## Cómo se usa (RPC)

### Declarar una fuente faltante

```json
{
  "project_id": "e57a318a-...",
  "vertical": "fiscal",
  "fuente": "contabilidad.modelo_exportado",
  "motivo": "generador-modelo no publico el modelo de este trimestre",
  "ref": "303-2026-T1",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "declaracion-fuente-faltante",
  "declaracion": {
    "declaracion_id": "ff_e57a318a-..._m1b2c3",
    "vertical": "fiscal",
    "fuente": "contabilidad.modelo_exportado",
    "motivo": "generador-modelo no publico el modelo de este trimestre",
    "ref": "303-2026-T1",
    "obliga": false,
    "declarada_en": "2026-09-30T..."
  },
  "declarada": true,
  "creada_fuente": false,
  "abierto": { "motivo": null }
}
```
Emite `contabilidad.fuente_faltante_declarada` y sube `motor-avisos.producir.request`.

### Sin fuente señalada — ABIERTO (no se inventa)

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "declaracion-fuente-faltante",
  "declarada": false,
  "declaracion": null,
  "abierto": { "fuente": "no se señaló qué fuente falta: no se inventa una declaracion (nada que declarar)" }
}
```

### Fallo — falta project_id

```json
{ "fuente": "x" }
```
→ `400 INVALID_INPUT` + `declaracion-fuente-faltante.declarar.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. Publica `declaracion-fuente-faltante.declarar.failed`. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada en `_declarar`. |
| (no es error) | 200 | Sin fuente señalada → `declarada:false` + `abierto` (declaración honesta vacía). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.hecho_recibido` (lo publica `puerto-evento-vertical` A1).
- **Habla con**: `motor-avisos.producir.request` (K2) — sube la señal. `motor-avisos` lee
  además el hecho `contabilidad.fuente_faltante_declarada`.
- **No llama a ningún `_rpc`**: es un puente declarativo puro por evento.

## Verificación

1. Fichero: `modules/contabilidad-entrada/declaracion-fuente-faltante/`.
2. Eventos reales en `module.json`: subscribes `declaracion-fuente-faltante.declarar.request`,
   `contabilidad.hecho_recibido`; publishes `contabilidad.fuente_faltante_declarada`,
   `declaracion-fuente-faltante.declarar.response`, `declaracion-fuente-faltante.declarar.failed`.
3. Comprobación de strings en el código:
   ```bash
   grep -o "publish('[^']*'" modules/contabilidad-entrada/declaracion-fuente-faltante/index.js
   # → contabilidad.fuente_faltante_declarada / declaracion-fuente-faltante.declarar.failed / motor-avisos.producir.request
   ```
4. Test unitario (si existe): casos — `declarar` con fuente → 200 `declarada:true` +
   `contabilidad.fuente_faltante_declarada` + `motor-avisos.producir.request`; sin fuente →
   200 `declarada:false` (ABIERTO); sin `project_id` → 400 + failed; `onHechoRecibido`
   con hecho que declara fuente → declara; hecho sin fuente → **no publica nada**.
