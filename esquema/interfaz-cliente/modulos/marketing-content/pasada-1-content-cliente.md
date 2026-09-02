# Pasada 1 — marketing-content desde el CLIENTE

**Sujeto**: Los datos de marketing-content que el cliente final ve, consume o que condicionan
la interfaz que recibe. Este módulo es el PROVEEDOR PRINCIPAL de contenido-cliente:
las piezas publicadas SON lo que el cliente lee, ve y consume.

**Fuente**: `modules/marketing-content/` — híbrido (reflejo + blueprint), store `STORE_VACIO`.

---

## IDENTIDAD

El **catálogo de contenido publicado**. A diferencia de marketing-strategy (donde solo
un subconjunto tiene cara pública), marketing-content EXISTE PARA el cliente: las piezas
en estado `publicado` son literalmente el contenido que la interfaz presenta.

Pero no todo sale: la pieza en `idea` o `borrador` es trabajo interno, y los metadatos
de gestión (madre_id, etapa_funnel, canal_id como clasificación) son estructura interna
que el cliente no ve.

**La diferencia clave con strategy**: strategy produce FRAGMENTOS fijos (headline,
subheading, trust badges) que siempre van al mismo sitio. Content produce CONTENIDO
VARIABLE — artículos, landings, emails, posts — que se distribuye por múltiples
presencias y páginas según su formato y canal.

---

## RESTRICCIONES

| Restricción | Detalle |
|---|---|
| **Estado = filtro** | Solo piezas con `estado: "publicado"` salen al cliente. Los estados `idea`, `borrador`, `revision`, `retirado` son internos. |
| **Formato = destino** | El formato (`articulo`, `landing`, `email`, `post_social`, `faq`, `guia`, `caso_exito`, `video`) determina DÓNDE y CÓMO se presenta. |
| **Fragmentación madre→hijas** | Una pieza madre puede tener hijas (extractos). La relación madre_id es estructura interna — pero las hijas publicadas salen INDEPENDIENTEMENTE al cliente. |
| **Formatos válidos** | `articulo`, `video`, `infografia`, `landing`, `email`, `post_social`, `podcast`, `caso_exito`, `guia`, `faq`, `otro` (11 formatos). |
| **State machine** | `idea → borrador → revision → publicado → retirado`. Irreversible desde `publicado` (solo puede pasar a `retirado`). |

---

## CONTRATO (lo que el cliente RECIBE)

| Dato fuente | ¿Cliente? | Cómo llega |
|---|---|---|
| `pieza.titulo` | **SÍ** | Título del artículo, encabezado de landing, asunto de email |
| `pieza.contenido` | **SÍ** | Cuerpo del texto/contenido que el cliente lee |
| `pieza.descripcion` | **SÍ** | Meta description, resumen en listados (blog index, card) |
| `pieza.formato` | PARCIAL | El cliente no ve "formato=articulo" pero el formato determina la PRESENTACIÓN (blog post vs landing vs email) |
| `pieza.canal_id` | PARCIAL | Determina en QUÉ presencia aparece (web, email, instagram) — el cliente no ve el campo, ve el resultado |
| `pieza.estado` | NO (filtro) | Solo `publicado` sale. El cliente no ve estados. |
| `pieza.etapa_funnel` | NO | Clasificación interna para el jefe |
| `pieza.madre_id` | NO | Relación de fragmentación interna |
| `pieza.id` | NO | Identificador técnico |

---

## NO-OBJETIVOS (para el cliente)

| Dato | Por qué NO es para el cliente |
|---|---|
| `pieza.estado` (como campo) | El cliente no sabe que existe un estado. Ve o no ve la pieza. |
| `pieza.etapa_funnel` | "awareness" / "conversion" son conceptos del jefe, no del cliente |
| `pieza.madre_id` | Que un post de Instagram sea extracto de un artículo es gestión interna |
| `resumen.por_estado` | Contadores internos de piezas por estado |
| `resumen.madres_con_hijas` | Métrica de fragmentación interna |
| Piezas con estado ≠ publicado | Trabajo en progreso del equipo |

---

## PREGUNTAS ABIERTAS

1. **¿Las piezas de formato `email` se renderizan en la web también?**
   La newsletter pc-005 tiene contenido rico. ¿Se publica como página web ("ver en el navegador")
   además de enviarse como email? → Si sí, el conversor genera una versión web de la pieza email.

2. **¿El contenido nulo (pc-002, pc-004, pc-008) indica que el contenido es generado
   por otro sistema o que falta rellenar?**
   Landings y vídeos tienen `contenido: null` pero `descripcion` rellena.
   → Si el contenido se genera por otro sistema (carta-digital para la landing de carta,
   por ejemplo), el conversor debe saber cuándo delegar.

---

## Piezas encontradas

A diferencia de strategy (donde las piezas son campos fijos del store), aquí las piezas
son DINÁMICAS — cada proyecto tiene un número variable de piezas de contenido. El conversor
no mapea campos fijos a secciones; agrupa piezas por formato y las distribuye:

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| C1 | **Artículos publicados** | ATÓMICO | Piezas con formato=articulo y estado=publicado → se presentan en blog/about |
| C2 | **Landings publicadas** | ATÓMICO | Piezas con formato=landing → se convierten en páginas independientes |
| C3 | **Emails publicados** | ATÓMICO | Piezas con formato=email → se renderizan y envían por el canal email |
| C4 | **Posts sociales publicados** | ATÓMICO | Piezas con formato=post_social → se envían al canal social correspondiente |
| C5 | **FAQ publicadas** | ATÓMICO | Piezas con formato=faq → alimentan la sección/página FAQ |
| C6 | **Guías publicadas** | ATÓMICO | Piezas con formato=guia → se presentan como recursos/descargas |
| C7 | **Casos de éxito publicados** | ATÓMICO | Piezas con formato=caso_exito → alimentan testimonios/social proof |
| C8 | **Vídeos publicados** | ATÓMICO | Piezas con formato=video → se embeben en páginas o se publican en canal vídeo |
| C9 | **Contenido por tipo de página** | ATÓMICO | El conversor agrupa piezas y las asigna a las secciones de cada página |

**Suelo alcanzado** — piezas atómicas. No hay SPAWN: cada formato es una variante del
mismo conversor (filtrar por estado+formato → presentar).
