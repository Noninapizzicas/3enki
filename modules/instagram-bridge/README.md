# instagram-bridge

Puente de operacion de cuentas de Instagram para los proyectos de Enki.

Este directorio **no es un modulo del bus**: es el arbol de la vertical. El
loader (`core/modules/loader.js`) trata una carpeta sin `module.json` como
agrupacion y busca manifiestos en sus subdirectorios, asi que aqui conviven
librerias puras (`core/`) y los modulos con manifest (`cuentas/`, `recetas/`;
mas adelante `ritmo/`, `sesion/`, `operacion/`, `puente/`, `autonomia/`). Ver
`plan-construccion.md` seccion 8.

## Bloque 1 · El suelo innegociable

Cuatro piezas REFLEJAS (deterministas, sin LLM, sin red, sin estado global) y
las formas de dato que comparten. Nada se escribe antes de esto: cualquier
almacen, cualquier lectura y cualquier auditoria del puente se apoyan aqui.

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| P1 `SelloDeProyecto` | `core/sello.js` | Todo dato nace con dueno (proyecto, cuenta, aparato, momento, quien). Sin sello no entra en ningun almacen. El sello no se reescribe: el traspaso anade historia. |
| P2 `FiltroDeAmbito` | `core/ambito.js` | Toda lectura se filtra por ambito y se comprueba antes de devolver. Dos proyectos no se mezclan en un informe: varios ambitos = varios informes. |
| P3 `ReglaDePropiedad` | `core/propiedad.js` | El saber hacer (catalogo de recetas, memoria de cambios) se comparte; el estado (retratos, bandejas, colas, tolerancia, evidencia, confirmaciones, autorizaciones) no se comparte jamas. Un almacen que mezcla es un exceso. |
| V1 `ReglaDeNoAlmacenamiento` | `core/no-secretos.js` | Ningun secreto entra en el estado. Se audita el estado entero, se descarta lo que llega y se avisa — sin copiar el valor en el informe. |
| Formas | `core/formas.js` | `SelloDeProyecto`, `SelloDeCuenta`, `HechoVisible`, `Ancla`: validadas una sola vez, sin lanzar, nombrando el hueco. |

**El reloj no vive aqui.** Ninguna pieza llama a `Date.now()`: el `momento` del
sello lo trae quien invoca (el reloj es el puerto 10 del plan). Asi el mismo
payload produce siempre el mismo resultado.

## Bloque 2 · El padron y la exclusividad

Dos piezas y un crate nuevo. El padron dice **de quien es cada cuenta**; U1
comprueba, **delante de la pantalla**, que la cuenta que se ve es la que se
esperaba. Una vive en el cerebro y la otra en el aparato: el cerebro no puede
decidir sobre lo que solo se ve en el movil.

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| B1 `PadronDeCuentas` | `cuentas/{index.js,padron.js}` + `cuentas/module.json` | Indice unico de duenos (cuenta → proyecto → aparato) sobre `storage/instagram-bridge/padron.json`. Una cuenta tiene UN proyecto vigente (cambiarlo es traspaso, que deja historia); un proyecto puede tener N cuentas; un aparato sostiene una cuenta (W3). La baja **archiva**: asiento, archivo e historia se conservan. Single-writer en proceso y escritura atomica (temporal + rename). |
| U1 `VerificadorDeExclusividad` | `crate/src/mano/exclusividad.rs` | `comprobar(esperada, hecho)` y `parar_si_no_coincide()`. **Regla dura: `Indeterminado` se trata como `NoCoincide`** — sin cuenta visible, con mirada parcial o sin expectativa, no se toca nada. La etiqueta `indeterminado` se conserva (no se disfraza de `no`), pero la decision es la misma que un no. |

