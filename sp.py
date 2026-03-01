#!/usr/bin/env python3
import json
import sys
import subprocess
import argparse
import os
import base64
import gzip
import uuid
import time
from datetime import date, datetime

# ─── Configuration ────────────────────────────────────────────────────────────

if os.environ.get("SP_CLI_DEV_MODE") == "1" or os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "sync-data.extracted.json")):
    CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
else:
    CONFIG_DIR = os.environ.get("SP_CLI_CONFIG_DIR", os.path.expanduser("~/.config/super-productivity-cli"))

DATA_FILE = os.path.join(CONFIG_DIR, "data", "sync-data.extracted.json")
STATE_FILE = os.path.join(CONFIG_DIR, ".sp-state.json")
RCLONE_TARGET = "dropbox:Apps/super_productivity/sync-data.json"
MAGIC_PREFIX = b"pf_C2__"
TODAY_TAG_ID = "TODAY"

# ─── Colors ───────────────────────────────────────────────────────────────────

def supports_color():
    return sys.stdout.isatty() and os.environ.get("TERM") != "dumb"

USE_COLOR = supports_color()
def _c(code): return f"\033[{code}m" if USE_COLOR else ""

RESET  = _c(0)
BOLD   = _c(1)
DIM    = _c(2)
GREEN  = _c(32)
YELLOW = _c(33)
BLUE   = _c(34)
CYAN   = _c(36)
RED    = _c(31)
GRAY   = _c(90)

def bold(s):   return f"{BOLD}{s}{RESET}"
def green(s):  return f"{GREEN}{s}{RESET}"
def yellow(s): return f"{YELLOW}{s}{RESET}"
def blue(s):   return f"{BLUE}{s}{RESET}"
def cyan(s):   return f"{CYAN}{s}{RESET}"
def red(s):    return f"{RED}{s}{RESET}"
def gray(s):   return f"{GRAY}{s}{RESET}"
def dim(s):    return f"{DIM}{s}{RESET}"

# ─── Time utilities ───────────────────────────────────────────────────────────

def parse_duration(s: str) -> int:
    """Parse '1h30m', '45m', '2h' etc. into milliseconds."""
    s = s.strip().lower()
    total = 0
    if 'h' in s:
        parts = s.split('h')
        try: total += int(parts[0]) * 3_600_000
        except ValueError: pass
        s = parts[1] if len(parts) > 1 else ''
    if 'm' in s:
        parts = s.split('m')
        try: total += int(parts[0]) * 60_000
        except ValueError: pass
    if total == 0:
        raise ValueError(f"Cannot parse duration: '{s}'")
    return total

def fmt_duration(ms: int) -> str:
    if ms <= 0: return "0m"
    total_minutes = ms // 60_000
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if hours and minutes: return f"{hours}h {minutes}m"
    elif hours: return f"{hours}h"
    else: return f"{minutes}m"

def today_str() -> str:
    return date.today().isoformat()

def now_ms() -> int:
    return int(time.time() * 1000)

# ─── Data loading / saving / syncing ──────────────────────────────────────────

def sync_download():
    print(dim("↓ Downloading from cloud..."))
    try:
        proc = subprocess.run(
            ["rclone", "cat", RCLONE_TARGET],
            capture_output=True, check=True
        )
        data = proc.stdout
        if data.startswith(MAGIC_PREFIX):
            data = data[len(MAGIC_PREFIX):]
        decoded = base64.b64decode(data)
        decompressed = gzip.decompress(decoded)
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        with open(DATA_FILE, "wb") as f:
            f.write(decompressed)
    except subprocess.CalledProcessError as e:
        print(yellow(f"⚠ Cloud sync failed (rclone error). Using local file."))
        print(dim(e.stderr.decode().strip()))
    except Exception as e:
        print(yellow(f"⚠ Error processing cloud data: {e}. Using local file."))

def sync_upload():
    print(dim("↑ Uploading to cloud..."))
    try:
        with open(DATA_FILE, "rb") as f:
            raw_data = f.read()
        compressed = gzip.compress(raw_data)
        encoded = base64.b64encode(compressed)
        payload = MAGIC_PREFIX + encoded
        proc = subprocess.Popen(
            ["rclone", "rcat", RCLONE_TARGET],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        out, err = proc.communicate(input=payload)
        if proc.returncode != 0:
            print(red(f"✗ Error uploading to cloud: {err.decode().strip()}"))
        else:
            print(green("✓ Synced to cloud."))
    except Exception as e:
        print(red(f"✗ Error preparing upload: {e}"))

def load_data():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_data(data):
    data["lastModified"] = now_ms()
    data["syncVersion"] = data.get("syncVersion", 0) + 1
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {}

def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)

