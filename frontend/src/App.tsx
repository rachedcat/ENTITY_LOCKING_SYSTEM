import React, { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { ActivityPage } from './components/ActivityPage';

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<'dashboard' | 'activity'>('dashboard');

    return (
        <React.Fragment>
            {currentView === 'dashboard' ? (
                <Dashboard currentView={currentView} onNavigate={setCurrentView} />
            ) : (
                <ActivityPage currentView={currentView} onNavigate={setCurrentView} />
            )}
        </React.Fragment>
    );
};

export default App;
