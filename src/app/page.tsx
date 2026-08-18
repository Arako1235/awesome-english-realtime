"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, ChevronDown, ClipboardList, Gauge, Home, Lightbulb, Loader2, Pause, Play, Plus, RefreshCw, Settings, Square, TimerReset, Trash2 } from "lucide-react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { AppData, Idea, IdeaStatus, RecurringTaskRule, Task, TaskCategory, TaskStatus, WeeklyMetric } from "@/lib/types";
import { defaultSettings, emptyData, sampleData } from "@/lib/seed";
import { clearSamples, loadSamples, readLocalData, writeLocalData } from "@/lib/local-db";
import { createSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";
import { addWorkspaceMember, clearRemoteData, readRemoteData, subscribeToUserData, writeRemoteData } from "@/lib/supabase-db";
import { actualMinutes, categoryMeta, generateDueRecurringTasks, getWeeklyMetric, makeReportDraft, runningSession, taskCategories, weeklySummary } from "@/lib/calculations";
import { minutesBetweenClock, nowIso, todaySeoul, weekStartSeoul } from "@/lib/time";

type Tab = "오늘" | "이번 주" | "반복업무" | "아이디어" | "대시보드" | "리포트";

const tabs: { label: Tab; icon: React.ElementType }[] = [
  { label: "오늘", icon: Home },
  { label: "이번 주", icon: CalendarDays },
  { label: "반복업무", icon: RefreshCw },
  { label: "아이디어", icon: Lightbulb },
  { label: "대시보드", icon: Gauge },
  { label: "리포트", icon: ClipboardList }
];

const categoryGuideIntro = "운영을 유지하는 일 = RUN · 매출과 학생을 늘리는 일 = GROW · 반복 업무를 줄이는 시스템 = BUILD · 아직 실행 전인 생각 = IDEA";

const categoryGuides: Record<TaskCategory, { title: string; short: string; detail: string; examples: string[] }> = {
  RUN: {
    title: "RUN · 운영과 유지",
    short: "오늘 하지 않으면 운영에 문제가 생기는 일",
    detail: "오늘 하지 않으면 학원 운영에 문제나 지연이 생기는 일",
    examples: ["학부모 문의·카카오톡 응대", "재원생 공지와 상담", "결석·보강·수업 일정 관리", "교사 근태·급여 관리", "캠프 준비와 현장 운영", "환불·세금·시설 문제 처리"]
  },
  GROW: {
    title: "GROW · 매출과 성장",
    short: "문의·등록·재등록·매출을 늘리기 위한 일",
    detail: "문의·상담·등록·재등록·매출을 늘리기 위해 실행하는 일",
    examples: ["인스타 릴스·피드 제작과 게시", "블로그·당근·카카오채널 홍보", "메타 광고 운영", "학부모 설명회 모집과 진행", "신규생·소개 이벤트", "상담 후 등록 유도", "재등록률 향상 캠페인"]
  },
  BUILD: {
    title: "BUILD · 시스템화",
    short: "앞으로 반복되는 시간과 비용을 줄이는 일",
    detail: "한 번 만들어 다음부터 시간·비용·실수를 줄이는 일",
    examples: ["업무관리 앱 제작과 개선", "교사 KPI·ROI 대시보드 구축", "상담 매뉴얼과 스크립트 제작", "반복 공지 템플릿 제작", "캠프 운영 체크리스트 제작", "급여·재등록률 자동 계산", "신규교사 온보딩 매뉴얼 제작"]
  },
  IDEA: {
    title: "IDEA · 실행 전 아이디어",
    short: "아직 실행하지 않고 수집·검토 중인 생각",
    detail: "아직 실행하지 않고 수집·검토·보관하는 생각",
    examples: ["새로운 캠프 테마", "릴스 후킹 문구 아이디어", "신규생 이벤트 구상", "설명회 주제", "새로운 학생 리워드 제도", "신규 프로그램 아이디어"]
  }
};

const emptyTask = (date = todaySeoul()): Task => ({
  id: uuid(),
  userId: "local-user",
  title: "",
  description: "",
  category: "RUN",
  importance: "보통",
  status: "이번 주",
  scheduledDate: date,
  scheduledStart: null,
  scheduledEnd: null,
  estimatedMinutes: 30,
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
  createdAt: nowIso(),
  updatedAt: nowIso()
});

function clockLabel(value: string | null) {
  return value?.slice(0, 5) || "--:--";
}

export default function AppPage() {
  const [tab, setTab] = useState<Tab>("오늘");
  const [data, setData] = useState<AppData>(emptyData());
  const [loading, setLoading] = useState(true);
  const [taskDraft, setTaskDraft] = useState<Task>(() => emptyTask());
  const [quickIdea, setQuickIdea] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [nowTick, setNowTick] = useState(new Date());
  const [supabase] = useState<SupabaseClient | null>(() => hasSupabaseEnv() ? createSupabaseBrowserClient() : null);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    if (!supabase) {
      readLocalData().then((loaded) => {
        setData(loaded);
        setLoading(false);
      });
      return;
    }

    supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session?.user.id) return;
    const client = supabase;
    let alive = true;
    async function refreshRemote() {
      try {
        setSyncError("");
        const loaded = await readRemoteData(client, session!.user);
        if (alive) setData(loaded);
      } catch (error) {
        if (alive) setSyncError(error instanceof Error ? error.message : "Supabase 동기화 중 오류가 발생했습니다.");
      }
    }
    void refreshRemote();
    let unsubscribe = () => {};
    void readRemoteData(client, session.user).then((loaded) => {
      if (alive && loaded.settings.activeWorkspaceId) {
        unsubscribe = subscribeToUserData(client, loaded.settings.activeWorkspaceId, () => void refreshRemote());
      }
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [supabase, session]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  async function persist(next: AppData) {
    const generated = generateDueRecurringTasks(next);
    setData(generated);
    try {
      setSyncError("");
      if (supabase && session?.user.id) await writeRemoteData(supabase, generated);
      else await writeLocalData(generated);
      return true;
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
      return false;
    }
  }

  const today = todaySeoul(nowTick);
  const weekStart = weekStartSeoul(nowTick);
  const week = useMemo(() => weeklySummary(data, weekStart, nowTick), [data, weekStart, nowTick]);
  const current = runningSession(data.sessions);
  const currentTask = current ? (data.tasks.find((task) => task.id === current.taskId) ?? null) : null;
  const metric = getWeeklyMetric(data, weekStart);

  async function saveTask(task: Task) {
    if (!task.title.trim()) return false;
    const normalized = { ...task, userId: session?.user.id ?? task.userId, workspaceId: data.settings.activeWorkspaceId, estimatedMinutes: task.estimatedMinutes || minutesBetweenClock(task.scheduledStart, task.scheduledEnd) || 30, updatedAt: nowIso() };
    const exists = data.tasks.some((item) => item.id === normalized.id);
    const saved = await persist({ ...data, tasks: exists ? data.tasks.map((item) => item.id === normalized.id ? normalized : item) : [...data.tasks, normalized] });
    if (saved) {
      setTaskDraft(emptyTask(today));
      setEditingId(null);
    }
    return saved;
  }

  async function patchTask(id: string, patch: Partial<Task>) {
    await persist({ ...data, tasks: data.tasks.map((task) => task.id === id ? { ...task, ...patch, updatedAt: nowIso() } : task) });
  }

  async function softDeleteTask(id: string) {
    if (!window.confirm("이 업무를 삭제할까요? 기록은 복구 가능한 삭제 상태로 보관됩니다.")) return;
    await patchTask(id, { deletedAt: nowIso() });
  }

  async function startTimer(taskId: string) {
    if (current && current.taskId !== taskId && !window.confirm("다른 업무 타이머가 실행 중입니다. 기존 타이머를 멈추고 새 업무를 시작할까요?")) return;
    const sessions = data.sessions.map((session) => !session.endedAt && !session.deletedAt ? { ...session, endedAt: nowIso() } : session);
    await persist({
      ...data,
      sessions: [...sessions, { id: uuid(), userId: data.settings.userId, taskId, startedAt: nowIso(), endedAt: null, note: "", deletedAt: null }],
      tasks: data.tasks.map((task) => task.id === taskId ? { ...task, status: "진행 중", updatedAt: nowIso() } : task)
    });
  }

  async function pauseTimer() {
    await persist({ ...data, sessions: data.sessions.map((session) => !session.endedAt && !session.deletedAt ? { ...session, endedAt: nowIso() } : session) });
  }

  async function stopTask(task: Task) {
    await persist({
      ...data,
      sessions: data.sessions.map((session) => session.taskId === task.id && !session.endedAt && !session.deletedAt ? { ...session, endedAt: nowIso() } : session),
      tasks: data.tasks.map((item) => item.id === task.id ? { ...item, status: "완료", completedAt: nowIso(), updatedAt: nowIso() } : item)
    });
  }

  async function quickSaveIdea() {
    if (!quickIdea.trim()) return;
    const idea: Idea = {
      id: uuid(),
      userId: session?.user.id ?? data.settings.userId,
      workspaceId: data.settings.activeWorkspaceId,
      title: quickIdea.trim(),
      detail: "",
      category: "IDEA",
      estimatedMinutes: 30,
      expectedEffect: "",
      expectedRevenue: 0,
      difficulty: "보통",
      requiredMaterials: "",
      referenceLink: "",
      createdDate: today,
      reviewDate: null,
      status: "수집함",
      actualResult: "",
      deletedAt: null
    };
    await persist({ ...data, ideas: [...data.ideas, idea] });
    setQuickIdea("");
  }

  async function convertIdea(idea: Idea) {
    const task = { ...emptyTask(today), userId: session?.user.id ?? data.settings.userId, workspaceId: data.settings.activeWorkspaceId, title: idea.title, description: idea.detail, category: idea.category, estimatedMinutes: idea.estimatedMinutes, importance: "높음" as const };
    await persist({
      ...data,
      tasks: [...data.tasks, task],
      ideas: data.ideas.map((item) => item.id === idea.id ? { ...item, status: "진행 중" } : item),
      ideaTaskLinks: [...data.ideaTaskLinks, { id: uuid(), userId: session?.user.id ?? data.settings.userId, workspaceId: data.settings.activeWorkspaceId, ideaId: idea.id, taskId: task.id, createdAt: nowIso() }]
    });
    setTab("오늘");
  }

  async function updateMetric(patch: Partial<WeeklyMetric>) {
    const next = { ...metric, ...patch };
    return persist({ ...data, weeklyMetrics: data.weeklyMetrics.some((item) => item.weekStart === weekStart) ? data.weeklyMetrics.map((item) => item.weekStart === weekStart ? next : item) : [...data.weeklyMetrics, next] });
  }

  async function saveReport(draft: string) {
    const existing = data.weeklyReports.find((report) => report.weekStart === weekStart);
    const report = existing ? { ...existing, draft, updatedAt: nowIso() } : { id: uuid(), userId: data.settings.userId, weekStart, draft, updatedAt: nowIso() };
    await persist({ ...data, weeklyReports: existing ? data.weeklyReports.map((item) => item.id === report.id ? report : item) : [...data.weeklyReports, report] });
  }

  async function sendMagicLink() {
    if (!supabase || !authEmail.trim()) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: window.location.origin }
    });
    setAuthMessage(error ? error.message : "로그인 메일을 보냈습니다. 링크가 다른 브라우저에서 열리면 메일의 6자리 코드를 아래에 입력하세요.");
  }

  async function verifyEmailCode() {
    if (!supabase || !authEmail.trim() || !authCode.trim()) return;
    const { data: verified, error } = await supabase.auth.verifyOtp({
      email: authEmail.trim(),
      token: authCode.trim(),
      type: "email"
    });
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    setSession(verified.session);
    setAuthCode("");
    setAuthMessage("로그인되었습니다.");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setData(emptyData());
  }

  async function loadSamplesForCurrentMode() {
    if (supabase && session?.user.id) {
      const workspaceId = data.settings.activeWorkspaceId;
      if (!workspaceId) throw new Error("공유 작업공간을 찾을 수 없습니다.");
      const next = ownedSampleData(session.user.id, workspaceId, data.settings);
      await clearRemoteData(supabase, workspaceId);
      await persist(next);
      return;
    }
    await loadSamples();
    setData(await readLocalData());
  }

  async function clearSamplesForCurrentMode() {
    if (supabase && session?.user.id) {
      const workspaceId = data.settings.activeWorkspaceId;
      if (!workspaceId) throw new Error("공유 작업공간을 찾을 수 없습니다.");
      await clearRemoteData(supabase, workspaceId);
      const settings = { ...defaultSettings(), id: crypto.randomUUID(), userId: session.user.id, activeWorkspaceId: workspaceId, activeWorkspaceName: data.settings.activeWorkspaceName, workspaceRole: data.settings.workspaceRole, workspaceMembers: data.settings.workspaceMembers, sampleDataLoaded: false };
      await persist({ ...emptyData(), settings });
      return;
    }
    await clearSamples();
    setData(await readLocalData());
  }

  if (loading) return <main className="grid min-h-screen place-items-center"><Loader2 className="animate-spin" aria-label="로딩 중" /></main>;
  if (supabase && !session) return <LoginView email={authEmail} setEmail={setAuthEmail} code={authCode} setCode={setAuthCode} sendMagicLink={sendMagicLink} verifyEmailCode={verifyEmailCode} message={authMessage} />;

  return (
    <main className="min-h-screen overflow-x-hidden pb-24 lg:pb-0">
      <aside className="fixed left-0 top-0 hidden h-screen w-64 border-r border-black/10 bg-white/70 p-5 backdrop-blur lg:block">
        <Header setShowSettings={setShowSettings} />
        <Nav tab={tab} setTab={setTab} vertical />
      </aside>
      <section className="mx-auto max-w-7xl px-4 py-5 lg:ml-64 lg:px-8">
        <div className="mb-5 flex items-center justify-between lg:hidden">
          <Header setShowSettings={setShowSettings} />
        </div>
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {supabase ? `실시간 동기화 모드입니다. ${session?.user.email ?? "로그인 계정"}으로 저장된 데이터가 집 웹과 PC에 함께 반영됩니다.` : "Supabase 환경변수가 없어서 로컬 데모 모드로 실행 중입니다. 배포 전 .env.local을 설정하면 실시간 동기화 모드가 켜집니다."}
        </div>
        {syncError && <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{syncError}</div>}
        {tab === "오늘" && <TodayView today={today} data={data} taskDraft={taskDraft} setTaskDraft={setTaskDraft} saveTask={saveTask} patchTask={patchTask} softDeleteTask={softDeleteTask} startTimer={startTimer} pauseTimer={pauseTimer} stopTask={stopTask} currentTask={currentTask} current={current} quickIdea={quickIdea} setQuickIdea={setQuickIdea} quickSaveIdea={quickSaveIdea} editingId={editingId} setEditingId={setEditingId} />}
        {tab === "이번 주" && <WeekView data={data} week={week} />}
        {tab === "반복업무" && <RecurringView data={data} persist={persist} />}
        {tab === "아이디어" && <IdeasView data={data} persist={persist} convertIdea={convertIdea} />}
        {tab === "대시보드" && <DashboardView week={week} metric={metric} updateMetric={updateMetric} />}
        {tab === "리포트" && <ReportView key={weekStart} data={data} weekStart={weekStart} saveReport={saveReport} />}
      </section>
      <nav className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-6 border-t border-black/10 bg-white/90 p-1 backdrop-blur lg:hidden">
        {tabs.map(({ label, icon: Icon }) => <button key={label} onClick={() => setTab(label)} className={`focus-ring rounded-md px-1 py-2 text-[11px] ${tab === label ? "bg-ink text-white" : "text-stone-700"}`}><Icon className="mx-auto mb-1 h-5 w-5" aria-hidden />{label}</button>)}
      </nav>
      {showSettings && <SettingsDialog data={data} persist={persist} close={() => setShowSettings(false)} signOut={supabase ? signOut : undefined} inviteAction={supabase ? async (email) => {
        if (!data.settings.activeWorkspaceId) throw new Error("공유 작업공간을 찾을 수 없습니다.");
        await addWorkspaceMember(supabase, data.settings.activeWorkspaceId, email, "editor");
        if (session?.user) setData(await readRemoteData(supabase, session.user));
      } : undefined} loadSamplesAction={loadSamplesForCurrentMode} clearSamplesAction={clearSamplesForCurrentMode} />}
    </main>
  );
}

