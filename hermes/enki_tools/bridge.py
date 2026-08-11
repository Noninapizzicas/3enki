"""
EnkiBridge — cliente HTTP hacia hermes-bridge (localhost:3000).

Lee el Bearer token de data/.hermes-bridge-token (mismo fichero que
genera el módulo Node.js al arrancar). Todas las llamadas pasan por
POST /modules/hermes-bridge/execute.
"""

import json
import os
from pathlib import Path

import requests


class EnkiBridge:
    """Puente HTTP hacia hermes-bridge (Enki core)."""

    def __init__(self, base_url=None, token=None, token_path=None, timeout=300):
        self.base_url = (base_url or os.environ.get('ENKI_BRIDGE_URL')
                         or 'http://localhost:3000/modules/hermes-bridge')
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers['Content-Type'] = 'application/json'

        resolved_token = token or os.environ.get('ENKI_BRIDGE_TOKEN')
        if not resolved_token:
            resolved_token = self._read_token(token_path)
        if not resolved_token:
            raise RuntimeError(
                'No token: set ENKI_BRIDGE_TOKEN, pass token=, '
                'or ensure data/.hermes-bridge-token exists'
            )
        self._session.headers['Authorization'] = f'Bearer {resolved_token}'

    def _read_token(self, token_path=None):
        candidates = []
        if token_path:
            candidates.append(Path(token_path))
        candidates.extend([
            Path('data/.hermes-bridge-token'),
            Path(__file__).resolve().parent.parent.parent / 'data' / '.hermes-bridge-token',
        ])
        for p in candidates:
            try:
                return p.read_text().strip()
            except (FileNotFoundError, PermissionError):
                continue
        return None

    # ── call: ejecuta una tool de Enki ──────────────────────────

    def call(self, tool_name, context=None, **args):
        """Ejecuta una tool de Enki por nombre.

        Args:
            tool_name: nombre de la tool (ej. 'buscar_capacidad')
            context: dict opcional con project_id, conversation_id, etc.
            **args: argumentos de la tool

        Returns:
            El resultado de la tool (dict).

        Raises:
            EnkiToolError: si la tool falla (timeout, not found, etc.)
        """
        payload = {'tool_name': tool_name, 'args': args}
        if context:
            payload['context'] = context

        resp = self._post('/execute', payload)
        body = resp.json()

        if resp.status_code == 401:
            raise EnkiAuthError('Bearer token rejected by hermes-bridge')

        if 'error' in body:
            err = body['error']
            raise EnkiToolError(
                tool=tool_name,
                code=err.get('code', 'UNKNOWN_ERROR'),
                message=err.get('message', str(err)),
                details=err.get('details'),
                http_status=resp.status_code,
            )

        return body.get('result', body.get('data', body))

    # ── catalog: lista de tools en formato OpenAI ────────────────

    def catalog(self):
        """Retorna las tools disponibles en formato OpenAI function-calling.

        Returns:
            list[dict]: cada entrada es {type:'function', function:{name, description, parameters}}
        """
        resp = self._get('/catalog')
        body = resp.json()

        if resp.status_code == 401:
            raise EnkiAuthError('Bearer token rejected by hermes-bridge')

        return body.get('tools', [])

    # ── health ───────────────────────────────────────────────────

    def health(self):
        """Health check del bridge (sin auth requerida)."""
        resp = self._get('/health')
        return resp.json()

    # ── HTTP internals ───────────────────────────────────────────

    def _post(self, path, payload):
        return self._session.post(
            f'{self.base_url}{path}',
            data=json.dumps(payload),
            timeout=self.timeout,
        )

    def _get(self, path):
        return self._session.get(
            f'{self.base_url}{path}',
            timeout=self.timeout,
        )


# ── Errores tipados ──────────────────────────────────────────────

class EnkiToolError(Exception):
    """Error al ejecutar una tool de Enki."""

    def __init__(self, tool, code, message, details=None, http_status=None):
        self.tool = tool
        self.code = code
        self.details = details
        self.http_status = http_status
        super().__init__(f'[{code}] {tool}: {message}')


class EnkiAuthError(EnkiToolError):
    """Token rechazado o ausente."""

    def __init__(self, message='Unauthorized'):
        super().__init__(tool='auth', code='UNAUTHORIZED', message=message, http_status=401)
