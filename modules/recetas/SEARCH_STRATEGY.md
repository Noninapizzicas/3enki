# Estrategia de Búsqueda - Recetas v2

## Arquitectura

```
┌──────────────────────────────────────────────────────────┐
│ searchRecetas(projectId, criteria)                       │
└─────────────────┬──────────────────────────────────────┘
                  │
        ┌─────────┴────────────┐
        │                      │
        ▼                      ▼
┌──────────────────┐  ┌──────────────────────────┐
│ SearchFilters    │  │ SearchRanker             │
│ (build SQL)      │  │ (score + rank results)   │
└──────────────────┘  └──────────────────────────┘
        │                      │
        └─────────┬────────────┘
                  │
                  ▼
        ┌──────────────────┐
        │ SQLite Query     │
        │ (execute filters)│
        └──────────┬───────┘
                   │
                   ▼
        ┌──────────────────┐
        │ Rank Results     │
        │ (multi-factor)   │
        └──────────┬───────┘
                   │
                   ▼
        ┌──────────────────┐
        │ Return Sorted    │
        │ (score DESC)     │
        └──────────────────┘
```

## Algoritmo de Ranking

Puntuación multi-factor: máximo 100+ puntos

### 1. Nombre Match (40 puntos máximo)

**Lógica:**
```
Coincidencia exacta "pasta carbonara" == "pasta carbonara"
  → 40 puntos (100%)

Comienza con "pasta" (búsqueda: "pasta c...")
  → 35 puntos (87.5%)

Palabra exacta "carbonara" en "pasta a la carbonara"
  → 30 puntos (75%)

Substring "pasta" en "pasta con jamón"
  → escalado: (4 chars / 14 total) * 20 = ~6 puntos
```

**Ejemplos:**
- Búsqueda: `"pasta"`
  - "Pasta Carbonara" → 35 (comienza con)
  - "Espaguetis a la Pasta" → 0 (no comienza)
  - "Pasta Fresca" → 40 (exacto)

---

### 2. Ingredientes (30 puntos máximo)

**Lógica:**
```
Si busco: ["tomate", "ajo"]
Receta tiene: "tomate | ajo | cebolla | jamón"

Matches: 2/2 ingredientes
Ratio: 100%
Puntos: 30
```

**Ejemplos:**
- Búsqueda: `["tomate", "ajo"]`
  - Receta A: "tomate | ajo | cebolla" → 30 puntos (2/2)
  - Receta B: "tomate | cebolla" → 15 puntos (1/2)
  - Receta C: "cebolla | perejil" → 0 puntos (0/2)

---

### 3. Coste (20 puntos máximo)

**Lógica:**
```
Búsqueda: coste_min=8€, coste_max=15€

Receta cuesta 10€
→ Dentro del rango: 20 puntos

Receta cuesta 5€
→ Fuera (menor): 20 - (8-5)*2 = 14 puntos

Receta cuesta 25€
→ Fuera (mayor): 20 - (25-15)*2 = 0 puntos (capped)
```

---

### 4. Viabilidad (10 puntos máximo, opcional)

```
viabilidad: "alta"  → 10 puntos
viabilidad: "media" → 5 puntos
viabilidad: "baja"  → 0 puntos
```

---

### 5. Recency (5 puntos máximo)

```
Creada hace 0 días   → 5 puntos
Creada hace 7 días   → 4 puntos
Creada hace 14 días  → 3 puntos
Creada hace 35 días  → 0 puntos
```

(Descuenta 1 punto cada 7 días)

---

## Score Final

```
TOTAL = nombre_score + ingredientes_score + coste_score + viabilidad_score + recency_score

Rango: 0 - 100+
```

**Interpretación:**
- 85-100+: Excelente match
- 60-84: Muy bueno
- 40-59: Bueno
- 20-39: Aceptable
- 0-19: Pobre

---

## Criterios de Filtro Soportados (40+)

### Texto
- `nombre` (LIKE substring, case-insensitive)
- `ingredientes[]` (todos deben estar presentes)
- `ingredientes_excluir[]` (excluye si está presente)
- `etiquetas[]` (JSON array, ALL)

### Numeric Ranges
- `dificultad_min`, `dificultad_max` (1-10)
- `tiempo_min`, `tiempo_max` (minutos)
- `coste_min`, `coste_max` (€ por porción)
- `coste_total_min`, `coste_total_max` (€ total)
- `porciones_min`, `porciones_max`

### Viabilidad & Quality
- `viabilidad` ('alta' | 'media' | 'baja')
- `viabilidad_bonus` (boolean: da bonus si es alta)

