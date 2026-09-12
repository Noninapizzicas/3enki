# Esquema maestro — ciclo-impresion · ROL JEFE

> Sujeto: la cara de DECISIÓN del ciclo de impresión 3D para el dueño (JEFE).
> Objetivo: **interfaz de supervisión y mano del ciclo** — VER la máquina de estados
> en su punto actual, DISPARAR el inicio del ciclo, y CONFIRMAR las transiciones
> físicas que requieren la mano del dueño (retirar pieza / cambiar filamento /
> reanudar tras error), con el mínimo de gestos y sin recargas.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol JEFE,
> casuística MICRO-AGENTE / ORQUESTADOR (NO es un custodio CRUD).
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0).
> Hardware: una sola impresora SPARKX i7 — **una pieza a la vez** (invariante 7).

## La lente JEFE aplicada a ciclo-impresion

`ciclo-impresion` es el **CORAZÓN del sistema**: un **MICRO-AGENTE/ORQUESTADOR** (NO
un custodio). Es el **DUEÑO de una MÁQUINA DE ESTADOS en memoria** (por proyecto,
nunca persiste) que encadena la cadena completa
`libre → propuesta → aprobación → imprimiendo → impreso → libre`.

A diferencia de `catalogo-modelos` / `cola-impresion` / `historial-impresiones`
(custodios CRUD donde el jefe lista/registra/entra), aquí el jefe **NO escribe en un
store y NO gestiona entidades**. El ciclo es un **reloj que el jefe arranca y
acompaña**: su cara es la de un **operador de máquina** que observa el estado del
ciclo y pone **una sola pieza en movimiento a la vez** (invariante 7).

Para el JEFE eso significa:

- **Solo hay 1 RPC real de este módulo: `iniciar`** (`ciclo.iniciar.request` →
  `onIniciarRequest` → `_iniciar`). Es el único gesto de *disparo* del jefe: "arranca
  el ciclo con la siguiente pieza". El resto de la operación es **fire-and-forget
  del sistema**, NO del jefe.
- **El jefe NO edita la máquina de estados**: no hay op de mover un estado, saltar,
  cancelar o reescribir. La máquina solo se alimenta con **confirmaciones contextuales**
  que el jefe emite cuando la REALIDAD FÍSICA lo exige (pieza retirada de la cama,
  filamento cambiado, listo para reanudar tras un error).
- **Lo que el jefe DEBE VER** es el punto actual de la máquina (el estado del ciclo),
  la pieza en curso y su progreso — para saber SI y QUÉ hay que confirmar.
- **Lo que el jefe CONFIRMA es físico, no de datos**: retirar la pieza, cambiar el
  filamento, reanudar tras un fallo. Son transiciones que NADIE puede decidir salvo el
  dueño que tiene las manos en la impresora.

```
CICLO-IMPRESION · ROL JEFE  (orquestador, no CRUD)
│
├─ OBSERVAR (la máquina de estados en su punto actual) ──── el 80% del valor
│   ├─ Estado del ciclo (IDLE / OBTENIENDO_GCODE / SUBIENDO_GCODE / IMPRIMIENDO /
│   │    ESPERANDO_RETIRADA / PAUSADO_FALTA_FILAMENTO / ERROR / COLA_VACIA)
│   │     · reconstruido por la SEÑAL de eventos, NO por RPC (no hay op de leer estado)
│   ├─ Pieza en curso (nombre, modelo, material) · señal de ciclo.iniciado
│   └─ Progreso % (si el estado trae progress) · señal de progreso.actualizado
│
├─ DISPARAR (el único RPC del módulo) ──────────────────── 1 toque
│   └─ ▶ "iniciar ciclo" · ciclo.iniciar.request → onIniciarRequest → _iniciar
│        · legal SOLO desde IDLE / COLA_VACIA / ERROR (409 si ya imprime/espera/pausa)
│
├─ CONFIRMAR (transiciones físicas, contextuales, NO RPC) ─ la mano del dueño
│   ├─ Cuando ESTADO == ESPERANDO_RETIRADA → botón "pieza retirada"
│   │     → IDLE (el ciclo encadena la siguiente automáticamente)
│   ├─ Cuando ESTADO == PAUSADO_FALTA_FILAMENTO → botón "filamento cambiado"
│   │     → IMPRIMIENDO (reanuda la impresión pausada)
│   └─ Cuando ESTADO == ERROR → botón "reanudar ciclo"
│         → IDLE (limpia el error y deja el ciclo listo para re-iniciar)
│     · TODOS se entregan por evento adaptador-confirmacion.confirmacion_recibida,
│       NO por handler .request RPC (ver CONTRATO y Verificación)
│
└─ ALERTAS (avisos al dueño) ────────────────────────────── informan, no deciden
    ├─ ciclo.esperando_confirmacion → "tu mano hace falta" (retirar / filamento / reanudar)
    ├─ ciclo.abortado / impresion.error → fallo, motivo
    └─ ciclo.cola_vacia → no queda trabajo; ciclo.completado → turno cerrado
```

