import { describe, it, expect, beforeEach } from 'vitest';
import { PriorityQueue } from '../../src/scheduler/priority-queue.js';
import type { Task } from '../../src/scheduler/types.js';

let sequenceCounter = 0;

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    type: 'write',
    chapterId: 'ch001',
    status: 'queued',
    priority: 0,
    sequence: sequenceCounter++,
    attempt: 0,
    prompt: 'test',
    dependencies: [],
    ...overrides,
  };
}

describe('PriorityQueue', () => {
  let queue: PriorityQueue<Task>;

  beforeEach(() => {
    queue = new PriorityQueue<Task>();
    sequenceCounter = 0; // 重置计数器
  });

  describe('enqueue/dequeue', () => {
    it('returns items in priority order (lower number = higher priority)', () => {
      queue.enqueue(createTask({ id: 'low', priority: 10 }));
      queue.enqueue(createTask({ id: 'high', priority: 1 }));
      queue.enqueue(createTask({ id: 'mid', priority: 5 }));

      expect(queue.dequeue()?.id).toBe('high');
      expect(queue.dequeue()?.id).toBe('mid');
      expect(queue.dequeue()?.id).toBe('low');
    });

    it('returns null when empty', () => {
      expect(queue.dequeue()).toBeNull();
    });

    it('handles equal priorities (FIFO)', () => {
      queue.enqueue(createTask({ id: 'first', priority: 1 }));
      queue.enqueue(createTask({ id: 'second', priority: 1 }));
      queue.enqueue(createTask({ id: 'third', priority: 1 }));

      expect(queue.dequeue()?.id).toBe('first');
      expect(queue.dequeue()?.id).toBe('second');
      expect(queue.dequeue()?.id).toBe('third');
    });
  });

  describe('peek', () => {
    it('returns highest priority item without removing', () => {
      queue.enqueue(createTask({ id: 'low', priority: 10 }));
      queue.enqueue(createTask({ id: 'high', priority: 1 }));

      expect(queue.peek()?.id).toBe('high');
      expect(queue.size).toBe(2);
    });

    it('returns null when empty', () => {
      expect(queue.peek()).toBeNull();
    });
  });

  describe('size/isEmpty', () => {
    it('tracks size correctly', () => {
      expect(queue.size).toBe(0);
      expect(queue.isEmpty).toBe(true);

      queue.enqueue(createTask());
      expect(queue.size).toBe(1);
      expect(queue.isEmpty).toBe(false);

      queue.dequeue();
      expect(queue.size).toBe(0);
      expect(queue.isEmpty).toBe(true);
    });
  });

  describe('clear', () => {
    it('removes all items', () => {
      queue.enqueue(createTask({ id: 'a' }));
      queue.enqueue(createTask({ id: 'b' }));
      queue.enqueue(createTask({ id: 'c' }));

      queue.clear();
      expect(queue.size).toBe(0);
      expect(queue.dequeue()).toBeNull();
    });
  });

  describe('toArray', () => {
    it('returns items in priority order', () => {
      queue.enqueue(createTask({ id: 'low', priority: 10 }));
      queue.enqueue(createTask({ id: 'high', priority: 1 }));
      queue.enqueue(createTask({ id: 'mid', priority: 5 }));

      const arr = queue.toArray();
      expect(arr.map(t => t.id)).toEqual(['high', 'mid', 'low']);
    });

    it('does not modify queue', () => {
      queue.enqueue(createTask({ id: 'a' }));
      queue.toArray();
      expect(queue.size).toBe(1);
    });
  });

  describe('serialize/deserialize', () => {
    it('round-trips correctly', () => {
      queue.enqueue(createTask({ id: 'a', priority: 5 }));
      queue.enqueue(createTask({ id: 'b', priority: 1 }));
      queue.enqueue(createTask({ id: 'c', priority: 10 }));

      const serialized = queue.serialize();
      const restored = PriorityQueue.deserialize<Task>(serialized);

      expect(restored.size).toBe(3);
      expect(restored.dequeue()?.id).toBe('b');
      expect(restored.dequeue()?.id).toBe('a');
      expect(restored.dequeue()?.id).toBe('c');
    });

    it('handles empty queue', () => {
      const serialized = queue.serialize();
      const restored = PriorityQueue.deserialize<Task>(serialized);
      expect(restored.size).toBe(0);
    });
  });
});
