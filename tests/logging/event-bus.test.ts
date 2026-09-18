import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../../src/logging/event-bus.js';
import type { TaskStartEvent, TaskCompleteEvent } from '../../src/logging/types.js';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('subscribe', () => {
    it('should register a listener for specific event type', () => {
      const listener = vi.fn();
      eventBus.subscribe('task.start', listener);

      const event: TaskStartEvent = {
        type: 'task.start',
        taskId: 'test-1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 1, max: 3 },
      };

      eventBus.emit(event);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should register a listener for all events', () => {
      const listener = vi.fn();
      eventBus.subscribe('*', listener);

      const event1: TaskStartEvent = {
        type: 'task.start',
        taskId: 'test-1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 1, max: 3 },
      };

      const event2: TaskCompleteEvent = {
        type: 'task.complete',
        taskId: 'test-1',
        taskType: 'writer',
        chapterId: 'ch001',
        duration: 1000,
      };

      eventBus.emit(event1);
      eventBus.emit(event2);

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should not call listener for different event type', () => {
      const listener = vi.fn();
      eventBus.subscribe('task.start', listener);

      const event: TaskCompleteEvent = {
        type: 'task.complete',
        taskId: 'test-1',
        taskType: 'writer',
        chapterId: 'ch001',
        duration: 1000,
      };

      eventBus.emit(event);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('should remove a specific listener', () => {
      const listener = vi.fn();
      const unsubscribe = eventBus.subscribe('task.start', listener);

      unsubscribe();

      const event: TaskStartEvent = {
        type: 'task.start',
        taskId: 'test-1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 1, max: 3 },
      };

      eventBus.emit(event);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('should call multiple listeners in order', () => {
      const callOrder: number[] = [];
      const listener1 = vi.fn(() => callOrder.push(1));
      const listener2 = vi.fn(() => callOrder.push(2));

      eventBus.subscribe('task.start', listener1);
      eventBus.subscribe('task.start', listener2);

      const event: TaskStartEvent = {
        type: 'task.start',
        taskId: 'test-1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 1, max: 3 },
      };

      eventBus.emit(event);

      expect(callOrder).toEqual([1, 2]);
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = vi.fn();

      eventBus.subscribe('task.start', errorListener);
      eventBus.subscribe('task.start', normalListener);

      const event: TaskStartEvent = {
        type: 'task.start',
        taskId: 'test-1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 1, max: 3 },
      };

      // Should not throw
      expect(() => eventBus.emit(event)).not.toThrow();
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should remove all listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventBus.subscribe('task.start', listener1);
      eventBus.subscribe('task.complete', listener2);

      eventBus.clear();

      const event: TaskStartEvent = {
        type: 'task.start',
        taskId: 'test-1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 1, max: 3 },
      };

      eventBus.emit(event);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe('getListenerCount', () => {
    it('should return correct listener count', () => {
      expect(eventBus.getListenerCount('task.start')).toBe(0);

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventBus.subscribe('task.start', listener1);
      expect(eventBus.getListenerCount('task.start')).toBe(1);

      eventBus.subscribe('task.start', listener2);
      expect(eventBus.getListenerCount('task.start')).toBe(2);

      eventBus.subscribe('task.complete', vi.fn());
      expect(eventBus.getListenerCount('task.start')).toBe(2);
      expect(eventBus.getListenerCount('task.complete')).toBe(1);
    });
  });
});
