/* Publicador — el panel de publicacion por proyecto (bloque 20a).
 *
 * HTML+CSS+JS a pelo. Sin frameworks, sin CDN, sin build: lo que hay aqui es lo
 * que corre en el navegador del dueño.
 *
 * EL PROYECTO SALE DE LA RUTA. Un panel por proyecto (/a/<proyecto>/publicador/),
 * no un selector: si el panel se abre en otro sitio, se dice y no se adivina.
 *
 * EL ESTADO SE PREGUNTA, NO SE SUPONE. Tras publicar se pregunta cada 2 s hasta
 * que el aparato dice 'publicado' o 'fallo'. Y el motivo de un fallo se ensena
 * TAL CUAL lo dijo el movil ('servicio_no_activo', 'ancla_no_encontrada',
 * 'campo_vacio'...): cada uno se arregla de una forma distinta y un 'error'
 * generico no deja arreglar ninguno.
 */

(function () {
  'use strict';

  var API = '/modules/marketing-publicador';
  var CADA_MS = 2000;         // el estado se pregunta cada 2 s
  var MAX_ESPERA_MS = 300000; // a los 5 min se deja de preguntar (y se dice)

  // ── El proyecto, de la RUTA ──────────────────────────────────────────────
  function proyectoDeLaRuta() {
    var m = /^\/a\/([^/]+)\/publicador\/?(?:index\.html)?$/.exec(window.location.pathname);
    if (m) return decodeURIComponent(m[1]);
    var meta = document.querySelector('meta[name="proyecto"]');
    var valor = meta ? (meta.getAttribute('content') || '').trim() : '';
    if (valor && valor !== '__PROYECTO__') return valor;
    return null;
  }

  var PROYECTO = proyectoDeLaRuta();

  // ── Estado del panel ─────────────────────────────────────────────────────
  var estado = {
    material: [],
    elegido: null,   // el fichero elegido (uno solo)
    destino: null,
    publicando: false,
    sondeo: null     // id del temporizador
  };

  var el = {
    proyecto: document.getElementById('proyecto'),
    cuenta: document.getElementById('cuenta'),
    pistaMaterial: document.getElementById('pista-material'),
    rejilla: document.getElementById('rejilla'),
    vacio: document.getElementById('vacio'),
    elegido: document.getElementById('elegido'),
    texto: document.getElementById('texto'),
    destinos: document.getElementById('destinos'),
    publicar: document.getElementById('publicar'),
    refrescar: document.getElementById('refrescar'),
    estado: document.getElementById('estado'),
    chip: document.getElementById('chip'),
    estadoId: document.getElementById('estado-id'),
    estadoDetalle: document.getElementById('estado-detalle'),
    estadoMotivo: document.getElementById('estado-motivo'),
    estadoPie: document.getElementById('estado-pie'),
    fallo: document.getElementById('fallo')
  };

  // ── Utilidades ───────────────────────────────────────────────────────────
  function bytes(n) {
    if (!n && n !== 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function escapar(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fallo(mensaje) {
    el.fallo.hidden = !mensaje;
    el.fallo.textContent = mensaje || '';
  }

  async function pedir(url, opciones) {
    var r = await fetch(url, opciones);
    var cuerpo = null;
    try { cuerpo = await r.json(); } catch (e) { cuerpo = null; }
    if (!r.ok) {
      var motivo = (cuerpo && cuerpo.error && (cuerpo.error.message || cuerpo.error.code))
        || (r.status === 401 || r.status === 403 ? 'la web pide contraseña (vuelve a entrar)' : 'HTTP ' + r.status);
      var err = new Error(motivo);
      err.cuerpo = cuerpo;
      err.status = r.status;
      throw err;
    }
    return cuerpo;
  }

  // ── El material ──────────────────────────────────────────────────────────
  function pintarMaterial(datos) {
    el.rejilla.innerHTML = '';
    estado.material = datos.material || [];
    el.cuenta.textContent = datos.total + ' ficheros · ' + bytes(datos.bytes_total);

    if (el.pistaMaterial) {
      el.pistaMaterial.textContent = datos.total
        ? datos.total + ' ficheros · ' + bytes(datos.bytes_total) + ' · sin filtro de formato ni de tamaño'
        : 'la carpeta de material está vacía';
    }

    if (estado.material.length === 0) {
      el.vacio.hidden = false;
      el.vacio.innerHTML = 'No hay nada en <code>' + escapar(datos.raiz || 'media') + '</code>. '
        + 'Deja ahí los ficheros (fotos, vídeos, lo que sea) y pulsa «Refrescar material».';
      return;
    }
    el.vacio.hidden = true;

    estado.material.forEach(function (f) {
      var tarjeta = document.createElement('button');
      tarjeta.type = 'button';
      tarjeta.className = 'tarjeta' + (estado.elegido === f.nombre ? ' elegida' : '');
      tarjeta.dataset.nombre = f.nombre;
      tarjeta.title = f.nombre;

      // La miniatura: imagen de verdad; vídeo y audio con su icono; cualquier
      // otro formato con su nombre. NADA se esconde por su formato.
      var mini = document.createElement('div');
      mini.className = 'miniatura';
      if (f.tipo === 'imagen') {
        var img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = '';
        img.src = f.url;
        mini.appendChild(img);
      } else if (f.tipo === 'video') {
        mini.innerHTML = '<span class="icono">▶</span>';
      } else if (f.tipo === 'audio') {
        mini.innerHTML = '<span class="icono">♪</span>';
      } else if (f.tipo === 'pdf') {
        mini.innerHTML = '<span class="icono">▤</span>';
      } else if (f.tipo === 'texto') {
        mini.innerHTML = '<span class="icono">≡</span>';
      } else {
        var ext = (f.nombre.split('.').pop() || '').toUpperCase().slice(0, 6);
        mini.innerHTML = '<span class="icono" style="font-size:13px;letter-spacing:.08em">' + escapar(ext) + '</span>';
      }

      var nombre = document.createElement('span');
      nombre.className = 'nombre';
      nombre.textContent = f.nombre;

      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.innerHTML = '<span>' + escapar(f.tipo) + '</span><span>' + bytes(f.bytes) + '</span>';

      tarjeta.appendChild(mini);
      tarjeta.appendChild(nombre);
      tarjeta.appendChild(meta);
      tarjeta.addEventListener('click', function () { elegir(f.nombre); });
      el.rejilla.appendChild(tarjeta);
    });
  }

  function elegir(nombre) {
    estado.elegido = nombre;
    Array.prototype.forEach.call(el.rejilla.children, function (t) {
      t.classList.toggle('elegida', t.dataset.nombre === nombre);
    });
    var f = estado.material.filter(function (x) { return x.nombre === nombre; })[0];
    el.elegido.textContent = f ? (f.nombre + ' · ' + bytes(f.bytes)) : nombre;
    refrescarBoton();
  }

  async function cargarMaterial(opciones) {
    if (!PROYECTO) return;
    el.pistaMaterial.textContent = 'cargando…';
    try {
      var datos = await pedir(API + '/material/' + encodeURIComponent(PROYECTO));
      pintarMaterial(datos);
      if (opciones && opciones.recordar) {
        // Si el fichero elegido sigue estando, se mantiene elegido.
        if (estado.elegido && !estado.material.some(function (f) { return f.nombre === estado.elegido; })) {
          estado.elegido = null;
          el.elegido.textContent = 'ningún fichero elegido';
          refrescarBoton();
        }
      }
    } catch (err) {
      el.pistaMaterial.textContent = 'no se pudo leer el material';
      el.vacio.hidden = false;
      el.vacio.textContent = 'No se pudo leer el material: ' + err.message;
    }
  }

  // ── Destino ──────────────────────────────────────────────────────────────
  function elegirDestino(destino) {
    estado.destino = destino;
    Array.prototype.forEach.call(el.destinos.children, function (b) {
      b.setAttribute('aria-checked', b.dataset.destino === destino ? 'true' : 'false');
    });
    refrescarBoton();
  }

  function refrescarBoton() {
    el.publicar.disabled = estado.publicando || !estado.elegido || !estado.destino;
    el.publicar.textContent = estado.publicando ? 'Publicando…' : 'Publicar';
  }

  // ── Publicar ─────────────────────────────────────────────────────────────
  async function publicar() {
    if (estado.publicando || !estado.elegido || !estado.destino) return;
    fallo('');
    pararSondeo();

    estado.publicando = true;
    refrescarBoton();

    var cuerpo = {
      proyecto: PROYECTO,
      fichero: estado.elegido,
      texto: el.texto.value,
      destino: estado.destino
    };

    try {
      var datos = await pedir(API + '/publicar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo)
      });
      pintarEstado({
        id: datos.id,
        estado: datos.estado,
        destino: datos.destino,
        fichero: datos.fichero,
        motivo: null,
        detalle: null,
        momento: new Date().toISOString()
      }, 0);
      sondear(datos.id);
    } catch (err) {
      // El fallo del envio se ensena con su motivo, no con un "error".
      fallo('No salió la orden: ' + err.message);
      estado.publicando = false;
      refrescarBoton();
    }
  }

  // ── El estado en vivo ────────────────────────────────────────────────────
  function pintarEstado(entrada, segundos) {
    el.estado.hidden = false;
    el.chip.className = 'chip ' + (entrada.estado || 'enviado');
    el.chip.textContent = entrada.estado || 'enviado';
    el.estadoId.textContent = entrada.id || '';
    el.estadoDetalle.textContent = [entrada.destino, entrada.fichero].filter(Boolean).join(' · ');

    var motivo = entrada.motivo;
    el.estadoMotivo.hidden = !motivo;
    el.estadoMotivo.textContent = motivo ? String(motivo) : '';

    var pie = '';
    if (entrada.detalle) pie += entrada.detalle + ' · ';
    if (entrada.momento) pie += new Date(entrada.momento).toLocaleTimeString();
    if (entrada.estado === 'enviado') {
      pie += (pie ? ' · ' : '') + 'sin respuesta del aparato' + (segundos ? ' (' + segundos + ' s)' : '');
    }
    el.estadoPie.textContent = pie;
  }

  function pararSondeo() {
    if (estado.sondeo) { clearTimeout(estado.sondeo); estado.sondeo = null; }
  }

  function sondear(id) {
    var inicio = Date.now();
    var intentos = 0;

    var preguntar = async function () {
      intentos++;
      var segundos = Math.round((Date.now() - inicio) / 1000);
      try {
        var datos = await pedir(API + '/estado/' + encodeURIComponent(PROYECTO) + '/' + encodeURIComponent(id));
        pintarEstado(datos, segundos);

        if (datos.estado === 'publicado' || datos.estado === 'fallo') {
          estado.publicando = false;
          refrescarBoton();
          // Se queda el estado final a la vista; no se borra.
          return;
        }
      } catch (err) {
        if (err.status === 404) {
          el.estadoPie.textContent = 'el servidor no conoce este id (' + id + ') — se dejó de preguntar';
          estado.publicando = false;
          refrescarBoton();
          return;
        }
        el.estadoPie.textContent = 'no se pudo preguntar el estado: ' + err.message;
      }

      if (Date.now() - inicio > MAX_ESPERA_MS) {
        el.estadoPie.textContent = 'el aparato sigue sin contestar (' + segundos + ' s). '
          + 'La orden está enviada: si contestó, su motivo aparecerá aquí al recargar la página.';
        estado.publicando = false;
        refrescarBoton();
        return;
      }
      estado.sondeo = setTimeout(preguntar, CADA_MS);
    };

    estado.sondeo = setTimeout(preguntar, CADA_MS);
  }

  // ── Arranque ─────────────────────────────────────────────────────────────
  function arrancar() {
    if (!PROYECTO) {
      el.proyecto.textContent = 'sin proyecto';
      el.pistaMaterial.textContent = 'esta página no está en /a/<proyecto>/publicador/';
      el.vacio.hidden = false;
      el.vacio.innerHTML = 'Abre el panel en <code>/a/&lt;proyecto&gt;/publicador/</code>. '
        + 'El proyecto sale de la ruta, no se elige: un panel por proyecto.';
      el.publicar.disabled = true;
      return;
    }

    el.proyecto.textContent = PROYECTO;
    document.title = 'Publicador · ' + PROYECTO;

    el.publicar.addEventListener('click', publicar);
    el.refrescar.addEventListener('click', function () { cargarMaterial({ recordar: true }); });
    Array.prototype.forEach.call(el.destinos.children, function (b) {
      b.addEventListener('click', function () { elegirDestino(b.dataset.destino); });
    });

    cargarMaterial({ recordar: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
