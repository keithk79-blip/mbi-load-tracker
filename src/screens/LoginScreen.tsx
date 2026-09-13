import { useState, type FormEvent } from "react";
import { BrandMark } from "../components/BrandMark";
import { useAuth } from "../store/AuthContext";

export function LoginScreen() {
  const { signInPassword, sendMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    if (!password) {
      setError("Enter your password, or use a magic link.");
      setBusy(false);
      return;
    }
    const message = await signInPassword(email.trim(), password);
    setBusy(false);
    if (message) setError(message);
  };

  const magic = async () => {
    if (!email.trim()) {
      setError("Enter your work email first.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const message = await sendMagicLink(email.trim());
    setBusy(false);
    if (message) setError(message);
    else setInfo("Check your email for a sign-in link.");
  };

  return (
    <div className="screen overlay-screen login-screen">
      <BrandMark size="lg" />
      <div>
        <p className="eyebrow">Keith&apos;s Load Tracker</p>
        <h1 className="page-title">Load Tracker</h1>
        <p className="field-hint">
          Crew sign-in. Ask a lead dispatcher to invite your email if this is
          your first time.
        </p>
      </div>
      <form className="form-stack" onSubmit={submitPassword}>
        <label className="field">
          <div className="field-label">Email</div>
          <input
            className="text-input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <div className="field-label">Password</div>
          <input
            className="text-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {info ? <p className="form-info">{info}</p> : null}
        <button type="submit" className="btn-primary" disabled={busy || !email}>
          Sign in
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy || !email}
          onClick={magic}
        >
          Email me a magic link
        </button>
      </form>
    </div>
  );
}
