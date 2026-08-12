---
name: enki-filesystem-tools
description: >-
  Cómo funciona el módulo filesystem de Enki: fs.edit solo trabaja con JSON
  (JSON Patch RFC 6902), la cascada de fallo del LLM al editar HTML/JS,
  y las tools disponibles para manipulación de archivos.
when-to-use: >-
  Cuando el LLM falla al editar archivos (fs.edit devuelve INVALID_INPUT),
  cuando hay que diagnosticar por qué el LLM escala de approach, o cuando
  se necesita manipular archivos no-JSON (HTML, JS, CSS, TXT) en Enki.
tags: [enki, filesystem, fs.edit, herramientas, debugging]
---
# Enki Filesystem Tools

> Comportamiento del módulo filesystem y cómo las herramientas interactúan
> con el LLM.

## fs.edit — Solo JSON (JSON Patch RFC 6902)

`handleEdit` en `modules/filesystem/index.js` (línea 879):
- Lee el archivo, hace `JSON.parse(currentContent)` (línea 925)
- Si falla el parse → `INVALID_INPUT: "File is not valid JSON"`
- Aplica las 6 operaciones JSON Patch: add, remove, replace, move, copy, test
- Escribe atómicamente con `_atomicWriteFile`

**⚠️ No funciona con HTML, JS, CSS, TXT ni ningún formato que no sea JSON.**

## Cascada de fallo típica del LLM

Cuando el LLM necesita modificar un HTML/JS e intenta `fs.edit`:

```
1. fs.edit        → INVALID_INPUT ("File is not valid JSON")    ❌
2. code.orquestar → EXEC_FAILED ("storage.read returns null")   ❌
3. shell.exec     → OK (Node.js text manipulation)              ✅
```

El LLM escala porque no tiene una herramienta declarativa para editar texto plano en medio de un archivo.

## Tools de filesystem disponibles

| Tool | Sirve para | Limitación |
|------|-----------|------------|
| `fs.write` | Escribir archivo completo | Riesgo de perder datos si el LLM alucina |
| `fs.read` | Leer archivo | Solo lectura |
| `fs.edit` | JSON Patch sobre JSON | Solo archivos JSON |
| `fs.append` | Añadir al final | Solo al final, no edita en medio |
| `fs.delete` | Eliminar archivo/carpeta | Destructivo (pide confirmación) |
| `fs.list` | Listar directorio | Solo listado |
| `fs.search` | Buscar en archivos | Solo búsqueda |

## Scope de escritura: storage del proyecto vs SISTEMA (el productor)

El filesystem NO escribe en cualquier sitio: cada petición se resuelve contra el storage
del proyecto activo (o el `project_id` de la petición). Solo el proyecto "system"
(systemMode) o el prefijo `@/` acceden al data root; cualquier path fuera del
allowedRoot → PERMISSION_DENIED.

**Pitfall — `project_id` NO registrado en el filesystem**: si escribes vía
`ui/request/fs/write` con un project_id que el filesystem no reconoce como proyecto
(recién creado por `project.create`, sin chat/índice), NO falla: **cae al storage del
proyecto activo con el project_id como subdirectorio**. Ejemplo real: escribir
`storage/esquemas/esquema.md` con `project_id: 'motor'` acabó en
`/opt/enki/data/projects/c/storage/motor/esquemas/esquema.md` (status 200, hash
válido — el éxito del response NO garantiza la ruta). Tras un fs.write UI, verificar
la ruta final con `find /opt/enki/data/projects -name <archivo> -newermt <fecha>`.

**Consecuencia (lección en vivo):** un AGENTE o el CHAT con fs scopeado al storage del
proyecto NO puede escribir en `modules/` del sistema. El agente de FASE 5
(escribir-skills) usaba fs.write para crear `modules/cosecha/cantera/enki/<slug>/SKILL.md`,
reportó success (96s) y la skill NO existía en ningún sitio — ni en modules/, ni en el
storage del proyecto, ni en el repo. Un "success" de agente no prueba el entregable.

**La única vía a `modules/` es `productor-modulos` (single-writer, con el interruptor
'productor-modulos.habilitado'):**
- `productor.producir { nombre, module_json, index_js }` → módulos en `modules/<nombre>/`
  (valida API real: _shared, _atender 4 args, this.name/version)
- `productor.skill { nombre, markdown }` → skills en la cantera
  `modules/cosecha/cantera/enki/<nombre>/SKILL.md` (201 verificado; valida frontmatter
  con `name:`; markdown ≥100 chars)

Regla: si el entregable vive en `modules/`, el agente lo escribe con el productor y NO
afirma éxito sin el **201**. El gate del orquestador (proceso-negocio.completar_fase)
verifica en el filesystem del SISTEMA + git ls-files (el deploy rsync --delete borra lo
no commiteado) — nunca se fía del reporte del agente.

## motor-coherencia

El `motor-coherencia` (Rust, MQTT :1883) intercepta `fs.write.request` por el bus.
NO intercepta escrituras internas de `fs.edit`, que escribe directamente por
`_atomicWriteFile`. Por tanto, `fs.edit` sortea al juez de coherencia.

## Código fuente

- Módulo: `modules/filesystem/index.js` (v2.3.0, ~1880 LOC)
- Tool definitions: `modules/filesystem/module.json`
- Tests: `tests/unit/filesystem.test.js`
- Rebanada: no hay rebanada específica — filesystem está en `modulos/grupo-*`
  de `arquitectura/cabecera/`

## Síntoma rápido: ¿es un problema de fs.edit?

Si ves en metadata de una respuesta del LLM:
- `fs.edit` → `result_status: "error"`, `error_code: "INVALID_INPUT"`
- El mensaje contiene `"File is not valid JSON"`
- El path del archivo termina en `.html`, `.js`, `.css`, `.txt`, `.md`

→ Es el problema de JSON Patch sobre texto plano. La solución es añadir
find/replace en texto a `handleEdit`, o que el LLM use `fs.write` con el
archivo completo.
