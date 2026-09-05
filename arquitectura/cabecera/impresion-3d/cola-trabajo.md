---
id: impresion-3d/cola-trabajo
dominio: impresion-3d
resumen: El taller de impresión 3D (SPARKX i7, PETG): cola de modelos con prioridad, motor de propuesta puro, orquestador del ciclo libre→propuesta→aprobación→imprimiendo→impreso, diseñador paramétrico (OpenSCAD) y buscador web de modelos. Objetivo: mantener la máquina ocupada.
fuentes:
  - modules/cola_modelos/index.js
  - modules/cola_modelos/module.json
  - modules/motor_propuesta/index.js
  - modules/motor_propuesta/module.json
  - modules/orquestador_cola/index.js
  - modules/orquestador_cola/module.json
  - modules/orquestador_cola/orquestador_cola.blueprint.json
  - modules/disenador_parametrico/index.js
  - modules/disenador_parametrico/module.json
  - modules/buscador_www/index.js
  - modules/buscador_www/module.json
  - frontend/src/lib/modules/cola-impresion/manifest.json
  - frontend/src/lib/modules/cola-impresion/index.ts
  - frontend/src/lib/modules/cola-impresion/ColaImpresionPanel.svelte
  - frontend/src/lib/stores/cola-impresion.ts
verificado: 2026-09-04
---

# IMPRESIÓN-3D — cola de trabajo del taller (SPARKX i7 · PETG)

> Taller personal de impresión 3D (uso propio, no venta). Objetivo: **mantener la máquina ocupada**.
> El sistema es una cola de modelos con prioridad que propone el siguiente trabajo al liberarse la
> máquina, con puentes a OpenSCAD (diseño paramétrico) y a la web (descubrimiento de modelos).
> Aterrizaje del diseño OOP puro (`esquemas/diseno-oop.md`) sobre el runtime de Enki, según el plan
> `esquemas/plan-construccion.md` (7 pasos, todos completados).

## El ciclo (event-driven, desacoplado)

```
libre → propuesta → aprobación → imprimiendo → impreso → libre
   ↑                                                      │
   └────────────────── maquina.liberada ──────────────────┘
```

- **`cola_modelos`** — CRIPTA (CustodioModelos, aggregate root). Único escritor de
  `/impresion-3d/cola/modelos.json`. RPCs: `agregar`, `obtener_por_prioridad`,
  `actualizar_estado`, `listar`. Invariantes: id único, singleton `imprimiendo`,
  transiciones legales con freno, estado inicial `pendiente`. Persistencia fs tmp+rename.
- **`motor_propuesta`** — REFLEJO PURO (sin store, sin E/S). `proponer_siguiente(cola)`
  filtra `pendiente`, ordena por prioridad desc → fecha_alta asc (ReglaPrioridadPorDefecto,
  Strategy por config). Cero juicio: no aprueba ni desaprueba.
- **`orquestador_cola`** — HÍBRIDO. `al_liberarse` + `al_terminar_impresion`. Reflejo compone
  cola_modelos + motor_propuesta (transiciones legales, reversión de fallo, `ociosa()` explícita);
  blueprint presenta candidato y decide aprobar/rechazar (LLM de página, SIN agente).
- **`disenador_parametrico`** — REFLEJO + PUENTE a skill openscad-mcp. `generar_stl`,
  `estimar_tiempo` (alimenta `Modelo.tiempo_estimado`).
- **`buscador_www`** — REFLEJO + PUENTE a fuentes web. `buscar_por_necesidad` → `Lista<Candidato>`
  (DTO de entrada; solo pasa a Modelo vía `cola_modelos.agregar`). Candidatos vacíos no rompen el ciclo.

## Contrato de bus (request/response)

```
core/<core_id>/api/request/<dominio>/<accion> → core/<core_id>/api/response/<correlation_id>
```

