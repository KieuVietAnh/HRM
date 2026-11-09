import { useCallback, useEffect, useMemo, useState } from 'react'
import { fbDelete, fbGet, fbPush, fbUpdate } from '../services/firebase'
import './CompanyDocuments.css'

export const COMPANY_DOCUMENT_CATEGORIES = [
  { id: 'business_license', label: 'Giấy phép ĐKKD', fullLabel: 'Giấy phép đăng ký kinh doanh', icon: 'fas fa-id-card' },
  { id: 'legal', label: 'Hồ sơ pháp lý', fullLabel: 'Hồ sơ pháp lý của công ty', icon: 'fas fa-balance-scale' },
  { id: 'tax', label: 'Hồ sơ thuế', fullLabel: 'Hồ sơ thuế', icon: 'fas fa-file-invoice-dollar' },
  { id: 'social_insurance', label: 'Hồ sơ BHXH', fullLabel: 'Hồ sơ BHXH', icon: 'fas fa-shield-alt' },
  { id: 'license', label: 'Giấy phép / Chứng nhận', fullLabel: 'Giấy phép, chứng nhận liên quan đến hoạt động kinh doanh', icon: 'fas fa-certificate' },
  { id: 'important', label: 'Văn bản quan trọng', fullLabel: 'Các văn bản, hồ sơ quan trọng khác của công ty', icon: 'fas fa-file-signature' },
  { id: 'other', label: 'Khác', fullLabel: 'Khác', icon: 'fas fa-folder' }
]

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024
const MAX_ATTACHMENTS = 5

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(reader.error || new Error('Không đọc được tệp'))
  reader.readAsDataURL(file)
})

const emptyForm = () => ({
  name: '',
  category: 'business_license',
  url: '',
  note: '',
  owner: '',
  attachments: [],
  issuedAt: '',
  expiresAt: ''
})

const categoryMeta = (id) =>
  COMPANY_DOCUMENT_CATEGORIES.find(item => item.id === id) || COMPANY_DOCUMENT_CATEGORIES[COMPANY_DOCUMENT_CATEGORIES.length - 1]

const categoryLabel = (id) => categoryMeta(id).fullLabel || categoryMeta(id).label

const formatDate = (value) => {
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '—'
  const [year, month, day] = text.split('-')
  return `${day}/${month}/${year}`
}

