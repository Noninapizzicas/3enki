# Pasada 4 — Consolidación con el método esquematizador-jefe (pedidos v2)

> Ronda de CIERRE: el material de `esquema/interfaz-pedidos` (pasadas 1-3, 41 piezas)
> y `esquema/interfaz-pedidos-v2` (dos vías, 28 piezas) se revisa contra el método
> `esquematizador-jefe` (5 preguntas-jefe + lente-roles + formas UI canónicas +
> composición en 3 capas). No reescribe lo bueno: NOMBRA lo que faltaba y lo apunta
> a una forma. Suelo confirmado. Testigos: `productos/esquema-jefe/pasada-4...md`
> y `variaciones/esquema/pasada-4...md`.
>
> SUJETO correcto: **la cara del ROL JEFE de pedidos** — NO el módulo entero.
> Pedidos es el caso de DUALIDAD FUERTE: tiene DOS caras perfectamente separadas
> por el árbitro, y la de utilización (comandero) YA EXISTE y funciona.

## Auditoría contra el método (qué ya estaba y qué faltaba)

| Pieza del método | Estado en pasadas 1-3 | Acción en esta pasada |
|---|---|---|
| SUJETO correcto (la cara del jefe) | ⚠️ las pasadas prisaron la INTERFAZ entera (vía operativa + vía consulta mezcladas) | **separadas por el árbitro aquí abajo** |
| RESTRICCIONES con custodios | ✅ pasada-2 restricciones (guardas, grafo de estados) | confirmada + custodios nombrados |
| CONTRATO con señal pareada | ⚠️ `estadosVivos` y `refresh_on` genéricos, sin parear hoja a hoja | **pareada hoja a hoja (verificada contra index.js v3.5.0)** |
| Formas UI canónicas | ⚠️ nombres libres ("acciones contextuales", "barra de estado") | **mapeadas a los nombres canónicos** |
| Composición seleccionar→informarse→declarar | ❌ implícita (vía consulta / vía operativa) | **expuesta como composición 3 capas** |
| Veredicto del árbitro por op (13) | ❌ sin veredicto por op | **tabla completa 13/13** (ya clasificado con árbitro v1; revisado aquí) |
| Huecos [ABIERTO] | ✅ 6 preguntas abiertas en pasadas previas | se mantienen + 2 nuevos |

## Las 5 preguntas-jefe, verdicto final

1. **IDENTIDAD** — el jefe NO compone el pedido (eso pasa en el comandero, capa
   utilización): el jefe DECIDE las TRANSICIONES del ciclo de vida del pedido ya
   creado: abrirlo formalmente (`create`), enviarlo a cocina (`send-kitchen`),
   completarlo (`complete`), cancelarlo (`cancel`), confirmar su recogida
   (`confirmar-recogida`). El panel-jefe de pedidos es una **ESTACIÓN DE
   TRANSICIONES**, no un editor de contenido.
2. **RESTRICCIONES** — el custodio del pedidos POS es el COMANDERO/CUENTAS: los
   items se añaden al ELEGIR (add/update/delete-item vía comandero), y el pedido
   nace a menudo del bridge `comandero.enviar_cocina` (ya nace en_cocina con items).
   Pedidos en sí es custodio del ESTADO del pedido (in-memory + restauración) y
   sus guardas son reales: `send-kitchen` rechaza pedido vacío (400) y ya-en-cocina
   (409 CONFLICT_STATE); `confirmar-recogida` exige `pendiente_recogida`, caduca
   on-read por `expira_at` y publica 409 con estado. El juez del ciclo de vida es
   el MÓDULO, no la UI. `caja.cerrada`/`dia.iniciado` limpian los pedidos POS.
3. **CONTRATO** — VER: `pedido.list` (filtros cuenta_id/estado, orden desc por
   created_at, respuesta `{pedidos[], total}`) + `pedido.get` (pedido completo con
   items) + `pedido.total` (subtotal/total/items_count) + `pedido.health` (pulso
   con contadores por estado). SEÑALES de confirmación (verificadas en index.js):
   cada op de transición emite la suya — ver tabla abajo. El refresco parea
  [list→señal]: la vista re-lee, NUNCA recarga.