| RPC | Respuesta |
|---|---|
| `cola_modelos.agregar` | 201 `{id}` · 409 `ID_YA_EXISTE` · 422 `INVARIANTE_ROTA` |
| `cola_modelos.obtener_por_prioridad` | 200 `{pendientes:[Modelo...]}` (mayor→menor prioridad) |
| `cola_modelos.actualizar_estado` | 200 `{modelo}` · 409 `TRANSICION_INVALIDA` · 404 `NO_EXISTE` |
| `cola_modelos.listar` | 200 `{modelos:[Modelo...]}` |
| `motor_propuesta.proponer_siguiente` | 200 `{propuesta:Modelo}` · 200 `{propuesta:null, causa:'cola_vacia'}` |
| `orquestador_cola.al_liberarse` | 200 `{ocupacion:'imprimiendo', modelo}` · 200 `{ocupacion:'ociosa', causa}` |
| `orquestador_cola.al_terminar_impresion` | 200 `{ocupacion:'imprimiendo'\|'ociosa', modelo?}` |
| `disenador_parametrico.generar_stl` | 200 `{archivo}` · 422 `PARAMETROS_INVALIDOS` |
| `disenador_parametrico.estimar_tiempo` | 200 `{minutos}` |
| `buscador_www.buscar_por_necesidad` | 200 `{candidatos:[Candidato...]}` |

Eventos de dominio (fire-and-forget, CREATE-ONLY):
`cola.modelo.entra` · `cola.modelo.estado.cambia` · `cola.propuesta.siguiente` ·
`maquina.liberada` (dispara `al_liberarse`) · `cola.ociosa` (señal explícita, nunca silencio).

## Invariantes clave (gate de la cúpula de eventos)

1. **Cola vacía** → `proponer_siguiente([])` = Ausente; `alLiberarse()` = `ociosa()` con causa. Nunca silencio.
2. **Empate** → desempata por `fecha_alta` asc. Determinista.
3. **`imprimiendo` nunca se propone** — filtrado por `estado.puedeSerPropuesto()`.
4. **Transición inválida sin mutar** — `pendiente→impreso` directo = 409, store intacto. `impreso` es foco absorbente.
5. **Aprobación rechazada** → marca hueco + reintenta `al_liberarse()` con el siguiente.
6. **Fallo al arrancar** → revierte a `pendiente` y reintenta, sin perder trabajo.
7. **`tiempo_estimado`/prioridad sugerida son sugerencias** — solo se convierten en Modelo vía `agregar` (fuerza `pendiente`, prioridad `>=0`).
8. **Singleton `imprimiendo`** — un solo trabajo a la vez (segundo = 409).
9. **El motor es cálculo puro, cero juicio** — no muta nada.
10. **El custodio es dueño único del store** — nadie más escribe `modelos.json`.
11. **Ciclo cerrado con respuesta** — todo camino termina en response u evento.

## Frontend

`cola-impresion` (work-bar + panel): store `cola-impresion.ts` + módulo lazy
(manifest + index + `ColaImpresionPanel.svelte`) que consume los 5 módulos por MQTT.
Compilado en el bundle de producción (chunk `DPsf4Io_.js`).

## Estado

✓ 5 módulos backend construidos, cargados y verificados en runtime (FASE 4).
✓ Frontend `cola-impresion` construido, typecheck limpio, build de producción generado (FASE 7).
✓ Cola sembrada con el set ShelfFUXX 16mm (conector-90, conector-T, conector-recto, tapon) en PETG.
✓ Ciclo completo probado: agregar → proponer → imprimiendo → impreso → encadena.
✓ Sin rpc_fantasma de los 5 módulos (el único fantasma del bus es `recetas.actualizar_precio.request`, ajeno).
◑ Deuda técnica consciente: reglas de prioridad/aprobación/fuentes con defaults (PASO 7 del plan
  quedó con defaults en vez de reglas afinadas con el dueño).
