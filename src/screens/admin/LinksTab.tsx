// The tile list. Adding an application to the portal is a settings change, not a release (CI-01).

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ACCESS_DESCRIPTIONS, ACCESS_LABELS, type AccessMode } from '../../engine/access';
import { useToast } from '../../components/Toast';
import {
  describeLinkProblem,
  hostOf,
  normaliseUrl,
  slugify,
  visibleLinks,
} from '../../engine/links';
import type { NewPortalLink, PortalLink } from '../../backend/types';
import { useApp } from '../../state/AppContext';

const BLANK: NewPortalLink = {
  slug: '',
  name: '',
  tagline: '',
  url: '',
  colour: '#0f4c81',
  accessMode: 'everyone',
  sortOrder: 99,
  isActive: true,
};

export function LinksTab() {
  const { backend } = useApp();
  const toast = useToast();

  const [links, setLinks] = useState<PortalLink[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: NewPortalLink } | null>(null);
  // Removing goes through the app's own dialog rather than window.confirm: a native dialog stops
  // the whole page, which the headless browser in `npm run e2e` cannot get past.
  const [removing, setRemoving] = useState<PortalLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLinks(await backend.listLinks(true));
    } catch (err) {
      toast.bad((err as Error).message);
    }
  }, [backend, toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startAdd() {
    const next = (links?.reduce((max, l) => Math.max(max, l.sortOrder), 0) ?? 0) + 1;
    setProblem(null);
    setEditing({ id: null, draft: { ...BLANK, sortOrder: next } });
  }

  function startEdit(link: PortalLink) {
    setProblem(null);
    setEditing({
      id: link.id,
      draft: {
        slug: link.slug,
        name: link.name,
        tagline: link.tagline,
        url: link.url,
        colour: link.colour,
        sortOrder: link.sortOrder,
        accessMode: link.accessMode,
        isActive: link.isActive,
      },
    });
  }

  async function save() {
    if (!editing) return;
    // The URL is tidied before it is checked, so "uelnikoiq.com" becomes https://uelnikoiq.com
    // rather than being refused as not an address.
    const draft: NewPortalLink = {
      ...editing.draft,
      name: editing.draft.name.trim(),
      tagline: editing.draft.tagline.trim(),
      url: normaliseUrl(editing.draft.url),
      slug: editing.draft.slug.trim() || slugify(editing.draft.name),
    };
    const wrong = describeLinkProblem(draft);
    if (wrong) {
      setProblem(wrong);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      if (editing.id) {
        await backend.updateLink(editing.id, draft);
        toast.good(`${draft.name} saved.`);
      } else {
        await backend.createLink(draft);
        toast.good(`${draft.name} added.`);
      }
      setEditing(null);
      await reload();
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(link: PortalLink) {
    try {
      await backend.updateLink(link.id, { isActive: !link.isActive });
      await reload();
      toast.say(link.isActive ? `${link.name} hidden.` : `${link.name} is on the portal.`);
    } catch (err) {
      toast.bad((err as Error).message);
    }
  }

  async function remove(link: PortalLink) {
    setRemoving(null);
    try {
      const { deleted } = await backend.removeLink(link.id);
      await reload();
      toast.say(
        deleted
          ? `${link.name} deleted.`
          : `${link.name} retired. It stays in the records because people have opened it.`,
      );
    } catch (err) {
      toast.bad((err as Error).message);
    }
  }

  const rows = visibleLinks(links ?? [], { includeHidden: true });

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-primary" onClick={startAdd}>
          Add an application
        </button>
        <span className="spacer" />
        <span className="muted small">
          {rows.filter((l) => l.isActive).length} on the portal, {rows.length} in all
        </span>
      </div>

      {links === null ? <p className="muted">Loading…</p> : null}

      {links !== null && rows.length === 0 ? (
        <div className="empty">No applications yet. Add the first one.</div>
      ) : null}

      {rows.length > 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="num">Order</th>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Short name</th>
                  <th>Who</th>
                  <th>On the portal</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((link) => (
                  <tr key={link.id}>
                    <td className="num">{link.sortOrder}</td>
                    <td>
                      <span className="swatch" style={{ background: link.colour }} />
                      <b>{link.name}</b>
                      <div className="tiny muted">{link.tagline}</div>
                    </td>
                    <td className="small">{hostOf(link.url) || <span className="bad">unusable</span>}</td>
                    <td className="small mono">{link.slug}</td>
                    <td>
                      <span className={link.accessMode === 'invite' ? 'pill pill-warn' : 'pill'}>
                        {link.accessMode === 'invite' ? '🔒 By invitation' : 'Everyone'}
                      </span>
                    </td>
                    <td>
                      <span className={link.isActive ? 'pill pill-ok' : 'pill'}>
                        {link.isActive ? 'Shown' : 'Hidden'}
                      </span>
                    </td>
                    <td className="right nowrap">
                      <button type="button" className="btn btn-small" onClick={() => startEdit(link)}>
                        Edit
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => void toggleActive(link)}
                      >
                        {link.isActive ? 'Hide' : 'Show'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        onClick={() => setRemoving(link)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {editing ? (
        <Modal
          title={editing.id ? 'Edit application' : 'Add application'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </>
          }
        >
          {problem ? <div className="banner banner-error">{problem}</div> : null}

          <div className="field">
            <label htmlFor="link-name">Name</label>
            <input
              id="link-name"
              type="text"
              value={editing.draft.name}
              onChange={(e) =>
                setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })
              }
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="link-tagline">One line about it</label>
            <input
              id="link-tagline"
              type="text"
              value={editing.draft.tagline}
              onChange={(e) =>
                setEditing({ ...editing, draft: { ...editing.draft, tagline: e.target.value } })
              }
            />
          </div>

          <div className="field">
            <label htmlFor="link-url">Web address</label>
            <input
              id="link-url"
              type="text"
              inputMode="url"
              placeholder="uelnikobooking.com"
              value={editing.draft.url}
              onChange={(e) =>
                setEditing({ ...editing, draft: { ...editing.draft, url: e.target.value } })
              }
            />
            <p className="tiny muted" style={{ marginTop: 4 }}>
              https:// is added if you leave it off. Only https addresses are accepted.
            </p>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="link-slug">Short name</label>
              <input
                id="link-slug"
                type="text"
                placeholder={slugify(editing.draft.name) || 'booking'}
                value={editing.draft.slug}
                onChange={(e) =>
                  setEditing({ ...editing, draft: { ...editing.draft, slug: e.target.value } })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="link-order">Order</label>
              <input
                id="link-order"
                type="number"
                min={1}
                value={editing.draft.sortOrder}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    draft: { ...editing.draft, sortOrder: Number(e.target.value) || 1 },
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="link-colour">Colour</label>
              <input
                id="link-colour"
                type="color"
                value={editing.draft.colour}
                onChange={(e) =>
                  setEditing({ ...editing, draft: { ...editing.draft, colour: e.target.value } })
                }
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="link-access">Who may open it</label>
            <select
              id="link-access"
              value={editing.draft.accessMode}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  draft: { ...editing.draft, accessMode: e.target.value as AccessMode },
                })
              }
            >
              {(['everyone', 'invite'] as AccessMode[]).map((m) => (
                <option key={m} value={m}>
                  {ACCESS_LABELS[m]}
                </option>
              ))}
            </select>
            <p className="tiny muted" style={{ marginTop: 4 }}>
              {ACCESS_DESCRIPTIONS[editing.draft.accessMode]}
            </p>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={editing.draft.isActive}
              onChange={(e) =>
                setEditing({ ...editing, draft: { ...editing.draft, isActive: e.target.checked } })
              }
            />
            Show it on the portal
          </label>
        </Modal>
      ) : null}

      {removing ? (
        <Modal
          title={`Remove ${removing.name}?`}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void remove(removing)}
              >
                Remove it
              </button>
              <button type="button" className="btn" onClick={() => setRemoving(null)}>
                Keep it
              </button>
            </>
          }
        >
          <p>
            It comes off the landing page straight away. If anyone has ever opened it, the tile is
            retired rather than deleted, so the activity log still makes sense (D6).
          </p>
          <p className="muted small" style={{ marginBottom: 0 }}>
            This changes nothing about {removing.name} itself — only whether the portal offers it.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
