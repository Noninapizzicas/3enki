# Esquema maestro — ciclo-impresion · ROL TRABAJADOR / OPERADOR

> Sujeto: la cara de **EJECUCIÓN OPERATIVA** del ciclo de impresión 3D para el
> **operador del taller (TRABAJADOR)** — quien está físicamente junto a la SPARKX i7,
> con las manos en la impresora.
> Objetivo: **interfaz de ejecución + vigilancia del ciclo** — VER en el estado actual
> qué acción física hace falta, CONFIRMAR las transiciones que requieren mano humana
> (retirar la pieza / cambiar el filamento / reanudar tras un fallo) y VIGILAR el progreso
> de la pieza que imprime ahora, con el mínimo gesto y sin recargas.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol TRABAJADOR,
> casuística MICRO-AGENTE / ORQUESTADOR (NO es un custodio CRUD).
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0).
> Hardware: una sola impresora SPARKX i7 — **una pieza a la vez** (invariante 7).

## La lente TRABAJADOR aplicada a ciclo-impresion (contraste con el JEFE)

Para el **JEFE**, `ciclo-impresion` es el reloj que **arranca** (`iniciar`, la única RPC) y
**acompaña**: observa la máquina de estados y decide **cuándo** dispara el ciclo y **si**
confirma una transición física. Para el **TRABAJADOR** (el operador que tiene la mano en la
impresora), el mismo módulo es su **estación de trabajo**: es quien **EJECUTA** esas
confirmaciones físicas sobre el hardware y **VIGILA** que la pieza que imprime ahora vaya
bien.

Contraste honesto con la lente JEFE (ya intuyó la finura): el jefe **DECIDE y ve el
panorama** (arranca el ciclo, supervisa); el operador **EJECUTA y ve lo concreto del
momento** — qué pieza está en marcha, cuánto falta, y qué mano se necesita AHORA. El jefe
tiene el botón de DISPARO (`iniciar`); el trabajador NO toca ese botón — su única
contribución son las **confirmaciones físicas** y la **vigilancia del progreso**.

```text
CICLO-IMPRESION · ROL TRABAJADOR (operador del taller, junto a la impresora)
│
├─ VIGILAR (la pieza que imprime AHORA) ──────────────── el estado actual + progreso
│   ├─ Estado del ciclo (badge: IDLE / OBTENIENDO_GCODE / SUBIENDO_GCODE / IMPRIMIENDO /
│   │    ESPERANDO_RETIRADA / PAUSADO_FALTA_FILAMENTO / ERROR / COLA_VACIA)
│   │     · reconstruido por la SEÑAL de eventos, NO por RPC (no hay op de leer estado)
│   ├─ Pieza en curso (nombre, modelo, material) · señal ciclo.iniciado
│   └─ Progreso % + capa actual/total · señal progreso.actualizado (solo en IMPRIMIENDO)
│
├─ EJECUTAR (confirmaciones físicas — LA mano del operador) ── contextuales, NO RPC
│   ├─ Cuando ESTADO == ESPERANDO_RETIRADA      → "pieza retirada"
│   │     → IDLE (el ciclo encadena la siguiente automáticamente)
│   ├─ Cuando ESTADO == PAUSADO_FALTA_FILAMENTO  → "filamento cambiado"
│   │     → IMPRIMIENDO (reanuda la impresión pausada)
│   └─ Cuando ESTADO == ERROR                    → "reanudar ciclo"
│         → IDLE (limpia el error y deja el ciclo listo para re-iniciar)
│     · TODOS se entregan por evento adaptador-confirmacion.confirmacion_recibida,
│       NO por handler .request RPC (ver CONTRATO y Verificación)
│
└─ (NO decide cuándo arranca el ciclo) ─────────────── ── eso es del JEFE ❌
    · el operador NO toca `iniciar` (la única RPC es del dueño/arranque)
    · tampoco aprueba/rechaza modelos (flujo calidad del catálogo, NO del ciclo)
```

## Los 3 principios de agilidad (lo que extrae el esquema, lente trabajador)