## Los 3 principios de agilidad (lo que extrae el esquema)

1. **La observación ES la acción.** El jefe no tiene formularios que rellenar: su
   gesto es LEER dónde está la máquina. El panel vivo del estado (reconstruido por la
   señal de eventos) es el 80% del trabajo — el botón correcto aparece SOLO cuando la
   máquina lo pide (confirmación contextual), no una barra de acciones siempre viva.

2. **Ninguna operación recarga la vista.** Todo (disparar, confirmar, avanzar solo)
   emite su señal pareada (`ciclo.iniciado`, `ciclo.esperando_confirmacion`,
   `impresion.completada`, `progreso.actualizado`, `ciclo.abortado`,
   `ciclo.cola_vacia`, `ciclo.completado`) y la vista re-lee, nunca recarga.

3. **El botón de confirmación ES la máquina.** No hay un formulario "confirmar
   transición" con opciones: hay UN botón contextual habilitado por el estado actual
   (retirar | cambiar filamento | reanudar). La máquina dicta qué botón existe; el
   jefe solo decide SI confirma ahora.

## El prisma de 5 huecos con lente JEFE (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué DECIDE el JEFE aquí?

- **Cuándo arranca el ciclo** (`iniciar` — la ÚNICA RPC): mete la siguiente pieza de
  la cola en el ciclo. Legal SOLO desde `IDLE`, `COLA_VACIA` o `ERROR` (el resto
  devuelve 409 `CONFLICT_STATE`: ya está en marcha u esperando). Es la cara de
  DISPARO del orquestador.
- **Qué transición física confirmar** (decisión del dueño que tiene las manos en la
  impresora): `pieza_retirada` (estado `ESPERANDO_RETIRADA`), `filamento_cambiado`
  (estado `PAUSADO_FALTA_FILAMENTO`), `reanudar_ciclo` (estado `ERROR`). Son las 3
  salidas de la máquina que NO puede cerrar el sistema — solo el jefe.
- **Ver dónde está la máquina** (supervisión): el estado actual del ciclo, la pieza
  en curso y el progreso. Es la cara de información que NO decide pero alimenta toda
  decisión de confirmar.
- **NEUTRO**: nada — este módulo no tiene op de lectura pura de estado ni
  `project.activated` (la máquina es runtime; se reanuda desde IDLE al reiniciar).

### 2 · RESTRICCIONES — ¿Qué NO depende del JEFE?

- **La máquina de estados es del MÓDULO (DUEÑO), no del jefe.** El jefe NO edita,
  NO salta, NO cancela, NO reescribe el grafo. Solo alimenta la máquina con eventos
  legales; cualquier evento ilegal (ej. confirmar `pieza_retirada` sin estar en
  `ESPERANDO_RETIRADA`) lanza y **el ciclo cae a `ERROR` + `ciclo.abortado`** (contrato
  TOLERANTE: RPC falla → aborto, nunca basura).
- **Una pieza a la vez** (invariante 7): si el ciclo está en `IMPRIMIENDO`,
  `ESPERANDO_RETIRADA`, `PAUSADO_FALTA_FILAMENTO`, `SUBIENDO_GCODE` u `OBTENIENDO_GCODE`,
  `iniciar` devuelve 409 — no se re-arranca en marcha.
