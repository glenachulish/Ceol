"""Ceol server — started by the native Swift launcher (CeolApp)."""
import sys
import os
import socket
from pathlib import Path


def main():
    if getattr(sys, "frozen", False):
        # sys._MEIPASS is the correct path to bundled data files.
        # PyInstaller 6.x puts them in _internal/, so we must always use
        # sys._MEIPASS directly rather than relying on the Swift-passed value.
        base_dir = Path(sys._MEIPASS)
        os.environ["CEOL_BASE_DIR"] = str(base_dir)

    data_dir = os.environ.get("CEOL_DATA_DIR")
    if data_dir:
        Path(data_dir).mkdir(parents=True, exist_ok=True)

    import uvicorn
    from backend.main import app

    port = int(os.environ.get("CEOL_PORT", 0))
    if port == 0:
        with socket.socket() as s:
            s.bind(("", 0))
            port = s.getsockname()[1]
        print(f"Ceol server on port {port}")

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
