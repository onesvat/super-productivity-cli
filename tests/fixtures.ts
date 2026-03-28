import { SyncData } from '../src/lib/sync-processor.js';

const TODAY = new Date().toISOString().slice(0, 10);

export const createMockTask = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'task-1',
  title: 'Test Task',
  projectId: 'INBOX_PROJECT',
  timeSpentOnDay: {},
  timeSpent: 0,
  timeEstimate: 3600000,
  isDone: false,
  tagIds: [],
  subTaskIds: [],
  created: Date.now(),
  notes: '',
  attachments: [],
  ...overrides,
});

export const createMockProject = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'INBOX_PROJECT',
  title: 'Inbox',
  taskIds: [],
  backlogTaskIds: [],
  isHiddenFromMenu: false,
  isArchived: false,
  icon: 'inbox',
  ...overrides,
});

export const createMockTag = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'tag-1',
  title: 'Test Tag',
  taskIds: [],
  icon: 'label',
  created: Date.now(),
  color: null,
  ...overrides,
});

export const createMockCounter = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'counter-1',
  title: 'Reading',
  type: 'ClickCounter',
  isEnabled: true,
  isOn: true,
  countOnDay: { [TODAY]: 5 },
  icon: 'book',
  created: Date.now(),
  ...overrides,
});

export const createMockNote = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'note-1',
  content: 'This is a test note with some content.',
  projectId: null,
  isPinnedToToday: false,
  created: Date.now(),
  modified: Date.now(),
  ...overrides,
});

export const createMockSyncData = (partial: Partial<SyncData> = {}): SyncData => {
  const baseState = {
    task: { ids: [], entities: {} },
    project: {
      ids: ['INBOX_PROJECT'],
      entities: { INBOX_PROJECT: createMockProject() },
    },
    tag: {
      ids: ['TODAY'],
      entities: {
        TODAY: createMockTag({ id: 'TODAY', title: 'Today', taskIds: [] }),
      },
    },
    simpleCounter: { ids: [], entities: {} },
    note: { ids: [], entities: {} },
    planner: { days: {} },
  };

  return {
    version: 1,
    syncVersion: 1,
    schemaVersion: 1,
    vectorClock: {},
    lastModified: Date.now(),
    clientId: 'test-client',
    state: baseState,
    ...partial,
  } as SyncData;
};

export const createFullSyncData = (): SyncData => {
  const task1 = createMockTask({ id: 'task-1', title: 'Active Task 1', projectId: 'INBOX_PROJECT' });
  const task2 = createMockTask({ id: 'task-2', title: 'Active Task 2', projectId: 'project-1', isDone: true });
  const task3 = createMockTask({ id: 'task-3', title: 'Today Task', tagIds: ['TODAY'], timeSpentOnDay: { [TODAY]: 1800000 } });
  const subtask = createMockTask({ id: 'task-1-sub', title: 'Subtask', parentId: 'task-1', projectId: 'INBOX_PROJECT' });
  task1.subTaskIds = ['task-1-sub'];

  const project1 = createMockProject({ id: 'project-1', title: 'Work Project', taskIds: ['task-2'] });

  const tag1 = createMockTag({ id: 'urgent', title: 'Urgent', taskIds: ['task-1'] });
  const todayTag = createMockTag({ id: 'TODAY', title: 'Today', taskIds: ['task-3'] });

  const counter1 = createMockCounter({ id: 'counter-reading', title: 'Reading', countOnDay: { [TODAY]: 10 } });
  const counter2 = createMockCounter({ id: 'counter-exercise', title: 'Exercise', isOn: false, countOnDay: {} });

  const note1 = createMockNote({ id: 'note-meeting', content: 'Meeting notes from yesterday...' });
  const note2 = createMockNote({ id: 'note-project', content: 'Project roadmap draft...', projectId: 'project-1', isPinnedToToday: true });

  return {
    version: 1,
    syncVersion: 1,
    schemaVersion: 1,
    vectorClock: { 'client-a': 5 },
    lastModified: Date.now(),
    clientId: 'test-client',
    state: {
      task: {
        ids: ['task-1', 'task-2', 'task-3', 'task-1-sub'],
        entities: { 'task-1': task1, 'task-2': task2, 'task-3': task3, 'task-1-sub': subtask },
      },
      project: {
        ids: ['INBOX_PROJECT', 'project-1'],
        entities: { INBOX_PROJECT: createMockProject(), 'project-1': project1 },
      },
      tag: {
        ids: ['TODAY', 'urgent'],
        entities: { TODAY: todayTag, urgent: tag1 },
      },
      simpleCounter: {
        ids: ['counter-reading', 'counter-exercise'],
        entities: { 'counter-reading': counter1, 'counter-exercise': counter2 },
      },
      note: {
        ids: ['note-meeting', 'note-project'],
        entities: { 'note-meeting': note1, 'note-project': note2 },
      },
      planner: { days: { [TODAY]: ['task-3'] } },
    },
  } as SyncData;
};

export const createEmptySyncData = (): SyncData => ({
  version: 1,
  syncVersion: 1,
  schemaVersion: 1,
  vectorClock: {},
  lastModified: Date.now(),
  clientId: 'test-client',
  state: {
    task: { ids: [], entities: {} },
    project: { ids: [], entities: {} },
    tag: { ids: [], entities: {} },
    simpleCounter: { ids: [], entities: {} },
    note: { ids: [], entities: {} },
    planner: { days: {} },
  },
});