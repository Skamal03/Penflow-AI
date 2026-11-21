TOOLS = {}

def register(name: str):
    def decorator(func):
        TOOLS[name] = func
        return func
    return decorator

def run_tool(name: str, **kwargs):
    if name not in TOOLS:
        raise ValueError(f"Tool '{name}' is not registered. Available: {list(TOOLS.keys())}")
    return TOOLS[name](**kwargs)

def list_tools():
    return list(TOOLS.keys())