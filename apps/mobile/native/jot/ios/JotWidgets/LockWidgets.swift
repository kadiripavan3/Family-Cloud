// NEVER RUN. Written without a Mac; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: iOS 17, JotTimeline.swift.
// Try it: ../../README.md, step 6 ("under the clock").
//
// The three round widgets under the clock of design 14.5: add (opens the jot bar), the mic (opens voice),
// and how many things are left to buy.

import SwiftUI
import WidgetKit

/// A round widget that is a picture and a link.
private struct RoundLink: View {
    let symbol: String
    let link: URL

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            Image(systemName: symbol).font(.title2.weight(.semibold))
        }
        .widgetURL(link)
    }
}

struct JotAddLock: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "JotAddLock", provider: JotTimeline()) { _ in
            RoundLink(symbol: "plus", link: JotLink.bar).containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Jot")
        .description("Opens the jot bar.")
        .supportedFamilies([.accessoryCircular])
    }
}

struct JotMicLock: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "JotMicLock", provider: JotTimeline()) { _ in
            RoundLink(symbol: "mic.fill", link: JotLink.voice).containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Say it")
        .description("Say everything in one breath.")
        .supportedFamilies([.accessoryCircular])
    }
}

struct JotToBuyLock: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "JotToBuyLock", provider: JotTimeline()) { entry in
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Text("\(entry.snapshot.shopping?.left ?? 0)").font(.title3.weight(.heavy))
                    Text("to buy").font(.system(size: 9, weight: .bold))
                }
            }
            .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("To buy")
        .description("How many things are left on the shopping list.")
        .supportedFamilies([.accessoryCircular])
    }
}
