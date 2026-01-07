# Arquitectura de Composición Progresiva de Proyectos

> **Problema**: Los proyectos no nacen organizados. Evolucionan, se relacionan, y eventualmente forman sistemas mayores.
>
> **Fecha**: 2026-01-07
> **Versión**: 2.0.0 (IMPLEMENTADO)
> **Estado**: ✅ COMPLETAMENTE IMPLEMENTADO
>
> Ver [PLAN_COMPOSICION_PROYECTOS.md](./PLAN_COMPOSICION_PROYECTOS.md) para detalles técnicos de implementación.

---

## El Caso Real: Sistema de Hostelería

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EVOLUCIÓN REAL DE UN SISTEMA                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MES 1: "Necesito facturación"                                              │
│  ─────────────────────────────                                              │
│  [Facturación v1]                                                            │
│  - Emitir facturas                                                           │
│  - Gestión básica de clientes                                                │
│  - Funciona, pero limitado                                                   │
│                                                                              │
│  MES 3: "Ahora necesito controlar compras"                                  │
│  ─────────────────────────────────────────                                  │
│  [Facturación v1]     [Compras v1]                                          │
│  (proyecto cerrado)   - Pedidos a proveedores                                │
│                       - Control de stock                                     │
│                       - 💡 "Oye, esto comparte clientes con facturación..."  │
│                                                                              │
│  MES 5: "Compras y Facturas deberían estar unidos"                          │
│  ─────────────────────────────────────────────────                          │
│  [Facturación v1] ←──── comparten ────→ [Compras v1]                        │
│       │                 historias              │                             │
│       │                 datos                  │                             │
│       └─────────────────┬──────────────────────┘                             │
│                         │                                                    │
│                    ¿CÓMO UNIRLOS?                                            │
│                                                                              │
│  MES 7: "Necesito comandero para el local"                                  │
│  ─────────────────────────────────────────                                  │
│  [Facturación] [Compras] [Comandero v1]                                     │
│       │           │      - Toma de pedidos                                   │
│       │           │      - Mesas                                             │
│       │           │      - 💡 "Esto genera facturas..."                      │
│       │           │      - 💡 "Y descuenta del stock..."                     │
│       └───────────┴──────────┴───────────────────┐                           │
│                                                  │                           │
│                                          COLUMNA VERTEBRAL                   │
│                                                                              │
│  MES 10: "Ahora pantallas de cocina"                                        │
│  ───────────────────────────────────                                        │
│  [Facturación] [Compras] [Comandero] [Cocina v1]                            │
│       │           │          │       - Tickets                               │
│       │           │          │       - Pantallas táctiles                    │
│       │           │          │       - Estados de pedidos                    │
│       └───────────┴──────────┴───────────┴───────────────┐                   │
│                                                          │                   │
│                            ┌─────────────────────────────▼────────────────┐  │
│                            │     SISTEMA GESTIÓN HOSTELERÍA               │  │
│                            │     (Emergió de 4 proyectos separados)       │  │
│                            └──────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## El Problema con Modelos Tradicionales

### Modelo Jerárquico (NO funciona aquí)

```
❌ PROBLEMA: Asume que sabes la estructura desde el inicio

Disciplina "Hostelería"
  └── Cliente "Mi Local"
       └── Proyecto "Sistema Completo"

¿Y si empecé con "Facturación" sin saber que iba a crecer?
¿Dónde pongo las conversaciones de cuando no existía la jerarquía?
```

### Modelo Plano Actual (Limitado)

```
⚠️ PROBLEMA: No captura relaciones

[Facturación]  [Compras]  [Comandero]  [Cocina]

4 proyectos separados, sin conexión.
Las historias de "Facturación" no saben que
luego influyeron en "Comandero".
```

---

## Modelo Propuesto: Composición Progresiva

### Concepto: Proyecto con Linaje

Cada proyecto conoce:
- **De dónde viene** (proyecto origen / inspiración)
- **Con quién comparte** (proyectos hermanos)
- **A qué contribuye** (sistema/producto mayor)

