import type { ComponentType } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import {
    AlertTriangle,
    ArrowUpRight,
    CalendarCheck,
    CheckCircle2,
    ClipboardList,
    FileText,
    FolderKanban,
    Package,
    ShieldAlert,
    Sparkles,
    SquareCheckBig,
    User,
    Wrench,
} from "lucide-react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Badge, Button, Text, tint } from "../ui";

/** packages/core/src/server/travis/contract.ts — the event stream, as the client sees it. */
export type EntityRef = {
    type: "task" | "subtask" | "project" | "member" | "leave" | "indent" | "daily_report" | "attendance";
    id: string;
    label: string;
    sublabel?: string;
    status?: string;
    route?: string;
};
export type ConfirmationPreview = {
    tool: string;
    title: string;
    summary: string;
    fields: { label: string; value: string }[];
    destructive: boolean;
    affectedEntity?: EntityRef;
    token: string;
    expiresAt: number;
};
export type TravisEvent =
    | { type: "text_delta"; text: string }
    | { type: "tool_started"; tool: string; label: string }
    | { type: "tool_completed"; tool: string; ok: boolean; summary?: string }
    | { type: "entity_card"; entity: EntityRef }
    | { type: "confirmation_required"; preview: ConfirmationPreview }
    | { type: "navigation"; route: string; entity?: EntityRef }
    | { type: "completed"; text: string; conversationId?: string }
    | { type: "error"; code: string; message: string };

export type ConfirmationState = "pending" | "processing" | "confirmed" | "cancelled" | "expired";
export type ChatMessage =
    | { id: string; role: "user"; text: string }
    | {
          id: string;
          role: "assistant";
          text: string;
          cards?: EntityRef[];
          tools?: string[];
          confirmation?: ConfirmationPreview;
          confirmationState?: ConfirmationState;
          navigation?: { route: string; entity?: EntityRef };
          isError?: boolean;
          clientRequestId?: string;
      };

/** Folds one turn's events into a chat bubble. */
export function messageFromEvents(id: string, events: TravisEvent[], fallback: string, clientRequestId?: string): ChatMessage {
    const completed = events.find((e) => e.type === "completed") as Extract<TravisEvent, { type: "completed" }> | undefined;
    const error = events.find((e) => e.type === "error") as Extract<TravisEvent, { type: "error" }> | undefined;
    const deltas = events.filter((e) => e.type === "text_delta").map((e) => (e as Extract<TravisEvent, { type: "text_delta" }>).text);
    const confirmation = (events.find((e) => e.type === "confirmation_required") as Extract<TravisEvent, { type: "confirmation_required" }> | undefined)?.preview;
    const nav = events.find((e) => e.type === "navigation") as Extract<TravisEvent, { type: "navigation" }> | undefined;
    const tools = Array.from(new Set(events.filter((e) => e.type === "tool_started").map((e) => (e as Extract<TravisEvent, { type: "tool_started" }>).label)));
    return {
        id,
        role: "assistant",
        text: completed?.text || error?.message || deltas.join("") || fallback,
        cards: events.filter((e) => e.type === "entity_card").map((e) => (e as Extract<TravisEvent, { type: "entity_card" }>).entity),
        tools: tools.length ? tools : undefined,
        confirmation,
        confirmationState: confirmation ? "pending" : undefined,
        navigation: nav ? { route: nav.route, entity: nav.entity } : undefined,
        isError: !!error,
        clientRequestId,
    };
}

const ENTITY_ICON: Record<EntityRef["type"], ComponentType<{ size?: number; color?: string }>> = {
    task: SquareCheckBig,
    subtask: SquareCheckBig,
    project: FolderKanban,
    member: User,
    leave: CalendarCheck,
    indent: Package,
    daily_report: FileText,
    attendance: ClipboardList,
};

