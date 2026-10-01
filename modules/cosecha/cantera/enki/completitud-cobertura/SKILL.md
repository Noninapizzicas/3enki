---
name: completitud-cobertura
description: >-
  Skill FULL del módulo REFLEJO STATELESS `completitud-cobertura` de la vertical
  contabilidad (Enki). PRODUCE LA MÉTRICA ÚNICA DE COBERTURA que Q3/C6/P4 LEEN
  (no la recalculan): cobertura = min(recibidos, esperados) / esperados, acotada a
  [0,1], determinista y sin ponderaciones ocultas. Escucha `contabilidad.hecho_recibido`
  y guarda una ventana acotada en memoria para medir cuando no se declaran los totales.
  Honestidad (invariante 13): sin dato no inventa el porcentaje — `cobertura:null` y
  `abierto` declarado. No persiste (STATELESS). La op `medir` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites medir la cobertura de la entrada de un proyecto
    (RPC completitud-cobertura.medir.request).
  - Cuando depures por qué una métrica de cobertura sale `null` o por qué no
    llega `completitud-cobertura.medir.response` (falta project_id → failed).
  - Cuando quieras entender su contrato de eventos y la fórmula determinista que
    consumen sello-cobertura (Q3) y tasa-cobertura-entrada (P4).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, entrada, cobertura, metrica, honestidad]
---

# completitud-cobertura — REFLEJO STATELESS de la métrica única de cobertura

## Qué hace el módulo

`completitud-cobertura` es un **REFLEJO STATELESS** (A12, hoja del plan) de la
vertical **contabilidad**, eje **entrada**. Su trabajo es **producir la métrica
única de cobertura** que otras piezas (Q3 `sello-cobertura`, C6 y P4
`tasa-cobertura-entrada`) **leen** — no la recalculan cada una por su cuenta.

La métrica es determinista: `cobertura = min(recibidos, esperados) / esperados`,
acotada a `[0,1]`, sin ponderaciones ocultas. Cuenta "cuánto de la entrada esperada
se ha recibido". No calcula importes: solo cuenta claves/hechos.

**Honestidad (invariante 13) — dato ausente = desconocido.** Si NO llega lo esperado
ni lo recibido (ni declarado en el input ni observado por `contabilidad.hecho_recibido`),
la métrica **NO se inventa**: devuelve `cobertura:null`, `senal_presente:false` y un
`abierto` que lo declara. Un porcentaje fabricado sería una métrica que miente.

**No persiste**: no usa PosPersistencia. Solo mantiene una **ventana acotada en memoria**
(`this._observados`, `Map<project_id, Set<clave>>`, tope 5000 claves) para poder medir
cuando el emisor no declara los totales. Al descargar el módulo (`onUnload`) la memoria
se va: la métrica se reconstruye del input o de los hechos observados de nuevo.

La op `medir` es **CLASE PREGUNTA** (cara = el bus) → **no lleva ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `completitud-cobertura.medir.request` | `onMedirRequest` | RPC reflejo (PREGUNTA): `{project_id, esperados?\|claves_esperadas?, recibidos?\|claves_recibidas?, umbral?}` → `{project_id, cobertura, recibidos, esperados, faltantes, completa, bajo_umbral}`. Delega en `_atender` → `_medir`. Si `status ≠ 200` publica `completitud-cobertura.medir.failed`. Responde por `completitud-cobertura.medir.response`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Fire-and-forget (puerto-evento-vertical A1): llegó un hecho de la operación. Se observa su **clave** en la ventana acotada (`_observados`) para poder medir la cobertura sin que se declaren los totales. **No publica hecho** (solo observa). |

### Publishes