- **Quién elige la pieza es la COLA, no el ciclo ni el jefe**: `_iniciar` pide la
  siguiente a `cola.siguiente.request`. El jefe del ciclo no elige qué imprimir — la
  cola decide el orden (schemas de cola-impresion).
- **Sin gcode no hay ciclo**: `_obtenerGcode` exige el `.3mf` del modelo (invariante 7);
  si no hay `.3mf` o el slicer falla → `ERROR`. No es decisión del jefe, es invariante.
- **El progreso / fin / error / falta de filamento los reporta la IMPRESORA**
  (adaptador-impresora), detectados por el orquestador (`_vigilarProgreso`,
  `_detectarFin`, `_detectarError`, `_detectarFaltaFilamento`) — el jefe solo ES INFORMADO.
- **La máquina NO persiste** (config `persistence.runtime/in-memory`): si el proceso
  cae, el ciclo se reanuda desde `IDLE` al reiniciar; el estado real de la impresora
  lo re-reporta el adaptador-impresora. La vista del jefe NO puede "pedir" el estado
  previo a un reinicio — es runtime.
- **Las confirmaciones NO son handlers `.request` RPC**: se entregan por el evento
  `adaptador-confirmacion.confirmacion_recibida` → `onConfirmacionRecibida` (puente
  adaptador-confirmacion, que media el canal de avisos/confirmación del dueño).

### 3 · CONTRATO — ¿Qué necesita VER y qué SEÑAL confirma?

**VER (para decidir si confirmar y qué):**
- El **estado actual** de la máquina — reconstruido por la **señal de eventos**
  publicada por el orquestador (`ciclo.iniciado`, `impresion.completada`,
  `filamento.falta`, `impresion.error`, `ciclo.esperando_confirmacion`,
  `ciclo.cola_vacia`, `ciclo.completado`). **NO hay RPC de "leer estado"** en index.js:
  la vista vive del bus (o del gauge `ciclo-impresion.estado`, observability).
- La **pieza en curso** (item_id, modelo_id, nombre, material) — viaja en las señales
  `ciclo.iniciado` y `impresion.completada`/`error`/`falta`.
- El **progreso %** (+ capa actual/total) — señal `progreso.actualizado`, si el estado
  interpretado de la impresora trae `progress`.

**CONFIRMAR (el único "output" del jefe tras observar) — botones contextuales:**
| Estado de la máquina | Botón contextual | Tipo de confirmación | → Transición (index.js) | Es RPC? |
|---|---|---|---|---|
| `ESPERANDO_RETIRADA` | "Pieza retirada" | `pieza_retirada` | → `IDLE` (encadena siguiente) | ❌ evento |
| `PAUSADO_FALTA_FILAMENTO` | "Filamento cambiado" | `filamento_cambiado` | → `IMPRIMIENDO` | ❌ evento |
| `ERROR` | "Reanudar ciclo" | `reanudar_ciclo` | → `IDLE` | ❌ evento |

**DISPARAR (la única RPC):**
| Acción | Evento request | Verificado | → Resultado |
|---|---|---|---|
| Iniciar ciclo | `ciclo.iniciar.request` → `onIniciarRequest` → `_iniciar` | ✅ | `ciclo.iniciado` (o `ciclo.abortado` / `ciclo.cola_vacia`) |

**SEÑALES de confirmación (pareadas, verificadas en index.js — publishers reales):**
| Origen | Señal | Verificado |
|---|---|---|
| `iniciar` → éxito (una pieza en marcha) | `ciclo.iniciado` | ✅ `_iniciar` → publish |
| `iniciar` → sin gcode / RPC falla | `ciclo.abortado` | ✅ `_abortar` → publish |
| `_iniciar` → cola vacía | `ciclo.cola_vacia` + aviso `cola_vacia` | ✅ `_iniciar` |
| impresión terminó (pieza) | `impresion.completada` + luego `ciclo.esperando_confirmacion` | ✅ `_detectarFin` / `_aplicarTransicion` |
| impresión falló | `impresion.error` → luego `ciclo.abortado` | ✅ `_detectarError` / `_aplicarTransicion` |
| falta filamento | `filamento.falta` → luego `ciclo.esperando_confirmacion` | ✅ `_detectarFaltaFilamento` / `_aplicarTransicion` |
| progreso en vivo | `progreso.actualizado` (+ `filamento.usado`) | ✅ `_vigilarProgreso` |
| ciclo completo (última pieza retirada, cola vacía) | `ciclo.completado` | ✅ `_encadenarSiguiente` |
| refresco del panel | cualquiera de las anteriores | ✅ la vista re-lee, nunca recarga |

