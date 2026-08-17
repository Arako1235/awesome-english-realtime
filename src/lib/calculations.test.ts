import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addMinutes } from "date-fns";
import { emptyData } from "./seed";
import { actualMinutes, generateDueRecurringTasks, makeReportDraft, runningSession, weeklySummary } from "./calculations";
import type { RecurringTaskRule, Task, TimeSession } from "./types";

const userId = "u";

function baseTask(patch: Partial<Task> = {}): Task {
  return {
    id: patch.id ?? "task-1",
    userId,
    title: "테스트 업무",
    description: "",
    category: "RUN",
    importance: "보통",
    status: "이번 주",
    scheduledDate: "2026-08-17",
    scheduledStart: null,
    scheduledEnd: null,
    estimatedMinutes: 60,
    actualMinutesManual: 0,
    deadline: null,
    branch: "공통",
    isRecurring: false,
    recurringRuleId: null,
    recurrenceOccurrenceDate: null,
    outcomeMemo: "",
    longReason: "",
    nextEstimateMinutes: null,
    followUp: "",
    completedAt: null,
    deletedAt: null,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
    ...patch
  };
}

describe("time calculations", () => {
  it("sums closed sessions, running sessions, and manual minutes", () => {
    const now = new Date("2026-08-17T05:00:00.000Z");
    const task = baseTask({ actualMinutesManual: 10 });
    const sessions: TimeSession[] = [
      { id: "s1", userId, taskId: task.id, startedAt: "2026-08-17T03:00:00.000Z", endedAt: "2026-08-17T03:30:00.000Z", note: "", deletedAt: null },
      { id: "s2", userId, taskId: task.id, startedAt: "2026-08-17T04:40:00.000Z", endedAt: null, note: "", deletedAt: null }
    ];
    assert.equal(actualMinutes(task, sessions, now), 60);
    assert.equal(runningSession(sessions)?.id, "s2");
  });
});

describe("recurring tasks", () => {
  it("generates due instances once per rule and occurrence date", () => {
    const rule: RecurringTaskRule = {
      id: "rule-1",
      userId,
      title: "매주 반복",
      description: "",
      category: "RUN",
      importance: "보통",
      branch: "공통",
      frequency: "weekly",
      interval: 1,
      startDate: "2026-08-03",
      externalDeadlineOffsetDays: 0,
      internalDeadlineOffsetDays: -2,
      checklist: [],
      contactMemo: "",
      nextOccurrenceDate: "2026-08-03",
      isActive: true,
      pausedAt: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z"
    };
    const first = generateDueRecurringTasks({ ...emptyData(), recurringRules: [rule] }, "2026-08-17");
    const second = generateDueRecurringTasks(first, "2026-08-17");
    assert.equal(first.tasks.length, 3);
    assert.equal(second.tasks.length, 3);
  });
});

describe("weekly summary", () => {
  it("uses Monday week boundaries and category totals", () => {
    const now = new Date("2026-08-19T04:00:00.000Z");
    const task = baseTask({ scheduledDate: "2026-08-17", category: "GROW", estimatedMinutes: 120, status: "완료" });
    const session: TimeSession = { id: "s", userId, taskId: task.id, startedAt: now.toISOString(), endedAt: addMinutes(now, 90).toISOString(), note: "", deletedAt: null };
    const summary = weeklySummary({ ...emptyData(), tasks: [task], sessions: [session] }, "2026-08-17", now);
    assert.equal(summary.planned, 120);
    assert.equal(summary.totals.GROW.actual, 90);
    assert.equal(summary.completedCount, 1);
  });

  it("creates a management report draft from metrics and task totals", () => {
    const task = baseTask({ category: "BUILD", status: "완료" });
    const draft = makeReportDraft({ ...emptyData(), tasks: [task] }, "2026-08-17", new Date("2026-08-19T04:00:00.000Z"));
    assert.match(draft, /경영 기여 리포트/);
    assert.match(draft, /다음 주 추천 핵심목표 3개/);
  });
});
