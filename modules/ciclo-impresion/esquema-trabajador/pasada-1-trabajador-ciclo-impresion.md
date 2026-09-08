# Pasada 1 — Esquematizador (lente TRABAJADOR) · ciclo-impresion

> SUJETO: **la cara del TRABAJADOR sobre el ciclo de impresión 3D** — quien opera el
> flujo físico a diario: arranca el ciclo, retira piezas, cambia filamento y reanuda
> tras error. Es la cara GRUESA del ciclo: ciclo-impresion es un ORQUESTADOR
> (MICRO-AGENTE) que es DUEÑO de su máquina de estados (en memoria) y NO declara
> config de reglas (su "regla" es la transición legal). Por eso el rol que aterriza
> aquí en la práctica es el TRABAJADOR. Las caras JEFE (aprobar/rechazar modelo) y
> CLIENTE (elegir/comprar, vive en cola-impresion) se dejan AL MARGEN de esta lente.

## Alimento (informer al prisma — verificado contra module.json + index.js)

- **Handlers reales (index.js)**: `onIniciarRequest` es el ÚNICO RPC consumible por
  UI (evento `ciclo.iniciar.request` → `_atender(e,'iniciar',…)`). El resto son
  fire-and-forget / estado: `onEstadoCrudo` (vigila), `onImpresionCompletada`,
  `onImpresionError`, `onFilamentoFalta`, `onConfirmacionRecibida` (NO son RPC
  `on*Request` consumibles por UI — se disparan por EVENTOS).
- **Máquina de estados** (index.js ESTADOS): IDLE / OBTENIENDO_GCODE /
  SUBIENDO_GCODE / IMPRIMIENDO / ESPERANDO_RETIRADA / PAUSADO_FALTA_FILAMENTO /
  ERROR / COLA_VACIA.
- **Confirmaciones** (CONFIRMACIONES): pieza_retirada, filamento_cambiado,
  reanudar_ciclo, modelo_aprobado, modelo_rechazado — el ciclo las entiende, pero
  SOLO vía `adaptador-confirmacion.confirmacion_recibida` (evento, NO RPC UI).
- **Eventos que publica** (alimentan las señales pareadas): ciclo.iniciado,
  ciclo.completado, ciclo.abortado, ciclo.cola_vacia, ciclo.esperando_confirmacion,
  impresion.completada, impresion.error, filamento.falta, filamento.usado,
  progreso.actualizado.

## Las 5 preguntas con LENTE TRABAJADOR

1. **IDENTIDAD** — ¿Qué OPERA el TRABAJADOR aquí?
   - **iniciar** (arranque): IDLE/COLA_VACIA/ERROR → OBTENIENDO_GCODE. Lanza la
     siguiente pieza (gcode → subir → imprimir → observar). ES el único con RPC
     directo: `onIniciarRequest`.
   - **pieza_retirada** (confirmación física): ESPERANDO_RETIRADA → IDLE (encadena
     la siguiente). El trabajador saca la pieza de la cama.
   - **filamento_cambiado**: PAUSADO_FALTA_FILAMENTO → IMPRIMIENDO. Carga rollo nuevo.
   - **reanudar_ciclo**: ERROR → IDLE. Desatasca/limpia y relanza.
   - Neutro (informa): `estado` (fase, pieza, progreso, error).
2. **RESTRICCIONES** — ¿Qué NO depende del trabajador? Custodios vía RPC (nunca
   import): cupula-gcode (gcode), cola-impresion (cola), gestion-filamento,
   historial-impresiones, adaptador-{impresora,aviso,slicing,confirmacion}. La
   máquina de estados es del MÓDULO, no de la UI (transición ilegal → 409
   CONFLICT_STATE). Estado en memoria; si el proceso cae → IDLE. El trabajador NO
   decide qué pieza entra (cola-impresion), solo opera la transición física de la
   pieza ya encolada. **CRÍTICO**: pieza_retirada / filamento_cambiado /
   reanudar_ciclo NO tienen `on*Request` en el index.js — se disparan por evento
   adaptador-confirmacion.confirmacion_recibida, NO por RPC UI directo.
