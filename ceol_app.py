import sys
import threading
import socket
import os
import signal
from pathlib import Path


def _find_port():
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def main():
    if getattr(sys, "frozen", False):
        base_dir = Path(sys._MEIPASS)
        data_dir = Path.home() / "Library" / "Application Support" / "Ceol"
        data_dir.mkdir(parents=True, exist_ok=True)
        os.environ["CEOL_DATA_DIR"] = str(data_dir)
        os.environ["CEOL_BASE_DIR"] = str(base_dir)

    import webview

    port = _find_port()

    # Show the window immediately with a loading screen — no waiting.
    loading_html = """<!DOCTYPE html>
    <html><body style="background:#1a1a2e;color:#fff;font-family:system-ui;
    display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <div style="text-align:center">
    <div style="font-size:48px;margin-bottom:16px">\u266a</div>
    <div style="font-size:24px">Ce\u00f2l</div>
    <div style="font-size:14px;opacity:0.6;margin-top:8px">Loading\u2026</div>
    </div></body></html>"""

    window = webview.create_window(
        "Ce\u00f2l",
        html=loading_html,
        width=1280,
        height=860,
        min_size=(800, 600),
    )

    def _boot():
        """Start the server in background, then redirect the window when ready."""
        import uvicorn
        import urllib.request
        import time
        from backend.main import app

        def _run_server():
            uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

        srv = threading.Thread(target=_run_server, daemon=True)
        srv.start()

        # Poll until server responds
        for _ in range(200):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1)
                break
            except Exception:
                time.sleep(0.15)

        window.load_url(f"http://127.0.0.1:{port}")

    # webview.start() blocks until the window is closed.
    # _boot runs in a webview-managed thread so the window appears instantly.
    webview.start(_boot)

    # Force-kill the process so the server thread doesn't linger.
    os._exit(0)


if __name__ == "__main__":
    main()
