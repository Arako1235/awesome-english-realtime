"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { generateDueRecurringTasks } from "./calculations";
import { defaultSettings } from "./seed";
import type { AppData, ChecklistItem, Idea, IdeaTaskLink, RecurringTaskRule, Task, TimeSession, UserSettings, WeeklyMetric, WeeklyReport, WeeklyTarget, Workspace, WorkspaceMember } from "./types";

const tables = [
  "tasks",
  "task_checklist_items",
  "time_sessions",
  "recurring_task_rules",
  "ideas",
  "idea_task_links",
  "weekly_targets",
  "weekly_metrics",
  "weekly_reports",
  "user_settings",
  "workspace_members"
] as const;

function snakeKey(key: string) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function camelKey(key: string) {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function toSnake<T extends object>(row: T) {
  return Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [snakeKey(key), value]));
}

function toCamel<T>(row: object): T {
  return Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [camelKey(key), value])) as T;
}

export async function ensureWorkspace(supabase: SupabaseClient, user: User) {
  const email = user.email ?? "";
  const { data: existingMemberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("*")
    .or(`user_id.eq.${user.id},email.eq.${email.toLowerCase()}`);
  if (membershipError) throw membershipError;

  const pending = (existingMemberships ?? []).filter((row) => !row.user_id && row.email.toLowerCase() === email.toLowerCase());
  for (const row of pending) {
    const { error } = await supabase.from("workspace_members").update({ user_id: user.id }).eq("id", row.id);
    if (error) throw error;
  }

  const { data: refreshedMemberships, error: refreshedError } = await supabase
    .from("workspace_members")
    .select("*")
    .or(`user_id.eq.${user.id},email.eq.${email.toLowerCase()}`);
  if (refreshedError) throw refreshedError;
  if (refreshedMemberships?.length) {
    const membership = toCamel<WorkspaceMember>(refreshedMemberships[0]);
    const { data: workspaceData, error } = await supabase.from("workspaces").select("*").eq("id", membership.workspaceId).single();
    if (error) throw error;
    return { workspace: toCamel<Workspace>(workspaceData), membership };
  }

  const { data: workspaceData, error: workspaceError } = await supabase
    .from("workspaces")
    .insert({ name: "Awesome English", created_by: user.id })
    .select("*")
    .single();
  if (workspaceError) throw workspaceError;
  const workspace = toCamel<Workspace>(workspaceData);
  const { data: memberData, error: memberError } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: workspace.id, user_id: user.id, email: email.toLowerCase(), role: "owner" })
    .select("*")
    .single();
  if (memberError) throw memberError;
  return { workspace, membership: toCamel<WorkspaceMember>(memberData) };
}

export async function addWorkspaceMember(supabase: SupabaseClient, workspaceId: string, email: string, role: "editor" | "viewer" = "editor") {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("공유할 이메일을 입력해주세요.");
  const { error } = await supabase.from("workspace_members").upsert({
    workspace_id: workspaceId,
    email: normalized,
    role
  }, { onConflict: "workspace_id,email" });
  if (error) throw error;
}

