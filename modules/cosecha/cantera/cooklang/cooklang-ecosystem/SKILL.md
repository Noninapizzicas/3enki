---
name: cooklang-ecosystem
fuente: cooklang
url: https://github.com/cooklang
version: 2025-07
tipo: referencia
dominio: cocina
tags: [cooklang, markup, recetas, formato, cli, rust, parser]
---

# CookLang — Lenguaje de markup para recetas

Ecosistema completo (spec 688 + CLI 1.3k estrellas) para escribir recetas como texto plano con markup mínimo. El "Markdown de las recetas".

## Sintaxis CookLang

```cooklang
Servir @arroz{200%g} en un plato. Añadir la @salsa de soja{2%tbsp}
y el @aceite de sésamo{1%tsp}.

Cortar @cebolleta{2} en juliana fina con el #cuchillo de chef.

Saltear en #wok a fuego alto durante ~{3%minutos}.
```

### Marcadores

| Símbolo | Significado | Ejemplo |
|---|---|---|
| `@` | Ingrediente | `@sal{1%tsp}` → 1 tsp de sal |
| `#` | Utensilio | `#sartén` → necesitas sartén |
| `~` | Tiempo/timer | `~{15%minutos}` → 15 minutos |
| `--` | Comentario | `-- nota del chef` |
| `>>` | Metadata | `>> servings: 4` |

### Metadata de receta

```cooklang
>> source: https://example.com/receta
>> servings: 4
>> time: 45 min
>> course: main
>> cuisine: mediterranean
```

## CLI (cookcli) — Rust

```bash
# Instalar
cargo install cookcli
# o binario precompilado desde GitHub releases

# Servidor web local con tus recetas
cook server ~/mis-recetas/

# Listar ingredientes para la compra
cook shopping-list ~/mis-recetas/pasta-carbonara.cook

# Buscar recetas
cook search "pollo" ~/mis-recetas/
```

### Shopping list automática

```bash
$ cook shopping-list cena.cook
Ingredientes:
  arroz          200 g
  salsa de soja    2 tbsp
  aceite sésamo    1 tsp
  cebolleta        2
```

## Estructura de un cookbook CookLang

```
mis-recetas/
├── Entrantes/
│   ├── hummus.cook
│   └── gazpacho.cook
├── Principales/
│   ├── paella-valenciana.cook
│   └── pasta-carbonara.cook
├── Postres/
│   └── crema-catalana.cook
├── config/
│   ├── aisle.conf      → mapeo ingrediente→pasillo (para shopping list)
│   └── units.conf      → conversiones de unidades personalizadas
└── images/
    └── paella-valenciana.jpg
```

## awesome-cooklang-recipes (107 estrellas)

Lista curada de cookbooks públicos en CookLang: recetas italianas, indias, brasileñas, panadería, cócteles.

## Valor para referencia

- Formato estándar de receta en texto plano — git-friendly, versionable
- Parser disponible en múltiples lenguajes (Rust, Swift, Python, JS)
- Generación automática de listas de compra desde recetas
- Integración con Obsidian vía plugin community
