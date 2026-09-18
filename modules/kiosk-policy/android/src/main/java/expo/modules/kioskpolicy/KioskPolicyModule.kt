package expo.modules.kioskpolicy

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
 * KISOK kiosk-policy — reads the MDM-pushed managed configuration for THIS
 * application, and nothing else.
 *
 * Read-only by design. This module never calls startLockTask/stopLockTask,
 * never writes through DevicePolicyManager, and never inspects lock-task
 * state: Android and ManageEngine own device lockdown, KISOK only needs to
 * know which kind of tablet it is running on.
 *
 * Follows https://developer.android.com/work/managed-configurations:
 *  - `RestrictionsManager.getApplicationRestrictions()` for the values;
 *  - `Intent.ACTION_APPLICATION_RESTRICTIONS_CHANGED` for changes, registered
 *    DYNAMICALLY because a manifest-declared receiver is not supported for it.
 *
 * `getManagedConfiguration` is an AsyncFunction on purpose: reading the
 * restrictions bundle performs disk I/O, and Expo dispatches async function
 * bodies off the JavaScript thread.
 */
class KioskPolicyModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /**
   * Non-null means "currently registered". Set when the first JS listener
   * subscribes, cleared when the last one leaves and again on module
   * destruction, so the dynamic receiver cannot outlive the module.
   */
  private var restrictionsReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("KioskPolicy")

    Events("onManagedConfigurationChanged")

    AsyncFunction("getManagedConfiguration") {
      mapOf("restrictions" to readApplicationRestrictions())
    }

    OnStartObserving("onManagedConfigurationChanged") {
      if (restrictionsReceiver != null) return@OnStartObserving

      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          if (intent.action == Intent.ACTION_APPLICATION_RESTRICTIONS_CHANGED) {
            // The event carries no payload: JS re-reads the configuration, so
            // there is only ever one way to obtain it.
            this@KioskPolicyModule.sendEvent("onManagedConfigurationChanged", emptyMap<String, Any?>())
          }
        }
      }
      // A system-sent protected broadcast. RECEIVER_NOT_EXPORTED satisfies the
      // API 33+ registration requirement and never blocks system delivery.
      ContextCompat.registerReceiver(
        context,
        receiver,
        IntentFilter(Intent.ACTION_APPLICATION_RESTRICTIONS_CHANGED),
        ContextCompat.RECEIVER_NOT_EXPORTED
      )
      restrictionsReceiver = receiver
    }

    OnStopObserving("onManagedConfigurationChanged") {
      unregisterRestrictionsReceiver()
    }

    OnDestroy {
      unregisterRestrictionsReceiver()
    }
  }

  private fun unregisterRestrictionsReceiver() {
    restrictionsReceiver?.let { receiver ->
      // Tearing down observation must never crash the app if the react context
      // died first and the receiver is already gone.
      runCatching { context.unregisterReceiver(receiver) }
    }
    restrictionsReceiver = null
  }

  /**
   * Every key currently set for this package — including
   * `restrictions_pending` when the DPC sets it — reduced to JSON-safe
   * primitives. String/Boolean/Int pass through; anything else becomes its
   * string form. A null value means "unset" in Android bundle semantics, so
   * the key is dropped rather than emitted as null, which would fail the Zod
   * boundary in JS and reject the whole payload.
   */
  private fun readApplicationRestrictions(): Map<String, Any> {
    val restrictionsManager = context.getSystemService(RestrictionsManager::class.java)
      ?: return emptyMap()
    val restrictions: Bundle = restrictionsManager.applicationRestrictions ?: return emptyMap()

    val result = mutableMapOf<String, Any>()
    for (key in restrictions.keySet()) {
      val value = restrictions.get(key) ?: continue
      result[key] = when (value) {
        is String, is Boolean, is Int -> value
        else -> value.toString()
      }
    }
    return result
  }
}
