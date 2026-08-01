---
id: cupulas/apis-publicas
dominio: cupulas
resumen: Catálogo de APIs públicas REST como cúpula propia — índice barato, integración bajo demanda (traer-a-demanda). Fuente semilla public-apis/public-apis (~1400 APIs, 50 categorías). Su buscar_api alimenta al buscador universal.
fuentes:
  - modules/apis-publicas/**
verificado: 2026-08-01
---

# CÚPULA DE APIs PÚBLICAS — el catálogo externo, buscable y traído a demanda

> Quinta sustancia del patrón cúpula (lentes=conocimiento · cantera=skills · agentes=trabajadores ·
> eventos=contratos del bus · **apis-publicas=servicios REST externos**). Lo que crawl4rs RASPA,
> una API pública lo SIRVE tipado: JSON estructurado, sin throttle agresivo, sin login. La API
> es la PRIMERA opción; el scraping es el fallback cuando no hay API. La cúpula no precarga —
> INDEXA el catálogo y trae bajo demanda.
>
> Fuente semilla: public-apis/public-apis (~1400 APIs REST gratuitas en 50 categorías).
> Otras fuentes entran por el mismo molde (importar).

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
    "catalogo": "TODA API conocida → BUSCABLE. { nombre, descripcion, categoria, auth, url, dominio_enki, integrada }",
    "integradas": "solo las que tienen tools_http o skill → INVOCABLES ya por el bus"
  },
  "puertas": {
    "buscar_api": "{query, categoria?, dominio?, limite?} → catálogo rankeado (nombre+descripcion+tags+categoria). Gemela de buscar_agente/buscar_skill. Alimenta al buscador universal.",
    "obtener_api": "{nombre} → ficha COMPLETA (url, auth, endpoints, ejemplo de invocación, skill asociada si existe)",
    "traer_api": "{nombre} → INTEGRA la API: genera tools_http + skill cantera. Confirmation:true. La API pasa de catalogada a integrada.",
    "importar_api": "{fuente, apis[]} → escribe fichas en data/ y re-indexa (crece en caliente). Idempotente por nombre.",
    "listar_categorias": "→ categorías con cuenta de APIs",
    "estado": "{total_catalogadas, total_integradas, categorias, fuentes}"
  }
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
  dominio_enki: String?
  integrada   : Boolean
  tags        : Array<String>
}

CLASE CupulaApisPublicas HEREDA ModuloHibridoReflejo {
  ATRIBUTOS {
    catalogo   : Map<nombre, ApiPublicaEntry>
    integradas : Set<nombre>
  }

  onLoad():
    _cargarSemilla('apis-publicas/catalogo/')     // JSON curado por categoría (código)
    _cargarCrecido('data/apis-publicas/')          // importadas en caliente (persistente)
    _detectarIntegradas()                          // cruza con toolsRegistry y cosecha

  _buscarApi({query, categoria?, dominio?, limite?}): PROYECCION PURA
    toks ← tokens(query)
    items ← catalogo.values()
    SI categoria: items ← items.filtrar(a.categoria == categoria)
    SI dominio:   items ← items.filtrar(a.dominio_enki == dominio)
    ranked ← items.map(a → {a, score: Σ toks.incluido_en(nombre+descripcion+tags+categoria)})
             .filtrar(score > 0).ordenarDesc(score).tomar(limite ?? 10)
    RETORNA { total: catalogo.size, integradas: integradas.size,
              apis: ranked.map(→ {nombre, descripcion, categoria, auth, integrada, url}) }

  _obtenerApi({nombre}):
    entry ← catalogo.get(nombre)
    SI !entry: RETORNA 404
    RETORNA { ...entry, ejemplo_invocacion: _generarEjemplo(entry) }

  _traerApi({nombre}):                             // confirmation:true
    entry ← catalogo.get(nombre)
    SI !entry: RETORNA 404
    SI integradas.has(nombre): RETORNA { ya_integrada: true }
    toolDecl ← _generarToolHttp(entry)
    skillMd  ← _generarSkill(entry)
    cosecha.importar({ fuente: 'apis-publicas', skills: [skillMd] })
    integradas.add(nombre) ; _persistirIntegradas()
    RETORNA { integrada: true, tool: toolDecl.name, skill: skillMd.nombre }

  _importarApi({fuente, apis}):                    // crecimiento en caliente
    PARA api EN apis:
      catalogo.set(api.nombre, api)
    _persistirCrecido() ; _reindexar()
    RETORNA { importadas: apis.length, total: catalogo.size }

  _generarToolHttp(entry): ToolHttpDeclaration
    RETORNA {
      name: 'api.' + slugify(entry.nombre),
      http: { method: 'GET', url: entry.url,
              auth_type: entry.auth == 'apiKey' ? 'api_key_query' : null,
              credential_id: entry.auth != 'No' ? UPPER(slugify(entry.nombre)) : null }
    }

  _generarSkill(entry): Skill
    RETORNA {
      nombre: 'api-' + slugify(entry.nombre),
      descripcion: entry.descripcion,
      dominio: entry.dominio_enki,
      tags: [entry.categoria, 'api-publica', entry.auth],
      lente_tarea: 'consultar',
      contenido: plantillaSkill(entry)
    }
}
```

## El cruce con crawl4rs — cuándo API, cuándo scraping

```
DECISION  ¿cómo obtengo este dato externo?

  SI catalogo.buscarApi(dato).encontrada Y api.auth IN ['No','apiKey']:
    → fetch directo (tools_http). JSON tipado, sin navegador, sin throttle.
      Ej: "composición nutricional de harina" → Open Food Facts API

  SI NO hay API o requiere OAuth complejo:
    → crawl4rs (el camino que ya funciona).
      Ej: "precio de mozzarella en soysuper" → crawl4rs.buscar + crawl4rs.leer

  COMPLEMENTO (las dos a la vez):
    → API para el dato estructurado + crawl4rs para el precio/disponibilidad que la API no tiene.
      Ej: escandallo = Open Food Facts (nutrición) + soysuper via crawl4rs (precio local)
```

## APIs de arranque — las que pagan HOY

```
SIN AUTH (integración inmediata, cero config):
  Open Food Facts   Food & Drink   escandallo   productos alimentarios, nutrición, código de barras
  Frankfurter       Currency        pizzepos     conversión de divisas EUR↔moneda (turistas)
  Open-Meteo        Weather         operativa    previsión meteorológica por coordenadas
  Fruityvice        Food & Drink    escandallo   datos de frutas (nutrición, familia)
  TheMealDB         Food & Drink    recetario    recetas por ingrediente/categoría/área
  Currency-api      Currency        pizzepos     150+ divisas, sin rate limit
  IBANforge         Finance         facturacion  validación IBAN + BIC/SWIFT (75 países)
  OpenStreetMap     Geocoding       delivery     geocodificación libre (Nominatim)

CON apiKey (siguiente, requiere credential-manager):
  Spoonacular       Food & Drink    escandallo   recetas + ingredientes + nutrición + meal planning
  Edamam            Food & Drink    escandallo   análisis nutricional profesional
  Zestful           Food & Drink    escandallo   parser de ingredientes (texto → estructura)
  Positionstack     Geocoding       delivery     geocodificación forward/reverse
  NewsAPI           News            marketing    noticias del sector para content-marketing
```

## Topics / piezas / estado

```
EVENTOS {
  apis-publicas.{buscar,obtener,traer,importar,listar_categorias,estado}.request → .response
  apis-publicas.integrada   (dominio, al traer — la propiocepción lo capta)
}
PIEZAS {
  modules/apis-publicas/                         la cúpula (reflejo, NO existe aún)
  modules/apis-publicas/catalogo/                semilla: JSON por categoría
  data/apis-publicas/                            crecido: APIs importadas en caliente
  data/apis-publicas/integradas.json             registro de las traídas (persistente)
}
ESTADO {
  ◯ DISEÑO (v0, esta rebanada). El módulo NO existe aún.
  → SIGUIENTE: construir el reflejo con catálogo semilla de las ~30 APIs prioritarias.
  → SIGUIENTE: traer las 8 sin-auth y verificar tools_http end-to-end.
  → SIGUIENTE: conectar buscar_api al buscador universal (ver cupulas/buscador-universal.md).
}
```

> **Trade-off vivo.** El catálogo COMPLETO (~1400) es barato de indexar pero caro de MANTENER
> (las APIs mueren, cambian auth, rotan URLs). Las ~30 prioritarias se verifican; el resto vive
> como referencia buscable sin garantía. Si la API muere, el error-fértil del loader canta el
> diagnóstico (TERMINAL: endpoint caído) y la cúpula la marca como rota.
