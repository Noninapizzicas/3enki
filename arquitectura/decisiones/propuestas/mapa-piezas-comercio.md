# Mapa de piezas del mundo del comercio en 2enki

> **Inventario verificado en disco** el 2026-05-31 por escaneo (Explore agent).
> No es valoración, no es propuesta, no es producto terminado, no es taxonomía.
> Es factual: qué hay, qué hace cada pieza, qué inputs/outputs tiene, con quién se conecta.
>
> Origen: cocina ana 2026-05-31 con el usuario tras descartar el horizonte
> `tienda-estado-canonico-y-vistas`. El usuario observó que tiene mucho trabajo
> de base hecho por retales y necesita verlo todo junto para decidir qué
> productos terminados quiere dar forma.

---

## 1. Entrada del cliente final (canales de pedido)

### modules/tienda-api
- **Tipo**: módulo JS POC2 (HTTP gateway del event-core), v1.0.0
- **Qué hace**: recibe POST `/tienda/pedido/:project` desde la PWA generada. Stateless, multi-proyecto. Emite `pedido.crear-tienda` al bus para que `pedidos` persista. Responde `pedido_id + codigo_recogida`.
- **Outputs**: `tienda.pedido.recibido`, `tienda.pedido.completado`, `tienda.pedido.fallido`.
- **Conexiones**: ← bundle del PWA (URL), → pedidos (tool).
- **Estado**: implementado y vivo.

### modules/whatsapp-bot
- **Tipo**: módulo JS POC2 (canal webhook Meta), v1.0.0
- **Qué hace**: máquina de estados pequeña. Webhook GET/POST `/whatsapp/webhook/:project`. Parser detecta saludo o pedido formateado desde PWA tienda. Si pedido → `pedido.crear.request` + notifica staff via telegram. Si saludo → responde con link de PWA.
- **Inputs**: webhook Meta + escucha `credential.{saved,deleted}`, `pedido.creado`.
- **Outputs**: `whatsapp.{mensaje.recibido, pedido.detectado, mensaje.enviado, envio.fallido}`.
- **Multi-proyecto**: mapping `phone_number_id → project_slug`.
- **Estado**: implementado y vivo.

### modules/bienvenida-tienda
- **Tipo**: módulo JS POC2, v1.0.0
- **Qué hace**: cara cliente del bot. Responde con saludo + link a PWA cuando un cliente final escribe por primera vez. Filtra mensajes del chat del staff. Stateless.
- **Inputs**: `telegram.{text.received, command.received}`, `project.activated`.
- **Outputs**: `telegram.send_message.request` (auto-wired a telegram-service).
- **Estado**: implementado.

### modules/notificador-pedidos
- **Tipo**: módulo JS POC2, v2.0.0
- **Qué hace**: cara staff. Escucha `pedido.creado` con `canal_origen='web'` y publica notificación al staff por Telegram con resumen + codigo_recogida. Stateless (resuelve config on-demand via `project.get.request`).
- **Estado**: implementado.
- **Nota**: la palabra_clave anti-fraude NO se incluye en el mensaje al staff (decisión cocinada en vertical-tienda).

### modules/pizzepos/cuentas-canales
- **Tipo**: módulo JS POC2, v5.0.0 (patrón Strategy: 6 strategies)
- **Qué hace**: sistema unificado de canales internos. 6 strategies cada una con ui_handlers propios:
  - `mesa` (mesa, llamar camarero, asignar)
  - `telefono` (llamada entrante, pedido por teléfono)
  - `llevar` (recogida en local)
  - `glovo` (delivery Glovo via API)
  - `whatsapp` (canal interno, NO confundir con whatsapp-bot externo)
  - `llevadoo` (delivery propio)
- **Inputs**: `cobro.procesado`, `pedido.creado`, `cocina.pedido_listo`.
- **Outputs**: `cuenta.{creada, cerrada}` canónicos + eventos por strategy.
- **Estado**: implementado y vivo. Reemplaza módulos `cuentas-mesa/telefono/llevar` legacy.

---

## 2. Generación de contenido (carta y menú)

### modules/pizzepos/menu-generator
- **Tipo**: módulo blueprint-driven, v8.0.0 (migración completada)
- **Qué hace**: ingiere PDF, voz, JSON, imágenes y produce carta estructurada en JSON canónico `carta-pizzepos`. El LLM razona la estructuración. **Sin OCR, sin agente externo** (cambio de v7).
- **Operaciones**: 2 (`generar`, `_on_carta_generar_solicitada`).
- **Outputs**: `carta.generar.solicitada` (esperando respuesta de `carta-manager.save`).
- **Persistencia**: delegada a `carta-manager.save` (event-core puro).
- **Estado**: implementado y vivo (legacy v7.0.0 archivado en `_legacy/`).

