# prompt.json — Formato de prompt por modulo

Cada modulo puede incluir un `prompt.json` que define su identidad para el LLM.
El PromptEngine lo lee, lo concatena con el base prompt, y lo envia tal cual.

## Principios

1. **El JSON ES el prompt** — no hay templates, no hay variables, no hay render
2. **Estructura = comprension** — el LLM entiende JSON mejor que prosa libre
3. **Un archivo por modulo** — si el modulo no tiene prompt.json, no participa en AI
4. **Zero config** — el engine lee prompt.json de cada modulo automaticamente

## Formato prompt.json

```json
{
  "role": "Nombre corto del rol",
  "intent": "Que hace este modulo en una frase",
  "capabilities": ["accion 1", "accion 2"],
  "inputs": { "campo": "tipo — descripcion" },
  "outputs": { "campo": "tipo — descripcion" },
  "rules": ["regla 1", "regla 2"],
  "examples": [
    { "user": "pregunta ejemplo", "assistant": "respuesta ejemplo" }
  ],
  "integrations": {
    "events": ["evento.que.escucha"],
    "tools": ["tool.disponible"]
  }
}
```

## Por que JSON y no Markdown

- Los LLMs tokenizian JSON ~30% mas eficiente que markdown con headers
- La estructura es parseable: el engine puede filtrar campos si hay budget
- Compatible con function calling schemas nativamente
- No hay ambiguedad: un campo es un campo, no una seccion con formato libre
