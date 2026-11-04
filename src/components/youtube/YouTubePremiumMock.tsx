import React, { useMemo, useState } from 'react';
import { Bell, ChevronDown, Menu, Play, Search, User, X } from 'lucide-react';
import './youtube-premium-mock.css';

const VIDEOS = [
  { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', channel: 'Rick Astley', views: '1.6B views', age: '15 years ago', duration: '3:33', category: 'Music', accent: '#ef4444' },
  { id: 'M7lc1UVf-VE', title: 'YouTube IFrame Player API', channel: 'Google Developers', views: '4.1M views', age: '9 years ago', duration: '3:07', category: 'Programming', accent: '#4285f4' },
  { id: 'aqz-KE-bpKQ', title: 'Big Buck Bunny', channel: 'Blender Foundation', views: '16M views', age: '11 years ago', duration: '10:34', category: 'Animation', accent: '#f59e0b' },
  { id: 'jNQXAC9IVRw', title: 'Me at the zoo', channel: 'jawed', views: '360M views', age: '19 years ago', duration: '0:19', category: 'Featured', accent: '#22c55e' },
  { id: '9bZkp7q19f0', title: 'Gangnam Style', channel: 'PSY', views: '5.6B views', age: '13 years ago', duration: '4:13', category: 'Music', accent: '#ec4899' },
  { id: 'kJQP7kiw5Fk', title: 'Despacito', channel: 'Luis Fonsi', views: '8.5B views', age: '9 years ago', duration: '4:42', category: 'Music', accent: '#a855f7' },
  { id: '3JZ_D3ELwOQ', title: 'What Makes A Good Life?', channel: 'TEDx Talks', views: '18M views', age: '11 years ago', duration: '12:29', category: 'Learning', accent: '#14b8a6' },
  { id: '21X5lGlDOfg', title: 'NASA: Live from Space', channel: 'NASA', views: '21M views', age: '6 years ago', duration: 'Live', category: 'Science', accent: '#3b82f6' },
  { id: 'ScMzIvxBSi4', title: 'Sample Video for Developers', channel: 'Google Cloud Tech', views: '1.8M views', age: '7 years ago', duration: '3:46', category: 'Programming', accent: '#06b6d4' },
];

function Thumbnail({ video }: { video: (typeof VIDEOS)[number]; onPlay?: () => void }) {
  return (
    <div className="ytm-thumb">
      <img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt="" />
      <div className="ytm-thumb-grid" />
      <div className="ytm-play"><Play fill="currentColor" /></div>
      <span className="ytm-duration">{video.duration}</span>
    </div>
  );
}

export function UTubeWebsite() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<(typeof VIDEOS)[number] | null>(null);
  const [premiumOpen, setPremiumOpen] = useState(false);

  const videos = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return VIDEOS.filter((video) =>
      (category === 'All' || video.category === category) &&
      (!needle || `${video.title} ${video.channel} ${video.category}`.toLowerCase().includes(needle))
    );
  }, [query, category]);

  const categories = ['All', 'Music', 'Programming', 'Animation', 'Learning', 'Science', 'Featured'];

  return (
    <div className="ytm-shell">
      <header className="ytm-header">
        <div className="ytm-brand-wrap">
          <button className="ytm-icon-button" aria-label="Open menu"><Menu /></button>
          <div className="ytm-brand"><span className="ytm-logo">?</span><strong>UTube</strong></div>
        </div>
        <label className="ytm-search">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search videos" aria-label="Search videos" />
          <button aria-label="Search"><Search /></button>
        </label>
        <div className="ytm-actions">
          <button className="ytm-premium-button" onClick={() => setPremiumOpen(true)}>UTube Premium</button>
          <button className="ytm-icon-button" aria-label="Notifications"><Bell /></button>
          <button className="ytm-avatar" aria-label="Account"><User /></button>
        </div>
      </header>

      <nav className="ytm-chips" aria-label="Categories">
        {categories.map((chip) => <button className={category === chip ? 'active' : ''} key={chip} onClick={() => setCategory(chip)}>{chip}</button>)}
      </nav>

      <main className="ytm-main">
        <section className="ytm-demo-banner">
          <div><span>DISCOVER SOMETHING NEW</span><h1>Video, culture, learning and music.</h1><p>Explore popular creators and watch videos directly from the world's largest video library.</p></div>
          <div className="ytm-resolution-control">
            <label>Browse library</label>
            <button className="ytm-library-button" onClick={() => { setCategory('All'); setQuery(''); }}>View all videos <ChevronDown /></button>
          </div>
        </section>

        <div className="ytm-grid">
          {videos.map((video) => (
            <article className="ytm-card" key={video.id}>
              <button className="ytm-thumbnail-button" onClick={() => setSelected(video)} aria-label={`Play ${video.title}`}><Thumbnail video={video} /></button>
              <div className="ytm-card-body">
                <div className="ytm-channel-avatar" style={{ background: video.accent }}>{video.channel[0]}</div>
                <div className="ytm-card-copy"><h2>{video.title}</h2><p>{video.channel}</p><p>{video.views} ? {video.age}</p></div>
              </div>
              <button className="ytm-download" onClick={() => setSelected(video)}><Play />Watch video</button>
            </article>
          ))}
        </div>

        {!videos.length && <div className="ytm-empty"><Search /><h2>No videos found</h2><p>Try another search or category.</p></div>}
      </main>

      {selected && <div className="ytm-modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
        <section className="ytm-player-modal" role="dialog" aria-modal="true" aria-label={selected.title} onMouseDown={(event) => event.stopPropagation()}>
          <div className="ytm-player-heading"><div><h2>{selected.title}</h2><p>{selected.channel}</p></div><button className="ytm-modal-close" onClick={() => setSelected(null)} aria-label="Close"><X /></button></div>
          <div className="ytm-player"><iframe src={`https://www.youtube-nocookie.com/embed/${selected.id}?autoplay=1&rel=0`} title={selected.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
        </section>
      </div>}

      {premiumOpen && <div className="ytm-modal-backdrop" role="presentation" onMouseDown={() => setPremiumOpen(false)}>
        <section className="ytm-modal" role="dialog" aria-modal="true" aria-labelledby="premium-title" onMouseDown={(event) => event.stopPropagation()}>
          <button className="ytm-modal-close" onClick={() => setPremiumOpen(false)} aria-label="Close"><X /></button>
          <span className="ytm-modal-mark">?</span><h2 id="premium-title">UTube Premium</h2>
          <p>Enjoy more from your favourite channels, music and creators with an enhanced viewing experience.</p>
          <a href="https://www.youtube.com/premium" target="_blank" rel="noreferrer">Learn about Premium</a>
        </section>
      </div>}
    </div>
  );
}
