import { getStore } from '@netlify/blobs';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { active, campaign, userId } = await req.json();
    const store = getStore('campaigns');
    const key = 'campaign-' + (userId || 'default').replace(/[^a-z0-9]/gi, '-');

    if (!active) {
      // Pause — update active flag only
      const existing = await store.get(key, { type: 'json' }).catch(() => null);
      if (existing) {
        await store.setJSON(key, { ...existing, active: false, pausedAt: new Date().toISOString() });
      }
    } else {
      await store.setJSON(key, {
        ...campaign,
        active: true,
        savedAt: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/save-campaign' };
