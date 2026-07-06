---
id: frontend/mapa-front-back
dominio: frontend
resumen: El puente MQTT: mapa dominio→módulo backend por cada consumidor del frontend, mapa inverso y ciclo del enlace.
fuentes:
  - frontend/src/lib/ui-core/**
  - frontend/src/lib/stores/**
verificado: 2026-07-06
---

# FRONTEND ↔ BACKEND — Mapa de Referencias (puente MQTT)

El puente es MQTT. Un consumidor del frontend (store, módulo lazy o pantalla) invoca `mqttRequest(domain, action, data)` → publica en `ui/request/{domain}/{action}` → el `UIRequestHandler` del módulo backend que registró `(domain, action)` responde en `ui/response/{request_id}`. Los eventos backend→frontend viajan por topics directos o `core/*/events/{domain}/{action}` y los stores los consumen vía `subscribe()`.

## Contrato del enlace

```
INTERFAZ EnlaceFrontBack {
  consumidor_front: Store|ModuloLazy|Pantalla
  domain: String
  acciones: Array<String>
  transporte_request: `ui/request/{domain}/{action}` -> `ui/response/{request_id}`
  transporte_evento?: `core/*/events/{domain}/{action}` | topic_directo
  modulo_backend: String
  tipo_backend: 'module' | 'blueprint' | 'provider' | 'gateway-internal'
}

CLASE RegistroDeEnlaces {
  resolver(domain): {modulo_backend, tipo}
  resolverInverso(modulo_backend): Array<{consumidor_front, domain}>
  MAPA_DOMINIO_A_MODULO: Map<domain, modulo_backend>
}
```

## SUBSISTEMA NÚCLEO / CONVERSACIÓN

```
ENLACE project {
  consumidor_front: [stores/projects.ts, stores/workspace.ts, modules/project]
  domain: 'project'
  acciones: [list, get, create, update, delete, activate, deactivate, add-features]
  modulo_backend: 'project-manager'  (domain=project)
  eventos_in: ['project/activated' -> workspace.activeProject, 'project/list']
  publica_front: ['project/activate']
}

ENLACE conversation {
  consumidor_front: [stores/chat.ts, stores/conversations.ts]
  domain: 'conversation'
  acciones: [send, load, delete, toggle_context, update_settings, context_stats]
  modulo_backend: 'conversacion/chat-io'  (domain=conversation)
  colateral_backend: 'conversation-export'  (consume agent.*, db.query)
  eventos_in: ['conversation/+/message', 'conversation/+/tool-status',
               'conversation/+/agent_status', 'conversation/stream/end',
               'conversation/loaded', 'chat.foco.cambiado']
  contrato_send: {project_id, page_id, conversation_id, context, settings, prompt, attachments, intencion, message}
}

ENLACE prompt_preset {
  consumidor_front: [stores/prompts.ts, modules/prompts]
  domain: ['prompt', 'preset']
  acciones_prompt: [list, get, create, update, delete]
  acciones_preset: [list, create, delete]
  modulo_backend: 'prompt-manager'  (domain=prompt; preset.* mismo módulo)
}

ENLACE credential {
  consumidor_front: [stores/credentials.ts, modules/credentials]
  domain: 'credential'
  acciones: [list, create, update, delete, test, oauth.start, oauth.config.save,
             oauth.config.delete, glovo.save, glovo.delete, telegram.notif.save, telegram.notif.delete]
  modulo_backend: 'credential-manager'  (domain=credential)
  eventos_in: ['credential/resolved' -> workspace.credentialStatus, 'credential/state', 'credential.saved']
}

ENLACE page {
  consumidor_front: [modules/related-pages]
  domain: 'page'
  acciones: [related]
  modulo_backend: 'conversacion/ai-gateway'  (_buildPageGraph: consumes + consumed_by)
  tipo_backend: 'module'
}

ENLACE provider {
  consumidor_front: [modules/provider, stores/workspace.ts]
  publica_front: ['provider/selected']
  eventos_in: ['provider/state' -> activeProvider+activeModel, 'credential/resolved']
  modulo_backend: 'conversacion/ai-gateway' (+ credential-manager para resolución)
}
```

## SUBSISTEMA FILESYSTEM / EDITOR

```
ENLACE fs {
  consumidor_front: [stores/carta-design, carta-digital, carta-manager,
                     carta-marketing, carta-scheduler, carta, escandallo, recetas, tarifas;
                     modules/carta-config, carta-preview, viabilidad]
  domain: 'fs'
  acciones: [read, write, list, delete]
  modulo_backend: 'filesystem'  (domain=fs)
}

