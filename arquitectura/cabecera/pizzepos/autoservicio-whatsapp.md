---
id: pizzepos/autoservicio-whatsapp
dominio: pizzepos
resumen: Pedido del cliente por WhatsApp: PWA arma #P1 por ids, el bot re-tasa server-side (pedido-tasador), webhook real de Meta, ancla por nombre, pago efectivo o tarjeta (el método viaja en el #P1).
fuentes:
  - modules/whatsapp-bot/**
  - modules/pizzepos/carta-digital/**
  - modules/pizzepos/pedidos/**
  - modules/pizzepos/tienda-api/**
  - modules/_shared/pedido-tasador.js
  - modules/_shared/horario-servicio.js
  - modules/pago-gateway/**
  - modules/_shared/lector-servicio.js
  - frontend/src/lib/components/comandero/ServicioToggle.svelte
  - tests/unit/pizzepos__servicio.test.js
verificado: 2026-10-28 (pago-gateway v3.1.0: el webhook de Stripe reconsulta la sesión; clave RAK; los métodos del checkout los sirve el panel de Stripe)
---

# SUBSISTEMA AUTOSERVICIO — Pedido del cliente por WhatsApp (PWA → bot → cocina)

> **Ingeniería atípica: cada herramienta hace lo que sabe.** WhatsApp da IDENTIDAD veraz (el
> número, sin login) + comunicación directa + CERO puertas abiertas al sistema. La PWA (suelta,
> sin backend) es el ESCAPARATE que arma el pedido. El BOT —ya dentro del bus— es el INSIDER de
> confianza que RE-TASA y mete la comanda. **El precio nace SIEMPRE de la carta, nunca del
> cliente** → el texto de WhatsApp es editable, pero da igual: los ids viajan, el bot tasa.
> No es un cerebro IA (el único chat-IA es el cf-worker de la PWA, escenario suelto); es un
> dispatcher determinista. Reemplaza la "puerta HTTP" (tienda-api POST) por el webhook de Meta.

## Contrato (JSON)

```json
{
  "esquema": "autoservicio-whatsapp-v1",
  "reparto_por_herramienta": {
    "whatsapp": "identidad (teléfono) + comunicación directa + sin puertas abiertas. Webhook de Meta (autenticado por verify_token), NO un POST público al sistema.",
    "pwa_suelta": "escaparate rico (fotos, mitad, al_gusto, variaciones). Sin backend: arma el pedido y pre-rellena el mensaje wa.me.",
    "bot": "INSIDER en el bus: RE-TASA contra la carta y publica pedido.crear-tienda. No confía en el precio del cliente."
  },
  "seguridad": {
    "principio": "el cliente solo aporta IDS (producto_id + ingredientes_id); el precio SIEMPRE lo recalcula el servidor.",
    "ataque_cerrado": "editar el texto de WhatsApp (p.ej. 'Total: 1€') NO sirve: el bot re-tasa por ids. Editar items = pide y paga ESO (no es fraude).",
    "ancla_recogida": "cliente_nombre (el nombre que el cliente introduce, obligatorio). codigo_recogida RETIRADO (v3.3.0) y palabra_clave RETIRADA — el dependiente pide el nombre al recoger."
  },
  "pago": {
    "eleccion": "el cliente elige en la PWA (campo metodo_pago del #P1): 'efectivo' (paga al recoger — default si falta) | 'tarjeta' (pago online por la pasarela).",
    "tarjeta": "el bot NO cobra: pide la sesión de pago al líder por bus (pago.iniciar.request → pago-gateway, provider-agnóstico) y manda la checkout_url al cliente por WhatsApp. La VERDAD del cobro no es la preferencia: es pago.confirmado → pedidos → pedido.pagado.",
    "puertas_del_organo": "el mismo puerto tiene tres puertas más desde pago-gateway v3: pago.qr.request pinta ESA url en PNG (manda la imagen en vez del enlace, útil cuando el cliente no quiere teclear), pago.reader.cobrar.request manda el importe al datáfono del mostrador (cobro al recoger) y pago.cobrar_guardada.request cobra con la tarjeta guardada del cliente de siempre. El bot no cambia: sigue pidiendo pago.iniciar y escuchando pago.confirmado, que ahora trae `canal` (online | terminal | guardada) — el cierre de caja distingue con qué puerta se cobró.",
    "degradacion": "sin pasarela configurada (NO_PASARELA) o sin su credencial (PERMISSION_DENIED) el bot avisa 'puedes pagar al recoger' y NO revienta: el pedido ya está creado.",
    "guarda_anti_duplicado": "una sola sesión por pedido_id (Meta reintenta webhooks y el cliente puede reenviar → sin guarda, dos sesiones = riesgo de pagar dos veces).",
    "cierre_caja": "handleConfirmarRecogida lee la verdad del pago: 'tarjeta' (con session_id/pasarela) si pago.confirmado llegó antes, 'efectivo' si no. Ya NO clava 'efectivo' a fuego."
  },
  "aviso_recogida": "cocina.pedido_listo → whatsapp-bot avisa al cliente 'ven a recoger' (ya cableado para origen-whatsapp).",
  "aviso_fuera_de_lorca": "la PWA NO adivina la ubicación (la geo del navegador no verifica nada y en iPhone exige gesto): PREGUNTA con dos botones, 'Soy de Lorca' / 'Vengo de fuera'. Al marcar 'fuera' el carrito pinta la dirección de recogida + el mapa ANTES de confirmar ('no repartimos a domicilio, cuenta el viaje') y la nota viaja al pedido como notas_generales (campo ya validado por tienda-api) y al mensaje wa.me. El pedido que se pierde es el del cliente que cree que se lo llevan y no se presenta.",
  "transporte_alojamiento": "tienda-api (POST público /tienda/pedido) APARCADO — el camino vivo es WhatsApp+bot (sin puertas).",
  "estado": "OPERATIVO end-to-end (nonina, enki-ai.online) — webhook real de Meta entrante verificado; alta de conexión por UI (whatsapp.set_config); ver sección 'WhatsApp Cloud API — OPERATIVO'."
}
```

## #P1 — payload autoritativo por ids (PWA → bot)

```
El mensaje wa.me que arma la PWA es el FORMATO CANÓNICO + una línea autoritativa al final:

  PEDIDO <slug>-<NONCE4>
  - <cant> x <descripcion legible> (<precio> EUR)   ← HUMANO: lo ve el cliente; el bot lo IGNORA
  ...
  Total: <X,XX> EUR                                  ← HUMANO (ignorado)
  Nombre: <nombre del cliente>
  #P1 <base64url(JSON)>                              ← AUTORITATIVO: { v:1, items:[ItemEstructurado],
                                                        modo_consumo?, hora_recogida?, fecha_deseada?,
                                                        metodo_pago? }

ItemEstructurado (por IDS, nunca por precio):
  normal       → { cantidad, producto_id, tipo:'normal', quitar:[nombres], anadir:[ing_id] }
  al_gusto     → { cantidad, tipo:'al_gusto', producto_id:base_id, base_id, anadir:[ing_id] }
  mitad_mitad  → { cantidad, tipo:'mitad_mitad',
                   pizza_izquierda:{ id, quitar:[nombres], anadir:[ing_id] },
                   pizza_derecha  :{ id, quitar:[nombres], anadir:[ing_id] } }

REGLA  quitar = NOMBRES (gratis, solo nota de cocina) · anadir = IDS (el bot los re-tasa).
       base64url utf8-safe (acentos en quitar). Si #P1 falta → pedido legacy solo-texto (el bot
       no puede re-tasar; confía en el texto con warn). Si #P1 corrupto → el bot pide reenviar.
REGLA  metodo_pago viaja en el #P1 (autoritativo, no en el texto editable), igual que
       modo_consumo/hora_recogida: el parser lo lee con las mismas líneas. Si falta → null y el
       consumidor decide ('efectivo', el comportamiento previo). Valores: 'efectivo' | 'tarjeta'.
       El bus NO valida parámetros (auto-wire: saca request_id y pasa el resto tal cual), así que
       el campo fluye hasta pedidos sin tocar contrato.
REGLA  modo_consumo es el MODO DEL CLIENTE, no el CANAL de la cuenta. 'recoger' (el default de la
       carta) nace como canal 'llevar' en cuentas.handleCreateCuenta: un tipo sin strategy no
       tiene dueño y nadie lo cierra nunca (ni mesa ni ticket → la venta no llega al libro de
       ventas). El modo original se conserva en metadata.modo_consumo y es lo que pinta el
       comandero. Un pedido de tienda se cierra AL COBRAR (metadata.cerrar_al_cobrar:true).
```

## El tasador — re-tasado server-side (función PURA, seguridad)

```
// modules/_shared/pedido-tasador.js — el corazón de seguridad. Entra { items por ids, carta },
// sale { items tasados (céntimos), total, ok }. Sin efectos, sin red. Política = la del comandero.

FUNCION tasarPedido(items: Array<ItemEstructurado>, carta: Carta): ResultadoTasado {
  PRECONDICION: carta = { productos:[{id,nombre,precio}], ingredientes_catalogo:[{id,nombre,precio_extra}] }
  prod ← index(carta.productos por id) ; ing ← index(carta.ingredientes_catalogo por id)

  PARA it EN items:
    SI it.tipo == 'mitad_mitad':
        izq ← prod[it.pizza_izquierda.id] ; der ← prod[it.pizza_derecha.id]
        SI !izq O !der: errores.add(PRODUCTO_DESCONOCIDO) ; CONTINUAR   // no_silent_failures
        base   ← max(cent(izq.precio), cent(der.precio))                 // política A: el mayor
        extras ← Σ cent(ing[id].precio_extra) de pizza_izq.anadir + pizza_der.anadir  // completos
        unit   ← base + extras                                            // quitar es GRATIS
    SINO:  // normal | al_gusto
        p ← prod[ it.base_id (al_gusto) || it.producto_id ]
        SI !p: errores.add(PRODUCTO_DESCONOCIDO) ; CONTINUAR
        unit ← cent(p.precio) + Σ cent(ing[id].precio_extra) de it.anadir
    // reconstruye descripción humana + estructura (pizza_*/variaciones) para cocina
    linea.precio_unitario_centimos ← unit ; linea.precio_total_centimos ← unit * it.cantidad
    total += linea.precio_total_centimos

  RETORNA { ok: errores.length==0, items: tasados, total_centimos: total, errores, avisos }
}