def clear_state():
    if os.path.exists(STATE_FILE):
        os.remove(STATE_FILE)

# ─── Helper accessors ─────────────────────────────────────────────────────────

def get_tasks(data): return data["state"]["task"]["entities"]
def get_task_ids(data): return data["state"]["task"]["ids"]
def get_projects(data): return data["state"]["project"]["entities"]
def get_tags(data): return data["state"]["tag"]["entities"]
def get_counters(data): return data.get("state", {}).get("simpleCounter", {}).get("entities", {})
def get_counter_ids(data): return data.get("state", {}).get("simpleCounter", {}).get("ids", [])

def get_project_by_name(data, name: str):
    for pid, proj in get_projects(data).items():
        if proj.get("title", "").lower() == name.lower():
            return pid, proj
    return None, None

def project_name(data, project_id: str) -> str:
    proj = get_projects(data).get(project_id, {})
    return proj.get("title", project_id or "—")

# ─── Matching ─────────────────────────────────────────────────────────────────

def find_tasks(data, query: str, include_done=False, only_today=False):
    tasks = get_tasks(data)
    q = query.lower()
    today_tag = get_tags(data).get(TODAY_TAG_ID, {})
    today_task_ids = set(today_tag.get("taskIds", []))

    results = []
    for tid, task in tasks.items():
        if not include_done and task.get("isDone"): continue
        if only_today and tid not in today_task_ids: continue
        if q in task.get("title", "").lower():
            results.append(task)
    return results

def pick_task(data, query: str, include_done=False) -> dict | None:
    results = find_tasks(data, query, include_done=include_done)
    if not results:
        print(red(f"No task found matching '{query}'"))
        return None
    if len(results) == 1:
        return results[0]
    print(yellow(f"Multiple matches for '{query}':"))
    for i, t in enumerate(results, 1):
        pname = project_name(data, t.get("projectId", ""))
        print(f"  {bold(str(i))}. {t['title']} {dim(f'[{pname}]')}")
    try:
        choice = int(input("Select number: ").strip())
        return results[choice - 1]
    except (ValueError, IndexError):
        print(red("Invalid selection."))
        return None

def pick_counter(data, query: str):
    q = query.lower()
    results = [c for c in get_counters(data).values() if q in c.get("title", "").lower()]
    if not results:
        print(red(f"No counter found matching '{query}'"))
        return None
    if len(results) == 1:
        return results[0]
    print(yellow(f"Multiple counters found for '{query}':"))
    for i, c in enumerate(results, 1):
        ctype = c.get("type", "Unknown")
        print(f"  {bold(str(i))}. {c['title']} {dim(f'[{ctype}]')}")
    try:
        choice = int(input("Select number: ").strip())
        return results[choice - 1]
    except (ValueError, IndexError):
        print(red("Invalid selection."))
        return None

# ─── Global Commands ──────────────────────────────────────────────────────────

def cmd_status(args):
    data = load_data()
    today = today_str()
    tasks = get_tasks(data)
    today_tag = get_tags(data).get(TODAY_TAG_ID, {})
    today_task_ids = set(today_tag.get("taskIds", []))

    total_ms = 0
    per_project = {}

    for tid, task in tasks.items():
        spent_today = task.get("timeSpentOnDay", {}).get(today, 0)
        if spent_today > 0:
            total_ms += spent_today
            pname = project_name(data, task.get("projectId", ""))
            per_project[pname] = per_project.get(pname, 0) + spent_today

    print(f"\n{bold('📊 Today\'s Status')} {dim(f'({today})')}")
    print("─" * 50)

    # Active counter tracking
    state = load_state()
    active_counter_id = state.get("currentCounterId")
    if active_counter_id:
        active_counter = get_counters(data).get(active_counter_id)
        if active_counter:
            elapsed_ms = now_ms() - state.get("startedAt", now_ms())
            print(f"  {green('▶ TRACKING Counter')} {bold(active_counter['title'])}")
            print(f"                     {dim(f'Elapsed this session: {fmt_duration(elapsed_ms)}')}")
            print()

    # Today's tasks
    print(f"  {bold('Today\'s Tasks:')}")
    if today_task_ids:
        for tid in today_task_ids:
            task = tasks.get(tid)
            if not task: continue
            done_mark = green("✓") if task.get("isDone") else yellow("○")
            spent_today = task.get("timeSpentOnDay", {}).get(today, 0)
            est = task.get("timeEstimate", 0)
            time_info = ""
            if spent_today or est:
                time_info = dim(f" [{fmt_duration(spent_today)}/{fmt_duration(est)}]")
            print(f"    {done_mark} {task['title']}{time_info}")
    else:
        print(f"    {dim('No tasks tagged for today')}")

    print()
    print(f"  {bold('Total time:')} {cyan(fmt_duration(total_ms))}")
    print()

    if per_project:
        print(f"  {bold('By project:')}")
        for pname, ms in sorted(per_project.items(), key=lambda x: -x[1]):
            bar_len = max(1, int(ms / 1_800_000))
            bar = "█" * min(bar_len, 20)
            print(f"    {pname:<25} {cyan(fmt_duration(ms))}  {dim(bar)}")
    print()

