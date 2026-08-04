export interface PreviewLoadCallbacks<T> {
  loading: () => void;
  ready: (value: T) => void;
  failed: () => void;
}

/** Owns latest-request-wins semantics without depending on DOM or Three.js.
 * Every promise receives both fulfillment and rejection handlers, so a load
 * that settles after replacement/disposal is ignored rather than leaked. */
export class PreviewLoadState<T> {
  private revision = 0;
  private disposed = false;

  begin(load: () => Promise<T>, callbacks: PreviewLoadCallbacks<T>): void {
    if (this.disposed) return;
    const revision = ++this.revision;
    callbacks.loading();
    let pending: Promise<T>;
    try {
      pending = load();
    } catch {
      if (revision === this.revision && !this.disposed) callbacks.failed();
      return;
    }
    void pending.then(
      (value) => {
        if (revision === this.revision && !this.disposed) callbacks.ready(value);
      },
      () => {
        if (revision === this.revision && !this.disposed) callbacks.failed();
      },
    );
  }

  dispose(): void {
    this.disposed = true;
    this.revision++;
  }
}
