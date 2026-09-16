/**
 * PriorityQueue - 优先级队列
 * 
 * 使用最小堆实现，priority 数值越小优先级越高
 * 优先级相同时，sequence 数值越小越优先（FIFO）
 */

export class PriorityQueue<T extends { priority: number; sequence: number }> {
  private heap: T[] = [];

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * 入队
   */
  enqueue(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * 出队（返回最高优先级元素）
   */
  dequeue(): T | null {
    if (this.heap.length === 0) {
      return null;
    }

    const top = this.heap[0];
    const last = this.heap.pop()!;

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }

    return top;
  }

  /**
   * 查看最高优先级元素（不出队）
   */
  peek(): T | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.heap = [];
  }

  /**
   * 转换为数组（按优先级排序）
   */
  toArray(): T[] {
    return [...this.heap].sort((a, b) => this.compareItems(a, b));
  }

  /**
   * 序列化
   */
  serialize(): T[] {
    return this.toArray();
  }

  /**
   * 反序列化
   */
  static deserialize<T extends { priority: number; sequence: number }>(items: T[]): PriorityQueue<T> {
    const queue = new PriorityQueue<T>();
    for (const item of items) {
      queue.enqueue(item);
    }
    return queue;
  }

  private compareItems(a: T, b: T): number {
    const priorityDiff = a.priority - b.priority;
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return a.sequence - b.sequence;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compareItems(this.heap[parentIndex], this.heap[index]) <= 0) {
        break;
      }
      this.swap(parentIndex, index);
      index = parentIndex;
    }
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;

    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this.compareItems(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }

      if (right < length && this.compareItems(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }

      if (smallest === index) {
        break;
      }

      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }
}
