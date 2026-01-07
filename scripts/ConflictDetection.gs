/**
 * Conflict Detection - Logic for determining calendar conflicts
 * 
 * Handles detection of events the user is actually attending.
 */

/**
 * Determines if an event is one the user is actually attending.
 * An event is a conflict only if it has guests AND user is attending.
 * 
 * @param {CalendarEvent} event - The event to check
 * @returns {boolean} True if user is attending this event
 */
function isAttendingEvent(event) {
  const title = event.getTitle();
  
  // Skip our own message blocks - not conflicts with ourselves
  if (title === CHECK_TITLE || title === RESPONSE_TITLE) {
    return false;
  }
  
  // Skip all-day events - handled separately via OOO detection
  if (event.isAllDayEvent()) {
    return false;
  }
  
  // Get guest list - events without guests are personal blockers
  const guests = event.getGuestList();
  if (guests.length === 0) {
    logDebug(`Event "${title}" has no guests - not a conflict`);
    return false;
  }
  
  // Check user's response status
  const myStatus = event.getMyStatus();
  
  // User is attending if they accepted, maybe'd, or are the organizer
  if (myStatus === CalendarApp.GuestStatus.YES ||
      myStatus === CalendarApp.GuestStatus.MAYBE ||
      myStatus === CalendarApp.GuestStatus.OWNER ||
      myStatus === null) {
    logDebug(`Event "${title}" is a conflict`, {
      guests: guests.length,
      status: myStatus ? String(myStatus) : 'owner'
    });
    return true;
  }
  
  // Declined or not yet responded - not a conflict
  logDebug(`Event "${title}" - user not attending`, {
    status: String(myStatus)
  });
  return false;
}

/**
 * Check if there's a conflict with an attending event in the given time range.
 * 
 * @param {Calendar} calendar - The calendar to check
 * @param {Date} startTime - Range start
 * @param {Date} endTime - Range end
 * @param {string|null} excludeEventId - Optional event ID to exclude from check
 * @returns {boolean} True if conflict exists
 */
function hasGuestConflict(calendar, startTime, endTime, excludeEventId) {
  const events = getEventsInRange(calendar, startTime, endTime);
  
  for (const event of events) {
    // Skip the excluded event (used when checking an existing block)
    if (excludeEventId && event.getId() === excludeEventId) {
      continue;
    }
    
    if (isAttendingEvent(event)) {
      logDebug(`Conflict found in range ${formatTime(startTime)}-${formatTime(endTime)}`, {
        conflictingEvent: event.getTitle()
      });
      return true;
    }
  }
  
  return false;
}

/**
 * Get all conflicting events (events the user is attending) in a time range.
 * 
 * @param {Calendar} calendar - The calendar to check
 * @param {Date} startTime - Range start
 * @param {Date} endTime - Range end
 * @returns {CalendarEvent[]} Array of conflicting events
 */
function getConflictingEvents(calendar, startTime, endTime) {
  const events = getEventsInRange(calendar, startTime, endTime);
  const conflicts = events.filter(event => isAttendingEvent(event));
  
  if (conflicts.length > 0) {
    logDebug(`Found ${conflicts.length} conflicting event(s) in range`, {
      range: `${formatTime(startTime)}-${formatTime(endTime)}`,
      events: conflicts.map(e => e.getTitle())
    });
  }
  
  return conflicts;
}

/**
 * Get the end time of the last conflicting event in a range.
 * 
 * @param {Calendar} calendar - The calendar to check
 * @param {Date} startTime - Range start
 * @param {Date} endTime - Range end
 * @returns {Date|null} End time of last conflict, or null if no conflicts
 */
function getConflictsEndTime(calendar, startTime, endTime) {
  const conflicts = getConflictingEvents(calendar, startTime, endTime);
  
  if (conflicts.length === 0) {
    return null;
  }
  
  let latestEnd = conflicts[0].getEndTime();
  for (const event of conflicts) {
    if (event.getEndTime() > latestEnd) {
      latestEnd = event.getEndTime();
    }
  }
  
  logDebug(`Conflicts end at ${formatTime(latestEnd)}`);
  return latestEnd;
}
