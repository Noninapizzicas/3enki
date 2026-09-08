# Pasada 1 — Esquematizador-Jefe-Trabajador · ciclo-impresion

> SUJETO correcto: **las DOS caras trabajadas del ciclo de impresión — la del JEFE
> (quien declara reglas/config y decide) y la del TRABAJADOR (quien opera la máquina a
> diario)** — NO el módulo entero. La cara del CLIENTE (POS/PWA/consumo) se deja AL
> MARGEN: no es de este esquema.
>
> ciclo-impresion es un ORQUESTADOR (MICRO-AGENTE) que es DUEÑO de la máquina de
> estados del ciclo (en memoria). No es un custodio de reglas: su "regla" es la
> transición legal del ciclo. Por eso la cara del JEFE aquí es DELGADA (casi no
> declara reglas: no hay config de reglas, solo persistence runtime) y la cara del
> TRABAJADOR es la GRUESA: arrancar el ciclo, retirar la pieza, cambiar el filamento y
> reanudar tras error son operaciones FÍSICAS del taller, no decisiones de reglas.

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
- **Config**: NO hay config de reglas. `config.persistence` = runtime/in-memory
  (la máquina de estados no persiste; si el proceso cae, el ciclo se reanuda desde
  IDLE y el estado real lo reporta adaptador-impresora).
- **Invariantes**: la impresora nunca queda idle por falta de gcode (cúpula cachea
  o slicera antes de encadenar); una pieza a la vez; contrato tolerante (RPC falla
  → ciclo.abortado, nunca basura); el ciclo NO es 100% autónomo — el trabajador debe
  retirar la pieza y cambiar filamento entre ciclos.

## Las 5 preguntas-jefe + trabajador

1. **IDENTIDAD** — ¿Qué DECIDE el JEFE aquí? ¿Qué OPERA el TRABAJADOR aquí?
   - **JEFE (delgado)**: el dueño del taller decide la **aprobación de calidad del
     modelo** antes de imprimir (`modelo_aprobado` / `modelo_rechazado` — presentes
     en CONFIRMACIONES, sin op UI hoy). Es la única decisión de "regla/calidad" del
     ciclo: qué pieza merece imprimirse. No hay config de reglas que declarar.
   - **TRABAJADOR (grueso)**: opera el flujo físico a diario:
     - **Arrancar el ciclo** (`iniciar`): lanza la siguiente pieza de la cola
       (obtener gcode → subir → imprimir → observar). Es la transición de arranque.
     - **Retirar la pieza** (`pieza_retirada`): ESPERANDO_RETIRADA → IDLE (encadena
       la siguiente). Acción física: sacar la pieza de la cama.
     - **Cambiar el filamento** (`filamento_cambiado`): PAUSADO_FALTA_FILAMENTO →
       IMPRIMIENDO. Acción física: cargar rollo nuevo.
     - **Reanudar tras error** (`reanudar_ciclo`): ERROR → IDLE. Acción física:
       desatascar/limpiar y relanzar.
   - **NEUTRO**: `estado` (pulso del ciclo: fase, pieza, progreso) — solo informa.
2. **RESTRICCIONES** — ¿Qué NO depende de cada rol? El custodio del gcode es la
   cúpula-gcode; el de la cola es cola-impresion; el de filamento es
   gestion-filamento; el de historial es historial-impresiones. El ciclo orquesta
   por RPC (nunca import). La máquina de estados es del MÓDULO, no de la UI: una
   transición ilegal lanza error (409 CONFLICT_STATE si ya está imprimiendo). El
   estado es en memoria: si el proceso cae, el ciclo se reanuda desde IDLE. El
   JEFE NO edita la cola ni el gcode; el TRABAJADOR NO decide qué pieza entra (eso
   es cola-impresion) — solo opera la transición física de la pieza ya encolada.