```javascript
// Estructura de Proyecto con Linaje
{
  id: "proj-comandero",
  name: "Comandero Local",

  // ═══════════════════════════════════════════════════════════════════
  // LINAJE: De dónde viene este proyecto
  // ═══════════════════════════════════════════════════════════════════
  lineage: {
    // Proyecto(s) que inspiraron o dieron origen a este
    inspired_by: ["proj-facturacion", "proj-compras"],

    // Fecha en que se estableció la relación
    linked_at: "2026-03-15T10:00:00Z",

    // Nota de por qué se relacionaron
    link_reason: "El comandero necesita generar facturas y descontar stock"
  },

  // ═══════════════════════════════════════════════════════════════════
  // COMPOSICIÓN: A qué sistema mayor pertenece
  // ═══════════════════════════════════════════════════════════════════
  composition: {
    // Sistema/Producto al que contribuye (puede ser null inicialmente)
    system_id: "sys-gestion-hosteleria",

    // Rol dentro del sistema
    role: "order-entry",  // facturacion, compras, order-entry, kitchen

    // Desde cuándo forma parte
    joined_at: "2026-05-20T10:00:00Z"
  },

  // ═══════════════════════════════════════════════════════════════════
  // DEPENDENCIAS: Qué necesita de otros proyectos
  // ═══════════════════════════════════════════════════════════════════
  dependencies: [
    {
      project_id: "proj-facturacion",
      type: "data",           // data | code | api | conversation
      description: "Usa el módulo de emisión de facturas"
    },
    {
      project_id: "proj-compras",
      type: "data",
      description: "Lee y actualiza el stock"
    }
  ],

  // ═══════════════════════════════════════════════════════════════════
  // HISTORIAS COMPARTIDAS
  // ═══════════════════════════════════════════════════════════════════
  shared_conversations: {
    // Conversaciones de otros proyectos relevantes para este
    imported: [
      {
        from_project: "proj-facturacion",
        conversation_ids: ["conv-123", "conv-456"],
        imported_at: "2026-05-20T10:00:00Z",
        reason: "Contexto de cómo funcionan las facturas"
      }
    ],

    // Conversaciones de este proyecto exportadas a otros
    exported_to: ["proj-cocina"]
  }
}
```

---

## Ciclo de Vida: De Proyecto Aislado a Sistema

### Fase 1: Proyecto Aislado

```
┌─────────────────────────────────────────────────────────────────┐
│  PROYECTO: Facturación v1                                        │
│  Estado: AISLADO                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  {                                                               │
│    id: "proj-facturacion",                                       │
│    name: "Sistema Facturación",                                  │
│    lineage: { inspired_by: [] },        // Nació solo            │
│    composition: { system_id: null },    // No pertenece a nada   │
│    dependencies: []                     // No depende de nadie   │
│  }                                                               │
│                                                                  │
│  Conversaciones:                                                 │
│  - "Crear módulo de facturas"                                    │
│  - "Implementar PDF de factura"                                  │
│  - "Gestión de clientes básica"                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Fase 2: Nuevo Proyecto Relacionado

```
┌─────────────────────────────────────────────────────────────────┐
│  PROYECTO: Compras v1                                            │
│  Estado: RELACIONADO                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  {                                                               │
│    id: "proj-compras",                                           │
│    name: "Sistema Compras",                                      │
│    lineage: {                                                    │
│      inspired_by: ["proj-facturacion"],  // ← Relación           │
│      link_reason: "Comparte modelo de clientes/proveedores"      │
│    },                                                            │
│    composition: { system_id: null },                             │
│    dependencies: [                                               │
│      { project_id: "proj-facturacion", type: "data" }           │
│    ]                                                             │
│  }                                                               │
│                                                                  │
│  [proj-facturacion] ←───── relacionados ─────→ [proj-compras]   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Fase 3: Emerge un Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│  SISTEMA: Gestión Hostelería                                     │
│  Estado: EMERGENTE                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  // Se crea el "Sistema" como contenedor lógico                  │
│  {                                                               │
│    id: "sys-gestion-hosteleria",                                 │
│    type: "system",                      // No es proyecto        │
│    name: "Sistema Gestión Hostelería",                           │
│    description: "Emergió de facturación + compras",              │
│    created_from: ["proj-facturacion", "proj-compras"],           │
│    created_at: "2026-05-01T10:00:00Z"                            │
│  }                                                               │
│                                                                  │
│  // Los proyectos actualizan su composición                      │
│  proj-facturacion.composition.system_id = "sys-gestion-host..."  │
│  proj-compras.composition.system_id = "sys-gestion-host..."      │
│                                                                  │
│         ┌──────────────────────────────────┐                     │
│         │  Sistema Gestión Hostelería      │                     │
│         │  ┌────────────┐ ┌────────────┐   │                     │
│         │  │Facturación │ │  Compras   │   │                     │
│         │  │  (role:    │ │  (role:    │   │                     │
│         │  │  billing)  │ │ purchasing)│   │                     │
│         │  └────────────┘ └────────────┘   │                     │
│         └──────────────────────────────────┘                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Fase 4: Sistema Crece