/** Travis answers in light markdown: **bold** spans and "- " / "• " bullets. */
function RichText({ text, color }: { text: string; color: string }) {
    const lines = text.split("\n");
    return (
        <View style={{ gap: 4 }}>
            {lines.map((line, i) => {
                const bullet = /^\s*([-*•]|\d+\.)\s+/.exec(line);
                const body = bullet ? line.slice(bullet[0].length) : line;
                if (!body.trim() && !bullet) return <View key={i} style={{ height: 4 }} />;
                const parts = body.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
                const content = parts.map((p, j) =>
                    p.startsWith("**") && p.endsWith("**") ? (
                        <Text key={j} style={{ fontFamily: fonts.semibold, color }}>
                            {p.slice(2, -2)}
                        </Text>
                    ) : (
                        p
                    ),
                );
                return (
                    <View key={i} style={{ flexDirection: "row", gap: 6 }}>
                        {bullet ? <Text style={{ color, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21 }}>{/\d/.test(bullet[1]) ? bullet[1] : "•"}</Text> : null}
                        <Text style={{ flexShrink: 1, color, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21 }}>{content}</Text>
                    </View>
                );
            })}
        </View>
    );
}

export function TravisBubble({
    message,
    onOpenEntity,
    onConfirm,
    onEdit,
    onCancel,
    onRetry,
}: {
    message: ChatMessage;
    onOpenEntity: (entity?: EntityRef, route?: string) => void;
    onConfirm: () => void;
    onEdit: () => void;
    onCancel: () => void;
    onRetry?: () => void;
}) {
    const { colors } = useTheme();

    if (message.role === "user") {
        return (
            <View style={[styles.user, { backgroundColor: colors.primary }]}>
                <Text style={{ color: colors.primaryForeground, fontFamily: fonts.medium, fontSize: 14.5, lineHeight: 21 }}>{message.text}</Text>
            </View>
        );
    }

    return (
        <View style={{ flexDirection: "row", gap: 10, alignSelf: "stretch", paddingRight: 24 }}>
            <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                <Sparkles size={15} color={colors.primaryInk} />
            </View>
            <View style={{ flex: 1, gap: 8 }}>
                {message.tools?.length ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {message.tools.map((t) => (
                            <Badge key={t} label={t} icon={Wrench} variant="muted" size="xs" />
                        ))}
                    </View>
                ) : null}
                <View
                    style={[
                        styles.assistant,
                        { backgroundColor: message.isError ? tint(colors.destructive, 0.08) : colors.card, borderColor: message.isError ? tint(colors.destructive, 0.3) : colors.border },
                    ]}
                >
                    <RichText text={message.text} color={message.isError ? colors.destructive : colors.foreground} />
                    {message.isError && onRetry ? <Button title="Try again" size="sm" variant="outline" style={{ alignSelf: "flex-start", marginTop: 8 }} onPress={onRetry} /> : null}
                </View>

                {message.cards?.map((card) => {
                    const Icon = ENTITY_ICON[card.type] ?? SquareCheckBig;
                    return (
                        <Pressable
                            key={`${card.type}-${card.id}`}
                            onPress={() => onOpenEntity(card, card.route)}
                            style={({ pressed }) => [styles.card, { backgroundColor: pressed ? colors.secondary : colors.card, borderColor: colors.border }]}
                        >
                            <View style={[styles.cardIcon, { backgroundColor: colors.secondary }]}>
                                <Icon size={16} color={colors.foreground} />
                            </View>
                            <View style={{ flex: 1, gap: 1 }}>
                                <Text variant="bodyMedium" numberOfLines={1}>
                                    {card.label}
                                </Text>
                                {card.sublabel ? (
                                    <Text variant="small" tone="muted" numberOfLines={1}>
                                        {card.sublabel}
                                    </Text>
                                ) : null}
                            </View>
                            {card.status ? <Badge label={card.status.replace(/_/g, " ")} variant="muted" size="xs" /> : null}
                            <ArrowUpRight size={15} color={colors.mutedForeground} />
                        </Pressable>
                    );
                })}

                {message.confirmation ? (
                    <Confirmation preview={message.confirmation} state={message.confirmationState ?? "pending"} onConfirm={onConfirm} onEdit={onEdit} onCancel={onCancel} />
                ) : message.navigation ? (
                    <Button
                        title={message.navigation.entity ? `Open ${message.navigation.entity.label}` : "Open"}
                        iconRight={ArrowUpRight}
                        variant="outline"
                        size="sm"
                        style={{ alignSelf: "flex-start" }}
                        onPress={() => onOpenEntity(message.navigation!.entity, message.navigation!.route)}
                    />
                ) : null}
            </View>
        </View>
    );
}

