import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Binary,
  FileLock2,
  FileSignature,
  FileWarning,
  FileX2,
  History,
  Lock,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Upload,
} from "lucide-react";
import { useAuth } from "../app/AuthProvider";
import { LoadingIntro } from "../components/LoadingIntro";
import { Vault3D } from "../components/Vault3D";
import { ButtonLink } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";
import { safeStorageGet, safeStorageSet } from "../lib/browser";

const INTRO_KEY = "cairn.introSeen";

const FEATURES = [
  {
    icon: Binary,
    title: "SHA-256 fingerprints",
    body: "Every upload is hashed on the server. Each check re-downloads the object and compares the fingerprint byte for byte.",
  },
  {
    icon: FileSignature,
    title: "Signed version records",
    body: "Version metadata is sealed with an HMAC-SHA256 signature, so an edited database row is detected as tampering.",
  },
  {
    icon: History,
    title: "Version history",
    body: "Uploading the same name adds a new version. Older versions stay available to download and restore.",
  },
  {
    icon: RotateCcw,
    title: "Verified restore",
    body: "Restore copies the newest clean version into a fresh, newly signed version — after re-checking its hash.",
  },
  {
    icon: Bell,
    title: "Security alerts",
    body: "Modified, missing and tampered objects raise alerts. Three or more changes in one check raise a mass-change alert.",
  },
  {
    icon: Lock,
    title: "Private storage",
    body: "Files live in a private bucket. The browser never touches storage; downloads go through the API after an integrity check.",
  },
];

const ATTACKS = [
  { icon: FileWarning, name: "Corrupt", result: "Modified", body: "Extra bytes are injected into a stored object. The SHA-256 no longer matches.", tone: "text-danger" },
  { icon: FileX2, name: "Delete", result: "Missing", body: "The object is removed from cloud storage. The check reports it missing.", tone: "text-warn" },
  { icon: FileLock2, name: "Encrypt", result: "Modified", body: "Ransomware-style: the object is overwritten with random bytes.", tone: "text-danger" },
  { icon: ShieldX, name: "Tamper record", result: "Record tampered", body: "The stored hash in the database row is altered. The HMAC signature fails.", tone: "text-danger" },
];

const STEPS = [
  { icon: Upload, title: "Back up", body: "Upload a file up to 10 MB." },
  { icon: FileSignature, title: "Fingerprint & sign", body: "SHA-256 plus a signed version record." },
  { icon: ShieldCheck, title: "Verify & restore", body: "Detect damage, then roll back to a clean version." },
];

export default function Landing() {
  const { session } = useAuth();
  const [showIntro, setShowIntro] = useState(() => safeStorageGet("session", INTRO_KEY) !== "1");

  const finishIntro = () => {
    safeStorageSet("session", INTRO_KEY, "1");
    setShowIntro(false);
  };

  return (
    <div className="min-h-dvh overflow-x-clip">
      {showIntro && <LoadingIntro onDone={finishIntro} />}

      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link to="/" className="rounded-lg" aria-label="Cairn home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2" aria-label="Account">
          {session ? (
            <ButtonLink to="/dashboard" size="sm" icon={<ArrowRight className="size-4" aria-hidden />}>
              Open dashboard
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to="/auth" variant="ghost" size="sm">
                Log in
              </ButtonLink>
              <ButtonLink to="/auth?mode=signup" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-auto grid max-w-7xl items-center gap-6 px-4 pb-12 pt-6 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-20 lg:pt-12">
          <div className="relative z-10 animate-rise-in">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan/25 bg-cyan/5 px-3 py-1 text-xs font-medium text-cyan">
              <ShieldCheck className="size-3.5" aria-hidden /> Secure cloud backup with integrity checks
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
              Know your backups
              <br />
              are <span className="text-cyan">exactly</span> what you saved.
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
              Cairn fingerprints every file with SHA-256, signs every version record, and tells you the moment anything is
              modified, deleted or tampered with — then restores a clean copy.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to={session ? "/dashboard" : "/auth?mode=signup"} size="lg" icon={<ArrowRight className="size-4" aria-hidden />}>
                {session ? "Open dashboard" : "Get started"}
              </ButtonLink>
              {!session && (
                <ButtonLink to="/auth" variant="secondary" size="lg">
                  Log in
                </ButtonLink>
              )}
            </div>
          </div>

          <div className="relative h-[320px] sm:h-[420px] lg:h-[520px]">
            <div className="absolute inset-0 rounded-full bg-cyan/5 blur-3xl" aria-hidden />
            {!showIntro && <Vault3D status="healthy" decorativeBlocks={14} spin={0.2} showLabel={false} className="h-full w-full" />}
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6" aria-labelledby="how-title">
          <h2 id="how-title" className="sr-only">
            How Cairn works
          </h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="panel flex items-center gap-4 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-cyan/25 bg-cyan/10 text-cyan">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-subtle">Step {i + 1}</p>
                  <p className="font-medium text-text">{title}</p>
                  <p className="text-sm text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24" aria-labelledby="features-title">
          <div className="max-w-2xl">
            <h2 id="features-title" className="text-2xl font-semibold sm:text-3xl">
              Integrity you can check, not just trust
            </h2>
            <p className="mt-3 text-muted">
              Each integrity check runs three tests per version, in order: signature, existence, fingerprint.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="panel p-5">
                <Icon className="size-5 text-cyan" aria-hidden />
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Demo scenarios */}
        <section className="border-y border-line/70 bg-bg-deep/50" aria-labelledby="demo-title">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet">Demo mode</p>
                <h2 id="demo-title" className="mt-2 text-2xl font-semibold sm:text-3xl">
                  Attack your own sample vault
                </h2>
                <p className="mt-3 text-muted">
                  Create demo files, launch a simulated attack, run an integrity check and watch Cairn catch it. Attacks only ever
                  touch demo files — the server refuses anything else.
                </p>
              </div>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ATTACKS.map(({ icon: Icon, name, result, body, tone }) => (
                <article key={name} className="panel p-5">
                  <div className="flex items-center justify-between">
                    <Icon className={`size-5 ${tone}`} aria-hidden />
                    <span className={`rounded-full border border-current/30 px-2 py-0.5 text-[11px] font-medium ${tone}`}>
                      Detected: {result}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:py-20">
          <h2 className="text-2xl font-semibold sm:text-3xl">Ready to seal your first backup?</h2>
          <p className="mx-auto mt-3 max-w-lg text-muted">Free to try. Upload a file, run a check, and see the vault respond.</p>
          <ButtonLink to={session ? "/dashboard" : "/auth?mode=signup"} size="lg" className="mt-8" icon={<ArrowRight className="size-4" aria-hidden />}>
            {session ? "Open dashboard" : "Create your vault"}
          </ButtonLink>
        </section>
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:px-6">
          <Logo />
          <p>Cairn — Cloud Security mini project. SHA-256 · HMAC-SHA256 · Supabase · FastAPI.</p>
        </div>
      </footer>
    </div>
  );
}
