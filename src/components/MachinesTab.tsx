import React, { useState } from 'react';
import { Machine, MachineType, UserRole } from '../types';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  X, 
  Truck, 
  Info 
} from 'lucide-react';

interface MachinesTabProps {
  machines: Machine[];
  role: UserRole;
  onAddMachine: (mac: Omit<Machine, 'id' | 'updatedAt'>) => Promise<void>;
  onEditMachine: (id: string, updates: Partial<Machine>) => Promise<void>;
  onDeleteMachine: (id: string) => Promise<void>;
}

export default function MachinesTab({
  machines,
  role,
  onAddMachine,
  onEditMachine,
  onDeleteMachine
}: MachinesTabProps) {
  const isAdminOrTech = role === 'administrador' || role === 'tecnico' || role === 'ADMINISTRADOR' || role === 'TECNICO_CAMPO';

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const [isAdding, setIsAdding] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);

  // Form states
  const [prefix, setPrefix] = useState('');
  const [type, setType] = useState<MachineType>('Trator');
  const [model, setModel] = useState('');
  const [brand, setBrand] = useState('');
  const [fleet, setFleet] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setPrefix('');
    setType('Trator');
    setModel('');
    setBrand('');
    setFleet('');
    setError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminOrTech) return;

    if (!prefix || !model || !brand) {
      setError('Preencha os campos obrigatórios.');
      return;
    }

    // Check duplicate prefix
    if (machines.some(m => m.prefix.trim().toUpperCase() === prefix.trim().toUpperCase())) {
      setError('Este Prefixo de Máquina já está cadastrado.');
      return;
    }

    setLoading(true);
    try {
      await onAddMachine({
        prefix: prefix.trim().toUpperCase(),
        type,
        model: model.trim(),
        brand: brand.trim(),
        fleet: fleet.trim()
      });
      setIsAdding(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar máquina.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMachine) return;

    if (!model || !brand) {
      setError('Modelo e Fabricante da máquina são obrigatórios.');
      return;
    }

    setLoading(true);
    try {
      await onEditMachine(editingMachine.id, {
        type,
        model: model.trim(),
        brand: brand.trim(),
        fleet: fleet.trim()
      });
      setEditingMachine(null);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar máquina.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (mac: Machine) => {
    setEditingMachine(mac);
    setPrefix(mac.prefix);
    setType(mac.type);
    setModel(mac.model);
    setBrand(mac.brand);
    setFleet(mac.fleet || '');
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (!isAdminOrTech) return;
    if (window.confirm('Tem certeza de que deseja remover esta máquina da frota?')) {
      try {
        await onDeleteMachine(id);
      } catch (err: any) {
        alert(err.message || 'Erro ao remover máquina.');
      }
    }
  };

  const filteredMachines = machines.filter(m => {
    const matchesSearch = m.prefix.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          m.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (m.fleet || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' ? true : m.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6" id="machines-tab">
      
      {/* Header and Add Button */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Frota da Usina</h1>
          <p className="text-slate-500 text-xs mt-1">
            Cadastro de tratores, colhedoras e pulverizadores onde os pilotos Trimble e Topcon são instalados.
          </p>
        </div>

        {isAdminOrTech && !isAdding && !editingMachine && (
          <button
            onClick={() => { setIsAdding(true); resetForm(); }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
            id="open-add-machine-form"
          >
            <Plus className="h-4 w-4" />
            Cadastrar Veículo
          </button>
        )}
      </div>

      {/* Forms Area */}
      {isAdminOrTech && isAdding && (
        <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-md animate-fade-in" id="add-machine-form-block">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
            <h2 className="text-md font-bold text-slate-900 flex items-center gap-1.5">
              <Truck className="h-5 w-5 text-emerald-600" />
              Cadastrar Novo Veículo na Frota
            </h2>
            <button onClick={() => setIsAdding(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && <p className="bg-rose-50 border border-rose-200 text-rose-600 p-3 rounded-xl text-xs mb-4">{error}</p>}

          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Prefixo do Veículo *</label>
              <input
                type="text"
                required
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                placeholder="Ex: T01, C14, P08"
                id="input-machine-prefix"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Veículo *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as MachineType)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                id="select-machine-type"
              >
                <option value="Trator">Trator</option>
                <option value="Colhedora">Colhedora (Cana/Grãos)</option>
                <option value="Pulverizador">Pulverizador Autopropelido</option>
                <option value="Outro">Outro/Utilitário</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Modelo da Máquina *</label>
              <input
                type="text"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                placeholder="Ex: John Deere 8320 / Case CH570"
                id="input-machine-model"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fabricante/Marca *</label>
              <input
                type="text"
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                placeholder="Ex: John Deere, Case IH, Valtra"
                id="input-machine-brand"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Frota / Frente de Trabalho</label>
              <input
                type="text"
                value={fleet}
                onChange={(e) => setFleet(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                placeholder="Ex: Frente 01, Frota Cana"
                id="input-machine-fleet"
              />
            </div>

            <div className="md:col-span-5 flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
              >
                {loading ? 'Salvando...' : 'Cadastrar Veículo'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingMachine && (
        <div className="bg-white p-6 rounded-2xl border border-indigo-200 shadow-md animate-fade-in" id="edit-machine-form-block">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
            <h2 className="text-md font-bold text-slate-900 flex items-center gap-1.5">
              <Edit className="h-5 w-5 text-indigo-600" />
              Editar Informações do Veículo ({editingMachine.prefix})
            </h2>
            <button onClick={() => setEditingMachine(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && <p className="bg-rose-50 border border-rose-200 text-rose-600 p-3 rounded-xl text-xs mb-4">{error}</p>}

          <form onSubmit={handleUpdate} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Veículo *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as MachineType)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                id="edit-machine-type"
              >
                <option value="Trator">Trator</option>
                <option value="Colhedora">Colhedora (Cana/Grãos)</option>
                <option value="Pulverizador">Pulverizador Autopropelido</option>
                <option value="Outro">Outro/Utilitário</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Modelo da Máquina *</label>
              <input
                type="text"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                placeholder="Ex: John Deere 8320"
                id="edit-machine-model"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fabricante/Marca *</label>
              <input
                type="text"
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                placeholder="Ex: John Deere"
                id="edit-machine-brand"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Frota / Frente de Trabalho</label>
              <input
                type="text"
                value={fleet}
                onChange={(e) => setFleet(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                placeholder="Ex: Frente 01, Frota Cana"
                id="edit-machine-fleet"
              />
            </div>

            <div className="md:col-span-4 flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingMachine(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
              >
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter panel */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative rounded-xl shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
            placeholder="Buscar veículos por prefixo, marca ou modelo..."
            id="search-machines-input"
          />
        </div>

        <div className="w-full md:w-56 flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap uppercase">Tipo:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="block w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none"
            id="filter-machine-type-select"
          >
            <option value="all">Todos os Veículos</option>
            <option value="Trator">Tratores</option>
            <option value="Colhedora">Colhedoras</option>
            <option value="Pulverizador">Pulverizadores</option>
            <option value="Outro">Outros</option>
          </select>
        </div>
      </div>

      {/* Machines grid */}
      {filteredMachines.length === 0 ? (
        <div className="bg-white p-12 text-center border border-slate-200 rounded-2xl text-slate-400 text-sm">
          Nenhum veículo cadastrado corresponde aos critérios de busca.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="machines-grid-list">
          {filteredMachines.map((mac) => {
            let typeColor = 'bg-slate-100 text-slate-800';
            if (mac.type === 'Trator') typeColor = 'bg-emerald-50 text-emerald-800 border-emerald-100';
            if (mac.type === 'Colhedora') typeColor = 'bg-amber-50 text-amber-800 border-amber-100';
            if (mac.type === 'Pulverizador') typeColor = 'bg-blue-50 text-blue-800 border-blue-100';

            return (
              <div 
                key={mac.id} 
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-slate-400 font-semibold uppercase">Prefixo</span>
                      <h3 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">{mac.prefix}</h3>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${typeColor}`}>
                      {mac.type}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs">
                    <p className="text-slate-600">
                      <span className="text-slate-400 font-medium">Marca:</span> {mac.brand}
                    </p>
                    <p className="text-slate-600">
                      <span className="text-slate-400 font-medium">Modelo:</span> {mac.model}
                    </p>
                    <p className="text-slate-600 flex items-center gap-1.5">
                      <span className="text-slate-400 font-medium">Frota/Frente:</span> 
                      {mac.fleet ? (
                        <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md font-bold text-[10px] border border-emerald-100">
                          {mac.fleet}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Sem vínculo</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 font-medium">
                    Ativo na Frota
                  </span>

                  <div className="flex gap-1">
                    {isAdminOrTech && (
                      <button
                        onClick={() => startEdit(mac)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors"
                        title="Editar veículo"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    )}
                    {isAdminOrTech && (
                      <button
                        onClick={() => handleDelete(mac.id)}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                        title="Remover veículo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(role === 'tecnico' || role === 'TECNICO_CAMPO') && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex gap-3 text-xs text-emerald-800">
          <Info className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Como Técnico, você agora possui permissões completas de cadastro e manutenção da frota de veículos. Certifique-se de manter os dados de marcas e modelos atualizados para auxiliar nas auditorias logísticas.
          </p>
        </div>
      )}

    </div>
  );
}
