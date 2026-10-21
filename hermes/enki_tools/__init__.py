"""
enki_tools — Hermes accede a las 434+ tools de Enki via hermes-bridge HTTP.

    from enki_tools import EnkiBridge

    bridge = EnkiBridge()            # lee token de data/.hermes-bridge-token
    result = bridge.call('buscar_capacidad', query='cocina')
    tools  = bridge.catalog()        # formato OpenAI function-calling
"""

from .bridge import EnkiBridge
from .loader import load_tools, make_tool_function

__all__ = ['EnkiBridge', 'load_tools', 'make_tool_function']
