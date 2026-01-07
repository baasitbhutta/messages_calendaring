/**
 * Check Block Scheduler - 5-minute message check block scheduling
 * 
 * Handles scheduling of short check blocks at the end of each hour.
 */

/**
 * Schedule all 5-minute check blocks for a day.
 * 
 * @param {Calendar} calendar - The calendar to schedule on
 * @param {Date} date - The date to schedule for
 */
function scheduleAllCheckBlocks(calendar, date) {
  logDebug(`Scheduling check blocks for ${CHECK_HOURS.length} hours`);
  
  for (const hour of CHECK_HOURS) {
    safeExecute(`scheduleCheckBlock(hour=${hour})`, () => {
      scheduleCheckBlock(calendar, date, hour);
    });
  }
}

/**
 * Schedule a 5-minute check block for a specific hour.
 * 
 * @param {Calendar} calendar - The calendar to schedule on
 * @param {Date} date - The date to schedule for
 * @param {number} hour - The hour (check block starts at hour:55)
 */
function scheduleCheckBlock(calendar, date, hour) {
  logDebug(`Processing check block for hour ${hour}`);
  
  // Calculate default time: hour:55 - (hour+1):00
  const defaultStart = createDateTime(date, hour, 55);
  const defaultEnd = createDateTime(date, hour + 1, 0);
  
  // Check for existing block at this hour
  const existingBlocks = findExistingBlocks(calendar, CHECK_TITLE, date);
  const existingBlock = findBlockForHour(existingBlocks, hour);
  
  if (existingBlock) {
    // Check if existing block has a conflict
    if (!hasGuestConflict(calendar, existingBlock.getStartTime(), existingBlock.getEndTime(), existingBlock.getId())) {
      // No conflict, keep existing block but enforce correct properties
      enforceBlockProperties(existingBlock, 'check');
      logDebug(`Keeping existing check block at ${formatTime(existingBlock.getStartTime())}`);
      incrementStat('checkBlocksKept');
      return;
    }
    // Has conflict, delete and reschedule
    logInfo(`Check block at ${formatTime(existingBlock.getStartTime())} has conflict - rescheduling`);
    deleteBlock(existingBlock, 'check');
  }
  
  // Find the best time for this block
  const resolvedTime = resolveCheckBlockTime(calendar, defaultStart, defaultEnd, hour);
  
  if (!resolvedTime) {
    logInfo(`Cannot schedule check block for hour ${hour} - no available time`);
    incrementStat('checkBlocksSkipped');
    return;
  }
  
  // Check if a block already exists at this exact time
  if (blockExistsAtTime(calendar, CHECK_TITLE, resolvedTime.start, resolvedTime.end)) {
    logDebug(`Check block already exists at ${formatTime(resolvedTime.start)}`);
    incrementStat('checkBlocksKept');
    return;
  }
  
  // Create the block
  createBlock(calendar, CHECK_TITLE, resolvedTime.start, resolvedTime.end, 'check');
}

/**
 * Resolve the time for a check block, handling conflicts.
 * 
 * @param {Calendar} calendar - The calendar to check
 * @param {Date} defaultStart - Default start time
 * @param {Date} defaultEnd - Default end time
 * @param {number} hour - The original hour
 * @returns {{start: Date, end: Date}|null} Resolved time or null if impossible
 */
function resolveCheckBlockTime(calendar, defaultStart, defaultEnd, hour) {
  let startTime = new Date(defaultStart);
  let endTime = new Date(defaultEnd);
  
  // Check for conflict at default time
  if (!hasGuestConflict(calendar, startTime, endTime, null)) {
    logDebug(`Default time ${formatTime(startTime)} available`);
    return { start: startTime, end: endTime };
  }
  
  logDebug(`Default time ${formatTime(startTime)} has conflict - searching for alternative`);
  
  // Find when conflicts end and shift block
  const conflictEnd = getConflictsEndTime(calendar, startTime, endTime);
  
  if (!conflictEnd) {
    return { start: startTime, end: endTime };
  }
  
  // Shift to after the conflict
  startTime = new Date(conflictEnd);
  endTime = addMinutes(conflictEnd, MESSAGE_CHECK_DURATION);
  
  logDebug(`Shifted to ${formatTime(startTime)} after conflict`);
  
  // Handle cascading conflicts (max 10 iterations to prevent infinite loop)
  let iterations = 0;
  while (hasGuestConflict(calendar, startTime, endTime, null) && iterations < 10) {
    const nextConflictEnd = getConflictsEndTime(calendar, startTime, endTime);
    
    if (nextConflictEnd && nextConflictEnd > startTime) {
      startTime = new Date(nextConflictEnd);
      endTime = addMinutes(nextConflictEnd, MESSAGE_CHECK_DURATION);
      logDebug(`Cascading conflict - shifted to ${formatTime(startTime)} (iteration ${iterations + 1})`);
    } else {
      break;
    }
    iterations++;
  }
  
  if (iterations >= 10) {
    logWarn(`Reached max iterations while resolving check block time for hour ${hour}`);
  }
  
  // Ensure still within work hours
  if (endTime.getHours() >= WORK_END_HOUR && endTime.getMinutes() > 0) {
    logDebug(`Resolved time ${formatTime(startTime)} is outside work hours`);
    return null;
  }
  
  logDebug(`Resolved check block time: ${formatTime(startTime)}-${formatTime(endTime)}`);
  return { start: startTime, end: endTime };
}