`padron.js` es puro (sin IO, sin reloj): cada operacion recibe el estado y
devuelve un estado nuevo. `index.js` es el borde: IO, correlacion de eventos con
su par `.failed` y el candado de escritura. Antes de cada escritura se corre
`padron.auditar()`: sello en cada asiento (P1) y cero secretos (V1). Un padron
ilegible **no se sobrescribe**: se devuelve `sin_padron`.

### El crate del aparato

`crate/` nace aqui y se compila y testea **en escritorio**, sin NDK:

```bash
cd modules/instagram-bridge/crate && cargo test --offline
cargo run -- --comprobar @taller_a @Taller_A     # 0 = se puede operar, 1 = parada
```

`Cargo.toml` declara `crate-type = ["cdylib", "rlib"]` (la cdylib es para Android,
bloque 5) y el perfil release con `panic = "unwind"` y `strip = "none"`.
`.cargo/config.toml` lleva build-id y `max-page-size=16384` **solo** bajo
`cfg(target_os = "android")`: en escritorio no aplica ningun flag. Nunca se
exporta `RUSTFLAGS`: sustituye esas tablas en vez de sumarse.

## Bloque 3 · El saber hacer

Cuatro piezas y un almacen global. En este orden interno: primero la **forma**
(que es una receta valida), luego el **almacen** (donde vive), luego el
**nacimiento** (de donde sale) y por ultimo el **ensayo** (si sirve hoy). Sin la
forma, el catalogo admite basura; sin el catalogo, la demostracion no tiene donde
nacer; sin el ensayo, la receta solo se descubre mala a mitad de una publicacion.

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| A4.1 `FormaDeReceta` | `core/forma-receta.js` | Cuatro partes (precondicion, pasos, postcondicion, techo) y cuatro por paso (ancla, accion, consecuencia, espera). **Una receta sin postcondicion se rechaza** y el defecto dice en que **paso** se nota; no rellena huecos. El techo tiene que caber: si la suma de esperas lo supera, se nombra el paso donde se agota. |
| A4.4 `CatalogoDeRecetas` | `recetas/{index.js,catalogo.js}` + `recetas/module.json` | Unico escritor del saber hacer sobre `storage/instagram-bridge/catalogo-recetas.json` (global, compartido a proposito: P3). Clave `(plataforma, capacidad)`. **Una sola vigente por clave**; la anterior pasa a `antecesora` en el mismo acto y no se borra. **Una receta nace propuesta** y solo se promueve con `autorizacion_id`. Single-writer y escritura atomica. |
| A4.2 `SembradorDeDemostracion` | `recetas/demostracion.js` + `crate/src/almacen/demostracion.rs` | Una receta nace de que una **persona** haga la operacion una vez y se observe. Traduce lo visto a `RecetaPropuesta` (`estado: 'propuesta'`, `vigente: false`): nunca concede vigencia. Un paso sin ancla o un gesto que resuelve dos cosas se rechazan con su numero de paso; no se adivina la intencion. |
| A4.3 `EnsayoEnSeco` | `recetas/ensayo.js` | Recorre la receta contra un `HechoVisible` **sin tocar nada**. Cada ancla que no esta es una falta con **su numero de paso**; `no_se` (mirada parcial, postcondicion sin ancla) **no es apto**. Usa el puerto `observar`, no la clase A1. |

`forma-receta.js` y `ensayo.js` son reflejos puros (sin reloj, sin red, sin IO);
`catalogo.js` es puro y `index.js` es el borde con IO y candado; `demostracion.js`
es un conversor determinista (la demostracion viaja como valor, no como estado
global).

El catalogo no admite estado privado: `auditar()` comprueba en cada escritura
sello (P1), cero secretos (V1), clase de almacen compartible (P3), forma A4.1 de
cada receta y **una sola vigente por clave**. Un catalogo ilegible **no se
sobrescribe**: se devuelve `sin_catalogo`.

## Bloque 5a · La mano (parte A): mirar y resolver

