---
name: consulta-cuentas-bajo-demanda
description: >-
  Skill FULL del módulo PUENTE `consulta-cuentas-bajo-demanda` de la vertical contabilidad (Enki).
  Es la PUERTA PULL: conecta la pregunta del dueño con el cálculo por petición, sin imponer
  cadencia. Interpreta la pregunta (Q2 best-effort), pide la cifra al calculador que toca por tipo
  (mayor-balanza, saldo-tesoreria, cuenta-resultados) y sella con cobertura (Q3) y estado borrador/
  validado (L1). Sin cifra → ABIERTO (0 no es «no hay»). Escucha `contabilidad.asiento_asentado` y
  `contabilidad.ejercicio_cerrado`. Sin store propio. La op `preguntar` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando el dueño pregunte por una cuenta/saldo/cifra bajo demanda
    (RPC consulta-cuentas-bajo-demanda.preguntar.request).
  - Cuando depures por qué la cifra sale `null` (`abierto.cifra`) o de dónde salió (`calculador`).
  - Cuando quieras entender su contrato de eventos y su encadenado con Q2/Q3/L1.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, stateless, contabilidad, analitica, consulta, pull, cobertura]
---

# consulta-cuentas-bajo-demanda — PUENTE pull de preguntas del dueño

## Qué hace el módulo

`consulta-cuentas-bajo-demanda` es un **PUENTE** (Q1, hoja del plan) de la vertical **contabilidad**,
eje **analítica**. Es la **PUERTA PULL**: conecta la **pregunta del dueño** con el **cálculo por
petición**. **No impone cadencia** (`modo:'pull'`, `impone_cadencia:false`): responde cuando se le
pregunta.

Compone la respuesta en tres pasos:
1. **Interpreta la pregunta** → `puente-lenguaje-dueno.a_consulta.request` (Q2, best-effort) o una
   consulta declarada;
2. **Pide la cifra** al **calculador que toca por tipo** (`CALCULADORES`: `saldos`/`mayor` →
   mayor-balanza; `caja`/`tesoreria` → saldo-tesoreria; `resultado`/`ingresos`/`gastos` → cuenta-resultados);
3. **Sella** con cobertura (`sello-cobertura.sellar.request`, Q3) y estado borrador/validado
   (`marca-borrador-validado.estado.request`, L1).

**Honestidad (invariante 13):** sin cifra → `abierto.cifra`; el **0 no es «no hay», es desconocido**.
Sin consulta → `abierto.consulta` (no se adivina qué calcular).

