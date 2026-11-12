// NEVER RUN. Written without Android Studio; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: Android 7 or later, and the service's entry in the manifest (the plugin adds it).
// Try it: ../README.md, step 7 ("the tile and the long press").
//
// The "Jot" tile of design 14.3, in the phone's quick settings: from any screen, it opens the jot bar.
package __PACKAGE__.jot

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.TileService

class JotTileService : TileService() {
    override fun onClick() {
        val bar = Intent(Intent.ACTION_VIEW, Uri.parse("homeport://jot")).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14 wants the screen to open as something the person asked for, handed over ready-made.
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, bar, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(bar)
        }
    }
}
