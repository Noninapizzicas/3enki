# ciclo-impresion — decisiones de interfaz (F7)

> PRÁCTICA de paneles específicos con stores MQTT (4ª iteración, tras
> catalogo-modelos, historial-impresiones y cola-impresion). **Este caso es el
> MÁS distinto:** no es una cinta CRUD, es un panel de ESTADO de una MÁQUINA DE
> ESTADOS. Cada fila documenta la cadena **estado/senal → forma → elemento →
> atributos → por qué**. Es el dataset de patrones para automatizar futuros
> paneles de máquinas de estados.
> Fuente de verdad: `modules/ciclo-impresion/index.js` (handlers reales, máquina
> en memoria DUEÑO del ciclo), `ciclo-impresion.blueprint.json` (F6½: ui.ops /
> ui.estados / ui.confirmaciones_contextuales), `module.json` y
> `modules/adaptador-confirmacion/index.js` (puente de la confirmación).

| op / estado | evento / contexto | forma | elemento | atributos | por qué |
|---|---|---|---|---|---|
| — (observar, jefe) | NO hay RPC lectora de estado ([ABIERTO] del esquema-jefe) | panel de estado | badge-hero (estado) + pieza + progreso + máquina visual | estado actual, pieza, % , capa | el panel ES el bus: reconstruye el punto de la máquina por señales, nunca recarga |
| iniciar (jefe) | ciclo.iniciar.request → .response (onIniciarRequest → _iniciar) | botón primario | ▶ Iniciar ciclo (btn-jefe) | solo project_id | la ÚNICA RPC real del módulo; el jefe decide CUANDO arranca el reloj |
| iniciar (gate) | legal solo IDLE/COLA_VACIA/ERROR; si no, 409 CONFLICT_STATE (invariante 7, una pieza a la vez) | visibilidad de botón | `puedeIniciar` (derived) | `$puedeIniciar` | el botón de acción ES la máquina: habilitado solo en los estados que lo admiten |
| IDLE | estado ocioso | badge | chip-estado st-idle ⏸️ | IDLE | punto de reposo; botón iniciar visible |
| OBTENIENDO_GCODE | estado intermedio | badge | chip st-blue ⚙️ | — | sin progreso (hueco del esquema); tránsito, sin mano |
| SUBIENDO_GCODE | estado intermedio | badge | chip st-blue ⬆️ | — | tránsito, sin mano |
| IMPRIMIENDO | vigilia: progreso.actualizado + filamento.usado | barra + badge | chip st-imprimiendo 🖨️ + barra % | `progreso.progress`, current_layer/total_layer | solo en impresión hay progreso; la señal la alimenta en vivo |
| ESPERANDO_RETIRADA | impresion.completada (IMPRIMIENDO→ESPERANDO_RETIRADA); aviso del dueño | botón contextual | 🛠️ Pieza retirada (btn-confirmar) | tipo pieza_retirada | confirmación física del dueño: retirar de la cama → IDLE (encadena siguiente) |
| PAUSADO_FALTA_FILAMENTO | filamento.falta (IMPRIMIENDO→pause) | botón contextual | 🧵 Filamento cambiado (btn-confirmar) | tipo filamento_cambiado | manual del dueño: cambiar filamento → IMPRIMIENDO |
| ERROR | impresion.error o ciclo.abortado (par de fallo canónico) | botón contextual + aviso | ❌ Reanudar ciclo (btn-confirmar) + aviso-error | tipo reanudar_ciclo + error | limpia el error → IDLE; también aquí se puede iniciar |
| COLA_VACIA | ciclo.cola_vacia al iniciar sin piezas | badge + botón | chip st-colavacia 📭 + ▶ Iniciar | — | re-iniciar con nueva pieza es legal; el jefe decide si entra más |
| ciclo.completado | fin del ciclo (pieza impresa y retirada) | aviso | aviso-ok 🎉 + vuelve IDLE | — | la impresora queda ociosa con causa |
| ciclo.esperando_confirmacion | aviso defensivo "tu mano hace falta" | latido | `ultimaSenal` + esperando | tipo de confirmación | reforzado por las señales específicas; define el botón contextual |
| última señal | actividad en vivo del bus | indicador | `ultimaSenal` (evento + hora) | — | muestra que la vista está viva y de dónde viene el estado |

## Confirmaciones contextuales (NO son RPC del módulo)

> Por LEY DE CERO SUPUESTOS y verificado en el repo: el módulo ciclo-impresion
> NO tiene handlers `.request` de confirmación (`ciclo.confirmar.<tipo>` no
> existe). Las tres confirmaciones se entregan al sistema por el **evento
> adaptador-confirmacion.confirmacion_recibida** (handler `onConfirmacionRecibida`
> del ciclo, fire-and-forget), con el campo `tipo`. Se descarta el RPC
> `adaptador-confirmacion.confirmar` porque ese puerto sólo PIDE por Telegram
> (no transiciona el ciclo): el avance real lo hace `confirmacion_recibida`.

