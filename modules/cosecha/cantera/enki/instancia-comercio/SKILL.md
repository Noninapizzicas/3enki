---
name: instancia-comercio
description: Alta instancia comercio-tg. Proyecto, chat, bot, catalogo.
version: 1.0.0
author: orus
license: MIT
fuente: enki
dominio: comercio
lente_dominio: diseño
lente_tarea: alta
tags: [comercio-tg, instancia, alta, proyecto, bot, catalogo]
metadata:
  hermes:
    tags: [comercio-tg, instancia, alta, proyecto, bot, catalogo]
    related_skills: [comercio-tg, telegram-por-proyecto, enki-proyecto-onboarding]
---

# Alta de INSTANCIA de comercio-tg (negocio nuevo = proyecto Enki)

## When to Use
Cuando el dueño diga "monta la instancia de X" (vapers, pan, o negocio nuevo) —
la ruta de alta del proyecto Enki que corre la vertical comercio-tg.

> **Qué es.** El paso a paso para que un negocio nuevo nazca como INSTANCIA
> de la vertical comercio-tg: un proyecto Enki propio con su chat, su bot,
> su catálogo y su carta web.
> **No reinventa nada**: usa las piezas que ya existen (enki-alta-proyectos,
> telegram-por-proyecto, la plantilla de comercio-tg y el onboarding del repo).

## El RITUAL DE ALTA (5 pasos ordenados, todos canónicos)

### 1 · PROYECTO — vía canónica `project.create`

```
evento: project.create { name, description, color?, icon? }
→ project-manager: carpeta + DB 7-tablas + UUID registro
```
- Si el evento da timeout: verificar en BD, no fiarse del timeout
  (pagado en vivo: el alta llega aunque la respuesta muera)
- NUNCA a mano antes de intentar el evento (la BD a mano falla el esquema)
- VERIFICAR: `conversation.list` del UUID responde (no send directo)

### 2 · ONBOARDING del repo — skill enki-proyecto-onboarding
- permisos de `/home/admin/3enki/` + simlink `~/3enki` + rama git del proyecto
- Se ejecuta tras el alta SI el chat del proyecto va a tocar el repo

### 3 · BOT DE TELEGRAM — skill telegram-por-proyecto
```
a. dueño crea bot en @BotFather → pasa token
b. curl getMe → {ok:true} verifica token → username = botName
c. credential.create.request {provider:TELEGRAM, level:BOT/CUSTOM,
   identifier:<botName>, api_key:<token>}  (sin editar .env a mano)
d. telegram.bridge.vincular.request {botName, project_id=<UUID real>}
e. el dueño pulsa /start en el bot → registro.json gana conversación
   (evidencia de alta completa — sin /start no hay chat real)
```

### 4 · CATALOGO — plantilla del CONFIG de carta-digital
```
CONFIG = { nombre_negocio, project_slug,
   canales: { whatsapp?: tel, telegram?: botName },
   pedido_endpoint, pago_online... }
+ alta de productos: texto/JSON con foto → producto-manager (prisma)
```
- Sin inventar productos: los que el dueño/proveedor pase
- Los botones del chat se pintan de los canales configurados (data, no código)

### 5 · MARCA — look-reels (opcional pero recomendado)
- logo + colores + 2-3 reels de referencia → muestras A/B/C → look elegido
- se fija en marca.md de la instancia (editor-reels la lee siempre)

## DECISIÓN DEL DUEÑO (nov-2026): el alta corre EN el chat del proyecto

"Lo hacemos ya todo por el chat del proyecto" (Paco): el CHAT Enki del
negocio es quien ejecuta su propio alta (bot, catálogo, marca) con las
skills en cantera — NO yo desde el canal externo. Rol de Hermes:

1. **Pasar al chat del proyecto** el encargo concreto + las 2 skills de
   la vertical (`comercio-tg`, `instancia-comercio`) — vía MQTT
   `chat.message.saved` (la vía probada de enki-operacion-proyecto).
2. **Copiar las skills a la cantera** (el chat no ve mi arsenal):
   `modules/cosecha/cantera/enki/<skill>/SKILL.md` + chmod g+w.
3. El chat del proyecto ejecuta el ritual (canónigos ya probados) y
   verifica él mismo (registro.json, .env, journal) — el dueño pulsa
   /start y la tienda queda viva.

**Estado del proyecto rapitvapers (29-oct-2026)**:
- Proyecto creado POR EL DUEÑO (BD viva, UUID `32d4b9e9-3b2f-4711-9390-cebc733a4ffc`)
- Bot creado por el dueño: **Rapitvapers_bot** (token verificado con getMe: ok:true)
- Credencial YA escrita en `.env` (TELEGRAM_API_KEY_BOT_Rapitvapers_bot — verificado con grep) — vía credential.create del external (timeout del wrapper pero acción ejecutada, patrón conocido)
- PENDIENTE (a cargo del chat del proyecto): vínculo bot→proyecto en
  registro.json + /start del dueño + catálogo + carta PWA

## Los pasos que NO se repiten por instancia (ya plantilla)

- la carta-digital PWA (se serve de la plantilla al repo del proyecto)
- el Caddyfile (la ruta /a/<slug> sale del despliegue estándar)
- el bridge PEDIDO (reflejo genérico sobre el CONFIG de la instancia)
- el flujo venta: prisma/carrito → cuenta → cobro (core abstracto)

## Verificación final de instancia viva (checklist)

1. proyecto en BD (projects del core) — UUID real
2. credencial bot en data/.env (TELEGRAM_API_KEY_BOT_<botName>)
3. vínculo en registro.json con UUID (no slug)
4. conversación creada (el /start del dueño — en registro.json)
5. carta responde en la ruta del proyecto con su CONFIG (su canal)
6. un pedido de prueba va: carta → bot → bridge → POS → aviso staff

## Historia
- 2026-11: creada como companion de comercio-tg (la infra) para ejecutar
  el ALTA de cada instancia — completando el ritual original.