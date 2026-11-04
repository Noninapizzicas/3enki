---
name: comercio-tg
description: Vertical comercio generico por Telegram. Producto en bots.
tags: [comercio, telegram, vertical, abstracta, carrito, cobro, prisma]
fuente: enki
dominio: comercio
lente_dominio: diseño
lente_tarea: abstraccion
---

when-to-use: "Cuando se quiera montar una TIENDA por bot de Telegram para cualquier tipo de producto (no solo comida), o al dar alta de negocio a la vertical comercio-tg."
version: 1.0.0
author: orus
license: MIT
metadata:
  hermes:
    tags: [comercio, telegram, vertical, abstracta, carrito, cobro, prisma]
    related_skills: [pizzepos-mapa, telegram-por-proyecto, editor-reels, look-reels]

# comercio-tg — tienda de CUALQUIER producto vendida en el bot de Telegram

## When to Use
Cuando se quiera montar una tienda por bot de Telegram para CUALQUIER tipo de
producto (no solo comida), o al dar alta de un negocio en esta vertical.

- **Qué es.** La abstracción de the-pirate (pizzería/carta/WhatsApp) hacia un
  patrón de comercio universal: el CLIENTE compra hablando en el bot de
  Telegram del negocio — sin app, sin web de pago.

## 1 · La historia (la abstracción)

```
anterior (the-pirate nicho FOOD)              → vertical abstracta
WhatsApp como canal único                     → telegram-service/bridge (multi-bot por proyecto YA en core)
carta-manager (familias pizza, menú)          → catálogo universal = prisma/*
comandero/POS                                 → prisma/cuenta + prisma/cobro (7 métodos)
notificador-pedidos (Telegram v1)             → avisos nativos del bot del proyecto
```

**NO hereda** (es nicho restaurante): carta-manager, cocina, pase-cocina,
comandero, tarifas (canales de venta food). El motor de VENTA sí hereda:

- `prisma/producto-manager` (ProductoUniversal: cualquier tipo)
- `prisma/carrito` (buffer de venta unificado)
- `prisma/cuenta` (cuenta universal = ticket)
- `prisma/cobro` (efectivo/tarjeta/bizum/transferencia/mixto/link/qr)
- `prisma/escaparate` (proyección pública)
- `prisma/costeador` (margen/pvp/precio)

## 2 · Arquitectura de la vertical

**CORRECCIÓN DE DISEÑO (auditada por el chat de la instancia, nov-2026)**:

1. **Las skills viven en DOBLES sitios**: repo (`~/3enki/`) para git, y **DEPLOY**
   (`/opt/enki/modules/cosecha/cantera/enki/`) para que el chat las vea — el chat
   NO ve la cantera del repo, solo la del deploy (490 skills). Copiar a AMBOS y
   chmod g+w + chown www-data (el pitfall del permiso 644 del onboarding).
2. **El canal Telegram NO es un bloque "canales" nuevo en el CONFIG**: el CONFIG
   real de carta-digital lleva `opciones_visualizacion` con `whatsapp_telefono`,
   `pedido_endpoint`, `pago_online` (y "canales" en tarifas significa otra cosa:
   qué carta sirve cada canal). El cambio real: **campo nuevo
   `opciones_visualizacion.telegram_bot`** — la PWA pinta el botón
   "Pedir por Telegram" si existe. El bot ya trabaja por el vínculo
   (telegram-bridge): el canal es el bot vinculado, no un campo redondo.
3. **El proyecto nace vacío** (storage solo `_propiocepcion.json` + destilador +
   pago/conciliación): la carta, productos y tarifas los monta el chat del
   proyecto CON los datos reales del dueño (nombre+precio+grupos por producto).
   Sin lista → nada montado (el chat se niega a inventar — correcto).

```
CLIENTE (TG) → bot del negocio (telegram-service, polling)
  → comando inline: /menu · /carta · /pedir → INLINE KEYBOARDS del nicho
  → prisma/carrito (añade/quita/ver)
  → pedido formal: prisma/cuenta + prisma/cobro (elegido en el chat)
  → avisos: staff por telegram.send_message del bot del proyecto (notificador v2)
```

**Los 4 módulos que nacen** (los otros se cargan con rebanadas del core):

1. `plantilla-catalogo` — alta de negocio en 5 min: texto/JSON de productos
   + fotos → validación → `producto-manager` (nada de LLM en el alta)
