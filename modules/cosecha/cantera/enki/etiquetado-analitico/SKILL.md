---
name: etiquetado-analitico
description: >-
  Skill FULL del módulo MICRO-AGENTE `etiquetado-analitico` de la vertical contabilidad (Enki).
  PROPONE centro/línea/producto por REGLA DECLARADA: las dimensiones y las reglas son DATO (nunca
  constantes ocultas). Lo que ninguna regla cubre va a la cola de excepciones (A8.1) — no se
  adivina la etiqueta. Escucha `contabilidad.hecho_recibido` y `contabilidad.criterio_fijado`
  (ventanas acotadas). **Propone, no fija**. Sin store propio. La op `juzgar` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites proponer la etiqueta analítica (centro/línea/producto) de un hecho por regla
    (RPC etiquetado-analitico.juzgar.request).
  - Cuando depures por qué la propuesta sale incompleta (`completa:false`, `faltan`) o por qué el
    hecho fue a la cola (ninguna regla declarada lo cubre).
  - Cuando quieras entender su contrato de eventos y por qué NO fija la etiqueta.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, micro-agente, reflejo, stateless, contabilidad, analitica, etiquetado, reglas]
---

# etiquetado-analitico — MICRO-AGENTE que PROPONE etiquetas analíticas

## Qué hace el módulo

`etiquetado-analitico` es un **MICRO-AGENTE** (mitad refleja) (J1, hoja del plan) de la vertical
**contabilidad**, eje **analítica**. Dado un **hecho**, **propone** la etiqueta analítica por
dimensión (**centro**, **línea**, **producto**) aplicando **reglas declaradas**.

Las **dimensiones** y las **reglas** son **DATO** (declaradas en el input o subidas por
`contabilidad.criterio_fijado`); no hay constantes de negocio ocultas. El conjunto de dimensiones
por defecto es `['centro','linea','producto']`, declarable.

**PROPONE, NO FIJA**: `propone:true`, `fija:false`. El corte duro (fijar la etiqueta) no es de
esta hoja. **Lo que ninguna regla cubre es juicio**: va a la **cola de excepciones**
(`encolado-excepcion`, A8.1) — **no se adivina la etiqueta**.

**No persiste**: memoria acotada `this._criterios` (tope 500) por `contabilidad.criterio_fijado`.
La op `juzgar` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `etiquetado-analitico.juzgar.request` | `onJuzgarRequest` | RPC (PREGUNTA): `{project_id, hecho, dimensiones?, reglas?, …}` → `{propuesta, propone:true, fija:false, reglas_aplicadas, abierto}`. Delega en `_atender` → `_juzgar`. Si la propuesta **no es completa** publica `encolado-excepcion.encolar.request`; si `status ≠ 200` publica `.failed`. Responde por `etiquetado-analitico.juzgar.response`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Fire-and-forget (puerto-evento-vertical A1): llegó un hecho → solo se loguea el contexto (no muta nada). |
| `contabilidad.criterio_fijado` | `onCriterioFijado` | Fire-and-forget (cola-declaraciones-criterio): se fijó un criterio de etiquetado → se observa en la ventana (tope 500) para aplicar reglas sin declararlas en el input. |

### Publishes

| Evento | Cuándo |
|---|---|
| `etiquetado-analitico.juzgar.response` | Respuesta RPC correlada de la op `juzgar`. |
| `etiquetado-analitico.juzgar.failed` | Par de fallo determinista: falta `project_id` o `hecho`. |
| `encolado-excepcion.encolar.request` | **Solo si la propuesta NO es completa** (`!propuesta.completa`): `{rol:'ETIQUETADO_ANALITICO', clave, motivo:'ninguna regla declarada cubre este hecho: la etiqueta analitica queda abierta (no se adivina)', origen, payload:{dimensiones, faltan}, correlation_id}`. |

> **NO publica un hecho de dominio**: PROPONE (no escribe). Su única salida externa es la
> excepción por EVENTO a A8.1 cuando falta la etiqueta.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `juzgar` | **PREGUNTA** | `{project_id, hecho:{…}, dimensiones?:[str], reglas?:[{dimension?, campo?, igual?, en?, valor?\|etiqueta?}], clave?}` | `{project_id, tipo, hecho_id, clave, dimensiones, propuesta:{etiquetas, dimensiones, completa, faltan}, propone:true, fija:false, reglas_aplicadas, abierto}` | `400 INVALID_INPUT` (falta `project_id` o `hecho`); `500`. |

