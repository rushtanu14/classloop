import AppKit
import Darwin
import SwiftUI
import WebKit

@main
struct ClassLoopSwiftApp: App {
  @StateObject private var model = ClassLoopAppModel()

  var body: some Scene {
    WindowGroup {
      ClassLoopWindow(model: model)
        .frame(minWidth: 1100, minHeight: 740)
    }
    .windowStyle(.titleBar)
    .commands {
      CommandGroup(replacing: .newItem) {}
    }
  }
}

struct ClassLoopWindow: View {
  @ObservedObject var model: ClassLoopAppModel

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 12) {
        Image(systemName: "brain.head.profile")
          .font(.system(size: 20, weight: .semibold))
          .foregroundStyle(.teal)
        VStack(alignment: .leading, spacing: 2) {
          Text("ClassLoop")
            .font(.headline)
          Text(model.sourceDescription)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Button {
          model.reloadRequested.toggle()
        } label: {
          Label("Reload", systemImage: "arrow.clockwise")
        }
        Button {
          model.openCurrentSource()
        } label: {
          Label("Open in Browser", systemImage: "safari")
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 10)

      Divider()

      ClassLoopWebView(model: model)
    }
  }
}

final class ClassLoopAppModel: ObservableObject {
  @Published var reloadRequested = false

  let launchSource: ClassLoopLaunchSource

  init() {
    self.launchSource = ClassLoopLaunchSource.resolve()
  }

  var sourceDescription: String {
    switch launchSource {
    case .local:
      return "Native Swift macOS app using the bundled ClassLoop build"
    case .hosted:
      return "Native Swift macOS app using the hosted ClassLoop shell"
    }
  }

  func openCurrentSource() {
    NSWorkspace.shared.open(launchSource.externalURL)
  }
}

enum ClassLoopLaunchSource {
  case local(appURL: URL, externalURL: URL, server: LocalDistServer)
  case hosted(URL)

  static func resolve() -> ClassLoopLaunchSource {
    let fileManager = FileManager.default
    let environment = ProcessInfo.processInfo.environment
    let currentDirectory = URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true)
    let explicitDist = environment["CLASSLOOP_SWIFT_LOCAL_DIST"].map { URL(fileURLWithPath: $0, isDirectory: true) }
    let bundledDist = Bundle.main.resourceURL?.appendingPathComponent("dist", isDirectory: true)
    let executableResourceDist = URL(fileURLWithPath: CommandLine.arguments[0])
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Resources", isDirectory: true)
      .appendingPathComponent("dist", isDirectory: true)

    let candidateDistDirectories = [
      explicitDist,
      bundledDist,
      executableResourceDist,
      currentDirectory.appendingPathComponent("dist", isDirectory: true),
      currentDirectory.appendingPathComponent("../../dist", isDirectory: true).standardizedFileURL,
      currentDirectory.appendingPathComponent("../../../dist", isDirectory: true).standardizedFileURL,
    ].compactMap { $0 }

    for distURL in candidateDistDirectories {
      let indexURL = distURL.appendingPathComponent("index.html")
      if fileManager.fileExists(atPath: indexURL.path) {
        if let server = LocalDistServer(rootURL: distURL) {
          return .local(appURL: server.appURL, externalURL: distURL, server: server)
        }
      }
    }

    return .hosted(URL(string: "https://classloop-followup.vercel.app/#/dashboard")!)
  }

  var externalURL: URL {
    switch self {
    case .local(_, let externalURL, _):
      return externalURL
    case .hosted(let url):
      return url
    }
  }
}

final class LocalDistServer {
  let rootURL: URL
  let appURL: URL

  private let socketFD: Int32
  private let queue = DispatchQueue(label: "com.classloop.local-dist-server")

  init?(rootURL: URL) {
    let standardizedRoot = rootURL.standardizedFileURL
    guard FileManager.default.fileExists(atPath: standardizedRoot.appendingPathComponent("index.html").path) else {
      return nil
    }

    guard let listenerConfig = Self.makeSocket() else {
      return nil
    }

    self.socketFD = listenerConfig.socketFD
    self.rootURL = standardizedRoot
    self.appURL = URL(string: "http://127.0.0.1:\(listenerConfig.port)/#/dashboard")!

    queue.async { [weak self] in
      self?.acceptLoop()
    }
  }

  deinit {
    Darwin.close(socketFD)
  }

  private func acceptLoop() {
    while true {
      let clientFD = Darwin.accept(socketFD, nil, nil)
      if clientFD < 0 {
        break
      }
      handle(clientFD)
    }
  }

