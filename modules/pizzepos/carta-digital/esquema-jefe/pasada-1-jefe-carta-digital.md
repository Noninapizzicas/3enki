# PASADA 1 — prisma de 5 huecos con LENTE DE ROL JEFE sobre `carta-digital`

> Sujeto correcto (no el módulo entero): **la capacidad de carta-digital de
> servir las DECISIONES del rol JEFE sobre ESCAPARATE** — qué puede DECLARAR
> el dueño de la PWA pública (config del canal), cómo la REVISA antes de
> abrirla al público (preview = dictamen visual), y qué SEÑAL confirma.
> Ley de agnosticismo: cero tecnología de sistema ambiente.
> Fuente: modules/pizzepos/carta-digital/index.js (589 líneas, v2.24.0) +
> module.json + proyeccion.js + static-template.js.

## Hueco 1 — IDENTIDAD: ¿qué DECIDE el jefe aquí?

El jefe no compone la carta (la bebe) ni edita la marca (eso es marketing):
posee el CANAL. Dos decisiones, y solo dos, porque el módulo solo abre esas
palancas:

- **D1 — El config del canal** (`update_config`): dominio_publico y las
  opciones de la PWA (whatsapp_telefono para el checkout WhatsApp, moneda
  display, mensaje_pedido, pago_online/pedido_endpoint del camino online).
  Declarar esto = definir CÓMO funciona el escaparate (cómo pide el cliente,
  qué símbolo ve, dónde vive).
- **D2 — CUÁNDO el público ve la carta** (`publicar`): la TRANSICIÓN que
  hornea la proyección + diseño en el bundle estático y lo despliega a la
  URL pública (.publicado). Es una TRANSICIÓN grande: el estado visible
  cambia para TODO el público de golpe.

La proyección es VIVA (al vuelo) pero el despliegue NO: publicar hornea un
bundle — de ahí que el REVISAR antes de publicar (preview) sea parte de la
decisión de publicar, no un extra.

## Hueco 2 — RESTRICCIONES: ¿qué NO depende de él?

- **El dato lo custodian OTROS**: la carta vive en carta-manager, el branding
  en carta-marketing (marca), las imágenes/descripciones en contenido, el
  mapping canal→carta en tarifas. El proyector se LIMITA a BEBER de ellas —
  aquí no se edita ni un precio ni un plato (se redirige a su panel).
- **Lo que la UI puede declarar es SOLO lo del canal**: update_config valida
  y aplica dominio_publico + opciones_visualizacion; el resto del config no
  es suyo (merge por bloques en el handler, L572-576).
- **Los frenos NO son suyos**: el diseño (card_template/tema_css) lo compone
  el cajón disenar (freno de slots legal 1169/2011); el RENDER lo juzga el
  órgano verificador-visual al publicar (422 si roto/overflow móvil). El jefe
  recibe el freno, no lo adminstra.
- **El guard de proyecto**: publicar escribe en el ÚLTIMO proyecto activado;
  si el objetivo es otro, 412 PRECONDITION_FAILED con nombre — no es decisión
  del jefe, es del sistema multi-tenant.
- No decide: qué productos hay (carta), a qué canal va cada carta (tarifas),
  ni qué marca ve (marketing). Tampoco consume la carta: el cliente final
  lee la proyección, no este panel.

## Hueco 3 — CONTRATO: ¿qué VER antes de decidir y qué SEÑAL confirma?

- VER: `get_config` → { _version, dominio_publico, opciones_visualizacion } —
  SIEMPRE responde (sin 404: fichero ausente/malo → default nombrado).
- VER la proyección: `get_carta_publica` → { branding, categorias, productos,
  alergenos_leyenda, generado_at } — lo que la proyección servirá; 404
  NOMBRADO si el canal digital no tiene carta asignada (revisar tarifas).
- VER el LOOK: `get_diseno` → { card_template, tema_css, ... } (lo compuso
  Enki; el panel lo MUESTRA como contexto).
- DICTAMEN VISUAL: `preview` → { html, productos, extras_sin_precio } — el
  MISMO generateStaticHTML que verá el cliente (variante suelta), para un
  iframe srcdoc. El jefe REVISA antes de publicar.
- SEÑAL de confirmación tras declarar: `cartadigital.config.actualizada`
  (L579) + `cartadigital.carta_publica.actualizada` (re-emisión de las 8
  fuentes; la proyección y el preview se re-leen).
- SEÑAL de la TRANSICIÓN: `cartadigital.publicado` (L437) tras escribir el
  bundle; el dictamen completo viene en la respuesta de publicar
  (alojada_url + aviso — texto que se muestra tal cual, no se parafrasea).

## Hueco 4 — NO-OBJETIVOS: ¿qué caras NO son del jefe?

- **UTILIZACIÓN (fuera del panel-jefe)**: `get_carta_publica` es TAMBIÉN la
  cara del CLIENTE (lo que consume la PWA/cf-worker: mapping canal→carta,
  precio, alérgenos). En el panel-jefe NO abre captura propia: alimenta el
  PREVIEW (jefe REVISA), pero es la operación cara-cliente por excelencia —
  veredicto utilizacion (lo que consume el cliente). En el panel vive como
  ALIMENTO del dictamen visual, no como gesto del jefe.
- Las LLM-OPS del blueprint híbrido (redactar_descripcion, redactar_gancho,
  generar_imagen, vincular_imagen, disenar_carta_digital) viven en la PÁGINA
  (enriquecimiento por especialistas); el jefe de la PWA las CONSUME vía
  Enki/chat, no las conduce desde este panel. El enriquecimiento es de
  contenido (panel contenido), no del canal.
- SISTEMA: el bundle (storage/www), el cf-worker/export-cli (infra pública),
  las métricas del reflejo.

## Hueco 5 — PREGUNTAS_ABIERTAS (decisiones SUYAS, se nombran, no se cierran)

- [ABIERTO] **pedido_endpoint / pago_online** en la UI: el contrato los
  acepta en opciones_visualizacion y static-template los usa (botón pedir
  online), pero hoy no hay pantalla para declararlos (solo whatsapp/moneda/
  mensaje). Declarar pago online requiere backend detrás (tienda-api);
  decisión de negocio pendiente.
- [ABIERTO] **Programación de publicación**: carta-scheduler existe aparte;
  "publicar" aquí es AHORA. Un "programar republicación" es decisión suya
  que hoy no es declarable desde este módulo.
- [ABIERTO] **Multi-idioma / dominios por carta**: opciones_visualizacion no
  abre idioma ni variantes por zona; el canal es 1 PWA por proyecto.
- [ABIERTO] **Chat IA de la PWA**: el cerebro vive en cf-worker (SUELTO); el
  ALOJADO sale con chat OFF a propósito. Activarlo es una decisión de negocio
  (worker + credencial), no una palanca de este panel.

Huecos de CONTRATO (faltan campos/opciones en config.json v1.0), no de
CAPTURA: la UI no pide nada que el módulo no soporte.