INVARIANTES {
  el precio del cliente NO entra (los items por ids no llevan precio autoritativo).
  producto desconocido → ok=false (el bot avisa). extra desconocido → no se cobra y se avisa.
  dinero en CÉNTIMOS (enteros) de punta a punta (= contrato pedido.crear-tienda).
}
```

## CLASE WhatsappBotModule (ampliación v1.1.0) — RE-TASA con snapshot hidratado VÍA EVENTO

```
CLASE WhatsappBotModule HEREDA BaseModule {  // ── el INSIDER que re-tasa
  ATRIBUTOS_NUEVOS {
    cartaSnap   : Map<project_id, { productos, ingredientes_catalogo, at }>  // snapshot de precios
    pidPorSlug  : Map<slug, project_id>      // PUENTE: los eventos de carta van por UUID, el bot por slug
    slugPorPid  : Map<project_id, slug>
    moduleRegistry : acceso in-process a `productos` (patrón carta-digital→ingredientes)
  }

  METODOS_NUEVOS {
    // ── snapshot de precios hidratado VÍA EVENTO (no RPC por pedido) ──
    onProjectActivated(event):                       // tiende el PUENTE slug↔project_id
      slug ← basename(event.base_path)               // = slugify(name), como lo crea project-manager
      pidPorSlug[slug] ← event.project_id ; slugPorPid[event.project_id] ← slug
      _refrescarCarta(event.project_id)

    onCatalogoActualizado(event):                    // carta o tarifa cambió → refresca el snapshot
      _refrescarCarta(event.project_id)              // (suscrito a catalogo.actualizado + tarifas.config.actualizada)

    async _refrescarCarta(project_id):               // re-pull EN PROCESO (ms, sin bus)
      inst ← moduleRegistry.get('productos').instance
      r ← await inst.handleCartaCompleta({ project_id, canal:'digital' })   // { productos(precio), ingredientes(precio_extra) }
      SI r.status==200: cartaSnap[project_id] ← { productos:r.data.productos, ingredientes_catalogo:r.data.ingredientes }
      // soft-fail: si productos no está, deja el snapshot como esté

    _resolverProjectId(slug):                         // slug → UUID; puente o fallback project-manager (cold-start)

    // ── camino SEGURO del pedido (cuando llega #P1) ──
    async _registrarPedidoSeguro(slug, msg, parsed):  // parsed.estructura = items por ids (del #P1)
      pid  ← _resolverProjectId(slug)  ; SI !pid: avisar('cargando catálogo, reintenta') ; RETORNA
      snap ← cartaSnap[pid] ?? (_refrescarCarta(pid), cartaSnap[pid])
      SI !snap: avisar('cargando catálogo, reintenta') ; RETORNA           // cold-start, no_silent_failures
      tasado ← tasarPedido(parsed.estructura.items, snap)
      SI !tasado.ok: avisar('algún producto cambió, reenvía') ; RETORNA    // producto desconocido
      items ← tasado.items.map(→ { cantidad, descripcion, producto_id, precio_*_centimos,
                                   tipo?, variaciones?, pizza_izquierda?, pizza_derecha? })  // PRECIOS DEL SERVIDOR + estructura
      publish('pedido.crear-tienda', { items, total_centimos: tasado.total_centimos,
              canal_origen:'whatsapp', cliente_telefono: msg.from, cliente_nombre, request_id, correlation_id })
  }

  EVENTOS_SUBSCRIBES_NUEVOS { 'project.activated', 'catalogo.actualizado', 'tarifas.config.actualizada' }
  RUTEO { _despacharEntrante: parsed.estructura ? _registrarPedidoSeguro (re-tasa) : _registrarPedido (legacy texto, warn) }
}