/** A write is only ever run from this card — never from free text. */
function Confirmation({
    preview,
    state,
    onConfirm,
    onEdit,
    onCancel,
}: {
    preview: ConfirmationPreview;
    state: ConfirmationState;
    onConfirm: () => void;
    onEdit: () => void;
    onCancel: () => void;
}) {
    const { colors } = useTheme();
    const accent = preview.destructive ? colors.destructive : colors.primaryInk;
    return (
        <View style={[styles.confirm, { borderColor: tint(accent, 0.45), backgroundColor: tint(accent, 0.06) }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {preview.destructive ? <ShieldAlert size={13} color={accent} /> : <AlertTriangle size={13} color={accent} />}
                <Text style={{ fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", color: accent }}>Needs your confirmation</Text>
            </View>
            <Text variant="title">{preview.title}</Text>
            <Text variant="body" tone="muted">
                {preview.summary}
            </Text>
            {preview.destructive ? (
                <Text variant="small" tone="destructive">
                    This can't be undone.
                </Text>
            ) : null}
            {preview.fields.length ? (
                <View style={{ marginTop: 4 }}>
                    {preview.fields.map((f, i) => (
                        <View key={i} style={[styles.field, { borderTopColor: colors.border }]}>
                            <Text variant="small" tone="muted" style={{ width: 96 }}>
                                {f.label}
                            </Text>
                            <Text variant="bodyMedium" style={{ flex: 1 }}>
                                {f.value}
                            </Text>
                        </View>
                    ))}
                </View>
            ) : null}
            {state === "pending" || state === "processing" ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    <Button
                        title="Confirm"
                        size="sm"
                        variant={preview.destructive ? "destructive" : "default"}
                        loading={state === "processing"}
                        style={{ flex: 1 }}
                        onPress={onConfirm}
                    />
                    <Button title="Edit" size="sm" variant="outline" disabled={state === "processing"} onPress={onEdit} />
                    <Button title="Cancel" size="sm" variant="ghost" disabled={state === "processing"} onPress={onCancel} />
                </View>
            ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    {state === "confirmed" ? <CheckCircle2 size={14} color={colors.success} /> : null}
                    <Text variant="label" tone={state === "confirmed" ? "success" : state === "expired" ? "warning" : "muted"}>
                        {state === "confirmed" ? "Done" : state === "expired" ? "This preview expired — ask again" : "Cancelled"}
                    </Text>
                </View>
            )}
        </View>
    );
}

export function TypingBubble() {
    const { colors } = useTheme();
    return (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                <Sparkles size={15} color={colors.primaryInk} />
            </View>
            <View style={[styles.assistant, { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderColor: colors.border }]}>
                <ActivityIndicator size="small" color={colors.primaryInk} />
                <Text variant="small" tone="muted">
                    Travis is thinking…
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    user: { alignSelf: "flex-end", maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderBottomRightRadius: 6 },
    avatar: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    assistant: { alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18, borderTopLeftRadius: 6, borderWidth: 1 },
    card: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.md, borderWidth: 1 },
    cardIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
    confirm: { gap: 6, padding: 14, borderRadius: radius.lg, borderWidth: 1 },
    field: { flexDirection: "row", gap: 10, paddingVertical: 7, borderTopWidth: 1 },
});
