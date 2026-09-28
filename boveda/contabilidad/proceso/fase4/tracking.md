# F4 · Tracking de construcción

> **Fase 4** (construir-modulos). Orden tomado de la espina `enki-plan` de F3b — que es **topológico** (verificado: toda dependencia va antes).
> **Decisión del dueño (2026-09-28):** grupos por el **ORDEN de la espina** (~8 hojas), NO por oleada estricta. Motivo: las hojas de `contabilidad-entrada` dependen de piezas de `libro`/`analitica` → construir por vertical dejaría 10 hojas colgando.
> **La vertical sigue siendo la unidad de ORGANIZACIÓN y ACTIVACIÓN** (los módulos se hablan dentro y fuera de ella); la construcción va por dependencias.

## Convención de rutas (verificada)

- Módulos: `modules/nichos/<slug>/` tiene 2 niveles → **`modules/contabilidad/<slug>/`** (el loader soporta agrupación por vertical: `core/modules/loader.js` L125).
- Habilitación: por **proyecto** (`config/project.json`), no en el `config.json` del repo (nichos no está en el `enabled` del repo).
- Skills FULL (F5): `modules/cosecha/cantera/enki/<slug>/SKILL.md`.

## Los 8 REUTILIZAR (ya existen — NO se construyen)

`filesystem` · `project-manager` · `credential-manager` · `facturas` · `facturacion/fuentes` · `metricas` · `facturacion/asesoria` · `inventario`

## Progreso

| Grupo | Hojas | Estado |
|---|---|---|
| 1 | contrato-hecho-minimo · anclaje-cierre-vertical · cola-revision · regla-contrapartida · lote-admision · puerto-evento-vertical · historial-proceso-contable · maestro-terceros | 🚀 en curso |
| 2 | (siguiente 8 del orden) | pendiente |
| … | 72 CONSTRUIR en total | |
