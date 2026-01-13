#!/usr/bin/env node
/**
 * Gmail OAuth2 Setup Script
 *
 * Obtiene el refresh_token necesario para usar Gmail API.
 * El refresh_token se puede guardar en .env según el formato documentado
 * en contexto/credentials.json
 *
 * Uso:
 *   node scripts/gmail-oauth-setup.js
 *   node scripts/gmail-oauth-setup.js --account trabajo
 *   node scripts/gmail-oauth-setup.js --client-id xxx --client-secret yyy
 *
 * Requisitos:
 *   - Tener configurado OAuth2 en Google Cloud Console
 *   - Añadir http://localhost:3456/callback como URI de redireccionamiento
 */

const http = require('http');
const { URL } = require('url');
const readline = require('readline');

// Configuración
const REDIRECT_PORT = 3456;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify'
];

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logStep(step, msg) {
  console.log(`${colors.cyan}[${step}]${colors.reset} ${msg}`);
}

function logSuccess(msg) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function logError(msg) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
}

// Parse argumentos
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    account: null,
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--account':
      case '-a':
        config.account = args[++i];
        // Buscar credenciales específicas de cuenta
        if (config.account) {
          config.clientId = process.env[`GMAIL_CLIENT_ID_${config.account}`] || config.clientId;
          config.clientSecret = process.env[`GMAIL_CLIENT_SECRET_${config.account}`] || config.clientSecret;
        }
        break;
      case '--client-id':
        config.clientId = args[++i];
        break;
      case '--client-secret':
        config.clientSecret = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

function printHelp() {
  console.log(`
${colors.bright}Gmail OAuth2 Setup Script${colors.reset}

Obtiene el refresh_token necesario para usar Gmail API en Event-Core.

${colors.yellow}Uso:${colors.reset}
  node scripts/gmail-oauth-setup.js [opciones]

${colors.yellow}Opciones:${colors.reset}
  --account, -a <nombre>    Nombre de la cuenta (ej: trabajo, personal)
  --client-id <id>          Client ID de OAuth2 (o usar GMAIL_CLIENT_ID env)
  --client-secret <secret>  Client Secret (o usar GMAIL_CLIENT_SECRET env)
  --help, -h                Mostrar esta ayuda

${colors.yellow}Ejemplos:${colors.reset}
  # Usar credenciales de variables de entorno
  node scripts/gmail-oauth-setup.js

  # Para cuenta específica
  node scripts/gmail-oauth-setup.js --account trabajo

  # Con credenciales explícitas
  node scripts/gmail-oauth-setup.js --client-id xxx.apps.googleusercontent.com --client-secret GOC...

${colors.yellow}Antes de ejecutar:${colors.reset}
  1. Ve a Google Cloud Console → APIs & Services → Credentials
  2. Crea o edita tu OAuth 2.0 Client ID
  3. Añade este URI de redireccionamiento: ${colors.cyan}${REDIRECT_URI}${colors.reset}
  4. Habilita Gmail API en tu proyecto

${colors.yellow}Después de obtener el refresh_token:${colors.reset}
  Añade a tu .env:

  # Opción 1: Variables individuales
  GMAIL_CLIENT_ID=tu-client-id
  GMAIL_CLIENT_SECRET=tu-client-secret
  GMAIL_REFRESH_TOKEN=el-token-obtenido

  # Opción 2: JSON agrupado (para multi-cuenta)
  GMAIL_OAUTH_CUSTOM_trabajo={"client_id":"...","client_secret":"...","refresh_token":"..."}
`);
}

// Prompt interactivo
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Generar URL de autorización
function getAuthUrl(clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent' // Forzar para obtener refresh_token
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Intercambiar código por tokens
async function exchangeCodeForTokens(code, clientId, clientSecret) {
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`${data.error}: ${data.error_description}`);
  }

  return data;
}

// Servidor temporal para capturar callback
function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #dc2626;">❌ Error de autorización</h1>
                <p>${error}</p>
                <p>Puedes cerrar esta ventana.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(error));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #16a34a;">✓ Autorización exitosa</h1>
                <p>Vuelve a la terminal para ver tu refresh_token.</p>
                <p>Puedes cerrar esta ventana.</p>
              </body>
            </html>
          `);
          server.close();
          resolve(code);
          return;
        }
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(REDIRECT_PORT, () => {
      logSuccess(`Servidor de callback escuchando en puerto ${REDIRECT_PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Puerto ${REDIRECT_PORT} en uso. Cierra otras instancias o cambia el puerto.`));
      } else {
        reject(err);
      }
    });

    // Timeout de 5 minutos
    setTimeout(() => {
      server.close();
      reject(new Error('Timeout esperando autorización (5 minutos)'));
    }, 5 * 60 * 1000);
  });
}

// Abrir URL en navegador
function openBrowser(url) {
  const { exec } = require('child_process');
  const platform = process.platform;

  let command;
  switch (platform) {
    case 'darwin':
      command = `open "${url}"`;
      break;
    case 'win32':
      command = `start "" "${url}"`;
      break;
    default:
      command = `xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null || echo "Abre manualmente: ${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      log(`\nNo se pudo abrir el navegador automáticamente.`, 'yellow');
      log(`Abre esta URL manualmente:\n`, 'yellow');
    }
  });
}

