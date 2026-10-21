# Simulación — Esquematizador sobre marketing-content RELLENO

**Proyecto**: Nonina Pizzicas
**Datos fuente**: `simulacion-datos.json` — 11 piezas de contenido, 9 publicadas, 1 borrador, 1 publicada sin contenido

---

## Paso 0 — Filtro de estado

De las 11 piezas del store, el esquematizador descarta primero las que NO son `publicado`:

| Pieza | Estado | ¿Sale? |
|---|---|---|
| pc-001 "La historia de Nonina" | publicado | **SÍ** |
| pc-002 "Carta otoño 2026" | publicado | **SÍ** (contenido=null, tiene descripción) |
| pc-003 "¿Por qué 72 horas?" | publicado | **SÍ** |
| pc-004 "Pide directo" | publicado | **SÍ** (contenido=null, tiene descripción) |
| pc-005 "Newsletter septiembre" | publicado | **SÍ** |
| pc-006 "Post: masa a las 5am" | publicado | **SÍ** |
| pc-007 "3 razones masa madre" | publicado | **SÍ** (hija de pc-003) |
| pc-008 "Vídeo Margherita" | borrador | **NO** ← descartado |
| pc-009 "Guía pedidos grupo" | publicado | **SÍ** |
| pc-010 "Opinión familia López" | publicado | **SÍ** |
| pc-011 "FAQ" | publicado | **SÍ** |

**10 piezas pasan el filtro.** 1 descartada (borrador).

---

## Ejecución de los conversores

### C1 — Artículos → blog

```
FILTRO: estado=publicado AND formato=articulo
RESULTADO: 2 piezas (pc-001, pc-003)
```

**Fragmentos producidos:**

```json
{
  "tipo": "blog-list",
  "destino": "blog",
  "items": [
    {
      "id": "pc-001",
      "tipo": "blog-post",
      "titulo": "La historia de Nonina: de un horno en Nápoles a tu barrio",
      "excerpt": "Artículo de marca que cuenta el origen del proyecto: la abuela (Nonina), la receta de masa madre y el viaje del horno napolitano a Madrid.",
      "cuerpo": "Todo empezó con un horno de leña en el barrio de Forcella, Nápoles...",
      "fecha": null,
      "etiquetas": ["marca", "historia", "napoles"]
    },
    {
      "id": "pc-003",
      "tipo": "blog-post",
      "titulo": "¿Por qué 72 horas de fermentación?",
      "excerpt": "Artículo educativo sobre la fermentación lenta: digestibilidad, sabor, textura.",
      "cuerpo": "La diferencia entre una pizza industrial y una artesanal no está en el topping...",
      "fecha": null,
      "etiquetas": ["educativo", "masa-madre", "fermentacion"]
    }
  ]
}
```

**Observación**: El `excerpt` viene de `pieza.descripcion`. Las etiquetas son un HUECO —
el conversor podría extraerlas del contenido, pero eso sería micro-agente (fuzzy). Como
reflejo, las deja null o las genera por heurística simple (palabras del título).

El artículo pc-001 también alimenta la página **About** (su temática es la historia de
la marca). El agrupador C9 lo asigna a ambos: blog + about.

---

### C2 — Landings → páginas independientes

```
FILTRO: estado=publicado AND formato=landing
RESULTADO: 2 piezas (pc-002, pc-004)
```

**Fragmentos producidos:**

```json
{
  "tipo": "landing-pages",
  "items": [
    {
      "id": "pc-002",
      "tipo": "landing-page",
      "titulo": "Nuestra carta de temporada — Otoño 2026",
      "descripcion": "Landing page de la carta estacional con las pizzas de otoño: calabaza, funghi porcini, trufa.",
      "cuerpo": null,
      "cta": null,
      "delegado_a": "carta-digital"
    },
    {
      "id": "pc-004",
      "tipo": "landing-page",
      "titulo": "Pide directo: sin comisiones, mismo sabor",
      "descripcion": "Landing para captar pedidos directos. Mismo precio, pizza más caliente, apoyas al pequeño comercio.",
      "cuerpo": null,
      "cta": { "texto": "Pedir ahora", "accion": "abrir-pedido-directo" }
    }
  ]
}
```

**Observación**: Ambas tienen `contenido=null`. El conversor detecta:
- pc-002: la temática es "carta" → delega a `carta-digital` (módulo existente que ya publica la carta)
- pc-004: la temática es "pedido directo" → genera landing con CTA, pero el cuerpo lo compone
  el ensamblador con datos de strategy (propuesta_valor, evidencias) + esta descripción

---

### C3 — Emails → newsletters

```
FILTRO: estado=publicado AND formato=email
RESULTADO: 1 pieza (pc-005)
```

**Fragmento producido:**

