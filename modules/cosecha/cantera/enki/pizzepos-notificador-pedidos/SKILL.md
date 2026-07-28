---
name: notificador-pedidos
description: >-
  Orquesta notificaciones de pedido nuevo al staff por los canales
  configurados del proyecto (Telegram v1, Discord v2). Escucha
  pedido.creado con canal_origen='web' y envía resumen al staff
  vía telegram.send_message.request. Stateless: resuelve config
  on-demand sin caché.
fuente: enki
dominio: comercio
tags: [pizzepos, notificador, pedidos, telegram, notificacion, staff, pwa]
---

# Pizzepos · notificador-pedidos

> **Qué es.** Cuando un cliente pide desde la PWA web, este módulo
> notifica al staff por Telegram con el resumen del pedido + nombre
> del cliente. Stateless: resuelve la configuración del proyecto
> on-demand en cada pedido.
>
> Código: `modules/pizzepos/notificador-pedidos/index.js` · v`2.0.0`

---

## 1 · LÓGICA

### Flujo de notificación

```
pedido.creado { canal_origen: "web", ... }
  │
  ▼
onPedidoCreado()
  ├─ ¿canal_origen == "web"? → sí
  ├─ project.get.request → resuelve base_path + config
  ├─ Lee config: chatId del staff
  ├─ Prepara mensaje: "🛵 Nuevo pedido!\nMaría: 2x Margarita, 1x Barbacoa\nTotal: 25.50€"
  └─ telegram.send_message.request { chat_id, text, ... }
```

### Canales

| Canal | Estado | Medio |
|-------|--------|-------|
| Telegram | ✅ v1 | `telegram.send_message.request` |
| Discord | 🔜 v2 | `discord.send_message.request` (cuando exista) |

### Stateless

Resuelve `project.get.request` on-demand en cada pedido. Sin caché,
sin dependencia de `project.activated`. Evita fragilidad operativa
por depender del foco UI/session.

---

## 2 · EVENTOS

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `pedido.creado` | `onPedidoCreado` | Dispara notificación si canal_origen='web' |

### Publica (dependencias)

| Evento | Consumer | Razón |
|--------|----------|-------|
| `project.get.request` | project-manager | Resolver base_path + config del proyecto |
| `telegram.send_message.request` | telegram-service | Enviar notificación al chat del staff |

---

## 3 · INTEGRACIÓN

> **Stateless:** no persiste nada. Cada pedido resuelve su configuración
> on-demand. Sin dependencia de la sesión/foco UI.

> **Ancla de recogida:** el nombre del cliente (no código). El dependiente
> lo pide al recoger.

> **Métricas:** contadores de pedidos recibidos, notificados y descartados
> (con razón: canal_origen_no_web, project_resolve_failed, etc.).
