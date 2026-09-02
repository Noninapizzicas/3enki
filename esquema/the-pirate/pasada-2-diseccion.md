# Disección — The Pirate como sistema visual

Formas asignadas a cada pieza atómica del esquema.

---

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Rol: Escenario (#0D0D0D) | **reflejo** | Dato fijo de la marca. Negro profundo = invariante. |
| 2 | Rol: Tesoro (#D4A537) | **reflejo** | Dato fijo. Oro mate = invariante. |
| 3 | Rol: Pergamino (#F5E6C8) | **reflejo** | Dato fijo. Calidez = invariante. |
| 4 | Rol: Profundidad (#2d2d2d) | **reflejo** | Dato fijo. Fondo hundido = invariante. |
| 5 | Rol: Susurro (#6B6B6B) | **reflejo** | Dato fijo. Neutro medio = invariante. |
| 6 | Rol: Trazo (#E5E5E5) | **reflejo** | Dato fijo. Neutro claro = invariante. |
| 7 | Voz de impacto (Playfair) | **reflejo** | Elección de la marca. Fuente fija. |
| 8 | Voz de lectura (Inter) | **reflejo** | Elección de la marca. Fuente fija. |
| 9 | Progresión de escala | **reflejo** | Un ratio numérico. Determinista. |
| 10 | Respiración de sección | **reflejo** | Un valor multiplicado por el factor global. Determinista. |
| 11 | Respiración de card | **reflejo** | Idem. |
| 12 | Respiración de elemento | **reflejo** | Idem. |
| 13 | Respiración micro | **reflejo** | Idem. |
| 14 | Factor de respiración global | **reflejo** | Un multiplicador escalar. Invariante de la marca. |
| 15 | Escalera de luminosidad | **conversor** | Transforma el color base en N peldaños de superficie escalando L en oklch. Fórmula pura. |
| 16 | Dirección de elevación | **reflejo** | Determinista: base oscura → L sube; base clara → L baja. |
| 17 | Bordes entre planos | **reflejo** | Elección de la marca: sutil, gradiente o nada. |
| 18 | Tono emergente | **reflejo** | Tabla de verificación — no genera, afirma. Un test la comprueba. |
| 19 | Regla de acento escaso | **custodio** | Guarda el oro: ≤3 apariciones por vista. Protege la escasez. |
| 20 | Regla de dramatismo | **custodio** | Guarda el equilibrio: audaz en estructura, sobrio en decoración. |
| 21 | Contraste accesible | **puente** | Conecta la estética (oro sobre negro) con la percepción (ratio legible). |
| 22 | Escala adaptable | **puente** | Conecta el diseño con el viewport (320px → 1440px+). |
| 23 | Marco vs Contenido | **puente** | Conecta la identidad (el escenario) con lo que llena la escena (contenido). |
| 24 | Sensación vs Interacción | **puente** | Conecta el feel (identidad visual) con el behave (UI funcional). |

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 16 | Roles cromáticos (6), voces (2), escala, respiraciones (4+factor), escalera L-dir, bordes, tono |
| **conversor** | 1 | Escalera de luminosidad |
| **custodio** | 2 | Acento escaso, dramatismo |
| **puente** | 4 | Contraste, adaptabilidad, marco/contenido, sensación/interacción |

## Lectura

**16 reflejos** = el 67% de la identidad visual es DATO PURO de la marca.
No hay fuzzy, no hay IA decidiendo. El dueño dice "negro, oro, Playfair, generoso"
y eso se traduce directamente a propiedades de presentación [PUERTO ABIERTO — el
adaptador puede ser cualquier lenguaje de estilo].

**1 conversor** = la escalera de luminosidad es la única FÓRMULA: toma un color base
y escala su L en pasos regulares para generar las superficies. Lo demás es copia directa.

**2 custodios** = dos guardas que protegen la marca de sí misma: el oro escaso y el
dramatismo contenido. Son reglas de VERIFICACIÓN, no de generación.

**4 puentes** = los puntos donde la identidad toca el mundo exterior (percepción,
viewport, contenido, interacción). Son PUERTOS — el adaptador los resuelve.