  private func handle(_ clientFD: Int32) {
    defer { Darwin.close(clientFD) }

    var noSigPipe: Int32 = 1
    setsockopt(clientFD, SOL_SOCKET, SO_NOSIGPIPE, &noSigPipe, socklen_t(MemoryLayout<Int32>.size))

    var buffer = [UInt8](repeating: 0, count: 64 * 1024)
    let byteCount = buffer.withUnsafeMutableBytes { rawBuffer in
      Darwin.recv(clientFD, rawBuffer.baseAddress, rawBuffer.count, 0)
    }
    guard byteCount > 0 else { return }

    let requestData = Data(buffer.prefix(byteCount))
    let response = self.response(for: requestData)
    response.withUnsafeBytes { rawBuffer in
      guard let baseAddress = rawBuffer.baseAddress else { return }
      var sent = 0
      while sent < rawBuffer.count {
        let result = Darwin.send(clientFD, baseAddress.advanced(by: sent), rawBuffer.count - sent, 0)
        if result <= 0 {
          break
        }
        sent += result
      }
    }
  }

  private static func makeSocket() -> (socketFD: Int32, port: Int)? {
    let candidates = [51731, 51732, 51733, 51734, 51735] + (0..<20).map { _ in Int.random(in: 49152...65535) }
    for candidate in candidates {
      let fd = Darwin.socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
      if fd < 0 {
        continue
      }

      var reuse: Int32 = 1
      setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))

      var address = sockaddr_in()
      address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
      address.sin_family = sa_family_t(AF_INET)
      address.sin_port = in_port_t(candidate).bigEndian
      address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))

      let bindResult = withUnsafePointer(to: &address) { pointer in
        pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
          Darwin.bind(fd, socketAddress, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
      }

      if bindResult == 0 && Darwin.listen(fd, SOMAXCONN) == 0 {
        return (fd, candidate)
      }

      Darwin.close(fd)
    }
    return nil
  }

  private func response(for requestData: Data) -> Data {
    guard
      let request = String(data: requestData, encoding: .utf8),
      let requestLine = request.components(separatedBy: "\r\n").first
    else {
      return httpResponse(status: "400 Bad Request", contentType: "text/plain", body: Data("Bad request".utf8))
    }

    let parts = requestLine.split(separator: " ", maxSplits: 2).map(String.init)
    guard parts.count >= 2 else {
      return httpResponse(status: "400 Bad Request", contentType: "text/plain", body: Data("Bad request".utf8))
    }

    let method = parts[0].uppercased()
    guard method == "GET" || method == "HEAD" else {
      return httpResponse(status: "405 Method Not Allowed", contentType: "application/json", body: jsonData(["error": "Method not allowed."]))
    }

    let target = parts[1]
    let path = URLComponents(string: target)?.path ?? "/"
    let body = method == "HEAD" ? Data() : nil

    if path == "/api/integrations/status" {
      let data = jsonData([
        "email": [
          "configured": false,
          "provider": "not_configured",
        ],
      ])
      return httpResponse(status: "200 OK", contentType: "application/json", body: body ?? data, declaredLength: data.count)
    }

    if path.hasPrefix("/api/") {
      let data = jsonData(["error": "This local Swift build does not provide that hosted API endpoint."])
      return httpResponse(status: "404 Not Found", contentType: "application/json", body: body ?? data, declaredLength: data.count)
    }

    guard let fileURL = fileURL(for: path) else {
      return httpResponse(status: "404 Not Found", contentType: "text/plain", body: body ?? Data("Not found".utf8))
    }

    do {
      let fileData = try Data(contentsOf: fileURL)
      return httpResponse(
        status: "200 OK",
        contentType: mimeType(for: fileURL.pathExtension),
        body: body ?? fileData,
        declaredLength: fileData.count
      )
    } catch {
      return httpResponse(status: "500 Internal Server Error", contentType: "text/plain", body: body ?? Data("Unable to read asset".utf8))
    }
  }

  private func fileURL(for path: String) -> URL? {
    let relativePath = path == "/" ? "index.html" : String(path.dropFirst())
    guard let decodedPath = relativePath.removingPercentEncoding else {
      return nil
    }

    let candidate = rootURL.appendingPathComponent(decodedPath).standardizedFileURL
    let rootPath = rootURL.path.hasSuffix("/") ? rootURL.path : "\(rootURL.path)/"
    guard candidate.path.hasPrefix(rootPath), FileManager.default.fileExists(atPath: candidate.path) else {
      return nil
    }
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: candidate.path, isDirectory: &isDirectory), !isDirectory.boolValue else {
      return nil
    }
    return candidate
  }

  private func httpResponse(status: String, contentType: String, body: Data, declaredLength: Int? = nil) -> Data {
    var response = Data()
    let headers = [
      "HTTP/1.1 \(status)",
      "Content-Type: \(contentType)",
      "Content-Length: \(declaredLength ?? body.count)",
      "Cache-Control: no-store",
      "X-Content-Type-Options: nosniff",
      "Connection: close",
      "",
      "",
    ].joined(separator: "\r\n")
    response.append(Data(headers.utf8))
    response.append(body)
    return response
  }

  private func jsonData(_ value: Any) -> Data {
    (try? JSONSerialization.data(withJSONObject: value, options: [])) ?? Data("{}".utf8)
  }

  private func mimeType(for fileExtension: String) -> String {
    switch fileExtension.lowercased() {
    case "css":
      return "text/css"
    case "html":
      return "text/html"
    case "js":
      return "text/javascript"
    case "json", "webmanifest":
      return "application/json"
    case "png":
      return "image/png"
    case "svg":
      return "image/svg+xml"
    case "ico":
      return "image/x-icon"
    default:
      return "application/octet-stream"
    }
  }
}

