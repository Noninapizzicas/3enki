---
name: frontera-planos
description: >-
  Skill FULL del módulo REFLEJO STATELESS `frontera-planos` de la vertical contabilidad (Enki).
  EL CERROJO ESTRUCTURAL anti-bucle del dominio: separa el PLANO DE OPERACIÓN (los hechos del
  negocio, que contabilidad RECIBE y jamás produce) del PLANO DE CÁLCULO (los derivados, que
  contabilidad PRODUCE y jamás deben realimentar la operación). A la salida SOLO viajan cálculos.
  Evidencia dura → 422 FRONTERA_PLANOS_ROTA. Sin patrón declarado (`permitido`) NO da por bueno
  lo que no puede verificar (conforme:null: el silencio no es conformidad). Determinista, NO escribe.
when-to-use: >-
  - Cuando necesites verificar que una salida solo contiene cálculos y no realimenta la operación
    (RPC frontera-planos.verificar.request).
  - Cuando depures por qué devuelve 422 FRONTERA_PLANOS_ROTA (evidencia dura) o por qué
    `conforme:null` (falta el patrón `permitido`).
  - Cuando quieras entender su contrato de eventos: es reflejo puro, no publica hecho de dominio.
  - Cuando vayas a escribir/ampliar su test unitario (la hoja dice: "un test lo afirma").
tags: [enki, modulo, reflejo, stateless, contabilidad, libro, anti-bucle, cerrojo, planos]
---

# frontera-planos — REFLEJO del cerrojo anti-bucle (planos)

## Qué hace el módulo

`frontera-planos` es un **REFLEJO STATELESS** (M1, hoja del plan). Es **una de las 3 piezas
anti-bucle del dominio. El cerrojo estructural.**

**Por qué existe:** contabilidad **observa** la operación (los hechos que las verticales
emiten) y produce **sus derivados** (cálculos: saldos, mayores, estados, informes). Si un
derivado pudiera volver a entrar como si fuera un **hecho** de la operación, el sistema se
realimentaría: contabilidad fabricaría los hechos que luego observa y el bucle no tendría
suelo. Este cerrojo separa los DOS planos y lo hace verificable:

- **`plano_operacion`** — los HECHOS del negocio. Contabilidad los RECIBE; NUNCA los produce.
- **`plano_calculo`** — los DERIVADOS de contabilidad. Contabilidad los PRODUCE; NUNCA deben
  realimentar la operación.

**Cómo guarda (fail-safe, sin cablear nada):**

1. **Evidencia dura** (siempre detectable): si la salida **declara** ser un hecho
   (`plano:'hecho'/'operacion'`, `es_hecho:true`) o **declara** realimentar/escribir la
   operación (`realimenta:true`, `escribe_operacion:true`) → `422 FRONTERA_PLANOS_ROTA`
   (`bucle_cortado:true`). Es un fallo, no una advertencia; no necesita patrón.
2. **Patrón declarado** (`permitido:PatronDeCalculo`): dice qué planos están permitidos a la
   salida. Cada salida se clasifica contra él.
3. **Sin patrón**: NO se da por bueno → `conforme:null, verificable:false, abierto.patron:'...'`.
   **El silencio no es conformidad** — un cerrojo que aprueba lo que no sabe verificar es un
   cerrojo falso.

**Determinista**: misma salida + mismo patrón → mismo veredicto. **NO escribe, NO persiste, NO
muta, NO decide**: verifica y declara. Su RPC `verificar` es **CLASE PREGUNTA** → sin panel.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `frontera-planos.verificar.request` | `onVerificarRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id, salida, permitido?}` → `{project_id, conforme, verificable, no_realimenta, planos_clasificados, patron_aplicado, abierto}`. Evidencia dura → 422; sin patrón → `conforme:null` (no verificable). Responde por `.verificar.response`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `frontera-planos.verificar.response` | Respuesta RPC correlada de la op `verificar`. |
| `frontera-planos.verificar.failed` | Fallo determinista: falta `project_id`/`salida` o la salida cruza la frontera (422 `FRONTERA_PLANOS_ROTA`). |

