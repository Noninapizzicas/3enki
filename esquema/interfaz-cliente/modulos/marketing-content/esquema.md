# Esquema — marketing-content desde el cliente

**Módulo**: marketing-content
**Naturaleza**: Híbrido (reflejo + blueprint) — el catálogo de contenido publicado
**Perspectiva**: cliente final (lo que VE, LEE y CONSUME)

---

## Identidad

El **proveedor principal de contenido-cliente**. A diferencia de marketing-strategy
(fragmentos fijos que siempre van al mismo sitio), marketing-content produce CONTENIDO
VARIABLE — artículos, landings, emails, posts — que se distribuye por múltiples
presencias y páginas según su formato y canal.

La pieza en estado `publicado` ES literalmente lo que el cliente lee.
Todo lo demás (borradores, ideas, metadatos de gestión) es estructura interna.

---

## Árbol maestro

```
marketing-content (store: piezas[])
│
├─ FILTRO DE ESTADO ─────────────────────────────────────
│   estado == "publicado" → PASA
│   estado != "publicado" → DESCARTADO (invisible al cliente)
│
├─ CONVERSORES POR FORMATO (C1–C8) ─────────────────────
│   │
│   ├─ C1 · Artículos → blog/about                     ATÓMICO · conversor
│   │   ENTRADA: piezas.filtrar(publicado, articulo)
│   │   SALIDA:  { tipo: "blog-post", titulo, cuerpo, excerpt, fecha, etiquetas }
│   │   PARSEO:  Markdown→HTML, excerpt de descripcion
│   │   DESTINO: blog (listado + detalle), about (si temática=marca)
│   │
│   ├─ C2 · Landings → página independiente             ATÓMICO · conversor
│   │   ENTRADA: piezas.filtrar(publicado, landing)
│   │   SALIDA:  { tipo: "landing-page", titulo, descripcion, cuerpo, cta }
│   │   PARSEO:  detecta delegación (carta→carta-digital) o composición (strategy+descripcion)
│   │   DESTINO: página independiente (una por pieza)
│   │
│   ├─ C3 · Emails → newsletter                        ATÓMICO · conversor
│   │   ENTRADA: piezas.filtrar(publicado, email)
│   │   SALIDA:  { tipo: "email-render", asunto, cuerpo, secciones_detectadas[] }
│   │   PARSEO:  detecta secciones dentro del email (intro, producto-nuevo, evento, oferta)
│   │   DESTINO: canal email (+ posible "ver en navegador")
│   │
│   ├─ C4 · Posts sociales → canal social               ATÓMICO · conversor
│   │   ENTRADA: piezas.filtrar(publicado, post_social)
│   │   SALIDA:  { tipo: "social-post", texto, canal, hashtags[], tipo_post, es_hija }
│   │   PARSEO:  extrae hashtags (#), detecta tipo (imagen/carrusel por "Slide N:")
│   │   DESTINO: canal social (instagram, twitter, etc.)
│   │
│   ├─ C5 · FAQ → sección/página                       ATÓMICO · conversor
│   │   ENTRADA: piezas.filtrar(publicado, faq)
│   │   SALIDA:  [{ pregunta, respuesta }] + schema_markup: "FAQPage"
│   │   PARSEO:  patrón "¿...? → ..." → items estructurados
│   │   DESTINO: página FAQ completa o sección FAQ en homepage
│   │
│   ├─ C6 · Guías → recurso                            ATÓMICO · conversor
│   │   ENTRADA: piezas.filtrar(publicado, guia)
│   │   SALIDA:  { tipo: "guide", titulo, cuerpo, excerpt, cta }
│   │   PARSEO:  genera excerpt, detecta CTA
│   │   DESTINO: blog (como post) o sección recursos
│   │
│   ├─ C7 · Casos de éxito → testimonial               ATÓMICO · conversor
│   │   ENTRADA: piezas.filtrar(publicado, caso_exito)
│   │   SALIDA:  { tipo: "testimonial", cita, fuente, contexto }
│   │   PARSEO:  comillas → cita, "—" → fuente
│   │   DESTINO: sección social-proof (se COMPONE con trust-badges de strategy)
│   │
│   └─ C8 · Vídeos → embed                             ATÓMICO · conversor
│       ENTRADA: piezas.filtrar(publicado, video)
│       SALIDA:  { tipo: "video-embed", titulo, descripcion, url }
│       PARSEO:  mínimo (contenido suele ser null, URL externa)
│       DESTINO: página propia o sección en página relevante
│
└─ AGRUPADOR (C9) ──────────────────────────────────────
    C9 · Contenido por página                           ATÓMICO · reflejo
    No transforma: agrupa los fragmentos C1–C8 por página destino.
    Reglas deterministas de asignación:
      articulo    → blog
      landing     → página independiente
      email       → canal email
      post_social → canal social
      faq         → página FAQ / sección homepage
      guia        → blog / recursos
      caso_exito  → social-proof
      video       → página propia / sección
```

