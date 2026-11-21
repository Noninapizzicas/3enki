//! instagram-bridge · BLOQUE 18 · EL BORDE JNI (paridad Rust <-> Kotlin)
//!
//! Estos dos tests son PUROS y corren en escritorio: no compilan el modulo `jni`
//! (esta bajo `cfg(target_os = "android")` y aqui no hay NDK), pero **leen su
//! fuente y el `PuenteNativo.kt`** y comprueban lo unico que se puede comprobar
//! sin un movil:
//!
//!   1. **Los simbolos no divergen.** La JVM busca
//!      `Java_<paquete_con_guiones_bajos>_<Clase>_<metodo>`; si alguien renombra
//!      un `external fun` en Kotlin y no toca Rust (o al reves), el simbolo deja
//!      de existir y el movil se queda en `sin_borde_jni` **sin un error de
//!      compilacion en ningun lado**. Ese es el fallo que este test convierte en
//!      rojo: el nombre y la firma de cada lado tienen que casar.
//!   2. **`conectado` no se puede decir sin CONNACK.** Se mira el FUENTE del
//!      borde: la unica construccion de `Estado::Conectado` tiene que estar en
//!      `confirmar_conexion`, y la unica llamada a `confirmar_conexion` tiene que
//!      colgar del `?` de `Canal::suscribir` (un SUBACK que exige CONNACK).
//!
//! Lo que estos tests NO pueden probar: que el `.so` enlace, que la JVM llame
//! con las firmas correctas y que el canal conecte de verdad. Eso es del portatil
//! con NDK y del movil.

use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Leer los dos ficheros
// ---------------------------------------------------------------------------

fn ruta_de(relativa: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(relativa)
}

fn leer(ruta: &Path) -> String {
    std::fs::read_to_string(ruta).unwrap_or_else(|e| {
        panic!("no se pudo leer {}: {e}", ruta.display());
    })
}

/// El `PuenteNativo.kt` que declara los `external fun`.
///
/// La ruta se comprueba aqui y no en cada test: si el fichero se mueve, el fallo
/// tiene que decir donde se busco, no "assertion failed".
fn kotlin() -> String {
    let ruta = ruta_de("../android/app/src/main/java/online/enki/instagram/PuenteNativo.kt");
    assert!(
        ruta.exists(),
        "no esta PuenteNativo.kt en {}: el modulo android no puede haber desaparecido sin que el borde se entere",
        ruta.display()
    );
    leer(&ruta)
}

fn borde_rust() -> String {
    leer(&ruta_de("src/jni/mod.rs"))
}

// ---------------------------------------------------------------------------
// Un poco de lectura de fuente (sin regex: no hay dependencias que meter)
// ---------------------------------------------------------------------------

/// Los parametros de una firma Kotlin escrita en UNA linea (`a: String, b: Int`).
fn parametros_kotlin(firma: &str) -> Vec<String> {
    let (_, resto) = match firma.split_once('(') {
        Some(par) => par,
        None => return Vec::new(),
    };
    let dentro = match resto.split_once(')') {
        Some(par) => par.0,
        None => return Vec::new(),
    };
    dentro
        .split(',')
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(str::to_string)
        .collect()
}

/// El tipo de vuelta de una firma Kotlin (`: Boolean` -> `Boolean`).
fn vuelta_kotlin(firma: &str) -> Option<String> {
    let (_, despues) = firma.rsplit_once(')')?;
    let despues = despues.trim();
    let tipo = despues.strip_prefix(':')?.trim();
    if tipo.is_empty() {
        None
    } else {
        Some(tipo.to_string())
    }
}

/// El tipo JNI que corresponde a un parametro Kotlin (`id: Long` -> `jlong`).
///
/// La tabla esta CERRADA a proposito: si alguien anade un parametro de un tipo
/// que aqui no esta, este test falla y hay que decidir que simbolo exporta Rust.
/// Un `Any` o un `IntArray` no se contemplan porque el borde no los usa.
fn tipo_jni_de(parametro: &str) -> &'static str {
    let tipo = parametro
        .split_once(':')
        .map(|(_, t)| t.trim())
        .unwrap_or_else(|| panic!("parametro Kotlin sin tipo: {parametro}"));
    match tipo.trim_end_matches('?') {
        "String" => "JString",
        "Long" => "jlong",
        "Boolean" => "jboolean",
        "Int" => "jint",
        otro => panic!("tipo Kotlin no contemplado en el borde: {otro}"),
    }
}

