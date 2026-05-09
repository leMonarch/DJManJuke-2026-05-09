import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { SongManager } from './admin/SongManager';
import { InvestmentManager } from './admin/InvestmentManager';
import { RevenueDashboard } from './admin/RevenueDashboard';
import { StatsDashboard } from './admin/StatsDashboard';
import { ProfileTab } from './admin/ProfileTab';

type Plan = 'free' | 'pro';

type AdminTabsProps = {
  plan: Plan;
  slug: string;
};

type TabConfig = {
  id: 'profile' | 'songs' | 'investment' | 'revenue' | 'stats';
  label: string;
  requiresPlan?: Plan;
};

export const AdminTabs = ({ plan, slug }: AdminTabsProps) => {
  const { t } = useLanguage();
  
  const TABS: TabConfig[] = useMemo(() => [
    { id: 'profile', label: t('admin.profile') },
    { id: 'songs', label: t('admin.songs') },
    { id: 'investment', label: t('admin.investment'), requiresPlan: 'pro' },
    { id: 'revenue', label: t('admin.revenue') },
    { id: 'stats', label: t('admin.stats') },
  ], [t]);
  const accessibleTabs = useMemo(
    () => TABS.filter((tab) => !tab.requiresPlan || tab.requiresPlan === plan),
    [plan],
  );

  const [activeTab, setActiveTab] = useState<string>(() => {
    // Pour les comptes Pro, on ouvre directement l’onglet Revenus afin de mettre en avant
    // l’activation Stripe. Pour les comptes Free, on reste sur le premier onglet accessible.
    if (plan === 'pro' && accessibleTabs.some((tab) => tab.id === 'revenue')) {
      return 'revenue';
    }
    return (accessibleTabs[0] ?? TABS[0]).id;
  });

  useEffect(() => {
    if (!accessibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab((accessibleTabs[0] ?? TABS[0]).id);
    }
  }, [accessibleTabs, activeTab]);

  const renderContent = () => {
    const currentTab = TABS.find((tab) => tab.id === activeTab);
    if (!currentTab) return null;

    if (currentTab.requiresPlan && currentTab.requiresPlan !== plan) {
      return (
        <div className="rounded-lg border border-dashed border-white/20 p-4 sm:p-6 text-sm text-white/70">
          {t('admin.proSection')}
        </div>
      );
    }

    switch (currentTab.id) {
      case 'profile':
        return <ProfileTab onSelectRevenueTab={() => setActiveTab('revenue')} />;
      case 'songs':
        return <SongManager slug={slug} />;
      case 'investment':
        return <InvestmentManager slug={slug} />;
      case 'revenue':
        return <RevenueDashboard />;
      case 'stats':
        return <StatsDashboard />;
      default:
        return null;
    }
  };

  return (
    <section className="space-y-4 sm:space-y-6 rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      {/* Onglets - Scroll horizontal sur mobile, flex-wrap sur desktop */}
      <div className="flex gap-2 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-x-visible sm:pb-0 scrollbar-hide">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const isRestricted = tab.requiresPlan && tab.requiresPlan !== plan;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[44px] flex-shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap ${
                isActive ? 'bg-primary text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
              } ${isRestricted ? 'opacity-50' : ''}`}
            >
              {tab.label}
              {isRestricted ? ` ${t('admin.proRequired')}` : ''}
            </button>
          );
        })}
      </div>
      {renderContent()}
    </section>
  );
};


