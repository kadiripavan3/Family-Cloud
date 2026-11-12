// NEVER RUN. Written without Android Studio; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: JotActionService.kt, and the receiver's entry in the manifest (the plugin adds it).
// Try it: ../README.md, steps 3 and 4.
//
// A chip or a circle on a widget was pressed. The press is handed to JotActionService, which starts the
// app's own code unseen: that is where the sign-in is, so no copy of it has to be kept for the widgets.
package __PACKAGE__.jot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

class JotActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION) return
        val work = Intent(context, JotActionService::class.java)
        intent.extras?.let { work.putExtras(it) }
        // A press on a widget lets the app start a service for a few seconds, also when it isn't open.
        context.startService(work)
        HeadlessJsTaskService.acquireWakeLockNow(context)
    }

    companion object {
        const val ACTION = "__PACKAGE__.jot.ACTION"
    }
}
