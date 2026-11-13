# instagram-bridge

Puente de operacion de cuentas de Instagram para los proyectos de Enki.

Este directorio **no es un modulo del bus**: es el arbol de la vertical. El
loader (`core/modules/loader.js`) trata una carpeta sin `module.json` como
agrupacion y busca manifiestos en sus subdirectorios, asi que aqui conviven
librerias puras (`core/`) y los modulos con manifest (`padron-cuentas`,
`catalogo-recetas`, `ritmo`, `sesion-cuentas`, `operacion`, `autonomia` y, desde el
bloque 13, tambien `puente`). Ver
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

## Bloque 11a · Publicar y sus fronteras: lo que sale, lo que se deshace y a quien no se escribe

Cinco piezas de las once del bloque 11 (las que publican y las tres fronteras que
la rodean). Un conversor, un puente y tres reflejos.

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| L1 `PreparadorDePieza` | `operacion/piezas.js` | La **unica frontera de formato** del sistema. `admitir` no toca nada y rechaza con `que_falta` exacto (caracteres, MB, segundos de mas); `adaptar` recorta el texto **por frases enteras y por el final**, y el resultado es **un prefijo del original**: no añade, no reordena y no corta una frase por la mitad, asi que no puede invertir el sentido ni comerse un dato (`45 €` no se convierte en `4`). **La primera frase no se toca**: si ella sola no cabe, se rechaza (`texto_no_cabe_sin_cambiar_el_sentido`) en vez de recortarla. Los adjuntos no se procesan aqui: se declara el **encuadre** (proporcion admitida mas cercana y cuanto se conserva) y el recorte de pixels lo hace el aparato; si se perderia lo que la pieza ensena, se rechaza. No publica: prepara. |
| L3 `RetiradaDePublicacion` | `operacion/retirada.js` | `retirar`, `corregir` y `borrar` caen en la **misma casilla** (`borrar`): las tres son irreversibles y visibles, porque la notificacion ya salio. **Retirar pasa por PERMISO aunque el nivel declarado sea «ejecutar»**: L3 le pone **techo `permiso`** al nivel antes de preguntar a Q6, asi que el nivel no compra una retirada y la unica forma de obtener `ejecutar` es una autorizacion real de una persona. Despues, en orden: **respaldo de lo que habia** (sin respaldo no se retira: despues ya no se podra mirar), **la mano** (se inyecta; este modulo no ejecuta), **la verificacion** (O: «ya no esta» es una consecuencia observable) y **la evidencia** (O3, anclada al respaldo). A5: un fallo de la mano va a **revision** y **no se reintenta**. Una autorizacion de otra accion, cuenta, proyecto o rol no vale. |
| M3 `RecorteDePrivacidad` | `core/recorte.js` | Minimiza **antes de guardar**: **lo que no se guardo no hay que borrarlo**. Lista **cerrada** de lo que se conserva (sello, cuenta, conversacion, mensaje, remitente, texto, momento, tipo) y cada descarte nombrado con su motivo (`identificador_de_tercero`, `dato_sensible`, `historial`, `fuera_de_la_lista`). **El texto del mensaje no se reescribe** (recortarlo seria cambiar lo que la persona dijo): si trae un correo o un telefono, se **avisa** sin copiar el valor. `conservar(tercero, motivo)` solo admite `responder` y `no_repetir`; `auditar` es el test permanente sobre lo ya guardado; `olvidar` dice `no_habia_nada` cuando de verdad no queda nada. |
| S1 `DestinatarioPrevio` | `puente/destinatario.js` | **Solo se responde a quien escribio primero**, y se comprueba **en cada envio**, no al configurar. Tres comprobaciones en orden: hay conversacion; **la abrio la otra persona** (si el primer mensaje es nuestro, no se contesta aunque luego nos respondan); se contesta **al autor del mensaje previo**, **en el mismo hilo y del mismo tipo** (un comentario no se contesta por mensaje directo). Devuelve la **prueba** del mensaje previo (id, momento, autor) para que el envio se pueda justificar despues. Sin mensaje previo **no hay envio**: no se abre conversacion nunca. |
| S2 `DetectorDeFueraDeAlcance` | `puente/alcance.js` | Crecimiento fuera, operacion dentro. Se detecta **por forma** (tabla cerrada y **ordenada**: manda el patron mas especifico): conseguir seguidores, escribir a listas, me gusta y seguimientos en masa, «un poquito de cada». **Diez cuentas distintas con el mismo texto es fuera de alcance** (umbral 3; el mismo texto se reconoce normalizado y por parecido, no por bytes), y veinte destinatarios ya es volumen. **No bloquea al usuario legitimo**: se cuentan **cuentas distintas**, no mensajes, asi que la misma persona insistiendo diez veces no es una campana. Se rechaza **nombrando la frontera** («esto no lo hago porque solo contesto a quien me escribio») y **no se negocia** una version pequena de lo mismo. |

L1, M3, S1 y S2 son **reflejos puros** (sin IO, sin reloj, sin estado global, sin
LLM). L3 es **puente**: compone pasos sobre puertos que se inyectan (`permiso` =
Q6, `respaldo`, `mano` = A3, `verificador` = O, `evidencia` = O3) y devuelve
`sin_puerto` nombrando el que falta: un puente sin mano que dice «hecho» es una
mentira con sintaxis correcta. El unico IO del bloque es el respaldo previo a una
retirada, un custodio append-only en `storage/instagram-bridge/respaldos-retirada.json`.

## Bloque 11b · Leer y responder: la foto con fecha, la deuda y lo que no se calla

Seis piezas (las que miran y contestan). Dos custodios, dos reflejos y dos
micro-agentes. La regla que las une: **no se inventa informacion ni se cierra una
deuda sin prueba.**

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| M1 `RetratoFechado` | `operacion/retratos.js` | La foto de la cuenta **con su fecha y con la fecha de cada dato**. **Un dato sin `leido_en` es una opinion**: se rechaza nombrandolo (`dato_sin_fecha`), y un dato posterior a la foto tambien (`dato_posterior_al_retrato`). `valor: null` con fecha **es un dato** («a las 09:00 no se pudo leer»), no un hueco. **Append-only**: la foto no se corrige, se toma otra; reenviar el mismo `retrato_id` es idempotente y reenviarlo con otros datos es un rechazo. Custodio single-writer (temporal + rename, auditoria antes de escribir, almacen ilegible que no se pisa). |
| M2 `CambioDesdeUltimaLectura` | `core/cambio.js` | **Sin retrato anterior hay PRIMERA LECTURA, no cambio**: `delta: null`, `hay_delta: false` y `sin_cambio: false` (un «0 cambios» contra la nada se lee como «todo igual»). Tampoco son cambio un anterior **de otra cuenta**, **ilegible** o **sin fecha**; un anterior **posterior** o **del mismo instante** se rechaza (`no_comparable`) porque el delta saldria con el signo cambiado. Los datos sin fecha se **omiten y se nombran**; si todos lo estan, no hay nada comparable. Con `historial`, compara contra la lectura **inmediatamente anterior**, no contra la mas vieja. Reflejo puro. |
| N1 `BandejaDeEspera` | `operacion/bandeja.js` | **Lo que espera respuesta, en FIFO.** **Contestado exige `veredicto: 'ocurrio'` Y `evidencia_id`**: sin ellos la marca se **RECHAZA** y la fila **SIGUE en la bandeja** (`sigue_esperando`), porque «se intento contestar» no es «la persona lo recibio». Lo contestado **no se reabre** (contestar dos veces es peor que no contestar) y un silencio **no cierra una queja** aunque la decision venga firmada. Custodio single-writer con auditoria. |
| N2 `ClasificadorDeLlegada` | `operacion/llegada.js` | **Un mensaje ININTELIGIBLE es delicado, no ruido**: `delicado: true`, `destino: 'escalar'`, `se_descarta: false`. No se puede decidir que un mensaje no importa sin haberlo entendido. **Micro-agente sin LLM obligatorio**: la tabla cerrada decide por lexico y forma; el juicio es opcional, sincrono, y **no puede bajar dos suelos** (lo ilegible y la queja). Si falta, lanza, devuelve una promesa o una clase desconocida, se usa la tabla. Nunca lanza: si algo se rompe, el mensaje se escala. |
| N3 `RedactorDeBorrador` | `operacion/borrador.js` | **Un borrador NUNCA envia y NUNCA persiste.** No importa `fs`, `path`, red ni ningun puerto de envio; devuelve `se_envia:false`, `se_persiste:false`, `envio:null`, `persistencia:null` y `destino:'revision_humana'`. Escribe con la **voz de E1**: sin voz declarada por el proyecto **no redacta** (`sin_voz`, modo lectura); `lo_que_nunca_dice` y `limites_de_tema` se revisan **antes** de devolver el texto y, si ninguna variante los respeta, no se devuelve un «casi». Tampoco redacta para lo ininteligible ni para spam: no se inventa una respuesta a lo que no se ha entendido. |
| N5 `SilencioElegido` | `operacion/silencio.js` | **Una QUEJA no se silencia, se escala**, por **clase** y por **texto**: una queja mal clasificada como `consulta` se escala igual y se devuelve `reclasificacion: 'queja'`. Los clasificadores se equivocan y el silencio es la unica decision que no se puede deshacer. **Si pueden callarse** spam y agradecimiento; **no** lo ininteligible ni lo delicado. Una clase desconocida **se responde**: callar por defecto pierde personas. Reflejo puro. |

M1 y N1 comparten el borde de IO (`operacion/custodia.js`): single-writer por
cola de promesas, escritura temporal + rename, **auditoria antes de cada
escritura** y un almacen ilegible que **no se sobrescribe**. M2 y N5 son
reflejos puros. N2 y N3 son micro-agentes: el juicio se inyecta
(`opts.juicio_llegada` / `opts.juicio_borrador`) y su ausencia o su fallo **no
rompe nada**, porque la tabla cerrada es el suelo.

## Bloque 12 · La rotura: lo que la plataforma cambia y lo que el puente sabe hacer

