# Message Response Blocks - Architecture

## Overview

This document describes the technical implementation of the Message Response Blocks Google Apps Script.

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Google Apps Script (JavaScript-based) |
| **Calendar API** | CalendarApp (built-in Apps Script service) |
| **Trigger** | Time-driven installable trigger |
| **Storage** | None (stateless design) |

---

## File Structure

```
scripts/
├── Config.gs                 # Constants and configuration (~80 lines)
├── Observability.gs          # Logging and debugging utilities (~250 lines)
├── CalendarUtils.gs          # Calendar queries and utilities (~100 lines)
├── ConflictDetection.gs      # Conflict detection logic (~115 lines)
├── BlockManagement.gs        # Block CRUD operations (~140 lines)
├── CheckBlockScheduler.gs    # 5-minute block scheduling (~130 lines)
├── ResponseBlockScheduler.gs # 45-minute block scheduling (~260 lines)
├── Main.gs                   # Entry point and orchestration (~200 lines)
└── README.md                 # Setup instructions
```

Modular architecture — each file has a single responsibility and stays under ~300 lines for maintainability. Google Apps Script combines all `.gs` files, so functions are globally accessible across files.

---

## Constants & Configuration

```javascript
// Working hours
const WORK_START_HOUR = 8;   // 8 AM
const WORK_END_HOUR = 18;    // 6 PM

// Lookahead
const LOOKAHEAD_DAYS = 7;

// Block definitions
const MESSAGE_CHECK_DURATION = 5;      // minutes
const MESSAGE_RESPONSE_DURATION = 45;  // minutes

// Event titles (used for identification)
const CHECK_TITLE = "Message Check";
const RESPONSE_TITLE = "Message Response";

// 5-minute block hours (the hour when block starts at :55)
// Note: 16 (4:55 PM) excluded - too close to EOD response block
const CHECK_HOURS = [9, 10, 11, 13, 14, 15];

// 45-minute block definitions
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
```

---

## Core Functions

### 1. Main Entry Point

```javascript
function main()
```

**Purpose:** Orchestrates the entire scheduling process.

**Flow:**
1. Get the primary calendar
2. Calculate date range (today + 7 days)
3. For each weekday in range:
   - Check for all-day OOO events → skip day if found
   - Fetch all events for the day
   - Process 45-minute blocks (higher priority first)
   - Process 5-minute blocks
4. Exit

---

### 2. Calendar Queries

```javascript
function getCalendarEvents(calendar, date)
```

**Purpose:** Fetches all events for a given day.

**Returns:** Array of event objects with:
- Start/end times
- Guest list
- Event type
- Title

```javascript
function hasAllDayOOO(calendar, date)
```

**Purpose:** Checks if the day has an all-day Out of Office event.

**Implementation:** Query events and check for `eventType === 'outOfOffice'` with all-day flag.

---

### 3. Conflict Detection

```javascript
function isAttendingEvent(event)
```

**Purpose:** Determines if an event is one the user is actually attending.

**Logic:**
1. Skip our own message blocks (by title) — not conflicts with ourselves
2. Skip all-day events — handled separately via OOO detection
3. Check user's response status via `event.getMyStatus()`
4. Return `true` if status is `YES`, `MAYBE`, or `null` with guests (organizer)
5. Return `false` for `NO` (declined), `INVITED` (no response), or events without guests

```javascript
function hasGuestConflict(calendar, startTime, endTime, excludeEventId)
```

**Purpose:** Determines if a time range overlaps with any event the user is attending.

**Parameters:**
- `startTime` / `endTime`: The proposed block time
- `excludeEventId`: Optional — exclude this event from conflict check (used when checking an existing block)

**Logic:**
1. Get all events in the time range
2. Filter using `isAttendingEvent()` to find actual conflicts
3. Return `true` if any such events exist

```javascript
function getConflictingEvents(calendar, startTime, endTime)
```

**Purpose:** Returns all events the user is attending that overlap the given time range.

**Used for:** Determining how far to shift a block.

---

### 4. Block Management

```javascript
function findExistingBlock(calendar, title, date)
```

**Purpose:** Finds an existing message block by title for a given day.

**Returns:** CalendarEvent object or null.

```javascript
function deleteBlock(event)
```

**Purpose:** Deletes a message block event.

**Implementation:** `event.deleteEvent()`

```javascript
function createBlock(calendar, title, startTime, endTime)
```

**Purpose:** Creates a new message block with the correct properties.

**Properties set:**
- Title
- Start/end time
- Visibility: PUBLIC
- Reminders: None (remove default reminders)

---

### 5. Conflict Resolution — 5-Minute Blocks

```javascript
function scheduleCheckBlock(calendar, date, hour)
```

