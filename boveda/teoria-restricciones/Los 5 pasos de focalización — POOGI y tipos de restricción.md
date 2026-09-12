---
tipo: componente
sector: teoria-restricciones
tags: [toc, cinco-pasos, poogi, restriccion, focalizacion]
---
# Los 5 pasos de focalización — POOGI y tipos de restricción

> No hace falta mejorarlo todo. Hace falta mejorar LO ÚNICO que decide cuánto produce el sistema
> completo — y dejar en paz, deliberadamente, todo lo demás.

---

## El ciclo POOGI (Process Of OnGoing Improvement)

```
PASO 1 — IDENTIFICAR la restricción
  La restricción es el recurso (máquina, persona, política, mercado) cuya capacidad
  es MENOR que la demanda que se le exige. Se identifica con datos: horas de carga
  requeridas vs horas disponibles por recurso, no con "impresión visual" de dónde
  se acumula gente o material.
  ★☆☆☆☆ dificultad conceptual — ★★★☆☆ dificultad de ejecución (requiere datos reales)

PASO 2 — EXPLOTAR la restricción
  Sacar el máximo rendimiento posible de la restricción SIN gastar en inversión de
  capital. Ejemplos: eliminar paradas por cambio de formato en esa máquina, quitar
  de su carga cualquier trabajo que no aporte a la meta (piezas defectuosas nunca
  deben llegar a la restricción para no desperdiciar su tiempo), turnos extra SOLO
  en ese recurso, mantenimiento preventivo prioritario ahí.
  ★★★☆☆ — la fase más barata y más rentable; casi siempre la más descuidada.

PASO 3 — SUBORDINAR todo lo demás a la decisión anterior
  El resto del sistema (recursos NO restrictivos) ajusta su ritmo al de la
  restricción, aunque eso signifique que trabajen por debajo de su capacidad
  máxima. Es el paso más contraintuitivo: "dejar máquinas paradas a propósito"
  choca contra toda la cultura de eficiencia local.
  ★★★★☆ — requiere cambiar KPIs de eficiencia local a KPIs de sistema.

PASO 4 — ELEVAR la restricción
  Solo si los pasos 2 y 3 no bastan para igualar capacidad con demanda: invertir
  (comprar máquina adicional, contratar, subcontratar, rediseñar producto). Es el
  único paso que cuesta dinero de verdad — por eso va DESPUÉS de explotar y
  subordinar, nunca antes.
  ★★☆☆☆ — conceptualmente simple, pero mal secuenciado (elevar antes de explotar)
  es el error nº1 de quien conoce TOC solo de oídas.

PASO 5 — REPETIR el ciclo, sin dejar que la INERCIA se convierta en la nueva restricción
  Al elevar la restricción, la restricción se mueve a otro punto del sistema
  (o al mercado). Volver al paso 1. Goldratt advertía explícitamente contra la
  "inercia": políticas, hábitos y estructuras creadas para gestionar la vieja
  restricción que sobreviven y ESTORBAN cuando la restricción ya cambió de sitio.
  ★★★★★ — sostener la disciplina de repetir el ciclo indefinidamente es lo que
  distingue una implementación TOC exitosa de un "proyecto de mejora" de un
  trimestre que se diluye.
```

---

## Taxonomía de restricciones — dónde buscar

```
RESTRICCIÓN FÍSICA (capacidad)
  Una máquina, una persona con una habilidad escasa, un metro cuadrado de
  almacén, un ancho de banda de red. Se identifica y se gestiona con
  Drum-Buffer-Rope. Es la más fácil de diagnosticar y la más citada en
  libros de texto — pero en la práctica, minoritaria frente a las siguientes.

RESTRICCIÓN DE MERCADO
  La demanda es menor que la capacidad instalada. El "tambor" debe fijarse
  al ritmo de VENTAS, no de producción (esto es exactamente lo que resuelve
  S-DBR). Tratar esto como problema de planta es el error más caro y más
  frecuente en pymes maduras.

RESTRICCIÓN DE POLÍTICA (la más común y la más ignorada)
  Una regla, procedimiento o KPI de la propia organización que limita el
  throughput sin que nadie lo cuestione porque "siempre se ha hecho así".
  Ejemplo clásico: exigir lotes mínimos de fabricación por "eficiencia de
  cambio de formato" cuando eso genera inventario y alarga el lead time del
  cliente. Se ataca con Procesos de Pensamiento, no con inversión de capital.

RESTRICCIÓN DE MATERIALES / PROVEEDOR
  Un componente crítico con proveedor único o lead time largo. Se gestiona
  con buffers de stock estratégico y, si es posible, diversificación —
  conecta con la lógica de "TOC en distribución" (replenishment).

RESTRICCIÓN LOGÍSTICA / DE INFORMACIÓN
  El sistema de programación o de información en sí mismo (un MRP mal
  parametrizado, falta de visibilidad de pedidos) genera decisiones que
  crean restricciones artificiales que no existirían con mejor información.
```

---

## Cómo identificar la restricción con datos reales (procedimiento)

```
1. Listar todos los recursos (máquinas, personas, procesos) del flujo.
2. Para cada recurso: CARGA REQUERIDA (horas necesarias para cumplir la
   demanda actual) ÷ CAPACIDAD DISPONIBLE (horas reales, descontando
   paradas planificadas).
3. El recurso con ratio más alto (>0.9-1.0 sistemáticamente) es candidato
   a restricción física. Si NINGÚN recurso interno supera ese ratio,
   la restricción está en el MERCADO (fuera de la fábrica).
4. Confirmar con observación directa: ¿ese recurso tiene cola de trabajo
   esperando de forma persistente (no puntual)? ¿Reducir su tiempo de
   ciclo en un 10% aumentaría el output del sistema completo?
5. Si la respuesta a (4) es no en ningún recurso físico, sospechar
   restricción de POLÍTICA — aplicar Nube de Evaporación.
```

---

## Errores comunes en la práctica

```
→ "Apagar" varios cuellos de botella a la vez sin verificar cuál es el
  RECURSO limitante real — dispersa esfuerzo y presupuesto sin mover el
  throughput del sistema.
→ Medir el paso 2 (explotar) con el mismo KPI de eficiencia local que se
  usa en el resto de la planta — hay que blindar la restricción con
  métricas propias (ver [[Métricas y palancas TOC — throughput, buffer penetration, OEE]]).
→ Saltarse el paso 3 (subordinar): mantener recursos no-restrictivos
  trabajando "a tope" genera sobreproducción, WIP excesivo y oculta la
  verdadera restricción bajo una montaña de inventario intermedio.
→ Invertir en el paso 4 (elevar) sin haber agotado el paso 2 — comprar
  una segunda máquina cuando el 30% del tiempo de la primera se pierde
  en cambios de formato mal gestionados.
```

## Novedades 2024-2026

```
→ La literatura reciente (2024-2025) reformula explícitamente el ciclo POOGI
  como marco de resiliencia organizacional: la restricción de política se
  estudia hoy en el contexto de equipos remotos/híbridos, donde la restricción
  real suele ser una norma de comunicación o de aprobación heredada de la
  oficina presencial, no una limitación de talento o herramientas.
```

Ver: [[Drum-Buffer-Rope — programación de producción y buffers]] · [[Procesos de Pensamiento I — Árbol de Realidad Actual y Nube de Evaporación]].