/// Los tipos de los parametros de un simbolo Rust, en orden y sin el entorno.
///
/// La JVM pasa siempre `JNIEnv` y el `jobject` de la instancia delante: esos dos
/// no cuentan como parametros del metodo Kotlin. El resto tiene que casar uno a
/// uno y EN ORDEN: `(Long, String)` en Kotlin es `(jlong, JString)` en Rust, y
/// un `(JString, jlong)` compilaria igual y fallaria en el movil.
fn tipos_rust_sin_entorno(firma: &str) -> Vec<String> {
    let solo_parametros = firma.split_once("->").map(|par| par.0).unwrap_or(firma);
    let (_, resto) = match solo_parametros.split_once('(') {
        Some(par) => par,
        None => return Vec::new(),
    };
    let dentro = match resto.split_once(')') {
        Some(par) => par.0,
        None => return Vec::new(),
    };

    let mut tipos: Vec<String> = dentro
        .split(',')
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(|p| {
            let tipo = p.rsplit_once(':').map(|(_, t)| t).unwrap_or(p).trim();
            // `JString<'local>` -> `JString`
            tipo.chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect::<String>()
        })
        .collect();

    // `env: JNIEnv<'local>` y `_esto: JObject<'local>` van siempre delante.
    if tipos.first().map(String::as_str) == Some("JNIEnv") {
        tipos.remove(0);
    }
    if tipos.first().map(String::as_str) == Some("JObject") {
        tipos.remove(0);
    }
    tipos
}

/// El nombre de la funcion de una linea de firma Rust, si lo es.
fn nombre_de_funcion_rust(linea: &str) -> Option<String> {
    let t = linea.trim_start();
    let t = t.strip_prefix("pub ").unwrap_or(t);
    let pos = t.find("fn ")?;
    let resto = &t[pos + 3..];
    let nombre: String =
        resto.chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
    if nombre.is_empty() {
        None
    } else {
        Some(nombre)
    }
}

/// La firma Rust de un simbolo `Java_*`: desde la linea `fn` hasta la `{` del
/// cuerpo (sin el cuerpo).
fn firma_rust(fuente: &str, simbolo: &str) -> String {
    let marcador = format!("fn {simbolo}");
    let (_, desde) = fuente
        .split_once(&marcador)
        .unwrap_or_else(|| panic!("no hay ninguna firma `{marcador}` en src/jni/mod.rs"));
    let hasta_llave: String = desde.chars().take_while(|c| *c != '{').collect();
    hasta_llave
}

/// ¿La linea es un comentario? Los comentarios NOMBRAN los estados para
/// explicarlos, y un `Estado::Conectado` dentro de una explicacion no es una
/// construccion: contarlo haria que el test midiera la prosa.
fn es_comentario(linea: &str) -> bool {
    let t = linea.trim_start();
    t.starts_with("//") || t.starts_with("/*") || t.starts_with('*')
}

/// El nombre de la funcion Rust que CONTIENE la linea `indice`.
fn funcion_que_contiene(lineas: &[&str], indice: usize) -> String {
    for linea in lineas[..=indice].iter().rev() {
        if let Some(nombre) = nombre_de_funcion_rust(linea) {
            if linea.contains('{') {
                return nombre;
            }
        }
    }
    panic!("la linea {indice} no esta dentro de ninguna funcion");
}

// ---------------------------------------------------------------------------
// 1 · Los simbolos (y las firmas) de los dos lados casan
// ---------------------------------------------------------------------------