# ─── Task Endpoint ────────────────────────────────────────────────────────────

def cmd_task_list(args):
    data = load_data()
    tasks = get_tasks(data)
    today = today_str()
    today_tag = get_tags(data).get(TODAY_TAG_ID, {})
    today_task_ids = set(today_tag.get("taskIds", []))

    filter_pid = None
    if args.project:
        filter_pid, _ = get_project_by_name(data, args.project)
        if not filter_pid:
            print(red(f"Project '{args.project}' not found"))
            return

    rows = []
    for tid in get_task_ids(data):
        task = tasks.get(tid)
        if not task: continue
        if not args.done and task.get("isDone"): continue
        if args.done and not task.get("isDone"): continue
        if filter_pid and task.get("projectId") != filter_pid: continue
        if args.today and tid not in today_task_ids: continue
        if not filter_pid and task.get("parentId"): continue
        rows.append(task)

    if not rows:
        print(dim("No tasks found."))
        return

    print()
    for task in rows:
        tid = task["id"]
        is_today = tid in today_task_ids
        is_done  = task.get("isDone")
        
        done_icon  = green("✓") if is_done else yellow("○")
        today_icon = cyan("🌤") + " " if is_today else "   "
        pname = project_name(data, task.get("projectId", ""))

        spent_today = task.get("timeSpentOnDay", {}).get(today, 0)
        total_spent = task.get("timeSpent", 0)
        estimate    = task.get("timeEstimate", 0)

        time_parts = []
        if spent_today: time_parts.append(green(f"today:{fmt_duration(spent_today)}"))
        if total_spent: time_parts.append(dim(f"total:{fmt_duration(total_spent)}"))
        if estimate:    time_parts.append(blue(f"est:{fmt_duration(estimate)}"))

        time_str = "  " + "  ".join(time_parts) if time_parts else ""
        sub_ids = task.get("subTaskIds", [])
        sub_str = dim(f" (+{len(sub_ids)} subtasks)") if sub_ids else ""

        title = task['title']
        print(f"  {today_icon}{done_icon} {title}{sub_str}{time_str}  {dim(f'[{pname}]')}")
    print()

def cmd_task_add(args):
    data = load_data()
    project_id = "INBOX_PROJECT"
    if args.project:
        project_id, proj = get_project_by_name(data, args.project)
        if not project_id:
            print(red(f"Project '{args.project}' not found."))
            return

    estimate_ms = 0
    if args.estimate:
        try: estimate_ms = parse_duration(args.estimate)
        except ValueError as e: return print(red(str(e)))

    new_id = str(uuid.uuid4()).replace("-", "")[:20]
    task = {
        "id": new_id,
        "title": args.title,
        "projectId": project_id,
        "subTaskIds": [],
        "timeSpentOnDay": {},
        "timeSpent": 0,
        "timeEstimate": estimate_ms,
        "isDone": False,
        "tagIds": [],
        "created": now_ms(),
        "attachments": [],
        "modified": now_ms(),
    }

    data["state"]["task"]["ids"].append(new_id)
    data["state"]["task"]["entities"][new_id] = task

    if project_id in data["state"]["project"]["entities"]:
        proj_entity = data["state"]["project"]["entities"][project_id]
        if new_id not in proj_entity.get("taskIds", []):
            proj_entity.setdefault("taskIds", []).append(new_id)

    save_data(data)
    est_str = f"  est: {fmt_duration(estimate_ms)}" if estimate_ms else ""
    print(green(f"✓ Added: '{args.title}' [{project_name(data, project_id)}]{est_str}"))

