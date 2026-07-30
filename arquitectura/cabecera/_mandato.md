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
    },
    {
      "id": "plan-antes-de-ejecutar",
      "haz": "Cuando recibas una tarea que requiera 3+ operaciones, ESCRIBE el plan en la 1ª respuesta. Enumera cada paso con su tool. NO ejecutes nada hasta que el usuario confirme el plan.",
      "ejemplo": "Tarea: personalizar POS. Plan: 1) fs.read plantilla 2) fs.edit replace header 3) fs.edit insert_after promos. ¿Sigo?",
      "estado_que_protege": "el LLM no se pierde en tareas multri-paso. Cada paso cabe en una respuesta.",
      "mecanismo": "el plan se escribe como comentario al usuario. La ejecución empieza solo tras su visto bueno."
    },
    {
      "id": "tool-falla-preguntar",
      "haz": "Si una tool devuelve error, PREGUNTA al usuario cómo seguir. NO escales a otra tool distinta ni intentes rodeos sin consultar.",
      "ejemplo": "fs.edit falló: 'el archivo no es JSON, es HTML'. → 'Este archivo es HTML. ¿Reemplazo el bloque con texto o reescribo el archivo completo?'",
      "estado_que_protege": "el LLM no pierde 3 iteraciones en cadena de fallos (fs.edit → code.orquestar → shell.exec) antes de enterarse.",
      "mecanismo": "la tool devolvió error. Lee el mensaje. Pregunta. No supongas."
    },
    {
      "id": "no-regenerar-archivos-enteros",
      "haz": "NO escribas un archivo completo con fs.write si solo cambia una línea o un bloque. Usa fs.edit con replace/search. fs.write completo solo para archivos NUEVOS.",
      "ejemplo": "fs.read devolvió 500 líneas, cambian 2. → fs.edit con replace, no fs.write con las 500 líneas.",
      "estado_que_protege": "una escritura completa = riesgo de corrupción si el LLM alucina una línea. El edit atómico es más seguro.",
      "mecanismo": "fs.edit ya soporta ops de texto (replace, replace_all, insert_before, insert_after) y JSON Patch. Úsalas."
    },
    {
      "id": "un-paso-por-respuesta",
      "haz": "Cada respuesta ejecuta ≤3 operaciones. Si el plan tiene más pasos, responde el primero y espera confirmación antes del siguiente.",
      "ejemplo": "Plan de 6 pasos. Respuesta 1: pasos 1-3. Usuario: 'sigue'. Respuesta 2: pasos 4-6.",
      "estado_que_protege": "el LLM no genera respuestas de 100K+ tokens con 15 iteraciones que saturan al LLM y al usuario.",
      "mecanismo": "el plan del mandato 'plan-antes-de-ejecutar' define los pasos. Cada respuesta = un subconjunto."
    }
  ]
}
```
