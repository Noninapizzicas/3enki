'use strict';

/**
 * Shim de compatibilidad.
 *
 * El parser del mensaje canónico de pedido (`PEDIDO <slug>-<NONCE> … #P1 <base64url>`)
 * dejó de ser propiedad del canal WhatsApp: ahora lo comparten `whatsapp-bot` y
 * `pedido-telegram` (que lo recibe como mensaje compartido desde la bandeja del móvil).
 * Vive en `modules/_shared/pedido-mensaje-parser.js` — un contrato, un sitio.
 *
 * Este fichero se conserva para no romper los requires que ya apuntaban aquí.
 */
module.exports = require('../../_shared/pedido-mensaje-parser');