def cmd_task_edit(args):
    data = load_data()
    task = pick_task(data, args.query)
    if not task: return
    if args.title:
        old = task["title"]
        task["title"] = args.title
        task["modified"] = now_ms()
        save_data(data)
        print(green(f"✓ Renamed: '{old}' → '{args.title}'"))
    else:
        print(yellow("Nothing to edit. Use --title to rename."))

def cmd_task_done(args):
    data = load_data()
    task = pick_task(data, args.query)
    if not task: return
    was_done = task.get("isDone", False)

    task["isDone"] = True
    task["doneOn"] = now_ms()
    task["modified"] = now_ms()

    parent_id = task.get("parentId")
    if parent_id:
        parent = get_tasks(data).get(parent_id)
        if parent:
            sibling_ids = parent.get("subTaskIds", [])
            all_done = all(get_tasks(data).get(sid, {}).get("isDone", False) for sid in sibling_ids)
            if all_done and not parent.get("isDone"):
                parent["isDone"] = True
                parent["doneOn"] = now_ms()
                parent["modified"] = now_ms()
                print(dim(f"  → Parent '{parent['title']}' also marked done"))

    save_data(data)
    if was_done: print(yellow(f"Already done: {task['title']}"))
    else: print(green(f"✓ Done: {bold(task['title'])}"))

def cmd_task_estimate(args):
    data = load_data()
    task = pick_task(data, args.query)
    if not task: return
    try: ms = parse_duration(args.duration)
    except ValueError as e: return print(red(str(e)))
    task["timeEstimate"] = ms
    task["modified"] = now_ms()
    save_data(data)
    print(green(f"✓ Estimate set: {bold(task['title'])} → {fmt_duration(ms)}"))

def cmd_task_log(args):
    data = load_data()
    task = pick_task(data, args.query)
    if not task: return
    try: ms = parse_duration(args.duration)
    except ValueError as e: return print(red(str(e)))
    
    log_date = args.date if args.date else today_str()
    spent = task.setdefault("timeSpentOnDay", {})
    old = spent.get(log_date, 0)
    spent[log_date] = ms
    task["timeSpent"] = sum(spent.values())
    task["modified"] = now_ms()
    save_data(data)

    if old: print(green(f"✓ Updated log for {log_date}: {bold(task['title'])} {fmt_duration(old)} → {fmt_duration(ms)}"))
    else: print(green(f"✓ Logged {fmt_duration(ms)} for {log_date}: {bold(task['title'])}"))

def cmd_task_today(args):
    data = load_data()
    task = pick_task(data, args.query)
    if not task: return

    today_tag = get_tags(data).get(TODAY_TAG_ID)
    if not today_tag: return print(red("TODAY tag not found in data."))

    tid = task["id"]
    tag_tasks = today_tag.setdefault("taskIds", [])
    task_tags = task.setdefault("tagIds", [])

    if tid in tag_tasks:
        tag_tasks.remove(tid)
        if TODAY_TAG_ID in task_tags: task_tags.remove(TODAY_TAG_ID)
        msg = yellow(f"☁ Removed from Today: {task['title']}")
    else:
        tag_tasks.insert(0, tid)
        if TODAY_TAG_ID not in task_tags: task_tags.insert(0, TODAY_TAG_ID)
        msg = green(f"🌤 Added to Today: {bold(task['title'])}")

    task["modified"] = now_ms()
    save_data(data)
    print(msg)

def cmd_task_plan(args):
    data = load_data()
    task = pick_task(data, args.query)
    if not task: return

    try:
        dt_str = f"{args.date} {args.time}"
        dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
        # mktime uses local timezone to convert to UTC timestamp
        ms_utc = int(time.mktime(dt.timetuple()) * 1000)
    except ValueError:
        return print(red("Invalid date or time format. Please use YYYY-MM-DD and HH:MM."))

    task["dueWithTime"] = ms_utc
    task["remindAt"] = ms_utc
    task["modified"] = now_ms()

    msgs = []
    msgs.append(f"due {args.date} {args.time}")

    if args.estimate:
        try: 
            est_ms = parse_duration(args.estimate)
            task["timeEstimate"] = est_ms
            msgs.append(f"est {fmt_duration(est_ms)}")
        except ValueError as e:
            return print(red(str(e)))

    save_data(data)
    print(green(f"✓ Planned: {bold(task['title'])} ({', '.join(msgs)})"))

