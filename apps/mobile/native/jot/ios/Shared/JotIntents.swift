// NEVER RUN. Written without a Mac; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: iOS 17 (a button inside a widget runs an AppIntent), JotApi.swift, JotShared.swift, ListAttributes.swift.
// Try it: ../../README.md, steps 3 to 5.
//
// What the buttons inside the widgets do, with the app staying shut. This file is part of the app and of the
// widget extension: the two that start and stop the Live Activity run inside the app (`LiveActivityIntent`).

import ActivityKit
import AppIntents
import WidgetKit

/// A chip: adds one of the things this circle adds most. One tap, nothing opens.
struct AddChipIntent: AppIntent {
    static var title: LocalizedStringResource = "Add to the list"
    @Parameter(title: "What") var chip: String

    init() {}
    init(chip: String) { self.chip = chip }

    func perform() async throws -> some IntentResult {
        try await JotApi.jot(chip)
        // The count on the list's widget goes up at once; the app writes the true list when it is next opened.
        if var snapshot = JotShared.read(), var list = snapshot.shopping {
            list.left += 1
            snapshot.shopping = list
            snapshot.addedToday += 1
            JotShared.write(snapshot)
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

/// A circle beside a line: ticks it, or unticks it.
struct TickLineIntent: AppIntent {
    static var title: LocalizedStringResource = "Tick a line"
    @Parameter(title: "Line") var itemId: String
    @Parameter(title: "Done") var done: Bool

    init() {}
    init(itemId: String, done: Bool) {
        self.itemId = itemId
        self.done = done
    }

    func perform() async throws -> some IntentResult {
        try await JotApi.tick(itemId, done: done)
        if var snapshot = JotShared.read() {
            snapshot.shopping = ticked(snapshot.shopping)
            snapshot.inUse = ticked(snapshot.inUse)
            JotShared.write(snapshot)
            await ListActivity.update(with: snapshot.inUse)
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }

    /// The same list with this line ticked, and one fewer (or one more) left.
    private func ticked(_ list: JotList?) -> JotList? {
        guard var list, let at = list.lines.firstIndex(where: { $0.id == itemId }), list.lines[at].done != done else { return list }
        list.lines[at].done = done
        list.left += done ? -1 : 1
        return list
    }
}

/// "At the shop": says the shopping list is in use and puts it on the Lock Screen, for eight hours at most.
struct StartListIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Use the list on the Lock Screen"

    func perform() async throws -> some IntentResult {
        guard let list = JotShared.read()?.shopping else { return .result() }
        try await JotApi.use(listId: list.id)
        try ListActivity.start(list)
        return .result()
    }
}

/// Done shopping: the list leaves the Lock Screen, and the others' too.
struct StopListIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Stop using the list"

    func perform() async throws -> some IntentResult {
        try? await JotApi.stopUsing()
        await ListActivity.end()
        return .result()
    }
}
