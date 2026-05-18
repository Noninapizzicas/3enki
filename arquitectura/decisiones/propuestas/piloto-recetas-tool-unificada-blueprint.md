# Idea piloto — `recetas` con tool unificada + blueprint operativo

**Fecha de la idea**: 2026-05-17  
**Origen**: tras audit de recetas v4.0.0, observación de que el catalogo de tools por modulo es fragil al renombrado y dispara crashes cuando el LLM tiene nombres cacheados que ya no existen. Propuesta de pasar de "tools polyfunctional" a "primitivas + blueprint".

## La idea concreta

Convertir el modulo `recetas` (v4.0.0, 14 tools) en un piloto experimental:

1. **Reducir a 1 tool unica** en `module.json`:
   ```json
   {
     "name": "recetas.do",
     "description": "Operacion sobre el aggregate root de recetas. Lee el blueprint del modulo para decidir intent.",
     "parameters": {
       "type": "object",
       "properties": {
         "intent": { "type": "string", "description": "Operacion del dominio (crear, listar, actualizar, ...)" },
         "payload": { "type": "object", "description": "Datos especificos del intent" }
       },
       "required": ["intent", "payload"]
     },
     "handler": "onDo"
   }
   ```

2. **Reescribir `prompt.json` como blueprint operativo completo**:
   - Que hace el modulo (aggregate root, custodio del dato canonico)
   - Catalogo de intents soportados con su semantica
   - Reglas del dominio (estado_operativo, transiciones validas, etc.)
   - Que NUNCA hace (publicar coste, calcular escandallo, etc.)

3. **`onDo` despacha por intent** internamente:
   ```js
   async onDo(args) {
     const { intent, payload } = args;
     switch (intent) {
       case 'crear':            return this._crear(payload);
       case 'listar':           return this._listar(payload);
       case 'cambiar_estado':   return this._cambiarEstado(payload);
       // etc.
       default: return this._errorResponse(400, 'INVALID_INPUT',
         `intent "${intent}" no soportado. Ver blueprint del modulo.`);
     }
   }
   ```

4. **Sin tocar los demas modulos** — solo recetas, para validar el patron.

## Que se prueba

- Si el LLM puede operar con catalogo de tools tiny (1 por modulo) pero blueprint expresivo.
- Si renombrar un intent (en blueprint) sin tocar manifest evita el crash de "tool no encontrada".
- Si la composabilidad gana: el LLM compone intents en cadena con menos friccion.
- Si el coste de tokens / latencia es aceptable.

## Que se monitorea

- Tasa de errores "intent no soportado" vs "tool no encontrada" actual.
- Tokens por interaccion antes/despues.
- Tiempo total de operacion (latencia agentic loop).
- Drift entre blueprint y handlers (si `_crear` cambia y el blueprint no se actualiza, drift detectable).

## Por que NO se hace ahora

El usuario propuso una vision mas amplia tras esta idea (contrato/blueprints/pseudocodigo/clase/JSON como pila coherente). Se decide esperar a captar la vision completa antes de pilotear este sub-cambio, que podria quedar subsumido en un patron mayor.

## Cuando retomar

Cuando se cierre el diseno del patron mas amplio. Si el patron mayor incluye blueprint-driven modules, este piloto es directamente el primer caso. Si el patron mayor va por otro lado, esta nota cierra como descarte razonado.
