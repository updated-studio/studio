// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "UPrompter",
    platforms: [.macOS(.v14)],
    dependencies: [
        // Mac'in üzerinde çalışan Whisper (konuşma tanıma); internet yalnız ilk model indirmede.
        .package(url: "https://github.com/argmaxinc/WhisperKit", exact: "1.1.1"),
    ],
    targets: [
        .executableTarget(
            name: "UPrompter",
            dependencies: [.product(name: "WhisperKit", package: "WhisperKit")],
            path: "Sources/UPrompter"
        )
    ]
)
