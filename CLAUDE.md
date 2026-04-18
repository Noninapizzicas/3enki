# Paradigma del sistema — Event-Core

## La regla que no se rompe

**Emite evento. Quien sabe, hace. Tú no sabes cómo.**

Cada módulo conoce exactamente una cosa: su dominio. Nada más.

---

## Lo que esto significa en la práctica

### Un módulo NO:
- Llama directamente a otro módulo
- Instancia servicios de persistencia propios porque "los necesita"
- Espera respuesta de lo que emitió
- Mezcla dominio con infraestructura (SQLite, HTTP, filesystem)
- Controla el flujo después de emitir

### Un módulo SÍ:
- Emite eventos con datos de dominio
- Escucha eventos que le corresponden
- Actúa dentro de su responsabilidad
- Devuelve resultados a quien le llamó

---

## Ejemplos concretos

**MAL — recetas instancia su propio SQLiteManager:**
```js
// recetas/index.js
const manager = new SQLiteManager(project_id, ...);
await manager.guardar(receta);
```
Recetas no sabe de SQLite. No debería saber.

**BIEN — recetas emite, quien sabe persiste:**
```js
// recetas/index.js
this.eventBus.publish('receta.crear', { proyecto_id, datos });
// Fin. Recetas no sabe qué pasa después.
```

---

## El LLM sigue el mismo paradigma

El LLM llama una tool → emite el evento → continúa la conversación.  
No espera confirmación de persistencia. No controla el flujo.  
Fire and forget.

---

## Por qué esto importa

Cuando un módulo hace más de lo que le toca:
- El sistema se vuelve frágil (cambia una cosa, rompe tres)
- Aparecen dependencias ocultas
- No puedes reemplazar piezas sin reescribir todo
- El código crece hacia adentro en lugar de hacia afuera

Con este paradigma:
- Cada módulo es reemplazable
- El sistema escala añadiendo escuchadores, no modificando emisores
- Un fallo en persistencia no rompe el dominio
- Se puede testear cada capa por separado

---

## Antes de escribir código, pregúntate

1. ¿Este módulo está haciendo algo que no es su dominio?
2. ¿Podría resolver esto emitiendo un evento en lugar de llamar directamente?
3. ¿Quién debería escuchar esto? ¿Ese módulo ya existe?
4. ¿Estoy mezclando dominio con infraestructura?

Si la respuesta a (1) o (4) es sí — para. Refactoriza el diseño antes de escribir código.