ENLACE files_editor {
  consumidor_front: [modules/files]
  domain: ['files', 'editor']
  acciones_files: [list, read, create, delete, search]
  acciones_editor: [open, save]
  modulo_backend_files: 'filesystem'
  modulo_backend_editor: 'text-editor'  (domain=editor)
}
```

## SUBSISTEMA PIZZEPOS — POS

```
ENLACE comandero {
  consumidor_front: [stores/comandero.ts, stores/cuentas.ts, stores/llevadoo.ts]
  domain: 'comandero'
  acciones: [get, buffers, add-item, update-item, remove-item, send-kitchen]
  modulo_backend: 'pizzepos/comandero'  (domain=comandero)
}

ENLACE cuenta_mesa {
  consumidor_front: [stores/cuentas.ts, components/comandero/*]
  domain: ['cuenta', 'mesa']
  acciones_cuenta: [list, get, create, delete, rename, stats, marcar_entregado]
  acciones_mesa: [get, abrir, renombrar]
  modulo_backend: 'pizzepos/cuentas'  (domain=cuenta; mesa via cuentas-canales strategy)
}

ENLACE cobro {
  consumidor_front: [components/comandero/CobroPanel]
  domain: 'cobro'
  acciones: [create, confirm]
  modulo_backend: 'pizzepos/cobros'  (domain=cobro)
}

ENLACE productos {
  consumidor_front: [stores/comandero.ts, stores/carta.ts, components/carta/*, components/cocina/*]
  domain: 'productos'
  acciones: [list, pizzas, carta_completa, ingredientes, categorias]
  modulo_backend: 'pizzepos/productos'  (domain=productos)
}

ENLACE variaciones {
  consumidor_front: [components/comandero/VariacionesPanel]
  domain: 'variaciones'
  acciones: [get]
  modulo_backend: 'pizzepos/variaciones'
}

ENLACE persistencia {
  consumidor_front: [stores/cuentas.ts, components/comandero/CierreCajaPanel]
  domain: 'persistencia'
  acciones: [cuentas_activas, iniciar_dia, cierre]
  modulo_backend: 'pizzepos/persistencia-comandero'  (domain=persistencia)
}

ENLACE tarifas {
  consumidor_front: [stores/tarifas.ts, ui-core/carta-canal.ts]
  domain: 'tarifas'
  acciones: [get]
  modulo_backend: 'pizzepos/tarifas'  (domain=tarifas)
}

ENLACE cocina {
  consumidor_front: [stores/cocina.ts]
  domain: 'cocina'
  acciones: [list-active, list-station-types, register-device, prepare-item, mark-ready, metrics]
  modulo_backend: 'pizzepos/cocina'  (domain=cocina)
}

ENLACE impresion {
  consumidor_front: [stores/impresion.ts, modules/impresion]
  domain: 'impresion'
  acciones: [estado, conectar, impresoras, ticket, ticket-venta, historial, metrics]
  modulo_backend: 'pizzepos/impresion'  (domain=impresion)
  eventos_in: ['impresion.comanda_generada', 'impresion.error']
}

ENLACE canales_delivery {
  consumidor_front: [stores/cuentas.ts, stores/cocina.ts, stores/llevadoo.ts]
  domain: ['llevadoo', 'llevar', 'mesa', 'glovo']
  acciones_llevadoo: [activos, carta_delivery, crear_pedido, marcar_recogido, cancelar, set_config_recargo]
  acciones_llevar: [crear, entregar]
  acciones_glovo: [aceptar, rechazar]
  modulo_backend: 'pizzepos/cuentas-canales'  (strategies: llevadoo, llevar, mesa, glovo, telefono)
}
```

## SUBSISTEMA CARTA / GENERACIÓN DE MENÚ

```
ENLACE menu {
  consumidor_front: [stores/menu-generator.ts, modules/design-gallery]
  domain: 'menu'
  acciones: [generate, list]
  modulo_backend: 'pizzepos/menu-generator'
}

ENLACE pdf {
  consumidor_front: [modules/menu-pdf2img]
  domain: 'pdf'
  acciones: [info, render]  (+ pdf-viewer: view, metadata, list)
  modulo_backend: ['services/providers/local/pdf', 'services/providers/local/pdf-to-png', 'pdf-viewer']
  tipo_backend: 'provider' + 'module'
}

ENLACE ocr_imagen {
  consumidor_front: [modules/menu-prepare, modules/menu-ocr]
  domain: ['sharp', 'tesseract', 'google-vision', 'scribe-ocr', 'document-processor']
  acciones: [prepare-ocr, extract, process]
  modulo_backend: 'services/providers/local/{sharp|tesseract|google-vision|scribe-ocr|document-processor}'
  tipo_backend: 'provider'  (registerProviderTools -> ui/request/{provider}/{function})
}

NOTA_CARTAS_BLUEPRINT {
  modules_backend: [pizzepos/carta-design, carta-digital, carta-manager,
                    carta-marketing, carta-scheduler]
  tipo_backend: 'blueprint'  (sin index.js; persistencia por proyecto)
  acceso_front: domain 'fs' (stores carta-* leen/escriben data/projects/{slug} via filesystem)
}
```

## SUBSISTEMA DISPOSITIVOS / IOT / FIRMWARE

```
ENLACE devices {
  consumidor_front: [stores/dispositivos.ts]
  domain: 'devices'
  acciones: [list, register, unregister, stats]
  modulo_backend: 'device-registry'  (domain=devices)
}

ENLACE health {
  consumidor_front: [stores/dispositivos.ts]
  domain: 'health'
  acciones: [dashboard, alerts]
  modulo_backend: 'device-health'  (domain=health)
}

ENLACE shadow {
  consumidor_front: [stores/dispositivos.ts]
  domain: 'shadow'
  acciones: [get-full, set-desired]
  modulo_backend: 'device-shadow'  (domain=shadow)
}

ENLACE firmware {
  consumidor_front: [stores/dispositivos.ts, stores/esp32.ts]
  domain: 'firmware'
  acciones: [list, status, trigger-ota, rollback, device-versions]
  modulo_backend: 'firmware-manager'  (domain=firmware)
}

ENLACE builder {
  consumidor_front: [stores/esp32.ts]
  domain: 'builder'
  acciones: [list-drivers, list-boards, build, build-status]
  modulo_backend: 'firmware-builder'  (domain=builder)
}

ENLACE flash {
  consumidor_front: [stores/esp32.ts]
  domain: 'flash'
  acciones: [list-ports, start, status, cancel, history, monitor-start, monitor-stop, monitor-send]
  modulo_backend: 'esp32-flasher'  (domain=flash)
}

ENLACE gateways {
  consumidor_front: [stores/dispositivos.ts]
  domain: 'gateways'
  acciones: [list, restart, discover]
  modulo_backend: 'gateway-manager'  (domain=gateways)
}

ENLACE perifericos {
  consumidor_front: [stores/dispositivos.ts, stores/cocina.ts, stores/impresion.ts]
  domain: 'perifericos'
  acciones: [list, create, delete, status, test, discover, listar-por-capacidad]
  modulo_backend: 'perifericos'  (domain=perifericos)
}

ENLACE certificate_authority {
  consumidor_front: [stores/certificate-authority.ts, modules/certificate-authority]
  domain: 'certificate-authority'
  acciones: [issue, revoke, renew]
  modulo_backend: 'certificate-authority'  (domain=certificate-authority)
}
```

## SUBSISTEMA FACTURACIÓN

```
ENLACE facturas {
  consumidor_front: [stores/facturas.ts, modules/facturas]
  domain: 'facturas'
  acciones: [listar, obtener, actualizar, subir, reprocesar, exportar, estadisticas, pipeline-metrics]
  modulo_backend: 'facturas'  (domain=facturas)
}

ENLACE fuentes {
  consumidor_front: [modules/facturas]
  domain: 'fuentes'
  acciones: [get-config, save-config, check-gmail]
  modulo_backend: 'facturacion/fuentes'  (domain=fuentes)
}

ENLACE asesoria {
  consumidor_front: [stores/facturas.ts]
  domain: 'asesoria'
  acciones: [historial, generar-paquete]
  modulo_backend: 'facturacion/asesoria'  (domain=asesoria)
}
```

## SUBSISTEMA CANALES / COMS

```
ENLACE channel {
  consumidor_front: [stores/channels.ts]
  domain: 'channel'
  acciones: [list, register, update, remove]
  modulo_backend: 'channel-manager'  (domain=channel)
}
```

## MAPA INVERSO — Módulo backend → consumidor frontend

```
MAPA_INVERSO {
  project-manager           <- stores/projects, stores/workspace, modules/project
  conversacion/chat-io      <- stores/chat, stores/conversations
  conversacion/ai-gateway   <- modules/provider, modules/related-pages
  prompt-manager            <- stores/prompts, modules/prompts
  credential-manager        <- stores/credentials, modules/credentials, stores/workspace
  filesystem                <- stores/carta-*, escandallo, recetas, tarifas; modules/carta-config, carta-preview, viabilidad, files
  text-editor               <- modules/files
  pizzepos/comandero        <- stores/comandero, cuentas, llevadoo
  pizzepos/cuentas          <- stores/cuentas, components/comandero
  pizzepos/cobros           <- components/comandero/CobroPanel
  pizzepos/productos        <- stores/comandero, carta; components/carta, cocina
  pizzepos/variaciones      <- components/comandero/VariacionesPanel
  pizzepos/persistencia-comandero <- stores/cuentas, components/comandero/CierreCajaPanel
  pizzepos/tarifas          <- stores/tarifas, ui-core/carta-canal
  pizzepos/cocina           <- stores/cocina
  pizzepos/impresion        <- stores/impresion, modules/impresion
  pizzepos/cuentas-canales  <- stores/cuentas, cocina, llevadoo
  pizzepos/menu-generator   <- stores/menu-generator, modules/design-gallery
  pdf-viewer                <- modules/menu-pdf2img
  providers/local/{pdf,pdf-to-png,sharp,tesseract,google-vision,scribe-ocr,document-processor} <- modules/menu-pdf2img, menu-prepare, menu-ocr
  device-registry           <- stores/dispositivos
  device-health             <- stores/dispositivos
  device-shadow             <- stores/dispositivos
  firmware-manager          <- stores/dispositivos, esp32
  firmware-builder          <- stores/esp32
  esp32-flasher             <- stores/esp32
  gateway-manager           <- stores/dispositivos
  perifericos               <- stores/dispositivos, cocina, impresion
  certificate-authority     <- stores/certificate-authority, modules/certificate-authority
  facturas                  <- stores/facturas, modules/facturas
  facturacion/fuentes       <- modules/facturas
  facturacion/asesoria      <- stores/facturas
  channel-manager           <- stores/channels
}
```

## SIN ENLACE DIRECTO FRONT (módulos backend no consumidos por la UI analizada)

```
SIN_CONSUMIDOR_FRONT_DIRECTO {
  admin-panel, bot-manager, bienvenida-tienda, code-executor, comandero-cliente-builder,
  composition-manager, dashboard, database-manager, log-manager, mercadona-api, metricas,
  mise-en-place, notas-poc, notificador-pedidos, pase-cocina, plugin-manager, scheduler,
  security-p2p, staff-manager, system-coherence-analyzer, system-inspector,
  telegram-service, tienda-api, whatsapp-bot,
  conversacion/{agent-observer, ai-agent-framework, memory-*, prompt-builder},
  pizzepos/{categorias, ingredientes, escandallo, recetas, tecnicas, pedidos, cocina-poc}
}
NOTA: el acceso a estos ocurre vía eventos del bus, agentes, o consumo indirecto
      (categorias/ingredientes/escandallo/recetas se leen por fs o derivados de productos/carta).
```

## CICLO DEL ENLACE

```
REQUEST_FRONT_A_BACKEND {
  1. consumidor.front: mqttRequest(domain, action, data, {timeout})
  2. mqtt-request: publishRaw(`ui/request/{domain}/{action}`, {request_id, action, data, source})
  3. UIRequestHandler(backend)._onMessage: parsea domain/action -> handler registrado
  4. handler: ejecuta -> {status, data} -> publica `ui/response/{request_id}`
  5. mqtt-request: match request_id -> resolve(UIResponse) | reject(MqttRequestError|Timeout)
  6. store/componente: actualiza writable -> render reactivo
}

EVENTO_BACKEND_A_FRONT {
  1. modulo backend: eventBus.emit(domain.action, data)
  2. EventBus -> MQTT: `core/{coreId}/events/{domain}/{action}`
  3. MqttClient(front).subscribe(pattern) -> #notifyHandlers -> store.update
  4. ejemplos: project/activated, provider/state, credential/resolved,
               conversation/+/message, impresion.comanda_generada, chat.foco.cambiado
}
```
