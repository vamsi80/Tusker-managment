export function parseIST(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // 1. Try native Date parsing for ISO strings
  if (trimmed.includes('Z') || (trimmed.includes('+') && trimmed.includes('T'))) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  // 2. Try "d MMM yyyy" (e.g., 15 Apr 2026)
  const dMmmYyyyMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (dMmmYyyyMatch) {
    const day = parseInt(dMmmYyyyMatch[1], 10);
    const monthStr = dMmmYyyyMatch[2].toLowerCase().substring(0, 3);
    const year = parseInt(dMmmYyyyMatch[3], 10);
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const month = months[monthStr];
    if (month) {
      const d = new Date(`${year}-${month}-${String(day).padStart(2, '0')}T00:00:00+05:30`);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 3. Try "yyyy-MM-dd"
  const yyyyMmDdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMmDdMatch) {
    const d = new Date(`${trimmed}T00:00:00+05:30`);
    if (!isNaN(d.getTime())) return d;
  }

  // 4. Final attempt with native Date
  const finalD = new Date(trimmed);
  return isNaN(finalD.getTime()) ? null : finalD;
}

export function toTitleCase(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (match) => match.toUpperCase());
}
