// NEVER RUN. Written without a Mac; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: WidgetKit, the shared file (Shared/JotShared.swift).
// Try it: ../../README.md, step 2 ("the widgets show up").
//
// Where every widget gets what it shows: the file the app wrote last. A widget is drawn again when one of its
// buttons was pressed, and every quarter of an hour, so a list someone else ticked catches up by itself.

import SwiftUI
import WidgetKit

struct JotEntry: TimelineEntry {
    let date: Date
    let snapshot: JotSnapshot
}

struct JotTimeline: TimelineProvider {
    func placeholder(in context: Context) -> JotEntry { JotEntry(date: Date(), snapshot: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (JotEntry) -> Void) {
        // The gallery shows a sample; a widget that is placed shows what is there, or that nothing is.
        completion(JotEntry(date: Date(), snapshot: JotShared.read() ?? (context.isPreview ? .sample : .empty)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<JotEntry>) -> Void) {
        let entry = JotEntry(date: Date(), snapshot: JotShared.read() ?? .empty)
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60))))
    }
}

/// The app's own links: the jot bar, and voice.
enum JotLink {
    static let bar = URL(string: "homeport://jot")!
    static let voice = URL(string: "homeport://jot/voice")!
}

/// The accent colour of the app (design/tokens.json: accent, and the text that goes on it).
extension Color {
    static let jotAccent = Color(red: 1, green: 0.76, blue: 0.1)
    static let jotOnAccent = Color(red: 0.1, green: 0.08, blue: 0)
}

/// A line with its circle: pressing the circle ticks the line, with the app staying shut.
struct JotTickRow: View {
    let line: JotLine

    var body: some View {
        Button(intent: TickLineIntent(itemId: line.id, done: !line.done)) {
            HStack(spacing: 8) {
                Image(systemName: line.done ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(line.done ? Color.jotAccent : Color.secondary)
                Text(line.text)
                    .font(.subheadline.weight(.semibold))
                    .strikethrough(line.done)
                    .foregroundStyle(line.done ? Color.secondary : Color.primary)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }
}
