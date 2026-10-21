# Esquema — The Pirate como sistema visual

## Árbol completo

```
The Pirate (identidad visual)
│
├── [IDENTIDAD]
│   ├── ATÓMICO  Rol: Escenario (#0D0D0D)           reflejo
│   ├── ATÓMICO  Rol: Tesoro (#D4A537)               reflejo
│   ├── ATÓMICO  Rol: Pergamino (#F5E6C8)            reflejo
│   ├── ATÓMICO  Rol: Profundidad (#2d2d2d)          reflejo
│   ├── ATÓMICO  Rol: Susurro (#6B6B6B)              reflejo
│   ├── ATÓMICO  Rol: Trazo (#E5E5E5)                reflejo
│   ├── ATÓMICO  Voz de impacto (Playfair Display)   reflejo
│   ├── ATÓMICO  Voz de lectura (Inter)              reflejo
│   ├── ATÓMICO  Progresión de escala (ratio)        reflejo
│   ├── ATÓMICO  Respiración sección                 reflejo
│   ├── ATÓMICO  Respiración card                    reflejo
│   ├── ATÓMICO  Respiración elemento                reflejo
│   ├── ATÓMICO  Respiración micro                   reflejo
│   ├── ATÓMICO  Factor respiración global           reflejo
│   ├── ATÓMICO  Escalera de luminosidad             conversor
│   ├── ATÓMICO  Dirección de elevación              reflejo
│   ├── ATÓMICO  Bordes entre planos                 reflejo
│   └── ATÓMICO  Tono emergente (CONVERGENTE)        reflejo
│
├── [RESTRICCIONES]
│   ├── ATÓMICO  Contraste accesible                 puente
│   ├── ATÓMICO  Escala adaptable                    puente
│   ├── ATÓMICO  Regla de acento escaso              custodio
│   └── ATÓMICO  Regla de dramatismo                 custodio
│
├── [CONTRATO]
│   ├── REF      Roles cromáticos → §A pasada 2
│   ├── REF      Roles tipográficos → §B pasada 2
│   └── REF      Roles espaciales → §C pasada 2
│
├── [NO-OBJETIVOS]
│   ├── ATÓMICO  Marco vs Contenido                  puente
│   └── ATÓMICO  Sensación vs Interacción            puente
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
        · ¿Cara trabajo: pirata sutil o funcional pura?
        · ¿Sello: superficie o marca de agua?
        · ¿Pergamino: superficie real o solo texto?
        · ¿Dramatismo: hasta dónde en Lorca?
        · ¿Movimiento: pesado-pirata o rápido-tech?
```

> ⚠ Las 4 dimensiones (cromático × tipográfico × respiración × superficie) NO son
> ramas independientes — convergen en **Tono emergente**. El árbol las lista como hojas
> del mismo nivel porque cada una es atómica, pero su VALOR solo se verifica en conjunto.

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 24 |
| ATÓMICAS (con forma) | 20 |
| REF (deduplicadas) | 3 |
| [ABIERTO] | 1 (5 preguntas del dueño) |
| SPAWN | 0 (convergió) |

## Reparto de formas

| Forma | Cantidad | % |
|---|---|---|
| reflejo | 16 | 67% |
| conversor | 1 | 4% |
| custodio | 2 | 8% |
| puente | 4 | 17% |
| micro-agente | 0 | 0% |

## Lectura del esquema

**Cero micro-agentes.** La identidad visual de una marca NO necesita fuzzy — es dato
del dueño, fórmula pura, o guarda. No hay IA decidiendo qué color usar; el dueño ya
decidió. Esto confirma que el intermediario TypeScript (PielJSON + skin-engine) era
un **conversor innecesario** entre datos planos y propiedades de presentación.

**67% reflejo = copia directa.** Dos tercios de la identidad visual son valores
literales que van del dato de marca a la propiedad de presentación sin transformación.
El "engine" sobra: el dato YA ES la propiedad.

**1 conversor (4%).** Solo la escalera de luminosidad necesita una fórmula: escalar L
en oklch para generar superficies. Todo lo demás es asignación directa.

**4 puentes (17%).** Los puntos donde la identidad toca el exterior (contraste, viewport,
contenido, interacción) son PUERTOS ABIERTOS — el adaptador los resuelve, no la identidad.

## Aterrizaje

El aterrizaje de estos átomos es **directo a propiedades de presentación** [PUERTO ABIERTO]:
- 16 reflejos → 16 asignaciones directas (dato → propiedad)
- 1 conversor → 1 fórmula (color base + paso → N superficies)
- 2 custodios → 2 reglas de verificación (no generan, comprueban)
- 4 puentes → 4 adaptadores (contraste, viewport, contenido, interacción)

El adaptador concreto (CSS, tokens de diseño, variables de otro sistema) lo decide
el sitio donde aterriza. Ver `aterrizaje-css.css` para el aterrizaje en CSS.
