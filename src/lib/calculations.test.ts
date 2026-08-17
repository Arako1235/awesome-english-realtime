import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addMinutes } from "date-fns";
import { emptyData } from "./seed";
import { actualMinutes, buildCategoryComparison, categoryComparisonPhrase, categoryTotals, formatDurationKo, generateDueRecurringTasks, makeReportDraft, runningSession, weeklySummary } from "./calculations";
import type { RecurringTaskRule, Task, TaskCategory, TimeSession } from "./types";

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

  it("formats category target differences without negative wording", () => {
    const data = emptyData();
    const now = new Date("2026-08-19T04:00:00.000Z");
    const summary = weeklySummary(data, "2026-08-17", now);
    assert.equal(formatDurationKo(480), "8시간");
    assert.equal(formatDurationKo(90), "1시간 30분");
    assert.equal(formatDurationKo(30), "30분");
    assert.equal(summary.warnings[0], "이번 주는 RUN 업무가 목표보다 8시간 부족하고, GROW 업무도 목표보다 8시간 부족합니다. 이번 주 핵심 매출 행동 1개를 먼저 배치해보세요.");
    const draft = makeReportDraft(data, "2026-08-17", now);
    assert.match(draft, /RUN 업무가 목표보다 8시간 부족하고, GROW 업무도 목표보다 8시간 부족합니다/);
    assert.doesNotMatch(summary.warnings[0], /-8시간/);
  });

  it("compares short, over, and met targets for every category", () => {
    const targetMap: Record<TaskCategory, number> = { RUN: 60, GROW: 60, BUILD: 60, IDEA: 60 };
    const tasks = [
      baseTask({ id: "run", category: "RUN", actualMinutesManual: 30 }),
      baseTask({ id: "grow", category: "GROW", actualMinutesManual: 90 }),
      baseTask({ id: "build", category: "BUILD", actualMinutesManual: 60 }),
      baseTask({ id: "idea", category: "IDEA", actualMinutesManual: 0 })
    ];
    const comparison = buildCategoryComparison(categoryTotals(tasks, [], new Date("2026-08-19T04:00:00.000Z")), targetMap);
    assert.equal(categoryComparisonPhrase(comparison.find((item) => item.category === "RUN")!), "RUN 업무가 목표보다 30분 부족합니다");
    assert.equal(categoryComparisonPhrase(comparison.find((item) => item.category === "GROW")!), "GROW 업무가 목표보다 30분 초과했습니다");
    assert.equal(categoryComparisonPhrase(comparison.find((item) => item.category === "BUILD")!), "BUILD 업무가 목표시간을 달성했습니다");
    assert.equal(categoryComparisonPhrase(comparison.find((item) => item.category === "IDEA")!), "IDEA 업무가 목표보다 1시간 부족합니다");
  });
});