def cmd_task_move(args):
    data = load_data()
    task = pick_task(data, args.query)
    if not task: return

    new_pid, new_proj = get_project_by_name(data, args.project)
    if not new_pid: return print(red(f"Project '{args.project}' not found."))

    old_pid = task.get("projectId")
    if old_pid and old_pid in data["state"]["project"]["entities"]:
        old_task_ids = data["state"]["project"]["entities"][old_pid].get("taskIds", [])
        if task["id"] in old_task_ids: old_task_ids.remove(task["id"])

    new_task_ids = data["state"]["project"]["entities"][new_pid].setdefault("taskIds", [])
    if task["id"] not in new_task_ids: new_task_ids.append(task["id"])

    task["projectId"] = new_pid
    task["modified"] = now_ms()
    save_data(data)
    print(green(f"✓ Moved: {bold(task['title'])} → {new_proj['title']}"))

def cmd_task_delete(args):
    data = load_data()
    task = pick_task(data, args.query, include_done=True)
    if not task: return

    tid = task["id"]
    print(f"{red('Delete')} '{bold(task['title'])}'? {dim('[y/N]')} ", end="")
    if input().strip().lower() != "y": return print(dim("Cancelled."))

    ids_list = data["state"]["task"]["ids"]
    if tid in ids_list: ids_list.remove(tid)
    data["state"]["task"]["entities"].pop(tid, None)

    proj_id = task.get("projectId")
    if proj_id and proj_id in data["state"]["project"]["entities"]:
        p_ids = data["state"]["project"]["entities"][proj_id].get("taskIds", [])
        if tid in p_ids: p_ids.remove(tid)

    parent_id = task.get("parentId")
    if parent_id:
        parent = get_tasks(data).get(parent_id)
        if parent and tid in parent.get("subTaskIds", []):
            parent["subTaskIds"].remove(tid)

    for tag in get_tags(data).values():
        if tid in tag.get("taskIds", []):
            tag["taskIds"].remove(tid)

    save_data(data)
    print(red(f"✗ Deleted: '{task['title']}'"))

# ─── Project Endpoint ─────────────────────────────────────────────────────────

def cmd_project_list(args):
    data = load_data()
    projects = get_projects(data)
    print(f"\n{bold('Projects:')}")
    for pid, proj in projects.items():
        task_count = len(proj.get("taskIds", []))
        print(f"  - {bold(proj['title'])} {dim(f'({task_count} tasks)')}")
    print()

# ─── Counter Endpoint ─────────────────────────────────────────────────────────

def cmd_counter_list(args):
    data = load_data()
    counters = get_counters(data)
    if not counters:
        print(dim("No counters found."))
        return

    today = today_str()
    print(f"\n{bold('Counters:')}")
    
    state = load_state()
    active_counter_id = state.get("currentCounterId")

    for cid in get_counter_ids(data):
        c = counters.get(cid)
        if not c: continue

        title = c["title"]
        ctype = c.get("type")
        val_today = c.get("countOnDay", {}).get(today, 0)

        if ctype == "StopWatch":
            if active_counter_id == cid:
                elapsed_ms = now_ms() - state.get("startedAt", now_ms())
                print(f"  ▶ {bold(title)} {green('[TICKING]')}  {dim(f'(Today: {fmt_duration(val_today + elapsed_ms)})')}")
            else:
                print(f"  - {bold(title)} {dim('[StopWatch]')}  {cyan(f'(Today: {fmt_duration(val_today)})')}")
        else:
            print(f"  - {bold(title)} {dim('[ClickCounter]')}  {cyan(f'(Today: {val_today})')}")
    print()

