// NEVER RUN. Written without a Mac; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: iOS 17, Shared/ListAttributes.swift, JotTimeline.swift (JotTickRow).
// Try it: ../../README.md, step 5 ("the list on the Lock Screen").
//
// The list in use, as the Lock Screen of design 14.5 shows it: its name, who is at the shop, and its first
// lines with circles that tick. In the Dynamic Island it is the count of what is left.

import ActivityKit
import SwiftUI
import WidgetKit

struct ListLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ListAttributes.self) { context in
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(context.attributes.title).font(.subheadline.weight(.heavy))
                    Spacer()
                    if let by = context.state.by {
                        Text("\(by) is at the shop").font(.caption).foregroundStyle(.secondary)
                    }
                    Button(intent: StopListIntent()) { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }
                HStack(spacing: 12) {
                    ForEach(context.state.lines, id: \.id) { JotTickRow(line: $0) }
                }
            }
            .padding()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Text(context.attributes.title).font(.caption.weight(.bold)) }
                DynamicIslandExpandedRegion(.trailing) { Text("\(context.state.left) left").font(.caption) }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 12) { ForEach(context.state.lines, id: \.id) { JotTickRow(line: $0) } }
                }
            } compactLeading: {
                Image(systemName: "cart")
            } compactTrailing: {
                Text("\(context.state.left)")
            } minimal: {
                Text("\(context.state.left)")
            }
        }
    }
}
