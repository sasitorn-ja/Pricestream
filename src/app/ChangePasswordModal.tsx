import { type FormEvent, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { changeLocalPassword } from "../services/auth/localAuth";

type ChangePasswordModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
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
    } catch (submitError) {
      setSuccess("");
      setError(submitError instanceof Error ? submitError.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="calcModalBackdrop" role="presentation" onClick={handleClose}>
      <section
        className="calcModal authSettingsModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="calcModalHeader">
          <div>
            <h2 id="change-password-title">เปลี่ยนรหัสผ่าน</h2>
            <p className="authSettingsIntro">อัปเดตรหัสผ่านสำหรับใช้เข้าสู่ระบบครั้งถัดไป</p>
          </div>
          <button
            type="button"
            className="calcModalClose"
            onClick={handleClose}
            aria-label="ปิดหน้าต่างเปลี่ยนรหัสผ่าน"
          >
            <X />
          </button>
        </div>

        <div className="calcModalBody">
          <form className="authForm authSettingsForm" onSubmit={handleSubmit}>
            <label>
              <span>รหัสผ่านเดิม</span>
              <div className="passwordField">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setCurrentPassword(event.target.value);
                    setError("");
                    setSuccess("");
                  }}
                  placeholder="กรอกรหัสผ่านเดิม"
                  required
                />
                <button
                  type="button"
                  className="passwordToggleButton"
                  disabled={isSubmitting}
                  onClick={() => setShowCurrentPassword((current) => !current)}
                  aria-label={showCurrentPassword ? "ซ่อนรหัสผ่านเดิม" : "แสดงรหัสผ่านเดิม"}
                >
                  {showCurrentPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>

            <label>
              <span>รหัสผ่านใหม่</span>
              <div className="passwordField">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setNewPassword(event.target.value);
                    setError("");
                    setSuccess("");
                  }}
                  placeholder="อย่างน้อย 8 ตัวอักษร"
                  required
                />
                <button
                  type="button"
                  className="passwordToggleButton"
                  disabled={isSubmitting}
                  onClick={() => setShowNewPassword((current) => !current)}
                  aria-label={showNewPassword ? "ซ่อนรหัสผ่านใหม่" : "แสดงรหัสผ่านใหม่"}
                >
                  {showNewPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>

            <label>
              <span>ยืนยันรหัสผ่านใหม่</span>
              <div className="passwordField">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setError("");
                    setSuccess("");
                  }}
                  placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                  required
                />
                <button
                  type="button"
                  className="passwordToggleButton"
                  disabled={isSubmitting}
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  aria-label={showConfirmPassword ? "ซ่อนการยืนยันรหัสผ่านใหม่" : "แสดงการยืนยันรหัสผ่านใหม่"}
                >
                  {showConfirmPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>

            <p className="authInfoBox">หลังเปลี่ยนแล้ว ให้ใช้รหัสผ่านใหม่ในครั้งถัดไปที่เข้าสู่ระบบ</p>
            {error ? <p className="authLocalError">{error}</p> : null}
            {success ? <p className="authSuccess">{success}</p> : null}

            <div className="authSettingsActions">
              <button
                type="button"
                className="authSecondaryButton"
                disabled={isSubmitting}
                onClick={handleClose}
              >
                ยกเลิก
              </button>
              <button type="submit" className="authLoginButton" disabled={isSubmitting}>
                {isSubmitting ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