def cmd_counter_add(args):
    data = load_data()
    title = args.title
    ctype = "StopWatch" if args.type.lower() == "stopwatch" else "ClickCounter"
    
    new_id = str(uuid.uuid4()).replace("-", "")[:20]
    counter = {
        "id": new_id,
        "title": title,
        "isEnabled": True,
        "type": ctype,
        "countOnDay": {},
        "isOn": False,
        "isTrackStreaks": args.track_streaks
    }

    if args.icon:
        counter["icon"] = args.icon
    
    if args.track_streaks:
        counter["streakMinValue"] = args.streak_min
        
        if args.streak_mode == "weekly-frequency":
            counter["streakMode"] = "weekly-frequency"
            counter["streakWeeklyFrequency"] = args.streak_freq
        else:
            counter["streakMode"] = "default"
            # e.g., "1,2,3,4,5" -> Mon to Fri
            days = [int(d.strip()) for d in args.streak_days.split(",") if d.strip().isdigit()]
            counter["streakWeekDays"] = {str(i): (i in days) for i in range(7)}
        
    if ctype == "StopWatch" and args.countdown:
        try:
            counter["countdownDuration"] = parse_duration(args.countdown)
        except ValueError as e:
            return print(red(f"Invalid duration: {e}"))

    if "simpleCounter" not in data.setdefault("state", {}):
        data["state"]["simpleCounter"] = {"ids": [], "entities": {}}
    
    data["state"]["simpleCounter"]["ids"].append(new_id)
    data["state"]["simpleCounter"]["entities"][new_id] = counter

    save_data(data)
    print(green(f"✓ Added {ctype}: '{title}'"))

def cmd_counter_edit(args):
    data = load_data()
    counter = pick_counter(data, args.query)
    if not counter: return

    changed = False

    if args.title:
        counter["title"] = args.title
        changed = True
    
    if args.icon is not None:
        counter["icon"] = args.icon
        changed = True

    if args.track_streaks is not None:
        counter["isTrackStreaks"] = args.track_streaks
        changed = True
        
    if args.streak_min is not None:
        counter["streakMinValue"] = args.streak_min
        changed = True
        
    if args.streak_mode is not None:
        counter["streakMode"] = args.streak_mode
        changed = True

    if args.streak_freq is not None:
        counter["streakWeeklyFrequency"] = args.streak_freq
        if counter.get("streakMode") != "weekly-frequency":
            counter["streakMode"] = "weekly-frequency"
        changed = True
        
    if args.streak_days:
        days = [int(d.strip()) for d in args.streak_days.split(",") if d.strip().isdigit()]
        counter["streakWeekDays"] = {str(i): (i in days) for i in range(7)}
        if counter.get("streakMode") != "default":
            counter["streakMode"] = "default"
        changed = True
        
    if args.countdown:
        try:
            counter["countdownDuration"] = parse_duration(args.countdown)
            changed = True
        except ValueError as e:
            return print(red(f"Invalid duration: {e}"))
            
    if changed:
        save_data(data)
        print(green(f"✓ Updated counter: '{counter['title']}'"))
    else:
        print(yellow("Nothing to edit. Use arguments like --title, --icon, etc."))

def cmd_counter_log(args):
    data = load_data()
    counter = pick_counter(data, args.query)
    if not counter: return

    log_date = args.date if args.date else today_str()
    ctype = counter.get("type")

    try:
        if ctype == "StopWatch":
            val = parse_duration(args.value)
        else:
            val = int(args.value)
    except ValueError as e:
        return print(red(f"Invalid value for {ctype}: {e}"))

    counts = counter.setdefault("countOnDay", {})
    old = counts.get(log_date, 0)
    counts[log_date] = val

    save_data(data)
    
    if ctype == "StopWatch":
        print(green(f"✓ Updated log for {log_date}: {bold(counter['title'])} {fmt_duration(old)} → {fmt_duration(val)}"))
    else:
        print(green(f"✓ Logged {val} for {log_date}: {bold(counter['title'])} (was {old})"))

def _stop_counter(data, state):
    cid = state.get("currentCounterId")
    started_at = state.get("startedAt", now_ms())
    if not cid: return None, 0
    elapsed_ms = now_ms() - started_at
    today = today_str()
    counter = get_counters(data).get(cid)
    if counter:
        counts = counter.setdefault("countOnDay", {})
        counts[today] = counts.get(today, 0) + elapsed_ms
    clear_state()
    return counter, elapsed_ms

