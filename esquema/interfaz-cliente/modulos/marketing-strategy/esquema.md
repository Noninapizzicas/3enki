# Esquema — marketing-strategy desde el cliente

> Anatomía de lo que el cliente ve/consume del módulo marketing-strategy.
> El módulo almacena la estrategia del jefe. De ella, 5 datos tienen cara pública
> y 6 bloques son 100% internos.

---

## Árbol

```
MARKETING-STRATEGY → CLIENTE
├─ [IDENTIDAD] La cara pública de la estrategia: lo que el jefe define
│              y el cliente ve materializado en la interfaz
│
├─ CONVERSORES (dato → fragmento de sección) ────────────────────
│  ├─ S1  Declaración → titular ·········· conversor
│  │      strategy.declaracion → { headline, nivel, ubicacion }
│  │      Hero h1 (homepage/landing) · About h1 · Header h2 (otras)
│  │      Fallback: propuesta_valor si declaracion es null
│  │
│  ├─ S2  Propuesta de valor → subtítulo · conversor
│  │      strategy.propuesta_valor → { subheading, ubicacion }
│  │      Acompaña a la declaración (misma ubicación)
│  │
│  ├─ S3  Atributos → puntos clave ······ conversor
│  │      strategy.atributos_deseados[] → [{ feature-item, texto, icono }]
│  │      Sección features/benefits · Icono = hueco (piel lo resuelve)
│  │
│  └─ S4  Evidencias → trust cues ······· conversor
│         strategy.credibilidad.evidencias[] → [{ trust-badge|stat|logo|quote }]
│         Mini-parser: detecta formato (número/URL/cita/texto) → tipo de badge
│         Sección trust / social-proof / "as seen in"
│
├─ ENRUTAMIENTO ──────────────────────────────────────────────────
│  └─ S5  Categoría → contexto ··········· reflejo
│         strategy.territorio.categoria → { arquetipo }
│         Pass-through al selector de estructura (#20)
│         No genera fragmento visual — condiciona la estructura
│
├─ [NO-OBJETIVOS para el cliente] ────────────────────────────────
│  ├─ objetivos[] ················ metas internas (state machine)
│  ├─ alineacion_negocio[] ······· mapeo objetivo↔negocio
│  ├─ conocimiento_disponible ···· gaps del equipo
│  ├─ revisiones ················· agenda interna
│  ├─ territorio.vecinos[] ······· competidores identificados
│  └─ consistencia.* ············· historial de giros
│
├─ [CONTRATO] ────────────────────────────────────────────────────
│  ├─ Si el jefe rellena posicionamiento, el cliente lo ve
│  ├─ Si el campo está vacío, el fragmento no se genera (no inventa)
│  └─ Si el dato cambia (evento actualizada), la vista se regenera
│
└─ [EVENTO DE SINCRONIZACIÓN] ────────────────────────────────────
   marketing.strategy.actualizada → campos_actualizados[]
   El sincronizador (#25) escucha y regenera solo las secciones afectadas
```

---

## Flujo de datos

```
STORE del jefe                    CONVERSOR                     INTERFAZ del cliente
─────────────                     ─────────                     ───────────────────

declaracion ─────────→ S1 ────→ hero.headline (h1)
propuesta_valor ─────→ S2 ────→ hero.subheading
atributos_deseados[] → S3 ────→ features.items[]
evidencias[] ────────→ S4 ────→ trust-badges[] / stats[] / logos[]
territorio.categoria → S5 ────→ (enrutamiento: qué estructura de página)

objetivos[]          ╳ NO SALE
alineacion_negocio[] ╳ NO SALE
conocimiento_disp.   ╳ NO SALE
revisiones           ╳ NO SALE
territorio.vecinos[] ╳ NO SALE
consistencia.*       ╳ NO SALE
```

---

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas | 1 (todo atómico, sin SPAWN) |
| Piezas cliente | 5 (4 conversores + 1 reflejo) |
| Bloques internos | 6 (100% jefe) |
| Preguntas abiertas | 2 → cerradas en disección |

### Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **conversor** | 4 | S1 Declaración, S2 Propuesta, S3 Atributos, S4 Evidencias |
| **reflejo** | 1 | S5 Categoría |
| **TOTAL** | **5** | |

---

## Lo que el agente generador necesita de este esquema

Cuando el agente procese marketing-strategy para un proyecto concreto:

1. **Lee el store** (`marketing-strategy.get` → datos del proyecto)
2. **Ejecuta los 4 conversores** (S1-S4) sobre los datos que NO son null
3. **Pasa S5** al selector de estructura como input de enrutamiento
4. **Entrega fragmentos tipados** al ensamblador:
   ```json
   {
     "modulo": "marketing-strategy",
     "fragmentos": [
       { "tipo": "headline", "texto": "...", "nivel": "h1", "destino": "hero" },
       { "tipo": "subheading", "texto": "...", "destino": "hero" },
       { "tipo": "feature-item", "items": [...], "destino": "features" },
       { "tipo": "trust-badge", "items": [...], "destino": "trust" }
     ],
     "enrutamiento": { "arquetipo": "restaurante" }
   }
   ```
5. **Suscribe** al evento `marketing.strategy.actualizada` para regenerar

Los fragmentos son PIEZAS del puzzle — el ensamblador (#19-#25) los junta con fragmentos
de otros módulos (content, campaigns, etc.) para componer la página completa.
