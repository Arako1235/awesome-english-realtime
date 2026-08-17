import { addDays, addMonths, addYears, format, isAfter, parseISO } from "date-fns";
import { v4 as uuid } from "uuid";
import type { AppData, RecurringTaskRule, Task, TaskCategory, TimeSession, WeeklyMetric, WeeklyReport, WeeklyTarget } from "./types";
import { inWeek, minutesBetweenIso, nowIso, todaySeoul, weekEndSeoul, weekStartSeoul } from "./time";

export const categoryMeta: Record<TaskCategory, { label: string; color: string; bg: string; icon: string }> = {
  RUN: { label: "유지업무", color: "#4f83a6", bg: "#e7f0f6", icon: "Gauge" },
  GROW: { label: "매출업무", color: "#3d9b72", bg: "#e6f4ed", icon: "TrendingUp" },
  BUILD: { label: "시스템화", color: "#8065b3", bg: "#eee9f8", icon: "Wrench" },
  IDEA: { label: "아이디어", color: "#d9932e", bg: "#fff1d6", icon: "Lightbulb" }
};

export function sessionMinutesForTask(taskId: string, sessions: TimeSession[], now = new Date()) {
  return sessions
    .filter((s) => s.taskId === taskId && !s.deletedAt)
    .reduce((sum, session) => sum + minutesBetweenIso(session.startedAt, session.endedAt, now), 0);
}

export function actualMinutes(task: Task, sessions: TimeSession[], now = new Date()) {
  return task.actualMinutesManual + sessionMinutesForTask(task.id, sessions, now);
}

export function runningSession(sessions: TimeSession[]) {
  return sessions.find((session) => !session.endedAt && !session.deletedAt) ?? null;
}

export function categoryTotals(tasks: Task[], sessions: TimeSession[], now = new Date()) {
  const totals: Record<TaskCategory, { planned: number; actual: number; completed: number; count: number }> = {
    RUN: { planned: 0, actual: 0, completed: 0, count: 0 },
    GROW: { planned: 0, actual: 0, completed: 0, count: 0 },
    BUILD: { planned: 0, actual: 0, completed: 0, count: 0 },
    IDEA: { planned: 0, actual: 0, completed: 0, count: 0 }
  };
  for (const task of tasks.filter((t) => !t.deletedAt)) {
    totals[task.category].planned += task.estimatedMinutes;
    totals[task.category].actual += actualMinutes(task, sessions, now);
    totals[task.category].count += 1;
    if (task.status === "완료") totals[task.category].completed += 1;
  }
  return totals;
}

export function weeklySummary(data: AppData, weekStart = weekStartSeoul(), now = new Date()) {
  const tasks = data.tasks.filter((task) => !task.deletedAt && inWeek(task.scheduledDate, weekStart));
  const sessions = data.sessions.filter((session) => !session.deletedAt);
  const totals = categoryTotals(tasks, sessions, now);
  const target = getWeeklyTarget(data, weekStart);
  const targetMap: Record<TaskCategory, number> = {
    RUN: target.runMinutes,
    GROW: target.growMinutes,
    BUILD: target.buildMinutes,
    IDEA: target.ideaMinutes
  };
  const planned = tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  const actual = tasks.reduce((sum, task) => sum + actualMinutes(task, sessions, now), 0);
  const completedCount = tasks.filter((task) => task.status === "완료").length;
  const growCompleted = tasks.filter((task) => task.status === "완료" && task.category === "GROW").length;
  const overEstimate = tasks
    .map((task) => ({ task, diff: actualMinutes(task, sessions, now) - task.estimatedMinutes }))
    .filter((row) => row.diff > 10)
    .sort((a, b) => b.diff - a.diff);
  const recurringDue = tasks.filter((task) => task.isRecurring).length;
  const recurringDone = tasks.filter((task) => task.isRecurring && task.status === "완료").length;
  const warnings = buildWarnings(totals, targetMap);
  return { tasks, totals, targetMap, planned, actual, completedCount, growCompleted, overEstimate, recurringDue, recurringDone, warnings };
}

