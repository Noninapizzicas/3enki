---
name: cola-modelos-impresion
description: >-
  Cripta de la cola de impresión 3D: modelos, prioridad y máquina de estados.
  Gestiona el ciclo de vida de cada modelo (libre → imprimiendo → impreso) y
  su prioridad. Escucha requests por bus (agregar, obtener_por_prioridad,
  actualizar_estado, listar, ya_impreso) y emite los eventos de dominio
  (modelo_agregado, modelo_imprimiendo, modelo_impreso) más sus pares *.failed.
  Es la fuente de verdad de la cola: el orquestador_cola la compone por bus,
  nunca la duplica.
fuente: enki
when-to-use: "Entra encadenada por proceso-negocio (fase 4/5 de impresion-3d) o a mano para operar la cola de modelos de impresión 3D: agregar un modelo, consultar el siguiente por prioridad, cambiar su estado, listar la cola o marcar algo como ya impreso. También para entender cómo se persiste y ordena la cola."
dominio: impresion-3d
lente_dominio: cola
lente_tarea: operar
tags: [impresion-3d, cola, modelos, prioridad, state-machine, bus, fase4, fase5]
---

# Cola de Modelos — impresión 3D

> **Qué es.** La cripta de la cola de impresión 3D. Guarda los modelos con su
> prioridad y su estado, y expone la máquina de estados del ciclo de vida.
> No decide qué imprimir (eso es `motor_propuesta`); solo guarda y ordena.
>
> Código: `modules/cola_modelos/` · habilita `cola_modelos.*` por bus.

---

## 1 · Contrato de eventos (bus)

**Escucha (requests):**

| Evento | Qué hace |
|---|---|
| `cola_modelos.agregar.request` | Añade un modelo a la cola con su prioridad. |
| `cola_modelos.obtener_por_prioridad.request` | Devuelve el siguiente modelo por prioridad y antigüedad. |
| `cola_modelos.actualizar_estado.request` | Cambia el estado de un modelo (libre → imprimiendo → impreso). |
| `cola_modelos.listar.request` | Lista la cola. |
| `cola_modelos.ya_impreso.request` | Marca un modelo como ya impreso. |
| `project.activated` | Hidrata el estado al activarse el proyecto. |

**Publica (eventos de dominio):**

| Evento | Cuándo |
|---|---|
| `cola_modelos.modelo_agregado` | Un modelo entró a la cola. |
| `cola_modelos.modelo_imprimiendo` | Un modelo pasó a imprimiéndose. |
| `cola_modelos.modelo_impreso` | Un modelo terminó de imprimirse. |
| `cola_modelos.agregar.failed` | Falló al agregar. |
| `cola_modelos.actualizar_estado.failed` | Falló al cambiar estado. |

**Regla del bus:** todo flujo responde — cada request emite su evento de éxito
o su par `*.failed` canónico. No dejes un request sin respuesta.

---

## 2 · Máquina de estados del modelo

```
libre ──agregar──▶ en_cola ──actualizar_estado──▶ imprimiendo ──▶ impreso
   ▲                                                              │
   └────────────────────── ya_impreso / liberar ◀─────────────────┘
```

- **libre / en_cola**: esperando turno, ordenado por prioridad y antigüedad.
- **imprimiendo**: la máquina lo está produciendo.
- **impreso**: terminado; puede volver a libre (reimpresión) o quedar como histórico.

---

## 3 · Uso típico

1. **Agregar un modelo** → `cola_modelos.agregar.request { model_id, prioridad }`
2. **Consultar el siguiente** → `cola_modelos.obtener_por_prioridad.request`
3. **Marcar imprimiendo** → `cola_modelos.actualizar_estado.request { model_id, estado: 'imprimiendo' }`
4. **Marcar impreso** → `cola_modelos.actualizar_estado.request { model_id, estado: 'impreso' }`

El `orquestador_cola` compone este módulo con `motor_propuesta` por bus: la
cola guarda, el motor propone, el orquestador encadena el ciclo.

---

## 4 · Pitfalls

- **No dupliques la cola**: la fuente de verdad es `cola_modelos`. El
  orquestador la lee por bus, no mantiene su propia copia.
- **No decidas aquí**: la prioridad la ordena la cola, pero la *decisión* de
  qué imprimir es del motor de propuesta. No mezcles responsabilidades.
- **Hidratación**: al activarse el proyecto (`project.activated`) la cola
  carga su estado. Si un mapa está vacío y el proyecto no está activo, el
  acceso devuelve `candidato_no_encontrado` — verifica `project.activated`
  antes de operar.
- **Verifica en disco**, no creas al reporte: confirma el evento emitido y el
  estado persistido.
