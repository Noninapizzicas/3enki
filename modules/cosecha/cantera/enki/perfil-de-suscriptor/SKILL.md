---
name: buscador-de-nichos
description: >-
  Fase del proceso de proyecto para buscar y filtrar nichos de mercado con
  potencial de ingresos recurrentes (suscripción a informes) para el negocio
  Radar de Nichos. Alinea con el perfil de suscriptor: emprendedor solo, poco
  tiempo, tope ~49€/mes, exige evidencia y quiere acción.
when-to-use: >-
  Cuando el usuario inicie un proyecto de Radar de Nichos, pida "encontrar
  nichos", "buscar nichos rentables", "validar un nicho para informes
  recurrentes", o se necesite un ranking de nichos candidatos para un informe
  de suscripción.
tags: [fase, nichos, investigacion, suscripcion, radar-de-nichos, proceso-de-proyecto]
---

# Buscador de Nichos — Fase de Proceso

## Objetivo

Identificar y rankear nichos de mercado con potencial para un producto informativo recurrente (informe mensual/trimestral) que encajen con el perfil del suscriptor de **Radar de Nichos**.

Esta fase **no** diseña el producto ni valida el informe final: solo entrega candidatos filtrados y priorizados con evidencia.

## Perfil del Suscriptor (reflejo — no negociable)

- **Emprendedor solo** (solopreneur), sin equipo, poco tiempo.
- **Tope de gasto**: ~49€/mes.
- **Exige evidencia**: datos, fuentes, números.
- **Quiere acción**: conclusiones claras, no teoría.

## Criterios de Filtrado (deben cumplirse TODOS)

| # | Criterio | Pregunta guía |
|---|----------|---------------|
| 1 | Dolor recurrente y no resuelto | ¿El dolor aparece cada mes/trimestre y sigue sin solución? |
| 2 | Disposición a pagar mensual | ¿Hay productos/servicios de ~49€/mes o más en ese nicho? |
| 3 | Audiencia accesible | ¿Un emprendedor solo puede acceder a esa audiencia con poco tiempo? |
| 4 | Evidencia de demanda | ¿Hay foros activos, keywords con volumen, búsquedas, quejas repetidas? |
| 5 | Competencia no saturada | ¿Hay hueco frente a informes/suscripciones existentes? |
| 6 | Potencial informativo recurrente | ¿Se puede producir un informe nuevo cada mes/trimestre? |

## Proceso

### Paso 1 — Generar candidatos (amplio)

Busca nichos con dolor recurrente en:

- Búsqueda web (tendencias, problemas repetidos).
- Comunidades: subreddits, foros, grupos de Facebook, Slack, Discord.
- Directorios de suscripciones (Substack, Patreon, newsletters de pago).
- Directorios de marketplaces (Gumroad, Etsy digital, Udemy).
- Pain points recurrentes en reviews de productos.

Usa las puertas del bus si aplica:

- `bibliotecario.consultar({consulta})` para conocimiento previo en la bóveda.
- `cosecha.buscar.request` para skills de investigación relevantes.
- Si necesitas ejecutar una herramienta de scraping/análisis, usa `ejecutor.ejecutar.request` (con aislamiento si el input es externo).

**Meta**: 10–20 nichos candidatos.

### Paso 2 — Criba rápida (checklist)

Aplica los 6 criterios como checklist. Descarta cualquier nicho que falle **uno solo**.

Preguntas de descarte rápido:

- ¿El dolor es puntual (ej. "mudanza")? → descartar.
- ¿La audiencia no puede pagar 49€/mes? → descartar.
- ¿Acceder a la audiencia requiere campañas caras o equipo? → descartar.
- ¿Ya hay 10 informes/suscripciones dominando? → descartar (salvo evidencia de hueco claro).
- ¿No se puede producir un informe mensual sin morir en el intento? → descartar.

### Paso 3 — Evidencia y verificación

Para cada candidato que pase la criba, recoge **evidencia verificable**:

- **Demanda**: hilos activos en foros, número de miembros, frecuencia de posts, keywords (Google Trends, autocompletado, Keywords Everywhere si está disponible), grupos con actividad reciente.
- **Disposición a pagar**: precios reales de productos/servicios del nicho. Si nadie paga >20€/mes, baja la puntuación.
- **Competencia**: lista de informes/newsletters/suscripciones existentes. ¿Cuántos? ¿Qué ofrecen? ¿Qué hueco dejan?
- **Recurrencia**: ejemplos de que el dolor se repite cada mes (nuevos episodios en foros, fechas de posts, cobros recurrentes de servicios).

**Nota**: Guarda la evidencia con URL y fecha. Si un dato es "dudoso" (sin fuente clara), márcalo como tal y no lo des por firme.

### Paso 4 — Puntuación y ranking

Puntúa cada criterio de 0 a 5 y pondera:

| Criterio | Peso | 0–5 | Ponderado |
|----------|------|-----|-----------|
| Dolor recurrente y no resuelto | 25% | | |
| Disposición a pagar mensual | 20% | | |
| Audiencia accesible | 15% | | |
| Evidencia de demanda | 20% | | |
| Competencia no saturada | 10% | | |
| Potencial informativo recurrente | 10% | | |

**Total** = suma de (puntuación × peso).

Ordena de mayor a menor. Entrega un ranking con:

- Nombre del nicho.
- Puntuación total.
- Nota corta (por qué).
- Evidencia clave (URLs o datos concretos).
- Riesgos / puntos débiles.

### Paso 5 — Alineación con el perfil (verificación final)

Del top 3, verifica explícitamente cada punto del perfil del suscriptor:

- [ ] ¿El emprendedor solo con poco tiempo puede consumir/entender este informe en <15 min?
- [ ] ¿El precio propuesto de 49€/mes es coherente con lo que el nicho ya paga?
- [ ] ¿La evidencia presentada es suficiente para que el suscriptor "exigente" la acepte?
- [ ] ¿El informe sugiere una acción concreta de negocio?

## Entregable

1. **Ranking** de nichos candidatos con puntuación y justificación (tabla).
2. **Evidencia** enlazada/adjunta por candidato.
3. **Recomendación final**: 1 nicho prioritario + alternativas.
4. **Notas de riesgo** para el nicho recomendado.

## Pitfalls

- **No inventar evidencia**: cada afirmación de demanda o disposición a pagar debe provenir de una fuente citada o una consulta real al sistema. Si no puedes verificarlo, dilo.
- **No confundir dolor puntual con recurrente**: un pico en Google Trends no implica un dolor mensual.
- **No asumir disposición a pagar**: si no hay productos de pago comparables en el nicho, baja la puntuación aunque la demanda sea alta.
- **No saturar de información**: pide solo los libros/skills que la tarea justifique, no cargues todo el corpus.
- **No prometer ingresos recurrentes**: esta fase solo detecta oportunidades; la validación real viene después.
- **No forzar un nicho** que no cumpla los 6 criterios "para tener algo que entregar". Si no hay ninguno que pase, dilo: "ningún candidato cumple todos los criterios".
- **No auto-verificar resultados de otras puertas**: si una skill o consulta devuelve `{ok:false}` o no devuelve datos, no afirmes que sí.

## Uso en el proceso de proyecto

Esta skill es una fase del proceso global de **Radar de Nichos**. Al terminar, entrega el control a la siguiente fase (ej. diseñar el informe, esquematizar el negocio, validar precio) y **confirma con el usuario** antes de avanzar.