import React, { useState } from 'react';
import { UserProfile, UserRole } from '../types';
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
  Info
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
  const [searchTerm, setSearchTerm] = useState('');
  const [userFormMode, setUserFormMode] = useState<'add' | 'edit'>('add');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  const isAdmin = role === 'administrador' || role === 'ADMINISTRADOR';

  const filteredUsers = usersList.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const resetUserForm = () => {
    setUserFormMode('add');
    setSelectedUser(null);
    setUserError(null);
    setUserSuccess(null);
  };

  const startEditUser = (u: UserProfile) => {
    setUserFormMode('edit');
    setSelectedUser(u);
    setUserError(null);
    setUserSuccess(null);
  };

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
        resetUserForm();
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
        resetUserForm();
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

    if (window.confirm(`Tem certeza de que deseja excluir o usuário "${uEmail}"? Esta ação removerá o acesso ao sistema.`)) {
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

  return (
    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-4">
      {!isAdmin && (
        <div className="bg-slate-50 border border-slate-200 text-slate-500 text-xs p-4 rounded-xl flex items-start gap-2">
          <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          <span>Apenas administradores podem gerenciar usuários.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* User list panel */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
                Colaboradores com Acesso
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Estes usuários possuem credenciais válidas para efetuar login no sistema.
              </p>
            </div>

            <div className="relative rounded-xl shadow-sm w-full md:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Filtrar por nome ou e-mail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-500">Nenhum colaborador encontrado</p>
              <p className="text-[10px] text-slate-400 mt-1">Insira um novo cadastro utilizando o formulário abaixo.</p>
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
                    className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                      selectedUser?.uid === u.uid
                        ? 'bg-emerald-50/40 border-emerald-300 shadow-sm'
                        : 'bg-white border-slate-100 hover:border-slate-200'
                    }`}
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

                          {u.createdAt && (
                            <span className="text-[9px] text-slate-400 flex items-center gap-1 font-mono">
                              <Calendar className="h-2.5 w-2.5 shrink-0" />
                              {new Date(u.createdAt).toLocaleDateString('pt-BR')}
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
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Editar usuário"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUserClick(u.uid, u.email)}
                          disabled={userLoading}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Excluir acesso"
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

        {/* User form panel */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm p-4 sticky top-24 self-start">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            {userFormMode === 'add' ? <UserPlus className="h-4 w-4 text-emerald-500" /> : <Edit2 className="h-4 w-4 text-emerald-500" />}
            {userFormMode === 'add' ? 'Cadastrar Novo Usuário' : 'Alterar Usuário'}
          </h2>
          {userFormMode === 'edit' && (
            <button
              onClick={resetUserForm}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
              title="Cancelar edição"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!isAdmin ? (
          <div className="bg-slate-50 border border-slate-200 text-slate-500 text-xs p-4 rounded-xl flex items-start gap-2">
            <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
            <span>Apenas administradores podem cadastrar, alterar cargos ou excluir logins de novos colaboradores no sistema.</span>
          </div>
        ) : (
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
            success={userSuccess}
            onSave={handleUserFormSave}
            onCancel={userFormMode === 'edit' ? resetUserForm : undefined}
            submitLabel={userFormMode === 'add' ? 'Cadastrar Usuário' : 'Salvar Alterações'}
          />
        )}
      </div>
      </div>
    </div>
  );
}
