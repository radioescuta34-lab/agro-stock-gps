import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import {
  User,
  AtSign,
  Save,
  Shield,
  Wrench,
  Lock,
  Check,
  CheckCircle,
  X
} from 'lucide-react';

export interface UserFormData {
  firstName: string;
  lastName: string;
  username: string;
  name: string;
  role?: UserRole;
}

interface UserFormProps {
  mode: 'self' | 'admin';
  initialData?: {
    firstName?: string;
    lastName?: string;
    username?: string;
    name?: string;
    role?: UserRole;
  };
  loading?: boolean;
  error?: string | null;
  success?: string | null;
  onSave: (data: UserFormData, password?: string) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export default function UserForm({
  mode,
  initialData,
  loading = false,
  error = null,
  success = null,
  onSave,
  onCancel,
  submitLabel
}: UserFormProps) {
  const nameStr = initialData?.name || '';
  const [firstName, setFirstName] = useState(initialData?.firstName || nameStr.split(' ')[0] || '');
  const [lastName, setLastName] = useState(initialData?.lastName || nameStr.split(' ').slice(1).join(' ') || '');
  const [username, setUsername] = useState(initialData?.username || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(initialData?.role || 'TECNICO_CAMPO');

  useEffect(() => {
    const nameStr = initialData?.name || '';
    setFirstName(initialData?.firstName || nameStr.split(' ')[0] || '');
    setLastName(initialData?.lastName || nameStr.split(' ').slice(1).join(' ') || '');
    setUsername(initialData?.username || '');
    setPassword('');
    if (initialData?.role) setRole(initialData.role);
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim()) return;
    if (!username.trim()) return;
    if (mode === 'admin' && password.length > 0 && password.length < 6) return;

    const data: UserFormData = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      name: `${firstName.trim()}${lastName.trim() ? ` ${lastName.trim()}` : ''}`,
      username: username.trim().toLowerCase(),
    };

    if (mode === 'admin') {
      data.role = role;
    }

    await onSave(data, password || undefined);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold p-3 rounded-xl">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold p-3 rounded-xl flex items-center gap-2">
          <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          {success}
        </div>
      )}

      {/* Nome & Sobrenome */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-black text-slate-400">
            Nome <span className="text-rose-500">*</span>
          </label>
          <div className="relative rounded-xl shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <User className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Ex: João"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={loading}
              className="w-full pl-10 pr-3.5 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-black text-slate-400">
            Sobrenome
          </label>
          <input
            type="text"
            placeholder="Ex: Silva"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={loading}
            className="w-full px-3.5 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50"
          />
        </div>
      </div>

      {/* Username */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase font-black text-slate-400">
          Nome de Usuário (username) <span className="text-rose-500">*</span>
        </label>
        <div className="relative rounded-xl shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <AtSign className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Ex: joaosilva"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
            className="w-full pl-10 pr-3.5 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Senha */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase font-black text-slate-400">
          {mode === 'admin' && !initialData?.name
            ? 'Senha de Acesso (Mín. 6 caracteres) *'
            : 'Nova Senha (Deixe em branco para manter a atual)'}
        </label>
        <div className="relative rounded-xl shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Lock className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <input
            type="password"
            placeholder={mode === 'admin' && !initialData?.name ? '••••••••' : 'Mín. 6 caracteres se for alterar'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="w-full pl-10 pr-3.5 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Função (admin only) */}
      {mode === 'admin' && (
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-black text-slate-400">Função / Perfil no Sistema</label>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <button
              type="button"
              onClick={() => setRole('TECNICO_CAMPO')}
              disabled={loading}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                role === 'TECNICO_CAMPO' || role === 'tecnico'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              Técnico Campo
              {(role === 'TECNICO_CAMPO' || role === 'tecnico') && (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setRole('ADMINISTRADOR')}
              disabled={loading}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                role === 'ADMINISTRADOR' || role === 'administrador'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              Admin
              {(role === 'ADMINISTRADOR' || role === 'administrador') && (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !firstName.trim() || !username.trim()}
          className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-600/10 flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {loading ? 'Salvando...' : (submitLabel || 'Salvar Alterações')}
        </button>
      </div>
    </form>
  );
}
