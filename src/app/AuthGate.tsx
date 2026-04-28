import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { type AuthUser } from "../services/auth/authUser";
import {
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
    authActions: { openChangePassword: () => void; closeChangePassword: () => void; isChangePasswordOpen: boolean }
  ) => ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
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

  useEffect(() => {
    bootstrapLocalAuth();
    void getCurrentLocalAuthUser().then((user) => {
      setAuthUser(user);
      setHasCheckedAuth(true);
    });
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingLogin) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setIsSubmittingLogin(true);
    try {
      setAuthUser(await loginWithEmailPassword(normalizedEmail, password));
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
      setRequestName("");
    } catch (error) {
      setRequestSuccess("");
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
      setPassword("");
      setIsChangePasswordOpen(false);
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!hasCheckedAuth) {
    return (
      <div className="authScreen">
        <div className="authSpinner" />
        <p>กำลังตรวจสอบการเข้าสู่ระบบ...</p>
      </div>
    );
  }

  if (authUser) {
    return children(authUser, handleLogout, {
      openChangePassword: () => setIsChangePasswordOpen(true),
      closeChangePassword: () => setIsChangePasswordOpen(false),
      isChangePasswordOpen
    });
  }

  return (
    <div className="authScreen">
      <section className="authPanel" aria-labelledby="auth-title">
        <p className="authEyebrow">Pricing Monitor</p>
        <h1 id="auth-title">{mode === "login" ? "เข้าสู่ระบบ" : "ขอสิทธิ์เข้าใช้งาน"}</h1>
        <p className="authIntro">
          {mode === "login"
            ? "เข้าสู่ระบบด้วยอีเมลของคุณและรหัสผ่านที่ได้รับหลัง admin อนุมัติ"
            : "กรอกอีเมลของคุณเพื่อรับรหัสผ่านหลังจาก admin อนุมัติคำขอ"}
        </p>

        {mode === "login" ? (
          <form className="authForm" onSubmit={handleLogin}>
            <label>
              <span>อีเมลของคุณ</span>
              <input
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
                placeholder="your.email@company.com"
                required
              />
            </label>
            <label>
              <span>Password</span>
              <div className="passwordField">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  disabled={isSubmittingLogin}
                  autoComplete="current-password"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setAuthError("");
                  }}
                  placeholder="รหัสผ่าน"
                  required
                />
                <button
                  type="button"
                  className="passwordToggleButton"
                  disabled={isSubmittingLogin}
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            {authError ? <p className="authLocalError" role="alert">{authError}</p> : null}
            {requestSuccess ? <p className="authSuccess" role="status">{requestSuccess}</p> : null}
            <button type="submit" className="authLoginButton" disabled={isSubmittingLogin}>
              {isSubmittingLogin ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>
        ) : (
          <form className="authForm" onSubmit={handleRequestAccess}>
            <label>
              <span>อีเมลที่จะรับรหัสผ่าน</span>
              <input
                type="email"
                value={email}
                disabled={isSubmittingRequest}
                autoComplete="email"
                inputMode="email"
                onChange={(event) => {
                  setEmail(event.target.value);
                  setAuthError("");
                }}
                placeholder="your.email@company.com"
                required
              />
            </label>
            <label>
              <span>ชื่อบริษัท / ชื่อผู้ใช้งาน</span>
              <input
                value={requestName}
                disabled={isSubmittingRequest}
                autoComplete="name"
                onChange={(event) => {
                  setRequestName(event.target.value);
                  setAuthError("");
                }}
                placeholder="ชื่อบริษัทหรือชื่อผู้ใช้งาน"
                required
              />
            </label>
            <label>
              <span>อยู่ CPAC หรือ QMIX</span>
              <select
                value={requestCompany}
                disabled={isSubmittingRequest}
                onChange={(event) => setRequestCompany(event.target.value as CompanyCode)}
              >
                <option value="CPAC">CPAC</option>
                <option value="QMIX">QMIX</option>
              </select>
            </label>
            <p className="authInfoBox">
              หลังจาก admin อนุมัติ ระบบจะส่งรหัสผ่านสำหรับเข้าใช้งานไปที่อีเมลนี้
            </p>
            {authError ? <p className="authLocalError" role="alert">{authError}</p> : null}
            <button type="submit" className="authLoginButton" disabled={isSubmittingRequest}>
              {isSubmittingRequest ? "กำลังส่งคำขอ..." : "ส่งคำขอให้ admin อนุมัติ"}
            </button>
          </form>
        )}

        <button
          type="button"
          className="authTextButton"
          disabled={isSubmittingLogin || isSubmittingRequest}
          onClick={() => {
            setMode((current) => (current === "login" ? "request" : "login"));
            setAuthError("");
            setRequestSuccess("");
            setPassword("");
          }}
        >
          {mode === "login" ? "ยังไม่มีรหัสผ่าน ขอสิทธิ์เข้าใช้งาน" : "กลับไปหน้าเข้าสู่ระบบ"}
        </button>
      </section>
    </div>
  );
}
