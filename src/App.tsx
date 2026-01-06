import { useState } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import Search from "./components/tabs/Search";
import Remove from "./components/tabs/Remove";
import Add from "./components/tabs/Add";
import Replace from "./components/tabs/Replace";
import { Search as SearchIcon, Trash2, Plus, Replace as ReplaceIcon } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState("search");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1f1f1f]">
        {/* Header */}
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        <div className="flex">
          {/* Sidebar */}
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          {/* Main Content */}
          <main className="flex-1 lg:ml-64">
            <div className="container mx-auto px-4 py-6 lg:px-8 max-w-7xl">
              {/* Google Drive Style Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="border-b border-gray-200 dark:border-gray-700 mb-8 -mx-4 lg:-mx-8 px-4 lg:px-8 overflow-x-auto hide-scrollbar bg-white dark:bg-[#292929]">
                  <TabsList className="w-full justify-start h-auto p-0 bg-transparent min-w-max lg:min-w-0">
                    <TabsTrigger value="search" className="px-5 sm:px-6 py-3.5 data-[state=active]:bg-transparent whitespace-nowrap text-sm font-medium">
                      <SearchIcon className="mr-2 h-4 w-4" />
                      <span>Search</span>
                    </TabsTrigger>
                    <TabsTrigger value="remove" className="px-5 sm:px-6 py-3.5 data-[state=active]:bg-transparent whitespace-nowrap text-sm font-medium">
                      <Trash2 className="mr-2 h-4 w-4" />
                      <span>Remove</span>
                    </TabsTrigger>
                    <TabsTrigger value="add" className="px-5 sm:px-6 py-3.5 data-[state=active]:bg-transparent whitespace-nowrap text-sm font-medium">
                      <Plus className="mr-2 h-4 w-4" />
                      <span>Add</span>
                    </TabsTrigger>
                    <TabsTrigger value="replace" className="px-5 sm:px-6 py-3.5 data-[state=active]:bg-transparent whitespace-nowrap text-sm font-medium">
                      <ReplaceIcon className="mr-2 h-4 w-4" />
                      <span>Replace</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Tab Content */}
                <TabsContent value="search" className="mt-0">
                  <Search />
                </TabsContent>

                <TabsContent value="remove" className="mt-0">
                  <Remove />
                </TabsContent>

                <TabsContent value="add" className="mt-0">
                  <Add />
                </TabsContent>

                <TabsContent value="replace" className="mt-0">
                  <Replace />
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}