Dos piezas y el arbol falso que las hace testeables sin un movil. A1 mira, A2
decide que receta se aplica; ninguna de las dos toca el mundo (eso es A3, en la
parte B).

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| A2 `ResolvedorDeReceta` | `recetas/resolver.js` | Emparejamiento **exacto por dos claves** (plataforma, capacidad). Cuatro salidas: `aplicar`, `sin_receta`, `preguntar`, `rechazo`. **Sin receta vigente NO se improvisa**: ni antecesora, ni propuesta, ni la parecida; devuelve `sin_receta` y para. **Con dos vigentes en la misma clave NO elige**: devuelve `preguntar` con las dos versiones. Una vigente que no pasa la forma (A4.1) no se aplica a medias. |
| A1 `ObservadorDeEstado` | `crate/src/percepcion/{mod,observador}.rs` | `mirar(fuente, ambito, momento)` inyecta el arbol por el puerto `FuenteDeArbol`, `hay(ancla)` y `elementos_visibles()` contestan sobre la ultima mirada, `mirar_antes_y_despues()` rodea una operacion. **Sin mirada nueva NO se rellena con la anterior**: el estado es `Vista::Desconocido(motivo)` y `hay()` deja de contestar `Presente`. Una mirada parcial se declara parcial y no afirma ausencias. |
| El simulador | `crate/src/percepcion/simulador.rs` | El ARBOL DE NODOS FALSO: nodos con id, texto/descripcion, tipo, caja y `tocable`, construibles en memoria, y `mutar(Cambio)` para simular que la pantalla cambio (anadir, quitar, mover, ocultar, cegar el servicio). Es lo que permite probar A1 —y despues A3 y A5— con `cargo test`, sin Android y sin cuenta. |
| Puente Android | `android/app/src/main/java/online/enki/instagram/Accesibilidad.kt` | `AccessibilityService` que lee `AccessibilityNodeInfo` (texto, descripcion, `viewIdResourceName`, `getBoundsInScreen`, `isClickable`, `isEnabled`, `isEditable`) y entrega la instantanea en JSON con la forma del crate. **PENDIENTE DE COMPILAR EN EL PORTATIL**: no hay Android SDK en el servidor, asi que este fichero se revisa y se compila alli. |

El estado desconocido se NOMBRA siempre (`Desconocido::NuncaSeMiro`,
`NoSePudoMirar(SinMirada)`, `MiradaParcial`, `MiradaParcialSinMotivo`,
`AmbitoIncompleto`, `AnclaSinNombre`): no hay un "desconocido generico" que se
pueda leer como "vale".

`Mirada` vive en `percepcion` y `mano::exclusividad` la reexporta: una sola
lista de valores para el campo `mirada`, no dos que se desincronicen.

## Bloque 5b · La mano (parte B): ejecutar y recuperar

