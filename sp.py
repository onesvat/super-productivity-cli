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
import re
from datetime import date, datetime

# ─── Configuration ────────────────────────────────────────────────────────────
VERSION = "0.1.2"

if os.environ.get("SP_CLI_DEV_MODE") == "1" or os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "sync-data.extracted.json")):
    CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
else:
    CONFIG_DIR = os.environ.get("SP_CLI_CONFIG_DIR", os.path.expanduser("~/.config/super-productivity-cli"))

DATA_FILE = os.path.join(CONFIG_DIR, "data", "sync-data.extracted.json")
STATE_FILE = os.path.join(CONFIG_DIR, ".sp-state.json")
RCLONE_TARGET = "dropbox:Apps/super_productivity/sync-data.json"
MAGIC_PREFIX = b"pf_C2__"
TODAY_TAG_ID = "TODAY"
OUTPUT_MODE = "text"

# ─── Colors ───────────────────────────────────────────────────────────────────

def supports_color():
    return sys.stdout.isatty() and os.environ.get("TERM") != "dumb" and OUTPUT_MODE == "text"

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

def fmt_time(ms_utc: int) -> str:
    """Format UTC millisecond timestamp to local date/time string."""
    if not ms_utc: return ""
    dt = datetime.fromtimestamp(ms_utc / 1000.0)
    d_str = dt.strftime("%Y-%m-%d")
    t_str = dt.strftime("%H:%M")
    if d_str == today_str():
        return t_str
    return f"{d_str} {t_str}"


def is_machine_mode(args=None) -> bool:
    if args is not None:
        return getattr(args, "json", False) or getattr(args, "ndjson", False)
    return OUTPUT_MODE in ("json", "ndjson")


def emit(args, payload):
    if getattr(args, "json", False):
        print(json.dumps(payload, ensure_ascii=False))
        return
    if getattr(args, "ndjson", False):
        if isinstance(payload, list):
            for row in payload:
                print(json.dumps(row, ensure_ascii=False))
        else:
            print(json.dumps(payload, ensure_ascii=False))
        return


def fail(args, message: str):
    if is_machine_mode(args):
        emit(args, {"error": message})
    else:
        print(red(message))
    raise SystemExit(1)


def confirm(args, message: str) -> bool:
    if getattr(args, "yes", False):
        return True
    if is_machine_mode(args):
        return False
    try:
        ans = input(f"{yellow('?')} {message} {dim('[y/N]')} ").lower()
        return ans == "y"
    except (EOFError, KeyboardInterrupt):
        return False

# ─── Data loading / saving / syncing ──────────────────────────────────────────

def sync_download():
    if not is_machine_mode():
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
        if not is_machine_mode():
            print(yellow("⚠ Cloud sync failed (rclone error). Using local file."))
            print(dim(e.stderr.decode().strip()))
    except Exception as e:
        if not is_machine_mode():
            print(yellow(f"⚠ Error processing cloud data: {e}. Using local file."))

def sync_upload():
    if not is_machine_mode():
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
            if not is_machine_mode():
                print(red(f"✗ Error uploading to cloud: {err.decode().strip()}"))
        else:
            if not is_machine_mode():
                print(green("✓ Synced to cloud."))
    except Exception as e:
        if not is_machine_mode():
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
    if name.lower() == "inbox":
        return "INBOX_PROJECT", get_projects(data).get("INBOX_PROJECT", {"title": "Inbox"})
    return None, None


def resolve_project_id(data, s: str) -> str:
    """Resolve project ID from ID or name."""
    if not s: return "INBOX_PROJECT"
    # Try ID first
    if s in get_projects(data):
        return s
    # Try Name
    pid, _ = get_project_by_name(data, s)
    if pid:
        return pid
    # Fallback to Inbox if nothing found
    if s.lower() == "inbox":
        return "INBOX_PROJECT"
    return s

def project_name(data, project_id: str) -> str:
    proj = get_projects(data).get(project_id, {})
    return proj.get("title", project_id or "—")


def get_task_by_name(data, query: str):
    for tid in get_task_ids(data):
        task = get_tasks(data).get(tid)
        if task and matches_query(task.get("title", ""), query):
            return tid, task
    return None, None


def resolve_task_id(data, s: str) -> str:
    """Resolve task ID from ID, title or substring."""
    if not s: return None
    # Try ID first
    if s in get_tasks(data):
        return s
    # Try Name/Substring
    tid, _ = get_task_by_name(data, s)
    if tid:
        return tid
    return s


def get_task_or_exit(data, task_id: str, args):
    resolved_id = resolve_task_id(data, task_id)
    task = get_tasks(data).get(resolved_id)
    if not task:
        fail(args, f"Task '{task_id}' not found")
    return task


def get_project_or_exit(data, project_id: str, args):
    project = get_projects(data).get(project_id)
    if not project:
        fail(args, f"Project '{project_id}' not found")
    return project