1. **El estado ES la instrucción.** El operador no busca en un menú qué hacer: el badge del
   estado actual LE DICE exactamente si hay que retirar, cambiar filamento, reanudar o
   simplemente mirar. El botón de confirmación correcto aparece SOLO cuando la máquina lo
   pide, nunca una barra de acciones siempre viva.

2. **El botón de confirmación ES la máquina.** No hay formulario "confirmar transición" con
   opciones: hay UN botón contextual habilitado por el estado actual (retirar | cambiar
   filamento | reanudar). El operador solo decide SI confirma ahora, tras hacer la acción
   física sobre la impresora.

3. **Ninguna operación recarga la vista.** Todo (confirmar, avanzar solo, reportar error)
   emite su señal pareada y la vista re-lee — nada de recargas ni de esperar `.response`.
   Las confirmaciones NO tienen señal `.response` propia: su "respuesta" es la TRANSICIÓN
   del estado, que se refleja en el siguiente evento publicado.

## El prisma de 5 huecos con lente TRABAJADOR (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué EJECUTA/VIGILA el TRABAJADOR aquí?

- **Retirar la pieza** (`pieza_retirada`) en `ESPERANDO_RETIRADA`: cuando la impresión
  termina (`impresion.completada` → estado `ESPERANDO_RETIRADA`), el operador saca la pieza
  de la cama y confirma. El ciclo pasa a `IDLE` y **encadena la siguiente automáticamente**
  (`_encadenarSiguiente` → `_iniciar`). El operador solo retira; el ciclo encadena.
- **Cambiar el filamento** (`filamento_cambiado`) en `PAUSADO_FALTA_FILAMENTO`: el sistema
  NUNCA sabe cuándo el operador terminó de cambiar el rollo — solo él lo sabe. Al confirmar,
  el ciclo reanuda la impresión pausada (`PAUSADO_FALTA_FILAMENTO → IMPRIMIENDO`).
- **Reanudar tras un fallo** (`reanudar_ciclo`) en `ERROR`: a solucionar el fallo físico lo
  decide el operador en el taller; al confirmar limpia el error y deja el ciclo en `IDLE`.
- **Vigilar la pieza en curso** (la cara de información): ver el estado actual de la máquina,
  la pieza que imprime ahora y su progreso — para saber QUÉ hacer o simplemente acompañar.
- **NEUTRO**: el operador no dispara el ciclo, no elige la pieza, no aprueba modelos.

### 2 · RESTRICCIONES — ¿Qué NO depende del TRABAJADOR?

- **NO arranca el ciclo**: `iniciar` (la ÚNICA RPC del módulo, `onIniciarRequest → _iniciar`)
  es del **JEFE** (decision de arranque del reloj). El trabajador no la emite. Su cara en este
  módulo es de EJECUCIÓN física de confirmaciones + VIGILANCIA, no de disparo.
- **La máquina de estados es del MODULO (DUEÑO), no del trabajador**: el operador NO edita,
  NO salta, NO cancela, NO reescribe el grafo. Solo alimenta con confirmaciones legales; un
  evento ilegal (ej. confirmar `pieza_retirada` sin estar en `ESPERANDO_RETIRADA`) lanza y el
  ciclo cae a `ERROR` + `ciclo.abortado` (contrato TOLERANTE: nunca basura).
- **Una pieza a la vez** (invariante 7): si el ciclo está en `IMPRIMIENDO` / `ESPERANDO_RETIRADA`
  / `PAUSADO_FALTA_FILAMENTO` / `SUBIENDO_GCODE` / `OBTENIENDO_GCODE`, `iniciar` da 409 — pero
  eso le importa al jefe; el trabajador nunca llega ahí porque no inicia.
- **Quién elige la pieza es la COLA** (`cola.siguiente.request`), no el operador ni el ciclo.
- **El progreso/fin/error/falta de filamento los reporta la IMPRESORA** (adaptador-impresora),
  detectados por el orquestador (`_vigilarProgreso`, `_detectarFin/Error/FaltaFilamento`) y
  publicados como señales — el operador SOLO las consume para vigilar. Todo esto ocurre SOLO
  mientras `estado === 'IMPRIMIENDO'` (gating en `onEstadoCrudo`).
