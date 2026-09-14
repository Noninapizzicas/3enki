# interfaz-decisiones.md — Catalogo (F7 construir-interfaz)

> Módulo `catalogo` (CUSTODIO biblioteca de piezas, work-bar) · Proyecto 3D.
> F6 decidió `workspace_module` (Fase 6, #1). F6½ generó el blueprint
> (`catalogo.blueprint.json`). Esta F7 materializa el panel.

## Decisión de forma (evento → contexto → forma → elemento → porqué)

| op | contexto | forma | elemento | porqué |
|---|---|---|---|---|
| `catalogo.listar` | el dueño abre la biblioteca y ve qué piezas hay | grid de tarjetas | botón-card por ficha (clic → detalle) | curaduría diaria: ver toda la moneda de un vistazo |
| `catalogo.por_id` | consulta la ficha completa de una pieza | detalle (dl) | `<dl>` con uso/filamento/formatos/archivos/origen | lectura de a 1 pieza para saber si sirve/está lista |
| `catalogo.registrar` | dar de alta una ficha nueva | formulario | inputs nombre*/uso/filamento/fuente/origen + 3 archivos | el custodio reconcilia antes de crear (no duplica) |
| `catalogo.actualizar` | corregir/completar una ficha existente | formulario + select de pieza | select pieza + inputs merge | merge, no re-crea; añade formatos faltantes |

## Eje de roles

- **Cara única OPERADOR** (curaduría). NO es doble-cara jefe/trabajador: el
  operador ve y edita la biblioteca. `panel-trabajador` y `panel-jefe` son módulos
  separados (control de máquina / decisiones futuras), no viven aquí.
- **CERO juicio**: uso, filamento y aprobación quedan al dueño; el custodio solo custodia.

## Contrato del panel (store `stores/catalogo.ts`)

- RPC `mqttRequest('catalogo', <op>, ...)` → `ui/request/catalogo/<op>`.
- Señal de refresh: `modelo.registrado` (refresca la biblioteca tras alta/edición).
- `ui_handlers` del `module.json` backend: listar/por_id/registrar/actualizar
  (todos `on<Op>Request` reales del `index.js`).

## Honestidad y huecos

- Moneda real multiformato: `archivo_stl` / `archivo_3mf` / `archivo_gcode`
  conviven en la ficha (nunca solo .3mf) — reflejado en el panel como 3 campos.
- La operación física (retirar/encolar/imprimir) NO vive en este módulo — está en
  `cola`/`ciclo-impresion`. Este panel es solo biblioteca.

## Verificación

- `module.json` JSON válido + `ui_handlers` = 4 (nuevo en esta F7).
- `node scripts/validate-hibridos.js --module catalogo` → **PASS** ecosistema-5.
- `svelte/compiler` compile del `CatalogoPanel.svelte` → **SVELTE OK**.
- `node --check modules/catalogo/index.js` → OK.
