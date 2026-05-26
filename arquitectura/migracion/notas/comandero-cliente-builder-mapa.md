# comandero-cliente-builder — mapa de eventos (PASO 0)

> Sin mapa no se toca el módulo. Validado con el operador 2026-05-26
> (decisiones cerradas al final del documento). Listo para PASO 1
> (declarar `module.json`).

## 1. Identidad

- **Slug propuesto**: `comandero-cliente-builder`
- **Ubicación propuesta**: `modules/comandero-cliente-builder/`
  - Razón: no es parte del POS runtime — su rol es generar bundles PWA
    para verticales (vapers, restaurante, etc.). Vive en raíz como
    `dashboard`, `admin-panel`, `system-inspector`.
  - Alternativa rechazable: `modules/pizzepos/comandero-cliente-builder/`
    (acoplaría el slug al consumidor actual de eventos, pero el builder
    en sí no es del dominio pizzepos).
- **Description oficial**: "Builder de bundles PWA del comandero-cliente
  — genera artefacto estático con catálogo enriquecido (imágenes,
  descripciones, orden público) listo para servir al cliente final
  desde cf-worker."
- **Language del module.json**: `es` (igual que comandero/productos —
  glossary canónico del subsistema).
- **Naturaleza**: agente blueprint (`modulos-blueprint-driven.contract`).
  Las 4 condiciones del contrato:
  1. ✅ Dominio razonable en lenguaje natural (catálogo visual,
     descripciones de venta, orden de presentación).
  2. ✅ Su trabajo es razonar (qué destacar, cómo agrupar) — no
     procedural puro.
  3. ✅ Latencia 5-25s tolerable (el builder no corre en hot path del
     cliente final; genera bundle bajo demanda del operador del proyecto).
  4. ✅ Coste de inferencia tolerable (un build por vertical, no por
     turno).

## 2. Eventos publicados

| evento | cuándo | payload mínimo | fase |
|---|---|---|---|
| `comandero-cliente.producto.presentacion.actualizada` | tras editar imagen/descripción/orden de un producto | `{producto_id, project_id, presentacion: {imagen_url?, descripcion_publica?, orden_publico?, oculto_publico?}}` | 6a |
| `comandero-cliente.bundle.generado` | tras compilar el artefacto PWA del proyecto | `{project_id, bundle_id, bundle_path, productos_count, generado_en}` | 6a |
| `comandero-cliente.bundle.fallido` | error en la fase de build | `{project_id, bundle_id?, fase: 'generar', error: {code, message}}` | 6a |
| `comandero-cliente.bundle.publicacion.solicitada` | el builder pide al deployer que suba el bundle al cf-worker | `{project_id, bundle_id, bundle_path, target_url}` | 6b |
| `comandero-cliente.bundle.publicado` | tras confirmar publicación exitosa | `{project_id, bundle_id, public_url, publicado_en}` | 6b |

**Verbos**: `actualizada`, `generado`, `solicitada`, `publicado`,
`fallido` — todos canónicos en `naming.json` (es).

**`correlation_id`**: propagado en todos. Originador = la tool que el
operador invoca desde el agente que orquesta la vertical.

**Alcance por fases (cerrado 2026-05-26)**:

- **Fase 6a (este módulo en su v1)**: solo emite `producto.presentacion.actualizada`,
  `bundle.generado`, `bundle.fallido`. El bundle se escribe a disco y
  punto. **NO emite** `bundle.publicacion.solicitada` ni
  `bundle.publicado` en v1 (no hay consumer). La tool
  `comandero-cliente.bundle.publicar` queda fuera del catálogo de tools
  de v1.
- **Fase 6b (módulo hermano nuevo `cf-worker-deployer`)**: cuando ese
  módulo exista, este builder añade los dos eventos restantes y la tool
  de publicar. El `module.json` declara desde v1 todos los eventos
  posibles para no romper schema cuando se activen.
- **Razón**: el único deploy a cf-worker que existe hoy es manual
  (`modules/pizzepos/carta-digital/cf-worker/deploy.js`, CLI via
  wrangler). No hay deployer modular reusable. Crearlo está fuera del
  scope de Fase 6a — se aborda en 6b sin bloquear 6a.

## 3. Eventos escuchados

