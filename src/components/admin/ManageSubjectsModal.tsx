import React, { useState } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { Subject } from '../../types';
import { X, BookOpen, Plus, Edit2, Trash2, Check, AlertCircle, Sparkles } from 'lucide-react';

interface ManageSubjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

export const ManageSubjectsModal: React.FC<ManageSubjectsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { subjects, departments, classes, addSubject, updateSubject, removeSubject } = useAttendance();

  const [selectedSemesterFilter, setSelectedSemesterFilter] = useState<string>('ALL');
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [credits, setCredits] = useState(4);
  const [departmentId, setDepartmentId] = useState('dept-ce');
  const [semester, setSemester] = useState(3);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const startEdit = (subj: Subject) => {
    setEditingSubject(subj);
    setIsAddingNew(false);
    setName(subj.name);
    setCode(subj.code);
    setCredits(subj.credits);
    setDepartmentId(subj.department_id);
    setSemester(subj.semester || 3);
    setFormError(null);
  };

  const startAddNew = () => {
    setEditingSubject(null);
    setIsAddingNew(true);
    setName('');
    setCode('');
    setCredits(4);
    setDepartmentId('dept-ce');
    setSemester(selectedSemesterFilter !== 'ALL' ? Number(selectedSemesterFilter) : 3);
    setFormError(null);
  };

  const cancelForm = () => {
    setEditingSubject(null);
    setIsAddingNew(false);
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanName) {
      setFormError('Please enter subject title.');
      return;
    }
    if (!cleanCode) {
      setFormError('Please enter subject code.');
      return;
    }

    if (editingSubject) {
      await updateSubject(editingSubject.id, {
        name: cleanName,
        code: cleanCode,
        credits: Number(credits),
        department_id: departmentId,
        semester: Number(semester),
      });
      onSuccess?.(`Subject "${cleanName}" updated successfully.`);
      setEditingSubject(null);
    } else if (isAddingNew) {
      await addSubject({
        name: cleanName,
        code: cleanCode,
        credits: Number(credits),
        department_id: departmentId,
        semester: Number(semester),
      });
      onSuccess?.(`New subject "${cleanName}" added to curriculum.`);
      setIsAddingNew(false);
    }
  };

  const handleDelete = async (subj: Subject) => {
    const classCount = classes.filter((c) => c.subject_id === subj.id).length;
    let message = `Are you sure you want to remove ${subj.name} (${subj.code}) from the curriculum?`;
    if (classCount > 0) {
      message += `\n\nWarning: There are currently ${classCount} class slot(s) scheduled for this subject.`;
    }
    if (window.confirm(message)) {
      await removeSubject(subj.id);
      onSuccess?.(`Subject ${subj.name} removed.`);
      if (editingSubject?.id === subj.id) {
        cancelForm();
      }
    }
  };

  const filteredSubjects = subjects.filter((s) => {
    if (selectedSemesterFilter === 'ALL') return true;
    return String(s.semester || 3) === selectedSemesterFilter;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 720 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--r-md)',
                background: 'var(--blue-50)',
                color: 'var(--blue-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BookOpen size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)' }}>
                Curriculum &amp; Subject Management
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                Manage academic courses, credits, and semester allotments
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.875rem', background: 'var(--gray-50)', borderRadius: 'var(--r-md)', border: '1px solid var(--gray-200)', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--gray-700)' }}>Filter Semester:</span>
            <select
              className="form-select form-select-sm"
              value={selectedSemesterFilter}
              onChange={(e) => setSelectedSemesterFilter(e.target.value)}
              style={{ width: 'auto' }}
            >
              <option value="ALL">All Semesters ({subjects.length})</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                <option key={sem} value={String(sem)}>Semester {sem}</option>
              ))}
            </select>
          </div>

          {!isAddingNew && !editingSubject && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={startAddNew}
            >
              <Plus size={13} /> Add New Subject
            </button>
          )}
        </div>

        {/* Add/Edit Form if active */}
        {(isAddingNew || editingSubject) && (
          <form
            onSubmit={handleSave}
            style={{
              padding: '1rem',
              background: 'var(--blue-50)',
              border: '1px solid var(--blue-200)',
              borderRadius: 'var(--r-md)',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontWeight: 700, fontSize: '0.875rem', color: 'var(--blue-900)' }}>
                <Sparkles size={14} color="var(--blue-600)" />
                <span>{editingSubject ? `Edit Subject: ${editingSubject.code}` : 'Add New Subject'}</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={cancelForm}
              >
                Cancel
              </button>
            </div>

            {formError && (
              <div className="alert alert-danger" style={{ padding: '0.5rem 0.75rem', marginBottom: '0.75rem' }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid-2" style={{ gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Subject Title *</label>
                <input
                  type="text"
                  className="form-input form-input-sm"
                  placeholder="e.g. Distributed Systems"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Subject Code *</label>
                <input
                  type="text"
                  className="form-input form-input-sm"
                  placeholder="e.g. CS601"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
                  required
                />
              </div>
            </div>

            <div className="grid-2" style={{ gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Curriculum Semester</label>
                <select
                  className="form-select form-select-sm"
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>Semester {s}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Credits</label>
                <select
                  className="form-select form-select-sm"
                  value={credits}
                  onChange={(e) => setCredits(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map((c) => (
                    <option key={c} value={c}>{c} Credits</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cancelForm}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                <Check size={13} /> {editingSubject ? 'Save Changes' : 'Add Subject'}
              </button>
            </div>
          </form>
        )}

        {/* Subjects Table */}
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Subject Name</th>
                <th>Semester</th>
                <th>Credits</th>
                <th>Active Slots</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubjects.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--gray-400)' }}>
                    No subjects found for this filter.
                  </td>
                </tr>
              ) : (
                filteredSubjects.map((subj) => {
                  const classCount = classes.filter((c) => c.subject_id === subj.id).length;
                  const isSelected = editingSubject?.id === subj.id;
                  return (
                    <tr
                      key={subj.id}
                      style={{ background: isSelected ? 'var(--blue-50)' : undefined }}
                    >
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{subj.code}</td>
                      <td style={{ fontWeight: 600 }}>{subj.name}</td>
                      <td>
                        <span className="badge badge-neutral">Sem {subj.semester || 3}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{subj.credits} cr.</td>
                      <td style={{ color: 'var(--gray-500)', fontSize: '0.8125rem' }}>
                        {classCount} slot{classCount === 1 ? '' : 's'}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          title="Edit Subject"
                          style={{ color: 'var(--blue-600)', marginRight: 4 }}
                          onClick={() => startEdit(subj)}
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          title="Delete Subject"
                          style={{ color: 'var(--red-600)' }}
                          onClick={() => handleDelete(subj)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid var(--gray-200)', marginTop: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
            Total {subjects.length} subjects configured
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
