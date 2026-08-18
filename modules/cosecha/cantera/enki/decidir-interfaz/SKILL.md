---
name: decidir-interfaz
description: "FASE 6 del proceso de proyecto: decide si cada módulo necesita interfaz y de qué tipo (workspace_module · chat_tool · inline_render · system_panel · ninguna). Aplica señales deterministas del module.json (tools, eventos, rol del módulo) para clasificar — el LLM razona el contexto, el script decide la forma. También sirve para AUDITAR módulos existentes y replantear interfaces malas (drift_ui_handler_sin_type_canonico)."
when-to-use: "Entra encadenada por proceso-negocio tras negocio.skills (FASE 6 por pieza) o a mano para auditar/replantear la interfaz de un módulo o proyecto. Ante un módulo nuevo construido (F4) con su skill (F5): decidir su superficie. Ante una interfaz que no encaja (SIN_TIPO, tipo discordante, módulo con tools sin ui_handlers): aplicarla para diagnosticar y corregir."
fuente: enki
dominio: ui
lente_dominio: frontend
lente_tarea: decidir-interfaz
tags: [fase6, interfaz, ui, superficie, workspace_module, system_panel, chat_tool, inline_render, patrón, auditar]
---

# Decidir Interfaz — FASE 6 del proceso de proyecto

> El eslabón que faltaba: F0 identidad → F1/2 esquematizar → F3 planificar →
> F4 construir → F5 skills → **F6 decidir interfaz**. El patrón que responde
> "¿este módulo necesita interfaz? ¿cuál de los 4 tipos canónicos le toca?".
>
> Código: fase 6 de proceso · habilita `negocio.interfaz` (o `negocio.replanteada`
> en modo auditoría).

---

## 1 · El problema que resuelve

El contrato `frontend.contract.json` define 4 tipos canónicos de superficie:
`workspace_module` · `chat_tool` · `inline_render` · `system_panel`. El validador
`frontend.validate.js` los exige. Pero **no existía ningún criterio** que decida:

- cuándo un módulo DEBE tener interfaz
- cuál de los 4 tipos le corresponde
- cuándo NO debe tenerla (y no hay que forzarle una)

Resultado (medido en el repo): 177 ui_handlers sin tipo canónico, 2 de los 4
tipos sin uso real, 10 módulos con tools que deberían tener interfaz y no la
tienen. La FASE 6 llena ese hueco con un patrón determinista.

## 2 · El patrón de decisión

**Regla general: la interfaz de un módulo es la superficie que el HUMANO necesita
para operar lo que el módulo ofrece.** Se decide por el ROL del módulo, no por su
tamaño ni por su nombre.

