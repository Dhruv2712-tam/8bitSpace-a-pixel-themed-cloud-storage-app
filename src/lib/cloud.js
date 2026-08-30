import * as tus from 'tus-js-client'
import { supabase, supabasePublishableKey, supabaseUrl } from './supabase'

export const SPACE_LIMIT = 100 * 1024 ** 3

const typeFromMime = (mime = '', name = '') => {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('text/')) return 'text'
  return 'file'
}

const sizeLabel = bytes => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`
}

const modifiedLabel = value => {
  const date = new Date(value)
  const delta = Date.now() - date.getTime()
  if (delta < 60_000) return 'Just now'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  return date.toLocaleDateString()
}

const mapFolder = row => ({
  id: row.id, name: row.name, type: 'folder', parentId: row.parent_id,
  modified: modifiedLabel(row.updated_at), size: '—', bytes: 0, owner: 'You',
  tag: 'Folder', color: 'blue', status: 'Synced', members: 1,
  starred: row.is_starred, trashed: Boolean(row.trashed_at),
})

const mapFile = row => ({
  id: row.id, name: row.name, type: typeFromMime(row.mime_type, row.name),
  folderId: row.folder_id, storagePath: row.storage_path,
  modified: modifiedLabel(row.updated_at), size: sizeLabel(row.size_bytes),
  bytes: row.size_bytes, owner: 'You', tag: row.tag || 'Uploaded', color: 'blue',
  status: 'Synced', members: 1, starred: row.is_starred,
  trashed: Boolean(row.trashed_at),
})

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

export async function loadCloud(user) {
  const [foldersResult, filesResult, activityResult, profileResult] = await Promise.all([
    supabase.from('folders').select('*').order('updated_at', { ascending: false }),
    supabase.from('files').select('*').order('updated_at', { ascending: false }),
    supabase.from('activity').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
  ])
  const folders = must(foldersResult).map(mapFolder)
  const files = must(filesResult).map(mapFile)
  const activity = must(activityResult).map(row => ({ id: row.id, action: row.action, detail: row.subject, time: row.created_at }))
  let profileRow = must(profileResult)
  if (!profileRow) {
    profileRow = must(await supabase.from('profiles').insert({ id: user.id, display_name: user.email?.split('@')[0] || 'Player' }).select().single())
  }
  const used = files.filter(file => !file.trashed).reduce((total, file) => total + file.bytes, 0)
  let avatar = profileRow.avatar_url || '/avatars/avatar-01.jpeg'
  const avatarPath = avatar.startsWith('storage:') ? avatar.slice(8) : null
  if (avatarPath) {
    const { data } = await supabase.storage.from('profile-avatars').createSignedUrl(avatarPath, 3600)
    avatar = data?.signedUrl || '/avatars/avatar-01.jpeg'
  }
  return {
    files: [...folders, ...files], activity,
    profile: {
      name: profileRow.display_name, email: user.email || '',
      avatar, avatarPath,
      notifications: profileRow.notifications, theme: profileRow.theme,
    },
    storage: { used, total: SPACE_LIMIT, files: files.filter(file => !file.trashed).length, trash: files.filter(file => file.trashed).length },
  }
}

export async function createCloudFolder(user, name, parentId = null) {
  must(await supabase.from('folders').insert({ user_id: user.id, parent_id: parentId, name: name.trim() }))
  await logActivity(user, 'Folder created', name.trim())
}

const safeObjectName = name => name.normalize('NFKC').replace(/[\\/\0]/g, '-').slice(0, 180)

const resumableUpload = async (file, path, onProgress) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Your session expired. Please sign in again.')
  const projectId = new URL(supabaseUrl).hostname.split('.')[0]
  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`,
      headers: { authorization: `Bearer ${session.access_token}`, apikey: supabasePublishableKey },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      metadata: { bucketName: 'space-files', objectName: path, contentType: file.type || 'application/octet-stream', cacheControl: '3600' },
      removeFingerprintOnSuccess: true,
      onError: reject,
      onProgress: (uploaded, total) => onProgress(uploaded, total),
      onSuccess: resolve,
    })
    upload.findPreviousUploads().then(previous => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0])
      upload.start()
    }).catch(reject)
  })
}

export async function uploadCloudFiles(user, folderId, files, onProgress = () => {}) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  let completedBytes = 0
  for (const file of files) {
    const path = `${user.id}/${folderId}/${crypto.randomUUID()}-${safeObjectName(file.name)}`
    const report = (uploaded) => onProgress({ name: file.name, uploaded: completedBytes + uploaded, total: totalBytes, percent: totalBytes ? Math.round((completedBytes + uploaded) / totalBytes * 100) : 100 })
    if (file.size > 6 * 1024 * 1024) await resumableUpload(file, path, report)
    else {
      must(await supabase.storage.from('space-files').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }))
      report(file.size)
    }
    const { error } = await supabase.from('files').insert({
      user_id: user.id, folder_id: folderId, name: file.name.slice(0, 255),
      storage_path: path, mime_type: file.type || 'application/octet-stream', size_bytes: file.size,
    })
    if (error) {
      await supabase.storage.from('space-files').remove([path])
      throw error
    }
    completedBytes += file.size
  }
  await logActivity(user, 'Upload complete', `${files.length} file${files.length === 1 ? '' : 's'} uploaded`)
}

