"use strict";
/**
 * SHYFT Parser V2 - Performance Tracking
 *
 * Purpose: Track component-level performance metrics
 *
 * Task 15.1: Add performance tracking
 * Requirement: 7.1 - Performance monitoring
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceTracker = void 0;
var PerformanceTracker = /** @class */ (function () {
    function PerformanceTracker(signature) {
        this.componentStartTime = 0;
        this.metrics = {
            totalMs: 0,
            components: [],
            signature: signature,
            timestamp: Date.now(),
        };
    }
    /**
     * Start tracking a component
     */
    PerformanceTracker.prototype.startComponent = function (componentName) {
        this.componentStartTime = Date.now();
    };
    /**
     * End tracking a component and record duration
     */
    PerformanceTracker.prototype.endComponent = function (componentName) {
        var duration = Date.now() - this.componentStartTime;
        this.metrics.components.push({
            component: componentName,
            durationMs: duration,
        });
    };
    /**
     * Get current metrics
     */
    PerformanceTracker.prototype.getMetrics = function () {
        this.metrics.totalMs = this.metrics.components.reduce(function (sum, c) { return sum + c.durationMs; }, 0);
        return this.metrics;
    };
    /**
     * Get summary string for logging
     */
    PerformanceTracker.prototype.getSummary = function () {
        var metrics = this.getMetrics();
        var componentSummary = metrics.components
            .map(function (c) { return "".concat(c.component, ":").concat(c.durationMs, "ms"); })
            .join(', ');
        return "Total: ".concat(metrics.totalMs, "ms [").concat(componentSummary, "]");
    };
    return PerformanceTracker;
}());
exports.PerformanceTracker = PerformanceTracker;
