# F7 · Tracking de construir-interfaz (contabilidad)

> **Fase 7** (construir-interfaz). Materializa el **envoltorio mínimo** del frontend
> (`manifest.json` + `index.ts` + `<Slug>Panel.svelte` + copia del blueprint) que
> ENVUELVE el generador `BlueprintForm`. El generador renderiza desde la sección
> `ui.*` del blueprint (declarada en F6½). El envoltorio es MECÁNICO.
>
> **Entrada** = `<slug>.blueprint.json` (F6½) + `module.json` (el `ui_handlers` da el type).
> **Cierra** `negocio.interfaz_construida`.

## Método

Sub-agente `prisma-universal` + skill `construir-interfaz`, en **grupos grandes** (16-27).
El padre fija **agente + skill + 3 variables + gate** y **verifica en disco**.
El sub-agente corre el **gate real** (`npm run build` del frontend) al cerrar cada grupo.

## El patrón REAL (copiado, no inventado)

Molde principal: `frontend/src/lib/modules/lotes/` (F7 del mismo proceso) y
`frontend/src/lib/modules/catalogo-cuentas/` (el piloto de esta vertical, BUILD VERDE).

```
frontend/src/lib/modules/<slug>/
├── manifest.json          → id, name, version, zone, order, icon, label
├── index.ts               → UIModule (manifest + PanelComponent)
├── <SlugCamel>Panel.svelte→ <BlueprintForm {blueprint} moduleId="<slug>" />
└── <slug>.blueprint.json  → COPIA del blueprint del módulo (import relativo)
```

**Naming**: `CatalogoCuentas` — capitaliza CADA palabra del kebab (los números no).
`moduleId` = slug COMPLETO (ojo: `envase-embalaje` del repo tiene el bug de poner `envase`).
**Permisos**: 644 ficheros / 755 carpeta (el build corre como www-data; 600 lo rompe).

## El mapeo F6 → F7 (la zona dicta el manifest)

| type (F6) | zone del manifest | cuántos | estado |
|---|---|---|---|
| `workspace_module` | `work-bar` | 63 | ✅ construidos |
| `system_panel` | `system-bar` | 27 | ✅ construidos |
| `chat_tool` | `chat-tools` | 5 | 🚀 en curso |
| `inline_render` | **✗ NO HAY ZONA** | 13 | ⏸️ bloqueados |
| **TOTAL construible** | | **95** | |

## 🔴 HALLAZGO BLOQUEANTE: `inline_render` sin zona

`inline_render` es un **tipo canónico del proceso** — lo aceptan explícitamente:
- `modules/proceso-negocio/index.js:541` (`TIPOS` del gate de F6)
- `modules/_shared/motor/verificador.js:139` (`TIPOS_CANONICOS`)
- `cancer/decidir-interfaz/scripts/decidir-interfaz.js:26` (`TYPES`)

**Pero NO tiene consumidor en el frontend.** El `UIZone` del frame solo admite:
`work-bar` · `chat-config` · `chat-tools` · `system-bar`.

Grep de `inline_render` en `frontend/src/` → **cero resultados**.
La skill `construir-interfaz` dice *"inline_render → (sin botón; se renderiza en el chat)"*
— pero **esa pieza del frame no existe todavía**.

**Consecuencia**: los 13 `inline_render` quedan pendientes de una pieza del FRAME
(una zona/protocolo inline en el chat). **NO es deuda de la vertical**: es un hueco
del frontend que afecta a cualquier vertical.

**Decisión**: se construyen los 95; los 13 esperan. Reportado al dueño;
**NO se toca el frame sin su palabra**.

Los 13: coste-indirecto, cuadro-mando-contable, comparador-periodos,
tablero-margen-dimension, margen-analitico, presupuesto, desviacion, saldo-tesoreria,
vista-revisable, informe-rico, marca-borrador-validado, aviso-al-negocio, narrador-estados.

## Iconos por FAMILIA (95 botones: el icono es lo que los hace legibles)

`📒` libro · `🧾` fiscal · `📥` entrada · `🏦` tesorería · `🏗️` inmovilizado ·
`👤` personal · `📦` existencias · `🗂️` proceso · `🏭` proveedores ·
`⚙️` cerrojos/control · `📊` estados/paneles · `🔔` motor de avisos · `📋` chat-tools.

Rangos de `order`: 31-36 mesa de trabajo · 41-46 entrada · 51-54 libro · 61-72 fiscal ·
81-83 verifactu · 91-98 tesorería · 101-103 inmovilizado · 111-126 personal ·
131-134 existencias · 141-142 proceso · 151-156 proveedores · 201-211 cerrojos ·
221-227 estados · 231-237 proceso · 241-242 motor · 301-305 chat-tools.

## Grupos

