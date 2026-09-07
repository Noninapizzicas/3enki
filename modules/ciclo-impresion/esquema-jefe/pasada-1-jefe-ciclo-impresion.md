# Pasada 1 — Esquematizador-Jefe · ciclo-impresion

> SUJETO correcto: **la cara del ROL JEFE del ciclo de impresión** — NO el módulo entero.
> ciclo-impresion es un ORQUESTADOR (MICRO-AGENTE) que es DUEÑO de la máquina de
> estados del ciclo (en memoria). No es un custodio de reglas: su "regla" es la
> transición legal del ciclo. La cara del jefe = el dueño del taller que DECIDE
> arrancar el ciclo, se INFORMA del estado y CONFIRMA las transiciones físicas
> (retirar pieza, cambiar filamento, reanudar tras error).

## Alimento (informer al prisma)

- **Eventos que publica** (module.json): ciclo.iniciado, ciclo.completado,
  ciclo.abortado, ciclo.cola_vacia, ciclo.esperando_confirmacion,
  impresion.completada, impresion.error, filamento.falta, filamento.usado,
  progreso.actualizado.
- **Eventos que escucha**: ciclo.iniciar.request, impresion.completada,
  impresion.error, filamento.falta, adaptador-confirmacion.confirmacion_recibida,
  adaptador-impresora.estado_crudo.
- **Máquina de estados** (index.js): IDLE → OBTENIENDO_GCODE → SUBIENDO_GCODE →
  IMPRIMIENDO → ESPERANDO_RETIRADA → IDLE (encadena siguiente); ramas: ERROR,
  PAUSADO_FALTA_FILAMENTO, COLA_VACIA.
- **Confirmaciones** (CONFIRMACIONES): pieza_retirada, filamento_cambiado,
  reanudar_ciclo, modelo_aprobado, modelo_rechazado.
- **Invariantes**: la impresora nunca queda idle por falta de gcode (cúpula cachea
  o slicera antes de encadenar); una pieza a la vez; contrato tolerante (RPC falla
  → ciclo.abortado, nunca basura).

## Las 5 preguntas-jefe

1. **IDENTIDAD** — ¿Qué DECIDE el jefe aquí? El dueño del taller decide:
   - **Arrancar el ciclo** (`iniciar`): lanza la siguiente pieza de la cola
     (obtener gcode → subir → imprimir → observar). Es la transición de arranque.
   - **Confirmar las transiciones físicas** (vía adaptador-confirmacion):
     `pieza_retirada` (ESPERANDO_RETIRADA → IDLE, encadena siguiente),
     `filamento_cambiado` (PAUSADO_FALTA_FILAMENTO → IMPRIMIENDO),
     `reanudar_ciclo` (ERROR → IDLE). El ciclo NO es 100% autónomo: el dueño debe
     retirar la pieza y cambiar filamento entre ciclos.
   - **Ver el estado** (`estado`): pulso del ciclo (qué pieza, qué fase, progreso).
2. **RESTRICCIONES** — ¿Qué NO depende de él? El custodio del gcode es la
   cúpula-gcode; el de la cola es cola-impresion; el de filamento es
   gestion-filamento; el de historial es historial-impresiones. El ciclo orquesta
   por RPC (nunca import). La máquina de estados es del MÓDULO, no de la UI: una
   transición ilegal lanza error (409 CONFLICT_STATE si ya está imprimiendo).
   El estado es en memoria: si el proceso cae, el ciclo se reanuda desde IDLE.
3. **CONTRATO** — ¿Qué necesita VER antes de decidir y qué SEÑAL confirma?
   - VER: `estado` (fase actual, pieza, progreso, error) + `progreso.actualizado`
     (stream de la impresora) + `ciclo.esperando_confirmacion` (cuándo debe actuar).
   - SEÑALES de confirmación (pareadas): `iniciar` → `ciclo.iniciado` (o
     `ciclo.abortado`/`ciclo.cola_vacia`); `pieza_retirada` → `ciclo.completado`
     (si cola vacía) o `ciclo.iniciado` (encadena siguiente); `filamento_cambiado`
     → `ciclo.iniciado` (reanuda); `reanudar_ciclo` → `ciclo.iniciado`.
4. **NO-OBJETIVOS** — La UTILIZACIÓN (elegir qué pieza imprimir, gestionar la
   cola) vive en cola-impresion, NO aquí. El sistema (health, metrics) informa,
   no decide. El gcode/slicing es de cupula-gcode/adaptador-slicing.
5. **PREGUNTAS_ABIERTAS** — [ABIERTO] (a) ¿el dueño quiere aprobar/rechazar el
   modelo antes de imprimir? (CONFIRMACIONES incluye modelo_aprobado/rechazado
   pero no hay op UI); (b) ¿notificación push de "pieza lista" al dueño fuera del
   taller? (hoy avisa por adaptador-avisos).

