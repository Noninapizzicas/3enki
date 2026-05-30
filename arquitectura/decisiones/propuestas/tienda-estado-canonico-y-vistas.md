# Tienda — estado canónico y vistas operativas

> **Documento para retomar.** Captura el plan para hacer el subsistema-tienda
> **visible y operable para los cuatro perfiles que lo usan**: operador del
> repo, desarrollador nuevo, LLM del chat y comerciante (dueño del negocio).
> Caso piloto: vapers; visión multi-vertical heredada del documento hermano
> `vertical-tienda-pwa-sin-datos.md` (2026-05-26).
>
> **No reemplaza** ese documento ni el contrato `subsistema-tienda.contract.json`
> v1.0.0. Construye sobre ambos.
>
> Fecha: 2026-05-30. Cocinado con la skill `ana` (horizonte abierto).

Documentos hermanos:
- `vertical-tienda-pwa-sin-datos.md` (2026-05-26) — visión vertical end-to-end (PWA + WhatsApp + recogida presencial). Documento de fondo, no se altera.
- `_arranque-vertical-tienda-pwa-sin-datos.md` — guion de arranque del horizonte original.

Contratos vivos referenciados:
- `subsistema-tienda.contract.json` v1.0.0
- `project-feature-blueprints.contract.json` v1.0.0
- `project-identity.contract.json` v1.1.0
- `events.contract.json`, `lifecycle.contract.json`

---

## 1 · Por qué existe este documento

En la sesión 2026-05-30 (con skill `ana`) emergió un hallazgo central tras
verificar disco: el sistema **ya tiene varias piezas tocando "tienda"**
distribuidas en sitios distintos, sin un objeto canónico que las una. La
consecuencia: nadie — ni el operador, ni un dev nuevo, ni el LLM del chat,
ni el comerciante — puede ver de un vistazo qué estado tiene una tienda y
qué se puede operar sobre ella.

Las piezas verificadas en disco hoy:

- `modules/pizzepos/carta-digital/cf-worker/worker.js` (194 LOC) — proxy de
  chat LLM a DeepSeek para PWAs públicas. Despliega en Cloudflare.
- `modules/pizzepos/carta-digital/static-template.js` (1504 LOC) — genera el
  HTML de la PWA pública (catálogo + branding + WhatsApp button).
- `modules/pizzepos/carta-digital/export-cli.js` (150 LOC) — **CLI manual**
  que llama a `static-template.js`, escribe HTML a una carpeta local y dice
  *"súbelo a Netlify drop o GitHub Pages"*. Sin invocación desde el bus.
- `modules/comandero-cliente-builder/` (módulo JS POC2 del bus) — genera
  bundle del **comandero del operador** (interfaz para quien atiende, no
  para el cliente final). Escribe a `storage/comandero-cliente-builder/`.
- `modules/conversacion/ai-agent-framework/agents/cartadigital-pwa-builder.json`
  — agente legacy que **genera contenido PWA en su response pero NO lo persiste**.
  El caller decide dónde escribirlo.
- `modules/whatsapp-bot/` — módulo declarado, pendiente de verificar
  implementación completa.
- `modules/tienda-api/` — backend POST `/tienda/pedido/:project` recibe
  pedidos desde la PWA pública.
- `blueprints/project-types/tienda.json` (v1.0.0, creado 2026-05-30) — feature
  declarativa que al activarse crea bundle inicial en `storage/tienda/bundle/`
  + symlink `/opt/enki/public/shop/<slug>` → ese path.
- `deployment/caddy/Caddyfile.vps` — bloque `handle_path /shop/*` que sirve
  desde `/opt/enki/public/shop/` los bundles de cualquier proyecto que tenga
  la feature activa.
- `modules/_subsistema-tienda/subsistema-tienda.modulo-base.blueprint.json`
  (v0.1.0) — blueprint padre abstracto del subsistema.

