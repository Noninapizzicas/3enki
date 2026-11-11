# instagram-bridge

Puente de operacion de cuentas de Instagram para los proyectos de Enki.

Este directorio **no es un modulo del bus**: es el arbol de la vertical. El
loader (`core/modules/loader.js`) trata una carpeta sin `module.json` como
agrupacion y busca manifiestos en sus subdirectorios, asi que aqui conviven
librerias puras (`core/`) y los modulos con manifest (`cuentas/`, `recetas/`;
`cuentas/`, `recetas/`, `ritmo/`, `puente/`; mas adelante `sesion/`, `operacion/`,
`autonomia/`). Ver
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

## Bloque 6 · El testigo: lo que impide decir "hecho" sin prueba

Entre la mano que toca y la percepcion que mira hay un hueco por el que se cuela
el unico fallo que de verdad importa: decir que se hizo algo que no se hizo. El
testigo lo tapa con dos reflejos puros (Rust) y un custodio (JS).

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| O1 `VerificadorDeConsecuencia` | `crate/src/testigo/verificador.rs` | Dada la consecuencia que un paso tenia que dejar y una mirada **nueva**, contesta `Ocurrio` / `NoOcurrio` / `NoSeSabe`. **Regla sagrada: la espera agotada es NO SE, nunca SI**: dejar de esperar no prueba nada. `Ocurrio` exige prueba visible (nodo, momento y cuenta), no "no fallo nada". `NoOcurrio` exige mirada completa, plazo agotado y consecuencia **persistente**; un dialogo que no se ve ahora pudo abrirse y cerrarse, y eso es `NoSeSabe`. La foto tiene que ser de la misma cuenta y posterior al paso, y un ancla que ya estaba antes no prueba el efecto. **`NoSeSabe` siempre viaja con `que_haria_falta`**: no se puede construir sin el. |
| O2 `VeredictoDeEjecucion` | `crate/src/testigo/veredicto.rs` | Junta los resultados por paso en **un** veredicto: `Ocurrio` / `NoOcurrio` / `NoSeSabe`. No existe `Parcial`. Precedencia `NoSeSabe > NoOcurrio > Ocurrio`: **un solo paso no sabido envenena la ejecucion entera**, y la mayoria no asciende un no-saber a hecho. El mismo paso dos veces con resultados distintos es contradiccion, no dato. El veredicto lleva sus pruebas (para la evidencia) y lo que falta. |
| O3 `EvidenciaConservada` | `puente/evidencia.js` | Custodio de la evidencia: **sin `SelloDeCuenta` se rechaza** (`sin_sello_de_cuenta`), el proyecto del registro tiene que ser el del sello (`proyecto_ajeno`), ningun secreto entra (V1), y nada se escribe sin auditar. Escritura atomica (temporal + `rename`) bajo candado de single-writer. **No reimplementa la bitacora**: emite las peticiones del contrato de `agentes-bitacora` (`bitacora.abrir.request` / `.paso.request` / `.sellar.request` / `.leer.request`), y el registro sellado queda en `storage/instagram-bridge/evidencia/<request_id>.json` como fuente para reemitir si el bus estaba caido. Un `no_se_sabe` se sella con `verificado: false` y `no_confirmado: true`. |

El testigo no decide politica ni escribe la memoria verificable: decide si hay
prueba (O1/O2, sin IO ni reloj) y pide a la bitacora que la guarde (O3). La
bitacora sigue siendo la unica duena de `agentes/bitacoras`.

## Bloque 7 · El regulador de paso: lo que impide que la cuenta se queme

