# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for Ceol macOS (.app bundle → .dmg)
# Run from the desktop/ directory:  pyinstaller ceol-mac.spec

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
        # pywebview macOS backend (WebKit via PyObjC)
        "webview.platforms.cocoa",
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
    [],
    exclude_binaries=True,
    name="Ceol",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,          # no terminal window
    disable_windowed_traceback=False,
    argv_emulation=True,    # needed for macOS open-with / drag-drop
    target_arch=None,       # set to 'arm64' or 'x86_64' to cross-compile
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="Ceol",
)

app = BUNDLE(
    coll,
    name="Ceol.app",
    icon=None,              # replace with path to a .icns file if you have one
    bundle_identifier="com.callummaclellan.ceol",
    info_plist={
        "CFBundleName": "Ceol",
        "CFBundleDisplayName": "Ceol",
        "CFBundleShortVersionString": "1.0.0",
        "CFBundleVersion": "1",
        "NSHighResolutionCapable": True,
        "NSRequiresAquaSystemAppearance": False,   # respects system dark mode
        "NSHumanReadableCopyright": "Callum MacLellan",
    },
)
