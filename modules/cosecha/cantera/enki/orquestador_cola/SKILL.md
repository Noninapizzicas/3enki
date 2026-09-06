---
name: orquestador-cola-impresion
description: >-
  Orquestador del ciclo de impresión 3D: libre → propuesta → aprobación →
  imprimiendo → impreso → libre. Compone cola_modelos + motor_propuesta por
  bus, sin duplicar su estado. Escucha al_liberarse, al_terminar_impresion y
  aprobar_candidato, y emite los eventos de ciclo (cola.propuesta.siguiente,
  cola.pendiente_aprobacion, cola.candidato_aprobado, cola.ociosa, etc.).
  Objetivo: mantener la máquina ocupada.
fuente: enki
when-to-use: "Entra encadenada por proceso-negocio (fase 4/5 de impresion-3d) o a mano para operar el ciclo de impresión: cuando la máquina se libera, cuando termina una impresión, o para aprobar un candidato propuesto. Es el pegamento que mantiene la máquina ocupada."
dominio: impresion-3d
lente_dominio: orquestacion
lente_tarea: encadenar
tags: [impresion-3d, orquestador, ciclo, cola, propuesta, aprobacion, bus, fase4, fase5]
---

# Orquestador de Cola — impresión 3D

> **Qué es.** El orquestador del ciclo de impresión 3D. Compone la cola
> (`cola_modelos`) y el motor de propuesta (`motor_propuesta`) por bus para
> mantener la máquina ocupada: cuando se libera, propone el siguiente; cuando
> se aprueba, lo manda a imprimir; cuando termina, libera y vuelve a proponer.
>
> Código: `modules/orquestador_cola/` · habilita `cola.*` por bus.

---

## 1 · Contrato de eventos (bus)

**Escucha:**

| Evento | Qué hace |
|---|---|
| `orquestador_cola.al_liberarse.request` | La máquina se liberó → propone el siguiente modelo. |
| `orquestador_cola.al_terminar_impresion.request` | Terminó una impresión → libera el modelo y vuelve a proponer. |
| `orquestador_cola.aprobar_candidato.request` | Se aprueba el candidato propuesto → pasa a imprimiendo. |

**Publica (eventos de ciclo):**

| Evento | Cuándo |
|---|---|
| `cola.propuesta.siguiente` | Se propuso el siguiente modelo. |
| `cola.propuesta.rechazada` | El candidato fue rechazado. |
| `cola.pendiente_aprobacion` | Hay un candidato esperando aprobación. |
| `cola.candidato_aprobado` | El candidato fue aprobado → a imprimir. |
| `cola.ociosa` | No hay nada que imprimir, la máquina queda ociosa. |
| `orquestador_cola.al_liberarse.failed` | Falló al liberar. |
| `orquestador_cola.al_terminar_impresion.failed` | Falló al terminar impresión. |

---

## 2 · El ciclo

```
máquina libre ──al_liberarse──▶ propone siguiente (motor_propuesta)
   ▲                                        │
   │                                        ▼
   │                              pendiente_aprobacion
   │                                        │
   │                              aprobar_candidato
   │                                        ▼
   │                              imprimiendo (cola_modelos)
   │                                        │
   └──── al_terminar_impresion ◀───────────┘
              │
              ▼
        libera + vuelve a proponer
```

**Objetivo**: la máquina nunca queda ociosa si hay cola. Si no hay candidato,
emite `cola.ociosa`.

---

## 3 · Uso típico

1. **Máquina libre** → `orquestador_cola.al_liberarse.request`
2. **Aprobar candidato** → `orquestador_cola.aprobar_candidato.request { model_id }`
3. **Terminó impresión** → `orquestador_cola.al_terminar_impresion.request { model_id }`

---

## 4 · Pitfalls

- **No dupliques estado**: la cola vive en `cola_modelos`, la decisión en
  `motor_propuesta`. El orquestador solo encadena eventos.
- **Mantén la máquina ocupada**: si hay cola y la máquina está libre, propón.
  No dejes el ciclo parado.
- **Aprobación**: no saltes el paso de aprobación si el flujo lo exige — el
  candidato se aprueba antes de imprimir.
- **Verifica en disco**, no creas al reporte: confirma el evento de ciclo
  emitido y el estado de la cola.