**Confirmaciones → señal:** al confirmar (evento `adaptador-confirmacion.confirmacion_recibida`
→ `onConfirmacionRecibida`), el orquestador aplica la transición y el estado salta
(vía `_aplicarTransicion`); el siguiente evento (`ciclo.iniciado` si retira y encadena,
`progreso.actualizado` si reanuda el filamento, `ciclo.iniciado` si reanuda tras error)
refresca el panel. El botón de confirmación NO es un `.request` RPC — **emite la
confirmación** para que el adaptador-confirmacion la medie.

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del JEFE?

- **CLIENTE** (elegir/encargar una impresión): NO existe — taller de uso propio, no
  vende (fase 0). El ciclo no tiene cara cliente.
- **TRABAJADOR / operación física**: aquí la línea es fina. El JEFE del taller de uso
  propio ES quien retira/cambia filamento — por eso sus botones son contextuales. Pero
  el *arranque bruto de la impresora, el stream de observación de estados, subir gcode
  y slicear* son del SISTEMA (el orquestador encadena `adaptador-impresora` /
  `adaptador-slicing`), NO del jefe. El jefe dispara el CICLO, no cada paso de máquina.
- **SISTEMA**: obtener/almacenar gcode (cúpula/slicer), registrar en historial,
  decrementar filamento, detectar fin/error/falta, emitir avisos — automatizado por el
  orquestador. Informa al jefe por señales; no decide.
- **Elegir qué pieza imprimir** y **ordenar la cola**: pertenecen a `cola-impresion`
  (+ `catalogo-modelos` para aprobar/registrar). Aquí el ciclo solo mete la "siguiente".
- **Aprobar/rechazar modelo** (`modelo_aprobado` / `modelo_rechazado`): flujo de
  calidad del catálogo — NO del ciclo (ver PREGUNTAS_ABIERTAS y Verificación).

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **No hay op de leer el estado actual por RPC** — el jefe reconstruye el panel con
  las señales publicadas; no existe `estado.request`/`getEstado`. Si el panel quiere un
  refresco bajo demanda (o reconstruirse tras perder el stream), falta un puerto de
  **lectura puntual del estado**. Decisión de dueño: ¿añadir una op de lectura del estado
  del ciclo (gauge/RPC) o vivir 100% del bus?
- (b) **Confirmaciones `modelo_aprobado` / `modelo_rechazado` aceptadas pero transición
  ilegal** — `CONFIRMACIONES` incluye 5 tipos, pero la máquina solo transiciona 3
  (`pieza_retirada`, `filamento_cambiado`, `reanudar_ciclo`). Enviar una confirmación
  de aprobación al CICLO cae a `ERROR` (transición ilegal → aborto). Son del flujo de
  catálogo/aprobación y NO deberían llegar aquí — cómo se filtran (adaptador-confirmacion
  por dominio) es decisión de diseño. [ABIERTO]
- (c) **El ciclo NO abruma al dueño si es 100% autónomo**: "no 100% autónomo" del
  diseño significa que el dueño retira y cambia filamento entre ciclos. ¿Quiere el jefe
  una confirmación OPTATIVA también al reanudar tras `filamento_cambiado` (volver a
  `IMPRIMIENDO`) o basta con las 3 físicas actuales?
- (d) **Estado en memoria → reinicio pierde la vista**: si el proceso cae, el ciclo
  vuelve a `IDLE` y la impresora re-reporta su estado real. ¿El panel del jefe debe
  reconciliar "lo que la máquina dice" vs "lo que la impresora reporta" tras un
  reinicio? Decisión de dueño (hoy el orquestador re-encaja lo real).
