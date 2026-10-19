---
name: diseccionador
description: El BISTURÍ — el patrón para disecionar una tarea amorfa en procesos con FORMA asignada. Parte la tarea en verbos atómicos (el espinazo) y pasa cada paso por las 6 PREGUNTAS; cada respuesta asigna la forma de la pieza (reflejo puro · micro-agente fuzzy · custodio · conversor · puente) — y la forma dicta dónde vive, quién escribe, cómo se testea y qué hace ante un dato ausente. Agnóstico al dominio; caso testigo completo: prisma-compuestos.
when-to-use: Cuando llega una tarea/faceta nueva sin forma todavía ("gestionar X", "llevar Y", "coordinar Z") y hay que decidir QUÉ piezas construir antes de construirlas — disecciona ANTES de codificar. También para auditar una parcela existente (¿cada pieza tiene la forma que le toca?). NO para ejecutar una parcela ya disecionada (eso lo hace su propia skill, p.ej. prisma-compuestos).
---

# Diseccionador — de tarea amorfa a piezas con forma

> El corte maestro: **separar lo que un test puede afirmar de lo que necesita juicio.**
> Todo lo demás se ordena solo detrás de ese corte.
>
> Caso testigo (parcela completa parida con este patrón): `prisma-compuestos`
> (guión: `arquitectura/decisiones/propuestas/prisma-compuestos.md` · skill hermana: `prisma-compuestos`).

## El método

```
METODO diseccionar(tarea): Array<Pieza> {

  pasos ← partir(tarea)          // el ESPINAZO: verbos atómicos, en orden de flujo
                                 // (ej. compuestos: LEER → RECONCILIAR → MODELAR → GUARDAR → COSTEAR → AVISAR)

  PARA CADA paso EN pasos:       // ── LAS 6 PREGUNTAS — cada una asigna FORMA ──

    1. ¿PENSAR o CALCULAR?                                   ← el corte maestro
         calcular (cero juicio)      → REFLEJO JS puro       // lib en _shared + reflejo fino; test unitario lo afirma
         juicio/lenguaje/ambigüedad  → MICRO-AGENTE fuzzy    // reflejo hidrata+persiste; 1 llm.complete headless
                                                             // tools:[] + validador que NO deja inventar
         frontera exacta: lo que un test unitario puede AFIRMAR → reflejo; lo demás → fuzzy

    2. ¿Quién ESCRIBE este dato?
         un solo dueño por store     → CUSTODIO              // create-only + actualizar con snapshot; fs solo él
         dos escritores = corrupción esperando turno

    3. ¿De A UNA o en BLOQUE?
         SIEMPRE de a una            → 1 item : 1 cálculo : 1 evento
         la tanda solo existe en la INGESTA; el proceso la parte
         (la lección del POS: "todo de golpe" → timeout; de a una → fallo aislado, progreso, reintentable)

    4. ¿Qué pasa si FALTA un dato?
         nombrar el hueco + AVISAR   → pregunta_abierta / faltantes[]
         jamás estimar como si fuera real; mejor un resultado con huecos NOMBRADOS que uno completo INVENTADO

    5. ¿Dónde CRUZAN formatos/unidades/dimensiones?
         una sola frontera           → CONVERSOR puro        // no N conversiones dispersas por el código
         (ej: el costeador convierte a base UNA vez, antes de multiplicar)

    6. ¿Cómo se CONECTA con lo vecino?
         por EVENTO, sin pisar lo manual → PUENTE            // aplicar vs testigo; gate si nadie referencia
         nunca por import directo entre parcelas

  RETORNAR piezas                // cada pieza CON su forma — y la forma dicta el resto
}
```

## Lo que la forma dicta (por qué basta con asignarla)

```
REFLEJO puro      vive en _shared (lib) + módulo fino · se testea con asserts directos · determinista
MICRO-AGENTE      vive en el módulo actor · guión-prompt inline + validador PURO testeado · el LLM jamás persiste
CUSTODIO          vive en modules/<mundo>/<dato>/ · único fs.write de su store · emite <dato>.creado/actualizado
CONVERSOR         vive en _shared · cero estado, cero red · expuesto al bus por reflejo fino
PUENTE            sin store propio · solo escucha y delega · no pisa decisiones humanas (testigo)
```

## Reglas transversales (valen para toda pieza)

```
· clasificación/taxonomía  = campos ABIERTOS + proyección derivada de list() — NUNCA registro previo
                             (anti-patrón declara-antes-de-actuar: el valor NACE del acto)
· reconciliar ANTES de crear — la biblioteca no se duplica (normaliza+similitud en reflejo; sinónimo/idioma en fuzzy)
· estimación prudente        — donde hay estimación, sesgo conservador declarado (referencia ≠ compra, p75)
· referencia, no embebido    — los entes se apuntan por ref/id canónico; cambiar en UN sitio propaga
```

## El ciclo de obra (cómo se ejecuta la disección)

```
1. ASENTAR     el guión en arquitectura/decisiones/propuestas/<parcela>.md — el modelo se acuerda ANTES de codificar
2. CONSTRUIR   pieza a pieza, en orden de dependencia (custodios → motor → fuzzy → conversor → puente)
3. VERIFICAR   test PURO por pieza ANTES de seguir · commit al verde · la suite entera antes de cada push
4. COSER       las fronteras (unidades, eventos, contratos) — cada costura con su test de integración
5. PODAR       retirar lo viejo SOLO tras verificar quién depende de verdad (grep de emisores/imports, no de prosa)

Freno humano SOLO en lo irreversible (borrar, fusionar identidades, pisar precios). Todo lo demás fluye.
```

## Anti-patrones

```
· pieza fuzzy haciendo trabajo de reflejo   → el POS petó por esto (un LLM procesó el catálogo en bloque)
· pieza reflejo intentando juicio           → if-chains frágiles imitando sinónimos; eso es del micro-agente
· conversiones dispersas                    → cada call-site convierte a su manera → drift; UNA frontera
· registro que debe pre-existir             → 409 declara-antes-de-actuar; el recurso nace del acto
· inventar el dato que falta                → deuda invisible; el hueco nombrado ES el onboarding
· construir sin guión asentado              → se re-litiga a mitad de obra; asentar primero es más rápido
```

## Filosofía (una frase)

La tarea no se ataca: se diseciona. Cada pieza, al saber QUÉ es, ya sabe dónde vive, quién la
escribe, cómo se prueba y qué hace cuando le falta algo. El patrón no construye — garantiza que
lo construido tenga siempre la misma anatomía sana, en cualquier faceta.