def get_counter_by_name(data, query: str):
    counters = get_counters(data)
    for cid in get_counter_ids(data):
        counter = counters.get(cid)
        if counter and matches_query(counter.get("title", ""), query):
            return cid, counter
    return None, None


def resolve_counter_id(data, s: str) -> str:
    """Resolve counter ID from ID, title or substring."""
    if not s: return None
    # Try ID first
    if s in get_counters(data):
        return s
    # Try Name/Substring
    cid, _ = get_counter_by_name(data, s)
    if cid:
        return cid
    return s


def get_counter_or_exit(data, counter_id: str, args):
    resolved_id = resolve_counter_id(data, counter_id)
    counter = get_counters(data).get(resolved_id)
    if not counter:
        fail(args, f"Counter '{counter_id}' not found")
    return counter


def serialize_task(data, task, full=False):
    today = today_str()
    today_tag = get_tags(data).get(TODAY_TAG_ID, {})
    today_task_ids = set(today_tag.get("taskIds", []))
    if not full:
        return {
            "id": task.get("id"),
            "title": task.get("title"),
            "projectId": task.get("projectId"),
            "estimate": task.get("timeEstimate", 0),
            "isDone": bool(task.get("isDone", False)),
            "today": task.get("id") in today_task_ids,
        }
    t = dict(task)
    t["estimate"] = t.get("timeEstimate", 0)
    t["today"] = t.get("id") in today_task_ids
    return t


def serialize_project(project, full=False):
    if not full:
        return {"id": project.get("id"), "title": project.get("title")}
    return dict(project)


def serialize_counter(counter, full=False):
    if not full:
        return {
            "id": counter.get("id"),
            "title": counter.get("title"),
            "type": counter.get("type"),
        }
    return dict(counter)

# ─── Matching ─────────────────────────────────────────────────────────────────

def matches_query(value: str, query: str) -> bool:
    value_l = value.lower()
    query_l = query.lower()
    if "*" not in query_l:
        return query_l in value_l
    wildcard_pattern = "^" + re.escape(query_l).replace(r"\*", ".*") + "$"
    return re.match(wildcard_pattern, value_l) is not None


def cmd_task_search(args):
    data = load_data()
    rows = []
    tasks = get_tasks(data)
    for tid in get_task_ids(data):
        task = tasks.get(tid)
        if not task:
            continue
        if matches_query(task.get("title", ""), args.query):
            rows.append(task)

    if is_machine_mode(args):
        emit(args, [serialize_task(data, t, full=args.full) for t in rows])
        return

    if not rows:
        print(dim("No matching tasks found."))
        return

    for task in rows:
        tid = task.get("id")
        title = task.get("title", "")
        pname = project_name(data, task.get("projectId", ""))
        print(f"{bold(tid)}  {title}  {dim(f'[{pname}]')}")