- (e) **Progreso solo durante `IMPRIMIENDO`**: `onEstadoCrudo` vigila SOLO si el estado
  es `IMPRIMIENDO`. El jefe en `OBTENIENDO_GCODE`/`SUBIENDO_GCODE` ve el estado pero
  sin progreso — ¿es suficiente el pulso de "en qué paso está"?

## Veredicto del ÁRBITRO (lente-roles)

Pregunta árbitro: ¿decide el FUTURO del ciclo (dispara o confirma transiciones) → JEFE ·
¿opera la máquina a diario (vigila) → TRABAJADOR · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `iniciar` (`ciclo.iniciar.request`) | **JEFE (disparador)** | La ÚNICA RPC del módulo: mete la siguiente pieza en el ciclo. El dueño decide cuándo arranca el reloj. |
| `confirmacion:pieza_retirada` | **JEFE (contextual)** | Retirar la pieza de la cama es decisión física del dueño. Se entrega por evento (NO RPC). → `IDLE` y encadena. |
| `confirmacion:filamento_cambiado` | **JEFE (contextual)** | El sistema NO sabe cuándo el dueño cambió el filamento. Botón contextual en `PAUSADO_FALTA_FILAMENTO`. → `IMPRIMIENDO`. |
| `confirmacion:reanudar_ciclo` | **JEFE (contextual)** | A solucionar el error lo decide el dueño; reanuda desde `ERROR` a `IDLE`. Botón contextual. |
| `onEstadoCrudo` / `_vigilarProgreso` | neutro | Vigilancia del sistema (impresora). Informa `progreso.actualizado`. |
| `onImpresionCompletada` / `onImpresionError` / `onFilamentoFalta` | neutro | DUEÑO aplica transición automática; emite señal que informa al jefe. |
| `onConfirmacionRecibida` | **JEFE** (vía adaptador-confirmacion) | Es el receptor de las 3 confirmaciones del dueño. NO es una cara `.request`, pero es la CARA de entrada de las decisiones del jefe. |
| `modelo_aprobado` / `modelo_rechazado` | fuera de ciclo | Son del flujo de catálogo/aprobación, NO del ciclo. Su llegada aquí aborta (ver PREGUNTAS_ABIERTAS b). |

**El panel del jefe se compone SOLO de hojas-jefe + hojas-neutro que las alimentan.** La
observación (estado/pieza/progreso) es neutra pero indispensable; el `iniciar` y las 3
confirmaciones son las hojas de acción del jefe. A diferencia de un custodio CRUD no hay
hoja de "registrar" ni "listar entidades" — la hoja rey es **la máquina observada +
los botones contextuales**.

## Composición de la vista del jefe (3 capas)

```
1. OBSERVAR  — el panel vivo del ciclo:
               · Estado actual (badge: IDLE / OBTENIENDO_GCODE / ... ) vía SEÑAL de
                 eventos — sin recargas.
               · Pieza en curso (nombre, modelo, material) · progreso % + capa/total.
               · Aviso contextual CUANDO la máquina pide mano (ciclo.esperando_confirmacion
                 con el motivo: retirar / filamento / reanudar).
2. DISPARAR   — botón "▶ iniciar ciclo" · ciclo.iniciar.request (única RPC).
               Habilitado SOLO en IDLE / COLA_VACIA / ERROR.
3. CONFIRMAR  — el botón contextual ÚNICO (según estado):
               · ESPERANDO_RETIRADA  → "pieza retirada"      (evento pieza_retirada)
               · PAUSADO_FALTA_FILAMENTO → "filamento cambiado" (evento filamento_cambiado)
               · ERROR                → "reanudar ciclo"      (evento reanudar_ciclo)
               · Cualquier otro estado → sin botón de confirmación (nada que confirmar).
```

### Frecuencia → jerarquía

- El gesto que MÁS hace el jefe es **observar** (ver dónde está la máquina). El panel
  del estado ES la vista viva.
- **Confirmar** es el segundo gesto (retirar / cambiar filamento / reanudar) y ocurre
  cuando la máquina lo pide — un botón contextual por estado.