export function getWeeklyTarget(data: AppData, weekStart = weekStartSeoul()): WeeklyTarget {
  return data.weeklyTargets.find((target) => target.weekStart === weekStart) ?? {
    id: "settings-target",
    userId: data.settings.userId,
    weekStart,
    runMinutes: data.settings.runTargetMinutes,
    growMinutes: data.settings.growTargetMinutes,
    buildMinutes: data.settings.buildTargetMinutes,
    ideaMinutes: data.settings.ideaTargetMinutes
  };
}

export function getWeeklyMetric(data: AppData, weekStart = weekStartSeoul()): WeeklyMetric {
  return data.weeklyMetrics.find((metric) => metric.weekStart === weekStart) ?? {
    id: uuid(),
    userId: data.settings.userId,
    weekStart,
    inquiries: 0,
    consultations: 0,
    eventApplications: 0,
    newEnrollments: 0,
    marketingCost: 0,
    revenue: 0,
    expectedRevenue: 0,
    savedMinutes: 0,
    notes: ""
  };
}

function buildWarnings(totals: ReturnType<typeof categoryTotals>, targetMap: Record<TaskCategory, number>) {
  const warnings: string[] = [];
  const runDiff = totals.RUN.actual - targetMap.RUN;
  const growDiff = targetMap.GROW - totals.GROW.actual;
  if (runDiff >= 120 || growDiff >= 120) {
    warnings.push(`이번 주는 RUN 업무가 목표보다 ${Math.round(runDiff / 60)}시간 많고 GROW 업무가 ${Math.round(growDiff / 60)}시간 부족합니다. 다음 주 수·목 13:00~15:00를 GROW 전용시간으로 보호해보세요.`);
  } else if (runDiff >= 60) {
    warnings.push(`RUN 시간이 목표보다 ${Math.round(runDiff / 60)}시간 많습니다. 반복 유지업무 중 줄일 수 있는 서식화 후보를 하나만 골라보세요.`);
  } else if (growDiff >= 60) {
    warnings.push(`GROW 시간이 목표보다 ${Math.round(growDiff / 60)}시간 부족합니다. 이번 주 핵심 매출 행동 1개를 먼저 배치해보세요.`);
  }
  return warnings;
}

export function nextOccurrence(rule: RecurringTaskRule, fromDate = rule.nextOccurrenceDate) {
  const base = parseISO(fromDate);
  if (rule.frequency === "weekly") return format(addDays(base, 7 * rule.interval), "yyyy-MM-dd");
  if (rule.frequency === "monthly") return format(addMonths(base, rule.interval), "yyyy-MM-dd");
  if (rule.frequency === "quarterly") return format(addMonths(base, 3 * rule.interval), "yyyy-MM-dd");
  if (rule.frequency === "halfyearly") return format(addMonths(base, 6 * rule.interval), "yyyy-MM-dd");
  return format(addYears(base, rule.interval), "yyyy-MM-dd");
}

export function generateDueRecurringTasks(data: AppData, untilDate = todaySeoul()) {
  const tasks = [...data.tasks];
  const rules = data.recurringRules.map((rule) => ({ ...rule }));
  let generated = 0;
  for (const rule of rules) {
    if (!rule.isActive) continue;
    let cursor = rule.nextOccurrenceDate || rule.startDate;
    let guard = 0;
    while (!isAfter(parseISO(cursor), parseISO(untilDate)) && guard < 50) {
      const exists = tasks.some((task) => task.recurringRuleId === rule.id && task.recurrenceOccurrenceDate === cursor && !task.deletedAt);
      if (!exists) {
        tasks.push({
          id: uuid(),
          userId: rule.userId,
          title: rule.title,
          description: rule.description,
          category: rule.category,
          importance: rule.importance,
          status: "이번 주",
          scheduledDate: cursor,
          scheduledStart: null,
          scheduledEnd: null,
          estimatedMinutes: rule.title.includes("리포트") ? 30 : 60,
          actualMinutesManual: 0,
          deadline: format(addDays(parseISO(cursor), rule.internalDeadlineOffsetDays), "yyyy-MM-dd"),
          branch: rule.branch,
          isRecurring: true,
          recurringRuleId: rule.id,
          recurrenceOccurrenceDate: cursor,
          outcomeMemo: "",
          longReason: "",
          nextEstimateMinutes: null,
          followUp: "",
          completedAt: null,
          deletedAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso()
        });
        generated += 1;
      }
      cursor = nextOccurrence(rule, cursor);
      guard += 1;
    }
    rule.nextOccurrenceDate = cursor;
    rule.updatedAt = nowIso();
  }
  return { ...data, tasks, recurringRules: rules, generated };
}

