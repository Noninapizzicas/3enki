# Pasada 2 — Prisma sobre los sub-productos de The Pirate

Cada SPAWN de pasada 1 se re-prisma aquí. Las 4 dimensiones (cromático, tipográfico,
respiración, superficie) convergen en **Tono emergente** — NO son ramas independientes.

---

## A. Código cromático (SPAWN → descomponer)

**Sujeto:** Los colores de The Pirate y lo que hace cada uno.

La marca trae 6 valores crudos:
- `#0D0D0D` (negro profundo) — el escenario, la oscuridad
- `#D4A537` (oro mate) — el tesoro, el acento que manda
- `#F5E6C8` (pergamino) — la calidez, el viejo mundo
- `#2d2d2d` (gris oscuro) — la profundidad detrás del escenario
- `#6B6B6B` (gris medio) — el apoyo, el susurro
- `#E5E5E5` (gris claro) — el trazo sutil, el borde

Estos 6 no son "colores" — son **roles semánticos**:

| Rol | Valor crudo | Función |
|---|---|---|
| Escenario (superficie base) | `#0D0D0D` | el vacío donde todo sucede |
| Tesoro (acento dominante) | `#D4A537` | lo que brilla, lo que atrae la mirada |
| Pergamino (calidez) | `#F5E6C8` | la textura cálida, lo que suaviza |
| Profundidad (superficie hundida) | `#2d2d2d` | lo que está detrás del escenario |
| Susurro (neutro medio) | `#6B6B6B` | texto secundario, lo que no grita |
| Trazo (neutro claro) | `#E5E5E5` | bordes, separadores, lo casi invisible |

De cada rol nacen **estados**: default, sobre-superficie (on-surface), atenuado (muted),
intensificado (hover). → ATÓMICO (cada estado es una variación calculable del rol base).

**Productos:**
- 6 roles cromáticos con sus estados → ATÓMICO × 6
- REF a "Roles cromáticos" de pasada 1 (mismo objeto)

---

## B. Código tipográfico (SPAWN → descomponer)

**Sujeto:** Las fuentes de The Pirate y cuándo sale cada una.

La marca trae:
- Playfair Display — serifa con contraste grueso/fino, autoridad clásica
- Inter — sans-serif geométrica, legibilidad digital
- Lato — sans-serif humanista (alternativa a Inter para textos largos)

Son **dos voces**, no tres:
- **Voz de impacto** (Playfair) — titulares, hero, precio, el nombre de la pizza
- **Voz de lectura** (Inter/Lato) — cuerpo, descripción, navegación, datos operativos

Cada voz tiene:
- **Escala** — progresión de tamaños (cuánto crece cada nivel)
- **Peso** — cuánto pesa cada nivel (400 display vs 300 body, por ejemplo)
- **Interlineado** — cuánto respira cada línea
- **Tracking** — cuánto se separan las letras (suelto en display, neutro en body)

> La escala NO es independiente de la respiración (pasada 2.C) — un título de 4rem
> necesita distinto aire que uno de 2rem. Esta dependencia se resuelve en el convergente.

**Productos:**
- Voz de impacto (Playfair + su escala/peso/tracking) → ATÓMICO
- Voz de lectura (Inter + su escala/peso/interlineado) → ATÓMICO
- Progresión de escala (ratio entre niveles) → ATÓMICO
- REF a "Roles tipográficos" de pasada 1

---

## C. Respiración visual (SPAWN → descomponer)

**Sujeto:** El vacío que rodea cada pieza — cuánto silencio hay.

The Pirate es una marca de **lujo accesible**. El vacío no es minimalismo intelectual
(eso sería un estudio de diseño) — es **la pausa del que no tiene prisa**. El pirata
no rellena porque no necesita justificarse.

Niveles de respiración:
- **Sección** — el acto (cuánto aire entre secciones de página)
- **Card/bloque** — la escena (padding interno, gap entre cards)
- **Elemento** — el gesto (espacio entre título y texto, entre botón y label)
- **Micro** — el detalle (padding de un botón, gap de un icono con su texto)

> La respiración modula el dramatismo: más aire = más tensión, más pausa.
> Menos aire = más densidad, más urgencia. The Pirate quiere PAUSA, no urgencia.

**Productos:**
- Respiración de sección → ATÓMICO (un valor: generoso)
- Respiración de card → ATÓMICO (un valor: amplio)
- Respiración de elemento → ATÓMICO (un valor: holgado)
- Respiración micro → ATÓMICO (un valor: cómodo)
- Factor de respiración global → ATÓMICO (multiplica todo — la "personalidad" del espacio)

---

## D. Superficie y profundidad (SPAWN → descomponer)

**Sujeto:** Cómo se apilan los planos visuales.

