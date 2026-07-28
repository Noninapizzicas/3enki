---
name: menu-generator
description: >-
  Generador de catálogo: de cualquier input textual (texto/dictado en lenguaje
  libre, o JSON ya estructurado) produce una carta estructurada en shape
  canónico carta-pizzepos y la entrega al custodio. Híbrido: el reflejo (index.js)
  estructura el catálogo ya formado de forma determinista; el LLM de página
  estructura el texto libre. Persistencia delegada en carta-manager.
fuente: enki
dominio: comercio
tags: [pizzepos, menu-generator, carta, catalogo, hibrido, reflejo, blueprint]
---

# Pizzepos · menu-generator

> **Qué es.** Genera una carta/menú estructurado desde cualquier entrada: JSON
> ya formado (por referencia a fichero adjunto), catálogo inline en la conversación,
> o texto/dictado en lenguaje libre. No OCR, no enriquecimiento — da forma a lo
> que el material trae y lo entrega limpio al custodio `carta-manager`.
>
> **Híbrido:** el reflejo JS importa por referencia (cero tokens de producto), el
> LLM de página estructura texto libre. La persistencia SIEMPRE la hace
> `carta-manager` — menu-generator nunca escribe `/cartas/` directamente.
>
> Código: `modules/pizzepos/menu-generator/index.js` · `reflejo-1.1.0`
> Blueprint: `modules/pizzepos/menu-generator/menu-generator.blueprint.json`
> Versión módulo: `11.2.0`

---

## 1 · ARQUITECTURA (lo que hay detrás)

### El problema que resuelve

Antes de este reflejo, menu-generator era **blueprint-only**: el LLM tenía que
EMITIR la carta entera (38+ productos enriquecidos) en una respuesta de tool.
No cabía → o mandaba vacío (carta-manager lo persistía y BORRABA lo que había)
o troceaba manualmente y cantaba "✅ completas" sin respaldo del bus
(alucinación de guardado).

### La solución: importar por referencia

El reflejo **importa POR REFERENCIA**: el LLM solo dice "importa el adjunto"
(cero tokens de producto). El reflejo LEE el fichero por fs.read, lo PROYECTA
al shape canónico carta-pizzepos (determinista) y lo GUARDA con una sola
`carta.save` (atómica, versionada, VERIFICADA).

### Las 3 rutas (estrategia)

| Ruta | Material | Quién estructura | Cómo persiste |
|------|----------|-----------------|---------------|
| **CATALOGO_FICHERO** | JSON en fichero adjunto (path) | Reflejo → `menu.import.request` | Reflejo → `carta.save` |
| **CATALOGO_INLINE** | JSON en el texto del mensaje | Reflejo → `fs.write` temporal + `menu.import.request` | Reflejo → `carta.save` |
| **TEXTO_LIBRE** | Dictado/recetas en lenguaje natural | LLM de página (blueprint) | LLM → `carta.save.request` |

### Modelo OOP (del blueprint)

```
INTERFAZ GeneradorDeCarta {
  generar(in: GenerarInput): Resultado
}

CLASE GeneradorDeCatalogo IMPLEMENTA GeneradorDeCarta {
  ATRIBUTOS:
    reflejo   : Reflejo          // colaborador determinista (menu.import)
    custodio  : Custodio         // carta-manager (carta.save)
    bus       : EventBus         // Observer: progreso/fallo

  MÉTODOS:
    · generar(input)                → Resultado
    · clasificar(input)             → EstrategiaDeRuta  (ÚNICA decisión fuzzy)
    · estructurar(texto)            → Carta  (solo en TEXTO_LIBRE)
}
```

### Value Objects

```
GenerarInput  { project_id, nombre, material?, texto?, json?, correlation_id, request_id }
Carta         { meta, categorias:[Cat], productos:[Prod] }
Cat           { id, nombre, orden, estaciones?, activa? }
Prod          { id, nombre, categoria_id, precio, ingredientes, ingredientes_base?,
                opciones?, variaciones?, estaciones?, tipo?, descripcion?, alergenos?,
                etiquetas?, disponible?, emoji? }
Ing           { id, nombre, familia in FAMILIAS, precio_extra, emoji? }
FAMILIAS      [queso, verdura, carne, salsa, pescado, fruta, extra, condimento, otro]
Ruta          [CATALOGO_FICHERO | CATALOGO_INLINE | TEXTO_LIBRE]
Resultado     { status, data?:{carta_id, productos}, error?:{code,message} }
```

