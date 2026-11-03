// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "UPrompter",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "UPrompter", path: "Sources/UPrompter")
    ]
)
