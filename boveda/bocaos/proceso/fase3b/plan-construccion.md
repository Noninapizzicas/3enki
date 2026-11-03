# PLAN DE CONSTRUCCIÓN — Vertical **BOCAOS** · tercera versión
### Fase 3b · el adaptador · `fase3b/plan-construccion.md`
### Bocaos es SOLO el mercado. La tienda ya está hecha: es pizzepos.

> **Qué es este documento.** El puente entre el diseño puro del negocio (`fase3/esquemas/diseno-oop.md`,
> 144 clases en tres unidades) y el sistema Enki REAL. Traduce cada clase a un módulo-isla event-driven y,
> lo que es nuevo en esta versión, **decide por hoja si hay que construirla o si ya existe en
> `modules/`, mirando el `module.json` de verdad**.
>
> **Fuentes leídas para escribirlo** (ninguna de memoria):
> 1. `boveda/bocaos/proceso/fase3/esquemas/diseno-oop.md` — 3.283 líneas, 145 clases contadas (144 + `R26`
>    condicionada), §7.1 el enlace, §9 los seis hechos que cruzan, §14 los once peldaños. **No se toca.**
> 2. `boveda/bocaos/proceso/fase2/esquemas/esquema.md` — las piezas y su forma (sonda · banco · reflejo ·
>    conversor · puente · reloj · interfaz), los puertos p1…p6.
> 3. **El inventario vivo**: `find /home/admin/3enki/modules -name module.json` → **388 manifiestos**.
>    De ellos, **30 son la vertical `pizzepos`** (`modules/pizzepos/*/module.json`), leídos uno por uno.
>    Se citan por ruta exacta en el §3.
> 4. La orden del dueño, literal: «Bocaos se tiene que apoyar en lo que hay hecho ya. Te da una plataforma
>    de trabajo pizzepos con todo hecho ya: sistema de pago, el cobro, cuenta, cocina, impresora» · «Solo
>    eventos, eventos y eventos».
>
> **Qué cambia respecto a la v2** (§10, hoja por hoja): la v2 mandó construir **15 hojas de tienda**
> (`tienda-marca`, `tienda-carta`, `tienda-carrito`, `tienda-captura`, `tienda-hora-listo`,
> `tienda-cocina-visible`, `tienda-precio`, `tienda-cliente`, `tienda-radio`, `tienda-incentivo`,
> `tienda-aviso-cliente`, `tienda-puntualidad`, `tienda-panel`, `tienda-reclamacion`, `tienda-resumen`).
> **Trece de esas quince ya existen en pizzepos** y Bocaos no las construye: se engancha a sus eventos.
> Esta versión lo corrige con las rutas delante.


## 0 · El hallazgo de esta versión (leer antes que nada)

La v2 se escribió **sin abrir `modules/pizzepos/`**. El resultado fue un plano impecable y una tienda
paralela: un `pedido` propio, una `tienda-captura` propia, una `tienda-hora-listo` propia… mientras
pizzepos ya tenía el pedido, la cuenta, la cocina, el cobro, el ticket y la impresora funcionando.

```text
LO QUE LA v2 CONSTRUÍA           LO QUE HAY, EN DISCO, HOY
tienda-captura            →      pizzepos/tienda-api v1.2.0  (POST /tienda/pedido/:project)
                                 + pizzepos/pedidos v3.6.0    (tipo='tienda', cuenta operativa,
                                                               envío a cocina, pedido.creado)
tienda-hora-listo         →      pizzepos/cocina v3.5.0       (cocina.mark-ready → cocina.pedido_listo)
tienda-cocina-visible     →      pizzepos/cocina + whatsapp-bot v1.5.0
tienda-marca              →      pizzepos/carta-marketing v2.6.0
tienda-carta              →      pizzepos/carta-digital v2.25.1 + carta-manager v2.10.0
tienda-precio             →      pizzepos/tarifas v3.2.0
tienda-carrito            →      pizzepos/carta-digital (carrito en la PWA, localStorage)
tienda-cliente            →      pizzepos/pedidos (nombre + teléfono por pedido, aislado por proyecto)
tienda-aviso-cliente      →      whatsapp-bot (tools whatsapp.enviar*) + telegram-service
tienda-panel / resumen    →      SIGUE SIENDO DE BOCAOS (es la medida del mercado, no la tienda)
tienda-incentivo          →      SIGUE SIENDO DE LA PLAZA (tarifa-pedido: un solo escritor del precio)
tienda-radio              →      SIGUE SIENDO DE LA PLAZA (censo-parte: lo que la tienda declara)
tienda-reclamacion        →      aviso-tienda (la queja se DEVUELVE a la tienda)
```

**La regla que sale de esto, y que ordena todo el resto del documento:**

> Lo que la tienda **HACE** (carta, carrito, precio, cocina, cobro, ticket) ya está hecho y se **engancha
> por evento**. Lo que la tienda **DECLARA al mercado** (zona, incentivo, hora de listo) entra por el
> puerto de la plaza y lo guarda un custodio de la plaza. Lo que Bocaos **DECIDE** (enlace, propuesta,
> ruta, contrato, hechos, acta, liquidación, censo, términos, config) no existe en ningún sitio y se
> construye.

Esto no es una concesión: es la estructura del diseño. El §1.2 del `diseno-oop.md` dice que la tienda
«ACTÚA» y la plaza «DECIDE». Si la tienda actúa con pizzepos, entonces **pizzepos es el brazo de la
tienda** y Bocaos no necesita un brazo propio. La prueba está en el §7.2 del diseño: `CartaPública`,
`CarritoTienda`, `PrecioCerrado`, `CapturaPedido`, `HoraDeListo` — cinco pasos de cinco, ya existen.


## 1 · La frontera, con las rutas delante

### 1.1 · Las 16 clases de la tienda y dónde viven HOY

Ninguna de las 16 se queda sin casa, y **ninguna se construye en Bocaos**. Ésta es la tabla que la v2 no
tenía:

| clase | qué es | dónde vive hoy (ruta real · versión) | ¿se toca? |
|---|---|---|---|
| `C01` `CapturaPedido` | alta de un pedido, de a uno, con precio cerrado | `modules/pizzepos/tienda-api` v1.2.0 + `modules/pizzepos/pedidos` v3.6.0 | **sí**: `entrega{direccion, oferta}` |
| `C04` `HoraDeListo` | la tienda declara «listo», con autor | `modules/pizzepos/cocina` v3.5.0 (`cocina.mark-ready`) | no |
| `C05` `EstadoCocinaVisible` | estado podado para el cliente | `modules/pizzepos/cocina` (staff) + `bocaos/aviso-cliente` (podado) | no (Bocaos compone el podado) |
| `C06` `AvisoCliente` | aviso al cliente, sin marca de Bocaos | `modules/whatsapp-bot` v1.5.0 (tools) + `modules/telegram-service` v3.1.0 | no (transporte) |
| `D01` `MarcaTienda` | nombre, signos, tono, titular | `modules/pizzepos/carta-marketing` v2.6.0 | no |
| `D02` `CartaPública` | proyección podada de la carta | `modules/pizzepos/carta-digital` v2.25.1 | no |
| `D03` `PrecioCerrado` | el precio de la comida por canal | `modules/pizzepos/tarifas` v3.2.0 | no |
| `D04` `CarritoTienda` | el carrito de ESE cliente en ESA tienda | `modules/pizzepos/carta-digital` (PWA, `static-template.js`, localStorage) | no |
| `D05` `RegistroClienteTienda` | el cliente es de la tienda | `modules/pizzepos/pedidos` (nombre + teléfono por pedido) | no |
| `D06` `RadioDeTienda` | la zona que la tienda declara | **no existe en ningún módulo** → lo guarda `censo-parte` (plaza) | **se construye la guarda** |
| `E02` `IncentivoTienda` | la tienda sube céntimos al pedido | **no existe** → lo escribe `tarifa-pedido` (plaza, con autor) | **se construye el escritor** |
| `K01` `ReclamaciónPorLaTienda` | la queja se devuelve a la tienda | `bocaos/aviso-tienda` (puente a `telegram-service`) | **se construye** |
| `L01` `PanelTienda` | lo que la tienda ve del mercado | `bocaos/panel-tienda` (proyección de la plaza) | **se construye** |
| `L02` `GuardaPropiedadCliente` | ningún cliente cruza de tienda | `bocaos/indice-plaza` (guarda) | **se construye** |
| `L03` `PuntualidadDeclarada` | distribución de hora-de-listo | `bocaos/medida-cocina` (proyección sobre hechos de la plaza) | **se construye** |
| `L04` `ResumenParaLaTienda` | párrafo con números ya medidos | `bocaos/resumen-tienda` (agente) | **se construye** |

**16 de 16 con casa. 0 módulos nuevos de tienda salvo los cinco que son del MERCADO mirando a la tienda**
(`aviso-cliente`, `panel-tienda`, `medida-cocina`, `resumen-tienda`, `aviso-tienda`). Y esos cinco no
tocan la tienda: la leen.

### 1.2 · El mapa de enganche: los cuatro eventos de pizzepos y los dos canales de vuelta

```text
LA TIENDA (pizzepos)                              BOCAOS (el mercado)
─────────────────────────────────────────────────────────────────────────────
PWA → POST /tienda/pedido/:project
      tienda-api ──▶ pedido.crear-tienda ──▶ pedidos
                                              │ crea pedido tipo='tienda'
                                              │ crea CUENTA operativa (cuentas)
                                              │ manda a COCINA (comandero.enviar_cocina)
                                              ▼
                              pedido.creado ─────────────▶ pedido-mercado (C02/C07)
                              (+ entrega{direccion,           tarifa-pedido (congela E01)
                                oferta_centimos} ★)           pedido.creado de bocaos
                                              │
cocina.mark-ready (lo pulsa una persona)      │
      ▼                                       │
 cocina.pedido_listo ────────────────────────▶ entrada-listo (puente)
  (con hora, cuenta_id, project_id)            │ compone AvisoPedidoListo
                                              ▼
                                        hecho-listo (A01) ──▶ bocaos.pedido_listo
                                              ▼
                                        enlace (A05…A35) ──▶ propuesta ──▶ canal-rider ──▶ rider
                                                                  ▼
                                                            contrato-puntual (A24)
                                                                  ▼
                                        hechos-reparto (F01…F03) ──▶ liquidacion (H01…H06)
                                                                  ▼
                                        cobro-gestion ──▶ pago-gateway (pago.iniciar)
                                                                    ▼
                                                            pago.confirmado
                                              │
      ◀───────────────────────────────────────┘
 bocaos.pedido_aceptado / contrato_creado / hecho_reparto_anotado
      ▼
 aviso-cliente ──▶ whatsapp.enviar (canal DE LA TIENDA, K02)
 aviso-tienda  ──▶ telegram.send_message.request (canal de la TIENDA)
```

★ = lo único que se le añade a pizzepos (§3.2).

**Los cuatro eventos de pizzepos que Bocaos consume, y ninguno más:**

| evento real | quién lo emite | qué hace Bocaos con él |
|---|---|---|
| `pedido.creado` | `pizzepos/pedidos` v3.6.0 | nace `pedido-mercado` (mismo `pedido_id`) y se **congela** la oferta del cliente |
| `pedido.cancelado` | `pizzepos/pedidos` v3.6.0 | transición `cancelado` en `pedido-mercado` (nadie cobra a nadie) |
| `cocina.pedido_listo` | `pizzepos/cocina` v3.5.0 | **el disparador del mercado**: `entrada-listo` compone el hecho y `hecho-listo` lo guarda |
| `pedido.pagado` | `pizzepos/pedidos` v3.6.0 | constancia para `aviso-cliente` (el cliente ya pagó la comida; la plaza NO lo toca, H06) |

**Lo que Bocaos NO toca**: `cuenta.*`, `cobro.*` (los del POS), `comandero.*`, `impresion.*`,
`tienda.pedido.*` (auditoría del canal), `catalogo.*`, `tarifas.config.actualizada`. Son de la tienda.
Los nombres `pedido.*`, `cocina.*`, `cuenta.*`, `cobro.*` y `tienda.*` son **espacio de nombres de
pizzepos**: Bocaos no publica nada dentro de ellos (por eso el pedido del mercado se llama
`pedido-mercado` y no `pedido`).

### 1.3 · El único hueco real de la tienda: el domicilio

`pizzepos/tienda-api` valida `modo_consumo ∈ {mesa, recoger, llevar}` y su body no tiene dirección.
`pizzepos/pedidos` crea el pedido `tipo='tienda'` con `estado:'pendiente_recogida'` y **`_publishPedidoCreado`
excluye el teléfono a propósito** (anti-fraude/RGPD). Es decir: **la plataforma de tienda que hay es de
recogida, no de reparto**. Y Bocaos *es* reparto.

Por eso hay exactamente **dos ADAPTAR** en la tienda, las dos aditivas y las dos con el mismo nombre:
`entrega { direccion, oferta_centimos, instrucciones? }`.

```text
POR QUÉ NO SE CONSTRUYE UN PEDIDO DE BOCAOS EN VEZ DE ADAPTAR
  · el pedido ya existe, con cuenta operativa, cocina, ticket, cobro y cobro en barra: reconstruirlo son
    1.617 líneas de pedidos + 489 de tienda-api + las 1.317 de cocina, y dos verdades del mismo pedido
  · lo único que falta son DOS campos y un valor de enum: eso es una adaptación, no un módulo
  · y si mañana la tienda no corre pizzepos, el puerto sigue siendo el mismo: `pedido.creado` con
    `entrega` dentro. La adaptación es la implementación del puerto, no el puerto.
```


## 2 · Las reglas de traducción de esta versión

| # | Regla | Consecuencia práctica |
|---|---|---|
| 1 | **Si ya existe y hace el trabajo, se ENGANCHA.** | REUTILIZAR (5) o ADAPTAR (3) con la ruta delante. Ninguna hoja se justifica por «quedar más limpio». |
| 2 | **Una clase que sólo calcula es una proyección interna**, no un módulo. | `A05…A12`, `A20…A23`, `A25`, `A28`, `A30…A35` viven dentro de `enlace` como `_op`. |
| 3 | **Una clase que escribe es un custodio, y uno solo por hecho.** | `hecho-listo` (A01), `propuesta` (A13/A14/A15/A19), `tarifa-pedido` (E01/E02/E03/E07), `censo-parte` (I01/I02/D06). |
| 4 | **La tienda no se reconstruye: se lee.** | Los cinco módulos de Bocaos que miran a la tienda son `reflejo` o `puente` y **nunca escriben** en ella. |
| 5 | **Dependencia = EVENTO.** Cero `require` entre módulos. | Todo lo que un módulo necesita de otro lo pide al bus; el dato viaja en el evento. |
| 6 | **Tópicos en ASCII**, sin tildes ni ñ. | `bocaos.pedido_creado`, `bocaos.hueco_nombrado`, `bocaos.propuesta_caducada_sin_respuesta`. |
| 7 | **Todo flujo cierra su círculo** con el par honesto. | `.response` siempre; `.failed` cuando la guarda dice que no; `bocaos.hueco_nombrado` cuando falta un dato. Nadie da por hecho un envío sin `ok:true`. |
| 8 | **El espacio de nombres ajeno no se pisa.** | `pedido.*`, `cocina.*`, `cuenta.*`, `cobro.*`, `tienda.*` son de pizzepos. |
| 9 | **Si falta el dato, se nombra; no se estima.** | `A34` es una clase, no una nota al pie: `bocaos.hueco_nombrado` con el dato que falta. |


## 3 · Inventario real: REUTILIZAR · ADAPTAR · CONSTRUIR

> **64 hojas: 56 CONSTRUIR · 3 ADAPTAR · 5 REUTILIZAR.** Cada decisión se tomó leyendo el `module.json` real del candidato (`events.publishes` / `events.subscribes`, y el `index.js` cuando el manifest prometía más que el contrato).

### 3.1 · REUTILIZAR (5 hojas) — la tienda que ya está hecha

| hoja | módulo real (ruta · versión) | contrato REAL verificado | qué aporta a Bocaos |
|---|---|---|---|
| `tarifas` | `modules/pizzepos/tarifas` · v3.2.0 | publica `tarifas.config.actualizada` (estado completo: general, canales, variantes) · escucha `tarifas.config.solicitada` | el precio de la comida por canal (D03) |
| `carta-digital` | `modules/pizzepos/carta-digital` · v2.25.1 | `ui_handlers`: `get_carta_publica`, `get_config`, `update_config`, `get_diseno`, `preview`, `publicar`; la PWA (`static-template.js`) lleva el carrito en `localStorage` y hace POST a `tienda-api` | la carta pública (D02) y el carrito del cliente (D04) |
| `carta-marketing` | `modules/pizzepos/carta-marketing` · v2.6.0 | `carta-marketing.get_perfil.request` / `.update_perfil.request` / `.validar.request` / `.guardar_copy.request`, con validación AJV (`marca.schema.json`) | la marca de la tienda (D01) |
| `cocina` | `modules/pizzepos/cocina` · v3.5.0 | escucha `pedido.enviado_cocina` · tool `cocina.mark-ready` («marca el pedido completo como listo. Emite `cocina.pedido_listo`») · publica `cocina.item_*`, `cocina.pedido_listo`, `periferico.display` | **la hora de listo** (C04): el disparador de todo el mercado |
| `scheduler` | `modules/scheduler` · v1.0.0 | publica `scheduler.job.triggered` / `.completed` / `.failed`; acepta cron, interval, datetime y evento | el ciclo semanal de `liquidacion` y el latido de `publicacion` |

**Infraestructura declarada** (no son hojas, no tienen clase en el diseño):
`_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`,
`credential-manager`, `metricas`. Van en el `reutiliza` de cada hoja que las usa.

### 3.2 · ADAPTAR (3 hojas) — lo único que a pizzepos le falta para un mercado de reparto

| hoja | módulo real (ruta · versión) | qué se AÑADE (aditivo, sin tocar lo que ya hace) | cómo se comprueba que no rompe |
|---|---|---|---|
| `tienda-api` | `modules/pizzepos/tienda-api` · v1.2.0 | en `_validatePedidoBody`: bloque opcional `entrega{direccion, oferta_centimos, instrucciones?}`; `modo_consumo` admite `domicilio` | POST **sin** `entrega` → 201 idéntico al de hoy (pickup, mesa, llevar). POST **con** `entrega` incompleto → 400 con el campo que falta |
| `pedidos` | `modules/pizzepos/pedidos` · v3.6.0 | guarda `entrega` en el pedido `tipo='tienda'` y la publica DENTRO de `pedido.creado`; `estado` sigue naciendo `pendiente_recogida` | un pedido de recogida publica exactamente el mismo `pedido.creado` de hoy (el bloque sólo aparece si existe). El teléfono SIGUE sin viajar en el evento |
| `cobro-gestion` | `modules/pago-gateway` · v3.1.0 | op nueva `pago.revertir` (`transfer_reversal` sobre la cuenta conectada, Q29) + etiqueta de canal por parte | las 28 peticiones y 40 hechos actuales (`pago.iniciar`, `pago.cobrar_guardada`, `pago.reader.*`, `pago.confirmado`, `pago.reembolsado`, `pago.importe_discrepante`) quedan intactos |

**Ninguna de las tres cambia un comportamiento existente.** Las tres añaden un campo o una op; si el
campo no llega, el módulo se comporta exactamente como hoy. Eso es lo que hace que se puedan tocar sin
pedir permiso al vertical dueño.

### 3.3 · CONSTRUIR (56) y los «se acerca pero…» que se descartaron

Se construye **sólo el mercado**: lo que decide y lo que guarda el hecho del reparto. Cada
CONSTRUIR de este plano tiene detrás un candidato real que se miró y se descartó; la lista de los que más
se acercaban:

| candidato real | por qué NO se reutiliza / adapta |
|---|---|
| `pizzepos/pedidos` v3.6.0 | **sí se reutiliza** para el pedido de la tienda. NO para el del mercado: al pedido del mercado le faltan las tres cosas que `pedidos` no tiene (aceptación de la tienda como transición con hecho, tabla cerrada de estados del reparto, cancelación con quién y hasta cuándo). Por eso `pedido-mercado` **no guarda líneas, ni comida, ni pago**: sólo el reparto, con el `pedido_id` de pizzepos como clave |
| `pizzepos/impresion` v4.0.0 | imprime ESC/POS por MQTT a ESP32 (`cocina.item_ticket`, `impresion.ticket_venta_generado`). Bocaos **no imprime nada**: el ticket es de la tienda |
| `pizzepos/reporte-cierre` v1.0.0 | manda el cierre de CAJA de la tienda al dueño por Telegram/email. No es la liquidación de la plaza (que cobra una cuota por tramos, H01–H06). Se toma su transporte (`telegram.send_message.request`), no su hoja |
| `pizzepos/cuentas-canales` v5.1.0 | canales mesa/teléfono/llevar/glovo/llevadoo/whatsapp del POS. El mercado no es un canal de la tienda: es otro negocio encima |
| `pizzepos/comandero` v3.6.1 · `prisma/carrito` v0.2.0 | buffers de venta por `cuenta_id`. El carrito del cliente final (D04) vive en la PWA: un carrito servidor sería un segundo carrito |
| `pizzepos/notificador-pedidos` v2.0.0 | avisa al staff sólo en `pedido.creado`; no sabe de contratos ni de huecos. Se usa su transporte |
| `whatsapp-bot` v1.5.0 | **sí se reutiliza como transporte** (tools `whatsapp.enviar*`, par `whatsapp.mensaje.enviado` / `whatsapp.envio.fallido`). NO como hoja: su aviso de `cocina.pedido_listo` dice «pasa a recogerlo» y sólo conoce pedidos que él vio nacer |
| `telegram-bridge` v1.0.3 | **NO se adapta**: su `_doc` dice que `telegram.callback.received` «se ignora con log» porque no son mensajes conversacionales. El sí/no del rider nunca llegaría por ahí. Se usa `telegram-service` v3.1.0, que sí publica `telegram.callback.received` |
| `telegram-service` v3.1.0 | **sí**, como transporte de `aviso-tienda`, `aviso-cliente`→`aviso-cliente`, `canal-rider`, `aviso-sala`, `disputa-fallo` |
| `prisma/escaparate` v0.2.0 | «escaparate público de Prisma, gemelo generalizado de `carta-digital`». Se descarta por coherencia de pila: la PWA que habla con `tienda-api` es la de `carta-digital`; dos escaparates serían dos cartas. **Y por otra razón que sólo se ve mirando el inventario: su NOMBRE ya está tomado.** El índice de la plaza de Bocaos se llama `indice-plaza`, no `escaparate` |
| `estados` v0.4.0 | lista genérica con orden libre/estricto. `C02` es una tabla CERRADA donde ninguna transición existe sin hecho con hora: se toma el patrón, no el módulo |
| `cola` v0.1.0 · `historial` v0.1.0 | cola de impresión 3D e historial de impresiones. Mismo patrón que `cola-sala` y `hechos-reparto`, **otro dominio**: adaptarlos rompería su proyecto |
| `interfaz` v0.1.0 · `portal` · `dashboard` · `panel-jefe` · `panel-trabajador` | superficies de otros verticales (radar de nichos, MCP, taller 3D). `cola-sala`, `panel-tienda` y `salud-mercado` son otra cosa |
| `chat-p2p` v1.0.0 | chat agentes↔agentes. `chat-enmascarado` (F04) es rider↔cliente con alias por contrato y **cero** agregados sobre conversaciones |
| `apis-publicas` · `cantera-semantica` | índices que **rankean por relevancia**: exactamente lo que R11 prohíbe en el buscador nacional |
| `entrega` v0.1.0 · `agenda-operacion` | vertical `the-pirate`: estima tiempos y guarda su radio de reparto propio. Aquí no hay rider, ni contrato vivo, ni promesa |
| `contabilidad-fiscal/factura-electronica` | series y formatos españoles con sujeto «proyecto contable». **Proveedor del puerto Documento** de `factura-gestion`, no la hoja |
| `metricas` v2.0.0 | instrumentación pasiva del bus. `salud-mercado` mide el NEGOCIO. `metricas` entra como base de observabilidad |
| `entrega`, `project-profile`, `calendario`, `lotes`, `inventario`, `catalogo` | otros dominios (perfil de proyecto, calendario fiscal, lotes, stock, biblioteca 3D). Ninguno tiene el eje de Bocaos |

**Los 14 del nacional** (`fed-*`) se construyen porque **no existe nada de federación en Enki**: ningún
módulo de `modules/` mantiene un padrón de instalaciones, un buzón de hechos publicados, licencias de
marca B2B ni un canon por plaza. Y sólo se despliegan a partir de la segunda plaza (§14 de la F3).


## 4 · La ley de la unidad: las 145 clases, una por una

> **145 / 145.** 145 clases asignadas a **una** hoja y a **una** unidad, sin una sola
> huérfana y sin una sola duplicada. `K03` (`TransparenciaDelEnlace`) y `M06` siguen **sin clase**
> por decisión del diseño (no se sabe si existen; Q15/Q20). `R26` (`CanonDePlaza`) existe como clase
> y **no se despliega** hasta la segunda plaza. Los tres contenedores (`Nacional`, `Plaza`,
> `ProyectoDeTienda`) no son clases.

> **Lo que cambia respecto a la v2 no es la asignación: es la ACCIÓN de cada hoja.** En la columna
> «hoja» se ve a dónde va cada clase; en el §8 se ve si esa hoja se construye, se adapta o ya existe.

### Grupo A · propuesta-enlace (35) — 35 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `A01` | HechoPedidoListo | CUSTODIO · P | `hecho-listo` |
| `A02` | ComposiciónDeLaVista | REFLEJO · P | `foto-mercado` |
| `A03` | CongelaciónDeLaFoto | REFLEJO · P | `foto-mercado` |
| `A04` | CandidatosElegibles | REFLEJO · P | `foto-mercado` |
| `A05` | RutaBase | REFLEJO · P | `enlace` |
| `A06` | RutaConParada | REFLEJO · P | `enlace` |
| `A07` | MedidaDesvío | REFLEJO · P | `enlace` |
| `A08` | MedidaEspera | REFLEJO · P | `enlace` |
| `A09` | RetrasoPorParada | REFLEJO · P | `enlace` |
| `A10` | AgregadoDelRetraso | REFLEJO · P | `enlace` |
| `A11` | MedidaCobra | REFLEJO · P | `enlace` |
| `A12` | ReglaDeEnlace | REFLEJO · P | `enlace` |
| `A13` | PropuestaEmitida | CUSTODIO · P | `propuesta` |
| `A14` | BloqueoDePropuesta | CUSTODIO · P | `propuesta` |
| `A15` | VentanaDePropuesta | CUSTODIO · P | `propuesta` |
| `A16` | RazonesDeLaDecisión | REFLEJO · P | `enlace` |
| `A17` | FraseDerivada | REFLEJO · P | `enlace` |
| `A18` | RedacciónDeLaPropuesta | AGENTE · P | `redaccion-propuesta` |
| `A19` | AceptaciónLibre | CUSTODIO · P | `propuesta` |
| `A20` | HoraDeAceptación | REFLEJO · P | `enlace` |
| `A21` | RechazoSinCoste | REFLEJO · P | `enlace` |
| `A22` | GuardaSinPuntuación | REFLEJO · P | `enlace` |
| `A23` | CaducidadSinRespuesta | REFLEJO · P | `enlace` |
| `A24` | ContratoPuntual | CUSTODIO · P | `contrato-puntual` |
| `A25` | SiguienteCandidato | REFLEJO · P | `enlace` |
| `A26` | EscaladaDeEnlace | PUENTE · P | `escalada-enlace` |
| `A27` | GuardaSinAsignación | REFLEJO · P | `propuesta` |
| `A28` | GuardaSinOptimizador | REFLEJO · P | `enlace` |
| `A29` | ReproducciónDeLaDecisión | REFLEJO · P | `propuesta` |
| `A30` | GuardaEnlacePorTrayecto | REFLEJO · P | `enlace` |
| `A31` | GuardaEnlaceNoRompePromesa | REFLEJO · P | `enlace` |
| `A32` | GuardaNoCapturaDelAhorro | REFLEJO · P | `liquidacion` |
| `A33` | GuardaPropuestaÚnica | REFLEJO · P | `propuesta` |
| `A34` | HuecoDeMedida | REFLEJO · P | `enlace` |
| `A35` | GuardaEnlaceIntraPlaza | REFLEJO · P | `enlace` |

### Grupo B · ruta-viva (6) — 6 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `B01` | PosiciónRider | CUSTODIO · P | `ruta-viva` |
| `B02` | ParadasPendientes | REFLEJO · P | `ruta-viva` |
| `B03` | PromesaPorParada | CUSTODIO · P | `ruta-viva` |
| `B04` | OrdenDeParadas | REFLEJO · P | `ruta-viva` |
| `B05` | CapacidadDeclarada | CUSTODIO · P | `ruta-viva` |
| `B06` | FinDeTrayecto | REFLEJO · P | `ruta-viva` |

### Grupo C · pedido (7) — 7 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `C02` | EstadoPedido | CUSTODIO · P | `pedido-mercado` |
| `C03` | AvisoTienda | PUENTE · P | `aviso-tienda` |
| `C07` | Cancelación | REFLEJO · P | `pedido-mercado` |
| `C01` | CapturaPedido | REFLEJO · T | `tienda-api` |
| `C04` | HoraDeListo | CUSTODIO · T | `cocina` |
| `C05` | EstadoCocinaVisible | REFLEJO · T | `aviso-cliente` |
| `C06` | AvisoCliente | PUENTE · T | `aviso-cliente` |

### Grupo D · plaza-tienda (8) — 8 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `D07` | PlazaPública | REFLEJO · P | `indice-plaza` |
| `D08` | NeutralidadOrden | REFLEJO · P | `indice-plaza` |
| `D01` | MarcaTienda | CUSTODIO · T | `carta-marketing` |
| `D02` | CartaPública | CONVERSOR · T | `carta-digital` |
| `D03` | PrecioCerrado | REFLEJO · T | `tarifas` |
| `D04` | CarritoTienda | CUSTODIO · T | `carta-digital` |
| `D05` | RegistroClienteTienda | CUSTODIO · T | `pedidos` |
| `D06` | RadioDeTienda | CUSTODIO · T | `censo-parte` |

### Grupo E · tarifa-tres-bandas (7) — 7 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `E01` | OfertaCliente | CUSTODIO · P | `tarifa-pedido` |
| `E03` | PrecioReparto | REFLEJO · P | `tarifa-pedido` |
| `E04` | ComisiónDeCoordinación | REFLEJO · P | `liquidacion` |
| `E05` | RepartoDelPago | CONVERSOR · P | `liquidacion` |
| `E06` | ContratoTramos | CUSTODIO · P | `contrato-tramos` |
| `E07` | SubidaDeOferta | CUSTODIO · P | `tarifa-pedido` |
| `E02` | IncentivoTienda | CUSTODIO · T | `tarifa-pedido` |

### Grupo F · reparto-medido (7) — 7 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `F01` | HechosDelReparto | CUSTODIO · P | `hechos-reparto` |
| `F02` | PruebaEntrega | CUSTODIO · P | `hechos-reparto` |
| `F03` | SeguimientoVivo | REFLEJO · P | `hechos-reparto` |
| `F04` | ChatEnmascarado | PUENTE · P | `chat-enmascarado` |
| `F05` | InstruccionesAcceso | CUSTODIO · P | `instrucciones-acceso` |
| `F06` | IncidenciaReparto | PUENTE · P | `incidencia-reparto` |
| `F07` | LecturaDeIncidencia | AGENTE · P | `lectura-incidencia` |

### Grupo G · adjudicacion-fallos (6) — 6 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `G01` | VentanaEspera | CUSTODIO · P | `config-mercado` |
| `G02` | HechoVerificado | REFLEJO · P | `regla-fallo` |
| `G03` | ReglaPagoFallo | REFLEJO · P | `regla-fallo` |
| `G04` | CargoFallo | CUSTODIO · P | `cargo-fallo` |
| `G05` | DisputaFallo | PUENTE · P | `disputa-fallo` |
| `G06` | TrazabilidadFallo | REFLEJO · P | `regla-fallo` |

### Grupo H · liquidacion (6) — 6 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `H01` | Devengo | REFLEJO · P | `liquidacion` |
| `H02` | CicloSemanal | CUSTODIO · P | `liquidacion` |
| `H03` | FacturaGestión | CONVERSOR · P | `factura-gestion` |
| `H04` | CobroGestión | PUENTE · P | `cobro-gestion` |
| `H05` | ImpagoGestión | REFLEJO · P | `liquidacion` |
| `H06` | GuardaNoRetención | REFLEJO · P | `liquidacion` |

### Grupo I · sala-mercado (8) — 8 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `I01` | AltaTienda | CUSTODIO · P | `censo-parte` |
| `I02` | AltaRider | CUSTODIO · P | `censo-parte` |
| `I03` | EstadoTienda | CUSTODIO · P | `estado-parte` |
| `I04` | EstadoRider | CUSTODIO · P | `estado-parte` |
| `I05` | SaludMercado | REFLEJO · P | `salud-mercado` |
| `I06` | TableroFricciones | REFLEJO · P | `salud-mercado` |
| `I07` | AvisoSala | PUENTE · P | `aviso-sala` |
| `I08` | TérminosParte | CUSTODIO · P | `terminos-parte` |

### Grupo J · config (5) — 5 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `J01` | ConfigUmbrales | CUSTODIO · P | `config-mercado` |
| `J02` | ConfigVentana | CUSTODIO · P | `config-mercado` |
| `J03` | ConfigZona | CUSTODIO · P | `config-mercado` |
| `J04` | VersiónEfectiva | REFLEJO · P | `config-mercado` |
| `J05` | SimuladorDeUmbrales | REFLEJO · P | `config-mercado` |

### Grupo K · cliente-final (2) — 2 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `K02` | GuardaMarcaAjena | REFLEJO · P | `aviso-cliente` |
| `K01` | ReclamaciónPorLaTienda | PUENTE · T | `aviso-tienda` |

### Grupo L · restaurante (4) — 4 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `L01` | PanelTienda | REFLEJO · T | `panel-tienda` |
| `L02` | GuardaPropiedadCliente | REFLEJO · T | `indice-plaza` |
| `L03` | PuntualidadDeclarada | REFLEJO · T | `medida-cocina` |
| `L04` | ResumenParaLaTienda | AGENTE · T | `resumen-tienda` |

### Grupo M · repartidor (5) — 5 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `M01` | CarteraRider | REFLEJO · P | `cuenta-parte` |
| `M02` | ZonaRider | CUSTODIO · P | `censo-parte` |
| `M03` | GuardaSinExclusividad | REFLEJO · P | `censo-parte` |
| `M04` | CanalRider | PUENTE · P | `canal-rider` |
| `M05` | VistaDePropuesta | REFLEJO · P | `propuesta` |

### Grupo N · el-suelo (2) — 2 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `N01` | PolíticaDensidad | REFLEJO · P | `salud-mercado` |
| `N02` | SimuladorTramos | REFLEJO · P | `contrato-tramos` |

### Grupo O · rol-jefe (4) — 4 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `O01` | CuadroDelMercado | REFLEJO · P | `salud-mercado` |
| `O02` | ActaDeDecisiones | CUSTODIO · P | `acta-decisiones` |
| `O03` | ColaRevisiónHumana | CUSTODIO · P | `cola-sala` |
| `O04` | DictamenRevisión | CUSTODIO · P | `dictamen-revision` |

### Grupo P · rol-trabajador (4) — 4 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `P01` | ColaSala | CUSTODIO · P | `cola-sala` |
| `P02` | VistaParte | REFLEJO · P | `cola-sala` |
| `P03` | AcciónSanción | CUSTODIO · P | `accion-sancion` |
| `P04` | ChecklistAlta | REFLEJO · P | `censo-parte` |

### Grupo Q · rol-cliente (1) — 1 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `Q01` | EstadoCuentaParte | REFLEJO · P | `cuenta-parte` |

### Grupo S · frontera (2) — 2 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `S01` | FronteraDePlaza | REFLEJO · P | `frontera-plaza` |
| `S02` | FiltroPorCobertura | REFLEJO · P | `frontera-plaza` |

### Grupo R · federacion (25 (+1)) — 26 clases

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `R01` | RegistroDePlazas | CUSTODIO · N | `fed-padron` |
| `R02` | AltaDePlaza | CUSTODIO · N | `fed-padron` |
| `R03` | EstadoDePlaza | CUSTODIO · N | `fed-padron` |
| `R04` | SilencioDePlaza | REFLEJO · N | `fed-padron` |
| `R05` | CensoDeTiendas | CUSTODIO · N | `fed-censo` |
| `R06` | VersionDePlaza | CUSTODIO · N | `fed-versiones` |
| `R07` | PuestaEnMarchaDePlaza | PUENTE · N | `fed-puesta-en-marcha` |
| `R08` | VerificaciónDePuestaEnMarcha | REFLEJO · N | `fed-puesta-en-marcha` |
| `R09` | CompatibilidadDeVersión | REFLEJO · N | `fed-versiones` |
| `R10` | ÍndiceNacional | REFLEJO · N | `fed-buscador` |
| `R11` | BuscadorNacional | REFLEJO · N | `fed-buscador` |
| `R12` | ResultadoConSuPlaza | REFLEJO · N | `fed-buscador` |
| `R13` | EnrutadoAPlaza | PUENTE · N | `fed-enrutado` |
| `R14` | ConsolidaciónNacional | REFLEJO · N | `fed-consolidacion` |
| `R15` | CuadroDeLaFederación | REFLEJO · N | `fed-consolidacion` |
| `R16` | MarcaNacional | CUSTODIO · N | `fed-marca` |
| `R17` | LicenciaDeMarca | CUSTODIO · N | `fed-marca` |
| `R18` | SoporteNacional | PUENTE · N | `fed-soporte` |
| `R19` | PermisoDePlaza | CUSTODIO · N | `fed-acceso` |
| `R20` | TrazaDeAcceso | CUSTODIO · N | `fed-acceso` |
| `R21` | AccesoDelegadoAPlaza | CUSTODIO · N | `fed-acceso` |
| `R22` | ActaDeFederación | CUSTODIO · N | `fed-acta` |
| `R23` | GuardaSinCatálogoNacional | REFLEJO · N | `fed-buzon` |
| `R24` | GuardaNoRecauda | REFLEJO · N | `fed-canon` |
| `R25` | GuardaFronteraDePlaza | REFLEJO · N | `fed-buzon` |
| `R26` | CanonDePlaza | REFLEJO · N | `fed-canon` |


## 5 · Contrato de eventos

### 5.1 · La frontera con pizzepos: cuatro eventos y ninguno más

| evento de pizzepos | módulo que lo emite | quién lo escucha en Bocaos | qué se hace |
|---|---|---|---|
| `pedido.creado` | `pizzepos/pedidos` v3.6.0 | `pedido-mercado`, `tarifa-pedido`, `aviso-tienda`, `aviso-cliente` | nace el pedido del mercado, se congela la oferta, se avisa |
| `pedido.cancelado` | `pizzepos/pedidos` v3.6.0 | `pedido-mercado` | transición `cancelado`; no se cobra a nadie |
| `cocina.pedido_listo` | `pizzepos/cocina` v3.5.0 | `entrada-listo` | **el disparador**: se compone el hecho de listo y arranca el enlace |
| `pedido.pagado` | `pizzepos/pedidos` v3.6.0 | `aviso-cliente` | constancia para el cliente; la plaza no toca ese dinero (H06) |

Y tres transportes que se usan **como puerto**, no como hoja: `telegram.send_message.request`
(`telegram-service` v3.1.0), `whatsapp.enviar*` (`whatsapp-bot` v1.5.0) y `scheduler.job.triggered`
(`scheduler` v1.0.0).

