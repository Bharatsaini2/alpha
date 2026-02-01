/**
 * SHYFT Parser V2 - Performance Tracking
 * 
 * Purpose: Track component-level performance metrics
 * 
 * Task 15.1: Add performance tracking
 * Requirement: 7.1 - Performance monitoring
 */

export interface ComponentTiming {
  component: string
  durationMs: number
}

export interface PerformanceMetrics {
  totalMs: number
  components: ComponentTiming[]
  signature: string
  timestamp: number
}

export class PerformanceTracker {
  private metrics: PerformanceMetrics
  private componentStartTime: number = 0

  constructor(signature: string) {
    this.metrics = {
      totalMs: 0,
      components: [],
      signature,
      timestamp: Date.now(),
    }
  }

  /**
   * Start tracking a component
   */
  startComponent(componentName: string): void {
    this.componentStartTime = Date.now()
  }

  /**
   * End tracking a component and record duration
   */
  endComponent(componentName: string): void {
    const duration = Date.now() - this.componentStartTime
    this.metrics.components.push({
      component: componentName,
      durationMs: duration,
    })
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    this.metrics.totalMs = this.metrics.components.reduce(
      (sum, c) => sum + c.durationMs,
      0
    )
    return this.metrics
  }

  /**
   * Get summary string for logging
   */
  getSummary(): string {
    const metrics = this.getMetrics()
    const componentSummary = metrics.components
      .map((c) => `${c.component}:${c.durationMs}ms`)
      .join(', ')
    return `Total: ${metrics.totalMs}ms [${componentSummary}]`
  }
}
