# Vertical tienda PWA + WhatsApp escueto — comercio local digital

> **Documento de retomar.** Captura el plan completo para la nueva
> vertical: PWA pública con catálogo + carrito + bot WhatsApp escueto
> que recibe el pedido y orquesta cobro presencial. Caso piloto **vapers**;
> visión multi-vertical para **panadería, floristería, carnicería,
> frutería, estanco** sin reescribir.
>
> **Auditoría 2026-05-26 (sesión "ojos limpios")**: revisión con
> verificación de disco contra contratos vigentes. El modelo simplificado
> previo era miope — el modelo real es conversacional escueto vía
> WhatsApp con la PWA como visualizador del catálogo. Esta versión
> recoge las correcciones.

Fecha: 2026-05-26 (auditoría); plan original 2026-05-25.

Documentos hermanos en `propuestas/`:
- `cajones-context-partitioning.md` ✅ cerrado.
- `migracion-menu-generator-blueprint.md` ✅ ejecutado (menu-generator v8.0.0 en main).
- `migracion-agentes-blueprint.md` 📝 pendiente.
- `cierre-tools-contract-v12-deuda-residual.md` 📝 pendiente.
- `evolucion-contrato-blueprints-eventos-conscientes.md` ✅ cerrado en main.

Contratos vivos referenciados:
- `tools.contract.json` v1.2.0
- `events.contract.json` v1.2.0
- `modulos-blueprint-driven.contract.json` v1.3.0
- `llm-runtime-discipline.contract.json` v2.0.0
- `blueprint-eventos-conscientes.contract.json` v1.0.0
- `dinamica-de-trabajo-companero.contract.json` v1.0.0

---

## 1 · Por qué existe este documento

El usuario propone una vertical sobre el sistema Enki: vender **vapers
a nivel local** vía PWA pública con WhatsApp como canal de entrada y
handoff transaccional. Visión de escalar a **panaderías, floristerías,
carnicerías, fruterías, estancos** sin reescribir.

**El modelo (definitivo tras auditoría 2026-05-26):**

- **Cliente entra vía WhatsApp** del negocio (número conocido o Business).
- **Bot escueto** del negocio responde con link a la PWA.
- **PWA pública** (sobre `carta-digital` ya existente) muestra catálogo
  + carrito + serializa pedido al cerrarlo.
- **Pedido vuelve por WhatsApp** desde el cliente al negocio
  (`wa.me?text=<pedido>`).
- **Bot recibe**, confirma, **notifica al staff vía Telegram**, el
  cliente recoge presencialmente y paga en efectivo.

WhatsApp es **canal transaccional escueto**, no chat conversacional
rico. El chat LLM que `carta-digital` ya integra (vía cf-worker a
DeepSeek) queda **disponible pero NO se usa en este flujo** — no
necesario para v1, no se desactiva (la PWA puede activarlo por
configuración del proyecto si se decide más adelante).

**Sin RGPD pesado**: el bot conoce el número del cliente
inevitablemente (es WhatsApp), pero el sistema **no persiste datos
personales** más allá de la transacción del pedido. Cero CRM. Cero
historial de cliente. Pedido cerrado → datos del cliente desechables.

**Cómo usar este documento en la próxima sesión:**
1. Lee este doc (~10 min).
2. Lee `carta-digital/cf-worker/worker.js` (~5 min — para entender qué
   ya está hecho).
3. Sigue el guion en `_arranque-vertical-tienda-pwa-sin-datos.md`.

---

## 2 · El flujo end-to-end

```
1. Cliente abre WhatsApp del negocio → escribe "hola" (o lo que sea).
2. Bot responde escueto: "Aquí tienes el catálogo: https://tu-tienda.com"
3. Cliente abre PWA en navegador.
4. Cliente confirma "soy mayor de 18" (gate edad si el proyecto lo activa).
5. Cliente compone carrito (estado local del navegador, localStorage).
6. Cliente cierra carrito → PWA construye link wa.me?text=<pedido_serializado>.
7. Cliente pulsa "enviar pedido" → se abre su WhatsApp con el mensaje
   pre-rellenado → cliente confirma envío.
8. Bot del negocio recibe el mensaje → lo parsea → confirma recepción:
   "Pedido recibido. Pago en efectivo al recoger. Código: VAP-A3F2".
9. Bot reserva stock en inventario + notifica al staff vía Telegram
   con el pedido completo.
10. Cliente pasa a la tienda física.
11. Dependiente busca el pedido por código en su frontend admin (o ve
    notificación Telegram).
12. Dependiente prepara, entrega, cobra en efectivo.
13. Sistema cierra el pedido (cobros.crear con metodo_pago='efectivo'
    → cobro.procesado → pedido.completado → inventario.confirmar).
```

