# Root cleanup — 2026-05-23

Limpieza del root del repo. 16 archivos no-código movidos aquí porque:
- No tienen referencias entrantes activas en código (`*.js`, `*.ts`, `*.svelte`, `*.json`).
- Son artefactos de sesiones de análisis o planificación previas que ya cumplieron su propósito.
- El root del repo se reservaba para archivos canónicos (CLAUDE.md, README, TEMPLATEs, configs, drift-baseline, package.json).

## Listado

| Archivo | Tipo | Origen probable |
|---|---|---|
| `ANALISIS-CRITICO.txt` | Notas | Sesión de análisis crítico del sistema |
| `ANALISIS-FLUJOS-COMPLETO.md` | Análisis | Análisis de flujos del sistema event-core |
| `CREATE_PR.md` | Notas | Plantilla/notas para crear un PR específico |
| `PLAN_ESCANDALLO_V2.md` | Plan | Planificación de la v2 del módulo escandallo |
| `PLAN_ESCANDALLO_V2_SIMPLE.md` | Plan | Versión simplificada del anterior |
| `PLAN_VIABILIDAD_RECETA_V2.md` | Plan | Planificación de la v2 del módulo viabilidad |
| `PR_CLEANUP.md` | Notas | Notas de cleanup de un PR específico |
| `SESSION-ANALYSIS-SUMMARY.md` | Notas | Resumen de una sesión de análisis previa |
| `plan-esp32-modules.md` | Plan | Planificación módulos ESP32 |
| `plan.md` | Plan | Plan genérico (huérfano) |
| `Diseño sin título_20251201_100445_0000.png` | Imagen | Mockup/diseño suelto |
| `IMG-20251201-WA0001(1).jpg` | Imagen | Foto subida desde WhatsApp |
| `NO NI NÁ Pizzicas.pdf_20251201_015827_0000.pdf` | PDF | Material de Nonina (carta/menú) |
| `Screenshot_2025-12-04-16-20-31-214_com.android.chrome.jpg` | Screenshot | Captura del frontend en mobile |
| `Screenshot_2025-12-04-16-20-42-290_com.android.chrome.jpg` | Screenshot | Idem |
| `Screenshot_2025-12-05-00-51-04-121_com.android.chrome.jpg` | Screenshot | Idem |

## No movidos (activos)

Tres archivos detectados en la auditoría pero conservados en root porque tienen referencias activas:

- `ANALISIS-CODIGO-VS-CONTEXTO.md` — referenciado desde `SYSTEM-ANALYSIS.md`.
- `INVENTARIO-SISTEMA.json` — referenciado desde `contexto/mejoras-pendientes.json` (tiene una mejora pendiente declarada para sincronizarlo automáticamente).
- `SYSTEM-ANALYSIS.md` — referenciado desde `contexto/index.json` y desde `.claude/skills/context-sync/SKILL.md` + `reference.md` (usado por `/context-sync stats`).

## Recuperación

Si alguno se necesita de vuelta:

```bash
git mv _archived/2026-05-23_root-cleanup/<file> ./
```

El historial git se conserva — `git log --follow <archivo>` sigue funcionando desde la nueva ubicación.
