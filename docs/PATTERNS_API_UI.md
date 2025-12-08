# Patrones API → UI

**Objetivo:** Identificar patrones en endpoints para automatizar generación de UI.

**Método:** Analizar múltiples módulos, comparar, validar patrones comunes.

---

## Módulos Analizados

| Módulo | Fecha | Estado | Componente UI |
|--------|-------|--------|---------------|
| ai-gateway | 2025-12-07 | ✅ Analizado | AISelector |
| credential-manager | 2025-12-08 | ✅ Analizado | CredentialSelector |
| prompt-manager | 2025-12-08 | ✅ Analizado | SlotSelector |
| conversation-manager | 2025-12-08 | ✅ Analizado | ConversationList (propuesto) |

---

## Patrones Identificados

### Patrón 1: GET Lista Simple

```
GET /recurso → { items: [] }
```

**UI:** `SelectList` o `Table`

**Ejemplos:**
- `ai-gateway: GET /providers` → Lista de providers
- `ai-gateway: GET /models` → Lista de modelos
- `credential-manager: GET /credentials/levels` → Lista de niveles disponibles

---

### Patrón 2: GET Lista con Filtro

```
GET /recurso?filtro=valor → { items: [] }
```

**UI:** `SelectList` + `Dropdown` de filtro

**Ejemplos:**
- `ai-gateway: GET /models?provider=deepseek` → Lista filtrada por provider
- `ai-gateway: GET /usage?provider=deepseek` → Stats filtradas
- `credential-manager: GET /credentials?level=GLOBAL` → Credenciales filtradas por nivel
- `credential-manager: GET /credentials/resolve?provider=deepseek` → Resolver por cascada
- `prompt-manager: GET /prompts?slot_type=system&tag=ai&search=code` → Prompts filtrados por slot, tag y búsqueda

---

### Patrón 3: GET Estado con Selección

```
GET /recurso → { current: {}, options: [] }
```

**UI:** `SelectList` con estado actual marcado + indicador de selección

**Ejemplos:**
- `ai-gateway: GET /ui/state` → Providers con `current` y `isSelected`

---

### Patrón 4: GET Stats/Métricas

```
GET /recurso → { items: [], totals: {} }
```

**UI:** `StatsCard` o `MetricsPanel`

**Ejemplos:**
- `ai-gateway: GET /usage` → Stats con totales

---

### Patrón 5: POST Acción Simple (1-2 campos)

```
POST /accion { id } → { success }
```

**UI:** `Button` de acción en cada item de lista

**Ejemplos:**
- `ai-gateway: POST /providers/test { provider }` → Botón "Probar" en cada provider

---

### Patrón 6: POST Selección

```
POST /accion { selection } → { current }
```

**UI:** `onClick` en items de `SelectList`

**Ejemplos:**
- `ai-gateway: POST /ui/select { provider, model }` → Click en modelo selecciona

---

### Patrón 7: POST Formulario Complejo

```
POST /accion { campo1, campo2, campo3, ... } → { result }
```

**UI:** `ActionForm` con múltiples campos

**Ejemplos:**
- `ai-gateway: POST /chat { messages, provider, model, temperature, max_tokens }`
- `credential-manager: POST /credentials { provider, level, identifier, api_key }`
- `prompt-manager: POST /prompts { name, title, description, slot_type, content, variables, tags }`

---

### Patrón 8: GET Lista Agrupada

```
GET /recurso → { items: [], grouped_by: "campo" }
```

**UI:** `GroupedList` con secciones colapsables

**Ejemplos:**
- `credential-manager: GET /credentials` → Lista agrupada por `level` (GLOBAL, PROJECT, etc.)
- `prompt-manager: GET /ui/state` → Prompts agrupados por `slot_type` (system, context, prefix, suffix, format)

---

### Patrón 9: DELETE por ID/Key

```
DELETE /recurso/:id → { success, deleted }
```

**UI:** `Button` de eliminar con confirmación

**Ejemplos:**
- `credential-manager: DELETE /credentials/:key` → Eliminar credencial específica
- `prompt-manager: DELETE /prompts/:id` → Eliminar prompt
- `prompt-manager: DELETE /presets/:id` → Eliminar preset

---

### Patrón 10: PUT Actualización

```
PUT /recurso/:id { campo } → { success, updated }
```

**UI:** `EditForm` o `InlineEdit`

**Ejemplos:**
- `credential-manager: PUT /credentials/:key { api_key }` → Actualizar API key
- `prompt-manager: PUT /prompts/:id { title, content, slot_type }` → Actualizar prompt (con versionado automático si cambia content)

---

### Patrón 11: UI-Ready con Múltiples Estructuras

```
GET /ui/state → {
  categorias: [],
  itemsPorCategoria: Record<cat, items[]>,
  relacionados: [],
  stats: {}
}
```

**UI:** Panel completo con filtros + lista agrupada + chips relacionados + stats

**Ejemplos:**
- `prompt-manager: GET /ui/state` → `{ slotTypes[], promptsBySlot: Record<slot, prompts[]>, presets[], stats }`

**Componente:** SlotSelector usa este patrón para:
- Filtros de slot_type (tabs)
- Lista agrupada de prompts
- Chips de presets para selección rápida
- Badge con total_prompts

---

### Patrón 12: CRUD con Relaciones M:N

```
POST /recurso { name, relaciones: Record<categoria, ids[]> } → { success, recurso }
GET /recurso/:id → { recurso, relaciones: Record<categoria, ids[]> }
```

