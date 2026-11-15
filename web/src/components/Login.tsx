import { useState, type FormEvent } from "react";
import { login } from "../api";

export default function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(password);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-white/15 bg-white/10 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl"
      >
        <img src="/lookout-logo.png" alt="Lookout" className="mx-auto h-12 w-auto select-none" draggable={false} />
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-full border border-white/15 bg-white/5 px-4 py-2.5 outline-none placeholder:text-white/40 focus:border-white/40"
        />
        {error && <p className="text-sm text-rose-200">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="rounded-full border border-white/20 bg-white/15 px-4 py-2.5 font-medium hover:bg-white/25 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
