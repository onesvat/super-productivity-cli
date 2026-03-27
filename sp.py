#!/usr/bin/env python3
import json
import sys
import argparse
import os
import re
import subprocess
import base64
import gzip
from datetime import date, datetime, timedelta

VERSION = "0.2.0"

if os.environ.get("SP_CLI_DEV_MODE") == "1" or os.path.exists(
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "data", "sync-data.extracted.json"
    )
):
    CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
else:
    CONFIG_DIR = os.environ.get(
        "SP_CLI_CONFIG_DIR", os.path.expanduser("~/.config/super-productivity-cli")
    )

DATA_FILE = os.path.join(CONFIG_DIR, "data", "sync-data.extracted.json")
RCLONE_TARGET = "dropbox:Apps/super_productivity/sync-data.json"
MAGIC_PREFIX = b"pf_C2__"
TODAY_TAG_ID = "TODAY"
OUTPUT_MODE = "text"


def supports_color():
    return (
        sys.stdout.isatty()
        and os.environ.get("TERM") != "dumb"
        and OUTPUT_MODE == "text"
    )


USE_COLOR = supports_color()


def _c(code):
    return f"\033[{code}m" if USE_COLOR else ""


RESET = _c(0)
BOLD = _c(1)
DIM = _c(2)
GREEN = _c(32)
YELLOW = _c(33)
BLUE = _c(34)
CYAN = _c(36)
RED = _c(31)
GRAY = _c(90)


def bold(s):
    return f"{BOLD}{s}{RESET}"


def green(s):
    return f"{GREEN}{s}{RESET}"


def yellow(s):
    return f"{YELLOW}{s}{RESET}"


def blue(s):
    return f"{BLUE}{s}{RESET}"


def cyan(s):
    return f"{CYAN}{s}{RESET}"


def red(s):
    return f"{RED}{s}{RESET}"


def gray(s):
    return f"{GRAY}{s}{RESET}"


def dim(s):
    return f"{DIM}{s}{RESET}"


def fmt_duration(ms: int) -> str:
    if ms <= 0:
        return "0m"
    total_minutes = ms // 60_000
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if hours and minutes:
        return f"{hours}h {minutes}m"
    elif hours:
        return f"{hours}h"
    else:
        return f"{minutes}m"


def today_str() -> str:
    return date.today().isoformat()


def fmt_time(ms_utc: int) -> str:
    if not ms_utc:
        return ""
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


def sync_download():
    if not is_machine_mode():
        print(dim("↓ Downloading from Dropbox..."))
    try:
        proc = subprocess.run(
            ["rclone", "cat", RCLONE_TARGET],
            capture_output=True,
            check=True,
        )
        data = proc.stdout
        if data.startswith(MAGIC_PREFIX):
            data = data[len(MAGIC_PREFIX) :]
        decoded = base64.b64decode(data)
        decompressed = gzip.decompress(decoded)
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        with open(DATA_FILE, "wb") as f:
            f.write(decompressed)
    except subprocess.CalledProcessError as e:
        if not is_machine_mode():
            print(yellow("⚠ Dropbox sync failed (rclone error). Using local file."))
            print(dim(e.stderr.decode().strip()))
    except Exception as e:
        if not is_machine_mode():
            print(yellow(f"⚠ Error processing Dropbox data: {e}. Using local file."))


def load_data():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def get_tasks(data):
    return data["state"]["task"]["entities"]


def get_task_ids(data):
    return data["state"]["task"]["ids"]


def get_projects(data):
    return data["state"]["project"]["entities"]


def get_tags(data):
    return data["state"]["tag"]["entities"]


def get_counters(data):
    return data.get("state", {}).get("simpleCounter", {}).get("entities", {})


def get_counter_ids(data):
    return data.get("state", {}).get("simpleCounter", {}).get("ids", [])


def get_project_by_name(data, name: str):
    for pid, proj in get_projects(data).items():
        if proj.get("title", "").lower() == name.lower():
            return pid, proj
    if name.lower() == "inbox":
        return "INBOX_PROJECT", get_projects(data).get(
            "INBOX_PROJECT", {"title": "Inbox"}
        )
    return None, None


def resolve_project_id(data, s: str) -> str:
    if not s:
        return "INBOX_PROJECT"
    if s in get_projects(data):
        return s
    pid, _ = get_project_by_name(data, s)
    if pid:
        return pid
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
    if not s:
        return None
    if s in get_tasks(data):
        return s
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
    if not s:
        return None
    if s in get_counters(data):
        return s
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


