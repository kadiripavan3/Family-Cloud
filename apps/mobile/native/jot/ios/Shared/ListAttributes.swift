// NEVER RUN. Written without a Mac; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: iOS 17, "NSSupportsLiveActivities" in the app's Info.plist (the config plugin adds it).
// Try it: ../../README.md, step 5 ("the list on the Lock Screen").
//
// The list that is in use, as a Live Activity: what it is, and starting, updating and ending it. Part of
// the app and of the widget extension (the extension draws it, see JotWidgets/ListLiveActivity.swift).

import ActivityKit
import Foundation

struct ListAttributes: ActivityAttributes {
    /// What changes while it is up: the lines and how many are left.
    struct ContentState: Codable, Hashable {
        var lines: [JotLine]
        var left: Int
        /// "Alex is at the shop": who is using it, when that isn't you.
        var by: String?
    }

    var listId: String
    var title: String
}

enum ListActivity {
    /// Apple ends a Live Activity after eight hours by itself; this says so up front, so it goes grey no later.
    static let lasts: TimeInterval = 8 * 60 * 60

    private static func state(_ list: JotList) -> ActivityContent<ListAttributes.ContentState> {
        ActivityContent(state: .init(lines: Array(list.lines.prefix(3)), left: list.left, by: list.you == false ? list.by : nil), staleDate: Date().addingTimeInterval(lasts))
    }

    static func start(_ list: JotList) throws {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        _ = try Activity.request(attributes: ListAttributes(listId: list.id, title: list.title), content: state(list))
    }

    static func update(with list: JotList?) async {
        guard let list else { return }
        for activity in Activity<ListAttributes>.activities where activity.attributes.listId == list.id {
            await activity.update(state(list))
        }
    }

    static func end() async {
        for activity in Activity<ListAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
