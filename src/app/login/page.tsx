import { Suspense } from "react";
import LoginForm from "@/app/login/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-full items-center justify-center bg-[#11233d] text-white">Cargando…</div>}>
      <LoginForm />
    </Suspense>
  );
}
