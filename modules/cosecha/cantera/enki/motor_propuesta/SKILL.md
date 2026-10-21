---
name: motor-propuesta-impresion
description: >-
  Motor de propuesta puro: el siguiente modelo a imprimir por prioridad y
  antigüedad. Es una función determinista sin estado propio: recibe la cola y
  devuelve el candidato. Escucha proponer_siguiente.request y responde con
  proponer_siguiente.response (o *.failed). No persiste nada, no decide por
  sí mismo — solo propone. El orquestador_cola lo invoca por bus.
fuente: enki
when-to-use: "Entra encadenada por proceso-negocio (fase 4/5 de impresion-3d) o a mano para proponer cuál es el siguiente modelo a imprimir según prioridad y antigüedad. Útil cuando la máquina se libera y hay que decidir qué entra al cabezal."
dominio: impresion-3d
lente_dominio: propuesta
lente_tarea: decidir
tags: [impresion-3d, motor, propuesta, prioridad, puro, determinista, bus, fase4, fase5]
---

# Motor de Propuesta — impresión 3D

> **Qué es.** El motor puro que propone el siguiente modelo a imprimir. Es
> determinista y sin estado: entra la cola, sale el candidato. No guarda nada,
> no decide por su cuenta — propone.
>
> Código: `modules/motor_propuesta/` · habilita `motor_propuesta.*` por bus.

---

## 1 · Contrato de eventos (bus)

**Escucha:**

| Evento | Qué hace |
|---|---|
| `motor_propuesta.proponer_siguiente.request` | Recibe la cola y devuelve el candidato a imprimir. |

**Publica:**

| Evento | Cuándo |
|---|---|
| `motor_propuesta.proponer_siguiente.response` | Candidato propuesto. |
| `motor_propuesta.proponer_siguiente.failed` | No se pudo proponer (cola vacía o error). |

---

## 2 · Regla de decisión

El candidato se elige por **prioridad** y, a igual prioridad, por
**antigüedad** (el que lleva más tiempo esperando gana). Es una función pura:

```
proponer(cola) → candidato
  ordena por (prioridad ASC, antigüedad DESC)
  devuelve el primero
```

- **Prioridad**: menor número = mayor urgencia (o según la convención del
  dominio, verifica el módulo).
- **Antigüedad**: desempata entre modelos de igual prioridad.

---

## 3 · Uso típico

1. El orquestador pide el siguiente → `motor_propuesta.proponer_siguiente.request`
2. El motor devuelve el candidato en `proponer_siguiente.response`
3. El orquestador lo presenta para aprobación (o lo aprueba directo según el
   flujo).

---

## 4 · Pitfalls

- **Es puro**: no persistas estado aquí. Si necesitas recordar qué se propuso,
  que lo guarde el orquestador o la cola.
- **No decidas tú**: el motor propone; la *aprobación* es del orquestador o del
  humano. No saltes ese paso.
- **Cola vacía**: devuelve `*.failed` o un candidato nulo — no inventes un
  modelo.
- **Verifica en disco**, no creas al reporte: confirma el response emitido.
