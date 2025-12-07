# Patrones API → UI

**Objetivo:** Identificar patrones en endpoints para automatizar generación de UI.

**Método:** Analizar múltiples módulos, comparar, validar patrones comunes.

---

## Módulos Analizados

| Módulo | Fecha | Estado |
|--------|-------|--------|
| ai-gateway | 2025-12-07 | ✅ Analizado |

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

---

### Patrón 2: GET Lista con Filtro

```
GET /recurso?filtro=valor → { items: [] }
```

**UI:** `SelectList` + `Dropdown` de filtro

**Ejemplos:**
- `ai-gateway: GET /models?provider=deepseek` → Lista filtrada por provider
- `ai-gateway: GET /usage?provider=deepseek` → Stats filtradas

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

---

## Tabla Resumen

| Método | Params | Response | → Componente UI |
|--------|--------|----------|-----------------|
| `GET` | ninguno | `{ items: [] }` | SelectList / Table |
| `GET` | `?filtro=X` | `{ items: [] }` | SelectList + Dropdown |
| `GET` | ninguno | `{ current, options }` | SelectList con estado |
| `GET` | ninguno | `{ items, totals }` | StatsCard |
| `POST` | `{ id }` | `{ success }` | Button acción |
| `POST` | `{ selection }` | `{ current }` | onClick en lista |
| `POST` | `{ múltiples }` | `{ result }` | ActionForm |

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

- [ ] credential-manager
- [ ] prompt-manager
- [ ] conversation-manager
- [ ] plugin-manager

---

## Notas

- Comparar patrones entre módulos
- Identificar qué patrones son universales
- Identificar qué patrones son específicos de dominio
- Definir metadata en module.json para automatizar UI

---

*Última actualización: 2025-12-07*
