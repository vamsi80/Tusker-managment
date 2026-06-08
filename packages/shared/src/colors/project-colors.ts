export const PROJECT_COLORS = [
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#84cc16",
    "#22c55e",
    "#10b981",
    "#06b6d4",
    "#0ea5e9",
    "#3b82f6",
    "#6366f1",
    "#8b5cf6",
    "#d946ef",
    "#ec4899",
    "#f43f5e",
    "#64748b",
];

export function generateRandomColor(): string {
    return PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
}

export function getUniqueRandomColor(usedColors: string[] = []): string {
    const normalizedUsed = new Set(usedColors.map((c) => c.toLowerCase()));
    const available = PROJECT_COLORS.filter((c) => !normalizedUsed.has(c.toLowerCase()));
    if (available.length === 0) return generateRandomColor();
    return available[Math.floor(Math.random() * available.length)];
}

function hslToHex(h: number, s: number, l: number): string {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

export function getColorFromString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hslToHex(Math.abs(hash % 360), 75, 55);
}
