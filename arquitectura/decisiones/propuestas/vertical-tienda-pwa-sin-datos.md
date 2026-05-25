# Vertical tienda PWA sin datos — comercio local con código de recogida

> **Documento de retomar.** Captura el plan completo para la nueva
> vertical de comercio electrónico local: PWA pública interactiva,
> pedido anónimo con código de recogida, pago en efectivo presencial.
> Caso piloto **vapers**; visión multi-vertical para **panadería,
> floristería, carnicería, frutería, etc.** sin reescribir.

Fecha: 2026-05-25.
Documentos hermanos en `propuestas/`:
- `cajones-context-partitioning.md` ✅ cerrado.
- `migracion-menu-generator-blueprint.md` 📝 pendiente (sinergia: carga de catálogo).
- `migracion-agentes-blueprint.md` 📝 pendiente (sinergia: agentes marketing).
- `cierre-tools-contract-v12-deuda-residual.md` 📝 pendiente.

---

## 1 · Por qué existe este documento

El usuario propone una vertical nueva sobre el sistema Enki: vender
**vapers a nivel local** vía PWA pública, con visión de escalar a
**panaderías y otros comercios de barrio con encargo + recogida**.

El insight crítico que aterriza el modelo: **sin datos personales del
cliente**. *"La idea es sortear burocracia sin tomar nombres, no tenemos
protección de datos."* Eso elimina:

- CRM / cliente recurrente.
- Notificaciones outbound.
- WhatsApp como canal transaccional.
- Carrito conversacional via LLM.
- Toda la complejidad RGPD que exige consentimiento + retención + acceso
  + derecho al olvido.

Lo que queda es **una PWA pública con carrito local** + un código de
recogida anónimo. El cliente entra, compone su pedido, recibe un código,
pasa por la tienda física, paga en efectivo, recoge.

WhatsApp queda como **canal promocional puro** (link en estado, no
integración técnica en v1).

**Cómo usar este documento en la próxima sesión:**
1. Lee este doc (~10 min).
2. Lee la sección de inventario de pizzepos (sección 3) — el reuso es muy
   amplio.
3. Sigue el guion en `_arranque-vertical-tienda-pwa-sin-datos.md`.

---

## 2 · El flujo end-to-end

```
1. Cliente abre https://tu-tienda.com (PWA pública, sin login).
2. Checkbox "soy mayor de 18" (solo vapers o productos con regulación).
3. Cliente compone carrito (estado local del navegador, persistencia localStorage).
4. Cliente confirma pedido.
5. Backend genera código anónimo VAP-A3F2 (alfanumerico 6 chars, no adivinable).
6. PWA muestra al cliente:
   - Código + QR.
   - Descripción del pedido (productos + cantidades).
   - "Pasa por la tienda y paga al recoger".
   - Dirección + horario de la tienda.
7. Cliente va a la tienda física.
8. Dependiente busca pedido por código (escanea QR o tipea).
9. Sistema muestra al dependiente la descripción.
10. Dependiente cruza visualmente con la pantalla del cliente.
11. Dependiente prepara, entrega, cobra en efectivo.
12. Sistema cierra el pedido (cobro.procesado → pedido.completado).
```

**Cero datos personales del cliente** en ningún paso. Cero RGPD. Cero
servidor de identidades. La identidad efímera del cliente es el código
+ QR que viven solo en su navegador hasta que recoge.

---

## 3 · Reuso completo del sistema actual

### Subsistema-carta (6 blueprints — TODO útil)

| Módulo | Estado | Reuso en tienda |
|---|---|---|
| `carta-digital` | blueprint | ⭐ **Pieza maestra**: PWA pública con `cf-worker` + `static-template`. Multi-tenant nativo. La generalizamos (o clonamos como `tienda-publica`) para incluir carrito interactivo. |
| `carta-marketing` | blueprint | Perfil de marca del proyecto (nombre, lema, tono). Para vapers directo. Orquesta 4 agentes marketing. |
| `carta-manager` | blueprint | Catálogo activo por canal/segmento. |
| `carta-scheduler` | blueprint | Ofertas por horario, happy hour, catálogos estacionales. |
| `carta-impresion` | blueprint | Catálogo PDF descargable, etiquetas de producto, albaranes de recogida. |
| `carta-design` | blueprint | Diseño visual de la vista pública. |

### Subsistema-recetario (2 de 4 útiles)