function ownedSampleData(userId: string, workspaceId: string, currentSettings: AppData["settings"]): AppData {
  const samples = sampleData();
  return {
    ...emptyData(),
    ...samples,
    tasks: samples.tasks.map((row) => ({ ...row, userId, workspaceId })),
    sessions: [],
    checklistItems: samples.checklistItems.map((row) => ({ ...row, userId, workspaceId })),
    recurringRules: samples.recurringRules.map((row) => ({ ...row, userId, workspaceId })),
    ideas: samples.ideas.map((row) => ({ ...row, userId, workspaceId })),
    ideaTaskLinks: samples.ideaTaskLinks.map((row) => ({ ...row, userId, workspaceId })),
    weeklyTargets: samples.weeklyTargets.map((row) => ({ ...row, userId, workspaceId })),
    weeklyMetrics: samples.weeklyMetrics.map((row) => ({ ...row, userId, workspaceId })),
    weeklyReports: samples.weeklyReports.map((row) => ({ ...row, userId, workspaceId })),
    settings: { ...defaultSettings(), ...currentSettings, id: currentSettings.id || crypto.randomUUID(), userId, sampleDataLoaded: true }
  };
}

function LoginView({ email, setEmail, code, setCode, sendMagicLink, verifyEmailCode, message }: { email: string; setEmail: (value: string) => void; code: string; setCode: (value: string) => void; sendMagicLink: () => void; verifyEmailCode: () => void; message: string }) {
  return <main className="grid min-h-screen place-items-center px-4">
    <section className="w-full max-w-md rounded-lg border border-black/10 bg-white/80 p-6 shadow-soft">
      <h1 className="text-2xl font-bold">Awesome English</h1>
      <p className="mt-2 text-stone-600">이메일로 로그인하면 집 웹과 PC에서 같은 업무 데이터가 실시간으로 동기화됩니다.</p>
      <div className="mt-6 grid gap-3">
        <input type="email" aria-label="로그인 이메일" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="field" />
        <button onClick={sendMagicLink} className="focus-ring rounded-md bg-ink px-4 py-3 font-semibold text-white">로그인 링크 받기</button>
        <div className="grid gap-2 border-t border-black/10 pt-3">
          <input inputMode="numeric" aria-label="이메일 로그인 코드" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6자리 코드" className="field text-center text-lg font-semibold tracking-[0.3em]" />
          <button onClick={verifyEmailCode} className="focus-ring rounded-md border border-black/10 bg-white px-4 py-3 font-semibold">코드로 로그인</button>
        </div>
      </div>
      {message && <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
    </section>
  </main>;
}

function Header({ setShowSettings }: { setShowSettings: (value: boolean) => void }) {
  return <div className="flex w-full items-center justify-between gap-3"><div><h1 className="text-xl font-bold">Awesome English</h1><p className="text-sm text-stone-600">업무 시간과 경영 기여 관리</p></div><button aria-label="설정" onClick={() => setShowSettings(true)} className="focus-ring rounded-md border border-black/10 bg-white p-3"><Settings className="h-5 w-5" /></button></div>;
}

function Nav({ tab, setTab, vertical = false }: { tab: Tab; setTab: (tab: Tab) => void; vertical?: boolean }) {
  return <nav className={`${vertical ? "mt-8 grid gap-2" : "flex"}`}>{tabs.map(({ label, icon: Icon }) => <button key={label} onClick={() => setTab(label)} className={`focus-ring flex items-center gap-3 rounded-md px-3 py-3 text-sm ${tab === label ? "bg-ink text-white" : "hover:bg-white"}`}><Icon className="h-5 w-5" aria-hidden />{label}</button>)}</nav>;
}

function TodayView(props: {
  today: string; data: AppData; taskDraft: Task; setTaskDraft: (task: Task) => void; saveTask: (task: Task) => Promise<boolean>; patchTask: (id: string, patch: Partial<Task>) => void; softDeleteTask: (id: string) => void; startTimer: (taskId: string) => void; pauseTimer: () => void; stopTask: (task: Task) => void; currentTask: Task | null; current: unknown; quickIdea: string; setQuickIdea: (value: string) => void; quickSaveIdea: () => void; editingId: string | null; setEditingId: (id: string | null) => void;
}) {
  const tasks = props.data.tasks.filter((task) => !task.deletedAt && task.scheduledDate === props.today);
  const planned = tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  const actual = tasks.reduce((sum, task) => sum + actualMinutes(task, props.data.sessions), 0);
  const core = tasks.filter((task) => task.importance === "긴급" || task.importance === "높음").slice(0, 2);
  const totals = Object.entries(categoryMeta).map(([cat, meta]) => ({ name: cat, label: meta.label, value: tasks.filter((task) => task.category === cat).reduce((sum, task) => sum + actualMinutes(task, props.data.sessions), 0), color: meta.color }));
  return <div className="grid gap-5">
    <Title title="오늘" subtitle={`${props.today} · 핵심업무 ${core.map((task) => task.title).join(", ") || "아직 없음"}`} />
    <div className="grid gap-3 md:grid-cols-4">
      <Stat label="총 계획시간" value={`${planned}분`} />
      <Stat label="실제 사용시간" value={`${actual}분`} />
      <Stat label="남은 근무 가능시간" value={`${Math.max(0, 360 - actual)}분`} />
      <Stat label="현재 진행" value={props.currentTask?.title ?? "없음"} />
    </div>
    <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <Panel title="13:00~19:00 시간표">
        <div className="grid gap-2">
          {tasks.sort((a, b) => (a.scheduledStart ?? "99").localeCompare(b.scheduledStart ?? "99")).map((task) => <TaskRow key={task.id} task={task} {...props} />)}
          {!tasks.length && <Empty text="오늘 일정이 비어 있습니다. 오른쪽에서 업무를 추가해보세요." />}
        </div>
      </Panel>
      <Panel title="업무 추가">
        <TaskForm task={props.taskDraft} setTask={props.setTaskDraft} onSave={() => props.saveTask(props.taskDraft)} />
      </Panel>
    </section>
    <section className="grid gap-5 lg:grid-cols-2">
      <Panel title="오늘의 시간배분">
        <ChartBox><ResponsiveContainer><PieChart><Pie data={totals} dataKey="value" nameKey="label" innerRadius={48}>{totals.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></ChartBox>
      </Panel>
      <Panel title="아이디어 빠른 저장">
        <div className="flex gap-2"><input aria-label="아이디어 제목" value={props.quickIdea} onChange={(event) => props.setQuickIdea(event.target.value)} placeholder="제목만 적어도 저장됩니다" className="focus-ring min-w-0 flex-1 rounded-md border border-black/10 bg-white px-3 py-3" /><button onClick={props.quickSaveIdea} className="focus-ring rounded-md bg-idea px-4 py-3 font-semibold text-white"><Plus className="h-5 w-5" aria-hidden /></button></div>
      </Panel>
    </section>
  </div>;
}

function TaskRow({ task, data, patchTask, softDeleteTask, startTimer, pauseTimer, stopTask, currentTask, setTaskDraft, setEditingId }: { task: Task; data: AppData; patchTask: (id: string, patch: Partial<Task>) => void; softDeleteTask: (id: string) => void; startTimer: (taskId: string) => void; pauseTimer: () => void; stopTask: (task: Task) => void; currentTask: Task | null; setTaskDraft: (task: Task) => void; setEditingId: (id: string | null) => void }) {
  const meta = categoryMeta[task.category];
  const actual = actualMinutes(task, data.sessions);
  const overMinutes = Math.max(0, actual - task.estimatedMinutes);
  const isComplete = task.status === "완료";
  return <div draggable onDragEnd={(event) => { const h = Math.max(13, Math.min(18, 13 + Math.round(event.clientY / 160))); patchTask(task.id, { scheduledStart: `${String(h).padStart(2, "0")}:00`, scheduledEnd: `${String(h + 1).padStart(2, "0")}:00` }); }} className={`rounded-lg border p-3 shadow-soft ${isComplete ? "border-emerald-200 bg-emerald-50/90" : "border-black/10 bg-white"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded px-2 py-1 text-xs font-bold text-white" style={{ background: meta.color }}>{task.category}</span><strong className="min-w-0 break-words">{task.title}</strong><span className="whitespace-nowrap text-sm text-stone-500">{clockLabel(task.scheduledStart)}~{clockLabel(task.scheduledEnd)}</span>{isComplete && <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">완료</span>}</div><p className="mt-1 text-sm text-stone-600">{task.branch} · {task.importance} · 계획 {task.estimatedMinutes}분 / 실제 {actual}분 {overMinutes > 0 && <span className="font-bold text-rose-600"> · {overMinutes}분 초과</span>}</p></div>
      <div className="flex gap-1">
        {currentTask?.id === task.id ? <button aria-label="일시정지" onClick={pauseTimer} className="icon-btn"><Pause /></button> : <button aria-label="시작" onClick={() => startTimer(task.id)} className="icon-btn"><Play /></button>}
        <button aria-label="완료" onClick={() => stopTask(task)} className="icon-btn"><Square /></button>
        <button aria-label="수정" onClick={() => { setTaskDraft(task); setEditingId(task.id); }} className="icon-btn"><TimerReset /></button>
        <button aria-label="삭제" onClick={() => softDeleteTask(task.id)} className="icon-btn"><Trash2 /></button>
      </div>
    </div>
    {task.status === "완료" && <textarea aria-label="업무 완료 기록" value={task.outcomeMemo} onChange={(event) => patchTask(task.id, { outcomeMemo: event.target.value })} placeholder="결과, 오래 걸린 이유, 후속업무를 기록하세요" className="focus-ring mt-3 w-full rounded-md border border-black/10 p-2 text-sm" />}
  </div>;
}

function TaskForm({ task, setTask, onSave }: { task: Task; setTask: (task: Task) => void; onSave: () => Promise<boolean> }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function handleSave() {
    if (!task.title.trim()) {
      setMessage("업무명을 입력해주세요.");
      return;
    }
    setSaving(true);
    const saved = await onSave();
    setSaving(false);
    setMessage(saved ? "업무가 저장되었습니다." : "저장하지 못했습니다. 다시 시도해주세요.");
    if (saved) setDetailsOpen(false);
  }
  return <div className="grid gap-3">
    <input aria-label="업무명" value={task.title} onChange={(event) => setTask({ ...task, title: event.target.value })} placeholder="업무명" className="field" />
    <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
      <Select label="분류" value={task.category} values={taskCategories} onChange={(value) => setTask({ ...task, category: value as TaskCategory })} />
      <input type="number" min={1} aria-label="예상시간(분)" value={task.estimatedMinutes} onChange={(event) => setTask({ ...task, estimatedMinutes: Number(event.target.value) || 30 })} placeholder="예상시간(분)" className="field" />
    </div>
    <CategoryGuide category={task.category} open={guideOpen} setOpen={setGuideOpen} />
    <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="focus-ring flex items-center justify-between rounded-md border border-black/10 bg-white px-3 py-3 text-sm font-semibold text-stone-700">
      상세 설정
      <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} aria-hidden />
    </button>
    {detailsOpen && <div className="grid gap-3 rounded-md border border-black/10 bg-stone-50 p-3">
      <textarea aria-label="업무 설명 및 체크리스트" value={task.description} onChange={(event) => setTask({ ...task, description: event.target.value })} placeholder="업무 설명 및 체크리스트" className="field min-h-20" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Select label="중요도" value={task.importance} values={["긴급", "높음", "보통", "낮음"]} onChange={(value) => setTask({ ...task, importance: value as Task["importance"] })} />
        <LabeledInput label="업무 예정일" help="이 업무를 실행할 날짜">
          <input type="date" aria-label="업무 예정일" value={task.scheduledDate} onChange={(event) => setTask({ ...task, scheduledDate: event.target.value })} className="field" />
        </LabeledInput>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Select label="상태" value={task.status} values={["수집됨", "이번 주", "진행 중", "확인 대기", "완료"]} onChange={(value) => setTask({ ...task, status: value as TaskStatus })} />
        <LabeledInput label="시작 시간">
          <input type="time" aria-label="시작 시간" value={clockLabel(task.scheduledStart) === "--:--" ? "" : clockLabel(task.scheduledStart)} onChange={(event) => setTask({ ...task, scheduledStart: event.target.value || null })} className="field time-field" />
        </LabeledInput>
        <LabeledInput label="종료 시간">
          <input type="time" aria-label="종료 시간" value={clockLabel(task.scheduledEnd) === "--:--" ? "" : clockLabel(task.scheduledEnd)} onChange={(event) => setTask({ ...task, scheduledEnd: event.target.value || null })} className="field time-field" />
        </LabeledInput>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <LabeledInput label="최종 마감일 (선택)" help="늦어도 완료해야 하는 날짜">
          <input type="date" aria-label="최종 마감일" value={task.deadline ?? ""} onChange={(event) => setTask({ ...task, deadline: event.target.value || null })} className="field" />
        </LabeledInput>
        <Select label="브랜치" value={task.branch} values={["공릉", "중계", "공통"]} onChange={(value) => setTask({ ...task, branch: value as Task["branch"] })} />
      </div>
      <textarea aria-label="성과 또는 메모" value={task.outcomeMemo} onChange={(event) => setTask({ ...task, outcomeMemo: event.target.value })} placeholder="성과 또는 메모" className="field" />
    </div>}
    <button onClick={handleSave} disabled={saving} className="focus-ring rounded-md bg-ink px-4 py-3 font-semibold text-white disabled:opacity-60">{saving ? "저장 중..." : "저장"}</button>
    {message && <p className={`rounded-md px-3 py-2 text-sm ${message.includes("저장되었습니다") ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{message}</p>}
  </div>;
}

function LabeledInput({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return <label className="grid min-w-0 gap-1 text-xs font-semibold text-stone-700">
    <span>{label}</span>
    {help && <span className="text-[11px] font-normal leading-relaxed text-stone-500">{help}</span>}
    {children}
  </label>;
}

function CategoryGuide({ category, open, setOpen }: { category: TaskCategory; open: boolean; setOpen: (value: boolean) => void }) {
  const selected = categoryGuides[category];
  return <div className="grid gap-2 rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-600">
    <p className="leading-relaxed">{categoryGuideIntro}</p>
    <p className="rounded-md bg-white/80 px-3 py-2 text-xs font-semibold text-stone-700">{category}: {selected.short}</p>
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setOpen(!open);
        }
      }}
      className="focus-ring flex w-fit items-center gap-1 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
    >
      분류가 헷갈리나요? 예시 보기
      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
    </button>
    {open && <div className="grid gap-2 rounded-md border border-black/10 bg-white p-3 md:grid-cols-2">
      {taskCategories.map((item) => {
        const guide = categoryGuides[item];
        return <section key={item} className={`rounded-md border p-3 ${item === category ? "border-black/20 bg-stone-50" : "border-black/10 bg-white"}`}>
          <h4 className="text-sm font-bold text-stone-800">{guide.title}</h4>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">{guide.detail}</p>
          <p className="mt-3 text-xs font-semibold text-stone-700">예시</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-stone-600">
            {guide.examples.map((example) => <li key={example}>{example}</li>)}
          </ul>
        </section>;
      })}
      <p className="rounded-md bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-900 md:col-span-2">아이디어를 실제로 실행하기 시작하면 IDEA가 아닙니다. 매출 목적이면 GROW, 시스템화 목적이면 BUILD로 변경하세요.</p>
    </div>}
  </div>;
}

function WeekView({ data, week }: { data: AppData; week: ReturnType<typeof weeklySummary> }) {
  return <div className="grid gap-5"><Title title="이번 주" subtitle="계획시간, 실제시간, 분류별 균형을 확인합니다" />{week.warnings.map((warning) => <div key={warning} className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">{warning}</div>)}<div className="grid gap-3 md:grid-cols-4">{Object.entries(categoryMeta).map(([cat, meta]) => <Stat key={cat} label={`${cat} ${meta.label}`} value={`${week.totals[cat as TaskCategory].actual}/${week.targetMap[cat as TaskCategory]}분`} />)}</div><Panel title="예상보다 오래 걸린 업무">{week.overEstimate.length ? week.overEstimate.map(({ task, diff }) => <p key={task.id} className="border-b border-black/10 py-2">{task.title} · {diff}분 초과</p>) : <Empty text="큰 초과 업무가 없습니다." />}</Panel><Panel title="업무 목록">{week.tasks.map((task) => <p key={task.id} className="border-b border-black/10 py-2">{task.scheduledDate} · {task.category} · {task.title} · {task.status} · 실제 {actualMinutes(task, data.sessions)}분</p>)}</Panel></div>;
}

function RecurringView({ data, persist }: { data: AppData; persist: (data: AppData) => Promise<boolean> }) {
  async function addRule() {
    const rule: RecurringTaskRule = { id: uuid(), userId: data.settings.userId, title: "새 반복업무", description: "", category: "RUN", importance: "보통", branch: "공통", frequency: "weekly", interval: 1, startDate: todaySeoul(), externalDeadlineOffsetDays: 0, internalDeadlineOffsetDays: -2, checklist: ["필요 자료 확인"], contactMemo: "", nextOccurrenceDate: todaySeoul(), isActive: true, pausedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
    await persist({ ...data, recurringRules: [...data.recurringRules, rule] });
  }
  return <div className="grid gap-5"><Title title="반복업무" subtitle="앱 실행 시 누락된 반복업무를 자동 생성하고 중복을 막습니다" /><button onClick={addRule} className="focus-ring w-fit rounded-md bg-ink px-4 py-3 font-semibold text-white">반복업무 추가</button><div className="grid gap-3">{data.recurringRules.map((rule) => <Panel key={rule.id} title={rule.title}><div className="grid gap-2 md:grid-cols-4"><input className="field" value={rule.title} onChange={(e) => persist({ ...data, recurringRules: data.recurringRules.map((r) => r.id === rule.id ? { ...r, title: e.target.value } : r) })} /><Select label="주기" value={rule.frequency} values={["weekly", "monthly", "quarterly", "halfyearly", "yearly"]} onChange={(value) => persist({ ...data, recurringRules: data.recurringRules.map((r) => r.id === rule.id ? { ...r, frequency: value as RecurringTaskRule["frequency"] } : r) })} /><input type="date" className="field" value={rule.nextOccurrenceDate} onChange={(e) => persist({ ...data, recurringRules: data.recurringRules.map((r) => r.id === rule.id ? { ...r, nextOccurrenceDate: e.target.value } : r) })} /><button className="field" onClick={() => persist({ ...data, recurringRules: data.recurringRules.map((r) => r.id === rule.id ? { ...r, isActive: !r.isActive, pausedAt: r.isActive ? nowIso() : null } : r) })}>{rule.isActive ? "활성" : "일시정지"}</button></div><p className="mt-2 text-sm text-stone-600">체크리스트: {rule.checklist.join(", ")} · 담당/기관 메모: {rule.contactMemo || "없음"}</p></Panel>)}</div></div>;
}

function IdeasView({ data, persist, convertIdea }: { data: AppData; persist: (data: AppData) => Promise<boolean>; convertIdea: (idea: Idea) => Promise<void> }) {
  const statuses: IdeaStatus[] = ["수집함", "검토 예정", "다음에 실행", "이번 달 실행", "진행 중", "결과 확인", "보관 또는 폐기"];
  const activeCount = data.ideas.filter((idea) => idea.status === "이번 달 실행" || idea.status === "진행 중").length;
  return <div className="grid gap-5"><Title title="아이디어" subtitle="보관은 넓게, 실행은 한 번에 하나만" />{activeCount > 1 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">이번 달 실행/진행 중 아이디어가 {activeCount}개입니다. 핵심 아이디어는 1개만 적극 실행하는 것을 권장합니다.</div>}<div className="grid gap-3 xl:grid-cols-7">{statuses.map((status) => <div key={status} className="min-h-44 rounded-lg border border-black/10 bg-white/70 p-3"><h3 className="mb-3 text-sm font-bold">{status}</h3>{data.ideas.filter((idea) => !idea.deletedAt && idea.status === status).map((idea) => <div key={idea.id} className="mb-2 rounded-md bg-white p-3 shadow-soft"><input value={idea.title} onChange={(e) => persist({ ...data, ideas: data.ideas.map((item) => item.id === idea.id ? { ...item, title: e.target.value } : item) })} className="w-full font-semibold outline-none" /><textarea value={idea.detail} onChange={(e) => persist({ ...data, ideas: data.ideas.map((item) => item.id === idea.id ? { ...item, detail: e.target.value } : item) })} placeholder="상세내용" className="mt-2 w-full rounded border border-black/10 p-2 text-sm" /><div className="mt-2 grid grid-cols-2 gap-1"><select value={idea.status} onChange={(e) => persist({ ...data, ideas: data.ideas.map((item) => item.id === idea.id ? { ...item, status: e.target.value as IdeaStatus } : item) })} className="field text-xs">{statuses.map((s) => <option key={s}>{s}</option>)}</select><button onClick={() => convertIdea(idea)} className="rounded-md bg-grow px-2 py-2 text-xs font-semibold text-white">업무 전환</button></div></div>)}</div>)}</div></div>;
}

function DashboardView({ week, metric, updateMetric }: { week: ReturnType<typeof weeklySummary>; metric: WeeklyMetric; updateMetric: (patch: Partial<WeeklyMetric>) => Promise<boolean> }) {
  const [metricPatch, setMetricPatch] = useState<Partial<WeeklyMetric>>({});
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const saveTimer = useRef<number | null>(null);
  const patchRef = useRef<Partial<WeeklyMetric>>({});
  const draftMetric = { ...metric, ...metricPatch };
  const barData = Object.entries(categoryMeta).map(([cat, meta]) => ({ name: cat, 목표: week.targetMap[cat as TaskCategory], 실제: week.totals[cat as TaskCategory].actual, fill: meta.color }));
  const daily = ["월", "화", "수", "목", "금", "토", "일"].map((day, i) => ({ day, minutes: week.tasks.filter((task) => new Date(task.scheduledDate).getDay() === (i + 1) % 7).reduce((sum, task) => sum + task.estimatedMinutes, 0) }));
  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
  }, []);
  function scheduleMetricSave(patch: Partial<WeeklyMetric>) {
    const nextPatch = { ...patchRef.current, ...patch };
    const nextMetric = { ...metric, ...nextPatch };
    patchRef.current = nextPatch;
    setMetricPatch(nextPatch);
    setSaveState("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const saved = await updateMetric(nextMetric);
      if (saved) {
        patchRef.current = {};
        setMetricPatch({});
      }
      setSaveState(saved ? "saved" : "error");
    }, 700);
  }
  const statusText = saveState === "saving" ? "저장 중..." : saveState === "error" ? "저장하지 못했습니다. 다시 시도해주세요." : "자동 저장됨";
  return <div className="grid gap-5"><Title title="대시보드" subtitle="이번 주 경영 숫자와 시간 사용을 함께 봅니다" /><div className="grid gap-3 md:grid-cols-4"><Stat label="총 실제 업무시간" value={`${week.actual}분`} /><Stat label="완료 업무" value={`${week.completedCount}개`} /><Stat label="반복업무 완료율" value={`${week.recurringDue ? Math.round(week.recurringDone / week.recurringDue * 100) : 0}%`} /><Stat label="절약한 예상시간" value={`${draftMetric.savedMinutes}분`} /></div><Panel title="성과 숫자 입력"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-stone-600">이번 주 성과 숫자</span><span className={`rounded px-2 py-1 text-xs font-semibold ${saveState === "error" ? "bg-rose-50 text-rose-700" : "bg-stone-100 text-stone-600"}`}>{statusText}</span></div><div className="grid gap-2 md:grid-cols-4">{(["inquiries","consultations","eventApplications","newEnrollments","marketingCost","revenue","expectedRevenue","savedMinutes"] as const).map((key) => <label key={key} className="text-sm">{labelMetric(key)}<input type="number" value={draftMetric[key]} onChange={(e) => scheduleMetricSave({ [key]: Number(e.target.value) })} className="field mt-1" /></label>)}</div><textarea value={draftMetric.notes} onChange={(e) => scheduleMetricSave({ notes: e.target.value })} placeholder="숫자·비용 관련 발견사항" className="field mt-3" /></Panel><section className="grid gap-5 xl:grid-cols-2"><Panel title="분류별 목표/실제"><ChartBox><ResponsiveContainer><BarChart data={barData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="목표" fill="#d6cfc4" /><Bar dataKey="실제">{barData.map((item) => <Cell key={item.name} fill={item.fill} />)}</Bar></BarChart></ResponsiveContainer></ChartBox></Panel><Panel title="일별 업무시간"><ChartBox><ResponsiveContainer><LineChart data={daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Line dataKey="minutes" stroke="#3d9b72" strokeWidth={3} /></LineChart></ResponsiveContainer></ChartBox></Panel></section></div>;
}

function ReportView({ data, weekStart, saveReport }: { data: AppData; weekStart: string; saveReport: (draft: string) => Promise<void> }) {
  const current = data.weeklyReports.find((report) => report.weekStart === weekStart)?.draft || makeReportDraft(data, weekStart);
  const [draft, setDraft] = useState(current);
  return <div className="grid gap-5"><Title title="리포트" subtitle="금요일 회고용 경영 기여 리포트 초안" /><div className="flex gap-2"><button onClick={() => { const next = makeReportDraft(data, weekStart); setDraft(next); }} className="focus-ring rounded-md bg-ink px-4 py-3 font-semibold text-white">초안 다시 생성</button><button onClick={() => saveReport(draft)} className="focus-ring rounded-md bg-grow px-4 py-3 font-semibold text-white">저장</button><button onClick={() => navigator.clipboard.writeText(draft)} className="focus-ring rounded-md border border-black/10 bg-white px-4 py-3">복사</button><button onClick={() => window.print()} className="focus-ring rounded-md border border-black/10 bg-white px-4 py-3">인쇄</button></div><textarea aria-label="경영 기여 리포트" value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[560px] w-full rounded-lg border border-black/10 bg-white p-4 font-mono text-sm shadow-soft" /></div>;
}

function SettingsDialog({ data, persist, close, signOut, inviteAction, loadSamplesAction, clearSamplesAction }: { data: AppData; persist: (data: AppData) => Promise<boolean>; close: () => void; signOut?: () => Promise<void>; inviteAction?: (email: string) => Promise<void>; loadSamplesAction: () => Promise<void>; clearSamplesAction: () => Promise<void> }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  return <div className="fixed inset-0 z-30 grid place-items-center bg-black/30 p-4"><div className="w-full max-w-xl rounded-lg bg-cream p-5 shadow-soft"><Title title="설정" subtitle="주간 목표시간과 공유 멤버를 관리합니다" />
    <div className="mb-5 rounded-md bg-white/80 p-3 text-sm">
      <p className="font-semibold">공유 작업공간: {data.settings.activeWorkspaceName ?? "로컬 데모"}</p>
      <p className="text-stone-600">현재 권한: {data.settings.workspaceRole ?? "local"} · 멤버 {data.settings.workspaceMembers?.length ?? 1}명</p>
      {data.settings.workspaceMembers?.map((member) => <p key={member.id} className="mt-1 text-xs text-stone-600">{member.email} · {member.role}{member.userId ? "" : " · 로그인 대기"}</p>)}
    </div>
    {inviteAction && data.settings.workspaceRole === "owner" && <div className="mb-5 flex gap-2">
      <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="원장님 이메일" className="field" aria-label="공유할 이메일" />
      <button onClick={async () => { await inviteAction(inviteEmail); setInviteMessage("공유 멤버로 추가했습니다. 그 이메일로 로그인하면 같은 데이터가 보입니다."); setInviteEmail(""); }} className="rounded-md bg-grow px-4 py-3 font-semibold text-white">공유</button>
    </div>}
    {inviteMessage && <p className="mb-5 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{inviteMessage}</p>}
    <div className="grid gap-2 md:grid-cols-4">{(["runTargetMinutes","growTargetMinutes","buildTargetMinutes","ideaTargetMinutes"] as const).map((key) => <label key={key} className="text-sm">{key.replace("TargetMinutes", "")}<input type="number" value={data.settings[key]} onChange={(e) => persist({ ...data, settings: { ...data.settings, [key]: Number(e.target.value) } })} className="field mt-1" /></label>)}</div><div className="mt-5 flex flex-wrap gap-2"><button onClick={loadSamplesAction} className="rounded-md bg-ink px-4 py-3 font-semibold text-white">예시 데이터 불러오기</button><button onClick={() => { if (confirm("현재 공유 작업공간의 예시와 업무 데이터를 삭제할까요?")) clearSamplesAction(); }} className="rounded-md border border-black/10 bg-white px-4 py-3">예시 데이터 삭제</button>{signOut && <button onClick={signOut} className="rounded-md border border-black/10 bg-white px-4 py-3">로그아웃</button>}<button onClick={close} className="rounded-md border border-black/10 bg-white px-4 py-3">닫기</button></div></div></div>;
}

function Title({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="text-2xl font-bold tracking-normal">{title}</h2><p className="mt-1 text-stone-600">{subtitle}</p></div>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-lg border border-black/10 bg-white/75 p-4 shadow-soft"><h3 className="mb-4 font-bold">{title}</h3>{children}</section>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-black/10 bg-white/75 p-4 shadow-soft"><p className="text-sm text-stone-600">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-md bg-stone-100 p-4 text-sm text-stone-600">{text}</p>; }
function ChartBox({ children }: { children: React.ReactNode }) { return <div className="h-72 w-full" role="img" aria-label="업무 시간 차트">{children}</div>; }
function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) { return <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="field">{values.map((item) => <option key={item}>{item}</option>)}</select>; }
function labelMetric(key: string) { return ({ inquiries: "신규 문의", consultations: "상담", eventApplications: "설명회 신청", newEnrollments: "신규 등록", marketingCost: "마케팅비", revenue: "발생 매출", expectedRevenue: "예상 매출", savedMinutes: "절약 시간" } as Record<string, string>)[key]; }