Cinco inputs y una sintesis. Ninguna de las cinco piezas decide sola; el que
decide es G6, y decide **en orden fijo**, dejando escrito por que.

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| G1 `PerfilDeRitmo` | `core/ritmo.js` | Cada tipo de accion tiene su **precio** en una tabla cerrada: publicar 12, leer 2, el pulso 1. Una accion sin precio no se cobra como cero, se nombra. El **techo** sale de la conservaduria de la cuenta (100 = maximo conservador → 20 unidades/dia; 10 → 120), y `publicaciones_al_dia` se **calcula** del techo, no se declara aparte. Sin dato, se arranca en el maximo conservador. |
| G4 `OrdenDePrioridad` | `core/prioridad.js` | Una escala, tres reglas: **lo empezado gana a lo nuevo** (1000), **el dueno gana al agente** (100), **publicar gana a leer** (50 > 10). La urgencia pesa 3 por escalon (maximo 9) y por eso **no puede volcar ninguna de las tres**. Desempate FIFO por secuencia y, al final, por id: el orden es **total** y reproducible. |
| G3 `ColaDeTrabajos` | `ritmo/{index.js,cola.js}` + `ritmo/module.json` + `storage/instagram-bridge/cola.json` | **NUNCA dos trabajos en curso para la misma cuenta**: `tomar_siguiente` se niega (`cuenta_ocupada`) y `auditar()` vuelve a comprobarlo sobre el fichero. La cuenta ocupa a la **cuenta**, no al proyecto. Todo trabajo nace con `expira_en`: lo caducado se archiva y deja de ocupar. Lo cerrado pasa al historial: la cola no borra. |
| G5 `MemoriaDeTolerancia` | `ritmo/tolerancia.js` + `storage/instagram-bridge/tolerancia.json` | **Cuenta nueva arranca en el maximo conservador** (`origen: 'cuenta_nueva'`, conservaduria 100). La memoria es **append-only** y la conservaduria **no se guarda: se deriva** del historial (una sola verdad). Un castigo firme devuelve la cuenta al maximo. El estado es por cuenta: una no contamina a otra. |
| G2 `LectorDeCastigo` | `ritmo/castigo.js` | Recibe la senal **ya observada** y la clasifica en `firme` / `dudosa` / `ausente`. **La duda se resuelve como dudosa** (baja el ritmo, no para). Toda senal firme o dudosa lleva **fin declarado**; si el texto no lo dice, lo pone el puente y lo dice (`fin_origen: 'por_defecto'`). Sin LLM funciona igual; con LLM, el modelo **no puede borrar** una senal firme escrita ni romper el juicio si devuelve basura. |
| G6 `ReguladorDePaso` | `ritmo/regulador.js` | La sintesis: recorre **techo -> castigo -> turno -> espera -> veredicto** y emite `seguir` / `esperar` / `parar` con `razon`, `hasta` y `fin_declarado`, mas el recorrido completo en `porque`. **Solo la plataforma para** (castigo firme); el techo, el turno y la espera se **esperan**. |

**Por que ese orden.** El techo va primero porque es el unico veto que no
depende de nadie (ni de la plataforma, ni del dueno, ni del agente): sigue
siendo verdad a las once de la noche igual que a las nueve. El castigo va
segundo porque **la plataforma manda sobre la prisa del dueno**, y va antes del
turno para no llamar "turno" a lo que en realidad es una cuenta bloqueada. El
turno va tercero: solo se actua si la cuenta esta libre y el trabajo es el que
toca. La espera va cuarta porque es la presion mas blanda: es lo unico que se
puede acortar (o alargar, con una duda) cuando las tres de arriba ya dijeron que
si. El veredicto va ultimo porque no es una comprobacion: es la sintesis, y solo
entonces se sabe a quien citar.

**Dos invariantes que no se negocian.** (a) *Ninguna presion veta para
siempre*: todo veredicto que no sea `seguir` lleva `hasta` y `fin_declarado`, y
hay un **tope duro de 24 h** que recorta y avisa (`fin_declarado: 'tope'`). (b)
*Solo la plataforma para*: `parar` es exclusivo del castigo firme; una senal
dudosa deja **mitad de presupuesto y doble de espera** y no para jamas.

