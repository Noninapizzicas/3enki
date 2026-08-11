"""
loader — genera funciones Python por cada tool de Enki y las registra en Hermes.

    from enki_tools import EnkiBridge, load_tools

    bridge = EnkiBridge()
    tools = load_tools(bridge)
    # tools = dict[str, callable]  — listo para registrar en Hermes

Cada función generada tiene:
  - __name__ = nombre de la tool
  - __doc__  = descripción
  - schema   = {name, description, parameters} (OpenAI format)
  - Firma: fn(**kwargs) -> dict  (llama bridge.call internamente)
"""

from __future__ import annotations

import json
from typing import Any, Callable


def make_tool_function(bridge, tool_def: dict) -> Callable:
    """Crea una función Python que envuelve una tool de Enki.

    Args:
        bridge: instancia de EnkiBridge
        tool_def: entrada del catálogo OpenAI {type, function:{name, description, parameters}}

    Returns:
        Función callable con schema adjunto.
    """
    fn_def = tool_def.get('function', tool_def)
    name = fn_def['name']
    description = fn_def.get('description', '')
    parameters = fn_def.get('parameters', {'type': 'object', 'properties': {}})

    def tool_fn(**kwargs: Any) -> Any:
        context = kwargs.pop('_context', None)
        return bridge.call(name, context=context, **kwargs)

    tool_fn.__name__ = name
    tool_fn.__qualname__ = f'enki_tool.{name}'
    tool_fn.__doc__ = description
    tool_fn.schema = {
        'name': name,
        'description': description,
        'parameters': parameters,
    }

    return tool_fn


def load_tools(bridge, filter_fn=None) -> dict[str, Callable]:
    """Carga el catálogo completo y genera funciones Python.

    Args:
        bridge: instancia de EnkiBridge
        filter_fn: opcional — fn(tool_def) -> bool para filtrar tools

    Returns:
        dict[str, callable] — tool_name → función Python
    """
    catalog = bridge.catalog()
    tools = {}

    for tool_def in catalog:
        if filter_fn and not filter_fn(tool_def):
            continue
        fn = make_tool_function(bridge, tool_def)
        tools[fn.__name__] = fn

    return tools


def export_catalog_json(bridge, path: str = 'data/hermes-tools.json'):
    """Exporta el catálogo a un fichero JSON (para uso offline)."""
    catalog = bridge.catalog()
    with open(path, 'w') as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)
    return len(catalog)
