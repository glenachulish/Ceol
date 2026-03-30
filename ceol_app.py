import sys, threading, time, webbrowser, socket, os
from pathlib import Path
import uvicorn

def _find_port():
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]

def _start_server(port):
    uvicorn.run("backend.main:app", host="127.0.0.1", port=port, log_level="warning")

def main():
    if getattr(sys, "frozen", False):
        data_dir = Path.home() / "Library" / "Application Support" / "Ceol"
        data_dir.mkdir(parents=True, exist_ok=True)
        os.environ["CEOL_DATA_DIR"] = str(data_dir)

    port = _find_port()
    t = threading.Thread(target=_start_server, args=(port,), daemon=True)
    t.start()
    time.sleep(2)
    webbrowser.open(f"http://127.0.0.1:{port}")
    t.join()

if __name__ == "__main__":
    main()