Cuatro piezas y una verdad incomoda. La plataforma cambia su interfaz cuando le
da la gana: un boton se llama distinto, un paso desaparece, la postcondicion deja de
ocurrir. Aqui se declara la rotura (con dos evidencias, no con una), se repara la
receta con una persona, se recuerda el cambio para todos los proyectos y se dice la
**verdad sobre lo que hoy se sabe hacer**.

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| F1 `DeclaradorDeRotura` | `recetas/rotura.js` | **DOS evidencias independientes del mismo sintoma son ROTURA; UNA es SOSPECHA.** Con una sola no se distingue un cambio de plataforma de un dedo que resbaló o de una pantalla a medio cargar, y declarar rotura retira una receta que funciona para todos. La misma evidencia reenviada **no cuenta dos veces** (se deduplica por `evidencia_id`, o por paso+tipo+ancla+instante+testigo): copiarla no la convierte en dos. Dos sintomas distintos vistos una vez cada uno son **dos sospechas**, no se suman. Cada evidencia ilegible se descarta **nombrando el motivo**. Reflejo puro; la `firma()` de la declaracion es igual vista desde dos proyectos, asi que F3 no guarda dos veces el mismo cambio. |
| F2 `ReparadorDeReceta` | `recetas/reparar.js` | **Sin confirmacion registrada NO llega al catalogo**, y **la reparacion no se autopromueve**: nace `propuesta`, la confirma el **dueno** (un agente o el sistema pueden proponer, no confirmar) y aun asi entra como propuesta — publicar vuelve a exigir `autorizacion_id`. Un `estado: 'vigente'`, un `autorizacion_id` o un `confirmada: true` que lleguen en la entrada se **descartan y se dicen**. Las anclas candidatas **salen de lo observado** (nodos con nombre del `HechoVisible` de ahora, sin reusar el ancla rota ni las de otros pasos, sin nodos sin nombre, solo tocables si el paso toca). El **juicio (LLM) es opcional**: solo puede elegir entre esas candidatas, y si lanza, inventa o no contesta, se sigue con la regla. Una **sospecha no reescribe el saber comun** (`solo_sospecha`), y si un paso roto no tiene candidata se devuelve `sin_observacion_suficiente` con lo que hay que mirar, en vez de una receta a medias. Micro-agente puro (sin IO): la confirmacion la registra el custodio. |
| F3 `MemoriaDeCambios` | `recetas/cambios.js` + `storage/instagram-bridge/cambios.json` | **COMPARTIDA a proposito**: una rotura descubierta por un proyecto ahorra el golpe a todos, asi que **no lleva sello de proyecto** (una entrada sellada se rechaza) y si lleva **quien la descubrio** (`descubierto_por`) y quienes la **corroboraron** (`visto_por`): atribucion, no propiedad. El mismo cambio visto por dos proyectos es **una entrada corroborada** (sube `confirmaciones`), no dos. **NO guarda estado de ninguna cuenta**: los campos son una **lista cerrada** y `auditar()` recorre el fichero entero buscando campos de cuenta (`seguidores`, `retrato`, `sesion`, `metricas`...) — si aparecen, `estado_de_cuenta_en_memoria` y no se escribe nada. Custodio single-writer (candado, temporal + rename, auditoria antes de cada escritura, fichero roto que **no se pisa**, ningun secreto V1). |
| F4 `CoberturaOperativa` | `recetas/cobertura.js` | **UNA RECETA VIGENTE QUE NO ENSAYA ES UNA CAPACIDAD CAIDA, no «casi lista».** Solo hay dos estados (`operativa`, `caida`) y el tercero no existe a proposito. Un ensayo **apto** de la **firma vigente** es lo unico que la hace operativa; uno no apto la deja caida con su motivo; una receta **reparada** exige ensayo **nuevo** (`receta_cambiada_sin_ensayo`) aunque la version coincida, porque la version puede mentir y la firma no. Una capacidad **esperada sin receta** y una receta **retirada por rotura** tambien son caidas. Devuelve numeros (`operativas/total`, `cobertura_pct`), el **porque de cada caida** y un resumen que lo dice sin adornos. Reflejo puro. |

F1 y F4 son **reflejos puros** (sin IO, sin reloj, sin estado global). F2 es
**micro-agente**: sin LLM funciona con reglas, el juicio es opcional y su fallo no
rompe nada. F3 es **custodio**: single-writer, temporal + rename, auditoria antes de
cada escritura y fichero roto que no se sobrescribe. F3 vive en el modulo `recetas`
porque es el mismo oficio (custodiar el saber hacer comun) y comparte directorio de
almacenes, con **fichero y candado propios**.

En el aparato, `crate/src/almacen/anclas.rs` (F1b) propone las **anclas candidatas**
para un paso roto: solo salen de nodos **nombrados** del hecho de AHORA (con su
`nodo_id`, la prueba de que no se inventaron), no propone el ancla perdida ni las que
otros pasos usan, y con **mirada parcial no propone nada** — pide otra mirada.

## Bloque 13 · La boca: operar por conversacion

Cinco piezas para hablar con el dueno, y el primer bloque que **no habla de la
cuenta sino de la persona**. Dos de ida (entender lo que pide y completar lo que
falta), una de vuelta (contar lo que paso) — y una verdad comoda de decir y dificil
de cumplir: **quien adivina la intencion acaba publicando lo que no era**.

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| C1 `ClasificadorDePeticion` | `puente/clasificador.js` | **BAJO EL UMBRAL SE DEVUELVEN DOS CANDIDATAS Y SE PREGUNTA: NO SE ELIGE.** La tabla cerrada de lexico puntua cinco capacidades (`publicar`, `responder`, `mirar`, `demostrar`, `reparar`) con raices de palabra (peso 2 los verbos, 1 los sustantivos). Decide solo si la primera pasa el umbral (2) **y** le saca margen (1) a la segunda; si no, devuelve `capacidad: null`, **dos** candidatas con sus puntos y una pregunta que las nombra. Dos y no una (una es elegir disfrazado de duda) ni cinco (eso es devolverle al dueno el trabajo que venia a delegar). **Regla del sintoma**: «se ha roto», «dejo de», «ya no» son una averia declarada, no una tarea, y mandan sobre la capacidad que se rompio — publicar de mas no se deshace, arreglar de mas si. El **juicio (LLM) es opcional** y solo puede ratificar o corregir **dentro de las cinco**; si lanza, devuelve una promesa, una capacidad que no existe o basura, manda la tabla. Nunca lanza. |
| C2 `CompletadorDePeticion` | `puente/completador.js` | **UNA RESPUESTA QUE NO ENCAJA SE REPREGUNTA UNA VEZ, y despues se rinde con lo que tenga.** Un campo por pregunta, en el orden declarado, cada uno con su forma (`texto`, `cuenta`, `hilo`, `capacidad`). «No encaja» es: vacio, `no se`, `da igual`, `nada`, un signo suelto, o un dato que no tiene la forma del campo (una cuenta con espacios, una capacidad que no existe). **Lo que no encaja NO se guarda**: un «no se» que entra como texto es un «no se» que se publica. La segunda vez no hay repregunta: `se_rinde`, `con_lo_que_tengo` con lo que falta **nombrado** y una nota. Insistir por tercera vez es la unica salida que no existe. El estado es un objeto plano que entra y **no se muta**: se puede guardar entre dos mensajes. |
| C4 `NarradorDeResultado` | `puente/narrador.js` | **NUNCA DICE «hecho» SIN VEREDICTO `ocurrio` — y ni siquiera entonces si falta la evidencia.** Cuatro veredictos (`ocurrio`, `no_ocurrio`, `sin_veredicto`, `fallo`) y un techo: el «hecho» exige `evidencia_id` (bloque 6: sin prueba no hay hecho). `ocurrio` sin prueba se cuenta como «ha pasado, pero no lo puedo sostener». El **mapeo es el modulo real**: las frases las viste `contabilidad-analitica/puente-lenguaje-dueno` (`a_cifra`) con las plantillas declaradas del puente, asi que no hay una segunda traduccion que pueda mentir distinto. **Seguro ejecutable**: si una plantilla declarada dijera «hecho» sin prueba, se sustituye por la honesta y se dice. Un `fallo` se cuenta con R2, no con una plantilla de resultado. |
| R2 `TraductorDeFallo` | `puente/traductor.js` | **Al dueno NO se le nombran pantallas, ni botones, ni terminos tecnicos: se le dice QUE HACE FALTA.** El mensaje tecnico **no se limpia, no se cita y no se resume**: se sustituye (un tecnico entre comillas sigue siendo un tecnico). Tabla cerrada de 18 codigos, cada uno con su frase y su `hace_falta` («tu permiso para seguir», «que la cuenta vuelva a entrar», «que una persona lo mire conmigo en la cuenta»). Un codigo que no esta no se inventa: frase honesta y «que una persona lo mire». Una prosa de error **no se toma por un codigo** (un codigo es una etiqueta, no una frase). `revisar()` es el seguro —pantallas, botones, tecnicismos— y la propia pieza lo usa antes de devolver nada. |
| R4 `AvisoAnticipado` | `puente/avisos.js` | **UN AVISO POR CAUSA Y VENTANA.** Avisa antes de que pregunten (sesion, rotura, publicacion que no salio, ritmo, cobertura) y no repite: la clave `causa::ventana` se marca cuando el aviso **salio**. La `ventana` es **obligatoria** y la declara quien llama (aqui no hay reloj): sin ella no hay anti-repeticion, y las dos alternativas —repetirse siempre o no volver a darse nunca— son peores que no avisar. Cableado al productor **real** `motor-avisos.producir.request`, que sube el aviso a `aviso-al-negocio` (y detras, `adaptador-avisos`): no se llama al adaptador directo porque su tabla de tipos es cerrada y es de otro proyecto. Un aviso que **no salio** (sin bus, productor mudo, productor que rechaza) **no se marca como dado**: poder reintentar es la diferencia entre un aviso perdido y una mentira. La memoria es RAM, exportable (`avisados()`) y rehidratable (`sembrar()`). |

C1, C2, C4 y R2 son **micro-agentes**: sin LLM funcionan; C1 admite juicio
opcional y su fallo no rompe nada. R4 es **puente** (compone y habla por el bus).
Ninguna de las cinco tiene reloj ni red, y las cinco comparten modulo (`puente/`)
porque comparten oficio. El borde vive en `puente/index.js` y **no piensa**: solo
correlaciona `request` → `response` | `failed`.

## Bloque 14 · El fallo contado: lo que el dueno lee cuando algo no sale

Dos piezas para el peor momento — y el que mas se nota. R2 pone el fallo en su
idioma y dice que hace falta; R4 evita que se entere por su cuenta. La regla que
las une: **al dueno no se le da un parte tecnico ni se le repite lo que ya sabe;
se le dice que pasa y que se necesita.**

R2 ya esta descrita arriba porque comparte modulo con la boca: el fallo contado
es parte de hablar con el dueno, no un anexo. Lo que añade R4 es el tiempo: un
aviso **antes** de la pregunta, uno solo por causa y ventana, producido por el
`motor-avisos` real y entregado por el camino real (`aviso-al-negocio` →
`adaptador-avisos`). Las dos piezas son la misma doctrina vista desde dos lados:
no inventar (R2 no repite el tecnico, R4 no marca lo que no salio) y no cansar
(R2 no da codigos, R4 no repite avisos).

## Bloque 15 · El ciclo de vida: poner en marcha y retirar sin perder la memoria

