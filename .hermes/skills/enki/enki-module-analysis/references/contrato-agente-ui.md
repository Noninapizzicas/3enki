# Contrato para AGENTES GENERADORES DE UI (blueprints) — enki

> Las piezas que un agente generador de UI debe llevar en su contrato, probadas en
> vivo con el agente `crear-blueprint-jefe` (PR #391, mise-en-place) y correcciones
> del dueño del 29-ago-2026.

## Bloque git: cada agente, rama propia

```json
"git": {
  "modo": "rama-propia",
  "rama": "agente/<name>",
  "commit": true,
  "pr": true,
  "merge": "externo"
}
```

- El agente parte de main limpio, trabaja en `agente/<name>`, commitea, push y
  abre PR. NUNCA main directo.
- El PR es la cola de revisión (todo lo pendiente de revisar en un sitio).
- El merge lo firma quien revisa (externo). Lo erróneo se descarta borrando la
  rama — main nunca se mancha.

## Bloque frontend_sync (obligatorio, ANTES de abrir el PR)

```json
"frontend_sync": {
  "obligatorio": true,
  "antes_de": "abrir_el_PR"
}
```

**Por qué**: el blueprint vive en DOS sitios y la UI renderiza el del FRONTEND,
no el de modules/:

1. `modules/<vertical>/<slug>/<slug>.blueprint.json` — la fuente (disco)
2. `frontend/src/lib/modules/<slug>/<slug>.blueprint.json` — el que BlueprintForm renderiza

Si solo se commitea el de modules/ → el PR se mergea y **la UI no cambia nunca**
(pagado 29-ago: mise-en-place y marca-cliente mergeados, sin cambios visibles en UI;
la copia frontend seguía en la versión vieja).

El agente copia el blueprint a frontend/ y commitea AMBOS en el MISMO PR. Así el
deploy del dueño (que hace `npm run build` + rsync) trae la UI nueva sin ningún
paso manual post-merge.

## El ciclo completo probado (deleg_f5af9c86, deleg_92d9e56e)

1. **Análisis previo** (skill `enki-module-analysis`): lógica del módulo con lente
   de rol → clasificación de ops (jefe/utilización/neutro) ya resuelta por quien llama
2. **Despacho** (`delegate_task`): se le pasa el contrato + la clasificación exacta +
   la forma exacta del bloque a inyectar (ui.roles, ui.flujo, version). El agente
   debe EDITAR el blueprint existente (no regenerar desde cero si ya existe).
3. **El agente**: edita → verifica (JSON parsea, claves presentes) → rama propia →
   commit → push → PR. Sin merge. Sin git directo si el dueño lo prefiere así.
4. **Verificación JEFE** (quien llama): git diff del PR contra lo pedido — el disco
   manda, no el auto-reporte (el verifier de files-modified del subagente es fiel).
5. **Merge** (firmante humano/externo) → deploy → la UI refleja el cambio al recargar.

## Nota de permisos (hermes vs admin en el repo)

Los dirs de módulos pueden ser `hermes:www-data` (setgid) con ficheros internos
admin:admin. `patch`/`write_file` fallan con Permission denied si crean temp files
en el dir. Workaround probado: escritura IN-PLACE via python json.dump (truncate del
fichero existente, sin temp) o `sudo install -o admin -g admin -m 644 src dst`.

## Bugs conocidos del tooling

- `scripts/generar-blueprint.js` busca el módulo en verticales (pizzepos/prisma)
  para LEER pero ESCRIBE el blueprint en `modules/<slug>/` (raíz) — hay que moverlo
  a mano tras generar si el módulo vive en una vertical (2 veces con variaciones).
- Si la op nueva es de un actor que el blueprint-jefe no debe mostrar (p.ej. una
  op interna), filtrarla antes del PR (#390).