# contenido.blueprint.json — MOVIDO 2026-06-15

Los cajones FUZZY (redactar_descripcion=copywriter, generar_imagen=director de arte,
vincular_imagen=curador) estaban mal ubicados en contenido. contenido NO tiene página
(no hay ruta /contenido), así que ningún chat cargaba sus cajones → HUÉRFANOS
(auditoría nonina 2026-06-15: media.generar/contenido.set nunca dispararon; el LLM
improvisó y alucinó).

Corrección: son trabajo de PÁGINA. Se movieron al blueprint de **carta-digital**
(modules/pizzepos/carta-digital/carta-digital.blueprint.json), que es la página donde
vive el ContenidoPanel (botones ✍️/🎨). contenido queda como REFLEJO PURO (almacén):
sirve el CRUD por el bus (contenido.<op>.request) + ui_handlers. blueprint_driven=false.