### Características Alimentarias
- `caracteristicas[]` ('vegetariano', 'sin_gluten', 'vegano', 'sin_lactosa')
- `metodos_coccion[]` ('caliente', 'frio', 'horno', 'plancha')
- `tipos_plato[]` ('segundo', 'postre', 'entrada', 'finales')

### Alérgenos
- `alerge nos_excluir[]` (excluye recetas que contengan)
- `alerge nos_incluir[]` (solo recetas que contengan)

### Timeline
- `creado_despues` (timestamp)
- `creado_antes` (timestamp)
- `modificado_despues` (timestamp)
- `modificado_antes` (timestamp)

### Pagination & Sorting
- `limit` (default 50)
- `offset` (default 0)
- `sortBy` ('relevancia', 'nombre', 'dificultad', 'tiempo', 'coste', 'created_at', 'updated_at')
- `sortOrder` ('asc' | 'desc', default 'desc')

---

## Ejemplos de Búsqueda

### Ejemplo 1: Búsqueda Simple
```javascript
const results = await recetas.handleBuscar({
  projectId: 'proj_123',
  criteria: {
    nombre: 'pasta',
    limit: 10
  }
});

// Retorna:
// [
//   {
//     id: "rec_pasta-carbonara_1713090000",
//     nombre: "Pasta a la Carbonara",
//     _score: 38, // 35 (nombre) + 2 (recency) + 1 (otras)
//     ...
//   },
//   {
//     id: "rec_pasta-aglio-e-olio_1713090100",
//     nombre: "Pasta Aglio e Olio",
//     _score: 36, // Similar pero más antigua
//     ...
//   }
// ]
```

---

### Ejemplo 2: Búsqueda Compleja
```javascript
const results = await recetas.handleBuscar({
  projectId: 'proj_123',
  criteria: {
    // Nombre
    nombre: 'pasta',
    
    // Ingredientes
    ingredientes: ['tomate', 'ajo'],
    ingredientes_excluir: ['carne'],
    
    // Dificultad y Tiempo
    dificultad_max: 7,
    tiempo_max: 30,
    
    // Coste
    coste_min: 3,
    coste_max: 12,
    
    // Características
    caracteristicas: ['vegetariano'],
    alerge nos_excluir: ['gluten'],
    
    // Viabilidad
    viabilidad: 'alta',
    viabilidad_bonus: true,
    
    // Pagination
    limit: 20,
    offset: 0,
    
    // Sorting
    sortBy: 'relevancia',
    sortOrder: 'desc'
  }
});

// SQL construido:
/*
SELECT * FROM receta_search_index 
WHERE proyecto_id = ?
  AND nombre_lower LIKE '%pasta%'
  AND ingredientes_nombres LIKE '%tomate%'
  AND ingredientes_nombres LIKE '%ajo%'
  AND ingredientes_nombres NOT LIKE '%carne%'
  AND dificultad_max <= 7
  AND tiempo_prep_min <= 30
  AND coste_porcion_max >= 3
  AND coste_porcion_min <= 12
  AND caracteristicas LIKE '%vegetariano%'
  AND alerge nos NOT LIKE '%gluten%'
  AND viabilidad = 'alta'
*/

// Resultado: array ordenado por _score DESC
```

---

### Ejemplo 3: Timeline Search
```javascript
const results = await recetas.handleBuscar({
  projectId: 'proj_123',
  criteria: {
    creado_despues: '2026-04-01',
    creado_antes: '2026-04-14',
    sortBy: 'created_at',
    sortOrder: 'desc'
  }
});

// Retorna: recetas creadas en los últimos 2 semanas, ordenadas por fecha
```

---

### Ejemplo 4: Filtro Seguridad Alimentaria
```javascript
const results = await recetas.handleBuscar({
  projectId: 'proj_123',
  criteria: {
    // Usuario alérgico a gluten Y lactosa
    alerge nos_excluir: ['gluten', 'lactosa'],
    
    // Pero puede comer huevo
    // (no hay alerge nos_incluir, así que cualquier otra es ok)
    
    limit: 50
  }
});

// Retorna: todas las recetas SIN gluten ni lactosa
```

---

## Validación de Criterios

```javascript
const filters = new SearchFilters(logger);
const validation = filters.validateCriteria(criteria);

if (!validation.valid) {
  console.error('Criterios inválidos:', validation.errors);
  // [
  //   'dificultad_min debe estar entre 1-10',
  //   'coste_min no puede ser mayor a coste_max'
  // ]
}
```