Las dos ultimas piezas son las que **abren y cierran** todo lo anterior, y por eso
van al final: construir la puerta antes de la casa no ensena nada. Y las dos
comparten una misma conviccion: **el sistema no se pone en marcha solo y no olvida
a quien retiro**.

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| B2 `AltaDeCuenta` | `cuentas/alta.js` | **NO HAY ALTA SIN UNA PERSONA, Y UN ALTA ATASCADA NO PARA A NADIE.** La ceremonia nace en `esperando_persona` y no escribe el padron hasta que el dueno abre la sesion delante del aparato: `agente` y `sistema` no abren sesiones (un sistema que se abre solo la puerta no tiene puerta) y el puente no guarda credenciales. Despues recorre **siete pasos en orden** — inscribir (B1), ficha (E1), recetas vigentes (A4.4), ventana de servicio (H3 · W7), nivel (Q3), ensayo (A4.3) y **primera lectura con testigo** (O1/O2) — pidiendo cada uno a su pieza: no reimplementa ninguno. **Si un paso falta, se NOMBRA y se para ahi**: `paso_sin_pieza` / `paso_rechazo` con el `paso_faltante`, los pasos hechos y `donde_esta`; no se salta al siguiente ni se rellena con lo plausible, y `continuar()` la retoma **en ese mismo paso** (no la reinicia: B1 rechazaria la reinscripcion). Cada cuenta tiene SU ceremonia y su estado, sin candado global: mientras A espera a una persona, B se da de alta y opera. **La cuenta esta operativa cuando existe la primera prueba**: el veredicto de O1/O2 tiene que ser `ocurrio` CON `evidencia_id`, y tiene que ser de **lectura** — estrenar publicando se rechaza con su nombre. La ventana por defecto es la de W7 (`cuando_la_persona_no_lo_este_usando`), declarada como default y no como horario inventado; el nivel, si nadie lo declara, es el conservador de Q3. |
| B4 `BajaYTraspaso` | `cuentas/baja.js` | **DAR DE BAJA ARCHIVA; NO BORRA. Y EL TRASPASO NO REESCRIBE EL SELLO.** La baja pasa por el padron (una sola pluma) y despues **relee el asiento para comprobarlo**: si no quedo `archivada`, con su `archivo` y su historia, la baja se declara inconsistente en vez de decir que fue bien. Retirada no es desaparecida: `consultar` sigue encontrando la cuenta. Sin `autorizacion_id` no hay baja (el padron lo impone y B4 no lo rellena). El traspaso exige **ficha en el proyecto destino**: sin ella queda **pendiente** —`ficha_destino_ausente`— y la cuenta **sigue sirviendo a quien servia**, porque mudarla seria dejar sin voz una cuenta en un proyecto que no la conoce. Cuando se hace, crece la `historia` con un paso (de/a/motivo/momento/quien) y se comprueba que el `sello` (P1) y el `alta` de nacimiento quedan **byte a byte** como estaban; si cambiaron, el traspaso se rechaza aunque el padron haya dicho que si. `borrar()` no borra: dice las **tres cosas que se perderian** y la orden explicita distinta que haria falta (registrada en Q5). |

Las dos viven en `cuentas/` porque comparten el padron, no porque sean el padron:
B2 es un **borde** que pide los siete pasos y B4 pide la baja y el traspaso. El
borde del modulo (`cuentas/index.js`) solo correlaciona `request` →
`response` | `failed` y deja los topics en `instagram.cuenta.alta.*`,
`instagram.cuenta.baja.ordenar` y `instagram.cuenta.traspaso.ordenar`.

Con este bloque, **las 63 piezas del arbol estan implementadas**: 44 tests Rust
en el aparato (U1, A4.2, A1, A3, A5, O1/O2, D1, D3, D4, D5, F1b) y 52 suites JS
en el cerebro, una por fichero de pieza (o por grupo, cuando la pieza es una
seccion de un modulo).

## Bloque 16 · El canal: lo que hace falta para hablar con el bus

Las 63 piezas del arbol dicen que hacer; ninguna sabia **por donde**. El crate
solo tenia `--comprobar`. Este bloque pone el canal: el cliente MQTT, el bucle de
ordenes y las tres trampas que cuestan una tarde cada una. Y lo pone **sin tocar
ni una pieza de las anteriores**: el canal las llama por su puerto, no las
reescribe.

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| El canal MQTT | `crate/src/canal/mqtt.rs` | **LA LLAVE VIAJA EN LA URL, Y ESO OBLIGA A ESCRIBIR EL CLIENTE.** El broker se alcanza por `wss://enki-ai.online/mqtt?k=<llave>`, pero los clientes MQTT de libreria se quedan con host y puerto y **tiran el path y la query**: la llave se pierde antes del handshake y el broker contesta 401. Aqui hay un cliente minimo y completo en lo que necesita: CONNECT 3.1.1, SUBSCRIBE, PUBLISH QoS 0, PINGREQ y DISCONNECT, mas el `Framer`. `tungstenite` pone el WebSocket (RFC 6455) y nada mas; el dialogo MQTT es propio. Cada fallo tiene nombre (`url_no_segura`, `red`, `tls`, `handshake_rechazado`, `connack_rechazado` con su codigo, `suback_rechazado`, `sin_respuesta`, `protocolo`): un `Err("error")` obliga a adivinar si fue la llave o el DNS. |
| El bucle de ordenes | `crate/src/canal/bucle.rs` | **UNA ORDEN QUE NO SE ENTIENDE NO SE EJECUTA, Y SIEMPRE SE CONTESTA CON PAR DE FALLO.** Se suscribe a `core/core-a/events/bridge/orden/#` y valida el payload contra un catalogo **cerrado** (`ACCIONES = ["publicar", "observar"]`, `REDES = ["instagram"]`): una accion desconocida no se degrada a la que haya a mano, se nombra. La mano (A3) solo se mueve si `simulacion != false` —ausente se lee como simulacion, porque ejecutar de verdad sin que nadie lo pida es irreversible— y el resultado va a `core/core-a/events/bridge/resultado` con `{ok, motivo}` **siempre los dos**: una publicacion simulada nunca contesta `ok:true`, porque nada salio del aparato. La unica forma de `ok:true` en `publicar` es que la mano confirme la publicacion con su postcondicion vista, y hoy este binario no tiene mano real: lo dice con su nombre (`ejecucion_real_no_habilitada`) en vez de fingir. La otra accion, `observar` (19c), es **lectura pura**: se atiende aunque `simulacion` sea `true` y contesta `ok:true` solo porque la foto esta en el resultado (`volcado`), no porque se haya publicado nada. |
| El JSON del canal | `crate/src/canal/json.rs` | **BUSCAR UNA CLAVE CON SUBCADENAS ES EJECUTAR LO QUE NO ERA.** Una orden es JSON y hay que leerla de verdad: claves repetidas se rechazan (quedarse con la ultima es como se cuela un `simulacion:false` detras de un `true`), `"false"` en texto no es `false`, y lo que no es JSON se nombra con el byte donde se rompio. Es un parser pequeño y estricto, no un `serde`: el crate no añade una cuarta dependencia para leer ocho claves. |
| El CLI | `crate/src/main.rs` | **PROBAR UNA ORDEN A MANO Y RECIBIRLA DEL BUS PASAN POR EL MISMO CODIGO.** `--comprobar` se queda como estaba (U1); `--simular --llave <k> --url <wss://...>` abre el canal, comprueba CONNACK, suscripcion y PINGRESP y **no ejecuta nada** durante la ventana de escucha; `--orden '<json>' --simular` imprime el resultado tal cual se publicaria. `--orden` no es una puerta trasera: con `simulacion:false` contesta `ejecucion_real_no_habilitada` y no toca nada. La URL se imprime **sin la query**: un canal que loguea su URL loguea la llave. |

### Las tres trampas, y donde esta cada una en el codigo

1. **El subprotocolo.** El handshake tiene que declarar
   `Sec-WebSocket-Protocol: mqtt` o el broker cierra con 400 y el sintoma que se
   ve es "no conecta" sin mas pista. Esta en `Canal::conectar`
   (`ClientRequestBuilder::with_sub_protocol("mqtt")`). `tungstenite` ademas
   falla el handshake si pedimos `mqtt` y la respuesta no lo devuelve, asi que la
   trampa se convierte en un error con nombre.
2. **El proveedor criptografico.** Con `rustls` hay que instalar el proveedor
   **antes** de construir cualquier configuracion TLS
   (`rustls::crypto::ring::default_provider().install_default()`), o el proceso
   aborta al conectar con un mensaje que habla de `CryptoProvider` y no del
   canal. Esta en `instalar_proveedor()`, una vez por proceso (`Once`), y es la
   primera linea util de `Canal::conectar`.
3. **El framer.** Algunos brokers entregan el CONNACK partido en frames de **un
   byte**. Leer "un paquete por mensaje" da `[0x20]` y un falso codigo de
   rechazo. El `Framer` acumula bytes y extrae paquetes completos por la longitud
   variable de MQTT: `None` significa **"todavia no"**, nunca "no hay nada". Los
   tres tests de particion (`el_framer_extrae_paquetes_partidos`,
   `el_framer_extrae_dos_paquetes_en_un_solo_frame`,
   `el_framer_no_se_come_bytes_incompletos`) son los que protegen esto, y son
   puros: cero red, cero reloj.

### Por que se rompe el "0 dependencias" (y hasta donde)

El crate se escribio sin dependencias a proposito: la mano, la mirada, la
escalera y el testigo se prueban en escritorio con puertos inyectados y no
arrastran nada. Hay **una** superficie donde eso no se puede cumplir sin
reescribir un estandar: el canal. Y se rompe con una lista **cerrada** de tres
cajas, cada una con su razon:

| Crate | Version | Por que |
|---|---|---|
| `tungstenite` | 0.30, `default-features = false`, `handshake` + `rustls-tls-webpki-roots` | El handshake y el framing de WebSocket (RFC 6455): enmascarado, SHA-1 de la llave, parseo de frames. Es codigo de seguridad, no de negocio. Se usan SOLO `Message` y el handshake; el dialogo MQTT sigue siendo nuestro. |
| `rustls` | 0.23, `default-features = false`, `ring` + `std` + `tls12` | TLS 1.2/1.3 en Rust puro. Sin OpenSSL (no existe en el NDK de Android) y sin `aws-lc-rs` (el default de rustls, que necesita cmake y compilador de C en el NDK). |
| `webpki-roots` | 1 | Las raices de confianza compiladas dentro: el aparato no tiene por que llevar el almacen de certificados del sistema. |

Nota de ajuste real: la receta pedia `tungstenite` con
`default-features = false, features = ["rustls-tls-webpki-roots"]`, y **asi no
compila**: el modulo `client` de tungstenite esta detras de la feature
`handshake`, que no viene en `default = ["handshake"]` cuando se desactivan los
defaults. Se añade `handshake` a la lista; ninguna otra feature de mas.

Y hasta donde llega la grieta: ningun otro fichero del crate importa estas
cajas. `canal/` es la unica carpeta que sale a la red; las otras cinco siguen
siendo `std` puro. El test `el_enum_de_rust_no_arrastra_dependencias_externas`
(`tests/fallos.test.js`) ya no exige un `[dependencies]` vacio —eso seria una
mentira— sino **exactamente estas tres y ninguna mas**, y sigue comprobando que
el contrato no usa `serde`.

### Verificacion del bloque

```bash
cd modules/instagram-bridge/crate
cargo build                    # compila lib + bin, sin avisos
cargo test --offline           # 44 tests previos + 5 del framer + 8 unitarios del canal
# el test contra el bus real NO corre en CI: necesita la llave
ENKI_BUS_URL='wss://enki-ai.online/mqtt?k=<llave>' \
  cargo test --test canal_integracion -- --ignored --nocapture
```

El test de integracion **solo se suscribe y comprueba CONNACK + SUBACK +
PINGRESP**: no publica nada en el bus. Un test que publica en produccion para
probar que el canal funciona deja basura que alguien lee como una orden.

## Bloque 17 · proyecto Android

El crate sabia abrir el canal y los seis `.kt` sabian mirar, tocar, compartir y
decidir; lo que faltaba era **el envoltorio**: el proyecto Gradle, el manifiesto,
los dos servicios y la pantalla. Sin esto no se puede abrir en Android Studio ni
sacar un APK. Este bloque **no cambia ni una linea del crate ni del cerebro**:
solo añade `android/`.

