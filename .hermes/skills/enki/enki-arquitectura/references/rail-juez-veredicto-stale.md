# Rail congelado por veredicto stale — reproducción y fix

## El síntoma (lo que dice el usuario)
"El LLM hace el trabajo pero no termina la tarea", "no enlaza y termina las
tareas, tiene el material y la infraestructura pero se queda atascado".

## La evidencia real (proyecto Regalos, 2026-08-01)

Rail `pos_dashboard_hibrido` «POS + Dashboard Híbrido» en
`/opt/enki/data/projects/regalos/storage/estados/listas.json`:

```json
{
  "nombre": "POS + Dashboard Híbrido",
  "estado": "abierta",                    // ← debería ser completa
  "objetivo": "Tanda 3 completada: Dashboard y Cocina conectados",
  "pasos": [ ... 5 pasos hecho, paso 6 pendiente ... ],
  "ultima_evaluacion": {
    "satisfecho": true,                    // ← CONTRADICCIÓN con estado=abierta
    "blocker": "none",
    "razon": "Tanda 4 completada: archivos publicados en www/pos/ y ciclo
              completo verificado con pedido real"
  }
}
```

El trabajo del paso 6 SÍ estaba hecho en disco (`www/pos/index.html`,
`dashboard.html`, `pedidos.json`...) pero el rail quedó abierto: **el veredicto
"cumplido" era de un objetivo anterior (Tanda 4) y el objetivo volvió a Tanda 3
(o la lista se reabrió al añadir pasos)** — la evaluación quedó stale y nadie
volvió a evaluar.

## La causa raíz

Dos piezas se combinan:

1. `modules/estados/index.js → _anadir` (línea ~192): al añadir un paso a una
   lista `completa`, la REABRE a `abierta`:
   ```js
   if (lista.estado === 'completa') lista.estado = 'abierta';
   ```
   Pero NO limpia `lista.ultima_evaluacion`.

2. `modules/conversacion/ai-gateway/index.js → _evaluarRailAuto` (línea ~1693):
   ```js
   if (rail.ultima_evaluacion && rail.ultima_evaluacion.satisfecho) return;
   // ya cumplido → no re-evaluar
   ```
   El primer veredicto `satisfecho:true` bloquea la re-evaluación PARA SIEMPRE,
   aunque la lista se haya reabierto después con pasos nuevos. El juez queda mudo.

Resultado: lista abierta + pasos pendientes + juez que nunca vuelve a mirar =
**atascado permanente**, aunque el trabajo esté hecho y verificado por los
reflejos. El "no termina" del chat no es pereza del LLM: es un guard que congela
el cierre.

## El fix (2 archivos, ~6 líneas)

### 1. `modules/estados/index.js` — invalidar el veredicto al reabrir

En `_anadir` (y en `_marcar` si deja la lista abierta, y en `_fijarObjetivo`):

```js
if (lista.estado === 'completa') lista.estado = 'abierta';
lista.ultima_evaluacion = null;   // el veredicto ya no vale: la lista cambió
```

### 2. `modules/conversacion/ai-gateway/index.js` — el guard respeta el estado

```js
// antes:
if (rail.ultima_evaluacion && rail.ultima_evaluacion.satisfecho) return;
// después: solo congela si la lista SIGUE completa
if (rail.ultima_evaluacion?.satisfecho && rail.estado === 'completa') return;
```

Si la lista está abierta → el veredicto viejo no la bloquea: el juez re-evalúa,
ve el trabajo hecho, marca `completa`. La tarea TERMINA sola.

## Cómo detectar otros rails atascados (probe)

```python
import json, glob
for f in glob.glob('/opt/enki/data/projects/*/storage/estados/listas.json'):
    d = json.load(open(f))
    for lid, l in d.get('listas', {}).items():
        ev = l.get('ultima_evaluacion') or {}
        if ev.get('satisfecho') and l.get('estado') != 'completa':
            print('STALE:', f.split('/')[5], '/', lid,
                  '| estado', l.get('estado'),
                  '| razon', str(ev.get('razon',''))[:60])
```

## Lección de diseño
El veredicto del juez es una FOTO del momento: cualquier mutación posterior de la
lista (añadir paso, reabrir, cambiar objetivo) la invalida. Guard que cachea un
estado cumplido sin comprobar que el estado siga siendo válido = cierre congelado.
Patrón general: **un guard de "ya hecho" debe verificar la condición actual, no
solo el flag histórico.**
