"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, action, busy] = useActionState<LoginState, FormData>(signIn, { error: null });
  return (
    <form action={action} className="card login">
      <h2>Sign in</h2>
      <label>
        Email
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error && (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="muted small" style={{ margin: 0 }}>
        Accounts are created by your administrator. There is no self sign-up.
      </p>
    </form>
  );
}