```
┌─────────────────────────────────────────────────────────────────┐
│  SISTEMA: Gestión Hostelería (Expandido)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│         ┌────────────────────────────────────────────────────┐   │
│         │         Sistema Gestión Hostelería                  │   │
│         │                                                     │   │
│         │  ┌────────────┐ ┌────────────┐ ┌────────────┐      │   │
│         │  │Facturación │ │  Compras   │ │ Comandero  │      │   │
│         │  │  (billing) │ │(purchasing)│ │(order-entry│      │   │
│         │  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘      │   │
│         │        │              │              │              │   │
│         │        └──────────────┼──────────────┘              │   │
│         │                       │                             │   │
│         │              ┌────────▼────────┐                    │   │
│         │              │     Cocina      │                    │   │
│         │              │   (kitchen)     │                    │   │
│         │              └─────────────────┘                    │   │
│         │                                                     │   │
│         │  COLUMNA VERTEBRAL:                                 │   │
│         │  Comandero → genera ticket → Cocina                 │   │
│         │  Cocina → completa pedido → Facturación            │   │
│         │  Facturación → registra venta → Compras (stock)    │   │
│         │                                                     │   │
│         └────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Gestión de Historias/Conversaciones

### El Problema

```
Cuando trabajo en "Comandero", necesito contexto de:
- Cómo funcionan las facturas (de proj-facturacion)
- Cómo funciona el stock (de proj-compras)

¿Cómo traigo ese contexto sin duplicar todo?
```

### Solución: Referencias a Conversaciones

```javascript
// Cuando creo una conversación en Comandero que necesita contexto
{
  conversation_id: "conv-comandero-001",
  project_id: "proj-comandero",

  // Referencias a conversaciones de otros proyectos
  context_refs: [
    {
      project_id: "proj-facturacion",
      conversation_id: "conv-fact-034",
      summary: "Implementación del módulo de facturas",
      relevance: "Para entender cómo generar factura desde pedido"
    },
    {
      project_id: "proj-compras",
      conversation_id: "conv-comp-012",
      summary: "Sistema de control de stock",
      relevance: "Para descontar ingredientes al completar pedido"
    }
  ],

  // El AI puede acceder a estas conversaciones como contexto
  messages: [...]
}
```

### Flujo en la Práctica

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO: Trabajar con Contexto Heredado                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Usuario: "Implementa que al completar pedido se genere factura"            │
│                                                                              │
│  SISTEMA (automático):                                                       │
│  ─────────────────────                                                      │
│  1. Detecta: proyecto actual = "Comandero"                                   │
│  2. Ve dependencias: [Facturación, Compras]                                  │
│  3. Busca conversaciones relevantes:                                         │
│     - En Facturación: "conv donde se implementó emisión de facturas"        │
│     - En Compras: "conv donde se implementó descuento de stock"             │
│  4. Inyecta como contexto al prompt:                                         │
│                                                                              │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │ CONTEXTO HEREDADO (de proyectos relacionados):                   │     │
│     │                                                                  │     │
│     │ [Facturación/conv-034]:                                          │     │
│     │ "Para emitir factura, usar evento 'invoice.create' con..."      │     │
│     │                                                                  │     │
│     │ [Compras/conv-012]:                                              │     │
│     │ "Para descontar stock, usar evento 'stock.decrease' con..."     │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  5. AI responde con conocimiento de TODOS los proyectos relacionados        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Operaciones del Sistema

### 1. Crear Proyecto (sin relaciones)

```javascript
// Igual que ahora - proyecto aislado
await projectManager.create({
  name: "Mi Nuevo Proyecto"
});
// → Nace sin lineage, sin composition, sin dependencies
```

### 2. Relacionar Proyectos

```javascript
// Descubro que dos proyectos están relacionados
await projectManager.linkProjects({
  source: "proj-compras",
  target: "proj-facturacion",
  type: "inspired_by",
  reason: "Compras reutiliza el modelo de clientes de Facturación"
});
```

### 3. Crear Sistema desde Proyectos

```javascript
// Varios proyectos han convergido, creo el "sistema"
await systemManager.createFromProjects({
  name: "Sistema Gestión Hostelería",
  projects: ["proj-facturacion", "proj-compras", "proj-comandero"],
  roles: {
    "proj-facturacion": "billing",
    "proj-compras": "purchasing",
    "proj-comandero": "order-entry"
  }
});
// → Los proyectos actualizan su composition.system_id
```

### 4. Agregar Proyecto a Sistema Existente

```javascript
// Nuevo proyecto que se une al sistema
await systemManager.addProject({
  system_id: "sys-gestion-hosteleria",
  project_id: "proj-cocina",
  role: "kitchen",
  dependencies: ["proj-comandero"]
});
```

### 5. Importar Contexto de Otro Proyecto

```javascript
// Necesito contexto de facturación para trabajar en comandero
await conversationManager.importContext({
  to_project: "proj-comandero",
  from_project: "proj-facturacion",
  conversation_ids: ["conv-034", "conv-035"],
  reason: "Contexto para implementar generación de facturas"
});
```

---

## Schema de Base de Datos

```sql
-- Tabla de proyectos (extendida)
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  base_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  -- Composición
  system_id TEXT,              -- Sistema al que pertenece (nullable)
  system_role TEXT,            -- Rol dentro del sistema
  system_joined_at TEXT,       -- Cuándo se unió

  FOREIGN KEY (system_id) REFERENCES systems(id)
);

