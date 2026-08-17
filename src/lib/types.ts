export type TaskCategory = "RUN" | "GROW" | "BUILD" | "IDEA";
export type Branch = "공릉" | "중계" | "공통";
export type TaskStatus = "수집됨" | "이번 주" | "진행 중" | "확인 대기" | "완료";
export type Importance = "긴급" | "높음" | "보통" | "낮음";
export type RecurrenceFrequency = "weekly" | "monthly" | "quarterly" | "halfyearly" | "yearly";
export type IdeaStatus = "수집함" | "검토 예정" | "다음에 실행" | "이번 달 실행" | "진행 중" | "결과 확인" | "보관 또는 폐기";

export interface ChecklistItem {
  id: string;
  userId?: string;
  workspaceId?: string;
  taskId: string;
  label: string;
  done: boolean;
  createdAt: string;
}

export interface Task {
  id: string;
  userId: string;
  workspaceId?: string;
  title: string;
  description: string;
  category: TaskCategory;
  importance: Importance;
  status: TaskStatus;
  scheduledDate: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  estimatedMinutes: number;
  actualMinutesManual: number;
  deadline: string | null;
  branch: Branch;
  isRecurring: boolean;
  recurringRuleId: string | null;
  recurrenceOccurrenceDate: string | null;
  outcomeMemo: string;
  longReason: string;
  nextEstimateMinutes: number | null;
  followUp: string;
  completedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimeSession {
  id: string;
  userId: string;
  workspaceId?: string;
  taskId: string;
  startedAt: string;
  endedAt: string | null;
  note: string;
  deletedAt: string | null;
}

export interface RecurringTaskRule {
  id: string;
  userId: string;
  workspaceId?: string;
  title: string;
  description: string;
  category: TaskCategory;
  importance: Importance;
  branch: Branch;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  externalDeadlineOffsetDays: number;
  internalDeadlineOffsetDays: number;
  checklist: string[];
  contactMemo: string;
  nextOccurrenceDate: string;
  isActive: boolean;
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Idea {
  id: string;
  userId: string;
  workspaceId?: string;
  title: string;
  detail: string;
  category: TaskCategory;
  estimatedMinutes: number;
  expectedEffect: string;
  expectedRevenue: number;
  difficulty: "낮음" | "보통" | "높음";
  requiredMaterials: string;
  referenceLink: string;
  createdDate: string;
  reviewDate: string | null;
  status: IdeaStatus;
  actualResult: string;
  deletedAt: string | null;
}

export interface IdeaTaskLink {
  id: string;
  userId: string;
  workspaceId?: string;
  ideaId: string;
  taskId: string;
  createdAt: string;
}

export interface WeeklyTarget {
  id: string;
  userId: string;
  workspaceId?: string;
  weekStart: string;
  runMinutes: number;
  growMinutes: number;
  buildMinutes: number;
  ideaMinutes: number;
}

export interface WeeklyMetric {
  id: string;
  userId: string;
  workspaceId?: string;
  weekStart: string;
  inquiries: number;
  consultations: number;
  eventApplications: number;
  newEnrollments: number;
  marketingCost: number;
  revenue: number;
  expectedRevenue: number;
  savedMinutes: number;
  notes: string;
}

export interface WeeklyReport {
  id: string;
  userId: string;
  workspaceId?: string;
  weekStart: string;
  draft: string;
  updatedAt: string;
}

export interface UserSettings {
  id: string;
  userId: string;
  timezone: string;
  workStart: string;
  workEnd: string;
  runTargetMinutes: number;
  growTargetMinutes: number;
  buildTargetMinutes: number;
  ideaTargetMinutes: number;
  sampleDataLoaded: boolean;
  activeWorkspaceId?: string;
  activeWorkspaceName?: string;
  workspaceRole?: "owner" | "editor" | "viewer";
  workspaceMembers?: WorkspaceMember[];
}

export interface Workspace {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string | null;
  email: string;
  role: "owner" | "editor" | "viewer";
  createdAt: string;
}

export interface AppData {
  tasks: Task[];
  checklistItems: ChecklistItem[];
  sessions: TimeSession[];
  recurringRules: RecurringTaskRule[];
  ideas: Idea[];
  ideaTaskLinks: IdeaTaskLink[];
  weeklyTargets: WeeklyTarget[];
  weeklyMetrics: WeeklyMetric[];
  weeklyReports: WeeklyReport[];
  settings: UserSettings;
}
