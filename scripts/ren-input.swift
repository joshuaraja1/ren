import AppKit
import ApplicationServices
import Foundation

guard CommandLine.arguments.count == 2,
      let data = CommandLine.arguments[1].data(using: .utf8),
      let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let action = value["action"] as? String else {
    fputs("Invalid screen action.\n", stderr)
    exit(2)
}
struct VisibleApp {
    let bundle: String
    let pid: pid_t
    let name: String
}
let displayFrame: CGRect? = {
    guard let bounds = value["screenBounds"] as? [String: Any],
          let x = bounds["x"] as? NSNumber, let y = bounds["y"] as? NSNumber,
          let width = bounds["width"] as? NSNumber, let height = bounds["height"] as? NSNumber,
          width.doubleValue > 0, height.doubleValue > 0 else { return nil }
    return CGRect(x: x.doubleValue, y: y.doubleValue, width: width.doubleValue, height: height.doubleValue)
}()
func visibleApps() -> [VisibleApp] {
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    var apps: [VisibleApp] = []
    var seen: Set<String> = []
    for window in windows {
        guard let layer = window[kCGWindowLayer as String] as? Int, layer == 0,
              let rawBounds = window[kCGWindowBounds as String] as? [String: Any],
              let width = rawBounds["Width"] as? NSNumber, width.doubleValue >= 200,
              let height = rawBounds["Height"] as? NSNumber, height.doubleValue >= 200,
              let owner = window[kCGWindowOwnerName as String] as? String,
              owner != "Ren", owner != "ChatGPT Computer Use Software Cursor",
              !(window[kCGWindowName as String] as? String ?? "").contains("Computer Use"),
              let number = window[kCGWindowOwnerPID as String] as? NSNumber else { continue }
        if let displayFrame {
            guard let x = rawBounds["X"] as? NSNumber, let y = rawBounds["Y"] as? NSNumber else { continue }
            let overlap = CGRect(x: x.doubleValue, y: y.doubleValue, width: width.doubleValue, height: height.doubleValue).intersection(displayFrame)
            if overlap.isNull || overlap.width < 80 || overlap.height < 80 { continue }
        }
        let pid = pid_t(number.intValue)
        guard let app = NSRunningApplication(processIdentifier: pid), let bundle = app.bundleIdentifier,
              !seen.contains(bundle) else { continue }
        seen.insert(bundle)
        apps.append(VisibleApp(bundle: bundle, pid: pid, name: app.localizedName ?? owner))
    }
    return apps
}
let apps = visibleApps()
if action == "identity" {
    let details = apps.map { ["bundle": $0.bundle, "name": $0.name] }
    guard let json = try? JSONSerialization.data(withJSONObject: details), let text = String(data: json, encoding: .utf8) else { exit(2) }
    print("REN_VISIBLE_APPS:\(text)")
    exit(0)
}
guard AXIsProcessTrusted() else {
    fputs("Ren needs macOS Accessibility permission to operate other apps.\n", stderr)
    exit(13)
}
guard let expectedBundle = value["expectedBundle"] as? String,
      !["ai.ren.teacher", "com.openai.codex", "com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.Warp-Stable", "org.alacritty", "com.apple.systempreferences"].contains(expectedBundle) else {
    fputs("The active app changed or cannot be operated safely.\n", stderr)
    exit(14)
}
if action == "activate" {
    guard let target = apps.first(where: { $0.bundle == expectedBundle }),
          NSRunningApplication(processIdentifier: target.pid)?.activate(options: .activateAllWindows) == true else {
        fputs("The active app changed or cannot be operated safely.\n", stderr)
        exit(14)
    }
    usleep(150_000)
    guard NSWorkspace.shared.frontmostApplication?.bundleIdentifier == expectedBundle else {
        fputs("The active app changed or cannot be operated safely.\n", stderr)
        exit(14)
    }
    print("REN_INPUT_OK")
    exit(0)
}
guard apps.first?.bundle == expectedBundle,
      NSWorkspace.shared.frontmostApplication?.bundleIdentifier == expectedBundle else {
    fputs("The active app changed or cannot be operated safely.\n", stderr)
    exit(14)
}

func location(_ raw: Any?) -> CGPoint? {
    guard let point = raw as? [String: Any],
          let x = point["x"] as? Double,
          let y = point["y"] as? Double,
          x.isFinite, y.isFinite else { return nil }
    return CGPoint(x: x, y: y)
}

func mouse(_ kind: CGEventType, at point: CGPoint) {
    CGEvent(mouseEventSource: nil, mouseType: kind, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
}

func key(_ code: CGKeyCode, flags: CGEventFlags = []) {
    let down = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true)
    let up = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false)
    down?.flags = flags
    up?.flags = flags
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)
}

switch action {
case "click":
    guard let point = location(value["at"]) else { exit(2) }
    mouse(.mouseMoved, at: point)
    usleep(60_000)
    mouse(.leftMouseDown, at: point)
    usleep(70_000)
    mouse(.leftMouseUp, at: point)
case "drag":
    guard let start = location(value["from"]), let end = location(value["to"]) else { exit(2) }
    mouse(.mouseMoved, at: start)
    usleep(80_000)
    mouse(.leftMouseDown, at: start)
    for index in 1...16 {
        let fraction = CGFloat(index) / 16.0
        let current = CGPoint(x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction)
        mouse(.leftMouseDragged, at: current)
        usleep(22_000)
    }
    mouse(.leftMouseUp, at: end)
case "scroll":
    guard let point = location(value["at"]), let lines = value["lines"] as? Int, (-8...8).contains(lines), lines != 0 else { exit(2) }
    mouse(.mouseMoved, at: point)
    CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: Int32(lines), wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
case "type":
    guard let text = value["text"] as? String, !text.isEmpty, text.utf16.count <= 1000 else { exit(2) }
    func postText(_ units: [UInt16]) {
        units.withUnsafeBufferPointer { buffer in
            guard let pointer = buffer.baseAddress else { return }
            let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true)
            let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false)
            down?.keyboardSetUnicodeString(stringLength: units.count, unicodeString: pointer)
            up?.keyboardSetUnicodeString(stringLength: units.count, unicodeString: pointer)
            down?.post(tap: .cghidEventTap)
            up?.post(tap: .cghidEventTap)
            usleep(8_000)
        }
    }
    var batch: [UInt16] = []
    for scalar in text.unicodeScalars {
        let encoded = Array(String(scalar).utf16)
        if batch.count + encoded.count > 20 {
            postText(batch)
            batch.removeAll(keepingCapacity: true)
        }
        batch.append(contentsOf: encoded)
    }
    if !batch.isEmpty { postText(batch) }
case "key":
    guard let name = value["key"] as? String else { exit(2) }
    let keys: [String: CGKeyCode] = ["Return": 36, "Tab": 48, "Escape": 53, "Backspace": 51, "Up": 126, "Down": 125, "Left": 123, "Right": 124, "Cmd+A": 0, "Cmd+S": 1, "Cmd+Z": 6]
    guard let code = keys[name] else { exit(2) }
    key(code, flags: name.hasPrefix("Cmd+") ? .maskCommand : [])
default:
    exit(2)
}
print("REN_INPUT_OK")