| Pieza | Fichero | Que hace ejecutable |
|---|---|---|
| El build | `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties` | AGP 8.7.3 (no 8.5.x: **8.5.1+ es la primera que comprueba la alineacion de 16 KiB** al empaquetar; con una anterior el `.so` de 4 KiB entra sin aviso y el fallo se ve en el movil), Kotlin 2.0.21, `androidx`, `nonTransitiveRClass`. Un solo modulo (`:app`). El crate **no** es un subproyecto Gradle. |
| El modulo | `android/app/build.gradle.kts` | `namespace`/`applicationId` = `online.enki.instagram`, `compileSdk 35`, `minSdk 26`, `targetSdk 35`, Java/Kotlin 17, `jniLibs.useLegacyPackaging = false`, release sin minificar y **firmado con debug** para que se pueda instalar. Y la tarea `compilarCrate`: una `Exec` **por ABI** que llama `cargo ndk -t <abi> -o src/main/jniLibs build --release` con un `CARGO_TARGET_DIR` propio (`crate/target/android-<abi>`) y **borrando `RUSTFLAGS` y `CARGO_ENCODED_RUSTFLAGS` del entorno** — si el portatil los tiene exportados, sustituyen a `crate/.cargo/config.toml` en silencio y se pierden el build-id y el `max-page-size=16384`. |
| El manifiesto | `android/app/src/main/AndroidManifest.xml` | `INTERNET`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`; el `<service>` de accesibilidad con `BIND_ACCESSIBILITY_SERVICE` + `@xml/accesibilidad`; el `<service>` del primer plano con `foregroundServiceType="specialUse"` y su subtipo; `MainActivity` como launcher; `usesCleartextTraffic="false"`; `<queries>` de Instagram y el `FileProvider` que exige `Compartir.kt`. |
| El servicio de accesibilidad | `res/xml/accesibilidad.xml` | `typeWindowStateChanged|typeWindowContentChanged`, `feedbackGeneric`, `notificationTimeout=100`, `packageNames=com.instagram.android`. **Mas dos flags que sin ellos el puente esta ciego**: `flagReportViewIds` (sin el, `viewIdResourceName` es `null` y `Pantalla.kt` no reconoce la pantalla de entrada) y `canPerformGestures` (sin el, `dispatchGesture` no existe y todo gesto da `gesto_sin_respuesta`). |
| El puente | `java/.../PuenteNativo.kt` | `System.loadLibrary("enki_instagram_bridge")` y los tres simbolos `external`: `iniciar(url, llave): Boolean`, `detener()`, `estado(): String` → `Java_online_enki_instagram_PuenteNativo_{iniciar,detener,estado}`. Cada llamada va dentro de un envoltorio `*Seguro` que atrapa `Throwable` (`UnsatisfiedLinkError` **no es una `Exception`**): sin esto, un simbolo que falta mata el proceso en la primera llamada y sin log util. |
| El primer plano | `java/.../ServicioEnki.kt` | `LifecycleService` en primer plano con notificacion persistente y accion *Parar*. `iniciar()` hace red (TLS + CONNECT + SUBACK): se llama en un hilo aparte. Refresca el estado cada 3 s. `START_NOT_STICKY` a proposito: un reintento del sistema llega sin llave. |
| La pantalla | `java/.../MainActivity.kt` + `res/layout/actividad_principal.xml` | Estado del canal, estado del servicio de accesibilidad, URL y llave, y tres botones (conectar / desconectar / ajustes de accesibilidad). **La llave no se guarda**: se pasa como extra del `Intent`, el servicio la tiene en memoria y el campo se vacia. La URL si se recuerda (no es un secreto). |
| Recursos | `res/values/strings.xml`, `res/values/themes.xml`, `res/drawable/ic_notificacion.xml`, `res/xml/rutas_ficheros.xml` | Tema Material del sistema (`android:Theme.Material.Light.NoActionBar`: no se añade Material Components por una pantalla de tres botones), icono vectorial blanco de 24 dp, y la unica ruta que el `FileProvider` puede entregar (`cache/compartir/`). |
| El wrapper | `android/gradle/wrapper/gradle-wrapper.properties` | Gradle 8.9. El `.jar` del wrapper no viaja en el repo (es un binario): lo genera Android Studio al sincronizar, o `gradle wrapper --gradle-version 8.9`. |

### El borde JNI: lo que este bloque deja declarado y lo que falta

`PuenteNativo` declara los tres simbolos con la firma exacta que tiene que exportar
Rust:

```rust
#[no_mangle]
pub extern "system" fn Java_online_enki_instagram_PuenteNativo_iniciar(
    env: JNIEnv, _esto: JObject, url: JString, llave: JString) -> jboolean
#[no_mangle]
pub extern "system" fn Java_online_enki_instagram_PuenteNativo_detener(env: JNIEnv, _esto: JObject)
#[no_mangle]
pub extern "system" fn Java_online_enki_instagram_PuenteNativo_estado(
    env: JNIEnv, _esto: JObject) -> jstring
```

**El bloque 17 dejo los simbolos declarados y sin exportar**; el borde que los
pone es el bloque 18 (mas abajo). La firma de arriba es el contrato que ese borde
cumple. Por eso
la app **no finge**: si el simbolo no esta, el estado dice `sin_borde_jni` con su
motivo en la pantalla y en la notificacion, en vez de caerse o de enseñar
"conectado". Un `cargo ndk ... build --release` ya produce
`libenki_instagram_bridge.so` con el codigo de percepcion y canal dentro; lo unico
que falta es la puerta.

### Compilar el APK en el portatil (Windows)

Lo que hay que instalar, en este orden:

1. **JDK 17** (Temurin/Adoptium o el que trae Android Studio). AGP 8.7 exige 17, no
   11 y no 21.
2. **Android Studio** (Ladybug o posterior) con, en *SDK Manager*:
   - **Android SDK Platform 35** (compileSdk/targetSdk)
   - **Android SDK Build-Tools** (la que proponga Studio)
   - **NDK (Side by side) r30** — el crate enlaza a 16 KiB y r30 es el que se probo
   - **CMake** no hace falta: no hay codigo C/C++ que compilar.
3. **Rust** por `rustup` (`https://rustup.rs`), y las dos dianas de Android:
   ```powershell
   rustup target add aarch64-linux-android x86_64-linux-android
   ```
4. **cargo-ndk**:
   ```powershell
   cargo install cargo-ndk --locked
   cargo ndk --version        # tiene que contestar una version, no "no such command"
   ```
5. La variable de entorno del NDK, apuntando a la carpeta `...\ndk\30.x.x`:
   ```powershell
   setx ANDROID_NDK_HOME "%LOCALAPPDATA%\Android\Sdk\ndk\30.0.0000000"
   ```
   (Y abrir una consola nueva. `ANDROID_HOME` tambien vale si esta puesto: cargo-ndk
   busca ahi.)

Despues:

```powershell
# 1 · Abrir la carpeta android\ en Android Studio y dejar que sincronice
#     (genera gradle-wrapper.jar y el SDK local en local.properties).

# 2 · Desde la raiz del repo, o desde el terminal de Studio:
cd modules\instagram-bridge\android
.\gradlew.bat :app:assembleDebug
# APK -> app\build\outputs\apk\debug\app-debug.apk   (con las dos ABI)

# 3 · Solo el crate, sin Gradle (util para ver el error de Rust limpio):
cd ..\crate
cargo ndk -t arm64-v8a -o ..\android\app\src\main\jniLibs build --release

# 4 · Instalar en el movil por USB (depuracion activada):
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Si no hay Rust en el portatil y solo se quiere revisar la capa Kotlin:
`.\gradlew.bat :app:assembleDebug -Penki.sin-rust=true` (el APK sale **sin** `.so`
y la pantalla lo dice: `sin_biblioteca`).

### Despues de instalar, en el movil

1. Abrir **Puente Enki**, teclear `wss://…/mqtt?k=<llave>` y la llave, *Conectar*.
   La notificacion persistente pasa a `arrancando` y luego a `conectado` (o al
   motivo del fallo).
2. *Abrir ajustes de accesibilidad* → **Puente Enki · Instagram** → activar. Es el
   unico permiso que se da a mano, y es el que permite leer el arbol y tocar.
3. Aceptar el permiso de notificaciones (Android 13+). Sin el, el servicio en
   primer plano sigue vivo pero su notificacion no se ve.

### Verificacion del bloque (sin SDK, que es lo que se puede hacer aqui)

```bash
cd modules/instagram-bridge/android
find . -type f -not -path './.git/*' | sort | xargs wc -c   # todos existen, ninguno vacio
grep -rn 'package online.enki.instagram' app/src/main/java  # los 9 .kt, el mismo paquete
grep -o '@xml/[a-z_]*' app/src/main/AndroidManifest.xml     # cada recurso existe en res/
grep -o '@drawable/[a-z_]*' app/src/main/AndroidManifest.xml
```

Lo que **no** se puede verificar aqui y hay que ver en el portatil: que Gradle
resuelva los plugins, que `cargo ndk` encuentre el NDK, y que el APK instale. Este
servidor no tiene ni SDK ni NDK.

## Bloque 18 · el borde JNI

Lo que faltaba para que la app dejara de decir `sin_borde_jni`: **el crate exporta
los tres simbolos** que `PuenteNativo.kt` declara como `external`. Nada mas — este
bloque no cambia el canal, ni el bucle, ni una linea de Kotlin.

| Pieza | Fichero | Que hace |
|---|---|---|
| El borde | `crate/src/jni/mod.rs` (todo bajo `#![cfg(target_os = "android")]`) | Los tres `Java_online_enki_instagram_PuenteNativo_{iniciar,detener,estado}`, el estado global y el hilo del canal. |
| La caja | `crate/Cargo.toml` → `[target.'cfg(target_os = "android")'.dependencies]` | `jni = { version = "0.21", default-features = false }`, **solo para Android**. |
| El modulo | `crate/src/lib.rs` | `#[cfg(target_os = "android")] pub mod jni;` — en escritorio ni se parsea. |
| El test | `crate/tests/jni_paridad.rs` | Lee `PuenteNativo.kt` y este borde: falla si un nombre o una firma divergen, y si `conectado` se puede decir sin CONNACK. |

### Las cuatro reglas del borde

1. **Nada bloquea.** `iniciar` crea un hilo, deja el estado en `conectando` y
   contesta; **no espera el CONNACK**. Quien llama es el servicio en primer plano
   de Android y el hilo principal no puede quedarse 5 s en una lectura TLS (ANR).
   El progreso se lee con `estado`, que es lo que la notificacion refresca cada
   3 s. Consecuencia asumida: `iniciar` devuelve `true` cuando hay canal *en
   marcha*, no cuando esta conectado; el "conectado" de verdad lo dice `estado`.
2. **`conectado` solo despues del CONNACK.** La unica construccion de
   `Estado::Conectado` esta en `confirmar_conexion`, y la unica llamada a
   `confirmar_conexion` cuelga del `?` de `Canal::suscribir`: sin SUBACK no corre,
   y sin CONNACK no hay SUBACK (`Canal::conectar` lo exige). El test lo comprueba
   sobre el **fuente**, porque esto no se puede probar sin movil.
3. **Un panic no mata la app.** `panic = "unwind"` (ya estaba, puesto para esto) y
   cada borde envuelve su cuerpo en `catch_unwind`: `iniciar` devuelve
   `JNI_FALSE`, `detener` no hace nada y `estado` contesta
   `{"canal":"error:panic"}`. Un puente que se cae al arrancar no se puede ni
   diagnosticar desde el movil.
4. **La llave no se guarda ni se loguea.** Se lee del `JString`, se compone en la
   URL y vive en la memoria del hilo. No hay `static` con la llave, y no se
   imprime la URL (una URL con `k=` en el logcat es la llave en el logcat).

### Por que se añade `jni` (y por que solo en Android)

