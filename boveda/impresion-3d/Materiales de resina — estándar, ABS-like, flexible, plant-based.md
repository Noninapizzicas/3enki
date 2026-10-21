---
tipo: componente
sector: impresion-3d
tags: [materiales, resina, MSLA, toxicidad, water-washable, plant-based]
---
# Materiales de resina — estándar, ABS-like, flexible, plant-based

> Toda resina sin curar es un compuesto químico reactivo — trátala como tal, no como un filamento con forma líquida.

---

## Resina estándar

```
PROPIEDADES: máximo detalle, superficie muy lisa, curado rápido, la más barata del
  catálogo (20-40€/L en marcas de terceros compatibles con Elegoo/Anycubic)
LIMITACIÓN: frágil y quebradiza — rompe sin avisar bajo tensión o flexión, mala elección
  para piezas que reciben carga mecánica repetida
CUÁNDO USARLA: miniaturas, figuras, prototipos visuales sin exigencia mecánica, masters
  para moldes de silicona (el detalle superficial es justo lo que se quiere transferir)
```

---

## ABS-like (tough/durable)

```
PROPIEDADES: formulada para imitar la resistencia al impacto del ABS — menos frágil que
  la resina estándar, aguanta flexión ligera sin fracturar
LIMITACIÓN: precio más alto que la estándar (35-60€/L), curado algo más exigente
CUÁNDO USARLA: piezas funcionales de pequeño tamaño con detalle fino Y algo de resistencia
  mecánica — el punto intermedio entre resina estándar y una resina de ingeniería
```

---

## Flexible

```
PROPIEDADES: dureza Shore A similar al TPU, permite piezas elásticas de alto detalle
LIMITACIÓN: la más delicada de manipular en postprocesado (lavado y curado exigen más
  cuidado para no deformar la pieza aún blanda)
CUÁNDO USARLA: juntas, prototipos de calzado/producto elástico, piezas antivibración
  de pequeño formato donde TPU en FDM no llega al detalle necesario
```

---

## Water-washable

```
PROPIEDADES: se lava con agua en lugar de IPA — reduce (NO elimina) la exposición a
  disolventes en el postprocesado, más cómoda para uso doméstico frecuente
LIMITACIÓN: el agua de lavado sigue conteniendo resina sin curar — NO se puede tirar por
  el desagüe sin curar antes los residuos (ver nota de normativa)
CUÁNDO USARLA: uso doméstico habitual donde manejar litros de IPA es incómodo o hay menores
  en casa — buena opción de entrada para quien empieza en resina
```

---

## Resinas técnicas / de ingeniería

```
CERAMIC-FILLED: alta rigidez y resistencia a temperatura, superficie muy dura tras curado
  — usada en piezas que requieren estabilidad dimensional bajo calor
DENTAL/BIOCOMPATIBLE: certificadas para uso en boca (guías quirúrgicas, modelos dentales)
  — requieren máquina y resina certificadas específicamente, no vale cualquier MSLA
CASTABLE (colable): diseñadas para quemarse limpiamente en fundición a la cera perdida —
  ver [[Moldes y fundición — de la impresión a la producción en serie]]
PLANT-BASED: formulaciones con menor porcentaje de componente petroquímico — tendencia
  de sostenibilidad 2025-2026, todavía sin sustituir del todo a la resina convencional en
  prestaciones mecánicas
```

---

## Tabla comparativa

```
TIPO            PRECIO/L (2026)   FRAGILIDAD    LAVADO        USO PRINCIPAL
Estándar         20-40€            Alta          IPA            Miniaturas, masters
ABS-like         35-60€            Media         IPA            Funcional detallado
Flexible         45-70€            N/A (elástica) IPA           Juntas, piezas elásticas
Water-washable   30-50€            Media-alta    Agua           Uso doméstico frecuente
Ingeniería       60-150€+          Baja          IPA/específico Dental, castable, técnica
Formlabs propia  79-150€+          Variable      IPA/específico Uso profesional consistente
```

---

## Toxicidad y manipulación — lo que no es opcional

```
ESTADO SIN CURAR: irritante para piel y ojos, alérgeno potencial con exposición repetida,
  vapores con COV — NUNCA manipular sin guantes de nitrilo (el látex se degrada con la resina)
ESTADO CURADO: inerte y seguro al tacto una vez completado el ciclo UV — el riesgo real
  está en el líquido y en piezas "verdes" (recién impresas, aún sin curar del todo)
GESTIÓN DE RESIDUOS: la resina sobrante y el agua/IPA de lavado usados NO son residuo
  doméstico normal — curar al sol/UV la resina residual antes de desecharla como sólido,
  nunca verter líquido sin curar por el desagüe
→ Detalle completo de EPI y ventilación en [[Normativa y seguridad — VOCs, resina, ventilación, reciclaje]]
```

---

## Errores comunes con resina

```
★★★★★ Verter resina sobrante o agua de lavado con resina disuelta por el desagüe — curarla
  al sol hasta solidificar y desecharla como residuo sólido es el procedimiento correcto
★★★★☆ Usar guantes de látex en vez de nitrilo — la resina degrada el látex y termina en
  contacto directo con la piel sin que se note al momento
★★★★☆ Elegir resina estándar para una pieza que va a recibir carga mecánica repetida —
  se rompe de forma frágil e inesperada; ABS-like o resina de ingeniería es la elección
★★★☆☆ No curar lo suficiente antes de manipular sin guantes — una pieza "seca al tacto"
  puede seguir liberando compuestos si el ciclo de curado UV fue insuficiente
```

---

## Novedades 2025-2026

```
→ Las formulaciones plant-based ganan presencia en catálogo como respuesta a la presión
  de sostenibilidad del sector — todavía en fase de maduración frente a la resina estándar
→ Formlabs abre su Form 4 a resinas de terceros con Open Material Mode (2026), reduciendo
  la barrera de precio de material en el segmento profesional
→ El segmento water-washable crece como puerta de entrada doméstica — reduce fricción de
  adopción para quien no quiere manejar IPA en casa, aunque no elimina el riesgo químico
```