- **Las confirmaciones NO son handlers `.request` RPC** — se entregan por el evento
  `adaptador-confirmacion.confirmacion_recibida` → `onConfirmacionRecibida` (fire-and-forget).
  El panel del operador emite la confirmación por ese canal; NO llama a `.request` del ciclo.
- **La máquina NO persiste** (runtime/in-memory): si el proceso cae, el ciclo vuelve a `IDLE`
  y la impresora re-reporta su estado real. La vista del operador no puede "pedir" el estado
  previo a un reinicio.

### 3 · CONTRATO — ¿Qué necesita VER el TRABAJADOR y qué CONFIRMA?

**VER (para saber QUÉ acción física tomar, o simplemente acompañar):**
- El **estado actual** de la máquina — reconstruido por la **señal de eventos** publicada por
  el orquestador (`ciclo.iniciado`, `impresion.completada`, `filamento.falta`,
  `impresion.error`, `ciclo.esperando_confirmacion` *(declarada pero NO publicada en index.js,
  ver Verificación)*, `ciclo.cola_vacia`, `ciclo.completado`). **NO hay RPC de "leer estado"**:
  la vista vive del bus (o del gauge `ciclo-impresion.estado`, observability).
- La **pieza en curso** (item_id, modelo_id, nombre, material) — viaja en `ciclo.iniciado`,
  `impresion.completada`, `impresion.error`, `filamento.falta`.
- El **progreso %** (+ capa actual/total) — señal `progreso.actualizado`, SOLO en `IMPRIMIENDO`.

**EJECUTAR (el único "output" del operador tras observar) — botones contextuales, NO RPC:**
| Estado de la máquina | Botón contextual | Tipo de confirmación | → Transición (index.js) | Es RPC? |
|---|---|---|---|---|
| `ESPERANDO_RETIRADA` | "Pieza retirada" | `pieza_retirada` | → `IDLE` (encadena siguiente) | ❌ evento |
| `PAUSADO_FALTA_FILAMENTO` | "Filamento cambiado" | `filamento_cambiado` | → `IMPRIMIENDO` | ❌ evento |
| `ERROR` | "Reanudar ciclo" | `reanudar_ciclo` | → `IDLE` | ❌ evento |

Las 3 confirmaciones se entregan por el evento `adaptador-confirmacion.confirmacion_recibida`
(handler `onConfirmacionRecibida`, fire-and-forget): el panel del operador EMITE la
confirmación por ese canal (vía el adaptador-confirmacion), NO llama a un `.request` del ciclo.

**SEÑALES de confirmación (pareadas, verificadas en index.js — publishers reales):**
| Origen | Señal | Verificado |
|---|---|---|
| impresión terminó (pieza) | `impresion.completada` | ✅ `_detectarFin` (estado==='completado') |
| impresión falló | `impresion.error` | ✅ `_detectarError` (estado==='fallo') |
| falta filamento | `filamento.falta` | ✅ `_detectarFaltaFilamento` (filament_detected===false) |
| progreso en vivo | `progreso.actualizado` (+ `filamento.usado`) | ✅ `_vigilarProgreso` (gating IMPRIMIENDO) |
| una pieza en marcha | `ciclo.iniciado` | ✅ `_iniciar` → publica (el jefe inicia; el trabajador la ve) |
| reanudo el filamento → progreso | `progreso.actualizado` (siguiente evento) | ✅ transición PAUSADO→IMPRIMIENDO |
| retiré → el ciclo encadena | `ciclo.iniciado` (siguiente) o `ciclo.completado` (cola vacía) | ✅ `_encadenarSiguiente` |
| reanudé tras error → IDLE | `ciclo.iniciado` (si luego inicia) | ✅ transición ERROR→IDLE |