def cmd_counter_search(args):
    data = load_data()
    rows = []
    counters = get_counters(data)
    for cid in get_counter_ids(data):
        counter = counters.get(cid)
        if not counter:
            continue
        if matches_query(counter.get("title", ""), args.query):
            rows.append(counter)

    if is_machine_mode(args):
        emit(args, [serialize_counter(c, full=args.full) for c in rows])
        return

    if not rows:
        print(dim("No matching counters found."))
        return

    for counter in rows:
        cid = counter.get("id")
        title = counter.get("title", "")
        print(f"{bold(cid)}  {title}")

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
        # Exclude subtasks from total to avoid double counting (parent already aggregates subtask time)
        if task.get("parentId"): continue
        
        spent_today = task.get("timeSpentOnDay", {}).get(today, 0)
        if spent_today > 0:
            total_ms += spent_today
            pname = project_name(data, task.get("projectId", ""))
            per_project[pname] = per_project.get(pname, 0) + spent_today

    # Active counter tracking
    state = load_state()
    active_counter_id = state.get("currentCounterId")
    active_counter_payload = None
    if active_counter_id:
        active_counter = get_counters(data).get(active_counter_id)
        if active_counter:
            elapsed_ms = now_ms() - state.get("startedAt", now_ms())
            total_ms += elapsed_ms  # Include active time in total
            active_counter_payload = {
                "id": active_counter_id,
                "title": active_counter.get("title"),
                "elapsedMs": elapsed_ms,
            }

    # Today's tasks
    planned_timed = []
    planned_day = []
    unplanned = []
    if today_task_ids:
        today_tasks_obj = [tasks.get(tid) for tid in today_task_ids if tasks.get(tid)]
        
        # Also add tasks scheduled for today but not tagged with TODAY
        for tid, task in tasks.items():
            if tid in today_task_ids: continue
            if task.get("dueDay") == today or (task.get("dueWithTime") and datetime.fromtimestamp(task.get("dueWithTime")/1000).strftime("%Y-%m-%d") == today):
                 today_tasks_obj.append(task)

        for t in today_tasks_obj:
            if t.get("dueWithTime"):
                planned_timed.append(t)
            elif t.get("dueDay"):
                planned_day.append(t)
            else:
                unplanned.append(t)
                
        planned_timed.sort(key=lambda t: t.get("dueWithTime", 0))

    if is_machine_mode(args):
        payload = {
            "date": today,
            "totalMs": total_ms,
            "total": fmt_duration(total_ms),
            "activeCounter": active_counter_payload,
            "tasks": {
                "plannedTimed": [serialize_task(data, t, full=args.full) for t in planned_timed],
                "plannedDay": [serialize_task(data, t, full=args.full) for t in planned_day],
                "unplanned": [serialize_task(data, t, full=args.full) for t in unplanned],
            },
            "byProject": [
                {"project": pname, "timeMs": ms, "time": fmt_duration(ms)}
                for pname, ms in sorted(per_project.items(), key=lambda x: -x[1])
            ],
        }
        emit(args, payload)
        return

    print(f"\n{bold('📊 Today\'s Status')} {dim(f'({today} {fmt_time(now_ms())})')}")
    print("─" * 50)
    if active_counter_payload:
        print(f"  {green('▶ TRACKING Counter')} {bold(active_counter_payload['title'])}")
        print(f"                     {dim(f'Elapsed this session: {fmt_duration(active_counter_payload['elapsedMs'])}')}")
        print()

    if planned_timed:
        print(f"  {bold('📅 Planned Tasks (Timed):')}")
        for task in planned_timed:
            done_mark = green("✓") if task.get("isDone") else yellow("○")
            spent_today = task.get("timeSpentOnDay", {}).get(today, 0)
            est = task.get("timeEstimate", 0)
            due_ms = task.get("dueWithTime")
            time_icon = yellow(f"⏰ {fmt_time(due_ms)} ")
            time_info = dim(f" [{fmt_duration(spent_today)}/{fmt_duration(est)}]") if (spent_today or est) else ""
            print(f"    {time_icon}{done_mark} {task['title']}{time_info}")
        print()

    if planned_day:
        print(f"  {bold('📅 Planned Tasks (All-day):')}")
        for task in planned_day:
            done_mark = green("✓") if task.get("isDone") else yellow("○")
            spent_today = task.get("timeSpentOnDay", {}).get(today, 0)
            est = task.get("timeEstimate", 0)
            day_str = task.get("dueDay")
            display_day = "Today" if day_str == today_str() else day_str
            time_icon = yellow(f"📅 {display_day} ")
            time_info = dim(f" [{fmt_duration(spent_today)}/{fmt_duration(est)}]") if (spent_today or est) else ""
            print(f"    {time_icon}{done_mark} {task['title']}{time_info}")
        print()

    title = "🌤 Other Tasks Today:" if (planned_timed or planned_day) else "🌤 Today's Tasks:"
    print(f"  {bold(title)}")
    if not unplanned and not planned_timed and not planned_day:
        print(f"    {dim('No tasks tagged for today')}")
    for task in unplanned:
        done_mark = green("✓") if task.get("isDone") else yellow("○")
        spent_today = task.get("timeSpentOnDay", {}).get(today, 0)
        est = task.get("timeEstimate", 0)
        time_info = dim(f" [{fmt_duration(spent_today)}/{fmt_duration(est)}]") if (spent_today or est) else ""
        print(f"    {done_mark} {task['title']}{time_info}")

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
        filter_pid = resolve_project_id(data, args.project)
        if filter_pid not in get_projects(data) and filter_pid != "INBOX_PROJECT":
            fail(args, f"Project '{args.project}' not found")

    from datetime import timedelta
    tmrw_str = (date.today() + timedelta(days=1)).isoformat()

    rows = []
    for tid in get_task_ids(data):
        task = tasks.get(tid)
        if not task: continue
        if not args.done and task.get("isDone"): continue
        if args.done and not task.get("isDone"): continue
        if filter_pid and task.get("projectId") != filter_pid: continue
        if args.today and tid not in today_task_ids: continue
        
        is_scheduled = bool(task.get("dueWithTime") or task.get("dueDay"))
        if args.scheduled and not is_scheduled: continue
        
        d_str = task.get("dueDay")
        if not d_str and task.get("dueWithTime"):
            d_str = datetime.fromtimestamp(task.get("dueWithTime") / 1000.0).strftime("%Y-%m-%d")
            
        if args.tomorrow and d_str != tmrw_str: continue
        if args.date and d_str != args.date: continue
        
        if not filter_pid and task.get("parentId"): continue
        rows.append(task)

    if is_machine_mode(args):
        emit(args, [serialize_task(data, t, full=args.full) for t in rows])
        return

    if not rows:
        print(dim("No tasks found."))
        return

    planned_timed = [t for t in rows if t.get("dueWithTime")]
    planned_day = [t for t in rows if t.get("dueDay") and not t.get("dueWithTime")]
    unplanned = [t for t in rows if not t.get("dueWithTime") and not t.get("dueDay")]
    
    planned_timed.sort(key=lambda t: t.get("dueWithTime", 0))
    planned_day.sort(key=lambda t: t.get("dueDay", ""))

    def print_task_row(task, show_time=False, show_day=False):
        tid = task["id"]
        is_today = tid in today_task_ids
        is_done  = task.get("isDone")
        
        time_icon = ""
        if show_time:
            due_ms = task.get("dueWithTime")
            time_icon = yellow(f"⏰ {fmt_time(due_ms)} ") if due_ms else ""
        elif show_day:
            day_str = task.get("dueDay")
            if day_str:
                display_day = "Today" if day_str == today_str() else day_str
                time_icon = yellow(f"📅 {display_day} ")

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
        print(f"  {today_icon}{time_icon}{done_icon} {title}{sub_str}{time_str}  {dim(f'[{pname}]')}")

    print()
    if planned_timed:
        print(bold("📅 Planned Tasks (Timed):"))
        for t in planned_timed:
            print_task_row(t, show_time=True)
        print()

    if planned_day:
        print(bold("📅 Planned Tasks (All-day):"))
        for t in planned_day:
            print_task_row(t, show_day=True)
        print()

    if unplanned:
        title = "🌤 Other Tasks Today:" if args.today else "📝 Other Tasks:"
        print(bold(title))
        for t in unplanned:
            print_task_row(t)
        print()