export async function readRemoteData(supabase: SupabaseClient, user: User): Promise<AppData> {
  const { workspace, membership } = await ensureWorkspace(supabase, user);
  const workspaceId = workspace.id;
  const userId = user.id;
  const [
    tasksResult,
    checklistResult,
    sessionsResult,
    rulesResult,
    ideasResult,
    linksResult,
    targetsResult,
    metricsResult,
    reportsResult,
    settingsResult,
    membersResult
  ] = await Promise.all([
    supabase.from("tasks").select("*").eq("workspace_id", workspaceId),
    supabase.from("task_checklist_items").select("*").eq("workspace_id", workspaceId),
    supabase.from("time_sessions").select("*").eq("workspace_id", workspaceId),
    supabase.from("recurring_task_rules").select("*").eq("workspace_id", workspaceId),
    supabase.from("ideas").select("*").eq("workspace_id", workspaceId),
    supabase.from("idea_task_links").select("*").eq("workspace_id", workspaceId),
    supabase.from("weekly_targets").select("*").eq("workspace_id", workspaceId),
    supabase.from("weekly_metrics").select("*").eq("workspace_id", workspaceId),
    supabase.from("weekly_reports").select("*").eq("workspace_id", workspaceId),
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("workspace_members").select("*").eq("workspace_id", workspaceId)
  ]);

  const failed = [tasksResult, checklistResult, sessionsResult, rulesResult, ideasResult, linksResult, targetsResult, metricsResult, reportsResult, settingsResult, membersResult].find((result) => result.error);
  if (failed?.error) throw failed.error;

  const settings = {
    ...(settingsResult.data ? toCamel<UserSettings>(settingsResult.data) : { ...defaultSettings(), id: crypto.randomUUID(), userId, sampleDataLoaded: false }),
    activeWorkspaceId: workspaceId,
    activeWorkspaceName: workspace.name,
    workspaceRole: membership.role,
    workspaceMembers: (membersResult.data ?? []).map((row) => toCamel<WorkspaceMember>(row))
  } satisfies UserSettings;
  if (!settingsResult.data) {
    const { error } = await supabase.from("user_settings").upsert(toSnake(stripClientSettings(settings)));
    if (error) throw error;
  }

  const data: AppData = {
    tasks: (tasksResult.data ?? []).map((row) => toCamel<Task>(row)),
    checklistItems: (checklistResult.data ?? []).map((row) => toCamel<ChecklistItem>(row)),
    sessions: (sessionsResult.data ?? []).map((row) => toCamel<TimeSession>(row)),
    recurringRules: (rulesResult.data ?? []).map((row) => toCamel<RecurringTaskRule>(row)),
    ideas: (ideasResult.data ?? []).map((row) => toCamel<Idea>(row)),
    ideaTaskLinks: (linksResult.data ?? []).map((row) => toCamel<IdeaTaskLink>(row)),
    weeklyTargets: (targetsResult.data ?? []).map((row) => toCamel<WeeklyTarget>(row)),
    weeklyMetrics: (metricsResult.data ?? []).map((row) => toCamel<WeeklyMetric>(row)),
    weeklyReports: (reportsResult.data ?? []).map((row) => toCamel<WeeklyReport>(row)),
    settings
  };

  const generated = generateDueRecurringTasks(data);
  if (generated.generated > 0) await writeRemoteData(supabase, generated);
  return generated;
}

export async function writeRemoteData(supabase: SupabaseClient, data: AppData) {
  const workspaceId = data.settings.activeWorkspaceId;
  if (!workspaceId) throw new Error("공유 작업공간을 찾을 수 없습니다. 다시 로그인해주세요.");
  const operations = [
    upsertRows(supabase, "tasks", withWorkspace(data.tasks, workspaceId)),
    upsertRows(supabase, "task_checklist_items", withWorkspace(data.checklistItems.map((row) => ({ ...row, userId: data.settings.userId })), workspaceId)),
    upsertRows(supabase, "time_sessions", withWorkspace(data.sessions, workspaceId)),
    upsertRows(supabase, "recurring_task_rules", withWorkspace(data.recurringRules, workspaceId)),
    upsertRows(supabase, "ideas", withWorkspace(data.ideas, workspaceId)),
    upsertRows(supabase, "idea_task_links", withWorkspace(data.ideaTaskLinks, workspaceId)),
    upsertRows(supabase, "weekly_targets", withWorkspace(data.weeklyTargets, workspaceId)),
    upsertRows(supabase, "weekly_metrics", withWorkspace(data.weeklyMetrics, workspaceId)),
    upsertRows(supabase, "weekly_reports", withWorkspace(data.weeklyReports, workspaceId)),
    supabase.from("user_settings").upsert(toSnake(stripClientSettings(data.settings)))
  ];
  const results = await Promise.all(operations);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

function upsertRows<T extends object>(supabase: SupabaseClient, table: string, rows: T[]) {
  if (!rows.length) return Promise.resolve({ error: null });
  return supabase.from(table).upsert(rows.map((row) => toSnake(row)));
}

function withWorkspace<T extends object>(rows: T[], workspaceId: string) {
  return rows.map((row) => ({ ...row, workspaceId }));
}

function stripClientSettings(settings: UserSettings) {
  const dbSettings = { ...settings };
  delete dbSettings.activeWorkspaceId;
  delete dbSettings.activeWorkspaceName;
  delete dbSettings.workspaceRole;
  delete dbSettings.workspaceMembers;
  return dbSettings;
}

export async function clearRemoteData(supabase: SupabaseClient, workspaceId: string) {
  const orderedDeletes = [
    "idea_task_links",
    "task_checklist_items",
    "time_sessions",
    "weekly_reports",
    "weekly_metrics",
    "weekly_targets",
    "ideas",
    "tasks",
    "recurring_task_rules"
  ];
  for (const table of orderedDeletes) {
    const { error } = await supabase.from(table).delete().eq("workspace_id", workspaceId);
    if (error) throw error;
  }
}

export function subscribeToUserData(supabase: SupabaseClient, workspaceId: string, onChange: () => void) {
  const channel = supabase.channel(`awesome-english-${workspaceId}`);
  for (const table of tables) {
    const filter = table === "user_settings" ? undefined : `workspace_id=eq.${workspaceId}`;
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, onChange);
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
