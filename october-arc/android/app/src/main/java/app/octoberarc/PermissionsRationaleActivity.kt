package app.octoberarc

import android.app.Activity
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView

/**
 * Required by Health Connect: shown when the user asks why October Arc wants
 * health permissions (ACTION_SHOW_PERMISSIONS_RATIONALE, and on Android 14+
 * VIEW_PERMISSION_USAGE).
 */
class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val text = TextView(this).apply {
            setPadding(pad, pad, pad, pad)
            textSize = 16f
            text = getString(R.string.health_privacy_policy)
        }
        setContentView(ScrollView(this).apply { addView(text) })
    }
}