// parser (services/pedido-parser.js): parsearPedido(text) ahora devuelve `estructura` ({items}|null)
//   _decodificarEstructura: localiza la línea '#P1 <base64url>', decodifica → { v:1, items }. Corrupto → null.
```

> **Declaración del manifest (v3 de pago-gateway).** `modules/whatsapp-bot/module.json` declara
> `pago-gateway` como dependencia con la ruta de PLATAFORMA (`modules/pago-gateway`, ya no bajo
> `modules/pizzepos/`): el bot es consumidor del órgano de cobro, no dueño de la vertical. El
> nombre del módulo no cambia (el loader monta por `manifest.name`, no por carpeta), así que la
> ruta HTTP del webhook de este bot sigue siendo la de siempre.

## WhatsApp Cloud API — OPERATIVO end-to-end (v{{version:modules/whatsapp-bot}}) · webhook real de Meta + alta por UI

> Estado: VIVO en producción (enki-ai.online, proyecto nonina). El transporte ÚNICO es el
> webhook de Meta (graph.facebook.com) — HTTP, sin navegador. La PUERTA es el verify_token;
> el dato no-secreto de conexión (phone_number_id, waba_id…) se da de alta desde la APP, sin
> editar ficheros. El secreto (token, verify_token) sigue en el credential-manager.

```
WEBHOOK REAL (Meta Cloud API · services/meta-cloud-client.js + index.js) {
  GET  /modules/whatsapp-bot/whatsapp/webhook/:project  → handleWebhookVerify
       espera hub.mode=subscribe · hub.verify_token · hub.challenge ; resuelve verify_token vía
       credential-manager (provider META_WHATSAPP_VERIFY_TOKEN, level PROJECT, identifier=:project)
       → responde hub.challenge en TEXTO PLANO si coincide (403 si no).
  POST /modules/whatsapp-bot/whatsapp/webhook/:project  → handleWebhookEvent
       parseWebhookEvent(body) → mensajes ; valida phone_number_id del payload == el del proyecto
       (whatsapp-bot.webhook.project_mismatch si no) → _despacharEntrante (= ruta del bus agnóstico).
  cliente: token en META_WHATSAPP_API_KEY_PROJECT_<slug> ; sendText/sendTemplate comparten _postMessage.

  DOBLE SUSCRIPCIÓN EN META (las dos hacen falta; el campo NO basta):
    1. campo 'messages' suscrito (nivel de CAMPO, en la config del webhook de la app).
    2. WABA suscrita a la app (nivel de CUENTA): POST /v21.0/<waba_id>/subscribed_apps
       → {"success":true}. Sin esto, el "hola" no llega al VPS (journalctl solo ve /health).
}