**Confirmaciones → señal:** al confirmar (evento `adaptador-confirmacion.confirmacion_recibida`
→ `onConfirmacionRecibida` → `_aplicarTransicion`), el estado salta y el siguiente evento
publicado refresca la vista. El botón de confirmación NO es un `.request` RPC — **emite la
confirmación**; su "respuesta" es la transición del estado (círculo cerrado, cero recargas).

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del TRABAJADOR?

- **JEFE** (decidir cuándo arrancar + aprobar/rechazar): la única RPC `iniciar` es del dueño —
  el operador no la toca. También la decisión de calidad (`modelo_aprobado/rechazado` es del
  flujo de catálogo, NO del ciclo; si un `modelo_*` llega aquí aborta, ver PREGUNTAS_ABIERTAS b).
- **CLIENTE** (elegir/comprar): NO existe — taller de uso propio, no vende (fase 0).
- **SISTEMA**: obtener/almacenar gcode (cúpula/slicer), subir gcode, iniciar impresión,
  registrar en historial, decrementar filamento, detectar fin/error/falta, emitir avisos —
  automatizado por el orquestador. Informa al operador por señales; no decide.
- **Elegir qué pieza imprimir / ordenar la cola**: `cola-impresion` (+ `catalogo-modelos`).
- **Aprobar/rechazar modelo**: flujo de calidad del catálogo — NO del ciclo.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **No hay op de leer el estado actual por RPC** — el operador reconstruye el panel con
  las señales publicadas. Si quiere un refresco bajo demanda (p.ej. al llegar a la impresora
  tras un rato), falta un puerto de lectura puntual del estado. Misma decisión que (a) del
  esquema-jefe.
- (b) **`ciclo.esperando_confirmacion` declarada pero NO publicada en index.js** — aparece en
  module.json (`publishes`) y en el blueprint, pero los publishers reales en index.js NO la
  emiten: los avisos "tu mano hace falta" van por `ciclo.esperando_confirmacion` en el diseño,
  pero hoy la señal de "esperando" de cada transición sale implícita por
  `impresion.completada`/`filamento.falta`/`impresion.error`. Mientras no se publique, el
  panel del operador deduce "hay que retirar/cambiar/reanudar" SOLO del estado actual, no de
  una alerta dedicada. Hueco de diseño: ¿publicarla o vivir del estado + avisos del
  adaptador-avisos?
- (c) **Trabajador y jefe son el MISMO humano (taller de uso propio)** — en fase 0 el dueño
  es quien retira/cambia filamento. La separación jefe-ejecución es CONCEPTUAL: el panel del
  operador que EJECUTA y el del dueño que ARRANCA pueden ser dos caras del mismo panel (o el
  trabajador asume la confirmación mientras el jefe conserva `iniciar`). Decisión del sitio.
- (d) **Estado en memoria → reinicio pierde la vista** — el panel del operador no puede
  reconciliar "lo que la máquina dice" vs "lo que la impresora reporta" tras un reinicio.
- (e) **Progreso solo durante `IMPRIMIENDO`** — en `OBTENIENDO_GCODE`/`SUBIENDO_GCODE` el
  operador ve el estado pero sin progreso (solo el pulso de "en qué paso está").
- (f) **Mecanismo exacto de emisión de la confirmación** — el panel emite por
  `adaptador-confirmacion.confirmacion_recibida`, pero el canal mecánico concreto (cómo el
  adaptador-confirmacion medía la confirmación del operador) es del F7/sitio.

## Veredicto del ÁRBITRO (lente-roles) — CLASIFICACIÓN para el TRABAJADOR

