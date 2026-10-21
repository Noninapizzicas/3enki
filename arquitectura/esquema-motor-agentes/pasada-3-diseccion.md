# Pasada 3 · Disección — las 6 preguntas sobre cada hoja atómica

> Skill: diseccionador. El corte maestro: separar lo que un test puede afirmar
> de lo que necesita juicio. Cada respuesta asigna la FORMA.

## Las 6 preguntas (resumen por pieza)

| Pieza | 1. ¿PENSAR o CALCULAR? | 2. ¿Quién escribe? | 3. ¿De a una? | 4. ¿Dato faltante? | 5. ¿Frontera? | 6. ¿Conexión? | FORMA |
|---|---|---|---|---|---|---|---|
| P1 Ejecutor | CALCULAR | el motor (único) | sí, un paso a la vez | nunca: sin paso no avanza | — | por evento (paso ejecutado) | **REFLEJO** |
| P2 Registro | CALCULAR | custodio único | sí | pipeline sin entregable → se declara inválido | — | por evento (pipeline.declarado) | **CUSTODIO** |
| P3 Validador | CALCULAR | nadie (no escribe) | sí, por salida | salida incompleta → corregir + detalle | consume la salida CANÓNICA | por evento (salida.validada) | **REFLEJO** |
| P4 JEFE | CALCULAR | nadie (no escribe) | sí, por entregable | mundo no legible → no verificado (nunca aprobar a ciegas) | — | por evento (entregable.verificado) | **REFLEJO** |
| P5 Puerto LLM | PENSAR (el único) | el LLM, en su salida cruda (que NADIE más escribe) | sí, por generación | instrucción incompleta → pregunta abierta, no inventa | su salida es la frontera (→ P10) | por contrato de entrada/salida | **MICRO-AGENTE** |
| P6 Bitácora | CALCULAR | el motor (único escritor) | sí, por paso | paso sin registrar = no ocurrió | — | por evento (paso.registrado) | **CUSTODIO** |
| P7 Rail | CALCULAR | custodio único | sí, por transición | estado ausente → declarado (no inventar avances) | — | por evento (estado.avanzado) | **CUSTODIO** |
| P8 Vitrina | CALCULAR | nadie (solo proyecta) | — | sin bitácora → proyección vacía honesta | — | por evento (observar) | **PUENTE** |
| P9 Reanudador | CALCULAR | nada (lee bitácora, re-despacha) | sí | sin punto de reanudación → no reanuda | — | por evento (reanudar) | **REFLEJO+CUSTODIO** |
| P10 Conversor | CALCULAR | nadie (no escribe) | sí, por salida | crudo inconvertible → error de formato con detalle | UNA frontera (crudo→canónico) | por evento (salida.convertida) | **CONVERSOR** |

## Notas de forma (lo que la forma dicta)

- **P5 (micro-agente):** el LLM jamás persiste ni decide. El reflejo hidrata la
  instrucción (P1 le da contexto) y persiste su salida (vía P10 → P3). tools: el
  generador NO tiene herramientas de mundo — solo produce texto/estructura.
- **P9 (reflejo+custodio):** lee la bitácora (lectura de custodio) y re-despacha
  (reflejo). No escribe — el nuevo paso lo escribe el motor en la bitácora.
- **P2 y P7 (custodios):** un solo escritor por store — el registro y el rail no
  admiten dos escritores (corrupción esperando turno).
- **P10 (conversor):** existe porque la salida del generador es texto crudo y el
  resto del pipeline habla estructuras — UNA conversión en la frontera, no
  conversiones dispersas por el código.
- **P3 antes de P4:** el validador vigila la salida de CADA paso fuzzy; el JEFE
  vigila el entregable FINAL contra el mundo real. Dos puertas, no una.

## Reparto de formas (el recuento)

```
REFLEJO           4   (P1 ejecutor · P3 validador · P4 JEFE · P9 reanudador*)
CUSTODIO          3   (P2 registro · P6 bitácora · P7 rail)
MICRO-AGENTE      1   (P5 puerto de generación — el ÚNICO fuzzy)
CONVERSOR         1   (P10 adaptador de salida)
PUENTE            1   (P8 vitrina)
                  ───
TOTAL            10 piezas · 1 fuzzy · 9 deterministas → ~90% determinista
```