**Lo que Bocaos NO escucha, y es una decisión, no un olvido:** `cuenta.*`, `cobro.*`, `comandero.*`,
`impresion.*`, `catalogo.*`, `tienda.pedido.*`. Son de la tienda. Si Bocaos leyera `cobro.procesado`
del POS, la plaza sabría cuánto cobra cada tienda y H06 dejaría de ser una propiedad para ser una
promesa.

### 5.2 · Los pares del cuello (el producto)

| pide | respuesta | fallo | quién |
|---|---|---|---|
| `foto-mercado.componer.request` | `.componer.response` | `.componer.failed` | `enlace` → `foto-mercado` |
| `foto-mercado.elegibles.request` | `.elegibles.response` | `.elegibles.failed` | `enlace` → `foto-mercado` |
| `propuesta.emitir.request` | `.emitir.response` | `.emitir.failed` | `enlace` → `propuesta` |
| `propuesta.acuse.request` | `.acuse.response` | `.acuse.failed` | `canal-rider` → `propuesta` |
| `contrato-puntual.crear.request` | `.crear.response` | `.crear.failed` | `enlace` → `contrato-puntual` |
| `hecho-listo.anotar.request` | `.anotar.response` | `.anotar.failed` | `entrada-listo` → `hecho-listo` |
| `ruta-viva.capacidad.request` | `.capacidad.response` | `.capacidad.failed` | `foto-mercado` → `ruta-viva` |
| `tarifa-pedido.de.request` | `.de.response` | `.de.failed` | `enlace` → `tarifa-pedido` |
| `medida-cocina.medir.request` | `.medir.response` | `.medir.failed` | `enlace` (A08) → `medida-cocina` |
| `pago.iniciar.request` | `pago.iniciar.response` | `pago.rechazado` | `cobro-gestion` → `pago-gateway` |

**Regla del par**: el `.response` sale SIEMPRE, aunque sea con `status: 4xx`; el `.failed` es el HECHO
de que la guarda dijo no. Sin los dos, un rechazo de negocio viaja como un status y nadie lo ve en el bus.

### 5.3 · Los hechos de dominio, con quién los escucha (comprobado contra este mismo plano)

| hecho | emisor | escucha |
|---|---|---|
| `bocaos.acta_anotada` | `acta-decisiones` | `contrato-tramos` |
| `bocaos.acta_incompleta` | `hechos-reparto` | `regla-fallo` |
| `bocaos.aviso_rechazado` | `aviso-cliente` | — (nadie más: hecho informativo) |
| `bocaos.capacidad_declarada` | `ruta-viva` | `estado-parte` |
| `bocaos.cargo_anotado` | `cargo-fallo` | `disputa-fallo`, `liquidacion` |
| `bocaos.caso_cerrado` | `cola-sala` | — (nadie más: hecho informativo) |
| `bocaos.caso_encolado` | `cola-sala` | `dictamen-revision` |
| `bocaos.censo_actualizado` | `censo-parte` | `publicacion` |
| `bocaos.censo_incompleto` | `censo-parte` | — (nadie más: hecho informativo) |
| `bocaos.ciclo_cerrado` | `liquidacion` | — (nadie más: hecho informativo) |
| `bocaos.cliente_avisado` | `aviso-cliente` | — (nadie más: hecho informativo) |
| `bocaos.cobro_confirmado` | `cobro-gestion` | — (nadie más: hecho informativo) |
| `bocaos.cobro_fallido` | `cobro-gestion` | — (nadie más: hecho informativo) |
| `bocaos.contrato_cerrado` | `contrato-puntual` | `estado-parte`, `ruta-viva`, `pedido-mercado`, `instrucciones-acceso` |
| `bocaos.contrato_creado` | `contrato-puntual` | `estado-parte`, `ruta-viva`, `aviso-tienda`, `aviso-cliente`, `hechos-reparto`, `chat-enmascarado`, `liquidacion` |
| `bocaos.cuadro_servido` | `salud-mercado` | `publicacion` |
| `bocaos.devengo_anotado` | `liquidacion` | `publicacion` |
| `bocaos.dictamen_firmado` | `dictamen-revision` | `config-mercado`, `accion-sancion` |
| `bocaos.documento_emitido` | `factura-gestion` | `cobro-gestion` |
| `bocaos.enlace_agotado` | `enlace` | `escalada-enlace` |
| `bocaos.enlace_completado` | `enlace` | — (nadie más: hecho informativo) |
| `bocaos.escalada_pedida` | `escalada-enlace` | — (nadie más: hecho informativo) |
| `bocaos.escalada_reintentar` | `escalada-enlace` | `enlace` |
| `bocaos.estado_parte_declarado` | `estado-parte` | — (nadie más: hecho informativo) |
| `bocaos.fallo_medido` | `regla-fallo` | `cargo-fallo` |
| `bocaos.federacion_acceso_anotado` | `fed-acceso` | — (nadie más: hecho informativo) |
| `bocaos.federacion_acceso_denegado` | `fed-acceso` | — (nadie más: hecho informativo) |
| `bocaos.federacion_acceso_vencido` | `fed-acceso` | — (nadie más: hecho informativo) |
| `bocaos.federacion_acceso_visto` | `fed-buzon` | `fed-acceso` |
| `bocaos.federacion_acta_asentada` | `fed-acta` | — (nadie más: hecho informativo) |
| `bocaos.federacion_almacen_con_catalogo` | `fed-buzon` | — (nadie más: hecho informativo) |
| `bocaos.federacion_aviso_no_enviado` | `fed-aviso` | — (nadie más: hecho informativo) |
| `bocaos.federacion_canon_emitido` | `fed-canon` | — (nadie más: hecho informativo) |
| `bocaos.federacion_canon_sin_coeficiente` | `fed-canon` | — (nadie más: hecho informativo) |
| `bocaos.federacion_caso_abierto` | `fed-soporte` | — (nadie más: hecho informativo) |
| `bocaos.federacion_caso_escalado` | `fed-soporte` | — (nadie más: hecho informativo) |
| `bocaos.federacion_consolidado` | `fed-consolidacion` | — (nadie más: hecho informativo) |
| `bocaos.federacion_devengo_cerrado` | `fed-buzon` | `fed-consolidacion` |
| `bocaos.federacion_fila_sin_plaza` | `fed-buzon` | — (nadie más: hecho informativo) |
| `bocaos.federacion_hecho_rechazado` | `fed-buzon` | — (nadie más: hecho informativo) |
| `bocaos.federacion_incompatible` | `fed-versiones` | — (nadie más: hecho informativo) |
| `bocaos.federacion_licencia_concedida` | `fed-marca` | — (nadie más: hecho informativo) |
| `bocaos.federacion_licencia_retirada` | `fed-marca` | — (nadie más: hecho informativo) |
| `bocaos.federacion_marca_declarada` | `fed-marca` | — (nadie más: hecho informativo) |
| `bocaos.federacion_plaza_anotada` | `fed-padron` | — (nadie más: hecho informativo) |
| `bocaos.federacion_plaza_estado` | `fed-padron` | `fed-aviso` |
| `bocaos.federacion_plaza_silenciosa` | `fed-padron` | — (nadie más: hecho informativo) |
| `bocaos.federacion_plaza_viva` | `fed-buzon` | `fed-versiones`, `fed-puesta-en-marcha` |
| `bocaos.federacion_soporte_sin_permiso` | `fed-soporte` | — (nadie más: hecho informativo) |
| `bocaos.federacion_tienda_baja` | `fed-censo` | — (nadie más: hecho informativo) |
| `bocaos.federacion_tienda_censada` | `fed-censo` | — (nadie más: hecho informativo) |
| `bocaos.federacion_tienda_publicada` | `fed-buzon` | `fed-censo` |
| `bocaos.federacion_verificacion_difiere` | `fed-puesta-en-marcha` | `fed-padron` |
| `bocaos.federacion_verificacion_ok` | `fed-puesta-en-marcha` | `fed-padron` |
| `bocaos.federacion_version_declarada` | `fed-versiones` | `fed-aviso` |
| `bocaos.foto_congelada` | `foto-mercado` | — (nadie más: hecho informativo) |
| `bocaos.hecho_desmentido` | `hecho-listo` | `enlace` |
| `bocaos.hecho_reparto_anotado` | `hechos-reparto` | `ruta-viva`, `pedido-mercado`, `aviso-cliente`, `contrato-puntual`, `incidencia-reparto`, `liquidacion` |
| `bocaos.hueco_nombrado` | `enlace` | `aviso-tienda`, `cola-sala` |
| `bocaos.incidencia_abierta` | `incidencia-reparto` | `regla-fallo`, `cola-sala` |
| `bocaos.indice_servido` | `indice-plaza` | — (nadie más: hecho informativo) |
| `bocaos.instrucciones_anotadas` | `instrucciones-acceso` | — (nadie más: hecho informativo) |
| `bocaos.listo_declarado` | `entrada-listo` | `hecho-listo` |
| `bocaos.medidas_calculadas` | `enlace` | — (nadie más: hecho informativo) |
| `bocaos.mensaje_entregado` | `chat-enmascarado` | — (nadie más: hecho informativo) |
| `bocaos.mensaje_rechazado` | `chat-enmascarado` | — (nadie más: hecho informativo) |
| `bocaos.oferta_subida` | `tarifa-pedido` | — (nadie más: hecho informativo) |
| `bocaos.parte_sancionada` | `accion-sancion` | `estado-parte` |
| `bocaos.pedido_aceptado` | `pedido-mercado` | `aviso-cliente` |
| `bocaos.pedido_cancelado` | `pedido-mercado` | — (nadie más: hecho informativo) |
| `bocaos.pedido_creado` | `pedido-mercado` | `aviso-tienda`, `aviso-cliente` |
| `bocaos.pedido_listo` | `hecho-listo` | `ruta-viva`, `aviso-cliente`, `enlace`, `hechos-reparto` |
| `bocaos.pedido_rechazado` | `pedido-mercado` | — (nadie más: hecho informativo) |
| `bocaos.politica_declarada` | `config-mercado` | — (nadie más: hecho informativo) |
| `bocaos.posicion_anotada` | `ruta-viva` | — (nadie más: hecho informativo) |
| `bocaos.precio_cerrado` | `tarifa-pedido` | — (nadie más: hecho informativo) |
| `bocaos.promesa_guardada` | `ruta-viva` | — (nadie más: hecho informativo) |
| `bocaos.propuesta_aceptada` | `propuesta` | `contrato-puntual` |
| `bocaos.propuesta_acusada` | `propuesta` | — (nadie más: hecho informativo) |
| `bocaos.propuesta_caducada_sin_acuse` | `propuesta` | — (nadie más: hecho informativo) |
| `bocaos.propuesta_caducada_sin_respuesta` | `propuesta` | `enlace` |
| `bocaos.propuesta_emitida` | `propuesta` | `canal-rider` |
| `bocaos.propuesta_entregada` | `canal-rider` | `propuesta` |
| `bocaos.propuesta_no_entregada` | `canal-rider` | `propuesta` |
| `bocaos.propuesta_rechazada` | `propuesta` | `enlace` |
| `bocaos.prueba_anotada` | `hechos-reparto` | — (nadie más: hecho informativo) |
| `bocaos.reclamacion_devuelta` | `aviso-tienda` | — (nadie más: hecho informativo) |
| `bocaos.terminos_aceptados` | `terminos-parte` | `censo-parte`, `contrato-tramos` |
| `bocaos.tramos_actualizados` | `contrato-tramos` | — (nadie más: hecho informativo) |
| `bocaos.trayecto_cerrado` | `ruta-viva` | — (nadie más: hecho informativo) |


## 6 · Máquina de estados (dueño, unidad y estado ilegal imposible)

### 6.1 · El pedido del mercado — dueño `pedido-mercado` (P), clave `pedido_id` de pizzepos

```text
creado ──▶ aceptado_tienda ──▶ propuesto ──▶ con_rider ──▶ recogido ──▶ entregado
   │              │                 │             │
   │              │                 └─(sin aceptación, tope agotado)──▶ sin_rider ──▶ escalado
   │              └─(la tienda rechaza)──▶ cancelado_por_tienda
   └─(el cliente cancela dentro de la ventana)──▶ cancelado ──▶ (nadie cobra: C07)
```

- Ninguna flecha existe sin un **hecho con hora**. `pedido.creado`, `bocaos.propuesta_aceptada`,
  `bocaos.contrato_creado`, `bocaos.hecho_reparto_anotado`.
- **El estado no se corrige: se avanza.** Si hubo un error, se avanza a un estado que lo reconoce y las
  dos horas quedan.
- `entregado` **no** lo pone este módulo: lo pone `hechos-reparto` al anotar la entrega, y aquí se refleja.

### 6.2 · La propuesta — dueño `propuesta` (P), dos relojes y tres desenlaces

```text
emitida ──▶ (acuse) ──▶ acusada ──▶ aceptada   → contrato-puntual
   │                        └─────▶ rechazada  → siguiente candidato
   ├─(sin acuse, vence el reloj del CANAL)────▶ caducada_sin_acuse
   └─(con acuse, vence el reloj del RIDER)────▶ caducada_sin_respuesta
```

**Sin acuse ≠ sin respuesta.** El primero es un fallo de transporte (el aviso no llegó); el segundo es
una decisión del rider (no contestó). Se miden distinto y se pagan distinto.

### 6.3 · El contrato puntual — dueño `contrato-puntual` (P)

`nacido` (sólo desde `bocaos.propuesta_aceptada`; **sin aceptación no hay constructor**) → `en_curso`
(al anotar la recogida) → `cerrado`(entrega) · `cerrado`(incidencia). Sin turno, sin jornada, sin duración.

### 6.4 · El cargo por fallo — dueño `cargo-fallo` (P)

`medido` → `anotado` → `cobrado` · `anulado`. **Sin evidencia no hay cargo**: si `regla-fallo` no puede
verificar el hecho, el cargo no nace y el caso va a `cola-sala`.

### 6.5 · El ciclo semanal — dueño `liquidacion` (P)

`abierto` → `devengando` → `cerrado` → `facturado` → `cobrado` · `con_impago`. El cierre es inmutable:
un cargo posterior es un documento nuevo con su hora, nunca una edición.

### 6.6 · La cola de la sala — dueño `cola-sala` (P)

`encolado` → `tomado` → `dictaminado` → `cerrado`. Un caso **no se cierra sin dictamen firmado** por una
persona (`dictamen-revision`), y el dictamen lleva hora y autor.

### 6.7 · La plaza en el registro — dueño `fed-padron` (N)

`naciendo` → `operando` → `en pausa` → `operando` · `cerrada` (no vuelve). Declarar caída una plaza **no
la apaga**: la plaza sigue repartiendo aunque el registro la crea caída. Ésa es la diferencia que salva
la auditoría 4.

### 6.8 · El canon — dueño `fed-canon` (N), condicionado por aritmética

`no_existe` (una plaza) → `devengado` → `documentado` → `cobrado`. La transición de `no_existe` exige
**dos plazas**: no es un `if`, es la condición de existencia de la clase.

### 6.9 · El buzón — dueño `fed-buzon` (N): cuatro formas y la quinta se rechaza

`recibido` → `aceptado` · `RECHAZADO(forma desconocida)`. El buzón sólo acepta `plaza.viva`,
`tienda.dada-de-alta`, `plaza.devengo-cerrado` y `plaza.acceso-visto`. Un pedido dentro de un hecho
publicado es un rechazo, no un campo ignorado.


## 7 · Las cuatro auditorías del corte: cómo las cumple este plano

| # | auditoría | cómo se cumple aquí | dónde puede fallar |
|---|---|---|---|
| 1 | **El nacional no tiene pedidos** | `fed-buzon` sólo acepta cuatro formas; el índice (`fed-buscador`) devuelve plaza, no pedido; `pedido-mercado` no publica nada hacia el nacional | si alguien añade un quinto hecho «para métricas» |
| 2 | **El nacional no recauda** | `fed-canon` sólo existe con dos plazas; `liquidacion` cierra sin preguntar al nacional | si el canon se mete dentro del ciclo de la plaza |
| 3 | **Ninguna fila cruza de plaza** | `plaza_id` en todos los hechos; `censo-parte` y `estado-parte` filtran por plaza; `publicacion` sólo sube los cuatro | **la que puede fallar**: un rider en dos plazas con capacidad compartida (§7.9 de la F3). Se declara deuda, no se tapa |
| 4 | **Apagar el nacional y las plazas siguen** | no hay ni una flecha P→N que no sea publicar; `fed-aviso` es ignorable por diseño | si `publicacion` esperara acuse |

**Y las tres guardas del negocio que este plano NO relaja, ahora con dueño claro:**

| guarda | dueño | qué pasaría si se rompe |
|---|---|---|
| `K02` ninguna marca de Bocaos en el aviso al cliente | `aviso-cliente` (valida ANTES de enviar) | la tienda pierde la cara de su cliente y culpa a Bocaos. Es el puerto más delicado del negocio |
| `L02` ningún cliente cruza de tienda | `indice-plaza` (`_propiedad_cliente`) | la promesa al restaurante se convierte en literatura. Se comprueba también **dentro de la misma plaza** |
| `H06` la plaza no retiene lo ajeno | `liquidacion` (`_no_retencion`) + `cobro-gestion` | si la plaza cobrara la comida o el reparto, el mercado dejaría de ser un mercado y sería un transportista con una tienda dentro |

**La renuncia que este plano hace explícita y que la v2 no hacía**: Bocaos **no** tiene marca de cliente
final, ni app, ni atención al cliente, ni carrito propio, ni catálogo propio. Todo eso es de la tienda, y
en este sistema «la tienda» tiene nombre y versión: `pizzepos`.


## 8 · Orden de construcción

El diseño no se puede construir empezando por el corazón: `enlace` depende de datos que escribe
medio negocio. El orden de abajo es **topológicamente válido** (cada hoja va después de sus
`depende_de`; lo comprueba la espina) y sigue los **11 peldaños del §14 de la F3**, con dos
diferencias que impone este sistema:

```text
REGLA DEL ORDEN · cada peldaño se puede probar solo.
  una plaza con 0–9 y sin 11 es una federación de una, funcionando.
  una plaza con 6 y sin 1–5 propone con números inventados — el negocio contrario a este.
  y ahora una más: los peldaños 0–5 de la TIENDA ya están hechos (pizzepos), así que el peldaño 4
  empieza por ENGANCHARLOS, no por construirlos.
```

| # | hoja | forma | acción | unidad | clases | peldaño |
|---|---|---|---|---|---|---|
| 1 | `scheduler` | micro-agente | **REUTILIZAR** | PLAZA | — | 0 · la plaza sola |
| 2 | `acta-decisiones` | custodio | **CONSTRUIR** | PLAZA | O02 | 1 · lo que declara la plaza |
| 3 | `config-mercado` | custodio | **CONSTRUIR** | PLAZA | J01, J02, J03, J04, J05, G01 | 1 · lo que declara la plaza |
| 4 | `censo-parte` | custodio | **CONSTRUIR** | PLAZA | I01, I02, M02, M03, P04, D06 | 2 · el censo y el estado |
| 5 | `estado-parte` | custodio | **CONSTRUIR** | PLAZA | I03, I04 | 2 · el censo y el estado |
| 6 | `terminos-parte` | custodio | **CONSTRUIR** | PLAZA | I08 | 2 · el censo y el estado |
| 7 | `ruta-viva` | custodio | **CONSTRUIR** | PLAZA | B01, B02, B03, B04, B05, B06 | 3 · la ruta viva |
| 8 | `carta-digital` | conversor | **REUTILIZAR** | TIENDA | D02, D04 | 4 · el pedido y su precio |
| 9 | `carta-marketing` | custodio | **REUTILIZAR** | TIENDA | D01 | 4 · el pedido y su precio |
| 10 | `cocina` | custodio | **REUTILIZAR** | TIENDA | C04 | 4 · el pedido y su precio |
| 11 | `pedidos` | custodio | **ADAPTAR** | TIENDA | D05 | 4 · el pedido y su precio |
| 12 | `tarifas` | custodio | **REUTILIZAR** | TIENDA | D03 | 4 · el pedido y su precio |
| 13 | `tienda-api` | puente | **ADAPTAR** | TIENDA | C01 | 4 · el pedido y su precio |
| 14 | `contrato-tramos` | custodio | **CONSTRUIR** | PLAZA | E06, N02 | 4 · el pedido y su precio |
| 15 | `frontera-plaza` | reflejo | **CONSTRUIR** | PLAZA | S01, S02 | 4 · el pedido y su precio |
| 16 | `indice-plaza` | reflejo | **CONSTRUIR** | PLAZA | D07, D08, L02 | 4 · el pedido y su precio |
| 17 | `pedido-mercado` | custodio | **CONSTRUIR** | PLAZA | C02, C07 | 4 · el pedido y su precio |
| 18 | `aviso-cliente` | puente | **CONSTRUIR** | TIENDA | C05, C06, K02 | 4 · el pedido y su precio |
| 19 | `aviso-tienda` | puente | **CONSTRUIR** | PLAZA | C03, K01 | 4 · el pedido y su precio |
| 20 | `hecho-listo` | custodio | **CONSTRUIR** | PLAZA | A01 | 4 · el pedido y su precio |
| 21 | `instrucciones-acceso` | custodio | **CONSTRUIR** | PLAZA | F05 | 4 · el pedido y su precio |
| 22 | `tarifa-pedido` | custodio | **CONSTRUIR** | PLAZA | E01, E02, E03, E07 | 4 · el pedido y su precio |
| 23 | `entrada-listo` | puente | **CONSTRUIR** | PLAZA | — | 4 · el pedido y su precio |
| 24 | `foto-mercado` | reflejo | **CONSTRUIR** | PLAZA | A02, A03, A04 | 6 · el corazón |
| 25 | `propuesta` | custodio | **CONSTRUIR** | PLAZA | A13, A14, A15, A19, A27, A29, A33, M05 | 6 · el corazón |
| 26 | `canal-rider` | puente | **CONSTRUIR** | PLAZA | M04 | 6 · el corazón |
| 27 | `contrato-puntual` | custodio | **CONSTRUIR** | PLAZA | A24 | 6 · el corazón |
| 28 | `chat-enmascarado` | puente | **CONSTRUIR** | PLAZA | F04 | 7 · el reparto y la prueba |
| 29 | `hechos-reparto` | custodio | **CONSTRUIR** | PLAZA | F01, F02, F03 | 7 · el reparto y la prueba |
| 30 | `medida-cocina` | reflejo | **CONSTRUIR** | TIENDA | L03 | 5 · el histórico del local |
| 31 | `panel-tienda` | reflejo | **CONSTRUIR** | TIENDA | L01 | 5 · el histórico del local |
| 32 | `enlace` | reflejo | **CONSTRUIR** | PLAZA | A05, A06, A07, A08, A09, A10, A11, A12, A16, A17, A20, A21, A22, A23, A25, A28, A30, A31, A34, A35 | 6 · el corazón |
| 33 | `escalada-enlace` | puente | **CONSTRUIR** | PLAZA | A26 | 6 · el corazón |
| 34 | `redaccion-propuesta` | micro-agente | **CONSTRUIR** | PLAZA | A18 | 6 · el corazón |
| 35 | `incidencia-reparto` | puente | **CONSTRUIR** | PLAZA | F06 | 7 · el reparto y la prueba |
| 36 | `lectura-incidencia` | micro-agente | **CONSTRUIR** | PLAZA | F07 | 7 · el reparto y la prueba |
| 37 | `regla-fallo` | reflejo | **CONSTRUIR** | PLAZA | G02, G03, G06 | 8 · el dinero de la plaza |
| 38 | `cargo-fallo` | custodio | **CONSTRUIR** | PLAZA | G04 | 8 · el dinero de la plaza |
| 39 | `disputa-fallo` | puente | **CONSTRUIR** | PLAZA | G05 | 8 · el dinero de la plaza |
| 40 | `liquidacion` | custodio | **CONSTRUIR** | PLAZA | H01, H02, H05, E04, E05, A32, H06 | 8 · el dinero de la plaza |
| 41 | `factura-gestion` | conversor | **CONSTRUIR** | PLAZA | H03 | 8 · el dinero de la plaza |
| 42 | `cobro-gestion` | puente | **ADAPTAR** | PLAZA | H04 | 8 · el dinero de la plaza |
| 43 | `cuenta-parte` | reflejo | **CONSTRUIR** | PLAZA | Q01, M01 | 8 · el dinero de la plaza |
| 44 | `aviso-sala` | puente | **CONSTRUIR** | PLAZA | I07 | 9 · la operación humana |
| 45 | `dictamen-revision` | custodio | **CONSTRUIR** | PLAZA | O04 | 9 · la operación humana |
| 46 | `accion-sancion` | custodio | **CONSTRUIR** | PLAZA | P03 | 9 · la operación humana |
| 47 | `cola-sala` | custodio | **CONSTRUIR** | PLAZA | P01, O03, P02 | 9 · la operación humana |
| 48 | `salud-mercado` | reflejo | **CONSTRUIR** | PLAZA | I05, I06, O01, N01 | 9 · la operación humana |
| 49 | `publicacion` | puente | **CONSTRUIR** | PLAZA | — | 10 · el borde amable |
| 50 | `resumen-tienda` | micro-agente | **CONSTRUIR** | TIENDA | L04 | 10 · el borde amable |
| 51 | `fed-buzon` | custodio | **CONSTRUIR** | NACIONAL | R23, R25 | 11 · el nacional |
| 52 | `fed-marca` | custodio | **CONSTRUIR** | NACIONAL | R16, R17 | 11 · el nacional |
| 53 | `fed-padron` | custodio | **CONSTRUIR** | NACIONAL | R01, R02, R03, R04 | 11 · el nacional |
| 54 | `fed-acceso` | custodio | **CONSTRUIR** | NACIONAL | R19, R20, R21 | 11 · el nacional |
| 55 | `fed-acta` | custodio | **CONSTRUIR** | NACIONAL | R22 | 11 · el nacional |
| 56 | `fed-censo` | custodio | **CONSTRUIR** | NACIONAL | R05 | 11 · el nacional |
| 57 | `fed-buscador` | reflejo | **CONSTRUIR** | NACIONAL | R10, R11, R12 | 11 · el nacional |
| 58 | `fed-consolidacion` | reflejo | **CONSTRUIR** | NACIONAL | R14, R15 | 11 · el nacional |
| 59 | `fed-canon` | reflejo | **CONSTRUIR** | NACIONAL | R24, R26 | 11 · el nacional |
| 60 | `fed-enrutado` | puente | **CONSTRUIR** | NACIONAL | R13 | 11 · el nacional |
| 61 | `fed-puesta-en-marcha` | puente | **CONSTRUIR** | NACIONAL | R07, R08 | 11 · el nacional |
| 62 | `fed-soporte` | puente | **CONSTRUIR** | NACIONAL | R18 | 11 · el nacional |
| 63 | `fed-versiones` | custodio | **CONSTRUIR** | NACIONAL | R06, R09 | 11 · el nacional |
| 64 | `fed-aviso` | puente | **CONSTRUIR** | NACIONAL | — | 11 · el nacional |

**Las hojas desplazadas, y por qué** (el orden manda; el peldaño informa):

- `medida-cocina` va en el puesto 30 aunque su peldaño es «5 · el histórico del local», porque su materia prima la escribe hecho-listo, hechos-reparto y sin ella no tendría nada que guardar

Es la diferencia entre construir y probar: una hoja se puede ESCRIBIR antes que su emisor (los módulos de Enki escuchan eventos y esperan en silencio), pero no se puede PROBAR sin materia prima. El orden de obra sigue la prueba, no el gusto.

**Las cuatro cosas que el orden dice y que no son obvias:**

1. **`contrato-tramos` va antes que `tarifa-pedido`**, al revés que en la v1: E03 compone el precio con
   los tramos, y si los tramos se declaran después, la primera semana se compone con tramos que no existen.
2. **`propuesta` va antes que `enlace`**, aunque parezca al revés: el enlace *pide* propuestas; la
   propuesta no sabe que existe el enlace. Y `contrato-puntual` va antes que `propuesta`.
3. **`pedido-mercado` y `tarifa-pedido` van ANTES que nada del corazón**, porque nacen del
   `pedido.creado` de pizzepos: son la puerta de entrada del mercado.
4. **El nacional va el último y no hace falta para nada de lo anterior.** Una plaza sola con 0–10 es una
   federación de una, repartiendo.


## 9 · Las hojas

Cada bloque CONSTRUIR lleva: clases · propósito · **A** dependencias · **B** `module.json` · **C** `index.js` ·
**D** proyecciones internas · **E** handlers RPC con su CLASE (ORDEN = superficie, PREGUNTA = bus) · **F** hechos ·
VERIFICACIÓN · por qué no reutiliza. Las REUTILIZAR y ADAPTAR llevan la ficha corta con su ruta real.
Van **en el orden de construcción del §8**.

### ▸ PELDAÑO 0 · la plaza sola

#### `scheduler` · `MICRO-AGENTE` · acción **REUTILIZAR** · unidad **PLAZA**

- **Clases:** — (sin clase propia: materializa un paso del flujo)
- **Propósito:** El reloj de la plaza: cron/interval/datetime/evento con `scheduler.job.triggered` / `.completed` / `.failed`. Lo usan `liquidacion` (cierre semanal) y `publicacion` (latido de plaza.viva).
- **A · ruta real:** `scheduler` — no se toca.
- **B · contrato REAL (del manifest):** `name: "scheduler"` · `unidad: "plaza"` · `subscribes:` [] · `publishes:` ["scheduler.job.triggered", "scheduler.job.completed", "scheduler.job.failed", "scheduler.job.created", "scheduler.job.updated", "scheduler.job.deleted", "scheduler.job.enabled", "scheduler.job.disabled"]
- **VERIFICACIÓN:** Crear en `project.activated` un job `bocaos-liquidacion-semanal` (cron) y otro `bocaos-plaza-viva` (interval); cada consumidor filtra por nombre. Job que falla → `scheduler.job.failed`, y el ciclo se declara fallido (nunca se da por cerrado).
- **DECISIÓN:** Ya existe y ya se usa en Enki. No se adapta: su contrato cubre el caso entero.
- **Nota:** Ruta real: /home/admin/3enki/modules/scheduler (v1.0.0).

### ▸ PELDAÑO 1 · lo que declara la plaza