> **El coste de decir SÍ ya es barato (2026-08, generador schema→UI):** el
> generador (BlueprintForm — 4 zonas: formulario/acciones/estados vivos/datos,
> build verde, PR #266) renderiza CUALQUIER módulo desde su blueprint con la
> sección `ui.*` declarada. Decidir que un módulo necesita interfaz ya NO
> compromete a un panel artesanal: compromete a declarar `ui.*` en el blueprint
> (F6½) y al envoltorio mínimo (F7). La decisión se toma por ROL, no por miedo
> al coste de construir.

### 2a · ¿NECESITA interfaz? (5 señales, en orden)

| Señal | Respuesta |
|---|---|
| 1. ¿Solo escucha y re-emite (puente interno, reflejo pasivo, sin tools)? | **NO** — no tiene cara humana |
| 2. ¿Sin tools ni ui_handlers (reflejo puro de soporte)? | **NO** — lo operan otros módulos |
| 3. ¿Expone acciones de lectura (list/get/search/status/estado/dashboard)? | **SÍ** — el humano consulta |
| 4. ¿Expone acciones de escritura (create/update/delete/set/save/start/build)? | **SÍ** — el humano opera |
| 5. ¿Solo eventos, sin tools (observador que alimenta a otros)? | **NO** — su salida es el bus, no la pantalla |

Un módulo con tools de lectura o escritura → **necesita interfaz**. Un puente que
solo escucha y re-emite → **no la necesita**. Un observador que solo publica
eventos (health, alertas) → **no la necesita** (su salida es el bus).

### 2b · ¿QUÉ tipo? (el rol decide)

| Rol del módulo | Tipo canónico | Zone | Ejemplos reales |
|---|---|---|---|
| Dominio del negocio, área de trabajo con CRUD/flujo (el humano opera a diario) | `workspace_module` | `barra_modulos` | pedidos, productos, cocina, cobros, facturas |
| Gestión/sistema bajo demanda (admin, infra, flota, credenciales) | `system_panel` | `lateral_derecha` | admin-panel, device-health, firmware-manager, filesystem |
| Operación puntual disparada desde el chat (generar, verificar, traducir, pagar) | `chat_tool` | `barra_chat_inferior` | media-generator, motor-trazo, verificador-visual, pago-gateway |
| Contenido que se renderiza DENTRO del flujo del chat (preview, tarjeta, resultado) | `inline_render` | `area_chat` | carta-digital preview, html-preview, resultado de agente |

### 2c · La prueba de fuego del tipo

```
¿El humano entra a trabajar en él a diario?   → workspace_module
¿El humano lo consulta cuando algo falla?     → system_panel
¿El humano lo dispara como acción puntual?    → chat_tool
¿El humano lo ve aparecer en la conversación? → inline_render
¿Ninguna de las anteriores?                   → sin interfaz (o revisa el rol)
```

## 3 · EL MANDATO — mecánico, no opinión

1. **Lee** el `module.json` del módulo (o el `esquema.md` si viene del proceso).
2. **Corre el script** `scripts/decidir-interfaz.js --module <slug>` (o `--all`)
   → devuelve la decisión por señales, sin LLM.
3. **Razona el contexto** que el script no ve: el rol del módulo en el proyecto
   (¿es dominio? ¿infra? ¿puente?), la fase del proceso, y si la decisión del
   script contradice el rol → **el rol gana, documenta el porqué**.
4. **Escribe** el resultado en `ui_handlers` del module.json: cada handler con
   `type` canónico + `zone` canónica (si el módulo necesita interfaz), o deja el
   módulo sin `ui_handlers` (si no la necesita, no se le inventa).
5. **Verifica** con `node arquitectura/decisiones/_validators/frontend.validate.js --check-system`
   → el módulo auditado sin drift.
6. Cierra la fase: `proceso-negocio.completar_fase { fase: 'interfaz', resumen: { modulos: ["<slug>"], tipos: {...} } }`
   (en modo auditoría de un módulo existente: documentar la decisión en el changelog del módulo).

**NO pares a mitad**: un módulo sin decisión de interfaz es una superficie sin
forma. **NO inventes tipos**: la lista es cerrada (4). **NO fuerces interfaz a
un puente interno**: su cara es el bus, no la pantalla.

## 4 · Casos testigo

**Corte workspace_module — pedidos vs productos**: dos módulos del mismo tipo
con forma interna distinta validaron el patrón: ver
`references/caso-pedidos-productos.md` — el prisma de 5 huecos aplicado a la
interfaz de cada uno, y por qué ambos caen en `workspace_module` a pesar de que
uno es fuente de verdad (pedidos) y el otro proyector sin estado (productos).

**Corte system_panel — filesystem vs device-health**: ver
`references/caso-filesystem-device-health.md` — custodio grande (15 handlers
SIN_TIPO) vs observador pequeño (3 handlers SIN_TIPO); ambos `system_panel` por
rol, y la FASE 6 liquida su drift en la misma pasada.

**Foto global**: `references/informe-global.md` — el patrón aplicado a los 145
módulos (40 necesitan interfaz, 105 no, 29 con drift), con los 4 cortes y la
lista de módulos por tipo.

**Hallazgo fino del caso**: `productos` no tiene tool `create` → su interfaz
gestiona lo que otra vía crea. Ese hueco de contrato es una PREGUNTA ABIERTA
para el dueño, no algo que la skill decide.

## 5 · Verificación

- El script `decidir-interfaz.js` corre sin error sobre el módulo auditado.
- Cada ui_handler del módulo tiene `type` ∈ {workspace_module, chat_tool, inline_render, system_panel} y `zone` ∈ zonas canónicas.
- `frontend.validate.js --check-system` no reporta drift para el módulo.
- Los módulos puente/observador NO tienen ui_handlers forzados.
- Señal de fase enviada: `proceso-negocio.completar_fase { fase: 'interfaz' }` → 200 (no 409).

## 6 · Errores a evitar

- **Decidir por opinión** ("este módulo es importante → interfaz") — el script decide por señales; el LLM solo añade contexto de rol.
- **Inventar un tipo nuevo** — lista cerrada de 4; si ninguno encaja, el problema es el rol del módulo, no falta un 5º tipo.
- **Forzar interfaz a un puente interno** — su cara es el bus; una superficie inventada es deuda.
- **Dejar el SIN_TIPO** — el drift existe y esta fase lo liquida.
- **Confundir el tipo con la acción** — workspace_module NO es "un CRUD"; es "el humano trabaja aquí a diario". Un CRUD de sistema (filesystem) es system_panel.