2. `nicho-adapter` — del catálogo abstracto a INLINE KEYBOARDS de telegram
   (paginación por teclado, foto por producto, precio y badge por línea)
3. `carrito-tg` — reflejo CRUD del carrito en el chat (el buffer de venta en
   prisma; el chat solo presenta y confirma)
4. `checkout-tg` — cierre del pedido: método de pago (link pago-gateway,
   transferencia, "pago al recoger") + generación del ticket (texto o PDF)

## 2a · El canal Telegram de pedidos (v1 CONSTRUIDO, nov-2026)

El patrón de the-pirate (WhatsApp: la carta compone por ids → el servidor re-tasa →
`pedido.crear-tienda`) aplicado a Telegram **choca con un límite de la plataforma**:
Telegram no abre un chat con texto precargado (`t.me/<bot>?start=` son 64 chars).
Inventar un "pegar el pedido a mano" es fricción fea. La solución construida:

```
carta (buildOrderItems, POR IDS, sin precios)
  → POST /tienda/telegram/borrador/<slug>      [módulo pedido-telegram]
  → { codigo: '5S9TRB', url: 't.me/<bot>?start=p_5S9TRB' }
  → el cliente abre el enlace → Telegram manda /start p_<codigo>
  → RE-TASADO contra la carta del canal digital (precios del navegador ignorados)
  → pedido.crear-tienda { canal_origen: 'telegram', cliente_telegram: chatId }
  → confirmación en el chat del cliente
```

- **Módulo**: `pizzepos/pedido-telegram` — simétrico a `tienda-api` (web) y
  `whatsapp-bot` (WhatsApp). Sin tools del LLM.
- **Identidad sin login**: el `chatId` es el ancla del cliente (sustituye al
  teléfono de WhatsApp). Eso es lo que pedía el dueño: "que el Telegram sirva
  para loguear al cliente sin pedirle el teléfono".
- **Invariantes**: un código = un pedido (se consume al abrirse, TTL 30 min,
  persistido para sobrevivir a un restart); el body del borrador NO lleva precios
  (se verifica en el test: `PRECIOS_EN_BODY=false`).
- **El bridge NO debe reenviar `/start p_<codigo>` al chat** (si no, el LLM
  contesta ADEMÁS de la confirmación del pedido). Guard en `telegram-bridge`:
  comando `start` con arg `p_…` y texto que sea exactamente `p_…` → `return`.
- **Activar por instancia = DATA**: `opciones_visualizacion.telegram_bot =
  "<botName>"` en el config de carta-digital del proyecto (fs.write por el bus,
  ruta `pizzepos/carta-digital/config.json` **sin** el prefijo `storage/` — con
  `storage/…` el módulo escribe en `storage/storage/…`) + republicar la carta.
- **Límite a tener presente**: escribir en `data/projects/<slug>/config/` (la
  config del PROYECTO) sigue prohibido para Hermes; la de la CARTA vive en
  `storage/pizzepos/carta-digital/config.json` y esa sí se escribe por el bus.

## 2b · La NATURALEZA de lo que se construye (la regla del dueño)

Lo que se está montando NO es una tienda: es la **INFRAESTRUCTURA
multi-tenant** de la que nacen infinitas tiendas, una por PROYECTO Enki:

| capa | qué es | se toca cuando... |
|---|---|---|
| **PLANTILLA** (infra) | carta-digital abstracta + schema canales + bloques de botones + plantilla-catalogo + bridge PEDIDO | una conducta nueva que sirva para TODAS |
| **INSTANCIA** (negocio) | proyecto Enki + su catálogo + su CONFIG + su marca + su bot + su ruta web | alta del negocio (SOLO data, nunca código) |

**La regla del diseño (dueño, 29-oct-2026)**: ninguna pieza de la
PLANTILLA se toca desde una INSTANCIA — la instancia solo CONFIGURA
(data). Si una instancia necesita conducta nueva, se cambia la
PLANTILLA para todas (nunca forks por negocio).

**Lo que ya existe y hace que escale sin trabajo**: enki-alta-proyectos
(alta automática de proyecto con BD+chat), telegram-por-proyecto (alta de
bot: token→credencial→vínculo UUID), Caddy (ruta por proyecto), el bus
(core/core-a: eventos iguales entre todas).

