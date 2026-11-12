// NEVER RUN. Written without a Mac; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: iOS 17, JotTimeline.swift (JotTickRow), Shared/JotIntents.swift.
// Try it: ../../README.md, step 4 ("a line that ticks").
//
// The small widget of design 14.1 with the shopping list: its name, how many are left, and its first three
// lines, each with a circle that ticks it. The second button puts the list on the Lock Screen.

import SwiftUI
import WidgetKit

struct ListWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "JotListWidget", provider: JotTimeline()) { entry in
            ListWidgetView(list: entry.snapshot.shopping).containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("A list with ticks")
        .description("Tick the shopping list without opening the app.")
        .supportedFamilies([.systemSmall])
    }
}

struct ListWidgetView: View {
    let list: JotList?

    var body: some View {
        if let list {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(list.title).font(.headline.weight(.heavy)).lineLimit(1)
                    Spacer()
                    Text("\(list.left) left").font(.caption.weight(.bold)).foregroundStyle(.secondary)
                }
                ForEach(list.lines.prefix(3), id: \.id) { JotTickRow(line: $0) }
                Spacer(minLength: 0)
                Button(intent: StartListIntent()) {
                    Label("At the shop", systemImage: "lock.iphone").font(.caption2.weight(.bold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
        } else {
            Text("Your shopping list shows here once something is on it.").font(.caption).foregroundStyle(.secondary)
        }
    }
}