**UI:** Formulario con selección múltiple por categoría

**Ejemplos:**
- `prompt-manager: POST /presets { name, description, slots: { system: [id1], context: [id2, id3] } }`
- `prompt-manager: GET /presets/:id` → Devuelve preset con slots poblados

**Componente:** SlotSelector - modo "presets" muestra checkboxes agrupados por slot_type

---

### Patrón 13: Renderizado/Preview

```
POST /recurso/:id/render { variables } → { rendered, variables_used }
```

**UI:** Preview con inputs para variables dinámicas

**Ejemplos:**
- `prompt-manager: POST /prompts/:id/render { variables: { nombre: "Juan" } }` → `{ rendered: "Hola Juan..." }`

---

### Patrón 14: Versionado Automático

```
PUT /recurso/:id { content } → { success, version }
GET /recurso/:id/versions → { versions: [{ version, content, created_at }] }
```

**UI:** Historial de versiones con diff/rollback

**Ejemplos:**
- `prompt-manager: PUT /prompts/:id` → Auto-bump version si cambia content
- `prompt-manager: GET /prompts/:id/versions` → Lista de versiones del prompt

---

### Patrón 15: Chat con Contexto

```
POST /conversaciones/:id/messages { content } → { user_message, assistant_message, tokens, cost }
GET /conversaciones/:id/context → { project_context, conversation_context }
```

**UI:** `ChatPanel` con historial de mensajes + indicadores de contexto cargado

**Ejemplos:**
- `conversation-manager: POST /conversations/:id/messages { content, user_id }` → Envía mensaje y recibe respuesta AI
- `conversation-manager: GET /conversations/:id/context` → Contexto completo (proyecto + conversación)
- `conversation-manager: GET /conversations/:id/messages?limit=100` → Historial paginado

**Características:**
- Integración con ai-gateway para respuestas
- Contexto de proyecto (nombre, descripción, archivos)
- Context window configurable por conversación
- Attachments via storage-manager

---

### Patrón 16: UI-Ready con Secciones Temporales

```
GET /ui/state?project_id=X → {
  sections: [{ id, label, items[] }],
  items: [],
  stats: {}
}
```

**UI:** Lista agrupada por fecha (Hoy, Ayer, Esta semana, etc.)

**Ejemplos:**
- `conversation-manager: GET /ui/state?project_id=X` → Conversaciones agrupadas por fecha

**Componente:** ConversationList usa este patrón para:
- Secciones temporales (today, yesterday, this_week, this_month, older)
- Stats (total_conversations, total_messages, active_today)
- Items con displayTitle, subtitle, icon, isRecent

---

## Tabla Resumen

| # | Método | Params | Response | → Componente UI |
|---|--------|--------|----------|-----------------|
| 1 | `GET` | ninguno | `{ items: [] }` | SelectList / Table |
| 2 | `GET` | `?filtro=X` | `{ items: [] }` | SelectList + Dropdown |
| 3 | `GET` | ninguno | `{ current, options }` | SelectList con estado |
| 4 | `GET` | ninguno | `{ items, totals }` | StatsCard |
| 5 | `POST` | `{ id }` | `{ success }` | Button acción |
| 6 | `POST` | `{ selection }` | `{ current }` | onClick en lista |
| 7 | `POST` | `{ múltiples }` | `{ result }` | ActionForm |
| 8 | `GET` | ninguno | `{ items[], grouped }` | GroupedList |
| 9 | `DELETE` | `/:id` | `{ success }` | Button eliminar + confirmación |
| 10 | `PUT` | `/:id { campo }` | `{ success }` | EditForm / InlineEdit |
| 11 | `GET` | `/ui/state` | `{ cats[], itemsByCat, related[], stats }` | Panel completo con filtros |
| 12 | `POST` | `{ relaciones: Record<cat,ids[]> }` | `{ success }` | Checkboxes por categoría |
| 13 | `POST` | `/:id/render { vars }` | `{ rendered }` | Preview con variables |
| 14 | `PUT/GET` | `/:id/versions` | `{ versions[] }` | Historial con rollback |
| 15 | `POST/GET` | `/:id/messages` | `{ user_msg, ai_msg }` | ChatPanel |
| 16 | `GET` | `/ui/state?project_id` | `{ sections[], stats }` | Lista temporal agrupada |

---

## Datos UI-Ready vs Datos Crudos

| Aspecto | Endpoint Crudo | Endpoint UI |
|---------|----------------|-------------|
| IDs técnicos | `"deepseek"` | `"deepseek"` (id) + `"DeepSeek"` (displayName) |
| Iconos | ❌ | ✅ `"🔮"` |
| Estado visual | ❌ | ✅ `isSelected`, `status` |
| Agrupación | Lista plana | Agrupado/ordenado |
| Selección actual | ❌ | ✅ `current: {}` |

**Conclusión:** Los endpoints `/ui/*` devuelven datos listos para pintar.

---

## Próximos Módulos a Analizar

- [x] credential-manager ✅
- [x] prompt-manager ✅
- [x] conversation-manager ✅ (DB por proyecto implementado)
- [ ] storage-manager
- [ ] project-manager

---

## Notas

- Comparar patrones entre módulos
- Identificar qué patrones son universales
- Identificar qué patrones son específicos de dominio
- Definir metadata en module.json para automatizar UI

---

*Última actualización: 2025-12-08*
