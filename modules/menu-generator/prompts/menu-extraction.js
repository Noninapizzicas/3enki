/**
 * Prompts especializados para extracción de menús POS
 * Genera JSON enriquecido compatible con: productos, categorias, ingredientes, variaciones
 */

const MENU_EXTRACTION_SYSTEM_PROMPT = `Eres un experto en análisis y estructuración de menús de restaurantes para sistemas POS (Point of Sale).

Tu tarea es extraer información de cartas/menús y generar un JSON estructurado y enriquecido que sea compatible con un sistema de gestión de restaurantes.

## REGLAS CRÍTICAS

1. **SIEMPRE responde con JSON válido** dentro de un bloque \`\`\`json
2. **Infiere información faltante** de forma inteligente:
   - Si no hay descripción, créala basándote en el nombre e ingredientes típicos
   - Si no hay precio, usa 0 y marca confianza baja
   - Detecta ingredientes implícitos (ej: "Pizza Margarita" → tomate, mozzarella, albahaca)
3. **Normaliza nombres** a español y capitalización correcta
4. **Detecta alérgenos** automáticamente basándote en ingredientes
5. **Agrupa productos** en categorías lógicas si no están explícitas
6. **Genera IDs únicos** siguiendo el patrón: cat_nombre, prod_nombre, ing_nombre

## FORMATO DE SALIDA REQUERIDO

\`\`\`json
{
  "menu_id": "menu_[timestamp]",
  "nombre": "Nombre del Menú/Carta",
  "descripcion": "Descripción general",
  "categorias": [
    {
      "id": "cat_entrantes",
      "nombre": "Entrantes",
      "emoji": "🥗",
      "orden": 0,
      "descripcion": "Para empezar"
    }
  ],
  "productos": [
    {
      "id": "prod_ensalada_cesar",
      "nombre": "Ensalada César",
      "nombre_corto": "César",
      "emoji": "🥗",
      "categoria_id": "cat_entrantes",
      "descripcion": "Lechuga romana, parmesano, croutons y aderezo César",
      "precio": 8.50,
      "ingredientes": [
        { "ingrediente_id": "ing_lechuga", "es_principal": true, "removible": false },
        { "ingrediente_id": "ing_parmesano", "removible": true },
        { "ingrediente_id": "ing_croutons", "removible": true }
      ],
      "alergenos": ["gluten", "lactosa", "huevo"],
      "variaciones": {
        "permite_quitar_ingredientes": true,
        "permite_extras": true,
        "extras_sugeridos": [
          { "ingrediente_id": "ing_pollo", "precio_extra": 2.50 },
          { "ingrediente_id": "ing_anchoas", "precio_extra": 1.50 }
        ]
      },
      "tags": ["popular"],
      "orden": 0
    }
  ],
  "ingredientes_catalogo": [
    {
      "id": "ing_lechuga",
      "nombre": "Lechuga Romana",
      "emoji": "🥬",
      "tipo": "vegetal",
      "es_extra": false,
      "alergenos": []
    },
    {
      "id": "ing_parmesano",
      "nombre": "Parmesano",
      "emoji": "🧀",
      "tipo": "lacteo",
      "es_extra": true,
      "precio_extra": 1.00,
      "alergenos": ["lactosa"]
    }
  ],
  "variaciones_globales": [
    {
      "id": "var_tamano_pizza",
      "nombre": "Tamaño Pizza",
      "tipo": "tamano",
      "aplica_a_categorias": ["cat_pizzas"],
      "valores": [
        { "nombre": "Mediana", "multiplicador_precio": 1 },
        { "nombre": "Familiar", "multiplicador_precio": 1.4 }
      ]
    }
  ],
  "metadata": {
    "generado_at": "2024-01-15T10:30:00Z",
    "fuente": "imagen",
    "idioma": "es",
    "moneda": "EUR",
    "restaurante_tipo": "italiano",
    "estadisticas": {
      "total_productos": 25,
      "total_categorias": 5,
      "total_ingredientes": 40,
      "precio_medio": 12.50,
      "precio_minimo": 3.00,
      "precio_maximo": 22.00
    },
    "confianza": 0.85
  }
}
\`\`\`

## MAPEO DE ALÉRGENOS

Detecta automáticamente:
- **gluten**: pan, pasta, harina, cerveza, rebozados, croutons
- **lactosa**: queso, leche, nata, mantequilla, yogur
- **huevo**: mayonesa, rebozados, pasta fresca, algunos postres
- **pescado**: pescados, atún, salmón, anchoas
- **crustaceos**: gambas, langostinos, cangrejo, bogavante
- **frutos_secos**: almendras, nueces, pistachos, piñones
- **cacahuete**: cacahuetes, mantequilla de cacahuete
- **soja**: salsa soja, tofu, edamame
- **sesamo**: pan con sésamo, hummus, tahini
- **mostaza**: salsas, vinagretas
- **apio**: caldos, sopas, ensaladas
- **sulfitos**: vino, vinagre, frutos secos
- **moluscos**: mejillones, almejas, pulpo, calamar

## TIPOS DE INGREDIENTES Y EMOJIS

IMPORTANTE: Asigna SIEMPRE un emoji apropiado a cada ingrediente.

| Tipo | Descripción | Emojis sugeridos |
|------|-------------|------------------|
| **base** | arroz, pasta, pan, masa | 🍚 🍝 🍞 🫓 🥖 🥯 |
| **proteina** | carne, pescado, huevo, legumbres | 🥩 🍗 🍖 🥓 🐟 🦐 🥚 🫘 |
| **vegetal** | verduras, hortalizas | 🥬 🥒 🍅 🧅 🧄 🥕 🌽 🥦 🍆 🫑 🥗 |
| **lacteo** | quesos, nata, leche | 🧀 🥛 🍶 🧈 |
| **condimento** | sal, pimienta, especias, hierbas | 🧂 🌿 🌶️ 🫚 🧅 |
| **salsa** | tomate, mayonesa, pesto, etc | 🍅 🥫 🫒 |
| **topping** | decoración, finales | 🍫 🥜 🌰 ✨ |
| **carbohidrato** | patatas, cereales | 🥔 🌾 🍠 |
| **grasa** | aceite, mantequilla | 🫒 🧈 |
| **fruta** | frutas | 🍎 🍋 🍊 🍇 🍓 🍌 🥭 🍍 |
| **marisco** | mariscos y moluscos | 🦐 🦞 🦀 🦑 🐙 🦪 🦪 |
| **bebida** | líquidos | 🍷 🍺 ☕ 🧃 |

### Mapeo de ingredientes comunes a emojis:

**Carnes:**
- Pollo → 🍗, Ternera/Res → 🥩, Cerdo → 🐷, Bacon/Panceta → 🥓
- Jamón → 🍖, Chorizo → 🌭, Salchicha → 🌭

**Pescados y Mariscos:**
- Pescado genérico → 🐟, Salmón → 🍣, Atún → 🐟, Anchoas → 🐟
- Gambas/Langostinos → 🦐, Mejillones → 🦪, Pulpo → 🐙, Calamar → 🦑

**Verduras:**
- Lechuga → 🥬, Tomate → 🍅, Cebolla → 🧅, Ajo → 🧄
- Pimiento → 🫑, Zanahoria → 🥕, Pepino → 🥒, Champiñón → 🍄
- Espinacas → 🥬, Brócoli → 🥦, Maíz → 🌽, Berenjena → 🍆
- Aguacate → 🥑, Aceitunas → 🫒, Rúcula → 🥬

**Lácteos:**
- Queso genérico → 🧀, Mozzarella → 🧀, Parmesano → 🧀
- Nata → 🥛, Mantequilla → 🧈, Mascarpone → 🧀

**Bases y Carbohidratos:**
- Pasta → 🍝, Arroz → 🍚, Pan → 🍞, Masa pizza → 🫓
- Patata → 🥔, Boniato → 🍠

**Huevos:**
- Huevo → 🥚

**Condimentos:**
- Albahaca → 🌿, Orégano → 🌿, Perejil → 🌿, Cilantro → 🌿
- Pimienta → 🌶️, Sal → 🧂, Trufa → 🍄

**Salsas:**
- Tomate → 🍅, Pesto → 🌿, Mayonesa → 🥚, Mostaza → 🟡

**Otros:**
- Café → ☕, Chocolate/Cacao → 🍫, Miel → 🍯, Azúcar → 🍬
- Vino → 🍷, Aceite oliva → 🫒

## TAGS DE PRODUCTOS

Asigna cuando aplique:
- **vegano**: sin productos animales
- **vegetariano**: sin carne ni pescado
- **sin_gluten**: apto para celíacos
- **sin_lactosa**: sin lácteos
- **picante**: contiene picante
- **nuevo**: plato nuevo (si se indica)
- **popular**: plato destacado/recomendado
- **recomendado**: sugerencia del chef`;

