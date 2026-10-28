export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No URL provided' });
  
  try {
    const fetchRes = await fetch(url);
    const data = await fetchRes.text();
    
    // Send it back to your app with permissive CORS headers
    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
}