| # | módulos | zona | build | estado |
|---|---|---|---|---|
| PILOTO | catalogo-cuentas · escritor-diario · mayor-balanza · traza-asiento · balance-situacion · cuenta-resultados | work-bar | ✅ 21.57s | ✅ commit `49245b38` |
| 2 | puerto-documento · captura-documento · normalizador-hecho · control-cuadre-documento · padron-terceros · maestro-terceros | work-bar | ✅ 1m3s | ✅ commit `a3e74556` |
| 3 | 16 (libro + fiscal + entrada) | work-bar | ✅ 22.17s | ✅ commit `d2540348` |
| 4 | 17 (verifactu + tesorería + inmovilizado + personal) | work-bar | ✅ 25.03s | ✅ commit `0d2600cb` |
| 5+6 | 18 + 27 | work-bar + system-bar | ✅ 22.89s | ✅ commit `68ab24ab` |
| 7 | 5 (chat-tools) | chat-tools | 🚀 | en curso |

## 🔴 LECCIÓN CAZADA (dos veces en esta fase)

**Verificar en disco no es precaución teórica — es lo único que funcionó.**
Tres sub-agentes murieron **sin registrar resultado** (`outcome unknown`) tras
completar su trabajo:
- el del PILOTO (error de conexión a los 49 min)
- el del grupo 5 (owner exited)
- el del grupo 6 (owner exited)

**En los tres casos el trabajo estaba COMPLETO, correcto y en disco.** Fiarse del
reporte habría dado por perdidos y **repetido 51 módulos**. La verificación del padre
(360 aserciones sobre los 45 de los grupos 5+6, 0 fallos) es lo que lo rescató.

## 🩺 VERIFICACIÓN DEL CICLO EN VIVO (30-sep) — y un FALSO POSITIVO PROPIO

**La cadena K1→K4 completa FUNCIONA, verificada en vivo sobre nonina:**

```
onboarding-negocio.recoger  →  "alta_efectiva": true · "abierto": false · "faltan": []
   ↓ publica contabilidad.negocio_onboarded
activacion-vertical         →  REACCIONA SOLO (por evento, sin disparo manual)
   ↓ publica contabilidad.vertical_activada
VERTICAL CONTABILIDAD ACTIVADA ✅  (origen_config: "onboarding-negocio")
```

**⚠️ REPORTÉ UN CORTE QUE NO EXISTÍA — falso positivo mío.** Diagnóstico erróneo:
publiqué `contabilidad.negocio_onboarded` a mano con el **envelope mal formado**
(`source_core_id` PLANO) y, al no reaccionar el handler, concluí "la cadena se corta
entre K1 y K4". **Falso.** El bus tira el evento como `event.invalid`.

**La forma correcta del envelope** (lo que exige `EventEnvelope.validate`):
```json
{ "event_id": "<uuid>", "event_type": "<evento>", "timestamp": "<iso>",
  "source": { "core_id": "external" },      ← ANIDADO
  "data": { ... } }
```
y el bus **ignora** el evento si `envelope.source.core_id === this.coreId`
(`core/events/bus.js:156`).

**Lecciones:**
1. **Antes de culpar al sistema, sospecha de TU PRUEBA.** Un falso negativo propio es
   tan peligroso como un falso positivo ajeno: si hubiera "arreglado" el corte inventado,
   habría tocado dos módulos que funcionan perfectamente.
2. **La pista estaba antes**: el RPC directo de `activacion-vertical.activar` respondió
   `200` con `verticales_activadas: ["contabilidad"]`. **Debí sospechar de mi prueba
   cuando el módulo funcionaba por otra vía**, no de la cadena.
3. **El alta exige `verticales` en `datos`**: `activacion-vertical` lee
   `d.verticales` o `d.config.verticales`; sin verticales declaradas NO enciende nada
   (`faltan:['verticales']`) — jamás asume una por defecto. Y `onboarding-negocio` NO
   incluye `verticales` en la raíz del evento: la vía buena es dentro de `config`.
4. **El `page-set` de un proyecto es el gate de la work-bar** (`LazyWorkBar`:
   `d.universal || configuredSet.has(d.id)`). `system-bar` y `chat-tools` NO se gatean.
   Se declara por la vía del sistema: `project.update` con `pages` → `metadata.pages`.

**Herramienta nueva:** `.claude/skills/conexion-mqtt/publicar-evento.js` — publica un
evento de dominio al bus real con el envelope correcto. Uso:
`node publicar-evento.js <evento> '<json>'`.

## Bug ajeno encontrado (NO tocado)

`frontend/src/lib/modules/envase-embalaje/EnvasePanel.svelte` pasa `moduleId="envase"`
cuando el módulo es `envase-embalaje` → el `mqttRequest` iría a un dominio inexistente.
**Es de otra vertical** (The Pirate); se reporta, no se toca.