### modules/pizzepos/carta-manager
- **Tipo**: módulo blueprint-driven, v1.2.0 (13 operaciones)
- **Qué hace**: **aggregate root** del subsistema-carta. CRUD y versionado de cartas/productos/categorías. Single-writer. Los hermanos (carta-design, carta-digital, carta-impresion, carta-marketing, carta-scheduler) LEEN pero NUNCA escriben directamente.
- **Inputs**: 13 operaciones + escucha `carta.generar.solicitada` de menu-generator.
- **Outputs**: `carta.{creada, actualizada, eliminada}`.
- **Persistencia**: `cartas/<id>.json` + `cartas/versions/<id>/<timestamp>.json` atómicamente.
- **Estado**: implementado.

### modules/pizzepos/carta-design
- **Tipo**: módulo blueprint-driven, v1.1.0 (6 operaciones)
- **Qué hace**: estudio de diseño de cartas impresas. Cargar carta para diseñar, guardar HTML generado, biblioteca de profiles (5 built-in + custom). **NO genera HTML** — lo hace un agente.
- **Estado**: implementado.

### modules/pizzepos/carta-marketing
- **Tipo**: módulo blueprint-driven, v1.1.0 (4 operaciones)
- **Qué hace**: perfil de marca del proyecto + orquestador de agentes marketing (copywriter, strategist, brand-keeper, onboarding). Persiste `marca.json` del proyecto.
- **Estado**: implementado.

### modules/pizzepos/carta-impresion
- **Tipo**: módulo blueprint-driven, v1.1.0 (3 operaciones)
- **Qué hace**: genera versiones imprimibles de cartas en HTML print-ready. Delega generación HTML a agente impresor.
- **Estado**: implementado.

### modules/pizzepos/carta-scheduler
- **Tipo**: módulo blueprint-driven, v1.1.0 (7 operaciones)
- **Qué hace**: reglas (cron + canal + carta_id) + pendientes (cambios calculados esperando OK humano). **NO ejecuta cron** — lo hará módulo separado (deuda explícita).
- **Estado**: implementado. Executor (cron) pendiente.

---

## 3. Composición y publicación de PWA

### modules/pizzepos/carta-digital
- **Tipo**: módulo blueprint-driven, v1.1.0 (4 operaciones)
- **Qué hace**: backoffice de la carta pública. Branding del proyecto + composición final (PWA build, ofertas, copy) delegada a agentes via `agent.execute.request`. Coexiste con artefactos no-blueprint (cf-worker, export-cli.js, static-template.js) que son tooling de deploy.
- **Outputs**: persiste `carta-digital.json` del proyecto. Publica `tienda.bundle.actualizada` al terminar composición.
- **Path canónico del bundle**: `<base_path>/storage/tienda/bundle/` (según subsistema-tienda.contract.json).
- **Estado**: implementado (v1.1.0, blueprint-driven). Artefactos legacy coexisten sin conflicto.

### modules/pizzepos/carta-digital/cf-worker/
- **Tipo**: Cloudflare Worker (legacy artefacto), 194 LOC
- **Qué hace**: proxy de chat LLM a DeepSeek para PWAs públicas.
- **Deploy**: manual con `wrangler`.
- **Estado**: vivo en Cloudflare, no se ha tirado.

### modules/pizzepos/carta-digital/static-template.js
- **Tipo**: JS template (legacy artefacto), 1504 LOC
- **Qué hace**: genera el HTML de la PWA pública (catálogo + branding + WhatsApp button).
- **Estado**: vivo, llamado por `export-cli.js`.

### modules/pizzepos/carta-digital/export-cli.js
- **Tipo**: CLI standalone (legacy artefacto), 150 LOC
- **Qué hace**: escribe HTML a carpeta local y dice "súbelo a Netlify drop o GitHub Pages".
- **Invocación**: `node export-cli.js --carta X --whatsapp Y`.
- **Estado**: vivo, no integrado al bus.

