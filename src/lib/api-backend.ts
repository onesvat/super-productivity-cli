import {
  Backend,
  Task,
  TaskFilters,
  TaskCreateOptions,
  TaskUpdateData,
  Project,
  Tag,
  StatusData,
} from "./backend.js";
import { SyncData } from "./sync-processor.js";
import {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  DEFAULT_API_URL,
} from "./api-client.js";

interface ApiTask {
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

interface ApiProject {
  id: string;
  title: string;
  taskIds?: string[];
}

interface ApiTag {
  id: string;
  title: string;
  taskIds?: string[];
}

interface ApiStatus {
  currentTask: ApiTask | null;
  currentTaskId: string | null;
  taskCount: number;
}

function mapTask(t: ApiTask): Task {
  return {
    id: t.id,
    title: t.title,
    projectId: t.projectId,
    notes: t.notes,
    isDone: t.isDone,
    timeEstimate: t.timeEstimate,
    timeSpent: t.timeSpent,
    timeSpentOnDay: t.timeSpentOnDay,
    dueDay: t.dueDay,
    dueWithTime: t.dueWithTime,
    parentId: t.parentId,
    subTaskIds: t.subTaskIds,
    tagIds: t.tagIds,
    created: t.created,
    modified: t.modified,
  };
}

function mapProject(p: ApiProject): Project {
  return {
    id: p.id,
    title: p.title,
    taskCount: p.taskIds?.length || 0,
  };
}

function mapTag(t: ApiTag): Tag {
  return {
    id: t.id,
    title: t.title,
    taskCount: t.taskIds?.length || 0,
  };
}

export class ApiBackend implements Backend {
  name = "api";
  isReadOnly = false;
  private baseUrl: string;
  
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.SP_API_URL || DEFAULT_API_URL;
  }
  
  async getStatus(): Promise<StatusData> {
    const status = await apiGet<ApiStatus>(this.baseUrl, "/status");
    return {
      currentTask: status.currentTask ? mapTask(status.currentTask) : null,
      currentTaskId: status.currentTaskId,
      taskCount: status.taskCount,
    };
  }
  
  async getTasks(filters?: TaskFilters): Promise<Task[]> {
    const query: Record<string, string | boolean | undefined> = {};
    
    if (filters?.query) query.query = filters.query;
    if (filters?.projectId) query.projectId = filters.projectId;
    if (filters?.tagId) query.tagId = filters.tagId;
    if (filters?.includeDone) query.includeDone = filters.includeDone;
    if (filters?.source) query.source = filters.source;
    
    const tasks = await apiGet<ApiTask[]>(this.baseUrl, "/tasks", query);
    
    let filtered = tasks.map(mapTask);
    
    const today = new Date().toISOString().slice(0, 10);
    
    if (filters?.today) {
      filtered = filtered.filter((t) => {
        if (t.dueDay === today) return true;
        if (t.dueWithTime) {
          const dueDate = new Date(t.dueWithTime).toISOString().slice(0, 10);
          if (dueDate === today) return true;
        }
        return false;
      });
    }
    
    if (filters?.pastDue) {
      filtered = filtered.filter((t) => {
        if (t.isDone) return false;
        if (t.dueDay && t.dueDay < today) return true;
        if (t.dueWithTime) {
          const dueDate = new Date(t.dueWithTime).toISOString().slice(0, 10);
          if (dueDate < today) return true;
        }
        return false;
      });
    }
    
    if (!filters?.today && !filters?.pastDue && !filters?.includeDone) {
      filtered = filtered.filter((t) => !t.isDone);
    }
    
    return filters?.includeSubtasks ? filtered : filtered.filter((t) => !t.parentId);
  }
  
  async getTask(id: string): Promise<Task | null> {
    try {
      const task = await apiGet<ApiTask>(this.baseUrl, `/tasks/${id}`);
      return mapTask(task);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "TASK_NOT_FOUND") {
        return null;
      }
      throw e;
    }
  }
  
  async getProjects(query?: string): Promise<Project[]> {
    const projects = await apiGet<ApiProject[]>(
      this.baseUrl,
      "/projects",
      query ? { query } : undefined
    );
    return projects.map(mapProject);
  }
  
  async getTags(query?: string): Promise<Tag[]> {
    const tags = await apiGet<ApiTag[]>(
      this.baseUrl,
      "/tags",
      query ? { query } : undefined
    );
    return tags.map(mapTag);
  }
  
  async getRawData(): Promise<SyncData> {
    throw new Error("Raw data not available via API mode");
  }
  
  async createTask(title: string, options?: TaskCreateOptions): Promise<Task> {
    const body: Record<string, unknown> = { title };
    
    if (options?.projectId) body.projectId = options.projectId;
    if (options?.notes) body.notes = options.notes;
    if (options?.timeEstimate) body.timeEstimate = options.timeEstimate;
    if (options?.tagIds) body.tagIds = options.tagIds;
    if (options?.dueDay) body.dueDay = options.dueDay;
    if (options?.dueWithTime) body.dueWithTime = options.dueWithTime;
    if (options?.parentId) body.parentId = options.parentId;
    
    const task = await apiPost<ApiTask>(this.baseUrl, "/tasks", body);
    return mapTask(task);
  }
  
  async updateTask(id: string, data: TaskUpdateData): Promise<Task> {
    const task = await apiPatch<ApiTask>(this.baseUrl, `/tasks/${id}`, data);
    return mapTask(task);
  }
  
  async deleteTask(id: string): Promise<void> {
    await apiDelete(this.baseUrl, `/tasks/${id}`);
  }
  
  async startTask(id: string): Promise<void> {
    await apiPost(this.baseUrl, `/tasks/${id}/start`);
  }
  
  async stopTask(): Promise<void> {
    await apiPost(this.baseUrl, "/task-control/stop");
  }
  
  async archiveTask(id: string): Promise<void> {
    await apiPost(this.baseUrl, `/tasks/${id}/archive`);
  }
  
  async restoreTask(id: string): Promise<Task> {
    const task = await apiPost<ApiTask>(this.baseUrl, `/tasks/${id}/restore`);
    return mapTask(task);
  }
}