Exportar `Java_...` es hablar `JNIEnv`, `JString` y `jboolean` con las firmas
exactas de la JVM: eso es `jni-sys` (punteros y constantes de la especificacion)
mas el envoltorio seguro que comprueba que un `JObject` es de verdad un
`java.lang.String` antes de leerlo. Escribirlo a mano es codigo de seguridad en
el borde mas delicado del aparato, y el `0 dependencias` del crate ya se rompio
con criterio en el bloque 16.

Tres decisiones que no son de estilo:

  - **`[target.'cfg(target_os = "android")'.dependencies]`**, no `[dependencies]`:
    asi `cargo test --offline` en un servidor sin NDK no compila ni una linea de
    `jni`. El modulo esta bajo el mismo `cfg`; los dos lados dicen lo mismo.
  - **`default-features = false`**: la unica feature (`invocation`) arrastra
    `java-locator` y `libloading` para *arrancar* una JVM desde Rust. Aqui se hace
    lo contrario — el `.so` vive dentro de una y recibe el `JNIEnv` hecho.
  - **`JObject` y no `JClass`** como segundo argumento: `PuenteNativo` es un
    `object` de Kotlin, y sus metodos son de INSTANCIA (la clase lleva su
    `INSTANCE`), asi que la JVM pasa la instancia. En la ABI los dos son un
    `jobject`, pero el tipo documenta el contrato.

### El estado que viaja a Kotlin

`estado()` devuelve **JSON**, porque es lo que ya leen los dos consumidores de
Kotlin (`PuenteNativo.leerMotivo` y `ServicioEnki.leerCampo`), y un texto pelado
perderia el motivo del fallo justo cuando hace falta:

```json
{"canal":"conectando","motivo":null,"version":"0.1.0"}
{"canal":"error:connack_rechazado","motivo":"el broker rechazo el CONNECT con el codigo 4 (usuario o clave incorrectos): revisar llave y url","version":"0.1.0"}
```

La clave `canal` lleva **exactamente** uno de los cuatro valores del contrato:
`desconectado`, `conectando`, `conectado`, `error:<codigo>`. `error:<codigo>` usa
el `codigo()` de `FalloDeCanal` (`connack_rechazado`, `tls`, `red`,
`sin_respuesta`, `url_no_segura`, `panic`, ...): el codigo se compara, el
`motivo` se lee.

### Lo que el borde NO hace

  - **No ejecuta nada real (hasta el bloque 19a).** Aqui la mano que se enchufa al
    bucle era `ManoAusente`, la misma del CLI: toda orden se contesta con su par
    de fallo (`sin_mano` / `simulacion`). Desde el 19a la mano es
    `mano::android::ManoAndroid`, que mira y toca por una cola — pero sigue sin
    ejecutar una orden entera: una orden sin receta se contesta `sin_receta`.
  - **No reimplementa el canal.** Llama a `canal::mqtt` (conectar, suscribir,
    publicar) y a `canal::bucle::servir` (validar la orden contra el catalogo
    cerrado y contestar). Un segundo cliente MQTT en el mismo aparato seria dos
    dialogos con el mismo broker y la misma llave.
  - **No reconecta ni abre un segundo canal.** Si ya hay uno vivo, `iniciar`
    contesta `JNI_FALSE` con motivo `ya_hay_canal`: se para y despues se abre, que
    es lo que ya hace `ServicioEnki`.
  - **La suscripcion no se repite aqui.** `bucle::servir` se suscribe el mismo a
    `TOPIC_ORDENES`; el borde solo envuelve el `Bus` para que la bandera de parada
    corte el bucle (`Opcion::Cerrado`) sin reescribirlo.

### Verificacion del bloque

```bash
cd modules/instagram-bridge/crate
cargo test --offline            # 60 tests + 2 de paridad JNI <-> Kotlin = 62 (sin el bloque 19a)
cargo check --offline           # el modulo jni ni se compila aqui (cfg android)
cargo test --offline --test jni_paridad -- --nocapture
```

El test de paridad **tiene dientes**, y se comprueba asi: se renombra un
`external fun` en `PuenteNativo.kt` (por ejemplo `iniciar` -> `abrir`), se corre
`cargo test --test jni_paridad` y **falla** con el simbolo que falta; se restaura
y vuelve a pasar. Igual si se añade un `Estado::Conectado` fuera de
`confirmar_conexion`.

Lo que **no** se puede verificar en este servidor: que el `.so` enlace con la JVM
del movil, que `System.loadLibrary` lo encuentre con la ABI correcta y que el
canal conecte de verdad. Eso es del portatil con NDK y del movil. Lo que si se
comprobo aqui, ademas de los tests: el modulo `jni` **compila** (se copio el crate
a un directorio de trabajo, se quitaron los dos `cfg` y se añadio la caja como
dependencia normal: `cargo check --offline` limpio, sin warnings). Es la unica
forma de type-checkear un `extern "system"` contra `jni 0.21` sin NDK.

## Bloque 19a · La mano Android: la cola de peticiones

El movil lo dijo el solo en su primera respuesta: *"este binario no tiene arbol de
accesibilidad ni gestos: la mano vive en la capa Android"*. Este bloque cablea la
mano de verdad. Lo que **no** hace: ejecutar una orden entera (eso es una receta,
y es el bloque siguiente).

| Pieza | Fichero | Que hace |
|---|---|---|
| La cola | `crate/src/mano/cola.rs` (Rust puro) | `Mutex<VecDeque<Peticion>>` + respuestas + `Condvar`. Encola, entrega UNA vez, espera con plazo. |
| La mano | `crate/src/mano/android.rs` (`cfg(android)`) | `ManoAndroid`: implementa `FuenteDeArbol` (mirar) y `Superficie` (tocar/escribir/desplazar/esperar) encolando en la misma cola. |
| El contrato del arbol | `crate/src/mano/arbol_json.rs` (Rust puro) | JSON del movil -> `Arbol`, incluido el montaje de la lista plana en arbol. **Fuera** de `cfg(android)` para poder probarlo en escritorio. |
| El borde | `crate/src/jni/mod.rs` | Tres simbolos nuevos: `siguientePeticion`, `entregarRespuesta`, `arbolVisible`. Ninguno bloquea. |
| El sondeo | `android/.../BucleDeMano.kt` | Coroutine en `Dispatchers.IO`, cada 150 ms: pregunta, ejecuta con `Accesibilidad`/`Gestos` y contesta SIEMPRE. |
| El arranque | `android/.../ServicioEnki.kt` | `BucleDeMano.arrancar()` al abrir el canal, `parar()` al cerrarlo. |
| Los tests | `crate/tests/cola_mano.rs`, `crate/tests/jni_paridad.rs` | 7 de cola (puros) + la paridad ampliada a los seis simbolos. |

### Por que una cola y no un callback JNI

La tentacion es que Rust llame a Kotlin: buscar la clase, `GlobalRef`,
`AttachCurrentThread` en el hilo del bucle, llamar, `DetachCurrentThread`. En una
demo funciona. En el aparato:

  - **El hilo.** El bucle del canal es un hilo de Rust que la JVM no conoce. Un
    attach que se olvida deja un hilo colgado de la JVM; un detach con trabajo
    pendiente mata el proceso.
  - **Las referencias.** Un `GlobalRef` al servicio sobrevive al servicio. El dia
    que Android lo recicla, la siguiente llamada revienta dentro de un
    `extern "system"`, donde no hay `catch` de Kotlin que la pare.
  - **El cruce.** Si Kotlin espera algo de Rust mientras Rust espera el callback,
    no hay salida: es un interbloqueo, no un fallo.

Con la cola, el peor caso es un plazo agotado **con nombre**
(`mano_sin_respuesta`), y la cola entera se prueba en el servidor con hilos de
verdad (`cargo test --offline --test cola_mano`).

### El protocolo (lo que cruza)

```json
{"id":7,"tipo":"observar"}
{"id":8,"tipo":"ejecutar","paso":{"accion":"tocar","id":"com.instagram.android:id/x","x":980,"y":60}}
{"id":9,"tipo":"ejecutar","paso":{"accion":"escribir","id":"...","x":1,"y":2,"texto":"hola"}}
{"id":10,"tipo":"ejecutar","paso":{"accion":"desplazar","direccion":"abajo","distancia":600}}
{"id":11,"tipo":"ejecutar","paso":{"accion":"esperar","ms":800}}
```

Las respuestas de `observar` son el JSON de `Accesibilidad.json()` tal cual
(`{"lectura":"observada",...}` o `{"lectura":"desconocida","motivo":...}`) y las de
`ejecutar` son `{"ok":true,"via":"nodo"}` / `{"ok":false,"motivo":"nodo_no_localizado"}`.
`mano::arbol_json` acepta tambien `{"ok":false,...}`, para que un fallo del bucle
Kotlin y un no-pude del servicio se lean por el mismo camino.

### Las tres reglas de la cola

1. **Una peticion se entrega UNA vez.** `siguiente()` la saca y la apunta en
   vuelo. Si se pudiera leer dos veces, un toque se ejecutaria dos veces.
2. **Una respuesta de un id que nadie espera no rompe nada.** Se cuenta como
   huerfana y se descarta: es la respuesta de una peticion que ya caduco, y tirar
   el proceso por eso seria cambiar un dato viejo por una app caida.
3. **Nada crece sin tope.** Lo que se fue en vuelo y nunca se contesto, y las
   respuestas que nadie recogio, se podan (16 y 64; un aparato vive dias).

### El plazo

Toda peticion espera `PLAZO_DE_RESPUESTA` (10 s) y lo agotado es
`FalloDeMano::SinRespuesta` -> `mano_sin_respuesta` con su id y su plazo. La
excepcion es `esperar(ms)`: el plazo es `10 s + ms`, porque el paso pide dormir y
dormir mas que el plazo no es un fallo de nadie. **Nunca un panic y nunca un
bloqueo eterno**: el hilo del canal puede quedarse 10 s sin leer ordenes, pero
vuelve.

### Por que `ManoAndroid` no ejecuta una `Orden`

Una orden es "publica este texto en Instagram": eso necesita una RECETA (que ancla
se toca, en que orden, que se comprueba despues) y el encadenado con
`mano::publicar`. Escribir aqui dos toques fijos seria una receta escondida en el
borde, y una mano que improvisa el camino publica en la cuenta equivocada. Asi que
`ManoDeOrdenes::ejecutar` contesta `sin_receta` y **no toca nada**.

### Verificacion del bloque (real, en este servidor)

```bash
cd modules/instagram-bridge/crate
cargo test --offline
# 77 pasan, 0 fallan (antes del bloque: 62)
#   lib            21  (14 + 7 de arbol_json)
#   cola_mano       7  (nuevos)
#   jni_paridad     3  (2 + el sondeo atiende los tipos de la cola)
#   resto          46

for f in ../tests/*.test.js; do node "$f" >/dev/null || echo "FALLO $f"; done
# 52 suites JS OK
```

El test de paridad **tiene dientes** comprobado aqui, no de palabra:

  - se añade un `external fun simboloQueNoExiste(): String?` en `PuenteNativo.kt`
    -> `los_simbolos_jni_coinciden_con_los_de_kotlin` **falla** con
    `se leyeron 7: [..., "simboloQueNoExiste"]`;
  - se cambia `entregarRespuesta(id: Long, ...)` por `id: String` -> **falla** con
    `recibe ["id: String", "json: String"] ... y su simbolo Rust declara ["jlong", "JString"]`;
  - se restaura y vuelve a pasar.

