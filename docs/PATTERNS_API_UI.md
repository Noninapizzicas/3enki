# Patrones API → UI

**Objetivo:** Identificar patrones en endpoints para automatizar generación de UI.

**Método:** Analizar múltiples módulos, comparar, validar patrones comunes.

---

## Módulos Analizados

| Módulo | Fecha | Estado |
|--------|-------|--------|
| ai-gateway | 2025-12-07 | ✅ Analizado |
| credential-manager | 2025-12-08 | ✅ Analizado |

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

---

### Patrón 8: GET Lista Agrupada

```
GET /recurso → { items: [], grouped_by: "campo" }
```

**UI:** `GroupedList` con secciones colapsables

**Ejemplos:**
- `credential-manager: GET /credentials` → Lista agrupada por `level` (GLOBAL, PROJECT, etc.)

---

### Patrón 9: DELETE por ID/Key

```
DELETE /recurso/:id → { success, deleted }
```

**UI:** `Button` de eliminar con confirmación

**Ejemplos:**
- `credential-manager: DELETE /credentials/:key` → Eliminar credencial específica

---

### Patrón 10: PUT Actualización

```
PUT /recurso/:id { campo } → { success, updated }
```

**UI:** `EditForm` o `InlineEdit`

**Ejemplos:**
- `credential-manager: PUT /credentials/:key { api_key }` → Actualizar API key

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
| 9 | `DELETE` | `/:id` | `{ success }` | Button eliminar |
| 10 | `PUT` | `/:id { campo }` | `{ success }` | EditForm / InlineEdit |

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
- [ ] prompt-manager
- [ ] conversation-manager
- [ ] plugin-manager
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
