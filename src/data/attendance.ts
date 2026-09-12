import { AttendanceRow, AttendanceStatus } from "@/types";

function buildAttendance(): AttendanceRow[] {
  const cycle: AttendanceStatus[] = ["Present", "Present", "Present", "Present", "Late", "Absent", "Leave"];
  const rows: AttendanceRow[] = [];
  for (let d = 1; d <= 12; d++) {
    const day = new Date(2026, 8, d).getDay();
    if (day === 0) continue; // skip Sundays
    const status = cycle[(d * 3) % cycle.length];
    rows.push({
      date: `2026-09-${String(d).padStart(2, "0")}`,
      checkIn: status === "Absent" || status === "Leave" ? "—" : status === "Late" ? "10:42 AM" : "09:58 AM",
      checkOut: status === "Absent" || status === "Leave" ? "—" : "07:05 PM",
      hours: status === "Absent" || status === "Leave" ? "—" : status === "Late" ? "8h 23m" : "9h 07m",
      status,
    });
  }
  return rows.reverse();
}

export const attendanceRows = buildAttendance();

// Weekly attendance trend used on the admin dashboard chart
export const weeklyAttendanceTrend = [
  { day: "Mon", score: 82 },
  { day: "Tue", score: 88 },
  { day: "Wed", score: 91 },
  { day: "Thu", score: 87 },
  { day: "Fri", score: 94 },
  { day: "Sat", score: 90 },
  { day: "Sun", score: 76 },
];

// Monthly team performance used on the admin dashboard bar chart
export const monthlyPerformance = [
  { month: "Jan", score: 74 }, { month: "Feb", score: 78 }, { month: "Mar", score: 71 },
  { month: "Apr", score: 92 }, { month: "May", score: 68 }, { month: "Jun", score: 65 },
  { month: "Jul", score: 80 }, { month: "Aug", score: 83 }, { month: "Sep", score: 86 },
  { month: "Oct", score: 70 }, { month: "Nov", score: 88 }, { month: "Dec", score: 79 },
];
