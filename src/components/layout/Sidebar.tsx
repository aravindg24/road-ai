import { Search, Trash2, Plus, Replace as ReplaceIcon, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { id: "search", label: "Search", icon: Search },
  { id: "remove", label: "Remove", icon: Trash2 },
  { id: "add", label: "Add", icon: Plus },
  { id: "replace", label: "Replace", icon: ReplaceIcon },
];

export default function Sidebar({ activeTab, onTabChange, isOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-16 z-50 h-[calc(100vh-4rem)] w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-[#292929] transition-transform duration-300 ease-in-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Mobile Close Button */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 lg:hidden">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Navigation
            </span>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 overflow-y-auto">
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onTabChange(item.id);
                      if (window.innerWidth < 1024) {
                        onClose();
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
}

