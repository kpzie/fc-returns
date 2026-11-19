import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth/session";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getActor()) redirect("/");
  return (
    <>
      <h1>FC Returns</h1>
      <LoginForm />
    </>
  );
}