#[test]
fn los_simbolos_jni_coinciden_con_los_de_kotlin() {
    let kotlin = kotlin();
    let rust = borde_rust();

    // El prefijo del simbolo lo dicta la JVM: paquete con `.` -> `_`, mas la
    // clase. Se lee, no se escribe a mano: escribirlo a mano seria otra copia
    // que se puede quedar atras.
    let paquete = kotlin
        .lines()
        .find_map(|l| l.trim().strip_prefix("package "))
        .map(|p| p.trim().to_string())
        .expect("PuenteNativo.kt no declara `package`: sin paquete no hay simbolo");
    let objeto = kotlin
        .lines()
        .map(str::trim)
        .find_map(|l| l.strip_prefix("object "))
        .and_then(|resto| resto.split_whitespace().next())
        .map(str::to_string)
        .expect("PuenteNativo.kt no declara `object <Clase>`: el simbolo lleva el nombre de la clase");
    let prefijo = format!("Java_{}_{}_", paquete.replace('.', "_"), objeto);

    // Los `external fun` de Kotlin, con su firma. Se leen de UNA linea cada uno:
    // si alguien parte la firma en dos lineas, este test falla y hay que mirar
    // (preferible a un parseo que se cree listo y no vea nada).
    let mut externos: Vec<(String, Vec<String>, Option<String>)> = Vec::new();
    for linea in kotlin.lines() {
        let t = linea.trim();
        if let Some(resto) = t.strip_prefix("external fun ") {
            let nombre: String =
                resto.chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
            assert!(
                !nombre.is_empty(),
                "hay un `external fun` sin nombre en PuenteNativo.kt: {t}"
            );
            externos.push((nombre, parametros_kotlin(t), vuelta_kotlin(t)));
        }
    }
    // Siete y no cero: un parseo que no ve nada pasaria el resto del test sin
    // comprobar nada, que es la forma mas silenciosa de no tener test. Tres son
    // el canal (bloque 18), tres la mano (bloque 19a) y uno el volcado (19b).
    assert_eq!(
        externos.len(),
        7,
        "se esperaban los siete `external fun` de PuenteNativo (iniciar, detener, estado, siguientePeticion, entregarRespuesta, arbolVisible, publicarObservacion) y se leyeron {}: {:?}",
        externos.len(),
        externos.iter().map(|e| &e.0).collect::<Vec<_>>()
    );

    // Los simbolos que el crate exporta de verdad.
    let mut exportados: Vec<String> = Vec::new();
    for linea in rust.lines() {
        let t = linea.trim();
        if let Some(resto) = t.strip_prefix("pub extern \"system\" fn ") {
            let nombre: String =
                resto.chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
            if nombre.starts_with("Java_") {
                exportados.push(nombre);
            }
        }
    }
    assert_eq!(
        exportados.len(),
        externos.len(),
        "el crate exporta {:?} y Kotlin declara {:?}",
        exportados,
        externos.iter().map(|e| &e.0).collect::<Vec<_>>()
    );

    for (metodo, parametros, vuelta) in &externos {
        let esperado = format!("{prefijo}{metodo}");
        assert!(
            exportados.iter().any(|e| e == &esperado),
            "Kotlin declara `{metodo}` y el crate NO exporta `{esperado}`: la app se quedaria en sin_borde_jni sin error de compilacion en ningun lado. Exporta: {exportados:?}"
        );

        // La firma, no solo el nombre. Los parametros tienen que casar UNO A UNO
        // Y EN ORDEN: un `(Long, String)` de Kotlin es `(jlong, JString)` en
        // Rust, y al reves compilaria igual y fallaria en el movil (la JVM no
        // convierte nada: pasa los bits que le digan).
        let firma = firma_rust(&rust, &esperado);
        let esperados: Vec<&'static str> = parametros.iter().map(|p| tipo_jni_de(p)).collect();
        let en_rust = tipos_rust_sin_entorno(&firma);
        assert_eq!(
            en_rust,
            esperados.iter().map(|t| t.to_string()).collect::<Vec<_>>(),
            "`{metodo}` recibe {parametros:?} en Kotlin y su simbolo Rust declara {en_rust:?}: {firma}"
        );

        // Y el valor de vuelta. `String?` y `String` son el MISMO `JString` en la
        // ABI (la JVM pasa null como referencia nula); `Boolean` es `jboolean`.
        let vuelta = vuelta.as_deref().map(|t| t.trim_end_matches('?'));
        match vuelta {
            Some("Boolean") => assert!(
                firma.contains("-> jboolean"),
                "`{metodo}: Boolean` en Kotlin exige `-> jboolean` en Rust: {firma}"
            ),
            Some("String") => assert!(
                firma.contains("-> JString"),
                "`{metodo}: String?` en Kotlin exige `-> JString` en Rust (null = referencia nula): {firma}"
            ),
            None => assert!(
                !firma.contains("->"),
                "`{metodo}` no devuelve nada en Kotlin y su simbolo Rust devuelve algo: {firma}"
            ),
            Some(otro) => panic!("tipo de vuelta no contemplado en `{metodo}`: {otro}"),
        }
    }

    // Y al reves: un simbolo de mas es un metodo que alguien borro de Kotlin y
    // dejo exportandose (o un nombre mal escrito que ya no llama nadie).
    for simbolo in &exportados {
        assert!(
            externos.iter().any(|(metodo, _, _)| &format!("{prefijo}{metodo}") == simbolo),
            "el crate exporta `{simbolo}` y Kotlin no declara ese metodo: sobra o esta mal nombrado"
        );
    }

    // ---- el volcado (19b): un solo topic y ni un parseo ----
    //
    // El topic se escribe en UN sitio (`canal::observacion::TOPIC_OBSERVACION`).
    // Si el borde lo llevara escrito a mano, cambiar el topic en el modulo
    // dejaria al movil publicando donde nadie escucha, sin error en ningun lado.
    let observacion = leer(&ruta_de("src/canal/observacion.rs"));
    assert!(
        observacion.contains("\"core/core-a/events/bridge/observacion\""),
        "el topic del volcado tiene que estar declarado en canal/observacion.rs"
    );
    assert!(
        observacion.contains("pub const CORE_ID: &str = \"external\""),
        "el volcado tiene que presentarse como `external` en el sobre del bus: como `core-a`, el bus lo descarta por self-loop"
    );
    assert!(
        rust.contains("observacion::encolar_para_el_bus") && rust.contains("observacion::buzon()"),
        "el borde no usa `canal::observacion`: estaria publicando el volcado por su cuenta (o no lo publica)"
    );
    assert!(
        !rust.contains("core/core-a/events/bridge/observacion"),
        "el borde no puede llevar el topic del volcado escrito a mano: vive en canal::observacion"
    );

    // El simbolo del volcado NO parsea: si algun dia alguien mete un
    // `json::leer` ahi para "arreglar" el volcado, el dato que llega al
    // servidor deja de ser lo que el aparato vio.
    let cuerpo_volcado = rust
        .split_once("fn Java_online_enki_instagram_PuenteNativo_publicarObservacion")
        .expect("simbolo publicarObservacion")
        .1;
    assert!(
        !cuerpo_volcado.contains("json::leer"),
        "el borde del volcado no puede parsear el JSON: es un puente tonto a proposito"
    );
}