def cmd_task_view(args):
    data = load_data()
    task = get_task_or_exit(data, args.id, args)
    if is_machine_mode(args):
        emit(args, serialize_task(data, task, full=args.full))
        return
    task_id = task.get("id")
    print(f"{bold(task.get('title', ''))} {dim(f'[{task_id}]')}")
    print(f"  Project: {project_name(data, task.get('projectId', ''))}")
    print(f"  Done: {'yes' if task.get('isDone') else 'no'}")
    print(f"  Today: {'yes' if task.get('id') in set(get_tags(data).get(TODAY_TAG_ID, {}).get('taskIds', [])) else 'no'}")
    print(f"  Estimate: {fmt_duration(task.get('timeEstimate', 0))}")

def cmd_task_add(args):
    data = load_data()
    project_id = "INBOX_PROJECT"
    project_id = resolve_project_id(data, args.project or "Inbox")
    if project_id not in get_projects(data) and project_id != "INBOX_PROJECT":
        fail(args, f"Project '{args.project}' not found")

    estimate_ms = 0
    if args.estimate:
        try:
            estimate_ms = parse_duration(args.estimate)
        except ValueError as e:
            fail(args, str(e))

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
    if is_machine_mode(args):
        emit(args, serialize_task(data, task, full=args.full))
        return
    est_str = f"  est: {fmt_duration(estimate_ms)}" if estimate_ms else ""
    print(green(f"✓ Added: '{args.title}' [{project_name(data, project_id)}]{est_str}"))

def cmd_task_edit(args):
    data = load_data()
    task = get_task_or_exit(data, args.id, args)
    old_title = task.get("title", "")
    if args.title:
        old = task["title"]
        task["title"] = args.title
        task["modified"] = now_ms()
    if args.estimate:
        try:
            task["timeEstimate"] = parse_duration(args.estimate)
            task["modified"] = now_ms()
        except ValueError as e:
            fail(args, str(e))
    if args.project:
        new_pid = resolve_project_id(data, args.project)
        get_project_or_exit(data, new_pid, args)
        old_pid = task.get("projectId")
        if old_pid and old_pid in data["state"]["project"]["entities"]:
            old_task_ids = data["state"]["project"]["entities"][old_pid].get("taskIds", [])
            if task["id"] in old_task_ids:
                old_task_ids.remove(task["id"])
        new_task_ids = data["state"]["project"]["entities"][new_pid].setdefault("taskIds", [])
        if task["id"] not in new_task_ids:
            new_task_ids.append(task["id"])
        task["projectId"] = new_pid
        task["modified"] = now_ms()
    if args.title or args.estimate or args.project:
        save_data(data)
        if is_machine_mode(args):
            emit(args, serialize_task(data, task, full=args.full))
            return
        print(green(f"✓ Updated: '{old_title}'"))
    else:
        fail(args, "Nothing to edit. Use --title, --estimate or --project.")

def cmd_task_done(args):
    data = load_data()
    task = get_task_or_exit(data, args.id, args)
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
                if not is_machine_mode(args):
                    print(dim(f"  → Parent '{parent['title']}' also marked done"))

    save_data(data)
    if is_machine_mode(args):
        emit(args, serialize_task(data, task, full=args.full))
        return
    if was_done:
        print(yellow(f"Already done: {task['title']}"))
    else:
        print(green(f"✓ Done: {bold(task['title'])}"))

