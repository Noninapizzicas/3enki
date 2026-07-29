---
name: pos-cuentas
description: >-
  Skill del módulo CUENTAS (lista de cuentas activas del POS). Store,
  componentes y flujo: persistencia como fuente de verdad, creación de
  mesa/llevar/delivery/llevadoo, 16 eventos MQTT de coherencia en tiempo
  real, merge buffer+persistencia.
fuente: interfaces
tags: [pos, cuentas, mesas, persistencia, svelte, store, cupula-interfaces]
---

# POS · Cuentas

## Store

### Tipos

```typescript
type TipoCuenta = 'local' | 'delivery' | 'llevar' | 'glovo' | 'llevadoo';
```

### Estados (progresión)

```
pendiente → con_pedido → en_preparacion → listo
→ entregado → para_cobrar → cobrado
```

### Acciones MQTT

| Acción | RPC |
|--------|-----|
| `loadCuentasFromPersistencia` | `persistencia.cuentas_activas` |
| `createMesa` | `mesa.abrir` |
| `createLlevar` | `llevar.crear` |
| `createLlevadoo` | `llevadoo.crear_pedido` |
| `renameMesa` | `mesa.renombrar` |
| `marcarEntregado` | `cuenta.marcar_entregado` / `llevar.entregar` |

### Eventos (16)

| Evento | Reacción |
|--------|----------|
| `cuenta.creada` / `cuenta.actualizada` / `cuenta.eliminada` | Store update |
| `cuenta.estado_cambiado` / `cuenta.cerrada` | Estado / recarga |
| `mesa.abierta` / `mesa.renombrada` | Recarga / rename |
| `pedido.creado` / `cobro.procesado` | Recarga (cobro: delay 2s) |
| `comandero.item_agregado/eliminado/actualizado` | Card en vivo |
| `cocina.item_preparando/preparado` | Estado cocina en card |
| `cocina.pedido_listo` / `llevadoo.pedido_listo` | Alerta + listo |

## Layout

```
┌──────────────────────────────┬──────┐
│ Header (proyecto, reloj)     │ Side │
├──────────────────────────────┤ bar  │
│ Grid de CuentaCards          │ 🍕   │
│ ┌──────┐ ┌──────┐ ┌──────┐  │ 🛵   │
│ │Mesa 1│ │Mesa 2│ │Llevar│  │ 🥡   │
│ │🍕×2  │ │🍕×3  │ │🥡×1  │  │      │
│ │25€   │ │38€   │ │12€   │  │      │
│ │🟢prep │ │🟡list│ │⚪pend│  │      │
│ └──────┘ └──────┘ └──────┘  │      │
└──────────────────────────────┴──────┘
```

### Merge buffer + persistencia

```typescript
// 1. Fuente de verdad: persistencia
const res = await mqttRequest('persistencia', 'cuentas_activas', { project_id });
// 2. Items no enviados: buffer del comandero
const buf = await mqttRequest('comandero', 'buffers', {});
// 3. Combinar
const allItems = [...persistenciaItems, ...bufferItems];
```

### Alerta por inactividad

```typescript
function checkAlerta(cuenta): boolean {
  const mins = (Date.now() - new Date(cuenta.updated_at).getTime()) / 60000;
  return mins > 30;
}
```