3. **CONTRATO** — ¿Qué necesita VER cada rol antes de decidir/operar y qué SEÑAL
   pareada confirma cada acción?
   - VER (ambos): `estado` (fase actual, pieza, progreso, error) +
     `progreso.actualizado` (stream de la impresora) + `ciclo.esperando_confirmacion`
     (cuándo debe actuar el trabajador).
   - SEÑALES de confirmación (pareadas, verificadas en index.js): `iniciar` →
     `ciclo.iniciado` (o `ciclo.abortado`/`ciclo.cola_vacia`); `pieza_retirada` →
     `ciclo.completado` (si cola vacía) o `ciclo.iniciado` (encadena siguiente);
     `filamento_cambiado` → `ciclo.iniciado` (reanuda); `reanudar_ciclo` →
     `ciclo.iniciado`. `modelo_aprobado/rechazado` → transición de aprobación
     (hoy sin op UI, [ABIERTO]).
4. **NO-OBJETIVOS** — La cara CLIENTE (elegir/comprar pieza, gestionar la cola)
   vive en cola-impresion, NO aquí (al margen). El sistema (health, metrics)
   informa, no decide. El gcode/slicing es de cupula-gcode/adaptador-slicing. El
   JEFE no configura pesos ni reglas (no hay config de reglas en este módulo).
5. **PREGUNTAS_ABIERTAS** — [ABIERTO] (a) ¿el dueño quiere aprobar/rechazar el
   modelo antes de imprimir? (CONFIRMACIONES incluye modelo_aprobado/rechazado
   pero no hay op UI — es la única cara de JEFE real y está sin materializar);
   (b) ¿notificación push de "pieza lista" al trabajador fuera del taller? (hoy avisa
   por adaptador-avisos); (c) ¿el trabajador necesita ver el motivo del error antes
   de reanudar? (hoy `reanudar_ciclo` no exige confirmar el motivo).

## Veredicto del ÁRBITRO (lente-roles: jefe vs trabajador)

Pregunta árbitro: ¿decide el FUTURO del ciclo por REGLA/CALIDAD (aprueba, declara
config) → JEFE · ¿opera el flujo físico a diario (arranca, confirma físico, retira,
reanuda) → TRABAJADOR · ¿solo informa → NEUTRO? La cara CLIENTE (elegir/comprar) NO se
clasifica aquí.

| Op | Veredicto | Por qué |
|---|---|---|
| `iniciar` | **TRABAJADOR** | Arranca el flujo a diario (IDLE/COLA_VACIA/ERROR → OBTENIENDO_GCODE). Operación física de arranque del taller, no decisión de reglas. |
| `pieza_retirada` (confirmación) | **TRABAJADOR** | Transición física ESPERANDO_RETIRADA → IDLE (encadena siguiente). El trabajador saca la pieza de la cama. |
| `filamento_cambiado` (confirmación) | **TRABAJADOR** | Transición física PAUSADO_FALTA_FILAMENTO → IMPRIMIENDO. El trabajador carga el rollo nuevo. |
| `reanudar_ciclo` (confirmación) | **TRABAJADOR** | Transición física ERROR → IDLE. El trabajador desatasca/limpia y relanza. |
| `modelo_aprobado` / `modelo_rechazado` | **JEFE** | Decisión de CALIDAD/regla del dueño: qué pieza merece imprimirse. Presente en CONFIRMACIONES, sin op UI hoy. |
| `estado` | neutro | Lectura del pulso del ciclo (fase, pieza, progreso). Alimenta la cinta-estado, no decide. |

**Dualidad en una línea**: el JEFE aprueba la calidad del modelo (regla, delgada y
hoy sin materializar); el TRABAJADOR opera el ciclo físico a diario (arrancar, retirar,
cambiar filamento, reanudar); el CLIENTE queda al margen (elegir/comprar vive en
cola-impresion).

## Composición de la vista (3 capas)

