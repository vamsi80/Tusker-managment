import React, { useMemo } from "react";
import Svg, { Path, Polygon } from "react-native-svg";

export interface DependencyBarPosition {
    id: string;
    status: string;
    dependsOnIds?: string[];
    /** px offset of the bar's left edge within the timeline pane */
    x: number;
    /** px offset of the bar's right edge within the timeline pane */
    endX: number;
    /** px vertical center of the row within the body */
    y: number;
}

interface DependencyLinesProps {
    bars: DependencyBarPosition[];
    timelineWidth: number;
    bodyHeight: number;
}

/**
 * Right-angle connector arrows between dependent subtask bars — ported from
 * web's apps/web/src/components/task/gantt/dependency-lines.tsx so mobile
 * shows the same dependency graph (green = completed predecessor, blue =
 * pending). react-native-svg has no reliable cross-platform <marker>
 * support, so the arrowhead is drawn as a small manual triangle instead.
 */
export default function DependencyLines({ bars, timelineWidth, bodyHeight }: DependencyLinesProps) {
    const positions = useMemo(() => {
        const map = new Map<string, DependencyBarPosition>();
        bars.forEach(b => map.set(b.id, b));
        return map;
    }, [bars]);

    const lines = useMemo(() => {
        const cornerRadius = 8;
        const result: { path: string; arrow: string; isCompleted: boolean; key: string }[] = [];

        bars.forEach(subtask => {
            if (!subtask.dependsOnIds || subtask.dependsOnIds.length === 0) return;

            const toPos = positions.get(subtask.id);
            if (!toPos) return;

            subtask.dependsOnIds.forEach(depId => {
                const fromPos = positions.get(depId);
                if (!fromPos) return;

                const startX = fromPos.endX;
                const startY = fromPos.y;
                const endX = toPos.x;
                const endY = toPos.y;

                let path: string;
                if (Math.abs(startY - endY) < 1) {
                    path = `M ${startX} ${startY} L ${endX} ${endY}`;
                } else if (startX < endX - 12) {
                    const midX = (startX + endX) / 2;
                    const up = endY < startY;
                    const r = Math.min(cornerRadius, Math.abs(endY - startY) / 2, Math.abs(midX - startX));
                    path = `M ${startX} ${startY} ` +
                        `L ${midX - r} ${startY} ` +
                        `Q ${midX} ${startY} ${midX} ${startY + (up ? -r : r)} ` +
                        `L ${midX} ${endY + (up ? r : -r)} ` +
                        `Q ${midX} ${endY} ${midX + r} ${endY} ` +
                        `L ${endX} ${endY}`;
                } else {
                    const offset = 12;
                    const x1 = startX + offset;
                    const midY = (startY + endY) / 2;
                    const x2 = endX - offset;
                    const up = endY < startY;
                    const r = Math.min(cornerRadius, Math.abs(midY - startY) / 2, offset / 2);
                    path = `M ${startX} ${startY} ` +
                        `L ${x1 - r} ${startY} ` +
                        `Q ${x1} ${startY} ${x1} ${startY + (up ? -r : r)} ` +
                        `L ${x1} ${midY + (up ? r : -r)} ` +
                        `Q ${x1} ${midY} ${x1 - r} ${midY} ` +
                        `L ${x2 + r} ${midY} ` +
                        `Q ${x2} ${midY} ${x2} ${midY + (up ? -r : r)} ` +
                        `L ${x2} ${endY + (up ? r : -r)} ` +
                        `Q ${x2} ${endY} ${x2 + r} ${endY} ` +
                        `L ${endX} ${endY}`;
                }

                // Small manual arrowhead pointing right into the successor bar.
                const a = 5;
                const arrow = `${endX - a},${endY - 3} ${endX - a},${endY + 3} ${endX},${endY}`;

                const predecessor = positions.get(depId);
                result.push({
                    path,
                    arrow,
                    isCompleted: predecessor?.status === "COMPLETED",
                    key: `${depId}-${subtask.id}`,
                });
            });
        });

        return result;
    }, [bars, positions]);

    if (lines.length === 0) return null;

    return (
        <Svg
            pointerEvents="none"
            style={{ position: "absolute", top: 0, left: 0, width: timelineWidth, height: bodyHeight }}
            width={timelineWidth}
            height={bodyHeight}
            viewBox={`0 0 ${timelineWidth} ${bodyHeight}`}
        >
            {lines.map(line => {
                const color = line.isCompleted ? "#22c55e" : "#3b82f6";
                return (
                    <React.Fragment key={line.key}>
                        <Path
                            d={line.path}
                            fill="none"
                            stroke={color}
                            strokeWidth={1.2}
                            strokeOpacity={line.isCompleted ? 0.8 : 0.6}
                        />
                        <Polygon points={line.arrow} fill={color} opacity={line.isCompleted ? 0.8 : 0.6} />
                    </React.Fragment>
                );
            })}
        </Svg>
    );
}