export function makeReportDraft(data: AppData, weekStart = weekStartSeoul(), now = new Date()) {
  const summary = weeklySummary(data, weekStart, now);
  const metric = getWeeklyMetric(data, weekStart);
  const weekEnd = weekEndSeoul(parseISO(weekStart));
  const lines = [
    `# ${weekStart}~${weekEnd} 경영 기여 리포트`,
    "",
    "## 운영을 안정화한 일",
    summary.tasks.filter((task) => task.category === "RUN" && task.status === "완료").map((task) => `- ${task.title}`).join("\n") || "- 이번 주 완료한 RUN 업무를 기록해주세요.",
    "",
    "## 숫자·비용과 관련해 발견한 사항",
    metric.notes || "- 특이사항 없음",
    "",
    "## 매출을 위해 실행한 일",
    summary.tasks.filter((task) => task.category === "GROW").map((task) => `- ${task.title} (${task.status})`).join("\n") || "- GROW 업무가 부족합니다.",
    "",
    "## 문의·상담·설명회 신청·등록 결과",
    `- 문의 ${metric.inquiries}건 / 상담 ${metric.consultations}건 / 설명회 신청 ${metric.eventApplications}건 / 신규 등록 ${metric.newEnrollments}건`,
    `- 마케팅비 ${metric.marketingCost.toLocaleString()}원 / 발생 매출 ${metric.revenue.toLocaleString()}원 / 예상 매출 ${metric.expectedRevenue.toLocaleString()}원`,
    "",
    "## 시스템화한 일",
    summary.tasks.filter((task) => task.category === "BUILD").map((task) => `- ${task.title}`).join("\n") || "- 다음 주 BUILD 후보를 하나 정해주세요.",
    `- 절약한 예상시간: ${metric.savedMinutes}분`,
    "",
    "## 시간 사용",
    ...(["RUN", "GROW", "BUILD", "IDEA"] as TaskCategory[]).map((cat) => `- ${cat}: 실제 ${summary.totals[cat].actual}분 / 목표 ${summary.targetMap[cat]}분`),
    "",
    "## 계획 대비 부족하거나 초과한 분야",
    summary.warnings[0] ?? "- 큰 편차는 없습니다. 현재 리듬을 유지해도 좋습니다.",
    "",
    "## 이번 주 주요 성과",
    `- 완료 업무 ${summary.completedCount}개, 완료 GROW 업무 ${summary.growCompleted}개`,
    "",
    "## 다음 주 추천 핵심목표 3개",
    "- GROW 전용시간 2시간 보호",
    "- 반복 RUN 업무 1개 서식화",
    "- 이번 달 실행 아이디어 1개만 선택"
  ];
  return lines.join("\n");
}

export function upsertReportDraft(data: AppData, weekStart = weekStartSeoul()) {
  const existing = data.weeklyReports.find((report) => report.weekStart === weekStart);
  const draft = existing?.draft || makeReportDraft(data, weekStart);
  const report: WeeklyReport = existing ? { ...existing, draft, updatedAt: nowIso() } : { id: uuid(), userId: data.settings.userId, weekStart, draft, updatedAt: nowIso() };
  return { ...data, weeklyReports: existing ? data.weeklyReports.map((item) => item.id === report.id ? report : item) : [...data.weeklyReports, report] };
}