const MENU_EXTRACTION_USER_PROMPT = `Analiza el siguiente contenido de menú/carta y extrae toda la información en el formato JSON especificado.

Si es una imagen o PDF, extrae todo el texto visible y estructúralo.
Si es texto, organízalo en el formato requerido.

IMPORTANTE:
1. Detecta TODOS los productos visibles
2. Infiere ingredientes cuando no estén explícitos
3. Calcula alérgenos basándote en ingredientes
4. Sugiere extras lógicos para cada producto
5. Agrupa en categorías coherentes
6. Usa precios exactos si están visibles, o marca confianza baja si inferidos

Contenido a analizar:
{content}

{additional_context}

Responde SOLO con el JSON válido dentro de \`\`\`json ... \`\`\``;

const MENU_CHAT_SYSTEM_PROMPT = `Eres un asistente experto en creación de menús para restaurantes, especializado en sistemas POS.

Ayudas a los usuarios a:
1. **Crear menús desde cero** preguntando sobre tipo de cocina, categorías deseadas, etc.
2. **Analizar cartas existentes** extrayendo información estructurada
3. **Enriquecer menús** añadiendo descripciones, alérgenos, ingredientes
4. **Sugerir mejoras** como variaciones, extras, precios

## Tu flujo de trabajo:

### Fase 1: Recopilación
- Pregunta sobre tipo de establecimiento (restaurante, cafetería, bar, etc.)
- Averigua cocina principal (italiana, japonesa, española, etc.)
- Define categorías necesarias
- Recopila productos con precios

### Fase 2: Generación
Cuando tengas suficiente información, genera el JSON completo diciendo:
"He generado tu menú con X productos en Y categorías. Aquí está el resultado:"

Seguido del JSON en formato \`\`\`json ... \`\`\`

### Fase 3: Refinamiento
- Permite al usuario hacer correcciones
- Añade productos adicionales
- Ajusta precios, descripciones, ingredientes

## Reglas de conversación:
- Sé conciso pero informativo
- Usa emojis para categorías y productos
- Sugiere mejoras proactivamente
- Si el usuario sube una imagen/PDF, extrae todo automáticamente
- Confirma entendimiento antes de generar

## Ejemplo de interacción inicial:
Usuario: "Quiero crear un menú para mi pizzería"
Tú: "¡Genial! Para crear el menú de tu pizzería necesito saber:

1. 🍕 ¿Qué tipos de pizza ofreces? (clásicas, gourmet, especiales)
2. 📋 ¿Tienes otras categorías? (entrantes, pastas, postres, bebidas)
3. 💰 ¿Cuál es tu rango de precios aproximado?
4. ⭐ ¿Hay algún plato estrella o especialidad?

También puedes subir una foto de tu carta actual y la digitalizo automáticamente."`;

