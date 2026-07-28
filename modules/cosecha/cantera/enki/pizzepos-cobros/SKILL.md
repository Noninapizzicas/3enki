---
name: cobros
description: >-
  Gestión unificada de cobros pizzepos — 7 métodos de pago: efectivo, tarjeta,
  bizum, transferencia, mixto, link_pago, qr. Idempotente por cuenta (rechaza
  si ya hay cobro pendiente/procesando/completado). Abre cajón de dinero vía
  periferico.abrir-cajon en pagos en efectivo (best-effort).
fuente: enki
dominio: comercio
tags: [pizzepos, cobros, pago, efectivo, tarjeta, bizum, idempotente, cajon]
---

# Pizzepos · cobros

> **Qué es.** El módulo de cobro unificado del POS. 7 métodos de pago, control
> de idempotencia (una cuenta no puede tener dos cobros activos), apertura de
> cajón en efectivo, reembolsos, y pagos mixtos con desglose.
>
> **Reflejo puro:** toda la lógica es determinista. Sin blueprint. Sin LLM.
> 9 tools, 9 ui_handlers.
>
> **Cuentas Llevadoo** se pagan externamente — se rechazan con `INVALID_INPUT`.
>
> Código: `modules/pizzepos/cobros/index.js` · v`3.0.0`

---

## 1 · LÓGICA

### Los 7 métodos de pago

| Método | Enum | Cajón | Notas |
|--------|------|-------|-------|
| Efectivo | `efectivo` | ✅ Abre | Calcula cambio (monto_recibido - monto) |
| Tarjeta | `tarjeta` | ❌ | Pago con TPV |
| Bizum | `bizum` | ❌ | Pago móvil |
| Transferencia | `transferencia` | ❌ | Domiciliación |
| Mixto | `mixto` | ✅ Si incluye efectivo | Desglose por método |
| Link de pago | `link_pago` | ❌ | Genera enlace (expiracion: 24h) |
| QR | `qr` | ❌ | Genera código QR (expiracion: 30min) |

### Estados de un cobro

```
creado → pendiente → procesando → completado
                              ↘ reembolsado
```

### Idempotencia

Una cuenta NO puede tener dos cobros activos. Si ya existe un cobro
`pendiente`, `procesando` o `completado` para la misma `cuenta_id`,
se rechaza con `409 CONFLICT_STATE`.

### Cajón de dinero

En pagos en efectivo (o mixto con efectivo), al confirmar el cobro se
publica `periferico.abrir-cajon` (best-effort: si no hay cajón, el cobro
no falla).

### Pagos externos (Llevadoo)

Las cuentas con prefijo `llevadoo_*` se pagan en la plataforma externa.
`cobro.create` las rechaza con `INVALID_INPUT`.

---

## 2 · TOOLS (invocables por LLM)

### `cobro.create`

```jsonc
{
  "cuenta_id": "mesa_5_xxx",
  "pedido_ids": ["ped_001"],
  "monto": 34.00,
  "metodo_pago": "efectivo",
  "propina": 2.00,            // opcional
  "monto_recibido": 40.00,    // opcional (para calcular cambio)
  "desglose": null             // opcional (para mixto)
}
// → 201
{
  "id": "cobro_abc123",
  "cuenta_id": "mesa_5_xxx",
  "monto": 34.00,
  "metodo_pago": "efectivo",
  "propina": 2.00,
  "cambio": 6.00,
  "estado": "pendiente",
  "created_at": "2026-07-28T..."
}
```

**Mixto:**
```jsonc
{
  "cuenta_id": "mesa_5_xxx",
  "monto": 50.00,
  "metodo_pago": "mixto",
  "desglose": {
    "efectivo": 20.00,
    "tarjeta": 30.00
  }
}
```

Errores: `400 INVALID_INPUT` (cuenta llevadoo), `409 CONFLICT_STATE` (ya hay cobro activo).

### `cobro.confirm`

```jsonc
{
  "id": "cobro_abc123",
  "referencia_pago": "TPV-REF-001"    // opcional
}
// → 200 { "id": "cobro_abc123", "estado": "completado", "metodo_pago": "efectivo" }
```

Emite `cobro.procesado`. Si es efectivo, emite `periferico.abrir-cajon`.

### `cobro.refund`

```jsonc
{
  "id": "cobro_abc123",
  "motivo": "cliente insatisfecho"    // opcional
}
// → 200 { "id": "cobro_abc123", "estado": "reembolsado" }
```

Emite `cobro.reembolsado`.

### `cobro.list`

```jsonc
{ "cuenta_id": "mesa_5_xxx", "estado": "completado", "metodo_pago": "efectivo" }
// → 200 { "cobros": [ /* array de cobros */ ] }
```

### `cobro.get`

```jsonc
{ "id": "cobro_abc123" }
// → 200 { "cobro": { /* objeto completo */ } }
```

### `cobro.payment-methods`

```jsonc
// → 200 { "metodos": [
//   { "id": "efectivo", "nombre": "Efectivo", "requiere_cajon": true },
//   { "id": "tarjeta", "nombre": "Tarjeta", "requiere_cajon": false },
//   ...
] }
```

### `cobro.list-cajones`

```jsonc
// → 200 { "cajones": [ { "id": "caja_01", "nombre": "Cajón Principal", "conectado": true } ] }
```

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `cobro.iniciado` | Cobro creado para una cuenta |
| `cobro.procesado` | Cobro confirmado exitosamente (cuentas escucha → marca cobrado) |
| `cobro.reembolsado` | Cobro reembolsado al cliente |
| `periferico.abrir-cajon` | Pago en efectivo confirmado (best-effort) |

### Escucha

| Evento | Handler | Procedencia |
|--------|---------|-------------|
| `cuenta.creada` | `onCuentaCreada` | Cachea ref_display para tickets |
| `cuenta.actualizada` | `onCuentaActualizada` | Actualiza ref_display |
| `pedido.completado` | `onPedidoCompletado` | Permite cobro |
| `caja.cerrada` | `onCajaCerrada` | Limpia cobros del día |
| `dia.iniciado` | `onDiaIniciado` | Limpia cobros stale |

---

## 4 · FLUJO TÍPICO (cobro de mesa)

```
1. CUENTA lista                → cuentas → estado: listo (todos los pedidos OK)
2. CAMARERO inicia cobro       → cobro.create { cuenta_id, monto, metodo_pago }
                                  → cobro.iniciado → cuentas → para_cobrar
3. CAMARERO cobra              → cobro.confirm { id }
                                  → cobro.procesado → cuentas → cobrado
                                  → si efectivo → periferico.abrir-cajon
4. (opcional) REEMBOLSO        → cobro.refund { id, motivo }
                                  → cobro.reembolsado
```

---

## 5 · INTEGRACIÓN

> **Tool principal:** `cobro.create` + `cobro.confirm` es el flujo de cobro
> completo. `cobro.list` para consultar histórico.

> **Idempotencia:** si ya hay un cobro activo para la cuenta, `cobro.create`
> devuelve `409`. Hay que esperar a que se complete o se reembolse.

> **Sin persistencia:** cobros en memoria (Map). Se pierden en reinicio.
> La fuente de verdad para el histórico es externa (TPV, pasarela de pago).

> **Dependencia:** `perifericos` para abrir el cajón de dinero.
