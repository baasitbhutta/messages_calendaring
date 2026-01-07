/**
 * Observability - Structured logging and debugging utilities
 * 
 * Provides consistent logging, performance tracking, and execution statistics
 * for rapid debugging and monitoring.
 */

// ============================================================================
// LOG LEVELS
// ============================================================================

const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Set minimum log level (DEBUG shows all, ERROR shows only errors)
const MIN_LOG_LEVEL = LogLevel.DEBUG;

// ============================================================================
// EXECUTION CONTEXT
// ============================================================================

/**
 * Global execution context for tracking state across function calls.
 * Reset at the start of each main() execution.
 */
const ExecutionContext = {
  runId: null,
  startTime: null,
  currentDate: null,
  stats: {
    daysProcessed: 0,
    daysSkipped: 0,
    checkBlocksCreated: 0,
    checkBlocksKept: 0,
    checkBlocksDeleted: 0,
    checkBlocksSkipped: 0,
    responseBlocksCreated: 0,
    responseBlocksKept: 0,
    responseBlocksDeleted: 0,
    responseBlocksSkipped: 0,
    responseBlocksShortened: 0,
    errors: 0
  },
  errors: []
};

/**
 * Initialize execution context for a new run.
 */
function initExecutionContext() {
  ExecutionContext.runId = generateRunId();
  ExecutionContext.startTime = new Date();
  ExecutionContext.currentDate = null;
  ExecutionContext.stats = {
    daysProcessed: 0,
    daysSkipped: 0,
    checkBlocksCreated: 0,
    checkBlocksKept: 0,
    checkBlocksDeleted: 0,
    checkBlocksSkipped: 0,
    responseBlocksCreated: 0,
    responseBlocksKept: 0,
    responseBlocksDeleted: 0,
    responseBlocksSkipped: 0,
    responseBlocksShortened: 0,
    errors: 0
  };
  ExecutionContext.errors = [];
}

/**
 * Generate a short unique run ID for correlating logs.
 */