// Main
async function main() {
  console.log(`
${colors.bright}╔════════════════════════════════════════╗
║     Gmail OAuth2 Setup - Event-Core    ║
╚════════════════════════════════════════╝${colors.reset}
`);

  const config = parseArgs();

  // Verificar/solicitar credenciales
  if (!config.clientId) {
    log('No se encontró GMAIL_CLIENT_ID en el entorno.\n', 'yellow');
    config.clientId = await prompt('Ingresa tu Client ID: ');
  }

  if (!config.clientSecret) {
    log('No se encontró GMAIL_CLIENT_SECRET en el entorno.\n', 'yellow');
    config.clientSecret = await prompt('Ingresa tu Client Secret: ');
  }

  if (!config.clientId || !config.clientSecret) {
    logError('Se requieren Client ID y Client Secret');
    process.exit(1);
  }

  logStep('1/4', 'Credenciales configuradas');
  log(`  Client ID: ${config.clientId.substring(0, 20)}...`, 'cyan');
  if (config.account) {
    log(`  Cuenta: ${config.account}`, 'cyan');
  }

  // Importante: URI de redirección
  console.log(`
${colors.yellow}⚠️  IMPORTANTE:${colors.reset}
   Asegúrate de haber añadido este URI de redireccionamiento
   en Google Cloud Console → Credentials → Tu OAuth Client:

   ${colors.cyan}${REDIRECT_URI}${colors.reset}
`);

  const ready = await prompt('¿Está configurado el URI de redireccionamiento? (s/n): ');
  if (ready.toLowerCase() !== 's' && ready.toLowerCase() !== 'si' && ready.toLowerCase() !== 'y') {
    log('\nConfigura el URI y vuelve a ejecutar el script.', 'yellow');
    process.exit(0);
  }

  // Generar URL de autorización
  logStep('2/4', 'Generando URL de autorización...');
  const authUrl = getAuthUrl(config.clientId);

  // Iniciar servidor de callback
  logStep('3/4', 'Iniciando servidor de callback...');
  const codePromise = startCallbackServer();

  // Abrir navegador
  console.log(`
${colors.green}Abriendo navegador para autorización...${colors.reset}

Si no se abre automáticamente, visita esta URL:
${colors.cyan}${authUrl}${colors.reset}
`);

  openBrowser(authUrl);

  // Esperar código
  log('Esperando autorización en el navegador...', 'yellow');

  try {
    const code = await codePromise;
    logSuccess('Código de autorización recibido');

    // Intercambiar por tokens
    logStep('4/4', 'Intercambiando código por tokens...');
    const tokens = await exchangeCodeForTokens(code, config.clientId, config.clientSecret);

    logSuccess('¡Tokens obtenidos exitosamente!\n');

    // Mostrar resultados
    console.log(`${colors.bright}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}${colors.bright}REFRESH TOKEN:${colors.reset}`);
    console.log(`${colors.cyan}${tokens.refresh_token}${colors.reset}`);
    console.log(`${colors.bright}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Mostrar cómo guardar
    const accountSuffix = config.account ? `_${config.account}` : '';

    console.log(`${colors.yellow}Añade esto a tu archivo .env:${colors.reset}\n`);

    if (config.account) {
      // Formato para cuenta específica
      console.log(`${colors.bright}# Opción 1: Variables individuales${colors.reset}`);
      console.log(`GMAIL_CLIENT_ID${accountSuffix}=${config.clientId}`);
      console.log(`GMAIL_CLIENT_SECRET${accountSuffix}=${config.clientSecret}`);
      console.log(`GMAIL_REFRESH_TOKEN${accountSuffix}=${tokens.refresh_token}`);

      console.log(`\n${colors.bright}# Opción 2: JSON agrupado${colors.reset}`);
      const jsonCreds = JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: tokens.refresh_token
      });
      console.log(`GMAIL_OAUTH_CUSTOM_${config.account}=${jsonCreds}`);
    } else {
      // Formato global
      console.log(`GMAIL_CLIENT_ID=${config.clientId}`);
      console.log(`GMAIL_CLIENT_SECRET=${config.clientSecret}`);
      console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    }

    console.log(`\n${colors.green}¡Listo! Ya puedes usar Gmail en tus flujos.${colors.reset}`);

    // Info adicional
    if (tokens.access_token) {
      console.log(`\n${colors.cyan}Info adicional:${colors.reset}`);
      console.log(`  Access Token: ${tokens.access_token.substring(0, 30)}...`);
      console.log(`  Expira en: ${tokens.expires_in} segundos`);
      console.log(`  Scopes: ${tokens.scope}`);
    }

  } catch (error) {
    logError(`Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
