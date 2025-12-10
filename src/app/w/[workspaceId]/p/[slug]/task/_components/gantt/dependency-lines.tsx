"use client";

import { useEffect, useRef, useMemo } from "react";
import { GanttSubtask, DependencyLine } from "./types";
import { parseDate, getDaysBetween } from "./utils";

interface DependencyLinesProps {
    subtasks: GanttSubtask[];
    timelineStart: Date;
    totalDays: number;
    taskRowHeight: number; // Height of each task row in pixels
    subtaskRowHeight: number; // Height of each subtask row in pixels
    leftPanelWidth: number; // Width of left panel in pixels
}

export function DependencyLines({
    subtasks,
    timelineStart,
    totalDays,
    taskRowHeight = 40,
    subtaskRowHeight = 32,
    leftPanelWidth = 200
}: DependencyLinesProps) {
    const svgRef = useRef<SVGSVGElement>(null);

    // Build a map of subtask positions
    const subtaskPositions = useMemo(() => {
        const positions = new Map<string, { x: number; y: number; width: number }>();

        subtasks.forEach((subtask, index) => {
            const start = parseDate(subtask.start);
            const end = parseDate(subtask.end);

            if (!start || !end) return;

            const startOffset = getDaysBetween(timelineStart, start);
            const duration = getDaysBetween(start, end) + 1;

            // Calculate x position as percentage of timeline
            const leftPercent = (startOffset / totalDays) * 100;
            const widthPercent = (duration / totalDays) * 100;

            // Y position based on row index (each subtask is at a different row)
            const y = index * subtaskRowHeight + subtaskRowHeight / 2;

            positions.set(subtask.id, {
                x: leftPercent,
                y,
                width: widthPercent
            });
        });

        return positions;
    }, [subtasks, timelineStart, totalDays, subtaskRowHeight]);

    // Generate dependency lines
    const lines = useMemo(() => {
        const result: { from: { x: number; y: number }; to: { x: number; y: number }; isBlocked: boolean }[] = [];

        subtasks.forEach((subtask) => {
            if (!subtask.dependsOnIds || subtask.dependsOnIds.length === 0) return;

            const toPos = subtaskPositions.get(subtask.id);
            if (!toPos) return;

            subtask.dependsOnIds.forEach((depId) => {
                const fromPos = subtaskPositions.get(depId);
                if (!fromPos) return;

                // Line goes from end of parent to start of child
                result.push({
                    from: { x: fromPos.x + fromPos.width, y: fromPos.y },
                    to: { x: toPos.x, y: toPos.y },
                    isBlocked: subtask.isBlocked || false
                });
            });
        });

        return result;
    }, [subtasks, subtaskPositions]);

    if (lines.length === 0) return null;

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 pointer-events-none z-20"
            style={{ left: leftPanelWidth }}
            width="100%"
            height="100%"
        >
            <defs>
                {/* Arrow marker for dependency lines */}
                <marker
                    id="arrow-normal"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                >
                    <path d="M0,0 L0,6 L6,3 z" fill="#3b82f6" />
                </marker>
                <marker
                    id="arrow-blocked"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                >
                    <path d="M0,0 L0,6 L6,3 z" fill="#f59e0b" />
                </marker>
            </defs>

            {lines.map((line, index) => {
                // Calculate bezier curve control points for smooth connection
                const midX = (line.from.x + line.to.x) / 2;

                // Convert percentages to approximate pixels for SVG
                // This is a simplified approach - in production you'd use actual measurements
                const fromX = `${line.from.x}%`;
                const fromY = line.from.y;
                const toX = `${line.to.x}%`;
                const toY = line.to.y;
                const midXStr = `${midX}%`;

                return (
                    <g key={index}>
                        {/* Connection path with bezier curve */}
                        <path
                            d={`M ${fromX} ${fromY} 
                                C ${midXStr} ${fromY}, 
                                  ${midXStr} ${toY}, 
                                  ${toX} ${toY}`}
                            fill="none"
                            stroke={line.isBlocked ? "#f59e0b" : "#3b82f6"}
                            strokeWidth="2"
                            strokeDasharray={line.isBlocked ? "4 2" : "none"}
                            markerEnd={line.isBlocked ? "url(#arrow-blocked)" : "url(#arrow-normal)"}
                            className="transition-all duration-200"
                        />
                        {/* Start node (small circle) */}
                        <circle
                            cx={fromX}
                            cy={fromY}
                            r="4"
                            fill={line.isBlocked ? "#f59e0b" : "#3b82f6"}
                            className="transition-all duration-200"
                        />
                    </g>
                );
            })}
        </svg>
    );
}
