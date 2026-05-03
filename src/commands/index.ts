import { Command } from "commander";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  logout,
  DROPBOX_SYNC_FILE_PATH,
} from "../lib/dropbox.js";
import { setEncryptKey, clearEncryptKey, getDropboxConfig, setDropboxConfig } from "../lib/config.js";
import { getBackend } from "../index.js";
import { Backend, READ_ONLY_ERROR, Task, TaskFilters } from "../lib/backend.js";
import { SyncData } from "../lib/sync-processor.js";
import {
  getTasks,
  getTaskIds,
  getProjects,
  getProjectName,
  getTodayTaskIds,
  matchesQuery,
  fmtDuration,
  fmtTime,
  todayStr,
  serializeTask,
  getCounters,
  getCounterIds,
  getTags,
  getTagIds,
  getNotes,
  getNoteIds,
  serializeCounter,
  serializeTag,
  serializeNote,
} from "../lib/data-helpers.js";
import { printMany, printOne, hasFormatOption, OutputOptions } from "../lib/output.js";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

import * as readline from "readline";

const promptCode = (): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

export const loginCommand = new Command("login")
  .description("Login to Dropbox")
  .action(async () => {
    try {
      const { authUrl, codeVerifier } = await getAuthUrl();
      console.log("\n1. Open this URL in your browser:");
      console.log(cyan(authUrl));
      console.log("\n2. Authorize the app and copy the code from the page");
      console.log("3. Paste the code below:\n");

      const code = await promptCode();

      if (!code) {
        console.error(red("No code provided"));
        process.exit(1);
      }

      console.log(dim("\nExchanging code for tokens..."));
      const tokens = await exchangeCodeForTokens(code, codeVerifier);

      await setDropboxConfig({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      });

      console.log(green("\n✓ Successfully logged in to Dropbox!"));
      process.exit(0);
    } catch (e) {
      console.error(red(`Login failed: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

export const logoutCommand = new Command("logout")
  .description("Logout from Dropbox")
  .action(async () => {
    await logout();
    console.log(green("✓ Logged out from Dropbox"));
    process.exit(0);
  });

export const encryptKeyCommand = new Command("encrypt-key")
  .description("Manage encryption key")
  .argument("[key]", "Encryption password (omit to clear)")
  .option("--clear", "Clear the encryption key")
  .action(async (key: string | undefined, options: { clear?: boolean }) => {
    if (options.clear || !key) {
      await clearEncryptKey();
      console.log(green("✓ Encryption key cleared"));
      process.exit(0);
      return;
    }

    await setEncryptKey(key);
    console.log(green("✓ Encryption key set"));
    process.exit(0);
  });

export const statusCommand = new Command("status")
  .description("Show today's summary")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    try {
      const backend = getBackend();
      
      if (backend.name === "api") {
        const status = await backend.getStatus();
        const tasks = await backend.getTasks({ today: true, includeDone: true });
        
        const today = todayStr();
        let totalMs = 0;
        const perProject: Record<string, number> = {};
        
        for (const task of tasks) {
          const spentOnDay = task.timeSpentOnDay?.[today] || 0;
          if (spentOnDay > 0) {
            totalMs += spentOnDay;
            const pname = await getProjectNameAsync(backend, task.projectId);
            perProject[pname] = (perProject[pname] || 0) + spentOnDay;
          }
        }
        
        if (options.json) {
          console.log(JSON.stringify({
            date: today,
            backend: backend.name,
            currentTask: status.currentTask,
            currentTaskId: status.currentTaskId,
            totalMs,
            total: fmtDuration(totalMs),
            tasks: tasks.map((t) => ({
              id: t.id,
              title: t.title,
              projectId: t.projectId,
              isDone: t.isDone,
              timeSpentToday: t.timeSpentOnDay?.[today] || 0,
            })),
            byProject: Object.entries(perProject)
              .sort((a, b) => b[1] - a[1])
              .map(([project, timeMs]) => ({ project, timeMs, time: fmtDuration(timeMs) })),
          }, null, 2));
          return;
        }
        
        console.log(`\n${bold("📊 Today's Status")} ${dim(`(${today})`)} ${dim(`[${backend.name}]`)}`);
        console.log("─".repeat(50));
        
        if (status.currentTask) {
          console.log(`  ${green("▶ Current Task:")} ${status.currentTask.title}`);
          const spent = status.currentTask.timeSpentOnDay?.[today] || 0;
          if (spent) console.log(`    ${dim(`Time today: ${fmtDuration(spent)}`)}`);
        }
        
        if (tasks.length) {
          console.log(`\n  ${bold("Tasks today:")} ${cyan(String(tasks.length))}`);
        }
        
        console.log();
        console.log(`  ${bold("Total time:")} ${cyan(fmtDuration(totalMs))}`);
        
        if (Object.keys(perProject).length) {
          console.log(`\n  ${bold("By project:")}`);
          Object.entries(perProject)
            .sort((a, b) => b[1] - a[1])
            .forEach(([pname, ms]) => {
              const barLen = Math.max(1, Math.floor(ms / 1800000));
              const bar = "█".repeat(Math.min(barLen, 20));
              console.log(`    ${pname.padEnd(25)} ${cyan(fmtDuration(ms))}  ${dim(bar)}`);
            });
        }
        console.log();
        return;
      }
      
      const data = await backend.getRawData();
      const today = todayStr();
      const taskMap = getTasks(data);
      const taskIds = getTaskIds(data);
      const todayTaskIds = getTodayTaskIds(data);

      const plannedTimed: Record<string, unknown>[] = [];
      const plannedDay: Record<string, unknown>[] = [];
      const unplanned: Record<string, unknown>[] = [];
      let totalMs = 0;
      const perProject: Record<string, number> = {};

      for (const tid of taskIds) {
        const task = taskMap[tid] as Record<string, unknown>;
        if (!task || task.parentId) continue;

        const spentOnDay = (task.timeSpentOnDay as Record<string, number>)?.[today] || 0;
        if (spentOnDay > 0) {
          totalMs += spentOnDay;
          const pname = getProjectName(data, task.projectId as string);
          perProject[pname] = (perProject[pname] || 0) + spentOnDay;
        }

        if (task.dueWithTime && new Date(task.dueWithTime as number).toISOString().slice(0, 10) === today) {
          plannedTimed.push(task);
        } else if (task.dueDay === today) {
          plannedDay.push(task);
        } else if (todayTaskIds.has(tid)) {
          unplanned.push(task);
        }
      }

      plannedTimed.sort((a, b) => ((a.dueWithTime as number) || 0) - ((b.dueWithTime as number) || 0));

      if (options.json) {
        console.log(JSON.stringify({
          date: today,
          backend: backend.name,
          totalMs,
          total: fmtDuration(totalMs),
          tasks: {
            plannedTimed: plannedTimed.map((t) => serializeTask(data, t)),
            plannedDay: plannedDay.map((t) => serializeTask(data, t)),
            unplanned: unplanned.map((t) => serializeTask(data, t)),
          },
          byProject: Object.entries(perProject)
            .sort((a, b) => b[1] - a[1])
            .map(([project, timeMs]) => ({ project, timeMs, time: fmtDuration(timeMs) })),
        }, null, 2));
        return;
      }

      console.log(`\n${bold("📊 Today's Status")} ${dim(`(${today})`)} ${dim(`[${backend.name}]`)}`);
      console.log("─".repeat(50));

      const printTask = (task: Record<string, unknown>, showTime = false) => {
        const doneMark = task.isDone ? green("✓") : yellow("○");
        const timeIcon = showTime && task.dueWithTime ? yellow(`⏰ ${fmtTime(task.dueWithTime as number)} `) : "";
        const spentOnDay = (task.timeSpentOnDay as Record<string, number>)?.[today] || 0;
        const est = task.timeEstimate as number | undefined;
        const timeInfo = spentOnDay || est ? dim(` [${fmtDuration(spentOnDay)}${est ? `/${fmtDuration(est)}` : ""}]`) : "";
        const pname = getProjectName(data, task.projectId as string);
        console.log(`  ${timeIcon}${doneMark} ${task.title}${timeInfo} ${dim(`[${pname}]`)}`);
      };

      if (plannedTimed.length) {
        console.log(`  ${bold("📅 Planned Tasks (Timed):")}`);
        plannedTimed.forEach((t) => printTask(t, true));
        console.log();
      }

      if (plannedDay.length) {
        console.log(`  ${bold("📅 Planned Tasks (All-day):")}`);
        plannedDay.forEach((t) => printTask(t));
        console.log();
      }

      const title = plannedTimed.length || plannedDay.length ? "🌤 Other Tasks Today:" : "🌤 Today's Tasks:";
      console.log(`  ${bold(title)}`);
      if (!unplanned.length && !plannedTimed.length && !plannedDay.length) {
        console.log(`    ${dim("No tasks tagged for today")}`);
      }
      unplanned.forEach((t) => printTask(t));

      console.log();
      console.log(`  ${bold("Total time:")} ${cyan(fmtDuration(totalMs))}`);

      if (Object.keys(perProject).length) {
        console.log(`\n  ${bold("By project:")}`);
        Object.entries(perProject)
          .sort((a, b) => b[1] - a[1])
          .forEach(([pname, ms]) => {
            const barLen = Math.max(1, Math.floor(ms / 1800000));
            const bar = "█".repeat(Math.min(barLen, 20));
            console.log(`    ${pname.padEnd(25)} ${cyan(fmtDuration(ms))}  ${dim(bar)}`);
          });
      }
console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

async function getProjectNameAsync(backend: Backend, projectId: string): Promise<string> {
  if (backend.name === "api") {
    const projects = await backend.getProjects();
    const project = projects.find((p) => p.id === projectId);
    return project?.title || projectId || "—";
  }
  
  const data = await backend.getRawData();
  return getProjectName(data, projectId);
}

export const taskCommand = new Command("task")
  .description("Task commands");

taskCommand
  .command("today")
  .description("List today's tasks in TODAY tag order")
  .option("-d, --done", "Show done tasks")
  .option("--json", "Output as JSON")
  .option("--ndjson", "Output as newline-delimited JSON")
  .option("--full", "Output full entity data")
  .action(async (options: { done?: boolean; json?: boolean; ndjson?: boolean; full?: boolean }) => {
    try {
      const backend = getBackend();
      
      const tasks = await backend.getTasks({ today: true, includeDone: options.done });
      
      const outputOpts: OutputOptions = { json: options.json, ndjson: options.ndjson, full: options.full };
      
      if (hasFormatOption(outputOpts)) {
        printMany(tasks, outputOpts, (t, full) => full ? t : {
          id: t.id,
          title: t.title,
          projectId: t.projectId,
          isDone: t.isDone,
          timeEstimate: t.timeEstimate,
          timeSpent: t.timeSpent,
          dueDay: t.dueDay,
          dueWithTime: t.dueWithTime,
          tagIds: t.tagIds,
        });
        return;
      }
      
      if (!tasks.length) {
        console.log(dim("No tasks for today."));
        return;
      }
      
      console.log();
      const today = todayStr();
      
      for (const task of tasks) {
        const doneIcon = task.isDone ? green("✓") : yellow("○");
        const pname = await getProjectNameAsync(backend, task.projectId);
        
        const spentOnDay = task.timeSpentOnDay?.[today] || 0;
        const totalSpent = task.timeSpent || 0;
        const est = task.timeEstimate;
        
        const timeParts: string[] = [];
        if (spentOnDay) timeParts.push(green(`today:${fmtDuration(spentOnDay)}`));
        if (totalSpent) timeParts.push(dim(`total:${fmtDuration(totalSpent)}`));
        if (est) timeParts.push(cyan(`est:${fmtDuration(est)}`));
        const timeStr = timeParts.length ? "  " + timeParts.join("  ") : "";
        
        const subStr = task.subTaskIds?.length ? dim(` (+${task.subTaskIds.length} subtasks)`) : "";
        
        const dueInfo = task.dueWithTime 
          ? dim(` [due: ${fmtTime(task.dueWithTime)}]`)
          : task.dueDay 
            ? dim(` [due: ${task.dueDay}]`)
            : "";
        
        console.log(`  ${doneIcon} ${bold(task.id)} ${task.title}${subStr}${timeStr}${dueInfo} ${dim(`[${pname}]`)}`);
      }
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

taskCommand
  .command("list")
  .description("List tasks")
  .option("-p, --project <project>", "Filter by project ID")
  .option("-t, --tag <tag>", "Filter by tag ID")
  .option("-d, --done", "Show done tasks")
  .option("--today", "Only today tasks (tagged or due today)")
  .option("--past-due", "Only past due tasks")
  .option("--include-subtasks", "Include subtasks in results")
  .option("--archived", "Show archived tasks")
  .option("--json", "Output as JSON")
  .option("--ndjson", "Output as newline-delimited JSON")
  .option("--full", "Output full entity data")
  .action(async (options: { project?: string; tag?: string; done?: boolean; today?: boolean; pastDue?: boolean; includeSubtasks?: boolean; archived?: boolean; json?: boolean; ndjson?: boolean; full?: boolean }) => {
    try {
      const backend = getBackend();
      
      const filters: TaskFilters = {
        projectId: options.project,
        tagId: options.tag,
        includeDone: options.done,
        today: options.today,
        pastDue: options.pastDue,
        includeSubtasks: options.includeSubtasks,
        source: options.archived ? "archived" : "active",
      };
      
      const tasks = await backend.getTasks(filters);
      
      const outputOpts: OutputOptions = { json: options.json, ndjson: options.ndjson, full: options.full };
      
      if (hasFormatOption(outputOpts)) {
        printMany(tasks, outputOpts, (t, full) => full ? t : {
          id: t.id,
          title: t.title,
          projectId: t.projectId,
          isDone: t.isDone,
          timeEstimate: t.timeEstimate,
          timeSpent: t.timeSpent,
          dueDay: t.dueDay,
          dueWithTime: t.dueWithTime,
          tagIds: t.tagIds,
        });
        return;
      }
      
      if (!tasks.length) {
        console.log(dim("No tasks found."));
        return;
      }
      
      console.log();
      const today = todayStr();
      
      for (const task of tasks) {
        const isPastDue = !task.isDone && 
          ((task.dueDay && task.dueDay < today) || 
           (task.dueWithTime && new Date(task.dueWithTime).toISOString().slice(0, 10) < today));
        
        const todayIcon = options.today ? "" : isPastDue ? red("⚠ ") : "   ";
        const doneIcon = task.isDone ? green("✓") : yellow("○");
        const pname = await getProjectNameAsync(backend, task.projectId);
        
        const spentOnDay = task.timeSpentOnDay?.[today] || 0;
        const totalSpent = task.timeSpent || 0;
        const est = task.timeEstimate;
        
        const timeParts: string[] = [];
        if (spentOnDay) timeParts.push(green(`today:${fmtDuration(spentOnDay)}`));
        if (totalSpent) timeParts.push(dim(`total:${fmtDuration(totalSpent)}`));
        if (est) timeParts.push(cyan(`est:${fmtDuration(est)}`));
        const timeStr = timeParts.length ? "  " + timeParts.join("  ") : "";
        
        const subStr = task.subTaskIds?.length ? dim(` (+${task.subTaskIds.length} subtasks)`) : "";
        
        const parentInfo = task.parentId ? dim(` [sub of: ${task.parentId}]`) : "";
        
        const dueInfo = task.dueWithTime 
          ? dim(` [due: ${fmtTime(task.dueWithTime)}]`)
          : task.dueDay 
            ? dim(` [due: ${task.dueDay}]`)
            : "";
        
        console.log(`  ${todayIcon}${doneIcon} ${bold(task.id)} ${task.title}${subStr}${parentInfo}${timeStr}${dueInfo} ${dim(`[${pname}]`)}`);
      }
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

taskCommand
  .command("search <query>")
  .description("Search tasks by title")
  .option("--json", "Output as JSON")
  .option("--ndjson", "Output as newline-delimited JSON")
  .option("--full", "Output full entity data")
  .action(async (query: string, options: { json?: boolean; ndjson?: boolean; full?: boolean }) => {
    try {
      const backend = getBackend();
      const tasks = await backend.getTasks({ query });
      
      const outputOpts: OutputOptions = { json: options.json, ndjson: options.ndjson, full: options.full };
      
      if (hasFormatOption(outputOpts)) {
        printMany(tasks, outputOpts, (t, full) => full ? t : {
          id: t.id,
          title: t.title,
          projectId: t.projectId,
          isDone: t.isDone,
        });
        return;
      }
      
      if (!tasks.length) {
        console.log(dim("No matching tasks found."));
        return;
      }
      
      console.log();
      for (const task of tasks) {
        const pname = await getProjectNameAsync(backend, task.projectId);
        console.log(`${bold(task.id)}  ${task.title}  ${dim(`[${pname}]`)}`);
      }
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

taskCommand
  .command("show <id>")
  .description("Show task details")
  .option("--json", "Output as JSON")
  .option("--full", "Output full entity data")
  .action(async (id: string, options: { json?: boolean; full?: boolean }) => {
    try {
      const backend = getBackend();
      const task = await backend.getTask(id);
      
      if (!task) {
        console.error(red(`Task not found: ${id}`));
        process.exit(1);
      }
      
      const outputOpts: OutputOptions = { json: options.json, full: options.full };
      
      if (hasFormatOption(outputOpts)) {
        printOne(task, outputOpts, (t) => t);
        return;
      }
      
      const pname = await getProjectNameAsync(backend, task.projectId);
      const today = todayStr();
      const spentToday = task.timeSpentOnDay?.[today] || 0;
      
      console.log();
      console.log(`  ${bold(task.title)}`);
      console.log(`  id: ${task.id}`);
      console.log(`  project: ${pname}`);
      console.log(`  done: ${task.isDone ? green("yes") : "no"}`);
      if (task.timeEstimate) console.log(`  estimate: ${cyan(fmtDuration(task.timeEstimate))}`);
      if (task.timeSpent) console.log(`  spent: ${dim(fmtDuration(task.timeSpent))}`);
      if (spentToday) console.log(`  today: ${green(fmtDuration(spentToday))}`);
      if (task.dueDay) console.log(`  dueDay: ${task.dueDay}`);
      if (task.dueWithTime) console.log(`  dueWithTime: ${fmtTime(task.dueWithTime)}`);
      if (task.notes) console.log(`  notes: ${dim(task.notes.slice(0, 100))}${task.notes.length > 100 ? "..." : ""}`);
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

taskCommand
  .command("create <title>")
  .description("Create a new task (requires --api mode)")
  .option("-p, --project <project>", "Project ID")
  .option("-n, --notes <notes>", "Task notes")
  .option("-e, --estimate <estimate>", "Time estimate (e.g., '2h', '30m')")
  .option("--tag <tag>", "Tag ID (comma-separated for multiple)")
  .option("--due <YYYY-MM-DD>", "Due date (e.g., '2026-05-03')")
  .option("--due-with <ISO-timestamp>", "Due date with time (e.g., '2026-05-03T14:00:00')")
  .option("--parent <parent-id>", "Create as subtask of given parent task")
  .action(async (title: string, options: { project?: string; notes?: string; estimate?: string; tag?: string; due?: string; dueWith?: string; parent?: string }) => {
    try {
      const backend = getBackend();
      
      if (backend.isReadOnly) {
        console.error(red(READ_ONLY_ERROR));
        process.exit(1);
      }
      
      let timeEstimate: number | undefined;
      if (options.estimate) {
        timeEstimate = parseDuration(options.estimate);
      }
      
      const tagIds = options.tag?.split(",").map((t) => t.trim());
      
      const task = await backend.createTask(title, {
        projectId: options.project,
        notes: options.notes,
        timeEstimate,
        tagIds,
        dueDay: options.due,
        dueWithTime: options.dueWith ? new Date(options.dueWith).getTime() : undefined,
        parentId: options.parent,
      });
      
      console.log(green(`✓ Created task ${bold(task.id)}`));
      console.log(`  ${task.title}`);
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

taskCommand
  .command("update <id>")
  .description("Update task fields (requires --api mode)")
  .option("-t, --title <title>", "New title")
  .option("-n, --notes <notes>", "New notes")
  .option("-p, --project <project>", "New project ID")
  .option("-e, --estimate <estimate>", "Time estimate (e.g., '2h', '30m')")
  .option("--tag <tag>", "Tag ID(s) - comma-separated for multiple (replaces existing)")
  .option("--add-tag <tag>", "Add tag ID(s) - comma-separated (keeps existing)")
  .option("--remove-tag <tag>", "Remove tag ID(s) - comma-separated")
  .option("--done", "Mark as done")
  .option("--undone", "Mark as not done")
  .option("--due <YYYY-MM-DD>", "Due date (e.g., '2026-05-03')")
  .option("--due-with <ISO-timestamp>", "Due date with time (e.g., '2026-05-03T14:00:00')")
  .option("--clear-due", "Clear due date fields")
  .option("--parent <parent-id>", "Set parent task (convert to subtask)")
  .option("--clear-parent", "Remove parent (convert to main task)")
  .action(async (id: string, options: { title?: string; notes?: string; project?: string; estimate?: string; tag?: string; addTag?: string; removeTag?: string; done?: boolean; undone?: boolean; due?: string; dueWith?: string; clearDue?: boolean; parent?: string; clearParent?: boolean }) => {
    try {
      const backend = getBackend();
      
      if (backend.isReadOnly) {
        console.error(red(READ_ONLY_ERROR));
        process.exit(1);
      }
      
      const updates: Record<string, unknown> = {};
      
      if (options.title) updates.title = options.title;
      if (options.notes) updates.notes = options.notes;
      if (options.project) updates.projectId = options.project;
      if (options.estimate) updates.timeEstimate = parseDuration(options.estimate);
      if (options.done) updates.isDone = true;
      if (options.undone) updates.isDone = false;
      
      if (options.due) updates.dueDay = options.due;
      if (options.dueWith) updates.dueWithTime = new Date(options.dueWith).getTime();
      if (options.clearDue) {
        updates.dueDay = null as unknown as string;
        updates.dueWithTime = null as unknown as number;
      }
      
      if (options.parent) updates.parentId = options.parent;
      if (options.clearParent) updates.parentId = null as unknown as string;
      
      if (options.tag) {
        updates.tagIds = options.tag.split(",").map((t) => t.trim());
      }
      
      if (options.addTag || options.removeTag) {
        const current = await backend.getTask(id);
        if (!current) {
          console.error(red(`Task not found: ${id}`));
          process.exit(1);
        }
        
        let tagIds = [...(current.tagIds || [])];
        
        if (options.addTag) {
          const toAdd = options.addTag.split(",").map((t) => t.trim());
          for (const t of toAdd) {
            if (!tagIds.includes(t)) tagIds.push(t);
          }
        }
        
        if (options.removeTag) {
          const toRemove = options.removeTag.split(",").map((t) => t.trim());
          tagIds = tagIds.filter((t) => !toRemove.includes(t));
        }
        
        updates.tagIds = tagIds;
      }
      
      if (Object.keys(updates).length === 0) {
        console.error(red("No updates specified"));
        process.exit(1);
      }
      
      const task = await backend.updateTask(id, updates);
      console.log(green(`✓ Updated task ${bold(task.id)}`));
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

taskCommand
  .command("delete <id>")
  .description("Delete a task (requires --api mode)")
  .action(async (id: string) => {
    try {
      const backend = getBackend();
      
      if (backend.isReadOnly) {
        console.error(red(READ_ONLY_ERROR));
        process.exit(1);
      }
      
      await backend.deleteTask(id);
      console.log(green(`✓ Deleted task ${bold(id)}`));
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

taskCommand
  .command("start <id>")
  .description("Start task (set as current) (requires --api mode)")
  .action(async (id: string) => {
    try {
      const backend = getBackend();
      
      if (backend.isReadOnly) {
        console.error(red(READ_ONLY_ERROR));
        process.exit(1);
      }
      
      await backend.startTask(id);
      console.log(green(`✓ Started task ${bold(id)}`));
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

taskCommand
  .command("stop")
  .description("Stop current task (requires --api mode)")
  .action(async () => {
    try {
      const backend = getBackend();
      
      if (backend.isReadOnly) {
        console.error(red(READ_ONLY_ERROR));
        process.exit(1);
      }
      
      await backend.stopTask();
      console.log(green(`✓ Stopped current task`));
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

taskCommand
  .command("archive <id>")
  .description("Archive a task (requires --api mode)")
  .action(async (id: string) => {
    try {
      const backend = getBackend();
      
      if (backend.isReadOnly) {
        console.error(red(READ_ONLY_ERROR));
        process.exit(1);
      }
      
      await backend.archiveTask(id);
      console.log(green(`✓ Archived task ${bold(id)}`));
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

taskCommand
  .command("restore <id>")
  .description("Restore archived task (requires --api mode)")
  .action(async (id: string) => {
    try {
      const backend = getBackend();
      
      if (backend.isReadOnly) {
        console.error(red(READ_ONLY_ERROR));
        process.exit(1);
      }
      
      const task = await backend.restoreTask(id);
      console.log(green(`✓ Restored task ${bold(task.id)}`));
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

function parseDuration(input: string): number {
  const match = input.match(/^(\d+)(h|m)$/i);
  if (!match) {
    throw new Error(`Invalid duration format: ${input}. Use format like '2h' or '30m'`);
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  
  if (unit === "h") return value * 3600000;
  if (unit === "m") return value * 60000;
  
  return 0;
}

export const projectCommand = new Command("project")
  .description("Project commands");

projectCommand
  .command("list")
  .description("List projects")
  .option("-q, --query <query>", "Search by title")
  .option("--json", "Output as JSON")
  .option("--ndjson", "Output as newline-delimited JSON")
  .option("--full", "Output full entity data")
  .action(async (options: { query?: string; json?: boolean; ndjson?: boolean; full?: boolean }) => {
    try {
      const backend = getBackend();
      const projects = await backend.getProjects(options.query);
      
      const outputOpts: OutputOptions = { json: options.json, ndjson: options.ndjson, full: options.full };
      
      if (hasFormatOption(outputOpts)) {
        printMany(projects, outputOpts, (p, full) => full ? p : {
          id: p.id,
          title: p.title,
          taskCount: p.taskCount,
        });
        return;
      }
      
      console.log(`\n${bold("Projects:")}`);
      for (const proj of projects) {
        console.log(`  - ${bold(proj.title)} ${dim(`(${proj.taskCount || 0} tasks)`)} ${dim(`[${proj.id}]`)}`);
      }
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

export const counterCommand = new Command("counter")
  .description("Counter commands");

counterCommand
  .command("list")
  .description("List counters")
  .option("--json", "Output as JSON")
  .option("--ndjson", "Output as newline-delimited JSON")
  .option("--full", "Output full entity data")
  .action(async (options: { json?: boolean; ndjson?: boolean; full?: boolean }) => {
    try {
      const backend = getBackend();
      
      if (backend.name === "api") {
        console.log(dim("Counters not available via API mode"));
        return;
      }
      
      const data = await backend.getRawData();
      const counters = getCounters(data) as Record<string, Record<string, unknown>>;
      const counterIds = getCounterIds(data);
      const today = todayStr();

      const rows: Record<string, unknown>[] = [];
      for (const cid of counterIds) {
        const counter = counters[cid];
        if (counter) rows.push(counter);
      }

      const outputOpts: OutputOptions = { json: options.json, ndjson: options.ndjson, full: options.full };
      
      if (hasFormatOption(outputOpts)) {
        printMany(rows, outputOpts, serializeCounter);
        return;
      }

      if (!rows.length) {
        console.log(dim("No counters found."));
        return;
      }

      console.log();
      for (const counter of rows) {
        const countOnDay = counter.countOnDay as Record<string, number> | undefined;
        const todayValue = countOnDay?.[today] || 0;
        const isOn = counter.isOn as boolean;
        const statusIcon = isOn ? green("🟢") : "⚪";
        console.log(`  🔢 ${counter.title} ${dim(`(${counter.id})`)} ${statusIcon} today=${cyan(String(todayValue))}`);
      }
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

counterCommand
  .command("show <id>")
  .description("Show counter details")
  .option("--json", "Output as JSON")
  .option("--full", "Output full entity data")
  .action(async (id: string, options: { json?: boolean; full?: boolean }) => {
    try {
      const backend = getBackend();
      
      if (backend.name === "api") {
        console.log(dim("Counters not available via API mode"));
        return;
      }
      
      const data = await backend.getRawData();
      const counters = getCounters(data) as Record<string, Record<string, unknown>>;
      const counter = counters[id];

      if (!counter) {
        console.error(red(`Counter not found: ${id}`));
        process.exit(1);
      }

      const outputOpts: OutputOptions = { json: options.json, full: options.full };
      
      if (hasFormatOption(outputOpts)) {
        printOne(counter, outputOpts, serializeCounter);
        return;
      }

      const today = todayStr();
      const countOnDay = counter.countOnDay as Record<string, number> | undefined;
      const todayValue = countOnDay?.[today] || 0;
      const isOn = counter.isOn as boolean;

      console.log();
      console.log(`  🔢 ${bold(counter.title as string)}`);
      console.log(`  id: ${counter.id}`);
      console.log(`  type: ${counter.type || "CLICK"}`);
      console.log(`  isOn: ${isOn ? green("yes") : "no"}`);
      console.log(`  today: ${cyan(String(todayValue))}`);
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

export const tagCommand = new Command("tag")
  .description("Tag commands");

tagCommand
  .command("list")
  .description("List tags")
  .option("-q, --query <query>", "Search by title")
  .option("--json", "Output as JSON")
  .option("--ndjson", "Output as newline-delimited JSON")
  .option("--full", "Output full entity data")
  .action(async (options: { query?: string; json?: boolean; ndjson?: boolean; full?: boolean }) => {
    try {
      const backend = getBackend();
      const tags = await backend.getTags(options.query);
      
      const outputOpts: OutputOptions = { json: options.json, ndjson: options.ndjson, full: options.full };
      
      if (hasFormatOption(outputOpts)) {
        printMany(tags, outputOpts, (t, full) => full ? t : {
          id: t.id,
          title: t.title,
          taskCount: t.taskCount,
        });
        return;
      }
      
      if (!tags.length) {
        console.log(dim("No tags found."));
        return;
      }

      console.log();
      for (const tag of tags) {
        console.log(`  🏷️ ${tag.title} ${dim(`(${tag.id})`)} • ${cyan(`${tag.taskCount || 0} tasks`)}`);
      }
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

tagCommand
  .command("show <id>")
  .description("Show tag details")
  .option("--json", "Output as JSON")
  .option("--full", "Output full entity data")
  .action(async (id: string, options: { json?: boolean; full?: boolean }) => {
    try {
      const backend = getBackend();
      const tags = await backend.getTags();
      const tag = tags.find((t) => t.id === id);

      if (!tag) {
        console.error(red(`Tag not found: ${id}`));
        process.exit(1);
      }

      const outputOpts: OutputOptions = { json: options.json, full: options.full };
      
      if (hasFormatOption(outputOpts)) {
        printOne(tag, outputOpts, (t) => t);
        return;
      }

      console.log();
      console.log(`  🏷️ ${bold(tag.title)}`);
      console.log(`  id: ${tag.id}`);
      console.log(`  tasks: ${cyan(String(tag.taskCount || 0))}`);
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

export const noteCommand = new Command("note")
  .description("Note commands");

noteCommand
  .command("list")
  .description("List notes")
  .option("--json", "Output as JSON")
  .option("--ndjson", "Output as newline-delimited JSON")
  .option("--full", "Output full entity data")
  .action(async (options: { json?: boolean; ndjson?: boolean; full?: boolean }) => {
    try {
      const backend = getBackend();
      
      if (backend.name === "api") {
        console.log(dim("Notes not available via API mode"));
        return;
      }
      
      const data = await backend.getRawData();
      const notes = getNotes(data) as Record<string, Record<string, unknown>>;
      const noteIds = getNoteIds(data);

      const rows: Record<string, unknown>[] = [];
      for (const nid of noteIds) {
        const note = notes[nid];
        if (note) rows.push(note);
      }

      const outputOpts: OutputOptions = { json: options.json, ndjson: options.ndjson, full: options.full };
      
      if (hasFormatOption(outputOpts)) {
        printMany(rows, outputOpts, serializeNote);
        return;
      }

      if (!rows.length) {
        console.log(dim("No notes found."));
        return;
      }

      console.log();
      for (const note of rows) {
        const content = note.content as string | undefined;
        const preview = content?.slice(0, 80) || "";
        console.log(`  🗒️ ${note.id} • ${dim(preview)}...`);
      }
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

noteCommand
  .command("show <id>")
  .description("Show note details")
  .option("--json", "Output as JSON")
  .option("--full", "Output full entity data")
  .action(async (id: string, options: { json?: boolean; full?: boolean }) => {
    try {
      const backend = getBackend();
      
      if (backend.name === "api") {
        console.log(dim("Notes not available via API mode"));
        return;
      }
      
      const data = await backend.getRawData();
      const notes = getNotes(data) as Record<string, Record<string, unknown>>;
      const note = notes[id];

      if (!note) {
        console.error(red(`Note not found: ${id}`));
        process.exit(1);
      }

      const outputOpts: OutputOptions = { json: options.json, full: options.full };
      
      if (hasFormatOption(outputOpts)) {
        printOne(note, outputOpts, serializeNote);
        return;
      }

      const content = note.content as string | undefined;
      const preview = content?.slice(0, 80) || "";
      const pinnedToday = note.pinnedToday as boolean;

      console.log();
      console.log(`  🗒️ ${bold(note.id as string)}`);
      console.log(`  project: ${note.projectId || dim("none")}`);
      console.log(`  pinnedToday: ${pinnedToday ? green("yes") : "no"}`);
      console.log(`  preview: ${dim(preview)}...`);
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

export const stateCommand = new Command("state")
  .description("State commands");

stateCommand
  .command("summary")
  .description("Show state summary")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    try {
      const backend = getBackend();
      
      if (backend.name === "api") {
        const status = await backend.getStatus();
        const projects = await backend.getProjects();
        const tags = await backend.getTags();
        
        const summary = {
          backend: "api",
          tasks: status.taskCount,
          projects: projects.length,
          tags: tags.length,
        };
        
        if (options.json) {
          console.log(JSON.stringify(summary, null, 2));
          return;
        }
        
        console.log();
        console.log(bold("📊 State Summary (API)"));
        console.log(`  tasks: ${cyan(String(summary.tasks))}`);
        console.log(`  projects: ${cyan(String(summary.projects))}`);
        console.log(`  tags: ${cyan(String(summary.tags))}`);
        console.log();
        return;
      }
      
      const data = await backend.getRawData();

      const taskCount = getTaskIds(data).length;
      const projectCount = Object.keys(getProjects(data)).length;
      const counterCount = getCounterIds(data).length;
      const tagCount = getTagIds(data).length;
      const noteCount = getNoteIds(data).length;
      const plannerDays = data.state?.planner?.days ? Object.keys(data.state.planner.days).length : 0;

      const summary = {
        backend: "dropbox",
        tasks: taskCount,
        projects: projectCount,
        counters: counterCount,
        tags: tagCount,
        notes: noteCount,
        plannerDays,
      };

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }

      console.log();
      console.log(bold("📊 State Summary (Dropbox)"));
      console.log(`  tasks: ${cyan(String(taskCount))}`);
      console.log(`  projects: ${cyan(String(projectCount))}`);
      console.log(`  counters: ${cyan(String(counterCount))}`);
      console.log(`  tags: ${cyan(String(tagCount))}`);
      console.log(`  notes: ${cyan(String(noteCount))}`);
      console.log(`  plannerDays: ${cyan(String(plannerDays))}`);
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });