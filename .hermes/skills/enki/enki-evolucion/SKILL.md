---
name: enki-evolucion
description: >-
  Cómo evolucionar Enki (Event Core) sin duplicar lo que ya existe: el mapa de lo
  que el sistema YA tiene (nervios del ai-gateway, cantera como conductor, reja
  abierta, loader), la ley de desnombrar lógica universal, y las trampas de
  construir piezas nuevas (colisión de métodos JS, "no existe" sin rastrear).
when-to-use: >-
  Cuando el trabajo es de ARQUITECTURA o EVOLUCIÓN del sistema Enki: añadir un
  módulo, un nervio, un blueprint, un page_id, herramientas para el LLM, o hacer
  "que el LLM sepa conducir" un vertical. No para fixes puntuales de un módulo.
tags: [enki, arquitectura, evolucion, cantera, ai-gateway, desnombrar]
---

# Enki Evolución — cambiar el sistema sin duplicarlo

## La ley que gobierna todo (decisión del dueño)

> **"La lógica es universal; los nombres son del dominio que la bautizó."**
> La lógica de un órgano puede existir ya en otra vertical con otro nombre.
> Antes de declarar que algo "no existe" o "falta", rastrea el ecosistema
> completo POR SU LÓGICA (estados, flujos, contratos), no por su nombre.

Casos reales:
- `variaciones` (pizza: poner/quitar ingredientes) = la misma selección con
  deltas que `opciones` prisma (color/talla/tamaño). Ya desnombrado.
- "PREPARAR no existe en prisma" = FALSO: cocina/pedidos de pizzepos tienen la
  máquina de estados (pendiente→preparando→listo→entregado) con nombre de
  hostelería. La decisión correcta fue DESNOMBRAR (copiar la lógica a
  `prisma/preparar`, cambiar el nombre, cablear) — no inventar desde cero.

**La decisión correcta casi siempre es desnombrar, no crear.**

## Mapa de lo que Enki YA tiene (no lo reconstruyas)

### El ai-gateway ya inyecta en CADA turno (nervios existentes)
`modules/conversacion/ai-gateway/index.js`:
- **Cantera**: `_leerCantera()` (RPC `cosecha.listar.request`) +
  `_composeCanteraSection()` — inyecta "CANTERA ACTUAL" con el inventario REAL
  de skills + las puertas (cosecha.buscar/obtener/traer/promover, feeder,
  ejecutor). **El LLM ya sabe que la cantera existe y cómo consultarla.**
- **Biblioteca**: `_leerCatalogoBiblioteca()` + `_composeBibliotecaSection()`
- **Propiocepción**: `_leerPropiocepcion()` (eventos del proyecto desde el último turno)
- **Rail**: `_leerRailActivo()` + `_composeRailSection()` (rumbo de estados, universal)
- **Lentes**: menú/grafo si la página declara `lente_default`
- **Sintonía**: `sintonizador.seccion()` (alinea al LLM con el sesgo del humano)
- **Conserje**: empujones (`_leerEmpujon`)

### La REJA ABIERTA (línea ~477 de ai-gateway)
Las páginas poly-funcionales (incl. el chat plano) reciben TODAS las tools del
toolsRegistry, sin scoping por prefijo. El chat nunca dependió del page_id para
sus tools. Solo las páginas blueprint conservan su modelo declarativo.

### El conductor de un vertical YA VIVE en la cantera
Skill por módulo (`prisma-carrito`, `prisma-cobro`, `pizzepos-cocina`…) +
skills de método (`esquematizador`, `prisma-modelo-universal`). 53 skills
prisma/pizzepos verificadas en prod. Para "que el LLM sepa conducir" un
vertical, NO hace falta page_id ni tools nuevas: hace falta que use
`buscar_skill` / `cosecha.buscar` — que ya son universales.

