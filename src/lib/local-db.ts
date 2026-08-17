"use client";

import Dexie, { type Table } from "dexie";
import type { AppData, ChecklistItem, Idea, IdeaTaskLink, RecurringTaskRule, Task, TimeSession, UserSettings, WeeklyMetric, WeeklyReport, WeeklyTarget } from "./types";
import { defaultSettings, emptyData, sampleData } from "./seed";
import { generateDueRecurringTasks } from "./calculations";

class AwesomeDb extends Dexie {
  tasks!: Table<Task, string>;
  checklistItems!: Table<ChecklistItem, string>;
  sessions!: Table<TimeSession, string>;
  recurringRules!: Table<RecurringTaskRule, string>;
  ideas!: Table<Idea, string>;
  ideaTaskLinks!: Table<IdeaTaskLink, string>;
  weeklyTargets!: Table<WeeklyTarget, string>;
  weeklyMetrics!: Table<WeeklyMetric, string>;
  weeklyReports!: Table<WeeklyReport, string>;
  settings!: Table<UserSettings, string>;

  constructor() {
    super("awesome-english-ops");
    this.version(1).stores({
      tasks: "id, userId, scheduledDate, category, status, recurringRuleId, recurrenceOccurrenceDate, deletedAt",
      checklistItems: "id, taskId",
      sessions: "id, userId, taskId, startedAt, endedAt, deletedAt",
      recurringRules: "id, userId, nextOccurrenceDate, isActive",
      ideas: "id, userId, status, createdDate, deletedAt",
      ideaTaskLinks: "id, ideaId, taskId",
      weeklyTargets: "id, userId, weekStart",
      weeklyMetrics: "id, userId, weekStart",
      weeklyReports: "id, userId, weekStart",
      settings: "id, userId"
    });
  }
}

export const db = new AwesomeDb();

export async function readLocalData(): Promise<AppData> {
  const settings = (await db.settings.toArray())[0] ?? defaultSettings();
  if (!(await db.settings.count())) await db.settings.put(settings);
  const data: AppData = {
    tasks: await db.tasks.toArray(),
    checklistItems: await db.checklistItems.toArray(),
    sessions: await db.sessions.toArray(),
    recurringRules: await db.recurringRules.toArray(),
    ideas: await db.ideas.toArray(),
    ideaTaskLinks: await db.ideaTaskLinks.toArray(),
    weeklyTargets: await db.weeklyTargets.toArray(),
    weeklyMetrics: await db.weeklyMetrics.toArray(),
    weeklyReports: await db.weeklyReports.toArray(),
    settings
  };
  const generated = generateDueRecurringTasks(data);
  if (generated.generated > 0) await writeLocalData(generated);
  return generated;
}

export async function writeLocalData(data: AppData) {
  await db.transaction("rw", [db.tasks, db.checklistItems, db.sessions, db.recurringRules, db.ideas, db.ideaTaskLinks, db.weeklyTargets, db.weeklyMetrics, db.weeklyReports, db.settings], async () => {
    await Promise.all([
      db.tasks.bulkPut(data.tasks),
      db.checklistItems.bulkPut(data.checklistItems),
      db.sessions.bulkPut(data.sessions),
      db.recurringRules.bulkPut(data.recurringRules),
      db.ideas.bulkPut(data.ideas),
      db.ideaTaskLinks.bulkPut(data.ideaTaskLinks),
      db.weeklyTargets.bulkPut(data.weeklyTargets),
      db.weeklyMetrics.bulkPut(data.weeklyMetrics),
      db.weeklyReports.bulkPut(data.weeklyReports),
      db.settings.put(data.settings)
    ]);
  });
}

export async function loadSamples() {
  const existingSettings = (await db.settings.toArray())[0] ?? defaultSettings();
  const settings = { ...existingSettings, sampleDataLoaded: true };
  const samples = sampleData();
  await writeLocalData({ ...emptyData(), ...samples, sessions: [], settings });
}

export async function clearSamples() {
  await db.transaction("rw", [db.tasks, db.checklistItems, db.sessions, db.recurringRules, db.ideas, db.ideaTaskLinks, db.weeklyTargets, db.weeklyMetrics, db.weeklyReports, db.settings], async () => {
    await Promise.all([db.tasks.clear(), db.checklistItems.clear(), db.sessions.clear(), db.recurringRules.clear(), db.ideas.clear(), db.ideaTaskLinks.clear(), db.weeklyTargets.clear(), db.weeklyMetrics.clear(), db.weeklyReports.clear()]);
    await db.settings.put({ ...defaultSettings(), sampleDataLoaded: false });
  });
}