## Reglas de negocio

1. **Hecho obligatorio**: si `hecho` (o `evento`) no es objeto → `400 INVALID_INPUT hecho`.
2. **Dimensiones declarables**: `_dimensiones` acepta un array de strings; si no,
   `['centro','linea','producto']`. **El conjunto es DATO.**
3. **Reglas**: las del input (`reglas`) o las **observadas** por `contabilidad.criterio_fijado`
   (ventana acotada). La regla declara qué **dimensión** etiqueta y con qué **valor**.
4. **Aplicación de una regla** (`_aplica`, por dimensión): se toma la **primera** regla que cubre.
   Filtros opcionales: `campo`+`igual` (campo del hecho/input debe igualar), `en` (debe estar en la lista).
   El valor sale de `valor` / `r[dim]` / `etiqueta`.
5. **Lectura de lo declarado**: si ninguna regla asigna, se lee el valor **declarado** en el propio
   hecho (`hecho[dim]`) — eso no es adivinar, es leer.
6. **Sin regla → abierto**: la dimensión queda `valor:null` y entra en `faltan`. `completa =
   faltan.length === 0 && propuesta.length > 0`.
7. **Propuesta incompleta → cola**: el handler publica `encolado-excepcion.encolar.request`.
   **No se adivina la etiqueta**.
8. **Propone, no fija**: `propone:true`, `fija:false` siempre.
9. **`_num` estricto** y normalización de strings con `trim`.

## Cómo se usa (RPC)

### Proponer con reglas declaradas

```json
{
  "project_id": "e57a318a-...",
  "hecho": { "hecho_id": "h-88", "centro": "TIENDA-A", "concepto": "compra" },
  "reglas": [
    { "dimension": "centro", "valor": "TIENDA-A" },
    { "dimension": "linea", "campo": "concepto", "igual": "compra", "valor": "APROVISIONAMIENTO" },
    { "dimension": "producto", "campo": "concepto", "igual": "venta", "valor": "PIZZA" }
  ],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "etiquetado-analitico",
  "hecho_id": "h-88",
  "dimensiones": ["centro","linea","producto"],
  "propuesta": {
    "etiquetas": [
      { "dimension": "centro", "valor": "TIENDA-A", "fuente": "regla_declarada" },
      { "dimension": "linea", "valor": "APROVISIONAMIENTO", "fuente": "regla_declarada" },
      { "dimension": "producto", "valor": null, "fuente": null }
    ],
    "dimensiones": { "centro": "TIENDA-A", "linea": "APROVISIONAMIENTO", "producto": null },
    "completa": false,
    "faltan": ["producto"]
  },
  "propone": true,
  "fija": false,
  "reglas_aplicadas": 3,
  "abierto": "no hay regla declarada que cubra: producto — la etiqueta queda abierta (es juicio, no se adivina)"
}
```
Emite `encolado-excepcion.encolar.request` (producto quedó abierto).

### Sin reglas — propuesta incompleta

→ `completa:false`, todas las dimensiones en `faltan`, y encola.

### Fallo — falta hecho

`{ "project_id": "..." }` → `400 INVALID_INPUT hecho` + `.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id` o falta `hecho`. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |
| (no es error) | 200 | Sin regla que cubra → `completa:false` + encola (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.hecho_recibido` (A1), `contabilidad.criterio_fijado` (cola-declaraciones-criterio).
- **Sube a**: `encolado-excepcion.encolar.request` (A8.1) si la propuesta no es completa.

## Verificación

1. Fichero: `modules/contabilidad-analitica/etiquetado-analitico/`.
2. Eventos reales: subscribes `etiquetado-analitico.juzgar.request`, `contabilidad.hecho_recibido`,
   `contabilidad.criterio_fijado`; publishes `etiquetado-analitico.juzgar.response`, `.failed`,
   `encolado-excepcion.encolar.request`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-analitica/etiquetado-analitico/index.js
   # → etiquetado-analitico.juzgar.failed / encolado-excepcion.encolar.request
   ```
4. Test unitario (si existe): reglas aplican → completa; dimensión sin regla → `faltan` + encola;
   falta hecho → 400; `propone:true, fija:false`.