**Lo que falta**: un objeto único que **cualquiera de los cuatro perfiles
puede consultar** para saber qué estado tiene la tienda de un proyecto.
Hoy ese estado está esparcido entre disco (`storage/comandero-cliente-builder/`,
`storage/tienda/bundle/`, `metadata.features` en SQLite, config.json), agentes
que no persisten, CLIs sueltos y servicios externos (Cloudflare, Netlify).

---

## 2 · Estado verificado (qué hay en disco hoy)

Cocido tras leer el repo en la sesión 2026-05-30:

| Pieza | Tipo | Destino del bundle | Modo de invocación |
|---|---|---|---|
| `export-cli.js` + `static-template.js` | CLI standalone | Local → Netlify / GitHub Pages (manual) | `node export-cli.js --carta X --whatsapp Y` |
| `cf-worker/worker.js` | Cloudflare Worker | Servicio Cloudflare | Deploy manual con `wrangler` |
| `comandero-cliente-builder` | Módulo JS POC2 | `<base_path>/storage/comandero-cliente-builder/bundles/` | Vía bus `comandero-cliente.bundle.generar` |
| `cartadigital-pwa-builder` (agente) | Agente legacy | Genera en response, no persiste | `agent.execute.request` desde el LLM |
| `tienda` feature (nueva 2026-05-30) | Feature declarativa | `<base_path>/storage/tienda/bundle/` + symlink `/opt/enki/public/shop/<slug>` | Frontend ProjectPanel → checkbox |
| `tienda-api` | Módulo JS backend HTTP | n/a (recibe pedidos) | POST `/tienda/pedido/<slug>` desde la PWA |
| `whatsapp-bot` | Módulo JS | n/a (recibe webhooks) | Webhook Meta Cloud API |

No están conectados entre sí por un objeto compartido. Cada uno opera en
su carril.

---

## 3 · La pieza unificadora: `estado.json` de la tienda

Propuesta: **un objeto único por proyecto** en
`<base_path>/storage/tienda/estado.json` que describe la realidad
observable de la tienda del proyecto.

### 3.1 Por qué AHÍ

- Bajo `storage/tienda/` que ya es el namespace canónico del subsistema
  (consistente con `subsistema-tienda.contract.json` v1.0.0).
- Por proyecto (cada tienda tiene su propio estado, no uno global).
- Al lado del `bundle/` que ya canonizamos — proximidad semántica.

### 3.2 Shape ESBOZO (no schema cerrado)

```json
{
  "_version": "1.0",
  "_updated_at": "2026-05-30T18:00:00.000Z",

  "slug": "vapers",
  "activa": true,
  "nombre_negocio": "Vapers Alhama",

  "bundle": {
    "fuente": "vps-local",
    "ultimo_deploy_at": "2026-05-30T17:55:00.000Z",
    "ultimo_deploy_por": "cartadigital-pwa-builder",
    "tamaño_bytes": 7599,
    "archivos_presentes": ["index.html", "manifest.json", "sw.js"]
  },

  "url_publica": "https://enki-ai.online/shop/vapers",

  "catalogo": {
    "productos_total": 15,
    "ultima_actualizacion_at": "2026-05-30T17:00:00.000Z"
  },

  "canales_pedido": {
    "whatsapp": { "activo": true, "numero": "+34643283034" },
    "telegram": { "activo": true, "chat_id": "..." }
  },

  "ofertas_activas": [],
  "pedidos_hoy": 0,
  "alertas": []
}
```

**Importante**: este shape es esbozo, no schema cerrado. El día a día lo
refina. NO precompilar enum de `bundle.fuente` (puede crecer: `vps-local`,
`netlify`, `github-pages`, `cf-worker`, otros). NO precompilar lista de
`canales_pedido` (otros emergerán).

### 3.3 Quién lo actualiza

