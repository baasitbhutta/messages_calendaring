# Message Response Blocks - Specification

## Overview

A Google Apps Script that automatically adds time blocks to Google Calendar for checking and responding to messages. The script ensures protected time for communication without conflicting with meetings.

---

## Working Hours

- **Hours:** 8:00 AM - 6:00 PM
- **Days:** Monday through Friday (no weekends)
- **Note:** Working hours are hardcoded in the script (Google Calendar API does not expose user working hour settings)

---

## Block Types

### 1. Message Check (5 minutes)

Short blocks at the end of each hour to quickly check for new messages.

| Property | Value |
|----------|-------|
| **Duration** | 5 minutes |
| **Timing** | X:55 - X+1:00 |
| **Event Title** | "Message Check" |

**Applicable Hours:** 9, 10, 11, 1, 2, 3  
(i.e., 9:55 AM, 10:55 AM, 11:55 AM, 1:55 PM, 2:55 PM, 3:55 PM)

**Excluded Hours:**
- 8 AM — start of day, no check needed
- 12 PM — lunch hour (12:00 - 12:45)
- 4 PM — too close to EOD Message Response block (5:15 PM)
- 5 PM — overlaps with EOD Message Response block

---

### 2. Message Response (30 minutes)

Longer blocks for actually responding to messages.

#### Post-Lunch Block
| Property | Value |
|----------|-------|
| **Duration** | 30 minutes |
| **Default Time** | 12:45 PM - 1:15 PM |
| **Event Title** | "Message Response" |
| **Reschedule Window** | ±2 hours (10:45 AM - 2:45 PM) |

#### End-of-Day Block
| Property | Value |
|----------|-------|
| **Duration** | 30 minutes |
| **Default Time** | 5:30 PM - 6:00 PM |
| **Event Title** | "Message Response" |
| **Reschedule Window** | Up to 2 hours earlier (3:30 PM - 5:30 PM) |

---

## Event Properties

All message blocks are created with the following properties:

| Property | Value |
|----------|-------|
| **Calendar** | Primary/default calendar |
| **Color** | Default (no specific color) |
| **Visibility** | Public |
| **Reminders** | None |
| **Description** | None |

---

## Conflict Detection

### What Counts as a Conflict

An event is considered a conflict only if **both** conditions are true:

1. **The event has guests** (it's a meeting, not a personal blocker)
2. **The user is attending** — their response status is:
   - **Yes** (accepted)
   - **Maybe** (tentatively accepted)
   - **Organizer** (they created the meeting)

### What Does NOT Count as a Conflict

- **Events without guests** → No conflict (personal blockers, focus time)
- **Declined invites** → No conflict (user responded "No")
- **Pending invites** → No conflict (user hasn't responded yet)

This means:
- Personal blockers (Default events) can be overlapped
- Meetings you've declined will be ignored
- Only meetings you're actually attending block time

### Skip Days Entirely

If an **all-day Out of Office event** exists for a day, skip creating any message blocks for that day.

---

## Conflict Resolution

### For 5-Minute Message Check Blocks

1. If a conflict exists at the scheduled time (X:55), **shift the block later**
2. Place immediately after the conflicting event ends
3. If back-to-back meetings cause multiple blocks to need shifting, shift all affected blocks accordingly
4. Blocks should still occur before the next hour's scheduled block if possible

### For 30-Minute Message Response Blocks

1. **First, try the default time** (12:45 PM for post-lunch, 5:30 PM for EOD)
2. If the default time has a conflict, **search for an available 30-minute window** within the reschedule band that is **closest to the default time** (minimal shift)
3. If no 30-minute window is available, **create a shorter block** that fits within the available space in the same window
4. If no space is available at all, **skip the block** for that day

**Note:** When rescheduling, the script prefers the slot with the smallest shift from the default time, rather than simply picking the earliest available slot.

### Processing Order

**30-minute blocks are processed first**, then 5-minute blocks. This ensures the larger, higher-priority response blocks get the best available slots before the flexible check blocks are scheduled.

---

## Dynamic Rescheduling

The script does not just create blocks — it also **monitors and adjusts existing blocks** when calendar conflicts change.

### On Each Run

For each day in the 7-day lookahead:

1. **Fetch all events** for that day
2. **Identify existing message blocks** by title ("Message Check" or "Message Response")
3. **Check each block for new conflicts** with events that have guests
4. **If a block now conflicts:**
   - Delete the existing block
   - Attempt to reschedule using conflict resolution rules
5. **If a block is missing**, create it (with conflict resolution as needed)

### Why This Matters

If a meeting is scheduled *after* message blocks were already created, the script will detect the new conflict and move the affected blocks on its next run.

---

## Scheduling Behavior

### Trigger

- **Frequency:** Runs automatically every hour
- **Active Period:** During working hours (8 AM - 6 PM)
- **Setup:** Time-driven trigger configured separately in Google Apps Script (Triggers page)

### Lookahead

- Manages blocks for the **next 7 days** (one-week lookahead)
- Only processes weekdays

### Duplicate Prevention

- Before creating any block, query the calendar to check if an event with the same title already exists at that time
- If a valid block already exists (no conflicts), leave it in place

### Error Handling

- Relies on **Google Apps Script's built-in failure notifications**
- Failure emails are sent automatically from `apps-scripts-notifications@google.com`

---

## Summary Schedule (Default Times)

| Time | Block Type | Duration |
|------|------------|----------|
| 9:55 AM | Message Check | 5 min |
| 10:55 AM | Message Check | 5 min |
| 11:55 AM | Message Check | 5 min |
| 12:45 PM | Message Response | 30 min |
| 1:55 PM | Message Check | 5 min |
| 2:55 PM | Message Check | 5 min |
| 3:55 PM | Message Check | 5 min |
| 5:30 PM | Message Response | 30 min |

**Total daily message time:** 30 min (checks) + 60 min (responses) = **1.5 hours**
