# comandero-cliente-builder — mapa de eventos (PASO 0)

> Sin mapa no se toca el módulo. Este documento se valida con el operador
> antes de declarar `module.json`. Cualquier decisión marcada como
> `PENDIENTE` requiere OK explícito antes de pasar al PASO 1.

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

| evento | cuándo | payload mínimo | declarado |
|---|---|---|---|
| `comandero-cliente.producto.presentacion.actualizada` | tras editar imagen/descripción/orden de un producto | `{producto_id, project_id, presentacion: {imagen_url?, descripcion_publica?, orden_publico?, oculto_publico?}}` | sí |
| `comandero-cliente.bundle.generado` | tras compilar el artefacto PWA del proyecto | `{project_id, bundle_id, bundle_path, productos_count, generado_en}` | sí |
| `comandero-cliente.bundle.publicacion.solicitada` | el builder pide al deployer que suba el bundle al cf-worker | `{project_id, bundle_id, bundle_path, target_url}` | sí |
| `comandero-cliente.bundle.publicado` | tras confirmar publicación exitosa | `{project_id, bundle_id, public_url, publicado_en}` | sí |
| `comandero-cliente.bundle.fallido` | error en cualquier fase (build o publish) | `{project_id, bundle_id?, fase, error: {code, message}}` | sí |

**Verbos**: `actualizada`, `generado`, `solicitada`, `publicado`,
`fallido` — todos canónicos en `naming.json` (es).

**`correlation_id`**: propagado en todos. Originador = la tool que el
operador invoca desde el agente que orquesta la vertical.

**PENDIENTE A**: ¿el deployer al cf-worker es un módulo existente del
sistema o lo creamos en esta fase? Si existe ya `cf-worker-deployer` o
similar, `comandero-cliente.bundle.publicacion.solicitada` apunta a su
evento canónico de input. Si no, queda como deuda anotada y el builder
solo escribe el bundle a disco en una primera iteración.

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

| tool | qué hace | parámetros |
|---|---|---|
| `comandero-cliente.producto.presentacion.actualizar` | añade/edita imagen, descripción, orden público de un producto | `{project_id, producto_id, imagen_url?, descripcion_publica?, orden_publico?, oculto_publico?}` |
| `comandero-cliente.producto.imagen.subir` | sube imagen al storage y devuelve url canónica | `{project_id, producto_id, imagen_base64, content_type}` |
| `comandero-cliente.categoria.orden.actualizar` | reordena categorías para la vista pública | `{project_id, orden: [categoria_id, ...]}` |
| `comandero-cliente.bundle.generar` | compila el bundle PWA del proyecto y devuelve `bundle_path` | `{project_id, identidad: {marca, colores, logo_url?}}` |
| `comandero-cliente.bundle.publicar` | dispara la publicación al cf-worker (emite `bundle.publicacion.solicitada`) | `{project_id, bundle_id}` |

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

**PENDIENTE B**: ¿persiste el bundle en disco (en directorio gestionado
por el módulo `filesystem`) o lo sube directamente al cf-worker en
streaming sin paso intermedio en disco? La opción "a disco primero" da
trazabilidad y permite reintentar la publicación sin regenerar.
Recomiendo a disco. OK necesario.

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

**PENDIENTE C**: confirmar esta decisión (mover los campos visuales al
builder en vez de a productos). Es un cambio sobre lo que dije en la
conversación.

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
- **`filesystem`**: para escribir el bundle a disco. Vía evento
  `fs.write.request` (canónico).
- **`project-manager`**: para resolver `project_id` activo en tools
  invocadas sin él explícito.
- **`cf-worker` (deployer)**: PENDIENTE A — depende de si existe ya.

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

## Decisiones a cerrar antes de pasar al PASO 1

- **PENDIENTE A**: ¿existe ya un módulo deployer al cf-worker reusable,
  o el builder solo escribe a disco en v1 y la publicación queda como
  trabajo pendiente del proyecto?
- **PENDIENTE B**: ¿bundle a disco primero (recomendado) o stream
  directo al cf-worker?
- **PENDIENTE C**: ¿OK al cambio de "extender productos" → "tabla
  propia en el builder" para los campos visuales?
- **PENDIENTE D**: ¿el slug `comandero-cliente-builder` en raíz, o
  prefieres `pizzepos/comandero-cliente-builder` para mantenerlo bajo
  el namespace que consume?
- **PENDIENTE E**: ¿algún evento que falte o que sobre en el catálogo
  declarado en la sec. 2?
