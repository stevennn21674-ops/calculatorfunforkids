/* UnStevened Social — custom logo + icon set (all original artwork, no emoji / stock icons) */
(() => {
  let n = 0;
  // The UnStevened Social mark: a bold "U" that doubles as a chat bubble, with a spark.
  function logo(size = 40, opts = {}) {
    const i = ++n;
    return `<svg class="uss-logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="ul${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset=".55" stop-color="#ff3d78"/><stop offset="1" stop-color="#ffb03b"/></linearGradient>
        <linearGradient id="uh${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
      <path d="M14 4h36a10 10 0 0 1 10 10v30a10 10 0 0 1-10 10H30l-11 8v-8h-5A10 10 0 0 1 4 44V14A10 10 0 0 1 14 4z" fill="url(#ul${i})"/>
      <path d="M14 4h36a10 10 0 0 1 10 10v14H4V14A10 10 0 0 1 14 4z" fill="url(#uh${i})"/>
      <path d="M20 15v15a12 12 0 0 0 24 0V15h-8v15a4 4 0 0 1-8 0V15z" fill="#fff"/>
      <path d="M50 9l1.6 4.4L56 15l-4.4 1.6L50 21l-1.6-4.4L44 15l4.4-1.6z" fill="#fff"/>
      ${opts.ring ? '<rect x="2" y="2" width="60" height="60" rx="12" fill="none" stroke="#fff" stroke-opacity=".15"/>' : ''}
    </svg>`;
  }
  const P = {
    clips: '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>',
    chat: '<path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M8 11h8M8 14h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 19c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 13.8c2 .8 3.2 2.6 3.8 5.2"/>',
    addUser: '<circle cx="10" cy="8" r="4"/><path d="M3 20c1.4-4 4-6 7-6 2 0 3.7.8 5 2.2M19 13v6M16 16h6"/>',
    heart: '<path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
    save: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
    video: '<rect x="2.5" y="6" width="13" height="12" rx="3"/><path d="M15.5 10.5L21.5 7v10l-6-3.5z"/>',
    videoOff: '<path d="M3 3l18 18M15.5 15.5V17a1 1 0 0 1-1 1h-9a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h1M10 6h3.5a2 2 0 0 1 2 2v2.5l6-3.5v10"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    micOff: '<path d="M3 3l18 18M9 9v2a3 3 0 0 0 5 2.2M15 10V6a3 3 0 0 0-5.8-1M5.5 11a6.5 6.5 0 0 0 10.6 5M18.5 11a6.5 6.5 0 0 1-.4 2.2M12 17.5V21M8.5 21h7"/>',
    flip: '<path d="M4 9a8 8 0 0 1 14-3l2 2M20 4v4h-4M20 15a8 8 0 0 1-14 3l-2-2M4 20v-4h4"/>',
    end: '<path d="M3 14.5c5-4.7 13-4.7 18 0l-2.5 2.5-3.5-1.5V13a10 10 0 0 0-6 0v2.5L5.5 17z"/>',
    send: '<path d="M4 12l16-8-6 17-3-7z"/><path d="M11 14l9-10"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
    crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    hammer: '<path d="M14 4l6 6-3 3-6-6zM11 7l-8 8 3 3 8-8"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
    check: '<path d="M12 2.5l2.3 1.7 2.8-.2.9 2.7 2.4 1.5-.6 2.8 1.2 2.6-2.1 1.9-.3 2.8-2.8.5-1.6 2.3L12 20.8l-2.2 1.3-1.6-2.3-2.8-.5-.3-2.8-2.1-1.9 1.2-2.6-.6-2.8 2.4-1.5.9-2.7 2.8.2z" fill="currentColor" stroke="none"/><path d="M8.5 12l2.4 2.4 4.6-4.8" stroke="#0b0b12" stroke-width="2.2"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    spark: '<path d="M12 3l2 6.5 6.5 2-6.5 2L12 20l-2-6.5L3.5 11.5l6.5-2z"/>',
    mega: '<path d="M3 10v4h3l9 5V5L6 10zM18 9a4 4 0 0 1 0 6"/>',
    speaker: '<path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 6.6C4 8.3 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    pin: '<path d="M9 3h6l-1 6 4 3H6l4-3zM12 12v9"/>',
    play: '<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/>',
    wifiOff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2-1.5M1.5 9.5A15 15 0 0 1 6 6.8M22.5 9.5A15 15 0 0 0 10.8 5M12 20h.01"/>',
    wand: '<path d="M4 20L15 9M14 4v3M19 9h3M18 4l-2 2M11 4l1 1"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    door: '<path d="M14 4H6v16h8M14 4l5 2v12l-5 2zM11 12h.01"/>',
    filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.3 3 14.7 0 18M12 3c-3 3.3-3 14.7 0 18"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
    logout: '<path d="M10 4H5v16h5M16 8l4 4-4 4M20 12H9"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M12 13V7M9 10l3-3 3 3"/>',
    share: '<path d="M14 5l7 7-7 7M21 12H10a6 6 0 0 0-6 6v1"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3.6-3.6a4 4 0 0 0-5.7-5.7L12 6.3M14 10a4 4 0 0 0-5.7 0L4.7 13.6a4 4 0 0 0 5.7 5.7L12 17.7"/>',
    heartBroken: '<path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3l-1.5 4 3 2-1.5 3 1.5-3-3-2 1.5-4a4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9z"/>'
  };
  function icon(name, size = 22, cls = '') {
    const p = P[name] || P.spark;
    return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }
  // role badges use their own icon
  const BADGE = { owner: 'crown', shield: 'shield', hammer: 'hammer', heart: 'heart', star: 'star', bolt: 'bolt', spark: 'spark', check: 'check' };
  window.USI = { logo, icon, BADGE, names: Object.keys(P) };
})();