```
1. SELECCIONAR  — no hay entidad a elegir (una pieza a la vez): el ciclo es único.
                  La cinta-estado ES el selector (qué fase, qué pieza).
2. INFORMARSE   — estado (fase, pieza, progreso, error) + progreso.actualizado
                  (stream) + ciclo.esperando_confirmacion (cuándo debe actuar el
                  trabajador). Alimenta la decisión de ambos roles.
3. DECLARAR/OPERAR — las ÚNICAS escrituras:
                  · TRABAJADOR: iniciar (arranque) + las confirmaciones físicas
                    (pieza_retirada, filamento_cambiado, reanudar_ciclo) según la
                    fase activa. La señal pareada re-lee.
                  · JEFE: aprobar/rechazar modelo (hoy sin op UI, [ABIERTO]).
```

### Frecuencia → jerarquía
- El gesto rey es la CONFIRMACIÓN FÍSICA del trabajador en la fase activa (1 toque en
  vista): retirar pieza, cambiar filamento, reanudar.
- `iniciar` es el gesto de arranque del trabajador (botón principal cuando
  IDLE/COLA_VACIA/ERROR).
- `reanudar_ciclo` tras ERROR es gruesa → `confirmador-nombrado` (nombra el error).
- La cara del JEFE (aprobar/rechazar) es de baja frecuencia y hoy no tiene op UI.

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta de fase del ciclo | `cinta-estado` | estado: fase actual, pieza, progreso %, error. Alimenta la decisión de ambos roles. |
| Botón Iniciar ciclo (TRABAJADOR) | `inline-gesture` | arranque cuando IDLE/COLA_VACIA/ERROR. Señal: ciclo.iniciado. |
| Confirmar retirada de pieza (TRABAJADOR) | `inline-gesture` | ESPERANDO_RETIRADA → encadena siguiente. Señal: ciclo.iniciado/completado. |
| Confirmar cambio de filamento (TRABAJADOR) | `inline-gesture` | PAUSADO_FALTA_FILAMENTO → reanuda. Señal: ciclo.iniciado. |
| Reanudar tras error (TRABAJADOR) | `confirmador-nombrado` | ERROR → IDLE. Nombra el error. Señal: ciclo.iniciado. |
| Aprobar/rechazar modelo (JEFE) | `confirmador-nombrado` | [ABIERTO] decisión de calidad del dueño; sin op UI hoy. |
| TODAS las de declaración | `señal-refresh` | pareadas (tabla abajo) |

## Señales pareadas por hoja de declaración (verificadas en index.js)

```
iniciar            → ciclo.iniciado        ✅ (o ciclo.abortado / ciclo.cola_vacia)
pieza_retirada     → ciclo.iniciado        ✅ (encadena siguiente) o ciclo.completado (cola vacía)
filamento_cambiado → ciclo.iniciado        ✅ (reanuda IMPRIMIENDO)
reanudar_ciclo     → ciclo.iniciado        ✅ (ERROR → IDLE → arranca)
modelo_aprobado    → (transición aprobación) ⚠️ [ABIERTO] sin op UI
modelo_rechazado   → (transición rechazo)   ⚠️ [ABIERTO] sin op UI
```

## Cables hacia el blueprint (agente crear-blueprint-jefe)

- `ui.roles` = veredicto del árbitro: iniciar=trabajador, pieza_retirada=trabajador,
  filamento_cambiado=trabajador, reanudar_ciclo=trabajador, modelo_aprobado/rechazado=
  jefe, estado=neutro.
- `ui.flujo` TRABAJADOR-PRIMERO: [trabajador: iniciar, pieza_retirada,
  filamento_cambiado, reanudar_ciclo] → [jefe: modelo_aprobado/rechazado] →
  [neutro: estado].
- `ui.estados` = máquina de estados del ciclo (IDLE, OBTENIENDO_GCODE,
  SUBIENDO_GCODE, IMPRIMIENDO, ESPERANDO_RETIRADA, PAUSADO_FALTA_FILAMENTO,
  ERROR, COLA_VACIA).
- `ui.datos` = estado con refresh_on = eventos de negocio del ciclo.
- señales de refresco: ciclo.{iniciado,completado,abortado,cola_vacia,
  esperando_confirmacion} + progreso.actualizado.