- **Iniciar** es el gesto de arranque (menos frecuente, pero el único RPC).
- No hay formularios de declaración multi-campo (nada que "crear"): el ciclo es un
  orquestador, no un CRUD.

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Panel del estado del ciclo (capa 1) | `cinta-estado`/dashboard | badge con el estado actual (8 estados) reconstruido por la señal de eventos; la pieza en curso y el progreso % |
| Pieza en curso + progreso | `cinta-estado`/informe | item_id / modelo_id / nombre / material + progress %, current/total layer (de `progreso.actualizado`) |
| Aviso de "tu mano hace falta" | `cinta-estado`/aviso | `ciclo.esperando_confirmacion` con el motivo (retirar / filamento / reanudar) |
| Iniciar ciclo (JEFE) | `botón-acción` (primario) | `ciclo.iniciar.request` — habilitado SOLO en IDLE / COLA_VACIA / ERROR |
| Confirmación contextual "retirar pieza" (JEFE) | `confirmador-nombrado` | en `ESPERANDO_RETIRADA` → emite `pieza_retirada` (evento, NO RPC) | 
| Confirmación contextual "cambiar filamento" (JEFE) | `confirmador-nombrado` | en `PAUSADO_FALTA_FILAMENTO` → emite `filamento_cambiado` (evento) |
| Confirmación "reanudar ciclo" (JEFE) | `confirmador-nombrado` | en `ERROR` → emite `reanudar_ciclo` (evento) |
| Alerta de fallo | `cinta-estado`/aviso | `impresion.error` + `ciclo.abortado` (motivo) — par de fallo canónico |
| TODAS las hojas | `señal-refresh` | **pareadas** (tabla abajo) |

## Señales pareadas por hoja de declaración (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo.

```
iniciar        → ciclo.iniciado         ✅ (_iniciar → publish, pieza en marcha)
iniciar        → ciclo.cola_vacia       ✅ (_iniciar, sin pendientes)
iniciar / RPC  → ciclo.abortado         ✅ (_abortar, par de fallo canónico)
confirmar pieza_retirada → (estado)     ✅ (_aplicarTransicion ESPERANDO_RETIRADA→IDLE;
                                            siguiente señal: ciclo.iniciado por _encadenarSiguiente
                                            o ciclo.completado si cola_vacia)
confirmar filamento_cambiado → (estado) ✅ (_aplicarTransicion PAUSADO→IMPRIMIENDO;
                                            siguiente señal: progreso.actualizado)
confirmar reanudar_ciclo → (estado)      ✅ (_aplicarTransicion ERROR→IDLE)
impresora detecta fin  → impresion.completada + ciclo.esperando_confirmacion ✅
impresora detecta error→ impresion.error + ciclo.abortado                     ✅
impresora detecta falta filamento → filamento.falta + ciclo.esperando_confirmacion ✅
progreso en vivo       → progreso.actualizado (y filamento.usado)            ✅ (_vigilarProgreso)
cierre del turno       → ciclo.completado                                     ✅ (_encadenarSiguiente)
```

Nota crítica: las **confirmaciones no tienen señal `.response` propia** porque NO son
RPC — su "respuesta" es la TRANSICIÓN del estado, que se refleja en el siguiente evento
publicado. Por eso el flujo se cierra: emitir la confirmación → el orquestador aplica la
transición → publica el evento que sigue → la vista re-lee. Cero recargas, círculo
cerrado para cada una de las 13 transiciones de la máquina.

## Huecos reales (todos de UI, todos del rol jefe)

1. **Panel del estado del ciclo** — dashboard jefe: estado actual (8 estados) +
   pieza en curso + progreso %, reconstruido por la señal de eventos (NO hay RPC de leer).
2. **Botón "iniciar ciclo"** — la ÚNICA RPC real; dispara `ciclo.iniciar.request`,
   con señal `ciclo.iniciado` / `ciclo.abortado` / `ciclo.cola_vacia`.
