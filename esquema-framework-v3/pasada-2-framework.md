# Pasada 2 — Prisma sobre cada sub-producto

## 2.1 · TRABAJADOR

- **Identidad:** produce según un mandato, usando las herramientas que su perfil declara.
- **Restricciones:** no certifica su trabajo; no decide el orden de la obra; no persiste lo definitivo (solo produce).
- **Contrato:** entrada = mandato + contexto; salida = producción cruda.
- **No-objetivos:** no verifica, no juzga, no se autoevalúa como hecho.
- **Abiertas:** ¿qué herramientas necesita para cada tipo de mandato?

→ Hojas: `perfil` (qué es, qué usa, qué entrega) · `mandato` (la tarea con su contexto).

## 2.2 · JEFE

- **Identidad:** comprueba la producción contra la promesa del perfil.
- **Restricciones:** determinista — un test puede afirmar su veredicto; la prueba es objetiva (existe / no existe / cumple / no cumple).
- **Contrato:** entrada = promesa + mundo real; salida = veredicto CON prueba.
- **No-objetivos:** no corrige el trabajo; no juzga calidad — solo si EXISTE como se prometió.
- **Abiertas:** entregables fuzzy ("una decisión") → puerto `verificar(juicio)`.

→ Hoja: `regla-de-verificación` (tabla por tipo de promesa).

## 2.3 · TALLER

- **Identidad:** ejecuta al trabajador dentro de un presupuesto, registra cada paso, permite reanudar.
- **Restricciones:** nunca corta en silencio; todo paso queda registrado; presupuesto por tarea (no default que mutile).
- **Contrato:** entrada = mandato + perfil; salida = producción + bitácora.
- **No-objetivos:** no decide el mandato; no verifica (eso es el jefe).
- **Abiertas:** ¿presupuesto restante al reanudar? ¿varios trabajos a la vez sin pisarse?

→ Hojas: `bitácora` (registro de pasos) · `presupuesto` (límites por tarea) · `reanudador` (estado persistido → continuar).

## 2.4 · CONTRATO

- **Identidad:** define qué se promete, cómo se verifica, qué se entrega.
- **Restricciones:** estable hacia fuera — se amplía, no se rompe; sin promesa → no-verificado explícito.
- **Contrato:** entrada = definición del trabajo; salida = acuerdo verificable.
- **No-objetivos:** no es documentación para humanos — es máquina-legible y validable.
- **Abiertas:** ¿esquema rígido o extensible por dominio?

→ Hojas: `perfil` (ya en 2.1) · `veredicto` (cómo se reporta el resultado).

## 2.5 · VITRINA

- **Identidad:** muestra el avance real al exterior; solo cuenta lo registrado.
- **Restricciones:** el progreso mostrado es el de la bitácora — no se inventa ni se adelanta.
- **Contrato:** entrada = bitácora; salida = vista del avance.
- **No-objetivos:** no permite mandar; solo observar (y ofrecer reanudar).
- **Abiertas:** ¿qué nivel de detalle muestra?

→ Hoja: `vista-de-avance`.

## Convergencia

Las hojas salidas: perfil · mandato · regla-de-verificación · bitácora · presupuesto · reanudador · veredicto · vista-de-avance.
Todas son ATOMICAS (un test las afirma) o REPETIDAS (perfil). Suelo alcanzado → Fase 3 (disección).
