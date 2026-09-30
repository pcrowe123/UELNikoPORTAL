// Administration: the tile list, the people, the settings and the activity log.
//
// Reaching this screen at all is guarded in App.tsx, and that guard is cosmetic. Row Level
// Security is what actually refuses a member who types /admin into the address bar
// (CLAUDE.md rule 5).

import { useState } from 'react';
import { ActivityTab } from './admin/ActivityTab';
import { LinksTab } from './admin/LinksTab';
import { PeopleTab } from './admin/PeopleTab';
import { SettingsTab } from './admin/SettingsTab';

type Tab = 'links' | 'people' | 'settings' | 'activity';

const TABS: { id: Tab; label: string }[] = [
  { id: 'links', label: 'Applications' },
  { id: 'people', label: 'People' },
  { id: 'settings', label: 'Settings' },
  { id: 'activity', label: 'Activity' },
];

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>('links');

  return (
    <div>
      <div className="screen-head">
        <h1>Admin</h1>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'links' ? <LinksTab /> : null}
      {tab === 'people' ? <PeopleTab /> : null}
      {tab === 'settings' ? <SettingsTab /> : null}
      {tab === 'activity' ? <ActivityTab /> : null}
    </div>
  );
}
