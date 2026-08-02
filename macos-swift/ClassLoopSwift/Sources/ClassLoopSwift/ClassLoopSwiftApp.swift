import AppKit
import CryptoKit
import Darwin
import Security
import WebKit

private func applicationMenuItem(
  title: String,
  action: Selector?,
  keyEquivalent: String = "",
  modifiers: NSEvent.ModifierFlags = [.command]
) -> NSMenuItem {
  let item = NSMenuItem(title: title, action: action, keyEquivalent: keyEquivalent)
  item.keyEquivalentModifierMask = modifiers
  return item
}

private func makeApplicationMenu() -> NSMenu {
  let mainMenu = NSMenu(title: "ClassLoop")

  let appMenuRootItem = NSMenuItem(title: "ClassLoop", action: nil, keyEquivalent: "")
  let applicationMenu = NSMenu(title: "ClassLoop")
  applicationMenu.addItem(
    applicationMenuItem(title: "About ClassLoop", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)))
  )
  applicationMenu.addItem(.separator())
  applicationMenu.addItem(
    applicationMenuItem(title: "Hide ClassLoop", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
  )
  applicationMenu.addItem(
    applicationMenuItem(
      title: "Hide Others",
      action: #selector(NSApplication.hideOtherApplications(_:)),
      keyEquivalent: "h",
      modifiers: [.command, .option]
    )
  )
  applicationMenu.addItem(
    applicationMenuItem(title: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)))
  )
  applicationMenu.addItem(.separator())
  applicationMenu.addItem(
    applicationMenuItem(title: "Quit ClassLoop", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
  )
  appMenuRootItem.submenu = applicationMenu
  mainMenu.addItem(appMenuRootItem)

  let fileMenuItem = NSMenuItem(title: "File", action: nil, keyEquivalent: "")
  let fileMenu = NSMenu(title: "File")
  fileMenu.addItem(
    applicationMenuItem(title: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
  )
  fileMenuItem.submenu = fileMenu
  mainMenu.addItem(fileMenuItem)

  let editMenuItem = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
  let editMenu = NSMenu(title: "Edit")
  editMenu.addItem(applicationMenuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z"))
  editMenu.addItem(
    applicationMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "z", modifiers: [.command, .shift])
  )
  editMenu.addItem(.separator())
  editMenu.addItem(applicationMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
  editMenu.addItem(applicationMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
  editMenu.addItem(applicationMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
  editMenu.addItem(applicationMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
  editMenuItem.submenu = editMenu
  mainMenu.addItem(editMenuItem)

  let windowMenuItem = NSMenuItem(title: "Window", action: nil, keyEquivalent: "")
  let windowMenu = NSMenu(title: "Window")
  windowMenu.addItem(
    applicationMenuItem(title: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
  )
  windowMenu.addItem(applicationMenuItem(title: "Zoom", action: #selector(NSWindow.performZoom(_:))))
  windowMenu.addItem(.separator())
  windowMenu.addItem(
    applicationMenuItem(
      title: "Enter Full Screen",
      action: #selector(NSWindow.toggleFullScreen(_:)),
      keyEquivalent: "f",
      modifiers: [.command, .control]
    )
  )
  windowMenuItem.submenu = windowMenu
  mainMenu.addItem(windowMenuItem)
  NSApplication.shared.windowsMenu = windowMenu

  return mainMenu
}

@main
final class ClassLoopSwiftApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
  private static var retainedDelegate: ClassLoopSwiftApp?

  private var window: NSWindow?
  private var webView: WKWebView?
  private var launchSource: ClassLoopLaunchSource?
  private var localLoadGeneration = 0
  private var startupRecoveryScheduled = false

  static func main() {
    let app = NSApplication.shared
    let delegate = ClassLoopSwiftApp()
    retainedDelegate = delegate
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.mainMenu = makeApplicationMenu()
    app.run()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    let startApp = { [weak self] in
      DispatchQueue.main.async {
        self?.launchSource = ClassLoopLaunchSource.resolve()
        self?.createWindow()
      }
    }

    if ProcessInfo.processInfo.environment["CLASSLOOP_SWIFT_RESET_WEB_STORAGE"] == "1" {
      WKWebsiteDataStore.default().removeData(
        ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
        modifiedSince: .distantPast,
        completionHandler: startApp
      )
    } else {
      startApp()
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    false
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    if !flag {
      if let window {
        window.makeKeyAndOrderFront(nil)
      } else {
        launchSource = ClassLoopLaunchSource.resolve()
        createWindow()
      }
    }
    return true
  }

  private func createWindow() {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.allowsBackForwardNavigationGestures = true
    webView.navigationDelegate = self
    webView.uiDelegate = self

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "ClassLoop"
    window.isReleasedWhenClosed = false
    window.minSize = NSSize(width: 980, height: 700)
    window.backgroundColor = NSColor(red: 0.008, green: 0.031, blue: 0.090, alpha: 1)
    window.contentView = webView
    window.delegate = self
    window.center()

    self.webView = webView
    self.window = window

    if let launchSource {
      load(launchSource, in: webView)
    }

    NSApp.unhide(nil)
    window.makeKeyAndOrderFront(nil)
    window.orderFrontRegardless()
    NSApp.activate(ignoringOtherApps: true)
  }

  private func load(_ source: ClassLoopLaunchSource, in webView: WKWebView) {
    switch source {
    case .local(let appURL, _, _):
      let request = URLRequest(url: appURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
      webView.load(request)
      localLoadGeneration += 1
      let loadGeneration = localLoadGeneration

      if !startupRecoveryScheduled {
        startupRecoveryScheduled = true
        for delay in [0.75, 1.75] {
          DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self, weak webView] in
            guard let self, let webView else { return }
            self.reloadLocalAppIfUnhealthy(request: request, in: webView, generation: loadGeneration)
          }
        }
      }

      DispatchQueue.main.asyncAfter(deadline: .now() + 2.75) { [weak self, weak webView] in
        guard let self, let webView else { return }
        self.reloadLocalAppIfUnhealthy(request: request, in: webView, generation: loadGeneration)
      }
    case .hosted(let url):
      webView.load(URLRequest(url: url))
    }
  }

  private func reloadLocalAppIfUnhealthy(request: URLRequest, in webView: WKWebView, generation: Int) {
    guard localLoadGeneration == generation else { return }

    let healthCheck = """
    Boolean(
      document.body &&
      document.body.innerText &&
      document.body.innerText.includes('ClassLoop') &&
      document.getElementById('root') &&
      document.getElementById('root').children.length > 0
    )
    """
    webView.evaluateJavaScript(healthCheck) { [weak self, weak webView] result, error in
      guard
        let self,
        let webView,
        self.localLoadGeneration == generation
      else {
        return
      }

      if error == nil, (result as? Bool) == true {
        return
      }
      webView.load(request)
    }
  }

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

struct LocalApiError: Error {
  let status: String
  let message: String
}

struct LocalHttpRequest {
  let method: String
  let target: String
  let path: String
  let headers: [String: String]
  let body: Data
  let headerComplete: Bool
  let expectedByteCount: Int

  var contentType: String {
    headers["content-type"] ?? ""
  }

  init?(data: Data) {
    guard let separatorRange = data.range(of: Data("\r\n\r\n".utf8)) else {
      return nil
    }

    let headerEnd = separatorRange.upperBound
    guard let headerText = String(data: data[..<separatorRange.lowerBound], encoding: .utf8) else {
      return nil
    }
    let lines = headerText.components(separatedBy: "\r\n")
    guard let requestLine = lines.first else {
      return nil
    }
    let parts = requestLine.split(separator: " ", maxSplits: 2).map(String.init)
    guard parts.count >= 2 else {
      return nil
    }

    var parsedHeaders: [String: String] = [:]
    for line in lines.dropFirst() {
      guard let colonIndex = line.firstIndex(of: ":") else { continue }
      let key = line[..<colonIndex].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      let value = line[line.index(after: colonIndex)...].trimmingCharacters(in: .whitespacesAndNewlines)
      parsedHeaders[key] = value
    }

    let length = Int(parsedHeaders["content-length"] ?? "") ?? 0
    self.method = parts[0].uppercased()
    self.target = parts[1]
    self.path = URLComponents(string: parts[1])?.path ?? "/"
    self.headers = parsedHeaders
    self.body = data.count > headerEnd ? Data(data[headerEnd...]) : Data()
    self.headerComplete = true
    self.expectedByteCount = headerEnd + length
  }
}

final class LocalDistServer {
  let rootURL: URL
  let appURL: URL

  private let socketFD: Int32
  private let queue = DispatchQueue(label: "com.classloop.local-dist-server")
  private var dataFileReadError: String?
  private let localStateBodyMaxBytes = 8_000_000
  private let hostedProxyBodyMaxBytes = 8_000_000
  private let hostedProxyTimeoutSeconds: TimeInterval = 30
  private let hostedApiBaseURL = URL(
    string: ProcessInfo.processInfo.environment["CLASSLOOP_PUBLIC_URL"]
      ?? ProcessInfo.processInfo.environment["VITE_CLASSLOOP_PUBLIC_URL"]
      ?? "https://classloop-followup.vercel.app"
  )!
  private let hostedProxyPaths: Set<String> = [
    "/api/cloud-state",
    "/api/profile",
    "/api/billing/prepare-account",
    "/api/billing/checkout",
    "/api/billing/portal",
  ]

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

    guard let requestData = readRequestData(from: clientFD) else { return }
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

  private func readRequestData(from clientFD: Int32) -> Data? {
    var data = Data()
    var expectedByteCount: Int?
    var buffer = [UInt8](repeating: 0, count: 64 * 1024)

    while data.count <= localStateBodyMaxBytes + 64 * 1024 {
      let byteCount = buffer.withUnsafeMutableBytes { rawBuffer in
        Darwin.recv(clientFD, rawBuffer.baseAddress, rawBuffer.count, 0)
      }
      if byteCount <= 0 {
        break
      }

      data.append(buffer, count: byteCount)
      if expectedByteCount == nil, let request = LocalHttpRequest(data: data), request.headerComplete {
        expectedByteCount = request.expectedByteCount
      }
      if let expectedByteCount, data.count >= expectedByteCount {
        return data
      }
    }

    return data.isEmpty ? nil : data
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
    guard let request = LocalHttpRequest(data: requestData), request.headerComplete else {
      return httpResponse(status: "400 Bad Request", contentType: "text/plain", body: Data("Bad request".utf8))
    }

    let method = request.method
    let path = request.path
    let body = method == "HEAD" ? Data() : nil

    if path == "/api/state" {
      return stateResponse(for: request, bodyOverride: body)
    }

    if path == "/api/integrations/status" {
      guard method == "GET" || method == "HEAD" else {
        return httpResponse(status: "405 Method Not Allowed", contentType: "application/json", body: body ?? jsonData(["error": "Method not allowed."]))
      }
      let data = jsonData([
        "email": [
          "configured": false,
          "provider": "not_configured",
        ],
      ])
      return httpResponse(status: "200 OK", contentType: "application/json", body: body ?? data, declaredLength: data.count)
    }

    if path == "/api/email/send-recaps" {
      guard method == "POST" else {
        return httpResponse(status: "405 Method Not Allowed", contentType: "application/json", body: body ?? jsonData(["error": "Method not allowed."]))
      }
      let data = jsonData(["error": "Email is not configured. Set SMTP or Gmail app-password environment variables before sending."])
      return httpResponse(status: "503 Service Unavailable", contentType: "application/json", body: data)
    }

    if hostedProxyPaths.contains(path) {
      return hostedApiProxyResponse(for: request, bodyOverride: body)
    }

    if path.hasPrefix("/api/") {
      let data = jsonData(["error": "This local Swift build does not provide that hosted API endpoint."])
      return httpResponse(status: "404 Not Found", contentType: "application/json", body: body ?? data, declaredLength: data.count)
    }

    guard method == "GET" || method == "HEAD" else {
      return httpResponse(status: "405 Method Not Allowed", contentType: "application/json", body: jsonData(["error": "Method not allowed."]))
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

  private func hostedApiProxyResponse(for request: LocalHttpRequest, bodyOverride: Data?) -> Data {
    let allowedMethods: Set<String> = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]
    guard allowedMethods.contains(request.method) else {
      return httpResponse(
        status: "405 Method Not Allowed",
        contentType: "application/json",
        body: bodyOverride ?? jsonData(["error": "Method not allowed."])
      )
    }

    guard request.body.count <= hostedProxyBodyMaxBytes else {
      return httpResponse(
        status: "413 Payload Too Large",
        contentType: "application/json",
        body: bodyOverride ?? jsonData(["error": "Request body is too large."])
      )
    }

    guard
      var components = URLComponents(url: hostedApiBaseURL, resolvingAgainstBaseURL: false),
      let targetComponents = URLComponents(string: request.target)
    else {
      return httpResponse(
        status: "502 Bad Gateway",
        contentType: "application/json",
        body: bodyOverride ?? jsonData(["error": "Unable to reach the hosted ClassLoop API."])
      )
    }

    components.path = targetComponents.path.isEmpty ? request.path : targetComponents.path
    components.percentEncodedQuery = targetComponents.percentEncodedQuery

    guard let url = components.url else {
      return httpResponse(
        status: "502 Bad Gateway",
        contentType: "application/json",
        body: bodyOverride ?? jsonData(["error": "Unable to reach the hosted ClassLoop API."])
      )
    }

    var upstreamRequest = URLRequest(url: url)
    upstreamRequest.httpMethod = request.method
    if request.method != "GET", request.method != "HEAD" {
      upstreamRequest.httpBody = request.body
    }
    if let authorization = request.headers["authorization"] {
      upstreamRequest.setValue(authorization, forHTTPHeaderField: "Authorization")
    }
    if let contentType = request.headers["content-type"] {
      upstreamRequest.setValue(contentType, forHTTPHeaderField: "Content-Type")
    }
    if let accept = request.headers["accept"] {
      upstreamRequest.setValue(accept, forHTTPHeaderField: "Accept")
    }

    let semaphore = DispatchSemaphore(value: 0)
    var upstreamData = Data()
    var upstreamStatusCode: Int?
    var upstreamContentType = "application/json"
    var upstreamError: Error?

    let task = URLSession.shared.dataTask(with: upstreamRequest) { data, response, error in
      upstreamError = error
      if let httpResponse = response as? HTTPURLResponse {
        upstreamStatusCode = httpResponse.statusCode
        upstreamContentType = httpResponse.value(forHTTPHeaderField: "Content-Type") ?? upstreamContentType
      }
      upstreamData = data ?? Data()
      semaphore.signal()
    }
    task.resume()

    if semaphore.wait(timeout: .now() + .seconds(Int(hostedProxyTimeoutSeconds))) == .timedOut {
      task.cancel()
      return httpResponse(
        status: "504 Gateway Timeout",
        contentType: "application/json",
        body: bodyOverride ?? jsonData(["error": "Hosted ClassLoop API timed out."])
      )
    }

    if upstreamError != nil {
      return httpResponse(
        status: "502 Bad Gateway",
        contentType: "application/json",
        body: bodyOverride ?? jsonData(["error": "Unable to reach the hosted ClassLoop API."])
      )
    }

    guard let statusCode = upstreamStatusCode else {
      return httpResponse(
        status: "502 Bad Gateway",
        contentType: "application/json",
        body: bodyOverride ?? jsonData(["error": "Hosted ClassLoop API returned an invalid response."])
      )
    }

    return httpResponse(
      status: httpStatusLine(for: statusCode),
      contentType: upstreamContentType,
      body: bodyOverride ?? upstreamData,
      declaredLength: upstreamData.count
    )
  }

  private func stateResponse(for request: LocalHttpRequest, bodyOverride: Data?) -> Data {
    if request.method == "GET" || request.method == "HEAD" {
      let state = readDataFile()
      let data = jsonData(state)
      return httpResponse(
        status: dataFileReadError == nil ? "200 OK" : "423 Locked",
        contentType: "application/json",
        body: bodyOverride ?? data,
        declaredLength: data.count
      )
    }

    if request.method == "PUT" {
      do {
        guard request.contentType.lowercased().contains("application/json") else {
          return httpResponse(
            status: "415 Unsupported Media Type",
            contentType: "application/json",
            body: jsonData(["error": "Use application/json for this request."])
          )
        }
        guard request.body.count <= localStateBodyMaxBytes else {
          return httpResponse(
            status: "413 Payload Too Large",
            contentType: "application/json",
            body: jsonData(["error": "Request body is too large."])
          )
        }
        let payload = try parseJsonObject(request.body)
        let state = try writeDataFile(payload)
        let data = jsonData(state)
        return httpResponse(status: "200 OK", contentType: "application/json", body: data, declaredLength: data.count)
      } catch let error as LocalApiError {
        return httpResponse(status: error.status, contentType: "application/json", body: jsonData(["error": error.message]))
      } catch {
        return httpResponse(
          status: "400 Bad Request",
          contentType: "application/json",
          body: jsonData(["error": error.localizedDescription])
        )
      }
    }

    return httpResponse(
      status: "405 Method Not Allowed",
      contentType: "application/json",
      body: bodyOverride ?? jsonData(["error": "Method not allowed."])
    )
  }

  private func readDataFile(throwOnError: Bool = false) -> [String: Any] {
    do {
      let dataURL = readableDataFileURL()
      guard FileManager.default.fileExists(atPath: dataURL.path) else {
        dataFileReadError = nil
        return emptyWorkspace()
      }

      let rawData = try Data(contentsOf: dataURL)
      let stored = try parseJsonObject(rawData)
      if (stored["encrypted"] as? Bool) == true, stored["payload"] != nil {
        let state = try decryptWorkspaceState(stored)
        dataFileReadError = nil
        return state
      }
      if stored["version"] != nil, let payload = stored["payload"] as? [String: Any], (stored["encrypted"] as? Bool) == false {
        dataFileReadError = nil
        return normalizeState(payload)
      }
      dataFileReadError = nil
      return normalizeState(stored)
    } catch {
      dataFileReadError = dataReadErrorMessage(error)
      if throwOnError {
        return [
          "error": dataFileReadError ?? "Unable to read ClassLoop desktop data.",
        ]
      }
      var state = emptyWorkspace()
      state["readOnly"] = true
      state["readError"] = dataFileReadError
      return state
    }
  }

  private func writeDataFile(_ payload: [String: Any]) throws -> [String: Any] {
    if let dataFileReadError {
      throw LocalApiError(
        status: "423 Locked",
        message: "\(dataFileReadError) Fix or export the existing data file before saving new state."
      )
    }
    try validateStatePayload(payload)
    let nextState = normalizeState(payload)
    let stored = try encryptWorkspaceState(nextState)
    let data = try JSONSerialization.data(withJSONObject: stored, options: [.prettyPrinted, .sortedKeys])
    let dataURL = currentDataFileURL()
    try FileManager.default.createDirectory(at: dataURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: dataURL)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: dataURL.path)
    return nextState
  }

  private func validateStatePayload(_ payload: [String: Any]) throws {
    let allowedFields = Set([
      "accounts",
      "sessions",
      "personalMeetings",
      "draft",
      "demoLoaded",
      "classGroups",
      "rosterTemplates",
      "privacySettings",
      "auditLog",
      "billingProfile",
    ])
    let unexpectedFields = payload.keys.filter { !allowedFields.contains($0) }.sorted()
    if !unexpectedFields.isEmpty {
      throw LocalApiError(
        status: "400 Bad Request",
        message: "ClassLoop state contains unsupported field\(unexpectedFields.count == 1 ? "" : "s"): \(unexpectedFields.joined(separator: ", "))."
      )
    }
    for key in ["accounts", "sessions", "personalMeetings", "classGroups", "rosterTemplates", "auditLog"] {
      if payload[key] != nil, !(payload[key] is [Any]) {
        throw LocalApiError(status: "400 Bad Request", message: "ClassLoop state.\(key) must be an array.")
      }
    }
    for key in ["privacySettings", "billingProfile"] {
      if payload[key] != nil, !(payload[key] is [String: Any]) {
        throw LocalApiError(status: "400 Bad Request", message: "ClassLoop state.\(key) must be an object.")
      }
    }
  }

  private func normalizeState(_ payload: [String: Any]) -> [String: Any] {
    [
      "accounts": payload["accounts"] as? [Any] ?? [],
      "sessions": payload["sessions"] as? [Any] ?? [],
      "personalMeetings": payload["personalMeetings"] as? [Any] ?? [],
      "draft": payload["draft"] ?? NSNull(),
      "demoLoaded": payload["demoLoaded"] as? Bool ?? false,
      "classGroups": payload["classGroups"] as? [Any] ?? [],
      "rosterTemplates": payload["rosterTemplates"] as? [Any] ?? [],
      "privacySettings": payload["privacySettings"] ?? NSNull(),
      "auditLog": payload["auditLog"] as? [Any] ?? [],
      "billingProfile": payload["billingProfile"] ?? NSNull(),
      "updatedAt": ISO8601DateFormatter().string(from: Date()),
    ]
  }

  private func emptyWorkspace() -> [String: Any] {
    normalizeState([:])
  }

  private func encryptWorkspaceState(_ state: [String: Any]) throws -> [String: Any] {
    let key = try readClassLoopDataKey()
    let plainData = try JSONSerialization.data(withJSONObject: state)
    let sealed = try AES.GCM.seal(plainData, using: key)
    return [
      "version": 2,
      "encrypted": true,
      "algorithm": "aes-256-gcm",
      "key": ".classloop-storage-key",
      "iv": Data(sealed.nonce).base64EncodedString(),
      "authTag": sealed.tag.base64EncodedString(),
      "payload": sealed.ciphertext.base64EncodedString(),
    ]
  }

  private func decryptWorkspaceState(_ stored: [String: Any]) throws -> [String: Any] {
    guard
      stored["algorithm"] as? String == "aes-256-gcm",
      let iv = stored["iv"] as? String,
      let authTag = stored["authTag"] as? String,
      let payload = stored["payload"] as? String,
      let nonceData = Data(base64Encoded: iv),
      let tagData = Data(base64Encoded: authTag),
      let payloadData = Data(base64Encoded: payload)
    else {
      throw LocalApiError(
        status: "423 Locked",
        message: "ClassLoop found an older OS-keychain encrypted data file. To avoid password prompts, ClassLoop will not open it automatically. Keep a backup and move it aside to start fresh."
      )
    }

    let box = try AES.GCM.SealedBox(
      nonce: try AES.GCM.Nonce(data: nonceData),
      ciphertext: payloadData,
      tag: tagData
    )
    let plainData = try AES.GCM.open(box, using: try readClassLoopDataKey(createIfMissing: false))
    return normalizeState(try parseJsonObject(plainData))
  }

  private func readClassLoopDataKey(createIfMissing: Bool = true) throws -> SymmetricKey {
    let keyURL = currentDataKeyURL()
    if FileManager.default.fileExists(atPath: keyURL.path) {
      let raw = try String(contentsOf: keyURL, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
      let keyValue: String
      if raw.hasPrefix("{") {
        keyValue = (try parseJsonObject(Data(raw.utf8))["key"] as? String) ?? ""
      } else {
        keyValue = raw
      }
      guard let keyData = Data(base64Encoded: keyValue), keyData.count == 32 else {
        throw LocalApiError(status: "423 Locked", message: "ClassLoop desktop storage key is invalid.")
      }
      return SymmetricKey(data: keyData)
    }

    guard createIfMissing else {
      throw LocalApiError(status: "423 Locked", message: "ClassLoop desktop storage key is missing.")
    }

    var bytes = [UInt8](repeating: 0, count: 32)
    let result = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    guard result == errSecSuccess else {
      throw LocalApiError(status: "500 Internal Server Error", message: "Unable to create ClassLoop desktop storage key.")
    }
    let keyData = Data(bytes)
    let keyFile = [
      "version": 1,
      "algorithm": "aes-256-gcm",
      "key": keyData.base64EncodedString(),
    ] as [String: Any]
    let data = try JSONSerialization.data(withJSONObject: keyFile, options: [.prettyPrinted, .sortedKeys])
    try FileManager.default.createDirectory(at: keyURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: keyURL)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: keyURL.path)
    return SymmetricKey(data: keyData)
  }

  private func currentDataFileURL() -> URL {
    let environment = ProcessInfo.processInfo.environment
    if let requested = environment["CLASSLOOP_USER_DATA_DIR"], !requested.isEmpty {
      return URL(fileURLWithPath: requested, isDirectory: true).appendingPathComponent(".classloop-data.json")
    }
    return applicationSupportURL().appendingPathComponent(".classloop-data.json")
  }

  private func currentDataKeyURL() -> URL {
    currentDataFileURL().deletingLastPathComponent().appendingPathComponent(".classloop-storage-key")
  }

  private func readableDataFileURL() -> URL {
    let dataURL = currentDataFileURL()
    if FileManager.default.fileExists(atPath: dataURL.path) {
      return dataURL
    }
    let legacyURL = rootURL.deletingLastPathComponent().appendingPathComponent(".classloop-data.json")
    if FileManager.default.fileExists(atPath: legacyURL.path) {
      return legacyURL
    }
    return dataURL
  }

  private func applicationSupportURL() -> URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support", isDirectory: true)
    return base.appendingPathComponent("ClassLoop", isDirectory: true)
  }

  private func parseJsonObject(_ data: Data) throws -> [String: Any] {
    guard
      let value = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      throw LocalApiError(status: "400 Bad Request", message: "Request body must be valid JSON.")
    }
    return value
  }

  private func dataReadErrorMessage(_ error: Error) -> String {
    "Unable to read ClassLoop desktop data. \(error.localizedDescription)"
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

  private func httpStatusLine(for statusCode: Int) -> String {
    "\(statusCode) \(httpReasonPhrase(for: statusCode))"
  }

  private func httpReasonPhrase(for statusCode: Int) -> String {
    switch statusCode {
    case 200:
      return "OK"
    case 201:
      return "Created"
    case 204:
      return "No Content"
    case 400:
      return "Bad Request"
    case 401:
      return "Unauthorized"
    case 403:
      return "Forbidden"
    case 404:
      return "Not Found"
    case 405:
      return "Method Not Allowed"
    case 409:
      return "Conflict"
    case 413:
      return "Payload Too Large"
    case 415:
      return "Unsupported Media Type"
    case 422:
      return "Unprocessable Entity"
    case 429:
      return "Too Many Requests"
    case 500:
      return "Internal Server Error"
    case 502:
      return "Bad Gateway"
    case 503:
      return "Service Unavailable"
    case 504:
      return "Gateway Timeout"
    default:
      return "OK"
    }
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