// ---------------------------------------------------------------------------
// 2 · `conectado` solo con el CONNACK detras
// ---------------------------------------------------------------------------

#[test]
fn el_borde_no_devuelve_conectado_sin_connack() {
    let rust = borde_rust();
    let lineas: Vec<&str> = rust.lines().collect();

    // (a) El texto que viaja a Kotlin sale de UN solo brazo, y es el de
    //     `Estado::Conectado`. Si hubiera otro sitio que devolviera la cadena
    //     "conectado" (un literal suelto, un `format!`), este test lo caza.
    let brazos: Vec<usize> = lineas
        .iter()
        .enumerate()
        .filter(|(_, l)| l.contains("Estado::Conectado =>") && !es_comentario(l))
        .map(|(i, _)| i)
        .collect();
    assert_eq!(
        brazos.len(),
        1,
        "el valor `conectado` tiene que salir de un unico brazo de `Estado::como_texto`"
    );
    assert!(
        lineas[brazos[0]].contains("\"conectado\""),
        "el brazo de `Estado::Conectado` no es el que produce el texto `conectado`: {}",
        lineas[brazos[0]]
    );

    // (b) La UNICA construccion de `Estado::Conectado` (fuera de un `match`)
    //     vive en `confirmar_conexion`. Ninguna otra funcion del borde puede
    //     fabricar ese estado: ni `iniciar`, ni `estado`, ni el hilo.
    let construcciones: Vec<usize> = lineas
        .iter()
        .enumerate()
        .filter(|(_, l)| l.contains("Estado::Conectado") && !l.contains("=>") && !es_comentario(l))
        .map(|(i, _)| i)
        .collect();
    assert_eq!(
        construcciones.len(),
        1,
        "`Estado::Conectado` se construye en {} sitios: {:?}",
        construcciones.len(),
        construcciones.iter().map(|i| lineas[*i].trim()).collect::<Vec<_>>()
    );
    let construccion = construcciones[0];
    assert_eq!(
        funcion_que_contiene(&lineas, construccion),
        "confirmar_conexion",
        "`Estado::Conectado` se construye fuera de `confirmar_conexion`: {}",
        lineas[construccion].trim()
    );

    // (c) `confirmar_conexion` se llama UNA vez, desde `suscribir`, y el `?` de
    //     `Canal::suscribir` esta en la linea anterior: el `?` solo deja pasar el
    //     Ok, y ese Ok es el SUBACK. Sin SUBACK no hay confirmacion.
    let llamadas: Vec<usize> = lineas
        .iter()
        .enumerate()
        .filter(|(_, l)| {
            l.contains("confirmar_conexion(") && !l.contains("fn confirmar_conexion") && !es_comentario(l)
        })
        .map(|(i, _)| i)
        .collect();
    assert_eq!(llamadas.len(), 1, "`confirmar_conexion` tiene que llamarse en un unico sitio");
    let llamada = llamadas[0];
    assert_eq!(
        funcion_que_contiene(&lineas, llamada),
        "suscribir",
        "`confirmar_conexion` se llama fuera de la suscripcion: {}",
        lineas[llamada].trim()
    );
    let anterior = lineas[..llamada]
        .iter()
        .rev()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .expect("confirmar_conexion no puede ser la primera linea del fichero");
    assert!(
        anterior.contains("suscribir") && anterior.ends_with("?;"),
        "la llamada a `confirmar_conexion` tiene que colgar del `?` de `Canal::suscribir` (asi solo corre con el SUBACK ya recibido); la linea anterior es: {anterior}"
    );

    // (d) El CONNACK no se comprueba aqui: lo comprueba `Canal::conectar`, y el
    //     borde no puede saltarselo porque no tiene otra forma de llegar a
    //     `Conectado`.
    assert!(
        rust.contains("Canal::conectar"),
        "el borde tiene que abrir el canal con `Canal::conectar` (que es quien exige el CONNACK), no con otra cosa"
    );

    // (e) El hilo tampoco puede adelantarse: el estado con el que se arranca es
    //     `conectando`, y `desconectado` es el que queda al parar.
    let iniciar = firma_rust(&rust, "Java_online_enki_instagram_PuenteNativo_iniciar");
    assert!(
        !iniciar.contains("Conectado"),
        "`iniciar` no puede construir el estado `conectado` en su firma"
    );
    // El cuerpo de `iniciar` es lo que va de su simbolo al siguiente
    // `#[no_mangle]`, no "las siguientes N lineas": asi el corte es el de verdad.
    // El marcador lleva el `fn` delante: el nombre del simbolo tambien aparece
    // en la cabecera del modulo, y cortar por ahi mediria la prosa, no el cuerpo.
    let cuerpo_iniciar = rust
        .split_once("fn Java_online_enki_instagram_PuenteNativo_iniciar")
        .expect("simbolo iniciar")
        .1
        .split("#[no_mangle]")
        .next()
        .expect("el cuerpo de iniciar acaba en el siguiente simbolo");
    assert!(
        !cuerpo_iniciar.lines().any(|l| l.contains("Estado::Conectado")),
        "`iniciar` no puede devolver un canal conectado: el CONNACK todavia no ha llegado"
    );
}

