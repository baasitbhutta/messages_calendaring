/**
 * Response Block Scheduler - 45-minute message response block scheduling
 * 
 * Handles scheduling of longer response blocks with window-based rescheduling.
 */

/**
 * Schedule all response blocks for a day.
 * 
 * @param {Calendar} calendar - The calendar to schedule on
 * @param {Date} date - The date to schedule for
 */
function scheduleAllResponseBlocks(calendar, date) {
  logDebug(`Scheduling ${RESPONSE_BLOCKS.length} response blocks`);
  
  for (const blockConfig of RESPONSE_BLOCKS) {
    safeExecute(`scheduleResponseBlock(${blockConfig.name})`, () => {
      scheduleResponseBlock(calendar, date, blockConfig);
    });
  }
}

/**
 * Schedule a 45-minute response block with reschedule window support.
 * 
 * @param {Calendar} calendar - The calendar to schedule on
 * @param {Date} date - The date to schedule for
 * @param {Object} blockConfig - Block configuration from RESPONSE_BLOCKS
 */
function scheduleResponseBlock(calendar, date, blockConfig) {
  logDebug(`Processing ${blockConfig.name} response block`);
  
  // Calculate window boundaries
  const windowStart = createDateTime(date, blockConfig.windowStartHour, blockConfig.windowStartMinute);
  const windowEnd = createDateTime(date, blockConfig.windowEndHour, blockConfig.windowEndMinute);
  
  // Calculate default time
  const defaultStart = createDateTime(date, blockConfig.defaultStartHour, blockConfig.defaultStartMinute);
  const defaultEnd = addMinutes(defaultStart, MESSAGE_RESPONSE_DURATION);
  
  logDebug(`Window: ${formatTime(windowStart)}-${formatTime(windowEnd)}, Default: ${formatTime(defaultStart)}`);
  
  // Check for existing block in the window
  const existingBlock = findExistingBlockInWindow(calendar, RESPONSE_TITLE, date, windowStart, windowEnd);
  
  if (existingBlock) {
    if (!hasGuestConflict(calendar, existingBlock.getStartTime(), existingBlock.getEndTime(), existingBlock.getId())) {
      // No conflict, keep existing block but enforce correct properties
      enforceBlockProperties(existingBlock, 'response');
      logDebug(`Keeping existing ${blockConfig.name} response block at ${formatTime(existingBlock.getStartTime())}`);
      incrementStat('responseBlocksKept');
      return;
    }
    // Has conflict, delete and reschedule
    logInfo(`${blockConfig.name} response block at ${formatTime(existingBlock.getStartTime())} has conflict - rescheduling`);
    deleteBlock(existingBlock, 'response');
  }
  
  // Try the default time first
  if (!hasGuestConflict(calendar, defaultStart, defaultEnd, null)) {
    logDebug(`Default time available for ${blockConfig.name}`);
    createBlock(calendar, RESPONSE_TITLE, defaultStart, defaultEnd, 'response');
    return;
  }
  
  logDebug(`Default time has conflict - searching for available slot`);
  
  // Default time has conflict - search for available slot closest to default time
  const availableSlot = findAvailableSlot(calendar, windowStart, windowEnd, MESSAGE_RESPONSE_DURATION, defaultStart);
  
  if (availableSlot) {
    logInfo(`Found alternative slot for ${blockConfig.name} at ${formatTime(availableSlot.start)}`);
    createBlock(calendar, RESPONSE_TITLE, availableSlot.start, availableSlot.end, 'response');
    return;
  }
  
  logDebug(`No full slot available - looking for largest gap`);
  
  // No full slot available - try to find largest gap
  const largestGap = findLargestGap(calendar, windowStart, windowEnd);
  
  if (largestGap && largestGap.duration >= MIN_RESPONSE_DURATION) {
    logInfo(`Creating shortened ${blockConfig.name} response block`, {
      duration: Math.round(largestGap.duration),
      start: formatTime(largestGap.start)
    });
    createBlock(calendar, RESPONSE_TITLE, largestGap.start, largestGap.end, 'response', true);
    return;
  }
  
  logWarn(`Cannot schedule ${blockConfig.name} response block - no available time`, {
    window: `${formatTime(windowStart)}-${formatTime(windowEnd)}`,
    largestGapMinutes: largestGap ? Math.round(largestGap.duration) : 0
  });
  incrementStat('responseBlocksSkipped');
}

/**
 * Find an available time slot of the specified duration within a window,
 * closest to the default time.
 * 
 * @param {Calendar} calendar - The calendar to check
 * @param {Date} windowStart - Window start
 * @param {Date} windowEnd - Window end
 * @param {number} duration - Required duration in minutes
 * @param {Date} defaultStart - Preferred start time
 * @returns {{start: Date, end: Date}|null} Available slot or null
 */
