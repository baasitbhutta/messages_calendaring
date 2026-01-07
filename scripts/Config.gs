/**
 * Configuration - All constants and settings
 * 
 * This file contains all configurable values for the Message Response Blocks script.
 */

// ============================================================================
// WORKING HOURS
// ============================================================================

const WORK_START_HOUR = 8;   // 8 AM
const WORK_END_HOUR = 18;    // 6 PM

// ============================================================================
// SCHEDULING
// ============================================================================

const LOOKAHEAD_DAYS = 7;

// ============================================================================
// BLOCK DURATIONS (minutes)
// ============================================================================

const MESSAGE_CHECK_DURATION = 5;
const MESSAGE_RESPONSE_DURATION = 45;
const MIN_RESPONSE_DURATION = 15;  // Minimum duration for shortened blocks

// ============================================================================
// EVENT TITLES (used for identification)
// ============================================================================

const CHECK_TITLE = "Message Check";
const RESPONSE_TITLE = "Message Response";

// ============================================================================
// 5-MINUTE CHECK BLOCK HOURS
// ============================================================================

// Hours when check blocks start at :55
// Excluded: 8 (start of day), 12 (lunch), 16 (too close to EOD), 17 (overlaps EOD)
const CHECK_HOURS = [9, 10, 11, 13, 14, 15];

// ============================================================================
// 45-MINUTE RESPONSE BLOCK DEFINITIONS
// ============================================================================

const RESPONSE_BLOCKS = [
  {
    name: "post-lunch",
    defaultStartHour: 12,
    defaultStartMinute: 45,
    windowStartHour: 10,
    windowStartMinute: 45,
    windowEndHour: 14,
    windowEndMinute: 45
  },
  {
    name: "eod",
    defaultStartHour: 17,
    defaultStartMinute: 15,
    windowStartHour: 15,
    windowStartMinute: 15,
    windowEndHour: 17,
    windowEndMinute: 15
  }
];

// ============================================================================
// OOO DETECTION KEYWORDS
// ============================================================================

const OOO_KEYWORDS = [
  'ooo',
  'out of office',
  'vacation',
  'pto',
  'holiday',
  'sick',
  'leave'
];

