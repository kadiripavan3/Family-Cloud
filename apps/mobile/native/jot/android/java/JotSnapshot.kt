// NEVER RUN. Written without Android Studio; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: the file the app writes each time it comes to the front (src/features/jot/outside.ts).
// Try it: ../README.md, step 1 ("the shared file").
//
// What the widgets show, read from the file the app wrote last: <the app's files>/jot-widgets.json.
// (plugins/withJotAndroid.js writes the app's package in the place of __PACKAGE__ when it copies this file.)
package __PACKAGE__.jot

import android.content.Context
import org.json.JSONObject
import java.io.File

data class JotLine(val id: String, val text: String, val done: Boolean)

data class JotList(val id: String, val title: String, val left: Int, val lines: List<JotLine>)

data class JotNext(val lead: String, val title: String)

data class JotSnapshot(val circleId: String, val circleName: String, val chips: List<String>, val shopping: JotList?, val next: List<JotNext>) {
    companion object {
        const val FILE = "jot-widgets.json"

        /** What the app wrote last, or null until it has been opened once with the pinned note switched on. */
        fun read(context: Context): JotSnapshot? = try {
            val json = JSONObject(File(context.filesDir, FILE).readText())
            val chips = json.getJSONArray("chips")
            val next = json.getJSONArray("next")
            JotSnapshot(
                circleId = json.getString("circleId"),
                circleName = json.getString("circleName"),
                chips = List(chips.length()) { chips.getString(it) },
                shopping = json.optJSONObject("shopping")?.let { list ->
                    val lines = list.getJSONArray("lines")
                    JotList(list.getString("id"), list.getString("title"), list.getInt("left"), List(lines.length()) {
                        val line = lines.getJSONObject(it)
                        JotLine(line.getString("id"), line.getString("text"), line.getBoolean("done"))
                    })
                },
                next = List(next.length()) { JotNext(next.getJSONObject(it).getString("lead"), next.getJSONObject(it).getString("title")) },
            )
        } catch (unreadable: Exception) {
            null
        }
    }
}