function findAvailableSlot(calendar, windowStart, windowEnd, duration, defaultStart) {
  const conflicts = getConflictingEvents(calendar, windowStart, windowEnd);
  conflicts.sort((a, b) => a.getStartTime() - b.getStartTime());
  
  const durationMs = duration * 60 * 1000;
  const slots = [];
  
  logDebug(`Finding available ${duration}min slot among ${conflicts.length} conflicts`);
  
  if (conflicts.length === 0) {
    // Entire window is available
    slots.push({
      start: new Date(windowStart),
      end: addMinutes(windowStart, duration)
    });
  } else {
    // Check gap at the start
    const firstEventStart = conflicts[0].getStartTime();
    if (firstEventStart - windowStart >= durationMs) {
      slots.push({
        start: new Date(windowStart),
        end: addMinutes(windowStart, duration)
      });
      logDebug(`Found slot at window start: ${formatTime(windowStart)}`);
    }
    
    // Check gaps between events
    for (let i = 0; i < conflicts.length - 1; i++) {
      const gapStart = conflicts[i].getEndTime();
      const gapEnd = conflicts[i + 1].getStartTime();
      
      if (gapEnd - gapStart >= durationMs) {
        slots.push({
          start: new Date(gapStart),
          end: addMinutes(gapStart, duration)
        });
        logDebug(`Found slot between events: ${formatTime(gapStart)}`);
      }
    }
    
    // Check gap after last event
    const lastEventEnd = conflicts[conflicts.length - 1].getEndTime();
    if (windowEnd - lastEventEnd >= durationMs) {
      slots.push({
        start: new Date(lastEventEnd),
        end: addMinutes(lastEventEnd, duration)
      });
      logDebug(`Found slot after last event: ${formatTime(lastEventEnd)}`);
    }
  }
  
  // Filter slots that end within acceptable bounds
  const maxEnd = addMinutes(windowEnd, duration);
  const validSlots = slots.filter(slot => slot.end <= maxEnd);
  
  logDebug(`Found ${validSlots.length} valid slots`);
  
  if (validSlots.length === 0) {
    return null;
  }
  
  // Find slot closest to default time
  const closest = findClosestSlot(validSlots, defaultStart);
  logDebug(`Selected slot closest to default: ${formatTime(closest.start)}`);
  
  return closest;
}

/**
 * Find the largest available gap when full duration isn't available.
 * 
 * @param {Calendar} calendar - The calendar to check
 * @param {Date} windowStart - Window start
 * @param {Date} windowEnd - Window end
 * @returns {{start: Date, end: Date, duration: number}|null} Largest gap or null
 */
function findLargestGap(calendar, windowStart, windowEnd) {
  const conflicts = getConflictingEvents(calendar, windowStart, windowEnd);
  
  if (conflicts.length === 0) {
    const duration = (windowEnd - windowStart) / (60 * 1000);
    logDebug(`No conflicts - entire window available (${Math.round(duration)}min)`);
    return {
      start: new Date(windowStart),
      end: new Date(windowEnd),
      duration: duration
    };
  }
  
  conflicts.sort((a, b) => a.getStartTime() - b.getStartTime());
  
  const gaps = [];
  
  // Gap at the start
  const firstEventStart = conflicts[0].getStartTime();
  if (firstEventStart > windowStart) {
    gaps.push({
      start: new Date(windowStart),
      end: new Date(firstEventStart),
      duration: (firstEventStart - windowStart) / (60 * 1000)
    });
  }
  
  // Gaps between events
  for (let i = 0; i < conflicts.length - 1; i++) {
    const gapStart = conflicts[i].getEndTime();
    const gapEnd = conflicts[i + 1].getStartTime();
    
    if (gapEnd > gapStart) {
      gaps.push({
        start: new Date(gapStart),
        end: new Date(gapEnd),
        duration: (gapEnd - gapStart) / (60 * 1000)
      });
    }
  }
  
  // Gap at the end
  const lastEventEnd = conflicts[conflicts.length - 1].getEndTime();
  if (lastEventEnd < windowEnd) {
    gaps.push({
      start: new Date(lastEventEnd),
      end: new Date(windowEnd),
      duration: (windowEnd - lastEventEnd) / (60 * 1000)
    });
  }
  
  if (gaps.length === 0) {
    logDebug(`No gaps found in window`);
    return null;
  }
  
  // Find largest gap
  let largest = gaps[0];
  for (const gap of gaps) {
    if (gap.duration > largest.duration) {
      largest = gap;
    }
  }
  
  logDebug(`Largest gap: ${Math.round(largest.duration)}min at ${formatTime(largest.start)}`);
  return largest;
}

/**
 * Find the slot closest to a target time.
 * 
 * @param {Array} slots - Array of available slots
 * @param {Date} targetTime - Target time to be close to
 * @returns {{start: Date, end: Date}} Closest slot
 */
function findClosestSlot(slots, targetTime) {
  let bestSlot = slots[0];
  let bestDistance = Math.abs(bestSlot.start - targetTime);
  
  for (const slot of slots) {
    const distance = Math.abs(slot.start - targetTime);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSlot = slot;
    }
  }
  
  return bestSlot;
}
