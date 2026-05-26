# Arranque cierre tools.contract v1.2 — mensaje y preguntas listas para la próxima conversación

Este archivo NO es un contrato ni un plan — es **el guion literal** que tú
pegas al arrancar la próxima sesión para cerrar los 356 drifts residuales
de `tools.contract v1.2` en el baseline. Está diseñado para que la otra
conversación no improvise ni pierda contexto.

Doc maestro de referencia:
`arquitectura/decisiones/propuestas/cierre-tools-contract-v12-deuda-residual.md`.
Contrato canónico:
`arquitectura/decisiones/_contratos/tools.contract.json` v1.2.1.

---

## 1 · Mensaje literal para pegar al inicio de la nueva conversación

Cópialo tal cual:

> *"Lee `arquitectura/decisiones/propuestas/cierre-tools-contract-v12-deuda-residual.md`
> entero. Es el plan completo.
>
> Verifica primero el estado real:
> - `grep -c '^    \"tools|' drift-baseline.json` (debería seguir
>   dando ~356; si bajó, alguien ya tocó esto — para y reportar).
> - `grep '^    \"tools|' drift-baseline.json | sed 's/.*tools|\\([^|]*\\)|.*/\\1/' | sort | uniq -c`
>   (verifica que la distribución sigue siendo 334 ui_handlers + 22 valor pelado).
>
> Reporta estado en una tabla.
>
> Luego salta a **Fase 1**: cerrar conmigo las **3 decisiones operativas**
> de la sección 4 del doc maestro. Hazme las preguntas en el orden de
> este archivo y guarda mis respuestas aquí mismo.
>
> Solo cuando las 3 estén cerradas, ejecuta Fase 0 (auditoría exhaustiva
> de consumers frontend) y para a pedirme OK antes de empezar PR1.
>
> NO toques código hasta que las 3 preguntas estén respondidas Y la
> auditoría Fase 0 esté reportada Y yo haya dado OK explícito. NO crees
> PR sin OK explícito mío."*

---

## 2 · Las 3 preguntas en orden (la otra conversación me las hace una a una)

Formato: **enunciado · opciones · recomendación del doc**.

### Pregunta 1 — Estrategia de ramas (sección 4.1 del doc maestro)

¿Cómo se estructuran los dos PRs?

- **A**: Una sola rama `claude/cierre-tools-contract-v12` con 2 commits
  separados. Squash merge en un solo PR. Más simple, PR2 bloqueado por
  revisión de PR1.
- **B**: Dos ramas independientes
  (`claude/cierre-tools-pr1-valor-pelado` +
  `claude/cierre-tools-pr2-ui-handlers`). PR1 mergea solo. Cuando está
  en main, se rebase PR2. Más PRs pero desacoplados.

Recomendación de partida en el doc: **B**. Permite mergear PR1 con
confianza casi inmediata (1h, riesgo bajo) y dedicar más cuidado a PR2
sin bloquearlo.

Mi respuesta: ___

---

### Pregunta 2 — Auditar 13 módulos sin drift (sección 4.2)

13 de los 58 módulos con `tools[]` no tienen entries en baseline para
`tools|`. ¿Los auditamos manualmente o asumimos que están limpios?

- **A**: Asumir que están limpios. No auditar. Ahorra ~30 min.
- **B**: Auditar manualmente buscando los mismos patrones de drift que
  el validator detecta (puede descubrir falsos negativos del validator).
  ~30 min extra.

Recomendación de partida en el doc: **A**. Si en el futuro se actualiza
el validator y aparecen drifts nuevos, se cierran en otro horizontal.

Mi respuesta: ___

---

### Pregunta 3 — Manejo de módulos críticos en PR2 (sección 4.3)

Identificados consumers frontend confirmados en `pizzepos/cocina`,
`pizzepos/cuentas-canales`, `pizzepos/productos` (posiblemente también
`recetas`). ¿Cómo se tratan en PR2?

- **A**: Todos los 43 módulos en mismo lote (incluidos críticos).
  Confianza en la auditoría Fase 0.
- **B**: Cocina, cuentas y productos van en **commits separados**
  dentro del mismo PR2, con validación runtime entre cada uno. Permite
  rollback granular si algo rompe.
- **C**: Cocina, cuentas y productos se **excluyen de PR2** y se cierran
  en PR3 con auditoría dedicada por módulo.

Recomendación de partida en el doc: **B**. Commits separados con
validación entre ellos, todo en el mismo PR2.

Mi respuesta: ___

---

## 3 · Qué hace la otra conversación con mis 3 respuestas

1. Las guarda en este mismo archivo (sustituye los `___` por las
   respuestas + 1 línea de motivo si la hay).