G1, G4, G6 y G2 son reflejos puros (sin IO, sin reloj, sin estado). G3 y G5 son
custodios: `cola.js` / `tolerancia.js` son puros y `index.js` es el borde (dos
candados de single-writer, escritura temporal + `rename`, auditoria antes de
cada escritura, y un fichero ilegible **no se sobrescribe**: `sin_cola` /
`sin_tolerancia`).

## Bloque 8 · El pulso: lo que permite operar sin supervision

Siete piezas y un borde Kotlin. Si el aparato se cae, la plataforma pide algo o la
sesion se cierra, el puente tiene que **parar LIMPIO**, no morir a medias. Y la
primera regla del pulso es no confundir una duda con una muerte:

```text
no se  !=  muerto
```

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| D1 `PulsoDeSesion` | `crate/src/percepcion/pulso.rs` | La senal de vida de la sesion: `Viva`, `Muerta` (con evidencia) o `NoSe` (con motivo). **`no se` NO es `muerto` antes de operar**: `NoSe` manda `mirar_antes_de_operar`, nunca pedir persona ni, por supuesto, operar. Un latido caducado es `NoSe(lectura_vieja)`, no muerte. La muerte exige ver la pantalla de entrada, ver cerrarse la sesion o que la plataforma pida volver a entrar. El `momento` entra por parametro: sin reloj dentro. |
| D3 `SaludDelAparato` | `crate/src/percepcion/salud.rs` | **Un indicador ESENCIAL ausente es `fuera`** (accesibilidad, pantalla encendida, desbloqueo, version de app, sitio para la evidencia). Un esencial que NO contesto tambien deja fuera, pero se etiqueta `esencial_no_se` y su remedio es `mirar_otra_vez`: no es una averia. Lo deseable (bateria, red) no echa fuera: **degrada** y opera H3. |
| D4 `ArbitroDelAparato` | `crate/src/mano/arbitro.rs` | Arbitra el aparato entre la persona y el puente. **Regla dura: no se aborta a mitad de un paso con consecuencia INCIERTA: se termina o se para limpio.** `PararLimpio` solo con `EfectoEnElMundo::SinEfecto`; con `EfectoPosible` o `Indeterminado` contesta `TerminarPrimero`, deja el paso abierto y NO suelta el aparato. Un paso abierto tambien niega `soltar` y `relevar`: no se entrega a medias. |
| D5 `LectorDeAvisosPlataforma` | `crate/src/percepcion/avisos.rs` | Lee el aviso de la plataforma contra una **tabla cerrada** (codigo canonico y alias exactos normalizados), sin LLM. El aviso dice **que hace falta** (abrir sesion, verificar identidad, esperar, actualizar), nunca "error". **Un aviso NO PREVISTO se trata como `exige_persona`**: lo que no esta en la tabla no se adivina. Una pantalla con un aviso no previsto exige persona entera, aunque al lado haya un limite reconocido. |
| D2 `CaidaYReautenticacion` | `sesion/{caida.js,index.js}` + `sesion/module.json` + `storage/instagram-bridge/sesion.json` | Cuando la sesion se cae, decide el destino del trabajo en vuelo: **lo reversible (consecuencia `ninguna`) vuelve con su paso** a la cola, con numero, ancla y accion intactos; **lo irreversible (`posible`/`incierta`, o no declarado) va a revision** con lo que hace falta. La reautenticacion es **siempre humana**: exige `quien: 'dueno'` y `autorizacion_id`; `sistema` y `agente` reciben `reauth_exige_persona`. **Una revision no se cierra por reautenticar**: la sesion vuelve, la duda sigue, y se resuelve con `resolver_revision` (persona + autorizacion + decision + motivo). |
| H1 `AparatoAusente` | `sesion/ausente.js` + `storage/instagram-bridge/ausente.json` | Aviso con **acuse REAL**: enviarlo deja el aviso `pendiente_de_acuse` (`cerrado: false`, `requiere_acuse: true`); volver a avisar es un **recordatorio** (sube el contador, no acusa); solo `dueno` con `referencia` y `momento` cierra el aviso. Un aviso ya acusado no se reabre por un reintento (`reabrir_exige_persona`). El resumen dice `todo_acusado`: cero pendientes es la unica prueba de que alguien lo vio. |
| H3 `ModoDegradado` | `sesion/degradado.js` | Reflejo puro. **Sin plataforma solo sobrevive lo ya traido**: se lee la cache y se marca `origen: 'cache'`, `fresco: false`; publicar, comentar, escribir, seguir... prohibido (`nada_nuevo_sin_plataforma`); una clave que no esta en la cache devuelve `no_esta_en_la_cache`, **nunca `[]`** (una lista vacia es un dato; un hueco no). Una accion que no esta en ninguna de las dos listas se prohibe: lista cerrada. |
| Borde Android | `android/.../{PrimerPlano,Pantalla,Decision}.kt` | `PrimerPlano` lee pantalla, bloqueo, servicio, version, sitio, bateria y red con los MISMOS nombres que D1/D3 y entrega `no_se` cuando no puede leer (nunca `no`). `Pantalla` no adivina por textos: la pantalla la declara el cerebro y la deteccion de ENTRADA es una tabla cerrada de prefijos de view-id; si no se pudo mirar, `mirada: parcial` y motivo. `Decision` convierte los dictamenes del crate en una accion con una tabla en orden fijo, y **un estado no reconocido no autoriza nada** (`mirar_antes_de_operar`). **PENDIENTE DE COMPILAR EN EL PORTATIL.** |

