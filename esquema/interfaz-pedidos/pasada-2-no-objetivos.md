# Pasada 2 — Prisma de los sub-productos de NO-OBJETIVOS

---

## 2.12 Operador vs Cliente

**IDENTIDAD:** La frontera entre la interfaz de gestión (para quien opera el negocio) y la interfaz de consumo (para quien compra).

**RESTRICCIONES:** El operador ve todo el ciclo de vida; el cliente ve solo su pedido. El operador actúa sobre muchos pedidos; el cliente sobre el suyo.

**CONTRATO:** La interfaz de operador expone el control completo. La de cliente expone solo lo que le compete.

→ ATÓMICO (es una frontera declarable: quién ve qué y quién hace qué)

---

## 2.13 Control vs Análisis

**IDENTIDAD:** La frontera entre operar en tiempo real (actuar sobre pedidos vivos) y analizar después (métricas, tendencias, histórico).

**RESTRICCIONES:** Esta interfaz es de control. El análisis es otro sujeto con otra anatomía.

→ ATÓMICO (es un corte de alcance: esta interfaz = tiempo real, no histórico)
