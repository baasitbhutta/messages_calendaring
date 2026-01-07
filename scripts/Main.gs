/**
 * Main Entry Point - Orchestration and setup functions
 * 
 * This is the main file that orchestrates the scheduling process.
 */

/**
 * Main function - orchestrates the entire scheduling process.
 * Should be set up with an hourly time-driven trigger.
 */
function main() {
  initExecutionContext();
  logInfo("=== Starting Message Blocks Scheduling ===");
  
  try {
    const calendar = CalendarApp.getDefaultCalendar();
    const today = new Date();
    
    logInfo(`Processing ${LOOKAHEAD_DAYS} days starting from ${formatDate(today)}`);
    
    // Process each day in the lookahead period
    for (let dayOffset = 0; dayOffset < LOOKAHEAD_DAYS; dayOffset++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + dayOffset);
      
      safeExecute(`processDay(${formatDate(targetDate)})`, () => {
        processDay(calendar, targetDate);
      });
    }
    
    logInfo("=== Message Blocks Scheduling Complete ===");
  } catch (error) {
    logError("Fatal error in main()", {
      error: error.message,
      stack: error.stack
    });
  } finally {
    logExecutionSummary();
    clearCurrentDate();
  }
}

/**
 * Process a single day - create/adjust message blocks as needed.
 * 
 * @param {Calendar} calendar - The calendar to process
 * @param {Date} date - The date to process
 */
function processDay(calendar, date) {
  setCurrentDate(date);
  
  // Skip weekends
  if (isWeekend(date)) {
    logDebug(`Skipping - weekend`);
    incrementStat('daysSkipped');
    return;
  }
  
  // Skip days with all-day OOO
  if (hasAllDayOOO(calendar, date)) {
    logInfo(`Skipping - all-day OOO detected`);
    incrementStat('daysSkipped');
    return;
  }
  
  logInfo(`Processing day`);
  incrementStat('daysProcessed');
  
  // Process 45-minute response blocks first (higher priority)
  scheduleAllResponseBlocks(calendar, date);
  
  // Process 5-minute check blocks
  scheduleAllCheckBlocks(calendar, date);
}

// ============================================================================
// SETUP FUNCTIONS
// ============================================================================

/**
 * Create the hourly trigger for the main function.
 * Run this once to set up the automation.
 */
function setupTrigger() {
  logInfo("Setting up hourly trigger for main()");
  
  // Remove any existing triggers for main
  const triggers = ScriptApp.getProjectTriggers();
  let removedCount = 0;
  
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'main') {
      ScriptApp.deleteTrigger(trigger);
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    logInfo(`Removed ${removedCount} existing trigger(s)`);
  }
  
  // Create new hourly trigger
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyHours(1)
    .create();
  
  logInfo("Hourly trigger created for main()");
}

/**
 * Remove all triggers for the main function.
 */
function removeTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let removedCount = 0;
  
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'main') {
      ScriptApp.deleteTrigger(trigger);
      removedCount++;
    }
  }
  
  logInfo(`Removed ${removedCount} trigger(s) for main()`);
}

// ============================================================================
// TESTING FUNCTIONS
// ============================================================================

/**
 * Test function - run once to verify the script works.
 */
function testRun() {
  logInfo("=== TEST RUN ===");
  main();
  logInfo("=== TEST COMPLETE ===");
  logInfo("Check your calendar for the created blocks.");
}

/**
 * Clean up all message blocks for the lookahead period.
 * WARNING: This deletes all Message Check and Message Response events!
 */
function cleanupAllBlocks() {
  initExecutionContext();
  const calendar = CalendarApp.getDefaultCalendar();
  const today = new Date();
  
  logInfo("=== Cleaning Up All Message Blocks ===");
  
  let deletedCount = 0;
  
  for (let dayOffset = 0; dayOffset < LOOKAHEAD_DAYS; dayOffset++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + dayOffset);
    setCurrentDate(targetDate);
    
    const events = getCalendarEvents(calendar, targetDate);
    
    for (const event of events) {
      const title = event.getTitle();
      if (title === CHECK_TITLE || title === RESPONSE_TITLE) {
        logDebug(`Deleting: ${title} at ${formatTime(event.getStartTime())}`);
        event.deleteEvent();
        deletedCount++;
      }
    }
  }
  
  clearCurrentDate();
  logInfo(`=== Cleanup Complete: ${deletedCount} blocks deleted ===`);
}

/**
 * Debug function - show what blocks exist for a specific day.
 */
function debugShowBlocks() {
  initExecutionContext();
  const calendar = CalendarApp.getDefaultCalendar();
  const today = new Date();
  
  logInfo("=== Current Message Blocks ===");
  
  let totalCheckBlocks = 0;
  let totalResponseBlocks = 0;
  
  for (let dayOffset = 0; dayOffset < LOOKAHEAD_DAYS; dayOffset++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + dayOffset);
    
    const checkBlocks = findExistingBlocks(calendar, CHECK_TITLE, targetDate);
    const responseBlocks = findExistingBlocks(calendar, RESPONSE_TITLE, targetDate);
    
    totalCheckBlocks += checkBlocks.length;
    totalResponseBlocks += responseBlocks.length;
    
    if (checkBlocks.length > 0 || responseBlocks.length > 0) {
      logInfo(`${formatDate(targetDate)}:`);
      
      for (const block of responseBlocks) {
        logInfo(`  ${RESPONSE_TITLE}: ${formatTime(block.getStartTime())} - ${formatTime(block.getEndTime())}`);
      }
      
      for (const block of checkBlocks) {
        logInfo(`  ${CHECK_TITLE}: ${formatTime(block.getStartTime())} - ${formatTime(block.getEndTime())}`);
      }
    }
  }
  
  logInfo(`=== Total: ${totalResponseBlocks} response blocks, ${totalCheckBlocks} check blocks ===`);
}

/**
 * Debug function - show all events for a specific day to understand conflicts.
 */
function debugShowAllEvents() {
  const calendar = CalendarApp.getDefaultCalendar();
  const today = new Date();
  
  logInfo("=== All Events for Next 7 Days ===");
  
  for (let dayOffset = 0; dayOffset < LOOKAHEAD_DAYS; dayOffset++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + dayOffset);
    
    const events = getCalendarEvents(calendar, targetDate);
    
    logInfo(`\n${formatDate(targetDate)} (${events.length} events):`);
    
    for (const event of events) {
      const title = event.getTitle();
      const isAllDay = event.isAllDayEvent();
      const guests = event.getGuestList();
      const myStatus = event.getMyStatus();
      const isConflict = isAttendingEvent(event);
      
      if (isAllDay) {
        logInfo(`  [ALL-DAY] ${title}`);
      } else {
        const timeRange = `${formatTime(event.getStartTime())} - ${formatTime(event.getEndTime())}`;
        const guestInfo = guests.length > 0 ? `guests=${guests.length}` : 'no-guests';
        const statusInfo = myStatus ? `status=${myStatus}` : 'status=owner';
        const conflictInfo = isConflict ? 'CONFLICT' : 'ok';
        
        logInfo(`  ${timeRange} | ${title} | ${guestInfo} | ${statusInfo} | ${conflictInfo}`);
      }
    }
  }
}
