---
id: plataforma/pago-gateway
dominio: plataforma
resumen: Órgano de cobro provider-agnóstico (sumup-checkout / stripe-checkout, AMBOS con paridad desde v3.1) con cinco puertas — link, QR, datáfono, cliente con tarjeta guardada y recurrente — cuenta y credencial POR PROYECTO, libro durable, barrido, integridad y conciliación.
fuentes:
  - modules/pago-gateway/**
  - tests/unit/pago-gateway-*.test.js
  - tests/unit/pizzepos__pago-gateway-*.test.js
verificado: 2026-10-27
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
    "link":      "pago.iniciar.request → checkout_url alojado (SumUp Hosted / Stripe Session); pago.actualizar.request cambia importe/concepto/caducidad del MISMO link (PATCH), sin recrearlo"
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
  "identidad": {
    "tesis": "un proyecto tiene DOS llaves en el bus (UUID del registro y slug del directorio) y el órgano habla SIEMPRE slug",
    "resolucion": "modules/_shared/resolutor-proyecto.js en el borde: uuid|slug → slug; lo desconocido se respeta tal cual",
    "por_que": "la credencial se guarda como <PROVIDER>_API_KEY_PROJECT_<slug> y el storage se indexa por llave: con el UUID la clave 'no existe' (webhook 503 con el dinero cobrado) y el libro se parte en dos carpetas",
    "entradas_normalizadas": ["pago.iniciar/cancelar/reembolsar", "todo puerto .request", "config.leer/escribir", "webhook (path → proyecto)", "barrido y conciliación (iteran UUIDs)"]
  },
  "entorno": {
    "de_que": "GET /v0.1/me → extdev true = cuenta SANDBOX (la clave no lo dice: sup_sk_ es igual en las dos)",
    "donde": "pago.estado.entorno (real|sandbox|null) + aviso explícito; y en la fila del libro, heredado por _ledgerPut",
    "regla": "un ensayo y un cobro real jamás son la misma fila; si SumUp no contesta el entorno queda null y NUNCA bloquea el cobro",
    "cache": "10 min por credencial (hash), best-effort"
  },
  "config": {
    "por_proyecto": "/pago/config.json (esquema pago-pasarela-v1)",
    "core": "bloque pasarela de module.json = DEFAULTS; el proyecto pisa (merge de barrido/conciliacion)",
    "credencial": "credential.resolve.request CON el SLUG → <PROVIDER>_API_KEY_PROJECT_<slug> antes que GLOBAL",
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

## Las dos grietas que costaron dinero (26-oct-2026, con la cuenta real)

**Identidad: un solo camino, el slug.** El bus admite dos llaves para el mismo negocio —el UUID del
registro y el slug del directorio— y cada llamante llegaba con la suya: `tienda-api` manda el slug
en `project_id`, el webhook resolvía el UUID de `project-manager` y el barrido itera UUIDs. Como la
credencial se guarda `SUMUP_API_KEY_PROJECT_<slug>` y el storage se indexa por la llave que llega,
el UUID producía dos fallos silenciosos: el webhook contestaba **503 con el dinero ya cobrado**
(«no hay credencial» sobre una clave que existía) y el libro podía partirse en dos carpetas. Se
cierra en el **borde** con el resolutor compartido (`modules/_shared/resolutor-proyecto.js`):
`uuid|slug → slug`, sin mapa propio ni segunda copia del slugify, y con degradación honesta (si el
bus no contesta, la llave se respeta tal cual). Los dos juegos de llaves que se escribieron a mano
en `.env` para taparlo dejan de hacer falta.

**Métodos de pago: la forma real de la respuesta.** SumUp responde
`{ available_payment_methods: [{ id: 'card' }] }`; leer solo `items`/`payment_methods` daba lista
vacía y con ella un aviso **falso**: «pide el alta del scope online a SumUp». Mandó a soporte dos
veces con la cuenta perfectamente operativa. Ahora hay un único extractor (`_metodosDeSumup`) y el
aviso distingue «la clave no responde» de «la cuenta no lista tarjeta».

**Entorno: ensayo ≠ cobro.** Una clave de sandbox (`sup_sk_` idéntica a la real) hace que un ensayo
entre en el libro exactamente igual que un cobro. `GET /v0.1/me` lo publica en `extdev`: el órgano
lo expone en `pago.estado.entorno` con aviso explícito y lo graba en la fila del libro (`entorno`),
heredado en `_ledgerPut` para las cuatro puertas. Es best-effort: si SumUp no contesta queda `null`
y nunca bloquea un cobro.

## Las cinco puertas, con lo que exige cada una

**1 · Link (Hosted Checkout).** `POST /v0.1/checkouts` con `checkout_reference` (= referencia),
`amount` DECIMAL (no céntimos), `currency`, `merchant_code`, `hosted_checkout.enabled`,
`return_url` (webhook) y `valid_until` propio. Un `409 DUPLICATED_CHECKOUT` **no** crea un segundo
link: se busca el vivo y se **reutiliza** — dos links vivos son dos cobros posibles. Sin
`return_url` el adapter falla en voz alta: se cobraría y nadie liberaría el hecho.

**1b · Cambiar el link vivo (PATCH).** Si el cliente añade algo, el importe se cambia sobre el
MISMO checkout (`PATCH /v0.1/checkouts/{id}`) — la alternativa (cancelar y crear otro) es
exactamente donde se cuela un segundo cobro. El libro adopta el importe nuevo, porque si no la
guarda de integridad rechazaría un cobro correcto. La spec lo dice: ese PATCH "does not charge a
payment instrument".

**2 · QR.** No es un método de pago, es la URL dentro de un dibujo: misma comisión, misma
integración. `qr.js` es un codificador **nativo** (modo byte, ECC L/M/Q/H, v1–20, máscara por
penalización) que emite **PNG** (WhatsApp/impresión) y **SVG**; se verificó decodificando con un
lector independiente (OpenCV) las URLs reales de checkout. Con `importe` crea o reusa el checkout
del hecho (dinámico); con `url` pinta lo que le den sin gastar ni una llamada (carta, propinas). Un
QR **estático** impreso obliga al cliente a teclear el importe: sirve para la carta, no para cobrar.
El otro mundo —el **QR EMVCo** de Bizum/banco, que se paga desde la app sin pasar por una web— no lo
genera el comercio: lo emite el adquirente, y SumUp no lo expone en su spec (verificado).

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
  "5_webhook_no_es_prueba": "SumUp no firma: token secreto en la URL + RECONSULTA del recurso; 5xx si no se pudo verificar (reintenta 1m/5m/20m/2h). Stripe: el payload es un PUNTERO, la firma HMAC es opcional y la reconsulta es la que confirma",
  "6_integridad": "un PAID que no cuadra no se confirma (pago.importe_discrepante); el exceso solo lo explica la propina",
  "7_reembolso": "sin reintento a ciegas pero sin abandonar: SumUp reconsulta la transacción y sus eventos REFUND; Stripe reconsulta /v1/refunds?payment_intent y compara con lo ya apuntado",
  "8_preflight": "pago.estado dice si la cuenta puede cobrar HOY (método card activo, moneda, país, webhook)",
  "9_aislamiento": "merchant, clave, token de webhook, libro, registro y conciliación son DEL PROYECTO"
}
```

## Stripe con la misma disciplina (v3.1 · 27-oct-2026)

Hasta la v3.0 el adapter de Stripe sabía **dos cosas**: crear una Checkout Session y leer el webhook
con su firma HMAC. Eso dejaba fuera cinco de las nueve garantías, y el síntoma no aparece en una
prueba sino en producción: dos clics = dos sesiones = dos cobros, y un reembolso hecho en el panel de
Stripe que nadie ve. La v3.1 ({{version:modules/pago-gateway}}) mete Stripe en el libro, en el
barrido y en la conciliación.

| garantía | cómo queda en Stripe |
|---|---|
| 1 idempotencia | `_stripeLinkVivo` lee el **libro** (no la memoria): referencia con link vivo → se devuelve el MISMO `session_id` sin llamar a Stripe; pedido ya pagado → 409 `CHECKOUT_YA_PAGADO`. Además `Idempotency-Key` en el POST: un reintento de red no abre otra sesión. |
| 2 caducidad | `expires_at` con el TTL del proyecto, acotado a lo que Stripe acepta (**entre 30 min y 24 h**): no se pide un imposible. |
| 3 libro | misma fila en `/pago/checkouts.json` con `pasarela: 'stripe-checkout'`, importe, `checkout_url` y `entorno` — aquí el prefijo `rk_test_`/`rk_live_` SÍ distingue ensayo de real (al revés que `sup_sk_`). |
| 4 barrido | `_barrerProyecto` pregunta el `kind` **del proyecto** y usa `GET /v1/checkout/sessions/{id}`: `paid` confirma, `expired` expira, `open` vencida se expira. **El barrido pasa a montarse siempre**: antes exigía `kind` en la config del CORE —el sitio equivocado— y un negocio bien configurado podía quedarse sin barrido. |
| 5 webhook | el payload es un **PUNTERO**, no una prueba: se pide la sesión con NUESTRA clave y solo `payment_status:'paid'` confirma. La firma HMAC se verifica si hay `webhook_secret`, pero la defensa real es la reconsulta: sin secreto, un POST inventado no puede fabricar un `pago.confirmado`. |
| 6 integridad | `amount_total` contra la fila del libro con `_cuadraCobro` (la MISMA guarda que SumUp) → `pago.importe_discrepante` y el pedido no se libera. |
| 7 reembolso | `POST /v1/refunds` por `payment_intent`, con tope por libro; ante timeout o 5xx se **reconsulta** `GET /v1/refunds?payment_intent=…` y se compara con lo ya apuntado: nunca se reintenta a ciegas (devolvería dos veces). |
| 8 preflight | `pago.estado` lee `/v1/account` (`charges_enabled`, `payouts_enabled`, `details_submitted`) y `/v1/balance`; un 403 no rompe el informe, se degrada con aviso («la clave no tiene Account · Lectura»). En modo test se puede cobrar aunque el alta no esté cerrada, y el aviso dice que ese dinero es de ensayo. |
| 9 aislamiento | clave `STRIPE_API_KEY_PROJECT_<slug>`, `webhook_secret` y libro del proyecto; el `:project` del webhook decide con qué cuenta se verifica. |

**Lo que NO hace, y se dice al encenderlo:** `pago.recibo` responde 501 (Stripe no emite recibo
estructurado de un pago de Checkout; el ticket es del ERP) y `pago.actualizar` responde 501 (una
sesión de Stripe no cambia de importe: se expira y se abre otra, con una sola viva). `pasarela.metodos`
es hoy **declaración, no candado**: Stripe retiró `payment_method_types` al crear Checkout Sessions
(400 literal, 28-oct-2026) y el set real lo sirve el panel de Stripe; el preflight lo dice en `avisos`.

**Conciliación propia** (`conciliacion-stripe.js`, hermano del de SumUp, mismo contrato de deps): un
tick cada 15 min que (a) lista las sesiones pagadas y emite `cobro.huerfano` para las que no casan
con ninguna fila, (b) lee los refunds creados en la ventana y emite `pago.reembolsado` con la
DIFERENCIA —dedupe por `refund_id`, que queda apuntado en el libro al reembolsar—, y (c) cierra la
comisión REAL por día desde `/v1/balance_transactions` (bruto · comisión · neto). Cada conciliador se
salta los proyectos que no son de su pasarela: la pasarela es del PROYECTO, no del core.

**Permisos de la clave (RAK), recurso por recurso:** Checkout Sessions **Write** (cobrar) y **Read**
(barrido y conciliación) · Refunds **Write** (devolver) y **Read** (reembolsos del panel) · Account
**Read** y Balance **Read** (preflight y comisión real; sin ellos el informe se degrada con aviso, no
falla) · Payment Intents **Read** solo si se quiere ampliar el detalle.

## Puertos (bus)

```
pago.iniciar · pago.actualizar · pago.cancelar · pago.reembolsar · pago.estado · pago.recibo · pago.metodos · pago.conciliar · pago.config
pago.qr
pago.reader.listar · .parear · .leer · .renombrar · .borrar · .estado · .cobrar · .consultar · .terminar · .cobrar_go
pago.cliente.alta · .leer · .actualizar · .tarjetas · .tarjeta.baja
pago.tokenizar · pago.cobrar_guardada
```

Publica: `pago.actualizado` · `pago.confirmado` · `pago.rechazado` · `pago.cancelado` · `pago.reembolsado` ·
`pago.importe_discrepante` · `pago.en_terminal` · `pago.tokenizado` · `pago.recibo.obtenido` ·
`pago.contracargo` · `cobro.huerfano` · `cobro.liquidado`. Todos los de dinero llevan `canal`
(`online` · `terminal` · `guardada`) y `referencia` + `pedido_id`.

## Estado y frenos (honesto)

- **Verificado**: 137 checks en `npm test` con `fetch` falso — protocolo SumUp, idempotencia,
  integridad, aislamiento multiproyecto, terminal, clientes, recurrencia, QR **y la paridad de
  Stripe** (21 checks propios: libro, idempotencia por referencia, webhook-puntero, firma, importe,
  barrido, reembolso resuelto por reconsulta, preflight, cancelación y conciliación). El QR se
  decodificó con lector independiente (OpenCV).
- **Sin verificar**: no se ha tocado la API real de ninguna de las dos pasarelas (falta merchant
  code/clave del proyecto). Los primeros actos al tenerlas: pago de 1 € en sandbox, camino de fallo
  (importe `…11` en SumUp · tarjeta `4000 0000 0000 0002` en Stripe) y lectura de `pago.estado`.
  En Stripe, además, la clave RAK necesita los permisos de la tabla de arriba o el adapter degrada.
- **Costuras conocidas**: el libro es un JSON por proyecto con read-modify-write sin candado entre
  procesos (la conciliación lo detectaría como `cobro.huerfano`, no se pierde dinero); el reintento
  es único y no respeta `Retry-After`; no hay multi-merchant por OAuth (una cuenta por proyecto ni
  soporte de plataforma multi-comercio); la caché caliente del webhook no se poda; Apple Pay nativo
  (`/v0.2/checkouts/{id}/apple-pay-session`) no se usa (los wallets van por el checkout alojado);
  fuera de alcance por diseño: `members`, `roles`, `persons` y `memberships` (gestión del equipo en
  el panel de SumUp, no cobro) y OAuth de plataforma multi-comercio.
