---
name: carta-digital
description: >-
  Proyector del canal digital: proyecta la carta publica al vuelo (tarifas+carta-manager+marca+contenido). Sirve get_carta_publica + get_config/update_config (config del canal). El POS no lo usa.
fuente: enki
dominio: comercio
tags: [pizzepos, carta-digital, pos]
---

# Pizzepos · carta-digital

> Proyector del canal digital: proyecta la carta publica al vuelo (tarifas+carta-manager+marca+contenido). Sirve get_carta_publica + get_config/update_config (config del canal). El POS no lo usa. 

Versión: `2.24.0` · Módulo: `modules/pizzepos/carta-digital/`


## UI Handlers

Pantallas que renderiza en el frontend:

  · `` — Proyecta la carta publica al vuelo (branding de marca + carta de carta-manager +
  · `` — Lee el config del canal (dominio_publico + opciones_visualizacion).
  · `` — Actualiza el config del canal (solo dominio/opciones; branding/productos NO se g
  · `` — Lee el diseno (card_template + tema_css) que compuso Enki para el proyecto.

## Integración

> Esta skill describe el módulo `carta-digital` del subsistema `pizzepos`. Para usarlo
> desde el LLM, invoca sus tools directamente o publica sus eventos vía MQTT.
> El código fuente es la verdad viva en `modules/pizzepos/carta-digital/`.
