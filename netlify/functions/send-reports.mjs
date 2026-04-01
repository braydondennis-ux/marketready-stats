import { getStore } from '@netlify/blobs';

// Runs every day at 8am UTC (3am MST / 4am MDT)
export const config = {
  schedule: '0 8 * * *',
};

export default async (req) => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon
  const dayOfMonth = today.getDate();
  const month = today.getMonth();

  try {
    const store = getStore('campaigns');
    const { blobs } = await store.list({ prefix: 'campaign-' });

    let sent = 0, skipped = 0;

    for (const blob of blobs) {
      const campaign = await store.get(blob.key, { type: 'json' }).catch(() => null);
      if (!campaign || !campaign.active) { skipped++; continue; }

      const cadence = campaign.cadence || 'weekly';
      const shouldSendToday = checkCadence(cadence, dayOfWeek, dayOfMonth, month, campaign);
      if (!shouldSendToday) { skipped++; continue; }

      // Send emails via EmailJS REST API
      const results = await sendCampaignEmails(campaign, today);
      sent += results.sent;

      // Update lastSent
      await store.setJSON(blob.key, {
        ...campaign,
        lastSent: today.toISOString(),
      });

      console.log(`Campaign ${blob.key}: sent ${results.sent}, failed ${results.failed}`);
    }

    console.log(`Daily send complete: ${sent} sent, ${skipped} skipped/inactive`);
  } catch (e) {
    console.error('Scheduled send error:', e);
  }
};

function checkCadence(cadence, dayOfWeek, dayOfMonth, month, campaign) {
  const lastSent = campaign.lastSent ? new Date(campaign.lastSent) : null;
  const today = new Date();

  if (cadence === 'weekly') {
    // Send on Mondays
    return dayOfWeek === 1;
  }

  if (cadence === 'biweekly') {
    if (!lastSent) return true;
    const daysSince = Math.floor((today - lastSent) / (1000 * 60 * 60 * 24));
    return daysSince >= 14;
  }

  if (cadence === 'monthly') {
    // Send on 1st of each month
    return dayOfMonth === 1;
  }

  if (cadence === 'bimonthly') {
    // Send on 1st of every other month
    return dayOfMonth === 1 && month % 2 === 0;
  }

  return false;
}

async function sendCampaignEmails(campaign, today) {
  const { contacts = [], profile = {}, ejsCfg = {}, template = {}, city = 'Arizona' } = campaign;
  const mo = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const fromName = `${profile.first || ''} ${profile.last || ''}`.trim() || 'Your Agent';

  // Build subject with token replacement
  const subject = (template.subject || `${city} Market Update — ${mo}`)
    .replace('{{city}}', city)
    .replace('{{month}}', mo);

  let sent = 0, failed = 0;

  for (const contact of contacts) {
    const firstName = (contact.name || '').split(' ')[0] || 'there';

    // EmailJS REST API
    const payload = {
      service_id: ejsCfg.svc,
      template_id: ejsCfg.tmpl,
      user_id: ejsCfg.pub,
      template_params: {
        to_name: contact.name,
        to_email: contact.email,
        from_name: fromName,
        city,
        month: mo,
        subject,
        intro: (template.intro || '')
          .replace('{{first_name}}', firstName)
          .replace('{{city}}', city)
          .replace('{{month}}', mo),
        signoff: template.signoff || 'Always here to help!',
        company: profile.company || '',
        phone: profile.phone || '',
        title: profile.title || '',
      },
    };

    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'origin': 'http://localhost' },
        body: JSON.stringify(payload),
      });
      if (res.ok) { sent++; } else { failed++; }
    } catch (e) {
      failed++;
    }

    // Throttle — 300ms between sends
    await new Promise(r => setTimeout(r, 300));
  }

  return { sent, failed };
}
