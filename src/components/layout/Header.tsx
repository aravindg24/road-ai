import { Moon, Sun, Menu } from "lucide-react";
import { Button } from "../ui/button";
import { useTheme } from "../../contexts/ThemeContext";

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

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

