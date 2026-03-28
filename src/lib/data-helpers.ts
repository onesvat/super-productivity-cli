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

export const getTagIds = (data: SyncData): string[] => {
  return data.state?.tag?.ids || [];
};

export const getCounters = (data: SyncData): Record<string, unknown> => {
  return data.state?.simpleCounter?.entities || {};
};

export const getCounterIds = (data: SyncData): string[] => {
  return data.state?.simpleCounter?.ids || [];
};

export const getNotes = (data: SyncData): Record<string, unknown> => {
  return data.state?.note?.entities || {};
};

export const getNoteIds = (data: SyncData): string[] => {
  return data.state?.note?.ids || [];
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

export interface Counter {
  id: string;
  title: string;
  isOn?: boolean;
  type?: string;
  todayValue?: number;
  countOnDay?: Record<string, number>;
  created?: number;
  modified?: number;
}

export interface Tag {
  id: string;
  title: string;
  taskCount?: number;
  created?: number;
  modified?: number;
}

export interface Note {
  id: string;
  content?: string;
  projectId?: string;
  pinnedToday?: boolean;
  created?: number;
  modified?: number;
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

export const serializeCounter = (
  counter: Record<string, unknown>,
  full: boolean
): Counter => {
  const today = todayStr();
  const countOnDay = counter.countOnDay as Record<string, number> | undefined;
  const todayValue = countOnDay?.[today] || 0;

  if (full) {
    return {
      id: counter.id as string,
      title: counter.title as string,
      isOn: counter.isOn as boolean | undefined,
      type: counter.type as string | undefined,
      todayValue,
      countOnDay,
      created: counter.created as number | undefined,
      modified: counter.modified as number | undefined,
    };
  }

  return {
    id: counter.id as string,
    title: counter.title as string,
    isOn: counter.isOn as boolean | undefined,
    type: counter.type as string | undefined,
    todayValue,
  };
};

export const serializeTag = (
  tag: Record<string, unknown>,
  full: boolean
): Tag => {
  const taskIds = tag.taskIds as string[] | undefined;
  const taskCount = taskIds?.length || 0;

  if (full) {
    return {
      id: tag.id as string,
      title: tag.title as string,
      taskCount,
      created: tag.created as number | undefined,
      modified: tag.modified as number | undefined,
    };
  }

  return {
    id: tag.id as string,
    title: tag.title as string,
    taskCount,
  };
};

export const serializeNote = (
  note: Record<string, unknown>,
  full: boolean
): Note => {
  const content = note.content as string | undefined;
  const preview = content?.slice(0, 80) || "";

  if (full) {
    return {
      id: note.id as string,
      content,
      projectId: note.projectId as string | undefined,
      pinnedToday: note.pinnedToday as boolean | undefined,
      created: note.created as number | undefined,
      modified: note.modified as number | undefined,
    };
  }

  return {
    id: note.id as string,
    content: preview,
    projectId: note.projectId as string | undefined,
    pinnedToday: note.pinnedToday as boolean | undefined,
  };
};