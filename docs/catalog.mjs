export function matches(item, query, tags, status = 'all') {
  const norm = s => s.normalize('NFKC').toLocaleLowerCase('ja');
  const words = norm(query).trim().split(/\s+/).filter(Boolean);
  const text = norm([item.title, ...item.tags].join(' '));
  return words.every(word => text.includes(word)) && tags.every(tag => item.tags.includes(tag)) &&
    (status === 'all' || (status === 'verified' && item.status === 'verified') ||
      (status === 'unverified' && item.status !== 'verified') ||
      (status === 'untagged' && item.status === 'verified' && item.tags.length === 0));
}
if (typeof document !== 'undefined') {
  const entries = [...document.querySelectorAll('[data-entry]')].map(el => ({el, title:el.dataset.title, tags:JSON.parse(el.dataset.tags), status:el.dataset.status}));
  const query = document.querySelector('#query');
  const status = document.querySelector('#tag-status');
  const buttons = [...document.querySelectorAll('[data-tag]')];
  const selected = new Set();
  const valid = new Set(buttons.map(b => b.dataset.tag));
  function readURL() {
    const params = new URLSearchParams(location.search);
    query.value = params.get('q') || '';
    selected.clear();
    for (const tag of params.getAll('tag')) if (valid.has(tag)) selected.add(tag);
    status.value = ['all','verified','unverified','untagged'].includes(params.get('status')) ? params.get('status') : 'all';
  }
  function update(writeURL = true) {
    let count = 0;
    for (const item of entries) { item.el.hidden = !matches(item,query.value,[...selected],status.value); if(!item.el.hidden) count++; }
    for (const b of buttons) b.setAttribute('aria-pressed',String(selected.has(b.dataset.tag)));
    document.querySelector('#result-count').textContent = `${count} / ${entries.length}件`;
    document.querySelector('#empty').hidden = count !== 0;
    document.querySelector('#selected').textContent = selected.size ? `選択中：${[...selected].join('、')}` : '選択中のタグ：なし';
    if (writeURL) {
      const params = new URLSearchParams();
      if(query.value.trim()) params.set('q',query.value.trim());
      for(const tag of selected) params.append('tag',tag);
      if(status.value !== 'all') params.set('status',status.value);
      history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
    }
  }
  for(const b of buttons) b.addEventListener('click',()=>{const t=b.dataset.tag;selected.has(t)?selected.delete(t):selected.add(t);update();});
  query.addEventListener('input',()=>update());
  status.addEventListener('change',()=>update());
  document.querySelector('#reset').addEventListener('click',()=>{query.value='';status.value='all';selected.clear();update();});
  addEventListener('popstate',()=>{readURL();update(false);});
  readURL();update(false);document.querySelector('#filters').hidden=false;
}
