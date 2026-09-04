import CoreGraphics
import CoreText
import Foundation

private let repositoryRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
private let fontURL = repositoryRoot.appendingPathComponent("packages/web-ui/brand/fonts/SpaceGrotesk-Bold.ttf")
private let outputRoot = repositoryRoot.appendingPathComponent("packages/web-ui/brand/exports/svg")

guard
  let provider = CGDataProvider(url: fontURL as CFURL),
  let graphicsFont = CGFont(provider)
else {
  fatalError("Unable to load \(fontURL.path)")
}

private let brandFont = CTFontCreateWithGraphicsFont(graphicsFont, 96, nil, nil)
private let upperMarkPath = "M416 76H184C113 76 76 115 76 177C76 232 111 265 180 282L215 291L236 216L185 207C160 201 149 191 149 174C149 154 165 144 193 144H382L416 76Z"
private let lowerMarkPath = "M258 302L331 319C354 325 365 335 365 351C365 371 350 382 323 382H92L126 450H334C402 450 438 411 438 348C438 291 403 260 338 244L279 226L258 302Z"

private struct TextOutline {
  let path: String
  let width: CGFloat
}

private func scalar(_ number: CGFloat) -> String {
  var value = String(format: "%.2f", Double(number))
  while value.contains(".") && value.last == "0" { value.removeLast() }
  if value.last == "." { value.removeLast() }
  return value == "-0" ? "0" : value
}

private func pathData(_ path: CGPath) -> String {
  var commands: [String] = []
  path.applyWithBlock { pointer in
    let element = pointer.pointee
    switch element.type {
    case .moveToPoint:
      commands.append("M\(scalar(element.points[0].x)) \(scalar(element.points[0].y))")
    case .addLineToPoint:
      commands.append("L\(scalar(element.points[0].x)) \(scalar(element.points[0].y))")
    case .addQuadCurveToPoint:
      commands.append("Q\(scalar(element.points[0].x)) \(scalar(element.points[0].y)) \(scalar(element.points[1].x)) \(scalar(element.points[1].y))")
    case .addCurveToPoint:
      commands.append("C\(scalar(element.points[0].x)) \(scalar(element.points[0].y)) \(scalar(element.points[1].x)) \(scalar(element.points[1].y)) \(scalar(element.points[2].x)) \(scalar(element.points[2].y))")
    case .closeSubpath:
      commands.append("Z")
    @unknown default:
      break
    }
  }
  return commands.joined(separator: "")
}

private func outline(_ text: String, x: CGFloat, baseline: CGFloat) -> TextOutline {
  let attributes = [NSAttributedString.Key(kCTFontAttributeName as String): brandFont]
  let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
  let width = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
  var paths: [String] = []

  for case let run as CTRun in CTLineGetGlyphRuns(line) as NSArray {
    let count = CTRunGetGlyphCount(run)
    var glyphs = Array(repeating: CGGlyph(), count: count)
    var positions = Array(repeating: CGPoint.zero, count: count)
    glyphs.withUnsafeMutableBufferPointer { buffer in
      CTRunGetGlyphs(run, CFRange(location: 0, length: 0), buffer.baseAddress!)
    }
    positions.withUnsafeMutableBufferPointer { buffer in
      CTRunGetPositions(run, CFRange(location: 0, length: 0), buffer.baseAddress!)
    }

    for index in 0..<count {
      var transform = CGAffineTransform(
        a: 1,
        b: 0,
        c: 0,
        d: -1,
        tx: x + positions[index].x,
        ty: baseline - positions[index].y
      )
      if let glyphPath = CTFontCreatePathForGlyph(brandFont, glyphs[index], &transform) {
        paths.append(pathData(glyphPath))
      }
    }
  }

  return TextOutline(path: paths.joined(), width: width)
}

private func xmlEscaped(_ value: String) -> String {
  value
    .replacingOccurrences(of: "&", with: "&amp;")
    .replacingOccurrences(of: "<", with: "&lt;")
    .replacingOccurrences(of: ">", with: "&gt;")
}

private func lockup(product: String, filename: String, color: String = "#22221d", accent: String = "#697c37") throws {
  let baseline: CGFloat = 112
  let makeOutline = outline("Make ", x: 4, baseline: baseline)
  let productOutline = outline(product, x: 4 + makeOutline.width, baseline: baseline)
  let aOutline = outline(" a", x: 4 + makeOutline.width + productOutline.width, baseline: baseline)
  let prefixWidth = makeOutline.width + productOutline.width + aOutline.width
  let markVisibleX: CGFloat = 4 + prefixWidth + 25
  let markScale: CGFloat = 0.195
  let markTranslateX = markVisibleX - (66 * markScale)
  let markTranslateY: CGFloat = 110 - (450 * markScale)
  let toryX = markVisibleX + (372 * markScale) - 2
  let toryOutline = outline("tory", x: toryX, baseline: baseline)
  let width = ceil(toryX + toryOutline.width + 6)
  let title = "Make \(product) a Story logo"
  let svg = """
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \(Int(width)) 144" role="img" aria-labelledby="title">
    <title id="title">\(xmlEscaped(title))</title>
    <g>
      <path d="\(makeOutline.path)" fill="\(color)" />
      <path d="\(productOutline.path)" fill="\(accent)" />
      <path d="\(aOutline.path)" fill="\(color)" />
      <g transform="translate(\(scalar(markTranslateX)) \(scalar(markTranslateY))) scale(\(scalar(markScale)))">
        <path d="\(upperMarkPath)" fill="\(color)" transform="translate(-10 36)" />
        <path d="\(lowerMarkPath)" fill="\(color)" />
      </g>
      <path d="\(toryOutline.path)" fill="\(color)" />
    </g>
  </svg>
  """
  try svg.write(to: outputRoot.appendingPathComponent(filename), atomically: true, encoding: .utf8)
}

try FileManager.default.createDirectory(at: outputRoot, withIntermediateDirectories: true)

let lockups = [
  (product: "It", slug: "make-it-a-story"),
  (product: "Clip", slug: "make-clip-a-story"),
  (product: "Travel", slug: "make-travel-a-story"),
]

for item in lockups {
  try lockup(product: item.product, filename: "\(item.slug)-lockup.svg")
  try lockup(product: item.product, filename: "\(item.slug)-lockup-black.svg", color: "#000000", accent: "#000000")
  try lockup(product: item.product, filename: "\(item.slug)-lockup-light.svg", color: "#ffffff", accent: "#ffffff")
}
