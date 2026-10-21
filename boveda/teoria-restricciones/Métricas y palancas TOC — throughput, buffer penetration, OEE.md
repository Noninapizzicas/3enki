---
tipo: componente
sector: teoria-restricciones
tags: [toc, metricas, kpi, buffer-penetration, oee, throughput]
---
# Métricas y palancas TOC — throughput, buffer penetration, OEE

> Medir mal es peor que no medir: un KPI de eficiencia local bien intencionado puede empujar a todo
> un equipo a trabajar duro en la dirección exactamente equivocada. Estas son las métricas que sí
> apuntan hacia la meta del sistema.

---

## Jerarquía de métricas TOC (de sistema a operación diaria)

```
NIVEL 1 — MÉTRICAS DE SISTEMA (financieras, ver [[Contabilidad del Throughput — T, I, OE]])
  Throughput (T), Inventario/Inversión (I), Gasto Operativo (OE).
  Se revisan a nivel de dirección, mensual o trimestral, y son la vara de
  medir última de cualquier decisión — toda métrica de nivel 2 y 3 debe
  poder trazarse hasta su impacto en T, I y OE.

NIVEL 2 — MÉTRICAS DE RESTRICCIÓN (semanal/diaria)
  Las que gobiernan directamente la explotación del recurso restrictivo.

NIVEL 3 — MÉTRICAS DE FLUJO Y BUFFER (diaria, a veces en tiempo real)
  Las que alimentan la gestión operativa del día a día — dashboards de
  planta, de proyecto, de almacén.
```

---

## Throughput por unidad de la restricción

```
T/hora-restricción = Throughput generado ÷ horas de capacidad consumidas
  en el recurso restrictivo.
  → Es la métrica CENTRAL para decisiones de mix de producto (ver
    [[Contabilidad del Throughput — T, I, OE]]) y para priorizar pedidos
    entrantes cuando hay más demanda que capacidad de la restricción.
  → Se calcula por producto/servicio y se actualiza cuando cambian precio,
    coste de materiales o tiempo de proceso en la restricción — un
    catálogo de T/hora-restricción desactualizado lleva a decisiones de
    priorización equivocadas sin que nadie lo note durante meses.
```

---

## Buffer Penetration (% de buffer consumido)

```
DEFINICIÓN: % del buffer de tiempo consumido, en relación al avance real
  del trabajo protegido por ese buffer. Aplica tanto a DBR (buffer de
  envío/restricción) como a CCPM (buffer de proyecto/alimentación) como a
  distribución (buffer de stock).

USO OPERATIVO
  → Es la métrica que sustituye al "% completado" autoreportado — mide
    cuánta PROTECCIÓN queda, no cuánto trabajo dice alguien que ha hecho.
  → Se agrega a nivel de sistema como "% de pedidos/proyectos en rojo"
    en un momento dado — un indicador de salud del sistema mucho más
    temprano que cualquier informe de retrasos ya consumados.
  → Tendencia (no solo valor puntual): un pedido que entra en amarillo y
    SIGUE avanzando en amarillo es distinto de uno que entra en amarillo
    y salta a rojo en un día — la velocidad de consumo del buffer es en
    sí misma información de diagnóstico.
```

---

## OEE de la restricción (Overall Equipment Effectiveness)

```
FÓRMULA: OEE = Disponibilidad × Rendimiento × Calidad
  Disponibilidad = tiempo productivo real / tiempo planificado
  Rendimiento = velocidad real / velocidad ideal
  Calidad = unidades buenas / unidades totales producidas

POR QUÉ SOLO IMPORTA EN LA RESTRICCIÓN
  → Mejorar el OEE de un recurso NO restrictivo no cambia el throughput
    del sistema — es la trampa de eficiencia local más citada en TOC.
    El OEE de la restricción, en cambio, es DIRECTAMENTE proporcional al
    Throughput del sistema completo: cada minuto perdido en la
    restricción (parada, defecto, ciclo lento) es Throughput que el
    sistema entero pierde para siempre, sin posibilidad de recuperarlo.
  → Regla práctica: cualquier iniciativa de mejora continua (kaizen,
    Six Sigma, mantenimiento) debe priorizarse por su impacto en el OEE
    del recurso restrictivo antes que en cualquier otro recurso — esto
    es, en esencia, el paso 2 (explotar) de los 5 pasos de focalización
    convertido en programa de mejora continua permanente.
```

---

## Planned Load (carga planificada) por recurso

```
DEFINICIÓN: horas de trabajo requeridas ÷ horas disponibles, por recurso,
  para un horizonte de planificación dado (semana, mes).
  → Es la métrica base del PROCEDIMIENTO DE DIAGNÓSTICO de la restricción
    (ver [[Los 5 pasos de focalización — POOGI y tipos de restricción]]):
    el recurso con planned load más alto y sostenido es candidato a
    restricción física.
  → Se recalcula cada vez que cambia el mix de pedidos comprometidos —
    la restricción NO es necesariamente fija en el tiempo; un cambio de
    mix de producto puede desplazarla de un recurso a otro sin que nadie
    haya invertido ni cambiado el layout de planta.
```

---

## Métricas a evitar (o a usar con mucho cuidado) en un sistema TOC

```
EFICIENCIA INDIVIDUAL DE RECURSOS NO-RESTRICTIVOS
  → Incentivarla directamente empuja a producir por encima de lo que la
    restricción puede absorber → genera inventario (I) sin generar
    Throughput (T) — el patrón de daño más citado en toda la literatura
    TOC desde "La Meta".

COSTE ABSORBIDO / MARGEN UNITARIO CLÁSICO
  → Distorsiona decisiones de mix, como se detalla en
    [[Contabilidad del Throughput — T, I, OE]]. Útil para contabilidad
    financiera regulatoria, peligroso como única guía de decisión
    operativa.

% DE TAREAS COMPLETADAS EN UN PROYECTO
  → Sustituir por Buffer Penetration + Fever Chart (ver
    [[Cadena Crítica — CCPM y buffers de proyecto]]) — el % de tareas
    completadas no captura la variable que realmente predice el retraso.

UTILIZACIÓN GLOBAL DE PLANTA (%)
  → Un objetivo de "planta al 95% de utilización global" en un sistema
    con una sola restricción interna es matemáticamente incompatible con
    mantener capacidad protectora en los recursos no-restrictivos — un
    sistema TOC bien diseñado tiene, a propósito, recursos no-restrictivos
    con utilización por debajo del máximo teórico.
```

---

## Errores comunes

```
→ Publicar dashboards de eficiencia local junto a dashboards de buffer
  penetration sin resolver la contradicción entre ambos — el equipo
  recibe señales encontradas y termina optimizando lo que es más fácil
  de medir, no lo que importa.
→ No actualizar el catálogo de T/hora-restricción cuando cambian precios
  o costes de materiales — decisiones de priorización de pedidos basadas
  en datos obsoletos.
→ Medir OEE de toda la planta como un promedio único en vez de aislar el
  OEE del recurso restrictivo — diluye la señal más valiosa del sistema
  entero en un número agregado sin poder de diagnóstico.
```

## Novedades 2024-2026

```
→ Integración de Buffer Penetration y Planned Load en dashboards de
  Business Intelligence en tiempo real (Power BI, Tableau, Grafana sobre
  datos de MES/ERP) — 2024-2025 marca una adopción notable de estas
  métricas TOC fuera del software especializado de nicho, directamente
  en las herramientas de BI que ya usan las empresas para todo lo demás.
```

Ver: [[Drum-Buffer-Rope — programación de producción y buffers]] · [[Contabilidad del Throughput — T, I, OE]].
