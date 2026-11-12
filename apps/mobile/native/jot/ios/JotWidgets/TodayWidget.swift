// NEVER RUN. Written without a Mac; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: JotTimeline.swift.
// Try it: ../../README.md, step 2.
//
// The small widget of design 14.1 with what is next today: three lines at most, each with its time or its
// amount in front. Pressing it opens the app.

import SwiftUI
import WidgetKit

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "JotTodayWidget", provider: JotTimeline()) { entry in
            TodayWidgetView(next: entry.snapshot.next).containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("Today")
        .description("What is next today.")
        .supportedFamilies([.systemSmall])
    }
}

struct TodayWidgetView: View {
    let next: [JotNext]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Today").font(.headline.weight(.heavy))
                Spacer()
                Text(Date(), format: .dateTime.weekday(.abbreviated).day()).font(.caption.weight(.bold)).foregroundStyle(.secondary)
            }
            if next.isEmpty {
                Text("Nothing else today.").font(.caption).foregroundStyle(.secondary)
            }
            ForEach(next.prefix(3), id: \.self) { line in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(line.lead).font(.footnote.weight(.heavy)).frame(width: 42, alignment: .leading)
                    Text(line.title).font(.footnote.weight(.semibold)).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
    }
}