function generateRunId() {
  const now = new Date();
  const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), "HHmmss");
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${random}`;
}

// ============================================================================
// LOGGING FUNCTIONS
// ============================================================================

/**
 * Log a message with level, context, and optional data.
 * 
 * @param {number} level - Log level from LogLevel enum
 * @param {string} message - Log message
 * @param {Object} data - Optional structured data to include
 */
function log(level, message, data = null) {
  if (level < MIN_LOG_LEVEL) {
    return;
  }
  
  const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  const levelName = levelNames[level] || 'UNKNOWN';
  
  const context = [];
  if (ExecutionContext.runId) {
    context.push(`run=${ExecutionContext.runId}`);
  }
  if (ExecutionContext.currentDate) {
    context.push(`date=${formatDateShort(ExecutionContext.currentDate)}`);
  }
  
  const contextStr = context.length > 0 ? `[${context.join(' ')}]` : '';
  const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
  
  Logger.log(`[${levelName}] ${contextStr} ${message}${dataStr}`);
}

/**
 * Log at DEBUG level - detailed information for debugging.
 */
function logDebug(message, data = null) {
  log(LogLevel.DEBUG, message, data);
}

/**
 * Log at INFO level - general operational information.
 */
function logInfo(message, data = null) {
  log(LogLevel.INFO, message, data);
}

/**
 * Log at WARN level - something unexpected but recoverable.
 */
function logWarn(message, data = null) {
  log(LogLevel.WARN, message, data);
}

/**
 * Log at ERROR level - something failed.
 */
function logError(message, data = null) {
  log(LogLevel.ERROR, message, data);
  ExecutionContext.stats.errors++;
  ExecutionContext.errors.push({
    timestamp: new Date().toISOString(),
    message: message,
    data: data
  });
}

// ============================================================================
// CONTEXT MANAGEMENT
// ============================================================================

/**
 * Set the current date being processed.
 */
function setCurrentDate(date) {
  ExecutionContext.currentDate = date;
}

/**
 * Clear the current date context.
 */
function clearCurrentDate() {
  ExecutionContext.currentDate = null;
}

// ============================================================================
// STATISTICS TRACKING
// ============================================================================

/**
 * Increment a statistic counter.
 * 
 * @param {string} statName - Name of the stat to increment
 * @param {number} amount - Amount to increment by (default 1)
 */
function incrementStat(statName, amount = 1) {
  if (ExecutionContext.stats.hasOwnProperty(statName)) {
    ExecutionContext.stats[statName] += amount;
  } else {
    logWarn(`Unknown stat: ${statName}`);
  }
}

/**
 * Get the current statistics.
 */
function getStats() {
  return { ...ExecutionContext.stats };
}

// ============================================================================
// EXECUTION SUMMARY
// ============================================================================

/**
 * Log the execution summary at the end of a run.
 */
function logExecutionSummary() {
  const duration = new Date() - ExecutionContext.startTime;
  const durationSec = (duration / 1000).toFixed(2);
  
  const stats = ExecutionContext.stats;
  
  logInfo('=== EXECUTION SUMMARY ===');
  logInfo(`Run ID: ${ExecutionContext.runId}`);
  logInfo(`Duration: ${durationSec}s`);
  logInfo(`Days: ${stats.daysProcessed} processed, ${stats.daysSkipped} skipped`);
  logInfo(`Check Blocks: ${stats.checkBlocksCreated} created, ${stats.checkBlocksKept} kept, ${stats.checkBlocksDeleted} deleted, ${stats.checkBlocksSkipped} skipped`);
  logInfo(`Response Blocks: ${stats.responseBlocksCreated} created, ${stats.responseBlocksKept} kept, ${stats.responseBlocksDeleted} deleted, ${stats.responseBlocksSkipped} skipped, ${stats.responseBlocksShortened} shortened`);
  
  if (stats.errors > 0) {
    logWarn(`Errors: ${stats.errors}`);
    for (const error of ExecutionContext.errors) {
      logError(`  - ${error.message}`, error.data);
    }
  } else {
    logInfo('Errors: 0');
  }
  
  logInfo('=========================');
}

// ============================================================================
// FUNCTION TRACING
// ============================================================================

/**
 * Create a traced version of a function for debugging.
 * Logs entry, exit, and any errors with timing.
 * 
 * @param {string} funcName - Name of the function for logging
 * @param {Function} func - The function to trace
 * @returns {Function} Wrapped function with tracing
 */
function traced(funcName, func) {
  return function(...args) {
    const startTime = new Date();
    logDebug(`>>> ${funcName} ENTER`, { args: summarizeArgs(args) });
    
    try {
      const result = func.apply(this, args);
      const duration = new Date() - startTime;
      logDebug(`<<< ${funcName} EXIT (${duration}ms)`, { result: summarizeResult(result) });
      return result;
    } catch (error) {
      const duration = new Date() - startTime;
      logError(`!!! ${funcName} ERROR (${duration}ms)`, { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  };
}

/**
 * Summarize function arguments for logging (avoid huge objects).
 */
function summarizeArgs(args) {
  return args.map(arg => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (arg instanceof Date) return formatDateShort(arg);
    if (typeof arg === 'object' && arg.getTitle) return `Event<${arg.getTitle()}>`;
    if (typeof arg === 'object' && arg.getEvents) return 'Calendar';
    if (typeof arg === 'object') return '{...}';
    return String(arg).substring(0, 50);
  });
}

/**
 * Summarize function result for logging.
 */
function summarizeResult(result) {
  if (result === null) return 'null';
  if (result === undefined) return 'undefined';
  if (result instanceof Date) return formatDateShort(result);
  if (Array.isArray(result)) return `Array[${result.length}]`;
  if (typeof result === 'object' && result.getTitle) return `Event<${result.getTitle()}>`;
  if (typeof result === 'object') return '{...}';
  return String(result).substring(0, 50);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a date in short form for logging.
 */
function formatDateShort(date) {
  if (!date) return 'null';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "MM-dd HH:mm");
}

/**
 * Wrap a block of code with error handling and logging.
 * 
 * @param {string} operationName - Name of the operation for logging
 * @param {Function} operation - The operation to execute
 * @returns {any} Result of the operation, or null if error
 */
function safeExecute(operationName, operation) {
  try {
    return operation();
  } catch (error) {
    logError(`Failed: ${operationName}`, {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Time an operation and log its duration.
 * 
 * @param {string} operationName - Name of the operation
 * @param {Function} operation - The operation to execute
 * @returns {any} Result of the operation
 */
function timed(operationName, operation) {
  const startTime = new Date();
  const result = operation();
  const duration = new Date() - startTime;
  
  if (duration > 1000) {
    logWarn(`Slow operation: ${operationName} took ${duration}ms`);
  } else {
    logDebug(`${operationName}: ${duration}ms`);
  }
  
  return result;
}

