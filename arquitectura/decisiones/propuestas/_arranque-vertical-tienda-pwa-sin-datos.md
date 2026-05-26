# Arranque vertical tienda PWA + WhatsApp escueto — guion para la próxima sesión

Este archivo NO es un contrato ni un plan — es **el guion literal** que tú
pegas al arrancar la próxima sesión para implementar la vertical tienda
PWA con WhatsApp escueto (caso piloto: vapers). Está diseñado para que
la otra conversación no improvise ni pierda contexto.

Doc maestro de referencia:
`arquitectura/decisiones/propuestas/vertical-tienda-pwa-sin-datos.md`.

> **Última actualización: auditoría 2026-05-26 ("ojos limpios").** El
> modelo previo era miope (omití el chat LLM ya existente en
> carta-digital, omití el flujo conversacional WhatsApp, asumí reusos
> que no aplicaban). Esta versión recoge el modelo real tras 8 rondas
> de clarificación con el usuario.

---

## 1 · Mensaje literal para pegar al inicio de la nueva conversación

Cópialo tal cual:

> *"Vamos a implementar la vertical tienda PWA + WhatsApp escueto. Caso
> piloto: vapers. Lee
> `arquitectura/decisiones/propuestas/vertical-tienda-pwa-sin-datos.md`
> entero.
>
> Verifica antes de tocar nada:
> - `modules/pizzepos/carta-digital/cf-worker/worker.js` existe y es
>   AI Chat Proxy a DeepSeek (esto es lo que reusamos como base de PWA).
> - `modules/pizzepos/carta-digital/static-template.js` y `export-cli.js` existen.
> - `modules/telegram-service/` existe (reusamos para notificación staff).
> - `modules/cobros/` v3.0.0 con método `efectivo` canónico.
> - NO existen aún `modules/whatsapp-bot/`, `modules/inventario/`,
>   `modules/verificacion-edad/`.
>
> Reporta estado en una tabla.
>
> Luego salta a **Fase 0**: cerrar conmigo las **3 decisiones abiertas**
> de la sección 6 del doc maestro. Hazme las preguntas en el orden de
> este archivo y guarda mis respuestas aquí mismo.
>
> Solo cuando las 3 estén cerradas, para a pedirme OK antes de Fase 1
> (setup Meta Cloud API).
>
> NO toques código hasta que las 3 estén respondidas Y yo haya dado OK
> explícito. NO crees PR sin OK explícito mío."*

---

## 2 · Las 3 preguntas en orden (la otra conversación me las hace una a una)

Formato: **enunciado · opciones · recomendación del doc**.

### Pregunta 1 — Anti-fraude del código de recogida (sección 6.1)

¿Cómo se evita que alguien recoja un pedido ajeno con el código filtrado?

- **A**: Solo código + descripción visual del pedido (dependiente cruza con pantalla del cliente).
- **B**: Código + palabra clave (3 chars) que el cliente elige al confirmar y dice al recoger.
- **C**: Código + QR firmado criptográficamente.

Recomendación del doc: **A**. Suficiente para volumen bajo de barrio. Si emerge problema, evolucionar a B.

Mi respuesta: **B — Código + palabra clave (3 chars) que el cliente elige al confirmar y dice al recoger.** (Cerrada 2026-05-26.)

---

### Pregunta 2 — Verificación edad: antes del catálogo o solo al confirmar pedido (sección 6.2)

- **A**: Gate al entrar a la PWA.
- **B**: Checkbox al confirmar pedido.
- **C**: Configuración por proyecto. Vapers SÍ gate. Panadería nada.

Recomendación del doc: **C**. Por proyecto.

Mi respuesta: **C — Configurable por proyecto.** Vapers/estanco → gate al entrar. Panadería/floristería/frutería/carnicería → nada. (Cerrada 2026-05-26.)

---

### Pregunta 3 — Expiración de reserva de stock (sección 6.3)

Default 24h. ¿Configurable por proyecto o fijo?

- **A**: Fijo 24h en v1.
- **B**: Configurable por proyecto desde el principio (un campo en `data/projects/{slug}/inventario.config.json`).

Recomendación del doc: **B**. Cero trabajo extra, permite ajustar por tipo de negocio.

Mi respuesta: **B — Configurable por proyecto** desde día 1 (campo en `data/projects/{slug}/inventario.config.json`). (Cerrada 2026-05-26.)

