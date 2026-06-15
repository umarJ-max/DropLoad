// api/download.js

const UNIVERSAL_API   = 'https://ahm7xmakki.com/api/alldl';
const PINTEREST_PROXY = 'https://pintrest-proxy.vercel.app/api/pinterest';

function detectPlatform(url) {
  if (/pinterest\.com|pin\.it/.test(url))  return 'pinterest';
  if (/facebook\.com|fb\.watch|fb\.com/.test(url)) return 'facebook';
  if (/youtube\.com|youtu\.be/.test(url))  return 'youtube';
  if (/tiktok\.com/.test(url))             return 'tiktok';
  if (/instagram\.com/.test(url))          return 'instagram';
  if (/twitter\.com|x\.com/.test(url))     return 'twitter';
  if (/reddit\.com|redd\.it/.test(url))    return 'reddit';
  if (/snapchat\.com/.test(url))           return 'snapchat';
  return null;
}

function sortQualities(qualities) {
  return [...qualities].sort((a, b) => {
    const res = q => { const m = String(q.label||'').match(/(\d+)/); return m ? +m[1] : 0; };
    return res(b) - res(a);
  });
}

async function fetchPinterest(url) {
  const res  = await fetch(`${PINTEREST_PROXY}?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Pinterest proxy error ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Pinterest extraction failed');

  const m = data.mediaInfo || {};
  const isVideo = !!m.videoUrl;

  let qualities = [];
  if (m.qualities?.length) {
    qualities = sortQualities(m.qualities.map(q => ({ label: q.quality || q.label || 'Video', url: q.url })).filter(q => q.url));
  } else if (isVideo) {
    qualities = [{ label: 'Video', url: m.videoUrl }];
  } else {
    qualities = [{ label: 'Image', url: m.videoUrl || m.imageUrl }];
  }

  return {
    success: true, platform: 'Pinterest',
    title: m.title || 'Pinterest Media',
    thumbnail: m.thumbnail || null,
    videoUrl: qualities[0]?.url || null,
    audioUrl: null, qualities,
  };
}

async function fetchFacebook(url, req) {
  // Call our own /api/facebook endpoint
  const host     = req.headers.host || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const res      = await fetch(`${protocol}://${host}/api/facebook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Facebook extraction failed');
  return data;
}

async function fetchYouTube(url, req) {
  const host     = req.headers.host || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const res      = await fetch(`${protocol}://${host}/api/youtube`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'YouTube extraction failed');
  return data;
}

async function fetchUniversal(url, platform) {
  const res  = await fetch(`${UNIVERSAL_API}?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`API error ${res.status} — this platform may not be supported`);
  const data = await res.json();
  if (!data.success || !data.mediaInfo) throw new Error(data.error || 'Could not extract media');

  const m = data.mediaInfo;
  let qualities = [];
  if (m.qualities?.length) {
    qualities = sortQualities(m.qualities.map(q => ({ label: q.quality || q.label, url: q.url || q.videoUrl })).filter(q => q.url));
  } else if (m.videoUrl) {
    qualities = [{ label: 'Video', url: m.videoUrl }];
  }

  return {
    success: true,
    platform: m.platform || platform,
    title: m.title || 'Untitled',
    thumbnail: m.thumbnail || null,
    videoUrl: qualities[0]?.url || m.videoUrl || null,
    audioUrl: m.audioUrl || null,
    qualities,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let url;
  try {
    url = req.body?.url?.trim();
    if (!url) throw new Error();
    new URL(url);
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid URL' });
  }

  const platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({ success: false, error: 'Unsupported platform. Supported: YouTube, TikTok, Pinterest, Instagram, Facebook, Twitter/X, Reddit, Snapchat.' });
  }

  try {
    let result;
    if (platform === 'pinterest') result = await fetchPinterest(url);
    else if (platform === 'facebook') result = await fetchFacebook(url, req);
    else if (platform === 'youtube') result = await fetchYouTube(url, req);
    else result = await fetchUniversal(url, platform);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[download]', platform, err.message);
    return res.status(502).json({ success: false, error: err.message || 'Failed to fetch media.' });
  }
};
