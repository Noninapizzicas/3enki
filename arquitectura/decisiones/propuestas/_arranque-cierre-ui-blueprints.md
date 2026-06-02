# Arranque del horizonte: cierre-ui-blueprints

**Estado:** abierto, en curso.
**Iniciado:** 2026-06-01 con `ana` en sesión `01TaS19mfXjpHWqfgz4dpKMo`.
**Objetivo:** aplicar el contrato `ui-frontend-blueprint` v1.0.0 a todos los módulos blueprint del sistema, módulo por módulo, sin escatimar.

## Punto de partida (qué está cocinado al cierre de la sesión 2026-06-01)

- Contrato transversal `arquitectura/decisiones/_contratos/ui-frontend-blueprint.contract.json` v1.0.0 + validator `arquitectura/decisiones/_validators/ui-frontend-blueprint.validate.js` + registro en `scripts/validate-all.js` + entry en CLAUDE.md + baseline regenerado capturando 6 warnings actuales (3 blueprints sin UI conocidos × 2 checks). Mergeado a `main` vía PR #259.
- Plan piloto cocinado en `arquitectura/decisiones/propuestas/cierre-ui-recetas.json` (7 fases, 3 preguntas abiertas, 11 decisiones cerradas, 18 reglas en prohibido). Listo para que `fede` lo ejecute.

## Inventario verificado de los 13 blueprints del sistema vs contrato

| # | Módulo | Veredicto al cierre sesión 2026-06-01 | Próxima acción |
|---|---|---|---|
| 1 | recetas | UI parcial (panel monolítico solo lectura, 5/13 tools cubiertos) | **Plan cocinado** → `cierre-ui-recetas.json`. Esperando ejecución `fede`. |
| 2 | escandallo | CERRADO según dossier (5 componentes Panel/Browser/Card/Detail/Alerts) | Re-verificar contra contrato. Posiblemente nada. |
| 3 | viabilidad | CERRADO según dossier (5 componentes) | Re-verificar contra contrato. Posiblemente nada. |
| 4 | tecnicas | SIN UI (warning C1+C2 en baseline) | Cocinar plan `cierre-ui-tecnicas.json`. |
| 5 | carta-manager | SIN UI (warning C1+C2 en baseline) | Cocinar plan `cierre-ui-carta-manager.json`. |
| 6 | carta-design | UI bajo otro nombre (`design-profiles` + `design-gallery`) | Verificar cumple contrato. Si no, cocinar plan. |
| 7 | carta-digital | UI bajo otro nombre (`carta-config`) | Verificar. Posible plan si falta cobertura. |
| 8 | carta-impresion | UI bajo otro nombre (`impresion-cartas`) | Verificar. |
| 9 | carta-marketing | UI bajo otro nombre (`marketing-perfil` + `marketing-actividad`) | Verificar. |
| 10 | carta-scheduler | SIN UI (warning C1+C2 en baseline) | Cocinar plan `cierre-ui-carta-scheduler.json`. |
| 11 | menu-generator | UI dispersa (panel propio archivado + `menu-cartas` + `menu-generate`) | Cocinar plan que consolide + clarifique relación con futuro plan de carta-manager. |
| 12 | system-coherence-analyzer | HEADLESS por diseño (agente blueprint) | Sin acción. |
| 13 | agente-base | HEADLESS por diseño (padre abstracto) | Sin acción. |

**A trabajar:** módulos 4, 5, 10, 11 (sin UI o dispersa). Verificación pendiente: 2, 3, 6, 7, 8, 9.

## Decisiones del horizonte global (cocinadas en sesión 2026-06-01)

Las decisiones cocinadas son ya **canon transversal** porque viven en `ui-frontend-blueprint.contract.json`. Cualquier plan futuro de cierre UI por módulo (cierre-ui-tecnicas, cierre-ui-carta-manager, etc.) las hereda sin reabrirlas:

