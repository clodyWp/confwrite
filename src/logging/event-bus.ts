import type { LogEvent, LogEventType } from './types.js';

/**
 * 事件监听器类型
 */
type EventListener<T extends LogEvent = LogEvent> = (event: T) => void;

/**
 * 事件总线 - 发布/订阅模式
 */
export class EventBus {
  private listeners: Map<string, Set<EventListener>> = new Map();

  /**
   * 订阅事件
   * @param eventType 事件类型，'*' 表示订阅所有事件
   * @param listener 监听器函数
   * @returns 取消订阅函数
   */
  subscribe<T extends LogEvent>(
    eventType: T['type'] | '*',
    listener: EventListener<T>
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    const listeners = this.listeners.get(eventType)!;
    listeners.add(listener as EventListener);

    // 返回取消订阅函数
    return () => {
      listeners.delete(listener as EventListener);
      if (listeners.size === 0) {
        this.listeners.delete(eventType);
      }
    };
  }

  /**
   * 发布事件
   * @param event 事件对象
   */
  emit(event: LogEvent): void {
    // 调用特定类型的监听器
    const specificListeners = this.listeners.get(event.type);
    if (specificListeners) {
      for (const listener of specificListeners) {
        try {
          listener(event);
        } catch (error) {
          // 静默处理监听器错误，避免影响其他监听器
          console.error('Event listener error:', error);
        }
      }
    }

    // 调用通配符监听器
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('Event listener error:', error);
        }
      }
    }
  }

  /**
   * 清除所有监听器
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * 获取指定事件类型的监听器数量
   */
  getListenerCount(eventType: LogEventType | '*'): number {
    return this.listeners.get(eventType)?.size ?? 0;
  }
}
