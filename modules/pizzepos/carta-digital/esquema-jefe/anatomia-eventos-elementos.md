# ANATOMIA de eventos y elementos — carta-digital (alimento del prisma de 5 huecos)

> Fuente: modules/pizzepos/carta-digital/module.json (v2.24.0) + index.js
> (589 líneas leídas enteras) + proyeccion.js + static-template.js + el
> blueprint HIBRIDO vigente (carta-digital.blueprint.json, blueprint-1.4.0).

## 1. Eventos del módulo (publica / escucha / huecos)

PUBLICA (verificado en index.js, `eventBus.publish`):
- `cartadigital.carta_publica.actualizada` { project_id, correlation_id, timestamp }
  (L163, _reemitir): señal de RE-PROYECCION. Se dispara al oír CUALQUIER
  fuente del escaparate: carta.actualizada / carta.editada / carta.borrada /
  contenido.actualizado / marketing.perfil.actualizado (L62-66). Es la señal
  indirecta del custodio carta-manager: el proyector vuelve a proyectar y el
  frontend re-lee.
- `cartadigital.config.actualizada` { project_id } (L579) — SEÑAL PAREADA de
  update_config: la publica el propio handleUpdateConfig al persistir.
- `cartadigital.publicado` { project_id, slug, productos, imagenes } (L437) —
  SEÑAL PAREADA de publicar: sale SOLO tras escribir el bundle completo.
- `cartadigital.diseno.actualizada` (L237) — al persistir diseño (freno).
- RPC response: cartadigital.publicar.response / guardar_diseno.response /
  validar.response (correlados, para los cajones del blueprint híbrido).

ESCUCHA (L60-74):
- `tarifas.config.actualizada` + `tarifas.config.solicitada` (emite) — mapping
  canal->carta, cache interno.
- `carta.actualizada` / `carta.editada` / `carta.borrada` /
  `contenido.actualizado` / `marketing.perfil.actualizado` → _reemitir (la
  señal de arriba). 5 señales INDIRECTAS del custodio.
- `project.activated` / `project.deactivated` → rastreo multi-proyecto.
- `cartadigital.guardar_diseno.request` / `.validar.request` /
  `.publicar.request` → RPC de bus para los cajones del blueprint.

HUECO: NO hay `cartadigital.publicado` en module.json publishes (module.json
declara NO publishes; el hueco es de MANIFIESTO, el código sí publica).

## 2. Elementos — los 6 ui_handlers mapeados a necesidades del jefe

| ui_handler | handler | Necesidad que sirve | Rol |
|---|---|---|---|
| get_carta_publica | handleGetCartaPublica | La proyección al vuelo: lo que CONSUME el cliente final | utilizacion-anotada |
| get_config | handleGetConfig | VER el config vigente (dominio + opciones) antes de decidir | neutro |
| update_config | handleUpdateConfig | DECLARAR el config del canal (dominio + opciones PWA) | jefe |
| get_diseno | handleGetDiseno | VER el diseño (card_template + tema_css) compuesto para el proyecto | neutro |
| preview | handlePreview | VER el render real SIN publicar (iframe srcdoc) — dictamen visual | neutro |
| publicar | handlePublicar | LA TRANSICIÓN: escribir el bundle público que ve todo el mundo | jefe-transicion |

## 3. Invariantes del módulo (fuentes, custodios, estado)

- INV1 — PROYECTOR SIN SEÑAL PROPIA de contenido: la carta pública se proyecta
  AL VUELO (proyeccion.js) bebiendo tarifas + carta-manager + marca + contenido.
  NINGUNA op del proyector compone ni guarda snapshots: lo que ve el cliente
  SIEMPRE bebe de las fuentes reales. Lo ÚNICO que posee = config del canal
  (/pizzepos/carta-digital/config.json: dominio_publico + opciones_visualizacion).
- INV2 — SIN 404 de lectura de config: _leerConfig SIEMPRE responde (si el
  fichero falta o no parsea → default { _version:'1.0', dominio_publico:null,
  opciones_visualizacion:{} }, L209-210). Config ausente = ESTADO NOMBRADO
  («sin configurar»), no error.
- INV3 — update_config es MERGE por bloques: solo acepta dominio_publico y
  opciones_visualizacion (L572-576); branding/productos NO se guardan aquí (se
  beben de marca/carta). Respuesta 200 con el config COMPLETO = dictamen en la
  respuesta (mismo patrón que entrega/ConfigCustodio).
- INV4 — PUBLICAR es TRANSICIÓN grande con 2 FREÑOS y 1 GUARD de proyecto:
  (a) guard anti-cross-project 412 si el objetivo no es el ÚLTIMO proyecto
  activado (fs escribe en el activo, L309); (b) freno de render real (render.
  verificar.request al órgano verificador-visual): 422 si renderiza rota o se
  sale del ancho en móvil (overflow_movil = bloqueo para una PWA de móvil,
  v2.24.0); (c) auto-activa feature `www` (best-effort, idempotente). Publica
  `cartadigital.publicado` y responde { alojada_url, bundle_dir, productos,
  imagenes_copiadas, extras_sin_precio, feature_www, aviso }.
- INV5 — PREVIEW = dictamen visual FIEL: genera el MISMO generateStaticHTML
  que ve el cliente (variante SUELTA, checkout WhatsApp), inlinea imágenes como
  data: URI y devuelve { html, productos, extras_sin_precio }. NO escribe nada.
  El frontend lo mete en un iframe srcdoc = el jefe REVISA la carta como la
  verá el público antes de publicar.
- INV6 — ESTÁTICO, no al vuelo: publicar hornea un bundle; CADA cambio
  (config/carta/marca/contenido) exige VOLVER A publicar. El aviso del
  reflejo lo transmite tal cual (aviso en la respuesta).
- INV7 — multi-tenant: todo RPC lleva project_id; el fs escribe en el ÚLTIMO
  proyecto activado — el guard de INV4 falla CLARO (412 PRECONDITION_FAILED)
  si el objetivo no coincide (no_silent_failures).
- INV8 — extras a 0€ NO se ofrecen al cliente (gate precio_extra>0); el
  módulo devuelve extras_sin_precio + aviso_extras para que el dueño lo sepa
  (honestidad, no error).

## 4. Moneda

op.moneda es el SÍMBOLO de moneda que la PWA pinta ('€' default), no una cifra:
la UI lo edita como texto corto y lo envía tal cual (mismo comportamiento que
el actual OpcionesZone). Sin conversión ni formatos: es display, no cálculo.