def cmd_task_estimate(args):
    data = load_data()
    task = get_task_or_exit(data, args.id, args)
    try:
        ms = parse_duration(args.duration)
    except ValueError as e:
        fail(args, str(e))
    task["timeEstimate"] = ms
    task["modified"] = now_ms()
    save_data(data)
    if is_machine_mode(args):
        emit(args, serialize_task(data, task, full=args.full))
        return
    print(green(f"✓ Estimate set: {bold(task['title'])} → {fmt_duration(ms)}"))

def cmd_task_log(args):
    data = load_data()
    task = get_task_or_exit(data, args.id, args)
    try:
        ms = parse_duration(args.duration)
    except ValueError as e:
        fail(args, str(e))
    
    log_date = args.date if args.date else today_str()
    spent = task.setdefault("timeSpentOnDay", {})
    old = spent.get(log_date, 0)
    spent[log_date] = ms
    task["timeSpent"] = sum(spent.values())
    task["modified"] = now_ms()
    save_data(data)
    if is_machine_mode(args):
        emit(args, serialize_task(data, task, full=args.full))
        return
    if old:
        print(green(f"✓ Updated log for {log_date}: {bold(task['title'])} {fmt_duration(old)} → {fmt_duration(ms)}"))
    else:
        print(green(f"✓ Logged {fmt_duration(ms)} for {log_date}: {bold(task['title'])}"))

def cmd_task_today(args):
    data = load_data()
    task = get_task_or_exit(data, args.id, args)

    today_tag = get_tags(data).get(TODAY_TAG_ID)
    if not today_tag:
        fail(args, "TODAY tag not found in data.")

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
    if is_machine_mode(args):
        emit(args, serialize_task(data, task, full=args.full))
        return
    print(msg)

def cmd_task_plan(args):
    data = load_data()
    task = get_task_or_exit(data, args.id, args)

    try:
        # Validate date
        datetime.strptime(args.date, "%Y-%m-%d")
        task["dueDay"] = args.date
        
        if args.time:
            dt_str = f"{args.date} {args.time}"
            dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
            ms_utc = int(time.mktime(dt.timetuple()) * 1000)
            task["dueWithTime"] = ms_utc
            task["remindAt"] = ms_utc
            msg_dt = f"due {args.date} {args.time}"
        else:
            task.pop("dueWithTime", None)
            task.pop("remindAt", None)
            msg_dt = f"due {args.date} (All-day)"
    except ValueError:
        fail(args, "Invalid date or time format. Please use YYYY-MM-DD and optionally HH:MM.")

    task["modified"] = now_ms()

    msgs = [msg_dt]

    if args.estimate:
        try: 
            est_ms = parse_duration(args.estimate)
            task["timeEstimate"] = est_ms
            msgs.append(f"est {fmt_duration(est_ms)}")
        except ValueError as e:
            fail(args, str(e))

    save_data(data)
    if is_machine_mode(args):
        emit(args, serialize_task(data, task, full=args.full))
        return
    print(green(f"✓ Planned: {bold(task['title'])} ({', '.join(msgs)})"))

def cmd_task_move(args):
    data = load_data()
    task = get_task_or_exit(data, args.id, args)
    new_pid = resolve_project_id(data, args.project)
    new_proj = get_project_or_exit(data, new_pid, args)

    old_pid = task.get("projectId")
    if old_pid and old_pid in data["state"]["project"]["entities"]:
        old_task_ids = data["state"]["project"]["entities"][old_pid].get("taskIds", [])
        if task["id"] in old_task_ids: old_task_ids.remove(task["id"])

    new_task_ids = data["state"]["project"]["entities"][new_pid].setdefault("taskIds", [])
    if task["id"] not in new_task_ids: new_task_ids.append(task["id"])

    task["projectId"] = new_pid
    task["modified"] = now_ms()
    save_data(data)
    if is_machine_mode(args):
        emit(args, serialize_task(data, task, full=args.full))
        return
    print(green(f"✓ Moved: {bold(task['title'])} → {new_proj['title']}"))

def cmd_task_delete(args):
    data = load_data()
    task = get_task_or_exit(data, args.id, args)
    if not confirm(args, f"Delete task '{task['title']}'?"):
        fail(args, "Deletion cancelled")

    tid = task["id"]

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
    if is_machine_mode(args):
        emit(args, {"deleted": tid})
        return
    print(red(f"✗ Deleted: '{task['title']}'"))

# ─── Project Endpoint ─────────────────────────────────────────────────────────