Cualquier módulo del subsistema-tienda que altere algo del estado de la
tienda. Patrón canónico: el módulo emite **un patch** con los campos que
cambia y un módulo único del subsistema (o el propio `subsistema-tienda`)
lo aplica al `estado.json` via `fs.edit`. Publish `tienda.estado.actualizado`
con `{ project_id, slug, campos_cambiados[], correlation_id }`.

Decisión por cocinar (sección 7): si el patch es directo (cada módulo
escribe en `estado.json`) o si hay un agregador centralizado.

---

## 4 · Las cuatro vistas

```
┌─────────────────────────────────────────────────────────────────┐
│  <base_path>/storage/tienda/estado.json  (fuente única)         │
└──┬──────────┬──────────┬──────────┬──────────────────────────────┘
   │          │          │          │
Operador  Dev nuevo    LLM      Comerciante
   │          │          │          │
 cat / log   contrato   contexto   TiendaDashboard.svelte
            apunta      inyectado  en frontend
```

### 4.1 Operador (tú con detalle técnico)

Consume el `estado.json` directo (cat / Read) o vía bus
(`fs.read.request` con `path: '/storage/tienda/estado.json'`). Útil para:

- Debugging (¿por qué la URL pública sirve viejo?)
- Auditoría de despliegues (¿cuándo se actualizó? ¿quién?)
- Validación cross-proyecto (un script puede leer todos los `estado.json` y
  reportar problemas globales)

### 4.2 Desarrollador nuevo

Llega al repo sin pista previa. Necesita **entry point** del subsistema.
El contrato `subsistema-tienda.contract.json` apunta a `estado.json` como
*"objeto de entrada para entender el subsistema"*. Un párrafo en CLAUDE.md
o en el README del subsistema dice *"para entender qué hace una tienda,
lee el `estado.json` del proyecto + el contrato"*.

### 4.3 LLM del chat

Cuando el usuario está en `page_id=carta-digital` o `page_id=tienda` y
hace cualquier petición sobre la tienda, ai-gateway inyecta el `estado.json`
del proyecto activo como contexto. El LLM razona con ese estado real, no
con suposiciones. Pseudocódigo de la inyección:

```
on chat.prompt.ready:
  if page_id in ['carta-digital', 'tienda', otros del subsistema]:
    estado = fs.read('/storage/tienda/estado.json', project_id)
    if estado.status === 200:
      effectiveSystem += "\n\n# ESTADO ACTUAL DE LA TIENDA\n" + estado.content
```

### 4.4 Comerciante

Componente Svelte nuevo: `TiendaDashboard.svelte`. Vive en
`frontend/src/lib/modules/tienda/` o equivalente. Muestra los campos del
`estado.json` con UI legible:

- Card "Tu tienda": URL pública, último deploy, productos en catálogo
- Card "Canales": WhatsApp / Telegram activos o no
- Card "Pedidos hoy"
- Card "Alertas" si hay
- Botones de acción: "Regenerar PWA", "Editar branding", "Ver pedidos"

Se suscribe a `tienda.estado.actualizado` para refrescarse en vivo.

---

## 5 · Plan en fases (estimación en horas, ajustable)

### Fase 0 — Documentación y contrato (sin código, 1-2h)

- [ ] Bump `subsistema-tienda.contract.json` v1.0.0 → v1.1.0. Añadir sección
      `objeto_estado_canonico` que apunta a `storage/tienda/estado.json` y
      enumera los campos esbozo (sin cerrar enums).
- [ ] Añadir evento canónico `tienda.estado.actualizado` al contrato + al
      blueprint padre del subsistema. Shape: `{ project_id, slug, campos_cambiados[], correlation_id, timestamp }`.
- [ ] Actualizar `_doc` del blueprint padre `subsistema-tienda.modulo-base`
      con referencia al estado.json como entry point.

### Fase 1 — Schema y validator (1-2h)

- [ ] `arquitectura/decisiones/_schemas/subsistema-tienda/estado.schema.json`
      con AJV strict 2020-12 `additionalProperties:true` (no cerrado, solo
      validates lo conocido).