`caida.js` y `ausente.js` son puros (sin IO, sin reloj): reciben el estado y
devuelven uno nuevo. `index.js` es el borde: dos candados de single-writer (uno por
fichero), escritura temporal + `rename`, auditoria antes de cada escritura y un
almacen ilegible que **no se sobrescribe** (`sin_sesion` / `sin_avisos`). La
auditoria comprueba ademas las invariantes de la pieza: `reauth_pendiente` exige
persona, lo autorizado lo autorizo `dueno`, `en_revision` lleva su
`que_hace_falta`, y un aviso acusado lo acuso una persona con referencia.

`degradado.js` no tiene fichero ni candado porque el modo **viaja con cada
llamada**, no vive en un estado global: dos operaciones del mismo puente pueden
estar una degradada y otra no.

## Bloque 9 · La autonomia: quien puede hacer que sin pedir permiso

Seis piezas y un agujero que cerrar. El agujero es el de siempre: **conseguir el
permiso por una via y ejecutar por otra**. Aqui se decide quien puede hacer que
sin preguntar, y todo lo que se decide se puede auditar despues.

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| Q1 `CasillaDeAccion` | `core/casillas.js` | Cada accion tiene **su** casilla: `reversible`/`irreversible` y `visible`/`privada`, y su rato de arrepentimiento. **Una accion SIN casilla NO se ejecuta**: no hay casilla por defecto ni casilla que traiga el payload (si contradice la tabla se rechaza con `casilla_ajena`). La regla de reversibilidad es la de los abogados: **si el estado se restaura pero la notificacion ya salio, es irreversible**. |
| Q3 `NivelDeAutonomia` | `autonomia/nivel.js` | Nivel por cuenta en una escalera de tres: `borrador` < `permiso` < `ejecutar`. **Sin nivel declarado, el CONSERVADOR (`borrador`)**. Y tres reglas que evitan el auto-permiso: **una declaracion sin declarante no es una declaracion** (un `'ejecutar'` suelto cae a borrador); **solo el dueno declara** (si firma `agente` o `sistema` se devuelve el conservador y se conserva lo declarado para ver el intento); y **el nivel es de una cuenta y un proyecto** (no se pide prestado). |
| Q2 `PuertaDeConfirmacion` | `autonomia/puerta.js` + `autonomia/index.js` + `storage/instagram-bridge/confirmaciones.json` | **El si y su caducidad.** Toda pregunta nace con `caduca_en` (15 min; techo 1 h). **Un si viejo es un no**: si la respuesta llega tarde se cierra como `caducada` con `respuesta: null` y `autoriza: false`. **El silencio no es si**: `vencer()` cierra lo que nadie contesto, y no hay rama que lo convierta en autorizada. Solo contesta `dueno`, con `referencia` y momento, y **una pregunta se contesta una vez**. |
| Q5 `RegistroDeAutorizaciones` | `autonomia/autorizaciones.js` + `storage/instagram-bridge/autorizaciones.json` | El libro **append-only** de los si. **El silencio nunca se anota como autorizacion**: `via` solo puede ser `puerta` o `canal`; `silencio`, `historial`, `costumbre` y `sistema` se rechazan con su nombre. Sin persona no hay autorizacion, **el si tambien caduca** (techo 1 h) y **un si se gasta UNA vez**: el gasto es otro asiento (el libro no se edita) y `esta_gastada` se **deriva**. |
| Q4 `VentanaDeArrepentimiento` | `autonomia/ventana.js` | El rato para deshacer antes de lo irreversible. Se abre con el **momento inyectado** (nunca `Date.now()`), **no se acorta por peticion** (se puede pedir mas, con tope de 600 s) y cerrar antes de tiempo no vale. **Cancelar NO es fallar**: se registra como `cancelacion` con `es_fallo: false`; solo lo que la plataforma rechaza es un fallo. |
| Q6 `PoliticaDeAutonomia` | `autonomia/politica.js` | **LA SINTESIS**: `rol` x `casilla` x `nivel` x `historial` -> `ejecutar` / `borrador` / `permiso` / `no`, en orden fijo `casilla -> rol -> nivel -> historial -> autorizacion -> ventana`, dejando el `porque` entero. **REGLA DURA: el historial INFORMA pero NO AUTORIZA.** |