def _generate_daily_report(data, target_date: str, args):
    tasks = get_tasks(data)
    today_tag = get_tags(data).get(TODAY_TAG_ID, {})
    today_task_ids = set(today_tag.get("taskIds", []))

    total_ms = 0
    per_project = {}

    for tid, task in tasks.items():
        if task.get("parentId"):
            continue
        spent = task.get("timeSpentOnDay", {}).get(target_date, 0)
        if spent > 0:
            total_ms += spent
            pname = project_name(data, task.get("projectId", ""))
            per_project[pname] = per_project.get(pname, 0) + spent

    planned_timed = []
    planned_day = []
    unplanned = []

    for tid, task in tasks.items():
        if task.get("dueDay") == target_date or (
            task.get("dueWithTime")
            and datetime.fromtimestamp(task.get("dueWithTime") / 1000).strftime(
                "%Y-%m-%d"
            )
            == target_date
        ):
            if task.get("dueWithTime"):
                planned_timed.append(task)
            else:
                planned_day.append(task)
        elif tid in today_task_ids and target_date == today_str():
            unplanned.append(task)

    planned_timed.sort(key=lambda t: t.get("dueWithTime", 0))

    return {
        "date": target_date,
        "totalMs": total_ms,
        "total": fmt_duration(total_ms),
        "tasks": {
            "plannedTimed": [
                serialize_task(data, t, full=args.full) for t in planned_timed
            ],
            "plannedDay": [
                serialize_task(data, t, full=args.full) for t in planned_day
            ],
            "unplanned": [serialize_task(data, t, full=args.full) for t in unplanned],
        },
        "byProject": [
            {"project": pname, "timeMs": ms, "time": fmt_duration(ms)}
            for pname, ms in sorted(per_project.items(), key=lambda x: -x[1])
        ],
    }


