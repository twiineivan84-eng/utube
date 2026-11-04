import React, { useMemo, useState } from 'react';
import { Bell, ChevronDown, Download, Menu, Play, Search, User, X } from 'lucide-react';
import './youtube-premium-mock.css';

const DEMO_VIDEOS = [
  { id: 1, title: 'Designing a Faster Web Interface', channel: 'Demo Creative Lab', views: '1.2M views', age: '2 weeks ago', duration: '12:48', accent: '#2dd4bf' },
  { id: 2, title: 'A Quiet Journey Through the Mountains', channel: 'Open Landscape', views: '842K views', age: '1 month ago', duration: '8:21', accent: '#38bdf8' },
  { id: 3, title: 'Build Better Habits in 30 Days', channel: 'Everyday Skills', views: '329K views', age: '5 days ago', duration: '18:04', accent: '#f97316' },
  { id: 4, title: 'Modern JavaScript Explained Visually', channel: 'Code Canvas', views: '2.4M views', age: '3 months ago', duration: '24:16', accent: '#a78bfa' },
  { id: 5, title: 'The Science of Productive Focus', channel: 'Mindful Learning', views: '615K views', age: '6 days ago', duration: '14:32', accent: '#fb7185' },
  { id: 6, title: 'Weekend in Tokyo — Travel Documentary', channel: 'Wander Demo', views: '905K views', age: '2 months ago', duration: '21:09', accent: '#facc15' },
];

function Thumbnail({ video }: { video: (typeof DEMO_VIDEOS)[number] }) {
  return (
    <div className="ytm-thumb" style={{ background: `linear-gradient(135deg, ${video.accent}, #111827)` }}>
      <div className="ytm-thumb-grid" />
      <div className="ytm-play"><Play fill="currentColor" /></div>
      <span className="ytm-duration">{video.duration}</span>
    </div>
  );
}

export function YouTubePremiumMock() {
  const [query, setQuery] = useState('');
  const [selectedResolution, setSelectedResolution] = useState('1080p');
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState<number[]>([]);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const videos = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? DEMO_VIDEOS.filter((video) => `${video.title} ${video.channel}`.toLowerCase().includes(needle)) : DEMO_VIDEOS;
  }, [query]);

  const downloadDemo = (video: (typeof DEMO_VIDEOS)[number]) => {
    setDownloading(video.id);
    window.setTimeout(() => {
      const content = `Demo download\n\nTitle: ${video.title}\nResolution: ${selectedResolution}\n\nThis is a local UI demonstration. It does not contain a real video or access restricted media.`;
      const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${video.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${selectedResolution}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      setDownloading(null);
      setDownloaded((items) => items.includes(video.id) ? items : [...items, video.id]);
    }, 650);
  };

  return (
    <div className="ytm-shell">
      <header className="ytm-header">
        <div className="ytm-brand-wrap">
          <button className="ytm-icon-button" aria-label="Menu"><Menu /></button>
          <div className="ytm-brand"><span className="ytm-logo">▶</span><strong>UTube</strong><sup>Unofficial demo</sup></div>
        </div>
        <label className="ytm-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search demo videos" /><button aria-label="Search"><Search /></button></label>
        <div className="ytm-actions"><button className="ytm-premium-button" onClick={() => setPremiumOpen(true)}>Premium demo</button><button className="ytm-icon-button" aria-label="Notifications"><Bell /></button><button className="ytm-avatar" aria-label="Account"><User /></button></div>
      </header>
      <nav className="ytm-chips" aria-label="Categories">{['All', 'Music', 'Programming', 'Travel', 'Design', 'Learning'].map((chip, index) => <button className={index === 0 ? 'active' : ''} key={chip}>{chip}</button>)}</nav>
      <main className="ytm-main">
        <section className="ytm-demo-banner"><div><span>PREMIUM DEMO</span><h1>Maximum quality. Your demo library.</h1><p>Download the sample catalog in a selected resolution. This offline mock does not represent real YouTube media or bypass controls.</p></div><div className="ytm-resolution-control"><label htmlFor="resolution">Download quality</label><div><select id="resolution" value={selectedResolution} onChange={(event) => setSelectedResolution(event.target.value)}><option>2160p (4K)</option><option>1440p</option><option>1080p</option><option>720p</option></select><ChevronDown /></div></div></section>
        <div className="ytm-grid">{videos.map((video) => <article className="ytm-card" key={video.id}><Thumbnail video={video} /><div className="ytm-card-body"><div className="ytm-channel-avatar" style={{ background: video.accent }}>{video.channel[0]}</div><div className="ytm-card-copy"><h2>{video.title}</h2><p>{video.channel}</p><p>{video.views} · {video.age}</p></div></div><button className={`ytm-download ${downloaded.includes(video.id) ? 'complete' : ''}`} onClick={() => downloadDemo(video)} disabled={downloading === video.id}><Download />{downloading === video.id ? 'Preparing…' : downloaded.includes(video.id) ? 'Download again' : `Download ${selectedResolution}`}</button></article>)}</div>
        {!videos.length && <div className="ytm-empty"><Search /><h2>No demo videos found</h2><p>Try another search.</p></div>}
      </main>
      {premiumOpen && <div className="ytm-modal-backdrop" role="presentation" onMouseDown={() => setPremiumOpen(false)}><section className="ytm-modal" role="dialog" aria-modal="true" aria-labelledby="premium-title" onMouseDown={(event) => event.stopPropagation()}><button className="ytm-modal-close" onClick={() => setPremiumOpen(false)} aria-label="Close"><X /></button><span className="ytm-modal-mark">▶</span><h2 id="premium-title">Premium demo activated</h2><p>This local mock simulates a premium experience. Downloads are generated as text placeholders and never access restricted YouTube content.</p><button onClick={() => setPremiumOpen(false)}>Explore demo</button></section></div>}
    </div>
  );
}