| Módulo | Útil tienda? |
|---|---|
| `escandallo` | ✅ Margen real por producto (precio compra proveedor vs precio venta). |
| `viabilidad` | ✅ Proyección venta-volumen-coste. |
| `recetas` | ❌ Para vapers no. Para panadería sí (recetas de productos artesanales). |
| `tecnicas` | ❌ Específico cocina. |

### JS POC2 (8 útiles directos)

| Módulo | Reuso |
|---|---|
| `productos` | ✅ Catálogo (vapers, sabores, ml, marca) |
| `categorias` | ✅ Agrupación |
| `variaciones` | ✅ Sabor / nicotina / formato |
| `tarifas` | ✅ Precio por canal — `whatsapp` ya en enum, añadir `tienda-online` |
| `pedidos` | ✅ Encargo (shape adaptable a recogida) |
| `cuentas` | ✅ Cuenta del pedido |
| `cuentas-canales` | ✅ Strategies por canal. Crear nueva strategy `tienda-online` (~1h) |
| `cobros` | ✅ Efectivo + tarjeta presencial en v1. `link_pago`/`qr` quedan para v2 |
| `menu-generator` | ✅ Cargar catálogo desde factura del proveedor |

### Transversales

| Módulo | Para qué |
|---|---|
| `staff-manager` | Dueño + dependientes |
| `facturas` + `facturacion/*` | Facturación legal completa |
| `pdf-viewer` | Ticket de compra, albarán de recogida con QR |
| `scheduler` | Recordatorios de stock bajo, ofertas programadas |
| `credential-manager` | Futuras integraciones (Stripe, etc.) cuando lleguen |

### 4 agentes marketing legacy (invocables vía `agent.execute.request`)

| Agente | Uso en tienda |
|---|---|
| `marketing-copywriter` | Descripción de productos, mensajes WhatsApp comerciales, etiquetas |
| `marketing-strategist` | Campañas, ofertas, segmentación |
| `marketing-brand-keeper` | Coherencia de voz |
| `marketing-onboarding` | Setup inicial del proyecto |

Pendientes de migrar a `agente-blueprint` (frente 2.8). Mientras tanto
se invocan por evento canónico, **cero acoplamiento con esta vertical**.

---

## 4 · Lo que falta y SÍ se construye en v1

### 4.1 Módulo `inventario` (NUEVO, ~3-4h)

**Justificación**: vapers son unidades físicas finitas. Si tienes 5 del
sabor menta y vendes 5, la 6ª no existe. Pizzepos `productos` no
controla stock unitario.

**Responsabilidades**:
- Decremento de stock al confirmar pedido (con expiración configurable).
- Liberación de stock si el pedido expira sin recoger.
- Alerta cuando bajas de mínimo configurado por producto.
- Vista del estado: qué tienes, qué se acaba, qué está agotado.

**Tools canónicas**:
- `inventario.consultar(producto_id) → { stock_actual, stock_reservado, minimo }`
- `inventario.reservar(producto_id, cantidad, pedido_id, expira_at)`
- `inventario.confirmar(pedido_id)` (decrementa real al recoger)
- `inventario.liberar(pedido_id)` (libera reserva si pedido expira)
- `inventario.ajustar(producto_id, delta, motivo)` (entrada de stock, merma)
- `inventario.estado_catalogo()` (vista global)

**Eventos**:
- `inventario.stock.bajo_minimo`
- `inventario.reserva.creada`
- `inventario.reserva.expirada`

### 4.2 Módulo `verificacion-edad` (NUEVO, ~30 min)

**Justificación**: aunque "sin normas de regulación" en este horizontal,
para vapers en España la Ley 28/2005 exige diligencia razonable. Un
checkbox mínimo cubre legalmente sin pedir datos.

**Responsabilidades**:
- Tool `verificacion-edad.confirmar()` que registra el flag en el
  pedido (sin guardar identidad).
- En el pedido se persiste solo `mayor_edad_confirmado: true` + timestamp.

### 4.3 PWA pública interactiva (~4-6h)

**Decisión abierta**: ¿se generaliza `carta-digital` para soportar
carrito, o se crea módulo nuevo `tienda-publica` clon adaptado?

**Componentes Svelte nuevos a crear (sea como sea la decisión)**:
- `TiendaProductoCard.svelte` (tarjeta de producto con botón añadir).
- `TiendaCarrito.svelte` (estado del carrito, cantidades, total).
- `TiendaConfirmacion.svelte` (pantalla "tu código es X" con QR).
- `TiendaCheckboxEdad.svelte` (modal o gate de entrada).
- Carrito persistente en `localStorage` con TTL.