def cmd_status(args):
    data = load_data()
    today = today_str()
    report = _generate_daily_report(data, today, args)

    if is_machine_mode(args):
        emit(args, report)
        return

    print(f"\n{bold("📊 Today's Status")} {dim(f'({today})')}")
    print("─" * 50)

    planned_timed = report["tasks"]["plannedTimed"]
    planned_day = report["tasks"]["plannedDay"]
    unplanned = report["tasks"]["unplanned"]

    if planned_timed:
        print(f"  {bold('📅 Planned Tasks (Timed):')}")
        for task in planned_timed:
            done_mark = green("✓") if task.get("isDone") else yellow("○")
            spent_today = (
                task.get("timeSpentOnDay", {}).get(today, 0)
                if isinstance(task, dict) and "timeSpentOnDay" in task
                else 0
            )
            est = task.get("estimate", 0)
            due_ms = task.get("dueWithTime")
            time_icon = yellow(f"⏰ {fmt_time(due_ms)} ") if due_ms else ""
            time_info = (
                dim(f" [{fmt_duration(spent_today)}/{fmt_duration(est)}]")
                if (spent_today or est)
                else ""
            )
            print(f"    {time_icon}{done_mark} {task['title']}{time_info}")
        print()

    if planned_day:
        print(f"  {bold('📅 Planned Tasks (All-day):')}")
        for task in planned_day:
            done_mark = green("✓") if task.get("isDone") else yellow("○")
            spent_today = (
                task.get("timeSpentOnDay", {}).get(today, 0)
                if isinstance(task, dict) and "timeSpentOnDay" in task
                else 0
            )
            est = task.get("estimate", 0)
            day_str = task.get("dueDay")
            display_day = "Today" if day_str == today_str() else day_str
            time_icon = yellow(f"📅 {display_day} ")
            time_info = (
                dim(f" [{fmt_duration(spent_today)}/{fmt_duration(est)}]")
                if (spent_today or est)
                else ""
            )
            print(f"    {time_icon}{done_mark} {task['title']}{time_info}")
        print()

    title = (
        "🌤 Other Tasks Today:" if (planned_timed or planned_day) else "🌤 Today's Tasks:"
    )
    print(f"  {bold(title)}")
    if not unplanned and not planned_timed and not planned_day:
        print(f"    {dim('No tasks tagged for today')}")
    for task in unplanned:
        done_mark = green("✓") if task.get("isDone") else yellow("○")
        print(f"    {done_mark} {task['title']}")

    print()
    print(f"  {bold('Total time:')} {cyan(report['total'])}")
    print()

    if report["byProject"]:
        print(f"  {bold('By project:')}")
        for item in report["byProject"]:
            bar_len = max(1, int(item["timeMs"] / 1_800_000))
            bar = "█" * min(bar_len, 20)
            print(f"    {item['project']:<25} {cyan(item['time'])}  {dim(bar)}")
    print()


def cmd_yesterday(args):
    data = load_data()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    report = _generate_daily_report(data, yesterday, args)

    if is_machine_mode(args):
        emit(args, report)
        return

    print(f"\n{bold("📊 Yesterday's Report")} {dim(f'({yesterday})')}")
    print("─" * 50)

    planned_timed = report["tasks"]["plannedTimed"]
    planned_day = report["tasks"]["plannedDay"]

    if planned_timed:
        print(f"  {bold('📅 Planned Tasks (Timed):')}")
        for task in planned_timed:
            done_mark = green("✓") if task.get("isDone") else yellow("○")
            due_ms = task.get("dueWithTime")
            time_icon = yellow(f"⏰ {fmt_time(due_ms)} ") if due_ms else ""
            print(f"    {time_icon}{done_mark} {task['title']}")
        print()

    if planned_day:
        print(f"  {bold('📅 Planned Tasks (All-day):')}")
        for task in planned_day:
            done_mark = green("✓") if task.get("isDone") else yellow("○")
            print(f"    {done_mark} {task['title']}")
        print()

    print(f"  {bold('Total time:')} {cyan(report['total'])}")
    print()

    if report["byProject"]:
        print(f"  {bold('By project:')}")
        for item in report["byProject"]:
            bar_len = max(1, int(item["timeMs"] / 1_800_000))
            bar = "█" * min(bar_len, 20)
            print(f"    {item['project']:<25} {cyan(item['time'])}  {dim(bar)}")
    print()


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

    tmrw_str = (date.today() + timedelta(days=1)).isoformat()

    rows = []
    for tid in get_task_ids(data):
        task = tasks.get(tid)
        if not task:
            continue
        if not args.done and task.get("isDone"):
            continue
        if args.done and not task.get("isDone"):
            continue
        if filter_pid and task.get("projectId") != filter_pid:
            continue
        if args.today and tid not in today_task_ids:
            continue

        is_scheduled = bool(task.get("dueWithTime") or task.get("dueDay"))
        if args.scheduled and not is_scheduled:
            continue

        d_str = task.get("dueDay")
        if not d_str and task.get("dueWithTime"):
            d_str = datetime.fromtimestamp(task.get("dueWithTime") / 1000.0).strftime(
                "%Y-%m-%d"
            )

        if args.tomorrow and d_str != tmrw_str:
            continue
        if args.date and d_str != args.date:
            continue

        if not filter_pid and task.get("parentId"):
            continue
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
        is_done = task.get("isDone")

        time_icon = ""
        if show_time:
            due_ms = task.get("dueWithTime")
            time_icon = yellow(f"⏰ {fmt_time(due_ms)} ") if due_ms else ""
        elif show_day:
            day_str = task.get("dueDay")
            if day_str:
                display_day = "Today" if day_str == today_str() else day_str
                time_icon = yellow(f"📅 {display_day} ")

        done_icon = green("✓") if is_done else yellow("○")
        today_icon = cyan("🌤") + " " if is_today else "   "
        pname = project_name(data, task.get("projectId", ""))

        spent_today = task.get("timeSpentOnDay", {}).get(today, 0)
        total_spent = task.get("timeSpent", 0)
        estimate = task.get("timeEstimate", 0)

        time_parts = []
        if spent_today:
            time_parts.append(green(f"today:{fmt_duration(spent_today)}"))
        if total_spent:
            time_parts.append(dim(f"total:{fmt_duration(total_spent)}"))
        if estimate:
            time_parts.append(blue(f"est:{fmt_duration(estimate)}"))

        time_str = "  " + "  ".join(time_parts) if time_parts else ""
        sub_ids = task.get("subTaskIds", [])
        sub_str = dim(f" (+{len(sub_ids)} subtasks)") if sub_ids else ""

        title = task["title"]
        print(
            f"  {today_icon}{time_icon}{done_icon} {title}{sub_str}{time_str}  {dim(f'[{pname}]')}"
        )

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
    print(
        f"  Today: {'yes' if task.get('id') in set(get_tags(data).get(TODAY_TAG_ID, {}).get('taskIds', [])) else 'no'}"
    )
    print(f"  Estimate: {fmt_duration(task.get('timeEstimate', 0))}")
    print(f"  Time Spent: {fmt_duration(task.get('timeSpent', 0))}")
    if task.get("dueDay"):
        print(f"  Due Day: {task.get('dueDay')}")
    if task.get("dueWithTime"):
        print(f"  Due With Time: {fmt_time(task.get('dueWithTime'))}")


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
    for cid in get_counter_ids(data):
        c = counters.get(cid)
        if not c:
            continue

        title = c["title"]
        ctype = c.get("type")
        val_today = c.get("countOnDay", {}).get(today, 0)

        if ctype == "StopWatch":
            print(
                f"  - {bold(title)} {dim('[StopWatch]')}  {cyan(f'(Today: {fmt_duration(val_today)})')}"
            )
        else:
            print(
                f"  - {bold(title)} {dim('[ClickCounter]')}  {cyan(f'(Today: {val_today})')}"
            )
    print()


def main():
    output_parent = argparse.ArgumentParser(add_help=False)
    out_group = output_parent.add_mutually_exclusive_group()
    out_group.add_argument(
        "--json",
        action="store_true",
        default=argparse.SUPPRESS,
        help="Emit JSON output",
    )
    out_group.add_argument(
        "--ndjson",
        action="store_true",
        default=argparse.SUPPRESS,
        help="Emit NDJSON output",
    )
    output_parent.add_argument(
        "--full",
        action="store_true",
        default=argparse.SUPPRESS,
        help="Include full entity payload in JSON/NDJSON output",
    )

    parser = argparse.ArgumentParser(
        prog="sp",
        description="Super Productivity CLI",
        epilog=(
            "Read-only CLI for Super Productivity. Use --json or --ndjson for parseable output."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        parents=[output_parent],
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    sub = parser.add_subparsers(dest="endpoint")

    sub.add_parser("status", help="Show today's summary", parents=[output_parent])
    sub.add_parser("yesterday", help="Show yesterday's report", parents=[output_parent])

    task_p = sub.add_parser("task", help="Task commands", parents=[output_parent])
    task_sub = task_p.add_subparsers(dest="action")

    tl_p = task_sub.add_parser("list", help="List tasks", parents=[output_parent])
    tl_p.add_argument("--project", "-p", help="Filter by project ID")
    tl_p.add_argument("--done", "-d", action="store_true", help="Show done tasks")
    tl_p.add_argument("--today", "-t", action="store_true", help="Only Today tasks")
    tl_p.add_argument("--tomorrow", action="store_true", help="Only Tomorrow tasks")
    tl_p.add_argument("--date", help="Filter by due date (YYYY-MM-DD)")
    tl_p.add_argument(
        "--scheduled", action="store_true", help="Only scheduled tasks (any date)"
    )

    tv_p = task_sub.add_parser("view", help="View task by ID", parents=[output_parent])
    tv_p.add_argument("id", help="Task ID")

    ts_p = task_sub.add_parser(
        "search",
        help="Search tasks by title (substring or * wildcard)",
        parents=[output_parent],
    )
    ts_p.add_argument("query", help="Query text, supports '*' wildcard")

    proj_p = sub.add_parser("project", help="Project commands", parents=[output_parent])
    proj_sub = proj_p.add_subparsers(dest="action")
    proj_sub.add_parser("list", help="List projects", parents=[output_parent])
    pv_p = proj_sub.add_parser(
        "view", help="View project by ID", parents=[output_parent]
    )
    pv_p.add_argument("id", help="Project ID")

    cnt_p = sub.add_parser("counter", help="Counter commands", parents=[output_parent])
    cnt_sub = cnt_p.add_subparsers(dest="action")
    cnt_sub.add_parser("list", help="List counters", parents=[output_parent])
    csearch_p = cnt_sub.add_parser(
        "search",
        help="Search counters by title (substring or * wildcard)",
        parents=[output_parent],
    )
    csearch_p.add_argument("query", help="Query text, supports '*' wildcard")

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

    dispatch = {
        ("status", None): cmd_status,
        ("yesterday", None): cmd_yesterday,
        ("task", "list"): cmd_task_list,
        ("task", "view"): cmd_task_view,
        ("task", "search"): cmd_task_search,
        ("project", "list"): cmd_project_list,
        ("project", "view"): cmd_project_view,
        ("counter", "list"): cmd_counter_list,
        ("counter", "search"): cmd_counter_search,
    }

    if args.endpoint == "status":
        action_key = ("status", None)
    elif args.endpoint == "yesterday":
        action_key = ("yesterday", None)
    elif getattr(args, "endpoint", None) and getattr(args, "action", None):
        action_key = (args.endpoint, args.action)
    else:
        if getattr(args, "endpoint", None) == "task":
            task_p.print_help()
        elif getattr(args, "endpoint", None) == "project":
            proj_p.print_help()
        elif getattr(args, "endpoint", None) == "counter":
            cnt_p.print_help()
        else:
            parser.print_help()
        sys.exit(1)

    if action_key in dispatch:
        sync_download()
        dispatch[action_key](args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
