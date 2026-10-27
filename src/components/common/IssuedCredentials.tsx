import React, { useState } from 'react';
import { Copy, KeyRound, Check } from 'lucide-react';

export interface Credential {
  name: string;
  loginId: string;
  password: string;
}

/** Shows newly issued temporary passwords once, so the admin can hand them over. */
export const IssuedCredentials: React.FC<{ credentials: Credential[] }> = ({ credentials }) => {
  const [copied, setCopied] = useState(false);
  const text = credentials.map((c) => `${c.name}\t${c.loginId}\t${c.password}`).join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Name\tLogin ID\tTemporary password\n${text}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the table is still selectable */
    }
  };

  if (credentials.length === 0) return null;
  return (
    <div style={{ border: '1px solid var(--amber-200)', background: 'var(--amber-50)', borderRadius: 'var(--r-md)', padding: '0.875rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <KeyRound size={14} /> Temporary password{credentials.length > 1 ? 's' : ''} — shown only once
        </strong>
        <button type="button" className="btn btn-secondary btn-xs" onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        <table className="data-table" style={{ fontSize: '0.75rem' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Login ID</th>
              <th>Password</th>
            </tr>
          </thead>
          <tbody>
            {credentials.map((c) => (
              <tr key={c.loginId}>
                <td>{c.name}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{c.loginId}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{c.password}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--gray-600)', margin: '0.5rem 0 0' }}>
        They will be asked to choose a new password the first time they sign in.
      </p>
    </div>
  );
};