**Cero datos personales persistidos** del cliente. El número de
WhatsApp lo ve el bot solo durante la transacción y no se guarda
después de cerrar el pedido. Cero RGPD.

---

## 3 · Reuso del sistema actual

### Lo que YA hace todo el trabajo pesado

| Módulo | Capacidad reusada |
|---|---|
| **`carta-digital`** v1.1.0 (blueprint) | ⭐ Pieza maestra. cf-worker en GitHub Pages que ya sirve PWA pública + chat LLM (DeepSeek) server-side con rate limiting + API key protegida + streaming SSE + multi-tenant nativo. **80% del trabajo de la PWA YA está hecho**. |
| **`productos`** | Catálogo (vapers, sabores, ml, marca, formato). Precio directo en el producto. |
| **`cobros`** v3.0.0 | Método `efectivo` ya canónico. Tools `cobro.create`, `cobro.confirm`, `cobro.list`. |
| **`telegram-service`** | Notificación al staff (dueño y dependientes) — patrón ya en repo. |
| **`credential-manager`** | Resolver token de WhatsApp Cloud API en runtime sin hardcodear. |

### Lo que NO se reusa (y por qué)

| Módulo | Por qué no |
|---|---|
| `staff-manager` | Es NFC NTAG215 + jornadas POS. Comercio local digital no necesita fichaje. |
| `pdf-viewer` | `pdf.create` solo acepta texto plano corto (max 3000 chars), sin QR ni HTML. Sin albaranes PDF en v1 — QR vive en pantalla del cliente. |
| `tarifas` | Vapers usa precio simple por producto, no tarifa por canal. |
| `cuentas-canales` | Diseñado para flujos POS complejos (mesa/llevar/teléfono/glovo/llevadoo). Tienda PWA es modelo plano: pedido tiene 3 estados (pendiente_recogida → recogido_y_cobrado → completado o expirado). No usa el aparato de cuentas-canales. |
| `cuentas` | Idem — el pedido es un objeto plano en `pedidos.json`, no necesita modelo de cuenta POS. |
| `menu-generator` v8.0.0 | Está pensado para crear cartas de restaurante. No se usa para v1. Si emerge necesidad de carga masiva de catálogo desde factura proveedor, se reabre. |
| Marketing agents (copywriter, strategist, brand-keeper, onboarding) | No en v1. Pueden usarse en v2 para textos comerciales y campañas. |

### Lo opcional según el caso del proyecto

- `escandallo` + `viabilidad` (blueprint v1.1.0 ambos): margen real por producto + proyección venta-volumen-coste. **Útiles para el dueño** pero no críticos para que la tienda funcione. Se activan cuando interese.

---

## 4 · Lo que SÍ se construye en v1

### 4.1 Componentes Svelte en la PWA pública (~2-3h)

Sobre la base de `carta-digital/cf-worker/worker.js` + `static-template.js`,
añadir:

- `TiendaCatalogoView.svelte` — listado de productos con foto, sabor, precio.
- `TiendaProductoCard.svelte` — tarjeta de producto + botón "Añadir".
- `TiendaCarrito.svelte` — estado del carrito (productos + cantidades + total) con persistencia `localStorage`.
- `TiendaCheckboxEdad.svelte` — modal o gate de entrada (configurable por proyecto).
- `TiendaCerrarPedido.svelte` — botón "Enviar pedido por WhatsApp" que construye `wa.me/<numero>?text=<pedido formateado>` y abre el link.

**Función crítica**: serialización del carrito a mensaje WhatsApp legible
por el bot (formato fijo: una línea por ítem con `cantidad x producto`,
total al final, código de proyecto al principio para que el bot identifique
de qué negocio es).

