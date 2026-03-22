# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for Ceol Windows (.exe)
# Run from the desktop/ directory:  pyinstaller ceol-win.spec

from pathlib import Path
ROOT = Path("..").resolve()   # repo root

block_cipher = None

a = Analysis(
    [str(ROOT / "desktop" / "app.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=[
        (str(ROOT / "frontend"),  "frontend"),
        (str(ROOT / "backend"),   "backend"),
        (str(ROOT / "desktop" / "welcome.html"), "desktop"),
    ],
    hiddenimports=[
        # uvicorn internals not auto-discovered
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # anyio
        "anyio._backends._asyncio",
        # pydantic v2
        "pydantic.deprecated.class_validators",
        "pydantic.deprecated.config",
        "pydantic_core",
        # pywebview Windows backend — uses Microsoft Edge WebView2
        # (built into Windows 11; free redistributable for Windows 10)
        "webview.platforms.edgechromium",
        # httpx / h11
        "h11",
        "httpx",
        # other backend deps
        "PyPDF2",
        "aiofiles",
        "multipart",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "PyQt5", "PyQt6", "wx"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="Ceol",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,          # no terminal / console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,              # replace with path to a .ico file if you have one
    version=None,
    # Single-file exe — easiest to share; slower first launch (~5 s) as it
    # self-extracts. Change to onedir=True + COLLECT if startup speed matters.
    onefile=True,
)