**Purpose:** Schedules a 5-minute check block for a specific hour.

**Algorithm:**
1. Calculate default time: `hour:55 - (hour+1):00`
2. Check for existing block at this time
   - If exists and no conflict → done
   - If exists but has conflict → delete it
3. Check for conflict at default time
4. If conflict:
   - Get end time of conflicting event(s)
   - Set new start time to immediately after conflicts end
   - Ensure still within work hours
5. Create block at resolved time

---

### 6. Conflict Resolution — 45-Minute Blocks

```javascript
function scheduleResponseBlock(calendar, date, blockConfig)
```

**Purpose:** Schedules a 45-minute response block with reschedule window support.

**Algorithm:**
1. Calculate default time from `blockConfig`
2. Check for existing block in the window
   - If exists and no conflict → done (keep existing)
   - If exists but has conflict → delete it
3. **Try the default time first** (e.g., 12:45 PM for post-lunch)
   - If no conflict at default time → create block there and done
4. If default time has conflict:
   - Search for available 45-minute slot within window **closest to default time** (minimal shift)
   - If found → use it
   - If not found → search for largest available gap
   - If gap ≥ 15 min → create shorter block
   - If no space → skip this block

```javascript
function findAvailableSlot(calendar, windowStart, windowEnd, duration, defaultStart)
```

**Purpose:** Finds an available time slot of the specified duration within a window, **closest to the default time**.

**Algorithm:**
1. Get all events with guests in the window
2. Sort by start time
3. Collect all available slots:
   - Check gap before first event
   - Check gaps between events
   - Check gap after last event
4. Find the slot whose start time is **closest to `defaultStart`** (minimal shift)
5. Return that slot, or null if no slots available

```javascript
function findLargestGap(calendar, windowStart, windowEnd)
```

**Purpose:** Finds the largest available gap when full duration isn't available.

**Returns:** `{ start, end, duration }` or null if no gaps.

---

## Processing Order

```
For each day:
  1. Skip if weekend
  2. Skip if all-day OOO
  
  3. Process 45-minute blocks (in order):
     a. Post-lunch block (12:45 PM default)
     b. EOD block (5:15 PM default)
  
  4. Process 5-minute blocks (in order):
     a. 9:55 AM
     b. 10:55 AM
     c. 11:55 AM
     d. 1:55 PM
     e. 2:55 PM
     f. 3:55 PM
```

45-minute blocks are processed first because:
- They have stricter time requirements
- They're higher priority for actual message handling
- 5-minute blocks are more flexible and can route around them

---

## Trigger Setup

The time-driven trigger must be configured manually in the Apps Script editor:

1. Open Apps Script editor
2. Click the clock icon (Triggers) in the left sidebar
3. Click "+ Add Trigger"
4. Configure:
   - **Function:** `main`
   - **Event source:** Time-driven
   - **Type:** Hour timer
   - **Interval:** Every hour
5. Save

**Note:** The script will check if current time is within working hours (8 AM - 6 PM) and exit early if not, so the trigger can run 24/7 without issues.

---

## Edge Cases

### Back-to-Back Meetings

When meetings are back-to-back, multiple 5-minute blocks may need shifting:

```
Scenario:
  - Meeting A: 9:30 - 10:15
  - Meeting B: 10:15 - 11:00
  
Result:
  - 9:55 block → shifted to 10:15... but that conflicts with B → shifted to 11:00
  - 10:55 block → shifted to 11:00... but 9:55 block is there → shifted to 11:05
```

**Solution:** Process blocks sequentially and treat previously-scheduled message blocks as occupied time (but not as "guest conflicts" — they can be adjacent).

### Shortened Response Blocks

When a 45-minute slot isn't available but a smaller gap exists:

```
Scenario:
  - Post-lunch window: 10:45 AM - 2:45 PM
  - Meetings at: 11:00-12:00, 12:30-2:00
  - Available gaps: 10:45-11:00 (15 min), 12:00-12:30 (30 min), 2:00-2:45 (45 min)

Result:
  - 45-min slot found at 2:00-2:45 → use it
  
Alternative scenario (no 45-min slot):
  - Meetings at: 11:00-12:00, 12:30-2:30
  - Available gaps: 10:45-11:00 (15 min), 12:00-12:30 (30 min), 2:30-2:45 (15 min)
  
Result:
  - Largest gap is 30 min (12:00-12:30) → create 30-min block
```

### Meeting Scheduled After Blocks Created

```
Scenario:
  - Sunday: Script creates 9:55 AM block for Monday
  - Monday 8 AM: Someone schedules meeting 9:30-10:30
  - Monday 8 AM: Script runs again
  
Result:
  - Script finds existing 9:55 block
  - Detects conflict with 9:30-10:30 meeting
  - Deletes 9:55 block
  - Creates new block at 10:30
```