ALTA DE LA CONEXIÓN DESDE LA APP (sin tocar JSON · v1.3.0) {
  CONTRATO  el dato no-secreto vive en data/projects/<slug>/config/config.json (precedencia) o
            project.json (fallback), bloque `whatsapp` { phone_number_id, waba_id, display_number,
            webhook_path, pwa_url, template_listo? }. El secreto NO entra aquí (va al .env).
  ui whatsapp.get_config {slug} → bloque whatsapp + has_token + has_verify + operativo +
            webhook_path_publico (/modules/whatsapp-bot/whatsapp/webhook/<slug>).  [handleGetConfig]
  ui whatsapp.set_config {slug, phone_number_id, waba_id, display_number, pwa_url?} →
            valida ids → _writeProjectConfig (merge atómico tmp+rename, preserva otros bloques) →
            _refrescarProyecto (recarga en caliente) → operativo.  [handleSetConfig]
  FRONTEND  modules/credentials/CredentialsPanel.svelte: 4ª pestaña 💬 WhatsApp con form
            (phone_number_id/waba_id/display_number/pwa_url) + estado + webhook para pegar en Meta.
            stores/credentials.ts: whatsappConfigStore + loadWhatsappConfig/saveWhatsappConfig.
}

FIX lista de credenciales (la causa real de "no muestra nada") {
  el backend (_getUIState) devuelve `credentials` como ARRAY PLANO [{key,provider,level,...}].
  el frontend leía credentials.GLOBAL/PROJECT/… → siempre vacío. loadCredentials ahora AGRUPA el
  array por level (level desconocido → CUSTOM) y deriva total. WhatsApp en el catálogo:
  META_WHATSAPP (💬) + META_WHATSAPP_VERIFY_TOKEN (🪝) en PROJECT_ONLY_PROVIDERS (fuerza level
  PROJECT en el form; key = <PROVIDER>_API_KEY_PROJECT_<slug>).
}

sendTemplate (Meta plantillas · salientes >24h) {
  meta-cloud-client.sendTemplate(to, name, lang, components?) → { type:'template', template:{...} }.
  uso: avisos fuera de la ventana de 24h (requiere plantilla APROBADA en Meta). El aviso de
  'pedido listo' (cocina.pedido_listo) usa plantilla {nombre} si template_listo está configurada;
  dentro de la ventana, texto libre.
}
```

## pedidos (v3.2.0) — la estructura del pedido de tienda VIAJA a cocina

```
// El pedido de tienda llega a cocina por la RUTA NORMAL del comandero (no por un emit propio):
//   pedido.crear-tienda → handleCreatePedidoTienda → _crearCuentaTienda (cuentas.handleCreateCuenta
//   + comandero.handleAddItem ×N + comandero.handleEnviarCocina) → comandero.enviar_cocina → cocina.
//
// La estructura (tipo/pizza_*/variaciones) se CAÍA en DOS puntos; v3.2.0 los abre:
//   1. items_tienda (handleCreatePedidoTienda): antes solo {cantidad,descripcion,producto_id,precio_*}.
//      AHORA deja pasar tipo? / variaciones? / pizza_izquierda? / pizza_derecha?
//   2. el bridge _crearCuentaTienda → comandero.handleAddItem: igual passthrough.
// El comandero YA guarda y reenvía esos campos (su schema acepta tipo∈{mitad_mitad,al_gusto},
// pizza_*, variaciones) y cocina._buildCocinaItem YA los pinta (ItemLine, como el POS).
//
// GUARDA: `tipo` solo se forwardea si es 'mitad_mitad'|'al_gusto' (enum del comandero);
//         los normales viajan con `variaciones` (sin tipo) para no romper la validación AJV.
//
// PODA palabra_clave (v3.2.0) y codigo_recogida (v3.3.0): retiradas de pedidos (crear-tienda +
//   handleConfirmarRecogida), tienda-api, carta-digital (PWA), notificador-pedidos y whatsapp-bot.
//   El ANCLA de recogida pasa a ser el NOMBRE que el cliente introduce (obligatorio en
//   pedido.crear-tienda). handleConfirmarRecogida localiza por cliente_nombre (case-insensitive)
//   y desambigua con pedido_id si varios pendientes comparten nombre. El dependiente pide el
//   nombre al recoger; cocina/staff lo ven como ref_display.
//
// EL CANAL Y EL CIERRE (v3.3.1 — el dinero cobrado llegaba tarde al libro):
//   _crearCuentaTienda pasa `tipo = modo_consumo` y cuentas lo CANONIZA (recoger→llevar):
//   un tipo sin strategy nace huérfano y nadie lo cierra nunca. Además la cuenta nace con
//   metadata.cerrar_al_cobrar:true (salvo modo mesa, que la cierra su canal): el pedido de
//   tienda no tiene mesa ni ticket, así que el cierre lo dispara el COBRO, y ese cierre
//   publica cuenta.cerrada — el único evento por el que persistencia apunta LA venta.
//   Sin esto el cobro quedaba en el registro y el libro del día no veía el dinero
//   (the-pirate 2026-10-30: 5 cobros 95,50 en efectivo, libro 92,50).
```

## CLASE carta-digital (PWA) — emite el pedido por ids (#P1) + paridad comandero + ENCARGO con fecha

```javascript
// modules/pizzepos/carta-digital/static-template.js (generador de la PWA, v2.6.0):
//   - cada item del carrito lleva su `estructura` por ids (normal/al_gusto/mitad_mitad).
//   - buildP1Line(): serializa { v:1, items: buildOrderItems() } a base64url utf8-safe y lo
//     cuelga del mensaje wa.me tras 'Nombre:'. Las líneas humanas siguen (el cliente ve su pedido).
//   - MITAD con variaciones en AMBAS mitades (paridad comandero): botón partido (cuerpo=mitad
//     tal cual · ✏️=personalizar), política max(izq,der)+extras (v2.3.0).
// ENCARGO con fecha (hoja 2 — boton "Encargar" del detalle de producto):
//   - los productos que traen dias_salida[] (del módulo calendario, 5ª fuente del proyector)
//     muestran el botón Encargar → calendario del mes (🟢 sale / 🔴 no sale).
//   - confirmar para día FUTURO → buildP1Line() añade `fecha_deseada:'YYYY-MM-DD'` al JSON del
//     #P1 y el mensaje wa.me incluye la cabecera 'Para: <fecha>' (avisos de entrega/cocina).
//   - confirmar HOY → pedido normal sin fecha_deseada (retrocompat total).
// ORDEN DEL GRID (2026-10-22): el grid "Todas" pinta `DATA.productos` tal cual llega, así que la
//   proyección los entrega en tramos contiguos por `categorias[].orden` (mismo orden que las
//   pestañas). El scroll ya no depende del orden de guardado de la carta.
// CIERRE DEL PEDIDO (módulo v2.25.1): al SALIR el pedido el carrito se vacía. Un solo
//   _cerrarPedido(nombre) sirve a los tres caminos (WhatsApp, online tienda-api, pasarela sin
//   redirección): vacía, PERSISTE el vacío (localStorage 'carta_cart_*' — recargar no lo
//   resucita) y deja la confirmación por nombre a la vista. La copia va a 'repetir último
//   pedido', guardada ANTES de vaciar (saveLastOrder) → vaciar no pierde nada.
//   Antes: sendWhatsApp dejaba el carrito lleno (y volvía al recargar) y el camino online
//   repintaba 'carrito vacío' encima de la confirmación (nunca se veía).
// PODA previa de carta-digital:
//   v2.4.0 — fuera ofertas/reseñas/track (la proyección no los daba: UI viva alimentada por vacío).
//   v2.5.0 — fuera el cerebro FANTASMA del chat (default ai_chat_path '/modules/ai-gateway/chat',
//            endpoint que nadie sirve) → '/chat' (el cf-worker, único cerebro real, escenario suelto).
//            El ALOJADO (publicar) NO setea ai_endpoint → chat OFF por diseño (autoservicio puro).
```

## Pago del pedido — efectivo o tarjeta (el método viaja en el #P1, el bot lo engancha)

```
PREFERENCIA ≠ COBRO. El cliente elige en la PWA y la preferencia viaja AUTORITATIVA en el #P1
(metodo_pago: 'efectivo' | 'tarjeta'; sin él → 'efectivo'). Eso solo REGISTRA lo que pidió.
Quien manda sobre la caja es la VERDAD del pago (pedido.pago.estado), escrita por la pasarela.

