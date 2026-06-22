# Runbook — Alta de WhatsApp (Meta Cloud API) por proyecto

> Repetible por cada tienda. El **código ya está** (`modules/whatsapp-bot/` + `meta-cloud-client.js`).
> Lo que aquí se hace es **operativo**: dar de alta el número en Meta y conectar credenciales + config.
> Todo lo de WhatsApp es **por proyecto** (credenciales project-only, ver credential-manager v2.1.0).

Sustituye `<slug>` por el slug del proyecto (ej. `nonina`). Dominio del sistema: `enki-ai.online`.

---

## Datos que vas a obtener de Meta (apúntalos)

| dato | de dónde | ejemplo |
|---|---|---|
| `phone_number_id` | WhatsApp → API Setup | `123456789012345` |
| `waba_id` (WhatsApp Business Account ID) | WhatsApp → API Setup | `987654321098765` |
| `display_number` (el número visible) | el número que registras | `+34600000000` |
| **access token PERMANENTE** | Business Settings → System Users | `EAAG...` (largo) |
| **verify token** | te lo INVENTAS tú (string secreto) | `enki-<slug>-7h3k...` |

---

## Parte A — Lado Meta (panel developers.facebook.com)

1. **App + producto WhatsApp**: crea una app tipo *Business* y añádele el producto **WhatsApp**.
2. **Registra el número del negocio** (WhatsApp → API Setup) y verifícalo por SMS/llamada.
   Anota `phone_number_id` y `waba_id`.
3. **Token PERMANENTE** (clave — el del panel caduca a 24 h):
   Business Settings → **System Users** → crea un system user → *Generate token* sobre la app,
   con permisos **`whatsapp_business_messaging`** + **`whatsapp_business_management`**. Ese es el
   access token de producción.
4. **Webhook** (WhatsApp → Configuration → Webhook):
   - Callback URL: `https://enki-ai.online/modules/whatsapp-bot/whatsapp/webhook/<slug>`
   - Verify token: el string que inventaste (mismo que guardarás en Enki, paso B.2).
   - Pulsa *Verify and save* → Meta hace un `GET` y el bot responde el `hub.challenge`.
   - **Subscribe** al campo **`messages`**.

> El webhook llega por Caddy `/modules/*` → gateway → `whatsapp-bot.handleWebhookVerify/Event`.
> No hay que tocar Caddy ni abrir puertos nuevos.

---

## Parte B — Lado Enki (credenciales + config del proyecto)

### B.1 — Access token (credencial `META_WHATSAPP`, nivel PROJECT)
Guárdala (UI de credenciales o `credential.create`):
```
provider   = META_WHATSAPP
level      = PROJECT          # OBLIGATORIO project-only; GLOBAL/CLIENT/CUSTOM → 400
identifier = <slug>
api_key    = <access token permanente de Meta>
```
→ se materializa como env **`META_WHATSAPP_API_KEY_PROJECT_<slug>`** (lo que lee el bot).

### B.2 — Verify token del webhook (credencial `META_WHATSAPP_VERIFY_TOKEN`, nivel PROJECT)
```
provider   = META_WHATSAPP_VERIFY_TOKEN
level      = PROJECT
identifier = <slug>
api_key    = <el mismo verify token que pusiste en Meta, paso A.4>
```
→ se materializa como env **`META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_<slug>`**.

> Al guardar cualquiera de las dos, el bot recibe `credential.saved` y rehidrata el proyecto.

### B.3 — Config del proyecto (`data/projects/<slug>/config/project.json`)
Rellena el bloque `whatsapp` (sustituye el `<PENDIENTE>`):
```json
{
  "whatsapp": {
    "waba_id": "987654321098765",
    "phone_number_id": "123456789012345",
    "display_number": "+34600000000",
    "webhook_path": "/whatsapp/webhook/<slug>",
    "pwa_url": "https://enki-ai.online/shop/<slug>"
  },
  "telegram": { "botName": "<bot del staff>", "chatId": "<chat del staff>" }
}
```
El bot construye el mapping `phone_number_id → <slug>` desde aquí. **Re-activa el proyecto**
(o reinicia el core) para que relea el `project.json`.

---

## Parte C — Verificación end-to-end

1. **Operativo**: `GET https://enki-ai.online/modules/whatsapp-bot/health` lista el proyecto como
   operativo (phone_number_id no `<PENDIENTE>` + token presente). Internamente: `_proyectoOperativo(<slug>)`.
2. **Entrante**: escribe "hola" al número del negocio → el bot responde con el link de la PWA
   (`pwa_url`). Confirma que llega el webhook (logs `whatsapp-bot.webhook.verified` / `.message`).
3. **Pedido**: desde la PWA (`/shop/<slug>`) arma un carrito y pulsa enviar (wa.me con `#P1`) →
   el bot **re-tasa** server-side, crea el pedido (`pedido.crear-tienda`), responde al cliente con
   el **código de recogida** y avisa al staff por Telegram.
4. **Listo**: cuando cocina marca el pedido listo (`cocina.pedido_listo`), el bot avisa al cliente
   "ven a recoger".

---

## Notas / gotchas

- **El token del panel caduca a 24 h** → usa SIEMPRE el de System User (A.3) para producción.
- **Ventana de 24 h**: con `sendText` solo puedes escribir al cliente dentro de las 24 h desde su
  último mensaje. Para outbound fuera de ventana (p. ej. "ven a recoger" si pasó >24 h) hace falta
  **`sendTemplate`** con plantilla aprobada por Meta → hoy **diferido** (no implementado). En el
  flujo feliz (el cliente acaba de escribir) `sendText` basta.
- **Aislamiento multi-tienda**: las credenciales son project-only por invariante (credential-manager
  v2.1.0). Un token global no se puede guardar ni resolver para estos providers.
- **Transporte**: `config.transport = "meta"` (Cloud API oficial, el definitivo). `openwa`
  (self-hosted por el bus) es un stopgap alternativo, no necesario con Meta.
