# Message Response Blocks - Setup Guide

## File Structure

The script is split into focused modules following separation of concerns:

| File | Lines | Purpose |
|------|-------|---------|
| `Config.gs` | ~80 | All constants and configuration |
| `Observability.gs` | ~250 | Structured logging and debugging utilities |
| `CalendarUtils.gs` | ~100 | Calendar queries and date utilities |
| `ConflictDetection.gs` | ~115 | Conflict detection logic |
| `BlockManagement.gs` | ~140 | Block CRUD operations |
| `CheckBlockScheduler.gs` | ~130 | 5-minute check block scheduling |
| `ResponseBlockScheduler.gs` | ~260 | 45-minute response block scheduling |
| `Main.gs` | ~200 | Entry point and orchestration |

---

## Quick Start

### 1. Create the Google Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Click **New Project**
3. Rename the project to "Message Response Blocks"

### 2. Add the Code Files

1. Delete the default `Code.gs` file
2. For each `.gs` file in this folder:
   - Click **+** next to Files → **Script**
   - Name it exactly as shown (e.g., `Config`, `CalendarUtils`, etc.)
   - Copy the contents from the corresponding file
3. Click **Save** (Ctrl/Cmd + S)

**File order doesn't matter** — Google Apps Script combines all files and functions are globally accessible.

### 3. Authorize the Script

1. Click **Run** → Select `testRun` function
2. Click **Review Permissions**
3. Select your Google account
4. Click **Advanced** → **Go to Message Response Blocks (unsafe)**
5. Click **Allow** to grant calendar access

### 4. Set Up the Hourly Trigger

**Option A: Run the setup function**
1. Select `setupTrigger` from the function dropdown
2. Click **Run**

**Option B: Manual setup**
1. Click the **clock icon** (Triggers) in the left sidebar
2. Click **+ Add Trigger**
3. Configure:
   - **Function:** `main`
   - **Event source:** Time-driven
   - **Type:** Hour timer
   - **Interval:** Every hour
4. Click **Save**

### 5. Verify It Works

1. Run `testRun()` manually
2. Check your Google Calendar for new blocks
3. You should see:
   - 6× "Message Check" blocks (5 min each)
   - 2× "Message Response" blocks (45 min each)

---

## Available Functions

### Main Functions

| Function | Purpose |
|----------|---------|
| `main()` | Main scheduling function (runs hourly via trigger) |
| `processDay(calendar, date)` | Process a single day |

### Setup Functions

| Function | Purpose |
|----------|---------|
| `setupTrigger()` | Creates the hourly trigger |
| `removeTrigger()` | Removes all triggers |

### Testing & Debug Functions

| Function | Purpose |
|----------|---------|
| `testRun()` | Runs main() with logging |
| `cleanupAllBlocks()` | Deletes all message blocks (⚠️ careful!) |
| `debugShowBlocks()` | Shows existing blocks for all days |
| `debugShowAllEvents()` | Shows all calendar events with conflict analysis |

---

## Configuration

Edit `Config.gs` to customize:

```javascript
// Working hours
const WORK_START_HOUR = 8;   // 8 AM
const WORK_END_HOUR = 18;    // 6 PM

// Which hours to create 5-min check blocks
const CHECK_HOURS = [9, 10, 11, 13, 14, 15];

// Minimum duration for shortened response blocks
const MIN_RESPONSE_DURATION = 15;

// OOO detection keywords
const OOO_KEYWORDS = ['ooo', 'out of office', 'vacation', ...];
```

---

## Module Responsibilities

### Config.gs
All configurable constants in one place. Change settings here.

### Observability.gs
- Structured logging with levels (DEBUG, INFO, WARN, ERROR)
- Execution context tracking (run ID, current date)
- Statistics collection (blocks created/kept/deleted/skipped)
- Execution summary at the end of each run
- Error tracking and aggregation
- Safe execution wrappers with error handling

### CalendarUtils.gs
- Fetching events from calendar
- Date/time formatting
- OOO detection
- Weekend detection

### ConflictDetection.gs
- Determining if user is attending an event
- Finding conflicts in time ranges
- Only events with guests count as conflicts

### BlockManagement.gs
- Finding existing blocks
- Creating new blocks (with correct visibility/reminders)
- Deleting blocks

### CheckBlockScheduler.gs
- Scheduling 5-minute check blocks
- Shifting blocks when conflicts exist
- Handling cascading conflicts

### ResponseBlockScheduler.gs
- Scheduling 45-minute response blocks
- Finding available slots within windows
- Creating shortened blocks when needed
- Finding the slot closest to default time

### Main.gs
- Entry point (`main()`)
- Day processing orchestration
- Trigger setup/removal
- Testing and debug functions

---

## Observability & Debugging

The script includes comprehensive observability features for rapid debugging:

### Log Levels
- **DEBUG**: Detailed execution trace (function entry/exit, decisions)
- **INFO**: Key operations (blocks created, days processed)
- **WARN**: Unusual but recoverable situations
- **ERROR**: Failures and exceptions

### Execution Summary
After each run, you'll see a summary like:
```
[INFO] === EXECUTION SUMMARY ===
[INFO] Run ID: 143025-x7a2
[INFO] Duration: 2.35s
[INFO] Days: 5 processed, 2 skipped
[INFO] Check Blocks: 12 created, 18 kept, 2 deleted, 0 skipped
[INFO] Response Blocks: 5 created, 5 kept, 0 deleted, 0 skipped, 1 shortened
[INFO] Errors: 0
```

### Adjusting Log Level
In `Observability.gs`, change `MIN_LOG_LEVEL`:
```javascript
const MIN_LOG_LEVEL = LogLevel.DEBUG;  // Show all logs
const MIN_LOG_LEVEL = LogLevel.INFO;   // Production-friendly
const MIN_LOG_LEVEL = LogLevel.ERROR;  // Errors only
```

---

## Troubleshooting

### Blocks not appearing
- Check that you granted calendar permissions
- Run `testRun()` and check **Execution log** (View → Logs)
- Look at the execution summary for statistics
- Verify the trigger exists in the Triggers panel

### Blocks created on weekends
- The script should skip weekends
- Check `CalendarUtils.gs` → `isWeekend()` function

### Want to start fresh
1. Run `cleanupAllBlocks()` to remove all message blocks
2. Run `main()` to recreate them

### See what blocks exist
- Run `debugShowBlocks()` to log all current message blocks
- Run `debugShowAllEvents()` to see all events with conflict analysis

---

## How It Works

1. **Hourly trigger** runs `main()`
2. **For each day** in the next 7 days:
   - Skip weekends and OOO days
   - Schedule 45-min response blocks first (higher priority)
   - Schedule 5-min check blocks
3. **Conflict resolution**:
   - Only considers meetings you're attending (accepted/maybe/organizer)
   - Ignores personal blockers and declined meetings
   - Shifts or shortens blocks as needed
4. **Dynamic rescheduling**:
   - If a new meeting conflicts, blocks are moved on next run
