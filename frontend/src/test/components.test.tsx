import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const authState = vi.hoisted(() => ({ session: null as unknown, loading: false }));

vi.mock("../app/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, waitForHealth: vi.fn(() => new Promise<boolean>(() => {})) };
});

import { ProtectedRoute } from "../components/ProtectedRoute";
import { StatusBadge } from "../components/StatusBadge";
import { Vault3D } from "../components/Vault3D";
import { LoadingIntro } from "../components/LoadingIntro";

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/auth" element={<p>Auth page</p>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <p>Secret dashboard</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("redirects to /auth without a session", () => {
    authState.session = null;
    renderProtected();
    expect(screen.getByText("Auth page")).toBeInTheDocument();
    expect(screen.queryByText("Secret dashboard")).not.toBeInTheDocument();
  });

  it("renders the page with a session", () => {
    authState.session = { access_token: "t" };
    renderProtected();
    expect(screen.getByText("Secret dashboard")).toBeInTheDocument();
  });

  it("waits while the session is being restored", () => {
    authState.session = null;
    authState.loading = true;
    renderProtected();
    expect(screen.getByText(/restoring your session/i)).toBeInTheDocument();
    authState.loading = false;
  });
});

describe("StatusBadge", () => {
  it("always shows a text label", () => {
    render(<StatusBadge status="record_tampered" />);
    expect(screen.getByText("Record tampered")).toBeInTheDocument();
  });
});

describe("Vault3D", () => {
  it("falls back to a static vault without WebGL and still exposes the status", () => {
    render(<Vault3D status="compromised" files={[]} />);
    expect(screen.getByRole("img", { name: /integrity compromised/i })).toBeInTheDocument();
    expect(document.querySelector("canvas")).toBeNull();
  });
});

describe("LoadingIntro", () => {
  it("can always be skipped", async () => {
    const onDone = vi.fn();
    render(<LoadingIntro onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: /skip intro/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("shows a progress bar with a percentage", () => {
    render(<LoadingIntro onDone={() => {}} />);
    expect(screen.getByRole("progressbar", { name: /loading progress/i })).toBeInTheDocument();
    expect(screen.getByText(/connecting to the vault server/i)).toBeInTheDocument();
  });
});
