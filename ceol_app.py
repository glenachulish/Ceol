import sys
import threading
import time
import webbrowser
import socket
import os
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

    from backend.main import app
    import uvicorn

    port = _find_port()

    def _start():
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

    t = threading.Thread(target=_start, daemon=True)
    t.start()
    time.sleep(3)
    webbrowser.open(f"http://127.0.0.1:{port}")
    t.join()

if __name__ == "__main__":
    main()