### El loader
`config.json` `modules.enabled` SOLO ORDENA (no filtra) — todo module.json se
carga salvo `disabled`. Filtra por nombre de DIRECTORIO, no manifest.name.
POCs con name duplicado (ai-gateway-poc) se cargan y duplican suscripciones.

### Página frontend ≠ project-type del repo
Que `blueprints/project-types/<tipo>.json` declare `ui.pages` NO crea la página
para proyectos EXISTENTES: el frontend (`resolvePages` en
`frontend/src/lib/ui-core/project-pages.ts`) lee la config PERSISTIDA del
proyecto (`project.config.ui.pages`) o la semilla por tipo, y el PAGE_CATALOG
filtra lo desconocido. Además hace falta la ruta SvelteKit
(`frontend/src/routes/[project_id]/<page>/+page.svelte`). Tres piezas: catálogo
frontend + config del proyecto + ruta.

## Trampas de construir piezas nuevas

### Colisión de método en JS (class)
Si defines un método con el mismo nombre que uno existente del ai-gateway
(p.ej. `_composeCanteraSection`), en JS gana la ÚLTIMA definición de la clase —
los tests llaman al método viejo y fallan de forma confusa. **Antes de añadir
un método, `grep -n "nombreMetodo" modules/conversacion/ai-gateway/index.js`.**

### Verificar antes de construir
Caso real: propuse un "nervio cantera" y ya existía. Buscar por funcionalidad
(grep handlers/eventos/nombres de método/descripciones de module.json) ANTES de
escribir. El ai-gateway ya tiene casi todo lo que "falta".

### El experimento manda
Cuando haya dos hipótesis de diseño (p.ej. blueprint conductor vs cantera como
conductor), no construyas la solución completa: cablea lo mínimo (enabled +
página/config) y prueba en vivo con un proyecto real. El resultado decide.

### Trabajo de OTRO agente (Claude Code): verificar las CAPAS del runtime, no solo el diff
Cuando el código lo aporta otro agente (rama `claude/*`), el diff puede ser
correcto y el sistema quedar CAPADO en silencio por capas de configuración que
parecen razonables por separado. El patrón real (fusión Hermes↔Enki 2026-08-11):
1. **Filtros de tools**: `mcp_servers.enki.tools.include` con 3 tools cuando el
   portal expone 448 — el agente no ve las tools de dominio y degenera a
   terminal crudo. Auditar `GET /v1/toolsets` y el bloque include.
2. **Permisos del dir de datos**: módulos creados por www-data salen 755 sin
   `g+w` — un segundo actor (grupo www-data) no puede escribir. Fix:
   `sudo chmod -R g+w /opt/enki/modules/` (mismo patrón que `~/3enki`).
3. **Skills del perfil**: el perfil del agente nuevo sin las skills del dominio
   (solo genéricas) → el agente "se pierde" (busca módulos apagados, usa SO
   crudo). Fix: copiar las skills al perfil.
4. **Orden de despliegue**: el disable del sistema viejo en el MISMO PR que el
   código nuevo = prod en modo "primer mensaje = fallo" si la config nueva no
   está lista. El disable va SIEMPRE en un paso posterior, tras prueba real.

Síntoma de capado: el agente usa `terminal`/`write_file` crudo sobre /opt/enki
en vez de las tools de Enki, con `Permission denied` y búsquedas de módulos
apagados. Regla: al integrar trabajo de otro agente, auditar la CONFIG del
runtime (filtros de tools, permisos, skills, orden de activación) además del
diff — cada capa por separado parece config; juntas impiden trabajar.

## Workflow para cambios de arquitectura
1. Cargar la rebanada del subsistema (arquitectura/cabecera/**) — fuente de verdad
2. Mapear lo existente: grep de nervios/handlers/eventos con el mismo propósito
3. Rama `hermes/<feature>`, nunca main
4. Cambio mínimo + tests + doc-sync --ensamblar/--check
5. PR por GitHub MCP + merge squash
6. Si añade systemd/docker/env → editar vps-setup.sh en el MISMO PR
