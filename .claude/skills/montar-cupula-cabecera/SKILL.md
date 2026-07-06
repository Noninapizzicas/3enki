---
name: montar-cupula-cabecera
description: Receta para montar la CÚPULA DE LA CABECERA en cualquier repositorio — el documento rector (CLAUDE.md o equivalente) servido por REBANADAS con frontmatter, números COMPUTADOS por marcadores (doc-sync), staleness VIGILADA por fuentes (validate-cabecera) y los tres órganos en GitHub Actions (check en PR · ensamblado en merge · pulso semanal). La escalera de determinismo aplicada al documento; el olvido hace ruido, nunca silencio. Implementación canónica viva en este repo: scripts/cabecera/ + arquitectura/cabecera/ + .github/workflows/cabecera-*.yml.
when-to-use: Cuando un repo tenga un documento rector monolítico que envejece en silencio (versiones a mano, estados congelados, secciones olvidadas tras los PRs) y quieras que se mantenga fresco POR CONSTRUCCIÓN. También para repos nuevos que quieran nacer con la cabecera rebanada. NO para documentos cortos que caben en la cabeza de un PR — la cúpula paga cuando el doc supera lo que una persona revisa de memoria.
---

# montar-cupula-cabecera

> Un documento rector envejece por una sola causa: el olvido. La cura no es disciplina
> (falla) sino construcción: lo que envejece rápido se COMPUTA, lo que envejece lento se
> VIGILA, y lo que no envejece (los porqués) se deja en prosa. GitHub trae los cuatro
> órganos hosteados: MEMORIA (repo) · MOTOR (Actions) · QUÍMICO (cron) · EVENTO (checks/Issues).

## Cuándo usar (trigger como CONDICIÓN)

```
SI repo.doc_rector.lineas > ~1000
   Y (doc.versiones_escritas_a_mano O doc.secciones_sin_dueño O drift_detectado)
→ montar la cúpula
SI doc < ~500 líneas y un solo mantenedor → no compensa; basta el sello por PR
```

## Contrato (JSON)

```json
{
  "esquema": "cupula-cabecera-portable-v1",
  "fuente_de_verdad": "<dir-rebanadas>/** — una rebanada .md por sección con frontmatter { id, dominio, resumen, fuentes: [globs], verificado: fecha } + _orden.json + _mandato.md + _persona.md (lo que no envejece, va al doc fino)",
  "artefactos": { "DOC fino": "persona + mandato + catálogo (lo que toda sesión carga)", "DOC.full.md": "monolito ensamblado, computados resueltos — se fabrica, no se edita" },
  "marcadores": {
    "{{ version:ruta }}": "version del module.json o package.json de esa ruta (sin espacios en el uso real)",
    "{{ tests:glob }}": "nº de ficheros de test que casan el glob",
    "{{ count:glob }}": "nº de rutas que casan el glob"
  },
  "invariantes": [
    "marcador irresoluble → ⚠COMPUTADO_ROTO visible + exit 1 (jamás silencio)",
    "PR que toca fuentes de una rebanada sin tocar la rebanada → el check lo canta (empujón como comentario)",
    "fase TESTIGO primero (stale = warning); el freno (required check) se gradúa después — patrón OFF→ON",
    "un solo writer del doc: git. Cualquier otro plano (runtime, VPS) es READER por deploy"
  ]
}
```

## Las 4 piezas a copiar (implementación canónica de este repo)

```
scripts/cabecera/doc-sync.js             MOTOR: frontmatter + glob→regex + marcadores + catálogo + ensamblado
scripts/cabecera/validate-cabecera.js    VIGILANTE: errores duros (frontmatter/marcadores) + testigo (stale/huérfanos/fuentes muertas) · --diff BASE · --json
scripts/cabecera/rebanar.js              MIGRADOR (una vez): corta el monolito por headings `# ` según un mapa JSON
.github/workflows/cabecera-check.yml     + cabecera-ensamblar.yml + cabecera-pulso.yml (los tres órganos)
```

Los scripts son JS puro sin dependencias (Node ≥ 18). Puntos de adaptación por repo:

```
doc-sync.js    CABECERA_DIR  (default arquitectura/cabecera — cámbialo si el repo usa otro hogar)
               TESTS_DIR     (default tests/unit — donde viven los tests para {{ tests:glob }})
               nombres de artefactos (CLAUDE.md / CLAUDE.full.md → AGENTS.md, README rector, etc.)
