---
name: cuentas
description: >-
  Gestión de cuentas con ciclo de vida completo (POS ticket lifecycle) — 100%
  Event-Driven. Máquina de estados de 7 estados orquestando items + cocina +
  cobro. Sin tools directas (el LLM no invoca cuentas, reacciona a eventos del
  bus desde comandero, cocina y cobro).
fuente: enki
dominio: comercio
tags: [pizzepos, cuentas, pos, ticket, maquina-estados, event-driven]
---

# Pizzepos · cuentas

> **Qué es.** El orquestador del ciclo de vida de una cuenta/mesa/ticket en el
> POS. 100% event-driven: no expone tools, no se invoca directamente — **escucha**
> eventos de comandero (items), cocina (pedido listo) y cobro (iniciado/procesado),
> y **emite** transiciones de estado. Cada cuenta es una máquina de 7 estados
> que refleja en tiempo real dónde está cada comanda.
>
> **Reflejo puro:** cero LLM, cero blueprint. Toda la lógica es determinista.
>
> Código: `modules/pizzepos/cuentas/index.js` · v`3.0.0`
> Pantalla principal del POS: `📋 Cuentas Activas` (acceso camarero)

---

## 1 · LÓGICA (la máquina de estados)

### Los 7 estados

```
pendiente ──→ con_pedido ──→ en_preparacion ──→ listo ──→ entregado
                 │                                  │         │
                 │        (re-entrada)               │         │
                 └──────── en_preparacion ←──────────┘         │
                                                                ▼
                                                          para_cobrar ──→ cobrado
```

| Estado | Significado | Transiciona a |
|--------|-------------|---------------|
| **pendiente** | Cuenta creada, sin items | `con_pedido` |
| **con_pedido** | Tiene items, no enviados a cocina | `en_preparacion`, `pendiente` (si items=0) |
| **en_preparacion** | Items enviados a cocina | `listo`, `con_pedido` (re-entrada) |
| **listo** | Todos los pedidos de la cuenta terminaron | `entregado`, `para_cobrar` |
| **entregado** | Comida entregada a la mesa | `para_cobrar` |
| **para_cobrar** | Cobro iniciado | `cobrado` |
| **cobrado** | Cobro procesado — terminal | — |

### Qué hace cada transición

| Evento de entrada | Handler | Transición |
|-------------------|---------|------------|
| `comandero.item_agregado` | `onComanderoItemAgregado` | `pendiente → con_pedido` (si era el primer item), actualiza totales |
| `comandero.item_eliminado` | `onComanderoItemEliminado` | `con_pedido → pendiente` (si items=0), ajusta totales |
| `comandero.item_actualizado` | `onComanderoItemActualizado` | Ajusta items/total con diff (sin cambiar estado) |
| `comandero.enviar_cocina` | `onComanderoEnviarCocina` | `→ en_preparacion`, registra pedido en tracking |
| `cocina.pedido_listo` | `onCocinaPedidoListo` | `→ listo` cuando TODOS los pedidos de la cuenta terminaron |
| `cobro.iniciado` | `onCobroIniciado` | `→ para_cobrar` (excepto pago_externo) |
| `cobro.procesado` | `onCobroProcesado` | `→ cobrado`, marca pagado (idempotente) |
| `cuenta.cerrada` (externo) | `onCuentaExternaCerrada` | Elimina del Map, cancela timers |

### Re-entrada a cocina

Si la cuenta está `en_preparacion` o `listo` y llega un nuevo item, el estado
vuelve a `en_preparacion` (el item nuevo se envía a cocina). La cuenta no
puede cerrarse hasta que todos los pedidos estén listos.

---

## 2 · EVENTOS (el contrato del bus)

### Emite (fire-and-forget)

| Evento | Payload | Cuándo |
|--------|---------|--------|
| `cuenta.creada` | `{ cuenta_id, turno, ref_display, tipo, items, total_centimos, estado, project_id, correlation_id, timestamp }` | Alta de nueva cuenta |
| `cuenta.actualizada` | `{ cuenta_id, cambios: { diff de items/total/estado/alerta/pagado/nombre/ref_display } }` | Cualquier cambio |
| `cuenta.estado_cambiado` | `{ cuenta_id, estado_anterior, estado_nuevo }` | Transición de estado |
| `cuenta.eliminada` | `{ cuenta_id, motivo: eliminacion_manual \| cobro_completado \| cuenta_cerrada_canal }` | Baja de cuenta |
| `comandero.enviar_cocina` | Payload del pedido | Integración delivery (Glovo, Llevadoo) |

### Escucha

