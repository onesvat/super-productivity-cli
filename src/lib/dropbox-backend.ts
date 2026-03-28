import {
  Backend,
  Task,
  TaskFilters,
  TaskCreateOptions,
  TaskUpdateData,
  Project,
  Tag,
  StatusData,
  throwReadOnly,
} from "./backend.js";
import { SyncData } from "./sync-processor.js";
import { downloadFile, DROPBOX_SYNC_FILE_PATH } from "./dropbox.js";
import { processSyncFile } from "./sync-processor.js";
import {
  getTasks,
  getTaskIds,
  getProjects,
  getProjectName,
  getTags,
  getTagIds,
  matchesQuery,
  todayStr,
} from "./data-helpers.js";

const TODAY_TAG_ID = "TODAY";

export class DropboxBackend implements Backend {
  name = "dropbox";
  isReadOnly = true;
  private cachedData: SyncData | null = null;
  
  private async fetchData(): Promise<SyncData> {
    if (this.cachedData) return this.cachedData;
    
    const { data } = await downloadFile(DROPBOX_SYNC_FILE_PATH);
    this.cachedData = await processSyncFile(data);
    return this.cachedData;
  }
  
  async getStatus(): Promise<StatusData> {
    const data = await this.fetchData();
    const tasks = getTasks(data) as Record<string, Record<string, unknown>>;
    const taskIds = getTaskIds(data);
    
    const today = todayStr();
    const tags = getTags(data) as Record<string, Record<string, unknown>>;
    const todayTag = tags[TODAY_TAG_ID];
    const todayTaskIds = new Set((todayTag?.taskIds as string[]) || []);
    
    let currentTask: Task | null = null;
    let currentTaskId: string | null = null;
    
    const taskEntities = data.state?.task?.entities as Record<string, unknown> | undefined;
    if (taskEntities) {
      for (const [, task] of Object.entries(taskEntities)) {
        const t = task as Record<string, unknown>;
        if (t.isCurrent === true) {
          currentTask = this.mapTaskFromRaw(t);
          currentTaskId = t.id as string;
          break;
        }
      }
    }
    
    let taskCount = 0;
    for (const tid of taskIds) {
      const task = tasks[tid] as Record<string, unknown>;
      if (task && !task.parentId) {
        const spentOnDay = (task.timeSpentOnDay as Record<string, number>)?.[today] || 0;
        const isToday = todayTaskIds.has(tid);
        const isDueToday = task.dueDay === today || 
          (task.dueWithTime && new Date(task.dueWithTime as number).toISOString().slice(0, 10) === today);
        if (spentOnDay > 0 || isToday || isDueToday) {
          taskCount++;
        }
      }
    }
    
    return { currentTask, currentTaskId, taskCount };
  }
  
  private mapTaskFromRaw(t: Record<string, unknown>): Task {
    return {
      id: t.id as string,
      title: t.title as string,
      projectId: t.projectId as string,
      notes: t.notes as string | undefined,
      isDone: t.isDone as boolean | undefined,
      timeEstimate: t.timeEstimate as number | undefined,
      timeSpent: t.timeSpent as number | undefined,
      timeSpentOnDay: t.timeSpentOnDay as Record<string, number> | undefined,
      dueDay: t.dueDay as string | undefined,
      dueWithTime: t.dueWithTime as number | undefined,
      parentId: t.parentId as string | undefined,
      subTaskIds: t.subTaskIds as string[] | undefined,
      tagIds: t.tagIds as string[] | undefined,
      created: t.created as number | undefined,
      modified: t.modified as number | undefined,
    };
  }
  
