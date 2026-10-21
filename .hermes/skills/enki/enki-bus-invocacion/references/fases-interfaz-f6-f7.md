# Fases de interfaz F6 → F6½ → F7 (proceso de proyecto Enki, 2026-08)

Cómo quedó el proceso tras la sesión de construir las fases de interfaz, sus
pipeline del motor v3, el patrón de rutas y la verificación del deploy.

## El flujo del proceso (mapa de `proceso-negocio`)

```
F0 identidad → F2 esquematizar → F3 planificar → F4 construir → F5 skills
→ F6  decidir-interfaz      type+zone en module.json (workspace_module · system_panel · chat_tool · inline_render · ui_decision.necesita=false)
→ F6½ esquematizar-interfaz prisma de 5 huecos sobre "la interfaz del módulo X de tipo Y" → SPEC en UN archivo
→ F7  construir-interfaz    consume la SPEC + estándares → trío en frontend/
→ FIN
```

Lección grave (error corregido en vivo): **NUNCA construir una interfaz sin
pasar el esquematizador antes**. La F7 sin la F6½ improvisa el panel — exactamente
lo que el esquematizador prohíbe. El esquematizador se aplica al sujeto correcto:
"la interfaz del módulo X de tipo Y" (no al módulo entero).

## Rutas (dos patrones distintos — no confundir)

1. **Rutas de ARCHIVO (entregables del pipeline)**: UN entregable = UN path.
   - F2 `storage/esquemas/esquema.md` · F3 `storage/esquemas/plan-construccion.md`
   - F4 `<slug>/index.js` · F5 `cosecha/cantera/enki/<slug>/SKILL.md`
   - F6 `<slug>/module.json` · F6½ `storage/esquemas/interfaz-<slug>.md`
   - F7 = única EXCEPCIÓN multi-archivo (`dir` + `archivos[]`): el trío del
     frontend ES 3-4 archivos físicos que el loader necesita.
   - Módulos anidados (pizzepos/): el entregable `<slug>/...` debe resolver al
     dir REAL del módulo (`modules/pizzepos/pedidos/module.json`), no crear un
     duplicado en `modules/<slug>/` (fix en `_resolverEntregable`).
   - El gate del orquestador con `dir` que lleva `<slug>` (ej. F6½) debe
     sustituir el slug REAL del resumen (`extra.slug` / `extra.modulos[0]`) antes
     de listar — el `<slug>` literal no existe en disco.

2. **Rutas WEB (URLs del frame)**: el campo `manifest.json.routes` usa SOLO
   deep-links reales de `frontend/src/routes/` (scopeados `/[project_id]/<pagina>`
   o planos `/chat`, `/facturas`) o páginas del `PAGE_CATALOG`
   (`frontend/src/lib/ui-core/project-pages.ts`). NUNCA URL inventada. El frame
   es pantalla única: no hay router SPA, las URLs son deep-links a estado.

## Cómo se construye la F7 (estándares obligatorios)

- Store → skill `ui-store-mqtt` (1 writable + derivados + acciones que reflejan
  vía mqttRequest + suscripciones + reset).
- Trío (manifest.json + index.ts + `<Slug>Panel.svelte`) → patrón vivo
  `frontend/src/lib/modules/contenido/` (el loader autodescubre por
  `import.meta.glob('./*/manifest.json')`).
- Zonas → `frontend.contract`: workspace_module→work-bar, system_panel→system-bar,
  chat_tool→chat-tools, inline_render→area_chat.
- Naming del Panel: `<Slug>Panel.svelte` con `<Slug>` = primera letra del slug en
  mayúscula + el resto IGUAL (`device-health` → `Device-healthPanel.svelte`).

## El bug del deploy: lista de pipelines clavada (#159)

`_registrarTools` del v3 tenía hardcodeados 4 pipelines; los nuevos NO eran
invocables desde el chat aunque el registro los tuviera. Fix: lista dinámica vía
`pipeline.listar.request` con fallback + reintento en background (8 s) por si el
registro carga después que el motor. Verificar en prod con
`grep pipelines .../ai-agent-framework-v3/index.js` (si hay lista literal, es viejo).

## Verificación del deploy (2026-08-07, todo confirmado en vivo)

- `systemctl is-active enki enki-frontend` → active.
- Pipelines: `ls /opt/enki/modules/agentes/registro/store/` → 7 (los 3 nuevos).
- Skills en prod: `ls /opt/enki/modules/cosecha/cantera/enki/` → 3 nuevas.
- `diff` de archivos clave repo↔prod (proceso-negocio idéntico).
- Script determinista de F6 en prod: `node scripts/decidir-interfaz.js --module <slug>`
  (funciona con anidados: pedidos/cocina).
- Motor vivo: `grep 'invoke_agent.response\|agent.execute.progress' /opt/enki/data/logs/current.jsonl`
  → progreso + response sellado = pipeline real ejecutado.
- Bitácoras: `data/projects/<UUID>/storage/agentes/bitacoras/<request_id>.json`
  (el UUID del proyecto, no su nombre).
- El evento `agent.execute.request` publicado por MQTT externo puede no obtener
  respuesta interactiva (ver SKILL: clients anónimos publican pero no reciben);
  la evidencia fiable es el log del core + bitácoras.
