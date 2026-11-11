"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  Inbox,
  Building2,
  FlaskConical,
  Settings,
  ChevronRight,
  Search,
  Plus,
  ArrowUpRight,
  Clock3,
  FileText,
  Phone,
  Check,
  X,
  LockKeyhole,
  AlertTriangle,
  Download,
  Loader2,
  CheckCircle2,
  Ban,
  RefreshCw,
  Shield,
  Paperclip,
} from "lucide-react";
import {
  EvidenceCard,
  AnalysisStageBadge,
  ConflictAlert,
} from "@/components/evidence";
import type { CaseDetail, CaseSummary, Risk } from "@/lib/types";
import type { evaluate } from "@/lib/evaluation";
type Overview = {
  cases: CaseSummary[];
  vendors: { id: string; name: string; domain: string; phone: string }[];
  settings: {
    aiConfigured: boolean;
    aiProvider: "Claude" | "OpenAI" | null;
    rampConfigured: boolean;
    rampEnvironment: string;
    mode: string;
    callbackMode: string;
    bankSync: boolean;
  };
};
type EvalReport = ReturnType<typeof evaluate>;
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
const date = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
function Badge({ risk }: { risk: Risk }) {
  return (
    <span className={`badge ${risk}`}>
      <span className="dot" />
      {risk === "high"
        ? "High risk"
        : risk === "medium"
          ? "Needs review"
          : "Low risk"}
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <ShieldCheck size={32} />
      <p>{text}</p>
    </div>
  );
}
function HighlightedEmail({
  text,
  quotes,
}: {
  text: string;
  quotes: string[];
}) {
  const terms = [
    ...new Set(quotes.filter((q) => q.length > 2 && text.includes(q))),
  ].sort((a, b) => b.length - a.length);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let start = text.length,
      match = "";
    for (const term of terms) {
      const at = text.indexOf(term, cursor);
      if (at >= 0 && at < start) {
        start = at;
        match = term;
      }
    }
    if (!match) {
      parts.push(text.slice(cursor));
      break;
    }
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(<mark key={start}>{match}</mark>);
    cursor = start + match.length;
  }
  return <>{parts}</>;
}
export default function Home() {
  const [overview, setOverview] = useState<Overview | null>(null),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<CaseDetail | null>(null),
    [view, setView] = useState("inbox"),
    [tab, setTab] = useState("evidence"),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(false),
    [note, setNote] = useState(""),
    [uploadVendor, setUploadVendor] = useState(""),
    [evaluation, setEvaluation] = useState<EvalReport | null>(null),
    [token, setToken] = useState(""),
    [needsToken, setNeedsToken] = useState(false),
    [sandboxId, setSandboxId] = useState(""),
    [sandboxResult, setSandboxResult] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const latestSelection = useRef("");
  const api = useCallback(
    async (path = "/api/guard", options: RequestInit = {}) => {
      const auth = sessionStorage.getItem("guard-token");
      const headers = new Headers(options.headers);
      if (auth) headers.set("Authorization", `Bearer ${auth}`);
      const response = await fetch(path, { ...options, headers });
      if (response.status === 401) {
        setNeedsToken(true);
        throw new Error("Enter your local access token to continue.");
      }
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Request failed.");
      }
      return response;
    },
    [],
  );
  const refresh = useCallback(
    async (id?: string) => {
      const response = await api();
      const data: Overview = await response.json();
      setOverview(data);
      setUploadVendor((v) => v || data.vendors[0]?.id || "");
      const chosen = id ?? latestSelection.current ?? "";
      const next =
        (data.cases.some((c) => c.id === chosen) ? chosen : "") ||
        data.cases.find((c) => c.risk === "high")?.id ||
        data.cases[0]?.id ||
        "";
      if (next) {
        latestSelection.current = next;
        setSelected(next);
        const r = await api(`/api/guard?id=${encodeURIComponent(next)}`);
        const d = await r.json();
        if (latestSelection.current === next) setDetail(d);
      }
    },
    [api],
  );
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (view === "evaluation")
      api("/api/guard?evaluation=1")
        .then((r) => r.json())
        .then(setEvaluation)
        .catch((e) => setError(e.message));
  }, [view, api]);
  async function choose(id: string) {
    latestSelection.current = id;
    setSelected(id);
    setDetail(null);
    setNote("");
    setTab("evidence");
    try {
      const r = await api(`/api/guard?id=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (latestSelection.current === id) setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await r.json();
      if (payload.action === "sandbox-preview") {
        setSandboxResult(JSON.stringify(result, null, 2));
        return;
      }
      await refresh(result.id ?? selected);
      setNote("");
      setModal(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an .eml file first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("vendorId", uploadVendor);
      const r = await api("/api/guard", { method: "POST", body });
      const result = await r.json();
      await refresh(result.id);
      setModal(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(path: string, name: string) {
    try {
      const r = await api(path);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const cases = overview?.cases ?? [],
    pending = cases.filter((c) => c.status === "pending"),
    high = pending.filter((c) => c.risk === "high");
  const heldCents =
    detail?.bills
      .filter((b) =>
        detail.holds.some((h) => h.billId === b.id && h.status === "confirmed"),
      )
      .reduce((s, b) => s + b.amountCents, 0) ?? 0;
  const visible = cases.filter(
    (c) =>
      (filter === "all" ||
        (filter === "pending" ? c.status === "pending" : c.risk === filter)) &&
      `${c.vendorName} ${c.subject}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <ShieldCheck size={23} />
          </span>
          <span>
            bankchange<span className="brand-small">GUARD</span>
          </span>
        </a>
        <div className="workspace">
          <div className="avatar">AP</div>
          <div>
            <strong>Finance workspace</strong>
            <small>Accounts payable</small>
          </div>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {[
            { id: "inbox", label: "Review inbox", icon: Inbox },
            { id: "vendors", label: "Vendor directory", icon: Building2 },
            {
              id: "evaluation",
              label: "Policy evaluation",
              icon: FlaskConical,
            },
            { id: "settings", label: "Integrations", icon: Settings },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={view === item.id ? "nav-item active" : "nav-item"}
            >
              <item.icon size={18} />
              {item.label}
              {item.id === "inbox" && (
                <span className="nav-count">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-indicator">
            <span className="dot" />
            Local workspace
          </div>
          <p>Callbacks are simulated. Sample bills use simulated holds.</p>
          <div className="profile">
            <div className="avatar">SK</div>
            <div>
              <strong>AP reviewer</strong>
              <small>Local reviewer identity</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />{" "}
            <span>
              {view === "inbox"
                ? "Review inbox"
                : view === "vendors"
                  ? "Vendor directory"
                  : view === "evaluation"
                    ? "Policy evaluation"
                    : "Integrations"}
            </span>
          </div>
          <div className="topbar-right">
            <button
              className="icon-button"
              onClick={() => refresh().catch((e) => setError(e.message))}
              aria-label="Refresh workspace"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">VENDOR PAYMENT PROTECTION</div>
              <h1>
                {view === "inbox"
                  ? "A second look. Before money moves."
                  : view === "vendors"
                    ? "Know who you’re paying."
                    : view === "evaluation"
                      ? "Measure the tradeoffs."
                      : "Connect your workflow."}
              </h1>
              <p>
                {view === "inbox"
                  ? "Investigate bank changes, verify the source, and keep payments protected."
                  : view === "vendors"
                    ? "Trusted vendor records provide the baseline for every investigation."
                    : view === "evaluation"
                      ? "Reproducible scoring against 100 labeled synthetic requests."
                      : "Start locally. Add live analysis and a Ramp sandbox when you’re ready."}
              </p>
            </div>
            {view === "inbox" && (
              <button
                className="button primary"
                onClick={() => {
                  setError("");
                  setModal(true);
                }}
              >
                <Plus size={17} />
                New investigation
              </button>
            )}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "inbox" && (
            <>
              <div className="stats">
                <div>
                  <span>
                    Awaiting decision <Inbox size={16} />
                  </span>
                  <strong>{pending.length.toString().padStart(2, "0")}</strong>
                  <small>Every bank change needs approval</small>
                </div>
                <div>
                  <span>
                    High-risk requests <AlertTriangle size={16} />
                  </span>
                  <strong className="risk-number">
                    {high.length.toString().padStart(2, "0")}
                  </strong>
                  <small>Hold + trusted-number verification</small>
                </div>
                <div>
                  <span>
                    Active case exposure <LockKeyhole size={16} />
                  </span>
                  <strong>{detail ? money(detail.amountCents) : "—"}</strong>
                  <small>
                    {heldCents
                      ? `${money(heldCents)} under ${detail?.holds.some((h) => h.mode === "ramp-sandbox") ? "sandbox" : "simulated"} hold`
                      : "No confirmed hold for active case"}
                  </small>
                </div>
                <div>
                  <span>
                    Human oversight <ShieldCheck size={16} />
                  </span>
                  <strong>Always on</strong>
                  <small>No automatic bank-detail updates</small>
                </div>
              </div>
              <div className="review-layout">
                <section className="queue">
                  <div className="queue-top">
                    <h2>
                      Investigations <span>{cases.length}</span>
                    </h2>
                    <div className="search">
                      <Search size={15} />
                      <input
                        aria-label="Search investigations"
                        placeholder="Search vendors or requests"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <div className="filters">
                      {[
                        ["all", "All"],
                        ["pending", "Pending"],
                        ["high", "High risk"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          className={filter === id ? "selected" : ""}
                          onClick={() => setFilter(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="case-list">
                    {visible.map((c) => (
                      <button
                        key={c.id}
                        className={`case-item ${selected === c.id ? "selected" : ""}`}
                        onClick={() => choose(c.id)}
                      >
                        <div className="case-row">
                          <Badge risk={c.risk} />
                          <span className="case-score">
                            {c.score}
                            <small>/100</small>
                          </span>
                        </div>
                        <h3>{c.vendorName}</h3>
                        <p>{c.subject}</p>
                        <div className="case-meta">
                          <span>
                            <Clock3 size={12} />
                            {date(c.createdAt)}
                          </span>
                          <span className={`decision-status ${c.status}`}>
                            {c.status}
                          </span>
                        </div>
                        {c.holdCount > 0 && (
                          <div className="held-label">
                            <LockKeyhole size={12} />
                            {c.holdCount} payment hold · {money(c.amountCents)}
                          </div>
                        )}
                      </button>
                    ))}
                    {!visible.length && (
                      <Empty
                        text={
                          overview
                            ? "No investigations match this filter."
                            : "Loading investigations…"
                        }
                      />
                    )}
                  </div>
                  <div className="queue-foot">
                    <ShieldCheck size={14} />
                    All decisions leave an audit trail
                  </div>
                </section>
                <section className="case-detail">
                  {detail ? (
                    <>
                      <div className="detail-heading">
                        <div>
                          <div className="detail-kicker">
                            BANK CHANGE REQUEST{" "}
                            <span>#{detail.id.slice(-6).toUpperCase()}</span>
                          </div>
                          <h2>{detail.vendorName}</h2>
                          <div className="detail-sub">
                            <Badge risk={detail.risk} />
                            <span
                              className={`decision-status ${detail.status}`}
                            >
                              {detail.status === "pending"
                                ? "Awaiting human decision"
                                : detail.status}
                            </span>
                          </div>
                        </div>
                        <div className={`score-orb ${detail.risk}`}>
                          <strong>{detail.score}</strong>
                          <small>risk points</small>
                        </div>
                      </div>
                      <div className={`risk-callout ${detail.risk}`}>
                        <Shield size={19} />
                        <div>
                          <strong>
                            {detail.risk === "high"
                              ? "Protect payments. Verify the request."
                              : detail.risk === "medium"
                                ? "A closer review is required."
                                : "Ready for standard human review."}
                          </strong>
                          <p>{detail.assessment.summary}</p>
                        </div>
                      </div>
                      <div className="detail-tabs" role="tablist">
                        {[
                          ["evidence", "Evidence"],
                          ["email", "Original email"],
                          ["verification", "Verification"],
                          ["audit", "Audit trail"],
                        ].map(([id, label]) => (
                          <button
                            key={id}
                            role="tab"
                            aria-selected={tab === id}
                            onClick={() => setTab(id)}
                            className={tab === id ? "active" : ""}
                          >
                            {label}
                            {id === "evidence" && (
                              <span>{detail.assessment.evidence.length}</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="tab-body">
                        {tab === "evidence" && (
                          <>
                            {detail.assessment.conflicts && (
                              <ConflictAlert fields={detail.assessment.conflicts} />
                            )}
                            <div className="section-title">
                              <h3>Investigation stages</h3>
                              <span>Pipeline status</span>
                            </div>
                            <div className="flex flex-wrap mb-6">
                              {detail.assessment.stages && Object.entries(detail.assessment.stages).map(([stage, status]) => (
                                <AnalysisStageBadge key={stage} stage={stage} status={status} />
                              ))}
                            </div>

                            <div className="section-title">
                              <h3>What changed</h3>
                              <span>Compare with trusted vendor record</span>
                            </div>
                            <div className="bank-comparison">
                              <div>
                                <span className="mini-label">
                                  CURRENT · ON FILE
                                </span>
                                <strong>{detail.vendor.bankName}</strong>
                                <p>Account ···· {detail.vendor.accountLast4}</p>
                                <small>
                                  {detail.vendor.country} · routing{" "}
                                  {detail.vendor.routing}
                                </small>
                              </div>
                              <ArrowUpRight size={19} />
                              <div>
                                <span className="mini-label">
                                  PROPOSED · UNVERIFIED
                                </span>
                                <strong>
                                  {detail.proposed.bankName || "Not extracted"}
                                </strong>
                                <p>
                                  Account ····{" "}
                                  {detail.proposed.accountLast4 || "unknown"}
                                </p>
                                <small>
                                  {detail.proposed.country || "Unknown country"}{" "}
                                  · routing{" "}
                                  {detail.proposed.routing || "not supplied"}
                                </small>
                              </div>
                            </div>
                            {detail.assessment.provenance && (
                              <div className="provenance-card mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                                <div className="flex items-center gap-2 mb-2 text-blue-800 font-semibold">
                                  <ShieldCheck size={18} />
                                  <span>Email Provenance</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-500">DKIM:</span>{" "}
                                    <span className={detail.assessment.provenance.authStatus.dkim === "pass" ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                      {detail.assessment.provenance.authStatus.dkim.toUpperCase()}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">SPF:</span>{" "}
                                    <span className={detail.assessment.provenance.authStatus.spf === "pass" ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                      {detail.assessment.provenance.authStatus.spf.toUpperCase()}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Alignment:</span>{" "}
                                    <span className={detail.assessment.provenance.authStatus.aligned ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                      {detail.assessment.provenance.authStatus.aligned ? "ALIGNED" : "MISALIGNED"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Receiver:</span>{" "}
                                    <span className={detail.assessment.provenance.authStatus.trustedReceiver ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                      {detail.assessment.provenance.authStatus.trustedReceiver ? "TRUSTED" : "UNTRUSTED"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="section-title">
                              <h3>Evidence breakdown</h3>
                              <span>
                                Policy {detail.assessment.policyVersion}
                              </span>
                            </div>
                            <div className="evidence-list">
                              {detail.assessment.evidence.map((e) => (
                                <EvidenceCard key={e.id} evidence={e} />
                              ))}
                            </div>
                            <div className="coverage">
                              <strong>Analysis coverage</strong>
                              <p>{detail.assessment.aiStatus}</p>
                              {detail.assessment.missing.length > 0 && (
                                <p>
                                  Needs review:{" "}
                                  {detail.assessment.missing.join(" · ")}
                                </p>
                              )}
                              <small>
                                Risk points express policy severity, not the
                                probability of fraud.
                              </small>
                            </div>
                            <div className="section-title">
                              <h3>Affected bills</h3>
                              <span>Payment protection</span>
                            </div>
                            {detail.bills.map((b) => {
                              const h = detail.holds.find(
                                (h) => h.billId === b.id,
                              );
                              return (
                                <div className="bill" key={b.id}>
                                  <div className="bill-icon">
                                    <FileText size={18} />
                                  </div>
                                  <div>
                                    <strong>{b.invoice}</strong>
                                    <small>
                                      Due{" "}
                                      {new Date(b.dueDate).toLocaleDateString(
                                        "en-US",
                                      )}{" "}
                                      ·{" "}
                                      {b.source === "sample"
                                        ? "Sample bill"
                                        : "Ramp sandbox"}
                                    </small>
                                  </div>
                                  <div className="bill-amount">
                                    <strong>{money(b.amountCents)}</strong>
                                    <span
                                      className={
                                        h?.status === "confirmed"
                                          ? "hold-state"
                                          : "neutral-state"
                                      }
                                    >
                                      {h
                                        ? `${h.mode === "simulated" ? "Simulated " : ""}${h.status === "confirmed" ? "on hold" : h.status}`
                                        : "No hold"}
                                    </span>
                                  </div>
                                  {h && (
                                    <p className="bill-detail">{h.detail}</p>
                                  )}
                                </div>
                              );
                            })}
                            {detail.holds.some(
                              (h) => h.status === "failed",
                            ) && (
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() =>
                                  act({ action: "retry", id: selected })
                                }
                              >
                                <RefreshCw size={15} />
                                Retry failed holds
                              </button>
                            )}
                          </>
                        )}
                        {tab === "email" && (
                          <>
                            <div className="mail-header">
                              <h3>{detail.subject}</h3>
                              <dl>
                                <dt>From</dt>
                                <dd>{detail.sender}</dd>
                                <dt>Reply-To</dt>
                                <dd>{detail.replyTo}</dd>
                                <dt>To</dt>
                                <dd>Accounts payable</dd>
                              </dl>
                            </div>
                            <div className="mail-body">
                              <HighlightedEmail
                                text={detail.body}
                                quotes={detail.assessment.evidence.flatMap(
                                  (e) => (e.quote ? [e.quote] : []),
                                )}
                              />
                            </div>
                            <div className="section-title">
                              <h3>Attachments</h3>
                              <button
                                className="text-button"
                                onClick={() =>
                                  download(
                                    `/api/files/${selected}?email=1`,
                                    "original.eml",
                                  )
                                }
                              >
                                <Download size={13} />
                                Original .eml
                              </button>
                            </div>
                            {detail.attachments.map((a) => (
                              <div className="attachment" key={a.id}>
                                <Paperclip size={17} />
                                <div>
                                  <strong>{a.name}</strong>
                                  <small>
                                    {JSON.parse(a.metadata).pages ?? "?"}{" "}
                                    page(s) · original retained
                                  </small>
                                </div>
                                <button
                                  className="icon-button"
                                  aria-label={`Download ${a.name}`}
                                  onClick={() =>
                                    download(`/api/files/${a.id}`, a.name)
                                  }
                                >
                                  <Download size={16} />
                                </button>
                              </div>
                            ))}
                            <details className="raw-headers">
                              <summary>View supplied email headers</summary>
                              <pre>{detail.headers}</pre>
                            </details>
                          </>
                        )}
                        {tab === "verification" && (
                          <>
                            <div className="verification-contact">
                              <div className="contact-icon">
                                <Phone size={23} />
                              </div>
                              <div>
                                <div className="mini-label">
                                  TRUSTED CONTACT · VENDOR RECORD
                                </div>
                                <h3>{detail.vendor.phone}</h3>
                                <p>{detail.vendor.name}</p>
                              </div>
                              <span className="env-pill">
                                Simulated callback
                              </span>
                            </div>
                            <div className="coverage">
                              <strong>
                                Verify through a channel you already trust.
                              </strong>
                              <p>
                                The callback uses the saved vendor phone number.
                                Numbers from the email and bank letter are never
                                used.
                              </p>
                              <small>
                                The simulator saves a transcript without placing
                                a call.
                              </small>
                            </div>
                            {detail.callback &&
                            detail.callback.outcome !== "pending" ? (
                              <>
                                <div
                                  className={`callback-outcome ${detail.callback.outcome}`}
                                >
                                  <CheckCircle2 size={18} />
                                  <strong>
                                    Vendor{" "}
                                    {detail.callback.outcome === "confirmed"
                                      ? "confirmed the change"
                                      : detail.callback.outcome === "denied"
                                        ? "denied the change"
                                        : "could not verify the change"}
                                  </strong>
                                  <span>Simulation</span>
                                </div>
                                <pre className="transcript">
                                  {detail.callback.transcript}
                                </pre>
                              </>
                            ) : (
                              <div className="simulation">
                                <h3>Run callback simulation</h3>
                                <p>
                                  Choose the simulated vendor response. The
                                  transcript will be saved with the
                                  investigation.
                                </p>
                                <div className="simulation-actions">
                                  <button
                                    className="button secondary"
                                    disabled={
                                      busy || detail.status !== "pending"
                                    }
                                    onClick={() =>
                                      act({
                                        action: "callback",
                                        id: selected,
                                        outcome: "denied",
                                      })
                                    }
                                  >
                                    <Ban size={15} />
                                    Vendor denies
                                  </button>
                                  <button
                                    className="button secondary"
                                    disabled={
                                      busy || detail.status !== "pending"
                                    }
                                    onClick={() =>
                                      act({
                                        action: "callback",
                                        id: selected,
                                        outcome: "confirmed",
                                      })
                                    }
                                  >
                                    <Check size={15} />
                                    Vendor confirms
                                  </button>
                                  <button
                                    className="text-button"
                                    disabled={
                                      busy || detail.status !== "pending"
                                    }
                                    onClick={() =>
                                      act({
                                        action: "callback",
                                        id: selected,
                                        outcome: "inconclusive",
                                      })
                                    }
                                  >
                                    Inconclusive
                                  </button>
                                </div>
                              </div>
                            )}
                            <div className="section-title">
                              <h3>Historical correspondence</h3>
                              <span>Stored vendor baseline</span>
                            </div>
                            {(
                              JSON.parse(detail.vendor.history) as string[]
                            ).map((h, i) => (
                              <blockquote className="history-message" key={i}>
                                {h}
                              </blockquote>
                            ))}
                          </>
                        )}
                        {tab === "audit" && (
                          <>
                            <div className="section-title">
                              <h3>Investigation history</h3>
                              <span>
                                {detail.events.length} recorded events
                              </span>
                            </div>
                            <div className="timeline">
                              {detail.events.map((e) => (
                                <div key={e.id} className="timeline-item">
                                  <span className="timeline-dot" />
                                  <div>
                                    <div className="timeline-title">
                                      <strong>
                                        {e.type.replaceAll("_", " ")}
                                      </strong>
                                      <small>{date(e.createdAt)}</small>
                                    </div>
                                    <p>{e.detail}</p>
                                    <small>{e.actor}</small>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="decision-panel">
                        {detail.status === "pending" ? (
                          <>
                            <div className="decision-panel-title">
                              <strong>Record your decision</strong>
                              <span>Human approval required</span>
                            </div>
                            <label htmlFor="decision-note" className="sr-only">
                              Decision note
                            </label>
                            <textarea
                              id="decision-note"
                              placeholder="Add your review note (required, at least 8 characters)…"
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              rows={2}
                            />
                            <div className="decision-actions">
                              <button
                                className="button danger"
                                disabled={busy || note.trim().length < 8}
                                onClick={() =>
                                  act({
                                    action: "decide",
                                    id: selected,
                                    decision: "reject",
                                    note,
                                  })
                                }
                              >
                                <X size={16} />
                                Reject change
                              </button>
                              <button
                                className="button primary"
                                disabled={
                                  busy ||
                                  note.trim().length < 8 ||
                                  (detail.risk !== "low" &&
                                    detail.callback?.outcome !== "confirmed")
                                }
                                onClick={() =>
                                  act({
                                    action: "decide",
                                    id: selected,
                                    decision: "approve",
                                    note,
                                  })
                                }
                              >
                                {busy ? (
                                  <Loader2 className="spin" size={16} />
                                ) : (
                                  <Check size={16} />
                                )}
                                Approve change
                              </button>
                            </div>
                            {detail.risk !== "low" &&
                              detail.callback?.outcome !== "confirmed" && (
                                <small className="approval-hint">
                                  <LockKeyhole size={12} />
                                  Approval unlocks after a confirmed callback.
                                </small>
                              )}
                          </>
                        ) : (
                          <>
                            <div className="recorded-decision">
                              <CheckCircle2 size={18} />
                              <div>
                                <strong>Change {detail.status}</strong>
                                <p>{detail.decisions[0]?.note}</p>
                              </div>
                            </div>
                            <small>
                              Decision recorded locally. Ramp bank details were
                              not changed.
                            </small>
                            {detail.holds.some(
                              (h) => h.status === "confirmed",
                            ) && (
                              <div className="release-form">
                                <label htmlFor="release-note">
                                  Existing payment holds remain active.
                                </label>
                                <textarea
                                  id="release-note"
                                  placeholder="Explain why it is safe to release payment…"
                                  value={note}
                                  onChange={(e) => setNote(e.target.value)}
                                  rows={2}
                                />
                                <button
                                  className="button secondary"
                                  disabled={busy || note.trim().length < 8}
                                  onClick={() =>
                                    act({
                                      action: "release",
                                      id: selected,
                                      note,
                                    })
                                  }
                                >
                                  Explicitly release hold
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <Empty
                      text={
                        selected
                          ? "Loading investigation…"
                          : "Start an investigation by uploading an email or loading a sample case."
                      }
                    />
                  )}
                </section>
              </div>
            </>
          )}
          {view === "vendors" && (
            <section className="directory">
              <div className="section-title">
                <h2>Trusted vendor directory</h2>
                <span>{overview?.vendors.length ?? 0} vendors</span>
              </div>
              <p className="muted">
                Baseline contacts are seeded locally. Incoming requests cannot
                overwrite them.
              </p>
              {overview?.vendors.map((v) => (
                <div className="vendor-row" key={v.id}>
                  <div className="vendor-avatar">{v.name.slice(0, 1)}</div>
                  <div>
                    <h3>{v.name}</h3>
                    <p>{v.domain}</p>
                  </div>
                  <div className="vendor-phone">
                    <Phone size={15} />
                    {v.phone}
                    <small>Trusted number on file</small>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setSearch(v.name);
                      setView("inbox");
                      setFilter("all");
                    }}
                  >
                    View requests
                    <ChevronRight size={14} />
                  </button>
                </div>
              ))}
            </section>
          )}
          {view === "evaluation" && (
            <section className="evaluation">
              {evaluation ? (
                <>
                  <div className="evaluation-intro">
                    <FlaskConical size={24} />
                    <div>
                      <h2>{evaluation.dataset}</h2>
                      <p>{evaluation.method}</p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() =>
                        download("/api/guard?evaluation=1", "evaluation.json")
                      }
                    >
                      <Download size={15} />
                      Export results
                    </button>
                  </div>
                  <div className="eval-label">
                    HELD-OUT VARIANTS · {evaluation.heldOut.count} CASES ·
                    HIGH-RISK HOLD THRESHOLD ≥ {evaluation.thresholds.high}
                  </div>
                  <div className="stats">
                    <div>
                      <span>Hold precision</span>
                      <strong>
                        {evaluation.heldOut.holdPrecision === null
                          ? "N/A"
                          : `${(evaluation.heldOut.holdPrecision * 100).toFixed(1)}%`}
                      </strong>
                      <small>Fraud among automatically held cases</small>
                    </div>
                    <div>
                      <span>Hold recall</span>
                      <strong>
                        {(evaluation.heldOut.holdRecall * 100).toFixed(1)}%
                      </strong>
                      <small>Fraud that reaches high-risk tier</small>
                    </div>
                    <div>
                      <span>Legitimate hold rate</span>
                      <strong>
                        {(evaluation.heldOut.legitimateHoldRate * 100).toFixed(
                          1,
                        )}
                        %
                      </strong>
                      <small>Legitimate requests placed on hold</small>
                    </div>
                    <div>
                      <span>Review precision</span>
                      <strong>
                        {(
                          (evaluation.heldOut.reviewPrecision ?? 0) * 100
                        ).toFixed(1)}
                        %
                      </strong>
                      <small>Fraud among medium + high requests</small>
                    </div>
                  </div>
                  <div className="eval-grid">
                    <div className="matrix">
                      <h3>High-risk hold confusion matrix</h3>
                      <p>
                        Actual labels × automatic hold decision · held-out cases
                      </p>
                      <div className="matrix-cells">
                        <div>
                          <small>Fraud held · true positive</small>
                          <strong>{evaluation.heldOut.tp}</strong>
                        </div>
                        <div>
                          <small>Legitimate held · false positive</small>
                          <strong>{evaluation.heldOut.fp}</strong>
                        </div>
                        <div>
                          <small>Fraud not held · false negative</small>
                          <strong>{evaluation.heldOut.fn}</strong>
                        </div>
                        <div>
                          <small>Legitimate not held · true negative</small>
                          <strong>{evaluation.heldOut.tn}</strong>
                        </div>
                      </div>
                    </div>
                    <div className="limitations">
                      <h3>Performance by attack family</h3>
                      <div className="family-metrics">
                        {Object.entries(evaluation.byFamily).map(([name, m]) => (
                          <div key={name} className="family-row">
                            <span>{name}</span>
                            <strong>{(m.holdRecall * 100).toFixed(0)}% recall</strong>
                            <small>{m.count} cases</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="eval-results">
                    <div className="section-title">
                      <h3>All 100 cases</h3>
                      <span>Policy {evaluation.policyVersion}</span>
                    </div>
                    <div className="eval-table">
                      <div className="eval-row table-head">
                        <span>Scenario</span>
                        <span>Actual label</span>
                        <span>Split</span>
                        <span>Policy result</span>
                        <span>Points</span>
                      </div>
                      {evaluation.rows.map((r) => (
                        <div className="eval-row" key={r.id}>
                          <span>
                            {r.family}
                            <small>{r.id}</small>
                          </span>
                          <span>{r.label}</span>
                          <span>{r.split}</span>
                          <Badge risk={r.risk} />
                          <strong>{r.score}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <Empty text="Running deterministic evaluation…" />
              )}
            </section>
          )}
          {view === "settings" && (
            <section className="integration-grid">
              <div className="integration-card">
                <div className="integration-card-top">
                  <ShieldCheck size={23} />
                  <span
                    className={`env-pill ${overview?.settings.aiConfigured ? "connected" : ""}`}
                  >
                    {overview?.settings.aiConfigured
                      ? "Configured"
                      : "Rules mode"}
                  </span>
                </div>
                <h2>AI investigation</h2>
                <p>
                  Structured thread analysis, PDF vision, and historical
                  correspondence embeddings.
                </p>
                <dl>
                  <dt>Connection</dt>
                  <dd>
                    {overview?.settings.aiConfigured
                      ? `${overview.settings.aiProvider} configured · live calls on new uploads`
                      : "No API key configured"}
                  </dd>
                  <dt>Sample cases</dt>
                  <dd>Deterministic scoring · no AI calls</dd>
                </dl>
                <div className="setup-note">
                  Set <code>ANTHROPIC_API_KEY</code> for Claude or{" "}
                  <code>OPENAI_API_KEY</code> for OpenAI in your local{" "}
                  <code>.env</code> and restart. Upload a new email to run live
                  analysis.
                </div>
              </div>
              <div className="integration-card">
                <div className="integration-card-top">
                  <Building2 size={23} />
                  <span className="env-pill">Sandbox only</span>
                </div>
                <h2>Ramp</h2>
                <p>
                  Read vendor and bill records. Place and release sandbox bill
                  holds with confirmed API responses.
                </p>
                <dl>
                  <dt>Connection</dt>
                  <dd>
                    {overview?.settings.rampConfigured
                      ? "Token configured"
                      : "No sandbox token configured"}
                  </dd>
                  <dt>Sample bills</dt>
                  <dd>Always simulated · no Ramp mutations</dd>
                </dl>
                <div className="setup-note">
                  Set <code>RAMP_ACCESS_TOKEN</code> and{" "}
                  <code>RAMP_ENVIRONMENT=sandbox</code>. Use the setup script to
                  add trusted vendor context before importing sandbox bills.
                </div>
                <label htmlFor="sandbox-id">
                  Inspect a Ramp sandbox vendor
                </label>
                <input
                  id="sandbox-id"
                  placeholder="Ramp vendor UUID"
                  value={sandboxId}
                  onChange={(e) => setSandboxId(e.target.value)}
                />
                <button
                  className="button secondary"
                  disabled={busy || !sandboxId}
                  onClick={() =>
                    act({ action: "sandbox-preview", vendorId: sandboxId })
                  }
                >
                  Read sandbox vendor & bills
                  <ArrowUpRight size={14} />
                </button>
                {sandboxResult && (
                  <pre className="sandbox-output">{sandboxResult}</pre>
                )}
              </div>
              <div className="integration-card">
                <div className="integration-card-top">
                  <Phone size={23} />
                  <span className="env-pill">Simulated</span>
                </div>
                <h2>Callback verification</h2>
                <p>
                  Local transcript simulation using trusted vendor phone
                  numbers. No telephony provider is connected.
                </p>
                <div className="setup-note">
                  The workspace uses callback simulations. A simulated
                  confirmation is never presented as real verification.
                </div>
              </div>
              <div className="integration-card">
                <div className="integration-card-top">
                  <LockKeyhole size={23} />
                  <span className="env-pill">Local reviewer</span>
                </div>
                <h2>Access & approval</h2>
                <p>
                  Every bank change requires a human decision. This local
                  workspace uses one reviewer identity.
                </p>
                <div className="setup-note">
                  The server binds to localhost. Set{" "}
                  <code>APP_ACCESS_TOKEN</code> to require a token. Production
                  identity, roles and tamper-resistant audit storage are not
                  implemented.
                </div>
              </div>
            </section>
          )}
          <footer className="page-footer">
            <ShieldCheck size={13} />
            Bank-Change Guard{" "}
            <span>Evidence before action. A human at every decision.</span>
          </footer>
        </main>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={() => !busy && setModal(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <div className="eyebrow">NEW INVESTIGATION</div>
                <h2 id="new-title">Start with the request.</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close upload"
                disabled={busy}
                onClick={() => setModal(false)}
              >
                <X size={19} />
              </button>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}
            <label htmlFor="vendor">Match a trusted vendor</label>
            <select
              id="vendor"
              value={uploadVendor}
              onChange={(e) => setUploadVendor(e.target.value)}
            >
              {overview?.vendors.map((v) => (
                <option value={v.id} key={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <label htmlFor="email-upload" className="upload-zone">
              <FileText size={30} />
              <strong>Upload a bank-change email</strong>
              <span>.eml with attachments · up to 12 MB · 5 attachments</span>
              <input
                id="email-upload"
                ref={fileRef}
                type="file"
                accept=".eml,message/rfc822"
              />
            </label>
            <button
              className="button primary full"
              disabled={busy}
              onClick={upload}
            >
              {busy ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Search size={17} />
              )}
              Investigate request
            </button>
            <div className="sample-divider">OR OPEN A SAMPLE CASE</div>
            <div className="sample-choices">
              {[
                ["attack", "Lookalike attack", "$48K bill · high risk"],
                [
                  "legitimate",
                  "Routine update",
                  "Domestic bank · low risk fixture",
                ],
                [
                  "ambiguous",
                  "Needs a closer look",
                  "Country change · medium risk",
                ],
              ].map(([key, title, desc]) => (
                <div className="sample-choice" key={key}>
                  <button
                    disabled={busy}
                    onClick={() => act({ action: "sample", key })}
                  >
                    <strong>
                      {title}
                      <ChevronRight size={15} />
                    </strong>
                    <small>{desc}</small>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Download ${key} email`}
                    onClick={() =>
                      download(`/api/guard?fixture=${key}`, `${key}.eml`)
                    }
                  >
                    <Download size={14} />
                  </button>
                </div>
              ))}
            </div>
            <p className="modal-note">
              Uploaded emails, including samples, are checked using unverified
              authentication headers.
            </p>
          </section>
        </div>
      )}
      {needsToken && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="token-title"
          >
            <h2 id="token-title">Workspace access</h2>
            <p>Enter the access token configured on this local server.</p>
            <label htmlFor="access-token">Access token</label>
            <input
              id="access-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button
              className="button primary"
              onClick={() => {
                sessionStorage.setItem("guard-token", token);
                setNeedsToken(false);
                setError("");
                refresh().catch((e) => setError(e.message));
              }}
            >
              Open workspace
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