export async function saveCloudProfile(user, profile) {
  let storedAvatar = profile.avatarPath ? `storage:${profile.avatarPath}` : profile.avatar
  if (profile.avatarFile) {
    const extension = (profile.avatarFile.name.split('.').pop() || 'webp').replace(/[^a-z0-9]/gi, '').toLowerCase()
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`
    must(await supabase.storage.from('profile-avatars').upload(path, profile.avatarFile, { contentType: profile.avatarFile.type, upsert: false }))
    if (profile.avatarPath) await supabase.storage.from('profile-avatars').remove([profile.avatarPath])
    storedAvatar = `storage:${path}`
  } else if (!profile.avatar?.startsWith('blob:') && !profile.avatar?.startsWith('http') && profile.avatarPath) {
    await supabase.storage.from('profile-avatars').remove([profile.avatarPath])
    storedAvatar = profile.avatar
  }
  const row = must(await supabase.from('profiles').upsert({
    id: user.id, display_name: profile.name.trim(), avatar_url: storedAvatar,
    notifications: Boolean(profile.notifications), theme: profile.theme === 'pixel-day' ? 'pixel-day' : 'pixel-night',
  }).select().single())
  await logActivity(user, 'Profile updated', row.display_name)
  let avatar = row.avatar_url
  const avatarPath = avatar?.startsWith('storage:') ? avatar.slice(8) : null
  if (avatarPath) avatar = must(await supabase.storage.from('profile-avatars').createSignedUrl(avatarPath, 3600)).signedUrl
  return { ...profile, name: row.display_name, email: user.email || '', avatar, avatarPath, avatarFile: null }
}

export async function setCloudTrash(user, item, trashed) {
  const value = trashed ? new Date().toISOString() : null
  if (item.type === 'folder') {
    const folders = must(await supabase.from('folders').select('id,parent_id'))
    const descendantIds = new Set([item.id])
    let changed = true
    while (changed) {
      changed = false
      folders.forEach(folder => {
        if (folder.parent_id && descendantIds.has(folder.parent_id) && !descendantIds.has(folder.id)) { descendantIds.add(folder.id); changed = true }
      })
    }
    const ids = [...descendantIds]
    must(await supabase.from('files').update({ trashed_at: value }).in('folder_id', ids))
    must(await supabase.from('folders').update({ trashed_at: value }).in('id', ids))
  } else {
    must(await supabase.from('files').update({ trashed_at: value }).eq('id', item.id))
  }
  await logActivity(user, trashed ? 'Moved to trash' : 'Restored', item.name)
}

export async function setCloudStar(item, starred) {
  const table = item.type === 'folder' ? 'folders' : 'files'
  must(await supabase.from(table).update({ is_starred: starred }).eq('id', item.id))
}

export async function permanentlyDeleteCloudItem(user, item) {
  if (item.type !== 'folder') {
    if (item.storagePath) must(await supabase.storage.from('space-files').remove([item.storagePath]))
    must(await supabase.from('files').delete().eq('id', item.id))
  } else {
    const [folderResult, fileResult] = await Promise.all([
      supabase.from('folders').select('id,parent_id'),
      supabase.from('files').select('id,folder_id,storage_path'),
    ])
    const folders = must(folderResult)
    const descendantIds = new Set([item.id])
    let changed = true
    while (changed) {
      changed = false
      folders.forEach(folder => {
        if (folder.parent_id && descendantIds.has(folder.parent_id) && !descendantIds.has(folder.id)) { descendantIds.add(folder.id); changed = true }
      })
    }
    const paths = must(fileResult).filter(file => descendantIds.has(file.folder_id)).map(file => file.storage_path).filter(Boolean)
    for (let index = 0; index < paths.length; index += 100) must(await supabase.storage.from('space-files').remove(paths.slice(index, index + 100)))
    must(await supabase.from('folders').delete().eq('id', item.id))
  }
  await logActivity(user, 'Deleted permanently', item.name)
}

export async function deleteCloudAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { body: {} })
  if (error) throw error
}

export async function signedFileUrl(item, expiresIn = 300, download = false) {
  if (!item.storagePath) throw new Error('This item has no stored file.')
  const options = download ? { download: item.name } : undefined
  const data = must(await supabase.storage.from('space-files').createSignedUrl(item.storagePath, expiresIn, options))
  return data.signedUrl
}

async function logActivity(user, action, subject) {
  const { error } = await supabase.from('activity').insert({ user_id: user.id, action, subject })
  if (error) console.warn('Activity log failed:', error.message)
}
