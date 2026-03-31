"""
py2app build script for Ceòl
Usage: python setup_mac.py py2app
"""
from setuptools import setup
import os


def _collect_files(src):
    """Recursively collect all files under src, preserving directory structure."""
    result = []
    for root, _dirs, files in os.walk(src):
        if files:
            result.append((root, [os.path.join(root, f) for f in files]))
    return result


APP = ["ceol_app.py"]
DATA_FILES = _collect_files("frontend")

OPTIONS = {
    "argv_emulation": False,
    "iconfile": "Ceol.icns",
    "packages": [
        "backend",
        "uvicorn", "uvicorn.logging", "uvicorn.loops", "uvicorn.protocols",
        "uvicorn.lifespan",
        "fastapi", "starlette",
        "sqlalchemy",
        "aiofiles",
        "httpx",
        "PyPDF2",
        "pydantic", "pydantic_core",
        "webview",
        "anyio", "sniffio", "h11",
        "multipart",
        "objc",
    ],
    "includes": [
        "Foundation", "AppKit", "WebKit", "Quartz",
    ],
    "plist": {
        "CFBundleName": "Ce\u00f2l",
        "CFBundleDisplayName": "Ce\u00f2l",
        "CFBundleIdentifier": "com.glenachulish.ceol",
        "CFBundleVersion": "1.0",
        "CFBundleShortVersionString": "1.0",
        "NSAppTransportSecurity": {
            "NSAllowsLocalNetworking": True,
        },
    },
}

setup(
    name="Ce\u00f2l",
    app=APP,
    data_files=DATA_FILES,
    options={"py2app": OPTIONS},
    setup_requires=["py2app"],
)