const REFINEMENT_PROMPT = `El usuario quiere modificar el menú generado.
Aplica los cambios solicitados y devuelve el JSON actualizado.

Menú actual:
{current_menu}

Cambios solicitados:
{changes}

Responde con el JSON completo actualizado dentro de \`\`\`json ... \`\`\``;

/**
 * Genera el prompt de extracción con contexto adicional
 */
function buildExtractionPrompt(content, options = {}) {
  const additionalContext = [];

  if (options.restaurantType) {
    additionalContext.push(`Tipo de restaurante: ${options.restaurantType}`);
  }
  if (options.language) {
    additionalContext.push(`Idioma preferido: ${options.language}`);
  }
  if (options.currency) {
    additionalContext.push(`Moneda: ${options.currency}`);
  }
  if (options.categories) {
    additionalContext.push(`Categorías esperadas: ${options.categories.join(', ')}`);
  }
  if (options.hints) {
    additionalContext.push(`Notas adicionales: ${options.hints}`);
  }

  return MENU_EXTRACTION_USER_PROMPT
    .replace('{content}', content)
    .replace('{additional_context}', additionalContext.length > 0
      ? `\nContexto adicional:\n${additionalContext.join('\n')}`
      : '');
}

/**
 * Genera mensajes para llamada a AI con extracción de menú
 */
