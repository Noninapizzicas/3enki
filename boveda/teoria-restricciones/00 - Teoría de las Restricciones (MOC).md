---
tipo: moc
sector: teoria-restricciones
tags: [moc, toc, teoria-restricciones, goldratt, gestion, operaciones, proyectos]
---
# 🔗 Teoría de las Restricciones (TOC) — mapa

> Todo sistema, por complejo que parezca, tiene como máximo un puñado de restricciones reales que
> deciden cuánto dinero genera. El resto es ruido de eficiencias locales. Encuentra la restricción,
> exprímela, subordina todo lo demás — y el sistema entero se mueve con un esfuerzo mínimo.

---

## La escalera TOC — de "apagar fuegos" a "arquitecto del sistema"

```
NIVEL 0 — Diagnóstico local
  Lee "La Meta" (Goldratt, 1984). Identifica el cuello de botella físico de un proceso propio
  (producción, ventas, tu propio flujo de trabajo). Inversión: 1 libro (~15-20€), 1 semana de
  observación con cronómetro. No necesitas software ni consultoría.

NIVEL 1 — Los 5 pasos aplicados
  Aplicas el ciclo POOGI (Identificar → Explotar → Subordinar → Elevar → Repetir) sobre UN proceso.
  Mides Throughput, Inventario y Gasto Operativo en vez de "coste unitario". Herramienta: hoja de
  cálculo + un tablero Kanban físico o Trello.

NIVEL 2 — Programación con Drum-Buffer-Rope
  Programas producción o proyectos con DBR/S-DBR: el "tambor" marca el ritmo, los "buffers" protegen
  la fecha, la "cuerda" limita el WIP liberado. Sustituyes el MRP tradicional por gestión de buffers
  (verde/amarillo/rojo). Aplica igual a una fábrica que a un estudio de 3 personas.

NIVEL 3 — Procesos de Pensamiento
  Cuando el problema no es "qué máquina va lenta" sino "por qué la organización se sabotea a sí
  misma", usas el Árbol de Realidad Actual y la Nube de Evaporación para encontrar el conflicto
  raíz — normalmente un supuesto no cuestionado, no falta de recursos.

NIVEL 4 — Cadena Crítica en proyectos
  Gestionas proyectos con CCPM: buffers de proyecto y de alimentación en vez de fechas infladas por
  tarea, fever chart en vez de Gantt de "% completado". Aplica a construcción, software, I+D.

NIVEL 5 — Estrategia de sistema completo
  Diseñas árboles de Estrategia y Táctica (S&T) para toda la organización, conectas ventas
  (mafia offer), operaciones (DBR) y finanzas (Throughput Accounting) en un solo hilo causal.
  Es el terreno de Viable Vision / Harmony — transformación de la empresa entera, no de un área.
```

---

## Mapa del sector (15 notas)

| nota | qué cubre |
|---|---|
| [[Fundamentos TOC — Goldratt y el pensamiento sistémico\|Fundamentos TOC]] | Goldratt, "La Meta", el sistema como cadena, por qué la suma de óptimos locales no es el óptimo global |
| [[Los 5 pasos de focalización — POOGI y tipos de restricción\|Los 5 pasos de focalización]] | Identificar, explotar, subordinar, elevar, repetir; taxonomía de restricciones (física, política, mercado) |
| [[Drum-Buffer-Rope — programación de producción y buffers\|Drum-Buffer-Rope (DBR)]] | Tambor, buffer, cuerda; DBR clásico vs S-DBR; gestión de buffers por colores |
| [[Contabilidad del Throughput — T, I, OE\|Contabilidad del Throughput]] | Throughput, Inversión/Inventario, Gasto Operativo; decisiones de mix de producto; por qué el coste unitario miente |
| [[Procesos de Pensamiento I — Árbol de Realidad Actual y Nube de Evaporación\|Procesos de Pensamiento I]] | CRT (diagnóstico de causa raíz), Nube de Evaporación (conflicto y supuestos ocultos) |
| [[Procesos de Pensamiento II — Realidad Futura, Prerrequisitos y Transición\|Procesos de Pensamiento II]] | FRT (validar la solución), PRT (obstáculos) y TT (plan de acción) |
| [[Cadena Crítica — CCPM y buffers de proyecto\|Cadena Crítica (CCPM)]] | Buffer de proyecto, de alimentación y de recurso; fever chart; multitarea dañina |
| [[TOC en distribución y cadena de suministro — replenishment\|TOC en distribución]] | Reposición dinámica, make-to-availability, buffers de inventario, DDMRP como evolución |
| [[TOC en ventas y marketing — restricción de mercado y mafia offer\|TOC en ventas y marketing]] | Cuando el mercado es la restricción; oferta irresistible ("mafia offer"); UDE del cliente |
| [[TOC en servicios, software y startups — DevOps y Phoenix Project\|TOC en servicios y software]] | "The Phoenix Project", flujo en DevOps, restricciones en equipos de ingeniería y startups |
| [[Estrategia y Táctica — Viable Vision y árboles S&T\|Estrategia y Táctica (S&T)]] | Árboles Strategy & Tactic, Viable Vision, Harmony, transformación end-to-end |
| [[Métricas y palancas TOC — throughput, buffer penetration, OEE\|Métricas y palancas TOC]] | KPIs operativos: throughput por minuto de restricción, penetración de buffer, carga planificada |
| [[TOC frente a Lean y Six Sigma — integración y diferencias\|TOC frente a Lean y Six Sigma]] | Dónde compiten, dónde se complementan, TLS (TOC+Lean+Six Sigma) |
| [[Avances recientes y estado del arte — TOCICO 2023-2026\|Avances y estado del arte]] | TOCICO, TOC Innovation Summit, DDMRP, casos de estudio recientes con cifras |
| [[Fuentes — teoría de las restricciones\|Fuentes]] | Libros, organizaciones, certificaciones, cursos, software, comunidades |