Y el modulo `jni` **compila** contra `jni 0.21` sin NDK: se copio el crate a un
directorio de trabajo, se quitaron los `cfg` y se añadio la caja como dependencia
normal -> `cargo check --offline` limpio, sin warnings. Igual con
`mano::android` (que es Rust puro: no toca ni una API de Android).

Lo que **no** se puede verificar en este servidor: que Kotlin compile (no hay
`kotlinc` ni Android SDK), que el `.so` enlace y que el sondeo mueva el arbol en
el movil. Eso es del portatil con NDK y del movil.

## Bloque 19b · El volcado de pantalla por el bus

Escribir la receta de `publicar` exige conocer los anclas REALES del movil, y esos
anclas no se pueden inventar desde el servidor: hay que verlos. Este bloque añade
un boton que lee el arbol de accesibilidad de verdad, lo serializa plano y lo
publica por el bus.

| Pieza | Fichero | Que hace |
|---|---|---|
| El puente | `crate/src/canal/observacion.rs` (Rust puro) | Sobre del bus + buzon de recados + comprobacion de forma. **No parsea el volcado.** Fuera de `cfg(android)` para probarlo en escritorio. |
| El borde | `crate/src/jni/mod.rs` | Septimo simbolo: `publicarObservacion`. Encola; el hilo del canal vacia el buzon antes de cada espera. |
| El volcado | `android/.../Volcado.kt` | Recorre el arbol en preorden y lo serializa a JSON plano con `view_id`, `texto`, `desc`, `hint`, caja, banderas. |
| La pantalla | `android/.../MainActivity.kt` + `actividad_principal.xml` | Botones PROBAR VOLCADO (era OBSERVAR PANTALLA; desde 19c es diagnostico, ver ese bloque) y COPIAR VOLCADO, con el numero de nodos en pantalla. |
| El servicio | `android/.../Accesibilidad.kt` | Presta `instancia()`, `actividadVisible()` (la que anuncia `TYPE_WINDOW_STATE_CHANGED`) y `reciclarNodo()` (regla de `recycle()` por version). |
| Los tests | `crate/tests/observacion_puente.rs`, `crate/tests/jni_paridad.rs` | 2 puros nuevos + la paridad ampliada a los siete simbolos. |

### Donde publica (el topic exacto)

```text
core/core-a/events/bridge/observacion
```

Con el sobre completo del bus y **`source.core_id = "external"`**:

```json
{"event_id":"obs-<momento>-<n>","event_type":"bridge.observacion",
 "timestamp":<ms>,"source":{"core_id":"external","module":"instagram-bridge","version":"0.1.0"},
 "data":{ ...el volcado, TAL CUAL... }}
```

`external` no es cosmetico: si el aparato se presentara como `core-a`, el bus
descartaria el evento por self-loop (un core no se escucha a si mismo) y el
volcado no llegaria nunca. El aparato no es un core del bus: es un dispositivo.

### El contrato del volcado (lo que se serializa)

```json
{"paquete":"com.instagram.android","actividad":"com.instagram.android.activity.MainTabActivity",
 "momento":1712345678901,"truncado":false,
 "nodos":[{"id":0,"padre":null,"profundidad":1,"clase":"FrameLayout","view_id":null,
           "texto":null,"desc":null,"hint":null,"tocable":false,"editable":false,
           "visible":true,"habilitado":true,"x1":0,"y1":0,"x2":1080,"y2":2400,
           "seleccionado":false,"marcado":false}]}
```

`id` es el **indice** del nodo en la lista y `padre` el indice del padre: es lo que
permite reconstruir el arbol cuando diez `image_button` comparten el mismo
`view_id`. Topes: 4000 nodos y profundidad 64 (los mismos que reconstruye
`mano::arbol_json`); si se corta, `"truncado": true`.

### Por que el puente no parsea el JSON

1. **Un volcado es prueba, no contrato.** Si el borde "arreglara" el JSON
   (recortando campos que no conoce, normalizando numeros), lo que llega al
   servidor no seria lo que el aparato vio, y la receta se escribiria sobre una
   pantalla que no existe. Ese fallo no da error en ningun sitio: da una receta
   que falla el dia que se usa.
2. **Parsear cuesta y puede fallar.** 4000 nodos con 18 campos son cientos de KB;
   un parser que se atraganta con un texto raro perderia el volcado entero por un
   detalle. Se comprueba la FORMA (no vacio, empieza en `{` y acaba en `}`) y nada
   mas.

### Por que un buzon y no un PUBLISH directo desde Kotlin

`Canal::publicar` pide `&mut Canal` y el canal vive en UN hilo
(`jni::servir_canal`). La llamada de Kotlin corre en el hilo de la UI, que no
puede tocar ese canal sin bloquearse, y **no se abre un segundo cliente**: dos
conexiones con la misma llave y el mismo client id hacen que el broker cierre la
primera. Asi que el borde empuja un recado (`VecDeque` con tope de 8) y el hilo
del canal lo vacia antes de cada espera. Precio: hasta 2 s de retardo
(`PLAZO_LECTURA`). Lo que se compra: el hilo de la UI nunca espera a la red.

### Que significa `true` (y que no)

`publicarObservacion` contesta `JNI_TRUE` cuando el volcado quedo **encolado**, no
cuando el broker lo tenga: en QoS 0 nadie puede afirmar eso. El `JNI_FALSE` si
lleva motivo, y se lee en `estado()` bajo la clave `volcado` (`sin_canal` con el
estado del canal dentro, `json_vacio`, `json_no_objeto`, `buzon_lleno`). Un
booleano no cabe un motivo, y "no se pudo" sin motivo no se arregla desde el
movil.

### El boton COPIAR VOLCADO

Si el bus no esta, el JSON se queda en memoria y COPIAR VOLCADO lo lleva al
portapapeles: se pega en Telegram y se ve igual. No vuelve a mirar la pantalla
(copia lo que se vio, no lo que hay ahora) y no necesita canal ni servicio.

### Verificacion del bloque (real, en este servidor)

```bash
cd modules/instagram-bridge/crate
cargo test --offline
# 79 pasan, 0 fallan (antes del bloque: 77)
#   observacion_puente  2  (nuevos: el puente no cambia el JSON · sin canal da motivo)
#   jni_paridad         3  (ampliado a los siete simbolos + topic unico + sin parseo)
#   resto              74

for f in ../tests/*.test.js; do node "$f" >/dev/null || echo "FALLO $f"; done
# 52 suites JS OK
```

El modulo `jni` (que en escritorio ni se parsea) **compila** contra `jni 0.21` sin
NDK: se copio el crate a un directorio de trabajo, se quitaron los `cfg` y se
añadio la caja como dependencia normal -> `cargo check --offline --all-targets`
limpio, sin warnings.

El test de paridad **tiene dientes** comprobado aqui, no de palabra:

  - renombrar `publicarObservacion` a `publicarVolcado` solo en Kotlin -> **falla**
    con `Kotlin declara publicarVolcado y el crate NO exporta ...`;
  - cambiar su vuelta a `: String` -> **falla** con `publicarObservacion: String?
    en Kotlin exige -> JString en Rust`;
  - se restaura y vuelve a pasar.

Lo que **no** se puede verificar en este servidor: que Kotlin compile (no hay
`kotlinc` ni Android SDK), que el `.so` enlace, y que el arbol real del movil
produzca el volcado (eso lo dice el primer boton pulsado en el aparato).

## Bloque 19c · Mirar bajo demanda desde el bus

El boton del 19b **no sirve para volcar Instagram**. Android solo deja leer el
arbol de accesibilidad de la **ventana en primer plano**, y al pulsar el boton
nuestra propia actividad pasa a primer plano: el volcado que salia era el de
nuestra pantalla. Para mirar Instagram habia que tener el movil en la mano, que
es justo lo que el puente existe para evitar.

Este bloque añade la accion `observar` al bucle: el movil vuelca la ventana
activa cuando se lo piden por el bus, sin que nadie toque nada.

| Pieza | Fichero | Que hace |
|---|---|---|
| La accion | `crate/src/canal/bucle.rs` | Catalogo cerrado con `observar`; el puerto gana `ManoDeOrdenes::observar()` (defecto: `sin_mano`); el resultado lleva `volcado` **como JSON crudo**. |
| La mano | `crate/src/mano/android.rs` | `observar_volcado()`: pide la mirada a la cola y **valida** que el JSON se pueda leer antes de devolverlo. `observar()` sigue devolviendo `Arbol` (proyectado) sobre la misma peticion. |
| El contrato | `crate/src/mano/arbol_json.rs` | Lee las DOS formas (la vista de `Accesibilidad.json` y el volcado de `Volcado.leer`) y las lleva al mismo `Arbol`. `CAMPOS_DEL_NODO` fija los 18 campos. |
| El borde Kotlin | `android/.../BucleDeMano.kt` | El tipo `observar` usa `Volcado.leer()` (arbol completo) en vez de `Accesibilidad.mirar()` (vista filtrada). |
| La pantalla | `android/.../MainActivity.kt` + `strings.xml` + layout | El boton se renombra a PROBAR VOLCADO (esta app) y una nota al pie dice que para volcar Instagram se usa la orden del bus. |
| Los tests | `crate/tests/observar.rs` | 5 nuevos: se ejecuta en simulacion · sin mano da motivo nombrado · el volcado viaja como JSON · los 18 campos · un `view_id` repetido no duplica el arbol. |

### La orden exacta (lo que hay que publicar)

```text
topic:   core/core-a/events/bridge/orden/observar
payload: {"id":"obs-1","accion":"observar"}
```

Cualquier subtopic bajo `core/core-a/events/bridge/orden/` vale (el aparato se
suscribe a `orden/#`); el nombre de detras es libre y sirve para leer el log.
`red` y `texto` son opcionales en `observar`: la orden pide una foto, no una
publicacion. El resultado sale por `core/core-a/events/bridge/resultado`:

```json
{"id":"obs-1","accion":"observar","red":"instagram","ok":true,"simulacion":true,
 "motivo":null,"detalle":"volcado de la ventana activa: 81234 bytes","gestos":0,
 "volcado":{"paquete":"com.instagram.android","actividad":"...","momento":1712345678901,
            "truncado":false,"nodos":[ ... ]}}
```

`volcado` va **como objeto**, no como cadena escapada: quien lo lee quiere el
arbol. Se empalma crudo al final del objeto del resultado porque meterlo en un
`Valor::Texto` lo escaparia.

### Por que `observar` NO se veta en simulacion

El veto de `simulacion` existe para lo **irreversible**: un post publicado no se
despublica, asi que ejecutar de verdad sin que nadie lo haya pedido es el error
caro. Mirar no cambia nada en el aparato, no gasta cuota y no tiene postcondicion
que afirmar. Vetar una lectura por `simulacion:true` obligaria a pedir "ejecucion
real" para LEER, que es absurdo. Es la unica accion con `ok:true` sin
postcondicion, y es honesto: lo que se pidio (la foto) esta en el resultado.

### Los dos motivos con nombre

| Motivo | Cuando |
|---|---|
| `sin_mano` | Este binario no tiene arbol (servidor), o el borde JNI no esta cargado. |
| `mano_sin_respuesta` | La capa Kotlin no contesta en 10 s (`PLAZO_DE_RESPUESTA` de `mano::cola`). |
| `servicio_no_activo` / `sin_ventana` / `ocupado` | El aparato no pudo mirar y lo dice con su motivo, sin traducir. |