### modules/comandero-cliente-builder
- **Tipo**: módulo JS POC2 (compilador de bundles PWA), v1.0.0
- **Qué hace**: builder de bundles PWA del **comandero del operador** (interfaz para quien atiende, NO para cliente final). Ingiere catálogo + tarifas + presentación. Genera HTML/JS/CSS estático.
- **Inputs**: escucha `catalogo.actualizado`, `producto.*`, `tarifas.config.actualizada`. Tools: `comandero-cliente.{presentacion.actualizar, imagen.subir, categorias.reordenar, bundle.generar}`.
- **Outputs**: `comandero-cliente.{presentacion.actualizada, bundle.generado, bundle.fallido}`. Escribe a `<base_path>/storage/comandero-cliente-builder/bundles/`.
- **Estado**: implementado. Operador sube manualmente con wrangler (Fase 6a). Fase 6b futura: módulo `cf-worker-deployer`.

### blueprints/project-types/tienda.json (feature)
- **Tipo**: blueprint padre (project feature), v1.0.0
- **Qué hace**: declara estructura para PWA pública. `slug_required: true`. Crea `storage/tienda/bundle/` + symlink `/opt/enki/public/shop/{{slug}}` + initialFiles (index.html, manifest.json, sw.js placeholders).
- **Estado**: declarado. Implementación parcial (wiring de symlinks en project-manager pendiente de cerrar).

### arquitectura/decisiones/_contratos/subsistema-tienda.contract.json
- **Tipo**: contrato transversal, v1.0.0
- **Qué hace**: canoniza convención PWA pública por proyecto. 9 principios, 6 decisiones arquitectónicas, 8 validaciones cross. Path canónico, archivos canónicos, evento `tienda.bundle.actualizada`, herencia de blueprint padre.
- **Estado**: documentado, implementación parcial (9 items trabajo pendiente).

### modules/_subsistema-tienda/subsistema-tienda.modulo-base.blueprint.json
- **Tipo**: blueprint padre abstracto del subsistema (declarado, no implementado)
- **Estado**: pendiente crear archivo .blueprint.json (trabajo pendiente en contrato).

### deployment/caddy/Caddyfile.vps
- **Tipo**: config de webserver
- **Qué hace**: bloque `handle_path /shop/*` sirve PWAs desde `/opt/enki/public/shop/` (symlinks per proyecto). Una sola regla para todos los proyectos.
- **Estado**: implementado.

---

## 4. Pedidos, productos, tarifas, cobros

### modules/pizzepos/pedidos
- **Tipo**: módulo JS POC2, v3.1.0
- **Qué hace**: dos tipos:
  - `tipo='pos'`: flujo POS con cuenta_id, items separados, enviado a cocina
  - `tipo='tienda'`: vertical tienda PWA, plano sin cuenta_id, items de una, codigo_recogida + palabra_clave
- **Tools**: `pedido.{list, get, create, add-item, update-item, delete-item, send-kitchen, complete, cancel, total, crear-tienda, generar_codigo_recogida}`.
- **Estado**: implementado. Persistencia in-memory (no restart-resilient para tipo=tienda).

### modules/pizzepos/productos
- **Tipo**: módulo JS POC2, v3.0.0
- **Qué hace**: catálogo multi-tenant. Sincronizado desde menús generados por IA o cartas (`carta.actualizada`). Persiste en `<base_path>/storage/pizzepos/cartas/*.json`.
- **Outputs**: `producto.{creado, actualizado, eliminado}`, `catalogo.actualizado`.
- **Estado**: implementado.

### modules/pizzepos/tarifas
- **Tipo**: módulo JS POC2, v3.1.0
- **Qué hace**: cada canal tiene su carta con precios finales (sin cálculos runtime, sin duplicación). Publica `tarifas.config.actualizada` con snapshot completo.
- **Canales**: mesa, llevar, telefono, whatsapp, glovo, llevadoo.
- **NO escribe directamente** — lo hacen agentes (`tarifas-creator`, `tarifas-sync`).
- **Estado**: implementado.

### modules/pizzepos/cobros
- **Tipo**: módulo JS POC2, v3.0.0
- **Qué hace**: 7 métodos de pago (efectivo, tarjeta, bizum, transferencia, mixto, link_pago, qr). Idempotencia por cuenta_id. Abre cajón de dinero via periférico.
- **Estado**: implementado.

### modules/pizzepos/cuentas
- **Tipo**: módulo JS POC2
- **Qué hace**: owner único de cuentas (delegación de `cuentas-canales`). Persistencia centralizada.
- **Estado**: implementado.

---

## 5. Agentes del mundo comercio

> Todos los agentes declaran v1.0.0 con `stats.executions=0`. Probables causas:
> sistema nuevo, agentes wireados pero no invocados en runtime real, o
> nombres/scope pendientes de calibración.

