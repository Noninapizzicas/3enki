---
name: tarifas
description: >-
  Asignación carta+canal + registro de variantes pizzepos. Cada canal de venta
  (mesa, llevar, glovo, etc.) tiene su carta asignada con precios finales.
  Sin cálculos en runtime. Publica tarifas.config.actualizada con snapshot
  completo para que otros módulos hidraten su caché sin acoplamiento directo.
fuente: enki
dominio: comercio
tags: [pizzepos, tarifas, carta, canal, precio, variante, config]
---

# Pizzepos · tarifas

> **Qué es.** El registro de qué carta usa cada canal de venta. Cada canal
> (mesa, llevar, Glovo, WhatsApp, etc.) puede tener su propia carta con
> precios finales, o usar la carta general. También gestiona variantes de
> carta (derivadas de una base con reglas de modificación).
>
> **Publica snapshots** (`tarifas.config.actualizada`) para que otros módulos
> (comandero, productos) mantengan caché local sin acoplamiento directo.
>
> Código: `modules/pizzepos/tarifas/index.js` · v`3.2.0`

---

## 1 · LÓGICA

### Canales disponibles

| Canal | Descripción | Carta |
|-------|-------------|-------|
| `mesa` | Servicio en mesa | General o asignada |
| `llevar` | Para llevar | General o asignada |
| `telefono` | Pedido telefónico | General o asignada |
| `whatsapp` | WhatsApp Business | General o asignada |
| `glovo` | Delivery Glovo | General o asignada |
| `llevadoo` | Delivery Llevadoo | General o asignada |
| `digital` | Carta pública online | General o asignada |

### Variantes de carta

Una variante es una carta derivada de una base con reglas de modificación
(ej: "carta Glovo con +10% en todos los precios"). El módulo registra la
variante con sus reglas en lenguaje natural para que `tarifas-sync` pueda
reproducir los cambios cuando la base cambie.

### Publicación de cambios

Cada cambio publica `tarifas.config.actualizada` con:

```jsonc
{
  "project_id": "uuid",
  "correlation_id": "uuid",
  "timestamp": "2026-07-28T...",
  "tipo": "assign",                   // general | assign | variant_registered | snapshot
  "config": {
    "general": "carta_verano",         // carta por defecto
    "canales": { "glovo": "carta_glovo", "llevar": null },
    "variantes": [{ "id": "carta_glovo", "base": "carta_verano", "reglas": "...", "canales": ["glovo"] }]
  }
}
```

---

## 2 · TOOLS (invocables por LLM)

### `tarifas.set_general`

```jsonc
{ "carta_id": "carta_verano", "project_id": "uuid" }
// → 200 { "carta_id": "carta_verano", "tipo": "general" }
```

Establece la carta que usan los canales sin carta propia.

### `tarifas.assign`

```jsonc
{ "canal": "glovo", "carta_id": "carta_glovo", "project_id": "uuid" }
// → 200 { "canal": "glovo", "carta_id": "carta_glovo" }
```

```jsonc
// Quitar asignación → vuelve a la general
{ "canal": "glovo", "carta_id": null }
// → 200 { "canal": "glovo", "carta_id": null, "usa_general": true }
```

### `tarifas.get`

```jsonc
{ "project_id": "uuid" }
// → 200 { "config": { "general": "carta_verano", "canales": {...}, "variantes": [...] } }
```

### `tarifas.register_variant`

```jsonc
{
  "carta_id": "carta_glovo_plus",
  "base_carta_id": "carta_verano",
  "nombre": "Glovo +10%",
  "canales": ["glovo"],
  "reglas": { "tipo": "recargo", "porcentaje": 10, "descripcion": "recargo del 10% por delivery" }
}
// → 201 { "variant_id": "carta_glovo_plus", "base": "carta_verano", "canales": ["glovo"] }
```

### `tarifas.get_variants`

```jsonc
{ "project_id": "uuid" }
// → 200 { "variants": [{ "id": "carta_glovo_plus", "base": "carta_verano", ... }] }
```

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `tarifas.config.actualizada` | Config cambiada o snapshot. Payload con project_id, correlation_id (obligatorio), tipo, config completa |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `project.activated` | `onProjectActivated` | Cachea base_path + carga config del proyecto |
| `project.deactivated` | `onProjectDeactivated` | No-op (preserva en memoria) |
| `tarifas.config.solicitada` | `onConfigSolicitada` | Re-publica snapshot para que otros módulos hidraten caché |

---

## 4 · FLUJO TÍPICO

### Asignar carta a un canal

```
1. "La carta de Glovo es la de verano con recargo" → LLM interpreta
2. tarifas.register_variant { carta_id, base, reglas, canales: ["glovo"] }
3. tarifas.assign { canal: "glovo", carta_id: "carta_glovo" }
4. → tarifas.config.actualizada
5. → comandero recibe → hidrata caché local canal→carta_id
6. → al añadir item por Glovo, comandero usa precios de carta_glovo
```

### Hidratación de cachés (sin acoplamiento)

```
1. MÓDULO X necesita saber qué carta usa el canal
2. X publica → tarifas.config.solicitada { project_id }
3. TARIFAS responde → tarifas.config.actualizada { tipo: "snapshot", config: {...} }
4. X cachea localmente → sin acceso directo a tarifas
```

---

## 5 · INTEGRACIÓN

> **Tools principales:** `tarifas.set_general` (carta base), `tarifas.assign`
> (carta por canal), `tarifas.register_variant` (variante derivada),
> `tarifas.get` (ver config actual).

> **Sin cálculos en runtime:** tarifas solo asigna cartas a canales.
> Los precios los resuelve comandero usando la carta asignada.

> **correlation_id obligatorio** en todos los publishes (contrato subsistema-carta).

> **Persistencia:** json-file-per-project atómico (tmp+rename) en
> `storage/<project_id>/config/tarifas.json`. Sobrevive reinicios.
