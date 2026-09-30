# El ADN de un módulo Enki — el contrato medible

> **Qué es esto.** La LEY de forma de un módulo Enki, en una página.
> No es una opinión: cada regla tiene un validador que la comprueba.
>
> **Por qué existe.** El estándar estaba escrito en PROSA (el empujón de
> `proceso-negocio` decía *"funciona por eventos, desacoplado"*) pero **no se
> verificaba en ningún sitio**. Un estándar que no se puede incumplir no es un
> estándar: es una opinión. Y por eso el sistema derivó (pizzepos: 22,7 métodos
> por evento · contabilidad: 1,4-2,1 · nichos: 0,1).
>
> **Cómo se cumple.** No a base de voluntad: `scripts/verificar-adn-modulo.js`
> lo mide, el gate de `proceso-negocio` lo exige al construir, y el hook de git
> lo bloquea al entrar al repo.

---

## 1 · Las dos formas de hablar

Un módulo Enki solo tiene dos formas de comunicarse. **Todo lo demás es deriva.**

| | **EVENTO** | **MÉTODO (RPC)** |
|---|---|---|
| **Qué es** | *"Esto ha pasado"* — un hecho | *"Hazme esto"* — una orden |
| **Dirección** | 1 anuncia → **N** escuchan | 1 llama → 1 responde |
| **Espera** | No (fire-and-forget) | Sí (pide y espera) |
| **Si nadie responde** | Nada (el sistema sigue) | Error |
| **Acoplamiento** | El que anuncia **no sabe quién escucha** | El que llama **debe saber a quién** |
| **Dónde se declara** | `subscribes` / `publishes` | `tools` / `ui_handlers` |
| **Camino real** | el bus (`bus.subscribe` + fan-out) | `tools` → bus · `ui_handlers` → mapa 1-a-1 |

---

## 2 · Las 4 reglas

### R1 · Un módulo es una isla: se comunica SOLO por eventos
El dominio de un módulo vive **dentro** del módulo. **Nunca** en `_shared/`, nunca en otro módulo. Un módulo no importa la lógica de otro: **le habla por evento**.

### R2 · Si ESCRIBE, no puede NO anunciar
Un método que cambia estado (añade, asienta, emite, declara, cierra, firma…)
**tiene que publicar el hecho**. Si no, la escritura es **invisible**: el módulo
guarda el dato y **nadie se entera** → la cadena se corta ahí.

> Éste es el fallo de `catalogo-cuentas.anadir`: escribe el plan contable y no
> anuncia nada. Por eso el sistema de contabilidad no se enteraba de que el plan
> estaba cargado.

### R3 · Si escuchas, tiene que haber quien emita
Una entrada sin emisor es **una cadena rota**: el módulo espera algo que nunca
llega. O se construye el emisor, **o se quita la escucha** — pero no se deja
colgando (una escucha huérfana miente: parece que el sistema está conectado).

### R4 · Un método declara QUIÉN y POR QUÉ
En un sistema event-driven, un método sin procedencia declarada **no tiene razón
de ser**. Cada operación declara:
- **QUIÉN** la usa → `ui_handlers[].domain` + `blueprint.ui.ops[].titulo`
- **POR QUÉ** existe → `blueprint.ui.ops[].descripcion`
- **CON QUÉ** → los `args`, cada uno con su `descripcion`

Un método que declara esto **no es deriva**: es la puerta del humano.

---

## 3 · Excepciones legítimas (NO son deriva)

Medido contra el repo real — si no se excluyen, el validador da falsos positivos y la cura es peor que la enfermedad:

| Excepción | Por qué es legítima | Cómo se reconoce |
|---|---|---|
| **Hojas/puertos terminales** | consumen y devuelven; su salida es el resultado final | publica `*.response` y nadie escucha su evento de dominio a propósito |
| **Módulos de arranque** | esperan `project.activated`, que emite el **core** | el emisor es el core, no un módulo |
| **Preguntas puras** (`calcular`, `listar`, `buscar`) | **no cambian estado**: no hay hecho que anunciar | verbo de consulta/derivación |
| **Puertas de frontera** (`nomina.recibida`) | esperan a **otra vertical** o a un sistema externo | el emisor está fuera del repo |
| **`ui_handlers` del panel** | la UI necesita **una** respuesta: el mapa 1-a-1 es correcto | el módulo declara `ui_handlers` con `type`+`zone` |

---

## 4 · Cómo se cumple (las 4 capas)

```
CAPA 0 · EL MOLDE      proceso-negocio · 0 ui_handlers · todo por eventos
                       (el ejemplo que se copia, no se explica)
CAPA 1 · EL CONTRATO   este documento
CAPA 2 · VERIFICADOR   scripts/verificar-adn-modulo.js  ← una implementación
CAPA 3 · GATE          proceso-negocio·fase 'construido' ← llama al verificador
                       (el mismo patrón que ya usa con git ls-files)
CAPA 4 · HOOK          .githooks/pre-commit              ← la red que atrapa TODO
                       (da igual por dónde vengas: proceso, vertical, agente)
```

**La capa 4 es la que cierra el hueco real**: lo que se construye **fuera del
proceso** (una vertical por sub-agentes, como se construyó contabilidad) no lo
miraba nadie. Con el hook, **todo entra al repo por el mismo sitio**.

---

## 5 · El molde real

`modules/proceso-negocio/` — **el módulo más limpio del repo**:

```
ui_handlers:  0                    ← no expone métodos 1-a-1
tools:        completar_fase        ← van por el BUS (fan-out)
subscribes:   project.created · negocio.identificado · completar_fase.request
publishes:    conserje.empujon
```

**12 fases orquestadas, gates en disco, estado persistente — con CERO métodos
de interfaz.** Si un orquestador puede, cualquier módulo puede.
