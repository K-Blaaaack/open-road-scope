/** 固定容量环形缓冲，用于每 PID 的历史采样数据 */

export class RingBuffer<T> {
  private items: (T | undefined)[];
  private head = 0;
  private count = 0;

  /**
   * @param capacity - 缓冲容量，写入超过后覆盖最旧数据
   */
  constructor(readonly capacity: number) {
    this.items = new Array<T | undefined>(capacity);
  }

  /** 写入一个元素，返回被覆盖的旧元素（若有） */
  push(item: T): T | undefined {
    const old = this.items[this.head];
    this.items[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
    return old;
  }

  /** 当前元素个数 */
  get size(): number {
    return this.count;
  }

  /** 是否已满 */
  get full(): boolean {
    return this.count === this.capacity;
  }

  /** 最新元素，空缓冲返回 undefined */
  peek(): T | undefined {
    if (this.count === 0) return undefined;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.items[idx];
  }

  /** 按时间顺序（旧→新）展开为数组 */
  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.count; i += 1) {
      const item = this.items[(this.head - this.count + i + this.capacity) % this.capacity];
      if (item !== undefined) out.push(item);
    }
    return out;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.items.fill(undefined);
  }
}