**Vagos/instancias candidatas ya hablados**: vapers (mercado verificado:
Elf Bar/Lost Mary + Bud Vape española con mega-puffs 8000/40000 caladas,
precios reales en tiendas ES) y pan. El PROYECTO decide luego hacia cual
se encamina — la plantilla es de cualquier producto.

## 3 · Instancias posibles (una plantilla, muchos negocios)

| instancia | catálogo | cobro típico |
|---|---|---|
| **THE PIRATE (pizzería)** | la carta actual | al recoger / bizum |
| **taller 3D/láser** | piezas bajo pedido con fotos | transferencia / link |
| **tienda maker** | filamento, herramientas | bizum / transferencia |
| cliente genérico sin web | texto + foto | a negociar |

## 4 · Reglas duras (lecciones del core ya pagadas)

- El **vínculo bot→proyecto usa UUID real** (nunca slug): resolver slug→UUID
  de la BD de conversaciones antes de vincular (skill telegram-por-proyecto)
- Respuestas del bot con chunks ≤4000 chars (el límite 4096 de Telegram)
- El canal del credential-manager guarda la credencial sin editar .env a mano
- El chat de Telegram NO existe hasta el `/start` del dueño (verificar en
  `registro.json` que aparece conversación = evidencia de alta completa)
- single-writer: todo cambio de catálogo/cuenta pasa por prisma (el bot solo
  proyecta y delega — nada de lógica de negocio en el adaptador de Telegram)

## 5 · Flujo de fabricación (cuando se monte un negocio)

1. **plantilla-catalogo**: dueño → texto/JSON → productos con foto
2. **nicho-adapter**: presentación en el chat del bot (inline keyboard por cat)
3. **carrito-tg + checkout-tg**: venta completa conversacional
4. **look-reels + editor-reels**: el material de marketing del negocio (los
   reels con el look de la marca para publicar y vender)
5. **brag** (opcional): vídeo de lanzamiento de la web del negocio

## 6 · Estado de esta vertical (historia)

- 2026-11: creada como abstracción de the-pirate (WhatsApp→TG).
- **La regla del dueño (29-oct-2026)**: esto es la **INFRAESTRUCTURA
  multi-tenant** — la PLANTILLA abstracta de la que nacen infinitas
  tiendas, una por PROYECTO Enki (su catálogo + su CONFIG de canales
  {whatsapp?/telegram?} + su marca + su bot + su ruta web).
  **La instancia SOLO configura (data); conducta nueva = se cambia la
  PLANTILLA para todas (nunca forks por negocio).**
- **SIN dominio propio** (decisión del dueño): la PWA vive en
  `enki-ai.online/a/<slug>` (Caddy) y el canal de pedido es el bot de
  Telegram (`t.me/<botName>`). El nombre comercial solo decide slug,
  botName y título de carta. Sin DNS ni hosting nuevo.
- **El ALTA corre EN el chat del proyecto** (nov-2026, "lo hacemos ya
  todo por el chat d l proyecto"): el chat Enki del negocio ejecuta su
  propio alta con las skills de la vertical copiadas a la cantera;
  Hermes solo pasa el encargo por MQTT + copia skills. Ruta completa en
  skill `instancia-comercio`.
- **El acoplamiento mínimo real** (verificado en el HTML de la carta de
  the-pirate): el canal vive en `CONFIG.whatsapp_telefono` con 10 usos
  condicionales (`if (CONFIG.whatsapp_telefono)` → botón WA + campo
  nombre + modos). La abstracción = sustituir ese campo por el schema de
  canales y pintar los botones que el negocio tenga configurados.
- **PRIMERA INSTANCIA DECIDIDA: RapidVapers** (vapers online Lorca).
  Mercado verificado sin inventar: ElfBar/LostMary (desechable 5.95,
  líquidos ELFLIQ 6.95-7.45, cartuchos 8.00) + **Bud Vape (ES)**:
  Wave 800=7.87 · MAX 8000=14.90 · SWITCH 40K=21.90 (megas solo 0mg por
  TPD). t.me/RapidVapers_bot LIBRE verificado. Bot a crear por el dueño
  en BotFather en el paso 3 del ritual.
- PENDIENTE: ejecutar el ritual (skill instancia-comercio) cuando el
  dueño dé el visto bueno y pase el token del bot.