| Evento | Handler | Procedencia |
|--------|---------|-------------|
| `comandero.item_agregado` | `onComanderoItemAgregado` | Módulo comandero |
| `comandero.item_eliminado` | `onComanderoItemEliminado` | Módulo comandero |
| `comandero.item_actualizado` | `onComanderoItemActualizado` | Módulo comandero |
| `comandero.enviar_cocina` | `onComanderoEnviarCocina` | Módulo comandero |
| `cocina.pedido_listo` | `onCocinaPedidoListo` | Módulo cocina |
| `cobro.iniciado` | `onCobroIniciado` | Módulo cobro |
| `cobro.procesado` | `onCobroProcesado` | Módulo cobro |
| `cuenta.cerrada` | `onCuentaExternaCerrada` | Cuentas-canales (delivery externo) |

---

## 3 · FUNCIONES (payload exacto)

### Crear cuenta (UI handler)

```jsonc
// handleCreateCuenta — desde la UI de camarero
{ "tipo": "local", "nombre": "Mesa 4" }
// → emite cuenta.creada
{
  "cuenta_id": "T-042",
  "turno": 42,
  "ref_display": "Mesa 4",
  "tipo": "local",
  "items": [],
  "total_centimos": 0,
  "estado": "pendiente",
  "project_id": "uuid",
  "timestamp": "2026-07-28T..."
}
```

Tipos de cuenta: `local` (mesa), `delivery` (domicilio), `llevar` (para llevar).

### Ciclo completo de una cuenta

```
1. CREAR           camarero pulsa "Mesa 4"          → cuenta.creada { estado: pendiente }
2. AÑADIR ITEM     comandero.item_agregado            → cuenta.actualizada + estado: con_pedido
3. ENVIAR COCINA   comandero.enviar_cocina            → estado: en_preparacion
4. COCINA LISTO    cocina.pedido_listo (todos OK)     → estado: listo
5. ENTREGAR        marcar_entregado (UI)              → estado: entregado
6. COBRAR          cobro.iniciado                     → estado: para_cobrar
7. COBRADO         cobro.procesado                    → estado: cobrado + cuenta.eliminada
```

---

## 4 · UI (frontend)

### Pantalla principal: Cuentas Activas 📋

| Componente | Descripción |
|------------|-------------|
| `cuenta-grid` | Grid de cuentas activas (mesas, delivery, llevar) |
| `cuenta-card` | Card individual con items, total, estado, alertas |
| `cuenta-type-button` | Selector de tipo (local/delivery/llevar) |

**Tópicos MQTT para auto-refresh:**
```
cuenta.creada · cuenta.actualizada · cuenta.eliminada · cuenta.estado_cambiado
```

### UI Handlers

| Ruta | Handler | Zona |
|------|---------|------|
| `cuenta.create` | `handleCreateCuenta` | barra_modulos |
| `cuenta.list` | `handleListCuentas` | barra_modulos |
| `cuenta.get` | `handleGetCuenta` | barra_modulos |
| `cuenta.delete` | `handleDeleteCuenta` | barra_modulos |
| `cuenta.marcar_entregado` | `handleMarcarEntregado` | barra_modulos |
| `cuenta.rename` | `handleRenameCuenta` | barra_modulos |
| `cuenta.stats` | `handleGetStats` | barra_modulos |
| `cuenta.health` | `handleHealthCheck` | barra_modulos |
| `cuenta.metrics` | `handleGetMetrics` | barra_modulos |

---

## 5 · OBSERVABILIDAD

### Métricas

| Tipo | Nombre | Descripción |
|------|--------|-------------|
| Counter | `cuenta.creada.total` | Total cuentas creadas |
| Counter | `cuenta.eliminada.total` | Total cuentas eliminadas |
| Counter | `cuenta.transicion.total` | Total transiciones de estado |
| Counter | `cuenta.errors.total` | Total errores |
| Gauge | `cuenta.activas.count` | Cuentas activas ahora |
| Gauge | `cuenta.por_tipo.local/delivery/llevar` | Desglose por tipo |
| Gauge | `cuenta.por_estado.*` | Desglose por estado (7 estados) |
| Gauge | `cuenta.alertas.count` | Alertas activas |
| Timing | `cuenta.create.duration` | Duración creación |
| Timing | `cuenta.list.duration` | Duración listado |

---

## 6 · INTEGRACIÓN

> **Este módulo NO tiene tools.** No se invoca desde el LLM directamente.
> Reacciona a eventos del bus y emite transiciones. Es el orquestador pasivo
> del flujo POS.

> **Persistencia:** contador global de turnos en `data/current/contador_global.json`.
> Cuentas activas restauradas desde `cuentas_activas.json` (escrito por
> persistencia-comandero). Single-writer per archivo.

> **Flujo canónico:** `comandero (items) → cuentas (tracking) → cocina (preparación)
> → cuentas (estado listo) → cobro (pago) → cuentas (cierre)`.

> **Pantalla principal del POS.** El camarero ve el grid de cuentas activas
> en tiempo real vía MQTT. Cada transición de estado se refleja sin recargar.
