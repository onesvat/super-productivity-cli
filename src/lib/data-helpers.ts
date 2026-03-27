import { SyncData } from "./sync-processor.js";

const TODAY_TAG_ID = "TODAY";

export const getTasks = (data: SyncData): Record<string, unknown> => {
  return data.state?.task?.entities || {};
};

export const getTaskIds = (data: SyncData): string[] => {
  return data.state?.task?.ids || [];
};

export const getProjects = (data: SyncData): Record<string, unknown> => {
  return data.state?.project?.entities || {};
};

export const getTags = (data: SyncData): Record<string, unknown> => {
  return data.state?.tag?.entities || {};
};

export const getProjectName = (data: SyncData, projectId: string): string => {
  const projects = getProjects(data) as Record<string, Record<string, unknown>>;
  const project = projects[projectId];
  return (project?.title as string) || projectId || "—";
};

export const getTodayTaskIds = (data: SyncData): Set<string> => {
  const tags = getTags(data) as Record<string, Record<string, unknown>>;
  const todayTag = tags[TODAY_TAG_ID];
  return new Set((todayTag?.taskIds as string[]) || []);
};

export const matchesQuery = (value: string, query: string): boolean => {
  const valueL = value.toLowerCase();
  const queryL = query.toLowerCase();
  if (!queryL.includes("*")) {
    return valueL.includes(queryL);
  }
  const pattern = "^" + queryL.replace(/\*/g, ".*") + "$";
  return new RegExp(pattern).test(valueL);
};

export const fmtDuration = (ms: number): string => {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
};

export const fmtTime = (msUtc: number): string => {
  if (!msUtc) return "";
  const dt = new Date(msUtc);
  const dStr = dt.toISOString().slice(0, 10);
  const tStr = dt.toTimeString().slice(0, 5);
  const today = new Date().toISOString().slice(0, 10);
  if (dStr === today) return tStr;
  return `${dStr} ${tStr}`;
};

export const todayStr = (): string => new Date().toISOString().slice(0, 10);

export interface Task {
  id: string;
  title: string;
  projectId: string;
  timeEstimate?: number;
  timeSpent?: number;
  timeSpentOnDay?: Record<string, number>;
  isDone?: boolean;
  dueDay?: string;
  dueWithTime?: number;
  parentId?: string;
  subTaskIds?: string[];
}

export const serializeTask = (
  _data: SyncData,
  task: Record<string, unknown>,
): Task => {
  return {
    id: task.id as string,
    title: task.title as string,
    projectId: task.projectId as string,
    timeEstimate: task.timeEstimate as number | undefined,
    timeSpent: task.timeSpent as number | undefined,
    timeSpentOnDay: task.timeSpentOnDay as Record<string, number> | undefined,
    isDone: task.isDone as boolean | undefined,
    dueDay: task.dueDay as string | undefined,
    dueWithTime: task.dueWithTime as number | undefined,
    parentId: task.parentId as string | undefined,
    subTaskIds: task.subTaskIds as string[] | undefined,
  };
};