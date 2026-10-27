import React, { useState, useRef } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import {
  X, Upload, Calendar, Download, CheckCircle2,
  AlertTriangle, ArrowRight, FileText, } from 'lucide-react';
import { Subject } from '../../types';

interface ImportTimetableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedTimetableRow {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  day_of_week: string;
  schedule_time: string;
  room: string;
  semester: number;
  division: string;
  isValid: boolean;
  error?: string;
}

export const ImportTimetableModal: React.FC<ImportTimetableModalProps> = ({ isOpen, onClose }) => {
  const { currentFaculty, subjects, bulkImportClasses } = useAttendance();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedTimetableRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number } | null>(null);

  if (!isOpen || !currentFaculty) return null;

  const handleDownloadSample = () => {
    const csvContent =
      'Subject Code,Subject Name,Day,Time,Room,Semester,Division\n' +
      'CS301,Database Management Systems,Monday,10:00 AM - 11:00 AM,Room 402,3,A\n' +
      'CS301,Database Management Systems,Wednesday,11:15 AM - 12:15 PM,Lab 2,3,A\n' +
      'CS302,Operating Systems,Tuesday,09:00 AM - 10:00 AM,Room 405,3,A\n' +
      'CS304,Theory of Computation,Thursday,02:15 PM - 03:15 PM,Room 301,3,A\n' +
      'CS305,Python Programming,Friday,01:00 PM - 02:00 PM,Lab 1,3,A\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'faculty_timetable_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processFile = (file: File) => {
    setParseError(null);
    setImportResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Loaded on demand so the spreadsheet parser isn't in the main bundle.
        const XLSX = await import('xlsx');
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawRows || rawRows.length === 0) {
          setParseError('The uploaded file contains no data rows.');
          setParsedRows([]);
          return;
        }

        const normalized: ParsedTimetableRow[] = rawRows.map((row) => {
          const keys = Object.keys(row);
          const getVal = (patterns: string[]) => {
            for (const key of keys) {
              const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
              for (const p of patterns) {
                if (cleanKey === p.toLowerCase().replace(/[^a-z0-9]/g, '')) {
                  return String(row[key] || '').trim();
                }
              }
            }
            return '';
          };

          const subjectCodeInput = getVal(['subjectcode', 'code', 'coursecode', 'subcode']);
          const subjectNameInput = getVal(['subjectname', 'subject', 'course', 'coursename']);
          const day = getVal(['day', 'dayofweek', 'weekday']) || 'Monday';
          const time = getVal(['time', 'scheduletime', 'timing', 'slot', 'timeslot']) || '10:00 AM - 11:00 AM';
          const room = getVal(['room', 'venue', 'classroom', 'lab']) || 'Room 402';
          const semStr = getVal(['semester', 'sem']);
          const divStr = getVal(['division', 'div', 'section']) || 'A';

          const sem = parseInt(semStr, 10) || 3;
          const division = divStr.toUpperCase();

          // Resolve Subject by Code or Name
          let matchedSubject = subjects.find(
            (s) =>
              (subjectCodeInput && s.code.toLowerCase() === subjectCodeInput.toLowerCase()) ||
              (subjectNameInput && s.name.toLowerCase() === subjectNameInput.toLowerCase())
          );

          // Partial fallback
          if (!matchedSubject && (subjectCodeInput || subjectNameInput)) {
            const query = (subjectCodeInput || subjectNameInput).toLowerCase();
            matchedSubject = subjects.find(
              (s) => s.name.toLowerCase().includes(query) || s.code.toLowerCase().includes(query)
            );
          }

          if (!matchedSubject) {
            // Default to first subject if completely unmapped
            matchedSubject = subjects[0];
          }

          const isValid = !!matchedSubject && !!time && !!room;
          const error = !matchedSubject
            ? 'Unknown Subject'
            : !time
            ? 'Missing Lecture Timing'
            : !room
            ? 'Missing Classroom Room'
            : undefined;

          return {
            subject_id: matchedSubject?.id || subjects[0]?.id || 'sub-dbms',
            subject_name: matchedSubject?.name || subjectNameInput || 'General Lecture',
            subject_code: matchedSubject?.code || subjectCodeInput || 'GEN101',
            day_of_week: day,
            schedule_time: time,
            room,
            semester: sem,
            division,
            isValid,
            error,
          };
        });

        setParsedRows(normalized);
      } catch (err: any) {
        setParseError(`Failed to parse file: ${err.message || 'Invalid format'}`);
        setParsedRows([]);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    const classesToImport = validRows.map((r) => ({
      subject_id: r.subject_id,
      faculty_id: currentFaculty.id,
      semester: r.semester,
      division: r.division,
      room: r.room,
      day_of_week: r.day_of_week,
      schedule_time: r.schedule_time,
    }));

    try {
      setImportResult(await bulkImportClasses(currentFaculty.id, classesToImport, replaceExisting));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 640 }}
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
              <Calendar size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)' }}>
                Import Timetable from CSV / Excel
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                Upload your semester teaching schedule and lecture slots
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Success Alert */}
        {importResult ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 'var(--r-full)',
                background: 'var(--green-50)',
                color: 'var(--green-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
              }}
            >
              <CheckCircle2 size={32} />
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--gray-900)' }}>
              Timetable Imported Successfully!
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginTop: 6, lineHeight: 1.5 }}>
              Loaded <strong>{importResult.count} lecture slots</strong> into your timetable schedule.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setImportResult(null);
                  setParsedRows([]);
                  setFileName('');
                }}
              >
                Upload Another File
              </button>
              <button className="btn btn-primary" onClick={onClose}>
                Done & View Timetable
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Template action row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                background: 'var(--gray-50)',
                border: '1px solid var(--gray-200)',
                borderRadius: 'var(--r-md)',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
                <FileText size={15} color="var(--blue-600)" />
                <span>Need the timetable spreadsheet format?</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={handleDownloadSample}
              >
                <Download size={12} /> Download Template (.csv)
              </button>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? 'var(--blue-500)' : 'var(--gray-300)'}`,
                borderRadius: 'var(--r-lg)',
                padding: '2rem 1.5rem',
                textAlign: 'center',
                background: isDragging ? 'var(--blue-50)' : 'var(--white)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                marginBottom: '1rem',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .xlsx, .xls, .tsv, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--r-full)',
                  background: 'var(--blue-50)',
                  color: 'var(--blue-600)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 0.75rem',
                }}
              >
                <Upload size={22} />
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--gray-800)' }}>
                {fileName ? fileName : 'Choose timetable spreadsheet or drag & drop here'}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 4 }}>
                Supports CSV or Excel (.xlsx, .xls) files
              </p>
            </div>

            {/* Parse Error */}
            {parseError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span>{parseError}</span>
              </div>
            )}

            {/* Parsed Preview Table */}
            {parsedRows.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--gray-800)' }}>
                    Preview: {validCount} valid / {parsedRows.length} slots detected
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setParsedRows([]);
                      setFileName('');
                    }}
                  >
                    Clear & Re-upload
                  </button>
                </div>

                <div className="table-scroll" style={{ maxHeight: 220 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Day</th>
                        <th>Timing</th>
                        <th>Room</th>
                        <th>Batch</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>
                            {row.subject_name}
                            <span style={{ fontSize: '0.6875rem', color: 'var(--gray-400)', marginLeft: 4 }}>
                              ({row.subject_code})
                            </span>
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--blue-600)' }}>{row.day_of_week}</td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>{row.schedule_time}</td>
                          <td>{row.room}</td>
                          <td style={{ fontSize: '0.75rem' }}>Sem {row.semester} ({row.division})</td>
                          <td>
                            {row.isValid ? (
                              <span style={{ fontSize: '0.6875rem', color: 'var(--green-600)', fontWeight: 700 }}>
                                ✓ Ready
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.6875rem', color: 'var(--red-600)', fontWeight: 700 }}>
                                ⚠ {row.error}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Import options */}
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--gray-700)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={(e) => setReplaceExisting(e.target.checked)}
                    />
                    Replace my existing classes instead of appending
                  </label>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', paddingTop: '0.875rem', borderTop: '1px solid var(--gray-200)' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={validCount === 0}
                onClick={handleConfirmImport}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span>Confirm &amp; Import Timetable {validCount > 0 ? `(${validCount})` : ''}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
