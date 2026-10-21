# Pasada 2 · Las piezas del motor (prisma, ronda 2 — cada sub-producto al prisma)

> Del CONTRATO de la pasada 1 salen las piezas. Cada una pasa por el prisma
> (identidad · restricciones · contrato · no-objetivos · preguntas) hasta tocar
> suelo atómico. El prisma se agota aquí: las piezas son atómicas (un test las
> afirma) → van a la disección (pasada 3).

## P1 · Ejecutor de pipelines
- IDENTIDAD: recorre los pasos declarados en orden; en cada paso decide: reflejo → ejecuta el determinista; fuzzy → abre el puerto de generación y espera validación.
- RESTRICCIONES: nunca salta un paso; nunca ejecuta él mismo el contenido fuzzy; un paso a la vez (nada de bloques).
- CONTRATO: entra (pipeline + contexto del proyecto); sale (veredicto del entregable o siguiente paso).
- NO-OBJETIVOS: no genera, no decide el contenido, no inventa.
- PREGUNTAS: — (suelo: atómico, un test lo afirma).

## P2 · Registro de pipelines
- IDENTIDAD: la definición de cada agente: pasos (orden, tipo, validaciones), entregable (qué promete + reglas), presupuesto.
- RESTRICCIONES: un solo escritor; nadie define un pipeline fuera del registro.
- CONTRATO: declarar(pipeline), obtener(nombre) → pipeline, listar().
- NO-OBJETIVOS: no ejecuta; no contiene el contenido generado.
- PREGUNTAS: — (suelo: atómico).

## P3 · Validador de salidas fuzzy
- IDENTIDAD: comprueba la salida generada contra reglas fijas (estructura, tamaño, campos) ANTES de que continúe el pipeline.
- RESTRICCIONES: puro determinista — cero juicio, cero red.
- CONTRATO: validar(salida, reglas) → veredicto de paso (ok | corregir + detalle).
- NO-OBJETIVOS: no genera; no decide si "suena bien" (eso es fuzzy).
- PREGUNTAS: — (suelo: atómico).

## P4 · Verificador de entregable (el JEFE)
- IDENTIDAD: al final del pipeline, comprueba el entregable prometido contra el MUNDO REAL (leer el sitio donde debía aparecer) con reglas declaradas.
- RESTRICCIONES: determinista; verificado:false = veredicto, jamás éxito; jamás acepta la palabra del generador.
- CONTRATO: verificar(entregable, mundo) → veredicto (verificado, reglas[], motivo).
- NO-OBJETIVOS: no es otro LLM juzgando; no aprueba sin leer el mundo.
- PREGUNTAS: — (suelo: atómico).

## P5 · Puerto de generación (el FUZZY — único micro-agente)
- IDENTIDAD: GENERA contenido nuevo donde el pipeline lo declara: instrucción + contexto → salida cruda.
- RESTRICCIONES: nunca persiste, nunca ejecuta, nunca decide el flujo; contrato de salida estricto; su salida SIEMPRE pasa por P3 antes de continuar.
- CONTRATO: generar(instruccion, contexto) → salida cruda (texto/estructura).
- NO-OBJETIVOS: no toca el mundo real; no verifica su propio trabajo.
- PREGUNTAS: qué modelo usa → puerto abierto (la pieza declara el puerto; el sitio que aterriza cablea el proveedor).

## P6 · Bitácora
- IDENTIDAD: registra cada paso de cada ejecución (qué se hizo, qué devolvió, veredictos).
- RESTRICCIONES: un solo escritor (el motor); todo lo que el pipeline hace pasa por ella.
- CONTRATO: registrar(paso), leer(execucion) → pasos.
- NO-OBJETIVOS: no decide; no es un log de infraestructura suelto.
- PREGUNTAS: — (suelo: atómico).

## P7 · Rail de estados
- IDENTIDAD: mantiene el estado de cada fase/pipeline (declarado, ejecutando, verificado, fallido, pausado) y no deja avanzar sin pasar su puerta.
- RESTRICCIONES: un solo escritor; el avance de fase solo tras el veredicto del entregable.
- CONTRATO: avanzar(estado), estado(proyecto, fase) → estado.
- NO-OBJETIVOS: no ejecuta pipelines; no decide el contenido.
- PREGUNTAS: — (suelo: atómico).

## P8 · Vitrina
- IDENTIDAD: proyecta a quien mire (marco, registros, chat) el progreso, los pasos y el veredicto.
- RESTRICCIONES: no escribe; solo lee bitácora/rail y emite proyecciones.
- CONTRATO: observar(execucion) → proyeccion.
- NO-OBJETIVOS: no modifica el pipeline.
- PREGUNTAS: — (suelo: atómico).

## P9 · Reanudador
- IDENTIDAD: retoma ejecuciones pausadas o fallidas desde su bitácora: punto de reanudación + veredicto anterior como instrucción de corrección.
- RESTRICCIONES: solo reanuda lo que tiene bitácora; nunca reinicia desde cero en silencio.
- CONTRATO: reanudar(execucion) → nueva ejecución con contexto corregido.
- NO-OBJETIVOS: no inventa el punto de reanudación; no decide si merece la pena (eso lo declara el presupuesto).
- PREGUNTAS: — (suelo: atómico).

## P10 · Conversor de salida (el adaptador de la frontera)
- IDENTIDAD: UNA sola frontera donde la salida cruda del generador se convierte a la estructura que el validador y el resto del pipeline entienden.
- RESTRICCIONES: cero estado, cero red; una sola conversión por pipeline (la lección del costeador: convertir a base UNA vez).
- CONTRATO: convertir(salida_cruda) → salida_canónica (o error de formato con detalle).
- NO-OBJETIVOS: no valida contenido (eso es P3); no genera.
- PREGUNTAS: — (suelo: atómico).

## Prisma agotado
Todas las piezas son atómicas (un test las afirma) → Fase 3: disección con las
6 preguntas (pasada-3-diseccion.md).
