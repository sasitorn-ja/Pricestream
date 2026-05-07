import { type FormEvent, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { fieldGroupClass, formLabelClass, helperTextClass } from "../components/ui/styles";
import { changeLocalPassword } from "../services/auth/localAuth";

type ChangePasswordModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
  isRequired?: boolean;
};

function PasswordInput({
  value,
  onChange,
  placeholder,
  disabled,
  show,
  onToggle,
  ariaLabel
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
  show: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pr-12"
        required
      />
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-1 right-1 h-9 w-9 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        disabled={disabled}
        onClick={onToggle}
        aria-label={ariaLabel}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  );
}

export function ChangePasswordModal({
  isOpen,
  onClose,
  onChanged,
  isRequired = false
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setError("");
    setSuccess("");
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isRequired) {
      return;
    }

    resetForm();
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (newPassword.length < 8) {
      setError("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("ยืนยันรหัสผ่านใหม่ไม่ตรงกัน");
      return;
    }

    setIsSubmitting(true);
    try {
      await changeLocalPassword({ currentPassword, newPassword });
      setSuccess("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
      setError("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onChanged?.();
    } catch (submitError) {
      setSuccess("");
      setError(submitError instanceof Error ? submitError.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] px-4 py-6 backdrop-blur-sm" role="presentation" onClick={handleClose}>
      <section
        className="w-full max-w-xl rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_32px_100px_rgba(2,8,20,0.46)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent-text)]">
              Account Security
            </p>
            <h2 id="change-password-title" className="text-2xl font-semibold text-[var(--foreground)]">
              {isRequired ? "ตั้งรหัสผ่านใหม่ก่อนใช้งาน" : "เปลี่ยนรหัสผ่าน"}
            </h2>
            <p className={helperTextClass}>
              {isRequired
                ? "บัญชีนี้ยังใช้รหัสผ่านชั่วคราวจากระบบ กรุณาเปลี่ยนรหัสผ่านก่อนเข้าใช้งาน dashboard"
                : "ตั้งรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษรสำหรับการเข้าสู่ระบบครั้งถัดไป"}
            </p>
          </div>
          {isRequired ? null : (
            <Button variant="ghost" size="icon" className="shrink-0" onClick={handleClose} aria-label="ปิดหน้าต่างเปลี่ยนรหัสผ่าน">
              <X className="size-5" />
            </Button>
          )}
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className={fieldGroupClass}>
            <span className={formLabelClass}>รหัสผ่านปัจจุบัน</span>
            <PasswordInput
              value={currentPassword}
              disabled={isSubmitting}
              show={showCurrentPassword}
              onToggle={() => setShowCurrentPassword((current) => !current)}
              onChange={(value) => {
                setCurrentPassword(value);
                setError("");
                setSuccess("");
              }}
              placeholder="กรอกรหัสผ่านปัจจุบัน"
              ariaLabel={showCurrentPassword ? "ซ่อนรหัสผ่านปัจจุบัน" : "แสดงรหัสผ่านปัจจุบัน"}
            />
          </label>

          <label className={fieldGroupClass}>
            <span className={formLabelClass}>รหัสผ่านใหม่</span>
            <PasswordInput
              value={newPassword}
              disabled={isSubmitting}
              show={showNewPassword}
              onToggle={() => setShowNewPassword((current) => !current)}
              onChange={(value) => {
                setNewPassword(value);
                setError("");
                setSuccess("");
              }}
              placeholder="กรอกรหัสผ่านใหม่"
              ariaLabel={showNewPassword ? "ซ่อนรหัสผ่านใหม่" : "แสดงรหัสผ่านใหม่"}
            />
          </label>

          <label className={fieldGroupClass}>
            <span className={formLabelClass}>ยืนยันรหัสผ่านใหม่</span>
            <PasswordInput
              value={confirmPassword}
              disabled={isSubmitting}
              show={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((current) => !current)}
              onChange={(value) => {
                setConfirmPassword(value);
                setError("");
                setSuccess("");
              }}
              placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
              ariaLabel={showConfirmPassword ? "ซ่อนการยืนยันรหัสผ่านใหม่" : "แสดงการยืนยันรหัสผ่านใหม่"}
            />
          </label>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
            หลังเปลี่ยนแล้ว ให้ใช้รหัสผ่านใหม่ในครั้งถัดไปที่เข้าสู่ระบบ
          </div>
          {error ? (
            <p className="rounded-2xl border border-[var(--alert-error-border)] bg-[var(--alert-error-bg)] px-4 py-3 text-sm font-medium text-[var(--alert-error-text)]">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="rounded-2xl border border-[var(--alert-success-border)] bg-[var(--alert-success-bg)] px-4 py-3 text-sm font-medium text-[var(--alert-success-text)]">
              {success}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {isRequired ? null : (
              <Button variant="outline" disabled={isSubmitting} onClick={handleClose}>
                ยกเลิก
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
