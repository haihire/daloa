"use client";

import { useState } from "react";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(u: string, p: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        setError(data.message ?? "로그인 실패");
        return;
      }
      window.location.replace("/admin/monitoring");
    } catch {
      setError("네트워크 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await login(username, password);
  }

  async function handleGuestLogin() {
    await login("guest", "1237");
  }

  return (
    <div className="admin-shell min-h-screen flex items-center justify-center p-6">
      <div className="admin-card w-full max-w-sm p-8">
        <div className="mb-6">
          <h1 className="admin-page-title">
            다로아 <span className="text-blue-600">Admin</span>
          </h1>
          <p className="admin-page-subtitle mt-1">관리자 로그인</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="admin-label">아이디</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="admin-input"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="admin-btn admin-btn-primary w-full"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleGuestLogin}
            className="admin-btn admin-btn-secondary w-full"
          >
            게스트로 둘러보기
          </button>
        </form>
      </div>
    </div>
  );
}
