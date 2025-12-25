import { EventEmitter } from 'events'

interface BackgroundProcess {
  id: string
  type: 'interval' | 'timeout' | 'listener' | 'connection' | 'server' | 'cron'
  resource: NodeJS.Timeout | NodeJS.Immediate | EventEmitter | any
  description: string
  cleanup: () => void
  forceCleanup?: () => void
}

class ProcessManager {
  private processes: Map<string, BackgroundProcess> = new Map()
  private isShuttingDown = false
  private shutdownTimeout: NodeJS.Timeout | null = null

  // Register a new background process
  register(
    id: string,
    type: BackgroundProcess['type'],
    resource: any,
    description: string,
    cleanup: () => void,
    forceCleanup?: () => void,
  ): void {
    if (this.isShuttingDown) {
      console.warn(`⚠️ Process ${id} not registered - server is shutting down`)
      return
    }

    const process: BackgroundProcess = {
      id,
      type,
      resource,
      description,
      cleanup,
      forceCleanup,
    }

    this.processes.set(id, process)
    console.log(`📝 Registered process: ${id} (${type}) - ${description}`)
  }

  // Unregister a process
  unregister(id: string): boolean {
    const process = this.processes.get(id)
    if (process) {
      try {
        process.cleanup()
        this.processes.delete(id)
        console.log(`🗑️ Unregistered process: ${id}`)
        return true
      } catch (error) {
        console.error(`❌ Error unregistering process ${id}:`, error)
        return false
      }
    }
    return false
  }

  // Get all registered processes
  getAllProcesses(): BackgroundProcess[] {
    return Array.from(this.processes.values())
  }

  // Get process count
  getProcessCount(): number {
    return this.processes.size
  }

  // Force cleanup all processes with timeout
  async cleanupAll(): Promise<void> {
    if (this.isShuttingDown) {
      return
    }

    this.isShuttingDown = true
    console.log(`🔄 Cleaning up ${this.processes.size} background processes...`)

    // Set a timeout for force shutdown
    this.shutdownTimeout = setTimeout(() => {
      console.log('⏰ Shutdown timeout reached, forcing exit...')
      this.forceShutdown()
    }, 10000) // 10 seconds timeout

    try {
      // First pass: gentle cleanup
      const cleanupPromises: Promise<void>[] = []

      for (const [id, process] of this.processes) {
        try {
          console.log(`🧹 Cleaning up process: ${id} (${process.type})`)
          process.cleanup()
          cleanupPromises.push(Promise.resolve())
        } catch (error) {
          console.error(`❌ Error cleaning up process ${id}:`, error)
          cleanupPromises.push(Promise.resolve())
        }
      }

      await Promise.all(cleanupPromises)

      // Clear the timeout since cleanup was successful
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout)
        this.shutdownTimeout = null
      }