def cmd_counter_toggle(args):
    data = load_data()
    counter = pick_counter(data, args.query)
    if not counter: return

    ctype = counter.get("type")
    today = today_str()

    if ctype == "ClickCounter":
        counts = counter.setdefault("countOnDay", {})
        counts[today] = counts.get(today, 0) + 1
        save_data(data)
        print(green(f"✓ Incremented {bold(counter['title'])} → {counts[today]}"))
    else:
        # StopWatch logic
        state = load_state()
        if state.get("currentCounterId") == counter["id"]:
            # Stop it
            c, elapsed = _stop_counter(data, state)
            save_data(data)
            print(green(f"■ Stopped: {bold(counter['title'])} +{fmt_duration(elapsed)}"))
        else:
            # Maybe stop existing one
            if state.get("currentCounterId"):
                prev_c, elapsed = _stop_counter(data, state)
                save_data(data)
                print(yellow(f"■ Stopped previous: '{prev_c['title']}' +{fmt_duration(elapsed)}"))
            # Start new one
            state = {"currentCounterId": counter["id"], "startedAt": now_ms()}
            save_state(state)
            print(green(f"▶ Started counter: {bold(counter['title'])}"))

def cmd_counter_delete(args):
    data = load_data()
    counter = pick_counter(data, args.query)
    if not counter: return

    cid = counter["id"]
    print(f"{red('Delete counter')} '{bold(counter['title'])}'? {dim('[y/N]')} ", end="")
    if input().strip().lower() != "y": return print(dim("Cancelled."))

    state = load_state()
    if state.get("currentCounterId") == cid:
        clear_state()

    ids_list = data["state"]["simpleCounter"]["ids"]
    if cid in ids_list: ids_list.remove(cid)
    data["state"]["simpleCounter"]["entities"].pop(cid, None)

    save_data(data)
    print(red(f"✗ Deleted counter: '{counter['title']}'"))