CADENA (toda por evento, ningún módulo nuevo, ninguna máquina de estados nueva):
  PWA  cart-digital: botones '💶 Efectivo al recoger' | '💳 Tarjeta' (solo si CONFIG.pago_online)
       → buildP1Line() añade metodo_pago al JSON del #P1 ; _metodoPago sobrevive al re-render
  bot  pedido-parser lee metodo_pago del #P1 (mismas líneas que modo_consumo) → pending.metodo_pago
       → publish('pedido.crear-tienda'{..., metodo_pago}) → pedidos (normaliza: sin valor → 'efectivo')
  bot  IF metodo_pago == 'tarjeta'  (tras confirmar el pedido, sin bloquear la respuesta):
         _rpc('pago.iniciar.request', {pedido_id, project_id, monto_centimos, return_url(pwa_url),
              metadata{project_slug, cliente_nombre, cliente_telefono, canal_origen}})
           → pago-gateway (LÍDER, provider-agnóstico) → pago.iniciar.response {status:200, data:{checkout_url}}
         → _enviarMensajeSeguro(checkout_url)   // GUARDA: una sola sesión por pedido_id (LRU 500)
         ELSE (NO_PASARELA | PERMISSION_DENIED | timeout) → 'El pago con tarjeta no está disponible
              ahora mismo. Puedes pagar al recoger.' → DEGRADA, no revienta (el pedido ya existe)
  Stripe → POST /pago/webhook/:project (firma sobre los BYTES CRUDOS del cuerpo — req._rawBody —
         y RECONSULTA de la sesión con nuestra clave) → pago-gateway
         → publish('pago.confirmado'{pedido_id, project_id, monto_centimos, + metadata de contexto})
         → pedidos.onPagoConfirmado → pedido.pago.estado='pagado' → publish('pedido.pagado')
         → bot.onPedidoPagado: avisa al CLIENTE ('Pago recibido… te aviso cuando esté listo')
  caja handleConfirmarRecogida: metodo_cobro = pedido.pago.estado=='pagado' ? 'tarjeta' : 'efectivo'
         → pedido.cobro{metodo, session_id?, pasarela?} + pedido.recogido{metodo_pago}

EL MÉTODO NO SE PREGUNTA POR CHAT. No hay estado nuevo en la conversación (nueva →
pendiente_confirmacion → pedido_creado → completada sigue igual): el método viene decidido en el
#P1, igual que modo_consumo. Menos piezas, una sola verdad.

