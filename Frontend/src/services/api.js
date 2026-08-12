import { API_BASE } from '../data/printers'

async function request(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`
  const response = await fetch(fullUrl, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`)
  }
  return data
}

export const api = {
  // Printers
  scanPrinters: () => request('/printers'),
  getPrinterStatus: (ip) => request(`/printer/${ip}`),
  getPrinterFiles: (ip) => request(`/printer/${ip}/files`),
  uploadPrinterFile: (ip, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return request(`/printer/${ip}/files`, {
      method: 'POST',
      body: formData,
    })
  },
  startPrinterPrint: (ip, path) =>
    request(`/printer/${ip}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }),
  pausePrinter: (ip) =>
    request(`/printer/${ip}/pause`, {
      method: 'POST',
    }),
  resumePrinter: (ip) =>
    request(`/printer/${ip}/resume`, {
      method: 'POST',
    }),
  stopPrinter: (ip) =>
    request(`/printer/${ip}/stop`, {
      method: 'POST',
    }),

  // G-Code Local Storage
  listGCodeFolders: () => request('/gcode/folders'),
  createGCodeFolder: (name) =>
    request('/gcode/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  listGCodeFiles: (folder, size) => {
    const params = new URLSearchParams()
    if (folder) params.set('folder', folder)
    if (size) params.set('size', size)
    const queryString = params.toString()
    return request(`/gcode/files${queryString ? `?${queryString}` : ''}`)
  },
  uploadGCodeFile: (folder, size, file) => {
    const formData = new FormData()
    formData.append('folder', folder)
    formData.append('size', size)
    formData.append('file', file)
    return request('/gcode/files', {
      method: 'POST',
      body: formData,
    })
  },
  deleteGCodeFile: (id) =>
    request(`/gcode/files/${id}`, {
      method: 'DELETE',
    }),
  getGCodeDownloadUrl: (id) => `${API_BASE}/gcode/files/${id}`,

  // Print Queue
  getPrintQueue: (status, printerIp) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (printerIp) params.set('printer_ip', printerIp)
    const queryString = params.toString()
    return request(`/queue${queryString ? `?${queryString}` : ''}`)
  },
  getPrintersQueueStatus: () => request('/queue/printers'),
  schedulePrintQueue: (jobs) =>
    request('/queue/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs }),
    }),
  updateQueueItem: (id, updates) =>
    request(`/queue/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }),
  dispatchQueueItem: (id) =>
    request(`/queue/items/${id}/dispatch`, {
      method: 'POST',
    }),
  deleteQueueItem: (id) =>
    request(`/queue/items/${id}`, {
      method: 'DELETE',
    }),
}
