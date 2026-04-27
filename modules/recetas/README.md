# modules/recetas

Gestión de recetas y catálogo de ingredientes por proyecto.
**Almacenamiento: un único archivo JSON por proyecto** — sin SQL, sin schemas, sin migraciones.

```
data/projects/{slug}/recetas.json
```

## Estructura del archivo

```json
{
  "_version": "1.0",
  "_updated_at": "2026-04-26T18:30:00Z",
  "recetas": [
    {
      "id": "uuid",
      "nombre": "Alioli",
      "descripcion": "...",
      "ingredientes": [{"nombre":"ajo","cantidad":50,"unidad":"g"}],
      "instrucciones": ["paso 1", "paso 2"],
      "porciones": 4, "tiempo_min": 10, "dificultad": 2,
      "categorias": ["salsa"], "etiquetas": ["frío"],
      "estado": "activa",
      "fuente": "manual",
      "incompleta": false, "campos_pendientes": [],
      "version": 1, "history": [],
      "created_at": 1777000000000, "updated_at": 1777000000000
    }
  ],
  "ingredientes_catalogo": [
    {"nombre":"aceite oliva","precio_mercado":9,"unidad":"litro","fuente":"manual","updated_at":...}
  ]
}
```

## Tools (13)

| Tool | Qué hace |
|---|---|
| `recetas.crear` | Guarda receta. Solo `nombre`+`project_id` requeridos — el resto opcional. Marca `incompleta` si faltan campos clave. |
| `recetas.listar` | Lista activas (o por estado). Filtro `solo_incompletas` para revisión. |
| `recetas.obtener` | Receta completa por id o nombre. |
| `recetas.buscar` | Filtros combinables: texto, ingrediente, categoría, etiqueta, dificultad, tiempo, porciones. |
| `recetas.actualizar` | Modifica campos. Snapshot anterior va a `history` automáticamente. `version++`. |
| `recetas.historial` | Versiones anteriores (resumen de cada una). |
| `recetas.revertir` | Restaura una versión del history. El estado actual se archiva primero. |
| `recetas.eliminar` | `estado = 'archivada'` (no borra). |
| `recetas.estadisticas` | Conteos: total, por estado, incompletas, ingredientes con/sin precio. |
| `recetas.ingredientes` | Catálogo de ingredientes (separado de las recetas). |
| `recetas.actualizar_precio` | Crea/actualiza ingrediente en catálogo por nombre. |
| `recetas.analizar` | Cruza ingredientes con catálogo, calcula coste real / por porción. |
| `recetas.investigar_receta` | Comprueba si existe; si no, instruye al LLM a proponer una. |

## Flujo de "incompleta"

Una receta es **`incompleta: true`** si le faltan: `ingredientes`, `porciones` o `instrucciones` (configurable en `module.json` → `config.campos_para_completa`).

Cuando el LLM crea una receta con datos parciales (por ejemplo solo nombre + ingredientes), se guarda igualmente y queda con `incompleta=true` y `campos_pendientes=["porciones","instrucciones"]`. **El usuario decide cuándo completarla.**

(Pendiente futuro: agente revisor que detecte incompletas y pregunte al usuario qué hacer.)

## Eventos

**Publica:**
- `receta.creada` — al crear
- `receta.actualizada` — al modificar/revertir
- `receta.eliminada` — al archivar
- `ingrediente.precio.actualizado` — al actualizar precio

**Suscribe:**
- `project.activated` — cachea `slug`
- `fs.read.response` / `fs.write.response` — del módulo filesystem
- `project.get.response` — para resolver slug si no está en cache
- `recetas.<accion>` — los 13 tools del LLM

## Cero dependencias internas

- No usa SQLite, no instancia ningún manager
- Acceso al archivo vía eventos `fs.read.request` / `fs.write.request` al módulo `filesystem`
- Resuelve `project_id → slug` vía `project.get.request` al `project-manager`
- Concurrencia: cola interna por proyecto — escritura serializada
