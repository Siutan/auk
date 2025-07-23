/**
 * Generic trigger source interface for external event sources.
 * Any trigger (cron, MQ, HTTP) implements `subscribe()` to invoke the handler when an external event occurs.
 *
 * @template SP - Source payload type (void for triggers like cron that don't provide data)
 */
export interface TriggerSource<SP = void> {
  /**
   * Subscribe to the trigger source with a listener function.
   * @param listener - Function to call when the trigger fires
   * @returns Optional cleanup function to unsubscribe
   */
  subscribe(listener: (payload: SP) => Promise<void> | void): void | (() => void) | (() => Promise<void>);
}
