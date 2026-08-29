import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, Archive, Bell, ChevronDown, ChevronRight, Clock3, Cloud,
  CloudSun, Computer, Download, File, FileImage, FilePlus2, FileText,
  Folder, FolderInput, Grid2X2, HardDrive, HelpCircle, Image, LayoutList,
  Link2, LockKeyhole, Menu, MoreHorizontal, Music2, Plus, Search, Settings,
  Share2, ShieldCheck, Star, Tag, Trash2, Upload, Users, Video, WifiOff, X
} from 'lucide-react';
import { supabase } from './lib/supabase';
import {
  createCloudFolder, loadCloud, saveCloudProfile, setCloudStar,
  setCloudTrash, signedFileUrl, uploadCloudFiles,
} from './lib/cloud';
import './styles.css';

const navGroups = [
  [
    ['My Cloud', Cloud], ['Recent', Clock3], ['Starred', Star],
    ['Photos', Image],
  ],
  [['Trash', Trash2]],
  [['Storage', HardDrive], ['Activity', Activity]],
];

const avatarChoices = [
  '/avatars/avatar-01.jpeg', '/avatars/avatar-02.jpeg', '/avatars/avatar-03.jpeg',
  '/avatars/avatar-04.jpeg', '/avatars/avatar-05.png', '/avatars/avatar-06.png',
  '/avatars/avatar-07.png', '/avatars/avatar-08.png', '/avatars/avatar-09.png',
  '/avatars/avatar-10.png', '/avatars/avatar-11.png', '/avatars/avatar-12.png',
];

function IconFor({ type, size = 18 }) {
  const icons = { folder: Folder, video: Video, image: FileImage, audio: Music2, pdf: FileText, text: FileText };
  const Icon = icons[type] || File;
  return <Icon size={size} strokeWidth={1.8} />;
}

function PixelLandscape() {
  const videoRef = useRef(null);
  useEffect(() => {
    const video = videoRef.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPlayback = () => {
      if (!video) return;
      if (document.hidden || reduced.matches) video.pause();
      else video.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', syncPlayback);
    reduced.addEventListener?.('change', syncPlayback);
    syncPlayback();
    return () => {
      document.removeEventListener('visibilitychange', syncPlayback);
      reduced.removeEventListener?.('change', syncPlayback);
    };
  }, []);
  return <div className="landscape" aria-hidden="true">
    <video ref={videoRef} className="background-video" src="/8bitspace-background.mp4" autoPlay muted loop playsInline preload="metadata" />
  </div>;
}

function ProfileAvatar({ src, label = 'Dhruv profile photo' }) {
  return <img src={src} alt={label} />;
}

function Sidebar({ open, onClose, active, setActive, avatar, onProfile, onCreate, storage }) {
  const usedGb = (storage.used / 1024 ** 3).toFixed(storage.used ? 2 : 0);
  const percent = storage.total ? Math.min(100, Math.round(storage.used / storage.total * 100)) : 0;
  return <aside className={`sidebar ${open ? 'is-open' : ''}`}>
    <div className="brand-row">
      <div className="brand-mark"><Cloud size={19} fill="currentColor" /></div>
      <div><strong>8bitSpace</strong><span>cloud workspace</span></div>
      <button className="icon-button mobile-close" onClick={onClose} aria-label="Close navigation"><X /></button>
    </div>
    <button className="create-button" onClick={onCreate}><Plus size={19} /> Create New <ChevronDown size={16} /></button>
    <nav aria-label="Main navigation">
      {navGroups.map((group, gi) => <div className="nav-group" key={gi}>
        {group.map(([label, Icon]) => <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => { setActive(label); onClose(); }}>
          <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Activity' && <i className="nav-dot" />}
        </button>)}
      </div>)}
    </nav>
    <div className="storage-card">
      <div className="storage-title"><span>STORAGE</span><strong>{percent}%</strong></div>
      <div className="pixel-meter"><i style={{width:`${percent}%`}} /></div>
      <p><b>{usedGb} GB</b> of 100 GB used</p>
      <button>View storage</button>
    </div>
    <button className="account-card" onClick={onProfile} aria-label="Change profile photo">
      <span className="avatar avatar-me"><ProfileAvatar src={avatar} /></span>
      <div><strong>Dhruv</strong><span>Explorer plan</span></div>
      <MoreHorizontal className="account-more" />
    </button>
  </aside>;
}

