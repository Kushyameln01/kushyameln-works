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
const postText = $('post-text');

function updatePostLink() {
  const post = new URL('https://twitter.com/intent/tweet');
  post.searchParams.set('text', postText.value);
  $('post').href = post.href;
}

function setDraft(id, title) {
  postText.value = title + '\n' + cardUrl(id);
  updatePostLink();
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
      $('preview').firstElementChild.title = title;
      if (!card.draftInUse) setDraft(card.id, title.trim());
    }
  } catch {
    // The initial post is ready even if YouTube does not return a title.
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
  if (current?.id === id) return;
  const card = { id, draftInUse: false };
  current = card;
  $('message').textContent = '';
  $('feedback').textContent = '';
  $('result').hidden = false;
  setDraft(id, 'YouTubeで見る');
  const frame = document.createElement('iframe');
  frame.title = 'YouTube 動画 ' + id;
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
// An optional title lookup must not replace a post someone has edited or copied.
postText.addEventListener('input', () => {
  current.draftInUse = true;
  $('feedback').textContent = '';
  updatePostLink();
});
$('post').addEventListener('click', () => { current.draftInUse = true; });
$('copy').addEventListener('click', async () => {
  const card = current;
  card.draftInUse = true;
  const text = postText.value;
  try {
    await navigator.clipboard.writeText(text);
    if (current === card && postText.value === text) $('feedback').textContent = '投稿文をコピーしました。';
  } catch {
    if (current !== card || postText.value !== text) return;
    postText.focus();
    postText.select();
    $('feedback').textContent = '選択された投稿文をコピーしてください。';
  }
});

const initial = new URL(location.href).searchParams.get('v');
if (initial) {
  $('video').value = initial;
  setup(initial);
}