      console.log('✅ All background processes cleaned up successfully')
    } catch (error) {
      console.error('❌ Error during cleanup, forcing shutdown:', error)
      this.forceShutdown()
    }
  }

  // Force shutdown - kill all remaining processes
  private forceShutdown(): void {
    console.log('💥 FORCE SHUTDOWN - Killing all remaining processes...')

    // Force cleanup all remaining processes
    for (const [id, process] of this.processes) {
      try {
        console.log(`💀 Force killing process: ${id}`)
        if (process.forceCleanup) {
          process.forceCleanup()
        } else {
          // Default force cleanup based on type
          this.forceCleanupByType(process)
        }
      } catch (error) {
        console.error(`❌ Error force killing process ${id}:`, error)
      }
    }

    this.processes.clear()
    console.log('💀 Force shutdown completed')
  }

  // Force cleanup based on process type
  private forceCleanupByType(process: BackgroundProcess): void {
    try {
      switch (process.type) {
        case 'interval':
          if (process.resource && typeof process.resource.ref === 'function') {
            process.resource.unref()
          }
          break
        case 'timeout':
          if (process.resource && typeof process.resource.ref === 'function') {
            process.resource.unref()
          }
          break
        case 'listener':
          if (
            process.resource &&
            typeof process.resource.removeAllListeners === 'function'
          ) {
            process.resource.removeAllListeners()
          }
          break
        case 'connection':
          if (
            process.resource &&
            typeof process.resource.destroy === 'function'
          ) {
            process.resource.destroy()
          }
          break
        case 'server':
          if (
            process.resource &&
            typeof process.resource.close === 'function'
          ) {
            process.resource.close()
          }
          break
        case 'cron':
          if (process.resource && typeof process.resource.stop === 'function') {
            process.resource.stop()
          }
          break
      }
    } catch (error) {
      console.error(`❌ Error in force cleanup for ${process.type}:`, error)
    }
  }

  // Check if server is shutting down
  isServerShuttingDown(): boolean {
    return this.isShuttingDown
  }

  // Get process status
  getStatus(): { total: number; types: Record<string, number> } {
    const types: Record<string, number> = {}

    for (const process of this.processes.values()) {
      types[process.type] = (types[process.type] || 0) + 1
    }

    return {
      total: this.processes.size,
      types,
    }
  }

  // Emergency cleanup - for when things go really wrong
  emergencyCleanup(): void {
    console.log('🚨 EMERGENCY CLEANUP - Nuclear option...')

    // Kill all Node.js processes related to this app
    try {
      const { execSync } = require('child_process')
      execSync('pkill -f "whale-tracker"', { stdio: 'ignore' })
      execSync('pkill -f "ts-node-dev"', { stdio: 'ignore' })
      console.log('💀 Emergency cleanup completed')
    } catch (error) {
      console.error('❌ Emergency cleanup failed:', error)
    }
  }
}

// Export singleton instance
export const processManager = new ProcessManager()

// Helper functions for common process types
export const registerInterval = (
  id: string,
  description: string,
  interval: NodeJS.Timeout,
): void => {
  processManager.register(
    id,
    'interval',
    interval,
    description,
    () => {
      clearInterval(interval)
    },
    () => {
      clearInterval(interval)
      if (interval && typeof interval.unref === 'function') {
        interval.unref()
      }
    },
  )
}

export const registerTimeout = (
  id: string,
  description: string,
  timeout: NodeJS.Timeout,
): void => {
  processManager.register(
    id,
    'timeout',
    timeout,
    description,
    () => {
      clearTimeout(timeout)
    },
    () => {
      clearTimeout(timeout)
      if (timeout && typeof timeout.unref === 'function') {
        timeout.unref()
      }
    },
  )
}

export const registerListener = (
  id: string,
  description: string,
  emitter: EventEmitter,
  event: string,
  listener: (...args: any[]) => void,
): void => {
  processManager.register(
    id,
    'listener',
    emitter,
    description,
    () => {
      emitter.off(event, listener)
    },
    () => {
      emitter.off(event, listener)
      emitter.removeAllListeners(event)
    },
  )
}

export const registerConnection = (
  id: string,
  description: string,
  connection: any,
  closeMethod: string = 'close',
): void => {
  processManager.register(
    id,
    'connection',
    connection,
    description,
    () => {
      if (connection && typeof connection[closeMethod] === 'function') {
        connection[closeMethod]()
      }
    },
    () => {
      if (connection && typeof connection.destroy === 'function') {
        connection.destroy()
      } else if (connection && typeof connection[closeMethod] === 'function') {
        connection[closeMethod]()
      }
    },
  )
}

export const registerServer = (
  id: string,
  description: string,
  server: any,
): void => {
  processManager.register(
    id,
    'server',
    server,
    description,
    () => {
      if (server && typeof server.close === 'function') {
        server.close()
      }
    },
    () => {
      if (server && typeof server.close === 'function') {
        server.close()
      }
    },
  )
}

export const registerCron = (
  id: string,
  description: string,
  cronJob: any,
): void => {
  processManager.register(
    id,
    'cron',
    cronJob,
    description,
    () => {
      if (cronJob && typeof cronJob.stop === 'function') {
        cronJob.stop()
      }
    },
    () => {
      if (cronJob && typeof cronJob.stop === 'function') {
        cronJob.stop()
      }
    },
  )
}
