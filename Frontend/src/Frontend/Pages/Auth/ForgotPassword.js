import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import api from '../../Config/api';

// const TOTAL_STEPS = 3;
const OTP_LENGTH  = 6;
const OTP_EXPIRY_SECONDS = 120; // 2 minutes countdown

const ForgotPassword = ({ onSuccess, onBack }) => {
  const [step,         setStep]         = useState(1);
  const [email,        setEmail]        = useState('');
  const [otp,          setOtp]          = useState(Array(OTP_LENGTH).fill(''));
  const [resetToken,   setResetToken]   = useState('');
  const [passwords,    setPasswords]    = useState({ newPassword: '', confirmPassword: '' });
  const [showPw,       setShowPw]       = useState({ new: false, confirm: false });
  const [loading,      setLoading]      = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [mounted,      setMounted]      = useState(false);
  const [countdown,    setCountdown]    = useState(0);
  const [canResend,    setCanResend]    = useState(false);
  const [pwStrength,   setPwStrength]   = useState({ score: 0, label: '', color: '' });

  const otpRefs    = useRef([]);
  const emailRef   = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (step === 1) emailRef.current?.focus();
    if (step === 2) otpRefs.current[0]?.focus();
  }, [step]);

  // OTP countdown timer
  const startCountdown = useCallback(() => {
    clearInterval(countdownRef.current);
    setCountdown(OTP_EXPIRY_SECONDS);
    setCanResend(false);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => clearInterval(countdownRef.current), []);

  // Password strength checker
  const checkPasswordStrength = (pw) => {
    if (!pw) { setPwStrength({ score: 0, label: '', color: '' }); return; }
    let score = 0;
    if (pw.length >= 8)                              score++;
    if (pw.length >= 12)                             score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw))       score++;
    if (/\d/.test(pw))                               score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pw))          score++;
    const map = [
      { label: '',         color: '' },
      { label: 'Weak',     color: '#ef4444' },
      { label: 'Fair',     color: '#f59e0b' },
      { label: 'Good',     color: '#3b82f6' },
      { label: 'Strong',   color: '#10b981' },
      { label: 'Very Strong', color: '#059669' },
    ];
    setPwStrength({ score, ...map[score] });
  };

  // ── Step 1: Send OTP ────────────────────────────────────────
  const handleSendOTP = async (e) => {
  e.preventDefault();
  if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    toast.error('Please enter a valid email address');
    return;
  }
  setLoading(true);
  try {
    const res = await api.post('/auth/forgot-password', {
      email: email.trim().toLowerCase(),
    });
    toast.success(res?.data?.message || 'OTP sent to your email — check your inbox!');
    setStep(2);
    startCountdown();
  } catch (err) {
    //Shows real backend error: "No account found with this email address..."
    toast.error(
      err?.response?.data?.error ||
      err?.response?.status === 429
        ? 'Too many attempts. Please wait 10 minutes.'
        : 'Failed to send OTP. Please try again.'
    );
  } finally {
    setLoading(false);
  }
};

  // ── Resend OTP ──────────────────────────────────────────────
  const handleResend = async () => {
    if (!canResend) return;
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      toast.success('New OTP sent to your email');
      setOtp(Array(OTP_LENGTH).fill(''));
      otpRefs.current[0]?.focus();
      startCountdown();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  // ── OTP input handlers ──────────────────────────────────────
  const handleOtpChange = (idx, value) => {
    // Accept only single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    const next  = [...otp];
    next[idx]   = digit;
    setOtp(next);
    if (digit && idx < OTP_LENGTH - 1) {
      otpRefs.current[idx + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (idx, e) => {
    if (e.key === 'Backspace') {
      if (otp[idx]) {
        const next = [...otp]; next[idx] = ''; setOtp(next);
      } else if (idx > 0) {
        otpRefs.current[idx - 1]?.focus();
        const next = [...otp]; next[idx - 1] = ''; setOtp(next);
      }
    }
    if (e.key === 'ArrowLeft'  && idx > 0)              otpRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < OTP_LENGTH - 1) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = [...otp];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setOtp(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    otpRefs.current[focusIdx]?.focus();
  };

  // ── Step 2: Verify OTP ──────────────────────────────────────
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    const otpValue = otp.join('');
    if (otpValue.length < OTP_LENGTH) {
      toast.error('Please enter the complete 6-digit OTP');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', {
        email: email.trim().toLowerCase(),
        otp:   otpValue,
      });
      setResetToken(res.data.data.resetToken);
      toast.success('OTP verified successfully');
      setStep(3);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Invalid or expired OTP');
      setOtp(Array(OTP_LENGTH).fill(''));
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Reset password ──────────────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    const { newPassword, confirmPassword } = passwords;

    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in both password fields');
      return;
    }
    if (pwStrength.score < 3) {
      toast.error('Please choose a stronger password');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email:      email.trim().toLowerCase(),
        resetToken,
        newPassword,
      });
      toast.success('Password reset successfully!');
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Password reset failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fmtCountdown = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const stepLabels = ['Enter Email', 'Verify OTP', 'New Password'];

  return (
    <>
      <style>{`
        .fp-box {
          width: 100%;
          max-width: 420px;
          position: relative;
          z-index: 1;
          animation: fpSlideIn 0.35s ease forwards;
        }
        @keyframes fpSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .fp-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.82rem;
          font-weight: 500;
          color: #6b7280;
          padding: 0;
          margin-bottom: 24px;
          transition: color 0.2s;
        }
        .fp-back-btn:hover { color: #0f2d78; }

        .fp-steps {
          display: flex;
          align-items: center;
          gap: 0;
          margin-bottom: 28px;
        }
        .fp-step-item {
          display: flex;
          align-items: center;
          flex: 1;
          gap: 0;
        }
        .fp-step-circle {
          width: 28px; height: 28px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.72rem;
          font-weight: 700;
          flex-shrink: 0;
          transition: background 0.3s, border-color 0.3s;
          border: 2px solid #e5e7eb;
          color: #9ca3af;
          background: #fff;
        }
        .fp-step-circle.active {
          background: #0f2d78;
          border-color: #0f2d78;
          color: #fff;
        }
        .fp-step-circle.done {
          background: #d4a017;
          border-color: #d4a017;
          color: #fff;
        }
        .fp-step-line {
          flex: 1;
          height: 2px;
          background: #e5e7eb;
          transition: background 0.3s;
        }
        .fp-step-line.done { background: #d4a017; }
        .fp-step-label {
          font-size: 0.65rem;
          color: #9ca3af;
          margin-top: 5px;
          text-align: center;
          font-weight: 500;
        }
        .fp-step-label.active { color: #0f2d78; font-weight: 600; }
        .fp-step-label.done   { color: #d4a017; }

        .fp-step-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex-shrink: 0;
        }

        .fp-header { margin-bottom: 28px; }
        .fp-eyebrow {
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #d4a017;
          margin-bottom: 7px;
        }
        .fp-title {
          font-family: 'Playfair Display', serif;
          font-size: 1.75rem;
          font-weight: 700;
          color: #0f1f42;
          line-height: 1.25;
          margin-bottom: 5px;
        }
        .fp-subtitle {
          font-size: 0.85rem;
          color: #6b7280;
          font-weight: 300;
          line-height: 1.5;
        }
        .fp-subtitle strong { color: #374151; font-weight: 600; }

        .fp-field { margin-bottom: 20px; }
        .fp-label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 7px;
        }
        .fp-input-wrap { position: relative; display: flex; align-items: center; }
        .fp-input-icon {
          position: absolute; left: 14px;
          color: #9ca3af; font-size: 15px;
          pointer-events: none; z-index: 1;
        }
        .fp-input {
          width: 100%; height: 48px;
          padding: 0 44px 0 42px;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.9rem;
          color: #111827;
          background: #fff;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .fp-input:focus {
          border-color: #d4a017;
          box-shadow: 0 0 0 3px rgba(212,160,23,0.12);
        }
        .fp-input::placeholder { color: #c4c9d4; }
        .fp-toggle-pw {
          position: absolute; right: 12px;
          background: none; border: none;
          cursor: pointer; color: #9ca3af;
          font-size: 15px; padding: 4px;
          transition: color 0.2s; z-index: 1;
        }
        .fp-toggle-pw:hover { color: #374151; }

        /* OTP boxes */
        .fp-otp-row {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-bottom: 8px;
        }
        .fp-otp-input {
          width: 52px; height: 58px;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-family: 'Playfair Display', serif;
          font-size: 1.4rem;
          font-weight: 700;
          text-align: center;
          color: #0f1f42;
          background: #fff;
          outline: none;
          caret-color: transparent;
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
          appearance: none;
          -moz-appearance: textfield;
        }
        .fp-otp-input::-webkit-outer-spin-button,
        .fp-otp-input::-webkit-inner-spin-button { -webkit-appearance: none; }
        .fp-otp-input:focus {
          border-color: #0f2d78;
          box-shadow: 0 0 0 3px rgba(15,45,120,0.12);
          transform: translateY(-2px);
        }
        .fp-otp-input.filled {
          border-color: #d4a017;
          background: #fffbf0;
        }

        .fp-countdown {
          text-align: center;
          font-size: 0.8rem;
          color: #9ca3af;
          margin-bottom: 16px;
        }
        .fp-countdown span { font-weight: 600; color: #374151; }
        .fp-resend-btn {
          background: none; border: none;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.82rem; font-weight: 600;
          cursor: pointer; padding: 0;
          transition: color 0.2s;
          color: #d4a017;
        }
        .fp-resend-btn:hover:not(:disabled) { color: #b8860b; text-decoration: underline; }
        .fp-resend-btn:disabled { color: #c4c9d4; cursor: not-allowed; }

        /* Password strength bar */
        .fp-strength-bar {
          height: 4px;
          border-radius: 2px;
          background: #e5e7eb;
          margin-top: 8px;
          overflow: hidden;
        }
        .fp-strength-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.3s ease, background 0.3s ease;
        }
        .fp-strength-label {
          font-size: 0.75rem;
          margin-top: 4px;
          font-weight: 500;
        }

        .fp-match-msg {
          font-size: 0.75rem;
          margin-top: 5px;
          display: flex;
          align-items: center;
          gap: 5px;
          font-weight: 500;
        }

        /* Buttons */
        .fp-btn {
          width: 100%;
          height: 50px;
          border: none;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.95rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: transform 0.15s, box-shadow 0.15s;
          margin-bottom: 0;
        }
        .fp-btn-primary {
          background: linear-gradient(135deg, #0f2d78 0%, #1a3fa0 100%);
          color: #fff;
          box-shadow: 0 4px 16px rgba(15,45,120,0.28);
        }
        .fp-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(15,45,120,0.35);
        }
        .fp-btn-primary:disabled { opacity: 0.65; cursor: not-allowed; }
        .fp-btn-primary:active:not(:disabled) { transform: translateY(0); }

        .fp-btn-success {
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          color: #fff;
          box-shadow: 0 4px 16px rgba(16,185,129,0.28);
        }
        .fp-btn-success:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(16,185,129,0.35);
        }
        .fp-btn-success:disabled { opacity: 0.65; cursor: not-allowed; }
      `}</style>

      <div className="fp-box">

        {/* Back button */}
        <button type="button" className="fp-back-btn" onClick={onBack}>
          <i className="bi bi-arrow-left" />
          Back to Sign In
        </button>

        {/* Step indicators */}
        <div className="fp-steps">
          {stepLabels.map((label, i) => {
            const sNum   = i + 1;
            const isDone = step > sNum;
            const isAct  = step === sNum;
            return (
              <React.Fragment key={sNum}>
                <div className="fp-step-col">
                  <div className={`fp-step-circle ${isDone ? 'done' : isAct ? 'active' : ''}`}>
                    {isDone ? <i className="bi bi-check" /> : sNum}
                  </div>
                  <div className={`fp-step-label ${isDone ? 'done' : isAct ? 'active' : ''}`}>
                    {label}
                  </div>
                </div>
                {i < stepLabels.length - 1 && (
                  <div className={`fp-step-line ${isDone ? 'done' : ''}`} style={{ marginBottom: 14 }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Step 1: Email ───────────────────────────────── */}
        {step === 1 && (
          <form onSubmit={handleSendOTP} noValidate>
            <div className="fp-header">
              <div className="fp-eyebrow">Password Recovery</div>
              <h2 className="fp-title">Forgot password?</h2>
              <p className="fp-subtitle">
                Enter your registered email address and we'll send you a 6-digit OTP.
              </p>
            </div>

            <div className="fp-field">
              <label className="fp-label" htmlFor="fp-email">Registered Email</label>
              <div className="fp-input-wrap">
                <i className="bi bi-envelope fp-input-icon" />
                <input
                  ref={emailRef}
                  id="fp-email"
                  type="email"
                  className="fp-input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="fp-btn fp-btn-primary"
              disabled={loading || !email.trim()}
            >
              {loading ? (
                <><span className="spinner-border spinner-border-sm" />Sending OTP…</>
              ) : (
                <><i className="bi bi-send" />Send OTP</>
              )}
            </button>
          </form>
        )}

        {/* ── Step 2: OTP verification ────────────────────── */}
        {step === 2 && (
          <form onSubmit={handleVerifyOTP} noValidate>
            <div className="fp-header">
              <div className="fp-eyebrow">Verification</div>
              <h2 className="fp-title">Enter OTP</h2>
              <p className="fp-subtitle">
                We sent a 6-digit code to&nbsp;
                <strong>{email}</strong>.<br />
                Enter it below to continue.
              </p>
            </div>

            <div className="fp-otp-row" onPaste={handleOtpPaste}>
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  ref={el => otpRefs.current[idx] = el}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  className={`fp-otp-input ${digit ? 'filled' : ''}`}
                  value={digit}
                  onChange={e => handleOtpChange(idx, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(idx, e)}
                  aria-label={`OTP digit ${idx + 1}`}
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            <div className="fp-countdown" style={{ marginBottom: 20 }}>
              {countdown > 0 ? (
                <>Code expires in <span>{fmtCountdown(countdown)}</span></>
              ) : (
                <>Code expired.&nbsp;
                  <button
                    type="button"
                    className="fp-resend-btn"
                    onClick={handleResend}
                    disabled={loading}
                  >
                    Resend OTP
                  </button>
                </>
              )}
              {countdown > 0 && canResend === false && (
                <>&nbsp;·&nbsp;
                  <button
                    type="button"
                    className="fp-resend-btn"
                    onClick={handleResend}
                    disabled={!canResend || loading}
                  >
                    Resend
                  </button>
                </>
              )}
            </div>

            <button
              type="submit"
              className="fp-btn fp-btn-primary"
              disabled={loading || otp.join('').length < OTP_LENGTH}
            >
              {loading ? (
                <><span className="spinner-border spinner-border-sm" />Verifying…</>
              ) : (
                <><i className="bi bi-shield-check" />Verify OTP</>
              )}
            </button>
          </form>
        )}

        {/* ── Step 3: New password ────────────────────────── */}
        {step === 3 && (() => {
          const { newPassword, confirmPassword } = passwords;
          const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
          // const passwordsMismatch = confirmPassword && newPassword !== confirmPassword;
          return (
            <form onSubmit={handleResetPassword} noValidate>
              <div className="fp-header">
                <div className="fp-eyebrow">New Password</div>
                <h2 className="fp-title">Reset password</h2>
                <p className="fp-subtitle">
                  Choose a strong, unique password for your account.
                </p>
              </div>

              {/* New password */}
              <div className="fp-field">
                <label className="fp-label" htmlFor="fp-newpw">New Password</label>
                <div className="fp-input-wrap">
                  <i className="bi bi-lock fp-input-icon" />
                  <input
                    id="fp-newpw"
                    type={showPw.new ? 'text' : 'password'}
                    className="fp-input"
                    value={newPassword}
                    onChange={e => {
                      setPasswords(p => ({ ...p, newPassword: e.target.value }));
                      checkPasswordStrength(e.target.value);
                    }}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="fp-toggle-pw"
                    onClick={() => setShowPw(s => ({ ...s, new: !s.new }))}
                    tabIndex={-1}
                  >
                    <i className={`bi bi-eye${showPw.new ? '-slash' : ''}`} />
                  </button>
                </div>
                {/* Strength bar */}
                {newPassword && (
                  <>
                    <div className="fp-strength-bar">
                      <div
                        className="fp-strength-fill"
                        style={{
                          width:      `${(pwStrength.score / 5) * 100}%`,
                          background: pwStrength.color || '#e5e7eb',
                        }}
                      />
                    </div>
                    {pwStrength.label && (
                      <div className="fp-strength-label" style={{ color: pwStrength.color }}>
                        {pwStrength.label} password
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Confirm password */}
              <div className="fp-field">
                <label className="fp-label" htmlFor="fp-confirmpw">Confirm Password</label>
                <div className="fp-input-wrap">
                  <i className="bi bi-lock-fill fp-input-icon" />
                  <input
                    id="fp-confirmpw"
                    type={showPw.confirm ? 'text' : 'password'}
                    className="fp-input"
                    value={confirmPassword}
                    onChange={e => setPasswords(p => ({ ...p, confirmPassword: e.target.value }))}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="fp-toggle-pw"
                    onClick={() => setShowPw(s => ({ ...s, confirm: !s.confirm }))}
                    tabIndex={-1}
                  >
                    <i className={`bi bi-eye${showPw.confirm ? '-slash' : ''}`} />
                  </button>
                </div>
                {/* Match indicator */}
                {confirmPassword && (
                  <div
                    className="fp-match-msg"
                    style={{ color: passwordsMatch ? '#10b981' : '#ef4444' }}
                  >
                    <i className={`bi bi-${passwordsMatch ? 'check-circle-fill' : 'x-circle-fill'}`} />
                    {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="fp-btn fp-btn-success"
                disabled={
                  loading ||
                  !newPassword ||
                  !confirmPassword ||
                  !passwordsMatch ||
                  pwStrength.score < 3
                }
              >
                {loading ? (
                  <><span className="spinner-border spinner-border-sm" />Resetting…</>
                ) : (
                  <><i className="bi bi-check-circle" />Reset Password</>
                )}
              </button>
            </form>
          );
        })()}

      </div>
    </>
  );
};

export default ForgotPassword;