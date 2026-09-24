# PASADA 2 · PUNTO: `monitor-salud-financiera` (la medida maestra)

> El medidor central del negocio: "salud financiera por proyecto". Es lo que
> justifica todo el sistema — sin él, el negocio vuelve a operar "por sensación";
> con él, el dueño ve cuántos generan, cuáles sangran y el flujo real a caja.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD
Es la **cara financiera agregada** del negocio, vista una sola vez por proyecto y
acumulada: cuadro maestro = cuántos proyectos generan (ingresos reales), cuáles
sangran (coste sin recuperar), flujo real a caja (cobros efectivos vs comprometidos).
El indicador es financiero y se sigue por proyecto, nunca por sensación. Es la
ENTRADA del dueño para decidir el portafolio (roles jefe) y la que habilita el
**corte de sangrantes** (decisión de matar un proyecto que drena).

### 2 · RESTRICCIONES
- **FRENO**: no está definido qué es "genera" vs "sangra" (KPI). → **EMPUJON**:
  definición deumbría DECLARABLE por el dueño (ley de cero supuestos: no se
  estima): umbral de ingreso por proyecto y techo de pérdida acumulada.
- **FRENO**: flujo a caja vs ingreso comprometido es ambiguo. → **EMPUJON**:
  reflejo puro que distingue cobro efectivo de promesa de pago (neto de caja).
- **FRENO**: si sangran en silencio, el dueño no tiene control (rompe la promesa de
  supervisión). → **EMPUJON**: notificación de alerta por el canal (cruza con
  canal-supervision) cuando un proyecto cruza el techo de pérdida → caso a decidir
  (matar/reencuadrar).
- **FRENO**: sin contabilidad por proyecto, todo se mezcla. → **EMPUJON**: coste
  asignado por proyecto (lo que cuesta construirlo y operarlo) frente a su ingreso:
  ese es el dato de sangría.

### 3 · CONTRATO
Recibe: cobros (operador), costes asignados (constructor+operador), decisiones
de corte. Emite: cuadro por proyecto + alertas de sangría + estados (genera|sangra|neutro).
Es lo que convierte supervisión del dueño en control, y lo que retroalimenta la
decisión de operar nuevos proyectos (salud del portafolio).

### 4 · NO-OBJETIVOS
NO toma la decisión de cortar (eso es del jefe/operador): mide y alerta. NO cobra
ni construye. NO estima: solo registra lo declarado.

### 5 · PREGUNTAS ABIERTAS
- ¿Umbral concreto de ingreso semanal para "genera" y techo de pérdida para matar?
  (no declarado — pregunta guion).
- ¿Cómo se asignan los costes por proyecto (coste de construcción, de operación)?
  ¿Un coste fijo por proyecto lanzado?
- ¿Frecuencia del cuadro (semanal? por evento de cobro?) y canal de entrega?

---

## Lo que sale (hojas / piezas)
- `registro-cobros` (reflejo puro — cobro efectivo vs comprometido) → hoja
- `imputacion-costes-proyecto` (reflejo — cuánto cuesta cada uno) → hoja
- `cuadro-salud-financiera` (agregación por proyecto) → hoja → disección
- `alerta-sangria` (puente — notifica al canal, caso a decidir) → hoja