**Como se cierra el ataque de las dos vias.** Cuatro cerrojos, y ninguno se fia
del otro:

1. **Una sola puerta.** La pregunta sale por el modulo real
   `adaptador-confirmacion` y la respuesta vuelve por su evento, pero **el canal y
   el RPC directo desembocan en la misma `responder()`**, con las mismas
   comprobaciones. No hay un segundo camino de entrada de un si.
2. **Una sola huella.** El permiso se concede para
   `(proyecto, cuenta, accion, rol)` **con la casilla vigente**, y `politica` la
   recalcula al decidir: un si de "comentar" presentado para "publicar" es `no`
   (`permiso_de_otra_accion`), y lo mismo para otra cuenta, otro proyecto, otro rol
   o una casilla mas blanda.
3. **Un solo uso.** `consumir` anota el gasto y la siguiente ejecucion ve
   `permiso_ya_gastado`. Dos ejecuciones simultaneas no pueden gastar el mismo si:
   el gasto pasa por el candado del custodio.
4. **Una sola fuente.** `decidir` **descarta** la autorizacion que traiga el
   payload y la busca en el registro por `autorizacion_id`; y no hay ningun topic
   para anotar una autorizacion: solo la puerta puede acunar un permiso.

**Por que el historial no autoriza.** `presion_del_historial()` devuelve 0 o 1 y
ese 1 solo puede **bajar un escalon** (`ejecutar` -> `permiso`). No existe una
rama que suba por historial ni que rellene el hueco de una autorizacion; un
asiento que se presenta como permiso (`autoriza: true`) se ignora y se deja
escrito en el `porque`. Si el historial pudiera, el sistema se estaria concediendo
permisos a si mismo: bastaria portarse bien unas cuantas veces. Un buen historial
no es un permiso; es, como mucho, la ausencia de un motivo para desconfiar.

