# Disección — marketing-strategy desde el cliente

Cada pieza atómica pasa por el diseccionador: ¿qué FORMA tiene?

Formas posibles: reflejo · micro-agente fuzzy · custodio · conversor · puente

---

## Tabla de disección

| # | Pieza | Forma | Razón |
|---|---|---|---|
| S1 | **Declaración → titular** | **conversor** | Transforma `posicionamiento.declaracion` (string libre del jefe) en contenido de sección: `{ tipo: "hero-headline", texto: declaracion, fallback: propuesta_valor }`. No interpreta — mapea campo a hueco. Pero necesita decidir DÓNDE colocarlo (hero vs about) según la estructura de la página, lo que lo hace un mapeo con regla, no un pass-through. |
| S2 | **Propuesta de valor → subtítulo** | **conversor** | Transforma `posicionamiento.propuesta_valor` en contenido de sección: `{ tipo: "hero-subheading", texto: propuesta_valor }`. Mismo patrón que S1 — mapeo campo→hueco con regla de colocación. |
| S3 | **Atributos → puntos clave** | **conversor** | Transforma `posicionamiento.atributos_deseados[]` (array de strings) en items de sección: `[{ tipo: "feature-item", texto: atributo, icono: null }]`. El conversor genera un item por atributo. El icono queda como HUECO — la piel o el micro-agente pueden resolverlo. |
| S4 | **Evidencias → trust cues** | **conversor** | Transforma `posicionamiento.credibilidad.evidencias[]` en componentes de confianza: `[{ tipo: "trust-badge", contenido: evidencia, formato: detectar(evidencia) }]`. Aquí el conversor necesita DETECTAR el formato de la evidencia (número, logo, texto, premio) para elegir el componente visual. Esto lo hace un mini-parser determinista, no un LLM. |
| S5 | **Categoría → contexto** | **reflejo** | `posicionamiento.territorio.categoria` se lee como enum y se pasa al selector de estructura (#20) como input. No se transforma — se copia. Es dato de enrutamiento, no de presentación. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **conversor** | 4 | S1 Declaración, S2 Propuesta, S3 Atributos, S4 Evidencias |
| **reflejo** | 1 | S5 Categoría (enum de enrutamiento) |
| **TOTAL** | **5** | |

---

## Lectura

**Es un módulo de conversores.** 4 de 5 piezas son conversores: toman un dato crudo del jefe
y lo transforman en contenido tipado para una sección de la interfaz. El patrón es:

```
campo_del_store → CONVERSOR → { tipo_seccion, contenido_tipado, huecos_abiertos }
```

Cada conversor produce un **fragmento de sección** — no una página entera. Los fragmentos
se ensamblan en el pipeline del ensamblador (#19→#25) junto con fragmentos de OTROS módulos.

La única pieza reflejo (S5 categoría) no produce contenido visible: es un input de enrutamiento
que el selector de estructura (#20) usa para decidir qué secciones lleva la página.

---

## Reglas de conversión (el contrato del conversor)

Cada conversor tiene una regla determinista. Si el dato fuente está vacío, el fragmento
NO se genera (el hueco se omite o se sustituye por un fallback declarado).

```
CONVERSOR declaracion_a_titular {
  ENTRADA: strategy.posicionamiento.declaracion : String | null
  SALIDA:  { tipo: "headline", texto: String, nivel: "h1" | "h2", ubicacion: "hero" | "about" }
  REGLA:
    SI declaracion != null:
      SI pagina.tipo == "homepage": ubicacion = "hero", nivel = "h1"
      SI pagina.tipo == "about":   ubicacion = "header", nivel = "h1"
      SI pagina.tipo == "landing": ubicacion = "hero", nivel = "h1"
      OTRO: ubicacion = "header", nivel = "h2"
    SINO:
      SI propuesta_valor != null: usar propuesta_valor como fallback
      SINO: fragmento = VACIO (no se genera)
}

CONVERSOR propuesta_a_subtitulo {
  ENTRADA: strategy.posicionamiento.propuesta_valor : String | null
  SALIDA:  { tipo: "subheading", texto: String, ubicacion: "hero" | "header" }
  REGLA:
    SI propuesta_valor != null:
      ubicacion = misma que declaracion (van juntas)
    SINO: fragmento = VACIO
}

CONVERSOR atributos_a_features {
  ENTRADA: strategy.posicionamiento.atributos_deseados : String[]
  SALIDA:  [{ tipo: "feature-item", texto: String, icono: String | null }]
  REGLA:
    SI atributos.length > 0:
      items = atributos.map(a => { tipo: "feature-item", texto: a, icono: null })
    SINO: fragmento = VACIO
  DESTINO: sección "features" o "benefits" (según estructura de página)
}

CONVERSOR evidencias_a_trust {
  ENTRADA: strategy.posicionamiento.credibilidad.evidencias : String[]
  SALIDA:  [{ tipo: "trust-badge" | "stat" | "logo" | "quote", contenido: String, formato: TipoEvidencia }]
  REGLA:
    PARA cada evidencia:
      SI contiene_numero(evidencia): formato = "stat"   ("+2000 clientes" → { numero, texto })
      SI es_url_imagen(evidencia):   formato = "logo"   ("logo-forbes.png" → imagen)
      SI contiene_comillas(evidencia): formato = "quote" ('"Excelente servicio"' → cita)
      OTRO: formato = "badge" (texto genérico de confianza)
    SI evidencias.length == 0: fragmento = VACIO
  DESTINO: sección "trust" o "social-proof" (trust badges, "as seen in", stats)
}

CONVERSOR categoria_a_contexto {
  ENTRADA: strategy.posicionamiento.territorio.categoria : String | null
  SALIDA:  { arquetipo: String }
  REGLA:   pass-through (se copia sin transformar)
  DESTINO: input del selector de estructura (#20), no genera fragmento visual
}
```

---

## Las dos preguntas abiertas (de pasada-1) respondidas por la disección

**P1: ¿Territorio.categoría alimenta al arquetipo directamente?**
→ SÍ, como pass-through (S5). Es un input de enrutamiento, no de presentación. Si project-profile
también tiene un campo `tipo`, se cruzan (el conversor elige el que esté relleno; project-profile
tiene prioridad como fuente primaria de identidad).

**P2: ¿Las evidencias se muestran literales o se transforman?**
→ SE TRANSFORMAN por un mini-parser determinista (S4). El parser detecta el formato (número, URL,
comillas, texto) y genera el tipo de componente visual adecuado. No necesita LLM — son heurísticas
sobre el contenido del string.