Pregunta árbitro: ¿decide el FUTURO del ciclo (dispara/confirma) → JEFE · ¿EJECUTA las
confirmaciones físicas y VIGILA a diario → TRABAJADOR · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `iniciar` (`ciclo.iniciar.request`) | **JEFE** (NO trabajador) | La ÚNICA RPC: mete la siguiente pieza. El dueño decide cuándo arranca el reloj. El operador NO la toca. |
| `confirmacion:pieza_retirada` | **TRABAJADOR (contextual)** ✅ | Retirar la pieza de la cama es la mano del operador EN el taller. Se entrega por evento (NO RPC). → `IDLE`, el ciclo encadena. |
| `confirmacion:filamento_cambiado` | **TRABAJADOR (contextual)** ✅ | El sistema NO sabe cuándo el operador cambió el filamento — solo él. En `PAUSADO_FALTA_FILAMENTO`. → `IMPRIMIENDO`. |
| `confirmacion:reanudar_ciclo` | **TRABAJADOR (contextual)** ✅ | A solucionar el error lo decide el operador en la impresora; reanuda desde `ERROR`. Botón contextual. |
| `onEstadoCrudo` / `_vigilarProgreso` | **TRABAJADOR (vigila)** ✅ | Es la cara de VIGILANCIA del operador: consume `progreso.actualizado` para ver cuánto falta de la pieza que imprime. (El detectar en sí es neutro/sistema; el CONSUMIR progreso es del worker.) |
| `onImpresionCompletada` / `onImpresionError` / `onFilamentoFalta` | neutro→informa al worker | DUEÑO aplica transición automática; emite la señal que el operador VE (a saber si hay que retirar/cambiar/reanudar). |
| `onConfirmacionRecibida` | **TRABAJADOR** (vía adaptador-confirmacion) | Es el receptor de las 3 confirmaciones que la mano del operador emite cuando hace la acción física. NO es una cara `.request`, pero es la entrada de las EJECUCIONES del operador. |
| `modelo_aprobado` / `modelo_rechazado` | fuera de ciclo | Son del flujo de catálogo/aprobación (decisión de CALIDAD del jefe), NO del ciclo ni del trabajador. Su llegada aquí aborta (PREGUNTAS_ABIERTAS b). |

**Conclusión del árbitro (honesta y CLAVE):** a diferencia de `catalogo-modelos`, donde el
trabajador era un **LECTOR casi puro**, aquí el trabajador NO es pasivo — es **EJECUTOR de
las confirmaciones físicas** (`pieza_retirada` / `filamento_cambiado` / `reanudar_ciclo`) y
**VIGILANTE del progreso** (`progreso.actualizado`). Sus caras son 3 confirmaciones
contextuales (emitidas por evento `adaptador-confirmacion.confirmacion_recibida`, NO por
handler `.request`) + la observación del estado/pieza/progreso. Lo único que NO toca es
`iniciar` (RPC del jefe). El panel del operador se compone SOLO de esos botones contextuales
+ la vista viva de la máquina.

## Composición de la vista del TRABAJADOR (2 capas)

```text
1. VIGILAR  — el panel vivo del ciclo (estado actual + pieza en curso + progreso),
              reconstruido por la SEÑAL de eventos, sin recargas.
              · Estado (badge: IDLE / OBTENIENDO_GCODE / ... ) — le dice QUÉ hacer.
              · Pieza en curso (nombre, modelo, material) · progreso % + capa/total
                (progreso.actualizado, solo en IMPRIMIENDO).
2. EJECUTAR — el botón contextual ÚNICO (según estado):
              · ESPERANDO_RETIRADA     → "pieza retirada"       (evento pieza_retirada)
              · PAUSADO_FALTA_FILAMENTO→ "filamento cambiado"    (evento filamento_cambiado)
              · ERROR                  → "reanudar ciclo"        (evento reanudar_ciclo)
              · Cualquier otro estado  → sin botón de confirmación (nada que ejecutar;
                solo vigilar). NO hay botón "iniciar" aquí — eso es del JEFE.
```

### Frecuencia → jerarquía

- El gesto que MÁS hace el operador es **vigilar** (ver el estado y el progreso de la pieza).
  El panel vivo ES la vista.
- **Ejecutar** (retirar / cambiar filamento / reanudar) es el segundo gesto, y ocurre cuando
  la máquina lo pide — un botón contextual por estado.
- **NO hay acción de declaración ni de disparo del operador**: no inicia el ciclo (jefe), no
  edita, no aprueba. Su "acción" física se expresa como botones de confirmación contextual.

