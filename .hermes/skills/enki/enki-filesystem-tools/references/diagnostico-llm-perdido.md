# Diagnóstico: LLM pierde el hilo en tareas complejas

Síntoma observado en nonina (conv "5") y Regalos (conv "3") simultáneamente.

## Patrón común

1. El LLM recibe una tarea multi-paso (crear/modificar POS, editar HTML/JS)
2. Intenta TODO en una sola respuesta masiva (60-150K tokens)
3. Tools fallan en cascada: fs.edit → code.orquestar → shell.exec
4. El LLM escala el approach en vez de simplificar o preguntar
5. Respuestas de 85s-17min, con 4-15 iteraciones por turno

## Causa raíz: no hay tool para editar texto plano

El módulo filesystem expone herramientas que cubren:
- JSON (fs.edit con JSON Patch)
- Archivo completo (fs.write — riesgoso)
- Append (fs.append — solo al final)

Pero ninguna permite editar una línea en medio de un HTML/JS de forma declarativa.

## Solución propuesta

Añadir find/replace en texto a `handleEdit` cuando el contenido no es JSON:

```javascript
// Si no es JSON, tratar patches como find/replace en texto
if (!esJSON) {
  for (const patch of patches) {
    content = content.replace(patch.path, patch.value);
  }
}
```

## Ejemplo real (nonina, conv "5")

```json
{
  "name": "fs.edit",
  "args": {
    "path": "/www/carta.html",
    "patches": [{"op": "replace", "path": "/_duplicate_fix", "value": ""}]
  },
  "result_status": "error",
  "error_code": "INVALID_INPUT",
  "error_message": "File is not valid JSON: Unexpected token '<'"
}
```

El LLM intentó aplicar JSON Pointer (`/_duplicate_fix`) sobre HTML. Tras fallar,
probó `code.orquestar` (también falló) y finalmente `shell.exec` con Node.js.