-- Tabla de sistemas (nueva)
CREATE TABLE systems (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  created_from TEXT            -- JSON array de project_ids originales
);

-- Tabla de relaciones entre proyectos (nueva)
CREATE TABLE project_links (
  id TEXT PRIMARY KEY,
  source_project_id TEXT NOT NULL,
  target_project_id TEXT NOT NULL,
  link_type TEXT NOT NULL,     -- inspired_by | depends_on | related_to
  reason TEXT,
  created_at TEXT NOT NULL,

  FOREIGN KEY (source_project_id) REFERENCES projects(id),
  FOREIGN KEY (target_project_id) REFERENCES projects(id)
);

-- Tabla de dependencias (nueva)
CREATE TABLE project_dependencies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  depends_on_project_id TEXT NOT NULL,
  dependency_type TEXT,        -- data | code | api | conversation
  description TEXT,
  created_at TEXT NOT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (depends_on_project_id) REFERENCES projects(id)
);

-- Tabla de contexto compartido (nueva)
CREATE TABLE shared_context (
  id TEXT PRIMARY KEY,
  from_project_id TEXT NOT NULL,
  to_project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  reason TEXT,
  imported_at TEXT NOT NULL,

  FOREIGN KEY (from_project_id) REFERENCES projects(id),
  FOREIGN KEY (to_project_id) REFERENCES projects(id)
);
```

---

## Visualización: Vista de Sistema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  VISTA: Sistema Gestión Hostelería                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    COLUMNA VERTEBRAL                                 │    │
│  │                                                                      │    │
│  │   [Comandero] ──ticket──→ [Cocina] ──completado──→ [Facturación]   │    │
│  │        │                      │                          │          │    │
│  │        │                      │                          │          │    │
│  │        └──────────────────────┴──────────────────────────┘          │    │
│  │                               │                                      │    │
│  │                               ▼                                      │    │
│  │                          [Compras]                                   │    │
│  │                        (actualiza stock)                             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  PROYECTOS:                        RELACIONES:                              │
│  ───────────                       ────────────                             │
│  📁 Facturación (billing)          Comandero → depende de → Facturación    │
│     - 45 conversaciones            Comandero → depende de → Compras        │
│     - Creado: 2026-01-15           Cocina → depende de → Comandero         │
│                                    Facturación → relacionado → Compras      │
│  📁 Compras (purchasing)                                                    │
│     - 32 conversaciones            CONTEXTO COMPARTIDO:                     │
│     - Creado: 2026-03-01           ────────────────────                     │
│                                    Comandero importó 5 conv de Facturación  │
│  📁 Comandero (order-entry)        Cocina importó 3 conv de Comandero       │
│     - 28 conversaciones                                                      │
│     - Creado: 2026-05-10                                                    │
│                                                                              │
│  📁 Cocina (kitchen)                                                        │
│     - 15 conversaciones                                                      │
│     - Creado: 2026-07-20                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Resumen

| Concepto | Descripción |
|----------|-------------|
| **Proyecto** | Unidad atómica. Siempre existe independiente. |
| **Linaje** | De dónde viene, qué lo inspiró. |
| **Dependencia** | Qué necesita de otros proyectos. |
| **Sistema** | Contenedor lógico que emerge de proyectos relacionados. |
| **Contexto Compartido** | Conversaciones de un proyecto accesibles desde otro. |
| **Columna Vertebral** | Flujo principal que conecta los proyectos del sistema. |

**Principio Fundamental**:
> Los proyectos nacen solos y crecen juntos. Las relaciones se descubren, no se planifican.

---

## API Implementada

### Relaciones entre Proyectos (Fase 1)

```javascript
// Crear link
await mqttRequest('project', 'link', {
  source_project_id: 'proj-compras',
  target_project_id: 'proj-facturacion',
  link_type: 'inspired_by',  // inspired_by | related_to | evolved_from
  reason: 'Comparte modelo de clientes'
});

