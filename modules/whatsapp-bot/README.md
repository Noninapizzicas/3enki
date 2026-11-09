# whatsapp-bot — Servicio estándar de WhatsApp por proyecto

> **Contrato público del módulo.** Cómo se conecta cualquier otro módulo de Enki
> con WhatsApp: eventos que emite, tools que expone, config que necesita y credenciales.
> La **lógica de negocio por proyecto** (qué responder, qué ofrecer, cómo gestionar cada
> mensaje) NO vive aquí: vive en el módulo del proyecto/vertical que consume este servicio.
> `whatsapp-bot` es el transporte genérico (el "cómo"); el negocio decide el "qué".

---

## Qué es

Puente único a **WhatsApp Cloud API (Meta)**. Multi-proyecto: un mismo módulo sirve
todos los proyectos, cada uno con su número de teléfono (WABA) y sus credenciales.

- **Transporte:** Meta Cloud API por HTTP (sin navegador, sin Chromium).
- **Multi-tenant:** mapeo `phone_number_id → project_slug`.
- **Credencial por proyecto** gestionada por `credential-manager` (no en este módulo).

---

## 1 · Cómo se conecta un módulo (resumen)

Un módulo que quiera usar WhatsApp elige **una de dos vías** (o ambas):

| Vía | Dirección | Mecanismo | Para qué |
|---|---|---|---|
| **Outbound** (enviar) | Tu módulo → cliente | Publica `whatsapp.enviar` (tool) | Avisos, confirmaciones, contenido, re-engagement |
| **Inbound** (recibir) | Cliente → tu módulo | Se suscribe a `whatsapp.mensaje.recibido` / `whatsapp.pedido.detectado` | Reaccionar a lo que el cliente escribe |

**Regla de oro:** `whatsapp-bot` decide **cómo** se envía/recibe. Tu módulo decide
**qué** y **cuándo**. No dupliques lógica de transporte.

---

## 2 · Tools que expone (outbound)

### `whatsapp.enviar`
Enviar texto plano al cliente.

```json
{ "project_slug": "nonina", "to": "34600000000", "text": "Hola, tu pedido está listo" }
```
- `to`: número E.164 **sin `+`**.
- `text`: máx 4096 chars.
- Devuelve `{ status: 200, data: { message_id, project_slug } }`.
- Errores conocidos: `INVALID_INPUT`, `RESOURCE_NOT_FOUND`, `AUTHENTICATION_REQUIRED`, `UPSTREAM_UNREACHABLE`, `RATE_LIMITED`.

### `whatsapp.enviar_plantilla`
Enviar una **plantilla aprobada por Meta** (única vía para escribir FUERA de la
ventana de 24h — re-engagement, recordatorios, avisos tardíos).

```json
{
  "project_slug": "nonina", "to": "34600000000",
  "template": "pedido_listo", "language": "es",
  "body_params": ["Juan"]
}
```
- `template`: nombre EXACTO de la plantilla aprobada en Meta.
- `body_params`: rellenan `{{1}}`, `{{2}}`... en orden.
- Devuelve `{ status: 200, data: { message_id, project_slug, kind: "template" } }`.

### `whatsapp.enviar_media`
Enviar **media por link** (URL pública). Tipos: `image | video | audio | document`.
Meta descarga la URL en su red al entregar — el link debe ser **públicamente accesible**.
Vía para mandar imágenes de producto, PDFs (carta), notas de voz pre-grabadas, etc.

```json
{
  "project_slug": "nonina", "to": "34600000000",
  "type": "image",
  "link": "https://tu-dominio/a/shop/nonina/img/pizza.jpg",
  "caption": "Pizza Margarita"
}
```
- `type` y `link` son obligatorios.
- `filename` y `mime_type`: solo para `document` (nombre visible + tipo MIME).
- `caption`: image/video/document (leyenda).
- Devuelve `{ status: 200, data: { message_id, project_slug, kind: "media_<type>" } }`.

### `whatsapp.enviar_ubicacion`
Enviar **ubicación** al cliente (un punto del mapa). Sirve para mandar la dirección
del negocio, puntos de recogida, etc.

```json
{
  "project_slug": "nonina", "to": "34600000000",
  "longitude": -3.7038, "latitude": 40.4168,
  "name": "Nuestra Pizzeria", "address": "Calle Mayor 1"
}
```
- `longitude` y `latitude`: obligatorios (números).
- `name` / `address`: opcionales (se muestran sobre el pin).
- Devuelve `{ status: 200, data: { message_id, project_slug, kind: "location" } }`.