| evento | emisor | qué hace el builder |
|---|---|---|
| `catalogo.actualizado` | `pizzepos/productos` | refresca cache local del catálogo del proyecto. No regenera bundle automáticamente — el bundle se regenera por tool explícita. |
| `producto.creado` | `pizzepos/productos` | añade a cache local |
| `producto.actualizado` | `pizzepos/productos` | actualiza cache local |
| `producto.eliminado` | `pizzepos/productos` | quita de cache local |
| `tarifas.config.actualizada` | `pizzepos/tarifas` | hidrata cache canal→carta_id (mismo patrón que comandero post-commit `dc77c0d`) |
| `project.activated` | `project-manager` | inicializa cache del proyecto activo si es la primera vez |

**Patrón de hidratación inicial**: en `onLoad`, publica
`tarifas.config.solicitada` para snapshot inicial sin esperar respuesta
(comportamiento heredado del fix de paradigm isolation del comandero).
Si el catálogo aún no ha llegado cuando una tool genera bundle, el
bundle se rechaza con `error.code = CATALOGO_NO_HIDRATADO` (de
`errors.contract`).

## 4. Tools que expone

Tools del builder invocables por el agente que lo orquesta. Todas con
shape canónico de `tools.contract` (parameters JSON Schema 2020-12,
retorno `{status, data | error: {code, message}}`).

| tool | qué hace | parámetros | fase |
|---|---|---|---|
| `comandero-cliente.producto.presentacion.actualizar` | añade/edita imagen, descripción, orden público de un producto | `{project_id, producto_id, imagen_url?, descripcion_publica?, orden_publico?, oculto_publico?}` | 6a |
| `comandero-cliente.producto.imagen.subir` | sube imagen al storage y devuelve url canónica | `{project_id, producto_id, imagen_base64, content_type}` | 6a |
| `comandero-cliente.categoria.orden.actualizar` | reordena categorías para la vista pública | `{project_id, orden: [categoria_id, ...]}` | 6a |
| `comandero-cliente.bundle.generar` | compila el bundle PWA del proyecto y devuelve `bundle_path` | `{project_id, identidad: {marca, colores, logo_url?}}` | 6a |
| `comandero-cliente.bundle.publicar` | dispara la publicación al cf-worker (emite `bundle.publicacion.solicitada`) | `{project_id, bundle_id}` | 6b |

**Acotación deliberada**: el builder NO expone tools de precio,
inventario ni modificadores. Esas mutaciones pertenecen a
`pizzepos/productos` y se hacen desde su agente correspondiente. El
builder solo añade la capa visual/comercial sobre el catálogo
operativo.

## 5. Persistencia

- **Tabla `comandero_cliente_presentacion`** (sqlite, propietaria):
  - `producto_id` (PK + FK lógico a productos)
  - `project_id`
  - `imagen_url` (nullable)
  - `descripcion_publica` (nullable)
  - `orden_publico` (nullable)
  - `oculto_publico` (boolean, default false)
  - `actualizada_en`
  - El cruce con `productos` es por evento, no por JOIN cross-módulo.
    El catálogo operativo vive en su módulo; el builder solo posee la
    capa de presentación.

- **Tabla `comandero_cliente_bundles`** (sqlite, propietaria):
  - `bundle_id` (PK uuid)
  - `project_id`
  - `bundle_path` (relativo a un dir gestionado por filesystem)
  - `productos_count`
  - `generado_en`
  - `publicado_en` (nullable)
  - `public_url` (nullable)

**Cumple `persistence.contract`**: tablas propias, sin acceso a tablas
de otros módulos. Cualquier consulta cross-módulo va por
`db.query.*` events.

**Cerrado 2026-05-26**: el bundle se persiste a disco vía
`fs.write.request` (evento canónico del módulo `filesystem`). El
`bundle_path` resultante queda registrado en `comandero_cliente_bundles`
y el operador puede inspeccionarlo, reintentarlo o subirlo
manualmente con `wrangler` mientras Fase 6b no exista. Esto da
trazabilidad y desacopla el build de la publicación.

## 6. Decisión cerrada en la conversación: campos visuales

