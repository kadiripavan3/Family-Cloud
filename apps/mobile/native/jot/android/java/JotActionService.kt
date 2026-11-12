// NEVER RUN. Written without Android Studio; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: the task "JotWidgetAction" the app names when its code loads (src/features/jot/outside.ts), the
// WAKE_LOCK permission and this service's entry in the manifest (the plugin adds both).
// Try it: ../README.md, steps 3 and 4.
//
// Runs the app's own code unseen for one press on a widget: it jots the chip or ticks the line with the
// person's sign-in, writes the widgets' file again, and then the widgets are drawn from it.
package __PACKAGE__.jot

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class JotActionService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras ?: return null
        val action = Arguments.createMap()
        action.putString("kind", extras.getString("kind"))
        extras.getString("circleId")?.let { action.putString("circleId", it) }
        extras.getString("text")?.let { action.putString("text", it) }
        extras.getString("itemId")?.let { action.putString("itemId", it) }
        extras.getString("done")?.let { action.putBoolean("done", it == "true") }
        // Twenty seconds at most, and also allowed while the app is on screen.
        return HeadlessJsTaskConfig("JotWidgetAction", action, 20_000, true)
    }

    override fun onHeadlessJsTaskFinish(taskId: Int) {
        super.onHeadlessJsTaskFinish(taskId)
        redrawJotWidgets(applicationContext)
    }
}