### `whatsapp.enviar_interactivo`
Enviar **botones quick-reply** o **lista/menú** al cliente. Da opciones para responder
con un toque, sin escribir. Ideal para menús, confirmar, elegir opción, etc.

**Botones** (`kind: "buttons"`, máx 3):
```json
{
  "project_slug": "nonina", "to": "34600000000", "kind": "buttons",
  "header": "Hola", "body": "¿Qué quieres hacer?", "footer": "Toca una opción",
  "buttons": [{ "id": "pedir", "title": "Pedir" }, { "id": "carta", "title": "Ver carta" }]
}
```

**Lista** (`kind: "list"`):
```json
{
  "project_slug": "nonina", "to": "34600000000", "kind": "list",
  "body": "Elige una carta",
  "list": { "button": "Ver cartas", "sections": [{ "title": "Pizzas", "rows": [{ "id": "p1", "title": "Margarita" }] }] }
}
```
- Devuelve `{ status: 200, data: { message_id, project_slug, kind: "interactive_<kind>" } }`.

### `whatsapp.enviar_encuesta`
Enviar **encuesta** (poll nativo de WhatsApp):
```json
{
  "project_slug": "nonina", "to": "34600000000",
  "question": "¿Cómo valoras tu pedido?", "options": ["Perfecto", "Bien", "Regular"]
}
```
- `options`: de 2 a 10. Devuelve `{ status: 200, data: { message_id, project_slug, kind: "poll" } }`.

### `whatsapp.enviar_catalogo`
Enviar el **catálogo nativo de WhatsApp** (Commerce Manager de Meta). El catálogo y sus
productos viven en el Commerce Manager del WABA de Meta; Enki solo envía el mensaje.
NO se mezcla con los catálogos de Enki.

```json
{
  "project_slug": "nonina", "to": "34600000000",
  "catalog_id": "ID_CATALOGO_META", "text": "Mira nuestra carta"
}
```
- `catalog_id` (obligatorio): id de Meta del catálogo conectado al número. Puede pasarse o
  ponerse en la config del proyecto (`whatsapp.catalog_id`).
- `text`: presentación del catálogo.
- Devuelve `{ status: 200, data: { message_id, project_slug, kind: "catalog" } }`.

---

## 3 · Eventos que emite (inbound / observabilidad)

| Evento | Payload | Cuándo | Para qué |
|---|---|---|---|
| `whatsapp.mensaje.recibido` | `{ project_slug, phone_number_id, from, message_type, message_id, has_text, interaction, media, location }` | Cada mensaje entrante | Tu módulo reacciona al texto/estado |
| `whatsapp.pedido.detectado` | `{ project_slug, from, items[], total_centimos, message_id }` | El parser reconoció un pedido en el mensaje | Prevenir/pre-procesar |
| `whatsapp.mensaje.enviado` | `{ project_slug, to (enmascarado), message_id, kind }` | Envío exitoso (kind: `text` \| `template` \| `media_<tipo>` \| `location` \| `interactive_<tipo>` \| `poll` \| `catalog` \| `auto`) | Audit / tracking |
| `whatsapp.envio.fallido` | `{ project_slug, to (enmascarado), error_code, error_message }` | Envío fallido | Retry / alertas |

**Media entrante:** cuando el cliente manda una foto/audio/vídeo/documento, el evento
`whatsapp.mensaje.recibido` incluye `media: { type, id, mime_type, sha256, link?, filename?, caption?, duration? }`.
El `id` de Meta permite rescatar el media vía Graph API (GET `/{id}` con el token del proyecto).
No se descarga aquí: el módulo de negocio decide si lo guarda/analiza/deriva.

**Ubicación entrante:** cuando el cliente comparte un punto del mapa (type `location`), el evento
incluye `location: { type, longitude, latitude, name?, address? }`. Útil para reparto/recogida/geolocalización.

**Interactivo / encuesta entrantes:** cuando el cliente responde a un botón, lista o encuesta, el evento
incluye `interaction`:
- `{ type: "button", id, title }` — pulsó un botón quick-reply.
- `{ type: "list", id, title, description? }` — eligió una opción de una lista.
- `{ type: "poll", poll_id, question }` — respondió a una encuesta.
- `{ type: "flow", id }` — respuesta de un formulario flow.

`text` se mantiene con el título elegido para retro-compat; `interaction` da la estructura exacta.

Los consumidores se suscriben por `eventBus` (patrón estándar de Enki).