**Adaptación del `cf-worker`** existente para servir endpoints públicos
extra: `POST /pedido/crear`, `GET /pedido/<codigo>` (lookup desde el
móvil del cliente), `GET /catalogo` (lectura de productos+stock).

### 4.4 Tool nueva `pedido.generar_codigo_recogida` en `pedidos` (~1h)

Genera código alfanumérico de 6 caracteres no adivinable
(`crypto.randomBytes` + base32 sin caracteres ambiguos como 0/O/1/I).
Persiste en el pedido como `codigo_recogida`. Idempotente.

### 4.5 Strategy `tienda-online` en `cuentas-canales` (~1h)

Crear `modules/pizzepos/cuentas-canales/strategies/tienda-online.js`
siguiendo el patrón de `whatsapp.js` y resto. Maneja el ciclo de vida
de cuenta para pedidos PWA.

### 4.6 Configuración inicial del proyecto vapers (~2-3h)

- Crear `data/projects/vapers/...` con su `productos.json`,
  `marca.json`, `tarifas.json`, `inventario.json` iniciales.
- Configurar `staff-manager` con dueño + 1-2 dependientes.
- Configurar `carta-marketing` con perfil de marca.
- Cargar catálogo inicial: usar `menu-generator` con texto/JSON dictado
  desde factura del proveedor (o reusar la migración a blueprint cuando
  esté).

---

## 5 · Decisiones cerradas

| # | Decisión | Cierre |
|---|---|---|
| 1 | Deploy | Multi-tenant compartido con pizzepos. Cada negocio = un `project_id`. |
| 2 | WhatsApp | **Solo promocional**. Link en estado o mensaje, sin integración técnica en v1. Sin Cloud API, sin templates. |
| 3 | Pasarela online | **No en v1**. Solo efectivo en presencial al recoger. |
| 4 | Verificación edad | Checkbox mínimo + flag en pedido. Sin guardar identidad. |
| 5 | Datos personales | **Ninguno**. Cliente anónimo identificado por código de recogida. RGPD cero. |
| 6 | Catálogo público | PWA pública servida por `carta-digital/cf-worker` (con adaptación) o clon `tienda-publica`. |
| 7 | Carrito | **Local en el navegador del cliente** (`localStorage` con TTL). NO conversacional. |
| 8 | Identificación cliente al recoger | Código + QR + descripción visual del pedido. El dependiente cruza visualmente. |
| 9 | Stock | Decremento **al confirmar pedido**, con expiración configurable (default 24h). Si no recoge, se libera. |
| 10 | Onboarding catálogo | `menu-generator` (mejor cuando se migre a blueprint puro) — el dueño dicta/pega factura del proveedor. |

---

## 6 · Decisiones AÚN abiertas

### 6.1 Path y naming del módulo PWA pública

- **A**: Generalizar `carta-digital` para soportar carrito (sigue siendo
  el mismo módulo, pero con operación nueva `crear_pedido_publico`).
- **B**: Crear módulo nuevo `tienda-publica` clon de `carta-digital`
  con su propio `cf-worker` adaptado.
- **C**: Crear módulo nuevo `tienda-publica` ligero que invoca a
  `carta-digital` para la parte vitrina y añade lo de carrito.

Recomendación de partida: **B**. Razón: `carta-digital` es del subsistema
restaurante (carta editorial). Generalizar mezcla dominios. Clonar y
adaptar mantiene la distinción ontológica + permite evolución
independiente.

### 6.2 Anti-fraude del código de recogida

¿Cómo se evita que alguien recoja un pedido ajeno con el código filtrado?

- **A**: Solo código + descripción visual del pedido (el dependiente
  cruza con lo que ve en pantalla del cliente).
- **B**: Código + palabra clave (3 chars) que el cliente elige al
  confirmar y dice al recoger. Más fuerte.
- **C**: Código + QR firmado criptográficamente (timestamp + hash). El
  dependiente escanea con la app de admin y verifica.

Recomendación de partida: **A**. Suficiente para volumen bajo de barrio,
cero fricción para el cliente. Si emerge problema real, evolucionar a B.

### 6.3 Cuándo se usa `menu-generator` para cargar el catálogo

- **A**: Esperar a que `menu-generator` se migre a blueprint puro (ver
  `migracion-menu-generator-blueprint.md`) y luego usarlo.
- **B**: Usar `menu-generator` legacy ahora (funciona, aunque OCR esté
  roto; texto/JSON sí funciona). Cuando se migre, no cambia nada para
  esta vertical.

Recomendación de partida: **B**. No acoplar este horizontal con otro
pendiente.

### 6.4 ¿Verificación de edad antes del catálogo o solo al confirmar pedido?

