---
name: pago-gateway
description: >-
  El LÍDER DE PAGO: puerto provider-agnóstico pago.iniciar (request→response)
  que enruta a la pasarela configurada (semilla: Stripe Checkout). Al confirmarse
  el pago por webhook firmado, emite pago.confirmado. Degradable: sin pasarela
  → NO_PASARELA. Swappable a Redsys/PayPal cambiando pasarela.kind + adapter.
fuente: enki
dominio: comercio
tags: [pizzepos, pago, gateway, stripe, pasarela, webhook, provider-agnostic]
---

# Pizzepos · pago-gateway

> **Qué es.** El puerto de pago online provider-agnóstico. Inicia una sesión
> de pago en la pasarela configurada (Stripe Checkout), devuelve la URL al
> frontend, y cuando la pasarela confirma el pago vía webhook firmado, emite
> `pago.confirmado`. El dinero vive en la pasarela; aquí solo se inicia y
> se verifica.
>
> **Swappable:** cambiar de Stripe a Redsys o PayPal = cambiar `pasarela.kind`
> + adapter. **Degradable:** sin pasarela → `NO_PASARELA` (el pedido sigue
> flujo pickup sin pago online).
>
> Código: `modules/pizzepos/pago-gateway/index.js` · v`1.0.0`

---

## 1 · LÓGICA

### Ciclo de un pago online

```
CLIENTE                  PAGO-GATEWAY                 PASARELA (Stripe)
───────                  ────────────                 ────────────────
  │                            │                            │
  │ "pagar con tarjeta"        │                            │
  │──→ pago.iniciar.request ──→→                             │
  │     { pedido_id, monto }   │                            │
  │                            ├─ crea sesión Stripe ──────→│
  │                            │←─ { checkout_url } ────────│
  │←── { url: checkout_url } ──                             │
  │                            │                            │
  │──→ abre checkout_url ──────┼───────────────────────────→│
  │                            │                            │
  │                            │     WEBHOOK                │
  │                            │←── POST /pago/webhook ─────│
  │                            ├─ verifica firma HMAC       │
  │                            ├─ emite pago.confirmado     │
  │                            │    → pedidos.onPagoConfirmado
  │                            │    → marca pedido pagado   │
```

### Provider-agnóstico

```jsonc
// config esperada
{
  "pasarela": {
    "kind": "stripe-checkout",     // | redsys | paypal
    "provider": "STRIPE",
    "moneda": "eur",
    "webhook_secret": null,
    "return_url": "https://...",
    "api_key": "sk_..."            // resuelto por credential-manager
  }
}
```

---

## 2 · APIs

| Método | Path | Handler | Descripción |
|--------|------|---------|-------------|
| `POST` | `/pago/webhook/:project` | `handleWebhook` | Webhook firmado de la pasarela. Verifica firma → emite `pago.confirmado` |

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `pago.iniciar.response` | Sesión de pago creada (devuelve checkout_url) |
| `pago.confirmado` | Pago verificado por webhook → pedidos marca pagado |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `pago.iniciar.request` | — | Inicia pago en la pasarela configurada |

---

## 4 · INTEGRACIÓN

> **Tool:** `pago.iniciar` (UI handler). Inicia pago → devuelve `checkout_url`.
> El frontend redirige al cliente a la pasarela.

> **Webhook:** `POST /pago/webhook/:project` con raw body + firma HMAC.
> Verifica antes de emitir `pago.confirmado`.

> **Sin pasarela:** si el proyecto no tiene pasarela configurada, el pedido
> sigue el flujo de recogida (pickup) sin pago online. No excluye.

> **Credenciales:** la API key de la pasarela se resuelve vía
> `credential-manager`. No va en config.