**No persiste** (STATELESS); observa asientos (tope 1000) y cierres (tope 100). La op `preguntar` es
**PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `consulta-cuentas-bajo-demanda.preguntar.request` | `onPreguntarRequest` | RPC puente (PREGUNTA): `{project_id, pregunta?, consulta?, tipo?, cuenta?, prefijo?, cifra?, fecha?, ejercicio?, objeto?}` → `{modo, consulta, cuenta, calculador, cifra, cobertura, abierto}`. Delega en `_atender` → `_preguntar`. Si `status ≠ 200` publica `.failed`. Responde por `consulta-cuentas-bajo-demanda.preguntar.response`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (escritor-diario B2): el libro cambió → se observa el asiento (tope 1000). |
| `contabilidad.ejercicio_cerrado` | `onEjercicioCerrado` | Fire-and-forget (cierre-ejercicio C4): cerró el ejercicio → se observa el cierre (tope 100) si `estado === 'cerrado'`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `consulta-cuentas-bajo-demanda.preguntar.response` | Respuesta RPC correlada de la op `preguntar`. |
| `consulta-cuentas-bajo-demanda.preguntar.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |

> **NO publica un hecho de dominio**: es una puerta pull (compone y responde). No escribe estado.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `preguntar` | **PREGUNTA** | `{project_id, pregunta?, consulta?, tipo?, cuenta?, prefijo?, cifra?, fecha?, ejercicio?, objeto?}` | `{project_id, tipo, modo:'pull', impone_cadencia:false, pregunta, consulta, cuenta, calculador, cifra, cobertura:{sello, estado}, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **La consulta** (`_consulta`): declarada (`consulta` objeto) → o `puente-lenguaje-dueno.a_consulta.request`
   (Q2, timeout 800 ms) a partir de `pregunta`. Sin consulta → `abierto.consulta`.
2. **La cifra** (`_cifra`): declarada (`cifra`) → o se pide al **calculador por tipo** (`CALCULADORES`)
   con timeout 800 ms (por defecto `saldos` → `mayor-balanza.saldos.request`). Se extrae `resultado`
   → `saldo` → `saldos` (array).
3. **Sin cifra → ABIERTO**: `cifra:null` y `abierto.cifra` («0 no es 'no hay', es desconocido»).
4. **Los sellos** (`_sellos`, timeout 700 ms): `sello-cobertura.sellar.request` (Q3) y
   `marca-borrador-validado.estado.request` (L1), con la `objeto`/project. Best-effort.
5. **Puerta pull**: `modo:'pull'`, `impone_cadencia:false` — responde; no programa.
6. **HTTP exacto**: éxito `200`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Preguntar por el saldo de la caja

```json
{ "project_id": "e57a318a-...", "tipo": "caja", "correlation_id": "abc-123" }
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "consulta-cuentas-bajo-demanda",
  "modo": "pull",
  "impone_cadencia": false,
  "pregunta": null,
  "consulta": null,
  "cuenta": null,
  "calculador": "saldo-tesoreria.calcular.request",
  "cifra": 12500.75,
  "cobertura": { "sello": { … }, "estado": { … } },
  "abierto": { "consulta": "no hay consulta (ni declarada ni interpretada por Q2): no se adivina que calcular", "cifra": null }
}
```

### Preguntar con pregunta en lenguaje natural

```json
{ "project_id": "e57a318a-...", "pregunta": "cuanto tengo en el banco y cuanto he gastado este mes?" }
```
→ interpreta vía Q2 (`puente-lenguaje-dueno.a_consulta.request`) y pide la cifra.

### Sin cifra — ABIERTO

→ `cifra:null`, `abierto.cifra = "no llego la cifra (ni declarada ni de un calculador vivo): la cuenta queda ABIERTA (0 no es \"no hay\", es desconocido)"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `consulta-cuentas-bajo-demanda.preguntar.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_preguntar`. |
| (no es error) | 200 | Sin consulta o sin cifra → ABIERTO (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.asiento_asentado` (B2), `contabilidad.ejercicio_cerrado` (C4).
- **Llama por RPC (best-effort)**: `puente-lenguaje-dueno.a_consulta.request` (Q2),
  `mayor-balanza.saldos.request` / `saldo-tesoreria.calcular.request` / `cuenta-resultados.calcular.request`
  (calculadores), `sello-cobertura.sellar.request` (Q3, 700 ms),
  `marca-borrador-validado.estado.request` (L1, 700 ms).

## Verificación

1. Fichero: `modules/contabilidad-analitica/consulta-cuentas-bajo-demanda/`.
2. Eventos reales: subscribes `consulta-cuentas-bajo-demanda.preguntar.request`,
   `contabilidad.asiento_asentado`, `contabilidad.ejercicio_cerrado`; publishes
   `consulta-cuentas-bajo-demanda.preguntar.response`, `.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-analitica/consulta-cuentas-bajo-demanda/index.js
   # → consulta-cuentas-bajo-demanda.preguntar.failed
   # → puente-lenguaje-dueno.a_consulta.request / sello-cobertura.sellar.request / marca-borrador-validado.estado.request / mayor-balanza.saldos.request (…)
   ```
4. Test unitario (si existe): por tipo → calculador correcto; sin cifra → ABIERTO; sellos best-effort;
   sin `project_id` → 400 + failed.