**Que hace un actor de cada clase.** El `sistema` observa y no toca el mundo
(`pulso` y `leer` pasan; publicar, comentar, seguir... `no`). El `agente` y el
`dueno` juegan con el nivel de la cuenta: en `borrador` preparan, en `permiso`
preguntan, en `ejecutar` actuan con la ventana de arrepentimiento delante. Las
acciones **inocuas** (reversibles y privadas) se permiten hasta en `borrador`:
un puente que no puede mirar no puede trabajar.

Q1, Q3, Q4 y Q6 son **reflejos puros** (sin IO, sin reloj, sin estado global) y ni
siquiera escriben cuando se les llama por el bus. Q2 y Q5 son **custodios**:
`puerta.js` / `autorizaciones.js` son puros y `index.js` es el borde (dos candados
de single-writer, escritura temporal + `rename`, auditoria antes de cada
escritura, y un fichero roto **no se sobrescribe**: `sin_confirmaciones` /
`sin_autorizaciones`). El orden de escritura es siempre confirmaciones ->
autorizaciones: si el proceso muere entre las dos, queda un si **sin** permiso,
que es el lado seguro del fallo.

**Limite conocido y declarado.** El adaptador es del taller 3D: su vocabulario de
tipos es cerrado (`modelo_aprobado` / `modelo_rechazado`) y su `contexto` no
incluye la cuenta. Por eso una respuesta del canal solo se acepta si se puede atar
a **una** pregunta: por `confirmacion_id` (o un `callback_data` con `cf:<id>`), o
—si no lo trae— cuando hay **exactamente una** pregunta viva en ese proyecto y esa
cuenta. En cualquier otro caso se rechaza (`confirmacion_sin_contexto` /
`confirmacion_ambigua`) y la pregunta sigue pendiente hasta caducar: **un si que no
se puede atar a su pregunta no es un si**. Para cerrar el circulo del todo, al
adaptador le falta ecoar el `confirmacion_id` en el `callback_data` de los botones.

## Bloque 10 · El nombre y los vetos: quien habla y en nombre de quien

Cuatro piezas pequenas que evitan cuatro errores grandes. Antes de hablar por
alguien hay que saber **quien es y como habla** (E1); y hay que tener escrito que
el puente **no origina nada y no firma nada** (T1, T2, E2).

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| E1 `FichaDeCuenta` | `cuentas/ficha.js` + `cuentas/module.json` + `storage/instagram-bridge/fichas.json` | La ficha de una cuenta **en un proyecto**: identidad visible, voz (tono, vocabulario, lo que nunca dice, limites de tema) y limites propios (`no_publica`, `no_contesta`). **Sin ficha no se opera**; **sin voz declarada la cuenta SOLO LEE** (modo `lectura`, `admite` contesta `sin_voz`). La voz la declara el proyecto (`declarada_por: 'proyecto'` + `autorizacion_id`): el puente la aplica y no la inventa. La ficha es por cuenta **y por proyecto**: leerla sin proyecto es `ambito_incompleto` y desde otro proyecto es `ficha_de_otro_proyecto`, sin devolver contenido. Una cuenta sin proyecto dueno es un **fallo de alta** (`cuenta_sin_proyecto_dueno`), no una ficha incompleta. Custodio: single-writer, temporal + `rename`, auditoria antes de cada escritura (sello P1, secretos V1, ambito privado P3) y almacen ilegible que no se sobrescribe (`sin_fichas`). |
| E2 `SelloDeAtribucion` | `core/atribucion.js` | `sellar(pieza, cuenta)` pone la atribucion del **proyecto dueno** de la cuenta sobre una pieza ya sellada (P1); `verificar` contesta `atribuida` o `huerfana`; `auditar` devuelve la lista de huerfanas. **Una pieza huerfana NO sale** (sin sello, sin atribucion, atribucion incoherente o de otro proyecto) y **el puente no firma**: `firmar` siempre rechaza y una atribucion al puente es `firma_del_puente`. La atribucion **no se reescribe**: mismo dueno es idempotente, otro dueno es `atribucion_ya_fijada` (corregir = retirar y republicar). |
| T1 `FronteraSinContenido` | `core/frontera-contenido.js` | `comprobar` contesta `recibida` u `originada`; `rechazar_si_originada` para la publicacion. La pieza tiene que venir de un proyecto (origen + autor + sello coherentes). **El texto de relleno tambien es contenido propio**: se rechaza si el campo declara procedencia del puente (`procedencia.texto`) **y** si el texto es una frase de la tabla cerrada de relleno ("mira mi perfil", "no te lo pierdas"...), aunque la procedencia diga `proyecto`. Sin origen se falla cerrado (`sin_origen`). |
| T2 `FronteraSinIdentidad` | `core/frontera-identidad.js` | `auditar(atribuciones)` exige que todo este atribuido a un proyecto y que ninguna firma sea del puente; `vetar(firma)` rechaza toda firma del puente. `hay_cuenta_del_sistema(padron)` audita el padron **entero**: una cuenta con proyecto o handle del puente es `cuenta_del_sistema`; un asiento **sin proyecto dueno NO es una cuenta del sistema: es un fallo de alta** (`cuenta_sin_proyecto_dueno`), y se devuelve aparte para que no se disfrace de prohibicion. |

