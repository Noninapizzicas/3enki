---
id: pizzepos/autoservicio-whatsapp
dominio: pizzepos
resumen: Pedido del cliente por WhatsApp: PWA arma #P1 por ids, el bot re-tasa server-side (pedido-tasador), webhook real de Meta, ancla por nombre.
fuentes:
  - modules/whatsapp-bot/**
  - modules/openwa-service/**
  - modules/pizzepos/carta-digital/**
  - modules/pizzepos/pedidos/**
  - modules/_shared/pedido-tasador.js
verificado: 2026-07-06
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
  "pago": { "ahora": "a la recogida (efectivo)", "fase_2": "link Stripe (pago.iniciar ya esbozado en tienda-api)" },
  "aviso_recogida": "cocina.pedido_listo → whatsapp-bot avisa al cliente 'ven a recoger' (ya cableado para origen-whatsapp).",
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
  #P1 <base64url(JSON)>                              ← AUTORITATIVO: { v:1, items:[ItemEstructurado] }

ItemEstructurado (por IDS, nunca por precio):
  normal       → { cantidad, producto_id, tipo:'normal', quitar:[nombres], anadir:[ing_id] }
  al_gusto     → { cantidad, tipo:'al_gusto', producto_id:base_id, base_id, anadir:[ing_id] }
  mitad_mitad  → { cantidad, tipo:'mitad_mitad',
                   pizza_izquierda:{ id, quitar:[nombres], anadir:[ing_id] },
                   pizza_derecha  :{ id, quitar:[nombres], anadir:[ing_id] } }

REGLA  quitar = NOMBRES (gratis, solo nota de cocina) · anadir = IDS (el bot los re-tasa).
       base64url utf8-safe (acentos en quitar). Si #P1 falta → pedido legacy solo-texto (el bot
       no puede re-tasar; confía en el texto con warn). Si #P1 corrupto → el bot pide reenviar.
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

## WhatsApp Cloud API — OPERATIVO end-to-end (v{{version:modules/whatsapp-bot}}) · webhook real de Meta + alta por UI

> Estado: VIVO en producción (enki-ai.online, proyecto nonina). El transporte real es el
> webhook de Meta (graph.facebook.com), no el bus agnóstico. La PUERTA es el verify_token;
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
```

## CLASE carta-digital (PWA) — emite el pedido por ids (#P1) + paridad comandero

```
// modules/pizzepos/carta-digital/static-template.js (generador de la PWA, v2.6.0):
//   - cada item del carrito lleva su `estructura` por ids (normal/al_gusto/mitad_mitad).
//   - buildP1Line(): serializa { v:1, items: buildOrderItems() } a base64url utf8-safe y lo
//     cuelga del mensaje wa.me tras 'Nombre:'. Las líneas humanas siguen (el cliente ve su pedido).
//   - MITAD con variaciones en AMBAS mitades (paridad comandero): botón partido (cuerpo=mitad
//     tal cual · ✏️=personalizar), política max(izq,der)+extras (v2.3.0).
// PODA previa de carta-digital:
//   v2.4.0 — fuera ofertas/reseñas/track (la proyección no los daba: UI viva alimentada por vacío).
//   v2.5.0 — fuera el cerebro FANTASMA del chat (default ai_chat_path '/modules/ai-gateway/chat',
//            endpoint que nadie sirve) → '/chat' (el cf-worker, único cerebro real, escenario suelto).
//            El ALOJADO (publicar) NO setea ai_endpoint → chat OFF por diseño (autoservicio puro).
```

## Ciclo

```
AUTOSERVICIO_COMPLETO {
  0. Meta entrega el mensaje al webhook real (POST /modules/whatsapp-bot/whatsapp/webhook/<slug>)
     — requiere campo 'messages' suscrito + WABA suscrita a la app (subscribed_apps)
  1. cliente escribe al WhatsApp → bot responde con el link de la PWA (greeter)
  2. cliente arma el carrito en la PWA (fotos, mitad, al_gusto, variaciones)
  3. PWA pre-rellena el wa.me con el pedido CANÓNICO + #P1 (por ids) ; cliente pulsa enviar
  4. bot recibe (su nº = identidad veraz) → parsea → estructura (#P1)
  5. bot RE-TASA contra cartaSnap[pid] (fresco por evento) → precios del SERVIDOR
  6. bot publish('pedido.crear-tienda', items re-tasados + estructura) → pedidos
  7. pedidos crea pedido tienda (ancla = cliente_nombre) → _crearCuentaTienda → comandero.enviar_cocina
  8. cocina pinta la comanda ESTRUCTURADA (mitades como el POS) ; estado pendiente_recogida
  9. bot responde al cliente a nombre de <cliente> (pasa a recoger, paga al recoger)
  10. cocina.pedido_listo → bot avisa 'ven a recoger' ; pago a la recogida (efectivo)
}

GARANTÍAS {
  no puertas HTTP abiertas (entrada = webhook Meta) ; precio inmanipulable (re-tasado por ids) ;
  identidad por teléfono sin login ; snapshot de precios fresco por evento (= los de la PWA) ;
  no_silent_failures (producto desconocido / cold-start → el bot pide reenviar, nunca crea mudo).
}
```

## Topics / eventos del subsistema

```
EVENTOS {
  whatsapp.entrante                  → bot (transporte agnóstico; o webhook Meta directo)
  pedido.crear-tienda                : bot/tienda-api → pedidos (items re-tasados + estructura)
  pedido.crear-tienda.response       : pedidos → bot (request_id correlado)
  pedido.creado                      : pedidos (informativo; lleva cuenta_id, sin teléfono/secretos)
  comandero.enviar_cocina            : comandero → cocina (la estructura viaja aquí)
  cocina.pedido_listo                → bot ('ven a recoger')
  catalogo.actualizado               → bot (refresca snapshot) ; tarifas.config.actualizada → bot
  project.activated                  → bot (puente slug↔project_id + warm snapshot)
}
PIEZAS {
  modules/_shared/pedido-tasador.js              (función pura: tasarPedido — re-tasado seguridad)
  modules/whatsapp-bot ({{version:modules/whatsapp-bot}})                   (webhook Meta REAL + alta por UI + snapshot + #P1 + re-tasado + sendTemplate)
  modules/whatsapp-bot/services/meta-cloud-client.js (Meta Cloud API: sendText/sendTemplate/_postMessage/parseWebhookEvent)
  modules/whatsapp-bot/services/pedido-parser.js (#P1: _decodificarEstructura)
  modules/pizzepos/carta-digital (2.17.0)        (PWA emite #P1 + paridad mitad + nombre obligatorio)
  modules/pizzepos/pedidos (3.3.0)               (estructura tienda → cocina ; ancla = cliente_nombre)
  modules/credential-manager ({{version:modules/credential-manager}})             (META_WHATSAPP[_VERIFY_TOKEN] en catálogo + PROJECT_ONLY)
  frontend credentials (CredentialsPanel + stores) (4ª pestaña 💬 WhatsApp · fix agrupado de la lista)
  cocina (_buildCocinaItem → ItemLine)           (YA pintaba la estructura, del comandero)
}
TESTS {
  shared__pedido-tasador (10) · whatsapp-bot__pedido-estructura (4) · whatsapp-bot__retasado (4)
  · autoservicio__roundtrip (4, PWA→parser→tasador) · pizzepos__pedidos-tienda-estructura (3)
  · pizzepos__carta-digital-template (mitad+poda) — suite autoservicio verde.
}
```
