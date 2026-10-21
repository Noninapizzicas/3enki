---
tipo: componente
sector: teoria-restricciones
tags: [toc, dbr, drum-buffer-rope, sdbr, programacion, buffers]
---
# Drum-Buffer-Rope — programación de producción y buffers

> Solo hay que programar UN recurso con precisión: la restricción. Todo lo demás se sincroniza a
> su ritmo con una señal simple — el resto es la complejidad innecesaria del MRP tradicional.

---

## Los tres componentes

```
DRUM (tambor)
  El ritmo de todo el sistema. Coincide con la capacidad del recurso restrictivo
  (DBR clásico) o con la fecha de entrega comprometida al mercado (S-DBR).
  Es el ÚNICO punto del sistema que necesita una programación detallada,
  secuenciada y protegida.

BUFFER (amortiguador)
  NO es inventario de seguridad genérico — es protección de TIEMPO colocada
  estratégicamente para absorber la variabilidad estadística sin que pare el
  tambor ni se retrase la entrega. Se mide y gestiona en % de penetración,
  no en unidades físicas.

ROPE (cuerda)
  El mecanismo que limita cuánto trabajo se libera al sistema — atado al
  consumo del buffer, no a la capacidad ociosa de los recursos iniciales.
  Es lo que impide la sobreproducción: si el buffer del tambor está lleno,
  la cuerda no libera más material, aunque las máquinas de aguas arriba
  estén paradas.
```

---

## DBR clásico vs Simplified DBR (S-DBR)

```
DBR CLÁSICO (restricción interna de capacidad)
  → Usa: buffer de RESTRICCIÓN (protege al tambor de que aguas arriba se
    retrase su alimentación) + buffer de ENVÍO (protege la fecha de entrega
    frente a variabilidad después del tambor).
  → El tambor es el recurso físico limitante. La cuerda libera material
    a planta según el consumo REAL de la restricción.
  → Apropiado cuando hay UNA restricción interna claramente identificada
    y estable (una máquina, una célula de trabajo).

S-DBR (restricción de mercado — la más común en pymes hoy)
  → Elimina el buffer de restricción: solo queda el buffer de ENVÍO
    (shipping buffer). El "tambor" se fija a las fechas de entrega
    comprometidas, no a la capacidad de una máquina interna.
  → El material se libera según: fecha de entrega MENOS el buffer de envío
    — no según disponibilidad de recursos.
  → Es el estándar recomendado por Goldratt Consulting desde principios
    de los 2000 para make-to-order / make-to-availability, porque la
    mayoría de fábricas modernas tienen "capacidad sobrada en casi todo"
    y la restricción real vive en ventas.
```

---

## Gestión de buffers — el sistema de colores

```
Cada buffer se divide en 3 zonas iguales (tercios). El color indica URGENCIA,
no cantidad de material:

ZONA VERDE (0-33% consumido)
  → Todo normal. No requiere acción.

ZONA AMARILLA (33-66% consumido)
  → Atención. Verificar que el trabajo está progresando según lo esperado.
    Aún no se interviene, solo se vigila.

ZONA ROJA (66-100% consumido)
  → Acción inmediata: expedición, recursos adicionales, escalado a
    supervisión. Un pedido que entra en rojo y sigue avanzando lento
    es la señal de alarma más temprana y más fiable que existe en un
    sistema DBR — mucho antes que cualquier informe de retraso clásico.

PENETRACIÓN DE BUFFER (buffer penetration) = % del buffer consumido en el
  tiempo/tramo que lleva recorrido el pedido. Es la métrica operativa
  central de todo sistema DBR — sustituye al Gantt de "% completado por tarea".
```

---

## Dimensionado del buffer

```
REGLA PRÁCTICA CLÁSICA: buffer = 50% del lead time acumulado de la ruta
  protegida (regla de partida; se ajusta con datos históricos reales de
  variabilidad, NO se deja fija para siempre).

AJUSTE DINÁMICO (buffer management moderno / DDMRP):
  → Si el buffer se agota sistemáticamente en rojo antes de completar el
    tramo protegido → el buffer es DEMASIADO PEQUEÑO, se amplía.
  → Si el buffer casi nunca sale de verde → es DEMASIADO GRANDE, hay
    margen para reducirlo y acortar el lead time comprometido al cliente
    (ventaja competitiva directa, no solo ahorro interno).
  → Esta revisión periódica (mensual/trimestral) es lo que en DDMRP se
    formaliza como "ajuste de perfil de buffer" — ver
    [[TOC en distribución y cadena de suministro — replenishment]].
```

---

## Software y herramientas

```
CATEGORÍA COMERCIAL / EMPRESA (buffer management dedicado)
  → Realization Technologies — Concerto: buffer management para proyectos
    multi-empresa (aeroespacial, defensa, farma). Referencia histórica de
    CCPM a escala corporativa.
  → Exepron, ProChain — software CCPM con fever chart y gestión de buffers
    integrada, orientado a PYMEs de ingeniería y construcción.

CATEGORÍA GENÉRICA (ERP con módulo DBR/DDMRP)
  → SAP S/4HANA, Infor, Oracle Cloud SCM — módulos DDMRP nativos o vía
    partner (Camelot, Demand Driven Technologies).
  → Alternativa económica: hoja de cálculo con semáforo condicional
    (Excel/Google Sheets) — perfectamente viable para una sola línea de
    producción o un taller pequeño; muchas implementaciones TOC exitosas
    en pyme empiezan y se quedan aquí.

SIMULACIÓN PARA DISEÑAR EL SISTEMA ANTES DE IMPLANTARLO
  → Simul8, ExtendSim — simulación de eventos discretos para dimensionar
    buffers antes de tocar la planta real. Útil quando la inversión en
    cambiar el layout físico es alta y hay que validar el diseño DBR antes.
```

---

## Errores comunes

```
→ Confundir el buffer de TIEMPO con inventario de seguridad de CANTIDAD —
  dimensionarlo en unidades en vez de en horas/días rompe toda la lógica
  de gestión por colores.
→ Programar TODOS los recursos con el mismo nivel de detalle que el tambor
  — vuelve a caer en la complejidad del MRP tradicional que DBR existe
  precisamente para evitar.
→ No revisar el tamaño del buffer con datos reales: un buffer fijado hace
  3 años y nunca recalculado deja de reflejar la variabilidad actual del
  proceso (proveedores, personal, demanda han cambiado).
→ Aplicar DBR clásico cuando la restricción real es de mercado — genera
  sobreprotección interna mientras la línea comercial sigue siendo el
  cuello de botella real. Diagnosticar primero con
  [[Los 5 pasos de focalización — POOGI y tipos de restricción]].
```

## Novedades 2024-2026

```
→ DDMRP (Demand Driven MRP) — la evolución más adoptada comercialmente de
  la lógica de buffers TOC — sigue ganando cuota en ERPs de nivel 1 y 2;
  2024-2025 marca la entrada de módulos DDMRP nativos en más suites SAP
  e Infor, reduciendo la necesidad de add-ons de terceros.
→ Integración de fever chart / gestión de buffers con dashboards en tiempo
  real (Epicflow "Bubble Graph", 2024-2025) — visualización que cruza
  penetración de buffer con avance real del proyecto en un solo gráfico,
  pensada para portfolios de proyectos, no un proyecto aislado.
```

Ver: [[Contabilidad del Throughput — T, I, OE]] · [[Cadena Crítica — CCPM y buffers de proyecto]].
