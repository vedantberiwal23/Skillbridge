// Apple Object Capture helper.
//
// The mesh stage of the reconstruction pipeline on macOS. COLMAP owns sparse
// structure-from-motion everywhere, but its dense stage (patch_match_stereo) is a
// CUDA-only code path and macOS has no CUDA runtime -- so on this platform the
// step that turns registered cameras into an actual mesh runs through RealityKit's
// PhotogrammetrySession instead.
//
// Driven as a subprocess from Python rather than via a binding: PhotogrammetrySession
// is an async Swift API with a long-running output stream, and a subprocess boundary
// keeps that entirely out of the pipeline's process.
//
// Two subcommands:
//   probe                      report support, as JSON, without doing any work
//   reconstruct <in> <out>     build a model from a directory of images
//
// Output is JSON on stdout so the Python side never parses human-readable text.

import Foundation
import RealityKit

struct Report: Encodable {
    var supported: Bool
    var reason: String?
    var progress: Double?
    var output: String?
}

func emit(_ report: Report) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    if let data = try? encoder.encode(report), let text = String(data: data, encoding: .utf8) {
        print(text)
    }
}

func fail(_ reason: String) -> Never {
    emit(Report(supported: false, reason: reason))
    exit(1)
}

@main
struct ObjectCaptureHelper {

    static func main() async {
        var args = Array(CommandLine.arguments.dropFirst())
        guard let command = args.first else {
            fail("usage: object-capture-helper (probe | reconstruct <input-dir> <output-file>)")
        }
        args = Array(args.dropFirst())

        guard #available(macOS 12.0, *) else {
            fail("PhotogrammetrySession requires macOS 12 or later.")
        }

        switch command {
        case "probe":
            // isSupported is a hardware question, not an OS-version question: it
            // depends on the GPU and available memory, which is exactly why this
            // cannot be answered from Python by checking a version number.
            let supported = PhotogrammetrySession.isSupported
            emit(Report(
                supported: supported,
                reason: supported ? nil : "PhotogrammetrySession.isSupported is false on this hardware."
            ))
            exit(supported ? 0 : 1)

        case "reconstruct":
            guard args.count >= 2 else {
                fail("usage: reconstruct <input-dir> <output-file> [preview|reduced|medium|full|raw]")
            }
            guard PhotogrammetrySession.isSupported else {
                fail("PhotogrammetrySession is not supported on this hardware.")
            }

            let input = URL(fileURLWithPath: args[0], isDirectory: true)
            let output = URL(fileURLWithPath: args[1])
            let detail = Self.detail(named: args.count > 2 ? args[2] : "medium")

            do {
                var configuration = PhotogrammetrySession.Configuration()
                configuration.featureSensitivity = .high
                configuration.sampleOrdering = .unordered

                let session = try PhotogrammetrySession(input: input, configuration: configuration)
                try session.process(requests: [.modelFile(url: output, detail: detail)])

                for try await update in session.outputs {
                    switch update {
                    case .requestProgress(_, let fraction):
                        // Progress goes to stderr so stdout stays a single JSON document.
                        FileHandle.standardError.write("progress \(fraction)\n".data(using: .utf8)!)
                    case .requestComplete:
                        emit(Report(supported: true, output: output.path))
                        exit(0)
                    case .requestError(_, let error):
                        fail("reconstruction failed: \(error.localizedDescription)")
                    case .processingComplete:
                        exit(0)
                    case .invalidSample(let id, let reason):
                        FileHandle.standardError.write("invalid sample \(id): \(reason)\n".data(using: .utf8)!)
                    default:
                        break
                    }
                }
                fail("session ended without producing a model.")
            } catch {
                fail("session error: \(error.localizedDescription)")
            }

        default:
            fail("unknown command: \(command)")
        }
    }

    @available(macOS 12.0, *)
    static func detail(named name: String) -> PhotogrammetrySession.Request.Detail {
        switch name {
        case "preview": return .preview
        case "reduced": return .reduced
        case "full": return .full
        case "raw": return .raw
        default: return .medium
        }
    }
}