def cmd_project_list(args):
    data = load_data()
    projects = get_projects(data)
    rows = [serialize_project(projects[pid], full=args.full) for pid in projects]
    if is_machine_mode(args):
        emit(args, rows)
        return
    print(f"\n{bold('Projects:')}")
    for pid, proj in projects.items():
        task_count = len(proj.get("taskIds", []))
        print(f"  - {bold(proj['title'])} {dim(f'({task_count} tasks)')}")
    print()


def cmd_project_view(args):
    data = load_data()
    project_id = resolve_project_id(data, args.id)
    project = get_project_or_exit(data, project_id, args)
    if is_machine_mode(args):
        emit(args, serialize_project(project, full=args.full))
        return
    project_id = project.get("id")
    print(f"{bold(project.get('title', ''))} {dim(f'[{project_id}]')}")
    print(f"  Tasks: {len(project.get('taskIds', []))}")

# ─── Counter Endpoint ─────────────────────────────────────────────────────────

def cmd_counter_list(args):
    data = load_data()
    counters = get_counters(data)
    if not counters:
        if is_machine_mode(args):
            emit(args, [])
            return
        print(dim("No counters found."))
        return

    if is_machine_mode(args):
        rows = []
        for cid in get_counter_ids(data):
            c = counters.get(cid)
            if c:
                rows.append(serialize_counter(c, full=args.full))
        emit(args, rows)
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
            fail(args, f"Invalid duration: {e}")

    if "simpleCounter" not in data.setdefault("state", {}):
        data["state"]["simpleCounter"] = {"ids": [], "entities": {}}
    
    data["state"]["simpleCounter"]["ids"].append(new_id)
    data["state"]["simpleCounter"]["entities"][new_id] = counter

    save_data(data)
    if is_machine_mode(args):
        emit(args, serialize_counter(counter, full=args.full))
        return
    print(green(f"✓ Added {ctype}: '{title}'"))

def cmd_counter_edit(args):
    data = load_data()
    counter = get_counter_or_exit(data, args.id, args)

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
            fail(args, f"Invalid duration: {e}")
            
    if changed:
        save_data(data)
        if is_machine_mode(args):
            emit(args, serialize_counter(counter, full=args.full))
            return
        print(green(f"✓ Updated counter: '{counter['title']}'"))
    else:
        fail(args, "Nothing to edit. Use arguments like --title, --icon, etc.")

def cmd_counter_log(args):
    data = load_data()
    counter = get_counter_or_exit(data, args.id, args)

    log_date = args.date if args.date else today_str()
    ctype = counter.get("type")

    try:
        if ctype == "StopWatch":
            val = parse_duration(args.value)
        else:
            val = int(args.value)
    except ValueError as e:
        fail(args, f"Invalid value for {ctype}: {e}")

    counts = counter.setdefault("countOnDay", {})
    old = counts.get(log_date, 0)
    counts[log_date] = val

    save_data(data)
    if is_machine_mode(args):
        emit(args, serialize_counter(counter, full=args.full))
        return

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
    counter = get_counter_or_exit(data, args.id, args)

    ctype = counter.get("type")
    today = today_str()

    if ctype == "ClickCounter":
        counts = counter.setdefault("countOnDay", {})
        counts[today] = counts.get(today, 0) + 1
        save_data(data)
        if is_machine_mode(args):
            emit(args, serialize_counter(counter, full=args.full))
            return
        print(green(f"✓ Incremented {bold(counter['title'])} → {counts[today]}"))
    else:
        # StopWatch logic
        state = load_state()
        if state.get("currentCounterId") == counter["id"]:
            # Stop it
            c, elapsed = _stop_counter(data, state)
            save_data(data)
            if is_machine_mode(args):
                emit(args, serialize_counter(counter, full=args.full))
                return
            print(green(f"■ Stopped: {bold(counter['title'])} +{fmt_duration(elapsed)}"))
        else:
            # Maybe stop existing one
            if state.get("currentCounterId"):
                prev_c, elapsed = _stop_counter(data, state)
                save_data(data)
                if not is_machine_mode(args):
                    print(yellow(f"■ Stopped previous: '{prev_c['title']}' +{fmt_duration(elapsed)}"))
            # Start new one
            state = {"currentCounterId": counter["id"], "startedAt": now_ms()}
            save_state(state)
            if is_machine_mode(args):
                emit(args, serialize_counter(counter, full=args.full))
                return
            print(green(f"▶ Started counter: {bold(counter['title'])}"))

def cmd_counter_delete(args):
    data = load_data()
    counter = get_counter_or_exit(data, args.id, args)
    if not confirm(args, f"Delete counter '{counter['title']}'?"):
        fail(args, "Deletion cancelled")

    cid = counter["id"]

    state = load_state()
    if state.get("currentCounterId") == cid:
        clear_state()

    ids_list = data["state"]["simpleCounter"]["ids"]
    if cid in ids_list: ids_list.remove(cid)
    data["state"]["simpleCounter"]["entities"].pop(cid, None)

    save_data(data)
    if is_machine_mode(args):
        emit(args, {"deleted": cid})
        return
    print(red(f"✗ Deleted counter: '{counter['title']}'"))