2. Para y pide tu OK explícito antes de ejecutar Fase 0.
3. Si das OK, ejecuta **Fase 0** (~45 min):
   - Grep exhaustivo en `frontend/src/lib/` de
     `ui_handlers|uiHandler.register|mqttRequest('<domain>'`.
   - Cruza cada consumer frontend con `tools[]` del módulo destino.
   - Reporta tabla `consumer → módulo → tool → coincide/diverge`.
4. Si Fase 0 limpia (sin divergencias críticas), para a pedirte OK para
   PR1.
5. Si das OK, ejecuta **PR1** (1-1.5h):
   - Envuelve los 22 `return X` en `{ status: 'ok', data: X }`.
   - Actualiza tests POC2 afectados.
   - `npm run validate:ci` PASS verde.
   - Regenera baseline.
   - Commit + push + crea PR (con tu OK previo) + mergea (con tu OK
     previo).
6. Una vez PR1 mergeado a main, te pide OK para arrancar PR2.
7. Si das OK, ejecuta **PR2** (2-3.5h) según decisión 3 (commits
   separados para cocina/cuentas/productos, lotes de 3-5 para el resto).
8. Audit runtime de cocina + cuentas + productos antes de mergear.
9. **NO crear PRs ni mergear sin OK explícito en cada paso.**

---

## 4 · Recordatorios para la próxima conversación

- Idioma de los archivos: español (canónico del repo).
- Sin emojis en código ni archivos salvo que el usuario los pida.
- Branch de trabajo: la que diga el system prompt de esa sesión, NUNCA
  pushear a otra sin permiso explícito.
- `validate:ci` tiene que pasar antes de cualquier merge/push.
- **NUNCA crear PR sin OK explícito del usuario.**
- **NUNCA mergear PR sin OK explícito del usuario.**
- Cada commit destructivo (eliminar `ui_handlers[]` en módulo crítico,
  cambiar shape de retorno de tool) requiere OK previo.
- Trabajar **módulo a módulo** en PR2, no entry a entry — preserva
  cohesión y permite rollback granular.

---

## 5 · Si algo se tuerce

Si la otra conversación intenta:

- Tocar código antes de Fase 0 y antes de las 3 preguntas → **rechaza**,
  vuelve a sección 2 de este archivo.
- Modificar `tools.contract.json` v1.2.1 más allá del bump v1.2.2 al
  cierre → **rechaza**, no es este horizontal.
- Eliminar `ui_handlers[]` en un módulo crítico (cocina/cuentas/productos)
  sin verificar consumer Svelte primero → **rechaza**.
- Crear PR sin tu OK explícito → **rechaza**.
- Mergear PR sin tu OK explícito → **rechaza**.
- Saltarse PR1 e ir directo a PR2 → **rechaza**, los dos tienen
  perfiles de riesgo distintos por diseño.
- Hacer PR1 y PR2 en commit único / squash combinado → **rechaza** si
  decisión 1 fue B; **acepta** si decisión 1 fue A.

Si dudas, frase canónica: *"Vuelve al doc maestro
`cierre-tools-contract-v12-deuda-residual.md` antes de seguir."*

---

## 6 · Cheatsheet del estado pre-cierre

| Métrica | Valor |
|---|---|
| Módulos con `tools[]` declarado | 58 |
| Módulos con al menos 1 drift de tools en baseline | 45 |
| Total entradas de drift de tools en baseline | **356** |
| `drift_ui_handlers_con_shape_de_dispatch` | 334 (en 43 módulos) |
| `drift_tool_handler_que_devuelve_valor_pelado` | 22 (en 10 módulos) |
| Consumers frontend confirmados (auditoría inicial) | 4 (Pdf2ImgPanel.svelte, recetas.ts, cuentas.ts, cocina.ts) |
| Esfuerzo PR1 | 1-1.5h, riesgo bajo |
| Esfuerzo PR2 | 2-3.5h, riesgo medio en frontend |
| Esfuerzo total | 4-6h en 1-2 sesiones |
| Bump del contrato al cerrar | `tools.contract.json` v1.2.1 → v1.2.2 |

### Top 10 módulos con más `ui_handlers[]` residuales

| Módulo | Drifts |
|---|---|
| composition-manager | 16 |
| staff-manager | 15 |
| project-manager | 15 |
| filesystem | 14 |
| prompt-manager | 13 |
| pizzepos/productos | 13 |
| pizzepos/persistencia-comandero | 12 |
| pizzepos/cocina | 12 |
| esp32-flasher | 12 |
| certificate-authority | 12 |

### Los 10 módulos con valor pelado

| Módulo | Tools afectadas |
|---|---|
| pizzepos/cuentas-canales | 4 |
| pizzepos/cocina | 4 |
| scheduler | 2 |
| pizzepos/productos | 2 |
| mercadona-api | 2 |
| filesystem | 2 |
| facturas | 2 |
| code-executor | 2 |
| pdf-viewer | 1 |
| facturacion/asesoria | 1 |
