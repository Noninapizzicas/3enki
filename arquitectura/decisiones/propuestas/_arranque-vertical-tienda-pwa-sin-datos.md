# Arranque vertical tienda PWA sin datos — guion para la próxima sesión

Este archivo NO es un contrato ni un plan — es **el guion literal** que tú
pegas al arrancar la próxima sesión para implementar la vertical tienda
PWA sin datos (caso piloto: vapers). Está diseñado para que la otra
conversación no improvise ni pierda contexto.

Doc maestro de referencia:
`arquitectura/decisiones/propuestas/vertical-tienda-pwa-sin-datos.md`.

---

## 1 · Mensaje literal para pegar al inicio de la nueva conversación

Cópialo tal cual:

> *"Vamos a implementar la vertical tienda PWA sin datos. Caso piloto:
> vapers. Lee
> `arquitectura/decisiones/propuestas/vertical-tienda-pwa-sin-datos.md`
> entero.
>
> Verifica antes de tocar nada:
> - `modules/pizzepos/carta-digital/` existe y es blueprint-driven con cf-worker.
> - `modules/pizzepos/{productos,pedidos,cobros,cuentas,cuentas-canales,tarifas,variaciones}/` existen.
> - `modules/pizzepos/cuentas-canales/strategies/` tiene strategies (mesa, whatsapp, etc.) — ahí añadiremos tienda-online.
> - No existen aún `modules/inventario/` ni `modules/verificacion-edad/` ni `modules/tienda-publica/`.
>
> Reporta estado en una tabla.
>
> Luego salta a **Fase 0**: cerrar conmigo las **5 decisiones abiertas**
> de la sección 6 del doc maestro. Hazme las preguntas en el orden de
> este archivo y guarda mis respuestas aquí mismo.
>
> Solo cuando las 5 estén cerradas, para a pedirme OK antes de Fase 1
> (módulo inventario). Después itera fase por fase pidiéndome OK entre
> cada una.
>
> NO escribas código hasta que las 5 estén respondidas Y yo haya dado OK
> explícito. NO crees PR sin OK explícito mío."*

---

## 2 · Las 5 preguntas en orden (la otra conversación me las hace una a una)

Formato: **enunciado · opciones · recomendación del doc**.

### Pregunta 1 — Path/naming del módulo PWA pública (sección 6.1)

¿Cómo se materializa la PWA pública nueva con carrito interactivo?

- **A**: Generalizar `carta-digital` añadiendo operaciones públicas
  (`crear_pedido_publico`, etc.). Sigue siendo el mismo módulo.
- **B**: Crear módulo nuevo `tienda-publica` clon de `carta-digital`
  con su propio `cf-worker` adaptado. Distinción ontológica clara.
- **C**: Crear módulo nuevo `tienda-publica` ligero que invoca a
  `carta-digital` para la parte vitrina y añade solo lo de carrito.

Recomendación de partida en el doc: **B**. Mantiene la distinción
restaurante vs tienda, permite evolución independiente.

Mi respuesta: ___

---

### Pregunta 2 — Anti-fraude del código de recogida (sección 6.2)

¿Cómo se evita que alguien recoja un pedido ajeno con el código filtrado?

- **A**: Solo código + descripción visual del pedido (el dependiente
  cruza con lo que ve en la pantalla del cliente).
- **B**: Código + palabra clave (3 chars) que el cliente elige al
  confirmar y dice al recoger.
- **C**: Código + QR firmado criptográficamente (timestamp + hash). El
  dependiente escanea con la app admin.

Recomendación de partida en el doc: **A**. Suficiente para volumen bajo
de barrio. Si emerge problema real, evolucionar a B.

Mi respuesta: ___

---

### Pregunta 3 — Cuándo se usa `menu-generator` para cargar el catálogo (sección 6.3)

- **A**: Esperar a que `menu-generator` se migre a blueprint puro (ver
  `migracion-menu-generator-blueprint.md`) y luego usarlo.