# ─── Argument parser ──────────────────────────────────────────────────────────

def main():
    output_parent = argparse.ArgumentParser(add_help=False)
    out_group = output_parent.add_mutually_exclusive_group()
    out_group.add_argument("--json", action="store_true", default=argparse.SUPPRESS, help="Emit JSON output")
    out_group.add_argument("--ndjson", action="store_true", default=argparse.SUPPRESS, help="Emit NDJSON output")
    output_parent.add_argument("--full", action="store_true", default=argparse.SUPPRESS, help="Include full entity payload in JSON/NDJSON output")

    parser = argparse.ArgumentParser(
        prog="sp",
        description="Super Productivity CLI",
        epilog=(
            "Note for AI/LLM agents: Use --json or --ndjson flags for unambiguous, parseable output.\n"
            "Default JSON shows essential fields; use --full for all fields.\n"
            "All operations use IDs (not fuzzy matching) for reliability."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        parents=[output_parent],
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    sub = parser.add_subparsers(dest="endpoint")

    # sp status
    sub.add_parser("status", help="Show today's summary", parents=[output_parent])

    # sp task
    task_p = sub.add_parser("task", help="Task management commands", parents=[output_parent])
    task_sub = task_p.add_subparsers(dest="action")

    # task list
    tl_p = task_sub.add_parser("list", help="List tasks", parents=[output_parent])
    tl_p.add_argument("--project", "-p", help="Filter by project ID")
    tl_p.add_argument("--done", "-d", action="store_true", help="Show done tasks")
    tl_p.add_argument("--today", "-t", action="store_true", help="Only Today tasks")
    tl_p.add_argument("--tomorrow", action="store_true", help="Only Tomorrow tasks")
    tl_p.add_argument("--date", help="Filter by due date (YYYY-MM-DD)")
    tl_p.add_argument("--scheduled", action="store_true", help="Only scheduled tasks (any date)")

    # task view
    tv_p = task_sub.add_parser("view", help="View task by ID", parents=[output_parent])
    tv_p.add_argument("id", help="Task ID")

    # task search
    ts_p = task_sub.add_parser("search", help="Search tasks by title (substring or * wildcard)", parents=[output_parent])
    ts_p.add_argument("query", help="Query text, supports '*' wildcard")

    # task add
    ta_p = task_sub.add_parser("add", help="Add task", parents=[output_parent])
    ta_p.add_argument("title", help="Task title")
    ta_p.add_argument("--project", "-p", help="Project ID")
    ta_p.add_argument("--estimate", "-e", help="Estimate (e.g. 1h30m)")

    # task edit
    te_p = task_sub.add_parser("edit", help="Edit task by ID", parents=[output_parent])
    te_p.add_argument("id", help="Task ID")
    te_p.add_argument("--title", help="New title")
    te_p.add_argument("--estimate", help="Estimate (e.g. 1h30m)")
    te_p.add_argument("--project", "-p", help="Project ID")

    # task done
    td_p = task_sub.add_parser("done", help="Mark done", parents=[output_parent])
    td_p.add_argument("id", help="Task ID")

    # task estimate
    test_p = task_sub.add_parser("estimate", help="Set estimate", parents=[output_parent])
    test_p.add_argument("id", help="Task ID")
    test_p.add_argument("duration", help="Duration (e.g. 1h30m)")

    # task log
    tlog_p = task_sub.add_parser("log", help="Set spent time", parents=[output_parent])
    tlog_p.add_argument("id", help="Task ID")
    tlog_p.add_argument("duration", help="Duration")
    tlog_p.add_argument("--date", help="Date YYYY-MM-DD")

    # task today
    ttod_p = task_sub.add_parser("today", help="Toggle Today tag", parents=[output_parent])
    ttod_p.add_argument("id", help="Task ID")

    # task plan
    tplan_p = task_sub.add_parser("plan", help="Plan task (set due date, optional time and estimate)", parents=[output_parent])
    tplan_p.add_argument("id", help="Task ID")
    tplan_p.add_argument("date", help="Due date (YYYY-MM-DD)")
    tplan_p.add_argument("time", nargs="?", help="Due time (HH:MM) - Optional")
    tplan_p.add_argument("--estimate", "-e", help="Estimate (e.g. 1h30m)")

    # task move
    tmov_p = task_sub.add_parser("move", help="Move to project", parents=[output_parent])
    tmov_p.add_argument("id", help="Task ID")
    tmov_p.add_argument("--project", "-p", required=True, help="Target project ID")

    # task delete
    tdel_p = task_sub.add_parser("delete", help="Delete task", parents=[output_parent])
    tdel_p.add_argument("id", help="Task ID")
    tdel_p.add_argument("--yes", action="store_true", help="Confirm delete without prompting")

    # sp project
    proj_p = sub.add_parser("project", help="Project management", parents=[output_parent])
    proj_sub = proj_p.add_subparsers(dest="action")
    proj_sub.add_parser("list", help="List projects", parents=[output_parent])
    pv_p = proj_sub.add_parser("view", help="View project by ID", parents=[output_parent])
    pv_p.add_argument("id", help="Project ID")

    # sp counter
    cnt_p = sub.add_parser("counter", help="Counter management", parents=[output_parent])
    cnt_sub = cnt_p.add_subparsers(dest="action")

    cnt_sub.add_parser("list", help="List counters", parents=[output_parent])

    csearch_p = cnt_sub.add_parser("search", help="Search counters by title (substring or * wildcard)", parents=[output_parent])
    csearch_p.add_argument("query", help="Query text, supports '*' wildcard")

    cadd_p = cnt_sub.add_parser("add", help="Add counter", parents=[output_parent])
    cadd_p.add_argument("title", help="Title")
    cadd_p.add_argument("--type", choices=["ClickCounter", "StopWatch"], default="ClickCounter", help="Type of counter")
    cadd_p.add_argument("--icon", help="Material icon name (e.g., 'free_breakfast')")
    cadd_p.add_argument("--track-streaks", action="store_true", help="Enable streak tracking")
    cadd_p.add_argument("--streak-min", type=int, default=1, help="Minimum value required for a streak")
    cadd_p.add_argument("--streak-mode", choices=["default", "weekly-frequency"], default="default", help="Streak calculation mode")
    cadd_p.add_argument("--streak-freq", type=int, default=3, help="Weekly frequency (e.g., 3 means 3 times a week)")
    cadd_p.add_argument("--streak-days", default="1,2,3,4,5", help="Comma-sep days (0=Sun, 1=Mon...6=Sat) e.g., '1,2,3,4,5'")
    cadd_p.add_argument("--countdown", help="StopWatch countdown duration (e.g., 30m)")

    cedp_p = cnt_sub.add_parser("edit", help="Edit counter metadata", parents=[output_parent])
    cedp_p.add_argument("id", help="Counter ID")
    cedp_p.add_argument("--title", help="New title")
    cedp_p.add_argument("--icon", help="Material icon name")
    cedp_p.add_argument("--track-streaks", action="store_true", default=None, help="Enable streak tracking")
    cedp_p.add_argument("--no-track-streaks", action="store_false", dest="track_streaks", help="Disable streak tracking")
    cedp_p.add_argument("--streak-min", type=int, help="Minimum value required for a streak")
    cedp_p.add_argument("--streak-mode", choices=["default", "weekly-frequency"], help="Streak calculation mode")
    cedp_p.add_argument("--streak-freq", type=int, help="Weekly frequency (e.g., 3 times a week)")
    cedp_p.add_argument("--streak-days", help="Comma-sep days (0=Sun, 1=Mon...6=Sat) e.g., '1,2,3,4,5'")
    cedp_p.add_argument("--countdown", help="StopWatch countdown duration (e.g., 30m)")

    clog_p = cnt_sub.add_parser("log", help="Set value directly", parents=[output_parent])
    clog_p.add_argument("id", help="Counter ID")
    clog_p.add_argument("value", help="Value (integer, or e.g. 1h for StopWatch)")
    clog_p.add_argument("--date", help="Date YYYY-MM-DD")

    ctog_p = cnt_sub.add_parser("toggle", help="Increment or Toggle running state", parents=[output_parent])
    ctog_p.add_argument("id", help="Counter ID")

    cdel_p = cnt_sub.add_parser("delete", help="Delete counter", parents=[output_parent])
    cdel_p.add_argument("id", help="Counter ID")
    cdel_p.add_argument("--yes", action="store_true", help="Confirm delete without prompting")

    args = parser.parse_args()
    if not hasattr(args, "json"):
        args.json = False
    if not hasattr(args, "ndjson"):
        args.ndjson = False
    if not hasattr(args, "full"):
        args.full = False
    global OUTPUT_MODE, USE_COLOR
    OUTPUT_MODE = "json" if args.json else ("ndjson" if args.ndjson else "text")
    USE_COLOR = supports_color()

    # Pre-validation & Dispatch
    read_only_commands = {
        ("status", None),
        ("task", "list"),
        ("task", "view"),
        ("task", "search"),
        ("project", "list"),
        ("project", "view"),
        ("counter", "list"),
        ("counter", "search"),
    }

    dispatch = {
        ("status", None): cmd_status,
        ("task", "list"): cmd_task_list,
        ("task", "view"): cmd_task_view,
        ("task", "search"): cmd_task_search,
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
        ("project", "view"): cmd_project_view,
        ("counter", "list"): cmd_counter_list,
        ("counter", "search"): cmd_counter_search,
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
