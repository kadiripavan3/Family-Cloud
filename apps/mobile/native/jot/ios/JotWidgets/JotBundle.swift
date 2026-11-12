// NEVER RUN. Written without a Mac; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: every other file in this folder and in ../Shared.
// Try it: ../../README.md, step 2.
//
// Everything the extension offers: the three Home Screen widgets, the three round ones for the Lock Screen,
// and the Live Activity of the list in use.

import SwiftUI
import WidgetKit

@main
struct JotBundle: WidgetBundle {
    var body: some Widget {
        JotWidget()
        ListWidget()
        TodayWidget()
        JotAddLock()
        JotMicLock()
        JotToBuyLock()
        ListLiveActivity()
    }
}
