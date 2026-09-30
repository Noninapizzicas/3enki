# F7 · Tracking de construir-interfaz (contabilidad)

> **Fase 7** (construir-interfaz). Materializa el **envoltorio mínimo** del frontend
> (`manifest.json` + `index.ts` + `<Slug>Panel.svelte`) que ENVUELVE el generador
> `BlueprintForm`. El generador renderiza desde la sección `ui.*` del blueprint
> (declarada en F6½). El envoltorio es MECÁNICO; no hay vistas ni CSS.
>
> **Entrada** = `<slug>.blueprint.json` (F6½, ya hecha) + `module.json` (el `ui_handlers` da el type).
> **Cierra** `negocio.interfaz_construida`.

## Método

Sub-agente `prisma-universal` + skill `construir-interfaz`, en **grupos de 6**.
El padre fija **agente + skill + 3 variables + gate** y **verifica en disco**.

## El patrón REAL (copiado, no inventado)

Molde principal: `frontend/src/lib/modules/lotes/` (F7 del mismo proceso, The Pirate).
Confirmado también en `envase-embalaje/` e `interfaz-dinamico/` (el dogfood).

```
frontend/src/lib/modules/<slug>/
├── manifest.json          → id, name, version, zone, order, icon, label   (autodescubrimiento)
├── index.ts               → UIModule { manifest, PanelComponent }
├── <SlugCamel>Panel.svelte→ envoltorio: <BlueprintForm {blueprint} moduleId="<slug>" />
└── <slug>.blueprint.json  → COPIA del blueprint del módulo (patrón lotes, import relativo)
```

**Naming**: `CatalogoCuentas` (capitaliza CADA palabra del kebab). `moduleId` = slug COMPLETO.
**Permisos**: 644 ficheros / 755 carpeta (el build corre como www-data; 600 lo rompe).

## El mapeo F6 → F7 (la zona dicta el manifest)

| type (F6) | zone del manifest | cuántos |
|---|---|---|
| `workspace_module` | `work-bar` | 63 |
| `system_panel` | `system-bar` | 27 |
| `chat_tool` | `chat-tools` | 5 |
| `inline_render` | **✗ NO HAY ZONA** | 13 |
| **TOTAL construible** | | **95** |

## 🔴 HALLAZGO BLOQUEANTE (del padre, 2026-09-29): `inline_render` sin zona

`inline_render` es un **tipo canónico del proceso** — lo aceptan explícitamente:
- `modules/proceso-negocio/index.js:541` (`TIPOS` del gate de F6)
- `modules/_shared/motor/verificador.js:139` (`TIPOS_CANONICOS`)
- `cancer/decidir-interfaz/scripts/decidir-interfaz.js:26` (`TYPES`)

**Pero NO tiene consumidor en el frontend.** El `UIZone` del frame solo admite:
`work-bar` · `chat-config` · `chat-tools` · `system-bar`.

Grep de `inline_render` en `frontend/src/` → **cero resultados**.
La skill `construir-interfaz` dice *"inline_render → (sin botón; se renderiza en el chat)"*
— pero **esa pieza del frame no existe todavía**.

**Consecuencia**: los 13 `inline_render` (margen-analitico, presupuesto, desviacion,
saldo-tesoreria, comparador-periodos, cuadro-mando-contable, tablero-margen-dimension,
vista-revisable, informe-rico, marca-borrador-validado, aviso-al-negocio, narrador-estados,
coste-indirecto) **quedan pendientes de una pieza del FRAME** (una zona/protocolo inline
en el chat). NO es deuda de la vertical: es un hueco del frontend que afecta a cualquier vertical.

**Decisión**: se construyen los **95** (63+27+5); los 13 esperan la pieza del frame.
Reportado al dueño; **NO se toca el frame sin su palabra**.

## Bug ajeno encontrado (NO tocado)

`frontend/src/lib/modules/envase-embalaje/EnvasePanel.svelte` pasa
`moduleId="envase"` cuando el módulo es `envase-embalaje`. Consecuencia: el
`mqttRequest` iría a un dominio inexistente. **Es de otra vertical** (The Pirate);
se reporta, no se toca.

## Grupos

| # | módulos | tipo | estado |
|---|---|---|---|
| PILOTO | catalogo-cuentas · escritor-diario · mayor-balanza · traza-asiento · balance-situacion · cuenta-resultados | work-bar | despachado |

_(Se irán añadiendo los grupos conforme se verifiquen.)_
