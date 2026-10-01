"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Registration failed");
        }
      }

      const cleanEmail = email.trim().toLowerCase();
      const result = await signIn("credentials", {
        redirect: false,
        email: cleanEmail,
        password,
      });

      if (result?.error) {
        throw new Error("Invalid email or password. If registering, please toggle 'Create Account'.");
      }

      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-charcoal-950 flex items-center justify-center p-4 font-sans text-stone-100">
      <div className="w-full max-w-md bg-charcoal-900 border border-charcoal-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 mx-auto rounded-xl bg-warmorange-500/15 border border-warmorange-500/30 flex items-center justify-center text-warmorange-400 font-bold text-base shadow-sm mb-2">
            AI
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-100">Welcome to Aide</h1>
          <p className="text-xs text-stone-400">
            {isRegister ? "Create an account to get started" : "Sign in to access your assistant & memories"}
          </p>
        </div>

        {error && (
          <div className="bg-red-950/80 border border-red-800 text-red-300 text-xs p-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              className="w-full bg-charcoal-950 border border-charcoal-800 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 outline-none focus:border-warmorange-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="w-full bg-charcoal-950 border border-charcoal-800 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 outline-none focus:border-warmorange-500 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-warmorange-500 hover:bg-warmorange-600 text-white font-semibold py-2.5 rounded-xl text-sm transition shadow-sm disabled:opacity-50"
          >
            {loading ? "Processing..." : isRegister ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-charcoal-800">
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            className="text-xs text-warmorange-400 hover:text-warmorange-300 transition"
          >
            {isRegister ? "Already have an account? Sign in" : "Need an account? Register here"}
          </button>
        </div>
      </div>
    </div>
  );
}
