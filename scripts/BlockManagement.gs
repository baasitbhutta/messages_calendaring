/**
 * Block Management - CRUD operations for message blocks
 * 
 * Functions for finding, creating, and deleting message blocks.
 */

/**
 * Find all existing blocks with a given title for a day.
 * 
 * @param {Calendar} calendar - The calendar to search
 * @param {string} title - Event title to search for
 * @param {Date} date - The date to search
 * @returns {CalendarEvent[]} Array of matching events
 */
function findExistingBlocks(calendar, title, date) {
  const events = getCalendarEvents(calendar, date);
  const blocks = events.filter(event => event.getTitle() === title && !event.isAllDayEvent());
  
  logDebug(`Found ${blocks.length} existing '${title}' blocks`);
  return blocks;
}

/**
 * Find existing response block within a specific time window.
 * 
 * @param {Calendar} calendar - The calendar to search
 * @param {string} title - Event title to search for
 * @param {Date} date - The date to search
 * @param {Date} windowStart - Window start time
 * @param {Date} windowEnd - Window end time
 * @returns {CalendarEvent|null} Matching event or null
 */
function findExistingBlockInWindow(calendar, title, date, windowStart, windowEnd) {
  const events = getCalendarEvents(calendar, date);
  
  for (const event of events) {
    if (event.getTitle() === title && !event.isAllDayEvent()) {
      const eventStart = event.getStartTime();
      if (eventStart >= windowStart && eventStart <= windowEnd) {
        logDebug(`Found existing block in window`, {
          title: title,
          start: formatTime(eventStart),
          windowStart: formatTime(windowStart),
          windowEnd: formatTime(windowEnd)
        });
        return event;
      }
    }
  }
  
  logDebug(`No existing '${title}' block found in window ${formatTime(windowStart)}-${formatTime(windowEnd)}`);
  return null;
}

/**
 * Check if a block for a specific hour already exists.
 * 
 * @param {CalendarEvent[]} blocks - Array of existing blocks
 * @param {number} hour - The hour to check
 * @returns {CalendarEvent|null} Matching block or null
 */
function findBlockForHour(blocks, hour) {
  for (const block of blocks) {
    const blockHour = block.getStartTime().getHours();
    const blockMinute = block.getStartTime().getMinutes();
    
    // Block is for this hour if it starts at hour:XX or at (hour+1):00
    if (blockHour === hour || (blockHour === hour + 1 && blockMinute === 0)) {
      logDebug(`Found block for hour ${hour}`, {
        blockTime: formatTime(block.getStartTime())
      });
      return block;
    }
  }
  return null;
}

/**
 * Delete a message block event.
 * 
 * @param {CalendarEvent} event - The event to delete
 * @param {string} blockType - Type of block for stats tracking ('check' or 'response')
 */
function deleteBlock(event, blockType = 'check') {
  const title = event.getTitle();
  const startTime = event.getStartTime();
  
  logInfo(`Deleting block: ${title} at ${formatTime(startTime)}`);
  
  try {
    event.deleteEvent();
    
    if (blockType === 'check') {
      incrementStat('checkBlocksDeleted');
    } else {
      incrementStat('responseBlocksDeleted');
    }
  } catch (error) {
    logError(`Failed to delete block: ${title}`, {
      startTime: formatTime(startTime),
      error: error.message
    });
    throw error;
  }
}

/**
 * Create a new message block with the correct properties.
 * Uses Advanced Calendar Service to set transparency (show as "Free").
 * 
 * @param {Calendar} calendar - The calendar to create on
 * @param {string} title - Event title
 * @param {Date} startTime - Block start time
 * @param {Date} endTime - Block end time
 * @param {string} blockType - Type of block for stats tracking ('check' or 'response')
 * @param {boolean} isShortened - Whether this is a shortened response block
 * @returns {Object} The created event (Advanced Calendar API response)
 */
function createBlock(calendar, title, startTime, endTime, blockType = 'check', isShortened = false) {
  const durationMin = Math.round((endTime - startTime) / (60 * 1000));
  const calendarId = calendar.getId();
  
  logInfo(`Creating block: ${title} at ${formatTime(startTime)} (${durationMin}min)`);
  
  try {
    // Use Advanced Calendar Service to set transparency
    const event = Calendar.Events.insert({
      summary: title,
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      transparency: 'transparent',  // Show as "Free" instead of "Busy"
      visibility: 'public',
      colorId: '8',  // Graphite/gray color
      reminders: { 
        useDefault: false, 
        overrides: []  // No reminders
      }
    }, calendarId);
    
    // Track statistics
    if (blockType === 'check') {
      incrementStat('checkBlocksCreated');
    } else {
      incrementStat('responseBlocksCreated');
      if (isShortened) {
        incrementStat('responseBlocksShortened');
      }
    }
    
    logDebug(`Block created successfully`, {
      eventId: event.id,
      title: title,
      start: formatTime(startTime),
      end: formatTime(endTime),
      transparency: 'transparent'
    });
    
    return event;
  } catch (error) {
    logError(`Failed to create block: ${title}`, {
      startTime: formatTime(startTime),
      endTime: formatTime(endTime),
      error: error.message
    });
    throw error;
  }
}

/**
 * Enforce correct properties on an existing block.
 * Called when keeping an existing block to ensure color, visibility, and transparency are correct.
 * Uses Advanced Calendar Service to set transparency (show as "Free").
 * 
 * @param {CalendarEvent} event - The event to enforce properties on
 * @param {Calendar} calendar - The calendar containing the event
 * @param {string} blockType - Type of block for logging ('check' or 'response')
 */
function enforceBlockProperties(event, calendar, blockType = 'check') {
  const title = event.getTitle();
  const startTime = event.getStartTime();
  const eventId = event.getId().split('@')[0];  // Extract event ID without calendar domain
  const calendarId = calendar.getId();
  
  try {
    // Use Advanced Calendar Service to update properties including transparency
    Calendar.Events.patch({
      colorId: '8',              // Graphite/gray color
      visibility: 'public',
      transparency: 'transparent'  // Show as "Free" instead of "Busy"
    }, calendarId, eventId);
    
    incrementStat(`${blockType}BlocksPropertyEnforced`);
    logDebug(`Enforced properties on ${blockType} block`, {
      title: title,
      start: formatTime(startTime),
      transparency: 'transparent'
    });
  } catch (error) {
    logError(`Failed to enforce properties on block: ${title}`, {
      startTime: formatTime(startTime),
      eventId: eventId,
      error: error.message
    });
    // Don't throw - property enforcement is not critical
  }
}

/**
 * Check if a message block already exists at the exact time.
 * 
 * @param {Calendar} calendar - The calendar to check
 * @param {string} title - Block title to check for
 * @param {Date} startTime - Start time to check
 * @param {Date} endTime - End time to check
 * @returns {boolean} True if block exists at this time
 */
function blockExistsAtTime(calendar, title, startTime, endTime) {
  const events = getEventsInRange(calendar, startTime, endTime);
  
  for (const event of events) {
    if (event.getTitle() === title) {
      logDebug(`Block already exists at ${formatTime(startTime)}`, { title: title });
      return true;
    }
  }
  
  return false;
}
