# Articulación de la FASE 2 — PR #163 (ag-2026)

## Las citas de Paco (transcripción fiel, lo que gobierna el diseño)

- "no es cuestión de que yo le diga el foco ni nada — es cuestión de que él busque el foco
  y los cuellos de botella y los expanda al máximo y no dé nada por sentado, que las dudas
  las pregunte, no puede tomar como valor que es imposible llegar hasta tal punto — tiene
  que si duda que pregunte"
- "quita los supuestos... ya das por sentado cosas que hay que pensar ¿qué horno? ¿1 o 2?"
- "el horno de hecho es el pulmón — es el que limita kg hora horneados"
- "para estas cuestiones tenemos agentes que esquematizan y diseccionan sin aventurarte en
  terreno pantanoso"
- "Tiene que exigir que investigue... más vale que pegue a investigar algo a que no
  investigue nada"
- "cuando modifiques lo que tenemos, guárdalo en otro sitio por si los cambios no son
  factibles volvemos al anterior — pero no lo dejes en conversaciones, en otro sitio que no
  nos liemos, donde tú oído esto y que sepas dónde está"

## Los 5 puntos del diagnóstico (de las conversaciones f/a/panadería) y su cierre

| # | Punto | Dónde se cerró |
|---|---|---|
| 1 | El agente busca el foco solo + cero supuestos + ciclo | skill `esquematizar-negocio` (3b/3c/3d) + pipeline `esquematizador-negocio` |
| 2 | F0 reajuste = merge preservante | **ya estaba**: `project-profile/index.js:118` `{ ...perfil.identidad, ...(input.identidad||{}) }` — el `.bak` es foto previa, no sobrescritura |
| 3 | Gate respeta el foco | absorbido por el 1 (el agente lo descubre él, no espera al dueño) |
| 4 | El chat delega decisiones de negocio al agente | `base.prompt.json` → `agentic_behavior.decision_de_negocio_delega` + ejemplo bueno/malo |
| 5 | "Muéstramelo" = mostrar el entregable | `base.prompt.json` → `agentic_behavior.muestrame_el_entregable` + ejemplo malo |

## Archivos tocados en el PR #163

1. `modules/cosecha/cantera/enki/esquematizar-negocio/SKILL.md`:
   - paso 2 del mandato (3b): BUSCA EL FOCO TÚ MISMO (eslabón limitante → expandirlo)
   - 3c: LEY DE CERO SUPUESTOS (innegociable, 4 reglas)
   - 3d: EL CICLO COMPLETO (pasada 1 → preguntas → investigación exigida → replanteamiento → pasada 2)
   - errores a evitar + verificación + description del frontmatter actualizados
2. `modules/agentes/registro/store/esquematizador-negocio.json`: instrucción del fuzzy con
   MANDATO DEL FOCO + LEY DE CERO SUPUESTOS (json string con \n embebidos — el pipeline
   guarda la instrucción inline).
3. `modules/_shared/base.prompt.json`: 2 reglas nuevas en `agentic_behavior`
   (`decision_de_negocio_delega`, `muestrame_el_entregable`) + 1 ejemplo bueno + 2 malos.

## Backups (directiva de Paco)

- `/home/admin/hermes-backups/2026-08-08-proceso-panaderia/` — estado PRE-cambio:
  `skills/{identidad-negocio,esquematizar-negocio}.md`, `pipelines/esquematizador-negocio.json`,
  `esquemas/proyecto-a-esquema.md`, `main-sha.txt` (4d960e33), `MANIFIESTO.md` con los cp de
  restauración.
- Regla: backup NUEVO antes de CADA modificación de skill/pipeline de proceso.

## Verificación del PR #163

- JSON del pipeline válido (node -e JSON.parse) ✅
- Skill con estructura equivalente a la viva (`identidad-negocio` — ambas sin `version`,
  formato normal de la cantera; el validator de skills ≠ validator de module.json) ✅
- 30/30 tests del motor ✅
