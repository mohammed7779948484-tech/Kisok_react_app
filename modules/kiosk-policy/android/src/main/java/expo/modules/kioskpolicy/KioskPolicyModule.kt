package expo.modules.kioskpolicy

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.RestrictionsManager
import android.os.Bundle
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * KISOK kiosk-policy — read-only device-policy module (Android only).
 *
 * Exposes to JavaScript:
 *  - `getDevicePolicySnapshot()`: the MDM-pushed managed app restrictions
 *    (RestrictionsManager) plus read-only lock-task corroboration
 *    (DevicePolicyManager / ActivityManager).
 *  - `onRestrictionsChanged` events, re-emitted from the system broadcast
 *    `Intent.ACTION_APPLICATION_RESTRICTIONS_CHANGED`.
 *
 * READ-ONLY BY DESIGN (kiosk-runtime AC-04): this module never calls
 * `startLockTask`/`stopLockTask`, never writes through DevicePolicyManager,
 * and never mutates device state — kiosk enforcement is owned by the
 * MDM/DPC, the app only reads state.
 *
 * `getDevicePolicySnapshot` is an `AsyncFunction` on purpose:
 * `RestrictionsManager.getApplicationRestrictions()` performs disk I/O
 * (see developer.android.com/work/managed-configurations) and Expo
 * dispatches async function bodies on its module queue, off the JavaScript
 * thread — it must never be a synchronous `Function`.
 *
 * Kotlin API names follow the installed expo-modules-core DSL (SDK 54).
 */
class KioskPolicyModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /**
   * Non-null means "currently registered". Set in OnStartObserving (first
   * JS listener), cleared in OnStopObserving (last JS listener removed) and
   * OnDestroy (module deallocated while listeners remain) — the guard
   * prevents double registration.
   */
  private var restrictionsReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("KioskPolicy")

    Events("onRestrictionsChanged")

    AsyncFunction("getDevicePolicySnapshot") {
      val appContext = context

      // These system services always exist on real Android. Should one ever
      // be missing (exotic emulator), degrade to the standard-device
      // snapshot instead of throwing, so the fail-closed derivation in JS
      // (kiosk-runtime T02) sees a well-formed, empty snapshot.
      val restrictionsManager = appContext.getSystemService(RestrictionsManager::class.java)
      val devicePolicyManager = appContext.getSystemService(DevicePolicyManager::class.java)
      val activityManager = appContext.getSystemService(ActivityManager::class.java)

      val restrictions: Map<String, Any?> =
        if (restrictionsManager != null) {
          applicationRestrictionsAsMap(restrictionsManager)
        } else {
          emptyMap()
        }

      mapOf<String, Any?>(
        "restrictions" to restrictions,
        "lockTaskPermitted" to (devicePolicyManager?.isLockTaskPermitted(appContext.packageName) ?: false),
        "lockTaskModeState" to lockTaskModeStateName(activityManager)
      )
    }

    // Manifest receivers are officially unsupported for
    // ACTION_APPLICATION_RESTRICTIONS_CHANGED — the receiver must be
    // registered dynamically, which is exactly what these lifecycle hooks do.
    OnStartObserving("onRestrictionsChanged") {
      if (restrictionsReceiver != null) {
        return@OnStartObserving
      }
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          if (intent.action == Intent.ACTION_APPLICATION_RESTRICTIONS_CHANGED) {
            this@KioskPolicyModule.sendEvent(
              "onRestrictionsChanged",
              mapOf("reason" to "restrictions_changed")
            )
          }
        }
      }
      // System-sent protected broadcast: RECEIVER_NOT_EXPORTED satisfies the
      // API 33+ registration requirement and never blocks system delivery.
      ContextCompat.registerReceiver(
        context,
        receiver,
        IntentFilter(Intent.ACTION_APPLICATION_RESTRICTIONS_CHANGED),
        ContextCompat.RECEIVER_NOT_EXPORTED
      )
      restrictionsReceiver = receiver
    }

    OnStopObserving("onRestrictionsChanged") {
      unregisterRestrictionsReceiver()
    }

    // If the module is deallocated while JS listeners still observe the
    // event, OnStopObserving never runs — unregister here so the dynamic
    // receiver cannot leak past the module's lifetime.
    OnDestroy {
      unregisterRestrictionsReceiver()
    }
  }

  private fun unregisterRestrictionsReceiver() {
    restrictionsReceiver?.let { receiver ->
      // Ignore "receiver not registered" if the react context died first:
      // tearing down observation must never crash the app.
      runCatching { context.unregisterReceiver(receiver) }
    }
    restrictionsReceiver = null
  }

  /**
   * Every key present in the restrictions bundle (including
   * `restrictions_pending` when the DPC sets it), mapped to JSON-safe
   * primitives: String/Boolean/Integer pass through, every other type is
   * reduced to its string form. Null-valued keys are treated as unset and
   * dropped (Android bundle semantics: explicit null == unset) — passing a
   * null value to JS would break the TS union `string | number | boolean`
   * and make the downstream Zod boundary reject the whole snapshot. A null
   * bundle (no managing DPC) becomes an empty map.
   */
  private fun applicationRestrictionsAsMap(
    restrictionsManager: RestrictionsManager
  ): Map<String, Any?> {
    val restrictions: Bundle? = restrictionsManager.applicationRestrictions
    if (restrictions == null || restrictions.isEmpty) {
      return emptyMap()
    }
    val result = mutableMapOf<String, Any?>()
    for (key in restrictions.keySet()) {
      val value = restrictions.get(key)
      // Explicit null == unset: drop the key instead of emitting a null
      // value (see the doc comment above for the fail-closed rationale).
      if (value == null) {
        continue
      }
      result[key] = when (value) {
        is String, is Boolean, is Int -> value
        else -> value.toString()
      }
    }
    return result
  }

  private fun lockTaskModeStateName(activityManager: ActivityManager?): String =
    when (activityManager?.lockTaskModeState) {
      ActivityManager.LOCK_TASK_MODE_LOCKED -> "locked"
      ActivityManager.LOCK_TASK_MODE_PINNED -> "pinned"
      else -> "none" // LOCK_TASK_MODE_NONE and any unknown future constant
    }
}
