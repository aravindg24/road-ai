import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

const STORAGE_KEY = "road_ai_api_url";

const envApiUrl =
  ((import.meta as unknown) as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
  "http://localhost:8000";

function normalizeApiUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

const defaultApiUrl = normalizeApiUrl(envApiUrl);

interface ApiConfigContextType {
  apiUrl: string;
  defaultApiUrl: string;
  isCustomApiUrl: boolean;
  setApiUrl: (value: string) => void;
  resetApiUrl: () => void;
}

const ApiConfigContext = createContext<ApiConfigContextType | undefined>(undefined);

export function ApiConfigProvider({ children }: { children: ReactNode }) {
  const [apiUrl, setApiUrlState] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeApiUrl(stored) : defaultApiUrl;
  });

  const isCustomApiUrl = apiUrl !== defaultApiUrl;

  function setApiUrl(value: string) {
    const normalized = normalizeApiUrl(value);
    localStorage.setItem(STORAGE_KEY, normalized);
    setApiUrlState(normalized);
  }

  function resetApiUrl() {
    localStorage.removeItem(STORAGE_KEY);
    setApiUrlState(defaultApiUrl);
  }

  return (
    <ApiConfigContext.Provider
      value={{ apiUrl, defaultApiUrl, isCustomApiUrl, setApiUrl, resetApiUrl }}
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
