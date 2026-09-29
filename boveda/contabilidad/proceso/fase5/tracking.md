# F5 · Tracking de skills

> **Fase 5** (escribir-skills). Skill FULL pedagógica por cada uno de los **116 módulos** construidos en F4.
> **Fuente de verdad = el CÓDIGO** (`module.json` + `index.js`), NO la documentación NI los comentarios.

## Convención de rutas (verificada)

| qué | dónde |
|---|---|
| módulo | `modules/contabilidad-{entrada,libro,fiscal,analitica}/<slug>/` (**DOS niveles**) |
| skill | `modules/cosecha/cantera/enki/<slug>/SKILL.md` (**PLANA**, NO en subcarpeta de vertical) |

## Verificador

**`scripts/verificar-skill-contabilidad.js`** (nuevo — el canónico `verificar-skill-modulo.js` busca `modules/<slug>/` PLANO y da falso negativo en TODAS las verticales).

```bash
node scripts/verificar-skill-contabilidad.js <slug>     # uno
node scripts/verificar-skill-contabilidad.js --todos    # los 116
```

Comprueba: módulo localizado · skill plana existe · frontmatter (name==slug, description, when-to-use, tags) · TODOS los eventos del module.json documentados · las 6 secciones canónicas · handlers existen Y están documentados · **el TIPO declarado casa con el código**.

**Corrección cazada por el sub-agente del grupo 1:** la heurística de custodio era `/PosPersistencia/` suelto y **casaba el comentario** *"Sin PosPersistencia"* (un stateless pasaba como custodio). Ahora exige `new PosPersistencia(` o el `require` real → distingue de verdad.

## Formato canónico

Las **6 secciones** obligatorias (el verificador las busca literalmente):
`## Qué hace el módulo` · `## Contrato de eventos` · `## Reglas de negocio` · `## Cómo se usa` · `## Tests` · `## Notas de implementación`

Y en el cuerpo, el contrato se copia **LITERAL** del `module.json` (`description` incluida). Lo que el manifest sub-declara se marca:
`> Nota: no está en module.json pero sí lo emite index.js en <método>`

## Progreso

| Grupo | Módulos | Estado |
|---|---|---|
| 1 | puerto-documento · captura-documento · puerto-evento-vertical · normalizador-hecho · control-cuadre-documento · puerto-plan-contable · catalogo-cuentas · padron-terceros | ✅ commiteado `c7be686e` |
| 2 | maestro-terceros · contrapartida-asistida · regla-contrapartida · clave-natural · deduplicacion-hecho · encolado-excepcion · aviso-revision · lote-admision | 🚀 en curso |
| 3-15 | (el resto, por el orden topológico de la espina) | pendiente |

**Total: 116 skills** (15 grupos de ~8; el último grupo lleva 12).
