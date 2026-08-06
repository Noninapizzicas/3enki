# Esquema — CIMIENTO DE AGENTES v3 (árbol maestro)

> Sujeto esquematizado: el aparato que ejecuta trabajadores inteligentes con garantía de que su trabajo aterriza.
> Método: prisma recursivo (2 pasadas, suelo alcanzado) + disección (FORMA por hoja).
> Ley cumplida: **0 tecnologías nombradas** — todo lo del entorno es puerto abierto.

## El árbol (todo embebido)

```
CIMIENTO DE AGENTES v3
│
├─ [ATÓMICO] TRABAJADOR · MICRO-AGENTE fuzzy
│     produce según mandato con las herramientas de su perfil
│     NUNCA certifica su propio trabajo
│     └─ perfil: qué es · qué usa · QUÉ ENTREGA (la promesa)
│     └─ mandato: la tarea con su contexto
│
├─ [ATÓMICO] JEFE · REFLEJO puro (un test afirma su veredicto)
│     comprueba la producción contra la promesa
│     determinista · la prueba es objetiva · no juzga calidad, solo existencia
│     └─ regla-de-verificación: tabla por tipo de promesa
│       (objeto · evento · respuesta · juicio [puerto abierto])
│
├─ [ATÓMICO] TALLER · REFLEJO (orquestación determinista)
│     ejecuta al trabajador dentro de presupuesto · registra pasos · permite reanudar
│     NUNCA corta en silencio · presupuesto POR TAREA (no default que mutile)
│     └─ bitácora · CUSTODIO (único escritor del registro de pasos)
│     └─ presupuesto · REFLEJO (límites por tarea: avance, tamaño, tiempo, iteraciones)
│     └─ reanudador · REFLEJO+CUSTODIO (estado persistido → continuar desde el último paso)
│
├─ [ATÓMICO] CONTRATO · REFLEJO (validación de esquema)
│     define qué se promete · cómo se verifica · qué se entrega
│     estable hacia fuera: se amplía, no se rompe
│     sin promesa → no-verificado EXPLÍCITO
│     └─ veredicto: verificado + PRUEBA | no-verificado-explícito | fallido-honesto
│
└─ [ATÓMICO] VITRINA · PUENTE (proyecta, no escribe)
      muestra el avance REAL de la bitácora al exterior
      solo cuenta lo registrado · no inventa ni adelanta
      └─ vista-de-avance: estado · paso actual · pasos hechos · duración
```

## Los 5 principios (destilados del prisma — la RESTRICCIÓN en positivo)

```
P1 · SUCCESS = ENTREGABLE VERIFICADO     (el jefe existe y es innegociable)
P2 · CERO CORTES SILENCIOSOS             (presupuesto por tarea; fallido-honesto > humo)
P3 · EL TRABAJADOR PRODUCE, EL SISTEMA JUZGA  (perspectiva-C, la filosofía Enki)
P4 · CHECKPOINT POR PASO                 (la bitácora es custodio; interrupción ≠ pérdida)
P5 · CONTRATOS EXTERNOS ESTABLES         (la vitrina y el contrato se amplían, no se rompen)
```

## Recuento

| Cuenta | Valor |
|---|---|
| Pasadas del prisma | 2 (suelo en la 2ª) |
| Hojas atómicas | 5 entidades · 8 hojas internas (perfil, mandato, regla, bitácora, presupuesto, reanudador, veredicto, vista) |
| Reparto de formas | 1 MICRO-AGENTE · 7 REFLEJO · 2 CUSTODIO (bitácora, reanudador) · 1 PUENTE (vitrina) · 0 CONVERSOR |
| Puertos abiertos | `verificar(juicio)` (entregable fuzzy) · `persistir(paso)` (bitácora) · `observar(avance)` (vitrina) · `ejecutar(herramienta)` (trabajador) |
| Tecnologías nombradas | **0** ✅ (prueba de fuego superada) |

## El ciclo de vida (estados)

```
solicitado → ejecutando → pausado ⇄ resumido → verificado → entregado
                          ↘ fallido-honesto (no cabe / no existe / sin progreso)
```

## Preguntas abiertas (heredadas, sin cerrar a propósito)

1. Entregable fuzzy ("una decisión") → puerto `verificar(juicio)` o no-verificado explícito.
2. ¿Avance mínimo en tareas de pensamiento puro (sin herramientas)?
3. ¿Quién vigila al vigilante? (el jefe es reflejo — ¿y si el reflejo falla?)
4. ¿La reanudación conserva el presupuesto restante o lo reinicia?
