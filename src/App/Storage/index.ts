import type { AkkoObjectUpdatedProperty } from "white-web-sdk";
import { get, has, isObject } from "lodash";
import { SideEffectManager } from "side-effect-manager";
import type { AppContext } from "../../AppContext";
import { safeListenPropsUpdated } from "../../Utils/Reactive";
import { isRef, makeRef, plainObjectKeys } from "./utils";
import type { Diff, MaybeRefValue, RefValue } from "./typings";
import { StorageEvent } from "./StorageEvent";

export * from './typings';

const STORAGE_NS = "_WM-STORAGE_";

export class Storage<TState = any> implements Storage<TState> {
  readonly id: string;

  private readonly _context: AppContext<{ [STORAGE_NS]: TState }>;
  private readonly _sideEffect = new SideEffectManager();
  private _state: TState;
  private _destroyed = false;

  private _refMap = new WeakMap<any, RefValue>();

  /**
   * `setState` alters local state immediately before sending to server. This will cache the old value for onStateChanged diffing.
   */
  private _lastValue = new Map<string | number | symbol, TState[Extract<keyof TState, string>]>();

  constructor(context: AppContext<any>, id: string, defaultState?: TState) {
    if (id == null) {
      throw new Error("Cannot create Storage with empty id.");
    }

    if (defaultState && !isObject(defaultState)) {
      throw new Error(`Default state for Storage ${id} is not an object.`);
    }

    this._context = context;
    this.id = id;

    const attrs = context.getAttributes();
    this._state = {} as TState;
    const rawState = get<TState>(attrs, [STORAGE_NS, id], this._state);

    if (this._context.getIsWritable()) {
      if (!isObject(rawState) || rawState === this._state) {
        if (!attrs[STORAGE_NS]) {
          this._context.updateAttributes([STORAGE_NS], {});
        }
        this._context.updateAttributes([STORAGE_NS, this.id], this._state);
        if (defaultState) {
          this.setState(defaultState);
        }
      } else {
        // strip mobx
        plainObjectKeys(rawState).forEach(key => {
          try {
            const rawValue = isObject(rawState[key]) ? JSON.parse(JSON.stringify(rawState[key])) : rawState[key];
            if (isRef<TState[Extract<keyof TState, string>]>(rawValue)) {
              this._state[key] = rawValue.v;
              if (isObject(rawValue.v)) {
                this._refMap.set(rawValue.v, rawValue);
              }
            } else {
              this._state[key] = rawValue;
            }
          } catch (e) {
            console.error(e);
          }
        });
      }
    }

    this._sideEffect.addDisposer(
      safeListenPropsUpdated(
        () => get(context.getAttributes(), [STORAGE_NS, this.id]),
        this._updateProperties.bind(this),
        this.destroy.bind(this)
      )
    );
  }

  get state(): Readonly<TState> {
    if (this._destroyed) {
      console.warn(`Accessing state on destroyed Storage "${this.id}"`)
    }
    return this._state;
  }

  readonly onStateChanged = new StorageEvent<Diff<TState>>();

  ensureState(state: Partial<TState>): void {
    return this.setState(
      plainObjectKeys(state).reduce((payload, key) => {
        if (!has(this._state, key)) {
          payload[key] = state[key];
        }
        return payload;
      }, {} as Partial<TState>)
    );
  }

  setState(state: Partial<TState>): void {
    if (this._destroyed) {
      console.error(new Error(`Cannot call setState on destroyed Storage "${this.id}".`));
      return;
    }

    if (!this._context.getIsWritable()) {
      console.error(new Error(`Cannot setState on Storage "${this.id}" without writable access`), state);
      return;
    }

    const keys = plainObjectKeys(state);
    if (keys.length > 0) {
      keys.forEach(key => {
        const value = state[key];
        if (value === this._state[key]) {
          return;
        }

        if (value === void 0) {
          this._lastValue.set(key, this._state[key]);
          delete this._state[key];
          this._context.updateAttributes([STORAGE_NS, this.id, key], value);
        } else {
          this._lastValue.set(key, this._state[key]);
          this._state[key] = value as TState[Extract<keyof TState, string>];

          let payload: MaybeRefValue<typeof value> = value;
          if (isObject(value)) {
            let refValue = this._refMap.get(value);
            if (!refValue) {
              refValue = makeRef(value);
              this._refMap.set(value, refValue);
            }
            payload = refValue;
          }

          this._context.updateAttributes([STORAGE_NS, this.id, key], payload);
        }
      });
    }
  }

  emptyStore(): void {
    if (this._destroyed) {
      console.error(new Error(`Cannot empty destroyed Storage "${this.id}".`));
      return;
    }

    if (!this._context.getIsWritable()) {
      console.error(new Error(`Cannot empty Storage "${this.id}" without writable access.`));
      return;
    }

    this._context.updateAttributes([STORAGE_NS, this.id], {});
  }

  deleteStore(): void {
    if (!this._context.getIsWritable()) {
      console.error(new Error(`Cannot delete Storage "${this.id}" without writable access.`));
      return;
    }

    this.destroy();

    this._context.updateAttributes([STORAGE_NS, this.id], void 0);
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  destroy() {
    this._destroyed = true;
    this._sideEffect.flushAll();
  }

  private _updateProperties(actions: ReadonlyArray<AkkoObjectUpdatedProperty<TState, string>>): void {
    if (this._destroyed) {
      console.error(new Error(`Cannot call _updateProperties on destroyed Storage "${this.id}".`));
      return;
    }

    if (actions.length > 0) {
      const diffs: Diff<TState> = {};

      for (let i = 0; i < actions.length; i++) {
        try {
          const action = actions[i]
          const key = action.key as Extract<keyof TState, string>;
          const value = isObject(action.value) ? JSON.parse(JSON.stringify(action.value)) : action.value;
          let oldValue: TState[Extract<keyof TState, string>] | undefined;
          if (this._lastValue.has(key)) {
            oldValue = this._lastValue.get(key);
            this._lastValue.delete(key);
          }

          switch (action.kind) {
            case 2: {
              // Removed
              if (has(this._state, key)) {
                oldValue = this._state[key];
                delete this._state[key];
              }
              diffs[key] = { oldValue };
              break;
            }
            default: {
              let newValue = value;

              if (isRef<TState[Extract<keyof TState, string>]>(value)) {
                const { k, v } = value;
                const curValue = this._state[key];
                if (isObject(curValue) && this._refMap.get(curValue)?.k === k) {
                  newValue = curValue;
                } else {
                  newValue = v;
                  if (isObject(v)) {
                    this._refMap.set(v, value);
                  }
                }
              }

              if (newValue !== this._state[key]) {
                oldValue = this._state[key];
                this._state[key] = newValue;
              }

              diffs[key] = { newValue, oldValue };
              break;
            }
          }
        } catch (e) {
          console.error(e)
        }
      }

      this.onStateChanged.dispatch(diffs);
    }
  }
}