# Simulación — Esquematizador sobre marketing-strategy RELLENO

**Proyecto**: Nonina Pizzicas (restaurante, pizza artesanal napolitana, Madrid)
**Datos fuente**: `simulacion-datos.json` — marketing-strategy relleno por el jefe

El esquematizador lee los datos concretos y ejecuta las reglas de conversión (S1–S5)
de la disección. Lo que sale son los FRAGMENTOS que el ensamblador usaría para montar
la interfaz del cliente.

---

## Ejecución de los conversores

### S1 — Declaración → titular

```
ENTRADA: "Pizza artesanal napolitana con masa madre y productos de temporada"
REGLA:   declaracion != null → generar headline
```

**Fragmento producido:**

```json
{
  "tipo": "headline",
  "texto": "Pizza artesanal napolitana con masa madre y productos de temporada",
  "nivel": "h1",
  "ubicaciones": {
    "homepage": "hero",
    "about": "header",
    "landing": "hero"
  }
}
```

**Observación**: El texto es directo y claro — comunica QUÉ ES en una frase. Cumple la regla
del hero-generator (6-10 palabras, beneficio claro). La skill homepage-generator dice que el H1
debe incluir la keyword primaria ("pizza artesanal napolitana" → está).

---

### S2 — Propuesta de valor → subtítulo

```
ENTRADA: "Masa madre de 72 horas, ingredientes DOP directos de Campania,
          horno de leña a 450°C — el sabor de Nápoles en tu barrio, sin intermediarios"
REGLA:   propuesta_valor != null → generar subheading
```

**Fragmento producido:**

```json
{
  "tipo": "subheading",
  "texto": "Masa madre de 72 horas, ingredientes DOP directos de Campania, horno de leña a 450°C — el sabor de Nápoles en tu barrio, sin intermediarios",
  "ubicacion": "hero"
}
```

**Observación**: Responde "¿por qué me importa?" con datos concretos (72h, DOP, 450°C) y
un beneficio emocional ("el sabor de Nápoles en tu barrio"). El hero-generator recomienda
"especificidad, no vaguedad" — esto lo cumple.

---

### S3 — Atributos → puntos clave

```
ENTRADA: [
  "Masa madre con 72h de fermentación natural",
  "Ingredientes DOP importados directos de Campania",
  "Horno de leña artesano a 450°C",
  "Del productor a tu mesa — sin intermediarios",
  "Carta de temporada que cambia cada estación"
]
REGLA:   atributos.length == 5 > 0 → generar items
```

**Fragmentos producidos:**

```json
{
  "tipo": "feature-list",
  "destino": "features",
  "items": [
    { "tipo": "feature-item", "texto": "Masa madre con 72h de fermentación natural", "icono": null },
    { "tipo": "feature-item", "texto": "Ingredientes DOP importados directos de Campania", "icono": null },
    { "tipo": "feature-item", "texto": "Horno de leña artesano a 450°C", "icono": null },
    { "tipo": "feature-item", "texto": "Del productor a tu mesa — sin intermediarios", "icono": null },
    { "tipo": "feature-item", "texto": "Carta de temporada que cambia cada estación", "icono": null }
  ]
}
```

**Observación**: 5 atributos → 5 items. El campo `icono` queda null — la piel o el micro-agente
puede asignar iconos semánticos (🕐 tiempo, 🇮🇹 italia, 🔥 fuego, 🌾 productor, 🍂 estación).
Eso es decisión del ensamblador, no del conversor.

---

### S4 — Evidencias → trust cues

```
ENTRADA: [
  "4.8 estrellas en Google con 340 reseñas",
  "Finalista Mejor Pizza Artesanal Madrid 2025",
  "Proveedor directo: Caseificio Di Stefano (mozzarella DOP)",
  "\"La mejor masa que he probado en Madrid\" — El Comidista",
  "Más de 12.000 pizzas servidas desde apertura"
]
REGLA:   evidencias.length == 5 > 0 → detectar formato y generar badges
```

**Fragmentos producidos:**

```json
{
  "tipo": "trust-section",
  "destino": "social-proof",
  "items": [
    {
      "tipo": "stat",
      "numero": "4.8",
      "texto": "estrellas en Google con 340 reseñas",
      "formato_detectado": "numero_al_inicio"
    },
    {
      "tipo": "badge",
      "texto": "Finalista Mejor Pizza Artesanal Madrid 2025",
      "formato_detectado": "texto_sin_patron"
    },
    {
      "tipo": "badge",
      "texto": "Proveedor directo: Caseificio Di Stefano (mozzarella DOP)",
      "formato_detectado": "texto_sin_patron"
    },
    {
      "tipo": "quote",
      "texto": "La mejor masa que he probado en Madrid",
      "fuente": "El Comidista",
      "formato_detectado": "comillas_detectadas"
    },
    {
      "tipo": "stat",
      "numero": "12.000",
      "texto": "pizzas servidas desde apertura",
      "formato_detectado": "numero_en_texto"
    }
  ]
}
```

**Observación**: El mini-parser detectó:
- 2 **stats** (números: "4.8 estrellas", "12.000 pizzas") → componente con número grande + texto
- 2 **badges** (texto sin patrón: "Finalista...", "Proveedor...") → componente con icono + texto
- 1 **quote** (comillas detectadas + "—" separa fuente) → componente de cita con atribución