### 4.2 Bot WhatsApp del negocio (~3-4h)

Módulo nuevo `whatsapp-bot` (JS POC2). Máquina de estados pequeña, NO
LLM rico:

- **Webhook** recibe mensajes desde WhatsApp Cloud API (Meta).
- **Estado 0 — saludo**: cliente escribe → bot responde link de la PWA.
- **Estado 1 — pedido recibido**: bot detecta mensaje con formato de
  pedido → parsea ítems → publica `pedido.crear.request` al bus → recibe
  código de recogida → responde al cliente con confirmación + código.
- **Estado 2 — notificación staff**: publica `telegram-service.send.request`
  con el pedido completo al chat de staff.

Tools canónicas:
- `whatsapp.enviar.request` (mensaje texto plano al cliente).
- `whatsapp.webhook.recibido` (evento de entrada).

Eventos publicados:
- `pedido.crear.request` (handoff al módulo `pedidos`).
- `whatsapp.mensaje.enviado`, `whatsapp.mensaje.recibido`.

### 4.3 Módulo `inventario` (~3-4h)

Justificación: vapers son unidades físicas finitas. Stock real + alertas + reservas con expiración.

Tools canónicas:
- `inventario.consultar(producto_id)`
- `inventario.reservar(producto_id, cantidad, pedido_id, expira_at)`
- `inventario.confirmar(pedido_id)` (decrementa real al recoger)
- `inventario.liberar(pedido_id)` (libera reserva si expira)
- `inventario.ajustar(producto_id, delta, motivo)` (entrada, merma)
- `inventario.estado_catalogo()`

Eventos:
- `inventario.stock.bajo_minimo`
- `inventario.reserva.creada`
- `inventario.reserva.expirada`

