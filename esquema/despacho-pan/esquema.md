# ESQUEMA — Interfaz de cliente (web de consumo) · Despacho de pan

> Árbol maestro de la cara de CONSUMO. Sujeto: el recorrido del cliente final
> (descubrir → elegir → comprar → pagar → recoger → repetir) que convierta y fidelice.
> Alimento: FASE 0 (identidad) + FM0 (marketing) + FM1 (qué construir).
> Método: esquematizador-interfaz-cliente (prisma de 5 huecos con lente cliente + apartados + formas).
> Estado: COMPLETO — prisma secado en 2 pasadas (pasada-1 + pasada-2 recursión).

## El recorrido de conversión (3 capas)

```
1. DESCUBRIR  — hero-promesa: quién eres, qué prometes, diferenciador
2. ELEGIR     — catálogo: tarjetas de producto + selector (cantidad, franja, recurrencia)
3. CONVERTIR  — flujo-pedido: carrito → pago → confirmación → recogida
+ REPETIR     — reenganche: recordatorio semanal, aviso, oferta recurrente
```

## Árbol maestro de hojas (con estado)

> Estado: [ABIERTO] = hueco de negocio sin decidir · ATÓMICO = dibujable por el agente de UI
> · SPAWN = se descompuso en sub-hojas · REF = referencia a otra interfaz (jefe/POS).

| Hoja | Forma UI | Estado | Señal pareada |
|---|---|---|---|
| Hero-promesa | `hero-promesa` | **ATÓMICO** | catálogo cargado |
| Catálogo | `tarjeta-item` | **ATÓMICO** | precio actualizado al elegir |
| Selector de opciones | `selector-opciones` | **ATÓMICO** | selección confirmada |
| Flujo de pedido | `flujo-pedido` | **SPAWN** → pasada-2 | "pedido confirmado" |
| ├─ Resumen de pedido | `resumen-pedido` | **ATÓMICO** | items + total antes de pagar |
| ├─ Botón de pago | `boton-pago` | **ATÓMICO** | pago iniciado (link de pago) |
| └─ Confirmación de pedido | `confirmacion-pedido` | **ATÓMICO** (REF `señal-confirmacion`) | "pedido confirmado" |
| Recogida | `señal-confirmacion` | **ATÓMICO** | "listo para recoger" |
| Reenganche | `reenganche` | **SPAWN** → pasada-2 | pedido de la semana generado |
| ├─ Aviso de repetición | `aviso-repeticion` | **ATÓMICO** | "¿repites esta semana?" |
| ├─ Botón repetir | `boton-repetir` | **ATÓMICO** | pedido semanal replicado |
| └─ Oferta recurrente | `oferta-recurrente` | **ATÓMICO** | descuento 10% aplicado |

## Hojas de GESTIÓN separadas (NO son del cliente → interfaz del JEFE, otro agente)

> Existen en el sistema pero NO entran en la web de consumo. Van a `esquematizador-jefe`.

| Hoja de gestión | Cara | Estado |
|---|---|---|
| Dashboard de métricas (P5) | JEFE | **REF** → esquematizador-jefe |
| Gestión de cuentas recurrentes | JEFE | **REF** → esquematizador-jefe |
| Configuración de precios | JEFE | **REF** → esquematizador-jefe |
| Gestión de catálogo | JEFE | **REF** → esquematizador-jefe |
| Configuración de franjas de tanda | JEFE | **REF** → esquematizador-jefe |
| Operación de cocina/recogida | POS | **REF** → POS |

## Apartados del diseño (por separado)

- **CSS** → `apartados-css.md` (paleta cálida, contraste alto, mobile-first, un paso por pantalla).
- **Iconos** → `apartados-iconos.md` (un icono por acción, icono + texto, coherencia).
- **Fuentes** → `apartados-fuentes.md` (títulos con carácter artesanal, cuerpo legible ≥16px).
- **Elementos** → `apartados-elementos.md` (hero, tarjeta, selector, flujo, señal, reenganche).
- **Lógica** → `apartados-logica.md` (cada elemento → evento del bus; señal > precio; cero merma).
- **Formas** → `apartados-formas.md` (redondeado suave, aire generoso, minimalista cálido).

## Invariantes

- Un flujo responde siempre: pedido → confirmado/fallo.
- El precio lo fija el backend; la web solo refleja (señal > precio).
- Cero merma: solo se hornea lo pagado.
- Diseño para mayores: una pregunta por pantalla, un botón grande por vez, cero inputs de texto/fechas (HOY / MAÑANA / PASADO MAÑANA).
- El camino mínimo: de descubrir a convertir en 2 toques.

## Huecos [ABIERTO] (no se inventan — onboarding del dueño)

- **Q1. Catálogo inicial**: ¿qué panes/repostería concretos arrancan? (base de todo el pipeline).
- **Q2. Franjas de tanda**: ¿cuántas al día? ¿a qué hora se hornea? (condiciona el selector de franjas).
- **Q3. Domicilio**: ¿se confirma la ruta 13:00? (condiciona entrega vs recogida).
- **Q4. Métodos de pago**: ¿link de pago, transferencia, tarjeta? (bloquea el botón de pago).

## SIGUIENTE PASO (para la F7)

Construir la **web/PWA de consumo** (P1 del FM1): el trío frontend real con hero-promesa, catálogo (tarjetas), selector de opciones, flujo de pedido (resumen → pago → confirmación), señal de confirmación y reenganche (aviso → repetir → oferta) — consumiendo los eventos del bus (catalogo.listar, pedido.crear, pago.iniciar, cuenta-recurrente.generar_semana). El bot WhatsApp (P3) es el canal paralelo de pedido + avisos.
