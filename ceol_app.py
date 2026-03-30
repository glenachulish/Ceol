import sys
import threading
import time
import urllib.request
import socket
import os
from pathlib import Path


def _find_port():
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def _wait_for_server(port, timeout=30):
    """Poll until the server responds, instead of sleeping a fixed amount."""
    url = f"http://127.0.0.1:{port}/"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.15)
    return False


def main():
    if getattr(sys, "frozen", False):
        base_dir = Path(sys._MEIPASS)
        data_dir = Path.home() / "Library" / "Application Support" / "Ceol"
        data_dir.mkdir(parents=True, exist_ok=True)
        os.environ["CEOL_DATA_DIR"] = str(data_dir)
        os.environ["CEOL_BASE_DIR"] = str(base_dir)

    from backend.main import app
    import uvicorn
    import webview

    port = _find_port()

    def _start():
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

    t = threading.Thread(target=_start, daemon=True)
    t.start()

    _wait_for_server(port)

    window = webview.create_window(
        "Ceòl",
        f"http://127.0.0.1:{port}",
        width=1280,
        height=860,
        min_size=(800, 600),
    )
    webview.start()


if __name__ == "__main__":
    main()