validate-...   la sección "huérfanos" busca modules/**/module.json — en un repo sin módulos,
               retírala o apúntala a la unidad equivalente (packages/*/package.json en un monorepo)
workflows      branches (main), cron del pulso, y el nombre del check si se gradúa a required
```

## Pasos (receta)

```
0. INVENTARIO   grep -n '^# ' DOC.md → las juntas de corte. Decide qué sección es _persona
                (lo que NO envejece: identidad, principios, criterio) — eso va al doc fino.
1. MAPA         escribe el mapa de migración (ver scripts/cabecera/mapa-migracion.enki.json):
                por sección → { match: prefijo del heading, archivo, dominio, resumen (1 línea
                para el catálogo), fuentes: [globs del código que la sección DESCRIBE] }.
                Las fuentes son EL corazón: sin ellas no hay vigilancia. Sé específico
                (modules/x/**), evita el glob-océano (src/** en todo).
2. REBANAR      node scripts/cabecera/rebanar.js --doc DOC.md --mapa <mapa> --out <dir-rebanadas>
                → rebanadas con frontmatter + _orden.json. Escribe _mandato.md (los 4 mandatos
                de trabajo — copia el de este repo y ajusta rutas).
3. MARCADORES   convierte a {{ version:... }} SOLO las afirmaciones de versión/recuento VIVAS
                (no las históricas: "en v0.2.0 se añadió X" es historia, se queda). Quirúrgico.
4. MOTOR        copia doc-sync.js + validate-cabecera.js, ajusta constantes, y:
                node scripts/cabecera/doc-sync.js --ensamblar   → DOC fino + DOC.full.md
                node scripts/cabecera/validate-cabecera.js       → 0 errores; revisa huérfanos
5. ROUND-TRIP   diff DOC.full.md vs el original (ignorando vacías y ---): las únicas
                diferencias legítimas son marcadores resueltos y contenido nuevo. Si hay
                pérdida de texto → el mapa cortó mal; corrige antes de seguir.
6. ÓRGANOS      copia los 3 workflows. El check nace en TESTIGO (no bloquea). Prueba:
                abre un PR que toque una fuente sin tocar su rebanada → debe llegar el comentario.
7. TEST + SELLO test unitario del motor (copia tests/unit/cabecera__doc-sync.test.js),
                npm scripts (cabecera:ensamblar / validate:cabecera), y la rebanada META
                (cupulas/cabecera.md de este repo como plantilla) documentando la cúpula misma.
8. GRADUAR      cuando ruede limpio unas semanas: branch protection → cabecera-check required,
                y stale pasa de warning a error. El freno se enciende, no se nace con él.
```

## Guards (P0 — en positivo)

```
MANDATO corte_fiel       : el round-trip del paso 5 pasa ANTES de borrar/adelgazar el monolito
MANDATO fuentes_reales   : toda rebanada técnica declara fuentes; la prosa pura (persona,
                           referencias externas) declara fuentes: [] — legítimo, no vigilado
MANDATO testigo_primero  : ningún repo estrena la cúpula con el freno duro puesto; primero
                           semanas de warnings para calibrar fuentes (ruido = fuentes mal cortadas)
MANDATO un_solo_writer   : los artefactos generados llevan el aviso NO EDITAR; quien edite
                           el generado lo pierde en el siguiente ensamblado (por diseño)
```

## Filosofía

Una sola línea: el mismo salto que del mandato al reflejo — la frescura deja de vivir en la
memoria de alguien y pasa a vivir en la máquina; a la prosa le queda lo único que merece
mano humana, el porqué.
