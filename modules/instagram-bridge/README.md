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
```

```bash
cd modules/instagram-bridge/crate && cargo test --offline   # U1 y A4.2, en escritorio
```

Los tests del padron y del catalogo no tocan los ficheros del repo: cada prueba de
disco se hace en un directorio temporal propio y lo borra al terminar. Los del
repo se leen una vez para comprobar que son validos y estan vacios.

No estan encadenados en `package.json` a proposito: ese fichero es compartido
con los demas bloques y cada bloque anade su entrada al ensamblar.
