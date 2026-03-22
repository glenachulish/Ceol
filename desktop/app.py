"""
Ceol Desktop Launcher
Starts the FastAPI backend in a background thread, then opens the UI
in a native window via pywebview.
"""

import os
import socket
import sys
import threading
import time
from pathlib import Path

# ── Resolve paths ──────────────────────────────────────────────────────────────
# When frozen by PyInstaller, sys._MEIPASS is the temp extraction directory.
# When running from source, BASE_DIR is the repo root (one level above desktop/).
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys._MEIPASS)
else:
    BASE_DIR = Path(__file__).parent.parent

# User data lives in ~/Documents/Ceol so it survives app updates/reinstalls.
if sys.platform == "win32":
    DATA_DIR = Path(os.environ.get("USERPROFILE", Path.home())) / "Documents" / "Ceol"
else:
    DATA_DIR = Path.home() / "Documents" / "Ceol"

DATA_DIR.mkdir(parents=True, exist_ok=True)

# Tell the backend where to find its data and static files.
os.environ["CEOL_DATA_DIR"] = str(DATA_DIR)
os.environ["CEOL_BASE_DIR"] = str(BASE_DIR)

# Must be set before backend modules are imported.
sys.path.insert(0, str(BASE_DIR))


# ── Find a free port ───────────────────────────────────────────────────────────
def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


PORT = _find_free_port()


# ── Start the FastAPI server ───────────────────────────────────────────────────
def _run_server() -> None:
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",
        port=PORT,
        log_level="warning",
    )


server_thread = threading.Thread(target=_run_server, daemon=True)
server_thread.start()


def _wait_for_server(timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.15)
    return False


if not _wait_for_server():
    # Fallback: show an error in the window rather than crashing silently.
    import webview
    w = webview.create_window(
        "Ceol — Startup Error",
        html="<h2 style='font-family:sans-serif;color:#c00;padding:2rem'>"
             "Ceol could not start its internal server. "
             "Please contact Callum MacLellan for help.</h2>",
        width=600, height=300,
    )
    webview.start()
    sys.exit(1)


# ── First-run welcome flag ─────────────────────────────────────────────────────
WELCOME_FLAG = DATA_DIR / ".ceol_welcomed"
is_first_run = not WELCOME_FLAG.exists()


# ── Build URLs ─────────────────────────────────────────────────────────────────
APP_URL = f"http://127.0.0.1:{PORT}"
if is_first_run:
    WELCOME_HTML = BASE_DIR / "desktop" / "welcome.html"
    START_URL = WELCOME_HTML.as_uri() + f"?app_url={APP_URL}"
else:
    START_URL = APP_URL


# ── Launch the window ──────────────────────────────────────────────────────────
import webview  # noqa: E402  (must import after env vars are set)


class _Api:
    """JS ↔ Python bridge: called from the welcome page to mark first run done."""

    def proceed(self) -> None:
        WELCOME_FLAG.touch()
        window.load_url(APP_URL)


api = _Api()

window = webview.create_window(
    "Ceol",
    START_URL,
    js_api=api,
    width=1360,
    height=900,
    min_size=(900, 640),
)

webview.start(debug=False)