> **No publica hecho de dominio**: reflejo puro (no escribe) → no hay `contabilidad.*` que
> anunciar (R2). El handler publica `.verificar.failed` solo si `status !== 200` (incluye el 422).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `verificar` | **PREGUNTA** (bus) | `{project_id, salida, permitido?\|patron?}` | `{project_id, tipo:'frontera-planos', conforme, verificable, no_realimenta, salida, plano, planos_clasificados, num_salidas, num_no_permitidas, patron_aplicado, evidencia_dura, revisa, abierto}` | 422 `FRONTERA_PLANOS_ROTA`; 400 `INVALID_INPUT` (`project_id`/`salida`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`; **sin `salida`** (y sin `s`) →
   `_invalid('salida')`. La salida puede ser un objeto o un array (`_items` lo envuelve).
2. **Evidencia dura** (`_evidenciaDura`): se escanean `salida`, `input` y cada item. Señales:
   `plano ∈ {'operacion','hecho','hecho_negocio'}` → `plano_declarado`; `es_hecho===true`;
   `realimenta===true`/`realimenta_operacion===true`; `escribe_operacion===true`. Cualquier
   señal → `422 FRONTERA_PLANOS_ROTA` con `bucle_cortado:true`, `plano_detectado:'operacion'`.
3. **Patrón** (`_patron`): acepta `input.permitido` (o `input.patron`): un array de planos, un
   objeto `{planos:[...], permite_operacion:bool}`, o un string. Si no hay planos → `null`.
4. **Sin patrón** → `conforme:null, verificable:false, no_realimenta:null, patron_aplicado:null`,
   `abierto.patron` declarado. **No es aprobación.**
5. **Clasificación** (`_planoDe`): el plano declarado del item; sin plano declarado se asume
   `calculo` (derivado por defecto) al evaluar permiso (`_permitido`).
6. **`operacion` solo se permite** si el patrón trae `permite_operacion===true` (por defecto NO,
   porque es la frontera).
7. **Con patrón**: `conforme = (noPermitidas.length === 0)`; `no_realimenta = conforme`;
   `plano:'calculo'`. Si hay no permitidas, `abierto.planos` lo declara.
8. **`revisa`**: siempre `'asesor (...)'` — el cerrojo declara; no decide por su cuenta.

## Cómo se usa (RPC)

### 1. Conforme (con patrón)

```json
{ "project_id": "e57a318a-...", "salida": { "plano": "calculo", "tipo": "saldo", "importe": 100 }, "permitido": ["calculo"] }
```
Respuesta `200`: `{tipo:'frontera-planos', conforme:true, verificable:true, no_realimenta:true, plano:'calculo', num_salidas:1, num_no_permitidas:0, patron_aplicado:{planos:['calculo'],permite_operacion:false}, revisa:'asesor (...)'}`.

### 2. Sin patrón → no verificable

```json
{ "project_id": "e57a318a-...", "salida": { "plano": "calculo", "tipo": "saldo" } }
```
Respuesta `200`: `conforme:null, verificable:false, abierto.patron:'no se declaro el patron de calculo...'`.

### 3. Evidencia dura → frontera rota

```json
{ "project_id": "e57a318a-...", "salida": { "es_hecho": true, "tipo": "venta" } }
```
Respuesta `422` + `frontera-planos.verificar.failed`:
```json
{ "status": 422, "code": "FRONTERA_PLANOS_ROTA", "mensaje": "solo se emiten calculos: un hecho de negocio (o una realimentacion de la operacion) a la salida es FALLO", "data": { "project_id": "e57a318a-...", "evidencia": [ { "senal": "es_hecho", "motivo": "la salida se declara un hecho de negocio" } ], "plano_detectado": "operacion", "plano_esperado": "calculo", "bucle_cortado": true } }
```

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id` / `salida`) | falta el campo. |
| `422 FRONTERA_PLANOS_ROTA` | evidencia dura: la salida se declara hecho o realimentación. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` +
  `project-manager`.
- **De quién depende:** ninguna. La salida a verificar llega en la petición.
- **Quién la usa:** cualquier punto de salida del sistema contable (exportaciones, informes) que
  deba probar que no realimenta la operación. Guarda estructural del dominio.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-libro/frontera-planos/module.json` + `index.js`.
2. Smoke: `verificar` con patrón `['calculo']` y salida cálculo → `conforme:true`.
3. Sin patrón → `conforme:null` (no aprobación).
4. Evidencia dura (`es_hecho:true`) → `422 FRONTERA_PLANOS_ROTA` + `.verificar.failed`.
5. Determinismo: misma entrada → mismo veredicto (test unitario lo afirma).
6. `grep -E '"event"' module.json`.

## Notas de implementación

- Clase `FronteraPlanos extends ModuloHibridoReflejo`; `name = 'frontera-planos'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- `onVerificarRequest` delega en `_atender(e,'verificar','frontera-planos.verificar.response', ...)`
  y publica `.verificar.failed` si `status !== 200`.
- Proyección `_verificar`; helpers `_evidenciaDura`, `_patron`, `_planoDe`, `_permitido`,
  `_items`; tool `toolVerificar`. `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo`.
