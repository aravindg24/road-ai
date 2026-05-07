import { Moon, Sun, Menu, Server, X, RotateCcw } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "../ui/button";
import { useTheme } from "../../contexts/ThemeContext";
import { useApiConfig } from "../../contexts/ApiConfigContext";

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { apiUrl, defaultApiUrl, isCustomApiUrl, setApiUrl, resetApiUrl } = useApiConfig();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [inputValue, setInputValue] = useState(apiUrl);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    if (popoverOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popoverOpen]);

  function handleConnect() {
    if (inputValue.trim()) {
      setApiUrl(inputValue.trim());
      setPopoverOpen(false);
    }
  }

  function handleReset() {
    resetApiUrl();
    setInputValue(defaultApiUrl);
    setPopoverOpen(false);
  }

  const displayUrl = apiUrl.replace(/^https?:\/\//, "").slice(0, 28) + (apiUrl.replace(/^https?:\/\//, "").length > 28 ? "…" : "");

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

        {/* Backend URL Control */}
        <div className="relative mr-2" ref={popoverRef}>
          <button
            onClick={() => setPopoverOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
              border-gray-200 dark:border-gray-600
              hover:bg-gray-100 dark:hover:bg-gray-700
              text-gray-600 dark:text-gray-300"
          >
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${isCustomApiUrl ? "bg-green-500" : "bg-gray-400"}`}
            />
            <Server className="h-3.5 w-3.5" />
            <span className="hidden sm:inline max-w-[160px] truncate">{displayUrl}</span>
          </button>

          {popoverOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] shadow-xl p-4 z-50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Backend URL</span>
                <button onClick={() => setPopoverOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Paste your Colab ngrok URL below. It's saved in your browser and persists on refresh.
              </p>

              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                placeholder="https://xxxx.ngrok-free.app"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600
                  bg-gray-50 dark:bg-[#2a2a2a] text-gray-800 dark:text-gray-200
                  focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              />

              <div className="flex gap-2">
                <button
                  onClick={handleConnect}
                  className="flex-1 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Connect
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium
                    border border-gray-200 dark:border-gray-600
                    text-gray-600 dark:text-gray-300
                    hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
              </div>

              {isCustomApiUrl && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  Connected to custom backend
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

