# ESQUEMA — cara del JEFE del módulo `entrega` (the-pirate, reflejo-0.1.0)

> Árbol maestro consolidado (pasadas 1-2 + anatomía). Alimenta al agente de UI
> que escribe el panel. Ley de agnosticismo: cero tecnología de sistema ambiente.
> El análisis es de la CARA DEL JEFE — la utilización (POS/PWA/cliente) quedó fuera.

## 1. Quién es el jefe y qué decide

Dueño de la POLÍTICA DE REPARTO y de los TIEMPOS de preparación. El contrato
entrega-v1 nace con nulls = política por declarar: el dueño la puebla. Decide:
- **D1 — política de reparto** (bloque `reparto`): activo, radio_km, coste
  (EUR), minutos_por_km — qué reparte, a qué distancia, a qué precio y ritmo.
- **D2 — estimación de preparación** (bloque `estimacion`):
  minutos_preparacion_base + minutos_por_item — cómo se estima al elegir delivery.

Lo que NO decide: a qué pedido se reparte (pedidos/cuentas), el cobro
(caja/cobro), el reparto ajeno (glovo/llevadoo), ni consume la política al
vender (POS/PWA — utilización).

## 2. Invariantes (restricciones honestas, verificadas en código)

- INV1 — **single-writer**: ConfigCustodio (leer→validar→merge profundo→
  persistir→evento). reglas.actualizar es la ÚNICA escritura por bloques;
  los campos ausentes se preservan.
- INV2 — **sin 404 de lectura**: custodio.leer SIEMPRE responde: la regla
  persistida (fuente='persistida') o los defaults (fuente='default').
  La falta de política es estado NOMBRADO, no error.
- INV3 — **política incompleta degrada con gracia**: null = por declarar;
  el estimador responde metodo='pendiente' + nota en vez de romper.
- INV4 — **el dictamen viene en la respuesta** de actualizar ({ reglas:
  nuevas }) y la señal `entrega.reglas.actualizadas` re-asienta la vista.
- INV5 — **estado 'default' = "sin política — usa los defaults"**: la vista
  lo nombra en claro (nunca lo pinta como fallo).
- INV6 — moneda: EUR por convención del dominio (el contrato valida número;
  los hermanos pizzepos persisten euros 2dec). La UI edita €. Cero céntimos.
- INV7 — multi-tenant: todo RPC lleva project_id (lo inyecta la capa de
  request de la UI); el store JSON vive por proyecto.

## 3. Señales pareadas (verificadas en index.js + config-custodio.js)

| Declaración | Señal de confirmación | Payload |
|---|---|---|
| reglas.actualizar (bloque reparto) | `entrega.reglas.actualizadas` | { project_id, reglas } completas |
| reglas.actualizar (bloque estimacion) | `entrega.reglas.actualizadas` | { project_id, reglas } completas |

UNA sola señal para todo el módulo (granularidad de módulo, no de campo; no
hay diff {campo:{anterior,nuevo}} — hueco menor, anotado en la anatomía).
Cadena verificada: custodio (L119) → eventBus core (bus.js: emit → MQTT
core/*/events/...) → frontend (suscripción dot notation). El módulo hermano
masa usa exactamente el mismo patrón con masa.reglas.actualizadas.

## 4. Veredicto del árbitro (4/4) y composición de la vista

```
¿ESCRIBE reglas via custodio? → JEFE · ¿sirve venta AHORA? → UTILIZACION · ¿solo lee? → NEUTRO
```

- **jefe (1)**: `reglas.actualizar` — LA DECLARACIÓN de política.
- **utilizacion (2)**: `tiempo.estimar` (POS/PWA al elegir delivery),
  `reparto.obtener` (el cliente consulta la política) — FUERA del panel-jefe.
- **neutro (1)**: `reglas.leer` — informe que alimenta la decisión.

Composición 3 capas del panel del jefe:

```
1. INFORMARSE   informe reglas.leer: la política vigente en claro, distinguiendo
                origen (fuente 'persistida' vs 'default' → estado "sin política")
2. DECLARAR     editor-bloque REPARTO (J1) + editor-bloque ESTIMACIÓN (J2),
                cada uno 1 llamada reglas.actualizar { soloSuBloque }
3. CONFIRMAR    dictamen de la respuesta + señal entrega.reglas.actualizadas
                re-lee el informe (debounce). Nunca recarga.
```

(R1 frecuencia: reparto primero, estimación set-once. R2 sin estado asumido.
R3 la señal manda + dictamen RPC. R4 transparencia de origen.)

**Diferencia con otros módulos declarados "sin señal":** aquí la señal SÍ
existe, verificada hasta el MQTT del core; el dictamen RPC inmediato y la
señal conviven (respuesta = dictamen puntual; señal = re-lectura de la vista).

## 5. Formas UI asignadas

| Hoja | Forma | RPC | Señal |
|---|---|---|---|
| Informe de política | cinta-estado + bloque de lectura con origen | reglas.leer | re-leída por la señal |
| Política de reparto | editor-bloque (toggle + 3 cifras) | reglas.actualizar { reparto } | entrega.reglas.actualizadas |
| Estimación de preparación | editor-bloque (2 cifras) | reglas.actualizar { estimacion } | entrega.reglas.actualizadas |

Hojas de utilización (excluidas del panel): tiempo.estimar (POS/PWA) y
reparto.obtener (cliente) — anotadas en el blueprint con su veredicto.

## 6. Huecos [ABIERTO] — decisiones del dueño, se NOMBRAN (pasada-1 §5)

1. Horario de reparto (día/hora) — hoy no declarable.
2. Zonas múltiples vs radio plano.
3. Pedido mínimo / envío gratis a partir de X.
4. Quién reparte (propio vs mixto glovo/llevadoo por franja).

Huecos de CONTRATO (faltan campos en entrega-v1), no de CAPTURA: la UI no
pide nada que el módulo no soporte.