---

## Esqueleto compartido de los conversores

Todos los conversores C1–C8 comparten la misma estructura:

```
CONVERSOR contenido_por_formato {
  ENTRADA: store.piezas.filtrar(estado == "publicado" Y formato == F)
  SALIDA:  [{ tipo: T, ...campos_extraidos }]
  REGLA:
    1. FILTRAR por estado + formato
    2. EXTRAER campos relevantes (titulo, contenido, descripcion)
    3. PARSEAR contenido si el formato lo requiere
    4. GENERAR fragmento tipado
    SI pieza.contenido == null:
      fragmento = { ...metadatos, cuerpo: HUECO }
      detectar delegación o composición
}
```

La diferencia entre conversores es el PARSEO y el TIPO de salida.

---

## Datos del store — reparto cliente / interno

| Campo del store | ¿Cliente? | Cómo llega |
|---|---|---|
| `pieza.titulo` | **SÍ** | Título visible (artículo, landing, asunto email) |
| `pieza.contenido` | **SÍ** | El cuerpo que el cliente lee/ve |
| `pieza.descripcion` | **SÍ** | Meta description, excerpt, resumen en listados |
| `pieza.formato` | PARCIAL | Determina la PRESENTACIÓN (no visible como campo) |
| `pieza.canal_id` | PARCIAL | Determina la PRESENCIA (no visible como campo) |
| `pieza.estado` | NO (filtro) | Solo `publicado` pasa; el cliente no ve estados |
| `pieza.etapa_funnel` | NO | Clasificación interna del jefe |
| `pieza.madre_id` | NO | Relación de fragmentación interna |
| `pieza.id` | NO | Identificador técnico |

---

## Cruce con otros módulos

### social-proof (strategy + content → sección completa)

```
DE strategy (S4 evidencias):
  stats    → números con impacto (4.8 estrellas, 12.000+ pizzas)
  badges   → logros y sellos (Finalista, Proveedor DOP)
  quotes   → citas de prensa ("La mejor masa..." — El Comidista)

DE content (C7 caso_exito):
  testimonials → voz del cliente real ("Llevamos un año..." — Laura López)

RESULTADO ENSAMBLADO:
  [stats] + [badges] + [quotes] + [testimonials]
  = sección de confianza: DATOS + RECONOCIMIENTO + PRENSA + VOZ DEL CLIENTE
```

### homepage (strategy + content → página principal)

```
DE strategy: hero (headline + subheading), features, trust-badges
DE content:  blog-preview (2 artículos recientes), faq-preview (3-4 items), social-proof (testimonial)
```

### about (strategy + content → página de marca)

```
DE strategy: headline, features
DE content:  pc-001 reutilizado (artículo de historia de marca)
```

---

## Recuento

| Concepto | Cantidad |
|---|---|
| Conversores (C1–C8) | 8 |
| Reflejo agrupador (C9) | 1 |
| **Total piezas** | **9** |
| Formas: conversor | 8 |
| Formas: reflejo | 1 |

---

## Lo que produce para el ensamblador

```json
{
  "modulo": "marketing-content",
  "proyecto": "<proyecto>",
  "piezas_totales": "<N>",
  "piezas_publicadas": "<M>",
  "piezas_descartadas": "<N-M>",
  "fragmentos_por_destino": {
    "blog":          { "items": "<count>", "piezas": ["<ids>"] },
    "about":         { "items": "<count>", "piezas": ["<ids>"] },
    "faq":           { "items": "<count>", "piezas": ["<ids>"] },
    "social-proof":  { "items": "<count>", "piezas": ["<ids>"] },
    "landing-pages": { "items": "<count>", "piezas": ["<ids>"] },
    "email":         { "items": "<count>", "piezas": ["<ids>"] },
    "social":        { "items": "<count>", "piezas": ["<ids>"] }
  }
}
```

---

## Simulación verificada

La carpeta contiene una simulación completa con datos rellenos de Nonina Pizzicas:
- `simulacion-datos.json` — 11 piezas de contenido (9 publicadas, 1 borrador, 1 sin contenido)
- `simulacion-fragmentos.md` — ejecución del esquematizador sobre los datos concretos:
  10 piezas pasan el filtro, producen fragmentos tipados por formato, se asignan a 7 destinos,
  y la sección social-proof se COMPONE con los trust-badges de strategy.