**Decidido en este mapa**: opción 1 — extender `pizzepos/productos`
con campos opcionales `imagen_url`, `descripcion_publica`,
`orden_publico`, `oculto_publico` está **rechazada**. En su lugar, el
builder tiene su propia tabla `comandero_cliente_presentacion` (sec. 5).

Razón del cambio respecto a lo que dije antes:

- Si extendemos productos, esos campos los ve también el comandero
  interno, la cocina, escandallo — añade ruido a dominios que no los
  necesitan.
- Si separamos en el builder, la regla event-core se respeta:
  productos = operativo, builder = presentación pública. Un dominio,
  una responsabilidad.
- Coste: el bundle requiere fusionar dos fuentes (catálogo + presentación)
  en el build, pero eso es trivial — ambas viven en cache local del
  mismo módulo.

**Cerrado 2026-05-26**: tabla propia del builder. La filosofía del
sistema (granularidad acotada, un módulo = una responsabilidad)
favorece la separación: `productos` gobierna el catálogo operativo,
el builder gobierna la capa de presentación pública. Otros consumers
del catálogo (cocina, escandallo, comandero interno) no ven los
campos visuales, que para ellos serían ruido.

## 7. APIs HTTP

Sin endpoints HTTP propios en v1. El builder es invocable solo via
tools del LLM y eventos del bus. Si en el futuro se quiere editor
visual de catálogo público (drag-and-drop de imágenes, etc.), se
puebla por nuevo módulo `comandero-cliente-editor-ui` que sí expone
HTTP/UI.

## 8. Modos de fallo

| fallo | comportamiento esperado |
|---|---|
| `catalogo.actualizado` no ha llegado aún cuando se invoca `bundle.generar` | tool retorna error con `code: CATALOGO_NO_HIDRATADO` |
| imagen subida supera límite de tamaño | tool retorna error con `code: INVALID_INPUT`, `details.field: imagen_base64` |
| el deployer al cf-worker falla o no existe | emite `comandero-cliente.bundle.fallido` con `fase: publicar`. El bundle queda en disco para reintento manual. |
| producto referenciado por presentación no existe en catálogo al momento del build | warn + omite el producto del bundle. NO bloquea el build (el catálogo es la fuente; presentación huérfana se purga después por job de housekeeping, fuera de scope de v1). |

**Cumple `errors.contract`**: codes del catálogo cerrado, no inventa
codes por entidad. Sin stack traces en payloads del bus.

## 9. Relación con otros módulos

- **`pizzepos/productos`**: el builder es consumer puro. Cero acceso
  directo — solo escucha sus eventos canónicos. Cumple paradigm
  isolation.
- **`pizzepos/comandero`**: gemelo conceptual (mismo catálogo, distinta
  cara). Cero acoplamiento entre los dos módulos — ambos consumen
  productos por separado.
- **`pizzepos/carta-digital`**: gemelo conceptual del lado "vista pura"
  (catálogo visual sin carrito ni pedido). Tiene su propio
  `static-template.js` y `cf-worker/deploy.js` internos. **No hay
  acoplamiento entre ambos módulos**. La duplicación deliberada del
  template (copia inicial en este builder, especializada con carrito y
  gesto de pedido) es preferible a una abstracción prematura. Si la
  duplicación duele en el futuro, se extrae a un módulo común
  `catalogo-pwa-template` (Fase 6c, opcional).
- **`pizzepos/carta-marketing`**: enriquece descripciones operativas
  del catálogo con LLM. Sus outputs viven en `pizzepos/productos` /
  `carta-manager` y le llegan al builder por `catalogo.actualizado`
  como cualquier otro cambio. **No es consumer ni emisor especial**
  desde la óptica del builder.
- **`filesystem`**: para escribir el bundle a disco. Vía evento
  `fs.write.request` (canónico).
- **`project-manager`**: para resolver `project_id` activo en tools
  invocadas sin él explícito.
- **`cf-worker-deployer` (futuro, Fase 6b)**: cuando exista, el
  builder le pasa el bundle vía `bundle.publicacion.solicitada` y
  escucha su respuesta. No se crea en Fase 6a.

## 10. Lo que NO está en este módulo (y por qué)

