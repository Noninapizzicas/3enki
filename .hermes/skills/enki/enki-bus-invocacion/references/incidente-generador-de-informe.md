# El incidente generador-de-informe (2026-08-07) — lecciones de pipeline

Qué pasó en vivo tras el deploy de F6/F6½/F7: el pipeline `construir-modulos`
terminó pero el JEFE rechazó el entregable (`ENTREGABLE_NO_VERIFICADO` con
`api_real: false`). El chat ofreció dos vías (A: reintentar el pipeline;
B: `productor.producir` que valida antes de escribir). El diagnóstico reveló
DOS fallos distintos, ambos corregidos en el fix #159.

## Fallo 1: la instrucción del pipeline enseñaba una firma inventada

`construir-modulos.json` (paso fuzzy) pedía:

```
_atender(evento, contexto, respuesta, siguiente)
```

El patrón REAL del bus (en `modules/_shared/modulo-hibrido-reflejo.js` y en
módulos vivos como `pizzepos/recetas/index.js`):

```js
const BaseModule = require('../../_shared/base-module');  // o ../_shared/modulo-hibrido-reflejo
class X extends BaseModule {
  constructor() { super(); this.name = 'x'; this.version = '0.1.0'; }
  onListarRequest(e) { return this._atender(e, 'listar', 'x.listar.response', d => this._listar(d)); }
}
```

El verificador `api_real` (regex en `modules/_shared/motor/verificador.js`) exige
`_shared` + `_atender` con 4 args genéricos (`\w+, \w+, \w+, \w+`). La firma
inventada pasaba el regex SÓLO si el LLM la reproducía literal; con cualquier
variación, fallaba.

**Lección:** la instrucción del pipeline referencia el código REAL (ruta de la
base + un módulo vivo de ejemplo), nunca una firma de memoria. Instrucción y
verificación deben coincidir.

## Fallo 2: el LLM devolvió su propio transcript como "código"

El archivo escrito en `modules/generador-de-informe/index.js` (965 chars, 13
líneas) era:

```xml
<tool_thinking>
Necesito construir el módulo generador-de-informe. Primero debo entender...
</tool_thinking>

<tool_calls>
<invoke name="bus.publishAndWait">
<parameter name="event" string="true">rpc.buscar.request</parameter>
</invoke>
</tool_calls>
```

Pasó `tamano_min: 200` (965 > 200) — la validación de tamaño no detecta basura
de transcript. El JEFE lo rechazó, pero el archivo quedó en disco.

**Fix:** regla `sin_transcript: true` en `modules/_shared/motor/validador.js` —
regex que rechaza `<tool_thinking>`, `<tool_calls>`, `<invoke`, `</thinking>`
antes de escribir. Declarada en el paso fuzzy de `construir-modulos`:
`valida: { tamano_min: 200, sin_transcript: true }`.

Verificación del fix:
```bash
node -e "const {validar}=require('./modules/_shared/motor/validador');
validar({content: '<tool_calls>…'}, {tamano_min:200, sin_transcript:true})"
# → {ok:false, regla:'sin_transcript'}
```

Test añadido en `modules/_shared/motor/test.js` (28 tests, antes 26).

## PITFALL de permisos: la basura de www-data no se borra sin sudo

Los archivos escritos por el motor (www-data) en el repo quedan
`-rw-r--r-- www-data www-data` — admin no puede `chmod`/`rm` sin sudo. No
bloquean commits (untracked, fuera del `git add` si se usa `git add <ruta>`),
pero ensucian el working tree. Limpiar con `sudo rm -rf` en repo local Y
`/opt/enki/modules/<slug>`.

## Cómo se diagnosticó (el camino)

1. El chat narró "el agente falló" — la causa real estaba en el log y en la
   bitácora (`data/projects/<UUID>/storage/agentes/bitacoras/<request_id>.json`).
2. El veredicto del JEFE señaló exactamente qué regla falló: `api_real` con
   `usa _shared: false, _atender 4 args: false`.
3. Leer el archivo escrito reveló el transcript (basura) — no era solo un
   patrón mal cumplido, era contenido equivocado.
4. Verificar la base real (`modulo-hibrido-reflejo.js`, `pizzepos/recetas`)
   mostró la firma correcta que la instrucción no enseñaba.
