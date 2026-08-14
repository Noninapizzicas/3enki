---
tipo: normativa
sector: baterias-almacenamiento
tags: [normativa, adr, un3480, transporte, raee, espana, almacenamiento-energetico]
---
# Normativa y transporte — ADR, UN3480, regulación España, gestión de residuos

> La normativa de baterías de litio no está pensada para frenar al DIY, está pensada para un mundo donde miles de packs viajan cada día en avión y camión — conocerla evita tanto el susto de una devolución en Correos como el error de subestimar de verdad el riesgo de mercancía peligrosa que se transporta.

---

## Clasificación de transporte — ADR e IATA

```
UN3480: baterías de litio-ion EMBALADAS SOLAS (sin equipo), la
  clasificación que aplica a la mayoría de celdas y packs sueltos que
  compra o vende un proyecto DIY
UN3481: baterías de litio-ion EMBALADAS CON o DENTRO de un equipo
  (ej. un power bank montado, una herramienta con su batería instalada)

CLASE DE MERCANCÍA PELIGROSA: Clase 9 (mercancías peligrosas diversas)
  en el reglamento ADR (transporte terrestre por carretera en Europa) y
  en la normativa IATA (transporte aéreo internacional)

REQUISITOS DE ENVÍO (celdas/packs sueltos, cantidades no exentas):
  Embalaje homologado según las pruebas de seguridad exigidas por ADR
  (no vale cualquier caja de cartón)
  Etiquetado con el número ONU precedido de "UN" (tamaño mínimo 12mm) y
  la etiqueta de Clase 9 (mínimo 100mm)
  Documentación de mercancía peligrosa cuando el envío lo requiere
  (declaración del remitente)

CANTIDADES EXENTAS: existen umbrales de watios-hora (Wh) por celda/pack
  y por bulto por debajo de los cuales aplican reglas simplificadas —
  varían según transportista y modalidad (aéreo más estricto que
  terrestre); consultar siempre la política específica del transportista
  elegido antes de enviar, no asumir que "es pequeño así que no aplica"

TRANSPORTISTAS: FedEx, DHL y similares publican guías propias con sus
  requisitos concretos para España — la política de Correos España para
  celdas/packs sueltos de litio conviene confirmarla directamente antes
  de dar por hecho que aceptan el envío sin restricciones
```

---

## Comprar celdas desde fuera de la UE — lo que cambia

```
Los envíos de celdas sueltas desde fabricantes/distribuidores fuera de
  la UE (China, principalmente) están sujetos a la misma clasificación
  de mercancía peligrosa, lo que en la práctica limita mucho el envío
  aéreo directo de particular a particular — es la razón por la que la
  comunidad DIY prioriza proveedores con ALMACÉN EN EUROPA (envío
  terrestre/marítimo ya nacionalizado) frente a comprar directo a fábrica
  china, evitando además la incertidumbre de aduanas e impuestos de
  importación en cada pedido individual
```

---

## Regulación del almacenamiento energético en España

```
SITUACIÓN 2026: no existe todavía una normativa específica y unificada
  para almacenamiento energético en España — las instalaciones se rigen
  por analogía con el régimen jurídico de generación

MARCO APLICABLE A INSTALACIONES DE MAYOR ESCALA:
  RD 1183/2020 — acceso y conexión a redes de transporte y distribución
  eléctrica, aplicable a instalaciones de almacenamiento conectadas
  Ley 21/2013 — evaluación ambiental, aplicable a instalaciones de
  almacenamiento electroquímico stand-alone de cierta escala
  Estrategia de Almacenamiento Energético (aprobada 2021) — marco de
  objetivo país (30 GW en 2050), no regulación técnica directa aplicable
  al proyecto doméstico individual

PARA UN PROYECTO DOMÉSTICO DIY (banco de algunos kWh en vivienda
  unifamiliar, sin conexión a red de forma independiente del inversor
  del hogar): la instalación eléctrica de baja tensión sigue el
  Reglamento Electrotécnico de Baja Tensión (REBT) general, no una
  normativa específica de baterías — el punto de atención práctico es
  el cableado, protecciones y puesta a tierra del conjunto, no un
  permiso especial por tener batería de litio en casa
  → Ver el detalle de protecciones eléctricas compartido con el sector
  solar en [[../solar-fotovoltaica-diy/Seguridad eléctrica — protecciones CC-CA, puesta a tierra]]
```

---

## Gestión de residuos — RAEE y responsabilidad del punto de venta

```
LAS CELDAS/BATERÍAS DE LITIO DESCARTADAS SON RESIDUO PELIGROSO (RAEE —
  Residuos de Aparatos Eléctricos y Electrónicos, categoría pilas y
  acumuladores)

OBLIGACIÓN LEGAL: los puntos de venta de baterías portátiles en España
  están obligados a aceptar la devolución gratuita de baterías usadas,
  independientemente de si se compraron ahí — no es necesario guardar
  ticket ni haber comprado en ese establecimiento concreto

PUNTOS DE RECOGIDA: puntos limpios municipales, contenedores específicos
  en tiendas de electrónica y grandes superficies, gestores autorizados
  de residuos peligrosos para volúmenes de proyecto de mayor escala

QUÉ NO HACER NUNCA: depositar celdas de litio en el contenedor de
  reciclaje genérico (amarillo/envases) o en la basura orgánica — el
  riesgo de incendio en plantas de reciclaje por baterías de litio mal
  depositadas es un problema documentado y creciente a nivel europeo
```

---

## Errores comunes en normativa y transporte

```
★★★★★ Enviar celdas/packs sueltos sin verificar la política del
  transportista respecto a mercancía peligrosa, asumiendo que "es solo
  una pila" — riesgo de retención del envío, sanción, o en el peor caso
  incidente en tránsito por embalaje inadecuado
★★★★☆ Comprar celdas directamente a fábrica china sin verificar si el
  vendedor gestiona correctamente el envío como mercancía peligrosa —
  origen habitual de envíos retenidos en aduana o perdidos
★★★☆☆ Descartar celdas de litio en el contenedor de reciclaje genérico
  por desconocimiento de la obligación de devolución en punto de venta
★★★☆☆ Asumir que un banco doméstico de varios kWh requiere permiso
  especial en España más allá de cumplir el REBT general de la
  instalación eléctrica — confusión habitual que lleva a sobreestimar
  la carga burocrática de un proyecto DIY doméstico
```

---

## Novedades 2025-2026

```
→ El SAE G27 Lithium Battery Packaging Performance Committee sigue
  desarrollando estándares de embalaje de contención probado para
  transporte, con relevancia creciente para fabricantes y también para
  particulares que envían/reciben packs de cierto tamaño.
→ España mantiene su marco normativo de almacenamiento energético en
  evolución hacia el objetivo de 30 GW en 2050, sin que a 2026 exista
  aún una regulación específica unificada que sustituya la aplicación
  por analogía del régimen de generación — seguimiento recomendado para
  quien planee una instalación de escala superior a la doméstica.
```

---

→ Riesgo físico que motiva esta normativa: [[Seguridad — thermal runaway, almacenamiento, extinción de incendios]]
→ Criterios de descarte y gestión de celdas al final de su vida: [[Reciclaje y recuperación de celdas — testeo, criterios, cuándo descartar]]
