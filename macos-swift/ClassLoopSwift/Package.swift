// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "ClassLoopSwift",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(name: "ClassLoopSwift", targets: ["ClassLoopSwift"])
  ],
  targets: [
    .executableTarget(
      name: "ClassLoopSwift",
      path: "Sources/ClassLoopSwift"
    )
  ]
)
