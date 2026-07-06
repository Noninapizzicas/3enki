# CATÁLOGO DE LA CABECERA — léela por rebanadas

> Fuente de verdad: `arquitectura/cabecera/**` — una rebanada por subsistema, con frontmatter
> (`dominio · fuentes · verificado`). El ensamblador fabrica `CLAUDE.md` (fino) y `CLAUDE.full.md`
> desde ellas: edita la rebanada y los artefactos la reflejan.

## Mandatos de trabajo (P0 — toda regla toma forma de acción construible)

```json
{
  "esquema": "mandatos-cabecera-v1",
  "unica_forma": "Mandato — 'haz esto' (la acción construible; el estado deseado que protege va nombrado)",
  "mandatos": [
    {
      "id": "leer-la-rebanada",
      "haz": "LEE (`Read`) la rebanada del subsistema antes de tocarlo — el catálogo de abajo dice cuál",
      "estado_que_protege": "cada cambio nace del contexto vivo de su subsistema",
      "mecanismo": "patrón cajones — catálogo barato siempre en el turno, rebanada cara bajo demanda"
    },
    {
      "id": "rebanada-con-el-pr",
      "haz": "ACTUALIZA la rebanada en el MISMO PR que cambia código cubierto por sus `fuentes` (o SELLA `verificado:` cuando la conducta sigue igual)",
      "estado_que_protege": "la rebanada camina al paso de sus fuentes",
      "mecanismo": "el check `cabecera-check` canta el paso pendiente y lo ofrece como empujón"
    },
    {
      "id": "numeros-vivos",
      "haz": "DECLARA cada número como marcador — `{{ version:modules/x }}` · `{{ tests:glob }}` · `{{ count:glob }}` (sin espacios en el uso real)",
      "estado_que_protege": "todo número refleja el código de su propio commit",
      "mecanismo": "`doc-sync` le da su valor vivo al ensamblar; un marcador sin fuente se muestra como `⚠COMPUTADO_ROTO`"
    },
    {
      "id": "rebanada-nueva",
      "haz": "AÑADE toda rebanada nueva como fichero en `arquitectura/cabecera/<dominio>/` + entrada en `_orden.json`, con sus `fuentes` declaradas",
      "estado_que_protege": "cada subsistema tiene hogar en el catálogo y vigilante de frescura",
      "mecanismo": "`validate-cabecera` ofrece los módulos que aún esperan rebanada"
    }
  ]
}
```
