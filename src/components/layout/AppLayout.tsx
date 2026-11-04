import React, { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar, NavigationTab } from './Sidebar';

interface AppLayoutProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onAddNewMember?: () => void;
  children: ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ currentTab, onSelectTab, onAddNewMember, children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800">
      <Header onNavigateTab={onSelectTab} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentTab={currentTab} onSelectTab={onSelectTab} onAddNewMember={onAddNewMember} />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