## Veredicto del ÁRBITRO (lente-roles)

Pregunta árbitro: ¿decide el FUTURO del ciclo (transiciona la máquina de estados)
→ JEFE · ¿sirve una decisión AHORA al elegir → UTILIZACIÓN · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `iniciar` | **JEFE** | Transición de arranque del ciclo (IDLE/COLA_VACIA/ERROR → OBTENIENDO_GCODE). El dueño decide lanzar la impresión. |
| `estado` | neutro | Lectura del pulso del ciclo (fase, pieza, progreso). Alimenta la cinta-estado. |
| `pieza_retirada` (confirmación) | **JEFE** | Transición física ESPERANDO_RETIRADA → IDLE (encadena siguiente). Decisión del dueño. |
| `filamento_cambiado` (confirmación) | **JEFE** | Transición PAUSADO_FALTA_FILAMENTO → IMPRIMIENDO. Decisión del dueño. |
| `reanudar_ciclo` (confirmación) | **JEFE** | Transición ERROR → IDLE. Decisión del dueño. |

**Dualidad en una línea**: el ciclo NACE de la cola (utilización, cola-impresion)
y VIVE en el orquestador; el panel-jefe SOLO arranca el ciclo y confirma las
transiciones físicas — jamás edita la cola ni el gcode (invariante).

## Composición de la vista del jefe (3 capas)

```
1. SELECCIONAR  — no hay entidad a elegir (una pieza a la vez): el ciclo es único.
                  La cinta-estado ES el selector (qué fase, qué pieza).
2. INFORMARSE   — estado (fase, pieza, progreso, error) + progreso.actualizado
                  (stream) + ciclo.esperando_confirmacion (cuándo actuar).
3. DECLARAR     — las ÚNICAS escrituras del jefe: iniciar (arranque) + las
                  confirmaciones físicas (pieza_retirada, filamento_cambiado,
                  reanudar_ciclo) según la fase activa. La señal pareada re-lee.
```

### Frecuencia → jerarquía
- El gesto rey es la CONFIRMACIÓN de la fase activa (1 toque en vista): retirar
  pieza, cambiar filamento, reanudar.
- `iniciar` es el gesto de arranque (botón principal cuando IDLE/COLA_VACIA/ERROR).
- `reanudar_ciclo` tras ERROR es gruesa → `confirmador-nombrado` (nombra el error).

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta de fase del ciclo | `cinta-estado` | estado: fase actual, pieza, progreso %, error. Alimenta la decisión. |
| Botón Iniciar ciclo | `inline-gesture` | arranque cuando IDLE/COLA_VACIA/ERROR. Señal: ciclo.iniciado. |
| Confirmar retirada de pieza | `inline-gesture` | ESPERANDO_RETIRADA → encadena siguiente. Señal: ciclo.iniciado/completado. |
| Confirmar cambio de filamento | `inline-gesture` | PAUSADO_FALTA_FILAMENTO → reanuda. Señal: ciclo.iniciado. |
| Reanudar tras error | `confirmador-nombrado` | ERROR → IDLE. Nombra el error. Señal: ciclo.iniciado. |
| TODAS las de declaración | `señal-refresh` | pareadas (tabla abajo) |

## Señales pareadas por hoja de declaración (verificadas en index.js)

```
iniciar            → ciclo.iniciado        ✅ (o ciclo.abortado / ciclo.cola_vacia)
pieza_retirada     → ciclo.iniciado        ✅ (encadena siguiente) o ciclo.completado (cola vacía)
filamento_cambiado → ciclo.iniciado        ✅ (reanuda IMPRIMIENDO)
reanudar_ciclo     → ciclo.iniciado        ✅ (ERROR → IDLE → arranca)
```

## Cables hacia el blueprint (agente crear-blueprint-jefe)

- `ui.roles` = veredicto del árbitro: iniciar=jefe, estado=neutro (+ confirmaciones
  jefe como ops de transición).
- `ui.flujo` jefe-PRIMERO: [jefe: iniciar, pieza_retirada, filamento_cambiado,
  reanudar_ciclo] → [neutro: estado].
- `ui.estados` = máquina de estados del ciclo (IDLE, OBTENIENDO_GCODE,
  SUBIENDO_GCODE, IMPRIMIENDO, ESPERANDO_RETIRADA, PAUSADO_FALTA_FILAMENTO,
  ERROR, COLA_VACIA).
- `ui.datos` = estado con refresh_on = eventos de negocio del ciclo.
- señales de refresco: ciclo.{iniciado,completado,abortado,cola_vacia,
  esperando_confirmacion} + progreso.actualizado.
