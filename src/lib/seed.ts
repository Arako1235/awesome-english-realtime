import { v4 as uuid } from "uuid";
import type { AppData, ChecklistItem, Idea, RecurringTaskRule, Task, UserSettings, WeeklyMetric, WeeklyReport, WeeklyTarget } from "./types";
import { nowIso, todaySeoul, weekStartSeoul } from "./time";

const userId = "local-user";

export function defaultSettings(): UserSettings {
  return {
    id: "settings-local",
    userId,
    timezone: "Asia/Seoul",
    workStart: "13:00",
    workEnd: "19:00",
    runTargetMinutes: 480,
    growTargetMinutes: 480,
    buildTargetMinutes: 180,
    ideaTargetMinutes: 60,
    sampleDataLoaded: false
  };
}

function task(input: Partial<Task> & Pick<Task, "title" | "category" | "estimatedMinutes">): Task {
  const date = input.scheduledDate ?? todaySeoul();
  return {
    id: uuid(),
    userId,
    title: input.title,
    description: input.description ?? "",
    category: input.category,
    importance: input.importance ?? "보통",
    status: input.status ?? "이번 주",
    scheduledDate: date,
    scheduledStart: input.scheduledStart ?? null,
    scheduledEnd: input.scheduledEnd ?? null,
    estimatedMinutes: input.estimatedMinutes,
    actualMinutesManual: input.actualMinutesManual ?? 0,
    deadline: input.deadline ?? null,
    branch: input.branch ?? "공통",
    isRecurring: input.isRecurring ?? false,
    recurringRuleId: input.recurringRuleId ?? null,
    recurrenceOccurrenceDate: input.recurrenceOccurrenceDate ?? null,
    outcomeMemo: input.outcomeMemo ?? "",
    longReason: input.longReason ?? "",
    nextEstimateMinutes: input.nextEstimateMinutes ?? null,
    followUp: input.followUp ?? "",
    completedAt: input.completedAt ?? null,
    deletedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

export function sampleData(): Pick<AppData, "tasks" | "checklistItems" | "recurringRules" | "ideas" | "ideaTaskLinks" | "weeklyTargets" | "weeklyMetrics" | "weeklyReports"> {
  const today = todaySeoul();
  const week = weekStartSeoul();
  const tasks = [
    task({ title: "8월 급여자료 정리", category: "RUN", estimatedMinutes: 60, scheduledDate: today, scheduledStart: "13:20", scheduledEnd: "14:20", importance: "긴급", branch: "공통" }),
    task({ title: "설명회 릴스 제작", category: "GROW", estimatedMinutes: 150, scheduledDate: today, scheduledStart: "15:40", scheduledEnd: "18:10", importance: "높음" }),
    task({ title: "월별 학생 수 서식 개선", category: "BUILD", estimatedMinutes: 60, scheduledDate: today, scheduledStart: "18:10", scheduledEnd: "19:00" }),
    task({ title: "인스타 설명회 홍보", category: "GROW", estimatedMinutes: 70, scheduledDate: today, status: "수집됨" }),
    task({ title: "세무사 자료 전달", category: "RUN", estimatedMinutes: 45, scheduledDate: today, status: "확인 대기" })
  ];
  const checklistItems: ChecklistItem[] = [
    { id: uuid(), taskId: tasks[0].id, label: "급여 변동사항 확인", done: false, createdAt: nowIso() },
    { id: uuid(), taskId: tasks[0].id, label: "세무사 전달 파일 정리", done: false, createdAt: nowIso() },
    { id: uuid(), taskId: tasks[1].id, label: "릴스 후킹 문장 3개 작성", done: true, createdAt: nowIso() }
  ];
  const recurringRules: RecurringTaskRule[] = [
    rule("학원·가정 숫자 업데이트", "weekly", "RUN", "월요일마다 학생 수, 매출, 지출, 가정 숫자를 확인합니다."),
    rule("세무·노무·행정 일괄 처리", "weekly", "RUN", "화요일에 반복 유지업무를 몰아서 처리합니다."),
    rule("경영 기여 리포트 작성", "weekly", "BUILD", "금요일 회고와 다음 주 계획을 정리합니다."),
    rule("급여자료 정리", "monthly", "RUN", "매월 급여와 관련 자료를 정리합니다.")
  ];
  const ideas: Idea[] = [
    idea({ title: "가을 신규생 추천 이벤트", category: "IDEA", estimatedMinutes: 20, status: "검토 예정", expectedEffect: "기존 학부모 추천을 자연스럽게 유도" }),
    idea({ title: "카카오채널 설명회 리마인드 자동문구", category: "BUILD", estimatedMinutes: 45, status: "다음에 실행", expectedEffect: "반복 안내 시간 절약" })
  ];
  const weeklyTargets: WeeklyTarget[] = [{ id: uuid(), userId, weekStart: week, runMinutes: 480, growMinutes: 480, buildMinutes: 180, ideaMinutes: 60 }];
  const weeklyMetrics: WeeklyMetric[] = [{ id: uuid(), userId, weekStart: week, inquiries: 2, consultations: 1, eventApplications: 0, newEnrollments: 0, marketingCost: 0, revenue: 0, expectedRevenue: 0, savedMinutes: 30, notes: "" }];
  const weeklyReports: WeeklyReport[] = [{ id: uuid(), userId, weekStart: week, draft: "", updatedAt: nowIso() }];
  return { tasks, checklistItems, recurringRules, ideas, ideaTaskLinks: [], weeklyTargets, weeklyMetrics, weeklyReports };
}

function rule(title: string, frequency: RecurringTaskRule["frequency"], category: RecurringTaskRule["category"], description: string): RecurringTaskRule {
  return {
    id: uuid(),
    userId,
    title,
    description,
    category,
    importance: title.includes("리포트") ? "높음" : "보통",
    branch: "공통",
    frequency,
    interval: 1,
    startDate: todaySeoul(),
    externalDeadlineOffsetDays: 0,
    internalDeadlineOffsetDays: -2,
    checklist: ["필요 자료 확인", "처리 결과 기록"],
    contactMemo: "",
    nextOccurrenceDate: todaySeoul(),
    isActive: true,
    pausedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function idea(input: Partial<Idea> & Pick<Idea, "title" | "category">): Idea {
  return {
    id: uuid(),
    userId,
    title: input.title,
    detail: input.detail ?? "",
    category: input.category,
    estimatedMinutes: input.estimatedMinutes ?? 30,
    expectedEffect: input.expectedEffect ?? "",
    expectedRevenue: input.expectedRevenue ?? 0,
    difficulty: input.difficulty ?? "보통",
    requiredMaterials: input.requiredMaterials ?? "",
    referenceLink: input.referenceLink ?? "",
    createdDate: todaySeoul(),
    reviewDate: input.reviewDate ?? null,
    status: input.status ?? "수집함",
    actualResult: "",
    deletedAt: null
  };
}

export function emptyData(): AppData {
  return {
    tasks: [],
    checklistItems: [],
    sessions: [],
    recurringRules: [],
    ideas: [],
    ideaTaskLinks: [],
    weeklyTargets: [],
    weeklyMetrics: [],
    weeklyReports: [],
    settings: defaultSettings()
  };
}