---

## Local vs External Search

### Local Search (Nuestra Implementación)
**Cuando usar:**
- Recetas dentro del proyecto
- Filtros simples + complejos
- Ranking personalizado (multi-factor)
- Búsqueda on-demand

**Ventajas:**
- Control total sobre scoring
- Privacy (datos locales)
- Bajo costo

**Desventajas:**
- No escalable a 1M+ recetas
- No soporta búsqueda fuzzy avanzada

### External Search (ElasticSearch, etc)
**Cuando usar:**
- Escala global (todos los proyectos)
- Búsqueda fuzzy/typo-tolerant
- Analytics avanzado

**Nota:** Por ahora (v2) implementamos local. External search en v3.

---

## Performance Tips

### 1. Índices Estratégicos
```sql
-- Estos índices ya existen en schema.sql
CREATE INDEX idx_receta_search_proyecto_nombre 
  ON receta_search_index(proyecto_id, nombre_lower);

CREATE INDEX idx_receta_search_proyecto_viabilidad 
  ON receta_search_index(proyecto_id, viabilidad);
```

**Impacto:** Búsquedas básicas < 10ms en 100 recetas

### 2. Denormalización
`receta_search_index` replica datos para evitar JOINs costosos.

**Costo:** +500 bytes por receta en tabla duplicada
**Beneficio:** Búsqueda con 40+ criterios sin JOINs complejos

### 3. Paginación
Usar `limit` + `offset` para grandes result sets:
```javascript
// ❌ Malo: traer todo a memoria
const all = await searchRecetas(...); // 500 resultados

// ✓ Bueno: paginar
const page1 = await searchRecetas({...criteria, limit: 20, offset: 0});
const page2 = await searchRecetas({...criteria, limit: 20, offset: 20});
```

### 4. Limitar Campos
En futuro: LIMIT resultados a columnas necesarias
```javascript
// Futuro: SELECT id, nombre, _score (no JSON)
```

---

## Casos de Uso Comunes

### UC1: "Dame comida rápida para hoy"
```javascript
criteria: {
  tiempo_max: 20,
  dificultad_max: 5,
  viabilidad: 'alta',
  limit: 10,
  sortBy: 'relevancia'
}
```

### UC2: "Vegetariano sin gluten, máximo 15€"
```javascript
criteria: {
  caracteristicas: ['vegetariano'],
  alerge nos_excluir: ['gluten'],
  coste_max: 15,
  limit: 20
}
```

### UC3: "Recetas que usen tomate"
```javascript
criteria: {
  ingredientes: ['tomate'],
  sortBy: 'created_at',
  sortOrder: 'desc',
  limit: 50
}
```

### UC4: "Segundo plato desafiante para principiantes"
```javascript
criteria: {
  tipos_plato: ['segundo'],
  dificultad_min: 6,
  dificultad_max: 9,
  limit: 10
}
```

---

## Testing

### Unit Tests (search-ranker.js)
```javascript
test('ranking: nombre exacto = 40 puntos', () => {
  const ranker = new SearchRanker(logger);
  const score = ranker._scoreNombreMatch('pasta carbonara', 'pasta carbonara');
  expect(score).toBe(40);
});

test('ranking: coste fuera de rango penaliza', () => {
  const result = { coste_porcion_min: 20 };
  const score = ranker._scoreCoste(result, 8, 15);
  expect(score).toBeLessThan(20);
});
```

### Integration Tests (searchRecetas)
```javascript
test('búsqueda simple por nombre', async () => {
  await manager.createReceta({...});
  const results = await manager.searchRecetas('proj_123', {
    nombre: 'pasta'
  });
  expect(results.length).toBeGreaterThan(0);
  expect(results[0]._score).toBeGreaterThan(0);
});

test('validación de criterios inválidos', async () => {
  const validation = filters.validateCriteria({
    dificultad_min: 15 // Inválido (> 10)
  });
  expect(validation.valid).toBe(false);
});
```

---

## Notas de Diseño

1. **Ranking es inmediato:** No se precalcula, se calcula durante query (mejor para datos vivos)
2. **Scores son informativos:** El número exacto importa menos que el orden relativo
3. **Viabilidad bonus es opcional:** Por defecto ranking ignora viabilidad (busca = resultado, no calidad)
4. **Sort override:** Si sortBy != 'relevancia', ignora ranking y usa orden específico
5. **Ingredientes = AND logic:** Todos deben estar presentes (búsqueda restrictiva)
6. **Características = OR logic:** Cualquiera puede estar presente (búsqueda abierta)
