import React, { useState, useRef, useEffect } from 'react';
import { UserProfile } from '../types';
import {
  User,
  Shield,
  Wrench,
  Lock,
  Camera,
  X,
  ArrowLeft
} from 'lucide-react';
import UserForm from './UserForm';
import type { UserFormData } from './UserForm';

interface ProfileTabProps {
  user: UserProfile;
  onUpdateProfile: (
    updates: { name?: string; firstName?: string; lastName?: string; username?: string; photoURL?: string },
    rawPassword?: string
  ) => Promise<{ success: boolean; error?: string }>;
  onBack?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function ProfileTab({ user, onUpdateProfile, onBack }: ProfileTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoURL, setPhotoURL] = useState(user.photoURL || '');
  const [newPhotoData, setNewPhotoData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAdmin = user.role === 'administrador' || user.role === 'ADMINISTRADOR';
  const displayPhoto = newPhotoData || photoURL;
  const initials = getInitials(user.name);

  useEffect(() => {
    setPhotoURL(user.photoURL || '');
  }, [user.photoURL]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setNewPhotoData(reader.result as string);
      setError(null);
    };
    reader.onerror = () => {
      setError('Erro ao ler a imagem.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setNewPhotoData(null);
    setPhotoURL('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (data: UserFormData, password?: string) => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    const updates: any = {
      firstName: data.firstName,
      lastName: data.lastName,
      name: data.name,
      username: data.username,
    };

    if (newPhotoData !== null) {
      updates.photoURL = newPhotoData || '';
    } else if (photoURL !== user.photoURL) {
      updates.photoURL = photoURL || '';
    }

    const result = await onUpdateProfile(updates, password);

    setLoading(false);

    if (result.success) {
      setSuccess('Perfil atualizado com sucesso!');
      setNewPhotoData(null);
    } else {
      setError(result.error || 'Erro ao atualizar perfil.');
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
          <User className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">Meu Perfil</h1>
          <p className="text-xs text-slate-500 mt-0.5">Gerencie suas informações de acesso</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        {/* Avatar / Photo */}
        <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
          <div className="relative group shrink-0">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-14 h-14 rounded-full overflow-hidden bg-emerald-100 flex items-center justify-center cursor-pointer ring-2 ring-emerald-200 hover:ring-emerald-400 transition-all"
            >
              {displayPhoto ? (
                <img
                  src={displayPhoto}
                  alt="Foto de perfil"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-lg font-extrabold text-emerald-600 select-none">
                  {initials}
                </span>
              )}
            </div>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 group-hover:bg-black/40 transition-all cursor-pointer"
            >
              <Camera className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-all drop-shadow-md" />
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800 truncate">{user.name}</span>
              {(newPhotoData || photoURL) && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="text-[10px] text-rose-500 hover:text-rose-600 font-semibold shrink-0 transition-colors"
                >
                  <X className="h-3 w-3 inline" /> Remover
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Clique na foto para alterar • Máx. 2MB</p>
          </div>
        </div>

        {/* Summary Info */}
        <div className="flex items-center gap-6 pb-4 border-b border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Lock className="h-3 w-3" />
            <span className="font-mono">{user.username ? `${user.username.toLowerCase()}@agrostockgps.com` : user.email}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isAdmin ? (
              <Shield className="h-3 w-3 text-emerald-500" />
            ) : (
              <Wrench className="h-3 w-3 text-slate-400" />
            )}
            <span className="font-semibold text-slate-600">{isAdmin ? 'Administrador' : 'Técnico de Campo'}</span>
          </div>
        </div>

        {/* Fields */}
        <UserForm
          mode="self"
          initialData={{
            firstName: user.firstName || user.name.split(' ')[0],
            lastName: user.lastName || user.name.split(' ').slice(1).join(' '),
            username: user.username || '',
            name: user.name,
          }}
          loading={loading}
          error={error || undefined}
          success={success || undefined}
          onSave={handleSave}
          onCancel={onBack}
          submitLabel="Salvar Alterações"
        />
      </div>
    </div>
  );
}