// ---------------------------------------------------------------------------
// 3 · El sondeo de la mano atiende lo que la cola puede encolar (19a)
// ---------------------------------------------------------------------------

/// Si `BucleDeMano.kt` no distingue un tipo de peticion, ese tipo caduca siempre.
///
/// El fallo tipico es este: alguien anade `TipoDePeticion::Pulsar` en la cola,
/// el crate lo encola, y Kotlin no sabe que hacer con el. No hay error de
/// compilacion en ningun lado y el sintoma es `mano_sin_respuesta` cada 10 s. El
/// test lee los DOS fuentes y compara los nombres.
#[test]
fn el_sondeo_de_la_mano_atiende_los_tipos_que_la_cola_encola() {
    let cola = leer(&ruta_de("src/mano/cola.rs"));
    let bucle = leer(&ruta_de(
        "../android/app/src/main/java/online/enki/instagram/BucleDeMano.kt",
    ));
    let servicio = leer(&ruta_de(
        "../android/app/src/main/java/online/enki/instagram/ServicioEnki.kt",
    ));

    // Los dos tipos del contrato, leidos de los dos lados.
    for tipo in ["observar", "ejecutar"] {
        assert!(
            cola.contains(&format!("\"{tipo}\"")),
            "la cola ya no declara el tipo `{tipo}`: revisa `TipoDePeticion::como_str`"
        );
        assert!(
            bucle.contains(&format!("\"{tipo}\"")),
            "BucleDeMano.kt no distingue el tipo `{tipo}`: toda peticion de ese tipo caducaria con mano_sin_respuesta"
        );
    }

    // El sondeo habla por los dos simbolos de la cola, y siempre contesta.
    assert!(
        bucle.contains("siguientePeticion"),
        "BucleDeMano.kt no sondea `siguientePeticion`: la cola no se vaciaria nunca"
    );
    assert!(
        bucle.contains("entregarRespuesta"),
        "BucleDeMano.kt no contesta con `entregarRespuesta`: el crate esperaria 10 s por peticion"
    );

    // Y el servicio lo arranca y lo para CON el canal: un sondeo huerfano gasta
    // bateria, y uno que no arranca deja la mano muda.
    assert!(
        servicio.contains("BucleDeMano.arrancar"),
        "ServicioEnki.kt no arranca el sondeo de la mano al abrir el canal"
    );
    assert!(
        servicio.contains("BucleDeMano.parar"),
        "ServicioEnki.kt no para el sondeo de la mano al cerrar el canal"
    );
}
