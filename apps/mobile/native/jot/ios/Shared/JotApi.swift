// NEVER RUN. Written without a Mac; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: the shared file and the sign-in from JotShared.swift, and a reachable API.
// Try it: ../../README.md, step 3 ("a chip that adds").
//
// The four calls the widgets make themselves, with nothing opening: add a line, tick a line, and say that a
// list is in use or no longer is. They are the same calls the app makes (apps/api/openapi.json).

import Foundation

enum JotApiError: Error {
    /// The app hasn't written the shared file yet, or nobody is signed in.
    case notReady
    /// The API said no. 401 means the sign-in ran out: opening the app renews it.
    case refused(Int)
}

enum JotApi {
    private static func send(_ method: String, _ path: String, _ body: [String: Any]? = nil) async throws {
        guard let snapshot = JotShared.read(), let token = JotShared.token(), let url = URL(string: snapshot.apiUrl + path) else { throw JotApiError.notReady }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = method
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (_, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw JotApiError.refused(status) }
    }

    private static var today: String {
        let format = DateFormatter()
        format.calendar = Calendar(identifier: .gregorian)
        format.dateFormat = "yyyy-MM-dd"
        return format.string(from: Date())
    }

    /// Files a line, exactly as the jot bar does: `POST /v1/circles/{id}/jots` with `source: widget`.
    static func jot(_ text: String, source: String = "widget") async throws {
        guard let circle = JotShared.read()?.circleId else { throw JotApiError.notReady }
        try await send("POST", "/v1/circles/\(circle)/jots", ["clientId": UUID().uuidString.lowercased(), "text": text, "day": today, "timeZone": TimeZone.current.identifier, "source": source])
    }

    /// Ticks or unticks one line of a list: `PATCH /v1/checklist-items/{id}`.
    static func tick(_ itemId: String, done: Bool) async throws {
        try await send("PATCH", "/v1/checklist-items/\(itemId)", ["done": done])
    }

    /// Says which list you are using right now: `PUT /v1/circles/{id}/list-in-use`.
    static func use(listId: String) async throws {
        guard let circle = JotShared.read()?.circleId else { throw JotApiError.notReady }
        try await send("PUT", "/v1/circles/\(circle)/list-in-use", ["listId": listId])
    }

    static func stopUsing() async throws {
        guard let circle = JotShared.read()?.circleId else { throw JotApiError.notReady }
        try await send("DELETE", "/v1/circles/\(circle)/list-in-use")
    }
}
