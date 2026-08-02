# Prueba: Estufa Rocket con skills actualizadas

> Pipeline: prisma (actualizado) → diseccionador (v3 abstracto)
> Generado: 2026-07-23

---

## Paso 1 — Prisma

### IDENTIDAD

Estufa de leña eficiente. Cocina y calienta ambientes con la mitad de combustible que un fogón abierto.

### RESTRICCIONES

Solo biomasa sólida. Requiere chimenea vertical aislada. Cámara de combustión debe alcanzar alta temperatura.

### CONTRATO

Atributos: tipo, material, combustible, potencia_kw, dimensiones.
Opciones: masa térmica, intercambiador de agua, hornilla, cenicero.

### NO-OBJETIVOS

No es eléctrica, no es a gas, no es calefacción central, no produce calor instantáneo.

### PREGUNTAS_ABIERTAS

Precio, stock, certificaciones, garantía.

### Arquetipo

| Eje | Valor |
|---|---|
| tiempo | instante |
| ciclo | de_ida |
| stock | unidades |
| precio | por_unidad |

**Arquetipo: pieza**

---

## Paso 2 — Diseccionador

### PARTIR

```
DESCOMPONER → CLASIFICAR → VALIDAR → GUARDAR → DERIVAR
```

### CLASIFICAR

| Verbo | ¿JUICIO o MECÁNICA? | Forma |
|---|---|---|
| DESCOMPONER | JUICIO | MECÁNICA_BLANDAS |
| CLASIFICAR | MECÁNICA | MECÁNICA_DURA |
| VALIDAR | MECÁNICA | MECÁNICA_DURA |
| GUARDAR | MECÁNICA | MECÁNICA_DURA |
| DERIVAR | MECÁNICA | MECÁNICA_DURA |

**4 MECÁNICA_DURA, 1 MECÁNICA_BLANDAS.**

---

## Resultado

### DESCOMPONER en acción para la estufa

| Fuente | Qué busca |
|---|---|
| OCR | Foto de la estufa → nombre, material |
| Web del fabricante | Ficha técnica, potencia, dimensiones |
| Catálogo propio | Otras estufas ya modeladas (misma categoría) |
| Cruzar | Coincidencias entre fuentes → confianza |

Preguntas que haría si las fuentes no resuelven:

| Dato | ¿Se pregunta? | Por qué |
|---|---|---|
| Potencia | Sí | Sin esto no se puede clasificar ni preciar |
| Material | Sí | Sin esto no se puede clasificar |
| Precio | No | Se marca abierto (hueco 5) |
| Stock | No | Se marca abierto (hueco 5) |
| Color | No | El proceso sigue igual sin saberlo |

**El producto nace incompleto si falta precio o stock, pero no incorrecto.** Se modela con los datos que hay, se vende, y el comerciante completa el precio cuando quiera.