function Header({ query, setQuery, onMenu, avatar, onProfile }) {
  return <header className="topbar">
    <button className="icon-button menu-button" onClick={onMenu} aria-label="Open navigation"><Menu /></button>
    <div className="welcome"><span>GOOD MORNING, DHRUV</span><h1>Your cloud is looking clear.</h1></div>
    <label className="search-box">
      <Search size={18} /><span className="sr-only">Search your cloud</span>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your cloud" />
      <kbd>⌘ K</kbd>
    </label>
    <div className="header-actions">
      <button className="icon-button" aria-label="Help"><HelpCircle /></button>
      <button className="icon-button" aria-label="Settings"><Settings /></button>
      <button className="icon-button notification" aria-label="Notifications"><Bell /><i /></button>
      <button className="avatar avatar-me" aria-label="Open profile photo menu" onClick={onProfile}><ProfileAvatar src={avatar} /></button>
    </div>
  </header>;
}

function AvatarPicker({ current, onSelect, onClose, profile, onSave, onSignOut, onResetPassword }) {
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Photo');
  const [form, setForm] = useState(profile);
  const upload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be smaller than 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { onSelect(reader.result); setError(''); };
    reader.readAsDataURL(file);
  };
  return <div className="profile-modal-layer" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="profile-modal profile-settings" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <div className="profile-modal-head"><div><span>PIXEL IDENTITY</span><h2 id="profile-title">Choose your player</h2></div><button className="icon-button" onClick={onClose} aria-label="Close profile picker"><X /></button></div>
      <div className="settings-tabs" role="tablist">{['Account','Photo','Preferences','Security'].map(name=><button role="tab" aria-selected={tab===name} className={tab===name?'active':''} onClick={()=>setTab(name)} key={name}>{name}</button>)}</div>
      {tab === 'Account' && <div className="settings-page"><label>Display name<input value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Email address<input type="email" value={form.email||''} readOnly/></label><div className="plan-panel"><span>Current plan</span><strong>Explorer · 100 GB</strong></div><button className="sign-out-button" onClick={onSignOut}>Sign out of 8bitSpace</button></div>}
      {tab === 'Photo' && <><div className="current-profile"><span className="avatar current-avatar"><ProfileAvatar src={current} /></span><div><strong>{profile.name}</strong><small>Your profile photo appears across 8bitSpace.</small></div></div>
      <div className="avatar-grid" role="list" aria-label="Profile photo choices">
        {avatarChoices.map((src, index) => <button key={src} role="listitem" className={current === src ? 'chosen' : ''} onClick={() => onSelect(src)} aria-label={`Choose pixel avatar ${index + 1}`}><img src={src} alt="" />{current === src && <i>✓</i>}</button>)}
      </div>
      <label className="avatar-upload"><Upload size={18} /><span><b>Upload your own</b><small>PNG, JPG or WEBP · max 5 MB</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} /></label>
      {error && <p className="avatar-error" role="alert">{error}</p>}</>}
      {tab === 'Preferences' && <div className="settings-page"><label className="setting-switch"><span><b>Activity notifications</b><small>Uploads, edits, and security notices</small></span><input type="checkbox" checked={form.notifications??true} onChange={e=>setForm({...form,notifications:e.target.checked})}/></label><label>Interface theme<select value={form.theme||'pixel-night'} onChange={e=>setForm({...form,theme:e.target.value})}><option value="pixel-night">Pixel night</option><option value="pixel-day">Bright sky</option></select></label></div>}
      {tab === 'Security' && <div className="settings-page security-list"><button onClick={onResetPassword}><LockKeyhole/>Send password-reset email<ChevronRight/></button><p className="security-note"><ShieldCheck/>Your files are private and protected by account-level access policies.</p></div>}
      <button className="profile-done" onClick={async()=>{await onSave({...form,avatar:current});onClose()}}>Save changes</button>
    </section>
  </div>;
}