```json
{
  "tipo": "email-list",
  "destino": "email",
  "items": [
    {
      "id": "pc-005",
      "tipo": "email-render",
      "asunto": "Newsletter: El horno de Nonina — Septiembre 2026",
      "cuerpo": "Hola pizzalovers,\n\nSeptiembre huele a bosque...",
      "secciones_detectadas": [
        { "tipo": "intro", "texto": "Septiembre huele a bosque..." },
        { "tipo": "producto-nuevo", "items": ["Tartufata", "Zucca e Salsiccia"] },
        { "tipo": "evento", "nombre": "Cata de vinos naturales", "fecha": "viernes 20 de septiembre, 20:30h" },
        { "tipo": "oferta", "codigo": "DIRECTO10", "descuento": "10%", "condicion": "primer pedido directo" }
      ]
    }
  ]
}
```

**Observación**: El conversor de email va más allá del pass-through: parsea el contenido
y detecta SECCIONES dentro del email (productos nuevos, eventos, ofertas). Esto permite
que el renderizado (#23) aplique plantillas visuales por tipo de sección.

---

### C4 — Posts sociales → canal social

```
FILTRO: estado=publicado AND formato=post_social
RESULTADO: 2 piezas (pc-006, pc-007)
```

**Fragmentos producidos:**

```json
{
  "tipo": "social-posts",
  "destino": "instagram",
  "items": [
    {
      "id": "pc-006",
      "tipo": "social-post",
      "canal": "instagram",
      "texto": "5:17 de la mañana. El horno aún no está encendido pero la masa ya lleva 68 horas despertándose...",
      "hashtags": ["masaMadre", "pizzaNapolitana", "fermentacionNatural", "hechoAmano", "72horas", "sinAtajos", "pizzaMadrid"],
      "tipo_post": "imagen",
      "es_hija": false
    },
    {
      "id": "pc-007",
      "tipo": "social-post",
      "canal": "instagram",
      "texto": "Slide 1: Más digestible...\nSlide 2: Más sabor...\nSlide 3: Más crujiente...",
      "hashtags": [],
      "tipo_post": "carrusel",
      "es_hija": true,
      "madre_titulo": "¿Por qué 72 horas de fermentación?"
    }
  ]
}
```

**Observación**: El conversor extrae hashtags del contenido (todo lo que empieza con #)
y detecta el tipo de post (imagen vs carrusel por los "Slide N:"). `es_hija` es informativo
para el cliente (puede mostrar "basado en nuestro artículo sobre..."), no es gestión interna.

---

### C5 — FAQ → sección/página

```
FILTRO: estado=publicado AND formato=faq
RESULTADO: 1 pieza (pc-011)
```

**Fragmento producido:**

```json
{
  "tipo": "faq-section",
  "destino": "faq",
  "items": [
    { "pregunta": "¿Hacéis delivery?", "respuesta": "Sí, pedidos directos desde nuestra web. Radio: 4km." },
    { "pregunta": "¿Tenéis sin gluten?", "respuesta": "Sí, base sin gluten disponible (+2€). Avisa con 24h." },
    { "pregunta": "¿Se puede reservar?", "respuesta": "Sí, desde la web o por WhatsApp." },
    { "pregunta": "¿Cuánto tarda el delivery?", "respuesta": "35-45 min de media." },
    { "pregunta": "¿Tenéis opciones veganas?", "respuesta": "Marinara, Ortolana y cualquier pizza sin queso." },
    { "pregunta": "¿Aceptáis grupos grandes?", "respuesta": "Sí, hasta 20 personas con reserva previa." },
    { "pregunta": "¿Puedo personalizar mi pizza?", "respuesta": "Sí, puedes añadir o quitar ingredientes." },
    { "pregunta": "¿Tenéis carta de vinos?", "respuesta": "Sí, vinos naturales italianos seleccionados." },
    { "pregunta": "¿Dónde estáis?", "respuesta": "[Dirección], barrio de [X], Madrid." },
    { "pregunta": "¿Cuál es vuestro horario?", "respuesta": "Mar-Dom 13:00-16:00 y 20:00-23:30. Lunes cerrado." }
  ],
  "schema_markup": "FAQPage"
}
```

**Observación**: El conversor parsea el patrón "¿...? → ..." y lo estructura como items
pregunta-respuesta. Añade `schema_markup: "FAQPage"` — la skill `schema-markup` dice que
FAQ con este formato califica para rich snippet en Google.

---

### C6 — Guías → recursos

```
FILTRO: estado=publicado AND formato=guia
RESULTADO: 1 pieza (pc-009)
```

**Fragmento producido:**

```json
{
  "tipo": "guide",
  "destino": "blog",
  "titulo": "Cómo pedir pizza para grupos sin volverse loco",
  "excerpt": "Guía práctica para pedidos de grupo: cuántas pizzas pedir, combinaciones, alérgenos.",
  "cuerpo": "Regla de oro: 1 pizza por persona si son estándar, 1.5 si hay hambrientos...",
  "cta": { "texto": "Pedir para grupo", "accion": "abrir-pedido-grupal" }
}
```

---

### C7 — Casos de éxito → testimonios

```
FILTRO: estado=publicado AND formato=caso_exito
RESULTADO: 1 pieza (pc-010)
```

**Fragmento producido:**

```json
{
  "tipo": "testimonial",
  "destino": "social-proof",
  "cita": "Llevamos un año pidiendo cada viernes. Los niños ya dicen 'hoy toca Nonina' como si fuera un evento. La Margherita es la referencia — si alguien dice que no le gusta la pizza, es que no ha probado esta.",
  "fuente": "Laura López, clienta desde octubre 2025",
  "contexto": "familia que pide cada viernes"
}
```

**Observación**: El conversor detecta comillas (cita) y "—" (atribución). Este fragmento
se SUMA a los trust-badges de marketing-strategy en la sección social-proof. El ensamblador
los junta: stats de strategy + testimonial de content = sección de confianza completa.

---

## C9 — Agrupador: ¿qué va a cada página?

```
HOMEPAGE
├─ hero: (de strategy, no de content)
├─ social-proof: pc-010 testimonial + trust-badges de strategy
├─ blog-preview: pc-001 y pc-003 (los 2 artículos más recientes)
└─ faq-preview: 3-4 items de pc-011

BLOG (página)
├─ pc-001 "La historia de Nonina" (artículo completo)
├─ pc-003 "¿Por qué 72 horas?" (artículo completo)
└─ pc-009 "Guía pedidos grupo" (guía como post)

ABOUT (página)
└─ pc-001 "La historia de Nonina" (reutilizado como contenido de about)

FAQ (página)
└─ pc-011 completo (10 items, con FAQPage schema)

LANDING: "Carta otoño 2026" (página independiente)
└─ pc-002 → delega a carta-digital

LANDING: "Pide directo" (página independiente)
└─ pc-004 → compuesta con datos de strategy + CTA

EMAIL
└─ pc-005 newsletter septiembre

INSTAGRAM
├─ pc-006 post de imagen
└─ pc-007 carrusel (hija de pc-003)
```

---

## Resultado completo — lo que el ensamblador recibe de marketing-content

```json
{
  "modulo": "marketing-content",
  "proyecto": "nonina-pizzicas",
  "piezas_totales": 11,
  "piezas_publicadas": 10,
  "piezas_descartadas": 1,
  "fragmentos_por_destino": {
    "blog": {
      "items": 3,
      "piezas": ["pc-001 articulo", "pc-003 articulo", "pc-009 guia"]
    },
    "about": {
      "items": 1,
      "piezas": ["pc-001 reutilizado"]
    },
    "faq": {
      "items": 10,
      "piezas": ["pc-011 → 10 items FAQ"]
    },
    "social-proof": {
      "items": 1,
      "piezas": ["pc-010 testimonial"]
    },
    "landing-pages": {
      "items": 2,
      "piezas": ["pc-002 carta-otoño (delega)", "pc-004 pide-directo"]
    },
    "email": {
      "items": 1,
      "piezas": ["pc-005 newsletter"]
    },
    "social": {
      "items": 2,
      "piezas": ["pc-006 imagen", "pc-007 carrusel"]
    }
  }
}
```

---

## Lo que NO salió (dato interno del jefe)

| Dato descartado | Ejemplo concreto | Por qué no sale |
|---|---|---|
| `pieza.estado` (como campo visible) | "publicado" | El cliente ve o no ve — no sabe que existe un estado |
| `pieza.etapa_funnel` | "awareness", "conversion" | Vocabulario de marketing interno |
| `pieza.madre_id` | pc-007 es hija de pc-003 | Gestión de fragmentación, no info del cliente |
| `resumen.por_estado` | { publicado: 10, borrador: 1 } | Dashboard del jefe |
| pc-008 (borrador) | "Vídeo Margherita" | Trabajo en progreso, no publicado |

---

## Cruce con strategy — la sección social-proof completa

El ensamblador recibe fragmentos de AMBOS módulos para la sección social-proof:

```
DE strategy (S4 evidencias):
  ★ 4.8 estrellas (340 reseñas)          → stat
  🏆 Finalista Mejor Pizza 2025           → badge
  🧀 Proveedor: Di Stefano (DOP)          → badge
  📰 "La mejor masa..." — El Comidista    → quote
  📊 12.000+ pizzas servidas              → stat

DE content (C7 caso_exito):
  💬 "Llevamos un año pidiendo cada viernes..." — Laura López  → testimonial

RESULTADO ENSAMBLADO:
  [stats] + [badges] + [quotes del jefe + testimonial del cliente]
  = sección de confianza completa con DATOS + OPINIÓN + PRUEBA SOCIAL
```

Esto demuestra que los fragmentos de módulos distintos SE COMPONEN — el ensamblador
los junta sin que ningún módulo sepa del otro.
