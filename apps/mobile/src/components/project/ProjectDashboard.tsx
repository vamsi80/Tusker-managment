import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { projectsApi } from "../../api/projects";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { statusColor } from "../../lib/constants";
import { displayName, fmtDate } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";

type Glyph = keyof typeof Ionicons.glyphMap;
import {
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  ProgressRing,
  Skeleton,
  StatusBadge,
  Tabs,
  Text,
  tint,
} from "../ui";

export type DueRange = "this" | "next";

/** The dashboard's subtasks due in the chosen week (getProjectDashboardData's dueThisWeek). */
export function dueInRange(d: any, range: DueRange): any[] {
  if (!d) return [];
  const start = new Date(range === "this" ? d.weekStart : d.nextWeekStart);
  const end = new Date(range === "this" ? d.weekEnd : d.nextWeekEnd);
  return (d.dueThisWeek ?? []).filter(
    (t: any) => t.dueDate && new Date(t.dueDate) >= start && new Date(t.dueDate) <= end,
  );
}

/** How many due tasks the dashboard shows before "See all". */
const DUE_PREVIEW = 3;

/** One due subtask: status-coloured edge, name, status, due date, assignee. */
export function DueTaskCard({ task: t }: { task: any }) {
  const navigation = useNavigation<any>();
  return (
    <Card
      elevated={false}
      onPress={() => navigation.navigate("TaskDetail", { taskId: t.id, title: t.name })}
      style={{ padding: 12, gap: 6, borderWidth: 1, borderLeftWidth: 4, borderLeftColor: statusColor(t.status ?? "TO_DO") }}
    >
      <Text variant="bodyMedium" numberOfLines={2}>
        {t.name}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <StatusBadge status={t.status} size="xs" />
        <Text variant="caption" tone="muted">
          Due {fmtDate(t.dueDate, "EEE, dd MMM")}
        </Text>
        <View style={{ flex: 1 }} />
        {t.assignee ? (
          <Avatar
            name={t.assignee?.workspaceMember?.user?.surname ?? t.assignee?.surname}
            image={t.assignee?.workspaceMember?.user?.image}
            size={22}
          />
        ) : null}
      </View>
    </Card>
  );
}

/** p/[slug]/_components/dashboard: summary stats, progress, due this/next week, unassigned members. */
/** Which subtasks a stat card opens: null = all of them. */
export type StatFilter = { label: string; status: string[] | null };

/**
 * Like the old app's ProjectDashboard, tapping Total / Completed / Pending opens
 * the project's subtasks filtered to that status.
 */
