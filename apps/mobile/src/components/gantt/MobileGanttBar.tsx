import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { addDays } from "date-fns";
import { useTheme } from "../../context/ThemeContext";
import { Task } from "../../types";
import { getGanttBarColor } from "../../utils/taskColors";
import { formatDateForAPI } from "../../utils/mobileGanttUtils";
import { FONTS, BORDER_RADIUS, ELEVATION } from "../../constants/theme";
import { haptics } from "../../services/haptics";
import { useToast } from "../../context/ToastContext";
import { patchTaskFields } from "../../services/api";

const STATUS_LABELS: Record<string, string> = {
    TO_DO: "To Do",
    IN_PROGRESS: "In Progress",
    REVIEW: "Review",
    HOLD: "Hold",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
};

const EDGE_W = 18;

interface MobileGanttBarProps {
    task: Task;
    leftPercent: number;   // 0-100
    widthPercent: number;  // 0-100
    totalWidth: number;    // the pixel width of the entire timeline canvas
    isSubtask?: boolean;
    onPress: () => void;
    progress?: number;
    delay?: { isDelayed: boolean; delayDays: number; delayWidthPercent: number };
    /** px width of a single day column — used to convert drag distance to a day delta */
    dayWidth?: number;
    startDate?: Date | null;
    endDate?: Date | null;
    canEdit?: boolean;
    workspaceId?: string;
    projectId?: string;
    /** Called after a successful drag/resize so the caller can update local dates optimistically */
    onDatesChanged?: (taskId: string, startISO: string, endISO: string) => void;
}

