---
name: cuentas-canales
description: >-
  Sistema unificado de canales de venta pizzepos con patrón Strategy: mesa,
  teléfono, llevar, glovo, whatsapp, llevadoo. Cada strategy registra handlers
  específicos del canal. El módulo base orquesta cobro.procesado → detectarCanal
  → strategy.onCobroProcesado, gestiona reseteo diario y emite cuenta.{creada,
  cerrada} canónicos. 60+ tools distribuidas por canal.
fuente: enki
dominio: comercio
tags: [pizzepos, cuentas, canales, mesa, telefono, llevar, glovo, whatsapp, llevadoo, strategy]
---

# Pizzepos · cuentas-canales

> **Qué es.** El orquestador de canales de venta. Cada canal (mesa, teléfono,
> llevar, Glovo, WhatsApp, Llevadoo) implementa una Strategy con sus propios
> eventos, tools y UI. El módulo base unifica la creación/cierre de cuentas y
> el reseteo diario.
>
> **Reflejo puro:** toda la lógica es determinista. Sin blueprint. Sin LLM.
> **6 strategies** que reemplazan a los antiguos módulos `cuentas-mesa`,
> `cuentas-telefono` y `cuentas-llevar`.
>
> Código: `modules/pizzepos/cuentas-canales/index.js` · v`5.1.0`

---

## 1 · LÓGICA (las 6 strategies)

### Mapa de canales

| Canal | Prefijo | Tools | Webhook | Pago |
|-------|---------|-------|---------|------|
| **Mesa** 🍽️ | `mesa_` | 9 | — | Interno (cobros) |
| **Teléfono** 📞 | `tel_` | 9 | — | Interno (cobros) |
| **Llevar** 🥡 | `llevar_` | 8 | — | Interno (cobros) |
| **Glovo** 🛵 | `glovo_` | 10 | `POST /glovo/webhook/:project` | Externo |
| **WhatsApp** 💬 | `wa_` | 10 | — | Interno + link pago |
| **Llevadoo** 🚚 | `llevadoo_` | 10 | — | Externo |

### Ciclo de vida de una cuenta cross-canal

```
CANAL (mesa/tel/llevar/glovo/whatsapp/llevadoo)
  │
  ├── cuenta.creada ──→ cuentas (tracking)
  ├── [operaciones del canal]
  ├── cocina.pedido_listo ──→ strategy.onCocinaPedidoListo (notifica)
  └── cobro.procesado ──→ detectarCanal() → strategy.onCobroProcesado → cuenta.cerrada
```

### Reseteo diario

Al iniciar un nuevo día, todos los contadores y tracking de tiempos se
reinician. Las cuentas abiertas se cierran automáticamente.

---

## 2 · TOOLS POR CANAL

### Mesa 🍽️ (prefijo `mesa_`)

| Tool | Descripción |
|------|-------------|
| `mesa.abrir` | Abre una mesa para servicio (nombre libre) |
| `mesa.cerrar` | Cierra una mesa abierta. Emite mesa.cerrada + cuenta.cerrada |
| `mesa.renombrar` | Cambia el nombre legible de una mesa activa |
| `mesa.asignar_camarero` | Asigna camarero a mesa. Emite mesa.camarero_asignado |
| `mesa.get` | Datos de una mesa por cuenta_id |
| `mesa.activas` | Mesas activas ahora mismo |
| `mesa.list` | Todas las mesas (activas + histórico del día) |

### Teléfono 📞 (prefijo `tel_`)

| Tool | Descripción |
|------|-------------|
| `telefono.llamada` | Notifica llamada entrante con caller-id |
| `telefono.crear_pedido` | Crea pedido telefónico explícito |
| `telefono.pendientes` | Pedidos telefónicos pendientes |
| `telefono.get` | Pedido por cuenta_id |
| `telefono.marcar_listo` | Marca listo para recoger. Emite `telefono.listo_para_recoger` |
| `telefono.marcar_recogido` | Marca recogido. Emite cuenta.cerrada |
| `telefono.contactos` | CRM telefónico (caller-id histórico) |
| `telefono.guardar_contacto` | Guarda/actualiza contacto en CRM |

### Llevar 🥡 (prefijo `llevar_`)

| Tool | Descripción |
|------|-------------|
| `llevar.crear` | Crea ticket para llevar. Emite `llevar.ticket_creado` |
| `llevar.marcar_listo` | Marca listo. Emite `llevar.ticket_listo` |
| `llevar.entregar` | Marca entregado. Emite `llevar.ticket_entregado` |
| `llevar.activos` | Tickets activos (creados o listos, no entregados) |
| `llevar.listos` | Tickets listos esperando recogida |
| `llevar.get` | Ticket por cuenta_id |

### Glovo 🛵 (prefijo `glovo_`)

Webhook entrante: `POST /glovo/webhook/:project` (Caddy rewrite).

| Tool | Descripción |
|------|-------------|
| `glovo.recibir` | Recibe pedido Glovo. Emite `glovo.pedido_recibido` |
| `glovo.aceptar` | Acepta pedido pendiente. Emite `glovo.pedido_aceptado` |
| `glovo.rechazar` | Rechaza pedido. Emite `glovo.pedido_rechazado` |
| `glovo.marcar_listo` | Listo para rider. Emite `glovo.pedido_listo` |
| `glovo.marcar_recogido` | Recogido por rider. Emite cuenta.cerrada |
| `glovo.activos` | Pedidos activos (aceptados, no entregados) |
| `glovo.get` | Pedido por cuenta_id |
| `glovo.historial` | Historial del día |
| `glovo.poll` | Trigger manual del poll a API Glovo (debug) |