# ─── Argument parser ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        prog="sp",
        description="Super Productivity CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="endpoint")

    # sp status
    sub.add_parser("status", help="Show today's summary")

    # sp task
    task_p = sub.add_parser("task", help="Task management commands")
    task_sub = task_p.add_subparsers(dest="action")

    # task list
    tl_p = task_sub.add_parser("list", help="List tasks")
    tl_p.add_argument("--project", "-p", help="Filter by project")
    tl_p.add_argument("--done", "-d", action="store_true", help="Show done tasks")
    tl_p.add_argument("--today", "-t", action="store_true", help="Only Today tasks")

    # task add
    ta_p = task_sub.add_parser("add", help="Add task")
    ta_p.add_argument("title", help="Task title")
    ta_p.add_argument("--project", "-p", help="Project name")
    ta_p.add_argument("--estimate", "-e", help="Estimate (e.g. 1h30m)")

    # task edit
    te_p = task_sub.add_parser("edit", help="Edit task")
    te_p.add_argument("query", help="Search query")
    te_p.add_argument("--title", help="New title")

    # task done
    td_p = task_sub.add_parser("done", help="Mark done")
    td_p.add_argument("query", help="Search query")

    # task estimate
    test_p = task_sub.add_parser("estimate", help="Set estimate")
    test_p.add_argument("query", help="Search query")
    test_p.add_argument("duration", help="Duration (e.g. 1h30m)")

    # task log
    tlog_p = task_sub.add_parser("log", help="Set spent time")
    tlog_p.add_argument("query", help="Search query")
    tlog_p.add_argument("duration", help="Duration")
    tlog_p.add_argument("--date", help="Date YYYY-MM-DD")

    # task today
    ttod_p = task_sub.add_parser("today", help="Toggle Today tag")
    ttod_p.add_argument("query", help="Search query")

    # task plan
    tplan_p = task_sub.add_parser("plan", help="Plan task (set due date/time and optional estimate)")
    tplan_p.add_argument("query", help="Search query")
    tplan_p.add_argument("date", help="Due date (YYYY-MM-DD)")
    tplan_p.add_argument("time", help="Due time (HH:MM)")
    tplan_p.add_argument("--estimate", "-e", help="Estimate (e.g. 1h30m)")

    # task move
    tmov_p = task_sub.add_parser("move", help="Move to project")
    tmov_p.add_argument("query", help="Search query")
    tmov_p.add_argument("--project", "-p", required=True, help="Target project")

    # task delete
    tdel_p = task_sub.add_parser("delete", help="Delete task")
    tdel_p.add_argument("query", help="Search query")

    # sp project
    proj_p = sub.add_parser("project", help="Project management")
    proj_sub = proj_p.add_subparsers(dest="action")
    proj_sub.add_parser("list", help="List projects")

    # sp counter
    cnt_p = sub.add_parser("counter", help="Counter management")
    cnt_sub = cnt_p.add_subparsers(dest="action")

    cnt_sub.add_parser("list", help="List counters")

    cadd_p = cnt_sub.add_parser("add", help="Add counter")
    cadd_p.add_argument("title", help="Title")
    cadd_p.add_argument("--type", choices=["ClickCounter", "StopWatch"], default="ClickCounter", help="Type of counter")
    cadd_p.add_argument("--icon", help="Material icon name (e.g., 'free_breakfast')")
    cadd_p.add_argument("--track-streaks", action="store_true", help="Enable streak tracking")
    cadd_p.add_argument("--streak-min", type=int, default=1, help="Minimum value required for a streak")
    cadd_p.add_argument("--streak-mode", choices=["default", "weekly-frequency"], default="default", help="Streak calculation mode")
    cadd_p.add_argument("--streak-freq", type=int, default=3, help="Weekly frequency (e.g., 3 means 3 times a week)")
    cadd_p.add_argument("--streak-days", default="1,2,3,4,5", help="Comma-sep days (0=Sun, 1=Mon...6=Sat) e.g., '1,2,3,4,5'")
    cadd_p.add_argument("--countdown", help="StopWatch countdown duration (e.g., 30m)")

    cedp_p = cnt_sub.add_parser("edit", help="Edit counter metadata")
    cedp_p.add_argument("query", help="Counter search query")
    cedp_p.add_argument("--title", help="New title")
    cedp_p.add_argument("--icon", help="Material icon name")
    cedp_p.add_argument("--track-streaks", action="store_true", default=None, help="Enable streak tracking")
    cedp_p.add_argument("--no-track-streaks", action="store_false", dest="track_streaks", help="Disable streak tracking")
    cedp_p.add_argument("--streak-min", type=int, help="Minimum value required for a streak")
    cedp_p.add_argument("--streak-mode", choices=["default", "weekly-frequency"], help="Streak calculation mode")
    cedp_p.add_argument("--streak-freq", type=int, help="Weekly frequency (e.g., 3 times a week)")
    cedp_p.add_argument("--streak-days", help="Comma-sep days (0=Sun, 1=Mon...6=Sat) e.g., '1,2,3,4,5'")
    cedp_p.add_argument("--countdown", help="StopWatch countdown duration (e.g., 30m)")

    clog_p = cnt_sub.add_parser("log", help="Set value directly")
    clog_p.add_argument("query", help="Counter search query")
    clog_p.add_argument("value", help="Value (integer, or e.g. 1h for StopWatch)")
    clog_p.add_argument("--date", help="Date YYYY-MM-DD")

    ctog_p = cnt_sub.add_parser("toggle", help="Increment or Toggle running state")
    ctog_p.add_argument("query", help="Counter search query")

    cdel_p = cnt_sub.add_parser("delete", help="Delete counter")
    cdel_p.add_argument("query", help="Counter search query")

    args = parser.parse_args()

    # Pre-validation & Dispatch
    read_only_commands = {
        ("status", None),
        ("task", "list"),
        ("project", "list"),
        ("counter", "list")
    }

    dispatch = {
        ("status", None): cmd_status,
        ("task", "list"): cmd_task_list,
        ("task", "add"): cmd_task_add,
        ("task", "edit"): cmd_task_edit,
        ("task", "done"): cmd_task_done,
        ("task", "estimate"): cmd_task_estimate,
        ("task", "log"): cmd_task_log,
        ("task", "today"): cmd_task_today,
        ("task", "plan"): cmd_task_plan,
        ("task", "move"): cmd_task_move,
        ("task", "delete"): cmd_task_delete,
        ("project", "list"): cmd_project_list,
        ("counter", "list"): cmd_counter_list,
        ("counter", "add"): cmd_counter_add,
        ("counter", "edit"): cmd_counter_edit,
        ("counter", "log"): cmd_counter_log,
        ("counter", "toggle"): cmd_counter_toggle,
        ("counter", "delete"): cmd_counter_delete,
    }

    if args.endpoint == "status":
        action_key = ("status", None)
    elif getattr(args, "endpoint", None) and getattr(args, "action", None):
        action_key = (args.endpoint, args.action)
    else:
        # endpoint given but no action
        if getattr(args, "endpoint", None) == "task": task_p.print_help()
        elif getattr(args, "endpoint", None) == "project": proj_p.print_help()
        elif getattr(args, "endpoint", None) == "counter": cnt_p.print_help()
        else: parser.print_help()
        sys.exit(1)

    if action_key in dispatch:
        sync_download()
        dispatch[action_key](args)
        if action_key not in read_only_commands:
            sync_upload()
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
