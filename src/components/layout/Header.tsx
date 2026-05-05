import { Moon, Sun, Menu, RotateCcw, ServerCog, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useTheme } from "../../contexts/ThemeContext";
import { useApiConfig } from "../../contexts/ApiConfigContext";
import { getApiHostLabel } from "../../lib/api";

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { apiUrl, defaultApiUrl, isCustomApiUrl, resetApiUrl, setApiUrl } = useApiConfig();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [draftApiUrl, setDraftApiUrl] = useState(apiUrl);

  useEffect(() => {
    setDraftApiUrl(apiUrl);
  }, [apiUrl]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#292929] shadow-sm">
      <div className="flex h-16 items-center px-4 lg:px-6">
        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden mr-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Logo */}
        <div className="flex items-center gap-3 mr-6">
          <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 rounded-lg shadow-md">
            <div className="w-5 h-5 border-2 border-white rounded"></div>
          </div>
          <div>
            <span className="text-xl font-normal text-gray-700 dark:text-gray-200 tracking-tight">
              AutoVision
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-0.5">Framework</p>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        <div className="relative mr-2">
          <button
            type="button"
            onClick={() => setIsSettingsOpen((current) => !current)}
            className="rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Backend: {getApiHostLabel(apiUrl)}
          </button>

          {isSettingsOpen && (
            <div className="absolute right-0 top-14 w-[22rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-[#292929]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Backend Endpoint</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Switch between Colab and Hugging Face Spaces without rebuilding the frontend.
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setIsSettingsOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300" htmlFor="backend-url">
                  API Base URL
                </label>
                <Input
                  id="backend-url"
                  value={draftApiUrl}
                  onChange={(event) => setDraftApiUrl(event.target.value)}
                  placeholder="https://your-space.hf.space"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">Default: {defaultApiUrl}</p>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => {
                    setApiUrl(draftApiUrl);
                    setIsSettingsOpen(false);
                  }}
                >
                  <ServerCog className="mr-2 h-4 w-4" />
                  Save
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    resetApiUrl();
                    setDraftApiUrl(defaultApiUrl);
                    setIsSettingsOpen(false);
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset
                </Button>
              </div>

              {isCustomApiUrl && (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                  Custom backend is active. Make sure this URL includes `https://` and is currently live.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          {theme === "light" ? (
            <Moon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          ) : (
            <Sun className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </div>
    </header>
  );
}