| botón | estado_gatillo | transición aplicada (index.js `_aplicarTransicion`) | señal resultante | vía de emisión |
|---|---|---|---|---|
| 🛠️ Pieza retirada | ESPERANDO_RETIRADA | ESPERANDO_RETIRADA → IDLE (encadena siguiente) | ciclo.iniciado o ciclo.completado | `publish('adaptador-confirmacion.confirmacion_recibida', { project_id, tipo:'pieza_retirada', … })` |
| 🧵 Filamento cambiado | PAUSADO_FALTA_FILAMENTO | → IMPRIMIENDO | progreso.actualizado | idem, tipo:'filamento_cambiado' |
| ❌ Reanudar ciclo | ERROR | → IDLE | ciclo.iniciado (si re-inicia) o queda IDLE | idem, tipo:'reanudar_ciclo' |

**Nota [ABIERTO]:** el mecanismo mecánico de emisión del panel es propio del
sitio (decidido en este F7): el jefe está físicamente ante el panel, así que el
botón publica el evento directamente. Una vía alternativa (misma señal) sería
pasar por `adaptador-confirmacion.confirmar`, pero ese puerto pide por
Telegram. Lo razonable documentado y sin inventar: publicar la confirmación
directa, con `contexto.canal='ciclo-impresion-panel-ui'`.

## Cadena completa por estado

```
CICLO.INICIADO (señal)
   │   └──> estado=IMPRIMIENDO + piezaEnCurso (item/modelo/nombre/material)
   │
IMPRESION.COMPLETADA (señal)
   │   └──> estado=ESPERANDO_RETIRADA · botón contextual 🛠️ "Pieza retirada"
   │        confirmar → publica confirmacion_recibida(pieza_retirada) → IDLE (re-encadena)
   │
FILAMENTO.FALTA (señal)
   │   └──> PAUSADO_FALTA_FILAMENTO · botón 🧵 "Filamento cambiado" → IMPRIMIENDO (reanuda)
   │
IMPRESION.ERROR / CICLO.ABORTADO (señal)
   │   └──> ERROR · aviso + botón ❌ "Reanudar ciclo" → IDLE (lista para re-iniciar)
   │
CICLO.COLA_VACIA (señal)
   │   └──> COLA_VACIA · botón ▶ "Iniciar ciclo" (re-iniciar con nueva pieza, legal)
   │
PROGRESO.ACTUALIZADO (señal) → barra % + capa actual/total
   │
CICLO.COMPLETADO (señal) → IDLE + aviso 🎉 (impresora ociosa con causa)
CICLO.INICIAR.REQUEST (RPC, jefe) → ▶ arranca el ciclo · señal pareada refresca
```

## Decisiones de arquitectura de la práctica

1. **Store MQTT reflejo — SIN lectura RPC (la esencia).** `stores/ciclo.ts` no
   tiene `loadCiclo`: NO hay RPC lectora de estado en el módulo. El `initialState`
   (`{ estado:'IDLE', pieza, progreso, esperando, error, ultimaSenal }`) + writable +
   derivados + acciones (`iniciarCiclo` RPC / `confirmarCiclo` publish) +
   `initCicloSubscriptions` (suscribe a las 9 señales del `transporte.salida`,
   cada una con su handler porque el cliente no entrega el topic a handlers de
   eventos → reconstruye la transición por la señal concreta) + `resetCiclo`.

2. **Panel específico, no BlueprintForm.** `CicloImpresionPanel.svelte`:
   badge-hero del estado actual (color=estado, icono=entidad), pieza en curso,
   barra de progreso, máquina de estados VISUAL (flujo de los 8 estados con el
   actual resaltado), botón ▶ Iniciar (solo IDLE/COLA_VACIA/ERROR), botón de
   confirmación CONTEXTUAL según estado, y el indicador de última señal.

3. **El botón de confirmación ES la máquina.** Un único botón contextual,
   decido por `confirmacionPorEstado` (derived que parte de `ui.confirmaciones_contextuales.estado_gatillo`), habilitado SOLO por el estado actual. Cualquier otro estado → sin botón de confirmación (nada que confirmar).

4. **Filtro por rol jefe.** `iniciar` y las 3 confirmaciones son rol `jefe`; el
   resto de la superficie solo informa (observación del estado, rol neutro).

5. **Multi-tenant.** El store filtra por `sessionProjectId`; al cambiar de
   proyecto `resetCiclo()` vacía la máquina (sin estado ajeno).

## Dataset de patrones (para automatizar paneles de MÁQUINAS DE ESTADOS)

| forma UI | disparo | elementos recurrentes | plantilla de decisión |
|---|---|---|---|
| panel de estado (hero badge) | NO hay RPC lectora; el estado viene por SEÑAL | badge color+icono del estado, máquina visual con actual resaltado | `ui.estados[].color/icono` alimentan badge; el estado actual sale de las señales `refresh_on` |
| botón de acción primaria | una RPC real (disparador) | visibilidad gateada por estados legales (`ui.ops[].logica`) | el `iniciar`/disparador solo se muestra en los estados que `transporte.rpc` permite |
| botón de CONFIRMACIÓN contextual | transición física del dueño (NO RPC del módulo) | botón único por estado, decido por `confirmacionPorEstado` | mapear `ui.confirmaciones_contextuales[].estado_gatillo` → tipo; emitir por su canal documentado |
| barra de progreso | evento de vigilia (`progreso.actualizado`) | % + capa actual/total | solo en IMPRIMIENDO; la señal la alimenta en vivo |
| indicador de última señal | cualquier evento del bus | evento + hora | da vida al panel de estado; muestra de dónde sale el estado |