Esto es lo que la skill `trust-badges-generator` llama "1-3 trust cues" — aquí hay 5, el
ensamblador puede priorizar o agrupar (stats arriba, badges debajo, quote al final).

---

### S5 — Categoría → contexto

```
ENTRADA: "restaurante"
REGLA:   pass-through → enrutamiento
```

**Fragmento producido:**

```json
{
  "tipo": "enrutamiento",
  "arquetipo": "restaurante",
  "implica": {
    "paginas_prioritarias": ["homepage", "carta", "reservas", "contacto", "about"],
    "secciones_hero": ["hero-con-imagen-plato", "cta-reserva-o-pedido"],
    "secciones_relevantes": ["carta-destacados", "horario", "ubicacion-mapa", "galeria"]
  }
}
```

**Observación**: El tipo "restaurante" condiciona TODA la estructura. Un SaaS tendría
`["homepage", "features", "pricing", "signup"]` con `["hero-demo", "cta-trial"]`.
Este es el dato que alimenta al selector de estructura (#20).

---

## Resultado completo — lo que el ensamblador recibe de marketing-strategy

```json
{
  "modulo": "marketing-strategy",
  "proyecto": "nonina-pizzicas",
  "fragmentos": [
    {
      "id": "strategy-headline",
      "tipo": "headline",
      "texto": "Pizza artesanal napolitana con masa madre y productos de temporada",
      "nivel": "h1",
      "destino": "hero"
    },
    {
      "id": "strategy-subheading",
      "tipo": "subheading",
      "texto": "Masa madre de 72 horas, ingredientes DOP directos de Campania, horno de leña a 450°C — el sabor de Nápoles en tu barrio, sin intermediarios",
      "destino": "hero"
    },
    {
      "id": "strategy-features",
      "tipo": "feature-list",
      "items": [
        "Masa madre con 72h de fermentación natural",
        "Ingredientes DOP importados directos de Campania",
        "Horno de leña artesano a 450°C",
        "Del productor a tu mesa — sin intermediarios",
        "Carta de temporada que cambia cada estación"
      ],
      "destino": "features"
    },
    {
      "id": "strategy-trust",
      "tipo": "trust-section",
      "items": [
        { "tipo": "stat", "numero": "4.8", "texto": "estrellas en Google (340 reseñas)" },
        { "tipo": "badge", "texto": "Finalista Mejor Pizza Artesanal Madrid 2025" },
        { "tipo": "badge", "texto": "Proveedor directo: Caseificio Di Stefano (mozzarella DOP)" },
        { "tipo": "quote", "texto": "La mejor masa que he probado en Madrid", "fuente": "El Comidista" },
        { "tipo": "stat", "numero": "12.000+", "texto": "pizzas servidas" }
      ],
      "destino": "social-proof"
    }
  ],
  "enrutamiento": {
    "arquetipo": "restaurante",
    "paginas_prioritarias": ["homepage", "carta", "reservas", "contacto", "about"]
  }
}
```

---

## Lo que NO salió (dato interno del jefe)

El esquematizador DESCARTÓ estos datos del store — son NO-OBJETIVO para el cliente:

| Dato descartado | Contenido real | Por qué no sale |
|---|---|---|
| `objetivos[0]` | "Aumentar pedidos online +30%" | Meta interna de negocio |
| `objetivos[1]` | "500 suscriptores newsletter" | Meta interna de captación |
| `alineacion_negocio[0]` | "Pedidos directos = 25% más margen que Glovo" | Inteligencia financiera |
| `alineacion_negocio[1]` | "Email = mejor ROI para repetición" | Decisión de canal interna |
| `conocimiento_disponible.sabemos` | "65% vienen por recomendación", "ticket medio 18.50€"... | Datos operativos privados |
| `conocimiento_disponible.no_sabemos` | "Radio de influencia real", "masa madre vs DOP"... | Gaps de investigación |
| `territorio.vecinos` | "Grosso Napoletano", "Fratelli Figurato"... | Competidores — no se publican |
| `revisiones` | Próxima revisión 15-oct, historial... | Agenda interna |

**Si alguno de estos se publicara, sería una filtración de inteligencia de negocio.**

---

## Validación — ¿la interfaz responde al 3-Second Rule?

Con los fragmentos que strategy produce, el hero de la homepage queda:

```
┌────────────────────────────────────────────────┐
│                                                │
│  Pizza artesanal napolitana con masa madre      │  ← headline (S1)
│  y productos de temporada                       │
│                                                │
│  Masa madre de 72h, ingredientes DOP directos  │  ← subheading (S2)
│  de Campania, horno de leña a 450°C —           │
│  el sabor de Nápoles en tu barrio              │
│                                                │
│  [ Ver la carta ]  [ Reservar mesa ]           │  ← CTAs (vienen de otro módulo)
│                                                │
│  ★ 4.8 (340 reseñas) · 12.000+ pizzas         │  ← trust stats (S4)
│                                                │
└────────────────────────────────────────────────┘
```

**¿Qué es esto?** → Pizza artesanal napolitana ✓
**¿Por qué me importa?** → Masa madre 72h, DOP, horno de leña ✓
**¿Qué hago?** → Ver carta / Reservar ✓ (CTAs de otro módulo)

El 3-Second Rule se cumple con SOLO los datos de marketing-strategy.
Los otros módulos (content, campaigns) añaden más, pero la base ya funciona.