---

## API Methods Used

### CalendarApp

| Method | Purpose |
|--------|---------|
| `getDefaultCalendar()` | Get primary calendar |
| `getEvents(start, end)` | Query events in range |
| `createEvent(title, start, end)` | Create new event |

### CalendarEvent

| Method | Purpose |
|--------|---------|
| `getTitle()` | Get event title |
| `getStartTime()` | Get start time |
| `getEndTime()` | Get end time |
| `getGuestList()` | Get list of guests |
| `getMyStatus()` | Get user's response status (YES, NO, MAYBE, INVITED, null) |
| `isAllDayEvent()` | Check if all-day |
| `deleteEvent()` | Delete the event |
| `setVisibility(visibility)` | Set to PUBLIC |
| `removeAllReminders()` | Remove notifications |

### CalendarApp.GuestStatus

| Value | Meaning |
|-------|---------|
| `YES` | User accepted the invite |
| `NO` | User declined the invite |
| `MAYBE` | User tentatively accepted |
| `INVITED` | User hasn't responded yet |
| `null` | User is the organizer |

### Utilities

| Method | Purpose |
|--------|---------|
| `Utilities.formatDate()` | Date formatting |
| `Logger.log()` | Debug logging |

---

## Observability

The script includes comprehensive observability for rapid debugging and monitoring.

### Log Levels

```javascript
const LogLevel = {
  DEBUG: 0,  // Detailed trace information
  INFO: 1,   // Key operational events
  WARN: 2,   // Unusual but recoverable situations
  ERROR: 3   // Failures and exceptions
};
```

Configure the minimum level in `Observability.gs`:
```javascript
const MIN_LOG_LEVEL = LogLevel.DEBUG;  // Development (show all)
const MIN_LOG_LEVEL = LogLevel.INFO;   // Production (key events only)
```

### Execution Context

Each run maintains context for log correlation:

```javascript
const ExecutionContext = {
  runId: "143025-x7a2",        // Unique run identifier
  startTime: Date,             // Run start time
  currentDate: Date,           // Day being processed
  stats: { ... },              // Execution statistics
  errors: [ ... ]              // Collected errors
};
```

### Logging Functions

| Function | Purpose |
|----------|---------|
| `logDebug(msg, data)` | Detailed trace information |
| `logInfo(msg, data)` | Key operational events |
| `logWarn(msg, data)` | Unusual situations |
| `logError(msg, data)` | Failures (also increments error count) |

### Statistics Tracking

The script tracks execution metrics:

```javascript
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
}
```

### Execution Summary

At the end of each run, a summary is logged:

```
[INFO] === EXECUTION SUMMARY ===
[INFO] Run ID: 143025-x7a2
[INFO] Duration: 2.35s
[INFO] Days: 5 processed, 2 skipped
[INFO] Check Blocks: 12 created, 18 kept, 2 deleted, 0 skipped
[INFO] Response Blocks: 5 created, 5 kept, 0 deleted, 0 skipped, 1 shortened
[INFO] Errors: 0
```

### Error Handling

All major operations are wrapped with `safeExecute()`:

```javascript
safeExecute(`processDay(${formatDate(targetDate)})`, () => {
  processDay(calendar, targetDate);
});
```

This ensures:
- Errors in one day don't crash the entire run
- All errors are logged with context
- Errors are collected for the summary

### Debug Functions

| Function | Purpose |
|----------|---------|
| `debugShowBlocks()` | List all message blocks for the lookahead period |
| `debugShowAllEvents()` | List all events with conflict analysis |
| `cleanupAllBlocks()` | Delete all message blocks (use carefully) |

---

## Testing Strategy

### Manual Testing

1. **Create script** in Apps Script editor
2. **Run `main()` manually** with logging enabled
3. **Verify** blocks appear on calendar
4. **Add a conflicting meeting** and run again
5. **Verify** blocks are rescheduled correctly

### Test Scenarios

1. Clean day (no meetings) → all blocks at default times
2. Morning meeting → check blocks shift
3. All-afternoon meetings → response block shortens or skips
4. All-day OOO → no blocks created
5. Weekend → no blocks created
6. Meeting added after blocks exist → blocks reschedule

---

## Future Considerations

These are NOT in scope but noted for potential future enhancement:

- **Multiple calendars:** Support checking conflicts across multiple calendars
- **Custom colors:** Use specific colors to distinguish message blocks
- **Slack integration:** Post a summary of scheduled blocks to Slack
- **Analytics:** Track how often blocks get rescheduled or skipped

