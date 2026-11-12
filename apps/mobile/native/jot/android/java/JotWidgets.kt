// NEVER RUN. Written without Android Studio; first built and run on a phone build made with JOT_NATIVE=1.
// Needs: JotSnapshot.kt, JotActionReceiver.kt, the layouts in res/layout, the manifest entries the plugin adds.
// Try it: ../README.md, steps 2 to 4.
//
// The three widgets of design 14.1, as plain Android widgets (RemoteViews: nothing to add to the build).
// Each draws itself from the file the app wrote. The line opens the jot bar; a chip and a circle send a
// broadcast to JotActionReceiver, and the app does the work unseen.
package __PACKAGE__.jot

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import __PACKAGE__.R

private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

/** Opens one of the app's own screens: "homeport://jot". */
private fun open(context: Context, link: String): PendingIntent =
    PendingIntent.getActivity(context, link.hashCode(), Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(context.packageName), FLAGS)

/** A press the app answers unseen: a chip to add, a line to tick. */
private fun act(context: Context, extras: Map<String, String>): PendingIntent {
    val intent = Intent(context, JotActionReceiver::class.java).setAction(JotActionReceiver.ACTION)
    extras.forEach { (key, value) -> intent.putExtra(key, value) }
    return PendingIntent.getBroadcast(context, extras.hashCode(), intent, FLAGS)
}

/** Draws every widget of the app again: called when the app's work for a press is done. */
fun redrawJotWidgets(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    for (widget in listOf(JotWidget::class.java, JotListWidget::class.java, JotTodayWidget::class.java)) {
        val ids = manager.getAppWidgetIds(ComponentName(context, widget))
        if (ids.isNotEmpty()) context.sendBroadcast(Intent(context, widget).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE).putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids))
    }
}

/** The wide one: a line that opens the jot bar, a mic, and the chips. */
class JotWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val snapshot = JotSnapshot.read(context)
        val views = RemoteViews(context.packageName, R.layout.jot_widget)
        views.setTextViewText(R.id.jot_circle, snapshot?.circleName ?: "")
        views.setOnClickPendingIntent(R.id.jot_line, open(context, "homeport://jot"))
        views.setOnClickPendingIntent(R.id.jot_mic, open(context, "homeport://jot/voice"))
        listOf(R.id.jot_chip_1, R.id.jot_chip_2, R.id.jot_chip_3, R.id.jot_chip_4).forEachIndexed { index, id ->
            val chip = snapshot?.chips?.getOrNull(index)
            views.setViewVisibility(id, if (chip == null) View.GONE else View.VISIBLE)
            if (chip != null && snapshot != null) {
                views.setTextViewText(id, "+ $chip")
                views.setOnClickPendingIntent(id, act(context, mapOf("kind" to "chip", "circleId" to snapshot.circleId, "text" to chip)))
            }
        }
        manager.updateAppWidget(ids, views)
    }
}

/** The small one with the shopping list: three lines, each ticked by a press. */
class JotListWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val list = JotSnapshot.read(context)?.shopping
        val views = RemoteViews(context.packageName, R.layout.jot_list_widget)
        views.setTextViewText(R.id.jot_list_title, list?.title ?: context.getString(R.string.jot_list_name))
        views.setTextViewText(R.id.jot_list_left, list?.let { context.getString(R.string.jot_left, it.left) } ?: "")
        listOf(R.id.jot_row_1, R.id.jot_row_2, R.id.jot_row_3).forEachIndexed { index, id ->
            val line = list?.lines?.getOrNull(index)
            views.setViewVisibility(id, if (line == null) View.GONE else View.VISIBLE)
            if (line != null) {
                views.setTextViewText(id, line.text)
                views.setTextViewCompoundDrawablesRelative(id, if (line.done) R.drawable.jot_tick_on else R.drawable.jot_tick_off, 0, 0, 0)
                views.setOnClickPendingIntent(id, act(context, mapOf("kind" to "tick", "itemId" to line.id, "done" to (!line.done).toString())))
            }
        }
        manager.updateAppWidget(ids, views)
    }
}

/** The small one with what is next today. A press opens the app. */
class JotTodayWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val next = JotSnapshot.read(context)?.next ?: emptyList()
        val views = RemoteViews(context.packageName, R.layout.jot_today_widget)
        listOf(R.id.jot_next_1, R.id.jot_next_2, R.id.jot_next_3).forEachIndexed { index, id ->
            val line = next.getOrNull(index)
            views.setViewVisibility(id, if (line == null) View.GONE else View.VISIBLE)
            if (line != null) views.setTextViewText(id, if (line.lead.isEmpty()) line.title else "${line.lead}  ${line.title}")
        }
        views.setOnClickPendingIntent(R.id.jot_today, open(context, "homeport://"))
        manager.updateAppWidget(ids, views)
    }
}
