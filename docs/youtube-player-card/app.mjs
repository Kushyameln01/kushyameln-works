const $ = id => document.getElementById(id);
const validId = /^[\w-]{11}$/;
const playerUrl = id => 'https://www.youtube.com/embed/' + id;
const watchUrl = id => 'https://www.youtube.com/watch?v=' + id;
// YouTube's /live/ page also serves recorded videos. Its initial HTML can
// advertise a Player Card even when /watch advertises a large-image card.
const cardUrl = id => 'https://www.youtube.com/live/' + id;

function videoId(input) {
  const raw = input.trim();
  if (validId.test(raw)) return raw;
  let url;
  try {
    url = new URL(raw.includes('://') ? raw : 'https://' + raw);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  const [route, part] = url.pathname.split('/').filter(Boolean);
  let id;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = route;
  } else if (/(^|\.)youtube\.com$/.test(host) || /^(www\.)?youtube-nocookie\.com$/.test(host)) {
    if (route === 'watch') id = url.searchParams.get('v');
    if (['shorts', 'live', 'embed', 'v'].includes(route)) id = part;
  }
  return typeof id === 'string' && validId.test(id) ? id : null;
}

let current;
let template;

function setShare(url) {
  $('share-url').value = url;
  const post = new URL('https://twitter.com/intent/tweet');
  post.searchParams.set('url', url);
  $('post').href = post.href;
}

async function loadTitle(card) {
  try {
    const endpoint = new URL('https://www.youtube.com/oembed');
    endpoint.searchParams.set('url', watchUrl(card.id));
    endpoint.searchParams.set('format', 'json');
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const { title } = await response.json();
    if (current === card && typeof title === 'string' && title.trim()) {
      card.title = title;
      $('video-title').textContent = title;
      $('preview').firstElementChild.title = title;
    }
  } catch {
    // The title is optional. Linking and exporting work with the video ID alone.
  }
}

function setup(input) {
  const id = videoId(input);
  if (!id) {
    current = null;
    $('result').hidden = true;
    $('preview').replaceChildren();
    $('message').textContent = '動画を特定できません。YouTubeの動画URLか11文字の動画IDを入力してください。';
    $('video').focus();
    return;
  }
  const card = { id, title: 'YouTube 動画 ' + id };
  current = card;
  $('message').textContent = '';
  $('feedback').textContent = '';
  $('result').hidden = false;
  setShare(cardUrl(id));
  $('video-title').textContent = card.title;
  const frame = document.createElement('iframe');
  frame.title = card.title;
  frame.src = playerUrl(id);
  frame.allow = 'accelerometer; gyroscope; encrypted-media; picture-in-picture; fullscreen; xr-spatial-tracking';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  $('preview').replaceChildren(frame);
  void loadTitle(card);
}

$('setup').addEventListener('submit', event => {
  event.preventDefault();
  setup($('video').value);
});
$('copy').addEventListener('click', async () => {
  const field = $('share-url');
  const original = field.value;
  try {
    await navigator.clipboard.writeText(original);
    if (field.value === original) $('feedback').textContent = 'URLをコピーしました。';
  } catch {
    field.focus();
    field.select();
    $('feedback').textContent = '選択されたURLをコピーしてください。';
  }
});

const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
$('save').addEventListener('click', async () => {
  const card = current;
  if (!card) return;
  try {
    if (!template) {
      const response = await fetch('./card-template.html');
      if (!response.ok) throw new Error();
      template = await response.text();
    }
    if (current !== card) return;
    const title = card.title.replace(/[&<>"']/g, character => htmlEntities[character]);
    const fields = { VIDEO_ID: card.id, TITLE: title };
    const html = template.replace(/__(VIDEO_ID|TITLE)__/g, (_, field) => fields[field]);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = card.id + '.html';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    if (current === card) $('feedback').textContent = 'カードHTMLを読み込めませんでした。もう一度お試しください。';
  }
});

const initial = new URL(location.href).searchParams.get('v');
if (initial) {
  $('video').value = initial;
  setup(initial);
}
