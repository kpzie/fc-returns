"use server";

import { redirect } from "next/navigation";
import { authConfig, userClient } from "@/lib/auth/session";

export type LoginState = { error: string | null };

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (authConfig().mode === "dev") redirect("/");
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const { error } = await (await userClient()).auth.signInWithPassword({ email, password });
  // Same message for unknown user and wrong password, so the form doesn't reveal which accounts exist.
  if (error) return { error: "Email or password is incorrect." };
  redirect("/");
}

export async function signOut() {
  if (authConfig().mode === "supabase") await (await userClient()).auth.signOut();
  redirect("/login");
}
