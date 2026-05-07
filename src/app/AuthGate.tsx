import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { ArrowRight, Building2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { helperTextClass } from "../components/ui/styles";
import { type AuthUser } from "../services/auth/authUser";
import {
  type AuthBootstrapResult,
  bootstrapLocalAuth,
  clearLocalAuthSession,
  getCurrentLocalAuthUser,
  loginWithEmailPassword,
  registerAccessRequest,
  type CompanyCode
} from "../services/auth/localAuth";

type AuthGateProps = {
  children: (
    authUser: AuthUser,
    onLogout: () => void,
    authActions: {
      openChangePassword: () => void;
      closeChangePassword: () => void;
      markPasswordChanged: () => void;
      isChangePasswordOpen: boolean;
      isChangePasswordRequired: boolean;
    }
  ) => ReactNode;
};

function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  showPassword,
  onToggle,
  ariaLabel
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  disabled: boolean;
  showPassword: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <LockKeyhole className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-[#65b5d7]" />
      <Input
        type={showPassword ? "text" : "password"}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-14 rounded-full border-0 bg-[#c8eadb] pr-14 pl-12 text-center text-sm text-slate-700 shadow-none placeholder:text-[#75a596] focus-visible:ring-[#87d8ff]"
        required
      />
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-10 w-10 rounded-full text-[#65b5d7] hover:bg-white/45 hover:text-[#1686e7]"
        disabled={disabled}
        onClick={onToggle}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  );
}

export function AuthGate({ children }: AuthGateProps) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authBootstrapStatus, setAuthBootstrapStatus] = useState<
    "checking" | "ready" | "degraded"
  >("checking");
  const [mode, setMode] = useState<"login" | "request">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestCompany, setRequestCompany] = useState<CompanyCode>("CPAC");
  const [authError, setAuthError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState("");
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [bootstrapMessage, setBootstrapMessage] = useState("");
  const [showSlowNotice, setShowSlowNotice] = useState(false);

  useEffect(() => {
    bootstrapLocalAuth();
    let isDisposed = false;

    const slowNoticeTimeout = window.setTimeout(() => {
      if (!isDisposed) {
        setShowSlowNotice(true);
      }
    }, 3500);

    void (async () => {
      let result: AuthBootstrapResult;

      try {
        result = await getCurrentLocalAuthUser();
      } catch {
        result = {
          status: "server_error",
          user: null,
          message: "ไม่สามารถตรวจสอบการเข้าสู่ระบบได้ กรุณาเข้าสู่ระบบใหม่"
        };
      } finally {
        if (!isDisposed) {
          window.clearTimeout(slowNoticeTimeout);
        }
      }

      if (isDisposed) {
        return;
      }

      setAuthUser(result.user ?? null);
      setBootstrapMessage(result.message ?? "");
      setAuthBootstrapStatus(
        result.status === "authenticated" || result.status === "anonymous" ? "ready" : "degraded"
      );
      if (result.status === "timeout" || result.status === "server_error") {
        setMode("login");
      }
    })();

    return () => {
      isDisposed = true;
      window.clearTimeout(slowNoticeTimeout);
    };
  }, []);

  useEffect(() => {
    if (authUser?.mustChangePassword) {
      setIsChangePasswordOpen(true);
    }
  }, [authUser?.mustChangePassword]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingLogin) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setIsSubmittingLogin(true);
    try {
      const user = await loginWithEmailPassword(normalizedEmail, password);
      setAuthUser(user);
      setIsChangePasswordOpen(Boolean(user.mustChangePassword));
      setAuthBootstrapStatus("ready");
      setBootstrapMessage("");
      setEmail(normalizedEmail);
      setPassword("");
      setAuthError("");
      setRequestSuccess("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleRequestAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingRequest) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = requestName.trim();
    setIsSubmittingRequest(true);
    try {
      await registerAccessRequest({
        email: normalizedEmail,
        name: trimmedName,
        company: requestCompany
      });
      setAuthError("");
      setRequestSuccess(
        `ส่งคำขอแล้ว หลังจาก admin อนุมัติ ระบบจะส่งรหัสผ่านไปที่อีเมล ${normalizedEmail}`
      );
      setMode("login");
      setEmail(normalizedEmail);
      setPassword("");
      setRequestName(trimmedName);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    try {
      await clearLocalAuthSession();
      setAuthUser(null);
      setAuthBootstrapStatus("ready");
      setBootstrapMessage("");
      setPassword("");
      setIsChangePasswordOpen(false);
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (authBootstrapStatus === "checking") {
    return (
      <div className="grid min-h-screen place-items-center px-4 py-10">
        <Card className="w-full max-w-xl border-[var(--border)] bg-[var(--shell-panel)]">
          <CardContent className="flex items-center gap-5 p-8">
            <div className="size-12 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--primary)]" />
            <div className="space-y-2">
              <p className="text-base font-semibold text-[var(--foreground)]">กำลังตรวจสอบการเข้าสู่ระบบ...</p>
              <p className={helperTextClass}>
                ระบบกำลังเช็ก session และเตรียมสิทธิ์การเข้าใช้งานให้กับบัญชีของคุณ
              </p>
              {showSlowNotice ? (
                <p className="text-sm text-[var(--muted-foreground)]/90">
                  ใช้เวลานานกว่าปกติ หากระบบยังไม่พร้อมจะพาไปหน้าเข้าสู่ระบบอัตโนมัติ
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authUser) {
    return children(authUser, handleLogout, {
      openChangePassword: () => setIsChangePasswordOpen(true),
      closeChangePassword: () => {
        if (!authUser.mustChangePassword) {
          setIsChangePasswordOpen(false);
        }
      },
      markPasswordChanged: () => {
        setAuthUser((currentUser) =>
          currentUser ? { ...currentUser, mustChangePassword: false } : currentUser
        );
        setIsChangePasswordOpen(false);
      },
      isChangePasswordOpen,
      isChangePasswordRequired: Boolean(authUser.mustChangePassword)
    });
  }

  return (
    <div className="h-[100dvh] overflow-hidden">
      <Card className="grid h-full min-h-0 w-full max-w-none grid-rows-[minmax(180px,0.42fr)_minmax(0,1fr)] overflow-hidden rounded-none border-0 bg-white shadow-none lg:grid-cols-[minmax(0,1fr)_600px] lg:grid-rows-none xl:grid-cols-[minmax(0,1fr)_720px]">
        <section className="relative isolate flex min-h-0 flex-col justify-between overflow-hidden bg-[#2ea7f5] p-5 text-white sm:p-7 lg:p-10">
          <div className="absolute -top-28 -left-20 h-72 w-72 rounded-full bg-white/18 blur-sm" />
          <div className="absolute top-8 -right-24 h-72 w-72 rounded-full bg-[#7ee0ff]/35" />
          <div className="absolute right-0 bottom-0 h-40 w-48 rounded-tl-[80px] bg-[#1679d7]/34" />
          <div className="absolute bottom-12 left-8 h-24 w-44 rounded-full bg-[#0b73de]/20" />

          <div className="relative z-10 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-[14px] bg-white text-lg font-black text-[#1686e7] shadow-[0_18px_38px_rgba(13,93,174,0.22)] lg:size-11">
              C
            </div>
            <div>
              <p className="text-base font-black">CPAC Dashboard</p>
              <p className="text-xs font-semibold text-white/72">Pricing Monitor</p>
            </div>
          </div>

          <div className="relative z-10 mx-auto grid flex-1 place-items-center py-3 text-center sm:py-5 lg:py-8">
            <div className="space-y-2">
              <div className="mx-auto grid size-11 place-items-center rounded-[14px] bg-white/14 text-2xl font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur sm:size-12 lg:size-14 lg:text-3xl">
                C
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-black leading-tight sm:text-2xl lg:text-3xl">
                  Welcome
                </h1>
                <p className="mx-auto max-w-[260px] text-xs font-medium leading-5 text-white/68 lg:max-w-[300px] lg:text-sm">
                  ติดตามราคา โครงการ และแนวโน้มล่าสุดในที่เดียว
                </p>
              </div>
            </div>
          </div>

          <div className="relative z-10 hidden gap-3 text-xs font-semibold text-white/74 sm:grid sm:grid-cols-3">
            <span>Secure access</span>
            <span className="hidden sm:block">Price tracking</span>
            <span className="hidden sm:block">CPAC / QMIX</span>
          </div>
        </section>

        <CardContent className="flex min-h-0 items-center p-0">
          <div className="w-full px-5 py-5 sm:px-8 lg:px-10">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-5 text-center lg:mb-7">
                <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-[#e8f5ff] text-[#1686e7] lg:mb-4 lg:size-12">
                  <ShieldCheck className="size-5" />
                </div>
                <h2 className="text-3xl font-black text-[#1686e7] lg:text-4xl">
                  {mode === "login" ? "เข้าสู่ระบบ" : "ขอสิทธิ์เข้าใช้งาน"}
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {mode === "login" ? "Login to continue" : "Create access request"}
                </p>
              </div>

              {bootstrapMessage ? (
                <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-700" role="status">
                  {bootstrapMessage}
                </div>
              ) : null}

              <div className="mb-4 grid grid-cols-2 gap-2 rounded-full bg-slate-100 p-1 lg:mb-5" role="tablist" aria-label="เลือกรูปแบบการเข้าใช้งาน">
                <Button
                  variant="ghost"
                  className={`h-11 w-full rounded-full text-sm shadow-none ${
                    mode === "login"
                      ? "bg-[#1686e7] text-white hover:bg-[#0f73cc]"
                      : "text-slate-500 hover:bg-white hover:text-slate-700"
                  }`}
                  aria-selected={mode === "login"}
                  onClick={() => {
                    setMode("login");
                    setAuthError("");
                    setRequestSuccess("");
                  }}
                >
                  เข้าสู่ระบบ
                </Button>
                <Button
                  variant="ghost"
                  className={`h-11 w-full rounded-full text-sm shadow-none ${
                    mode === "request"
                      ? "bg-[#1686e7] text-white hover:bg-[#0f73cc]"
                      : "text-slate-500 hover:bg-white hover:text-slate-700"
                  }`}
                  aria-selected={mode === "request"}
                  onClick={() => {
                    setMode("request");
                    setAuthError("");
                    setRequestSuccess("");
                    setPassword("");
                  }}
                >
                  ขอสิทธิ์ครั้งแรก
                </Button>
              </div>

              {mode === "login" ? (
                <form className="space-y-4" onSubmit={handleLogin}>
                  <label className="block">
                    <span className="sr-only">อีเมล</span>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-[#65b5d7]" />
                      <Input
                        type="email"
                        value={email}
                        disabled={isSubmittingLogin}
                        autoComplete="email"
                        inputMode="email"
                        onChange={(event) => {
                          setEmail(event.target.value);
                          setAuthError("");
                          setRequestSuccess("");
                        }}
                        placeholder="your.email@scg.com"
                        className="h-14 rounded-full border-0 bg-[#c8eadb] pl-12 text-center text-sm text-slate-700 shadow-none placeholder:text-[#75a596] focus-visible:ring-[#87d8ff]"
                        required
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="sr-only">รหัสผ่าน</span>
                    <PasswordField
                      value={password}
                      disabled={isSubmittingLogin}
                      autoComplete="current-password"
                      showPassword={showPassword}
                      onToggle={() => setShowPassword((current) => !current)}
                      onChange={(value) => {
                        setPassword(value);
                        setAuthError("");
                      }}
                      placeholder="กรอกรหัสผ่าน"
                      ariaLabel={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    />
                  </label>

                  {authError ? (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" role="alert">
                      {authError}
                    </p>
                  ) : null}
                  {requestSuccess ? (
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status">
                      {requestSuccess}
                    </p>
                  ) : null}

                  <Button type="submit" className="mx-auto mt-3 flex h-12 w-44 rounded-full bg-[#1686e7] text-sm shadow-[0_12px_24px_rgba(22,134,231,0.28)] hover:bg-[#0f73cc]" disabled={isSubmittingLogin}>
                    {isSubmittingLogin ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                    <ArrowRight className="size-4" />
                  </Button>
                  <p className="text-center text-xs leading-5 text-slate-400">
                    ยังไม่มีรหัสผ่าน? เลือก “ขอสิทธิ์ครั้งแรก”
                  </p>
                </form>
              ) : (
                <form className="space-y-4" onSubmit={handleRequestAccess}>
                  <label className="block">
                    <span className="sr-only">อีเมล</span>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-[#65b5d7]" />
                      <Input
                        type="email"
                        value={email}
                        disabled={isSubmittingRequest}
                        autoComplete="email"
                        inputMode="email"
                        onChange={(event) => {
                          setEmail(event.target.value);
                          setAuthError("");
                        }}
                        placeholder="your.email@scg.com"
                        className="h-14 rounded-full border-0 bg-[#c8eadb] pl-12 text-center text-sm text-slate-700 shadow-none placeholder:text-[#75a596] focus-visible:ring-[#87d8ff]"
                        required
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="sr-only">ชื่อ</span>
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-[#65b5d7]" />
                      <Input
                        value={requestName}
                        disabled={isSubmittingRequest}
                        autoComplete="name"
                        onChange={(event) => {
                          setRequestName(event.target.value);
                          setAuthError("");
                        }}
                        placeholder="ชื่อผู้ใช้งาน"
                        className="h-14 rounded-full border-0 bg-[#c8eadb] pl-12 text-center text-sm text-slate-700 shadow-none placeholder:text-[#75a596] focus-visible:ring-[#87d8ff]"
                        required
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="sr-only">กลุ่มธุรกิจที่ใช้งาน</span>
                    <div className="relative">
                      <Building2 className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-[#65b5d7]" />
                      <select
                        value={requestCompany}
                        disabled={isSubmittingRequest}
                        onChange={(event) => setRequestCompany(event.target.value as CompanyCode)}
                        className="h-14 w-full rounded-full border-0 bg-[#c8eadb] px-12 text-center text-sm font-semibold text-slate-700 outline-none transition focus-visible:ring-2 focus-visible:ring-[#87d8ff] disabled:opacity-50"
                      >
                        <option value="CPAC">CPAC</option>
                        <option value="QMIX">QMIX</option>
                      </select>
                    </div>
                  </label>
                  {authError ? (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" role="alert">
                      {authError}
                    </p>
                  ) : null}
                  <Button type="submit" className="mx-auto mt-3 flex h-12 w-60 rounded-full bg-[#1686e7] text-sm shadow-[0_12px_24px_rgba(22,134,231,0.28)] hover:bg-[#0f73cc]" disabled={isSubmittingRequest}>
                    {isSubmittingRequest ? "กำลังส่งคำขอ..." : "ส่งคำขอให้ผู้ดูแลอนุมัติ"}
                    <ArrowRight className="size-4" />
                  </Button>
                  <p className="text-center text-xs leading-5 text-slate-400">
                    เมื่ออนุมัติแล้ว ระบบจะส่งรหัสผ่านไปทางอีเมล
                  </p>
                </form>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