#### `acta-decisiones` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** O02
- **Propósito:** El acta de la plaza: toda decisión con nombre, hora y motivo. Es lo que hace que una política no sea un capricho y que una sanción se pueda leer seis meses después.
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "acta-decisiones"` · `unidad: "plaza"` · `subscribes:` ["acta-decisiones.firmar.request", "acta-decisiones.de.request", "acta-decisiones.listar.request", "project.activated"] · `publishes:` ["acta-decisiones.firmar.response", "acta-decisiones.firmar.failed", "acta-decisiones.de.response", "acta-decisiones.de.failed", "acta-decisiones.listar.response", "acta-decisiones.listar.failed", "bocaos.acta_anotada"]
- **C · index.js:** `class ActaDecisiones extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/acta-decisiones.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_asentar` (O02: cambio + motivo + autor + ámbito + vigencia, o no hay cambio.) · `_de_instante` (O02: qué estaba vigente entonces, para explicar una decisión vieja.) · `_ambito` (§8: la firma lleva ámbito (tienda | plaza) y no se cruza. El dueño de la plaza no puede firmar una solicitud de una tienda.) · `_firmar` (op `firmar` del diseño (O02).) · `_de` (op `de` del diseño (O02).) · `_listar` (op `listar` del diseño (O02).)
- **E · handler:** `onFirmar(e)` → `_atender(e, 'firmar', 'acta-decisiones.firmar.response', d => this._firmar(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'acta-decisiones.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onListar(e)` → `_atender(e, 'listar', 'acta-decisiones.listar.response', d => this._listar(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.acta_anotada`
- **VERIFICACIÓN:** Dos actas sobre el mismo asunto: la primera no cambia. Cambio sin acta → 409 y no se escribe la política.
- **NO REUTILIZA / DECISIÓN:** `estados` y `contabilidad-*/historial-proceso-contable` son append-only de OTRO dominio. Se toma el patrón, no el módulo.

#### `config-mercado` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** J01 · J02 · J03 · J04 · J05 · G01
- **Propósito:** La política de la plaza con VIGENCIA: cuatro umbrales en AND, la ventana de propuesta, las zonas y las tres esperas. Dos capas (plaza · tienda) con precedencia escrita, y ninguna versión sin autor.
- **Estado:** ya en disco (v0.1.0)
- **Depende de:** `acta-decisiones`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "config-mercado"` · `unidad: "plaza"` · `subscribes:` ["config-mercado.declarar.request", "config-mercado.politica.request", "config-mercado.simular.request", "bocaos.dictamen_firmado", "project.activated"] · `publishes:` ["config-mercado.declarar.response", "config-mercado.declarar.failed", "config-mercado.politica.response", "config-mercado.politica.failed", "config-mercado.simular.response", "config-mercado.simular.failed", "bocaos.politica_declarada"]
- **C · index.js:** `class ConfigMercado extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/config-mercado.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_declarar` (J01: ámbito (plaza|tienda) · cuatro números · autor · desde. Una tienda sólo puede fijar SUS cuatro números; no hay dónde poner un quinto criterio.) · `_politica_vigente` (J04: la de la TIENDA si existe y está vigente; si no, la de la PLAZA. La precedencia es una tabla, no una negociación.) · `_forma` (J01: cuatro umbrales, en m · min · min · c€, en AND. La vertical fija la forma; aquí sólo viven los valores.) · `_tres_esperas` (G01: N1 tienda 8 min · N2 portal 5 min · N3 entrega 10 min (Q28).) · `_zona` (J03: cobertura de la plaza por zona. Es la mitad de la intersección con D06.) · `_simular` (J05: re-ejecuta la comparación sobre hechos históricos y declara sus límites. No aplica.) · `_politica` (op `politica` del diseño (J01, J02, J03, J04, J05, G01).)
- **E · handler:** `onDeclarar(e)` → `_atender(e, 'declarar', 'config-mercado.declarar.response', d => this._declarar(d))` · **CLASE: ORDEN**
- **E · handler:** `onPolitica(e)` → `_atender(e, 'politica', 'config-mercado.politica.response', d => this._politica(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onSimular(e)` → `_atender(e, 'simular', 'config-mercado.simular.response', d => this._simular(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.politica_declarada`
- **VERIFICACIÓN:** Declarar el default de la plaza y los de una tienda → `politica(t, tienda)` da la de la tienda y dice la capa. Cambiar el default NO cambia la de la tienda que declaró.
- **NO REUTILIZA / DECISIÓN:** Esta hoja absorbe la segunda capa que la v1 no tenía. Es la única hoja que cambia de FORMA sin cambiar de sitio: sigue en la plaza porque es la plaza quien la aplica al proponer (y la tienda no puede legislar sobre el rider).

### ▸ PELDAÑO 2 · el censo y el estado

#### `censo-parte` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** I01 · I02 · M02 · M03 · P04 · D06
- **Propósito:** El censo del mercado: qué tiendas y qué riders existen para ESTA plaza — con la ZONA QUE CADA TIENDA DECLARA (D06), que es la mitad de la frontera (S01) y el filtro del escaparate (S02).
- **Depende de:** `config-mercado`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "censo-parte"` · `unidad: "plaza"` · `subscribes:` ["censo-parte.alta.request", "censo-parte.checklist.request", "censo-parte.de.request", "censo-parte.zona.request", "bocaos.terminos_aceptados", "project.activated"] · `publishes:` ["censo-parte.alta.response", "censo-parte.alta.failed", "censo-parte.checklist.response", "censo-parte.checklist.failed", "censo-parte.de.response", "censo-parte.de.failed", "censo-parte.zona.response", "censo-parte.zona.failed", "bocaos.censo_actualizado", "bocaos.censo_incompleto"]
- **C · index.js:** `class CensoParte extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/censo-parte.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_alta_tienda` (I01: da de alta la tienda Y crea su proyecto en el despliegue (`project-manager`). Una tienda sin proyecto no tiene carta, ni carrito, ni clientes.) · `_alta_rider` (I02: identidad fiscal, KYC, autónomo, seguro, vehículo (Q34). Incompleta → no entra en A04.) · `_checklist` (P04: lo que falta, derivado del alta. Sin criterios ocultos.) · `_sin_exclusividad` (M03: falla si aparece exclusividad, permanencia, turno, cuota mínima o antigüedad (Q35: 0).) · `_zona_rider` (M02: las zonas que el rider declara y cambia cuando quiere.) · `_elegibles` (A04: estado, zona y capacidad. Ni un cuarto dato. Sin antigüedad.) · `_alta` (op `alta` del diseño (I01, I02, M02, M03, P04, D06).) · `_de` (op `de` del diseño (I01, I02, M02, M03, P04, D06).) · `_zona` (op `zona` del diseño (I01, I02, M02, M03, P04, D06).) · `_zona_tienda` (D06: la zona que la tienda declara, con hora y autor. La plaza la GUARDA y no la recorta; S02 la intersecta con la cobertura de la plaza. Aquí vive porque el censo es exactamente «quién existe y hasta dónde llega» — la tienda no tiene módulo propio en Bocaos: su casa es pizzepos.)
- **E · handler:** `onAlta(e)` → `_atender(e, 'alta', 'censo-parte.alta.response', d => this._alta(d))` · **CLASE: ORDEN**
- **E · handler:** `onChecklist(e)` → `_atender(e, 'checklist', 'censo-parte.checklist.response', d => this._checklist(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'censo-parte.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onZona(e)` → `_atender(e, 'zona', 'censo-parte.zona.response', d => this._zona(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.censo_actualizado`, `bocaos.censo_incompleto`
- **VERIFICACIÓN:** Alta de rider sin seguro → INCOMPLETA y no aparece en la foto. Alta de tienda → proyecto creado + `tienda.dada-de-alta` publicado por `publicacion`.
- **NO REUTILIZA / DECISIÓN:** Aquí está la única escritura de `project-manager` en toda la vertical: dar de alta una tienda ES crear un proyecto. Es la bisagra que hace verdad el corte de la F0.

#### `estado-parte` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** I03 · I04
- **Propósito:** El estado VIVO de cada parte en la plaza: abierta/saturada/pausada/sancionada. La pausa sólo la declara el rider; «ocupado» lo pone el contrato y lo quita su cierre.
- **Estado:** ya en disco (v0.1.0)
- **Depende de:** `censo-parte`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "estado-parte"` · `unidad: "plaza"` · `subscribes:` ["estado-parte.alta.request", "estado-parte.declarar.request", "estado-parte.de.request", "estado-parte.vigentes.request", "bocaos.contrato_creado", "bocaos.contrato_cerrado", "bocaos.parte_sancionada", "bocaos.capacidad_declarada", "project.activated"] · `publishes:` ["estado-parte.alta.response", "estado-parte.alta.failed", "estado-parte.declarar.response", "estado-parte.declarar.failed", "estado-parte.de.response", "estado-parte.de.failed", "estado-parte.vigentes.response", "estado-parte.vigentes.failed", "bocaos.estado_parte_declarado"]
- **C · index.js:** `class EstadoParte extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/estado-parte.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_transitar` (I04: 'ocupado' no lo pone la sala, lo pone el contrato vivo. La pausa sólo la declara el rider.) · `_vigentes` (I03/I04: disponibles por zona; el que está en pausa no aparece y nadie puede levantarla.) · `_alta` (op `alta` del diseño (I03, I04).) · `_declarar` (op `declarar` del diseño (I03, I04).) · `_de` (op `de` del diseño (I03, I04).)
- **E · handler:** `onAlta(e)` → `_atender(e, 'alta', 'estado-parte.alta.response', d => this._alta(d))` · **CLASE: ORDEN**
- **E · handler:** `onDeclarar(e)` → `_atender(e, 'declarar', 'estado-parte.declarar.response', d => this._declarar(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'estado-parte.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onVigentes(e)` → `_atender(e, 'vigentes', 'estado-parte.vigentes.response', d => this._vigentes(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.estado_parte_declarado`
- **VERIFICACIÓN:** La sala intenta poner en pausa a un rider → 403. Contrato creado → ocupado; cerrado → disponible.
- **NO REUTILIZA / DECISIÓN:** Sin cambios de unidad respecto a la v1: el estado es del mercado, no de la tienda. La tienda tiene su radio y su marca, no su disponibilidad en el censo.

#### `terminos-parte` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** I08
- **Propósito:** Los términos que cada parte acepta para entrar: versión, hora y autor. Sin términos aceptados no hay devengo ni propuesta para esa parte.
- **Depende de:** `censo-parte`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "terminos-parte"` · `unidad: "plaza"` · `subscribes:` ["terminos-parte.aceptar.request", "terminos-parte.de.request", "project.activated"] · `publishes:` ["terminos-parte.aceptar.response", "terminos-parte.aceptar.failed", "terminos-parte.de.response", "terminos-parte.de.failed", "bocaos.terminos_aceptados"]
- **C · index.js:** `class TerminosParte extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/terminos-parte.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_aceptar` (I08: cambio de términos NO retroactivo; quien no acepta la nueva sigue con la vieja.) · `_vigentes` (I08: puerta dura — sin términos, `enlace` no propone y `liquidacion` no devenga.) · `_de` (op `de` del diseño (I08).)
- **E · handler:** `onAceptar(e)` → `_atender(e, 'aceptar', 'terminos-parte.aceptar.response', d => this._aceptar(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'terminos-parte.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.terminos_aceptados`
- **VERIFICACIÓN:** Parte sin términos → no se le propone ni se le devenga. Aceptar v2 no reescribe v1.
- **NO REUTILIZA / DECISIÓN:** Sin cambios.

### ▸ PELDAÑO 3 · la ruta viva

#### `ruta-viva` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** B01 · B02 · B03 · B04 · B05 · B06
- **Propósito:** El trayecto que el rider YA lleva encima: último punto con frescura, paradas derivadas de contratos vivos, la promesa que sólo mejora y la capacidad que queda (mínimo de tres techos).
- **Estado:** ya en disco (v0.1.0)
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "ruta-viva"` · `unidad: "plaza"` · `subscribes:` ["ruta-viva.posicion.request", "ruta-viva.paradas.request", "ruta-viva.promesa.request", "ruta-viva.capacidad.request", "ruta-viva.de.request", "bocaos.contrato_creado", "bocaos.contrato_cerrado", "bocaos.pedido_listo", "bocaos.hecho_reparto_anotado", "project.activated"] · `publishes:` ["ruta-viva.posicion.response", "ruta-viva.posicion.failed", "ruta-viva.paradas.response", "ruta-viva.paradas.failed", "ruta-viva.promesa.response", "ruta-viva.promesa.failed", "ruta-viva.capacidad.response", "ruta-viva.capacidad.failed", "ruta-viva.de.response", "ruta-viva.de.failed", "bocaos.posicion_anotada", "bocaos.promesa_guardada", "bocaos.capacidad_declarada", "bocaos.trayecto_cerrado"]
- **C · index.js:** `class RutaViva extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/ruta-viva.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_promesa` (B03: sólo se puede MEJORAR (bajar la hora). Empeorarla exige pasar el umbral de retraso (A31).) · `_paradas` (B02: se DERIVA de los contratos vivos; si un contrato se cierra, su parada desaparece sola.) · `_ordenar` (B04: optimiza UNA ruta y sólo dentro de ella, con desempate declarado. La misma ruta da el mismo orden siempre.) · `_capacidad` (B05: se declara, no se estima. Es POR PLAZA, y ése es el agujero de §7.9 (Q44/Q45).) · `_fin` (B06: cierra el trayecto cuando no queda parada viva.) · `_posicion` (op `posicion` del diseño (B01, B02, B03, B04, B05, B06).) · `_de` (op `de` del diseño (B01, B02, B03, B04, B05, B06).)
- **E · handler:** `onPosicion(e)` → `_atender(e, 'posicion', 'ruta-viva.posicion.response', d => this._posicion(d))` · **CLASE: ORDEN**
- **E · handler:** `onParadas(e)` → `_atender(e, 'paradas', 'ruta-viva.paradas.response', d => this._paradas(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onPromesa(e)` → `_atender(e, 'promesa', 'ruta-viva.promesa.response', d => this._promesa(d))` · **CLASE: ORDEN**
- **E · handler:** `onCapacidad(e)` → `_atender(e, 'capacidad', 'ruta-viva.capacidad.response', d => this._capacidad(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'ruta-viva.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.posicion_anotada`, `bocaos.promesa_guardada`, `bocaos.capacidad_declarada`, `bocaos.trayecto_cerrado`
- **VERIFICACIÓN:** Contrato cerrado → su parada desaparece sin escribir nada. Promesa empeorada por debajo del umbral → 409 (A31).
- **NO REUTILIZA / DECISIÓN:** `entrega` (the-pirate) estima tiempos y guarda reglas de reparto propio: no hay rider, ni contrato vivo, ni promesa. No se toca.
- **Nota:** Se construye en el peldaño 3 y se queda a la ESCUCHA: sus entradas son eventos (`bocaos.contrato_creado`, `bocaos.hecho_reparto_anotado`), no llamadas. Sin contratos vivos no tiene paradas, y lo dice (`B02` vacío), no lo inventa.

### ▸ PELDAÑO 4 · el pedido y su precio

#### `carta-digital` · `CONVERSOR` · acción **REUTILIZAR** · unidad **TIENDA**

- **Clases:** D02 · D04
- **Propósito:** La carta pública y el carrito: proyecta la carta ACTIVA del proyecto (tarifas + carta-manager + marca + contenido) y sirve la PWA estática que lleva el carrito en el navegador y hace POST a `tienda-api`.
- **A · ruta real:** `pizzepos/carta-digital, pizzepos/carta-manager, pizzepos/tarifas, pizzepos/contenido` — no se toca.
- **B · contrato REAL (del manifest):** `name: "carta-digital"` · `unidad: "tienda"` · `subscribes:` [] · `publishes:` []
- **VERIFICACIÓN:** Activar una carta en carta-manager → `get_carta_publica` la sirve sin copia. El carrito vive en la PWA (localStorage) y cierra en `tienda-api`; no hay segunda carta ni segundo carrito en el servidor.
- **DECISIÓN:** No se construye `tienda-carta` ni `tienda-carrito`. La carta pública es UNA proyección (D02) y el carrito de un cliente en una tienda no cruza (D04): la PWA ya lo cumple por construcción (un despliegue por tienda, un localStorage por origen).
- **Nota:** Ruta real: /home/admin/3enki/modules/pizzepos/carta-digital (v2.25.1). ui_handlers: get_carta_publica, get_config, update_config, get_diseno, preview, publicar. Carrito en static-template.js (localStorage).

#### `carta-marketing` · `CUSTODIO` · acción **REUTILIZAR** · unidad **TIENDA**

- **Clases:** D01
- **Propósito:** La marca de la tienda: nombre, signos, tono y titular. Es de la tienda y Bocaos no firma nada que el cliente final vea.
- **A · ruta real:** `pizzepos/carta-marketing` — no se toca.
- **B · contrato REAL (del manifest):** `name: "carta-marketing"` · `unidad: "tienda"` · `subscribes:` ["carta-marketing.validar.request", "carta-marketing.get_perfil.request", "carta-marketing.update_perfil.request", "carta-marketing.guardar_copy.request"] · `publishes:` ["marketing.perfil.actualizado", "marketing.copy.generado"]
- **VERIFICACIÓN:** `carta-marketing.get_perfil` devuelve la marca del proyecto; esa marca es la única firma que aparece en el aviso al cliente (`aviso-cliente`, K02).
- **DECISIÓN:** No se construye `tienda-marca`: el perfil de marca por proyecto ya existe, con validación AJV (`marca.schema.json`) y guardado por secciones.
- **Nota:** Ruta real: /home/admin/3enki/modules/pizzepos/carta-marketing (v2.6.0). Los hechos `marketing.*` los emite el handler, no el manifest.

#### `cocina` · `CUSTODIO` · acción **REUTILIZAR** · unidad **TIENDA**

- **Clases:** C04
- **Propósito:** La cocina: el pedido entra por `pedido.enviado_cocina` y sale con `cocina.mark-ready`, que emite `cocina.pedido_listo` con su hora. Ése ES el hecho de listo de Bocaos: lo pulsa una persona, no lo estima el sistema.
- **A · ruta real:** `pizzepos/cocina` — no se toca.
- **B · contrato REAL (del manifest):** `name: "cocina"` · `unidad: "tienda"` · `subscribes:` ["pedido.enviado_cocina", "pedido.cancelado", "cuenta.creada", "cuenta.actualizada", "cuenta.eliminada", "caja.cerrada", "dia.iniciado"] · `publishes:` ["cocina.item_preparando", "cocina.item_avanzado", "cocina.item_preparado", "cocina.item_ticket", "cocina.pedido_listo", "periferico.display", "cocina.device_registered", "cocina.device_unregistered", "cocina.device_updated"]
- **VERIFICACIÓN:** `cocina.mark-ready` sobre un pedido de tienda → `cocina.pedido_listo` con pedido_id, cuenta_id, project_id y timestamp. Ese timestamp es la hora de listo que `entrada-listo` sella (C04: declarar tiene consecuencia; no se adelanta ni se corrige).
- **DECISIÓN:** No se construye `tienda-hora-listo`: sería un segundo custodio de la misma hora. La declaración ya existe (mark-ready, con dispositivo y hora) y su registro en la plaza es `hecho-listo`. Dos custodios del mismo hecho son dos verdades.
- **Nota:** Ruta real: /home/admin/3enki/modules/pizzepos/cocina (v3.5.0). Tool clave: `cocina.mark-ready`. Aislamiento por proyecto ya resuelto en v3.5.0.

#### `pedidos` · `CUSTODIO` · acción **ADAPTAR** · unidad **TIENDA**

- **Clases:** D05
- **Propósito:** El pedido de la tienda: YA EXISTE (tipo='tienda'), ya crea cuenta operativa en comandero, ya lo manda a cocina y ya publica `pedido.creado`. Es el registro del cliente de la tienda (nombre y teléfono por pedido) y la fuente del hecho de listo. Se le añade `modo_consumo:'domicilio'` y que la dirección viaje en el evento.
- **A · ruta real:** `pizzepos/pedidos` — se AÑADE, no se reescribe.
- **B · module.json:** `name: "pedidos"` · `unidad: "tienda"` · `subscribes:` ["comandero.enviar_cocina", "variacion.validada", "variacion.rechazada", "cuenta.creada", "catalogo.actualizado", "producto.creado", "producto.actualizado", "caja.cerrada", "dia.iniciado", "pago.confirmado", "servicio.cambiado"] · `publishes:` ["pedido.creado", "pedido.item_agregado", "pedido.item_actualizado", "pedido.item_eliminado", "pedido.enviado_cocina", "pedido.completado", "pedido.cancelado", "pedido.pagado", "pedido.recogido", "servicio.cambiado"]
- **VERIFICACIÓN:** Pedido con `modo_consumo:'domicilio'` → `pedido.creado` con `entrega:{direccion, oferta_centimos}` y `cuenta_id` (la cuenta operativa ya se crea hoy). Pedido pickup → `pedido.creado` idéntico al de hoy, sin bloque `entrega`. Un pedido de domicilio entra en cocina igual que hoy (vía `cuentas` → `comandero.enviar_cocina`).
- **QUÉ SE TOCA / POR QUÉ NO SE CONSTRUYE:** No se construye un pedido del mercado: `pedidos` ya tiene el flujo `tipo='tienda'` completo (estado `pendiente_recogida`, items en una sola llamada, `cliente_nombre` como ancla, cuenta operativa, envío a cocina). Lo que NO tiene es reparto: `_validatePedidoBody` no admite dirección y `_publishPedidoCreado` excluye la PII. Se AÑADE `entrega` al shape y al evento (aditivo); el teléfono SIGUE sin viajar en el evento.
- **F · hechos que publica:** `pedido.creado`, `pedido.cancelado`, `pedido.pagado`
- **Nota:** Ruta real: /home/admin/3enki/modules/pizzepos/pedidos (v3.6.0). Tools: pedido.crear-tienda, pedido.get, pedido.list, pedido.cancel, pedido.servicio.set.

#### `tarifas` · `CUSTODIO` · acción **REUTILIZAR** · unidad **TIENDA**

- **Clases:** D03
- **Propósito:** El precio de la comida por canal: cada canal tiene su carta con precios finales escritos. Sin cálculos en runtime y sin duplicación. El reparto lo suma la plaza (E03).
- **A · ruta real:** `pizzepos/tarifas` — no se toca.
- **B · contrato REAL (del manifest):** `name: "tarifas"` · `unidad: "tienda"` · `subscribes:` ["project.activated", "project.deactivated", "tarifas.config.solicitada"] · `publishes:` ["tarifas.config.actualizada"]
- **VERIFICACIÓN:** `tarifas.config.actualizada` trae el estado completo (general, canales, variantes) y quien lo necesite cachea. El precio cerrado del pedido = precio de tarifas + `bocaos.precio_cerrado` (E03).
- **DECISIÓN:** No se construye `tienda-precio`. El precio de la comida ya es de `tarifas`; el único número que Bocaos añade es el de reparto, y ése vive en `tarifa-pedido` (plaza).
- **Nota:** Ruta real: /home/admin/3enki/modules/pizzepos/tarifas (v3.2.0).

#### `tienda-api` · `PUENTE` · acción **ADAPTAR** · unidad **TIENDA**

- **Clases:** C01
- **Propósito:** El canal HTTP por el que entra un pedido de la tienda (la PWA de carta-digital hace POST aquí). YA EXISTE y ya crea el pedido, la cuenta y lo manda a cocina. Lo único que le falta a Bocaos: aceptar el bloque `entrega` (dirección + oferta de reparto del cliente) y devolver un estado podado.
- **A · ruta real:** `pizzepos/tienda-api` — se AÑADE, no se reescribe.
- **B · module.json:** `name: "tienda-api"` · `unidad: "tienda"` · `subscribes:` ["pedido.crear-tienda.response", "servicio.cambiado"] · `publishes:` ["tienda.pedido.recibido", "tienda.pedido.completado", "tienda.pedido.fallido"]
- **VERIFICACIÓN:** POST /tienda/pedido/:project con `entrega:{direccion, oferta_centimos}` → 201 y el pedido creado (comportamiento actual intacto). POST sin `entrega` → mismo 201 de siempre (pickup). Body con `entrega` incompleto → 400 INVALID_INPUT con el campo que falta, nunca 500.
- **QUÉ SE TOCA / POR QUÉ NO SE CONSTRUYE:** No se construye captura: existe. Se AÑADE (aditivo, sin tocar los campos actuales) el bloque `entrega` a `_validatePedidoBody` y el paso al bus. `modo_consumo` hoy sólo admite mesa · recoger · llevar: se AÑADE `domicilio` y ninguna de las tres cambia de comportamiento.
- **F · hechos que publica:** `tienda.pedido.recibido`, `tienda.pedido.completado`, `tienda.pedido.fallido`
- **Nota:** Ruta real: /home/admin/3enki/modules/pizzepos/tienda-api (v1.2.0). Superficie actual: POST /tienda/pedido/:project y GET /tienda/estado/:project.

#### `contrato-tramos` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** E06 · N02
- **Propósito:** El contrato de tramos con VIGENCIA (1 · 2 · 3): fijo mensual + céntimos por pedido, y a quién. El contratante de la tienda es la plaza, no el nacional.
- **Depende de:** `terminos-parte`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "contrato-tramos"` · `unidad: "plaza"` · `subscribes:` ["contrato-tramos.declarar.request", "contrato-tramos.vigente.request", "contrato-tramos.simular.request", "bocaos.acta_anotada", "bocaos.terminos_aceptados", "project.activated"] · `publishes:` ["contrato-tramos.declarar.response", "contrato-tramos.declarar.failed", "contrato-tramos.vigente.response", "contrato-tramos.vigente.failed", "contrato-tramos.simular.response", "contrato-tramos.simular.failed", "bocaos.tramos_actualizados"]
- **C · index.js:** `class ContratoTramos extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/contrato-tramos.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_declarar` (E06: tramo fijo + tramo por pedido, por parte. Sin antigüedad, sin exclusividad, sin cuota mínima (Q34/Q35).) · `_vigentes` (E06: los tramos que estaban vivos cuando ocurrió el hecho, no los de hoy (R5 del determinismo).) · `_simular` (N02: qué habría pasado con otros tramos sobre hechos cerrados.) · `_vigente` (op `vigente` del diseño (E06, N02).)
- **E · handler:** `onDeclarar(e)` → `_atender(e, 'declarar', 'contrato-tramos.declarar.response', d => this._declarar(d))` · **CLASE: ORDEN**
- **E · handler:** `onVigente(e)` → `_atender(e, 'vigente', 'contrato-tramos.vigente.response', d => this._vigente(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onSimular(e)` → `_atender(e, 'simular', 'contrato-tramos.simular.response', d => this._simular(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.tramos_actualizados`
- **VERIFICACIÓN:** Cambiar tramos no reescribe un cierre ya emitido. `liquidacion` pide los tramos DEL PERIODO, no los de hoy.
- **NO REUTILIZA / DECISIÓN:** En la v1, `tarifa-pedido` (E01,E02,E03,E07) y `contrato-tramos` (E06,N02) eran dos hojas con la segunda DESPUÉS de la primera, aunque E03 compone con los tramos. Aquí se corrige el orden: los tramos primero.

#### `frontera-plaza` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** S01 · S02
- **Propósito:** Hasta dónde llega la plaza y hasta dónde cada tienda: el filtro por cobertura que hace que «no existe la tienda que no llega» sea un hecho comprobable.
- **Depende de:** `censo-parte`, `config-mercado`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "frontera-plaza"` · `unidad: "plaza"` · `subscribes:` ["frontera-plaza.cubre.request", "frontera-plaza.zonas.request"] · `publishes:` ["frontera-plaza.cubre.response", "frontera-plaza.cubre.failed", "frontera-plaza.zonas.response", "frontera-plaza.zonas.failed"]
- **C · index.js:** `class FronteraPlaza extends ModuloHibridoReflejo` — SIN store y SIN `PosPersistencia`: no escribe nada. Todo lo que necesita lo pide al bus y el dato vuelve en la response.
- **D · proyecciones internas:** `_de` (S01: dirección → plaza_id | NO_CONSTA | AMBIGUA(plazas). Si dos coberturas se solapan y no hay desempate declarado, NO HAY PEDIDO (Q52).) · `_filtrar` (S02: intersección de la cobertura de la plaza (J03) y lo que cada tienda declara que reparte (D06).) · `_a_la_inversa` (S02: qué tiendas llegan aquí, para el escaparate.) · `_cubre` (op `cubre` del diseño (S01, S02).) · `_zonas` (op `zonas` del diseño (S01, S02).)
- **E · handler:** `onCubre(e)` → `_atender(e, 'cubre', 'frontera-plaza.cubre.response', d => this._cubre(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onZonas(e)` → `_atender(e, 'zonas', 'frontera-plaza.zonas.response', d => this._zonas(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.frontera_ambigua`, `bocaos.direccion_sin_plaza`
- **VERIFICACIÓN:** Dirección fuera de cobertura → `direccion_sin_plaza` y no hay pedido. Dos radios de plaza solapados sin desempate → AMBIGUA.
- **NO REUTILIZA / DECISIÓN:** S01/S02 son nuevas en la v2 (la v1 tenía un escaparate sin geografía). Se construyen aquí y no dentro de `indice-plaza` porque la respuesta 'no hay pedido' tiene que ser alcanzable ANTES de que exista pedido, y un escaparate no puede negar un pedido.

#### `indice-plaza` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** D07 · D08 · L02
- **Propósito:** El índice de la plaza: las tiendas que REPARTEN en la dirección consultada, en orden declarado y neutro. Sin ranking, sin destacados, sin posición comprada — y con la guarda de que el cliente de una tienda no aparece en otra.
- **Depende de:** `censo-parte`, `frontera-plaza`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "indice-plaza"` · `unidad: "plaza"` · `subscribes:` ["indice-plaza.indice.request", "indice-plaza.guarda.request"] · `publishes:` ["indice-plaza.indice.response", "indice-plaza.indice.failed", "indice-plaza.guarda.response", "indice-plaza.guarda.failed", "bocaos.indice_servido"]
- **C · index.js:** `class IndicePlaza extends ModuloHibridoReflejo` — SIN store y SIN `PosPersistencia`: no escribe nada. Todo lo que necesita lo pide al bus y el dato vuelve en la response.
- **D · proyecciones internas:** `_indice` (D07: proyección del censo, ya filtrada por cobertura. No se escribe, no guarda posiciones.) · `_neutro` (D08: orden declarado y neutro. Sin ranking, sin destacados, sin prioridad comprada. Filtrar no es ordenar: la guarda cubre las dos.) · `_marca_ajena` (K02: ninguna comunicación al cliente final lleva la marca de Bocaos ni la de la plaza. Se consulta en el camino caliente de `tienda-aviso-cliente`.) · `_guarda` (op `guarda` del diseño (D07, D08, L02).) · `_neutralidad` (D08: revisa el orden mostrado y FALLA si hay un solo campo que permita pagar por posición; filtrar no es ordenar.) · `_propiedad_cliente` (L02: cualquier consulta que cruce tiendas devuelve FALLA; también dentro de la misma plaza.)
- **E · handler:** `onIndice(e)` → `_atender(e, 'indice', 'indice-plaza.indice.response', d => this._indice(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onGuarda(e)` → `_atender(e, 'guarda', 'indice-plaza.guarda.response', d => this._guarda(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.indice_servido`
- **VERIFICACIÓN:** Pagar por posición → no hay campo donde ponerlo. Aviso con 'powered by Bocaos' → `marca_ajena_detectada` y el aviso no sale.
- **NO REUTILIZA / DECISIÓN:** K02 vive aquí y no en la tienda porque su forma es P en el diseño, y porque la marca que hay que ocultar es de la PLAZA y del NACIONAL: la tienda no puede vigilar una marca que no conoce. La tienda la invoca.

#### `pedido-mercado` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** C02 · C07
- **Propósito:** El pedido DEL MERCADO: nace del `pedido.creado` de pizzepos (mismo pedido_id), lleva el sello plaza_id, la tabla cerrada de estados del reparto y la cancelación con quién y hasta cuándo. NO guarda líneas, ni importe de comida, ni estado de cocina, ni pago: eso es de la tienda y llega por evento.
- **Depende de:** `censo-parte`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "pedido-mercado"` · `unidad: "plaza"` · `subscribes:` ["pedido.creado", "pedido.cancelado", "pedido-mercado.aceptar.request", "pedido-mercado.rechazar.request", "pedido-mercado.cancelar.request", "pedido-mercado.de.request", "bocaos.contrato_cerrado", "bocaos.hecho_reparto_anotado", "project.activated"] · `publishes:` ["pedido-mercado.aceptar.response", "pedido-mercado.aceptar.failed", "pedido-mercado.rechazar.response", "pedido-mercado.rechazar.failed", "pedido-mercado.cancelar.response", "pedido-mercado.cancelar.failed", "pedido-mercado.de.response", "pedido-mercado.de.failed", "bocaos.pedido_creado", "bocaos.pedido_aceptado", "bocaos.pedido_rechazado", "bocaos.pedido_cancelado"]
- **C · index.js:** `class PedidoMercado extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/pedido-mercado.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_crear` (C02: el pedido nace con precio congelado y plaza_id; sin precio no nace.) · `_transitar` (C02: RECIBIDO → ACEPTADO (la tienda acepta, Q27) → LISTO (C04) → EN_REPARTO (contrato) → ENTREGADO (prueba o su falta declarada).) · `_cancelacion` (C07: tabla de quién y hasta cuándo. Quién paga el rechazo es Q36: mientras no haya respuesta se anota y NO SE COBRA a nadie.) · `_aceptar` (op `aceptar` del diseño (C02, C07).) · `_rechazar` (op `rechazar` del diseño (C02, C07).) · `_cancelar` (op `cancelar` del diseño (C02, C07).) · `_de` (op `de` del diseño (C02, C07).) · `_pedido_mercado` (`_nacer` (C02: al consumir `pedido.creado` de pizzepos toma pedido_id · project_slug · total_centimos · items_count) · `_puede_cancelar` (C07: quién y hasta cuándo; mientras no haya respuesta se anota la cancelación y NO se cobra a nadie.)
- **E · handler:** `onAceptar(e)` → `_atender(e, 'aceptar', 'pedido-mercado.aceptar.response', d => this._aceptar(d))` · **CLASE: ORDEN**
- **E · handler:** `onRechazar(e)` → `_atender(e, 'rechazar', 'pedido-mercado.rechazar.response', d => this._rechazar(d))` · **CLASE: ORDEN**
- **E · handler:** `onCancelar(e)` → `_atender(e, 'cancelar', 'pedido-mercado.cancelar.response', d => this._cancelar(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'pedido-mercado.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.pedido_creado`, `bocaos.pedido_aceptado`, `bocaos.pedido_rechazado`, `bocaos.pedido_cancelado`
- **VERIFICACIÓN:** LISTO sin `pedido_aceptado` → TRANSICIÓN_NO_PERMITIDA. ENTREGADO sin prueba ni falta declarada → imposible. Nacional intenta leerlo → no hay ruta.
- **NO REUTILIZA / DECISIÓN:** `pizzepos/pedidos` es el pedido del POS (cuenta, items en pasos, cocina). Este necesita tres cosas que no tiene: precio congelado al nacer, aceptación de la tienda y estado podado. Se construye; el id del pedido de la tienda es la clave de unión.

#### `aviso-cliente` · `PUENTE` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** C05 · C06 · K02
- **Propósito:** El único canal de Bocaos hacia el cliente final: avisos de estado podado por el canal DE LA TIENDA, sin una sola marca de Bocaos. Es el puerto más delicado del negocio.
- **Depende de:** `pedido-mercado`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "aviso-cliente"` · `unidad: "tienda"` · `subscribes:` ["bocaos.pedido_creado", "bocaos.pedido_aceptado", "bocaos.contrato_creado", "bocaos.pedido_listo", "bocaos.hecho_reparto_anotado", "aviso-cliente.componer.request"] · `publishes:` ["whatsapp.mensaje.enviado", "whatsapp.envio.fallido", "bocaos.cliente_avisado", "bocaos.aviso_rechazado"]
- **C · index.js:** `class AvisoCliente extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_componer` (op `componer` del diseño (C05, C06, K02).) · `_podar` (C05: cuatro estados para el cliente — recibido · en cocina · en camino · entregado. No ve «en cola», ni «sin rider», ni «esperando propuesta».)
- **E · handler:** `onComponer(e)` → `_atender(e, 'componer', 'aviso-cliente.componer.response', d => this._componer(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.cliente_avisado`, `bocaos.aviso_rechazado`
- **VERIFICACIÓN:** Pedido con rider aceptado → mensaje al cliente por el WhatsApp del proyecto-tienda. Texto con «Bocaos» o con el nombre de la plaza → `bocaos.aviso_rechazado` y NO se envía (K02). Sin ventana de 24 h y sin plantilla aprobada → `whatsapp.envio.fallido` visible.
- **NO REUTILIZA / DECISIÓN:** No se reutiliza el aviso de `whatsapp-bot` para esto: su handler de `cocina.pedido_listo` compone «pasa a recogerlo» (pickup) y sólo conoce pedidos que él mismo vio nacer. Se reutilizan sus TOOLS (`whatsapp.enviar`, `whatsapp.enviar_plantilla`) y su par honesto, no su copy.

#### `aviso-tienda` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** C03 · K01
- **Propósito:** Avisa a la tienda por SU canal (telegram-service): pedido recibido, rider asignado, caso devuelto. Avisa, no decide: no acepta por ella ni arranca su cocina. Y si una reclamación del cliente final llega a Bocaos, se DEVUELVE a la tienda con su hora.
- **Depende de:** `pedido-mercado`, `censo-parte`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "aviso-tienda"` · `unidad: "plaza"` · `subscribes:` ["bocaos.pedido_creado", "bocaos.contrato_creado", "bocaos.hueco_nombrado", "aviso-tienda.devolver.request"] · `publishes:` ["telegram.send_message.request", "aviso-tienda.enviado", "aviso-tienda.fallido", "bocaos.reclamacion_devuelta"]
- **C · index.js:** `class AvisoTienda extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_avisar` (C03: al canal de la tienda (su POS, su impresora, su pantalla). Si el aviso no llega, el pedido existe igual.) · `_sin_orden` (C03: no acepta, no arranca la cocina, no compromete hora. Si pudiera, la plaza estaría operando el restaurante.) · `_devolver` (op `devolver` del diseño (C03, K01).)
- **E · handler:** `onDevolver(e)` → `_atender(e, 'devolver', 'aviso-tienda.devolver.response', d => this._devolver(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `aviso-tienda.enviado`, `aviso-tienda.fallido`, `bocaos.reclamacion_devuelta`
- **VERIFICACIÓN:** Pedido creado → mensaje al chat de la tienda (`telegram.send_message.request`, el mismo que usa `reporte-caja`). Sin chat configurado → `aviso-tienda.fallido` y el pedido sigue vivo (el aviso es transporte, no verdad).
- **NO REUTILIZA / DECISIÓN:** No se usa `notificador-pedidos` de pizzepos: sólo escucha `pedido.creado` y no sabe de contratos ni de huecos; se usa el MISMO transporte que él (`telegram.send_message.request`), que es lo que hay.

#### `hecho-listo` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A01
- **Propósito:** El hecho de listo con el dato DENTRO (precio, destino, instrucciones, hora): una sola vez, con el sello de la plaza y desmentible con una segunda hora que deja las dos.
- **Estado:** ya en disco (v0.1.0), sin cambios: su entrada `bocaos.listo_declarado` la emite ahora `entrada-listo`
- **Depende de:** `pedido-mercado`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "hecho-listo"` · `unidad: "plaza"` · `subscribes:` ["hecho-listo.anotar.request", "hecho-listo.desmentir.request", "hecho-listo.de.request", "bocaos.listo_declarado", "project.activated"] · `publishes:` ["hecho-listo.anotar.response", "hecho-listo.anotar.failed", "hecho-listo.desmentir.response", "hecho-listo.desmentir.failed", "hecho-listo.de.response", "hecho-listo.de.failed", "bocaos.pedido_listo", "bocaos.hecho_desmentido"]
- **C · index.js:** `class HechoListo extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/hecho-listo.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_anotar` (A01: exige precio_congelado; sin él no hay hecho y el pedido espera nombrando el hueco (A34).) · `_sello` (A01: el plaza_id lo pone la plaza al anotar. La tienda no puede declarar un pedido de otra plaza.) · `_desmentir` (A01: hecho nuevo que desmiente al anterior; las dos horas quedan y el pedido se vuelve a medir.) · `_de` (op `de` del diseño (A01).)
- **E · handler:** `onAnotar(e)` → `_atender(e, 'anotar', 'hecho-listo.anotar.response', d => this._anotar(d))` · **CLASE: ORDEN**
- **E · handler:** `onDesmentir(e)` → `_atender(e, 'desmentir', 'hecho-listo.desmentir.response', d => this._desmentir(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'hecho-listo.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.pedido_listo`, `bocaos.hecho_desmentido`
- **VERIFICACIÓN:** Declaración sin precio → no hay hecho, hay hueco nombrado. Desmentir deja dos horas y el pedido se remide; no se borra ninguna.
- **NO REUTILIZA / DECISIÓN:** SE PARTIÓ DE `hora-listo` (v1). C04 es de la tienda y A01 de la plaza: en la v1 eran una hoja porque el mercado era uno y la tienda no tenía despliegue propio. Ahora son dos escritores y dos sitios.

#### `instrucciones-acceso` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** F05
- **Propósito:** Cómo se entra a cada destino: portal, código, ascensor, «llamar al 3º». Se muestran al rider con contrato vivo y a nadie más.
- **Depende de:** `pedido-mercado`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "instrucciones-acceso"` · `unidad: "plaza"` · `subscribes:` ["instrucciones-acceso.anotar.request", "instrucciones-acceso.de.request", "bocaos.contrato_cerrado", "project.activated"] · `publishes:` ["instrucciones-acceso.anotar.response", "instrucciones-acceso.anotar.failed", "instrucciones-acceso.de.response", "instrucciones-acceso.de.failed", "bocaos.instrucciones_anotadas"]
- **C · index.js:** `class InstruccionesAcceso extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/instrucciones-acceso.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_escribir` (F05: texto del cliente para un pedido. Dato personal del cliente DEL cliente: no entra en ningún agregado.) · `_mostrar` (F05: sólo al rider del contrato vivo, sólo mientras el contrato está vivo. Sin contrato → NO_HAY.) · `_anotar` (op `anotar` del diseño (F05).) · `_de` (op `de` del diseño (F05).)
- **E · handler:** `onAnotar(e)` → `_atender(e, 'anotar', 'instrucciones-acceso.anotar.response', d => this._anotar(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'instrucciones-acceso.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.instrucciones_anotadas`
- **VERIFICACIÓN:** Contrato cerrado → `mostrar` devuelve NO_HAY. Rider distinto del contrato → 403.
- **NO REUTILIZA / DECISIÓN:** El dato es del cliente pero lo custodia la plaza porque quien lo necesita es el rider del contrato, y el contrato es de la plaza. En la tienda no puede estar: la tienda no sabe quién reparte.

#### `tarifa-pedido` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** E01 · E02 · E03 · E07
- **Propósito:** Los cuatro números del pedido: la oferta del cliente (congelada al nacer), el incentivo que sube la tienda, el precio que sólo SUMA y la subida con autor. Un único escritor o hay carrera.
- **Depende de:** `pedido-mercado`, `contrato-tramos`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "tarifa-pedido"` · `unidad: "plaza"` · `subscribes:` ["pedido.creado", "tarifa-pedido.oferta.request", "tarifa-pedido.incentivo.request", "tarifa-pedido.subir.request", "tarifa-pedido.de.request", "project.activated"] · `publishes:` ["tarifa-pedido.oferta.response", "tarifa-pedido.oferta.failed", "tarifa-pedido.incentivo.response", "tarifa-pedido.incentivo.failed", "tarifa-pedido.subir.response", "tarifa-pedido.subir.failed", "tarifa-pedido.de.response", "tarifa-pedido.de.failed", "bocaos.precio_cerrado", "bocaos.oferta_subida"]
- **C · index.js:** `class TarifaPedido extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/tarifa-pedido.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_estipular` (E01: lo que el cliente pone por el reparto, congelado con el pedido. Ni la tienda ni la sala ni Bocaos lo tocan.) · `_componer` (E03: oferta + incentivo (E02, de la tienda) + tramos vigentes → céntimos y desglose. Lo lee A11 ya compuesto; no se recalcula dentro del enlace.) · `_subir` (E07: subida con tope autorizado por el cliente (Q43). Quién paga el escalón es Q17: se anota el acto y la deuda queda visible, no cobrada.) · `_no_baja` (E07: nunca por debajo de lo ya ofrecido a un rider con propuesta viva.) · `_oferta` (op `oferta` del diseño (E01, E02, E03, E07).) · `_incentivo` (op `incentivo` del diseño (E01, E02, E03, E07).) · `_de` (op `de` del diseño (E01, E02, E03, E07).) · `_congelar_al_nacer` (E01: escucha `pedido.creado` de pizzepos y congela `entrega.oferta_centimos` con la hora; después NADIE la toca, ni la tienda, ni la sala, ni Bocaos.) · `_precio` (E03: sólo suma oferta + incentivo. Es la entrada de `cobra` (A11): sin este número cerrado no hay propuesta.)
- **E · handler:** `onOferta(e)` → `_atender(e, 'oferta', 'tarifa-pedido.oferta.response', d => this._oferta(d))` · **CLASE: ORDEN**
- **E · handler:** `onIncentivo(e)` → `_atender(e, 'incentivo', 'tarifa-pedido.incentivo.response', d => this._incentivo(d))` · **CLASE: ORDEN**
- **E · handler:** `onSubir(e)` → `_atender(e, 'subir', 'tarifa-pedido.subir.response', d => this._subir(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'tarifa-pedido.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.precio_cerrado`, `bocaos.oferta_subida`
- **VERIFICACIÓN:** Pedido sin oferta → sin precio y sin propuesta (hueco nombrado). Subida por encima del tope → 409. Subida sin autor humano → 403.
- **NO REUTILIZA / DECISIÓN:** CAMBIÓ RESPECTO A LA v1: E02 ya no está aquí (es de la tienda). La hoja pierde una clase y gana un `subscribes` al hecho del incentivo. Ese es el precio de que el incentivo sea de quien lo paga.

#### `entrada-listo` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** — (sin clase propia: materializa un paso del flujo)
- **Propósito:** La puerta del mercado: cuando pizzepos dice que el pedido está listo, este puente compone el AvisoPedidoListo (pedido · tienda · destino · hora · precio · plaza_id) y lo PIDE a `hecho-listo`. Es el único punto donde Bocaos escucha a la tienda.
- **Depende de:** `pedido-mercado`, `tarifa-pedido`, `hecho-listo`, `censo-parte`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "entrada-listo"` · `unidad: "plaza"` · `subscribes:` ["cocina.pedido_listo", "entrada-listo.reintentar.request"] · `publishes:` ["entrada-listo.componer.response", "entrada-listo.componer.failed", "bocaos.listo_declarado"]
- **C · index.js:** `class EntradaListo extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_reintentar` (op `reintentar` del diseño (raíz).) · `_componer` (C04 → A01: pide `pedido.get` a pizzepos (dirección, instrucciones, total) y `tarifa-pedido.de` (precio de reparto). Si falta destino o precio, NO inventa: emite `bocaos.hueco_nombrado` con el dato que falta (A34) y el pedido NO entra al enlace.)
- **E · handler:** `onReintentar(e)` → `_atender(e, 'reintentar', 'entrada-listo.reintentar.response', d => this._reintentar(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.listo_declarado`
- **VERIFICACIÓN:** Marcar listo en la cocina de pizzepos → `cocina.pedido_listo` → `bocaos.listo_declarado` con precio y destino dentro → `bocaos.pedido_listo` de `hecho-listo`. Reintentar con el pedido inexistente en la plaza → `entrada-listo.componer.failed` con motivo (nunca silencio).
- **NO REUTILIZA / DECISIÓN:** No se construye un módulo que «observe» la cocina: se engancha su evento real. No se escribe en la tienda: se lee su pedido por RPC (`pedido.get`) y se pide el hecho al custodio de la plaza.
- **Nota:** Sin clase propia: materializa el paso ① del §7.1 (C04 lo escribe la tienda; A01 lo guarda).

### ▸ PELDAÑO 6 · el corazón

#### `foto-mercado` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A02 · A03 · A04
- **Propósito:** La foto congelada del instante con su huella, y los candidatos que pasan el censo sin puntuar. No guarda copia: pide estado, ruta y política por el bus.
- **Estado:** ya en disco (v0.1.0)
- **Depende de:** `estado-parte`, `ruta-viva`, `config-mercado`, `frontera-plaza`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "foto-mercado"` · `unidad: "plaza"` · `subscribes:` ["foto-mercado.componer.request", "foto-mercado.elegibles.request", "foto-mercado.reproducir.request"] · `publishes:` ["foto-mercado.componer.response", "foto-mercado.componer.failed", "foto-mercado.elegibles.response", "foto-mercado.elegibles.failed", "foto-mercado.reproducir.response", "foto-mercado.reproducir.failed", "bocaos.foto_congelada"]
- **C · index.js:** `class FotoMercado extends ModuloHibridoReflejo` — SIN store y SIN `PosPersistencia`: no escribe nada. Todo lo que necesita lo pide al bus y el dato vuelve en la response.
- **D · proyecciones internas:** `_componer` (A02: riders ← I04 · posición ← B01 · paradas ← B02 · promesas ← B03 · capacidad ← B05 · local ← L03 · política ← J04 (DOS CAPAS).) · `_congelar` (A03: la foto se congela con huella. Dentro de F nadie lee el mundo: si leyera, la explicación dejaría de ser cierta.) · `_elegibles` (A04: estado, zona y capacidad. El que tiene un dato ausente ENTRA con su lista de faltantes: descartar es decidir.) · `_reproducir` (op `reproducir` del diseño (A02, A03, A04).)
- **E · handler:** `onComponer(e)` → `_atender(e, 'componer', 'foto-mercado.componer.response', d => this._componer(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onElegibles(e)` → `_atender(e, 'elegibles', 'foto-mercado.elegibles.response', d => this._elegibles(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onReproducir(e)` → `_atender(e, 'reproducir', 'foto-mercado.reproducir.response', d => this._reproducir(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.foto_congelada`
- **VERIFICACIÓN:** Dos composiciones en el mismo instante dan la misma huella. Rider de otra plaza → no aparece. Rider sin puntualidad → entra con hueco nombrado.
- **NO REUTILIZA / DECISIÓN:** `metricas` mide el bus; esto compone un mundo. `interfaz` es la superficie del radar de nichos. Ninguno sirve.

#### `propuesta` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A13 · A14 · A15 · A19 · A27 · A29 · A33 · M05
- **Propósito:** La propuesta y su único desenlace: aceptada, rechazada o caducada. Una viva por pedido, con ventana, con bloqueo y con la vista inmutable que el rider lee.
- **Estado:** ya en disco (v0.1.0)
- **Depende de:** `foto-mercado`, `config-mercado`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "propuesta"` · `unidad: "plaza"` · `subscribes:` ["propuesta.emitir.request", "propuesta.acuse.request", "propuesta.aceptar.request", "propuesta.rechazar.request", "propuesta.cerrar.request", "propuesta.de.request", "bocaos.propuesta_entregada", "bocaos.propuesta_no_entregada", "project.activated"] · `publishes:` ["propuesta.emitir.response", "propuesta.emitir.failed", "propuesta.acuse.response", "propuesta.acuse.failed", "propuesta.aceptar.response", "propuesta.aceptar.failed", "propuesta.rechazar.response", "propuesta.rechazar.failed", "propuesta.cerrar.response", "propuesta.cerrar.failed", "propuesta.de.response", "propuesta.de.failed", "bocaos.propuesta_emitida", "bocaos.propuesta_acusada", "bocaos.propuesta_aceptada", "bocaos.propuesta_rechazada", "bocaos.propuesta_caducada_sin_acuse", "bocaos.propuesta_caducada_sin_respuesta"]
- **C · index.js:** `class Propuesta extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/propuesta.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_emitir` (A13: una viva por pedido (A33). Lleva dentro la foto con su huella, la política con su CAPA y su autor, y los cuatro números.) · `_bloqueo` (A14: el bloqueo por pedido es lo que hace que gane el primero, no el preferido. Un desenlace por propuesta; el segundo recibe YA_NO_ESTA y no paga nada.) · `_ventana` (A15: validez 20 s · acuse ≤5 s · decisión 10 s (Q42). Dos relojes, dos caducidades distintas.) · `_aceptar` (A19: un solo sí, atómico, con hora. Nunca una asignación: la aceptación la produce el rider.) · `_vista` (M05: los cuatro números SIEMPRE en el mismo orden + la frase + de qué plaza + qué umbrales (capa y autor) le juzgaron.) · `_reproducir` (A29: misma foto + misma política → misma propuesta. Devuelve el mismo resultado o falla.) · `_sin_asignacion` (A27: no hay camino de pedido a rider sin aceptación libre. Falla si alguien lo abre.) · `_acuse` (op `acuse` del diseño (A13, A14, A15, A19, A27, A29, A33, M05).) · `_rechazar` (op `rechazar` del diseño (A13, A14, A15, A19, A27, A29, A33, M05).) · `_cerrar` (op `cerrar` del diseño (A13, A14, A15, A19, A27, A29, A33, M05).) · `_de` (op `de` del diseño (A13, A14, A15, A19, A27, A29, A33, M05).)
- **E · handler:** `onEmitir(e)` → `_atender(e, 'emitir', 'propuesta.emitir.response', d => this._emitir(d))` · **CLASE: ORDEN**
- **E · handler:** `onAcuse(e)` → `_atender(e, 'acuse', 'propuesta.acuse.response', d => this._acuse(d))` · **CLASE: ORDEN**
- **E · handler:** `onAceptar(e)` → `_atender(e, 'aceptar', 'propuesta.aceptar.response', d => this._aceptar(d))` · **CLASE: ORDEN**
- **E · handler:** `onRechazar(e)` → `_atender(e, 'rechazar', 'propuesta.rechazar.response', d => this._rechazar(d))` · **CLASE: ORDEN**
- **E · handler:** `onCerrar(e)` → `_atender(e, 'cerrar', 'propuesta.cerrar.response', d => this._cerrar(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'propuesta.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.propuesta_emitida`, `bocaos.propuesta_acusada`, `bocaos.propuesta_aceptada`, `bocaos.propuesta_rechazada`, `bocaos.propuesta_caducada_sin_acuse`, `bocaos.propuesta_caducada_sin_respuesta`
- **VERIFICACIÓN:** Dos propuestas vivas del mismo pedido → imposible (A33). Dos síes → el segundo YA_NO_ESTA sin coste. Reproducir una propuesta vieja da el mismo número.
- **NO REUTILIZA / DECISIÓN:** CUATRO CLASES DEL DISEÑO, UN CUSTODIO. A13/A14/A15/A19 escriben la misma propuesta: emitirla, abrir su reloj, cerrarla y aceptarla. Cuatro hojas serían cuatro escritores y la carrera que A14 impide.

#### `canal-rider` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** M04
- **Propósito:** Por donde le llega la propuesta al rider, en menos de la ventana, con ACUSE obligatorio y retirada: el único puerto con latencia crítica del sistema.
- **Depende de:** `propuesta`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "canal-rider"` · `unidad: "plaza"` · `subscribes:` ["bocaos.propuesta_emitida", "telegram.callback.received", "whatsapp.mensaje.recibido", "canal-rider.retirar.request"] · `publishes:` ["telegram.send_message.request", "whatsapp.mensaje.enviado", "whatsapp.envio.fallido", "bocaos.propuesta_entregada", "bocaos.propuesta_no_entregada"]
- **C · index.js:** `class CanalRider extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_entregar` (M04: mensaje con los cuatro números, la frase, de qué plaza y qué umbrales. Retirada a los 5 s si no hay acuse.) · `_acuse` (M04: el callback es el acuse, el sí o el no. Sin acuse, CADUCADA_SIN_ACUSE: el canal falló, no el rider.) · `_sin_asignar` (M04: entrega una propuesta a UN rider. Nunca dos a la vez por el mismo pedido.) · `_retirar` (op `retirar` del diseño (M04).)
- **E · handler:** `onRetirar(e)` → `_atender(e, 'retirar', 'canal-rider.retirar.response', d => this._retirar(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.propuesta_entregada`, `bocaos.propuesta_no_entregada`
- **VERIFICACIÓN:** Propuesta emitida → mensaje con los cuatro números y la hora de vencimiento; acuse en < ventana → `bocaos.propuesta_acusada`; sin acuse → `bocaos.propuesta_no_entregada` (dos relojes distintos: «no llegó» ≠ «no contestó»). Retirada a los 5 s del desenlace.
- **NO REUTILIZA / DECISIÓN:** NO se adapta `telegram-bridge`: su diseño IGNORA `telegram.callback.received` a propósito («no son mensajes conversacionales»), así que el sí/no del rider nunca llegaría. Se usa `telegram-service` (publica `telegram.callback.received` y acepta `telegram.send_message.request`) o `whatsapp-bot` interactivo, ambos reales.

#### `contrato-puntual` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A24
- **Propósito:** El contrato de un pedido con un rider: sin turno, sin jornada, sin duración. Nace de la aceptación libre y cierra con el hecho de entrega.
- **Estado:** ya en disco (v0.1.0)
- **Depende de:** `propuesta`, `pedido-mercado`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "contrato-puntual"` · `unidad: "plaza"` · `subscribes:` ["contrato-puntual.crear.request", "contrato-puntual.de.request", "contrato-puntual.cerrar.request", "bocaos.propuesta_aceptada", "bocaos.hecho_reparto_anotado", "project.activated"] · `publishes:` ["contrato-puntual.crear.response", "contrato-puntual.crear.failed", "contrato-puntual.de.response", "contrato-puntual.de.failed", "contrato-puntual.cerrar.response", "contrato-puntual.cerrar.failed", "bocaos.contrato_creado", "bocaos.contrato_cerrado"]
- **C · index.js:** `class ContratoPuntual extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/contrato-puntual.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_crear` (A24: sólo desde una aceptación con acuse. Sin aceptación no hay constructor: la asignación no existe.) · `_cerrar` (A24: con el hecho de entrega. La parada desaparece de B02 y deja de proyectarse.) · `_sin_duracion` (A24: no tiene turno ni jornada. Si tuviera duración, el negocio sería otro (inspección de trabajo).) · `_de` (op `de` del diseño (A24).)
- **E · handler:** `onCrear(e)` → `_atender(e, 'crear', 'contrato-puntual.crear.response', d => this._crear(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'contrato-puntual.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onCerrar(e)` → `_atender(e, 'cerrar', 'contrato-puntual.cerrar.response', d => this._cerrar(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.contrato_creado`, `bocaos.contrato_cerrado`
- **VERIFICACIÓN:** Crear contrato sin aceptación → 409 (no hay camino de pedido a rider sin aceptación libre). Contrato con `turno` → 422.
- **NO REUTILIZA / DECISIÓN:** Sin cambios de unidad. Se adelanta en el orden respecto a `propuesta` porque la propuesta lo invoca al aceptar y la ruta viva lo lee para derivar paradas.

### ▸ PELDAÑO 7 · el reparto y la prueba

#### `chat-enmascarado` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** F04
- **Propósito:** Rider ↔ cliente con alias por contrato y sin números de teléfono. Cero agregados sobre conversaciones: el canal no se guarda.
- **Depende de:** `contrato-puntual`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "chat-enmascarado"` · `unidad: "plaza"` · `subscribes:` ["bocaos.contrato_creado", "chat-enmascarado.entregar.request"] · `publishes:` ["bocaos.mensaje_entregado", "bocaos.mensaje_rechazado"]
- **C · index.js:** `class ChatEnmascarado extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_enmascarar` (F04: alias por contrato, no por persona. Al cerrar el contrato, el alias muere.) · `_sin_agregados` (F04: cero metadatos sobre la conversación (art. 15 de la Directiva). No hay histórico legible por nadie.) · `_entregar` (op `entregar` del diseño (F04).)
- **E · handler:** `onEntregar(e)` → `_atender(e, 'entregar', 'chat-enmascarado.entregar.response', d => this._entregar(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.mensaje_entregado`, `bocaos.mensaje_rechazado`
- **VERIFICACIÓN:** Contrato cerrado → el alias no resuelve. El mensaje no deja copia en ningún otro módulo.
- **NO REUTILIZA / DECISIÓN:** `chat-p2p` es chat entre proyectos sobre el circuito de conversación, con allowlist. Aquí es rider↔cliente con enmascarado y cero agregados: no encaja.

#### `hechos-reparto` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** F01 · F02 · F03
- **Propósito:** Los hechos del reparto append-only, con hora, con prueba o con su falta DECLARADA, y el acta con sus relojes. Sin hora no hay hecho.
- **Estado:** ya en disco (v0.1.0)
- **Depende de:** `contrato-puntual`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "hechos-reparto"` · `unidad: "plaza"` · `subscribes:` ["hechos-reparto.anotar.request", "hechos-reparto.prueba.request", "hechos-reparto.acta.request", "bocaos.contrato_creado", "bocaos.pedido_listo", "project.activated"] · `publishes:` ["hechos-reparto.anotar.response", "hechos-reparto.anotar.failed", "hechos-reparto.prueba.response", "hechos-reparto.prueba.failed", "hechos-reparto.acta.response", "hechos-reparto.acta.failed", "bocaos.hecho_reparto_anotado", "bocaos.prueba_anotada", "bocaos.acta_incompleta"]
- **C · index.js:** `class HechosReparto extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/hechos-reparto.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_anotar` (F01: hecho con hora y autor. Sin hora no es un hecho, es una impresión.) · `_prueba` (F02: foto, firma o código; si no hay prueba, se anota la FALTA — que es un hecho distinto de no tener nada.) · `_acta` (F01: compone el acta de un reparto; si falta un hecho, devuelve INCOMPLETA con el nombre del que falta (Q30: la prueba es el evento).)
- **E · handler:** `onAnotar(e)` → `_atender(e, 'anotar', 'hechos-reparto.anotar.response', d => this._anotar(d))` · **CLASE: ORDEN**
- **E · handler:** `onPrueba(e)` → `_atender(e, 'prueba', 'hechos-reparto.prueba.response', d => this._prueba(d))` · **CLASE: ORDEN**
- **E · handler:** `onActa(e)` → `_atender(e, 'acta', 'hechos-reparto.acta.response', d => this._acta(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.hecho_reparto_anotado`, `bocaos.prueba_anotada`, `bocaos.acta_incompleta`
- **VERIFICACIÓN:** Reparto sin prueba → acta INCOMPLETA y `regla-fallo` no puede adjudicar. Un hecho no se edita: se añade otro que lo desmiente.
- **NO REUTILIZA / DECISIÓN:** `historial` (taller 3D) es append-only de impresiones, con otra clave y otro dominio. Se toma el patrón.

### ▸ PELDAÑO 5 · el histórico del local

#### `medida-cocina` · `REFLEJO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** L03
- **Propósito:** La puntualidad DECLARADA de una cocina: la distribución de hora-de-listo frente a lo prometido, publicada ANTES de que el rider acepte y usada por A08 para medir su espera. Una distribución, no una nota.
- **Depende de:** `hecho-listo`, `hechos-reparto`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "medida-cocina"` · `unidad: "tienda"` · `subscribes:` ["medida-cocina.medir.request", "medida-cocina.historial.request"] · `publishes:` ["medida-cocina.medir.response", "medida-cocina.medir.failed", "medida-cocina.historial.response", "medida-cocina.historial.failed"]
- **C · index.js:** `class MedidaCocina extends ModuloHibridoReflejo` — SIN store y SIN `PosPersistencia`: no escribe nada. Todo lo que necesita lo pide al bus y el dato vuelve en la response.
- **D · proyecciones internas:** `_medir` (L03: distribución de hora-de-listo frente a lo prometido, por franja, con n. Sin datos suficientes → NO_CONSTA.) · `_no_nota` (L03: ni estrellas ni 3 sobre 5. Una nota es un juicio; una distribución es información.) · `_historial` (op `historial` del diseño (L03).)
- **E · handler:** `onMedir(e)` → `_atender(e, 'medir', 'medida-cocina.medir.response', d => this._medir(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onHistorial(e)` → `_atender(e, 'historial', 'medida-cocina.historial.response', d => this._historial(d))` · **CLASE: PREGUNTA**
- **VERIFICACIÓN:** Tienda nueva → NO_CONSTA y el rider ve 'sin histórico'. La plaza pide la distribución de otra tienda → 403.
- **NO REUTILIZA / DECISIÓN:** A02 (plaza) LE PIDE ESTE NÚMERO A LA TIENDA. Es la única lectura plaza→tienda que el diseño permite y está escrita en A02: la plaza lee lo que la tienda PUBLICA, nunca su carta, su carrito ni sus clientes.

#### `panel-tienda` · `REFLEJO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** L01
- **Propósito:** Lo que la tienda ve: espera medida, puntualidad, propuestas recibidas, pedidos sin repartidor y QUÉ UMBRALES está aplicando ella misma. La misma información que ve el rider, sin versión amable.
- **Depende de:** `medida-cocina`, `frontera-plaza`, `config-mercado`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "panel-tienda"` · `unidad: "tienda"` · `subscribes:` ["panel-tienda.ver.request"] · `publishes:` ["panel-tienda.ver.response", "panel-tienda.ver.failed"]
- **C · index.js:** `class PanelTienda extends ModuloHibridoReflejo` — SIN store y SIN `PosPersistencia`: no escribe nada. Todo lo que necesita lo pide al bus y el dato vuelve en la response.
- **D · proyecciones internas:** `_ver` (L01: lee de `medida-cocina` (L03), de la plaza (propuestas, pedidos sin rider) y de `config-mercado` (qué capa de umbrales rige).) · `_sin_version_amable` (L01: un solo número. Si hubiera una versión para el que paga y otra para el que sufre, el mercado dejaría de corregir.)
- **E · handler:** `onVer(e)` → `_atender(e, 'ver', 'panel-tienda.ver.response', d => this._ver(d))` · **CLASE: PREGUNTA**
- **VERIFICACIÓN:** El número de espera del panel == el que vio el rider (misma fuente). Tienda sin histórico → 'sin histórico', no 0.
- **NO REUTILIZA / DECISIÓN:** `dashboard` es observabilidad del bus (logs, métricas de cores). Este panel es del negocio: espera, puntualidad, propuestas. No se toca `dashboard`.

### ▸ (vuelve al PELDAÑO 6 · el corazón — el orden manda)

#### `enlace` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A05 · A06 · A07 · A08 · A09 · A10 · A11 · A12 · A16 · A17 · A20 · A21 · A22 · A23 · A25 · A28 · A30 · A31 · A34 · A35
- **Propósito:** El cuello: mide desvío, espera, retraso y cobra sobre una foto congelada y propone a UN rider o nombra el hueco. Cuatro comparaciones en AND, cero IA, cero pesos, cero barrido de pedidos.
- **Estado:** ya en disco (v0.1.0)
- **Depende de:** `foto-mercado`, `propuesta`, `canal-rider`, `medida-cocina`, `tarifa-pedido`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "enlace"` · `unidad: "plaza"` · `subscribes:` ["enlace.ejecutar.request", "bocaos.pedido_listo", "bocaos.hecho_desmentido", "bocaos.propuesta_rechazada", "bocaos.propuesta_caducada_sin_respuesta", "bocaos.escalada_reintentar"] · `publishes:` ["enlace.ejecutar.response", "enlace.ejecutar.failed", "bocaos.medidas_calculadas", "bocaos.hueco_nombrado", "bocaos.enlace_completado", "bocaos.enlace_agotado"]
- **C · index.js:** `class Enlace extends ModuloHibridoReflejo` — SIN store y SIN `PosPersistencia`: no escribe nada. Todo lo que necesita lo pide al bus y el dato vuelve en la response.
- **D · proyecciones internas:** `_ruta_base` (A05: ruta del rider a la tienda, con el puerto Ruta.) · `_con_parada` (A06: inserta una parada de OTRA tienda si y sólo si plaza_id(parada)==plaza_id(pedido)==plaza_id(rider) → A35.) · `_desvio` (A07: metros de más por pasar por el local.) · `_espera` (A08: minutos que esperaría si llega antes de que esté listo; si llega después, 0 y la espera es un hecho del reparto.) · `_retraso` (A09: minutos que añade a las paradas que ya lleva. _agregado (A10): suma por parada, con tope.) · `_cobra` (A11: lee el precio YA compuesto (E03) y el coste declarado del rider. Sin coste → neto NO_CONSTA y el candidato va a A34.) · `_pasa` (A12: desvío < umbral ∧ espera < umbral ∧ retraso < umbral ∧ cobra > 0. Una tabla AND sobre la política de la tienda o de la plaza.) · `_razones` (A16: conjunto CERRADO de razones, con la capa y el autor del umbral que juzgó.) · `_frase` (A17: la frase derivada del conjunto cerrado. Funciona cuando el agente (A18) se cae: el adorno no es el mínimo legal.) · `_hora_aceptacion` (A20: la hora del sí, con su hueco entre emisión y decisión.) · `_rechazo` (A21: rechazar no cuesta nada — ni ahora ni en la siguiente propuesta. _sin_puntuacion (A22) falla si aparece una nota.) · `_caducidad` (A23: sin respuesta en la ventana: el candidato se salta y se sigue.) · `_siguiente` (A25: avanza al siguiente candidato en el orden declarado (no por conveniencia).) · `_sin_optimizador` (A28: la entrada es un hecho y una foto, no una lista de pedidos. Falla si alguien mete un barrido.) · `_sin_captura` (A32: la cuota no depende de km ahorrados ni de pedidos enlazados. _por_trayecto (A30): se enlazan rutas, no clientes. _no_rompe_promesa (A31): ninguna promesa ya dada empeora más allá del umbral.) · `_hueco` (A34: si falta un dato, se NOMBRA («sin posición fresca», «sin precio compuesto», «sin histórico del local», «sin coste del rider») y el candidato se salta.) · `_intra_plaza` (A35: plaza_id(pedido)==plaza_id(rider)==plaza_id(propuesta) en toda propuesta emitida y toda parada insertada.) · `_ejecutar` (op `ejecutar` del diseño (A05, A06, A07, A08, A09, A10, A11, A12, A16, A17, A20, A21, A22, A23, A25, A28, A30, A31, A34, A35).)
- **E · handler:** `onEjecutar(e)` → `_atender(e, 'ejecutar', 'enlace.ejecutar.response', d => this._ejecutar(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.medidas_calculadas`, `bocaos.hueco_nombrado`, `bocaos.enlace_completado`, `bocaos.enlace_agotado`
- **VERIFICACIÓN:** Mismo hecho + misma foto + misma política → misma propuesta (A29). Rider de otra plaza como parada → A35 rojo. Sin coste del rider → hueco, no un umbral con 0.
- **NO REUTILIZA / DECISIÓN:** 20 CLASES, UNA HOJA, y no por comodidad: son siete medidas y una regla que tienen que decidir sobre UNA foto. Como módulos, cada propuesta haría siete saltos de bus en una ventana de 10 s y la foto cambiaría entre salto y salto — justo lo que A03 prohíbe.

#### `escalada-enlace` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A26
- **Propósito:** Si nadie acepta al agotar el tope, el pedido NO se cierra por silencio: se pide una subida de oferta a un humano y/o se avisa a la sala. El sistema nunca sube el precio solo.
- **Depende de:** `enlace`, `tarifa-pedido`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "escalada-enlace"` · `unidad: "plaza"` · `subscribes:` ["bocaos.enlace_agotado"] · `publishes:` ["bocaos.escalada_pedida", "bocaos.escalada_reintentar", "aviso-sala.caso.request"]
- **C · index.js:** `class EscaladaEnlace extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_peldano` (A26/Q43: peldaño 2 a los 30 s; hasta el tope autorizado; 5 min de cancelación.) · `_tope` (A26: el tope lo autorizó el cliente al pedir. Sin tope → no se sube, se agota.) · `_agotar` (A26: agotada la escalada, el caso va a la sala. El pedido no muere: queda con nombre.) · `_escalar` (op `escalar` del diseño (A26).)
- **E · handler:** `onEscalar(e)` → `_atender(e, 'escalar', 'escalada-enlace.escalar.response', d => this._escalar(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.escalada_pedida`, `bocaos.escalada_reintentar`
- **VERIFICACIÓN:** Sin tope autorizado → no hay subida y `escalada_agotada`. Tres peldaños y para: el cuarto no existe.
- **NO REUTILIZA / DECISIÓN:** Un puente porque cruza al cliente (autorización) y al rider (nueva oferta). No se fusiona con `enlace`: la escalada sobrevive a que el enlace cambie.

#### `redaccion-propuesta` · `MICRO-AGENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A18
- **Propósito:** Adorna la propuesta con una frase: recibe los cuatro números ya medidos y los umbrales aplicados, y devuelve lenguaje. No elige, no puntúa, no escribe.
- **Depende de:** `propuesta`, `enlace`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "redaccion-propuesta"` · `unidad: "plaza"` · `subscribes:` ["redaccion-propuesta.adornar.request"] · `publishes:` ["redaccion-propuesta.adornar.response", "redaccion-propuesta.adornar.failed"]
- **C · index.js:** `class RedaccionPropuesta extends ModuloHibridoReflejo` + cajón de agente (LLM) declarado como `cajon_<op>` en `proyecciones_internas`; la op fuzzy NO va en `module.json.subscribes` (gate anti-colisión `validate-hibridos`). Si el agente se cae, la op devuelve la versión sin adornar.
- **D · proyecciones internas:** `cajon_adornar` (A18: el cajón del blueprint (lenguaje). El reflejo sólo valida y publica.) · `_validador` (A18: todo número que aparezca tiene que estar en la entrada; toda razón tiene que estar en A16. Lo que no está, rechaza.) · `_adorno` (A18: sin él, `enlace` usa la frase derivada (A17) y nadie nota la diferencia en el negocio.) · `_adornar` (op `adornar` del diseño (A18).)
- **E · handler:** `onAdornar(e)` → `_atender(e, 'adornar', 'redaccion-propuesta.adornar.response', d => this._adornar(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.propuesta_redactada`, `bocaos.redaccion_rechazada`
- **VERIFICACIÓN:** Frase que cita un motivo que no está en A16 → `redaccion_rechazada` y se usa A17. Sin LLM → el enlace no espera más de 300 ms.
- **NO REUTILIZA / DECISIÓN:** Híbrido: la op no va en `subscribes` (gate `validate-hibridos`), el cajón se declara en proyecciones. Cero IA en la decisión: este agente sólo pone palabras.

### ▸ (vuelve al PELDAÑO 7 · el reparto y la prueba — el orden manda)

#### `incidencia-reparto` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** F06
- **Propósito:** Abre el caso cuando algo no salió: relato, autor, hora y traza. No adjudica ni culpa.
- **Depende de:** `hechos-reparto`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "incidencia-reparto"` · `unidad: "plaza"` · `subscribes:` ["bocaos.hecho_reparto_anotado", "incidencia-reparto.abrir.request"] · `publishes:` ["incidencia-reparto.abrir.response", "incidencia-reparto.abrir.failed", "bocaos.incidencia_abierta"]
- **C · index.js:** `class IncidenciaReparto extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_abrir` (F06: relato libre + autor + hora + pedido. Sin campos obligatorios que fuercen una versión de los hechos.) · `_sin_clasificar` (F06: no decide si es grave. Clasificar es leer (F07).)
- **E · handler:** `onAbrir(e)` → `_atender(e, 'abrir', 'incidencia-reparto.abrir.response', d => this._abrir(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.incidencia_abierta`
- **VERIFICACIÓN:** Relato sin autor → 400. La incidencia no crea deuda: la crea G04 con evidencia.
- **NO REUTILIZA / DECISIÓN:** Sin cambios.

#### `lectura-incidencia` · `MICRO-AGENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** F07
- **Propósito:** Lee el relato de una incidencia y lo clasifica con campos. No dictamina: prepara el caso para la cola de la sala.
- **Depende de:** `incidencia-reparto`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "lectura-incidencia"` · `unidad: "plaza"` · `subscribes:` ["lectura-incidencia.clasificar.request"] · `publishes:` ["lectura-incidencia.clasificar.response", "lectura-incidencia.clasificar.failed"]
- **C · index.js:** `class LecturaIncidencia extends ModuloHibridoReflejo` + cajón de agente (LLM) declarado como `cajon_<op>` en `proyecciones_internas`; la op fuzzy NO va en `module.json.subscribes` (gate anti-colisión `validate-hibridos`). Si el agente se cae, la op devuelve la versión sin adornar.
- **D · proyecciones internas:** `cajon_clasificar` (F07: el cajón del blueprint. Devuelve una etiqueta de la lista cerrada.) · `_validador` (F07: sólo etiquetas de la lista; cualquier otra cosa → `lectura_ambigua` y la incidencia va a la cola sin etiqueta.) · `_no_es_juez` (F07: no dice si el fallo existió (eso es G02).) · `_clasificar` (op `clasificar` del diseño (F07).)
- **E · handler:** `onClasificar(e)` → `_atender(e, 'clasificar', 'lectura-incidencia.clasificar.response', d => this._clasificar(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.incidencia_clasificada`, `bocaos.lectura_ambigua`
- **VERIFICACIÓN:** Etiqueta fuera de la lista → `lectura_ambigua` y el caso sigue en la cola. El dictamen no cita a F07 como prueba.
- **NO REUTILIZA / DECISIÓN:** Híbrido. `cantera-semantica` indexa skills; no clasifica relatos de reparto.

### ▸ PELDAÑO 8 · el dinero de la plaza

#### `regla-fallo` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** G02 · G03 · G06
- **Propósito:** La tabla que mide un fallo: qué hecho lo verifica, cuánto se paga y qué queda trazado. Mide, no juzga; el humano, si acaso, firma.
- **Depende de:** `hechos-reparto`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "regla-fallo"` · `unidad: "plaza"` · `subscribes:` ["regla-fallo.evaluar.request", "bocaos.acta_incompleta", "bocaos.incidencia_abierta"] · `publishes:` ["regla-fallo.evaluar.response", "regla-fallo.evaluar.failed", "bocaos.fallo_medido"]
- **C · index.js:** `class ReglaFallo extends ModuloHibridoReflejo` — SIN store y SIN `PosPersistencia`: no escribe nada. Todo lo que necesita lo pide al bus y el dato vuelve en la response.
- **D · proyecciones internas:** `_medir` (G02: un fallo existe si y sólo si los hechos con hora lo verifican. Sin acta completa no hay fallo.) · `_adjudicar` (G03: tabla cerrada de quién responde. Devuelve QUIÉN, no CUÁNTO: los importes siguen sin número y se declaran.) · `_traza` (G06: la evidencia que sostiene la adjudicación, enumerable.) · `_evaluar` (op `evaluar` del diseño (G02, G03, G06).)
- **E · handler:** `onEvaluar(e)` → `_atender(e, 'evaluar', 'regla-fallo.evaluar.response', d => this._evaluar(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.fallo_medido`
- **VERIFICACIÓN:** Acta incompleta → no hay fallo y `cargo-fallo` no puede nacer. Adjudicación devuelve quién; el importe sale NO_CONSTA, no 0.
- **NO REUTILIZA / DECISIÓN:** Sin cambios. La tabla de importes sigue sin número (deuda 8 de la v1, que sigue viva).

#### `cargo-fallo` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** G04
- **Propósito:** El cargo por fallo como deuda CON nombre y evidencia: sin evidencia no hay cargo, y se declara en vez de inventarlo.
- **Depende de:** `regla-fallo`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "cargo-fallo"` · `unidad: "plaza"` · `subscribes:` ["bocaos.fallo_medido", "cargo-fallo.anular.request", "cargo-fallo.de.request", "project.activated"] · `publishes:` ["cargo-fallo.anular.response", "cargo-fallo.anular.failed", "cargo-fallo.de.response", "cargo-fallo.de.failed", "bocaos.cargo_anotado"]
- **C · index.js:** `class CargoFallo extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/cargo-fallo.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_anotar` (G04: deuda con partes, evidencia y plaza. Sin evidencia NO nace (y se publica el intento).) · `_no_descuento` (G04: una deuda no se compensa con un devengo. La plaza no retiene (H06).) · `_anular` (op `anular` del diseño (G04).) · `_de` (op `de` del diseño (G04).)
- **E · handler:** `onAnular(e)` → `_atender(e, 'anular', 'cargo-fallo.anular.response', d => this._anular(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'cargo-fallo.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.cargo_anotado`
- **VERIFICACIÓN:** Adjudicación sin evidencia → `cargo_sin_evidencia` y ninguna deuda. La deuda NO aparece descontada en el cierre.
- **NO REUTILIZA / DECISIÓN:** Sin cambios. `grocy`/`prisma/cuenta` son otra cosa (stock, ticket de venta).

#### `disputa-fallo` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** G05
- **Propósito:** El caso de una parte que no está de acuerdo: entra en la cola de la sala con su traza y su plazo. Bocaos no decide la disputa.
- **Depende de:** `cargo-fallo`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "disputa-fallo"` · `unidad: "plaza"` · `subscribes:` ["bocaos.cargo_anotado", "disputa-fallo.abrir.request"] · `publishes:` ["disputa-fallo.abrir.response", "disputa-fallo.abrir.failed", "aviso-sala.caso.request"]
- **C · index.js:** `class DisputaFallo extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_abrir` (G05: cargo + parte + motivo + hechos citados. No decide: encola (D3).) · `_no_borra` (G05: la deuda sigue; lo que cambia es que no se cobra hasta el dictamen.)
- **E · handler:** `onAbrir(e)` → `_atender(e, 'abrir', 'disputa-fallo.abrir.response', d => this._abrir(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.disputa_abierta`
- **VERIFICACIÓN:** Disputa abierta → el cargo no entra en el cierre como cobrable. Dictamen firmado → se aplica el efecto permitido, no se rehace la propuesta.
- **NO REUTILIZA / DECISIÓN:** Sin cambios.

#### `liquidacion` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** H01 · H02 · H05 · E04 · E05 · A32 · H06
- **Propósito:** El dinero de la plaza: devengo por contrato vigente en la hora del hecho, ciclo semanal cerrado, reparto del pago en cobros directos y la guarda de que la plaza no retiene lo ajeno.
- **Depende de:** `contrato-tramos`, `hechos-reparto`, `cargo-fallo`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "liquidacion"` · `unidad: "plaza"` · `subscribes:` ["liquidacion.abrir.request", "liquidacion.cerrar.request", "liquidacion.de.request", "liquidacion.cuenta.request", "scheduler.job.triggered", "bocaos.contrato_creado", "bocaos.hecho_reparto_anotado", "bocaos.cargo_anotado", "project.activated"] · `publishes:` ["liquidacion.abrir.response", "liquidacion.abrir.failed", "liquidacion.cerrar.response", "liquidacion.cerrar.failed", "liquidacion.de.response", "liquidacion.de.failed", "liquidacion.cuenta.response", "liquidacion.cuenta.failed", "bocaos.devengo_anotado", "bocaos.ciclo_cerrado"]
- **C · index.js:** `class Liquidacion extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/liquidacion.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_devengar` (H01: por contrato cerrado del periodo. Tienda: fijo del tramo + 20 c/pedido. Rider: 10 c/pedido. NUNCA por km ahorrado, NUNCA por % del ticket.) · `_dos_cifras` (H01/E04: seguro + en duda. Un pedido cancelado tras aceptar queda 'en duda' (Q18), no se elige.) · `_cerrar` (H02: cierre INMUTABLE del periodo. Se crea el job `bocaos.ciclo_semanal` en project.activated y se filtra el disparo del scheduler.) · `_mora` (H05: recordatorio → recargo → suspensión. La suspensión NO corta pedidos en vuelo ni propuestas vivas.) · `_comision` (E04: la comisión de coordinación, derivada del tramo vigente CUANDO OCURRIÓ el hecho.) · `_reparto` (E05: reparto del pago por parte. Conversor puro: no guarda, compone desde el cierre.) · `_no_retencion` (H06/A32: la plaza no retiene. Falla si un cierre descuenta una deuda o un km ahorrado.) · `_abrir` (op `abrir` del diseño (H01, H02, H05, E04, E05, A32, H06).) · `_de` (op `de` del diseño (H01, H02, H05, E04, E05, A32, H06).) · `_cuenta` (op `cuenta` del diseño (H01, H02, H05, E04, E05, A32, H06).)
- **E · handler:** `onAbrir(e)` → `_atender(e, 'abrir', 'liquidacion.abrir.response', d => this._abrir(d))` · **CLASE: ORDEN**
- **E · handler:** `onCerrar(e)` → `_atender(e, 'cerrar', 'liquidacion.cerrar.response', d => this._cerrar(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'liquidacion.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onCuenta(e)` → `_atender(e, 'cuenta', 'liquidacion.cuenta.response', d => this._cuenta(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.devengo_anotado`, `bocaos.ciclo_cerrado`
- **VERIFICACIÓN:** Cerrar dos veces el mismo periodo → el segundo no cambia el cierre. Deuda descontada de un devengo → H06 rojo. Ciclo sin nacional → sigue cerrando.
- **NO REUTILIZA / DECISIÓN:** `prisma/cuenta` y `pizzepos/cuentas` cobran tickets de venta. Esto devenga una cuota entre empresas: otro objeto y otro cierre.

#### `factura-gestion` · `CONVERSOR` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** H03
- **Propósito:** Convierte el cierre de un ciclo en el documento de cobro de UNA parte: importes, periodo y parte. No calcula el importe, lo formatea.
- **Depende de:** `liquidacion`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "factura-gestion"` · `unidad: "plaza"` · `subscribes:` ["factura-gestion.emitir.request", "factura-gestion.de.request"] · `publishes:` ["factura-gestion.emitir.response", "factura-gestion.emitir.failed", "factura-gestion.de.response", "factura-gestion.de.failed", "bocaos.documento_emitido"]
- **C · index.js:** `class FacturaGestion extends ModuloHibridoReflejo` — sin store. Cambia de forma y devuelve: el documento lo guarda quien lo pidió.
- **D · proyecciones internas:** `_emitir` (H03: cierre + parte → documento de cobro. Una factura por cierre y parte; la segunda es rectificativa.) · `_iva` (H03: el IVA es Q4 (abierto): el campo existe, el tipo no se inventa.) · `_de` (op `de` del diseño (H03).)
- **E · handler:** `onEmitir(e)` → `_atender(e, 'emitir', 'factura-gestion.emitir.response', d => this._emitir(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'factura-gestion.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.documento_emitido`
- **VERIFICACIÓN:** Dos facturas del mismo cierre y parte → la segunda exige rectificativa. Sin tipo de IVA declarado → documento con IVA NO_CONSTA, no 0.
- **NO REUTILIZA / DECISIÓN:** El ecosistema tiene `contabilidad-fiscal/factura-electronica` y `facturacion/*` con series y formatos españoles: se usarán como PROVEEDOR del puerto Documento, no como hoja (su sujeto es un proyecto contable, no una plaza).

#### `cobro-gestion` · `PUENTE` · acción **ADAPTAR** · unidad **PLAZA**

- **Clases:** H04
- **Propósito:** Cobra a la parte SU documento por el canal que ella declaró, y devuelve la constancia. El dinero que se mueve es la cuota de la plaza, nunca el de la comida ni el del reparto.
- **Depende de:** `factura-gestion`, `liquidacion`
- **A · ruta real:** `pago-gateway` — se AÑADE, no se reescribe.
- **B · module.json:** `name: "cobro-gestion"` · `unidad: "plaza"` · `subscribes:` ["bocaos.documento_emitido", "pago.confirmado", "pago.rechazado", "pago.reembolsado", "pago.importe_discrepante", "pago.revertir.request", "pago.revertir.response"] · `publishes:` ["pago.iniciar.request", "pago.reembolsar.request", "pago.revertir.response", "bocaos.cobro_confirmado", "bocaos.cobro_fallido"]
- **VERIFICACIÓN:** Documento de un rider → `pago.iniciar.request` con su cuenta conectada (credencial por proyecto, ya real) → `pago.confirmado` → `bocaos.cobro_confirmado`. Reversión antes de liquidar → `pago.revertir` (la op NUEVA) y constancia. Discrepancia de importe → `pago.importe_discrepante` y el caso NO se da por cobrado.
- **QUÉ SE TOCA / POR QUÉ NO SE CONSTRUYE:** `pago-gateway` v3.1.0 YA cobra por proyecto, por canal y concilia: 28 peticiones y 40 hechos reales (`pago.iniciar`, `pago.cobrar_guardada`, `pago.reader.*` para datáfono, `pago.confirmado`, `pago.reembolsado`, `pago.importe_discrepante`). Lo único que falta para H04 es REVERTIR una transferencia sobre la cuenta conectada (Q29) y etiquetar el canal por parte: se AÑADE `pago.revertir` sin tocar ninguna op existente. Su libro de cobros NO se usa como libro de Bocaos: la cuota tiene su propio cierre inmutable en `liquidacion`.
- **E · handler:** `onRevertir(e)` → `_atender(e, 'revertir', 'cobro-gestion.revertir.response', d => this._revertir(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.cobro_confirmado`, `bocaos.cobro_fallido`

#### `cuenta-parte` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** Q01 · M01
- **Propósito:** La cuenta de cada parte: qué debe, qué se le debe y su cartera. Es una proyección sobre devengos y cobros, no un libro paralelo.
- **Depende de:** `liquidacion`, `cobro-gestion`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "cuenta-parte"` · `unidad: "plaza"` · `subscribes:` ["cuenta-parte.ver.request", "cuenta-parte.cartera.request"] · `publishes:` ["cuenta-parte.ver.response", "cuenta-parte.ver.failed", "cuenta-parte.cartera.response", "cuenta-parte.cartera.failed"]
- **C · index.js:** `class CuentaParte extends ModuloHibridoReflejo` — SIN store y SIN `PosPersistencia`: no escribe nada. Todo lo que necesita lo pide al bus y el dato vuelve en la response.
- **D · proyecciones internas:** `_ver` (Q01: devengado · cobrado · deuda · en duda, con la versión de tramos que estaba viva.) · `_cartera` (M01: la cartera del rider en ESTA plaza. Un rider en dos plazas tiene dos carteras y un solo cuerpo (§7.9).)
- **E · handler:** `onVer(e)` → `_atender(e, 'ver', 'cuenta-parte.ver.response', d => this._ver(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onCartera(e)` → `_atender(e, 'cartera', 'cuenta-parte.cartera.response', d => this._cartera(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `— (ninguno: sólo calcula)`
- **VERIFICACIÓN:** La cuenta de una parte de la plaza A no se puede pedir desde la B. Un rider con dos altas ve dos carteras distintas.
- **NO REUTILIZA / DECISIÓN:** Es un reflejo y no guarda nada: si guardara, habría dos verdades del dinero.

### ▸ PELDAÑO 9 · la operación humana

#### `aviso-sala` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** I07
- **Propósito:** Avisa a una persona de la sala con el caso y su traza. Si no hay nadie, el caso queda vivo y visible: no se pierde.
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "aviso-sala"` · `unidad: "plaza"` · `subscribes:` ["aviso-sala.caso.request"] · `publishes:` ["telegram.send_message.request", "aviso-sala.enviado", "aviso-sala.fallido", "cola-sala.encolar.request"]
- **C · index.js:** `class AvisoSala extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_avisar` (I07: caso + traza + plazo al destinatario declarado (un agente, hoy).) · `_vencido` (I07: si el aviso caduca sin respuesta, se publica el vencimiento: el caso sigue en la cola.) · `_caso` (op `caso` del diseño (I07).)
- **E · handler:** `onCaso(e)` → `_atender(e, 'caso', 'aviso-sala.caso.response', d => this._caso(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `aviso-sala.enviado`, `aviso-sala.fallido`
- **VERIFICACIÓN:** Agente caído → `aviso_sala_vencido` y el caso sigue en la cola. El aviso no cierra el caso.
- **NO REUTILIZA / DECISIÓN:** Q40 deja un destinatario que es un agente. Si el agente no existe, el caso sigue vivo: vivo y visible no es atendido (tensión T3).

#### `dictamen-revision` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** O04
- **Propósito:** La revisión humana de una decisión automática: el humano FIRMA, y su firma queda con hora. Es la única mano humana sobre el mercado.
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "dictamen-revision"` · `unidad: "plaza"` · `subscribes:` ["dictamen-revision.firmar.request", "dictamen-revision.de.request", "bocaos.caso_encolado", "project.activated"] · `publishes:` ["dictamen-revision.firmar.response", "dictamen-revision.firmar.failed", "dictamen-revision.de.response", "dictamen-revision.de.failed", "bocaos.dictamen_firmado"]
- **C · index.js:** `class DictamenRevision extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/dictamen-revision.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_dictaminar` (O04: caso + firmante + efecto permitido + motivo. El efecto prohibido (rehacer la propuesta) no se puede escribir.) · `_efectos` (O04: compensar · corregir histórico · cambiar la regla hacia adelante. Tres, cerrados.) · `_firma` (O04: la firma dice el ámbito; una revisión de tienda no la firma el dueño de la plaza.) · `_firmar` (op `firmar` del diseño (O04).) · `_de` (op `de` del diseño (O04).)
- **E · handler:** `onFirmar(e)` → `_atender(e, 'firmar', 'dictamen-revision.firmar.response', d => this._firmar(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'dictamen-revision.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.dictamen_firmado`
- **VERIFICACIÓN:** Dictamen que 'rehace' la propuesta → EFECTO_PROHIBIDO. Cambiar la regla no reescribe propuestas pasadas (A29 las reproduce igual).
- **NO REUTILIZA / DECISIÓN:** Sin cambios. `interfaz` (radar) confirma veredictos: otro vertical.

#### `accion-sancion` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** P03
- **Propósito:** La sanción como acto con autor, motivo y plazo — y su reversión. Nada se sanciona por un número: se sanciona por un hecho del acta.
- **Depende de:** `acta-decisiones`, `estado-parte`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "accion-sancion"` · `unidad: "plaza"` · `subscribes:` ["accion-sancion.aplicar.request", "accion-sancion.revocar.request", "accion-sancion.de.request", "bocaos.dictamen_firmado", "project.activated"] · `publishes:` ["accion-sancion.aplicar.response", "accion-sancion.aplicar.failed", "accion-sancion.revocar.response", "accion-sancion.revocar.failed", "accion-sancion.de.response", "accion-sancion.de.failed", "bocaos.parte_sancionada"]
- **C · index.js:** `class AccionSancion extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/accion-sancion.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_aplicar` (P03: parte + motivo + plazo + firmante. Sin firmante no hay sanción.) · `_limites` (P03: no corta pedidos en vuelo ni propuestas vivas; no toca el dinero.) · `_revocar` (op `revocar` del diseño (P03).) · `_de` (op `de` del diseño (P03).)
- **E · handler:** `onAplicar(e)` → `_atender(e, 'aplicar', 'accion-sancion.aplicar.response', d => this._aplicar(d))` · **CLASE: ORDEN**
- **E · handler:** `onRevocar(e)` → `_atender(e, 'revocar', 'accion-sancion.revocar.response', d => this._revocar(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'accion-sancion.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.parte_sancionada`
- **VERIFICACIÓN:** Sanción sin firmante → 403. Sancionar por un rechazo → no hay camino: el rechazo no crea caso.
- **NO REUTILIZA / DECISIÓN:** Sin cambios.

#### `cola-sala` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** P01 · O03 · P02
- **Propósito:** La cola de casos de la sala: lo que un humano tiene que mirar, con su traza y su plazo. Sin campos ocultos y sin adjudicar.
- **Depende de:** `censo-parte`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "cola-sala"` · `unidad: "plaza"` · `subscribes:` ["cola-sala.encolar.request", "cola-sala.tomar.request", "cola-sala.cerrar.request", "cola-sala.listar.request", "aviso-sala.caso.request", "bocaos.hueco_nombrado", "bocaos.incidencia_abierta", "project.activated"] · `publishes:` ["cola-sala.encolar.response", "cola-sala.encolar.failed", "cola-sala.tomar.response", "cola-sala.tomar.failed", "cola-sala.cerrar.response", "cola-sala.cerrar.failed", "cola-sala.listar.response", "cola-sala.listar.failed", "bocaos.caso_encolado", "bocaos.caso_cerrado"]
- **C · index.js:** `class ColaSala extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/cola-sala.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_encolar` (P01: caso con tipo, traza y plazo. Vencer NO resuelve: sube de prioridad y sigue vivo.) · `_vista` (P02: lo que la parte ve de su caso, sin datos de la otra parte.) · `_revision` (O03: la revisión humana es de la plaza donde se decidió; el nacional no puede dictaminar sobre una propuesta que no tiene.) · `_tomar` (op `tomar` del diseño (P01, O03, P02).) · `_cerrar` (op `cerrar` del diseño (P01, O03, P02).) · `_listar` (op `listar` del diseño (P01, O03, P02).)
- **E · handler:** `onEncolar(e)` → `_atender(e, 'encolar', 'cola-sala.encolar.response', d => this._encolar(d))` · **CLASE: ORDEN**
- **E · handler:** `onTomar(e)` → `_atender(e, 'tomar', 'cola-sala.tomar.response', d => this._tomar(d))` · **CLASE: ORDEN**
- **E · handler:** `onCerrar(e)` → `_atender(e, 'cerrar', 'cola-sala.cerrar.response', d => this._cerrar(d))` · **CLASE: ORDEN**
- **E · handler:** `onListar(e)` → `_atender(e, 'listar', 'cola-sala.listar.response', d => this._listar(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.caso_encolado`, `bocaos.caso_cerrado`
- **VERIFICACIÓN:** Caso vencido → sigue vivo y con más prioridad (no se cierra solo). La cola no se vacía al reiniciar.
- **NO REUTILIZA / DECISIÓN:** `cola` es la cola de impresión 3D (FIFO + urgencia, hardcodeada a GCODE): mismo patrón, otro dominio, no se adapta. Se toma el patrón.

#### `salud-mercado` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** I05 · I06 · O01 · N01
- **Propósito:** La salud del mercado y sus fricciones: cuántos pedidos quedan sin rider, dónde se atasca, qué densidad aguanta la plaza. Mide el negocio, no la máquina.
- **Depende de:** `enlace`, `hechos-reparto`, `liquidacion`, `frontera-plaza`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "salud-mercado"` · `unidad: "plaza"` · `subscribes:` ["salud-mercado.ver.request", "salud-mercado.fricciones.request", "salud-mercado.densidad.request"] · `publishes:` ["salud-mercado.ver.response", "salud-mercado.ver.failed", "salud-mercado.fricciones.response", "salud-mercado.fricciones.failed", "salud-mercado.densidad.response", "salud-mercado.densidad.failed", "bocaos.cuadro_servido"]
- **C · index.js:** `class SaludMercado extends ModuloHibridoReflejo` — SIN store y SIN `PosPersistencia`: no escribe nada. Todo lo que necesita lo pide al bus y el dato vuelve en la response.
- **D · proyecciones internas:** `_medir` (I05: la medida maestra. Un mercado que necesita seis propuestas para mover un pedido está muerto aunque venda.) · `_fricciones` (I06: los 8 pares, medidos sobre los mismos hechos que I05 y O01. Tres módulos darían tres cifras del mismo mercado.) · `_cuadro` (O01: el cuadro del jefe de la plaza. Agregados de mercado, nunca de personas.) · `_densidad` (N01: densidad por zona — información para el dueño; abrir o cerrar zona es una SolicitudDecisión (D6).) · `_ver` (op `ver` del diseño (I05, I06, O01, N01).)
- **E · handler:** `onVer(e)` → `_atender(e, 'ver', 'salud-mercado.ver.response', d => this._ver(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onFricciones(e)` → `_atender(e, 'fricciones', 'salud-mercado.fricciones.response', d => this._fricciones(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onDensidad(e)` → `_atender(e, 'densidad', 'salud-mercado.densidad.response', d => this._densidad(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.cuadro_servido`
- **VERIFICACIÓN:** Mercado sin propuestas → 'sin propuestas', no 0%. Nunca se calcula con el histórico de otra plaza.
- **NO REUTILIZA / DECISIÓN:** `metricas` es instrumentación pasiva del bus (counters, gauges). Esto mide el NEGOCIO y no se alimenta de logs. No se toca `metricas`: entra como base de observabilidad.

### ▸ PELDAÑO 10 · el borde amable

#### `publicacion` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** — (sin clase propia: materializa un paso del flujo)
- **Propósito:** Sube al nacional los CUATRO hechos que cruzan y nada más. El registro no pregunta: si un hecho se pierde, se recompone en la siguiente latido.
- **Depende de:** `censo-parte`, `liquidacion`, `salud-mercado`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "publicacion"` · `unidad: "plaza"` · `subscribes:` ["scheduler.job.triggered", "bocaos.devengo_anotado", "bocaos.censo_actualizado", "bocaos.cuadro_servido"] · `publishes:` ["plaza.viva", "tienda.dada-de-alta", "plaza.devengo-cerrado", "plaza.acceso-visto", "publicacion.fallida"]
- **C · index.js:** `class Publicacion extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_viva` (`plaza.viva` { plaza_id, versión, estado, tiendas:N } periódico y barato, por el job `bocaos.plaza.viva`.) · `_tienda` (`tienda.dada-de-alta` { plaza_id, tienda_id, nombre, estado } cuando pasa (lo dispara `bocaos.censo_actualizado`).) · `_devengo` (`plaza.devengo-cerrado` { plaza_id, periodo, total, partes:N } al cerrar la semana. Lleva CUÁNTAS partes, no cuáles.) · `_acceso` (`plaza.acceso-visto` al conceder o usar un acceso. Es el único acto de la plaza que sube con nombre propio.) · `_sello` (El plaza_id NO se copia del payload: se toma de la configuración del despliegue. El tienda_id se toma del pedido/alta del dueño, nunca del que llama.) · `_sin_acuse` (No hay `.response` ni reintento que bloquee: con el nacional caído, publicar es publicar al vacío y el negocio sigue.) · `_acceso_concedido` (op `acceso_concedido` del diseño (raíz).) · `_latido` (raíz Plaza: un `plaza.viva` periódico y barato — versión, estado y número de tiendas, sin nombres.) · `_subir` (sólo los cuatro de §9.1; lo que no está en la lista, no cruza.)
- **E · handler:** `onAccesoConcedido(e)` → `_atender(e, 'acceso_concedido', 'publicacion.acceso_concedido.response', d => this._acceso_concedido(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `plaza.viva`, `tienda.dada-de-alta`, `plaza.devengo-cerrado`, `plaza.acceso-visto`
- **VERIFICACIÓN:** Parar el nacional: `publicacion` sigue publicando y nada se bloquea. `plaza.devengo-cerrado` no lleva nombres de partes. Ninguna fila con plaza_id de otra plaza.
- **NO REUTILIZA / DECISIÓN:** No tiene `.failed` y es deliberado: un emisor que afirma entrega miente. El círculo se cierra en `fed-buzon` (`hecho_rechazado` / `fila_sin_plaza`). Es la única desviación del 'todo flujo con su par de fallo' y va escrita.

#### `resumen-tienda` · `MICRO-AGENTE` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** L04
- **Propósito:** El párrafo que la tienda lee: redacta con hechos YA medidos. Validador: todo número citado existe en los hechos. Si se cae, el panel sigue estando.
- **Depende de:** `panel-tienda`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "resumen-tienda"` · `unidad: "tienda"` · `subscribes:` ["resumen-tienda.redactar.request"] · `publishes:` ["resumen-tienda.redactar.response", "resumen-tienda.redactar.failed"]
- **C · index.js:** `class ResumenTienda extends ModuloHibridoReflejo` + cajón de agente (LLM) declarado como `cajon_<op>` en `proyecciones_internas`; la op fuzzy NO va en `module.json.subscribes` (gate anti-colisión `validate-hibridos`). Si el agente se cae, la op devuelve la versión sin adornar.
- **D · proyecciones internas:** `cajon_redactar` (L04: el cajón del blueprint (texto libre). El reflejo sólo valida y publica.) · `_validador` (L04: todo número citado tiene que existir en los hechos de entrada. Un número que no está en la entrada rechaza el párrafo entero.) · `_sin_contexto` (L04: no menciona a la plaza ni al nacional. La tienda no necesita saber cuántos niveles hay encima.) · `_redactar` (op `redactar` del diseño (L04).)
- **E · handler:** `onRedactar(e)` → `_atender(e, 'redactar', 'resumen-tienda.redactar.response', d => this._redactar(d))` · **CLASE: ORDEN**
- **VERIFICACIÓN:** Párrafo que cita una cifra que no está en los hechos → `resumen_rechazado` y el panel sigue sirviendo. Sin LLM configurado → 503 y el panel intacto.
- **NO REUTILIZA / DECISIÓN:** Módulo HÍBRIDO: la op `redactar` NO va en `subscribes` del manifest (gate `validate-hibridos`); el cajón se declara como `cajon_redactar` en proyecciones. Es uno de los tres únicos agentes y vive en el borde.

### ▸ PELDAÑO 11 · el nacional

#### `fed-buzon` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R23 · R25
- **Propósito:** El buzón del registro: acepta CUATRO formas de hecho y rechaza la quinta. No tiene punteros a plazas y no admite consultas.
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-buzon"` · `unidad: "nacional"` · `subscribes:` ["plaza.viva", "tienda.dada-de-alta", "plaza.devengo-cerrado", "plaza.acceso-visto", "fed-buzon.guarda_catalogo.request", "fed-buzon.guarda_frontera.request", "fed-buzon.recibidos.request", "project.activated"] · `publishes:` ["fed-buzon.guarda_catalogo.response", "fed-buzon.guarda_catalogo.failed", "fed-buzon.guarda_frontera.response", "fed-buzon.guarda_frontera.failed", "fed-buzon.recibidos.response", "fed-buzon.recibidos.failed", "bocaos.federacion_plaza_viva", "bocaos.federacion_tienda_publicada", "bocaos.federacion_devengo_cerrado", "bocaos.federacion_acceso_visto", "bocaos.federacion_hecho_rechazado", "bocaos.federacion_fila_sin_plaza", "bocaos.federacion_almacen_con_catalogo"]
- **C · index.js:** `class FedBuzon extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-buzon.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_forma` (La raíz `Nacional.anotar`: cuatro formas cerradas (plaza.viva · tienda.dada-de-alta · devengo-cerrado · acceso-visto). La quinta se rechaza con nombre, no se ignora.) · `_sello` (R25: compara el `plaza_id` de cada fila con la plaza del que la escribió. Sólo tres clases escriben con plaza_id ajeno (R05, R06, R20) y las tres escriben SOBRE una plaza, no DESDE otra.) · `_sin_catalogo` (R23: enumera el almacén del nacional. Si aparece `pedido`, `linea`, `importe`, `direccion` o `posicion`, FALLA con la ruta exacta.) · `_recibidos` (Cuenta y forma de lo recibido por plaza y periodo — el cuadro del buzón, sin nombres de partes.) · `_guarda_catalogo` (op `guarda_catalogo` del diseño (R23, R25).) · `_guarda_frontera` (op `guarda_frontera` del diseño (R23, R25).)
- **E · handler:** `onGuardaCatalogo(e)` → `_atender(e, 'guarda_catalogo', 'fed-buzon.guarda_catalogo.response', d => this._guarda_catalogo(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onGuardaFrontera(e)` → `_atender(e, 'guarda_frontera', 'fed-buzon.guarda_frontera.response', d => this._guarda_frontera(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onRecibidos(e)` → `_atender(e, 'recibidos', 'fed-buzon.recibidos.response', d => this._recibidos(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.federacion_plaza_viva`, `bocaos.federacion_tienda_publicada`, `bocaos.federacion_devengo_cerrado`, `bocaos.federacion_acceso_visto`, `bocaos.federacion_hecho_rechazado`, `bocaos.federacion_fila_sin_plaza`, `bocaos.federacion_almacen_con_catalogo`
- **VERIFICACIÓN:** Publicar una quinta forma (`pedido.creado`) → `bocaos.federacion_hecho_rechazado` y nada escrito. `guarda_catalogo` en verde con el almacén vacío y en rojo en cuanto se crea una tabla con `direccion`.
- **NO REUTILIZA / DECISIÓN:** No se construye un 'validador genérico' en `_shared/`: la forma la fija el negocio y vive en la puerta. Un `schema-validation` compartido dejaría pasar la quinta forma el día que alguien lo afloje.

#### `fed-marca` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R16 · R17
- **Propósito:** La marca B2B y sus licencias.
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-marca"` · `unidad: "nacional"` · `subscribes:` ["fed-marca.declarar.request", "fed-marca.de.request", "fed-marca.licenciar.request", "fed-marca.licencia.request", "fed-marca.retirar.request", "project.activated"] · `publishes:` ["fed-marca.declarar.response", "fed-marca.declarar.failed", "fed-marca.de.response", "fed-marca.de.failed", "fed-marca.licenciar.response", "fed-marca.licenciar.failed", "fed-marca.licencia.response", "fed-marca.licencia.failed", "fed-marca.retirar.response", "fed-marca.retirar.failed", "bocaos.federacion_marca_declarada", "bocaos.federacion_licencia_concedida", "bocaos.federacion_licencia_retirada"]
- **C · index.js:** `class FedMarca extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-marca.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_declarar` (R16: nombre · signos · ámbito (B2B) · titular. Ámbito cerrado: las cinco cosas del acta y ni una más.) · `_licencia` (R17: qué puede hacer la plaza con la marca (rótulo, dominio, papelería, nombre comercial), desde/hasta y causa. Sin licencia no se puede poner en ningún sitio.) · `_retirar` (R17: retirar es el único castigo real del registro, y llega tarde (fricción 9). Se anota con causa y hora.) · `_licenciar` (op `licenciar` del diseño (R16, R17).)
- **E · handler:** `onDeclarar(e)` → `_atender(e, 'declarar', 'fed-marca.declarar.response', d => this._declarar(d))` · **CLASE: ORDEN**
- **E · handler:** `onLicenciar(e)` → `_atender(e, 'licenciar', 'fed-marca.licenciar.response', d => this._licenciar(d))` · **CLASE: ORDEN**
- **E · handler:** `onRetirar(e)` → `_atender(e, 'retirar', 'fed-marca.retirar.response', d => this._retirar(d))` · **CLASE: ORDEN**
- **E · handler:** `onLicencia(e)` → `_atender(e, 'licencia', 'fed-marca.licencia.response', d => this._licencia(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.federacion_marca_declarada`, `bocaos.federacion_licencia_concedida`, `bocaos.federacion_licencia_retirada`
- **VERIFICACIÓN:** Licencia vencida → `licencia()` NO_CONSTA y la plaza no puede usar la marca. La marca del nacional no aparece en ningún tópico que baje a una plaza.
- **NO REUTILIZA / DECISIÓN:** `pizzepos/carta-marketing` guarda la marca DE UN PROYECTO y la sirve al canal digital. Aquí la marca es un activo licenciable con plazo y retirada: otro objeto.

#### `fed-padron` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R01 · R02 · R03 · R04
- **Propósito:** El padrón de plazas y su estado: siete campos, ninguno de negocio. Una plaza cerrada no se borra.
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-padron"` · `unidad: "nacional"` · `subscribes:` ["fed-padron.abrir.request", "fed-padron.anotar.request", "fed-padron.de.request", "fed-padron.vivas.request", "bocaos.federacion_verificacion_ok", "bocaos.federacion_verificacion_difiere", "scheduler.job.triggered", "project.activated"] · `publishes:` ["fed-padron.abrir.response", "fed-padron.abrir.failed", "fed-padron.anotar.response", "fed-padron.anotar.failed", "fed-padron.de.response", "fed-padron.de.failed", "fed-padron.vivas.response", "fed-padron.vivas.failed", "bocaos.federacion_plaza_anotada", "bocaos.federacion_plaza_estado", "bocaos.federacion_plaza_silenciosa"]
- **C · index.js:** `class FedPadron extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-padron.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_abrir` (R02: abrir es un ACTO con responsable y fecha; la primera plaza escribe su acta de constitución y NO crea padrón. Sin responsable → SIN_RESPONSABLE.) · `_transitar` (R03: naciendo → operando sólo con verificación en verde; cerrada no vuelve; ningún estado sin hecho con hora.) · `_silencio` (R04: minutos desde el último plaza.viva contra el umbral DEL REGISTRO; alimenta a _transitar, no la sustituye.) · `_siete_campos` (R01: id · localidad · estado · versión · alta · responsable · plaza_id. Ni carta, ni precios, ni número de tiendas.) · `_anotar` (op `anotar` del diseño (R01, R02, R03, R04).) · `_de` (op `de` del diseño (R01, R02, R03, R04).) · `_vivas` (op `vivas` del diseño (R01, R02, R03, R04).)
- **E · handler:** `onAbrir(e)` → `_atender(e, 'abrir', 'fed-padron.abrir.response', d => this._abrir(d))` · **CLASE: ORDEN**
- **E · handler:** `onAnotar(e)` → `_atender(e, 'anotar', 'fed-padron.anotar.response', d => this._anotar(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'fed-padron.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onVivas(e)` → `_atender(e, 'vivas', 'fed-padron.vivas.response', d => this._vivas(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.federacion_plaza_anotada`, `bocaos.federacion_plaza_estado`, `bocaos.federacion_plaza_silenciosa`
- **VERIFICACIÓN:** Primera plaza: acta de constitución y CERO padrón. Segunda plaza: padrón con dos filas y `bocaos.federacion_plaza_anotada` x2. `cerrada` no vuelve; transición sin hecho → 409.
- **NO REUTILIZA / DECISIÓN:** No se reutiliza `project-manager`: gestiona proyectos DENTRO de un despliegue, no despliegues. Un registro de plazas es lo que no existe en Enki — y por eso el nacional es una pieza nueva, no una carpeta.

#### `fed-acceso` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R19 · R20 · R21
- **Propósito:** Permisos vivos, traza de accesos y acceso delegado con vencimiento. Sin traza no se consulta.
- **Depende de:** `fed-buzon`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-acceso"` · `unidad: "nacional"` · `subscribes:` ["bocaos.federacion_acceso_visto", "fed-acceso.abrir.request", "fed-acceso.usar.request", "fed-acceso.vencer.request", "fed-acceso.traza.request", "project.activated"] · `publishes:` ["fed-acceso.abrir.response", "fed-acceso.abrir.failed", "fed-acceso.usar.response", "fed-acceso.usar.failed", "fed-acceso.vencer.response", "fed-acceso.vencer.failed", "fed-acceso.traza.response", "fed-acceso.traza.failed", "bocaos.federacion_acceso_anotado", "bocaos.federacion_acceso_vencido", "bocaos.federacion_acceso_denegado"]
- **C · index.js:** `class FedAcceso extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-acceso.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_anotar` (R19: sólo anota una concesión que LLEGÓ PUBLICADA. No hay método para crearla desde dentro: si lo hubiera, el soporte se daría permiso solo.) · `_traza` (R20: append-only. plaza · quién · cuándo · con qué permiso · QUÉ se consultó (por nombre de cosa). Una corrección es otra línea que desmiente.) · `_usar` (R21: si la traza no se puede escribir, NO se consulta. El registro no puede mirar sin dejar rastro.) · `_vencer` (R21: el permiso caduca solo; un acceso sin vencimiento es un rol permanente con otro nombre.) · `_abrir` (op `abrir` del diseño (R19, R20, R21).)
- **E · handler:** `onAbrir(e)` → `_atender(e, 'abrir', 'fed-acceso.abrir.response', d => this._abrir(d))` · **CLASE: ORDEN**
- **E · handler:** `onUsar(e)` → `_atender(e, 'usar', 'fed-acceso.usar.response', d => this._usar(d))` · **CLASE: ORDEN**
- **E · handler:** `onVencer(e)` → `_atender(e, 'vencer', 'fed-acceso.vencer.response', d => this._vencer(d))` · **CLASE: ORDEN**
- **E · handler:** `onTraza(e)` → `_atender(e, 'traza', 'fed-acceso.traza.response', d => this._traza(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.federacion_acceso_anotado`, `bocaos.federacion_acceso_vencido`, `bocaos.federacion_acceso_denegado`
- **VERIFICACIÓN:** `abrir` sin concesión publicada → SIN_CONCESIÓN. `usar` con el fs caído → 500 y NINGÚN dato devuelto. Traza de una plaza no se puede leer pidiendo otra.
- **NO REUTILIZA / DECISIÓN:** Aquí puede fallar la auditoría 1: si `_traza` guarda el payload de lo visto en vez del NOMBRE de la cosa, el nacional tiene pedidos. Test: `que` ∈ lista cerrada.

#### `fed-acta` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R22
- **Propósito:** El acta de la federación.
- **Depende de:** `fed-padron`, `fed-marca`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-acta"` · `unidad: "nacional"` · `subscribes:` ["fed-acta.asentar.request", "fed-acta.de.request", "project.activated"] · `publishes:` ["fed-acta.asentar.response", "fed-acta.asentar.failed", "fed-acta.de.response", "fed-acta.de.failed", "bocaos.federacion_acta_asentada"]
- **C · index.js:** `class FedActa extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-acta.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_asentar` (R22: lista CERRADA de cinco cosas, versión de las reglas comunes, fecha y firma. La sexta no se escribe: exige otra acta.) · `_corresponsabilidad` (R22: con datos personales de por medio, el acta dice quién responde de qué (Q53). No es un anexo: es la mitad del acta.) · `_de` (op `de` del diseño (R22).)
- **E · handler:** `onAsentar(e)` → `_atender(e, 'asentar', 'fed-acta.asentar.response', d => this._asentar(d))` · **CLASE: ORDEN**
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'fed-acta.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.federacion_acta_asentada`
- **VERIFICACIÓN:** Acta con una sexta cosa → 422 con el nombre de la cosa. Plaza sin acta → no cuenta en el cuadro como federada (aparece como plaza suelta).
- **NO REUTILIZA / DECISIÓN:** `project-profile` describe un proyecto; el acta es un acuerdo entre instalaciones con corresponsabilidad RGPD. Otro dominio, otra firma.

#### `fed-censo` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R05
- **Propósito:** El censo nacional de tiendas: nombre y estado, sin carta ni precios.
- **Depende de:** `fed-buzon`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-censo"` · `unidad: "nacional"` · `subscribes:` ["fed-censo.de.request", "fed-censo.baja.request", "bocaos.federacion_tienda_publicada", "project.activated"] · `publishes:` ["fed-censo.de.response", "fed-censo.de.failed", "fed-censo.baja.response", "fed-censo.baja.failed", "bocaos.federacion_tienda_censada", "bocaos.federacion_tienda_baja"]
- **C · index.js:** `class FedCenso extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-censo.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_anotar` (R05: id · nombre · estado · plaza_id. La quinta columna que alguien pida (carta, precios, volumen) no tiene dónde ponerse.) · `_baja` (R05: una tienda de baja se marca, no se borra: su nombre en el índice del mes pasado tiene que seguir teniendo explicación.) · `_de` (op `de` del diseño (R05).)
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'fed-censo.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onBaja(e)` → `_atender(e, 'baja', 'fed-censo.baja.response', d => this._baja(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.federacion_tienda_censada`, `bocaos.federacion_tienda_baja`
- **VERIFICACIÓN:** Alta de tienda en la plaza → una fila aquí, sin haber preguntado a la plaza. `fed-censo` no emite ningún `*.request` hacia una plaza.
- **NO REUTILIZA / DECISIÓN:** `project-manager` conoce los proyectos de UN despliegue; el censo nacional conoce tiendas de N plazas ajenas. Otro dominio, otro dueño.

#### `fed-buscador` · `REFLEJO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R10 · R11 · R12
- **Propósito:** El índice barato y el buscador por localidad: devuelve la plaza, nunca el pedido. Sin ranking por relevancia.
- **Depende de:** `fed-padron`, `fed-censo`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-buscador"` · `unidad: "nacional"` · `subscribes:` ["fed-buscador.buscar.request", "fed-buscador.indice.request"] · `publishes:` ["fed-buscador.buscar.response", "fed-buscador.buscar.failed", "fed-buscador.indice.response", "fed-buscador.indice.failed"]
- **C · index.js:** `class FedBuscador extends ModuloHibridoReflejo` — SIN store y SIN `PosPersistencia`: no escribe nada. Todo lo que necesita lo pide al bus y el dato vuelve en la response.
- **D · proyecciones internas:** `_indice` (R10: se reescribe de padrón+censo en cada consulta. Cuatro campos por fila: plaza, localidad, tienda, estado.) · `_buscar` (R11: por localidad y nombre de tienda, y por nada más (Q48). Orden declarado con desempate escrito. Si no encuentra, NO SUGIERE.) · `_resultado` (R12: la fila con su plaza dentro. No hay constructor de resultado sin plaza; sin plaza no hay a dónde enrutar.)
- **E · handler:** `onBuscar(e)` → `_atender(e, 'buscar', 'fed-buscador.buscar.response', d => this._buscar(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onIndice(e)` → `_atender(e, 'indice', 'fed-buscador.indice.response', d => this._indice(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `— (ninguno: sólo calcula)`
- **VERIFICACIÓN:** Buscar 'pizza' (un producto) → vacío, no 'quizá te interese'. Buscar una localidad sin tiendas → lista vacía. Ningún resultado sin `plaza_id`.
- **NO REUTILIZA / DECISIÓN:** `apis-publicas` y `cantera-semantica` son índices de OTRA cosa (servicios y skills) y rankean por relevancia: exactamente lo que R11 prohíbe. Se toma el patrón de índice barato, no el módulo.

#### `fed-consolidacion` · `REFLEJO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R14 · R15
- **Propósito:** La suma por periodo y el cuadro de la federación: totales y partes, sin nombres.
- **Depende de:** `fed-buzon`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-consolidacion"` · `unidad: "nacional"` · `subscribes:` ["bocaos.federacion_devengo_cerrado", "fed-consolidacion.consolidar.request", "fed-consolidacion.cuadro.request", "project.activated"] · `publishes:` ["fed-consolidacion.consolidar.response", "fed-consolidacion.consolidar.failed", "fed-consolidacion.cuadro.response", "fed-consolidacion.cuadro.failed", "bocaos.federacion_consolidado"]
- **C · index.js:** `class FedConsolidacion extends ModuloHibridoReflejo` — SIN store y SIN `PosPersistencia`: no escribe nada. Todo lo que necesita lo pide al bus y el dato vuelve en la response.
- **D · proyecciones internas:** `_consolidar` (R14: suma por plaza y periodo. No convierte moneda, no compensa, no prorratea, no cobra. Sin netting entre plazas.) · `_con_definicion` (R14: cada cifra lleva dentro la definición con la que se calculó (Q53/Q56). Sin eso, el cuadro compara peras con manzanas.) · `_cuadro` (R15: plazas vivas · versiones · aceptación por plaza · devengo · canon emitido vs pagado. Lo que no consta es HUECO, no cero.)
- **E · handler:** `onConsolidar(e)` → `_atender(e, 'consolidar', 'fed-consolidacion.consolidar.response', d => this._consolidar(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onCuadro(e)` → `_atender(e, 'cuadro', 'fed-consolidacion.cuadro.response', d => this._cuadro(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.federacion_consolidado`
- **VERIFICACIÓN:** Dos plazas con definiciones distintas → el cuadro muestra dos definiciones y NO un total comparable. Plaza sin devengo cerrado → HUECO.
- **NO REUTILIZA / DECISIÓN:** `contabilidad-libro/cuenta-resultados` suma la contabilidad de UN proyecto con su plan contable. Aquí se suman cierres ajenos con definiciones distintas y sin plan común: otro dominio.

#### `fed-canon` · `REFLEJO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R24 · R26
- **Propósito:** El canon de plaza (sólo con la segunda plaza) y la guarda de que el nacional no recauda nada más.
- **Depende de:** `fed-consolidacion`, `fed-padron`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-canon"` · `unidad: "nacional"` · `subscribes:` ["fed-canon.calcular.request", "fed-canon.documento.request", "fed-canon.guarda_recauda.request", "project.activated"] · `publishes:` ["fed-canon.calcular.response", "fed-canon.calcular.failed", "fed-canon.documento.response", "fed-canon.documento.failed", "fed-canon.guarda_recauda.response", "fed-canon.guarda_recauda.failed", "bocaos.federacion_canon_emitido", "bocaos.federacion_canon_sin_coeficiente"]
- **C · index.js:** `class FedCanon extends ModuloHibridoReflejo` — SIN store y SIN `PosPersistencia`: no escribe nada. Todo lo que necesita lo pide al bus y el dato vuelve en la response.
- **D · proyecciones internas:** `_calcular` (R26: coeficiente × devengo CERRADO publicado. Sin coeficiente → NO_CONSTA y no se emite documento (un canon inventado es una cuota que nadie aceptó).) · `_documento` (R26: documento a UNA plaza y un periodo. La plaza lo paga por su canal; el nacional no entra en su ciclo, no descuenta, no retiene, no compensa.) · `_guarda_no_recauda` (R24: recorre los caminos de dinero que SALEN del nacional. Único permitido: este. Todo lo demás falla con el camino exacto.) · `_sujeto_pasivo` (Decisión C: con menos de dos plazas `documento()` → NO_HAY. No hay a quién cobrarle ni con qué justificarlo.) · `_guarda_recauda` (op `guarda_recauda` del diseño (R24, R26).)
- **E · handler:** `onCalcular(e)` → `_atender(e, 'calcular', 'fed-canon.calcular.response', d => this._calcular(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onDocumento(e)` → `_atender(e, 'documento', 'fed-canon.documento.response', d => this._documento(d))` · **CLASE: ORDEN**
- **E · handler:** `onGuardaRecauda(e)` → `_atender(e, 'guarda_recauda', 'fed-canon.guarda_recauda.response', d => this._guarda_recauda(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.federacion_canon_emitido`, `bocaos.federacion_canon_sin_coeficiente`
- **VERIFICACIÓN:** Con una plaza: `documento()` → NO_HAY y `guarda_recauda` en verde por lista vacía (asterisco declarado). Con dos y sin coeficiente: NO_CONSTA, cuadro dice 'canon sin declarar'.
- **NO REUTILIZA / DECISIÓN:** El documento NO viaja por el bus a la plaza: sale por el canal administrativo. Si viajara, sería una tercera flecha N→P y rompería la lista cerrada.

#### `fed-enrutado` · `PUENTE` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R13
- **Propósito:** Enruta una consulta a la plaza que corresponde.
- **Depende de:** `fed-buscador`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-enrutado"` · `unidad: "nacional"` · `subscribes:` ["fed-enrutado.enrutar.request"] · `publishes:` ["fed-enrutado.enrutar.response", "fed-enrutado.enrutar.failed"]
- **C · index.js:** `class FedEnrutado extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_salida` (R13: de un ResultadoConSuPlaza a la URL de SU plaza. Nada más viaja: ni marca, ni parámetro de seguimiento.) · `_sin_rastro` (R13: no se escribe ni se publica nada por un clic. Un contador de clics sería el primer dato de demanda del nacional.) · `_enrutar` (op `enrutar` del diseño (R13).)
- **E · handler:** `onEnrutar(e)` → `_atender(e, 'enrutar', 'fed-enrutado.enrutar.response', d => this._enrutar(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `— (ninguno: sólo calcula)`
- **VERIFICACIÓN:** Enrutar devuelve una URL que apunta a la plaza; el payload no contiene marca ni tracking. `fed-enrutado` no publica ningún hecho.
- **NO REUTILIZA / DECISIÓN:** Un `redirect` de tres líneas se podría haber puesto dentro de `fed-buscador`. No: es la frontera que separa un directorio de un marketplace, y una frontera dentro de otro módulo no se puede auditar.

#### `fed-puesta-en-marcha` · `PUENTE` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R07 · R08
- **Propósito:** Pone en marcha una plaza y VERIFICA que responde: un arranque que no se puede comprobar es una fe.
- **Depende de:** `fed-padron`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-puesta-en-marcha"` · `unidad: "nacional"` · `subscribes:` ["fed-puesta-en-marcha.poner.request", "fed-puesta-en-marcha.comprobar.request", "bocaos.federacion_plaza_viva", "project.activated"] · `publishes:` ["fed-puesta-en-marcha.poner.response", "fed-puesta-en-marcha.poner.failed", "fed-puesta-en-marcha.comprobar.response", "fed-puesta-en-marcha.comprobar.failed", "bocaos.federacion_verificacion_ok", "bocaos.federacion_verificacion_difiere"]
- **C · index.js:** `class FedPuestaEnMarcha extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_comprobar` (R08: versión declarada vs versión objetivo, estado y tiendas vivas. Si difiere, lo dice y avisa; NO mira dentro para averiguar por qué.) · `_intento` (R07: el intento con plaza, versión objetivo, responsable y hora. Pide arrancar; no configura, no siembra, no toca el mercado.) · `_poner` (op `poner` del diseño (R07, R08).)
- **E · handler:** `onPoner(e)` → `_atender(e, 'poner', 'fed-puesta-en-marcha.poner.response', d => this._poner(d))` · **CLASE: ORDEN**
- **E · handler:** `onComprobar(e)` → `_atender(e, 'comprobar', 'fed-puesta-en-marcha.comprobar.response', d => this._comprobar(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.federacion_verificacion_ok`, `bocaos.federacion_verificacion_difiere`
- **VERIFICACIÓN:** Poner en marcha una plaza que no existe → NO_HAY_PLAZA. Plaza que arranca con otra versión → DIFIERE(version) y `naciendo` no pasa a `operando`.
- **NO REUTILIZA / DECISIÓN:** `gateway-manager` arranca gateways de protocolo, no instalaciones de un vertical. Otro dominio.

#### `fed-soporte` · `PUENTE` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R18
- **Propósito:** El soporte nacional: caso con traza y plazo, sin canal permanente.
- **Depende de:** `fed-acceso`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-soporte"` · `unidad: "nacional"` · `subscribes:` ["fed-soporte.abrir.request", "fed-soporte.responder.request", "fed-soporte.escalar.request", "project.activated"] · `publishes:` ["fed-soporte.abrir.response", "fed-soporte.abrir.failed", "fed-soporte.responder.response", "fed-soporte.responder.failed", "fed-soporte.escalar.response", "fed-soporte.escalar.failed", "bocaos.federacion_caso_abierto", "bocaos.federacion_caso_escalado", "bocaos.federacion_soporte_sin_permiso"]
- **C · index.js:** `class FedSoporte extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_abrir` (R18: caso con plaza, tipo (software|método), hora y plazo. Sin permiso vivo de la plaza no hay caso de datos.) · `_escalar` (R18: si la plaza está caída no puede conceder permiso; sin permiso de emergencia declarado (Q46) el soporte hace lo que puede desde fuera y LO DICE.) · `_responder` (op `responder` del diseño (R18).)
- **E · handler:** `onAbrir(e)` → `_atender(e, 'abrir', 'fed-soporte.abrir.response', d => this._abrir(d))` · **CLASE: ORDEN**
- **E · handler:** `onResponder(e)` → `_atender(e, 'responder', 'fed-soporte.responder.response', d => this._responder(d))` · **CLASE: ORDEN**
- **E · handler:** `onEscalar(e)` → `_atender(e, 'escalar', 'fed-soporte.escalar.response', d => this._escalar(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `bocaos.federacion_caso_abierto`, `bocaos.federacion_caso_escalado`, `bocaos.federacion_soporte_sin_permiso`
- **VERIFICACIÓN:** Caso que pide 'los pedidos de Málaga' → `bocaos.federacion_soporte_sin_permiso` y ningún dato. Con permiso vivo → lee, y la traza se escribe ANTES de devolver.
- **NO REUTILIZA / DECISIÓN:** El soporte NO escribe la traza de lo que mira: se la pide a `fed-acceso`. El que mira no firma su propia coartada.

#### `fed-versiones` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R06 · R09
- **Propósito:** La versión de cada plaza y la compatibilidad declarada.
- **Depende de:** `fed-buzon`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-versiones"` · `unidad: "nacional"` · `subscribes:` ["bocaos.federacion_plaza_viva", "fed-versiones.de.request", "fed-versiones.compatible.request", "project.activated"] · `publishes:` ["fed-versiones.de.response", "fed-versiones.de.failed", "fed-versiones.compatible.response", "fed-versiones.compatible.failed", "bocaos.federacion_version_declarada", "bocaos.federacion_incompatible"]
- **C · index.js:** `class FedVersiones extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-versiones.json` por proyecto. Single-writer: nadie más escribe este hecho.
- **D · proyecciones internas:** `_anotar` (R06: plaza_id · versión · hora en que la declaró. Se anota lo que llega; nunca se escribe la versión de una plaza desde aquí.) · `_compatible` (R09: tabla cerrada [versión → qué puede]. Una plaza atrasada sigue operando: se salta lo que no entiende y lo declara.) · `_de` (op `de` del diseño (R06, R09).)
- **E · handler:** `onDe(e)` → `_atender(e, 'de', 'fed-versiones.de.response', d => this._de(d))` · **CLASE: PREGUNTA**
- **E · handler:** `onCompatible(e)` → `_atender(e, 'compatible', 'fed-versiones.compatible.response', d => this._compatible(d))` · **CLASE: PREGUNTA**
- **F · hechos que publica:** `bocaos.federacion_version_declarada`, `bocaos.federacion_incompatible`
- **VERIFICACIÓN:** Una plaza que no publica versión → NO_CONSTA y el cuadro muestra HUECO, no '0'. `compatible(plaza_vieja, hecho_nuevo)` → no + motivo, y el emisor se lo salta.
- **NO REUTILIZA / DECISIÓN:** No hay módulo de versiones de despliegue en Enki (`certificate-authority` firma artefactos, no versiones vivas por instalación). Se construye.

#### `fed-aviso` · `PUENTE` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** — (sin clase propia: materializa un paso del flujo)
- **Propósito:** La flecha N→P: `version.nueva` y `plaza.suspendida`. Las dos son ignorables: la plaza opera igual sin ellas.
- **Depende de:** `fed-versiones`, `fed-padron`
- **A · dependencias:** _shared/modulo-hibrido-reflejo · _shared/pos-persistencia · filesystem
- **B · module.json:** `name: "fed-aviso"` · `unidad: "nacional"` · `subscribes:` ["fed-aviso.emitir.request", "bocaos.federacion_plaza_estado", "bocaos.federacion_version_declarada"] · `publishes:` ["version.nueva", "plaza.suspendida", "bocaos.federacion_aviso_no_enviado"]
- **C · index.js:** `class FedAviso extends ModuloHibridoReflejo` — sin store. Publica hacia fuera con el par honesto (`<op>.response` / `<op>.failed` y el `enviado`/`fallido` del transporte); si el transporte falla, el hecho ya está escrito.
- **D · proyecciones internas:** `_compatible` (Pregunta a `fed-versiones.compatible` antes de emitir: lo que la plaza no entiende no se le manda, y se declara el salto.) · `_sin_respuesta` (No hay `.response`: el aviso no espera acuse. Esperar acuse convertiría un aviso en una dependencia de arranque.) · `_emitir` (op `emitir` del diseño (raíz).)
- **E · handler:** `onEmitir(e)` → `_atender(e, 'emitir', 'fed-aviso.emitir.response', d => this._emitir(d))` · **CLASE: ORDEN**
- **F · hechos que publica:** `version.nueva`, `plaza.suspendida`, `bocaos.federacion_aviso_no_enviado`
- **VERIFICACIÓN:** Parar el nacional: las plazas siguen. Emitir a una plaza atrasada → `aviso_no_enviado` con motivo y la plaza no se enteró.
- **NO REUTILIZA / DECISIÓN:** Un módulo de una sola dirección y sin respuesta parece poco. Es la flecha que la auditoría 4 vigila: si esta pieza pidiera acuse, apagar el nacional tumbaría medio negocio.


## 10 · Qué desaparece respecto a la v2, y por qué

### 10.1 · Las 15 hojas de tienda de la v2

| hoja de la v2 | destino en la v3 | por qué |
|---|---|---|
| `tienda-captura` (C01) | **RETIRADA** → `tienda-api` (ADAPTAR) + `pedidos` (ADAPTAR) | el alta de un pedido existe: `POST /tienda/pedido/:project` ya crea pedido, cuenta operativa y lo manda a cocina. Faltaba el bloque `entrega`, no el módulo |
| `tienda-hora-listo` (C04) | **RETIRADA** → `cocina` (REUTILIZAR) + `entrada-listo` (puente) | `cocina.mark-ready` ya emite `cocina.pedido_listo` con hora y dispositivo. Un segundo custodio de la misma hora son dos verdades |
| `tienda-cocina-visible` (C05) | **RETIRADA** → `aviso-cliente` | el estado podado es el texto que el cliente recibe; no necesita endpoint ni store |
| `tienda-marca` (D01) | **RETIRADA** → `carta-marketing` | perfil de marca por proyecto, con validación AJV, ya existe |
| `tienda-carta` (D02) | **RETIRADA** → `carta-digital` | proyección pública de la carta activa, ya existe |
| `tienda-precio` (D03) | **RETIRADA** → `tarifas` | precio por canal escrito en la carta del canal, ya existe |
| `tienda-carrito` (D04) | **RETIRADA** → `carta-digital` (PWA) | el carrito vive en el navegador del cliente (localStorage) y cierra en `tienda-api` |
| `tienda-cliente` (D05, L02) | **RETIRADA** → `pedidos` (D05) + `indice-plaza` (`_propiedad_cliente`, L02) | el cliente de la tienda es su histórico de pedidos; la guarda de que no cruza es del índice de la plaza |
| `tienda-radio` (D06) | **RETIRADA** → `censo-parte` | la zona que la tienda declara es parte del censo: «quién existe y hasta dónde llega» |
| `tienda-incentivo` (E02) | **RETIRADA** → `tarifa-pedido` | un solo escritor del precio (si la tienda y la plaza escriben, hay carrera) |
| `tienda-aviso-cliente` (C06) | **SUSTITUIDA** por `aviso-cliente` | el mismo contrato, pero con K02 dentro y con el texto de reparto (no de recogida) |
| `tienda-puntualidad` (L03) | **RENOMBRADA** `medida-cocina` | misma clase, mismo cálculo; cambia el nombre porque ya no es «de la tienda»: es la medida del mercado sobre la tienda |
| `tienda-panel` (L01) | **RENOMBRADA** `panel-tienda` | ídem: proyecta hechos de la plaza |
| `tienda-resumen` (L04) | **RENOMBRADA** `resumen-tienda` | ídem |
| `tienda-reclamacion` (K01) | **ABSORBIDA** por `aviso-tienda` | una reclamación que llega a Bocaos se DEVUELVE a la tienda por su canal: es el mismo puente con otra op |

**Resultado: 15 hojas menos, 6 hojas de pizzepos más (5 REUTILIZAR + 1 ficha de `tienda-api`), 2 puentes
nuevos (`entrada-listo`, `aviso-cliente`) y 3 renombradas.** 68 − 15 + 11 = **64**.

### 10.2 · Los 12 módulos que la v2 ya dejó construidos en `modules/bocaos/`

| módulo en disco | qué se hace | por qué |
|---|---|---|
| `config-mercado` 0.1.0 | **se queda** | es plaza pura (J01–J05, G01). Sin cambios |
| `estado-parte` 0.1.0 | **se queda** | I03/I04, censo vivo |
| `ruta-viva` 0.1.0 | **se queda** | B01–B06 |
| `propuesta` 0.2.0 | **se queda** | A13–A19, A27, A29, A33, M05 |
| `contrato-puntual` 0.1.0 | **se queda** | A24 |
| `foto-mercado` 0.1.0 | **se queda** | A02–A04 |
| `enlace` 0.1.0 | **se queda** (cambia la FORMA declarada: `micro-agente` → `reflejo`) | es 100 % determinista: no hay LLM en el cuello, y la forma es la regla. Un micro-agente que no piensa es un reflejo con otro nombre |
| `hecho-listo` 0.1.0 | **se queda** | A01. Su entrada `bocaos.listo_declarado` pasa a emitirla `entrada-listo` (antes `tienda-hora-listo`); el contrato no cambia |
| `hechos-reparto` 0.1.0 | **se queda** | F01–F03 |
| `pedido` 0.2.0 | **RETIRADO** → `pedido-mercado` | se llamaba `pedido` y publicaba dentro del espacio de nombres de pizzepos (`pedido.crear.request`, `pedido.aceptar.request`…), donde ya viven `pedido.get`, `pedido.cancel`, `pedido.list`. Además guardaba un pedido que no era suyo: el de la v3 sólo guarda el reparto, con el `pedido_id` de pizzepos como clave |
| `tienda-captura` 0.1.0 | **RETIRADO** | duplicaba `tienda-api` + `pedidos`. Su evento `bocaos.pedido_compuesto` desaparece; su hueco (`bocaos.precio_cerrado` se escuchaba y nadie lo emitía) lo cierra `tarifa-pedido` |
| `tienda-hora-listo` 0.1.0 | **RETIRADO** | duplicaba `cocina.mark-ready`. Su evento `bocaos.listo_declarado` lo emite ahora `entrada-listo` desde `cocina.pedido_listo` |

**Lo que esto dice del proceso, y conviene escribirlo**: la v2 llegó a construir (F4) 12 islas correctas de
la plaza y 2 islas de tienda que sobraban. El error no fue el diseño de las islas: fue no haber abierto
`modules/pizzepos/` antes de escribir el plano. Este documento se apoya en 388 `module.json` leídos.


## 11 · ESPINA `enki-plan` (JSON embebido — la consume `construir-modulos`)

```json enki-plan
{
 "proyecto": "bocaos",
 "proyecto_id": "bocaos",
 "origen": [
  "boveda/bocaos/proceso/fase3/esquemas/diseno-oop.md (F3 · 145 clases)",
  "boveda/bocaos/proceso/fase2/esquemas/esquema.md (F2 · piezas, formas, puertos)",
  "modules/**/module.json (inventario real: 388 manifiestos, 30 de pizzepos)"
 ],
 "inventario": "388 module.json en /home/admin/3enki/modules; 30 en modules/pizzepos/*. Leídos name/version/events/description de los 30, y el index.js de tienda-api, pedidos, cocina, whatsapp-bot, pago-gateway cuando el manifest prometía más que el contrato.",
 "regla": "Lo que la tienda HACE ya está hecho en pizzepos y se ENGANCHA por evento (pedido.creado · cocina.pedido_listo · pedido.cancelado · pedido.pagado). Lo que la tienda DECLARA al mercado lo guarda un custodio de la plaza. Bocaos construye SÓLO lo que decide (enlace, propuesta, ruta, contrato, hechos, acta, liquidación, censo, términos, config) y la federación. Cero require cruzado.",
 "unidades": {
  "nacional": "el registro · 0 ó 1 despliegue · nace con la segunda plaza",
  "plaza": "el mercado · 1 despliegue con N proyectos dentro (uno por tienda)",
  "tienda": "el negocio de alguien · N proyectos dentro de la plaza · su software es pizzepos"
 },
 "auditorias": {
  "nacional_sin_pedidos": true,
  "nacional_no_recauda": true,
  "ninguna_fila_cruza_de_plaza": "deuda declarada: capacidad de un rider en dos plazas (§7.9 F3)",
  "apagar_el_nacional": true
 },
 "orden": [
  "scheduler",
  "acta-decisiones",
  "config-mercado",
  "censo-parte",
  "estado-parte",
  "terminos-parte",
  "ruta-viva",
  "carta-digital",
  "carta-marketing",
  "cocina",
  "pedidos",
  "tarifas",
  "tienda-api",
  "contrato-tramos",
  "frontera-plaza",
  "indice-plaza",
  "pedido-mercado",
  "aviso-cliente",
  "aviso-tienda",
  "hecho-listo",
  "instrucciones-acceso",
  "tarifa-pedido",
  "entrada-listo",
  "foto-mercado",
  "propuesta",
  "canal-rider",
  "contrato-puntual",
  "chat-enmascarado",
  "hechos-reparto",
  "medida-cocina",
  "panel-tienda",
  "enlace",
  "escalada-enlace",
  "redaccion-propuesta",
  "incidencia-reparto",
  "lectura-incidencia",
  "regla-fallo",
  "cargo-fallo",
  "disputa-fallo",
  "liquidacion",
  "factura-gestion",
  "cobro-gestion",
  "cuenta-parte",
  "aviso-sala",
  "dictamen-revision",
  "accion-sancion",
  "cola-sala",
  "salud-mercado",
  "publicacion",
  "resumen-tienda",
  "fed-buzon",
  "fed-marca",
  "fed-padron",
  "fed-acceso",
  "fed-acta",
  "fed-censo",
  "fed-buscador",
  "fed-consolidacion",
  "fed-canon",
  "fed-enrutado",
  "fed-puesta-en-marcha",
  "fed-soporte",
  "fed-versiones",
  "fed-aviso"
 ],
 "hojas": [
  {
   "slug": "scheduler",
   "forma": "micro-agente",
   "accion": "REUTILIZAR",
   "unidad": "plaza",
   "clases": [],
   "reutiliza": [
    "scheduler"
   ],
   "depende_de": [],
   "subscribes": [],
   "publishes": [
    "scheduler.job.triggered",
    "scheduler.job.completed",
    "scheduler.job.failed",
    "scheduler.job.created",
    "scheduler.job.updated",
    "scheduler.job.deleted",
    "scheduler.job.enabled",
    "scheduler.job.disabled"
   ],
   "proyecciones_internas": [],
   "handlers": [],
   "hechos": [
    "scheduler.job.triggered"
   ],
   "nota": "Crear en `project.activated` un job `bocaos-liquidacion-semanal` (cron) y otro `bocaos-plaza-viva` (interval); cada consumidor filtra por nombre. Job que falla → `scheduler.job.failed`, y el ciclo se declara fallido (nunca se da por cerrado).",
   "peldaño": "0 · la plaza sola"
  },
  {
   "slug": "acta-decisiones",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "O02"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [],
   "subscribes": [
    "acta-decisiones.firmar.request",
    "acta-decisiones.de.request",
    "acta-decisiones.listar.request",
    "project.activated"
   ],
   "publishes": [
    "acta-decisiones.firmar.response",
    "acta-decisiones.firmar.failed",
    "acta-decisiones.de.response",
    "acta-decisiones.de.failed",
    "acta-decisiones.listar.response",
    "acta-decisiones.listar.failed",
    "bocaos.acta_anotada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_asentar",
     "descripcion": "O02: cambio + motivo + autor + ámbito + vigencia, o no hay cambio."
    },
    {
     "nombre": "_de_instante",
     "descripcion": "O02: qué estaba vigente entonces, para explicar una decisión vieja."
    },
    {
     "nombre": "_ambito",
     "descripcion": "§8: la firma lleva ámbito (tienda | plaza) y no se cruza. El dueño de la plaza no puede firmar una solicitud de una tienda."
    },
    {
     "nombre": "_firmar",
     "descripcion": "op `firmar` del diseño (O02)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (O02)."
    },
    {
     "nombre": "_listar",
     "descripcion": "op `listar` del diseño (O02)."
    }
   ],
   "handlers": [
    {
     "op": "firmar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "listar",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.acta_anotada"
   ],
   "peldaño": "1 · lo que declara la plaza"
  },
  {
   "slug": "config-mercado",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "J01",
    "J02",
    "J03",
    "J04",
    "J05",
    "G01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "acta-decisiones"
   ],
   "subscribes": [
    "config-mercado.declarar.request",
    "config-mercado.politica.request",
    "config-mercado.simular.request",
    "bocaos.dictamen_firmado",
    "project.activated"
   ],
   "publishes": [
    "config-mercado.declarar.response",
    "config-mercado.declarar.failed",
    "config-mercado.politica.response",
    "config-mercado.politica.failed",
    "config-mercado.simular.response",
    "config-mercado.simular.failed",
    "bocaos.politica_declarada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_declarar",
     "descripcion": "J01: ámbito (plaza|tienda) · cuatro números · autor · desde. Una tienda sólo puede fijar SUS cuatro números; no hay dónde poner un quinto criterio."
    },
    {
     "nombre": "_politica_vigente",
     "descripcion": "J04: la de la TIENDA si existe y está vigente; si no, la de la PLAZA. La precedencia es una tabla, no una negociación."
    },
    {
     "nombre": "_forma",
     "descripcion": "J01: cuatro umbrales, en m · min · min · c€, en AND. La vertical fija la forma; aquí sólo viven los valores."
    },
    {
     "nombre": "_tres_esperas",
     "descripcion": "G01: N1 tienda 8 min · N2 portal 5 min · N3 entrega 10 min (Q28)."
    },
    {
     "nombre": "_zona",
     "descripcion": "J03: cobertura de la plaza por zona. Es la mitad de la intersección con D06."
    },
    {
     "nombre": "_simular",
     "descripcion": "J05: re-ejecuta la comparación sobre hechos históricos y declara sus límites. No aplica."
    },
    {
     "nombre": "_politica",
     "descripcion": "op `politica` del diseño (J01, J02, J03, J04, J05, G01)."
    }
   ],
   "handlers": [
    {
     "op": "declarar",
     "clase": "ORDEN"
    },
    {
     "op": "politica",
     "clase": "PREGUNTA"
    },
    {
     "op": "simular",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.politica_declarada"
   ],
   "peldaño": "1 · lo que declara la plaza"
  },
  {
   "slug": "censo-parte",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "I01",
    "I02",
    "M02",
    "M03",
    "P04",
    "D06"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager",
    "credential-manager"
   ],
   "depende_de": [
    "config-mercado"
   ],
   "subscribes": [
    "censo-parte.alta.request",
    "censo-parte.checklist.request",
    "censo-parte.de.request",
    "censo-parte.zona.request",
    "bocaos.terminos_aceptados",
    "project.activated"
   ],
   "publishes": [
    "censo-parte.alta.response",
    "censo-parte.alta.failed",
    "censo-parte.checklist.response",
    "censo-parte.checklist.failed",
    "censo-parte.de.response",
    "censo-parte.de.failed",
    "censo-parte.zona.response",
    "censo-parte.zona.failed",
    "bocaos.censo_actualizado",
    "bocaos.censo_incompleto"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_alta_tienda",
     "descripcion": "I01: da de alta la tienda Y crea su proyecto en el despliegue (`project-manager`). Una tienda sin proyecto no tiene carta, ni carrito, ni clientes."
    },
    {
     "nombre": "_alta_rider",
     "descripcion": "I02: identidad fiscal, KYC, autónomo, seguro, vehículo (Q34). Incompleta → no entra en A04."
    },
    {
     "nombre": "_checklist",
     "descripcion": "P04: lo que falta, derivado del alta. Sin criterios ocultos."
    },
    {
     "nombre": "_sin_exclusividad",
     "descripcion": "M03: falla si aparece exclusividad, permanencia, turno, cuota mínima o antigüedad (Q35: 0)."
    },
    {
     "nombre": "_zona_rider",
     "descripcion": "M02: las zonas que el rider declara y cambia cuando quiere."
    },
    {
     "nombre": "_elegibles",
     "descripcion": "A04: estado, zona y capacidad. Ni un cuarto dato. Sin antigüedad."
    },
    {
     "nombre": "_alta",
     "descripcion": "op `alta` del diseño (I01, I02, M02, M03, P04, D06)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (I01, I02, M02, M03, P04, D06)."
    },
    {
     "nombre": "_zona",
     "descripcion": "op `zona` del diseño (I01, I02, M02, M03, P04, D06)."
    },
    {
     "nombre": "_zona_tienda",
     "descripcion": "D06: la zona que la tienda declara, con hora y autor. La plaza la GUARDA y no la recorta; S02 la intersecta con la cobertura de la plaza. Aquí vive porque el censo es exactamente «quién existe y hasta dónde llega» — la tienda no tiene módulo propio en Bocaos: su casa es pizzepos."
    }
   ],
   "handlers": [
    {
     "op": "alta",
     "clase": "ORDEN"
    },
    {
     "op": "checklist",
     "clase": "PREGUNTA"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "zona",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.censo_actualizado",
    "bocaos.censo_incompleto"
   ],
   "peldaño": "2 · el censo y el estado"
  },
  {
   "slug": "estado-parte",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "I03",
    "I04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "censo-parte"
   ],
   "subscribes": [
    "estado-parte.alta.request",
    "estado-parte.declarar.request",
    "estado-parte.de.request",
    "estado-parte.vigentes.request",
    "bocaos.contrato_creado",
    "bocaos.contrato_cerrado",
    "bocaos.parte_sancionada",
    "bocaos.capacidad_declarada",
    "project.activated"
   ],
   "publishes": [
    "estado-parte.alta.response",
    "estado-parte.alta.failed",
    "estado-parte.declarar.response",
    "estado-parte.declarar.failed",
    "estado-parte.de.response",
    "estado-parte.de.failed",
    "estado-parte.vigentes.response",
    "estado-parte.vigentes.failed",
    "bocaos.estado_parte_declarado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_transitar",
     "descripcion": "I04: 'ocupado' no lo pone la sala, lo pone el contrato vivo. La pausa sólo la declara el rider."
    },
    {
     "nombre": "_vigentes",
     "descripcion": "I03/I04: disponibles por zona; el que está en pausa no aparece y nadie puede levantarla."
    },
    {
     "nombre": "_alta",
     "descripcion": "op `alta` del diseño (I03, I04)."
    },
    {
     "nombre": "_declarar",
     "descripcion": "op `declarar` del diseño (I03, I04)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (I03, I04)."
    }
   ],
   "handlers": [
    {
     "op": "alta",
     "clase": "ORDEN"
    },
    {
     "op": "declarar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "vigentes",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.estado_parte_declarado"
   ],
   "peldaño": "2 · el censo y el estado"
  },
  {
   "slug": "terminos-parte",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "I08"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "censo-parte"
   ],
   "subscribes": [
    "terminos-parte.aceptar.request",
    "terminos-parte.de.request",
    "project.activated"
   ],
   "publishes": [
    "terminos-parte.aceptar.response",
    "terminos-parte.aceptar.failed",
    "terminos-parte.de.response",
    "terminos-parte.de.failed",
    "bocaos.terminos_aceptados"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_aceptar",
     "descripcion": "I08: cambio de términos NO retroactivo; quien no acepta la nueva sigue con la vieja."
    },
    {
     "nombre": "_vigentes",
     "descripcion": "I08: puerta dura — sin términos, `enlace` no propone y `liquidacion` no devenga."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (I08)."
    }
   ],
   "handlers": [
    {
     "op": "aceptar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.terminos_aceptados"
   ],
   "peldaño": "2 · el censo y el estado"
  },
  {
   "slug": "ruta-viva",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "B01",
    "B02",
    "B03",
    "B04",
    "B05",
    "B06"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [],
   "subscribes": [
    "ruta-viva.posicion.request",
    "ruta-viva.paradas.request",
    "ruta-viva.promesa.request",
    "ruta-viva.capacidad.request",
    "ruta-viva.de.request",
    "bocaos.contrato_creado",
    "bocaos.contrato_cerrado",
    "bocaos.pedido_listo",
    "bocaos.hecho_reparto_anotado",
    "project.activated"
   ],
   "publishes": [
    "ruta-viva.posicion.response",
    "ruta-viva.posicion.failed",
    "ruta-viva.paradas.response",
    "ruta-viva.paradas.failed",
    "ruta-viva.promesa.response",
    "ruta-viva.promesa.failed",
    "ruta-viva.capacidad.response",
    "ruta-viva.capacidad.failed",
    "ruta-viva.de.response",
    "ruta-viva.de.failed",
    "bocaos.posicion_anotada",
    "bocaos.promesa_guardada",
    "bocaos.capacidad_declarada",
    "bocaos.trayecto_cerrado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_promesa",
     "descripcion": "B03: sólo se puede MEJORAR (bajar la hora). Empeorarla exige pasar el umbral de retraso (A31)."
    },
    {
     "nombre": "_paradas",
     "descripcion": "B02: se DERIVA de los contratos vivos; si un contrato se cierra, su parada desaparece sola."
    },
    {
     "nombre": "_ordenar",
     "descripcion": "B04: optimiza UNA ruta y sólo dentro de ella, con desempate declarado. La misma ruta da el mismo orden siempre."
    },
    {
     "nombre": "_capacidad",
     "descripcion": "B05: se declara, no se estima. Es POR PLAZA, y ése es el agujero de §7.9 (Q44/Q45)."
    },
    {
     "nombre": "_fin",
     "descripcion": "B06: cierra el trayecto cuando no queda parada viva."
    },
    {
     "nombre": "_posicion",
     "descripcion": "op `posicion` del diseño (B01, B02, B03, B04, B05, B06)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (B01, B02, B03, B04, B05, B06)."
    }
   ],
   "handlers": [
    {
     "op": "posicion",
     "clase": "ORDEN"
    },
    {
     "op": "paradas",
     "clase": "PREGUNTA"
    },
    {
     "op": "promesa",
     "clase": "ORDEN"
    },
    {
     "op": "capacidad",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.posicion_anotada",
    "bocaos.promesa_guardada",
    "bocaos.capacidad_declarada",
    "bocaos.trayecto_cerrado"
   ],
   "peldaño": "3 · la ruta viva"
  },
  {
   "slug": "carta-digital",
   "forma": "conversor",
   "accion": "REUTILIZAR",
   "unidad": "tienda",
   "clases": [
    "D02",
    "D04"
   ],
   "reutiliza": [
    "pizzepos/carta-digital",
    "pizzepos/carta-manager",
    "pizzepos/tarifas",
    "pizzepos/contenido"
   ],
   "depende_de": [],
   "subscribes": [],
   "publishes": [],
   "proyecciones_internas": [],
   "handlers": [],
   "hechos": [],
   "nota": "Activar una carta en carta-manager → `get_carta_publica` la sirve sin copia. El carrito vive en la PWA (localStorage) y cierra en `tienda-api`; no hay segunda carta ni segundo carrito en el servidor.",
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "carta-marketing",
   "forma": "custodio",
   "accion": "REUTILIZAR",
   "unidad": "tienda",
   "clases": [
    "D01"
   ],
   "reutiliza": [
    "pizzepos/carta-marketing"
   ],
   "depende_de": [],
   "subscribes": [
    "carta-marketing.validar.request",
    "carta-marketing.get_perfil.request",
    "carta-marketing.update_perfil.request",
    "carta-marketing.guardar_copy.request"
   ],
   "publishes": [
    "marketing.perfil.actualizado",
    "marketing.copy.generado"
   ],
   "proyecciones_internas": [],
   "handlers": [],
   "hechos": [
    "marketing.perfil.actualizado"
   ],
   "nota": "`carta-marketing.get_perfil` devuelve la marca del proyecto; esa marca es la única firma que aparece en el aviso al cliente (`aviso-cliente`, K02).",
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "cocina",
   "forma": "custodio",
   "accion": "REUTILIZAR",
   "unidad": "tienda",
   "clases": [
    "C04"
   ],
   "reutiliza": [
    "pizzepos/cocina"
   ],
   "depende_de": [],
   "subscribes": [
    "pedido.enviado_cocina",
    "pedido.cancelado",
    "cuenta.creada",
    "cuenta.actualizada",
    "cuenta.eliminada",
    "caja.cerrada",
    "dia.iniciado"
   ],
   "publishes": [
    "cocina.item_preparando",
    "cocina.item_avanzado",
    "cocina.item_preparado",
    "cocina.item_ticket",
    "cocina.pedido_listo",
    "periferico.display",
    "cocina.device_registered",
    "cocina.device_unregistered",
    "cocina.device_updated"
   ],
   "proyecciones_internas": [],
   "handlers": [],
   "hechos": [
    "cocina.pedido_listo"
   ],
   "nota": "`cocina.mark-ready` sobre un pedido de tienda → `cocina.pedido_listo` con pedido_id, cuenta_id, project_id y timestamp. Ese timestamp es la hora de listo que `entrada-listo` sella (C04: declarar tiene consecuencia; no se adelanta ni se corrige).",
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "pedidos",
   "forma": "custodio",
   "accion": "ADAPTAR",
   "unidad": "tienda",
   "clases": [
    "D05"
   ],
   "reutiliza": [
    "pizzepos/pedidos"
   ],
   "depende_de": [],
   "subscribes": [
    "comandero.enviar_cocina",
    "variacion.validada",
    "variacion.rechazada",
    "cuenta.creada",
    "catalogo.actualizado",
    "producto.creado",
    "producto.actualizado",
    "caja.cerrada",
    "dia.iniciado",
    "pago.confirmado",
    "servicio.cambiado"
   ],
   "publishes": [
    "pedido.creado",
    "pedido.item_agregado",
    "pedido.item_actualizado",
    "pedido.item_eliminado",
    "pedido.enviado_cocina",
    "pedido.completado",
    "pedido.cancelado",
    "pedido.pagado",
    "pedido.recogido",
    "servicio.cambiado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_tienda_domicilio",
     "descripcion": "C01/C02: acepta `modo_consumo:'domicilio'`, guarda `entrega{direccion, oferta_centimos, instrucciones?}` y la publica DENTRO de `pedido.creado`."
    },
    {
     "nombre": "_identidad_cliente",
     "descripcion": "D05: el cliente de la tienda ES su histórico de pedidos — nombre + teléfono por pedido, aislado por proyecto. No hay ficha global ni identidad entre tiendas: eso es el producto, no un fallo."
    }
   ],
   "handlers": [],
   "hechos": [
    "pedido.creado",
    "pedido.cancelado",
    "pedido.pagado"
   ],
   "nota": "Pedido con `modo_consumo:'domicilio'` → `pedido.creado` con `entrega:{direccion, oferta_centimos}` y `cuenta_id` (la cuenta operativa ya se crea hoy). Pedido pickup → `pedido.creado` idéntico al de hoy, sin bloque `entrega`. Un pedido de domicilio entra en cocina igual que hoy (vía `cuentas` → `comandero.enviar_cocina`).",
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "tarifas",
   "forma": "custodio",
   "accion": "REUTILIZAR",
   "unidad": "tienda",
   "clases": [
    "D03"
   ],
   "reutiliza": [
    "pizzepos/tarifas"
   ],
   "depende_de": [],
   "subscribes": [
    "project.activated",
    "project.deactivated",
    "tarifas.config.solicitada"
   ],
   "publishes": [
    "tarifas.config.actualizada"
   ],
   "proyecciones_internas": [],
   "handlers": [],
   "hechos": [
    "tarifas.config.actualizada"
   ],
   "nota": "`tarifas.config.actualizada` trae el estado completo (general, canales, variantes) y quien lo necesite cachea. El precio cerrado del pedido = precio de tarifas + `bocaos.precio_cerrado` (E03).",
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "tienda-api",
   "forma": "puente",
   "accion": "ADAPTAR",
   "unidad": "tienda",
   "clases": [
    "C01"
   ],
   "reutiliza": [
    "pizzepos/tienda-api"
   ],
   "depende_de": [],
   "subscribes": [
    "pedido.crear-tienda.response",
    "servicio.cambiado"
   ],
   "publishes": [
    "tienda.pedido.recibido",
    "tienda.pedido.completado",
    "tienda.pedido.fallido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_validar_entrega",
     "descripcion": "C01: si llega `entrega`, exige `direccion` no vacía y `oferta_centimos` entero ≥ 0. Sin `entrega` el módulo se comporta exactamente como hoy."
    }
   ],
   "handlers": [],
   "hechos": [
    "tienda.pedido.recibido",
    "tienda.pedido.completado",
    "tienda.pedido.fallido"
   ],
   "nota": "POST /tienda/pedido/:project con `entrega:{direccion, oferta_centimos}` → 201 y el pedido creado (comportamiento actual intacto). POST sin `entrega` → mismo 201 de siempre (pickup). Body con `entrega` incompleto → 400 INVALID_INPUT con el campo que falta, nunca 500.",
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "contrato-tramos",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "E06",
    "N02"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "terminos-parte"
   ],
   "subscribes": [
    "contrato-tramos.declarar.request",
    "contrato-tramos.vigente.request",
    "contrato-tramos.simular.request",
    "bocaos.acta_anotada",
    "bocaos.terminos_aceptados",
    "project.activated"
   ],
   "publishes": [
    "contrato-tramos.declarar.response",
    "contrato-tramos.declarar.failed",
    "contrato-tramos.vigente.response",
    "contrato-tramos.vigente.failed",
    "contrato-tramos.simular.response",
    "contrato-tramos.simular.failed",
    "bocaos.tramos_actualizados"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_declarar",
     "descripcion": "E06: tramo fijo + tramo por pedido, por parte. Sin antigüedad, sin exclusividad, sin cuota mínima (Q34/Q35)."
    },
    {
     "nombre": "_vigentes",
     "descripcion": "E06: los tramos que estaban vivos cuando ocurrió el hecho, no los de hoy (R5 del determinismo)."
    },
    {
     "nombre": "_simular",
     "descripcion": "N02: qué habría pasado con otros tramos sobre hechos cerrados."
    },
    {
     "nombre": "_vigente",
     "descripcion": "op `vigente` del diseño (E06, N02)."
    }
   ],
   "handlers": [
    {
     "op": "declarar",
     "clase": "ORDEN"
    },
    {
     "op": "vigente",
     "clase": "PREGUNTA"
    },
    {
     "op": "simular",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.tramos_actualizados"
   ],
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "frontera-plaza",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "S01",
    "S02"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "censo-parte",
    "config-mercado"
   ],
   "subscribes": [
    "frontera-plaza.cubre.request",
    "frontera-plaza.zonas.request"
   ],
   "publishes": [
    "frontera-plaza.cubre.response",
    "frontera-plaza.cubre.failed",
    "frontera-plaza.zonas.response",
    "frontera-plaza.zonas.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_de",
     "descripcion": "S01: dirección → plaza_id | NO_CONSTA | AMBIGUA(plazas). Si dos coberturas se solapan y no hay desempate declarado, NO HAY PEDIDO (Q52)."
    },
    {
     "nombre": "_filtrar",
     "descripcion": "S02: intersección de la cobertura de la plaza (J03) y lo que cada tienda declara que reparte (D06)."
    },
    {
     "nombre": "_a_la_inversa",
     "descripcion": "S02: qué tiendas llegan aquí, para el escaparate."
    },
    {
     "nombre": "_cubre",
     "descripcion": "op `cubre` del diseño (S01, S02)."
    },
    {
     "nombre": "_zonas",
     "descripcion": "op `zonas` del diseño (S01, S02)."
    }
   ],
   "handlers": [
    {
     "op": "cubre",
     "clase": "PREGUNTA"
    },
    {
     "op": "zonas",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.frontera_ambigua",
    "bocaos.direccion_sin_plaza"
   ],
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "indice-plaza",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "D07",
    "D08",
    "L02"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "censo-parte",
    "frontera-plaza"
   ],
   "subscribes": [
    "indice-plaza.indice.request",
    "indice-plaza.guarda.request"
   ],
   "publishes": [
    "indice-plaza.indice.response",
    "indice-plaza.indice.failed",
    "indice-plaza.guarda.response",
    "indice-plaza.guarda.failed",
    "bocaos.indice_servido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_indice",
     "descripcion": "D07: proyección del censo, ya filtrada por cobertura. No se escribe, no guarda posiciones."
    },
    {
     "nombre": "_neutro",
     "descripcion": "D08: orden declarado y neutro. Sin ranking, sin destacados, sin prioridad comprada. Filtrar no es ordenar: la guarda cubre las dos."
    },
    {
     "nombre": "_marca_ajena",
     "descripcion": "K02: ninguna comunicación al cliente final lleva la marca de Bocaos ni la de la plaza. Se consulta en el camino caliente de `tienda-aviso-cliente`."
    },
    {
     "nombre": "_guarda",
     "descripcion": "op `guarda` del diseño (D07, D08, L02)."
    },
    {
     "nombre": "_neutralidad",
     "descripcion": "D08: revisa el orden mostrado y FALLA si hay un solo campo que permita pagar por posición; filtrar no es ordenar."
    },
    {
     "nombre": "_propiedad_cliente",
     "descripcion": "L02: cualquier consulta que cruce tiendas devuelve FALLA; también dentro de la misma plaza."
    }
   ],
   "handlers": [
    {
     "op": "indice",
     "clase": "PREGUNTA"
    },
    {
     "op": "guarda",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.indice_servido"
   ],
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "pedido-mercado",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "C02",
    "C07"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "censo-parte"
   ],
   "subscribes": [
    "pedido.creado",
    "pedido.cancelado",
    "pedido-mercado.aceptar.request",
    "pedido-mercado.rechazar.request",
    "pedido-mercado.cancelar.request",
    "pedido-mercado.de.request",
    "bocaos.contrato_cerrado",
    "bocaos.hecho_reparto_anotado",
    "project.activated"
   ],
   "publishes": [
    "pedido-mercado.aceptar.response",
    "pedido-mercado.aceptar.failed",
    "pedido-mercado.rechazar.response",
    "pedido-mercado.rechazar.failed",
    "pedido-mercado.cancelar.response",
    "pedido-mercado.cancelar.failed",
    "pedido-mercado.de.response",
    "pedido-mercado.de.failed",
    "bocaos.pedido_creado",
    "bocaos.pedido_aceptado",
    "bocaos.pedido_rechazado",
    "bocaos.pedido_cancelado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_crear",
     "descripcion": "C02: el pedido nace con precio congelado y plaza_id; sin precio no nace."
    },
    {
     "nombre": "_transitar",
     "descripcion": "C02: RECIBIDO → ACEPTADO (la tienda acepta, Q27) → LISTO (C04) → EN_REPARTO (contrato) → ENTREGADO (prueba o su falta declarada)."
    },
    {
     "nombre": "_cancelacion",
     "descripcion": "C07: tabla de quién y hasta cuándo. Quién paga el rechazo es Q36: mientras no haya respuesta se anota y NO SE COBRA a nadie."
    },
    {
     "nombre": "_aceptar",
     "descripcion": "op `aceptar` del diseño (C02, C07)."
    },
    {
     "nombre": "_rechazar",
     "descripcion": "op `rechazar` del diseño (C02, C07)."
    },
    {
     "nombre": "_cancelar",
     "descripcion": "op `cancelar` del diseño (C02, C07)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (C02, C07)."
    },
    {
     "nombre": "_pedido_mercado",
     "descripcion": "`_nacer` (C02: al consumir `pedido.creado` de pizzepos toma pedido_id · project_slug · total_centimos · items_count"
    },
    {
     "nombre": "_puede_cancelar",
     "descripcion": "C07: quién y hasta cuándo; mientras no haya respuesta se anota la cancelación y NO se cobra a nadie."
    }
   ],
   "handlers": [
    {
     "op": "aceptar",
     "clase": "ORDEN"
    },
    {
     "op": "rechazar",
     "clase": "ORDEN"
    },
    {
     "op": "cancelar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.pedido_creado",
    "bocaos.pedido_aceptado",
    "bocaos.pedido_rechazado",
    "bocaos.pedido_cancelado"
   ],
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "aviso-cliente",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "C05",
    "C06",
    "K02"
   ],
   "reutiliza": [
    "whatsapp-bot",
    "telegram-service"
   ],
   "depende_de": [
    "pedido-mercado"
   ],
   "subscribes": [
    "bocaos.pedido_creado",
    "bocaos.pedido_aceptado",
    "bocaos.contrato_creado",
    "bocaos.pedido_listo",
    "bocaos.hecho_reparto_anotado",
    "aviso-cliente.componer.request"
   ],
   "publishes": [
    "whatsapp.mensaje.enviado",
    "whatsapp.envio.fallido",
    "bocaos.cliente_avisado",
    "bocaos.aviso_rechazado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_componer",
     "descripcion": "op `componer` del diseño (C05, C06, K02)."
    },
    {
     "nombre": "_podar",
     "descripcion": "C05: cuatro estados para el cliente — recibido · en cocina · en camino · entregado. No ve «en cola», ni «sin rider», ni «esperando propuesta»."
    }
   ],
   "handlers": [
    {
     "op": "componer",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.cliente_avisado",
    "bocaos.aviso_rechazado"
   ],
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "aviso-tienda",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "C03",
    "K01"
   ],
   "reutiliza": [
    "telegram-service"
   ],
   "depende_de": [
    "pedido-mercado",
    "censo-parte"
   ],
   "subscribes": [
    "bocaos.pedido_creado",
    "bocaos.contrato_creado",
    "bocaos.hueco_nombrado",
    "aviso-tienda.devolver.request"
   ],
   "publishes": [
    "telegram.send_message.request",
    "aviso-tienda.enviado",
    "aviso-tienda.fallido",
    "bocaos.reclamacion_devuelta"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_avisar",
     "descripcion": "C03: al canal de la tienda (su POS, su impresora, su pantalla). Si el aviso no llega, el pedido existe igual."
    },
    {
     "nombre": "_sin_orden",
     "descripcion": "C03: no acepta, no arranca la cocina, no compromete hora. Si pudiera, la plaza estaría operando el restaurante."
    },
    {
     "nombre": "_devolver",
     "descripcion": "op `devolver` del diseño (C03, K01)."
    }
   ],
   "handlers": [
    {
     "op": "devolver",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "aviso-tienda.enviado",
    "aviso-tienda.fallido",
    "bocaos.reclamacion_devuelta"
   ],
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "hecho-listo",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "pedido-mercado"
   ],
   "subscribes": [
    "hecho-listo.anotar.request",
    "hecho-listo.desmentir.request",
    "hecho-listo.de.request",
    "bocaos.listo_declarado",
    "project.activated"
   ],
   "publishes": [
    "hecho-listo.anotar.response",
    "hecho-listo.anotar.failed",
    "hecho-listo.desmentir.response",
    "hecho-listo.desmentir.failed",
    "hecho-listo.de.response",
    "hecho-listo.de.failed",
    "bocaos.pedido_listo",
    "bocaos.hecho_desmentido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "A01: exige precio_congelado; sin él no hay hecho y el pedido espera nombrando el hueco (A34)."
    },
    {
     "nombre": "_sello",
     "descripcion": "A01: el plaza_id lo pone la plaza al anotar. La tienda no puede declarar un pedido de otra plaza."
    },
    {
     "nombre": "_desmentir",
     "descripcion": "A01: hecho nuevo que desmiente al anterior; las dos horas quedan y el pedido se vuelve a medir."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (A01)."
    }
   ],
   "handlers": [
    {
     "op": "anotar",
     "clase": "ORDEN"
    },
    {
     "op": "desmentir",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.pedido_listo",
    "bocaos.hecho_desmentido"
   ],
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "instrucciones-acceso",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "F05"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "pedido-mercado"
   ],
   "subscribes": [
    "instrucciones-acceso.anotar.request",
    "instrucciones-acceso.de.request",
    "bocaos.contrato_cerrado",
    "project.activated"
   ],
   "publishes": [
    "instrucciones-acceso.anotar.response",
    "instrucciones-acceso.anotar.failed",
    "instrucciones-acceso.de.response",
    "instrucciones-acceso.de.failed",
    "bocaos.instrucciones_anotadas"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_escribir",
     "descripcion": "F05: texto del cliente para un pedido. Dato personal del cliente DEL cliente: no entra en ningún agregado."
    },
    {
     "nombre": "_mostrar",
     "descripcion": "F05: sólo al rider del contrato vivo, sólo mientras el contrato está vivo. Sin contrato → NO_HAY."
    },
    {
     "nombre": "_anotar",
     "descripcion": "op `anotar` del diseño (F05)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (F05)."
    }
   ],
   "handlers": [
    {
     "op": "anotar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.instrucciones_anotadas"
   ],
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "tarifa-pedido",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "E01",
    "E02",
    "E03",
    "E07"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "pedido-mercado",
    "contrato-tramos"
   ],
   "subscribes": [
    "pedido.creado",
    "tarifa-pedido.oferta.request",
    "tarifa-pedido.incentivo.request",
    "tarifa-pedido.subir.request",
    "tarifa-pedido.de.request",
    "project.activated"
   ],
   "publishes": [
    "tarifa-pedido.oferta.response",
    "tarifa-pedido.oferta.failed",
    "tarifa-pedido.incentivo.response",
    "tarifa-pedido.incentivo.failed",
    "tarifa-pedido.subir.response",
    "tarifa-pedido.subir.failed",
    "tarifa-pedido.de.response",
    "tarifa-pedido.de.failed",
    "bocaos.precio_cerrado",
    "bocaos.oferta_subida"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_estipular",
     "descripcion": "E01: lo que el cliente pone por el reparto, congelado con el pedido. Ni la tienda ni la sala ni Bocaos lo tocan."
    },
    {
     "nombre": "_componer",
     "descripcion": "E03: oferta + incentivo (E02, de la tienda) + tramos vigentes → céntimos y desglose. Lo lee A11 ya compuesto; no se recalcula dentro del enlace."
    },
    {
     "nombre": "_subir",
     "descripcion": "E07: subida con tope autorizado por el cliente (Q43). Quién paga el escalón es Q17: se anota el acto y la deuda queda visible, no cobrada."
    },
    {
     "nombre": "_no_baja",
     "descripcion": "E07: nunca por debajo de lo ya ofrecido a un rider con propuesta viva."
    },
    {
     "nombre": "_oferta",
     "descripcion": "op `oferta` del diseño (E01, E02, E03, E07)."
    },
    {
     "nombre": "_incentivo",
     "descripcion": "op `incentivo` del diseño (E01, E02, E03, E07)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (E01, E02, E03, E07)."
    },
    {
     "nombre": "_congelar_al_nacer",
     "descripcion": "E01: escucha `pedido.creado` de pizzepos y congela `entrega.oferta_centimos` con la hora; después NADIE la toca, ni la tienda, ni la sala, ni Bocaos."
    },
    {
     "nombre": "_precio",
     "descripcion": "E03: sólo suma oferta + incentivo. Es la entrada de `cobra` (A11): sin este número cerrado no hay propuesta."
    }
   ],
   "handlers": [
    {
     "op": "oferta",
     "clase": "ORDEN"
    },
    {
     "op": "incentivo",
     "clase": "ORDEN"
    },
    {
     "op": "subir",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.precio_cerrado",
    "bocaos.oferta_subida"
   ],
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "entrada-listo",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "pedido-mercado",
    "tarifa-pedido",
    "hecho-listo",
    "censo-parte"
   ],
   "subscribes": [
    "cocina.pedido_listo",
    "entrada-listo.reintentar.request"
   ],
   "publishes": [
    "entrada-listo.componer.response",
    "entrada-listo.componer.failed",
    "bocaos.listo_declarado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_reintentar",
     "descripcion": "op `reintentar` del diseño (raíz)."
    },
    {
     "nombre": "_componer",
     "descripcion": "C04 → A01: pide `pedido.get` a pizzepos (dirección, instrucciones, total) y `tarifa-pedido.de` (precio de reparto). Si falta destino o precio, NO inventa: emite `bocaos.hueco_nombrado` con el dato que falta (A34) y el pedido NO entra al enlace."
    }
   ],
   "handlers": [
    {
     "op": "reintentar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.listo_declarado"
   ],
   "peldaño": "4 · el pedido y su precio"
  },
  {
   "slug": "foto-mercado",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A02",
    "A03",
    "A04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "estado-parte",
    "ruta-viva",
    "config-mercado",
    "frontera-plaza"
   ],
   "subscribes": [
    "foto-mercado.componer.request",
    "foto-mercado.elegibles.request",
    "foto-mercado.reproducir.request"
   ],
   "publishes": [
    "foto-mercado.componer.response",
    "foto-mercado.componer.failed",
    "foto-mercado.elegibles.response",
    "foto-mercado.elegibles.failed",
    "foto-mercado.reproducir.response",
    "foto-mercado.reproducir.failed",
    "bocaos.foto_congelada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_componer",
     "descripcion": "A02: riders ← I04 · posición ← B01 · paradas ← B02 · promesas ← B03 · capacidad ← B05 · local ← L03 · política ← J04 (DOS CAPAS)."
    },
    {
     "nombre": "_congelar",
     "descripcion": "A03: la foto se congela con huella. Dentro de F nadie lee el mundo: si leyera, la explicación dejaría de ser cierta."
    },
    {
     "nombre": "_elegibles",
     "descripcion": "A04: estado, zona y capacidad. El que tiene un dato ausente ENTRA con su lista de faltantes: descartar es decidir."
    },
    {
     "nombre": "_reproducir",
     "descripcion": "op `reproducir` del diseño (A02, A03, A04)."
    }
   ],
   "handlers": [
    {
     "op": "componer",
     "clase": "PREGUNTA"
    },
    {
     "op": "elegibles",
     "clase": "PREGUNTA"
    },
    {
     "op": "reproducir",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.foto_congelada"
   ],
   "peldaño": "6 · el corazón"
  },
  {
   "slug": "propuesta",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A13",
    "A14",
    "A15",
    "A19",
    "A27",
    "A29",
    "A33",
    "M05"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "foto-mercado",
    "config-mercado"
   ],
   "subscribes": [
    "propuesta.emitir.request",
    "propuesta.acuse.request",
    "propuesta.aceptar.request",
    "propuesta.rechazar.request",
    "propuesta.cerrar.request",
    "propuesta.de.request",
    "bocaos.propuesta_entregada",
    "bocaos.propuesta_no_entregada",
    "project.activated"
   ],
   "publishes": [
    "propuesta.emitir.response",
    "propuesta.emitir.failed",
    "propuesta.acuse.response",
    "propuesta.acuse.failed",
    "propuesta.aceptar.response",
    "propuesta.aceptar.failed",
    "propuesta.rechazar.response",
    "propuesta.rechazar.failed",
    "propuesta.cerrar.response",
    "propuesta.cerrar.failed",
    "propuesta.de.response",
    "propuesta.de.failed",
    "bocaos.propuesta_emitida",
    "bocaos.propuesta_acusada",
    "bocaos.propuesta_aceptada",
    "bocaos.propuesta_rechazada",
    "bocaos.propuesta_caducada_sin_acuse",
    "bocaos.propuesta_caducada_sin_respuesta"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_emitir",
     "descripcion": "A13: una viva por pedido (A33). Lleva dentro la foto con su huella, la política con su CAPA y su autor, y los cuatro números."
    },
    {
     "nombre": "_bloqueo",
     "descripcion": "A14: el bloqueo por pedido es lo que hace que gane el primero, no el preferido. Un desenlace por propuesta; el segundo recibe YA_NO_ESTA y no paga nada."
    },
    {
     "nombre": "_ventana",
     "descripcion": "A15: validez 20 s · acuse ≤5 s · decisión 10 s (Q42). Dos relojes, dos caducidades distintas."
    },
    {
     "nombre": "_aceptar",
     "descripcion": "A19: un solo sí, atómico, con hora. Nunca una asignación: la aceptación la produce el rider."
    },
    {
     "nombre": "_vista",
     "descripcion": "M05: los cuatro números SIEMPRE en el mismo orden + la frase + de qué plaza + qué umbrales (capa y autor) le juzgaron."
    },
    {
     "nombre": "_reproducir",
     "descripcion": "A29: misma foto + misma política → misma propuesta. Devuelve el mismo resultado o falla."
    },
    {
     "nombre": "_sin_asignacion",
     "descripcion": "A27: no hay camino de pedido a rider sin aceptación libre. Falla si alguien lo abre."
    },
    {
     "nombre": "_acuse",
     "descripcion": "op `acuse` del diseño (A13, A14, A15, A19, A27, A29, A33, M05)."
    },
    {
     "nombre": "_rechazar",
     "descripcion": "op `rechazar` del diseño (A13, A14, A15, A19, A27, A29, A33, M05)."
    },
    {
     "nombre": "_cerrar",
     "descripcion": "op `cerrar` del diseño (A13, A14, A15, A19, A27, A29, A33, M05)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (A13, A14, A15, A19, A27, A29, A33, M05)."
    }
   ],
   "handlers": [
    {
     "op": "emitir",
     "clase": "ORDEN"
    },
    {
     "op": "acuse",
     "clase": "ORDEN"
    },
    {
     "op": "aceptar",
     "clase": "ORDEN"
    },
    {
     "op": "rechazar",
     "clase": "ORDEN"
    },
    {
     "op": "cerrar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.propuesta_emitida",
    "bocaos.propuesta_acusada",
    "bocaos.propuesta_aceptada",
    "bocaos.propuesta_rechazada",
    "bocaos.propuesta_caducada_sin_acuse",
    "bocaos.propuesta_caducada_sin_respuesta"
   ],
   "peldaño": "6 · el corazón"
  },
  {
   "slug": "canal-rider",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "M04"
   ],
   "reutiliza": [
    "telegram-service",
    "whatsapp-bot"
   ],
   "depende_de": [
    "propuesta"
   ],
   "subscribes": [
    "bocaos.propuesta_emitida",
    "telegram.callback.received",
    "whatsapp.mensaje.recibido",
    "canal-rider.retirar.request"
   ],
   "publishes": [
    "telegram.send_message.request",
    "whatsapp.mensaje.enviado",
    "whatsapp.envio.fallido",
    "bocaos.propuesta_entregada",
    "bocaos.propuesta_no_entregada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_entregar",
     "descripcion": "M04: mensaje con los cuatro números, la frase, de qué plaza y qué umbrales. Retirada a los 5 s si no hay acuse."
    },
    {
     "nombre": "_acuse",
     "descripcion": "M04: el callback es el acuse, el sí o el no. Sin acuse, CADUCADA_SIN_ACUSE: el canal falló, no el rider."
    },
    {
     "nombre": "_sin_asignar",
     "descripcion": "M04: entrega una propuesta a UN rider. Nunca dos a la vez por el mismo pedido."
    },
    {
     "nombre": "_retirar",
     "descripcion": "op `retirar` del diseño (M04)."
    }
   ],
   "handlers": [
    {
     "op": "retirar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.propuesta_entregada",
    "bocaos.propuesta_no_entregada"
   ],
   "peldaño": "6 · el corazón"
  },
  {
   "slug": "contrato-puntual",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A24"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "propuesta",
    "pedido-mercado"
   ],
   "subscribes": [
    "contrato-puntual.crear.request",
    "contrato-puntual.de.request",
    "contrato-puntual.cerrar.request",
    "bocaos.propuesta_aceptada",
    "bocaos.hecho_reparto_anotado",
    "project.activated"
   ],
   "publishes": [
    "contrato-puntual.crear.response",
    "contrato-puntual.crear.failed",
    "contrato-puntual.de.response",
    "contrato-puntual.de.failed",
    "contrato-puntual.cerrar.response",
    "contrato-puntual.cerrar.failed",
    "bocaos.contrato_creado",
    "bocaos.contrato_cerrado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_crear",
     "descripcion": "A24: sólo desde una aceptación con acuse. Sin aceptación no hay constructor: la asignación no existe."
    },
    {
     "nombre": "_cerrar",
     "descripcion": "A24: con el hecho de entrega. La parada desaparece de B02 y deja de proyectarse."
    },
    {
     "nombre": "_sin_duracion",
     "descripcion": "A24: no tiene turno ni jornada. Si tuviera duración, el negocio sería otro (inspección de trabajo)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (A24)."
    }
   ],
   "handlers": [
    {
     "op": "crear",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "cerrar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.contrato_creado",
    "bocaos.contrato_cerrado"
   ],
   "peldaño": "6 · el corazón"
  },
  {
   "slug": "chat-enmascarado",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "F04"
   ],
   "reutiliza": [
    "whatsapp-bot",
    "telegram-service"
   ],
   "depende_de": [
    "contrato-puntual"
   ],
   "subscribes": [
    "bocaos.contrato_creado",
    "chat-enmascarado.entregar.request"
   ],
   "publishes": [
    "bocaos.mensaje_entregado",
    "bocaos.mensaje_rechazado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_enmascarar",
     "descripcion": "F04: alias por contrato, no por persona. Al cerrar el contrato, el alias muere."
    },
    {
     "nombre": "_sin_agregados",
     "descripcion": "F04: cero metadatos sobre la conversación (art. 15 de la Directiva). No hay histórico legible por nadie."
    },
    {
     "nombre": "_entregar",
     "descripcion": "op `entregar` del diseño (F04)."
    }
   ],
   "handlers": [
    {
     "op": "entregar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.mensaje_entregado",
    "bocaos.mensaje_rechazado"
   ],
   "peldaño": "7 · el reparto y la prueba"
  },
  {
   "slug": "hechos-reparto",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "F01",
    "F02",
    "F03"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "contrato-puntual"
   ],
   "subscribes": [
    "hechos-reparto.anotar.request",
    "hechos-reparto.prueba.request",
    "hechos-reparto.acta.request",
    "bocaos.contrato_creado",
    "bocaos.pedido_listo",
    "project.activated"
   ],
   "publishes": [
    "hechos-reparto.anotar.response",
    "hechos-reparto.anotar.failed",
    "hechos-reparto.prueba.response",
    "hechos-reparto.prueba.failed",
    "hechos-reparto.acta.response",
    "hechos-reparto.acta.failed",
    "bocaos.hecho_reparto_anotado",
    "bocaos.prueba_anotada",
    "bocaos.acta_incompleta"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "F01: hecho con hora y autor. Sin hora no es un hecho, es una impresión."
    },
    {
     "nombre": "_prueba",
     "descripcion": "F02: foto, firma o código; si no hay prueba, se anota la FALTA — que es un hecho distinto de no tener nada."
    },
    {
     "nombre": "_acta",
     "descripcion": "F01: compone el acta de un reparto; si falta un hecho, devuelve INCOMPLETA con el nombre del que falta (Q30: la prueba es el evento)."
    }
   ],
   "handlers": [
    {
     "op": "anotar",
     "clase": "ORDEN"
    },
    {
     "op": "prueba",
     "clase": "ORDEN"
    },
    {
     "op": "acta",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.hecho_reparto_anotado",
    "bocaos.prueba_anotada",
    "bocaos.acta_incompleta"
   ],
   "peldaño": "7 · el reparto y la prueba"
  },
  {
   "slug": "medida-cocina",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "L03"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "hecho-listo",
    "hechos-reparto"
   ],
   "subscribes": [
    "medida-cocina.medir.request",
    "medida-cocina.historial.request"
   ],
   "publishes": [
    "medida-cocina.medir.response",
    "medida-cocina.medir.failed",
    "medida-cocina.historial.response",
    "medida-cocina.historial.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_medir",
     "descripcion": "L03: distribución de hora-de-listo frente a lo prometido, por franja, con n. Sin datos suficientes → NO_CONSTA."
    },
    {
     "nombre": "_no_nota",
     "descripcion": "L03: ni estrellas ni 3 sobre 5. Una nota es un juicio; una distribución es información."
    },
    {
     "nombre": "_historial",
     "descripcion": "op `historial` del diseño (L03)."
    }
   ],
   "handlers": [
    {
     "op": "medir",
     "clase": "PREGUNTA"
    },
    {
     "op": "historial",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [],
   "peldaño": "5 · el histórico del local"
  },
  {
   "slug": "panel-tienda",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "L01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "medida-cocina",
    "frontera-plaza",
    "config-mercado"
   ],
   "subscribes": [
    "panel-tienda.ver.request"
   ],
   "publishes": [
    "panel-tienda.ver.response",
    "panel-tienda.ver.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_ver",
     "descripcion": "L01: lee de `medida-cocina` (L03), de la plaza (propuestas, pedidos sin rider) y de `config-mercado` (qué capa de umbrales rige)."
    },
    {
     "nombre": "_sin_version_amable",
     "descripcion": "L01: un solo número. Si hubiera una versión para el que paga y otra para el que sufre, el mercado dejaría de corregir."
    }
   ],
   "handlers": [
    {
     "op": "ver",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [],
   "peldaño": "5 · el histórico del local"
  },
  {
   "slug": "enlace",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A05",
    "A06",
    "A07",
    "A08",
    "A09",
    "A10",
    "A11",
    "A12",
    "A16",
    "A17",
    "A20",
    "A21",
    "A22",
    "A23",
    "A25",
    "A28",
    "A30",
    "A31",
    "A34",
    "A35"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "foto-mercado",
    "propuesta",
    "canal-rider",
    "medida-cocina",
    "tarifa-pedido"
   ],
   "subscribes": [
    "enlace.ejecutar.request",
    "bocaos.pedido_listo",
    "bocaos.hecho_desmentido",
    "bocaos.propuesta_rechazada",
    "bocaos.propuesta_caducada_sin_respuesta",
    "bocaos.escalada_reintentar"
   ],
   "publishes": [
    "enlace.ejecutar.response",
    "enlace.ejecutar.failed",
    "bocaos.medidas_calculadas",
    "bocaos.hueco_nombrado",
    "bocaos.enlace_completado",
    "bocaos.enlace_agotado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_ruta_base",
     "descripcion": "A05: ruta del rider a la tienda, con el puerto Ruta."
    },
    {
     "nombre": "_con_parada",
     "descripcion": "A06: inserta una parada de OTRA tienda si y sólo si plaza_id(parada)==plaza_id(pedido)==plaza_id(rider) → A35."
    },
    {
     "nombre": "_desvio",
     "descripcion": "A07: metros de más por pasar por el local."
    },
    {
     "nombre": "_espera",
     "descripcion": "A08: minutos que esperaría si llega antes de que esté listo; si llega después, 0 y la espera es un hecho del reparto."
    },
    {
     "nombre": "_retraso",
     "descripcion": "A09: minutos que añade a las paradas que ya lleva. _agregado (A10): suma por parada, con tope."
    },
    {
     "nombre": "_cobra",
     "descripcion": "A11: lee el precio YA compuesto (E03) y el coste declarado del rider. Sin coste → neto NO_CONSTA y el candidato va a A34."
    },
    {
     "nombre": "_pasa",
     "descripcion": "A12: desvío < umbral ∧ espera < umbral ∧ retraso < umbral ∧ cobra > 0. Una tabla AND sobre la política de la tienda o de la plaza."
    },
    {
     "nombre": "_razones",
     "descripcion": "A16: conjunto CERRADO de razones, con la capa y el autor del umbral que juzgó."
    },
    {
     "nombre": "_frase",
     "descripcion": "A17: la frase derivada del conjunto cerrado. Funciona cuando el agente (A18) se cae: el adorno no es el mínimo legal."
    },
    {
     "nombre": "_hora_aceptacion",
     "descripcion": "A20: la hora del sí, con su hueco entre emisión y decisión."
    },
    {
     "nombre": "_rechazo",
     "descripcion": "A21: rechazar no cuesta nada — ni ahora ni en la siguiente propuesta. _sin_puntuacion (A22) falla si aparece una nota."
    },
    {
     "nombre": "_caducidad",
     "descripcion": "A23: sin respuesta en la ventana: el candidato se salta y se sigue."
    },
    {
     "nombre": "_siguiente",
     "descripcion": "A25: avanza al siguiente candidato en el orden declarado (no por conveniencia)."
    },
    {
     "nombre": "_sin_optimizador",
     "descripcion": "A28: la entrada es un hecho y una foto, no una lista de pedidos. Falla si alguien mete un barrido."
    },
    {
     "nombre": "_sin_captura",
     "descripcion": "A32: la cuota no depende de km ahorrados ni de pedidos enlazados. _por_trayecto (A30): se enlazan rutas, no clientes. _no_rompe_promesa (A31): ninguna promesa ya dada empeora más allá del umbral."
    },
    {
     "nombre": "_hueco",
     "descripcion": "A34: si falta un dato, se NOMBRA («sin posición fresca», «sin precio compuesto», «sin histórico del local», «sin coste del rider») y el candidato se salta."
    },
    {
     "nombre": "_intra_plaza",
     "descripcion": "A35: plaza_id(pedido)==plaza_id(rider)==plaza_id(propuesta) en toda propuesta emitida y toda parada insertada."
    },
    {
     "nombre": "_ejecutar",
     "descripcion": "op `ejecutar` del diseño (A05, A06, A07, A08, A09, A10, A11, A12, A16, A17, A20, A21, A22, A23, A25, A28, A30, A31, A34, A35)."
    }
   ],
   "handlers": [
    {
     "op": "ejecutar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.medidas_calculadas",
    "bocaos.hueco_nombrado",
    "bocaos.enlace_completado",
    "bocaos.enlace_agotado"
   ],
   "peldaño": "6 · el corazón"
  },
  {
   "slug": "escalada-enlace",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A26"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "enlace",
    "tarifa-pedido"
   ],
   "subscribes": [
    "bocaos.enlace_agotado"
   ],
   "publishes": [
    "bocaos.escalada_pedida",
    "bocaos.escalada_reintentar",
    "aviso-sala.caso.request"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_peldano",
     "descripcion": "A26/Q43: peldaño 2 a los 30 s; hasta el tope autorizado; 5 min de cancelación."
    },
    {
     "nombre": "_tope",
     "descripcion": "A26: el tope lo autorizó el cliente al pedir. Sin tope → no se sube, se agota."
    },
    {
     "nombre": "_agotar",
     "descripcion": "A26: agotada la escalada, el caso va a la sala. El pedido no muere: queda con nombre."
    },
    {
     "nombre": "_escalar",
     "descripcion": "op `escalar` del diseño (A26)."
    }
   ],
   "handlers": [
    {
     "op": "escalar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.escalada_pedida",
    "bocaos.escalada_reintentar"
   ],
   "peldaño": "6 · el corazón"
  },
  {
   "slug": "redaccion-propuesta",
   "forma": "micro-agente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A18"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "propuesta",
    "enlace"
   ],
   "subscribes": [
    "redaccion-propuesta.adornar.request"
   ],
   "publishes": [
    "redaccion-propuesta.adornar.response",
    "redaccion-propuesta.adornar.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "cajon_adornar",
     "descripcion": "A18: el cajón del blueprint (lenguaje). El reflejo sólo valida y publica."
    },
    {
     "nombre": "_validador",
     "descripcion": "A18: todo número que aparezca tiene que estar en la entrada; toda razón tiene que estar en A16. Lo que no está, rechaza."
    },
    {
     "nombre": "_adorno",
     "descripcion": "A18: sin él, `enlace` usa la frase derivada (A17) y nadie nota la diferencia en el negocio."
    },
    {
     "nombre": "_adornar",
     "descripcion": "op `adornar` del diseño (A18)."
    }
   ],
   "handlers": [
    {
     "op": "adornar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.propuesta_redactada",
    "bocaos.redaccion_rechazada"
   ],
   "peldaño": "6 · el corazón"
  },
  {
   "slug": "incidencia-reparto",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "F06"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "hechos-reparto"
   ],
   "subscribes": [
    "bocaos.hecho_reparto_anotado",
    "incidencia-reparto.abrir.request"
   ],
   "publishes": [
    "incidencia-reparto.abrir.response",
    "incidencia-reparto.abrir.failed",
    "bocaos.incidencia_abierta"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_abrir",
     "descripcion": "F06: relato libre + autor + hora + pedido. Sin campos obligatorios que fuercen una versión de los hechos."
    },
    {
     "nombre": "_sin_clasificar",
     "descripcion": "F06: no decide si es grave. Clasificar es leer (F07)."
    }
   ],
   "handlers": [
    {
     "op": "abrir",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.incidencia_abierta"
   ],
   "peldaño": "7 · el reparto y la prueba"
  },
  {
   "slug": "lectura-incidencia",
   "forma": "micro-agente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "F07"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "incidencia-reparto"
   ],
   "subscribes": [
    "lectura-incidencia.clasificar.request"
   ],
   "publishes": [
    "lectura-incidencia.clasificar.response",
    "lectura-incidencia.clasificar.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "cajon_clasificar",
     "descripcion": "F07: el cajón del blueprint. Devuelve una etiqueta de la lista cerrada."
    },
    {
     "nombre": "_validador",
     "descripcion": "F07: sólo etiquetas de la lista; cualquier otra cosa → `lectura_ambigua` y la incidencia va a la cola sin etiqueta."
    },
    {
     "nombre": "_no_es_juez",
     "descripcion": "F07: no dice si el fallo existió (eso es G02)."
    },
    {
     "nombre": "_clasificar",
     "descripcion": "op `clasificar` del diseño (F07)."
    }
   ],
   "handlers": [
    {
     "op": "clasificar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.incidencia_clasificada",
    "bocaos.lectura_ambigua"
   ],
   "peldaño": "7 · el reparto y la prueba"
  },
  {
   "slug": "regla-fallo",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "G02",
    "G03",
    "G06"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "hechos-reparto"
   ],
   "subscribes": [
    "regla-fallo.evaluar.request",
    "bocaos.acta_incompleta",
    "bocaos.incidencia_abierta"
   ],
   "publishes": [
    "regla-fallo.evaluar.response",
    "regla-fallo.evaluar.failed",
    "bocaos.fallo_medido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_medir",
     "descripcion": "G02: un fallo existe si y sólo si los hechos con hora lo verifican. Sin acta completa no hay fallo."
    },
    {
     "nombre": "_adjudicar",
     "descripcion": "G03: tabla cerrada de quién responde. Devuelve QUIÉN, no CUÁNTO: los importes siguen sin número y se declaran."
    },
    {
     "nombre": "_traza",
     "descripcion": "G06: la evidencia que sostiene la adjudicación, enumerable."
    },
    {
     "nombre": "_evaluar",
     "descripcion": "op `evaluar` del diseño (G02, G03, G06)."
    }
   ],
   "handlers": [
    {
     "op": "evaluar",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.fallo_medido"
   ],
   "peldaño": "8 · el dinero de la plaza"
  },
  {
   "slug": "cargo-fallo",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "G04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "regla-fallo"
   ],
   "subscribes": [
    "bocaos.fallo_medido",
    "cargo-fallo.anular.request",
    "cargo-fallo.de.request",
    "project.activated"
   ],
   "publishes": [
    "cargo-fallo.anular.response",
    "cargo-fallo.anular.failed",
    "cargo-fallo.de.response",
    "cargo-fallo.de.failed",
    "bocaos.cargo_anotado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "G04: deuda con partes, evidencia y plaza. Sin evidencia NO nace (y se publica el intento)."
    },
    {
     "nombre": "_no_descuento",
     "descripcion": "G04: una deuda no se compensa con un devengo. La plaza no retiene (H06)."
    },
    {
     "nombre": "_anular",
     "descripcion": "op `anular` del diseño (G04)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (G04)."
    }
   ],
   "handlers": [
    {
     "op": "anular",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.cargo_anotado"
   ],
   "peldaño": "8 · el dinero de la plaza"
  },
  {
   "slug": "disputa-fallo",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "G05"
   ],
   "reutiliza": [
    "telegram-service"
   ],
   "depende_de": [
    "cargo-fallo"
   ],
   "subscribes": [
    "bocaos.cargo_anotado",
    "disputa-fallo.abrir.request"
   ],
   "publishes": [
    "disputa-fallo.abrir.response",
    "disputa-fallo.abrir.failed",
    "aviso-sala.caso.request"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_abrir",
     "descripcion": "G05: cargo + parte + motivo + hechos citados. No decide: encola (D3)."
    },
    {
     "nombre": "_no_borra",
     "descripcion": "G05: la deuda sigue; lo que cambia es que no se cobra hasta el dictamen."
    }
   ],
   "handlers": [
    {
     "op": "abrir",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.disputa_abierta"
   ],
   "peldaño": "8 · el dinero de la plaza"
  },
  {
   "slug": "liquidacion",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "H01",
    "H02",
    "H05",
    "E04",
    "E05",
    "A32",
    "H06"
   ],
   "reutiliza": [
    "scheduler"
   ],
   "depende_de": [
    "contrato-tramos",
    "hechos-reparto",
    "cargo-fallo"
   ],
   "subscribes": [
    "liquidacion.abrir.request",
    "liquidacion.cerrar.request",
    "liquidacion.de.request",
    "liquidacion.cuenta.request",
    "scheduler.job.triggered",
    "bocaos.contrato_creado",
    "bocaos.hecho_reparto_anotado",
    "bocaos.cargo_anotado",
    "project.activated"
   ],
   "publishes": [
    "liquidacion.abrir.response",
    "liquidacion.abrir.failed",
    "liquidacion.cerrar.response",
    "liquidacion.cerrar.failed",
    "liquidacion.de.response",
    "liquidacion.de.failed",
    "liquidacion.cuenta.response",
    "liquidacion.cuenta.failed",
    "bocaos.devengo_anotado",
    "bocaos.ciclo_cerrado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_devengar",
     "descripcion": "H01: por contrato cerrado del periodo. Tienda: fijo del tramo + 20 c/pedido. Rider: 10 c/pedido. NUNCA por km ahorrado, NUNCA por % del ticket."
    },
    {
     "nombre": "_dos_cifras",
     "descripcion": "H01/E04: seguro + en duda. Un pedido cancelado tras aceptar queda 'en duda' (Q18), no se elige."
    },
    {
     "nombre": "_cerrar",
     "descripcion": "H02: cierre INMUTABLE del periodo. Se crea el job `bocaos.ciclo_semanal` en project.activated y se filtra el disparo del scheduler."
    },
    {
     "nombre": "_mora",
     "descripcion": "H05: recordatorio → recargo → suspensión. La suspensión NO corta pedidos en vuelo ni propuestas vivas."
    },
    {
     "nombre": "_comision",
     "descripcion": "E04: la comisión de coordinación, derivada del tramo vigente CUANDO OCURRIÓ el hecho."
    },
    {
     "nombre": "_reparto",
     "descripcion": "E05: reparto del pago por parte. Conversor puro: no guarda, compone desde el cierre."
    },
    {
     "nombre": "_no_retencion",
     "descripcion": "H06/A32: la plaza no retiene. Falla si un cierre descuenta una deuda o un km ahorrado."
    },
    {
     "nombre": "_abrir",
     "descripcion": "op `abrir` del diseño (H01, H02, H05, E04, E05, A32, H06)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (H01, H02, H05, E04, E05, A32, H06)."
    },
    {
     "nombre": "_cuenta",
     "descripcion": "op `cuenta` del diseño (H01, H02, H05, E04, E05, A32, H06)."
    }
   ],
   "handlers": [
    {
     "op": "abrir",
     "clase": "ORDEN"
    },
    {
     "op": "cerrar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "cuenta",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.devengo_anotado",
    "bocaos.ciclo_cerrado"
   ],
   "peldaño": "8 · el dinero de la plaza"
  },
  {
   "slug": "factura-gestion",
   "forma": "conversor",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "H03"
   ],
   "reutiliza": [
    "contabilidad-fiscal/factura-electronica"
   ],
   "depende_de": [
    "liquidacion"
   ],
   "subscribes": [
    "factura-gestion.emitir.request",
    "factura-gestion.de.request"
   ],
   "publishes": [
    "factura-gestion.emitir.response",
    "factura-gestion.emitir.failed",
    "factura-gestion.de.response",
    "factura-gestion.de.failed",
    "bocaos.documento_emitido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_emitir",
     "descripcion": "H03: cierre + parte → documento de cobro. Una factura por cierre y parte; la segunda es rectificativa."
    },
    {
     "nombre": "_iva",
     "descripcion": "H03: el IVA es Q4 (abierto): el campo existe, el tipo no se inventa."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (H03)."
    }
   ],
   "handlers": [
    {
     "op": "emitir",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.documento_emitido"
   ],
   "peldaño": "8 · el dinero de la plaza"
  },
  {
   "slug": "cobro-gestion",
   "forma": "puente",
   "accion": "ADAPTAR",
   "unidad": "plaza",
   "clases": [
    "H04"
   ],
   "reutiliza": [
    "pago-gateway"
   ],
   "depende_de": [
    "factura-gestion",
    "liquidacion"
   ],
   "subscribes": [
    "bocaos.documento_emitido",
    "pago.confirmado",
    "pago.rechazado",
    "pago.reembolsado",
    "pago.importe_discrepante",
    "pago.revertir.request",
    "pago.revertir.response"
   ],
   "publishes": [
    "pago.iniciar.request",
    "pago.reembolsar.request",
    "pago.revertir.response",
    "bocaos.cobro_confirmado",
    "bocaos.cobro_fallido"
   ],
   "proyecciones_internas": [],
   "handlers": [
    {
     "op": "revertir",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.cobro_confirmado",
    "bocaos.cobro_fallido"
   ],
   "nota": "Documento de un rider → `pago.iniciar.request` con su cuenta conectada (credencial por proyecto, ya real) → `pago.confirmado` → `bocaos.cobro_confirmado`. Reversión antes de liquidar → `pago.revertir` (la op NUEVA) y constancia. Discrepancia de importe → `pago.importe_discrepante` y el caso NO se da por cobrado.",
   "peldaño": "8 · el dinero de la plaza"
  },
  {
   "slug": "cuenta-parte",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "Q01",
    "M01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "liquidacion",
    "cobro-gestion"
   ],
   "subscribes": [
    "cuenta-parte.ver.request",
    "cuenta-parte.cartera.request"
   ],
   "publishes": [
    "cuenta-parte.ver.response",
    "cuenta-parte.ver.failed",
    "cuenta-parte.cartera.response",
    "cuenta-parte.cartera.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_ver",
     "descripcion": "Q01: devengado · cobrado · deuda · en duda, con la versión de tramos que estaba viva."
    },
    {
     "nombre": "_cartera",
     "descripcion": "M01: la cartera del rider en ESTA plaza. Un rider en dos plazas tiene dos carteras y un solo cuerpo (§7.9)."
    }
   ],
   "handlers": [
    {
     "op": "ver",
     "clase": "PREGUNTA"
    },
    {
     "op": "cartera",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "— (ninguno: sólo calcula)"
   ],
   "peldaño": "8 · el dinero de la plaza"
  },
  {
   "slug": "aviso-sala",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "I07"
   ],
   "reutiliza": [
    "telegram-service"
   ],
   "depende_de": [],
   "subscribes": [
    "aviso-sala.caso.request"
   ],
   "publishes": [
    "telegram.send_message.request",
    "aviso-sala.enviado",
    "aviso-sala.fallido",
    "cola-sala.encolar.request"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_avisar",
     "descripcion": "I07: caso + traza + plazo al destinatario declarado (un agente, hoy)."
    },
    {
     "nombre": "_vencido",
     "descripcion": "I07: si el aviso caduca sin respuesta, se publica el vencimiento: el caso sigue en la cola."
    },
    {
     "nombre": "_caso",
     "descripcion": "op `caso` del diseño (I07)."
    }
   ],
   "handlers": [
    {
     "op": "caso",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "aviso-sala.enviado",
    "aviso-sala.fallido"
   ],
   "peldaño": "9 · la operación humana"
  },
  {
   "slug": "dictamen-revision",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "O04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [],
   "subscribes": [
    "dictamen-revision.firmar.request",
    "dictamen-revision.de.request",
    "bocaos.caso_encolado",
    "project.activated"
   ],
   "publishes": [
    "dictamen-revision.firmar.response",
    "dictamen-revision.firmar.failed",
    "dictamen-revision.de.response",
    "dictamen-revision.de.failed",
    "bocaos.dictamen_firmado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_dictaminar",
     "descripcion": "O04: caso + firmante + efecto permitido + motivo. El efecto prohibido (rehacer la propuesta) no se puede escribir."
    },
    {
     "nombre": "_efectos",
     "descripcion": "O04: compensar · corregir histórico · cambiar la regla hacia adelante. Tres, cerrados."
    },
    {
     "nombre": "_firma",
     "descripcion": "O04: la firma dice el ámbito; una revisión de tienda no la firma el dueño de la plaza."
    },
    {
     "nombre": "_firmar",
     "descripcion": "op `firmar` del diseño (O04)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (O04)."
    }
   ],
   "handlers": [
    {
     "op": "firmar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.dictamen_firmado"
   ],
   "peldaño": "9 · la operación humana"
  },
  {
   "slug": "accion-sancion",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "P03"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "acta-decisiones",
    "estado-parte"
   ],
   "subscribes": [
    "accion-sancion.aplicar.request",
    "accion-sancion.revocar.request",
    "accion-sancion.de.request",
    "bocaos.dictamen_firmado",
    "project.activated"
   ],
   "publishes": [
    "accion-sancion.aplicar.response",
    "accion-sancion.aplicar.failed",
    "accion-sancion.revocar.response",
    "accion-sancion.revocar.failed",
    "accion-sancion.de.response",
    "accion-sancion.de.failed",
    "bocaos.parte_sancionada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_aplicar",
     "descripcion": "P03: parte + motivo + plazo + firmante. Sin firmante no hay sanción."
    },
    {
     "nombre": "_limites",
     "descripcion": "P03: no corta pedidos en vuelo ni propuestas vivas; no toca el dinero."
    },
    {
     "nombre": "_revocar",
     "descripcion": "op `revocar` del diseño (P03)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (P03)."
    }
   ],
   "handlers": [
    {
     "op": "aplicar",
     "clase": "ORDEN"
    },
    {
     "op": "revocar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.parte_sancionada"
   ],
   "peldaño": "9 · la operación humana"
  },
  {
   "slug": "cola-sala",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "P01",
    "O03",
    "P02"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "censo-parte"
   ],
   "subscribes": [
    "cola-sala.encolar.request",
    "cola-sala.tomar.request",
    "cola-sala.cerrar.request",
    "cola-sala.listar.request",
    "aviso-sala.caso.request",
    "bocaos.hueco_nombrado",
    "bocaos.incidencia_abierta",
    "project.activated"
   ],
   "publishes": [
    "cola-sala.encolar.response",
    "cola-sala.encolar.failed",
    "cola-sala.tomar.response",
    "cola-sala.tomar.failed",
    "cola-sala.cerrar.response",
    "cola-sala.cerrar.failed",
    "cola-sala.listar.response",
    "cola-sala.listar.failed",
    "bocaos.caso_encolado",
    "bocaos.caso_cerrado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_encolar",
     "descripcion": "P01: caso con tipo, traza y plazo. Vencer NO resuelve: sube de prioridad y sigue vivo."
    },
    {
     "nombre": "_vista",
     "descripcion": "P02: lo que la parte ve de su caso, sin datos de la otra parte."
    },
    {
     "nombre": "_revision",
     "descripcion": "O03: la revisión humana es de la plaza donde se decidió; el nacional no puede dictaminar sobre una propuesta que no tiene."
    },
    {
     "nombre": "_tomar",
     "descripcion": "op `tomar` del diseño (P01, O03, P02)."
    },
    {
     "nombre": "_cerrar",
     "descripcion": "op `cerrar` del diseño (P01, O03, P02)."
    },
    {
     "nombre": "_listar",
     "descripcion": "op `listar` del diseño (P01, O03, P02)."
    }
   ],
   "handlers": [
    {
     "op": "encolar",
     "clase": "ORDEN"
    },
    {
     "op": "tomar",
     "clase": "ORDEN"
    },
    {
     "op": "cerrar",
     "clase": "ORDEN"
    },
    {
     "op": "listar",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.caso_encolado",
    "bocaos.caso_cerrado"
   ],
   "peldaño": "9 · la operación humana"
  },
  {
   "slug": "salud-mercado",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "I05",
    "I06",
    "O01",
    "N01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "enlace",
    "hechos-reparto",
    "liquidacion",
    "frontera-plaza"
   ],
   "subscribes": [
    "salud-mercado.ver.request",
    "salud-mercado.fricciones.request",
    "salud-mercado.densidad.request"
   ],
   "publishes": [
    "salud-mercado.ver.response",
    "salud-mercado.ver.failed",
    "salud-mercado.fricciones.response",
    "salud-mercado.fricciones.failed",
    "salud-mercado.densidad.response",
    "salud-mercado.densidad.failed",
    "bocaos.cuadro_servido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_medir",
     "descripcion": "I05: la medida maestra. Un mercado que necesita seis propuestas para mover un pedido está muerto aunque venda."
    },
    {
     "nombre": "_fricciones",
     "descripcion": "I06: los 8 pares, medidos sobre los mismos hechos que I05 y O01. Tres módulos darían tres cifras del mismo mercado."
    },
    {
     "nombre": "_cuadro",
     "descripcion": "O01: el cuadro del jefe de la plaza. Agregados de mercado, nunca de personas."
    },
    {
     "nombre": "_densidad",
     "descripcion": "N01: densidad por zona — información para el dueño; abrir o cerrar zona es una SolicitudDecisión (D6)."
    },
    {
     "nombre": "_ver",
     "descripcion": "op `ver` del diseño (I05, I06, O01, N01)."
    }
   ],
   "handlers": [
    {
     "op": "ver",
     "clase": "PREGUNTA"
    },
    {
     "op": "fricciones",
     "clase": "PREGUNTA"
    },
    {
     "op": "densidad",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.cuadro_servido"
   ],
   "peldaño": "9 · la operación humana"
  },
  {
   "slug": "publicacion",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [],
   "reutiliza": [
    "scheduler"
   ],
   "depende_de": [
    "censo-parte",
    "liquidacion",
    "salud-mercado"
   ],
   "subscribes": [
    "scheduler.job.triggered",
    "bocaos.devengo_anotado",
    "bocaos.censo_actualizado",
    "bocaos.cuadro_servido"
   ],
   "publishes": [
    "plaza.viva",
    "tienda.dada-de-alta",
    "plaza.devengo-cerrado",
    "plaza.acceso-visto",
    "publicacion.fallida"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_viva",
     "descripcion": "`plaza.viva` { plaza_id, versión, estado, tiendas:N } periódico y barato, por el job `bocaos.plaza.viva`."
    },
    {
     "nombre": "_tienda",
     "descripcion": "`tienda.dada-de-alta` { plaza_id, tienda_id, nombre, estado } cuando pasa (lo dispara `bocaos.censo_actualizado`)."
    },
    {
     "nombre": "_devengo",
     "descripcion": "`plaza.devengo-cerrado` { plaza_id, periodo, total, partes:N } al cerrar la semana. Lleva CUÁNTAS partes, no cuáles."
    },
    {
     "nombre": "_acceso",
     "descripcion": "`plaza.acceso-visto` al conceder o usar un acceso. Es el único acto de la plaza que sube con nombre propio."
    },
    {
     "nombre": "_sello",
     "descripcion": "El plaza_id NO se copia del payload: se toma de la configuración del despliegue. El tienda_id se toma del pedido/alta del dueño, nunca del que llama."
    },
    {
     "nombre": "_sin_acuse",
     "descripcion": "No hay `.response` ni reintento que bloquee: con el nacional caído, publicar es publicar al vacío y el negocio sigue."
    },
    {
     "nombre": "_acceso_concedido",
     "descripcion": "op `acceso_concedido` del diseño (raíz)."
    },
    {
     "nombre": "_latido",
     "descripcion": "raíz Plaza: un `plaza.viva` periódico y barato — versión, estado y número de tiendas, sin nombres."
    },
    {
     "nombre": "_subir",
     "descripcion": "sólo los cuatro de §9.1; lo que no está en la lista, no cruza."
    }
   ],
   "handlers": [
    {
     "op": "acceso_concedido",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "plaza.viva",
    "tienda.dada-de-alta",
    "plaza.devengo-cerrado",
    "plaza.acceso-visto"
   ],
   "peldaño": "10 · el borde amable"
  },
  {
   "slug": "resumen-tienda",
   "forma": "micro-agente",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "L04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "panel-tienda"
   ],
   "subscribes": [
    "resumen-tienda.redactar.request"
   ],
   "publishes": [
    "resumen-tienda.redactar.response",
    "resumen-tienda.redactar.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "cajon_redactar",
     "descripcion": "L04: el cajón del blueprint (texto libre). El reflejo sólo valida y publica."
    },
    {
     "nombre": "_validador",
     "descripcion": "L04: todo número citado tiene que existir en los hechos de entrada. Un número que no está en la entrada rechaza el párrafo entero."
    },
    {
     "nombre": "_sin_contexto",
     "descripcion": "L04: no menciona a la plaza ni al nacional. La tienda no necesita saber cuántos niveles hay encima."
    },
    {
     "nombre": "_redactar",
     "descripcion": "op `redactar` del diseño (L04)."
    }
   ],
   "handlers": [
    {
     "op": "redactar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [],
   "peldaño": "10 · el borde amable"
  },
  {
   "slug": "fed-buzon",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R23",
    "R25"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [],
   "subscribes": [
    "plaza.viva",
    "tienda.dada-de-alta",
    "plaza.devengo-cerrado",
    "plaza.acceso-visto",
    "fed-buzon.guarda_catalogo.request",
    "fed-buzon.guarda_frontera.request",
    "fed-buzon.recibidos.request",
    "project.activated"
   ],
   "publishes": [
    "fed-buzon.guarda_catalogo.response",
    "fed-buzon.guarda_catalogo.failed",
    "fed-buzon.guarda_frontera.response",
    "fed-buzon.guarda_frontera.failed",
    "fed-buzon.recibidos.response",
    "fed-buzon.recibidos.failed",
    "bocaos.federacion_plaza_viva",
    "bocaos.federacion_tienda_publicada",
    "bocaos.federacion_devengo_cerrado",
    "bocaos.federacion_acceso_visto",
    "bocaos.federacion_hecho_rechazado",
    "bocaos.federacion_fila_sin_plaza",
    "bocaos.federacion_almacen_con_catalogo"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_forma",
     "descripcion": "La raíz `Nacional.anotar`: cuatro formas cerradas (plaza.viva · tienda.dada-de-alta · devengo-cerrado · acceso-visto). La quinta se rechaza con nombre, no se ignora."
    },
    {
     "nombre": "_sello",
     "descripcion": "R25: compara el `plaza_id` de cada fila con la plaza del que la escribió. Sólo tres clases escriben con plaza_id ajeno (R05, R06, R20) y las tres escriben SOBRE una plaza, no DESDE otra."
    },
    {
     "nombre": "_sin_catalogo",
     "descripcion": "R23: enumera el almacén del nacional. Si aparece `pedido`, `linea`, `importe`, `direccion` o `posicion`, FALLA con la ruta exacta."
    },
    {
     "nombre": "_recibidos",
     "descripcion": "Cuenta y forma de lo recibido por plaza y periodo — el cuadro del buzón, sin nombres de partes."
    },
    {
     "nombre": "_guarda_catalogo",
     "descripcion": "op `guarda_catalogo` del diseño (R23, R25)."
    },
    {
     "nombre": "_guarda_frontera",
     "descripcion": "op `guarda_frontera` del diseño (R23, R25)."
    }
   ],
   "handlers": [
    {
     "op": "guarda_catalogo",
     "clase": "PREGUNTA"
    },
    {
     "op": "guarda_frontera",
     "clase": "PREGUNTA"
    },
    {
     "op": "recibidos",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_plaza_viva",
    "bocaos.federacion_tienda_publicada",
    "bocaos.federacion_devengo_cerrado",
    "bocaos.federacion_acceso_visto",
    "bocaos.federacion_hecho_rechazado",
    "bocaos.federacion_fila_sin_plaza",
    "bocaos.federacion_almacen_con_catalogo"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-marca",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R16",
    "R17"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [],
   "subscribes": [
    "fed-marca.declarar.request",
    "fed-marca.de.request",
    "fed-marca.licenciar.request",
    "fed-marca.licencia.request",
    "fed-marca.retirar.request",
    "project.activated"
   ],
   "publishes": [
    "fed-marca.declarar.response",
    "fed-marca.declarar.failed",
    "fed-marca.de.response",
    "fed-marca.de.failed",
    "fed-marca.licenciar.response",
    "fed-marca.licenciar.failed",
    "fed-marca.licencia.response",
    "fed-marca.licencia.failed",
    "fed-marca.retirar.response",
    "fed-marca.retirar.failed",
    "bocaos.federacion_marca_declarada",
    "bocaos.federacion_licencia_concedida",
    "bocaos.federacion_licencia_retirada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_declarar",
     "descripcion": "R16: nombre · signos · ámbito (B2B) · titular. Ámbito cerrado: las cinco cosas del acta y ni una más."
    },
    {
     "nombre": "_licencia",
     "descripcion": "R17: qué puede hacer la plaza con la marca (rótulo, dominio, papelería, nombre comercial), desde/hasta y causa. Sin licencia no se puede poner en ningún sitio."
    },
    {
     "nombre": "_retirar",
     "descripcion": "R17: retirar es el único castigo real del registro, y llega tarde (fricción 9). Se anota con causa y hora."
    },
    {
     "nombre": "_licenciar",
     "descripcion": "op `licenciar` del diseño (R16, R17)."
    }
   ],
   "handlers": [
    {
     "op": "declarar",
     "clase": "ORDEN"
    },
    {
     "op": "licenciar",
     "clase": "ORDEN"
    },
    {
     "op": "retirar",
     "clase": "ORDEN"
    },
    {
     "op": "licencia",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_marca_declarada",
    "bocaos.federacion_licencia_concedida",
    "bocaos.federacion_licencia_retirada"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-padron",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R01",
    "R02",
    "R03",
    "R04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [],
   "subscribes": [
    "fed-padron.abrir.request",
    "fed-padron.anotar.request",
    "fed-padron.de.request",
    "fed-padron.vivas.request",
    "bocaos.federacion_verificacion_ok",
    "bocaos.federacion_verificacion_difiere",
    "scheduler.job.triggered",
    "project.activated"
   ],
   "publishes": [
    "fed-padron.abrir.response",
    "fed-padron.abrir.failed",
    "fed-padron.anotar.response",
    "fed-padron.anotar.failed",
    "fed-padron.de.response",
    "fed-padron.de.failed",
    "fed-padron.vivas.response",
    "fed-padron.vivas.failed",
    "bocaos.federacion_plaza_anotada",
    "bocaos.federacion_plaza_estado",
    "bocaos.federacion_plaza_silenciosa"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_abrir",
     "descripcion": "R02: abrir es un ACTO con responsable y fecha; la primera plaza escribe su acta de constitución y NO crea padrón. Sin responsable → SIN_RESPONSABLE."
    },
    {
     "nombre": "_transitar",
     "descripcion": "R03: naciendo → operando sólo con verificación en verde; cerrada no vuelve; ningún estado sin hecho con hora."
    },
    {
     "nombre": "_silencio",
     "descripcion": "R04: minutos desde el último plaza.viva contra el umbral DEL REGISTRO; alimenta a _transitar, no la sustituye."
    },
    {
     "nombre": "_siete_campos",
     "descripcion": "R01: id · localidad · estado · versión · alta · responsable · plaza_id. Ni carta, ni precios, ni número de tiendas."
    },
    {
     "nombre": "_anotar",
     "descripcion": "op `anotar` del diseño (R01, R02, R03, R04)."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (R01, R02, R03, R04)."
    },
    {
     "nombre": "_vivas",
     "descripcion": "op `vivas` del diseño (R01, R02, R03, R04)."
    }
   ],
   "handlers": [
    {
     "op": "abrir",
     "clase": "ORDEN"
    },
    {
     "op": "anotar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "vivas",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_plaza_anotada",
    "bocaos.federacion_plaza_estado",
    "bocaos.federacion_plaza_silenciosa"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-acceso",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R19",
    "R20",
    "R21"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-buzon"
   ],
   "subscribes": [
    "bocaos.federacion_acceso_visto",
    "fed-acceso.abrir.request",
    "fed-acceso.usar.request",
    "fed-acceso.vencer.request",
    "fed-acceso.traza.request",
    "project.activated"
   ],
   "publishes": [
    "fed-acceso.abrir.response",
    "fed-acceso.abrir.failed",
    "fed-acceso.usar.response",
    "fed-acceso.usar.failed",
    "fed-acceso.vencer.response",
    "fed-acceso.vencer.failed",
    "fed-acceso.traza.response",
    "fed-acceso.traza.failed",
    "bocaos.federacion_acceso_anotado",
    "bocaos.federacion_acceso_vencido",
    "bocaos.federacion_acceso_denegado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "R19: sólo anota una concesión que LLEGÓ PUBLICADA. No hay método para crearla desde dentro: si lo hubiera, el soporte se daría permiso solo."
    },
    {
     "nombre": "_traza",
     "descripcion": "R20: append-only. plaza · quién · cuándo · con qué permiso · QUÉ se consultó (por nombre de cosa). Una corrección es otra línea que desmiente."
    },
    {
     "nombre": "_usar",
     "descripcion": "R21: si la traza no se puede escribir, NO se consulta. El registro no puede mirar sin dejar rastro."
    },
    {
     "nombre": "_vencer",
     "descripcion": "R21: el permiso caduca solo; un acceso sin vencimiento es un rol permanente con otro nombre."
    },
    {
     "nombre": "_abrir",
     "descripcion": "op `abrir` del diseño (R19, R20, R21)."
    }
   ],
   "handlers": [
    {
     "op": "abrir",
     "clase": "ORDEN"
    },
    {
     "op": "usar",
     "clase": "ORDEN"
    },
    {
     "op": "vencer",
     "clase": "ORDEN"
    },
    {
     "op": "traza",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_acceso_anotado",
    "bocaos.federacion_acceso_vencido",
    "bocaos.federacion_acceso_denegado"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-acta",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R22"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-padron",
    "fed-marca"
   ],
   "subscribes": [
    "fed-acta.asentar.request",
    "fed-acta.de.request",
    "project.activated"
   ],
   "publishes": [
    "fed-acta.asentar.response",
    "fed-acta.asentar.failed",
    "fed-acta.de.response",
    "fed-acta.de.failed",
    "bocaos.federacion_acta_asentada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_asentar",
     "descripcion": "R22: lista CERRADA de cinco cosas, versión de las reglas comunes, fecha y firma. La sexta no se escribe: exige otra acta."
    },
    {
     "nombre": "_corresponsabilidad",
     "descripcion": "R22: con datos personales de por medio, el acta dice quién responde de qué (Q53). No es un anexo: es la mitad del acta."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (R22)."
    }
   ],
   "handlers": [
    {
     "op": "asentar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_acta_asentada"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-censo",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R05"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-buzon"
   ],
   "subscribes": [
    "fed-censo.de.request",
    "fed-censo.baja.request",
    "bocaos.federacion_tienda_publicada",
    "project.activated"
   ],
   "publishes": [
    "fed-censo.de.response",
    "fed-censo.de.failed",
    "fed-censo.baja.response",
    "fed-censo.baja.failed",
    "bocaos.federacion_tienda_censada",
    "bocaos.federacion_tienda_baja"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "R05: id · nombre · estado · plaza_id. La quinta columna que alguien pida (carta, precios, volumen) no tiene dónde ponerse."
    },
    {
     "nombre": "_baja",
     "descripcion": "R05: una tienda de baja se marca, no se borra: su nombre en el índice del mes pasado tiene que seguir teniendo explicación."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (R05)."
    }
   ],
   "handlers": [
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "baja",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.federacion_tienda_censada",
    "bocaos.federacion_tienda_baja"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-buscador",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R10",
    "R11",
    "R12"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-padron",
    "fed-censo"
   ],
   "subscribes": [
    "fed-buscador.buscar.request",
    "fed-buscador.indice.request"
   ],
   "publishes": [
    "fed-buscador.buscar.response",
    "fed-buscador.buscar.failed",
    "fed-buscador.indice.response",
    "fed-buscador.indice.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_indice",
     "descripcion": "R10: se reescribe de padrón+censo en cada consulta. Cuatro campos por fila: plaza, localidad, tienda, estado."
    },
    {
     "nombre": "_buscar",
     "descripcion": "R11: por localidad y nombre de tienda, y por nada más (Q48). Orden declarado con desempate escrito. Si no encuentra, NO SUGIERE."
    },
    {
     "nombre": "_resultado",
     "descripcion": "R12: la fila con su plaza dentro. No hay constructor de resultado sin plaza; sin plaza no hay a dónde enrutar."
    }
   ],
   "handlers": [
    {
     "op": "buscar",
     "clase": "PREGUNTA"
    },
    {
     "op": "indice",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "— (ninguno: sólo calcula)"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-consolidacion",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R14",
    "R15"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-buzon"
   ],
   "subscribes": [
    "bocaos.federacion_devengo_cerrado",
    "fed-consolidacion.consolidar.request",
    "fed-consolidacion.cuadro.request",
    "project.activated"
   ],
   "publishes": [
    "fed-consolidacion.consolidar.response",
    "fed-consolidacion.consolidar.failed",
    "fed-consolidacion.cuadro.response",
    "fed-consolidacion.cuadro.failed",
    "bocaos.federacion_consolidado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_consolidar",
     "descripcion": "R14: suma por plaza y periodo. No convierte moneda, no compensa, no prorratea, no cobra. Sin netting entre plazas."
    },
    {
     "nombre": "_con_definicion",
     "descripcion": "R14: cada cifra lleva dentro la definición con la que se calculó (Q53/Q56). Sin eso, el cuadro compara peras con manzanas."
    },
    {
     "nombre": "_cuadro",
     "descripcion": "R15: plazas vivas · versiones · aceptación por plaza · devengo · canon emitido vs pagado. Lo que no consta es HUECO, no cero."
    }
   ],
   "handlers": [
    {
     "op": "consolidar",
     "clase": "PREGUNTA"
    },
    {
     "op": "cuadro",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_consolidado"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-canon",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R24",
    "R26"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-consolidacion",
    "fed-padron"
   ],
   "subscribes": [
    "fed-canon.calcular.request",
    "fed-canon.documento.request",
    "fed-canon.guarda_recauda.request",
    "project.activated"
   ],
   "publishes": [
    "fed-canon.calcular.response",
    "fed-canon.calcular.failed",
    "fed-canon.documento.response",
    "fed-canon.documento.failed",
    "fed-canon.guarda_recauda.response",
    "fed-canon.guarda_recauda.failed",
    "bocaos.federacion_canon_emitido",
    "bocaos.federacion_canon_sin_coeficiente"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_calcular",
     "descripcion": "R26: coeficiente × devengo CERRADO publicado. Sin coeficiente → NO_CONSTA y no se emite documento (un canon inventado es una cuota que nadie aceptó)."
    },
    {
     "nombre": "_documento",
     "descripcion": "R26: documento a UNA plaza y un periodo. La plaza lo paga por su canal; el nacional no entra en su ciclo, no descuenta, no retiene, no compensa."
    },
    {
     "nombre": "_guarda_no_recauda",
     "descripcion": "R24: recorre los caminos de dinero que SALEN del nacional. Único permitido: este. Todo lo demás falla con el camino exacto."
    },
    {
     "nombre": "_sujeto_pasivo",
     "descripcion": "Decisión C: con menos de dos plazas `documento()` → NO_HAY. No hay a quién cobrarle ni con qué justificarlo."
    },
    {
     "nombre": "_guarda_recauda",
     "descripcion": "op `guarda_recauda` del diseño (R24, R26)."
    }
   ],
   "handlers": [
    {
     "op": "calcular",
     "clase": "PREGUNTA"
    },
    {
     "op": "documento",
     "clase": "ORDEN"
    },
    {
     "op": "guarda_recauda",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_canon_emitido",
    "bocaos.federacion_canon_sin_coeficiente"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-enrutado",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R13"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-buscador"
   ],
   "subscribes": [
    "fed-enrutado.enrutar.request"
   ],
   "publishes": [
    "fed-enrutado.enrutar.response",
    "fed-enrutado.enrutar.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_salida",
     "descripcion": "R13: de un ResultadoConSuPlaza a la URL de SU plaza. Nada más viaja: ni marca, ni parámetro de seguimiento."
    },
    {
     "nombre": "_sin_rastro",
     "descripcion": "R13: no se escribe ni se publica nada por un clic. Un contador de clics sería el primer dato de demanda del nacional."
    },
    {
     "nombre": "_enrutar",
     "descripcion": "op `enrutar` del diseño (R13)."
    }
   ],
   "handlers": [
    {
     "op": "enrutar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "— (ninguno: sólo calcula)"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-puesta-en-marcha",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R07",
    "R08"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-padron"
   ],
   "subscribes": [
    "fed-puesta-en-marcha.poner.request",
    "fed-puesta-en-marcha.comprobar.request",
    "bocaos.federacion_plaza_viva",
    "project.activated"
   ],
   "publishes": [
    "fed-puesta-en-marcha.poner.response",
    "fed-puesta-en-marcha.poner.failed",
    "fed-puesta-en-marcha.comprobar.response",
    "fed-puesta-en-marcha.comprobar.failed",
    "bocaos.federacion_verificacion_ok",
    "bocaos.federacion_verificacion_difiere"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_comprobar",
     "descripcion": "R08: versión declarada vs versión objetivo, estado y tiendas vivas. Si difiere, lo dice y avisa; NO mira dentro para averiguar por qué."
    },
    {
     "nombre": "_intento",
     "descripcion": "R07: el intento con plaza, versión objetivo, responsable y hora. Pide arrancar; no configura, no siembra, no toca el mercado."
    },
    {
     "nombre": "_poner",
     "descripcion": "op `poner` del diseño (R07, R08)."
    }
   ],
   "handlers": [
    {
     "op": "poner",
     "clase": "ORDEN"
    },
    {
     "op": "comprobar",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_verificacion_ok",
    "bocaos.federacion_verificacion_difiere"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-soporte",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R18"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-acceso"
   ],
   "subscribes": [
    "fed-soporte.abrir.request",
    "fed-soporte.responder.request",
    "fed-soporte.escalar.request",
    "project.activated"
   ],
   "publishes": [
    "fed-soporte.abrir.response",
    "fed-soporte.abrir.failed",
    "fed-soporte.responder.response",
    "fed-soporte.responder.failed",
    "fed-soporte.escalar.response",
    "fed-soporte.escalar.failed",
    "bocaos.federacion_caso_abierto",
    "bocaos.federacion_caso_escalado",
    "bocaos.federacion_soporte_sin_permiso"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_abrir",
     "descripcion": "R18: caso con plaza, tipo (software|método), hora y plazo. Sin permiso vivo de la plaza no hay caso de datos."
    },
    {
     "nombre": "_escalar",
     "descripcion": "R18: si la plaza está caída no puede conceder permiso; sin permiso de emergencia declarado (Q46) el soporte hace lo que puede desde fuera y LO DICE."
    },
    {
     "nombre": "_responder",
     "descripcion": "op `responder` del diseño (R18)."
    }
   ],
   "handlers": [
    {
     "op": "abrir",
     "clase": "ORDEN"
    },
    {
     "op": "responder",
     "clase": "ORDEN"
    },
    {
     "op": "escalar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.federacion_caso_abierto",
    "bocaos.federacion_caso_escalado",
    "bocaos.federacion_soporte_sin_permiso"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-versiones",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R06",
    "R09"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-buzon"
   ],
   "subscribes": [
    "bocaos.federacion_plaza_viva",
    "fed-versiones.de.request",
    "fed-versiones.compatible.request",
    "project.activated"
   ],
   "publishes": [
    "fed-versiones.de.response",
    "fed-versiones.de.failed",
    "fed-versiones.compatible.response",
    "fed-versiones.compatible.failed",
    "bocaos.federacion_version_declarada",
    "bocaos.federacion_incompatible"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "R06: plaza_id · versión · hora en que la declaró. Se anota lo que llega; nunca se escribe la versión de una plaza desde aquí."
    },
    {
     "nombre": "_compatible",
     "descripcion": "R09: tabla cerrada [versión → qué puede]. Una plaza atrasada sigue operando: se salta lo que no entiende y lo declara."
    },
    {
     "nombre": "_de",
     "descripcion": "op `de` del diseño (R06, R09)."
    }
   ],
   "handlers": [
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "compatible",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_version_declarada",
    "bocaos.federacion_incompatible"
   ],
   "peldaño": "11 · el nacional"
  },
  {
   "slug": "fed-aviso",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-versiones",
    "fed-padron"
   ],
   "subscribes": [
    "fed-aviso.emitir.request",
    "bocaos.federacion_plaza_estado",
    "bocaos.federacion_version_declarada"
   ],
   "publishes": [
    "version.nueva",
    "plaza.suspendida",
    "bocaos.federacion_aviso_no_enviado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_compatible",
     "descripcion": "Pregunta a `fed-versiones.compatible` antes de emitir: lo que la plaza no entiende no se le manda, y se declara el salto."
    },
    {
     "nombre": "_sin_respuesta",
     "descripcion": "No hay `.response`: el aviso no espera acuse. Esperar acuse convertiría un aviso en una dependencia de arranque."
    },
    {
     "nombre": "_emitir",
     "descripcion": "op `emitir` del diseño (raíz)."
    }
   ],
   "handlers": [
    {
     "op": "emitir",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "version.nueva",
    "plaza.suspendida",
    "bocaos.federacion_aviso_no_enviado"
   ],
   "peldaño": "11 · el nacional"
  }
 ]
}
```


## 12 · Verificación del entregable

Lo que este plano afirma, y cómo se comprueba **sin creerse a sí mismo**:

```text
1 · CADA REUTILIZAR / ADAPTAR EXISTE DE VERDAD
    ls -d /home/admin/3enki/modules/pizzepos/{tarifas,carta-digital,carta-marketing,cocina,tienda-api,pedidos}
    ls -d /home/admin/3enki/modules/{scheduler,pago-gateway,whatsapp-bot,telegram-service}

2 · CADA CONSTRUIR NO EXISTE YA (búsqueda por nombre en los 388 manifiestos)
    find /home/admin/3enki/modules -name module.json | xargs grep -l '"name": "<slug>"'
    → vacío para las 56 hojas CONSTRUIR, salvo las 9 de `modules/bocaos/` que ya existen y se
      conservan, y las 3 que se retiran (§10.2). Además: ningún nombre debe chocar con otro
      manifiesto — así se descubrió que `escaparate` ya era de `prisma/escaparate` y la hoja pasó
      a llamarse `indice-plaza`

3 · LA ESPINA PARSEA Y CUADRA
    node -e 'const fs=require("fs");const md=fs.readFileSync(".../plan-construccion.md","utf8");
      const m=md.match(/```json enki-plan\n([\s\S]*?)\n```/);const e=JSON.parse(m[1]);
      e.hojas.every(h=>["slug","forma","accion","reutiliza","depende_de","subscribes","publishes","proyecciones_internas"].every(k=>k in h));
      e.hojas.every(h=>["reflejo","custodio","conversor","puente","micro-agente"].includes(h.forma));
      e.hojas.every(h=>["CONSTRUIR","ADAPTAR","REUTILIZAR"].includes(h.accion));
      e.orden.every(s=>e.hojas.some(h=>h.slug===s));console.log(e.hojas.length,e.orden.length)'

4 · EL ORDEN RESPETA LAS DEPENDENCIAS
    para cada hoja: índice(depende_de) < índice(hoja)   (lo comprueba la espina al construirse)

5 · LAS 145 CLASES TIENEN HOJA Y NINGUNA SE REPITE
    grep -o '`[A-Z][0-9][0-9]`' del §4 → 145 únicas; 0 huérfanas; 0 duplicadas

6 · LOS EVENTOS QUE EL PLAN ESPERA EXISTEN DE VERDAD EN QUIEN LOS EMITE
    pedido.creado · pedido.cancelado · pedido.pagado  → modules/pizzepos/pedidos/module.json  events.publishes
    cocina.pedido_listo                                → modules/pizzepos/cocina/module.json   events.publishes
    telegram.send_message.request                     → modules/telegram-service/module.json  events.subscribes
    whatsapp.enviar / whatsapp.mensaje.enviado        → modules/whatsapp-bot/module.json      tools / events
    pago.iniciar.request · pago.confirmado            → modules/pago-gateway/module.json      eventos_que_escucho / eventos_publicados
    scheduler.job.triggered                           → modules/scheduler/module.json         events.publishes

7 · SMOKE DEL ENGANCHE (el que de verdad prueba que Bocaos es el mercado)
    a) levantar pizzepos + bocaos (plaza-<slug>) + los 4 módulos del peldaño 4
    b) POST /tienda/pedido/<tienda> con entrega{direccion, oferta_centimos}
       → pedido.creado con el bloque dentro → pedido-mercado escrito con plaza_id
    c) cocina.mark-ready → cocina.pedido_listo → bocaos.listo_declarado → bocaos.pedido_listo
    d) el enlace mide y emite UNA propuesta; sin candidato que pase → bocaos.hueco_nombrado
    e) el rider acepta → contrato-puntual → hechos-reparto → liquidacion devenga la cuota
    f) NADA de la comida aparece en el almacén de la plaza: grep de total_centimos en data/bocaos/ → 0 filas
```

**Comprobado al escribir este plano (2026-11-03, sobre el árbol real):**

```text
26 rutas de módulos citadas          → existen las 26 (find + ls)
colisión de nombres                  → 1: `escaparate` (prisma v0.2.0) ⇒ hoja renombrada `indice-plaza`
145 clases del diseño                → 145 asignadas, 0 huérfanas, 0 duplicadas
hojas en la espina                   → 64 (56 CONSTRUIR · 3 ADAPTAR · 5 REUTILIZAR)
orden de la espina                   → 64/64, topológicamente válido (toda depende_de va antes)
eventos de pizzepos que el plan usa  → los 4 existen en el events.publishes de su emisor
```

**Lo que este plano NO puede decidir y deja escrito (no lo inventa):**

- **`D06` / la zona de la tienda**: no existe módulo que la guarde. Se decidió que la guarde `censo-parte`
  («quién existe y hasta dónde llega»). Si el dueño prefiere que la tienda tenga su propio custodio, es
  una hoja de 60 líneas y no cambia nada más.
- **`D04` / el carrito**: el de la PWA vive en el navegador. Cumple el aislamiento por construcción (un
  origen por tienda), pero **no sobrevive** al cambio de dispositivo. Si se quiere carrito servidor, es
  una hoja nueva (`carrito-web`) y hoy no la pide nadie.
- **`C05` / tracking en la PWA**: hoy el estado podado viaja por el aviso al cliente. Un endpoint de
  seguimiento en la PWA obligaría a que `tienda-api` (pizzepos) preguntara a Bocaos por el bus: un
  acoplamiento que este plano NO introduce en el peldaño 0–7. Se declara deuda, con su motivo.
- **`Q17`, `Q29`, `Q30`, `Q36`, `Q39`** siguen abiertas en el diseño: quién paga una subida, si se revierte
  una transferencia, si la prueba es obligatoria, quién paga un rechazo, si el desglose se muestra. Este
  plano las trata como el diseño: **registra el acto y no cobra a nadie** hasta que se decidan.
