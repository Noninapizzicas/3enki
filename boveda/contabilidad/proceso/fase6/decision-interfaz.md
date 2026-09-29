# F6 · Decisión de interfaz — vertical CONTABILIDAD

> **Fase 6** (decidir-interfaz). Decide la superficie humana de cada módulo.
> **Lista cerrada de 4 tipos:** `workspace_module` · `system_panel` · `chat_tool` · `inline_render` (o **sin interfaz**).

## ⚠️ Hallazgo previo: el script canónico da FALSO NEGATIVO en esta vertical

`modules/cosecha/cantera/enki/decidir-interfaz/scripts/decidir-interfaz.js` decide por **`tools`** del `module.json`. Esta vertical es **event-driven pura**:

```
módulos: 116 · con tools: 0 · con RPC humano (.*.request): 116
```

Resultado del canónico: `{necesita_interfaz:false, rol:'puente-interno'}` **para los 116** — falso negativo en bloque.

**La señal correcta aquí son los RPCs**: la superficie humana de un módulo-isla event-driven es su `*.request`.

## La decisión (determinista, sin LLM)

Scripts propios (el canónico no sirve):
- `scripts/decidir-interfaz-contabilidad.js` — clasifica (decisión EXPLÍCITA por módulo, auditable)
- `scripts/declarar-ui-contabilidad.js` — escribe `ui_handlers` (type + zone) derivados de los RPCs reales

La **prueba de fuego** del tipo (de `decidir-interfaz` §2c):
```
¿entra a trabajar a diario?        → workspace_module   (barra_modulos)
¿lo consulta cuando algo falla?    → system_panel       (lateral_derecha)
¿lo dispara como acción puntual?   → chat_tool          (barra_chat_inferior)
¿lo ve aparecer en la conversación?→ inline_render      (area_chat)
¿ninguna?                          → sin interfaz (su cara es el bus)
```

## Reparto de los 116

| Tipo | N | Zone | Qué es |
|---|---|---|---|
| **`workspace_module`** | **63** | `barra_modulos` | **la MESA DE TRABAJO**: el libro, el fiscal, la nómina, los estados, la entrada |
| **`system_panel`** | **27** | `lateral_derecha` | **CONTROL**: proceso, cobertura, configuración, cerrojos, derivaciones de consulta |
| **`inline_render`** | **13** | `area_chat` | **APARECE en el chat**: informes, cuadro de mando, márgenes, avisos |
| **`chat_tool`** | **5** | `barra_chat_inferior` | **ACCIÓN PUNTUAL**: consulta del dueño, lenguaje llano, accionable, exportar, plan |
| **sin superficie** | **8** | — | **su cara es el BUS**: puentes y observadores puros |

Los 8 sin interfaz **no es un olvido**: `flujo-firma`, `aviso-revision`, `ratificacion-regla-aprendida`, `hecho-rectificativo`, `lote-admision`, `puerto-evento-vertical`, `puerto-extracto`, `declaracion-fuente-faltante`. **Su superficie es el bus**; forzarles una pantalla sería deuda. Se marcan con `_ui` en el `module.json` para que la decisión sea explícita.

## Verificación

```
frontend.validate.js --check-system:  607 → 607 drift   (CERO introducido; los 607 son ajenos)
scripts/validate-all.js:              0 findings · errors=0 warnings=0 info=0 · PASS
verificar-skill-contabilidad --todos: 116/116 OK
```

Muestra real: `escritor-diario` → 1 ui_handler `workspace_module/barra_modulos` · `flujo-firma` → 0 ui_handlers + `_ui`.
