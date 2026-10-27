import React, { useState, useEffect } from 'react';
import {
  QrCode, GraduationCap, UserCheck, ShieldCheck, Lock, Mail,
  ArrowRight, CheckCircle2, AlertCircle, Eye, EyeOff,
  Server, KeyRound, User
} from 'lucide-react';
import { useAttendance } from '../context/AttendanceContext';
import { checkHealth } from '../api/client';
import { AppRoute } from '../utils/router';
import { UserRole } from '../types';

// Demo account shortcuts; set VITE_HIDE_DEMO_LOGINS=true for a real deployment.
const SHOW_DEMO_LOGINS = import.meta.env.VITE_HIDE_DEMO_LOGINS !== 'true';

interface LoginPageProps {
  onNavigate: (route: AppRoute) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login } = useAttendance();
  const [selectedRole, setSelectedRole] = useState<UserRole>('STUDENT');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    checkHealth().then(setApiOnline);
  }, []);

  const handleRoleTabChange = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMsg('');
    setIdentifier('');
    setPassword('');
  };

  const signIn = async (role: UserRole, id: string, pw: string) => {
    setErrorMsg('');
    setIsLoading(true);
    try {
      await login(id.trim(), pw, role);
      onNavigate(role);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    void signIn(selectedRole, identifier, password);
  };

  const handleQuickDemoLogin = (role: UserRole, id: string, pw: string) => {
    setIdentifier(id);
    setPassword(pw);
    void signIn(role, id, pw);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Decorative background grid and blurs */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          left: '20%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37,99,235,0.18) 0%, rgba(37,99,235,0) 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-15%',
          right: '20%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0) 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '0.5rem 1.25rem',
            borderRadius: '9999px',
            marginBottom: '1rem',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <QrCode size={16} />
          </div>
          <span style={{ fontSize: '1.0625rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
            AttendPulse
          </span>
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              background: 'rgba(37, 99, 235, 0.25)',
              color: '#60a5fa',
              padding: '2px 8px',
              borderRadius: '9999px',
              border: '1px solid rgba(96, 165, 250, 0.3)',
            }}
          >
            Institutional Portal
          </span>
        </div>

        <h1
          style={{
            fontSize: 'clamp(1.75rem, 3.5vw, 2.25rem)',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-0.03em',
            margin: '0 0 0.5rem 0',
          }}
        >
          Sign In to Your Academic Portal
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9375rem', margin: 0, maxWidth: 520 }}>
          Centralized authentication for Students, Faculty Members, and Academic Administration.
        </p>

        {/* Local Microservice Status Pill */}
        <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: '9999px',
              background: apiOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${apiOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: apiOnline ? '#34d399' : '#fbbf24',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: apiOnline ? '#34d399' : '#fbbf24',
                boxShadow: apiOnline ? '0 0 6px #34d399' : 'none',
              }}
            />
            <Server size={12} />
            <span>
              API server: {apiOnline === null ? 'checking…' : apiOnline ? 'online' : 'offline — start the backend (see README)'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Authentication Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'rgba(30, 41, 59, 0.75)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          padding: '2rem',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Role Tab Navigation */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            marginBottom: '1.75rem',
            gap: 4,
          }}
        >
          {[
            { role: 'STUDENT' as const, label: 'Student', Icon: GraduationCap },
            { role: 'FACULTY' as const, label: 'Faculty', Icon: UserCheck },
            { role: 'ADMIN' as const, label: 'Admin', Icon: ShieldCheck },
          ].map(({ role, label, Icon }) => {
            const isActive = selectedRole === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => handleRoleTabChange(role)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  padding: '0.625rem 0.5rem',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  background: isActive ? '#2563eb' : 'transparent',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  boxShadow: isActive ? '0 2px 8px rgba(37,99,235,0.4)' : 'none',
                }}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '0.8125rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.25rem',
            }}
          >
            <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Credential Form */}
        <form onSubmit={handleLoginSubmit}>
          {/* Identifier Input */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#cbd5e1',
                marginBottom: '0.5rem',
              }}
            >
              {selectedRole === 'STUDENT'
                ? 'Enrollment Number or Student Email'
                : selectedRole === 'FACULTY'
                ? 'Faculty ID or College Email'
                : 'Administrator Email'}
            </label>
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {selectedRole === 'STUDENT' ? <User size={16} /> : selectedRole === 'FACULTY' ? <Mail size={16} /> : <KeyRound size={16} />}
              </div>
              <input
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={
                  selectedRole === 'STUDENT'
                    ? 'e.g. EN202401 or aarav.p@student.college.edu'
                    : selectedRole === 'FACULTY'
                    ? 'e.g. EMP-101 or sharma.cs@college.edu'
                    : 'e.g. dean.academics@college.edu'
                }
                required
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.6rem',
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  outline: 'none',
                  transition: 'border 0.15s ease',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)')}
              />
            </div>
          </div>

          {/* Password Input */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#cbd5e1',
                }}
              >
                {selectedRole === 'ADMIN' ? 'Security Passkey' : 'Password'}
              </label>
              <span
                style={{ fontSize: '0.75rem', color: '#60a5fa', cursor: 'help' }}
                title="Ask the administration office to reset your password. You will get a temporary one."
              >
                Forgot password?
              </span>
            </div>
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Lock size={16} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                style={{
                  width: '100%',
                  padding: '0.75rem 2.75rem 0.75rem 2.6rem',
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 4,
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '0.875rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#ffffff',
              fontSize: '0.9375rem',
              fontWeight: 700,
              cursor: isLoading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
              transition: 'transform 0.15s ease, opacity 0.15s ease',
              opacity: isLoading ? 0.75 : 1,
            }}
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In as {selectedRole === 'STUDENT' ? 'Student' : selectedRole === 'FACULTY' ? 'Faculty' : 'Administrator'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        {SHOW_DEMO_LOGINS && <div
          style={{
            display: 'flex',
            alignItems: 'center',
            margin: '1.75rem 0 1.25rem',
            color: '#64748b',
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ padding: '0 0.75rem' }}>Demo accounts (sample data)</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
        </div>}

        {/* Quick Demo Login Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {SHOW_DEMO_LOGINS && selectedRole === 'STUDENT' && (
            <>
              {[
                { name: 'Aarav Patel', roll: 'EN202401', sem: 'Sem 3 · Div A', id: 'EN202401' },
                { name: 'Priya Sharma', roll: 'EN202402', sem: 'Sem 3 · Div A', id: 'EN202402' },
                { name: 'Rohan Kulkarni', roll: 'EN202403', sem: 'Sem 3 · Div A · below 75%', id: 'EN202403' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleQuickDemoLogin('STUDENT', s.id, 'password123')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.625rem 0.875rem',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(37, 99, 235, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {s.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{s.name} ({s.roll})</div>
                      <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{s.sem}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 600 }}>
                    Sign In →
                  </span>
                </button>
              ))}
            </>
          )}

          {SHOW_DEMO_LOGINS && selectedRole === 'FACULTY' && (
            <>
              {[
                { name: 'Prof. Rajesh Sharma', role: 'EMP-101', id: 'EMP-101', dept: 'DBMS & TOC' },
                { name: 'Dr. Anita Rao', role: 'EMP-102', id: 'EMP-102', dept: 'Operating Systems' },
                { name: 'Prof. Vikram Patel', role: 'EMP-103', id: 'EMP-103', dept: 'Mathematics III' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleQuickDemoLogin('FACULTY', f.id, 'password123')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.625rem 0.875rem',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: '#059669',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {f.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{f.name}</div>
                      <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{f.role} · {f.dept}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600 }}>
                    Sign In →
                  </span>
                </button>
              ))}
            </>
          )}

          {SHOW_DEMO_LOGINS && selectedRole === 'ADMIN' && (
            <button
              type="button"
              onClick={() => handleQuickDemoLogin('ADMIN', 'dean.academics@college.edu', 'admin2026')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#ffffff',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(217, 119, 6, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(217, 119, 6, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: '#d97706',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                  }}
                >
                  DK
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Dr. S. K. Kulkarni</div>
                  <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>Dean Academics &amp; Institutional Administrator</div>
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 600 }}>
                Instant Access →
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Security notice footer */}
      <div
        style={{
          marginTop: '2rem',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <CheckCircle2 size={13} color="#10b981" /> Face recognition check-in
        </span>
        <span>•</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <CheckCircle2 size={13} color="#10b981" /> Server-signed rotating QR codes
        </span>
        <span>•</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <CheckCircle2 size={13} color="#10b981" /> Role-based access
        </span>
      </div>
    </div>
  );
};