4. **NO-OBJETIVOS** — la UTILIZACIÓN (comandero: tomar pedido al elegir, add/
   update/delete-item con variaciones) YA EXISTE y es SACRA: fuera del panel-jefe.
   `crear-tienda` llega por tool auto-wire/store PWA, no es captura del jefe.
   El sistema (health) informa, no decide.
5. **PREGUNTAS_ABIERTAS** — ver [ABIERTO] abajo; se nombran, no se cierran.

## Veredicto del ÁRBITRO (lente-roles) — 13/13 ops

Pregunta árbitro: ¿decide el FUTURO de la operación (transiciona el ciclo de vida
del pedido) → JEFE · ¿sirve una decisión AHORA de servicio al elegir → UTILIZACIÓN
(POS/comandero, fuera) · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `create` | **JEFE** | Abre el pedido formal (borrador) atado a una cuenta — la decisión de ARRANCAR la operación. |
| `send-kitchen` | **JEFE** | Transición borrador/creado → en_cocina. Guarda real: pedido vacío (400), ya en cocina (409). |
| `complete` | **JEFE** | Transición en_cocina → completado. Cierra el ciclo POS. |
| `cancel` | **JEFE** | Transición terminal (destructiva, con motivo) → cancelado. |
| `confirmar-recogida` | **JEFE** | Cierre de la cara TIENDA: pendiente_recogida → recogido_y_cobrado (efectivo). Desambigua por nombre (409 si hay varios) y caduca on-read. |
| `add-item` | utilizacion | El POS (comandero) añade al ELEGIR. Ya vive en components/comandero — FUERA del panel-jefe. |
| `update-item` | utilizacion | idem. |
| `delete-item` | utilizacion | idem. |
| `crear-tienda` | utilizacion | Puerto de la PWA/bot (tool auto-wire). El jefe NO captura pedidos tienda, los CONFIRMA (recogida). |
| `list` | neutro | alimenta la cinta-estado y el ref-select de pedidos |
| `get` | neutro | detalle (items, totales) que alimenta el gesto |
| `total` | neutro | recálculo de subtotal/total (alimenta el confirmador de transición) |
| `health` | neutro (sistema) | estado del módulo — fuera del flujo |

**La dualidad, en una línea**: el pedido NACE de utilización (comandero al elegir,
o PWA tienda) y VIVE en el comandero mientras se compone; el panel-jefe SOLO
transiciona estados de pedidos ya creados — jamás edita items (invariante).

## Composición de la vista del jefe (3 capas) — ESTACIÓN DE TRANSICIONES

```
1. SELECCIONAR  — ref de pedidos activos: pedido.list por estado (abierto=borrador+creado,
                  cocina=en_cocina, recogida=pendiente_recogida) · la cinta ES el selector
                  natural: tocar la tarjeta del pedido activo
2. INFORMARSE   — list/{estado} (pedidos por fase) + get (detalle en tarjeta: items count,
                  total, canal, cliente/mesa) + total para el confirmador · cinta-estado
                  "n abiertos · n en cocina · n completados hoy"
3. DECLARAR     — las ÚNICAS escrituras del jefe: TRANSICIONES nombradas según el estado
                  actual del pedido (ver mapa abajo), vía pedido.send-kitchen/complete/
                  cancel/confirmar-recogida · la señal pareada re-lee, nunca recarga
```

### Frecuencia → jerarquía

- El gesto rey es la TRANSICIÓN de la fase activa (en vista, 1 toque).
- `cancel` es gruesa y destructiva → `confirmador-nombrado` (cuenta/canal + total).
- El detalle de items NO se edita aquí (invariante: vive en el comandero).

## Formas UI canónicas (mapeo de la disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Ref de pedidos activos (capa 1) | `ref-select`/cinta | `pedido.list` con `estado` — tarjetas por fase; el ref-select clásico queda EXPUESTO en la cinta |
| Cinta de fases (Órgano "barra de estado") | `cinta-estado` | "n abiertos · n en cocina · n completados hoy" (list + health) |
| Botones de transición en tarjeta | `inline-gesture` | 1 toque según estado actual (ver mapa); señal de cargo/impacto óptico antes del dictamen |
| Cancelar | `confirmador-nombrado` | nombra cuenta/canal + total + motivo opcional; default recomendado: NO cancelar |
| Detalle en tarjeta | `cinta-estado`/informe | get: nº items, total, canal, ref_display, cliente_nombre (tienda) |
| TODAS las de declaración | `señal-refresh` | **pareadas** (tabla abajo) |

