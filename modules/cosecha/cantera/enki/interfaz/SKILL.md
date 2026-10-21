---
name: interfaz
description: Superficie de dominio del dueño del radar — ver, confirmar, añadir y corregir candidatos desde el chat. El cajón del blueprint interpreta la intención libre; el reflejo hace los RPC deterministas a banco y evaluador.
when-to-use: El dueño pregunta por candidatos del banco, quiere ver la ficha completa de uno, decide aprobar/rechazar (confirmar_veredicto), añade un candidato a mano o corrige la ficha de uno en observación (M10).
tags: [radar, interfaz, chat, M11, M10, híbrido]
lente_dominio: null
---

# interfaz — el puente entre el dueño y el dominio del radar (híbrido)

Módulo HÍBRIDO (blueprint_driven): el **cajón del blueprint**
(`interfaz.blueprint.json`) interpreta la intención libre del chat
(`interfaz.intencion.request`, anti-colisión: solo en el blueprint) y delega;
el **reflejo** (este fichero) ejecuta los 5 RPC deterministas hacia banco y
evaluador. **No persiste estado: el estado vive en los custodios.**

## Los 5 verbos del dueño

| RPC | qué hace | vía |
|---|---|---|
| `interfaz.listar.request` | vista de candidatos con estado (el tablero) | banco.listar.request |
| `interfaz.ver.request` | ficha completa transparente (M11 — el dueño ve TODO) | evaluador.ficha.request |
| `interfaz.confirmar_veredicto.request` | la voz del dueño: PASA / NO_PASA | emite evento; el banco aplica |
| `interfaz.anadir_manual.request` | candidato a mano (fuente 'manual') | banco.anadir.request → 201 |
| `interfaz.corregir_ficha.request` | M10: el dueño aporta el dato que faltaba | banco.corregir_ficha + re-evaluación inmediata |

## Reglas de dominio

- **M11 — la decisión es humana**: `confirmar_veredicto` solo valida y emite
  `interfaz.veredicto_confirmado`; el BANCO (único escritor) aplica la transición
  (sella PASA o revierte a RECHAZADO). Todo fallo de validación emite el par
  canónico `interfaz.confirmar_veredicto.failed`.
- `confirmacion` ∈ { PASA, NO_PASA } (400 INVALID_INPUT si no).
- **M10 — corregir_ficha**: banco.corregir_ficha (EN_OBSERVACION → EN_EVALUACION)
  + `evaluador.evaluar.request` inmediato. Si el evaluador no responde, responde
  200 con `re_evaluacion: { pendiente: true }` — se re-evaluará en el próximo ciclo.
- `anadir_manual`: url opcional (si falta, genera `manual://<slug-del-titulo>`);
  sin candidato devuelto → 409 CONFLICT_STATE candidato_ya_existente_o_incompleto.
- Sin estado propio: no persiste, no registra interruptor, cero egress externo.

## Eventos que emite

- `interfaz.veredicto_confirmado` — { project_id, candidatoId, confirmacion } (el banco aplica)
- `interfaz.candidato_manual_anadido` — { project_id, candidato } (tras 201)
- `interfaz.confirmar_veredicto.failed` — { project_id, candidatoId, code, message, details }

## Errores canónicos

- 400 INVALID_INPUT: project_id · candidatoId · confirmacion (∈ PASA/NO_PASA) · ficha (objeto)
- 503 DEPENDENCIA_NO_DISPONIBLE: banco/evaluador no respondieron al RPC
- 409 CONFLICT_STATE: anadir_manual con candidato ya existente o incompleto
- traducción de errores upstream: `_traducirError` propaga code/message/details del custodio

## Pitfalls (verificados en vivo)

- **interfaz.anadir_manual deja el candidato en CRUDO sin dictamen** — NO encadena
  evaluar (a diferencia de corregir_ficha). Para CRUDO→APROBADO hay que disparar
  `evaluador.evaluar.request` aparte tras añadirlo.
- La decisión final la confirma el dueño; la interfaz jamás decide sola (M11).
- ver la ficha (interfaz.ver) = la vía de transparencia: el dueño ve criterio por criterio.
