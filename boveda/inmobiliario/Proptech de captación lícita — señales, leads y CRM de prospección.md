---
tipo: nota
sector: inmobiliario
tags: [inmobiliario, proptech, leads, prospeccion, crm, licitud, españa]
cosechado: 2026-07-15
fuente: realadvisor.es/pro, betipo.es, en.lystos.com, get.witei.com, mobiliagestion.es, idealista.com/tools, iaenmalaga.es
---
# Proptech de captación lícita (España)

> Complementa [[Contactar propietarios — prospección, captación y RGPD]] (el marco legal) y
> [[Stack de herramientas — CRM, portales y firma electrónica]] (el stack general). Aquí:
> herramientas concretas de generación de leads/captación y su nivel de licitud, distinguiendo lo
> ya comercial de lo que habría que construir.

## Tres categorías de herramientas, tres niveles de licitud distintos

### 1. Valoración como imán de leads — lícito, consentimiento explícito propio

El propietario introduce voluntariamente su dirección y contacto para recibir una valoración; esa
acción genera una base legal de consentimiento para ese propósito (ver detalle RGPD en
[[Contactar propietarios — prospección, captación y RGPD]]). Herramientas comerciales de este tipo:

- **RealAdvisor Pro** — "lead magnet" de valoración gratuita integrable en la web propia del agente;
  combina anuncios activos, transacciones históricas y valoraciones percibidas (declara evaluar
  ~70 criterios frente a los ~20-30 de portales generalistas). Se presenta como valoración sin
  exigir contacto posterior obligatorio con agentes — modelo más orientado a herramienta neutral
  que a "cebo puro" de leads.
- **Witei** — CRM con widget de valoración automática propio integrado en la web del agente,
  orientado explícitamente a "captación de propietarios".
- **Idealista/Fotocasa (modelo del propio portal)** — tasación gratuita del portal que conecta al
  propietario con agencias asociadas que pagan por el contacto; el propietario da su consentimiento
  al portal, pero — como ya señala [[Contactar propietarios — prospección, captación y RGPD]] —
  eso no exime a la agencia receptora de tener su propia base legal para usos posteriores del dato
  más allá de responder a esa consulta puntual.

### 2. Datos de primera mano del propio portal — lícito, sin scraping de terceros

- **idealista/tools — "mapa de captación"**: muestra en un mapa los inmuebles cuyos propietarios
  han solicitado recientemente una valoración **al propio Idealista**, para que agencias
  profesionales suscritas se anticipen antes de que el propietario publique el anuncio. Es lícito
  porque es el propio portal ofreciendo su propio dato de primera parte a su cliente profesional —
  no es scraping de datos de terceros ni de otros portales.

### 3. Agregadores de anuncios de particulares (FSBO) entre portales — zona a examinar, no zona limpia por defecto

Herramientas como **Betipo** y **Lystos** se presentan como software de "captación de propietarios":
detectan inmuebles publicados directamente por particulares (sin agencia) **en todos los portales**,
con filtros por zona/tipo/antigüedad de publicación, y dan acceso a **teléfono y dirección** del
anunciante mediante alertas casi inmediatas (Lystos declara avisar por WhatsApp "más rápido que los
propios portales").

⚠️ **A verificar / zona de riesgo, no de "todo vale"**: estas herramientas no detallan en sus
propias páginas comerciales cómo obtienen ese teléfono/dirección "mediante su algoritmo" a partir
de anuncios ajenos en portales de terceros — el patrón descrito (rastreo automatizado de anuncios
de particulares en múltiples portales para extraer datos de contacto) es exactamente el tipo de
actividad que [[Contactar propietarios — prospección, captación y RGPD]] señala como zona de
riesgo cuando viola los términos de servicio del portal origen. Que una herramienta se venda
comercialmente **no** implica que su método de obtención de datos cumpla los ToS de cada portal
de origen ni el RGPD sobre el dato personal del propietario extraído sin su consentimiento directo
a la herramienta. Mismo patrón ya señalado con Hostreach en la nota de RGPD: la herramienta
traslada la responsabilidad legal al usuario final en sus condiciones de uso.

**Vía limpia equivalente** para el mismo objetivo de negocio (encontrar FSBO): contacto directo
manual desde el anuncio público del portal (ya lícito, ver [[Contactar propietarios — prospección, captación y RGPD]]),
o uso de la **API oficial de Idealista para desarrolladores** donde exista acceso autorizado.

## CRM con módulo de prospección — la vía comercial más limpia para escalar

- **Witei** — automatización de marketing, WhatsApp Business integrado, valoración automática,
  portal web propio incluido; citado como CRM con mejor automatización de marketing del sector en
  España en 2026.
- **Inmovilla** — CRM más veterano y extendido de España (>20 años), publicación automática en
  +20 portales, gestión de leads, módulo de bolsa/MLS integrado (ver [[MLS inmobiliarias y colaboración — cómo funciona en España]]).
- **Mobilia** — módulo de prospección dedicado: información de anuncios publicados a diario en los
  principales portales (particulares y agencias), con alertas guardadas por zona/características.
  Mismo matiz de licitud que el punto 3 anterior si el origen del dato de contacto no es API
  oficial — no se auditó el método concreto de Mobilia en esta cosecha, ⚠️ a verificar antes de
  adoptarlo si el objetivo es "trabajar tranquilo".

## Qué es comercial (comprar) vs qué habría que construir

**Comprar — ya resuelto por el mercado:**
- Valoración automática con widget de captación integrable en web propia (RealAdvisor, Witei).
- CRM con gestión de leads y multipublicación (Witei, Inmovilla, Mobilia).
- Acceso a datos de primera parte del propio portal donde el agente ya es cliente profesional
  (idealista/tools mapa de captación).

**Construir o auditar antes de comprar (zona donde la ventaja o el riesgo se juega de verdad):**
- Verificación previa de cómo obtiene cada agregador de FSBO (Betipo, Lystos, Mobilia) el dato de
  contacto — pedirlo explícitamente al proveedor antes de contratar, no asumir que "vender el
  servicio" implica que el método es limpio.
- Scoring propio de leads con datos históricos de conversión de la propia cartera — ningún CRM
  genérico lo modela igual para cada negocio (ya señalado en [[Stack de herramientas — CRM, portales y firma electrónica]]).

## Big data e IA para señales de venta — tendencia declarada, no producto maduro para captación individual

Fuentes proptech de 2026 (iaenmalaga.es) declaran la IA como "columna vertebral" del sector con
foco en predicción de zonas con plusvalía o riesgo de sobreoferta — pero esto se cosecha como
**tendencia de análisis de mercado agregado** (útil para decidir dónde prospectar), no como un
producto comercial maduro y verificado en esta pasada que identifique automáticamente "este
propietario concreto va a vender pronto" de forma lícita y lista para usar. ⚠️ No se encontró en
esta cosecha una herramienta española que declare abiertamente cómo genera señales de intención de
venta a nivel de propietario individual sin pasar por alguna de las tres categorías ya descritas
arriba — tratar cualquier promesa de ese tipo con escepticismo hasta auditar su fuente de datos.

## Relación con el resto del sector

Esta nota es la capa "herramientas" de la vía sólida de captación; la capa "legal" es
[[Contactar propietarios — prospección, captación y RGPD]] y la capa "contractual" es
[[Nota de encargo y hoja de visita]]. Las tres juntas cierran el círculo: encontrar el propietario
lícitamente, contactarlo lícitamente, y formalizar el encargo de forma exigible.
