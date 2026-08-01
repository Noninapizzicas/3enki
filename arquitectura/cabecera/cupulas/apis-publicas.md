---
id: cupulas/apis-publicas
dominio: cupulas
resumen: El catálogo de APIs públicas REST como cúpula buscable — índice barato siempre en el turno, integración bajo demanda. Fuente semilla public-apis/public-apis (~1400 APIs, 50 categorías). Patrón traer-a-demanda (gemelo de buscar_agente/buscar_skill).
fuentes:
  - modules/apis-publicas/**
verificado: 2026-08-01
---

# CÚPULA DE APIs PÚBLICAS — el catálogo externo, buscable y traído a demanda

> Cuarta sustancia del patrón cúpula (lentes=conocimiento · cantera=skills · agentes=trabajadores ·
> **apis-publicas=servicios externos**). Lo que crawl4rs RASPA, una API pública lo SIRVE tipado: JSON
> estructurado, sin throttle agresivo, sin login. La API es la PRIMERA opción; el scraping es el
> fallback cuando no hay API. La cúpula no precarga — INDEXA el catálogo y trae bajo demanda.
>
> Fuente semilla: [public-apis/public-apis](https://github.com/public-apis/public-apis) (~1400 APIs
> REST gratuitas en 50 categorías). Otras fuentes entran por el mismo molde (importar).

## Contrato (JSON)

```json
{
  "esquema": "cupula-apis-publicas-v1",
  "principio": "catálogo barato siempre + integración cara bajo demanda (traer-a-demanda)",
  "fuente_semilla": "public-apis/public-apis — ~1400 APIs REST gratuitas, 50 categorías, formato: {nombre, descripcion, auth, https, cors, url, categoria}",
  "reparto_api_vs_scraping": {
    "api_publica_disponible": "fetch directo → JSON tipado. Más fiable, más rápido, idempotente, sin navegador",
    "sin_api_disponible": "crawl4rs.leer/buscar → HTML→markdown. El camino que ya funciona (soysuper, etc.)",
    "regla": "la API es PRIMERA opción; el scraping es fallback. La cúpula da el mapa para decidir"
  },
  "dos_mapas": {
    "catalogo": "TODA API conocida (indexada o no) → BUSCABLE. { nombre, descripcion, categoria, auth, url, dominio_enki, integrada }",
    "integradas": "solo las que tienen tools_http o skill → INVOCABLES ya por el bus"
  },
  "puertas": {
    "buscar_api": "{query, categoria?, dominio?, limite?} → catálogo rankeado (nombre+descripcion+tags+categoria). Gemela de buscar_agente/buscar_skill. Devuelve integrada:true|false por API.",
    "obtener_api": "{nombre} → ficha COMPLETA (url, auth, endpoints conocidos, ejemplo de invocación, skill asociada si existe)",
    "traer_api": "{nombre} → INTEGRA la API: genera la declaración tools_http + skill de cantera. Confirmation:true. La API pasa de catalogada a integrada.",
    "listar_categorias": "→ categorías con cuenta de APIs por cada una",
    "estado": "{total_catalogadas, total_integradas, categorias, fuentes}"
  },
  "categorias_prioritarias": {
    "comercio_directo": [
      {"categoria": "Food & Drink", "dominio_enki": "escandallo", "apis_clave": ["Open Food Facts (sin auth)", "TheMealDB", "Spoonacular", "Edamam", "Zestful", "Fruityvice"]},
      {"categoria": "Currency Exchange", "dominio_enki": "pizzepos", "apis_clave": ["Frankfurter (sin auth)", "ExchangeRate-API", "Currency-api (sin auth)"]},
      {"categoria": "Weather", "dominio_enki": "operativa", "apis_clave": ["Open-Meteo (sin auth)"]}
    ],
    "plataforma": [
      {"categoria": "Geocoding", "dominio_enki": "delivery", "apis_clave": ["Positionstack", "OpenStreetMap Overpass (sin auth)"]},
      {"categoria": "Finance", "dominio_enki": "facturacion", "apis_clave": ["VAT Validation", "IBANforge (sin auth)"]},
      {"categoria": "Business", "dominio_enki": "sistema", "apis_clave": ["Square", "Invovate"]}
    ],
    "crecimiento": [
      {"categoria": "News", "dominio_enki": "marketing", "apis_clave": ["NewsAPI", "Mediastack"]},
      {"categoria": "Social", "dominio_enki": "canales", "apis_clave": ["Discord", "Foursquare"]},
      {"categoria": "Text Analysis", "dominio_enki": "conversacion", "apis_clave": ["MeaningCloud"]}
    ]
  },
  "no_hacer": [
    "importar las 1400 APIs a ciegas — ruido; solo las que tocan un vertical vivo",
    "wrapper genérico 'consume cualquier API' — cada API tiene su contrato; una tools_http por API",
    "clonar el repo — es un README estático; se cosecha una vez y se actualiza cuando convenga"
  ]
}
```

## Pseudocódigo (reflejo)

```
CLASE ApiPublicaEntry {
  nombre      : String
  descripcion : String
  categoria   : String
  auth        : 'No' | 'apiKey' | 'OAuth'
  https       : Boolean
  cors        : 'Yes' | 'No' | 'Unknown'
  url         : String
  dominio_enki: String?          // mapeado por categoría → vertical Enki
  integrada   : Boolean          // tiene tools_http o skill viva
  tags        : Array<String>
}

CLASE CupulaApisPublicas HEREDA ModuloHibridoReflejo {
  ATRIBUTOS {
    catalogo   : Map<nombre, ApiPublicaEntry>    // TODA API conocida (semilla + importada)
    integradas : Set<nombre>                     // las que YA tienen tools_http o skill
  }

  // ── CARGA (patrón semilla+crecido, gemelo de agentes/cantera) ──
  onLoad():
    _cargarSemilla('apis-publicas/catalogo/')     // JSON curado por categoría (código)
    _cargarCrecido('data/apis-publicas/')          // importadas en caliente (persistente)
    _detectarIntegradas()                          // cruza con toolsRegistry y cosecha

  // ── BUSCAR (catálogo barato, gemela de buscar_agente) ──
  _buscarApi({query, categoria?, dominio?, limite?}): PROYECCION PURA
    toks ← tokens(query)
    items ← catalogo.values()
    SI categoria: items ← items.filtrar(a.categoria == categoria)
    SI dominio:   items ← items.filtrar(a.dominio_enki == dominio)
    ranked ← items.map(a → {a, score: Σ toks.incluido_en(nombre+descripcion+tags+categoria)})
             .filtrar(score > 0).ordenarDesc(score).tomar(limite ?? 10)
    RETORNA { total: catalogo.size, integradas: integradas.size,
              apis: ranked.map(→ {nombre, descripcion, categoria, auth, integrada, url}) }

  // ── OBTENER (ficha completa, bajo demanda) ──
  _obtenerApi({nombre}):
    entry ← catalogo.get(nombre)
    SI !entry: RETORNA 404
    skill ← cosecha.buscar({query: nombre, limite: 1})   // skill asociada si existe
    RETORNA { ...entry, skill: skill?.nombre, ejemplo_invocacion: _generarEjemplo(entry) }

  // ── TRAER (integrar bajo demanda, confirmation:true) ──
  _traerApi({nombre}):
    entry ← catalogo.get(nombre)
    SI !entry: RETORNA 404
    SI integradas.has(nombre): RETORNA { ya_integrada: true }

    // 1. Generar tools_http declaration
    toolDecl ← _generarToolHttp(entry)       // plantilla por auth type
    // 2. Generar skill de cantera (cómo y cuándo usarla)
    skillMd  ← _generarSkill(entry)
    cosecha.importar({ fuente: 'apis-publicas', skills: [skillMd] })
    // 3. Marcar como integrada
    integradas.add(nombre)
    _persistirIntegradas()

    RETORNA { integrada: true, tool: toolDecl.name, skill: skillMd.nombre }

  // ── GENERADORES ──
  _generarToolHttp(entry: ApiPublicaEntry): ToolHttpDeclaration
    RETORNA {
      name: 'api.' + slugify(entry.nombre),
      http: {
        method: 'GET',
        url: entry.url,
        auth_type: entry.auth == 'apiKey' ? 'api_key_query' : entry.auth == 'No' ? null : 'oauth',
        credential_id: entry.auth != 'No' ? UPPER(slugify(entry.nombre)) : null
      }
    }

  _generarSkill(entry: ApiPublicaEntry): Skill
    RETORNA {
      nombre: 'api-' + slugify(entry.nombre),
      descripcion: entry.descripcion,
      dominio: entry.dominio_enki,
      tags: [entry.categoria, 'api-publica', entry.auth],
      lente_tarea: 'consultar',
      contenido: plantillaSkill(entry)     // canal bus, ejemplo, auth, rate-limit conocido
    }
}
```

## Patrón traer-a-demanda (por qué NO precargar)

```json
{
  "esquema": "traer-a-demanda-v1",
  "tesis": "el catálogo entero cabe en un JSON barato (~50KB las 1400 fichas sin contenido); la integración (tools_http + skill + credential) es CARA y solo paga cuando un vertical la necesita",
  "precedentes_en_enki": [
    "cantera: buscar_skill (barato) → cosecha.obtener (caro, bajo demanda) → cosecha.promover (más caro, solo si activas)",
    "agentes: buscar_agente (barato) → activar_agente (caro, solo si enciendes)",
    "eventos: buscar_capacidad (barato) → el código ya está cargado",
    "bibliotecario: catálogo (barato) → préstamo (caro, solo si lees)"
  ],
  "flujo": {
    "1_buscar": "buscar_api('nutrición ingredientes') → [{nombre:'Open Food Facts', auth:'No', integrada:false}, {nombre:'Edamam', auth:'apiKey', integrada:false}]",
    "2_obtener": "obtener_api('Open Food Facts') → ficha completa + ejemplo de invocación + 'no tiene skill asociada'",
    "3_traer":   "traer_api('Open Food Facts') → genera tools_http + skill cantera + marca integrada. Confirmation:true.",
    "4_usar":    "el LLM ya puede llamar api.open_food_facts por bus o el skill le enseña bus.publishAndWait"
  },
  "reparto_auth": {
    "sin_auth": "traer es inmediato — Open Food Facts, Frankfurter, Open-Meteo, Currency-api, Fruityvice, TheMealDB",
    "con_apiKey": "traer requiere credential_id configurado — Spoonacular, Edamam, NewsAPI, Positionstack",
    "oauth": "traer requiere flujo OAuth previo — Square, Discord (fuera del scope inicial)"
  }
}
```

## El cruce con crawl4rs — cuándo API, cuándo scraping

```
DECISION  ¿cómo obtengo este dato externo?

  SI catalogo.buscarApi(dato).encontrada Y api.auth IN ['No','apiKey']:
    → fetch directo (tools_http). JSON tipado, sin navegador, sin throttle.
      Ej: "composición nutricional de harina" → Open Food Facts API (/api/v0/product/{barcode}.json)

  SI NO hay API o requiere OAuth complejo:
    → crawl4rs (el camino que ya funciona).
      Ej: "precio de mozzarella en soysuper" → crawl4rs.buscar + crawl4rs.leer

  COMPLEMENTO (las dos a la vez):
    → API para el dato estructurado + crawl4rs para el precio/disponibilidad que la API no tiene.
      Ej: escandallo completo = Open Food Facts (nutrición) + soysuper via crawl4rs (precio local)

REGLA  la cúpula da el MAPA para decidir. El LLM (o la skill de dominio) elige el camino.
       La API entra por tools_http (loader genera el handler); crawl4rs entra por bus.publishAndWait.
       Ambos llegan al bus como eventos tipados — el consumidor no distingue la fuente.
```

## APIs de arranque — las que pagan HOY sin apiKey (traer primero)

```
PRIORIDAD  sin auth > con apiKey > OAuth (cada escalón añade fricción de configuración)

SIN AUTH (integración inmediata, cero config):
  Open Food Facts   Food & Drink   escandallo   productos alimentarios, nutrición, ingredientes, código de barras
  Frankfurter       Currency        pizzepos     conversión de divisas EUR↔moneda (turistas, multi-moneda)
  Open-Meteo        Weather         operativa    previsión meteorológica por coordenadas (demanda terraza/delivery)
  Fruityvice        Food & Drink    escandallo   datos de frutas (nutrición, familia, orden)
  TheMealDB         Food & Drink    recetario    recetas por ingrediente/categoría/área (referencia)
  Currency-api      Currency        pizzepos     150+ divisas, sin rate limit
  IBANforge         Finance         facturacion  validación IBAN + BIC/SWIFT (75 países)
  OpenStreetMap     Geocoding       delivery     geocodificación libre (Overpass API, Nominatim)

CON apiKey (siguiente, requiere credential-manager):
  Spoonacular       Food & Drink    escandallo   recetas + ingredientes + nutrición + meal planning
  Edamam            Food & Drink    escandallo   análisis nutricional profesional
  Zestful           Food & Drink    escandallo   parser de ingredientes (texto → {cantidad, unidad, ingrediente})
  Positionstack     Geocoding       delivery     geocodificación forward/reverse (más precisa que OSM)
  Open-Meteo Pro    Weather         operativa    previsión extendida + histórico
  NewsAPI           News            marketing    noticias del sector para content-marketing
```

## Topics / piezas / estado

```
EVENTOS {
  apis-publicas.{buscar,obtener,traer,listar_categorias,estado}.request → .response
  apis-publicas.integrada   (dominio, al traer — la propiocepción lo capta)
}
PIEZAS {
  modules/apis-publicas/                         la cúpula (reflejo, NO existe aún)
  modules/apis-publicas/catalogo/                semilla: JSON por categoría (curado del repo public-apis)
  data/apis-publicas/                            crecido: APIs importadas en caliente
  data/apis-publicas/integradas.json             registro de las traídas (persistente)
}
ESTADO {
  ◯ DISEÑO (v0, esta rebanada). El módulo NO existe aún — la rebanada documenta la forma.
  → SIGUIENTE: construir el reflejo con el catálogo semilla de las ~30 APIs prioritarias.
  → SIGUIENTE: tool buscar_api en GLOBAL_TOOLS (como buscar_agente/buscar_skill).
  → SIGUIENTE: traer las 8 sin-auth y verificar el flujo tools_http end-to-end.
}
```

> **Trade-off vivo.** El catálogo COMPLETO (~1400) es barato de indexar pero caro de MANTENER
> (las APIs mueren, cambian auth, rotan URLs). Las ~30 prioritarias se verifican; el resto vive
> como referencia buscable sin garantía. La cúpula no inventa endpoints — indexa lo publicado
> y genera la declaración tools_http cuando se trae. Si la API muere, el error-fértil del loader
> canta el diagnóstico (TERMINAL: endpoint caído) y la cúpula la marca como rota.