- **B**: Usar `menu-generator` legacy ahora (texto/JSON sí funciona,
  OCR no se usa). Cuando se migre, no cambia nada para esta vertical.

Recomendación de partida en el doc: **B**. No acoplar este horizontal
con otro pendiente.

Mi respuesta: ___

---

### Pregunta 4 — Verificación de edad: antes del catálogo o solo al confirmar (sección 6.4)

- **A**: Gate al entrar a la PWA. El cliente confirma edad antes de ver
  productos. Más estricto.
- **B**: Checkbox al confirmar pedido (justo antes de generar código).
  Menos fricción.
- **C**: Configuración por proyecto. Vapers SÍ gate (A). Panadería/otros
  sin regulación, nada.

Recomendación de partida en el doc: **C**. Configuración por proyecto.

Mi respuesta: ___

---

### Pregunta 5 — Expiración de reserva de stock (sección 6.5)

Default 24h. ¿Configurable por proyecto o fijo?

- **A**: Fijo 24h en v1. Si emerge necesidad, se vuelve configurable.
- **B**: Configurable por proyecto desde el principio (un campo en
  `data/projects/{slug}/inventario.config.json`).

Recomendación de partida en el doc: **B**. Cero trabajo extra, permite
ajustar por tipo de negocio (panadería 3h, vapers 48h).

Mi respuesta: ___

---

## 3 · Qué hace la otra conversación con mis 5 respuestas

1. Las guarda en este mismo archivo (sustituye los `___` por las
   respuestas + 1 línea de motivo si la hay).
2. Para y pide tu OK explícito antes de ejecutar Fase 1.
3. Si das OK, ejecuta **Fase 1** (~3-4h):
   - Crea `modules/inventario/` POC2 con module.json + index.js + tests.
   - 6 tools canónicas: consultar, reservar, confirmar, liberar,
     ajustar, estado_catalogo.
   - 3 eventos: stock.bajo_minimo, reserva.creada, reserva.expirada.
   - `npm run validate:ci` PASS verde.
4. Para a pedirte OK para Fase 2.
5. Itera Fases 2-7 pidiéndote OK entre cada una.
6. **NUNCA crear PR ni mergear sin OK explícito mío.**

---

## 4 · Recordatorios para la próxima conversación

- Idioma de los archivos: español (canónico del repo).
- Sin emojis en código ni archivos salvo que el usuario los pida.
- Branch de trabajo: la que diga el system prompt de esa sesión, NUNCA
  pushear a otra sin permiso explícito.
- `validate:ci` tiene que pasar antes de cualquier merge/push.
- **NUNCA crear PR sin OK explícito del usuario.**
- **NUNCA mergear PR sin OK explícito del usuario.**
- Los módulos nuevos siguen POC2 (BaseModule + 5 helpers + tests por
  capa). Excepción: PWA pública es blueprint si decisión 1 = A o B con
  blueprint, JS si decisión 1 = C con frontend Svelte puro.
- Reutilizar `tools.contract v1.2` para todas las tools nuevas.
- Catalogar las nuevas tools de `inventario` en formato canónico para
  que el LLM las pueda invocar.

---

## 5 · Si algo se tuerce

Si la otra conversación intenta:

- Construir `whatsapp-service` para canal transaccional → **rechaza**,
  decisión 2 cerrada (WhatsApp solo promocional v1).
- Añadir CRM / módulo `cliente` → **rechaza**, decisión 5 cerrada (sin
  datos personales).
- Implementar pasarela de pago online → **rechaza**, decisión 3 cerrada
  (v1 solo efectivo presencial).
- Añadir notificaciones outbound vía templates Meta → **rechaza**,
  decisión 5 cerrada.
- Construir módulos OCR para cargar catálogo → **rechaza**, usar
  `menu-generator` con texto/JSON (decisión 3).