## Formas UI canónicas (disección, lente trabajador)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Panel del estado del ciclo (capa 1) | `cinta-estado`/dashboard | badge con el estado actual (8 estados) reconstruido por la señal de eventos; le dice QUÉ hacer. |
| Pieza en curso + progreso | `cinta-estado`/informe | item_id / modelo_id / nombre / material + progress %, current/total layer (de `progreso.actualizado`). |
| Confirmación "retirar pieza" (TRABAJADOR) | `confirmador-nombrado` | en `ESPERANDO_RETIRADA` → emite `pieza_retirada` (evento, NO RPC) |
| Confirmación "cambiar filamento" (TRABAJADOR) | `confirmador-nombrado` | en `PAUSADO_FALTA_FILAMENTO` → emite `filamento_cambiado` (evento) |
| Confirmación "reanudar ciclo" (TRABAJADOR) | `confirmador-nombrado` | en `ERROR` → emite `reanudar_ciclo` (evento) |
| Alerta de fallo / falta filamento | `cinta-estado`/aviso | `impresion.error` + `ciclo.abortado` / `filamento.falta` — le avisa del problema físico |
| TODAS las hojas | `señal-refresh` | **pareadas** (tabla abajo) |

## Señales pareadas por hoja (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo.

```text
(estado que el worker vigila)  → ciclo.iniciado / impresion.completada / filamento.falta /
                                 impresion.error / ciclo.cola_vacia / ciclo.completado ✅
                                 (publicadas en _iniciar / _detectarFin/Error/Falta / _encadenarSiguiente)
progreso en vivo → progreso.actualizado (y filamento.usado) ✅ (_vigilarProgreso, gating IMPRIMIENDO)
confirmar pieza_retirada → (estado)   ✅ (_aplicarTransicion ESPERANDO_RETIRADA→IDLE;
                                        siguiente señal: ciclo.iniciado por _encadenarSiguiente
                                        o ciclo.completado si cola_vacia)
confirmar filamento_cambiado → (estado) ✅ (_aplicarTransicion PAUSADO→IMPRIMIENDO;
                                          siguiente señal: progreso.actualizado)
confirmar reanudar_ciclo → (estado)    ✅ (_aplicarTransicion ERROR→IDLE)
iniciar (del JEFE, worker solo VE) → ciclo.iniciado ✅ (_iniciar, pieza en marcha)
```

Nota crítica: las **confirmaciones no tienen señal `.response` propia** porque NO son RPC — su
"respuesta" es la TRANSICIÓN del estado, que se refleja en el siguiente evento publicado.
Emitir la confirmación → el orquestador aplica la transición (`onConfirmacionRecibida`) →
publica el siguiente evento → la vista re-lee. Cero recargas.

## Huecos reales para el TRABAJADOR (honestos)

A diferencia de catalogo-modelos, el trabajador de ciclo-impresion NO es un lector pasivo:
**EJECUTA confirmaciones físicas + VIGILA**. Los huecos reales de su panel:

1. **Panel de vigilancia del ciclo** — dashboard: estado actual (8 estados) + pieza en curso
   + progreso %, reconstruido por la señal de eventos (NO hay RPC de leer el estado).
2. **Área de confirmaciones contextuales** — el botón ÚNICO por estado: `ESPERANDO_RETIRADA`
   →"pieza retirada" · `PAUSADO_FALTA_FILAMENTO`→"filamento cambiado" · `ERROR`→"reanudar
   ciclo". Cada uno emite el evento de confirmación (vía adaptador-confirmacion) — NO son
   handlers `.request` RPC.
3. **[MATIZ] Ausencia de `iniciar`** — el trabajador NO tiene botón de inicio del ciclo (es
   del jefe). En un taller de uso propio jefe=operador=dueño, así que el mismo panel puede
   mostrar `iniciar` (cara jefe) SOLO cuando el estado lo permita, y las confirmaciones (cara
   worker) contextuales. Si el sitio separa los paneles, el del worker es SOLO vigilar+confirmar.

