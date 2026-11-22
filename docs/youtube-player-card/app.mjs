const $ = id => document.getElementById(id);
const validId = /^[\w-]{11}$/;
const playerUrl = id => 'https://www.youtube.com/embed/' + id;
const watchUrl = id => 'https://www.youtube.com/watch?v=' + id;

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

function setShare(url, label) {
  $('share-label').textContent = label;
  $('share-url').value = url;
  const post = new URL('https://twitter.com/intent/tweet');
  post.searchParams.set('url', url);
  $('post').href = post.href;
}

async function checkPublished(card) {
  const revision = ++card.check;
  const isCurrent = () => current === card && card.check === revision;
  const url = new URL('./v/' + card.id + '/', import.meta.url);
  let status;
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (response.status === 404) {
      status = 'Worksで公開するには、動画IDが記載された公開Issueを送信してください。書き込み権限のある方の依頼は自動公開されます。その他の依頼は、担当者がIssueに /publish-card とコメントすると公開されます。';
    } else {
      if (!response.ok) throw new Error();
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      const meta = name => html.querySelector('meta[name="' + name + '"]')?.content;
      if (meta('twitter:card') !== 'player' || meta('twitter:player') !== playerUrl(card.id)) throw new Error();
      if (!isCurrent()) return;
      setShare(url.href, 'WorksのカードURL');
      $('request').hidden = true;
      $('refresh').hidden = true;
      $('availability').textContent = 'Worksのカードページは公開済みです。';
      return;
    }
  } catch {
    status = 'Worksの公開状況を取得できませんでした。YouTubeの共有URLとカードHTMLは利用できます。';
  }
  if (isCurrent()) $('availability').textContent = status;
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
  const card = { id, title: 'YouTube 動画 ' + id, check: 0, requested: false };
  current = card;
  $('message').textContent = '';
  $('feedback').textContent = '';
  $('result').hidden = false;
  $('publish').open = false;
  $('video-title').textContent = card.title;
  const frame = document.createElement('iframe');
  frame.title = card.title;
  frame.src = playerUrl(id);
  frame.allow = 'accelerometer; gyroscope; encrypted-media; picture-in-picture; fullscreen; xr-spatial-tracking';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  $('preview').replaceChildren(frame);
  setShare(watchUrl(id), 'YouTubeの共有URL');
  const request = new URL('https://github.com/Kushyameln01/kushyameln-works/issues/new');
  request.searchParams.set('title', 'Player Card: ' + id);
  request.searchParams.set('body', 'この動画のX Player CardをKushyameln Worksに公開します。\n\n' + watchUrl(id));
  $('request').href = request.href;
  $('request').hidden = false;
  $('refresh').hidden = false;
  $('availability').textContent = 'Worksの公開状況を確認中…';
  void loadTitle(card);
  void checkPublished(card);
}

$('setup').addEventListener('submit', event => {
  event.preventDefault();
  setup($('video').value);
});
$('request').addEventListener('click', () => { if (current) current.requested = true; });
window.addEventListener('focus', () => {
  if (current?.requested && !$('request').hidden) void checkPublished(current);
});
$('refresh').addEventListener('click', () => { if (current) void checkPublished(current); });

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
