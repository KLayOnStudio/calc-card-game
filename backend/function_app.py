"""
Azure Functions entry point.

Wraps the FastAPI app from main.py with Azure Functions' ASGI adapter, so
main.py itself stays a plain, ordinary FastAPI app (testable locally with
plain uvicorn, no Azure-specific code in it at all).
"""

import azure.functions as func

from main import app as fastapi_app

app = func.AsgiFunctionApp(app=fastapi_app, http_auth_level=func.AuthLevel.ANONYMOUS)