function IntroSequence({ onFinish }) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(onFinish, reduced ? 100 : 5600);
    return () => window.clearTimeout(timer);
  }, [onFinish]);
  return <div className="intro-sequence" aria-label="8bitSpace opening animation">
    <button className="intro-skip" onClick={onFinish}>SKIP ↗</button>
    <div className="intro-logo">
      <span className="intro-eight">8<i className="eight-eyes">••</i></span>
      <span className="intro-b">b</span><span className="intro-i">i</span><span className="intro-t">t</span>
      <span className="intro-space">Space</span>
      <span className="crash-pixels" aria-hidden="true">▪ ▪ ▫ ▪</span>
    </div>
  </div>;
}

function FileBrowser({ query, selected, setSelected, sourceFiles, active, currentFolder, onOpenFolder, onBack, onUpload, onRequestUpload }) {
  const [view, setView] = useState('list');
  const [checked, setChecked] = useState([]);
  const files = useMemo(() => sourceFiles.filter(f => {
    if (active === 'Trash' && !f.trashed) return false;
    if (active !== 'Trash' && f.trashed) return false;
    if (active === 'Starred' && !f.starred) return false;
    if (active === 'Photos' && !['image','video'].includes(f.type)) return false;
    if (active === 'My Cloud' && currentFolder && f.folderId !== currentFolder.id) return false;
    if (active === 'My Cloud' && !currentFolder && (f.type !== 'folder' || f.parentId)) return false;
    return f.name.toLowerCase().includes(query.toLowerCase());
  }), [query, sourceFiles, active, currentFolder]);
  const isRoot = active === 'My Cloud' && !currentFolder;
  const title = isRoot ? 'All folders' : currentFolder ? 'All files' : active;
  const toggle = (id) => setChecked(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  const openItem = file => file.type === 'folder' ? onOpenFolder(file) : setSelected(file);
  return <section className="section-block file-section" aria-labelledby="files-title">
    <div className="section-heading file-heading">
      <div>{currentFolder ? <button className="breadcrumb-back" onClick={onBack}>← MY CLOUD / {currentFolder.name}</button> : <span className="eyebrow">MY CLOUD / HOME</span>}<h2 id="files-title">{title} <em>{files.length}</em></h2></div>
      <div className="file-tools">
        <div className="view-toggle" aria-label="View style">
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="List view"><LayoutList /></button>
          <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Grid view"><Grid2X2 /></button>
        </div>
        {currentFolder ? <label className="upload-button"><Upload size={17} /> Upload<input type="file" multiple onChange={e=>onUpload(e,currentFolder.id)}/></label> : <button className="upload-button root-upload" onClick={onRequestUpload}><Upload size={17}/>Upload</button>}
      </div>
    </div>
    {files.length === 0 ? <div className="empty-state"><CloudSun /><h3>{isRoot?'Create your first folder':'This folder is empty'}</h3><p>{isRoot?'Files in 8bitSpace must always live inside a folder.':'Use Upload to add files to this folder.'}</p>{isRoot&&<button className="empty-create" onClick={onRequestUpload}><Folder/>Create a folder</button>}</div> : view === 'list' ?
      <div className="table-wrap"><table>
        <thead><tr><th><input type="checkbox" aria-label="Select all files" checked={checked.length === files.length && files.length > 0} onChange={() => setChecked(checked.length === files.length ? [] : files.map(f => f.id))} /></th><th>Name</th><th>Status</th><th>Owner</th><th>Last modified</th><th>Size</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{files.map(file => <tr key={file.id} className={`${selected?.id === file.id ? 'selected' : ''}`} onClick={() => openItem(file)}>
          <td onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${file.name}`} checked={checked.includes(file.id)} onChange={() => toggle(file.id)} /></td>
          <td><span className={`row-icon ${file.color}`}><IconFor type={file.type} /></span><span className="file-name"><strong>{file.name}</strong><small><i className={`tag-dot ${file.color}`} />{file.tag}</small></span></td>
          <td><span className={`status ${file.status.toLowerCase().replace(' ', '-')}`}>{file.status === 'Syncing' && <i />}{file.status}</span></td>
          <td><span className="owner"><i>{file.owner === 'You' ? 'DT' : file.owner.split(' ').map(x => x[0]).join('')}</i>{file.owner}</span></td>
          <td>{file.modified}</td><td>{file.size}</td><td><button className="row-action" aria-label={`Actions for ${file.name}`}><MoreHorizontal /></button></td>
        </tr>)}</tbody>
      </table></div> :
      <div className="file-grid">{files.map(file => <button key={file.id} className={`grid-file ${selected?.id === file.id ? 'selected' : ''}`} onClick={() => openItem(file)}>
        <span className={`grid-preview ${file.color}`}><IconFor type={file.type} size={34} /></span><strong>{file.name}</strong><small>{file.modified} · {file.size}</small>
      </button>)}</div>}
  </section>;
}

function CreateDialog({ onClose, onCreateFolder, onUpload, folders }) {
  const [name,setName]=useState('');
  const [mode,setMode]=useState(folders.length?'choose':'new');
  const [folderId,setFolderId]=useState('');
  return <div className="profile-modal-layer" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="profile-modal-head"><div><span>FOLDER-FIRST STORAGE</span><h2 id="create-title">{mode==='new'?(folders.length?'Create a new folder':'Create your first folder'):'Choose where to continue'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close create dialog"><X/></button></div>
    {folders.length>0&&mode==='choose'&&<div className="folder-choice"><button onClick={()=>setMode('new')}><Plus/><span><b>Create a new folder</b><small>Start a separate space</small></span></button><div className="folder-list-label">OR OPEN AN EXISTING FOLDER</div>{folders.map(folder=><button key={folder.id} onClick={()=>setFolderId(folder.id)} className={folderId===folder.id?'selected':''}><Folder/><span><b>{folder.name}</b><small>Choose this folder</small></span><ChevronRight/></button>)}</div>}
    {(mode==='new'||folders.length===0)&&<form onSubmit={e=>{e.preventDefault();if(name.trim())onCreateFolder(name)}}><label>Folder name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Untitled folder" autoFocus/></label><button type="submit"><Folder/>Create folder</button></form>}
    {folders.length===0&&<div className="upload-blocked"><LockKeyhole/><span><b>Upload locked</b><small>You must create a folder before uploading any files.</small></span></div>}
    {folderId&&<div className="folder-upload-ready"><p>Files will be uploaded inside <b>{folders.find(f=>f.id===folderId)?.name}</b>.</p><label className="upload-button"><Upload/>Choose files<input type="file" multiple onChange={e=>onUpload(e,folderId)}/></label></div>}
    {mode==='new'&&folders.length>0&&<button className="dialog-back" onClick={()=>setMode('choose')}>← Back to folders</button>}
  </section></div>;
}

function SpecialView({ active, activity, storage }) {
  if(active==='Activity') return <section className="special-view"><span className="eyebrow">LIVE HISTORY</span><h2>Activity</h2>{activity.map(item=><article key={item.id}><Activity/><div><b>{item.action}</b><p>{item.detail}</p></div><time>{new Date(item.time).toLocaleString()}</time></article>)}</section>;
  if(active==='Storage') return <section className="special-view storage-view"><span className="eyebrow">SPACE CHECK</span><h2>Storage</h2><div className="storage-hero"><HardDrive/><strong>{((storage.used||0)/1024**3).toFixed(2)} GB</strong><span>used of 100 GB</span></div><div className="storage-stats"><div><b>{storage.files||0}</b><span>Active files</span></div><div><b>{storage.trash||0}</b><span>In trash</span></div><div><b>{Math.max(0,100-(storage.used||0)/1024**3).toFixed(1)} GB</b><span>Available</span></div></div></section>;
  if(active==='File Requests') return <section className="special-view empty-feature"><FolderInput/><h2>File Requests</h2><p>Collect files from anyone without exposing your cloud contents.</p><button>Create request link</button></section>;
  if(active==='Secure Vault') return <section className="special-view empty-feature"><LockKeyhole/><h2>Secure Vault</h2><p>Add an extra verification step for your most sensitive files.</p><button>Unlock vault</button></section>;
  return null;
}

function DetailsPanel({ file, onClose, onAction }) {
  if (!file) return null;
  return <aside className="details-panel" aria-label={`${file.name} details`}>
    <div className="details-head"><span>FILE DETAILS</span><button className="icon-button" onClick={onClose} aria-label="Close details"><X /></button></div>
    <div className={`preview-box ${file.color}`}><IconFor type={file.type} size={54} /><span>8BIT</span></div>
    <h3>{file.name}</h3><p className="muted">{file.type.toUpperCase()} · {file.size}</p>
    <div className="detail-actions"><button onClick={()=>onAction('share',file)}><Share2 />Share</button><button onClick={()=>onAction('download',file)}><Download />Download</button><button onClick={()=>onAction('star',file)}><Star fill={file.starred?'currentColor':'none'}/>{file.starred?'Unstar':'Star'}</button><button onClick={()=>onAction(file.trashed?'restore':'trash',file)}>{file.trashed?<Archive/>:<Trash2/>}{file.trashed?'Restore':'Trash'}</button></div>
    <dl><div><dt>Owner</dt><dd>{file.owner}</dd></div><div><dt>Modified</dt><dd>{file.modified}</dd></div><div><dt>Status</dt><dd>{file.status}</dd></div><div><dt>Folder</dt><dd>Current folder</dd></div></dl>
  </aside>;
}

function AuthScreen() {
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async event => {
    event.preventDefault();
    setPending(true); setMessage('');
    const credentials = { email: email.trim(), password };
    const { data, error } = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp(credentials);
    if (error) setMessage(error.message);
    else if (mode === 'sign-up' && !data.session) setMessage('Check your email to confirm your 8bitSpace account.');
    setPending(false);
  };
  return <div className="auth-shell">
    <PixelLandscape /><div className="atmosphere" />
    <main className="auth-card">
      <div className="auth-brand"><Cloud fill="currentColor"/><div><strong>8bitSpace</strong><span>YOUR PRIVATE PIXEL CLOUD</span></div></div>
      <div className="auth-copy"><span>{mode === 'sign-in' ? 'PLAYER RETURNING' : 'NEW PLAYER'}</span><h1>{mode === 'sign-in' ? 'Welcome back.' : 'Claim your space.'}</h1><p>Every file belongs in a folder. Every folder belongs only to you.</p></div>
      <form className="auth-form" onSubmit={submit}>
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@example.com"/></label>
        <label>Password<input type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={event=>setPassword(event.target.value)} placeholder="At least 6 characters"/></label>
        {message && <p className="auth-message" role="status">{message}</p>}
        <button disabled={pending}>{pending ? 'Connecting…' : mode === 'sign-in' ? 'Enter 8bitSpace' : 'Create account'}</button>
      </form>
      <button className="auth-switch" onClick={()=>{setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');setMessage('')}}>{mode === 'sign-in' ? 'NEW HERE? CREATE AN ACCOUNT →' : 'ALREADY A PLAYER? SIGN IN →'}</button>
    </main>
  </div>;
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [active, setActive] = useState('My Cloud');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatar, setAvatar] = useState(avatarChoices[0]);
  const [introDone, setIntroDone] = useState(false);
  const [files, setFiles] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [profile, setProfile] = useState({name:'Player',email:'',avatar:avatarChoices[0],notifications:true,theme:'pixel-night'});
  const [activity, setActivity] = useState([]);
  const [storage, setStorage] = useState({used:0,total:100*1024**3,files:0,trash:0});
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState('');
  const special = ['Activity','Storage'].includes(active);
  const refresh = async () => {
    if (!user) return;
    try { const data=await loadCloud(user); setFiles(data.files);setProfile(data.profile);setAvatar(data.profile.avatar||avatarChoices[0]);setActivity(data.activity);setStorage(data.storage); }
    catch (error) { setToast(error.message || 'Could not load your cloud.'); }
  };
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setUser(data.session?.user||null);setAuthLoading(false)});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{setUser(session?.user||null);setAuthLoading(false)});
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{if(user)refresh();else{setFiles([]);setActivity([])}},[user]);
  const notify=(message)=>{setToast(message);window.setTimeout(()=>setToast(''),2600)};
  const uploadFiles=async(e,folderId)=>{const chosen=[...(e.target.files||[])];if(!chosen.length)return;if(!folderId){notify('You must create or open a folder first.');setCreateOpen(true);e.target.value='';return}try{await uploadCloudFiles(user,folderId,chosen);await refresh();notify(`${chosen.length} file${chosen.length===1?'':'s'} uploaded`);setCreateOpen(false);const folder=files.find(f=>f.id===folderId);if(folder)setCurrentFolder(folder)}catch(err){notify(err.message)}e.target.value=''};
  const createFolder=async(name)=>{try{await createCloudFolder(user,name);await refresh();notify('Folder created');setCreateOpen(false)}catch(err){notify(err.message)}};
  const saveProfile=async(next)=>{try{const saved=await saveCloudProfile(user,next);setProfile(saved);setAvatar(saved.avatar);notify('Profile saved')}catch(err){notify(err.message)}};
  const fileAction=async(action,file)=>{try{if(action==='share'){const url=await signedFileUrl(file,3600);await navigator.clipboard.writeText(url);notify('Private link copied · expires in 1 hour');return}if(action==='download'){const url=await signedFileUrl(file,300,true);window.open(url,'_blank','noopener,noreferrer');return}if(action==='star'){await setCloudStar(file,!file.starred);await refresh();notify(file.starred?'Removed from starred':'Added to starred');return}await setCloudTrash(user,file,action==='trash');setSelected(null);await refresh();notify(action==='trash'?'Moved to trash':'File restored')}catch(err){notify(err.message)}};
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.querySelector('.search-box input')?.focus(); } if (e.key === 'Escape') { setSelected(null); setNavOpen(false); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(()=>{setCurrentFolder(null);setSelected(null)},[active]);
  const rootFolders=files.filter(f=>f.type==='folder'&&!f.trashed&&!f.parentId);
  if (authLoading) return <div className="auth-shell"><PixelLandscape/><div className="atmosphere"/><div className="auth-loading"><Cloud/>CONNECTING TO YOUR CLOUD…</div></div>;
  if (!user) return <AuthScreen/>;
  return <div className="app-shell">
    <PixelLandscape /><div className="atmosphere" />
    {navOpen && <button className="scrim" onClick={() => setNavOpen(false)} aria-label="Close navigation" />}
    {!introDone && <IntroSequence onFinish={() => setIntroDone(true)} />}
    <Sidebar open={navOpen} onClose={() => setNavOpen(false)} active={active} setActive={setActive} avatar={avatar} onProfile={() => setProfileOpen(true)} onCreate={()=>setCreateOpen(true)} storage={storage} />
    <main className={`workspace ${selected ? 'with-details' : ''}`}>
      <Header query={query} setQuery={setQuery} onMenu={() => setNavOpen(true)} avatar={avatar} onProfile={() => setProfileOpen(true)} />
      <div className="content-scroll">
        {special ? <SpecialView active={active} activity={activity} storage={storage}/> : <FileBrowser query={query} selected={selected} setSelected={setSelected} sourceFiles={files} active={active} currentFolder={currentFolder} onOpenFolder={folder=>{setCurrentFolder(folder);setSelected(null)}} onBack={()=>{setCurrentFolder(null);setSelected(null)}} onUpload={uploadFiles} onRequestUpload={()=>setCreateOpen(true)}/>} 
        <footer><span><ShieldCheck size={14}/> Protected & synced</span><span>8bitSpace · peaceful files, serious storage</span></footer>
      </div>
    </main>
    <DetailsPanel file={selected} onClose={() => setSelected(null)} onAction={fileAction} />
    {profileOpen && <AvatarPicker current={avatar} onSelect={setAvatar} onClose={() => setProfileOpen(false)} profile={profile} onSave={saveProfile} onSignOut={async()=>{setProfileOpen(false);await supabase.auth.signOut()}} onResetPassword={async()=>{const {error}=await supabase.auth.resetPasswordForEmail(profile.email,{redirectTo:location.origin});notify(error?error.message:'Password-reset email sent')}} />}
    {createOpen && <CreateDialog onClose={()=>setCreateOpen(false)} onCreateFolder={createFolder} onUpload={uploadFiles} folders={rootFolders}/>} 
    {toast && <div className="toast" role="status"><Cloud size={16}/>{toast}</div>}
    <button className="floating-create" aria-label="Create new" onClick={()=>setCreateOpen(true)}><Plus /></button>
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