function buildExtractionMessages(content, options = {}) {
  return [
    { role: 'system', content: MENU_EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: buildExtractionPrompt(content, options) }
  ];
}

/**
 * Genera prompt de sistema para chat conversacional
 */
function buildChatSystemPrompt(conversation) {
  let prompt = MENU_CHAT_SYSTEM_PROMPT;

  if (conversation.templateId) {
    const templateHints = {
      'tpl_restaurante_italiano': 'El usuario tiene un restaurante italiano. Sugiere pizzas, pastas, antipasti típicos.',
      'tpl_restaurante_japones': 'El usuario tiene un restaurante japonés. Incluye sushi, ramen, tempura.',
      'tpl_cafeteria': 'El usuario tiene una cafetería. Enfócate en desayunos, brunch, sándwiches, cafés.',
      'tpl_bar_tapas': 'El usuario tiene un bar de tapas español. Sugiere tapas frías/calientes, raciones.',
      'tpl_comida_rapida': 'El usuario tiene un fast food. Incluye hamburguesas, combos, patatas.'
    };

    if (templateHints[conversation.templateId]) {
      prompt += `\n\n## Contexto específico:\n${templateHints[conversation.templateId]}`;
    }
  }

  return prompt;
}

/**
 * Extrae JSON de una respuesta de IA
 */
function extractJSONFromResponse(response) {
  // Buscar bloque ```json ... ```
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);

  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (e) {
      throw new Error(`JSON inválido en respuesta: ${e.message}`);
    }
  }

  // Intentar parsear respuesta completa como JSON
  try {
    return JSON.parse(response);
  } catch (e) {
    return null;
  }
}

/**
 * Valida estructura básica del menú generado
 */
