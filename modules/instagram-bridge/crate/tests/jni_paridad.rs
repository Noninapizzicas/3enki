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
    // Tres y no cero: un parseo que no ve nada pasaria el resto del test sin
    // comprobar nada, que es la forma mas silenciosa de no tener test.
    assert_eq!(
        externos.len(),
        3,
        "se esperaban los tres `external fun` de PuenteNativo (iniciar, detener, estado) y se leyeron {}: {:?}",
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

        // La firma, no solo el nombre: un `(String, String) -> Boolean` tiene que
        // ser `(JString, JString) -> jboolean`. Dos `JString` en los parametros y
        // el `jboolean` de vuelta; `detener` no lleva ni una cosa ni la otra;
        // `estado` devuelve `JString` y no recibe ninguno.
        let firma = firma_rust(&rust, &esperado);
        // `detener` no declara tipo de vuelta: sin `->`, la firma entera son
        // parametros.
        let solo_parametros = firma.split_once("->").map(|par| par.0).unwrap_or(&firma);
        let jstring_en_parametros = solo_parametros.matches("JString").count();
        assert_eq!(
            jstring_en_parametros,
            parametros.len(),
            "`{metodo}` recibe {} parametros en Kotlin y su simbolo Rust declara {jstring_en_parametros} `JString`: {firma}",
            parametros.len()
        );

        match vuelta.as_deref() {
            Some("Boolean") => assert!(
                firma.contains("-> jboolean"),
                "`{metodo}: Boolean` en Kotlin exige `-> jboolean` en Rust: {firma}"
            ),
            Some("String") => assert!(
                firma.contains("-> JString"),
                "`{metodo}: String` en Kotlin exige `-> JString` en Rust: {firma}"
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
