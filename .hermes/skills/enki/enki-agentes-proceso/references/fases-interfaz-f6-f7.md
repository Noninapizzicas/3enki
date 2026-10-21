# Fases de interfaz (F6 · F6½ · F7) — detalle de verificación y casos testigo

Sesión de construcción de las 3 fases de interfaz del proceso de proyecto.
Resumen ejecutivo para re-auditar o extender el trabajo.

## El ciclo por pieza (mapa proceso-negocio)

```
F4 construir-modulos → F5 escribir-skills → F6 decidir-interfaz
→ F6½ esquematizar-interfaz → F7 construir-interfaz → siguiente hoja
```

Eventos del mapa:
- `negocio.skills` → decidir-interfaz
- `negocio.interfaz` → esquematizar-interfaz
- `negocio.interfaz_esquematizada` → construir-interfaz
- `negocio.interfaz_construida` → construir-modulos (siguiente hoja)

`_decidirSiguiente(progreso)` prioriza: faltan_por_construir → faltan_por_skill →
faltan_por_interfaz → faltan_por_interfaz_esquematizada → faltan_por_interfaz_construida →
FIN. `_progresoPlan` cuenta en disco: módulo (modules/<slug>/), skill (cantera), interfaz
decidida (ui_handlers tipados o ui_decision.necesita=false), spec (esquemas/interfaz-<slug>.md),
trío operativo (frontend/src/lib/modules/<slug>/ con manifest+index+<Slug>Panel.svelte).

## Rutas (patrón del repo: UN entregable = UN path)

| Fase | Entregable | Reglas JEFE |
|---|---|---|
| F6 | `<slug>/module.json` (resuelve anidados) | existe · interfaz_decidida · en_repo |
| F6½ | `storage/esquemas/interfaz-<slug>.md` (UN archivo, prisma+disección embebidos) | existe · contenido_min (300) |
| F7 | `frontend/src/lib/modules/<slug>/` dir + archivos[] (EXCEPCIÓN multi-archivo) | interfaz_operativa · en_repo |

F7 es la única excepción al patrón UN-path: el trío del frontend son 3-4 archivos físicos
que el loader `import.meta.glob` necesita por separado (manifest.json autodescubre, index.ts
exporta el UIModule, <Slug>Panel.svelte es la vista, store en frontend/src/lib/stores/).

## Casos testigo (validan el patrón por ROL, no por superficie)

- **workspace_module**: pedidos (fuente de verdad: 12 tools, 7 eventos pedido.*) vs
  productos (proyector sin estado: 13 tools, SIN create — hueco de contrato = pregunta
  abierta para el dueño). Ambos → workspace_module (barra_modulos).
- **system_panel**: filesystem (custodio, 15 handlers SIN_TIPO) vs device-health
  (observador puro, 3 handlers SIN_TIPO). Ambos → system_panel (lateral_derecha).

## Errores encontrados y corregidos en la auditoría

1. **Saltar F6→F7 sin F6½** (error grave de diseño): el generador improvisaría el panel.
   Fix: F6½ esquematiza la interfaz → SPEC → F7 la consume. El gate de F6½ exige la spec;
   F7 devuelve `{"error":"falta_espec_fase_65"}` si no existe.
2. **Gate de F6½ con `<slug>` literal**: `_verificarEntregable` listaba
   `esquemas/interfaz-<slug>` sin sustituir. Fix: sustituir con extra.slug/extra.modulos[0].
3. **Módulos anidados**: `<slug>/module.json` resolvía a `modules/<slug>/` (duplicado).
   Fix: `_dirModuloExistente` (directo + 1 nivel vertical) en `_resolverEntregable`.
4. **`_resolverSlug` robaba el slug**: la palabra "interfaz" (8 chars) ganaba a "smokef7"
   (7). Fix: ampliar la stop list con las palabras del pipeline (interfaz, frontend, panel,
   store, mqtt, uimodule, manifest, svelte…).
5. **min_chars global en spec**: pasadas pequeñas legítimas fallaban. Fix: quitar
   contenido_min del entregable multi-archivo; la robustez la da el gate del orquestador
   (estructura por nombres), no el JEFE.
6. **Smoke ensuciaba la rama**: el paso 'commitar' hace git add+commit+push REAL. En smoke,
   mockear `_commitar` o limpiar con `git reset --hard <commit-bueno>` + force push (y
   `git rebase --onto` para sacar los commits "motor: ... generado por pipeline" del medio).

## Verificación final (todo verde)

- 26/26 tests del motor (incluye interfaz_decidida ×4 + interfaz_operativa ×3).
- Smoke F6: escribe en pizzepos/pedidos/module.json, NO crea duplicado.
- Smoke F6½: escribe `interfaz-<slug>.md` (UN archivo), sin dir viejo de pasadas.
- Smoke F7: escribe el trío en frontend/ y el JEFE valida los 3 (multi_archivo true).
- `_decidirSiguiente`: spec pendiente → esquematizar-interfaz · spec lista sin trío →
  construir-interfaz · todo → FIN.
