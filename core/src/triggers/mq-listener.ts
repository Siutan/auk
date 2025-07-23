import type { TriggerSource } from "../triggers.js";

/**
 * Message queue client interface for abstraction.
 */
export interface MQClient<Msg = any> {
  consume(queue: string, onMessage: (msg: Msg) => void): void | (() => void);
}

/**
 * Create a message queue listener trigger source.
 *
 * @template Msg - The message type from the queue
 * @param queue - Queue name to listen to
 * @param client - MQ client that implements the consume interface
 * @returns TriggerSource that fires when messages arrive
 */
export function mqListener<Msg>(
  queue: string,
  client: MQClient<Msg>
): TriggerSource<Msg> {
  return {
    subscribe(listener) {
      const cleanup = client.consume(queue, async (msg) => {
        try {
          await listener(msg);
        } catch (err) {
          console.error("[mq] handler error", err);
        }
      });
      
      // Return cleanup function if provided by the client
      return cleanup;
    },
  };
}
