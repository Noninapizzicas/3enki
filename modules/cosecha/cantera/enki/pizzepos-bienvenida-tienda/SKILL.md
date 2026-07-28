---
name: bienvenida-tienda
description: >-
  Cara cliente del bot del negocio. Responde con saludo + link a la PWA tienda cuando el cliente final escribe al bot por primera vez (o cualquier mensaje libre). Es contraparte de notificador-pedidos (
fuente: enki
dominio: comercio
tags: [pizzepos, bienvenida-tienda, pos]
---

# Pizzepos · bienvenida-tienda

> Cara cliente del bot del negocio. Responde con saludo + link a la PWA tienda cuando el cliente final escribe al bot por primera vez (o cualquier mensaje libre). Es contraparte de notificador-pedidos (cara staff) — mismo bot, dos roles distintos. 

Versión: `1.1.0` · Módulo: `modules/pizzepos/bienvenida-tienda/`


## Eventos que escucha

Reacciona a estos eventos del bus:

  · `telegram.text.received` — 
  · `telegram.command.received` — 
  · `project.activated` — 

## Integración

> Esta skill describe el módulo `bienvenida-tienda` del subsistema `pizzepos`. Para usarlo
> desde el LLM, invoca sus tools directamente o publica sus eventos vía MQTT.
> El código fuente es la verdad viva en `modules/pizzepos/bienvenida-tienda/`.