export function ProjectDashboard({ projectId, onStatPress }: { projectId: string; onStatPress?: (filter: StatFilter) => void }) {
  const { colors, shadow } = useTheme();
  const navigation = useNavigation<any>();
  const { workspaceId } = useWorkspace();
  const [range, setRange] = useState<DueRange>("this");
  const q = useQuery({
    queryKey: qk.projectDashboard(workspaceId, projectId),
    queryFn: () => projectsApi.dashboard(workspaceId, projectId),
    enabled: !!workspaceId,
  });
  const d = q.data;

  const absent = useMemo(
    () =>
      d?.hasFullAccess
        ? (d.allMembers ?? []).filter(
            (m: any) =>
              m.workspaceMember?.workspaceRole !== "OWNER" &&
              m.workspaceMember?.workspaceRole !== "ADMIN" &&
              !(d.presentRecords ?? []).some(
                (r: any) => r.workspaceMemberId === m.workspaceMember?.id,
              ),
          )
        : [],
    [d],
  );
  const unassigned = useMemo(
    () =>
      (d?.allMembers ?? []).filter(
        (m: any) =>
          (m.assignedTasks?.length ?? 0) === 0 &&
          (m.projectRole === "PROJECT_MANAGER" ||
            (m.workspaceMember?.workspaceRole !== "OWNER" &&
              m.workspaceMember?.workspaceRole !== "ADMIN")),
      ),
    [d],
  );
  const due = useMemo(() => dueInRange(d, range), [d, range]);

  if (q.isError)
    return (
      <ErrorState
        message={(q.error as Error).message}
        onRetry={() => q.refetch()}
      />
    );

  const pct =
    d && d.totalCount ? Math.round((d.completedCount / d.totalCount) * 100) : 0;
  const stats = [
    {
      key: "total",
      status: null,
      label: "Total",
      value: d?.totalCount ?? 0,
      icon: "layers" as Glyph,
      color: colors.info,
    },
    {
      key: "completed",
      status: ["COMPLETED"],
      label: "Completed",
      value: d?.completedCount ?? 0,
      icon: "checkmark-circle" as Glyph,
      color: colors.success,
    },
    {
      key: "pending",
      status: ["TO_DO", "IN_PROGRESS", "REVIEW"],
      label: "Pending",
      value: d?.todoCount ?? 0,
      icon: "time" as Glyph,
      color: colors.warning,
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          tintColor={colors.primaryInk}
        />
      }
    >
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {d && !d.hasFullAccess ? "My Project Overview" : "Project Overview"}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
        style={{ marginHorizontal: -16, marginTop: -6 }}
      >
        <View style={{ width: 4 }} />
        {stats.map((s) => (
          <Pressable
            onPress={() => onStatPress?.({ label: s.label, status: s.status })}
            accessibilityRole="button"
            accessibilityLabel={`${s.label}: ${s.value}`}
            key={s.label}
            style={({ pressed }) => [
              styles.stat,
              { transform: [{ scale: pressed ? 0.96 : 1 }] },
              shadow.sm,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.statIcon,
                { backgroundColor: tint(s.color, 0.12) },
              ]}
            >
              <Ionicons name={s.icon} size={20} color={s.color} />
            </View>
            <View style={{ flex: 1 }}>
              {q.isLoading ? (
                <Skeleton width={36} height={20} />
              ) : (
                <Text style={[styles.statValue, { color: colors.foreground }]}>
                  {s.value}
                </Text>
              )}
              <Text
                style={[styles.statLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
              >
                {s.label}
              </Text>
            </View>
          </Pressable>
        ))}
        <View style={{ width: 4 }} />
      </ScrollView>

      <Text
        style={[
          styles.sectionTitle,
          { color: colors.foreground, marginBottom: -6 },
        ]}
      >
        Overall Progress
      </Text>
      <Card style={{ alignItems: "center", gap: 10 }}>
        <ProgressRing value={pct} size={128} stroke={12} color={colors.success}>
          <Text variant="h1">{pct}%</Text>
          <Text variant="caption" tone="muted">
            complete
          </Text>
        </ProgressRing>
        <Text variant="small" tone="muted">
          {d?.completedCount ?? 0} of {d?.totalCount ?? 0} tasks completed
        </Text>
      </Card>

      {d?.hasFullAccess ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.sectionTitleBare, { color: colors.foreground }]}
              >
                Absent / On Leave Today
              </Text>
              <Text variant="small" tone="muted">
                Not in the office today
              </Text>
            </View>
            <View
              style={[
                styles.pill,
                { backgroundColor: tint(colors.destructive, 0.1) },
              ]}
            >
              <Text
                style={{
                  fontFamily: fonts.bold,
                  fontSize: 12,
                  color: colors.destructive,
                }}
              >
                {absent.length} {absent.length === 1 ? "Member" : "Members"}
              </Text>
            </View>
          </View>
          {absent.length === 0 ? (
            <View
              style={[
                styles.emptyAbsent,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={24}
                color={colors.success}
              />
              <Text
                variant="small"
                tone="muted"
                center
                style={{ fontStyle: "italic", alignSelf: "stretch" }}
              >
                All members are present today
              </Text>
            </View>
          ) : (
            absent.map((m: any) => (
              <View
                key={m.id}
                style={[
                  styles.absentRow,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <MemberLine member={m} />
                </View>
                <View
                  style={[
                    styles.pill,
                    { backgroundColor: tint(colors.destructive, 0.1) },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: fonts.bold,
                      fontSize: 11,
                      color: colors.destructive,
                    }}
                  >
                    Absent
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      ) : null}

      <SectionHead
        title="Due This Week"
        subtitle="Subtasks with a due date in the range"
        icon="calendar-outline"
      />
      <Card padded={false}>
        <View style={{ padding: 14, gap: 10 }}>
          <Tabs
            scrollable={false}
            compact
            value={range}
            onChange={setRange}
            items={[
              { key: "this", label: "This Week" },
              { key: "next", label: "Next Week" },
            ]}
          />
          {q.isLoading ? (
            <Skeleton height={48} />
          ) : due.length === 0 ? (
            <EmptyState
              title={
                range === "this"
                  ? "Nothing due this week"
                  : "Nothing due next week"
              }
              compact
            />
          ) : (
            <>
              {due.slice(0, DUE_PREVIEW).map((t: any) => (
                <DueTaskCard key={t.id} task={t} />
              ))}
              {due.length > DUE_PREVIEW ? (
                <Pressable
                  onPress={() => navigation.navigate("ProjectDue", { projectId, range })}
                  style={({ pressed }) => [styles.seeMore, { borderColor: colors.border, backgroundColor: pressed ? colors.secondary : "transparent" }]}
                  accessibilityRole="button"
                >
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.primaryInk }}>
                    See all ({due.length})
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primaryInk} />
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </Card>

      {d?.hasFullAccess ? (
        <>
          <SectionHead
            title="Members without tasks"
            subtitle="No open tasks in this project"
            icon="person-outline"
          />
          <Card padded={false}>
            <View style={{ padding: 14, gap: 10 }}>
              {unassigned.length === 0 ? (
                <Text
                  variant="small"
                  tone="muted"
                  style={{ fontStyle: "italic" }}
                >
                  All members have tasks assigned
                </Text>
              ) : (
                unassigned.map((m: any) => <MemberLine key={m.id} member={m} />)
              )}
            </View>
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

/** The old app's dashboard section heading: bold title, muted subtitle. */
function SectionHead({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon: Glyph;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: -6,
      }}
    >
      <Ionicons name={icon} size={18} color={colors.foreground} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function MemberLine({ member }: { member: any }) {
  const user = member.workspaceMember?.user ?? member.user;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Avatar name={displayName(user)} image={user?.image} size={30} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium">{displayName(user)}</Text>
        <Text variant="caption" tone="muted">
          {(member.projectRole ?? "").replace(/_/g, " ").toLowerCase()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // apps/mobile ProjectDashboard.tsx
  sectionTitle: { fontFamily: fonts.heading, fontSize: 18 },
  sectionTitleBare: { fontFamily: fonts.heading, fontSize: 18 },
  stat: {
    width: 150,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 24 },
  statLabel: { fontFamily: fonts.semibold, fontSize: 11, opacity: 0.85 },
  seeMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  emptyAbsent: {
    alignItems: "center",
    gap: 6,
    padding: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  absentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
});