E2, T1 y T2 son **reflejos puros** (sin IO, sin reloj, sin estado global). E1 es
**custodio** y vive en el mismo modulo que el padron (`cuentas/`), con su propio
almacen (`fichas.json`) y su propio candado: el padron dice **de quien es** la
cuenta; la ficha dice **como habla**. `propiedad.js` declara `fichas` como
almacen privado (P3): la voz de una cuenta es de su proyecto y no se comparte.

**Que cierra cada veto.** E1 evita que el puente hable con una voz inventada;
E2 evita que lo publicado quede sin dueno; T1 evita que el puente se convierta en
autor (incluido el relleno que tapa un hueco); T2 evita que exista una identidad
del puente, en lo publicado y en el padron.

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
node modules/instagram-bridge/tests/evidencia.test.js
node modules/instagram-bridge/tests/ritmo.test.js
node modules/instagram-bridge/tests/prioridad.test.js
node modules/instagram-bridge/tests/cola.test.js
node modules/instagram-bridge/tests/tolerancia.test.js
node modules/instagram-bridge/tests/castigo.test.js
node modules/instagram-bridge/tests/regulador.test.js
node modules/instagram-bridge/tests/sesion.test.js
node modules/instagram-bridge/tests/casillas.test.js
node modules/instagram-bridge/tests/nivel.test.js
node modules/instagram-bridge/tests/puerta.test.js
node modules/instagram-bridge/tests/ventana.test.js
node modules/instagram-bridge/tests/politica.test.js
node modules/instagram-bridge/tests/autorizaciones.test.js
node modules/instagram-bridge/tests/autonomia.test.js
node modules/instagram-bridge/tests/ficha.test.js
node modules/instagram-bridge/tests/atribucion.test.js
node modules/instagram-bridge/tests/frontera-contenido.test.js
node modules/instagram-bridge/tests/frontera-identidad.test.js
```

```bash
cd modules/instagram-bridge/crate && cargo test --offline   # U1, A4.2, A1, A3, A5, O1/O2, D1, D3, D4 y D5, en escritorio
```

Los tests del padron, del catalogo, de la cola, de la tolerancia, de la autonomia y
de la ficha no tocan los ficheros del repo: cada prueba de disco se hace en un directorio temporal propio
y lo borra al terminar (`crear({directorio})`). Los del repo se leen una vez para
comprobar que son validos y estan vacios: un almacen de ejemplo con datos dentro
seria un estado inventado que nadie sabe de donde sale.

No estan encadenados en `package.json` a proposito: ese fichero es compartido
con los demas bloques y cada bloque anade su entrada al ensamblar.
