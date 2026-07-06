---
id: patron/opciones-universal
dominio: patron
resumen: Opciones: configuración universal de producto (ELEGIR_UNO/VARIOS/QUITAR) — banco motor-opciones, gate pizzepos cerrado.
fuentes:
  - modules/_shared/motor-opciones.js
verificado: 2026-07-06
---

# AVANZADILLA — Subsistema `Opciones` (configuración universal de producto)

> NO IMPLEMENTAR · gate: pizzepos cerrado. El nombre `variaciones` se queda; lo que migra es la operativa (contrato + clases de abajo). Banco: `modules/_shared/motor-opciones.js` · `tests/unit/shared__motor-opciones.test.js`.

## Contrato genérico (JSON Schema) — `producto.opciones`

```json
{
  "$id": ".../producto-opciones.schema.json",
  "Opcion": {
    "type": "object",
    "required": ["id", "etiqueta", "modo", "valores"],
    "properties": {
      "id":        { "type": "string", "pattern": "^[a-z0-9_]+$" },
      "etiqueta":  { "type": "string", "minLength": 1 },
      "modo":      { "enum": ["ELEGIR_UNO", "ELEGIR_VARIOS", "QUITAR"] },
      "requerido": { "type": "boolean", "default": false },
      "min":       { "type": "integer", "minimum": 0, "default": 0 },
      "max":       { "type": "integer", "minimum": 1 },
      "valores":   { "type": "array", "minItems": 1, "items": { "$ref": "#/Valor" } }
    },
    "x-consumido-por": ["motor-opciones", "vista-opciones", "carta-digital"],
    "x-llenado-por": "menu-generator (contrato)"
  },
  "Valor": {
    "type": "object",
    "required": ["id", "etiqueta", "delta_precio_centimos"],
    "properties": {
      "id":                    { "type": "string" },
      "etiqueta":              { "type": "string", "minLength": 1 },
      "emoji":                 { "type": "string" },
      "ref":                   { "type": "string", "description": "id del recurso subyacente: ingrediente_id · color_id · material_id" },
      "delta_precio_centimos": { "type": "integer", "description": "+50 = +0,50€ · 0 · puede ser negativo" },
      "disponible":            { "type": "boolean", "default": true }
    }
  }
}
```

## Clases (pseudocódigo tipado)

```
ENUM Modo        { ELEGIR_UNO, ELEGIR_VARIOS, QUITAR }
ENUM TipoControl { SELECTOR_UNICO, MULTI_ADITIVO, LISTA_TACHABLE }

VALUE_OBJECT Valor {                          // inmutable — una elección posible
  id : String ; etiqueta : String ; emoji : Optional<String>
  ref : Optional<String>                       // ingrediente_id | color_id | ...
  deltaCentimos : Int ; disponible : Boolean
}
VALUE_OBJECT Opcion {                          // inmutable — una DIMENSIÓN de elección
  id : String ; etiqueta : String
  modo : Modo ; requerido : Boolean
  min : Int ; max : Optional<Int>
  valores : List<Valor>
  valor(id): Optional<Valor>
}
VALUE_OBJECT Seleccion {                        // lo que el cliente eligió en UNA opción
  opcionId : String
  valorIds : Set<String>                        // ELEGIR_UNO→0..1 · ELEGIR_VARIOS→0..max · QUITAR→0..N
}
VALUE_OBJECT Resultado { valida : Boolean ; motivo : Optional<String> ; deltaCentimos : Int }

// ── Strategy: una regla por modo (validar + preciar + cómo se pinta) ──
INTERFAZ ReglaModo {
  validar(o: Opcion, s: Seleccion): Resultado   // cardinalidad + pertenencia + disponibilidad
  preciar(o: Opcion, s: Seleccion): Int          // céntimos
  control(): TipoControl
}
CLASE ReglaElegirUno IMPLEMENTA ReglaModo {
  validar(o, s):
    n ← s.valorIds.size
    SI o.requerido Y n ≠ 1  : RETORNA Resultado(false, "elige una opción de «"+o.etiqueta+"»")
    SI !o.requerido Y n > 1 : RETORNA Resultado(false, "solo una en «"+o.etiqueta+"»")
    guardaPertenenciaYStock(o, s) ; RETORNA Resultado(true, ·, preciar(o,s))
  preciar(o, s): Σ o.valor(id).deltaCentimos PARA id EN s.valorIds
  control(): SELECTOR_UNICO
}
CLASE ReglaElegirVarios IMPLEMENTA ReglaModo {
  validar(o, s):
    n ← s.valorIds.size ; max ← o.max ?? ∞
    SI n < o.min : RETORNA Resultado(false, "mínimo "+o.min+" en «"+o.etiqueta+"»")
    SI n > max   : RETORNA Resultado(false, "máximo "+max+" en «"+o.etiqueta+"»")
    guardaPertenenciaYStock(o, s) ; RETORNA Resultado(true, ·, preciar(o,s))
  preciar(o, s): Σ o.valor(id).deltaCentimos PARA id EN s.valorIds
  control(): MULTI_ADITIVO
}
CLASE ReglaQuitar IMPLEMENTA ReglaModo {
  validar(o, s): guardaPertenencia(o, s) ; RETORNA Resultado(true, ·, preciar(o,s))   // solo lo de la base
  preciar(o, s): Σ o.valor(id).deltaCentimos PARA id EN s.valorIds                      // normalmente 0
  control(): LISTA_TACHABLE
}

// ── Servicio de dominio: el MOTOR (genérico, sin saber de comida ni moda) ──
CLASE MotorDeOpciones {
  reglas : Map<Modo, ReglaModo>                  // DI por constructor
  evaluarOpcion(o: Opcion, s: Seleccion): Resultado
    RETORNA reglas[o.modo].validar(o, s)
  evaluarProducto(p: Producto, sels: Map<opcionId, Seleccion>): ResultadoProducto   // Composite
    errores ← [] ; extra ← 0
    PARA o EN p.opciones:
        s ← sels[o.id] ?? Seleccion(o.id, {})
        r ← evaluarOpcion(o, s)
        SI !r.valida : errores.add(r.motivo)  SINO : extra += r.deltaCentimos
    RETORNA ResultadoProducto(valida: errores.vacío, errores, precioFinalCentimos: p.precioBaseCentimos + extra)
}

// ── La VISTA, genérica: Factory de control por modo (un componente, 3 ramas) ──
CLASE VistaDeOpciones {                          // frontend — pinta cualquier producto
  render(o: Opcion):
    SEGÚN reglas[o.modo].control():
        SELECTOR_UNICO  : pintarRadio(o.valores)            // Talla S·M·L
        MULTI_ADITIVO   : pintarChipsConPrecio(o.valores)   // Quesos +0,50
        LISTA_TACHABLE  : pintarTachables(o.valores)        // Sin: cebolla…
}
```
