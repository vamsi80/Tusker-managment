"use client";

import { useRef, useMemo } from "react";
import { parseDate, getDaysBetween } from "./utils";
import { GanttSubtask } from "./types";

interface DependencyLinesProps {
    subtasks: GanttSubtask[];
    timelineStart: Date;
    totalDays: number;
    containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function DependencyLines({
    subtasks,
    timelineStart,
    totalDays,
    containerRef
}: DependencyLinesProps) {
    const svgRef = useRef<SVGSVGElement>(null);

    // Build a map of subtask positions
    const subtaskPositions = useMemo(() => {
        const positions = new Map<string, { x: number; y: number; width: number; endX: number }>();

        subtasks.forEach((subtask, index) => {
            const start = parseDate(subtask.start);
            const end = parseDate(subtask.end);

            if (!start || !end) return;

            const startOffset = getDaysBetween(timelineStart, start);
            const duration = getDaysBetween(start, end) + 1;

            // Calculate x position as percentage of timeline
            const leftPercent = (startOffset / totalDays) * 100;
            const widthPercent = (duration / totalDays) * 100;

            // Y position based on row index - 32px per row, centered at 16px
            const y = index * 32 + 16;

            positions.set(subtask.id, {
                x: leftPercent,
                y,
                width: widthPercent,
                endX: leftPercent + widthPercent
            });
        });

        return positions;
    }, [subtasks, timelineStart, totalDays]);

    // Generate dependency lines with Microsoft Project-style connectors
    const lines = useMemo(() => {
        const result: Array<{
            path: string;
            isBlocked: boolean;
            fromId: string;
            toId: string;
        }> = [];

        // subtasks.forEach((subtask) => {
        //     if (!subtask.dependsOnIds || subtask.dependsOnIds.length === 0) return;

        //     const toPos = subtaskPositions.get(subtask.id);
        //     if (!toPos) return;

        //     subtask.dependsOnIds.forEach((depId: string) => {
        //         const fromPos = subtaskPositions.get(depId);
        //         if (!fromPos) return;

        //         // Microsoft Project-style: right-angle connectors
        //         // Start from the end of the predecessor bar
        //         const startX = fromPos.endX;
        //         const startY = fromPos.y;

        //         // End at the start of the successor bar
        //         const endX = toPos.x;
        //         const endY = toPos.y;

        //         // Calculate intermediate points for right-angle connection
        //         const horizontalOffset = 0.5; // Small offset in percentage
        //         const midX1 = startX + horizontalOffset;
        //         const midX2 = endX - horizontalOffset;

        //         let path: string;

        //         if (startY === endY) {
        //             // Same row - simple horizontal line
        //             path = `M ${startX}% ${startY} L ${endX}% ${endY}`;
        //         } else {
        //             // Different rows - create right-angle connector
        //             // Pattern: horizontal -> vertical -> horizontal
        //             const midX = (startX + endX) / 2;

        //             path = `M ${startX}% ${startY} 
        //                     L ${midX}% ${startY} 
        //                     L ${midX}% ${endY} 
        //                     L ${endX}% ${endY}`;
        //         }

        //         result.push({
        //             path,
        //             isBlocked: subtask.isBlocked || false,
        //             fromId: depId,
        //             toId: subtask.id
        //         });
        //     });
        // });

        return result;
    }, [subtasks, subtaskPositions]);

    if (lines.length === 0) return null;

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 pointer-events-none z-10"
            style={{
                width: '100%',
                height: '100%',
                overflow: 'visible'
            }}
        >
            <defs>
                {/* Arrow markers for dependency lines */}
                <marker
                    id="arrow-normal"
                    markerWidth="10"
                    markerHeight="10"
                    refX="8"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                >
                    <path d="M0,0 L0,8 L8,4 z" fill="#3b82f6" className="dark:fill-blue-400" />
                </marker>
                <marker
                    id="arrow-blocked"
                    markerWidth="10"
                    markerHeight="10"
                    refX="8"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                >
                    <path d="M0,0 L0,8 L8,4 z" fill="#f59e0b" className="dark:fill-amber-400" />
                </marker>
                <marker
                    id="arrow-normal-dark"
                    markerWidth="10"
                    markerHeight="10"
                    refX="8"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                >
                    <path d="M0,0 L0,8 L8,4 z" fill="#60a5fa" />
                </marker>
                <marker
                    id="arrow-blocked-dark"
                    markerWidth="10"
                    markerHeight="10"
                    refX="8"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                >
                    <path d="M0,0 L0,8 L8,4 z" fill="#fbbf24" />
                </marker>
            </defs>

            {lines.map((line, index) => {
                const strokeColor = line.isBlocked ? "#f59e0b" : "#3b82f6";
                const markerEnd = line.isBlocked ? "url(#arrow-blocked)" : "url(#arrow-normal)";

                return (
                    <g key={`${line.fromId}-${line.toId}-${index}`}>
                        {/* Connection path with right-angle connectors */}
                        <path
                            d={line.path}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth="2"
                            strokeDasharray={line.isBlocked ? "5 3" : "none"}
                            markerEnd={markerEnd}
                            className="transition-all duration-200 hover:stroke-[3px]"
                            style={{
                                filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))'
                            }}
                        />
                    </g>
                );
            })}
        </svg>
    );
}