EL HUÉRFANO — por qué la pasarela reenvía metadata. Los pedidos de tienda viven en MEMORIA y NO se
restauran, y el pago es ASÍNCRONO (el webhook llega minutos después). Un reinicio en esa ventana
—un DEPLOY, justo— dejaría el dinero cobrado y el pedido inexistente, en silencio. Por eso
pago-gateway copia al metadata de la sesión el contexto del caller y lo devuelve en pago.confirmado:
pedidos RECREA el pedido MÍNIMO (pedido_id + project_id + importe) y emite pedido.pagado con
recreado:true. El bot avisa al cliente si hay teléfono y, si fue recreado, avisa al STAFF por
Telegram — no hay conversación que continuar, pero el dinero nunca queda mudo. Nada que persistir.

ALTA (lo único externo): bloque 'pago-gateway' en la config del proyecto (kind stripe-checkout,
provider STRIPE, moneda eur, return_url, webhook_secret) + credencial STRIPE en el
credential-manager — clave RESTRINGIDA (`rk_test_`/`rk_live_`), no la secreta; y `return_url` es
OBLIGATORIA (sin ella el cliente aterriza en example.com y `pago.iniciar` responde CONFIG_MISSING).
El publishable no hace falta (Checkout es hospedado). El webhook de Stripe apunta a la URL pública
/pago/webhook/<slug> y su cuerpo es un PUNTERO: el órgano reconsulta la sesión con su clave y solo
`payment_status:'paid'` confirma, así que un POST inventado no puede fabricar un pago.confirmado.
```

## Ciclo

```
AUTOSERVICIO_COMPLETO {
  0. Meta entrega el mensaje al webhook real (POST /modules/whatsapp-bot/whatsapp/webhook/<slug>)
     — requiere campo 'messages' suscrito + WABA suscrita a la app (subscribed_apps)
  1. cliente escribe al WhatsApp → bot responde con el link de la PWA (greeter)
  2. cliente arma el carrito en la PWA (fotos, mitad, al_gusto, variaciones)
  3. PWA pre-rellena el wa.me con el pedido CANÓNICO + #P1 (por ids) ; cliente pulsa enviar
     — al SALIR el pedido el carrito se VACÍA (y el vacío se persiste: recargar no lo resucita);
       el panel confirma por nombre y la copia queda en «repetir último pedido» (vaciar no pierde
       nada). Mismo cierre para el camino online (tienda-api/pasarela): un solo _cerrarPedido.
  4. bot recibe (su nº = identidad veraz) → parsea → estructura (#P1)
  5. bot RE-TASA contra cartaSnap[pid] (fresco por evento) → precios del SERVIDOR
  6. bot publish('pedido.crear-tienda', items re-tasados + estructura) → pedidos
  7. pedidos crea pedido tienda (ancla = cliente_nombre) → _crearCuentaTienda → comandero.enviar_cocina
  8. cocina pinta la comanda ESTRUCTURADA (mitades como el POS) ; estado pendiente_recogida
  9. bot responde al cliente a nombre de <cliente> (mensaje CONDICIONAL al método elegido):
     efectivo → 'Pasa a recoger y paga al recoger' ; tarjeta → 'Te envío ahora el enlace para pagar'
     IF tarjeta → bot pide la sesión (pago.iniciar.request → pago-gateway) y manda la checkout_url
  10. cocina.pedido_listo → bot avisa 'ven a recoger' ; cobro a la recogida:
      tarjeta ya cobrado (la pasarela confirmó) → solo entregar ; efectivo → se cobra en barra
}

GARANTÍAS {
  no puertas HTTP abiertas (entrada = webhook Meta) ; precio inmanipulable (re-tasado por ids) ;
  identidad por teléfono sin login ; snapshot de precios fresco por evento (= los de la PWA) ;
  no_silent_failures (producto desconocido / cold-start → el bot pide reenviar, nunca crea mudo).
  pago_sin_silencio: sin pasarela degrada ('paga al recoger') ; si el webhook llega huérfano el
  pedido se re-crea desde la metadata de la sesión → pedido.pagado{recreado:true}. El dinero
  cobrado NUNCA queda sin rastro.
}
```

## Topics / eventos del subsistema

```
EVENTOS {
  (entrante)                         → bot vía WEBHOOK de Meta (Cloud API; único transporte, sin navegador)
  pedido.crear-tienda                : bot/tienda-api → pedidos (items re-tasados + estructura + metodo_pago)
  pedido.crear-tienda.response       : pedidos → bot (request_id correlado)
  pedido.creado                      : pedidos (informativo; lleva cuenta_id, sin teléfono/secretos)
                                       UNO por pedido: el bot confirma con el primero y `_consumePending`
                                       es de un solo uso — el gemelo que nacía al enviar a cocina
                                       (pedido_id propio del comandero) ya no existe (2026-10-24)
  pago.iniciar.request               : bot → pago-gateway (LÍDER — solo si metodo_pago == 'tarjeta')
  pago.iniciar.response              : pago-gateway → bot (request_id correlado; data.checkout_url)
  pago.confirmado                    : pago-gateway (webhook de Stripe + reconsulta) → pedidos
                                       (lleva la metadata de contexto: permite reconstruir el huérfano)
  pedido.pagado                      : pedidos → bot (avisa al cliente ; recreado:true → avisa al STAFF)
  pedido.recogido                    : pedidos (metodo_pago = la VERDAD del cobro, ya no 'efectivo' fijo)
  comandero.enviar_cocina            : comandero → cocina (la estructura viaja aquí)
  cocina.pedido_listo                → bot ('ven a recoger')
  catalogo.actualizado               → bot (refresca snapshot) ; tarifas.config.actualizada → bot
  project.activated                  → bot (puente slug↔project_id + warm snapshot)
}
PIEZAS {
  modules/_shared/pedido-tasador.js              (función pura: tasarPedido — re-tasado seguridad)
  modules/whatsapp-bot ({{version:modules/whatsapp-bot}})                   (webhook Meta REAL + alta por UI + snapshot + #P1 + re-tasado + sendTemplate + _rpc/_iniciarPagoTarjeta/onPedidoPagado)
  modules/whatsapp-bot/services/meta-cloud-client.js (Meta Cloud API: sendText/sendTemplate/_postMessage/parseWebhookEvent)
  modules/whatsapp-bot/services/pedido-parser.js (#P1: _decodificarEstructura + metodo_pago)
  modules/pizzepos/carta-digital ({{version:modules/pizzepos/carta-digital}})        (PWA emite #P1 + paridad mitad + nombre obligatorio + botones metodo_pago)
  modules/pizzepos/pedidos (3.5.0)               (estructura tienda → cocina ; ancla = cliente_nombre ; metodo_pago ; onPagoConfirmado con recreación del huérfano)
  modules/pago-gateway ({{version:modules/pago-gateway}})                  (ÓRGANO de cobro provider-agnóstico: Stripe + SumUp; cuenta y clave POR PROYECTO)
  modules/credential-manager ({{version:modules/credential-manager}})             (META_WHATSAPP[_VERIFY_TOKEN] + GLOVO PROJECT_ONLY + la clave de pago por proyecto)
  frontend credentials (CredentialsPanel + stores) (4ª pestaña 💬 WhatsApp · fix agrupado de la lista)
  cocina (_buildCocinaItem → ItemLine)           (YA pintaba la estructura, del comandero)
}
TESTS {
  shared__pedido-tasador (10) · whatsapp-bot__pedido-estructura (4) · whatsapp-bot__retasado (4)
  · autoservicio__roundtrip (4, PWA→parser→tasador) · pizzepos__pedidos-tienda-estructura (3)
  · pizzepos__carta-digital-template (mitad+poda) · pago-tarjeta-efectivo e2e (36 aserciones,
  6 escenarios: tarjeta · efectivo · sin pasarela · sin credencial · huérfano reconstruido ·
  webhook repetido idempotente) — suite autoservicio verde.
}
```

---

## Hermanas por ingrediente principal en la ficha del cliente (derivadas)

> **Novedad (2026-10-21).** El cliente abre una pizza ("Pizza de jamón York") y ve, **pegadas a
> la cabecera** (antes de sus ingredientes y de los extras), **las demás que llevan ese mismo
> ingrediente principal**, cada una con su nombre, sus ingredientes a la vista **con emoji**, su
> precio y dos acciones: **elegir** (al carrito con SU precio) o **Personalizar** (abre SU ficha,
> con su quitar/añadir). "Añadir extras" va **plegado** — veinte chips abiertos empujaban las
> hermanas fuera de pantalla, que es como se perdió el bloque la primera vez.

```json
{
  "esquema": "hermanas-ingrediente-principal-v1",
  "fuente": "DATA.productos[].ingredientes[].nombre (ya viaja en el bundle)",
  "derivado": true,
  "regla_del_principal": "el ingrediente que comparten VARIAS pero no CASI TODAS: lo que sale en >=60% del grupo es la base (tomate, mozzarella) y NO distingue una pizza de otra; empate -> el más repetido",
  "orden_en_la_ficha": ["cabecera+precio", "hermanas", "escalera", "ingredientes tocables", "extras PLEGADOS"],
  "acciones": {
    "elegir": "addToCart(id) — precio del producto, sin extras",
    "personalizar": "showDetail(id) — la ficha de la hermana, con SUS ingredientes y su bloque recalculado (showDetail resetea quitarSel/anadirSel: nada se hereda del ancla)"
  },
  "piezas": {
    "modules/pizzepos/carta-digital/static-template.js": "familiaDe · ingPrincipalDe · renderHermanas + delegación en #detail-content; el bloque se pinta PEGADO A LA CABECERA (antes de ingredientes y extras — enterrado debajo de 'Añadir extras' era invisible en el móvil)",
    "frontend/src/lib/utils/indice-ingredientes.ts": "hermanasDe(producto, todos) — la misma regla en el comandero (VariacionesPanel), para que el camarero vea las hermanas al abrir la pizza",
    "tests/unit/carta-digital__hermanas-ingrediente.test.js": "10 casos sobre el runtime REAL emitido (stub DOM, corte del bootstrap): orden del bloque, extras plegados, etiqueta Personalizar (y CERO 'Editar'), emoji en la fila, abrir LA ficha de la hermana y que sus chips NO arrastren los del ancla"
  },
  "fijado": {
    "npm": "test:carta-digital__hermanas · test:carta-digital__republicacion, y ambos DENTRO de `npm run test` (la suite canónica: quien corre los tests, corre la guarda)",
    "ci_hoy": "NO — dos bloqueos reales, medidos: (1) el PAT del repo tiene scope `repo` y GitHub rechaza cualquier cambio en .github/workflows sin scope `workflow`; (2) validate.yml muere antes de cualquier paso de carta (test:motor sale 1 con 14 fallos, validate:ci sale 1 por schema). Un guard ahí sería verde de mentira",
    "ci_manana": "cuando el CI vuelva a estar verde, el paso va JUSTO ANTES de validate:ci (los de después no se ejecutan) — `npm run test:carta-digital__hermanas`",
    "prueba_de_que_muerde": "inyectar el fallo real (detailProd sin reasignar) tumba 3 casos, incluido el del arrastre"
  },
  "medido": "the-pirate-v4 (v49): 8 pizzas con Jamón de york -> el ancla lista 7 hermanas; la Margarita no pinta bloque (no inventa eje)"
}
```

> **Por qué derivado y no dato.** No hay campo nuevo en la carta ni nada que mantener en
> cada alta: se calcula al abrir la ficha. Si mañana entra una pizza con jamón, aparece
> sola en el bloque de las otras siete. El patrón `escalera` que ya viajaba en la carta
> sigue siendo el atajo "lo mismo + un ingrediente"; esto es su hermano estructural —
> mismas hermanas, sin exigir que la carta las declare.

## Cuándo se aceptan pedidos y dónde se recoge (estado de servicio)

> **Aceptar un pedido no es un derecho del cliente: es una decisión del negocio.** Hasta v3.6.0
> no había sitio: el horario vivía como texto muerto en `marca.json` y nadie lo leía, así que la
> PWA dejaba pedir a las cuatro de la mañana. Ahora hay UNA fuente y UN freno.

```json
{
  "esquema": "estado-servicio-v1",
  "fuente_unica": "<storage del proyecto>/pizzepos/servicio/config.json (bloque suelto o envuelto en `servicio`)",
  "forma": {
    "zona_horaria": "Europe/Madrid — el servidor corre en UTC; comparar su hora con el horario de Lorca da 2h de error",
    "horario": { "<dia>": ["19:30-23:30", "13:00-16:00"] },
    "excepciones": [{ "fecha": "YYYY-MM-DD", "cerrado": true, "motivo": "Boda privada", "franjas": ["21:00-23:30"] }],
    "interruptor": { "abierto": false, "motivo": "saturacion", "hasta": "ISO|null", "aviso": "texto para el cliente" },
    "recogida": { "direccion": "Juan Carlo I, 49", "ciudad": "Lorca", "maps_url": "…" }
  },
  "prelacion": ["interruptor del dueño", "excepción de la fecha", "horario semanal"],
  "sin_config": "abierto — un fallo de lectura no puede cerrar el negocio",
  "dia_con_lista_vacia": "cerrado — es una decisión escrita, no un olvido",
  "franja_que_cruza_medianoche": "19:30-01:00 cubre la madrugada siguiente"
}
```

**Dónde muerde.** La puerta es `pedido.crear-tienda` (`modules/pizzepos/pedidos`): ahí desembocan
las dos vías, la PWA (tienda-api) y WhatsApp (whatsapp-bot). Cierre por saturación → `409
TIENDA_CERRADA`; fuera de horario o excepción → `412 FUERA_DE_HORARIO`; los dos con `motivo`,
`hasta` y `proxima_apertura` en `details`. Los pedidos de MESA no pasan por esa puerta (otra
tool): **el bar sigue trabajando con la tienda cerrada**.

**Las tres piezas (un dato, tres caras).**

| pieza | rol |
|---|---|
| `modules/_shared/horario-servicio.js` | la DECISIÓN, pura: recibe el instante, devuelve el estado. Sin I/O |
| `modules/_shared/lector-servicio.js` | la LECTURA: `fs.read`/`fs.write` del config por el bus, caché 15 s, invalidada por `servicio.cambiado` |
| `pedido.servicio.set` / `pedido.servicio.estado` | la TECLA del dueño (`abierto`, `motivo`, `hasta`, `aviso`) y la pregunta "¿se puede pedir ahora?" |
| `frontend/.../comandero/ServicioToggle.svelte` | la MANO del dueño: el pill ABIERTO/CERRADO en el header del comandero. Cierra 30 min / 1 h / 2 h (se reabre solo), hasta una hora, o sin hora (candado). No abre otra puerta: llama a las mismas dos tools |
| `GET /tienda/estado/:project` | el ESPEJO para la PWA: banner, botones frenados y datos de recogida |

**El dueño cierra desde el comandero, no desde el chat.** El pill del header
(`CuentasScreen.svelte` monta `ServicioToggle`) lee `servicio.estado` al montar y cada 30 s,
y escribe `servicio.set`. Si la tool no existe en el backend desplegado, el pill NO se pinta:
el comandero se comporta como antes. Cerrar por saturación desde el móvil en la barra no exige
consola, ni chat, ni republicar.

**Cerrar no exige republicar.** La PWA pregunta el estado al abrir y pinta el aviso; si el
dueño cierra, muerde en segundos. El bundle es estático: un freno solo en el cliente se salta
con un POST, por eso el freno de verdad vive en pedidos y el de la PWA es solo el aviso visual.

**El dónde.** La confirmación (PWA y WhatsApp) lleva `recogida.direccion` + `maps_url` del mismo
bloque. La dirección ya estaba en `marca.json` (`negocio.local`) y nadie la usaba; ahora viaja al
cliente en el mensaje que cierra el pedido.

**Fijado en tests.** `tests/unit/pizzepos__servicio.test.js` (dentro de `npm run test`): 15 casos
sobre el runtime real — zona horaria, franja que cruza medianoche, día vacío, excepción, prelación
del interruptor, reapertura por `hasta`, 409/412 sin crear pedido, degradación honesta sin config,
y la respuesta HTTP del espejo.
