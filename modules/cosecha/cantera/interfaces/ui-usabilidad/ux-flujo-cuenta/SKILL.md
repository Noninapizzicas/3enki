---
name: ux-flujo-cuenta
description: >-
  Patrón de USABILIDAD para el flujo completo de una cuenta en el POS:
  apertura → toma de pedido → cocina → cobro → cierre. Cubre estados
  vacíos, loading, errores, coherencia multi-superficie y transiciones
  entre pantallas. Diseñado para que el camarero nunca se pierda.
fuente: interfaces
tags: [ux, usabilidad, flujo, pos, cuenta, pedido, cobro, cupula-interfaces]
---

# UX · Flujo de Cuenta

> El flujo de una cuenta es el **core UX del POS**. Cada transición debe
> ser obvia, irreversible cuando toca, y siempre visible desde cualquier
> pantalla.

## Mapa de flujo

```
CuentasScreen
  │
  ├── TipoButton: [🍕 Mesa] [🛵 Delivery] [🥡 Llevar]
  │     ↓
  │   mqttRequest('mesa.abrir') → cuenta_id
  │     ↓
  │   navigate(/comandero/{cuenta_id}?new=1)
  │
  ├── CuentaCard: [click en tarjeta existente]
  │     ↓
  │   navigate(/comandero/{cuenta_id})
  │
  └── CuentaCard: [click en "Cuenta"]
        ↓
      navigate(/comandero/{cuenta_id}?view=cuenta)
        ↓
      Abre CobroPanel directamente

ComanderoScreen
  │
  ├── Sidebar [🍳 Enviar a cocina]
  │     ↓
  │   enviarCocina() → mqttRequest('comandero.send-kitchen')
  │     ↓
  │   Cocina recibe pedido → cocina.item_preparando
  │
  ├── Sidebar [💶 Cobro]
  │     ↓
  │   CobroPanel → 7 métodos → cobrar
  │     ↓
  │   Cuenta cerrada → navigate(/comandero)
  │
  └── Sidebar [↩️ Salir]
        ↓
      navigate(/comandero)
```

## Estados vacíos (empty states)

Cada pantalla debe mostrar su estado vacío de forma informativa:

### CuentasScreen sin cuentas
```
┌──────────────────────────────┐
│           ＋                  │
│    Sin cuentas abiertas       │
│ Pulsa un tipo de cuenta      │
│ para empezar                 │
│ [🍕 Mesa] [🛵 Delivery] [🥡] │
└──────────────────────────────┘
```

### Comandero sin pedido
```
┌──────────────────────────────┐
│   🍕                         │
│  Pedido vacío                │
│ Toca un producto para        │
│ añadirlo a la cuenta         │
└──────────────────────────────┘
```

### Cocina sin pedidos
```
┌──────────────────────────────┐
│    🍳                        │
│  Cocina tranquila            │
│ Los pedidos aparecerán aquí  │
│ cuando los camareros los     │
│ envíen                       │
└──────────────────────────────┘
```

## Estados de carga

```svelte
{#if $loading && $items.length === 0}
  <div class="skeleton-grid">
    {#each [1,2,3] as _}
      <div class="skeleton-card">
        <div class="skeleton-line w-60" />
        <div class="skeleton-line w-40" />
        <div class="skeleton-line w-20" />
      </div>
    {/each}
  </div>
{:else if $items.length === 0}
  <EmptyState icon="+" text="Sin datos" action="Crear primero" />
{:else}
  <ItemsGrid items={$items} />
{/if}
```

## Estados de error

```svelte
{#if $error}
  <div class="error-banner">
    ❌ {$error}
    <button on:click={() => loadItems(projectId)}>Reintentar</button>
  </div>
{/if}
```

## Coherencia multi-superficie

El mismo camarero (o dos) puede tener:

| Pantalla A | Pantalla B | Qué pasa |
|------------|-----------|----------|
| Comandero: añade item | CuentasScreen | La tarjeta se actualiza SOLA (comandero.item_agregado) |
| Cocina: marca listo | CuentasScreen | El item pasa a 🟢 listo (cocina.item_preparado) |
| CobroPanel: cobra | CuentasScreen | La cuenta DESAPARECE (cuenta.cerrada) |
| Mesa: renombra | CuentasScreen | El nombre cambia SOLO (mesa.renombrada) |

## Transiciones animadas

```css
/* Al crear cuenta: la card aparece */
.cuenta-enter {
  animation: slideIn 0.3s ease-out;
}
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Al cerrar cuenta: la card se desvanece */
.cuenta-exit {
  animation: fadeOut 0.3s ease-in;
}
@keyframes fadeOut {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.95); }
}
```

## Reglas de usabilidad

1. **Nunca bloquees con loading** — renderiza inmediato con defaults, carga async
2. **Errores nombrados** — no "Error", sino "No se pudo cobrar: método no soportado"
3. **Acciones reversibles** — quitar item del pedido tiene confirmación visual
4. **Acciones irreversibles** — cobrar pide confirmación explícita
5. **Feedback inmediato** — toda acción MQTT muestra loading en el botón pulsado
6. **Coherencia forzada** — si otra pantalla cambia datos, esta se actualiza sola
