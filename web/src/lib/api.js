import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* resposta sem JSON */
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('esteira:unauthorized'));
    throw new ApiError(data?.error?.message || `Erro ${res.status}`, res.status, data?.error?.code);
  }
  return data;
}

/** Busca dados de `path`. `refresh()` refaz a consulta ignorando o cache do servidor. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path), path });
  const [nonce, setNonce] = useState(0);
  const freshRef = useRef(false);

  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    const fresh = freshRef.current;
    freshRef.current = false;
    // Mantém os dados anteriores só quando é a mesma rota (troca de período ou atualização).
    setState((s) => ({
      data: s.path?.split('?')[0] === path.split('?')[0] ? s.data : null,
      error: null,
      loading: true,
      path,
    }));
    const url = fresh ? `${path}${path.includes('?') ? '&' : '?'}fresh=1` : path;
    api(url).then(
      (data) => !cancelled && setState({ data, error: null, loading: false, path }),
      (error) => !cancelled && setState((s) => ({ ...s, error, loading: false })),
    );
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const refresh = useCallback(() => {
    freshRef.current = true;
    setNonce((n) => n + 1);
  }, []);

  return { ...state, refresh };
}