`[ABIERTO]` (decisiones del sitio/dueño, NO del worker):
- (a) **Leer estado por RPC bajo demanda** — no existe hoy; el panel vive del bus.
- (b) **`ciclo.esperando_confirmacion` no publicada en index.js** — el aviso "tu mano hace
  falta" se deduce hoy del estado, no de una alerta dedicada (ver PREGUNTAS_ABIERTAS b).
- (c) **Trabajador vs jefe = mismo humano** — ¿panel del worker separado o dos caras del
  mismo panel que el jefe? Decisión de sitio (taller de uso propio).
- (d) **Reconciliación tras reinicio** — estado en memoria vs estado real de la impresora.
- (e) **Progreso fuera de `IMPRIMIENDO`** — ¿pulso en pasos de preparación?
- (f) **Mecanismo de emisión de confirmaciones** — el canal mecánico exacto por el que el
  adaptador-confirmacion recibe la confirmación del operador es del F7/sitio.

## El deliverable hacia F7 (spec de construcción)

El panel del TRABAJADOR para ciclo-impresion = `CicloWorkerOperacion` compuesto por:
- **Línea de estado vivo** (dashboard): badge del estado actual (IDLE / OBTENIENDO_GCODE /
  SUBIENDO_GCODE / IMPRIMIENDO / ESPERANDO_RETIRADA / PAUSADO_FALTA_FILAMENTO / ERROR /
  COLA_VACIA) + pieza en curso + progreso % — reconstruido por las señales publicadas
  (`ciclo.iniciado`, `impresion.completada`, `filamento.falta`, `impresion.error`,
  `ciclo.cola_vacia`, `ciclo.completado`, `progreso.actualizado`).
- **Zona de confirmación contextual** (única por estado): el botón que la mano del operador
  ejecuta cuando la máquina lo pide — cada botón emite el evento de confirmación (puente
  adaptador-confirmacion): `pieza_retirada` / `filamento_cambiado` / `reanudar_ciclo`.
- **Aviso de acción física** cuando el estado lo exige (retirar / filamento / reanudar) y
  **aviso de fallo** (`impresion.error` + `ciclo.abortado`) con el motivo.
- **SIN RPC del worker** — el operador no inicia el ciclo (es del jefe) ni pide estado;
  todas las confirmaciones van por el evento `adaptador-confirmacion.confirmacion_recibida`.
- Todas las mutaciones: emitir → señal refresca → la vista ES el feedback. Cero recargas.

> **NOTA hacia F7 (sin materializar aquí):** `iniciar` es el ÚNICO RPC request/response
> (`ciclo.iniciar.response`) y es del JEFE. Las 3 confirmaciones del TRABAJADOR NO son RPC —
> se entregan por evento `adaptador-confirmacion.confirmacion_recibida` (adaptador-confirmacion).
> **NINGÚN `ui_handler` se materializa en module.json en este esquema** (eso es del F7/registro).

## Puertos abiertos (cableables por el sitio)

- `fuente_del_estado` → hoy: las señales publicadas por el orquestador (`ciclo.iniciado`,
  `impresion.completada`, `filamento.falta`, `impresion.error`, `progreso.actualizado`,
  `ciclo.cola_vacia`, `ciclo.completado`). NO hay RPC de lectura del estado (hueco a).
- `ejecutor_de_confirmaciones` → hoy: evento `adaptador-confirmacion.confirmacion_recibida`
  → `onConfirmacionRecibida`. El panel del operador emite la confirmación (pieza_retirada /
  filamento_cambiado / reanudar_ciclo) por ese canal; NO llama a handlers `.request` del ciclo.
- `observador_de_progreso` → hoy: señal `progreso.actualizado` (consumida por el worker para
  vigilar la pieza que imprime ahora).
- `alerta_operativa` → hoy: señales `impresion.error`, `filamento.falta` (consumo de
  adaptador-avisos).

## Verificación contra index.js (agotado)

