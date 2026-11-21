//! U1 · VerificadorDeExclusividad — el test que afirma la regla dura.
//!
//! La regla del bloque 2 (plan de obra, seccion 5.3, estado imposible 6): un
//! trabajo no puede estar EN_CURSO con la cuenta visible distinta de la esperada.
//! Y el caso que de verdad importa no es "se ve otra cuenta", es "no se pudo
//! saber": ese se trata igual de duro, sin convertirlo en un no que tranquilice.
//!
//! Ejecutar: cd modules/instagram-bridge/crate && cargo test

use enki_instagram_bridge::mano::exclusividad::{
    comprobar, normalizar, parar_si_no_coincide, HechoVisible, Mirada, Motivo, PayloadVeredicto,
    Veredicto,
};

// ---------------------------------------------------------------------------
// Los tres tests obligatorios del bloque
// ---------------------------------------------------------------------------

#[test]
fn indeterminado_se_trata_como_no_coincide() {
    let esperada = "@taller_a";

    // Tres formas distintas de no saber: no se vio la cuenta, se vio una cuenta
    // vacia y la mirada fue parcial. Ninguna autoriza a tocar nada.
    let casos = [
        (HechoVisible::nueva(None, Mirada::Completa), Motivo::CuentaNoVisible),
        (HechoVisible::completa("   "), Motivo::CuentaNoVisible),
        (HechoVisible::parcial(Some("@taller_a")), Motivo::MiradaParcial),
    ];

    let distinta = comprobar(esperada, &HechoVisible::completa("@otra_cuenta"));
    assert_eq!(distinta.veredicto, Veredicto::NoCoincide);
    assert!(!distinta.permite_operar());

    for (hecho, motivo_esperado) in casos {
        let c = comprobar(esperada, &hecho);

        // 1. La etiqueta NO se disfraza: indeterminado es indeterminado.
        assert_eq!(
            c.veredicto,
            Veredicto::Indeterminado,
            "un no_lo_se no se convierte en no: el motivo se conserva para quien lea"
        );
        assert_eq!(c.motivo, motivo_esperado);
        assert_ne!(c.veredicto, Veredicto::NoCoincide, "la etiqueta dice la verdad");

        // 2. La decision es exactamente la misma que con una cuenta distinta.
        assert_eq!(
            c.permite_operar(),
            distinta.permite_operar(),
            "indeterminado se trata como no coincide"
        );
        assert!(!c.permite_operar(), "no lo se no autoriza a tocar la cuenta de nadie");

        // 3. La puerta cierra: parar_si_no_coincide devuelve parada.
        let parada = c
            .parar_si_no_coincide()
            .expect_err("indeterminado tiene que parar");
        assert_eq!(parada.veredicto, Veredicto::Indeterminado);
        assert_eq!(parada.motivo, motivo_esperado);
        assert!(!parada.explicacion.is_empty(), "la parada dice por que");

        // 4. En el payload del bus viaja como "indeterminado", no como false.
        assert_eq!(c.para_payload(), PayloadVeredicto::Indeterminado);
        assert_eq!(c.para_payload().como_json(), "\"indeterminado\"");
        assert!(!c.para_payload().permite_operar());
    }
}

#[test]
fn cuenta_distinta_no_coincide() {
    let esperada = "@taller_a";

    for visible in ["@otra_cuenta", "@taller_ab", "taller", "@personal"] {
        let c = comprobar(esperada, &HechoVisible::completa(visible));
        assert_eq!(c.veredicto, Veredicto::NoCoincide, "visible={visible}");
        assert_eq!(c.motivo, Motivo::CuentaDistinta);
        assert!(!c.permite_operar(), "con otra cuenta no se opera");
        assert_eq!(c.para_payload(), PayloadVeredicto::No);
        assert_eq!(c.para_payload().como_json(), "false");

        // El informe dice QUE se comparo, no solo que fallo.
        assert_eq!(c.esperada.as_deref(), Some("taller_a"));
        assert_eq!(c.visible.as_deref(), Some(normalizar(visible).as_str()));

        let parada = c
            .parar_si_no_coincide()
            .expect_err("otra cuenta tiene que parar");
        assert_eq!(parada.motivo, Motivo::CuentaDistinta);
    }
}