**Crítico**: usar `safeUpdate(path, mutator)` del blueprint padre
(PR #208 ya canónico) para todas las secuencias read-modify-write.
Cierra la clase de bugs estilo "salmorejo perdido" en caso de carrera
de dos clientes reservando el último ítem.

### 4.4 Módulo `verificacion-edad` mini (~30 min)

Tool `verificacion-edad.confirmar()` que registra el flag en el pedido
(sin guardar identidad). El pedido persiste solo `mayor_edad_confirmado: true`
+ timestamp.

Activación por proyecto: vapers lo activa, panadería no.

### 4.5 Tool `pedido.generar_codigo_recogida` en `pedidos` (~1h)

Genera código alfanumérico de 6 caracteres no adivinable
(`crypto.randomBytes` + base32 sin caracteres ambiguos como 0/O/1/I).
Persiste en el pedido como `codigo_recogida`. Idempotente.

### 4.6 Configuración inicial del proyecto vapers (~1-2h)

- `data/projects/vapers/...` con `productos.json`, `marca.json`,
  `inventario.json` iniciales.
- Configurar token de WhatsApp Cloud API vía `credential-manager`.
- Configurar número de WhatsApp del negocio + número del chat Telegram del staff.
- Configurar `verificacion-edad` activado (regulación vapers).

---

## 5 · Decisiones cerradas (15)

| # | Decisión | Cierre |
|---|---|---|
| 1 | Deploy | Multi-tenant compartido con pizzepos. Cada negocio = un `project_id`. |
| 2 | WhatsApp **canal técnico** | **Meta Cloud API oficial** (gratis hasta 1000 conv/mes, número Business). |
| 3 | WhatsApp **modo de uso** | **Escueto, máquina de estados pequeña**. NO chat conversacional rico. |
| 4 | Chat LLM dentro de la PWA | **Disponible pero NO se usa** en este flujo. Queda dormido. Reactivable por configuración futura. |
| 5 | Pasarela online | **NO en v1**. Solo efectivo en presencial al recoger. Si emerge demanda, se añade Stripe (que se enchufa al slot `link_pago` ya existente en `cobros`). |
| 6 | Verificación edad | Checkbox mínimo + flag en pedido. Sin guardar identidad. Activable por proyecto. |
| 7 | Datos personales del cliente | **Ninguno persistido**. Bot conoce número de WhatsApp transitoriamente; no se guarda tras cerrar pedido. RGPD cero. |
| 8 | PWA pública | Sobre `carta-digital` v1.1.0 — el cf-worker, static-template y multi-tenant ya hacen el 80%. Solo añadir componentes Svelte de carrito + serializador wa.me. |
| 9 | Carrito | **Local en el navegador** (`localStorage` con TTL). NO conversacional. |
| 10 | Identificación cliente al recoger | Código + QR + descripción visual del pedido. El dependiente cruza visualmente. |
| 11 | Stock | Decremento **al confirmar pedido en bot** (no al cerrar carrito en PWA), con expiración configurable. Si no recoge en plazo, se libera. |
| 12 | Onboarding catálogo | Manual desde el frontend admin. Si emerge necesidad de carga desde factura proveedor, se evalúa reutilizar `menu-generator` (v8.0.0 blueprint en main). |
| 13 | Albarán / ticket | **Sin PDF en v1**. Solo QR en pantalla del cliente. Sin generación de albarán. |
| 14 | Tarifas | **NO se usan**. Precio directo en producto. Vapers no necesita tarifa por canal. |
| 15 | Notificación staff | `telegram-service` (ya en repo) reusado. |

---

## 6 · Decisiones AÚN abiertas (3)

### 6.1 Anti-fraude del código de recogida

- **A**: Solo código + descripción visual (dependiente cruza con pantalla del cliente).
- **B**: Código + palabra clave (3 chars) que el cliente elige al confirmar y dice al recoger.
- **C**: Código + QR firmado criptográficamente.

Recomendación: **A**. Suficiente para volumen bajo de barrio. Si emerge problema, evolucionar a B.

### 6.2 Verificación edad: antes del catálogo o al confirmar pedido

- **A**: Gate al entrar a la PWA.
- **B**: Checkbox al confirmar pedido.
- **C**: Configuración por proyecto. Vapers → gate. Panadería → nada.

Recomendación: **C**. Por proyecto.

### 6.3 Expiración de reserva de stock

Default 24h. ¿Configurable por proyecto o fija?

- **A**: Fija 24h en v1.
- **B**: Configurable por proyecto desde el principio (un campo en `data/projects/{slug}/inventario.config.json`).

Recomendación: **B**. Cero trabajo extra, permite ajustar (panadería 3h por perecederos, vapers 48h).

---

## 7 · Cuellos identificados

| # | Cuello | Severidad | Mitigación |
|---|---|---|---|
| 1 | Parser robusto del mensaje WhatsApp del cliente (formato fijo, pero el cliente puede editarlo) | Media | Bot valida formato; si no parsea, responde "no entiendo el pedido, vuelve a generarlo desde la PWA". |
| 2 | Stock concurrente: dos clientes reservan el último ítem | Media | `inventario.reservar` con `safeUpdate(CAS)` — primero gana, segundo recibe `CONFLICT_STATE` y bot le notifica "se agotó mientras pedías, vuelve a la PWA". |
| 3 | Catálogo cacheado en cf-worker puede mostrar "disponible" lo que ya está agotado | Media | Polling cada N min desde el cf-worker al backend para refrescar stock, o invalidar caché en `inventario.stock.bajo_minimo`. |
| 4 | Sin datos del cliente: si el pedido se cancela por algo, no se le puede avisar (solo si el cliente vuelve a escribir) | Alta inherente al modelo | Asumido. El cliente puede consultar estado del pedido reabriendo la PWA con el código local. |
| 5 | Multi-vertical (panadería sin gate edad, etc.) | Baja | Configuración por proyecto desde v1. |
| 6 | Rate limiting del bot WhatsApp para evitar spam | Media | Rate limit por número en el webhook. Si pasa N msgs/min, ignorar. |
| 7 | El bot WhatsApp es módulo nuevo no probado en este repo | Media | Tests unitarios + audit runtime end-to-end antes de mergear. |

---

## 8 · Lo que NO se incluye en v1 (deuda explícita)

- ❌ Pasarela de pago online (`pago-stripe`, RedSys, Bizum, PayPal).
- ❌ Chat LLM activo dentro de la PWA (queda dormido).
- ❌ Envío a domicilio + repartidor + tracking.
- ❌ Direcciones + geolocalización.
- ❌ Devolución/cancelación canónica (todo presencial).
- ❌ Búsqueda con RAG sobre productos.
- ❌ Multi-idioma.
- ❌ Login de cliente en PWA.
- ❌ Dashboard de métricas de negocio (uso `pedidos.listar` y `cobros.list`).
- ❌ Albarán PDF.
- ❌ Carga de catálogo desde factura del proveedor (vía menu-generator).
- ❌ CRM / cliente recurrente / fidelización.
- ❌ Notificaciones outbound al cliente (templates Meta aprobados).
- ❌ Marketing agents activos.

Todos quedan como deuda explícita para v2/v3 cuando emerja necesidad real.

---

## 9 · Camino propuesto para implementación

### Fase 0 — Cerrar las 3 decisiones abiertas (15 min, sin código)

Cerrar 6.1, 6.2, 6.3 con el usuario.

### Fase 1 — Setup WhatsApp Cloud API (1-2h)

- Crear cuenta Meta Business + verificar número.
- Configurar webhook server-side (en `whatsapp-bot/index.js`).
- Probar envío/recepción manual con curl.
- Token vía `credential-manager`.

### Fase 2 — Módulo `whatsapp-bot` (3-4h)

POC2 con máquina de estados mínima. Tools canónicas. Webhook handler.
Tests unitarios.

### Fase 3 — Módulo `inventario` (3-4h)

POC2 con `safeUpdate` para operaciones read-modify-write. Tools + eventos.
Tests por capa.

### Fase 4 — Módulo `verificacion-edad` mini (30 min)

Tool simple + integración en flujo de PWA y bot.

### Fase 5 — Tool `pedido.generar_codigo_recogida` (1h)

En módulo `pedidos`. Tests.

### Fase 6 — Componentes Svelte PWA (2-3h)

Sobre `carta-digital`: nuevos componentes catálogo + carrito +
serializador wa.me. Persistencia `localStorage`. Adaptación
opcional del `cf-worker` (probablemente cero cambios — la PWA solo
lee catálogo y construye link wa.me).

### Fase 7 — Configuración inicial proyecto vapers (1-2h)

`data/projects/vapers/...` + token WhatsApp + número Telegram staff.
Cargar primer catálogo manualmente.

### Fase 8 — Tests + audit runtime end-to-end (1-2h)

Smoke test del flujo completo: WhatsApp → bot → PWA → carrito → wa.me
→ bot → notificación Telegram → cobro presencial → cierre.

### Fase 9 — Cierre

- Actualizar `CLAUDE.md` con la nueva vertical.
- Cerrar este doc con cabecera ✅ cuando se implemente.
- Commit + push a la rama designada.

**Total estimado**: 12-18h en 2-3 sesiones. (Antes era 12-18h también; la
auditoría no reduce porque el bot WhatsApp es módulo nuevo serio que
yo había infraestimado.)

---

## 10 · Cómo arrancar la próxima sesión

Mensaje sugerido literal:

> *"Vamos a implementar la vertical tienda PWA + WhatsApp escueto. Lee
> `arquitectura/decisiones/propuestas/vertical-tienda-pwa-sin-datos.md`
> entero. Sigue el guion en
> `_arranque-vertical-tienda-pwa-sin-datos.md`."*

El guion del arranque hace que la próxima conversación:
1. Verifique el estado actual del repo y los módulos reusables (verificar `carta-digital/cf-worker/worker.js`).
2. Te haga las **3 decisiones abiertas** restantes.
3. Para y pide tu OK antes de Fase 1 (WhatsApp Cloud API setup).
4. Itera fase por fase pidiendo OK entre cada una.

---

## 11 · Relación con contratos vigentes

| Contrato | Cómo se relaciona |
|---|---|
| `tools.contract.json` v1.2.0 | Los 3 módulos nuevos (`whatsapp-bot`, `inventario`, `verificacion-edad`) siguen el shape canónico. Auto-wire los enchufa al LLM, UI y bus. |
| `module-rewrite.contract.json` (POC2) | Los 3 módulos nuevos siguen POC2. |
| `events.contract.json` v1.2.0 | Eventos canónicos respetan naming + idioma del módulo. |
| `errors.contract.json` | Errores canónicos desde día 1 (`INVALID_INPUT`, `CONFLICT_STATE`, etc.). |
| `extensibilidad-modular.contract.json` | La vertical materializa "añadir vertical sin reescribir el núcleo". |
| `cajones-context-partitioning.contract.json` v1.0.0 | Si el bot evoluciona a blueprint-driven en v2 (poco probable), activaría cajones. v1 es POC2, no aplica. |
| `llm-runtime-discipline.contract.json` v2.0.0 | Si el bot evoluciona a blueprint v2, las 11 reglas aplican. v1 POC2 no aplica directamente. Pero **el módulo `inventario` SÍ debe respetar el principio 11 (read_modify_write_con_cas) usando `safeUpdate` del padre**. |
| `blueprint-eventos-conscientes.contract.json` v1.0.0 | Los módulos nuevos declaran `eventos_publicados_que_requieren_consumer[]` en su manifest cuando aplique (ej. `pedido.crear.request` → consumer esperado `pedidos`). |
| `dinamica-de-trabajo-companero.contract.json` v1.0.0 | Esta propuesta es ejemplo de "horizonte grande" canonizado por el contrato: propuesta + arranque, decisiones cerradas vs abiertas explícitas, ritual de limpieza periódica si se acumula contexto. |
| `migracion-menu-generator-blueprint.md` ✅ | menu-generator v8.0.0 disponible si se decide carga masiva de catálogo en v2. |
| `migracion-agentes-blueprint.md` (pendiente) | Sinergia futura: si el bot WhatsApp evoluciona a agente blueprint v2, el patrón está disponible. |

---

## 12 · Visión multi-vertical (después de vapers)

Una vez vapers funcione, la misma infraestructura sirve para:

| Vertical | Cambios respecto a vapers |
|---|---|
| **Panadería** | Sin checkbox edad. Expiración stock 3h (perecederos). Catálogo cambia diario. |
| **Floristería** | Sin checkbox edad. Variaciones por ramo/centro/maceta. |
| **Carnicería** | Sin checkbox edad. Stock por peso (gramos), no unidades — adaptación menor en `inventario` para soportar magnitud. |
| **Frutería** | Sin checkbox edad. Stock por peso. |
| **Estanco** | Checkbox edad (tabaco + vape). Mismo patrón. |

**Todo es configuración del `project_id`, no código nuevo**. El mismo
`whatsapp-bot` sirve a todas — solo cambia el catálogo de productos y
el número de WhatsApp del negocio.

---

## 13 · Frase resumen para retomar

**Vertical tienda PWA + WhatsApp escueto: cliente abre WhatsApp del
negocio → bot envía link a PWA pública (basada en carta-digital v1.1.0
que ya hace 80% del trabajo: cf-worker en GitHub Pages + chat LLM
DeepSeek server-side + multi-tenant) → cliente compone carrito en la
PWA → cliente cierra → PWA construye link wa.me → cliente envía el
pedido por WhatsApp → bot del negocio recibe, parsea, reserva stock,
notifica al staff vía Telegram → cliente pasa a tienda física, paga en
efectivo, recoge. Cero RGPD (datos del cliente transitorios, no
persistidos). Caso piloto vapers; visión multi-vertical para panadería,
floristería, carnicería, frutería, estanco. Reuso: `carta-digital` (PWA
+ cf-worker), `productos` (catálogo simple), `cobros.efectivo`,
`telegram-service`, `credential-manager`. Módulos NUEVOS solo 3:
`whatsapp-bot` (POC2, máquina de estados mínima sobre Meta Cloud API),
`inventario` (POC2 con safeUpdate canónico), `verificacion-edad` (mini).
Total v1 ~12-18h en 2-3 sesiones. 3 decisiones abiertas: anti-fraude
código, gate edad por proyecto, expiración stock configurable. NO en
v1: pasarela online, chat LLM activo en PWA, envío a domicilio, CRM,
notificaciones outbound, albarán PDF, búsqueda RAG, login.**
