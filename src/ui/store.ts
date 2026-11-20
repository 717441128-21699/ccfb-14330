/**
 * 极简响应式 store（无框架依赖）。
 * 状态变更后同步通知订阅者，UI 组件自行做局部 DOM 更新。
 */
export type Listener<T> = (state: T) => void;

export class Store<T> {
  private state: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.state = initial;
  }

  get(): T {
    return this.state;
  }

  set(partial: Partial<T>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  update(fn: (draft: T) => T): void {
    this.state = fn(this.state);
    this.emit();
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.state);
  }
}
