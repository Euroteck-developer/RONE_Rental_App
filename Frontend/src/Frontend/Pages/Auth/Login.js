import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../Context/AuthContext';
import { toast } from 'react-toastify';
import ForgotPassword from './ForgotPassword';

import rone_bg   from '../../Assets/r-one-bg.jpg';
import rone_logo from '../../Assets/rone-logo-1.png';

/* ─── helpers ─────────────────────────────────────────────── */
const fmtTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0
    ? `${m}m ${s.toString().padStart(2, '0')}s`
    : `${s}s`;
};

const Login = () => {
  const { login } = useAuth();

  const [formData,     setFormData]     = useState({ email: '', password: '' });
  const [loading,      setLoading]      = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember,     setRemember]     = useState(false);
  const [showForgot,   setShowForgot]   = useState(false);
  const [mounted,      setMounted]      = useState(false);
  const [rememberErr,  setRememberErr]  = useState(false);

  /* block countdown */
  const [blockedSecs,  setBlockedSecs]  = useState(0);
  const timerRef = useRef(null);

  /* shake animation trigger */
  const [shake, setShake] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('rpm_remembered_email');
    if (saved) {
      setFormData(prev => ({ ...prev, email: saved }));
      setRemember(true);
    }
    /* restore blocked time if page refreshed */
    const until = localStorage.getItem('rpm_blocked_until');
    if (until) {
      const diff = Math.ceil((parseInt(until, 10) - Date.now()) / 1000);
      if (diff > 0) startBlockCountdown(diff);
    }
  }, []);

  const startBlockCountdown = (seconds) => {
    setBlockedSecs(seconds);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setBlockedSecs(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          localStorage.removeItem('rpm_blocked_until');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (blockedSecs > 0) return;

    /* ── Remember me is required ── */
    if (!remember) {
      setRememberErr(true);
      triggerShake();
      toast.error('Please check "Remember me" to proceed.');
      return;
    }
    setRememberErr(false);

    if (!formData.email.trim() || !formData.password.trim()) {
      toast.error('Please fill in all fields');
      triggerShake();
      return;
    }

    setLoading(true);
    try {
      localStorage.setItem('rpm_remembered_email', formData.email.trim().toLowerCase());

      const result = await login(formData.email, formData.password);

      if (!result.success) {
        triggerShake();

        /* account blocked — result may contain blockedFor (seconds) or blockedUntil (ms timestamp) */
        if (result.blockedFor || result.blockedUntil) {
          const secs = result.blockedFor
            ? result.blockedFor
            : Math.ceil((result.blockedUntil - Date.now()) / 1000);
          const until = Date.now() + secs * 1000;
          localStorage.setItem('rpm_blocked_until', until.toString());
          startBlockCountdown(secs);
          toast.error(`Account locked. Try again in ${fmtTime(secs)}.`);
        } else if (result.attemptsRemaining !== undefined) {
          toast.error(
            `${result.error || 'Invalid credentials'}. ${result.attemptsRemaining} attempt${result.attemptsRemaining !== 1 ? 's' : ''} remaining.`
          );
        } else {
          toast.error(result.error || 'Login failed');
        }
      } else {
        toast.success('Welcome back!');
      }
    } catch {
      toast.error('An unexpected error occurred');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSuccess = () => {
    setShowForgot(false);
    toast.success('Password reset! Please sign in with your new password.');
  };

  const isBlocked = blockedSecs > 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Outfit:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Root ───────────────────────────────────────── */
        .rpm-root {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          font-family: 'Outfit', sans-serif;
          background: #0c1322;
        }
        .rpm-body { flex: 1; display: flex; }

        /* ── Left panel ─────────────────────────────────── */
        .rpm-left {
          display: none;
          position: relative;
          overflow: hidden;
          flex: 0 0 44%;
        }
        @media (min-width: 992px) { .rpm-left { display: flex; } }

        .rpm-left-bg {
          position: absolute; inset: 0;
          background-image: url('${rone_bg}');
          background-size: cover;
          background-position: center;
          transition: transform 10s ease;
        }
        .rpm-root:hover .rpm-left-bg { transform: scale(1.05); }

        .rpm-left-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(
            155deg,
            rgba(8,18,48,0.91) 0%,
            rgba(12,30,80,0.76) 45%,
            rgba(5,12,32,0.93) 100%
          );
        }

        /* Decorative diagonal cut edge */
        .rpm-left-stripe {
          position: absolute; top: 0; right: -1px;
          width: 58px; height: 100%;
          background: linear-gradient(to bottom right, transparent 49.9%, #f4f5f9 50%);
          z-index: 3;
        }

        .rpm-left-content {
          position: relative; z-index: 2;
          display: flex; flex-direction: column;
          justify-content: space-between;
          padding: 48px 52px 48px 48px;
          width: 100%; color: #fff;
        }

        /* Brand */
        .rpm-left-brand { display: flex; align-items: center; gap: 13px; }
        .rpm-brand-icon {
          width: 44px; height: 44px;
          background: linear-gradient(135deg, #c9972a 0%, #f0c040 100%);
          border-radius: 11px;
          display: flex; align-items: center; justify-content: center;
          font-size: 20px;
          box-shadow: 0 4px 16px rgba(201,151,42,0.42);
          flex-shrink: 0;
        }
        .rpm-brand-name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.25rem; font-weight: 700; letter-spacing: 0.06em;
        }
        .rpm-brand-name span {
          display: block;
          font-family: 'Outfit', sans-serif; font-size: 0.62rem; font-weight: 400;
          color: rgba(255,255,255,0.45); letter-spacing: 0.18em;
          text-transform: uppercase; margin-top: 1px;
        }

        /* Center visual */
        .rpm-center-visual {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 22px; padding: 24px 0;
        }
        .rpm-center-visual img {
          max-width: 72%; max-height: 280px; object-fit: contain;
          filter: drop-shadow(0 20px 48px rgba(0,0,0,0.5));
          animation: floatLogo 6s ease-in-out infinite;
        }
        @keyframes floatLogo {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-12px); }
        }

        /* Stats */
        .rpm-stats { display: flex; gap: 22px; justify-content: center; }
        .rpm-stat { text-align: center; }
        .rpm-stat-val {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.55rem; font-weight: 700; color: #f0c040; line-height: 1;
        }
        .rpm-stat-lbl {
          font-size: 0.65rem; color: rgba(255,255,255,0.42);
          text-transform: uppercase; letter-spacing: 0.1em; margin-top: 3px;
        }
        .rpm-stat-div {
          width: 1px; background: rgba(255,255,255,0.12); align-self: stretch;
        }

        /* Footer */
        .rpm-left-footer {
          border-top: 1px solid rgba(255,255,255,0.09); padding-top: 26px;
        }
        .rpm-tagline {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.42rem; font-weight: 600;
          line-height: 1.5; color: #fff; margin-bottom: 14px;
        }
        .rpm-tagline em { color: #f0c040; font-style: normal; }
        .rpm-bullets { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .rpm-bullets li {
          display: flex; align-items: center; gap: 10px;
          font-size: 0.79rem; color: rgba(255,255,255,0.58); font-weight: 300;
        }
        .rpm-bullet-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: #f0c040; flex-shrink: 0;
        }

        /* ── Right panel ─────────────────────────────────── */
        .rpm-right {
          flex: 1; display: flex; align-items: center; justify-content: center;
          background: #f4f5f9; padding: 36px 24px;
          position: relative; overflow: hidden;
        }
        .rpm-bg-circle { position: absolute; border-radius: 50%; pointer-events: none; }
        .rpm-bg-circle-1 {
          top: -120px; right: -120px; width: 380px; height: 380px;
          background: radial-gradient(circle, rgba(201,151,42,0.06) 0%, transparent 65%);
        }
        .rpm-bg-circle-2 {
          bottom: -100px; left: -100px; width: 300px; height: 300px;
          background: radial-gradient(circle, rgba(13,38,104,0.07) 0%, transparent 65%);
        }

        /* Card */
        .rpm-card {
          width: 100%; max-width: 440px;
          background: #fff; border-radius: 22px;
          box-shadow:
            0 2px 8px rgba(0,0,0,0.05),
            0 16px 48px rgba(13,38,104,0.11),
            0 0 0 1px rgba(0,0,0,0.045);
          position: relative; z-index: 1;
          opacity: 0; transform: translateY(22px);
          transition: opacity 0.5s ease, transform 0.5s ease;
          overflow: hidden;
        }
        .rpm-card.is-mounted { opacity: 1; transform: translateY(0); }

        /* Shake */
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          15%  { transform: translateX(-7px); }
          30%  { transform: translateX(7px); }
          45%  { transform: translateX(-5px); }
          60%  { transform: translateX(5px); }
          75%  { transform: translateX(-3px); }
          90%  { transform: translateX(3px); }
        }
        .rpm-card.shake { animation: shake 0.55s ease; }

        /* Top accent bar */
        .rpm-card-accent {
          height: 4px;
          background: linear-gradient(90deg, #0d2668 0%, #c9972a 55%, #f0c040 100%);
        }
        .rpm-card-inner { padding: 36px 38px 32px; }

        /* Logo header */
        .rpm-card-header {
          display: none;
          flex-direction: column; align-items: center;
          margin-bottom: 26px; padding-bottom: 22px;
          border-bottom: 1px solid #f0f1f6; position: relative;
        }
        @media (min-width: 992px) { .rpm-card-header { display: flex; } }
        .rpm-card-header::after {
          content: ''; position: absolute;
          bottom: -1px; left: 50%; transform: translateX(-50%);
          width: 44px; height: 2px;
          background: linear-gradient(90deg, #c9972a, #f0c040); border-radius: 2px;
        }
        .rpm-card-logo-img {
          height: 58px; object-fit: contain;
          filter: drop-shadow(0 4px 14px rgba(13,38,104,0.13));
          margin-bottom: 10px;
        }
        .rpm-card-portal-badge {
          display: inline-flex; align-items: center; gap: 5px;
          background: #f0f4ff; border: 1px solid #dce4f8;
          border-radius: 20px; padding: 3px 12px;
          font-size: 0.67rem; font-weight: 600;
          letter-spacing: 0.11em; text-transform: uppercase; color: #3d5aa8;
        }

        /* Mobile logo */
        .rpm-mobile-logo {
          display: flex; flex-direction: column; align-items: center;
          gap: 5px; margin-bottom: 22px;
        }
        .rpm-mobile-logo img { height: 46px; object-fit: contain; }
        .rpm-mobile-logo-sub {
          font-size: 0.67rem; font-weight: 600; letter-spacing: 0.13em;
          text-transform: uppercase; color: #a0aab8;
        }
        @media (min-width: 992px) { .rpm-mobile-logo { display: none; } }

        /* Sign-in heading */
        .rpm-signin-head { text-align: center; margin-bottom: 24px; }
        .rpm-signin-head h2 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.65rem; font-weight: 700; color: #0d1e44;
          line-height: 1.22; margin-bottom: 4px;
        }
        .rpm-signin-head p { font-size: 0.81rem; color: #8d96a8; }

        /* ── Blocked banner ── */
        .rpm-blocked-banner {
          display: flex; align-items: center; gap: 12px;
          background: linear-gradient(135deg, #fff5f5, #fff0f0);
          border: 1.5px solid #fca5a5;
          border-radius: 13px; padding: 14px 16px; margin-bottom: 18px;
          animation: fadeInDown 0.38s ease;
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .rpm-blocked-icon {
          width: 40px; height: 40px;
          background: #fee2e2; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; font-size: 18px; color: #dc2626;
        }
        .rpm-blocked-text { flex: 1; }
        .rpm-blocked-title {
          font-size: 0.82rem; font-weight: 600; color: #dc2626; margin-bottom: 2px;
        }
        .rpm-blocked-sub { font-size: 0.74rem; color: #9b4040; }
        .rpm-blocked-timer {
          font-size: 1.15rem; font-weight: 700; color: #dc2626;
          min-width: 56px; text-align: right; letter-spacing: 0.02em;
          font-variant-numeric: tabular-nums;
        }

        /* ── Fields ── */
        .rpm-field { margin-bottom: 17px; }
        .rpm-label {
          display: block; font-size: 0.77rem; font-weight: 600;
          color: #374151; margin-bottom: 7px; letter-spacing: 0.01em;
        }
        .rpm-input-wrap { position: relative; display: flex; align-items: center; }
        .rpm-input-icon {
          position: absolute; left: 14px; color: #b4bcc8;
          font-size: 14px; pointer-events: none; z-index: 1; transition: color 0.2s;
        }
        .rpm-input-wrap:focus-within .rpm-input-icon { color: #c9972a; }
        .rpm-input {
          width: 100%; height: 48px; padding: 0 46px 0 42px;
          border: 1.5px solid #e6e9f0; border-radius: 11px;
          font-family: 'Outfit', sans-serif; font-size: 0.88rem;
          color: #111827; background: #fafbfd; outline: none;
          transition: border-color 0.22s, box-shadow 0.22s, background 0.22s;
        }
        .rpm-input:focus {
          border-color: #c9972a; background: #fff;
          box-shadow: 0 0 0 3.5px rgba(201,151,42,0.10);
        }
        .rpm-input:disabled { opacity: 0.48; cursor: not-allowed; }
        .rpm-input::placeholder { color: #c6ccd8; }
        .rpm-toggle-pw {
          position: absolute; right: 12px;
          background: none; border: none; cursor: pointer;
          color: #b4bcc8; font-size: 14px; padding: 4px;
          transition: color 0.2s; z-index: 1;
        }
        .rpm-toggle-pw:hover { color: #374151; }

        /* ── Remember row ── */
        .rpm-options-row {
          display: flex; align-items: flex-start;
          justify-content: space-between; margin-bottom: 22px; gap: 12px;
        }
        .rpm-remember-wrap { display: flex; flex-direction: column; gap: 4px; }
        .rpm-remember {
          display: flex; align-items: center; gap: 8px;
          cursor: pointer; user-select: none;
        }
        .rpm-remember-cb {
          width: 17px; height: 17px;
          appearance: none; -webkit-appearance: none;
          border: 1.5px solid #d1d5db; border-radius: 5px;
          background: #fff; cursor: pointer; position: relative;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
          flex-shrink: 0;
        }
        .rpm-remember-cb.err-cb {
          border-color: #f87171;
          box-shadow: 0 0 0 3px rgba(248,113,113,0.16);
        }
        .rpm-remember-cb:checked { background: #c9972a; border-color: #c9972a; }
        .rpm-remember-cb:checked::after {
          content: ''; position: absolute; top: 2px; left: 5px;
          width: 5px; height: 8px; border: 2px solid #fff;
          border-top: none; border-left: none; transform: rotate(45deg);
        }
        .rpm-remember-cb:disabled { opacity: 0.5; cursor: not-allowed; }
        .rpm-remember-label { font-size: 0.81rem; color: #4b5563; }
        .rpm-remember-asterisk { color: #ef4444; font-weight: 600; margin-left: 1px; }
        .rpm-remember-error {
          font-size: 0.7rem; color: #ef4444; font-weight: 500;
          display: flex; align-items: center; gap: 4px; margin-left: 25px;
          animation: fadeInDown 0.25s ease;
        }
        .rpm-forgot-link {
          font-size: 0.81rem; font-weight: 500; color: #c9972a;
          background: none; border: none; cursor: pointer; padding: 0;
          transition: color 0.2s; white-space: nowrap;
          margin-top: 1px;
        }
        .rpm-forgot-link:hover { color: #a37820; text-decoration: underline; }

        /* ── Submit ── */
        .rpm-btn {
          width: 100%; height: 50px;
          background: linear-gradient(135deg, #0d2668 0%, #1a3fa0 100%);
          color: #fff; border: none; border-radius: 12px;
          font-family: 'Outfit', sans-serif; font-size: 0.94rem;
          font-weight: 600; letter-spacing: 0.03em; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 9px;
          transition: transform 0.15s, box-shadow 0.15s, filter 0.2s, opacity 0.2s;
          box-shadow: 0 4px 20px rgba(13,38,104,0.30);
          margin-bottom: 20px; position: relative; overflow: hidden;
        }
        .rpm-btn::before {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.09) 0%, transparent 55%);
        }
        .rpm-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 26px rgba(13,38,104,0.38);
          filter: brightness(1.07);
        }
        .rpm-btn:active:not(:disabled) { transform: translateY(0); }
        .rpm-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .rpm-btn.blocked {
          background: linear-gradient(135deg, #9ca3af, #6b7280);
          box-shadow: none;
        }
        .rpm-btn.blocked:hover { transform: none; filter: none; }

        /* Spinner */
        .rpm-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.32);
          border-top-color: #fff; border-radius: 50%;
          animation: spin 0.7s linear infinite; display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Divider */
        .rpm-divider {
          text-align: center; position: relative; margin-bottom: 16px;
        }
        .rpm-divider::before {
          content: ''; position: absolute;
          top: 50%; left: 0; right: 0; height: 1px; background: #edf0f6;
        }
        .rpm-divider span {
          position: relative; background: #fff;
          padding: 0 12px; font-size: 0.71rem; color: #b4bcc8;
        }
        .rpm-security-note {
          display: flex; align-items: center; justify-content: center;
          gap: 6px; font-size: 0.72rem; color: #b4bcc8;
        }
        .rpm-security-note i { font-size: 12px; color: #22c55e; }

        /* Panel slide */
        .rpm-panel-slide { transition: opacity 0.35s ease, transform 0.35s ease; }
        .rpm-panel-slide.rpm-hidden {
          opacity: 0; transform: translateX(-20px);
          pointer-events: none; position: absolute;
        }

        /* ── Footer ─────────────────────────────────────── */
        .rpm-footer {
          background: #080f1e;
          border-top: 1px solid rgba(255,255,255,0.055);
          padding: 14px 24px;
          display: flex; align-items: center; justify-content: center;
          gap: 14px; flex-wrap: wrap;
        }
        .rpm-footer-copy {
          font-size: 0.72rem; color: rgba(255,255,255,0.28); letter-spacing: 0.01em;
        }
        .rpm-footer-copy strong { color: rgba(255,255,255,0.48); font-weight: 600; }
        .rpm-footer-sep {
          width: 1px; height: 13px; background: rgba(255,255,255,0.10);
        }
        .rpm-footer-badge {
          display: flex; align-items: center; gap: 5px;
          font-size: 0.69rem; color: rgba(255,255,255,0.24);
        }
        .rpm-footer-badge i { font-size: 11px; }
        .rpm-footer-badge.green i { color: #22c55e; }
        .rpm-footer-badge.gold i  { color: #c9972a; }
      `}</style>

      <div className="rpm-root">
        <div className="rpm-body">

          {/* ── Left decorative panel ── */}
          <div className="rpm-left">
            <div className="rpm-left-bg" />
            <div className="rpm-left-overlay" />
            <div className="rpm-left-stripe" />
            <div className="rpm-left-content">

              {/* <div className="rpm-left-brand">
                <div className="rpm-brand-icon">
                  <i className="bi bi-buildings" style={{ color: '#0d2668' }} />
                </div>
                <div className="rpm-brand-name">
                  R-ONE
                  <span>Property Management</span>
                </div>
              </div> */}

              <div className="rpm-center-visual">
                <img src={rone_logo} alt="R-ONE" />
              </div>

              <div className="rpm-left-footer">
                <div className="rpm-tagline">
                  Manage rents &amp;<br />
                  <em>payments with precision</em>
                </div>
                <ul className="rpm-bullets">
                  <li><span className="rpm-bullet-dot" />Automated monthly rent generation</li>
                  <li><span className="rpm-bullet-dot" />TDS &amp; GST compliance built-in</li>
                  <li><span className="rpm-bullet-dot" />Instant Razorpay payment processing</li>
                  <li><span className="rpm-bullet-dot" />Real-time audit trail &amp; reports</li>
                </ul>
              </div>

            </div>
          </div>

          {/* ── Right form panel ── */}
          <div className="rpm-right">
            <div className="rpm-bg-circle rpm-bg-circle-1" />
            <div className="rpm-bg-circle rpm-bg-circle-2" />

            {/* Login card */}
            <div
              className={`rpm-card rpm-panel-slide ${mounted ? 'is-mounted' : ''} ${showForgot ? 'rpm-hidden' : ''} ${shake ? 'shake' : ''}`}
            >
              <div className="rpm-card-accent" />
              <div className="rpm-card-inner">

                {/* Mobile logo */}
                <div className="rpm-mobile-logo">
                  <img src={rone_logo} alt="R-ONE" />
                  <div className="rpm-mobile-logo-sub">Property Management</div>
                </div>

                {/* Desktop logo header */}
                <div className="rpm-card-header">
                  <img src={rone_logo} alt="R-ONE" className="rpm-card-logo-img" />
                  <div className="rpm-card-portal-badge">
                    <i className="bi bi-shield-lock" />
                    Secure Management Portal
                  </div>
                </div>

                {/* Heading */}
                <div className="rpm-signin-head">
                  <h2>Welcome</h2>
                  <p>Sign in to access your R-ONE dashboard</p>
                </div>

                {/* ── Blocked banner with live countdown ── */}
                {isBlocked && (
                  <div className="rpm-blocked-banner">
                    <div className="rpm-blocked-icon">
                      <i className="bi bi-lock-fill" />
                    </div>
                    <div className="rpm-blocked-text">
                      <div className="rpm-blocked-title">Account Temporarily Locked</div>
                      <div className="rpm-blocked-sub">Too many failed attempts. Please wait.</div>
                    </div>
                    <div className="rpm-blocked-timer">{fmtTime(blockedSecs)}</div>
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate>

                  {/* Email */}
                  <div className="rpm-field">
                    <label className="rpm-label" htmlFor="login-email">Email Address</label>
                    <div className="rpm-input-wrap">
                      <i className="bi bi-envelope rpm-input-icon" />
                      <input
                        id="login-email"
                        type="email"
                        name="email"
                        className="rpm-input"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="you@example.com"
                        autoComplete="email"
                        disabled={isBlocked}
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="rpm-field">
                    <label className="rpm-label" htmlFor="login-password">Password</label>
                    <div className="rpm-input-wrap">
                      <i className="bi bi-lock rpm-input-icon" />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        className="rpm-input"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        disabled={isBlocked}
                        required
                      />
                      <button
                        type="button"
                        className="rpm-toggle-pw"
                        onClick={() => setShowPassword(v => !v)}
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <i className={`bi bi-eye${showPassword ? '-slash' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Remember me (required) + Forgot */}
                  <div className="rpm-options-row">
                    <div className="rpm-remember-wrap">
                      <label className="rpm-remember">
                        <input
                          type="checkbox"
                          className={`rpm-remember-cb${rememberErr ? ' err-cb' : ''}`}
                          checked={remember}
                          disabled={isBlocked}
                          onChange={e => {
                            setRemember(e.target.checked);
                            if (e.target.checked) setRememberErr(false);
                          }}
                        />
                        <span className="rpm-remember-label">
                          Remember me
                          <span className="rpm-remember-asterisk"> *</span>
                        </span>
                      </label>
                      {rememberErr && (
                        <span className="rpm-remember-error">
                          <i className="bi bi-exclamation-circle-fill" style={{ fontSize: 11 }} />
                          Required to continue
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="rpm-forgot-link"
                      onClick={() => setShowForgot(true)}
                    >
                      Forgot password?
                    </button>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    className={`rpm-btn${isBlocked ? ' blocked' : ''}`}
                    disabled={loading || isBlocked}
                  >
                    {loading ? (
                      <>
                        <span className="rpm-spinner" />
                        Signing in…
                      </>
                    ) : isBlocked ? (
                      <>
                        <i className="bi bi-hourglass-split" />
                        Locked · {fmtTime(blockedSecs)}
                      </>
                    ) : (
                      <>
                        <i className="bi bi-box-arrow-in-right" />
                        Sign In
                      </>
                    )}
                  </button>

                </form>

                <div className="rpm-divider"><span>protected access</span></div>
                <div className="rpm-security-note">
                  <i className="bi bi-shield-check" />
                  256-bit SSL encrypted &amp; secure
                </div>

              </div>
            </div>

            {/* Forgot password panel */}
            {showForgot && (
              <ForgotPassword
                onSuccess={handleForgotSuccess}
                onBack={() => setShowForgot(false)}
              />
            )}

          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="rpm-footer">
          <span className="rpm-footer-copy">
            &copy; 2026 <strong>R-ONE Infravision</strong>. All rights reserved.
          </span>
          <div className="rpm-footer-sep" />
          <span className="rpm-footer-badge green">
            <i className="bi bi-shield-check" />
            SSL Secured
          </span>
          <div className="rpm-footer-sep" />
          <span className="rpm-footer-badge gold">
            <i className="bi bi-file-earmark-lock" />
            Privacy Policy
          </span>
          <div className="rpm-footer-sep" />
          <span className="rpm-footer-badge">
            <i className="bi bi-envelope" style={{ color: '#8d96a8' }} />
            support@r-one.in
          </span>
        </footer>

      </div>
    </>
  );
};

export default Login;