---

## 3 · Qué hace la otra conversación con mis 3 respuestas

1. Las guarda en este archivo (sustituye los `___` por las respuestas + 1 línea de motivo si la hay).
2. Para y pide OK explícito antes de Fase 1 (setup Meta Cloud API).
3. Ejecuta Fases 1-9 según el doc maestro, parando a pedir OK entre cada una:
   - Fase 1: setup WhatsApp Cloud API (1-2h).
   - Fase 2: módulo `whatsapp-bot` POC2 (3-4h).
   - Fase 3: módulo `inventario` POC2 con safeUpdate (3-4h).
   - Fase 4: módulo `verificacion-edad` mini (30 min).
   - Fase 5: tool `pedido.generar_codigo_recogida` (1h).
   - Fase 6: componentes Svelte PWA sobre carta-digital (2-3h).
   - Fase 7: configuración inicial proyecto vapers (1-2h).
   - Fase 8: tests + audit runtime E2E (1-2h).
   - Fase 9: cierre + commit + push.
4. **NUNCA crear PR ni mergear sin OK explícito.**

---

## 4 · Recordatorios para la próxima conversación

- Idioma de los archivos: español (canónico del repo).
- Los 3 módulos nuevos siguen POC2 (BaseModule + 5 helpers + tests por capa).
- **`inventario` DEBE usar `safeUpdate(path, mutator)`** del blueprint padre
  para todas las secuencias read-modify-write — sigue principio 11 del
  contrato `llm-runtime-discipline` v2.0.0 (evita la clase de bugs estilo
  salmorejo perdido del audit 2026-05-25).
- Los módulos nuevos deben declarar **`eventos_publicados_que_requieren_consumer[]`**
  en su `module.json` cuando publiquen eventos fire-and-forget que necesiten consumer
  (contrato `blueprint-eventos-conscientes` v1.0.0 vivo en main).
- Cualquier tool nueva sigue `tools.contract` v1.2.0 auto-wire.
- Sin emojis en código ni archivos.
- Branch de trabajo: la que diga el system prompt de esa sesión.
- **NUNCA crear PR sin OK explícito.**
- **NUNCA mergear PR sin OK explícito + CI verde.**

---

## 5 · Si algo se tuerce

Si la otra conversación intenta:

- Reactivar el chat LLM en PWA dentro de este horizonte → **rechaza**, decisión 4 cerrada (queda dormido).
- Construir pasarela de pago online → **rechaza**, decisión 5 cerrada (sin pago online v1).
- Reusar `staff-manager` o `pdf-viewer` o `tarifas` o `cuentas-canales` o `cuentas` → **rechaza**, decisiones cerradas en sección 3 (NO se reusan, explicación por qué).
- Usar `whatsapp-web.js` o Twilio → **rechaza**, decisión 2 cerrada (Meta Cloud API oficial).
- Generar albarán PDF → **rechaza**, decisión 13 cerrada (sin PDF v1, solo QR en pantalla).
- Crear CRM o persistir datos del cliente → **rechaza**, decisión 7 cerrada (RGPD cero).
- Hacer el bot WhatsApp como blueprint LLM rico → **rechaza**, decisión 3 cerrada (máquina de estados pequeña, NO chat conversacional rico).
- Construir módulos OCR para cargar catálogo → **rechaza**, fuera de scope v1.
- Crear PR sin tu OK explícito → **rechaza**.
- Mergear sin tu OK explícito → **rechaza**.

Si dudas, frase canónica: *"Vuelve al doc maestro
`vertical-tienda-pwa-sin-datos.md` antes de seguir."*

---

## 6 · Cheatsheet del estado pre-implementación

### Decisiones YA cerradas (15)