### Patrones

| Patrón | Dónde |
|--------|-------|
| **Strategy** | `EstrategiaDeRuta` — clasificar() elige la estrategia (único punto fuzzy) |
| **Delegation** | Persistencia delegada al Custodio; menu-generator no escribe /cartas/ |
| **Factory** | Carta = producto que el generador construye y entrega (no la persiste él) |
| **Observer** | `menu.generation.*` / `carta.generar.*` eventos en el bus |
| **Command** | `_on_carta_generar_solicitada` = handler de evento |

---

## 2 · EVENTOS (el contrato del bus)

### Atiende (RPC request → response)

| Evento | Descripción |
|--------|-------------|
| `menu.import.request` | **Reflejo** — importa un catálogo desde JSON por referencia (fs.read del adjunto), proyecta a shape canónico y guarda vía carta.save. Una llamada, cero re-emisión del LLM. |

### Emite (fire-and-forget)

| Evento | Cuándo |
|--------|--------|
| `menu.generation.progress` | Progreso parcial de la generación |
| `menu.generation.failed` | Fallo en la generación (sin carta persistida) |
| `carta.generar.iniciada` | Se inició la generación de una carta |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `menu.import.request` | `onImportRequest` | Reflejo: ruta CATALOGO — lee, proyecta, guarda |

### Dependencias (RPC saliente)

| RPC | Módulo | Para qué |
|-----|--------|----------|
| `fs.read.request` | filesystem | Leer el JSON adjunto del storage del proyecto |
| `carta.save.request` | carta-manager | Persistir la carta (atómico, versionado) |
| `carta.list.request` | carta-manager | Resolver `carta_id` (en_servicio o activa) |
| `opciones.evaluar.request` | opciones | Derivar opciones de producto (QUITAR / ELEGIR_VARIOS) |

### Errores documentados

| Código | Significado |
|--------|-------------|
| `400 INVALID_INPUT` | Falta la fuente: no hay adjunto, material_path ni texto |
| `404 RESOURCE_NOT_FOUND` | No se pudo leer un JSON de carta del adjunto |
| `422 UPSTREAM_INVALID_RESPONSE` | El JSON no tiene productos/categorías detectables |
| `503 UPSTREAM_UNREACHABLE` | carta-manager no responde (timeout) |
| `502 UPSTREAM_INVALID` | respuesta inválida de carta-manager |

---

## 3 · FUNCIONES (payload exacto de cada operación)

### `menu.import.request` — importar catálogo por referencia

```jsonc
// Request
{
  "project_id": "uuid-del-proyecto",
  "nombre": "Carta de verano 2026",
  "material_path": "/data/projects/.../adjunto.json",   // o attachments[] en el payload
  "correlation_id": "uuid-de-correlacion"
}
// → 200
{
  "carta_id": "carta_verano_2026",
  "nombre": "Carta de verano 2026",
  "categorias": 4,
  "productos": 38
}
```

El reflejo busca la fuente en este orden:
1. `input.material_path` (path explícito)
2. `input.material_ref` (referencia)
3. `input.attachments[]` — paths que el FilePicker del frontend inyecta en el payload
   (filtra imágenes: .jpg/.png/.gif se descartan como fuentes no legibles)

Si no encuentra nada → `400 INVALID_INPUT`.

### Formato esperado del JSON fuente

El reflejo acepta cualquier JSON con `productos[]` y `categorías[]`. Cada
producto puede tener (todos opcionales salvo nombre):