#[test]
fn cuenta_igual_coincide() {
    let esperada = "@taller_a";

    // La misma cuenta escrita de las cuatro maneras en que un humano la escribe.
    for visible in ["@taller_a", "taller_a", "@Taller_A", "  @TALLER_A/  "] {
        let c = comprobar(esperada, &HechoVisible::completa(visible));
        assert_eq!(c.veredicto, Veredicto::Coincide, "visible={visible}");
        assert_eq!(c.motivo, Motivo::Coincide);
        assert!(c.permite_operar(), "misma cuenta: se puede operar");
        assert_eq!(c.para_payload(), PayloadVeredicto::Si);
        assert_eq!(c.para_payload().como_json(), "true");
        assert!(c.parar_si_no_coincide().is_ok());
        assert_eq!(c.visible.as_deref(), Some("taller_a"));
    }

    // Y el atajo de la puerta devuelve la comprobacion, no solo un ok.
    let c = parar_si_no_coincide(esperada, &HechoVisible::completa("@taller_a"))
        .expect("misma cuenta pasa la puerta");
    assert_eq!(c.veredicto, Veredicto::Coincide);
}

// ---------------------------------------------------------------------------
// Casos que blindan los bordes
// ---------------------------------------------------------------------------

#[test]
fn sin_cuenta_esperada_no_hay_comprobacion() {
    for esperada in ["", "   ", "@"] {
        let c = comprobar(esperada, &HechoVisible::completa("@taller_a"));
        assert_eq!(c.veredicto, Veredicto::Indeterminado, "esperada={esperada:?}");
        assert_eq!(c.motivo, Motivo::CuentaEsperadaAusente);
        assert!(!c.permite_operar());
        assert_eq!(c.esperada, None);
        // El visible se conserva: sirve para decir que se vio, aunque no se supiera que esperar.
        assert_eq!(c.visible.as_deref(), Some("taller_a"));
    }
}

#[test]
fn la_mirada_parcial_manda_sobre_la_coincidencia_aparente() {
    // Aunque el handle leido sea el correcto, una pantalla que no se vio entera
    // no permite afirmar de quien es la sesion: puede haber otra cuenta en el
    // selector de perfiles.
    let c = comprobar("@taller_a", &HechoVisible::parcial(Some("@taller_a")));
    assert_eq!(c.veredicto, Veredicto::Indeterminado);
    assert_eq!(c.motivo, Motivo::MiradaParcial);
    assert!(!c.permite_operar());
}

#[test]
fn normalizar_solo_limpia_lo_cosmetico() {
    assert_eq!(normalizar("@Taller.A"), "taller.a");
    assert_eq!(normalizar("  taller.a/  "), "taller.a");
    assert_eq!(normalizar("@taller.a"), "taller.a");
    // No inventa una cuenta a partir de una URL: la deja como esta (y no coincidira).
    assert_eq!(normalizar("instagram.com/taller"), "instagram.com/taller");
}

#[test]
fn cada_motivo_tiene_su_frase() {
    for motivo in [
        Motivo::Coincide,
        Motivo::CuentaEsperadaAusente,
        Motivo::CuentaNoVisible,
        Motivo::MiradaParcial,
        Motivo::CuentaDistinta,
    ] {
        assert!(!motivo.como_str().is_empty());
        assert!(!motivo.descripcion().is_empty(), "un motivo sin frase no se le puede contar a nadie");
        // Los nombres viajan en payloads: ASCII, sin tildes ni espacios.
        assert!(motivo.como_str().is_ascii());
        assert!(!motivo.como_str().contains(' '));
    }
}
