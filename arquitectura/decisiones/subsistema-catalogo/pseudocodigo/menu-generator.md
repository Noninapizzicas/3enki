# `menu-generator` — pseudocódigo (semilla v2)

> **Naturaleza:** módulo **blueprint-driven** (`blueprint_driven: true`). NO es una clase JS: es un
> blueprint declarativo que el LLM ejecuta como runtime usando 2 tools universales
> (`bus.publish`, `bus.publishAndWait`). El "OOP" aquí es el **contrato de la operación** + sus
> **normalizadores**, no una jerarquía de clases.
>
> **Delta v8 → v2-enriquecida:** mismo rol (generador puro), pero la operación `generar` gana
> **dos pasos en el origen**: normalizar **id canónico** de cada ingrediente y **clasificar su familia**.
> Eso hace robusto el enlace por id (D1) y mata el `slugify` en runtime de aguas abajo.

## Rol y contrato

```
ROL: generador PURO. Input = texto libre (pegado/dictado) o JSON parcial.
     Output = carta JSON conforme a schemas/carta-pizzepos.v2.schema.json.
     NO persiste: delega en carta-manager (publish 'carta.creada'). Separación generar ≠ guardar.

NO HACE: precio_extra (lo posee ingredientes) · vista por familia (variaciones) ·
         precio por canal (tarifas) · OCR de PDF/imagen (fuera de scope).
```

## Operación `generar` (pseudocódigo)

```
async generar(input):                    # input: { project_id, nombre, texto? | json?, correlation_id? }
  # 1. PRECONDICIONES
  if !input.project_id:                 return INVALID_INPUT { field:'project_id' }
  if !input.nombre?.trim():             return INVALID_INPUT { field:'nombre', hint:'pregúntalo antes' }
  if !input.texto && !input.json:       return INVALID_INPUT { hint:'pasar texto O json' }

  publish('menu.generation.progress', { project_id, nombre, step:'structuring', correlation_id })

  # 2. ESTRUCTURAR (el LLM razona; reglas → ver Normalizadores)
  categorias ← extraer_categorias(input)               # títulos/secciones → {id:slug, nombre, orden}
  productos  ← extraer_productos(input)                 # cada uno → {id:slug, nombre, categoria, precio_base, ingredientes[]}

  # 3. ENRIQUECER LA SEMILLA (lo nuevo de v2) — por cada ingrediente de cada producto:
  PARA prod EN productos:
     PARA ing EN prod.ingredientes:
        ing.nombre  ← normalizar_nombre(ing.nombre)     # ortografía canónica (corrige typos)
        ing.id      ← id_canonico(ing.nombre)           # slug determinista estable → enlace por id
        ing.familia ← clasificar_familia(ing.nombre)    # 'queso' | 'verdura' | 'carne' | 'salsa' | ...
        # emoji opcional (ayuda visual del POS)
     prod.id ← prod.id ?? id_canonico(prod.nombre)
     # tiene_variaciones: NO se fija aquí salvo excepción explícita (lo deduce el consumidor:
     # ingredientes.length>0). Solo se escribe si el operador pide forzar entero/partido.

  # 4. ARMAR LA CARTA v2 (conforme al schema)
  carta ← {
    meta: { id:'carta_'+slug(input.nombre), nombre:input.nombre, generado_desde:'texto', created_at:nowISO() },
    categorias, productos
  }
  if !valida(carta, 'carta-pizzepos.v2'): return INVALID_INPUT { detalle: errores_de_schema }

  # 5. DELEGAR PERSISTENCIA (emite y desentiende — carta-manager es el dueño del diseño)
  publish('carta.creada', { project_id:input.project_id, carta, correlation_id:input.correlation_id })
  return { status:'ok', data:{ carta_id: carta.meta.id, productos: productos.length } }
```

## Normalizadores (las reglas que el LLM aplica)

```
normalizar_nombre(s):                    # ortografía canónica antes de derivar el id
  ▸ el LLM corrige el typo a la forma conocida: "mozarella" → "Mozzarella"
  ▸ singular/plural y mayúsculas se unifican a una forma de display estable

id_canonico(nombre):                     # DETERMINISTA → mismo nombre ⇒ mismo id, sin pull
  ▸ slug = lower(strip_acentos(nombre)) ; espacios→'_' ; quitar no [a-z0-9_]
  ▸ ej: "Mozzarella" → 'mozzarella' · "Tomate seco" → 'tomate_seco'
  # como el nombre ya viene normalizado (paso anterior), dos cartas distintas dan el MISMO id.

clasificar_familia(nombre):              # el LLM clasifica en el catálogo de familias conocidas
  ▸ familias canónicas del proyecto: queso, verdura, carne, salsa, pescado, fruta, extra, condimento, otro
  ▸ si no encaja en ninguna → 'otro' (ingredientes/variaciones pueden re-clasificar después)
  # menu-generator PROPONE la familia; la AUTORIDAD final es ingredientes (puede corregirla).
```

## Eventos + salida

```
PUBLICA:
  menu.generation.progress   (feedback UX intermedio)
  menu.generation.failed     (cierre en error — no_silent_failures)
  carta.creada               { project_id, carta(v2), correlation_id }   → carta-manager lo persiste

SALIDA (return): { status:'ok', data:{ carta_id, productos } }   — respuesta inmediata; la persistencia
                  va por evento (fire-and-forget), no se espera ack de carta-manager.
```

## Edge cases

```
· nombre ausente            → INVALID_INPUT (el LLM lo pregunta antes de invocar)
· ni texto ni json          → INVALID_INPUT
· ingrediente sin familia clara → familia='otro' (no se inventa una nueva sin criterio)
· typo en ingrediente       → normalizar_nombre lo corrige ANTES del id → no se crea id duplicado
· producto sin ingredientes → válido (será 'entero' por defecto: ingredientes.length==0)
· carta no valida contra schema → INVALID_INPUT con errores; NO se publica carta.creada
· input.json parcial        → se valida y se rellenan campos faltantes (ids, orden, familias) igual que texto
```

## Encaje

- **Salida:** `schemas/carta-pizzepos.v2.schema.json` (la semilla de la que todo deriva).
- **Aguas abajo:** `carta-manager` (consume `carta.creada`, persiste). Luego `ingredientes` deriva su
  catálogo por **id** y posee `precio_extra`; `variaciones` deriva la vista por familia.
- **Decisión que materializa:** D1 (semilla enriquecida, enlace por id, familia en origen).

## Nota de aterrizaje (vs código actual)

`menu-generator` v8 produce ingredientes `{nombre, emoji}` y delega el id/familia aguas abajo
(slugify en runtime de `productos`). El cambio v2 es **mover esos dos pasos al origen** dentro de
`generar` (pasos 3 de arriba). No cambia el rol ni el patrón blueprint; añade dos normalizadores.
