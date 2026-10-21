---
name: narrador-estados
description: >-
  Skill FULL del módulo MICRO-AGENTE (híbrido) `narrador-estados` de la vertical
  contabilidad (Enki). Traduce balance/resultado al LENGUAJE del negocio cliente. La
  mitad REFLEJA (determinista y honesta) compone la narración con plantillas y
  vocabulario DECLARADOS, citando SOLO cifras reales; el juicio lingüístico es la
  mitad fuzzy del blueprint. No calcula el balance ni el resultado: los sube por
  EVENTO. Un dato ausente no se narra. No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites narrar los estados en el lenguaje del negocio (RPC
    narrador-estados.narrar.request).
  - Cuando depures una narración sin frases (sin estados → no hay nada que narrar) o
    un 400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    honestidad de "solo cifras reales".
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, micro-agente, contabilidad, analitica, narracion, cliente, honestidad]
---

# narrador-estados — MICRO-AGENTE que traduce los estados al lenguaje del negocio

## Qué hace el módulo

`narrador-estados` es un **MICRO-AGENTE** (R3, hoja del plan): traduce
balance/resultado al **LENGUAJE del negocio cliente**. La mitad **REFLEJA**
(determinista y honesta) compone la narración con **PLANTILLAS y VOCABULARIO
DECLARADOS**, citando **SOLO cifras reales**; el juicio lingüístico (qué contar y
cómo) es la mitad **FUZZY** del blueprint.

**NO calcula el balance ni el resultado**: los **SUBE por EVENTO** a
`balance-situacion.calcular.request` (C1) y `cuenta-resultados.calcular.request`
(C2). **Honestidad (invariante 13)**: un dato ausente **NO se narra** (**0 no es
"no hay"**); sin plantillas se usa estructura por defecto que solo cita cifras
reales. No escribe, no persiste. Su op es **CLASE PREGUNTA** → va por el bus, sin
panel. Publica `narrador-estados.narrar.response` y su par `.failed`.

> **Nota R3**: la escucha de `contabilidad.ejercicio_cerrado` del plan **NO se
> declara**: su emisor `cierre-ejercicio` (C4) aún no existe.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `narrador-estados.narrar.request` | `onNarrarRequest` | RPC micro-agente (PREGUNTA, por el bus): `{project_id, balance?, resultado?, saldos?, plantillas?\|vocabulario?, negocio?, tono?, ejercicio?}` → `{project_id, frases[], texto, cifras, fuente, narrado, abierto}`. Narra con plantillas declaradas o estructura por defecto; solo cita cifras reales. Responde por `narrador-estados.narrar.response`. Payload inválido → `narrador-estados.narrar.failed`. |

### Publishes

| Evento | Descripción |
|---|---|
| `narrador-estados.narrar.response` | Respuesta RPC correlada de la op `narrar` (una sola cara: el bus). |
| `narrador-estados.narrar.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `narrar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `narrar` | **PREGUNTA** (bus) | `{project_id, balance?, resultado?, saldos?, plantillas?\|vocabulario?, negocio?, tono?, ejercicio?}` | `{project_id, frases[], texto, cifras, fuente, narrado, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `narrador-estados.narrar` (`toolNarrar` → `_narrar`).

## Reglas de negocio

1. **Solo cifras reales**: la narración (`_componer`) cita únicamente cifras
   presentes; **un dato ausente NO se narra** (0 no es "no hay"). `cifras` las
   lista.
2. **Plantillas/vocabulario declarados**: si el negocio los declara, se usan; si no,
   estructura por defecto que respeta la honestidad.
3. **No calcula el balance ni el resultado**: los sube por EVENTO a C1
   (`balance-situacion.calcular.request`) y C2
   (`cuenta-resultados.calcular.request`).
4. **Sin estados** → `abierto.estados = 'no se recibieron balance ni resultado (ni
   declarados ni de C1/C2): no hay nada que narrar'`; `frases:[]`.
5. **Mitad fuzzy**: el *qué contar y cómo* lo decide el blueprint; la mitad refleja
   garantiza la honestidad de las cifras.
6. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
7. **No escribe, no persiste**.
8. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `narrar` — estados en lenguaje del negocio

```json
{
  "project_id": "e57a318a-...",
  "balance": { "activo": 50000, "pasivo": 20000, "patrimonio": 30000 },
  "resultado": { "ingresos": 80000, "gastos": 65000, "resultado": 15000 },
  "negocio": "panaderia",
  "tono": "cercano",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "frases": [ "Este ejercicio has ganado 15.000 euros.", "El activo asciende a 50.000 euros frente a un pasivo de 20.000." ], "texto": "Este ejercicio has ganado 15.000 euros. El activo asciende a 50.000 euros frente a un pasivo de 20.000.", "cifras": { "resultado": 15000, "activo": 50000, "pasivo": 20000 }, "fuente": "declarado", "narrado": true, "abierto": { "estados": null } }
```
Sin estados → `frases:[]` y `abierto.estados` declarado.

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `200 {frases:[], abierto.estados}` — sin estados no hay nada que narrar (honesto).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia delante (sube por evento)**: `balance-situacion.calcular.request` (C1),
  `cuenta-resultados.calcular.request` (C2).
- **Hacia atrás**: `aviso-al-negocio` (R1) sube `narrador-estados.narrar.request`
  cuando el aviso pide enriquecimiento.
- No escribe: compositor puro.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/narrador-estados/` (clase
  `NarradorEstados extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "narrar.request" module.json` y confirmar
  `balance-situacion.calcular.request` en `index.js`.
- **Test unitario**: balance+resultado → frases con cifras reales; sin estados →
  `frases:[]` + `abierto.estados`; sin `project_id` → `400 INVALID_INPUT`.

## Notas de implementación

- MICRO-AGENTE híbrido: lleva su `<mod>.blueprint.json` (mitad fuzzy) además del
  `index.js` reflejo; la regla anti-colisión impide declarar un evento a la vez en
  `module.json.subscribes` y `blueprint.eventos_que_escucho`.
- Helpers: `_narrar`, `_componer`, `_estadosDe`, `_num`, `toolNarrar`.