- [ ] Extender `subsistema-tienda.validate.js` con nuevo cross-check:
      `drift_estado_json_no_canonico` — si el estado.json existe, valida shape.

### Fase 2 — Bootstrap del estado.json (2-3h)

- [ ] Añadir a `tienda.json` (feature) un `initialFiles["storage/tienda/estado.json"]`
      con el shape esbozo + slug sustituido + `_updated_at` inicial. Así al
      activar la feature, el estado existe.
- [ ] Modificar `_initializeFromBlueprint` si emerge necesidad (probablemente no).

### Fase 3 — Helper canónico para actualizar el estado (2-3h)

- [ ] Decidir: ¿módulo nuevo `tienda-estado` que centraliza los patches o
      cada módulo del subsistema edita directo con `fs.edit`?
- [ ] Si centralizado: módulo nuevo escucha eventos del subsistema (deploy
      bundle, oferta creada, pedido entrado) y actualiza estado.json.
- [ ] Si descentralizado: cada módulo aplica `fs.edit` directo + publica
      `tienda.estado.actualizado`. Simple pero N módulos saben del shape.

### Fase 4 — Vista del LLM (1-2h)

- [ ] Modificar `ai-gateway` (o `prompt-builder`, según convenga) para que
      cuando `page_id` esté en la lista del subsistema-tienda, inyecte el
      estado.json del proyecto como contexto adicional.
- [ ] Cuando el LLM produce respuesta, puede recibir `tienda.estado.actualizado`
      durante el turno y reflejarlo en su próximo razonamiento.

### Fase 5 — Vista del comerciante (3-4h)

- [ ] `frontend/src/lib/modules/tienda/TiendaDashboard.svelte` que consume
      el estado.json vía MQTT (`fs.read.request`) y se suscribe a
      `tienda.estado.actualizado` para refrescos en vivo.
- [ ] Sección "Tienda" en el ProjectPanel del proyecto activo cuando
      `metadata.features.includes('tienda')`.

### Fase 6 — Documentación entry point (30 min)

- [ ] CLAUDE.md: párrafo nuevo en la entrada de `subsistema-tienda` que
      apunta a `estado.json` como entry point para devs nuevos.
- [ ] README del subsistema (si emerge necesidad).

### Fase 7 — Migración del estado actual de vapers (30 min)

- [ ] Crear manualmente el `estado.json` del proyecto vapers reflejando lo
      que YA está en disco (15 sabores Happ Bar, URL pública activa, etc.).
      Manual una vez; futuras tiendas lo crean automáticamente vía la feature.

### Fase 8 — Test runtime end-to-end (1h)

- [ ] Extender `tests/runtime-cases/subsistema-tienda-pwa-servida.js` con
      pasos que verifican estado.json: existe tras activar feature, se
      actualiza tras un evento del subsistema, lo lee bien el LLM como
      contexto.

**Total estimado**: 12-19h dependiendo de cuántas piezas hijas del subsistema
se tocan en Fase 3.

---

## 6 · Decisiones cerradas en esta cocina (sesión 2026-05-30)

| # | Decisión | Cierre |
|---|---|---|
| 1 | Path canónico del bundle | `storage/tienda/bundle/` en base_path (canonizado 2026-05-29 v1.0.0) |
| 2 | URL pública | `/shop/<slug>` (renombrado desde `/tienda/<slug>` para evitar colisión con tienda-api) |
| 3 | Servidor del bundle local | Caddy del VPS via `handle_path /shop/*` + symlinks |
| 4 | `cf-worker` legacy + Netlify export | **Conviven** con el sistema nuevo. NO se tira nada. Carriles paralelos para usos distintos |
| 5 | Comandero-cliente-builder | **No es del subsistema-tienda**. Produce el comandero del operador, namespace propio |
| 6 | Estado canónico de la tienda | `storage/tienda/estado.json` (nuevo en esta cocina) |
| 7 | Pieza unificadora para 4 perfiles | El propio estado.json. Cada perfil lo consume distinto |