- **Handlers reales: 1 RPC + 5 fire-and-forget.** El ÚNICO `.request` es `onIniciarRequest`
  (`ciclo.iniciar.request`) — del JEFE, NO del trabajador. Los demás son listeners SIN handler
  de respuesta: `onEstadoCrudo` (`adaptador-impresora.estado_crudo`), `onImpresionCompletada`
  (`impresion.completada`), `onImpresionError` (`impresion.error`), `onFilamentoFalta`
  (`filamento.falta`), `onConfirmacionRecibida` (`adaptador-confirmacion.confirmacion_recibida`).
- **Máquina de estados completa** (`ESTADOS`, 8) y todas las transiciones (`_aplicarTransicion`):
  `IDLE/COLA_VACIA/ERROR →iniciar→ OBTENIENDO_GCODE`; `OBTENIENDO_GCODE →gcode_ok→
  SUBIENDO_GCODE`, `→cola_vacia→ COLA_VACIA`; `SUBIENDO_GCODE →subida_ok→ IMPRIMIENDO`;
  `IMPRIMIENDO →impresion.completada→ ESPERANDO_RETIRADA`, `→filamento.falta→
  PAUSADO_FALTA_FILAMENTO`, `→impresion.error→ ERROR`; `ESPERANDO_RETIRADA
  →confirmacion:pieza_retirada→ IDLE`; `PAUSADO_FALTA_FILAMENTO
  →confirmacion:filamento_cambiado→ IMPRIMIENDO`; `ERROR →confirmacion:reanudar_ciclo→ IDLE`.
  El trabajador toca SOLO las 3 confirmaciones físicas; el `iniciar` (→ OBTENIENDO_GCODE) es jefe.
- **Confirmaciones**: `CONFIRMACIONES` = `['pieza_retirada','filamento_cambiado',
  'reanudar_ciclo','modelo_aprobado','modelo_rechazado']`. `onConfirmacionRecibida` acepta los
  5 (`includes`), pero `_aplicarTransicion` SOLO transiciona los 3 del ciclo; `confirmacion:modelo_*`
  cae al `default` → lanza "transición ilegal" → `_abortar` → `ERROR + ciclo.abortado`. **Hallazgo**:
  las confirmaciones de aprobación de modelo NO pertenecen al ciclo ni al worker — al entrar
  aquí abortan. Filtrado por dominio = [ABIERTO] (b del jefe; PREGUNTAS_ABIERTAS b aquí).
- **Transición ilegal → aborto** (contrato tolerante): cualquier evento no legal para el
  estado actual lanza y `_abortar` pone `ERROR` + `ciclo.abortado`. Nunca basura.
- **`onEstadoCrudo` gating**: `_vigilarProgreso`/`_detectarFin`/`_detectarError`/
  `_detectarFaltaFilamento` SOLO si `ciclo.estado === 'IMPRIMIENDO'`. El progreso del worker
  existe solo mientras la pieza imprime.
- **`_encadenarSiguiente`**: tras `pieza_retirada` (estado→IDLE) vuelve a `_iniciar` con la
  siguiente; si cola vacía → `ciclo.completado`. El operador solo retira; el ciclo encadena.
- **Publishers reales (en index.js)**: `ciclo.iniciado`, `ciclo.completado`, `ciclo.abortado`,
  `ciclo.cola_vacia`, `impresion.completada`, `impresion.error`, `filamento.falta`,
  `filamento.usado`, `progreso.actualizado`. **NO incluyen `ciclo.esperando_confirmacion`**
  (declarada en module.json `publishes`, pero sin `_publicarEvento` real en index.js — hueco
  honesto (b)).
- **No persiste** (config `persistence.runtime/in-memory`): la máquina vive en memoria
  (`this._ciclos`, Map por `project_id`) y se reanuda desde IDLE al reiniciar.
- **No hay op de leer estado por RPC, ni update/delete/cancelar del ciclo** — es un
  orquestador, no un CRUD. Cualquier hueco (leer estado, reconciliar tras reinicio, la señal
  `ciclo.esperando_confirmacion` no publicada) es [ABIERTO] de decisión del dueño, no un
  defecto de la UI.
