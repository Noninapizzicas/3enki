#!/usr/bin/env node
/**
 * fetch-export — descarga el export de una conversación via conversation-export API.
 *
 * Uso:
 *   node scripts/audit-helpers/fetch-export.js <conversation_id> <project_id> [output_path]
 */
'use strict';
const https = require('https');
const fs = require('fs');

const [, , convId, projectId, outPath] = process.argv;
if (!convId || !projectId) { console.error('Uso: fetch-export.js <conv_id> <project_id> [output_path]'); process.exit(2); }

const TOKEN = process.env.EXPORT_TOKEN || 'nonina';
const BASE = process.env.EXPORT_BASE || 'https://enki-ai.online/modules/conversation-export';
const url = `${BASE}/session/${convId}?token=${TOKEN}&project_id=${projectId}&verbose=true`;

https.get(url, (res) => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const data = Buffer.concat(chunks).toString();
    if (outPath) {
      fs.writeFileSync(outPath, data);
      try {
        const j = JSON.parse(data);
        const c = j.summary?.counts || {};
        console.log(`saved → ${outPath}  (${c.messages || 0} msgs, ${c.user_messages || 0} user, ${c.assistant_messages || 0} assistant)`);
      } catch { console.log(`saved → ${outPath}  (${data.length} bytes)`); }
    } else {
      process.stdout.write(data);
    }
  });
}).on('error', err => { console.error('fetch failed:', err.message); process.exit(1); });
