import React, { useState, useEffect } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserRole, UserProfile } from '../types';
import { hashPassword } from '../utils/crypto';
import { 
  Tractor,
  Satellite,
  Shield, 
  User, 
  Lock, 
  Mail, 
  UserCheck, 
  AlertTriangle, 
  Wrench, 
  ChevronRight, 
  Globe
} from 'lucide-react';

interface AuthScreenProps {
  onAuthSuccess: (user: UserProfile) => void;
  onEnterDemo: (role: UserRole, customName?: string, customEmail?: string) => void;
}

export default function AuthScreen({ onAuthSuccess, onEnterDemo }: AuthScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Auto-seed check on mount
  useEffect(() => {
    const runSeedCheck = async () => {
      try {
        const usersCol = collection(db, 'users');
        const usersSnap = await getDocs(usersCol);
        
        if (usersSnap.empty) {
          console.log("No users found in database. Initializing default admin user...");
          setLoading(true);
          
          const virtualEmail = 'admin@agrostockgps.com';
          const defaultPassword = 'adminpassword';
          
          // Try to create auth user
          const userCredential = await createUserWithEmailAndPassword(auth, virtualEmail, defaultPassword);
          const user = userCredential.user;
          const hashedPass = await hashPassword(defaultPassword);
          
          const userProfile: UserProfile = {
            uid: user.uid,
            email: virtualEmail,
            name: 'Administrador Temporário',
            firstName: 'Administrador',
            lastName: 'Temporário',
            username: 'admin',
            passwordEncrypted: hashedPass,
            role: 'ADMINISTRADOR',
            createdAt: new Date().toISOString()
          };
          
          await setDoc(doc(db, 'users', user.uid), userProfile);
          console.log("Default admin user initialized successfully in Auth and Firestore!");
          
          setSuccessMsg('O primeiro acesso de ADMINISTRADOR foi inicializado automaticamente! Usuário: "admin", Senha: "adminpassword". Você foi conectado automaticamente.');
          
          setTimeout(() => {
            onAuthSuccess(userProfile);
          }, 4500);
        }
      } catch (e: any) {
        console.warn("Auto-seed check complete or bypassed:", e.message || e);
      } finally {
        setLoading(false);
      }
    };
    
    runSeedCheck();
  }, []);

  const getEmailFromUsername = (userStr: string) => {
    const clean = userStr.trim().toLowerCase().replace(/\s+/g, '');
    return `${clean}@agrostockgps.com`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError(null);

    const virtualEmail = getEmailFromUsername(username);

    try {
      // Sign in user
      const userCredential = await signInWithEmailAndPassword(auth, virtualEmail, password);
      const user = userCredential.user;

      const isVirtualAdmin = user.email === 'admin@agrostockgps.com';
      const userProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || username.trim() || 'Usuário',
        role: isVirtualAdmin ? 'ADMINISTRADOR' : 'TECNICO_CAMPO', // Default fallback
        createdAt: new Date().toISOString()
      };

      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const storedRole = data.role as string;
          userProfile.role = (storedRole === 'administrador' ? 'ADMINISTRADOR' : (storedRole === 'tecnico' ? 'TECNICO_CAMPO' : storedRole)) as UserRole;
          userProfile.name = data.name || userProfile.name;
          userProfile.firstName = data.firstName;
          userProfile.lastName = data.lastName;
          userProfile.username = data.username;
          userProfile.passwordEncrypted = data.passwordEncrypted;
        } else {
          // If profile doesn't exist in firestore but they authenticated, we create a fallback
          await setDoc(docRef, {
            uid: user.uid,
            email: user.email,
            name: userProfile.name,
            role: isVirtualAdmin ? 'ADMINISTRADOR' : 'TECNICO_CAMPO',
            createdAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.warn('Could not read user profile from Firestore, using default.', err);
      }

      onAuthSuccess(userProfile);
    } catch (err: any) {
      console.error(err);
      let msg = 'Erro ao fazer login. Verifique suas credenciais.';
      if (err.code === 'auth/operation-not-allowed') {
        msg = 'O provedor de E-mail/Senha não está ativado no Console do seu Firebase. Por favor, acesse o Console do Firebase > Authentication > Sign-in method e ative o provedor de "E-mail/Senha" para utilizar o banco de dados real. Enquanto isso, você pode acessar clicando nos botões do Modo de Demonstração abaixo.';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        msg = 'Usuário ou senha incorretos.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Formato de usuário inválido.';
      } else if (err.code === 'auth/configuration-not-found') {
        msg = 'O provedor de E-mail/Senha não está habilitado no Console do Firebase.';
      }
      setError(`${msg} [Detalhes: ${err.code || 'sem_codigo'} - ${err.message || 'sem_mensagem'}]`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden" id="auth-container">
      {/* Visual background accents */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center items-center gap-3">
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl shadow-inner animate-pulse relative h-14 w-14 flex items-center justify-center">
            <Tractor className="h-7 w-7 text-emerald-400 mt-1" />
            <Satellite className="h-4 w-4 text-emerald-400 absolute top-1.5 right-1.5" />
          </div>
          <span translate="no" className="text-3xl font-extrabold text-white tracking-tight notranslate">
            Agro <span className="text-emerald-400">Stock</span> GPS
          </span>
        </div>
        <h2 className="mt-6 text-center text-sm font-semibold text-slate-400 tracking-wider uppercase">
          Controle de componentes de Piloto Automático e Licenças
        </h2>
        <p className="mt-2 text-center text-xs text-slate-500 max-w-xs mx-auto">
          Gerenciamento de licenças e hardware agrícola de alta precisão para usinas sucroenergéticas
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-800/80 backdrop-blur-md py-8 px-4 shadow-xl border border-slate-700 rounded-3xl sm:px-10">
          
          {/* Identificação de Acesso Header */}
          <div className="text-center mb-6">
            <h3 className="text-lg font-bold text-white">Identificação de Acesso</h3>
            <p className="text-xs text-slate-400 mt-1">Insira suas credenciais para acessar o painel</p>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-sm mb-4 flex items-start gap-2 animate-shake" id="error-message">
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-3 rounded-xl text-sm mb-4 flex items-start gap-2" id="success-message">
              <UserCheck className="h-5 w-5 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5" id="login-form">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Usuário (Nome de Usuário cadastrado)</label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 text-sm"
                  placeholder="Ex: endriussouza"
                  id="login-username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Senha</label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 text-sm"
                  placeholder="••••••••"
                  id="login-password"
                  required
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 transition-all disabled:opacity-50"
                id="login-submit-btn"
              >
                {loading ? 'Entrando...' : 'Acessar Sistema'}
              </button>
            </div>
          </form>

          {/* Setup Help Notification */}
          <div className="mt-6 p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex gap-2 text-xs text-blue-300" id="firebase-console-notice">
            <Globe className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
            <p>
              Caso receba erro de configuração, lembre-se de ativar o login por 
              <strong> E-mail/Senha</strong> no Console do Firebase da sua conta. Os usuários são criados usando e-mails virtuais baseados no nome de usuário.
            </p>
          </div>

          {/* Demo Fallback Area */}
          <div className="mt-6 pt-5 border-t border-slate-700">
            <p className="text-center text-xs text-slate-400 font-medium mb-3">
              Acesso Rápido para Teste (Sem Conta)
            </p>
            <div className="grid grid-cols-2 gap-3" id="demo-buttons-area">
              <button
                onClick={() => onEnterDemo('ADMINISTRADOR')}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900/50 hover:bg-slate-950 text-slate-300 hover:text-white border border-slate-700/60 rounded-xl text-xs font-semibold group transition-colors"
                id="enter-demo-admin"
              >
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                Demo Admin
                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <button
                onClick={() => onEnterDemo('TECNICO_CAMPO')}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900/50 hover:bg-slate-950 text-slate-300 hover:text-white border border-slate-700/60 rounded-xl text-xs font-semibold group transition-colors"
                id="enter-demo-tech"
              >
                <Wrench className="h-3.5 w-3.5 text-blue-400" />
                Demo Técnico
                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
