# F5 · Tracking de skills

> **Fase 5** (escribir-skills). Skill FULL pedagógica por cada módulo **YA construido** (F4).
> **Fuente de verdad = el CÓDIGO** (`module.json` + `index.js`), NO la documentación.

## Convención de rutas (verificada contra nichos)

- **Skill**: `modules/cosecha/cantera/enki/<slug>/SKILL.md` — **PLANA** (NO en subcarpeta de vertical). Verificado: nichos tiene el módulo en `modules/nichos/<slug>/` y la skill plana en `cantera/enki/<slug>/`.
- **Módulo**: `modules/contabilidad/<slug>/`.
- **Verificador**: `node scripts/verificar-skill-contabilidad.js <slug>` → `<slug>: N/N OK · handlers N/N · frontmatter OK · secciones OK`.

## ⚠️ Hallazgo: el script canónico de F5 está roto para verticales

`scripts/verificar-skill-modulo.js` (el que manda la skill `escribir-skills`) busca:

```
modules/<slug>/module.json                  ← ruta PLANA
cantera/enki/<slug>/SKILL.md
```

Pero las verticales usan **dos niveles**: `modules/<vertical>/<slug>/`. Resultado:

```
node scripts/verificar-skill-modulo.js registro-cobros
→ NO module.json: modules/registro-cobros/module.json
```

**Falla también con nichos** → es un bug de todo el repo, no solo de contabilidad.

**Solución aplicada:** `scripts/verificar-skill-contabilidad.js` con la ruta real + verificación de **handlers** y **secciones canónicas** (el canónico solo mira eventos y frontmatter).
**El canónico NO se ha tocado** (es de todo el repo) — reportado al dueño.

## Formato de la skill FULL (6 secciones canónicas)

`## Qué hace el módulo` · `## Contrato de eventos` · `## Reglas de negocio` · `## Cómo se usa (RPCs)` · `## Tests` · `## Notas de implementación`

Con frontmatter `name` == slug (lo verifica el script).

**Regla de honestidad del contrato:** si el `index.js` emite/escucha algo que el `module.json` **sub-declara** (pares `*.failed` del runtime, fire-and-forget de transición), se marca:

```
> Nota: no está en module.json pero sí lo emite index.js en <método>
```

## Las 8 invariantes de la vertical (documentadas en cada skill)

1. **La partida doble cuadra** — Σ debe = Σ haber; el descuadre es ERROR, no estado.
2. **Un hecho = un asiento** — idempotencia por clave natural.
3. **El asiento original no se borra; la corrección SUMA** — append-only.
4. **Un solo escritor por parcela** — guard; segundo escritor rechazado.
5. **La ley entra como DATO** — tipos, plazos, coeficientes, calendario y formatos son **declarables**; ninguna constante legal cableada.
6. **El sistema NO firma y NO decide** — la firma es del asesor; vence → expira y re-pregunta, jamás asume.
7. **Cero estimación** — dato ausente = `[ABIERTO]`, nunca inventado.
8. **Una sola métrica de cobertura** — las demás piezas la LEEN.

## Progreso

| Grupo | Módulos | Estado |
|---|---|---|
| 1 | contrato-hecho-minimo · anclaje-cierre-vertical · cola-revision · regla-contrapartida · lote-admision · puerto-evento-vertical · historial-proceso-contable · maestro-terceros | ✅ `2990b63a` — 8/8 verificadas (72 eventos, 31 handlers) |
| 2 | normalizador-hecho · puerto-extracto · single-writer · frontera-planos · regla-movimiento-bancario · maestro-cuentas-bancarias · expediente-documental · ratificacion-regla-aprendida | 🚀 en curso |
| 3-9 | (las 56 restantes) | pendiente |

## Lecciones

- **Escribe las 8 SKILL.md COMPLETAS primero, verifica después** (lección de F4: los sub-agentes se quedaban sin iteraciones).
- Las skills del **grupo 1** son el molde exacto de esta vertical — mejor referencia que cualquier otra.
