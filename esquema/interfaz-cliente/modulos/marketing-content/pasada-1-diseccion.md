# Disección — marketing-content desde el cliente

Cada pieza atómica pasa por el diseccionador: ¿qué FORMA tiene?

---

## Tabla de disección

| # | Pieza | Forma | Razón |
|---|---|---|---|
| C1 | **Artículos → blog/about** | **conversor** | Filtra piezas (estado=publicado, formato=articulo), extrae título+contenido+descripción, genera { tipo: "blog-post", titulo, cuerpo, excerpt, fecha }. El conversor formatea Markdown→HTML y genera el excerpt si no hay descripción. |
| C2 | **Landings → página** | **conversor** | Filtra (estado=publicado, formato=landing), extrae título+descripción, genera { tipo: "landing-page", titulo, descripcion, cta }. Si contenido=null, la landing puede estar compuesta por secciones de otros módulos (carta, pricing). El conversor detecta el caso y delega. |
| C3 | **Emails → newsletter** | **conversor** | Filtra (estado=publicado, formato=email), extrae título+contenido, genera { tipo: "email-render", asunto: titulo, cuerpo, canal: "email" }. El conversor adapta el formato a email HTML (inline styles, tablas). |
| C4 | **Posts sociales → canal** | **conversor** | Filtra (estado=publicado, formato=post_social), extrae contenido+canal_id, genera { tipo: "social-post", texto, canal, hashtags: extraer(contenido) }. El conversor adapta longitud y formato al canal (Instagram caption, tweet, etc.). |
| C5 | **FAQ → sección/página** | **conversor** | Filtra (estado=publicado, formato=faq), parsea contenido (formato pregunta→respuesta), genera [{ tipo: "faq-item", pregunta, respuesta }]. El conversor detecta el patrón "¿...? → ..." y estructura. |
| C6 | **Guías → recurso** | **conversor** | Filtra (estado=publicado, formato=guia), genera { tipo: "guide", titulo, cuerpo, cta: "descargar" }. Puede generar PDF o página según presencia. |
| C7 | **Casos de éxito → testimonios** | **conversor** | Filtra (estado=publicado, formato=caso_exito), parsea contenido (busca cita entre comillas, nombre de cliente), genera { tipo: "testimonial", cita, fuente, texto_contexto }. Alimenta la sección social-proof junto con trust-badges de strategy. |
| C8 | **Vídeos → embed** | **conversor** | Filtra (estado=publicado, formato=video), genera { tipo: "video-embed", titulo, descripcion, url: null }. Si contenido=null, el vídeo se referencia por URL externa. Hueco: la URL del vídeo no está en el store actual. |
| C9 | **Agrupador por página** | **reflejo** | No transforma: agrupa los fragmentos C1-C8 por página destino. Un artículo va al blog; un FAQ va a la página FAQ o a una sección de la homepage; un caso de éxito va a social-proof. Reglas deterministas de asignación. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **conversor** | 8 | C1-C8: cada formato tiene su conversor específico |
| **reflejo** | 1 | C9: agrupador por página (reglas de asignación) |
| **TOTAL** | **9** | |

---

## Lectura

**Es un módulo de conversores parametrizados por formato.** Los 8 conversores (C1-C8)
comparten el mismo esqueleto:

```
CONVERSOR contenido_por_formato {
  ENTRADA: store.piezas.filtrar(estado == "publicado" Y formato == F)
  SALIDA:  [{ tipo: T, ...campos_extraidos }]
  REGLA:
    1. FILTRAR por estado + formato
    2. EXTRAER campos relevantes (titulo, contenido, descripcion)
    3. PARSEAR contenido si el formato lo requiere (FAQ: pregunta→respuesta, caso_exito: cita+fuente)
    4. GENERAR fragmento tipado
    SI pieza.contenido == null: fragmento = { ...metadatos, cuerpo: HUECO }
}
```

La diferencia entre conversores es el PARSEO y el TIPO de salida:
- Artículo: Markdown→HTML, genera excerpt
- FAQ: "¿...? → ..." → { pregunta, respuesta }
- Caso de éxito: comillas → cita + "—" → fuente
- Post social: extrae hashtags del contenido
- Email: adapta a HTML inline

El agrupador C9 es el reflejo que asigna destino:

```
REGLAS DE ASIGNACIÓN:
  formato=articulo    → página: blog
  formato=landing     → página: independiente (una por pieza)
  formato=email       → canal: email (no página web, salvo "ver en navegador")
  formato=post_social → canal: social (Instagram, Twitter...)
  formato=faq         → página: FAQ o sección FAQ en homepage
  formato=guia        → página: recursos o blog
  formato=caso_exito  → sección: social-proof (en homepage, landing, about)
  formato=video       → sección: en la página que corresponda, o página propia
```
