---
name: interfaces
description: >-
  CÚPULA DE INTERFACES — la gemela frontend de la arquitectura modular de Enki.
  Agrupa skills, patrones, templates y componentes para construir interfaces
  de usuario sobre el bus MQTT. Misma filosofía que los módulos backend:
  independientes, contratados por eventos, extensibles.
categoria: cupula
version: 0.1.0
---

# Cúpula de Interfaces

> La interfaz no es una capa aparte. Es la **gemela** del backend — misma
> arquitectura modular, mismo bus MQTT, mismos patrones de contrato y evento.
> Lo que cambia es el aterrizaje: el backend termina en datos persistentes;
> el frontend termina en píxeles.

## Simetría Backend ↔ Frontend

| Backend (módulo Enki) | Frontend (store + componente) |
|------------------------|-------------------------------|
| `module.json` (contrato) | `store.ts` (tipos + acciones) |
| `index.js` (lógica) | acciones `mqttRequest()` |
| `handlers RPC` | derivados + suscripciones |
| `eventBus.publish()` | `subscribe(evento)` en store |
| Persiste en storage | Refleja en UI (Svelte) |
| `module.json/ui_handlers` | Store exporta acciones + derivados |

## Estructura

```
interfaces/
├── _index.md                          # Este archivo
├── patrones-fundacionales/            # Skills base (como _shared del backend)
│   ├── pos-frontend-construction/     # Blueprint completo para construir un POS
│   ├── ui-store-mqtt/                 # → Patrón store MQTT (próximamente)
│   ├── ui-component-screen/           # → Template de pantalla (próximamente)
│   └── ui-skin-system/                # → Sistema de temas (próximamente)
├── modulos-pos/                       # Skills frontend de módulos pizzepos
│   ├── pos-comandero/                 # → TPV (próximamente)
│   ├── pos-cuentas/                   # → Cuentas activas (próximamente)
│   ├── pos-cocina/                    # → Display cocina (próximamente)
│   └── pos-cobro/                     # → Panel de cobro (próximamente)
├── modulos-comercio/                  # Skills frontend de módulos prisma
│   └── commerce-carrito/              # → Carrito universal (próximamente)
├── templates/                         # Plantillas para copiar y adaptar
│   ├── store.ts                       # Store MQTT completo
│   ├── backend-module.js              # Módulo backend Enki
│   ├── page.svelte                    # Página SvelteKit
│   └── panel.svelte                   # → Panel flotante (próximamente)
├── ui-usabilidad/                     # Patrones de UX
│   └── ux-flujo-cuenta/               # → Flujo cuenta→pedido→cobro (próximamente)
└── ui-marketing/                      # Marketing visual
    └── mk-cta-generator/              # → CTA (próximamente)
```

## Principios

1. **Reflejo, no cálculo** — el frontend refleja lo que el backend responde. Cero lógica de precio, cero state duplicado.
2. **MQTT es el bus único** — no hay REST, WebSocket ni HTTP directo.
3. **Stores autocontenidos** — cada store sabe pedir sus datos y suscribirse a sus eventos.
4. **Componentes tontos** — reciben props, emiten eventos, no llaman a MQTT directamente.
5. **Navegación emergente** — las páginas vienen de la config del proyecto, no de una lista fija.
6. **Cada skill es independiente** — se puede cargar sola, pero todas beben del mismo patrón.
