---
name: informe-rico
description: >-
  Skill FULL del módulo REFLEJO STATELESS `informe-rico` de la vertical contabilidad (Enki).
  COMPONE la cifra YA CALCULADA con el contexto DECLARADO (periodo, unidad, criterio,
  comparativa, dimension, sociedad, nota). NO calcula la cifra (eso es de mayor-balanza /
  balance-situacion / cuenta-resultados): la RECIBE y la rodea de contexto. NO narra (la
  narración fuzzy es R3) y NO propone acción (el "qué hacer" es R2). Dato ausente = desconocido:
  sin cifra no compone; el contexto que falta se declara en `abierto`. RPC `componer` es CLASE
  PREGUNTA (por el bus, sin panel).
when-to-use: >-
  - Cuando necesites componer una cifra ya calculada con su contexto declarado
    (RPC informe-rico.componer.request).
  - Cuando depures por qué devuelve 400 INVALID_INPUT (falta `cifra`) o por qué hay campos en
    `abierto` (contexto no declarado).
  - Cuando quieras entender su contrato de eventos: es reflejo puro, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, analitica, informe, contexto, cifra]
---

# informe-rico — REFLEJO que compone la cifra con su contexto

## Qué hace el módulo

`informe-rico` es un **REFLEJO STATELESS** (K3, hoja del plan). **COMPONE** la cifra **ya
calculada** con el contexto **DECLARADO**: periodo, unidad, criterio, comparativa, dimension,
sociedad, nota. **NO calcula la cifra** (eso es de `mayor-balanza`/`balance-situacion`/
`cuenta-resultados`): la **recibe** ya calculada y la **rodea** de contexto para que sea legible.

Límites explícitos del módulo (los declara en la salida):
- `narracion_incluida:false` — la narración fuzzy vive en la hoja **R3**.
- `accion_incluida:false` — el "qué hacer" vive en la hoja **R2**.
- `recalculo:false` — la cifra se compone, no se recalcula.

**Dato ausente = desconocido**: sin `cifra` no compone nada (`400 INVALID_INPUT`); el contexto
que falta **no se rellena** → se declara en `abierto`. La composición es **determinista**
(misma cifra + mismo contexto → mismo informe). Su RPC `componer` es **CLASE PREGUNTA** → sin
panel; su cara es el bus.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `informe-rico.componer.request` | `onComponerRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id, cifra, contexto?, titulo?, calculo_de?}` → `{project_id, titulo, cifra, contexto, compuesto, recalculo:false, narracion_incluida:false, accion_incluida:false, abierto}`. La cifra llega ya calculada; el contexto solo se compone. Responde por `.componer.response`. |

> **Nota de deriva (R3):** el plan declara escucha de `contabilidad.asiento_asentado` y
> `contabilidad.ejercicio_cerrado`, pero el `module.json` real **solo** declara el
> `componer.request`. Ningún módulo del repo emite aún esos hechos (son de grupos posteriores:
> `escritor-diario` B2 y `cierre-ejercicio` C4); declararlos daría cadena colgada.

### Publishes

| Evento | Cuándo |
|---|---|
| `informe-rico.componer.response` | Respuesta RPC correlada de la op `componer`. |
| `informe-rico.componer.failed` | Fallo determinista: falta `project_id` o `cifra`. |

> **No publica hecho de dominio**: reflejo puro (compone y declara, no escribe) → no hay
> `contabilidad.*` que anunciar (R2). El handler publica `.componer.failed` solo si
> `status !== 200`.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `componer` | **PREGUNTA** (bus) | `{project_id, cifra\|cifra_calculada, contexto?, titulo?, calculo_de?\|origen_cifra?}` | `{project_id, tipo:'informe-rico', titulo, cifra, cifra_calculada_por, contexto, compuesto:true, recalculo:false, narracion_incluida:false, accion_incluida:false, abierto}` | 400 `INVALID_INPUT` (`project_id`/`cifra`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`.
2. **Sin `cifra`** (ni `cifra_calculada`) → `_invalid('cifra')` (400). No se estima.
3. **Campos de contexto** (`CAMPOS_CONTEXTO`): `periodo, unidad, criterio, comparativa,
   dimension, sociedad, nota`. Se leen de `input.contexto` (objeto) o del propio `input`.
4. **Contexto ausente → `null` + `abierto[campo]`**: `'sin <campo> declarado: el informe lo
   declara, no lo inventa'`. Un string en blanco también cuenta como ausente.
5. **`cifra_calculada_por`**: de `input.calculo_de` o `input.origen_cifra` (de dónde vino la
   cifra; este módulo no la calculó).
6. **Banderas fijas**: `compuesto:true`, `recalculo:false`, `narracion_incluida:false`,
   `accion_incluida:false`.

## Cómo se usa (RPC)

### Componer un informe

```json
{
  "project_id": "e57a318a-...",
  "cifra": { "saldo": 12345.67, "cuenta": "430" },
  "contexto": { "periodo": "2026-Q3", "unidad": "EUR", "nota": "clientes pendientes" },
  "titulo": "Saldo de clientes",
  "calculo_de": "mayor-balanza"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...", "tipo": "informe-rico", "titulo": "Saldo de clientes",
  "cifra": { "saldo": 12345.67, "cuenta": "430" }, "cifra_calculada_por": "mayor-balanza",
  "contexto": { "periodo": "2026-Q3", "unidad": "EUR", "criterio": null, "comparativa": null, "dimension": null, "sociedad": null, "nota": "clientes pendientes" },
  "compuesto": true, "recalculo": false, "narracion_incluida": false, "accion_incluida": false,
  "abierto": { "criterio": "sin criterio declarado: el informe lo declara, no lo inventa", "comparativa": "...", "dimension": "...", "sociedad": "..." }
}
```

### Fallo — sin cifra

```json
{ "project_id": "e57a318a-...", "contexto": { "periodo": "2026" } }
```
Respuesta `400` + `informe-rico.componer.failed` (`INVALID_INPUT`, field `cifra`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`) | falta `project_id`. |
| `400 INVALID_INPUT` (`cifra`) | no viene `cifra`/`cifra_calculada`. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` +
  `project-manager`.
- **De quién depende:** la cifra que compone la produce `mayor-balanza`/`balance-situacion`/
  `cuenta-resultados` (llega declarada en la petición).
- **Frontera con vecinos:** narración fuzzy → R3 (`narrador-estados`); acción → R2
  (`informe-accionable`). Este módulo no invade ninguna.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-analitica/informe-rico/module.json` + `index.js`.
2. Smoke: `componer` con `cifra` + contexto → 200, `compuesto:true`, `abierto` con lo que falta.
3. Sin `cifra` → `400 INVALID_INPUT` + `.componer.failed`.
4. Determinismo: misma entrada → mismo informe.
5. `grep -E '"event"' module.json` (solo `componer.request`).

## Notas de implementación

- Clase `InformeRico extends ModuloHibridoReflejo`; `name = 'informe-rico'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- `onComponerRequest` delega en `_atender(e,'componer','informe-rico.componer.response', ...)`
  y publica `.componer.failed` si `status !== 200`.
- Proyección `_componer`; helper `_contexto`; tool `toolComponer`.
  `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo`.
