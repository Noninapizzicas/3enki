---
name: context-sync
description: Audita y sincroniza el directorio contexto/ con el código real del sistema event-core. Usa cuando se hayan hecho cambios al código y la documentación pueda estar desactualizada, o cuando quieras verificar que código y contexto están alineados.
allowed-tools: Read, Glob, Grep, Bash, Edit, Write, Task
---

# Context-Sync: Auditoría y Sincronización de contexto/

## Filosofía

```
contexto/ = lo que el sistema DEBE ser (fuente de verdad)
código    = lo que el sistema ES
delta     = lo que hay que corregir
```

**Regla fundamental:** Si el código se desvía de la documentación en `contexto/`, el código es el problema — marcarlo como "a revisar". Si el código está alineado pero la documentación no refleja avances recientes, actualizar la documentación.

## Procedimiento

### Fase 1: Recopilar estado real del código

Ejecuta estas verificaciones en paralelo:

1. **Módulos**: Escanear `modules/**/module.json` — extraer name, version, apis, events.subscribes, events.publishes, ui_handlers, tools
2. **Providers**: Escanear `services/providers/local/*/manifest.json` y `services/providers/local/*/index.js` — extraer name, functions
3. **LLM providers**: Escanear `modules/ai-gateway/providers/*-provider.js` — contar y listar
4. **Handlers**: Escanear `handlers/global/*.js` y `handlers/projects/` — contar activos vs archivados
5. **Config**: Leer `config.json` — modules.enabled, modules.disabled
6. **Frontend**: Escanear `frontend/src/routes/` — rutas actuales, `frontend/src/lib/stores/` — stores
7. **Core components**: Listar `core/*/` — componentes del framework

### Fase 2: Comparar código vs contexto/ (los 28 archivos)

Para CADA archivo de contexto, consultar `reference.md` para saber qué parte del código mapea. Luego comparar bidireccional:

#### Verificaciones por archivo

Consulta el archivo `reference.md` en este mismo directorio de skill para el mapeo detallado de cada archivo de contexto contra su código fuente correspondiente.

**Para cada archivo de contexto:**
1. Leer el archivo de contexto
2. Leer el código correspondiente (según reference.md)
3. Comparar: ¿el código implementa lo que dice el contexto?
4. Clasificar hallazgos

### Fase 3: Clasificar hallazgos

Cada hallazgo se clasifica en una de estas categorías:

| Categoría | Significado | Acción |
|-----------|-------------|--------|
| `SYNC` | Código y contexto alineados | Nada |
| `DOC_DESACTUALIZADO` | Código correcto, docs atrasados | Actualizar contexto/ |
| `CODIGO_A_REVISAR` | Código se desvía del diseño documentado | Marcar para revisión humana |
| `NUEVO_SIN_DOC` | Código nuevo sin documentación | Documentar en contexto/ |
| `DOC_SIN_CODIGO` | Documentado pero no implementado | Verificar si es pendiente legítimo o doc obsoleto |

### Fase 4: Aplicar cambios

1. **`DOC_DESACTUALIZADO`** → Actualizar el archivo de contexto/ correspondiente:
   - Actualizar conteos (módulos, APIs, tools, eventos, providers)
   - Actualizar versiones de módulos
   - Agregar nuevas entradas (módulos, providers, funciones)
   - Marcar items completados en mejoras-pendientes.json
   - Actualizar `_updated` dates

2. **`CODIGO_A_REVISAR`** → NO modificar el código. Agregar un bloque al final del reporte:
   ```
   ## Código a Revisar
   - [archivo:linea] Descripción de la desviación del diseño
   ```

3. **`NUEVO_SIN_DOC`** → Agregar documentación al archivo de contexto correspondiente

4. **`DOC_SIN_CODIGO`** → Marcar en el reporte para decisión humana

### Fase 5: Generar reporte

Al final, generar un resumen con:

```
## Context-Sync Report — {fecha}

### Score: XX/100

### Resumen
- Archivos auditados: 28/28
- En sync: X
- Docs actualizados: X (archivos modificados)
- Código a revisar: X issues
- Nuevo sin documentar: X items
- Docs sin código: X items

### Cambios aplicados a contexto/
- [archivo] Descripción del cambio

### Código a revisar (requiere atención humana)
- [archivo:linea] Qué se desvía y de qué patrón documentado

### Pendientes de decisión
- [item] ¿Es pendiente legítimo o doc obsoleto?
```

## Argumentos

- `/context-sync` — Auditoría completa de los 28 archivos
- `/context-sync modules` — Solo módulos (modules.json, catalogo-servicios.json)
- `/context-sync providers` — Solo providers (services.json, catalogo-servicios.json, providers.json)
- `/context-sync stats` — Solo verificar conteos y estadísticas (SYSTEM-ANALYSIS.md, index.json)
- `/context-sync $ARGUMENTS` — Archivo(s) específico(s) de contexto/

## Reglas importantes

1. **NUNCA inventar datos** — solo documentar lo que existe en el código
2. **NUNCA modificar código** — solo contexto/ y solo cuando el código está correcto
3. **Leer antes de escribir** — siempre leer el archivo actual de contexto antes de editarlo
4. **Preservar formato** — mantener la estructura JSON/MD existente, no reorganizar
5. **Preservar idioma** — si el archivo está en español, escribir en español
6. **Fechas `_updated`** — actualizar en cada archivo modificado
7. **Conteos exactos** — no redondear, usar números verificados
8. **Commit descriptivo** — al final, hacer commit con resumen de cambios