- **A**: Gate al entrar a la PWA. El cliente confirma edad antes de ver
  productos. Más estricto, más fricción.
- **B**: Checkbox al confirmar pedido (justo antes de generar código).
  Menos estricto, menos fricción.
- **C**: Para vapers gate (A). Para panadería/otros sin regulación,
  nada. Configuración por proyecto.

Recomendación de partida: **C**. Por proyecto. Para vapers SÍ gate;
otros proyectos no muestran ni el checkbox.

### 6.5 Expiración de reserva de stock

Default 24h. ¿Configurable por proyecto o fijo?

- **A**: Fijo 24h en v1. Si emerge necesidad, se vuelve configurable.
- **B**: Configurable por proyecto desde el principio (un campo en
  `data/projects/{slug}/inventario.config.json`).

Recomendación de partida: **B**. Cero trabajo extra (un campo), permite
ajustar por tipo de negocio (panadería 3h porque el pan se vende ese
día; vapers 48h porque no caducan).

---

## 7 · Cuellos identificados

| # | Cuello | Severidad | Mitigación |
|---|---|---|---|
| 1 | Adaptación del `cf-worker` de `carta-digital` para POST públicos (crear pedido) — requiere validación de inputs sin auth | Media | Validación estricta de Zod + rate limiting básico en el Worker. |
| 2 | Stock concurrente: dos clientes confirman el último ítem al mismo tiempo | Media | `inventario.reservar` idempotente con lock atómico. Patrón ya usado en `cobros`. |
| 3 | Catálogo público debe poder mostrar "agotado" en tiempo real | Media | El `cf-worker` cachea catálogo + suscribe a `inventario.stock.bajo_minimo` para invalidar. O polling cada N min (más simple). |
| 4 | Sin datos del cliente = no se le puede avisar si su pedido se cancela por algo | Alta inherente al modelo | El cliente lo asume. La PWA puede mostrar "ver estado de mi pedido" si guarda el código localmente. Si pierde el código, pierde el pedido. |
| 5 | Reclamaciones presenciales únicamente | Media | El cliente vuelve con código o producto. Para vapers/barrio es razonable. |
| 6 | El usuario dueño tiene que poder ver "los pedidos del día" | Baja | Reuso de `comandero` o vista admin nueva. Diferir a v2 si en v1 vale `pedidos.listar`. |
| 7 | Multi-vertical (panadería sin checkbox edad, etc.) requiere configuración por proyecto | Baja | Implementar configuración por proyecto desde v1 incluso si vapers es el único. Cuesta lo mismo. |

---

## 8 · Lo que NO se incluye en v1

- ❌ `whatsapp-service` (no canal transaccional).
- ❌ `cliente`/CRM.
- ❌ Notificaciones outbound (templates Meta).
- ❌ Carrito conversacional via LLM.
- ❌ Pasarela de pago online (`pago-stripe`, RedSys, Bizum, PayPal).
- ❌ Envío a domicilio + repartidor + tracking.
- ❌ Direcciones + geolocalización.
- ❌ Devolución/cancelación canónica (todo presencial).
- ❌ Búsqueda con RAG.
- ❌ Multi-idioma.
- ❌ Login de cliente en PWA.
- ❌ Dashboard de métricas de negocio (uso `pedidos.listar` y `cobros.list` para v1).

Todos quedan como deuda explícita para v2/v3 cuando emerja necesidad
real.

---

## 9 · Camino propuesto para implementación

### Fase 0 — Cerrar las 5 decisiones abiertas (30 min, sin código)

Cerrar 6.1-6.5 con el usuario.

### Fase 1 — Módulo `inventario` (3-4h)

Módulo nuevo POC2. Schema, persistencia
`data/projects/{slug}/inventario.json`, tools canónicas, eventos
canónicos, tests por capa.

### Fase 2 — Strategy `tienda-online` + tool `pedido.generar_codigo_recogida` (1-2h)

Añadir strategy en `cuentas-canales/strategies/tienda-online.js`.
Añadir tool `pedido.generar_codigo_recogida` en `pedidos`.

### Fase 3 — Módulo `verificacion-edad` (30 min)

Mini módulo con 1 tool.

### Fase 4 — Adaptación PWA pública (4-6h)

Según decisión 6.1:
- A: extender `carta-digital`.
- B: crear `tienda-publica` clonando.

Componentes Svelte nuevos + adaptación `cf-worker` + endpoints públicos.

### Fase 5 — Configuración inicial proyecto vapers (2-3h)