- **Carrito persistente, login del cliente, checkout, pagos online** —
  fuera de scope. El gesto final del cliente en la PWA generada es
  "enviar pedido" → emite vía MQTT/HTTP de vuelta al sistema (handoff
  específico se cierra en el contrato de salida del bundle, Fase 6).
- **Editor visual web de catálogo** — sin UI HTTP en v1. Edición por
  tools del LLM desde el chat del agente que orquesta la vertical.
- **Generación de QR, plantillas WhatsApp para el link** — son
  responsabilidad de los canales correspondientes (channel-whatsapp).
  El builder solo entrega `public_url` y otros módulos hacen lo que
  quieran con ella.
- **Métricas de uso del bundle desde el cliente final** — fuera de
  scope v1. Si se quiere analytics, módulo separado que el bundle
  llama por HTTP.

## 11. Tests (Fase 6 los implementa, aquí solo se declaran)

- Group 1 Lifecycle: onLoad publica `tarifas.config.solicitada`,
  onUnload limpia cache + cualquier timer.
- Group 2 Validación canónica: payloads publicados validan contra
  schemas AJV strict.
- Group 3 Hidratación: cache se actualiza correctamente desde los 4
  eventos del catálogo + 1 de tarifas.
- Group 4 Tools de presentación: actualizar producto sin que exista en
  catálogo aún → error `CATALOGO_NO_HIDRATADO`.
- Group 5 Tools de bundle: bundle se genera con productos enriquecidos,
  productos sin imagen no rompen el build.
- Group 6 Modos de fallo: deployer ausente, imagen sobredimensionada,
  producto huérfano.
- Group 7 Helpers POC2: los 5 helpers presentes y funcionando.

Wireo: `test:comandero-cliente-builder` en `package.json` +
`.github/workflows/validate.yml`.

---

## Decisiones cerradas con el operador (2026-05-26)

- **A — Deployer al cf-worker**: NO existe módulo reusable. El único
  deploy actual es manual y privado de `pizzepos/carta-digital`. Fase
  6a escribe bundle solo a disco; Fase 6b separada creará
  `cf-worker-deployer` como módulo hermano reusable. Documentado en
  sección 2.
- **B — Persistencia del bundle**: a disco vía `fs.write.request`.
  Documentado en sección 5.
- **C — Campos visuales (imagen, descripción pública, orden público)**:
  tabla propia del builder, NO extender `productos`. Documentado en
  sección 6.
- **D — Slug y ubicación**: `comandero-cliente-builder` en raíz
  (`modules/comandero-cliente-builder/`). Documentado en sección 1.
- **E — Catálogo de eventos**: OK al catálogo declarado. Los dos
  eventos de publicación quedan declarados pero solo se activan en
  Fase 6b (ver sección 2).

## Plan por fases (compromiso de scope)

- **Fase 6a — este builder, MVP a disco**:
  - Crear `modules/comandero-cliente-builder/` con `module.json`,
    `index.js` POC2, 2 tablas en sqlite, 4 tools de presentación + 1
    de build (sin `bundle.publicar`).
  - Copiar `static-template.js` desde `pizzepos/carta-digital` y
    especializarlo añadiendo carrito + gesto "enviar pedido" → MQTT
    de vuelta al sistema.
  - Bundle se persiste vía `fs.write.request` y el operador lo sube
    manualmente con `wrangler` mientras Fase 6b no exista.
  - Tests por capas wireados a CI.
  - Validate:ci PASS.
- **Fase 6b — cf-worker-deployer reusable (módulo hermano nuevo)**:
  - Extraer la lógica de `modules/pizzepos/carta-digital/cf-worker/`
    a módulo independiente que consume `*.bundle.publicacion.solicitada`
    y publica `*.bundle.publicado` / `*.bundle.publicacion.fallida`.
  - Migrar `carta-digital` a usarlo (no toca su template, solo el
    deploy).
  - Activar las 2 tools/eventos restantes del builder.
- **Fase 6c — `catalogo-pwa-template` común (opcional, solo si duele)**:
  - Si la duplicación del template entre `carta-digital` y este
    builder genera bugs o divergencia molesta, extraer a módulo
    común. Hasta entonces, "tres líneas similares mejor que
    abstracción prematura".

Solo Fase 6a entra en este horizonte de trabajo. 6b y 6c son
horizontes separados que se planifican cuando lleguen.