---

## 4 · Flujo de pedido por WhatsApp (lo que ya hace él solo)

```
cliente manda pedido (formato #P1 de la PWA o texto legacy)
  → whatsapp-bot parsea (whatsapp.pedido.detectado)
  → SI trae #P1: RE-TASA contra la carta del server (seguridad: precio del cliente IGNORADO)
  → publica pedido.crear-tienda → pedidos persiste (tipo: tienda, sin cuenta_id)
  → pedido.creado → whatsapp-bot confirma al cliente + notifica al staff (Telegram)
  → cocina.pedido_listo → whatsapp-bot avisa "ven a recoger" (plantilla o texto)
```

- **Re-tasado server-side:** el precio que se cobra sale SIEMPRE de la carta del
  servidor, nunca del texto que escribe el cliente.
- **Seguridad anti-fraude:** el dependiente confirma por nº de WhatsApp + código de
  recogida. La clave no viaja por texto.

---

## 5 · Config de conexión por proyecto

En el config del proyecto (`data/projects/<slug>/config/config.json`, bloque `whatsapp`):

```json
{
  "whatsapp": {
    "phone_number_id": "1228238363699933",
    "waba_id": "1665881344630296",
    "display_number": "+34600007511",
    "webhook_path": "/whatsapp/webhook/nonina",
    "pwa_url": "https://tu-dominio/shop/<slug>",
    "telegram": { "chatId": 12345, "botName": "tu_bot" },
    "template_listo": "pedido_listo",
    "catalog_id": "ID_CATALOGO_META"
  }
}
```

- `phone_number_id` y `waba_id`: vienen de Meta Cloud (WABA del número).
- `template_listo`: plantilla aprobada para el aviso "ven a recoger" (permite escribir
  también pasadas 24h). Opcional; sin ella se usa texto.
- `catalog_id`: id de Meta del catálogo nativo del número (Commerce Manager). Opcional;
  se usa por `whatsapp.enviar_catalogo` si no se pasa en la llamada.
- Datos **no secretos**: por eso van en el config, no en credential-manager.

**Gestionable desde la app** vía UI handlers `whatsapp.get_config` / `whatsapp.set_config`
(sin editar JSON a mano).

---

## 6 · Credenciales (secrets → credential-manager)

| Variable | Nivel | Qué es |
|---|---|---|
| `META_WHATSAPP_API_KEY_PROJECT_<slug>` | PROJECT | Token de WhatsApp Cloud API del proyecto |
| `META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_<slug>` | PROJECT | Token de verificación del webhook (lo pegas en Meta) |

- Se inyectan en `process.env` por `credential-manager` al arrancar (lee `data/.env`).
- **Nunca escribir valores en código ni en docs.** Rotar el token = guardar de nuevo
  vía credential-manager → el módulo se rehidrata en caliente (`credential.updated`).

---

## 7 · Webhook (registro en Meta)

URL pública que se pega en el panel de Meta Cloud (webhook del WABA):

```
https://<dominio>/whatsapp/webhook/<slug>
```

- `GET` → verificación `hub.verify_token` (compara con el verify_token de la credencial).
- `POST` → entrega de mensajes (responde 200 rápido; procesa fire-and-forget).
- Caddy reescribe `/whatsapp/*` → `/modules/whatsapp-bot{path}` (ver `deployment/caddy/Caddyfile.vps`).

---

## 8 · Health check

```
GET /modules/whatsapp-bot/health
→ { module, version, projects_mapped, projects_operativos:[{project_slug,phone_number_id,display_number}], pending_pedidos }
```

`projects_operativos` = proyectos con credencial + config completas.

---

## 9 · Ampliaciones pendientes (no implementadas aún)

- **Rescate/descarga del media entrante:** el media se captura y viaja en `whatsapp.mensaje.recibido`
  (con su `id` de Meta), pero el módulo no ofrece aún una tool para descargar el binario via Graph API
  (`GET /<id>`). Si un módulo de negocio necesita el archivo (guardar foto, transcribir audio), se añade
  una tool `whatsapp.obtener_media` que resuelva el id → binario.
- **Bot de respuesta por proyecto:** la lógica de "qué responder a cada mensaje" por
  negocio es responsabilidad de un módulo de proyecto que consuma los eventos de §3.
  Aquí solo está el detección de pedido en formato PWA.

Si un módulo necesita estas capacidades, ampliar `whatsapp-bot` (media) + crear el
módulo de negocio del proyecto (respuesta) — sin duplicar el transporte.