  async getTasks(filters?: TaskFilters): Promise<Task[]> {
    const data = await this.fetchData();
    const tasks = getTasks(data) as Record<string, Record<string, unknown>>;
    const taskIds = getTaskIds(data);
    const today = todayStr();
    
    const tags = getTags(data) as Record<string, Record<string, unknown>>;
    const todayTag = tags[TODAY_TAG_ID];
    const todayTaskIds = new Set((todayTag?.taskIds as string[]) || []);
    
    const results: Task[] = [];
    
    for (const tid of taskIds) {
      const task = tasks[tid] as Record<string, unknown>;
      if (!task) continue;
      
      if (filters?.projectId && task.projectId !== filters.projectId) continue;
      
      if (filters?.tagId) {
        const taskTagIds = task.tagIds as string[] | undefined;
        if (!taskTagIds?.includes(filters.tagId)) continue;
      }
      
      if (filters?.query && !matchesQuery(task.title as string, filters.query)) continue;
      
      const isToday = todayTaskIds.has(tid);
      const isDueToday = task.dueDay === today || 
        (task.dueWithTime && new Date(task.dueWithTime as number).toISOString().slice(0, 10) === today);
      
      if (filters?.today) {
        if (!isToday && !isDueToday) continue;
      } else if (filters?.pastDue) {
        if (task.isDone) continue;
        const dueDay = task.dueDay as string | undefined;
        const dueWithTime = task.dueWithTime as number | undefined;
        if (dueDay && dueDay < today) continue;
        if (dueWithTime && new Date(dueWithTime).toISOString().slice(0, 10) < today) continue;
        if (!dueDay && !dueWithTime) continue;
      } else {
        if (!filters?.includeDone && task.isDone) continue;
      }
      
      if (task.parentId) continue;
      
      results.push(this.mapTaskFromRaw(task));
    }
    
    return results;
  }
  
  async getTask(id: string): Promise<Task | null> {
    const data = await this.fetchData();
    const tasks = getTasks(data) as Record<string, Record<string, unknown>>;
    const task = tasks[id];
    
    if (!task) return null;
    return this.mapTaskFromRaw(task as Record<string, unknown>);
  }
  
  async getProjects(query?: string): Promise<Project[]> {
    const data = await this.fetchData();
    const projects = getProjects(data) as Record<string, Record<string, unknown>>;
    
    const results: Project[] = [];
    for (const [, proj] of Object.entries(projects)) {
      if (query && !matchesQuery(proj.title as string, query)) continue;
      results.push({
        id: proj.id as string,
        title: proj.title as string,
        taskCount: (proj.taskIds as string[])?.length || 0,
      });
    }
    
    return results;
  }
  
  async getTags(query?: string): Promise<Tag[]> {
    const data = await this.fetchData();
    const tags = getTags(data) as Record<string, Record<string, unknown>>;
    const tagIds = getTagIds(data);
    
    const results: Tag[] = [];
    for (const tid of tagIds) {
      const tag = tags[tid];
      if (!tag) continue;
      if (query && !matchesQuery(tag.title as string, query)) continue;
      results.push({
        id: tag.id as string,
        title: tag.title as string,
        taskCount: (tag.taskIds as string[])?.length || 0,
      });
    }
    
    return results;
  }
  
  async getRawData(): Promise<SyncData> {
    return this.fetchData();
  }
  
  async createTask(_title: string, _options?: TaskCreateOptions): Promise<Task> {
    throwReadOnly();
  }
  
  async updateTask(_id: string, _data: TaskUpdateData): Promise<Task> {
    throwReadOnly();
  }
  
  async deleteTask(_id: string): Promise<void> {
    throwReadOnly();
  }
  
  async startTask(_id: string): Promise<void> {
    throwReadOnly();
  }
  
  async stopTask(): Promise<void> {
    throwReadOnly();
  }
  
  async archiveTask(_id: string): Promise<void> {
    throwReadOnly();
  }
  
  async restoreTask(_id: string): Promise<Task> {
    throwReadOnly();
  }
  
  getProjectName(projectId: string): string {
    if (!this.cachedData) return projectId || "—";
    return getProjectName(this.cachedData, projectId);
  }
}