// Eliminar link
await mqttRequest('project', 'unlink', {
  source_project_id: 'proj-compras',
  target_project_id: 'proj-facturacion'
});

// Obtener links de un proyecto
await mqttRequest('project', 'getLinks', { project_id: 'proj-compras' });
```

### Dependencias (Fase 2)

```javascript
// Añadir dependencia
await mqttRequest('project', 'addDependency', {
  project_id: 'proj-comandero',
  depends_on_project_id: 'proj-facturacion',
  dependency_type: 'data',  // data | code | api | context
  description: 'Usa módulo de emisión de facturas'
});

// Eliminar dependencia
await mqttRequest('project', 'removeDependency', {
  project_id: 'proj-comandero',
  depends_on_project_id: 'proj-facturacion'
});

// Obtener dependencias
await mqttRequest('project', 'getDependencies', { project_id: 'proj-comandero' });
await mqttRequest('project', 'getDependents', { project_id: 'proj-facturacion' });
```

### Sistemas (Fase 3)

```javascript
// Crear sistema
await mqttRequest('system', 'create', {
  name: 'Sistema Gestión Hostelería',
  description: 'Sistema completo de gestión de local'
});

// Listar sistemas
await mqttRequest('system', 'list', {});

// Añadir proyecto a sistema
await mqttRequest('system', 'addProject', {
  system_id: 'sys-123',
  project_id: 'proj-facturacion',
  role: 'billing'
});

// Quitar proyecto de sistema
await mqttRequest('system', 'removeProject', { project_id: 'proj-facturacion' });

// Proyectos sin asignar
await mqttRequest('system', 'getUnassigned', {});
```

### Contexto Compartido (Fase 4)

```javascript
// Importar conversación de otro proyecto
await mqttRequest('context', 'import', {
  to_project_id: 'proj-comandero',
  from_project_id: 'proj-facturacion',
  conversation_id: 'conv-123',
  reason: 'Contexto de cómo funcionan las facturas'
});

// Eliminar contexto compartido
await mqttRequest('context', 'remove', { shared_context_id: 'sc-123' });

// Ver contexto importado a un proyecto
await mqttRequest('context', 'getShared', { to_project_id: 'proj-comandero' });

// Ver fuentes de contexto disponibles
await mqttRequest('context', 'getAvailableSources', { project_id: 'proj-comandero' });

// Obtener contexto completo del proyecto
await mqttRequest('context', 'getFullProjectContext', { project_id: 'proj-comandero' });
```

### Contexto Heredado en Prompts (Fase 5)

```javascript
// Solicitar composición de prompt CON contexto heredado
await eventBus.publish('prompt.compose.request', {
  request_id: crypto.randomUUID(),
  project_id: 'proj-comandero',
  include_inherited_context: true,  // ← Activa contexto heredado
  conversation: [...],
  tools: [...]
});

// El prompt resultante incluirá secciones adicionales:
// ## System Context
// ## Dependencies
// ## Related Projects
// ## Inherited Knowledge
```

---

## Módulos Modificados

| Módulo | Cambios |
|--------|---------|
| **project-manager** | +40 métodos, +6 tablas, +15 eventos |
| **prompt-composer** | +3 métodos, soporte contexto heredado |

Ver [PLAN_COMPOSICION_PROYECTOS.md](./PLAN_COMPOSICION_PROYECTOS.md) para lista completa de UI handlers y eventos.
