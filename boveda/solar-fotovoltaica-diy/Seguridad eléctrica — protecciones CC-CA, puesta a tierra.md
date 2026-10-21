---
tipo: seguridad
sector: solar-fotovoltaica-diy
tags: [seguridad, diferencial-tipo-B, fusibles-gPV, puesta-a-tierra, REBT]
---
# Seguridad eléctrica — protecciones CC-CA, puesta a tierra

> La corriente continua de un string fotovoltaico no se "apaga" con solo desconectar el inversor mientras haya luz sobre los paneles — es la parte del sistema donde más se subestima el riesgo por ser "solo unos paneles".

---

## Diferencial — por qué el tipo importa tanto

```
DIFERENCIAL TIPO AC: detecta solo fugas de corriente alterna sinusoidal pura
  → NO válido para fotovoltaica, no detecta las fugas de corriente continua
  que puede generar el inversor

DIFERENCIAL TIPO A: detecta AC y algunas formas de corriente continua pulsante
  → insuficiente en la mayoría de instalaciones fotovoltaicas modernas

DIFERENCIAL TIPO B: detecta fugas tanto en AC como en DC pura (la que puede
  aparecer en el lado continuo de la instalación fotovoltaica)
  → el RECOMENDADO y, en la práctica, exigido para instalaciones fotovoltaicas

DIFERENCIAL SUPERINMUNIZADO: variante tipo A o B con inmunidad reforzada a
  disparos por armónicos generados por el propio inversor — evita
  desconexiones indeseadas (nuisance tripping) sin sacrificar la protección real

CALIBRE HABITUAL: 30 mA de sensibilidad para protección de personas en el
  cuadro de la instalación fotovoltaica, siguiendo REBT
```

---

## Fusibles de string — protección del lado DC

```
TIPO ESPECÍFICO: fusibles tipo gPV, diseñados específicamente para corriente
  continua fotovoltaica — un fusible de corriente alterna NO es intercambiable
  aquí, la extinción del arco en DC requiere diseño distinto

CUÁNDO SON OBLIGATORIOS: cuando hay varios strings en paralelo y la corriente
  de cortocircuito combinada podría superar la corriente inversa máxima que
  soporta un panel individual — protegen al panel de recibir corriente de
  retorno de los otros strings en caso de fallo

CUÁNDO NO SON ESTRICTAMENTE NECESARIOS: instalación de string único (sin
  paralelo) por debajo del amperaje de inversión máximo soportado por el
  módulo — habitual en kit balcón e instalaciones residenciales pequeñas

DIMENSIONADO: según la corriente de cortocircuito (Isc) de los paneles y el
  número de strings en paralelo — verificar siempre la hoja de datos del panel
```

---

## SPD — protección contra sobretensiones

```
QUÉ PROTEGE: picos de tensión por descargas atmosféricas cercanas (aunque no
  haya impacto directo) o conmutaciones bruscas en la red eléctrica

DÓNDE SE INSTALA: típicamente en el lado DC (junto al inversor, protegiendo
  paneles e inversor) y en el lado AC (protegiendo el resto de la instalación
  eléctrica de la vivienda)

RECOMENDACIÓN: especialmente relevante en instalaciones expuestas (tejado
  alto, zona con incidencia de tormentas frecuente) — un SPD bien dimensionado
  cuesta una fracción del coste de reponer un inversor dañado por sobretensión
```

---

## Puesta a tierra

```
QUÉ PROTEGE: a las personas frente a contactos indirectos — si una masa
  metálica de la instalación (estructura, marco del panel, carcasa del
  inversor) queda accidentalmente en tensión por un fallo de aislamiento,
  la puesta a tierra deriva esa corriente de forma segura y permite que la
  protección diferencial actúe

QUÉ SE CONECTA: estructura de anclaje, marcos metálicos de los paneles,
  carcasa del inversor — todas las masas metálicas accesibles de la instalación,
  con sección de conductor adecuada según REBT

POR QUÉ FALLA A VECES EN LA PRÁCTICA: instalaciones DIY que fijan la
  estructura pero olvidan el conductor de continuidad de tierra entre secciones
  de rail, o que no conectan el marco del panel individualmente — la
  equipotencialidad debe verificarse en toda la cadena, no solo en el origen
```

---

## REBT — el marco normativo de referencia

```
QUÉ ES: Reglamento Electrotécnico de Baja Tensión — la norma española que rige
  toda instalación eléctrica de baja tensión, incluida la parte AC de una
  instalación fotovoltaica (y aplicable en la parte DC en lo que corresponda)

RELEVANCIA PRÁCTICA: cualquier instalación por encima del umbral de "kit
  balcón sin trámite" (ver [[Kit balcón — plug and play, normativa, montaje]])
  requiere el boletín de instalador autorizado en categoría REBT que certifica
  el cumplimiento de estas protecciones — no es papeleo burocrático vacío,
  certifica precisamente lo descrito en esta nota
```

---

## Riesgo de arco eléctrico DC

```
POR QUÉ ES DISTINTO AL RIESGO AC: un arco eléctrico en corriente continua NO
  se extingue solo al pasar por cero (como ocurre de forma natural en AC 50Hz)
  — un arco DC puede mantenerse y generar temperaturas muy altas de forma sostenida

DÓNDE SE ORIGINA TÍPICAMENTE: conectores MC4 mal insertados o de calidad
  dudosa, cableado dañado por roedores o UV, terminales aflojados por
  dilatación térmica repetida a lo largo de los años

MITIGACIÓN: usar siempre conectores MC4 originales o certificados compatibles
  (no mezclar marcas de conector sin verificar compatibilidad real), revisar
  el apriete de terminales en el mantenimiento periódico, proteger el cableado
  expuesto de roedores con conducto adecuado
```

---

## Errores comunes de seguridad

```
★★★★★ Instalar diferencial tipo AC o A genérico en vez de tipo B específico
  para fotovoltaica — no detecta el fallo real que puede producirse en DC
★★★★☆ Mezclar conectores MC4 de marcas distintas sin verificar compatibilidad
  — origen habitual de arcos eléctricos por mal contacto
★★★★☆ Omitir la puesta a tierra de la estructura de anclaje en instalaciones
  DIY "porque son solo unos paneles" — el marco metálico expuesto a la
  intemperie es exactamente donde puede aparecer un fallo de aislamiento
★★★☆☆ No instalar fusibles gPV en configuraciones con varios strings en
  paralelo, confiando en que "nunca ha pasado nada"
★★★☆☆ Trabajar sobre el lado DC de la instalación con luz solar directa sobre
  los paneles asumiendo que están "apagados" porque el inversor está desconectado
  — el panel genera tensión mientras reciba luz, independientemente del inversor
```

---

## Novedades 2025-2026

```
→ El diferencial superinmunizado tipo A/B gana adopción frente al tipo B puro
  en instalaciones residenciales por su mejor comportamiento frente a los
  armónicos de los inversores modernos, reduciendo desconexiones indeseadas
  sin perder el nivel de protección real necesario
```
