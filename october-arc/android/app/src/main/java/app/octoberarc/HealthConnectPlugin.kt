package app.octoberarc

import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * Read-only bridge to Android Health Connect (steps and sleep).
 * The web layer adapts this to `window.OctoberArcHealth` (src/native/health.ts).
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val contract = PermissionController.createRequestPermissionResultContract()

    private val stepsPermission = HealthPermission.getReadPermission(StepsRecord::class)
    private val sleepPermission = HealthPermission.getReadPermission(SleepSessionRecord::class)

    private fun client(): HealthConnectClient? =
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) {
            HealthConnectClient.getOrCreate(context)
        } else {
            null
        }

    private fun permissionsFor(call: PluginCall): Set<String> {
        val scopes = call.getArray("scopes")?.toList<String>() ?: listOf("steps")
        return scopes.mapNotNull {
            when (it) {
                "steps" -> stepsPermission
                "sleep" -> sleepPermission
                else -> null
            }
        }.toSet()
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val status = when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
            else -> "unavailable"
        }
        call.resolve(JSObject().put("available", status == "available").put("status", status))
    }

    @PluginMethod
    fun hasPermissions(call: PluginCall) {
        val c = client() ?: return call.resolve(JSObject().put("steps", false).put("sleep", false))
        scope.launch {
            try {
                val granted = c.permissionController.getGrantedPermissions()
                call.resolve(
                    JSObject()
                        .put("steps", granted.contains(stepsPermission))
                        .put("sleep", granted.contains(sleepPermission)),
                )
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not read Health Connect permissions", e)
            }
        }
    }

    @PluginMethod
    fun requestAuthorization(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect is not available on this device")
        val wanted = permissionsFor(call)
        scope.launch {
            try {
                val granted = c.permissionController.getGrantedPermissions()
                if (granted.containsAll(wanted)) {
                    call.resolve(JSObject().put("granted", true))
                } else {
                    val intent = contract.createIntent(context, wanted)
                    startActivityForResult(call, intent, "onPermissionResult")
                }
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not request Health Connect permissions", e)
            }
        }
    }

    @ActivityCallback
    fun onPermissionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val granted = contract.parseResult(result.resultCode, result.data)
        call.resolve(JSObject().put("granted", granted.containsAll(permissionsFor(call))))
    }

    /** Total steps between two ISO-8601 instants (Health Connect de-duplicates sources). */
    @PluginMethod
    fun getSteps(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect is not available on this device")
        val range = rangeOf(call) ?: return
        scope.launch {
            try {
                val res = c.aggregate(
                    AggregateRequest(metrics = setOf(StepsRecord.COUNT_TOTAL), timeRangeFilter = range),
                )
                val steps = res[StepsRecord.COUNT_TOTAL]
                val out = JSObject()
                if (steps != null) out.put("steps", steps) else out.put("steps", JSObject.NULL)
                call.resolve(out)
            } catch (e: SecurityException) {
                call.reject("Permission to read steps was not granted", "PERMISSION", e)
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not read steps", e)
            }
        }
    }

    /** Sleep sessions overlapping the range, as [{ start, end }] ISO-8601 instants. */
    @PluginMethod
    fun getSleepSessions(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect is not available on this device")
        val range = rangeOf(call) ?: return
        scope.launch {
            try {
                val res = c.readRecords(ReadRecordsRequest(SleepSessionRecord::class, timeRangeFilter = range))
                val arr = JSArray()
                for (r in res.records) {
                    arr.put(JSObject().put("start", r.startTime.toString()).put("end", r.endTime.toString()))
                }
                call.resolve(JSObject().put("sessions", arr))
            } catch (e: SecurityException) {
                call.reject("Permission to read sleep was not granted", "PERMISSION", e)
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not read sleep", e)
            }
        }
    }

    /** Opens Health Connect (or its Play Store page when it needs installing/updating). */
    @PluginMethod
    fun openHealthConnect(call: PluginCall) {
        val intent = if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) {
            Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
        } else {
            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata"))
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Could not open Health Connect", e)
        }
    }

    private fun rangeOf(call: PluginCall): TimeRangeFilter? {
        return try {
            TimeRangeFilter.between(Instant.parse(call.getString("start")), Instant.parse(call.getString("end")))
        } catch (e: Exception) {
            call.reject("start and end must be ISO-8601 instants")
            null
        }
    }

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }
}
