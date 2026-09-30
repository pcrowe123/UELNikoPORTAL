// Things a person might reasonably want to change, kept as data rather than in the code (CI-01).

import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import { DEFAULT_SETTINGS, type AppSettings } from '../../backend/types';
import { useApp } from '../../state/AppContext';

export function SettingsTab() {
  const { backend, settings, reloadSettings } = useApp();
  const toast = useToast();

  const [draft, setDraft] = useState<AppSettings>(settings);
  const [busy, setBusy] = useState(false);

  // The context loads the settings after sign-in, which may land after this tab has mounted.
  useEffect(() => setDraft(settings), [settings]);

  async function save() {
    setBusy(true);
    try {
      await backend.saveSettings({ ...draft, welcome: draft.welcome.trim() });
      await reloadSettings();
      toast.good('Settings saved.');
    } catch (err) {
      toast.bad((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <div className="field">
        <label htmlFor="welcome">The line under the heading on the landing page</label>
        <textarea
          id="welcome"
          value={draft.welcome}
          onChange={(e) => setDraft({ ...draft, welcome: e.target.value })}
        />
        <p className="tiny muted" style={{ marginTop: 4 }}>
          Left empty it falls back to: “{DEFAULT_SETTINGS.welcome}”
        </p>
      </div>

      <div className="field">
        <label htmlFor="site-name">Site name</label>
        <input
          id="site-name"
          type="text"
          value={draft.siteName}
          onChange={(e) => setDraft({ ...draft, siteName: e.target.value })}
        />
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={draft.openInNewTab}
          onChange={(e) => setDraft({ ...draft, openInNewTab: e.target.checked })}
        />
        Open an application in a new tab
      </label>
      <p className="tiny muted" style={{ marginTop: -4, marginBottom: 12 }}>
        On means the portal stays open behind the application, which is what most people want from a
        launcher. Off means the portal is replaced by it.
      </p>

      <label className="check">
        <input
          type="checkbox"
          checked={draft.showSearch}
          onChange={(e) => setDraft({ ...draft, showSearch: e.target.checked })}
        />
        Show a search box once there are more than four applications
      </label>

      <div className="toolbar" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
        <button type="button" className="btn" onClick={() => setDraft(settings)} disabled={busy}>
          Undo my changes
        </button>
      </div>
    </div>
  );
}