- Los 5 criterios chat-vs-UI para mapear tools del blueprint.
- 1 botón work-bar = 1 recurso observable.
- 1 blueprint backend puede mapear a N módulos frontend.
- Panel router con `activeView` local, no store global.
- Store frontend lector reactivo, no dueño del estado.
- Convención de archivos del módulo frontend.
- Postura A (UI con forms) vs Postura B (lectura + pre-relleno chat) con criterio para elegir.
- Mecanismo `chatInputDraft` compartido entre todos los módulos UI (cocinable en F1 del plan recetas, reutilizable después por los demás).
- Excepciones canónicas headless (agentes blueprint, padres abstractos).

## Decisiones específicas que cada plan futuro debe cerrar individualmente

Cada `cierre-ui-<slug>.json` debe cocinarse con `ana` resolviendo:

- Inventario de recursos observables del módulo (¿1 botón work-bar o varios?).
- Mapeo tool-a-UI vs tool-a-chat aplicando los 5 criterios.
- Elección Postura A o B (B es default si el dominio es complejo y conversacional).
- Estructura concreta de sub-componentes (Browser + Detail + Form + Historial + etc. según necesite).
- Frases canónicas de pre-relleno para cada acción (Postura B).
- Verificación E (golden path manual).

## Disciplina de ejecución del horizonte

- **Orden honesto:** módulo a módulo, en serie. No paralelizar planes porque cada uno necesita su cocina con `ana`.
- **Cada plan:** cocinado con `ana` → OK del humano → materializado en JSON → ejecutado por `fede` con OK explícito entre fases → mergeado a main.
- **Verificación al cierre de cada módulo:** validator `ui-frontend-blueprint` con `--check-system` debe reportar menos warnings que antes (los warnings C1+C2 del módulo cerrado desaparecen).
- **Cuando los 4 SIN UI estén cerrados:** baseline tendrá 0 warnings de C1+C2 (los 6 actuales se reducen a 0 al cerrar carta-manager + carta-scheduler + tecnicas).

## Trabajo pendiente del horizonte (anotado, fuera del flow inmediato)

- **Infra de tests frontend** — vitest/playwright. Inexistente en repo. Horizonte propio cuando se justifique.
- **Postura A en caso real** — el repo no tiene caso testigo a 2026-06-01. Si emerge módulo que la justifique, documentar como ejemplo canónico en `ui-frontend-blueprint.contract.json`.
- **Re-verificación de los 5 módulos "UI bajo otro nombre"** (módulos 2, 3, 6, 7, 8, 9 de la tabla) — ratificar que cumplen contrato o cocinar plan si no.

## Próxima sesión: por dónde retomar

Dos rutas posibles, no excluyentes:

**Ruta A — Ejecutar el piloto:**
Invocar `/fede` y decir "ejecuta `cierre-ui-recetas`". Fede lee el plan + los 9 contratos referenciados, declara sus 3 listas con verificación en disco, lanza Q1 (buscador visual sí/no), espera respuesta literal, avanza a Q2, Q3, después fase F1 con OK explícito, etc. Al cerrar el horizonte, recetas tendrá UI completa siguiendo Postura B y los warnings C1+C2 sobre recetas desaparecerán del baseline.

**Ruta B — Cocinar el siguiente plan:**
Invocar `/ana` y decir "cocina `cierre-ui-<siguiente>`" donde `<siguiente>` puede ser tecnicas (el más pequeño según el blueprint) o carta-manager (el más relevante por ser aggregate root del subsistema-carta). Ana repite la disección de las 6 piezas heredándolas del piloto, y solo cocina lo específico del módulo.

Las dos rutas pueden alternarse. No hay dependencia técnica entre ellas: el contrato es estable, cada plan es autónomo, fede ejecuta uno a la vez sin necesidad de cocinar el siguiente antes.

---

**Cierre del ritual de limpieza de la sesión 2026-06-01.**
**Lo importante está en disco:** contrato + validator + plan piloto + esta nota + CLAUDE.md actualizado.
**Próxima sesión:** puede arrancar limpia leyendo CLAUDE.md y este archivo.