### Agentes carta-digital
- `cartadigital-composer` — compone carta pública final (carta-manager + marketing + branding). Genera paquete listo para servir o exportar. Tools: `carta.*`, `cartadigital.*`, `marketing.get_perfil`, `tarifas.get`.
- `cartadigital-pwa-builder` — genera export PWA: HTML autónomo + service worker + manifest. Desplegable en GitHub Pages, Netlify, hosting estático. **Solapa parcialmente con comandero-cliente-builder** (decisión pendiente en contrato).
- `cartadigital-ofertas` — gestiona ofertas y combos: crear, activar, desactivar. Context_enabled=true.
- `cartadigital-reviewer` — revisor de carta pública: coherencia, completitud, formatos.

### Agentes marketing
- `marketing-copywriter` — escribe descripciones de productos adaptadas al perfil de marca. Temperature 0.7 (creativo). Mutador directo (`carta.save`).
- `marketing-brand-keeper` — guardián de la marca. Revisa carta para asegurar coherencia. Último filtro de calidad. Temperature 0.2.
- `marketing-strategist` — sugiere posicionamiento, públicos, canales, timing de ofertas. Consultivo.
- `marketing-onboarding` — entrevista conversacional para construir perfil de marca. Context_enabled=true.

### Agentes menu-generator (pipeline)
- `menu-enricher` — paso 3 del pipeline: enriquece productos con descripciones, emojis, tags, alérgenos. Temperature 0.7.
- `menu-validator` — paso 4 del pipeline: valida coherencia y calidad (precios razonables, categorías lógicas, duplicados). Temperature 0.1.

### Agentes tarifas
- `tarifas-creator` — crea variantes de carta para canales: duplica base, ajusta precios, filtra productos, registra en tarifas.
- `tarifas-sync` — sincroniza variantes cuando la base cambia.

---

## 6. Observaciones globales del inventario

### Dos mundos coexisten sin conflicto
- **Mundo pizzería POS**: mesas, cocina, canales tradicionales (mesa, telefono, llevar, glovo, whatsapp interno, llevadoo) → `cuentas-canales` v5
- **Mundo tienda PWA**: pedidos web → `carta-digital` → `comandero-cliente-builder` → `tienda-api` + `notificador-pedidos` (horizonte vertical-tienda-pwa-sin-datos)

### Arquitectura por capas observable
- **Entrada**: tienda-api (HTTP), whatsapp-bot (Meta), cuentas-canales (internos), bienvenida-tienda (Telegram)
- **Lógica de dominio**: pedidos (aggregate), productos (catálogo), tarifas (pricing), cobros (pago)
- **Generación de contenido**: menu-generator, carta-manager (aggregate root), carta-design, carta-marketing, carta-impresion, carta-scheduler
- **Composición y publicación PWA**: carta-digital + agentes + comandero-cliente-builder + cf-worker/static-template/export-cli (legacy coexisten) + Caddy
- **Notificación**: notificador-pedidos (staff), bienvenida-tienda (cliente final)

### Patrones de persistencia
- In-memory (no restart-resilient): pedidos, cobros, cuentas, gateway-manager
- JSON per-project: productos, carta-manager, tarifas, todos los subsistemas recetario
- SQLite delegado: channel-manager (via database-manager)
- Filesystem per-project: comandero-cliente-builder bundles, carta-digital artefactos

### Migración a blueprint-driven en progreso
- **Completados**: menu-generator (v8), carta-manager (v1.2), carta-design (v1.1), carta-marketing (v1.1), carta-impresion (v1.1), carta-scheduler (v1.1)
- **Legacy archivado**: menu-generator v7 (826 LOC), carta-manager v1.1 (826 LOC), carta-scheduler (603 LOC)
- **Pendiente decisión**: agente legacy `cartadigital-pwa-builder` (reemplazar por comando de carta-digital o mantener transición)

### Horizonte vertical-tienda-pwa-sin-datos (vivo)
- Módulos implementados: tienda-api, comandero-cliente-builder, whatsapp-bot, bienvenida-tienda, notificador-pedidos, pedidos (tipo=tienda)
- Estado: v1.0.0 en código de referencia

### Drift y deuda técnica observable
- Subsistema-tienda (PWA): 9 items trabajo pendiente en contrato
- Carta-scheduler: executor de cron deuda explícita
- Comandero-cliente-builder: artefactos legacy (cf-worker, static-template.js, export-cli.js) coexisten sin decisión de absorción
- Agente `cartadigital-pwa-builder` vs módulo `comandero-cliente-builder`: solapamiento sin resolución

---

**Fin del inventario.**
