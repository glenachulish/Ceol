import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var serverProcess: Process?
    var port: Int = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Find a free port
        port = findFreePort()

        // Start the Python server
        let bundle = Bundle.main
        let serverPath = bundle.resourcePath! + "/server/ceol_server"

        let dataDir = NSHomeDirectory() + "/Library/Application Support/Ceol"
        try? FileManager.default.createDirectory(
            atPath: dataDir, withIntermediateDirectories: true)

        serverProcess = Process()
        serverProcess!.executableURL = URL(fileURLWithPath: serverPath)
        serverProcess!.environment = ProcessInfo.processInfo.environment.merging([
            "CEOL_PORT": String(port),
            "CEOL_DATA_DIR": dataDir,
            "CEOL_BASE_DIR": bundle.resourcePath! + "/server",
        ]) { _, new in new }

        // Suppress server stdout/stderr from appearing
        serverProcess!.standardOutput = FileHandle.nullDevice
        serverProcess!.standardError = FileHandle.nullDevice

        do {
            try serverProcess!.run()
        } catch {
            let alert = NSAlert()
            alert.messageText = "Failed to start server"
            alert.informativeText = error.localizedDescription
            alert.runModal()
            NSApp.terminate(nil)
            return
        }

        // Create window immediately with loading screen
        setupWindow()

        // Poll for server readiness in background
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.waitForServerAndLoad()
        }
    }

    func setupWindow() {
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 860)
        let w: CGFloat = min(1280, screenFrame.width * 0.85)
        let h: CGFloat = min(860, screenFrame.height * 0.85)
        let x = screenFrame.origin.x + (screenFrame.width - w) / 2
        let y = screenFrame.origin.y + (screenFrame.height - h) / 2

        window = NSWindow(
            contentRect: NSRect(x: x, y: y, width: w, height: h),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Ce\u{00F2}l"
        window.minSize = NSSize(width: 800, height: 600)

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        window.contentView!.addSubview(webView)

        // Show loading screen
        let loadingHTML = """
        <!DOCTYPE html>
        <html><body style="background:#1a1a2e;color:#fff;font-family:system-ui;
        display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
        <div style="font-size:48px;margin-bottom:16px">\u{266A}</div>
        <div style="font-size:24px">Ce\u{00F2}l</div>
        <div style="font-size:14px;opacity:0.6;margin-top:8px">Loading\u{2026}</div>
        </div></body></html>
        """
        webView.loadHTMLString(loadingHTML, baseURL: nil)

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func waitForServerAndLoad() {
        let url = URL(string: "http://127.0.0.1:\(port)/")!
        let session = URLSession(configuration: .ephemeral)

        for _ in 0..<200 {  // up to ~30 seconds
            let sem = DispatchSemaphore(value: 0)
            var ok = false
            let task = session.dataTask(with: url) { _, response, _ in
                if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                    ok = true
                }
                sem.signal()
            }
            task.resume()
            _ = sem.wait(timeout: .now() + 2)
            if ok {
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
                    self.webView.load(URLRequest(url: url))
                }
                return
            }
            Thread.sleep(forTimeInterval: 0.15)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        serverProcess?.terminate()
        serverProcess?.waitUntilExit()
    }

    func findFreePort() -> Int {
        let sock = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        defer { Darwin.close(sock) }

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = 0
        addr.sin_addr.s_addr = UInt32(INADDR_LOOPBACK).bigEndian

        var addrLen = socklen_t(MemoryLayout<sockaddr_in>.size)
        withUnsafeMutablePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { ptr in
                bind(sock, ptr, addrLen)
                getsockname(sock, ptr, &addrLen)
            }
        }
        return Int(UInt16(bigEndian: addr.sin_port))
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
