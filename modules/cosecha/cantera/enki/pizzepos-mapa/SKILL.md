---
name: pizzepos-mapa
description: >-
  MAPA de la vertical pizzepos (32 skills): la imagen GENERAL de todos los
  módulos del negocio agrupados por subsistemas (POS, cocina, carta, digital,
  recetario, pagos, facturación). Para CADA módulo: qué hace en 1 línea y
  QUÉ SKILL cargar para el detalle. Empieza AQUÍ cuando la tarea toque
  cualquier módulo pizzepos — evita adivinar entre decenas de skills.
fuente: enki
dominio: comercio
tags: [pizzepos, mapa, indice, vertical, navegacion, pos, carta, recetas, pedidos]
---

# Pizzepos · MAPA de la vertical (32 skills)

> **Qué es.** El índice de navegación de toda la vertical pizzepos. Cuando una
> tarea toque el negocio (POS, carta, cocina, pedidos, recetas, cobros…):
> 1. Lee este mapa (ya lo tienes).
> 2. Localiza el módulo en su subsistema.
> 3. Carga la skill concreta con `cosecha.obtener { nombres: ["<skill>"] }`.
> 4. Ejecuta según esa skill.
>
> Así NO adivinas entre 32 skills: el mapa te encamina. Cada skill concreta
> tiene el detalle FULL (LÓGICA + EVENTOS + FUNCIONES + FLUJO).

---

## 1 · POS — TOMA DE PEDIDOS (7)

| Skill a cargar | Qué hace |
|---|---|
| `comandero` | Buffer de pedido por cuenta: items, variaciones, envío a cocina. Precio por canal vía tarifas. |
| `cuentas` | Ciclo de vida de la cuenta del ticket (7 estados, 100% event-driven): items + cocina + cobro. |
| `cuentas-canales` | Canales de venta con Strategy: mesa, teléfono, llevar, glovo, whatsapp, llevadoo. |
| `cobros` | Cobro unificado — 7 métodos: efectivo, tarjeta, bizum, transferencia, mixto, link_pago, qr. Idempotente por cuenta. |
| `pedidos` | Pedidos formales: 'pos' (con cuenta) y 'tienda' (plano, recogida). Bridge comandero→cocina. |
| `persistencia-comandero` | Event-sourcing + jornada: snapshots de cuentas, ventas, cierre de caja diario. |
| `impresion` | Formateo ESC/POS + impresoras ESP32 vía MQTT. Comandas, tickets. |

## 2 · COCINA (2)

| Skill a cargar | Qué hace |
|---|---|
| `cocina` | Display de cocina en tiempo real: pases multi-estación (general, horno), multi-device. |
| `pase-cocina` | Fichas de pase (snapshot de la receta en servicio) + incidencias. Solo registra. |

## 3 · CARTA — CATÁLOGO (7)

| Skill a cargar | Qué hace |
|---|---|
| `carta-manager` | AGGREGATE ROOT de la carta: 15 ops deterministas (save/get/list/add_product…). Custodio único del store. |
| `productos` | Proyector sin estado: carta activa → formato POS al vuelo (lee carta-manager). |
| `categorias` | Catálogo de categorías, sincronizado desde carta.actualizada. |
| `ingredientes` | Ingredientes por GRUPO, fuente de precios (precio_extra) para Opciones. |
| `variaciones` | Quitar/añadir ingredientes por producto: reglas, máximos de extras. |
| `tarifas` | Asignación carta+canal + variantes: cada canal con su carta y precios. |
| `contenido` | Enriquecimiento audiovisual por producto (imágenes) — beben los canales de presentación. |

## 4 · DIGITAL — PRESENTACIÓN (5)

| Skill a cargar | Qué hace |
|---|---|
| `carta-digital` | Proyector del canal digital: carta pública al vuelo (tarifas+carta+marca+contenido). |
| `carta-design` | Diseño HÍBRIDO: reflejo (contexto/load/save/gallery) + LLM de página (entrevista + HTML). |
| `carta-marketing` | Perfil de marca + copy de producto. Reflejo CRUD + blueprint redacta. |
| `media-generator` | Líder generador: media.generar por tipo (imagen/audio/música) → motor configurado. |
| `bienvenida-tienda` | Cara cliente del bot: saludo + link a la PWA tienda al primer mensaje. |

## 5 · RECETARIO — COSTE (5)

| Skill a cargar | Qué hace |
|---|---|
| `recetas` | Recetas HÍBRIDO: cajones LLM (crear/editar) + reflejo (listar/obtener/ingredientes). |
| `escandallo` | Costeo de recetas (food cost): aritmética pura en el reflejo. |
| `viabilidad` | Evaluador económico previo: receta + PVP objetivo → ¿viable? |
| `mercadona-api` | Precios reales de Mercadona (API no oficial) para estimar coste. |
| `menu-generator` | Genera carta desde texto/dictado/JSON → la entrega al custodio (carta-manager). |

## 6 · PAGOS — PEDIDOS WEB (3)

| Skill a cargar | Qué hace |
|---|---|
| `pago-gateway` | Líder de pago: pago.iniciar → pasarela configurada (Stripe). Webhook firmado → pago.confirmado. |
| `notificador-pedidos` | Avisa al staff de pedido nuevo (Telegram v1, Discord v2) cuando llega por web. |
| `tienda-api` | Canal HTTP de la PWA: recibe el POST de pedido → delega en pedidos. Stateless. |

## 7 · NEGOCIO — ADMIN (2)

| Skill a cargar | Qué hace |
|---|---|
| `facturas` | Pipeline de facturas: Intake → Convert → Prepare → OCR → Structure (IA) → Validate → Store. |
| `inventario` | Stock real + reservas con expiración. Disponible = real − Σ reservas. Libera expiradas cada 60s. |

---

## Reglas de encaminamiento rápido

- **"Cuenta/ticket/cobro"** → `cuentas` → `cobros` → `pedidos` (orden del flujo del POS).
- **"Carta/la carta de X"** → `carta-manager` (custodio) o `productos` (leer para POS).
- **"Página web del cliente"** → `carta-digital` + `tienda-api` + `bienvenida-tienda`.
- **"Coste/precio de receta"** → `escandallo` + `viabilidad` + `mercadona-api`.
- **"Pedido llegado / avisar staff"** → `notificador-pedidos`.
- **"Imprimir comanda/ticket"** → `impresion`.
- **"Diseño/marca/copy"** → `carta-design` + `carta-marketing`.
- **"Stock"** → `inventario`. **"Factura"** → `facturas`.
- **Cualquier diseño con medidas (planos)** → skill `planos-cad` (no es pizzepos, es transversal).

## Si el mapa no basta

La skill concreta tiene el detalle (eventos, tools, errores). Si necesitas el
flujo completo de un módulo, carga SU skill — no improvises sobre este resumen.
Este mapa es la PUERTA, no el contenido.