- Tocar `whatsapp.js` strategy de `cuentas-canales` → **rechaza**, esa
  strategy es del restaurante, no de la tienda. La tienda añade nueva
  strategy `tienda-online`.
- Saltarse Fase 0 (5 preguntas) → **rechaza**, vuelve a sección 2.
- Crear PR sin tu OK → **rechaza**.
- Mergear sin tu OK → **rechaza**.

Si dudas, frase canónica: *"Vuelve al doc maestro
`vertical-tienda-pwa-sin-datos.md` antes de seguir."*

---

## 6 · Cheatsheet del estado pre-implementación

### Decisiones YA cerradas (10)

| # | Decisión | Cierre |
|---|---|---|
| 1 | Deploy | Multi-tenant compartido con pizzepos |
| 2 | WhatsApp | Solo promocional, sin integración técnica v1 |
| 3 | Pasarela | No en v1, solo efectivo presencial |
| 4 | Verificación edad | Checkbox mínimo + flag en pedido |
| 5 | Datos personales | Cero. Cliente anónimo por código |
| 6 | Catálogo público | PWA con cf-worker (decisión final entre extender/clonar pendiente) |
| 7 | Carrito | Local en navegador (localStorage), no conversacional |
| 8 | Anti-fraude recogida | Código + verificación visual (B/C son evoluciones) |
| 9 | Stock | Reserva al confirmar + expiración (default 24h) |
| 10 | Onboarding catálogo | menu-generator (legacy o blueprint, decisión 3 abierta) |

### Decisiones abiertas (5)

1. Path/naming PWA pública (extender vs clonar vs híbrido).
2. Anti-fraude código (visual / palabra clave / QR firmado).
3. Cuándo menu-generator (legacy ya o esperar blueprint).
4. Gate edad (antes catálogo / antes pedido / por proyecto).
5. Expiración stock (fija 24h / configurable por proyecto).

### Módulos nuevos a crear (3)

| Módulo | Esfuerzo | Tipo |
|---|---|---|
| `inventario` | 3-4h | JS POC2 |
| `verificacion-edad` | 30 min | JS POC2 mini |
| PWA pública (nombre según decisión 1) | 4-6h | Blueprint + componentes Svelte + cf-worker adaptado |

### Módulos a tocar (sin reescribir)

| Módulo | Cambio |
|---|---|
| `pedidos` | Tool nueva `pedido.generar_codigo_recogida` (~1h) |
| `cuentas-canales` | Nueva strategy `tienda-online.js` (~1h) |
| `tarifas` | Configuración nueva (canal `tienda-online`) — sin código |

### Módulos a configurar (sin código)

- `productos`, `categorias`, `variaciones`, `cobros`, `cuentas`,
  `staff-manager`, `facturas`, `pdf-viewer`, `scheduler`,
  `credential-manager`, `escandallo`, `viabilidad`, `carta-marketing`,
  4 agentes marketing.

### Fases del camino (7)

1. Inventario (3-4h).
2. Pedido recogida + strategy tienda-online (1-2h).
3. Verificación edad (30 min).
4. PWA pública (4-6h).
5. Configuración inicial proyecto vapers (2-3h).
6. Tests + audit runtime E2E (1-2h).
7. Cierre.

**Total v1: 12-18h en 2-3 sesiones.**

---

## 7 · Visión multi-vertical después de v1

Una vez vapers funcione, la misma infraestructura sirve para:
panadería, floristería, carnicería, frutería, estanco. Todo es
configuración del `project_id`, no código nuevo. Diferencias mínimas:

- Checkbox edad sí/no por proyecto.
- Expiración stock configurable por proyecto.
- Stock por unidades vs por peso (adaptación menor en `inventario` v2).
- Personalidad del LLM via `carta-marketing` por proyecto.

Cuando se valide vapers en runtime real, el segundo proyecto se monta en
~1-2h de configuración.