## Señales pareadas por hoja de declaración (verificadas en index.js v3.5.0)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo
(también corregidos vs. lo que decían las pasadas previas):

```
create              → pedido.creado            ✅ (handleCreatePedido → _publishPedidoCreado)
send-kitchen        → pedido.enviado_cocina    ✅ (handleEnviarCocina)
complete            → pedido.completado        ✅ (handleCompletarPedido, lleva duracion_minutos)
cancel              → pedido.cancelado         ✅ (handleCancelarPedido, lleva motivo)
confirmar-recogida  → pedido.recogido          ✅ (handleConfirmarRecogida; SI tiendera: pedido.expirado on-read)
añadir item         → pedido.item_agregado     ✅ (utilización, fuera del panel)
actualizar item     → pedido.item_actualizado  ✅ (idem)
eliminar item       → pedido.item_eliminado    ✅ (idem)
pago online tienda  → pedido.pagado            ✅ (onPagoConfirmado — NO está en events.publishes del manifest)
```

CORRECCIONES de las pasadas previas (consumían nombres que NO existen):
- `cuenta.cerrada` NO EXISTE: nadie la publica. El cierre visible del negocio es
  `caja.cerrada` (que limpia pedidos POS) o `cuenta.estado_cambiado` (cuentas).
- `pedido.confirmado` NO EXISTE (pregunta "confirmar pedido" de la pasada-2
  interfaz-pedidos-v2): la ruta real es el bridge `comandero.enviar_cocina` →
  el pedido nace `en_cocina` YA ENVIADO (publica pedido.creado + pedido.enviado_cocina).
  No hay fase "confirmado" intermedia con señal propia.

## Huecos (los de captura + los del sistema, sin cerrar)

1. **Estación de transiciones** — panel-jefe: cinta de fases + tarjetas activas
   con gestos de transición (forma del F7)
2. **Confirmador de cancelación** — `confirmador-nombrado` (cuenta + total + motivo)
3. **Cinta de pulso** — `cinta-estado` vía list por estado + total

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **Notificación de listo / recogida POS** — pedidos POS termina en `complete`;
  el aviso "listo para recoger" para take-away hoy vive en cuentas (marcar_listo/
  entregar). Unificarlo es decisión de dueño sobre el grafo de estados.
- (b) **Señales granulares no declaradas** — `pedido.recogido/pagado/expirado`
  se publican pero NO están en `events.publishes` del module.json (contracto
  incompleto). Declararlos es sub-contrato de eventos, no de esta cara.
- (c) **Transientidad** — pedidos POS viven solo hasta `caja.cerrada`/
  `dia.iniciado`; "completados hoy" muere al cerrar caja. Histórico real (disco)
  es decisión de dueño (persistencia-comandero), no de esta cara.

## Cables hacia el blueprint (agente crear-blueprint-jefe)

- `ui.roles` = veredicto del árbitro arriba (13 claves: 5 jefe, 4 utilizacion, 4 neutro)
- `ui.flujo` jefe-PRIMERO: [jefe: create, send-kitchen, complete, cancel,
  confirmar-recogida] → [utilizacion: add-item, update-item, delete-item,
  crear-tienda] → [consulta: list, get, total, health]
- NOTA de contrato de args (crítica para la UI): las ops de transición
  (`send-kitchen/complete/cancel/total`) reciben **`id`** (NO `pedido_id`),
  `create` recibe **`cuenta_id`** y `confirmar-recogida` recibe
  **`cliente_nombre`|`pedido_id`**. El blueprint de 13 ops ya estaba correcto.
- ref de selects de pedido: `pedido.list` (ref_label id, ref_value id)
- señales de refresco del panel: pedido.{creado,enviado_cocina,completado,
  cancelado} + pedido.{item_agregado,item_actualizado,item_eliminado} (los items
  cambian desde el comandero y la cinta debe latir) + pago.confirmado