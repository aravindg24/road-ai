import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

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
  const apiUrl = useMemo(() => normalizeApiUrl(envApiUrl), []);

  return (
    <ApiConfigContext.Provider
      value={{
        apiUrl,
        defaultApiUrl: apiUrl,
        isCustomApiUrl: false,
        setApiUrl: () => {},
        resetApiUrl: () => {},
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
