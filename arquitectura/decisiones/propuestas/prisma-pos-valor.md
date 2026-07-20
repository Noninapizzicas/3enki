# PRISMA · POS-VALOR — producto y negocio sobre la espina de venta

> Parcela nueva, disecionada con la skill `diseccionador` (las 6 preguntas).
> **La mecánica del POS YA existe y no se toca**: carrito → cuenta → cobro → ticket → cierre (verificada, persistente).
> Esta parcela añade lo que la mecánica no da: que cada venta SEPA lo que gana (beneficio) y que el
> cliente reciba valor nuevo (transparencia). Guión hermano: `prisma-compuestos` (el coste que esto consume).

---

## 0 · Objetivo (las dos caras)

```json
{
  "cara_negocio": "pasar de 'cuánto ENTRÓ hoy' (cuadre actual) a 'cuánto se GANÓ hoy' — margen por línea, por venta, por día; aviso cuando una venta sale bajo objetivo; consejo accionable",
  "cara_cliente": "transparencia que la mecánica no da: alérgenos y composición REALES (derivados de la cadena insumo→compuesto→producto, no tecleados a mano) en el escaparate",
  "regla_madre": "el sistema AVISA y ACONSEJA — el precio lo decide siempre el humano (no pisar lo manual, jamás bloquear una venta)"
}
```

## 1 · Lo que YA existe (mapa — no re-construir)

```
MECÁNICA POS      carrito (tasa con opciones) → cuenta (ciclo) → cobro (métodos, céntimos) → ticket → cierre (cuadre por método)
COSTE             prisma/coste (coste→margen→pvp, cara comerciante) · prisma-compuestos (coste REAL por composición: insumos→costeador)
PUENTE            puente-compuesto (coste→precio sin pisar manual — el patrón aplicar/testigo ya probado)
CLIENTE           escaparate (proyección pública del catálogo) · calendario (el POS del tiempo, reposa como infra)
LIBS              _shared/alergenos.js (los 14 UE canónicos) · _shared/prisma-unidades (céntimos, %, redondeo)
SEÑAL CLAVE       cobro.procesado {cobro_id, cuenta_id, monto_total_centimos, metodo_pago} — SIN líneas; las líneas viven en el carrito de la cuenta
```

## 2 · Los NUEVOS VALORES (qué se añade, en positivo)

```
BENEFICIO (comerciante)
  V1  margen por VENTA        cada cobro → coste real de cada línea (producto→compuesto_ref→coste del compuesto) → margen €/% por línea y por venta
  V2  cierre con BENEFICIO    el cuadre del día suma la cara que faltaba: beneficio bruto estimado + mejores/peores productos por margen + lo DESCONOCIDO nombrado
  V3  vigía de margen         venta bajo el objetivo (food_cost/margen del proyecto) → TESTIGO pos.margen.bajo — avisa, JAMÁS bloquea ni re-precia solo
  V4  consejero               con los números del período → sugerencias accionables en positivo (qué empujar, qué re-preciar, qué combinar) — validadas contra el catálogo real

CLIENTE
  V5  escaparate honesto      alérgenos y composición DERIVADOS de la cadena (compuesto→refs→insumos→alergenos), no tecleados: cumplimiento (UE 1169/2011) + confianza
```

## 3 · LA DISECCIÓN — espinazo + 6 preguntas

```
ESPINAZO:  VENDER (existe) → MEDIR (margen por venta) → ACUMULAR (día) → VIGILAR (objetivo) → ACONSEJAR (fuzzy) → SERVIR (cliente)

MEDIR      1.¿pensar o calcular? CALCULAR (coste×línea, Σ, %)                → REFLEJO motor
           2.¿quién escribe?     él mismo, store /prisma/pos/margenes/       → custodio+motor en uno (como cierre)
           3.¿de a una?          VENTA a VENTA (dispara cobro.procesado)     → 1 venta : 1 cálculo : 1 evento
           4.¿si falta coste?    línea → margen_desconocido NOMBRADO         → jamás estima; la venta sigue
           5.¿cruces?            céntimos y % — ya canónicos (_round)        → sin conversor nuevo
           6.¿conexión?          escucha cobro.procesado · emite venta.margen.calculado

ACUMULAR   calcular puro (Σ del día)                                         → EXTENSIÓN del custodio cierre
           escucha venta.margen.calculado · el cuadre gana beneficio_bruto + desconocidos[]
           single-writer intacto: cierre sigue siendo el único que escribe su cuadre

VIGILAR    calcular puro (comparar contra objetivo del proyecto)             → PUENTE testigo (patrón aplicar/testigo,
           escucha venta.margen.calculado · emite pos.margen.bajo              aquí SOLO testigo: nunca aplica nada)

ACONSEJAR  PENSAR (juicio sobre números)                                     → MICRO-AGENTE fuzzy (forma PRISMA)
           reflejo hidrata (cierre.estado + margenes + faltantes de compuestos) → 1 llm.complete tools:[] →
           {sugerencias:[{tipo, ref, accion, motivo}]} · validador: SOLO refs del catálogo (no inventa productos)
           bajo demanda (consejero.aconsejar.request) — no spamea

SERVIR     calcular puro (recorrer refs y UNIR alergenos de insumos)         → REFLEJO proyección
           op nueva compuestos.alergenos (el custodio ya tiene los datos) · escaparate la consume y muestra
           insumo sin alergenos declarados → "composición incompleta" NOMBRADO (no inventa un 'sin alérgenos')
```

## 4 · BUILD-LIST (piezas, en orden de dependencia)

```
1. prisma/margen-venta      [CREAR]    motor+custodio: cobro.procesado → hidrata líneas de la cuenta → coste por
                                       línea (compuesto_ref → coste del compuesto ya calculado; sin ref → desconocido)
                                       → persiste /prisma/pos/margenes/<fecha>.json → emite venta.margen.calculado
2. prisma/cierre            [EXTENDER] escucha venta.margen.calculado → cuadre con beneficio_bruto_estimado_centimos
                                       + desconocidos[] + top/bottom por margen
3. prisma/vigia-margen      [CREAR]    puente-testigo: venta.margen.calculado vs objetivo → pos.margen.bajo (solo canta)
4. prisma/consejero         [CREAR]    micro-agente fuzzy: aconsejar.request → hidrata números → llm.complete → valida → responde
5. prisma/compuestos        [EXTENDER] op alergenos: recorre componentes → une alergenos de insumos (recursivo en sub-compuestos)
6. prisma/escaparate        [EXTENDER] proyecta alergenos/composición del compuesto atado al producto
```

## 5 · Reglas transversales aplicadas

```
· la venta NUNCA se bloquea por datos de negocio — el margen es observación, no puerta
· dato ausente → NOMBRADO (margen_desconocido, composicion_incompleta) — el hueco ES el onboarding: dice qué falta
· el humano decide el precio — vigía y consejero AVISAN/OFRECEN (P0: en positivo), jamás re-precian solos
· de a una — venta a venta, día a día; nada en bloque
· todo por evento — ningún import entre parcelas; la señal es cobro.procesado y venta.margen.calculado
· coste = ESTIMADO (fase 1, referencia prudente) — el cierre lo declara: "beneficio bruto ESTIMADO"
```

## 6 · Lo que esta parcela NO es (límite)

```
· NO inventario/stock (mermas, existencias)          → parcela futura
· NO fidelización/CRM de clientes                    → parcela futura
· NO precio dinámico automático                      → el vigía canta, el humano toca
· NO cocina/preparación                              → órgano de hostelería (pizzepos)
```
