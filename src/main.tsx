import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Desativar e remover Service Workers anteriores para evitar cache agressivo de arquivos desatualizados
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then((success) => {
        if (success) {
          console.log('ServiceWorker desregistrado com sucesso para evitar cache.');
        }
      });
    }
  }).catch((error) => {
    console.error('Erro ao remover ServiceWorker:', error);
  });
}

