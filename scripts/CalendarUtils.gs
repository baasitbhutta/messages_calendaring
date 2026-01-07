/**
 * Calendar Utilities - Calendar queries and event fetching
 * 
 * Functions for interacting with Google Calendar API.
 */

/**
 * Get all events for a given day.
 * @param {Calendar} calendar - The calendar to query
 * @param {Date} date - The date to get events for
 * @returns {CalendarEvent[]} Array of events
 */
function getCalendarEvents(calendar, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const events = calendar.getEvents(startOfDay, endOfDay);
  logDebug(`Fetched ${events.length} events for ${formatDate(date)}`);
  
  return events;
}

/**
 * Get events that overlap with a given time range.
 * @param {Calendar} calendar - The calendar to query
 * @param {Date} startTime - Range start
 * @param {Date} endTime - Range end
 * @returns {CalendarEvent[]} Array of overlapping events
 */
function getEventsInRange(calendar, startTime, endTime) {
  const events = calendar.getEvents(startTime, endTime);
  logDebug(`Found ${events.length} events in range ${formatTime(startTime)}-${formatTime(endTime)}`);
  return events;
}

/**
 * Check if the day has an all-day Out of Office event.
 * @param {Calendar} calendar - The calendar to check
 * @param {Date} date - The date to check
 * @returns {boolean} True if OOO event exists
 */
function hasAllDayOOO(calendar, date) {
  const events = getCalendarEvents(calendar, date);
  
  for (const event of events) {
    if (event.isAllDayEvent()) {
      const title = event.getTitle().toLowerCase();
      
      for (const keyword of OOO_KEYWORDS) {
        if (title.includes(keyword)) {
          logDebug(`Detected OOO event: "${event.getTitle()}"`, { keyword: keyword });
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Check if a date is a weekend.
 * @param {Date} date - The date to check
 * @returns {boolean} True if Saturday or Sunday
 */
function isWeekend(date) {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Format a date for logging.
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd (EEE)");
}

/**
 * Format a time for logging.
 * @param {Date} date - The date/time to format
 * @returns {string} Formatted time string
 */
function formatTime(date) {
  if (!date) return 'null';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "h:mm a");
}

/**
 * Create a date with specific hour and minute.
 * @param {Date} baseDate - The base date
 * @param {number} hour - Hour (0-23)
 * @param {number} minute - Minute (0-59)
 * @returns {Date} New date with specified time
 */
function createDateTime(baseDate, hour, minute) {
  const result = new Date(baseDate);
  result.setHours(hour, minute, 0, 0);
  return result;
}

/**
 * Add minutes to a date.
 * @param {Date} date - The base date
 * @param {number} minutes - Minutes to add
 * @returns {Date} New date with added minutes
 */
function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