---

## 7 · Decisiones AÚN abiertas

### 7.1 Centralizado vs descentralizado en mantenimiento del estado.json

- **A**: módulo nuevo `tienda-estado` escucha eventos del subsistema y aplica patches al estado.json. Centraliza el shape conocimiento en un solo sitio.
- **B**: cada módulo del subsistema aplica `fs.edit` directo sobre estado.json + publish `tienda.estado.actualizado`. Simple, distribuye el shape conocimiento entre N módulos.

Sin recomendación cerrada — se decide en Fase 3 con info real.

### 7.2 Inyección del estado.json al LLM

- **A**: siempre que `page_id` está en lista del subsistema.
- **B**: solo cuando el blueprint hijo del módulo activo declara explícitamente que necesita el estado.
- **C**: bajo demanda (el LLM lo pide como tool).

Sin recomendación cerrada — se decide en Fase 4.

### 7.3 Granularidad del shape

¿`pedidos_hoy: 0` se actualiza en tiempo real? ¿O es un campo derivado que se calcula al pedirse? Impacta el coste de mantenimiento del estado.json.

Sin recomendación cerrada — se decide al implementar Fase 3.

### 7.4 Multi-tenant cf-worker en estado.json

Si un proyecto usa el modelo legacy (PWA en Netlify + chat en cf-worker), el campo `bundle.fuente: "cf-worker"` apunta a... ¿dónde exactamente? URL del worker? Endpoint? El shape de `bundle.*` quizás necesita variar por fuente.

Sin recomendación cerrada — se decide cuando entre el primer proyecto que use modelo legacy + estado.json.

---

## 8 · Cómo arrancar la próxima sesión

1. Lee este doc entero (~10 min).
2. Lee `subsistema-tienda.contract.json` v1.0.0 + `vertical-tienda-pwa-sin-datos.md` (~15 min combinado).
3. Sigue el guion en `_arranque-tienda-estado-canonico-y-vistas.md`.

---

## 9 · Relación con contratos vigentes y propuesta hermana

- `subsistema-tienda.contract.json` v1.0.0 — bump a v1.1.0 en Fase 0 para añadir `estado.json` como objeto canónico.
- `project-feature-blueprints.contract.json` v1.0.0 — sin cambios, tienda.json sigue conforme.
- `vertical-tienda-pwa-sin-datos.md` (2026-05-26) — **complementa**, no reemplaza. Esa propuesta cubre la verticalidad (WhatsApp escueto + recogida presencial). Esta propuesta cubre la **observabilidad y operabilidad** del subsistema.
- `pseudocodigo-estilo.contract.json` — el código nuevo cumple los anti-patrones canonizados (sin rest-spread con omisión, sin Object.assign).
- `events.contract.json` — `tienda.estado.actualizado` cumple shape canónico (correlation_id, par success/failure si aplica).

---

## 10 · Frase resumen para retomar

> *"La tienda tiene cuatro perfiles que la miran: el operador, el dev nuevo,
> el LLM y el comerciante. Cada uno necesita ver lo mismo distinto. El
> `estado.json` por proyecto es la pieza única que los cuatro consumen.
> Próximo paso: bump del contrato a v1.1.0 con el objeto canónico declarado."*

---

## Cosas que NO se incluyen en este plan

- Migración del `cf-worker` o `static-template.js` o `export-cli.js`. Esas
  piezas legacy quedan como están.
- Cambio del modelo de despliegue (Caddy local vs Netlify/cf-worker). Ambos
  coexisten; el `estado.json` describe cuál usa cada proyecto.
- Refactor de `comandero-cliente-builder`. No es del subsistema-tienda.
- Cualquier cambio en `tienda-api` o `whatsapp-bot` más allá de publicar
  eventos que el estado.json refleja.

Si emerge necesidad, se reabre el alcance — pero no en v1.
