import type {
  Room,
  MagixEventListenerOptions as WhiteMagixListenerOptions,
  Event as WhiteEvent,
  EventPhase as WhiteEventPhase,
  Scope as WhiteScope,
} from "white-web-sdk";
import type { AppManager } from "../../AppManager";

export interface MagixEventListenerOptions extends WhiteMagixListenerOptions {
  /**
   * Rapid emitted callbacks will be slowed down to this interval (in ms).
   */
  fireInterval?: number;
  /**
   * If `true`, sent events will reach self-listeners after committed to server.
   * Otherwise the events will reach self-listeners immediately.
   */
  fireSelfEventAfterCommit?: boolean;
}

export interface MagixEventMessage<
  TPayloads = any,
  TEvent extends MagixEventTypes<TPayloads> = MagixEventTypes<TPayloads>
> extends Omit<WhiteEvent, "scope" | "phase"> {
  /** Event name */
  event: TEvent;
  /** Event Payload */
  payload: TPayloads[TEvent];
  /** Whiteboard ID of the client who dispatched the event. It will be AdminObserverId for system events. */
  authorId: number;
  scope: `${WhiteScope}`;
  phase: `${WhiteEventPhase}`;
}

export type MagixEventTypes<TPayloads = any> = Extract<keyof TPayloads, string>;

export type MagixEventPayload<
  TPayloads = any,
  TEvent extends MagixEventTypes<TPayloads> = MagixEventTypes<TPayloads>
> = TPayloads[TEvent];

export type MagixEventDispatcher<TPayloads = any> = <
  TEvent extends MagixEventTypes<TPayloads> = MagixEventTypes<TPayloads>
>(
  event: TEvent,
  payload: TPayloads[TEvent]
) => void;

export type MagixEventHandler<
  TPayloads = any,
  TEvent extends MagixEventTypes<TPayloads> = MagixEventTypes<TPayloads>
> = (message: MagixEventMessage<TPayloads, TEvent>) => void;

export type MagixEventAddListener<TPayloads = any> = <
  TEvent extends MagixEventTypes<TPayloads> = MagixEventTypes<TPayloads>
>(
  event: TEvent,
  handler: MagixEventHandler<TPayloads, TEvent>,
  options?: MagixEventListenerOptions | undefined
) => void;

export type MagixEventRemoveListener<TPayloads = any> = <
  TEvent extends MagixEventTypes<TPayloads> = MagixEventTypes<TPayloads>
>(
  event: TEvent,
  handler?: MagixEventHandler<TPayloads, TEvent>
) => void;

export interface MagixEvent<TPayloads = any> {
  readonly dispatch: MagixEventDispatcher<TPayloads>;
  readonly addListener: MagixEventAddListener<TPayloads>;
  readonly removeListener: MagixEventRemoveListener<TPayloads>;
}

export const createMagixEvent = <TPayloads = any>(manager: AppManager): MagixEvent<TPayloads> => ({
  dispatch: (manager.displayer as Room).dispatchMagixEvent.bind(manager.displayer),
  addListener: manager.displayer.addMagixEventListener.bind(manager.displayer),
  removeListener: manager.displayer.removeMagixEventListener.bind(manager.displayer) as MagixEventRemoveListener<TPayloads>,
});