Crear `data/projects/vapers/...` con todos los archivos JSON iniciales.
Cargar primer catálogo via `menu-generator` legacy con texto dictado
desde factura del proveedor.

### Fase 6 — Tests + audit runtime end-to-end (1-2h)

Smoke test: cliente entra a PWA → compone carrito → confirma → recibe
código → dependiente busca por código → cobra → cierra.

### Fase 7 — Cierre

- Actualizar `CLAUDE.md` con la nueva vertical.
- Bump documentación de subsistemas si aplica.
- Cerrar este doc con cabecera ✅ cuando se implemente.
- Commit + push a la rama designada.

**Total estimado**: 12-18h en 2-3 sesiones.

---

## 10 · Cómo arrancar la próxima sesión

Mensaje sugerido literal:

> *"Vamos a implementar la vertical de tienda PWA sin datos. Lee
> `arquitectura/decisiones/propuestas/vertical-tienda-pwa-sin-datos.md`
> entero. Sigue el guion en
> `_arranque-vertical-tienda-pwa-sin-datos.md`."*

El guion del arranque hace que la próxima conversación:
1. Verifique el estado actual del repo y los módulos reusables.
2. Te haga las **5 decisiones abiertas** restantes.
3. Para y pide tu OK antes de Fase 1 (módulo inventario).
4. Itera fase por fase pidiendo OK entre cada una.

---

## 11 · Relación con otros contratos y propuestas

| Documento | Cómo se relaciona |
|---|---|
| `tools.contract.json` v1.2.1 | Los 3 módulos nuevos siguen el shape canónico. Auto-wire los enchufa al LLM, UI y bus. |
| `module-rewrite.contract.json` (POC2) | `inventario` y `verificacion-edad` siguen el patrón POC2. |
| `events.contract.json` | Eventos canónicos del nuevo módulo respetan naming + idioma. |
| `errors.contract.json` | Errores canónicos desde día 1. |
| `extensibilidad-modular.contract.json` | La vertical materializa "añadir vertical sin reescribir el núcleo". |
| `cajones-context-partitioning.contract.json` | El blueprint de PWA (si aplica) activa `cajones_enabled: true`. |
| `migracion-menu-generator-blueprint.md` | Sinergia: cuando menu-generator se migre, la carga inicial de catálogo es más fluida. |
| `migracion-agentes-blueprint.md` | Sinergia: los 4 agentes marketing siguen invocables vía evento canónico — cuando se migren, no cambia nada para esta vertical. |

---

## 12 · Visión multi-vertical (después de vapers)

Una vez vapers funcione, la misma infraestructura sirve para:

| Vertical | Cambios respecto a vapers |
|---|---|
| **Panadería** | Sin checkbox edad. Expiración stock 3h (productos perecederos). Catálogo cambia diario (carta-scheduler útil aquí). |
| **Floristería** | Sin checkbox edad. Variaciones por ramo/centro/maceta. Sigue el mismo patrón. |
| **Carnicería** | Sin checkbox edad. Stock por peso (gramos), no unidades — adaptación menor en `inventario` para soportar magnitud. |
| **Frutería** | Sin checkbox edad. Stock por peso. Carta-scheduler para "frutas de temporada". |
| **Quiosco/estanco** | Checkbox edad (tabaco). Mismo patrón que vapers. |

**Todo es configuración del `project_id`, no código nuevo**.

---

## 13 · Frase resumen para retomar

**Vertical tienda PWA sin datos: cliente anónimo abre PWA, compone
carrito local en el navegador, confirma → backend genera código de
recogida + QR → cliente pasa por tienda física → dependiente busca por
código, prepara, entrega, cobra en efectivo. Cero datos personales →
RGPD cero. Caso piloto vapers; visión multi-vertical para panadería,
floristería, carnicería, frutería, estanco. Reuso masivo de pizzepos:
6 blueprints subsistema-carta + 8 JS POC2 (productos, categorías,
variaciones, tarifas, pedidos, cuentas, cuentas-canales, cobros) +
transversales (staff-manager, facturas, pdf-viewer, scheduler) + 4
agentes marketing legacy (vía bus). Módulos NUEVOS solo 3: `inventario`
(stock + alertas + reservas con expiración), `verificacion-edad` (mini
checkbox), módulo PWA pública (`tienda-publica` o extensión
`carta-digital`). Total v1 ~12-18h en 2-3 sesiones. 5 decisiones
abiertas a cerrar: path PWA, anti-fraude código, cuándo menu-generator,
gate edad antes/después catálogo, expiración stock fija/configurable.**