| # | Decisión | Cierre |
|---|---|---|
| 1 | Deploy | Multi-tenant compartido con pizzepos |
| 2 | WhatsApp técnico | **Meta Cloud API oficial** |
| 3 | WhatsApp modo de uso | **Escueto**, máquina de estados pequeña, NO LLM rico |
| 4 | Chat LLM en PWA | Disponible (carta-digital lo tiene) pero **NO se usa** v1 |
| 5 | Pasarela online | **NO en v1**, solo efectivo presencial |
| 6 | Verificación edad | Checkbox mínimo + flag, sin guardar identidad |
| 7 | Datos personales | **Ninguno persistido**, RGPD cero |
| 8 | PWA pública | Sobre `carta-digital` v1.1.0 (cf-worker + static-template ya hacen 80%) |
| 9 | Carrito | Local en navegador (`localStorage`) |
| 10 | Identificación al recoger | Código + QR + descripción visual |
| 11 | Stock | Reserva al confirmar pedido en bot, expiración configurable |
| 12 | Onboarding catálogo | Manual desde frontend admin |
| 13 | Albarán/ticket | **Sin PDF** v1, solo QR en pantalla |
| 14 | Tarifas | **NO se usan**, precio directo en producto |
| 15 | Notificación staff | `telegram-service` (ya en repo) reusado |

### Decisiones abiertas (3) → cerradas 2026-05-26

1. ~~Anti-fraude código~~ → **B**: código + palabra clave (3 chars) que el cliente elige y dice al recoger.
2. ~~Gate edad~~ → **C**: configurable por proyecto (vapers/estanco gate; resto no).
3. ~~Expiración stock~~ → **B**: configurable por proyecto desde día 1 (`data/projects/{slug}/inventario.config.json`).

### Módulos nuevos a crear (3)

| Módulo | Esfuerzo | Tipo |
|---|---|---|
| `whatsapp-bot` | 3-4h | JS POC2, máquina de estados sobre Meta Cloud API |
| `inventario` | 3-4h | JS POC2 con `safeUpdate` (CAS) obligatorio |
| `verificacion-edad` | 30 min | JS POC2 mini |

### Módulos a tocar (sin reescribir)

| Módulo | Cambio |
|---|---|
| `pedidos` | Tool nueva `pedido.generar_codigo_recogida` (~1h) |
| `carta-digital` (frontend Svelte) | Nuevos componentes catálogo + carrito + serializador wa.me (~2-3h) |

### Módulos a configurar (sin código)

- `productos`, `cobros`, `telegram-service`, `credential-manager`.

### Las 9 fases del camino

1. Setup WhatsApp Cloud API (1-2h).
2. Módulo `whatsapp-bot` (3-4h).
3. Módulo `inventario` (3-4h).
4. Módulo `verificacion-edad` mini (30 min).
5. Tool `pedido.generar_codigo_recogida` (1h).
6. Componentes Svelte PWA (2-3h).
7. Configuración inicial proyecto vapers (1-2h).
8. Tests + audit runtime E2E (1-2h).
9. Cierre.

**Total v1: 12-18h en 2-3 sesiones.**

---

## 7 · Lecciones nuevas a aplicar (post-auditoría 2026-05-26)

Cosas que aprendimos en sesiones desde el 25-mayo y deben aplicarse:

1. **PR #208 — CAS con `safeUpdate`**: el módulo `inventario` lo usa
   obligatoriamente para read-modify-write seguro.
2. **PR #209 — eventos conscientes blueprints**: los 3 módulos nuevos
   declaran `eventos_publicados_que_requieren_consumer[]` cuando aplique.
   Si publica `pedido.crear.request` esperando que `pedidos` lo
   escuche, declararlo + verificar que `pedidos` lo escucha.
3. **PR #210 — contrato `dinamica-de-trabajo-companero`**: esta
   propuesta es ejemplo de horizonte grande siguiendo el patrón
   propuesta + arranque + decisiones cerradas vs abiertas explícitas
   + auditoría "ojos limpios" cuando se acumula entropía.
4. **PR #211 — page graph usa catálogo**: la PWA pública debe declarar
   `target_page_id` (e.g. `"tienda"`) en su `module.json` para aparecer
   en el grafo de páginas navegables del frontend admin.
5. **Catálogo `_outputs/eventos-publish-subscribe.json` (PR #209)**: la
   sesión que implemente puede consultarlo para ver qué eventos del
   sistema ya existen antes de inventar nombres nuevos.

---

## 8 · Visión multi-vertical (futuro, post-vapers)

Una vez vapers funcione, panadería/floristería/carnicería/frutería/
estanco son configuración del `project_id`, no código nuevo. Mismo
`whatsapp-bot` sirve a todas — solo cambia catálogo de productos y
número de WhatsApp del negocio. Cambios opcionales:

- Verificación edad ON/OFF por proyecto.
- Expiración stock configurable (perecederos vs no).
- Stock por unidades vs por peso (adaptación menor en `inventario` v2).
