import { SyncData } from "./sync-processor.js";

export const READ_ONLY_ERROR = "Error: write operations require --api mode (Local REST API)";

export interface TaskFilters {
  query?: string;
  projectId?: string;
  tagId?: string;
  includeDone?: boolean;
  source?: "active" | "archived" | "all";
  today?: boolean;
  pastDue?: boolean;
  includeSubtasks?: boolean;
}

export interface TaskCreateOptions {
  projectId?: string;
  notes?: string;
  timeEstimate?: number;
  tagIds?: string[];
  dueDay?: string;
  dueWithTime?: number;
  parentId?: string;
}

export interface TaskUpdateData {
  title?: string;
  notes?: string;
  isDone?: boolean;
  projectId?: string;
  timeEstimate?: number;
  tagIds?: string[];
  dueDay?: string | null;
  dueWithTime?: number | null;
  parentId?: string | null;
}

export interface Task {
  id: string;
  title: string;
  projectId: string;
  notes?: string;
  isDone?: boolean;
  timeEstimate?: number;
  timeSpent?: number;
  timeSpentOnDay?: Record<string, number>;
  dueDay?: string | null;
  dueWithTime?: number | null;
  parentId?: string | null;
  subTaskIds?: string[];
  tagIds?: string[];
  created?: number;
  modified?: number;
}

export interface Project {
  id: string;
  title: string;
  taskCount?: number;
}

export interface Tag {
  id: string;
  title: string;
  taskCount?: number;
}

export interface StatusData {
  currentTask: Task | null;
  currentTaskId: string | null;
  taskCount: number;
}

export interface Backend {
  name: string;
  isReadOnly: boolean;
  
  getStatus(): Promise<StatusData>;
  getTasks(filters?: TaskFilters): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  getProjects(query?: string): Promise<Project[]>;
  getTags(query?: string): Promise<Tag[]>;
  
  getRawData(): Promise<SyncData>;
  
  createTask(title: string, options?: TaskCreateOptions): Promise<Task>;
  updateTask(id: string, data: TaskUpdateData): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  startTask(id: string): Promise<void>;
  stopTask(): Promise<void>;
  archiveTask(id: string): Promise<void>;
  restoreTask(id: string): Promise<Task>;
}

export function throwReadOnly(): never {
  throw new Error(READ_ONLY_ERROR);
}