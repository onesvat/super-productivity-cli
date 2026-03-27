import { Command } from "commander";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  logout,
  downloadFile,
  DROPBOX_SYNC_FILE_PATH,
} from "../lib/dropbox.js";
import { processSyncFile, SyncData } from "../lib/sync-processor.js";
import { setEncryptKey, clearEncryptKey, getDropboxConfig, setDropboxConfig } from "../lib/config.js";
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
} from "../lib/data-helpers.js";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

let cachedData: SyncData | null = null;

const fetchAndProcessData = async (): Promise<SyncData> => {
  if (cachedData) return cachedData;
  
  console.log(dim("↓ Downloading from Dropbox..."));
  const { data } = await downloadFile(DROPBOX_SYNC_FILE_PATH);
  cachedData = await processSyncFile(data);
  return cachedData;
};

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
      const data = await fetchAndProcessData();
      const today = todayStr();
      const tasks = getTasks(data);
      const taskIds = getTaskIds(data);
      const todayTaskIds = getTodayTaskIds(data);

      const plannedTimed: Record<string, unknown>[] = [];
      const plannedDay: Record<string, unknown>[] = [];
      const unplanned: Record<string, unknown>[] = [];
      let totalMs = 0;
      const perProject: Record<string, number> = {};

      for (const tid of taskIds) {
        const task = tasks[tid] as Record<string, unknown>;
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

      console.log(`\n${bold("📊 Today's Status")} ${dim(`(${today})`)}`);
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

export const taskCommand = new Command("task")
  .description("Task commands");

taskCommand
  .command("list")
  .description("List tasks")
  .option("-p, --project <project>", "Filter by project")
  .option("-d, --done", "Show done tasks")
  .option("-t, --today", "Only today tasks (tagged or due today)")
  .option("--past-due", "Only past due tasks")
  .option("--json", "Output as JSON")
  .action(async (options: { project?: string; done?: boolean; today?: boolean; pastDue?: boolean; json?: boolean }) => {
    try {
      const data = await fetchAndProcessData();
      const tasks = getTasks(data);
      const taskIds = getTaskIds(data);
      const today = todayStr();
      const todayTaskIds = getTodayTaskIds(data);

      const isDueToday = (task: Record<string, unknown>): boolean => {
        if (task.dueDay === today) return true;
        if (task.dueWithTime) {
          const dueDate = new Date(task.dueWithTime as number).toISOString().slice(0, 10);
          if (dueDate === today) return true;
        }
        return false;
      };

      const isPastDue = (task: Record<string, unknown>): boolean => {
        if (task.isDone) return false;
        if (task.dueDay && task.dueDay < today) return true;
        if (task.dueWithTime) {
          const dueDate = new Date(task.dueWithTime as number).toISOString().slice(0, 10);
          if (dueDate < today) return true;
        }
        return false;
      };

      const rows: Record<string, unknown>[] = [];
      for (const tid of taskIds) {
        const task = tasks[tid] as Record<string, unknown>;
        if (!task) continue;

        const isTaggedToday = todayTaskIds.has(tid);
        const isDueTodayTask = isDueToday(task);
        const isPastDueTask = isPastDue(task);
        
        if (options.today) {
          if (!isTaggedToday && !isDueTodayTask) continue;
        } else if (options.pastDue) {
          if (!isPastDueTask) continue;
        } else {
          if (!options.done && task.isDone) continue;
          if (options.done && !task.isDone) continue;
        }
        
        if (task.parentId) continue;

        rows.push(task);
      }

      if (options.json) {
        console.log(JSON.stringify(rows.map((t) => serializeTask(data, t)), null, 2));
        return;
      }

      if (!rows.length) {
        console.log(dim("No tasks found."));
        return;
      }

      const printTask = (task: Record<string, unknown>) => {
        const isToday = todayTaskIds.has(task.id as string);
        const pastDue = isPastDue(task);
        const todayIcon = isToday ? cyan("🌤 ") : pastDue ? red("⚠ ") : "   ";
        const doneIcon = task.isDone ? green("✓") : yellow("○");
        const pname = getProjectName(data, task.projectId as string);
        const spentOnDay = (task.timeSpentOnDay as Record<string, number>)?.[today] || 0;
        const totalSpent = task.timeSpent as number || 0;
        const est = task.timeEstimate as number | undefined;

        const timeParts: string[] = [];
        if (spentOnDay) timeParts.push(green(`today:${fmtDuration(spentOnDay)}`));
        if (totalSpent) timeParts.push(dim(`total:${fmtDuration(totalSpent)}`));
        if (est) timeParts.push(cyan(`est:${fmtDuration(est)}`));
        const timeStr = timeParts.length ? "  " + timeParts.join("  ") : "";

        const subIds = task.subTaskIds as string[] | undefined;
        const subStr = subIds?.length ? dim(` (+${subIds.length} subtasks)`) : "";

        const dueInfo = task.dueWithTime 
          ? dim(` [due: ${fmtTime(task.dueWithTime as number)}]`)
          : task.dueDay 
            ? dim(` [due: ${task.dueDay}]`)
            : "";

        console.log(`  ${todayIcon}${doneIcon} ${task.title}${subStr}${timeStr}${dueInfo} ${dim(`[${pname}]`)}`);
      };

      console.log();
      rows.forEach(printTask);
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
  .action(async (query: string, options: { json?: boolean }) => {
    try {
      const data = await fetchAndProcessData();
      const tasks = getTasks(data);
      const taskIds = getTaskIds(data);

      const rows: Record<string, unknown>[] = [];
      for (const tid of taskIds) {
        const task = tasks[tid] as Record<string, unknown>;
        if (task && matchesQuery(task.title as string, query)) {
          rows.push(task);
        }
      }

      if (options.json) {
        console.log(JSON.stringify(rows.map((t) => serializeTask(data, t)), null, 2));
        return;
      }

      if (!rows.length) {
        console.log(dim("No matching tasks found."));
        return;
      }

      for (const task of rows) {
        const pname = getProjectName(data, task.projectId as string);
        console.log(`${bold(task.id as string)}  ${task.title}  ${dim(`[${pname}]`)}`);
      }
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });

export const projectCommand = new Command("project")
  .description("Project commands");

projectCommand
  .command("list")
  .description("List projects")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    try {
      const data = await fetchAndProcessData();
      const projects = getProjects(data) as Record<string, Record<string, unknown>>;

      if (options.json) {
        console.log(JSON.stringify(Object.values(projects), null, 2));
        return;
      }

      console.log(`\n${bold("Projects:")}`);
      for (const [pid, proj] of Object.entries(projects)) {
        const taskCount = (proj.taskIds as string[])?.length || 0;
        console.log(`  - ${bold(proj.title as string)} ${dim(`(${taskCount} tasks)`)}`);
      }
      console.log();
    } catch (e) {
      console.error(red(`Error: ${e instanceof Error ? e.message : e}`));
      process.exit(1);
    }
  });