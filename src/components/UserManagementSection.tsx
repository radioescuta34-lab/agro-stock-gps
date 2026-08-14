import React, { useEffect, useState } from 'react';
import { UserProfile, UserRole } from '../types';
import { useNotifications } from './NotificationProvider';
import {
  Users,
  Search,
  Shield,
  Wrench,
  Calendar,
  Edit2,
  Trash2,
  UserPlus,
  X,
  Info,
  CheckCircle2
} from 'lucide-react';
import UserForm from './UserForm';
import type { UserFormData } from './UserForm';

interface UserManagementSectionProps {
  usersList: UserProfile[];
  role: UserRole;
  companyEmail: string;
  onAddUser?: (newUser: Omit<UserProfile, 'createdAt'>, password?: string) => Promise<void>;
  onEditUser?: (uid: string, updates: Partial<Omit<UserProfile, 'uid' | 'createdAt'>>, password?: string) => Promise<any>;
  onDeleteUser?: (uid: string) => Promise<void>;
}

export default function UserManagementSection({
  usersList = [],
  role,
  companyEmail,
  onAddUser,
  onEditUser,
  onDeleteUser
}: UserManagementSectionProps) {
  const { confirmDialog } = useNotifications();
  const [searchTerm, setSearchTerm] = useState('');
  const [userFormMode, setUserFormMode] = useState<'add' | 'edit'>('add');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  const isAdmin = role === 'administrador' || role === 'ADMINISTRADOR';

  const filteredUsers = usersList.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const closeUserForm = () => {
    setUserFormMode('add');
    setSelectedUser(null);
    setUserError(null);
    setIsFormOpen(false);
  };

  const startAddUser = () => {
    setUserFormMode('add');
    setSelectedUser(null);
    setUserError(null);
    setUserSuccess(null);
    setIsFormOpen(true);
  };

  const startEditUser = (u: UserProfile) => {
    setUserFormMode('edit');
    setSelectedUser(u);
    setUserError(null);
    setUserSuccess(null);
    setIsFormOpen(true);
  };

  useEffect(() => {
    if (!isFormOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !userLoading) closeUserForm();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFormOpen, userLoading]);

  const handleUserFormSave = async (data: UserFormData, password?: string) => {
    if (!isAdmin) return;
    setUserError(null);
    setUserSuccess(null);
    setUserLoading(true);

    const virtualEmail = `${data.username}@agrostockgps.com`;

    try {
      if (userFormMode === 'add') {
        if (!password || password.length < 6) {
          setUserError('A senha de acesso é obrigatória e deve ter no mínimo 6 caracteres.');
          setUserLoading(false);
          return;
        }

        const tempUid = 'user_' + Math.random().toString(36).substr(2, 9);
        await onAddUser?.({
          uid: tempUid,
          name: data.name,
          firstName: data.firstName,
          lastName: data.lastName,
          username: data.username,
          email: virtualEmail,
          role: data.role!
        }, password);

        setUserSuccess('Usuário e login de acesso criados com sucesso!');
        closeUserForm();
      } else {
        if (!selectedUser) return;

        const result = await onEditUser?.(selectedUser.uid, {
          name: data.name,
          firstName: data.firstName,
          lastName: data.lastName,
          username: data.username,
          email: virtualEmail,
          role: data.role!
        }, password || undefined);

        if (result && result.warning) {
          setUserSuccess(`Cadastro de usuário atualizado com sucesso!\n\nNota: ${result.warning}`);
        } else {
          setUserSuccess('Cadastro de usuário atualizado com sucesso!');
        }
        closeUserForm();
      }
    } catch (err: any) {
      console.error(err);
      setUserError(err.message || 'Erro ao salvar os dados do usuário.');
    } finally {
      setUserLoading(false);
    }
  };

  const handleDeleteUserClick = async (uid: string, uEmail: string) => {
    if (!isAdmin) return;
    if (uEmail === companyEmail) {
      setUserError('Não é permitido excluir o usuário principal da empresa.');
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Excluir Usuário',
      message: `Tem certeza de que deseja excluir o usuário "${uEmail}"? Esta ação removerá o acesso ao sistema.`,
      confirmLabel: 'Sim, Excluir',
      cancelLabel: 'Cancelar',
      danger: true
    });
    if (confirmed) {
      setUserLoading(true);
      setUserError(null);
      setUserSuccess(null);

      try {
        await onDeleteUser?.(uid);
        setUserSuccess('Acesso e cadastro do usuário excluídos com sucesso.');
      } catch (err: any) {
        setUserError(err.message || 'Erro ao excluir o usuário do banco de dados.');
      } finally {
        setUserLoading(false);
      }
    }
  };

  const getInitials = (fullName?: string) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    if (parts.length >= 2) {
      return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
    }
    return fullName.substring(0, 2).toUpperCase();
  };

  const formatCreatedAt = (value: any) => {
    if (!value) return null;
    const date = typeof value?.toDate === 'function'
      ? value.toDate()
      : value?.seconds
        ? new Date(value.seconds * 1000)
        : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="bg-slate-50 border border-slate-200 text-slate-500 text-xs p-4 rounded-xl flex items-start gap-2">
          <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          <span>Apenas administradores podem gerenciar usuários.</span>
        </div>
      )}

      {userSuccess && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span className="whitespace-pre-line">{userSuccess}</span>
        </div>
      )}

      {!isFormOpen && userError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
          {userError}
        </div>
      )}

      <div>
        {/* User list panel */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">Colaboradores com acesso</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {usersList.length} {usersList.length === 1 ? 'usuário cadastrado' : 'usuários cadastrados'}
                </p>
              </div>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={startAddUser}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:w-auto"
              >
                <UserPlus className="h-4 w-4" />
                Adicionar usuário
              </button>
            )}
          </div>

          <div className="p-4 sm:p-5">
            <div className="relative mb-4 rounded-xl shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Filtrar por nome ou e-mail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

          {filteredUsers.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-500">Nenhum colaborador encontrado</p>
              <p className="text-[10px] text-slate-400 mt-1">Ajuste a busca ou adicione um novo usuário.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((u) => {
                const isSelf = u.email === companyEmail;
                const isUserAdmin = u.role === 'administrador' || u.role === 'ADMINISTRADOR';
                const userRoleLabel = isUserAdmin ? 'Administrador' : 'Técnico de Campo';
                const displayUsername = u.username || (u.email ? u.email.split('@')[0] : '');

                return (
                  <div
                    key={u.uid}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition-colors hover:border-slate-300 sm:p-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-9 w-9 rounded-full overflow-hidden font-bold text-xs flex items-center justify-center shrink-0 ${
                        isUserAdmin
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}>
                        {u.photoURL ? (
                          <img src={u.photoURL} alt="" className="w-full h-full object-cover" />
                        ) : (
                          getInitials(u.name)
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800 truncate">{u.name}</span>
                          {u.uid.startsWith('demo_user_') && (
                            <span className="bg-slate-100 text-slate-500 text-[8px] px-1 py-0.2 rounded font-mono">Demo</span>
                          )}
                        </div>
                        <span className="block text-[10px] text-slate-400 truncate mt-0.5 font-mono">Usuário: {displayUsername}</span>

                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`inline-flex items-center gap-1 text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                            isUserAdmin
                              ? 'bg-amber-50 text-amber-700 border-amber-100'
                              : 'bg-blue-50 text-blue-700 border-blue-100'
                          }`}>
                            {isUserAdmin ? <Shield className="h-2 w-2" /> : <Wrench className="h-2 w-2" />}
                            {userRoleLabel}
                          </span>

                          {formatCreatedAt(u.createdAt) && (
                            <span className="text-[9px] text-slate-400 flex items-center gap-1 font-mono">
                              <Calendar className="h-2.5 w-2.5 shrink-0" />
                              {formatCreatedAt(u.createdAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1.5 shrink-0 ml-4">
                        <button
                          onClick={() => startEditUser(u)}
                          disabled={userLoading}
                          aria-label={`Editar ${u.name}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                          title="Editar usuário"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUserClick(u.uid, u.email)}
                          disabled={userLoading || isSelf}
                          aria-label={`Excluir acesso de ${u.name}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-30"
                          title={isSelf ? 'O usuário principal não pode ser excluído' : 'Excluir acesso'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>

      {isFormOpen && isAdmin && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-form-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !userLoading) closeUserForm();
          }}
        >
          <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  {userFormMode === 'add' ? <UserPlus className="h-5 w-5" /> : <Edit2 className="h-5 w-5" />}
                </span>
                <div>
                  <h2 id="user-form-title" className="text-sm font-extrabold text-slate-900">
                    {userFormMode === 'add' ? 'Adicionar usuário' : 'Editar usuário'}
                  </h2>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    {userFormMode === 'add'
                      ? 'Crie as credenciais e defina o perfil de acesso.'
                      : `Atualize os dados de ${selectedUser?.name || 'usuário selecionado'}.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeUserForm}
                disabled={userLoading}
                aria-label="Fechar formulário de usuário"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              <UserForm
                mode="admin"
                initialData={selectedUser ? {
                  firstName: selectedUser.firstName || selectedUser.name.split(' ')[0],
                  lastName: selectedUser.lastName || selectedUser.name.split(' ').slice(1).join(' '),
                  username: selectedUser.username || selectedUser.email.split('@')[0],
                  name: selectedUser.name,
                  role: selectedUser.role,
                } : undefined}
                loading={userLoading}
                error={userError}
                onSave={handleUserFormSave}
                onCancel={closeUserForm}
                submitLabel={userFormMode === 'add' ? 'Cadastrar usuário' : 'Salvar alterações'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