const expiryStatus = (expiresAt) => {
  const text = String(expiresAt || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(`${text}T00:00:00`)
  const diffDays = Math.round((expiry - today) / 86400000)
  if (diffDays < 0) return { key: 'expired', label: 'Đã hết hạn' }
  if (diffDays <= 30) return { key: 'soon', label: `Còn ${diffDays} ngày` }
  return { key: 'ok', label: 'Còn hiệu lực' }
}

function CompanyDocuments() {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [modalOpen, setModalOpen] = useState(false)

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fbGet('hr/companyDocuments')
      const list = data
        ? Object.entries(data).map(([id, value]) => ({ ...value, id }))
        : []
      list.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
      setDocuments(list)
    } catch (requestError) {
      console.error(requestError)
      setError(requestError.message || 'Không tải được hồ sơ giấy tờ công ty.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi')
    return documents.filter(doc => {
      if (filterCategory && doc.category !== filterCategory) return false
      if (!keyword) return true
      const haystack = `${doc.name || ''} ${doc.note || ''} ${doc.owner || ''} ${categoryLabel(doc.category)} ${doc.url || ''}`.toLocaleLowerCase('vi')
      return haystack.includes(keyword)
    })
  }, [documents, filterCategory, search])

  const groupedCounts = useMemo(() => {
    const counts = Object.fromEntries(COMPANY_DOCUMENT_CATEGORIES.map(item => [item.id, 0]))
    documents.forEach(doc => {
      const key = counts[doc.category] != null ? doc.category : 'other'
      counts[key] += 1
    })
    return counts
  }, [documents])

  const groupedDocs = useMemo(() => {
    const groups = COMPANY_DOCUMENT_CATEGORIES.map(item => ({
      ...item,
      items: filtered.filter(doc => (doc.category || 'other') === item.id)
    }))
    const known = new Set(COMPANY_DOCUMENT_CATEGORIES.map(item => item.id))
    const orphan = filtered.filter(doc => !known.has(doc.category))
    if (orphan.length) {
      const other = groups.find(item => item.id === 'other')
      if (other) other.items = [...other.items, ...orphan]
    }
    return groups.filter(group => group.items.length > 0)
  }, [filtered])

  const openCreate = (categoryId = '') => {
    setEditing(null)
    setForm({
      ...emptyForm(),
      category: categoryId || filterCategory || 'business_license'
    })
    setModalOpen(true)
  }

  const openEdit = (doc) => {
    setEditing(doc)
    setForm({
      name: doc.name || '',
      category: doc.category || 'other',
      url: doc.url || '',
      note: doc.note || '',
      owner: doc.owner || '',
      attachments: Array.isArray(doc.attachments) ? doc.attachments : [],
      issuedAt: doc.issuedAt || '',
      expiresAt: doc.expiresAt || ''
    })
    setModalOpen(true)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) {
      alert('Vui lòng nhập tên giấy tờ / hồ sơ.')
      return
    }
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const payload = {
        name: form.name.trim(),
        category: form.category || 'other',
        url: form.url.trim(),
        note: form.note.trim(),
        owner: form.owner.trim(),
        attachments: form.attachments,
        issuedAt: form.issuedAt || '',
        expiresAt: form.expiresAt || '',
        updatedAt: now
      }
      if (editing?.id) {
        await fbUpdate(`hr/companyDocuments/${editing.id}`, payload)
      } else {
        await fbPush('hr/companyDocuments', { ...payload, createdAt: now })
      }
      setModalOpen(false)
      setEditing(null)
      setForm(emptyForm())
      await loadDocuments()
    } catch (requestError) {
      alert('Lỗi lưu hồ sơ: ' + (requestError.message || requestError))
    } finally {
      setSaving(false)
    }
  }

  const handleAttachFiles = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    const room = MAX_ATTACHMENTS - form.attachments.length
    if (files.length > room) {
      alert(`Mỗi hồ sơ tối đa ${MAX_ATTACHMENTS} tệp đính kèm.`)
      return
    }
    const tooBig = files.find(file => file.size > MAX_ATTACHMENT_BYTES)
    if (tooBig) {
      alert(`Tệp “${tooBig.name}” vượt quá 2MB. Hãy dùng link Drive cho tệp lớn.`)
      return
    }
    try {
      const added = await Promise.all(files.map(async file => ({
        name: file.name,
        type: file.type || '',
        size: file.size,
        data: await readFileAsDataUrl(file)
      })))
      setForm(current => ({ ...current, attachments: [...current.attachments, ...added] }))
    } catch (readError) {
      alert('Không đọc được tệp: ' + (readError.message || readError))
    }
  }

  const removeAttachment = (index) => {
    setForm(current => ({
      ...current,
      attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index)
    }))
  }

  const handleDelete = async (doc) => {
    if (!doc?.id) return
    if (!confirm(`Xóa hồ sơ “${doc.name}”?`)) return
    try {
      await fbDelete(`hr/companyDocuments/${doc.id}`)
      await loadDocuments()
    } catch (requestError) {
      alert('Không xóa được: ' + (requestError.message || requestError))
    }
  }

  return (
    <div className="company-docs-page">
      <header className="company-docs-header">
        <div>
          <h1>Giấy tờ công ty</h1>
          <p>Lưu trữ và phân loại hồ sơ pháp lý để HR/Admin tra cứu tập trung.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
          <i className="fas fa-plus"></i> Thêm hồ sơ
        </button>
      </header>

      <section className="company-docs-stats" aria-label="Phân loại hồ sơ">
        <button
          type="button"
          className={`company-docs-stat ${!filterCategory ? 'is-active' : ''}`}
          onClick={() => setFilterCategory('')}
        >
          <span className="company-docs-stat__icon" aria-hidden="true">
            <i className="fas fa-layer-group"></i>
          </span>
          <span className="company-docs-stat__body">
            <span className="company-docs-stat__label">Tất cả</span>
            <strong>{documents.length}</strong>
          </span>
        </button>
        {COMPANY_DOCUMENT_CATEGORIES.map(item => (
          <button
            key={item.id}
            type="button"
            className={`company-docs-stat ${filterCategory === item.id ? 'is-active' : ''}`}
            onClick={() => setFilterCategory(current => current === item.id ? '' : item.id)}
            title={item.fullLabel}
          >
            <span className="company-docs-stat__icon" aria-hidden="true">
              <i className={item.icon}></i>
            </span>
            <span className="company-docs-stat__body">
              <span className="company-docs-stat__label">{item.label}</span>
              <strong>{groupedCounts[item.id] || 0}</strong>
            </span>
          </button>
        ))}
      </section>

      <section className="company-docs-panel">
        <div className="company-docs-toolbar">
          <label className="company-docs-search">
            <i className="fas fa-search" aria-hidden="true"></i>
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Tìm theo tên, ghi chú, link..."
            />
          </label>
          <div className="company-docs-toolbar__meta">
            {filterCategory
              ? categoryMeta(filterCategory).fullLabel
              : 'Tất cả nhóm'}
            {' · '}
            {filtered.length} hồ sơ
          </div>
        </div>

        {loading ? (
          <div className="company-docs-state">
            <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
            <p>Đang tải hồ sơ...</p>
          </div>
        ) : error ? (
          <div className="company-docs-state is-error">
            <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
            <p>{error}</p>
            <button type="button" className="btn" onClick={loadDocuments}>Thử lại</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="company-docs-state">
            <div className="company-docs-state__icon" aria-hidden="true">
              <i className="fas fa-folder-open"></i>
            </div>
            <h2>Chưa có hồ sơ{filterCategory || search ? ' khớp bộ lọc' : ''}</h2>
            <p>
              {filterCategory || search
                ? 'Thử đổi nhóm hoặc từ khóa tìm kiếm.'
                : 'Thêm giấy phép ĐKKD, hồ sơ pháp lý, thuế, BHXH để HR/Admin tra cứu nhanh.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
              <i className="fas fa-plus"></i> Thêm hồ sơ đầu tiên
            </button>
          </div>
        ) : (
          <div className="company-docs-groups">
            {groupedDocs.map(group => (
              <section key={group.id} className="company-docs-group">
                <div className="company-docs-group__head">
                  <div>
                    <i className={group.icon} aria-hidden="true"></i>
                    <h2>{group.fullLabel}</h2>
                  </div>
                  <div className="company-docs-group__actions">
                    <span>{group.items.length} hồ sơ</span>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => openCreate(group.id)}
                    >
                      <i className="fas fa-plus"></i> Thêm
                    </button>
                  </div>
                </div>
                <div className="company-docs-table-wrap">
                  <table className="company-docs-table">
                    <thead>
                      <tr>
                        <th>Tên tài liệu</th>
                        <th>Người phụ trách</th>
                        <th>Ngày cấp</th>
                        <th>Hết hạn</th>
                        <th>Trạng thái</th>
                        <th>Link / Tệp đính kèm</th>
                        <th>Ghi chú</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map(doc => {
                        const status = expiryStatus(doc.expiresAt)
                        return (
                          <tr key={doc.id}>
                            <td>
                              <strong className="company-docs-name">{doc.name}</strong>
                            </td>
                            <td>{doc.owner || <span className="company-docs-muted">—</span>}</td>
                            <td>{formatDate(doc.issuedAt)}</td>
                            <td>{formatDate(doc.expiresAt)}</td>
                            <td>
                              {status ? (
                                <span className={`company-docs-badge is-${status.key}`}>{status.label}</span>
                              ) : (
                                <span className="company-docs-muted">—</span>
                              )}
                            </td>
                            <td>
                              {doc.url || (doc.attachments || []).length ? (
                                <div className="company-docs-files">
                                  {doc.url && (
                                    <a className="company-docs-link" href={doc.url} target="_blank" rel="noreferrer">
                                      <i className="fas fa-external-link-alt" aria-hidden="true"></i> Mở link
                                    </a>
                                  )}
                                  {(doc.attachments || []).map((file, fileIndex) => (
                                    <a
                                      key={`${file.name}-${fileIndex}`}
                                      className="company-docs-link"
                                      href={file.data}
                                      download={file.name}
                                      title={file.name}
                                    >
                                      <i className="fas fa-paperclip" aria-hidden="true"></i> {file.name}
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <span className="company-docs-muted">—</span>
                              )}
                            </td>
                            <td>
                              <span className="company-docs-note">{doc.note || '—'}</span>
                            </td>
                            <td>
                              <div className="company-docs-row-actions">
                                <button type="button" className="edit" title="Sửa" onClick={() => openEdit(doc)}>
                                  <i className="fas fa-edit"></i>
                                </button>
                                <button type="button" className="delete" title="Xóa" onClick={() => handleDelete(doc)}>
                                  <i className="fas fa-trash"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="modal show" onClick={() => !saving && setModalOpen(false)}>
          <div className="modal-content company-docs-modal" onClick={event => event.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-folder-plus" aria-hidden="true"></i>
                {editing ? 'Sửa hồ sơ giấy tờ' : 'Thêm hồ sơ giấy tờ'}
              </h3>
              <button type="button" className="modal-close" onClick={() => !saving && setModalOpen(false)}>&times;</button>
            </div>
            <form className="modal-body" onSubmit={handleSave}>
              <div className="form-group">
                <label>Tên tài liệu *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
                  placeholder="VD: Giấy phép ĐKKD SpeeGo"
                  required
                />
              </div>
              <div className="form-group">
                <label>Loại hồ sơ</label>
                <select
                  value={form.category}
                  onChange={event => setForm(current => ({ ...current, category: event.target.value }))}
                >
                  {COMPANY_DOCUMENT_CATEGORIES.map(item => (
                    <option key={item.id} value={item.id}>{item.fullLabel}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Ngày cấp</label>
                  <input
                    type="date"
                    value={form.issuedAt}
                    onChange={event => setForm(current => ({ ...current, issuedAt: event.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Ngày hết hạn</label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={event => setForm(current => ({ ...current, expiresAt: event.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Người phụ trách</label>
                <input
                  type="text"
                  value={form.owner}
                  onChange={event => setForm(current => ({ ...current, owner: event.target.value }))}
                  placeholder="VD: Nguyễn Văn A (HR)"
                />
              </div>
              <div className="form-group">
                <label>Tệp đính kèm (tối đa {MAX_ATTACHMENTS} tệp, mỗi tệp ≤ 2MB)</label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={handleAttachFiles}
                  disabled={form.attachments.length >= MAX_ATTACHMENTS}
                />
                {form.attachments.length > 0 && (
                  <ul className="company-docs-attachments">
                    {form.attachments.map((file, index) => (
                      <li key={`${file.name}-${index}`}>
                        <i className="fas fa-paperclip" aria-hidden="true"></i> {file.name}
                        <button type="button" onClick={() => removeAttachment(index)} aria-label={`Xóa ${file.name}`}>&times;</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="form-group">
                <label>Link tài liệu (Drive / file lớn)</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={event => setForm(current => ({ ...current, url: event.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div className="form-group">
                <label>Ghi chú</label>
                <textarea
                  rows={3}
                  value={form.note}
                  onChange={event => setForm(current => ({ ...current, note: event.target.value }))}
                  placeholder="Ghi chú nội bộ..."
                />
              </div>
              <div className="company-docs-modal__actions">
                <button type="button" className="btn" onClick={() => setModalOpen(false)} disabled={saving}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu hồ sơ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CompanyDocuments
