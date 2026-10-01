---
name: conceptos-extra-nomina
description: >-
  Skill FULL del módulo REFLEJO STATELESS `conceptos-extra-nomina` de la vertical
  contabilidad (Enki, eje fiscal). Cálculo DETERMINISTA de la IMPUTACIÓN de
  dietas, especie, finiquito y paga extra (naturaleza GASTO + cuenta sugerida),
  NO del importe (que lo declara la nómina). Tipo desconocido → imputación
  abierta (no se inventa). No escribe (el que escribe es B2 si toca), no
  persiste; su cara es el bus. Escucha contabilidad.nomina_recibida.
when-to-use: >-
  - Cuando necesites imputar los conceptos extra de una nómina
    (RPC conceptos-extra-nomina.imputar.request).
  - Cuando depures una imputación abierta (concepto sin tipo/importe → no se
    estima) o un 400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y el
    mapa DIETAS/ESPECIE/FINIQUITO/PAGA_EXTRA.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, fiscal, nomina, dietas, finiquito, imputacion]
---

# conceptos-extra-nomina — REFLEJO STATELESS de la imputación de conceptos extra

## Qué hace el módulo

`conceptos-extra-nomina` es un **REFLEJO STATELESS** (G9, hoja del plan, eje
fiscal): calcula la **IMPUTACIÓN** (naturaleza + cuenta sugerida) de los conceptos
extra de una nómina — dietas, especie, finiquito, paga extra — de forma
**determinista**. Lo que **NO** calcula es el **importe** (eso lo declara la
nómina).

Trabaja sobre un **mapa estructural** de tipos conocidos → naturaleza GASTO +
cuenta sugerida; la cuenta concreta es **declarable por el jefe**; un tipo
desconocido deja la imputación **abierta** (no se inventa). **Invariante 13**: un
concepto sin tipo/importe queda abierto — no se estima. No escribe, no persiste;
el que escribe si toca es `escritor-diario` (B2). Su op es **CLASE PREGUNTA** (va
por el bus, sin panel). Escucha `contabilidad.nomina_recibida` (G4, emitido por
`puerto-nomina`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `conceptos-extra-nomina.imputar.request` | `onImputarRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, conceptos:[{tipo,importe?,cuenta?}], periodo?}` → `{project_id, imputaciones, num, total, determinista, escritor:'escritor-diario', abierto}`. Imputa cada concepto por tipo conocido; sin tipo/importe → abierto (no estima). Responde por `conceptos-extra-nomina.imputar.response`. Payload inválido → `conceptos-extra-nomina.imputar.failed`. |
| `contabilidad.nomina_recibida` | `onNominaRecibida` | Fire-and-forget (G4 puerto-nomina): se recibió una nómina ya emitida por un origen externo. Si trae conceptos extra declarados, se calcula su imputación (no escribe; informa); si no trae, no se inventa nada. |

### Publishes

| Evento | Descripción |
|---|---|
| `conceptos-extra-nomina.imputar.response` | Respuesta RPC correlada de la op `imputar` (una sola cara: el bus). |
| `conceptos-extra-nomina.imputar.failed` | Par de fallo determinista: falta `project_id` o `conceptos` → `{status, code, message}`. Cierra el círculo de `imputar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `imputar` | **PREGUNTA** (bus, sin panel) | `{project_id, conceptos:[{tipo,importe?,cuenta?}], periodo?}` | `{project_id, imputaciones, num, total, determinista, escritor:'escritor-diario', abierto}` | `400 INVALID_INPUT` (`project_id`, `conceptos`) |

Tool expuesta: `conceptos-extra-nomina.imputar` (`toolImputar` → `_imputar`).

## Reglas de negocio

1. **El mapa es estructural (constante `IMPUTACION_CONOCIDA`)**:
   - `DIETAS` → naturaleza `GASTO`, cuenta `629`
   - `ESPECIE` → naturaleza `GASTO`, cuenta `649`
   - `FINIQUITO` → naturaleza `GASTO`, cuenta `641`
   - `PAGA_EXTRA` → naturaleza `GASTO`, cuenta `640`
   La **cuenta concreta es declarable por el jefe**; el mapa solo sugiere.
2. **Invariante 13**: un concepto **sin tipo o sin importe** queda **abierto** — no
   se estima. El `abierto` del resultado agrega los huecos declarados.
3. **Tipo desconocido** → imputación abierta (no se inventa una cuenta nueva).
4. **No escribe, no persiste**: es reflejo; si hay que asentar, lo hace B2.
5. **Sin `conceptos` (lista vacía)** → `400 INVALID_INPUT conceptos`; sin
   `project_id` → `400 INVALID_INPUT`.
6. **`onNominaRecibida` no inventa**: si la nómina no trae conceptos extra
   declarados (`nomina.conceptos_extra` vacío) no se imputa nada. No publica
   `.response` (no es RPC).
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `imputar` — naturaleza y cuenta sugerida de cada extra

```json
{
  "project_id": "e57a318a-...",
  "conceptos": [
    { "tipo": "DIETAS", "importe": 120.0 },
    { "tipo": "PAGA_EXTRA", "importe": 1500.0 },
    { "tipo": "OTRO_RARO", "importe": 300.0 }
  ],
  "periodo": "2026-09",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "imputaciones": [ { "tipo": "DIETAS", "naturaleza": "GASTO", "cuenta": "629", "importe": 120.0 }, { "tipo": "PAGA_EXTRA", "naturaleza": "GASTO", "cuenta": "640", "importe": 1500.0 }, { "tipo": "OTRO_RARO", "abierto": { "tipo": "tipo desconocido: la imputacion queda abierta (no se inventa)" } } ], "num": 3, "total": 1920.0, "determinista": true, "escritor": "escritor-diario", "abierto": true }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `conceptos` — falta el campo.
- `200 {abierto:true}` — algún concepto quedó sin imputación determinista: no se
  estima (comportamiento honesto).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.nomina_recibida` (G4 `puerto-nomina`).
- **Hacia delante**: informa la imputación; el asiento lo escribe
  `escritor-diario` (B2) si toca. También sirve a los modelos fiscales
  (`modelo-303`, `modelo-390`) y a la nómina.
- No importa ni escribe a nadie.

## Verificación

- **Fichero**: `modules/contabilidad-fiscal/conceptos-extra-nomina/` (clase
  `ConceptosExtraNomina extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "nomina_recibida" module.json index.js` y
  `grep -F "IMPUTACION_CONOCIDA" index.js`.
- **Test unitario**: DIETAS/PAGA_EXTRA → cuenta 629/640; tipo desconocido →
  abierto; sin `conceptos` → `400 INVALID_INPUT` + `.failed`;
  `onNominaRecibida` sin extras no imputa.

## Notas de implementación

- Stateless: sin `PosPersistencia`.
- `onImputarRequest` delega en `_atender(...)`; si status ≠ 200 publica
  `conceptos-extra-nomina.imputar.failed`.
- `onNominaRecibida` lee `d.nomina.conceptos_extra` o `d.conceptos`; sin extras,
  retorna sin publicar.
- Helpers: `_imputar`, `toolImputar`.
