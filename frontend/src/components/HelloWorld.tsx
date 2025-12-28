import { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function HelloWorld() {
  const [backendStatus, setBackendStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [usersCount, setUsersCount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // Testa a conexão com o backend
    const testBackend = async () => {
      try {
        const users = await api.getUsers();
        setUsersCount(users.length);
        setBackendStatus('success');
      } catch (error) {
        setBackendStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Erro desconhecido');
      }
    };

    testBackend();
  }, []);

  return (
    <div className="text-center py-12">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        Olá Mundo! 👋
      </h1>
      <p className="text-xl text-gray-600 mb-8">
        Family App está funcionando!
      </p>
      
      <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto space-y-4">
        <div>
          <p className="text-gray-700 font-semibold">
            ✅ Frontend: React + TypeScript + Tailwind CSS
          </p>
          <p className="text-sm text-green-600 mt-1">Funcionando!</p>
        </div>
        
        <div className="border-t pt-4">
          <p className="text-gray-700 font-semibold">
            Backend: Node.js + Express + SQLite
          </p>
          {backendStatus === 'loading' && (
            <p className="text-sm text-yellow-600 mt-1">Testando conexão...</p>
          )}
          {backendStatus === 'success' && (
            <p className="text-sm text-green-600 mt-1">
              ✅ Funcionando! ({usersCount} usuários encontrados)
            </p>
          )}
          {backendStatus === 'error' && (
            <div className="text-sm text-red-600 mt-1">
              <p>❌ Erro ao conectar</p>
              <p className="text-xs mt-1">{errorMessage}</p>
              <p className="text-xs mt-2 text-gray-500">
                Certifique-se de que o backend está rodando na porta 3001
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

