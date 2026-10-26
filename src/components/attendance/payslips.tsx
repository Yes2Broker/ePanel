"use client";

import { useRef, useState } from "react";
import { ChevronRight, Download, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PrimaryButton } from "@/components/ui/button";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { monthLabel } from "@/components/attendance/month-view";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";
import { Payslip } from "@/types";

const money = (v: number) => `₹ ${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const num = (v: number) => String(Number(Number(v).toFixed(1)));

/** Attendance → Payslips: the signed-in person's published months (the database only ever returns their own). */
export function Payslips({ initialMonth }: { initialMonth?: string }) {
  const { data, loading, error, reload } = useApi(() => api.myPayslips());
  const [open, setOpen] = useState<string | null>(initialMonth ?? null);
  return (
    <div className="space-y-3">
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading rows={3} /> : !data?.length ? (
        <EmptyState icon={FileText} title="No payslips yet" text="Your payslip appears here once Admin publishes the month." />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <button key={p.month} onClick={() => setOpen(p.month)} aria-label={`Payslip ${monthLabel(p.month)}`}
              className="flex items-center gap-3 rounded-card bg-white p-4 text-left shadow-card hover:bg-surface">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft"><FileText className="h-4 w-4 text-brand" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{monthLabel(p.month)}</span>
                <span className="block text-xs text-ink-faint">{num(p.netPayable)} payable days · {money(p.final)}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
            </button>
          ))}
        </div>
      )}
      {open && <PayslipDialog month={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PayslipDialog({ month, onClose }: { month: string; onClose: () => void }) {
  const toast = useToast();
  const { data, loading, error } = useApi(() => api.myPayslip(month), [month]);
  const printRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  // A4 PDF from the fixed-width (794 px = A4 at 96 dpi) copy below, made in the browser.
  const download = async () => {
    if (!printRef.current || !data) return;
    setBusy(true);
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
      const png = await toPng(printRef.current, { pixelRatio: 2, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const h = (printRef.current.offsetHeight / printRef.current.offsetWidth) * 210;
      pdf.addImage(png, "PNG", 0, 0, 210, Math.min(h, 297));
      pdf.save(`Payslip-${data.employee.id}-${month}.pdf`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Payslip · ${monthLabel(month)}`} size="lg"
      footer={<PrimaryButton onClick={download} disabled={!data || busy} className="w-full justify-center sm:w-auto"><Download className="h-4 w-4" /> {busy ? "Preparing…" : "Download PDF"}</PrimaryButton>}>
      <ErrorBanner message={error} />
      {loading && !data ? <Loading /> : data && (
        <>
          <PayslipSheet p={data} />
          {/* Off-screen A4 copy used for the PDF, so it has the same layout on any screen. */}
          <div aria-hidden className="pointer-events-none fixed left-[-10000px] top-0">
            <div ref={printRef} style={{ width: 794 }} className="bg-white p-12"><PayslipSheet p={data} print /></div>
          </div>
        </>
      )}
    </Modal>
  );
}

export function PayslipSheet({ p, print }: { p: Payslip; print?: boolean }) {
  const lastDay = p.lastDay && Number(p.lastDay.slice(8)) < p.daysInMonth ? p.lastDay : null;
  const rows: [string, string][] = [
    ["Days in month", String(p.daysInMonth)],
    ["Present", num(p.present)],
    ["Absent", num(p.absent)],
    ["Weekly off", num(p.weekoff)],
    ["Weekly off worked", num(p.weekoffWorked)],
    ["Paid leave", num(p.paidLeave)],
    [`Lates (${p.freeLates} free)`, `${num(p.lates)}${p.lateDeduction ? ` · −${num(p.lateDeduction)} day` : ""}`],
    ["Short days", `${num(p.shortDays)}${p.shortDeduction ? ` · −${num(p.shortDeduction)} day` : ""}`],
  ];
  return (
    <div className={print ? "text-[13px] text-ink" : "text-sm text-ink"} data-testid={print ? undefined : "payslip"}>
      <div className="flex items-start justify-between gap-4 border-b border-surface-border pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/yes2broker-logo.webp" alt="Yes2Broker" className={print ? "h-12 w-auto" : "h-9 w-auto sm:h-11"} />
        <div className="text-right">
          <p className="text-lg font-semibold">Payslip</p>
          <p className="text-ink-muted">{monthLabel(p.month)}</p>
        </div>
      </div>
      <dl className={`grid gap-x-6 gap-y-2 border-b border-surface-border py-4 ${print ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
        {[["Name", p.employee.name], ["Employee ID", p.employee.id], ["Department", p.employee.department], ["Month", monthLabel(p.month)]].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3"><dt className="text-ink-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
        ))}
      </dl>
      <div className={`grid gap-6 py-4 ${print ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Attendance</h4>
          <dl className="space-y-1.5">
            {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-ink-muted">{k}</dt><dd className="text-right">{v}</dd></div>)}
            <div className="flex justify-between gap-3 border-t border-surface-border pt-1.5 font-semibold"><dt>Net payable days</dt><dd>{num(p.netPayable)}</dd></div>
          </dl>
        </section>
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Salary</h4>
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">Monthly salary</dt><dd>{money(p.monthly)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">Per-day salary</dt><dd>{money(p.perDay)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">× Net payable days</dt><dd>{num(p.netPayable)}</dd></div>
          </dl>
          <Card className="mt-3 flex items-center justify-between bg-brand-soft p-3 shadow-none">
            <span className="font-medium text-brand">Final salary</span>
            <span className="text-lg font-semibold text-ink" data-testid={print ? undefined : "payslip-final"}>{money(p.final)}</span>
          </Card>
        </section>
      </div>
      <p className="border-t border-surface-border pt-3 text-xs text-ink-faint">
        {lastDay ? `Attendance up to ${formatDate(lastDay)}. ` : ""}Lates: first {p.freeLates} a month free, then ½ day each. Under 8 hours = ½ day.
        Published {formatDate(p.publishedAt.slice(0, 10))}. This is a computer-generated payslip.
      </p>
    </div>
  );
}