La mano que toca. A3 ejecuta **un** paso, A5 decide que hacer cuando falla, y la
operacion `publicar` es el bucle que pone una mirada nueva delante de cada paso.

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| A3 `EjecutorDeElemento` | `crate/src/mano/ejecutor.rs` | Ejecuta **un** paso: localiza el ancla, valida la accion contra el catalogo cerrado (`tocar`, `escribir`, `desplazar`, `esperar`), entrega **un** gesto y se para. **La foto no se reutiliza**: si la `version` y el `momento` son los de la ultima foto con la que actuo, se para con `FotoRepetida` — dos pasos encadenados con la misma foto es la forma de tocar donde ya no hay nada. **Sin ancla no se improvisa**: se para y se nombra el paso (`AnclaAusente`, con su numero). **Una accion fuera del catalogo se RECHAZA**, no se degrada a `tocar`. Reporta el `EfectoEnElMundo` (`sin_efecto` / `efecto_posible` / `indeterminado`) y no decide nada mas. |
| A5 `EscaleraDeRecuperacion` | `crate/src/mano/escalera.rs` | Ante un fallo decide **reintentar / volver / escalar**, y nada mas. **Regla sagrada: un paso que ya cambio el mundo no se reintenta nunca; si no se sabe si lo cambio, tampoco.** El orden de la tabla ES la regla: los dos casos de efecto van antes que el techo de intentos, para que ningun numero pueda autorizar un duplicado. Solo `plataforma` admite un segundo intento (R1), y solo si el paso no toco nada. La escalada viaja con el `Remedio` de su familia (`pedir_persona`, `declarar_rotura`, `preguntar`, `regular`), nunca con `reintentar`. |
| La operacion `publicar` | `crate/src/mano/publicar.rs` | El bucle: **mirada nueva antes de cada paso** (A1), **U1 delante de cada gesto**, consecuencia del paso anterior comprobada en esa misma foto, presupuesto medido con el reloj inyectado, y A3 por paso. Si un paso se para, obedece a A5: `Reintentar` = un intento mas con mirada nueva; `Volver` / `Escalar` = se para y el informe lleva la decision. Tres desenlaces honestos: `publicado` (exige postcondicion vista), `sin_confirmar`, `parado` (**no** significa "no paso nada": `gestos` y `pudo_cambiar_el_mundo()` lo dicen). |
| Gestos Android | `android/.../Gestos.kt` | El puerto `Superficie` de A3 de verdad: `ACTION_CLICK` o `dispatchGesture` para tocar, `ACTION_FOCUS` + `ACTION_SET_TEXT` para escribir (sin nodo no escribe: nunca teclea a ciegas), trazo para desplazar, `Thread.sleep` para esperar, `GLOBAL_ACTION_BACK` para el `volver` de A5. Espera el `onCompleted`/`onCancelled` del gesto porque A3 necesita saber si ocurrio. **PENDIENTE DE COMPILAR EN EL PORTATIL.** |
| Compartir Android | `android/.../Compartir.kt` | El `Intent.ACTION_SEND` del share sheet (`FileProvider` + permiso de lectura + `<queries>`). Devuelve `Intento`, **nunca** `Hecho`: un `ACTION_SEND` que sale bien solo abre el editor de Instagram, y desde ahi nadie puede confirmar. La confirmacion es una mirada nueva a la postcondicion. **PENDIENTE DE COMPILAR EN EL PORTATIL.** |

El bucle no vive en A3 a proposito. Un ejecutor que recorre la receta entera es
un ejecutor que, tarde o temprano, la recorre **con la foto del principio**.
Partirlo en "un paso" (A3) y "el bucle" (`publicar`) pone la regla de la mirada
nueva en el unico sitio donde se puede comprobar —cada vuelta— y deja que A3 se
niegue a repetir una foto sin saber nada de recetas.

## Tests

Un fichero por pieza, con el nombre que fija la espina `enki-plan` del plan
(`tests/<pieza>.test.js :: <nombre del test>`):

```bash
node modules/instagram-bridge/tests/sello.test.js
node modules/instagram-bridge/tests/ambito.test.js
node modules/instagram-bridge/tests/propiedad.test.js
node modules/instagram-bridge/tests/no-secretos.test.js
node modules/instagram-bridge/tests/padron.test.js
node modules/instagram-bridge/tests/forma-receta.test.js
node modules/instagram-bridge/tests/catalogo.test.js
node modules/instagram-bridge/tests/demostracion.test.js
node modules/instagram-bridge/tests/ensayo.test.js
node modules/instagram-bridge/tests/resolver.test.js
```

```bash
cd modules/instagram-bridge/crate && cargo test --offline   # U1, A4.2, A1, A3 y A5, en escritorio
```

Los tests del padron y del catalogo no tocan los ficheros del repo: cada prueba de
disco se hace en un directorio temporal propio y lo borra al terminar. Los del
repo se leen una vez para comprobar que son validos y estan vacios.

No estan encadenados en `package.json` a proposito: ese fichero es compartido
con los demas bloques y cada bloque anade su entrada al ensamblar.
