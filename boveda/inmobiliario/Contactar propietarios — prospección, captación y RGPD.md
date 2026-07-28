---
tipo: nota
sector: inmobiliario
tags: [inmobiliario, rgpd, captacion, prospeccion, legal, scraping]
cosechado: 2026-07-14
fuente: geccos.es, fotocasa.es blog profesional, respacio.com, idealista.com tools
---
# Contactar propietarios — prospección, captación y RGPD (España)

> Encuadre honesto: se documenta lo **lícito** y se marca lo **dudoso/no lícito** según lo cosechado.
> Esto no sustituye asesoría legal específica en protección de datos.

## Vías lícitas de captación

- **Contacto directo a partir de anuncios FSBO** ("particular", "sin agencia") en portales que
  permiten ver el anuncio públicamente — el propietario ha hecho pública su intención de vender/
  alquilar y sus datos de contacto en el propio anuncio; contactar por esa vía respetando el canal
  que el propietario habilitó (teléfono/formulario del anuncio) es la vía más limpia.
- **Puerta fría / prospección de zona** (buzoneo, tarjetas, visitas) — lícito como técnica comercial
  tradicional, sujeto a la normativa general de publicidad y, si se recogen datos, al RGPD desde el
  momento en que se registra el dato de un propietario concreto.
- **Referidos y recomendación** (esfera de clientes/contactos ya existente con base legal contractual
  o consentimiento).
- **Herramientas de valoración automática como gancho de captación**: el propietario introduce
  voluntariamente su dirección y contacto para recibir una valoración — genera una base legal de
  **consentimiento explícito** para ese propósito concreto (recibir la valoración y ser contactado
  al respecto), no un cheque en blanco para cualquier uso posterior.

## Base legal para tratar los datos (RGPD + LOPDGDD)

- La base legal principal para tratar datos de un cliente/propietario en el sector es la
  **ejecución de un contrato o medidas precontractuales** — p. ej. cuando solicita visitar un
  inmueble o firma un encargo/arrendamiento.
- Toda recogida de datos requiere **cláusula informativa**: quién trata el dato, con qué finalidad,
  cuánto tiempo se conserva y cómo ejercer los derechos (acceso, rectificación, supresión,
  oposición).
- **Comunicaciones comerciales/marketing** deben cumplir a la vez el RGPD y la **LSSI** (Ley de
  Servicios de la Sociedad de la Información): solo se puede enviar publicidad a quien ya tiene
  relación contractual previa con productos similares, o a quien ha dado **consentimiento expreso**.
- ⚠️ **Punto crítico y frecuentemente mal entendido**: un lead que llega desde un portal (Idealista,
  Fotocasa) **no exime a la agencia de su propia responsabilidad** sobre el uso posterior del dato.
  El consentimiento que el usuario dio al portal no cubre automáticamente acciones comerciales
  adicionales de la agencia — la agencia necesita su propia base legal para reutilizar ese contacto
  más allá de responder a la consulta puntual.

## Scraping de portales — zona de riesgo, no de "todo vale"

- Los términos de servicio de los grandes portales (Idealista en particular) **restringen o prohíben
  el scraping automatizado** y aplican medidas técnicas anti-bot activas (WAF, CAPTCHA,
  geo-restricción) — señal de que no lo consideran un uso permitido de su plataforma.
- Existe una **API oficial de Idealista para desarrolladores** (developers.idealista.com) con acceso
  bajo solicitud, autenticación por API key/OAuth, para quien necesite integrar anuncios de forma
  legítima — la vía correcta frente al scraping no autorizado.
- Los servicios comerciales de "scraping como servicio" (Apify, ScraperAPI, ScrapingBee, etc.)
  **trasladan la responsabilidad legal al usuario** en sus propios términos: no eximen de cumplir ni
  los términos del portal origen ni el RGPD sobre los datos personales que se extraigan.
- ⚠️ **Marcado como límite, no como recomendación**: extraer datos de contacto de propietarios
  mediante scraping que viole los términos de un portal es, como mínimo, un riesgo contractual frente
  al portal (bloqueo de cuenta, acción legal) y, si incluye datos personales usados para contactar
  sin base legal propia, un riesgo adicional de RGPD/LOPDGDD. La vía lícita documentada arriba
  (contacto directo desde el anuncio público, prospección de zona, API oficial) cubre el mismo
  objetivo de negocio sin ese riesgo.

## Herramientas de contacto (mencionadas en el mercado, sin profundizar en esta pasada)

Existen herramientas comerciales de "automatización de captación inmobiliaria" (p. ej. Hostreach,
citado en la cosecha) que declaran en sus propios términos de servicio la responsabilidad del
usuario sobre el uso lícito de los datos — mismo patrón que las plataformas de scraping: la
herramienta no blinda legalmente al agente que la usa. ⚠️ No se auditó en profundidad esta
herramienta concreta ni sus prácticas — a verificar antes de adoptarla. Ampliación del análisis de
licitud por categoría de herramienta (valoración-imán, datos de primera parte del portal,
agregadores de FSBO tipo Betipo/Lystos/Mobilia) en
[[Proptech de captación lícita — señales, leads y CRM de prospección]].

## Relación con el resto del sector

Esta nota es el complemento obligado de [[Dónde buscar producto — portales, obra nueva, subastas y bancos]]:
saber DÓNDE está el propietario potencial no resuelve CÓMO contactarlo lícitamente — esa es la
frontera real donde muchas agencias incurren en riesgo innecesario.
