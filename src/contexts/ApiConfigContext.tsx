import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

const API_URL_STORAGE_KEY = "road-ai-api-url";

const envApiUrl =
  ((import.meta as unknown) as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
  "http://localhost:8000";

function normalizeApiUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

interface ApiConfigContextType {
  apiUrl: string;
  defaultApiUrl: string;
  isCustomApiUrl: boolean;
  setApiUrl: (value: string) => void;
  resetApiUrl: () => void;
}

const ApiConfigContext = createContext<ApiConfigContextType | undefined>(undefined);

export function ApiConfigProvider({ children }: { children: ReactNode }) {
  const defaultApiUrl = useMemo(() => normalizeApiUrl(envApiUrl), []);
  const [apiUrl, setApiUrlState] = useState(() => {
    const savedApiUrl = localStorage.getItem(API_URL_STORAGE_KEY);
    return normalizeApiUrl(savedApiUrl || defaultApiUrl);
  });

  useEffect(() => {
    localStorage.setItem(API_URL_STORAGE_KEY, apiUrl);
  }, [apiUrl]);

  const setApiUrl = (value: string) => {
    const normalized = normalizeApiUrl(value);
    setApiUrlState(normalized || defaultApiUrl);
  };

  const resetApiUrl = () => {
    localStorage.removeItem(API_URL_STORAGE_KEY);
    setApiUrlState(defaultApiUrl);
  };

  return (
    <ApiConfigContext.Provider
      value={{
        apiUrl,
        defaultApiUrl,
        isCustomApiUrl: apiUrl !== defaultApiUrl,
        setApiUrl,
        resetApiUrl,
      }}
    >
      {children}
    </ApiConfigContext.Provider>
  );
}

export function useApiConfig() {
  const context = useContext(ApiConfigContext);
  if (!context) {
    throw new Error("useApiConfig must be used within an ApiConfigProvider");
  }
  return context;
}