---

## Últimas noticias y avances del sector

> La TOC lleva 40 años vigente porque sigue produciendo cifras verificables, no porque sea moda de
> gestión. Estos son los datos más recientes que sostienen esa afirmación.

```
NOVEDAD 1 (sept. 2026): TOC Innovation Summit 2026 — Universidad de Manchester, 2-4 sept. 2026.
  Evento de TOCICO reorientado a práctica: manufactura, sanidad, cadena de suministro, gestión
  de proyectos y tecnología. Sustituye el formato puramente académico de años anteriores.

NOVEDAD 2 (2024-2025): DDMRP (Demand Driven MRP) se consolida como evolución directa de la
  reposición TOC clásica — posicionamiento estratégico de buffers de desacoplamiento + perfiles
  de buffer dinámicos. Cada vez más ERPs (SAP, Infor, Oracle) ofrecen módulos DDMRP nativos.

NOVEDAD 3 (2024-2025): revisión sistemática de implementaciones TOC en sanidad (Tandfonline,
  2022-2024) confirma resultados sostenidos: reducciones de estancia hospitalaria del 45-73%,
  reducción de horas extra de personal de media 93%, aumento de cirugías realizadas hasta 100%
  en algunos hospitales — sin inversión en más camas ni más plantilla.

NOVEDAD 4 (2025): investigación en ingeniería multiproyecto (Risha, 2025) formaliza los entornos
  de ingeniería con múltiples proyectos simultáneos como sistemas de recursos compartidos con
  redes de actividades en competencia — puente directo entre CCPM clásico y gestión de cartera
  de proyectos (portfolio) moderna.

NOVEDAD 5 (2024): estudio de mezcla de producción en pyme metalúrgica en Brasil aplicando
  Throughput Accounting confirma que el mix óptimo según "throughput por minuto de restricción"
  difiere sustancialmente del mix que recomendaría el coste unitario tradicional — la pyme habría
  tomado la decisión de producto equivocada usando contabilidad de costes clásica.
```

---

## Conexiones con otros sectores de la bóveda

- [[../comercio/00 - Comercio (MOC)|Comercio]] — Throughput Accounting es la base cuantitativa detrás de "márgenes y rotación"; la restricción de mercado conecta con unit economics (CAC/LTV) y con la oferta irresistible de ventas.
- [[../trading/00 - Trading (MOC)|Trading]] — la lógica de "cuál es el cuello de botella del sistema" se traslada a la gestión de riesgo: la restricción de una cuenta de trading suele ser psicológica o de capital, no de "mejor indicador".
- [[../impresion-3d/00 - Impresión 3D (MOC)|Impresión 3D]] — la cola de trabajo de una impresora es un caso de libro de Drum-Buffer-Rope de una sola máquina: la impresora ES el tambor, todo lo demás se subordina a mantenerla ocupada.
- [[../construccion-abierta/00 - Construcción Abierta (MOC)|Construcción Abierta]] — la Cadena Crítica (CCPM) nació precisamente para proyectos de construcción e ingeniería con estimaciones infladas y multitarea dañina.
