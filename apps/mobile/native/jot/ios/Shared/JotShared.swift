// NEVER RUN. Written without a Mac; its first build and first run are on a phone build made with JOT_NATIVE=1.
// Needs: iOS 17, the App Group that plugins/withJotIos.js adds to the app and to the widget extension.
// Try it: see ../../README.md, step 1 ("the shared file").
//
// What the app and its widgets share: one small file with what to show, and the sign-in for the widgets' buttons.
// The app writes both (src/features/jot/outside.ts); the widgets only read them, and tick a line in their own copy.

import Foundation
import Security

/// One line of a list.
struct JotLine: Codable, Hashable {
    var id: String
    var text: String
    var done: Bool
}

/// A list as a widget shows it: its name, how many are left, its first lines.
struct JotList: Codable, Hashable {
    var id: String
    var title: String
    var left: Int
    var lines: [JotLine]
    /// Only for the list that is in use: who is using it.
    var by: String?
    var you: Bool?
}

/// One line of "next today": "15:30", "Dentist · Mia".
struct JotNext: Codable, Hashable {
    var lead: String
    var title: String
}

/// Everything the widgets show, as the app wrote it last.
struct JotSnapshot: Codable {
    var apiUrl: String
    var circleId: String
    var circleName: String
    var day: String
    var chips: [String]
    var shopping: JotList?
    var inUse: JotList?
    var next: [JotNext]
    var addedToday: Int

    /// What a widget draws when the app has left nothing: nobody is signed in, or the app hasn't been opened yet.
    static let empty = JotSnapshot(apiUrl: "", circleId: "", circleName: "", day: "", chips: [], shopping: nil, inUse: nil, next: [], addedToday: 0)

    /// What a widget draws in the widget gallery, where it shows what it could look like.
    static let sample = JotSnapshot(
        apiUrl: "", circleId: "", circleName: "", day: "", chips: ["Milk", "Eggs", "Bread", "Coffee"],
        shopping: JotList(id: "", title: "Groceries", left: 3, lines: [JotLine(id: "1", text: "Bananas", done: false), JotLine(id: "2", text: "Strawberries", done: false), JotLine(id: "3", text: "Butter", done: true)]),
        inUse: nil, next: [JotNext(lead: "15:30", title: "Dentist"), JotNext(lead: "19:00", title: "Bins")], addedToday: 0)
}

enum JotShared {
    /// The App Group's name, written into each target's Info.plist by the config plugin ("group.<the app's id>.jot").
    static var group: String { Bundle.main.object(forInfoDictionaryKey: "JotAppGroup") as? String ?? "" }
    static let file = "jot-widgets.json"
    static let tokenKey = "homeport.jot.token"

    private static var fileURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent(file)
    }

    /// What the app wrote last. Nil until the app has been opened once with the widgets installed.
    static func read() -> JotSnapshot? {
        guard let url = fileURL, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(JotSnapshot.self, from: data)
    }

    /// Writes a changed copy (a line ticked here), so the widget shows it before the app is next opened.
    static func write(_ snapshot: JotSnapshot) {
        guard let url = fileURL, let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: url, options: .atomic)
    }

    /// The sign-in the app left in the keychain for its widgets. Nil when nobody is signed in.
    /// (expo-secure-store keeps a value as a generic password whose account is the key; only the account and
    /// the group are asked for here, so its own "service" name doesn't have to be known.)
    static func token() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: Data(tokenKey.utf8),
            kSecAttrAccessGroup as String: group,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var found: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &found) == errSecSuccess, let data = found as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
