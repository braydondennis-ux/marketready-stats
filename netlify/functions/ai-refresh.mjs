export default async (req) => {
  const ANTHROPIC_API_KEY = Netlify.env.get('ANTHROPIC_API_KEY');

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const prompt = `You are a real estate market data expert specializing in Maricopa County, Arizona.
Today is ${today}. Generate realistic, current market estimates for each city below.
Base estimates on typical seasonal patterns, recent AZ market trends, and each city's market profile.

Return ONLY a valid JSON object — no markdown, no explanation, just the JSON.

For each city include:
- active: active listings count (number as string like "1,243")
- price: median sale price (like "$485,000")
- dom: avg days on market (number as string like "38")
- mos: months of supply (decimal as string like "2.8")
- mai: Market Action Index score 1-60 (number as string)
- mtype: "seller" (MAI>30), "balanced" (MAI=30), or "buyer" (MAI<30)
- mtrend: short trend note like "↑ +2 pts · Inventory tightening"
- mprice: median price for MAI card (same as price)
- mdom: days on market note like "~38 days"
- mactive: active listings for MAI card (same as active)
- myoy: year over year change like "+4.2% YoY"
- activeD: YoY change note like "↑ 5% YoY"
- priceD: price trend note like "↑ 3% YoY"
- domD: DOM context like "Faster than last month"
- mosD: supply context like "Slight seller advantage"

Cities to estimate for ${month}:
Maricopa County, Phoenix, Mesa, Scottsdale, Chandler, Gilbert, Glendale, Peoria, Tempe, Surprise, Goodyear, Avondale, Buckeye, Queen Creek, Fountain Hills, Paradise Valley, Cave Creek, Litchfield Park, Ahwatukee, El Mirage

Return format:
{
  "Maricopa County": { "active": "...", "price": "...", ... },
  "Phoenix": { ... },
  ...
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: 'Claude API error', detail: err }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Strip any markdown fences just in case
    const clean = text.replace(/```json|```/g, '').trim();
    const cities = JSON.parse(clean);

    return new Response(JSON.stringify({ ok: true, cities, updated: today }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = { path: '/api/ai-refresh' };
