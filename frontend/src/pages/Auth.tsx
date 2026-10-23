import { useId, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Eye, EyeOff, Lock, Mail, MailCheck } from "lucide-react";
import { useAuth } from "../app/AuthProvider";
import { Button } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";
import { FullPageSpinner } from "../components/ui/States";

type Mode = "login" | "signup";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function Field({
  label,
  type,
  value,
  onChange,
  error,
  icon,
  autoComplete,
  trailing,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  icon: React.ReactNode;
  autoComplete: string;
  trailing?: React.ReactNode;
}) {
  const id = useId();
  const errId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text">
        {label}
      </label>
      <div
        className={`flex h-11 items-center gap-2 rounded-(--radius-control) border bg-bg-deep/60 px-3 transition focus-within:border-cyan/60 ${
          error ? "border-danger/60" : "border-line-strong"
        }`}
      >
        <span className="text-muted">{icon}</span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? errId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-subtle focus:outline-none"
        />
        {trailing}
      </div>
      {error && (
        <p id={errId} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (m.includes("email not confirmed")) return "Please confirm your email address first — check your inbox for the link.";
  if (m.includes("already registered")) return "An account with this email already exists. Try logging in.";
  if (m.includes("rate limit")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Cannot reach the authentication service. Check your connection.";
  return message;
}

export default function Auth() {
  const { session, loading, signIn, signUp, configError, expired } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get("mode") === "signup" ? "signup" : "login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from;

  if (loading) return <FullPageSpinner label="Restoring your session…" />;
  if (session) return <Navigate to={from && from !== "/auth" ? from : "/dashboard"} replace />;

  const switchMode = (next: Mode) => {
    setParams(next === "signup" ? { mode: "signup" } : {}, { replace: true, state: location.state });
    setErrors({});
    setFormError(null);
    setConfirmationSentTo(null);
  };

  const validate = () => {
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address.";
    if (mode === "signup" && password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (mode === "login" && !password) next.password = "Enter your password.";
    if (mode === "signup" && confirm !== password) next.confirm = "Passwords don't match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
      } else {
        const { needsConfirmation } = await signUp(email.trim(), password);
        if (needsConfirmation) {
          setConfirmationSentTo(email.trim());
          setPassword("");
          setConfirm("");
        }
      }
    } catch (err) {
      setFormError(friendlyAuthError(err instanceof Error ? err.message : "Authentication failed."));
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = (
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      className="-mr-1 grid size-8 place-items-center rounded-md text-muted hover:text-text"
      aria-label={showPassword ? "Hide password" : "Show password"}
      aria-pressed={showPassword}
    >
      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/" className="rounded-lg" aria-label="Cairn home">
          <Logo />
        </Link>
        <Link to="/" className="flex items-center gap-1.5 rounded-md text-sm text-muted hover:text-text">
          <ArrowLeft className="size-4" aria-hidden /> Home
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="panel w-full max-w-md p-6 animate-rise-in sm:p-8">
          <h1 className="text-2xl font-semibold">{mode === "login" ? "Welcome back" : "Create your vault"}</h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "login" ? "Log in to check and restore your backups." : "Sign up to start storing signed, verifiable backups."}
          </p>

          <div role="tablist" aria-label="Authentication mode" className="mt-6 grid grid-cols-2 rounded-lg border border-line bg-bg-deep/60 p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                type="button"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`h-9 rounded-md text-sm font-medium transition ${
                  mode === m ? "bg-panel-2 text-text shadow-sm" : "text-muted hover:text-text"
                }`}
              >
                {m === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>

          {configError && (
            <p role="alert" className="mt-5 flex gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {configError}
            </p>
          )}
          {expired && !formError && (
            <p role="status" className="mt-5 flex gap-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> Your session expired. Please log in again.
            </p>
          )}

          {confirmationSentTo ? (
            <div role="status" className="mt-6 rounded-xl border border-ok/30 bg-ok/10 p-5 text-sm">
              <MailCheck className="mb-2 size-6 text-ok" aria-hidden />
              <p className="font-medium text-text">Check your inbox</p>
              <p className="mt-1 text-muted">
                We sent a confirmation link to <span className="break-all text-text">{confirmationSentTo}</span>. Confirm your
                email, then log in.
              </p>
              <Button variant="secondary" className="mt-4" onClick={() => switchMode("login")}>
                Go to log in
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                error={errors.email}
                icon={<Mail className="size-4" aria-hidden />}
                autoComplete="email"
              />
              <Field
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={setPassword}
                error={errors.password}
                icon={<Lock className="size-4" aria-hidden />}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                trailing={toggle}
              />
              {mode === "signup" && (
                <Field
                  label="Confirm password"
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={setConfirm}
                  error={errors.confirm}
                  icon={<Lock className="size-4" aria-hidden />}
                  autoComplete="new-password"
                />
              )}

              {formError && (
                <p role="alert" className="flex gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {formError}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!!configError}>
                {mode === "login" ? "Log in" : "Create account"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
