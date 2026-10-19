# Pasada 1 — Mesa alta 105

> Prisma de 5 huecos sobre el sujeto crudo. Nivel 1.
> Ley de agnosticismo: el material y las cotas son IDENTIDAD del sujeto (la mesa es de madera, 105 cm).
> Todo lo de fabricación/unión/medida sale como PUERTO ABIERTO — no se nombra tecnología del entorno.

## IDENTIDAD

- **Qué es:** una mesa alta de bar, de pie, para comer o trabajar de pie.
- **Altura total:** 105 cm (superficie de trabajo).
- **Superficie:** tablero de madera, 400 × 1500 × 30 mm (ancho × largo × grosor).
- **Soporte:** 4 patas de madera, sección 58 × 58 mm, longitud 1020 mm.
- **Rigidez:** 3 travesaños de madera, sección 40 × 40 mm:
  - 2 laterales (a lo largo, pata a pata por cada lado largo)
  - 1 central (a lo ancho, derecha ↔ izquierda)
- **Posición de patas:** retranqueadas ~20 mm del borde del tablero (no en las esquinas exactas).
- **Altura de travesaños:** laterales a ~250 mm del suelo; el central por encima de los laterales.

## RESTRICCIONES

- Altura total fija: 105 cm (pata 1020 + tablero 30 = 1050).
- Sección de patas fija: 58 × 58.
- Sección de travesaños fija: 40 × 40.
- Tablero fijo: 400 × 1500 × 30.
- Estabilidad: la mesa no debe tambalearse; las uniones deben rigidizar el conjunto.
- Desmontable: las piezas de unión deben permitir montar/desmontar sin dañar la madera.
- El travesaño central cruza por encima de los laterales (no a la misma altura).

## CONTRATO

- **Entrada:** un tablero, 4 patas, 3 travesaños, todos de madera con las cotas dadas.
- **Salida:** una mesa alta estable de 105 cm, con las piezas de unión que la ensamblan.
- **Piezas de unión (lo que hay que diseñar):**
  1. Unión tablero → pata (4, una por esquina).
  2. Unión travesaño lateral → pata (4: 2 travesaños × 2 extremos).
  3. Unión travesaño central → pata (2: 1 travesaño × 2 extremos).
- **Cada unión declara:** qué abraza (secciones), cómo se fija a cada miembro, y cómo se desmonta.

## NO-OBJETIVOS

- No es una mesa de comedor sentada (es de pie).
- No es un mueble empotrado ni fijo a pared.
- No incluye estantes, cajones ni almacenamiento.
- No es un taburete ni una encimera de cocina.
- No busca ocultar las uniones (las piezas de unión son visibles y forman parte del diseño).

## PREGUNTAS_ABIERTAS

- ¿Qué tornillería hay disponible para fijar las uniones a la madera? [ABIERTO]
- ¿El travesaño central va a la misma altura que los laterales o claramente por encima? (dicho: por encima) [ABIERTO — confirmar cuánto]
- ¿Las patas van retranqueadas 20 mm en ambos ejes (largo y ancho) o solo en uno? (dicho: ambos ejes — 20 mm largo y ancho) [CERRADO]
- ¿Se necesita nivelación del suelo (zapatas) o el suelo está plano? [ABIERTO]
- ¿El tablero va atornillado a las patas o solo apoyado sobre las uniones? [ABIERTO]
