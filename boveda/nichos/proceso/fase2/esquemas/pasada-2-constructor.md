# PASADA 2 · PUNTO: `constructor` (F3 — crear la solución)

> F3: transforma un nicho validado + modelo preliminar en la solución real que se
> operará y cobrará. Tiene un freno DECLARADO en F0: "si Enki no sabe, presenta
> nicho+problema+dudas al admin y se valora" → puente humano.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD
El **taller** que materializa el modelo preliminar del validador en la pieza
operable: la solución (producto/servicio) + el andamiaje de negocio para
operarla. Opera con los recursos existentes del sistema (APIs, buscadores,
scraping, análisis); **si falta un recurso necesario, se crea** (invariante). La
bifurcación del validador (encontrar|construir) decide el carácter: encontrar =
ensamblar solución a demanda demostrada; construir = crear la necesidad (más
margen, más riesgo). Incluye decidir el **modelo de negocio** (cómo se cobra) para
ese nicho.

### 2 · RESTRICCIONES
- **FRENO (declarado)**: "si Enki no sabe, presenta al admin → se valora" es un
  tapón humano que puede detener la cadena (no avanza sola). → **EMPUJON**:
  **puente-humano** como pieza de excepción, no de flujo normal: solo salta cuando
  el constructor detecta un bloqueo sin alternativa; el resto del tiempo la
  construcción avanza autónoma (F5). El admin recibe un paquete cerrado
  (nicho+problema+dudas+alternativa propuesta), no un ticket abierto.
- **FRENO**: "si falta recurso, ¿cómo se crea sin plan?". → **EMPUJON**: el
  invariante crea-recurso: el constructor mantiene un catálogo de capacidades
  faltantes y su fabricación se encadena (crea el puente de suministro, no para).
- **FRENO**: decidir modelo de negocio requiere juicio. → **EMPUJON**:
  micro-agente que propone el modelo de cobro por tipo de nicho + lo confirma el
  dueño (reunión/validación del F4) antes de operar.

### 3 · CONTRATO
Recibe: veredicto viable + modelo preliminar + camino (encontrar|construir).
Emite: **solución operable + modelo de negocio de cobro + paquete de negocio
listo para operación**. En caso de bloqueo: emite el paquete puente-humano al admin.

### 4 · NO-OBJETIVOS
NO valida (F2); NO cobra (F4); NO decide el futuro del proyecto (jefe/operador).
Construye la solución y el andamiaje, no opera el cobro.

### 5 · PREGUNTAS ABIERTAS
- ¿Qué constituye "Enki no sabe" (tipo de bloqueo, dónde está el umbral de duda)?
- ¿El admin que valora el puente humano es el propio dueño u otra figura?
- ¿En cuánto está presupuestado construir una solución típica? (sin dato, se pregunta).

---

## Lo que sale (hojas / piezas)
- `puente-humano` (puente por EVENTO — excepción, no flujo normal) → hoja → disección
- `ensamblador-solucion` (construye la pieza operable) → hoja
- `catalogo-capacidades-faltantes` (crea-recurso) → hoja
- `proponedor-modelo-cobro` (micro-agente) → hoja