3. **CONTRATO** — ¿Qué necesita VER para operar y qué SEÑAL pareada confirma?
   - VER: `estado` (fase/pieza/progreso/error) + `progreso.actualizado` +
     `ciclo.esperando_confirmacion` (cuándo debe actuar).
   - SEÑALES pareadas (index.js): iniciar → ciclo.iniciado (o abortado/cola_vacia);
     pieza_retirada → ciclo.iniciado (encadena) o ciclo.completado (cola vacía);
     filamento_cambiado → ciclo.iniciado (reanuda); reanudar_ciclo → ciclo.iniciado.
4. **NO-OBJETIVOS** — La cara JEFE (modelo_aprobado/rechazado — decisión de calidad)
   y la car CLIENTE (elegir/comprar, en cola-impresion) quedan al margen aquí. El
   sistema (health/metrics) informa, no decide.
5. **PREGUNTAS_ABIERTAS** — [ABIERTO]
   - (a) Las 3 confirmaciones físicas (pieza_retirada, filamento_cambiado,
     reanudar_ciclo) no tienen handler RPC en el index.js. La UI debe emitir el
     evento adaptador-confirmacion.confirmacion_recibida (o pulsarlo vía el
     adaptador), NO una llamada directa al orquestador. No se inventa handler falso.
   - (b) ¿El trabajador necesita ver el motivo del error antes de reanudar? Hoy
     `reanudar_ciclo` no exige confirmar el motivo (señal: ciclo.iniciado sin cargo).
   - (c) ¿Aviso push "pieza lista" fuera del taller? Hoy avisa por adaptador-avisos.

## Composición de la vista (3 capas)

```
1. SELECCIONAR — no hay entidad a elegir (una pieza a la vez): el ciclo es único.
                  La cinta-estado ES el selector (qué fase, qué pieza).
2. INFORMARSE   — estado + progreso.actualizado + ciclo.esperando_confirmacion
                  (cuándo debe actuar el trabajador).
3. OPERAR       — las ÚNICAS escrituras:
                  · iniciar (RPC onIniciarRequest) — arranque.
                  · confirmaciones físicas (pieza_retirada, filamento_cambiado,
                    reanudar_ciclo) — [ABIERTO RPC]: se disparan por evento
                    adaptador-confirmacion.confirmacion_recibida.
```

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta de fase del ciclo | `cinta-estado` | estado: fase, pieza, progreso %, error. |
| Iniciar ciclo (TRABAJADOR) | `inline-gesture` | handler onIniciarRequest. Señal: ciclo.iniciado. |
| Confirmar retirada (TRABAJADOR) | `inline-gesture` | [ABIERTO] evento confirmacion_recibida. Señal: ciclo.iniciado/completado. |
| Confirmar filamento (TRABAJADOR) | `inline-gesture` | [ABIERTO] evento confirmacion_recibida. Señal: ciclo.iniciado. |
| Reanudar tras error (TRABAJADOR) | `confirmador-nombrado` | [ABIERTO] evento confirmacion_recibida. Nombra el error. Señal: ciclo.iniciado. |

## Cables hacia el blueprint

- `ui.roles` = iniciar=trabajador, pieza_retirada=trabajador,
  filamento_cambiado=trabajador, reanudar_ciclo=trabajador, estado=neutro.
- `ui.flujo` TRABAJADOR: [iniciar] · [pieza_retirada / filamento_cambiado /
  reanudar_ciclo según fase] · [neutro: estado].
- `ui.estados` = máquina del ciclo (8 estados).
- señales de refresco: ciclo.{iniciado,completado,abortado,cola_vacia,
  esperando_confirmacion} + progreso.actualizado.
