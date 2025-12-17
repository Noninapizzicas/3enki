# Flujo Completo: Módulo Proyecto

## Resumen de Conexiones

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WorkBar.svelte                                                  │
│       │                                                          │
│       ├── getPanelsByZone('work-bar')                           │
│       │         ↓                                                │
│       │   panels.ts → project: { zone: 'work-bar', icon: '📁' } │
│       │         ↓                                                │
│       └── Renderiza <Button icon="📁" />                        │
│                 │                                                │
│                 │ click                                          │
│                 ↓                                                │
│           openPanel('project')                                   │
│                 │                                                │
│                 ↓                                                │
│           registry.ts → activePanel.set('project')              │
│                 │                                                │
│                 ↓                                                │
│  Shell.svelte detecta $activePanel === 'project'                │
│                 │                                                │
│                 ↓                                                │
│           <LazyPanel panelId="project" />                       │
│                 │                                                │
│                 ↓                                                │
│           loadPanelComponent('project')                         │
│                 │                                                │
│                 ↓                                                │
│           import('$lib/modules/project/ProjectPanel.svelte')    │
│                 │                                                │
│                 ↓                                                │
│           ProjectPanel.svelte se monta                          │
│                 │                                                │
│                 ↓                                                │
│           onMount() → fetchProjects()                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ fetch('/modules/project-manager/projects')
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  HTTP Gateway (core/gateway/http.js)                            │
│       │                                                          │
│       ├── Route: /modules/project-manager/*                     │
│       │                                                          │
│       ↓                                                          │
│  project-manager/index.js                                        │
│       │                                                          │
│       ├── handleListProjects()  ← GET /projects                 │
│       ├── handleCreateProject() ← POST /projects                │
│       ├── handleUpdateProject() ← PUT /projects/:id             │
│       ├── handleDeleteProject() ← DELETE /projects/:id          │
│       └── handleActivateProject() ← POST /projects/:id/activate │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Archivos Involucrados

| Capa | Archivo | Responsabilidad |
|------|---------|-----------------|
| **UI** | `WorkBar.svelte` | Muestra botón 📁 |
| **UI** | `panels.ts` | Define panel `project` en zona `work-bar` |
| **UI** | `registry.ts` | Gestiona `activePanel` store |
| **UI** | `Shell.svelte` | Detecta panel activo, renderiza `LazyPanel` |
| **UI** | `LazyPanel.svelte` | Carga componente bajo demanda |
| **UI** | `ProjectPanel.svelte` | Panel de gestión de proyectos |
| **Store** | `workspace.ts` | `activeProject`, `selectProject()` |
| **Store** | `ui.ts` | `closePanel()` |
| **Store** | `persistence.ts` | `workBarExpanded: true` (default) |
| **Backend** | `project-manager/index.js` | Handlers HTTP |
| **Backend** | `project-manager/module.json` | Define rutas API |

---

## Flujos de Acción

### 1. Listar Proyectos (al abrir panel)

```
ProjectPanel.onMount()
    ↓
fetchProjects()
    ↓
fetch('/modules/project-manager/projects')
    ↓
Backend: handleListProjects()
    ↓
Response: { success: true, projects: [...] }
    ↓
UI: projects = data.projects.map(...)
    ↓
Renderiza lista
```

### 2. Crear Proyecto

```
Usuario llena form + click "Crear proyecto"
    ↓
createProject()
    ↓
fetch('/modules/project-manager/projects', { method: 'POST', body: {...} })
    ↓
Backend: handleCreateProject()
    ↓
Backend: this.createProject(name, description, metadata)
    ↓
Backend: INSERT INTO projects ...
    ↓
Backend: eventBus.publish('project.created', {...})
    ↓
Response: { success: true, project: {...} }
    ↓
UI: fetchProjects() (recarga lista)
```

### 3. Seleccionar/Activar Proyecto

```
Usuario click en proyecto de la lista
    ↓
activateProject(project)
    ↓
fetch('/modules/project-manager/projects/{id}/activate', { method: 'POST' })
    ↓
Backend: handleActivateProject()
    ↓
Backend: UPDATE projects SET is_active = 1 WHERE id = ?
    ↓
Backend: eventBus.publish('project.activated', {...})
    ↓
UI: selectProject({...}) → actualiza store activeProject
    ↓
UI: closePanel() → cierra panel
```

### 4. Editar Proyecto (inline)

```
Usuario click ✏️ en proyecto
    ↓
startEdit(project) → editingId = project.id
    ↓
UI muestra input inline
    ↓
Usuario edita + Enter (o click ✓)
    ↓
updateProject(id)
    ↓
fetch('/modules/project-manager/projects/{id}', { method: 'PUT', body: {...} })
    ↓
Backend: handleUpdateProject()
    ↓
Response: { success: true, project: {...} }
    ↓
UI: editingId = null
    ↓
UI: fetchProjects() (recarga lista)
```

### 5. Eliminar Proyecto

```
Usuario click 🗑️ en proyecto
    ↓
deleteProject(id)
    ↓
Validación: ¿Es proyecto activo? → Error
    ↓
confirm('¿Eliminar?')
    ↓
fetch('/modules/project-manager/projects/{id}', { method: 'DELETE' })
    ↓
Backend: handleDeleteProject()
    ↓
Backend: DELETE FROM projects WHERE id = ?
    ↓
Backend: eventBus.publish('project.deleted', {...})
    ↓
Response: { success: true }
    ↓
UI: fetchProjects() (recarga lista)
```

---

## Estado por Defecto

| Config | Valor | Archivo |
|--------|-------|---------|
| WorkBar expandida | `true` | `persistence.ts:48` |
| Tema | `dark` | `persistence.ts:50` |

---

## Verificación de Conexiones

| Conexión | Estado |
|----------|--------|
| Botón 📁 en WorkBar | ✅ OK |
| panels.ts registra `project` | ✅ OK |
| openPanel() actualiza store | ✅ OK |
| LazyPanel carga componente | ✅ OK |
| ProjectPanel hace fetch correcto | ✅ OK |
| Backend tiene handlers | ✅ OK |
| API routes definidas | ✅ OK |

---

## Para Probar

```bash
# Terminal 1: Backend
npm start

# Terminal 2: Frontend
cd frontend && npm run dev

# Navegador
http://localhost:5173/chat

# Acción
1. Ver WorkBar expandida arriba
2. Click en 📁 Proyecto
3. Panel se abre con lista (o vacía si no hay proyectos)
4. Click + para crear nuevo
5. Click en proyecto para activar
```
