import React, { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { Branch } from '../../types';
import { Shield, X, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface SetupAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (username: string) => void;
}

export const SetupAdminModal: React.FC<SetupAdminModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [username, setUsername] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [primaryBranchId, setPrimaryBranchId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      apiClient.getBranches().then(res => {
        if (res.success && res.data.length > 0) {
          setBranches(res.data);
          setPrimaryBranchId(res.data[0].id);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (username.length < 4 || username.length > 10) {
      setError('Username must strictly be between 4 and 10 characters.');
      return;
    }

    if (!fullName.trim() || !password || !primaryBranchId) {
      setError('Please provide full name, password, and primary branch.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.setupInitialAdmin({
        username: username.toLowerCase().trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        primaryBranchId,
      });

      if (res.success) {
        onSuccess(username);
        onClose();
      } else {
        setError('Failed to setup administrator.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error setting up administrator.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-50 text-slate-900 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-700" />
            <h2 className="text-base font-semibold text-slate-900">Institutional Administrator Setup</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1 rounded-md transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Provision the primary institutional administrator or IT Officer account with full rights allocation and multi-branch surveillance capabilities.
          </p>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Primary Operating Branch
            </label>
            <select
              value={primaryBranchId}
              onChange={e => setPrimaryBranchId(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
              required
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.isHeadquarters ? '(Headquarters)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Username (4–10 chars)
              </label>
              <input
                type="text"
                minLength={4}
                maxLength={10}
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                placeholder="e.g. itadm"
                required
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono uppercase bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Officer Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Patrick Mugisha"
              required
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Official Email (Optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="it@nyamuyanjasacco.ug"
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Phone Number (Optional)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+256 700 000000"
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
              />
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow transition flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Provisioning...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Save & Initialize Account
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