### El contrato del arbol, en un solo sitio

`Volcado.kt` serializa 18 campos por nodo (`id`, `padre`, `profundidad`,
`clase`, `view_id`, `texto`, `desc`, `hint`, `tocable`, `editable`, `visible`,
`habilitado`, `x1`, `y1`, `x2`, `y2`, `seleccionado`, `marcado`) y aqui `id` es
el **indice** mientras la identidad es `view_id`. `mano::arbol_json` es el unico
sitio que traduce ese JSON: resuelve `padre` por indice, compone la caja desde
las cuatro esquinas, deriva `tipo` de `clase`/`editable`, toma `tocable` como
`isClickable && isEnabled` y **desambigua `view_id` repetidos** (`#indice`), que
es lo que impide que diez `image_button` iguales reciban todos los mismos hijos.
`CAMPOS_DEL_NODO` fija la lista, y `crate/tests/observar.rs` la recorre: si
Kotlin añade o quita un campo, falla el test en el servidor, no el volcado en el
movil.

### Verificacion del bloque (real, en este servidor)

```bash
cd modules/instagram-bridge/crate
cargo test --offline
# 84 pasan, 0 fallan (antes del bloque: 79)
#   observar            5  (nuevos: simulacion · sin mano · volcado json · 18 campos · view_id repetido)
#   resto              79

for f in ../tests/*.test.js; do node "$f" >/dev/null || echo "FALLO $f"; done
# 52 suites JS OK
```

Lo que **no** se puede verificar en este servidor: que Kotlin compile (no hay
`kotlinc` ni Android SDK) y que el volcado real de Instagram llegue por el bus.
El APK lo compila el workflow; la prueba de verdad es publicar la orden de
arriba con el movil en segundo plano y leer el `volcado` del resultado.

## Bloque 19d · El interprete de pasos

Para grabar la receta de `publicar` hace falta descubrir el flujo REAL de
Instagram: que se toca, en que orden, que aparece despues. Eso no se escribe desde
el servidor adivinando `view_id`s ni se graba "cuando funcione": se pilota el movil
PASO A PASO y se comprueba cada paso con una mirada.

Este bloque añade la accion `paso`: UN paso suelto por orden, con su comprobacion
pegada. **No** añade la receta; solo el vocabulario con el que se descubre.

| Pieza | Fichero | Que hace |
|---|---|---|
| La accion | `crate/src/canal/bucle.rs` | `ACCION_PASO` en el catalogo cerrado; `Orden` gana `paso` y `observar_despues`; `atender_paso` es el unico camino que mueve el aparato. |
| El vocabulario | `crate/src/canal/paso.rs` (Rust puro) | Los cuatro tipos, el `AnclaDePaso` (tres pistas, una sola), el parseo estricto y `resolver()`: el ancla sobre la foto, con `ancla_no_encontrada` / `ancla_ambigua` / `ancla_no_tocable` / `ancla_sin_sitio`. |
| La mano | `crate/src/mano/android.rs` | `ManoDeOrdenes::ejecutar_gesto()`: entrega el gesto ya resuelto y devuelve en el `detalle` **que nodo se toco**. `escribir_en_foco()` y `atras()` son los dos caminos nuevos. |
| El aparato | `android/.../Gestos.kt` | `tocar` comprueba `isClickable` (`no_tocable`, sin tocar el padre) y recalcula el centro de los bounds vivos; `escribirEnFoco` usa `findFocus(FOCUS_INPUT)` (`campo_no_enfocado`); `atras` ya existia. |
| El sondeo | `android/.../BucleDeMano.kt` | El tipo `ejecutar` entiende `atras` y el `escribir` sin `id` (campo enfocado). |
| Los tests | `crate/tests/paso.rs` | 6 nuevos, con una mano falsa que apunta lo que le piden. |

### La orden exacta (primer paso: tocar "Crear")

```text
topic:   core/core-a/events/bridge/orden/paso
payload: {"id":"p1","accion":"paso",
          "paso":{"tipo":"tocar","ancla":{"view_id":"action_bar_left_button"}},
          "observar_despues":true,"simulacion":false}
```

`simulacion:false` es OBLIGATORIA: ausente (o `true`) se lee como simulacion y no se
toca nada. El resultado sale por `core/core-a/events/bridge/resultado`:

```json
{"id":"p1","accion":"paso","red":"instagram","ok":true,"simulacion":false,
 "motivo":null,
 "detalle":"tocar view_id 'action_bar_left_button' · tocado 'com.instagram.android:id/action_bar_left_button' en (72,144); despues: volcado de 81234 bytes",
 "gestos":1,
 "volcado":{ ...la pantalla de DESPUES del toque, cruda... }}
```

### Los cuatro pasos

| Paso | Payload | Que exige |
|---|---|---|
| `tocar` | `{"tipo":"tocar","ancla":{"view_id":"..."}}` (o `texto`, o `desc`) | Un ancla y **una sola pista**. El punto es el centro de la caja del nodo. |
| `escribir` | `{"tipo":"escribir","texto":"hola"}` | Que haya un campo con el foco; si no, `campo_no_enfocado`. **No lleva ancla**: elegir el campo aqui seria elegir un nodo que nadie miro. |
| `esperar` | `{"tipo":"esperar","ms":800}` | `ms` entero > 0. No entrega ningun gesto. |
| `atras` | `{"tipo":"atras"}` | Nada. Es el boton del sistema (`GLOBAL_ACTION_BACK`). |

`desplazar` no esta en este bloque: llegara cuando alguien lo necesite de verdad, y
entonces se añade aqui **y** en `Gestos.kt` con su prueba.

### El ancla: tres pistas, y ninguna se sustituye

- `view_id` vale completo (`com.instagram.android:id/action_bar_left_button`) o su
  ultima pieza (`action_bar_left_button`), que es como lo escribe una persona. El
  sufijo de desambiguacion que pone `mano::arbol_json` (`id#3`, cuando Instagram
  repite el mismo `view_id`) se ignora al comparar: si no, diez `image_button`
  iguales no se verian como ambiguos y se tocaria el primero en silencio.
- `texto` y `desc` se comparan **normalizados** (minusculas, sin tildes, espacios
  colapsados), el mismo criterio que A1.
- **Solo nodos visibles**: un `visible:false` no se toca, aunque el `view_id` cuadre.
- Dos pistas en el mismo ancla es `paso_ancla_invalida`: dos anclas son dos anclas y
  nadie ha dicho cual manda.

### Los motivos con nombre

| Motivo | Cuando |
|---|---|
| `simulacion` | La orden no traia `simulacion:false`: no se toco nada (y no se miro). |
| `ancla_no_encontrada` | Ningun nodo VISIBLE con ese ancla. El detalle la nombra; si la mirada era parcial, lo dice en vez de afirmar la ausencia. |
| `ancla_ambigua` | El ancla esta en 2+ nodos visibles. El detalle dice **cuantos**. No se elige uno al azar. |
| `ancla_no_tocable` | El nodo esta pero no es `isClickable`/`isEnabled`. No se toca su padre. |
| `ancla_sin_sitio` | El nodo esta pero su caja no ocupa sitio: no hay punto que tocar. |
| `campo_no_enfocado` | `escribir` sin campo con el foco de entrada. |
| `sin_mano` | Este binario no tiene arbol ni gestos (servidor), o el borde JNI no esta. |
| `mano_sin_respuesta` | La capa Kotlin no contesta en 10 s. |
| `observar_despues_fallo` | El paso se entrego y la mirada de despues no llego: el `detalle` dice cual fallo y el `gestos` conserva que el aparato se movio. |
| `paso_*` | El payload del paso no vale: `paso_sin_ancla`, `paso_ancla_sobrante`, `paso_sin_texto`, `paso_espera_invalida`, `paso_ancla_invalida`, `paso_tipo_fuera_del_catalogo`, `paso_no_objeto`, `paso_sin_tipo`, `paso_campo_de_tipo_equivocado`. |

### Por que `paso` NO respeta el veto como `publicar`

`publicar` con `simulacion:false` contesta `ejecucion_real_no_habilitada`: no hay
receta cableada y encadenar a ciegas publicaria en la cuenta equivocada. `paso` es
lo contrario: **un** gesto, ya resuelto sobre una foto fresca, que no afirma nada
sobre la red. Por eso es la unica accion con dos caminos: en simulacion contesta
`simulacion` y no toca, y con `simulacion:false` toca. La garantia de que no se
encadena es estructural: `atender_paso` entrega UN gesto y vuelve (un test lo
comprueba contando `mano.gestos`).

### `ok:true` aqui significa una cosa muy concreta

"Se entrego el paso que se pidio y se miro despues". NO significa "se publico":
ninguno de los cuatro pasos sabe lo que es un post. El `detalle` dice **que nodo** se
toco y en que punto (el id y el centro de su caja), que es lo que hace falta para
escribir la receta despues.

### Verificacion del bloque (real, en este servidor)

```bash
cd modules/instagram-bridge/crate
cargo test --offline
# 90 pasan, 0 fallan (antes del bloque: 84)
#   paso   6  (nuevos: tocar traduce · ancla_no_encontrada · ancla_ambigua ·
#              simulacion no toca · observar_despues adjunta el volcado · rechazos)
#   resto 84

for f in ../tests/*.test.js; do node "$f" >/dev/null || echo "FALLO $f"; done
# 52 suites JS OK
```

Los tests **tienen dientes** comprobado aqui, no de palabra:

  - `resolver()` devolviendo el primer nodo en vez de `ancla_ambigua` ->
    `ancla_ambigua_no_elige` **falla**;
  - quitar el `if orden.simulacion` de `atender_paso` -> `paso_en_simulacion_no_toca`
    **falla** (la mano recibe un gesto que nadie pidio);
  - se restaura y vuelven a pasar.

El modulo `mano::android` (que en escritorio es `cfg(target_os = "android")`)
**compila** sin NDK: se copio el crate a un directorio de trabajo, se quitaron los
`cfg` de `mano::android` y se dejo fuera `jni` (que necesita la caja `jni`) ->
`cargo check --offline --all-targets` limpio, sin warnings.

Lo que **no** se puede verificar en este servidor: que Kotlin compile (no hay
`kotlinc` ni Android SDK) y que el arbol real del movil tenga el ancla que se le
manda. Eso lo dice el primer paso de verdad: se publica la orden de arriba con
Instagram en primer plano y se lee el `detalle` del resultado.

## Bloque 19e · Que el canal se levante solo

El canal se caia y **no volvia**. Dos causas, y las dos habia que arreglar:

  - **A · la llave vivia solo en memoria.** La URL y la llave se tecleaban, se
    pasaban al servicio como extras del `Intent` y morian con el proceso. MIUI mata
    el proceso al abrir Instagram, asi que cada prueba empezaba con el dueno
    escribiendo la llave a mano.
  - **B · nadie reintentaba.** Si se caia la red o el broker, el hilo del crate
    terminaba y el canal se quedaba muerto hasta que alguien pulsaba CONECTAR. El
    estado (`error:transporte`) era honesto y completamente inutil.

### 1 · La llave, cifrada en el llavero del aparato

`android/app/src/main/java/online/enki/instagram/Credenciales.kt`

```kotlin
Credenciales.de(contexto).guardar(url, llave)   // cifra y escribe
Credenciales.de(contexto).leer()                // Par(url, llave) o null
Credenciales.de(contexto).olvidar()             // borra el dato y la clave
```