En una marca oscura, la profundidad se construye con **luminosidad**, no con sombra.
No hay sombra que oscurezca lo que ya es negro. La elevación se expresa subiendo
la luminosidad un escalón:

| Plano | Luminosidad relativa | Función |
|---|---|---|
| Fondo hundido | la más baja (`#0D0D0D`) | el vacío, detrás de todo |
| Superficie base | un escalón arriba (`#1a1a1a` ~ `#2d2d2d`) | donde vive el contenido |
| Superficie elevada | otro escalón (`#333` ~ `#3a3a3a`) | cards, bloques diferenciados |
| Superficie flotante | otro escalón (`#444` ~ `#4a4a4a`) | nav, modals, tooltips |
| Superficie glass | translúcida | superposición con blur (el humo del barco) |

> En una marca clara sería al revés: la profundidad baja la luminosidad.
> El MECANISMO (escalar luminosidad) es universal; la DIRECCIÓN (subir vs bajar)
> depende del tono base.

**Productos:**
- Escalera de luminosidad (4 peldaños sólidos + 1 glass) → ATÓMICO
- Dirección de elevación (oscuro = subir L, claro = bajar L) → ATÓMICO
- Bordes entre planos (cómo se separan: borde sutil, gradiente, nada) → ATÓMICO

---

## E. Tono emergente — EL CONVERGENTE

**Sujeto:** Lo que emerge cuando cromático × tipográfico × respiración × superficie
se combinan. NO es un quinto ingrediente — es el RESULTADO de mezclar los cuatro.

El tono de The Pirate es:

| Dimensión | Valor | Por qué |
|---|---|---|
| Oscuridad | alta (base negra/gris oscuro) | "venimos de alta mar" — noche, profundidad |
| Calidez | media-baja (oro puntual, no dorado total) | el tesoro brilla porque es escaso |
| Peso tipográfico | alto en display, medio en body | autoridad sin gritar |
| Respiración | generosa | "la pausa del que no tiene prisa" |
| Contraste | alto (oro sobre negro = alto contraste natural) | audacia, sin miedo |
| Textura | mate (sin glossy, sin gradientes brillantes) | autenticidad, lo real no brilla |
| Movimiento | medio-pesado (transiciones con inercia, no rápidas) | el barco no frena en seco |
| Dramatismo | alto pero contenido (audaz, no circense) | The Pirate, no Piratas del Caribe |

Este tono NO se descompone más — es la **firma final**. Su valor es que es
VERIFICABLE: cualquier superficie nueva se contrasta contra esta tabla y se sabe
si "huele a Pirate" o no.

**Productos:**
- Tono emergente → ATÓMICO (la tabla de arriba es la pieza, completa e indivisible)

---

## F. Equilibrio dramático (SPAWN → descomponer)

**Sujeto:** La frontera entre audaz y circense.

The Pirate dice "audacia" y "sin tapujos", pero su público es Lorca, no Burning Man.
El equilibrio:

- **Audaz SÍ**: serifa pesada, oro en títulos, cards oscuras, hero generoso
- **Circense NO**: texto todo dorado, sombras por todos lados, animaciones de barco, calaveras como fondo
- **La regla**: el oro se GANA. Solo lo que merece atención lleva oro. El resto es gris/blanco sobre negro.

**Productos:**
- Regla de acento escaso → ATÓMICO (el oro aparece ≤3 veces por vista)
- Regla de dramatismo → ATÓMICO (audaz en estructura, sobrio en decoración)

---

## G. Roles cromáticos / tipográficos / espaciales (SPAWN → REF o ATÓMICO)

- **Roles cromáticos** → REF a §A (misma pieza: los 6 roles semánticos)
- **Roles tipográficos** → REF a §B (misma pieza: las 2 voces)
- **Roles espaciales** → REF a §C (misma pieza: los 4 niveles de respiración)

---

**Resumen de pasada 2:**

| Producto | Estado |
|---|---|
| 6 roles cromáticos + estados | ATÓMICO × 6 |
| Voz de impacto (Playfair) | ATÓMICO |
| Voz de lectura (Inter) | ATÓMICO |
| Progresión de escala | ATÓMICO |
| Respiración de sección | ATÓMICO |
| Respiración de card | ATÓMICO |
| Respiración de elemento | ATÓMICO |
| Respiración micro | ATÓMICO |
| Factor de respiración global | ATÓMICO |
| Escalera de luminosidad | ATÓMICO |
| Dirección de elevación | ATÓMICO |
| Bordes entre planos | ATÓMICO |
| Tono emergente | ATÓMICO |
| Regla de acento escaso | ATÓMICO |
| Regla de dramatismo | ATÓMICO |
| Roles cromáticos | REF → §A |
| Roles tipográficos | REF → §B |
| Roles espaciales | REF → §C |

**Todo es ATÓMICO o REF. No hay SPAWN. El suelo está tocado.**
