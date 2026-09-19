package expo.modules.kioskpolicy

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.RestrictionsManager
import android.os.Bundle
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The managed configuration could not be READ. Distinct from "there is no
 * managed configuration", which is an empty map and a legitimate answer.
 *
 * It must stay distinct: JS derives an ordinary device from an empty bundle,
 * so collapsing an unreadable state into one would put the Preparation
 * experience on a locked kiosk tablet. Throwing lets `readDeviceMode`'s
 * existing catch fail closed to `unknown`.
 */
class RestrictionsUnreadableException(reason: String) :
  CodedException("ERR_KIOSK_POLICY_UNREADABLE", "Managed configuration unreadable: $reason", null)

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
   *
   * `@Volatile` plus a synchronized register/unregister pair: OnDestroy can run
   * on a different thread from OnStopObserving, and an unsynchronized
   * read-modify-write there could either double-unregister or, in the reverse
   * interleaving, leave a receiver registered past the module's lifetime.
   */
  @Volatile
  private var restrictionsReceiver: BroadcastReceiver? = null

  /** Guards every read-modify-write of `restrictionsReceiver`. */
  private val receiverLock = Any()

  override fun definition() = ModuleDefinition {
    Name("KioskPolicy")

    Events("onManagedConfigurationChanged")

    AsyncFunction("getManagedConfiguration") {
      mapOf("restrictions" to readApplicationRestrictions())
    }

    OnStartObserving("onManagedConfigurationChanged") {
      synchronized(receiverLock) {
        if (restrictionsReceiver != null) return@OnStartObserving

        val receiver = object : BroadcastReceiver() {
          override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_APPLICATION_RESTRICTIONS_CHANGED) {
              // The event carries no payload: JS re-reads the configuration, so
              // there is only ever one way to obtain it.
              this@KioskPolicyModule.sendEvent(
                "onManagedConfigurationChanged",
                emptyMap<String, Any?>()
              )
            }
          }
        }
        // RECEIVER_NOT_EXPORTED, deliberately, and re-verified rather than
        // assumed:
        //
        //  - ACTION_APPLICATION_RESTRICTIONS_CHANGED is declared
        //    <protected-broadcast> in AOSP frameworks/base
        //    core/res/AndroidManifest.xml, so only the system can send it —
        //    no third-party app can reach this receiver whatever the flag is.
        //  - Android's broadcast guide requires one of the two export flags on
        //    API 33+; RECEIVER_EXPORTED is only needed to receive broadcasts
        //    from OTHER apps, including highly privileged ones such as
        //    Bluetooth and telephony that run outside the system UID. This
        //    broadcast comes from system_server itself, which NOT_EXPORTED
        //    receives.
        //
        // So EXPORTED would widen the receiver's exposure while adding no
        // delivery. NOT_EXPORTED is the correct flag here, not the cautious one.
        ContextCompat.registerReceiver(
          context,
          receiver,
          IntentFilter(Intent.ACTION_APPLICATION_RESTRICTIONS_CHANGED),
          ContextCompat.RECEIVER_NOT_EXPORTED
        )
        restrictionsReceiver = receiver
      }
    }

    OnStopObserving("onManagedConfigurationChanged") {
      unregisterRestrictionsReceiver()
    }

    OnDestroy {
      unregisterRestrictionsReceiver()
    }
  }

  private fun unregisterRestrictionsReceiver() {
    synchronized(receiverLock) {
      restrictionsReceiver?.let { receiver ->
        // Tearing down observation must never crash the app if the react context
        // died first and the receiver is already gone.
        runCatching { context.unregisterReceiver(receiver) }
      }
      restrictionsReceiver = null
    }
  }

  /**
   * Every key currently set for this package — including
   * `restrictions_pending` when the DPC sets it — reduced to JSON-safe
   * primitives. String/Boolean/Int pass through; anything else becomes its
   * string form.
   *
   * An EMPTY map means "this package has no managed configuration", which JS
   * reads as an ordinary tablet. So nothing that merely failed to be read may
   * return an empty map: a missing system service and a null bundle are
   * unreadable states, not evidence of an unmanaged device, and they throw so
   * the JS layer can fail closed to `unknown` instead.
   *
   * A key present with a NULL value is the same distinction one level down: it
   * is a key the DPC set (some consoles clear a value that way), not a key
   * that was never set, so it is emitted as an empty string rather than
   * dropped. JS then sees a present-but-unrecognised value and withholds
   * Preparation, instead of seeing an absent key and granting it.
   */
  private fun readApplicationRestrictions(): Map<String, Any> {
    val restrictionsManager = context.getSystemService(RestrictionsManager::class.java)
      ?: throw RestrictionsUnreadableException("RestrictionsManager is unavailable")
    val restrictions: Bundle = restrictionsManager.applicationRestrictions
      ?: throw RestrictionsUnreadableException("the application restrictions bundle is null")

    val result = mutableMapOf<String, Any>()
    for (key in restrictions.keySet()) {
      result[key] = when (val value = restrictions.get(key)) {
        null -> ""
        is String, is Boolean, is Int -> value
        else -> value.toString()
      }
    }
    return result
  }
}