3. **Área de confirmaciones contextuales** — el botón ÚNICO por estado:
   `ESPERANDO_RETIRADA`→"pieza retirada" · `PAUSADO_FALTA_FILAMENTO`→"filamento
   cambiado" · `ERROR`→"reanudar ciclo". Cada uno emite el evento de confirmación
   (vía adaptador-confirmacion) — NO son handlers `.request` RPC.

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **Leer estado por RPC bajo demanda** — no existe hoy; el panel vive del bus.
- (b) **Filtrado de confirmaciones por dominio** — `modelo_aprobado/rechazado` llegan
  y abortan; ¿dónde se filtran?
- (c) **Autonomía de reanudación** — ¿confirmar también al volver de
  `filamento_cambiado`, o basta tras `pieza_retirada`/`reanudar`?
- (d) **Reconciliación tras reinicio** — estado en memoria vs estado real de la impresora.
- (e) **Progreso fuera de `IMPRIMIENDO`** — ¿pulso en pasos de preparación?

## El deliverable hacia F7 (spec de construcción)

El panel del jefe para ciclo-impresion = `CicloJefePanel` compuesto por:
- **Línea de estado vivo** (dashboard): badge del estado actual (IDLE / OBTENIENDO_GCODE /
  SUBIENDO_GCODE / IMPRIMIENDO / ESPERANDO_RETIRADA / PAUSADO_FALTA_FILAMENTO / ERROR /
  COLA_VACIA) + pieza en curso + progreso % — reconstruido por las señales publicadas
  (`ciclo.iniciado`, `impresion.completada`, `filamento.falta`, `impresion.error`,
  `ciclo.esperando_confirmacion`, `ciclo.cola_vacia`, `ciclo.completado`,
  `progreso.actualizado`).
- **Botón "▶ iniciar ciclo"** — único RPC: emite `ciclo.iniciar.request`; habilitado
  SOLO en IDLE / COLA_VACIA / ERROR.
- **Zona de confirmación contextual** (única por estado): el botón que la máquina pide.
  Cada botón emite el evento de confirmación (puente adaptador-confirmacion):
  `pieza_retirada` / `filamento_cambiado` / `reanudar_ciclo`.
- **Aviso de mano** cuando `ciclo.esperando_confirmacion` con el motivo.
- **Aviso de fallo** (`ciclo.abortado`) con el motivo (contrato tolerante).
- Todas las mutaciones: emitir → señal refresca → la vista ES el feedback.

> **NOTA hacia F7 (sin materializar aquí):** `iniciar` es el ÚNICO RPC
> request/response de este módulo (`ciclo.iniciar.response`). Las 3 confirmaciones NO
> son RPC — se entregan por evento `adaptador-confirmacion.confirmacion_recibida`
> (adaptador-confirmacion). **NINGÚN `ui_handler` se materializa en module.json en
> este esquema** (eso es del F7/registro).

## Puertos abiertos (cableables por el sitio)

- `fuente_del_estado` → hoy: las señales publicadas por el orquestador (`ciclo.iniciado`,
  `impresion.completada`, `filamento.falta`, `impresion.error`,
  `ciclo.esperando_confirmacion`, `progreso.actualizado`, `ciclo.cola_vacia`,
  `ciclo.completado`). NO hay RPC de lectura del estado (hueco a).
- `disparador_del_ciclo` → hoy: `ciclo.iniciar.request` (`onIniciarRequest`) — la única RPC.
- `confirmaciones_del_jefe` → hoy: evento `adaptador-confirmacion.confirmacion_recibida`
  (el puente adaptador-confirmacion media el canal del dueño) → `onConfirmacionRecibida`.
  El panel emite la confirmación por ese canal; NO llama a handlers `.request` del ciclo.
- `alerta_al_jefe` → hoy: señales `ciclo.esperando_confirmacion`, `ciclo.abortado`,
  `impresion.error`, `filamento.falta`, `ciclo.cola_vacia` (consumo de adaptador-avisos).

## Verificación contra index.js (agotado)

- **Handlers reales: 1 RPC + 5 fire-and-forget.** El ÚNICO `.request` es `onIniciarRequest`
  (`ciclo.iniciar.request`). Los demás son listeners SIN handler de respuesta:
  `onEstadoCrudo` (`adaptador-impresora.estado_crudo`), `onImpresionCompletada`
  (`impresion.completada`), `onImpresionError` (`impresion.error`), `onFilamentoFalta`
  (`filamento.falta`), `onConfirmacionRecibida` (`adaptador-confirmacion.confirmacion_recibida`).
