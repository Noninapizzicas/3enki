---
name: orquestador
description: >-
  MICRO-AGENTE del vertical NICHOS (cerebro reactivo): escucha pulsos del bus
  y encadena el ciclo completo del vertical (semilla → sondeo → validacion →
  construccion → salud). Correlaciona ciclos activos en memoria. Gate de
  operacion para degradacion honesta. Carga este modulo cuando necesites
  entender como se orquesta el ciclo de descubrimiento del vertical NICHOS,
  cuando quieras consultar los ciclos activos, o cuando el gate de operacion
  cambie de estado.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, orquestador, ciclo, bus, mqtt, gate]
---

# nichos . orquestador

> **Que es.** Cerebro reactivo del vertical NICHOS. No es RPC: reacciona a
> pulsos del bus y encadena el ciclo completo de descubrimiento. El estado
> de cada ciclo vive en un Map en memoria (no persiste).
>
> Codigo: `modules/nichos/orquestador/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (reactivo por bus, sin estado persistido).
- Base: `ModuloHibridoReflejo`.
- Sin store. Estado en memoria: `Map<correlation_id, CicloActivo>`.
- LLM: `llm.complete.request` / `llm.complete.response` (ai-gateway) — para
  decisiones de orquestacion futuras (priorizacion, filtrado).

## Ciclo de descubrimiento (5 pasos)

```
semilla.capturada
  → registra ciclo (ESPERANDO_NORMALIZACION)
      → semilla.normalizada
          → dispara sondeo (SONDEANDO)
              → sondeo.completado
                  → dispara batch-validacion (VALIDANDO)
                      → validacion.lote.completado
                          → dispara ensamblaje de viables (CONSTRUYENDO)
                              → construccion.completada
                                  → actualiza cuadro salud, cierra ciclo (COMPLETADO)
```

## Estados del ciclo

| Estado | Significado |
|---|---|
| `esperando_normalizacion` | semilla capturada, esperando normalizacion del LLM |
| `sondeando` | sondeo del territorio en curso |
| `validando` | batch-validacion de candidatos en curso |
| `construyendo` | ensamblaje de viables en curso |
| `completado` | ciclo cerrado (se elimina del Map) |

## Senales que escucha (fire-and-forget)

| Evento | Handler | Accion |
|---|---|---|
| `nichos.semilla.capturada` | `onSemillaCapturada` | registra ciclo nuevo si gate abierto |
| `nichos.semilla.normalizada` | `onSemillaNormalizada` | dispara sondeo del territorio |
| `nichos.sondeo.completado` | `onSondeoCompletado` | dispara batch-validacion |
| `nichos.validacion.lote.completado` | `onValidacionCompletada` | dispara ensamblaje o cierra si sin viables |
| `nichos.construccion.completada` | `onConstruccionCompletada` | actualiza salud, cierra ciclo |
| `nichos.gate.operacion.abierto` | `onGateAbierto` | permite nuevos ciclos |
| `nichos.gate.operacion.cerrado` | `onGateCerrado` | degradacion honesta |

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.orquestador.ciclo.iniciado` | al registrar un ciclo nuevo | `{ciclo_id, semilla, project_id, timestamp}` |
| `nichos.orquestador.ciclo.completado` | al cerrar un ciclo | `{ciclo_id, resultado, duracion_ms, project_id, timestamp}` |

## Requests que dispara

| Evento | Paso | Payload clave |
|---|---|---|
| `nichos.territorio.sondear.request` | 2 (tras normalizar) | `{semilla_normalizada, correlation_id}` |
| `nichos.validacion.lote.correr.request` | 3 (tras sondeo) | `{candidatos, correlation_id}` |
| `nichos.solucion.ensamblar.request` | 4 (tras validacion) | `{viables, correlation_id}` |
| `nichos.cuadro.salud.actualizar.request` | 5 (tras construccion) | `{resultado, correlation_id}` |

## Gate de operacion

- **Abierto** (default): acepta nuevas semillas y arranca ciclos.
- **Cerrado**: no arranca ciclos nuevos. Los ciclos ya activos siguen hasta
  completarse. El orquestador degrada honestamente: registra el evento e ignora.

## Invariantes

- **Sin estado persistido**: los ciclos activos viven en el Map. Si reinicia,
  se pierden. Trade-off aceptado: el dueno relanza la semilla.
- **Reactivo puro**: no inicia nada por si mismo. Solo reacciona a pulsos.
- **Correlacion por bus**: el `correlation_id` es la clave que enlaza todos los
  pasos del ciclo.
- **Sin viables = ciclo cerrado**: si la validacion no produce viables, el ciclo
  se cierra sin ensamblaje.

## Donde encaja en el vertical NICHOS

- **Centro del grafo**: conecta todos los bloques del vertical por eventos.
- **Escucha de**: capturador-semilla, normalizador-semilla, sondeo, validacion,
  construccion, gate.
- **Dispara a**: sondeo, validacion-lote, ensamblaje, cuadro-salud.