| Evento | Cuándo |
|---|---|
| `completitud-cobertura.medir.response` | Respuesta RPC correlada de la op `medir` (una sola cara: el bus). |
| `completitud-cobertura.medir.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `medir.request`. |

> **NO publica ningún HECHO.** Es un reflejo de lectura: mide, no escribe estado. Por eso
> no hay `contabilidad.*_cobertura` ni nada equivalente. Su única salida es la respuesta
> RPC (y su par de fallo).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `medir` | **PREGUNTA** | `{project_id, esperados?, claves_esperadas?, recibidos?, claves_recibidas?, umbral?}` | `{project_id, tipo, cobertura, cobertura_pct, esperados, recibidos, faltantes, completa, umbral, bajo_umbral, senal_presente, formula, abierto}` — o variante ABIERTO con `cobertura:null` | `400 INVALID_INPUT` si falta `project_id` (`_invalid('project_id')`) → `completitud-cobertura.medir.failed`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Fórmula determinista y acotada**: `cobertura = min(recibidos, esperados) / esperados`,
   redondeada a 4 decimales (`_round(x, 4)`). Acotada a `[0,1]`. `cobertura_pct` = 100×cobertura.
2. **Sin dato no se inventa**: si `esperados` y `recibidos` llegan ambos a `null` **y** no
   hay nada observado para el proyecto → `cobertura:null`, `senal_presente:false` y
   `abierto.entrada`. Nunca se fabrica un porcentaje.
3. **Caso trivial 0/0**: si `esperados === 0` y `recibidos === 0` → `cobertura = 1`
   (no había nada que recibir; completo por vacuidad). Si `esperados === 0` y `recibidos > 0`
   → `cobertura = 0`.
4. **`recibidos` no puede bajar de 0**: `Math.max(0, Number(recibidos) || 0)`. `faltantes`
   = `max(0, esperados - recibidos)`.
5. **Acepta número o lista**: `_cuenta(numero, lista)` toma un número finito, o cuenta
   elementos de un array (`claves_esperadas` / `claves_recibidas`). `null` si no se declaró nada.
6. **Umbral opcional**: `umbral` declarado → `bajo_umbral = cobertura < umbral`;
   sin umbral → `bajo_umbral:null` (no se decide si es bajo). No hay umbral por defecto.
7. **Deduplicación de la ventana observada**: la clave de un hecho es `hecho.clave` o
   `hecho.id` o `hecho.documento` (en ese orden). El `Set` evita contar duplicados del bus
   at-least-once. Ventana acotada a 5000 claves (evita crecimiento sin fin).
8. **Lectura pura**: `medir` no muta el dominio; no publica hecho (R2 no aplica a reflejos).

## Cómo se usa (RPC)

### Medir con totales declarados

```json
{
  "project_id": "e57a318a-...",
  "esperados": 120,
  "recibidos": 114,
  "umbral": 0.95,
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "completitud-cobertura",
  "cobertura": 0.95,
  "cobertura_pct": 95,
  "esperados": 120,
  "recibidos": 114,
  "faltantes": 6,
  "completa": false,
  "umbral": 0.95,
  "bajo_umbral": false,
  "senal_presente": true,
  "formula": "cobertura = min(recibidos, esperados) / esperados  (acotada a [0,1])",
  "abierto": { "claves": "no se declararon las claves esperadas: solo se cuenta el total (la metrica agregada no inventa el detalle)" }
}
```

### Medir desde claves (arrays)

```json
{ "project_id": "e57a318a-...", "claves_esperadas": ["f1","f2","f3"], "claves_recibidas": ["f1","f3"] }
```
→ `cobertura: 0.6667`, `faltantes: 1`, `completa: false`.

### Sin dato alguno — se declara ABIERTO

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200` (con `abierto`):
```json
{
  "project_id": "e57a318a-...",
  "tipo": "completitud-cobertura",
  "cobertura": null,
  "senal_presente": false,
  "abierto": { "entrada": "no llego lo esperado ni lo recibido: la cobertura no se inventa (dato ausente = desconocido)" }
}
```

### Fallo — falta project_id

```json
{ "esperados": 10 }
```
Respuesta `400 INVALID_INPUT` + `completitud-cobertura.medir.failed` con `{status:400, code:'INVALID_INPUT', mensaje:'project_id requerido', field:'project_id'}`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. Publica `completitud-cobertura.medir.failed`. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada en `_medir` (lo produce `_atender`). |

## Relación con otras piezas (deps por EVENTO)

- **Emisor hacia este módulo**: `puerto-evento-vertical` (A1) publica `contabilidad.hecho_recibido`.
- **Consumidores de la métrica (la LEEN, no la recalculan)**:
  - `sello-cobertura` (Q3) — pide `completitud-cobertura.medir.request` por RPC.
  - `tasa-cobertura-entrada` (P4) — pide `completitud-cobertura.medir.request` por RPC.
  - C6 (referida en el plan como lectora de la métrica única).
- **No depende de nadie más**: no llama a `_rpc` (no tiene `RPC_CALLS`).

## Verificación

1. Fichero: `modules/contabilidad-entrada/completitud-cobertura/`.
2. Eventos reales en `module.json`: `completitud-cobertura.medir.request`,
   `contabilidad.hecho_recibido` (subscribes); `completitud-cobertura.medir.response`,
   `completitud-cobertura.medir.failed` (publishes).
3. Comprobación rápida de los strings publicados en el código:
   ```bash
   grep -o "publish('[^']*'" modules/contabilidad-entrada/completitud-cobertura/index.js
   # → completitud-cobertura.medir.failed
   ```
4. Ejecutar el test unitario del módulo (si existe `tests/unit/completitud-cobertura.test.js`):
   ```bash
   cd /home/admin/3enki-contabilidad/modules/contabilidad-entrada/completitud-cobertura
   node tests/unit/completitud-cobertura.test.js
   ```
   Casos a cubrir: `medir` con totales → 200 determinista; con claves → cuenta;
   sin dato → `cobertura:null` + `abierto`; sin `project_id` → 400 + failed;
   `contabilidad.hecho_recibido` alimenta la ventana observada.
