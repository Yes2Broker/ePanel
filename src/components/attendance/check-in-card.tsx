"use client";

import { useEffect, useState } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pills";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { AttendanceRecord } from "@/types";
import { formatMinutes, formatTime, OFFICE_TZ } from "@/lib/utils";

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Today's attendance with Check in / Check out buttons. */
export function CheckInCard({
  today, isWorkingDay = true, onChange,
}: { today: AttendanceRecord | null; isWorkingDay?: boolean; onChange: (row: AttendanceRecord) => void }) {
  const now = useClock();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const act = async (kind: "in" | "out") => {
    setBusy(true);
    try {
      const row = kind === "in" ? await api.checkIn() : await api.checkOut();
      onChange(row);
      toast(kind === "in" ? `Checked in at ${formatTime(row.checkIn)}${row.status === "Late" ? " (late)" : ""}.` : `Checked out at ${formatTime(row.checkOut)}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const onLeave = today?.status === "Leave";
  const checkedIn = !!today?.checkIn;
  const checkedOut = !!today?.checkOut;
  const workedSoFar = checkedIn && !checkedOut && now ? Math.max(0, Math.floor((now.getTime() - new Date(today!.checkIn!).getTime()) / 60000)) : today?.minutes ?? null;

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft">
          <Clock className="h-5 w-5 text-brand" />
        </div>
        <div>
          <p className="text-2xl font-semibold leading-none text-ink">
            {now ? now.toLocaleTimeString("en-IN", { timeZone: OFFICE_TZ, hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-faint">
            {onLeave ? "You're on leave today." :
              !checkedIn ? (isWorkingDay ? "You haven't checked in yet." : "Today is a weekly off.") :
              <>
                In {formatTime(today!.checkIn)}
                {checkedOut && <> · Out {formatTime(today!.checkOut)}</>}
                {" · "}{formatMinutes(workedSoFar)} {checkedOut ? "worked" : "so far"}
              </>}
            {today?.status && <StatusPill status={today.status} />}
          </p>
        </div>
      </div>
      {!onLeave && (
        !checkedIn ? (
          <PrimaryButton onClick={() => act("in")} disabled={busy}><LogIn className="h-4 w-4" /> {busy ? "Checking in…" : "Check in"}</PrimaryButton>
        ) : !checkedOut ? (
          <SecondaryButton onClick={() => act("out")} disabled={busy}><LogOut className="h-4 w-4" /> {busy ? "Checking out…" : "Check out"}</SecondaryButton>
        ) : (
          <span className="text-sm font-medium text-status-success">Done for today ✓</span>
        )
      )}
    </Card>
  );
}