struct ClassLoopWebView: NSViewRepresentable {
  @ObservedObject var model: ClassLoopAppModel

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeNSView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.allowsBackForwardNavigationGestures = true
    webView.navigationDelegate = context.coordinator
    webView.uiDelegate = context.coordinator
    load(model.launchSource, in: webView, coordinator: context.coordinator)
    return webView
  }

  func updateNSView(_ webView: WKWebView, context: Context) {
    if context.coordinator.reloadRequested != model.reloadRequested {
      context.coordinator.reloadRequested = model.reloadRequested
      load(model.launchSource, in: webView, coordinator: context.coordinator)
    }
  }

  private func load(_ source: ClassLoopLaunchSource, in webView: WKWebView, coordinator: Coordinator) {
    switch source {
    case .local(let appURL, _, _):
      let request = URLRequest(url: appURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
      webView.load(request)
      coordinator.localLoadGeneration += 1
      let loadGeneration = coordinator.localLoadGeneration

      if !coordinator.startupRecoveryScheduled {
        coordinator.startupRecoveryScheduled = true
        for delay in [0.75, 1.75] {
          DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak webView] in
            webView?.load(request)
          }
        }
      }

      DispatchQueue.main.asyncAfter(deadline: .now() + 2.75) { [weak webView, weak coordinator] in
        guard
          let webView,
          let coordinator,
          coordinator.localLoadGeneration == loadGeneration
        else {
          return
        }

        let healthCheck = "Boolean(document.body && document.body.innerText && document.body.innerText.includes('ClassLoop'))"
        webView.evaluateJavaScript(healthCheck) { result, error in
          guard coordinator.localLoadGeneration == loadGeneration else { return }
          if error == nil, (result as? Bool) == true {
            return
          }
          webView.load(request)
        }
      }
    case .hosted(let url):
      webView.load(URLRequest(url: url))
    }
  }

  final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
    var reloadRequested = false
    var localLoadGeneration = 0
    var startupRecoveryScheduled = false

    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationAction: WKNavigationAction,
      decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
      guard let url = navigationAction.request.url else {
        decisionHandler(.allow)
        return
      }

      if shouldOpenExternally(url, from: webView.url) {
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
        return
      }

      decisionHandler(.allow)
    }

    func webView(
      _ webView: WKWebView,
      createWebViewWith configuration: WKWebViewConfiguration,
      for navigationAction: WKNavigationAction,
      windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
      if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
        NSWorkspace.shared.open(url)
      }
      return nil
    }

    private func shouldOpenExternally(_ url: URL, from currentURL: URL?) -> Bool {
      guard let scheme = url.scheme?.lowercased() else { return false }
      if scheme == "mailto" { return true }
      guard scheme == "http" || scheme == "https" else { return false }

      let allowedHosts = Set([
        "classloop-followup.vercel.app",
        "localhost",
        "127.0.0.1",
      ])
      guard let host = url.host?.lowercased() else { return false }
      if allowedHosts.contains(host) { return false }
      if currentURL?.isFileURL == true, url.host == nil { return false }
      return true
    }
  }
}