**Se usa el Keystore directo y NO `androidx.security:security-crypto`.** El bloque
dejaba esa puerta abierta y se ha cruzado, por tres razones:

  1. **Cero dependencias nuevas.** `security-crypto` 1.1.0-alpha06 arrastra Tink y
     su proveedor, y este APK se compila en un servidor sin Android SDK: aqui no se
     puede comprobar que resuelva ni que su version alpha conviva con
     `compileSdk 35`. Un build rojo por una caja que solo envuelve lo que ya trae el
     sistema es un mal cambio, y el sintoma llegaria en el movil, no aqui.
  2. **Hacen falta dos secretos, no un almacen.** `EncryptedSharedPreferences` por
     debajo es lo mismo: AES con la clave en `AndroidKeyStore`. Aqui son cincuenta
     lineas legibles (AES-256-GCM, IV aleatorio por escritura, etiqueta de 128 bits,
     Base64 en `SharedPreferences` privadas) en vez de una caja que hay que auditar.
  3. **Se puede leer entero y discutirlo.** Si algun dia hay que cambiarlo, el
     cifrado esta a la vista.

Lo que se guarda es **un solo blob** (`version:iv:datos`) con la url y la llave
juntas: dos entradas separadas se pueden quedar a medias (url de un bus con la llave
de otro) y el sintoma es un `401` que nadie sabe explicar. La clave se crea con
`setUserAuthenticationRequired(false)`: el servicio en primer plano tiene que poder
leerla con la pantalla apagada; pedir huella seria pedirle al dueno que desbloquee
el movil para que el canal se levante solo, que es lo contrario de este bloque.

En la pantalla: al pulsar CONECTAR se guarda **antes** de arrancar el servicio; al
abrir la app los dos campos se rellenan de lo guardado (vacios si no hay nada, la
pantalla no inventa una llave); y **OLVIDAR LLAVE** borra la credencial y la clave.
El modo de fallo esta escrito: si la clave del llavero se invalida (restauracion de
una copia, borrado del llavero por el sistema) el dato queda ilegible para siempre,
`leer()` lo detecta, **lo borra** y devuelve `null` con motivo. Un dato que no se
puede descifrar no es una credencial: es basura que hace creer que hay llave.

En el servicio: si el `Intent` no trae url y llave (el sistema rearranca el servicio
con `intent == null`), se leen del llavero. Por eso `onStartCommand` devuelve
`START_STICKY` desde este bloque: antes volver sin llave solo levantaba una
notificacion vacia, ahora hay con que volver. `onStartCommand` con `ACCION_PARAR`
sigue devolviendo `START_NOT_STICKY`.

### 2 · La reconexion automatica

`crate/src/canal/reconexion.rs` (politica, Rust puro) + el bucle de
`crate/src/jni/mod.rs` (quien la ejecuta).

```text
intento   1    2    3    4    5     6     7     8+   (sin tope)
espera    1s   2s   4s   8s   16s   30s   60s   60s
```

Un reintento inmediato contra un broker caido es un bucle que gasta bateria y llena
el log; una espera de un minuto desde el primer intento deja el canal muerto un
minuto por un corte de tres segundos. La escalera empieza rapido y se frena, y no
tiene un "demasiados intentos": un canal que se rinde es un canal que hay que
levantar a mano.

**Caida contra parada deliberada.** No se adivina mirando el estado: viaja como un
valor (`Desenlace::ParadaDeliberada` contra `Desenlace::Caida`). La bandera `parada`
la pone `parar()` (el `detener` de Kotlin, que llega del boton DESCONECTAR o de
`onDestroy`) y solo entonces; con ella puesta el hilo sale con `desconectado` y no
vuelve. Adivinar la diferencia es como se acaba con un servicio que el dueno no
puede apagar.

**El contador se reinicia con un canal sano.** Si el canal aguanto mas de 60 s
(`DURACION_QUE_REINICIA_S`), la caida vuelve a contar como intento 1: un corte
despues de una hora de servicio no es el noveno intento de la misma averia. Si se
cae a los dos segundos de conectar, el contador sigue subiendo: eso es un canal que
no vale, y martillear el bus cada segundo es lo que hace que el broker cierre la
puerta.

**Al volver se vuelve a suscribir.** `bucle::servir` se suscribe EL MISMO a
`core/core-a/events/bridge/orden/#` en su primera linea, asi que cada vuelta del
bucle entra por ahi y deja un canal nuevo **con su suscripcion nueva**. Reconectar
el socket no basta: el CONNECT de este cliente va con `Clean Session`, el broker no
recuerda la suscripcion, y el resultado seria un canal mudo que parece conectado.
El test `cada_conexion_nueva_vuelve_a_suscribirse` lo fija.

**La espera se puede cortar.** Duerme en rebanadas de 250 ms mirando la bandera:
`detener` espera como mucho 3 s (`PLAZO_PARADA`) y un hilo dormido 60 s no llegaria
ni a la primera vuelta.

### El estado dice la verdad (cinco valores, no cuatro)

```text
desconectado   no hay hilo (o lo paro el dueno)
conectando     hay hilo, primer intento, todavia sin CONNACK
conectado      CONNACK aceptado y suscripcion concedida
reconectando   se cayo y esta volviendo: intento N, proximo en X s
error:<codigo> el canal no esta y no va a volver solo
```

`reconectando` es el valor nuevo. Lleva dos campos numericos que solo existen en ese
estado (`intento`, `proximo_en_s`) y el `motivo` del fallo que lo provoco. La notificacion
del servicio los cuenta (`Canal: reconectando · intento 3 · proximo en 4 s`): decir
"reconectando" a secas se lee como un canal caido que no vuelve, que es lo contrario.

### Lo que este bloque NO hace

  - **No arranca en el boot del aparato.** `RECEIVE_BOOT_COMPLETED` sigue sin
    receptor: Android 12+ restringe el arranque de servicios en primer plano desde
    BOOT_COMPLETED, y un arranque a medias es peor que uno que el dueno pide. Lo que
    si se cubre es la muerte del proceso (`START_STICKY`), que es el caso de MIUI.
  - **No guarda nada en claro.** Ni en preferencias, ni en el log, ni en la
    notificacion. Si el cifrado falla, `guardar()` contesta `false` con motivo y NO
    cae a un `putString` "provisional".
  - **No abre dos canales.** El anterior se cierra antes de esperar, asi que el
    broker nunca ve dos sesiones con el mismo client id.
  - **No reintenta una orden.** Un PUBLISH de resultado en QoS 0 no tiene acuse y un
    reintento ciego duplicaria resultados. Lo que se reintenta es la CONEXION.

### Verificacion del bloque (real, en este servidor)

```bash
cd modules/instagram-bridge/crate
cargo test --offline
# 97 pasan, 0 fallan, 1 ignorado (antes del bloque: 90)
#   reconexion   5  (espera_creciente_tope_60s · parada_deliberada_no_reintenta ·
#                    caida_si_reintenta · el_estado_dice_reconectando_con_intento ·
#                    cada_conexion_nueva_vuelve_a_suscribirse)
#   reconexion   2  (en linea, en el modulo: la escalera y la parada)
#   resto       90

for f in ../tests/*.test.js; do node "$f" >/dev/null || echo "FALLO $f"; done
# 52 suites JS OK
```

Los tests **tienen dientes** comprobado aqui, no de palabra:

  - `Decision::Parar` por `Reintentar` en la rama de la parada ->
    `parada_deliberada_no_reintenta` **falla** (el movil no se podria apagar);
  - la escalera dejada plana en 1 s -> `espera_creciente_tope_60s` y
    `caida_si_reintenta` **fallan** (dos reintentos por segundo contra un broker
    caido);
  - `intento_anterior.saturating_add(1)` cambiado por `1` -> `caida_si_reintenta`
    **falla** (el contador no sube y la espera nunca crece);
  - se restaura y vuelven a pasar (97, 0 fallos).

El modulo `jni` (que es `cfg(target_os = "android")`) **compila** sin NDK: se copio
el crate a un directorio de trabajo, se le añadio la caja `jni` como dependencia de
escritorio, se quitaron los `cfg` de `jni` y `mano::android` -> `cargo check
--offline --all-targets` limpio, sin warnings. Eso comprueba los tipos del borde
(`Estado::Reconectando`, `esperar_con_parada`, el bucle), que es donde un error se
paga en el movil.

Lo que **no** se puede verificar en este servidor: que Kotlin compile (no hay
`kotlinc` ni Android SDK) y que el Keystore del movil concrete. Eso lo dice el
workflow, que compila el APK en cada push, y el primer arranque en el aparato.

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
node modules/instagram-bridge/tests/piezas.test.js
node modules/instagram-bridge/tests/retirada.test.js
node modules/instagram-bridge/tests/recorte.test.js
node modules/instagram-bridge/tests/destinatario.test.js
node modules/instagram-bridge/tests/alcance.test.js
node modules/instagram-bridge/tests/retratos.test.js
node modules/instagram-bridge/tests/cambio.test.js
node modules/instagram-bridge/tests/bandeja.test.js
node modules/instagram-bridge/tests/llegada.test.js
node modules/instagram-bridge/tests/borrador.test.js
node modules/instagram-bridge/tests/silencio.test.js
node modules/instagram-bridge/tests/rotura.test.js
node modules/instagram-bridge/tests/reparar.test.js
node modules/instagram-bridge/tests/cambios.test.js
node modules/instagram-bridge/tests/desglose.test.js
node modules/instagram-bridge/tests/clasificador.test.js
node modules/instagram-bridge/tests/completador.test.js
node modules/instagram-bridge/tests/narrador.test.js
node modules/instagram-bridge/tests/traductor.test.js
node modules/instagram-bridge/tests/avisos.test.js
node modules/instagram-bridge/tests/alta.test.js
node modules/instagram-bridge/tests/baja.test.js
```

Ademas, desde el bloque 16, las dos suites del canal en el aparato:

```bash
cd modules/instagram-bridge/crate && cargo test --offline   # U1, A4.2, A1, A3, A5, O1/O2, D1, D3, D4, D5, F1b y el canal, en escritorio
```

  - `crate/tests/mqtt_framer.rs` — **puros, sin red**: las tres formas de partir y
    juntar bytes (CONNACK en frames de un byte, dos paquetes en un frame, un
    paquete incompleto que no se escupe) y la codificacion de CONNECT y PUBLISH.
    Son los que protegen la trampa 3.
  - `crate/tests/canal_integracion.rs` — `#[ignore]`: contra el bus real, **solo
    se suscribe** y comprueba CONNACK + SUBACK + PINGRESP. No publica nada.
  - `crate/tests/reconexion.rs` (bloque 19e) — **puros, sin red**: la escalera de
    esperas con su tope de 60 s, que una parada deliberada no reintenta, que una
    caida si (y sin credenciales no), que el estado dice `reconectando` con su
    intento, y que cada conexion nueva vuelve a suscribirse a `orden/#`.

Los tests del padron, del catalogo, de la memoria de cambios, de la cola, de la
tolerancia, de la autonomia y de la ficha no tocan los ficheros del repo: cada prueba de disco se hace en un directorio temporal propio
y lo borra al terminar (`crear({directorio})`). Los del repo se leen una vez para
comprobar que son validos y estan vacios: un almacen de ejemplo con datos dentro
seria un estado inventado que nadie sabe de donde sale.

No estan encadenados en `package.json` a proposito: ese fichero es compartido
con los demas bloques y cada bloque anade su entrada al ensamblar.
