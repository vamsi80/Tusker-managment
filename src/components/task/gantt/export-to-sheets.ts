import { GanttTask } from "./types";
import { eachDayOfInterval, parseISO, min, max, format } from "date-fns";

const statusColors: Record<string, { red: number; green: number; blue: number }> = {
    "TO_DO": { red: 0.8, green: 0.84, blue: 0.88 },      // slate-300
    "IN_PROGRESS": { red: 0.58, green: 0.77, blue: 0.99 }, // blue-300
    "REVIEW": { red: 0.99, green: 0.83, blue: 0.30 },     // amber-300
    "HOLD": { red: 0.98, green: 0.75, blue: 0.14 },       // amber-400
    "COMPLETED": { red: 0.53, green: 0.94, blue: 0.67 },  // green-300
    "CANCELLED": { red: 0.99, green: 0.65, blue: 0.65 },  // red-300
};

export const exportGanttToGoogleSheets = async (tasks: GanttTask[], sheetName: string = "Gantt Chart") => {
    // This function will create a Google Sheet with the Gantt data
    // For now, we'll create the data structure and provide instructions

    // Calculate date range
    const allDates: Date[] = [];
    tasks.forEach(t => {
        t.subtasks.forEach(st => {
            if (st.start) allDates.push(parseISO(st.start));
            if (st.end) allDates.push(parseISO(st.end));
        });
    });

    let timelineDates: Date[] = [];
    if (allDates.length > 0) {
        const minDate = min(allDates);
        const maxDate = max(allDates);
        timelineDates = eachDayOfInterval({ start: minDate, end: maxDate });
    }

    // Prepare CSV data for Google Sheets import
    const headers = ["Task Name", "Type", "Project", "Assigned To", "Status", "Start Date", "End Date", "Duration"];
    const timelineHeaders = timelineDates.map(d => format(d, 'MMM dd'));

    const csvRows: string[][] = [];
    csvRows.push([...headers, ...timelineHeaders]);

    tasks.forEach(task => {
        // Parent task row
        csvRows.push([
            task.name,
            "Task",
            task.projectName || "Unknown",
            task.assignee?.name || "",
            "",
            "",
            "",
            "",
            ...Array(timelineDates.length).fill("")
        ]);

        // Subtask rows
        task.subtasks.forEach(subtask => {
            const startDate = subtask.start ? format(parseISO(subtask.start), 'yyyy-MM-dd') : "";
            const duration = subtask.start && subtask.end ?
                Math.ceil((parseISO(subtask.end).getTime() - parseISO(subtask.start).getTime()) / (1000 * 3600 * 24)) + 1 : "";

            csvRows.push([
                `    ${subtask.name}`,
                "Subtask",
                task.projectName || "Unknown",
                subtask.assignee?.name || "Unassigned",
                subtask.status?.toUpperCase() || "",
                startDate,
                "", // End date will be formula
                duration.toString(),
                ...Array(timelineDates.length).fill("") // Timeline cells will have formulas
            ]);
        });
    });

    // Convert to CSV
    const csvContent = csvRows.map(row =>
        row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    // Create a blob and download as CSV (user can import to Google Sheets)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sheetName}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);

    // Show instructions
    alert(
        "CSV file downloaded!\n\n" +
        "To import to Google Sheets:\n" +
        "1. Open Google Sheets (sheets.google.com)\n" +
        "2. File → Import → Upload\n" +
        "3. Select the downloaded CSV file\n" +
        "4. Choose 'Replace spreadsheet' or 'Insert new sheet'\n\n" +
        "Note: You'll need to manually add formulas for dynamic bars in Google Sheets."
    );
};