function validateMenuStructure(menu) {
  const errors = [];

  if (!menu.categorias || !Array.isArray(menu.categorias) || menu.categorias.length === 0) {
    errors.push('El menú debe tener al menos una categoría');
  }

  if (!menu.productos || !Array.isArray(menu.productos) || menu.productos.length === 0) {
    errors.push('El menú debe tener al menos un producto');
  }

  // Validar que cada producto tenga categoría válida
  if (menu.productos && menu.categorias) {
    const catIds = new Set(menu.categorias.map(c => c.id));
    for (const prod of menu.productos) {
      if (!catIds.has(prod.categoria_id)) {
        errors.push(`Producto "${prod.nombre}" tiene categoria_id inválido: ${prod.categoria_id}`);
      }
    }
  }

  // Validar que ingredientes referenciados existan en catálogo
  if (menu.productos && menu.ingredientes_catalogo) {
    const ingIds = new Set(menu.ingredientes_catalogo.map(i => i.id));
    for (const prod of menu.productos) {
      if (prod.ingredientes) {
        for (const ing of prod.ingredientes) {
          if (!ingIds.has(ing.ingrediente_id)) {
            errors.push(`Producto "${prod.nombre}" referencia ingrediente inexistente: ${ing.ingrediente_id}`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Mapeo de ingredientes a emojis por nombre
 */
const INGREDIENT_EMOJI_MAP = {
  // Carnes
  'pollo': '🍗', 'chicken': '🍗', 'pechuga': '🍗',
  'ternera': '🥩', 'res': '🥩', 'beef': '🥩', 'vacuno': '🥩', 'entrecot': '🥩', 'solomillo': '🥩',
  'cerdo': '🐷', 'pork': '🐷', 'lomo': '🐷',
  'bacon': '🥓', 'panceta': '🥓', 'tocino': '🥓',
  'jamon': '🍖', 'jamón': '🍖', 'prosciutto': '🍖', 'serrano': '🍖',
  'chorizo': '🌭', 'salchicha': '🌭', 'frankfurter': '🌭',
  'cordero': '🍖', 'lamb': '🍖',
  'pato': '🦆', 'duck': '🦆',

  // Pescados y Mariscos
  'pescado': '🐟', 'fish': '🐟',
  'salmon': '🍣', 'salmón': '🍣',
  'atun': '🐟', 'atún': '🐟', 'tuna': '🐟',
  'anchoa': '🐟', 'anchoas': '🐟', 'anchovy': '🐟', 'boquerones': '🐟',
  'bacalao': '🐟', 'cod': '🐟',
  'lubina': '🐟', 'dorada': '🐟', 'merluza': '🐟',
  'gamba': '🦐', 'gambas': '🦐', 'langostino': '🦐', 'langostinos': '🦐', 'shrimp': '🦐', 'prawn': '🦐',
  'mejillon': '🦪', 'mejillones': '🦪', 'mussel': '🦪',
  'almeja': '🦪', 'almejas': '🦪', 'clam': '🦪',
  'pulpo': '🐙', 'octopus': '🐙',
  'calamar': '🦑', 'calamares': '🦑', 'squid': '🦑',
  'cangrejo': '🦀', 'crab': '🦀',
  'langosta': '🦞', 'bogavante': '🦞', 'lobster': '🦞',

  // Verduras
  'lechuga': '🥬', 'lettuce': '🥬', 'escarola': '🥬',
  'espinaca': '🥬', 'espinacas': '🥬', 'spinach': '🥬',
  'rucula': '🥬', 'rúcula': '🥬', 'arugula': '🥬',
  'tomate': '🍅', 'tomato': '🍅', 'cherry': '🍅',
  'cebolla': '🧅', 'onion': '🧅', 'cebolleta': '🧅',
  'ajo': '🧄', 'garlic': '🧄',
  'pimiento': '🫑', 'pepper': '🫑', 'pimientos': '🫑', 'morron': '🫑', 'morrón': '🫑',
  'zanahoria': '🥕', 'carrot': '🥕',
  'pepino': '🥒', 'cucumber': '🥒', 'pepinillo': '🥒',
  'champiñon': '🍄', 'champiñones': '🍄', 'champiñón': '🍄', 'mushroom': '🍄', 'setas': '🍄', 'trufa': '🍄',
  'brocoli': '🥦', 'brócoli': '🥦', 'broccoli': '🥦',
  'maiz': '🌽', 'maíz': '🌽', 'corn': '🌽',
  'berenjena': '🍆', 'eggplant': '🍆', 'aubergine': '🍆',
  'aguacate': '🥑', 'avocado': '🥑', 'guacamole': '🥑',
  'aceituna': '🫒', 'aceitunas': '🫒', 'olive': '🫒', 'olivas': '🫒',
  'jalapeño': '🌶️', 'jalapeno': '🌶️', 'chile': '🌶️', 'guindilla': '🌶️',
  'calabacin': '🥒', 'calabacín': '🥒', 'zucchini': '🥒',

  // Lácteos
  'queso': '🧀', 'cheese': '🧀',
  'mozzarella': '🧀', 'parmesano': '🧀', 'parmesan': '🧀', 'cheddar': '🧀',
  'gorgonzola': '🧀', 'gouda': '🧀', 'emmental': '🧀', 'manchego': '🧀',
  'brie': '🧀', 'camembert': '🧀', 'feta': '🧀', 'roquefort': '🧀',
  'mascarpone': '🧀', 'ricotta': '🧀', 'burrata': '🧀',
  'nata': '🥛', 'cream': '🥛', 'crema': '🥛',
  'leche': '🥛', 'milk': '🥛',
  'mantequilla': '🧈', 'butter': '🧈',
  'yogur': '🥛', 'yogurt': '🥛',

  // Bases y Carbohidratos
  'pasta': '🍝', 'spaghetti': '🍝', 'espagueti': '🍝', 'penne': '🍝', 'fusilli': '🍝',
  'tagliatelle': '🍝', 'fettuccine': '🍝', 'rigatoni': '🍝', 'macarron': '🍝',
  'arroz': '🍚', 'rice': '🍚',
  'pan': '🍞', 'bread': '🍞', 'focaccia': '🍞', 'ciabatta': '🍞',
  'baguette': '🥖', 'chapata': '🥖',
  'masa': '🫓', 'dough': '🫓',
  'patata': '🥔', 'patatas': '🥔', 'potato': '🥔', 'papa': '🥔',
  'boniato': '🍠', 'sweet potato': '🍠',
  'croutons': '🍞', 'crutones': '🍞',

  // Huevos
  'huevo': '🥚', 'huevos': '🥚', 'egg': '🥚',

  // Condimentos y Especias
  'albahaca': '🌿', 'basil': '🌿',
  'oregano': '🌿', 'orégano': '🌿',
  'perejil': '🌿', 'parsley': '🌿',
  'cilantro': '🌿', 'coriander': '🌿',
  'romero': '🌿', 'rosemary': '🌿',
  'tomillo': '🌿', 'thyme': '🌿',
  'menta': '🌿', 'mint': '🌿', 'hierbabuena': '🌿',
  'pimienta': '🌶️', 'pepper': '🌶️',
  'sal': '🧂', 'salt': '🧂',
  'jengibre': '🫚', 'ginger': '🫚',

  // Salsas
  'tomate frito': '🥫', 'salsa tomate': '🥫', 'marinara': '🥫',
  'pesto': '🌿',
  'mayonesa': '🥚', 'mayo': '🥚',
  'mostaza': '🟡', 'mustard': '🟡',
  'ketchup': '🍅', 'catsup': '🍅',
  'bbq': '🥫', 'barbacoa': '🥫',
  'salsa rosa': '🥫', 'cocktail': '🥫',

  // Frutas
  'limon': '🍋', 'limón': '🍋', 'lemon': '🍋',
  'lima': '🍋', 'lime': '🍋',
  'naranja': '🍊', 'orange': '🍊',
  'manzana': '🍎', 'apple': '🍎',
  'fresa': '🍓', 'fresas': '🍓', 'strawberry': '🍓',
  'piña': '🍍', 'pineapple': '🍍',
  'mango': '🥭',
  'platano': '🍌', 'plátano': '🍌', 'banana': '🍌',
  'uva': '🍇', 'uvas': '🍇', 'grape': '🍇',
  'melocoton': '🍑', 'melocotón': '🍑', 'peach': '🍑',

  // Frutos secos
  'almendra': '🥜', 'almendras': '🥜', 'almond': '🥜',
  'nuez': '🥜', 'nueces': '🥜', 'walnut': '🥜',
  'piñon': '🥜', 'piñones': '🥜', 'pine nut': '🥜',
  'cacahuete': '🥜', 'cacahuetes': '🥜', 'peanut': '🥜',
  'pistacho': '🥜', 'pistachos': '🥜', 'pistachio': '🥜',
  'anacardo': '🥜', 'anacardos': '🥜', 'cashew': '🥜',
  'avellana': '🌰', 'avellanas': '🌰', 'hazelnut': '🌰',

  // Otros
  'aceite': '🫒', 'oil': '🫒', 'aceite oliva': '🫒',
  'vinagre': '🍶', 'vinegar': '🍶',
  'miel': '🍯', 'honey': '🍯',
  'azucar': '🍬', 'azúcar': '🍬', 'sugar': '🍬',
  'chocolate': '🍫', 'cacao': '🍫', 'cocoa': '🍫',
  'cafe': '☕', 'café': '☕', 'coffee': '☕',
  'vino': '🍷', 'wine': '🍷',
  'cerveza': '🍺', 'beer': '🍺'
};

/**
 * Emojis por defecto según tipo de ingrediente
 */
const TYPE_EMOJI_MAP = {
  'base': '🍚',
  'proteina': '🥩',
  'vegetal': '🥬',
  'lacteo': '🧀',
  'condimento': '🌿',
  'salsa': '🥫',
  'topping': '✨',
  'carbohidrato': '🥔',
  'grasa': '🫒',
  'fruta': '🍎',
  'marisco': '🦐',
  'bebida': '🥤',
  'otro': '🍽️'
};

/**
 * Asigna emoji a un ingrediente basándose en su nombre y tipo
 */
function assignIngredientEmoji(ingredient) {
  // Si ya tiene emoji, devolverlo
  if (ingredient.emoji) {
    return ingredient.emoji;
  }

  const nombre = (ingredient.nombre || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Normalizar acentos

  // Buscar coincidencia exacta primero
  for (const [key, emoji] of Object.entries(INGREDIENT_EMOJI_MAP)) {
    if (nombre === key || nombre.includes(key)) {
      return emoji;
    }
  }

  // Si no hay coincidencia, usar emoji por tipo
  if (ingredient.tipo && TYPE_EMOJI_MAP[ingredient.tipo]) {
    return TYPE_EMOJI_MAP[ingredient.tipo];
  }

  // Emoji genérico
  return '🍽️';
}

/**
 * Enriquece ingredientes con emojis
 */
function enrichIngredients(ingredientes) {
  return ingredientes.map(ing => ({
    ...ing,
    emoji: assignIngredientEmoji(ing)
  }));
}

/**
 * Enriquece un menú con información calculada
 */
function enrichMenu(menu) {
  const enriched = { ...menu };

  // Enriquecer ingredientes con emojis
  if (enriched.ingredientes_catalogo) {
    enriched.ingredientes_catalogo = enrichIngredients(enriched.ingredientes_catalogo);
  }

  // Calcular estadísticas
  const precios = enriched.productos
    .map(p => p.precio)
    .filter(p => p > 0);

  enriched.metadata = {
    ...enriched.metadata,
    estadisticas: {
      total_productos: enriched.productos.length,
      total_categorias: enriched.categorias.length,
      total_ingredientes: (enriched.ingredientes_catalogo || []).length,
      precio_medio: precios.length > 0
        ? Math.round((precios.reduce((a, b) => a + b, 0) / precios.length) * 100) / 100
        : 0,
      precio_minimo: precios.length > 0 ? Math.min(...precios) : 0,
      precio_maximo: precios.length > 0 ? Math.max(...precios) : 0
    }
  };

  // Asegurar orden en categorías
  enriched.categorias = enriched.categorias.map((cat, idx) => ({
    ...cat,
    orden: cat.orden ?? idx
  }));

  // Asegurar orden en productos dentro de cada categoría
  const productosPorCategoria = {};
  enriched.productos.forEach(prod => {
    if (!productosPorCategoria[prod.categoria_id]) {
      productosPorCategoria[prod.categoria_id] = [];
    }
    productosPorCategoria[prod.categoria_id].push(prod);
  });

  let orden = 0;
  enriched.productos = enriched.productos.map(prod => ({
    ...prod,
    orden: prod.orden ?? orden++
  }));

  return enriched;
}

module.exports = {
  MENU_EXTRACTION_SYSTEM_PROMPT,
  MENU_EXTRACTION_USER_PROMPT,
  MENU_CHAT_SYSTEM_PROMPT,
  REFINEMENT_PROMPT,
  INGREDIENT_EMOJI_MAP,
  TYPE_EMOJI_MAP,
  buildExtractionPrompt,
  buildExtractionMessages,
  buildChatSystemPrompt,
  extractJSONFromResponse,
  validateMenuStructure,
  enrichMenu,
  enrichIngredients,
  assignIngredientEmoji
};
