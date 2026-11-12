// NEVER RUN. Written without a Mac; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: iOS 17 (buttons inside a widget), JotTimeline.swift, Shared/JotIntents.swift.
// Try it: ../../README.md, steps 2 and 3.
//
// The wide widget of design 14.1: a line that opens the jot bar (no widget may be typed into), a mic that
// opens voice, and the chips of what this circle adds most, each adding in one tap.

import SwiftUI
import WidgetKit

struct JotWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "JotWidget", provider: JotTimeline()) { entry in
            JotWidgetView(snapshot: entry.snapshot).containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("Jot")
        .description("Add something without opening the app.")
        .supportedFamilies([.systemMedium])
    }
}

struct JotWidgetView: View {
    let snapshot: JotSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Jot").font(.headline.weight(.heavy))
                Spacer()
                Text(snapshot.circleName).font(.caption.weight(.bold)).foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                Link(destination: JotLink.bar) {
                    HStack {
                        Image(systemName: "plus")
                        Text("Milk, a reminder, a thought…").lineLimit(1)
                        Spacer()
                    }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .frame(height: 40)
                    .background(Color.secondary.opacity(0.15), in: Capsule())
                }
                Link(destination: JotLink.voice) {
                    Image(systemName: "mic.fill")
                        .foregroundStyle(Color.jotOnAccent)
                        .frame(width: 36, height: 36)
                        .background(Color.jotAccent, in: Circle())
                }
            }
            if snapshot.circleId.isEmpty {
                Text("Open the app once to fill this in.").font(.caption).foregroundStyle(.secondary)
            }
            HStack(spacing: 6) {
                ForEach(snapshot.chips.prefix(4), id: \.self) { chip in
                    Button(intent: AddChipIntent(chip: chip)) {
                        Label(chip, systemImage: "plus").font(.caption.weight(.bold)).lineLimit(1)
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.capsule)
                    .tint(Color.jotAccent)
                }
            }
        }
    }
}