```jsonc
{
  "categorias": [
    { "id": "pizzas", "nombre": "Pizzas", "orden": 1 }
  ],
  "productos": [
    {
      "nombre": "Margarita",
      "categoria_id": "pizzas",
      "precio": 8.50,
      "ingredientes": [
        { "nombre": "Tomate", "familia": "salsa" },
        { "nombre": "Mozzarella", "familia": "queso", "precio_extra": 0.50 }
      ],
      "ingredientes_base": [        // ← lista rica para variaciones/mitad-mitad
        { "nombre": "Tomate", "familia": "salsa" }
      ],
      "variaciones": {
        "permite_quitar": true,
        "permite_anadir": true,
        "max_ingredientes_extra": 5,
        "extras_sugeridos": [
          { "ingrediente_id": "champinon", "precio_extra": 1.0 }
        ]
      },
      "estaciones": ["cocina"],
      "descripcion": "La clásica italiana",
      "alergenos": ["lacteos"],
      "disponible": true
    }
  ]
}
```

### Reglas de proyección (reflejo determinista)

| Regla | Comportamiento |
|-------|----------------|
| **ID** | `categoria_id + '_' + slug(nombre)`. Determinista: mismo input → mismo ID |
| **Ingrediente sin precio** | Recibe `precio_extra: 0.50€` (estándar). El 0 explícito se respeta |
| **Familia de ingrediente** | De `familia` o `tipo` (NUNCA de `grupo`). Si no trae, se hidrata por nombre |
| **Opciones** | Cada producto NACE con opciones (QUITAR sus ingredientes + ELEGIR_VARIOS de su categoría) |
| **Campos ausentes** | No se fabrican. `precio: 0`, `familia: 'otro'`, `disponible` sin default |
| **Productos sin categoría** | Se omiten (no inventar) |
| **Carta existente** | Reusa `en_servicio` o la única activa; si no, crea ID determinista |

---

## 4 · FLUJO TÍPICO (extremo a extremo)

### Ruta CATALOGO_FICHERO (la más eficiente)

```
1. Usuario adjunta JSON al chat → FilePicker inyecta path en attachments[]
2. LLM ve el adjunto → clasifica ruta = CATALOGO_FICHERO
3. LLM publica menu.import.request { project_id, nombre, attachments }
4. REFLEJO recibe → _rutasFuente() encuentra el path
5. REFLEJO → fs.read.request → obtiene el JSON
6. REFLEJO → _proyectar() → shape canónico carta-pizzepos
   (ingredientes normalizados, opciones derivadas, IDs deterministas)
7. REFLEJO → _resolverCartaId() → reusa carta en_servicio o crea nueva
8. REFLEJO → carta.save.request → CUSTODIO persiste (atómico, versionado)
9. REFLEJO responde 200 { carta_id, productos: N }
10. UI muestra confirmación + carta generada
```

### Ruta TEXTO_LIBRE (dictado/recetas)

```
1. Usuario dicta: "Una pizza margarita a 8€, otra con champiñones a 10€..."
2. LLM clasifica ruta = TEXTO_LIBRE
3. LLM estructura el texto → Carta canónica (con mandatos de FIDELIDAD:
   cada ingrediente nace solo si la fuente lo nombra, precio ausente → 0)
4. LLM → carta.save.request (con estado: borrador)
5. VALIDACIÓN: carta.validar.request contra custodio (max 3 intentos,
   reprompt con path del error). Si no cuaja → menu.generation.failed
6. Carta nace en BORRADOR. Humano la promueve a servicio cuando verifica
```

---

## 5 · INTEGRACIÓN

> **Página activable:** `target_page_id: 'menu-generator'` — el ai-gateway lo
> trata como destino válido para `chat.cambiar_foco`. Cajones habilitados.

> **Vía rápida (CATALOGO):** Describe lo que quieres, adjunta el JSON o pégalo
> en la conversación. El reflejo lo estructura sin gastar tokens de producto.

> **Vía texto libre:** Dicta las recetas en lenguaje natural. El LLM estructura
> y persiste. La carta nace en borrador.

> **Mandato de FIDELIDAD:** ningún dato de la carta procede de fuera del material
> o de una respuesta del usuario. Un ingrediente nace solo si la fuente lo nombra.