### WhatsApp 💬 (prefijo `wa_`)

| Tool | Descripción |
|------|-------------|
| `whatsapp.mensaje` | Mensaje entrante. Detecta intent y responde |
| `whatsapp.crear_pedido` | Crea pedido en conversación. Emite `whatsapp.pedido_creado` |
| `whatsapp.confirmar` | Confirma pedido. Emite `whatsapp.pedido_confirmado` |
| `whatsapp.marcar_listo` | Marca listo. Notifica con plantilla WhatsApp |
| `whatsapp.activos` | Pedidos activos |
| `whatsapp.get` | Pedido por cuenta_id |
| `whatsapp.conversaciones` | Conversaciones con resumen |
| `whatsapp.enviar` | Envía mensaje saliente |

### Llevadoo 🚚 (prefijo `llevadoo_`)

| Tool | Descripción |
|------|-------------|
| `llevadoo.crear_pedido` | Crea pedido delivery externo |
| `llevadoo.pendientes` | Pedidos pendientes de aceptar |
| `llevadoo.get` | Pedido por cuenta_id |
| `llevadoo.activos` | Pedidos activos |
| `llevadoo.aceptar` | Acepta pedido. Emite `llevadoo.pedido_aceptado` |
| `llevadoo.marcar_recogido` | Recogido por rider. Emite cuenta.cerrada |
| `llevadoo.cancelar` | Cancela pedido |
| `llevadoo.carta_delivery` | Carta filtrada para delivery |
| `llevadoo.config_recargo` | Lee configuración de recargo |
| `llevadoo.set_config_recargo` | Actualiza configuración de recargo |

---

## 3 · EVENTOS

### Publica (eventos canónicos cross-canal)

| Evento | Cuándo |
|--------|--------|
| `cuenta.creada` | Cuenta creada en cualquier canal (lleva tipo + origen) |
| `cuenta.cerrada` | Cuenta cerrada en cualquier canal (lleva tipo + total) |

### Eventos por canal

| Evento | Canal |
|--------|-------|
| `mesa.abierta` / `mesa.cerrada` / `mesa.camarero_asignado` / `mesa.renombrada` | Mesa |
| `telefono.llamada_detectada` / `telefono.pedido_creado` / `telefono.listo_para_recoger` | Teléfono |
| `llevar.ticket_creado` / `llevar.ticket_listo` / `llevar.ticket_entregado` | Llevar |
| `glovo.pedido_recibido` / `glovo.pedido_aceptado` / `glovo.pedido_rechazado` / `glovo.pedido_listo` / `glovo.pedido_recogido` | Glovo |
| `whatsapp.mensaje_recibido` / `whatsapp.pedido_creado` / `whatsapp.pedido_confirmado` / `whatsapp.pedido_listo` | WhatsApp |
| `llevadoo.pedido_recibido` / `llevadoo.pedido_aceptado` / `llevadoo.para_recoger` / `llevadoo.pedido_listo` / `llevadoo.pedido_entregado` | Llevadoo |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `cobro.procesado` | `onCobroProcesado` | Cobro completado — cierra cuenta en el canal por prefijo |
| `pedido.creado` | `MesaStrategy.onPedidoCreado` | Actualiza total de mesa |
| `cocina.pedido_listo` | `*Strategy.onCocinaPedidoListo` | Notifica al canal correspondiente |

---

## 4 · FLUJO TÍPICO

### Pedido Glovo (delivery externo)

```
1. GLOVO envía webhook     → POST /glovo/webhook/:project
2. Valida token             → GLOVO_WEBHOOK_TOKEN (credential-manager)
3. Trae detalle autoritativo → Glovo API (local.glovo.get_order)
4. Crea cuenta + pedido     → glovo.pedido_recibido → cocina
5. RESTAURANTE acepta       → glovo.aceptar → glovo.pedido_aceptado
6. COCINA prepara           → cocina.pedido_listo → notifica Glovo
7. RIDER recoge             → glovo.marcar_recogido → cuenta.cerrada
```

### Pedido WhatsApp (conversación)

```
1. CLIENTE escribe          → webhook WhatsApp → whatsapp.mensaje
2. BOT responde             → auto-reply + detecta intent
3. CAMARERO crea pedido     → whatsapp.crear_pedido
4. CONFIRMA                 → whatsapp.confirmar → template confirmación
5. COCINA prepara           → whatsapp.marcar_listo → template "listo para recoger"
6. CLIENTE recoge           → pago en mostrador → cobro.procesado → cuenta.cerrada
```

---

## 5 · INTEGRACIÓN

> **Tools por canal:** cada canal expone sus propias tools con prefijo
> (`mesa.*`, `telefono.*`, `llevar.*`, `glovo.*`, `whatsapp.*`, `llevadoo.*`).

> **Webhook Glovo:** Caddy reescribe `/glovo/*` → `/modules/cuentas-canales/glovo/*`.
> Token secreto en `GLOVO_WEBHOOK_TOKEN` (credential-manager / .env), no en config.

> **WhatsApp Business API:** templates de notificación configurables en
> `config.whatsapp_bot.template_*`. Canal deshabilitado por defecto.

> **Sin persistencia:** en memoria. Contadores y tracking se pierden en reinicio.
> El reseteo diario es obligatorio (`config.reseteo_diario: true`).
