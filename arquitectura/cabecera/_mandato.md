# CATÁLOGO DE LA CABECERA — léela por rebanadas

> Este CLAUDE.md es FINO a propósito: lleva la persona (que no envejece) y este catálogo.
> La sustancia técnica vive en `arquitectura/cabecera/**` — una rebanada por subsistema,
> con frontmatter (`dominio`, `fuentes`, `verificado`). El monolito completo existe como
> artefacto generado en `CLAUDE.full.md` (no lo edites: se fabrica).

**Mandatos de trabajo (P0 — en positivo):**

1. **Antes de tocar un subsistema, `Read` su rebanada** — el catálogo de abajo dice cuál.
   Es el patrón cajones: catálogo barato siempre, contenido caro bajo demanda.
2. **El PR que cambia código cubierto por `fuentes` actualiza su rebanada en el mismo PR**
   (o sella `verificado:` si la conducta no cambió). El check `cabecera-check` lo canta si se olvida.
3. **Los números se computan, no se escriben**: usa marcadores `{{ version:modules/x }}`,
   `{{ tests:glob }}`, `{{ count:glob }}` (sin espacios en el uso real) — `doc-sync` los resuelve al ensamblar.
4. **Rebanada nueva** = fichero en `arquitectura/cabecera/<dominio>/` + entrada en `_orden.json`.