export default function MobileGanttBar({
    task,
    leftPercent,
    widthPercent,
    totalWidth,
    isSubtask = false,
    onPress,
    progress = 0,
    delay,
    dayWidth,
    startDate,
    endDate,
    canEdit = false,
    workspaceId,
    projectId,
    onDatesChanged,
}: MobileGanttBarProps) {
    const { isDark } = useTheme();
    const toast = useToast();
    const [isBusy, setIsBusy] = useState(false);

    const statusKey = task.status ?? "TO_DO";
    const barColor = getGanttBarColor(statusKey);

    const leftPx = (leftPercent / 100) * totalWidth;
    const widthPx = Math.max(14, (widthPercent / 100) * totalWidth);

    const barHeight = isSubtask ? 14 : 24;
    const barTop = isSubtask ? 34 : 8;

    const isSettled = statusKey === "COMPLETED" || statusKey === "CANCELLED" || statusKey === "HOLD";
    const delayWidthPx = delay?.isDelayed ? Math.max(0, (delay.delayWidthPercent / 100) * totalWidth) : 0;

    const showLabel = widthPx > 50;
    const statusLabel = STATUS_LABELS[statusKey] ?? statusKey;

    // Drag-to-move (whole bar) — visual offset only; the commit happens on gesture end.
    const moveX = useSharedValue(0);
    // Drag-edge-to-resize — px deltas applied to left/right edges independently.
    const resizeLeftDx = useSharedValue(0);
    const resizeRightDx = useSharedValue(0);

    const draggable = canEdit && isSubtask && !!dayWidth && !!startDate && !!endDate && !!workspaceId && !!projectId;

    const commitDates = (newStart: Date, newEnd: Date) => {
        if (newStart >= newEnd) return;
        const startStr = formatDateForAPI(newStart, "start");
        const endStr = formatDateForAPI(newEnd, "end");
        setIsBusy(true);
        onDatesChanged?.(task.id, startStr, endStr);
        patchTaskFields(task.id, workspaceId!, projectId!, { startDate: startStr, dueDate: endStr })
            .then(() => toast.success("Task dates updated"))
            .catch((e: any) => {
                toast.error(e?.message || "Failed to update task dates");
                // Best-effort revert: restore original dates.
                onDatesChanged?.(task.id, startDate!.toISOString(), endDate!.toISOString());
            })
            .finally(() => setIsBusy(false));
    };

    // Plain JS (not worklets) — date-fns and the API call can't run on the UI
    // thread, so gesture .onEnd only reads translationX and hands off via runOnJS.
    const commitMove = (translationX: number) => {
        const daysDelta = Math.round(translationX / dayWidth!);
        if (daysDelta !== 0) {
            commitDates(addDays(startDate!, daysDelta), addDays(endDate!, daysDelta));
        }
    };
    const commitResizeRight = (translationX: number) => {
        const daysDelta = Math.round(translationX / dayWidth!);
        if (daysDelta !== 0) {
            commitDates(startDate!, addDays(endDate!, daysDelta));
        }
    };
    const commitResizeLeft = (translationX: number) => {
        const daysDelta = Math.round(translationX / dayWidth!);
        if (daysDelta !== 0) {
            commitDates(addDays(startDate!, daysDelta), endDate!);
        }
    };

    const movePan = Gesture.Pan()
        .enabled(draggable)
        .activateAfterLongPress(220)
        .onStart(() => {
            runOnJS(haptics.medium)();
        })
        .onUpdate(e => {
            moveX.value = e.translationX;
        })
        .onEnd(e => {
            moveX.value = withSpring(0, { damping: 20, stiffness: 300 });
            runOnJS(commitMove)(e.translationX);
        });

    const resizeRightPan = Gesture.Pan()
        .enabled(draggable)
        .activateAfterLongPress(180)
        .onStart(() => {
            runOnJS(haptics.medium)();
        })
        .onUpdate(e => {
            resizeRightDx.value = e.translationX;
        })
        .onEnd(e => {
            resizeRightDx.value = withSpring(0, { damping: 20, stiffness: 300 });
            runOnJS(commitResizeRight)(e.translationX);
        });

    const resizeLeftPan = Gesture.Pan()
        .enabled(draggable)
        .activateAfterLongPress(180)
        .onStart(() => {
            runOnJS(haptics.medium)();
        })
        .onUpdate(e => {
            resizeLeftDx.value = e.translationX;
        })
        .onEnd(e => {
            resizeLeftDx.value = withSpring(0, { damping: 20, stiffness: 300 });
            runOnJS(commitResizeLeft)(e.translationX);
        });

    const tap = Gesture.Tap().onEnd(() => {
        runOnJS(onPress)();
    });

    const barGesture = Gesture.Race(movePan, tap);

    const barAnimatedStyle = useAnimatedStyle(() => ({
        left: leftPx + resizeLeftDx.value + moveX.value,
        width: Math.max(14, widthPx - resizeLeftDx.value + resizeRightDx.value),
        top: barTop,
        height: barHeight,
    }));

    return (
        <>
            <GestureDetector gesture={barGesture}>
                <Animated.View
                    style={[styles.bar, barAnimatedStyle, {
                        backgroundColor: barColor + (isDark ? "cc" : "ee"),
                        borderColor: barColor + "66",
                        opacity: isBusy ? 0.6 : 1,
                    }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${task.name}, ${statusLabel}`}
                >
                    {/* Glassy shimmer stripe on top */}
                    <View style={styles.glassHighlight} pointerEvents="none" />

                    {/* Progress fill overlay */}
                    {progress > 0 && (
                        <View
                            pointerEvents="none"
                            style={[
                                styles.progressOverlay,
                                {
                                    width: `${Math.min(100, progress)}%`,
                                    backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
                                },
                            ]}
                        />
                    )}

                    {showLabel && (
                        <Text style={styles.label} numberOfLines={1}>
                            {task.name}
                        </Text>
                    )}

                    {draggable && (
                        <>
                            <GestureDetector gesture={resizeLeftPan}>
                                <View style={[styles.resizeHandle, { left: -EDGE_W / 2 }]} hitSlop={{ top: 10, bottom: 10 }} />
                            </GestureDetector>
                            <GestureDetector gesture={resizeRightPan}>
                                <View style={[styles.resizeHandle, { right: -EDGE_W / 2 }]} hitSlop={{ top: 10, bottom: 10 }} />
                            </GestureDetector>
                        </>
                    )}
                </Animated.View>
            </GestureDetector>

            {/* Delay/overdue extension — dashed outline in the status color past the bar's end */}
            {delayWidthPx > 0 && !isSettled && (
                <View
                    pointerEvents="none"
                    style={[
                        styles.delayBar,
                        {
                            left: leftPx + widthPx,
                            width: delayWidthPx,
                            top: barTop + (barHeight - 8) / 2,
                            borderColor: barColor,
                            backgroundColor: barColor + "22",
                        },
                    ]}
                />
            )}
        </>
    );
}

const styles = StyleSheet.create({
    bar: {
        position: "absolute",
        borderRadius: BORDER_RADIUS.sm,
        borderWidth: 1,
        justifyContent: "center",
        paddingHorizontal: 6,
        overflow: "hidden",
        ...ELEVATION.sm,
    },
    glassHighlight: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "40%",
        backgroundColor: "rgba(255,255,255,0.18)",
        borderTopLeftRadius: BORDER_RADIUS.sm,
        borderTopRightRadius: BORDER_RADIUS.sm,
    },
    progressOverlay: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        borderTopLeftRadius: BORDER_RADIUS.sm,
        borderBottomLeftRadius: BORDER_RADIUS.sm,
    },
    label: {
        color: "#fff",
        fontSize: 9,
        fontFamily: FONTS.bold,
        letterSpacing: 0.2,
        textShadowColor: "rgba(0,0,0,0.4)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    resizeHandle: {
        position: "absolute",
        top: 0,
        bottom: 0,
        width: EDGE_W,
    },
    delayBar: {
        position: "absolute",
        height: 8,
        borderRadius: 3,
        borderWidth: 1,
        borderStyle: "dashed",
    },
});
