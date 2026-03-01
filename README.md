# Super Productivity CLI (`sp.py`)

A fast, lightweight, and powerful Command Line Interface for [Super Productivity](https://super-productivity.com/) written in Python. It directly reads, modifies, and synchronizes your Super Productivity data file natively, allowing for quick terminal-based task and time management that immediately reflects in your main GUI app.

## ☁️ Cloud Sync & Requirements (Read First!)

To use this CLI effectively with cloud sync, you **must have Dropbox Sync enabled** in your Super Productivity app and **`rclone` installed** on your system.

**1. Install `rclone`**
- **macOS/Linux:** `sudo -v ; curl https://rclone.org/install.sh | sudo bash`
- **Windows:** Download from [rclone.org](https://rclone.org/downloads/) or run `winget install Rclone.Rclone`

**2. Configure Dropbox remote**
Run `rclone config`, create a new remote, and name it **exactly** `dropbox`. Follow the interactive prompts to authorize it.

**3. Python 3.x** is required to run the script.

*(Note: If `rclone` fails or is not configured, the script gracefully falls back to looking for data locally at `data/sync-data.extracted.json`.)*

---

## Capabilities

- **Full Native Compatibility:** Edits `sync-data.json` directly via standard JSON encoding, meaning tasks and time tracking are fully compatible with the official Super Productivity app.
- **Resource Endpoints:** Cleanly categorized commands (`sp status`, `sp task`, `sp project`, `sp counter`).
- **Cloud Sync Support:** Built-in integration with `rclone` for syncing your tasks to Dropbox before and after execution.
- **Graceful Offline Fallback:** Uninterrupted usage if cloud sync fails or if `rclone` isn't configured.
- **Advanced Counters (`simpleCounter`):** Full control over Click Counters and Stopwatches, including daily/weekly streak tracking and countdown timers.
- **Fuzzy Matching:** Smart substring-based searching for easily referring to tasks without knowing full titles.

---
## Usage

The CLI behaves just like `git` or `docker`. You pass an endpoint (`task`, `project`, `counter`) followed by a verb (`add`, `edit`, `list`, `delete`, etc.). 

### 📊 Global Status

See a quick daily summary of active tracking, unticked tasks for today, total time spent, and project distribution.

```bash
sp.py status
```

### 📋 Task Management (`sp task`)

```bash
# List all tasks
sp.py task list

# Filter tasks
sp.py task list --today
sp.py task list --done
sp.py task list --project "Work"

# Setup tasks
sp.py task add "Write weekly report"
sp.py task add "Fix bug #123" --project "Inbox" --estimate 45m

# Edit or Modify
sp.py task edit "weekly report" --title "Write final report"
sp.py task estimate "report" 2h

# Log Time & Status Updates
sp.py task log "report" 1h30m         # Log 1 hour and 30 minutes
sp.py task log "report" 2h --date 2026-02-28 # Log time for a past date
sp.py task done "bug"                 # Mask task as done
sp.py task today "report"             # Toggle task on Today's list
sp.py task move "bug" --project Work  # Move task to another project

# Delete
sp.py task delete "bug"
```

*Note: `sp task start` and `sp task stop` are not provided as active session states are stored client-side in the Super Productivity frontend.*

### ⏳ Counters & Habits (`sp counter`)

Supports two native types: **StopWatches** (tracking durations) and **ClickCounters** (tracking counts/habits).

```bash
# List all counters
sp.py counter list

# Quickly toggle a state:
sp.py counter toggle "water"       # Increments a ClickCounter (+1)
sp.py counter toggle "stand desk"  # Starts or Pauses a StopWatch

# Manually log values
sp.py counter log "water" 5
sp.py counter log "stand desk" 1h
```

**Advanced Counter Creation & Editing**

It natively supports Super Productivity's streak tracker, schedules, icons, and countdowns!

```bash
# Create simple ClickCounter
sp.py counter add "Drink Water" --type ClickCounter --icon "local_drink"

# Create a StopWatch that counts down
sp.py counter add "Reading Session" --type StopWatch --countdown 30m --icon "menu_book"

# Create a habit with specific streak days (1=Mon ... 5=Fri)
sp.py counter add "Work out" --type ClickCounter \
    --track-streaks \
    --streak-min 1 \
    --streak-days "1,2,3,4,5" \
    --icon "fitness_center"

# Create a habit for exactly 3 times a week (Frequency Streak)
sp.py counter add "Call Parents" --type ClickCounter \
    --track-streaks \
    --streak-mode weekly-frequency \
    --streak-freq 3

# Edit an existing counter
sp.py counter edit "Work out" --title "Gym" --streak-freq 4
```

### 📁 Project Management (`sp project`)

```bash
# List existing projects
sp.py project list
```

---
## Automation & Testing

We provide a **`test.py`** script containing full endpoint integration coverage using a sterilized `demo.json`. 

```bash
# Automatically sets up demo.json in a safe sandbox mode, runs all commands, and restores original data securely.
python3 test.py
```

## Setup Notes `(Syncing)`

By default, the script looks for your synced application save on Dropbox via `rclone`.
The hardcoded target inside `sp.py` is `dropbox:Apps/super_productivity/sync-data.json`.
Make sure you have an rclone remote configured named `dropbox` exactly if you plan to use sync. If it fails, the script falls back back safely to `data/sync-data.extracted.json`!
