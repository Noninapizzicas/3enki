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
  - modules/cupula_stl/index.js
  - modules/cupula_stl/module.json
  - modules/cupula_gcode/index.js
  - modules/cupula_gcode/module.json
  - modules/estimador_tiempo/index.js
  - modules/estimador_tiempo/module.json
  - modules/puente_creality/index.js
  - modules/puente_creality/module.json
  - modules/horarios_casa/index.js
  - modules/horarios_casa/module.json
  - frontend/src/lib/modules/cola-impresion/manifest.json
  - frontend/src/lib/modules/cola-impresion/index.ts
  - frontend/src/lib/modules/cola-impresion/ColaImpresionPanel.svelte
  - frontend/src/lib/stores/cola-impresion.ts
verificado: 2026-09-06
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
- **`cupula_stl`** — CRIPTA (PASO 6). Custodia el STL/3MF UNIVERSAL (el MODELO 3D, una vez por pieza,
  sirve para CUALQUIER máquina). Single-writer de `/impresion-3d/stl/`. RPCs: `registrar`, `obtener`, `listar`.
- **`cupula_gcode`** — CRIPTA (PASO 7). Custodia el gcode POR MÁQUINA (la RECETA de UNA máquina, firmada
  y cacheada). A diferencia del STL, lleva `maquina` + hash/firma. Single-writer de `/impresion-3d/gcode/`.
  RPCs: `registrar`, `obtener_por_maquina`, `listar`.
- **`puente_creality`** — HÍBRIDO (PASO 8). Frontera con el PC del dueño (CrealityPrint V7.2.1).
  Orquesta slice STL→gcode, sube el gcode, arranca y monitorea la impresión. La detección de `complete`
  es por EVENTO (no polling): al terminar emite `maquina.liberada` para que el orquestador encadene.
- **`estimador_tiempo`** — REFLEJO PURO (PASO 9). Estima minutos por volumen/altura/material/velocidad,
  determinista, sin E/S. Alimenta `Modelo.tiempo_estimado`. Su PROPÓSITO es la PRESENCIA: el motor de
  propuesta usa `tiempo_estimado` + horarios en casa para decidir si la impresión termina con alguien.
- **`horarios_casa`** — CRIPTA (PASO 10). Ventanas de impresión POR PERSONA (4 perfiles en casa, cada uno
  con su ritmo). El orquestador consulta `ventana_activa` antes de proponer/arrancar: solo imprime dentro
  de la ventana de quien pidió la pieza (PRESENCIA). RPCs: `configurar_horario`, `obtener_horario`,
  `listar_horarios`, `ventana_activa`. `motor_propuesta` v0.2.0 integra `ReglaPrioridadConPresencia`.

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
`orquestador-impresion` (work-bar + panel): `OrquestadorPanel.svelte` consume el
orquestador — encadena el ciclo, propone siguiente, y muestra la **ociosidad explícita
con causa** (`cola.ociosa` → `ociosa · <causa>`, nunca silencio). El store suscribe
`cola.ociosa`, `cola.propuesta.siguiente` y `cola.propuesta.rechazada` además de los
eventos de `cola_modelos`.
Compilado en el bundle de producción (chunk `DPsf4Io_.js`).

## Estado

✓ 5 módulos backend construidos, cargados y verificados en runtime (FASE 4).
✓ Frontend `cola-impresion` construido, typecheck limpio, build de producción generado (FASE 7).
✓ Cola sembrada con el set ShelfFUXX 16mm (conector-90, conector-T, conector-recto, tapon) en PETG.
✓ Ciclo completo probado: agregar → proponer → imprimiendo → impreso → encadena.
✓ Sin rpc_fantasma de los 5 módulos (el único fantasma del bus es `recetas.actualizar_precio.request`, ajeno).
✓ Reglas de negocio afinadas con el dueño (PASO 7): aprobación auto-aprueba lo ya impreso y consulta lo nuevo (orquestador `ya_impreso`); prioridad por número (mayor primero, piezas estructurales altas); fuentes por defecto printables+thingiverse primero (buscador_www).
✓ PASOS 6-10 completados: `cupula_stl` (modelo universal), `cupula_gcode` (receta por máquina), `puente_creality` (frontera CrealityPrint, complete por evento), `estimador_tiempo` (minutos deterministas), `horarios_casa` (ventanas por persona, PRESENCIA). `motor_propuesta` v0.2.0 con `ReglaPrioridadConPresencia`.
✓ `horarios_casa` desplegado y en vivo (135 módulos, presente con module.json + index.js).
