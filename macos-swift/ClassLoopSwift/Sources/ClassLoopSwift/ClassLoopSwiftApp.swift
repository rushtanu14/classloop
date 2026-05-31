import AppKit
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
      return "Native Swift preview using the local ClassLoop web build"
    case .hosted:
      return "Native Swift preview using the hosted ClassLoop shell"
    }
  }

  func openCurrentSource() {
    NSWorkspace.shared.open(launchSource.externalURL)
  }
}

enum ClassLoopLaunchSource {
  case local(indexURL: URL, readAccessURL: URL)
  case hosted(URL)

  static func resolve() -> ClassLoopLaunchSource {
    let fileManager = FileManager.default
    let environment = ProcessInfo.processInfo.environment
    let currentDirectory = URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true)
    let explicitDist = environment["CLASSLOOP_SWIFT_LOCAL_DIST"].map { URL(fileURLWithPath: $0, isDirectory: true) }

    let candidateDistDirectories = [
      explicitDist,
      currentDirectory.appendingPathComponent("dist", isDirectory: true),
      currentDirectory.appendingPathComponent("../../dist", isDirectory: true).standardizedFileURL,
      currentDirectory.appendingPathComponent("../../../dist", isDirectory: true).standardizedFileURL,
    ].compactMap { $0 }

    for distURL in candidateDistDirectories {
      let indexURL = distURL.appendingPathComponent("index.html")
      if fileManager.fileExists(atPath: indexURL.path) {
        return .local(indexURL: indexURL, readAccessURL: distURL)
      }
    }

    return .hosted(URL(string: "https://classloop-followup.vercel.app/#/dashboard")!)
  }

  var externalURL: URL {
    switch self {
    case .local(_, let readAccessURL):
      return readAccessURL
    case .hosted(let url):
      return url
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
    load(model.launchSource, in: webView)
    return webView
  }

  func updateNSView(_ webView: WKWebView, context: Context) {
    if context.coordinator.reloadRequested != model.reloadRequested {
      context.coordinator.reloadRequested = model.reloadRequested
      webView.reload()
    }
  }

  private func load(_ source: ClassLoopLaunchSource, in webView: WKWebView) {
    switch source {
    case .local(let indexURL, let readAccessURL):
      webView.loadFileURL(indexURL, allowingReadAccessTo: readAccessURL)
    case .hosted(let url):
      webView.load(URLRequest(url: url))
    }
  }

  final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
    var reloadRequested = false

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
