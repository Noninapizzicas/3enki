---
name: enki-vertical-por-subagentes
description: >
  Ejecutar las fases de construcción (F4 construir-modulos) y de documentación
  (F5 escribir-skills) de una VERTICAL Enki desde Hermes (la mente) como
  ORQUESTADOR: lanzar sub-agentes por GRUPOS de ~8 módulos, uno a la vez en el
  orden de la espina del plan, verificando cada entregable real en disco (no al
  reporte) antes de pasar al siguiente. El chat no participa. Úsalo cuando haya
  que materializar o documentar los N módulos de una vertical (pizzepos, níchos,
  3D, ...) sin parar entre entregas.
tags: [enki, vertical, subagentes, construir, skills, orquestar, fase4, fase5]
---

# Construir/documentar una vertical Enki por sub-agentes (mente como orquestador)

> **Qué es.** El patrón comprobado para ejecutar F4 (construir-módulos) y F5
> (escribir-skills) de una vertical completa desde Hermes (`delegate_task`), NO
> desde el chat del proyecto — el chat solo pondrá en servicio la vertical
> terminada. La persistencia del proceso vive en `boveda/<vertical>/proceso/`
> (git), fuera de `/opt/enki/data/projects/<proyecto>`.
>
> **Skill de proceso vigente.** Esta es la skill que produjo la vertical nichos
> (44 módulos + 44 skills, merge #656 → `11fc475e`). Sustituye a las notas
> anteriores sobre lo mismo: `enki-proceso-desde-hermes` y
> `enki-proceso-mente-ejecuta` (absorbidas aquí — mismo modelo
> `mente-ejecuta / chat-gestiona`, se dejaron por construcción a pegotes).
> Para poner en servicio una vertical YA construida: `poner-en-servicio` + la
> variante concreta `enki-poner-en-servicio-nichos`.

## Por qué en grupos (pitfall crítico de ejecución real)

- Un sub-agente **leaf** se corta por el límite de iteraciones/tokens de la
  delegación **antes** de terminar los 44 módulos (ej.: detiene en iteración 41).
  Peor: si la sesión padre se cierra, la delegación se interrumpe **sin persistir
  nada** para ese bloque. Verifica SIEMPRE en disco qué llegó antes de relanzar.
- Dividir en **grupos de ~8** módulos/skills por sub-agente evita el límite y
  deja cada grupo commiteado (reversible) antes del siguiente.
- No esperes confirmación del dueño entre módulos: avanza grupo a grupo "poco a
  poco pero sin parar". El dueño quiere progreso continuo.

## Estructura de carpetas (convención real)

- Módulos ejecutables: `modules/<vertical>/<slug>/` (`module.json` + `index.js`).
- Tests unitarios: `tests/unit/nichos__<slug>.test.js` (o `<vertical>__`).
- Skills FULL (F5): `modules/cosecha/cantera/enki/<slug>/SKILL.md` (la cantera).
- Proceso/persistencia: `boveda/<vertical>/proceso/` + `estado.json` con un
  `tracking.{orden,realizados,pendientes,proximo}` que llevas al día en cada
  cierre de módulo.

### El layout REAL de boveda/<vertical>/ (verificado en boveda/nichos)

```
boveda/<vertical>/
├── F0-identidad-<vertical>.md        identidad (documento legible)
├── fase0-identidad-<vertical>.json   identidad (estructurado: que_es, que_vende,
│                                     como_lo_elabora, tipo_derivado, preguntas_abiertas)
└── proceso/
    ├── estado.json                   EL MARCADOR: fase_actual + una entrada por fase
    │                                 (fase2/fase3/fase3b/fase4/fase5/fase6/fase65/fase7)
    │                                 + fase4.tracking.{orden,realizados,pendientes,proximo}
    ├── fase2/esquemas/               esquema.md + pasada-1..N + pasada-diseccion.md
    ├── fase3/diseno-oop.md
    └── fase3b/plan-construccion.md
```

`boveda/` es el acumulador Obsidian del repo (por sectores), y el subdirectorio de
una vertical del proceso vive ahí: **versionado en git**, fuera de
`/opt/enki/data/projects/<proyecto>`. La cabecera de `estado.json` declara los
cuatro metadatos que identifican el trabajo:

```json
{
  "proyecto": "<vertical>",
  "ramas": "vertical/<vertical>",
  "persistencia": "boveda/<vertical>/proceso/",
  "modelo": "mente-ejecuta / chat-gestiona",
  "fase_actual": "..."
}
```

**Pitfall de ubicación**: la identidad de una vertical puede existir TAMBIÉN como
copia suelta fuera del repo (p.ej. `/home/admin/vertical-<slug>/`, sin git). Esa
copia NO es el original — el original es `boveda/<vertical>/`. Verifica el commit
(`git log --oneline --stat <merge>` → ¿toca `boveda/`?) antes de asumir cuál manda.

## Cómo ejecutar F4 (construcción) por grupos

1. Extrae la espina `enki-plan` del `plan-construccion.md` (F3b): las slugs
   CONSTRUIR en orden de dependencias.
2. Monta el tracking en `estado.json` (lista completa realizada/pendiente).
3. Por cada grupo (~8 slugs en orden): dispara UN sub-agente leaf que, para CADA
   slug, construya `index.js`+`module.json` (patrón real `_shared/modulo-hibrido-reflejo`
   extendiendo `ModuloHibridoReflejo`; CUSTODIO con PosPersistencia+project.activated,
   REFLEJO/PUENTE/CONVERSOR stateless) + el test, y lo **verifique antes del siguiente**
   (`node -c`, module.json con `description` obligatoria, subscribes↔handlers, require
   `_shared` correcto, `node tests/unit/...` verde).
4. Al aterrizar el grupo: verifícalo TÚ en disco (no al reporte del sub-agente),
   marca en el tracking, `git add`+commit+push a la rama de la vertical.
5. Repite hasta `orden` completo.

## Pitfalls F4 (lecciones en vivo)

- El **loader** (`core/modules/loader.js validateManifest`) exige `description`
  en module.json (además de `name`+`version`). Sin ella: "Invalid manifest".
- Un CUSTODIO real usa PosPersistencia + `project.activated` + `onUnload` flush
  + single-writer; NO lo confundas con un reflejo stateless.
- El suite `npm run test` del repo NO cubre los módulos de una vertical y falla
  por `EADDRINUSE 0.0.0.0:3001` (infra viva). Verifica cada módulo con SU test.
- Un fallo `404` en un test de máquina de estados suele ser **secuencia del
  test** (project_id quedó en otro tras un test de persistencia), no de la lógica
  del módulo: restablece `project_id` antes de la aserción.
- **El plan F3b puede declarar `REUTILIZAR` módulos que ya NO existen.** El adaptador
  F3b corre contra un inventario desincronizado con el disco (p.ej. `memoria-nicho`/
  `gestor-credenciales-nicho` se eliminaron como parte del proyecto viejo, pero el plan
  los marcó REUTILIZAR por nombre sin verificar su contrato). Consecuencia silenciosa: F4,
  al no encontrar el módulo a reutilizar, **absorbe su función en un módulo nuevo** sin
  avisar — la vertical queda autocontenida y funcional, pero el plan miente. **Antes de dar
  por bueno el plan, verifica que cada REUTILIZAR existe en `modules/`** y que su `module.json`
  real (tópicos que subscribe/publica) encaja con los CONSTRUIR. Si no encaja: alinea el plan
  (quita la hoja huérfana + limpia `depende_de`/`reutiliza` en las hojas que la referencien) y
  documenta qué módulo nuevo absorbió la función. NO restaures los viejos: su arquitectura
  (tópicos `memoria.*`/`deliberador.*`/`gestor.*`) es de otro dialecto y quedarían muertos
  colgados esperando emisores inexistentes.
- **Módulos "borrados" se recuperan de git, no de `/tmp`.** El backup en `/tmp` se limpia con
  cada reinicio; la fuente durable es git: `git fsck --lost-found` lista *dangling commits* donde
  suele quedar un commit de backup explícito (`backup: módulos ... a eliminar`) con el código
  completo. Extraer con `git checkout <commit> -- modules/<slug>`. Si un módulo nunca se commiteó
  (solo staged), su código se perdió con el working tree — irrecuperable. Tras extraer, ojo: el
  `git checkout` deja los archivos **staged** ("A"); borrarlos con `rm` deja "AD"/"D" enredados.
  Limpiar con `git reset HEAD -- modules/<slug>` y, si la rama aún los trackea, `git rm -r --cached`
  + commit del borrado.
- **La vertical se materializa en `main` (no en la rama `vertical/<slug>` para siempre).** Al final
  del trabajo, abrir PR `vertical/<slug>` → `main` y mergear squash vía MCP github (requiere pasar
  `owner`/`repo` — el error "Required" de `create_pull_request` es que faltan esos dos campos).
  Tras el merge, `main` local queda `ahead 1` y el `git push` puede dar "Everything up-to-date"
  si la rama de tracking se desincronizó: hacer `git push origin main` explícito.

## Cómo ejecutar F5 (skills) por grupos

1. La fuente de verdad es el **código real** (`module.json` + `index.js`), NO el
   plan. Formato canónico: frontmatter (`name`==slug, description, when-to-use,
   tags) + secciones Qué hace · Contrato de eventos · Reglas de negocio · Cómo se
   usa (RPCs) · Tests · Notas de implementación.
2. Honestidad del contrato: cruza index.js con module.json; lo que sub-declara
   emite/escucha el código se documenta con "> Nota: no está en module.json pero
   sí lo emite index.js en <método>". NO inventes eventos.
3. **Verificación determinista**: el script `scripts/verificar-skill-modulo.js <slug>`
   asume `modules/<slug>` SIN el segmento de vertical → para verticales usa el
   fallback python con la ruta real:
   `python3 -c "import json;m=json.load(open('modules/nichos/<slug>/module.json'));t=open('modules/cosecha/cantera/enki/<slug>/SKILL.md').read();print([e for e in [x['event'] for x in m['subscribes']+m['publishes']] if e not in t] or 'NINGUNO missing')"`.
   Debe dar "NINGUNO missing".
4. Si una skill falla la verificación, corrige la SKILL (nunca el module.json).

## La fase de interfaz (F6) — verticales autónomas ≠ verticales de panel

Tras F5 viene F6 (`decidir-interfaz`) → F6½ (blueprint `ui.*`) → F7 (panel + registro).
Regla durable: **una vertical autónoma/motor (nichos) casi no necesita UI.** La mayoría de
sus módulos son reflejos/puentes/micro-agentes sin cara humana — su superficie es el bus +
el canal Telegram (`canal-supervision`, `gate-decision-operar`). Aplicando el patrón por rol,
solo unos pocos módulos merecen `system_panel` (el dashboard de control del dueño: cuadro
maestro, cola de gates, umbrales). NO forzar interfaz al resto (la skill `decidir-interfaz` es
taxativa: "un puente que solo escucha y re-emite → su cara es el bus").

Declarar un `ui_handlers` no basta para que el panel se vea: F6 declara el tipo en
`module.json.ui_handlers` (`{domain, action, handler, type:'system_panel', zone:'lateral_derecha'}`,
el `handler` debe existir de verdad en el index.js), F6½ añade el `*.blueprint.json` con sección
`ui.*`, F7 materializa el `.svelte` (o lo renderiza el generador `BlueprintForm`) + registro en
`panels.ts`/`project-pages.ts`. Verificar con `node arquitectura/decisiones/_validators/frontend.validate.js --check-system`
que los módulos tocados NO introducen drift (el validador reporta cientos de drift preexistentes
de módulos ajenos; filtrar por el slug propio).

Para sellar una fase, corre el conjunto de tests de la vertical en segundo plano
y espera `TOTAL pass=N fail=0`:
```
cd /home/admin/3enki; fail=0; pass=0; for t in tests/unit/nichos__*.test.js; do r=$(node "$t" 2>&1 | tail -1); if [ "$(echo "$r" | grep -c 'Todos los tests pasaron')" -eq 0 ]; then fail=$((fail+1)); else pass=$((pass+1)); fi; done; echo "TOTAL pass=$pass fail=$fail"
```
(usa `background=true` + `notify_on_complete=true`: el conjunto completo tarda >60s).