- **Máquina de estados completa** (`ESTADOS`, 8) y todas las transiciones (`_aplicarTransicion`):
  `IDLE/COLA_VACIA/ERROR →iniciar→ OBTENIENDO_GCODE`; `OBTENIENDO_GCODE →gcode_ok→
  SUBIENDO_GCODE`, `→cola_vacia→ COLA_VACIA`; `SUBIENDO_GCODE →subida_ok→ IMPRIMIENDO`;
  `IMPRIMIENDO →impresion.completada→ ESPERANDO_RETIRADA`, `→filamento.falta→
  PAUSADO_FALTA_FILAMENTO`, `→impresion.error→ ERROR`; `ESPERANDO_RETIRADA
  →confirmacion:pieza_retirada→ IDLE`; `PAUSADO_FALTA_FILAMENTO
  →confirmacion:filamento_cambiado→ IMPRIMIENDO`; `ERROR →confirmacion:reanudar_ciclo→ IDLE`.
- **Confirmaciones**: `CONFIRMACIONES` = `['pieza_retirada','filamento_cambiado',
  'reanudar_ciclo','modelo_aprobado','modelo_rechazado']`. `onConfirmacionRecibida`
  acepta los 5 (`includes`), pero `_aplicarTransicion` SOLO transiciona los 3 del ciclo;
  `confirmacion:modelo_*` cae al `default` → lanza "transición ilegal" → `_abortar`
  → `ERROR + ciclo.abortado`. **Hallazgo**: las confirmaciones de aprobación de modelo NO
  pertenecen al ciclo — al entrar aquí abortan. Filtrado por dominio = [ABIERTO] (b).
- **Transición ilegal → aborto** (contrato tolerante): cualquier evento no legal para el
  estado actual lanza y `_abortar` pone `ERROR` + `ciclo.abortado`. Nunca basura.
- **`_iniciar`** valida `project_id` (400), 409 `CONFLICT_STATE` si ya en marcha
  (`IMPRIMIENDO`/`ESPERANDO_RETIRADA`/`PAUSADO_FALTA_FILAMENTO`/`SUBIENDO_GCODE`/
  `OBTENIENDO_GCODE`); cola vacía → `COLA_VACIA` + `ciclo.cola_vacia`; obtiene gcode
  (cúpula o slicer, invariante 7: sin .3mf/slicer falla → `ciclo.abortado`);
  sube gcode; inicia impresión; abre stream de observación (si no abre, solo warn, no
  bloquea); emite `ciclo.iniciado`. Devuelve `{estado:'IMPRIMIENDO', pieza}`.
- **`_encadenarSiguiente`**: tras `pieza_retirada` (estado→IDLE) vuelve a `_iniciar`
  con la siguiente; si `COLA_VACIA` → `ciclo.completado`. El jefe solo retira; el ciclo
  encadena, la vista observa.
- **`_vigilarProgreso`** emite `progreso.actualizado` (progress, capas) y `filamento.usado`
  (mm); `_detectarFin`/`_detectarError`/`_detectarFaltaFilamento` emiten
  `impresion.completada`/`impresion.error`/`filamento.falta`. Todo SOLO mientras
  `estado === 'IMPRIMIENDO'` (gating en `onEstadoCrudo`).
- **Publishers reales**: `ciclo.iniciado`, `ciclo.completado`, `ciclo.abortado`,
  `ciclo.cola_vacia`, `ciclo.esperando_confirmacion`, `impresion.completada`,
  `impresion.error`, `filamento.falta`, `filamento.usado`, `progreso.actualizado`.
- **No persiste** (config `persistence.runtime/in-memory`): la máquina vive en memoria
  (`this._ciclos`, Map por `project_id`) y se reanuda desde IDLE al reiniciar.
- **No hay op de leer estado por RPC, ni update/delete/cancelar del ciclo** — es un
  orquestador, no un CRUD. Cualquier hueco (leer estado, reconciliar tras reinicio,
  confirmación de aprobación) es [ABIERTO] de decisión del dueño, no un defecto de la UI.
