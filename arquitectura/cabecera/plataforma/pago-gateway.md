---
id: plataforma/pago-gateway
dominio: plataforma
resumen: Órgano de cobro provider-agnóstico (sumup-checkout / stripe-checkout) con cinco puertas — link, QR, datáfono, cliente con tarjeta guardada y recurrente — cuenta y credencial POR PROYECTO, libro durable, barrido, integridad y conciliación.
fuentes:
  - modules/pago-gateway/**
  - tests/unit/pago-gateway-*.test.js
  - tests/unit/pizzepos__pago-gateway-*.test.js
verificado: 2026-10-25
---

# PAGO-GATEWAY — el órgano de cobro de la plataforma

> El dinero vive en la pasarela. Aquí se inicia, se verifica, se concilia y se cuadra — nunca se
> "cree" que un cobro ocurrió. Un solo motor, una config por negocio: ningún proyecto escribe
> código de cobro.

## Contrato (JSON)

```json
{
  "esquema": "pago-gateway-v3",
  "tesis": "cinco puertas, un órgano: el hecho cobrado se identifica por `referencia`, no por 'pedido'",
  "pasarelas": { "kind": ["sumup-checkout", "sumup", "stripe-checkout"], "provider": "nombre en credential-manager (SUMUP/STRIPE)" },
  "puertas": {
    "link":      "pago.iniciar.request → checkout_url alojado (SumUp Hosted / Stripe Session)",
    "qr":        "pago.qr.request → PNG/SVG de la MISMA url (dinámico: lleva importe y caduca con el hecho)",
    "terminal":  "pago.reader.* → Reader/Terminal API: parear, estado, cobrar, consultar, terminar, go-checkout",
    "cliente":   "pago.cliente.* → Customers API: alta idempotente, tarjetas guardadas, baja",
    "recurrente":"pago.cobrar_guardada.request → ProcessCheckout con {token, customer_id} (servidor-a-servidor)"
  },
  "referencia": {
    "contrato": "referencia",
    "alias_admitidos": ["pedido_id", "referencia_externa", "order_id"],
    "emision": "los eventos publican `referencia` Y `pedido_id` con el mismo valor (compatibilidad de consumidores)"
  },
  "config": {
    "por_proyecto": "/pago/config.json (esquema pago-pasarela-v1)",
    "core": "bloque pasarela de module.json = DEFAULTS; el proyecto pisa (merge de barrido/conciliacion)",
    "credencial": "credential.resolve.request CON project_id → SUMUP_API_KEY_PROJECT_<project_id> antes que GLOBAL",
    "estricto": "pasarela.exigir_config_proyecto=true → sin config propia NO_PASARELA (nadie cobra en la cuenta de otro)"
  },
  "storage_por_proyecto": {
    "libro": "/pago/checkouts.json",
    "clientes": "/pago/clientes.json",
    "conciliacion": "/pago/conciliacion.json",
    "legacy": "/pizzepos/pago/*.json se lee UNA vez; la primera escritura migra"
  },
  "http": {
    "webhook": "POST /pago/webhook/:project — el :project decide con qué cuenta se verifica",
    "widget":  "GET /pago/widget/:project/:checkout_id — página del Payment Widget (consentimiento de tarjeta)"
  }
}
```

## Las cinco puertas, con lo que exige cada una

**1 · Link (Hosted Checkout).** `POST /v0.1/checkouts` con `checkout_reference` (= referencia),
`amount` DECIMAL (no céntimos), `currency`, `merchant_code`, `hosted_checkout.enabled`,
`return_url` (webhook) y `valid_until` propio. Un `409 DUPLICATED_CHECKOUT` **no** crea un segundo
link: se busca el vivo y se **reutiliza** — dos links vivos son dos cobros posibles. Sin
`return_url` el adapter falla en voz alta: se cobraría y nadie liberaría el hecho.

**2 · QR.** No es un método de pago, es la URL dentro de un dibujo: misma comisión, misma
integración. `qr.js` es un codificador **nativo** (modo byte, ECC L/M/Q/H, v1–20, máscara por
penalización) que emite **PNG** (WhatsApp/impresión) y **SVG**; se verificó decodificando con un
lector independiente (OpenCV) las URLs reales de checkout. Con `importe` crea o reusa el checkout
del hecho (dinámico); con `url` pinta lo que le den sin gastar ni una llamada (carta, propinas). Un
QR **estático** impreso obliga al cliente a teclear el importe: sirve para la carta, no para cobrar.

**3 · Datáfono (Reader/Terminal API).** `GET/POST /v0.1/merchants/{mc}/readers`,
`…/{id}/status`, `…/{id}/checkout`, `…/{id}/checkout/{coid}`, `…/{id}/terminate` (202, asíncrono y
SIN confirmación) y la variante `POST /v0/merchants/{mc}/readers/{id}/go-checkout`.
Rarezas que manda la spec y se respetan: el importe va en **unidades menores**
(`{currency, minor_unit, value}`; CLP/COP/HUF → 0), el device debe estar **ONLINE**, y tras aceptar
el sistema tiene **60 s** para arrancar (otro checkout en el mismo lector se rechaza). La
referencia viaja en `affiliate.foreign_transaction_id` para poder reencontrar la transacción. La
verdad es el checkout del lector (`pending|successful|failed|cancelled` → `pendiente|confirmado|
rechazado|cancelado`), no el payload del aviso.

**4 · Cliente de siempre (Customers API).** `POST /v0.1/customers` con **nuestro** `customer_id`
(idempotente: un 409 se resuelve leyendo el existente), `GET|PUT /v0.1/customers/{id}`,
`GET …/payment-instruments` y `DELETE …/payment-instruments/{token}` (204). Cada tarjeta trae su
**mandato** (`type: recurrent`, `status: active`): sin mandato activo no se cobra sin el cliente.
El registro del proyecto guarda solo lo mínimo para reconocerla (token, últimos 4, marca, mandato).

**5 · Recurrente de verdad.** La tokenización **no** es un cobro: checkout con `purpose:
SETUP_RECURRING_PAYMENT` + `customer_id`, cuya autorización SumUp devuelve al instante. El
consentimiento se recoge en el **Payment Widget**, y la página la sirve **este módulo**
(`GET /pago/widget/:project/:checkout_id`) — ningún proyecto escribe frontend; los datos de la
tarjeta van del navegador a SumUp y no pasan por Enki. El desenlace de ese checkout es
`pago.tokenizado`, **nunca** `pago.confirmado`. El cobro posterior es servidor-a-servidor:
`POST /v0.1/checkouts` y después `PUT /v0.1/checkouts/{id}` con
`{payment_type:'card', token, customer_id}` (ProcessCheckout de la spec). Si el banco pide SCA se
devuelve `requiere_accion` y **no se reintenta**: reintentar ahí sería el segundo cargo.

## Las nueve garantías (valen para CUALQUIER adapter)

```json
{
  "1_idempotencia": "la referencia es la llave: 409/duplicado NO abre otro cobro (link, lector, guardada)",
  "2_caducidad": "valid_until propio atado a la vida del hecho (la página de SumUp vive 30 min)",
  "3_libro_durable": "/pago/checkouts.json del proyecto, no solo memoria",
  "4_barrido": "cada 2 min: webhook perdido ≠ pago perdido (y también reconcilia los cobros de datáfono con el lector)",
  "5_webhook_no_es_prueba": "SumUp no firma: token secreto en la URL + RECONSULTA del recurso; 5xx si no se pudo verificar (reintenta 1m/5m/20m/2h)",
  "6_integridad": "un PAID que no cuadra no se confirma (pago.importe_discrepante); el exceso solo lo explica la propina",
  "7_reembolso": "sin reintento a ciegas (no hay idempotency-key) pero sin abandonar: se reconsulta la transacción y sus eventos REFUND",
  "8_preflight": "pago.estado dice si la cuenta puede cobrar HOY (método card activo, moneda, país, webhook)",
  "9_aislamiento": "merchant, clave, token de webhook, libro, registro y conciliación son DEL PROYECTO"
}
```

## Puertos (bus)

```
pago.iniciar · pago.cancelar · pago.reembolsar · pago.estado · pago.recibo · pago.conciliar · pago.config
pago.qr
pago.reader.listar · .parear · .leer · .renombrar · .borrar · .estado · .cobrar · .consultar · .terminar · .cobrar_go
pago.cliente.alta · .leer · .actualizar · .tarjetas · .tarjeta.baja
pago.tokenizar · pago.cobrar_guardada
```

Publica: `pago.confirmado` · `pago.rechazado` · `pago.cancelado` · `pago.reembolsado` ·
`pago.importe_discrepante` · `pago.en_terminal` · `pago.tokenizado` · `pago.recibo.obtenido` ·
`pago.contracargo` · `cobro.huerfano` · `cobro.liquidado`. Todos los de dinero llevan `canal`
(`online` · `terminal` · `guardada`) y `referencia` + `pedido_id`.

## Estado y frenos (honesto)

- **Verificado**: 100 checks en `npm test` con `fetch` falso — protocolo, idempotencia, integridad,
  aislamiento multiproyecto, terminal, clientes, recurrencia y QR. El QR se decodificó con lector
  independiente (OpenCV).
- **Sin verificar**: no se ha tocado la API real de SumUp (faltan merchant code y credencial del
  proyecto). Los primeros actos al tenerlas: pago de 1 € en sandbox, camino de fallo con importe
  `…11`, y lectura de `pago.estado`.
- **Costuras conocidas**: el libro es un JSON por proyecto con read-modify-write sin candado entre
  procesos (la conciliación lo detectaría como `cobro.huerfano`, no se pierde dinero); el reintento
  es único y no respeta `Retry-After`; no hay multi-merchant por OAuth (una cuenta por proyecto ni
  soporte de plataforma multi-comercio); la caché caliente del webhook no se poda; Apple Pay nativo
  (`/v0.2/checkouts/{id}/apple-pay-session`) no se usa (los wallets van por el checkout alojado).
